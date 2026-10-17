// Test-only Supabase HTTP fixture. Production auth code is unchanged and still
// validates sessions using auth.getUser(). This is not a live Supabase test.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { migrate } from '../scripts/migrate';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test'))
  throw new Error(
    'TEST_DATABASE_URL must be a disposable database ending in _test.',
  );
await migrate(databaseUrl);
const pool = new Pool({ connectionString: databaseUrl });
await pool.query('TRUNCATE users, clients, imports, audit_log CASCADE');
const adminId = '00000000-0000-4000-8000-000000000001';
const staffId = '00000000-0000-4000-8000-000000000002';
await pool.query(
  "INSERT INTO users(id, name, email, role) VALUES ($1,'Fixture Admin','admin@example.test','admin'),($2,'Fixture Staff','staff@example.test','staff')",
  [adminId, staffId],
);
await pool.query(
  "INSERT INTO clients(name,slug) VALUES ('Example Freight','example-freight'),('Sample Transport','sample-transport')",
);
await pool.end();
const userFor = (email: string) => ({
  id: email === 'staff@example.test' ? staffId : adminId,
  aud: 'authenticated',
  role: 'authenticated',
  email,
  email_confirmed_at: '2026-06-10T12:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-06-10T12:00:00Z',
});
const sessions = new Map<string, ReturnType<typeof userFor>>();
const auth = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url?.startsWith('/auth/v1/token') && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body) as { email: string; password: string };
    if (
      !['admin@example.test', 'staff@example.test'].includes(input.email) ||
      input.password !== 'synthetic-password'
    ) {
      response.writeHead(400);
      response.end(JSON.stringify({ message: 'Invalid credentials' }));
      return;
    }
    const user = userFor(input.email);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token =
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      ) +
      '.' +
      Buffer.from(
        JSON.stringify({
          sub: user.id,
          exp,
          aud: 'authenticated',
          role: 'authenticated',
          email: input.email,
        }),
      ).toString('base64url') +
      '.fixture';
    sessions.set(token, user);
    response.end(
      JSON.stringify({
        access_token: token,
        refresh_token: 'fixture-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: exp,
        user,
      }),
    );
    return;
  }
  if (request.url === '/auth/v1/user') {
    const user = sessions.get(
      (request.headers.authorization ?? '').replace(/^Bearer /, ''),
    );
    if (user) {
      response.end(JSON.stringify(user));
      return;
    }
  }
  if (request.url?.startsWith('/auth/v1/logout')) {
    response.end('{}');
    return;
  }
  response.writeHead(401);
  response.end(JSON.stringify({ message: 'Invalid fixture session' }));
});
auth.listen(54325, '127.0.0.1', () => {
  const app = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'start',
      '-p',
      '3001',
      '--hostname',
      '127.0.0.1',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54325',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key',
        PRIVATE_STORAGE_DIR: './test-results/private-files',
        FILE_STORAGE: 'disk',
        APP_URL: 'http://127.0.0.1:3001',
      },
    },
  );
  const stop = () => {
    app.kill('SIGTERM');
    auth.close();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  app.on('exit', (code) => {
    auth.close();
    process.exit(code ?? 0);
  });
});
