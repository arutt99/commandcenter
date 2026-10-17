import {
  displayName,
  indeedMetrics,
  lifetimeBudget,
  metaMetrics,
  type Metric,
} from '@/server/reporting/metrics';
import {
  sourcePeriod,
  type ReportingService,
} from '@/server/reporting/service';
import { MetricValue, TableScroll } from './reporting';

type DashboardData = Awaited<ReturnType<ReportingService['dashboard']>>;
const metaColumns = [
  'Ad set',
  'Location',
  'Delivery',
  'Period',
  'Spend',
  'Budget used',
  'Impressions',
  'Link clicks',
  'CTR',
  'CPC',
];
const indeedColumns = [
  'Campaign',
  'Type',
  'Period',
  'Impressions',
  'Clicks',
  'CTR',
  'Apply starts',
  'ASR',
  'Applies',
  'Completion %',
  'Spend',
  'CPA',
];
function IndeedCells({
  metrics: m,
}: {
  metrics: ReturnType<typeof indeedMetrics>;
}) {
  return (
    <>
      {(
        [
          [m.impressions, 'count'],
          [m.clicks, 'count'],
          [m.ctr, 'percent'],
          [m.applyStarts, 'count'],
          [m.asr, 'percent'],
          [m.applies, 'count'],
          [m.completion, 'percent'],
          [m.spend, 'money'],
          [m.cpa, 'money'],
        ] as const
      ).map(([metric, format]) => (
        <td key={metric.label}>
          <MetricValue metric={metric} format={format} />
        </td>
      ))}
    </>
  );
}
function Cells({
  values,
}: {
  values: [Metric, 'money' | 'count' | 'percent'][];
}) {
  return (
    <>
      {values.map(([metric, format]) => (
        <td key={metric.label}>
          <MetricValue metric={metric} format={format} />
        </td>
      ))}
    </>
  );
}
export function AdTables({
  data,
  query,
}: {
  data: DashboardData;
  query: { meta?: string; indeed?: string };
}) {
  const metaFilter = ['active', 'ended'].includes(query.meta ?? '')
    ? query.meta!
    : 'all';
  const indeedFilter = ['job', 'bundle', 'organic', 'plan'].includes(
    query.indeed ?? '',
  )
    ? query.indeed!
    : 'all';
  const mp = sourcePeriod(data.meta),
    ip = sourcePeriod(data.indeed);
  const metaRows =
    data.metaRows?.filter((row) => {
      if (metaFilter === 'all') return true;
      if (metaFilter === 'active')
        return row.delivery.trim().toLowerCase() === 'active';
      return (
        /^(ended|completed)$/i.test(row.delivery.trim()) ||
        Boolean(
          row.ends && data.meta?.periodEnd && row.ends <= data.meta.periodEnd,
        )
      );
    }) ?? null;
  const indeedRows =
    data.indeedRows?.filter(
      (row) => indeedFilter === 'all' || row.rowKind === indeedFilter,
    ) ?? null;
  const mt = metaMetrics(metaRows, mp),
    it = indeedMetrics(indeedRows, ip);
  return (
    <>
      <section className="card min-w-0" aria-labelledby="meta-title">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Advertising</p>
            <h2 id="meta-title">Meta performance</h2>
            <p className="muted text-sm">{mp ?? 'Not uploaded'}</p>
          </div>
          <form className="filter-form">
            <input type="hidden" name="indeed" value={indeedFilter} />
            <label>
              Meta delivery
              <select name="meta" defaultValue={metaFilter}>
                <option value="all">All delivery states</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
              </select>
            </label>
            <button className="secondary">Filter Meta</button>
          </form>
        </div>
        {metaRows ? (
          <>
            <TableScroll label="Meta performance table">
              <table>
                <caption>
                  Selected rows · {mp}. Header spend includes all imported rows.
                </caption>
                <thead>
                  <tr>
                    {metaColumns.map((x) => (
                      <th scope="col" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metaRows.map((row) => {
                    const m = metaMetrics([row], mp),
                      name = displayName(row.adSetName);
                    return (
                      <tr key={row.id}>
                        <th scope="row" className="name-cell">
                          {name.title}
                          {name.title !== row.adSetName && (
                            <small className="muted block normal-case">
                              {row.adSetName}
                            </small>
                          )}
                        </th>
                        <td>{name.location ?? 'Not parsed'}</td>
                        <td>
                          <span className="status">
                            {row.delivery || 'Not provided'}
                          </span>
                        </td>
                        <td>{mp}</td>
                        <Cells values={[[m.spend, 'money']]} />
                        <td>
                          <MetricValue
                            metric={lifetimeBudget(row, mp)}
                            format="percent"
                          />
                          {row.budgetType.trim().toLowerCase() ===
                            'lifetime' && (
                            <small className="muted block">
                              of lifetime budget
                            </small>
                          )}
                        </td>
                        <Cells
                          values={[
                            [m.impressions, 'count'],
                            [m.clicks, 'count'],
                            [m.ctr, 'percent'],
                            [m.cpc, 'money'],
                          ]}
                        />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4}>
                      Selected totals
                    </th>
                    <Cells values={[[mt.spend, 'money']]} />
                    <td>Not additive</td>
                    <Cells
                      values={[
                        [mt.impressions, 'count'],
                        [mt.clicks, 'count'],
                        [mt.ctr, 'percent'],
                        [mt.cpc, 'money'],
                      ]}
                    />
                  </tr>
                </tfoot>
              </table>
            </TableScroll>
            {!metaRows.length && (
              <p className="muted mt-3">No rows match this filter.</p>
            )}
            <p className="muted mt-4 text-xs">
              CTR and CPC are recomputed from sums. Unsupported or missing
              link-click results make dependent metrics unavailable (—). Ended
              includes ended/completed delivery or an end date within the
              uploaded period. Reach, frequency and unique clicks are never
              summed.
            </p>
          </>
        ) : (
          <p className="notice">
            Not uploaded. Upload a Meta ad sets CSV in Imports.
          </p>
        )}
      </section>
      <section className="card min-w-0" aria-labelledby="indeed-title">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Job campaigns</p>
            <h2 id="indeed-title">Indeed performance</h2>
            <p className="muted text-sm">{ip ?? 'Not uploaded'}</p>
          </div>
          <form className="filter-form">
            <input type="hidden" name="meta" value={metaFilter} />
            <label>
              Indeed type
              <select name="indeed" defaultValue={indeedFilter}>
                {['all', 'job', 'bundle', 'organic', 'plan'].map((type) => (
                  <option value={type} key={type}>
                    {type === 'all' ? 'All types' : type}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary">Filter Indeed</button>
          </form>
        </div>
        {indeedRows ? (
          <>
            <TableScroll label="Indeed performance table">
              <table>
                <caption>
                  Selected rows · {ip}. All types contribute to header spend.
                </caption>
                <thead>
                  <tr>
                    {indeedColumns.map((x) => (
                      <th scope="col" key={x}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {indeedRows.map((row) => {
                    const name = displayName(row.campaign);
                    return (
                      <tr key={row.id}>
                        <th scope="row" className="name-cell">
                          {name.title}
                          {name.location && (
                            <small className="muted block">
                              {name.location}
                            </small>
                          )}
                          {name.title !== row.campaign && (
                            <small className="muted block normal-case">
                              {row.campaign}
                            </small>
                          )}
                        </th>
                        <td>
                          <span className="status">{row.rowKind}</span>
                        </td>
                        <td>{ip}</td>
                        <IndeedCells metrics={indeedMetrics([row], ip)} />
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={3}>
                      Selected totals
                    </th>
                    <IndeedCells metrics={it} />
                  </tr>
                </tfoot>
              </table>
            </TableScroll>
            {!indeedRows.length && (
              <p className="muted mt-3">No rows match this filter.</p>
            )}
            <p className="muted mt-4 text-xs">
              Rates are recomputed from sums, never averaged. A zero denominator
              shows —. Name parsing is for display only; raw campaign names
              remain visible.
            </p>
          </>
        ) : (
          <p className="notice">
            Not uploaded. Upload an Indeed Jobs Campaigns CSV in Imports.
          </p>
        )}
      </section>
    </>
  );
}
