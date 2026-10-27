# Demo Content — populate a blank Joomla 6 so the live site matches the HTML design

> **Phase 7 packet.** Read when populating the site (categories/articles, menu, modules+positions, and
> the **megamenu seed** — §4 is the canonical megamenu-seed reference). Prereq: chrome + layouts + ACM
> blocks exist. Pairs with `editability-standards.md` (module-title + ACM rules) and `catalog.md`/`page-coverage-matrix.md` (the page set to populate).

Phase 7. After the template (chrome, layouts, theme, overrides, CSS) is built, a
**clean Joomla 6** — one installed from the **blank** site, with **no quickstart
demo data** — is still empty: no categories, no articles, no menu, no modules,
and (critically) **no megamenu rows in the DB**. This doc is the procedure that
fills that gap so the rendered site matches the design and the owner inherits a
real starting point.

**Read `content-contract.md` first.** The site contract supplies business facts and the content
plan supplies approved copy. The source design supplies layout and field placement. Preserve source
wording only when reconciled with this site's contract; imported template/artifact copy is a draft.
Compile the content plan before writes and use its resolved fields throughout this procedure.

**Populate the richer page set, not a stub.** A realistic JA quickstart exposes
**~18–24 menu/page items across 2 styles** (real ones expose 15–30): the **2–3
home variants** + a **landing** page + **about / services / team / pricing / FAQ**
+ blog + single + contact + login/register/profile + 404/offline + coming-soon —
**plus the ~11 ACM-backed home sections** published behind the homes. Build all of
them, not just home + a component floor. See `page-coverage-matrix.md` tier F.

This phase also performs the **megamenu params seed**, the single step that makes
the navigation actually render on the frontend (files alone do nothing — see §4).

See also:
- [`page-coverage-matrix.md`](page-coverage-matrix.md) — which Joomla view each
  menu item type maps to (Featured → home, Category Blog → blog, Single Article,
  Contact, Login, …); the matrix drives §2's menu-type choices.
- [`blocks-and-elements.md`](blocks-and-elements.md) — the megamenu element /
  `mega.php` chrome the seeded params render through, and the positions a module
  can target.
- [`layout-json.md`](layout-json.md) — the `<positions>` a module can be assigned
  to and how `type: "positions"` columns place them.
- [`gotchas.md`](gotchas.md) — the ordering trap (menu items before mega seed),
  optimize-cache staleness, and the DB-vs-file megamenu fact.

> **Planning and applying are separate.** `setup-demo-content.mjs` emits draft intent.
> Read `content-reconciliation.md` to reconcile it against actual Joomla IDs and preserve the
> selected quickstart's relationships. Apply through Joomla APIs; fixed-ID SQL export is retired.

---

## The five build steps, in order

The order is load-bearing because the megamenu seed (§4) needs the **real menu
item IDs**, which only exist after the menu items are inserted (§2). Run:

1. Categories + articles (§1)
2. Main menu + items (§2) — **capture the resulting IDs**
3. Modules + positions (§3)
4. Megamenu seed (§4) — keyed by the IDs from step 2
5. Surface every mutation as an explicit operator step (§5)

---

## 1. Categories + articles — resolved from the content contract

### 1a. Categories the design implies

Derive the category set from the bundle's nav and listing pages, not from a fixed
list. Typical mapping from a parsed page-map:

| Design signal in the HTML | Category to create |
|---|---|
| A "Blog" / "News" nav item + a card grid on `blog.html` | `Blog` (or `News`) |
| Distinct card categories/tags shown on the cards ("Design", "Business", …) | one category per distinct label seen |
| A "Services" / "Features" grid that links to detail pages | `Services` |
| Featured items on `index.html` that are real articles (not static blocks) | reuse `Blog`/an existing category — do not make a `Home` category |

Rules:
- Create only categories the markup actually references. A label that appears on a
  card **is** a category (or tag) — read it off the DOM, don't guess.
- Parent/child only where the nav shows a submenu (e.g. `Blog > Tutorials`).
- The home page is a **view (Featured Articles)**, not a category — never create a
  "Home" category.

