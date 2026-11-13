---
description: Format of the three declarations an AI quickstart carries (block store description, page recipes, mapping file) and the contract check that validates them in CI.
sources:
  - packages/wo/website-opportunities/domain/ai-quickstart-contract.mjs
  - packages/wo/website-opportunities/domain/ai-quickstart-mapping.mjs
  - packages/wo/website-opportunities/domain/place-content-roles.mjs
  - scripts/ai-quickstart/check.mjs
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
| `positions` | the layout positions the block may be placed in, at least one |
| `items` | required on every block: `{min, max}`, whole numbers, `0 <= min <= max`, `max >= 1`. A block that shows one thing is `{min: 1, max: 1}` |
| `noData` | required: `{"rule": "hide"}`, or `{"rule": "fallback", "fallback": "<what the block shows instead>"}` |
| `fields` | the block's own fields, written once per placed block |
| `itemFields` | optional: the fields of one item of a repeating block, written once per item |

A field is `{name, kind, type, ...}`, its name unique within the block:

| `type` | Needs | Notes |
|---|---|---|
| `text` | `kind`, `limit` | `limit` = most characters at the narrowest width, measured on the template |
| `link` | `kind` | |
| `image` | `kind`, `frame: {width, height}` | the picture's frame in pixels |
| `icon` | `kind` | |
| `number` | `kind` | |
| `design` | nothing; carries no `kind` | a design value of the template. **A build never writes it** |

A field whose kind is `editorial.design_element` is a design value and must be typed `design`.

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
whose main block is dropped is dropped, ADR 0046 decision 3).

## `mapping.json`

A **location** has the shape a content map slot already uses, so the existing plugin patch functions take it unchanged:
`{"entity": "module-12", "column": "params", "jsonPath": ["title"], "xpath": "/html/body/p"}`, where `jsonPath` and
`xpath` are optional. For a block, `entity` names the block's record in the store; the build writes into its copy.
`entity: "page"` names the page the build creates.

```json
{
  "schema": "tracy-ai-quickstart-mapping/v1",
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
  "overrides": {
    "settings": [{ "location": { "entity": "settings", "column": "MetaDesc" }, "value": "" }],
    "language": [{ "key": "TPL_EXAMPLE_READ_MORE", "value": "Read more" }]
  }
}
```

- **`blocks`**: one entry per store block, nothing else. `fields` gives a location for every field, design fields too.
  `itemFields` gives a list of locations per item field, one per item, at least `items.max` long.
- **`designLines`**: every config line of the block that is design (kept as the template has it). A design field's
  location must be one of them, and a field whose location is one of them must be typed `design`: that is how a design
  value typed as text is caught.
- **`facts`**: each business fact declared once, with every place the template shows it (fan out). Keys: `name`,
  `phone`, `address`, `email`, `social` (a location may add `network`), `logoLight`, `logoDark`. A fact the template
  never shows is left out.
- **`seo`**: required `title`, `description`, `shareImage`, written on every page the build creates. The share image is
  always 1200 by 630 (`SHARE_IMAGE_FRAME`).
- **`overrides`**: `settings` (a location and the value written in the blank site: site name, body background) and
  `language` (a language key and its value: system and template strings).

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

## Choices made where spec #576 is silent

- Item counts are required on every block, not only repeating ones, so a missing count is never read as "one".
- Item fields are a separate list (`itemFields`), so a block's own heading and its items' fields cannot be confused.
- Design lines live in the mapping file; the block store declares design fields only by `type: "design"`.
- SEO fields are declared once in the mapping file and apply to every page type, because pages are created by the
  build, not taken from the demo.
- Page recipes are their own file, so the block store can be regenerated without losing the author's order.
