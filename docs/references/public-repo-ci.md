---
description: How GitHub Actions stays safe in a public repository — every pull-request job on GitHub-hosted runners, secrets only for this repository's branches, the team's runners only on deploy hosts, pinned actions, and the settings the owner flips.
sources:
  - .github/workflows
  - .github/CODEOWNERS
  - scripts/check-pr-merge.mjs
  - scripts/auto-merge-develop.mjs
  - scripts/test/ci-public-repo.test.mjs
  - scripts/test/ci-runner-arch.test.mjs
  - .github/actions/node-pnpm/action.yml
  - .github/actions/free-disk/action.yml
  - scripts/ci/ci-repository.mjs
  - scripts/check-language-policy.mjs
  - scripts/lib/english-policy.mjs
  - scripts/language-policy.json
  - scripts/test/check-language-policy.test.mjs
  - apps/tracy-web/src/lib/source-repository.js
---

# CI for a public repository

How GitHub Actions stays safe now that this repository is public. Since 27/10/2026 every
pull-request job runs on GitHub-hosted runners (free and unmetered for a public repository), and the
team's self-hosted runners only run jobs that must run on a deploy host. Enforced by
`scripts/test/ci-public-repo.test.mjs` and `scripts/test/ci-runner-arch.test.mjs`.

## The model

| Code | Where it runs | Credentials |
|---|---|---|
| A pull request, from a branch of this repository or from a fork | GitHub-hosted `ubuntu-latest`, the **same job** either way | a branch of this repository: the steps that need one get a secret (the CI read App token in `plan` and `CI Before Merge`; the Turbo cache keys when set), each guarded by `github.event.pull_request.head.repo.full_name == github.repository`. A fork: none — GitHub hands a fork's `pull_request` run no secret and a read-only `GITHUB_TOKEN`, and the guards skip those steps |
| A push to `main`/`staging`/`develop`, a manual run, the nightly, `auto-merge-develop` | GitHub-hosted `ubuntu-latest` (`changelog`, Tracy CI, image builds, the merge job) | the secrets each workflow uses |
| A deploy (`deploy-dev`/`-staging`/`-prod`) and the dev host's dispatch jobs | the team's runner **on that host** (`tracy-dev`, `tracy-staging`, `tracy-prod`) | the environment's secrets |

Rules every pull-request workflow follows (`ci-public-repo.test.mjs`):

- every job is GitHub-hosted, and there is no fork twin: one job per gate, whoever opened the pull request;
- a step that reads a secret carries the same-repository guard in its own `if` or its job's;
- every `actions/checkout` sets `persist-credentials: false`;
- a hosted job sets up the Node of `.node-version` before it runs `node` or `pnpm`;
- no job names a runner lane (`tracy-lane-dev`/`tracy-lane-prod`).

A fork's pull request therefore runs the **full** Tracy CI (the vendored dsh submodule is the public
`TracyHQ/tracy-dsh`), minus what needs a secret: no read of earlier runs (`green-tree`, so it never
skips the suite), no Turbo remote cache (the rows fall back to the two workers shards).
`check-pr-merge.mjs` and auto-merge refuse a fork's pull request, so a fork is merged only by a
person, after reading it; `CI Before Merge` only warns on a fork merge.

### No production lane any more

Until 27/10/2026 pull-request jobs ran on the team's dev-lane runners and only merged code reached the
production lane's build runner. Both lanes are gone from every workflow: a GitHub-hosted job is a
fresh VM that no other job, pull request or not, has touched, and production images are built that
way too. `check-pr-merge.mjs` still refuses a job that ran on the production lane, and accepts a
GitHub-hosted job (no `self-hosted` label, no lane) or a dev-lane one.

### Privileged workflows

- `ci-label-rerun.yml` (`pull_request_target`) checks out the base commit with no credential, takes
  the label and PR number as data, and refuses forks and drafts in its `if`. It holds `actions: write`.
- `auto-merge-develop.yml` (`workflow_run`, `schedule`) checks out the default branch, ignores runs
  whose head repository is not this one, and merges only same-repository pull requests into `develop`
  after `check-pr-merge.mjs` passes on the exact head. It reads no artifact or cache from the
  triggering run. With the repository variable `REQUIRE_APPROVAL_FOR_AUTO_MERGE=true` it also needs
  an `APPROVED` review from an `OWNER`/`MEMBER`/`COLLABORATOR` on the **current head** commit, with
  no reviewer's latest decision `CHANGES_REQUESTED`. **Off by default**: agents rely on auto-merge
  into `develop` today without an approval.
- `ci-before-merge.yml` checks out the base branch (where the merge already is), not the pull
  request's merge ref, and mints the App token only for a same-repository pull request.

### Pinned actions

Every action from another repository is pinned to a full commit id with a `# vX.Y.Z` comment.
Update by resolving the new tag to its commit (`gh api repos/<owner>/<repo>/git/ref/tags/<tag>`).