### 1b. Sample articles — title / intro / image resolved for this site

For every article-shaped piece of content in the bundle, create one Joomla
article whose fields use **resolved content-plan values**. The source elements below identify placement:

| Article field | Source in the design |
|---|---|
| `title` | the card heading / `<h2>`/`<h3>` on `blog.html`, the featured-item heading on `index.html`, the `<h1>` on `single.html` |
| `introtext` | the card excerpt / `<p>` summary under the heading (blog/featured cards) |
| `fulltext` | the body of `single.html` (the one full article the bundle ships in detail) |
| `images` (intro + full) | the card `<img src>` / featured `<img>` / article hero — copied into `images/` (Phase 6b sourced license-safe replacements where the bundle's own image was a placeholder). **For any downloaded open-source image, record its source URL + author + license in `images/CREDITS.md` at download time** (only ship redistribution-permitted images; see gotchas.md #11) |
| `created` / ordering | sequence them so the grid order on the live blog matches the design's card order |
| `catid` | the category from §1a that the card lived under |

Coverage to produce (so every view in `page-coverage-matrix.md` has something to
render):
- **Featured set** — flag a handful as *Featured* so `index.html`'s Featured
  Articles view fills with the same headings/images the design shows.
- **Blog set** — enough articles in the blog category to fill the card grid /
  trigger pagination, titles/excerpts from the blog cards.
- **One full single article** — the body, hero, and meta from `single.html`, so
  the Single Article view is real, not a stub.
- **Per-extra page** — any `<extra>.html` (about, pricing, …) that maps to
  `com_content.article` becomes its own article (see `conversion-contract.md`).

Map each article to the right `catid` from §1a. Do **not** reuse one article
across categories — duplicate the content if the design shows the same card in two
places.

---

## 2. Main menu + items — matching the design nav

Create one **menu** (`mainmenu`) and one menu item per top-level nav link in the
design. The **menu item type** is what binds the link to a Joomla view; pick it
from `page-coverage-matrix.md`:

| Design nav link | Menu item type | Resulting view |
|---|---|---|
| Home / brand | **Featured Articles** (set as Default/home) | `com_content` featured → `index.html`, layout `home`, **Home** style |
| Home 2 / Home Business / … | **Featured Articles** (own layout + style) | each extra home variant → `home-2`/named layout, **Home-2**/… style |
| Landing | **Single Article** or **Featured** (own `landing` layout + style) | chrome-light marketing page |
| About / Story | **Single Article** | `com_content` article |
| Services / Features (a category grid) | **Category Blog** or **List All Categories** | per the design's grid |
| Team | **Category Blog** (or a menu page hosting the `teams` ACM) | team grid |
| Pricing | **Single Article** (hosting the `pricing` ACM) | pricing page |
| FAQ | **Single Article** (hosting the `accordion` ACM) | FAQ page |
| Portfolio / Work / Gallery | **Category Blog** | portfolio grid |
| Coming soon | **Single Article** | marketing page (no root PHP) |
| Blog / News | **Category Blog** (points at the §1a blog category) | `com_content` category blog → `blog.html` |
| Single post | **Single Article** | `com_content` article → `single.html` |
| Contact | **Contact → Single Contact** | `com_contact` → `contact.html` |
| Login / Sign in | **Login Form** | `com_users` login → `login.html` |
| Register | **Registration Form** | `com_users` registration |
| Profile / Edit profile | **User Profile / Edit Profile** | `com_users` profile |
| Forgot username / password | **Username Reminder / Password Reset** | `com_users` remind/reset |
| Search | **Search → Search** (Smart Search) | `com_finder` |
| Tag links + All tags | **Tagged Items** / **List All Tags** | `com_tags` |

Notes:
- Set the **primary Featured Articles** item as the menu **Default** (home) — this is
  what makes `/` render the home view.
- **Each extra home variant + the landing page needs its own template style** bound to
  its own layout, and the menu item repointed at it via `template_style_id` (gotchas
  #15/#16/#20). Two styles minimum (Home + Inner); +1 per extra home/landing.
- Submenu links in the design become **child** menu items under their parent (the
  megamenu in §4 then groups them visually).
- Login/Register/Profile/Forgot/Contact/Search/Tags items make the matrix's auth +
  utility views reachable and verifiable in Phase 8.
- Target **~18–24 menu/page items** total (the tier-F default set), not ~10.
- **Aliases must be clean, human, SEO-friendly — NEVER prefix with the template
  abbreviation.** Use `home`, `about`, `services`, `services/brand-identity`,
  `pricing`, `blog`, `contact` — NOT `au-home`, `au-services/au-svc-brand`,
  `au-pages/au-about`. The prefix (`au-`, `vega-`, …) leaks the template's internal
  codename into every URL (`/au-pages/au-about`), reads as machine-generated, and
  dilutes the keyword in the slug — bad for SEO and for the human looking at the
  address bar. `setup-demo-content.mjs`'s `toAlias(title)` already yields clean
  slugs (`Home`→`home`, `Brand Identity`→`brand-identity`); **do not** post-process
  them with a namespace. If you added prefixes to dodge a collision with the blank's
  leftover demo items, that's the wrong fix — **unpublish those leftover items**
  instead (gotcha #34), then claim the clean alias. (gotcha #50)

> **The demo nav MUST be a grouped mega menu, NOT a flat row of every page**
> (gotcha #23; blocks-and-elements §5). The ~18–24 items are the menu *tree*, not
> the top row. Keep **4–7 top-level** (`parent_id = mainmenu root`) items and put
> the rest UNDER them as children. For a business/agency template the recommended
> top row is:
>
> **Home · Work/Portfolio · Services▾ · Pages▾ · Journal/Blog · Contact** + a right
> cluster (search icon · dark-toggle · coral "Get Started" CTA pill).
>
> - **Under "Services▾"** (a `megabuild` mega): the individual services as child
>   items (the col1 link list), plus a `mod_custom` 2×2 icon-card grid and a
>   featured case-study / CTA module (cols 2–3). §4 seeds these.
> - **Under "Pages▾"** (a plain dropdown, or a 2–3-col `megabuild` grouped panel):
>   the secondary pages — About, Team, Pricing, FAQ, Landing, extra Home variants,
>   Search, Login/Register. Group them with column titles (e.g. "Studio" /
>   "Explore").
>
> Items you don't want on the visible top row but still need reachable (Login,
> Register, Tagged, Search, …) live as **children under "Pages"**; surface only the
> ones you want by listing their ids in the §4 mega `items` columns (children not
> listed in any column simply don't appear in the panel, but stay URL-reachable).

### Capture the real IDs (required for §4)

Menu item IDs (`#__menu.id`) are **assigned dynamically** by Joomla at insert
time — you do not control them. After the menu items are inserted, **read back the
IDs**:

```sql
SELECT id, title, link, parent_id, level
FROM `#__menu`
WHERE menutype = 'mainmenu' AND published = 1
ORDER BY lft;
```

`setup-demo-content.mjs` does not query the database. The agent reads back the actual IDs
through the target Joomla API/CLI and supplies them to the megamenu seed (§4).

---

## 3. Modules + positions — listings, chrome, hero blocks

Create the modules the design needs and assign each to a **declared position**
(positions are declared in `templateDetails.xml`; see `layout-json.md` §4). Match
the module type to what the section renders:

| Design section | Module | Position (typical) | Notes |
|---|---|---|---|
| Header logo + nav | `mod_menu` (layout `mega`) | `menu` | The megamenu host; its rendering is driven by the §4 params seed, not the module params. |
| **Home ACM sections** (hero, features, team, pricing, testimonials, clients, cta, gallery, stats, faq, social) | the matching **ACM block module** (`acm/<block>/`) | `masthead`, `section-1…N`, `slideshow`, `bottom-a` | **The ~11 editable home sections.** Publish one ACM module per section the home layout exposes, menu-assigned to that home variant only. Params (heading/items/images) lifted from the bundle. This is the editable path — prefer it over static blocks (principle 4; `layout-json.md` §1d). |
| Hero / feature blocks (complex, static art) | `mod_custom` | `section-1`, `slideshow`, `masthead` | Only for sections too bespoke for an ACM block: carries the **HTML markup lifted from the bundle** (hero art, CTA), re-pathed. Reserve for genuinely complex static design — principle 4. |
| "Latest from the blog" grid | `mod_articles_category` | `section-1`/`section-2`, `bottom-a` | Points at the §1a blog category; layout chosen to match the design's card grid. |
| "Recent posts" sidebar list | `mod_articles_latest` | `sidebar-l`/`sidebar-r` | |
| "Popular / most read" | `mod_articles_popular` | `sidebar-r` | |
| Header search box | `mod_finder` | `search`/`header-r` | The Smart Search input in the chrome. |
| Login widget | `mod_login` | `sidebar-r`/`off-canvas` | If the design shows an inline login box. |
| Breadcrumbs | `mod_breadcrumbs` | `breadcrumbs`/`main-top-1` | Usually already placed by the layout; create the module so it has content. |
| Footer columns / nav | `mod_menu` / `mod_custom` | `footnav-1..4`, `footer` | One module per footer column the design shows. |

Rules:
- A `mod_custom` hero carries the **actual HTML** from the bundle's hero/feature
  block (re-pathed to T4 media), not a paraphrase — the design is the spec.
- Assign each module to a position that the active `etc/layout/*.json` actually
  renders (`type: "positions"` column). A module on an unrendered position is
  invisible — cross-check against `layout-json.md`.
- Set each module's **menu assignment** so it shows only where the design shows it
  (hero on home only; sidebar lists on blog; etc.).

### 3a. Module naming — `[<Tpl>] <Page> - <Section>` (searchable Module Manager)

Name every module **`[<Tpl>] <Page> - <Section>`** so the admin Modules list is searchable
and sortable — a real template ships dozens of modules and an unnamed/section-only list is
unusable. The `[<Tpl>]` prefix groups ALL of a template's modules (filter the whole template
at once on a multi-template site), then `<Page>` groups a page's modules, then `<Section>`
says what it is. `<Page>` = where it renders (`Home`, `About`, `Pricing`, `Footer`,
`Blog Sidebar`, …); shared chrome uses `Global` (newsletter, off-canvas, breadcrumbs).
`<Section>` = what it is (`Hero`, `Stats`, `Product Links`, `Categories`). Examples:
`[Nexora] Home - Hero` · `[Nexora] Footer - Product Links` · `[Nexora] Blog Sidebar - Categories` ·
`[Nexora] Global - Newsletter`. (User-mandated convention — same as SKILL.md "Modules / ACM";
supersedes the older `[Page] Section` form.)

### 3b. Marketing pages = ACM module stacks, NOT baked-HTML articles

Build each **marketing page** (About / Features / Pricing / FAQ / Team /
Integrations / Changelog) the editable way **from the start**: a *stack of
`mod_ja_acm` modules* (one per section, §1d in `layout-json.md`) published into a
**per-page position** named `<page>-page`. The article is reduced to a shell whose
`introtext` is just the loadposition token (and `fulltext` empty):

```html
<div class="<tpl>-canvas-page <tpl>-page-<x>">{loadposition <page>-page,none}</div>
```

- The **`,none`** chrome avoids per-module `.moduletable` seam borders between the
  stacked sections; add `.<tpl>-canvas-page .moduletable{border:0;margin:0;padding:0}`
  defensively (the T4-base `.moduletable` box otherwise draws stray borders, SKILL
  "Override the `.moduletable` box" / gotcha around module chrome).
- **Assign each module to ALL menu Itemids that resolve the article** (a marketing
  page is often reachable from two routes — a primary-nav item and a pages-hub item;
  the module must show on both or the page renders empty on one).
- The **article override must detect the `{loadposition <x>}` token** — it expands
  *after* the override runs, so branch on the raw token in `introtext` and wrap the
  output in `.<tpl>-canvas-page` (so the masthead/breadcrumb-hiding `:has()` rules of
  gotcha #61 still fire).
- **ONLY the blog uses real `com_content` articles** (introtext/fulltext prose).
  **Legal pages** (privacy / terms / cookies / security) MAY stay simple text
  articles — they're single-section prose, not multi-section marketing pages.

> Why not bake the whole page into one article body? A multi-section page in one
> `introtext`/`fulltext` (the `nx-canvas-page` "inject `<main>`" pattern, gotcha #61)
> renders correctly but is **not section-by-section editable** — the owner can't
> change one section without hand-editing raw HTML, and shared `.sec-*` classes leak
> across pages. The ACM-stack is the build-right-first-time path; the canvas-body
> pattern (#61) is the fallback only when a page is too bespoke to parameterize.

### 3c. Chrome is field-editable from the start — never hardcode it in the block

The footer/header blocks (`html/layouts/t4/block/footer.html`, `header.html`) must
**render module positions**, not carry baked content. Build chrome as:

| Chrome piece | Build as | Position |
|---|---|---|
| Footer brand (logo / tagline / socials) | **ACM block** | `footer` / `footnav-*` |
| Footer copyright + legal links | **ACM block** (owner edits the **year** + labels) | `footer` |
| Footer link columns | **`mod_menu`** — one menu per column; the **column heading = the module title** | `footnav-1..4` |
| Header / off-canvas CTA buttons | **ACM block** | `header-r` / `off-canvas` |
| Newsletter | **Acymailing `mod_acym`** (gotcha #69) — never a dead static form | `footer` / `off-canvas` |
| Blog sidebar search | **`mod_finder`** | `sidebar-r` |
| Blog sidebar categories (real counts) | **`mod_articles_categories`** | `sidebar-r` |
| Blog sidebar tags | **`mod_tags_popular`** | `sidebar-r` |

**Zero published `mod_custom` carrying content**, and **do not bake content into the
footer block HTML** — the owner must change the logo, tagline, copyright year, CTA
labels, and footer links in the admin UI with no code. (SKILL "Footer & header chrome
are ACM too".)

### 3d. Consent plugins must point at REAL published articles

After purging the blank's demo content, repoint the **com_users / consent plugin**
params at real published legal articles: `privacyconsent.privacy_article` +
`terms.terms_article` (also `confirmconsent`) in `#__extensions.params`. A
missing/deleted target = **HTTP 500 on the whole registration page** (and any CTA
linking to it). This is gotcha #53 — fix the pointers, don't just delete. (Build the
legal articles as §3b simple text articles in the same category as the marketing pages.)

---

## 4. Megamenu seed — critical, ID-aware, DB-driven

> **In one line:** seed BOTH places — the DB param `#__template_styles.params['navigation_mega_settings']`
> (what the renderer reads to render) AND `etc/navigation/<profile>.json` (the file registry the column
> definitions load from). Order is fixed: **create menu items → capture their `#__menu.id` → build the
> id-keyed settings → write both.** Files alone render nothing (the structural fact in SKILL.md); the
> renderer *mechanism* (which place feeds what) is in `blocks-and-elements.md` §5c.

**The megamenu renders from the database, not from files.** The T4 renderer
(`plugins/system/t4/src/t4/Renderer/Megamenu.php`) reads
`navigation_mega_settings` off the **active template style's params**:

```php
$template  = $app->getTemplate(true);
$megConfig = $template->params->get('navigation_mega_settings', '');
// json string → array; top key = menutype; child keys = #__menu item IDs
$menutype  = key($megConfig);
```

So shipping `etc/navigation/default.json` **alone does nothing on the frontend**.
You must write the settings into `#__template_styles.params` for the active style.

> **Nuance (verified on the ja_aurora build):** the document renderer reads the
> DB param only to pick the **menutype** (`key($megConfig)` → the JSON's top key
> must equal your menutype). The actual **column definitions** are read by
> `mega.php` from the file-based `navigation-settings.mega_settings`, which
> `Document/Template.php::loadTypelistData()` loads from
> `etc/navigation/<typelist-navigation>.json` (default profile `default`). So in
> practice **seed BOTH**: the DB param (for menutype detection + admin-builder
> persistence) AND `etc/navigation/default.json` `mega_settings` (for the columns).
> Mismatch = the panel opens but renders no columns.

### The shape of `navigation_mega_settings`

It is a JSON object keyed by **menutype**, then by **real `#__menu` item ID**:

```jsonc
{
  "mainmenu": {                 // menutype (the top key the renderer reads via key())
    "101": {                    // a #__menu.id captured in §2 — NOT a stable/known number
      "align": "left",
      "settings": [ { "contents": [ { "name": "", "type": "block", "col": "auto" } ] } ]
    },
    "103": { "align": "left", "settings": [ /* this item's dropdown columns */ ] },
    "107": { "align": "left", "settings": [ /* … */ ] }
  }
}
```

(Verbatim shape from `ja_essence/etc/presets/default.json`, whose
`navigation_mega_settings` is keyed `mainmenu → { "101", "103", "107", … }`.)

Because the keys are the **dynamic IDs from §2**, the build order is mandatory:

> **create menu items FIRST → capture their real IDs (§2) → build the id-keyed
> `navigation_mega_settings` JSON against those IDs → write it into
> `#__template_styles.params` for the active style.**

