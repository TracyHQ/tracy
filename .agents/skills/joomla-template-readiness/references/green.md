# At green: approve the kit, release, open the PR

Green means: every piece of the verdict is `done` except the kit approval (`kit-not-approved`,
`kit-approval-stale`), and the eye review has no fault left that this run can fix.

## 1. Record the kit approval (JA Boxing format)

The approval seals the pack's image set; the eye review replaced the person's look at the review sheet (spec #429).

```bash
node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs approve --out "$KIT_DIR" --by "$(gh api user --jq .login)"
```

It writes `approval: { by, at, imagesSha256 }` into the pack's `template-kit.json`, exactly as JA Boxing records it.
Every accept the run wrote (`gap-accepts.json`, `reach-accepts.json`, `accepted` in `content-coverage.json`) carries
its reason and `by` the same login. Copy the pack's `template-kit.json` beside the contract. Read the verdict once more:
every piece `done`, exit 0.

## 2. Pin and release

Follow `quickstart-contract` sections 8 and 9 (`references/ship-and-release.md`) in their order: upload the pack files,
pin the version in both quickstart lists (`apps/tracy-web/src/quickstarts.json` and
`packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json`, identical byte for byte) and the two
`design-templates.json` when the template has an entry, the PR into `develop`, then flip the switch and K6 pass 2 after
Tracy dev has the pin.

The stop points of that skill are passed without waiting: the preparer named the template, which is the go (spec #429,
Implementation Decisions, conductor skill). The stops of [`SKILL.md`](../SKILL.md) still hold: a step that needs a
claude-cowork release stops.

The Cowork pin moves only to a plugin version already released that has every door (`cowork-pin` piece done). Never
cut a plugin release from this skill.

## 3. Changes note and PR

- One new file `changes/YYYY-MM-DD-<template>-readiness.md` (format in `changes/README.md`): the template, the version
  released, and who it touches (preparers, the Website opportunity flow).
- The PR follows the `pr-merge` skill (draft, gates before push, the three template sections, ready, merge on green CI).
  The body's *What changed* is the fix log (`$RUN/fix-log.md`: piece, code, what changed, where), *How it was verified*
  holds the last verdict output and the eye review counts, and every fault left in the readiness report is one line.
- Tool fixes found on the way go in the same PR when small; a large one is its own PR, named in this PR's body.
