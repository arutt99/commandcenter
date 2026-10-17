import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { buildFingerprint } from './build-state.mjs';
const fingerprint = await buildFingerprint();
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build'],
  { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
);
const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('exit', (code) => resolve(code ?? 1));
});
if (code === 0)
  await writeFile(
    '.next/wayfind-build.json',
    JSON.stringify({
      fingerprint,
      nodeMajor: process.versions.node.split('.')[0],
    }),
  );
process.exitCode = Number(code);
