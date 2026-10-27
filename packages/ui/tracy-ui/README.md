# @tracy/ui

Tracy's shared React component set: 24 shadcn-style primitives (base-nova) on top of CSS-variable
tokens, plus two components of Tracy's own (`platform-glyph`, `settings`).

**This is a LIBRARY, not a dsh plugin.** There is no `dsh` field in `package.json`, so
`check-plugin-identity` skips it — and that is right: it does not load itself into the loader tree; Tracy
plugins import it.

**Widely used (05/10/2026):** 20 workspace packages declare a dependency on `@tracy/ui` — most
plugins (`tracy-settings`, `tracy-sidebar`, `tracy-site-tabs`, `tracy-my-sites`, `tracy-add-site`…),
plus `@tracy/core`, the `@tracy/design` bench, `tracy-design-page`, `tracy-harness`. The "NOT done yet"
section below was written at port time, when no package used it yet; the real state is in
[`DESIGN.md`](../../../DESIGN.md) §1.

## Where it came from

Ported from `tracy-infra/packages/ui` (`@tracy-cowork/ui`) on 2026-08-30. There it served
`apps/web` — a standalone React SPA.

**This section once said that SPA was "gone". Wrong, fixed on 2026-08-30.** The old sentence read the
DSH-as-core architecture as "`dsh-web-app` **is** the application, Tracy only plugs plugins into it". The settled
direction is the opposite: **Tracy owns the page.** TCH builds its own `apps/web` from `@tracy/design` and configures
dsh to serve it **instead of** the harness's `apps/web` — `@deepseek-ai/dsh-web-app` is just one bundle
in `dsh.profile.bundles`, so it can be replaced.

So this library has two consumers, not none: **Tracy's pages** (mode A)
and **the plugins injected into the dsh page** (mode B). The two modes have very different CSS rules —
[`DESIGN.md`](../../../DESIGN.md) §0. (Note 05/10/2026: that SPA, `packages/web/tracy-frontend`,
was deleted; mode A is now the `@tracy/design` bench, `tracy-design-page`, `tracy-harness`.)

Dropped when copying: the `*.test.*` files (TCH had no test runner yet) and the old `tsconfig.json` (it `extends`
a base config and `include`s a test file — neither exists in TCH, and both break the
self-contained rule). The current `tsconfig.json` stands alone, modelled on `@tracy/dsh-chat-input`.

## NOT done yet — read before using

Components attach styles with **Tailwind classes** (`bg-primary`, `rounded-lg`, `text-sm`…) through `cva`,
and those classes resolve to **120 CSS variables** in `src/tokens.css`. To use them in a
dsh plugin two things remain, and both are design decisions, not mechanical steps:

### 1. Wire Tailwind into the plugin's build

A dsh plugin ships **one** `lib/client.js` built by esbuild; there is no Tailwind step on the host. So
the CSS has to be generated at build time and embedded as a string — the way `@tracy/dsh-chat-input` injects its
`CSS` through a `<style>` tag in `ctx.effect`.

Tailwind here is **v4, CSS-first** (`components.json` declares `"config": ""`), so the configuration lives
in `tokens.css`; there is no `tailwind.config.js` to copy.

### 2. Map the tokens onto dsh's `--dsw-alias-*`

This is the part that matters. `tokens.css` declares `--primary`, `--background`, `--foreground`… with
Tracy's values. Left as is, Tracy components will **not follow dsh's theme and skin**
— when the user switches to a dark background or turns on `dsh-dream-skin`, the Tracy parts stay put.

Good news: components already use `var(--foreground)` rather than hard-coded colours, so all it takes is
**redefining those 120 variables in terms of `--dsw-alias-*`**, without touching the components. For example:

```css
--foreground: var(--dsw-alias-label-primary);
--background: var(--dsw-alias-bg-base);
--primary:    var(--dsw-alias-brand-primary);
```

`@tracy/dsh-chat-input/src/client/styles.ts` is a ready model listing the tokens dsh actually provides.

🔒 **Do not map before a real surface uses it.** A blindly mapped variable is a place that can be wrong
without anyone noticing — do it together with the first surface that consumes it, so each mapping is seen on screen.

**This is partly done:** 45 variables are mapped onto `--dsw-alias-*`; brand deliberately is not.

**The other direction — dsh following Tracy — was finished on 03/09/2026, and NOT with CSS.** `dsh-bridge.css`
is the mapping table; `@tracy/dsh-brand` generates a constant table from it and hands it to dsh's
`ctx.theme.overrideTokens`. Do not load the bridge as a stylesheet: in the same document as `tokens.css` it is a CSS
variable cycle — [`ADR 0007`](../../../docs/adr/0007-tracy-skin-through-ctx-theme.md).
The full rules, with the three selector tiers and why `.dark` is **not** dead code:
[`DESIGN.md`](../../../DESIGN.md) §1. The alias names are guarded by `scripts/check-dsh-tokens.ts` — a typo
is hidden by the fallback and the colour stays put when the theme changes.

## Why `next-themes` and `sonner` are not removed yet

They come from `apps/web` and most likely cannot be used in a dsh plugin: the theme is owned by
`@deepseek-ai/dsh-client-ui-theme`, and `sonner` builds its own portal on `document.body`.
They are kept because removing a dependency nobody has touched yet is a guess; remove them when the first component
is put into use and it is clear which one is unnecessary.
