---
description: The write step of a draft run, which plans door operations from the write order, guards them, then runs, reads back, resumes and redoes them on a blank site. Covers the operations, the doors interface, the guards, the read back, the run record, the memory site's rules and what is unproven.
sources:
  - packages/wo/website-opportunities/domain/draft-write-plan.mjs
  - packages/wo/website-opportunities/domain/draft-write-guards.mjs
  - packages/wo/website-opportunities/domain/draft-write-library-check.mjs
  - packages/wo/website-opportunities/domain/draft-write-plan-hides.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-doors.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-rules.mjs
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
| Step | `apps/tracy-web/src/step-chain-draft-write-step.js` (`draftWriteStep`) | The `write` step of `step-chain-draft-steps.js`. With no doors injected (`deps.draftWrite`), it stops with `write_not_ready_for_draft`; with no write order, with `write_order_missing`. It passes the names of the icon library the icons step chose from (`deps.iconLibrary`) as `iconKeys`. |

## The plan

`writePlanOf(order, aiq, {stored, withheld, approved, iconKeys})` returns `{schema: 'tracy-draft-write-plan/v1',
mainMenu, order, ops, skipped, conflicts, unproven, controls}`.

- Every operation names the order entries it writes (`entries`) and the contract rules it follows (`rules`).
- Every value names its entry or its rule.
- `draftWriteCoverage(order, plan)` proves that each entry is written by exactly one operation, skipped with a
  reason, or lost a conflict (`in = written + skipped + conflicted`, none unexplained, none written twice).
- The plan stops before any operation when the order fails `checkWriteOrder` (`order_invalid`), when the kit has no
  blank contract slots (`kit_missing`: every slot guard would turn off), and when a created record is of a kind the
  write has no shape for (`record_kind_unsupported`: only `menuItem`, `article`, `category` and `contact` are made).

Coverage of the JA Boxing florist fixture (`node --test` of `domain-draft-write-plan.test.mjs` prints it): 280
entries in, 142 written, 130 skipped, 8 conflicted, none unexplained, none written twice; 64 operations.

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
  (`menu_item_is_page_item`).
- The category a list shows is titled after the list page of its page type (the page whose recipe's main block
  lists it), never the home page.
- Two entries with other words for one place: the entry of the record's own subject page wins (a service page's own
  paragraph over the home page teaser of it); otherwise the first one. The loser is in `plan.conflicts`
  (`{entry, by, record, kept: 'own_page' | 'first'}`, ids only, never the words) and in the run report. Two entries
  with the same words for one place: the second is skipped, `address_shared`.

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

### The memory site (`write-order-memory-doors.mjs`)

It implements these doors over the blank site contract's lock rows and content map, and refuses what the plugin
refuses (`write-order-memory-rules.mjs`), so a plan or a step that breaks a rule fails its test:

| Call | Refusal | Rule |
|---|---|---|
| every write | `APPLY_ID_REQUIRED` | no apply id; a replayed apply id answers the first answer again and changes nothing |
| `contract` | `REVISION_REQUIRED`, `REVISION_STALE` | the revision moves on every write |
| `contract` | `SLOT_UNKNOWN` | no such slot |
| `contract` | `SLOT_NOT_CONTENT` | `<` or `>`; a straight double quote in a slot that opens empty |
| `contract` | `HTML_SLOT_MISSING` | an empty string at a text node |
| `contract` | `SLOT_EMPTY_STATE` | filling a slot whose sample is empty and that does not open empty, or emptying an occupied one |
| `contract` | `SLOT_TOO_LONG` | over the slot's `maxCharacters` |
| `contract` | `MARKERS_PRINTED_AS_WORDS` | content map markers at an HTML slot (memory only: the real site stores them and prints them as words) |
| `contract` | `SLOT_NOT_REMOVABLE` | a `removes` slot that is not an element of an HTML value |
| `contract` | `MODULE_TITLE_REQUIRED` | a module whose title the blank site emptied, written without its title in the same apply |
| `update` | `NOT_FOUND`, `KIND_UNKNOWN` | no such record or module of an assignment; an unknown kind |
| `update` | `TITLE_REQUIRED`, `MODULE_TITLE_REQUIRED` | a new article or category with no title, a contact with no name, a module with no title (Joomla's table check; not measured in #584, the plugin's code for it is not stated) |
| `html` | `HTML_SLOT_MISSING` | an xpath naming no node or more than one |

An HTML value is parsed as an HTML parser reads it: an unclosed `li` or `p` ends where the next one opens (a stored
list value is written as `((li))` rows without end tags). A piece reads as its node's text.

## Running, reading back, resuming, redoing

- The run record's state is `{mark, ids, paths, pending, done}`, saved after each step of an operation. `mark` ties
  it to one plan: the approved plan's id, its revision and a sha256 of the operations.
- A record whose state names another plan is not resumed: the write stops with `write_record_stale` (noRerun), and no
  door is called. A half site written from another plan needs a decision above this step (start a new blank site, or
  keep it), so the step neither skips nor restarts by itself.
