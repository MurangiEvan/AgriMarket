# AgriMarket Client

The canonical Expo Router mobile app and PWA for AgriMarket. The client connects South African farmers and SMMEs with business buyers for produce discovery and enquiries.

## Run locally

Install dependencies with `npm ci`, configure `EXPO_PUBLIC_API_URL` in the local environment, then run `npm run web` for the PWA or `npx expo start` for native development. Authentication and saved data require the API and PostgreSQL service described in the [deployment guide](../docs/deployment.md).

## Authentication

The app restores sessions before rendering protected routes. Web sessions use API-managed HttpOnly cookies; native refresh credentials use Expo SecureStore. The offline shell retains only a non-secret role hint and public cached listings/categories.

## Checks

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build:web`
