# Content model

| Kind of text | Where it lives | How to see it |
| --- | --- | --- |
| Page and post bodies, sections | `post_content` as block markup; every editable text, image, link and button is a block with `metadata.role = content` | `wp post get <id> --field=post_content` |
| Menus (main menu and four footer menus) | `wp_navigation` posts; the header and footer name them (`nav.mainmenu`, `nav.get-to-know-us`, `nav.guide`, `nav.need-help`, `nav.follow-us`) | `wp post list --post_type=wp_navigation` |
| Header and footer words, contact band | the `wp_template_part` rows `header`, `footer`, the file `parts/contact.html` | Site Editor > Patterns > Template parts |
| Site name | option `blogname` ("JA Impact"); the logo is the Site Logo (option `site_logo`, the demo's `logo.png`, light text for the navy bar) in three Site Logo blocks: header, drawer, footer; with no logo they show the site name as text, and the copyright line says `{year} {site.title}` | `wp option get blogname` |
| Contact form | Contact Form 7 form "Contact", placed on `/contact/` by a `core/shortcode` block | `wp post list --post_type=wpcf7_contact_form` |
| Masthead title and picture | the page's title and featured image (the cover block of the template uses the featured image) | Page > Featured image |
| Donation and event figures (raised, goal, location, date, fee) | post meta `raise`, `goal`, `location`, `start-date`, `event-time`, `event-location`, `event-fee`, registered by the must-use plugin `tracy-post-meta` | `wp post meta list <id>` |
| 404 words | option `wp_ja_impact_404_page` names a draft page; the template also carries default words | `wp option get wp_ja_impact_404_page` |
| Redirects | option `wp_ja_impact_redirects` | `wp option get wp_ja_impact_redirects --format=json` |

Adding a section: Patterns > JA Impact, insert `wp-ja-impact/acm-*`; fill the named blocks.
The listing pages (`/donations/`, `/events/`, `/blog/` …) are pages whose body is one listing
section; their cards are queries over posts, so adding a post adds a card.

Pages by template: `page-landing` (about, help, featured articles), `page-contact`, `page-login`,
`page-register`, `page-account`, `page-password`, `page-no-sidebar` and `page-sidebar-left`
(listings). Do not rename, move or unpublish the pages `login-form`, `smart-search` (a draft by
design: the theme answers its address) and the 404 draft.
