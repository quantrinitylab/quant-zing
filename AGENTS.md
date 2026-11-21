# AGENTS.md – QuantZing Development Guide

This document provides guidance for working effectively in the **QuantZing** (`quantzing.com` · `quantzing.in`) codebase (`https://github.com/quantrinitylab/quant-zing`).

## Project Overview

**QuantZing** is a cross-platform real-time social media, live audio (**ZingSpaces**), long-form publishing (**Articles Studio**), creator monetization (**Creator Studio** 70/30 split), and AI (**Quanty** + inline `@quanty` thread replies) application built with React Native and Expo. It runs on Web, iOS, and Android, powered by the QuantZing Sovereign ATProto Hybrid PDS (`scripts/quantzing-pds.mjs`) and the open AT Protocol (atproto) network.

**QuantZing Vocabulary & Design Invariants:**
- **Brand:** QuantZing (`quantzing.com` / `quantzing.in`)
- **Post:** Zing · **Repost:** Rezing · **Quote Post:** Quote Zing · **Composer Prompt:** `"What's zinging?"`
- **Live Audio:** ZingSpaces (`/spaces`) · **Long-Form:** Articles Studio (`/articles`) · **Analytics & Payouts:** Creator Studio (`/studio`) · **Subscriptions:** QuantZing Pro (`/pro`) · **AI:** Quanty (`/quanty` and `@quanty` inline thread mentions)
- **Palette:** X.com True Dark (`#000000` canvas, `#16181C` cards, `#202327` inputs, `#2F3336` borders, `#E7E9EA` text, `#71767B` muted, `#1D9BF0` electric blue accent, `#EFF3F4`/`#0F1419` primary CTA pills, `#F91880` like, `#00BA7C` Rezing). Zero emojis in UI labels/headers/badges/buttons, and zero amber/orange accents.

**Tech Stack:**

- React 19.3
- React Native 0.88 with Expo 58
- TypeScript 7
- React Navigation 7 for routing
- TanStack Query (React Query) for data fetching
- Lingui 5 for internationalization
- Custom design system called ALF (Application Layout Framework) + `getQuantZingColors` (`src/lib/quantos/client.ts`)

Prefer using the latest features available for each of these libraries (exact versions are found in `package.json`). For example, prefer `@lingui/react/macro` over `@lingui/react`. Suggest refactoring legacy or deprecated uses.

## Essential Commands

```bash
# Development & Production Sovereign Web Server
pnpm serve:web          # Start QuantZing Sovereign Gateway + Hybrid PDS on http://localhost:3008
pnpm start              # Start Expo dev server
pnpm web                # Start Expo web dev server
pnpm android            # Run on Android
pnpm ios                # Run on iOS

# Testing & Quality
# IMPORTANT: Always use these pnpm scripts, never call the underlying tools directly
pnpm test               # Run Jest tests
pnpm lint               # Run Oxlint
pnpm typecheck          # Run TypeScript type checking
pnpm prettier           # Run Prettier for code formatting

# Internationalization
# DO NOT run these commands - extraction and compilation are handled by CI
pnpm intl:extract       # Extract translation strings (nightly CI job)
pnpm intl:compile       # Compile translations for runtime (nightly CI job)

# Build
pnpm build-web          # Build production web bundle into dist/
pnpm prebuild           # Generate native Android & iOS projects
```

## Project Structure

