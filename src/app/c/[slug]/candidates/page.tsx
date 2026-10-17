import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireLocal } from '@/server/local/context';
import {
  ReportingError,
  ReportingService,
  sourcePeriod,
} from '@/server/reporting/service';
import {
  FILTER_KINDS,
  stageSettingsSchema,
  type StageSettings,
} from '@/server/reporting/metrics';
import { TableScroll } from '@/components/reporting';

const querySchema = z.object({
  snapshot: z.uuid(),
  kind: z.enum(FILTER_KINDS).default('all'),
  key: z.string().max(5000).optional(),
  stages: z.string().max(6000).optional(),
  page: z.string().optional(),
});
export default async function Candidates({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireLocal();
  const { slug } = await params;
  const parsed = querySchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const query = parsed.data;
  let stages: StageSettings | undefined;
  if (query.stages) {
    try {
      stages = stageSettingsSchema.parse(JSON.parse(query.stages));
    } catch {
      notFound();
    }
  }
  const result = await new ReportingService()
    .candidates(
      actor,
      slug,
      query.snapshot,
      { kind: query.kind, key: query.key },
      Number(query.page ?? 1),
      stages,
    )
    .catch((error) => {
      if (error instanceof ReportingError) notFound();
      throw error;
    });
  const pageUrl = (page: number) => {
    const p = new URLSearchParams({
      snapshot: query.snapshot,
      kind: query.kind,
      page: String(page),
    });
    if (query.key !== undefined) p.set('key', query.key);
    if (query.stages) p.set('stages', query.stages);
    return `/c/${slug}/candidates?${p}`;
  };
  return (
    <section className="card min-w-0">
      <Link href={`/c/${slug}/dashboard`}>← Back to dashboard</Link>
      <h2 className="mt-4">Candidate records</h2>
      <p className="muted">
        DriverHub · {sourcePeriod(result.item)} · Filter: {query.kind}
        {query.key && <span> · {candidateFilterLabel(query.key)}</span>}
      </p>
      <p className="my-4 font-semibold" data-candidate-total={result.total}>
        {result.total.toLocaleString('en-US')} candidate records · Page{' '}
        {result.page} of {result.pageCount}
      </p>
      {result.item.status === 'superseded' && (
        <p className="notice mb-4">
          This is the historical snapshot used by your dashboard link. A newer
          snapshot is active; return to the dashboard for current data.
        </p>
      )}
      <TableScroll label="Candidate records table">
        <table>
          <caption>
            Snapshot rows stay distinct, including people with the same name. 25
            records per page.
          </caption>
          <thead>
            <tr>
              {[
                'Row',
                'Candidate',
                'Position',
                'Recruiting status',
                'App status',
                'Signed date',
                'Start date',
                'Rejection reason',
              ].map((label) => (
                <th scope="col" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.rowNo}</th>
                <td>
                  {row.firstName ?? 'Needs review'}{' '}
                  {row.lastName ?? 'Needs review'}
                </td>
                <td>{field(row, 'position', 'Position Opening')}</td>
                <td>
                  {field(row, 'recruitingStatus', 'App Recruiting Status')}
                </td>
                <td>{field(row, 'appStatus', 'App Status')}</td>
                <td>{field(row, 'signedDate', 'App Signed Date')}</td>
                <td>{field(row, 'startDate', 'Start Date')}</td>
                <td>{field(row, 'rejectionReason', 'App Rejection Reason')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {!result.rows.length && (
        <p className="notice mt-4">No candidates match this population.</p>
      )}
      <nav aria-label="Candidate pagination" className="mt-5 flex gap-5">
        {result.page > 1 && (
          <Link href={pageUrl(result.page - 1)}>Previous page</Link>
        )}
        {result.page < result.pageCount && (
          <Link href={pageUrl(result.page + 1)}>Next page</Link>
        )}
      </nav>
    </section>
  );
}
function candidateFilterLabel(key: string) {
  try {
    const [state, value] = JSON.parse(key);
    return state === 'review'
      ? 'Needs review'
      : state === 'missing'
        ? 'Not provided'
        : String(value);
  } catch {
    return 'Unknown group';
  }
}
function field(
  row: { ambiguousFields: string[]; values: Record<string, string[]> } & Record<
    string,
    unknown
  >,
  name: string,
  header: string,
) {
  if (row.ambiguousFields.includes(header))
    return (
      <span>
        Needs review
        <small className="muted block">{row.values[header]?.join(' / ')}</small>
      </span>
    );
  return String(row[name] ?? 'Not provided');
}
