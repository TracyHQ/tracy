---
description: The revision run of a draft, which re-runs the writer and the write step only for the pages and blocks a plan edit changed, on a site an earlier build already wrote, and the restore of the build before it. Covers the impact rule, the kept words and replies, the write delta, the build result, what the caller passes, what a restore cannot undo and what is unproven.
sources:
  - packages/wo/website-opportunities/domain/revision-impact.mjs
  - packages/wo/website-opportunities/domain/revision-write-delta.mjs
  - packages/wo/website-opportunities/domain/revision-model-replay.mjs
  - packages/wo/website-opportunities/domain/build-result.mjs
  - packages/wo/website-opportunities/domain/page-writer-context.mjs
  - apps/tracy-web/src/step-chain-draft-revision.js
  - apps/tracy-web/src/step-chain-draft-write-revision.js
  - apps/tracy-web/src/step-chain-draft-journal.js
  - apps/tracy-web/src/step-chain-draft-restore.js
---

# The revision run of a draft

The customer changes the approved plan after a build (renames a service, changes the phone, holds a name). A
revision run writes the new plan revision onto the site the earlier build wrote. It calls the model only for what
changed and writes only the operations whose effect changed. The build before it stays restorable. Ticket #599 of
spec #577. The write step it reuses is [draft-write-step.md](draft-write-step.md); the tests run on the memory site
of [draft-write-memory-site.md](draft-write-memory-site.md).

## The design in ten lines

1. Every finished draft run keeps a **build result** (`tracy-build-result/v1`): plan, profile, kit, the writer's words,
   the kept model replies, the write record and the ops record.
2. A run whose brief has `rebuildFrom: <build ref>` is a **revision run**; the steps are the same draft steps.
3. The plan step reads that build and refuses one it cannot revise, with a typed stop before any model call.
4. The **impact** is a pure diff of the writer requests (`pageWriterUser`, the same message the writer sends) of the
   old and the new plan, per page and per block, plus the held texts found in the kept words.
5. The writer is called only for affected pages, and asked only for the affected blocks' fields. Every other page
   keeps its words with no call. Every page is still checked, alone and as a whole site.
6. Pictures and icons go through `keptModel`: a request asked before is answered from the kept reply.
7. The whole write order is built and checked again; the **write delta** compares each operation's effect hash with
   the previous build's and keeps the same ones.
8. The write runs only the changed operations, on a record of its own (revision and write count in every apply id),
   through doors that journal the value before each write.
9. That journal is the **restore**: it writes every place back, read back and resumable.
10. Invariant, tested per edit: a revision run leaves the memory site equal to a full build of the new plan on a new
    blank site.

## The impact rule (`revisionImpactOf`)

