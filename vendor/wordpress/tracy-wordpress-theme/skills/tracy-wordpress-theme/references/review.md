# Review — the gate between "renders" and "ships"

> **Packet Phase 8b (review).** Runs after Phase 8 parity is clean and **before** Phase 9. Goes with
> [`editability-standards.md`](editability-standards.md), [`dark-light-mode.md`](dark-light-mode.md) §4,
> [`content-contract.md`](content-contract.md) §Phase 8/8b, [`gotchas.md`](gotchas.md).

## Why it is a separate phase

Phase 8 proves the theme **matches the source**. That is not yet **shippable**. A theme picks up systemic defects from the layer
underneath — core blocks, `wp-login.php`, the navigation fallback, the default Query Loop, the repo's formatter — that only
show in a live render, on a theme switch, on a narrow screen, and on **interaction**. Principle: **a build that "passed" is
a build that has not been reviewed**. Go looking for defects on purpose, before Lee finds them.

## Method (non-negotiable)

Measuring computed style is necessary but not sufficient: a green `getComputedStyle` on a broken render is a FAIL. Each
unit is checked by **image + interaction + computed px**, on **four axes in order**:

```
light desktop → light responsive → dark desktop → dark responsive
```

Same order as [`visual-qa.md`](visual-qa.md) (the contract's `visual.stages`: light-desktop → light-responsive →
dark-desktop → dark-responsive) — the two documents once stated two different orders (JA Vega M4 followed visual-qa.md).

Do not skip an axis. A light pass does not imply dark; desktop does not imply mobile. After a fix to a shared file
(`theme.overlay.json`, `tracy-base.css`, a pattern, a `wp_navigation`), **recheck the units that already
passed** — CSS spreads.

**Interaction is measured, not inferred.** The header drawer on a phone is part of that: `review/functional.mjs` taps it
open and closed at 390 px in light and dark and hit-tests the close button's centre ([`verify-recipes.md`](verify-recipes.md)
§6b "The drawer"). A drawer the check found nothing to tap on is not a pass; name the port's own drawer with
`--drawer-open/--drawer-panel/--drawer-close` when it is not core/navigation's overlay.

## Four audits (dispatched in parallel, each agent read-only, reporting back to the spine)

| # | Audit | Reads | Specific checks |
|---|---|---|---|
| 1 | **Editability** — the number-one reason a reviewer rejects | `editability-standards.md` | each page: count `core/html`, text outside `role: content`, hand-typed `<a>` instead of `core/navigation`; `wp post list --post_type=wp_navigation` matches the menu count; `core/navigation` in a part has a `ref`; parts/templates carry no content text; no dead forms |
| 2 | **Coverage** | `page-map.json` + `content-gaps.md` | every `pages[]` returns the expected status (200, or 404 for `404.html`); the 5 gaps 301 to the right target; the six required views each have an assigned page; each `customTemplates` entry is used by at least one page |
| 3 | **Dark complete** | `dark-light-mode.md` | six scanners with `--config` on every page, both modes; three-state toggle; `styles.css` restates all 16 presets on both paths; images/logos on a dark background |
| 4 | **Package / install** | `packaging.md`, `lessons.mjs scan … --theme …` | `build.mjs --target tracy-base --check` green; zip has `style.css` `theme.json` `templates/index.html` `functions.php`; no `patterns.map.json`/`theme.config.json`/`theme.overlay.json` in the zip; text domain `tracy-base` in every translation call; `Version:` matches `package.json` |

Then two things the per-page agents cannot see: **content** (`content-contract.mjs audit` + a whole-page review of
meaning) and the **recurring-defect sweep**: `lessons.mjs scan` ([`lessons.md`](lessons.md)) — read the gotcha of each
lesson it prints (`lessons.mjs show`), not the whole of [`gotchas.md`](gotchas.md).

## Scanners — and three rules for reading results

`scripts/review/` — command table in [`dark-light-mode.md`](dark-light-mode.md) §4; mega in
[`chrome-and-navigation.md`](chrome-and-navigation.md) §3. Three rules:

1. **No `--config`, no `pass`.** `runtime.mjs` returns `needs-review` (exit 3) when `expectedSelectors` is not
   configured; `fail` (exit 1) when `examined === 0` or the page is not 200 / redirects cross-origin /
   an expected selector does not show. Only `pass` (exit 0) is evidence.
