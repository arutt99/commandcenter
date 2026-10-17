import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';
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
import { openDatabase, type Database } from '../src/server/db/connection';
import { LOCAL_OWNER as owner } from '../src/server/local/owner';

let opened: Awaited<ReturnType<typeof openDatabase>>;
let db: Database;
const clientId = randomUUID(),
  otherId = randomUUID();
let files: string, imports: ImportService, reporting: ReportingService;
beforeEach(async () => {
  files = await mkdtemp(path.join(os.tmpdir(), 'wayfind-reporting-test-'));
  opened = await openDatabase(files);
  db = opened.db;
  imports = new ImportService({ db, files: storage(opened.paths.originals) });
  reporting = new ReportingService(db);
  await db.insert(schema.clients).values([
    { id: clientId, name: 'Synthetic Freight', slug: 'synthetic-freight' },
    { id: otherId, name: 'Other Client', slug: 'other-client' },
  ]);
});
afterEach(async () => {
  opened?.close();
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
    owner,
    clientId,
    'snapshot.xlsx',
    await candidateXLSX(),
  );
  await imports.confirm(owner, clientId, item.id, {
    confirmed: true,
    snapshotDate: '2026-06-10',
    expectedActiveId: '',
  });
  return item;
}
it('reads only this client’s active rows, with replacement/revert and missing sources', async () => {
  const first = await imports.preview(
    owner,
    clientId,
    'meta.csv',
    Buffer.from(metaCSV()),
  );
  await imports.confirm(owner, clientId, first.id, dates());
  const next = await imports.preview(
    owner,
    clientId,
    'next.csv',
    Buffer.from(metaCSV('20.20')),
  );
  await imports.confirm(owner, clientId, next.id, dates(first.id));
  await imports.preview(
    owner,
    clientId,
    'preview.csv',
    Buffer.from(metaCSV('99.99')),
  );
  await imports.preview(
    owner,
    clientId,
    'bad.csv',
    Buffer.from(metaCSV('88.88', { 'Reporting ends': 'invalid' })),
  );
  const foreign = await imports.preview(
    owner,
    otherId,
    'foreign.csv',
    Buffer.from(metaCSV('900')),
  );
  await imports.confirm(owner, otherId, foreign.id, dates());
  const snapshot = await reporting.dashboard(owner, 'synthetic-freight');
  expect(snapshot.meta?.id).toBe(next.id);
  expect(metaMetrics(snapshot.metaRows, 'period').spend.value).toBe('20.2');
  expect(snapshot.indeedRows).toBeNull();
  expect(snapshot.candidates).toBeNull();
  expect(snapshot.active).toHaveLength(1);
  await imports.revert(owner, clientId, first.id);
  expect(
    metaMetrics(
      (await reporting.dashboard(owner, 'synthetic-freight')).metaRows,
      'period',
    ).spend.value,
  ).toBe('10.1');
  expect(
    metaMetrics(
      (await reporting.dashboard(owner, 'other-client')).metaRows,
      'period',
    ).spend.value,
  ).toBe('900');
});
it('matches all dashboard populations and keeps same-name candidate rows distinct', async () => {
  const item = await activateCandidates();
  const data = await reporting.dashboard(owner, 'synthetic-freight');
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
      owner,
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
        owner,
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
    owner,
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
    owner,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    1,
  );
  const b = await reporting.candidates(
    owner,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    2,
  );
  const c = await reporting.candidates(
    owner,
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
    owner,
    clientId,
    'empty.xlsx',
    await candidateXLSX({ zero: true }),
  );
  await imports.confirm(owner, clientId, replacement.id, {
    confirmed: true,
    snapshotDate: '2026-06-11',
    expectedActiveId: item.id,
  });
  expect(
    (await reporting.dashboard(owner, 'synthetic-freight')).candidates,
  ).toEqual([]);
  const old = await reporting.candidates(
    owner,
    'synthetic-freight',
    item.id,
    { kind: 'all' },
    1,
  );
  expect(old.item.status).toBe('superseded');
  expect(old.total).toBe(60);
});
it('denies unavailable clients, previews, malformed IDs and cross-client snapshots', async () => {
  const active = await activateCandidates();
  const preview = await imports.preview(
    owner,
    clientId,
    'empty.xlsx',
    await candidateXLSX({ zero: true }),
  );
  await expect(
    reporting.candidates(owner, 'other-client', active.id, { kind: 'all' }, 1),
  ).rejects.toThrow('unavailable');
  await expect(
    reporting.candidates(
      owner,
      'synthetic-freight',
      preview.id,
      { kind: 'all' },
      1,
    ),
  ).rejects.toThrow('unavailable');
  await expect(
    reporting.candidates(
      owner,
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
  await expect(reporting.dashboard(owner, 'synthetic-freight')).rejects.toThrow(
    'unavailable',
  );
});
it('audits local stage changes without overwriting other settings, and retains the linked stage population', async () => {
  const item = await activateCandidates();
  await db
    .insert(schema.clientSettings)
    .values({ clientId, settings: { unrelatedSetting: true } });
  const settings = {
    interviewStatuses: ['Attempting Contact'],
    onboardingStatuses: ['Connected'],
  };
  await expect(
    reporting.saveStages(owner, 'synthetic-freight', {
      ...settings,
      interviewStatuses: [],
    }),
  ).rejects.toThrow();
  await reporting.saveStages(owner, 'synthetic-freight', settings);
  expect(
    (await reporting.dashboard(owner, 'synthetic-freight')).settings,
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
        owner,
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
        owner,
        'synthetic-freight',
        item.id,
        { kind: 'interview' },
        1,
        DEFAULT_STAGES,
      )
    ).total,
  ).toBe(0);
});
