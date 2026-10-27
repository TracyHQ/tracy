# Acceptance contract — `qa.contract.json`, `qa.mjs` and `distribution.mjs`

Read at the end of P1 (once the inventory exists) and before P7. Three questions a green crawl cannot
answer — *has everything been carried over, from the right source, and which build does this evidence belong to* — are answered by
a versioned contract file, a runner that reads it, and a package closed by an allowlist. The validator
(`tools/qa-contract.mjs`) is the **authority** on the schema; this file only says what each field is for.
When in doubt, run the validator, don't reread this section.

## Work loop

```
tools/qa-contract.mjs init <source-folder> qa.contract.json --config template.config.json   # P1: skeleton + source hashes
  … write pages / design.rules / interactions, delete `pending` …
tools/qa-contract.mjs qa.contract.json --source <source-folder>                              # exit 0 = valid, prints the case count
tools/qa.mjs --contract qa.contract.json --source <source> --site <origin> --out evidence/qa-<n> --browser --visual --source-site <origin serving the source>   # P7: measure
tools/distribution.mjs pack qa.contract.json <new-folder>                                   # P8: package
cd <package-folder> && node <checkout>/tools/qa.mjs … --artifact . --reviews <checkout>/evidence/reviews   # P8: roll-up, exit 0 = ready to hand over
```

The final roll-up run has **its cwd in the package folder itself**: `artifactHash` is computed from the cwd, while the checkout
keeps changing (one line in `tools/` is different bytes too) — standing in the package, the number speaks truly about what was
accepted. `--contract` and `--reviews` point to the checkout; the tool that runs is the checkout's copy (importing from
the template's `node_modules`).

`--out` must be a **new** folder — one run's evidence does not overwrite the previous one. When a receipt has been signed and
only a re-roll-up is needed, `--reuse <previous-run-folder>` replaces `--browser`: the runner takes back observations +
audit **only if** that run has the same `contractHash`/`artifactHash`/`origin`, otherwise the gate is `fail` — no
rerunning 25 minutes of browser for a signature, and no borrowing another build's measurements. Every tool reads
`template.config.json` (`qa.theme`, `audit`) from the template folder; run from there.

## Fields

