---
name: joomlart-t4-template
description: "Build a customer Joomla website from a suitable JoomlArt T4 quickstart, using an HTML folder, website URL, Pencil, Figma, or written brief as the design source. Select and install the quickstart, adapt its template and content, verify design parity and admin editability, then package the result. Also supports building a new T4 template from the blank starter."
---

# JoomlArt T4 — any design input → a customer Joomla website

## Start here — intake before tools

Read the user's current request and existing conversation for a design source. If they only
invoke this skill, or no source has been supplied, your first response is one short question
in the user's language: ask whether they have an HTML folder or a reference website URL, and
invite them to provide it. For Vietnamese, for example:

> "Bạn muốn dựng website Joomla từ thư mục HTML hay URL mẫu? Gửi mình đường dẫn thư mục hoặc URL nhé. Nếu chưa có, bạn có thể mô tả website muốn làm."

Use the question tool if available; otherwise ask in chat. Wait for the answer. Before that
answer, do not run shell commands, inspect the workspace/runtime, scan installed software,
or propose a different platform. Loading this skill alone is an intake request, not a request
to diagnose the host. If a usable source is already supplied (HTML, URL, Pencil, Figma or brief),
skip the question and continue with that source; never ask the user to repeat it.

After intake, read `references/provision-quickstart.md` before checking provisioning requirements.
Inspect the supplied design, select a suitable T4 quickstart, then establish the authorized
Joomla installation target. An existing WordPress workspace is not permission to replace that
site or to change the user's Joomla request to WordPress. Keep the Joomla objective and identify
a separate suitable target if necessary. Report specific missing access or runtime capabilities
without concluding that the whole host lacks a database or server from one container's view.

## Execution mode and evidence

After intake, read `references/execution.md`: select website/template/edit scope, run the one
capability probe, and record checkpoints with input/output evidence. The full distribution page
matrix and packaging phases below apply to `template`; website/edit use the agreed page set.
Read `references/content-reconciliation.md` at Phase 7 when adapting quickstart data.
**Before authoring site/demo copy or importing marketing artifacts**, read
`references/content-contract.md`. Phase 2 establishes one site content contract; Phase 7
compiles all copy from it; Phase 8b audits rendered content and reviews meaning. Each agent
receives the same contract path and hash, including agents working on newsletter/email/deck samples.

**Before styling or importing a design**, read `references/design-contract.md`. Phase 2 pins
`design-contract.json` to the accepted style guide. Verify the pilot pages in all declared modes
and viewports before repeating components; Phase 8/8b requires the complete render matrix.

## Overview

Build a **customer Joomla website from a JoomlArt T4 quickstart**, adapting its template and
content to the supplied design. Also support standalone template builds from the blank starter.
Reproduce the visual design **without inventing design** — the source specifies presentation;
`content-contract.json` specifies the site business and copy constraints. Match its structure, palette, type, and spacing; do not "improve" it. The template ships
**light + dark from the start** and reaches **production parity across every standard Joomla view**,
verified by live render.

**Any input works** because every input is normalized first. A `.pen`, a Figma file, a URL, an HTML
bundle and a written brief have nothing in common structurally, so each gets a thin **adapter** that
emits one **spec-pack**. From Phase 3 onward the pipeline is input-blind. Read
`references/inputs/spec-pack.md`, then the one `from-*.md` that matches what you were handed.

For a distributable template, a realistic JoomlArt template is **~18–30 pages, not ~10**: 2–3 home layouts + a landing page +
~11 editable ACM front-page sections + the full inner/auth/system view set, across **2–4 template
styles**. Generate the **~18–24-page baseline** by default, then **auto-extend** per the source's own
trees. **Hit the mandatory minimum, then VARY — sameness is a defect:** pick a DIFFERENT subset and a
DIFFERENT signature section per build. `references/catalog.md` is the menu to select from and the
creative-freedom charter.

This skill is **framework-specific** (T4 / Joomla 6) and **template-general**: every design differs,
so the skill gives you a **phase flow, decision rules, and scripts** — NOT a fixed list of selectors.