The reasons a block is written again: `data:<item id>` (its data names an item whose facts changed), `data:held`,
`data:order`, `type`, `label`, `shows`, `rows`, `fields`, `block:added`, `block:removed`. A page is written whole for
`site:language`, `site:name`, `site:voice`, `site:seo`, `page:name`, `page:added`, `blocks`. Reasons that are not in
the request: `held_text_in_copy` (a kept word names a text the new profile holds), `copy_missing`, `prompt_changed`
(the writer prompt's hash differs), `previous_copy_missing`. A build with no kept copy writes every page again
(`full: true`), said in the step record (`recorded.rebuild`).

The result: `{schema, full, write: [{page, reasons}], reuse: [page], blocks: [{page, block, reasons}], unaffected,
removed}`. A plan that takes a page off (`removed` not empty) stops at the plan step.

## The write delta (`writeDeltaOf`)

Each operation of the new write plan is compared by key with the ops record of the previous build:

| Class | Means | The write |
|---|---|---|
| `same` | same effect hash | skipped (`report.kept`) |
| `rewrite` | effect changed | written again in place (`record.patch`, `contract.apply`, `site.identity`, or the record it made) |
| `added` | new key | made as in a build |
| `removed`, `dropped` | gone from the plan | stop `revision_needs_removal` (unproven `record_removal_no_door`) |
| `orphaned` | a picture upload nothing shows any more | its file stays; no door needed |

An upload is compared without its alt text. A change spreads along references: an operation that names a changed
picture (`ref:<op>`) or a changed record (`record:<op>`, for `module.position`) is written again too.

## The run record of a revision

A revision gets its own record: `{mark (of the new plan), base, seq, baseIds, ids, paths, pending, done, kept, rewrite,
undo}`. Its apply ids start with the build ref `<runId>:r<revision>:w<seq>` (a first build keeps the plain run id), so the earlier build, or the same revision before a
restore, is never mistaken for it. `write_record_stale` still protects: the earlier build's record never runs the new
plan, and a revision's record never runs another revision. Guards, the redo once rule and resume are those of the
write step, on the partial order.

## The restore (`restoreBuild`)

`restoreBuild({build, previous, doors, record, runId})` writes back the record columns, module assignments, contract
slots (one apply) and site identity the revision wrote over. Each place has its own apply id
(`<run>:restore:w<seq>:<place>`), is read back, is tried twice, then stops `restore_failed`; the restore's record
resumes a crash. It returns `{status, left: {uploads, assignments}, current}`: `current` is the previous build with
its write count past the revision's, the build a next revision starts from.

**What a restore cannot undo** (a typed stop, noRerun, before any door):

- a record the revision made (a new item, page or copy): `restore_needs_removal`, no door removes a record;
- a contract slot the revision took out: same stop;
- a place whose value before names a text the revision's profile holds: `restore_shows_held_text`; the hold wins.

A file the revision uploaded stays on the site, shown by nothing; it is listed in `left.uploads`.

## What the caller passes

The caller (the build chat, `apps/tracy-web/src/build-draft/`) owns these; this ticket does not edit it.

- `ctx.brief.rebuildFrom`: the ref of the build the site holds (`value.build.ref` of the earlier run's write step).
  The brief's `draftId` and `plan` name the approved new revision as for any draft run.
- `deps.builds = { read(ref, ctx), keep(build, ctx) }` in the draft wiring. `keep` stores every finished build
  result; without it a run reports `build.kept: false` and nothing can be revised later. `read` without a store stops
  `previous_build_doors_missing`.
- `deps.draftWrite.record`: a fresh record per run (a revision must not get the earlier build's record; it would stop
  `write_record_stale`).
- After a restore, the caller stores `current` under its ref, so the next revision starts from it.

## Typed stops

At the plan step, before any model call: `previous_build_missing`, `previous_build_unreadable`,
`previous_build_unfinished`, `previous_build_other_plan`, `previous_build_other_kit`, `previous_build_doors_missing`,
`revision_needs_removal`. At the write step: `revision_needs_removal`, `write_record_stale`, `redo_failed`. At the
restore: `restore_not_a_revision`, `restore_needs_removal`, `restore_shows_held_text`, `restore_failed`.

## The edit matrix

`node apps/tracy-web/test/draft-revision-matrix-print.mjs` prints, for each edit, the pages written and kept, the
model calls, the delta, the door writes, whether the site equals a fresh full build, and the restore. Edits: rename,
remove and add a service, change the phone, change the site name, hold a reviewer, hold the business name, reorder
services, change nothing, rename a page. Change nothing calls no model and no door.

## Unproven without a real site

- Every result above is on the memory site; no real Joomla site has run a revision or a restore.
- No measured door removes a record or puts a slot back, so removal stops typed.
- A plan edit of an item's label reaches the writer only if the profile carries the new name; a chat rename that
  edits only `items[].label` was not traced through the build chat.
- The held name matcher does not catch a shortened form a block renders (a reviewer shown as first name and initial).
- The undo journal stores values before the revision, which may hold a text later held; the build result keeps them.

## Tests

`apps/tracy-web/test/draft-revision-*.test.mjs` (acceptance, matrix, guards, crash sweep) and
`packages/wo/website-opportunities/test/domain-revision-*.test.mjs` (impact, delta, kept words and replies).
