---
name: pr-merge
description: Take a change into `main` and out to users — which gates must be green before opening a PR, the PR description template, the merge itself, and the release step that goes with it. Use when about to commit, about to open a PR, about to merge, or right after merging.
---

# Taking a change into `main`

> **Release path: `develop` → `main`.** The PR into `main` is opened from a `release/develop-to-main-<date>` branch
> (`git push origin origin/develop:refs/heads/release/develop-to-main-<date>`) and merged with "Create a merge commit".
> A staging step can be switched back into the path with `STAGING_IN_RELEASE_PATH = true` in
> `scripts/check-branch-fresh.mjs`; the two paragraphs below then apply again.
>
> *(Switched off)* **With staging on, the path is `develop` → `staging` → `main`.** The PR into `main` is opened only
> from `staging`, after the team has tested on the staging host; a hotfix also goes into `staging` first and `staging`
> is then merged back into `develop`.
>
> **Both release PRs (`develop` → `staging`, `staging` → `main`) merge with "Create a merge commit", never squash**
> (a squash causes conflicts at the next release). **The PR into `main` is opened from `release/staging-to-main-<date>`,
> not from `staging` itself**: after a merge GitHub deletes the source branch, and a deleted `staging` blocks every later
> release. Create the branch with `git push origin origin/staging:refs/heads/release/staging-to-main-<date>`.

This skill is **the order** — which gate comes first, who answers which question, and where you may stop. It does not
teach writing code (that is `mattpocock-skills:*`), nor running dev (that is [`run-dev`](../run-dev/SKILL.md) and
[`tch-dev`](../tch-dev/SKILL.md)).

**Read this once, at the top, because it changes how you read every green light below:**

> **Check whether your repository has branch protection.** A private repository on GitHub's free plan cannot have it
> (`repos/<owner>/<repo>/rulesets` and `branches/main/protection` return **403 "Upgrade to GitHub Pro"**). Without it,
> **a red CI blocks no merge**, and `main` accepts direct pushes. The last gate is **the person pressing the button**, not
> GitHub. If you merge on red CI, nothing stops you — so don't.

---

## 0. Three traps before you type `git add`

