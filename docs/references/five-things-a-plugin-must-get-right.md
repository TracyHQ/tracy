---
description: Five things a Tracy dsh plugin must get right, each with how it fails silently and which gate catches it.
sources:
  - scripts/check-plugin-identity.ts
  - packages/site/tracy-site-tabs/scripts/build-client.mjs
  - packages/brand/tracy-brand/src/client/index.tsx
---

# Five things a Tracy plugin must get right

> Before 05/09/2026 this list was the README of `@tracy/dsh-ui-gallery` — the smallest plugin touching
> everything, used as a template. That plugin was removed (Lee 05/09: no longer needed; `@tracy/design` and Storybook
> are where to view components), but the five points below do not belong to it. The template to copy is now
> [`packages/site/tracy-site-tabs`](../../packages/site/tracy-site-tabs) (both host + client halves) and
> [`packages/design/tracy-design-inspiration`](../../packages/design/tracy-design-inspiration) (plus agent tools
> and a slot in chat).

Each item is a **silent** failure: dsh still boots, no error, no log, only an absence.

## 1. One name, written in three places

`package.json` → `name`. `cordis.patch.yml` → the row's `name:`. `lib/client.js` → the `id` passed to
`__ModuleLoader__.load`. Nothing at run time cross-checks those three places.

One of them off and **half the interface simply does not show**. On 30/08/2026 `dsh-github-workbench`
shipped a bundle declaring `@dsh-abilities/github-workbench` while the package was named `dsh-github-workbench`; the only
symptom was absence. `scripts/check-plugin-identity.ts` exists because a convention cannot
go red, and an absence is something nobody sees in a diff. (RULE #2 of `CLAUDE.md`.)

## 2. Every `ctx.<name>` must be in `inject`

cordis **has no** optional injection: `Inject` is only `string[] | Record<string, config>`.
`export const optional = [...]` is an invented export nobody reads. And the context proxy throws **at the moment of
READING** a property outside `inject` — so `if (!ctx.locale) return` is never reached; the read itself
is what throws.

`tracy-view` paid for it: the whole plugin died silently with `cannot get property "locale" without inject`, dsh
drew its own original interface, and no gate complained because the bundle still built normally. Now each plugin's
`scripts/build-client.mjs` (and `build-host.mjs`) scans the whole file and refuses to build on a
mismatch — see `checkInjectContract` in `tracy-site-tabs`.

## 3. `react*` must be external — and ONLY exactly React's four entries

dsh shares **one** React with every plugin. A bundle carrying a second React leaves hooks without a
dispatcher: a blank screen, no error. But externalising with the glob `react*` is wrong too: it also catches
`react-day-picker` (through `@tracy/ui`'s calendar) and the bundle dies at load time with "missed the module
table" (03/09/2026). dsh's shared module table only has `react`, `react-dom`, `react/jsx-runtime`,
`react-dom/client` — list exactly those four names.

## 4. Slot registration must go through `slots.inject`

The activation order between your plugin and the plugin **declaring** the slot is not guaranteed. Calling
`slots.register` directly on a slot not yet declared registers into nothing — silently. `slots.inject(name, fn)`
waits until the declaration exists before running `fn`. Example: `packages/brand/tracy-brand/src/client/index.tsx`.

## 5. `absWorkingDir` in esbuild

esbuild writes source-path comments **relative to cwd**. Without pinning it, the same source yields two
different bundles, just because `pnpm --filter … build` runs from the repo root while `node scripts/build-client.mjs`
runs from the package directory. The `bundles` gate's `--check` compares verbatim, so it goes red depending on the
directory rather than the content.

## Four more things measured later (05/09/2026)

- **dsh paths go through `dshUrl()`.** Under `cowork.tracy.ai/<siteKey>/` an absolute `fetch('/api/tracy-…')`
  hits the Worker, returns the Worker's 404, and works fine locally. The `dsh-paths` gate also catches a
  constant holding that literal outside `dshUrl(`.
- **Agent tools in a TypeScript plugin: build a plain object for `ctx.tools.register`**; do not
  import or declare `@deepseek-ai/dsh-tools` — declaring it makes pnpm chase a peer `>=0.1.3` that a
  `-tracy.N` prerelease does not satisfy; not declaring it means Node cannot resolve it from `lib/`. See
  `packages/design/tracy-design-inspiration/src/host/index.ts`.
- **An iframe with `sandbox=""` cannot load anything through `src` from the host half.** An opaque origin → the document request goes
  without the seat session cookie → the seat door returns 302 → an empty frame, no error (measured on an imported site,
  05/09). `fetch()` from the page (with the cookie) then `srcDoc`; keep `sandbox=""`, do not loosen it with `allow-same-origin`.
- **Do NOT put a `ref` on a `@tracy/ui` component — the dsh page runs React 18.** `@tracy/ui` is written for
  React 19 (`ref` is an ordinary prop, no `forwardRef`); dsh's React 18.3.1 **drops** that `ref`, with no error and
  no log in production builds. The consequence measured 05/09 on `lucaswp`: the `IntersectionObserver` in `useNear`
  had nothing to observe → no fixture fetched → 152 cards grey forever, and the srcDoc fix above never even
  ran. Put the `ref` on an ordinary `<div>` (`Gallery.tsx`). The design bench uses React 19, so it does NOT
  reproduce — only a real lane shows it.

