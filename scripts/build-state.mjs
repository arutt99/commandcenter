import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
export async function buildFingerprint() {
  const hash = createHash('sha256');
  async function add(file) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  async function directory(root) {
    for (const entry of (await readdir(root, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    )) {
      const file = path.join(root, entry.name);
      if (entry.isDirectory()) await directory(file);
      else if (entry.isFile()) await add(file);
    }
  }
  for (const root of ['src', 'drizzle/local']) await directory(root);
  for (const file of [
    'package.json',
    'package-lock.json',
    'next.config.ts',
    'postcss.config.mjs',
  ])
    await add(file);
  return hash.digest('hex');
}
export async function buildIsCurrent() {
  try {
    const stamp = JSON.parse(
      await readFile('.next/wayfind-build.json', 'utf8'),
    );
    return (
      stamp.fingerprint === (await buildFingerprint()) &&
      stamp.nodeMajor === process.versions.node.split('.')[0]
    );
  } catch {
    return false;
  }
}
