---
description: How GitHub Actions stays safe in a public repository with self-hosted runners — fork pull requests on GitHub-hosted runners only, pull requests off the production lane, pinned actions, and the settings the owner flips at cutover.
sources:
  - .github/workflows
  - .github/CODEOWNERS
  - scripts/check-pr-merge.mjs
  - scripts/auto-merge-develop.mjs
  - scripts/test/ci-public-repo.test.mjs
  - scripts/ci/ci-repository.mjs
  - scripts/check-language-policy.mjs
  - scripts/lib/english-policy.mjs
  - scripts/language-policy.json
  - scripts/test/check-language-policy.test.mjs
  - apps/tracy-web/src/lib/source-repository.js
---

# CI for a public repository

How GitHub Actions stays safe once this repository is public while the team keeps its own
self-hosted runners (owner decision, 26/10/2026). Enforced by `scripts/test/ci-public-repo.test.mjs`.

## The model

| Code | Where it runs | Credentials |
|---|---|---|
| A push to `main`/`staging`/`develop`, a manual run, the nightly | the team's self-hosted runners, as before | the secrets each workflow already uses |
| A pull request from a **branch of this repository** | Tracy CI: the team's self-hosted runners, **always the dev lane** (`tracy-lane-dev`), whatever the base, or GitHub-hosted `ubuntu-latest` when it carries the opt-in label `ci:hosted` (30/10/2026, [`gates-ci-runners.md`](gates-ci-runners.md) › Runners); the light gates (`changelog`, `description`, `Regression`, `branch-fresh`, `english`, `CI Before Merge`): GitHub-hosted `ubuntu-latest` since 30/10/2026 | as before (the CI read App token in `plan` and `CI Before Merge`, the vendor deploy key, the Turbo cache keys) |
| A pull request from a **fork** | **GitHub-hosted** `ubuntu-latest` only | none: `permissions: { contents: read }`, `actions/checkout` with `persist-credentials: false`, no `secrets.*` |

Each same-repository job of a pull-request workflow carries
`github.event.pull_request.head.repo.full_name == github.repository` in its `if`. Each such
workflow has a fork twin named `<job> (fork)` that runs the same repo script on `ubuntu-latest`:

| Workflow | Fork job |
|---|---|
| `tracy-ci.yml` | `fork pull request checks`: the `checks` row (`check-all.ts --skip tests`). It fetches `vendor/tracy/deepseek-harness` anonymously over HTTPS; while that repository is private the fetch fails, the job prints a notice and ends green. A maintainer runs the full suite by pushing the branch to this repository |
| `changelog-check.yml` | `changelog (fork)` |
| `pr-description-check.yml` | `description (fork)` |
| `regression-check.yml` | `Regression (fork)` |
| `branch-fresh-check.yml` | `branch-fresh (fork)` |
| `ci-before-merge.yml` | `merged with green Tracy CI (fork)`: a warning only — a fork's code never ran the full rows, and its token cannot comment |

`check-pr-merge.mjs` and auto-merge refuse a fork's pull request, so a fork is merged only by a
person, after reading it.

### The production lane

`tracy-lane-prod` runners share the machine that builds production images. Since 26/10/2026 no
pull-request job asks for it, a release pull request into `main` included; only a push to
`main`/`staging` (image builds, deploys, `changelog`) and a manual Tracy CI run on `main`/`staging`
do. `check-pr-merge.mjs` therefore requires the dev lane on every self-hosted job of every pull request (a job whose only label is `ubuntu-latest` and whose runner group is `GitHub Actions` is GitHub-hosted, on no lane), and the
lane no longer records which base a run was made for. A pull request retargeted after a green run is
still caught: into `staging`/`main` every row is required (the forced Turbo rows only with the plan's
`full run` mark), and `branch-fresh` now re-runs on `edited`, which retargeting fires.

### Privileged workflows

The two jobs that hold a write token run on **GitHub-hosted** `ubuntu-latest`, never on the team's
runners: those are persistent and also run pull-request code, so anything a pull-request job leaves
behind would run next to the token. `scripts/test/ci-public-repo.test.mjs` pins both.

