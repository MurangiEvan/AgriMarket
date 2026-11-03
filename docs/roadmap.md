# Roadmap

## Phases And Definition Of Done

1. Foundation: canonical architecture, TypeScript API, environment validation, database/migration workflow, health endpoints, docs. Done when clean install/typecheck and safe health behavior pass.
2. Identity and business: buyer/seller registration, secure sessions, business ownership, profile APIs. Done when persisted and unauthorized access tests pass.
3. Listings and discovery: listing CRUD, publication policy, categories/provinces, public search/detail, responsive client. Done when only eligible listings are discoverable.
4. Verification and moderation: private storage adapter, seller submission/status, admin queue/decision, separate listing publication decision, audit trail. Business approval does not bypass listing moderation. Done when decisions and document permissions pass tests.
5. Enquiries: authenticated buyer submission, idempotency/rate limiting, seller inbox/status, ownership tests. Done when golden journey passes through seller inbox.
6. PWA and accessibility: manifest, icons, conservative shell caching, mobile/desktop, keyboard and offline states. Done when built output and browser checks confirm installability assets and no private API caching.
7. Release readiness: migrations, test/security review, environment/deployment docs and backup plan. Done when release checklist passes; external deployment remains separately authorized.

## Current Status

Phase 0 discovery is complete. The Make home mockup is inspectable; the separate design file requires login. The canonical Expo PWA now has static export, manifest/icons, Workbox offline shell, responsive buyer/seller/admin routes, and passes client lint/typecheck/build. The TypeScript API, Drizzle schema/migrations, auth/ownership routes, moderation, enquiry, storage adapters, OpenAPI and focused tests are implemented; API lint/typecheck/tests/build and Drizzle consistency checks pass. No database URL, production object store, mail provider, or deployment credentials are configured. Migrations have not been applied to a real database, and PostgreSQL-backed cross-account/E2E golden-journey tests remain outstanding; do not mark release readiness complete.

## Dependencies And Stretch Goals

Production verification uploads depend on private object storage. Email depends on a configured provider. Admin bootstrap needs an explicitly authorized operational process. Stretch goals after the core golden journey: optional email notifications and saved-search alerts. Do not add payments, fulfilment/logistics, real-time chat, or checkout to this roadmap.