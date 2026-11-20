# API

Base path: `/api/v1`. JSON request/response bodies use UTF-8. Errors use `{ "error": { "code": "...", "message": "...", "details": [] } }`; details must not contain secrets or private records. Collection responses are bounded and paginated with `limit` and `cursor` (or an explicitly documented page scheme). OpenAPI source is `server/openapi.yaml`.

Browser authentication uses opaque server-side sessions in HttpOnly cookies. Tokens are HMAC-hashed with `SESSION_SECRET` in the database; production cookies use Secure/SameSite=None and local HTTP uses SameSite=Lax. Mutating cookie-authenticated requests require an allowlisted Origin. Role and ownership checks occur on the server. Password reset emails are sent through Brevo (`BREVO_API_KEY`, `MAIL_FROM_EMAIL`, optional `MAIL_FROM_NAME` and `PASSWORD_RESET_URL`); without a key in development the reset link is printed to the server console. Reset tokens are HMAC-hashed, single-use, expire after 30 minutes, and a successful reset revokes all of the user's sessions and writes a `user.password_reset` audit event. Email verification is not implemented.

## Endpoint Groups

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health/live` | Public | Process liveness |
| GET | `/health/ready` | Public | Database readiness, safe status only |
| POST | `/auth/register` | Public, rate-limited | Register buyer or seller; never accepts admin role. Requires `acceptPrivacy: true` (POPIA consent to the Privacy notice and Terms); the accepted version is stored |
| POST | `/auth/become-seller` | Buyer | Switch the account to seller (one account can buy and sell). Sellers keep every buyer ability; the business must still apply and be approved. 409 `ALREADY_SELLER`, 403 for administrators. Audited as `user.became_seller` |
| POST | `/auth/privacy/accept` | Signed in | Accept the current Privacy notice and Terms. Login, refresh and `/auth/me` return `user.privacyAccepted`; the app asks once when it is false |
| GET/POST/DELETE | `/account/deletion-request` | Signed in (not admin) | Read the latest deletion request, ask for the account to be deleted (`{ reason? }`, 409 `DELETION_ALREADY_REQUESTED` while one is pending), or cancel a pending request. Audited as `user.deletion_requested` / `user.deletion_cancelled` |
| POST | `/auth/login` | Public, rate-limited | Start session |
| POST | `/auth/logout` | Signed in | Revoke own session |
| GET | `/auth/me` | Signed in | Current safe user/profile summary |
| POST | `/auth/password-reset/request` | Public, rate-limited | Email a reset link; same response whether or not the account exists |
| POST | `/auth/password-reset/confirm` | Public, rate-limited | Set a new password with a valid token; revokes all sessions |
| GET | `/categories` | Public | Active categories |
| GET | `/market/categories` | Buyer or seller | Controlled categories with active produce types |
| GET | `/market/produce` | Buyer or seller | Search category produce availability by radius; returns listing counts and rounded distances only |
| GET/PUT/DELETE | `/buyer/location` | Buyer or seller | Read, save, or clear own saved area |
| GET | `/buyer/location/search` | Buyer or seller | Search South African areas through the configured geocoder |
| GET | `/listings` | Public | Search/filter published, approved, active, in-stock, unexpired listings |
| GET | `/listings/:id` | Public | Safe listing and business detail; no separate business-profile route currently exists. The business includes `ratingCount` and `ratingAverage` (null until it has 3 visible ratings), and `reviews` lists up to 5 approved comments with the buyer's organisation type only. Listing cards in `/listings` carry the same two rating fields |
| GET/PUT | `/seller/business` | Seller | Read/update own business profile |
| PUT | `/seller/business/drone-licence` | Seller | `{ sacaaRplNumber, sacaaRocNumber }`: the SACAA Remote Pilot Licence and Remote Operating Certificate numbers, as printed. Changing either clears `droneLicenceVerified`. A drone-services application or new drone listing without both numbers returns 409 `DRONE_LICENCE_REQUIRED` |
| GET | `/seller/produce-types` | Seller | List active produce types for listing entry |
| GET/POST | `/seller/listings` | Seller | List own listings; create a listing only once the business is approved (409 `BUSINESS_NOT_APPROVED` before) |
| PUT | `/seller/listings/:id` | Owning seller | Update own listing |
| POST | `/seller/listings/:id/images` | Owning seller | Upload up to five validated listing photos with alt text (approved businesses only) |
| POST | `/seller/application` | Seller | Submit the whole application in one multipart request: the saved business profile must be complete (name, 10+ character description, town, one contact method), plus `documents` (1–5 PDF/JPEG/PNG, 10 MB each), `photo` (one image, up to 25 MB; stored as a 1600 px WebP), `categoryId`, `produceTypeId` and optional `note`. Creates the verification submission and a pending listing with the photo together |
| GET | `/seller/verification` | Seller | Application status and history; document access remains private |
| POST | `/seller/verification` | Seller | Retired: returns 409 `APPLICATION_REQUIRED` (use `/seller/application`) |
| GET | `/seller/enquiries` | Seller | Inbox for own business |
| PATCH | `/seller/enquiries/:id` | Owning seller | Update allowed enquiry status: `{ status, outcome?, outcomeValueBand? }`. Closing requires `outcome` (`deal_made` or `no_deal`); `outcomeValueBand` (`under_5k`, `5k_50k`, `50k_250k`, `over_250k`, `prefer_not_to_say`) is optional and only allowed with `deal_made`. The outcome is fixed once closed. Buyers see the outcome in `/enquiries/mine` but not the value range; the overview reports `deals` and the enquiry CSV includes both |
| POST | `/enquiries` | Signed-in buyer or seller | Submit bounded enquiry with idempotency protection. A seller cannot enquire with their own business (409 `OWN_LISTING`) |
| GET | `/enquiries/mine` | Signed-in buyer or seller | View own enquiries, each with the outcome (no value range) and the buyer's `rating` or null |
| POST/PUT | `/enquiries/:id/rating` | Authenticated buyer (own enquiry) | `{ stars: 1-5, comment? }` (comment up to 500 characters). Only once the seller has responded or closed (409 `NOT_YET_RATEABLE`); POST once per enquiry (409 `ALREADY_RATED`), PUT changes it within 30 days (409 `EDIT_WINDOW_CLOSED`). Stars count straight away; a new or changed comment waits for admin approval |
| GET | `/seller/enquiries/ratings` | Seller | The seller's own average and count (even before it is public), how many comments await review, and approved comments |
| GET | `/admin/ratings` | Admin | Optional `commentStatus`: `pending` (default), `approved` or `hidden`. Rating comments to moderate |
| POST | `/admin/ratings/:id/comment` | Admin | `{ action }` where action is `approve` or `hide`; audited as `rating.comment_approved` / `rating.comment_hidden`. To remove a whole rating, a report about it (`targetType: 'rating'`) is upheld on the Reports page, which hides it everywhere |
| GET | `/admin/verifications` | Admin | Filtered review queue |
| POST | `/admin/verifications/:id/decision` | Admin | Approve/reject and audit decision. Approving an application that offers drone services needs `confirmDroneLicence: true` (the admin checked the SACAA licence) unless already checked, otherwise 409 `DRONE_LICENCE_NOT_CONFIRMED`. The queue shows `offersDroneServices` and the licence numbers |
| GET | `/admin/verifications/:id/documents/:index` | Admin | Read one private document with no-store headers and access audit |
| PATCH | `/admin/listings/:id/moderation` | Admin | Moderate listing and audit action. Publishing a drone-services listing needs `confirmDroneLicence: true` the first time for a business (audited as `business.drone_licence_confirmed`). Public listings expose `droneLicenceVerified` and show a "SACAA licence checked" badge on drone listings |
| GET | `/admin/audit-logs` | Admin | Restricted audit access; optional filters `action` (prefix, e.g. `verification.`), `targetType`, `before` (ISO timestamp, for older pages) and `limit` (1–100) |
| GET/PUT | `/buyer/profile` | Buyer or seller | Organisation name and type (retailer, hotel, restaurant, processor, exporter, municipality, government programme, school, commercial farm, informal trader, other); required before the first enquiry (409 `BUYER_PROFILE_REQUIRED`) |
| GET | `/listings?agriseta=true` | Public | Directory filtered to businesses an admin confirmed as AgriSETA-supported; listings and businesses include `agrisetaSupported` |
| GET | `/admin/exports/businesses.csv` | Admin | Verified businesses with contacts, offerings and AgriSETA status for CRM/partner import (audited) |
| GET | `/admin/exports/enquiries.csv` | Admin | Enquiry activity (seller, listing, category, buyer organisation and type, status); no message text or buyer email (audited) |
| GET | `/notifications` | Signed in | The user's own notifications (newest first, `limit` 1–50) and `unreadCount` |
| GET | `/notifications/unread-count` | Signed in | Unread count for the bell badge |
| POST | `/notifications/:id/read` | Signed in | Mark one of the user's own notifications as read (204) |
| POST | `/notifications/read-all` | Signed in | Mark all of the user's notifications as read (204) |
| GET | `/admin/overview` | Admin | Counts of verifications, businesses and listings by status, and active users by role, open reports (`openReports`), pending deletion requests (`pendingDeletionRequests`), `ratings` (total, `satisfactionScore` = share of 4-5 star ratings, pending comments) and `deals` (made, outcomes recorded, deal rate, value ranges) |
| GET | `/admin/deletion-requests` | Admin | Optional `status`: `pending` (default), `approved`, `rejected` or `cancelled`. Each request includes the user's email, role, business and how many open reports are against their listings |
| POST | `/admin/deletion-requests/:id/decision` | Admin | `{ decision, note? }` where decision is `approved` or `rejected` (a note is required to reject; the user is notified). Approval anonymises the account: email, password, location, organisation, business contact details, documents and photos are removed, listings archived, sessions revoked; enquiries stay for the other party as "Deleted user". Audited as `user.deleted`, and a confirmation email is sent |
| POST | `/reports` | Signed in, rate-limited (10/hour) | Report a live listing: `{ targetType: 'listing', targetId, reason, details? }` where reason is `scam_or_fraud`, `fake_business`, `wrong_information`, `offensive` or `other`. 409 `OWN_LISTING` for your own listing, 409 `ALREADY_REPORTED` while your earlier report is still open. The seller is never told who reported |
| GET | `/admin/reports` | Admin | Optional `status`: `open` (default), `dismissed` or `actioned`. Report queue with the reported listing, reporter email and role, and how many open reports the listing has |
| POST | `/admin/reports/:id/decision` | Admin | `{ action, note? }` where action is `dismiss` or `take_down`. Take down archives the listing, closes every open report about it, notifies the seller (with the note) and is audited as `report.actioned`; dismiss is audited as `report.dismissed` |

Exact request/response schemas, implementation status, and generated OpenAPI must stay aligned. Use `400` for validation, `401` for missing identity, `403` for denied role/ownership, `404` for absent or inaccessible resources where disclosure is unsafe, `409` for conflicts, `429` for rate limits, and safe `5xx` responses.