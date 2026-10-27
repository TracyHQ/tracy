# Tracy QA suite

A test suite that **a person runs on demand**. It is never part of CI and never scheduled.
Each layer (`static unit api infra ui flows harness cms mail related`) lives in
`tests/qa/layers/<layer>/` and is driven by one runner, `pnpm qa`.

## Commands

```bash
pnpm qa <layer> [--area X] [--target local|dev|prod] [--prove-red] [--out DIR] [--timeout-ms N]
pnpm qa all                       # every layer present; absent layers are listed as MISSING
pnpm qa affected --base <sha> --head <sha>
pnpm qa coverage [--layer X] [--runs DIR] [--require-complete] [--json]
# coverage finds completed full local runs under qa-results/ (any --out name) and, with --runs, under DIR
# (a run folder or a folder of run folders). N-A entries need a reason AND a source; a case outside the
# required tags that is not PASS also keeps the layer open.
node tests/qa/inventory/build.mjs [--check]   # what exists and who owns it; --check exits 1 on drift
node --test tests/qa/selftest/                # the runner, the contracts and the ten denominators
pnpm qa stand up|reuse|down --id <id> [-v] [--dry-run]
```

Exit codes: `0` everything requested passed · `1` at least one FAIL · `2` invalid usage or
contract (bad arguments, invalid manifest or result, unsafe path) · `3` not finished: only
ENV/PENDING remain, the run was cancelled, nothing was selected, or a layer is missing.

### Verdicts

| Verdict | Meaning |
|---|---|
| `PASS` | A deterministic assertion passed **and** the case carries a RED proof (the same assertion fails on broken code) whose log exists and is non-empty. |
| `FAIL` | The product violated an established expectation. |
| `ENV` | A probe proved a dependency is missing (no browser, no stand, no credentials). |
| `PENDING` | No oracle, no RED proof, not run, blocked by target policy, or waiting for a person. |

ENV and PENDING are never counted as PASS. A layer that reports `PASS` without a valid RED proof
is **downgraded to PENDING** by the runner (reason `PASS downgraded to PENDING: ...`).
The runner checks that the proof log exists, is non-empty and names an assertion of the case. It
does **not** read the log, so it cannot tell a meaningful RED from a bad one: that stays a review
question. Manifests are only as honest as their `effects` declarations; the runner does not sandbox layer code.

### Targets

Default target is `local`. A case runs only if its `targets` lists the target. On `prod` a case
runs only if `effects.writes` is empty and `mail`, `model` and `containers` are all `false`;
every other case is reported `PENDING: target-policy` and is never passed to the layer.

### Where results go

`qa-results/<UTC>-<layer>/` (gitignored; `--out DIR` picks another empty directory; `all` and
`affected` write `DIR/<layer>`):

- `results.json`: audit-kit result schema v2 (`environment.workflow_ref` is `manual:pnpm-qa`,
  `assurance_target` `T2`). `findings` is `[]`: an empty list never proves there is no defect.
- `cases.json`: every case with verdict, reason, assertion ids, evidence, RED proof, manifest hash.
- `report.md`, `provenance.json` (git SHA, dirty flag, Node version, target), and
  `complete.json`, written last. A directory without a usable `complete.json` is an unfinished run: when it is newer than the newest complete full local run of that layer (judged by its `.qa-reserved` record, else its `cases.json`, else its default name; a directory holding any run file whose layer cannot be told is assumed to be a candidate). A `--runs` path that is missing, a regular file or a symlink is reported open, not skipped, it keeps the layer open instead of letting the older run be credited.

### affected

Reads `tests/qa/inventory/affected-map.json` (owned by the inventory task):

```json
{ "schema_version": "1",
  "rules": [ { "id": "session", "paths": ["apps/tracy-web/src/lib/session.js", "packages/core/**"],
               "layers": ["api", "flows"], "reason": "why" } ] }
```

`**` matches any depth, `*` one segment. Every changed path (both sides of a rename) is matched.
A path no rule matches **widens the selection to all layers**; so does a missing map. An invalid
map or an unresolvable revision is an error (exit 2), never "no tests". `affected` prints each chosen layer with the paths that pulled it in, then runs those layers.

### coverage

Per layer, from `denominator.json`, the `cases/*.json` manifests and the latest **completed full
local run of the current tree content**. Printed separately, with no blended percentage:

items · unresolved · required obligations (item × edge tag) · N-A · implemented · executed ·
RED-proven · obligation verdicts PASS/FAIL/ENV/PENDING · manual required/captured/reviewed/rejected.

