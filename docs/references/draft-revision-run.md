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
(`revision-text-forms.mjs`: case, accents, character references read until stable, percent decoding, tags, slug), and
in the cheap forms of `revision-old-forms.mjs`: a number (no letter, fewer than seven digits) only as a whole number
token (`$42` names `42` and `42.00`, never `2042`, `4.42` or `10:42`), a phone (seven digits or more) by its digits in
any run of phone characters with a leading trunk zero dropped, an address without its scheme, `www.` and closing slash,
and any text with apostrophes and hyphens dropped and `ß` read as `ss`. A block that quotes one is written again;
search texts that quote one send the page whole. A value the blocks of the same entry still show is not old (a plan
label changed while the item's name, shown by its data view, stays): no visible change, no rewrite.

The scan is defence in depth: the page copy check already refuses a writer that names a value its request does not
carry. Not searched, as only a writer past that check reaches them: plurals, one word of a longer name, a phone or a
time spelled out in words.

The rule for short or common values: an old value with fewer than four letters and digits, or one word of letters (a
price `5`, a name that is a common word), also matches where the words mean something else. Correctness wins over
cost: the block is written again all the same, with the reason `old_text_in_copy:short`, so a record says the match
was weak.

**Kept model replies.** A kept picture labelling or icon reply that names an old value or a held text is not replayed
(`impact.staleReplies`): its request is asked again.

**Whole pages.** A page sent to the writer is written whole, even when only one of its blocks changed. The writer
request of a call that asks some blocks leaves the others out (`pageWriterUser` keeps only blocks with asked fields),
so the writer would see another page than in a full build and write other words; the edit matrix's cross writer
shows it. The call count is the same; the cost is the output words of the unchanged blocks. Asking only the affected
blocks needs three changes outside this ticket's files: `pageWriterUser` (`page-writer-request.mjs`) keeps every block
of the page in a call that asks some (their `data`, `shows` and `rows` as context, and their current words as a
read-only `kept` map, no `fields`); `callPage` (`page-writer-page.mjs`) passes the kept words; and the writer prompt
(`page-writer-prompt.md`, frozen for #600) describes that `kept` map (words of this page that stay: read them, never
repeat or rewrite them) and stops saying `blocks` holds only blocks with fields to write. Then `reuseOf` returns
`{values, seo, ask}` for a page whose reasons are block level only; `writePages` already asks only `ask`.

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
wrote, shapes, undo}`. `wrote` is kept by every draft write, a first build too (`wroteDoors`): the hash of the value
last written at each place, by name (`record:<kind>:<id>:<column>`, `assignment:<module id>`, `slot:<key>`,
`identity:<field>`), carried from build to build; a revision's journal keeps it too, saved before the call.

**The form a place is compared in** (`revision-place-value.mjs`). A site stores some values its own way: Joomla's
Registry re-encodes a params, attribs or images column (key order, escaped slashes, spacing) and adds keys it
defaults, on Tracy's write and again whenever the owner saves the record. The write step's read back accepts that, so
every later comparison mirrors the read back of the place's kind exactly, no looser:

| Place | Read back | Compared as |
|---|---|---|
| record column, module pages | `readSent` (`holds`) | a value starting `{` or `[` that parses is JSON: an object on the keys Tracy wrote only (`state.shapes` keeps them), a list by length and element, a leaf as text (`4000` and `"4000"` alike, missing and `""` alike); any other text exactly |
| contract slot | `readContract` | exactly (a removed slot reads null) |
| site identity field | `readIdentity` | as text |

`draft-revision-place-value.test.mjs` proves the record form agrees with `readSent` on a table of cases. What no
comparison sees: a key the owner adds by hand to a JSON column Tracy wrote (the site adds keys too, and the two cannot
be told apart). Tracy sends that column whole when it writes it again, so such a key is lost on the next revision that
writes the column.

**Edits made outside Tracy.** At every write over a place, first touch or a resume after a crash, the value the place
holds must be one Tracy left there: what the previous build wrote (`previous.state.wrote`), what this run wrote
(`state.wrote`, and the earlier values it sent to a place it writes twice, `undo.sent`), the value about to be
written, or the value before this run journaled. Any other value means the owner edited it outside Tracy: the run
stops `site_changed_outside` (noRerun), naming the place, never the text, before writing it. A place no build wrote is
free on first touch. Swept: a crash before every door call, the owner editing that very place (a column, a value
inside its JSON, a module's pages, a slot, the site identity), then a resume: every case stops and the owner's value
stays (`draft-revision-crash-owner.test.mjs`, plain and JSON normalising site).

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
(`builds.keep(current, ctx, {expected: build.ref})`), so it is the build the site holds. It returns `{status, left:
{uploads, assignments}, current}`. Read backs compare in the form of the place (above).

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

## Abandoning a crashed revision (`abandonRun`)

A revision marks itself as the site's unfinished run right before its first door call (`builds.begin`) and the mark
ends when its build is kept (`builds.end`). While it is marked, any other revision stops at the plan step, before any
model call, with `previous_run_unfinished` naming the run (no more false `site_changed_outside` blaming the owner for
Tracy's half write). Two ways out:

- resume the run (same run id, its record): it ends done;
- `abandonRun({run, runRecord, doors, record, runId, builds, ctx})`: writes back every place the run wrote over from
  its own undo journal, with the rules of a restore (a place must hold what the run wrote or its value before, else
  `site_changed_outside` and the owner's value stays; a value before that names a held text stops
  `restore_shows_held_text`), crash safe (its own record `{abandon, done}`, apply ids `<runId>:abandon:<place>`), then
  ends the mark. The site holds the current build again; the current build does not change.

What an abandon cannot roll back, a typed stop before any door: a run that sent a make (a new item or page; the
journal keeps `undo.making` before the call, so a make whose id was never saved still counts) or took a slot out:
`restore_needs_removal`, as for a restore; such a run can only be resumed. Files the run uploaded stay
(`left.uploads`).

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
- `deps.builds = { read(ref, ctx), keep(build, ctx, {expected}), current(ctx), begin(run, ctx), unfinished(ctx),
  end(runId, ctx), forget(ref, ctx, {reason}) }` in the draft wiring, one store per site:
  - `keep` stores a finished build result AND makes its ref the build the site holds, ONLY when the site holds
    `expected` now (the ref the run started from, null for a first build): compare and set, atomic in the store. On
    a mismatch it stores nothing and answers `false`; the run stops `previous_build_not_current` and its build is not
    the site's build. Without `keep` a run reports `build.kept: false` and nothing can be revised later;
  - `current(ctx)` answers the ref of the build the site holds (null when none); a revision whose `rebuildFrom` is
    another ref stops `previous_build_not_current` before any model call, and every run checks it again right before
    its first door call; a store with no `read` or no `current` stops `previous_build_doors_missing`; a `read` that
    throws stops `previous_build_unreadable`;
  - `begin({runId, from}, ctx)` marks the site's one unfinished revision run, compare and set: another run marked
    answers `false` (the run stops `previous_run_unfinished` before any door), the same run id answers true (a
    resume); `unfinished(ctx)` answers the mark or null; `end(runId, ctx)` clears it (the write step after `keep`,
    `abandonRun` after its write back);
  - `forget(ref, ctx, {reason})`: the store keeps the ref and the reason only (below, stored data after a hold).
  A FULL build (no `rebuildFrom`) on a site whose `current` is not null stops at the plan step, before any model call
  (`site_already_built`): it would make every record twice. A site reset to blank is a site whose store answers
  `current` null (a new store, or the caller clears it when it restores the blank site).
  The contract has no measured place on the site for a marker of the current build, so the store is the only record
  of it. **The caller must serialise runs per site** (one run writing at a time). The marks above catch a second run
  that reaches the site while one is unfinished, and `keep` refuses a build over another; if the caller does not
  serialise, a run can still be stopped after it wrote (its `keep` refused): the site then holds part of it, it stays
  the unfinished run, and it must be resumed or abandoned.
- `deps.draftWrite.record`: a fresh record per run (a revision must not get the earlier build's record; it would stop
  `write_record_stale`). `deps.draftWrite.stored(order)` may give `sha256` per entry; otherwise the step opens the
  bytes through `openStored` to hash them.
- A restore: `restoreBuild({build, doors, record, runId, builds: deps.builds, ctx})`; it keeps the restored build
  itself (compare and set over the revision's ref).
- An abandon: `abandonRun({run, runRecord, doors, record, runId, builds: deps.builds, ctx})` (above).

**Stored data after a hold.** A build is stored with its profile read without what it holds (`withoutWithheld`: the
held quote, its author and any held fact are not stored); the hold list (`profile.withheld`) stays, because every
later revision and restore enforces the hold from it. A build whose restore is refused (it would show a held text, or
remove a record) ends its line: the builds before it were reachable only through that restore, and each that names a
held text is forgotten (`builds.forget`), leaving the ref and the reason. After a hold revision the whole store names
the held person in one place only, the hold list (`draft-revision-held-store.test.mjs`). What this does not reach:
the run records of the earlier runs (`deps.draftWrite.record`) and the step chain's own records, which the caller
stores; the undo journal never keeps a held value (`HELD_BEFORE`).
- The write step's value may carry `flags` (also in `recorded.flags`): `[{code: 'held_file_left_on_site', places:
  [{op: 'held:<12 hex>', file}]}]`: a held item's picture an earlier build uploaded is still a public file of the
  site, and no measured door deletes it. The caller must show it to the owner, with the file path.

## Typed stops

At the plan step, before any model call: `site_already_built`, `previous_run_unfinished`,
`previous_build_doors_missing`, `previous_build_not_current`,
`previous_build_missing`, `previous_build_unreadable` (any part a revision reads has another shape than
`buildResultOf` writes, or the store threw), `previous_build_unfinished`, `previous_build_other_plan`,
`previous_build_other_kit`, `revision_needs_removal`. At the write step: `previous_build_not_current` (checked again
before the first door call, and when `keep` finds another build), `previous_run_unfinished`, `revision_needs_removal`,
`site_changed_outside`, `write_record_stale`, `redo_failed`. At the abandon: `abandon_not_unfinished`,
`previous_build_not_current`, `restore_needs_removal`, `restore_shows_held_text`, `site_changed_outside`,
`abandon_failed`. At the restore: `previous_build_doors_missing`,
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
- Joomla's own forms of a JSON column are modelled by the memory site (`draft-revision-site-forms.mjs`: keys added,
  slashes escaped, spacing); other forms a real site may take (an HTML filter rewriting markup on save) are not
  measured, and the write step's read back would refuse them first.
- A plan edit of an item's label reaches the writer only if the profile carries the new name; a chat rename that
  edits only `items[].label` was not traced through the build chat.
- Short forms of a held person beyond first name and initial, or initial and last name (a nickname), are not matched.
- The build result keeps the profile's `withheld` part, which names what is held: a revision needs it.

## Tests

`apps/tracy-web/test/draft-revision-*.test.mjs` (acceptance, matrix, guards, frame, held texts, outside edits and
current build, crash sweeps, abandon, owner edit after a crash, JSON normalising site, place forms, site build and
racing runs, held data in the store, old value guard) and `packages/wo/website-opportunities/test/domain-revision-*.test.mjs` (impact, old values,
text forms, old value forms, stored build shape, delta, kept words and replies).
