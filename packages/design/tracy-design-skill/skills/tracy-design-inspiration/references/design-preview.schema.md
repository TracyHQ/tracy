# `docs/agents/design-preview.json` — what the agent reads off the site, what the preview surfaces draw

Written by the agent in **step 1** of `tracy-design-inspiration`, in the site folder (the agent's cwd on a
lane, `/site/<label>`), next to the deck's `docs/agents/issue-tracker.md`. Read by the Design
inspiration tab, the three chat cards and the "Open preview" dialog (`@tracy/dsh-design-inspiration`).
One file per site; rewrite it whole when the site is re-read.

Every string is **copied from the site**, not composed. A field that could not be read is `null` (or
an empty array), never a plausible guess — a preview that shows an invented headline is a preview
the customer will believe.

```json
{
  "schemaVersion": "tracy-design-preview/v1",
  "readAt": "2026-09-05T14:20:00Z",
  "site": {
    "name": "JoomlArt",
    "url": "https://www.joomlart.com/",
    "nav": ["Templates", "Extensions", "Blog", "Support"],
    "eyebrow": "Responsive Joomla templates and premium templates club",
    "headline": "Powerful tools, exceptional design — the all-in-one Joomla platform.",
    "sub": "Unlock powerful tools for your Joomla websites.",
    "cta": "Explore all features",
    "cta2": "View features",
    "image": "https://static.joomlart.com/images/template/ja-vega/slideshow/ja-vega-joomla-business-template.jpg",
    "imageSource": "hero"
  },
  "pages": [
    { "path": "/", "type": "home", "label": "Home", "data": {} },
    {
      "path": "/joomla/templates/",
      "type": "listing",
      "label": "Joomla Templates",
      "data": {
        "title": "Joomla Templates",
        "items": [{ "name": "JA Voyara", "kind": "Travel", "img": "https://…/home-thumb.jpg" }]
      }
    },
    {
      "path": "/blog/",
      "type": "article",
      "label": "Blog",
      "data": {
        "title": "Three new templates launched",
        "meta": "JoomlArt · Blog · 5 min read",
        "img": "https://…/t4-page-builder.jpg",
        "lead": "JA Stratum for SaaS and startups, …",
        "body": ["Each of the three ships with T4 Page Builder layouts, …"]
      }
    },
    {
      "path": "/pricing/",
      "type": "pricing",
      "label": "Pricing",
      "data": {
        "title": "Choose the plan that fits you",
        "plans": ["JA Starter", "JA Template", "JA Extensions", "JoomlArt One"],
        "prices": ["$59", "$99", "$149", "$232"],
        "hot": 2,
        "rows": [["Templates", "1", "1", "—", "All"], ["Support", "6 months", "1 year", "1 year", "1 year"]]
      }
    }
  ],
  "log": [
    { "date": "Aug 2026", "title": "Three new templates launched", "dek": "JA Stratum, JA Nexora and JA Voyara.", "tag": "Templates" }
  ],
  "unmatched": [
    { "path": "/checkout/", "why": "a checkout flow; no page type draws it honestly" }
  ],
  "picks": [
    { "id": "apple", "why": "keeps the clean, product-led spirit" },
    { "id": "stripe", "why": "tighter, more technical" },
    { "id": "airbnb", "why": "warmer, photography first" }
  ],
  "chosen": { "id": "airbnb", "at": "2026-09-05T15:02:11Z" }
}
```

