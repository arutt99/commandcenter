import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getDb } from '../src/server/db';
import { users } from '../src/server/db/schema';
async function main() {
  const email = process.argv[2];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Usage: npm run create-admin -- email@example.com');
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await auth.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.APP_URL ?? 'http://localhost:3000'}/auth/callback`,
  });
  if (error || !data.user)
    throw new Error(
      'Supabase invitation failed. Check setup and whether this user already exists.',
    );
  await getDb()
    .insert(users)
    .values({
      id: data.user.id,
      email,
      name: email.split('@')[0],
      role: 'admin',
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { role: 'admin', active: true },
    });
  console.log('Administrator invited. Complete the invitation to sign in.');
}
main()
  .then(() => process.exit(0))
  .catch((e: Error) => {
    console.error(
      e.message.startsWith('Usage:')
        ? e.message
        : 'Admin setup failed; verify Supabase and database configuration.',
    );
    process.exit(1);
  });
