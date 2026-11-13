import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { loadEnvironment } from '../config.js';
import { seedCategories } from './catalog.js';
import { createDatabase } from './client.js';

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  // Keep the controlled category list current on every deploy (adds new categories such as
  // drone services; never deletes anything).
  await seedCategories(db);
} finally {
  await pool.end();
}
