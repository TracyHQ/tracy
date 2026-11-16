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

Coverage of the JA Boxing florist fixture (`node --test` of `domain-draft-write-plan.test.mjs` prints it), measured
2026-11-16 (#597): 279 entries in, 129 written, 137 skipped (6 of them `row_keyed_page_without_block`), 13
conflicted, none unexplained, none written twice; 63 operations (the footer logo module's assignment gone with a text
logo, one `look.favicon` added). `domain-draft-write-length.test.mjs` proves the sum on the guarded
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
| `module.unassign` | a module an `unassign` hide leaves on no page, through the site's unassign door, read back as `[]` | `hides.unassign` |
| `site.identity` | the site name, description and page title setting | `fact:name` |
| `look.accent` | nothing: the accent is not written (see unproven); its entries are skipped | `look` |
| `look.favicon` | the site icon at `look.favicon.path`, from the logo picture's stored bytes, else the business initials on the accent: `.ico` of 16, 32 and 48 pixel PNGs, or one 32 pixel `.png` (`draft-write-plan-favicon.mjs`, `step-chain-draft-favicon.js`); a door refusing the path (`bad_params`) is flagged, never a stop; a revision keeps the first build's icon | `favicon_from_logo`, `favicon_from_initials` |

Each copy and library module carries `ordering`, its block's rank on its first page, so modules sharing a position
draw in the page order. Each created article carries `listOrder: {list, rank, of}`, its rank in its page
type's list in the plan's order (`draft-write-item-order.mjs`): the step writes the rank as `ordering`. Its dates come
from one rule only, `dated.rank` (`draft-write-record-columns.mjs`, the same plan list order) turned into `created` and
`publish_up` by `step-chain-draft-write-dates.js`, so a list the kit orders by publish date shows the plan's order on
every page. `plan.itemOrders` names, for each placed block that lists records, whether it shows the plan's order
(`follows: 'plan'`) or the order its kit declares (`follows: 'kit'`, a module's own title or menu order).

Pictures (#597, gate run 7):

- A picture upload whose contract slots declare a frame (`fit` with an `aspect`) carries `slotFit` (the frame, its
  minimum width, its transparency, its slots) and `slotOptional` (every place's block declares a hide or fallback for
  no data) (`draft-write-picture-fits.mjs`). The step pads the picture with transparency to the frame (the brand path's
  `prepareBrand`: nothing is cut) and enlarges it at most twice to reach the minimum width
  (`step-chain-draft-picture-fit.js`). One it cannot fit leaves an optional place out (not uploaded, its slots not
  written, `placesLeft` of the report, `slot_picture_left_out`) and stops a required one typed and named
  (`slot_picture_unfit`, noRerun, `problem`: `slot_picture_too_small`, `slot_picture_opaque`,
  `slot_picture_shapes_differ`). On JA Boxing every logo place is optional: block-170 hides with no data, the header
  falls back to the template's logo.
- An in-place module whose image slot would keep an empty or root-only address hides by its block's no data rule
  (`plan.emptyPictures`, `draft-write-empty-pictures.mjs`). A picture address that names no file stops the operation
  typed (`picture_address_empty`, noRerun).
- A created article's picture carries its alt beside it (`image_intro_alt`, `image_fulltext_alt`): the pictures
  step's alt for it, else one from the record's title, never empty, never a file name; a place the contract declares
  decorative (`editorial.decorative_image`) keeps it empty (`draft-write-picture-alts.mjs`).
- An article or content list menu item that leaves `show_author` on while the kit declares the author pages unbuilt
  is flagged with the kit key that would turn it off (`author_link_to_unbuilt_page`, `draft-write-author-links.mjs`). Each copy and created record carries a mark (the note of a module, the alias of a record),
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
| `unassign` | (a group of `fields` only, #587) leaves the block's module on no page: a `module.unassign` operation in place of its `module.assign` |

A hide names a control (a button), rows, or a group of `fields` (#587: fields that print a frame of their own, a tile or
a picture). A group is taken off the page when the record holds none of its fields (a fact field, such as the footer
logo's `logoDark`, counts as held when the fact is written on the record); it is no pair, so it is not listed in
`plan.controls` and the pair guard does not read it. Each group is listed per record in `plan.fieldGroups`
(`{record, block, fields, by, taken}`), which the release gate accounts it by (build place `hides.fields`: taken off is
written, held is `group_held`). JA Boxing: block-166 writes `show-on` `"0"` with no statistic
(`setting`), block-170 leaves the footer logo module on no page with no logo (`unassign`). A `by` outside
`DRAFT_WRITE_HIDE_VALUES.by` stops the plan before any door (`hide_by_unknown`, with the block and the `by`).

### Aliases, the owner's words and dates (`draft-write-alias.mjs`, `draft-write-text-clean.mjs`, `draft-write-record-columns.mjs`)

Faults of the real run on plugin 0.24.85, each now a rule of the plan:

- **Aliases.** The blank site has unicode slugs off, so Joomla folds every alias it is sent; an alias that kept an
  accent read back as other words and stopped the write (`read_back_mismatch`). Every created record is sent an alias
  in the form Joomla keeps unchanged: ASCII lower case letters and digits joined by one hyphen, accents taken off and
  `ß`, `æ`, `ø`, `œ`, `ł`, `þ` written as the post slugs write them. A name with no Latin letter (Greek, Cyrillic,
  Han) takes the fold of the record's key (`alias_from_key`, unproven). Aliases are unique per record kind in plan
  order (`-2`, `-3`), counting the menu item aliases of the kit's `dataFixes` (the blank site's hidden `system-pages`
  menu: `search`, `login`, `password-reset`, `username-reminder`) and the ones Joomla refuses on a first level menu
  item (`component`, a folder of the Joomla root): such a page gets the next free alias (`alias_reserved`). No
  operation names a menu item id; every one is a `page:` reference resolved to the id the site gave.
- **Plugin codes.** Joomla's content plugins act on a brace code in the text they print (`{loadposition x}`,
  `{loadmodule ...}`, `{emailcloak=off}`, `{source}`, any `{word ...}` or `{/word}`), and the plugin refuses that form
  in a contract slot (`SLOT_NOT_CONTENT`, "Joomla plugin directives are not content"). Every value with an order entry
  and every created record's title passes one rule in `safeOps` before it is escaped: a word joiner (U+2060) after the
  brace, `%7B` in an address. The entity `&#123;` was not chosen: libxml writes it back as `{` on the next piece set of
  the same value, a place every print escapes shows it as six characters, and the neutral and plain guards refuse a
  character reference. Reported in `plan.cleaned` and the write report, `plugin_code_neutralised`.
- **Control characters.** The same rule takes out C0 controls but tab and line ends, DEL, the zero width space, word
  joiner, byte order mark and the bidirectional controls (the joiners that shape emoji and scripts stay); outside a
  whole HTML column a run of tabs and line ends is one space. Reported `control_characters_stripped`.
- **Author name.** `pages.<type>.record.facts` (#587): every record a page of that type creates holds the fact in that
  column (JA Boxing: the business name in an article's `created_by_alias`). A column outside `RECORD_FACT_COLUMNS`
  stops the plan (`record_fact_column_unknown`); a plan with no entry of the fact leaves it (`record_fact_missing`).
- **Dates.** Every created article gets a rank (`op.dated.rank`, 0 newest) in the order a store block that lists by
  date shows it (`itemsOrder: {by: "published", direction}`: `desc` dates the first item newest, `asc` oldest), the
  articles no such list shows after, in plan order. The run turns ranks into `created` and `publish_up` from one time
  kept in its run record (`state.dateBase`, kept by a revision too): the newest an hour before it, each next rank one
  minute older (`step-chain-draft-write-dates.js`), so a resume and the read back agree.

The language override door (`template.languageOverrides`) is not used by the write step: a template language string
is a contract slot (`languageString-<n>`) written through `content.contract`.

The release gate's write safety reads `plan.cleaned` too: a probe the build reports it cleaned, found at its place in a
cleaned form (`cleanedForms` of `draft-write-text-clean.mjs`, the same rule), is `cleaned_by_build` in the ledger and
tested on the site as cleaned (a content plugin code passes when the page shows it as typed, with its word joiner,
and nothing ran). It is never `probe_not_written`, and never counted as a probe written unchanged.

## The doors

Injected by `deps.draftWrite.doors(ctx)`. On a real site they come from the door client `siteDoors({send})`
through the run's Apply door: the wiring, the transport and what is still missing are in
[`draft-write-doors.md`](draft-write-doors.md). These shapes are the ones `scripts/ai-quickstart/copy-proof*.mjs`
and `door-proof.mjs` use on a real blank site:

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
  operation (`ref_unresolved`, `initials_drawer_missing`, `record_kind_unsupported`, `picture_address_empty`,
  `slot_picture_unfit`), the write stops with
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
