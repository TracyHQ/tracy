# QA layer: `harness` (dsh + Tracy plugins, agent tools, the site fence)

Run by a person, on demand. Never CI, never nightly.

```
node tests/qa/layers/harness/run.mjs --target local --prove-red --out <dir>   # the pilot
node tests/qa/layers/harness/run.mjs --area fence                              # one family
node tests/qa/layers/harness/run.mjs --case QA-HARNESS-…                       # one case
node tests/qa/layers/harness/run.mjs --live-model                              # the nine live scenarios (needs credentials + QA_STAND_URL)
node tests/qa/layers/harness/generate.mjs [--check]                            # denominator, coverage, cases, oracles
node --test tests/qa/layers/harness/test/*.test.mjs                            # selftests
```

Exit: `0` every requested case PASS · `1` any FAIL · `2` invalid usage or contract · `3` only ENV / PENDING left
(never a product check passed). Output: `results.json`, `report.md`, `coverage-run.json`, `evidence/`,
`redproofs/`. `--jobs N` splits the cases over N worker processes (default: half the CPUs, at most 6).

## What it does

A **scripted fake model** (fixed seed, a finite list of tool calls / errors / stream breaks) is registered as the
LLM adapter of a **real Cordis context**: dsh's agent loop, session store, tool runtime, `fs` / `bash` tools,
sandbox policy, approval and permission-preset services, plus Tracy's `DockerSandbox` and
`DockerSubprocessRuntime` (the path fence, the workdir guard, the approval guard and the approval answer), and —
for the write paths — the shipped `@tracy/dsh-site-tabs` and `@tracy/dsh-site-tools` host bundles. A case drives a
session on a scratch site and judges **effects**: results the model reads, what the backends were asked to do,
canary hashes in site B and on the host, and the records the doors received.

Verdicts (plan §2). **PASS** needs a green assertion, a green positive control and the case's *own* RED proof —
the same assertion failing on a recorded mutation of product code (`mutations.mjs`) applied to a scratch copy,
with the mutant still booting. Green without a proof is **PENDING**. A missing prerequisite proven by a probe is
**ENV**. A violated expectation is **FAIL**. Import / boot / module-missing failures are never RED.

## Files

| file | role |
|---|---|
| `runtime.mjs` | the real composition, scripted model, canaries, door recorder, docker stand-in wiring |
| `fence.mjs` | every `FS_TOOL_ARGS` entry × input partition (traversal, symlink, sibling, host path, …) |
| `scenarios.mjs` | dispatcher edges, routing, approval, the four write paths × 3 CMS, cancel, failures |
| `staticchecks.mjs` | mode matrix vs presets/skill sets, profile rows, `tracy_site` surface catalogue |
| `catalogue.mjs`, `rules.mjs`, `generate.mjs` | denominator extraction, tag classification, manifests (generated, `--check`ed) |
| `assertions.mjs` | assertion id → scenario |
| `mutations.mjs` | the RED catalogue |
| `index.mjs`, `run.mjs`, `report.mjs` | runner, CLI, report |
| `live-model.mjs` | the nine live scenarios (probe + record shape only; driver unconnected) |
| `scratch-preload.mjs` | `--import` for legacy suites: `os.tmpdir()` → `$QA_HARNESS_ARTIFACT_ROOT/tmp` |
| `../../fixtures/harness/fake-docker.mjs` | the `docker` stand-in |
| `../../oracles/harness/oracles.json` | the independent statements cases cite; every quote is verified at generation |

## Seams — what a PASS here does NOT prove

- **docker**: a stand-in CLI records the `docker exec` argv (container, user, workdir). No container runs. The
  effect *inside* a site container is not observed.
- **tracy-web**: `/turn`, `/moment`, `/apply`, `/changed` are a local HTTP recorder. No Postgres, no Site
  changes table (`activity?version=2`), no CMS plugin behind them. Reading back an effect in the CMS needs a stand
  (`QA_STAND_URL`) and is not built: those obligations are reported, not claimed.
- **EmDash MCP** is a scripted exec answer. **pwsh / terminal_open** are recording fixtures behind the real hooks.
- Seat revocation by `dsh-passwords` needs the real gate; only the dsh-level mode change is exercised.
- The live-model driver is unconnected and unverified (no credentials were available).

## Reading the numbers

`generated/coverage.json` (expanded into the run's `--out` folder; `manifest.json` pins counts and sha256 of every
generated document, `node tests/qa/layers/harness/generate.mjs --expand <dir>` writes them anywhere) lists every item × required tag as `covered` (a case exists), `na` (reason + source) or `open`.
`covered` is *written*, not *passing*. No percentage is printed: open cells are real. `generated/denominator.json`
carries `unresolved` and `incomplete` when an extractor could not read or resolve a source.

## RED mutations

`fence-bypass:{file,shell}-tools`, `fence-deny-all:{file,shell}-tools`, `fence-entry-removed:all`,
`content-args-as-paths`, `workdir-guard-drop:all`, `fence-no-realpath`, `fence-prefix-compare`, `routing-mislabel`, `approval-hang`,
`approval-guard-drop`, `sandbox-mode-ignored`, `terminate-noop`, `activity-drop`, `turn-source-mislabel`,
`actor-drop`, `label-mislabel`, `changed-drop`, `turn-header-drop`, `record-failure-blocks`,
`surface-extra-action:<surface>`, `matrix-*-flip`, `profile-edit:<row>`. A mutant that survives, does not apply
or does not boot is written to `redproofs/<case>.attempts.json` and the case stays PENDING with that reason.
Cases whose behaviour belongs to dsh itself (schema validation, cancel, stream failure) have no Tracy code to
mutate: they stay PENDING as compatibility controls, and the report says so.

## Environment

`QA_HARNESS_ARTIFACT_ROOT` — where scratch runtimes live (default `<out>/scratch`, removed at the end).
`QA_HARNESS_JOBS` — worker count. `QA_HARNESS_RED_BUDGET_MS` — per-worker time after which the remaining RED
proofs are skipped and reported as PENDING (default 720000).

## Known limits

Recorded, not fixed in this layer:

- **Output ownership through symlinks.** `--out` is checked with `lstat`/realpath at the top level, but a symlink
  placed *inside* a folder this layer already owns (under the marker) is not re-inspected before a later run reuses it.
- **Incomplete registry.** The tool schemas come from the composition `createRuntime` builds (selective plugin set),
  not a booted native host graph. The gap is written as `unresolved` / `incomplete: true` in the denominator; a tool
  only an unbooted profile row registers is not extracted.
- **Live probe record.** The live-model driver is unconnected. `probeLive` checks the credentials and that
  `QA_STAND_URL` answers, but provider, model, attempts, latency and tokens are recorded as "not measured", not as values.
- **Mutation granularity.** `fence-entry-removed` mutants remove one `FS_TOOL_ARGS` entry at a time where the table
  allows; behaviours owned by dsh itself have no Tracy-side mutation and stay PENDING.
- **Target.** Only `--target local` runs; `dev` and `prod` are refused (no adapter reads them).

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.harness`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/harness/generate.mjs`; the generator refuses to write a file the contract rejects.
The file is committed since 07/10/2026 (before, it existed only under `<out>/generated/`); `manifest.json` pins its sha256 and `--check` also compares the committed bytes. `details` holds `sources`, `excluded` and `incomplete`. The layer adds the tag `audit-seam` to the master list. A reason that rests on the live tool registry cites the extractor (`catalogue.mjs`); the schema read is pinned by `meta.schemaSha256`.
