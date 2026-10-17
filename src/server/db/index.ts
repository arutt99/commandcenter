import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
let connection: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function getDb() {
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is not configured.');
  return (connection ??= drizzle(
    new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }),
    { schema },
  ));
}
export type Database = ReturnType<typeof getDb>;