Authoring the dropdown content against a guessed ID, or against the
`etc/navigation/*.json` file's placeholder IDs, produces a megamenu that renders
nothing (the renderer looks up the live menu by the IDs it finds, and missing IDs
= empty dropdowns).

### Two seeding paths — document and support BOTH

**(a) Preferred — drive the T4 admin megamenu builder once (Playwright).**
Open the template's **Megamenu** tab in the T4 admin, build each top item's
dropdown (columns, module/positions, alignment) once, and **Save**. On save, the
admin (`plugins/system/t4/admin/src/Action.php`, which stores under the
`navigation_mega_settings` draft key and writes the style's `params`) **resolves
the live menu IDs itself** and persists the correct id-keyed JSON. This is the
most robust path: the IDs can never drift because the builder reads them live.
Automate the click-through with Playwright so it is repeatable.

**(b) Fallback — `scripts/seed-megamenu.mjs`.**
When the admin UI is not available (headless provisioning), the script:
1. reads the captured `id → title` map from §2,
2. reads `etc/navigation/default.json` (the intended dropdown structure, authored
   against item *titles*/*slugs*),
3. **re-keys** that structure onto the **real IDs**, producing the
   `{ "mainmenu": { "<id>": { align, settings } } }` object, and
4. emits an `UPDATE #__template_styles SET params = ... WHERE id = <active style>`
   statement (params merged so other keys are preserved — Action.php merges
   `navigation_mega_settings` into the existing `params`, it does not clobber).

Run it:
`node scripts/seed-megamenu.mjs --menutype mainmenu --items <items.json> --print-sql --template <TPL>`
→ review the emitted `UPDATE` → run it. (In `--print-sql` mode `--template` is the template **name**;
without it the script writes `etc/navigation/default.json` and `--template` is the template **dir**.)

### Also ship `etc/navigation/default.json` — but know its limit

Author `etc/navigation/default.json` as the **admin-builder default** (the
structure the T4 megamenu builder loads when an admin opens the tab on a fresh
install). It is the source of truth for the *intended* dropdown layout and the
input to path (b). **But the JSON file alone does not render on the frontend** —
only the DB params do. The file seeds the builder; the builder (or `seed-megamenu`)
seeds the DB.

---

## 5. Plan, reconcile, apply, verify

`setup-demo-content.mjs --emit plan page-map.json` produces a draft with placeholder content;
it does not extract final content, copy images, query IDs or mutate the database. Resolve these
inputs before applying. `--emit joomla-cli` gives manual guidance; `--emit sql` refuses fixed IDs.
Follow `content-reconciliation.md` to produce create/update/keep operations against a real inventory.

After applying through Joomla APIs, read the menu IDs back and supply them to `seed-megamenu.mjs`.
Clear the optimize cache and verify frontend rendering plus admin editability. Reconcile against
a fresh inventory: all intended records must now be `keep` before marking Phase 7 complete.

---

## Quick reference — what fills what

| Design artifact | Joomla object | Lands in |
|---|---|---|
| Blog/featured card title + excerpt + image | Article (`introtext`, intro image) | `#__content` + `#__ucm_content` + `#__workflow_associations` (admin visibility, #66), `images/` |
| `single.html` body + hero | Article (`fulltext`, full image) | `#__content` (+ `#__ucm_content` + `#__workflow_associations`) |
| Marketing page (About/Features/Pricing/FAQ/…) | shell article + **ACM module stack** in `<page>-page` (§3b) | `#__content` (shell) + `#__modules` @ `<page>-page` |
| Footer brand/copyright/CTA · newsletter | ACM blocks · **Acymailing `mod_acym`** (§3c, #69) | `#__modules` @ `footer`/`footnav-*`/`off-canvas` |
| Footer link column | `mod_menu` (column heading = module title) | `#__modules` @ `footnav-*` |
| Card category label | Category | `#__categories` |
| Top nav link (~18–24 of them) | Menu item (type per `page-coverage-matrix.md`) | `#__menu` |
| Editable home section (hero/team/pricing/…) | ACM block module (`acm/<block>/`) | `#__modules` @ `section-*`/`masthead`, menu-assigned to its home |
| Home / landing layout binding | Template style (Home / Home-2 / Inner / Landing) | `#__template_styles` (+ menu item `template_style_id`) |
| Bespoke static hero art | `mod_custom` | `#__modules` @ `section-1`/`masthead`/… |
| "Latest"/"Popular" lists | `mod_articles_category`/`_latest`/`_popular` | `#__modules` @ sidebar/section |
| Nav dropdown structure | megamenu `navigation_mega_settings` (id-keyed) | `#__template_styles.params` (+ `etc/navigation/default.json` for the builder) |

## Critical de-collision + completeness steps (Phase 7 — learned the hard way)

Before declaring the demo done, these prevent the "page renders home / login fails to home / guest
goes home" class of bugs and the "makeshift one-article page" complaint:

1. **Purge foreign-menutype demo items.** Unpublish (state −2) EVERY published `client_id=0` frontend
   menu item that is NOT in your template's own menutype. Joomla resolves bare component links
   (`view=login`/`view=featured`/`view=profile`/…) to the lowest-id published item with that link across
   ALL menutypes, so leftover demo items hijack routing/auth. See gotcha #34.
2. **No duplicate `link` queries.** Give each home/landing/featured variant a distinct query (category
   filter or single-article). Gotcha #35.
3. **Auth pages = `access=2`.** Profile/Edit-Profile menu items must be Registered, so guests redirect to
   login (not home). Set the Login item's `login_redirect_menuitem`. Gotchas #36–37.
4. **Build COMPLETE pages.** Each generated page = masthead/hero + the main view + supporting
   modules/bands (stats, process, testimonial, related) + CTA + sidebar where sensible — never a naked
   `view=article`. Service-list items each get their OWN detail page. Gotcha #39.
5. **Test every flow live** (gotcha #33 harness): each item → its own page (unique content fingerprint),
   wrong-password stays on login + error, guest Edit-Profile → login → returns, 0 overflow, 0 PHP warnings.

## Content richness (mandatory — gotcha #51)

Coverage (all the pages exist) is NOT the bar — **DENSITY** is. Each page must be packed with real,
plentiful content across many sections, mirroring the source design's depth. Create enough demo
content that listing/blog/category pages show MANY items, the single article has a full multi-subhead
body + author box + related, marketing pages stack 5-8 rich sections, and auth/system pages have a
masthead + form + supporting section. Never ship a thin page just to tick the coverage box. The upstream
`html-template-authoring` bundle arrives dense (its `assertRichness` gate guarantees it) — keep it dense.
