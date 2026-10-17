import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from '../src/server/db/connection';
import { clients } from '../src/server/db/schema';
const root = path.resolve('test-results/local-e2e');
// Dedicated synthetic directory; never use the owner's configured data directory.
await rm(root, { recursive: true, force: true });
const opened = await openDatabase(root);
await opened.db.insert(clients).values([
  { name: 'Example Freight', slug: 'example-freight' },
  { name: 'Sample Transport', slug: 'sample-transport' },
]);
opened.close();
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'scripts/launch.ts', '--no-open'],
  {
    stdio: 'inherit',
    env: { ...process.env, WAYFIND_DATA_DIR: root, WAYFIND_PORT: '4311' },
  },
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
