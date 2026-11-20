import type { Environment } from './config.js';

export type Mailer = {
  sendPasswordReset(to: string, resetUrl: string): Promise<void>;
  // Confirms an approved deletion request. Sent to the address the account had before it was wiped.
  sendAccountDeleted(to: string): Promise<void>;
};

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

export function createMailer(environment: Environment, fetchImpl: typeof fetch = fetch): Mailer {
  if (environment.BREVO_API_KEY && environment.MAIL_FROM_EMAIL) {
    return createBrevoMailer(
      { apiKey: environment.BREVO_API_KEY, fromEmail: environment.MAIL_FROM_EMAIL, fromName: environment.MAIL_FROM_NAME },
      fetchImpl,
    );
  }

  // Local development without Brevo: print the link so the flow can still be tested.
  return {
    async sendPasswordReset(to, resetUrl) {
      if (environment.NODE_ENV === 'production') throw new Error('Email delivery is not configured.');
      if (environment.NODE_ENV === 'development') console.info(`[mail disabled] Password reset link for ${to}: ${resetUrl}`);
    },
    async sendAccountDeleted(to) {
      // A deletion must still go through when email is not configured; the admin sees it in the audit log.
      if (environment.NODE_ENV === 'development') console.info(`[mail disabled] Account deleted confirmation for ${to}`);
    },
  };
}

export function createBrevoMailer(
  options: { apiKey: string; fromEmail: string; fromName: string },
  fetchImpl: typeof fetch = fetch,
): Mailer {
  async function send(to: string, subject: string, htmlContent: string, textContent: string) {
    const response = await fetchImpl(BREVO_SEND_URL, {
      method: 'POST',
      headers: { 'api-key': options.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: options.fromEmail, name: options.fromName },
        to: [{ email: to }],
        subject,
        htmlContent,
        textContent,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Brevo rejected the email (HTTP ${response.status}): ${detail.slice(0, 300)}`);
    }
  }

  return {
    async sendPasswordReset(to, resetUrl) {
      await send(to, 'Reset your AgriMarket password', passwordResetHtml(resetUrl), passwordResetText(resetUrl));
    },
    async sendAccountDeleted(to) {
      await send(to, 'Your AgriMarket account has been deleted', accountDeletedHtml(), ACCOUNT_DELETED_TEXT);
    },
  };
}

const ACCOUNT_DELETED_TEXT = [
  'Your request to delete your AgriMarket account has been approved.',
  '',
  'Your name, email address, password, location, business contact details, documents and photos have been removed, and your listings are no longer visible.',
  'Messages you exchanged with other businesses stay with them, marked as from a deleted user.',
  '',
  'You can create a new account at any time.',
].join('\n');

function accountDeletedHtml() {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f5ed;font-family:Arial,sans-serif;color:#183f32">
<div style="max-width:480px;margin:0 auto;padding:28px;border-radius:16px;background:#ffffff">
<p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:2px;color:#235946">AGRIMARKET</p>
<h1 style="margin:0 0 16px;font-size:24px">Your account has been deleted</h1>
<p style="font-size:15px;line-height:22px;color:#40554a">Your request to delete your AgriMarket account has been approved.</p>
<p style="font-size:15px;line-height:22px;color:#40554a">Your name, email address, password, location, business contact details, documents and photos have been removed, and your listings are no longer visible. Messages you exchanged with other businesses stay with them, marked as from a deleted user.</p>
<p style="font-size:13px;line-height:19px;color:#526259">You can create a new account at any time.</p>
</div></body></html>`;
}

function passwordResetText(resetUrl: string) {
  return [
    'We received a request to reset your AgriMarket password.',
    '',
    `Open this link to choose a new password (valid for 30 minutes): ${resetUrl}`,
    '',
    'If you did not ask for this, you can ignore this email. Your password will not change.',
  ].join('\n');
}

function passwordResetHtml(resetUrl: string) {
  const safeUrl = escapeHtml(resetUrl);
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f5ed;font-family:Arial,sans-serif;color:#183f32">
<div style="max-width:480px;margin:0 auto;padding:28px;border-radius:16px;background:#ffffff">
<p style="margin:0 0 8px;font-size:12px;font-weight:bold;letter-spacing:2px;color:#235946">AGRIMARKET</p>
<h1 style="margin:0 0 16px;font-size:24px">Reset your password</h1>
<p style="font-size:15px;line-height:22px;color:#40554a">We received a request to reset your AgriMarket password. This link is valid for 30 minutes and can be used once.</p>
<p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:9px;background:#235946;color:#ffffff;font-weight:bold;text-decoration:none">Choose a new password</a></p>
<p style="font-size:13px;line-height:19px;color:#526259">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${safeUrl}</span></p>
<p style="font-size:13px;line-height:19px;color:#526259">If you did not ask for this, ignore this email. Your password will not change.</p>
</div></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}
