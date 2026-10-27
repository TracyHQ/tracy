# Content and owner decisions

Read ../AGENTS.md. The site's words and images were ported from the Joomla 6 quickstart *Tracy
Base j6* (a T4-framework site) by the `tracy-wordpress-theme` skill; they belong to
Tracy and are edited on the site, never regenerated from the source over an owner's edits.

## Owner and licence

- Content: Tracy's. Everything on the site — company details, people, prices, addresses,
  testimonials, blog posts — is **demonstration data** until the owner replaces it. Do not
  invent replacements, and do not add "demo" disclaimers to the pages.
- Theme code: Tracy, GPL-2.0-or-later (`style.css`, `readme.txt`). Design tokens under
  `styles/` and `theme.json` derive from the OpenDesign design-system library (`apple`, `airbnb`),
  Apache-2.0 — keep the copyright block in `readme.txt` and `style.css`.
- Images: 36 media files imported from the source site. Their licence is the source's; the port
  did not re-check it.

## What the port changed on purpose

- **Slugs**: the Joomla sample-data aliases became names — `politics` → `website-planning`,
  `business` → `website-operations`, `world-news` → `studio-notes`, `food-and-drink` →
  `studio-life`, `grid-layout` → `website-services`, `list-layout` → `content-guides`,
  `technical` → `practical-guides`, `cool-workspace` → `inside-the-studio`, `demo-categories` →
  `explore-the-studio`, `magazine` → `insights`, `blog` → `journal`; and the three magazine
  routes `/resources/mag-procurement|mag-datacenter|mag-world` → `/resources/website-planning|
  website-operations|studio-notes`, each with a 301 in `tracy_base_redirects`. Every other page
  keeps its Joomla path (`/resources/faq`, `/services/service-detail`, `/company/about` …).
- **Home**: the source's landing layout (12 OpenDesign custom modules) became `tracy/section-*`
  library patterns on the front page; five "Landing - *" blocks the source assigned to the home
  menu item but never drew were not seeded.
- **Category views** became pages with Query Loop blocks so their paths survive; WordPress's
  own archives exist alongside.

## Gaps — recorded, not filled

| | Source had | Decision |
| --- | --- | --- |
| G1 | `/pages/news-feeds` (news feeds component) | 301 → `/resources/blog` |
| G2 | `/pages/wrapper` (iframe wrapper) | 301 → `/` |
| G3–G5 | `/resources/single-contact`, `/pages/contact-category`, `/pages/featured-contacts` (contact component) | 301 → `/resources/contact` |
| G6 | login, register, forgotten password/username forms | `wp-login.php` and its actions; forgot-username folds into lost password |
| G7 | front-end profile editing | `/wp-admin/profile.php` |
| G8 | breadcrumbs | dropped — core has no block, and no plugin was added |
| G9 | "popular articles" by hit count | a latest-posts Query Loop; WordPress does not count hits |
| G10 | five orphan landing blocks | not seeded (never rendered in the source) |
| G11–G13 | article meta wording, "N articles" counts on category lists, the search page's syntax help | accepted differences of the platform |
| — | a newsletter form | none created: the source's "Newsletter" is a document, not a form |
| — | `contact.phone` and `contact.address` slots of the quickstart contract | the contact-information section has no phone/address block; the contract writes them to options the theme does not render yet |

## Seed vs. site

A rerun of the seeder on an edited site finds every object by slug and a fingerprint in post
meta (`_tracy_seed`), updates what changed in the spec and skips the rest; it never deletes.
It is a rebuild tool for a fresh site, not an editing tool for a live one. Take a backup before
any rerun.
