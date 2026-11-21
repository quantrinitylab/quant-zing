# QuantZing — Production Cloud Deployment, Sovereign Adapter & App Store / Play Store Guide

This guide covers all production operations for **QuantZing** (`quantzing.com` / `quantzing.in` / `com.quantzing.app`):

1. **Local Sovereign Adapter Mode (`:3008`)**
2. **Docker Compose & VPS Cloud Deployment (`quantzing.com` + wildcard `*.quantzing.com` handles)**
3. **Google Play Store APK / AAB Build & Submission**
4. **Apple App Store & TestFlight Build & Submission**

---

## 1. Local Sovereign Adapter Mode (`:3008`)

QuantZing includes a zero-dependency Node 24 server (`scripts/serve-quantzing.mjs`) and a sovereign QuantOS adapter (`deploy/quantzing-adapter.mjs`) that connects the QuantZing web bundle and embedded ATProto Personal Data Server (PDS) to local or remote QuantOS microservices.

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | Bind address for the QuantZing HTTP server |
| `PORT` | `3008` | HTTP listen port |
| `QUANTZING_PDS_DATA_DIR` | `./.quantzing-data` | Durable storage directory for sovereign ATProto repos (`db.json`) and media (`blobs/`) |
| `QUANT_AI_URL` | `http://127.0.0.1:4240` | Upstream **Quanty** (`quant-ai`) inference service |
| `QUANT_ROUTER_URL` | `http://127.0.0.1:4003` | Upstream `quant-router` LLM gateway |
| `QUANT_PAY_URL` | `http://127.0.0.1:4002` | Upstream `quant-pay` wallet & **QuantZing Pro** checkout service |

### Check Upstream Health & Boot Locally

```bash
# 1. Verify upstream QuantOS adapter connectivity
node ./deploy/quantzing-adapter.mjs --check-only

# 2. Build the production web bundle (if dist/ is not built yet)
pnpm build-web

# 3. Start QuantZing with the Sovereign Adapter on port 3008
node ./deploy/quantzing-adapter.mjs
```

Verify the health endpoint:

```bash
curl -s http://127.0.0.1:3008/health
```

---

## 2. Docker & Ubuntu/Debian VPS Cloud Deployment (`quantzing.com`)

### Required DNS Records

Configure the following DNS records at your domain registrar / Cloudflare for `quantzing.com` (and optionally `quantzing.in`):

| Type | Name | Target / Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `A` | `@` | `<YOUR_VPS_IPV4>` | Auto / 300s | Primary web app & ATProto PDS (`quantzing.com`) |
| `AAAA` | `@` | `<YOUR_VPS_IPV6>` | Auto / 300s | IPv6 primary web app & PDS |
| `CNAME` | `www` | `quantzing.com` | Auto / 300s | Redirects `www.quantzing.com` to `quantzing.com` |
| `A` | `*` | `<YOUR_VPS_IPV4>` | Auto / 300s | Wildcard user handles (`*.quantzing.com` e.g. `alice.quantzing.com`) |
| `CNAME` | `updates` | `quantzing.com` | Auto / 300s | Expo OTA updates endpoint (`updates.quantzing.com`) |

### Option A: Docker Compose Production Stack (Recommended)

The root `Dockerfile` and `docker-compose.prod.yml` build the multi-stage Node 24 production bundle, mount durable volume storage at `/data/.quantzing-data`, and run **Caddy 2** on ports `80` and `443` with automatic Let's Encrypt HTTPS.

```bash
# Build and start QuantZing (:3008) + Caddy (:80/:443)
docker compose -f docker-compose.prod.yml up -d --build

# Check container status and healthcheck
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:3008/health
```

Or run the automated VPS deployment script:

```bash
chmod +x ./deploy/deploy-cloud.sh
sudo ./deploy/deploy-cloud.sh --docker
```

### Option B: Native Systemd Service on Ubuntu/Debian VPS

If running directly on bare-metal Ubuntu/Debian without Docker:

```bash
sudo ./deploy/deploy-cloud.sh --systemd
sudo systemctl status quantzing.service
```

The systemd unit (`deploy/systemd/quantzing.service`) runs as the dedicated `quantzing` system user, persists data in `/var/lib/quantzing/.quantzing-data`, and automatically restarts on failure.

---

## 3. Google Play Store Build & Submission (`com.quantzing.app`)

All native Android icons (`assets/app-icons/android_icon_*.png`, `assets/icon-android-foreground.png`, `assets/icon-android-monochrome.png`, `assets/icon-android-notification.png`) and splash assets (`assets/splash/*.png`) use the True Dark `#000000` QuantZing geometric **Z** artwork.

### Build Android APK (Internal Testing / Direct Install)

```bash
# Builds an installable Android APK using the "preview" profile in eas.json
npx eas-cli build --platform android --profile preview
```

### Build Android App Bundle (AAB for Google Play Store Production)

```bash
# Builds a signed production .aab bundle with auto-incremented versionCode
npx eas-cli build --platform android --profile production
```

### Submit to Google Play Console

1. Place your Google Play Service Account JSON key at `./google-play-service-account.json`.
2. Copy the store listing fields from `store-metadata/google-play/listing-en-US.json` into Google Play Console (**Main store listing**).
3. Submit the production build:

```bash
npx eas-cli submit --platform android --profile production
```

---

## 4. Apple App Store Build & Submission (`com.quantzing.app`)

QuantZing is configured in `app.config.js` with:
- **Bundle Identifier**: `com.quantzing.app`
- **App Group**: `group.com.quantzing.app`
- **Associated Domains**: `applinks:quantzing.com`, `applinks:www.quantzing.com`, `applinks:quantzing.in`
- **App Extensions**:
  - `com.quantzing.app.Share-with-QuantZing`
  - `com.quantzing.app.QuantZingNSE`
  - `com.quantzing.app.AppClip`
  - `com.quantzing.app.QuantZingWidgets`

### Build iOS IPA for App Store Connect / TestFlight

```bash
# Set your Apple Team ID if not configured in EAS secrets
export EXPO_APPLE_TEAM_ID="YOUR_TEAM_ID"

# Build signed production iOS archive
npx eas-cli build --platform ios --profile production
```

### Submit to App Store Connect

1. Copy the metadata from `store-metadata/apple-app-store/listing-en-US.json` into App Store Connect.
2. Submit the latest build via EAS Submit:

```bash
npx eas-cli submit --platform ios --profile production
```
