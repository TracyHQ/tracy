---
name: joomla-template-readiness
description: Bring one named Joomla template (T3 or T4) to the JA Boxing level, so the Website opportunity flow builds a clean customer site from it. Reads the template readiness verdict, runs the existing skill or tool that fixes the first red piece, loops until every piece is green, reviews every page by eye, then approves the kit, releases, pins and opens the PR. Use when asked to "make template X ready", "bring X to the JA Boxing level", or when Road to live holds a Joomla template. Not for WordPress or EmDash, and never for all templates at once.
---

# Bring a named Joomla template to the JA Boxing level

A **conductor**: it owns the order, never the procedures. Each fix is a section of `quickstart-contract`, `tdsr`, the
template kit README or a command the verdict names; this skill points there and does not restate them. The verdict
(`apps/tracy-web/src/lib/template-readiness/verdict.js`) is the single source of truth, the same one Road to live reads.
The reference is the latest JA Boxing release: on it, this skill finds nothing to fix.

## 0. Start

- **T3 and T4 differ in markup.** The framework is the `framework` of the release's row in `template-profiles.json`
  (`lib/kit-framework.js`), never guessed from the name. T3 prints the page classes (`itemid-<id>`) on `html` and leaves
  `body` bare; T4 prints `item-<id>` on `body`. A selector you declare in the kit names a container, never the page element.
- **One template, named by the preparer** (slug such as `ja-diner`, or tag `quickstart/ja-diner/j6`). No name, a list,
  or "all": ask for one name. Framework other than T3 or T4, or content in several languages: STOP (`quickstart-contract`
  section 1).
- `RUN`: a working folder outside the repository that survives a restart. It holds every verdict, `fix-log.md`, the
  eye review and `readiness-report.md`.
- **Published templates only warn.** A release already on Design inspiration reads `warn` where a new one would be held.
  Fix it in the next version; never take the live release off Design inspiration or delete it.
- The stop points of the skills called here are passed without waiting: naming the template is the go. Only the stops
  in section 5 stop the run.

## 1. Read the verdict

```bash
node apps/tracy-web/scripts/template-readiness.mjs <template> --json > "$RUN/verdict-<n>.json"
```

Local mode (the default) reads the pinned release from GitHub and runs the Customize your site and Design system checks
on this machine. Exit 0: every piece `done`. Exit 1: a piece holds or warns. Exit 2: unreadable, read the message.
The pin read is the one in the working tree's `apps/tracy-web/src/quickstarts.json`, so a version pinned on the branch
is the one judged. DEMO-1 and the preview door health are server facts, judged on /ops after deploy.

## 2. Loop until green

1. Take the **first piece in verdict order** whose state is not `done`:
   `todo` or `warn` is the one to fix; `blocked` waits for the piece in `blockedBy`; `checking` means read again.
   Skip `kit-not-approved` and `kit-approval-stale`: the approval comes at green.
2. Its fix is the piece's `fix` in the verdict JSON (`text`, and `command` or `skill` when one exists), from the one
   fix registry (`apps/tracy-web/src/lib/template-readiness/fixes.js`). Before running it, check
   [`references/fix-map.md`](references/fix-map.md): a code listed there is a stop (section 5).
3. Run that section or command. Rebuilding the kit goes through [`references/kit-rebuild.md`](references/kit-rebuild.md)
   (a `build` wipes the five hand-declared hidden fields).
4. Append one line to `$RUN/fix-log.md`: piece, code, what changed, where (template release, contract, kit, pin, tool).
5. Read the verdict again (section 1). The step is done when that piece's code changed; the same code after a fix
   means the fix or the check is wrong: diagnose it (`mattpocock-skills:diagnosing-bugs`) before a second try.

**A template release is the last resort.** Before any fix that needs a new template version (the template source or the
demo content), look for a door in the flow: an accept with its reason (`reach-accepts.json`, `gap-accepts.json`,
`accepted` in `content-coverage.json`), a hidden kit field the write step acts on (`references/kit-rebuild.md`), or the
planner or write step hiding or retargeting the slot. Only when none exists, release the template. JA Diner 1.0.5: five
phones printed outside `tel:` links went to `reach-accepts.json` with their reason, not into a 1.0.6.

**Fix the tool, not the template**, when the fault would hit any template (a capture rule, a kit reader, a measure, a
door reader): test first, in this repository, in the same PR when small. Never hand-edit one template's contract or
kit to get past a rule; the next capture or build wipes it and the next template trips again.

**Demo baseline.** Its fix names two commands: measure on a site freshly restored from the pinned version that nobody
has written to (`--base <its address>` reads it on this machine, as `demo-measures.mjs --base` does; no tracy-web
needed), then record the file beside the contract and commit it. Measure it last in a round that cuts a new
version, so it measures the version that ships.

## 3. Eye review

When the verdict is green but for the kit approval: [`references/eye-review.md`](references/eye-review.md). Every page
of the kit at 1440 and 390, reviewed against the fixed fault list V1 to V12. Fix what a template release or a tool fix
can; write the rest in `$RUN/readiness-report.md` with cropped pictures. A fix here means a new version: back to
section 2.

## 4. Green

[`references/green.md`](references/green.md): record the kit approval in the JA Boxing format, read the verdict once
more (exit 0), pin and release through `quickstart-contract` sections 8 and 9, write the changes note, open the PR with
the fix log. The Cowork pin moves only to a plugin version already released with every door.

## 5. Stops

The run stops only on a code whose fix needs a person or another repository's release. Report: the piece, the code,
its params, what was tried, and who must act.

| Code or case | Who must act |
|---|---|
| `cowork-release-needed`; STAB-1 with no released plugin carrying the contract | claude-cowork release (name the doors or the contract) |
| Coverage hole of class `unknown` (`quickstart-contract` 7b step 5) | a person reads the evidence |
| The next pack's shape differs from the released one (`quickstart-contract` 7c) | a person decides |
| A design-system fault in read-only design data (`tdsr`) | the design system owners |
| A piece that is not `done` and carries no `fix` | a person; add the registry entry after |
| A hook or permission blocks a command | the preparer; never work around it |

## 6. Done

Every piece `done` on the last verdict, the kit approved, the release pinned in both quickstart lists, the PR open with
the fix log and the readiness report's faults listed. Report to the preparer: the version, the PR, the faults left.
