# Security And Privacy

## Threat Model

Protect account credentials, sessions, private verification files, business contact details, enquiry content, and administrator decisions from unauthenticated access, cross-account access, injection, abuse, accidental disclosure, and insecure deployment configuration.

Specific threats include credential stuffing/brute force, privilege escalation, SQL injection, cross-site scripting, CSRF/session theft, unsafe CORS, malicious or oversized uploads, enquiry spam, and secrets/personal data leaking through responses, logs, seeds, or Git.

## Authorization Matrix

| Resource/action | Public | Buyer | Seller | Admin |
| --- | --- | --- | --- | --- |
| Published approved-business listings | Read | Read | Read | Read |
| Nearby market and own saved location | No | Read/update own | No | No |
| Own enquiries | No | Read/create own | No | Only when operationally necessary |
| Business/listings | Read eligible public data | No mutation | Own only | Moderate with audit |
| Verification files | No | No | Submit/view own safe status | Authorized review only |
| Verification decision/admin roles/audit | No | No | No | Explicitly authorized |

## Controls

- Hash passwords with a maintained password-hashing library. Use random opaque session tokens; store only HMAC hashes keyed by the server secret, expire/revoke sessions, and use HttpOnly, Secure, SameSite=None cookies in production for a separately hosted client. State-changing requests require an allowlisted Origin. Local HTTP uses non-Secure SameSite=Lax cookies.
- Normalize email addresses and rely on a database uniqueness constraint. Do not treat email verification as active until a provider and verified sender are configured.
- Validate all request bodies, query strings, file metadata, and output schemas. Reject mass assignment and client-supplied privilege/verification state.
- Check role and resource ownership on every protected API operation; hide existence where appropriate.
- Use parameterized Drizzle queries and strict output shaping; never accept role, reviewer, ownership, or verified status from request bodies.
- Use security headers, a production CORS allowlist, CSRF defenses for cookie-authenticated mutations, and rate limits for login, registration, enquiry, and upload operations.
- Do not log passwords, cookies, tokens, private document URLs/bytes, full enquiry text, or unnecessary personal data.
- Validate file size, detected MIME, decoded image data, and storage access. Normalize listing images to bounded WebP; use private object storage with short-lived authorized reads for verification files. Never put private documents in public static assets or PostgreSQL.
- Public listings require both published listing state and approved business state.
- Nearby-market routes enforce the buyer role server-side and count only published, approved-business, active, in-stock, unexpired product listings. Market responses contain only counts and rounded distances; exact seller coordinates and buyer profile locations are never exposed to sellers or public listing responses.
- Device GPS remains in client session memory and is rounded to three decimals for HTTPS market requests; it is not saved server-side or written to logs. Buyer-selected saved area coordinates are stored only on that buyer's profile. Google Maps geocoding keys remain server-side; disclose Google processing in the privacy notice and use an agreement permitting this shared directory use.
- Add audit events for verification decisions, role changes, and listing moderation. Audit metadata is minimal and non-sensitive.
- Bootstrap only the first admin through the interactive hidden-password CLI. Public registration cannot select admin; operational role changes require an authorized, audited procedure.

## POPIA And Retention

Collect only information needed to operate the directory; explain purpose, access, retention, and deletion in a privacy notice. Restrict staff access and document incident response and retention periods. Obtain South African privacy/legal review; these controls do not guarantee legal compliance.

## Operational Security

Validate environment variables at startup; keep secrets in local ignored env files or hosting secret stores. Run dependency and lockfile checks before release. Enable Neon backups and rehearse restoration. Production requires HTTPS, secure cookies, a real CORS allowlist, private object storage, and monitoring without sensitive payloads.

## Release Checks

Test horizontal seller/buyer access control, admin denial for non-admin users, upload signature/size rejection, rate limits, and safe public response shaping. Search source, tracked files, logs, and final Git changes for credentials, private storage keys, tokens, hashes, or unnecessary personal data.