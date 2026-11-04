# Content ownership

Read `../AGENTS.md`. Facts below are from `seed/seed.json` (21 collections, 84 entries, 21 posts, menu `primary`), `compile.config.json`
and the views. The seed describes the baseline only; discover current IDs from the installed CMS.

## Collections

| Collection | Fields (type) | Entries in seed |
|---|---|---|
| `pages` | title, body **portable text**, view, image, caption, lead_title, lead_text, `path` (its public address), `sections` **repeater** [collection, entry] (the section entries its view prints) | 16 (12 routed pages + 4 list pages of view `list`: blog, gallery, smart search, tagged items; the History page uses body, image, caption, lead_*) |
| `posts` | title, excerpt, body **portable text**, date, cover image, featured, featured_order, list_order, `path` (its public address), photos **repeater** [image]; taxonomies `category` (hierarchical), `tag` | 21 (13 articles, Chefs, 7 albums) |
| `slideshow` | title, items **repeater** [image, slide_title, slide_link], background, section_style, section_intro | 2 (home, gallery) |
| `hero` | hero_heading (lines = newlines), hero_intro **portable text**, hero_img, title, … | 2 |
| `features_intro` | title, description (portable text), img_features, items **repeater** [img_icon, title, description, btn_value, btn_link, short_desc, price], … | 3 |
| `menu` | title, items **repeater** [dish_name, dish_description, dish_price, dish_extra_class, dish_image], … | 9 |
| `tabs` | heading, position, title, … | 2 |
| `testimonials` | block_intro, title, items **repeater** [testimonial_text, author_name, author_img] | 1 (four items) |
| `statistics` | button_title, button_link, button_icon, title, items **repeater** [stats_count, stats_name, stats_color], … | 1 |
| `teams` | number_col, title, items **repeater** [member_image, member_desc, member_name, member_position], … | 1 |
| `timeline` | title, items **repeater** [date, icon, image, title, description], … | 1 |
| `opentime`, `opentable` | opening hours / an OpenTable id: not drawn | 1 + 1 |
| `happyhours` | hp_bg, hp_brand, hp_title, hp_desc, hp_info, hp_badge, hp_link_text, hp_link, hp_other_info | 3 |
| `chrome` (single) | brand_name, topbar_text, logo_dark, footer_*, copyright, and the template's own words (`skip_label`, `menu_label`, `prev_label`, `next_label`, `more_label`, `photos_label`, `gallery_link_label`, `not_found_*`) | 1 |
| `masthead` | title, description, background | 11 (`default` for pages with none) |
| `banner` (single) | image, price, points **repeater** [text], button_label, button_link | 1 |
| `category_info` | title, description, image (one per blog category) | 4 |
| `contact` (single) | form_title, form_note, form_id, card_title, card_text (portable text), details_title, image, address, phone, mobile | 1 |
| `reservation` (single) | title, intro (portable text), blocks **repeater** [image, image_alt, title, text, points, button_label, button_link], online_* | 1 |
| `subscribe` (single) | title, intro, placeholder, button, form_id | 1 |

Unlisted `…` = the shared `background`, `section_style`, `section_intro`. Image fields are forced to `image` in `compile.config.json`;
long text is `portableText` for `posts.body`, `pages.body`, `hero.hero_intro`, `features_intro.description`, `contact.card_text`,
`reservation.intro` (HTML of the source converted by `ingest/html-to-portable-text.mjs`). Short plain-text fields the source filled with
`<br>` hold newlines. Forms: `tools/forms.json` (`contact-en`, `subscribe-en`) bound by `template.config.json` `forms.bindings`.

## Which view reads which entry (code in `src/views/` and `src/components/sections/`)