2. **A scanner that prints "clean" with `examined` at 0 has looked at nothing.** The JSON output has `examined`; read it.
3. **Flip-and-read returns mid-transition values** (`border-color`) — wait for it to settle, or load the page with the
   `tracy_theme=<mode>` cookie and then read.

`toggle-test.mjs` specifically: it throws on the `auto` state (attribute absent) and assumes two states —
a `fail` from it on `tracy-base` **is not evidence** ([`dark-light-mode.md`](dark-light-mode.md)
§4 warning). Measure the three-state cycle with Playwright as described there.

## Theme Check — soft gate (Q12, Lee settled 13/09)

Running it is mandatory (plugin `theme-check`, `wp plugin install theme-check --activate` then Appearance → Theme
Check, or the CLI path if the plugin version has one): **0 ERROR**. "Plugin territory" WARNINGs (the custom block
`tracy-base/mega-menu`, not targeting wordpress.org — Q11) **are allowed** but must be listed by name in the
release's `VERIFICATION.json`. The Theme Review Team's 14 Required items
([`wordpress-anatomy.md`](wordpress-anatomy.md) §4) are a reference checklist, not done-when.
**Not yet run** as of 13/09 — item E2 of the plan.

## Guardrails when fixing

- Fix **in `overlays/tracy-base/`** and then build; do not edit `src/tracy-base/`; do not edit `src/tracy/`
  just to serve `tracy-base` without thinking about `tracy` (it receives the same fix on the next build).
- Do not edit vendor (`od-design-system`); token drift → `overlays/tracy-base/tokens.css` (D3).
- Content: fix through WP-CLI as the seeder does; no `wp db query`.
- **Verify-before-fix**: measure light-vs-dark values on the exact element before changing anything — a reviewer looking at images
  produces false positives, and "fixing" something that is correct breaks another surface.
- One person builds/zips at a time; two agents running `build.mjs` race to write into `src/tracy-base/`.

## Loop

```
Each unit (one piece of chrome, one section):
  1. Read the expectation in the spec-pack (design-spec.md, reference.json → source page).
  2. List EVERY component top to bottom — logo, each nav item, each button, eyebrow, heading, body, each card,
     icon, badge, input, divider. One row per component; no sampling.
  3. Each component: light desktop → light responsive → dark desktop → dark responsive.
     Each axis: image + interaction (hover/click/open every reveal state) + computed px.
     Open reveals with a REAL pointer (`page.mouse.move` step by step, then click the link inside), not just by forcing a class.
  4. Mismatch → fix overlay/content → build/seed → measure that component again on ALL 4 axes.
     After a fix to a shared file, recheck components that already passed.
  5. Re-measure independently before marking done — agents tend to over-claim.
```

## Exit conditions

- Every page PASSes on all four axes, with an image or probe as evidence — no bare assertions.
- The four audits have 0 open findings (or Lee accepts each remaining item, recorded in `DECISIONS.md`).
- Three audit scripts green: `verify-render.mjs`, `design-contract.mjs audit`, `content-contract.mjs audit` — save the full reports with `--out` in the dossier (stdout is only a one-line summary); read those reports back with `head`/`grep` on the `--out` file (for example `ok`, `mismatches`). `port-checks.mjs` does NOT read these three gates: it only covers `port-audit`, `verify.json`, `FAST-GATE.json` and the group's `verdict.json` ([`tools.md`](tools.md)).
- No horizontal overflow; no tofu; hover intact; search returns real results; `mega-hover.mjs` PASS at 1440 and
  1024 for every mega block.
- Theme Check 0 ERROR, WARNINGs named.
- `scripts/checkpoint.mjs complete <file> 8b <evidence…>` with the report as evidence.

An honest verdict is "clean" or a named list of remaining defects. Never "looks good".

## Feeding the catalogue

Defects of the underlying layer (core blocks, formatter, Docker) → [`gotchas.md`](gotchas.md) with how to check for them first; recurring theme defects
→ the same place; each one also gets a record in `lessons.jsonl`, with a detector when its trap can be read
from the inputs ([`lessons.md`](lessons.md) §Adding a lesson). The catalogue only accumulates if someone writes it down.
