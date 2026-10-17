import Link from 'next/link';
import { requireLocal } from '@/server/local/context';
import { getDb } from '@/server/db';
import { clients } from '@/server/db/schema';
import { PendingButton } from '@/components/pending-button';
import { saveClient } from './actions';
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  await requireLocal();
  const list = await getDb().select().from(clients);
  const query = await searchParams;
  function fields(client?: typeof clients.$inferSelect) {
    return (
      <>
        <input type="hidden" name="id" value={client?.id ?? ''} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Name
            <input
              name="name"
              defaultValue={client?.name}
              required
              maxLength={120}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              defaultValue={client?.slug}
              placeholder="example-freight"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
              maxLength={100}
            />
          </label>
          <label>
            Brand
            <input
              name="brandName"
              defaultValue={client?.brandName ?? 'Wayfind'}
              required
            />
          </label>
          <label>
            Timezone
            <input
              name="timezone"
              defaultValue={client?.timezone ?? 'America/New_York'}
              required
            />
          </label>
        </div>
        <PendingButton>Save client</PendingButton>
      </>
    );
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <Link href="/">← Clients</Link>
      <h1>Manage clients</h1>
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
        <h2>Add a client</h2>
        <form action={saveClient} className="space-y-4">
          {fields()}
        </form>
      </section>
      {list.map((client) => (
        <details className="card" key={client.id}>
          <summary>Edit {client.name}</summary>
          <form className="mt-5 space-y-4" action={saveClient}>
            {fields(client)}
          </form>
        </details>
      ))}
    </main>
  );
}
