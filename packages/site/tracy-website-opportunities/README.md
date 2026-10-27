# @tracy/dsh-website-opportunities

Website Opportunities: find restaurants around a place (or from a website / social page address),
collect their public website and social presence, write a site brief, and build a demo site in
Tracy.

This package is the dsh plugin. Its domain library (discovery, crawling, connectors, media, brand
and brief logic) is the workspace package `website-opportunities` in `packages/wo/website-opportunities`,
bundled into `lib/client.js` at build time. History of the former `vendor/` subtree: `HISTORY.md`.

| Path | What it is |
|---|---|
| `src/client/` | The browser half: one side-card tab (`tracy:website-opportunities`) and a Settings section (`website-opportunities`, Default CMS). Built into `lib/client.js`. |
| `lib/client.js` | The built browser bundle. **Committed**: the Tracy image copies this directory as is and runs no build. |
| `lib/index.js` | The host half, intentionally empty. |
| `test/` | `node --test` suites for the pure client logic (the domain's own suites live in its package). |

## How it fits in Tracy

- **No job lives in the browser.** Research, site briefs and builds are rows in tracy-web's
  database, run by its executor. The client only calls `/api/website-opportunities/…` (root
  doors, with the session cookie) and draws the answers.
- **The operator's switch** `website-opportunities` (Ops › User Interface) decides whether the
  feature exists. Off: Settings drops the section, the tab draws an "off" notice and makes no
  request, and tracy-web refuses every door that starts work.
- **Entry points**: the desktop app's Help › Find Website Opportunities… (through
  `window.tracyDesktop.app.websiteOpportunities.onOpen`), and the address
  `/new/?tab=tracy:website-opportunities`.
- **Idempotency**: each Research or Build press carries a `requestId`; a double press or a retry
  after a failed answer reuses it, so the server answers with the job it already has.
- **Strings**: English lives in `src/client/strings.ts` (namespace `tracy-website-opportunities`);
  the seven other interface languages live in Tracy's locale packages.

## Build and test

```sh
pnpm install                      # from the Tracy workspace root
node scripts/build-client.mjs     # writes lib/client.js
node scripts/build-client.mjs --check   # fails when lib/client.js does not match its source
node --test test/*.test.mjs
```

The build checks that every `ctx.<service>` the client reads is declared in `inject`, runs Tailwind
(theme and utilities only, no preflight: the plugin lives inside dsh's page), and keeps exactly
React's four entry points external.

## Optional review sources

The customer Details page shows collected TripAdvisor quotations separately from Google, with the
real author and a TripAdvisor source link. Missing optional reviews and provider quota failures add
no empty section or technical error message. Previously collected reviews remain visible after a
failed refresh. The backend owns matching, provider selection, credentials and billing.

## Reviews, attached photos and authors

Details keeps TripAdvisor photos together with the review ID/link, preferring photos already saved in Tracy's media; an unsaved photo only links to the original. A reviewer's avatar is never imported as a restaurant photo. Google keeps the name, contributor profile link and avatar that Places returns; TripAdvisor keeps the name, profile link and avatar the provider returns. Without data, no author or placeholder image is made up.
