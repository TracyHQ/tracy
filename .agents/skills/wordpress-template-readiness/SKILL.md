---
name: wordpress-template-readiness
description: Bring one named WordPress block theme quickstart to the JA Diner WP7 level, so the Website opportunity flow builds a clean customer site from it. Checks the theme is in scope, reads the template readiness verdict, runs the existing skill, tool or command that fixes the first red piece, loops until every piece is green, reviews every page by eye, then approves the kit, releases and opens the PR, stopping where a WordPress step has no procedure. Use when asked to "make WordPress template X ready", "bring X to the JA Diner WP7 level", or when Road to live holds a wp7 quickstart. Not for Joomla (joomla-template-readiness), EmDash, classic themes, page builders or WooCommerce, and never for all templates at once.
---

# Bring a named WordPress block theme to the JA Diner WP7 level

A **conductor**: it owns the order, never the procedures. Each fix is a command the verdict names, a section of
`quickstart-contract`, `tdsr`, the quickstart tools README, the vendored `tracy-wordpress-theme` skill, or a
`tracy-dev` skill; this skill points there and does not restate them. The verdict
(`apps/tracy-web/src/lib/template-readiness/verdict.js`) is the single source of truth, the same one Road to live reads,
and it judges WordPress with the same pieces as Joomla. The reference is JA Diner WP7 (`quickstart/ja-diner/wp7`),
the role JA Boxing plays for Joomla: on its pinned release, every fix this skill names is the one it needs.

## 0. Start

- **One template, named by the preparer** (slug such as `ja-diner`, or tag `quickstart/ja-diner/wp7`). Always hand the
  commands the `/wp7` tag: a slug that also has a Joomla release resolves to the Joomla one (`latestPin`). No name, a
  list, or "all": ask for one name.
- **Fix map current.** `node --test .agents/skills/wordpress-template-readiness/scripts/test/*.test.mjs` is green; a red
  `fix-map` test means the registry has a code this skill does not map yet: add it to
  [`references/fix-map.md`](references/fix-map.md) first.
- **In scope.** Run the scope check on the release's own files (the verdict's local mode downloads them into its cache,
  section 1):
  ```bash
  node .agents/skills/wordpress-template-readiness/scripts/scope.mjs \
    --database <cache>/<slug>-wp7-database-<v>.sql.gz --webroot-archive <cache>/<slug>-wp7-webroot-<v>.tar.gz
  ```
  Exit 1 is a STOP, reported with its line: not a block theme, a page builder, WooCommerce (a later stage), or content
  in several languages (the WordPress capture refuses it).
- `RUN`: a working folder outside the repository that survives a restart. It holds every verdict, `fix-log.md`, the
  eye review and `readiness-report.md`.
- **The demo.** Most fixes read a site restored from the pinned version that nobody has written to: restore it with
  `tracy-dev:restore`. Its address is the one its `siteurl` names; a demo that answers only on a local port is read with
  `--host-header` where a command offers it.
- **Published templates only warn.** A release already on Design inspiration reads `warn` where a new one would be held.
  Fix it in the next version; never take the live release off Design inspiration or delete it.
- The stop points of the skills called here are passed without waiting: naming the template is the go. Only the stops
  in section 5 stop the run.

## 1. Read the verdict

```bash
node apps/tracy-web/scripts/template-readiness.mjs quickstart/<slug>/wp7 --json > "$RUN/verdict-<n>.json"
```

Local mode (the default) reads the pinned release from GitHub and runs the Customize your site and Design system
checks on this machine. The exit code is `exitCodeOf`: 0 when every piece is `done` or `not-judged`; 1 when one warns
or holds; 2 unreadable, read the message. The pin read is the working tree's `apps/tracy-web/src/quickstarts.json`.
DEMO-1 and the preview door health are server facts, judged on /ops after deploy.

**`not-judged`** is a state of its own: on WordPress the `cowork-pin` piece reads `write-doors-not-judged` because the
WordPress write step does not exist yet. It is not a pass and not a hold; there is nothing to fix, and it counts as
green for the exit code. Never try to turn it `done`.

## 2. Loop until green

1. Take the **first piece in verdict order** whose state is neither `done` nor `not-judged`:
   `todo` or `warn` is the one to fix; `blocked` waits for the piece in `blockedBy`; `checking` means read again.
   Skip `kit-not-approved` and `kit-approval-stale`: the approval comes at green.
