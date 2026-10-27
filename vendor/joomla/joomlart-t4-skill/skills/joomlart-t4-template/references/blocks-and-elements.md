# Blocks & elements (T4 header / footer / nav / off-canvas)

> **Phase 3 packet.** Read when building chrome (header / nav / footer / off-canvas) as
> `html/layouts/t4/block/*` and declaring `<positions>`. §5 covers megamenu *structure/mechanism*;
> the megamenu *seeding procedure* lives in `demo-content.md` §4 (Phase 7).

How the visible header, navigation, and off-canvas of a T4 template are
assembled from two kinds of partial: **blocks** (template-authored HTML) and
**elements** (framework PHP renderers). This is the layer that turns a chosen
"header style" into real markup, and the place you reach for when a structural
row is too complex to express as a plain module position.

Cross-links:
- [`layout-json.md`](layout-json.md) — the `etc/layout/*.json` skeletons, `<positions>`, and the section/column `type` enum that decide what goes into admin-editable rows.
- [`demo-content.md`](demo-content.md) — how the menu tree, megamenu structure, modules, and articles are seeded into the database (the megamenu STRUCTURE is DB-seeded, not authored here).

---

## 1. Blocks — template-authored HTML partials

A **block** is a plain `.html` partial living in the template at:

```
templates/<template>/html/layouts/t4/block/*.html
```

In `t4_bs5_blank` the shipped blocks are:

```
html/layouts/t4/block/header-1.html
html/layouts/t4/block/header-2.html
html/layouts/t4/block/header-3.html
html/layouts/t4/block/header-4.html
html/layouts/t4/block/mainnav.html
```

A block is selected one of two ways:

1. **By a layout-JSON `block` column.** A section/column in `etc/layout/*.json`
   can carry `"type": "block"` with a `"block": "<name>"` value, and T4 renders
   `block/<name>.html` at that spot. (See the column `type` enum in
   [`layout-json.md`](layout-json.md) §1b.)
2. **By a header style.** The template's "Header" / header-style param maps the
   chosen style number to `block/header-<n>.html`. Switching header style in
   the T4 admin just swaps which of these partials is rendered into the header
   row of the master layout.

Blocks contain only markup plus `<jdoc:include>` directives — no PHP. Two
`jdoc` types appear inside them:

- `type="element"` — render a framework **element** (PHP renderer, §2).
- `type="modules"` — render whatever modules an admin has published to a named
  **module position** (the admin-editable escape hatch).

### 1a. Real `header-2.html`, annotated

```html
<!-- HEADER BLOCK -->
<header class="header-block header-block-2">
  <div class="container-xxl">
    <div class="header-wrap d-flex align-items-center justify-content-between collapse-static">

      <!-- ELEMENT: logo. data-home is a per-include param read by the element. -->
      <jdoc:include type="element" name="logo" data-home="index.php" />

      <div class="t4-navbar mx-auto collapse-static">
        <!-- ELEMENT: the desktop megamenu (renders mod_menu w/ layout 'mega'). -->
        <jdoc:include type="element" name="megamenu" />
      </div>

      <div class="t4-header-r d-flex align-items-center">
        <!-- MODULES: admin-editable. Whatever is published to position
             "header-r" (search, login, language, cart…) renders here.
             style="raw" = no chrome/title, just the module body. -->
        <jdoc:include type="modules" name="header-r" style="raw" />

        <!-- ELEMENT: the collapsed (mobile) megamenu hamburger. -->
        <jdoc:include type="element" name="megamenu-toggle" />

        <!-- ELEMENT: the off-canvas trigger button. -->
        <jdoc:include type="element" name="offcanvas-toggle" />
      </div>

    </div>
  </div>
</header>
<!-- // HEADER BLOCK -->
```

Read each `jdoc` line as a slot:

