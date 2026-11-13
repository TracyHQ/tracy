---
description: Format of the three declarations an AI quickstart carries (block store description, page recipes, mapping file) and the contract check that validates them in CI.
sources:
  - packages/wo/website-opportunities/domain/ai-quickstart-contract.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-mapping.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-field-keys.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-inline.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-items-of.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-labels.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-mapping-seo.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-mapping-coverage.mjs
  - packages/cms/tracy-quickstart-tools/ai-quickstart/lib/draft-references.mjs
  - packages/cms/tracy-quickstart-tools/ai-quickstart/lib/draft-inline-markup.mjs
  - packages/cms/tracy-quickstart-tools/ai-quickstart/lib/draft-items-of.mjs
  - packages/wo/website-opportunities/domain/place-content-roles.mjs
  - scripts/ai-quickstart/check.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-library.mjs
  - packages/wo/website-opportunities/domain/library/tracy-library.json
  - docs/adr/0045-sites-are-built-from-an-ai-quickstart-not-from-the-demo.md
  - docs/adr/0046-the-model-sees-one-cms-neutral-site-form.md
---

# AI quickstart contract: block store description, page recipes, mapping file

An AI quickstart ([ADR 0045](../adr/0045-sites-are-built-from-an-ai-quickstart-not-from-the-demo.md)) carries a blank
site and three declarations. They are the contract between the template kit (who writes them) and the build engine
(who reads them, [ADR 0046](../adr/0046-the-model-sees-one-cms-neutral-site-form.md)). The model never reads them.

| File | Says |
|---|---|
| `block-store.json` | every block in the store: its block type, typed fields with limits, item counts, the no data rule, layout positions |
| `page-recipes.json` | the author's block order for each page type |
| `mapping.json` | where each field and each business fact is written, which config lines are design, the SEO fields, the overrides |

The three files sit in one folder. The contract check finds every folder under `packages/cms/` that holds a
`block-store.json`. For a Joomla template, put them in
`packages/cms/tracy-joomla-quickstart/ai-quickstarts/<slug>/j6/<version>/`, apart from `contracts/`, because a
released contract folder is never edited.

A folder whose mapping file is written by a later ticket holds `mapping.pending.json` in its place, naming that
ticket (`{"ticket": "#584"}`). The check then skips only the rules that read the mapping file: every rule the block
store and the page recipes answer alone still runs, including the stored place rules below, and it prints
`mapping.json pending (#584)` for the folder. A marker beside a written `mapping.json`
is a problem, so the marker is removed in the same change that writes the mapping.

A complete invented example (no real template or business) is the test fixture set
[`packages/wo/website-opportunities/test/fixtures/ai-quickstart/`](../../packages/wo/website-opportunities/test/fixtures/ai-quickstart/).
The snippets below are excerpts of it.

## Shared vocabulary

- **Data kind** = a role of `place-content-roles/3` (`PLACE_CONTENT_ROLES_V3` in `place-content-roles.mjs`), the same
  roles the content map carries ([ADR 0038](../adr/0038-slot-roles-live-in-content-map.md),
  [ADR 0040](../adr/0040-place-content-roles-v3-role-is-the-single-keep-decider.md)).
- **Block type** = a key of `BLOCK_TYPES` in the same file. Each names the group kind (`GROUP_KINDS_V3`) of the items it
  shows, or none for a block that shows one thing: `header`, `footer`, `hero`, `about`, `text`, `call_to_action`,
  `contact`, `map`, `video`, `newsletter`, `services`, `menu`, `pricing`, `schedule`, `team`, `stats`, `steps`,
  `reviews`, `claims`, `faq`, `events`, `posts`, `gallery`. A new type is added there, in review, never in one template's
  file.

## `block-store.json`

```json
{
  "schema": "tracy-ai-quickstart-block-store/v1",
  "roleVocabularyVersion": "place-content-roles/3",
  "template": { "slug": "example-template", "version": "1.0.0" },
  "blocks": [
    {
      "id": "services-grid",
      "type": "services",
      "source": "template",
      "positions": ["content"],
      "items": { "min": 2, "max": 3 },
      "noData": { "rule": "hide" },
      "fields": [{ "name": "heading", "kind": "editorial.heading", "type": "text", "limit": 30 }],
      "itemFields": [
        { "name": "name", "kind": "offering.name", "type": "text", "limit": 24 },
        { "name": "icon", "kind": "editorial.item_icon", "type": "icon" }
      ]
    }
  ]
}
```

