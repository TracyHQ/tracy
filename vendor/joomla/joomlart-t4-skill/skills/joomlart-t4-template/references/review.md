# Phase 8b — Review (the gate between "renders" and "ships")

**Design contract:** read `design-contract.md`. A valid `design-contract.json` is required at Phase 2.
Authors use its pinned roles/tokens; pass the pilot matrix before repetition and the complete
page/viewport/theme matrix before acceptance. Keep the contract hash with all observations.


**Content contract:** read `content-contract.md`. Authors and reviewers receive the same
`content-contract.json` path/hash and `content-plan.json`. Compile before content writes;
compare rendered fields and review whole-page meaning before recording content complete.


> **Phase 8b packet.** Run after Phase 8 parity is clean and **before** Phase 9 packaging. Pairs with
> `recurring-defects.md`, `platform-latent-bugs.md`, `review-verify-method.md`,
> `menu-sef-and-data.md`, `content-architecture-audit.md`, `editability-standards.md`.

## Why a separate phase

Phase 8 proves the template **matches the source**. That is not the same as **shippable**. Templates
pick up systematic defects from the platform underneath them — the T4 framework, Joomla core,
Bootstrap 5 defaults, js-offcanvas, FontAwesome, `mod_menu`, the `com_*` views — that are invisible
until you render the live page, switch themes, resize, and *interact*. A build that "passed parity"
routinely fails all four of the audits below.

**Core principle: a build that passed is not reviewed.** Find the defects on purpose, before the
user does.

## The method (non-negotiable)

**Computed-style probing is necessary but not sufficient.** A green `getComputedStyle` check over a
visually broken render is a FAIL. Every unit is verified by **screenshot + interaction +
computed-px**, on **four axes in this order**:

```
light desktop → dark desktop → responsive light → responsive dark
```

No axis skipped. Light passing does not imply dark; desktop does not imply mobile; mobile-light does
not imply mobile-dark. After any shared-file fix (scss, `darkmode.css`, a token), **re-check the
units that already passed** — CSS ripples.

Full method, component enumeration, pixel tolerance, and the verify-the-verifier rule:
`review-verify-method.md`.

## The four audits

Dispatch these **in parallel, one message**, each read-only on its own browser slot. They report;
you fix on the spine. (Concurrent fixes to shared files — one `darkmode.css`, the DB, the menu —
would race.) Reusable agent definitions ship at the plugin root `agents/`; dispatch prompts are in
`build-subagents.md` §B.

| # | Audit | Agent | Reads |
|---|---|---|---|
| 1 | **Editability / dev-review compliance** — the #1 reason real reviewers reject a build | `t4-editability-auditor` | `editability-standards.md`, `content-architecture-audit.md` |
| 2 | **Coverage matrix** — every mandated view exists and renders | `t4-coverage-auditor` | `page-coverage-matrix.md`, `catalog.md` §6 |
| 3 | **Dark-mode completeness** — resolution, toggle, leaks | `t4-darkmode-auditor` | `dark-light-mode-standard.md`, `darkmode/` |
| 4 | **Package / install pre-check** | `t4-package-auditor` | `gotchas.md` #41–#49 |

Then run the two the agents cannot: **menu/SEF/data integrity** (`menu-sef-and-data.md`) and the
**recurring-defect sweep** (`recurring-defects.md` + `platform-latent-bugs.md`) — both are
whole-site, cross-page concerns that a per-page agent structurally cannot see.

## The scanners

`scripts/review/` holds six probes that catch the mechanical dark-mode defects faster and more
reliably than screenshots. Run them per page, both modes. Recipes: `darkmode/probe-recipes.md`.

| Script | Catches |
|---|---|
| `leak-scan.mjs` | light surfaces surviving into dark (white/navy panels, cards, form controls) |
| `contrast-audit.mjs` | text/background pairs under the contrast floor — dark-on-dark, muted-on-muted |
| `border-scan.mjs` | borders that stayed light, and doubled/"thick" border artifacts |
| `seam-scan.mjs` | colour seams between stacked full-width bands |
| `hover-scan.mjs` | hover states that lose their background or turn invisible |
| `mega-hover.mjs` | a mega panel a mouse cannot get into: real pointer path trigger → panel → link → click, plus Escape/outside-click close (blocks-and-elements §5d; exits 1 on FAIL) |
| `toggle-test.mjs` | the toggle itself: does it flip every surface, persist, and survive reload |
| `dark-toggle.mjs` | the sweep's toggle gate: flip, persist, restore — then `?theme=dark\|light` (darkmode-gotchas #54): wins at first paint on all three T4 hooks over the OS and a saved choice, survives an OS change, and is never saved (exits 1 on FAIL). `node dark-toggle.mjs <url> [width] [buttonSelector] [storageKey] [--config <file>]` |
| `probe.mjs` | the shared computed-style probe the others build on |

