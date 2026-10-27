---
description: Shortening "merge into develop → visible on cowork.tracy.site" using only changes in the repo — the state measured on 14/09/2026, a plan ranked by minutes saved, and what strictly requires the server.
sources:
  - .github/workflows/tracy-ci.yml
  - .github/workflows/build-dsh-image.yml
  - .github/workflows/build-app-images.yml
  - .github/workflows/changelog-check.yml
  - .github/workflows/pr-description-check.yml
  - .github/actions/deploy-host-dsh/action.yml
  - .github/actions/deploy-tracy-stack/action.yml
  - packages/fleet/tracy-fleet-operation/dsh/Dockerfile
  - packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh
  - .dockerignore
  - scripts/check-all.ts
  - scripts/build-dsh.mjs
  - apps/tracy-web/src/app.js
  - packages/cms/tracy-seeder/scripts/build.mjs
---

# Faster CI without SSH — a ranked plan

**Question:** using only changes that live in the repo (no SSH into the CI server, no GitHub org admin
rights), how do we shorten the stretch *"merge into `develop` → the change shows on
`cowork.tracy.site`"* the most?

**One-paragraph answer:** the machine is not slow, the machine is **crowded**. The same job takes
3–5 minutes when the machine is idle, and 12–23 minutes (×4) when three heavy jobs run in parallel on the same 8 cores. And the
`deploy-dev` job (1 minute) can only be picked up by **one** runner, and that runner is busy building images. So the thing
that saves the most is not caching but **starting fewer heavy jobs per merge run**: (1) skip
`build-dsh-image` for paths that *provably* do not enter the image (today 5/10 push runs
built the image for 22 minutes and restarted dsh for a change that is not in the image); (2) skip `Tracy CI` on
`develop` when *that exact file tree* has already passed in the PR (6/6 merge runs today qualify); (3) don't bootstrap
the whole of dsh just to build two SPAs and the seeder. Those three things bring a typical merge run from **32–36 minutes** down to
**about 4–9 minutes**, without touching runner labels and without touching deploy concurrency.

Every number below is measured from the GitHub Actions API on 14/09/2026 (10 `develop` push runs, 7 PRs),
or quoted from GitHub docs / files in the repo. Where something could not be measured, that is said plainly.

---

## 1. The measured state

### 1.1 Machine and runners

