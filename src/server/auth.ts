import 'server-only';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from './db';
import { users } from './db/schema';
import { supabase } from './supabase';
import { assertAdmin } from './permissions';
export async function requireUser() {
  const {
    data: { user },
    error,
  } = await (await supabase()).auth.getUser();
  if (error || !user) redirect('/sign-in');
  const member = await getDb().query.users.findFirst({
    where: eq(users.id, user.id),
  });
  if (!member?.active)
    redirect(
      '/sign-in?error=Access%20requires%20an%20active%20staff%20invitation.',
    );
  return member;
}
export async function requireAdmin() {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}
