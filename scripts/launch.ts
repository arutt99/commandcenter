import 'dotenv/config';
import { spawn } from 'node:child_process';
import { buildIsCurrent } from './build-state.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/server/db/connection';
import { acquireInstance } from '../src/server/local/instance';
import { dailyBackup } from '../src/server/local/backups';
import { localPaths, localPort } from '../src/server/local/paths';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const paths = localPaths(),
  port = localPort(),
  development = process.argv.includes('--dev');
if (!development && !(await buildIsCurrent()))
  throw new Error(
    'The local build is missing or out of date. Run npm run setup, or open the Start Wayfind launcher to rebuild it.',
  );
const release = await acquireInstance(paths.root);
try {
  const opened = await openDatabase(paths.root);
  opened.close();
  try {
    await dailyBackup(paths.root);
  } catch {
    console.error(
      'Automatic backup could not complete. Check Local data & backups in the app.',
    );
  }
  // The serving process acquires its own lifetime lock in instrumentation.
  await release();
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `Wayfind is local to this computer: ${url}\nData folder: ${paths.root}\nKeep this window open. Press Ctrl+C to stop the app.`,
  );
  const child = spawn(
    process.execPath,
    [
      path.join('node_modules', 'next', 'dist', 'bin', 'next'),
      development ? 'dev' : 'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        WAYFIND_DATA_DIR: paths.root,
        WAYFIND_PORT: String(port),
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  );
  let browserOpened = false;
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    if (!browserOpened && /Ready in/.test(String(chunk))) {
      browserOpened = true;
      if (!process.argv.includes('--no-open')) {
        const [command, args] =
          process.platform === 'win32'
            ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
            : process.platform === 'darwin'
              ? ['open', [url]]
              : ['xdg-open', [url]];
        const browser = spawn(command as string, args as string[], {
          stdio: 'ignore',
          detached: true,
        });
        browser.on('error', () => console.log(`Open ${url} in your browser.`));
        browser.unref();
      }
    }
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const stop = () => child.kill('SIGTERM');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const code = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 0));
  });
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  process.exitCode = code;
} finally {
  await release().catch(() => undefined);
}
