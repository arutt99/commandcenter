import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseMeta } from '../src/server/importers/meta';
import { parseIndeed } from '../src/server/importers/indeed';
import { parseDriverhub } from '../src/server/importers/driverhub';
import {
  candidateGroups,
  candidateMatches,
  DEFAULT_STAGES,
  displayName,
  indeedMetrics,
  lifetimeBudget,
  metaMetrics,
  recruitingMetrics,
  stageSettings,
  type CandidateInput,
  type MetaInput,
} from '../src/server/reporting/metrics';
import { metaCSV, indeedCSV } from '../scripts/fixtures';

const period = '2026-04-01 – 2026-06-09';
const row: MetaInput = {
  adSetName: 'Raw',
  delivery: 'active',
  spend: '0.10',
  impressions: 100,
  results: 10,
  resultIndicator: 'actions:link_click',
  budget: '100',
  budgetType: 'Lifetime',
};
const candidate: CandidateInput = {
  rowNo: 2,
  firstName: 'Synthetic',
  lastName: 'Example',
  recruitingStatus: 'Connected',
  appStatus: 'In Progress',
  signedDate: '2026-06-10',
  startDate: null,
  position: 'Driver',
  rejectionReason: null,
  ambiguousFields: [],
};

describe('advertising metrics', () => {
  it('uses exact money and weighted totals instead of averaging row rates', () => {
    const totals = metaMetrics(
      [row, { ...row, spend: '0.20', impressions: 900, results: 9 }],
      period,
    );
    expect(totals.spend.value).toBe('0.3');
    expect(totals.impressions.value).toBe('1000');
    expect(totals.clicks.value).toBe('19');
    expect(totals.ctr.value).toBe('0.019');
    expect(totals.cpc.value).toBe('0.01578947368421053');
    expect(totals.spend).toMatchObject({
      label: 'Meta spend',
      period,
      source: 'meta',
    });
    expect(totals.spend.definition).toBeTruthy();
    expect(totals).not.toHaveProperty('reach');
    expect(totals).not.toHaveProperty('frequency');
    expect(totals).not.toHaveProperty('uniqueLinkClicks');
  });
  it('keeps unsupported/missing results unknown, without losing spend or impressions', () => {
    for (const override of [
      { resultIndicator: 'actions:lead' },
      { results: null },
    ]) {
      const totals = metaMetrics([row, { ...row, ...override }], period);
      expect(totals.spend.value).toBe('0.2');
      expect(totals.impressions.value).toBe('200');
      expect(totals.clicks.value).toBeNull();
      expect(totals.ctr.reasonIfNull).toContain('Link clicks unavailable');
      expect(totals.cpc.value).toBeNull();
    }
  });
  it('distinguishes missing uploads, empty exports, actual zero rates, and zero denominators', () => {
    expect(metaMetrics(null, null).spend).toMatchObject({
      value: null,
      reasonIfNull: 'Not uploaded.',
    });
    expect(metaMetrics([], period).spend.value).toBe('0');
    expect(metaMetrics([], period).ctr.value).toBeNull();
    expect(metaMetrics([{ ...row, results: 0 }], period).ctr.value).toBe('0');
    expect(metaMetrics([{ ...row, results: 0 }], period).cpc.reasonIfNull).toBe(
      'No link clicks.',
    );
    expect(indeedMetrics([], period).cpa.value).toBeNull();
    expect(indeedMetrics(null, null).spend.reasonIfNull).toBe('Not uploaded.');
  });
  it('uses lifetime budgets only and does not cap over-budget percentages', () => {
    expect(lifetimeBudget({ ...row, spend: '150' }, period).value).toBe('1.5');
    expect(
      lifetimeBudget({ ...row, budgetType: 'Daily' }, period).reasonIfNull,
    ).toContain('Lifetime');
    expect(lifetimeBudget({ ...row, budget: '0' }, period).value).toBeNull();
    expect(lifetimeBudget({ ...row, budget: null }, period).value).toBeNull();
  });
  it('includes all Indeed row types and recomputes ratios from summed counts', () => {
    const parsed = parseIndeed(indeedCSV());
    const m = indeedMetrics(parsed.rows, period);
    expect(m.spend.value).toBe('30');
    expect(m.impressions.value).toBe('350');
    expect(m.clicks.value).toBe('35');
    expect(m.applyStarts.value).toBe('7');
    expect(m.applies.value).toBe('5');
    expect(m.ctr.value).toBe('0.1');
    expect(m.asr.value).toBe('0.2');
    expect(m.completion.value).toBe('0.7142857142857143');
    expect(m.cpa.value).toBe('6');
    expect(
      indeedMetrics(
        parsed.rows.filter((r) => r.rowKind === 'organic'),
        period,
      ).spend.value,
    ).toBe('0');
  });
  it('reconciles reporting aggregates with the parser on the same synthetic files', async () => {
    const meta = parseMeta(metaCSV());
    const indeed = parseIndeed(indeedCSV());
    const driverhub = await parseDriverhub(
      await readFile('fixtures/driverhub.xlsx'),
    );
    expect(meta.errors).toEqual([]);
    expect(indeed.errors).toEqual([]);
    expect(driverhub.errors).toEqual([]);
    const mm = metaMetrics(meta.rows, period),
      im = indeedMetrics(indeed.rows, period),
      rm = recruitingMetrics(driverhub.rows, 'Snapshot 2026-06-10');
    expect(mm.spend.value).toBe(meta.totals.spend);
    expect(Number(mm.clicks.value)).toBe(meta.totals.linkClicks);
    expect(im.spend.value).toBe(indeed.totals.spend);
    expect(Number(im.applies.value)).toBe(indeed.totals.applies);
    expect(rm.candidates.value).toBe(3);
    expect(rm.signed.value).toBe(1);
    expect(rm.starts.value).toBe(1);
  });
  it('preserves counts above JavaScript safe integer when summing rows', () => {
    const m = metaMetrics(
      [
        { ...row, impressions: '9007199254740991' },
        { ...row, impressions: '9007199254740991' },
      ],
      period,
    );
    expect(m.impressions.value).toBe('18014398509481982');
  });
});
describe('recruiting snapshot populations', () => {
  it('keeps same-name rows distinct and signed rejected applications signed', () => {
    const rows = [
      candidate,
      {
        ...candidate,
        rowNo: 3,
        appStatus: 'Rejected',
        rejectionReason: 'Experience',
        startDate: '2026-06-10',
      },
    ];
    const m = recruitingMetrics(rows, 'Snapshot 2026-06-10');
    expect(m.candidates.value).toBe(2);
    expect(m.signed.value).toBe(2);
    expect(m.conversion.value).toBe('1');
    expect(m.starts.value).toBe(1);
    expect(m.rejected.value).toBe(1);
  });
  it('never guesses multi-value statuses, and rejects invalid/ambiguous dates', () => {
    const rows = [
      candidate,
      {
        ...candidate,
        recruitingStatus: 'Connected',
        appStatus: 'Rejected',
        signedDate: '2026-02-30',
        startDate: '2026-06-10',
        ambiguousFields: ['App Recruiting Status', 'App Status', 'Start Date'],
      },
    ];
    const m = recruitingMetrics(rows, 'Snapshot 2026-06-10');
    expect(m.interview.value).toBe(1);
    expect(m.review.value).toBe(1);
    expect(m.rejected.value).toBe(0);
    expect(m.signed.value).toBe(1);
    expect(m.starts.value).toBe(0);
  });
  it('makes each facet count equal its exact candidate population, including missing/review labels that are also literal values', () => {
    const rows = [
      candidate,
      { ...candidate, position: null, recruitingStatus: null },
      {
        ...candidate,
        position: 'Needs review',
        appStatus: 'Rejected',
        rejectionReason: 'Needs review',
      },
      {
        ...candidate,
        position: null,
        appStatus: 'Rejected',
        rejectionReason: null,
        ambiguousFields: [
          'Position Opening',
          'App Rejection Reason',
          'App Recruiting Status',
        ],
      },
    ];
    for (const kind of ['position', 'status', 'rejection'] as const) {
      for (const group of candidateGroups(rows, kind))
        expect(
          rows.filter((r) => candidateMatches(r, group.filter)),
        ).toHaveLength(group.count);
    }
    expect(candidateGroups(rows, 'position')).toHaveLength(4);
    expect(
      candidateGroups(rows, 'rejection').reduce((n, g) => n + g.count, 0),
    ).toBe(2);
  });
  it('applies configured stages with defaults for absent/invalid configuration', () => {
    expect(stageSettings(null)).toEqual(DEFAULT_STAGES);
    expect(stageSettings({ interviewStatuses: [] })).toEqual(DEFAULT_STAGES);
    const settings = {
      interviewStatuses: ['Attempting Contact'],
      onboardingStatuses: ['Connected'],
    };
    const m = recruitingMetrics([candidate], 'Snapshot 2026-06-10', settings);
    expect(m.interview.value).toBe(0);
    expect(m.onboarding.value).toBe(1);
  });
  it('keeps missing data different from an empty candidate snapshot', () => {
    expect(recruitingMetrics(null, null).candidates.value).toBeNull();
    expect(recruitingMetrics([], 'Snapshot 2026-06-10').candidates.value).toBe(
      0,
    );
    expect(
      recruitingMetrics([], 'Snapshot 2026-06-10').conversion.reasonIfNull,
    ).toBe('No candidates.');
  });
});
it('parses display titles/locations conservatively and keeps unknown names intact', () => {
  expect(
    displayName('Example Freight: Local Driver – CDL A: Example City, MN'),
  ).toEqual({ title: 'Local Driver – CDL A', location: 'Example City, MN' });
  expect(displayName('Local Driver – Example City, MN')).toEqual({
    title: 'Local Driver',
    location: 'Example City, MN',
  });
  expect(displayName('Standard Plan – Example Freight')).toEqual({
    title: 'Standard Plan – Example Freight',
    location: null,
  });
});
