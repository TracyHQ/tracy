# Catalog — the menu a template SELECTS from (layouts · pages · ACM · styles)

> **Phase 2 packet (SELECT step).** Read after the parse to classify the source's category and pick
> this template's distinctive subset + signature section. This is the **selection menu**; the matching
> **build roster** (what you must implement/override/verify) is `page-coverage-matrix.md`. Terminology:
> **mandatory floor** = must-have (§6.1); **baseline** = the typical ~18–24 pages; **auto-extend** =
> beyond, only when the source implies it.

This is the **master menu** for Phase 2/Phase 4: the exhaustive range of layouts,
page types, ACM section blocks, overrides, and template styles seen across the real
shipped JoomlArt templates — followed by a **selection model** (mandatory floor →
per-category recommended → optional auto-extend → **creative-freedom**).

**Read this with two intents at once:** (1) hit the **mandatory floor** so every
generated template is a complete, real Joomla site, and (2) deliberately pick a
**DIFFERENT subset + invent DIFFERENT signature sections** so no two generated
templates look alike. A catalog is a palette, not a checklist — sameness is a defect.

Evidence base: page inventories taken across the shipped JoomlArt T4 catalogue
(`ja_vega`, `ja_nova`, `ja_spark`, `ja_titan`, `ja_trip`, `ja_prodex`, `ja_essence`,
`ja_teline`, `ja_morgan`, `ja_vogue`) — the counts below are what those templates
actually ship, not aspirations. Cross-ref `page-coverage-matrix.md` (the
six-tier override/style detail) and `layout-json.md` §1d / "ACM authoring".

