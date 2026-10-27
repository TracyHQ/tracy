# Conversion Contract — HTML bundle → T4

> **Phase 2 packet (Parse & Map).** Read when turning the HTML bundle into the normalized page-map.
> Output feeds Phase 4 (layouts) and Phase 8 (verify). Pairs with `catalog.md` (the SELECT step that
> runs alongside the parse).

This is the contract between the **HTML bundle** (the design, produced by an upstream/future
"bundle authoring" skill) and **this** builder skill (Phase 2 — Parse & Map). It defines:

1. The **canonical bundle layout** an authoring skill must produce.
2. The **`manifest.json` schema** (light **and** dark palette) that declares page→view mappings.
3. The **page→view mapping table** used when the manifest is present.
4. The **heuristic fallback** for inferring mappings when the manifest is absent or incomplete.

The output of Phase 2 is a normalized page-map that feeds `page-coverage-matrix.md` (which views
must be overridden + verified) and `layout-json.md` (how each mapped page becomes `etc/layout/*.json`
and `etc/theme/default.json`).

> **The HTML is the spec.** The manifest only *declares intent*; it never overrides what the markup
> actually renders. When manifest and DOM disagree, the DOM wins and you confirm with the user.

---

## 1. Canonical bundle layout

An authoring skill SHOULD emit this exact shape. The builder reads it as-is.

```
bundle/
  manifest.json
  pages/
    index.html        # home / featured
    blog.html         # category blog (card/list grid)
    single.html       # single article
    contact.html      # contact form
    login.html        # login form
    register.html     # registration form
    profile.html      # user profile / edit
    search.html       # search results
    tag.html          # tagged items
    404.html          # not-found page
    offline.html      # site-offline page
    <extra>.html      # any additional design page (about, pricing, gallery, …)
  assets/
    css/              # stylesheets (light + optional dark)
    js/               # scripts
    images/           # bitmaps, SVG, logo, favicons
    fonts/            # self-hosted webfonts (if not CDN)
```

Rules:

- Filenames in `pages/` are the **canonical names** in the mapping table (§3). Any file not in that
  table is an `<extra>` page and is treated as `com_content.article` / a static block unless the
  manifest says otherwise.
- `pages/` is flat — no nested subdirectories. One HTML file per design page.
- `assets/` mirrors what the pages reference with **relative** paths (`../assets/css/...`). The builder
  rewrites these to T4 media paths during port.
- A **dark variant** may appear as (a) a separate `assets/css/dark.css`, (b) a `:root[data-theme=dark]`
  / `.dark` / `html.t4-dark` block inside the main CSS, or (c) declared explicitly in the manifest
  palette. The builder prefers the manifest palette; otherwise it derives dark per §4.

---

## 2. `manifest.json` schema

Annotated example — every field documented. **Palette is split into `light` and `dark`.**