## Fields

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | string | exactly `tracy-design-preview/v1` |
| `readAt` | ISO 8601 | when the site was read |
| `site.name` | string \| null | the brand name as the site writes it |
| `site.url` | string | the URL that was read |
| `site.nav` | string[] | top-level menu labels, in order, at most 6 |
| `site.eyebrow` `site.headline` `site.sub` | string \| null | the home hero's three text lines, verbatim |
| `site.cta` `site.cta2` | string \| null | primary and secondary call-to-action labels |
| `site.image` | string \| null | absolute URL of the hero image, or `null` |
| `site.imageSource` | `hero` \| `largest-home` \| `largest-webroot` \| `none` | which rule chose it — `none` iff `image` is `null` |
| `pages[]` | array | one entry per page that fits a type, in menu order; `home` first |
| `pages[].path` | string | the site's own path, as in its URLs |
| `pages[].type` | `home` \| `listing` \| `article` \| `pricing` | the page-type library; new types are added to the plugin first, then here |
| `pages[].label` | string | the menu label the customer knows the page by |
| `pages[].data` | object | per type, below; `home` uses `site.*` and has `{}` |
| `log[]` | array | dated entries (posts, releases, news) for the `log` block; empty if the site has none |
| `unmatched[]` | array | pages left out of the preview, with one line of why each |
| `picks[]` | array of 3 | the agent's three inspirations for step 2, ids from the catalog |
| `chosen` | object \| absent | **written by the tab, not the agent**: `{ id, at }` when the customer pressed *Use this inspiration*. Read it at the start of a turn; if present, the customer has decided and step 3 begins with that id |

### Which tool fills which field

Every value is read through a tool call the seat book records; nothing is typed from memory. Since
05/09 the content door is `tracy_site` (see `SKILL.md` step 1); the public page is the check, not the
source.

| Field | Filled from |
|---|---|
| `site.name` | `tracy_site info` has no name; take it from `web_fetch` of the public URL (`<title>`, logo alt) |
| `site.url` | `https://<siteKey>` from `.tracy/site.json` |
| `site.nav` | Joomla: `tracy_site content.list kind:menuItem` — `published: 1`, main menu, `level: 1`, in order · WordPress: `content.list` rows with `in_menu: true`, by `menu_order` |
| `site.eyebrow` `site.headline` `site.sub` `site.cta` `site.cta2` | the featured article (`content.get`) and module titles (`content.list kind:module`); confirmed against `web_fetch` of the home page |
| `site.image` + `site.imageSource` | `hero`: `intro_image`/`full_image` of the featured article · `largest-home`: the biggest `<img>` `web_fetch` shows · `largest-webroot`: first row of `tracy_site media.scan` |
| `pages[].path` `pages[].label` | `content.list kind:menuItem` — `path` and `title` |
| `pages[].type` | the menu item's `link`: `view=featured`/`view=article` → home/article · `view=category` → listing · a page whose words say pricing → pricing · else `unmatched` |
| `pages[].data` (`listing`) | `content.list kind:article` filtered by the category the menu item links to (`catid`) — `name` = title, `kind` = `category_title`, `img` = `intro_image` |
| `pages[].data` (`article`) | `content.get kind:article` — `title`, `introtext` as `lead`, `fulltext` paragraphs as `body`, `images` |
| `pages[].data` (`pricing`) | `content.get` of that page's article; prices are copied, never rounded or invented |
| `log[]` | `content.list kind:article` ordered by `created`, most recent first, `category_title` as `tag` |
| `unmatched[]` | menu items whose `link` fits no type (contact, forms, external) |
| `picks[]` | written by the `tracy_design_propose` tool |
| `chosen` | written by the Design inspiration tab |

### `data` per type

| Type | Keys |
|---|---|
| `listing` | `title`, `items[] { name, kind, img }` — up to 6 items; `img` may be `null` |
| `article` | `title`, `meta`, `img`, `lead`, `body[]` — `body` is paragraphs, up to 3 |
| `pricing` | `title`, `plans[]`, `prices[]` (same length, real prices), `hot` (index of the highlighted plan or `null`), `rows[][]` (first cell the row label, then one cell per plan) |

## What the surfaces do with it

- The **hero band** on every one of the 152 cards uses `site.nav`, `site.headline`, `site.sub`,
  `site.cta`, `site.cta2`, `site.image`. With `image: null` the band drops the image slot and says
  the site has no image — it does not fill the slot.
- The **"Open preview" dialog** walks `pages[]` in order, one page type per iframe. `unmatched`
  is listed at the end as text, not drawn.
- Absent file → the surfaces show the inspiration's own fixture only and say the site has not been
  read yet. Nothing is fabricated to stand in.
