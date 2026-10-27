# 0007 — Tracy's skin goes through `ctx.theme`, not through a `<style>` tag

- Status: accepted (binding)
- Date: 2026-09-03
- Decided by: Lee
- Related: [`0004`](0004-dsh-is-the-shell.md) (dsh is the shell — so the skin must be put on that shell, not build another
  shell) · `DESIGN.md` §0–§1 (two CSS modes, three selector layers)
- Enforced in: `packages/brand/tracy-brand/` (one package, four jobs) ·
  `packages/ui/tracy-ui/src/dsh-bridge.css` (a mapping table, no longer CSS to load) ·
  `packages/bundle/tracy-native` `0.7.29` · `packages/bundle/tracy-guest` `0.4.9`
- Implementation plan: [`tasks/todo-ao-tracy.md`](../../tasks/todo-ao-tracy.md)

## Context

Since dsh became the shell (01/09), no package has brought Tracy's palette into the dsh page. On the evening of 02/09
`@tracy/dsh-tokens` appeared: a plugin that attaches `tokens.css` + `dsh-bridge.css` to `document.head` with a
`<style>` tag. On the morning of 03/09 it was measured on lane `tchwp2august` with headless Chrome:

- The plugin **loads normally** — the diagnosis "throws `window is not defined`" in the 02/09 handoff came from
  running the bundle in Node, not in the browser.
- But `--background`, `--foreground`, `--dsw-alias-bg-base`, `--dsw-alias-label-primary`… compute
  to **empty** in both themes. `tokens.css` reads the alias (`--background: var(--dsw-alias-bg-base, …)`),
  the bridge declares the alias from the token (`--dsw-alias-bg-base: var(--background)`): a **CSS variable
  cycle**, and CSS computes every variable in the cycle as *invalid at computed-value time*.
- Light mode looks fine because the canvas is already white. Dark mode: white page body, black text, black sidebar.

At the same time, reading `vendor/tracy/deepseek-harness/packages/client/ui-theme` showed that dsh has an official
theme API, and the plugin `dsh-dream-skin` 8.30.1 (installed for a try in `~/.dsh`) proves it really works:

- `ctx.theme.overrideTokens(source, { token: { light, dark } })` — an override layer per source, stacked,
  removable; the value **must** be a constant string for both modes.
- The theme applier writes the active theme's tokens as **inline style on `<body>`**, beating every
  stylesheet — including the `<style>` tag of `dsh-tokens`.

## Decision

1. **Tracy's palette goes onto dsh through `ctx.theme.overrideTokens`, as constants.** Values are generated at
   build time from the *fallback* part of `tokens.css`, mapped according to `dsh-bridge.css`. No `var()` reaches
   the browser. The bridge keeps CSS syntax so `check-dsh-tokens` still guards the names, but **no one loads it**.
2. **One package: `@tracy/dsh-brand` is the skin** — identity (three slots), palette, title and favicon, and the two
   settings rows Primary color · Font. No one wants the Tracy mark on dsh colours or the other way round, so
   it is not split. `@tracy/dsh-tokens` is deleted from the repo and from every bundle.
3. **Accent colour and font are chosen by the user**, stored in the Host's user-settings document (namespace
   `tracy-brand`) — the same place dsh stores Appearance — and applied through the same `overrideTokens` layer. Default:
   Tracy blue, dsh's font.
4. **Use `overrideTokens`, NOT `register` a new theme.** dsh's Appearance row only has
   Light · Dark · System and does not list extra registered themes; a `tracy-*` theme would be ignored by the System
   choice. An overlay follows the system's light/dark without anyone choosing.

## Accepted costs

- **Only colours and fonts can be changed through the theme API.** dsh's aliases have no radius, spacing or shadow; the shape
  of dsh's buttons, cards and inputs stays dsh's. `@tracy/ui` components only show in Tracy's own slots and
  tabs.
- **The title is an observer loop.** dsh bakes the product name into the bundle at build time and writes
  `document.title` on every session change; the plugin rewrites the product-name part through `MutationObserver`,
  one microtask later, before painting. The cleaner path (patching dsh-web-frontend's `dist/` at image build time)
  is the job of the next image round — `packages/fleet/tracy-fleet-operation/dsh/Dockerfile`.
- **External fonts are loaded from Google Fonts** when the user chooses one; by default nothing is loaded.

## Consequences

- Every palette brought onto dsh from now on must be `{ light, dark }` constants. The test
  `packages/brand/tracy-brand/test/palette.test.mjs` goes red if a value contains `var(`.
- `DESIGN.md` §1 adds a rule: `tokens.css` and `dsh-bridge.css` never stand together in one
  document as CSS.
- `@tracy/dsh-brand` has `src/` and a build; `check-bundles` guards its `lib/` like every other plugin.
