import { loadEnvironment } from '../config.js';
import { seedCategories } from './catalog.js';
import { createDatabase } from './client.js';

const { db, pool } = createDatabase(loadEnvironment().DATABASE_URL);

try {
  await seedCategories(db);
} finally {
  await pool.end();
}
