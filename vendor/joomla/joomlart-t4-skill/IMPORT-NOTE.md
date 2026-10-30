# Import into TCH

**Pin: `main` @ `98aa1e7` — 29/10/2026** (merge of [JoomlArt-Products/tracy-joomla-template#6](https://github.com/JoomlArt-Products/tracy-joomla-template/pull/6): the release repository is `JoomlArt-Products/joomlart-products`). It is the only commit on `main` after `707563b`, so it was applied here as that one diff (`git diff 707563b 98aa1e7` with `git apply --directory=vendor/joomla/joomlart-t4-skill`) instead of an rsync, which keeps the in-place patches listed below.

**Previous pin: `main` @ `707563b` — 27/10/2026** (merges of [JoomlArt-Products/tracy-joomla-template#4](https://github.com/JoomlArt-Products/tracy-joomla-template/pull/4) and [#5](https://github.com/JoomlArt-Products/tracy-joomla-template/pull/5)). That PR first brought the home repo to this tree as it stood in TCH — the 26/10/2026 licence grant (`LICENSE` MIT, `COPYING` GPL-2.0-or-later, rewritten `NOTICE.md`) and the "Customize your site" readiness check below (#3, closed as superseded) — then translated the remaining Vietnamese prose (`README.md`, the shared-layer section of `SKILL.md`, `references/menu-content-workflow.draft.html`, `recurring-defects.md`, `gotchas.md`, one SCSS comment) into English. #5 quotes the one Vietnamese line left, `SKILL.md:15`, which is on purpose: the sample first question asked in the user's language. This tree is byte-identical to `707563b` except this file. The paragraphs below are history.

**"Customize your site" (#1013, T32) — 08/10/2026, changed in the home repo, draft PR [JoomlArt-Products/tracy-joomla-template#3](https://github.com/JoomlArt-Products/tracy-joomla-template/pull/3) (branch `feat/customize-your-site-ready`, commit `03b8319` on `main` @ `d4f1e44`; not merged, not tagged).** Ten files of this tree are taken byte for byte from that commit (`diff -rq` against the clone differs only in this file): (1) the shared layer `html/layouts/t4/element/logo.php` + `layout/offcanvas.php` prints the site owner's logo as a light/dark pair in the JA Nova style (`site_logo` in `.d-light`, `site_logo_dark` in `.d-dark`, plus the phone variants); with no dark logo, dark mode shows the site name as text, and with no logo at all the name shows in both modes; the template's own SVG is still inlined until there is a dark logo; `scss/_chrome.scss` toggles the pair in `template.css` and caps the height with `--tracy-logo-height`; (2) a new gate `scripts/quickstart/brand-ready.mjs` (Phase 9/10): the logo pair in the header and the drawer, the `site_logo_dark` field + string + key in every profile (`--fix` writes these three itself), CSS toggling the pair, a height cap, no `filter`/`content:url()` on the logo, no hard-coded favicon (error/offline pages are only a NOTE); with DB access (`--sql-cmd`/`--data`): the home menu item has a Browser Page Title, the © line is `mod_footer`; (3) `references/customize-your-site.md` + SKILL.md + `packaging-quickstart.md` (Q1c, Q4b: generate `tracy_site_pages.json` with `tracy-dev site-pages --joomla …`, TracyHQ/tracy-template-dev#1 still open). Tests: 180/180 (`node --test scripts/test/*.test.mjs`, with Playwright's Chromium). **When #3 merges:** pull again with the command below and pin the merge commit; until then do not edit these files here.

This tree is `JoomlArt-Products/tracy-joomla-template` pinned at commit **`d4f1e44`** (30/09/2026, merge of PR #2 — every T4 template built from now on accepts `?theme=dark|light` for exactly one page load, beating the cookie/default/OS, never stored, all three hooks switching together; `dark-toggle.mjs` adds a `?theme` measurement and goes red when the template ignores it. Not tagged yet). Before that **`2a0efa2`** (18/09/2026 —
four gates that RAN, printed OK, and measured nothing: `contrast-audit` stops inventing a black background when the parser cannot read
the real one; `gate-wiring` stops reporting `runtime.mjs` as a gate, so it stops going red on a clean tree;
`identity-leak` replaces two historical build names with a scan by SHAPE and reads the HTTP status, so
a 404 no longer scans as clean; `layout-fit` keeps the TOTAL number of overflowing elements after truncating to 5 lines.
Not tagged yet). Before that **`48da124`** (18/09/2026 — the two gates the sweep REALLY runs stop measuring the light page and stop printing findings and then exiting 0;
seven scanners report the number they actually MEASURED; `contrast-audit` is no longer blind to `oklch()`; `leak-scan`/
`palette-leak` read `rgba(`; `dark-toggle` reads hooks from the shared config. Not tagged yet). Before that
**`87d4b27`** (17/09/2026 — the two
interaction-state scanners report the number they actually MEASURED instead of the page's node count, and five silent
skip paths become findings; not tagged). Before that **`1.3.0`** (`e00f177`, tag `v1.3.0`, 16/09/2026
— the shared layer `assets/shared-layer/**`, 30 gates `scripts/review/**` and three auditor agents moved home from
the TCH branch `chore/docs-to-main`); before that `1.2.0`, and `v1.1.0`/`2691a82aa` (15/09/2026). The import is
**complete** — including `assets/`, so it runs right away rather than just being readable.

🔒 **THIS SKILL'S HOME CHANGED ON 14/09/2026, AND THE DIRECTION OF CHANGES CHANGED WITH IT.** Before that it was a **fork**:
the original lived at `JoomlArt-26/joomlart-template-plugin`, Tracy's copy carried `-tracy.N`, and changes were made here and then pushed
back up. Since 14/09 the repo **`JoomlArt-Products/tracy-joomla-template`** (private) is where the skill
is developed, no longer anyone's derivative — so the version drops the fork suffix and starts again
at **`1.1.0`**. The `JoomlArt-26` repo stays at `55dd9754a` and receives nothing more.

**The rule that comes with it, and it runs against the habit of the last three weeks:**

| Task | Where |
|---|---|
| Change the skill | **the new repo**, then pull it here |
| Urgent fix right inside `vendor/` | allowed, but **it must be pushed to the new repo in the same pass** — otherwise the next pull overwrites it |
| Version bump | in the new repo (`.claude-plugin/*.json` + `skills/*/package.json`), then re-pin the number at the top of this file |

No gate catches this. `vendor/` is as writable as any other folder, and a change left
here looks exactly like a change that was synced — TCH's `git status` is clean in both cases.

**Pull from the new home:**

```bash
git clone git@github.com:JoomlArt-Products/tracy-joomla-template.git /tmp/t4-pull
rsync -a --delete --exclude .git --exclude node_modules --exclude IMPORT-NOTE.md \
  /tmp/t4-pull/ vendor/joomla/joomlart-t4-skill/
```

`IMPORT-NOTE.md` is a **TCH** document, deliberately absent from that repo — do not rsync it away.

## Neutral source contract — 15/09/2026

`1.2.0`, `2aa7b7a`. `from-html.mjs` and `from-url.mjs` **also** emit `site-model.json` (TCH's ADR 0016)
— a description of the source in vocabulary that belongs to no CMS, so the three site-building skills read one contract.
Logic in `scripts/ingest/site-model.mjs`; fixture `scripts/test/fixtures/page-map-min.json`.

⚠ **An HTML source is a poor source, and the model says so plainly**: it carries pages, routes, menus, palette —
**no content model**, because splitting pages into sections is Phase 2 and done by a person. A model
that guessed would hand the other two skills confident-looking nonsense.

🔒 The string `tracy-site-model/v1` is **declared**, not imported (three repos, ADR 0006). The gate that keeps the three sides
in agreement lives in TCH: `scripts/check-site-model.ts`. It calls this tree's `site-model.mjs` **directly** rather than
running `from-html.mjs`, because that script needs `jsdom` in the Joomla tree, which TCH does not install — and a gate
that stands itself down when a dependency is missing reports green exactly like a gate that ran.

## Why `assets/` is here, heavy as it is

The three binary files in it are 63 MB:

| File | Size | Used where |
|---|---|---|
| `assets/t4/t4-framework-for-joomla-6.zip` | 59 MB | Phase 0 — unpacked into a clean Joomla 6.1.1 + T4 site to build the template on |
| `assets/akeeba/pkg_akeebabackup-10.3.5-core.zip` | 3.5 MB | Phase 10 — takes the `.jpa` for the quickstart |
| `assets/akeeba/kickstart.php` | 0.4 MB | Phase 10 — the restorer shipped with the `.jpa` |

The first import (10/09) left them out, arguing that blobs in git history are permanent. That argument
is right but **missing a measurement**: TCH's `.git` was already 1.0 GB then, so 63 MB is **+6%** — not
a burden but the normal price of a toolkit that runs. And why import a skill that cannot
run: Phase 0 is the **first** step, so a missing zip breaks on the very first command,
not in some rare branch.

## Licence — JoomlArt granted GPL-2.0-or-later (26/10/2026)

`assets/t4/t4-framework-for-joomla-6.zip` contains JoomlArt's T4 Framework and `t4_bs5_blank`. Before
26/10/2026 the zip's archive comment and the header of each T4 code file said "Copyrighted Commercial Software",
so this tree could only live in a private repo. On 26/10/2026 JoomlArt, the copyright owner, licensed the JoomlArt part
of this repo: PHP/Joomla/WordPress code and assets (including the T4 zip, `assets/shared-layer/**`) under
**GPL-2.0-or-later**; the skill documentation under **MIT** (the licence grant is kept in an internal repo;
the full table is in `docs/licensing.md`). The headers inside the zip stay byte-identical — do not unzip/edit the zip;
the grant in this tree's `NOTICE.md` and `LICENSE` supersedes those headers.

Check again at any time:

```bash
unzip -z vendor/joomlart-t4-skill/assets/t4/t4-framework-for-joomla-6.zip
```

## What to improve here

[`docs/tracy-design-inspiration/four-improvements-from-one-template-build.md`](../../docs/tracy-design-inspiration/four-improvements-from-one-template-build.md)
lists four groups of work, drawn from a real template build with this very skill set — building `tracy_apple`
for Joomla 6, running all of Phase 0→9.

The three gates most worth adding first are in section 2a of that document: `font-scan`, `rhythm-scan`,
`layout-scan`. Why they come first: **the three worst defects of that build all belong to the group no gate
catches** — all body text falling back to Times on every page, the marketing page rendering in a
406px column, and nine colour bands with a 4% lightness range. The six existing scanners stayed green throughout; the defects only showed when
someone looked.

Since 14/09 this is no longer a fork, so RULE #5 applies in its new shape: a commit on
`JoomlArt-Products/tracy-joomla-template`, carrying its own version number, then pulled into `vendor/` —
not an in-place patch that is never pushed up.

## Quickstart revision — 11/09/2026

`1.0.0-tracy.1`: the skill builds a customer website from a T4 quickstart chosen from HTML/URL, downloads the release asset
from `JoomlArt-Products/ja-products`, keeps the template/sample data and then continues with the existing phases.
The blank starter remains for requests to build a template from scratch.

Source commit: `36de38a` on branch `docs/customer-quickstart-tracy` of the skill repo checkout;
kept in TCH at ref `refs/vendor/joomlart-t4/customer-quickstart-tracy`. Pushed to `main` of `JoomlArt-26/joomlart-template-plugin` on 11/09/2026. Source content imported as of this commit; binary assets unchanged.

`1.0.0-tracy.2` — source commit `55dd975`, pushed to the same `main`: when the skill is invoked without a
design source it asks for HTML/URL right away and waits for the answer before any environment check.
Synced the shared copy and the `thunghiem/TracyWork` workspace copy of the local DSH.

## Execution and verification revision — 11/09/2026

`1.0.0-tracy.3` — source commit `87714ef571959e5176b46c5b39e9418e3e9a068d`; kept at ref
`refs/vendor/joomlart-t4/agent-workflow-tracy` in TCH, not pushed upstream.
Separates website/template/edit scopes; adds preflight and checkpoints; compiles all of main/dark/local;
checks empty snapshots, alpha, cache root and toggle; the scanners share the hook/cookie configuration
and return results with a status. The planner matches real IDs instead of fixed SQL IDs.
Verification: 96/96 tests pass, including Chromium against a local sample page; skill validator passes.

## Per-site content contract — 12/09/2026

`1.0.0-tracy.4` — source commit `f26e181a0`, kept in TCH at ref
`refs/vendor/joomlart-t4/site-content-contract-tracy`; not pushed upstream.
The skill requires `content-contract.json` from Phase 2, the compiler references facts in Phase 7, and audits
rendered fields plus a semantic review in Phase 8b. Distinguishes demo/customer, data source, page/artifact
scope and version hash. `--init` creates an incomplete record; `--force` keeps a record already written.
The import matches the source commit; binary assets not replaced.
Verification: 120/120 skill tests, skill validator valid, 31/31 TCH gates pass. The Tracy Apple record
and the Home/Onepage adapter are in `packages/cms/tracy-joomla-quickstart/content/`; the live Marketing Samples
were not rewritten in this contract-completion pass.

## Per-site design system contract — 12/09/2026

`1.0.0-tracy.5` — source commit `0e2762b36`, kept in TCH at ref
`refs/vendor/joomlart-t4/design-contract-tracy`; not pushed upstream.
Phase 2 requires `design-contract.json`: Style Guide source, tokens and text roles, layout,
components, the page/viewport/theme matrix and exceptions with a specific decision. Phase 6 checks a pilot
before scaling out; Phase 8 checks the whole matrix with an independent render measurement, tied to the contract hash.
The gate rejects empty required selectors, unassigned properties, unloaded fonts, wrong theme/URL/viewport,
horizontal overflow and missing data. It does not replace visual review or block arbitrary CMS commands.
The import matches the 18 files of the source commit; binary assets not replaced.
Verification: 149/149 skill tests, skill validator valid, whitespace diff clean. The full TCH check
was red only in lint: an unused `studioContentHash` import in `build-marketing-samples.mjs`, belonging to
another change present in the checkout. The record `packages/cms/tracy-joomla-quickstart/design/`
lists 632 target cases; the Home/Style Guide pilot passes 8/8, 1,152 properties/tokens. The full audit
correctly rejects the pilot set for missing 624 cases. No claim that the whole site meets the new contract.

## Mega menu behaviour contract — 13/09/2026

Version not bumped yet (waiting to batch with another session's in-progress change in the same tree).
Real defect on Northgate: the full-width mega panel hangs below the header edge, leaving a 26px strip between the link and the
panel; T4's `megamenu.js` closes the panel on the `<li>`'s `mouseleave`, so moving the pointer down makes the panel
vanish — three review rounds missed it because all of them force-opened the panel to capture/measure. The skill previously had only the
STRUCTURAL mega menu contract (§5 blocks-and-elements, DB seed) and the `[MEGAMENU-HOVER-DEADZONE]` defect class with
one cause (compositing), and no measurement of the pointer's path.
Added: `blocks-and-elements.md` §5d behaviour contract (5 rules + how to check); `gotchas.md` #80 mechanism
+ CSS hover bridge + two traps (Bootstrap caret, hidden `::after` rule); `recurring-defects.md` second cause
of `[MEGAMENU-HOVER-DEADZONE]`; `review.md` scanner table + step 3 + exit criteria;
`verify-recipes.md` warning that force-open only measures style; `build-subagents.md` review prompt;
`SKILL.md` rules + script list. New script `scripts/review/mega-hover.mjs` (real pointer:
hover → down into the panel → across to a link → click; Escape/click outside; exit 1 on FAIL, reports `NO ITEMS`
when there is nothing to measure) and test `scripts/test/mega-hover.test.mjs` (fixture reproducing the T4 mechanism:
gap → FAIL, bridge → PASS, no menu → not "clean"). 153/153 skill tests.

## Prune step before packaging — 13/09/2026

Version not bumped yet (same pass as the "mega menu behaviour contract" above; batched when the other session finishes).
Real defect on tracy_business (built on Tracy Base): 18 ACM folders, 8 layouts, 6 profiles, 5 overrides, the Base template
still installed, the Base design system css, `TPL_…_XML_DESCRIPTION` copying "Tracy Base is…" verbatim, author/copyright/creationDate
and the two Base thumbnail images — no gate of the skill caught it because it is not docroot junk (Q1 scrub) and does not contain the word
"Blank" (#45). Added: `packaging-quickstart.md` Q1a *Prune* (a 10-row table, one measurement per row) + Q1b (agent docs
shipped with the template, secrets); `scripts/quickstart/prune-audit.mjs` (measures from the DB via `--sql-cmd` or `--data`, compares
identity with the base's `manifest_cache`, exit 1 while PRUNE remains, `--apply` removes files, never removes an extension) + test
`scripts/test/prune-audit.test.mjs` (3 tests, fake-tree fixture + facts.json); `gotchas.md` #81; `SKILL.md` script
list + Phase 10 bullet; `secret-scan.sh` catches tokens in SQL dumps; `quickstart-gotchas.md` pointer.

Same pass (13/09): `secret-scan.sh` catches `configuration.bak.php`; 9 Q1a/Q2/Q4 traps from the tracy_business packaging pass in `quickstart-gotchas.md`.

## Moving house — 14/09/2026

Everything above, including the 13/09 "Prune step" that had lived only in `vendor/`, went up to
`JoomlArt-Products/tracy-joomla-template` as two commits: `936299bb4` (prune audit, mega-menu
hover, contract tweaks — 16 files, +631/−8) and `9fdb1e73b` (change of home: every clone URL, marketplace
id and org name in README · INSTALL · NOTICE · AGENTS points at the new repo; version
`1.0.0-tracy.5` → `1.1.0`). The history pushed up is **complete**, from `c50852eb3` (02/08, JoomlArt's v1.0.0)
rather than a flat copy — so `git log` in the new repo still traces every
line back to its origin. 156/156 skill tests green after the change.