- An operation already `done` is skipped. A record marked `pending` is first looked up by its mark, then made.
- After its calls every operation reads back what they changed: a made or patched record's sent columns and every
  value at its location (an HTML piece as its node's text, a removed element as gone), a module's pages, a contract
  apply's slots and removed slots, an upload's bytes (`media`), the site identity. A difference stops the write with
  `read_back_mismatch` (noRerun): it names the operation, the entity, slot, column and lengths, never the text.
- A failing operation is tried twice (`DRAFT_WRITE_ATTEMPTS`). After that, or at once for a typed stop inside an
  operation (`ref_unresolved`, `initials_drawer_missing`, `record_kind_unsupported`), the write stops with
  `redo_failed` (noRerun) and the stop's code as `cause`. An operation of no known kind stops it with `op_unknown`.
- Every stop carries the report: the operations that ran (`ran`), the one that failed (`failed`), the conflicts and the
  unproven flags. A `fatal` error (the process went away) is passed on as it is, with the same report.

## Guards (before any door, `draft-write-guards.mjs`, all noRerun)

| Code | Caught when |
|---|---|
| `text_over_limit` | a value is longer than its field limit, or than its contract slot's `maxCharacters` |
| `straight_quote_in_open_slot` | a straight double quote goes to a contract slot that opens empty |
| `empty_text_node` | an empty value is sent to a text node (the write sends one space instead) |
| `markup_forbidden` | a tag is sent through the contract, the map's codes are sent to an HTML place, a tag is sent to a codes place, or a field holds a tag its inline declaration does not list. The order check (`checkWriteOrder`) catches a stray `<` or `>` in a text entry first, and the page writer's copy check (`angle_bracket`) before that, where the writer can still redo it |
| `icon_not_in_list` | a network class is missing from `networkIconClasses`, or an image icon is missing from the icon library (`iconKeys`; with no library wired, none is in it) |
| `picture_without_alt` | a shown picture has no alt text |
| `picture_web_address_only`, `picture_not_stored` | a picture has no stored bytes (an initials picture is drawn instead) |
| `held_text_in_value` | a held name or person, in any form, is in a value, an alt text, a record title or a library block's HTML |
| `block_not_approved` | a block is not placed by the approved plan |
| `pair_incomplete` | one half of a button, or one version of an icon, is written without the other (block or item fields) |
| `library_html_stale` | a library block's HTML does not show a shown field of the order (the heading, the label, the listing address escaped, each review's text, its reviewer as the block names them, its stars), or is empty |
| `library_html_unsafe` | a library block's HTML holds markup that runs code (`script`, `iframe`, `style`, an `on*` handler, a `javascript:` address) |

## Skip reasons (in `plan.skipped`)

| Reason | Why |
|---|---|
| `left_empty`, `template_fallback`, `place_fallback`, `place_<state>`, `block_hidden` | the order leaves the place empty, to the template, or not shown |
| `no_candidate_icon`, `gallery_own_photos_only`, `no_fitting_video`, `no_generated_people` | the order's own reason for a picture or icon it does not fill |
| `address_shared` | another entry already writes the same words at that place |
| `address_conflict` | another entry writes other words at that place and wins (listed in `plan.conflicts`, counted apart) |
| `menu_item_is_page_item` | a menu block on the main menu: its items are the page items |
| `menu_item_without_page`, `menu_item_title` | a menu item with no page to link to; a menu item title, written by the page |
| `derived_drawn_by_template` | a derived value the template draws itself |
| `fact_fanned_out`, `fact_place_missing`, `fact_place_not_on_site`, `text_logo_prints_site_name` | a fact written once at its own place, or with no place on the site |
| `no_mapping_entry`, `location_unresolved`, `entity_not_declared`, `kept_record_without_slot` | the mapping gives no place the write can reach |
| `held_block_not_placed`, `foreign_copy_not_placed` | the block holding the place is not placed |
| `seo_derived_by_template`, `seo_record_not_declared` | the page's search title and description |
| `accent_variables_not_declared`, `accent_door_missing` | the accent is not written |

## Unproven (flags in `plan.unproven`; the run copies them to its report)

| Code | Why |
|---|---|
| `accent_variables_not_declared` | the mapping declares no accent colour variables, so the accent is not written |
| `accent_door_missing` | the variables exist but no door writes them |
| `identity_field_no_door` | an identity field (`fromname`) that `site.identity` neither reads nor writes: not sent |
| `menu_item_link_not_declared` | the contract gives no menu link per page type: a list or plans page gets the featured view |
| `featured_article_needed` | the home page's featured view needs a featured article, which the build does not make |
| `created_record_frame` | a created article has no frame from the blank site: its HTML pieces go into the smallest frame that holds them (`draft-write-frame.mjs`); the template's own skeleton, `attribs` layout and `template_style_id` are not known |
| `article_category_not_declared`, `seo_record_not_declared` | the contract does not say which category an article goes in, or which record holds a page's search texts |
| `control_shared_by_items`, `omit_row_gap`, `omit_on_record_in_place` | see Hides |
| `row_form_keys`, `recipe_ordering` | not measured on a real site (contract point 7) |
| `initials_drawn_as_figure` | the drawer has strokes for A to Z only: a name in another script is drawn as a neutral figure, and the JA Boxing frames have no text slot for the letters |

The tests are in `packages/wo/website-opportunities/test/domain-draft-write-*.test.mjs` and
`apps/tracy-web/test/draft-write-*.test.mjs` plus `step-chain-draft-write.test.mjs`.
