import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from '@libsql/client';
export const SCHEMA_VERSION = '0001_local';
export async function migrate(client: Client) {
  const transaction = await client.transaction('write');
  try {
    await transaction.execute(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at integer NOT NULL)',
    );
    const rows = await transaction.execute(
      'SELECT version FROM schema_migrations',
    );
    if (rows.rows.some((row) => row.version !== SCHEMA_VERSION))
      throw new Error(
        'This database needs a newer version of Wayfind. Update the app before opening it.',
      );
    if (!rows.rows.length) {
      await transaction.executeMultiple(
        await readFile(
          path.join(process.cwd(), 'drizzle/local/0001_local.sql'),
          'utf8',
        ),
      );
      await transaction.execute({
        sql: 'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)',
        args: [SCHEMA_VERSION, Date.now()],
      });
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
