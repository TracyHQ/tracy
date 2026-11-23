# Content gaps — what the source does not give, and what the template does about it

Each row is something the source site lacks or fakes. Nothing here was invented in the template: a missing piece is empty, hidden or plain text.

| ID | Gap | What the template does |
|---|---|---|
| G-1 | Alt text: the Joomla quickstart carries none for any picture (gallery `gallery_alt` is a caption, not alt text). | Pictures print `alt=""` unless the entry holds alt text; the gallery caption is the entry's own `gallery_alt`. |
| G-2 | Social links, tile links, "Learn more", footer "Privacy Policy / Health & Safety / FAQ" and the share buttons are `#` in the source. | Plain text or glyphs, no link (DECISIONS D11). The one linked footer entry is `chrome.footer_link_text` going to `chrome.footer_link_to`; the others are the lines of `chrome.footer_links_text` and print as plain text. |
| G-3 | The header "Book Table" button opens a booking dialog (`book_table` entry): its second button points to the contact page; there is no booking system behind it. | The dialog is ported as is; its order link goes to `/contact`. |
| G-4 | About page: the features-intro style-4 video is hard-wired to one YouTube video in the Joomla layout (its "Video ID" field changes nothing). | A click-to-play facade with the entry's own picture; nothing loads before the click (DECISIONS D11). |
| G-5 | Menu dishes, prices, opening hours, addresses, team names and testimonials are the demo restaurant's. | They are seed content: `seed/personalize.json` lists the claims that are removed and the prose that is rewritten for a customer's site. Dish prices are not in that list (open question for the owner). |
| G-6 | Blog posts are Lorem ipsum. | Kept as seed text. One post is a Joomla menu item (`blog-detail`); it is a normal post here (DECISIONS D10). |
| G-7 | The source's blog list has a second page (`?start=`) that the crawl did not reach; the article cards' "More Articles …" block lists the next page's first four titles. | The list is generated from the posts; page 2 is not part of the source mirror. |
| G-8 | The Joomla footer prints "Joomla! is Free Software released under the GNU General Public License". | Not ported: it describes the CMS, not the restaurant. |
| G-9 | Joomla utility pages (login, registration, profile, typography, offline, error, smart search, featured, author listing), Home 2 and Home 3. | Not ported (DECISIONS D6, D7). |
| G-10 | The source mirror's own `unresolved` asset references (24) are Google Fonts hosts and the Font Awesome files of the T4 plugin. | The fonts are shipped locally (D8); icons are drawn as inline SVG. |
