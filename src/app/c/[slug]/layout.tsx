import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/server/auth';
import { getClient } from '@/server/clients';
import { getDb } from '@/server/db';
import { clients } from '@/server/db/schema';
import { ClientSwitcher } from '@/components/client-switcher';
import { signOut } from '@/app/sign-in/actions';
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const client = await getClient(slug);
  const list = await getDb()
    .select({ name: clients.name, slug: clients.slug })
    .from(clients)
    .where(eq(clients.active, true));
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-6 py-5">
          <Link className="no-underline" href="/">
            <p className="eyebrow">{client.brandName}</p>
            <strong className="text-lg text-ink">Command Center</strong>
          </Link>
          <div className="flex items-center gap-6">
            <ClientSwitcher current={slug} clients={list} />
            <span className="muted hidden text-sm sm:block">
              {user.name} · {user.role}
            </span>
            <form action={signOut}>
              <button className="secondary">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <p className="eyebrow">Client workspace</p>
        <h1>{client.name}</h1>
        <nav
          aria-label="Client pages"
          className="mb-8 flex gap-6 border-b border-slate-200 py-4"
        >
          {['dashboard', 'imports', 'settings'].map((p) => (
            <Link
              key={p}
              href={`/c/${slug}/${p}`}
              className="font-semibold capitalize"
            >
              {p[0].toUpperCase() + p.slice(1)}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </>
  );
}