- `ci-label-rerun.yml` (`pull_request_target`) checks out the base commit with no credential, takes
  the label and PR number as data, and refuses forks and drafts in its `if`. It holds `actions: write`.
- `auto-merge-develop.yml` (`workflow_run`, `schedule`) checks out the default branch, ignores runs
  whose head repository is not this one, and merges only same-repository pull requests into `develop`
  after `check-pr-merge.mjs` passes on the exact head. It reads no artifact or cache from the
  triggering run. It merges only a pull request **opened by a person of the team**: `user.type`
  `User` (never a `Bot` — Dependabot, a GitHub App agent) with `author_association` `OWNER`,
  `MEMBER` or `COLLABORATOR`; anything else is reported as `author-missing`, `author-not-human` or
  `author-not-team`. It **never merges a pull request that touches a CI-sensitive path** (status
  `sensitive-files`), old or new name of each file. The set is read from the trusted checkout at
  run time: every path in `.github/CODEOWNERS`, and every path under `scripts/` a `run:` step of the five
  gate workflows names, whatever command or argument it sits in, bare or quoted, behind `./`,
  `$GITHUB_WORKSPACE/` or `${{ github.workspace }}/` (shell comment lines excepted), so a new gate
  script is covered without editing a list; finding no script at all fails the run. A floor stays
  whatever those files say: `.github/`, `scripts/ci/`, `scripts/lib/`, `scripts/check-*`,
  `scripts/auto-merge-develop.mjs`, `scripts/check-pr-merge.mjs` and `turbo.json`. A `pull_request`
  run executes the workflow files of the pull request's head, and those run the head's copy of each
  gate script, so a pull request that rewrites either could otherwise turn its own gate green; a
  person merges those. **Still trusted to the team authors the bot requires:** test files, app code
  and the `package.json` scripts a gate reaches (`pnpm build:check`, `pnpm test`); a team member's
  pull request that weakens a test or a package script is caught only by review. The file list is read before and after the gate, each time
  between two reads of the same head; a listing that differs, that disagrees with `changed_files`, or
  that reaches the files API's 3000-file limit refuses the merge (`files-incomplete`). With the repository variable `REQUIRE_APPROVAL_FOR_AUTO_MERGE=true` it also needs
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
  workflow YAML of the pull request's merge commit, so a fork that changes a job's `if` or `runs-on`
  can ask for a self-hosted label once a maintainer lets its workflows run. YAML guards keep honest
  forks off the team's runners; they do not stop a hostile one. Reviewers must read every change to
  `.github/**` and `scripts/ci/**` (both owned in `.github/CODEOWNERS`) **before** approving a fork's
  workflow run. GitHub recommends self-hosted runners only for private repositories; the real fence
  is runner-group access (below), which is outside YAML.
- Fork pull requests get no full test run until the submodule is public, and even then only the
  `checks` row.
- A release pull request now queues on the dev lane with every other pull request.

## Cutover settings (owner)

1. Repository → Settings → Actions → General → **Fork pull request workflows from outside
   collaborators: "Require approval for all external contributors"**.
2. In `TracyHQ/tracy-runners`, remove `tracy-lane-dev` from `aws-prod-check-01` and
   `aws-prod-check-02` (`hosts.tsv`, the `tracy-lane-dev@1-2` entry on the `aws-prod-check` row,
   then `bin/deploy`), so no pull-request job lands on the production box.
3. Restrict the self-hosted runner group to this repository and, if possible, to the workflows above;
   then prove it with a fork pull request that asks for a self-hosted label and record that no runner
   took it.
4. Optional: turn on `REQUIRE_APPROVAL_FOR_AUTO_MERGE=true` (repository variable) when the team is
   ready to approve before auto-merge.
5. Once `TracyHQ/tch-vendor-deepseek-harness` is public: `.gitmodules` to `https://`, and drop
   `TRACY_VENDOR_DEPLOY_KEY`.

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