The T4-native mechanism for flexible page **sections** is **ACM / `mod_ja_acm`**
(see §3 + `layout-json.md`). The optional page-builder is **`com_jabuilder`** (JA
Builder). `com_jaextmanager` (JA Extension Manager) is NOT a page/layout standard —
it is an install/upgrade/rollback tool (gotcha #40).

---

## 1. Page LAYOUTS (`etc/layout/*.json`) — the section-stack skeletons

One file = one page skeleton (a stack of full-width section rows). A template style
binds **one** layout site-wide (gotcha #15), so each reachable layout needs its own
style. Real T4 range: **2 layouts (prodex, leanest) → 9 (titan, vogue, richest)**,
median **≈ 5–6**. Pick a count that fits the source — do not always ship the same N.

**HOME + home variants** (the front-page showcase; the design's personality):
- `home.json` / `Home.json` — the primary home (every template).
- numbered variants — `home-2.json … home-6.json` (essence ships home-2..5; vogue
  ships home-1/2/3/4/6).
- named-by-vertical variants — spark `business / corporate / logistics / magz /
  product`; titan `crypto / home-horizontal`.
- **typical real range: 1 (lean) → 5–7 (multipurpose); median 2–3.**

**INNER / DEFAULT** (the content shell — sidebars + breadcrumbs + component):
- `default.json` — the universal inner shell (**every template ships this**).
- `no-sidebar.json` / full-width inner — content edge-to-edge, no sidebar.
- `sidebar-left.json` / `sidebar-right.json` — single-sidebar inner variants.

**LANDING / standalone marketing**:
- `landing.json` (spark) — chrome-light single-purpose promo page.
- `coming-soon` — usually a normal menu page on a minimal layout (no literal file).

**DETAIL variants** (per-vertical single-item shells):
- `sub-detail.json` / `sub-layout.json` / `detail-sidebar.json` (vega, nova, trip,
  vogue, essence).
- `article-detail.json`, `portfolio-detail.json`, `services.json` (vega, titan).
- `event-detail.json`, `podcast-detail.json` (titan).

**HEADER-style layouts** — alternate chrome (`Header-1.json` in vogue; alt
`etc/site/*.json` header/footer module-position sets pair with these).

Cite: `ja-titan/etc/layout/{crypto,event,event-detail,podcast,podcast-detail,article-detail,home-horizontal,Home,default}.json` (9);
`ja-vogue/etc/layout/{home,home-1,home-2,home-3,home-4,home-6,Header-1,sub-detail,default}.json` (9);
`ja-spark/etc/layout/{business,corporate,logistics,magz,product,landing,default}.json` (7);
`ja-prodex/etc/layout/{home,default}.json` (2).

---

## 2. PAGE TYPES (the menu items / views a quickstart exposes)

The exhaustive menu — a real quickstart exposes **15–30** items; the realized minimal
aurora set is **10**. Grouped by function. Pick from each group per the template
category (§6); the **Joomla! pages** set is the hard floor (§5).

**Home(s)** — the home + its variants (see §1).

**Content (com_content / com_tags):**
- featured (front-page article feature) · category blog · category list ·
  list-all-categories · single article (detail) · archive · author listing ·
  author detail · tagged (single tag) · tags list (all tags).

**Marketing:**
- about · services + service-detail · pricing · team · portfolio/work + work-detail ·
  FAQ · testimonials · process · careers · contact (com_contact) · landing ·
  coming-soon.

**User / system (com_users + Joomla core):**
- login · registration · profile · profile-edit · password reset · remind
  (forgot username) · 404/error (`error.php` AND `error-t4.php`) · offline ·
  component (raw/print/modal wrapper) · print · search results (Smart Search,
  com_finder).

**Layout showcases** (demo pages that flaunt coverage — multipurpose templates ship
these as a "Template Layouts" mega-menu column):
- full-width · content + sidebar · sidebar + content · 3-column · typography / UI-kit
  / elements demo.

Cite: titan ships `com_content` subviews `article/author/category/featured/archive/categories` (all 6);
spark `etc/navigation/default.json` mega-menu groups `User / Joomla! Pages / Template Layouts /
Content layouts / Article Layouts` (5 cols × 4–6 items ≈ 25 demo pages).

---

## 3. ACM SECTION BLOCKS (`acm/<block>/`) — the flexible building blocks

ACM ("Advanced Custom Module") rendered by **`mod_ja_acm`** is the T4-native way to make
a front-page **section editable through the admin**. Each `acm/<block>/` dir is a
block *type* the template registers; the home layout exposes a `positions` row and an
ACM module is published into it (Phase 7). Full authoring anatomy: `layout-json.md`
→ "ACM authoring". Real T4 range: **2 blocks (essence, titan — they drive sections via
`mod_articles_category` instead) → 9 (prodex, nova, spark)**.

This table is the **selection view** — what's common, to pick from. The **build roster** (the ~11
blocks you actually implement for this template) is `page-coverage-matrix.md` tier B; don't duplicate
the count there, select here.

**Common blocks** (union across the 8 T4 templates; "ships in" = how many of 8):

| ACM block | ships in | role |
|---|---|---|
| `cta` | 6 | call-to-action banner |
| `features-intro` | 6 | feature/services grid with icons |
| `social` | 6 | social-icon row |
| `hero` | 5 | top hero / slideshow header |
| `teams` / `team` | 5 | team-member grid |
| `testimonials` | 4 | quotes carousel |
| `clients` | 4 | client/partner logos |
| `gallery` | 4 | image/portfolio grid |
| `pricing` | 3 | pricing tables |
| `accordion` | 2 | FAQ / collapsible |
| `text-slider` | 2 | rotating headline/quote |
| `statistics` / `statics` | 2 | animated counters |
| `timeline` | 1 (spark) | process/history timeline |
| `slideshow` | 1 (vega) | full slideshow |
| `contact-info` | 1 (vega) | address/phone block |
| `container-tabs` | 1 (titan) | tabbed content |

**Templates author their OWN blocks AND their own STYLES of a block.** A block ships
one-or-more named styles (`tmpl/style-1.php … style-N.php`, each with a matching
`style-N.xml` field schema). spark's `hero` ships **4 styles** (`style-1..4`); its
`pricing` ships **1**. Inventing a fresh signature block (or a fresh style of a common
one) is the single best lever for making a template look unlike the others (§7).

Cite: `ja_prodex/acm/` = accordion, clients, cta, features-intro, hero, pricing, social, teams, testimonials (9);
`ja_spark/acm/` = clients, features-intro, gallery, hero, pricing, statistics, team, testimonials, timeline (9);
`ja_spark/acm/hero/tmpl/style-{1,2,3,4}.php` (4 styles).

---

## 4. COMPONENT OVERRIDES + 5. TEMPLATE STYLES

These two tiers are detailed with full cites in `page-coverage-matrix.md` (tiers C, E).
Summary for selection:

**Component / module overrides** (`html/com_*`, `html/mod_*`):
- **Floor (every T4 template):** `com_content` (article, category, featured, author) +
  `com_contact`. The T4 base theme already supplies most core overrides (gotcha #10) —
  override only what the design changes.
- **Richer templates add:** `com_tags`, `com_users`, `com_finder`, `com_newsfeeds`;
  workhorse module `mod_articles_category` (custom grid/list/slide/tabs layouts).
- Range: com overrides **2 → 6** (titan); mod overrides **1 → 6**; html `.php` override
  files **13 (prodex) → 89 (titan)**.

**Template STYLES** (`#__template_styles`, a `{layout, theme, site}` tuple): **2–5**.
Floor = **2** (Home style + Inner/default style, as in `.aurora-build/menu-style.sql`
styles 32/33). Add **+1 style per extra reachable home/landing layout** (gotcha #15/#16/
#20). spark is the outlier with 4 themes → ~4–5 styles.

---

## 6. SELECTION MODEL

### 6.1 MANDATORY MINIMUM — the hard floor every template MUST ship

Non-negotiable. A generated template that misses any of these is incomplete:

- **≥1 home layout** (the primary `home.json`), PLUS
- **The full standard "Joomla! pages" set (≈ ≥18 pages)** — every one of:
  category blog · category list · list-all-categories · single article · author
  listing · contact · login · registration · profile · profile-edit · password
  reset · remind (forgot username) · Smart Search (search results) · single tag ·
  tags list · 404 (`error.php` AND `error-t4.php`) · offline · component wrapper.
- **≥3 page LAYOUTS** — `home` + `default` (inner) + **≥1 more** (a `no-sidebar` /
  `landing` / a 2nd home / a detail layout).
- **≥2 template STYLES** — one **Home** style + one **Inner/default** style.
- **≥6 ACM / section blocks wired into the home** — chosen from §3 (or
  template-authored). Lean blog/news templates MAY substitute `mod_articles_category`
  layouts for some, but must still ship ≥6 editable home sections total.

These are **MUSTs**. Everything below is where the template should **VARY**.

### 6.2 RECOMMENDED by template category

Beyond the floor, pick the recommended mix for the source's **category** so a
corporate template ≠ a blog ≠ a portfolio. Each row = *extra layouts / signature pages
/ ACM mix* on top of §6.1.

| Category | Layouts (beyond floor) | Signature pages | ACM / section mix (lead blocks) |
|---|---|---|---|
| **Corporate / business** | +1–2 homes, `no-sidebar`, `service-detail` | About, Services + service-detail, Team, Pricing, Process, Careers, Contact | hero, features-intro, **statistics**, **cta**, team, testimonials, clients, pricing |
| **Agency / creative** | +1–2 homes, `portfolio-detail`, `landing` | Portfolio/Work + work-detail, About, Team, Services, Contact | **hero/slideshow**, **gallery/portfolio**, features-intro, testimonials, team, clients, cta |
| **Blog / magazine** | +home-2/3 (magazine), `sidebar-left`, `sidebar-right`, `article-detail` | Category blog, news/featured, author listing/detail, archive, tags, single article | LEAN ACM (2–4): hero/text-slider + cta + social; **drive sections via `mod_articles_category`** (grid/list/tabs) |
| **Portfolio** | +`portfolio-detail`, `landing` | Work grid + work-detail, About, Contact | **gallery**, hero, features-intro, testimonials, cta, social |
| **Shop** | +home-2, `no-sidebar`, product `*-detail` | Catalog, product detail, category, cart/checkout (VM), Contact | hero, features-intro, **pricing**, clients, testimonials, cta (+VM views, §6.3) |
| **One-page / landing** | `landing` (primary), 1 home | Single scrolling page; anchored sections; Contact | hero, features-intro, **pricing**, statistics, testimonials, team, cta, social (rich ACM stack on ONE page) |
| **Directory / listing** | +`sidebar-left`, `no-sidebar`, detail | Listing index, listing detail, category, Smart Search results, Contact | hero, features-intro, **statistics**, gallery, cta, **contact-info** |

### 6.3 OPTIONAL / auto-extend — only when the source design implies it

Detect from the source's own `etc/layout/*.json`, `acm/`, `html/com_*` tree and add:
- **Shop → `com_virtuemart`** views (category, product, cart, checkout) — BLOCKED until
  VirtueMart is installed (dependency gate, `page-coverage-matrix.md`).
- **Podcast / event / crypto → content variants** (`event(+detail)`, `podcast(+detail)`,
  `crypto`, `news*`) — generate one per matching `*-detail.json` / override layout.
- **LMS → `com_guru`** (titan) — BLOCKED until Guru installed.
- **Finance ticker / newsfeeds** → `mod_jafinance` / `com_newsfeeds` (titan, teline).
- **Extra theme styles** (spark business/logistics/product) — one style per
  `etc/theme/*.json`.
Never invent a third-party-component page when the component is not installed.

### 6.4 CREATIVE-FREEDOM clause — VARY deliberately (make this prominent)

**Beyond the catalog, the builder is ENCOURAGED to invent.** The catalog is the floor
and the palette, NOT a cage. As long as the result is **beautiful, sensible, and
T4-idiomatic**, anything goes:

- **Invent non-standard pages** the category suggests (a "Manifesto", "Case-study",
  "Changelog", "Menu" (restaurant), "Schedule", "Roadmap", "Lookbook" page…).
- **Invent new LAYOUTS** — a different section count / container rhythm / sidebar
  arrangement than any shipped template.
- **Invent new ACM section blocks and new STYLES** of common blocks (§3) — a signature
  section that becomes the template's identity.

**Each generated template MUST deliberately pick a DIFFERENT subset and invent a
DIFFERENT signature section** so no two templates look alike. Sameness across generated
templates is a defect to fix, not a safe default.

Be T4-idiomatic when you invent: build sections as **ACM blocks** (editable) or layout
JSON section rows, chrome as **blocks/elements**, colors as **theme tokens + palettes** —
never as one frozen static dump (gotcha #39 + principle 4). Reserve static `block`s for
genuinely complex hero/feature art only.

**How to VARY — five levers (turn at least 3 per template):**
1. **Home composition** — different section order, count, and which sections lead
   (hero→stats→pricing vs hero→gallery→testimonials). Vary the number of homes (1 vs 5).
2. **ACM block mix** — pick a different 6–11 from §3, AND author 1+ signature block.
   Vary the *style* of shared blocks (different `style-N.php`).
3. **Layout count + kinds** — 3 (lean) vs 7–9 (multipurpose); which detail/landing/
   sidebar variants exist.
4. **Accent + type system** — a distinct primary/secondary palette and font pairing
   (the theme tokens), giving an immediately different visual signature.
5. **Signature section** — one bespoke, memorable section (timeline, animated counters,
   diagonal hero, masonry lookbook, tabbed showcase) unique to this template.

---

## 7. Quick selection checklist (per generated template)

1. Classify the source → a **category** (§6.2).
2. Lock the **mandatory minimum** (§6.1): ≥1 home, the ≥18-page Joomla set, ≥3 layouts,
   ≥2 styles, ≥6 ACM home sections. (These are MUSTs.)
3. Add the **category-recommended** layouts / signature pages / ACM mix (§6.2).
4. Add **auto-extend** items only where the source implies them (§6.3).
5. Turn **≥3 variation levers** (§6.4) and ship **≥1 invented signature section** —
   confirm this template's subset + signature differ from prior generated ones.
