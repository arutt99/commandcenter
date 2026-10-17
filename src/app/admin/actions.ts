'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/server/auth';
import { getDb } from '@/server/db';
import { auditLog, clients, clientSettings, users } from '@/server/db/schema';
const clientInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  brandName: z.string().trim().min(1).max(120),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }),
});
export async function saveClient(form: FormData) {
  const actor = await requireAdmin();
  const parsed = clientInput.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    redirect(
      '/admin?error=Enter%20a%20name%2C%20URL%20slug%2C%20brand%2C%20and%20valid%20timezone.',
    );
  const id = String(form.get('id') ?? '');
  if (id && !z.uuid().safeParse(id).success)
    redirect('/admin?error=Invalid%20client.');
  let failed = false;
  try {
    await getDb().transaction(async (tx) => {
      const [client] = id
        ? await tx
            .update(clients)
            .set(parsed.data)
            .where(eq(clients.id, id))
            .returning()
        : await tx.insert(clients).values(parsed.data).returning();
      if (!client) throw new Error('Client is unavailable.');
      await tx
        .insert(clientSettings)
        .values({ clientId: client.id })
        .onConflictDoNothing();
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: id ? 'client.update' : 'client.create',
        object: client.id,
      });
    });
  } catch {
    failed = true;
  }
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/c', 'layout');
  redirect(
    failed
      ? '/admin?error=Unable%20to%20save.%20The%20slug%20must%20be%20unique.'
      : '/admin?message=Client%20saved.',
  );
}

export async function inviteUser(form: FormData) {
  const actor = await requireAdmin();
  const input = z
    .object({
      email: z.email().transform((s) => s.toLowerCase()),
      name: z.string().trim().min(1).max(120),
      role: z.enum(['admin', 'staff']),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    redirect('/admin?error=Enter%20a%20valid%20name%2C%20email%20and%20role.');
  let failed = false;
  try {
    const auth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await auth.auth.admin.inviteUserByEmail(
      input.data.email,
      {
        redirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/auth/callback`,
      },
    );
    if (error || !data.user) throw new Error('Invitation failed.');
    await getDb().transaction(async (tx) => {
      await tx.insert(users).values({ ...input.data, id: data.user!.id });
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: 'user.invite',
        object: data.user!.id,
      });
    });
  } catch {
    failed = true;
  }
  redirect(
    failed
      ? '/admin?error=Invitation%20could%20not%20complete.%20Verify%20Supabase%20setup%20and%20whether%20the%20user%20already%20exists.'
      : '/admin?message=User%20invited.',
  );
}
