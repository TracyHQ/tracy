# Follow-up issues: audit gates deferred from the detector PR

The detector PR (#101) shipped the **detectors** (classes 1–12 of the two independent port audits), their fixtures, the two mechanism
fixes (form submission attribution by an explicit per-form marker; carousel control identity without touching page timers), the two
acceptance rules (no universal/wildcard content acceptance; a decision citation must name ONE existing decision that is about the
accepted key), and a read-only live reporter (`scripts/test/audit-live.mjs`). It bound nothing: the checkpoint, the Fast Gate, the group
verdict and the release read neither a port-audit receipt nor an interaction attestation.

**Status after branch `feat/audit-gates-bound`** (the PR of that branch implements §1 and the gate-relevant part of §2; §3 and §4 are
untouched and still to file):

| § | State |
|---|---|
| 1 | **Done** in `feat/audit-gates-bound` — see the section. |
| 2 | **Done** — interaction coverage is attested per source obligation and discovery case; see the section. |
| 3 | Open, not implemented. |
| 4 | **Done** — `scripts/audit-reconcile.mjs`; human-entered verdicts, independent DOM measurement and fail-closed ledger check. |

Each section is an issue text for the coordinator to file.

---

## 1. Bind the finish audit (`port-audit.json`) into the Fast Gate checkpoint, the group verdict and the release — DONE in `feat/audit-gates-bound`

**Problem.** `review/port-audit.mjs` reports CMS leftovers, copy that promises behaviour WordPress does not have, unclassified
source-feature substitutions and acceptance-file citation defects. A port can still pass the Fast Gate, the group verdict and the
release with all of those, because none of them reads the audit.

**Failure mechanism (seen in review of the first attempt).**
- The audit's report is only a file: a consumer that does not require it cannot be stopped by it.
- When a receipt was required, rehashing the files it names was not enough: the receipt supplied its own inventory paths, so a receipt
  produced for another dossier with the same file names, or one made with an external `--decisions`, stayed "clean" for a consumer
  that read the real dossier. The expected inputs must come from the consumer's own dossier, never from the receipt.
- Hashing a path read from JSON before checking its type lets a FIFO block the reader and an oversized file exhaust memory.
- Skipping the interaction hash when `interaction.json` is absent turns a missing file into a pass.

**Affected consumers.** `scripts/visual/fast-gate.mjs` (`assessFastGate`), `scripts/visual/group-verdict.mjs` (`groupVerdict`, CLI
`--port-audit`), `scripts/quickstart/release.mjs` (`tierProblems`/`checkpointProblems`), `scripts/visual/round.mjs`,
`scripts/review/port-audit.mjs` (`--out`).

**Reproduction cases to turn into tests.**
1. A clean visual run with no `port-audit.json`, with one that is not clean, with one for another site or missing a route, and with one
   written before an acceptance file, DECISIONS.md, the CMS allowlist or a behaviour review changed → each must refuse.
2. A receipt made for dossier A presented to a consumer reading dossier B with identically named files → refuse.
3. A receipt whose inventory paths are not the consumer's dossier files; a symlink, a FIFO, a directory or a file over the size bound
   as any bound input → refuse without blocking.
4. `interaction.json` absent next to the receipt → refuse.

**Acceptance criteria.** Every finish consumer names its own dossier, requires a current clean receipt and a complete inventory of the
dossier's acceptance files, recomputes each hash from the consumer's path, checks file type and size before reading, and refuses on
any mismatch. Existing `main` fixtures keep passing once they write a receipt through one shared helper.

**Done (branch `feat/audit-gates-bound`).** One helper, `scripts/lib/audit-receipt.mjs`, writes (`receiptOf`, `issueReceipt`) and checks
(`auditReceiptProblems`) the receipt. `port-audit.mjs --dossier <dir> (--interaction <run>/interaction.json,… | --theme-zip <zip>) --out`
reads the dossier's own files once and records their hashes; the Fast Gate verdict (`assessFastGate({audit})`, `--dossier`/`--run-root`),
the group verdict (`groupVerdict({audit})`, `--port-audit <dossier>`) and `release.mjs` (full: the four tiers' `interaction.json`; `--patch`:
the theme zip and the restore, `--run-root` now required in both modes) each name their own dossier, recompute every hash from their own
paths, check file type and size before reading, and refuse with `[audit-missing|invalid|not-clean|scope|stale|site|routes|inputs|input-missing|
input-unsafe|oversize|unsafe|unreadable|interaction|interaction-missing|theme]`. Every reproduction case above is a test
(`scripts/test/audit-gates.test.mjs`, `quickstart-release.test.mjs` §finish audit).
A `scope: patch` receipt is clean on SITE-FACING findings only (`cms-leftovers`, `behavior-copy`); the bookkeeping classes (`decisions`, `exceptions`) travel as `advisories` because a fix release accepts nothing through the acceptance files they guard (the split lives in `lib/audit-receipt.mjs`). Not covered, deliberately: `severity.json` and
`exceptions-open.json` are not bound inputs (the group verdict applies the citation rule to `severity.json` itself); `round.mjs` writes the
ledger and is not a finish consumer — the release reads the ledger's tiers and their records.

---

## 2. Interaction coverage attestation: bind the owed states to the record — PARTLY done in `feat/audit-gates-bound`

**Problem.** `interaction.json` records what the probe produced. A record that omits a source drawer parent, a source form, a width, a
theme or a route leaves nothing to detect, so an incomplete run looks clean to a consumer that only checks counts.

**Failure mechanism.** The record validates route and check names and one aggregate `examined` count; it does not say which source
states were owed. `owedStates` defaulted to `[]` and no consumer supplied it, so an empty `states` list was valid.

**Affected consumers.** `scripts/visual/interaction-report.mjs` (`validateInteractionRecord`), `scripts/visual/interaction-parity.mjs`
(drawer/form obligations), `scripts/visual/report.mjs`, and — once item 1 lands — the Fast Gate, the group verdict and the release.

**Reproduction cases.**
1. A record listing every check with `examined: 1` and no per-case coverage → must be refused.
2. A record for another site/source origin → refuse.
3. A source drawer parent or form that has no outcome in the record; a parent that errored on either side and was dropped instead of
   `notMeasured`; a discovery that was cut short (state cap, time budget) → refuse.
4. A narrowed tier list (one drawer width, no dark theme, a subset of header widths) → refuse.

**Acceptance criteria.** The record carries, per case (check × route × width × theme), whether it was measured; per source
parent/form, exactly one outcome (`ok` / `finding` / `notMeasured`); a discovery row per drawer/form case (complete + count) that must
equal the number of obligations; the origins and the tool's configured tiers. Every consumer supplies the owed routes, tiers and
origins from its own inputs; an empty list passes only with a complete discovery of zero.

**Done (branch `feat/audit-gates-bound`).** Record version `interaction-parity/6` carries `coverage` (one row per case — check × route × width ×
theme — with `measured`), `tiers`, `origins` and `chromePages`; `measureInteractions` writes a row for every case it walks, including one past the
time budget or on a side with no source (`measured:false`). `interactionAttestationProblems` (`interaction-report.mjs`, also behind
`validateInteractionRecord({owed})`) refuses: a record with no coverage (reproduction 1), another site/source origin (2), an owed case with no row,
a duplicate, an invented case or one not measured (3, the cut-short part), a narrowed tier list or check list (4). The finish audit and every
consumer of its receipt apply it, supplying the routes, site and source from their own run, so a "clean" audit cannot be produced by measuring nothing.

**Done (interaction-parity/7).** (a) The record lists stable source-derived drawer-parent and form obligation ids and exactly one `ok`, `finding` or
`notMeasured` outcome for each; missing, duplicate and orphan outcomes refuse. (b) Each drawer/form case has a `complete` discovery row whose count
must equal its obligations; a state-cap or time-budget cut is incomplete and cannot be claimed measured. (c) `report.mjs` reports coverage from
`interactionAttestationProblems`, so the record's claim cannot self-certify it. (d) An empty obligation list passes only with a complete discovery
of zero. Older record versions are refused with a remeasure message. The record shape is documented in
[`skills/tracy-wordpress-theme/references/visual-qa.md`](../../skills/tracy-wordpress-theme/references/visual-qa.md) §Interaction parity.

---

## 3. Acceptance scope beyond the two shipped rules

**Shipped now.** A universal `match` (`.*`, empty, `routes: ["*"]`) is refused for content acceptances; a citation must name exactly
ONE existing decision (namespaced ids looked up whole) whose text mentions the accepted key. `accept()` applies them once the run has
bound its decisions.

**Deferred problem.** Acceptances are still matched by regex over the serialised finding, and `accept()` runs unvalidated on a
contract whose decisions were never bound.

**Failure mechanisms.**
- `accept(contract, finding)` called directly (or by a consumer that forgot to bind) applies an exception with no citation or scope check.
- The cited key is validated against the decision text but not against the finding: the regex can match an unrelated serialised field
  (the page id, the axis).
- A style/contrast exception may omit `routes` (covers every page) and use an element-type selector (`a`, `div`) that covers every such
  element; selectors are matched by substring.
- A malformed exception field in a file is ignored when another list in the same file is valid.
- Menu pairs and the design contract's exceptions follow separate code paths.

**Reproduction cases.** Exceptions with `routes` omitted; selector `a`; `key` that appears only in the page id; a direct `accept()` on
an unbound contract; a file with one valid list and one non-list field.

**Acceptance criteria.** One resolved decision context is required for every `accept()` call (unbound → accepts nothing); the cited
key must be a value of a structured field of the finding; style and contrast exceptions name exact routes and a concrete selector
(compared exactly or as a whole selector part, never as a substring); every list-shaped field of an acceptance file is validated.

---

## 4. Independent live reconciliation of detector findings — DONE

**Problem.** `scripts/test/audit-live.mjs` prints raw detector results for the Essence and Impact pairs, but nothing says which findings
are real differences and which are detector false positives, or which finding corresponds to which item of the 1.0.2 re-audit.

**Failure mechanisms of the first attempt.**
- A finding was called REAL from its kind and the detector's own numbers; a phrase anywhere in `REPORT.md` was taken as the re-audit
  item without tying it to the finding's route, control, width or state.
- Findings were collapsed into cause groups (for example 2007 citation errors) instead of one row per occurrence.
- An unreadable re-audit could still complete the run; an unavailable class was ignored by `complete`.

**Required design.** A separate tool, with its own reference measurement (plain DOM reads, a frozen page clock, the dossier's JSON
rows read directly) that never reuses the detector's code or numbers. One ledger row per raw occurrence with a stable id (route pair,
width, theme, control/state, raw evidence). Verdicts: `REAL` (a re-audit item matched by kind, control, width and state, or a new
measurable difference), `FALSE POSITIVE` (the detector is wrong: fix it with a fixture), `UNRESOLVED` (could not be re-measured). The
run is incomplete while any false positive, unresolved row, unreadable re-audit, unavailable class or unmeasured state remains.

