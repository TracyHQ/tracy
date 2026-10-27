# Framework matrix — detect T3 vs T4 (vs other) FIRST

> **Phase 6 prerequisite — framework detection (cheap; do it yourself).** Sets dark hook / load path / cache. The
> T4 branch is what the builder's `dark-light-mode-standard.md` assumes.

JoomlArt ships two framework generations and they differ in the four things that
matter for dark mode: the **dark hook**, what files **auto-load**, how you inject the
**toggle**, and the **cache** you must clear. Detect the framework before writing
anything — guessing the wrong one wastes a whole round.

## Detect it (cheap, do it yourself, don't make a subagent guess)

```bash
ls templates/<NAME>/                      # T4: has a 'media/'? look at the next checks
ls -d templates/<NAME>/css media/t4 plg_system_t4 2>/dev/null
ls templates/<NAME>/less templates/<NAME>/css/themes 2>/dev/null   # T3 has LESS + style-N themes
# In a rendered page, which hook is on <html>?
#   T4  -> class  html.t4-dark            (framework may already ship the toggle!)
#   T3  -> nothing yet (you add html[data-theme="dark"])
```

Also just open the live site and read `document.documentElement.className` /
attributes — the existing hook (if any) is the one to reuse. (Note: a `--t4-dark` /
`--bs-dark` CSS **variable** is just Bootstrap's dark-palette token name, NOT a
dark-mode hook — don't be fooled into thinking the template already has dark mode.)

## The matrix

| Concern | **T4 Framework** (Joomla 4–6) | **T3 Framework** (older) |
|---|---|---|
| Dark hook on `<html>` | prefer **attribute** `html[data-theme="dark"]` for new work; reuse `html.t4-dark` only if the template already ships it | **attribute** `html[data-theme="dark"]` |
| Dark CSS file (where YOU write) | a dedicated `css/darkmode.css` — **NOT** `custom.css` (that's the owner's file) | same: `css/darkmode.css`, NOT `custom.css` |
| How to load the dark CSS (after template.css!) | `$this->addCustomTag('<link …/css/darkmode.css?'.filemtime(...).'>')` in `index.php` → renders LAST in `<head>`. (Avoid `registerAndUseStyle` for the CSS — it can load BEFORE template.css.) | `$this->addStyleSheet(... '/css/darkmode.css?'.filemtime(...))` right AFTER the custom.css block in `head.php` |
| Toggle button (STATIC markup, not JS-built) | a layout override: `html/layouts/t4/block/<mainnav\|header>.html`, button in `.t4-header-r` (+ a mobile copy in `.t4-nav-toggle` for split headers) | each `tpls/blocks/header/header*.php` (every variant) |
| Toggle behaviour JS | `js/darkmode.js` — delegated click + persist + OS-follow; loaded via `registerAndUseScript` (defer). JS does NOT build the button | `js/theme-switch.js` (or darkmode.js); `addScript(...)` from the headers |
| FOUC pre-paint | **server-resolved from the cookie** in `index.php`/`component.php` — `$this->addScriptDeclaration('var t="dark"…')` emits the literal theme in `<head>` before paint (matchMedia only for `auto`). Standalone docs repeat the resolution | inline `<script>` in `head.php` **and** every standalone doc |
| Persisted choice | **COOKIE `ja_<name>-theme`, resolved server-side — the single T4 standard** (`references/darkmode/gui-config-delivery.md`). A cookie is PHP-readable so first paint is server-driven (no FOUC) and the admin on/off + default-theme settings actually work. **Do NOT use localStorage on T4.** | `localStorage['<NAME>-theme']` (client-side, T3 only) |
| Cache to clear | `media/t4/optimize/{css,js}/*` + `administrator/cache/t4asset/*` + Joomla `cache/` + `administrator/cache/` | `t3-assets/*` + `cache/*` |
| Per-home accent var | key a var off the `<html>` menu-item class (or `<body>` `item-N`) | same |
| GUI self-edit slot | Theme tab (CSS-var color pickers) + "Edit Custom CSS"/SCSS + Custom Code **"Before `</head>`"** | ThemeMagic (LESS vars) + Custom Code "Custom CSS" + before-`</head>` |

Both frameworks are **CSS-custom-property driven and editable from the backend**, so dark mode
can be delivered as files OR pasted into the admin GUI for a non-developer to maintain — see
`references/darkmode/gui-config-delivery.md`.

`scripts/clear-cache.sh` auto-detects which of these to clear.

## Why static-button + separate-file (the "vega standard"), NOT JS-injection

Earlier versions of this skill preferred building the toggle in JS and putting dark rules in
`custom.css`. Field experience across ja_trip / ja_impact / ja_morgan (vs the clean ja_vega)
showed both are wrong:

- **Dark belongs in its own `darkmode.css`, never `custom.css`.** `custom.css` is the SITE OWNER's
  file — T4's "Edit Custom CSS" GUI reads/writes it (`plugins/system/t4/admin/src/Action.php`),
  and on T3 it's the owner's tweak slot loaded by `head.php`. Dark there gets clobbered or tangled
  with owner edits. Keep `custom.css` a clean stub.
- **The button is STATIC markup in a layout override**, not created by JS. A JS-built button
  flashes in late, can miss a header variant, and races the click wiring. A `<button>` in
  `html/layouts/t4/block/*.html` (T4) or `tpls/blocks/header/*.php` (T3) is always present; the JS
  just delegates the click. Use Bootstrap `d-*` utilities for per-breakpoint copies (mobile vs
  desktop) instead of JS host-detection.
- **Load order matters.** `darkmode.css` MUST come after `template.css` or equal-specificity ties
  go to light. `addCustomTag('<link>')` lands last in `<head>`; `WebAssetManager::registerAndUseStyle`
  can load it BEFORE the template bundle (vega's one weak spot — it survives only on specificity).
- **Don't forget standalone docs** (`offline.php` / `error.php` / `error-t4.php`): each is its own
  HTML document and needs its own pre-paint `<script>` + its own `<link>` to `darkmode.css`.

This keeps `templates/<NAME>` drop-in updatable and the dark feature fully self-contained.

These four (separate file, static button, load order, standalone docs) are the SHARED plumbing —
identical on T4 and T3. They are NOT the persistence layer: **on T4 persistence + first-paint is the
mandatory cookie + server-resolve standard (`references/darkmode/gui-config-delivery.md`); localStorage is
T3-only.**

## Abstraction used throughout this skill

The references write the dark selector as `<DARK>`. Substitute your framework's hook:
`html.t4-dark` (T4) or `html[data-theme="dark"]` (T3), or whatever the template already
ships. Everything else (probe→fix→verify, the gotchas, the review subagents) is identical.
