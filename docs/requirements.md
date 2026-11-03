# AgriMarket Test Requirements

## 1. Purpose

This document defines observable product and quality requirements for the AgriMarket testing team. Use the IDs below to link test cases, defects, and release evidence. A requirement passes only when its acceptance criteria are verified at the relevant UI and API/persistence layers; a visible screen alone is not evidence that a workflow works.

The canonical client is `mobile/`; `mobile/AgriMarket/` is a preserved duplicate and is not the test/build target. The system consists of the Expo Router web/PWA client, Express REST API under `/api/v1`, and PostgreSQL accessed through Drizzle migrations.

For test commands, test layers, and the current verification record, see [Testing](./testing.md). The API contract is defined in [OpenAPI](../server/openapi.yaml), with additional behavior described in [API](./api.md).

## 2. Product And User Roles

AgriMarket is an English-language, mobile-first B2B directory for South African farmers, SMMEs, and business buyers. Visitors discover eligible suppliers; authenticated buyers can send enquiries; sellers maintain a business profile, listings, verification submissions, and an enquiry inbox; authorized administrators review verification and moderate listings.

| Actor | Expected access |
| --- | --- |
| Visitor | Browse eligible public listings and safe business details. |
| Buyer | Visitor capabilities, nearby produce discovery and own saved location, enquiry submission, and access to own enquiry history. |
| Seller | Maintain one own business profile, own listings, own verification status, and enquiries addressed to that business. |
| Administrator | Review verification, access private documents for review, moderate listings, and read restricted audit events. |

## 3. Functional Requirements And Acceptance Criteria

### Public discovery

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| FR-01 | P0 | A visitor can browse listings without signing in. The results contain only listings that are published, belong to approved businesses, are active and in stock, and are not expired. Pending, rejected, archived, inactive, out-of-stock, expired, or unapproved-business listings do not appear. |
| FR-02 | P0 | A visitor can search listing/supplier text and filter by active category and South African province. Filters combine correctly; clearing a filter restores broader results. Collection results are cursor-paginated, default to at most 20 results, and never exceed the API maximum of 50 per page. Invalid filters/cursors fail safely. |
| FR-03 | P0 | A visitor can open an eligible listing detail. It shows public listing/business fields and only valid contact fields explicitly supplied by the seller. It does not expose private business address/coordinates, user/account data, verification documents/storage keys, or internal moderation notes. Ineligible or unknown listing IDs are not disclosed as eligible listings. |
| FR-04 | P1 | Listing share uses the browser's Web Share capability when available and offers a copy-link fallback. Call, WhatsApp, and email actions appear only when the corresponding supplied contact value is valid; generated links use the correct normalized destination. |

### Accounts and sessions

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| FR-05 | P0 | Registration accepts buyer or seller roles only, validates email/password, and rejects duplicate accounts. A request cannot create an administrator account or set privileged, verification, ownership, or moderation fields. |
| FR-06 | P0 | Valid credentials start an authenticated session; invalid credentials do not. Logout revokes the active session, and subsequent protected requests require authentication. Refresh credentials rotate where that flow is used; a previously rotated/revoked credential cannot be reused. |
| FR-07 | P1 | The client displays the actual signed-in role and useful loading/error states. A visitor can reach sign-in/registration when an authenticated action is required. Password reset is explicitly unavailable until email delivery is configured; the UI must not claim that a reset email was sent. |

### Buyer nearby market

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| FR-08 | P1 | Nearby market routes and UI are restricted to authenticated buyers. A visitor, seller, or administrator cannot retrieve buyer market data. Active categories include only categories with active produce types. |
| FR-09 | P1 | A buyer can search available produce by category, location, optional text, and a supported radius (5, 10, 15, 20, 25, 30, 40, or 50 km). Results count only published product listings for approved businesses that are active, in stock, unexpired, and within the requested radius. Services and ineligible listings do not count. Invalid coordinates, radius, category, or overlong search text are rejected. |
| FR-10 | P0 | Market results expose produce name, availability/count, and rounded nearest distance only. They never return buyer or business coordinates or identify a supplier through the market result. No-result produce is shown unavailable with a null nearest distance. |
| FR-11 | P1 | A buyer can read, save, update, and clear their own selected saved location. Another account cannot read or change it. GPS coordinates used for an unsaved market search are not persisted as the buyer's saved location. |
| FR-12 | P1 | Explicit location search returns at most five South African area candidates and is rate-limited. Requests use the server-side geocoder; invalid input or an unconfigured/unavailable provider produces a clear safe error rather than fabricated results. |