- Home: `pages/home`, `slideshow/slideshow`, `hero/welcome-to-res-bar-restaurant`, `features_intro/features-intro` (collage), `features_intro/special-offers`, `tabs/discover-our-menu` with `menu/snacks-x-salads`, `entrees`, `dessert`, `testimonials/happy-customers`, featured posts by `featured_order`, album covers (strip), `chrome`.
- Blog list, category list, Featured Articles, Tagged Items (`BlogList.astro`): `posts` (`list_order`, `featured_order`), `masthead/blog|featured-articles|tagged-items`, `banner/banner`.
- Post (`Post.astro`): `posts/<slug>`, `masthead/blog`, `banner`, all posts (prev/next). Chefs is a post in category `pages`.
- Gallery and album (`Gallery.astro`): `slideshow/gallery`, album posts (`cover`, `photos`).
- Page family (`Page.astro`): About us `features_intro/about-us`, `statistics/you-re-in-good-restaurant`, `teams/our-team`; Menu `tabs/our-menu` + `menu/dessert-117`, `sea-food`, `icream-and-juice`; menu styles `menu/simple-menu`, `menu-with-image`, `2-column-menu`; Offers `happyhours/happy-hours-style-1..3`; Our History `pages/our-history` + `timeline/our-history`; Phone Reservation `reservation/reservation`; Contact `contact/contact`; All Categories `category_info/*`.
- Search (`Search.astro`): the search index over posts.
- Every page: `chrome`, `subscribe/subscribe`; Search and Home also read `testimonials`.
- 404: `chrome` fields `not_found_*`.
- `pages.path`, `posts.path` and `pages.sections` are a record of the above for Tracy's Content API (where an entry is served, which section entries a page prints; DECISIONS D52). The views and the router still decide what is drawn and where: editing `sections` in the admin changes no page, and a new route or section read is a change to `ingest/bind-paths.mjs` plus a seed rebuild.

## Cell kinds (field / setting / derived / static / unsupported)

| On screen | Kind | Source |
|---|---|---|
| Home h1 (list heading) | field | `pages.title` |
| Slide titles, links, images | field | `slideshow.items[]` |
| Welcome heading (2 lines), intro, image | field | `hero.hero_heading`, `hero_intro`, `hero_img` |
| Hero stars | static | literal in `Home.astro` |
| Offers title, description, item title/short/desc/price/photo | field | `features_intro` |
| Offers button (`btn_value`/`btn_link`) | field | `features_intro` (home collage) |
| Tab names, dishes, prices | field | `tabs.heading`, `menu.title`, `menu.items[]` |
| Post card title, excerpt, cover, date, badge | field / derived | `posts`; date formatted; badge = first `category` term |
| Post URL | derived | `/<category slug>/<slug>` (the same address is stored in `posts.path`) |
| Post page title, body, cover, category link | field / derived | `posts` |
| Prev / Next labels | field | `chrome.prev_label`, `next_label` |
| Masthead title/description/bg | field | `masthead/blog` (title falls back to post title) |
| Sidebar title | field | `chrome.categories_title`; list = derived from taxonomy |
| Testimonial text, author, photo (four, prev/next) | field | `testimonials.items[]` |
| Header top bar, skip link, menu/appearance labels | field | `chrome` |
| Logo | static / setting | `public/brand/*`; customer logo via site settings (`brand.ts`) |
| Navigation | field (menu) | `primary` (Home becomes the house icon) |
| Footer columns, copyright (`{year}`,`{name}` filled) | field / derived | `chrome` |
| Site title in `<title>` | setting | site settings, else `chrome.brand_name` |
| 404 code, title, text, button | field | `chrome.not_found_*` |
| Subscribe box | field | `subscribe` + the Forms plugin form `subscribe-en` |
| Gallery strip, features collage | field / derived | album `cover`s, `features_intro/features-intro` |
| Tags under a post and on lists | derived | `tag` taxonomy |
| Most Read, hit counts, author byline, OpenTable, Google Map | unsupported | not ported |

## Where edits go

A new page of a built family: add a `pages` entry with that family's `view` (the route table `src/lib/page-routes.json` is derived from the model's routes at build time: a new page needs its route there — today only the pages above). Navigation: the `primary` menu in the admin. A new post: `posts` with a category (and `list_order` to place it in the blog). New category: a `category` term plus a `category_info` entry of the same slug (its list address is `/<slug>` only for the four categories `BLOG_SIDEBAR` names in `src/lib/posts.ts`). Shared words: `chrome`.

## Rebuilding the seed

From `ingest/rebuild-seed.sh`, in order: copy `spec/site-model.json`; `prune-trashed-menu.mjs`; `enrich-model.mjs` (chrome, mastheads, featured flags, tags, `primary` menu); `enrich-pages.mjs` (page content; reads `ingest/albums.json` from `ingest/extract-albums.mjs`); `tools/compile-seed.mjs` with `compile.config.json`; `normalize-seed-dates.mjs`; `html-to-portable-text.mjs`; `build-media-map.mjs`; `tools/validate-seed.mjs`; `build-inventory.mjs`; `build-route-table.mjs`.
