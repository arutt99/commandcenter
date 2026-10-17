import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { z } from 'zod';
import { localPaths } from './paths';
import { withStoreLock } from './queue';
import { SCHEMA_VERSION } from '../db/migrate';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  format: z.literal(1),
  schema: z.literal(SCHEMA_VERSION),
  createdAt: z.iso.datetime(),
  kind: z.enum(['automatic', 'manual', 'pre-restore']),
  databaseSha256: digest,
  originals: z.array(z.object({ key: z.uuid(), sha256: digest })),
});
type BackupManifest = z.infer<typeof manifestSchema>;
async function hash(file: string) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function regularFile(file: string) {
  if (!(await lstat(file)).isFile())
    throw new Error('Backup contains a non-regular file.');
}
async function checkDatabase(file: string) {
  await regularFile(file);
  const client = createClient({ url: pathToFileURL(file).href });
  try {
    await client.execute('PRAGMA query_only = ON');
    const integrity = await client.execute('PRAGMA integrity_check');
    if (
      integrity.rows.length !== 1 ||
      integrity.rows[0].integrity_check !== 'ok'
    )
      throw new Error('Backup database failed its integrity check.');
    if ((await client.execute('PRAGMA foreign_key_check')).rows.length)
      throw new Error('Backup database has invalid references.');
    const versions = await client.execute(
      'SELECT version FROM schema_migrations',
    );
    if (
      versions.rows.length !== 1 ||
      versions.rows[0].version !== SCHEMA_VERSION
    )
      throw new Error('Backup database version does not match this app.');
    // Verify the application tables, not just an arbitrary SQLite file.
    for (const table of [
      'clients',
      'client_settings',
      'imports',
      'meta_rows',
      'indeed_rows',
      'candidate_rows',
      'audit_log',
    ])
      await client.execute(`SELECT * FROM ${table} LIMIT 0`);
    return (
      await client.execute('SELECT storage_path, sha256 FROM imports')
    ).rows.map((row) => ({
      key: String(row.storage_path),
      sha256: String(row.sha256),
    }));
  } finally {
    client.close();
  }
}
export async function listBackups(root = localPaths().root) {
  const directory = localPaths(root).backups;
  const result: { name: string; manifest: BackupManifest }[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  )) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const manifest = manifestSchema.parse(
        JSON.parse(
          await readFile(
            path.join(directory, entry.name, 'manifest.json'),
            'utf8',
          ),
        ),
      );
      result.push({ name: entry.name, manifest });
    } catch {
      /* An incomplete/unrecognized folder is not an advertised backup. */
    }
  }
  return result.sort((a, b) => b.name.localeCompare(a.name));
}
export async function createBackup(
  root = localPaths().root,
  kind: BackupManifest['kind'] = 'manual',
) {
  return withStoreLock(async () => {
    const paths = localPaths(root);
    await regularFile(paths.database);
    await mkdir(paths.backups, { recursive: true, mode: 0o700 });
    const date = new Date().toISOString();
    const name = `${date.replaceAll(':', '-')}--${kind}--${randomUUID().slice(0, 8)}`;
    const temporary = path.join(paths.backups, `.${name}.tmp`),
      target = path.join(paths.backups, name);
    await mkdir(path.join(temporary, 'originals'), {
      recursive: true,
      mode: 0o700,
    });
    try {
      const snapshot = path.join(temporary, 'command-center.sqlite');
      const client = createClient({ url: pathToFileURL(paths.database).href });
      try {
        await client.execute({ sql: 'VACUUM INTO ?', args: [snapshot] });
      } finally {
        client.close();
      }
      await chmod(snapshot, 0o600);
      const originals = z
        .array(z.object({ key: z.uuid(), sha256: digest }))
        .parse(await checkDatabase(snapshot));
      for (const original of originals) {
        const source = path.join(paths.originals, original.key),
          destination = path.join(temporary, 'originals', original.key);
        await regularFile(source);
        await copyFile(source, destination);
        await chmod(destination, 0o600);
        if ((await hash(destination)) !== original.sha256)
          throw new Error(
            'An original file is missing or damaged. Backup was not completed.',
          );
      }
      const manifest: BackupManifest = {
        format: 1,
        schema: SCHEMA_VERSION,
        createdAt: date,
        kind,
        databaseSha256: await hash(snapshot),
        originals,
      };
      await writeFile(
        path.join(temporary, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        { mode: 0o600 },
      );
      await rename(temporary, target);
      return target;
    } catch (error) {
      await rm(temporary, { recursive: true, force: true });
      throw error;
    }
  });
}
export async function dailyBackup(root = localPaths().root) {
  const backups = await listBackups(root),
    today = new Date().toISOString().slice(0, 10);
  if (
    !backups.some(
      (b) =>
        b.manifest.kind === 'automatic' &&
        b.manifest.createdAt.startsWith(today),
    )
  )
    await createBackup(root, 'automatic');
  // Manual and pre-restore backups are never pruned automatically.
  const automatic = (await listBackups(root)).filter(
    (b) => b.manifest.kind === 'automatic',
  );
  for (const backup of automatic.slice(7))
    await rm(path.join(localPaths(root).backups, backup.name), {
      recursive: true,
    });
}
export async function verifyBackup(directory: string) {
  if (!(await lstat(directory)).isDirectory())
    throw new Error('Choose a backup folder.');
  await regularFile(path.join(directory, 'manifest.json'));
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')),
  );
  const database = path.join(directory, 'command-center.sqlite');
  if ((await hash(database)) !== manifest.databaseSha256)
    throw new Error('Backup database checksum does not match.');
  const originals = await checkDatabase(database);
  if (
    new Set(manifest.originals.map((file) => file.key)).size !==
      manifest.originals.length ||
    JSON.stringify(
      [...originals].sort((a, b) => a.key.localeCompare(b.key)),
    ) !==
      JSON.stringify(
        [...manifest.originals].sort((a, b) => a.key.localeCompare(b.key)),
      )
  )
    throw new Error('Backup manifest does not match its original files.');
  for (const original of manifest.originals) {
    const file = path.join(directory, 'originals', original.key);
    await regularFile(file);
    if ((await hash(file)) !== original.sha256)
      throw new Error('Backup original checksum does not match.');
  }
  return manifest;
}
// Call only while holding acquireInstance(root); the app must be stopped.
export async function restoreBackup(
  directory: string,
  root = localPaths().root,
) {
  const source = path.resolve(directory),
    paths = localPaths(root);
  const manifest = await verifyBackup(source);
  const temporary = path.join(paths.root, `.restore-${randomUUID()}`),
    old = path.join(paths.root, `.previous-${randomUUID()}`);
  await mkdir(path.join(temporary, 'originals'), {
    recursive: true,
    mode: 0o700,
  });
  try {
    await copyFile(
      path.join(source, 'command-center.sqlite'),
      path.join(temporary, 'command-center.sqlite'),
    );
    await chmod(path.join(temporary, 'command-center.sqlite'), 0o600);
    for (const original of manifest.originals) {
      const dest = path.join(temporary, 'originals', original.key);
      await copyFile(path.join(source, 'originals', original.key), dest);
      await chmod(dest, 0o600);
    }
    // Validate the staged bytes before touching the current store.
    if (
      (await hash(path.join(temporary, 'command-center.sqlite'))) !==
      manifest.databaseSha256
    )
      throw new Error('Backup changed during restore.');
    for (const original of manifest.originals)
      if (
        (await hash(path.join(temporary, 'originals', original.key))) !==
        original.sha256
      )
        throw new Error('Backup changed during restore.');
    const exists = await lstat(paths.store).then(
      () => true,
      () => false,
    );
    if (exists) {
      // A corrupt current store must not prevent recovery from a verified backup.
      // Preserve its entire directory below even if a validated pre-restore backup fails.
      await createBackup(root, 'pre-restore').catch(() => undefined);
      await rename(paths.store, old);
    }
    try {
      await rename(temporary, paths.store);
    } catch (error) {
      if (exists) await rename(old, paths.store);
      throw error;
    }
    // Keep the previous complete store (including WAL files) for recovery.
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
