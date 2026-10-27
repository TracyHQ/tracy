# T4 Template Anatomy

> **Cross-cutting reference (used from Phase 1 on).** The file/folder map of a T4 template — where
> `templateDetails.xml`, `html/layouts/t4`, `etc/`, `scss/`, and the system pages live. Read it at
> Phase 1 (what gets renamed) and refer back any time you need a path.

Every file and folder of a T4 (Joomla 6 / Bootstrap 5) template and what it does.
Paths below are verified against the real blank template at
`t4-framework-for-joomla-6/templates/t4_bs5_blank`. The base theme it inherits
from lives at `plugins/system/t4/themes/base`.

A T4 template is a normal Joomla site template (`templateDetails.xml` + `index.php`)
whose `index.php` simply hands rendering to the T4 system plugin. Almost all of
the visible layout, positions, colors and typography come from JSON config in
`etc/`, not from PHP. You theme it through SCSS in `scss/` (+ `local/`) and
override Joomla markup in `html/`.

See also: [layout-json.md](layout-json.md) for the `etc/layout/*.json` schema,
and [blocks-and-elements.md](blocks-and-elements.md) for the
`html/layouts/t4/block` and `.../element` override system.

---

## Root entry files

| File | Role |
| --- | --- |
| `index.php` | The template entry point. Contains essentially no markup — it checks `class_exists('\T4\T4')` and calls `\T4\T4::render($this)`, falling back to `include 'error-t4.php'` if the T4 plugin is missing/disabled. T4 builds the page from `etc/layout/*.json`. |
| `component.php` | Used when Joomla renders in `?tmpl=component` mode (print view, modal, raw component output). Same guard pattern: `\T4\T4::render($this)` or `error-t4.php`. |
| `error.php` | Standard Joomla error page (404/500/etc.). Full HTML document styled by `css/error.css`. T4 themes can replace it with `error-t4.php` markup. |
| `error-t4.php` | The "T4 not installed / disabled" fallback page included by `index.php`/`component.php` when the `\T4\T4` class is unavailable. Renders a self-contained HTML page (links to `css/jpages.css`) telling the admin to install/enable the T4 framework. |
| `offline.php` | The site-offline page (when Joomla is set to offline). Self-contained HTML + login form. |
| `templateInfo.php` | Admin-side template overview shown in the Joomla template manager / T4 admin. Reads `templateDetails.xml` and `t4.xml` to show name, version, release date, author, and an "Update" button when a newer version exists. Not part of the front-end. |
| `helper.php` | Optional template helper class for custom PHP used by overrides/elements. (Not present in the bare blank; real templates add it when needed.) |
| `favicon.ico` | Default site favicon. |
| `template_preview.png` | Full-size template preview image shown in the admin (referenced by `templateInfo.php`). |
| `template_thumbnail.png` | Thumbnail shown in the Joomla template list. |
| `templateDetails.xml` | The Joomla extension manifest — see next section. Defines files/folders to install, module positions, languages, and the T4 base-theme/bootstrap binding. |

---

## templateDetails.xml structure

Top-level declaration marks it as a **site template** built on the T4 manifest
version 4.0:

```xml
<extension version="4.0" type="template" method="upgrade" group="template" client="site">
  <name>t4_bs5_blank</name>
  <version>1.3.0</version>
  <author>JoomlArt</author>
  ...
```

Key blocks:

- **`<files>`** — lists the root PHP files (`component.php`, `error.php`,
  `error-t4.php`, `index.php`, `offline.php`, `templateInfo.php`,
  `templateDetails.xml`, the preview/thumbnail PNGs, `favicon.ico`) and the
  installed `<folder>`s: `css`, `etc`, `fonts`, `html`, `images`, `js`,
  `language`, `scss`. (The manifest names the element `<files>` even though it
  also contains `<folder>` children.)

