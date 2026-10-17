import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { lock } from 'proper-lockfile';
// Shared by the launcher and offline maintenance commands. Never run two app processes on one store.
export async function acquireInstance(root: string) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    return await lock(root, {
      realpath: true,
      lockfilePath: path.join(root, 'instance.lock'),
      stale: 120_000,
      update: 10_000,
      retries: 0,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED')
      throw new Error(
        'Wayfind is already running. Close its terminal window before starting another copy or restoring data. After an unexpected shutdown, wait two minutes and try again.',
      );
    throw error;
  }
}