| Item | Value | Evidence |
|---|---|---|
| Number of runners | **3**: `tracy-build-01`, `tracy-build-02`, `tracy-build-03` | `runner_name` in `GET /repos/TracyHQ/tch/actions/runs/{id}/jobs` of the last 60 runs; `GET .../actions/runners` returns 404 because the token has no admin (docs: *"Authenticated users must have admin access to the repository to use this endpoint"* — [REST self-hosted runners](https://docs.github.com/en/rest/actions/self-hosted-runners)) |
| Labels | 01: `tracy-build` **+ `tracy-dev`**; 02/03: only `tracy-build` | **Every** `deploy-dev` job in the 60 runs landed on `tracy-build-01`; matches the table in `CLAUDE.md` §6 (01: 6 cpu / 12G, 02/03: 4 cpu / 6G, 8-core machine) |
| Persistent or ephemeral runners | **Persistent** — the same runner for the same `Machine name` across many jobs (`tracy-build-02` = `d3e58eabaec8` in 3 jobs at different times) | `Set up job` step log |
| Consequence of "persistent" | `_work/tch/tch`, the pnpm store, the Docker layer cache **survive across runs** — which is why `Install dependencies` takes only 23 s when idle (relink), and dsh's `Build the image` only 110 s (layer cache) | table §1.3 |
| Runner version | `2.337.0` | `Set up job` log — enough for `actions/cache@v5` (needs ≥ `2.327.1`) and `upload-artifact@v4` |
| `gh` on the runner | **not present** — only curl + jq | comment in `build-app-images.yml` (job `prod-runner-exists` died with `gh: command not found`) |
| What else runs on the same machine | the dev cluster `tracy` (postgres · tracy-web · tracy-host), `tracy-dsh`, the dev sites | `docs/references/may-dev.md` §table — so CI also competes for CPU with the very thing it just deployed; the PR #84 run at 16:15 took 13.4 minutes even though **no other CI job** was running alongside |
| Branch protection / ruleset | **none, and cannot be turned on**: `GET /repos/TracyHQ/tch/rulesets` → 403 *"Upgrade to GitHub Pro or make this repository public"*; org plan `free` | API measured 14/09 |
| `actions/cache` in use | **0** caches (`GET /actions/cache/usage` → `active_caches_count: 0`) | API measured 14/09 |

### 1.2 Workflow table

| Workflow | Trigger | Path filter | Concurrency | Job → label | timeout |
|---|---|---|---|---|---|
| `tracy-ci.yml` | ~~`push` [main, main-v3, develop]~~ (dropped 15/09) · `pull_request` (opened/synchronize/ready_for_review) · dispatch | none | `tracy-ci-<ref for PR / sha for push>`, cancel only for PR | `build check` → `tracy-build` | 45 |
| `build-dsh-image.yml` | `push` [main-v3, develop, ci/image-build] · dispatch | **`paths-ignore`**: workers/ docs/ tasks/ apps/ deploy/ scripts/ `*.md`, 5 other workflows, `actions/deploy-tracy-stack`, PR template | `build-dsh-image-<ref>`, **no** cancel | `build` → `tracy-build`; `deploy-dev` → **`tracy-dev`** (only when ref = develop); `deploy-prod` → `tracy-prod` | 90 / 20 |
| `build-app-images.yml` | `push` [main-v3, develop] · dispatch | **`paths`**: apps/tracy-web, apps/tracy-host, packages/web/tracy-harness, packages/web/tracy-design-page, fleet-operation/scripts, fleet-operation/web, deploy/compose*.yml, deploy-tracy-stack.sh, itself, `actions/deploy-tracy-stack` | `build-app-images-<ref>`, **no** cancel; `deploy-prod` has its own group `deploy-prod` cancel=true | `build` → `tracy-build`; `deploy-dev` → **`tracy-dev`**; `deploy-prod` → `tracy-prod` | 45 / 20 |
| `deploy-workers.yml` | `push` [main, develop] · dispatch | none (filters itself with `scripts/changed-services.mjs` on `github.event.before..sha`) | `deploy-workers-<ref>`, no cancel | `deploy` → `tracy-build` | 45 |
| `changelog-check.yml` | `push` + `pull_request` (including `edited`) on three branches | none | `changelog-<ref>`, cancel=true | `changelog` → `tracy-build` | 10 |
| `pr-description-check.yml` | `pull_request` (including `edited`) on three branches | none | `pr-description-<ref>`, cancel=true | `description` → `tracy-build` | 10 |

A merge into `develop` starts **4–5 runs** (Tracy CI · changelog · deploy-workers · dsh
image if it passes the filter · app images if it matches the filter), i.e. **4–5 jobs at once asking for 3 runners**, plus
1–2 deploy jobs that only 01 picks up. Opening/editing a PR starts 3 runs.

### 1.3 How long each step takes — idle machine vs crowded machine

"Idle" = runs 12:23–13:21 (1–2 jobs on the machine). "Crowded" = merge run #84 at 16:29, when
`Tracy CI` + `build-dsh-image` + `build-app-images` ran in parallel on the three runners.

| Job · step | Idle | Crowded | Factor |
|---|---|---|---|
| **Tracy CI** `build check` whole job | 331 s (5.5′) | 1 356 s (22.6′) | ×4.1 |
| · Build the vendored dsh (`pnpm dsh:build`) | 50 s | 281 s | ×5.6 |
| · Install dependencies | 23 s | 122 s | ×5.3 |
| · Build check (35 gates, **sequential**) | 237 s | 932 s | ×3.9 |
| · · gate `lint` (oxlint + 13× `tsc --noEmit` + biome) | 105 s | 398 s | |
| · · gate `tests` | 66 s | 241 s | |
| · · gate `bundles` | 24 s | 122 s | |
| · · gate `boot-graph` | 14 s | 45 s | |
| **build-dsh-image** `build` whole job | 230 s (3.8′) | 1 296 s (21.6′) | ×5.6 |
| · Stage the CMS seeder (= `rm -rf` + `dsh:build` + `pnpm install` + seeder) | 93 s | 355 s | |
| · Build the image (Docker, warm layer cache) | 110 s | 890 s | |
| · Push + inspect | 9 s | 19 s | |
| **build-dsh-image** `deploy-dev` | 61 s | 104 s | |
| **build-app-images** `build` whole job | 177 s (3.0′) | 752 s (12.5′) | ×4.2 |
| · Install (dsh from source, then root) | 87 s | 403 s | |
| · Build the two SPAs | 35 s | 151 s | |
| · Build tracy-web + tracy-host (Docker) | 20 s | 146 s | |
| **build-app-images** `deploy-dev` | 36 s | 78 s | |
| **deploy-workers** when no Worker changed | 12–30 s | 30 s | |
| **deploy-workers** when a Worker changed (`harness`) | 296 s (4.9′) | 431 s (7.2′) | |
| **changelog** / **description** | 12–40 s | 30–40 s | |

Reading the table: **no step is slow by its nature**. Every heavy step balloons ×4–×6 when three jobs
run together; total CPU-minutes barely change, it is just three jobs sharing one machine (CPU caps 6+4+4 = 14
on 8 cores, plus the dev cluster running).

### 1.4 The queue of merge runs #84 (16:29) and #85 (16:39) — measured with `created_at`/`started_at`

| Job | Created | Started | **Waited** | Ran | Runner | Why it waited |
|---|---|---|---|---|---|---|
| dsh `build` (#84) | 16:29:37 | 16:29:40 | 0 | 21.6′ | 01 | |
| Tracy CI (#84) | 16:29:37 | 16:30:12 | 0.6′ | 22.6′ | 02 | |
| app `build` (#84) | 16:29:37 | 16:29:40 | 0 | 12.5′ | 03 | |
| deploy-workers (#84) | 16:29:37 | 16:42:15 | **12.6′** | 0.5′ | 03 | all three runners busy |
| app `deploy-dev` (#84) | 16:42:13 | 17:00:45 | **18.5′** | 1.3′ | 01 | only 01 carries `tracy-dev`, 01 was building dsh until 16:51, then took PR #85, then **sat idle for 5.5′ with no explanation** (16:54:39→17:00:06 — no job from another repo in the org was running then; would need the runner log on the host to know) |
| dsh `deploy-dev` (#84) | 16:51:17 | 17:02:06 | **10.8′** | 1.7′ | 01 | same as above |
| Tracy CI PR #85 | 16:34:00 | 16:51:18 | **17.3′** | 3.4′ then cancelled by hand | 01 | the PR was merged at 16:39 yet the check still ran; `davidd-lgtm` cancelled it by hand at 16:54 |
| dsh `build` (#85) | **17:03:51** | 17:03:54 | 0 | 9.9′ | 01 | the run was created at 16:39:38 but the job was only **created** when group `build-dsh-image-refs/heads/develop` was released — i.e. after #84's `deploy-dev` finished at 17:03:50 → **24 minutes stuck behind an unnecessary image build** |
| dsh `deploy-dev` (#85) | 17:13:47 | 17:13:53 | 0 | 1.7′ | 01 | |

Result: #84's tracy-web change reached `cowork.tracy.site` at **t+32.5′**; #85's plugin reached
dsh at **t+36′**. When the machine was idle (12:29, same kind of change) it was **t+3.7′**.

### 1.5 Job pick-up order: the docs don't promise FIFO, and what was measured is *not* strictly FIFO

- The docs only say: *"If GitHub finds an online and idle runner that matches the job's `runs-on`
  labels and groups, the job is then assigned"*; with no match it will *"remain queued until a runner
  comes online"*; after 24 hours it fails ([Self-hosted runners reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)).
  Not a word about priority or order.
- The concurrency page says jobs are queued in *"first-in-first-out (FIFO) order according to the time each one
  started waiting"* **but** *"ordering is not guaranteed"* ([Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)).
- Measured 16:52:50: runner 02 idle, the queue held `changelog` (created 16:39:39) and `deploy-workers` (created
  16:42:46); it took `deploy-workers`. Conversely at 17:00:06 runner 01 took `changelog` (16:39:39) before
  `deploy-dev` (16:42:13) — proper FIFO. **Conclusion: close to FIFO, not something to rely on.** Every proposal of the kind
  "let small jobs jump ahead" has no mechanism; the only ways are **fewer jobs** or **less time per
  job**.
- **There is no job priority** for self-hosted runners in the GitHub Actions docs (searched; no
  `priority` key exists in the workflow syntax).

### 1.6 Crowding also produces false reds

2/10 `Tracy CI` runs on `develop` today went red at gate `tests`, both of them **time-sensitive** tests
running under crowding, not code bugs:

| Run | Red test | Sign |
|---|---|---|
| `f8a6a5f0` 13:21 (in parallel with dsh build + deploy-workers) | `packages/design/tracy-brand-engine/test/routes.test.mjs:443` *"POST extract deep: the quick card lands first…"* | the test polls with `deadline = Date.now() + JOB_DEADLINE_MS` (lines 468–481) |
| `aad60c66` 16:39 (in parallel with deploy-workers 7.2′ + Tracy CI PR) | `vendor/tracy/dsh-passwords/test/security-hardening.test.ts:266` (M-5c) | 6.9 s for one SQL test — not rerun to confirm, so recorded as *suspected* |

`CLAUDE.md` at the repo root: a red CI run is something that must be dealt with. Less crowding also means less of this kind of work.

---

## 2. GitHub mechanisms that can be used — checked against the docs

| Mechanism | What the docs say (quoted) | Used for |
|---|---|---|
| `paths-ignore` on `push` | Push to an existing branch: *"a two-dot diff compares the head and base SHAs directly"* (= `before..after`, for a merge commit that is `HEAD^1..HEAD`); *"You cannot use both the `paths` and `paths-ignore` filters for the same event"* ([Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)) | Proposal #1 |
| `concurrency` | *"At most one running job or workflow in a concurrency group at any time"*; default `queue: single` → a new pending job **replaces** the old pending one; `queue: max` allows up to 100 pending but is *"not allowed"* together with `cancel-in-progress: true` ([Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)) | Deploy groups unchanged (see §4); but explains why #85 waited 24′ |
| `actions/cache` | The cache lives **on GitHub's side**, 10 GB/repo, evicted after 7 days unused; **can only restore caches of the current branch, the default branch (`main`), or the PR's base** — *"cannot restore caches created for child branches or sibling branches"* ([Dependency caching reference](https://docs.github.com/en/actions/reference/dependency-caching-reference)); keys are immutable ([actions/cache README](https://github.com/actions/cache/blob/main/README.md)) | Caching the pnpm store: **not needed** (already warm on disk). Caching the dsh build: see #4 |
| Artifacts API | `GET /repos/{o}/{r}/actions/artifacts?name=` — *"only artifacts with this name will be returned"*, lists **across every run of the repo**, permission `actions: read` ([REST artifacts](https://docs.github.com/en/rest/actions/artifacts)); `retention-days` minimum 1 ([upload-artifact README](https://github.com/actions/upload-artifact/blob/main/README.md)) | A cross-branch "this tree already passed" marker — proposal #2 |
| Check-runs API | `GET /repos/{o}/{r}/commits/{ref}/check-runs`, filter `check_name`, `status`; permission Checks read ([REST check runs](https://docs.github.com/en/rest/checks/runs)) | A weaker variant of #2 (tied to the PR head SHA, not to the tested tree) |
| `pull_request: types: [closed]` + `merged == true` | *"To run a workflow when a pull request merges, use the `pull_request` `closed` event type along with a conditional that checks the `merged` value"* ([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)) | Proposal #6 |
| Cancelling runs with `GITHUB_TOKEN` | `permissions.actions: write` — *"permits an action to cancel a workflow run"*; declaring one permission sets the others to `none` ([Workflow syntax §permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)); endpoint `POST .../runs/{id}/cancel` | Proposal #6 |
| `workflow_run` | *"only trigger a workflow run if the workflow file exists on the default branch"* ([Events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)) — the repo's default branch is **`main`, currently frozen** | **Not usable** for chaining on `develop` |
| Merge queue / `merge_group` | *"Repository administrators can require a merge queue by enabling the branch protection setting"* ([Managing a merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)) — but branch protection/rulesets in this repo return 403 "Upgrade to GitHub Pro" | **Not usable** |
| `[skip ci]` | Skips **every** `push`/`pull_request` workflow for that commit; remaining checks stay Pending ([Skip workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)) | **Not proposed**: exactly the fail-open shape the repo rejects (CI must name what it does not run) |
| Runner labels | *"a self-hosted runner must have all four labels to be eligible"* ([Use self-hosted runners in a workflow](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow)) — there are no negative labels, you cannot choose "which runner must NOT pick it up" | Explains §5 |

---

> ⚠ **Changed 15/09/2026 (Lucas), after this document's measurement run:** `Tracy CI` runs **only on pull
> requests** (plus manual runs), no longer on pushes to `develop`/`main`; `build-dsh-image` only builds
> on pushes to `main`/`develop` — `ci/image-build` left the trigger, replaced by
> `gh workflow run build-dsh-image.yml --ref <branch> -f push=false -f deploy_to=no`. Consequence for table
> §3: proposal **#2** (let Tracy CI on `develop` stand down when the tree has already passed in the PR) **is no longer needed**
> — that run has been dropped entirely; **#4** runs with the manual command above instead of pushing to `ci/image-build`. The
> cost is written directly at the top of `tracy-ci.yml`: 10/14 merge runs into `develop` since 14/09 were direct
> pushes, and they are no longer scored by CI.

## 3. Proposals — ranked by minutes saved per merge run

The "saved" columns give two numbers: **when crowded** (like 16:29) / **when idle**. "Path to the customer" is
the part cut from the merge→live stretch; "runner-minutes" is load taken off the machine (what makes other jobs faster).

| # | Work | Cut from the path to the customer | Runner-minutes saved | Risk | Permission | Proof before merging |
|---|---|---|---|---|---|---|
| 1 | Extend `paths-ignore` of `build-dsh-image.yml` for paths that **provably** do not enter the image | **up to 24′** (case #85) and **drops entirely** 21.6′ + dsh restart for runs like #84 | 22–35′ / 4–5′ per matching run (today **5/10** runs) | Missing a real path → the host runs an old plugin, nothing goes red. Countered by: only adding paths that `.dockerignore` excludes or that `grep` proves are not `COPY`ed, and writing the proving command next to each line | push | No sandbox for a `push` filter; check with `git diff --name-only HEAD^1 HEAD` for today's 10 runs (table §3.1) |
| 2 | `Tracy CI` on `develop` **stands down by name** when the file tree (`git rev-parse HEAD^{tree}`) has already passed in the PR — the marker is an artifact named `tracy-ci-passed-<tree>` uploaded by the PR run | indirect: returns a runner + ~1/3 of the machine's CPU to the build/deploy jobs right at merge time | **22.6′ / 5.5′** per merge run through a PR (today **5/6** merge runs had a PR that had already passed) | The verdict on `develop` is no longer a separate run; a tree that differs by one byte (base drifted) runs in full by itself. With no branch protection, no one *needs* the push verdict except humans | push | The PR proposing it runs through the `pull_request` path itself (uploads the artifact); then a docs-only/no-op push to develop to see the skip step print the right PR run URL |
| 3 | `build-app-images`: **filtered** install for the two SPAs (`pnpm install --frozen-lockfile --filter @tracy/harness-web... --filter @tracy/design-page...`), **drop** `pnpm dsh:build` because neither package depends on `@deepseek-ai/*` | **~1.5′ idle / ~5′ crowded** on the app path itself | 1.5′ / 5′ | A filtered install on the shared checkout — harmless because every workflow starts with `rm -rf node_modules`; the real risk is `linkWorkspacePackages` + the lockfile requiring members to be present (they are, the submodule is still fetched). Keep the opening `rm -rf` | push + `workflow_dispatch` | `gh workflow run build-app-images.yml --ref <branch> -f push=false -f deploy_to=no` — builds without pushing, without deploying |
| 4 | `build-dsh-image` step *Stage the CMS seeder*: `@tracy/seeder` only depends on `linkedom` and reads files from `tracy-joomla-quickstart/contracts`, `fleet-operation/scripts/provision` (`packages/cms/tracy-seeder/scripts/build.mjs`:31–32) → filtered install, drop `dsh:build` | **~1.5′ idle / ~5′ crowded** on the dsh path | 1.5′ / 5′ | as #3 | push + dispatch on `ci/image-build` (file header: *"BUILDS WITHOUT DEPLOYING"*) | `git push origin HEAD:ci/image-build` then read the run |
| 5 | `Tracy CI`: **skip `pnpm dsh:build` when the submodule SHA has not changed** — after the build, write `vendor/tracy/deepseek-harness/.tracy-build-stamp` = `git ls-tree HEAD vendor/tracy/deepseek-harness` + `node -v`; on the next run, if the stamp matches and `apps/cli/lib/bin.js` exists, skip **with a line saying so plainly** | 0.8′ idle / 4.5′ crowded on Tracy CI (and other jobs if applied the same way) | 50 s / 281 s ×(number of bootstrap jobs) | `dsh:build` currently does 4 things: install in the submodule, `build:native-system`, `build:lib`, `build:web`; dropping it makes the root `pnpm install` the only link run — exactly the desired end state per the `scripts/build-dsh.mjs` header, but **no one has tried it yet**. The `_work` disk belongs to each runner so the marker is only warm per runner (3 copies) | push | The PR itself; add an assert step `node_modules/.bin/dsh --version` after install to catch a skewed tree |
| 6 | New workflow `cancel-superseded-pr-runs.yml`: `pull_request: [closed]` + `merged == true` → curl cancels every `pull_request` run still `queued`/`in_progress` for the PR head branch (`permissions: actions: write`; **not** using `gh`, the runner doesn't have it) | indirect | Today 1 case (#85): 17.3′ queued + 3.4′ running before being cancelled by hand | The cancel job needs a runner, and pick-up order does not promise FIFO → it may itself queue behind what it means to cancel. Conflicts with #2: cancelling a PR run about to pass loses the marker for skipping. Should be done **after** #2 and only cancel when PR tree ≠ merge tree | push | Open a PR then merge it quickly on a scratch branch |
| 7 | `deploy-workers` on `develop`: `harness` watches `packages/ui` + `packages/web/tracy-harness` (`scripts/services.mjs`:47) so every plugin UI edit costs 5–7′ building the bundle + deploying `dev-harness.tracy.ai` — an old-architecture surface that the root `CLAUDE.md` describes as *"still alive, no one touches it any more"*. If Lee/Brian confirm no one uses it any more: remove `develop` from `branches:` (keep `main`) | indirect | 5–7′ on ~2/10 runs today (`0f8354cf`, `aad60c66`); 0.3′ on the other runs | A product decision, not a technical one — **ask first**. Risk: the dev Worker drifts from develop while someone still tries `dev-cowork.tracy.ai` | push (after a decision) | — |
| 8 | Gate `lint`: 13 sequential `tsc --noEmit` runs (`package.json` `typecheck`) → `tsc -b` with project references, or run the read-only gates in parallel in `check-all.ts` | 1–1.5′ idle on Tracy CI | 1–1.5′ | Parallelising **increases** crowding when the machine is full; only worth it after #1–#2. Code work, needs tests | push | PR |
| — | Cache the pnpm store via `actions/cache` | **0** | 0 | The 2.5 GB store is already warm on the runner disk; install when idle is a 23 s relink. Downloading 2.5 GB from GitHub every run would be **slower** | — | Rejected by measurement |
| — | Cache the `dsh:build` output (80 MB, 7 913 files measured locally) via `actions/cache` keyed on the submodule SHA | equivalent to #5 but over the network | | A PR's cache cannot be read from `develop` (docs: sibling/child branch); a cache created on `develop` can be read by PRs. Worse than #5 (local disk) in every respect unless a runner has its `_work` wiped | — | Only consider if #5 breaks because of a skewed tree |

### 3.1 Proposal #1 — the path list and the proof for each line

`build-dsh-image.yml` sets its own rule: only add to `paths-ignore` what *"provably cannot enter the
image"*, proven with `grep '^COPY' dsh/Dockerfile`. This table keeps exactly that rule, split into three tiers
by certainty:

| Tier | Path | Proof | Runs today that could have been skipped |
|---|---|---|---|
| A — **excluded from the context by `.dockerignore`**, cannot enter the image even with a COPY | `packages/dev/**` · `packages/web/**` · `packages/desktop/**` | `.dockerignore` lines `packages/dev`, `packages/web`, `packages/desktop` (only `packages/web/*/dist` is re-opened, for `apps/tracy-web/Dockerfile`, and the dsh Dockerfile does not COPY them) | #84 `2dd6bf8f` (only `packages/dev` + apps/docs/scripts/tasks) → **saves 21.6′ + dsh restart + #85's 24′ of queueing** |
| B — **no file in the repo references it**, other than itself | `packages/cms/tracy-emdash-theme-business/**` | `grep -rl emdash-theme-business` outside docs/tasks/vendor only shows `pnpm-workspace.yaml` (the line that **excludes** it from the workspace) and the package itself; the Dockerfile has no `COPY packages/cms/`; `stage-cms-seeder.sh` only copies `packages/cms/tracy-seeder/dist` | `0a463ecb`, `36b042aa`, `6595004a`, `f8a6a5f0` — **4 runs**, each building the image for 3.8–13.7′ + restarting dsh for one `.mjs` file of the EmDash template |
| B | `packages/cms/tracy-wordpress-theme/**` · `packages/cms/tracy-joomla-template/**` · `packages/cms/tracy-cms-motion/**` · `packages/fleet/tracy-fleet-operation/web/**` | no Dockerfile/fleet script names them (grepped each name in `dsh/Dockerfile`, `fleet-operation/scripts`, `dsh/profile`, `tracy-seeder/scripts`, `apps/*/Dockerfile`); the two "looks" are released from `TracyHQ/claude-cowork` (Dockerfile comment *"THE TWO LOOKS ARE DELIBERATELY NOT HERE"*); `fleet-operation/web` goes into the **tracy-host image** (`apps/tracy-host/Dockerfile`:73) and is already in the `paths` of `build-app-images.yml` | 0 today |
| C — **does enter the image but only through another package's committed `lib/`** | `packages/core/**` · `packages/ui/tracy-ui/**` · `packages/locale/tracy-i18n/**` · `packages/site/tracy-site-build-core/**` | no COPY names them; the image only COPYs the plugins and does not install `@tracy/core` into the profile's `node_modules` → their code only reaches the image when a dependent plugin's `lib/` is rebuilt and committed (that path is **not** ignored). **Not yet proven** that no `lib/client.js` does `import '@tracy/core'` by name at runtime — `scripts/check-image-profile.ts` must be read first | 0 today |

**Recommendation:** add tiers A and B now; leave tier C until there is proof. **Do not** add
`packages/cms/**` as a whole: `tracy-seeder/scripts/build.mjs` reads `tracy-joomla-quickstart/contracts`
and `tracy-cms-sections`. **Do not** touch `.github/actions/deploy-host-dsh/**` or
`build-dsh-image.yml` itself (the deploy job uses them). **Do not** add `packages/fleet/tracy-fleet-operation/scripts/**`:
although the dsh image does not COPY it, this workflow's `deploy-dev` job is exactly what copies
`scripts/{lib,provision,tools,webroot}` to `/opt/tracy-fleet` (`deploy-host-dsh/action.yml`).

Note for whoever edits it: every added line must carry a one-sentence proof right in the YAML, following the existing
*"Extended 2026-09-14"* comment block format — that file is where the rule lives, not the documentation.

### 3.2 Proposal #2 — skip `Tracy CI` on `develop` when the tree has already passed: mechanism and why it is correct

**Why a cache can't do it:** the cache docs say a run on `develop` only reads caches of `develop`,
of `main`, or — for a PR — of the base. A cache created by a PR run lives on branch `refs/pull/N/merge`, which is
a child/sibling branch → `develop` **cannot** read it. Artifacts, though, can be listed across the whole repo by
`name`.

**Mechanism:**

1. In `tracy-ci.yml`, after `Build check`, add a step `if: success() && github.event_name == 'pull_request'`:
   `upload-artifact` a 1-byte file, `name: tracy-ci-passed-$(git rev-parse HEAD^{tree})`,
   `retention-days: 3`. This tree is the tree of the **temporary merge commit** that GitHub checks out for the PR (=
   merge(PR head, base *at that time*)).
2. In the `build check` job, the first step when `github.event_name == 'push'`: compute
   `TREE=$(git rev-parse HEAD^{tree})`, call
   `curl -H "Authorization: Bearer $GITHUB_TOKEN" ".../actions/artifacts?name=tracy-ci-passed-$TREE"`,
   filter `expired == false`. Found → print
   `::notice::Tracy CI stands down: tree <TREE> already passed in run <url>` **and** write it to
   `$GITHUB_STEP_SUMMARY`, then the following steps `if: steps.marker.outputs.hit != 'true'`. Not found
   → run in full as today.
3. `permissions` adds `actions: read` (declaring `contents: read` alone sets every other permission to
   `none`, per the docs).

**Why it is correct:** the comparison is by **file tree hash**, not by commit SHA or branch name. Equal trees
⇔ every input byte of the 35 gates is equal (the gates read nothing but the tree + submodule, and the
submodule pointer is an entry in the tree). Base drifting between when the PR is scored and when it is merged → different tree → runs
in full. Measured today: 6/6 merge commits have `merge-tree(HEAD^1, HEAD^2)` exactly equal to the real tree, and in all 6,
the PR run was created **after** the base's last push (= `HEAD^1`), i.e. the scored PR tree = the merge tree.
5/6 PR runs passed before merging (#85 was cancelled) → 5 Tracy CI runs of 5.5–22.6′ on `develop` were
repeats.

**Breaks none of the repo's rules:** CI *names* what it does not run (notice line + summary + URL of the
run that scored it), it does not stand down silently; `changelog` still runs on push (it scores `before..after`
of the push, not the tree); a direct push not through a PR has no marker → runs in full.

**Cost:** one artifact of a few hundred bytes per PR, expiring after 3 days. Actions storage for a free org is
500 MB — negligible, but **artifacts are an org-wide quota** just like run minutes; if the org has exceeded
storage the upload goes red (the org's storage state has not been measured — Lee needs to look at billing).

**Not yet verified:** `upload-artifact@v4` on this runner container (needs `tar`; network access to
`results-receiver.actions.githubusercontent.com`). The PR proposing it will itself be the test. <!-- vocabulary-allow: GitHub host name -->

### 3.3 What each proposal does NOT do — so as not to repeat recorded incidents

| Recorded incident | Where | Which proposal could touch it | How it is avoided |
|---|---|---|---|
| Deploy stuck because of a label no runner carries; `cancel-in-progress: false` holds the group for every later run (16 h, 20 h) | `build-app-images.yml` §deploy-prod comment; `may-dev.md` §12; `CLAUDE.md` §6 | No proposal changes the `concurrency` of the deploy job or the `runs-on` labels | Keep the `build-*-<ref>` groups unchanged with no cancel; #6 only cancels `pull_request` runs, never `push` runs |
| Bootstrapping on the shared checkout leaves a hybrid tree (`Cannot find package '@jridgewell/gen-mapping'`) | header of `build-dsh-image.yml`, `tracy-ci.yml`, `deploy-workers.yml` | #3, #4, #5 | Every job still starts with `rm -rf node_modules vendor/tracy/deepseek-harness/node_modules`; #5 only keeps `lib/`/`dist/` (outputs, not links) and asserts `dsh --version` |
| A `paths:` allowlist misses something → the host runs an old plugin, nothing goes red | header of `build-dsh-image.yml` | #1 | Only add to the **ignore** list, each line with proof; do not switch to `paths:` |
| A red `deploy-workers` run leaves that run's Worker orphaned forever | header of `deploy-workers.yml`; root `CLAUDE.md` *"if CI breaks, NO later run cleans up for it"* | #7 | #7 does not change the filtering; it only asks whether it should still run on `develop` |
| GitHub-hosted job dies in 3 s because of the org quota | header of `tracy-ci.yml` | #6 | The cancel job runs on `tracy-build`, not `ubuntu-latest` |
| `gh` is not on the runner | comment in `build-app-images.yml` | #2, #6 | Use `curl` + `jq` |
| CI standing down silently = fail-open | `scripts/check-all.ts` header; `CLAUDE.md` §6 | #2, #5 | Print a notice with name + URL, write the summary; `--skip` is not used |

---

## 4. Before / after for a typical merge run

Two runs from today; the "before" numbers are real measurements; the "after" numbers are inferred from the idle-machine measurements (§1.3) assuming
the remaining jobs do not crowd each other.

**A #84-style run** — edits `apps/tracy-web` + Storybook (`packages/dev`) + docs, PR already passed 13′ before merging:

| | Before (measured 16:29) | After #1 + #2 |
|---|---|---|
| Jobs started | Tracy CI 22.6′ · dsh build 21.6′ · app build 12.5′ · deploy-workers 0.5′ · changelog 0.5′ · 2 deploys | app build ~3′ · deploy-workers ~0.3′ · changelog ~0.3′ · Tracy CI **stands down by name** ~0.3′ · 1 deploy |
| Runner-minutes | ~61 | ~5 |
| dsh restart on dev | **yes**, pointless | no |
| tracy-web reaches `cowork.tracy.site` | **t+32.5′** | **~t+4′** (build 3′ + deploy 0.6′; 01 is free because it is not building dsh) |

**A #85-style run** — edits plugins (`packages/site`, `packages/locale`, `vendor/tracy/dsh-better-sidebar`), merged 10′ after the run above:

| | Before (measured 16:39) | After #1 + #2 (+ #4) |
|---|---|---|
| Waiting for group `build-dsh-image` | **24′** (held by #84's image build) | 0 (#84 does not build) |
| dsh build | 9.9′ (in parallel with deploy-workers 7.2′ + Tracy CI PR) | ~4′ (idle) → ~2.5′ with #4 |
| Tracy CI push | 18.7′, **false red** (`tests`) | stands down if the PR already passed; in #85 the PR was cancelled so it still runs ~5.5′ on another runner |
| deploy-dev | 1.7′ | ~1′ |
| plugin reaches dev dsh | **t+36′** | **~t+6–9′** (the upper end if `deploy-workers` still builds `harness` for 5′ in parallel; #7 brings it to ~t+5′) |

Three merge runs within 10 minutes (like 16:29 · 16:39 · and a new PR at 16:33) is a normal day in this repo
(10 `develop` pushes from 12:29 to 16:39). The value of #1–#2 lies in **each run using less machine**,
so the next run does not stand behind the previous one.

---

## 5. Not doable without the server (SSH to the CI server) or admin — and why

| Work | Why it needs the server / admin | Who |
|---|---|---|
| Let `deploy-dev` run on more runners (give `tracy-dev` to 02/03, or add a fourth runner just for deploys) | Labels and mounts (`/opt/tracy-fleet`, `/etc/tracy`, `/srv/tracy`, docker socket) are declared in the runner compose file on the host — *"that file only lives on the host, no repo keeps it"* (`CLAUDE.md` §6). And the repo rule: *"Only 01 carries `tracy-dev`, and that is an invariant"* — deploy jobs must run one after another, currently enforced by the label. A **fourth** runner carrying **only** `tracy-dev` (no `tracy-build`) would be the tidy solution: deploys never wait behind builds, and still run one after another. That proposal goes through Lee | Lee |
| Change the CPU/RAM caps of the three runners, or pin runners to cores separate from the dev cluster | the same compose file on the host | Lee |
| Explain the 5.5′ that runner 01 sat idle while 3 jobs were queued (16:54:39→17:00:06) | needs the runner container log + `gh api .../runners` (admin) | Lee |
| See runners `online/offline/busy` from CI or from a developer machine | the endpoint requires admin; `GITHUB_TOKEN` has no `administration` key (measured 403, recorded in `build-app-images.yml`) | repo admin |
| Merge queue, branch protection, required checks | rulesets return 403 *"Upgrade to GitHub Pro or make this repository public"*; org plan `free`, private repo | org owner (and money) |
| `workflow_run` to chain "CI passes, then build the image" | only runs when the workflow file is on the **default branch = `main`**, which is frozen and no one pushes to | repo owner (changing the default branch is a big decision) |
| A Docker layer cache shared by the three runners (BuildKit registry cache or `--cache-from` GHCR) | doable in YAML, but the layer cache is already warm on each runner's disk (110 s build when idle); what is slow is CPU, not cache — adding a 5 GB cache push/pull to GHCR is **more** work | not needed |
| Prioritise deploy jobs in the queue | GitHub Actions has no priority mechanism for self-hosted runners (docs, §1.5) | does not exist |
| Run small jobs on `ubuntu-latest` to dodge the queue | the org's minute quota has been exhausted since 06/09 (header of `tracy-ci.yml`), jobs die in 3 s | org owner (set a spending limit) |

---

## 6. Not yet measured / open questions

1. Is the org's Actions storage (artifacts for #2) still under 500 MB — Lee needs to read the billing.
2. Can `upload-artifact@v4` and `actions/cache` talk to GitHub from the runner container
   — the first PR for #2 is the test.
3. Are the two time-sensitive tests in §1.6 really red because of crowding — only a rerun on an idle machine will tell;
   if so, they need a deadline based on idle CPU or to run last.
4. Runner 01's 5.5′ gap (§1.4): if it repeats, it is a short-lived "silently offline runner"
   like the 09/09 case in `CLAUDE.md` §6 — needs the log on the host.
5. Tier C of §3.1 is waiting on reading `scripts/check-image-profile.ts`.
6. `docs/README.md` is generated by `pnpm docs:index`; this document is new so **run that command before
   pushing**, don't edit it by hand.
