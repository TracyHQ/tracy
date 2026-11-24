# Content ownership

Read ../AGENTS.md and generated/inventory.md (the generated schema and counts describe the seed only; read current ids and edits from the installed CMS).

| Where | Collection (admin label) | What it holds |
| --- | --- | --- |
| Header, footer, 404, search, every word the template prints itself | `chrome` (one entry) | `brand_name`, the Donate now button (`donate_label`, `donate_link`), the four footer link columns (`footer_col1..4_title` / `_links`, one `Label` or `Label \| /path` per line), `copyright` (`{year}`, `{name}`), the labels and the Stay connected / Funds / Events / Blog section words, `logo_dark`, `form_id` |
| Page records (title, visibility, header menu) | `pages` | one entry per page: home, about, donations, events, blog, contact, help-faqs |
| Blog | `posts` + taxonomy `category` | title, excerpt, body, cover, banner, author, avatar, tags, dates |
| Our causes | `donations` | title, excerpt, body, cover, banner, location, raise, goal, tags, `ordering`, `featured` |
| Our Events | `events` | title, excerpt, body, cover, banner, start date, time, location, fee, card and date colours, button link, `ordering`, `featured` |
| Home and About sections | `hero`, `features`, `cta`, `contact_info`, `social`, `accordion` | entries `home-hero`, `home-helpline`, `home-donor-base`, `home-raise-fund`, `what-we-do`, `meet-us`, `home-connected`, `about-activities`, `about-mission`, `about-give`, `join-together`, `faq`, `topbar-contact`, `footer-contact`, `home-follow`, `footer-follow` |
| Mastheads | `masthead` | one per page: `about`, `donations`, `events`, `blog`, `contact`, `faq` |
| Contact | `contact` (one entry `contact`) | words, address, phone, e-mail, the hours, `form_id` (bound by `template.config.json` forms.bindings) |

Navigation: menu `primary` (Admin > Menus). A new page is a `pages` entry, a route in `src/pages/[...path].astro`, a view, and a menu item. Keep business copy in the CMS fields, never in HTML blobs.
