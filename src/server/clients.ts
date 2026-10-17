import 'server-only';
import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from './db';
import { clients } from './db/schema';
export async function getClient(slug: string) {
  const client = await getDb().query.clients.findFirst({
    where: and(eq(clients.slug, slug), eq(clients.active, true)),
  });
  if (!client) notFound();
  return client;
}
