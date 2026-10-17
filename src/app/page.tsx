import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { clients } from '@/server/db/schema';
import { signOut } from './sign-in/actions';
export default async function Home() {
  const user = await requireUser();
  const list = await getDb()
    .select()
    .from(clients)
    .where(eq(clients.active, true));
  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between gap-6">
        <p className="eyebrow">Wayfind / Command Center</p>
        <form action={signOut}>
          <button className="secondary">Sign out</button>
        </form>
      </div>
      <h1>Your clients</h1>
      {user.role === 'admin' && (
        <p className="mb-4">
          <Link href="/admin">Manage clients</Link>
        </p>
      )}
      <p className="muted mb-8">
        Welcome, {user.name}. Open a client to manage their reporting exports.
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
          No clients yet. Run the synthetic seed script or add a client to the
          database.
        </p>
      )}
    </main>
  );
}
