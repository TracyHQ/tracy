# Fix map: every verdict code, as it is fixed on WordPress

The fix of every code lives in one place, the fix registry (`apps/tracy-web/src/lib/template-readiness/fixes.js`),
and the verdict JSON carries it as `fix` under each piece that is not `done`. Its commands and skill sections are
written for Joomla first. This page says, for **every** code the registry holds, how that fix is run on a WordPress
block theme, or that it stops the run (SKILL.md section 5), or that it goes through procedure W1 or W3, or that a WordPress release never gets it.
`scripts/test/fix-map.test.mjs` fails when a registry code is missing here or a code here is not in the registry.

Words used below:

- **Contract folder**: `packages/cms/tracy-wordpress-quickstart/contracts/<slug>/wp7/<version>`.
- **Demo**: a site restored from the pinned version with `tracy-dev:restore`, nobody has written to it. Its address is
  the one its `siteurl` names (WordPress redirects any other host to it).
- **Kit rebuild**: [`kit-rebuild.md`](kit-rebuild.md) (WordPress build flags, hidden fields kept).
- **Measure**: the registry's `content-coverage/cli.mjs` command on the demo, `--db-dump` the release's database file,
  `--webroot` its unpacked webroot. A page under a parent opens by its whole path (`?pagename=j-pages/login`), the
  parents read from `inventory.json` beside the map; a contract without one answers 404 on every child page.
- **New contract version**: on WordPress the pinned Claude Cowork plugin carries the contract files byte for byte
  (`cowork.contractFiles` in `quickstarts.json`, held by the `contracts` gate, `scripts/check-contracts.ts`; in the
  claude-cowork repository they sit in `wordpress/cowork/lib/contracts/<design>/wp7/<version>/`, copied by
  `wordpress/cowork/build.sh`). Any change to `manifest.json`, `content-map.json`, `presentation-lock.json`,
  `demo-trim-map.json`, `editions.json`, `showcase-nav-map.json` or `superseded.json`, and any new template release (a
  new version needs its own contract), needs a plugin release carrying the new files: **procedure W1**. Files beside
  the contract that the plugin does not carry (`template-kit.json`, `content-coverage.json`, `demo-measures.json`,
  `demo-baseline.json`, `inventory.json`, `navigation-source.json`, the accept files) are committed without one.
- **Theme release**: the fix is made in the theme overlay `packages/cms/tracy-wordpress-theme/overlays/<theme>/`
  (`src/<theme>/` is generated whole by `node scripts/build-wordpress-theme.mjs`, `--check` is its gate), then a fix
  release is cut by the vendored `tracy-wordpress-theme` skill (`vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/quickstart.md`,
  sections *Release a fix version* and *Patch release recipe*). A new version means a new contract version: procedure W1.

## Procedures W1 and W3: a contract change reaches a site

Both are steps with a recipe, run at green ([`green.md`](green.md)), not stops.

**W1, the plugin carries the contract.** In the claude-cowork repository, by hand and never from CI:
`node scripts/release-wordpress.mjs X.Y.Z --dry-run`, then without `--dry-run`. It opens the `release/<tag>` PR
(`scripts/release-pr.mjs`), tags `wordpress-vX.Y.Z` and attaches `claude-cowork-X.Y.Z.zip`. Merge that PR, then pin.
A plugin cut before the contract changed is re-cut, never pinned (the pin script refuses it).

**W3, the pin.** In this repository, once the release is published:

```bash
node scripts/pin-wordpress-quickstart.mjs --quickstart quickstart/<slug>/wp7 --plugin-tag wordpress-vX.Y.Z --dry-run
# a new quickstart version also moves the entry itself (version, contract, webroot, database from its release):
node scripts/pin-wordpress-quickstart.mjs --quickstart quickstart/<slug>/wp7 --plugin-tag wordpress-vX.Y.Z --version <V> --dry-run
```

Read the diff, run again without `--dry-run`: it writes both `quickstarts.json` copies as one text. It refuses, writing
nothing, unless the zip carries the entry's contract byte for byte as this tree holds it. Then
`pnpm exec tsx scripts/check-all.ts --only contracts` is green. `design-templates.json` lists Joomla templates only
and is not touched. The Joomla recipe (`quickstart-contract` `references/ship-and-release.md` section 8 step 6,
`scripts/pin-joomla-cowork.mjs`) stays Joomla only.

## Stops

