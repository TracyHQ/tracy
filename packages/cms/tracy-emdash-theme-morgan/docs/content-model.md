# Content ownership

Read ../AGENTS.md and generated/inventory.md (the generated schema and counts describe the seed only; read current ids and edits from the installed CMS).

| Where | Collection (admin label) | What it holds |
| --- | --- | --- |
| Header, footer, top bar, 404, labels | `chrome` (one entry) | every word the template prints itself: `brand_name`, the top bar's address and phone, the labels, the 404 and search words, `copyright` (with `{year}` and `{name}`), the footer credit and licence note, the three social addresses |
| Footer link columns | `footer_links` (23 entries) | one entry per link: `column`, `label`, `link` (empty = plain text) |
| Page records (title, visibility, header menu) | `pages` | one entry per page: home, about-us, services, contact-us, blog |
| Posts | `posts` + taxonomy `category` | title, excerpt, body, cover, author, avatar, tags, dates |
| Home | `slideshow`, `features_intro`, `accordion`, `testimonials`, `teams`, `clients` | entries `home-slideshow`, `home-intro`, `home-services`, `home-missions` (+ `home-missions-list`), `home-cases`, `home-philosophy`, `home-team`, `home-consult`, `clients`, and the quote band `footer-quote` |
| About | `features_intro`, `teams`, `masthead` | `about-intro`, `about-careers`, `about-people`, `about-team`, masthead `about-us` |
| Services | `features_intro`, `testimonials`, `masthead` | `services-tiles`, `services-cases`, `services-praise`, `services-cta`, masthead `services` |
| Mastheads of the other pages | `masthead` | `blog`, `post`, `search`, `not-found` |
| Contact | `contact` (one entry `contact-info`) | words, address, phone, e-mail, website, picture, `form_id` (bound by `template.config.json` forms.bindings) |

Navigation: menu `primary` (Admin > Menus). A new page is a `pages` entry, a route in `src/pages/[...path].astro`, a view, and a menu item. Keep business copy in the CMS fields, never in HTML blobs.
