---
description: Release a quickstart on joomlart-products — the two files Tracy reads, how to compose them, and how Tracy reads the release list.
sources:
  - scripts/tracy-setting.mjs
  - scripts/check-pack-modes.mjs
  - packages/design/tracy-ds-slot/scripts/role-scan.mjs
  - packages/design/tracy-ds-slot/src/release-role-scan.mjs
  - packages/design/tracy-ds-slot/scripts/release-joomla.mjs
  - apps/tracy-web/src/lib/template-customization-question-readiness/readers/webroot-modes.js
  - packages/site/tracy-site-build-core/src/tracy-setting.mjs
  - packages/site/tracy-site-build-core/src/questions.mjs
  - docs/adr/0017-github-release-is-quickstart-source-of-truth.md
---

# Releasing a quickstart

A **quickstart** is a pre-built site that a customer's new site starts from. Since 15/09/2026, its source
of truth is **a release on `JoomlArt-Products/joomlart-products`**, not any file in the repo
([ADR 0017](../adr/0017-github-release-is-quickstart-source-of-truth.md)).

**Quickstart name = tag name.** `tracy-business/emdash-0.x`, `tracy-base/wp7`, `quickstart/ja-kinetic/j6`.
A tag declares **one version** — the newest; old versions stay on the release for people to look up, Tracy does not read them.

## The files Tracy reads

Every other asset of the release — `manifest.json`, `SHA256SUMS`, `VERIFICATION.json`, README — belongs to
the publisher. **Tracy does not read them**, and no one has to change them.

### 1. `tracy_setting.json` — required, for installing

```jsonc
{
  "schemaVersion": "tracy-setting/v1",
  "platform": "emdash",                 // joomla | wordpress | emdash
  "label": "Tracy Business",            // text shown on /ops and on the card
  "version": "1.0.0",
  "cms": "0.37.0",                      // the CMS version the built site runs
  "install": {                          // files of THIS release itself
    "source": { "file": "tracy-business-emdash-quickstart-1.0.0.zip", "sha256": "7e93…" },
    "state":  { "file": "tracy-business-emdash-state-1.0.0.tar.gz",   "sha256": "5e41…" }
  },
  "template": "tracy-business",         // optional
  "languages": ["en", "ru"],            // optional
  "card": { … }                         // OLD — only still read on releases cut before 16/09; the card is now a separate file `tracy_design_inspiration.json` (validateDesignInspiration)
}
```

**`install` has a fixed shape per CMS**, and the PHP CMSes have **two**:

| CMS | Shape | Real example |
|---|---|---|
| Joomla · WordPress | `webroot` + `database` — a captured site, restored like an import run | `tracy-apple/j6`, `tracy-business/j6` |
| Joomla · WordPress | `bundle` — an Akeeba zip, restored by Kickstart | `tracy-base/j6`, and **all 78 `quickstart/ja-*`** |
| EmDash | `source` + `state` — packed template + SQLite snapshot | `tracy-business/emdash-0.x` |

Joomla may add `cowork` (package `pkg_claudecowork`) next to either shape.

Three things the validator rejects, each because of a bug that really happened:

- **A `file` that is not in the asset list of that same release.** Measured 15/09: `quickstarts.json` pinned
  `tracy-apple-j6-webroot-1.2.0.tar.gz`, the release only had 1.1.0, the URL returned 404 — and `tracy-apple/j6` is
  Joomla's default base.
- **Half of one shape plus half of the other** (`webroot` without `database`). That is not one missing
  file; the build would get half a site.
- **A `url` in the file.** The download address is assembled from tag + file name, so a setting cannot point the host
  somewhere else.

### 2. `tracy_site_question.json` — optional, for asking