| Directive | What fills it | Who controls it |
|---|---|---|
| `type="element" name="logo"` | `element/logo.php` output (image or site-name text) | Template params (Site → logo upload) |
| `type="element" name="megamenu"` | `element/megamenu.php` → `mod_menu` w/ `layout=mega` | Menu items + DB megamenu structure |
| `type="modules" name="header-r"` | any modules published to `header-r` | **Admin** (Extensions → Modules) |
| `type="element" name="megamenu-toggle"` | mobile hamburger for the collapsed menu | Navigation profile (`mega_showsm`) |
| `type="element" name="offcanvas-toggle"` | the off-canvas open button | Navigation profile (`oc_enabled`) |

### 1b. How the four header blocks differ

All four wire up the same elements; they differ only in DOM structure and which
slots they expose:

- **`header-1.html`** — logo + `header-r` modules in one bar, then a *separate*
  `<nav class="mainnav … border-top border-bottom">` row below it containing
  `megamenu`. Classic "logo row over a full-width nav bar".
- **`header-2.html`** — single centered bar: logo left, `megamenu` `mx-auto`
  (centered), `header-r` + toggles right. (Quoted above.)
- **`header-3.html`** — centered logo with toggles, then a separate centered
  `t4-navbar` row for the megamenu. No `header-r` position.
- **`header-4.html`** — two-tier: a `header-top` strip (`bg-light`, logo +
  `header-r`) above a `header-bottom` bar holding `megamenu`, the toggles, and a
  second `type="modules" name="header-search"` position. The richest header.

`mainnav.html` is a minimal standalone nav fragment (`megamenu` +
`offcanvas-toggle`) used where a header block delegates its nav row.

> Choosing a header is a config decision, not a code decision: pick the closest
> shipped block via the header-style param. Author a *new* block only when none
> of header-1..4 matches the target DOM (§4).

---

## 2. Elements — framework PHP renderers

An **element** is a PHP renderer invoked by `<jdoc:include type="element"
name="<name>" … />`. Elements resolve through the standard T4 override chain —
**template overrides base** — so a template can replace any element by dropping
a file at the same relative path.

There are two base layers that ship elements (both are "base"; the template sits
above both):

```
plugins/system/t4/layouts/t4/element/            # plugin base layer
  block.php   logo.php   sitename.php

plugins/system/t4/themes/base/html/layouts/t4/element/   # theme base layer
  logo.php   masthead.php   megamenu.php   megamenu-toggle.php   offcanvas-toggle.php
```

To override in a template, mirror the path under the template's `html/`:

```
templates/<template>/html/layouts/t4/element/<name>.php
```

Real examples in this repo: `ja-spark-for-joomla-6` ships template-level
overrides `element/logo_.php` and `element/theme-toggle.php`; other templates
ship their own `logo.php` / `sitename.php`. The base file is the fallback you
copy from.

### 2a. Available elements

| Element | Base file | Renders | Notable params / behavior |
|---|---|---|---|
| **logo** | `themes/base/.../element/logo.php` | `<div class="navbar-brand">` with the logo `<img>`, an optional small-screen logo, or a site-name/slogan text fallback when no image is set | Reads `site-settings` (`site_logo`, `site_logo_small`, `site_name`, `site_slogan`). Per-include param `nolink` suppresses the `<a>` wrapper; `data-home` is passed through from the block. |
| **megamenu** | `themes/base/.../element/megamenu.php` | A `mod_menu` instance rendered with `layout='mega'` (the megamenu) | Reads **`menutype`**: `$displayData->params['menutype']` first, else `navigation-settings.menu_type` (default `mainmenu`). This per-include param is what enables **multi-megamenu** — two header nav rows bound to different menus. Also injects `js/megamenu.js`. |
| **megamenu-toggle** | `themes/base/.../element/megamenu-toggle.php` | The collapsed-menu hamburger (`<button class="navbar-toggler">`) targeting `#t4-megamenu-<menutype>` | Returns nothing unless `navigation-settings.mega_showsm` is truthy. Breakpoint from `option_breakpoint` (default `lg`). |
| **offcanvas-toggle** | `themes/base/.../element/offcanvas-toggle.php` | The `#triggerButton` span that opens the off-canvas panel | Returns nothing unless `navigation-settings.oc_enabled`. Honors `oc_showlg` (also show on desktop → adds body class `oc-desktop`), `oc_effect`, `oc_rightside`. **Keep `id="triggerButton"` if you override.** |
| **masthead** | `themes/base/.../element/masthead.php` | The page-heading band (`t4-masthead-title` + description), with optional background image/color | Reads the active menu item's params: `page_heading` / `page_subheading`, `page_heading_desc`, `page_heading_bg_img`, `page_heading_bg_color`. Returns `''` when no heading is set. |
| **sitename** | `plugins/system/t4/layouts/t4/element/sitename.php` | A bare `<h1 class="t4-site-name">` from the `sitetitle` param | Plugin-layer element (note the different base path — `layouts/`, not `themes/base/html/layouts/`). |

