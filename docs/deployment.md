# Deployment

## Local Setup

Install Node.js versions supported by the checked-in lockfiles. Run `npm ci` in `mobile/` and `server/`. Copy each `.env.example` to an ignored local `.env`; configure a PostgreSQL `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, and the Cloudinary cloud name, API key, and API secret in `server/.env`. Keep the Cloudinary API secret server-side; never add it to the mobile environment or client bundle. Set `UPLOAD_STORAGE_DRIVER=cloudinary` only after all three Cloudinary credentials are configured. From `server/`, run `npm run db:migrate`, then `npm run db:seed`, followed by `npm run dev`. From `mobile/`, run `npm run web`. For a physical phone, set `EXPO_PUBLIC_API_URL` to the development computer's current LAN IP and port (for example, `http://192.168.1.10:4000/api/v1`), not `localhost`; keep both devices on the same Wi-Fi, restart Expo after changing the URL, and allow inbound API port 4000 on the computer's private-network firewall profile. Development accepts browser origins on loopback or RFC1918 private IPv4 addresses only; production still requires exact HTTPS origins. The client development server works without the API, but account/listing persistence requires the API and PostgreSQL.

## Environment Variables

API: `NODE_ENV`, `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `COOKIE_SECURE`, `CORS_ORIGINS`, `CLIENT_ORIGIN`, `UPLOAD_STORAGE_DRIVER`, and the Cloudinary `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` when the Cloudinary driver is selected. Local storage directories are development-only. In development, HTTP origins on loopback and RFC1918 private IPv4 hosts are allowed for phone testing; production accepts only exact HTTPS origins in `CORS_ORIGINS`. Configure `GOOGLE_MAPS_API_KEY` only in the server secret store, with the Geocoding API enabled and the key restricted to the required API and server environment. Nearby-market location search and seller address/town geocoding return an explicit service-unavailable error until configured. Production validation requires `COOKIE_SECURE=true`, exact HTTPS CORS origins, and `CLIENT_ORIGIN` included in the allowlist. `SESSION_SECRET` and provider credentials are never committed. Client: `EXPO_PUBLIC_API_URL` contains only the public API origin, never credentials. `.env.example` files contain placeholders only.

Cloudinary stores listing images and verification documents as authenticated assets. Listing images are normalized to WebP before upload; documents are type-checked and remain in the private verification folder. The API proxies downloads through authorization-checked routes using short-lived signed provider download URLs; do not make verification assets public or expose Cloudinary API credentials in the client. Configure retention, backup, access, and applicable privacy/legal requirements with the Cloudinary account before production use.

Authentication uses a 15-minute signed access token and a 30-day rotating refresh token. Web clients receive HttpOnly cookies; native clients keep refresh tokens in Expo SecureStore and access tokens in memory. Refresh-token hashes are stored server-side and logout revokes the active session. Never enable credentialed cookie auth without HTTPS in production.

Offline mode stores no browser authentication token or personal profile data. It retains only a non-secret last-known role hint and caches public categories/listings; private API responses are never service-worker cached. The offline shell is provisional until the server can revalidate the session.

## Render Blueprint (Single Service)

`render.yaml` deploys one Render web service that serves both the API (`/api/v1`) and the exported Expo web app (`WEB_APP_DIR=../mobile/dist`) from the same HTTPS origin. This keeps session cookies first-party; separate `*.onrender.com` services would be cross-site, and Safari/private browsing block such cookies. `CLIENT_ORIGIN` and `CORS_ORIGINS` default to Render's `RENDER_EXTERNAL_URL`; set them explicitly when adding a custom domain. The web build leaves `EXPO_PUBLIC_API_URL` unset so the browser calls the origin it was loaded from. The build runs `npm run db:migrate` because the free plan has no pre-deploy step. Production refuses local storage, so Cloudinary credentials (with the correct cloud name) and Brevo are required. Native builds for the Render API must set `EXPO_PUBLIC_API_URL=https://<service>.onrender.com/api/v1`.

## Neon And Render

Provision Neon PostgreSQL and configure its connection string in the API service secret store. Back up before migrations; run migrations as a release step and verify readiness afterward. Deploy the Express API as a Render web service. Export the Expo web app as static output and deploy `mobile/dist` to Render Static Site or another static host. Configure HTTPS, exact CORS/client origins, health checks, and secret values. Deployment is not performed by this repository change.

For a fresh Neon database, the preferred setup is configure `DATABASE_URL` locally and run `npm run db:migrate` from `server/`. A manual one-time SQL alternative is provided in `server/neon-bootstrap.sql`; paste it into Neon SQL Editor only for an empty database. It includes the Drizzle migration journal entries so later `npm run db:migrate` calls remain synchronized. Do not run it on a database with existing AgriMarket objects, and do not run it in addition to the migrations on the same fresh database. Run `npm run db:seed` afterward to add the controlled categories.

## Storage, Email, And Cloudify

Production verification uploads require private object storage and short-lived authorized access; production listing photos require a durable public image bucket/CDN adapter. Local storage is development-only and must not be treated as durable. Listing images are normalized to WebP at up to 1600px; private verification documents are not transformed. Email verification/reset/notifications remain inactive until a mail provider and verified sender are configured. The seller in-app inbox is the mandatory notification path. Cloudify product and responsibility are TBD; it is not an integration or deployment dependency.

## Migrations And Rollback

Review generated SQL and backward compatibility before deploy. Back up Neon before schema changes, deploy additive migrations first, and keep application code compatible with both schema versions during rollout. Roll back application code independently; destructive down-migrations require an explicit recovery plan and backup restore. Do not run migrations automatically at every API process boot.

## First Administrator

After migrations, run `npm run admin:create-first -- admin@example.org` interactively from `server/`. The command accepts the email argument and prompts for a hidden password; use a unique password of at least 16 characters. It refuses to create a second admin and records the bootstrap in the audit log. Do not put the password in shell history or scripts.

## Production Readiness

Production requires configured secrets, TLS, database, CORS allowlist, private storage, retention/privacy notices and legal review, rate limits, logs/alerts, backup/restore test, and a verified release migration. The buyer's saved area and seller business geocode are sent to Google Maps Platform; disclose that processing in the privacy notice and confirm the applicable Maps agreement permits the directory's shared seller-coordinate use. Live GPS is not stored; only coordinates rounded to three decimal places are sent to the market search API over HTTPS. Restrict access to saved buyer locations and never include coordinates in logs or seller-facing responses.