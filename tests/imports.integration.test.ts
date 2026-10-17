import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../src/server/db/schema';
import { ImportService } from '../src/server/imports/service';
import { storage } from '../src/server/imports/storage';
import { LOCAL_OWNER as actor } from '../src/server/local/owner';
import { openDatabase, type Database } from '../src/server/db/connection';
import { metaCSV, candidateXLSX, indeedCSV } from '../scripts/fixtures';
let opened: Awaited<ReturnType<typeof openDatabase>>;
let db: Database;
let temporary: string;
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
beforeEach(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'wayfind-import-test-'));
  opened = await openDatabase(temporary);
  db = opened.db;
  root = opened.paths.originals;
  service = new ImportService({ db, files: storage(root) });
  await db.insert(schema.clients).values([
    { id: clientId, name: 'Fixture Freight', slug: 'fixture-freight' },
    { id: otherClient, name: 'Other fixture', slug: 'other-fixture' },
  ]);
});
afterEach(async () => {
  opened?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});
describe('transactional private imports with local SQLite', () => {
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
    await db.run(
      sql`CREATE TRIGGER fail_activation BEFORE INSERT ON audit_log WHEN NEW.action = 'import.confirm' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`,
    );
    try {
      await expect(
        service.confirm(actor, clientId, second.id, dates(first.id)),
      ).rejects.toThrow();
    } finally {
      await db.run(sql`DROP TRIGGER fail_activation`);
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
    await expect(storage(root).read(item.storagePath)).rejects.toThrow();
    await expect(storage(root).read('../../escape')).rejects.toThrow(
      'Invalid storage key',
    );
  });
  it('scopes imports to their client and allows the local owner to manage them', async () => {
    const item = await service.preview(
      actor,
      clientId,
      'meta.csv',
      Buffer.from(metaCSV()),
    );
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
  it('enforces foreign keys and keeps exact decimal text in the local database', async () => {
    const first = await service.preview(
      actor,
      clientId,
      'precise.csv',
      Buffer.from(metaCSV('9999999999999999.999999')),
    );
    await service.confirm(actor, clientId, first.id, dates());
    expect((await db.select().from(schema.metaRows))[0].spend).toBe(
      '9999999999999999.999999',
    );
    await expect(
      db
        .insert(schema.imports)
        .values({ ...first, id: randomUUID(), clientId: randomUUID() }),
    ).rejects.toThrow();
    expect(
      Number(
        (await opened.client.execute('PRAGMA foreign_keys')).rows[0]
          .foreign_keys,
      ),
    ).toBe(1);
  });
});
