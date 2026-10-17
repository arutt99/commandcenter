import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdir, chmod } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import * as schema from './schema';
import { localPaths } from '../local/paths';
import { withStoreLock } from '../local/queue';
import { migrate } from './migrate';
export async function openDatabase(root: string) {
  const paths = localPaths(root);
  await mkdir(paths.store, { recursive: true, mode: 0o700 });
  await mkdir(paths.originals, { recursive: true, mode: 0o700 });
  const client = createClient({ url: pathToFileURL(paths.database).href });
  try {
    await client.execute('PRAGMA foreign_keys = ON');
    await client.execute('PRAGMA journal_mode = WAL');
    await client.execute('PRAGMA busy_timeout = 10000');
    await migrate(client);
    await chmod(paths.database, 0o600);
    const db = drizzle(client, { schema });
    const transaction = db.transaction.bind(db);
    db.transaction = (callback, config) =>
      withStoreLock(() => transaction(callback, config));
    return { client, db, paths, close: () => client.close() };
  } catch (error) {
    client.close();
    throw error;
  }
}
export type Database = Awaited<ReturnType<typeof openDatabase>>['db'];
