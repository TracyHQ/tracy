# Content model

Read ../AGENTS.md first. The generated inventory (`generated/inventory.md`) lists every collection
and field from `seed/seed.json`; this page says what owns what.

## Five kinds of text on a page

`field` (an editor owns it, in the admin) · `setting` (site title/tagline, `postsPerPage`) ·
`derived` (counts, pagination, breadcrumbs, prev/next, related, sections lists) · `static`
(none left: the design-system and marketing kits were dropped with their pages) ·
none of the demo's Joomla-only pages exist here.

## Singletons (one entry each, `routable: false`)

| Collection | Page | What it holds |
|---|---|---|
| `site` | chrome + system pages | brand name/tagline, header button, theme labels, mega-panel titles and the feature card, footer column titles, social links + handle, the demo notice, breadcrumb/search/404/pagination/related labels |
| `home` | `/` | six sections scrolling past the cup (`cup_model` .glb file + `cup_still` image, see `docs/object-template.md`): the shop name (the site's `brand_name`) with `intro_lead` and its button · the story (`story_title`, `story_left`, `story_right`) · four reasons (`why_title`, `why_items`) · a close-up with labels (`detail_title`, `detail_labels`) · three featured menu items (`featured_title`, `featured_lead`, its button; the cards are `menu_items` ticked "featured", else the first three; none published: the site's `brand_name` and `brand_tagline` instead, and a card links into the menu only while the Menu page is published) · shop photos (`space_title`, `space_photos`), opening hours (the site's `hours`) and an order button into the menu (`visit_title`, `hours_label`, `contact_label`, `contact_url`) |
| `menu_page` | `/menu` | title, intro, the Order button (label + link; an empty link hides the button), the Call button label (its number is `site.phone`), the label of the group for items with no group |
| `blog` | list page | title, intro (+ topics labels) |
| `about` | `/about` | its sections (`chapter1_*`/`stats_*`/`chapter2_*`/`team_*`/`cta_*`) |
| `contact` | `/contact` | title, intro, `form_id` (written by `seed-apply forms`), information card (heading, email + label, notice, social heading + links, unavailable label) |

Repeaters are flat (EmDash `repeater` does not nest); the home and about pages therefore list its rows under
prefixed fields rather than as nested sections.

## Collections

| Collection | URL | Fields | Taxonomies |
|---|---|---|---|
| `posts` | `/blog/{slug}` | title, excerpt, image (+alt, caption), author, date, content, featured | `category` (4 terms: Coffee stories, Brew guides, Offers, Shop news) |
| `menu_items` | `/menu` (no page per item) | name, description (`excerpt`), price (free text), image (+alt), featured, sort | `menu_group` (the owner adds, renames, deletes and orders groups in the admin like Categories; an item may sit in several groups, one in none is listed last under the `menu_page` "more" label) |

Article slugs are plain slugs from the titles (`seed/field-map.json → slugRenames` is empty).

## Menus (`getMenu`)

`primary` (Home · Menu · About · News · Contact — News opens the Resources mega panel), `resources_read`,
`resources_help`, `footer_resources`, `footer_company`.

## Media

The seed carries no files: `seed/media-map.json` maps each of the 28 images (drawn for the café, `seed/media/images/coffee/`) to the fields it
fills (`targets[].path`, e.g. `team_members[2].image`, `space_photos[0].image`); `seed-apply media`
uploads once per content hash and patches the fields.
