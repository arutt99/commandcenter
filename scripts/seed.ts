import 'dotenv/config';
import { getDb } from '../src/server/db';
import { clients, clientSettings } from '../src/server/db/schema';
async function main() {
  const db = getDb();
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
}
main()
  .then(() => {
    console.log('Two synthetic clients seeded.');
    process.exit(0);
  })
  .catch(() => {
    console.error('Seed failed. Check DATABASE_URL and run migrations.');
    process.exit(1);
  });
