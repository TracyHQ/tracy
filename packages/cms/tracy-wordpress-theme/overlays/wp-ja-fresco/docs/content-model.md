# Content model

Read ../AGENTS.md and architecture.md. The facts below come from the theme's files and from the
spec-pack the site was built from (`tasks/ja-fresco-wp7/spec/` in the Tracy repository). Counts of
what the seed created are **at seed time** (build stand, 21/10/2026): 10 published posts (all in
category `food`), category `food` plus four empty ones, 3 tags (`eat`, `food`, `meat`, each on every post), 64 media items, 10 users, 7 navigation posts. Check the
live site before relying on any of them (`wp post list --post_type=page --fields=ID,post_name,post_status`).

## Pages and routes

The spec-pack maps 20 routes plus a synthetic 404 (`spec/page-map.json`). Paths keep the Joomla
menu paths. The WordPress template a page renders with is in its `_wp_page_template` meta or falls
back to the hierarchy (`page.html`, `page-<slug>.html`, `front-page.html`).

| Path | Template on the build stand | Notes |
| --- | --- | --- |
| `/` | `front-page` | the page `front-page` is the static front page |
| `/home/home-2`, `/home/home-3` | `page-landing` | the home layout (`jf-layout-home`); home-3 carries the text slider (D-19) |
| `/about`, `/chiefs` | `page-masthead` | masthead then sections |
| `/gallery`, `/menu`, `/offer` | `page-landing` | the home layout |
| `/contact` | `page-contact` | contact details pattern, form heading, then the page content: one Contact Form 7 shortcode |
| `/pages/users/login-form`, `/pages/users/registration-form` | `page-login`, `page-register` | the page's sign-in block is replaced by the theme's form (`inc/groups/gd.php`, D-20) |
| `/pages/users/profile` | `page-account` | a signed-out visitor is sent to the sign-in page (303) |
| `/pages/j-content/featured-articles` | `page-masthead` | featured posts (D-24) |
| `/pages/j-content/category-blog` | default | blog listing with the "Page N of M" line next to the pager |
| `/pages/j-content/blog-detail` | `single` | served as the article the source opens there (D-03) |
| `/pages/j-content/author-listing` | `page-author-listing` | the author grid (D-21) |
| `/pages/j-pages/typography`, `/error-page`, `/offline-pages` | `page-masthead-article` | sample content under an article-style masthead |
| `/pages/j-pages/smart-search` | search | a **draft** page answered by the theme's search view |
| `/404` | `404` | synthetic, not a page |

The parent pages `pages`, `home`, `users`, `j-content` and `j-pages` exist so the nested paths
resolve; they are not linked as content.

## Templates, parts and what they read

- `templates/`: `404`, `archive`, `front-page`, `home`, `index`, `landing`, `page`,
  `page-account`, `page-author-listing`, `page-contact`, `page-landing`, `page-login`,
  `page-masthead`, `page-masthead-article`, `page-register`, `pricing`, `search`, `single`.
- Named groups the PHP looks for by `metadata.name`: `page.title` (masthead heading override),
  `single.masthead` and `page.article-masthead` (article picture), `404.body` (text of the 404
  page), `contact.band`, `contact.form`, `authors.band`, `authors.list`, `header.book-table`,
  `footer.welcome`, `footer.about`, `footer.reservations`, `footer.visit`, `nav.mainmenu`,
  `nav.about`. Do not rename them in a template or a part.
- Masthead heading: post meta `tracy_page_heading` overrides the page title in the `page.title`
  block when it is not empty.