### Seller business and listings

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| FR-13 | P0 | A seller can create and update one business profile. A second business profile for the same seller is rejected. Province must be one of the controlled South African provinces. The exact address and coordinates are visible only to the owning seller and are absent from public responses. |
| FR-14 | P0 | A seller can list, create, edit, preview, and submit only their own listings. New listings begin as drafts; submission follows the review workflow. A seller cannot set publication, moderation, or business-verification state through create/update payloads. |
| FR-15 | P0 | Listing category/produce type, title, description, province, listing type, and optional inventory/expiry fields are validated. Seller produce-type choices are limited to active values for the selected category. Invalid and boundary-length input is rejected without partial persistence. |
| FR-16 | P1 | A seller can upload up to five listing photos with one descriptive alt text per image. The API validates file type/signature and configured size limits, rejects malformed or oversized files, and stores normalized WebP images no wider/taller than 1600 px. Images are not publicly discoverable until their listing is eligible for publication. |
| FR-17 | P0 | A seller cannot read, edit, submit, or upload images to another seller's business/listing. Denied access does not disclose another seller's private data. |

### Verification and moderation

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| FR-18 | P0 | A seller can submit up to five supporting verification documents and read only their own safe status and seller-facing feedback. Invalid, oversized, or unavailable-storage uploads fail clearly. Seller/public responses never contain raw storage keys, private document links, or internal review reasons. |
| FR-19 | P0 | Only an authorized administrator can view/filter the review queue, retrieve a private verification document, or decide a pending submission. Non-admin users are denied. Document responses are no-store and each authorized document read is audited. |
| FR-20 | P0 | An administrator can approve or reject a pending verification submission. The saved decision records reviewer, time, seller-safe feedback, and internal reason. A repeated/conflicting decision on a non-pending submission is rejected. |
| FR-21 | P0 | Verification approval grants the verified business status but does not publish any listing. Listing moderation is a separate admin action. A listing can be published only for an approved business; publish/reject/archive actions record an audit event. |
| FR-22 | P0 | Public registration and seller requests cannot create/assign admin privileges. First-admin bootstrap uses the protected interactive setup. Verification decisions, private document reads, listing moderation, and admin bootstrap produce minimal audit records with the actor and action/time as applicable. |

### Enquiries

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| FR-23 | P0 | Only an authenticated buyer can submit a bounded enquiry for an eligible listing. Invalid/ineligible targets are rejected. Repeating the same buyer request with the same idempotency key does not create duplicate enquiries; conflicting key reuse and rate limits are handled safely. |
| FR-24 | P0 | A created enquiry persists its buyer, business, listing, message, status, idempotency key, and timestamps. The buyer can read only their own enquiry history; the receiving seller can read only enquiries for their own business. |
| FR-25 | P0 | The seller can move an owned enquiry forward through allowed statuses (`new`, `read`, `responded`, `closed`). Backward transitions and reopening a closed enquiry are rejected. Another seller cannot read or update it. |
| FR-26 | P1 | The seller in-app inbox is the supported notification surface. Email notifications are not represented as delivered unless a provider is configured and delivery has been tested. |

### Platform and data

| ID | Priority | Requirement and acceptance criteria |
| --- | --- | --- |
| FR-27 | P0 | API request bodies, query parameters, and uploaded files are validated server-side. Errors use the documented safe error shape and do not reveal secrets or private records. Protected routes enforce role and ownership server-side, independent of client navigation. Implemented endpoints remain aligned with OpenAPI. |
| FR-28 | P0 | PostgreSQL schema changes use checked-in Drizzle migrations. Migrations apply in order to a fresh disposable database, seeds are repeatable, and `db:check` reports a consistent migration set. No test is run against production data. |
| FR-29 | P1 | Public search is bounded/paginated and returns stable non-duplicate pages when traversed with cursors. Database queries use the intended filters/indexes; readiness reports unavailable database dependencies without exposing connection details. |
| FR-30 | P1 | The client provides an installable responsive PWA with static public routes, manifest/icons, and an offline app-shell fallback. `/api/v1/` requests are not served from offline cache. Offline operation does not imply that sign-in, market, seller, admin, or enquiry actions work without a network. |

## 4. Non-Functional Acceptance Criteria

| Area | Acceptance criteria |
| --- | --- |
| Authorization and privacy | Verify unauthenticated, wrong-role, wrong-owner, and privileged cases at the API boundary. Check response bodies and headers for private data, and verify that UI hiding is not the only control. |
| Input and abuse handling | Cover missing, malformed, boundary, and over-limit values; unsupported enums; invalid UUIDs; repeated auth/enquiry/upload/location requests; and malformed file content. Responses fail safely without partial writes. |
| Accessibility | Complete primary visitor, buyer, seller, and admin flows with keyboard navigation. Controls have accessible names/roles, focus is visible, status/error feedback is perceivable, and headings/forms are usable with assistive technology. |
| Responsive behavior | Smoke-test the canonical client at 320, 390, 768, and 1440 CSS pixels. No horizontal page overflow or clipped primary actions; loading, empty, error, and success states remain usable. Include the market screen, which needs separate viewport verification. |
| PWA and offline | On HTTPS, verify manifest, install icons, service-worker registration, app-shell fallback, and static assets. With network disabled, confirm that API data is not presented as fresh cached data and authenticated mutations fail with clear feedback. |
| Reliability | Health liveness/readiness distinguish process health from database readiness. Database/provider outages are visible as errors, not success-shaped empty data. |
| Data handling | Use synthetic accounts, listings, messages, and documents only. No secrets, passwords, session credentials, private file contents/URLs, precise location, or unnecessary personal data appear in logs or committed fixtures. POPIA/legal compliance is not inferred from passing technical tests. |

