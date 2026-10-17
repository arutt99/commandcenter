import Link from 'next/link';
import Decimal from 'decimal.js';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireLocal } from '@/server/local/context';
import { getClient } from '@/server/clients';
import { ImportService } from '@/server/imports/service';
import { PendingButton } from '@/components/pending-button';
import { mutate } from '../actions';
const labels: Record<string, string> = {
  rowCount: 'Rows',
  spend: 'Spend (USD)',
  impressions: 'Impressions',
  linkClicks: 'Link clicks',
  clicks: 'Clicks',
  applyStarts: 'Apply starts',
  applies: 'Applies',
  candidateCount: 'Candidate records',
  signedDates: 'Signed dates',
  startDates: 'Start dates',
  ambiguousRows: 'Rows needing review',
  ambiguousCells: 'Ambiguous cells',
};
export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireLocal();
  const { slug, id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await getClient(slug);

  const service = new ImportService();
  const item = await service.get(actor, client.id, id);
  const active = (await service.history(actor, client.id)).find(
    (i) => i.source === item.source && i.status === 'active',
  );
  const { error } = await searchParams;
  const summary = item.summary;
  const preview = item.status === 'preview';
  const draft = preview || item.status === 'failed';
  return (
    <div className="space-y-6">
      <Link href={`/c/${slug}/imports`}>← All imports</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            {item.source} / Import {draft ? 'preview' : 'history'}
          </p>
          <h2 className="mt-2 max-w-3xl break-all text-2xl">{item.fileName}</h2>
          <p className="muted">
            {item.rowCount.toLocaleString('en-US')} rows ·{' '}
            <span className="status">{item.status}</span>
          </p>
        </div>
        <a
          className="button secondary"
          href={`/c/${slug}/imports/${id}/download`}
        >
          Download original
        </a>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {summary.errors.length > 0 && (
        <section role="alert" className="notice error">
          <h2>Validation failed · {summary.errors.length} errors</h2>
          <p>
            No data from this file can be activated. The active import is
            unchanged.
          </p>
          <ul className="mt-3 list-disc pl-5">
            {summary.errors.slice(0, 100).map((e, n) => (
              <li key={n}>
                {e.row ? `Row ${e.row} · ` : ''}
                {e.column ? `${e.column}: ` : ''}
                {e.message}
              </li>
            ))}
          </ul>
          {summary.errors.length > 100 && (
            <p>
              Showing the first 100 errors. Fix the export and upload again.
            </p>
          )}
        </section>
      )}
      <section className="card">
        <h2>File totals</h2>
        {summary.errors.length ? (
          <p className="muted">
            Totals are unavailable until all validation errors are fixed.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {Object.entries(summary.totals).map(([key, value]) => (
              <div key={key}>
                <dt className="muted text-sm">{labels[key] ?? key}</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {value === null
                    ? 'Unavailable'
                    : key === 'spend'
                      ? `$${new Decimal(value).toFixed(2)}`
                      : typeof value === 'number'
                        ? value.toLocaleString('en-US')
                        : value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      {summary.warnings.length > 0 && (
        <section className="notice warning">
          <h2>Review notes · {summary.warnings.length}</h2>
          <ul className="list-disc pl-5">
            {summary.warnings.slice(0, 100).map((w, n) => (
              <li key={n}>
                {w.row ? `Row ${w.row} · ` : ''}
                {w.column ? `${w.column}: ` : ''}
                {w.message}
              </li>
            ))}
          </ul>
          {summary.warnings.length > 100 && (
            <p>
              Showing the first 100 notes. Download the original to review all
              rows.
            </p>
          )}
        </section>
      )}
      {draft && (
        <section className="notice">
          <h2>What this will replace</h2>
          {active ? (
            <p>
              The active {item.source} import <strong>{active.fileName}</strong>{' '}
              (
              {active.snapshotDate ??
                `${active.periodStart} – ${active.periodEnd}`}
              , {active.rowCount} rows) will be superseded and kept for revert.
            </p>
          ) : (
            <p>
              No active {item.source} import exists for {client.name}. This will
              be its first dataset.
            </p>
          )}
        </section>
      )}
      {preview && (
        <section className="card">
          <h2>Confirm dates and activate</h2>
          <form
            action={mutate.bind(null, slug, id, 'confirm')}
            className="space-y-5"
          >
            <input
              type="hidden"
              name="expectedActiveId"
              value={active?.id ?? ''}
            />
            {item.source === 'driverhub' ? (
              <label className="max-w-sm">
                Snapshot date
                <input
                  name="snapshotDate"
                  type="date"
                  defaultValue={summary.detectedSnapshot}
                  min={summary.detectedSnapshot}
                  required
                />
              </label>
            ) : (
              <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
                <label>
                  Reporting start
                  <input
                    name="periodStart"
                    type="date"
                    defaultValue={summary.detectedPeriod?.start}
                    readOnly={
                      item.source === 'meta' && !!summary.detectedPeriod
                    }
                    required
                  />
                </label>
                <label>
                  Reporting end
                  <input
                    name="periodEnd"
                    type="date"
                    defaultValue={summary.detectedPeriod?.end}
                    readOnly={
                      item.source === 'meta' && !!summary.detectedPeriod
                    }
                    required
                  />
                </label>
              </div>
            )}
            <label className="font-normal!">
              <input type="checkbox" name="confirmed" required />I confirm these{' '}
              {item.source === 'driverhub' ? 'snapshot' : 'reporting'} dates and
              have reviewed the warnings and replacement above.
            </label>
            <PendingButton>Confirm and activate</PendingButton>
          </form>
        </section>
      )}
      {!draft && (
        <section className="card">
          <h2>Confirmed metadata</h2>
          <p>
            {item.source === 'driverhub'
              ? `Snapshot: ${item.snapshotDate}`
              : `Reporting period: ${item.periodStart} – ${item.periodEnd}`}
          </p>
          {item.status === 'superseded' && (
            <form
              action={mutate.bind(null, slug, id, 'revert')}
              className="mt-5"
            >
              <PendingButton>Revert to this import</PendingButton>
            </form>
          )}
        </section>
      )}
      {draft && (
        <form action={mutate.bind(null, slug, id, 'cancel')}>
          <PendingButton className="secondary">
            Cancel and delete preview
          </PendingButton>
        </form>
      )}
    </div>
  );
}
