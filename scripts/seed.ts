import 'dotenv/config';
import { openDatabase } from '../src/server/db/connection';
import { localPaths } from '../src/server/local/paths';
import { acquireInstance } from '../src/server/local/instance';
import { clients, clientSettings } from '../src/server/db/schema';
async function main() {
  const root = localPaths().root,
    release = await acquireInstance(root);
  try {
    const opened = await openDatabase(root);
    try {
      const db = opened.db;
      for (const [name, slug] of [
        ['Example Freight', 'example-freight'],
        ['Sample Transport', 'sample-transport'],
      ]) {
        const [client] = await db
          .insert(clients)
          .values({ name, slug })
          .onConflictDoUpdate({ target: clients.slug, set: { name } })
          .returning();
        await db
          .insert(clientSettings)
          .values({ clientId: client.id })
          .onConflictDoNothing();
      }
    } finally {
      opened.close();
    }
  } finally {
    await release();
  }
}
main()
  .then(() => {
    console.log('Two synthetic clients seeded.');
    process.exit(0);
  })
  .catch(() => {
    console.error('Seed failed. Check the local data folder.');
    process.exit(1);
  });
