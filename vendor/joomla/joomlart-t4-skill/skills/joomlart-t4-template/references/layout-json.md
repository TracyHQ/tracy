# Authoring `etc/*.json` and `<positions>` (T4)

> **Phases 4–5 packet.** Read when authoring `etc/layout/*.json` (page skeletons), `etc/theme/*.json`
> + `palettes.json` (light+dark), and the ACM block anatomy (§1d). **Read §0 below FIRST** — the
> one-layout-per-style binding gates every style you create.

How to hand-author the JSON that drives a T4 template's structure and colors:
`etc/layout/*.json` (page skeletons), `etc/theme/*.json` (brand + typography +
page colors), `etc/palettes.json` (per-section color schemes), and the
`<positions>` declaration in `templateDetails.xml`.

All examples below are quoted verbatim from the reference template
`t4-framework-for-joomla-6/templates/t4_bs5_blank/etc/`. The JSON ships
minified on one line; it is pretty-printed here for reading. T4's Layout
Builder writes these files for you in the admin UI, but knowing the shape lets
you diff, script, and hand-fix them.

See also:
- [`t4-anatomy.md`](t4-anatomy.md) — where these files sit in the template tree and how T4 loads them.
- [`blocks-and-elements.md`](blocks-and-elements.md) — what the `block` and `element` column types actually render.

---

## 0. Read first — one layout per style; chrome applies to every layout

