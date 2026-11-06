# AgriMarket Client

The canonical Expo Router mobile app and PWA for AgriMarket. The client connects South African farmers and SMMEs with business buyers for produce discovery and enquiries.

## Run locally

Install dependencies with `npm ci` and configure `EXPO_PUBLIC_API_URL` in the local environment. For a physical phone, use the computer's LAN IP (for example, `http://192.168.1.10:4000/api/v1`), not `localhost`, and connect the phone and computer to the same Wi-Fi. Restart Expo after changing the environment file so the new URL is included in the app bundle. Run `npm run web` for the PWA or `npx expo start` for native development. Authentication and saved data require the API and PostgreSQL service described in the [deployment guide](../docs/deployment.md).

## Authentication

The app restores sessions before rendering protected routes. Web sessions use API-managed HttpOnly cookies; native refresh credentials use Expo SecureStore. Sellers can select listing photos and verification documents on web and native devices; uploads go through the authenticated AgriMarket API, which stores them using its configured storage provider. Cloudinary credentials belong only in the server's ignored `.env`, never the mobile app or a tracked `.env.example`. The offline shell retains only a non-secret role hint and public cached listings/categories.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build:web`
