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
  - apps/tracy-web/src/step-chain-draft-journal-record.js
  - apps/tracy-web/src/step-chain-draft-restore.js
  - apps/tracy-web/src/step-chain-draft-write-back.js
  - apps/tracy-web/src/step-chain-draft-steps-late.js
  - apps/tracy-web/src/step-chain-draft-site-check.js
  - apps/tracy-web/src/step-chain-draft-rerun.js
  - apps/tracy-web/src/step-chain-draft-run-records.js
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
5. The writer is called only for affected pages; a page whose only change is in some blocks asks those blocks alone,
   the others sent as read only context and kept byte for byte. Every other page keeps its words with no call.
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
    blank site (for a writer that quotes another block, equal with the words the revision kept).

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

**Only the changed blocks** (`reuseOf`, `step-chain-draft-revision.js`). A page sent to the writer only because some
of its blocks changed (its one reason is `blocks`) asks those blocks alone: `reuseOf` returns `{values, ask}` (`ask`:
the block ids of `impact.blocks` on that page) and the first call of the page asks only their fields, plus the page's
search texts. The other blocks of the page ride along as read only context: `pageWriterUser` adds
`kept: {note, blocks: [{id, type, label, data, shows, rows?, words: {key: value}}]}`, the plain note (`KEPT_NOTE`)
saying in the message itself not to repeat, rewrite or write any of their keys, so the writer reads the whole page as
in a full build. No prompt file changed: the frozen prompt asks one value per field `key` of `blocks`, and a kept
block has no `fields`. The code keeps their words byte for byte: `callPage` takes only the asked keys from the answer,
whatever the writer says for a kept key. A kept block that quotes an old value is itself a changed block (the old
value scan above), so a kept block never carries a changed or removed value. A page sent for any other reason (the
site, its name, its search texts quoting an old value, a held text, missing words, another prompt, a new page) is
written whole. The page's own check, the owner echo check and the whole site check still read the full page, kept and
new words together: a new word repeating a kept one is rewritten; a kept word that fails the check on its own (it
passed when it was written, so only a new check could) goes back like any failing field, the only way a kept word
changes.

The edit matrix (`draft-revision-matrix.test.mjs`) counts the blocks the writer calls asked (`blocksAsked`): an edit
inside one block asks that block only. A writer that quotes in one block what another block shows (the matrix's cross
writer) may keep a quote of a value that is still true where a full build would quote another (`reorder services`,
`swap the service a block shows`): with exactly the kept words, the site equals a full build of the revision
(`equalKept`); the plain writer's site equals a full build as it is (`equal`).

The result: `{schema, full, write: [{page, reasons}], reuse: [page], blocks: [{page, block, reasons}], unaffected,
removed, removals, staleReplies}`. `removals` lists what the revision takes off the site: pages, blocks (removed, or
whose data list is emptied: such a block is no longer placed) and items the previous build made a record for (an
operation of a kind that makes a record keyed `<kind>:<item id>`; a review quote makes none). The plan step no longer
stops on them: the write step hides or unassigns what the revision takes off ("Taking things off a site" below), and
the run record counts them (`revision.removals`).

## The write delta (`writeDeltaOf`)

Each operation of the new write plan is compared by key with the ops record of the previous build:

| Class | Means | The write |
|---|---|---|
| `same` | same effect hash | skipped (`report.kept`) |
| `rewrite` | effect changed | written again in place (`record.patch`, `contract.apply`, `site.identity`, or the record it made) |
| `added` | new key | made as in a build |
| `removed` | gone from the plan | hidden or put on no page after the writes ("Taking things off a site"); a place written in place stops `revision_needs_removal` before any door |
| `dropped` | an address a record written in place no longer gets | stop `revision_needs_removal` (door `contract.removes` for a slot), before any door |
| `orphaned` | a picture upload nothing shows any more | its file stays, for the restore that shows it again |

An upload is compared without its alt text, and with the sha256 of its stored bytes (the write step of the draft
steps adds it to every stored entry, opening the bytes when `stored(order)` does not give it): new bytes under the same
stored id upload the picture again. The write report's `delta.orphaned` lists every FILE the site keeps that nothing
shows any more (the previous record's paths the new record no longer names, a picture taken off or uploaded again
with other bytes); `delta.unused` the upload operations no longer needed. A change spreads along references: an operation that names a changed
picture (`ref:<op>`) or a changed record (`record:<op>`, for `module.position`) is written again too.