| Field | What it is | The validator refuses when |
|---|---|---|
| `schemaVersion` · `id` · `revision` | Contract identity; `revision` goes up with every edit | not 1 · empty · not a positive number |
| `pending[]` | Decisions not yet settled (fonts, licence, dropped pages) | **non-empty** — a contract with open items is not measured |
| `locales[]` · `defaultLocale` | From `template.config.json` | duplicates · default not in the list · a locale with no page |
| `source.reference` · `source.files[]` | Every source file, `sha256`, `disposition` `converted` / `asset` / `excluded` (+`reason`) / `reference` (a frame, image, spec that a page cites in `source[]` without being converted from it) | missing file, hash drift (`--source`), a `converted` file no page takes, `excluded` without a reason |
| `source.kind` · `source.parity` | **What the source provides**, separate from what the output must meet: `kind` `html` / `canvas` / `url` / `frames` (default `html`); `parity` `two-sided` (renderable → `--source-site`) / `declared` (frames → the numbers in `design.rules` are the reference) / `none` (default `two-sided`) | unknown value; `frames` with `two-sided`; `frames` with no `reference` file; `design.parity` while `parity` ≠ `two-sided` |
| `variants[]` | Cells of the matrix: `width` × `height` × `theme` × `reducedMotion` | missing size, a theme with no observed value |
| `design.theme` | How the theme is **observed**: `selector` + `attribute` + `values{theme: value}`; `storageKey` to **seed** it | missing; `values` must have a key for every theme — a `null` value means "attribute absent" (Business: light has no `data-theme`) |
| `design.rules[]` | `selector` + `source` + `styles{variantId: {property: measured value}}`; `optional: true` for roles a page may lack (chip, h3) — a required rule that matches nothing is a finding | empty selector/source; missing `styles` for a variant that a page using the rule runs |
| `interactions{state}` | `trigger` · `panel` · `link` · `open` (`click`/`hover`); optional `fullWidth`, `inner` + `maxInnerWidth` | missing selector; `inner` without a positive integer `maxInnerWidth` |
| `pages[]` | Each route: `path`, `locale`, `status`, `identity` (a selector proving it is the right page), `source[]`, `variants[]`, `states[]` (must include `default`), `rules[]`, `content[]` | duplicate route, unknown locale, a state not declared in `interactions`, empty `content` |
| `pages[].content[]` | `id` · `selector` · `source` · `owner` (`field`/`setting`/`derived`/`static`) · `binding` (CMS path, or the reason it is static) · `attribute` (`text`/`href`/`src`/`alt`) · `expected` (string from the source) | any item missing; `source` not in the inventory |
| `design.coverage[]` | `{selector, properties[]}` — every **visible** element matching the selector must be measured by at least one rule on all `properties`; otherwise `unclassified-element` (plugs the "forgot a component" hole, see [visual-review-method.md](visual-review-method.md)) | empty selector/properties |
| `layouts[]` | `{id, view, representative, pages[], states[], family?}` — eyes look per layout (one representative page), the machine measures per page; `family` (optional, e.g. `list`/`detail`/`form`) forces Fast Gate to take one representative of that family | representative is not one of its pages, a page in two layouts, `family` not a string |
| `visual.stages[]` · `visual.shots[]` · `visual.renderInputs[]` | tiers in order (a partition of `variants`), which shots are captured for which lens (the generator derives them with `deriveShots` from `fast-gate.mjs` — no language names written), which files go into the page hash | a variant in two tiers or in none, a consumer that is not a lens |
| `visual.fastGate` | `{add: [{page\|layout, reason}], drop: [{layout, reason}]}` — overrides the Fast Gate case set (`tools/fast-gate.mjs`), each entry with a reason; a drop that loses required coverage → resolver exit 2 | id does not exist, missing `reason`, `fastGate` without `layouts` |
| `design.parity` | `{selectors{key: css \| {site, source}}, properties[], hexTolerance?, pxTolerance?, sourceTheme?}` — compares **two-sided** the same logical element on the source render (`--source-site` + `pages[].source[0]`) and on the site; drift beyond tolerance → `parity-mismatch` | (read by `visual-qa.mjs`) |
| `design.images` | `{scope, sourceSlot, placeholder}` — counts decoded images on the source (custom slots such as `image-slot[src]` included) and the site; fewer on the site → `image-missing`; a placeholder still visible → `image-placeholder` | (read by `visual-qa.mjs`) |
| `design.exceptions[]` | `{kind, match, reason, decision}` — a `visual-qa` finding matching `kind` + `match` is recorded as *accepted* **only when** it has a citable `decision`; does not remove coverage | (read by `visual-qa.mjs`) |
| `fonts.selectors[]` · `fonts.allowed{locale: [family]}` | Where the real font is read over CDP; `allowed` = font families approved for that locale (bundled **or** a settled system fallback) | optional; with `allowed`, every glyph rendered in a font outside the list is a finding |
| `reviews{gate}` | `mode` `required` / `not-applicable` (+`reason`) for each gate in `REVIEW_GATES` | missing gate; only `forms` may be `not-applicable`, and only when `capabilities` has no `forms` |
| `capabilities[]` | Declares the package's capabilities (`i18n`, `forms`, …) | — |
| `distribution.include[]` · `required[]` | Allowlist of relative paths; `required` are files that **must** be in the package (favicon, seed, media map). **Do not** put `qa.contract.json` in the package: `artifactHash` hashes only the bytes shipped, the contract is the acceptance criteria living in the repo — editing the contract must not turn a verified package into a different package | absolute path/`..`, include touching `data/`, `.env`, `*.token`, `node_modules` … |

`content[].expected` is the **source's** string (`allTextContents()` after collapsing whitespace must equal
it) — not copied from the running EmDash page, because then the test is always green. No need to list every string;
list **enough to know it is the right page, the right source, the right place to fix**: title, lede, main CTA (`href`),
logo (`src`), and everything that has been wrong once.

## `qa.mjs` — gates and states

