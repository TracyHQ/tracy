---
description: The write step of a draft run, which plans door operations from the write order, guards them, then runs, resumes and redoes them on a blank site. Covers the operations, the doors interface, the guards and what is unproven.
sources:
  - packages/wo/website-opportunities/domain/draft-write-plan.mjs
  - packages/wo/website-opportunities/domain/draft-write-guards.mjs
  - packages/wo/website-opportunities/domain/write-order-memory-doors.mjs
  - apps/tracy-web/src/step-chain-draft-write.js
  - apps/tracy-web/src/step-chain-draft-write-step.js
---

# The write step of a draft run

The last step of a run built from an approved build draft (#597). It takes the checked write order
(`tracy-write-order/v1`, [write-order.md](write-order.md)) and writes it to a blank site made from the AI quickstart
([ai-quickstart-contract.md](ai-quickstart-contract.md), "Copies and blocks written in place" and "The blank site
contract"). It has two halves:

| Half | File | What it does |
|---|---|---|
| Plan | `packages/wo/website-opportunities/domain/draft-write-plan.mjs` (`writePlanOf`) | Pure. Turns the order and the kit into ordered door operations, then holds them to every guard before any door is called. |
| Run | `apps/tracy-web/src/step-chain-draft-write.js` (`runDraftWrite`) | Runs the operations through injected doors, reads every record back, resumes a crashed run, and redoes a failing operation once. |
| Step | `apps/tracy-web/src/step-chain-draft-write-step.js` (`draftWriteStep`) | The `write` step of `step-chain-draft-steps.js`. With no doors injected (`deps.draftWrite`), it stops with `write_not_ready_for_draft`. |

## The plan

`writePlanOf(order, aiq, {stored, withheld, approved, iconKeys})` returns `{schema: 'tracy-draft-write-plan/v1', ops,
skipped, unproven, controls}`.

- Every operation names the order entries it writes (`entries`) and the contract rules it follows (`rules`).
- Every value names its entry or its rule.
- `draftWriteCoverage(order, plan)` proves that each entry is written by exactly one operation or skipped with a
  reason (`entries in = written + skipped`, none unexplained, none written twice).

Run order:

| Kind | Writes | Rule |
|---|---|---|
| `picture.upload` | the stored bytes of a picture or icon, or the initials drawn in the frame | pictures come from stored bytes |
| `menuItem.create` (home) | the home page, before every other record | contract point 3 |
| `category.create`, `article.create`, `contact.create` | the records the pages list or show | `created:<kind>` |
| `menuItem.create` | one main menu item per page, then the footer menu items | `menu` of the placement |
| `module.copy` | a copy of a library module with its values, rows cut and empty buttons removed; containers first | `placement: copy` |
| `library.create` | a Tracy library block's rendered HTML as a new module | `library.position` |
| `module.assign` | the pages of a copy or of an in-place module (`[0]` for every page) | `assign` |
| `module.position` | a container's tab position, `tracy-tabs-<container id>` | `holds.position` |
| `contract.apply` | one apply per in-place record, through the blank site contract | `one_apply_per_record` |
| `record.patch` | the setting of an in-place record that hides an empty button | `hides.setting` |
| `site.identity` | the site name | `fact:name` |
| `look.accent` | the accent colours (not written: see unproven) | `look` |

Each copy and library module carries `ordering`, its block's rank on its first page, so modules sharing a position
draw in the page order. Each copy and created record carries a mark (the note of a module, the alias of a record),
which a resumed run uses to find it again.

## The doors

Injected by `deps.draftWrite.doors(ctx)`. A real client is not built yet. These shapes are the ones
`scripts/ai-quickstart/copy-proof*.mjs` and `door-proof.mjs` use on a real blank site:

| Door | Plugin call | Answer |
|---|---|---|
| `get({kind, id})` | `content.get` | the record's columns |
| `update({applyId, kind, id, fields})` | `content.update`; `id: 0` makes a record; `kind: moduleAssignment` sets `menuids` | `{id}` |
| `find({kind, mark})` | `content.list` by note or alias | the id, or `null` |
| `contract({applyId, changes, removes})` | `content.contract` apply, after an inspect that gives `expected_revision` | `{ok}` |
| `read({slots})` | `content.contract` inspect | `{<slot>: current value}` |
| `upload({applyId, path, bytes, mime})` | `media.upload` | `{path}` |
| `identity({applyId, fields})` | `site.identity` set | |
| `html: {get, set, remove}` | the plugin's HTML piece functions (`scripts/ai-quickstart/html-piece.php`) | |

A real client must do these things:

- Keep the `applyId` of each call, so that a retried call is not applied twice.
- Inspect a contract before applying it.
- Find a record by note (a module) or alias (a menu item, article, category or contact).
- Mark an error from a process that went away as `fatal`, so that it is never retried in place.

The rest of `deps.draftWrite`:

- `record(ctx)`: the run record `{state, save}` the run resumes from.
- `stored(order, ctx)`: the stored picture id of each frame and icon.
- `openStored(id, ctx)`: the stored bytes.
- `blankContract(kit)`: the blank site contract's content map, which `loadAiqKit` does not load.
- `drawInitials(draw)`: optional; the default is `lib/initials-avatar.js`.

The memory site `domain/write-order-memory-doors.mjs` implements these doors. It enforces the plugin rules measured
on a real blank site.

## Running, resuming, redoing

- The state `{ids, paths, pending, done}` is saved after each step of an operation.
- An operation already `done` is skipped.
- A record marked `pending` is first looked up by its mark, then made.
- A failing operation is tried twice (`DRAFT_WRITE_ATTEMPTS`). After that the write stops with `redo_failed`
  (noRerun). The report gives the operations that ran (`ran`) and the one that failed (`failed`).
- A record read back with another value stops the write with `read_back_mismatch`. It names the entity, slot,
  column and lengths, never the text.

## Guards (before any door, `draft-write-guards.mjs`, all noRerun)

| Code | Caught when |
|---|---|
| `text_over_limit` | a value is longer than its field limit, or than its contract slot's `maxCharacters` |
| `straight_quote_in_open_slot` | a straight double quote goes to a contract slot that opens empty |
| `empty_text_node` | an empty value is sent to a text node (the write sends one space instead) |
| `markup_forbidden` | a tag is sent through the contract, the map's codes are sent to an HTML place, a tag is sent to a codes place, or a field holds a tag its inline declaration does not list |
| `icon_not_in_list` | a network class is missing from `networkIconClasses`, or an image icon is missing from the icon library |
| `picture_without_alt` | a shown picture has no alt text |
| `picture_web_address_only`, `picture_not_stored` | a picture has no stored bytes (an initials picture is drawn instead) |
| `held_text_in_value` | a held name or person, in any form, is in a value, an alt text or a record title |
| `block_not_approved` | a block is not placed by the approved plan |
| `pair_incomplete` | one half of a button, or one version of an icon, is written without the other |

## Unproven (flags in `plan.unproven`; the run copies them to its report)

| Code | Why |
|---|---|
| `accent_variables_not_declared` | the mapping declares no accent colour variables, so the accent is not written |
| `menu_item_link_not_declared` | the contract gives no menu link per page type: a list or plans page gets the featured view |
| `featured_article_needed` | the home page's featured view needs a featured article, which the build does not make |
| `created_record_frame` | a created article has no frame from the blank site (HTML skeleton, `attribs` layout, `template_style_id`): its HTML pieces go into an empty value |
| `row_form_keys`, `recipe_ordering` | not measured on a real site (contract point 7) |
| `initials_drawn_as_figure` | the drawer has strokes for A to Z only: a name in another script is drawn as a neutral figure, and the JA Boxing frames have no text slot for the letters |

The tests are in `packages/wo/website-opportunities/test/domain-draft-write-*.test.mjs` and
`apps/tracy-web/test/draft-write-*.test.mjs` plus `step-chain-draft-write.test.mjs`.
