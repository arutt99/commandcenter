import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { getClient } from '@/server/clients';
import { ImportService } from '@/server/imports/service';
import { PendingButton } from '@/components/pending-button';
import { upload } from './actions';
export default async function Imports({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const actor = await requireUser();
  const { slug } = await params;
  const client = await getClient(slug);
  if (actor.role !== 'admin')
    return (
      <p className="notice">
        Only administrators can upload, preview, revert, or download imports.
      </p>
    );
  const history = await new ImportService().history(actor, client.id);
  const query = await searchParams;
  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Data workspace</p>
        <h2 className="text-2xl">Import client exports</h2>
        <p className="muted">
          Preview first. Confirm the dates. Each upload replaces the active data
          for its source.
        </p>
      </div>
      {query.error && (
        <p role="alert" className="notice error">
          {query.error}
        </p>
      )}
      {query.message && (
        <p role="status" className="notice">
          {query.message}
        </p>
      )}
      <section className="card">
        <h2>Upload an export</h2>
        <form action={upload.bind(null, slug)} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-3">
            <label>
              Client
              <input value={client.name} readOnly />
            </label>
            <label>
              Source
              <select name="source" defaultValue="auto">
                <option value="auto">Detect from file headers</option>
                <option value="meta">Meta ad sets</option>
                <option value="indeed">Indeed campaigns</option>
                <option value="driverhub">DriverHub candidates</option>
              </select>
            </label>
            <label>
              Export file
              <input
                name="file"
                type="file"
                accept=".csv,.xlsx"
                required
                aria-describedby="file-limits"
              />
            </label>
          </div>
          <p id="file-limits" className="muted text-sm">
            CSV or XLSX · maximum 10 MB and 50,000 rows. DriverHub requires a
            Data sheet. Original files remain private.
          </p>
          <PendingButton>Upload and preview</PendingButton>
        </form>
      </section>
      <section className="card p-0! overflow-hidden">
        <div className="p-6">
          <h2>Import history</h2>
          <p className="muted">
            One active import per source. Older confirmed imports can be
            restored.
          </p>
        </div>
        {!history.length ? (
          <p className="px-6 pb-6 muted">
            No imports yet. Upload your first export above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>File / source</th>
                  <th>Period or snapshot</th>
                  <th>Rows</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {history.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong className="block break-all">{i.fileName}</strong>
                      <span className="muted capitalize">{i.source}</span>
                    </td>
                    <td>
                      {i.snapshotDate ??
                        (i.periodStart
                          ? `${i.periodStart} – ${i.periodEnd}`
                          : 'Awaiting confirmation')}
                    </td>
                    <td>{i.rowCount.toLocaleString('en-US')}</td>
                    <td>
                      <span className="status">{i.status}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      {i.createdAt.toISOString().slice(0, 16).replace('T', ' ')}{' '}
                      UTC
                    </td>
                    <td>
                      <Link href={`/c/${slug}/imports/${i.id}`}>
                        Review import
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
