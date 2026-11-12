# AgriMarket Admin Website

The administrator dashboard for AgriMarket, built with Next.js and deployed on Vercel. It has no database or backend of its own: it uses the same AgriMarket API that runs on Render.

## Pages

- **Overview**: counts of waiting verifications and photos, marketplace totals and recent activity.
- **Verifications**: download seller documents, then approve the business or reject it with feedback.
- **Produce photos**: approve and publish photos from approved businesses, or reject them.
- **Audit log**: every recorded event, filtered by action, target and date, with "load older events".

Only accounts with the `admin` role can sign in. Seller and buyer accounts are signed out with a message.

## How it connects to the API

```
Browser ──► https://<admin>.vercel.app/api/v1/...  ──(Vercel rewrite)──►  https://agrimarket-f059.onrender.com/api/v1/...
```

`next.config.ts` forwards every `/api/v1/*` request to `AGRIMARKET_API_ORIGIN`. The browser only talks to the Vercel domain, so the API's httpOnly session cookies are stored as first-party cookies for that domain. Browsers increasingly block third-party cookies, and this design avoids that problem.

The API still checks the browser's `Origin` header on every change (sign-in, approvals). The Render service must therefore list the Vercel address in `ADMIN_ORIGINS`.

## Local development

```bash
cd admin
npm install
# in admin/.env.local: AGRIMARKET_API_ORIGIN=http://localhost:4000   (start the API with `cd server && npm run dev`)
npm run dev        # http://localhost:3000
```

Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Vercel settings

| Setting | Value |
| --- | --- |
| Root Directory | `admin` |
| Framework Preset | Next.js |
| Environment variable | `AGRIMARKET_API_ORIGIN` = `https://agrimarket-f059.onrender.com` |

## Render settings (the API service)

| Variable | Value |
| --- | --- |
| `ADMIN_ORIGINS` | the Vercel address, e.g. `https://agrimarket-admin.vercel.app` (comma-separate several) |
| `EXPO_PUBLIC_ADMIN_URL` | the same address; the mobile app's admin screen links to it |
