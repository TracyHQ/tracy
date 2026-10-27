# QA layer `api`

Fires hostile and boundary requests at every door of `apps/tracy-web` (booted in-process with `app.fetch`,
the way `apps/tracy-web/test/*.test.mjs` do) and judges the answers against an independent oracle: the
API snapshot pinned in `tests/qa/oracles/api/pin.json` plus the route reference text. Never the live
response of the tree under test.

## Commands

```
node tests/qa/layers/api/run.mjs --target local --prove-red --out DIR   # whole layer, with RED proof
node tests/qa/layers/api/run.mjs --area anonymous                        # an edge tag, public|internal-only, or a path segment
node tests/qa/layers/api/generate.mjs [--check]                          # regenerate (or byte-compare) denominator, plan, cases
node --test tests/qa/layers/api/test/selftest.test.mjs                   # the layer's own tests (no docker, no database)
node tests/qa/layers/api/test/acceptance.mjs --out DIR                   # full run + validity of the tooling
```

Exit of `run.mjs`: 0 all PASS · 1 any FAIL · 2 usage or contract error · 3 only ENV/PENDING.

## What is where

- `oracle.mjs`, `generate.mjs`, `plan.mjs` — extraction of every METHOD path (public 165, internal document 304, of which 139 internal-only: reported separately, never added) and the 21 edge tags per door: case, N-A with reason + source, or open.
- The door list is **not committed**. `pin.json` holds the source path, the commit, and the sha256 of the snapshot and of the route reference listing; `oracle.mjs` derives the doors at run time with `git show <sha>:<path>` and verifies the hash first. A missing commit or a mismatch is ENV with the probe output (generate.mjs exit 3), never PASS.
- **Expanded cases are not committed.** `cases.manifest.json` holds, per family (edge tag), the case count and the sha256 of its stable JSON. `index.mjs` expands the cases from the pinned oracle at run time and refuses to run when a count or hash differs; `run.mjs` writes the expansion to `<out>/cases/<family>.json` as evidence, and `generate.mjs --expand DIR` writes it for review. `generate.mjs --check` verifies the manifest and fails on a leftover `cases/` folder. `coverage.plan.json` / `denominator.json` store each reason once (`planfile.mjs`); case ids in the plan are read from the expansion.
- `harness.mjs`, `database.mjs`, `runner.mjs`, `exec.mjs`, `assertions.mjs` — an owned PostgreSQL container (no pull, free port, removed by id), seeded tenants and roles, fake host / mail / seat door, blocked outbound network, one pure judge per assertion id.
- `red.mjs` — RED proof: exact text mutations of product code in a scratch copy (`apps/tracy-web` depth, `packages` linked). A proof names the case, assertion, manifest, test, oracle, fixture and mutation hashes, and its log must show an applied, booted mutant and a RED line for that case.
- `scenarios.mjs` — the `scenario` family: 62 door scenarios, each one named outcome of a flow played through the real doors (sign-in by code, by each provider (Google and GitHub) and by device link, publish and own domain, the Add site questions and AI rewrite, the waitlist, the sign-in source). A scenario boots the product's own `buildApp` on the run's database with the mail captured, an injected clock, and the double it declares (a provider, `tracy-host`, a DNS resolver, a text model); it starts from its own restored state. Its mutants are `SCENARIO_MUTANTS` (`red.mjs` runs them with the tag mutants; a rule kept in two places takes `also` edits). A scenario that cannot be played here has `pending: '<reason>'` and no `run`. Scenarios never fill the door × tag plan: `coverage.plan.json` counts only the tag families. `--area scenario` selects them.
- `fixtures/api/requests.json` (hostile strings), `fixtures/api/legacy-repros.json` (legacy audit repros and why none is converted yet).

## Rules this layer keeps

- ENV only with a probe (docker, image, database). A 401, a 503 or a timeout of the product is never ENV.
- A positive control that answers 5xx (including the stubbed host's 503) is not admitted: the negative case stays PENDING.
- A paging value that is accepted proves nothing unless the snapshot declares the maximum.
- No RED proof, no PASS: such a case is PENDING.
- Coverage is never reported complete while `denominator.json` has `unresolved` entries (15 dynamic mounts today).

## Limits (not verified here)

`app.fetch` with fakes does not prove a browser, proxy/edge headers, a real host or CMS, or production data.
A door scenario's doubles stand where a dependency would be: a host double proves what the product sends and how it reads the host's job record, not `go-live.sh`, the ingress or TLS; a resolver double proves how a lookup answer is read, not DNS; a provider double proves the callback, not the provider's own screens. Add site doors are asked at the root, as the product's door tests do; the hop through the creation workspace (dsh) is not played.
Legacy audit: `tests/qa/inventory/legacy-map.json` (W1) was not available, so no case carries `legacyIds`.

## Denominator

`denominator.json` follows the schema every layer shares (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), rules and this
layer's kinds, `meta` and `details` keys in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.api`), field by field in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/api/generate.mjs`; the generator refuses to write a file the contract rejects.
A door's `meta.membership` is `public` or `internal-only`; counts, hashes of the pinned sources and the two tag groups are under `details`. Each N-A reason is written once in `naReasons` (`{id}` = the door) and cites the file the planner's wording names first. The size ceiling of a committed file is 300 KB (it was 200 KB before the denominator listed the required tags of each door).
