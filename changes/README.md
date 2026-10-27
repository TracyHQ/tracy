# Change journal — one file per change

This folder answers one question that `git log` answers badly: **"while I was working, what did
someone else change that I need to know about?"** It is not the full history (that is `git log`).
It is the list of changes that **touch other people**, so that many people and agents merging in
parallel do not step on each other.

- **Read it when you start a session:** `pnpm journal --days 30` prints every entry, newest first
  (`--since YYYY-MM-DD` to start from a given day).
- **Write an entry in the same pull request as the change.** The `changelog` gate
  (`scripts/check-changelog.mjs`, run in CI and by the `pre-push` hook) requires a push that touches
  `packages/` or `apps/` to **add or edit** an entry file here. It only checks that an entry exists;
  it does not judge what it says.

## Why one file per change

A single shared changelog file makes every two parallel pull requests edit the same lines, so the
second one to merge needs an extra conflict round for the journal alone. Two files with different
names share no line to conflict on. `pnpm journal` merges them back into one timeline when reading;
no summary file is generated, because a summary file would be one shared file again.

## File name

```
changes/YYYY-MM-DD-<slug>.md
```

- `YYYY-MM-DD` is the day the entry is written. `pnpm journal` sorts by that date, then by file name,
  both descending; a name that does not start with a real date is left out and named on stderr.
- `<slug>`: lowercase ASCII words joined by `-` — the pull request number or a few words from the
  branch (`2026-10-26-pr-1801.md`, `2026-10-26-english-journal.md`). A slug tied to your branch or PR
  keeps two people from picking the same name.
- One change, one file. Following up on the same change (a second merge, a measurement) edits its
  file instead of adding a new one. Deleting an entry does **not** count as writing one.

## Format

English, one entry per file:

```
- **<what changed, as one sentence about what it does>** — <who: name or role> · #<PR> · `<branch>` · YYYY-MM-DD
  **Affects:** which area, and who must do something differently (an image to rebuild, a caller to update).
  **Why / Measured:** (optional) the symptom, the evidence, the command and its result.
```

- **Line 1 is for tracing back:** what, who, which pull request, which branch, and the date.
- **The `Affects:` line is the reason the journal exists.** It is written for the person working
  *right now*; the commit message is written for someone reading in six months. Do not repeat line 1.
- **A hash in backticks on the `- **` line must resolve.** The gate checks every such hash with
  `git cat-file`; a hash typed before committing dies on the first amend or rebase. With no commit to
  point at yet, name the branch instead. A hash from another repository needs a prefix (`od@3d0d15fc`).

## Which changes get an entry

**Write one** when the push:

| Does | Why it touches others |
|---|---|
| Changes `packages/` or `apps/` | the code that reaches users; the `changelog` gate requires it |
| Renames or reshapes something others call | a `--dsw-*` token, an i18n key, a table column, an API shape |
| Changes a convention, a gate, or a rule in `CLAUDE.md` | others are following the old version |
| Reverts someone else's work, or drops a chosen direction | silence here means someone does it again |

**Skip it** when the push only touches your own work: a typo, notes for your own task, tests for your
own code, something nobody uses yet. If such a push touches `packages/`/`apps/`, put
`[skip-changelog]` in the commit message — the only escape the gate accepts.

When in doubt, **write it**. A needless entry costs a reader three seconds; a missing one can cost an
afternoon, or a fix that nobody deploys.

## Transition

The repository this journal grew out of kept an internal journal in `tasks/nhat-ky/`. While that
folder exists in a tree, the gate accepts an entry in either place and `pnpm journal` prints both;
where it does not exist (this public tree), only `changes/` counts.