```
src/
├── alf/                    # Design system (ALF) - X-Dark / X-Light themes, atoms, tokens
├── components/             # Shared UI components (Button, Dialog, Menu, QuantyDock, etc.)
├── screens/                # Full-page screen components (including src/screens/QuantZing/*)
├── features/               # Macro-features that bridge components/screens
├── view/
│   ├── screens/            # Full-page screens (legacy location + legal screens)
│   ├── com/                # Reusable view components
│   └── shell/              # App shell (navigation bars, tabs, Composer)
├── state/
│   ├── queries/            # TanStack Query hooks
│   ├── preferences/        # User preferences (React Context)
│   ├── session/            # Authentication state
│   └── persisted/          # Persistent storage layer
├── lib/                    # Utilities, constants, QuantOS client (src/lib/quantos/client.ts)
├── locale/                 # i18n configuration and language files
└── Navigation.tsx          # Main navigation configuration
scripts/
├── serve-quantzing.mjs     # Production web server + QuantOS proxy (:3008)
└── quantzing-pds.mjs       # Sovereign ATProto Hybrid PDS + @quanty auto-reply engine
```

### Project Structure in Depth

When building new things, follow these guidelines for where to put code.

#### Components vs Screens vs Features

**Components** are reusable UI elements that are not full screens. Should be
platform-agnostic when possible. Examples: Button, Dialog, Menu, TextField. Put
these in `/components` if they are shared across screens.

**Screens** are full-page components that represent a route in the app. They
often contain multiple components and handle layout for a page. New screens
should go in `/screens` (and QuantZing domain screens in `/screens/QuantZing`)
to encourage better organization and separation from legacy code.

For complex screens that have specific components or data needs that _are not
shared by other screens_, we encourage subdirectories within `/screens/<name>`
e.g. `/screens/ProfileScreen/ProfileScreen.tsx` and
`/screens/ProfileScreen/components/`.

**Features** are higher-level modules that may include context, data fetching,
components, and utilities related to a specific feature e.g.
`/features/liveNow`. They don't neatly fit into components or screens and often
span multiple screens. This is an optional pattern for organizing complex
features.

#### Legacy Directories

For the most part, avoid writing new files into the `/view` directory and
subdirectories. This is the older pattern for organizing screens and components.
New development should go into `/screens`, `/components`, and `/features`.

#### State

The `/state` directory is where we put data fetching and state management logic.
For new features, consider organizing state logic closer to the components that
use it, either within a feature directory or co-located with a screen.

#### Lib

The `/lib` directory is for utilities and helpers that don't fit into other
categories, including `src/lib/quantos/client.ts` for QuantZing colors, Quanty
AI helpers, Articles persistence, Creator Studio telemetry, and QuantPay checkout.

### File and Directory Naming Conventions

Typically JS style for variables, functions, etc. We use ProudCamelCase for
components, and camelCase directories and files.

### Comments

Comment code when necessary to explain the "why" behind something; avoid
comments that simply describe the code. Avoid Unicode characters in comments,
e.g., use `-` not `—`.

Always use docblock (`/** */`) syntax for comments that document a type, type
member, method, function, or variable.

## Styling System (ALF & QuantZing X-Dark Tokens)

ALF is the custom design system. Static atoms (`atoms as a`) are theme-independent;
theme atoms/palette come from `useTheme()` (`t.atoms.bg`, `t.palette.primary_500`)
and `getQuantZingColors(t.scheme === 'dark')` from `#/lib/quantos/client`.

Order atoms by: flexbox (`a.flex_row`), spacing (`a.px_md`), text (`a.font_bold`),
themes (`t.atoms.text`), then raw styles (`{backgroundColor: colors.card}`).

```tsx
import {atoms as a, useTheme} from '#/alf'

const t = useTheme()
<View style={[a.flex_row, a.gap_md, a.p_lg, t.atoms.bg]} />
```

**Platform utilities** (`import {web, native, ios, android, platform} from '#/alf'`)
return conditional styles inline in a style array: `web({cursor: 'pointer'})`,
`native({paddingBottom: 20})`.

**Breakpoints:** `const {gtPhone, gtMobile, gtTablet} = useBreakpoints()` from `#/alf`.

## Component Patterns

- Prefer fragment shorthand over `Fragment` unless a `key` is needed.
- Prefer functions over arrow functions for component declarations.
- Prefer prop destructuring via parameters over a const within the component.
- Prefer inline types over `Props` types or interfaces.
- Set reasonable defaults for optional props.
- Prefer the implicit global `React` for types over `type` imports.

