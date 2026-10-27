# Content ownership

Read ../AGENTS.md and generated/inventory.md. The generated schema and counts describe
seed only; discover current IDs and edited content from the installed CMS. Business copy
stays editable in the CMS rather than as page-sized HTML blobs.

## Pages are compositions of sections

| Collection | What it owns |
| --- | --- |
| `pages` | One entry per URL that is not a blog post: `title`, `path` (the URL, e.g. `/pricing`), `view` (page family, see architecture.md), `style` (`terminal`, `blueprint`, `signal` — colour direction), `filter` (list pages: `category:<term>` or `author:<username>`), `body` (Portable Text, for single-article pages such as the legal pages), `sections` (ordered repeater of `{collection, entry}`) |
| `hero`, `clients`, `bento`, `incident_timeline`, `kineticql_split`, `features_ledger`, `features_intro`, `testimonials`, `cta`, `page_masthead`, `pricing`, `pricing_matrix`, `accordion`, `faq_support`, `prose_quote`, `teams` | Section entries. Each entry is one block of words, links, numbers and images; the look belongs to the component of its collection. One entry can be listed on several pages. |
| `posts` | Blog posts: `title`, `excerpt`, `body` (Portable Text), `date`, `cover` (image), `author` (display name), `author_role`, `featured`; taxonomies `category` and `tag` |
| `header_cta` | Header buttons (sign-in and primary call to action) |
| `social` | Footer brand block: brand name, tagline (`heading`), optional logo, social links (`network` is an icon name) |
| `footerlegal` | Copyright line and legal links |
| `newsletter` | Footer newsletter band words and `form_id` |

Icons are stored as names (`bell`, `git-branch`, `message-square`) and drawn from one icon set
(design-system.md). Image fields hold EmDash media objects.

## Menus and taxonomies

Menus: `mainmenu` (header megamenu and mobile drawer; items with URL `#` are group headings),
`footer-product`, `footer-dev`, `footer-company` (menu label = column title), `legal`.
Taxonomies: `category` (hierarchical), `tag`; both apply to `posts` and produce
`/product/blog/category/<slug>` and `/product/blog/tag/<slug>`.

## Forms

`tools/forms.json` defines `newsletter-en`; `template.config.json → forms.bindings` writes its id into
`newsletter/footer-newsletter.form_id`. Submissions appear in the admin under the Forms plugin.

## Where an edit goes

| Want | Do |
| --- | --- |
| Change words on a page | Edit the section entry shown there (the page's `sections` names it) and publish |
| Reorder, add or remove blocks on a page | Edit the page's `sections` list |
| New page | New `pages` entry with a unique `path`, a `view` (`page` for sections), a `style`, and sections |
| Navigation | Edit the menu in the admin; add the page first so the link resolves |
| New blog post | New `posts` entry with `date`, category and tags; it appears in lists once published |

Changing the path of a page changes its URL; update menu links that point at it.
