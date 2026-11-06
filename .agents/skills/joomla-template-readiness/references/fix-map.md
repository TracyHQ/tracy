# Fix map: verdict code to the procedure that fixes it

> **TODO (#432, in progress):** the fix registry will be the one place fix text lives, and the verdict will print the
> fix under each red piece. Until it lands, use the piece's own `params.fix` or `params.command` when the verdict JSON
> carries one (the new checks do), and this table for the Road to live codes. When #432 merges, delete this table and
> read the registry entry instead; keep only the rows that say STOP.

Every row points to a procedure; none is restated here. `QC` is the `quickstart-contract` skill, `KIT` the template kit
README (`packages/cms/tracy-quickstart-tools/README.md`, section "Make a kit for a new template").

Where the fix lands decides the version: a fix in the template source or the pack is a **template release** (the next
quickstart version, `QC` section 7b step 3 and lesson 7c "the pack shape must match"); a fix in a Tracy tool is a
**tool fix** (test first, same PR); a fix in the contract, kit or pin is committed beside the contract.

## quickstart-release

| Code | Fix |
|---|---|
| `release-draft`, `no-install-file`, `install-file-invalid`, `asset-missing` | Upload and check the pack files: `QC` section 8 step 5 (`references/ship-and-release.md`) |
| `no-template`, `template-not-an-id` | The pack's `tracy_setting.json` is wrong: rebuild the pack, `QC` section 5 |
| `pin-behind-contract` | `params.fix`: release the newer version if it is not out, then move both quickstart lists, `QC` section 8 step 6 |

## contract

| Code | Fix |
|---|---|
| `no-contract`, `sibling-no-contract`, `contract-lower` | `QC` section 2 (choose the path), then sections 3 to 7 |
| `coverage-not-measured`, `coverage-stale`, `coverage-invalid` | Measure again on a clean install of the pinned pack: `QC` section 7 step 7 |
| `coverage-holes`, `coverage-labels`, `coverage-roles`, `coverage-fit`, `coverage-judge` | `QC` section 7b, the fix loop by hole class (`capture` is a tool fix, `template` a template release, `unknown` STOP) |
| `content-map-missing-lists` | `params.fix`. The capture rule misses a kind for every template: tool fix in `capture-contract.py` (`QC` 7b step 2), then capture again |

## template-kit

| Code | Fix |
|---|---|
| `kit-missing`, `kit-stale`, `kit-map-mismatch`, `kit-invalid`, `kit-zip-missing` | Build the kit: `KIT` steps 1 to 5, through [`kit-rebuild.md`](kit-rebuild.md) |
| `kit-tool-outdated` | `params.fix`: the settle commands (`samples`, `slot-roles`, `relabel`, `setting-slots`) when they cover the gap, else a rebuild through [`kit-rebuild.md`](kit-rebuild.md) |
| `kit-incomplete` | `missingLooks` in params: `QC` section 7d. Any other count in `checks`: `KIT` steps 3 and 4 (template fix, or an explained accept with a reason) |
| `kit-gaps` | `KIT` step 4: a template gap is a template release, or `gap-accepts.json` per gap id with a reason |
| `kit-hidden-field-missing` | `KIT` steps 8 and 9, one command per field named in `params.fields` |
| `kit-logo-unsettable`, `kit-brand-unreadable`, `kit-brand-colour-from-link`, `kit-navigation-missing`, `kit-front-page-group` | The kit's site part: rebuild with `--db-command` and `--files-command --webroot` (`KIT` step 2). Still red with full reads: tool fix |
| `kit-not-approved`, `kit-approval-stale` | Not in the loop: the approval is recorded at green ([`green.md`](green.md)) |
| `demo-measure-missing`, `demo-measure-stale`, `demo-measure-invalid`, `demo-measure-incomplete` | Run `params.command` on a freshly restored, untouched site of the pinned version |
| `demo-main-heading`, `demo-empty-block`, `demo-overflow`, `demo-orphan-row`, `demo-blank-footer-column` | A template layout fault: template release, then measure again. A fault the eye sees is not there: tool fix in the measure (`apps/tracy-host`, `site-check`) |

## cowork-pin

| Code | Fix |
|---|---|
| `cowork-pin-missing-doors` | `node scripts/pin-joomla-cowork.mjs --tag joomla-v<params.fixVersion> --dry-run`, then without `--dry-run` (writes both quickstart lists); then `node apps/tracy-web/scripts/cowork-plugin-doors.mjs` |
| `cowork-pin-doors-unread` | `node apps/tracy-web/scripts/cowork-plugin-doors.mjs` reads the package; still unread: tool fix in `plugin-doors-of-package.js` |
| `cowork-release-needed` | **STOP**: no released plugin has `params.missing`. Name the doors |
| `customize-*` on this piece (rule STAB-1) | The pinned plugin lacks the release's contract: move the pin to a released plugin that carries it (`pin-joomla-cowork.mjs`). None carries it: **STOP**, a claude-cowork release is needed (`QC` section 8 steps 2 to 4 are another repository's release) |

## customize

| Code | Fix |
|---|---|
| `customize-not-checked`, `customize-unchecked`, `customize-error` | Read the verdict again (local mode runs the check); the same reason twice: tool fix, or STOP when the reason is a download the release does not allow |
| `customize-must-fix`, `customize-worth-fixing`, `customize-live-*` | Each rule in `params.mustFix`: rules and evidence in `apps/tracy-web/src/lib/template-customization-question-readiness/` (ADR 0029). Template side: template release; contract side: capture again (`QC` section 7) |

## design-system

| Code | Fix |
|---|---|
| any `ds-*` | The `tdsr` skill, sections 1 to 4, for the rule its params name. `tdsr` section 5 says when it is a Tracy tool fault |

## demo-baseline

> **TODO (#433, after develop is merged):** the demo baseline piece does not exist on this branch yet. When it lands,
> a missing or stale baseline is red with the two commands that measure and record it; run them on a freshly restored
> site of the pinned version, commit the file beside the contract, and add the codes here.
