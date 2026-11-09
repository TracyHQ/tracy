# Stop codes, and the index of fault codes

## 1. Stop codes

The fix of every verdict code lives in one place, the fix registry
(`apps/tracy-web/src/lib/template-readiness/fixes.js`), and the verdict JSON carries it as `fix` under each piece that
is not `done`. This page lists only the codes whose fix needs a person or another repository's release: on one of them
the run stops (SKILL.md section 5) instead of running the registry's fix.

`QC` is the `quickstart-contract` skill.

Before a fix that needs a template release, check that the flow has no door for it (an accept with its reason, a hidden
kit field, the planner or write step hiding or retargeting): a template release is the last resort (SKILL.md section 2).

Where a fix lands decides the version: a fix in the template source or the pack is a **template release** (the next
quickstart version, `QC` section 7b step 3 and lesson 7c "the pack shape must match"); a fix in a Tracy tool is a
**tool fix** (test first, same PR); a fix in the contract, kit or pin is committed beside the contract.

| Piece | Code or case | Why it stops |
|---|---|---|
| contract | `coverage-holes` (and the other `coverage-*` codes) with a hole of class `unknown` | `QC` section 7b step 5: a person reads the evidence |
| cowork-pin | `cowork-release-needed` | No released plugin has `params.missing`: a claude-cowork release is needed. Name the doors |
| cowork-pin | `customize-*` on rule STAB-1, when no released plugin carries the release's contract | A claude-cowork release is needed (`QC` section 8 steps 2 to 4 are another repository's release) |

`kit-not-approved` and `kit-approval-stale` are not stops, but the loop skips them: the approval is recorded at green
([`green.md`](green.md)).

## 2. Fault code index

A code printed by a checker during the run, the section of [`faults.md`](faults.md) that holds its symptom, confirm
step, fix and layout check. Find the code here before trying a fix of your own.

| Code (where it prints) | Section |
|---|---|
| `layout-not-served` (`pages.failures` of `content-coverage.json`; `coverage-holes` `incomplete`) | F1 |
| `dead-link` (same) | F2 |
| `module-boxes-not-read`, `page-not-rendered` (same; a file before audit 1.8.0: `N pages did not render`) | F3 |
| `record-judge.mjs`: `not opened`, `"seen" must say`, `"seen" repeats the words given for` | F4 |
| `VERIFICATION.json` `problems`: `shows the CMS installer`, `links no menu page`; `stand.mjs`: `the Docker engine is at` | F5 |
| `reach.mjs` `unreached`; kit error `unreached-content` | F6 |
| `kit-hidden-field-missing` after a kit build or assemble | F7 |
| slot roles gate `group ... lacks ... offering.name`; `label-rule-R4` (`label-rules-check.mjs`); `labelRules.failing.R4` | F8 |
| design system readiness `BTN-1` | F9 |
| `coverage-holes` on writer, typography or archive pages | F10 |
| `no main heading` (demo measures warning), `demo-main-heading`, hole class `template`, `release-stray-table`, `phoneNotCallable`, kit list min on tag pages | F11 |
| `coverage-stale` | F12 |
| `kit-logo-unsettable`, `kit-brand-unreadable` | F13 |
| `language-policy` job red on a policy edit in the same PR | F14 |
| demo update `download failed: ... returned error: 504` on a `releases/download` URL | F15 |
| `!! contract profile <id>: not on disk`; `!! contract-fetch:` | F16 |
| `language-policy` finding `Vietnamese text in captured content` on a `template-kit.json` | F17 |
| `demo-baseline-missing` read as `warn` while /ops is green (template not in `demo-baseline-policy.json`) | F18 |
| /ops Design system step `Not checked`, an error, or an old version/`checkedAt` after a release or pin | F19 |
