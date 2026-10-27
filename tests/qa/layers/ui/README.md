# QA layer `ui`

Screens, states, languages, viewports, themes and accessibility of the Tracy UI, measured on the
design bench (`@tracy/design` Storybook) and on the switch module. Run by a person on demand:

```bash
node tests/qa/layers/ui/run.mjs --target local --prove-red --contact-sheets --out <dir>
node tests/qa/layers/ui/run.mjs --area switches            # one area: screens | blocks | sheets | switches | legacy | outcomes
node tests/qa/layers/ui/run.mjs --scope all                # also the 224 building-block stories (pilot scope is the 98 real screens)
node tests/qa/layers/ui/run.mjs --case QA-UI-kit-ui-button.IconOnly-accessible-name
node tests/qa/layers/ui/generate.mjs [--check]             # regenerate / verify denominator.json, cases/families.json, oracles/ui/pins.json
node --test tests/qa/layers/ui/test/                       # selftests (pilot-contract needs QA_UI_PILOT_OUT)
```

Exit codes: `0` every requested case PASS, `1` any FAIL, `2` invalid usage or contract, `3` only ENV/PENDING left.

## What is measured

| Family (case id suffix) | Assertion | Oracle |
|---|---|---|
| `console-network-<vp>` | no console error, no uncaught exception, no failed request, story renders | W5 brief |
| `overflow-390` | no horizontal overflow at 390 px | W5 brief |
| `accessible-name` | every visible control has an accessible name (HTML-AAM subset) | DESIGN.md §5 |
| `tab-reach` | every enabled control is reached by Tab or belongs to a roving composite widget; no positive tabindex | DESIGN.md §5 |
| `focus-stroke` | focus shows exactly one visible 1 px stroke (outline, border or ring) whose colour differs from before; no halo, no thicker stroke, no second stroke; a width/style-only change, a resting stroke or an unreadable value is not a pass (unreadable = not measured) | DESIGN.md §5 (29/09 and 05/10/2026) |
| `dialog-recovery` | dialog named, Tab stays inside a modal, Escape closes, focus returns to the trigger | DESIGN.md §5 |
| `raw-keys` | no raw translation key (a text node equal to a key of a `strings.ts` dictionary), no `{placeholder}`, no `undefined` | i18n.md |
| `vocabulary` | none of the five banned phrases of vocabulary.md §4 | vocabulary.md |
| `<switch>-switch-binding` | the id the door lists as hidden rides on `<html data-tracy-hide>`; a locked switch keeps its default | ui-switches module contract |
| `<switch>-switch-door-down` | a failing `/api/ui` keeps the catalogue defaults | same |
| `<switch>-switch-tab-policy` | `tab-*` turns a tab off, `launch-*` delists it | same |
| `<switch>-switch-consumer` | the piece hides when the switch is off and shows when on, on a mounted consumer or a verified product screen; no such adapter exists yet, so the case is always PENDING (`PRODUCT_ADAPTER_MISSING`, with the static scan as a lead only) | CLAUDE.md §8 |
| `sheet-<lang>-<vp>-light` | contact sheet exists and is fresh; the look is judged by a person | plan §4 |

Every oracle is pinned by hash in `tests/qa/oracles/ui/pins.json`; a pinned file that changes makes
the cases that cite it PENDING (`ORACLE_DRIFT`).

## Verdict rules

- **PASS** needs the assertion green on a story that had something to judge **and** a RED proof for
  that very case.
- **FAIL** needs a violation measured by the harness and a valid RED proof of the assertion family.
- **ENV** a dependency probe failed (Chromium, Storybook, esbuild).
- **PENDING** everything else, with the reason: `NO_RED_PROOF` (measured green), `UNPROVEN_ASSERTION`,
  `VACUOUS`, `SCOPE`, `TEST_INVALID`, `ORACLE_DRIFT`, `MANUAL`, `target-policy`, `LEGACY_*`.

The default run measures every story and writes the measurement, but because only a handful of
variants carry a RED proof, most cases end `PENDING: NO_RED_PROOF`. That is the honest state, not a
failure of the run.

## RED proofs

