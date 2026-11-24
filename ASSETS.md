# QuantZing Asset Licensing & Provenance Guide

The [MIT License](./LICENSE) in this repository covers the **QuantZing** (`quantzing.com` · `quantzing.in`) source code (`Copyright (c) 2026 QuantZing / Quantrinity Lab / QuantOS`, with upstream attribution `Portions Copyright (c) 2023-2026 Bluesky Social PBC`). It does not cover every static media file in the repository tree.

This document records the licensing status of first-party QuantZing brand assets, permissively redistributable fonts/icons, and legacy upstream asset directories inherited from the upstream ATProto repository so downstream builders and release engineers have an unambiguous compliance reference.

---

## Summary Matrix

| Directory / Path | Rights Holder | Covered by Source MIT License? | QuantZing Status / Downstream Rule |
| :--- | :--- | :--- | :--- |
| **QuantZing Brand Marks** (`src/view/icons/Logo.tsx`, `src/view/icons/Logotype.tsx`, `public/index.html`) | QuantZing (Quantrinity Lab / QuantOS) | Brand mark (Trademarks reserved) | First-party QuantZing Q-Bolt emblem and wordmark |
| [`assets/fonts/inter/`](#1-permissively-licensed-assets-safe-to-redistribute), Inter files in `bskyogcard/src/assets/fonts/` | The Inter Project Authors | Separate — SIL OFL 1.1 | **Keep, with the OFL notice in `NOTICE.md`** |
| [Noto fonts downloaded by `bskyogcard/scripts/install-fonts.ts`](#1-permissively-licensed-assets-safe-to-redistribute) | Adobe, Google LLC, and The Noto Project Authors | Separate — SIL OFL 1.1 | **Keep, with the OFL notice in `NOTICE.md`** |
| [`assets/icons/flags/`](#1-permissively-licensed-assets-safe-to-redistribute) | @catamphetamine | Separate — MIT | **Keep, with the license in `assets/icons/flags/LICENSE`** |
| [`bskyweb/static/media/MaterialIcons.*.ttf`](#1-permissively-licensed-assets-safe-to-redistribute) | Google, Inc. | Separate — Apache 2.0 | **Keep, with the Apache 2.0 notice in `NOTICE.md`** |
| [`assets/icons/brands/AppleLogo.svg`, `AndroidLogo.svg`, `assets/icons/community/`](#3-third-party-nominative-trademarks) | Apple Inc., Google LLC, and respective platform owners | No | Nominative identification of external platforms |
| ~~assets/illustrations/~~ (purged) | Owen D. Pomery, via Brilliant Artists Ltd (upstream license) | No | **Purged from repository**; replaced by QuantZing monochrome welcome screens (`src/view/com/auth/NativeSplashScreen.tsx`, `src/view/com/auth/SplashScreen.web.tsx`) |
| [`assets/icons/ui/`](#4-legacy-upstream-carved-out-directories) | Iconists (David & Storm GbR) | No | Carved out from MIT; license directly or replace for third-party forks |
| [`assets/images/`](#4-legacy-upstream-carved-out-directories) | Mixed upstream provenance | No | Carved out from MIT; replace or omit in commercial binary builds |

---

## 1. Permissively Licensed Assets Safe to Redistribute

These assets are licensed on open terms that permit redistribution in QuantZing and derivative builds, provided their license texts and notices in [`NOTICE.md`](./NOTICE.md) remain intact:

| Asset | Path | Rights Holder | License | Notice Location |
| :--- | :--- | :--- | :--- | :--- |
| **Inter Typeface** | `assets/fonts/inter/`, `bskyogcard/src/assets/fonts/Inter-*.ttf` | The Inter Project Authors | SIL Open Font License 1.1 | [`OFL.txt`](./assets/fonts/inter/OFL.txt) |
| **Noto Sans Families** | `bskyogcard/scripts/install-fonts.ts` | Adobe, Google LLC, The Noto Project Authors | SIL Open Font License 1.1 | [`OFL-NOTO.txt`](./bskyogcard/src/assets/fonts/OFL-NOTO.txt) |
| **country-flag-icons** | `assets/icons/flags/` | @catamphetamine | MIT | [`LICENSE`](./assets/icons/flags/LICENSE) |
| **Material Icons** | `bskyweb/static/media/MaterialIcons.*.ttf` | Google, Inc. | Apache License 2.0 | [`NOTICE.md`](./NOTICE.md) |

---

## 2. QuantZing First-Party Brand Assets & Trademarks

**Rights Holder: QuantZing (Quantrinity Lab / QuantOS).** The **QuantZing** name, **Zing**, **Rezing**, **ZingSpaces**, **Quanty**, and the QuantZing Q-Bolt vector emblem in `src/view/icons/Logo.tsx` and `src/view/icons/Logotype.tsx` identify the QuantZing platform (`quantzing.com` · `quantzing.in`). If you fork `quantrinitylab/quant-zing` to launch a separate product, replace the QuantZing brand marks and domain identifiers with your own.

---

## 3. Third-Party Nominative Trademarks

Logos in `assets/icons/brands/` (`AppleLogo.svg`, `AndroidLogo.svg`), `assets/icons/community/`, and share-sheet icons in `src/components/ShareDialog/icons.tsx` belong to their respective owners (Apple Inc., Google LLC, Discord, Meta Platforms, Reddit, Signal, Snap Inc., Telegram, X Corp., etc.) and are used strictly for nominative identification of external sign-in providers and share targets.

---

## 4. Legacy Upstream Carved-Out Directories

Per upstream repository disclosures:
- **~~assets/illustrations/~~ (purged)**: Commissioned illustration files originally licensed exclusively to Bluesky Social PBC by Owen D. Pomery have been removed from the QuantZing repository. QuantZing's web and native onboarding flows use QuantZing's monochrome first-party brand components (`src/view/icons/Logo.tsx`, `src/view/com/auth/NativeSplashScreen.tsx`, and `src/view/com/auth/SplashScreen.web.tsx`).
- **`assets/icons/ui/`**: Glyph files from the Central icon system (Iconists / David & Storm GbR). Any downstream commercial distribution must either hold an Iconists license or substitute open-source SVG icons.
- **~~assets/kawaii.png~~ and ~~assets/kawaii_smol.png~~ (purged), and `assets/images/`**: Legacy upstream mascot graphics (`kawaii.png` / `kawaii_smol.png`) have been purged; remaining `assets/images/` files are legacy upstream product graphics not covered by the MIT source code license.

---

## Questions & Legal Contact

For questions regarding QuantZing licensing, attribution, or asset provenance in `quantrinitylab/quant-zing`, contact [`legal@quantzing.com`](mailto:legal@quantzing.com).
