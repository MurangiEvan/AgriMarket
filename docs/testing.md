# Testing

## Layers

- Unit: validation schemas, province/category values, role and publication policies.
- Market unit: radius validation, buyer-role checks, safe rounded response shaping, buyer location resolution, location rounding, radius/category/search state preservation, and produce filtering/sorting.
- API integration: health, auth/session handling, CRUD persistence, role/ownership denial, rate limiting, and safe response shaping against a disposable PostgreSQL database.
- Client: typecheck/lint and responsive/accessibility checks for public search, listing details, sign-in prompt, and seller/admin workflows.
- End-to-end: complete golden journey with isolated seller, buyer, admin, and private test storage adapter.
- Security regression: unapproved/unpublished listing invisibility, private document denial, cross-seller inbox denial, buyer-owned enquiry isolation, and client role escalation denial.

## Golden Journey

1. Register seller, create one business and a draft listing.
2. Submit a verification file using private test storage.
3. Approve verification as admin and assert audit actor/action/time; confirm seller feedback and status shaping.
4. Separately publish the approved business's pending listing through moderation, then assert public badge and category/province discovery.
5. Register/sign in as buyer, create enquiry, and assert seller inbox visibility.
6. Assert another seller cannot read/update it and public API cannot reveal private documents or internal moderation reasons.

## Required Authorization Cases

- Seller A cannot edit Seller B's listing or read Seller B's inbox.
- Buyer A cannot read Buyer B's enquiries; a seller cannot read another business's enquiries.
- A buyer/seller receives 403 from admin routes and cannot promote their own role or verification status.
- Public routes cannot fetch private verification files, internal review reasons, unpublished listings, or listings for unapproved businesses.
- Invalid/oversized uploads and repeated auth/enquiry/upload requests are rejected safely.

## Commands

Run `npm run typecheck`, `npm test`, `npm run db:check`, and `npm run build` from `server/`; run `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build:web` from `mobile/`. Market boundary and eligibility integration tests require a configured disposable PostgreSQL database; geocoding tests should use a mocked provider and never send fixture locations to Google. End-to-end checks require a configured disposable database and test storage adapter. Do not run tests against production data.

## Release Checklist

Confirm migrations, focused and authorization tests, client build/installability, mobile and desktop layout, keyboard focus and labels, offline shell without private caching, no committed secrets, dependency checks, accurate docs, and verified backup/restore. Report checks that cannot run due missing database/provider configuration.

## Current Verification Record

Feature verification in the workspace on 2026-11-03:

- API: `npm run typecheck`, `npm test` (15 passed), `npm run db:check`, and `npm run build` passed.
- Client: `npm run lint`, `npm run typecheck`, `npm test` (6 passed), and `npm run build:web` passed; the static build emitted nine routes, including `/market`, and Workbox generated its app-shell worker.
Earlier baseline checks on 2026-10-27:

- Browser: Home and account routes were inspected at 390px mobile width; Home was also inspected at 1440px desktop width. No horizontal page overflow was observed. API error states were expected because no API/database was configured in the preview.
- PWA artifact check: standalone manifest, 180/192/512px icons, offline page, and NetworkOnly `/api/v1/` service-worker behavior were verified.
- Dependency audit (2026-10-27): API has 4 moderate development-dependency findings and 0 production findings. Client has 8 total findings (5 high, 3 low), including 4 high production-tree findings under Expo CLI/`node-forge`/Zod. Do not apply `npm audit fix --force`: npm proposes downgrading Expo to 44. Track an Expo-compatible dependency update before production release.

The market screen has not been browser-inspected at mobile or desktop widths. PostgreSQL-backed radius-boundary and eligibility tests, fresh-database migration/seed execution, cross-account tests, install testing on a production HTTPS host, backup/restore, and the complete golden-journey E2E have not run because no disposable `DATABASE_URL`, production storage credentials, or deployment target are configured. Do not report the golden journey as passed until those checks run against a disposable configured database and test storage adapter.