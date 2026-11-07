# At green: approve the kit, release, open the PR

Green means: every piece of the verdict is `done` or `not-judged` except the kit approval (`kit-not-approved`,
`kit-approval-stale`), and the eye review has no fault left that this run can fix.

## 1. Record the kit approval

As the Joomla skill does (`joomla-template-readiness` `references/green.md` section 1): `template-kit/cli.mjs approve
--out "$KIT_DIR" --by "$(gh api user --jq .login)"`, every accept the run wrote carries its reason and `by` the same
login, the pack's `template-kit.json` is copied beside the contract, and the verdict is read once more: exit 0
(`exitCodeOf`: every piece `done` or `not-judged`).

## 2. Release and pin

Two cases, decided by the fix log:

- **No new version was cut** (every fix landed beside the contract: kit, accepts, `content-coverage.json`,
  `demo-measures.json`, `demo-baseline.json`, or a tool fix). Nothing is released and the pin does not move: go to
  section 3.
- **A theme release was cut** in the loop. It was made by the vendored `tracy-wordpress-theme` skill
  (`references/quickstart.md`, *Release a fix version*): `release.mjs --patch` assembles the release folder and prints
  the `gh release upload` commands for the tag `quickstart/<slug>/wp7` in `JoomlArt-Products/joomlart-products`;
  naming the template is the go to run them (the stop points of a called skill are passed, as in the Joomla skill).
  The new version then needs its contract carried by a claude-cowork WordPress plugin release (procedure W1 of
  [`fix-map.md`](fix-map.md): `node scripts/release-wordpress.mjs X.Y.Z` in that repository, by hand, `--dry-run`
  first, through its `release/<tag>` PR) and a pin in both quickstart lists (procedure W3:
  `scripts/pin-wordpress-quickstart.mjs`, `--dry-run` first). The plugin release is another repository's release: run
  it only with the preparer's go and access, otherwise report the release folder, its `VERIFICATION.json`, the contract
  folder and the exact commands, and stop there.

Never hand-write a WordPress pin: the script reads the sizes and hashes from the assets.

## 3. Changes note, scan and PR

- One new file `changes/YYYY-MM-DD-<template>-readiness.md` (format in `changes/README.md`): the template, the
  version, and who it touches (preparers, the Website opportunity flow).
- **Before every push**, the repository is public:
  - `git log --format='%h %ae %ce' origin/develop..HEAD` shows only the GitHub noreply address;
  - `node scripts/opensource/scan.mjs --ref HEAD --fail-on vietnamese --no-gitleaks` adds no finding over
    `--ref origin/develop`;
  - the diff names no machine, local address, path of this machine, person or client (read every hit of a grep for
    them). A red scan is fixed before the push, never pushed past.
- The PR follows the `pr-merge` skill (draft, gates before push, the three template sections, ready, merge on green
  CI). *What changed* is the fix log, *How it was verified* holds the last verdict output and the eye review counts,
  every fault left in the readiness report is one line, and every stop of the run is named with who must act.
