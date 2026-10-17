import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import * as schema from '../src/server/db/schema';
import { ImportService } from '../src/server/imports/service';
import { storage } from '../src/server/imports/storage';
import { ReportingService } from '../src/server/reporting/service';
import {
  candidateGroups,
  candidateMatches,
  DEFAULT_STAGES,
  metaMetrics,
  recruitingMetrics,
} from '../src/server/reporting/metrics';
import { metaCSV, candidateXLSX } from '../scripts/fixtures';
import { migrate } from '../scripts/migrate';
import type { Actor } from '../src/server/permissions';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable database ending in _test.',
  );
const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
const admin: Actor = {
  id: randomUUID(),
  name: 'Synthetic admin',
  role: 'admin',
  active: true,
};
const staff: Actor = {
  id: randomUUID(),
  name: 'Synthetic staff',
  role: 'staff',
  active: true,
};
const clientId = randomUUID(),
  otherId = randomUUID();
let files: string, imports: ImportService, reporting: ReportingService;
beforeAll(async () => {
  await migrate(url);
  files = await mkdtemp(path.join(os.tmpdir(), 'wayfind-reporting-test-'));
  process.env.PRIVATE_STORAGE_DIR = files;
  process.env.FILE_STORAGE = 'disk';
  imports = new ImportService({ db, files: storage() });
  reporting = new ReportingService(db);
});
beforeEach(async () => {
  await db.execute(sql`TRUNCATE audit_log, imports, users, clients CASCADE`);
  await db
    .insert(schema.users)
    .values(
      [admin, staff].map((a) => ({ ...a, email: `${a.id}@example.test` })),
    );
  await db.insert(schema.clients).values([
    { id: clientId, name: 'Synthetic Freight', slug: 'synthetic-freight' },
    { id: otherId, name: 'Other Client', slug: 'other-client' },
  ]);
});
afterAll(async () => {
  await pool.end();
  if (files) await rm(files, { recursive: true, force: true });
});
const dates = (expectedActiveId = '') => ({
  confirmed: true,
  periodStart: '2026-04-01',
  periodEnd: '2026-06-09',
  expectedActiveId,
});
async function activateCandidates() {
  const item = await imports.preview(
    admin,
    clientId,
    'snapshot.xlsx',
    await candidateXLSX(),
  );
  await imports.confirm(admin, clientId, item.id, {
    confirmed: true,
    snapshotDate: '2026-06-10',
    expectedActiveId: '',
  });
  return item;
}
it('reads only this client’s active rows, with replacement/revert and missing sources', async () => {
  const first = await imports.preview(
    admin,
    clientId,
    'meta.csv',
    Buffer.from(metaCSV()),
  );
  await imports.confirm(admin, clientId, first.id, dates());
  const next = await imports.preview(
    admin,
    clientId,
    'next.csv',
    Buffer.from(metaCSV('20.20')),
  );
  await imports.confirm(admin, clientId, next.id, dates(first.id));
  await imports.preview(
    admin,
    clientId,
    'preview.csv',
    Buffer.from(metaCSV('99.99')),
  );
  await imports.preview(
    admin,
    clientId,
    'bad.csv',
    Buffer.from(metaCSV('88.88', { 'Reporting ends': 'invalid' })),
  );
  const foreign = await imports.preview(
    admin,
    otherId,
    'foreign.csv',
    Buffer.from(metaCSV('900')),
  );
  await imports.confirm(admin, otherId, foreign.id, dates());
  const snapshot = await reporting.dashboard(staff, 'synthetic-freight');
  expect(snapshot.meta?.id).toBe(next.id);
  expect(metaMetrics(snapshot.metaRows, 'period').spend.value).toBe('20.2');
  expect(snapshot.indeedRows).toBeNull();
  expect(snapshot.candidates).toBeNull();
  expect(snapshot.active).toHaveLength(1);
  await imports.revert(admin, clientId, first.id);
  expect(
    metaMetrics(
      (await reporting.dashboard(staff, 'synthetic-freight')).metaRows,
      'period',
    ).spend.value,
  ).toBe('10.1');
  expect(
    metaMetrics(
      (await reporting.dashboard(staff, 'other-client')).metaRows,
      'period',
    ).spend.value,
  ).toBe('900');
});
it('matches all dashboard populations and keeps same-name candidate rows distinct', async () => {
  const item = await activateCandidates();
  const data = await reporting.dashboard(staff, 'synthetic-freight');
  expect(data.candidates).toHaveLength(3);
  const metrics = recruitingMetrics(data.candidates, 'Snapshot 2026-06-10');
  const stages = {
    all: metrics.candidates,
    signed: metrics.signed,
    starts: metrics.starts,
    interview: metrics.interview,
    onboarding: metrics.onboarding,
    rejected: metrics.rejected,
    inProgress: metrics.inProgress,
    review: metrics.review,
  } as const;
  for (const [kind, metric] of Object.entries(stages)) {
    const list = await reporting.candidates(
      staff,
      'synthetic-freight',
      item.id,
      { kind: kind as keyof typeof stages },
      1,
    );
    expect(list.total).toBe(metric.value);
    expect(list.rows).toHaveLength(Number(metric.value));
  }
  for (const kind of ['position', 'status', 'rejection'] as const)
    for (const group of candidateGroups(data.candidates!, kind)) {
      const list = await reporting.candidates(
        staff,
        'synthetic-freight',
        item.id,
        group.filter,
        1,
      );
      expect(list.total).toBe(group.count);
      expect(
        list.rows.every((row) => candidateMatches(row, group.filter)),
      ).toBe(true);
    }
  const all = await reporting.candidates(
    staff,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    1,
  );
  expect(
    all.rows.filter(
      (r) => r.firstName === 'Synthetic' && r.lastName === 'Example',
    ),
  ).toHaveLength(2);
});
it('paginates deterministically and preserves old snapshot links through a replacement', async () => {
  const item = await activateCandidates();
  const [base] = await db
    .select()
    .from(schema.candidateRows)
    .where(eq(schema.candidateRows.importId, item.id));
  await db.insert(schema.candidateRows).values(
    Array.from({ length: 57 }, (_, i) => ({
      ...base,
      id: randomUUID(),
      rowNo: i + 5,
    })),
  );
  const a = await reporting.candidates(
    staff,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    1,
  );
  const b = await reporting.candidates(
    staff,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    2,
  );
  const c = await reporting.candidates(
    staff,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    99,
  );
  expect(a.total).toBe(60);
  expect(a.rows).toHaveLength(25);
  expect(b.rows).toHaveLength(25);
  expect(c.rows).toHaveLength(10);
  expect(c.page).toBe(3);
  expect(new Set([...a.rows, ...b.rows, ...c.rows].map((r) => r.id)).size).toBe(
    60,
  );
  const replacement = await imports.preview(
    admin,
    clientId,
    'empty.xlsx',
    await candidateXLSX({ zero: true }),
  );
  await imports.confirm(admin, clientId, replacement.id, {
    confirmed: true,
    snapshotDate: '2026-06-11',
    expectedActiveId: item.id,
  });
  expect(
    (await reporting.dashboard(staff, 'synthetic-freight')).candidates,
  ).toEqual([]);
  const old = await reporting.candidates(
    staff,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    1,
  );
  expect(old.item.status).toBe('superseded');
  expect(old.total).toBe(60);
});
it('denies inactive users, unavailable clients, previews, malformed IDs and cross-client snapshots', async () => {
  const active = await activateCandidates();
  const preview = await imports.preview(
    admin,
    clientId,
    'empty.xlsx',
    await candidateXLSX({ zero: true }),
  );
  await expect(
    reporting.dashboard({ ...staff, active: false }, 'synthetic-freight'),
  ).rejects.toThrow('Active staff');
  await expect(
    reporting.candidates(
      { ...staff, active: false },
      'synthetic-freight',
      active.id,
      { kind: 'all' },
      1,
    ),
  ).rejects.toThrow('Active staff');
  await expect(
    reporting.candidates(staff, 'other-client', active.id, { kind: 'all' }, 1),
  ).rejects.toThrow('unavailable');
  await expect(
    reporting.candidates(
      staff,
      'synthetic-freight',
      preview.id,
      { kind: 'all' },
      1,
    ),
  ).rejects.toThrow('unavailable');
  await expect(
    reporting.candidates(
      staff,
      'synthetic-freight',
      'bad-id',
      { kind: 'all' },
      1,
    ),
  ).rejects.toThrow('unavailable');
  await db
    .update(schema.clients)
    .set({ active: false })
    .where(eq(schema.clients.id, clientId));
  await expect(reporting.dashboard(staff, 'synthetic-freight')).rejects.toThrow(
    'unavailable',
  );
});
it('audits admin stage changes without overwriting other settings, and retains the linked stage population', async () => {
  const item = await activateCandidates();
  await db
    .insert(schema.clientSettings)
    .values({ clientId, settings: { unrelatedSetting: true } });
  const settings = {
    interviewStatuses: ['Attempting Contact'],
    onboardingStatuses: ['Connected'],
  };
  await expect(
    reporting.saveStages(staff, 'synthetic-freight', settings),
  ).rejects.toThrow('Administrator');
  await expect(
    reporting.saveStages(admin, 'synthetic-freight', {
      ...settings,
      interviewStatuses: [],
    }),
  ).rejects.toThrow();
  await reporting.saveStages(admin, 'synthetic-freight', settings);
  expect(
    (await reporting.dashboard(staff, 'synthetic-freight')).settings,
  ).toEqual(settings);
  const [saved] = await db.select().from(schema.clientSettings);
  expect(saved.settings).toMatchObject({
    unrelatedSetting: true,
    stages: settings,
  });
  expect(
    (await db.select().from(schema.auditLog)).some(
      (a) => a.action === 'settings.stages.update',
    ),
  ).toBe(true);
  expect(
    (
      await reporting.candidates(
        staff,
        'synthetic-freight',
        item.id,
        { kind: 'interview' },
        1,
      )
    ).total,
  ).toBe(2);
  expect(
    (
      await reporting.candidates(
        staff,
        'synthetic-freight',
        item.id,
        { kind: 'interview' },
        1,
        DEFAULT_STAGES,
      )
    ).total,
  ).toBe(0);
});
