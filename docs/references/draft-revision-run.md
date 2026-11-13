---
description: The revision run of a draft, which re-runs the writer and the write step only for the pages and blocks a plan edit changed, on a site an earlier build already wrote, and the restore of the build before it. Covers the impact rule, the kept words and replies, the write delta, the build result, what the caller passes, what a restore cannot undo and what is unproven.
sources:
  - packages/wo/website-opportunities/domain/revision-impact.mjs
  - packages/wo/website-opportunities/domain/revision-write-delta.mjs
  - packages/wo/website-opportunities/domain/revision-model-replay.mjs
  - packages/wo/website-opportunities/domain/build-result.mjs
  - packages/wo/website-opportunities/domain/revision-old-values.mjs
  - packages/wo/website-opportunities/domain/revision-text-forms.mjs
  - packages/wo/website-opportunities/domain/page-writer-context.mjs
  - apps/tracy-web/src/step-chain-draft-revision.js
  - apps/tracy-web/src/step-chain-draft-write-revision.js
  - apps/tracy-web/src/step-chain-draft-journal.js
  - apps/tracy-web/src/step-chain-draft-restore.js
  - apps/tracy-web/src/step-chain-draft-steps-late.js
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
3. The plan step checks the ref is the build the site holds now, reads that build and refuses one it cannot revise
   or a revision that takes something off the site, with a typed stop before any model call.
4. The **impact** is a pure diff of the writer requests (`pageWriterUser`, the same message the writer sends) of the
   old and the new plan, per page and per block, plus the held texts and the old values found in the kept words.
5. The writer is called only for affected pages, each written whole. Every other page keeps its words with no call.
   Every page is still checked, alone and as a whole site.
6. Pictures and icons go through `keptModel`: a request asked before is answered from the kept reply, unless that
   reply names an old value or a held text.
7. The whole write order is built and checked again; the **write delta** compares each operation's effect hash with
   the previous build's and keeps the same ones.
8. The write runs only the changed operations, on a record of its own (revision and write count in every apply id),
   through doors that journal the value before each write and refuse to write over an edit made outside Tracy.
9. That journal is the **restore**: it writes every place back, read back and resumable, unless a place was edited
   outside Tracy since.
10. Invariant, tested per edit: a revision run leaves the memory site equal to a full build of the new plan on a new
    blank site.

## The impact rule (`revisionImpactOf`)