| Trap | What to do |
|---|---|
| **A submodule rolls the whole repo back.** Checkout does not move `vendor/tracy/deepseek-harness`, so your tree keeps the OLD pointer while `main` moves on; `git add -A` packages that pointer as a change. **No gate catches it.** | `git submodule update` **before** committing. And don't `git add -A` — list the paths. |
| **Several agent sessions share one checkout.** Files change under you; `ahead N` is not yours. | Do long work in a worktree: skill `using-git-worktrees`. |
| **`lib/client.js` must be committed** (RULE #3). The image copies plugin folders as-is and builds nothing there. | `pnpm build`, then commit `lib/`. Gate `bundles` catches it. |

---

## 1. Gates that must be green BEFORE opening a PR

```
pnpm build:check     # every gate, stops at the first failure
```

Run it **in the main checkout**, not a worktree — gate `boot-graph` needs `tch/profiles/<profile>/node_modules`, which is
gitignored and **absent from every clean checkout**. In a worktree it fails with `cannot resolve profile bundle`; that is a
known gap, not your change.

**Don't run the full gate set for a small UI tweak.** While iterating, run only the relevant gate
(`pnpm exec tsx scripts/check-language.ts`, …); run the full set **once**, right before committing.

### The real lock: the `pre-push` hook

Because CI may not block a merge (the note above), the lock lives on the machine — `scripts/check-push.mjs`, wired through
prek. It **blocks** a push when:

1. The push goes into `main`/`develop`, touches `packages/` or `apps/`, and adds or edits no change-journal entry (unless
   the commit message carries `[skip-changelog]`). This applies when your installation keeps a change journal.
2. The `vendor/tracy/deepseek-harness` pointer is **rolled back** — on any branch.
3. `pnpm test:workers` is red, when a push into `main` touches `scripts/` or `packages/`.

It **warns** (does not block) when the submodule pointer changes but its direction cannot be determined — the local
submodule clone lacks the commits to compare. And it **prints a reminder** of the §5 steps when a push touches `packages/`.

**Check 3 reads the WORKING TREE**, and the checkout may be shared with another session. Red there → `git status` before
concluding it is your fault.

`git push --no-verify` skips all three. That is a named choice and it belongs to the person typing — not a shortcut for
when you are in a hurry.

Debug the hook itself without pushing:

```
PRE_COMMIT_FROM_REF=$(git rev-parse origin/main) \
PRE_COMMIT_TO_REF=$(git rev-parse HEAD) \
PRE_COMMIT_REMOTE_BRANCH=refs/heads/main node scripts/check-push.mjs
```

---

## 2. Branches and commits

**One line of work = one branch = one PR** (reasons: `CLAUDE.md`, "One line of work = one branch = one PR"). Every merge
into `develop` is an image build and a dev-machine deploy. Follow-up fixes after a merge, evidence docs, plan ticks and side
work found on the way → commit onto that line's branch, don't open a new PR. Subagents don't open or merge PRs unless the
brief says so. A separate PR only for a different repo, or a change that must reach `develop` before the line is done (say
why).

**PRs open as DRAFT** (`gh pr create --draft …`); when to flip to ready: §3 "When to press Ready". More work after it is
ready → `gh pr ready <n> --undo`, not a new PR.

Branches: `feat/…` · `fix/…` · `chore/…` · `docs/…` · `release/…` · `ci/…`.

Commits: **English, imperative, lowercase after the prefix** — `type(scope): short description`, with type in
`feat fix refactor docs test chore perf style ci release`.

Three things that **never** go into a commit message: `Co-Authored-By`, a non-English language, and vague descriptions like
"various fixes" — whoever reads `git log` six months later pays for it.

---

## 3. PR — open as DRAFT, press Ready when done; template with titled sections

**While you still push, the PR stays draft:** `gh pr create --draft …`, or `gh pr ready --undo` for a PR already open. A
draft **does not run Tracy CI**; pressing **Ready for review** (`gh pr ready`) once done runs Tracy CI **exactly once** on
the final version. Pushing to a ready PR cancels its previous run (`concurrency` in `tracy-ci.yml`) — but each push still
costs a full multi-job run on a lane with limited slots, so don't use a ready PR as a test bed.

**Before `gh pr ready`: `git fetch origin && git merge origin/develop`, re-run the tests.** Job `branch-fresh` goes red when
a ready PR is more than 50 merges behind its base (`scripts/check-branch-fresh.mjs`); the `pre-push` hook only warns at the
same threshold and lists the merges that touched your branch's files — read them before going on.

**Merge only when Tracy CI is green on the LAST commit.** Without branch protection GitHub cannot enforce it; `CI Before
Merge` runs after every merge, and if the **latest** Tracy CI run on the last commit was not green it **comments on the PR
and goes red** — an old green run next to a new red, cancelled or still-running one does not count. A merge done by a
manual push to `develop` is caught too, because GitHub still closes the PR as "merged".

### The merge — run the check first, then merge exactly the checked commit

**Whoever performs the merge, person or agent, runs the block below, whole, right before merging.**
`scripts/check-pr-merge.mjs` only reads GitHub (`gh api`, all `GET`): it does not merge, push, comment or change anything.
It returns one of three verdicts:

| Verdict | Exit | Meaning | Action |
|---|---|---|---|
| `PASS` | 0 | PR open, not draft, correct base; the **latest** run of each of the five PR workflows (`Tracy CI`, `Changelog Check`, `PR Description Check`, `Regression Check`, `Branch Fresh Check`) finished green on exactly the branch head, with every required job — "latest" is the run whose attempt started last, so a re-run of an older run counts; a final re-read shows the run list, the PR and the base unchanged | merge with the commit it prints |
| `FAIL` | 1 | known and not met: draft, closed, wrong base, missing run, latest run red / cancelled / still running, missing or failed job, a run or re-run started during the check, PR or base changed during the check | **do not merge**; fix exactly what it names, wait for CI, run again |
| `UNKNOWN` | 3 | GitHub could not be read (no `gh`, rate limit, network, timeout) or data missing / contradictory — **nothing was checked** | **do not merge**; run again. Don't guess, don't reuse an old verdict |

Bad arguments exit 2, before any API call. Only `PASS` prints to stdout (one JSON line); `FAIL` and `UNKNOWN` leave stdout
empty.

```bash
# Set first: REPO=<owner>/<repo>  PR=<PR number>  BASE=develop (or staging, main). Run from the repo root.
verdict="$(node scripts/check-pr-merge.mjs --repo "$REPO" --pr "$PR" --base "$BASE")" &&
  sha="$(node scripts/check-pr-merge.mjs --repo "$REPO" --pr "$PR" --base "$BASE" --expected-head "$verdict")" &&
  gh pr merge "$PR" --repo "$REPO" --merge --match-head-commit "$sha"
```

- Line two re-reads the `PASS` JSON line and prints the commit only when it is **intact, read from GitHub, for this PR and
  under 2 minutes old**; a truncated JSON line, a `FAIL`, a verdict produced with `--fixture`, or a verdict for another PR
  yield no commit — and then `gh pr merge` is never called.
- `--match-head-commit` is the only thing GitHub enforces on its side: if the head moved after the check, GitHub refuses the
  merge. **Never type the commit by hand, never drop this flag.**
- **Never reuse a verdict.** Another push, a changed base, an edited PR description, or more than 2 minutes → run the whole
  block again.
- The steps above still hold: `git merge origin/develop`, re-run the tests, and job `branch-fresh`.

**This is a command to follow, NOT a merge lock.** The web Merge button, or someone skipping this command, can still merge
— then only `CI Before Merge` reports it, after the fact. And the base can still move between the last read and the merge
(there is no merge queue), so the merge result itself was never tested anywhere; the command only guarantees the checks were
green on the **branch head**. Details and limits:
[`docs/references/gates-ci-runners.md`](../../../docs/references/gates-ci-runners.md), section on checking before merge.

### When to press Ready — the agent presses it itself, without being asked

Run `gh pr ready <n>` as soon as **all six lines** below are true. Record each command you ran in `How it was verified`.

1. **Line finished:** no more commits planned for this line; `git status` empty, pushed, `git merge origin/<base>` done
   without conflict.
2. **Local gates green:** `pnpm build:check` in the main checkout. A worktree lacks `boot-graph` / `interface-languages`
   (they need `node_modules/.bin/dsh`) → state which gates could not run in `How it was verified`, and let CI answer.
3. **Description passes locally:** `node scripts/check-pr-description.mjs <payload>`; a `fix`/`feat` PR also runs
   `node scripts/check-regression.mjs <payload>`. Both checks also run on drafts, so running them locally first avoids a red
   first run.
4. **Change journal:** if your installation keeps one, a push touching `packages/` or `apps/` has its entry committed.
5. **Acceptance:** the acceptance step named in the line's plan (E2E on a stand, a measurement on the dev machine) has run,
   and its evidence is committed.
6. **One line, one PR:** the line's docs/evidence live in this branch; no side PR is waiting as a draft.

After pressing:

- `gh pr checks <n> --watch`. Red → `gh pr ready <n> --undo`, fix, back to line 1. Green on the LAST commit → report
  "PR #<n> ready, CI green, waiting for merge".
- **Merging into `develop`:** when the `Auto Merge Develop` bot is enabled (next section), pressing Ready is enough — the bot
  merges a non-draft PR that is green on exactly its head with no pending review request; the agent does not merge by hand
  alongside it. When the bot is not enabled or cannot confirm this PR: merge by hand with the `check-pr-merge.mjs` block
  above, only when the line's brief or a maintainer said so explicitly; when allowed, merge the PRs of one batch back to
  back, since each merge builds images and deploys dev. To keep a PR away from the bot, leave it Draft. **Merging into
  `main`:** always ask (the bot never targets `staging`/`main`).

### Auto merge develop

The `Auto Merge Develop` workflow is the automatic executor for **`develop` only**; staging/main keep the release flow run
by the assigned person or agent. Rules and activation settings:
[`gates-ci-runners.md`](../../../docs/references/gates-ci-runners.md), section on auto-merging into develop.

Once the workflow is on the default branch `main`, and the dedicated CI App and the repo variable are enabled, a PR whose
five workflows are green on exactly its head is re-checked with the same command above. Draft PRs, forks, unknown
mergeability, requested reviews / requested changes, FAIL/UNKNOWN or a moved head are not merged. The bot deletes no
branch. A read-only token checks the gates; a repo-scoped App token performs the merge so that the post-merge build/deploy
still triggers. When the bot is not enabled or cannot confirm, the agent uses the manual merge block above, as assigned.
Merging a PR that adds the workflow file into `develop` does **not** yet activate its `workflow_run`.

`.github/pull_request_template.md` is filled in automatically. `scripts/check-pr-description.mjs` enforces **five** fields,
and leaving one empty turns CI red:

| Field | What the gate wants |
|---|---|
| `### What this PR does` → `Before this PR:` | the behaviour that HAPPENS now, not what is missing |
| `### What this PR does` → `After this PR:` | the new behaviour; if both paragraphs read the same, nothing was described |
| `### Why we need it` | why it is worth doing **now**; write down trade-offs considered and dropped |
| `### How it was verified` | what actually **RAN**. If it touches UI, say where you looked at it with your own eyes — no gate draws pixels |
| `### Web and desktop` | ADR 0030: `Both the same — …` / `Desktop only — web cannot: …` / `N/A — …`; if the web can do it, build it on the web first and the app gets it |

Check locally before opening, to save a CI run:

```
gh pr view <number> --json body -q .body > /tmp/pr.json   # or write the payload by hand
node scripts/check-pr-description.mjs <payload.json>
```

### Regression case — `fix`/`feat` PRs

The template's `### Regression` section is guarded by the **`Regression`** gate (not the `description` gate). Before
pressing Ready, for a PR titled `fix(...)`/`feat(...)` or on a `fix/…`/`feat/…` branch:

1. Add a case of the **same kind** as the PR with `node tests/regression/create.mjs --pr <PR number> --slug <slug> --input <file.json>`
   (id `REG-PR-<PR number>-<slug>`, file `tests/regression/cases/<id>.json`; it needs the PR number, so open the draft
   first — never pick "the next number" yourself, a new case with an id `REG-NNN` is rejected by the gate), or edit an
   existing case and keep its id — test the fence (the mechanism you fixed), not "the model didn't get it wrong".
2. Run it on a stand built from the branch's code: `node tests/regression/run.mjs --stand <url> --id <id>`, then commit the
   `tests/regression/results/*.jsonl` file — the `PASS` line must carry a commit **of this branch** (after a rebase, run it
   again).
3. Write in `### Regression`: `<id> — PASS on <commit>`. Only a `feat` may write
   `Regression: none — <reason of at least 10 characters>`; a `fix` never may.

Check locally: `node scripts/check-regression.mjs <payload.json>`. Full rules:
[`tests/regression/README.md`](../../../tests/regression/README.md).

---

## 4. What CI says, and what it does NOT say

The workflows **all run on self-hosted runners**, one lane each (`tracy-lane-dev` for everything not on `main`,
`tracy-lane-prod` for `main`); runner setup: [`gates-ci-runners.md`](../../../docs/references/gates-ci-runners.md).

| Workflow | Question it answers |
|---|---|
| `Tracy CI` | every gate **except `boot-graph`** — it is named with `--skip`, it does not vanish silently |
| `Changelog Check` | A change touching `packages/` or `apps/` without adding/editing a change-journal entry. Guards **both `push` and `pull_request`** |
| `PR Description Check` | The fields in §3; runs on drafts too; a PR opened as ready gets a reminder to go back to draft |
| `Regression Check` | Whether a `fix`/`feat` PR adds/edits a regression case of the same kind with `PASS` on a commit of the branch (feat: or `Regression: none — <reason>`); runs on drafts too |
| `CI Before Merge` | After the merge: was the **latest** Tracy CI run on the last commit green? If not → comments on the PR + red |

**Reading the colours right:**

- **A job stuck at "Waiting for a runner"** = the lane is full (its heavy slots are taken), or the runner is offline. That
  is **infrastructure, not code**. Check: `gh api repos/<owner>/<repo>/actions/runners -q '.runners[]|{name,status}'`.
- **A job that dies in ~3 seconds, 0 steps, log 404** = that run went to `ubuntu-latest` and the org is **out of Actions
  quota**. If you see that shape, some workflow was just moved back to GitHub-hosted runners.
- **`boot-graph` does not run on CI.** To know whether dsh still boots a client graph, run `pnpm build:check` in the main
  checkout. A green CI does **not** answer that.
- **CI runs on one machine**, so it cannot prove the tree builds clean elsewhere. That is exactly the class of bug
  `check-self-contained` exists to catch.

---

## 5. Merging into `main` is a RELEASE, not two separate jobs

Merging into `main` releases; how and where it is deployed is configured per installation (follow the release runbook of
your installation). **Don't let `main` accumulate code that is not out** — then nobody can answer "what is production
running" by looking at `main`, and the next person to deploy ships someone else's work without knowing what they shipped.

**Agent: don't ask again "should I deploy?" or "should I write the journal entry?".** The content was approved at review;
asking again makes the same person approve one thing twice.

The full package, no step skipped:

**0. Record the change** — if your installation keeps a change journal, add a NEW entry file: what, by whom, which issue,
which commit, and one line saying whom it affects. Write it **before** deploying, not after. A change that truly affects
nobody carries `[skip-changelog]` in its commit message — the only escape `Changelog Check` accepts, and it only asks when
the push touches `packages/` or `apps/`.

**1.** `git pull`, check that `git status` is empty. Deploy from a clean tree whose HEAD equals `origin/main` — a dirty tree,
including one dirtied by **another session**, is not a release; deploy from a clean worktree, never force past the check.

**2.** `pnpm test:workers`.

**3.** Deploy with your installation's release procedure. **Don't guess the scope from the folder you just edited**: one
package is often imported by several services, so read what depends on it.

**4.** Verify on the live service: `curl` the page itself and look for what you just shipped:

```
curl -sL https://<your-host>/login | grep -c '<string you just added>'
```

**5.** Report: what was deployed, which commit, and whether it is live.

**Several people can deploy.** Before deploying, check whether what is live carries a commit newer than `origin/main`. A
duplicate deploy is harmless. But a live commit that **cannot be traced** with `git cat-file -e <commit>^{commit}` means
**stop and ask**: someone just deployed from an uncommitted tree, and overwriting it erases something nobody has read.

---

## 6. What if the change touches no `packages/` or `apps/`?

Then §5 does not apply: there is nothing to deploy, and `Changelog Check` says itself that this push touches neither and
needs no entry. §1 and §3 still apply.