This binding gates everything below (gotchas #15/#16/#20/#52):

- **A layout binds per *template style*, not per menu item or page-class.** The active style's
  `{layout, theme, site}` tuple picks which `etc/layout/*.json` renders. To give a page a different
  layout you assign it a **different template style**, then point the menu item at that style — you do
  NOT set a layout on the menu item.
- **So: styles map to layouts, not pages** (a few well-named styles: Home + Inner + one per extra
  home/landing layout — never a style-per-page; matches `editability-standards.md` §8).
- **Chrome (header/nav/footer/off-canvas blocks) applies to EVERY layout**, not per page. Build it
  once; it renders on all styles. Don't try to vary chrome per menu item via layouts.
- **After any menu/style change, rebuild the nested set** and re-confirm each style still points at the
  intended layout (the params can silently fall back to `default` if a typelist tuple is empty —
  gotcha #52).

---

## 1. `etc/layout/*.json` — page skeletons

One file = one page layout (`default.json`, `home.json`, `no-sidebar.json`,
`Header-1.json`, …). **A layout binds per *template style*, NOT per menu item or
page-class** — the active style's `{layout, theme, site}` tuple picks which file
renders (see gotcha #15; confirmed by the official Layout Builder doc:
<https://www.joomlart.com/documentation/t4-framework/layout-builder>). To give a
page a different layout you assign it a **different template style** (then point
the menu item at that style); you do not set a layout on the menu item itself.
The shape is:

```json
{ "layout": { "sections": [ /* ordered rows */ ], "settings": { "assets": [], "fonts": [] } } }
```

A **section** is a full-width row. Each section carries layout/spacing/color
settings plus a `contents` array of **columns**. Sections render top-to-bottom
in array order; columns render left-to-right.

### 1a. Section keys (the row)

Real "Main body" section from `default.json`, annotated:

```jsonc
{
  "name": "Main body",      // human label. Slugified → id="t4-main-body" on the <section>,
                            //   plus a "t4-main-body" class hook. This is your CSS target.
  "container": "1",         // "1"/"fix" = fixed-width .container; "full"/none-empty = .container-fluid;
                            //   "none"/"" = no container wrapper (edge-to-edge).
  "layout": "3+6+3",        // Bootstrap 12-col split across the columns in `contents`.
  "widths": "3+6+3",        //   "3+6+3" → col-3 / col-6 / col-3. "auto" = col (flex-fill).
  "cols": "3",              // column count (must match contents length).
  "sectionid": 1,
  "color_pattern": "",      // palette class → applies a scheme from palettes.json (see §3).
                            //   e.g. "dark" wraps the row in class "dark" + color-pattern vars.
  "sticky": "",             // "sticky" makes the row position:sticky (sticky headers).
  "extra_class": "",        // extra CSS classes appended to the <section>.

  // Responsive spacing — per Bootstrap breakpoint (xs/sm/md/lg/xl):
  "padding_xs": "", "padding_sm": "", "padding_md": "", "padding_lg": "", "padding_xl": "",
  "margin_xs": "",  "margin_sm": "",  "margin_md": "",  "margin_lg": "",  "margin_xl": "",

  // Background overlay (image OR video). overlay_type selects which:
  "overlay_type": "",          // "" none | "image" | "video"
  "background_image": "",
  "background_repeat": null, "background_size": null,
  "background_attachment": null, "background_position": null,
  "video_type": null, "video_id": "",     // e.g. youtube id
  "file_cover": "", "file_mp4": "", "file_webm": "", "file_ogg": "",  // self-hosted video
  "opacity": "0.5",            // overlay opacity over the bg media

  "contents": [ /* columns — see §1b */ ]
}
```

Responsive **hidden_** flags live on the **columns** (see below), letting you
hide a column at a breakpoint (e.g. drop a sidebar on mobile).

The `name` is load-bearing for CSS: a section named `Header` becomes
`id="t4-header"`. Sections in `default.json`: `Header`, `Masthead`,
`Main body`, `Breadcrumbs`, `Footnav`, `Footer`.

### 1b. Column keys + the `type` enum

Every entry in a section's `contents` is a column. The `type` field decides
what renders inside it. Real columns from `default.json`, one per type:

**`type: "block"`** — a T4 block partial from `html/layouts/t4/block/`
(reusable markup fragment such as a full header bar). Picked by `block`:

```jsonc
{
  "type": "block", "block": "header-2",  // renders html/layouts/t4/block/header-2.html
  "name": "header-2", "col": 12,
  "modname": "mod_custom", "device": "def", "idx": 0
}
```
A block can itself pull in `element`s and module `positions` (e.g.
`header-2.html` does `<jdoc:include type="element" name="logo" />`,
`type="element" name="megamenu"`, `type="element" name="offcanvas-toggle"`).
See [`blocks-and-elements.md`](blocks-and-elements.md).

**`type: "element"`** — a single T4 element partial from
`html/layouts/t4/element/` (logo, masthead, megamenu, megamenu-toggle,
offcanvas-toggle). Picked by `element`:

```jsonc
{
  "type": "element", "element": "masthead",  // renders element/masthead.php
  "name": "masthead", "col": 12,
  "extra_class": "text-center", "device": "def", "idx": 0
}
```
Elements accept extra params via `extra_params`, surfaced to the partial as
`$displayData->params[...]`. The megamenu element reads `menutype` this way —
`element/megamenu.php` does:
```php
$menutype = !empty($displayData->params['menutype'])
    ? $displayData->params['menutype']
    : $navigation_settings->get('menu_type', 'mainmenu');
```
So to put a **second** megamenu bound to a different Joomla menu, add a
`megamenu` element column with `"extra_params": "menutype=topmenu"`. This is
the multi-megamenu mechanism.

**`type: "component"`** — the Joomla component output (article, K2, VirtueMart,
the main content area). Exactly one per content layout, usually the center
column:

```jsonc
{ "type": "component", "name": "", "col": 6, "md": "auto", "device": "md", "idx": 1 }
```

**`type: "positions"`** — a Joomla **module position**. Every published module
assigned to that position name renders here, stacked. Picked by `positions`:

```jsonc
{
  "type": "positions", "positions": "sidebar-l",  // must be declared in templateDetails.xml (§4)
  "name": "sidebar-l", "col": 3,
  "md": 12, "sm": 12,             // responsive col override: full-width ≤ md
  "style": "JAxhtml",            // Joomla module chrome / chrome style for this position
  "device": "md", "idx": 0
}
```
`default.json` uses `positions` for `sidebar-l`, `sidebar-r`, `footnav-1..4`,
`footer`.

**`type: "module"`** — one specific module by name (not a whole position).
Picked by `module` + `modname`:

```jsonc
{
  "type": "module", "module": "Breadcrumbs", "modname": "mod_breadcrumbs",
  "title": "Breadcrumbs", "name": "Breadcrumbs", "col": 12,
  "style": "no",            // "no" = no chrome
  "device": "xs", "idx": 0
}
```

#### Column fields common to all types

```jsonc
{
  "col": 3,                 // base (xl) Bootstrap span: 1–12, or "auto".
  "xl": "", "lg": "", "md": 12, "sm": 12, "xs": "",  // per-breakpoint span overrides ("" = inherit)
  "hidden_xl": "", "hidden_lg": "", "hidden_md": "", "hidden_sm": "", "hidden_xs": "",
                            //   set to hide this column at that breakpoint
  "extra_class": "",        // CSS classes on the column wrapper (e.g. "offset-lg-2 mt-4")
  "extra_params": "",       // key=value params passed to element/block partials (see megamenu above)
  "style": "",              // module/position chrome style
  "device": "md",           // builder's "edit at" breakpoint (UI hint; lowest non-empty span wins)
  "idx": 0                  // left-to-right order within the row
}
```

> **Module chrome `style` format is T4-version/context-dependent — verify per build (⚠️ gotcha #22 vs
> platform-bug P75 disagree).** Gotcha #22 (Aurora) needs **dash-format** `<tpl>-<chrome>` (e.g.
> `ja_aurora-no`); the design-review P75 (Voyara) needs the **bare** name (`JAxhtml`) or the module
> title silently drops. Render a titled module and probe for the chrome wrapper / `.module-title`, then
> use the format that works on this build. Either way, override the stray T4-base `.moduletable` box in
> scss (`editability-standards.md` §9). The bare examples above are the blank's defaults.

The `"3+6+3"` example renders as Bootstrap `col-3 / col-6 / col-3` on xl,
collapsing to the `md`/`sm` overrides (`12`) on smaller screens — i.e. sidebars
stack full-width below the content on tablet/mobile.

---

## 2. `etc/theme/default.json` — brand colors, typography, page colors

One file per **theme variation** (`default.json`, `architect.json`, `Red.json`,
…). The active theme is selected in template params. These values are compiled
into CSS custom properties / SCSS that override Bootstrap.

### 2a. Real `default.json`, annotated

```jsonc
{
  // --- Brand colors: override Bootstrap's theme color variables ---
  "color_primary":  "#0a58ca",
  "color_secondary":"#6c757d",
  "color_success":  "#198754",
  "color_info":     "#0dcaf0",
  "color_warning":  "#fd7e14",
  "color_danger":   "#dc3545",
  "color_light":    "#f8f9fa",
  "color_dark":     "#212529",
  "color_white":    "#ffffff",
  "color_black":    "#000000",

  // --- Page colors (light) ---
  "body_bg_color":        "#ffffff",
  "body_text_color":      "#212529",
  "body_link_color":      "#0a58ca",
  "body_link_hover_color":"#084298",

  // --- Main navigation colors ---
  "mainnav_text_color":       "#495057",
  "mainnav_link_color":       "#495057",
  "mainnav_link_hover_color": "#0a58ca",
  "mainnav_link_active_color":"#0a58ca",

  // --- Footer colors ---
  "footer_bg_color":        "#212529",
  "footer_text_color":      "#6c757d",
  "footer_link_color":      "#6c757d",
  "footer_link_hover_color":"#ffffff",

  // --- Per-section palettes, embedded as a JSON string (see §3) ---
  "styles_palettes": "{\"blue\":{...},\"dark\":{...},\"light\":{...},\"gray\":{...},\"mainnav\":{...}}"
}
```

### 2b. Typography (from `architect.json`)

A fuller theme also carries the font stack and heading scale. Real keys from
`architect.json`:

```jsonc
{
  "dont_use_google_font": false,
  "body_font_load_weights": "400,400i,500,500i,700,700i",
  "body_font_family": "DM Sans", "body_font_style": "normal",
  "body_font_weight": "400",     "body_font_size": "15px",
  "body_line_height": "1.87",    "letter_spacing": "0px",

  "heading_font_load_weights": "400,400i,500,500i,700,700i",
  "heading_font_family": "DM Sans", "heading_font_style": "normal",
  "heading_font_weight": "400",     "heading_line_height": "1.33",
  "heading_letter_spacing": "0px",
  "h1_font_size": "72px", "h2_font_size": "36px", "h3_font_size": "24px",
  "h4_font_size": "18px", "h5_font_size": "13px", "h6_font_size": "11px",

  // page colors can reference a brand token by name, e.g. "color primary":
  "body_text_color": "#666666",
  "link_color": "color primary", "link_hover_color": "color primary",
  "body_bg_color": "#ffffff",
  "body_bg_img": "", "body_bg_img_repeat": "repeat",
  "body_bg_img_size": "", "body_bg_img_attachment": "scroll",
  "body_bg_img_position": "left top"
}
```
Note `"link_color": "color primary"` — page colors may be a hex value **or**
the literal name of a brand token (`color primary`, `link`), which resolves to
the brand color at compile time.

### 2c. Carrying BOTH light and dark

The framework's dark hook reads dark values where present. Provide a dark
counterpart for the page/brand colors you want re-themed, alongside the light
ones, so light mode is untouched and the dark hook has something to apply.
Pattern:

```jsonc
{
  // light (default) page colors
  "body_bg_color": "#ffffff",
  "body_text_color": "#212529",
  "body_link_color": "#0a58ca",

  // dark counterparts — consumed by the framework dark hook
  "body_bg_color_dark":   "#0f1115",
  "body_text_color_dark": "#e6e6e6",
  "body_link_color_dark": "#7ab0ff",

  // brand colors usually stay shared; override only those that need it in dark:
  "color_dark":  "#212529",   // light
  "color_light": "#f8f9fa"
}
```
Keep the dark values as a parallel set and leave the light keys exactly as
shipped — that is how dark mode lands without regressing light. (See
`references/darkmode/css-architecture.md` for the runtime hook and
`html.t4-dark` / `data-bs-theme="dark"` scoping that consumes these.)

---

## 3. `etc/palettes.json` — per-section color schemes

`palettes.json` defines named color schemes a section can opt into via its
`color_pattern`. Each palette has a `class` and a set of colors. Real, complete
`palettes.json`:

```jsonc
{
  "blue":   { "class": "blue",   "status": "org", "title": "Primary",
              "background_color": "#1a61ab", "text_color": "#f8f9fa",
              "link_color": "#ffffff", "link_hover_color": "#ffffff",
              "heading_color": "#ffffff", "heading_hover_color": "#1a61ab" },
  "dark":   { "class": "dark",   "status": "org", "title": "Dark",
              "background_color": "#212529", "text_color": "#6c757d",
              "link_color": "#6c757d", "link_hover_color": "#ffffff",
              "heading_color": "#6c757d", "heading_hover_color": "#1a61ab" },
  "light":  { "class": "light",  "status": "org", "title": "Light",
              "background_color": "#ffffff", "text_color": "#6c757d",
              "link_color": "link", "link_hover_color": "#0056b3" },
  "gray":   { "class": "gray",   "status": "org", "title": "Gray",
              "background_color": "#f8f9fa", "text_color": "#6c757d",
              "link_color": "#1a61ab", "link_hover_color": "#0056b3" },
  "mainnav":{ "class": "mainnav","status": "org", "title": "Mainnav",
              "background_color": "#ffffff", "text_color": "#6c757d",
              "link_color": "#6c757d", "link_hover_color": "#0056b3" }
}
```

Fields per palette:
- `class` — the CSS class emitted on any section that selects this palette.
- `background_color`, `text_color`, `link_color`, `link_hover_color`,
  `heading_color`, `heading_hover_color` — the scheme colors.
- `title` — admin-UI label.
- `status` — `org` (original/shipped) vs `ovr` (overridden by the active theme)
  vs `loc` (local/template-only). `palettes.json` is the base set; a theme's
  `styles_palettes` (in `theme/*.json`, §2a) overrides these per theme. Compare
  `palettes.json` `blue.background_color` `#1a61ab` with `default.json`'s
  `styles_palettes` `blue.background_color` `#0a58ca` — same palette, recolored
  by the theme.

### How a section uses a palette

A section's `color_pattern` names a palette by its `class`:

```jsonc
{ "name": "Footer", "color_pattern": "dark", ... }   // → <section class="... dark"> with the dark scheme
```
So `color_pattern: "dark"` paints that row with `dark.background_color`
(`#212529`) etc. `color_pattern: ""` means "inherit page colors" (no palette).
In the shipped layouts, headers/footers use `blue`, `dark`, `mainnav`, `gray`;
content rows are mostly blank.

To add a new section scheme: add an entry to `palettes.json` (and to each
theme's `styles_palettes` if you want it recolored per theme), then set a
section's `color_pattern` to that new `class`.

---

## 4. `<positions>` in `templateDetails.xml`

Module positions referenced by `type: "positions"` columns (§1b) must be
**declared** in `templateDetails.xml`. Declaring a position does two things:
(1) it appears in the dropdown when an admin assigns a module to a position,
and (2) it becomes a valid `positions` value in layout JSON. Undeclared
positions won't render.

Real block from the blank template's `templateDetails.xml`:

```xml
<positions>
  <position>menu</position>
  <position>header-r</position>
  <position>off-canvas</position>
  <position>search</position>
  <position>banner</position>
  <position>topbar</position>
  <position>topbar-l</position>
  <position>topbar-r</position>
  <position>masthead</position>
  <position>main-top-1</position>
  <position>mega-1</position>
  <position>mega-2</position>
  <position>mega-3</position>
  <position>mega-4</position>
  <position>slideshow</position>
  <position>sidebar-l</position>
  <position>sidebar-r</position>
  <position>section-1</position>
  <position>section-2</position>
  <position>bottom-a</position>
  <position>bottom-b</position>
  <position>footnav-1</position>
  <position>footnav-2</position>
  <position>footnav-3</position>
  <position>footnav-4</position>
  <position>footnav-5</position>
  <position>footer</position>
  <position>debug</position>
</positions>
```
(abridged; the real file lists ~38 positions.)

Workflow to add a position end-to-end:
1. Add `<position>my-pos</position>` to `<positions>` in `templateDetails.xml`.
2. Add a column `{ "type": "positions", "positions": "my-pos", ... }` to the
   relevant `etc/layout/*.json` section.
3. In Joomla admin, assign one or more published modules to position `my-pos`.

The position then renders every module assigned to it, at the spot the layout
JSON places it.

---

## 1c. The multi-home-layout pattern (don't ship one home)

A real JA template ships **2–3 home layouts** (multipurpose ones ship 5–7: spark
`business/corporate/logistics/magz/product`, vogue `home-1/2/3/4/6`, essence
`home-2…5`). Each home is its own `etc/layout/<name>.json` — a section stack of
`hero / section-1 … section-N / cta / footer` rows. Author **one file per home
variant the source exposes** (`home.json`, `home-2.json`, `home-3.json`, …), each
a different stack of section rows / ACM blocks.

Because a T4 style binds **one** layout site-wide (gotcha #15), each home variant
that should be reachable as its own page needs **its own template style** (Home,
Home-2, …) and the matching menu item repointed at it via `template_style_id`
(#16/#20). The `default.json` (inner) + optional `no-sidebar.json` / `landing.json`
/ `*-detail.json` are separate files with their own styles. See
[`page-coverage-matrix.md`](page-coverage-matrix.md) tier A (layouts) and tier E
(styles) for the full set + counts.

Each home section row that holds an editable front-page section carries a
`type:"positions"` column (e.g. `"positions":"section-1"`); Phase 7 publishes an
**ACM module** (next section) into that position.

---

## 1d. ACM authoring (`acm/<block>/`) — editable home sections

`acm/<block>/` ("Advanced Custom Module") is the **T4-native flexible-section
mechanism**: it makes a **front-page section editable through the admin** instead of
freezing it as static markup. Each `acm/<block>/` dir is a block *type* the template
ships; the **`mod_ja_acm`** module renders it (one published ACM module per section).
See `catalog.md` §3 for the full block roster + per-template counts.

### The real `acm/<block>/` anatomy (verbatim from `ja_spark/acm/hero`)

```
acm/<block>/
  config.xml            # block-level form: just the block <title> (admin label).
  tmpl/
    style-1.php         # the section markup for style 1 (PHP, reads $helper/$module).
    style-1.xml         # field schema for style 1 — the params an admin edits.
    style-2.php         # OPTIONAL extra named styles of the SAME block …
    style-2.xml         # … each its own markup + field schema.
    index.html
  css/style.css         # compiled, block-scoped CSS (shared across the block's styles).
  less/                 # the LESS source for css/style.css (T4 ACM blocks use LESS).
  index.html
```

A block ships **one or more named styles** (`style-1 … style-N`). `mod_ja_acm` picks
which: `helper.php::getLayout()` resolves `tmpl/<jatools-layout-...>.php` (the style
chosen in the module's admin params), falling back to `tmpl/style-1.php`. So adding a
`style-2.php`+`style-2.xml` gives admins a *variant* of the same section. spark's
`hero` ships **4 styles** (`style-1..4`); its `pricing` ships **1**.
Cite: `ja_spark/acm/hero/{config.xml,tmpl/style-1..4.{php,xml},css/style.css,less/}`.

### `style-N.xml` — the admin field schema

A Joomla `<form>` with one `<fields name="<group>">` holding `<fieldset>`s of
`<field>`s. A **`<fieldset … multiple="1">`** is a **repeatable group** (the admin
adds N rows — slides, plans, team members). Field `type`s seen: `text`, `textarea`,
`list` (`<option>`s), `media` (image picker). Real `hero/tmpl/style-1.xml` has a
single-value `sl-opt` fieldset (`autoplay`, `mask`, `auto-time`) plus a
`multiple="1"` `sliders` fieldset (`image-decor`, `hero-heading`, `hero-intro`,
`button-1/2`, …) — i.e. global options + a repeatable list of slides.

```xml
<form>
  <title>Hero Style 1</title>
  <fields name="hero">
    <fieldset name="sl-opt" label="…">           <!-- single-value options -->
      <field name="autoplay" type="list" default="true">…</field>
    </fieldset>
    <fieldset name="sliders" label="…" multiple="1">  <!-- repeatable rows -->
      <field name="image-decor" type="media" />
      <field name="hero-heading" type="text" />
      <field name="button-1"    type="text" />
    </fieldset>
  </fields>
</form>
```

### `tmpl/style-N.php` — the markup

Plain PHP rendered into a buffer by `mod_ja_acm`. Receives `$helper`
(`ModJAACMHelper`) + `$module`. The helper reads the admin params:
- `$helper->get('field-name', $i)` — value of `field-name` in repeatable row `$i`.
- `$helper->getRows('field-name')` — number of rows in the repeatable fieldset
  (drive the `for` loop with it).
- `$helper->get('option-name')` — a single-value (non-repeatable) option.

Real `hero/tmpl/style-1.php` skeleton:

```php
<?php defined('_JEXEC') or die;
$count    = $helper->getRows('image-decor');     // # of slides
$heroMask = $helper->get('mask');                 // global option
?>
<div id="acm-hero-wrap-<?php echo $module->id; ?>" class="ja-acm acm-hero style-1">
  <?php for ($i = 0; $i < $count; $i++) : ?>
    <div class="acm-hero-item <?php echo $heroMask; ?>"
         style="background-image:url('<?php echo $helper->get('image-decor', $i); ?>')">
      <h1><?php echo $helper->get('hero-heading', $i); ?></h1>
      <a class="btn btn-<?php echo $helper->get('btn-1-type', $i); ?>"
         href="<?php echo $helper->get('btn-1-link', $i); ?>">
        <?php echo $helper->get('button-1', $i); ?></a>
    </div>
  <?php endfor; ?>
</div>
```
Wrap markup in `class="ja-acm acm-<block> style-N"` and scope ids with
`<?php echo $module->id; ?>` (so two instances of the same block don't collide), and
target `css/style.css` to `.acm-<block>`. Use `MediaHelper::getCleanMediaFieldValue()`
for `media` fields (as the real hero does).

### `mod_ja_acm` — how a block reaches the page

`mod_ja_acm.php` instantiates `$helper = new ModJAACMHelper($params)`, calls
`$helper->getLayout()` to find the chosen `tmpl/style-N.php`, includes it, and echoes
the buffer. The block becomes an **editable section** by: (1) a home-layout row exposing
a `{"type":"positions","positions":"section-N"}` column, and (2) Phase 7 publishing a
`mod_ja_acm` module (configured with the block + style) into that position, assigned to
the home menu item. **Custom blocks are encouraged** (`catalog.md` §6.4): author a new
`acm/<your-block>/` for a signature section, or add a `style-N` variant to a common one.

### ACM block vs static block vs module position — decision

| Use… | when | reaches the page as |
|---|---|---|
| **ACM block** (`acm/<block>/` + `mod_ja_acm`) | repeating, content-like sections the owner should edit (hero, features, team, pricing, testimonials, stats) — the DEFAULT for home sections | a published `mod_ja_acm` module in a `positions` row |
| **module position** (`type:"positions"` + any core/3rd-party module) | standard Joomla content (latest articles, menu, breadcrumbs, search, a `mod_custom`) | every module assigned to that position, stacked |
| **static `block`** (`html/layouts/t4/block/*`) | genuinely complex, one-off hero/feature **art** with no editable data (principle 4) | a `type:"block"` column rendering frozen markup |

Prefer **ACM** for anything content-like; reserve static `block`s for complex static
design only. See `demo-content.md` §3 for publishing the ACM modules and
`catalog.md` §3 / `page-coverage-matrix.md` tier B for the block roster + cites.

### ACM block vs static `block` — when to use which

| | **ACM block** (`acm/<block>/`) | **static `block`** (`html/layouts/t4/block/*`) |
|---|---|---|
| Reaches the page as | a **published module** (a `positions` row in the home layout) | a `type:"block"` column rendering frozen markup |
| Editable by the owner | **yes** — admin edits its params | no — markup is fixed |
| Use for | repeating content-like sections (features, team, pricing, testimonials) | genuinely complex hero/feature **art** only (principle 4) |
| In layout JSON | `{ "type":"positions", "positions":"section-1" }` then publish the ACM module there | `{ "type":"block", "block":"hero" }` |

So an ACM block becomes an editable **section** by: (1) the home layout row exposing
a `positions` column, and (2) Phase 7 publishing that ACM module type into the
position, menu-assigned to the home item. A static `block` becomes a **section** by
the layout row carrying a `type:"block"` column directly — no module, not editable.
Prefer ACM for anything content-like; reserve static blocks for complex static
design (matches SKILL principle 4). See `demo-content.md` §3 for publishing the ACM
modules and `page-coverage-matrix.md` tier B for the full block roster + cites.

---

## Quick reference — which file controls what

| Concern | File | Key |
| --- | --- | --- |
| Page structure (rows/columns) | `etc/layout/<name>.json` | `sections[].contents[]` |
| Home variants (2–3+ files) | `etc/layout/{home,home-2,home-3,…}.json` | one file per home + its own style (§1c) |
| Editable home section | `acm/<block>/` + a layout `positions` row | ACM module published to the position (§1d) |
| What a column renders | layout JSON | column `type` (`component`/`positions`/`module`/`block`/`element`) |
| Row width / container | layout JSON | section `container`, `layout`/`widths` |
| Row color scheme | layout JSON + `palettes.json` | section `color_pattern` → palette `class` |
| Brand colors | `etc/theme/<theme>.json` | `color_*` |
| Typography | `etc/theme/<theme>.json` | `*_font_*`, `h1..h6_font_size` |
| Page/footer/nav colors (light + dark) | `etc/theme/<theme>.json` | `body_*`, `footer_*`, `mainnav_*` (+ `_dark`) |
| Per-section palettes | `etc/palettes.json` (base) + theme `styles_palettes` | palette objects |
| Available module positions | `templateDetails.xml` | `<positions>` |