- One `h1` per page: the visually hidden page title is printed as a paragraph when the page's own
  content carries an `h1` (the home pages' hero).

## Sections (patterns)

A section is a pattern `wp-ja-fresco/<name>` inserted into a page as a **copy**. The seeder fills
each from the spec by `patterns.map.json` (Joomla ACM module ids mapped to patterns; a block is
located by `metadata.name`). No synced patterns (`wp_block`) were created at seed time.

| Pattern | What it draws |
| --- | --- |
| `acm-hero` | hero with a picture background |
| `acm-features-1` to `-5` | picture cards; two offer panels; picture and text half and half; text beside a picture; icon cards |
| `acm-gallery-1` to `-3` | picture strip (steps when asked, D-05); picture grid; mosaic |
| `acm-happyhours-1` to `-3` | happy-hour offer on, beside, or framed in a picture |
| `acm-menu-1` to `-3` | priced dish lists; picture beside a priced list; dish cards |
| `acm-teams-1`, `acm-testimonials-1`, `acm-text-slider-1` | team cards; one large quote at a time; the line of titles (D-19) |
| `masthead`, `masthead-article`, `topbar`, `related` | used by templates and parts (`Inserter: no` for the mastheads) |
| `contact-info`, `contact-form-head` | the contact page's details and form heading |
| `finder` | the search view's form, its search tips and the results (`Inserter: no`, used by `templates/search.html`) |
| `tracy/cards` | overrides the source theme's cards pattern |

## Posts, categories, tags, authors

- Posts carry the blog: category `food`. "Related Posts" under an article lists the other posts
  that share one of its tags (the source's keywords equal its tags, D-04).
- An article's full-text picture is the first block of the post, an image with the class
  `jf-fulltext-image`; the single template draws it as the masthead background and leaves it out
  of the body. Without one, the featured image stands in.
- The source prints "Hits" in the article info line; WordPress has no counter, so it is left out
  (G8).
- The author grid lists users that carry the user meta `author_order`, in that order; job title is
  `job_title`, social links are `author_social` (one `service|url` per line). Avatars come from the
  must-use plugin `tracy-author-avatars` on the build stand.

## Search

`/pages/j-pages/smart-search` is the source's `com_finder` page. The theme maps it to WordPress
search: the page must exist as a **draft** (a published copy would take the path away from the
filter), and a menu link to it is drawn by the theme as a plain link. `/?s=` also works.
`templates/search.html` draws the draft page's masthead (its title, description and featured image:
the seed set the source's `pic-1`), then the `finder` pattern: the source's form ("Search Terms:",
field `q`, Search, the tips toggle and five tips paragraphs), the words of the query, and the matching
posts as blog cards or "No Results Found" (D-25 for the colour of that sentence). The source's search
index is empty, so the source always answers "No Results Found"; the port searches the posts.

## Menus

Seven `wp_navigation` posts at seed time. Which the theme's parts use:

| Post | Items | Used in |
| --- | --- | --- |
| `mainmenu` | Home (Home 1 to 3), Menu, Pages (Users, J! Content, J!Pages groups), About, Gallery, Chiefs, Offer, Contact; the spec marks "Pages", "Tagged Items" and Gallery's two children unpublished | header, `nav.mainmenu`; the mobile drawer is WordPress's overlay (D-10) |
| `about` | Reservation Policy, Privacy Policy, Health & Safety, FAQ | footer, `nav.about` |
| `tracy-footer-1`, `-2`, `-3`, `-3-2` | footer link columns the seeder created from footer modules; `-3-2` is a duplicate of `-3` | not referenced by the parts |
| `navigation` | WordPress's own fallback menu | not referenced |

## Options, meta and redirects

| Key | Meaning |
| --- | --- |
| `wp_ja_fresco_404_page` | id of the draft page `page-not-found`; its content is the 404 text |
| `wp_ja_fresco_redirects` | JSON rules `{from, to, status}`; exact path, query string carried over; applied only on a 404. Seeded: `/pages/j-content/blog-detail` to the article "Soul Kitchen Kumquat & Thyme Cocktail" |
| `tracy_motion` | motion settings; default is one effect `carousel-step`; `{"effects":[]}` turns motion off |
| `site_logo` | the header logo (the source's `logo.png`, alt "fresco", D-07) |
| `users_can_register`, `default_role` | registration open as on the source, role `subscriber` |
| post meta `tracy_page_heading` | masthead heading override |
| user meta `author_order`, `job_title`, `author_social` | the author grid |
