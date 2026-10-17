import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { requireLocal } from '@/server/local/context';
import { getDb } from '@/server/db';
import { clients } from '@/server/db/schema';
export default async function Home() {
  await requireLocal();
  const list = await getDb()
    .select()
    .from(clients)
    .where(eq(clients.active, true));
  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between gap-6">
        <p className="eyebrow">Wayfind / Command Center</p>
        <Link href="/local">Local data & backups</Link>
      </div>
      <h1>Your clients</h1>
      {
        <p className="mb-4">
          <Link href="/admin">Manage clients</Link>
        </p>
      }
      <p className="muted mb-8">
        Your data stays on this computer. Open a client to manage their
        reporting exports.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {list.map((c) => (
          <Link
            className="card no-underline hover:border-teal"
            key={c.id}
            href={`/c/${c.slug}/dashboard`}
          >
            <p className="eyebrow">{c.brandName}</p>
            <h2>{c.name}</h2>
            <p className="muted">Open command center →</p>
          </Link>
        ))}
      </div>
      {!list.length && (
        <p className="card">
          No clients yet. Choose Manage clients to add your first client.
        </p>
      )}
    </main>
  );
}