| Stop | When | Who must act |
|---|---|---|
| W2 | `content-map-missing-lists` on a version whose profile is already released. The capture makes post entities (`capture-contract.mjs --posts`: title, excerpt, named blocks, featured picture; Claude Cowork 0.18.38 or later reads them), but a released profile is locked: `build-wordpress-superseded.mjs` refuses a changed `presentation-lock.json` in place ("publish a new profile version instead"), and a new profile needs a new quickstart version | not a person: cut the next version with procedure W4 (a theme patch release), capture its profile with `--posts`, then W1 and W3 |
| W4 | A fix release needs the port's dossier (`--run-root`, `--spec`, `page-map.json`, `visual.contract.json`) and it is not on this machine, or the full sweep finds a difference that is not in the previous version's baseline and needs design input. The release itself is a procedure: [`patch-release.md`](patch-release.md) | the person who ran the port; the port owner for a new difference |
| W5 | Coverage hole with no WordPress door ([`coverage-holes.md`](coverage-holes.md) section 3; class `unknown` is read by the agent first, section 4); a design-system fault in read-only design data; a piece not `done` with no `fix`; a code this page marks *not on WordPress* that a WordPress release returned; a hook or permission blocks a command | the plugin owner (a new door) or the port owner (a design change), the design system owners, a person adds the registry entry, a person reads the check, the preparer |

## Every code

