import { openDatabase } from './connection';
import { localPaths } from '../local/paths';
const state = globalThis as typeof globalThis & {
  wayfindDatabase?: Promise<Awaited<ReturnType<typeof openDatabase>>>;
  wayfindDb?: Awaited<ReturnType<typeof openDatabase>>['db'];
};
export async function initializeStore() {
  try {
    const opened = await (state.wayfindDatabase ??= openDatabase(
      localPaths().root,
    ));
    state.wayfindDb = opened.db;
  } catch (error) {
    state.wayfindDatabase = undefined;
    throw error;
  }
}
export function getDb() {
  if (!state.wayfindDb)
    throw new Error(
      'The local database has not been initialized. Start the app using npm start.',
    );
  return state.wayfindDb;
}
export type { Database } from './connection';