**How to run this skill — read ONE phase packet at a time.** The references are large; do NOT skim
them all up front (that is how detail gets missed). For each phase, open only the packet(s) the
router table names, execute, verify, then move on. Run the **build spine (phases 0–7) inline** in the
main conversation — they share live state (the DDEV site, the DB, files on disk). **Dispatch
subagents for the parallel, read-heavy work** (Phase 8 verify, Phase 8b review) — see
`references/build-subagents.md`.

Notation: `<TPL>` = the selected quickstart’s template machine name, or `ja_<name>` for a new template. `<DARK>` = the dark hook (`html.t4-dark`
or `data-bs-theme="dark"`, whichever this T4 build uses — pin it in Phase 0, see `css-tokenizing.md`).
`<PLUGIN_ROOT>` = the folder containing `assets/` and `skills/`.

## Five invariant principles

1. **The design is the visual spec; the site content contract owns business facts.** Match the presentation; do not "improve" it. Pixel + structure parity is the
   acceptance bar, verified by **live render** — never by assumption.
2. **Probe before concluding; verify after editing.** Always clear the T4 optimize cache (or use
   Development Mode) and **re-render** before claiming a page done. Computed render, not memory.
3. **Tokenize, don't dump CSS.** Route color / typography / spacing through **T4 tokens** so the
   template is themeable and ships light + dark from the start.
4. **Editable through admin (hybrid home).** Reproduce structure as **positions + modules** the way
   real JA templates do; reserve **static blocks** only for genuinely complex hero/feature sections.
5. **Cover the agreed matrix.** No requested or regression view left to chance — including **404, offline, search**, and the
   user **login / register / profile** flows.

## ⛔ Editability is the #1 review gate — read `references/editability-standards.md`

The highest-impact reason real JoomlArt reviewers **reject** a build: something the owner should edit
in the admin UI is baked into code. The full, binding rule set lives in
**`references/editability-standards.md`** (read it once at the start, re-check at Phase 8b). The one
rule that drives everything:

> **Ask of every text / image / link / section: "can the owner change this in the admin, no code?"**
> If no, it's built wrong — convert it to an **ACM block / native module / Joomla view.**

The six rules most often missed (full detail + probes in the standard):
- **Marketing pages = ACM section stacks** (`{loadposition <page>-page}`), one ACM module per section
  — NOT one baked article. **Only the blog stays `com_content` articles.** Footer/header/CTA/
  newsletter chrome are ACM too; newsletter = a real extension (Acymailing), never a dead form.
- **ACM language strings must resolve in the ADMIN** — define in `en-GB.tpl_<tpl>.ini` AND sync that
  file to `<site>/language/en-GB/` (the ACM addon loads it from `JPATH_SITE`), or every field shows
  raw `*_LABEL`.
