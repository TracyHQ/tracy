---
description: The write step of a draft run, which plans door operations from the write order, guards them, then runs, reads back, resumes and redoes them on a blank site. Covers the operations, the doors interface, the conflicts, the read back and the run record; the guards are in draft-write-guards.md.
sources:
  - packages/wo/website-opportunities/domain/draft-write-plan.mjs
  - packages/wo/website-opportunities/domain/draft-write-guards.mjs
  - packages/wo/website-opportunities/domain/draft-write-coverage.mjs
  - packages/wo/website-opportunities/domain/draft-write-html-rest.mjs
  - packages/wo/website-opportunities/domain/draft-write-plan-hides.mjs
  - apps/tracy-web/src/step-chain-draft-write.js
  - apps/tracy-web/src/step-chain-draft-write-kinds.js
  - apps/tracy-web/src/step-chain-draft-write-check.js
  - apps/tracy-web/src/step-chain-draft-write-step.js
---

# The write step of a draft run

The last step of a run built from an approved build draft (#597). It takes the checked write order
(`tracy-write-order/v1`, [write-order.md](write-order.md)) and writes it to a blank site made from the AI quickstart
([ai-quickstart-contract.md](ai-quickstart-contract.md), "Copies and blocks written in place" and "The blank site
contract"). It has three parts:

| Part | File | What it does |
|---|---|---|
| Plan | `packages/wo/website-opportunities/domain/draft-write-plan.mjs` (`writePlanOf`) | Pure. Turns the order and the kit into ordered door operations, then holds them to every guard before any door is called. |
| Run | `apps/tracy-web/src/step-chain-draft-write.js` (`runDraftWrite`) | Runs the operations through injected doors (`step-chain-draft-write-kinds.js`), reads back everything each call changed (`step-chain-draft-write-check.js`), resumes a crashed run, and redoes a failing operation once. |
| Step | `apps/tracy-web/src/step-chain-draft-write-step.js` (`draftWriteStep`) | The `write` step of `step-chain-draft-steps.js`. With no doors injected (`deps.draftWrite`), it stops with `write_not_ready_for_draft`; with no write order, with `write_order_missing`. It passes the names of the icon library the icons step chose from (`deps.iconLibrary`) as `iconKeys`. Its value is `{report, order, plan, build, recorded}`; a failure's `error.value` is `{report, order, plan, recorded}` (see "The step's value"). |

## The plan

`writePlanOf(order, aiq, {stored, withheld, approved, iconKeys})` returns `{schema: 'tracy-draft-write-plan/v1',
mainMenu, order, entries, ops, skipped, conflicts, unproven, controls}`. Every text an operation sends is in NFC
(`inNfc`, `draft-write-length.mjs`), so the door counts a letter and its accent once.

- Every operation names the order entries it writes (`entries`) and the contract rules it follows (`rules`).
- Every value names its entry or its rule.
- `draftWriteCoverage(order, plan)` proves that each entry is written by exactly one operation, skipped with a
  reason, or lost a conflict (`in = written + skipped + conflicted`, none unexplained, none written twice). An entry
  is **written** when an operation carries it (its words reach the site at one place at least), even when it lost
  another place; **conflicted** when it lost a place and no operation carries it; **skipped** otherwise, with its
  reason. `planCountsOf(plan)` gives the same three counts from the plan alone, each entry once, with `in` and
  `entries` (`plan.entries`, `entryCountsOf(order)`).
- **What an entry is.** `in` counts every entry of the order, not only its field entries: the field entries of every
  place, its pictures (one per frame) and icons, one menu entry and three SEO entries (title, description, share
  image) per page, and the look (`look.accent`, and `look.accentDark` when the order has one). A field entry is one
  entry however many places it fans out to (a fact written at several places, an entry that wins one place and loses
  another). So a count of the order's field entries alone is smaller than `written + skipped + conflicted`: on the
  revision fixture of #599, 186 field entries, and 256 entries in all (186 fields, 35 pictures, 10 icons, 6 menu
  entries, 18 SEO entries, 1 look) = 137 written + 95 skipped + 24 conflicted. `conflicts` lists each entry that lost
  a place once (an entry written elsewhere included); `plan.conflicts` has one row per losing entry and place.
- The plan stops before any operation when the order fails `checkWriteOrder` (`order_invalid`), when the kit has no
  blank contract slots (`kit_missing`: every slot guard would turn off), and when a created record is of a kind the
  write has no shape for (`record_kind_unsupported`: only `menuItem`, `article`, `category` and `contact` are made).

Coverage of the JA Boxing florist fixture (`node --test` of `domain-draft-write-plan.test.mjs` prints it): 280
entries in (210 fields, 35 pictures, 10 icons, 6 menu, 18 SEO, 1 look), 142 written, 124 skipped, 14 conflicted, none
unexplained, none written twice; 64 operations. `domain-draft-write-length.test.mjs` proves the sum on the guarded
fixture.

Run order:

| Kind | Writes | Rule |
|---|---|---|
| `picture.upload` | the stored bytes of a picture or icon, or the initials drawn in the frame | pictures come from stored bytes |
| `menuItem.create` (home) | the home page, before every other record | contract point 3 |
| `category.create`, `article.create`, `contact.create` | the records the pages list or show | `created:<kind>` |
| `menuItem.create` | the other pages of the main menu, then the main menu's non-page items, then the items of every other menu | `menu` of the placement |
| `module.copy` | a copy of a library module with its values, rows cut, unfilled list rows and empty buttons taken out; containers first | `placement: copy` |
| `library.create` | a Tracy library block's rendered HTML as a new module | `library.position` |
| `module.assign` | the pages of a copy or of an in-place module (`[0]` for every page) | `assign` |
| `module.position` | a container's tab position, `tracy-tabs-<container id>` | `holds.position` |
| `contract.apply` | one apply per in-place record, through the blank site contract | `one_apply_per_record` |
| `record.patch` | the setting of an in-place record that hides an empty button | `hides.setting` |
| `site.identity` | the site name, description and page title setting | `fact:name` |
| `look.accent` | nothing: the accent is not written (see unproven); its entries are skipped | `look` |

Each copy and library module carries `ordering`, its block's rank on its first page, so modules sharing a position
draw in the page order. Each copy and created record carries a mark (the note of a module, the alias of a record),
which a resumed run uses to find it again.

- A menu block on the main menu writes no menu items of its own: its entries are the page items
  (`menu_item_is_page_item`); a label in other words than the page's menu label is a conflict the page item wins
  (`kept: 'page_item'`). Two items of another menu for one page make one item: the same label is `address_shared`,
  another label a conflict (`kept: 'first'`).
- The category a list shows is titled after the list page of its page type (the page whose recipe's main block
  lists it), never the home page.
- Two entries with other words for one place: the entry of the record's own subject page wins (a service page's own
  paragraph over the home page teaser of it); otherwise the first one. `plan.conflicts` has one row per losing entry
  and place, however often it lost it: `{entry, by, record, kept: 'own_page' | 'first' | 'page_item', written}`, ids
  only, never the words; `written: true` when the entry is written at another place (a fact or a field that fans
  out). Conflicts are never in `plan.skipped`. Two entries with the same words for one place: the second is skipped,
  `address_shared`.

