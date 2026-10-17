import { requireUser } from '@/server/auth';
import { getClient } from '@/server/clients';
import { getDb } from '@/server/db';
import { clientSettings } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { stageSettings } from '@/server/reporting/metrics';
import { saveStages } from './actions';
export default async function Settings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const user = await requireUser();
  const client = await getClient((await params).slug);
  const saved = await getDb().query.clientSettings.findFirst({
    where: eq(clientSettings.clientId, client.id),
  });
  const stages = stageSettings(
    (saved?.settings as { stages?: unknown } | undefined)?.stages,
  );
  const query = await searchParams;
  return (
    <section className="card">
      <h2>Client settings</h2>
      <dl className="space-y-2">
        <div>
          <dt className="muted">Timezone</dt>
          <dd>{client.timezone}</dd>
        </div>
        <div>
          <dt className="muted">Brand</dt>
          <dd>{client.brandName}</dd>
        </div>
      </dl>
      {query.error && (
        <p role="alert" className="notice error mt-5">
          {query.error}
        </p>
      )}
      {query.message && (
        <p role="status" className="notice mt-5">
          {query.message}
        </p>
      )}
      <h2 className="mt-7">Recruiting stage mapping</h2>
      <p className="muted mb-4">
        Provisional definitions. Enter exact recruiting statuses, one per line.
        Signed dates, start dates and application outcomes remain separate
        rules. Referral-source mapping and alerts arrive in Phase 4.
      </p>
      {user.role === 'admin' ? (
        <form
          action={saveStages.bind(null, client.slug)}
          className="max-w-xl space-y-4"
        >
          <label>
            Interview statuses
            <textarea
              name="interviewStatuses"
              rows={3}
              defaultValue={stages.interviewStatuses.join('\n')}
              required
              maxLength={2420}
            />
          </label>
          <label>
            Onboarding statuses
            <textarea
              name="onboardingStatuses"
              rows={3}
              defaultValue={stages.onboardingStatuses.join('\n')}
              required
              maxLength={2420}
            />
          </label>
          <button>Save stage mapping</button>
        </form>
      ) : (
        <dl>
          <dt className="muted">Interview stage</dt>
          <dd>{stages.interviewStatuses.join(', ')}</dd>
          <dt className="muted mt-3">Onboarding</dt>
          <dd>{stages.onboardingStatuses.join(', ')}</dd>
        </dl>
      )}
    </section>
  );
}
