import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { loadEnvironment } from '../config.js';
import { createDatabase } from './client.js';

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
} finally {
  await pool.end();
}