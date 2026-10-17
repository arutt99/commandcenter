import Link from 'next/link';
import { requireLocal } from '@/server/local/context';
import { listBackups } from '@/server/local/backups';
import { localPaths } from '@/server/local/paths';
import { PendingButton } from '@/components/pending-button';
import { backupNow } from './actions';
export default async function LocalData({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  await requireLocal();
  const paths = localPaths(),
    backups = await listBackups(),
    query = await searchParams;
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <Link href="/">← Clients</Link>
      <p className="eyebrow">On this computer</p>
      <h1>Local data & backups</h1>
      {query.message && (
        <p className="notice" role="status">
          {query.message}
        </p>
      )}
      {query.error && (
        <p className="notice error" role="alert">
          {query.error}
        </p>
      )}
      <section className="card">
        <h2>Your private workspace</h2>
        <p>
          No dashboard account or password is needed. Clients, reports and
          original files are stored on this computer. Protect them with your
          computer login and screen lock.
        </p>
        <p className="muted mt-3 break-all">Data folder: {paths.root}</p>
      </section>
      <section className="card space-y-4">
        <h2>Back up your work</h2>
        <p>
          A backup contains your clients, settings, reports and original
          uploads. The app keeps seven daily automatic backups while it is
          running; manual backups are kept until you remove them.
        </p>
        <p>
          Copy backup folders to an external drive. Backups on the same computer
          do not protect against losing that computer.
        </p>
        <p className="muted break-all">Backup folder: {paths.backups}</p>
        <form action={backupNow}>
          <PendingButton>Create backup now</PendingButton>
        </form>
        {!backups.length ? (
          <p>No backups yet.</p>
        ) : (
          <ul className="space-y-2">
            {backups.slice(0, 10).map((backup) => (
              <li key={backup.name}>
                <strong>
                  {backup.manifest.kind === 'automatic'
                    ? 'Automatic'
                    : backup.manifest.kind === 'pre-restore'
                      ? 'Before restore'
                      : 'Manual'}
                </strong>{' '}
                ·{' '}
                <time dateTime={backup.manifest.createdAt}>
                  {backup.manifest.createdAt}
                </time>
                <small className="muted block break-all">{backup.name}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card space-y-3">
        <h2>Restore a backup</h2>
        <p>
          Close the app’s terminal window first. Ask your setup helper to run
          this command from the app folder, using the full path to your saved
          backup folder:
        </p>
        <pre>{'npm run restore -- "full backup folder path" --confirm'}</pre>
        <p>
          The restore checks the backup and all original files before replacing
          anything. Your previous data is preserved. Open Wayfind again
          afterward.
        </p>
      </section>
      <section className="card">
        <h2>Automatic source connections</h2>
        <p>
          Uploads work offline. Meta, Indeed, DriverHub and other automatic
          connections can be added later when provider access is available.
          Connecting a provider will still require its permission and an
          internet connection; refreshes will run while the app and computer are
          on.
        </p>
      </section>
    </main>
  );
}
