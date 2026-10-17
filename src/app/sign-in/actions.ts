'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { supabase } from '@/server/supabase';
import { getDb } from '@/server/db';
import { users } from '@/server/db/schema';
export async function signIn(form: FormData) {
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(form.get('password') ?? '');
  const auth = await supabase();
  const { error } = await auth.auth.signInWithPassword({ email, password });
  if (error)
    redirect(
      '/sign-in?error=Unable%20to%20sign%20in.%20Check%20your%20credentials%20and%20invitation.',
    );
  redirect('/');
}
export async function magicLink(form: FormData) {
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  const member = await getDb().query.users.findFirst({
    where: eq(users.email, email),
  });
  if (member?.active)
    await (
      await supabase()
    ).auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/auth/callback`,
      },
    });
  redirect(
    '/sign-in?message=If%20you%20have%20an%20active%20invitation%2C%20check%20your%20email%20for%20a%20sign-in%20link.',
  );
}
export async function signOut() {
  await (await supabase()).auth.signOut();
  redirect('/sign-in');
}