```jsonc
{
  // --- Template identity. Becomes ja_<name> / templateDetails.xml. ---
  "template": {
    "name": "ja_acme",        // T4 machine name <TPL>. Lowercase, ja_ prefix. REQUIRED.
    "title": "Acme",          // Human title shown in Joomla admin. REQUIRED.
    "bootstrap": "bs5"        // "bs5" (default) — pins the t4_bs5_blank base + grid classes.
  },

  // --- Theme tokens. Carries BOTH palettes; feeds etc/theme/default.json + palettes.json. ---
  "theme": {
    "palette": {
      // Light is REQUIRED. Each value is a CSS color the builder tokenizes (see css-tokenizing.md).
      "light": {
        "primary":   "#2f6bff", // brand/accent — CTAs, links, active nav
        "secondary": "#1b2a4a", // supporting brand color
        "body_bg":   "#ffffff", // page background surface
        "text":      "#1a1a1a"  // default body text
      },
      // Dark is RECOMMENDED. If omitted, the builder derives it in Phase 7 per
      // dark-light-mode-standard.md (see §4). Same keys as light.
      "dark": {
        "primary":   "#5b8cff",
        "secondary": "#9db4e6",
        "body_bg":   "#0e1116",
        "text":      "#e6e8eb"
      }
    },
    "fonts": {
      "body":    "Inter",     // default text font-family. REQUIRED.
      "heading": "Poppins"    // headings font-family. Falls back to body if omitted.
    }
  },

  // --- Page map: ordered list, one entry per pages/*.html the author wants mapped. ---
  // A realistic template has ~18–24 of these (multiple homes + landing + about/services/
  // pricing/team/faq + blog/single + contact + auth + 404/offline), not ~10. See
  // page-coverage-matrix.md tier F for the default set.
  "pages": [
    {
      "file": "index.html",            // path under pages/. REQUIRED, must exist.
      "view": "com_content.featured",  // Joomla view id (see §3). Optional — inferred if absent.
      "layout": "home",                // etc/layout/*.json name. Optional; defaults per view.
      "style": "Home",                 // template style to bind this layout to (gotcha #15). Optional.
      // sections[]: ordered regions of the page. Drives blocks vs positions vs ACM in layout-json.md.
      "sections": [
        { "id": "hero",     "kind": "acm",       "acm": "hero",     "position": "masthead" },
        { "id": "features", "kind": "acm",       "acm": "features-intro", "position": "section-1" },
        { "id": "art",      "kind": "block" }                          // frozen markup (no admin edit)
      ]
    },
    {
      "file": "home-2.html",           // a SECOND home variant — its own layout + style
      "view": "com_content.featured",
      "layout": "home-2", "style": "Home-2",
      "sections": [
        { "id": "hero",  "kind": "acm", "acm": "hero",        "position": "masthead" },
        { "id": "team",  "kind": "acm", "acm": "teams",       "position": "section-1" },
        { "id": "price", "kind": "acm", "acm": "pricing",     "position": "section-2" }
      ]
    },
    { "file": "landing.html", "view": "landing",            "layout": "landing", "style": "Landing" },
    { "file": "about.html",   "view": "com_content.article" },        // page-type "about"
    { "file": "services.html","view": "com_content.category.blog" },  // page-type "services"
    { "file": "pricing.html", "view": "com_content.article" },        // page-type "pricing"
    { "file": "team.html",    "view": "com_content.category.blog" },  // page-type "team"
    { "file": "faq.html",     "view": "com_content.article" },        // page-type "faq" (accordion)
    {
      "file": "blog.html",
      "view": "com_content.category.blog"
      // no sections[] → whole page is the component view, default layout
    }
  ],

  // --- ACM section blocks the template registers under acm/<block>/ (editable home sections). ---
  // The union of every sections[].acm used, plus any extra the design implies. See
  // page-coverage-matrix.md tier B for the ~11-block common set.
  "acm": [ "hero", "features-intro", "cta", "testimonials", "teams", "clients",
           "pricing", "gallery", "statistics", "accordion", "social" ],

  // --- Module positions to declare in templateDetails.xml (superset of sections[].position). ---
  "positions": [ "menu", "masthead", "section-1", "section-2", "footer" ],

  // --- Reserved: parent template(s) this design extends/inherits. Usually []. ---
  "extends": []
}
```

### Field reference

