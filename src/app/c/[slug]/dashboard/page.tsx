import { requireUser } from '@/server/auth';
import { getClient } from '@/server/clients';
export default async function Dashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  await getClient((await params).slug);
  return (
    <>
      <h2>Reporting dashboard</h2>
      <p className="muted mb-6">
        Dashboard calculations arrive in Phase 3. Uploaded data can be reviewed
        in Imports.
      </p>
      <div className="grid gap-5 md:grid-cols-3">
        {[
          ['Recruiting snapshot', 'DriverHub candidate export'],
          ['Meta performance', 'Meta ad sets CSV'],
          ['Indeed performance', 'Indeed Jobs Campaigns CSV'],
        ].map(([title, file]) => (
          <section className="card" key={title}>
            <h2>{title}</h2>
            <p className="muted">
              Upload a {file} in Imports to prepare this section for Phase 3.
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
