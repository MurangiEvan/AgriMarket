# AgriMarket

AgriMarket is a mobile-first verified B2B directory connecting South African farmers and SMMEs with business buyers. It supports discovery and enquiries; it is not an e-commerce checkout or logistics platform.

## Project Layout

- [`mobile/`](mobile/): canonical Expo Router client and PWA.
- [`server/`](server/): Express API and PostgreSQL persistence.
- [`docs/`](docs/): requirements, architecture, API, database, security, deployment, and testing guidance.

`mobile/AgriMarket/` is a preserved duplicate Expo project. Use `mobile/` as the canonical client root.

## Development

Install dependencies with `npm ci` separately in `mobile/` and `server/`. Copy each `.env.example` to an ignored local `.env`, set `DATABASE_URL` and a development-only `SESSION_SECRET` in `server/.env`, then run `npm run db:migrate` and `npm run db:seed` from `server/`. Start the API with `npm run dev` in `server/` and the browser app with `npm run web` in `mobile/`. The client script is `web` (not `dev`). Database-backed workflows require a configured PostgreSQL database. The one-time admin setup is documented in [deployment](docs/deployment.md).

See [deployment](docs/deployment.md) for environment setup and [testing](docs/testing.md) for checks. Production uploads, email delivery, and cloud deployment require providers and credentials that are not included here.

## Design References

- [AgriMarket Make mockup](https://www.figma.com/make/033xGi4615UCSupFWD5qhz/AgriMarket-Mobile-Mockup?t=OchMfDcEE3HQeWoq-1): the home screen was inspected in-browser.
- [Figma design file](https://www.figma.com/design/XuyGRfH1wbHxudMNKIi9UC/Untitled?node-id=0-1&t=gfabB0lXssNxI3R8-1): login is required; unseen screens were not treated as inspected.