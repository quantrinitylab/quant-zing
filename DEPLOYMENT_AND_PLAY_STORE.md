# QuantZing — Production Cloud Deployment, Sovereign Adapter & App Store / Play Store Guide

This guide covers all production operations for **QuantZing** (`quantzing.com` / `quantzing.in` / `com.quantzing.app`):

1. **Local Sovereign Adapter Mode (`:3008`)**
2. **Docker Compose & VPS Cloud Deployment (`quantzing.com` + wildcard `*.quantzing.com` handles)**
3. **Google Play Store APK / AAB Build & Submission**
4. **Apple App Store & TestFlight Build & Submission**
5. **Isolated Employee Operations Portal (`quantzing-ops.quantrinity.in` / `ops.quantzing.quantrinity.in`) & Cloudflare Zero Trust**

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

## 2. Live Oracle Cloud (OCI `ap-mumbai-1`) Deployment (`quantzing.quantrinity.in`)

QuantZing runs on its own **dedicated, isolated Oracle Cloud ARM64 VM (`vm-quantzing`)** in `ap-mumbai-1`, completely separate from `vm-app` (`quantmail` / `quantai` / `quantchat`):

| Property | Value |
| :--- | :--- |
| **VM Name** | `vm-quantzing` (`VM.Standard.A1.Flex`, 1 OCPU / 6 GB RAM, Ubuntu 24.04 ARM64) |
| **Public IPv4** | `130.210.86.242` |
| **Private IPv4** | `10.1.1.131` (`quant-vcn` / `quant-public`) |
| **App Service** | `quantzing.service` (`systemd`, Node.js 24, `127.0.0.1:3008`, `QUANTZING_DATA_DIR=/var/lib/quantzing`) |
| **Edge Proxy** | Caddy 2 (`:80` + `:443` auto-TLS for `quantzing.quantrinity.in`, `quantzing.com`, `quantzing.in`) |

### Cloudflare DNS Record for `quantzing.quantrinity.in`

In Cloudflare DNS for the **`quantrinity.in`** zone:

| Type | Name | Content / IPv4 | Proxy Status |
| :--- | :--- | :--- | :--- |
| `A` | `quantzing` | `130.210.86.242` | DNS Only (grey) or Proxied (orange with SSL **Full**) |

Once `quantzing.quantrinity.in` resolves to `130.210.86.242`, Caddy automatically issues a Let's Encrypt TLS certificate and serves **`https://quantzing.quantrinity.in`**.

---

## 3. Docker & Custom Domain Deployment (`quantzing.com` / `quantzing.in`)

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

---

## 5. Isolated Employee Operations Portal (`quantzing-ops.quantrinity.in` / `ops.quantzing.quantrinity.in`)

Internal moderation, trust & safety, verification, support, and platform operations run on a **dedicated, isolated employee hostname** (`https://quantzing-ops.quantrinity.in`, `https://ops.quantzing.quantrinity.in`, and `https://ops.quantzing.com`). The public consumer web and mobile bundles (`src/`) contain **zero** admin routes, admin screens, or admin API clients.

> **Recommended live hostname:** Use single-level **`https://quantzing-ops.quantrinity.in`** on the `quantrinity.in` zone — it is 100% covered by **Cloudflare Free Universal SSL** (`*.quantrinity.in`) and **Cloudflare Zero Trust Access (Free plan, 50 seats)**. Once `quantzing.com` is purchased, single-level **`https://ops.quantzing.com`** is likewise covered by Free Universal SSL (`*.quantzing.com`).

### DNS & Edge Reverse Proxy

Add DNS `A` record(s) pointing the ops hostname(s) to `vm-quantzing`:

