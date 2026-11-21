# QuantZing (`quantzing.com` · `quantzing.in`)

**QuantZing** is the flagship real-time social conversation, breaking news, live audio, and creator publishing platform in the QuantOS ecosystem. Built on React Native, Expo, and a sovereign AT Protocol (ATProto) hybrid Personal Data Server (PDS), QuantZing pairs a true-black X-Dark interface with open-protocol data portability, **ZingSpaces** audio rooms, long-form **Articles Studio**, **Creator Studio** (70/30 creator revenue share), and **Quanty** (including automatic inline `@quanty` mention replies in public threads).

- **Production Domains:** [`https://quantzing.com`](https://quantzing.com) · [`https://quantzing.in`](https://quantzing.in)
- **Repository:** [`https://github.com/quantrinitylab/quant-zing`](https://github.com/quantrinitylab/quant-zing)
- **Bundle / Application ID:** `com.quantzing.app`

---

## QuantZing Culture & Feature Matrix

| Capability | QuantZing Vocabulary | Experience & Architecture |
| :--- | :--- | :--- |
| **Post** | **Zing** | Real-time public posts with 4K media, threads, polls, and cryptographic ATProto records (`app.bsky.feed.post`). |
| **Repost** | **Rezing** | Instant one-tap amplification (`#00BA7C` Rezing green) across follower timelines. |
| **Quote Post** | **Quote Zing** | Commentary layered directly over an embedded Zing with full thread provenance. |
| **Composer Prompt** | **"What's zinging?"** | Multi-modal Zing composer with inline media, thread splitting, and reply-gate controls. |
| **Live Audio** | **ZingSpaces** | Real-time multi-speaker audio stages (`/spaces`) with host moderation, speaker requests, and live reactions. |
| **Long-Form Publishing** | **Articles Studio** | Markdown-native long-form essay publishing (`/articles`) with cover presets, reading-time calculation, and one-click Zing syndication. |
| **Creator Monetization** | **Creator Studio** | Real-time impression analytics, engagement velocity, and transparent **70% Creator / 30% Platform** net ad revenue share (`/studio`). |
| **Membership Tiers** | **QuantZing Pro** | **Zing Basic**, **Zing Pro**, and **Zing Pro+** verification badges, extended character limits, and priority capabilities (`/pro`). |
| **Native AI** | **Quanty** + **`@quanty`** | Dedicated `/quanty` research workspace (Ask, DeepSearch, Draft Zing, News) plus automatic inline `@quanty` mention replies inside any Zing thread. |

---

## System Architecture

```
+-----------------------------------------------------------------------------------+
|                        QuantZing Client (Web / iOS / Android)                     |
|   React 19.3 + React Native 0.88 + Expo 58 + ALF True-Black X-Dark Design System  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|              QuantZing Sovereign Gateway & Hybrid ATProto PDS (:3008)             |
|                scripts/serve-quantzing.mjs + scripts/quantzing-pds.mjs            |
|                                                                                   |
|  +---------------------------+  +-----------------------+  +-------------------+  |
|  | Local Sovereign XRPC PDS  |  | @quanty Thread Engine |  | Public AppView    |  |
|  | .quantzing.com / .in DIDs |  | Auto-replies to any   |  | Federation Proxy  |  |
|  | Persistent JSON + Blobs   |  | Zing mentioning       |  | public.api.bsky   |  |
|  | Auth, Feeds, Likes, Follow|  | @quanty in thread     |  | .app read merge   |  |
|  +---------------------------+  +-----------+-----------+  +-------------------+  |
+---------------------------------------------|-------------------------------------+
                                              |
                     +------------------------+------------------------+
                     |                        |                        |
                     v                        v                        v
        +------------------------+ +------------------------+ +--------------------+
        |   /api/quant-ai        | |   /api/quant-router    | |  /api/quant-pay    |
        |   QuantAI (:4240)      | |   QuantRouter (:4003)  | |  QuantPay (:4002)  |
        |   DeepSearch & Grounded| |   Multi-Model LLM      | |  QuantZing Pro &   |
        |   Social Synthesis     | |   Inference Gateway    | |  70/30 Payouts     |
        +------------------------+ +------------------------+ +--------------------+
```

### Core Components

1. **Cross-Platform Client (`src/`)**
   - Built with React Native Web and Expo 58 using the Application Layout Framework (`src/alf/`) tuned to the X-Dark palette (`#000000` canvas, `#16181C` cards, `#202327` inputs, `#2F3336` borders, `#E7E9EA` primary text, `#71767B` muted text, `#1D9BF0` electric blue accent, `#F91880` like pink, `#00BA7C` Rezing green).
   - First-class QuantZing domain screens in `src/screens/QuantZing/`: `QuantyScreen`, `ZingSpacesScreen`, `ArticlesScreen`, `CreatorStudioScreen`, `QuantZingProScreen`, `HelpScreen`, `TermsScreen`, and `PrivacyScreen`.
2. **Sovereign ATProto Hybrid PDS (`scripts/quantzing-pds.mjs`)**
   - Full local and production-capable ATProto Personal Data Server issuing `@handle.quantzing.com` and `@handle.quantzing.in` identities.
   - Persists accounts, sessions, Zings, Rezings, likes, follows, profiles, notifications, and uploaded media blobs in `.quantzing-data/` while seamlessly federating read hydration with `https://public.api.bsky.app`.
   - Includes the built-in **`@quanty` Mention Auto-Reply Engine**: whenever any user publishes a Zing or reply containing `@quanty`, the PDS synthesizes a grounded reply from `@quanty.quantzing.com` directly inside the thread.
3. **QuantOS Service Adapter (`scripts/serve-quantzing.mjs` & `src/lib/quantos/client.ts`)**
   - `/api/quant-ai/*` routes to **QuantAI** (`http://127.0.0.1:4240`).
   - `/api/quant-router/*` routes to **QuantRouter** (`http://127.0.0.1:4003`).
   - `/api/quant-pay/*` routes to **QuantPay** (`http://127.0.0.1:4002`) for **QuantZing Pro** subscriptions and **70/30 Creator Studio** payouts.

---

## Quickstart (Local Development & Production Web Server)

### Prerequisites
- **Node.js:** `>= 24.7.0`
- **Package Manager:** `pnpm` `10.28.1`

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Build the Production Web Bundle
```bash
pnpm build-web
```

### 3. Start the QuantZing Sovereign Gateway & Hybrid PDS
```bash
pnpm serve:web
```
Open **`http://localhost:3008`** in your browser.

- **Health Check:** `GET http://localhost:3008/api/health`
- **Create Account / Sign In:** Register any `@handle.quantzing.com` account directly from the onboarding flow or sign in with a seeded account.
- **Test `@quanty` in a Thread:** Publish a Zing containing `@quanty` (for example, `What is driving semiconductor capex this quarter? @quanty`) and open the thread to see `@quanty.quantzing.com` reply automatically.

---

## Cloud & Docker Deployment

QuantZing ships with turnkey container and reverse-proxy configurations for deploying `quantzing.com` and `quantzing.in`:

- **Comprehensive Guide:** See [`DEPLOYMENT_AND_PLAY_STORE.md`](./DEPLOYMENT_AND_PLAY_STORE.md) and [`QUANTZING_ARCHITECTURE.md`](./QUANTZING_ARCHITECTURE.md).
- **Container Build:** [`Dockerfile`](./Dockerfile) packages the compiled `dist/` web bundle alongside `scripts/serve-quantzing.mjs` and `scripts/quantzing-pds.mjs`.
- **Production Compose Stack:** [`docker-compose.prod.yml`](./docker-compose.prod.yml) mounts persistent volumes for `.quantzing-data/` and connects the gateway to QuantAI, QuantRouter, and QuantPay.
- **Reverse Proxy & Systemd:** Ready-to-use templates live under `deploy/` (Caddy, Nginx, and systemd service units).

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Google Play Store & Apple App Store Builds

QuantZing is configured for native Android and iOS builds under the `com.quantzing.app` identifier:

- **Expo Configuration:** [`app.config.js`](./app.config.js) (`scheme: "quantzing"`, associated domains `quantzing.com` and `quantzing.in`).
- **EAS Build Profiles:** [`eas.json`](./eas.json) defines `development`, `preview`, and `production` profiles for Android App Bundles (`.aab`) and iOS archives (`.ipa`).

```bash
# Generate native Android & iOS directories
pnpm prebuild

# Build production Android App Bundle (.aab) via EAS
pnpm build-android

# Build production iOS archive (.ipa) via EAS
pnpm build-ios
```

See [`DEPLOYMENT_AND_PLAY_STORE.md`](./DEPLOYMENT_AND_PLAY_STORE.md) for Play Console Data Safety declarations, Digital Asset Links (`/.well-known/assetlinks.json`), Apple Universal Links (`/.well-known/apple-app-site-association`), and store listing checklists.

---

## License & Attribution

QuantZing source code is licensed under the **MIT License**.

- **Primary License:** See [`LICENSE`](./LICENSE) — `Copyright (c) 2026 QuantZing (Quantrinity Lab / QuantOS)`, with upstream attribution `Portions Copyright (c) 2023-2026 Bluesky Social PBC (MIT License)`.
- **Third-Party Font & Library Notices:** See [`NOTICE.md`](./NOTICE.md).
- **Asset Licensing & Carve-Out Documentation:** See [`ASSETS.md`](./ASSETS.md) and [`QUANTZING_ARCHITECTURE.md`](./QUANTZING_ARCHITECTURE.md).

For legal, copyright, privacy, or security inquiries:
- **General Support:** `support@quantzing.com`
- **Legal & DMCA:** `legal@quantzing.com`
- **Privacy & Data Protection:** `privacy@quantzing.com`
- **Trust & Safety:** `safety@quantzing.com`
