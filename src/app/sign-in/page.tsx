import { signIn, magicLink } from './actions';
import { PendingButton } from '@/components/pending-button';
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <p className="eyebrow">Wayfind / Command Center</p>
      <h1>Welcome back.</h1>
      <p className="muted mb-8">
        Sign in with your staff invitation to access client reporting.
      </p>
      {error && (
        <p role="alert" className="notice error mb-6">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice mb-6">
          {message}
        </p>
      )}
      <form action={signIn} className="card space-y-5">
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <PendingButton>Sign in</PendingButton>
      </form>
      <details className="card mt-5">
        <summary>Use an email sign-in link</summary>
        <form action={magicLink} className="mt-5 space-y-4">
          <label>
            Invited email
            <input name="email" type="email" required />
          </label>
          <PendingButton>Send sign-in link</PendingButton>
        </form>
      </details>
      <p className="muted mt-6 text-sm">
        Invite only. Contact your administrator for access.
      </p>
    </main>
  );
}
