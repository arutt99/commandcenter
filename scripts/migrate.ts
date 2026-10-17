import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
export async function migrate(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('Set DATABASE_URL.');
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(72195001)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()); ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY',
    );
    const version = '0001_import_foundation';
    const applied = await client.query(
      'SELECT version FROM schema_migrations WHERE version=$1',
      [version],
    );
    if (!applied.rowCount) {
      await client.query(
        await readFile(
          new URL('../drizzle/0001_import_foundation.sql', import.meta.url),
          'utf8',
        ),
      );
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [
        version,
      ]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}
if (process.argv[1]?.endsWith('migrate.ts'))
  migrate()
    .then(() => console.log('Migrations applied.'))
    .catch(() => {
      console.error(
        'Migration failed. Verify database configuration and migration SQL.',
      );
      process.exitCode = 1;
    });