| Path | Required | Meaning |
|---|---|---|
| `template.name` | yes | `<TPL>` machine name, `ja_<name>`, lowercase. Persisted in DB on install — rename **before** install (see SKILL Phase 1). |
| `template.title` | yes | Human-readable title in admin. |
| `template.bootstrap` | no (`bs5`) | Base/grid framework; pins which blank template to clone. |
| `theme.palette.light` | yes | Light tokens: `primary`, `secondary`, `body_bg`, `text`. |
| `theme.palette.dark` | recommended | Dark tokens, same keys. Omitted ⇒ derived (§4) or dark-mode skill handoff. |
| `theme.fonts.body` | yes | Default font-family. |
| `theme.fonts.heading` | no | Heading font-family; defaults to `body`. |
| `pages[].file` | yes | `pages/`-relative HTML filename; must exist on disk. |
| `pages[].view` | no | Joomla view id (§3). Inferred via §4 when absent. |
| `pages[].layout` | no | `etc/layout/*.json` name. Defaults to the view's standard layout. Use distinct names per home variant (`home`, `home-2`, …) + `landing` / `*-detail`. |
| `pages[].style` | no | Template style to bind the layout to. Each home/landing layout needs its own style (gotcha #15/#16/#20); inner pages share the `Inner`/`default` style. |
| `pages[].sections[]` | no | Ordered page regions. Absent ⇒ page is the plain component view. |
| `pages[].sections[].id` | yes (within section) | Stable id; becomes the block name, ACM instance, or position label. |
| `pages[].sections[].kind` | yes (within section) | One of the **kind enum** below. |
| `pages[].sections[].acm` | when `kind=acm` | The `acm/<block>/` block type to publish (e.g. `hero`, `pricing`). |
| `pages[].sections[].position` | when `kind=acm`/`positions`/`module` | T4 module position name. |
| `pages[].sections[].module` | when `kind=module` | Specific module type/id to render. |
| `acm[]` | no (`[]`) | ACM section blocks to register under `acm/<block>/` (superset of every `sections[].acm`). The ~11-block common set, or whatever the design's home sections imply. |
| `positions[]` | yes | All module positions to declare in `templateDetails.xml`. |
| `extends[]` | no (`[]`) | Reserved for template inheritance. |

### `sections[].kind` enum

| kind | Meaning | Builder action |
|---|---|---|
| `acm` | An **editable front-page section** (hero, features, team, pricing, testimonials…). | Register an `acm/<block>/` block (named by `acm`); publish it as a module to `position`; admin can re-edit it. **Prefer this for content-like home sections.** |
| `block` | Static, design-heavy region (complex hero art) with no admin editability needed. | Author an `html/layouts/t4/block/*` static override reproducing the markup. |
| `positions` | A generic module **position** users drop arbitrary modules into. | Declare the `position`; render it in the layout JSON; seed a demo module. |
| `module` | One **specific** module rendered inline (e.g. a login module, a search module). | Render that module type/id at `position`. |
| `component` | The Joomla **component main area** (the view's own output). | Render `<jdoc:include type="component" />`; no static markup. |

> Prefer `acm`/`positions`/`module` over `block` whenever the region is content-like — the template
> must stay **editable through admin** (SKILL principle 4). Reserve `block` for genuinely complex
> static design art. See `layout-json.md` §1d for ACM block vs static block.

---

## 3. Page → view mapping table

When the manifest provides `pages[].view`, use it. Otherwise these canonical filenames map as:

| Bundle file | Joomla view (`view` id) | Realized as |
|---|---|---|
| `index.html` | `com_content.featured` | Featured-articles home (hybrid: ACM positions + blocks), layout `home` |
| `home-2.html` / `home-3.html` / `<vertical>.html` | `com_content.featured` | **Additional home variant** — its own `home-2`/`home-3`/named layout + own style |
| `landing.html` | `landing` | Chrome-light marketing page — its own `landing` layout + style |
| `about.html` | `com_content.article` | About / Story page (page-type `about`) |
| `services.html` / `features.html` | `com_content.category.blog` | Services/Features grid (page-type `services`) |
| `pricing.html` | `com_content.article` | Pricing page (page-type `pricing`; usually an ACM `pricing` block) |
| `team.html` | `com_content.category.blog` | Team grid (page-type `team`; usually an ACM `teams` block) |
| `faq.html` | `com_content.article` | FAQ page (page-type `faq`; usually an ACM `accordion` block) |
| `portfolio.html` / `gallery.html` | `com_content.category.blog` | Portfolio/gallery grid (page-type `portfolio`) |
| `coming-soon.html` | `com_content.article` | Coming-soon marketing page (a normal menu page — no root PHP) |
| `blog.html` | `com_content.category.blog` | Category blog (card/list grid) |
| `single.html` | `com_content.article` | Single article |
| `contact.html` | `com_contact.contact` | Contact form |
| `login.html` | `com_users.login` | Login form |
| `register.html` | `com_users.registration` | Registration form |
| `profile.html` | `com_users.profile` | User profile / edit profile |
| `search.html` | `com_finder.search` | Smart Search results |
| `tag.html` | `com_tags.tag` | Tagged-items list |
| `404.html` | `error` | `error.php` + `error-t4.php` (full standalone pages) |
| `offline.html` | `offline` | `offline.php` (full standalone page) |

`landing` is **not** a component view — it is a chrome-light layout bound to its own style,
hosting ACM/`mod_custom` sections (its menu item is usually a Single Article or a Featured view).
`error` and `offline` are **not** component views either — they are standalone PHP entry files
(`error.php`, `offline.php`) packaged in Phase 9. The mapping still records them so the coverage
matrix knows they must be themed and verified. See `page-coverage-matrix.md` for the full
view-by-view override + verify checklist.

---

## 4. Heuristic fallback (no manifest, or a page lacks `view`)

> **Implemented:** `node scripts/parse-html-bundle.mjs --single <dir>` (or just point at a dir with
> no `manifest.json`) runs the full heuristic pipeline below automatically via `parseRawTemplate`
> in `scripts/lib/html-bundle.mjs`. The exported helpers `extractPaletteFromCss` and `extractFonts`
> cover §4.3 and can be called independently.

Apply in order. Stop at the first decisive signal.

### 4.1 Filename inference
Map by canonical filename per §3. For non-canonical `<extra>.html`, infer from filename keywords:

- `login` / `signin` → `com_users.login`
- `register` / `signup` / `join` → `com_users.registration`
- `profile` / `account` / `dashboard` → `com_users.profile`
- `contact` → `com_contact.contact`
- `search` / `results` → `com_finder.search`
- `tag` / `tagged` → `com_tags.tag`
- `blog` / `category` / `news` / `articles` → `com_content.category.blog`
- `home-2` / `home-3` / `home-<n>` / `<vertical>-home` (or a second index-shaped page) →
  `com_content.featured` as an **additional home variant** (own layout `home-2`/… + own style)
- `landing` / `promo` → `landing` (own `landing` layout + style)
- `about` / `story` → `com_content.article` (page-type `about`)
- `services` / `features` → `com_content.category.blog` (page-type `services`)
- `pricing` / `plans` → `com_content.article` (page-type `pricing`, ACM `pricing`)
- `team` / `people` → `com_content.category.blog` (page-type `team`, ACM `teams`)
- `faq` / `questions` → `com_content.article` (page-type `faq`, ACM `accordion`)
- `portfolio` / `work` / `gallery` → `com_content.category.blog` (page-type `portfolio`)
- `coming-soon` / `comingsoon` → `com_content.article` (page-type `coming-soon`)
- `404` / `notfound` / `error` → `error`
- `offline` / `maintenance` → `offline`
- anything else → `com_content.article` (single) as the safe default.

### 4.2 DOM signals override the filename (when decisive)
Inspect the rendered markup; these override §4.1:

- `<form>` containing `input[type=password]` → **`com_users.login`**
  (two password inputs + a confirm-email field ⇒ prefer **`com_users.registration`**).
- a `<form>` with a `<textarea>` **and** an `input[type=email]` (no password) → **`com_contact.contact`**.
- presence of a single `<article>` with a title + body → **`com_content.article`**.
- a **repeated** card/list grid (≥3 sibling cards sharing a class, each with a heading + excerpt/link)
  → **`com_content.category.blog`**.
- a results list paired with a search `input[type=search]` / `[role=search]` → **`com_finder.search`**.

### 4.3 Palette extraction
Read **computed styles** (not just raw CSS) of `:root` and `body`:

- `light` tokens: `primary` ← the dominant accent (CTA/link color), `secondary` ← supporting brand
  color, `body_bg` ← `body` background, `text` ← `body` color.
- `dark` tokens: if a dark stylesheet (`dark.css`) or a dark scope
  (`.dark` / `[data-theme=dark]` / `html.t4-dark` / `[data-bs-theme=dark]`) exists, extract the same
  four keys from it. If **no** dark variant exists, leave `dark` unset; it is derived in Phase 7
  per `dark-light-mode-standard.md`.

### 4.4 Inferring the multi-page story (homes, landing, page-types, ACM sections)

A multi-page source rarely ships just one home + a component floor — infer the **richer
page model** (`page-coverage-matrix.md` tier F) from the whole bundle:

- **Multiple home variants.** Treat any page that is index-shaped (a stack of full-width
  hero/feature/cta sections, no single dominant `<article>` or card grid) as a **home
  layout**. If the nav exposes several (`Home`, `Home 2`, `Home Business`, …) or the bundle
  ships several index-shaped pages, generate **one `home*.json` layout + one style per
  variant** (median real templates ship 2–3; up to 5–7). Don't collapse them into one home.
- **Landing.** A chrome-light page (no full header/footer nav, single CTA focus) →
  `landing` layout + style.
- **Page-types.** Map about/services/pricing/team/faq/portfolio per the filename/nav keywords
  above; each is a normal menu page (article or category blog), not a new component.
- **ACM sections.** Walk each home's section stack and classify each region into an ACM
  block by its content shape: a top banner → `hero`; an icon/feature grid → `features-intro`;
  a quotes carousel → `testimonials`; a photo grid of people → `teams`; a logo strip →
  `clients`; price cards → `pricing`; a counter row → `statistics`; a collapsible Q&A →
  `accordion`; an image grid → `gallery`; a full-width banner+button → `cta`; an icon row of
  social links → `social`. Emit these into the page's `sections[]` as `kind:"acm"` and the
  union into top-level `acm[]`. Reserve `kind:"block"` only for sections too bespoke to
  parameterize. (Lean blog/news sources map their home sections to `mod_articles_category`
  layouts instead — see `page-coverage-matrix.md` tier B.)

### 4.5 Confirm ambiguity before Phase 4
**ALWAYS** confirm ambiguous or DOM-vs-filename-conflicting mappings with the user **before Phase 4
(Layouts & theme)** — once layout JSON is authored, remapping is expensive. Present each uncertain
page with: filename, inferred view, the deciding signal (or lack of one), and your recommendation.

---

## Cross-references

- `page-coverage-matrix.md` — the full set of views/components each mapped page obligates you to
  override and verify (light + dark).
- `layout-json.md` — turning the page-map (views, sections, positions) into `etc/layout/*.json`,
  `etc/theme/default.json`, and `palettes.json`.
