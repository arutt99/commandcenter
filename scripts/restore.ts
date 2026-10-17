import 'dotenv/config';
import { acquireInstance } from '../src/server/local/instance';
import { restoreBackup } from '../src/server/local/backups';
import { localPaths } from '../src/server/local/paths';
const directory = process.argv[2];
if (!directory || !process.argv.includes('--confirm'))
  throw new Error(
    'Close Wayfind, then run: npm run restore -- "full backup folder path" --confirm. Current data is preserved before replacement.',
  );
const paths = localPaths(),
  release = await acquireInstance(paths.root);
try {
  await restoreBackup(directory, paths.root);
  console.log(
    'Backup restored. Run npm start to open Wayfind. Previous data was preserved.',
  );
} finally {
  await release();
}
