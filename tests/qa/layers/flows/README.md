# The `flows` layer — end-to-end user journeys

This layer checks the customer's flows (sign-in by code, invite/accept/decline/revoke, role change, building a site, publish, agent edits, Site changes/undo, backup/restore, comments, inbox, settings, deleting a site, two seats on two sites) on **a single local stand** for the whole QA suite: compose project `tchqa`. Only this layer builds the stand; the other layers (ui, infra) read `QA_STAND_URL` and run inside its lifecycle.

Never runs in CI, never runs nightly. A person runs it when needed.

## Running

```text
# Only the part that needs no stand (ENV/PENDING with reasons, exit 3)
node tests/qa/layers/flows/run.mjs --target local --out DIR

# Everything, with RED proof, inside the stand lifecycle (build → run → down -v → prove clean)
node tests/qa/layers/flows/stand.mjs check --project tchqa --deadline-ms 7200000 --out DIR \
  -- node tests/qa/layers/flows/run.mjs --target local --prove-red --out DIR/results
```

- `run.mjs`: `--area X` (one flow such as `team-invite`, or a kind `scripted|legacy|pilot|pending`), `--target local|dev|prod`, `--prove-red`, `--out DIR`. An unknown argument, area or target → exit 2 and nothing is done. Exit: 0 every case PASS · 1 some FAIL · 2 wrong usage/contract · 3 only ENV/PENDING.
- `--target dev|prod`: every case of this layer writes (accounts, seats, sites, containers), so it returns `PENDING: target-policy` before touching anything.
- `stand.mjs check` returns 0 when the lifecycle is clean and the child command ends with 0 **or 3** (3 = only ENV/PENDING, still stated in `lifecycle.json`); FAIL (1) and contract errors (2) pass through unchanged; an unclean teardown is always 1. A stand that **fails to build** (not a probed missing dependency) is also 1; only a missing dependency with evidence in the output (image/registry unreachable, missing tool) is ENV/3. When the stand cannot be built, the child command still runs with `QA_STAND_BOOTSTRAP` (error kind, detail, path of the original log) so every case still gets a result: ENV with a probe, or `PENDING: stand-bootstrap-<kind>` with the log. The original log of each command is at `DIR/stand/logs/NNN-*.log`.
- `stand.mjs up|down|proof --out DIR` runs one step at a time (development). `down` reads `DIR/stand/intent.json`; without a journal proving ownership it **deletes nothing**, and it refuses while the lease is held by another live process.

## Stand `tchqa` — what it guarantees