The questionnaire the customer answers before the build, in the `tracy-questions/v1` format — **copy verbatim** the composed file
(the template's `seed/questions.json`), do not embed it, do not transform it. No file → the site is asked the CMS's
default set, and that is not an error.

Each question declares `step` (page of the form, missing = 1), `kind` (`text · longtext · choice · multi ·
languages`) and `feeds` (**who reads the answer**). Details: [`i18n.md`](i18n.md) for the language part,
`packages/site/tracy-site-build-core/src/questions.mjs` for the contract.

⚠ **A released version must cover every language Tracy ships** (21, measured 15/09) — gate `check-questions` holds this.
A missing language means the form asks in English in the middle of a non-English interface, and
nothing else reports it. A draft composed on `/ops` may be incomplete; the **Translate** button there fills the rest.

⚠ **Since 07/10/2026 (#1013, D11) Tracy does NOT serve this file.** Every new site is asked the CMS's 7 default questions
(`apps/tracy-web/src/questions/<cms>.json`); the file is still read into table `question_set` to keep it,
but does not reach the customer. Per-template questions are a later round.

### 3. `tracy_site_pages.json` — the template's real page list, for the Pages question

Since 07/10/2026 (#1013, O4). The **Pages** question on the "Customize your site" sheet lists exactly this file;
pages the customer unticks are hidden from the site (WordPress: page goes to draft; Joomla: menu item unpublished; EmDash:
entry unpublished + removed from the main menu). No file → the Pages question says "keep every page", no error.

```json
{ "pages": [ { "id": "home", "label": "Home", "home": true }, { "id": "about-us", "label": "About Us" } ] }
```

- **Exactly one `home`**, no duplicate ids, no empty label, **no unknown fields** (strict validator:
  `validateSitePages` in `apps/tracy-web/src/lib/site-pages-schema.mjs`).
- **id** is what the engine uses to hide: WordPress = **page path** (like `get_page_uri`: parent slugs joined
  with `/`; for a level-1 page it equals the slug — JA Impact WP has two pages with the same slug `category-blog`); Home =
  the `page_on_front` page, not by slug `home`. Joomla = **path of the published menu item**
  in `mainmenu` (`product/features`; for a level-1 item path = alias, so old ids are still right; Home is still the alias
  of the home item) — without `mainmenu`, the menu of the English home item, e.g. `tb-main-en`. EmDash = slug of the
  record in the `primary` menu of `seed/site-model.json`.
- **What to list (since 08/10/2026, #1013):** every content page the customer can reach from the main menu, **at every level**
  (children of a submenu heading count too — the 07/10 version only read level 1, JA Kinetic lost 11/13 pages). Skip: system
  pages (login, registration, reset/remind, profile, error/404, offline, typography, search, tag/author
  lists, archives) and other demo variants of the home page (the branch holding the home page, labels "Home …", colour variants).
  Duplicate or generic labels ("Layout 1", "Video") get the parent heading in front: "Detail › Layout 1".
  Unticking a child page: Joomla removes exactly that item; a parent heading whose children are all removed is removed too; WordPress cuts
  the link and empty submenus (including nav written directly in a template part).
- **Generate it with the tool, don't write it by hand:** `tracy-dev site-pages` (`TracyHQ/tracy-template-dev`,
  `plugins/tracy-dev/lib/site-pages.mjs`; the `quickstart` skill generates it itself when packing) for Joomla + WP;
  `tools/release.mjs --site-pages` of the 3 EmDash themes. The tool stops and names the id if an id does not match
  exactly one page.
- **Can be attached to an existing release**, no need to cut a new version: the file does not change webroot/DB so the contract
  does not change; Tracy rereads every asset each run (boot, 10 minutes, Refresh, webhook). 40 gallery releases had it
  attached on 07/10/2026.
- Read in `fetchReleases` (`quickstart-releases.js`) + `local-releases.js`, stored in column
  `quickstart_releases.pages` (migration 074), replaced on each read. A bad file → the release carries a `reason`,
  the load run does not crash.

### 4. `design-system-roles.json` — role scan report, for rule VARS-1

An ADDED step in the existing packing process (not a new process), run on the **template source**
right before the packing step (pack / `release.mjs` / `tools/release.mjs`), so the packed version carries the changed source:

```bash
# 1. turn every hard-coded value with a clear role into a role variable, keeping the old value as fallback
node packages/design/tracy-ds-slot/scripts/role-scan.mjs <template folder> --write
# 2. the agent handles each "Flag for agent" item in the summary, then checks again until exit code 0
node packages/design/tracy-ds-slot/scripts/role-scan.mjs <template folder> --check \
  --version <version from tracy_setting.json> --out <release folder>/design-system-roles.json \
  --summary <release folder>/design-system-roles.md
```

- The scanner sorts each hard-coded colour / radius / font into three classes: **auto** (clear role: `--write` rewrites
  it as `var(--ds-…, <old value>)`, with no system chosen the page is identical), **flag** (unclear role: no guessing,
  lists `file:line`, value, candidate roles), **keep** (images, logos, flags, shadows, masks: `handled: true`
  with a reason). The variable list comes from `packages/design/tracy-ds-slot/src/role-variables.mjs`.
- A fourth class **missing** (role not read): buttons, input/search/newsletter fields, chips, cards that **draw a frame**
  (background or border) but **declare no radius** — there is no literal to scan, but the system's rounding cannot
  reach them. `--write` does not add a radius by itself; the agent adds `border-radius: var(--ds-…-radius, <old radius>)` by hand.
  The detection rules are written at the top of `src/role-scan/missing-radius.mjs`.
- Light text (`text-white`…) looks for its background on the **parent element** in the same file (and through wrapper components with `<slot />`
  whose source is readable); conditional backgrounds, breakpoint-dependent backgrounds, gradients, classes from props, elements assigned to variables:
  still flagged. A WordPress theme's `theme.json` (and `styles/*.json`) is scanned and rewritten like CSS;
  Tailwind 3's `tailwind.config.*` is read statically (not executed) to get the original colour/radius values.
- **Keep by hand:** write `/* ds-keep: <reason> */` (CSS), `{/* ds-keep: <reason> */}` (JSX) or
  `<!-- ds-keep: <reason> -->` (HTML/Astro/PHP) on the same line, on the line right above (a line holding only that marker), or
  before the selector / inside the block of a CSS rule (the whole rule). The scanner records that item as keep, reason
  `manual keep (ds-keep): <reason>`, and VARS-1 accepts it as handled. A marker without a reason keeps nothing.
- **Sass/LESS:** never write `var()` into a `$x:` / `@x:` variable definition (Sass functions like `tint-color`,
  `shade-color`, `darken` read it, and `var()` breaks the build) and do not touch colours inside Sass functions: those items
  are flags. Usages and compiled CSS are still rewritten. Compiled CSS whose Sass/LESS source is scanned
  (via `.map` or same name `css/x.css` ↔ `scss/x.scss`) is marked `twin`: still listed and `--write`
  still rewrites it, but it is counted only once, at the source (separate `totals.twin`).
- **Skipped (recorded in `skipped` with a reason):** libraries by name (`*.min.*`, bootstrap, owl, isotope…), one-line
  minified scripts, files whose header says "generated … do not edit / rerun", CSS carrying a `/*! Bootstrap v…` banner.
- The page background comes from `background` of body/html/:root (light and dark sides, through variables and `light-dark()`); the
  dark side accepts `html.t4-dark`, `.dark`, `[data-theme=dark]`, `[data-bs-theme=dark]`…; `html:not(.t4-dark)` is the
  light side. Component variables (`--t4-btn-bg`, `--cats-tile-bg`) take their role from the rule that sets them (`.btn-primary`
  → accent), not from their name. Fonts: mono and icon fonts are keep; the rest follow the body / heading typeface.
  Square corners of full-screen panels (`w-screen`, `inset-0`, `fixed`, `100vw`) are flagged, not rounded automatically.
- **Role with no place of use (`ds-not-used`):** when a template has no honest place for a required role (e.g.
  Tracy Base WordPress has no ink band), declare it in its own stylesheet
  `/* ds-not-used: --ds-c-ink, --ds-c-on-ink — <reason> */`; a JSON-only theme declares it in
  `theme.config.json` `roleReads.notUsed` as `{ "--ds-c-ink": "<reason>" }`. A reason is required. The report records
  `notUsed: [{ name, reason }]`, drops those roles from `missingRoles`, and VARS-1 accepts it. Six roles can **never**
  be declared unused (`ALWAYS_REQUIRED` in `role-variables.mjs`): `--ds-c-bg`, `--ds-c-fg`,
  `--ds-c-accent`, `--ds-c-accent-on`, `--ds-c-border`, `--ds-c-heading`; declaring them is refused
  (`notUsedRefused`) and they still count as missing.
- **Framework CSS:** compiled lines whose `.map` points to a source outside the template (T4/Bootstrap Sass in
  `plugins/system/t4`), `tpl/*.tpl.css` files with `__…` placeholders and the `theme.css` built from them are `keep` with the reason
  `framework: …` (field `framework`), and `--write` never writes them. They follow the system through the framework's root
  variables (`--t4-*`, `--bs-*` at `:root`/`[data-bs-theme]`): any root variable the framework reads that the template's
  stylesheet does not point at a role (`--t4-success: var(--tb-success)` → `var(--ds-c-success, …)` is enough) yields
  **one** flag item for that variable, not one item per literal.
- `--check` exits 1 while unhandled items remain (auto not yet written, flag, missing, or required roles not read
  `missingRoles`). Running `--write` twice
  changes no byte on the second run: every decision is computed from the original value (a role read already written is read as its old
  literal).
- Attach `design-system-roles.json` to the release like any other `tracy_*.json`. VARS-1 only accepts a report whose
  `version` and `platform` equal the release's; a missing file is "Not scanned yet", which holds Publish.

#### Where the scan step sits in each release path (15/10/2026)

General rule for every path: scan the **template source about to be packed**, **before** packing; a non-zero exit code
stops the build (no shortcut); `design-system-roles.json` sits in the release folder next to `manifest.json`
and is uploaded in the **first group of files**, before `tracy_setting.json`. The `.md` summary stays outside the release
folder (not uploaded). What blocks on the machine = exactly what VARS-1 blocks on `/ops` (`roleScanBlockers` in
`src/release-role-scan.mjs`): unhandled items that are not twins, and required role variables not read.

| Path | Who owns the code | Status |
|---|---|---|
| Next JA Joomla version (`release-batch.mjs build` → `release-joomla.mjs`) | tch, `packages/design/tracy-ds-slot` | **wired**: scans `templates/<tpl>` after tokenize, before packing; `commands` lists the file and refuses when the report is missing, has a different version or is not clean |
| Every CMS from a local site (`tracy-dev quickstart`) | `TracyHQ/tracy-template-dev`, `plugins/tracy-dev/lib/actions.mjs` | **not wired**, needs a fix in that repo (snippet A) |
| WordPress port (`scripts/quickstart/release.mjs` of the tracy-wordpress-theme skill) | Hano, `JoomlArt-Products/tracy-wordpress-theme` (vendored tree `vendor/wordpress/tracy-wordpress-theme`) | **not wired**; usable right away with `--asset` (snippet B) |
| EmDash (`tools/release.mjs` of the 3 themes) | `packages/cms/tracy-emdash-theme-{base,business,saas}` | **not wired** (snippet C) |

JA Joomla releases from the published webroot, so the place to fix the source is `--overlay <folder>` (a `templates/<tpl>` folder
that has had `role-scan.mjs --write` run and its flag/missing items handled by hand). Without an overlay the build stops and prints
`file:line (component)`, as intended: a version not scanned clean cannot become a release.

**Snippet A: `tracy-dev quickstart`** (`lib/actions.mjs`, function `quickstart`, right after `a.clearCache?.(s)`, before
`a.pack(...)`). `publishCommands` already uploads every file in `out`, so the file only needs to be written there:

```js
// role scan of the template source about to be packed (tch rule VARS-1); stops the build when unclean
const tplDir = s.cms === 'joomla' ? join(s.dir, 'web/templates', s.template)
  : s.cms === 'wordpress' ? join(s.dir, 'web/wp-content/themes', s.template)
  : join(s.dir, 'app'); // EmDash: the project folder the adapter's app(site) returns
const scanner = join(tch.locate(), 'packages/design/tracy-ds-slot/scripts/role-scan.mjs');
const scan = sh('node', [scanner, tplDir, '--check', '--template', s.template, '--platform', s.cms,
  '--version', version, '--out', join(out, 'design-system-roles.json'),
  '--summary', join(s.dir, 'dist', `design-system-roles-${version}.md`)], { allowFail: true, capture: true });
if (scan.code !== 0) throw new TracyDevError(`role scan: unresolved roles in ${tplDir}`,
  `read ${join(s.dir, 'dist', `design-system-roles-${version}.md`)}; run role-scan.mjs --write, settle each flag, pack again`);
```

(`import * as tch from './tch.mjs'` at the top of the file; `sh` from `lib/util.mjs` returns `{ ok, code, … }` with `allowFail`.
Joomla 4+ keeps assets in `media/templates/site/<tpl>`: add `--include` for that folder when the template declares `<media>`.)
Add `design-system-roles.json` to the list in `skills/quickstart/SKILL.md` step 2.

**Snippet B: WordPress `release.mjs`** (Hano). Usable right away, nothing to change: before the `release.mjs` step run

```bash
node <tch>/packages/design/tracy-ds-slot/scripts/role-scan.mjs <theme dir> --check --platform wordpress \
  --template <stylesheet> --version <version> --out <run-root>/design-system-roles.json \
  --summary <run-root>/design-system-roles.md
```

then pass `--asset <run-root>/design-system-roles.json` to `release.mjs`. To make it mandatory: in
`acceptRelease`, reject `[role-scan-missing]` when no `--asset` is named `design-system-roles.json`, and
`[role-scan-unclean]` when `unresolved > 0` or `version` differs from the manifest. Record it in `references/quickstart.md`.

**Snippet C: EmDash `tools/release.mjs`** (all 3 themes; the `import` line goes to the top of the file, the rest before the
`const sums = [` block):

```js
import { releaseRoleScan, roleScanError } from '../../../design/tracy-ds-slot/src/release-role-scan.mjs'
// role scan of the packed theme source (tch rule VARS-1): stops the release when unclean
const roleScan = releaseRoleScan({ templateDir: artifact, releaseDir: out,
  summaryDir: path.dirname(out), template: product, platform: 'emdash', version })
if (roleScan.blockers.length) fail(roleScanError(roleScan, artifact).message)
```

and add `'design-system-roles.json'` to both the `assets` array (for `validateSetting`) and the `sums` array: the
`gh release create` command printed at the end reads `sums`, so the file goes with the release.

## Every new Joomla/WordPress version needs TWO things in tch before upload

Upload a new version while tch lacks the two things below and `/ops` immediately reports *"Contract from an older version"*
and six must-fix items (REL-3, FAV-1, LOGO-1..3, STAB-1). This happened on 15/10/2026 with `tracy-business/wp7` 1.3.7.

1. **A row for that exact version** in `apps/tracy-web/src/lib/template-profiles.json`, measured on the archive
   (logo, favicon, text in place of the logo, dark-background logo; note what changed from the previous version).
2. **A contract cut from that exact archive**: `packages/cms/tracy-<cms>-quickstart/contracts/<release>/<version>/`.

### WordPress patch release (1.0.0 → 1.0.1): one command

```bash
node packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs \
  --release-dir <release folder: SHA256SUMS, manifest.json, archive, theme zip> \
  --previous <slug>/wp7/<previous version> [--previous-release-dir <release folder of the previous version>]
```

The command does every step that used to be done by hand (4–5 hours per version), and loosens none of `/ops`'s rules:

- **Records**: the previous version's `manifest.json`, with id, version, `parts` fixed per `SHA256SUMS` (checking the sha256 of each
  archive) and runtime per the release's `manifest.json`; `content-map.json` copied, then image slots recaptured from the dump
  (`capture-image-slots.mjs`); `capture-inventory.mjs --webroot`; `build-wordpress-{editions,demo-trim,superseded}.mjs`;
  copies `<version>.copy.json` and `<version>.design.json`. Content map or image slots differ from the previous version → **stop**, unless
  `--accept-content-change` is added after reviewing.
- **`patch-evidence.json`** in the records: contains only what the `contracts` gate can recompute from the committed files of the two
  versions — the manifest's `parts`, the sha256 of the two locks, the two content maps, brand facts, profile row, the changed theme files
  (from the two locks), whether the database changed — plus the slot contract file name and the `maxVersion` bump. No theme zip hash
  or slot contract hash (their bytes are not committed per version); editing any value by hand → the gate goes red.
  The webroot-by-area table (when `--previous-release-dir` is given) is only printed to the screen.
- **The slot contract's `maxVersion`** may only be bumped when CSS-1 and CSS-2 pass on that release itself; not passing → stop.
- **Design system measurements**: may only be **inherited** (`inheritedFrom` = the immediately previous version) when the committed files of BOTH
  versions prove it: the two `presentation-lock.json` hold the same theme (instead of the zip: hash of each theme file, stylesheet), the two
  `content-map.json` are byte-identical, `maxVersion` unchanged. The slot contract is not committed per version (one file per
  theme); the door picks it by stylesheet and the Version in `style.css`, both of which are in the lock, so same lock means same
  contract. /ops and the gate decide with the same function (`inheritanceProofAt` + `evidenceMismatches` in
  `measurement-inheritance.js`): evidence must be exactly what the committed files compute at every link, and evidence with a
  `maxVersion` bump may not be inherited. A chain of database
  patches 1.0.0 → 1.0.1 → 1.0.2 is checked link by link. WordPress only. Otherwise the command runs `release-measure.mjs` itself
  on the release's stand.
- **Profile row**: copies the previous version's row **only when the brand facts measured on both releases are equal**
  (`brand-facts.json`, the `brand-facts.mjs` step of `release-measure.mjs`: number of logo slots and the option each slot reads, the logo
  frame drawn, whether the height is held, favicon, text in place of the logo). If the previous version has no such file yet, the command measures it
  once (needs `--previous-release-dir` or `gh`). Different → stop and print each difference; the row must be written by hand from the measurements.
  Each `brand-facts.json` carries the tag, version and hash of the theme file set it measured on the stand (`themeFiles`), compared with the lock of
  that same version: a file copied from another version is rejected. Fields that cannot be measured are only copied with their own evidence:
  `footerSlot` when that slot entry is byte-identical in the two content maps; `framework`/`profiles`/`darkSpots` when the theme
  is byte-identical; `unverified` is never copied — the command stops and names the field. `note` records which version it was copied from and why.

`--check` recuts in a temporary tree and reports which files differ in bytes (use exactly the flags of the cut run: `--previous-release-dir` changes the content of `patch-evidence.json`). `--no-measure` does not run a stand, it only prints the measuring commands still
missing. Several templates at once: first run one `release-measure.mjs --jobs 2 <tag>@<v>=<folder> …` run for all of them
(add `--brand-only` for versions that only change the database), then `patch-artifacts.mjs` per template — at that point it no longer
builds a stand. The `contracts` gate (`scripts/check-contracts.ts`) keeps `patch-evidence.json` consistent with the committed manifest, lock,
content map, profile row and brand facts, and rejects `inheritedFrom` measurements without evidence.

Joomla is still done by hand: copy the previous version's `content-map.json` + `presentation-lock.json` + `manifest.json`, then run
the tools of the `quickstart-contract` skill.

Check with `node scripts/template-customization-question-readiness.mjs <pack folder> --tag <tag>` **on the pack
on the machine, before uploading**: upload only at 0 must-fix. The `design-templates` gate goes red when the newest version of a release
has only one of the two things (`template-profile-contract-pairs.js`); a version missing BOTH is caught only by the readiness command
on the pack, because CI cannot read the release list (no `TRACY_RELEASES_GITHUB_TOKEN`).

## Modes of files in the webroot — 0644/0755, nothing else

Provisioning extracts the webroot with `tar -xm` as root, **keeping the mode** of each file, then the
web/wp-cli containers read it as a different user. On 12/10/2026 eight WordPress quickstarts were packed from a site restored under
`(umask 077; …)`: every file 0600, every directory 0700, and every new site died at the first wp-cli command (*"This
does not seem to be a WordPress installation"*). Fixed by cutting the next version, same content bytes, modes
normalised.

- Check a package before publishing: `node scripts/check-pack-modes.mjs <package folder>` → exit code 0 when every file is
  0644 or 0755 and every directory 0755.
- STAB-1 of the Template Customization Question Readiness checker is red (owner `template`) when the version being read
  carries a webroot with wrong modes; a downloaded version without a webroot is noted "not checked".
- `umask 077` may only wrap the command that creates the log file, never `restore`/`quickstart` (skill
  `quickstart-contract`). tracy-dev since 0.7.2 normalises the tree itself on restore and on packing.

## Composing those two files

Don't write them by hand. `scripts/tracy-setting.mjs` reads the release itself and copies back what it has published:

```bash
node scripts/tracy-setting.mjs write 'tracy-business/emdash-0.x' \
  --label 'Tracy Business' --cms '0.37.0' --template 'tracy-business' \
  --questions packages/cms/tracy-emdash-theme-business/seed/questions.json \
  --out /tmp/tracy-setting/tracy-business-emdash
```

It prints the file contents, the folder holding them, and **the upload command for a person to run** — the script does not attach the file to
the release by itself. Only the words the owner owns come from flags (`--label`, `--cms`, `--template`); if one is missing it
refuses rather than guesses. `--platform` is only needed when the tag does not say (`/j6` → Joomla, `/wp7` → WordPress,
`emdash` → EmDash).

Check after attaching:

```bash
node scripts/tracy-setting.mjs check 'tracy-business/emdash-0.x'
```

⚠ **Checksums come from two sources, and they must.** `SHA256SUMS` is written at the first release and
**is not rewritten** when files are attached later — `tracy-apple/j6` is an example: the sums only list three files
of 1.0.0, while the checksums of the 1.1.0 webroot/database are in `runtime-manifest-1.1.0.json`. The script
reads both; it **never computes hashes itself** from a download, because that would certify that particular
download rather than what the release has published.

## How Tracy reads the release list

`tracy-web` calls the GitHub API through the **App installed on `joomlart-products`** (`config.github`; fallback for the
dev machine: `TRACY_RELEASES_GITHUB_TOKEN`), downloads `tracy_setting.json` of every release that has one, validates it against the
asset list, then stores it in table `quickstart_releases`. Refresh: at boot · every 10 minutes · webhook
`release` · the **Refresh from GitHub** button on `/ops/cms/quickstarts`.

**When GitHub does not answer, the page still draws the last read**, with the time of reading — and the site-creation door can still use
that entry. An empty list because the network is broken, drawn like a truly empty list, is the most expensive
lie on this screen.

Each release carries **three independent states**, three columns on the page:

| Axis | Values | Who decides |
|---|---|---|
| `kind` | `quickstart` · `design-pack` | tag / manifest |
| `github` | `published` · `prerelease` · `draft` | GitHub |
| `tracy` | `ready` · `no-setting` · `invalid` | Tracy's validator |

Selectable (in the default-base dropdown) = `quickstart` ∧ not `draft` ∧ `ready`. A release that **does not yet have**
`tracy_setting.json` still shows in the list with a reason — hiding it would make the list read as complete.