### Hides (`draft-write-plan-copies.mjs`, `draft-write-plan-hides.mjs`)

| `by` | The write |
|---|---|
| `row` | cuts every item row of a copy it did not write |
| `rows.remove` | takes the button element out of a copy's value, or names the slots in the contract apply's `removes` |
| `setting` | writes the setting that hides an empty button |
| `empty` | writes `""` in every location of a control none of whose locations is written, label and address together, in the rows the copy keeps. When the control's fields are item fields (one button printed for every card from the first card's words) a written control must hold the same words in every item: otherwise `control_shared_by_items` (unproven) |
| `omit` | takes every list row element it did not fill out of the copy's value, last first; a row left empty before a filled one stays (`omit_row_gap`); on a record written in place the rows stay (`omit_on_record_in_place`) |

## The doors

Injected by `deps.draftWrite.doors(ctx)`. A real client is not built yet. These shapes are the ones
`scripts/ai-quickstart/copy-proof*.mjs` and `door-proof.mjs` use on a real blank site:

| Door | Plugin call | Answer |
|---|---|---|
| `inspect()` | `content.contract` inspect | `{revision}` |
| `get({kind, id})` | `content.get`; `kind: moduleAssignment` reads a module's pages | the record's columns; `{menuids}` |
| `update({applyId, kind, id, fields})` | `content.update`; `id: 0` makes a record; `kind: moduleAssignment` sets `menuids` | `{id}` |
| `find({kind, mark})` | `content.list` by note or alias | the id, or `null` |
| `contract({applyId, expectedRevision, changes, removes})` | `content.contract` apply (`request_id` = `applyId`) | `{ok}` |
| `read({slots})` | `content.contract` inspect | `{<slot>: current value}`; a removed slot reads `null` |
| `upload({applyId, path, bytes, mime})` | `media.upload` | `{path}` |
| `media({path})` | the site's public file at that path | `{sha256}`, or `null` |
| `identity({applyId, fields})` | `site.identity` set | |
| `readIdentity()` | `site.identity` read | `{sitename, MetaDesc, sitename_pagetitles}` |
| `html: {get, set, remove}` | the plugin's HTML piece functions (`scripts/ai-quickstart/html-piece.php`) | |

Every write carries an `applyId`, one per door call: `<run id>:<operation key>:<call>`, where the call is `create`,
`assign`, `position`, `apply`, `patch`, `upload` or `identity`. It is the same on every retry and resume of that call
and differs between calls. A real client must:

- Keep the `applyId` of each call, so that a call made again is not applied twice. `content.contract` keeps a
  `request_id`; `content.update` keeps no retry key, so the client keeps it.
- Inspect a contract right before applying it and send the revision it read.
- Find a record by note (a module) or alias (a menu item, article, category or contact).
- Mark an error from a process that went away as `fatal`, so that it is never retried in place.