`red.mjs` copies the bench, `@tracy/ui` and `@tracy/dsh-ask-form` into `<out>/scratch-bench`
(everything else is a symlink to the real package), applies a mutation to the copy, starts a second
Storybook on it and runs the same measurement + check on a story. The real tree is never written:
an edit is refused when the target is a symlink or resolves outside the scratch root. Mutants:
button loses aria-label and takes `tabindex=-1`; input gains `ring-3 ring-ring/50`; card forces
`min-width: 700px`; badge logs `console.error`; dialog swallows Escape; the ask-form dictionary loses a
key and says "Creator mode". Switch mutants bundle a scratch copy of `ui-switches/index.mjs` (attribute
never written; door failure hides everything; tab policy ignores switches). A RED proof is produced, positive/negative-controlled and published inside the run that uses it; no proof is read from an earlier run (an old log cannot be traced to the sources it measured, so no cache grants a PASS). Storybook always runs from a scratch copy of the bench under `--out/scratch-*` (baseline and mutants alike), with `CACHE_DIR` at `--out/<label>-cache`; the scratch root `node_modules` and each copied package's `node_modules` are farms of per-entry links without `.vite-temp`, `.vite` and `.cache` (those land under `--out`), `apps/*` are linked read-only so stories that import `apps/tracy-web` bundle, and `buildScratch` refuses a scratch whose write paths are links. Uncopied packages stay links to the real folders for reading; the whole-worktree snapshot around the real pilot is what proves nothing wrote through them. A story that fails to bundle (unresolved import, module load failure) is `PENDING: TEST_INVALID BUNDLE_FAILURE`, never a product FAIL — but only on proof from this run's Storybook origin: a `[vite]` console line from `/@vite/client`, or a 5xx module response from the bench origin that the failed dynamic import or render error names (`families.mjs` `benchFailureText`). A module from another origin (a CDN) failing, or a story's own `[vite]`-prefixed log, is a product signal. `startStorybook` accepts only a bench outside the repository.

## Where output goes

`QA_UI_ARTIFACT_ROOT` (default `<tmpdir>/qa-ui`) must be outside the repository; `--out`, generator `--scratch-out`, caches, screenshots and logs must be inside that root. Both are judged lexically and by the real path of the deepest existing ancestor before anything is created, and `run.mjs`/`generate.mjs` exit 2 on an in-repo, outside-root, traversal or symlink-aliased path. Chromium is launched with `TMPDIR` set to a short scratch this run owns (`/tmp/qa-s-*`, carrying an owner token; `fsafe.mjs` `createOwnedScratch`), because a long `--out` path overflows the unix-socket limit of Chromium's singleton socket; `browser.close()` and a failed launch remove it, and a scratch that cannot be removed is recorded as `scratchLeft` in `owned.json` and raised as `TEST_INVALID`: every PASS of that run becomes PENDING with a `TEST_INVALID:` reason (a measured FAIL keeps its verdict and evidence), so neither `run.mjs` nor the shared runner reports the run as passed (`engine.mjs` `invalidateOnCleanup`). The scratch is removed by first renaming it out of reach and then checking that the renamed entry is the very directory created (device and inode) still carrying its token, so a directory swapped in under the same name is put back, never removed. Downloads go to `--out/browser-downloads` (`browser.mjs` `launchBrowser`). `run.mjs --dry` builds the baseline scratch and applies every story mutant's edits with the real code, starts nothing and removes the scratch.

`test/observe-check.mjs` wraps one check command: before and after it stores `git status --porcelain` and an inventory (type, mtime, size, SHA-256, symlink target) of `tests/qa` (or the whole worktree with `--full-tree`), with the argv, exit and raw logs under `$QA_UI_ARTIFACT_ROOT/observe/<name>/<run-id>/` (one directory per run, never overwritten); a command that exits 0 but leaves a delta fails, and so does a failed `git status` or a file that changed while it was hashed. Measured scope: five of the six check records cover `tests/qa` only; only the pilot record uses `--full-tree`. The three earlier "Files changed while checks ran" stops are NOT attributed to any command (no snapshot of those runs exists); the `.vite-temp` link path is the only write path found in the older code, and it is closed. The lifecycle selftest compares the whole physical worktree (tracked, untracked, ignored, `node_modules`; only Git metadata excluded) around the generator and around the dry pilot; a later snapshot reuses a hash only when size, mtime, ctime and inode all match, so a same-size rewrite with a restored mtime is still caught.

## Product-screen outcomes

