import { hash } from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { loadEnvironment } from '../config.js';
import { createDatabase } from './client.js';
import { auditLogs, users } from './schema.js';

const email = z.email().parse(process.argv[2]).trim().toLowerCase();
if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  throw new Error('Run this command in an interactive terminal so the admin password can be entered without echo.');
}

const password = await readHidden('First administrator password (16+ characters): ');
if (password.length < 16) throw new Error('Use at least 16 characters for the first administrator password.');

const environment = loadEnvironment();
const { db, pool } = createDatabase(environment.DATABASE_URL);

try {
  await db.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(7419032201)`);
    const [existingAdmin] = await transaction.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
    if (existingAdmin) throw new Error('An administrator already exists. Use the existing protected admin workflow.');

    const [admin] = await transaction
      .insert(users)
      .values({ email, passwordHash: await hash(password, 12), role: 'admin' })
      .returning({ id: users.id });
    if (!admin) throw new Error('The administrator account could not be created.');
    await transaction.insert(auditLogs).values({
      actorId: admin.id,
      action: 'user.admin_bootstrap',
      targetType: 'user',
      targetId: admin.id,
      metadata: { method: 'interactive_cli' },
    });
  });
  console.info('First administrator account created. Sign in through the AgriMarket web app.');
} finally {
  await pool.end();
}

function readHidden(prompt: string): Promise<string> {
  const input = process.stdin;
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    const restore = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      process.stdout.write('\n');
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          restore();
          reject(new Error('Password input cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          restore();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    input.on('data', onData);
  });
}