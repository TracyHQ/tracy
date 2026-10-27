# QA layer: `infra` — host and deployment lifecycle

Run by a person, on demand. Never CI, never nightly.

```bash
node tests/qa/layers/infra/run.mjs --target local --prove-red [--area host|teardown|go-live|provision|backup|cron|dockerfile|lifecycle|deploy|legacy] [--out DIR]
node tests/qa/layers/infra/generate-denominator.mjs --check      # denominator.json + cases/*.json reproduce from the code
node --test tests/qa/layers/infra/test/{core,extraction,assertions}.test.mjs   # selftests
node --test tests/qa/layers/infra/test/legacy.test.mjs                         # existing suites, through the adapter
```

Exit: `0` every requested case PASS · `1` any FAIL · `2` bad usage / contract · `3` only ENV/PENDING besides PASS.
`results.json` and `report.md` land in `--out` (default `qa-results/infra-<UTC>/`).

## What a verdict means

| Verdict | Rule here |
|---|---|
| PASS | the assertion holds on the product **and** the SAME assertion (same id) fails on a mutated scratch copy of the product (`red/<case>.log`); the oracle's anchors still exist |
| FAIL | the product violates a stated invariant; `--prove-red` also shows the same assertion passing on a copy with the fix applied (`red/<case>.fix.log`) |
| ENV | a prerequisite is proven missing by a probe, named in the reason (`QA_STAND_URL`, `TEST_DATABASE_URL`, docker, python3, non-root) |
| PENDING | no RED proof (no mutation, mutant not detected, mutant crashed, wrong assertion failed), no oracle, harness error, policy, or waiting for a Linux host / stand |

Without `--prove-red` a green case is PENDING ("RED proof not requested"): a PASS needs the proof.
Targets other than `local` are PENDING `target-policy` — none of these cases declares a read-only effect contract.

## Files

- `lib/cases-*.mjs` — the case table (host doors, teardown / go-live / backup-point scripts, cron on a fake clock, Dockerfiles, live/Linux/DB obligations, legacy wrappers). `cases/*.json` are generated from it.
- `lib/runner.mjs` — probes, GREEN, RED by mutation in `<out>/red/trees/` (removed afterwards), verdicts. `lib/harness.mjs` — scratch trees, mutation applier (exactly one match, else a harness error), contained evidence writes.
- `lib/host.mjs` — the real tracy-host Hono app in-process, fake `run`, job store in a scratch dir, signer taken from **tracy-web's client** (the other half of the channel).
- `lib/teardown-stand.mjs` + `tests/qa/fixtures/infra/fake-{docker-teardown,iptables}.sh` — a stateful fake host (networks, volumes, containers, egress rules). Real docker is never reached.
- `lib/extract.mjs` — denominator extraction (TypeScript AST, js-yaml, a Dockerfile reader). Anything not a plain literal goes to `unresolved`.
- `lib/legacy.mjs` — runs the existing suites with `--test-reporter=tap` and `docker` replaced by a shim that refuses (policy: no self-started containers). Their expectations are not bound to an oracle, so they are PENDING evidence: set `QA_INFRA_LEGACY=1` to run them inside `run.mjs`.
- `tests/qa/oracles/infra/oracles.json` — pinned oracles. `strength`: `spec` (an approved document), `intent` (the author's own header/comment — not independent of the code's author, flagged), `external` (public specification). A vanished anchor makes every case that cites it PENDING.

## Denominator and tag policy

`denominator.json` is generated (`--write`) and checked (`--check`, byte-identical). `revision` is a hash of the extracted sources, not a commit, so it does not change when unrelated commits land. `extraction` is `incomplete` while `unresolved` is non-empty; do not read coverage numbers as the whole infrastructure then.

- host routes and `POST /_host/site` kinds: common + infra/script + API/host tags;
- scripts, cron timers, Dockerfiles, compose services, npm scripts: common + infra/script tags;
- a Dockerfile COPY input carries the same common + infra/script tags as the other infra items.
A tag is N-A only with a reason and a source (`na` in the item); everything else without a case is `open`.

## Not proven here (named, not hidden)

- Linux kernel behaviour: iptables rules are checked as bookkeeping against a fake; whether they block packets needs a Linux host (`*-linux-fence-kernel` cases stay PENDING).
- Live lifecycle (provision → ready → live → draft → teardown, backup/restore bytes and rows): needs the flows stand (`QA_STAND_URL`); no stand is brought up by this layer.
- PostgreSQL semantics (advisory locks, reconcile concurrency, lease expiry in SQL): the cron cases use a fake pool and prove the schedule and lock handling only.
- `docker build`: the Dockerfile permission/missing-asset cases are static analysis of the Dockerfile text and `.dockerignore` (Docker semantics re-implemented, approximate for exotic patterns); no image is built.
- `deploy-tracy-stack.sh` same-tag / rollback has no harness of its own yet; the existing stub suites cover it (oracle unbound).
- Build contexts of the runner and theme Dockerfiles are assumed to be their own directories (the repo does not declare them).

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.infra`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/infra/generate-denominator.mjs --write`; the generator refuses to write a file the contract rejects.
`details` holds `extraction` (`complete` / `incomplete`), `tagPolicy` and the hashed `sources`; an item's own facts (`timer`, `dockerfile`, `profiles`, `referencedBy`, `label`, `number`) are under `meta`. Kind `migration` is one item per `.sql` file `migrate()` applies at boot (`apps/tracy-web/src/db/migrations/`, 80 files up to `073-llm-audit.sql`; the same reader as the inventory's `migrations` extractor): no case replays a migration yet, so every one of its tags is required and open. The ten `legacy-suite` items owe no tag and declare none N-A, so coverage reports them as owing nothing provable.
