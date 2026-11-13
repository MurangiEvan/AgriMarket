# API

Base path: `/api/v1`. JSON request/response bodies use UTF-8. Errors use `{ "error": { "code": "...", "message": "...", "details": [] } }`; details must not contain secrets or private records. Collection responses are bounded and paginated with `limit` and `cursor` (or an explicitly documented page scheme). OpenAPI source is `server/openapi.yaml`.

Browser authentication uses opaque server-side sessions in HttpOnly cookies. Tokens are HMAC-hashed with `SESSION_SECRET` in the database; production cookies use Secure/SameSite=None and local HTTP uses SameSite=Lax. Mutating cookie-authenticated requests require an allowlisted Origin. Role and ownership checks occur on the server. Password reset emails are sent through Brevo (`BREVO_API_KEY`, `MAIL_FROM_EMAIL`, optional `MAIL_FROM_NAME` and `PASSWORD_RESET_URL`); without a key in development the reset link is printed to the server console. Reset tokens are HMAC-hashed, single-use, expire after 30 minutes, and a successful reset revokes all of the user's sessions and writes a `user.password_reset` audit event. Email verification is not implemented.

## Endpoint Groups

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health/live` | Public | Process liveness |
| GET | `/health/ready` | Public | Database readiness, safe status only |
| POST | `/auth/register` | Public, rate-limited | Register buyer or seller; never accepts admin role |
| POST | `/auth/login` | Public, rate-limited | Start session |
| POST | `/auth/logout` | Signed in | Revoke own session |
| GET | `/auth/me` | Signed in | Current safe user/profile summary |
| POST | `/auth/password-reset/request` | Public, rate-limited | Email a reset link; same response whether or not the account exists |
| POST | `/auth/password-reset/confirm` | Public, rate-limited | Set a new password with a valid token; revokes all sessions |
| GET | `/categories` | Public | Active categories |
| GET | `/market/categories` | Buyer | Controlled categories with active produce types |
| GET | `/market/produce` | Buyer | Search category produce availability by radius; returns listing counts and rounded distances only |
| GET/PUT/DELETE | `/buyer/location` | Buyer | Read, save, or clear own saved area |
| GET | `/buyer/location/search` | Buyer | Search South African areas through the configured geocoder |
| GET | `/listings` | Public | Search/filter published, approved, active, in-stock, unexpired listings |
| GET | `/listings/:id` | Public | Safe listing and business detail; no separate business-profile route currently exists |
| GET/PUT | `/seller/business` | Seller | Read/update own business profile |
| GET | `/seller/produce-types` | Seller | List active produce types for listing entry |
| GET/POST | `/seller/listings` | Seller | List own listings; create a listing only once the business is approved (409 `BUSINESS_NOT_APPROVED` before) |
| PUT | `/seller/listings/:id` | Owning seller | Update own listing |
| POST | `/seller/listings/:id/images` | Owning seller | Upload up to five validated listing photos with alt text (approved businesses only) |
| POST | `/seller/application` | Seller | Submit the whole application in one multipart request: the saved business profile must be complete (name, 10+ character description, town, one contact method), plus `documents` (1–5 PDF/JPEG/PNG, 10 MB each), `photo` (one image, up to 25 MB; stored as a 1600 px WebP), `categoryId`, `produceTypeId` and optional `note`. Creates the verification submission and a pending listing with the photo together |
| GET | `/seller/verification` | Seller | Application status and history; document access remains private |
| POST | `/seller/verification` | Seller | Retired: returns 409 `APPLICATION_REQUIRED` (use `/seller/application`) |
| GET | `/seller/enquiries` | Seller | Inbox for own business |
| PATCH | `/seller/enquiries/:id` | Owning seller | Update allowed enquiry status |
| POST | `/enquiries` | Authenticated buyer | Submit bounded enquiry with idempotency protection |
| GET | `/enquiries/mine` | Authenticated buyer | View own enquiries |
| GET | `/admin/verifications` | Admin | Filtered review queue |
| POST | `/admin/verifications/:id/decision` | Admin | Approve/reject and audit decision |
| GET | `/admin/verifications/:id/documents/:index` | Admin | Read one private document with no-store headers and access audit |
| PATCH | `/admin/listings/:id/moderation` | Admin | Moderate listing and audit action |
| GET | `/admin/audit-logs` | Admin | Restricted audit access; optional filters `action` (prefix, e.g. `verification.`), `targetType`, `before` (ISO timestamp, for older pages) and `limit` (1–100) |
| GET/PUT | `/buyer/profile` | Buyer | Organisation name and type (retailer, hotel, restaurant, processor, exporter, municipality, government programme, school, commercial farm, informal trader, other); required before the first enquiry (409 `BUYER_PROFILE_REQUIRED`) |
| GET | `/listings?agriseta=true` | Public | Directory filtered to businesses an admin confirmed as AgriSETA-supported; listings and businesses include `agrisetaSupported` |
| GET | `/admin/exports/businesses.csv` | Admin | Verified businesses with contacts, offerings and AgriSETA status for CRM/partner import (audited) |
| GET | `/admin/exports/enquiries.csv` | Admin | Enquiry activity (seller, listing, category, buyer organisation and type, status); no message text or buyer email (audited) |
| GET | `/notifications` | Signed in | The user's own notifications (newest first, `limit` 1–50) and `unreadCount` |
| GET | `/notifications/unread-count` | Signed in | Unread count for the bell badge |
| POST | `/notifications/:id/read` | Signed in | Mark one of the user's own notifications as read (204) |
| POST | `/notifications/read-all` | Signed in | Mark all of the user's notifications as read (204) |
| GET | `/admin/overview` | Admin | Counts of verifications, businesses and listings by status, and active users by role |

Exact request/response schemas, implementation status, and generated OpenAPI must stay aligned. Use `400` for validation, `401` for missing identity, `403` for denied role/ownership, `404` for absent or inaccessible resources where disclosure is unsafe, `409` for conflicts, `429` for rate limits, and safe `5xx` responses.