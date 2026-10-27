# QA unit layer

Inventory read from the repository's own declarations: every `test:workers` area suite and the interop
suite (`scripts/check-tests.ts`), the run groups that this layer lists but does not execute (e2e,
dsh-passwords, three standalone EmDash themes: PENDING with the reason), and every
`tests/regression/cases/*.json` case (117 with a deterministic run, 66 without: PENDING, owner layer
recorded). Each case's `oracle` keeps the regression JSON / PR as history and adds `productSources`
(`file:line` of the product code the case's test files import or name) or a stated `productSourceGap`.

## Run

```
pnpm qa unit [--area X] [--prove-red] [--out DIR]   # same runner through the shared CLI
node tests/qa/layers/unit/run.mjs [--area <area>] [--target local] [--prove-red] [--out DIR]
node tests/qa/layers/unit/generate.mjs --check
```

Exit codes and output as in the static layer (`tests/qa/layers/static/README.md`). Commands run with a
`docker` shim first on `PATH` that refuses and records any container start (the layer owns no
container); a refused container, a missing `php`/`docker` for PHP tests, or a missing prerequisite is
ENV with the probe, not PASS. Area suites are judged by exit code and TAP counts and never reach PASS
(a pass says nothing about RED); a regression case reaches PASS only with a RED proof against its base
commit. Stand-only flows (`need:stand`, seats, models) stay PENDING: there is no stand in local mode.

Selftests: `node --test tests/qa/layers/unit/test/inventory.test.mjs tests/qa/layers/unit/test/runner.test.mjs`.
Acceptance: `node --test tests/qa/layers/unit/test/acceptance.test.mjs` (set `QA_NO_CACHE=1`). Product
FAILs are findings kept with their log, not acceptance failures.

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.unit`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/unit/generate.mjs`; the generator refuses to write a file the contract rejects.
`details.coverage` and `details.counts` carry the per-tag table and the file counts. A regression case without a deterministic `run` is a `regression-no-run` item whose `meta` names the layer that owns it (`ownerLayer`, read from `tests/qa/inventory/legacy-map.json`: regenerate the inventory first), its source and `flakyModel`.

## Known limitations

Open hardening items, not blockers: none can make a failing product behaviour PASS, reach outside the
run's scratch/output, or stop the runner completing.

- Oracle gaps: cases whose `oracle.productSourceGap` is set have no resolvable current product source
  (67 no-run regression cases, 5 groups not executed here, and 24 regression or suite cases whose test
  reads data, shell scripts or browser specs rather than importing, reading or running product code).
  They are never PASS from a case without a run. The mapping is produced by
  `tests/qa/layers/unit/lib/sources.mjs:951` (`productSourcesOf`): it reads the test files' syntax tree and
  accepts only literal relative imports and path values built from literals (`new URL(…, import.meta.url)`,
  `join`/`resolve`/`dirname`, templates, arrays and spreads, constants, including imported ones) that reach
  a read (`readFile*`, `createReadStream`, `open*` for reading) or a process call (`spawn*`, `exec*`,
  `fork`, `execa`), matched by the binding the callee comes from, not by its name. A process call counts a
  file only in a role that runs, loads or reads it: the script operand of an interpreter (`node`,
  `process.execPath`, `python`, `bash`…, after launchers such as `env`/`pnpm exec`), a `--import`/`-r`
  operand, every operand after `node --test`, a numbered operand an inline `bash -c` script sources or
  execs (`. "$1"`, `exec "$0"`), an operand of a reader (`grep`, `cat`, `git grep`…), or a path
  interpolated into the inline code element an interpreter runs (`node -e`, `bash -c`) where that code loads it; the same
  text handed to any other command is a gap. Relative operands are read against the child's own `cwd`
  option (a spread after it may override it; a callback is not options), a test file a child runs is scanned
  with that `cwd`, and a `cwd` that is not known leaves them unknown. A file only passed along (to `git`, `echo`,
  a script's own arguments, a tool's `--input`) is stated as not proven to run. Block-scoped constants are
  read through their scope (an array changed only by `push` keeps appended `--name=value` flags; any other in-place change makes
  it unknown), object
  literals and `a ?? b` on a missing property are followed, and a conditional spread forks the argv. A call to a test helper
  is followed into the helper's body with the caller's values bound to its parameters (rest and default
  parameters included; a helper passed on as a value is walked with unknown arguments); test and helper
  modules are scanned transitively, and a test file a helper runs is scanned in turn. Arguments are read
  against the command's `cwd`, a `.js` import reaches its `.ts` file only under tsx, and test trees,
  helpers, documentation and strings never read or run are not sources. A case's own description is never
  read. A read, `import()`, `require()` or process call with a computed path, command or argv, a name bound both
  by an import and locally, a missing or pattern argument, an unresolved import, a
  file that does not parse and a helper chain deeper than 24 calls are listed in
  `oracle.productSourcesUnresolved` at the place to fix (173 cases carry such entries), so a source list is
  never claimed complete when it may not be.
- Prerequisite/effect policy is not per command: a command runs after the target policy. The docker shim
  (`tests/qa/layers/unit/index.mjs:135` (`dockerFence`)) fences container starts. The child's `TMPDIR` is a
  short directory under `/tmp` (a unix socket path is limited to about 100 bytes, and the run output is
  longer), and `TRACY_TEST_ARTIFACT_DIR` points at `<out>/tmp/<case>`; both are removed after the run, in a
  `finally`. The `TMPDIR` scratch carries an owner token and is removed only while it still holds it; a scratch that cannot be removed makes the case `PENDING` (`TEST_INVALID`), never a PASS. Suites that write to the system temp dir
  (`capture-contract.test.mjs`) land in that short directory. Writers that ignore `TMPDIR` or use an
  absolute path are not isolated; the Joomla suite still declares `containers: false`.
- Oracle `productSources` are file-level (`oracle.productSourcesScope`): the files a case imports, reads or
  runs, at the declaration or the first code line, not the line that enforces one rule. The invariant text is
  the regression case's full `expect`; the executed assertion is the case command.
- ENV is inferred from output signatures plus PHP/Docker probes that are not stored per command:
  `tests/qa/layers/unit/index.mjs:66` (`probes`), `tests/qa/layers/unit/index.mjs:189` (`phpAbsent`),
  `tests/qa/layers/unit/index.mjs:199` (`ENV_SIGNATURES`).
- RED proof matches by test title; regression manifests with `tests: []` accept any previously green
  check of the control and the proof records the title, not a manifest assertion id:
  `tests/qa/layers/unit/lib/redproof.mjs:108` (`judgeRed`), `tests/qa/layers/unit/generate.mjs:196` (`build`).
- Red-proof provenance, raw stdout retention, and nested validation of CLI/config input are not
  hardened beyond reading a failure: `tests/qa/layers/unit/lib/redproof.mjs:198` (`proveRegressionRed`).
- TAP reader, acceptance cache, evidence integrity and tamper-evidence limits are shared with the static
  layer: `tests/qa/layers/static/lib/common.mjs:334` (`parseTap`), `tests/qa/fixtures/static/acceptance.mjs:80` (`treeSnapshot`),
  `tests/qa/fixtures/static/acceptance.mjs:113` (`cachedRun`), `tests/qa/fixtures/static/acceptance.mjs:193` (`checkCommon`).