### Dialog Component

Lives in `#/components/Dialog`. Bottom sheet on native, modal on web. Manage
state with `useDialogControl()`. `Dialog.Handle` renders native-only, `Dialog.Close`
web-only. CRITICAL: run any post-close action inside the `control.close(() => ...)`
callback.

### Menu Component

Lives in `#/components/Menu`. Dropdown on web, bottom sheet dialog on native.
`Menu.Divider` is web-only, `Menu.ContainerItem` native-only.

### Button Component

`import {Button, ButtonText, ButtonIcon} from '#/components/Button'`.

### TextField

Compound component at `#/components/forms/TextField` (`TextField.LabelText`,
`TextField.Root`, `TextField.Icon`, `TextField.Input`).

### Typography

`import {Text, H1, H2, P} from '#/components/Typography'`.

### Haptics

`const haptics = useHaptics()` from `#/lib/haptics`. Never import `expo-haptics` directly.

## Internationalization (i18n)

All user-facing strings must be wrapped for translation using Lingui (`@lingui/react/macro`).

```tsx
import {Trans, useLingui} from '@lingui/react/macro'

function MyComponent() {
  const {t: l} = useLingui()
  const title = l`Settings`

  return (
    <Text>
      <Trans>
        Welcome to <Text style={a.font_bold}>QuantZing</Text>!
      </Trans>
    </Text>
  )
}
```

## State Management

### TanStack Query (Data Fetching)

Follow the established pattern in `src/state/queries/`; `src/state/queries/feed.ts`
is a canonical reference.

### Session State

`import {useSession, useAgent} from '#/state/session'`. `useSession()` gives
`hasSession` and `currentAccount`; `useAgent()` gives the atproto agent for API calls.

## Navigation

React Navigation with type-safe route params. Config lives in `src/Navigation.tsx`,
routes in `src/routes.ts`, types in `src/lib/routes/types.ts`.

## Platform-Specific Code

Use file extensions for platform-specific implementations (`Component.tsx`,
`Component.web.tsx`, `Component.native.tsx`, `Component.ios.tsx`, `Component.android.tsx`).

Runtime platform detection: `import {IS_WEB, IS_NATIVE, IS_IOS, IS_ANDROID} from '#/env'`.

## Import Aliases

Always use the `#/` alias for absolute imports:

```tsx
import {useSession} from '#/state/session'
import {atoms as a, useTheme} from '#/alf'
import {getQuantZingColors} from '#/lib/quantos/client'
```

## Footguns

### Dialog Close Callback (Critical)

**Always use `control.close(() => ...)` when performing actions after closing a dialog.**

### React Compiler is Enabled

This codebase uses React Compiler, so **don't proactively add `useMemo` or `useCallback`** unless required for effect dependency stability or external non-React libraries.

### Patching react-native

`patches/react-native@<version>.patch` is generated - don't edit it directly. Use `patches/react-native/` and run `pnpm patch:react-native`.

## Key Files Reference

| Purpose                     | Location                                     |
| --------------------------- | -------------------------------------------- |
| Theme definitions           | `src/alf/themes.ts`                          |
| QuantZing colors & adapters | `src/lib/quantos/client.ts`                  |
| QuantZing domain screens    | `src/screens/QuantZing/*.tsx`                |
| Sovereign ATProto PDS       | `scripts/quantzing-pds.mjs`                  |
| Production Web Gateway      | `scripts/serve-quantzing.mjs`                |
| Navigation config           | `src/Navigation.tsx`                         |
| Route definitions           | `src/routes.ts`                              |
| Route types                 | `src/lib/routes/types.ts`                    |
| Query hooks                 | `src/state/queries/*.ts`                     |
| Session state               | `src/state/session/index.tsx`                |
