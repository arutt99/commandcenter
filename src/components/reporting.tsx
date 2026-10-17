import Link from 'next/link';
import Decimal from 'decimal.js';
import type {
  CandidateFilter,
  Metric,
  StageSettings,
} from '@/server/reporting/metrics';

export function metricText(
  metric: Metric,
  format: 'count' | 'money' | 'percent' = 'count',
) {
  if (metric.value === null) return '—';
  const n = new Decimal(metric.value);
  if (format === 'money') return `$${n.toFixed(2)}`;
  if (format === 'percent') return `${n.times(100).toFixed(2)}%`;
  return n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function MetricValue({
  metric,
  format = 'count',
}: {
  metric: Metric;
  format?: 'count' | 'money' | 'percent';
}) {
  return (
    <span
      tabIndex={0}
      className="metric-value"
      title={`${metric.definition} ${metric.source} · ${metric.period ?? 'Not uploaded'}. ${metric.reasonIfNull ?? ''}`}
    >
      {metricText(metric, format)}
      <span className="metric-help" role="tooltip">
        {metric.definition} {metric.source} · {metric.period ?? 'Not uploaded'}.{' '}
        {metric.reasonIfNull}
      </span>
    </span>
  );
}
export function candidateUrl(
  slug: string,
  snapshot: string,
  filter: CandidateFilter,
  settings: StageSettings,
) {
  const query = new URLSearchParams({ snapshot, kind: filter.kind });
  if (filter.key !== undefined) query.set('key', filter.key);
  // Preserve the exact population if the owner changes the mapping after rendering.
  if (filter.kind === 'interview' || filter.kind === 'onboarding')
    query.set('stages', JSON.stringify(settings));
  return `/c/${slug}/candidates?${query}`;
}
export function CandidateCount({
  slug,
  snapshot,
  filter,
  settings,
  count,
  label,
}: {
  slug: string;
  snapshot: string;
  filter: CandidateFilter;
  settings: StageSettings;
  count: number;
  label: string;
}) {
  return (
    <Link
      prefetch={false}
      href={candidateUrl(slug, snapshot, filter, settings)}
      aria-label={`${label}: ${count} candidates`}
      data-candidate-count={count}
    >
      {count.toLocaleString('en-US')}
    </Link>
  );
}
export function TableScroll({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
