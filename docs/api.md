# API

Base path: `/api/v1`. JSON request/response bodies use UTF-8. Errors use `{ "error": { "code": "...", "message": "...", "details": [] } }`; details must not contain secrets or private records. Collection responses are bounded and paginated with `limit` and `cursor` (or an explicitly documented page scheme). OpenAPI source is `server/openapi.yaml`.

Browser authentication uses opaque server-side sessions in HttpOnly cookies. Tokens are HMAC-hashed with `SESSION_SECRET` in the database; production cookies use Secure/SameSite=None and local HTTP uses SameSite=Lax. Mutating cookie-authenticated requests require an allowlisted Origin. Role and ownership checks occur on the server. Email verification/password reset routes are not implemented or operational until a mail provider is configured.

## Endpoint Groups

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health/live` | Public | Process liveness |
| GET | `/health/ready` | Public | Database readiness, safe status only |
| POST | `/auth/register` | Public, rate-limited | Register buyer or seller; never accepts admin role |
| POST | `/auth/login` | Public, rate-limited | Start session |
| POST | `/auth/logout` | Signed in | Revoke own session |
| GET | `/auth/me` | Signed in | Current safe user/profile summary |
| GET | `/categories` | Public | Active categories |
| GET | `/market/categories` | Buyer | Controlled categories with active produce types |
| GET | `/market/produce` | Buyer | Search category produce availability by radius; returns listing counts and rounded distances only |
| GET/PUT/DELETE | `/buyer/location` | Buyer | Read, save, or clear own saved area |
| GET | `/buyer/location/search` | Buyer | Search South African areas through the configured geocoder |
| GET | `/listings` | Public | Search/filter published, approved, active, in-stock, unexpired listings |
| GET | `/listings/:id` | Public | Safe listing and business detail; no separate business-profile route currently exists |
| GET/PUT | `/seller/business` | Seller | Read/update own business profile |
| GET | `/seller/produce-types` | Seller | List active produce types for listing entry |
| GET/POST | `/seller/listings` | Seller | List/create own listings |
| PUT | `/seller/listings/:id` | Owning seller | Update own listing |
| POST | `/seller/listings/:id/images` | Owning seller | Upload up to five validated listing photos with alt text |
| POST/GET | `/seller/verification` | Seller | Submit/status; document access remains private |
| GET | `/seller/enquiries` | Seller | Inbox for own business |
| PATCH | `/seller/enquiries/:id` | Owning seller | Update allowed enquiry status |
| POST | `/enquiries` | Authenticated buyer | Submit bounded enquiry with idempotency protection |
| GET | `/enquiries/mine` | Authenticated buyer | View own enquiries |
| GET | `/admin/verifications` | Admin | Filtered review queue |
| POST | `/admin/verifications/:id/decision` | Admin | Approve/reject and audit decision |
| GET | `/admin/verifications/:id/documents/:index` | Admin | Read one private document with no-store headers and access audit |
| PATCH | `/admin/listings/:id/moderation` | Admin | Moderate listing and audit action |
| GET | `/admin/audit-logs` | Admin | Restricted audit access |

Exact request/response schemas, implementation status, and generated OpenAPI must stay aligned. Use `400` for validation, `401` for missing identity, `403` for denied role/ownership, `404` for absent or inaccessible resources where disclosure is unsafe, `409` for conflicts, `429` for rate limits, and safe `5xx` responses.