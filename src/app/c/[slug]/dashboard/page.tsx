import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import {
  ReportingError,
  ReportingService,
  sourcePeriod,
} from '@/server/reporting/service';
import {
  candidateGroups,
  indeedMetrics,
  metaMetrics,
  recruitingMetrics,
  type CandidateFilter,
  type Metric,
} from '@/server/reporting/metrics';
import { CandidateCount, MetricValue } from '@/components/reporting';
import { AdTables } from '@/components/ad-tables';

export default async function Dashboard({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ meta?: string; indeed?: string }>;
}) {
  const actor = await requireUser();
  const { slug } = await params;
  const data = await new ReportingService()
    .dashboard(actor, slug)
    .catch((error) => {
      if (error instanceof ReportingError) notFound();
      throw error;
    });
  const mp = sourcePeriod(data.meta),
    ip = sourcePeriod(data.indeed),
    cp = sourcePeriod(data.driverhub);
  const mm = metaMetrics(data.metaRows, mp),
    im = indeedMetrics(data.indeedRows, ip),
    rm = recruitingMetrics(data.candidates, cp, data.settings);
  const count = (metric: Metric, kind: CandidateFilter['kind']) =>
    data.driverhub && metric.value !== null ? (
      <CandidateCount
        slug={slug}
        snapshot={data.driverhub.id}
        settings={data.settings}
        filter={{ kind }}
        count={Number(metric.value)}
        label={metric.label}
      />
    ) : (
      <span>—</span>
    );
  const kpis = [
    { metric: rm.candidates, kind: 'all' },
    { metric: rm.signed, kind: 'signed' },
    { metric: rm.conversion, format: 'percent' },
    { metric: rm.starts, kind: 'starts' },
    { metric: mm.spend, format: 'money' },
    { metric: im.spend, format: 'money' },
  ] as const;
  const funnel = [
    ['all', rm.candidates],
    ['signed', rm.signed],
    ['interview', rm.interview],
    ['onboarding', rm.onboarding],
    ['starts', rm.starts],
  ] as const;
  return (
    <div className="space-y-7" data-dashboard-client={slug}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Performance overview</p>
          <h2 className="mb-1!">Reporting dashboard</h2>
          <p className="muted">
            Uploaded reports · source periods shown separately
          </p>
        </div>
        {actor.role === 'admin' && (
          <Link className="button secondary" href={`/c/${slug}/imports`}>
            Manage uploads
          </Link>
        )}
      </div>
      <section aria-label="Source status" className="grid gap-3 md:grid-cols-3">
        {(['meta', 'indeed', 'driverhub'] as const).map((source) => {
          const item = data.active.find((i) => i.source === source);
          return (
            <div className="source-card" key={source} data-source={source}>
              <strong>
                {source === 'driverhub'
                  ? 'DriverHub'
                  : source === 'meta'
                    ? 'Meta'
                    : 'Indeed'}
              </strong>
              <span className="status ml-2">
                {item ? 'Uploaded' : 'Not uploaded'}
              </span>
              <p className="mt-2 text-sm">
                {sourcePeriod(item) ?? 'Not uploaded'}
              </p>
              {item && (
                <p className="muted text-xs">
                  Uploaded{' '}
                  <time dateTime={item.createdAt.toISOString()}>
                    {new Intl.DateTimeFormat('en-US', {
                      timeZone: data.client.timezone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(item.createdAt)}
                  </time>{' '}
                  · {data.client.timezone}
                </p>
              )}
            </div>
          );
        })}
      </section>
      <section
        aria-label="Headline metrics"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        {kpis.map((kpi) => (
          <div
            className="card kpi"
            key={kpi.metric.label}
            data-kpi={kpi.metric.label}
          >
            <p className="muted text-xs font-semibold">{kpi.metric.label}</p>
            <div className="my-3 text-3xl font-bold">
              {'kind' in kpi ? (
                count(kpi.metric, kpi.kind)
              ) : (
                <MetricValue metric={kpi.metric} format={kpi.format} />
              )}
            </div>
            <p className="muted text-xs">
              {kpi.metric.source === 'driverhub'
                ? 'DriverHub'
                : kpi.metric.source === 'meta'
                  ? 'Meta'
                  : 'Indeed'}{' '}
              · {kpi.metric.period ?? 'Not uploaded'}
            </p>
            <details className="mt-2 text-xs">
              <summary>Definition</summary>
              <p>
                {kpi.metric.definition} {kpi.metric.reasonIfNull}
              </p>
            </details>
          </div>
        ))}
      </section>
      <section className="card" aria-labelledby="recruiting-title">
        <div className="mb-5">
          <p className="eyebrow">Recruiting snapshot</p>
          <h2 id="recruiting-title">
            {data.driverhub
              ? `Status as of ${data.driverhub.snapshotDate}`
              : 'Recruiting snapshot — not uploaded'}
          </h2>
          <p className="muted text-sm">
            Provisional definitions. Current snapshot, not stage history. Stages
            can overlap; signed applications include later rejections. Select
            any count to see its candidate records.
          </p>
        </div>
        {data.candidates && data.driverhub ? (
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="section-title">Funnel snapshot</h3>
              <ul className="space-y-4">
                {funnel.map(([kind, metric]) => (
                  <li key={kind}>
                    <div className="flex justify-between gap-3">
                      <span title={metric.definition}>{metric.label}</span>
                      {count(metric, kind)}
                    </div>
                    <div className="funnel-track" aria-hidden="true">
                      <div
                        className="funnel-fill"
                        style={{
                          width: `${Number(rm.candidates.value) ? (Number(metric.value) / Number(rm.candidates.value)) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="mt-5 grid grid-cols-3 gap-3">
                {(
                  [
                    ['inProgress', rm.inProgress],
                    ['rejected', rm.rejected],
                    ['review', rm.review],
                  ] as const
                ).map(([kind, metric]) => (
                  <div key={kind}>
                    <dt className="muted text-xs" title={metric.definition}>
                      {metric.label}
                    </dt>
                    <dd className="text-xl font-bold">{count(metric, kind)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {(['position', 'status', 'rejection'] as const).map((kind) => {
              const groups = candidateGroups(data.candidates!, kind);
              return (
                <div key={kind}>
                  <h3 className="section-title">
                    {
                      {
                        position: 'Candidates by position',
                        status: 'Current recruiting status',
                        rejection: 'Rejection reasons',
                      }[kind]
                    }
                  </h3>
                  {kind === 'rejection' && (
                    <p className="muted mb-3 text-xs">
                      Only records with App Status = Rejected.
                    </p>
                  )}
                  <ul className="divide-y divide-slate-100">
                    {groups.map((group) => (
                      <li
                        className="flex justify-between gap-3 py-2"
                        key={group.filter.key}
                      >
                        <span className="min-w-0 break-words">
                          {group.label}
                        </span>
                        <CandidateCount
                          slug={slug}
                          snapshot={data.driverhub!.id}
                          settings={data.settings}
                          filter={group.filter}
                          count={group.count}
                          label={group.label}
                        />
                      </li>
                    ))}
                  </ul>
                  {!groups.length && (
                    <p className="muted">No records in this population.</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="notice">
            Not uploaded. An administrator can upload a DriverHub candidate
            export in Imports.
          </p>
        )}
      </section>
      <AdTables data={data} query={await searchParams} />
    </div>
  );
}
