# `@tracy/emdash-theme-editorial` — Tracy's EmDash template wearing the `apple` design system (renamed Editorial, 26/10/2026)

Derived from `vendor/emdash-theme-bravada` (`vhscom/emdash-theme-bravada` at `v0.10.0`,
commit `f39df8784`), which stays in the tree as the pristine upstream fork and the target
of any future `git subtree pull`. Version `0.10.0-tracy.1` — the `-tracy.N` suffix is the
LAW #5 convention `vendor/dsh-passwords` already follows.

## Why two trees instead of one with a switch

A switch was built and it worked: a `tracy-theme` plugin served a Block Kit page in the
admin, wrote the chosen id to plugin KV, and the layout linked `/systems/<id>.css` at
render — swapping systems with no rebuild. The call on 10/09/2026 was that a customer site
gets **one** template with **one** look: no picker, no shared state, no way for a site to
end up wearing something nobody chose. The switch is in this repo's history if it is ever
wanted back.

🔒 **THE TWO TREES DIFFER IN SIX FILES, AND THAT IS THE INVARIANT WORTH KEEPING.**
Measured with `diff -rq`: `package.json`, `src/design-system.json`, `src/layouts/Base.astro`
(one import line), and the token file itself. **541 files are byte-identical.** A change to
markup, layout, seed or component CSS belongs in BOTH trees, and a diff that grows past
those six is a drift to explain, not a feature.

## What the look is made of

- `src/styles/systems/apple.css` — the `:root` block of
  `vendor/od-design-system/systems/apple/tokens.css`, copied **verbatim**, plus a Tracy
  addendum defining `--ink-band` (see below). Regenerate it; never hand-edit.
- `src/styles/systems/apple.dark.css` — the dark half, every value cited to
  `DESIGN.md` §2 by line; the four the document does not state outright are marked
  INFERRED or DERIVED with the reason.
- `src/styles/tracy-bridge.css` — maps this template's 37 names onto the system's 56.
  **Identical in both trees**: the translation is a property of the TEMPLATE, not of the
  system, which is why one bridge serves all 154 systems.
- `src/styles/theme.css` — upstream's, intact. Besides Bravada's palette it holds 88
  component rules (the over-hero header, the breakup-title animation…). The bridge sits
  BESIDE it and overrides the palette; replacing this file deletes those 88 rules and the
  page breaks in ways nothing reports.

## Three traps this tree already paid for

1. **`--ink-band`.** The role no design system names: ink that stays dark in either mode —
   the burger overlay, the footer band, the scrim over a photograph. It cannot be written
   as `light-dark(--fg, --bg)`: `--fg` inverts once a system has a dark ramp, and a system
   **without** one keeps `--bg` white, which bleached the hero. Each system file states its
   own.
2. **No `color-scheme` in the bridge.** The bridge is unlayered so its values beat the
   `@layer base` defaults — which is exactly why a `color-scheme` line there outranks the
   footer switcher's `:root.dark`, freezing the site in light while the button still sets
   the class. No error, nothing moves.
3. **`<Font>` throws on an empty font list.** `src/design-system.json` feeds both
   `astro.config.mjs` and the `<Font>` calls in `Base.astro`. A `cssVariable` with no entry
   in the config throws `FontFamilyNotFound` **mid-stream**, truncating the page to a
   223-byte shell with HTTP 200.

## Licence

GPL-3.0-or-later, inherited from the theme this is forked from (itself a port of the
Bravada WordPress theme, © 2020–25 Cryout Creations). Tracy distributes this to customer
sites, so the derivative is GPL too and recipients may ask for source — which they already
have, since the template ships as an Astro app on their own site. ⚠ Building
`@tracy/cms-sections` (`UNLICENSED`) into this tree is a **licensing** decision to settle
before the first section lands, not a technical one.

Demo photography under `public/images/` is CC0 / CC BY; `CREDITS.md` holds the attribution
table. Do not delete it.

## EmDash 1.0.1 — 29/09/2026 (`0.10.0-tracy.2`)

`emdash ^1.0.1`, `@emdash-cms/plugin-audit-log ^0.2.3`; the three agent skills under `.agents/skills/`
(`building-emdash-site`, `creating-plugins`, `emdash-cli`) replaced by upstream's `emdash@1.0.1` copies
(`vendor/emdash/emdash/skills/`), which drop the CLI commands 1.0 removed (`emdash dev`, `emdash plugin`)
and `Comments`/`CommentForm` from `emdash/ui`. No code change was needed: no removed subpath, no reference
field. Measured: build on v1.0.1, vitest 62/62; a fresh site seeded through `POST /_emdash/api/setup` (3
passes, `seedComplete:true`) serves 79 pages 200 plus the intended `/404-demo` — the same as 0.35.0 through the
same route. ⚠ Seeding with the CLI (`emdash seed`) instead leaves 19 routes 404 on 1.0.1; use the setup route
for this template (`tasks/todo-emdash-1-0.md`).

## EmDash 1.1.0 — 04/10/2026 (`0.10.0-tracy.3`)

`emdash ^1.1.0`; no code change. Measured: `pnpm install --frozen-lockfile=false` installs `emdash 1.1.0`, build completes, vitest 62/62.
⚠ `astro check` reports **1 pre-existing error** (`src/layouts/Base.astro:115`, `Property 'cssVariable' does not exist on
type 'never'`) — the identical error was measured on `emdash 1.0.1` (the HEAD tree installed frozen), so it is not caused by 1.1.0. Not seeded/run as a
site. This tree is not released as a quickstart.
