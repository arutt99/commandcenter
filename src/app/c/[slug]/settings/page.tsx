import { requireUser } from '@/server/auth';
import { getClient } from '@/server/clients';
export default async function Settings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const client = await getClient((await params).slug);
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
      <p className="muted mt-5">
        Source mapping and reporting settings will be added with dashboard
        metrics.
      </p>
    </section>
  );
}
