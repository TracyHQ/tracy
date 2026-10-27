# QA static layer

One case per gate of `scripts/check-all.ts` (read through the TypeScript AST, never typed) plus the
focus-halo rule that CLAUDE.md §8 states and no gate enforces (an open, PENDING case). Each case's
`oracle` holds the rule (`source`, `ref`, `invariant`) and `productSources`: where the product enforces
it today (`scripts/check-all.ts:<row>` and the gate script).

## Run

```
pnpm qa static [--area X] [--prove-red] [--out DIR]   # same runner through the shared CLI
node tests/qa/layers/static/run.mjs [--area <gate>] [--target local] [--prove-red] [--out DIR]
node tests/qa/layers/static/generate.mjs --check      # inventory is regenerated identically
```

Exit 0 all PASS, 1 any FAIL (a product finding, kept with its log), 2 invalid usage, 3 ENV/PENDING only.
Output goes to `QA_ARTIFACT_ROOT` (a fresh sub-directory per run): `results.json`, `report.md`, `logs/`.
`QA_NO_CACHE=1` makes the acceptance test judge the current source instead of reusing an earlier run.
The layer is local only: `--target dev|prod` is refused before anything is spawned.

A case is PASS only with a red proof (the gate goes red on a mutated copy of the tree, in a scratch
overlay of the run), FAIL when the gate is red on the real tree, ENV when a declared prerequisite is
absent (with the probe), PENDING for what was not measured (heavy gates, the halo rule).

Selftests: `node --test tests/qa/layers/static/test/inventory.test.mjs tests/qa/layers/static/test/runner.test.mjs`.
Acceptance (whole inventory once): `node --test tests/qa/layers/static/test/acceptance.test.mjs`; it prints
one evidence line per case (verdict, log path) and does not require the product to be green.

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.static`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/static/generate.mjs`; the generator refuses to write a file the contract rejects.
`details.coverage` says, per item and tag, `covered` (case ids), `na` (reason key) or `open`. A gate has `restart`, `stale-lock` and (unless it is a heavy gate) `rollback` N-A.

## Known limitations

Open hardening items. None can turn a product failure into PASS, touch anything outside the run's own
scratch/output, or stop the runner from completing; they are follow-ups.

- TAP is read only in the flat form; nested suites and extensions are unsupported, and SKIP/TODO and
  FAIL/CANCELLED are merged in one count: `tests/qa/layers/static/lib/common.mjs:334` (`parseTap`).
- Acceptance re-reads logs with a second count but through the same TAP notions, and checks evidence by
  existence/size, not digest or symlink policy: `tests/qa/fixtures/static/acceptance.mjs:193` (`checkCommon`),
  `tests/qa/fixtures/static/acceptance.mjs:251` (`checkObservedAgainstLog`).
- The acceptance cache keys on the Git tree plus a few environment values and the `dsh` binary; contents
  of ignored dependencies, `PATH` resolution and writer locking are not covered, and the snapshot file is
  not written atomically: `tests/qa/fixtures/static/acceptance.mjs:80` (`treeSnapshot`),
  `tests/qa/fixtures/static/acceptance.mjs:113` (`cachedRun`). Final runs use `QA_NO_CACHE=1`.
- A finished run is not tamper-evident: report/evidence are not hashed after the run
  (`tests/qa/fixtures/static/acceptance.mjs:95` (`completeRun`)).
- Target policy is by manifest declaration (`tests/qa/layers/static/lib/common.mjs:676` (`targetPolicy`)); there is no
  per-command effect closure beyond the layer's own overlay and the refusal of non-local targets.
- Red-proof bookkeeping (provenance of proof logs, raw stdout retention beyond what reading a failure
  needs, nested validation of the CLI/config input, ledger/artifact path policy beyond the run's own
  directory) is not hardened further: see `tests/qa/layers/static/lib/common.mjs:334` (`parseTap`).
- Oracle gaps (condition "oracle at current source"): the focus-halo rule has no gate, so its case states
  `productSourceGap` and names no `productSources`; `DESIGN.md` and `CLAUDE.md` state the rule but are not code
  that enforces it. A gate's `productSources` point at `scripts/check-all.ts` and at the first code line of the
  gate script (`tests/qa/layers/unit/lib/sources.mjs:119` (`firstCodeLine`)), not at the line that enforces one rule.
- The acceptance requires the three gates `plugin-identity`, `self-contained` and `interface-languages` to be
  PASS each with a valid RED proof (`tests/qa/fixtures/static/acceptance.mjs:343` (`requiredGateProblems`)). A
  product FAIL, a missing prerequisite (ENV) or PENDING on one of them keeps its finding and log and fails the
  acceptance; no other gate's PASS stands in for it.
