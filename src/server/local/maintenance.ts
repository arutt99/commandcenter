import { dailyBackup } from './backups';
const state = globalThis as typeof globalThis & {
  wayfindMaintenance?: ReturnType<typeof setInterval>;
};
export function startLocalMaintenance() {
  if (state.wayfindMaintenance) return;
  state.wayfindMaintenance = setInterval(
    () => {
      dailyBackup().catch(() =>
        console.error(
          'Wayfind automatic backup failed. Check Local data & backups.',
        ),
      );
    },
    60 * 60 * 1000,
  );
  state.wayfindMaintenance.unref();
}