- **`<positions>`** — the module positions the template exposes (~35). Standard set:

  ```
  menu, header-r, off-canvas, search, banner,
  topbar, topbar-l, topbar-r, masthead,
  main-top-1, main-top-2, main-bottom-1, main-bottom-2,
  mega-1, mega-2, mega-3, mega-4,
  breadcrumbs, slideshow, sidebar-l, sidebar-r,
  section-1, section-2, section-3, section-4, section-5,
  bottom-a, bottom-b, bottom-c, bottom-d, position-2,
  footnav-1, footnav-2, footnav-3, footnav-4, footnav-5,
  footer, footer-logo, debug
  ```

  (Some templates rename/add a few, e.g. `header-r` vs `topbar-r`; the list above
  is the blank template's actual order.)

- **`<languages folder="language">`** — registers the front-end and `.sys` language
  ini files, e.g. `en-GB/en-GB.tpl_t4_bs5_blank.ini` and `...sys.ini`.

- **`<t4>` block** — the binding that makes this a T4 template:

  ```xml
  <t4>
    <basetheme>base</basetheme>
    <bootstrap>bs5</bootstrap>
  </t4>
  ```

  `basetheme` names the parent theme under `plugins/system/t4/themes/` to inherit
  from; `bootstrap` selects the Bootstrap version (`bs5`).

- **`<updateservers>`** — the JoomlArt update-tracking URL for the template.

---

## Folders and their roles

### `css/` — compiled stylesheets (do not hand-edit)
Output of the SCSS compile. Files: `template.css` (main), `theme.css` (color/root
vars), `jpages.css` (standalone error/offline page styles), `off-canvas.css`,
`rtl.css`, `error.css`, `offline.css`, `frontend-edit.css`. Subfolders
`css/tpl/` (`theme.tpl.css`) and `css/extras/` (per-component CSS:
`com_virtuemart.css`, `com_kunena.css`, `com_easyblog.css`, `com_easydiscuss.css`,
`com_jomsocial.css`, `com_docman.css`).

### `scss/` — source styles (edit these, then compile)
- **Entry files** (each compiles to a same-named CSS file):
  - `template.scss` → `css/template.css`. Imports `vars`, `bootstrap`, then `all`.
  - `theme.scss` → `css/theme.css`. Imports `vars` + Bootstrap `root` (CSS custom
    properties); optional theme customize import.
  - `jpages.scss` → `css/jpages.css` (error/offline page styling).
  - `rtl.scss` → `css/rtl.css`.
  - `frontend-edit.scss` → front-end editing UI.
- **Aggregator** `_all.scss` — the manifest of partials pulled into `template.scss`.
  It imports (in order): `global`, base-theme `core`, `forms`, `components`,
  `utilities`, `navigations`, `modules`, `joomla`, `typo`, `megamenu`, `offcanvas`,
  `styles`, base-theme `legacy`, then `frontend-edit`.
- **Partials** (`_name.scss`): `_variables`, `_vars`, `_bootstrap`, `_global`,
  `_styles`, `_typo`, `_navigations`, `_megamenu`, `_modules`, `_joomla`,
  `_components`, `_forms`, `_utilities`, `_offcanvas`. (`_variables` holds SCSS
  variables; `_vars` is the functions/vars bridge imported by entry files.)
- Subfolders: `scss/tpl/` (`theme.tpl.scss`) and `scss/extras/` (per-component
  SCSS mirroring `css/extras/`). `scss/prepros.config` configures the Prepros
  compiler.

> The base-theme `@import` paths in `_all.scss`/`theme.scss` reach UP into
> `../../../plugins/system/t4/themes/base/...` — the template SCSS is layered on
> top of the shared base theme's SCSS.

### `js/` — front-end scripts
`template.js` (the template's own behaviors — menus, off-canvas toggles, theme
switch hooks), vendored libs `bootstrap.bundle.js`, `isotope.pkgd.min.js`,
`imagesloaded.pkgd.min.js`, and the `owl-carousel/` directory.

### `html/` — Joomla output overrides
Standard Joomla template override tree plus T4 extras:
- **Component/module overrides** — directories like `com_content/`,
  `com_virtuemart/`, `com_community/`, `com_easyblog/`, `mod_articles_category/`,
  `mod_virtuemart_cart/`, `mod_virtuemart_product/`, `mod_community_hellome/`,
  `mod_easydiscuss_recentdiscussions/`. Override Joomla's default view markup.
- **`html/layouts/t4/block/`** — T4 **custom blocks**: reusable header/nav
  fragments referenced from layout JSON by `"type":"block"`. The blank ships
  `header-1.html`…`header-4.html` and `mainnav.html`.
- **`html/layouts/t4/element/`** — T4 **element** overrides (e.g. `masthead`,
  logo, breadcrumbs) referenced by `"type":"element"` in layout JSON. The blank
  template inherits these from the base theme (`plugins/system/t4/themes/base/
  html/layouts/t4/element/`); a template adds its own here only to override.
- **`html/layouts/chromes/`** — module chrome (the wrapper markup around a module).
  Lives in the base theme; copy into the template's `html/layouts/chromes/` to
  override.

See [blocks-and-elements.md](blocks-and-elements.md) for how blocks/elements
resolve and are authored.

### `etc/` — T4 JSON configuration (the heart of a T4 template)
Verified contents (see "ls etc/ reconciliation" below):
- `layout/` — **page layout** definitions: which sections/rows/positions/blocks/
  elements compose each page. Files: `default.json`, `home.json`, `home-biz.json`,
  `home-magz.json`, `no-sidebar.json`, `pagebuilder.json`, and the header presets
  `Header-1.json`…`Header-4.json`. A layout is assigned per menu item. Schema in
  [layout-json.md](layout-json.md).
- `theme/` — **color + typography themes**: `default.json`, plus named variants
  `Cyan.json`, `Red.json`, `Violet.json`, `architect.json`. Drive the CSS custom
  properties output to `theme.css`.
- `navigation/` — **mega-menu** configuration (`default.json`): per-menu-item
  mega-menu column layout, assigned module positions (`mega-1`…`mega-4`), widths.
- `site/` — **site-level defaults** / presets: `default.json`, plus per-context
  defaults like `Blog.json`, `home-magz.json` (default layout/theme bindings).
- `presets/` — saved template presets (`default.json`): bundled combinations of
  layout + theme + options selectable in the T4 admin.
- `palettes.json` — predefined color palettes available in the theme editor.
- `global.json` — global template parameters (logo, favicon, off-canvas options,
  responsive breakpoints, performance/optimize settings).
- `assets.json` — declared front-end assets (CSS/JS) and their load conditions.
- `customcolors.json` — user-saved custom colors.
- `fontcustoms.json` — user-saved custom font definitions.

> Note: the bare blank has **no `acm/` folder**. Templates that ship Advanced
> Content Modules add an `acm/` directory (one subfolder per ACM, each with its
> own `tmpl/`, assets and `config.xml`). Treat `acm/` as optional.

### `language/en-GB/`
Translation strings: `en-GB.tpl_t4_bs5_blank.ini` (front-end) and
`...sys.ini` (admin/system, used by the template manager).

### `fonts/`
Self-hosted webfont files referenced from SCSS/`fontcustoms.json` (blank ships
just an `index.html` guard).

### `images/`
Template image assets: `logo.png`, `logo-sm.png`, carousel arrows
(`ic-left.png`, `ic-right.png`), accordion `plus.png`/`minus.png`, rating SVGs,
VirtueMart stock badges, watermark `wm-bg.png`, and a `system/` subfolder.

### `acm/` (optional)
Advanced Content Modules bundled with the template. Absent from the blank.

---

## Base-theme path resolution order

When T4 looks up a file (a layout, element, block, chrome, SCSS partial, or
override), it searches in this order and uses the FIRST match:

1. **`local/`** inside the template (highest priority — your customizations)
2. **The template root** (e.g. `templates/t4_bs5_blank/...`)
3. **The base theme** declared in `<t4><basetheme>`:
   `plugins/system/t4/themes/base/...`
4. **The Joomla root** (core defaults / `media`, etc.)

So you **override a base file by placing a same-named file at the template level**
(or in `local/`). This is why the blank template carries only a handful of blocks
and overrides — everything else falls through to the base theme.

---

## The `local/` folder

`local/` is the recommended home for **your** customizations because it is **not
shipped with the template package and survives template upgrades** (a reinstall
overwrites `scss/`, `css/`, `html/`, `etc/` but leaves `local/` untouched).

- `local/scss/variables.scss` — override SCSS variables (colors, spacing).
- `local/scss/custom.scss` — your custom rules.
- Compiled output → `local/css/template.css`, loaded after the main stylesheet.
- `local/etc/` — local overrides of T4 JSON config (e.g. the real `ja_spark`
  template ships `local/etc/global.json`).

The bare blank does **not** include a `local/` folder; T4 creates/uses it on
demand. Real shipped templates (e.g. `ja_spark`) do include one. Because of the
resolution order above, anything in `local/` wins over both the template and the
base theme.

---

## `ls etc/` reconciliation

Actual output of `ls etc/` in the blank template:

```
assets.json  customcolors.json  fontcustoms.json  global.json
layout/  navigation/  palettes.json  presets/  site/  theme/
```

All folders documented above are present and named exactly as listed. Two extra
top-level JSON files exist beyond the brief's list — `customcolors.json` and
`fontcustoms.json` (user-saved custom colors/fonts) — and are documented under
`etc/`. There is **no `acm/`** folder in the blank (optional, template-dependent).