- **Mega menu = plain-text titled columns**, UI-editable; no per-item icons, no `mod_menu` overrides.
  And **reachable by a mouse**: a full-width panel hung from the header leaves a strip T4 closes on
  (`blocks-and-elements.md` §5d, gotchas #80) — `review/mega-hover.mjs` must PASS, not a forced-open shot.
- **Complex visuals → swappable `media`-field IMAGES** (export the dark mockup; reads on both themes),
  not hand-drawn SVG/CSS. Simple icons/logos keep rendering; each section's image distinct + on-topic.
- **Module titles = `[<Tpl>] <Page> - <Section>`** (findable/sortable in Module Manager).
- **Menu hygiene:** backend tree == visible nav exactly (no hidden/duplicate/scaffolding items); Home
  in Main Menu; links use `Itemid` not hardcoded SEF; **styles map to layouts, not pages.**

## Three structural facts to pin first

Each silently no-ops a whole block of work when wrong — pin them before writing selectors:

1. **Provision the selected T4 quickstart.** After receiving the customer's HTML folder or URL
   (or another supported input), inspect its purpose, page types and layout, then choose the
   closest compatible starter from [JoomlArt Products tags](https://github.com/JoomlArt-Products/joomlart-products/tags).
   Read `references/provision-quickstart.md` before selecting or downloading. The quickstart
   supplies Joomla, its template, T4 and demo data; verify the installed versions and enabled T4.
   The bundled blank is the standalone-template path, not the default for a customer website.
2. **The megamenu renders from the DB, NOT from files.** It is driven by
   `#__template_styles.params['navigation_mega_settings']`. Shipping `etc/navigation/*.json` alone
   does nothing on the frontend. Create the menu items first → capture their ids → build
   `navigation_mega_settings` referencing those ids → write it into the style's `params` (or drive
   the T4 admin megamenu builder via Playwright). Full recipe: `references/demo-content.md` §4.
3. **T4 bundles CSS/JS into `media/t4/optimize/<hash>`.** Your edits won't show until you **clear
   that cache** (`scripts/clear-cache.sh`) or enable **Development Mode**. Do this before **every**
   verify render.

## The phase flow (run in order — read the packet, then execute)

| Phase | What you produce | Read this packet | Script(s) |
|---|---|---|---|
| **0 Provision** | select and install a compatible T4 quickstart from the customer input; running site + baseline | `provision-quickstart.md`; `provision.md` only for a blank-template build | (installer appropriate to the selected archive) |
| **1 Scaffold / identify** | use the installed quickstart template and styles; clone `t4_bs5_blank` only for a new blank-template build, **full rename BEFORE install** | `t4-anatomy.md`; gotchas #2 | `scaffold-template.sh` |
| **2 Ingest & Map + SELECT** | a validated **spec-pack + content/design contracts**; the chosen page subset + signature section | `inputs/spec-pack.md` → the matching `inputs/from-*.md`; `content-contract.md`; `design-contract.md`; `catalog.md` §6 | `ingest/spec-pack.mjs`, `ingest/from-html.mjs`, `ingest/from-url.mjs`, `make-design-spec.mjs` |
| **3 Chrome** | header/nav/footer/off-canvas blocks; `<positions>`; megamenu data; the logo as a light/dark pair + favicon + © the way Tracy customizes them | `blocks-and-elements.md`; `customize-your-site.md` | `seed-megamenu.mjs`, `install-shared-layer.sh` |
| **4 Layouts & theme** | multiple `etc/layout/*.json` (hybrid homes + inner + detail); theme+`palettes.json` (light+dark); **≥2 styles** | `layout-json.md` (read §0 binding first); `page-coverage-matrix.md` tier A/E | — |
| **5 Overrides + ACM** | `html/com_*`+`html/mod_*` overrides; **~11 ACM section blocks** | `page-coverage-matrix.md` tier B/C; `layout-json.md` §1d | — |
| **6 CSS tokenize (light+dark)** | `scss/` partials → `css/template.css` + `css/darkmode.css`, tokens carry both palettes | `design-contract.md`; `css-tokenizing.md`; `dark-light-mode-standard.md`; `darkmode/` | `compile-scss.sh`, `clear-cache.sh` |
| **6b Imagery** | license-safe images in `images/` | gotchas #11 | — |
| **7 Demo content** | validated content plan; categories/articles, menu, modules+positions, **megamenu seed** | `content-contract.md`; `demo-content.md`; `content-reconciliation.md` | `setup-demo-content.mjs`, `reconcile-content.mjs`, `seed-megamenu.mjs` |
| **8 Verify** | live light+dark parity per view, branching on `reference.kind` | `design-contract.md`; `verify-recipes.md`; `build-subagents.md` §A | `verify-render.mjs`, `clear-cache.sh` |
| **8b Review** | content consistency / editability / coverage / dark / platform-defect sweep; zero open findings | `content-contract.md`; `review.md`; `recurring-defects.md`; `platform-latent-bugs.md` | `scripts/review/*` |
| **9 Package** | de-blank, finalize system pages/langs, zip, **clean-frame install-smoke-test**; **ready for Tracy's "Customize your site"** | gotchas #41–#49; `build-subagents.md` §B; `customize-your-site.md` | `quickstart/brand-ready.mjs --fix` → READY |
| **10 Quickstart** | Akeeba `.jpa` + Kickstart, **parity-verified against the live build**; the in-template agent docs regenerated LAST (Q1b); `tracy_site_pages.json` beside the release | `packaging-quickstart.md`; `agent-docs.md`; `akeeba-method.md`; `verify-parity.md`; `customize-your-site.md` §4 | `scripts/quickstart/*` (`brand-ready.mjs` with the DB) |

For a customer website, Phase 1 records the existing template, styles, layouts, module positions
and extension dependencies. Keep its working wiring and adapt it through the remaining phases;
replacing it with a blank would discard the reason for selecting the quickstart. Phase 2 still
normalizes the customer's original input into the same validated spec-pack; starter demo content
is not the design reference. Phase 7 adapts the imported content, menus and modules to the client.
All subsequent verification, editability and packaging gates remain in force.

**Non-obvious landmines worth pinning** (full detail in the packets/gotchas):
- Phase 2: **nothing downstream may read a spec-pack that has not passed `--validate`.** The checks
  are blunt on purpose — a dangling reference path makes Phase 8 skip a page silently and report a
  pass.
- Phase 4: **one layout per style; chrome applies to every layout** (gotchas #15/#16/#20/#52) — read
  `layout-json.md` §0 before authoring any style.
- Phase 6: **pin the type tokens in `etc/site/default.json`, not just the theme JSON** — T4 generates
  `--heading-font-*`/`--*-line-height` from there and a cloned blank's Inter/600 defaults silently
  override your design (gotcha #57). Remap the palette-band + `--t4-card-bg` tokens for dark (#58/#59).
- Phase 6 dark delivery = the **vega standard**: a *separate* `scss/darkmode.scss` → `css/darkmode.css`
  loaded after `template.css` via `addCustomTag`, a static toggle button in the header block, a
  `js/darkmode.js` wirer — **never** in `custom.css`. Prefer the admin-configurable (cookie +
  server-side resolve) variant. Single source: `dark-light-mode-standard.md`.
- Phase 8b: **a scanner that printed "OK — clean" may have looked at nothing** — confirm it matched
  elements before trusting it (`review.md`).
- Phase 9: `system_optimizecss/js`=1, `system_t4frontendedit`=0; real default-style title (not
  `JLIB_INSTALLER_DEFAULT_STYLE`, #41); a working dark **toggle**, not just dark CSS (#42).
- Phase 3/9: **the customer's brand needs places the demo does not** — a `site_logo_dark` pair in the
  logo element and the drawer, the key in every profile, no CSS that inverts or swaps the logo, the
  favicon only through `other_faviconFile`, © from `mod_footer`, a titled home item. The shared layer
  carries the markup and CSS; `quickstart/brand-ready.mjs` checks the rest (`customize-your-site.md`).
- Phase 10: **Q1a prune first** — a site built on a base quickstart still carries the base's block
  definitions, layouts, profiles, template, description and thumbnails; `prune-audit.mjs` must
  print 0 PRUNE and every UNKNOWN must be decided (#81). Then the parity agent **never patches
  `<TEST>`** — patching the test defeats the test.

## Orchestration — inline vs subagents

Full decision tree + copy-paste dispatch prompts: **`references/build-subagents.md`**.

- **Build spine: run INLINE by default.** Sequential, shares live state; per-phase subagents would
  start from empty context and lose detail across hand-offs. Read one packet at a time.
- **Phase 8 verify + Phase 8b review: DISPATCH read-only SUBAGENTS** (parallel, independent,
  read-heavy), one per page group / dimension, each on its own browser slot. Defs:
  `t4-page-verifier`, `t4-editability-auditor`, `t4-coverage-auditor`, `t4-darkmode-auditor`,
  `t4-package-auditor`, `t4-design-review-unit`.
- **Phase 10 parity: `t4-quickstart-parity`**, one page-group each, read-only.
- **Phase 3 chrome + Phase 5 ACM/overrides: MAY dispatch EXECUTE subagents** (write files) — but ONLY
  once the spec-pack's `design-spec.md` is complete (so the agent reads the spec, not conversation
  context). One `t4-chrome-builder` for the coupled chrome cluster; parallel `t4-acm-block-builder` /
  `t4-override-builder` (distinct paths/worktrees, shared-file lines merged on the spine). Without
  the spec, build these inline. See `build-subagents.md` §C.

## Reference index

**Input adapters (Phase 2):**
- `inputs/spec-pack.md` — **the contract every adapter emits** and the `reference.kind` table that
  Phase 8 branches on. Read first.
- `inputs/from-pen.md` · `inputs/from-figma.md` · `inputs/from-url.md` · `inputs/from-html.md` ·
  `inputs/from-brief.md` — one per input format.
- `conversion-contract.md` — the HTML-bundle layout + `manifest.json` schema + the page→view mapping
  table and heuristics. Linked from `from-html.md`; also the reference for the `pages[]` schema.

**Cross-cutting (read as needed; linked from many phases):**
- `editability-standards.md` — the binding admin-editability rules (the #1 review gate).
- `dark-light-mode-standard.md` — the canonical dark/light wiring (server resolve, toggle, standalone
  pages, admin surfaces). Deeper detail in `darkmode/`.
- `t4-anatomy.md` — the file/folder map of a T4 template.
- `gotchas.md` — the numbered catalog of recurring traps, with a phase-grouped index at the top.
- `build-subagents.md` — when to stay inline vs dispatch; the verify/review/execute dispatch prompts.
- `customize-your-site.md` — what a template must provide so Tracy's seven questions (logo, favicon,
  name, pages) reach the site; the `brand-ready.mjs` rows and `tracy_site_pages.json`.
- `design-spec.md` — the design-spec artifact contract (one member of the spec-pack).

**Per-phase packets:** `provision-quickstart.md` (0, customer website) · `provision.md` (0, blank template) · `t4-anatomy.md` (1) · `inputs/*` + `catalog.md` (2) ·
`blocks-and-elements.md` (3) · `layout-json.md` + `page-coverage-matrix.md` (4–5) ·
`css-tokenizing.md` + `darkmode/*` (6) · `demo-content.md` (7) · `verify-recipes.md` (8) ·
`review.md` + `recurring-defects.md` + `platform-latent-bugs.md` + `review-verify-method.md` +
`menu-sef-and-data.md` + `content-architecture-audit.md` (8b) ·
`packaging-quickstart.md` + `agent-docs.md` + `akeeba-method.md` + `package-anatomy.md` + `export-from-live.md` +
`verify-parity.md` + `quickstart-gotchas.md` (10).

**Dark-mode deep pack (`darkmode/`):** `css-architecture.md` (runtime hook, `--dm-*` tokens,
mirror-light rule) · `gui-config-delivery.md` (the admin-configurable cookie variant) ·
`probe-recipes.md` (the scanner recipes) · `framework.md` (T4 vs T3 detection) ·
`darkmode-gotchas.md` (the dark-specific trap catalog).

## Scripts index

**Ingest (Phase 2)**
- `ingest/spec-pack.mjs` — **the gate.** `--validate <dir>` exits non-zero with one line per problem;
  `--init <dir> --page-map <file>` lays out the pack skeleton.
- `ingest/from-html.mjs` — HTML bundle or raw folder → spec-pack (`kind: html`):
  `node scripts/ingest/from-html.mjs <dir> --out <spec-pack-dir> [--single]`.
- `ingest/from-url.mjs` — crawl a live site → spec-pack skeleton (`kind: url`):
  `node scripts/ingest/from-url.mjs <url> --out <dir> [--max-pages N] [--allow-cross-origin]`.
  Leaves the palette null on purpose — colours must be read from `getComputedStyle` in a browser.
- `make-design-spec.mjs` — emit the design-spec skeleton from the page-map:
  `node scripts/make-design-spec.mjs <page-map.json> --out <spec-pack>/design-spec.md`.
- `parse-html-bundle.mjs` — print just the page-map JSON (the parser `from-html.mjs` wraps).

**Build**
- `design-contract.mjs validate|request|pilot|audit` and `design-probe.mjs` — pinned design rules,
  read-only measurements and complete page/variant coverage; see `references/design-contract.md`.
- `content-contract.mjs validate|compile|audit` — validate shared site facts, resolve referenced copy,
  and compare observed fields. See `references/content-contract.md`.
- `scaffold-template.sh` — clone `t4_bs5_blank` → `<TPL>` with full rename before install:
  `bash scripts/scaffold-template.sh --src <blank-dir> --dest <templates-dir> --name <machine_name> --title "<Title>"`.
- `seed-megamenu.mjs` — build `navigation_mega_settings`. File-write mode writes
  `etc/navigation/default.json`; `--print-sql` emits the `UPDATE #__template_styles …` (in
  `--print-sql`, `--template` is the template **name**; otherwise the template **dir**).
- `setup-demo-content.mjs` — derive a demo-content plan from the page-map and emit draft intent (no DB writes; SQL export is retired):
  `node scripts/setup-demo-content.mjs --emit plan|sql|joomla-cli <page-map.json|-|bundle-dir>`.
- `compile-scss.sh` — compile `scss/` → `css/` with dart-sass: `bash scripts/compile-scss.sh --template <dir> [--watch]`.
- `clear-cache.sh` — clear the T4 `media/t4/optimize/<hash>` bundle: `bash scripts/clear-cache.sh --root <joomla-root>`.

**Verify + review**
- `verify-render.mjs` — **diffs two computed-style snapshot JSON files** within a hex tolerance; it
  does NOT navigate or screenshot — you drive the live render via the Playwright MCP to produce the
  two snapshots: `node scripts/verify-render.mjs <A.json> <B.json> [--tolerance N]`.
- `review/probe.mjs` · `review/leak-scan.mjs` · `review/contrast-audit.mjs` · `review/border-scan.mjs` ·
  `review/seam-scan.mjs` · `review/hover-scan.mjs` · `review/toggle-test.mjs` — the dark-mode
  acceptance scanners. Recipes in `darkmode/probe-recipes.md`.
- `review/mega-hover.mjs <url> [--viewport N]` — mega-menu reachability: real pointer path
  trigger → panel → link → click, Escape/outside-click close. The behaviour half of the mega
  menu contract (`blocks-and-elements.md` §5d); exits 1 on FAIL. Run per language at the
  desktop bp and 1024.

**Package**
- `quickstart/prune-audit.mjs` — Phase 10 Q1a: the base quickstart's leftover definitions (ACM
  dirs, layouts, profiles, overrides, templates, css, manifest identity, tokens) measured from the
  DB and the tree; exit 1 while any PRUNE; `--apply` removes files (gotchas #81).
- `quickstart/gen-docs.sh --template <tpl> (--container <c> | --ddev) [--block-prefix P …]` — Phase 10
  Q1b: regenerate the four DB-derived docs a template ships (`docs/site-map.md`, `inventory.md`,
  `blocks.md`, `positions.md`) inside the site's PHP runtime; run LAST, after the final content
  edit. What each shipped doc is and who authors the other six: `agent-docs.md`.
- `quickstart/brand-ready.mjs --template <dir> [--fix] [--sql-cmd "<cmd>" | --data facts.json]` — Phase 9/10:
  is the template ready for Tracy's "Customize your site" (logo pair, dark-logo field and key, logo CSS,
  favicon, home title, copyright); `--fix` writes the field, strings and profile keys; exit 1 while any FAIL.
- `quickstart/secret-scan.sh` — fail the build if a secret or dev artifact is about to ship.
- `quickstart/export-db.sh` — dump the demo DB, tokenizing the prefix to `#__`.
- `quickstart/jpa-extract.py` — extract an Akeeba `.jpa` headlessly.

## Setup

`npm ci` inside the skill folder (jsdom + playwright), then `npx playwright install chromium`
for the Phase 8b scanners; `npm test` to confirm.
Sass is pinned in the skill lockfile and installed by `npm ci`. A Playwright MCP connected for
the live render, installer drive, and megamenu builder. DDEV + Docker for the DDEV provisioning path; an authorized existing Joomla target can be reused. Full
instructions, including the Codex/Cursor paths: `INSTALL.md` at the plugin root.

## Shared layer and the review gate suite (imported from TCH, 16/09/2026)

`assets/shared-layer/` is the layer shared by every T4 template Tracy builds: the ACM blocks
(accordion · carousel · tabs · timeline …) with their `config.xml` and CSS, plus `html/com_*`
overrides for the Joomla views the template must control. `scripts/install-shared-layer.sh`
pours that layer into a template being built; `scripts/make-style.mjs` and `make-variables.mjs` generate SCSS
and variables from the design system; `scripts/neutralise-css.mjs` strips hard-coded colour/spacing from imported CSS.

`scripts/review/` is the gate suite that measures a built template — band rhythm, block coverage, visible borders,
cascade ownership, content depth, the dark switch, drawer states, contrast… Each gate
runs independently and prints what it measured; `agents/t4-content-auditor.md`, `t4-interaction-auditor.md`,
`t4-responsive-auditor.md` are the three roles that read those results.

⚠ This part came from `TracyHQ/tch` branch `chore/docs-to-main`, where it was written and actually used. The
files this repo had already taken in another direction (SKILL.md, references, `scripts/ingest/*`,
`scripts/content-contract.mjs`) keep this repo's version — the import only adds, it does not overwrite.