**Acceptance criteria.** Both live pairs reconcile to zero `FALSE POSITIVE` and zero `UNRESOLVED`; every row's basis names the
independent measurement; fixtures exist for each false positive found.


**Done.** `scripts/audit-reconcile.mjs measure --findings <audit-live.json> --out <ledger.json> [--site … --source …]` emits one row for every raw occurrence, keeps duplicate causes separate, derives stable occurrence ids from the route pair, width, theme, control/state and raw-evidence hash, and records a separate plain-DOM measurement with a frozen `Date` and `performance` clock. A row that cannot be measured records `remeasure: null` and why. The script imports no detector implementation or detector measurements. Verdicts stay empty after `measure`: **a person or reviewer enters `REAL`, `FALSE_POSITIVE` or `UNRESOLVED`; the tool does not classify findings**.

`check --ledger <ledger.json> [--reaudit <REPORT.md or json>]` exits 1 with each incomplete or inconsistent row listed: missing or invalid verdicts, any unresolved or false-positive finding (including a missing fixture citation; an existing fixture still leaves the item open until the detector is fixed), missing independent measurement basis, unavailable measurement, duplicate/inconsistent ids, and rows that do not match the detector occurrence inventory. A cited re-audit item must be selected by explicit id and match kind, control, width and state. A supplied but unreadable re-audit input refuses the ledger. Exit 0 means the person-entered ledger is complete; it does not mean a detector finding was automatically judged.

The live Essence and Impact pairs have **not** been run as part of this implementation.
