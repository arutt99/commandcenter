import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../src/server/db/schema';
import { ImportService } from '../src/server/imports/service';
import { storage } from '../src/server/imports/storage';
import type { Actor } from '../src/server/permissions';
import { metaCSV, candidateXLSX, indeedCSV } from '../scripts/fixtures';
import { migrate } from '../scripts/migrate';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test.',
  );
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
const actor: Actor = {
  id: randomUUID(),
  name: 'Fixture admin',
  role: 'admin',
  active: true,
};
const staff: Actor = {
  id: randomUUID(),
  name: 'Fixture staff',
  role: 'staff',
  active: true,
};
const clientId = randomUUID();
const otherClient = randomUUID();
let root: string;
let service: ImportService;
const dates = (expectedActiveId = '') => ({
  confirmed: true,
  periodStart: '2026-04-01',
  periodEnd: '2026-06-09',
  expectedActiveId,
});
beforeAll(async () => {
  await migrate(url);
  root = await mkdtemp(path.join(os.tmpdir(), 'wayfind-import-test-'));
  process.env.PRIVATE_STORAGE_DIR = root;
  process.env.FILE_STORAGE = 'disk';
  service = new ImportService({ db, files: storage() });
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE audit_log, imports, users, clients CASCADE`);
  await db
    .insert(schema.users)
    .values(
      [actor, staff].map((a) => ({ ...a, email: `${a.id}@example.test` })),
    );
  await db.insert(schema.clients).values([
    { id: clientId, name: 'Fixture Freight', slug: 'fixture-freight' },
    { id: otherClient, name: 'Other fixture', slug: 'other-fixture' },
  ]);
});
afterAll(async () => {
  await pool.end();
  if (root) await rm(root, { recursive: true, force: true });
});
describe('transactional private imports with PostgreSQL', () => {
  it('previews without rows, guards duplicates, replaces rather than adds, and audits revert', async () => {
    const first = await service.preview(
      actor,
      clientId,
      'meta.csv',
      Buffer.from(metaCSV()),
    );
    expect(await db.select().from(schema.metaRows)).toHaveLength(0);
    await service.confirm(actor, clientId, first.id, dates());
    await expect(
      service.preview(actor, clientId, 'renamed.csv', Buffer.from(metaCSV())),
    ).rejects.toThrow('Already imported');
    const second = await service.preview(
      actor,
      clientId,
      'second.csv',
      Buffer.from(metaCSV('20.20')),
    );
    await service.confirm(actor, clientId, second.id, dates(first.id));
    const rows = await db
      .select({ spend: schema.metaRows.spend })
      .from(schema.metaRows)
      .innerJoin(
        schema.imports,
        eq(schema.imports.id, schema.metaRows.importId),
      )
      .where(eq(schema.imports.status, 'active'));
    expect(rows.map((r) => r.spend)).toEqual(['20.2']);
    await service.revert(actor, clientId, first.id);
    expect(
      (await service.history(actor, clientId)).find(
        (i) => i.status === 'active',
      )?.id,
    ).toBe(first.id);
    expect(await db.select().from(schema.metaRows)).toHaveLength(2);
    expect(
      (await db.select().from(schema.auditLog)).some(
        (a) => a.action === 'import.revert' && a.object === first.id,
      ),
    ).toBe(true);
  });
  it('rejects a bad row and leaves the active dataset untouched', async () => {
    const first = await service.preview(
      actor,
      clientId,
      'meta.csv',
      Buffer.from(metaCSV()),
    );
    await service.confirm(actor, clientId, first.id, dates());
    const bad = await service.preview(
      actor,
      clientId,
      'bad.csv',
      Buffer.from(metaCSV('oops')),
    );
    expect(bad.status).toBe('failed');
    await expect(
      service.confirm(actor, clientId, bad.id, dates(first.id)),
    ).rejects.toThrow('valid preview');
    expect((await service.get(actor, clientId, first.id)).status).toBe(
      'active',
    );
    expect(await db.select().from(schema.metaRows)).toHaveLength(1);
  });
  it('requires confirmed valid metadata and enforces Meta file dates', async () => {
    const item = await service.preview(
      actor,
      clientId,
      'meta.csv',
      Buffer.from(metaCSV()),
    );
    await expect(
      service.confirm(actor, clientId, item.id, {
        ...dates(),
        confirmed: false,
      }),
    ).rejects.toThrow('Confirm');
    await expect(
      service.confirm(actor, clientId, item.id, {
        ...dates(),
        periodEnd: '2026-02-30',
      }),
    ).rejects.toThrow('valid reporting');
    await expect(
      service.confirm(actor, clientId, item.id, {
        ...dates(),
        periodEnd: '2026-06-10',
      }),
    ).rejects.toThrow('must match');
    const indeed = await service.preview(
      actor,
      clientId,
      'Indeed_20260504_20260610.csv',
      Buffer.from(indeedCSV()),
    );
    await service.confirm(actor, clientId, indeed.id, {
      confirmed: true,
      expectedActiveId: '',
      periodStart: '2026-05-05',
      periodEnd: '2026-06-10',
    });
    expect((await service.get(actor, clientId, indeed.id)).periodStart).toBe(
      '2026-05-05',
    );
  });
  it('keeps same-name candidates separate and persists raw ambiguous values', async () => {
    const item = await service.preview(
      actor,
      clientId,
      'candidates.xlsx',
      await candidateXLSX(),
    );
    await expect(
      service.confirm(actor, clientId, item.id, {
        confirmed: true,
        expectedActiveId: '',
        snapshotDate: '2026-06-09',
      }),
    ).rejects.toThrow('newest');
    await service.confirm(actor, clientId, item.id, {
      confirmed: true,
      expectedActiveId: '',
      snapshotDate: '2026-06-10',
    });
    const rows = await db.select().from(schema.candidateRows);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.firstName === 'Synthetic')).toHaveLength(2);
    expect(
      rows.find((r) => r.firstName === 'Fixture')?.values[
        'App Recruiting Status'
      ],
    ).toEqual(['Ready for Interview', 'Attempting Contact']);
  });
  it('serializes simultaneous confirmations and detects stale replacement information', async () => {
    const first = await service.preview(
      actor,
      clientId,
      'a.csv',
      Buffer.from(metaCSV()),
    );
    const second = await service.preview(
      actor,
      clientId,
      'b.csv',
      Buffer.from(metaCSV('20')),
    );
    const results = await Promise.allSettled([
      service.confirm(actor, clientId, first.id, dates()),
      service.confirm(actor, clientId, second.id, dates()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (await service.history(actor, clientId)).filter(
        (i) => i.status === 'active',
      ),
    ).toHaveLength(1);
    expect(await db.select().from(schema.metaRows)).toHaveLength(1);
  });
  it('rolls back inserted rows and status changes on a database error', async () => {
    const first = await service.preview(
      actor,
      clientId,
      'a.csv',
      Buffer.from(metaCSV()),
    );
    await service.confirm(actor, clientId, first.id, dates());
    const second = await service.preview(
      actor,
      clientId,
      'b.csv',
      Buffer.from(metaCSV('20')),
    );
    await db.execute(
      sql`CREATE FUNCTION test_fail_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'import.confirm' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$`,
    );
    await db.execute(
      sql`CREATE TRIGGER fail_activation BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION test_fail_activation()`,
    );
    try {
      await expect(
        service.confirm(actor, clientId, second.id, dates(first.id)),
      ).rejects.toThrow();
    } finally {
      await db.execute(sql`DROP TRIGGER fail_activation ON audit_log`);
      await db.execute(sql`DROP FUNCTION test_fail_activation()`);
    }
    expect((await service.get(actor, clientId, first.id)).status).toBe(
      'active',
    );
    expect((await service.get(actor, clientId, second.id)).status).toBe(
      'preview',
    );
    expect(await db.select().from(schema.metaRows)).toHaveLength(1);
  });
  it('checks file integrity, downloads original bytes, and deletes cancelled previews privately', async () => {
    const item = await service.preview(
      actor,
      clientId,
      'meta.csv',
      Buffer.from(metaCSV()),
    );
    expect(
      (await service.download(actor, clientId, item.id)).data.equals(
        Buffer.from(metaCSV()),
      ),
    ).toBe(true);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(root, item.storagePath), 'modified');
    await expect(
      service.confirm(actor, clientId, item.id, dates()),
    ).rejects.toThrow('integrity');
    await service.cancel(actor, clientId, item.id);
    await expect(service.get(actor, clientId, item.id)).rejects.toThrow(
      'not found',
    );
    await expect(storage().read(item.storagePath)).rejects.toThrow();
    await expect(storage().read('../../escape')).rejects.toThrow(
      'Invalid storage key',
    );
  });
  it('authorizes every service operation and scopes imports to the client', async () => {
    const item = await service.preview(
      actor,
      clientId,
      'meta.csv',
      Buffer.from(metaCSV()),
    );
    for (const member of [staff, { ...actor, active: false }]) {
      await expect(
        service.preview(member, clientId, 'm.csv', Buffer.from(metaCSV())),
      ).rejects.toThrow('Administrator');
      await expect(
        service.confirm(member, clientId, item.id, dates()),
      ).rejects.toThrow('Administrator');
      await expect(service.revert(member, clientId, item.id)).rejects.toThrow(
        'Administrator',
      );
      await expect(service.cancel(member, clientId, item.id)).rejects.toThrow(
        'Administrator',
      );
      await expect(service.download(member, clientId, item.id)).rejects.toThrow(
        'Administrator',
      );
      await expect(service.history(member, clientId)).rejects.toThrow(
        'Administrator',
      );
    }
    await expect(service.get(actor, otherClient, item.id)).rejects.toThrow(
      'not found',
    );
    expect(
      (
        await service.preview(
          actor,
          otherClient,
          'same.csv',
          Buffer.from(metaCSV()),
        )
      ).status,
    ).toBe('preview');
  });
  it('enables RLS and denies a database reader even when granted SELECT', async () => {
    await pool.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wayfind_test_reader') THEN CREATE ROLE wayfind_test_reader NOLOGIN; END IF; END $$",
    );
    await pool.query(
      'GRANT USAGE ON SCHEMA public TO wayfind_test_reader; GRANT SELECT ON ALL TABLES IN SCHEMA public TO wayfind_test_reader',
    );
    const c = await pool.connect();
    try {
      await c.query('SET ROLE wayfind_test_reader');
      expect((await c.query('SELECT * FROM users')).rows).toHaveLength(0);
      expect((await c.query('SELECT * FROM clients')).rows).toHaveLength(0);
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
    const state = await pool.query(
      'SELECT relname FROM pg_class WHERE relname = ANY($1) AND NOT relrowsecurity',
      [
        [
          'users',
          'clients',
          'client_settings',
          'imports',
          'meta_rows',
          'indeed_rows',
          'candidate_rows',
          'audit_log',
          'schema_migrations',
        ],
      ],
    );
    expect(state.rows).toHaveLength(0);
  });
});
