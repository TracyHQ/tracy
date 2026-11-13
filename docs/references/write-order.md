# The write order of an AI quickstart build

The write order (`tracy-write-order/v1`, ticket #597) is the only input of the write step. It is built, without a
model, from the saved step values of one build run: the approved plan with its profile, the AI quickstart
declarations (Contract A), the look, every writer page, the pictures and the icons. It sits between the step chain
(Contract B, [`build-contract.md`](build-contract.md)) and the template's mapping file, which the write step reads to
find where each value is stored (#584).

Code: `packages/wo/website-opportunities/domain/write-order*.mjs`. Tests: `test/domain-write-order*.test.mjs`, on an
invented florist (`test/fixtures/write-order/`) and on the JA Boxing block store with every block placed.

## Functions

```js
buildWriteOrder({ run, aiq, approval, look, writers, pictures, icons, records }) -> order
checkWriteOrder(order) -> Array<{ code, at, message }>
memorySite({ failOn }) -> { apply(order) -> Promise<{ report, site }>, calls, site }
```

- `run`: `{id, kind: 'build' | 'partial', edit?}`.
- `aiq`: `{ref, blockStore, library, template: {slug, name, version}, aiQuickstart?: {version}}`.
- `approval`: `{plan, profile}`, the approved plan and the profile it was gated with (after any edit).
- `look`: the look step's value `{accent, accentFrom, logo}`; left out, the plan's look is copied.
- `writers`: one value per `writer:<page>` step, `{page, prompt}` (`writePages` on a one page plan), or one
  `writePages` result `{pages, prompt}`.
- `pictures`: the pictures step's value with `frames` (each with `file` once the pictures are fetched or drawn) and
  `reduced`; `icons`: the icon step's value with `icons`. Today both are `picturesStep`'s one result.
- A missing input throws `WriteOrderError` with a `code`: `plan_missing`, `profile_missing`, `pictures_missing`,
  `writer_missing`, `unknown_block`.

## The order

```
{ schema: 'tracy-write-order/v1',
  run: {id, kind, edit?}, plan: {id, revision, language},
  template: {slug, version, kitRef, aiQuickstart: {version}},
  look, facts: [{kind, value, data, from?: 'answer'}],
  pages: [{ id, pageType, name, home, menu: {label, order}, seo: {title, description, shareImage},
            blocks: [Block] }],
  pictures: [Picture], icons: [Icon], derived: [{place, derived, target: {page}}],
  hidden: [{at, reason, fallback?}], unplaced: [{place, key}], provenance: {prompts, records} }
```

Pages come in write order: the home page first, exactly one. The menu label is the plan's page name. The SEO title is
the business name on the home page and `<page name> | <business name>` elsewhere; the description joins the page name,
the business name, the tagline and the address (at most 160 characters, no added words, so it reads the same in every
language); the share image is the page's first own or generated hero picture, else null.

A **place** is a block, an item it shows or a row of a child list. Its id is the place id of the pictures step
(`<page>.<block>[.<item>][.<list>.<n>].<field>` for a field). Every place carries `at` (its id), `declared` (every
field it declares, `{name, type}`, design fields included), `state` and `fields`:

```
Block = { id, block, type, source: 'template' | 'library', order, position, state, reason?, fallback?,
          at, declared, fields: [Entry], counts: {min, max, available, shown},
          items: [{ id, data, index, state, reason?, at, declared, fields, lists }], lists: [List], library? }
List  = { list, name, item?, state, reason?, counts, rows: [{ row, rank, state, reason?, at, declared, fields }] }
```

`position` is `{request, declared, afterBlock, beforeBlock}`: the block's first declared position as a request (a
library block asks for `content`) and its neighbours on the page; the write step resolves it through the mapping file.
`index` is the stored place of a shown item, from 0 in shown order; hidden items have none. `library` holds the
rendered reviews block (`{html, css, shown, setAside}`).

`Entry = {key, place, field, kind, type, limit?, row?, list?, from, value? | action, fallback?, data?, reason?, ...}`:

| `from` | Fields | Value |
|---|---|---|
| `writer` | text | the writer's value; every other key of its entry passes through (`row`, `list` of #615) |
| `data` | text, link, number | copied from the plan data; `data` names the plan id (`source:<id>` for the Google listing) |
| `answer` | `contact.cta_label` | the customer's answered label, character for character; `written` keeps the writer's |
| `no-data` | any | `action` `hide` or `fallback` (the block's no data rule); `reason` when it is not that rule |
| `derived` | link | `derived` (the documented form) and `target: {page}`; the write step makes the address |

A child list row (#615) takes the writer's row entries: copy from the writer, data values (links and numbers
included) as the writer copied them from the row's own data. A row keyed to a page (`the page of the row`) targets the
planned row's page (`plan.pages[].blocks[].lists[].rows[].page`); a plan without planned rows takes the n-th page.
Row fields the writer leaves to the pictures or the icon step (`action: 'pictures' | 'network'`) are held by
`pictures` and `icons`.

Link and number values never come from the writer. A social link beside a network icon takes the icon's link, and is
hidden with the icon (`network_icon_hidden`). Image fields and video frames are `pictures`; icon fields are `icons`.

`Picture = {frame, page, block, item?, row?, field, kind, place, source: 'own' | 'generated' | 'none', file?, ref?,
alt?, size, theme?, sameAs?, reason?, generate?}`. A `sameAs` variant takes its base's file. `Icon` is the icon step's
entry as it is (a `class-name` network icon is `source: 'network'` with its `network` and `link`; the write step maps
the network to the template's font class), plus `hidesLink` (the place of the link it hides) on a hidden social icon.

## What is hidden

A section with no real data is hidden, never padded. Every hidden place keeps no entries and is listed in `hidden`:

| Reason | When |
|---|---|
| `item_dropped` | the pictures step reduced the item |
| `item_empty` | the item shows nothing of its own (its only link was hidden with its icon) |
| a reviews block reason | the reviews block set the review aside |
| `row_empty` | a child list row holds no value, no own or generated picture and no icon |
| `parent_hidden` | the row of a nested list whose parent row is hidden |
| `list_below_min` | a list, or a repeating block, shows fewer than its minimum; a block whose no data rule is `fallback` takes state `fallback` instead (the template or the CMS fills it) |
| `no_data` | a block that declares content shows none |
| `no_reviews`, `listing_missing` | the reviews block cannot be rendered |

A logo frame (`logo_from_brand_step`) counts as shown: the write step fills it from `look`.

## The check

`checkWriteOrder` holds, from the order alone: exactly one home page, written first; every declared non-design field of
every shown place has exactly one entry, picture or icon, with a value or an action; no design field appears; link and
number values come from the plan data and a fact value is the plan's; every main button label is the customer's
answer; text within its limit; pictures are own, generated or none, never stock, own and generated ones name a file
(or a `ref`, or how they are drawn, until the pictures are fetched); every `sameAs` names a frame of the order; every
hidden network icon's link is hidden; every shown block and list holds its minimum; every derived target is a page of
the order; no written entry is left without a place (`unplaced`).

## The memory site

`memorySite()` is a fake write step: `apply(order)` refuses an order the check fails (`order_invalid`), writes every
page, menu entry, block, field, picture and icon into a blank site in memory and returns `{report: {status: 'done',
counts: {written, skipped}}, site}`, the shape the step chain's write step returns. `{failOn: n}` or `[n, ...]` makes
those calls of `apply` (from 1) fail with `memory_site_failed`. It is also the local trial tool until the real writer
(#587, #584).