| Key | Rule |
|---|---|
| `id` | unique in the store; page recipes and the mapping file name blocks by it |
| `type` | a block type of `BLOCK_TYPES` |
| `source` | optional: `template` (default) or `library`, a Tracy library block for data the template lacks (shape designed with Part 3) |
| `positions` | the layout positions the block may be placed in, at least one. `inside:<block id>` places the block inside another block of the store (a module whose list the container shows); the id must name a block of the store |
| `items` | required on every block: `{min, max}`, whole numbers, `0 <= min <= max`, `max >= 1`. A block that shows one thing is `{min: 1, max: 1}` |
| `noData` | required: `{"rule": "hide"}`, or `{"rule": "fallback", "fallback": "<what the block shows instead>"}` |
| `fields` | the block's own fields, written once per placed block |
| `itemFields` | optional: the fields of one item of a repeating block, written once per item |
| `itemsLabel` | required on a block with `itemFields`, absent otherwise: what a person calls its items, a short English noun phrase in sentence case of at most 40 characters (`Classes`, `Membership plans`), no closing punctuation. It is the words a form or an editor shows above the items |
| `lists` | optional: child lists of the block itself (the steps of a post page), see [Child lists](#child-lists) |
| `itemLists` | optional: child lists inside each item of a repeating block (the calendar rows of a class card) |

Keys a draft records for the mapping file and for a reviewer: `slot` on a field (its stored place, a content map
key), `slots` on an item field (its stored place per item, in item order), `derived` on an item field that has no
stored place (what it is derived from, one of the forms in [Field keys beyond the type](#field-keys-beyond-the-type)), `designFrom` on a design field (the config line it
is), `limitFrom` (where a limit came from), `itemsFrom` (`{min, max}`: where each item count came from). The check
reads them without the mapping file:

- every item field of a template block lists its stored places (`slots`) or says what it is derived from (`derived`);
  a Tracy library block stores nothing in the template, so its fields have no places;
- an item field with `slots` needs at least `items.max` of them: every item has the field, so every item has one shape;
- a field that is not typed `design` but carries `designFrom`, or shares its `slot` with a design field of the block,
  is a design value typed as content.

A field is `{name, kind, type, ...}`, its name unique within the block:

| `type` | Needs | Notes |
|---|---|---|
| `text` | `kind`, `limit` | `limit` = most characters at the narrowest width, measured on the template |
| `link` | `kind` | |
| `image` | `kind`, `frame: {width, height}` | the picture's frame in pixels |
| `icon` | `kind`, `frame: {width, height}` | the box the icon is drawn in, in pixels, so the build can size it; see [Icon fields](#icon-fields) |
| `number` | `kind` | |
| `design` | nothing; carries no `kind` | a design value of the template. **A build never writes it** |

A field whose kind is `editorial.design_element` is a design value and must be typed `design`.

### Icon fields

- An icon field is filled only with an icon from the build's icon library, the picture step of
  [ADR 0043](../adr/0043-picture-step-manifest-check-and-fallback-ladder.md). It is never a photo, never a generated
  picture, and never the template's demo icon.
- The icon is chosen for the content of its own item (the item's heading and text), so it means what the item says.
- It is written in a light and a dark version and painted in the template's colour roles (ADR 0043 section 1a), so it
  keeps the template's icon style.
- When no library icon fits, the icon is hidden, or the field's own no data rule applies; the demo icon is never
  kept. For builds from an AI quickstart this replaces the `keep` treatment of `editorial.item_icon` in
  [ADR 0040](../adr/0040-place-content-roles-v3-role-is-the-single-keep-decider.md).
- An icon field declares its `frame`; the check fails an icon field without one.
- `storage` says how the template keeps the icon: `image-file` (a picture path) or `class-name` (a class of the
  template's own icon font, such as a social network glyph).
- `iconOf: "network"` marks an icon that stands for the social network of its item's link (the social links of a
  footer or a trainer card). The build engine reads the network of that link: with `storage: "class-name"` it writes
  that network's class in the template's own icon font, with `storage: "image-file"` the icon library's mark of that
  network; it is never chosen by item content, so the item content rule above does not apply to it.
- `textOf: "network"` marks a text field whose words are the display name of the social network of the link in the
  same scope ("Facebook" beside a trainer's Facebook link), never words of the business or of the item. The build
  writes the name of the network the link's host names; a row whose link names no known network is not written, as
  for its icon. It is the label's counterpart of `iconOf`, and needs a `link` field in the same scope.
- `for: [<field name>, ...]` names the text fields the icon illustrates, in the same scope (the block, one item, or one
  row of a child list). An icon at block level needs `for` or `iconOf`: a block level icon naming nothing has no
  content to be chosen from, and the build hides it (`icon_item_undeclared`). Inside an item or a row, the icon
  illustrates that item's text fields, so `for` is optional there; when given, every name must be a text field of the
  same scope.
- **Light and dark versions.** A template that keeps one icon (or one picture, such as a signature or a logo) in two
  files declares two fields: the base field, and its other version with `variantOf: "<base field name>"`. Both carry
  `theme`: `"dark"` is the version drawn when the page shows its dark colour scheme (a dark ground; JA Boxing's body
  class `dark-active`, its default), `"light"` the version drawn on the light scheme (`light-active`, a white ground).
  Verified on the running JA Boxing site by switching the scheme. The check requires: the variant names a field of the
  same scope with the same `type`, `storage`, `frame` and `for`; both members carry a `theme`, and the two differ; a
  `theme` on a field outside a pair is a problem.

```json
{ "name": "item-icon", "kind": "editorial.item_icon", "type": "icon", "storage": "image-file",
  "frame": { "width": 64, "height": 64 }, "theme": "dark", "for": ["heading", "paragraph"] },
{ "name": "item-icon-2", "kind": "editorial.item_icon", "type": "icon", "storage": "image-file",
  "frame": { "width": 64, "height": 64 }, "theme": "light", "variantOf": "item-icon", "for": ["heading", "paragraph"] }
```

### Field keys beyond the type

| Key | On | Allowed values |
|---|---|---|
| `storage` | icon fields only; required on a template block's icon | `"image-file"`, `"class-name"` |
| `iconOf` | icon fields | `"network"` |
| `textOf` | text fields with a `link` field in the same scope | `"network"` |
| `for` | icon fields | text field names of the same scope |
| `variantOf` | icon and image fields | the name of the base field of the same scope |
| `theme` | both members of a pair, required there | `"light"`, `"dark"` |
| `derived` | a field with no stored place | `"the item page address"`, `"the page address"`, `"the page of the row"` |
| `keyAt` | required with `derived: "the page of the row"` | the location(s) where the row's page key is stored, see below |
| `pageType` | optional, with `keyAt` on a block field | a `pageType` of the page recipes whose recipe places the block |

Any other value of these keys is a problem; `derived` is never free text.

**A row keyed to a page.** Some blocks key a stored row to a page by a stored record id (the masthead title rows of JA
Boxing are keyed by `menuitem_config.item_id[i]`: each row is the title shown on one page). Such a list carries a link
field `derived: "the page of the row"` whose `keyAt` gives, per parent place, one location per row, matching the rows
of the list's other fields, each on the parent place's record. The build writes the id of the page it creates into that
location. A block field keyed the same way (one stat row of the masthead keyed to the classes page) gives a single
location and may name the page type it points at with `pageType`.

```json
{ "name": "page", "kind": "editorial.navigation_url", "type": "link", "derived": "the page of the row",
  "keyAt": [[{ "entity": "module-12", "column": "params", "jsonPath": ["rows", "page", 0] },
             { "entity": "module-12", "column": "params", "jsonPath": ["rows", "page", 1] }]] }
```

**A piece of a stored HTML value** is written `<content map key>@<xpath>`: `module-163.12@/html/body/div/a[1]/@href`
is the first link inside the HTML that slot `module-163.12` stores. A trainer card's social links are a child list
(`itemLists`) whose rows are the links of that one value, each row a `link` and its network icon
(`iconOf: "network"`, `storage: "class-name"`).

**Inline markup inside a text value.** A text field's stored value may carry inline markup: an accent span or a line
break in a heading, a styled unit in a price, a paragraph wrapper around a body. Every such field (the draft report's
class `inline-markup-in-text`, `inlineMarkup` in `draft-report.json`) declares it with `inline`:

```json
"inline": { "emphasis": [{ "tag": "br" }, { "tag": "span", "attrs": "", "at": "end" }], "from": "template-kit" }
"inline": { "emphasis": [], "wrapper": ["p", "ul", "li"], "from": "content-map" }
```

- `emphasis` is the emphasis shape the demo value carries, in the template kit's own notation (`template-kit.json`,
  the `inline` of the field's slots, without the demo words): `{"tag": "br"}` a line break, `{"tag": "span", "attrs",
  "at"}` an accent span with its attributes and where it sits in the words (`start`, `end`, `inside`). The draft reads
  it from the kit; for a slot the kit lists without it, from the content map's `((br/))` and `((span))` markers of the
  sample (`from: "content-map"`). Each part is listed once for the field, whichever of its places carries it.
- `wrapper` lists the block elements the stored value is wrapped in (`p`, and `ul`, `li` for a body with a highlight
  list).
- **The rule.** The build keeps the template's wrapper element(s) around the words. The writer supplies words plus an
  optional emphasis part, never markup; the build wraps that part the way the demo does (the content map's markers,
  which a JA ACM block reads; where the demo stores real HTML, as an article field or a page heading does, the same
  tags as real elements), so the look of the demo is kept. Plain words are always valid: a value with no emphasis part
  is written as words alone.
- **Owners.** The write step (#597) writes such a value: the words, the emphasis part inside the declared tags, the
  wrapper kept. The gate (#585) flags a broken look: an emphasis part left out of its span, a wrapper lost, raw
  markers printed.
- The check fails a field the draft report lists in the class without `inline`, or whose `inline` leaves out a tag
  the report found in its value (`ai-quickstart-inline.mjs`).
- The Claude Cowork plugin's `content.contract` apply (0.24.85) refuses `<` and `>` in a value (`SLOT_NOT_CONTENT`):
  markers carry no angle bracket and pass it; a real HTML element goes through another door, which #597 owns.

**A child field is stored on its parent's record.** Every stored place of a child field, and every `keyAt` location, is
on the record of its parent place (the block's record for `lists`, the item's record for `itemLists`). A place on
another record is a problem: the build would write a row into a record the item is not.

**A place shared by several fields** is written within the smallest text limit of the fields that use it. The check
counts such places (`N stored place(s) shared by several fields` in its output; `sharedPlacesOf` lists them with the
limit a build uses), and a place two fields type differently (design excepted) is a problem.

**Videos.** A video frame is a `link` field of kind `business.video`; no `media: "video"` key exists. JA Boxing
declares 4 such fields with 17 stored places (6 video items of the video block, 1 lead video and 4 exercise videos of
the class page, 6 punch videos of the learning post).

**Template strings that are content.** A language or template string the template draws whose words depend on the
business (a section heading, a button label) is a field of the block that draws it, its stored place the language
string (`languageString-<n>.0`) and its limit measured on every page that shows it. It is one value for the whole
site: every block drawing the string shares the place, and the shared place rule above applies. A string that is
interface text valid on every site (a form placeholder, "Submit") stays out of the store as `unlisted` with
`as: "kept"` and a reason.

### Child lists

A **child list** is a list inside a block or inside each item of a repeating block, with its own fields and counts: the
calendar rows of each class card, the steps of an exercise on a class page. `lists` holds the child lists of the block
itself, `itemLists` those of each item. A child list's rows may carry child lists of their own (`lists` on the child
list).

```json
{
  "id": "class-cards",
  "type": "services",
  "items": { "min": 1, "max": 4 },
  "itemsLabel": "Classes",
  "itemFields": [
    { "name": "name", "kind": "offering.name", "type": "text", "limit": 30,
      "slots": ["article-1.0", "article-2.0", "article-3.0", "article-4.0"] }
  ],
  "itemLists": [
    {
      "name": "sessions",
      "label": "Class days",
      "items": { "min": 0, "max": 2 },
      "itemsFrom": { "min": "a card lays out with no session row", "max": "the most rows a stored item holds" },
      "fields": [
        { "name": "day", "kind": "offering.schedule", "type": "text", "limit": 20,
          "slots": [["article-1.4", "article-1.6"], ["article-2.4"], ["article-3.4"], []] }
      ]
    }
  ]
}
```

| Key | Rule |
|---|---|
| `name` | unique in the block, across its fields, item fields and child lists |
| `label` | required: what a person calls its rows, with the rules of `itemsLabel` (`Class days`, `Exercise steps`) |
| `items` | `{min, max}` as for a block; `min` may be 0 (a card with no session row) |
| `itemsFrom` | required: `{min, max}`, where each count comes from |
| `fields` | the fields of one row, with the same rules as any field (type, kind, limit, frame) |
| `lists` | optional: child lists of each row |

**Stored places per parent place.** A child field's `slots` is one entry per parent place, each the stored places of its
rows in row order, `[]` for a place that stores none. Above, the four class records store 2, 1, 1 and 0 rows. The
parent places are the block itself (one place) for `lists`, the stored item places (in the order of the item fields'
`slots`) for `itemLists`, and every row of the parent list, place after place, for a nested list. A child field with no
stored place says what it is derived from (`derived`). The check holds, with the mapping file written or pending:

- every child field lists one entry per parent place;
- the fields of one list agree row for row (the same rows per parent place);
- every parent place stores between `min` and `max` rows (a stored row above `max` would never be written), and one
  place stores `max` (a maximum no place stores is a claim nothing can write).

**More rows than a parent place stores.** The build writes a business's rows into the stored places of the parent place
the item is written to, in order, and drops the rows beyond them; it gives the item with the most rows the parent
place that stores the most. A stored place the business does not fill must be left empty: emptying every declared place
is the blank site step the mapping file brings (#584), so it is declared here even when no business fills it. So `max` is the most rows a business item can show, and a parent
place storing fewer shows fewer.

**A child list on a block that shows one thing** (a post page): `lists` with one parent place, `slots` with one entry.
A nested list stores its rows per row of its parent list:

```json
"lists": [
  {
    "name": "exercises",
    "label": "Exercises",
    "items": { "min": 1, "max": 2 },
    "itemsFrom": { "min": "one exercise lays out as one card", "max": "the most rows a stored parent place holds" },
    "fields": [{ "name": "title", "kind": "editorial.heading", "type": "text", "limit": 18,
                 "slots": [["article-9.10", "article-9.20"]] }],
    "lists": [
      {
        "name": "steps",
        "label": "Exercise steps",
        "items": { "min": 1, "max": 3 },
        "itemsFrom": { "min": "one step is one bullet", "max": "the most rows a stored parent place holds" },
        "fields": [{ "name": "step", "kind": "editorial.paragraph", "type": "text", "limit": 24,
                     "slots": [["article-9.11", "article-9.12", "article-9.13"], ["article-9.21"]] }]
      }
    ]
  }
]
```

Paragraphs of running article text are not a list: they stay single fields of the block, one per stored place.

### Blocks that list the same records

Several blocks may show the same records: the home page's class cards and the classes page list the same class
articles, the phone menu lists the main menu's items. The build creates each record once, as an item of the block that
**owns** it. A block that only shows records another block owns says so with `itemsOf`, and every block of such a group
says the order it lists them in with `itemsOrder`:

```json
{
  "id": "home-classes",
  "items": { "min": 1, "max": 4 },
  "itemsOrder": { "by": "title", "direction": "asc", "from": "the module's own ordering setting" },
  "itemsOf": {
    "block": "class-list",
    "select": "all",
    "fields": { "name": "name", "heading-2": "heading", "link": "link" },
    "why": "the cards list the class pages of the category the build files them in"
  }
}
```

| Key | Rule |
|---|---|
| `itemsOrder.by` | `title`, `published`, `created`, `ordering` (the manual order), `hits`, `menu` (the menu's own order) or `path` (the menu path of the page shown) |
| `itemsOrder.direction` | `asc` or `desc` |
| `itemsOrder.from` | the setting the order is read from: the module's own ordering, or the global component setting when the menu item sets none |
| `itemsOf.block` | the owner: another block of the store with item fields, which names no owner itself |
| `itemsOf.select` | `all`, or a sentence naming which of the owner's records it shows (`the featured posts`) |
| `itemsOf.fields` | for every item field that is not `design`, the owner item field of the same type it draws; the draft matches them by stored place (a derived field by its derivation) |
| `itemsOf.why` | why the records are the owner's |

The block keeps only its own data: its count (`items`), its order and its limits. A place it shares with the owner is
written within the smallest limit of the fields that store it. The check holds:

- two blocks whose item fields store places on the same records are linked: one names the other, or both name the same
  owner;
- every block of a linked group declares its order (`itemsOrder`);
- two linked blocks that list their common records in another order do not declare the same order.

**How a block finds new records after blanking.** A block of this kind does not store its records: the site selects
them when the page is shown, from the block's own settings. A category list (`mod_articles_category`) shows the
published articles of its category (`catid`) in its order, up to its count; a featured or author view shows the posts
marked featured or written by the page's person, in the component's global order; a menu module shows the items of its
menu. So the build writes the records once, through the owner, files them where the showing block selects (the
category the build writes into the module, a `buildSets` place such as `module-160:params:catid.0`), and each block
shows them in its declared order, cut to its count. A record the build adds later shows at the position its order gives
it.

## `page-recipes.json`

```json
{
  "schema": "tracy-ai-quickstart-page-recipes/v1",
  "recipes": [
    { "pageType": "home", "mainBlock": "hero-home", "blocks": ["header-main", "hero-home", "footer-main"] }
  ]
}
```

`pageType` is unique; `blocks` is the author's order and names blocks of the store; `mainBlock` is one of them (a page
whose main block is dropped is dropped, ADR 0046 decision 3). Optional `variants` (`[{blocks, pages}]`) keep the other
block orders demo pages of the type show (one item page shows one more related block); their blocks must name blocks
of the store too. The build uses `blocks`; a variant is a composition the author made, kept so it is not lost.

## `mapping.json`

A **location** has the shape a content map slot already uses, so the existing write functions take it unchanged:
`{"slot": "module-12.3", "entity": "module-12", "column": "params", "nestedJson": "jatools-config", "jsonPath": ["hero",
"title", 0], "xpath": "/html/body/div/h2"}`. Only `entity` and `column` are required:

- `slot` names the content map slot the location is, when it is one; its `entity`, `column`, `jsonPath`, `nestedJson`
  and `xpath` are then the slot's own, byte for byte. The Claude Cowork plugin writes a site by slot key
  (`content.contract` apply: `checkValue`, then `changeRow` with `ContentSlots::htmlPatch` and `jsonPatch`); test
  `ai-quickstart-mapping-writes.test.mjs` runs the plugin release the quickstart pins on the demo rows as the blank site
  step leaves them, for a plain slot, an xpath piece, an attribute piece, a nested JSON place, a child list row, a fact
  place and every text node place, and reads each value back.
- `jsonPath` holds keys and list indexes (integers); `nestedJson` names a key of the column whose value is itself a JSON
  string (a JA ACM block's `jatools-config`), read and written back in the form PHP's `json_encode` writes.
- `xpath` uses the plugin's convention, a synthetic `/html/body/div` root around the stored HTML. A JA ACM value keeps
  its HTML in the marker notation (`((div class="x"))`); the xpath reads the HTML the markers stand for.
- `piece: true` says the xpath names a node inside the slot's stored value (an attribute, a text node, an element): the
  build reads the value, sets the piece and writes the whole value back under the slot's key. A piece's slot is a
  whole value, never itself a piece.
- `as` on a fact place says how the fact is written there: `tel` (a `tel:` link) or `mailto` (a `mailto:` link).

`entity` names a key of **`entities`**, the records the mapping file names, each `{kind, identity, sourceId?}`: the
content map's own entities (`module`, `field`, `article`, `menuItem`, `languageString`, `siteSetting`...) plus the
records outside it a place sits on: `globalConfiguration` (`configuration.php`, which the installer writes, so the
blank site carries no value of it), `templateGlobal` (T4's `local/etc/global.json`) and `acymConfiguration` (by
`name`). An entity the blank site removes (a page, an article, a contact, a tag, a user) carries `created: true`: the
build creates its own record, and nothing on it is emptied. `entity: "page"` names the page the build creates.

```json
{
  "schema": "tracy-ai-quickstart-mapping/v1",
  "entities": { "module-13": { "kind": "module", "identity": { "title": "Services" }, "sourceId": 13 } },
  "blocks": {
    "services-grid": {
      "fields": { "heading": { "entity": "module-13", "column": "params", "jsonPath": ["title"] } },
      "itemFields": { "name": [{ "entity": "module-13", "column": "params", "jsonPath": ["items", "0", "name"] }] },
      "designLines": [{ "entity": "module-13", "column": "params", "jsonPath": ["layout"] }]
    }
  },
  "facts": { "phone": [{ "entity": "module-14", "column": "params", "jsonPath": ["phone"] }] },
  "seo": {
    "title": { "entity": "page", "column": "title" },
    "description": { "entity": "page", "column": "metadesc" },
    "shareImage": { "entity": "page", "column": "params", "jsonPath": ["menu-meta-image"] }
  },
  "library": { "position": "content-bottom" },
  "overrides": {
    "settings": [{ "location": { "entity": "settings", "column": "MetaDesc" }, "value": "" }],
    "language": [{ "key": "TPL_EXAMPLE_READ_MORE", "value": "Read more" }]
  }
}
```

- **`blocks`**: one entry per store block, nothing else. `fields` gives an entry for every field, design fields too.
  `itemFields` gives a list of entries per item field, one per item, at least `items.max` long. `lists` and
  `itemLists` map a child list name to `{fields, lists?}`, where each child field gives, per parent place, one entry
  per row (`[[loc, loc], [loc], []]`): at least one parent place for `lists`, `items.max` for `itemLists`, and the rows
  of the parent list for a nested list, with the rows within the list's counts and agreeing across its fields. A child
  field's location on a design line is a design value typed as content, as for any field. An entry is one of:
  - a location;
  - `{"fact": "<name>"}`: a field of a business fact kind takes the fact, written at the fact's places (below), so the
    fact is declared once; a field of a fact kind that is not the business's own fact (a trainer's own link) is listed
    in `factExceptions` (`[{block, field, why}]`) and takes a location;
  - `{"derived": "<form>", "keyAt"?, "pageType"?}`: a field the build derives (a page address, the page of a keyed row),
    with the key place of a row keyed to a page (`keyAt`, the place the build writes the new page id into) and the page
    type of the row. A derived field may carry a location too, where the build writes what it derives.
- **`designLines`**: every config line of the block that is design (kept as the template has it). A design field's
  location must be one of them, and a field whose location is one of them must be typed `design`: that is how a design
  value typed as text is caught.
- **`facts`**: each business fact declared once, with every place the template shows it (fan out). Keys: `name`,
  `phone`, `address`, `email`, `social` (a location may add `network`), `logoLight`, `logoDark`. `logoLight` is the logo
  drawn on a light background (the dark mark), `logoDark` the one drawn on a dark background. A fact the template never
  shows is left out. `notFacts` (`[{fact, why}]`) names each business fact or demo value the template shows nowhere, or
  shows only through another fact's place, with the reason; together with `facts` it accounts for every demo fact value.
  The check holds the fan out: every place of a store field written as `{fact}` is one of that fact's places, and a
  `globalConfiguration` entity has its `sitename` and `fromname` (Joomla's site name and mail sender name) among the
  places of `name` (`GLOBAL_CONFIGURATION_FACTS`). A place outside the store is caught when it is the last place
  naming its entity, or when the draft report classes it `fact`.
- **`seo`**: the title, description and share image of every page the build creates. Either the single form above
  (one location each, every page type), or per page type: `shareImageFrame` `{"width": 1200, "height": 630}`, records
  of the places (`"menuItem": {"title": [loc], "description": [loc, loc], "shareImage": [loc], "ogTitle": {...}}`,
  `"article": {...}`), and `pageTypes` mapping every page type of the recipes to the name of a record or to its own
  record; a field may be `{"derived": "<what the template draws it from>"}` instead of locations. The share image is
  always 1200 by 630 (`SHARE_IMAGE_FRAME`). Both forms declare:
  - `titleLimit` and `descriptionLimit`: the longest title and description the build writes, in characters, positive
    whole numbers, with `limitsWhy`. They are search result display limits, not template measurements: 60 for a title
    (smaller only when the template prints the browser title somewhere visible with a tighter measured limit, said in
    `limitsWhy`), 160 for a description. JA Boxing: 60 and 160 (it prints the browser title on no page).
  - per page type, `ogTitle`: `{"sameAs": "title", "locations": [loc]}` (or `"derived"` in place of `locations`), the
    share title (og:title). It is the SEO title, the browser title that carries the business name, never the short
    heading the page shows: the build writes the page's `title` value again at those locations, within `titleLimit`.
    On T4 an empty og_title falls back to the article title on an article page and to the contact's name on the
    contact page, so JA Boxing writes it on every page (a menu item's `params.og_title`, an article's
    `attribs.og_title`).
- **`library`**: `{"position": "<position>", "pageTypes"?: {"<page type>": "<position>"}, "containerClass": "<class>",
  "why"}`, the template position the Tracy library blocks are published in, the page types whose layout lacks it with
  the position they use instead, and the class of the template's own page width container a library block's content
  sits in (the write step passes it to the block's render as `containerClass`). Measured on the running template, never
  read off a layout file alone. JA Boxing: `container` (its positions wrap modules in `t4-section-inner container`, and
  a probe block starts and ends where the template's own headings do at 390, 768 and 1440 px).
- **`buildSets`**: every reference of a kept record to a record the build creates (the draft report classes them
  `build-sets`), by `<entity>:<column>:<path>`: `{entity, column, jsonPath, sets, pageType, why}`, the place the build
  writes the new record's id into (a list's category).
- **`overrides`**: `settings` (a location and the value written in the blank site: site name, body background, a
  template global setting) and `language` (a language key and its value source: `value`, the string written; `filledBy`
  `[{block, field}]` with the smallest `limit` of those fields, a template string a field fills, written once; or
  `keep` with the reason, a string no business word reaches). A language string a store field fills must have its
  entry with its `slot`, `filledBy` exactly the fields that fill it, and a `limit` no larger than the smallest of their
  limits.
- **`notEmptied`**: `[{entity, slot? | column?, why}]`, what the blank site keeps as the demo has them, though it holds
  demo words: a whole record (a trashed module no block of the store is), one slot of it (a module title no page
  prints), or one column outside the content map (`{"entity": "module-180", "column": "title"}`). Every place the
  draft report lists outside the store or unlisted (other than `kept`, whose reason is in the report) on a module or
  custom field row the file writes nowhere must be named here, and a declared entity no location names must be too.
- **`inlineMarkup`**: `{class, count, owners}`, the class of the fields whose stored value carries inline markup (each
  declares its `inline` in the block store) and its owners: the write step (#597) and the gate (#585).
- **`networkIconClasses`**: the template's table from a social network to the class of its own icon font,
  `{"classes": {"<network>": "<class>"}, "why": "<how the classes were confirmed>"}`. Required when the store has an
  icon field with `iconOf: "network"` and `storage: "class-name"`. Each key is a network the build recognises (the
  `network` of `SOCIAL_NETWORKS`, `domain/icon-social.mjs`: `facebook`, `instagram`, `x`, `tiktok`, `youtube`,
  `linkedin`, `pinterest`, `threads`, `whatsapp`, `telegram`, `snapchat`); each value is a non empty class. List only a
  class the shipped font really draws, confirmed on the running template (a class the font lacks shows a missing glyph
  box). A network missing from the table is treated like a link to no known network: the write step hides the row's
  icon with its link and writes nothing into the row (reason `social_icon_not_in_template`), the same spirit as the
  rule that an icon with no known network is hidden with its link (`icon-row-links.mjs`). JA Boxing:
  `{"facebook": "fab fa-facebook", "x": "fab fa-twitter", ...}`; its fonts draw no Threads mark, so `threads` is left out.

The mapping file is generated, never edited by hand: `packages/cms/tracy-quickstart-tools/ai-quickstart/mapping.mjs`
writes it from the block store, the page recipes, the draft report, the draft decisions, the template's content map and
the reviewed `mapping-decisions.json` beside them; `ai-quickstart-mapping-reproducible.test.mjs` pins its bytes.

**The blank site empties what the mapping declares.** `scripts/ai-quickstart/blank-site.mjs <installer> --out <zip>
--mapping <mapping.json>` adds the step `empty-declared-fields`
(`packages/cms/tracy-joomla-quickstart/scripts/blank-site-empty-fields.mjs`): every field and fact place of a record
the blank site keeps becomes empty (a whole column, a JSON path, a nested JSON value, an HTML node through
`empty-html-places.php`), an `UPDATE` that sets such a row is folded into it first, and a design line, a created
record and a derived entry are left alone. Template Site settings, T4 global settings and template strings live in
files, so the step adds `templates/<tpl>/local/etc/site/<profile>.json`, `templates/<tpl>/local/etc/global.json` (T4
reads a local file instead of the shipped one, without merging) and `language/overrides/<tag>.override.ini`. A
`globalConfiguration` place is written by the installer from what the installation is given, and is reported as such.
The demo data parser reads `DELETE FROM` statements and keeps them in order.

**Every emptied place stays addressable.** After the step, each declared address still names exactly one node, so the
build writes into it: an attribute keeps its name with an empty value, an element keeps its tag and attributes and
loses its children (the plugin writes an element as a whole unit), and a text node (`p/text()`, `text()[2]` after a
`<span>`) keeps its own leading and trailing white space, or one space when it had none. An empty text node is not
written out, so its address, and the index of every text node after it, would be gone; white space draws nothing and
keeps both. A place counts as empty when its value, trimmed, is empty. Test D of `ai-quickstart-mapping-sweep.test.mjs`
runs the step on the demo rows and resolves every address of the mapping file.

## The blank site contract

**The build binds the blank site to the blank site contract, never to the released contract.** The Claude Cowork
plugin writes a site only through `content.contract` apply on a bound site, and its bind finds every entity of the
contract by its identity, refusing a site where one is missing (`Missing or ambiguous entity`). The released contract
of the template (`packages/cms/tracy-joomla-quickstart/contracts/<slug>/j6/<version>/`) names every demo page,
article, category, contact and account, and the blank site deletes them, so binding it fails. The released contract
is sealed and never edited; the blank site contract is a new artifact in the AI quickstart folder:

```
<AI quickstart folder>/blank-site-contract/manifest.json          id <slug>-blank/<cms>/<version>, blankSiteOf
<AI quickstart folder>/blank-site-contract/content-map.json
<AI quickstart folder>/blank-site-contract/presentation-lock.json
```

It is made by the blank site command, in the same run as the blank site:

```
node scripts/ai-quickstart/blank-site.mjs <human quickstart .zip> --out <blank site .zip> \
  --mapping <folder>/mapping.json \
  --contract packages/cms/tracy-joomla-quickstart/contracts/<slug>/j6/<version> --contract-out <folder>/blank-site-contract
```

What it holds (`packages/cms/tracy-joomla-quickstart/scripts/blank-site-contract.mjs`):

- **The records the blank site keeps.** A record is removed when the blank site step deleted its row, when the step
  emptied its whole table, or when its identity names a removed record (a profile line of a deleted account). The
  command reads this from the demo data before and after the step, and refuses to write when the contract's own rows
  (`lockDump`) give another answer. The content map keeps the entities and slots of the kept records and drops every
  entry naming a removed one; the lock keeps their rows, the module assignments the step did not remove, the access
  rules of kept records, an inventory count of 0 for a kind with no kept record (the plugin reads the count through
  the entities it resolves), and the sha256 of each file the blank site adds under a locked folder (T4's
  `local/etc/global.json`).
- **Identity as the blank site stores it.** A module title is both a content place and part of the identity, so each
  identity field is read from the blank row; modules whose five identity fields then agree carry their `id`, the rule
  of the capture tool.
- **Each emptied place opens empty** (`blank-site-contract-samples.mjs`). The plugin compares a written value with the
  slot's `sample`: it refuses to fill a slot whose sample is empty (`Content cannot activate an empty slot`) unless the
  slot carries the plugin's own `opensEmpty`, and refuses to empty a slot whose sample is not
  (`Content cannot remove an occupied slot`). A slot the mapping file names as a whole place gets `sample: ""` and
  `opensEmpty: true`. A slot holding pieces (an HTML value whose nodes the build writes) gets as its sample the
  released sample with those pieces emptied by `empty-html-places.php`, byte for byte the value the blank site stores,
  and stays occupied. Every other slot is the released one. So the contract says what the blank site holds and carries
  no demo text the blank site no longer has.

What that means for a write, measured through the real door of a blank site (#584):

| Write | Blank site contract |
|---|---|
| fill an emptied place | written |
| change it later | written |
| empty it again | written; a text node takes one space, since an empty string takes the node away (`HTML slot is missing or ambiguous`) |
| leave a place empty | send nothing for it, or send `""` |
| empty a slot that holds pieces | refused, `SLOT_EMPTY_STATE` |
| a straight double quote in a place that opens empty | refused, `SLOT_NOT_CONTENT` (the plugin's rule for an opened slot): write typographic quotes |
| a module title the blank site emptied | Joomla saves no module without a title (`Module must have a title`): write the title in the same apply as the first other value of that module |
| a slot of a record the blank site removed | refused, `SLOT_UNKNOWN`; the build writes the records it creates with the open writes (`content.batch`) |

The plugin's receiver corrections (`lib/slot-corrections.json`, `lib/hideable-slots.json`) are keyed by the released
contract id and its content map hash, so they do not apply to the blank site contract: its slots carry the released
limits only, and `rows.remove` removes a node of an HTML value but no reviewed row.

**The contract check guards it.** For a Joomla AI quickstart folder with a written mapping file,
`node scripts/ai-quickstart/check.mjs` requires `blank-site-contract/` and checks it against the released contract
its `blankSiteOf.contract` names (`blank-site-contract-check.mjs`): the id; the sha256 of each released file (a
changed release means making the blank site contract again); the entities, in released order and equal but for
identity; every slot equal to the released one, or, for a place the blank site empties, opened as above; no removed
record named anywhere; every mapping location on a kept record has its slot, and none on a record the build creates.

**The door proof.** `scripts/ai-quickstart/door-proof.mjs <AI quickstart folder>` proves on a throwaway blank site that
the build writes through the real door (gate #585). The site runs the plugin release the quickstart pins, its
`contract` parameter names the blank site contract and that profile is on disk; the URL and the site token come from
the environment (`TRACY_DOOR_URL`, `TRACY_DOOR_TOKEN`). It binds, writes one place of every address kind and every text
node place in one apply, reads each back, checks three refusals (a removed record, an unknown slot, emptying an
occupied slot), empties a filled place again, and checks the home address does not turn into a server error.

## The Tracy library

Blocks Tracy owns, for data a template has no block for, are declared in
[`packages/wo/website-opportunities/domain/library/tracy-library.json`](../../packages/wo/website-opportunities/domain/library/tracy-library.json)
(schema `tracy-ai-quickstart-library/v1`) in the block store format above, and passed to the plan composer as
`library` (`TRACY_LIBRARY`). Every rule of a block store block holds, plus:

- `source` is `library`.
- `designVariables` binds each design role the block's stylesheet reads to the template design variables that give it:
  `{"accent": {"variables": ["--color-primary"]}, "surface": {"variables": ["--bg-item-1", "--body-bg-color"]}}`. The
  first variable the template sets wins. Only a role that is not a colour (`headingFont`, `bodyFont`, `radius`) may end
  with a literal `fallback` (a length, a number or a font keyword), so a library block never carries a colour of its own
  and follows the template in light and dark alike.
- A `link` field carries a link kind of the vocabulary (a role ending in `_url`); `tracy-reviews` declares its
  `listingUrl` as `contact.social_url`, the business's public profile link.
- `positions` is the generic position `content`. The write step (#597) resolves it to a real position of the template
  through the template's mapping file (`mapping.json`); nothing in the library declaration, the plan composer or the
  block's render places the block on a page.
- Each library block type has content rules (`libraryItemProblem`, `domain/library.mjs`). The rules gate refuses an
  item the block would not show (code `library_rule`, reported only when the item is of a kind the block shows; an
  item of another kind is `wrong_item_kind` alone) and the extra data placement leaves it out with the reason.

The first library block is `tracy-reviews` (#596): at most six Google reviews of four or five stars, in the reviewer's
own words (never cut; a review longer than the text limit is set aside), each linked to the Google listing.

- **Google only.** A review is shown only when one of its sources has origin `google`; a website testimonial with stars
  is set aside (`it is not a Google review`), refused by the gate and left out by placement. `renderReviewsBlock`
  reads a needs profile item's source ids through `content.sources` (the profile's sources).
- **Reviewer name.** Titles before the name (Dr, Mrs, Prof...) and suffixes after it (Jr, III, PhD...) are dropped,
  then the first name and the initial of the last name part with a period ("Mara T."); a single name part is shown
  alone; the first letter and the initial are capitals where the script has case. Google's placeholder "A Google
  User", an empty name and a name longer than the author limit (40) set the review aside. Scripts written without
  spaces or family name first keep the same simple rule (`domain/library-reviews-names.mjs` says why).
- **Listing link.** `checkedListingUrl` (`domain/library-reviews-listing.mjs`) accepts https Google Maps addresses only:
  `maps.google.<tld>`, `www.google.<tld>/maps/...`, `g.page`, `maps.app.goo.gl`, and the Maps link Tracy builds from a
  place id (a Places API name `places/<id>` loses its prefix). Google's `/url?q=` redirect and every other host are
  refused. A `listingUrl` the caller passes and the profile's Google source go through the same check; a missing or
  refused link raises `ReviewsBlockError` `listing_missing`.

`renderReviewsBlock` (`domain/library-reviews-render.mjs`) returns its markup and its stylesheet. Links read the
template's accent text variable `--ds-c-accent-text` first, then `--body-link-color`, then `--color-primary`.

`checkLibraryDeclaration` checks the file; the command below runs it when called without folders, and also checks
every stylesheet of the library folder for colour literals (`colourLiterals`, `domain/library-style-check.mjs`, the
same check the block's tests run).

## The contract check

`checkAiQuickstartContract({blockStore, pageRecipes, mapping})` (WO domain) reports **every** problem, each as
`{file, at, message}`, for example
`block-store.json blocks[hero-home].fields[heading].limit: a text field needs a limit`.

```
node scripts/ai-quickstart/check.mjs                 every AI quickstart folder under packages/cms/
node scripts/ai-quickstart/check.mjs <folder>...     only those (a draft before it is committed)
```

It runs in CI as gate `ai-quickstart-contract` of `scripts/check-all.ts`. Its unit tests are
`packages/wo/website-opportunities/test/domain-ai-quickstart-contract.test.mjs` (one case per failure kind) and
`scripts/test/ai-quickstart-contract-check.test.mjs` (the command).

## Every stored place is accounted for (the draft)

Anything a visitor can see that is not declared is invisible to the system: the blank site step does not empty it and
the build does not overwrite it. The draft (`packages/cms/tracy-quickstart-tools/ai-quickstart/draft.mjs`) therefore
accounts for every slot of the content map as exactly one of: a field place (a field, an item field or a child field),
a report entry with a class (`derived`, `unlisted` with `as`, `omitted`, `sparse`), a value outside the store with a
class (`outsideStore` in the draft decisions, by content map key or by entity: a trashed module, a template string),
or a record of an entity kind the blank site step removes (`removedWithPage`). It writes nothing while one slot is
none of these, and `draft-report.json` carries the totals per class (`summary.coverage`), which add up to the slots
of the content map.

**References to other records.** A surviving record's settings may point at another record: a menu item id, an
`Itemid=` link, a category, article, user or tag id, a demo picture path. After the blank site step deletes that
record, the block lists nothing, links nowhere or shows a demo picture. The draft reads the contract's
`presentation-lock.json` and accounts for every such reference (`lib/draft-references.mjs`) as one of: a keyed field
(its `keyAt`), a field, design field or report entry at the slot that stores it, a value of a record outside the store
with a class, a reference to a record the blank site keeps (`target kept`), or a reference the draft decisions class
under `references` by `<entity>:<column>:<path>`: `build-sets` (the build writes the new record's id; `owner` names the
ticket, `#<n>`), `kept` or `not-drawn`, each with a reason. It writes nothing while one reference to a deleted record
or a demo picture is none of these; `draft-report.json` carries `references` (totals by class and the classed list).

## Choices made where spec #576 is silent

- Item counts are required on every block, not only repeating ones, so a missing count is never read as "one".
- Item fields are a separate list (`itemFields`), so a block's own heading and its items' fields cannot be confused.
- Design lines live in the mapping file; the block store declares design fields only by `type: "design"`.
- SEO fields are declared in the mapping file, not taken from the demo, because pages are created by the build: once
  for every page type, or per page type when the template stores them on different records (a menu item, an article).
- A business fact is declared once in `facts` and a field of its kind takes it by `{"fact": "<name>"}`, so one value is
  never written from two inputs.
- Page recipes are their own file, so the block store can be regenerated without losing the author's order.