The reasons a block is written again: `data:<item id>` (its data names an item whose facts changed), `data:held`,
`data:order`, `type`, `label`, `shows`, `rows`, `fields`, `block:added`, `block:removed`, `old_text_in_copy`,
`old_text_in_copy:short`. A page is written for `site:language`, `site:name`, `site:voice`, `site:seo`, `page:name`,
`page:added`, `blocks`. Reasons that are not in the request: `held_text_in_copy` (a kept word names a text the new
profile holds), `old_text_in_copy` on a page (its search texts quote an old value), `copy_missing` (no kept words, or
not every field the previous request asked), `prompt_changed` (the writer prompt's hash differs),
`previous_copy_missing`. A build with no kept copy writes every page again (`full: true`), said in the step record
(`recorded.rebuild`).

**Old values quoted in kept words** (`revision-old-values.mjs`). A writer may quote in one block what it saw in another
block of the page (a service named in the hero's paragraph). That block's own request does not change when the
service is renamed, so the request diff alone would keep its words and the site would keep the old name. So every
value the revision changed or took away is listed by a stable path: each plan fact, item label, page name, profile
fact and item field, the site name and each leaf of every writer request's data view (`data:<id>`). Every kept word
(writer fields and search texts) is scanned for those old texts, on every leaf and in every form
(`revision-text-forms.mjs`: case, accents, character references read until stable, percent decoding, tags, slug). A
block that quotes one is written again; search texts that quote one send the page whole.

The rule for short or common values: an old value with fewer than four letters and digits, or one word of letters (a
price `5`, a name that is a common word), also matches where the words mean something else. Correctness wins over
cost: the block is written again all the same, with the reason `old_text_in_copy:short`, so a record says the match
was weak.

**Kept model replies.** A kept picture labelling or icon reply that names an old value or a held text is not replayed
(`impact.staleReplies`): its request is asked again.

**Whole pages.** A page sent to the writer is written whole, even when only one of its blocks changed. The writer
request of a call that asks some blocks leaves the others out (`pageWriterUser` keeps only blocks with asked fields),
so the writer would see another page than in a full build and write other words; the edit matrix's cross writer
shows it. The call count is the same; the cost is the output words of the unchanged blocks. The cheaper path (ask
some blocks, but show the others as context) needs `page-writer-request.mjs` to keep those blocks in a revision call.

The result: `{schema, full, write: [{page, reasons}], reuse: [page], blocks: [{page, block, reasons}], unaffected,
removed, removals, staleReplies}`. `removals` lists what the revision takes off the site: pages, blocks (removed, or
whose data list is emptied: such a block is no longer placed) and items the previous build made a record for (an
operation of a kind that makes a record keyed `<kind>:<item id>`; a review quote makes none). Any removal stops the
plan step (`revision_needs_removal`) before any model call.

## The write delta (`writeDeltaOf`)

Each operation of the new write plan is compared by key with the ops record of the previous build:

| Class | Means | The write |
|---|---|---|
| `same` | same effect hash | skipped (`report.kept`) |
| `rewrite` | effect changed | written again in place (`record.patch`, `contract.apply`, `site.identity`, or the record it made) |
| `added` | new key | made as in a build |
| `removed`, `dropped` | gone from the plan | stop `revision_needs_removal` (unproven `record_removal_no_door`) |
| `orphaned` | a picture upload nothing shows any more | its file stays; no door needed |

An upload is compared without its alt text, and with the sha256 of its stored bytes (the write step of the draft
steps adds it to every stored entry, opening the bytes when `stored(order)` does not give it): new bytes under the same
stored id upload the picture again. The write report's `delta.orphaned` lists every FILE the site keeps that nothing
shows any more (the previous record's paths the new record no longer names, a picture taken off or uploaded again
with other bytes); `delta.unused` the upload operations no longer needed. A change spreads along references: an operation that names a changed
picture (`ref:<op>`) or a changed record (`record:<op>`, for `module.position`) is written again too.

## The run record of a revision

A revision gets its own record: `{mark (of the new plan), base, seq, baseIds, ids, paths, pending, done, kept, rewrite,
wrote, undo}`. `wrote` is kept by every draft write, a first build too (`wroteDoors`): the sha256 of the value last
written at each place, by name (`record:<kind>:<id>:<column>`, `assignment:<module id>`, `slot:<key>`,
`identity:<field>`), carried from build to build.

**Edits made outside Tracy.** On the first touch of a place, a revision run compares what the place holds with what
the previous build wrote there (`previous.state.wrote`). Another value means the owner edited it outside Tracy since:
the run stops `site_changed_outside` (noRerun), naming the place, never the text, before writing it. A place this run
already touched (a resume after a crash) is in the journal and is not compared again, so a half written place is
never taken for an outside edit (crash sweeps with a record that keeps only what `save` stored). A place no build
wrote is not compared.

**Held texts.** What the revision holds reaches the write as `previous.write.hold` (`{texts, ids}`, set by the write
step of the draft steps: held people with their short forms, the held business name, the ids of the held items). A key
of the previous record that names a held text is not carried; `baseIds` keeps it masked; every key, ref and path of
the report is masked (`maskHeld`: `held:<12 hex>`). The undo journal never keeps a value before that names a held text:
`HELD_BEFORE` stands in. A held person also matches by first name and last initial (`Wenna C.`, as a reviews block
signs a review) and by first initial and last name. Its apply ids start with the build ref `<runId>:r<revision>:w<seq>` (a first build keeps the plain run id), so the earlier build, or the same revision before a
restore, is never mistaken for it. `write_record_stale` still protects: the earlier build's record never runs the new
plan, and a revision's record never runs another revision. Guards, the redo once rule and resume are those of the
write step, on the partial order.

## The restore (`restoreBuild`)

`restoreBuild({build, previous?, doors, record, runId, builds, ctx})` writes back the record columns, module
assignments, contract slots (one apply) and site identity the revision wrote over. Before any door it checks that
`build` is the build the site holds (`builds.current(ctx)`). Each place is first read: a value that is neither what the
revision wrote (`state.wrote`) nor its value before (a crashed attempt of this restore already wrote it back) was
edited outside Tracy, and the restore stops `restore_site_changed`, naming the place. Each place has its own apply id
(`<run>:restore:w<seq>:<place>`), is read back, is tried twice, then stops `restore_failed`; the restore's record
resumes a crash. At the end the previous build, its write count past the revision's, is kept again
(`builds.keep(current)`), so it is the build the site holds. It returns `{status, left: {uploads, assignments},
current}`.

**What a restore cannot undo** (a typed stop, noRerun, before any door):

- a build the site no longer holds: `previous_build_not_current`;
- a record the revision made (a new item, page or copy): `restore_needs_removal`, no door removes a record;
- a contract slot the revision took out: same stop;
- a place whose value before names a text the revision's profile holds, on any leaf and in any form, or kept as
  `HELD_BEFORE`: `restore_shows_held_text`; the hold wins;
- a place edited outside Tracy since the revision: `restore_site_changed`.

A file the revision uploaded stays on the site, shown by nothing; it is listed in `left.uploads`. A module that had no
assignment before is written back with an empty page list (`"[]"`), listed in `left.assignments`: that value is not
measured on a real site (below).

## Removal: the door Part 1 has not measured

A revision that takes a page, a block, a block's whole list or an item off the site, and a restore of a revision that
made a record, stop typed. The contract measures writes only: `docs/references/ai-quickstart-contract.md` and
`scripts/ai-quickstart/copy-proof.mjs` set `published: 1` (modules, menu items, categories) and `state: 1` (articles)
when a record is made, and set `menuids` to a page list or `"[0]"`; no proof writes `published` or `state` to `0` on a
record that exists, nor `menuids` to an empty list, and none reads what a visitor then sees. So removal stays a typed
stop, and the memory site does not model a published state. The question for Part 1:

> On the blank site restored on a real Joomla with the Claude Cowork plugin, does `content.update {kind, id, fields:
> {published: 0}}` (modules, menu items, categories) and `{state: 0}` (articles; contacts: `published: 0`) on a record
> the build made take it off every page a visitor sees, with `content.get` reading the value back? And does
> `content.update {kind: "moduleAssignment", id, fields: {menuids: "[]"}}` leave the module on no page (no assignment
> row, or one that lists none)? Which value does the plugin accept for "no page", and does it warn
> `Module assignment drift` for a store record written in place?

With those measured, the forward case (`revision_needs_removal`) and the restore of a revision that made records
(`restore_needs_removal`) can unpublish and unassign, journaled and read back like every other place.

## What the caller passes

The caller (the build chat, `apps/tracy-web/src/build-draft/`) owns these; this ticket does not edit it.

- `ctx.brief.rebuildFrom`: the ref of the build the site holds (`value.build.ref` of the earlier run's write step).
  The brief's `draftId` and `plan` name the approved new revision as for any draft run.
- `deps.builds = { read(ref, ctx), keep(build, ctx), current(ctx) }` in the draft wiring, one store per site:
  - `keep` stores every finished build result AND makes its ref the build the site holds now; without it a run
    reports `build.kept: false` and nothing can be revised later;
  - `current(ctx)` answers the ref of the build the site holds (null when none); a revision whose `rebuildFrom` is
    another ref stops `previous_build_not_current` before any model call; a store with no `read` or no `current`
    stops `previous_build_doors_missing`; a `read` that throws stops `previous_build_unreadable`.
  The contract has no measured place on the site for a marker of the current build, so the store is the only record
  of it.
- `deps.draftWrite.record`: a fresh record per run (a revision must not get the earlier build's record; it would stop
  `write_record_stale`). `deps.draftWrite.stored(order)` may give `sha256` per entry; otherwise the step opens the
  bytes through `openStored` to hash them.
- A restore: `restoreBuild({build, doors, record, runId, builds: deps.builds, ctx})`; it keeps the restored build
  itself.
- The write step's value may carry `flags` (also in `recorded.flags`): `[{code: 'held_file_left_on_site', places:
  [{op: 'held:<12 hex>', file}]}]`: a held item's picture an earlier build uploaded is still a public file of the
  site, and no measured door deletes it. The caller must show it to the owner, with the file path.

## Typed stops

At the plan step, before any model call: `previous_build_doors_missing`, `previous_build_not_current`,
`previous_build_missing`, `previous_build_unreadable` (any part a revision reads has another shape than
`buildResultOf` writes, or the store threw), `previous_build_unfinished`, `previous_build_other_plan`,
`previous_build_other_kit`, `revision_needs_removal`. At the write step: `revision_needs_removal`,
`site_changed_outside`, `write_record_stale`, `redo_failed`. At the restore: `previous_build_doors_missing`,
`previous_build_not_current`, `previous_build_missing`, `restore_not_a_revision`, `restore_needs_removal`,
`restore_shows_held_text`, `restore_site_changed`, `restore_failed`.

## The edit matrix

`node apps/tracy-web/test/draft-revision-matrix-print.mjs` prints, for each edit and three writers, the pages written
and kept, the model calls, the delta, the door writes, the site against a fresh full build, and the restore. The
writers: `plain` (its words depend on its own block), `cross` (it quotes in a long paragraph the first item another
block of the page shows) and `cross-new` (the same, with new words on every call). For `cross-new`, which cannot give
a full build's words, the row counts the old values (changed or taken away, shown nowhere in the new plan) the site
still shows. Edits: the ten of `draft-revision-edits.mjs` and the twenty six of `draft-revision-edits-more.mjs` (one
fact or field at a time, on the plan or the profile only, blocks and lists cut). The matrix test asserts every edit,
with the `plain` and the `cross` writer, equals a fresh full build. Change nothing calls no model and no door.

## Left as they are

- A kept later page is not written again when an earlier page now repeats one of its sentences: the impact reads
  requests and old values, not repetition across pages.
- An edit and then its inverse call the writer again (the second revision's request differs from the first's).

## Unproven without a real site

- Every result above is on the memory site; no real Joomla site has run a revision or a restore.
- No measured door removes a record or puts a slot back, so removal stops typed (the question above).
- An outside edit is only seen at a place a build wrote; a place no build wrote holds what the blank site had.
- A crashed revision leaves the site half written while the store still names the previous build as current; another
  revision from that build would compare with its ops record, and an operation it keeps would keep what the crashed
  run wrote. Resume the crashed run (its record) before anything else.
- A plan edit of an item's label reaches the writer only if the profile carries the new name; a chat rename that
  edits only `items[].label` was not traced through the build chat.
- Short forms of a held person beyond first name and initial, or initial and last name (a nickname), are not matched.
- The build result keeps the profile with its `withheld` part, which names what is held: a revision needs it.

## Tests

`apps/tracy-web/test/draft-revision-*.test.mjs` (acceptance, matrix, guards, frame, held texts, outside edits and
current build, crash sweep) and `packages/wo/website-opportunities/test/domain-revision-*.test.mjs` (impact, old values,
text forms, stored build shape, delta, kept words and replies).