## The run record of a revision

A revision gets its own record: `{mark (of the new plan), base, seq, baseIds, ids, paths, pending, done, kept, rewrite,
hidden, wrote, shapes, cleared, undo}`. `hidden` maps each operation a revision's act took off (a hide, an unassign)
to its record (`{kind, id, door}`), carried from build to build ("Showing a record again"). `wrote` is kept by every draft write, a first build too (`wroteDoors`): the hash of the value
last written at each place, by name (`record:<kind>:<id>:<column>`, `assignment:<module id>`, `slot:<key>`,
`identity:<field>`), carried from build to build; a revision's journal keeps it too, saved before the call.

**The form a place is compared in** (`step-chain-draft-place-value.js`). A site stores some values its own way: Joomla's
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
be told apart). No revision, restore or abandon sends such a column whole, so that key stays (below, the end of
"Abandoning a crashed revision").

**Edits made outside Tracy.** At every write over a place, first touch or a resume after a crash, the value the place
holds must be one Tracy left there: what the previous build wrote (`previous.state.wrote`), what this run wrote
(`state.wrote`, and the earlier values it sent to a place it writes twice, `undo.sent`), the value about to be
written, or the value before this run journaled. Any other value means the owner edited it outside Tracy: the run
stops `site_changed_outside` (noRerun), naming the place, never the text, before writing it. A place no build wrote is
free on first touch. Swept: a crash before every door call, the owner editing that very place (a column, a value
inside its JSON, a module's pages, a slot, the site identity), then a resume: every case stops and the owner's value
stays (`draft-revision-crash-owner.test.mjs`, plain and JSON normalising site).

**Held texts.** What the revision holds reaches the write as `previous.write.hold` (`{texts, ids}`, set by the write
step of the draft steps: held people in the forms of `heldPersonFormsOf`, the held business name, the ids of the held items). A key
of the previous record that names a held text is not carried; `baseIds` keeps it masked; every key, ref and path of
the report is masked (`maskHeld`: `held:<12 hex>`). The undo journal never keeps a value before that names a held text:
`HELD_BEFORE` stands in. A held person also matches by first name alone under the reading's rule (not a first name that
is also a common word, such as `Will`), by first name and last initial (`Wenna C.`, as a reviews block signs a review)
and by first initial and last name (`heldFormsOf` reads `heldPersonFormsOf`, `domain/held-person-forms.mjs`). Its apply ids start with the build ref `<runId>:r<revision>:w<seq>` (a first build keeps the plain run id), so the earlier build, or the same revision before a
restore, is never mistaken for it. `write_record_stale` still protects: the earlier build's record never runs the new
plan, and a revision's record never runs another revision. Guards, the redo once rule and resume are those of the
write step, on the partial order.

## The restore (`restoreBuild`)

