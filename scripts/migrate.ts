import 'dotenv/config';
import { openDatabase } from '../src/server/db/connection';
import { localPaths } from '../src/server/local/paths';
import { acquireInstance } from '../src/server/local/instance';
const root = localPaths().root,
  release = await acquireInstance(root);
try {
  const opened = await openDatabase(root);
  opened.close();
  console.log('Local database is ready.');
} finally {
  await release();
}