| Gate | Who measures | Passes when |
|---|---|---|
| `contracts` | machine | validator 0 errors, source hashes match |
| `preflight` | machine | the current Node can load the template's `better-sqlite3` (right ABI) |
| `distribution` | machine | `--artifact <dir>` verifies **and** `artifactHash` equals the hash computed from the current source tree; no `--artifact` → `pending` |
| `browser` | machine (`--browser`) | the right case count = pages × variants × states, every case has a shot, 0 findings: status, final URL, `identity`, `<html lang>`, observed theme, no overflow, islands hydrate, **every visible `<img>` decodes with `naturalWidth > 0`**, has `alt`, local media on the viewing origin, favicon/background images/PDFs answer 200 and not HTML, `content` matches the source, `design.rules` match (px ± 0.1), fonts in `allowed`, panels: a real mouse can get in, `fullWidth` covers the viewport, `inner` ≤ `maxInnerWidth` and centred, real links, Escape closes and returns focus |
| `routing` | machine (`--browser`, calls `audit.mjs`) | the crawl drains its queue, 0 findings |
| `visual` | machine (`--visual [--source-site <source origin>] [--source-dir <frames>] [--visual-scans …] [--visual-fast-gate <run>]`, calls `visual-qa.mjs`) | **scope `full`** (read from `visual.json.scope.kind` — a relabelled `fast-gate`/`targeted-debug` run still fails), every tier `pass` in the same run, 0 findings (rule, coverage, parity, scanner, mega), 0 unclassified; `--visual-pages` (a subset) never passes — only for probing; not enabled → `pending`, no browser → `blocked` |
| `build` `security` `visual-review` `font-review` `viewing-contexts` `editability` `forms` `recovery` `clean-install` `independent` | people/agents, via a **receipt** | a current and valid receipt (below) |

States: `pass` · `fail` · `pending` (not measured yet) · `blocked` (cannot be measured: no browser,
ABI mismatch) · `not-applicable`. The report is `pass` only when every gate is `pass`/`not-applicable`; **`blocked`
and `pending` never roll up into pass** — exit 1. Each run writes `report.json` + `REPORT.md` +
`observations.json` (+ `browser/*.png`, `audit/`).

The `visual-review` receipt has no human signature: it names each tier's last run (`--visual-runs`) and `qa.mjs` checks five things from files ([qa-lenses.md](qa-lenses.md) §7) — the runs named must be `full` scope. A contract without `visual.stages` (old template) needs the receipt to come with `VISUAL.md` + `visual.json`.

**Shots and tiles.** Every shot with a consumer is cut into tiles ≤ `--tile-height` (1 200 px) under
`shots/<page>--<variant>[--source]/<n>.png`; `index.json.shots[].tiles` lists them; `qa-notes.mjs merge` counts
a shot as opened when every tile was opened. A note's Flag column takes `LEE` (blocking) or `SOURCE` (the source is wrong too,
still fixed, counted separately in `counts.sourceFlagged`).

**The scope of a `visual-qa.mjs` run** is recorded in `visual.json.scope.kind` and `index.json.scope`: `full` (every page) · `fast-gate` (`--scope fast-gate`, the case set of `tools/fast-gate.mjs`, with `scope.plan` and `FAST-GATE-PLAN.md`) · `targeted-debug` (`--pages`). `visual.json` also records `contractHash` and, on a full run, `fastGate` = the Fast Gate run named with `--fast-gate` (refused when the verdict is not pass, the contract changed, or a page hash drifted from the current tree). The Fast Gate verdict: `tools/fast-gate.mjs verdict <run>` → `FAST-GATE.json/.md` — conditions in qa-lenses.md §8.

## Receipt — `<reviews-dir>/<gate>.json`

```json
{ "gate": "clean-install", "status": "pass",
  "contractHash": "sha256:…", "artifactHash": "sha256:…", "origin": "http://127.0.0.1:52010",
  "reviewer": "<name/agent>", "method": "tools/clean-install.sh from the package folder → bootstrap → 4 pages", "runtime": "v24.11.1",
  "capturedAt": "2026-09-13T10:00:00Z", "cases": ["de-home/1440-light/default", "…"],
  "evidence": [{ "path": "clean-install/bootstrap.log", "sha256": "sha256:…" }] }
```

