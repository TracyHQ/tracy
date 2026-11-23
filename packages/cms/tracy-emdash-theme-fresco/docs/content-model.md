# Content ownership

Read ../AGENTS.md and generated/inventory.md (the generated schema and counts describe the seed only; read current ids and edits from the installed CMS).

| Where | Collection (admin label) | What it holds |
| --- | --- | --- |
| Header, footer, top bar, 404, labels | `chrome` (one entry) | every word the template prints itself, incl. `book_label`, `footer_link_text` and `footer_link_to` (the one linked entry), `footer_links_text` (the plain-text entries, one per line), `copyright` (`{year}`, `{name}`), `logo_dark` |
| Page records (title, visibility, header menu) | `pages` | one entry per page: home, about, gallery, chiefs, menu, offer, contact, blog |
| Posts | `posts` + taxonomy `category` | title, excerpt, body, cover, author, avatar, tags, dates |
| Home | `hero`, `features_intro`, `menu`, `gallery`, `testimonials` | entries `home-hero`, `home-services`, `home-explore`, `home-events`, `home-sea/-land/-sky`, `home-gallery-1/-2`, `home-desserts`, `home-tea`, `home-testimonials`, `home-visit` |
| Menu page | `menu` | `menu-columns`, `menu-grid`, `menu-list-1`, `menu-list-2` |
| About, Chiefs | `features_intro`, `testimonials`, `teams`, `masthead` | `about-intro`, `about-features`, `about-testimonials`, `about-team`, `chiefs-team`, mastheads `about`, `chiefs`, `contact`, `blog`, `post` |
| Gallery | `gallery` | `gallery-one`, `gallery-two` |
| Offer | `happyhours` | `offer-hour-1..3` |
| Contact | `contact` (one entry `contact-info`) | words, address, phone, e-mail, `form_id` (bound by `template.config.json` forms.bindings) |
| Book Table dialog | `book_table` | text, phone, order link |

Navigation: menu `primary` (Admin > Menus). A new page is a `pages` entry, a route in `src/pages/[...path].astro`, a view, and a menu item. Keep business copy in the CMS fields, never in HTML blobs.
