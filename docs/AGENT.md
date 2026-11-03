# Agent Guide

## Repository Map

- `mobile/`: canonical Expo Router / React Native Web client and installable PWA.
- `mobile/AgriMarket/`: preserved duplicate project; do not use as the canonical app root.
- `server/`: TypeScript Express API, Drizzle schema, SQL migrations, and tests.
- `docs/`: canonical product, architecture, security, API, deployment, and test documentation.

## In Scope

- Public buyer discovery: browse, text search, category/province filters, eligible listing and business details, and seller-provided contact/share actions.
- Seller identity and tools: email/password registration and sign-in, one business profile, listing create/edit/preview/submit, listing photos, and private verification submission/status.
- Human verification and moderation: protected admin queue, approve/reject decisions, separate listing publication decisions, accurate verified badges, and audit records.
- Enquiries: authenticated buyer submission, buyer-owned history, seller-only business inbox, status updates, validation, idempotency, and rate limiting.
- Platform foundations: accessible responsive installable PWA, conservative app-shell offline fallback, Express REST API, PostgreSQL/Drizzle migrations, OpenAPI, tests, and current system documentation.
- Security/privacy: server-side roles and ownership, private verification storage, safe session handling, data minimization, retention guidance, and POPIA/legal review notes.

## Out Of Scope

- Payments, checkout, escrow, holding funds, or other financial services such as lending/credit.
- Fulfilment, delivery booking, logistics/transport management or tracking.
- Full inventory, ERP, accounting, or point-of-sale features.
- Real-time chat and saved-search alerts before the golden journey passes; saved searches remain a stretch goal.
- Automated external verification in place of human review, or guarantees of product quality/commercial performance.
- Email delivery until a provider, verified sender, credentials, and delivery tests are configured.
- Any feature or workflow that treats authenticated actions as available offline unless implemented and tested.

These boundaries are product requirements, not merely deferred implementation suggestions. Never expose private verification documents, passwords, session secrets, or internal moderation notes, and never trust client-supplied roles or verification decisions.

## Commands

- Client from `mobile/`: `npm ci`, `npm run web`, `npm run typecheck`, `npm run lint`, `npm run build:web`.
- API from `server/`: `npm ci`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run db:generate`, `npm run db:check`, `npm run build`.
- First admin, after migrations: `npm run admin:create-first -- admin@example.org`; enter its password only at the hidden interactive prompt.
- Configure local values from `.env.example`; do not commit a real `.env`.

## Change And Test Rules

- Preserve uncommitted work, especially the existing untracked `mobile/` and `server/` trees.
- Keep the outer `mobile/` project canonical. Do not copy changes into `mobile/AgriMarket/` without a deliberate reconciliation decision.
- Validate request data with Zod and enforce role/ownership in API middleware or route services.
- Public listing queries must require published listing + approved business.
- Verification documents must use private storage keys and authorized access only.
- Add focused tests for success and denied access, then run the relevant typecheck and tests.
- Update the relevant canonical docs in `docs/` when contracts or deployment assumptions change.
- No deployment, credential creation, paid service activation, or destructive repository operation without explicit authorization.

## Definition Of Done

A workflow is complete only when UI, API, persistence, server-side authorization, validation, loading/error/empty states, focused tests, and relevant docs agree. Report any missing external credentials, storage, mail, or deployment setup clearly.