- Built from a **copy** of the current tree (`git archive HEAD` + the harness submodule) in `DIR/stand/src`; page/image builds run inside that copy and never write to the worktree. Only `deploy/compose.yml` + `compose.macos.yml` + one generated override (`DIR/stand/gen/`), always `-p tchqa`.
- Isolating override: `env_file`, `container_name` (`tchqa-dsh`, `tchqa-docker-proxy`), ports (5 free ports handed out by the OS, recorded in `stand.json`), subnet (an unused `172.31.x.0/24`), image tags (`tchqa/web|host|dsh:dev`), every writable mount (`DIR/stand/data/…`), `TRACY_SITE_NETWORK=tchqa_tracy`.
- Customer sites are compose projects in a **finite pool** (`pool.mjs`: `tchqa-w`, `tchqa-sw1`, …). The adapter maps e2e-dev's label suffixes into the pool and refuses suffixes outside it.
- Before any side effect: record the intent in `intent.json`; refuse if `tchqa*` resources already exist (it never adopts anyone's), if there are already two stands on the machine, or if the lease is held by another process.
- **Lease**: `$TMPDIR/tchqa-stand.lease.json` (pid, expiry, token). A dead process's lease is reclaimed only when Docker has no `tchqa` resources left.
- **Ownership**: the journal records the run token, the start time, container IDs after each step and the image tags built (only when the preflight proved they did not exist). Teardown deletes only resources whose ID was recorded, or that belong to `tchqa`/a registered site and that Docker reports as created after the start time; resources that existed before or appear in another project are **refused** (recorded in `problems`, the proof still lists them). `compose down -v` (both compose files) runs only when every resource under project `tchqa` belongs to this run; every delete command records its exit code, and a failure is a problem, never treated as clean. Limit: ownership by creation time cannot tell apart a foreign process creating resources in the same project while the run is alive (the lease only stops another `check` run). The Docker build cache is shared, so it is **not** pruned.
- **Deadline**: one overall deadline (`--deadline-ms`); the final part (at most 20 minutes or ¼) is reserved for teardown, and build/boot/the child command are bounded by the rest. A live PID's lease is never reclaimed.
- Teardown (always runs, including on error/SIGINT/SIGTERM): delete each registered site through the product door (`DELETE /api/sites/:key`) → `compose down -v --remove-orphans` for each owned project → remove leftovers by recorded label/ID → delete the copy's data → **prove** it with Docker queries (by label and by ID). A failed Docker query is recorded as a *gap*, never declared clean (`teardown-proof.json`, `lifecycle.json`).
- Local limits: egress fence off, no real ingress, no Cloudflare; mail goes to the console (no real mailbox). This stand does **not** prove publishing to a real domain or the network fence.

## `QA_STAND_*` variables for the other layers

`stand.mjs check`/`up` set these for the child command:

| Variable | Meaning |
|---|---|
| `QA_STAND_URL` | `http://localhost:<web port>` (sites: `http://<label>.localhost:<web port>`; Chrome resolves `*.localhost` itself, Node needs a loopback mapping — `stand-client.mjs: installLoopbackLookup`) |
| `QA_STAND_PROJECT` | `tchqa` |
| `QA_STAND_SITE_DOMAIN` | `localhost` |
| `QA_STAND_WEB_CONTAINER` / `_HOST_` / `_DB_` / `_DSH_CONTAINER` | `tchqa-tracy-web-1`, `tchqa-tracy-host-1`, `tchqa-postgres-1`, `tchqa-dsh` |
| `QA_STAND_INFO` | `DIR/stand/stand.json` (ports, subnet, commit) |
| `QA_STAND_CREDENTIALS_FILE` | `DIR/stand/credentials.json`, **mode 0600**: secrets generated for this stand only (session, actor, pepper). Only a layer that must mint a cookie reads it; never written into a report. |
| `QA_STAND_COMMIT` | commit of the tree that was built |

Missing `QA_STAND_URL`, or a stand that does not answer `/login` → cases that need the stand are **ENV** with the probe result. Direct probes (the registry's `notCovered` is not read): Import needs `QA_FLOWS_IMPORT_SOURCE` (URL of the source site, probed with HEAD); a case missing model credentials reads `MODEL_API_KEY` in `DIR/stand/gen/.env`; a mail sink with no `[mail]` line → ENV, mail lines but no code for the right recipient → a product FAIL.

The coordinator runs ui/infra directly inside the stand lifecycle by wrapping that layer's command after the `--` of `stand.mjs check` (one stand, one lease, one teardown). After the child command finishes, `check` runs `down -v` itself.

## Oracle, verdict, RED

- **Independent oracles**: `CONTEXT.md §6`, ADR 0001/0014/0024/0025/0026, the pinned API snapshot (`apps/tracy-web/src/api-reference`). Before/after state is read separately: rows in PostgreSQL (`seat`, `site`, `account`), Docker labels, HTTP from outside — never the UI's "success" message.
- `PASS` needs: a green assertion + a positive control (each scenario has `must(...)`: a broken control → `PENDING: TEST_INVALID`, never FAIL) + a RED proof of that very case. No RED → `PENDING`.
- **RED = a recorded mutation** (`tests/qa/fixtures/flows/mutations.json`, 10 mutations: skip the code check, don't burn the code, skip the admin gate, skip the accept/decline/revoke state change, keep the old role, skip the seat check at the site door, don't delete the site row, don't call teardown). `--prove-red`: rebuild the web image from the copy with a substitution applied **exactly once**, swap it into the stand, rerun the **same scenario, same assertion, same fixture**, then swap back. RED counts only when the scenario reaches the assertion (the control holds) **and** every assertion the mutation names for that case turns red. A mutant that does not build/boot/apply → `PENDING`. Logs in `DIR/red/<mutation>.log` with the sha256 of the original product, mutant, mutation, test, oracle and fixture.
- Legacy (J0–J13 of `tests/e2e-dev`, unchanged): `adapter/legacy.mjs` runs their `run.mjs` through a module-loading hook (`NODE_OPTIONS=--import`), then reads `journeys/*.json`. Only three outward touches are patched, each with an exactly-once patch (ssh → local shell, non-Secure cookie, J11's Origin); a patch that does not match exactly once → branch `PENDING: TEST_INVALID`. Every patch is recorded in `provenance.json` with sha256 before/after.
  - `BLOCKED`/skip is never PASS (environment kind → ENV with a probe, the rest PENDING); J1 does not read a real code yet so it does not PASS; PASS after a retry or with a known-error note → PENDING; `--keep` does not prove deletion; J13 needs ssh to the dev machine so `PENDING: TEST_INVALID`.
  - A journey PASS is still `PENDING` because it has no recorded mutation yet: the layer never promotes it to PASS on its own.
- Still **PENDING by name**: Import (ENV: e2e-dev marks J2c `notCovered`, no source site), OAuth, brand/design inspiration, read-only assistant, build retry/resume, publish branches outside the pilot (the pilot needs a go-live/ingress stub that is not included, and REG-PR-948 is not in this tree), and every (item × tag) pair without a scenario — `coverage.json` records them as `open`.

## Denominator and coverage

`denominator.json` and `cases/*.json` are **generated from code**: `node tests/qa/layers/flows/generate.mjs` (check: `--check [--out DIR]`). Sources: the `JOURNEYS` table of `tests/e2e-dev/run.mjs`, the capability table of `CONTEXT.md §6`, the doors journeys call with string literals, and `registry.mjs`. The `JOURNEYS` table is read only when there is nothing but a literal declaration; **every** mention of `JOURNEYS` outside the declaration (passed into a call/constructor, assigned, returned, a callback, an export, even a plain read like `.some(...)`) goes into `unresolved` as "unanalysed use" — a conservative policy that follows no alias/data flow and can over-report (for example the same name in another scope). What could not be extracted is in `unresolved` (the UI action graph, doors built from variables); the denominator always records `complete: false` — it never prints "100%".

Coverage is reported separately: obligations (item × required tag) · N-A with reason+source · open · implemented · executed · RED-proven. Never blended into one percentage.

RED is checked again on promotion: the log must be a regular file under `--out`, with the recorded hash, contain the lines `GREEN <case>#<assertion>: ok` and `RED <case>#<assertion>` with the six hashes (product, mutant, mutation, test, oracle, fixture), record that the original source was restored byte for byte, and that the stand went back to the GREEN image. Any missing condition → PENDING with the reason.

## Latest measurement (this machine, the sandbox's Docker socket refused builds)

Denominator of 72 items (3 `unresolved` sources) and 144 cases in that run; an old snapshot, read with regexes. Since the JOURNEYS table and the door list are read from the syntax tree, the current denominator has 63 items and `unresolved` records each unreadable call/row with its file and line (see `denominator.json`). Old run: 144 cases (re-measured 07/10/2026 after adding six flows: `own-domain`, `waitlist`, `mail-footer`, `review-undo`, `signin-source`, `customize-site`, plus the sign-in outcomes from checklist #993; provider outcomes split into Google and GitHub; the 69 new cases are all named PENDING — each says which api-layer door scenario (`QA-API-scenario-…`) plays its half of the door and what the stand still lacks). No stand: PASS 0 · FAIL 0 · ENV 39 · PENDING 105, exit 3. Run with a stand: the dsh image build stopped at the Dockerfile's composed-tree check (a build error of this tree, not a missing dependency), so no live case ran; teardown was clean, and the Docker proof showed no container/volume/network left. **No case has PASSed and nothing is RED-proven on a real stand yet** — that is a known gap, not a result.

## Report for readers

`DIR/report.md` (counts PASS/FAIL/ENV/PENDING, then each non-PASS case with its reason), `results.json`, `coverage.json`, `provenance.json`, `checklist.json` (screenshots for a person to tick — the machine does not judge UI or wording), `evidence/`, `red/`, `legacy/`.

## Selftest

```text
node --test --test-concurrency=1 tests/qa/layers/flows/test/*.test.mjs
```

Proves: a correct case PASSes (needs RED), an injected fault is caught (FAIL), a missing dependency gives ENV with a probe, a case without RED stays PENDING; broken legacy artifacts, symlink/FIFO/traversal, lease, unclean teardown, failed Docker queries, mid-run cancel, secret leaks.

## Driver sources

See `SOURCE.md` (original paths, sha256 of each file, what changed).

## Denominator

`denominator.json` follows the schema shared by all ten layers (`tracy-qa-denominator/v1`): structure in
[`../../contracts/denominator.schema.json`](../../contracts/denominator.schema.json), the rules and the list of
kinds / `meta` / `details` of this layer in [`../../lib/denominator.mjs`](../../lib/denominator.mjs)
(`LAYER_CONTRACT.flows`), each field explained in [`../README.md`](../README.md). Regenerate with
`node tests/qa/layers/flows/generate.mjs`; the generator refuses to write a file the contract does not accept.
`title`, `perCms`, `notCovered`, `flows`, `method`, `path`, `calledBy` live in `meta`;
`sourceHashes`, `extractionKind`, `complete`, `incompleteBecause` live in `details`. The N-A reasons of the
doors (flow-level tags belong to the flow that calls the door) are written once in `naReasons`, with source
`tests/qa/inventory/edge-tags.json` (the copy of the plan's §3).