## 5. Core Acceptance Scenarios

Use isolated test identities and a disposable database. Record setup, request/UI action, expected result, actual result, and evidence for each scenario.

| Scenario | Setup and actions | Expected result |
| --- | --- | --- |
| AT-01 Public discovery eligibility | Create listings spanning published/pending/rejected/archived, approved/unapproved business, active/inactive, stock, and expiry states. Browse, search, filter, and paginate anonymously. | Only eligible listings appear; filters and cursor pages are correct and bounded; no private fields are returned. |
| AT-02 Registration and session lifecycle | Register buyer and seller; attempt duplicate email and admin role; sign in, access a protected route, log out, and retry. | Only buyer/seller registration succeeds; duplicate/admin attempts fail; logout invalidates access. |
| AT-03 Seller ownership boundary | Create Seller A and Seller B profiles/listings. Attempt cross-owner read/update/submit/upload and duplicate business creation. | Own actions work; cross-owner actions are denied without private data leakage; one profile per seller is enforced. |
| AT-04 Listing photo validation | Upload valid, malformed, unsupported, oversized, missing-alt-text, and maximum-count photo sets to an owned listing. | Valid photos are normalized and stored within limits; invalid sets are rejected; listing eligibility still controls public visibility. |
| AT-05 Verification and moderation lifecycle | Submit private documents as a seller; inspect as seller/public; review and decide as admin; separately moderate the listing. Retry decisions and access as non-admin. | Documents/status are private and role-bound; decision and document access are audited; business approval alone does not publish; moderation enforces approved-business eligibility. |
| AT-06 Buyer enquiry lifecycle | Submit as Buyer A with an idempotency key; repeat request; read history; access as Buyer B and Seller B; update status as receiving seller through valid and invalid transitions. | One enquiry is created per accepted idempotent request; owner and receiving seller see only permitted records; invalid transitions and cross-account access fail. |
| AT-07 Nearby market and location privacy | As buyer, query each supported radius using controlled fixture listings inside/outside bounds, varied stock/expiry/business states, and no-result produce. Save/read/update/delete a location and try from another account. | Counts and rounded distances match eligible listings; unsupported radii/coordinates fail; no exact coordinates are returned; location belongs only to its buyer. |
| AT-08 Geocoder and dependency failure | Mock successful, empty, rate-limited, and unavailable geocoder responses; test missing database/catalogue setup. | Valid geocoder results are bounded to five; failures are explicit and safe; missing catalogue returns a clear unavailable error rather than fabricated results. |
| AT-09 PWA and responsive flows | Build the web client; inspect public routes and market/seller/admin states at the viewport widths in Section 4; test offline navigation and API requests. | Install assets and shell fallback work; no private API response is cached; key controls remain usable and offline limitations are clear. |
| AT-10 Migration reproducibility | Apply migrations and seeds to a fresh disposable PostgreSQL instance; apply seeds again; run schema checks and database-backed workflows. | Schema and seed data are reproducible, repeated seeding is safe, and the documented golden journey can be persisted end to end. |

## 6. Test Data And Environment Rules

- Use separate synthetic visitor, Buyer A, Buyer B, Seller A, Seller B, and administrator identities. Do not share sessions between roles.
- Use a disposable PostgreSQL database and isolated private/public test storage adapters for integration and end-to-end testing.
- Mock geocoding in automated tests; never send fixture or personal locations to a real provider.
- Use controlled catalogue values and timestamps that make stock, expiry, radius, and publication boundaries deterministic.
- Keep provider-dependent scenarios explicit. A missing database, mail service, geocoder, or object store is an environment limitation, not a passed feature.
- Never run migrations, seeds, or destructive test setup against production data.

## 7. Release Gate And Known Limitations

Release candidate acceptance requires:

1. All P0 requirements and applicable P1 requirements pass, including negative authorization/privacy cases.
2. The seller-to-buyer golden journey completes end to end: seller registration/profile/listing; private verification submission; admin approval and audit; separate listing publication; public discovery; buyer registration/enquiry; seller inbox; cross-account denial.
3. API/client typechecks, tests, lint/build checks, and migration checks pass as listed in [Testing](./testing.md).
4. Responsive, keyboard, accessibility, offline, and PWA checks are recorded, including market-screen verification.
5. Any unrun checks, unavailable provider setup, dependency risks, and open defects are disclosed; an unconfigured capability is not called production-ready.

Known environment limitations at the time of this document: no disposable `DATABASE_URL`, production private object storage, configured email provider, or deployment target is available. Therefore PostgreSQL-backed cross-account/E2E flows, production uploads/email, and production-host install checks must not be reported as passed until run in the corresponding safe test environment. Password reset and email verification are not operational without email delivery configuration.

Payments, checkout, escrow, lending/credit, fulfilment, delivery/logistics, real-time chat, saved-search alerts, and automated external verification are out of scope. The platform does not guarantee product quality or commercial performance. POPIA compliance requires separate legal review.
