# The write order of an AI quickstart build

The write order (`tracy-write-order/v1`, ticket #597) is the only input of the write step. It is built, without a
model, from the saved step values of one build run: the approved plan with its profile, the AI quickstart
declarations (Contract A), the look, every writer page, the pictures and the icons. It sits between the step chain
(Contract B, [`build-contract.md`](build-contract.md)) and the template's mapping file, which the write step reads to
find where each value is stored (#584).

Code: `packages/wo/website-opportunities/domain/write-order*.mjs`. Tests: `test/domain-write-order*.test.mjs`, on an
invented florist (`test/fixtures/write-order/`), on that florist built on the JA Boxing store, and on the JA Boxing
block store with every block placed, as declared today and as #584 will declare block-180.

## Functions

```js
buildWriteOrder({ run, aiq, approval, look, writers, pictures, icons, records }) -> order
checkWriteOrder(order) -> Array<{ code, at, message }>
answerLimitOf({ blockStore, plan, kind = 'contact.cta_label', library }) -> number | null
memorySite({ failOn }) -> { apply(order) -> Promise<{ report, site }>, calls, site }
```

- `run`: `{id, kind: 'build' | 'partial', edit?}`.
- `aiq`: `{ref, blockStore, library, pageRecipes?, mapping?, template: {slug, name, version}, aiQuickstart?: {version}}`.
- `approval`: `{plan, profile}`, the approved plan and the profile it was gated with (after any edit).
- `look`: the look step's value `{accent, accentFrom, logo}`; left out, the plan's look is copied. A text logo
  (`kind: 'text'`) takes the business name as its `text`. The plan's `accentDark` (#616) is carried whenever the
  look's accent is the plan's own.
- `writers`: one value per `writer:<page>` step, `{page, prompt}` (`writePages` on a one page plan), or one
  `writePages` result `{pages, prompt}`.
- `pictures`: the pictures step's value with `frames` (each with `file` once the pictures are fetched or drawn) and
  `reduced`; `icons`: the icon step's value with `icons`. Today both are `picturesStep`'s one result.
- `answerLimitOf`: the longest customer answer of `kind` the plan can write, the smallest limit (`limitOf` of
  `field-place-limits.mjs`) of every field it fills on the placed blocks; null when it fills none.
- A refused input throws `WriteOrderError` with a `code`. Every one of these comes from the saved values themselves, so
  it carries `noRerun: true` (`NO_RERUN`): `plan_missing`, `profile_missing`, `pictures_missing`, `writer_missing`,
  `unknown_block`, `home_repeated` (more than one page of type `home`), `answer_over_limit` (the customer's main button
  answer is longer than the smallest field it fills; `details.limit` names it).

## The order

```
{ schema: 'tracy-write-order/v1',
  run: {id, kind, edit?}, plan: {id, revision, language},
  template: {slug, version, kitRef, aiQuickstart: {version}, mapping?},
  look, seo: {title, description},
  facts: [{kind, value, data, from?: 'answer'}], items: [{data, kind, values}], rows: [{data, values}],
  sources: [{data: 'source:<id>', origin}],
  pages: [{ id, pageType, name, home, menu: {label, order}, seo: {title, description, shareImage},
            blocks: [Block] }],
  pictures: [Picture], icons: [Icon], derived: [{place, derived, target: {page}}],
  hidden: [{at, reason, fallback?}], unplaced: [{place, key}], provenance: {prompts, records} }
```

`facts`, `items`, `rows` and `sources` are every plan id the order may name, with its values, so the check holds every
data value to the plan from the order alone. `seo` holds the limits: the title limit of the mapping
(`mapping.seo.titleLimit`) when it declares one, else 60; the description limit of the mapping
(`mapping.seo.descriptionLimit`) when it declares one, else 160.

Pages come in write order: the home page first, exactly one. The menu label is the plan's page name. The SEO title and
description are the ones the writer wrote for the page (`seo` of a written page, optional, #594); a page the writer gave
none falls back to the code built ones below. The code built SEO title is
the business name on the home page and `<page name> | <business name>` elsewhere; the page name alone when both are the
same or the pair is over the limit; never a page id. The description joins the page name, the business name, the
tagline and the address (no added words, so it reads the same in every language), and is never empty. The share image
is the first own or generated picture the page shows (its hero first), else the home page's (`from: 'home'`), else
the logo (`source: 'logo'`), else the first picture of the site (`from: 'site'`); null only with no picture and no
logo picture.

A **place** is a block, an item it shows or a row of a child list. Its id is the place id of the pictures step
(`<page>.<block>[.<item>][.<list>.<n>].<field>` for a field). Every place carries `at` (its id), `declared` (every
field it declares, `{name, type}`, design fields included), `state` (`show`, `hidden` or `fallback`) and `fields`. A
hidden place stays in the order with its `declared` fields, so walking the order's own places gives every declared
field.

```
Block = { id, block, type, source: 'template' | 'library', order, position, state, reason?, fallback?,
          at, declared, fields: [Entry], counts: {min, max, available, shown},
          items: [{ id, data, index, state, reason?, at, declared, fields, lists }], lists: [List], library? }
List  = { at, list, name, item?, state, reason?, counts, rows: [{ row, rank, state, reason?, at, declared, fields }] }
```

`position` is `{request, resolved?, declared, afterBlock, beforeBlock}`: the block's first declared position as a
request (a library block asks for `content`) and its neighbours on the page. A library block takes `resolved` from
the mapping's `library.pageTypes[<page type>]`, else `library.position`, when the mapping declares them. `index` is the
stored place of a shown item, from 0 in shown order. `library` holds the rendered reviews block
(`{html, css, shown, setAside}`). A list's counts are its declared `items` found by its full path (`exercises.steps`,
block lists and item lists apart), never by its name alone.

`Entry = {key, place, field, kind, type, limit?, slots, declared?, row?, list?, button?, from, value? | action,
fallback?, data?, reason?, ...}`. The order's own keys (`key`, `place`, `field`, `kind`, `type`, `limit`, `slots`,
`row`, `list`, `button`, and `from`) always win over a writer entry's; any other key of a writer entry passes through.
`limit` is the smallest limit of the stored places the field writes (`limitOf`, the writer's own rule), not its
declared limit. `slots` are the stored places of the field in the block store (`placesOfField`), for cross checks of
shared places. `declared` carries every key of the field's declaration the order does not read, untouched.

| `from` | Fields | Value |
|---|---|---|
| `writer` | copy text | the writer's value |
| `data` | data role text, link, number | copied from the plan data; `data` names the plan id (`source:<id>` for the Google listing) |
| `answer` | main button label | the customer's answered label, character for character; `written` keeps the writer's |
| `no-data` | any | `action` `hide` or `fallback` (the block's no data rule); `reason` when it is not that rule |
| `derived` | link | `derived` (the documented form) and `target: {page}`; the write step makes the address |

A text whose kind is a data role (`page-writer-roles.mjs` `DATA_ROLES`: names, contact details, prices, reviews) is
the plan data, whatever the writer returned. A block place reads a fact of its kind, else the one item it shows when
its data is that item alone (a detail block's name). A child list row (#615) takes the value the writer copied from
the row's own data, and `data` is the plan id the planned row holds, never a value matched against the business facts.
A row text declared `textOf: "network"` is the display name of the network of the row's link
(`row-network-text.mjs`), data with `textOf: 'network'` and the link's `data`.

**Buttons.** A button label and its link in one place are one button (`button` names the other): paired by the store
(`for`), else by adjacent stored places, else by adjacent declarations. A label beside a `contact.cta_url` link is the
customer's main button answer, like every `contact.cta_label`. A label whose link opens nothing is hidden with it
(`button_link_hidden`); where the store pairs them, a link whose label is hidden is hidden too (`button_label_hidden`).

**Derived links.** A row keyed to a page (`the page of the row`) targets the planned row's page; a plan without
planned rows takes the n-th page. `the item page address` is the item's own page: a page other than the home page that
shows that item and no other item, a page of a type the template repeats per item first (`pageRecipes`), then plan
order. On its own page it is hidden (`derived_self`); with no such page, `derived_target_missing`.

Link and number values never come from the writer. A social link beside a network icon takes the icon's link, and is
hidden with the icon (`network_icon_hidden`). Image fields and video frames are `pictures`; icon fields are `icons`.

`Picture = {frame, page, block, item?, row?, field, kind, place, source: 'own' | 'generated' | 'none', file?, ref?,
alt?, size, theme?, sameAs?, reason?, generate?}`. An own picture's `alt` is its label; a generated one's is its label,
else the item it pictures, else the business name. A `sameAs` variant takes its base's file. `Icon` is the icon step's
entry as it is (a `class-name` network icon is `source: 'network'` with its `network` and `link`), plus `hidesLink` on
a hidden social icon. With the mapping's `networkIconClasses: {classes: {<network>: "<class>"}, why}`, a class-name
network icon takes `className`; a network missing from the table is hidden with its link
(`social_icon_not_in_template`). Without the table, the icon is unchanged.

## Mapping keys and field keys the order does not read

The mapping file and the block store may declare keys this order does not read yet (#584 brings a container class for
the library block and the formatting tags a text field allows). They are never dropped: the whole mapping is carried as
`template.mapping`, and a field's unread keys as its entries' `declared`. The write step reads them there.

## Not in the order yet

Left to the write step and the mapping file (#584, #587):

- each page's address and alias;
- which menu a page goes in, and under which parent;
- what a position `inside:<block>` means for the template;
- the colour variables beyond the accent, for the light and the dark theme;
- the stored slot of each field for each item and row rank (the order gives the field's stored places, `slots`, not
  which one a given item takes).

## What is hidden

A section with no real data is hidden, never padded. Every place not shown is listed in `hidden`, and only those:

| Reason | When |
|---|---|
| `item_dropped` | the pictures step reduced the item |
| `item_empty` | the item shows nothing of its own (its only link was hidden with its icon) |
| a reviews block reason | the reviews block set the review aside |
| `row_empty` | a child list row holds no value, no own or generated picture and no icon |
| `social_icon_not_in_template` | a row whose network has no class in the template |
| `parent_hidden` | a row or item hidden with its parent row, item or block |
| `list_below_min` | a list, or a repeating block, shows fewer than its minimum; a block whose no data rule is `fallback` takes state `fallback` instead (the template or the CMS fills it) |
| `no_data` | a block that declares content shows none |
| `no_reviews`, `listing_missing` | the reviews block cannot be rendered |

A logo frame (`logo_from_brand_step`) counts as shown: the write step fills it from `look`.

## The check

`checkWriteOrder` holds, from the order alone:

- pages: exactly one home page, written first (`home_count`, `home_not_first`, `page_repeated`); every page has a title
  and a description (`seo_title_empty`, `seo_description_empty`) within the limits (`seo_title_over_limit`,
  `seo_description_over_limit`), never `X | X` (`seo_title_repeated`) or a page id (`seo_page_id`), never the title of another page
  (`seo_title_not_unique`, compared as the writer compares them: `titleKey`, case and spacing aside); a share image is a
  shown picture (`share_image_none`), present when the order has one (`share_image_missing`);
- places: a state is `show`, `hidden` or `fallback` (`state_unknown`); every place not shown is in `hidden`
  (`hidden_unlisted`) and `hidden` names only places and lists not shown (`hidden_shown`, `hidden_unknown`); every
  declared non-design field of a shown place has exactly one entry, picture or icon (`field_unaccounted`,
  `field_twice`); no design field (`design_field`); every shown block and list holds its minimum (`below_min`);
- entries: a value or an action (`entry_empty`); link and number values from the data (`link_not_from_data`); a data
  role text never from the writer (`data_role_written`); a data value names a plan id of the order (`data_unnamed`,
  `data_unknown`) and is that id's value (`data_value_changed`), one fact reading the same everywhere
  (`data_value_differs`); a network label names its row link's network (`network_label_changed`); text within its
  limit (`text_over_limit`); every main button label is the answer (`main_button_changed`); no button label without a
  link that opens (`link_dead`); derived links name a page of the order (`derived_without_target`,
  `derived_target_missing`); no written entry without a place (`entry_unplaced`);
- pictures and icons: own, generated or none (`picture_source`), never stock (`stock_picture`), naming a file, a `ref`
  or how it is drawn (`picture_without_file`); a `sameAs` names another frame (`same_as_missing`), never itself
  (`same_as_self`) or a frame that is itself a `sameAs` (`same_as_chain`); a hidden network icon hides its link
  (`network_link_shown`), the link of its own row or item only (`hides_link_foreign`).

## The memory site

`memorySite()` is a fake write step: `apply(order)` refuses an order the check fails (`order_invalid`, `noRerun: true`),
writes every page, menu entry, block, field, picture and icon into a blank site in memory and returns `{report: {status:
'done', counts: {written, skipped}}, site}`, the shape the step chain's write step returns. `{failOn: n}` or
`[n, ...]` makes those calls of `apply` (from 1) fail with `memory_site_failed` (`noRerun: false`: a write call may
pass when run again). It is also the local trial tool until the real writer (#587, #584).
