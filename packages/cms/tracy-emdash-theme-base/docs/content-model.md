# Content model

Read ../AGENTS.md first. The generated inventory (`generated/inventory.md`) lists every collection
and field from `seed/seed.json`; this page says what owns what.

## Five kinds of text on a page

`field` (an editor owns it, in the admin) · `setting` (site title/tagline, `postsPerPage`) ·
`derived` (counts, pagination, breadcrumbs, prev/next, related, sections lists) · `static`
(design-system swatches and specimens from `tokens.css`, the marketing sample documents) ·
none of the demo's Joomla-only pages exist here.

## Singletons (one entry each, `routable: false`)

| Collection | Page | What it holds |
|---|---|---|
| `site` | chrome + system pages | brand name/tagline, header button, theme labels, mega-panel titles and the two feature cards, footer column titles, social links + handle, the demo notice, breadcrumb/search/404/pagination/related labels |
| `home` | `/` | the OpenDesign landing: hero (+ mock caption), proof strip, problem/value/how cards, inline CTA, feature rows, stats, team quotes, FAQ, pricing tiers, final CTA |
| `onepage` | `/onepage` | anchored nav, hero (two title lines + image), about + chips, services, product parts, process steps, team members, FAQ, contact block, own footer |
| `landing` | `/landing` | ACM sections with prefixes: `hero_*`, `chapter1_*`, `features_*`, `stats_*`, `chapter2_*`, `pricing_*`, `testimonials_*`, `clients_*`, `cta_*` |
| `home_2` | `/home-2` | `hero_*`, `chapter_*`, `team_*`, `faq_*`, `stats_*`, `cta_*` |
| `product` | `/product` | `intro`, `hero_*`, `carousel_*` (+ `slides`), `tabs_*` (+ `tabs`), `stats_*`, `cta_*` |
| `services_page` · `blog` · `team` | list pages | title, intro (+ topics/notes labels) |
| `pricing` · `about` · `careers` · `help` | pages | their sections (`pricing_*`/`faq_*`/`cta_*`; `chapter1_*`/`stats_*`/`chapter2_*`/`team_*`/`cta_*`; `intro`/`timeline_*`/`cta_*`; `intro`/`faq_*`) |
| `contact` | `/contact` | title, intro, `form_id` (written by `seed-apply forms`), information card (heading, email + label, notice, social heading + links, unavailable label) |
| `design_system` | `/design-system` (+3) | page titles/intros and the specimen copy; swatches and scales are static |
| `marketing` | `/marketing` | eyebrow/heading/lead/note, the UI labels, `samples` (key/title/description) |

Repeaters are flat (EmDash `repeater` does not nest); each landing therefore lists its rows under
prefixed fields rather than as nested sections.

## Collections

| Collection | URL | Fields | Taxonomies |
|---|---|---|---|
| `services` | `/services/{slug}` | title, excerpt, image (+alt), content (Portable Text), sort, `listed` (false hides the entry from the `/services` grid — the "Website design & build" detail page), optional `faq_*` and `cta_*` | — |
| `posts` | `/blog/{slug}` | title, excerpt, image (+alt, caption), author, date, content, featured | `category` (8 terms with descriptions), `tag` (5) |
| `people` | `/team/{slug}` | title, name, role, excerpt, image (+alt, caption), content, sort | — |

Service slugs are the source's menu aliases (`website-strategy`…); article slugs are the Joomla aliases and five duplicates carry a category suffix
(`seed/field-map.json → slugRenames`).

## Menus (`getMenu`)

`primary` (Home · Product · Service · Pricing · Resources · Company — the last three open mega
panels), `service`, `resources_read`, `resources_design`, `resources_help`, `company`,
`footer_product`, `footer_resources`, `footer_company`. The one-page nav and footer links are
fields of `onepage` (anchors, not routes).

## Media

The seed carries no files: `seed/media-map.json` maps each of the 34 images to the fields it
fills (`targets[].path`, e.g. `team_members[2].image`, `content[3].asset`); `seed-apply media`
uploads once per content hash and patches the fields.