> ⚠️ **A scanner that printed "OK — clean" may have looked at nothing.** These scripts do not report
> a coverage count, so a selector that matched zero elements is indistinguishable from a page with
> zero defects. Before trusting a clean result, confirm the scanner actually found elements to
> examine — otherwise you have proved nothing.

> ⚠️ **Flip-and-read returns stale values for transitioned properties** (`border-color` is the usual
> victim). Let transitions settle, or read the steady state, before filing a defect.

## Guardrails while fixing

- **Edit only inside `templates/<TPL>/` and the demo DB.** Joomla core, the T4 plugin and extension
  code stay stock. Solve via overrides, `scss/`, `darkmode.css`, ACM params, and standard DB data.
- **scss → compile.** Never hand-edit compiled `css/template.css`. Dark lives in `css/darkmode.css`
  (not compiled). ACM module CSS under `acm/*/css/` is loaded directly.
- **Clear the T4 optimize bundle before EVERY verify render** (`scripts/clear-cache.sh`). A stale
  bundle makes every reviewer report phantom diffs.
- **Nested-set safety.** You may update a menu item's `link`/`params`/`alias`/`type`/`component_id`/
  `template_style_id`. **Never** `menutype`/`published`/`parent_id`/`lft`/`rgt`/`level`, and never a
  menu reorder or rebuild — those corrupt the nested set and collapse the megamenu. After any
  menu/DB change: clear cache, confirm the megamenu still renders with the right top-level count,
  confirm the homepage returns 200. Revert if broken.
- **One scss-recompiling task at a time.** Two agents running `sass` concurrently race and silently
  drop edits. Parallelize only per-page CSS-overlay work that does not recompile shared scss.
- **Verify-before-fix.** Probe the exact value light-vs-dark before changing anything. A
  screenshot-only reviewer produces false positives, and "fixing" one breaks a working surface.

## The loop

```
For each unit (chrome component or page section):
  1. Read the spec-pack reference for expected values (design-spec.md numbers, or the reference render).
  2. Enumerate EVERY component top-to-bottom — logo, each nav item, each button, eyebrow, heading,
     body, each card, icon, badge, input, divider. One verify row per component; do NOT spot-check.
  3. For each component: light desktop → dark desktop → responsive light → responsive dark.
     Per axis: screenshot + interaction (hover/click/open every reveal and drill state) + computed px.
     Open reveal states with a REAL pointer path (`page.mouse.move` in steps, then click a link inside),
     never only by forcing `.show` — a forced-open panel proves style, not reachability (gotchas #80).
  4. Deviation → fix in-template → recompile → clear cache → re-verify that component on ALL 4 axes.
     After a shared-file fix, re-check already-passed components.
  5. Independently re-probe the result before marking it done — agents over-claim. Then mark ✅.
```

Each unit must be small enough to finish and verify in one focused pass. Split large pages into
section units.

## Exit criteria

Phase 8b is done when **all** hold:

- Every page has a PASS verdict on all four axes, evidenced by a probe or screenshot — not asserted.
- All four audits report zero open findings (or the user has explicitly accepted each remaining one).
- The recurring-defect catalog has been checked against every relevant component, not skimmed.
- No horizontal overflow at any viewport; no tofu icons; hover states intact; breadcrumb separators
  aligned; search returns real results.
- `mega-hover.mjs` PASS for every panel-owning top item, at the desktop bp and 1024, in every language.

An honest verdict is either "clean" or a listed remaining-defect set. Never "looks good".

## Feed the catalogs forward

Every platform-level defect you find goes into `platform-latent-bugs.md` (root cause + fix recipe +
a pre-flight check so the next build never hits it), and every template-level recurring defect into
`recurring-defects.md`. This is what makes the next template faster and cleaner — the catalogs
compound only if you actually append to them.