## Required English contributions

The contribution rule is **English**, for everyone, including maintainers and bots. It is not a
ban on one particular language. Product translations and deliberate language samples remain data.
`English Contribution Policy` publishes one stable check, **`language-policy`**, for all PRs into
`main`, `staging` and `develop`, including forks and drafts. It needs only Node and Git: no submodule,
package installation, database, self-hosted runner, cache, secret or write token.

The workflow checks out the immutable base SHA into `trusted/` and the immutable PR head into
`candidate/`. Only the base's validator, helper and policy execute. The candidate supplies Git
objects, never executable tests, hooks, configuration or imports. The event must name the same
base/head SHAs that are scanned. Missing history, malformed policy, unreadable text, missing objects
or a scan limit is an error, not a skipped success.

### What is checked

- PR title and description, every new commit message (merge commits included), and added lines in
  every new commit plus the final PR diff. Adding non-English prose and removing it later remains red.
- All text file types, including root documents, Markdown, test names/fixtures, shell scripts and
  comments. New paths must use English names. A symlink is read as Git data, never followed.
- Unicode is normalized to NFC. Backticks, fenced blocks, HTML comments and inline `language-allow`
  markers do not create exemptions. Common recognizable non-English ASCII phrases are also flagged.
- Unchanged historical lines are not re-audited. Replacing or moving a non-English line is checked;
  there is no editable count ledger that lets one old violation pay for a new one.

This is a deterministic check, **not proof that every ASCII sentence is English**. A finite phrase
list cannot recognize all languages, transliterations or invented spellings. Reviewers must judge
English prose too. It checks authored text, not text encoded into string escapes, OCR in pictures,
or every dependency's full history. Keep the separate pre-publication secret/archive audit.

The letter check is deliberately conservative: it flags non-ASCII letters even in English
loanwords or people's names. Use an ASCII spelling in contribution metadata; exact reviewed data
exceptions below can cover file content. Ordinary punctuation and emoji are allowed. Metadata has
no data-exception mechanism, so maintainers must account for these false positives during review.

### Reviewed data exceptions

`scripts/language-policy.json` is read from the trusted base, never the PR version:

- `translations`: narrowly located JSON dictionaries. Values may be localized strings; keys must
  pass the English check. Invalid JSON fails. Adjacent README and executable source files remain
  checked; a directory name or a translation marker file cannot exempt a subtree.
- `lines`: an exact path, SHA256 of the full UTF-8 line (without its newline), maximum `count` in the
  candidate file, and a specific `reason`. Changed text, another path or an extra copy is rejected.
- `objects`: an exact path, Git object `oid`, and a specific `reason`, for an independently reviewed
  upstream snapshot, archive or submodule pin. Different bytes or a different pin are rejected.

New exceptions need their own reviewed policy change on the protected base **before** the data PR
can use them. They cannot make their own PR green. This applies to new executable-format translation
resources too; prefer pure JSON dictionaries when practical. There are no blanket vendor or test
exemptions. Ordinary media with recognized file signatures is outside text scanning; a text file
renamed to an image extension is still checked. Large/opaque content needs explicit review.

### Local commands and publication

The commit-message hook is early feedback and fails if its checker is missing. A contributor can
bypass a local hook; only GitHub's required check and branch rules enforce merging.

```sh
node scripts/check-language-policy.mjs --base <full-base-sha> --head <full-head-sha>
node --test scripts/test/check-language-policy.test.mjs scripts/test/check-english-commits.test.mjs
```

At the initial publication, include the validator, policy and workflow in the base snapshot before
opening contributor PRs. A missing base validator intentionally fails; there is no fallback to a PR's
copy. After switching the repository to Public:

1. Enable Actions. Require PRs and the exact `language-policy` check on every protected target branch.
2. Require CODEOWNERS approval for workflows, language validators, helpers, policy, export rules and
   local hooks; dismiss stale reviews when new commits arrive. Apply the rules to administrators and
   bots too, with no routine bypass; block direct and force pushes.
3. Run a good and a bad PR from both the same repository and a fork. Also try a policy self-exemption,
   a changed workflow, decomposed Unicode, and a bad intermediate commit followed by a cleanup.
   Confirm the red PR cannot merge, and updating its head reruns the check. Record the run URLs.

A `pull_request` workflow is itself editable by a PR. The trusted validator prevents changing a
helper or policy to approve the same PR, but **required ownership review of the workflow is essential**:
without it, a contributor could replace the job with a no-op. This design deliberately does not use
`pull_request_target` or write-status credentials. No account filter decides who gets checked.

Actions run after push. A failed check prevents merging into protected branches; it cannot undo the
visibility of a commit already pushed to a public feature branch. If every publicly visible commit
must be clean before publication, use a private preparation repository and a reviewed export.

