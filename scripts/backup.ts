import 'dotenv/config';
import { acquireInstance } from '../src/server/local/instance';
import { createBackup } from '../src/server/local/backups';
import { localPaths } from '../src/server/local/paths';
const paths = localPaths(),
  release = await acquireInstance(paths.root);
try {
  console.log(`Backup created: ${await createBackup(paths.root)}`);
} finally {
  await release();
}
