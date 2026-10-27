# Page Coverage Matrix — the full page model a production T4 template ships

> **Phases 4–5 packet (also the Phase 8 verify checklist).** This is the **build roster**: what you
> implement, override, and verify. Its companion is `catalog.md` (the selection menu). Terminology:
> the **mandatory floor** (must-have, `catalog.md` §6.1) is the minimum slice of this matrix; the
> **standard baseline** (§F, ~18–24 pages) is what the skill generates by default; **auto-extend**
> goes beyond, only when the source implies it.

This is the checklist of "all necessary pages" a complete T4 template must render and
restyle. It has **six tiers** — a real JoomlArt template is **~18–30 pages, not ~10**:

- **A. Page LAYOUTS** (`etc/layout/*.json`) — home + N home variants, inner/default,
  no-sidebar, landing, and detail variants. Real templates ship **2–9**.
- **B. ACM section blocks** (`acm/<block>/`) — the ~11 reusable, **editable** front-page
  sections (hero, features, services, testimonials, team, …).
- **C. Component / module override matrix** (`html/com_*`, `html/mod_*`) — the core Joomla
  views each layout fills.
- **D. Special / standalone pages** — `error.php`/`error-t4.php`, `offline.php`,
  `component.php`, plus custom (portfolio, author, coming-soon, landing).
- **E. Template STYLES** (`etc/theme/*.json` + the live `#__template_styles` rows) —
  real templates use **2–4**.
- **F. The recommended DEFAULT page set the skill generates** (~18–24 pages) vs the
  **auto-extend** set (shop/podcast/event/LMS, driven by the source + the template tree).

All counts below are evidence-backed from 8 shipped T4 templates (`ja_vega`, `ja_essence`,
`ja_nova`, `ja_titan`, `ja_trip`, `ja_spark`, `ja_prodex`, `ja_vogue`) + 2 T3
(`ja_teline_v`, `ja_morgan`). The counts below come from a page inventory taken across the shipped
JoomlArt catalogue;
the cites here come from it.

