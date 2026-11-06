---
name: agrimarket
description: Load AgriMarket project context (architecture, layout, rules, commands, current status) before working on this project.
---

# AgriMarket project context

You are working on **AgriMarket**, a mobile-first B2B directory that connects farmers/sellers with buyers. Load this context, then help with the user's request (if any arguments were given: $ARGUMENTS). If no request was given, briefly confirm the context is loaded and ask what to work on.

## Scope
- Buyers browse public listings; signed-in buyers send enquiries.
- Sellers manage one business profile, listings, private verification submissions, and an enquiry inbox.
- Admins review seller verification and moderate listings. Business approval does **not** bypass listing moderation.
- Out of scope: payments, checkout, fulfilment/logistics, real-time chat.

## Repository
- GitHub: https://github.com/MurangiEvan/AgriMarket (remote `origin`, default branch `main`).
- Commit or push only when the user asks. Branch off `main` for feature work.

## Layout
- `mobile/` — the canonical client: Expo SDK 58, Expo Router, React Native Web, static web export as a PWA (Workbox).
  - Routes: `mobile/src/app/` (index, explore, market, listing, listings/, enquiries, account, admin, sign-in, sign-up, forgot-password)
  - Components: `mobile/src/components/` (session-provider, market-flow, listing-browser, auth-screen, app-tabs…)
  - Lib: `mobile/src/lib/` (api.ts, auth-routing, market-flow + tests)
  - `mobile/AgriMarket/` is a **duplicate**. Don't edit it or run commands from it.
- `server/` — Node + TypeScript + Express 5 REST API under `/api/v1`, Zod validation, Drizzle ORM on Neon PostgreSQL, Cloudinary/private storage adapter.
  - `server/src/routes/` (auth, buyer, seller, listings, market, enquiries, images, admin), `server/src/middleware/`, `server/src/db/`, `server/openapi.yaml`, `server/drizzle/` migrations.
- `docs/` — architecture, api, database, deployment, requirements, roadmap, security, testing. Check these before making design decisions.

## Rules
- Follow root `AGENTS.md` (roles and workflow) and `mobile/AGENTS.md` (Expo rules).
- Expo changes between SDKs. Check the versioned docs (https://docs.expo.dev/versions/v58.0.0/) before using Expo/RN APIs. Never hand-edit `ios/`/`android/`. Add packages with `npx expo install`.
- Use plan mode for any non-trivial feature.
- Keep secrets in env vars only (`server/src/config.ts` validates them; see `.env.example` files).

## Verification commands
- Mobile (run in `mobile/`): `npx expo lint`, `npx tsc --noEmit`
- Server (run in `server/`): `npm run typecheck`, `npm test`, `npm run build`, `npm run db:check`

## Current status (see docs/roadmap.md for the latest)
Client PWA, API, schema/migrations, auth, moderation, enquiries, storage adapters, and OpenAPI are implemented and pass lint/typecheck/tests. Still outstanding: no real DATABASE_URL, object store, mail provider, or deploy credentials are configured; migrations haven't been applied to a real DB; Postgres-backed cross-account and E2E golden-journey tests aren't written. Don't mark release readiness complete. Deployment needs separate explicit authorization.

Before starting, run `git status` to see any uncommitted work in progress.
