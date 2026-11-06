import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrevoMailer } from './mailer.js';

test('Brevo mailer sends the reset link from the configured sender', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ messageId: 'test' }), { status: 201 });
  }) as typeof fetch;
  const mailer = createBrevoMailer({ apiKey: 'test-key', fromEmail: 'no-reply@example.test', fromName: 'AgriMarket' }, fakeFetch);

  await mailer.sendPasswordReset('seller@example.test', 'https://app.example.test/reset-password?token=abc&x="1"');

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal((calls[0]!.init.headers as Record<string, string>)['api-key'], 'test-key');
  const body = JSON.parse(String(calls[0]!.init.body)) as {
    sender: { email: string };
    to: { email: string }[];
    htmlContent: string;
    textContent: string;
  };
  assert.equal(body.sender.email, 'no-reply@example.test');
  assert.deepEqual(body.to, [{ email: 'seller@example.test' }]);
  assert.ok(body.textContent.includes('https://app.example.test/reset-password?token=abc'));
  assert.equal(body.htmlContent.includes('"1"'), false);
});

test('Brevo mailer reports rejected sends', async () => {
  const fakeFetch = (async () => new Response('{"message":"unauthorized"}', { status: 401 })) as typeof fetch;
  const mailer = createBrevoMailer({ apiKey: 'bad', fromEmail: 'no-reply@example.test', fromName: 'AgriMarket' }, fakeFetch);
  await assert.rejects(() => mailer.sendPasswordReset('seller@example.test', 'https://app.example.test/reset-password?token=abc'), /HTTP 401/);
});