Written with `tools/qa-receipt.mjs <gate> --report <run>/report.json --out evidence/reviews --reviewer <who>
--method "<how it was checked>" --cases <id,…> --evidence <file,…> [--note "<accepted limitation>"]` — the tool copies
the evidence next to the receipt, hashes it, and copies the identity from the report; don't type the three hashes by hand. The three identity values come from
the `report.json` of the `qa.mjs` run and from the package's `distribution.json` —
one off means `stale or wrong`. Evidence is files **next to the receipt** (relative paths, no `..`),
hashed at write time; editing a file afterwards breaks the receipt. Change the source → a different package → every old receipt expires on its own:
that is intended, not a nuisance.

## Tools that produce evidence for review gates

| Gate | Tool | Evidence |
|---|---|---|
| `build` · `clean-install` | `distribution.mjs pack` → `cd <package> && tools/clean-install.sh <target> <port>` | install/build/bootstrap log + page statuses |
| `security` | curl the anonymous write routes, dev-bypass, search the package for tokens/db/env | status table |
| `editability` | `admin-session.mjs` → `admin-roundtrip.mjs` | the tool's JSON report |
| `forms` | the template's own script (example: Business `tools/forms-check.mjs`) | JSON report |
| `recovery` | `recovery-check.mjs` | JSON report |
| `font-review` | roll up `fonts` from `observations.json` per locale + eyes on the pages of each locale with its own script | JSON + notes |
| `visual-review` | a clean Fast Gate, then `tools/visual-qa.mjs --scope full --fast-gate <run> …` tier by tier; in each tier the lenses open **every** assigned shot, note → fix → close; `qa-receipt.mjs visual-review … --visual-runs <stage>=<run>,… --qa-agents … --coding-agents …`; `qa.mjs` checks five things — **nobody signs**. Process: [qa-lenses.md](qa-lenses.md); measuring method: [visual-review-method.md](visual-review-method.md) | each tier's last run (`index.json`, `visual.json`, `NOTES-*`, `notes/*`) |
| `viewing-contexts` | measure the same page on direct preview, private vanity/proxy, public (if any) | notes + shots |
| `independent` | another agent holding only the skill + package + the docs in the package (no `tasks/`, no git) rebuilds, edits through the admin, runs the audit, and **writes down where the docs fell short** | their report |

## Negative fixtures already kept by the machine

`tests/qa-contract.test.mjs` (F8) · `tests/distribution.test.mjs` (F9) · `tests/qa.test.mjs` (F10)
prove each gate **can fail** before trusting it to pass — mapped to the table in
[release-regressions.md](release-regressions.md) §4:

| Fixture | Test |
|---|---|
| Seed/favicon missing from the package | F9 `Required asset omitted` · `Include path missing` |
| Images counted in full but answering `200 text/html` | F10 `brokenImage` → `image decodes` |
| Preview image pointing to a private origin | F10 `foreignMedia` → `local media uses viewing origin` |
| Font missing glyphs → the OS substitutes | F10 `fontFallback` + `fonts.allowed` → `not in the allowed list` |
| Bootstrap broken while the server is still healthy | `clean-install` receipt — not automated yet, still a receipt |
| Truncated crawl / no browser | F10 `blocked`; audit `incomplete` |
| Theme unchanged while the shot is labelled dark | F10 `stuckTheme` |
| Panel not covering the viewport | F10 `narrowPanel` |
| Escape does not close | F10 `noEscape` |
| White surface/black text in dark, low contrast, bright border, double seam, jumping hover, megamenu gap, a component no rule measures, drift from the source, stuck theme, page not rendering | F12 `tests/visual.test.mjs` (`visual-qa`, `visual-scan`, `mega-hover`) |
| Receipt of another package / edited evidence / future time | F10 `assessReceipt` |
| Missing matrix cell, duplicate case, case without a shot | F10 `assessObservations` |