> Cross-links to gotchas: a template needs **≥2 styles** (#15), chrome must apply to
> **every** layout not just home (#16), and a menu item's explicit `template_style_id`
> beats the site default (#20) — so each extra home/landing layout needs its own style
> and the right menu items repointed at it.

---

## A. Page LAYOUTS (`etc/layout/*.json`)

One file = one page skeleton (a top-to-bottom **section stack** of rows; see
`layout-json.md`). A template style binds one layout site-wide (#15), so each functional
class below typically gets its own style. Three classes:

### A1. HOME variants (front-page section-stack layouts — the design's showcase)

The home layout is where the front-page story lives: stacked `hero / section-1 … section-9 /
cta / footer` rows, each row pulling an **ACM module** (tier B) or a `mod_custom` block.
Real templates ship **1 (lean) → 5–7 (multipurpose)** distinct homes; **median 2–3**:

| Pattern | Templates (cite) | Example files |
|---|---|---|
| Single `home.json` | prodex, nova, trip, vega | `home.json` (+ sections embedded) |
| Numbered `home-N.json` | essence (home-2…5 = 4), vogue (home-1/2/3/4/6 = 5) | `home-2.json`, `home-3.json`, … |
| Named-by-vertical homes | spark (`business`,`corporate`,`logistics`,`magz`,`product` = 5), titan (`crypto`,`home-horizontal`) | `business.json`, `magz.json`, … |

Counts: vega **5**, essence **6**, nova **3**, titan **9**, trip **3**, spark **7**,
prodex **2**, vogue **9** total layouts (homes + inner + detail). Generate **one home
layout per `home*.json` / named-home `*.json` present** in the source template tree.

### A2. INNER / DEFAULT layouts (content shells)

Every template ships **`default.json`** — the universal inner shell (sidebars +
breadcrumbs + the `component` column). Common siblings:

- `default.json` — inner shell with sidebar(s) (every template).
- `no-sidebar.json` — single-column inner (full-width content).
- `sub-detail.json` / `sub-layout.json` / `detail-sidebar.json` — a sidebar-detail shell
  (vega, nova, trip, vogue, essence each ship one).

### A3. LANDING / standalone marketing layout

- `landing.json` — chrome-light, single-purpose promo page (**spark** ships this). Generate
  when the source has a `landing*.json` or a clearly chrome-stripped marketing page.

### A4. DETAIL variants (per-vertical item shells)

Generated per `*-detail.json` / `sub-*.json` / named-view `.json` found in the source:

- `article-detail.json` (titan), `portfolio-detail.json` + `services.json` (vega),
  `event(-detail).json` + `podcast(-detail).json` + `crypto.json` (titan), `Header-1.json`
  (vogue alt header).

Evidence (cite directly):
`ja-titan/etc/layout/{crypto,event,event-detail,podcast,podcast-detail,article-detail,home-horizontal,Home,default}.json` (**9**);
`ja-vogue/etc/layout/{home,home-1,home-2,home-3,home-4,home-6,Header-1,sub-detail,default}.json` (**9**);
`ja-spark/etc/layout/{business,corporate,logistics,magz,product,landing,default}.json` (**7**).

---

## B. ACM section blocks (`acm/<block>/`)

**ACM = Advanced Custom Module** — the reusable front-page **section** widgets. Each
`acm/<block>/` dir is a configurable module *type* (its own params + tmpl) that an admin
drops into a home-layout `positions` row and **edits in the admin** (heading, items,
images, columns). This is the key distinction:

- **ACM block (editable section)** → a published module the owner can re-edit through the
  admin. Use ACM for the repeating, content-like home sections (features, team, pricing…).
- **static `block`** (`html/layouts/t4/block/*`) → frozen markup; reserve for genuinely
  complex hero/feature art only (principle 4).

T4 templates ship **2–9 ACM dirs** (lean blog/news templates like essence/titan ship only
**2** and instead drive sections via `mod_articles_category` layouts; multipurpose
prodex/nova/spark/vega ship **9**). The common **~11-block core** a multipurpose template
ships, with how many of the 8 templates carry each:

| ACM block | ships in | role / front-page section |
|---|---|---|
| `cta` | 6 | call-to-action banner |
| `features-intro` | 6 | feature grid / intro icons |
| `social` | 6 | social icon row |
| `hero` | 5 | top hero / slideshow header |
| `teams` / `team` | 5 | team member grid |
| `testimonials` | 4 | quotes carousel |
| `clients` | 4 | client / partner logos |
| `gallery` | 4 | image / portfolio grid |
| `pricing` | 3 | pricing tables |
| `accordion` | 2 | FAQ / collapsible |
| `text-slider` | 2 | rotating headline / quote |
| `statistics` / `statics` | 2 | animated counters / stats |
| `timeline` | 1 (spark) | process / history timeline |
| `slideshow` | 1 (vega) | full slideshow |
| `contact-info` | 1 (vega) | address / phone block |
| `container-tabs` | 1 (titan) | tabbed content |

**The common set the skill wires into the homes:** hero, features-intro/services, cta,
testimonials, teams, clients, pricing, gallery/portfolio, stats/statistics, accordion(FAQ),
social — **~11 blocks**.

Evidence (cite): `ja_prodex/acm/` = accordion, clients, cta, features-intro, hero, pricing,
social, teams, testimonials (**9**); `ja_spark/acm/` = clients, features-intro, gallery,
hero, pricing, statistics, team, testimonials, timeline (**9**); `ja_nova/acm/` = accordion,
clients, cta, features-intro, hero, pricing, social, teams, text-slider (**9**).

> How an ACM block reaches the page: see `layout-json.md` §1c — a home-layout section
> carries a `type:"positions"` column, and the demo (Phase 7) publishes that ACM module
> type to the position. Lean templates (essence/titan) substitute `mod_articles_category`
> layouts (grid/list/slide/tabs/highlight/horizontal) for ACM sections.

---

## C. Component / module override matrix

The core Joomla views every inner/detail layout fills. **Copy from the T4 base override
when one exists** (it is already Bootstrap-5 / framework-aware); fall back to Joomla core
`tmpl/` / `layouts/` only when the base has nothing.

### How overrides resolve (read first)

Joomla picks the first existing layout in this order:

1. `templates/<tpl>/html/<com_xxx>/<view>/<layout>.php` — your template override (highest priority)
2. `plugins/system/t4/themes/base/html/<com_xxx>/<view>/<layout>.php` — **T4 base theme** override
3. `components/com_xxx/tmpl/<view>/<layout>.php` (or `modules/mod_xxx/tmpl/`, `layouts/`) — Joomla core

So the **T4 base theme already ships clean Bootstrap-5 overrides for almost every core
view** (login, registration, profile, remind, reset, finder, tags, content/author,
mod_menu, mod_login, mod_breadcrumbs, mod_custom, …). A template only ships its own
override when it restyles that view beyond the base. The reference templates confirm:

- **ja-titan** overrides: com_contact, com_content (incl. author, archive), com_tags,
  com_users (method/profile edit only), several `mod_*`, plus theme-specific com_guru /
  mod_jafinance and event/podcast/timeline/glossary category variants.
- **ja-essence** overrides: com_contact/contact, com_content (article, author, category
  blog+news, featured), `mod_articles_*`, mod_related_items. It **inherits** the T4 base
  com_users / com_finder / com_tags overrides.

Override-count floor → ceiling across T4: **com 2–6, mod 1–6, total html .php 13–89**
(prodex 13 → titan 89).

Paths below are relative to the template root:
`html/` = `templates/<tpl>/html/`,
`base/` = `plugins/system/t4/themes/base/html/`,
`core/` = `components/com_*/tmpl/` or `modules/mod_*/tmpl/` or `layouts/`.

### C1. Core component views

| View | Source HTML page | Override file(s) under `html/` | Base to copy from | Notes |
|---|---|---|---|---|
| Home / featured | com_content featured | `com_content/featured/default.php`, `default_item.php` | `base/com_content/featured/` | Front-page "Featured Articles" menu item. Intro grid = `default_item.php`. Both ref templates override. |
| Category blog | com_content category blog | `com_content/category/blog.php`, `blog_item.php` | `base/com_content/category/` (blog.php, blog_item.php, blog_children.php, blog_links.php) | The "list of posts" page. Copy `blog_children.php`/`blog_links.php` if restyling subcat/pagination. |
| Single article | com_content article | `com_content/article/default.php` | `base/com_content/article/default.php` (+ default_links.php) | Post detail. Essence adds `type-1.php`/`type-2.php`; Titan adds `events.php`/`podcast.php`. |
| Archive | com_content archive | `com_content/archive/default.php` | `base/com_content/archive/default.php` (+ default_items.php) | Date-based archive. Titan overrides only `default.php`. |
| Author | com_content author (T4 view) | `com_content/author/author.php`, `author_post.php` | `base/com_content/author/` (author.php, author_post.php, author_posts.php, list.php, list_items.php) | **Author is a T4 base view, not Joomla core** — always copy from `base/com_content/author/`. |
| Login | com_users login | `com_users/login/default.php` | `base/com_users/login/` (default_login.php, default_logout.php) + `core/com_users/login/default.php` | Base ships the inner partials but **not** the wrapper — copy the wrapper from core. |
| Registration | com_users registration | `com_users/registration/default.php` | `base/com_users/registration/` (default.php, complete.php) | Sign-up form. Base override exists. |
| Profile (view) | com_users profile | `com_users/profile/default.php` | `base/com_users/profile/` (default.php, default_core.php, default_custom.php, default_params.php) | "View my profile". |
| Profile (edit) | com_users profile edit | `com_users/profile/edit.php` | `base/com_users/profile/edit.php` | "Edit profile" form. Titan overrides this explicitly. |
| Remind username | com_users remind | `com_users/remind/default.php` | `base/com_users/remind/default.php` | "Forgot username". |
| Reset password | com_users reset | `com_users/reset/default.php` (+ confirm.php, complete.php) | `base/com_users/reset/` (default.php, confirm.php, complete.php) | Multi-step: request → confirm → complete. Override all three. |
| Contact | com_contact contact | `com_contact/contact/default.php`, `default_form.php`, `default_address.php` | `base/com_contact/contact/` (+ default_links.php) | Single-contact page. Titan overrides all three; Essence only default.php + default_form.php. |
| Smart Search | com_finder search | `com_finder/search/default.php`, `default_form.php` | `base/com_finder/search/` (default.php, default_form.php, default_result.php, default_results.php) | Form = `default_form.php`; results = `default_results.php`. Base ships all. Trip/vogue override. |
| Tag (single) | com_tags tag | `com_tags/tag/default.php`, `default_items.php` | `base/com_tags/tag/` (default.php, default_items.php) | One-tag listing. |
| Tag list (all tags) | com_tags tags | `com_tags/tag/list.php`, `list_items.php` | `base/com_tags/tags/` (default.php, default_items.php) | Core component view is `tags` (plural); verify the active layout name on the live menu item. |
| News feeds | com_newsfeeds | `com_newsfeeds/category/default.php` (+ `default_items.php`), `categories/default.php` | `core/com_newsfeeds/tmpl/` | **Titan only** among refs, but a complete J6 template should style it. Null-guard `json_decode` (gotcha #64). |
| Contact directory | com_contact category | `com_contact/category/default.php` (+ `default_items.php`) | `core/com_contact/category/tmpl/` | List of contacts in a category ("Our team" directory). **Titan only** — restyle to your `.card`. |
| Contact categories | com_contact categories | `com_contact/categories/default.php` (+ `default_items.php`) | `core/com_contact/categories/tmpl/` | Contact-category tree. |
| Featured contacts | com_contact featured | `com_contact/featured/default.php` (+ `default_items.php`) | `core/com_contact/featured/tmpl/` | Featured-contacts list. |
| User MFA / 2FA | com_users methods/captive/method | `com_users/methods/default.php` (+ `firsttime.php`), `captive/default.php` (+ `select.php`), `method/edit.php` (+ `backupcodes.php`) | `core/com_users/{methods,captive,method}/tmpl/` | **Increasingly required in Joomla 6** — unstyled the day a site enables 2FA. Wrap in your auth-card shell (gotcha #59). |

### C2. Module overrides

| View | Source HTML page | Override file(s) under `html/` | Base to copy from | Notes |
|---|---|---|---|---|
| Main menu / megamenu | mod_menu | `mod_menu/default.php` (+ `mega.php`, `mega_items.php`, `mega_sub.php`) | `base/mod_menu/` (default.php, mega.php, mega_items.php, mega_sub.php, default_component.php, default_heading.php, default_separator.php, default_url.php) | Megamenu lives in the base `mega*.php` files. |
| Articles by category | mod_articles_category | `mod_articles_category/<layout>.php` | `core/mod_articles_category/tmpl/default.php` | The **workhorse** — both ref templates ship many layouts (grid, list, slide, tabs, highlight, horizontal). No base override. Lean templates use these *instead of* ACM. |
| Categories list | mod_articles_categories | `mod_articles_categories/default.php`, `default_items.php` | `core/mod_articles_categories/tmpl/` | No base override. |
| Latest articles | mod_articles_latest | `mod_articles_latest/default.php` | `core/mod_articles_latest/tmpl/default.php` | Essence/morgan ship this. No base override. |
| Popular articles | mod_articles_popular | `mod_articles_popular/default.php` (+ `list.php`) | `core/mod_articles_popular/tmpl/default.php` | Titan ships default.php + list.php. No base override. |
| Related items | mod_related_items | `mod_related_items/default.php` | `core/mod_related_items/tmpl/default.php` | Both ref templates ship this. No base override. |
| Smart Search module | mod_finder | `mod_finder/default.php` | `core/mod_finder/tmpl/default.php` | Header search box. No base override. |
| Login module | mod_login | `mod_login/default.php` | `base/mod_login/default.php` | Base override exists. |
| Breadcrumbs | mod_breadcrumbs | `mod_breadcrumbs/default.php` | `base/mod_breadcrumbs/default.php` | Base override exists. |
| Custom HTML | mod_custom | `mod_custom/default.php` | `base/mod_custom/default.php` | Base override exists. For static hero/feature blocks (principle 4). |
| JA modules | mod_jamasthead, mod_jaquickcontact, mod_jafinance, mod_guru_courses | per-template `mod_ja*/` | (ships with the template) | Vertical-specific: masthead (morgan), quickcontact (nova/morgan), finance ticker (titan/teline_v), course list (titan/Guru). |

---

## D. Special / standalone pages (template root, NOT under `html/`)

**Every** T4 template ships these at the **template root** (verified on all 8):
`error.php`, `error-t4.php`, `offline.php`, `component.php`, `index.php`, `templateInfo.php`
(some add `helper.php`: essence, titan). T3 templates ship `error.php`, `offline.php`,
`component.php`, `index.php`, `templateHook.php`, `templateInfo.php` (+ `ajax.php`,
`helper*.php` on teline_v).

| View | Source HTML page | File (template root) | Base to copy from | Notes |
|---|---|---|---|---|
| 404 / error | error | `error.php` **and** `error-t4.php` | `core` = `templates/system/error.php` | T4 ships **both**; confirm which the template invokes before styling (#6). |
| Offline / maintenance | offline | `offline.php` | `core` = `templates/system/offline.php` | Standalone — does **not** inherit `index.php` chrome (#6/#9); style separately. |
| Component (raw) wrapper | component | `component.php` | `core` = `templates/system/component.php` | Rendered for `?tmpl=component` (print/popup/modal). Keep minimal but themed. |

**Custom / vertical standalone pages** (surfaced as menu pages or layouts, not literal root
PHP): `portfolio` + `portfolio-detail` (vega), `services` (vega), `author` (T4 base view),
**coming-soon** (a normal menu page, no `coming-soon.php` ships), **landing** (spark
`landing.json`). Generate these per the source design.

---

## E. Template STYLES (`etc/theme/*.json` + the live `#__template_styles` rows)

A T4 template style is a tuple `{layout, theme, site}`:
- **layout** = which `etc/layout/*.json` section-stack (home vs inner vs a named home variant),
- **theme** = which `etc/theme/*.json` color/typography scheme,
- **site** = which `etc/site/*.json` header/footer module-position set.

Most templates ship **1 theme** but **multiple layouts + sites**, so the live
`#__template_styles` table holds **2–4 styles**: one **Home** style (home layout) + one
**Inner/default** style (default layout), plus extra per-home styles on multipurpose
templates. `ja_spark` is the outlier with **4 themes** (`business/default/logistics/product`)
→ ~4–5 styles. The aurora build models exactly this: `.aurora-build/menu-style.sql` style
32 = Home (`"layout":"home"`), style 33 = Inner (`"layout":"default"`), both sharing
`theme/site = default`.

**Minimum the builder creates: 2 styles** (Home + Inner) — this is what makes inner pages
stop rendering the home hero (#15). **Add one extra style per additional home layout, per
landing layout, and per extra `etc/theme/*.json`** (spark → business/logistics/product
styles). Then **repoint each menu item's `template_style_id`** at the right style — the
site default is not enough if a menu item carries an explicit override (#20).

---

## F. The DEFAULT page set the skill generates (and what auto-extends)

The skill's old model treated the **core component-view floor** (article/category/featured/
login/contact/search/tags/404/offline ≈ 9 views) as the whole job. That is only tier C —
real templates ship a **front-page story** (tier A homes + tier B ACM sections) and a
**richer menu** on top. The skill generates this **standard baseline by default**
(**~18–24 pages, 2 styles**), then **auto-extends** per the source template's own trees.

### Standard baseline — generate by default (~18–24 pages, ≥2 styles)

**Home & marketing (tier A layouts + tier B ACM sections):**
- **2–3 Home variants** (`home`, `home-2`, `home-3`) — median T4 ships 2–3 homes
  (essence 4, vogue 5, spark 5+landing); start with what the source design exposes.
- **1 Landing page** (spark ships `landing.json`) — when the source has one.
- **~11 ACM section blocks** wired into the homes: hero, features-intro/services, cta,
  testimonials, teams, clients, pricing, gallery/portfolio, stats, accordion(FAQ), social
  (prodex/nova/spark each ship 9 ACM dirs).

**Standard inner pages (tier C views + menu items):**
- About · Services · Portfolio/Work · Team · Pricing · FAQ
- Blog (category blog) + Single article (detail)
- Contact
- Search (Smart Search) + Tags (single + all-tags)
- Login · Register · Profile (+ edit) · Forgot-password
- 404 (`error.php` + `error-t4.php`) · Offline · Component wrapper
- Coming-soon (marketing menu page)

**Styles:** at least **2** (Home style + Inner/default style), per
`.aurora-build/menu-style.sql`; +1 per extra home/landing layout.

**Page tally:** ~2–3 homes + landing + (about, services, portfolio, team, pricing, faq) +
(blog, single) + contact + (search, tag, all-tags) + (login, register, profile, edit,
forgot) + (404, offline, component) + coming-soon ≈ **20–24 menu/page items**, ~11 ACM
section modules behind the homes, **2 styles**. (Min realized aurora demo = 10 menu items;
real quickstarts expose **15–30**.)

### Auto-extend — only when the chosen template ships them

Detect from the template's own `etc/layout/*.json`, `acm/`, `etc/theme/*.json`, and
`html/com_*` tree (the ground truth) and add:

- **Extra home variants** beyond 3 — one per additional `home-*.json` / named-home `.json`
  (essence home-4/5, vogue home-4/6, spark business/corporate/logistics/magz/product).
- **Vertical detail layouts** — one per `*-detail.json` / `sub-*.json`: `portfolio-detail`,
  `services` (vega), `article-detail`, `event(+detail)`, `podcast(+detail)`, `crypto`,
  `detail-sidebar`, `sub-detail` (titan ships 5; vega ships portfolio-detail+services).
- **Vertical category/article layouts** — one per `mod_articles_category` / `com_content`
  override layout found: `news*`, `events*`, `podcast*`, `timeline*`, `type-1/2`, `crypto`.
- **Extra theme styles** — one Joomla style per additional `etc/theme/*.json` (spark
  business/logistics/product).
- **Third-party component pages** — `com_virtuemart` (shop), `com_guru` (LMS/titan),
  `com_newsfeeds` (news/titan): see the dependency gate below.

**Net effect:** raise the default from the ~9-view component floor to a **~18–24-page
baseline (2–3 homes + landing + ~11 ACM sections + full inner/auth/system set, 2 styles)**,
auto-extending toward the **realistic 25–30-page, 2–5-style** footprint that titan, vogue
and spark actually ship.

---

## Auto-extend dependency gate — non-core components must be INSTALLED

VirtueMart, Guru/LMS, K2, EasyBlog and similar are **not** present in a bare Joomla install
and were **not** found in either reference template's component tree (`com_virtuemart` is
absent from ja-titan). An override file under `html/com_virtuemart/` does **not** mean the
component is installed — it ships dormant until the matching extension is added (usually via
the quickstart package). Therefore:

- Do **not** assume a non-core component exists. Check `components/com_<x>/` (and the admin
  extension list) for the real component before claiming coverage of its views.
- If the design depends on a component that is not installed, **report the dependency to the
  user** (name it, where it comes from — quickstart or a separate JoomlArt download — and
  that its pages cannot be rendered or verified until installed). Mark those rows BLOCKED
  rather than fabricating override paths or screenshots.

How Phase 2 detects what to extend:

**1. Read the template's own `html/` tree.** The shipped overrides are the ground truth.
Examples from the references: ja-titan `com_content/category/event*.php`, `podcast*.php`,
`timeline*.php`, `glossary*.php`, `com_content/article/events.php`/`podcast.php`,
`com_guru/*`, `mod_jafinance`, `mod_guru_courses`; ja-essence `com_content/category/news*.php`,
alt article `type-1.php`/`type-2.php`.

**2. Map the template's vertical to its component(s):**
- **Shop / e-commerce** → **com_virtuemart**: category list, `productdetails`, `cart`,
  checkout, VM modules. Override path `html/com_virtuemart/<view>/<layout>.php`.
- **Podcast / event / magazine** → **com_content category & article variants** (the
  `event*`, `podcast*`, `timeline*`, `news*` layouts), selected per menu item.
- **LMS / courses** → **com_guru** (ja-titan): `html/com_guru/gurupcategs/`,
  `guruprograms/`, `mod_guru_courses`.
- **Portfolio / docs / forum / k2** → whatever third-party component the quickstart
  installs; discover it the same way (overrides appear under `html/com_<x>/`).