| Type | Name | Content / IPv4 | Proxy Status |
| :--- | :--- | :--- | :--- |
| `A` | `quantzing-ops` | `130.210.86.242` | **Proxied** (recommended — Free Universal SSL + Cloudflare Zero Trust Access) |
| `A` | `ops.quantzing` | `130.210.86.242` | DNS Only (Let's Encrypt via Caddy) or Proxied (requires Cloudflare ACM for 2nd-level subdomain) |

`deploy/Caddyfile` routes `quantzing-ops.quantrinity.in`, `ops.quantzing.quantrinity.in`, and `ops.quantzing.com` to `127.0.0.1:3008` with strict isolation headers (`X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`) and forwards `X-Forwarded-Host {host}` so `scripts/serve-quantzing.mjs` serves only the isolated `ops-portal/` bundle and ops APIs.

### Department RBAC Roles (5 Roles)

Every employee account is assigned one of five least-privilege department roles:

| Role | Department | Permitted Scope |
| :--- | :--- | :--- |
| `super_admin` | Platform Engineering / Founders | Full access: employee onboarding/offboarding, role changes, backups, system telemetry, audit log review, and all moderation/verification actions |
| `l2_trust_safety` | Trust & Safety (L2) | High-severity enforcement: permanent bans, multi-day suspensions, appeal adjudication, post takedowns, content labeling, and escalated reports |
| `l1_moderator` | Moderation Queue (L1) | Frontline triage: open report review, warnings, content labels, post takedowns, short-term suspensions, and escalation to L2 |
| `verification_ops` | Verification & Authenticity | Identity & creator verification approvals, badge revocations, and authenticity review |
| `support_agent` | User Support | Account/post lookup, ticket & appeal triage notes, and escalation without destructive moderation privileges |

### Enabling Cloudflare Zero Trust Access (Free Plan — 50 Seats)

Protect `quantzing-ops.quantrinity.in` (and `ops.quantzing.com` once active) with Cloudflare Zero Trust Access (free up to 50 employee seats) before opening employee access:

1. In Cloudflare DNS for `quantrinity.in`, ensure `quantzing-ops` is **Proxied** (orange cloud) and SSL/TLS encryption mode is set to **Full (Strict)** (covered automatically by Cloudflare Free Universal SSL).
2. Open **Cloudflare Zero Trust -> Access -> Applications -> Add an application -> Self-hosted**.
3. Set **Application name** to `QuantZing Employee Ops Portal` and **Application domain** to `quantzing-ops.quantrinity.in` (add `ops.quantzing.quantrinity.in` and/or `ops.quantzing.com` as additional domains if active).
4. Configure an **Allow** policy restricting access to authorized employee identities (e.g., corporate emails or an IdP group via Google Workspace, Okta, or One-Time PIN).
5. Set **Session Duration** (recommended: `8 hours`) and enable **Block all non-matching requests** so unauthorized visitors are stopped at Cloudflare's edge before reaching Caddy or Node.

### Employee Onboarding & Offboarding

**Onboarding a new employee:**
1. Add the employee's corporate email (or IdP group membership) to the Cloudflare Zero Trust Access policy for `quantzing-ops.quantrinity.in` (and `ops.quantzing.quantrinity.in` / `ops.quantzing.com` if configured).
2. Sign in to `https://quantzing-ops.quantrinity.in` with a `super_admin` account, open the employee management view, and provision the employee account with the minimum required department role (`l2_trust_safety`, `l1_moderator`, `verification_ops`, or `support_agent`).
3. Deliver initial credentials over a secure channel and confirm the employee updates their password on first sign-in.

**Offboarding an employee (immediate revocation):**
1. Remove the employee from the Cloudflare Zero Trust Access policy and revoke their active Access session in Cloudflare Zero Trust (**Users -> Revoke tokens**).
2. In `https://quantzing-ops.quantrinity.in`, sign in as `super_admin` and deactivate/revoke the employee's staff account immediately (invalidating active ops tokens and writing an immutable audit entry).
3. Confirm in the **Audit Log** that revocation succeeded and no further requests are accepted for that employee account.
