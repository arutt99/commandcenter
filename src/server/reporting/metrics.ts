import DecimalJs from 'decimal.js';
import { z } from 'zod';
import type { CandidateRow, Source } from '../importers/types';
const Decimal = DecimalJs.clone({ precision: 40 });

export type Metric = {
  value: string | number | null;
  label: string;
  definition: string;
  period: string | null;
  source: Source;
  reasonIfNull?: string;
};
export type Numeric = string | number;
export type MetaInput = {
  adSetName: string;
  delivery: string;
  results: Numeric | null;
  resultIndicator: string;
  spend: string;
  impressions: Numeric;
  budget: string | null;
  budgetType: string;
};
export type IndeedInput = {
  campaign: string;
  rowKind: string;
  spend: string;
  impressions: Numeric;
  clicks: Numeric;
  applyStarts: Numeric;
  applies: Numeric;
};
export type CandidateInput = Pick<
  CandidateRow,
  | 'rowNo'
  | 'firstName'
  | 'lastName'
  | 'signedDate'
  | 'startDate'
  | 'recruitingStatus'
  | 'appStatus'
  | 'position'
  | 'rejectionReason'
  | 'ambiguousFields'
>;
export const stageSettingsSchema = z.object({
  interviewStatuses: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  onboardingStatuses: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
});
export type StageSettings = z.infer<typeof stageSettingsSchema>;
export const DEFAULT_STAGES: StageSettings = {
  interviewStatuses: ['Ready for Interview', 'Connected'],
  onboardingStatuses: ['Pending Start Date'],
};
export function stageSettings(value: unknown): StageSettings {
  const parsed = stageSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_STAGES;
}
function metric(
  value: Metric['value'],
  label: string,
  definition: string,
  source: Source,
  period: string | null,
  reasonIfNull = 'Not enough data.',
): Metric {
  return {
    value,
    label,
    definition,
    source,
    period,
    ...(value === null ? { reasonIfNull } : {}),
  };
}
function sum<T>(rows: readonly T[], field: keyof T): string {
  return rows
    .reduce((total, row) => total.plus(String(row[field])), new Decimal(0))
    .toString();
}
function ratio(n: Numeric | null, d: Numeric | null): string | null {
  return n === null || d === null || new Decimal(d).isZero()
    ? null
    : new Decimal(n).div(d).toSignificantDigits(16).toString();
}
export function metaMetrics(
  rows: readonly MetaInput[] | null,
  period: string | null,
) {
  const spend = rows === null ? null : sum(rows, 'spend');
  const impressions = rows === null ? null : sum(rows, 'impressions');
  const clicks =
    rows === null ||
    rows.some(
      (r) => r.resultIndicator !== 'actions:link_click' || r.results === null,
    )
      ? null
      : rows.reduce((n, r) => n.plus(r.results!), new Decimal(0)).toString();
  const reason =
    rows === null
      ? 'Not uploaded.'
      : 'Link clicks unavailable: one or more results are missing or use another result indicator.';
  return {
    spend: metric(
      spend,
      'Meta spend',
      'Sum of Amount spent (USD) in the selected rows.',
      'meta',
      period,
      reason,
    ),
    impressions: metric(
      impressions,
      'Impressions',
      'Sum of impressions in the selected rows.',
      'meta',
      period,
      reason,
    ),
    clicks: metric(
      clicks,
      'Link clicks',
      'Sum of Results only when every selected row uses actions:link_click and has results.',
      'meta',
      period,
      reason,
    ),
    ctr: metric(
      ratio(clicks, impressions),
      'CTR',
      'Link clicks divided by summed impressions.',
      'meta',
      period,
      rows === null || clicks === null ? reason : 'No impressions.',
    ),
    cpc: metric(
      ratio(spend, clicks),
      'CPC',
      'Spend divided by link clicks.',
      'meta',
      period,
      rows === null || clicks === null ? reason : 'No link clicks.',
    ),
  };
}
export function lifetimeBudget(row: MetaInput, period: string | null): Metric {
  const eligible = row.budgetType.trim().toLowerCase() === 'lifetime';
  return metric(
    eligible ? ratio(row.spend, row.budget) : null,
    'Of lifetime budget',
    'Ad-set spend divided by its lifetime budget. Daily budgets are not period budgets.',
    'meta',
    period,
    eligible
      ? 'No positive lifetime budget supplied.'
      : 'Available only for Lifetime budgets.',
  );
}
export function indeedMetrics(
  rows: readonly IndeedInput[] | null,
  period: string | null,
) {
  const total = (key: keyof IndeedInput) =>
    rows === null ? null : sum(rows, key);
  const spend = total('spend'),
    impressions = total('impressions'),
    clicks = total('clicks'),
    starts = total('applyStarts'),
    applies = total('applies');
  const m = (
    value: Metric['value'],
    label: string,
    definition: string,
    reason = 'Denominator is zero.',
  ) =>
    metric(
      value,
      label,
      definition,
      'indeed',
      period,
      rows === null ? 'Not uploaded.' : reason,
    );
  return {
    spend: m(
      spend,
      'Indeed spend',
      'Sum of spend across selected campaign types; all types included by default.',
    ),
    impressions: m(impressions, 'Impressions', 'Sum of impressions.'),
    clicks: m(clicks, 'Clicks', 'Sum of clicks.'),
    applyStarts: m(starts, 'Apply starts', 'Sum of apply starts.'),
    applies: m(applies, 'Applies', 'Sum of applies.'),
    ctr: m(
      ratio(clicks, impressions),
      'CTR',
      'Summed clicks divided by summed impressions.',
    ),
    asr: m(
      ratio(starts, clicks),
      'ASR',
      'Summed apply starts divided by summed clicks.',
    ),
    completion: m(
      ratio(applies, starts),
      'Completion',
      'Summed applies divided by summed apply starts.',
    ),
    cpa: m(
      ratio(spend, applies),
      'CPA',
      'Summed spend divided by summed applies.',
    ),
  };
}
export function validDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export const FILTER_KINDS = [
  'all',
  'signed',
  'starts',
  'interview',
  'onboarding',
  'rejected',
  'inProgress',
  'review',
  'position',
  'status',
  'rejection',
] as const;
export type CandidateFilter = {
  kind: (typeof FILTER_KINDS)[number];
  key?: string;
};
const groupFields = {
  position: ['position', 'Position Opening'],
  status: ['recruitingStatus', 'App Recruiting Status'],
  rejection: ['rejectionReason', 'App Rejection Reason'],
} as const;
type GroupKind = keyof typeof groupFields;
function group(row: CandidateInput, kind: GroupKind) {
  const [field, header] = groupFields[kind];
  const value = row[field];
  const state = row.ambiguousFields.includes(header)
    ? 'review'
    : value === null
      ? 'missing'
      : 'value';
  return {
    key: JSON.stringify([state, state === 'value' ? value : null]),
    label:
      state === 'review'
        ? 'Needs review'
        : state === 'missing'
          ? 'Not provided'
          : value!,
  };
}
export function candidateMatches(
  row: CandidateInput,
  filter: CandidateFilter,
  settings: StageSettings = DEFAULT_STAGES,
): boolean {
  const certainStatus = !row.ambiguousFields.includes('App Recruiting Status');
  const certainOutcome = !row.ambiguousFields.includes('App Status');
  switch (filter.kind) {
    case 'all':
      return true;
    case 'signed':
      return (
        !row.ambiguousFields.includes('App Signed Date') &&
        validDate(row.signedDate)
      );
    case 'starts':
      return (
        !row.ambiguousFields.includes('Start Date') && validDate(row.startDate)
      );
    case 'interview':
      return (
        certainStatus &&
        settings.interviewStatuses.includes(row.recruitingStatus ?? '')
      );
    case 'onboarding':
      return (
        certainStatus &&
        settings.onboardingStatuses.includes(row.recruitingStatus ?? '')
      );
    case 'rejected':
      return certainOutcome && row.appStatus === 'Rejected';
    case 'inProgress':
      return certainOutcome && row.appStatus === 'In Progress';
    case 'review':
      return !certainStatus || !certainOutcome;
    case 'rejection':
      return (
        candidateMatches(row, { kind: 'rejected' }, settings) &&
        group(row, 'rejection').key === filter.key
      );
    case 'position':
    case 'status':
      return group(row, filter.kind).key === filter.key;
  }
}
export function candidateGroups(
  rows: readonly CandidateInput[],
  kind: GroupKind,
) {
  const counts = new Map<
    string,
    { label: string; count: number; filter: CandidateFilter }
  >();
  for (const row of rows) {
    if (kind === 'rejection' && !candidateMatches(row, { kind: 'rejected' }))
      continue;
    const { key, label } = group(row, kind);
    const entry = counts.get(key) ?? { label, count: 0, filter: { kind, key } };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}
export function recruitingMetrics(
  rows: readonly CandidateInput[] | null,
  period: string | null,
  settings: StageSettings = DEFAULT_STAGES,
) {
  const count = (kind: CandidateFilter['kind']) =>
    rows === null
      ? null
      : rows.filter((r) => candidateMatches(r, { kind }, settings)).length;
  const m = (
    kind: CandidateFilter['kind'],
    label: string,
    definition: string,
  ) =>
    metric(
      count(kind),
      label,
      definition,
      'driverhub',
      period,
      'Not uploaded.',
    );
  const candidates = m(
    'all',
    'Total candidates',
    'All candidate rows in this snapshot. Names are not deduplicated.',
  );
  const signed = m(
    'signed',
    'Signed applications',
    'Candidate rows with a valid, unambiguous App Signed Date, including later rejections.',
  );
  return {
    candidates,
    signed,
    conversion: metric(
      ratio(signed.value, candidates.value),
      'Lead → application',
      'Signed applications divided by all candidate rows in the same snapshot; not a historical conversion rate.',
      'driverhub',
      period,
      rows === null ? 'Not uploaded.' : 'No candidates.',
    ),
    starts: m(
      'starts',
      'Recorded starts',
      'Candidate rows with a valid, unambiguous Start Date; not confirmed hires.',
    ),
    interview: m(
      'interview',
      'Interview stage',
      `Current recruiting status in: ${settings.interviewStatuses.join(', ')}. Ambiguous statuses excluded.`,
    ),
    onboarding: m(
      'onboarding',
      'Onboarding',
      `Current recruiting status in: ${settings.onboardingStatuses.join(', ')}. Ambiguous statuses excluded.`,
    ),
    rejected: m(
      'rejected',
      'Rejected / disqualified',
      'Candidate rows with unambiguous App Status = Rejected.',
    ),
    inProgress: m(
      'inProgress',
      'In progress',
      'Candidate rows with unambiguous App Status = In Progress.',
    ),
    review: m(
      'review',
      'Needs review',
      'Candidate rows with ambiguous recruiting status or application status; no stage is inferred.',
    ),
  };
}
// Display parsing only; raw names and row identity remain unchanged.
export function displayName(raw: string): {
  title: string;
  location: string | null;
} {
  const colon = /^(?:[^:]+:\s*)?([^:]+):\s*([^:,]+,\s*[A-Z]{2})$/.exec(raw);
  if (colon) return { title: colon[1].trim(), location: colon[2].trim() };
  const dash = /^(.+?)\s+[–—-]\s+([^,]+,\s*[A-Z]{2})$/.exec(raw);
  return dash
    ? { title: dash[1].trim(), location: dash[2].trim() }
    : { title: raw, location: null };
}
