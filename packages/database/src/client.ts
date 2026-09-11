import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

let client: postgres.Sql | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabase(connectionString?: string) {
  if (dbInstance) return dbInstance;

  const url = connectionString || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const maxConnections = parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20', 10);

  client = postgres(url, {
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {}, // Suppress notice noise in production
  });

  dbInstance = drizzle(client, { schema });
  return dbInstance;
}

export async function closeDatabase() {
  if (client) {
    await client.end();
    client = null;
    dbInstance = null;
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const db = getDatabase();
    await db.execute(postgres`SELECT 1`);
    return true;
  } catch (err) {
    console.error('[DB Health] Failed to ping database:', err);
    return false;
  }
}