A run is credited only when its whole artifact set agrees (`complete.json`, `cases.json`, `results.json`,
`provenance.json` name one run, layer and tree; every case id appears once; every PASS carries RED-proof
metadata; tallies match; `report.md` exists and is non-empty; `results.json.artifacts` lists exactly the
fixed files plus every evidence file a case names, each present). A result for a case that changed, was
removed or was never in the manifests keeps the layer open. The run is bound to a **tree fingerprint**: a digest of every tracked or
untracked-but-not-ignored file's content, recorded at run time, so an uncommitted edit makes the run
stale while committing the same content does not. A result is also ignored when its case manifest changed
since the run.
Every layer's `denominator.json` follows one schema (`contracts/denominator.schema.json`, checked by
`lib/denominator.mjs`; field by field in [`layers/README.md`](layers/README.md)). A file that breaks it
(an old shape, an unknown field, a duplicate id, a tag both required and N-A, an N-A without a source)
is rejected whole: none of its items is counted and the layer stays open.
A layer's `denominator.json` must list at least one item, every item must require a tag or declare one N-A, and it must name in `revision` a commit (full SHA, or a hex
token of 7+ characters such as in `origin/develop fa4dc66a5`) that is an ancestor of HEAD. A content hash
(`sha256:…`, `tree:…`, 64 hex characters) or `null` is a valid revision that names no commit: coverage
reports `freshness cannot be proven` and keeps the layer open (eight layers today). It is stale when
any file under its `sourcePaths` (optional array of git pathspecs; default: the whole tree except
`tests/qa`) changed, was added or is dirty since that commit; committing the denominator itself does
not make it stale. A completed run must exist; otherwise the layer stays open. If git cannot give the
commit or the tree identity, nothing is credited.
Manual work a layer requires is declared in `denominator.json` as an optional `"manual": [ { "id" } ]`;
a missing or broken checklist leaves those ids required and uncaptured. Ids repeat-listed in a
checklist stay open; a second receipt for an id, even an identical one, leaves that id open.
An N-A reason in `denominator.json` has exactly one accepted form: `<reason>; source: <reference>` (the
`source:` prefix is optional). It is written once in `naReasons` and cited by key from `items[].na`. The
reason is prose of at least two words. The reference is a relative file path with an extension
(`docs/x.md`, optional `#anchor`), `ADR <number>` with an optional `§<n>`, an issue or PR number `#123`,
or an http(s) URL. Anything else (`--`, `/`, a bare path, a reason with no reference, a tag listed as
both required and N-A) makes the file invalid. A generator that has a reason and no source for it leaves
the tag required and lists the claim under `unresolved`.

Each PASS in `cases.json` carries receipts (proof log root, size, sha256; evidence sizes and hashes).
Coverage re-reads those files and credits nothing from a run whose proof or evidence was deleted,
emptied, changed or replaced by a non-regular file; the run is reported open and must be re-run. This
proves the files are intact, not that a log shows a genuine RED: that stays a review question. The
Docker adapter and stand code are exercised only against fakes and fake executables; no live Docker,
image or inter-service networking has been checked. `--require-complete` exits `3` if anything is open, including a FAIL obligation (missing layer or denominator, unresolved items, unimplemented, unexecuted,
unproven, stale, unreviewed manual checks), else `0`.

### Manual checks (looks and wording)

The machine never judges them. A layer that needs a person writes, in its run directory:

- `manual-checklist.json`: `{ "schema_version": "1", "items": [ { "id", "artifact": "<relative path>", "sha256" } ] }`
- the artifacts (screenshots, contact sheets).

The reviewer then writes `manual-review.json` next to it:

```json
{ "schema_version": "1", "reviewer": "name", "reviewed_at": "2026-10-05T10:00:00Z",
  "revision": "<git sha of the run>",
  "receipts": [ { "id": "<item id>", "status": "accepted", "artifact_sha256": "<sha256 of the artifact>" } ] }
```

Tick an item by adding a receipt (`accepted` or `rejected`). A receipt counts only if the artifact
still has that hash and `revision` equals the run's commit; otherwise the item stays unreviewed.

### Stand

`stand up --id <id>` brings up a private copy of the seven services as compose project
`tchqa-<id>` (the only project name these commands accept). It generates, under
`qa-results/stands/<id>/`, a compose override (container names, ports from 53100+, subnet) and a
fixture `stand.env` with random secrets; it never reads `deploy/.env` and never edits `deploy/`.
`qa-results/stands/<id>.json` lists every owned container, network and volume, written before they
are created. At most two stands exist at once (a lease serialises the check and reserves ports and the subnet; stopped stands still count). A per-stand lock is held through up, reuse and down and is never reclaimed from a live process, so a second command on the same stand is refused while one runs. `up` refuses an existing failed, stopped or interrupted stand, and any resource or fixture directory no manifest records: run `stand down --id <id> -v` first. After start it probes, inside the
containers, that web↔host, dsh→web, dsh→docker-proxy and web→postgres/minio reach each other.

