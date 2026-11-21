# QuantZing Scripts (`scripts/`)

## `serve-quantzing.mjs`

Starts the production **QuantZing** web application server and QuantOS service gateway on `http://localhost:3008` (`pnpm serve:web`).
- Serves the compiled static web bundle from `dist/`.
- Mounts the Sovereign ATProto Hybrid PDS (`quantzing-pds.mjs`) on `/xrpc/*` and `/.well-known/*`.
- Proxies `/api/quant-ai/*` to QuantAI (`:4240`), `/api/quant-router/*` to QuantRouter (`:4003`), and `/api/quant-pay/*` to QuantPay (`:4002`).

## `quantzing-pds.mjs`

Sovereign ATProto Hybrid Personal Data Server (PDS) for `quantzing.com` and `quantzing.in`:
- Issues `.quantzing.com` and `.quantzing.in` handles and decentralized identifiers (DIDs).
- Persists accounts, Zings, Rezings, likes, follows, profiles, notifications, and uploaded blobs in `.quantzing-data/`.
- Automatically generates inline `@quanty.quantzing.com` thread replies whenever a user publishes a Zing mentioning `@quanty`.

## `post-web-build.js`

Post-processes the Expo web export in `dist/` to inject QuantZing metadata, favicons, and production asset paths.

## `updateExtensions.sh`

Updates the native extensions in `/modules` with current iOS and Android project changes.