| Code | On WordPress |
|---|---|
| `release-published`, `install-file-ready`, `contract-exact`, `coverage-ready`, `kit-approved`, `kit-hidden-fields-declared`, `demo-measures-clean`, `customize-ready`, `ds-ready`, `demo-baseline-recorded` | Green: nothing to fix |
| `write-doors-not-judged` | `not-judged`: the WordPress write step does not exist, so the plugin's write doors are not judged. Nothing to fix; counts as green (`exitCodeOf`), never as a pass |
| `contract-not-needed`, `coverage-not-needed`, `kit-not-needed` | Not on WordPress: WordPress is in the contract platforms and in `policy.json` `platforms` and `rolesPlatforms`. Seen on a WordPress release: stop W5 |
| `cowork-pin-doors-ready`, `cowork-pin-doors-unread`, `cowork-pin-missing-doors`, `cowork-release-needed` | Not on WordPress: the write doors check judges Joomla only and answers `write-doors-not-judged` here. Seen on a WordPress release: stop W5 |
| `coverage-waiting`, `kit-waiting`, `customize-waiting`, `ds-waiting`, `demo-baseline-waiting` | `blocked`: fix the piece named in `blockedBy` first |
| `customize-checking`, `ds-checking` | `checking`: read the verdict again |
| `release-draft` | The first publication of a WordPress port is the vendored skill's last phase and its own person's decision (`release.mjs` prints the publish commands and runs none): stop, report who must publish |
| `no-install-file`, `install-file-invalid`, `no-template`, `template-not-an-id`, `asset-missing`, `install-file-sha-mismatch` | The registry's `scripts/tracy-setting.mjs` command, which reads `wordpress` from a `/wp7` tag; `--template` is the product slug (`ja-diner`), as the published file holds it. Upload the printed `gh release upload` line |
| `no-contract`, `sibling-no-contract`, `contract-lower` | Capture with the registry's `batch-contracts.mjs capture --platform wordpress` (it runs `capture-contract.mjs`); a new contract version: procedure W1 |
| `pin-behind-contract` | Pin the newer version: procedure W3 |
| `coverage-not-measured`, `coverage-invalid`, `coverage-stale` | Measure (above) with `--write`; `content-coverage.json` is beside the contract and needs no plugin release |
| `coverage-holes`, `coverage-live-holes` | [`coverage-holes.md`](coverage-holes.md) (recipes H1, H2, H5, H7, H9, H10, H11 of section 6): read every hole (class `unknown` too) and put it in its door: `--page-titles` or `--posts`, a block name in the pattern and the demo content of the next cut, a theme release for business words in a pattern, an accept with its reason for interface, core, style guide and showcase words. Never `--all-text` (the plugin cannot bind position slots). Inline markup, a link in it, theme pictures, theme texts and template parts have doors (recipes H3, H9, H11, H1, H5); a `core/html` fact takes an identity token (H2). No door (navigation labels, terms): stop W5. A content map change: procedure W1 |
| `coverage-roles`, `coverage-live-roles` | Roles are placed by the capture (`capture-contract.mjs --previous-map <last map> --role-vocabulary 3`, rule tables `scripts/slot-roles/rule-tables.mjs wordpress`), the unplaced ones bound by the agent, then `scripts/slot-roles/check.mjs <contract folder>` exits 0. A content map change: W1 |
| `coverage-fit`, `coverage-live-fit` | Measure with `--fit` (WordPress slots found by block `metadata.name`), which writes Slot fit into `content-map.json`: procedure W1 |
| `coverage-labels`, `coverage-live-labels`, `coverage-judge`, `coverage-judge-warn` | [`coverage-holes.md`](coverage-holes.md) section 5 and recipes H1 to H6 of section 6: R5 cut-outs clear when the label judge says right, R9 follows the hole, the agent answers the judge request on the final capture and records it with `record-judge.mjs`; a content map change: procedure W1 |
| `kit-missing`, `kit-invalid`, `kit-stale`, `kit-map-mismatch`, `kit-front-page-group`, `kit-navigation-missing`, `kit-brand-colour-from-link` | Kit rebuild. Navigation groups come from the `wp_navigation` posts; the accent from the theme.json palette |
| `kit-gaps` | A gap in the theme: theme release (then procedure W1). A gap right by design: `gap-accepts.json` with its reason, one entry per gap id |
| `kit-incomplete` | Missing pictures: kit rebuild. `missingLooks`: `quickstart-contract` `references/image-looks.md`. Self-checks above 0 (`reason` names them): a failure the theme keeps on purpose goes to `reach-accepts.json` with its reason (quickstart tools README, *Make a kit for a new template* step 4); a missing slot (`slotCoverage`, `linksWithoutLabel`) is a capture fix, then procedure W1 |
| `kit-logo-unsettable`, `kit-brand-unreadable` | A logo spot no WordPress write path reaches (`apps/tracy-web/src/lib/template-kit/logo-write-path.js` reads the write step's own rule): fix the tool, test first, never the kit by hand; then kit rebuild |
| `kit-zip-missing` | `cli.mjs pack --out <kit dir>`, then attach `template-kit-<theme>-<version>.zip` to the release tag `quickstart/<slug>/wp7` in `JoomlArt-Products/joomlart-products` with `gh release upload`; no other asset is touched |
| `kit-setting-slot-missing` | The registry's `setting-slots` command, with `--db mysql://...` of the demo |
| `kit-demo-baseline-missing` | Only for a tag `demo-baseline-policy.json` opts in: as `demo-baseline-missing` |
| `kit-hidden-field-missing` | Read the theme's `patterns/`, `parts/` and `templates/` (not Joomla layouts) and run the five commands of the registry. `legal-layout --layout <template>` or `<theme>//<template>` names the block template a created legal page prints through and needs `--webroot <dir holding the theme>`; `--none` means the theme's default `page` template |
| `kit-not-approved`, `kit-approval-stale` | Not fixed in the loop: recorded at green ([`green.md`](green.md)) |
| `kit-tool-outdated` | The registry's `samples` command on a copy of the committed kit; commit it back |
| `content-map-missing-lists` | W2 (Stops above): a new version through W4, captured with `--posts`, then W1 and W3 |
| `demo-measure-missing`, `demo-measure-invalid`, `demo-measure-stale`, `demo-measure-incomplete` | `apps/tracy-web/scripts/demo-measures.mjs --contract <contract folder> --base <demo address>`: the pages come from the content map (parents from `inventory.json`), the version from `manifest.json`; commit `demo-measures.json` |
| `demo-main-heading`, `demo-empty-block`, `demo-overflow`, `demo-orphan-row`, `demo-blank-footer-column` | A layout fault of the untouched demo: theme release, or the demo content of the next cut (`tracy-wordpress-quickstart/content-edits/`), then procedure W1 |
| `customize-not-checked`, `customize-error`, `customize-unchecked`, `customize-live-unchecked` | The registry's `template-customization-question-readiness.mjs` command with the `/wp7` tag |
| `customize-must-fix`, `customize-live-failing`, `customize-worth-fixing` | Each failing rule: in the theme (theme release) or the contract (procedure W1). A rule that reads the pinned plugin (STAB-1, on the `cowork-pin` piece): claude-cowork release, procedure W1 |
| `ds-not-checked`, `ds-error`, `ds-not-at-probe`, `ds-not-measured` | The registry's `template-design-system-readiness.mjs` command; `tdsr` section 3 (`scripts/pass-wordpress.mjs` for WordPress) |
| `ds-must-fix`, `ds-live-failing`, `ds-worth-fixing` | `tdsr` sections 2 and 4: the theme in `packages/cms/tracy-wordpress-theme`, a theme release; read-only design data: stop W5 |
| `demo-baseline-missing`, `demo-baseline-invalid`, `demo-baseline-stale` | The registry's two commands: `site-check-baseline.mjs --base <demo address> --version <contract id> --pages-file <json of the kit's pages[].path>` (WordPress pages are asked as they are, no `/index.php`), then `cli.mjs baseline --from ... --contract <contract folder>`; commit `demo-baseline.json`. Measured last in a round that cuts a version |
