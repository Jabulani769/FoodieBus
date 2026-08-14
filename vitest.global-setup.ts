import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.test', override: false });
process.env.NODE_ENV = 'test';

const { Client } = pg;

function maintenanceConnectionUrl(): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.search = '';
  url.pathname = '/postgres';
  return url.toString();
}

function targetDatabaseName(): string {
  const url = new URL(process.env.DATABASE_URL!);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
}

async function ensureDatabaseExists(): Promise<void> {
  const client = new Client({ connectionString: maintenanceConnectionUrl() });
  try {
    await client.connect();
    const dbName = targetDatabaseName();
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);
    if (!rowCount) {
      const escaped = dbName.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${escaped}"`);
      console.log(`[test-setup] Created test database "${dbName}"`);
    }
  } finally {
    await client.end();
  }
}

export default async function setup(): Promise<void> {
  await ensureDatabaseExists();
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('[test-setup] Test database is migrated and ready');
}