## Residual risk

- **An approved fork pull request can edit the workflow files.** A `pull_request` run uses the
  workflow YAML of the pull request's merge commit, so a fork can change what its own run does once
  a maintainer lets its workflows run. It still gets no secret and a read-only token, and it can no
  longer reach a team runner: the deploy-host labels are refused to it by runner-group access, not by
  YAML (below). Reviewers must still read every change to `.github/**` and `scripts/ci/**` (both
  owned in `.github/CODEOWNERS`) **before** approving a fork's workflow run.
- A fork's run writes to the Actions cache of its own pull request only; it cannot replace an entry
  that a run on `develop` or `main` saved, which is what other pull requests read.
- A same-repository pull request's code runs in a job that may mint the CI read App token (`plan`).
  That is read-only, scoped to this repository, and was the case on the team's runners too.

## Cutover settings (owner)

1. Repository → Settings → Actions → General → **Fork pull request workflows from outside
   collaborators: "Require approval for all external contributors"**.
2. Restrict the self-hosted runner group to this repository and to the two image workflows (the
   only ones with deploy-host jobs); then prove it with a fork pull request that asks for a
   self-hosted label and record that no runner took it.
3. In `TracyHQ/tracy-runners`, retire the check, light and build pools (`tracy-check`,
   `tracy-light`, `tracy-build`, `tracy-lane-dev`, `tracy-lane-prod`): no job asks for them now.
   Keep the `tracy-dev` / `tracy-staging` / `tracy-prod` runners.
4. Before enabling the image workflows: grant `TracyHQ/tracy` write access to the
   `ghcr.io/tracyhq/tracy-web`, `tracy-host` and `tracy-dsh` packages (Package settings → Manage
   Actions access), or the hosted build cannot push with `GITHUB_TOKEN`; then watch the first push
   build (the free disk `free-disk` prints, the push, the deploy).
5. Optional: turn on `REQUIRE_APPROVAL_FOR_AUTO_MERGE=true` (repository variable) when the team is
   ready to approve before auto-merge.
6. Optional: set `TURBO_CACHE_S3_*` (endpoint, bucket, keys of an R2 bucket) to bring back the
   Turbo test cache; without them the rows run the two workers shards.

## Cutover: source repository name

The code moves from `TracyHQ/tch` to `TracyHQ/tracy` on a day the owner picks. Until then every
default below is `TracyHQ/tch`, so nothing changes before cutover. Only these two names are
accepted anywhere (`apps/tracy-web/src/lib/source-repository.js`); any other value is refused, never
silently replaced.

**Follows by itself, nothing to flip:**

- Every script in `scripts/ci/` and anything run from a workflow: `scripts/ci/ci-repository.mjs`
  takes `GITHUB_REPOSITORY` from the runner.
- The `org.opencontainers.image.source` label of the `tracy-host` and `tracy-dsh` images: the
  workflows pass `github.repository` as a build argument.

**Flip one value per place** (`TRACY_SOURCE_REPO=TracyHQ/tracy`):

| Place | Where the value lives | What reads it |
|---|---|---|
| `tracy-web` on each deployment that shows `/ops` › CI (prod, staging, dev, a local stand) | its env file (`deploy/.env` locally, `/etc/tracy/tracy-web.env` on a server), then restart `tracy-web` | `config.sourceRepo` → the CI dashboard's GitHub queries, PR links and read marks. The `TRACY_CI_GITHUB_TOKEN` there must have read access to the new repository |
| Each self-hosted runner built from `packages/fleet/tracy-fleet-operation/runner/` | `/opt/tracy-runner/.env` next to `compose.yml` | `RUNNER_REPO`; re-register the runner with a token from the new repository (runner README) |
| Runners managed in `TracyHQ/tracy-runners` | that repository's own config | re-register them against `TracyHQ/tracy` |
| A shard installed from a checkout (`REPO_TOKEN`) | the `--inputs` file of `deploy/scripts/install-shard.sh` | the clone URL of the sparse checkout |
| The machine that runs the nightly QA (`scripts/qa/nightly.mjs`) and the desktop release (`packages/desktop/tracy-desktop/build/release.mjs`) | the environment of that job or shell | `ciRepository()`: issues, comments and report links, the Windows/Linux workflow lookup |

**Not covered here:** `packages/web/tracy-harness/src` still names `TracyHQ/tch` in source links
(`matrix.ts`, `Preset.tsx`, `CmsAgents.tsx`, `cms/problem-guides.ts`), in the `Ci.tsx` fallback
label, and in the client-side link filter `githubLink` of `ci-api.ts`. That filter must accept
`TracyHQ/tracy` before cutover, or every link on the CI dashboard disappears. Issue and pull-request
numbers cited as `TracyHQ/tch#N` in comments and regression evidence are history and stay.
