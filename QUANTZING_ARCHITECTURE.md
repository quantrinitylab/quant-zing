# QuantZing Architecture & Technical Specification

**QuantZing** (`quantzing.com` · `quantzing.in`) is a sovereign, standalone real-time social, live audio, and creator publishing platform inside the QuantOS ecosystem. Forked from [`bluesky-social/social-app`](https://github.com/bluesky-social/social-app) under the **MIT License** (see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md)), QuantZing replaces upstream branding, color palettes, legal stubs, and static hosting assumptions with a sovereign ATProto hybrid Personal Data Server (PDS), the **Quanty** intelligence engine, and first-class creator monetization.

---

## 1. X-Dark True-Black Design System & Tokens

QuantZing implements an X.com-inspired True-Black design system across `src/alf/themes.ts`, `src/alf/util/colorGeneration.ts`, and `src/lib/quantos/client.ts` (`getQuantZingColors`).

| Token Role | X-Dark (`dark`) | X-Light (`light`) | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas (`bg`)** | `#000000` | `#FFFFFF` | Primary screen and timeline background |
| **Elevated Card (`card`)** | `#16181C` | `#F7F9F9` | Feed cards, sidebars, and modal surfaces |
| **Input / Surface (`surface`)** | `#202327` | `#EFF3F4` | Search bars, form fields, and secondary pills |
| **Hairline Border (`border`)** | `#2F3336` | `#EFF3F4` | 1px structural dividers and card outlines |
| **Primary Text (`text`)** | `#E7E9EA` | `#0F1419` | Headlines, Zing body copy, and navigation labels |
| **Muted Text (`muted`)** | `#71767B` | `#536471` | Handles, timestamps, and metadata counters |
| **Primary Accent (`accent`)** | `#1D9BF0` | `#1D9BF0` | Electric blue links, verified badges, and active tabs |
| **Primary CTA Pill (`ctaBg` / `ctaText`)** | `#EFF3F4` / `#0F1419` | `#0F1419` / `#FFFFFF` | High-contrast primary action buttons |
| **Like / Heart (`like`)** | `#F91880` | `#F91880` | Like interactions and active heart counters |
| **Rezing (`rezing`)** | `#00BA7C` | `#00BA7C` | Rezing counters, positive deltas, and verified checks |

### Strict Visual Invariants
- **Zero Emojis in UI Chrome:** All navigation tabs, badges, action bars, and headers use crisp monochrome SVG icons (`src/components/icons/`).
- **Zero Amber/Orange Accents:** Status indicators use electric blue (`#1D9BF0`), Rezing green (`#00BA7C`), or rose pink (`#F91880`).
- **Zero Client-Side BYO API Key Drawers:** Quanty operates seamlessly through the server-side QuantOS gateway without exposing API key configuration drawers to end users.

---

## 2. Sovereign ATProto Hybrid PDS (`scripts/quantzing-pds.mjs`)

QuantZing includes a zero-dependency Node.js ATProto Personal Data Server and AppView proxy that runs inside `scripts/serve-quantzing.mjs` on port `3008`.

### Handle Domains & Identity Resolution
- Issues first-party handles under `.quantzing.com` and `.quantzing.in` (e.g., `@you.quantzing.com`).
- Automatically seeds `@quanty.quantzing.com` (**Quanty**, `did:plc:quantzingquantyai000001`) as an official system account.
- Persists state in `.quantzing-data/pds-state.json` and binary media uploads in `.quantzing-data/blobs/`.

### Supported XRPC Endpoints
| Namespace | Endpoints | Behavior |
| :--- | :--- | :--- |
| **Server & Session** | `com.atproto.server.describeServer`, `createAccount`, `createSession`, `refreshSession`, `deleteSession`, `getSession`, `requestPasswordReset`, `resetPassword`, `checkAccountStatus` | Local account registration, JWT issuance, password reset, and sovereign `.quantzing.com` / `.quantzing.in` handle binding. |
| **Identity** | `com.atproto.identity.resolveHandle` | Resolves local QuantZing handles immediately; proxies external ATProto handles to `public.api.bsky.app`. |
| **Repository & Blobs** | `com.atproto.repo.createRecord`, `putRecord`, `deleteRecord`, `getRecord`, `listRecords`, `describeRepo`, `uploadBlob`, `com.atproto.sync.getBlob` | Full CRUD for `app.bsky.feed.post` (Zings), `app.bsky.feed.repost` (Rezings), `app.bsky.feed.like`, `app.bsky.graph.follow`, and `app.bsky.actor.profile`. |
| **Feeds & Threads** | `app.bsky.feed.getTimeline`, `getAuthorFeed`, `getPostThread`, `getPosts`, `getActorLikes`, `getFeed`, `getFeedGenerators`, `getSuggestedFeeds`, `searchPosts` | Merges sovereign local Zings with live federated ATProto feeds for a populated timeline on first boot. |
| **Actors & Graph** | `app.bsky.actor.getProfile`, `getProfiles`, `getPreferences`, `putPreferences`, `searchActors`, `searchActorsTypeahead`, `getSuggestions`, `app.bsky.graph.getFollows`, `getFollowers` | Local profile persistence, avatar/banner upload rendering, and social graph traversal. |
| **Notifications & Unspecced** | `app.bsky.notification.listNotifications`, `getUnreadCount`, `updateSeen`, `app.bsky.unspecced.getConfig`, `getTrendingTopics`, `getTrends`, `getPopularFeedGenerators` | Real-time notifications for likes, Rezings, follows, replies, and `@quanty` thread responses. |

---

## 3. `@quanty` Inline Thread Auto-Reply Engine

When a user publishes a Zing or reply via `com.atproto.repo.createRecord` (`collection === 'app.bsky.feed.post'`):

1. **Detection:** `scripts/quantzing-pds.mjs` inspects the Zing text for `@quanty` (case-insensitive) and ensures the author is not `@quanty.quantzing.com` itself (preventing recursive loops).
2. **Context Extraction:** Strips the `@quanty` trigger token, inspects parent/root Zing context if the post is inside an existing thread, and forwards the prompt to the QuantOS intelligence gateway.
3. **Multi-Tier Inference Cascade:**
   - **Primary:** QuantAI (`http://127.0.0.1:4240/api/chat` or `/v1/chat/completions`)
   - **Secondary:** QuantRouter (`http://127.0.0.1:4003/v1/chat/completions`)
   - **Fallback:** Built-in deterministic synthesis so `@quanty` always responds reliably even in air-gapped or offline environments.
4. **Thread Record & Notification Creation:** Writes a signed reply record authored by `@quanty.quantzing.com` linked to the caller's `root` and `parent` AT-URIs, increments parent reply counts, and emits a `reply` notification to the mentioning user.

---

## 4. QuantOS Service Adapter (`scripts/serve-quantzing.mjs` & `src/lib/quantos/client.ts`)

| Local Gateway Route | Upstream QuantOS Service | Default Upstream Port | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/quant-ai/*` | **QuantAI** | `127.0.0.1:4240` | Quanty Ask, DeepSearch, Draft Zing, News synthesis, and feed explainers |
| `/api/quant-router/*` | **QuantRouter** | `127.0.0.1:4003` | Multi-model LLM routing and fallback completion |
| `/api/quant-pay/*` | **QuantPay** | `127.0.0.1:4002` | QuantZing Pro tier checkout and Creator Studio 70/30 payout ledger |
| `/api/health` | **QuantZing Gateway** | `127.0.0.1:3008` | Service health, PDS status, and upstream reachability probe |

---

## 5. Asset Licensing & Pre-Store Compliance Checklist (`ASSETS.md`)

QuantZing source code is licensed under the **MIT License** ([`LICENSE`](./LICENSE)). Per upstream [`ASSETS.md`](./ASSETS.md), specific static asset directories have separate licensing rules:

- [x] **Brand Logo, Wordmark & Splash Screen:** Replaced upstream butterfly emblem and wordmark with original QuantZing Q-Bolt vector mark (`src/view/icons/Logo.tsx`, `src/view/icons/Logotype.tsx`, `public/index.html`, `web/index.html`).
- [x] **Legal, Support & Policy Screens:** Replaced all `bsky.social` external redirects with native QuantZing screens (`TermsScreen`, `PrivacyScreen`, `HelpScreen`, `CommunityGuidelinesScreen`, `CopyrightPolicyScreen`).
- [x] **Redistributable Fonts & Flags Preserved with Notices:** Inter (SIL OFL 1.1), Noto Sans (SIL OFL 1.1), Material Icons (Apache 2.0), and `country-flag-icons` (MIT) are documented in [`NOTICE.md`](./NOTICE.md).
- [ ] **Commercial App Store Asset Audit:** Prior to public binary distribution on Google Play or Apple App Store, verify that any remaining static files under `assets/illustrations/` and `assets/images/` are replaced with first-party QuantZing artwork.