The rest of `deps.draftWrite`:

- `record(ctx)`: the run record `{state, save}` the run resumes from.
- `stored(order, ctx)`: the stored picture id of each frame and icon.
- `openStored(id, ctx)`: the stored bytes.
- `blankContract(kit)`: the blank site contract's content map, which `loadAiqKit` does not load.
- `drawInitials(draw)`: optional; the default is `lib/initials-avatar.js`.

The tests run every plan on a memory site that refuses what the plugin refuses:
[draft-write-memory-site.md](draft-write-memory-site.md). A door error with no code of its own (`door_failed`, the
memory site's scripted failure) is a failed call: the operation is redone once, then the write stops with
`redo_failed`.

## Running, reading back, resuming, redoing

- The run record's state is `{mark, ids, paths, pending, done}`, saved after each step of an operation. `mark` ties
  it to one plan: the approved plan's id, its revision and a sha256 of the operations.
- A record whose state names another plan is not resumed: the write stops with `write_record_stale` (noRerun), and no
  door is called. A half site written from another plan needs a decision above this step (start a new blank site, or
  keep it), so the step neither skips nor restarts by itself.
- An operation already `done` is skipped. A record marked `pending` is first looked up by its mark, then made.
- After its calls every operation reads back what they changed: a made or patched record's sent columns and every
  value at its location (an HTML piece as its node's text, a removed element as gone), a module's pages, a contract
  apply's record columns whole, an upload's bytes (`media`), the site identity.
- The untouched parts too: for every stored HTML value the operation wrote pieces of (a copy, a created record, a
  patched record), the value before and the value the site holds are read by the step's own reader
  (`draft-write-html-rest.mjs`, apart from the piece functions it checks), every element a piece names left out and
  every removed element gone, and must be equal. A piece function that escapes a sibling's entity twice, drops or
  moves a sibling, or closes a paragraph elsewhere is caught here (`what: 'untouched value'`, `at`: the element path).
  A contract apply is read back whole: its operation lists `whole`, every blank site contract slot stored in the same
  record column as a slot it writes or removes; the slots it does not write are read before the apply, and after it
  every written slot holds its value, every removed slot is gone and every other slot of those columns holds what it
  held (`what: 'untouched slot'`, the slot key).
- A read back difference is redone once like any failing operation (a site may answer late); a second difference stops
  the write with `read_back_mismatch` (noRerun). It names the operation, the entity, slot, column and lengths, never
  the text.
- A failing operation is tried twice (`DRAFT_WRITE_ATTEMPTS`). After that, or at once for a typed stop inside an
  operation (`ref_unresolved`, `initials_drawer_missing`, `record_kind_unsupported`), the write stops with
  `redo_failed` (noRerun) and the stop's code as `cause`. An operation of no known kind stops it with `op_unknown`.
- Every stop carries the report: the operations that ran (`ran`), the one that failed (`failed`), the conflicts and the
  unproven flags. A `fatal` error (the process went away) is passed on as it is, with the same report. A
  `write_record_stale` report names what the stale record had done (`stale: {plan, revision, done, made, pending}`,
  operation keys only).
- A run that ends reports `counts: {in, entries, ops, written, skipped, conflicted, conflicts}` (`planCountsOf`), and
  the step's `recorded` summary carries `conflicts: {count, entries}`: the entry ids, never the words.

## The step's value

`draftWriteStep` returns `{report, order, plan, build, recorded}`; a failure carries `error.value = {report, order,
plan, recorded}` (`plan` is null when the guards refused it, `report` null when no operation ran). `order` and `plan`
are the objects the step already holds (no copy). The engine stores `recorded` only (`recordedValue`): on success the
counts, the conflicts' entry ids and the delta; on a failure `{report: {status, counts, failed}}`, or null. It never
stores the order or the plan, which hold the customer's words.

The engine hands the value of a done write to no one (its `apply` keeps the counts), so a local trial run takes the
three through a hook: `deps.draftWrite.keepTrial({order, plan, report}, ctx)`, called once per attempt, done or failed.
That is exactly the `--write-result` of the built site check (`write.json`, [built-site-check.md](built-site-check.md)).
The hook was chosen over a larger stored value because the plan holds every value written (about 80 KB of JSON on the
florist fixture, beside an order of about 390 KB) and the customer's words: it is kept only where a trial run asks for it. A hook that throws never
hides the write's own failure. `apps/tracy-web/test/step-chain-draft-write-trial.test.mjs` proves both paths.

## Text limits, guards, skips and unproven flags

How every limit is counted, every guard the plan is held to before any door is called, where markup is caught, who
escapes a plain value, why an entry is skipped and what is not proven: [draft-write-guards.md](draft-write-guards.md).

The tests are in `packages/wo/website-opportunities/test/domain-draft-write-*.test.mjs` and
`apps/tracy-web/test/draft-write-*.test.mjs` plus `step-chain-draft-write.test.mjs`.
