import { acquireInstance } from './instance';
import { localPaths } from './paths';
import { initializeStore } from '../db';
import { startLocalMaintenance } from './maintenance';
const state = globalThis as typeof globalThis & {
  wayfindRuntime?: Promise<void>;
};
export function startRuntime() {
  return (state.wayfindRuntime ??= (async () => {
    // The actual serving process owns the lock, so a crashed launcher cannot leave an unlocked server.
    await acquireInstance(localPaths().root);
    await initializeStore();
    startLocalMaintenance();
  })());
}
