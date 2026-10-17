import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase } from '../src/server/db/connection';
import { clients } from '../src/server/db/schema';
import {
  createBackup,
  dailyBackup,
  listBackups,
  restoreBackup,
  verifyBackup,
} from '../src/server/local/backups';
import { acquireInstance } from '../src/server/local/instance';
import { LOCAL_OWNER } from '../src/server/local/owner';
import { ImportService } from '../src/server/imports/service';
import { storage } from '../src/server/imports/storage';
import { metaCSV } from '../scripts/fixtures';
import { ReportingService } from '../src/server/reporting/service';
import { metaMetrics } from '../src/server/reporting/metrics';

let root: string, opened: Awaited<ReturnType<typeof openDatabase>>;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'wayfind-backup-test-'));
  opened = await openDatabase(root);
});
afterEach(async () => {
  opened?.close();
  await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const [client] = await opened.db
    .insert(clients)
    .values({ name: 'Backup Fixture', slug: 'backup-fixture' })
    .returning();
  const service = new ImportService({
    db: opened.db,
    files: storage(opened.paths.originals),
  });
  const item = await service.preview(
    LOCAL_OWNER,
    client.id,
    'meta.csv',
    Buffer.from(metaCSV()),
  );
  await service.confirm(LOCAL_OWNER, client.id, item.id, {
    confirmed: true,
    expectedActiveId: '',
    periodStart: '2026-04-01',
    periodEnd: '2026-06-09',
  });
  return { client, service, item };
}
it('restores clients, precise totals and original bytes from a verified backup and preserves current data', async () => {
  const { item } = await fixture();
  const directory = await createBackup(root);
  expect((await verifyBackup(directory)).originals).toHaveLength(1);
  await opened.db
    .insert(clients)
    .values({ name: 'Later client', slug: 'later-client' });
  opened.close();
  const release = await acquireInstance(root);
  try {
    await restoreBackup(directory, root);
  } finally {
    await release();
  }
  opened = await openDatabase(root);
  expect(await opened.db.select().from(clients)).toHaveLength(1);
  const data = await new ReportingService(opened.db).dashboard(
    LOCAL_OWNER,
    'backup-fixture',
  );
  expect(metaMetrics(data.metaRows, null).spend.value).toBe('10.1');
  expect(
    (await storage(opened.paths.originals).read(item.storagePath)).equals(
      Buffer.from(metaCSV()),
    ),
  ).toBe(true);
  expect(
    (await listBackups(root)).some(
      (backup) => backup.manifest.kind === 'pre-restore',
    ),
  ).toBe(true);
});
it('rejects damaged originals or a changed database without modifying current data', async () => {
  const { item } = await fixture();
  const directory = await createBackup(root);
  await writeFile(
    path.join(directory, 'originals', item.storagePath),
    'damaged',
  );
  await expect(verifyBackup(directory)).rejects.toThrow('checksum');
  opened.close();
  await expect(restoreBackup(directory, root)).rejects.toThrow('checksum');
  opened = await openDatabase(root);
  expect(await opened.db.select().from(clients)).toHaveLength(1);
  const another = await createBackup(root);
  await writeFile(path.join(another, 'command-center.sqlite'), 'damaged');
  await expect(verifyBackup(another)).rejects.toThrow('checksum');
});
it('rejects path traversal in backup manifests and cleans incomplete backups', async () => {
  const { item } = await fixture();
  const directory = await createBackup(root),
    manifestFile = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.originals[0].key = '../escape';
  await writeFile(manifestFile, JSON.stringify(manifest));
  await expect(verifyBackup(directory)).rejects.toThrow();
  await writeFile(
    path.join(opened.paths.originals, item.storagePath),
    'corrupt',
  );
  await expect(createBackup(root)).rejects.toThrow();
  expect(
    (await readdir(opened.paths.backups)).filter((name) =>
      name.endsWith('.tmp'),
    ),
  ).toEqual([]);
});
it('creates at most one automatic backup per day and preserves manual backups', async () => {
  await fixture();
  await dailyBackup(root);
  await dailyBackup(root);
  await createBackup(root);
  const backups = await listBackups(root);
  expect(backups.filter((b) => b.manifest.kind === 'automatic')).toHaveLength(
    1,
  );
  expect(backups.filter((b) => b.manifest.kind === 'manual')).toHaveLength(1);
});
it('recovers a corrupted current database using a good backup, retaining the broken store', async () => {
  await fixture();
  const directory = await createBackup(root),
    database = opened.paths.database;
  opened.close();
  await writeFile(database, 'broken current database');
  await restoreBackup(directory, root);
  opened = await openDatabase(root);
  expect(await opened.db.select().from(clients)).toHaveLength(1);
  expect(
    (await readdir(root)).some((name) => name.startsWith('.previous-')),
  ).toBe(true);
});
it('denies a second app or offline maintenance operation while the data folder is locked', async () => {
  const release = await acquireInstance(root);
  try {
    await expect(acquireInstance(root)).rejects.toThrow('already running');
  } finally {
    await release();
  }
  const next = await acquireInstance(root);
  await next();
});
it('serializes a backup with an in-flight import transaction so database and originals agree', async () => {
  const { client, service, item } = await fixture();
  const replacement = await service.preview(
    LOCAL_OWNER,
    client.id,
    'replacement.csv',
    Buffer.from(metaCSV('20.20')),
  );
  await Promise.all([
    service.confirm(LOCAL_OWNER, client.id, replacement.id, {
      confirmed: true,
      expectedActiveId: item.id,
      periodStart: '2026-04-01',
      periodEnd: '2026-06-09',
    }),
    createBackup(root),
  ]);
  const [backup] = await listBackups(root);
  const verified = await verifyBackup(
    path.join(opened.paths.backups, backup.name),
  );
  expect(verified.originals).toHaveLength(2);
});