2. Its fix is the piece's `fix` in the verdict JSON. Look its code up in
   [`references/fix-map.md`](references/fix-map.md), which says how that fix runs on WordPress, or that it is a stop.
   For `coverage-holes`, `coverage-labels` and `coverage-judge`, and for a red release sweep check (`heights`,
   `scheme`), find the symptom in [`references/coverage-holes.md`](references/coverage-holes.md) section 6 (recipes
   H1 to H8: business words in a pattern, a fact in a `core/html` band, a priced item name, cut-out pictures, a
   template part, a style guide sample, text with no door, a markup change that moves heights) and follow its recipe.
3. Run it. Rebuilding the kit goes through [`references/kit-rebuild.md`](references/kit-rebuild.md) (a `build` wipes
   the five hand-declared hidden fields, and needs the database to read pages as sections).
4. Append one line to `$RUN/fix-log.md`: piece, code, what changed, where (theme, contract folder, kit, tool, release).
5. Read the verdict again (section 1). The step is done when that piece's code changed; the same code after a fix
   means the fix or the check is wrong: diagnose it (`mattpocock-skills:diagnosing-bugs`) before a second try.

A stop (section 5) ends the loop for its piece only: record it, then carry on with the next piece whose fix does not
wait on it, so the report names every stop at once. While a stop is open nothing is released or pinned.

**A theme release is the last resort.** Before any fix that needs a new theme version (the theme overlay or the demo
content) and with it a new contract version, look for a door in the flow: a contract, kit or accept door that lands
beside the release. An accept with its reason (`reach-accepts.json`, `gap-accepts.json`, `accepted` in
`content-coverage.json`), a hidden kit field the write step acts on ([`references/kit-rebuild.md`](references/kit-rebuild.md)),
or the planner or write step hiding or retargeting the slot. Only when none exists, release the theme. A new version
costs a contract version, a claude-cowork plugin release and a pin (procedures W1 and W3 of
[`references/fix-map.md`](references/fix-map.md)), so it is never the first move.

**Fix the tool, not the template**, when the fault would hit any WordPress theme (a capture rule, a kit reader, a
measure, the logo write path): test first, in this repository, in the same PR when small. Never hand-edit one
template's contract or kit to get past a rule.

**Where a theme fix lives.** The overlay `packages/cms/tracy-wordpress-theme/overlays/<theme>/`; `src/<theme>/` is
generated from it (`node scripts/build-wordpress-theme.mjs`, `--check` is the gate), and the theme's `AGENTS.md` names
the generated files never to edit. Contracts live in `packages/cms/tracy-wordpress-quickstart/contracts/<slug>/wp7/`.

**Demo baseline.** Measure it on the untouched demo with `--base` (no tracy-web needed), record it beside the contract
and commit it, last in a round that cuts a new version.

## 3. Eye review

When the verdict is green but for the kit approval: [`references/eye-review.md`](references/eye-review.md). Every page
of the kit at 1440 and 390, reviewed against the fault list V1 to V12. Fix what a theme release or a tool fix can;
write the rest in `$RUN/readiness-report.md` with cropped pictures. A fix here means a new version: back to section 2.

## 4. Green

[`references/green.md`](references/green.md): record the kit approval, read the verdict once more (exit 0), release
when a version was cut, write the changes note, pass the open-source scan before every push, open the PR with the fix
log and merge on green CI.

## 5. Stops

The run stops only on a fault whose fix needs a person or the port's dossier. Report: the piece, the code, its params,
what was tried, and who must act. W1 and W3 are procedures, not stops: a changed contract goes through a claude-cowork
WordPress plugin release (`release-wordpress.mjs`) and then `scripts/pin-wordpress-quickstart.mjs`, both named in
[`references/fix-map.md`](references/fix-map.md) and run at green ([`references/green.md`](references/green.md)). The
stops are W2, W4 and W5 of that page; in short:

| Stop | Who must act |
|---|---|
| Out of scope (section 0): not a block theme, page builder, WooCommerce, several languages | the preparer |
| W2: `content-map-missing-lists` on a released profile | nobody: cut the next version (W4) and capture it with `--posts` |
| W4: a fix release without the port's dossier on this machine, or a new sweep difference needing design input ([`references/patch-release.md`](references/patch-release.md) is the release itself) | the person who ran the port, the port owner |
| W5: a coverage hole with no WordPress door ([`references/coverage-holes.md`](references/coverage-holes.md)); read-only design data; a piece with no `fix`; a Joomla-only code on WordPress; a blocked command | the plugin or port owner, as the fix map says |

## 6. Done

Every piece `done` or `not-judged` on the last verdict, the kit approved, the PR open with the fix log, the readiness
report's faults and every stop listed. Report to the preparer: the version, the PR, the faults left, the stops and who
must act on each.