`stand reuse` accepts a stand only if git SHA, compose config, fixture and image ids match the
manifest and no unrecorded resource carries the project label. Only the planned resource set (including `minio-init`) is ever recorded; a manifest listing anything else is refused, and the results root, `stands/` and the stand directory must not cross a symlink. `stand down --id <id> -v` deletes
only manifest resources that still carry the project label and the recorded identity, then lists anything of
`tchqa-<id>` that remains (exit 3 if so). Without `-v` volumes are kept. Resources a stand creates
outside its project (site containers made by tracy-host) are **not** covered; the layer that makes them must clean them up.
`--dry-run` prints the commands and writes nothing.

Not verified by the selftests: a live bring-up (images, Docker Desktop host networking, real
probes). The selftests run against a fake Docker adapter.

## Contracts and selftests

`contracts/` holds the pinned audit-kit schemas (see `contracts/SOURCE.md`) and the case/result
schemas. `node --test tests/qa/selftest/` proves the runner itself: exit codes 0/1/2/3, missing layers,
PASS downgrade, prod policy, affected widening, coverage rules, stand ownership, and the shared denominator
contract against the ten committed `denominator.json` files (`selftest/denominator.test.mjs`). It does not touch product code.

## Run directories and cancellation

An explicit `--out` is reserved exclusively (a `.qa-reserved` file) before the layer runs; symlinked
components in `--out` or the results root are refused. On timeout or Ctrl-C the layer receives an
aborted `signal` (also passed to `listCases`); the run is published only once the layer has stopped
(within 5 s). A layer that ignores the signal gets exit `2`, nothing is published, and `all` starts no
further layer. Layers must honour `signal`.

## Catch-up with develop (07/10/2026)

What `develop` gained since the suite was cut (publish and own domain #948/#988, the waitlist #972, the
mail footer #973, undo of a chat request #968/#970/#971, the sign-in source #936, Add site › Customize
your site #998, and the sign-in checklist of issue #993) is carried in three places, one per kind of
evidence:

- **Doors** — `layers/api/scenarios.mjs`: a door scenario plays one named outcome through the real
  doors of `apps/tracy-web` (its own `buildApp`, mail captured in memory, an injected clock, a provider /
  host / resolver double the scenario declares; never real DNS, never a real network) and is RED-proven
  by a mutant of product code. Run them alone with
  `node tests/qa/layers/api/run.mjs --target local --area scenario --prove-red --out DIR`.
- **Journeys** — `layers/flows/registry.mjs`: one case per outcome of each flow. On this branch they are
  PENDING by name: each says which door scenario plays its door half and what a stand would still need.
- **Screens** — `layers/ui/outcomes.mjs`: one row per outcome a person must see on a product screen.
  All PENDING (`PRODUCT_ADAPTER_MISSING`), each naming where the behaviour is measured meanwhile.
  The mail footer itself is judged in the mail layer (the `happy-links` case of every letter).

Derived numbers (`selftest/catchup.test.mjs` fails when this line and the tables disagree):

api door scenarios: 62 (57 played, 5 pending by name) · ui product-screen outcomes: 72 · flows cases: 144

Measured on this branch (`--area scenario --prove-red`, 07/10/2026): PASS 55 with a RED proof each,
FAIL 2, PENDING 5. The FAILs are real and known: `QA-API-scenario-signin-provider-cancelled` (Google) and
`QA-API-scenario-signin-github-cancelled` — a sign-in cancelled at the provider is told "took too long,
or started in another browser" (issue #993; its fix is not in this tree). No outcome of the catch-up is proven on a stand or in a browser.

## Known limits

- Bounded input reads: `maxBytes` must be a finite non-negative integer; a file swapped for another between the `lstat` and the open is caught by `dev`/`ino`, but a swap between two later stats is not tracked (no handle-identity guarantee).
- Stand recovery order: teardown records `tearing-down` before the fixture is deleted, but there is no durable intermediate state for every step, and no fault injection at every boundary.
- Docker output validation: "no such volume" messages are matched by the supported forms only (kind and name are not cross-checked against every Docker version's wording), and blank lines inside list output are only rejected, not diagnosed.
- Coverage discovery: a run whose `--out` directory has an arbitrary name and lost its reservation before writing any artifact cannot be recognised as a run (there is no separate durable run index). A completed run without a valid `.qa-reserved` marker is never credited.
- Tampering is out of scope: this tooling guards against accidental inconsistency (interrupted run, stale result, missing case), not against someone who deliberately rewrites counts, report and receipt consistently by hand inside the artifact directory.
- `report.md` is bound by hash and tally line, not by judging its prose; RED proof logs are checked for presence, hash and assertion id, not for meaning.
- Not run against a live Docker engine, images or service networking.
