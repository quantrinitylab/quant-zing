# QuantWave — Sovereign Standalone ATProto Social App

`quant-wave` is a standalone, separate QuantOS domain repository forked from [`bluesky-social/social-app`](https://github.com/bluesky-social/social-app) under the **MIT License** (see [`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md)).

## What Was Customized for QuantWave
- **Brand Identity & Design System:** Replaced upstream butterfly emblem and wordmark with original QuantWave Q-Wave emblem ([`src/view/icons/Logo.tsx`](./src/view/icons/Logo.tsx)) and wordmark ([`src/view/icons/Logotype.tsx`](./src/view/icons/Logotype.tsx)), X-Dark true-black default dark mode (`#000000` canvas, `#16181C` cards, `#2F3336` borders, `#EFF3F4`/`#0F1419` crisp white pill CTAs, `#1D9BF0` electric blue accent, `#F91880` heart, `#00BA7C` rewave green), plus X-Dim (`#15202B`) and X-Light (`#FFFFFF`) themes.
- **Zero-Trademark Consumer Shell:** Updated HTML splash screen ([`public/index.html`](./public/index.html)), page titles ([`src/lib/strings/headings.ts`](./src/lib/strings/headings.ts)), navigation cards, search copy, and Expo config ([`app.config.js`](./app.config.js)).
- **ATProto Interoperability:** Connects live out-of-the-box to the open ATProto network (`public.api.bsky.app`) and supports custom sovereign QuantWave PDS endpoints.

## Pre-Production Asset Hygiene Checklist (`ASSETS.md`)
Upstream source code is **MIT**, while certain upstream static artwork directories are excluded per [`ASSETS.md`](./ASSETS.md):
- [x] Replaced Bluesky brand logo, wordmark, splash SVG, and favicon (`Logo.tsx`, `Logotype.tsx`, `public/index.html`).
- [ ] Before public App Store / production commercial release, replace remaining carved-out directories: `assets/icons/ui/` (swap to MIT Lucide/Phosphor icons), `assets/illustrations/`, `assets/app-icons/`, and `assets/images/`.