`restoreBuild({build, previous?, doors, record, runId, builds, ctx})` writes back the record columns, module
assignments, contract slots (one apply) and site identity the revision wrote over. Before any door it checks that
`build` is the build the site holds (`builds.current(ctx)`). Each place is first read: a value that is neither what the
revision wrote (`state.wrote`) nor its value before (a crashed attempt of this restore already wrote it back) was
edited outside Tracy, and the restore stops `restore_site_changed`, naming the place. So does a place that holds what
the revision wrote but, at a JSON key the revision took out (`undo.prior` less the revision's own shape), a value that
is neither a blank holder nor the value the key held before the revision: writing the key back would write over the
owner's (`step-chain-draft-restore-taken.js`). A column the revision emptied (`state.cleared`) must still be blank.
Every place is checked before the first write (and again right before its own), so such a stop writes nothing. Each place has its own apply id
(`<run>:restore:w<seq>:<place>`), is read back, is tried twice, then stops `restore_failed`; the restore's record
resumes a crash. At the end the previous build, its write count past the revision's, is kept again
(`builds.keep(current, ctx, {expected: build.ref})`), so it is the build the site holds. It returns `{status, left:
{uploads, assignments}, current}`. Read backs compare in the form of the place (above).

**What a restore cannot undo** (a typed stop, noRerun, before any door):

- a build the site no longer holds: `previous_build_not_current`;
- a revision run still unfinished on the site (`builds.unfinished`): `previous_run_unfinished`;
- a make whose id the revision never saved (`pending`), or a made record of a kind no hide covers:
  `restore_needs_removal`;
- a contract slot the revision took out: same stop;
- a place whose value before names a text the revision's profile holds, on any leaf and in any form, or kept as
  `HELD_BEFORE`: `restore_shows_held_text`; the hold wins;
- a place edited outside Tracy since the revision: `restore_site_changed`.

A record the revision made is hidden (a made module put on no page), after the places; its key is in `left.hidden`. A
file the revision uploaded is deleted once its dry run names no record but the ones this undo takes off (those it
made, and those the revision showed again that the undo hides or puts on no page again: a dry run counts unpublished
and trashed records too); see "Deleting an upload". A file another record names, or one the site refused to delete,
stays, listed in `left.uploads` and with why in `left.kept`.
A module that had no assignment before
is written back with an empty page list (`"[]"`, the measured "no page"), listed in `left.assignments`.

## Abandoning a crashed revision (`abandonRun`)

A revision marks itself as the site's unfinished run (`builds.begin`) after every check that can stop without a write
(the write plan's guards, `revision_needs_removal`, `door_not_available`, the owner checks of its acts, which read the
site) and before its first door write; the mark ends when its build is kept (`builds.end`). A run that still stops
having written nothing (the journal sets and saves `state.touched` before every door write, and it is unset) has its
mark cleared at once (`step-chain-draft-site-check.js`), so the next revision runs; so is a mark an earlier attempt
of the same run left (it died before its first write), when this attempt also stops before writing. A run that wrote
keeps its mark, and so does a run whose first write was refused twice: the journal set `touched` before the call, and
whether the refused call acted is unknown, so it is resumed or abandoned. While it is marked, any other revision stops at the plan step, before any
model call, with `previous_run_unfinished` naming the run (no more false `site_changed_outside` blaming the owner for
Tracy's half write). Two ways out:

- resume the run (same run id, its record): it ends done;
- `abandonRun({run, runRecord, doors, record, runId, builds, ctx})`: writes back every place the run wrote over from
  its own undo journal, with the rules of a restore (a place must hold what the run wrote or its value before, else
  `site_changed_outside` and the owner's value stays; a value before that names a held text stops
  `restore_shows_held_text`), crash safe (its own record `{abandon, done}`, apply ids `<runId>:abandon:<place>`), then
  ends the mark. The site holds the current build again; the current build does not change.

An abandon hides the records the run made and deletes the files it uploaded, as a restore does. What it cannot roll
back, a typed stop before any door: a make whose id the run never saved (`pending`: the record may exist and no id
names it) or a slot it took out: `restore_needs_removal`, as for a restore; such a run can only be resumed.

A run marked from a build the site no longer holds (a restore moved the site on, or a store answered `begin` without
comparing the build) can never be kept, so it can never be resumed to its end. Its abandon answers `stale: true`: it
writes back what it can, as above, and when no door can undo the run it still clears the mark, writing nothing, and
reports what stays in `left.unrestored` (`{code, made, removed}`). A site is never locked by a run nobody can finish.

A JSON column (`attribs`, `images`, `params`) is never sent whole by a revision, a restore or an abandon: what the
site holds now is the base, and only the keys Tracy owns (the shape it wrote) are set; every key the owner added, and
everything inside a value Tracy wrote as an empty object, stays (`step-chain-draft-owned-keys.js`). An object Tracy
owned and no longer sends goes with only Tracy's keys in it: an owner key inside it stays. A list is written whole
(its rows have no keys to merge by): when a row Tracy wrote holds a key Tracy never owned, a revision stops
`site_changed_outside` at that column, before its write (writes of earlier operations of the run stand, and are rolled
back by the abandon), rather than lose the owner's key. A revision that
would write over a key the owner set stops `site_changed_outside`; a blank holder at a key it newly owns (an empty
text, null, an empty object or list, as an admin save stores a field nobody filled) is not the owner's value.

**What a revision no longer sends** (`step-chain-draft-journal-record.js`). The end state of a revision is a full build
of the same plan plus the owner's own keys. A JSON key the previous build owned (`state.shapes`) that the revision no
longer sends is taken out; a column the previous build wrote on a record a build made, that the operation written again
whole no longer sends, is emptied (`''`, what a new record holds there), kept in `state.cleared` and NOT in
`state.wrote` (the record no longer claims a value there; a later write over it, a restore or an abandon finds it
blank, else stops on the owner's value), and a column with no empty value (an id, a state, a type) stops
`revision_needs_removal`. Taking either off over an owner's edit stops `site_changed_outside`. `undo.prior` keeps the
shape the previous build owned at each such place, so a restore and an abandon put every key and column back exactly
(`draft-revision-dropped.test.mjs`).

## Taking things off a site

The doors (`siteDoors`, measured on plugin 0.24.85, [ai-quickstart-contract.md](ai-quickstart-contract.md) "Door
measurements"): `hide` (`content.update` `published: 0`, an article `state: 0`: the record stays, shown on no page,
its address 404, and publishing it again brings it back as it was), `unassign` (`moduleAssignment` `menuids: "[]"`,
the one "no page" value) and `deleteMedia` (a picture under `images/`, with a dry run naming the records that use it).
`deleteRecord`, `revertDelete` and `contract.removes` answer `DOOR_NOT_AVAILABLE`: nothing is ever deleted.

| Case | Door | What happens |
|---|---|---|
| an item taken off the plan: its article, or a page's article | `hide` | the article reads `state: 0` |
| its row in a list block | none needed | the block's copy is written again whole, without the row |
| a page taken off: its menu item | `hide` | the menu item reads `published: 0` |
| a category or a contact no longer made | `hide` | `published: 0` |
| a block or a section taken off, a block's list emptied (a copy, a library block) | `unassign` | `menuids: "[]"` |
| a store module no page shows any more | `unassign` | `"[]"`, the blank site's own value; its slots keep their words, shown on no page (`left_on_no_page`) |
| the tab position of a module put on no page | none needed | `left_on_no_page` |
| a picture no longer used | none | its file stays (`delta.orphaned`): the restore of the previous build shows it again, and no door brings a deleted file back |
| a contract slot, a record patch or the identity no longer written, or an address a rewritten in place operation no longer gets | `contract.removes` (slot) or none | typed stop `revision_needs_removal` before any door, naming the door |
| a record an earlier revision hid, a module it put on no page, that this revision needs again | `content.update` | shown again: written again in place, same id ("Showing a record again") |
| restore or abandon: a record the revision made | `hide` (a module: `unassign`) | after the places are written back; `left.hidden` |
| restore or abandon: a record the revision hid, a module it put on no page | `content.update` | written back from the journal like any place: published again with its earlier value, its pages back |
| restore or abandon: a file the revision uploaded | `deleteMedia` after its dry run | deleted when the dry run names no record but those the undo hid; else kept, with why |
| restore or abandon: a make whose id was never saved | none | typed stop `restore_needs_removal` |
| restore or abandon: a slot the revision took out | `contract.removes` | typed stop `restore_needs_removal` |

The acts of a revision (`step-chain-draft-removal.js`, `step-chain-draft-removal-run.js`) run after its writes, each
through the journal (`journaledDoors` `hide`, `unassign`), so `state.undo` keeps what the place held before, and
`state.removal` keeps every act with the operations it settles (`{acts: [{key, door, kind, id, ops}], done}`). Owner
safety is the write's: every act is checked before any door writes, and again, on the same columns, right before it
runs: every place of the
record a build or this run wrote must hold what was written (or, after a crash, the hidden column 0), else
`site_changed_outside` and nothing is hidden over the edit. Only a record some build on this site made is hidden; a
store module is only put back on no page, the value the blank site ships. An act is read back, tried twice, then
`redo_failed` (noRerun); the same record resumes. A door client with no `hide` or `unassign` stops
`door_not_available` before any door. The report says what was hidden (`flags`: `hidden_not_deleted`,
`on_no_page_not_deleted`, `left_on_no_page`). A restore or an abandon checks a made record the same way
(`restore_site_changed`, `site_changed_outside`).

### Showing a record again

A hide keeps the record and its id (`state.hidden`, `step-chain-draft-show-again.js`). When a later revision adds back
an operation whose record a revision took off (`writeDeltaOf` answers it `added`; the run record still holds its id),
the record is shown again, never made a second time: before any door write it is checked as its act was (`checkAct`:
every column a build wrote holds what was written, the hidden column 0; an owner edit stops `site_changed_outside`,
nothing written), then its key is in `rewrite`, so it is written again in place through `content.update` with every
field a new record gets (an article `state: 1`, a menu item, a category or a contact `published: 1`, as measured: the
page answers again) and the new plan's content; a module's pages are written again by its own assign operation. These
writes are journaled like any other, so the restore and the abandon of this revision write the values before back (the
hidden column 0, the empty page list) and the record is off the site again. The report flags `shown_again` with the
operation keys.

### Deleting an upload

`media.delete` as measured on plugin 0.24.85 (`step-chain-draft-media-delete.js`):

- The dry run answers `{ok, deleted: {path, files: [{path, size, sha256}]}, totalBytes, undoCopyUnderCap, usedIn,
  usedInScope}`. `usedIn` is one row per record naming the file, `{type, id, title}`, `type` plural (`articles`,
  `modules`, `menuItems`, `templateStyles`), unpublished and trashed records included; nobody: `[]`. A row of another
  type or without a type and an id keeps the file (`used_in_unread`), as does any other answer.
- A real delete of a file other records use succeeds: the door refuses nothing. So no delete is sent without a dry run
  of the same call, read in the measured shape, that names no record but the ones this undo takes off. The door client
  never answers a dry run from its journal: a resumed restore reads `usedIn` again.
- A path with no file (a missing folder too) answers `write_failed`, dry run or not, and the same apply id called again
  answers `write_failed` too: there is no not-found code and no replay answer. So an error code never says whether the
  file is there: it is read by `media` (the public file, null when absent) before the dry run and again after a failed
  delete. Absent is done (deleted by an earlier attempt, or never there). Present after a failure keeps the file with
  the code; unread (no `media` door, or it failed) keeps it with `presence_unread` or `delete_unknown`. A file is never
  counted deleted on an error alone.
- Not a picture, or outside `images/`: `bad_params`, kept with that code.
- Not measured: `apply.revert` of a delete. Nothing relies on it.

A plan revision with removals now spends its writer calls before the write step can stop on a case with no door; in
the florist matrix none reaches that stop. The memory site models the three doors as measured
(`write-order-memory-undo.mjs`).

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
    another ref stops `previous_build_not_current` before any model call, and every run checks it again before its
    first door write; a store with no `read` or no `current` stops `previous_build_doors_missing`; a `read` that
    throws stops `previous_build_unreadable`;
  - `begin({runId, from}, ctx)` marks the site's one unfinished revision run, compare and set on the site's build
    and the mark, atomic: it answers true only when the site's build is `from` now and no other run is marked (the
    same run id again is a resume); otherwise `false` and nothing marked, and the run stops before any door
    (`previous_build_not_current` when the build moved on, else `previous_run_unfinished`). Two runs that both read
    the same build: the first to begin wins. On Postgres the head row read `for update` holds both checks; `unfinished(ctx)` answers the mark or null; `end(runId, ctx)` clears it (the write step after `keep`,
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
- **A run on a built site** (`step-chain-draft-rerun.js`, `startRun` of `build-draft-rebuild-wiring.js`):
  `startRun({accountId, email, siteKey, draftId, build, brief})` answers `{started: true}` or
  `{refusal: {code, status}}` (`previous_run_unfinished` 409 when another run is the site's unfinished one; the same
  `brief.buildRun` again is its resume). The run goes through the run frame (`sites/brief-build.js` `rerun`): the
  site's brief row goes back to `queued` from `applied` or `failed` only (compare and set,
  `step-chain-draft-rerun-row.js`), keeping its up mark, and the run's id is `brief.buildRun`. Same setup hold,
  same progress on the row, the typed stops above kept on it unchanged. Why it could not start before: the frame
  starts a run only from a `queued` row, a built site's row ends `applied`, and the only way back (`restartBrief`)
  takes a `failed` row and drops its up mark, so the frame would have waited for an install that never comes.
- **The run record outside the process** (`step-chain-draft-run-records.js`): `deps.runRecords = {append(runId,
  state, ctx), read(runId, ctx), close(runId, ctx)}`, one store for every site, each call naming `ctx.siteKey`.
  `read` answers `{state, closed}` (the newest state appended) or null; `append` answers false once closed; `close`
  marks a run that ended done. The contract every store passes: `apps/tracy-web/test/step-chain-draft-run-records-contract.mjs`
  (`runRecordContract`, a list of `[name, check(store)]`). `runRecordOf(runId, ctx)` (`runRecordReader`) answers an
  unfinished run's `{state}` for an abandon. What the build chat must provide for Postgres: a table keyed
  `(site_key, run_id)` with the JSON state of each append (only the newest is read), a `closed_at`, and the site's
  creation time as `site_builds` keeps it (a site made again does not read the old site's runs); `append` refuses
  once `closed_at` is set, in the same statement. Passed as `buildEngine.runRecords` in `app.js`.
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
  site: a revision deletes no file (its restore would need it, and no door brings a deleted file back). The caller must
  show it to the owner, with the file path. The write step's value also carries the removal flags (`hidden_not_deleted`,
  `on_no_page_not_deleted`, `left_on_no_page`, with the operation keys) and `shown_again`.

## Typed stops

At the plan step, before any model call: `site_already_built`, `previous_run_unfinished`,
`previous_build_doors_missing`, `previous_build_not_current`,
`previous_build_missing`, `previous_build_unreadable` (any part a revision reads has another shape than
`buildResultOf` writes, or the store threw), `previous_build_unfinished`, `previous_build_other_plan`,
`previous_build_other_kit`. At the write step: `previous_build_not_current` (checked again
before the first door write, and when `keep` finds another build), `previous_run_unfinished`, `revision_needs_removal`,
`door_not_available`, `site_changed_outside`, `write_record_stale`, `redo_failed`, `read_back_mismatch` (it names
lengths, never text; a status column's short values, `state`, `published`, `home`, `access`, `showtitle`, as they
are). At the abandon: `abandon_not_unfinished`,
`previous_build_not_current`, `restore_needs_removal`, `restore_shows_held_text`, `site_changed_outside`,
`abandon_failed`. At the restore: `previous_build_doors_missing`,
`previous_build_not_current`, `previous_run_unfinished` (a revision still unfinished on the site: resume or abandon
it first), `previous_build_missing`, `restore_not_a_revision`, `restore_needs_removal`,
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
- No door deletes a record or puts a slot back: a record is hidden, a module put on no page, and a place written in
  place that a revision no longer writes stops typed ("Taking things off a site").
- What a visitor sees of a hidden record and a module on no page is measured on JA Boxing only; a hidden menu item with
  child items, and a hidden category that still holds a published article, are not measured.
- `apply.revert` of a media delete is not measured; nothing relies on it. A media delete of a picture a page still uses
  succeeds (measured): the restore never sends one without a readable dry run first.
- An outside edit is only seen at a place a build wrote; a place no build wrote holds what the blank site had.
- Joomla's own forms of a JSON column are modelled by the memory site (`draft-revision-site-forms.mjs`: keys added,
  slashes escaped, spacing, and `alternatingSite`: another encoding on every save, so a restore that compared the text
  it wrote exactly would fail, `draft-revision-restore-reencode.test.mjs`); other forms a real site may take (an HTML filter rewriting markup on save) are not
  measured, and the write step's read back would refuse them first.
- Short forms of a held person beyond first name and initial, or initial and last name (a nickname), are not matched.
- The build result keeps the profile's `withheld` part, which names what is held: a revision needs it.

## Tests

`apps/tracy-web/test/draft-revision-*.test.mjs` (acceptance, matrix, guards, frame, held texts, outside edits and
current build, crash sweeps, abandon, owner edit after a crash, JSON normalising site, place forms, site build and
racing runs, held data in the store, old value guard) and `packages/wo/website-opportunities/test/domain-revision-*.test.mjs` (impact, old values,
text forms, old value forms, stored build shape, delta, kept words and replies).