`outcomes.mjs` lists 72 product-screen outcomes, one observable outcome per row (area `outcomes`, ids `QA-UI-outcome-<key>`): what a
person must see on a screen of the running product for Add site › Customize your site, publish and own
domain, the sign-in pages (the checklist of issue #993), the waitlist and undo. Each names its
independent source and where the behaviour is measured meanwhile (a door scenario of the api layer, or a
product test). Every one is `PENDING: PRODUCT_ADAPTER_MISSING`: this layer has no adapter that opens a
product screen on a stand and measures it. They carry no item of the denominator and add nothing to
coverage; they keep the obligation named.

## What is NOT covered (open on purpose)

- Dark theme and the seven non-English languages: the bench has no locale switch (`preview.tsx` globals are
  theme and direction), and many stories hard-code English, so changing `lang` would only look translated.
  Those matrix cells stay open in `coverage.json`.
- Product screens: `product-routes.json` has no routes, so no sheet has a product image and none is
  `complete`. A product image counts only when the page stays on the route, the identity element carries the
  declared screen value, the consumer shows the declared locale-proof text, the light theme is in effect and
  the revision is stated; a sheet stays fresh only while the route hashes the same and the recorded image hashes match. Two PNGs of equal size are not enough.
  No product image is ever invented, and no human verdict is ever filled in.
- Role, switch and platform axes of each screen are not enumerated.
- The old audit findings (SSR/DSH/OPS) arrive through `tests/qa/inventory/legacy-map.json` (W1); until it
  exists a single `QA-UI-legacy-map-gap` case says so.
- Tab order is checked for reach and positive tabindex only, not for visual order. Focus is judged by the
  DESIGN one-stroke rule on the top border, the outline and box-shadow rings; other border sides and
  non-px or unsupported values are reported as not measured.
- Look, wording and layout quality are for a person: `manual-review.json` lists the checks, each `pending`.

## Switch consumers

A piece's visibility is a product fact. The `consumer` case would need the real consumer mounted in a scratch build or a verified product screen; neither exists, so the case is PENDING. A CSS rule drawn into a synthetic DOM, or a code reference found by the static scan, is a lead for a person and never a PASS.

Contact sheets: the product side comes from `tests/qa/oracles/ui/product-routes.json` on `QA_STAND_URL`; no entry (or an entry without `identity.selector`/`attribute`/`value`, `revisionHeader` and a `localeProof` for the language) means no verified route and the sheet stays incomplete.

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.ui`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/ui/generate.mjs`; the generator refuses to write a file the contract rejects.
`details` holds `itemDetails`, `matrix`, `counts`, `dimensions`, `cases` (count and sha256 of the derived manifests) and `legacyMap`; the layer reads them through `flatView()` in `cases.mjs`. A proposal story owes nothing: each tag a story would owe is N-A for one reason in `naReasons`. A locked switch has `permission` N-A, not required.

## Known limitations

Open hardening items that are NOT blockers under the finish line (product truth, safety, the runner completes). Each is a follow-up, not a hidden defect; none has a reproduction that yields a false PASS or a write outside the run's namespace. The stand boundary is enforced, not listed here: `engine.mjs:216` (`standOrigin`) accepts only a bare http loopback origin before `probeStand` (`engine.mjs:233`) fetches, `captureProduct` (`engine.mjs:820`) accepts only a single-slash route path on that origin and aborts any off-origin redirect or subrequest and any request that is not GET or HEAD, blocks service workers and refuses WebSockets (`test/lifecycle.test.mjs`, `stand safety`). Loopback is the only proof of ownership asked for: a different local service on a loopback port would still be read (GET or HEAD only).

- **Proof / red-proof provenance.** A RED proof is produced inside the run that uses it, but the proof log is read back by path with no signed lineage to the sources it measured: `red.mjs:372` (`proveStoryMutants`), `test/pilot-contract.test.mjs:61` (reads `redProof.log`). Link-farm sources outside the copied packages are not fingerprinted.
- **Raw stdout retention.** Storybook output is kept as a log file plus a 600-char tail in the error, not as complete retained evidence: `browser.mjs:171` (`logStream`), `browser.mjs:240` (`tail`), `red.mjs:442` (mutant report text).
- **Nested CLI / config validation.** Flags are checked for the supported forms only; nested values of `denominator.json`, `product-routes.json` and the CLI are not exhaustively validated: `run.mjs:20` (`parseArgs`), `engine.mjs:66` (`loadLayer`).
- **Ledger and artifact path policy beyond the safety boundary.** The ownership ledger is not tamper-resistant and artifact files are not protected against edits after the run: `browser.mjs:73` (ledger), `artifacts.mjs:173` (`writeAtomic`). The scratch root `node_modules` and uncopied packages are links to the real tree for reading (`red.mjs:214-278`); the whole-worktree snapshot around the pilot shows no write through them, but nothing prevents one structurally.
- **Report integrity.** `report.md`/`results.json`/`exit.json` counts agree (checked by `pilot-contract`), but the report is not signed or cross-checked against a second source: `engine.mjs:1208` (`counts`).
- **Observation tooling.** `test/observe-check.mjs` hashes tests/qa (or the whole tree with `--full-tree`) before and after one command; it is diagnostic, one directory per run (`test/observe-check.mjs:211`), and not part of the verdict. Attribution of the three historic runner stops is unknown.
- **Oracle to product source link.** `cases.mjs:13` (`oracleOf`) points each case at its requirement (`requirements.md`, a brief, DESIGN.md, CLAUDE.md, a pin in `pins.json`); the story or implementation file:line it was measured on lives in the item details of `tables.mjs:126` and `denominator.json`, not next to the oracle. The product implementation behind a bench story is the story's imports, which is not recorded per case. A case that needs a product screen with no recorded route is PENDING, never PASS.
- **Product measurement gaps (reported as PENDING, never PASS).** `product-routes.json` has no routes, so no product sheet or consumer case is measured; `engine.mjs:820` (`captureProduct`) accepts a route only with identity, revision header and `localeProof`, and `engine.mjs:1044` (`sheetIsFresh`) has no product caller until a route exists. The locale proof is a selector's text, not proof that the consumer is in that state. `switches.mjs` builds a synthetic DOM from a CSS rule: a lead for a person, not a PASS. `MailPages.stories.tsx` renders inside an iframe that the in-page collector (`assertions.mjs` `collectFacts`) does not enter: such stories are measured on the shell only.
- **Coverage gaps already public.** Dark theme and seven non-English languages are not measured (no locale switch in the bench); `legacy-map.json` is missing (`QA-UI-legacy-map-gap`); human review is never filled in.