> `sitename` and `masthead` are separate concepts. `sitename` is an
> `<h1>`-level site title (SEO/branding) you can drop near the logo;
> `masthead` is the per-page heading banner driven by menu-item params.

### 2b. Element resolution order (most-specific wins)

```
templates/<template>/html/layouts/t4/element/<name>.php   ← template override (use this)
        ↓ falls back to
plugins/system/t4/themes/base/html/layouts/t4/element/<name>.php   ← theme base
        ↓ (for block/logo/sitename) also
plugins/system/t4/layouts/t4/element/<name>.php           ← plugin base
```

When overriding, copy the base file into the template path verbatim, then edit —
do not hand-write from scratch, so you keep the param plumbing (e.g. `logo`'s
`cleanImageURL` handling, `offcanvas-toggle`'s `id="triggerButton"`).

---

## 3. Off-canvas

The off-canvas drawer is **two cooperating pieces plus a config profile**:

1. **The trigger** — the `offcanvas-toggle` element placed in a header block
   (§2a). Emits `<span id="triggerButton" … data-offcanvas-trigger="off-canvas-<effect>">`.
2. **The panel** — the **layout** `themes/base/.../layout/offcanvas.php` (note:
   `layout/`, not `element/`). It renders the drawer shell:
   - a header with the logo,
   - a **body that is a module position**:
     ```php
     <jdoc:include type="modules" name="<?php echo $oc_pos_name ?>"
                   style="<?php echo $oc_pos_style ?>" />
     ```
     where `oc_pos_name` defaults to **`off-canvas`** and `oc_pos_style` to
     `xhtml`,
   - an optional footer fed by the `offcanvas-footer` position.
3. **The Navigation profile** (`navigation-settings` in the template params /
   `etc/navigation/*.json`). Everything is gated and shaped here:
   `oc_enabled` (panel + trigger render at all), `oc_effect`
   (`left`/`left-reveal`/`left-push`), `oc_rightside`, `oc_showlg`,
   `oc_pos_name`, `oc_pos_style`, `oc_menu_effect`, `option_breakpoint`.

So: **to populate the off-canvas, publish a menu module (or any modules) to the
`off-canvas` position** (or whatever `oc_pos_name` is set to), and enable
`oc_enabled` in the Navigation profile. The framework handles the CSS/JS
(`js-offcanvas`, `bodyScrollLock`, `offcanvas.js`) and the slide animation.

---

## 4. Hybrid-home decision rule — block vs. position vs. mod_custom

A demo homepage is rarely "all modules" or "all hard-coded". Decide **per row**:

**Rule of thumb:**

- **Structural rows → `positions` / `module` columns (admin-editable).** Any row
  that is "a band of one-or-more modules" — a logo bar, a stats strip, a
  testimonials carousel module, a newsletter CTA module — belongs in the layout
  JSON as a `positions`/`module` column so an admin can edit it in
  Extensions → Modules. This is the default; prefer it. (See the column `type`
  enum in [`layout-json.md`](layout-json.md) §1b.)
- **Genuinely complex hero / feature blocks → a `block` override OR a Custom
  HTML (`mod_custom`) module carrying the markup.** When a row is a bespoke
  composition (overlapping layers, a background image with absolutely-positioned
  CTAs, hand-tuned grid that no single module emits), express it as markup:
  either author a `block/*.html` and reference it from the layout JSON, or paste
  the HTML into a `mod_custom` module published to a position. Use a **block**
  when the markup is template-owned and should ship with the template; use
  **mod_custom** when the content is demo-specific and an admin may want to edit
  the copy/image in place.

**Concrete examples:**

1. **Marketing hero — bg image + headline + two CTA buttons → `block`.** The
   overlay layering and button positioning are structural and template-owned.
   Author `html/layouts/t4/block/home-hero.html` and reference it from a
   `"type": "block"` column in `etc/layout/home.json`. (If the copy must be
   admin-editable, do it as a `mod_custom` instead.)
2. **3-up feature grid backed by articles → `mod_articles_category` in a
   position.** This is structural/data-driven, not bespoke markup: publish an
   Articles – Category module (3 columns, a chosen category) to e.g.
   `section-1` and let the layout JSON expose that position. Admin-editable,
   content comes from the DB.
3. **Stats / counters strip (4 numbers) → position with a counter module, OR a
   small `mod_custom`.** If a counter module exists, use a position; if it's
   four static figures with an icon each, a `mod_custom` (or block) carrying the
   tiny grid is simpler than wiring four modules.

> **The megamenu structure is NOT a block.** The columns, widths, sub-menu
> grouping, and any per-item module content of the megamenu live in the
> **database** (menu params), seeded at install time — see
> [`demo-content.md`](demo-content.md). The `megamenu` *element* only renders
> whatever structure the DB holds; do not try to author megamenu columns as HTML
> in a block.

---

## 5. Mega menu structure — keep the top row small, group the rest

This is a **design** decision the template-builder must get right, not just a
wiring detail. Real JoomlArt navs (verified across vega, nova, spark, trip,
prodex, essence, morgan, teline) follow one consistent shape; copy it.

### 5a. Top-level item count — 4–7 (more only for news portals), never a flat dump

| Template kind | Top-level items | Mega panels |
|---|---|---|
| business / agency / SaaS (vega, nova, prodex, morgan) | **4–6** | 1–2 |
| multipurpose / blog (spark, essence) | **4–5** | 3–4 |
| news portal (teline) | up to ~9 | 7 (each is a content section) |

So **business/agency = 4–6 top items**; only news portals run higher. A **10+
item flat row is a red flag** (gotcha #23). The long tail of pages does **not** go
on the top row — it gets grouped into a mega/dropdown panel under one item
(usually "Pages").

The top row is: a few **plain links** (Home, Work, Journal, Contact), **one or
two items that open a panel** (Services▾, Pages▾), and a **right cluster** of
furniture: optional search icon · dark-mode toggle · a solid accent **CTA pill**
("Get Started" / "Start a project"). Logo left, nav centered or left-after-logo.

### 5b. Panel anatomy — 2–5 titled columns

A mega panel is **2–5 columns**, each a **bold/underlined column title** over a
grouped list. Mix three column kinds (the renderer supports all three — see
`mega_sub.php` column `type`):

- **`items`** — a **menu-item link list**. Its `items:"id,id,…"` selects/orders a
  subset of that top item's **real menu CHILDREN** (the ids MUST be children of
  the mega item — `mega_items.php` only renders from the item's sub-tree).
- **`module`** — a published module by `module_id` (e.g. a `mod_custom` carrying a
  **2×2 icon-card grid** of capabilities, or a **featured case-study card** with a
  thumbnail, or a **tinted CTA promo** column). This is where the "designed" feel
  lives.
- **`position`** — a module position rendered inline.

A good 3-column "Services" mega (model: vega *Our Services*): **col1** = `items`
link list of services · **col2** = `module` 2×2 icon-card grid · **col3** =
`module` featured card or tinted CTA. A good grouped "Pages" panel (model: prodex
*Pages*): 2–3 `items` columns ("Studio" / "Explore" / …) + an optional CTA module
column. Column widths are Bootstrap `col` values inside each `settings.contents`
entry (e.g. 4/5/3 = 12); set the panel `width` (e.g. `"960px"`) on the item.

### 5c. It renders from the DB param, AND from the navigation file (the mechanism)

The columns render from **two** places that must agree (gotcha #3) — this is the
*why*; the full seeding procedure + JSON shape is in **`demo-content.md` §4** (the
canonical megamenu-seed reference). Pin the mechanism here, do the work there:

1. `#__template_styles.params['navigation_mega_settings']` — the **document
   renderer** (`Renderer/Megamenu.php`) reads this only to pick the menutype
   (`key($megConfig)` → the JSON's **top key MUST be your menutype**, e.g.
   `auroramenu`).
2. `etc/navigation/<profile>.json` `mega_settings` — `mega.php` reads the actual
   **column definitions** from the file-based `navigation-settings` registry
   (loaded by `Document/Template.php::loadTypelistData`). So the per-item columns
   must be present in this file too, not only in the DB param.

A top item only opens a **mega** panel when its entry has a truthy **`megabuild`**
flag; without it, an item with menu children renders a plain (single-column)
dropdown — which is exactly what you want for a short list. Build menu items FIRST
→ capture ids → seed both places with `scripts/seed-megamenu.mjs` (procedure:
`demo-content.md` §4).

### 5d. Behaviour contract — every panel link must be REACHABLE by a mouse

The structure above is only half the contract. T4's `megamenu.js` (not your code) drives the
open/close: `mouseenter` on the top `<li>` opens, `mouseleave` closes, `touchstart` toggles,
and NOTHING closes on Escape or outside-click unless the template adds it. A panel that looks
right when force-opened for a screenshot can still be unusable. The template is done only
when, for each top item that owns a panel, all of these hold with a REAL pointer:

| Rule | Why it breaks | Verify |
|---|---|---|
| Hover (or click, per `mega_dropdown_effect`) on the trigger opens the panel | — | `scripts/review/mega-hover.mjs <url>` → `opens` |
| The pointer can travel from the trigger INTO the panel without it closing | any pixel strip between the `<li>` box and the panel box that is not a descendant of the `<li>` fires `mouseleave`. A **full-width panel anchored to the header** (the `<li>` made `position:static` so the panel resolves against `.<tpl>-header`) ALWAYS leaves such a strip = header bottom − nav row bottom. So does a panel with `top`/`margin` offset, or a nav row that wrapped (gotchas #55) | `mega-hover.mjs` → `gapPx`, `survivesDrop`, `closedAtY`. Fix = bridge the strip with pseudo-elements that are DOM children of the `<li>` (see gotchas #80) |
| A link inside the panel can be clicked and navigates | pointer hit-test captured by a later section (compositing — recurring-defects `[MEGAMENU-HOVER-DEADZONE]`, P56); `pointer-events`; a link that is `#` | `mega-hover.mjs` → `reachesLink`, `clickNavigates`, `landed` |
| Escape closes the open panel and returns focus to the trigger; a click outside closes it | T4 ships neither on desktop (its outside-click handler is touch-only) — the template's own JS must remove `.show` from BOTH the `<li>` and its `.dropdown-menu` (removing one leaves the other stuck) | `mega-hover.mjs` → `escapeCloses`, `outsideClickCloses` |
| Below the breakpoint the same links live in the off-canvas drilldown (§5e) | — | drawer open/close in the interaction probe |

Run `mega-hover.mjs` at the desktop breakpoint AND at 1024 (the header is taller when the
brand line wraps, so the gap changes), in every site language (RU labels are wider — the nav
may wrap, see gotchas #55). Force-opening the panel (`verify-recipes.md` "Open megamenu…") is
for STYLE probes only; it never exercises this contract.

### 5e. Mobile = off-canvas drilldown

The mega columns do **not** appear on mobile. Below the breakpoint, hide the
desktop megamenu and show the **off-canvas drawer** (§3) with the SAME menu
(`oc_pos_name` position carrying a `mod_menu` bound to your menutype). Set
`oc_menu_effect: "drill"` so items with children show a `›` chevron and **slide
into the sub-level** (not an in-place accordion). One hamburger only.
