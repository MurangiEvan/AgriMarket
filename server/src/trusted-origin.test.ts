import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';

import { HttpError } from './http.js';
import { requireTrustedOrigin } from './middleware/auth.js';

test('native mutations without an Origin header pass while untrusted browser origins do not', async () => {
  const app = express();
  app.use(requireTrustedOrigin(new Set(['https://app.example.test'])));
  app.post('/mutate', (_request, response) => response.status(204).end());
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(error instanceof HttpError ? error.status : 500).end();
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/mutate`;

  try {
    const native = await fetch(url, { method: 'POST', headers: { 'X-AgriMarket-Client': 'native' } });
    assert.equal(native.status, 204);
    const unmarked = await fetch(url, { method: 'POST' });
    assert.equal(unmarked.status, 403);
    const spoofedOrigin = await fetch(url, {
      method: 'POST',
      headers: { Origin: 'https://attacker.example.test', 'X-AgriMarket-Client': 'native' },
    });
    assert.equal(spoofedOrigin.status, 403);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
