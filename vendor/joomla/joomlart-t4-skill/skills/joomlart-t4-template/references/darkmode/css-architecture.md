# CSS / JS Architecture

> **Phases 4–6 — delivery architecture + surface/transparent + token-remap (origin/specialist source).**
> ⚠️ **The `darkmode.js` + pre-paint scaffold in the "Delivery architecture" section below is the
> localStorage variant, which is T3-ONLY. On T4 the delivery is the mandatory cookie + server-resolve
> standard in `gui-config-delivery.md` — use that, not the localStorage scaffold here.** Everything
> else in this file (files list, load order, surface-vs-transparent, token remap) is framework-shared.
> The condensed build-pipeline copy is the builder's `dark-light-mode-standard.md` §5 +
> `css-tokenizing.md` §3e — keep in sync.

`<DARK>` = your framework's dark selector: `html.t4-dark` (T4) or `html[data-theme="dark"]`
(T3). Pick it in Phase 1 and use it consistently.

## Files you create / edit (these ONLY — shared by T4 & T3)

```
templates/<NAME>/css/darkmode.css      # ALL dark rules (its own file — NEVER custom.css)
templates/<NAME>/css/custom.css        # leave a clean OWNER stub; do not put dark here
templates/<NAME>/js/darkmode.js        # delegated click + persist + OS-follow (does NOT build the button)

# --- T4 ---
templates/<NAME>/index.php                               # pre-paint (addScriptDeclaration) + load
                                                         #   darkmode.css via addCustomTag('<link>')
                                                         #   + darkmode.js via registerAndUseScript(defer)
templates/<NAME>/html/layouts/t4/block/mainnav.html      # STATIC toggle button in .t4-header-r
  (or .../block/header.html)                             #   (split headers: a mobile copy too)
templates/<NAME>/offline.php + error.php + error-t4.php  # standalone docs: own pre-paint + darkmode.css link

# --- T3 ---
templates/<NAME>/tpls/blocks/head.php                    # inline pre-paint + addStyleSheet(darkmode.css)
                                                         #   AFTER the custom.css block
templates/<NAME>/tpls/blocks/header/header*.php          # STATIC toggle button (every variant) + addScript
templates/<NAME>/offline.php (+ error.php)               # standalone docs: own pre-paint + darkmode.css link
```

**Never edit** compiled/bundled output — `css/template.css`, `css/themes/style-N/template.css`,
or anything under `media/t4/optimize/` or `t3-assets/`. They are regenerated and overwritten on
update. The whole point is that `templates/<NAME>` stays drop-in updatable.

**Why a separate file, not custom.css:** `custom.css` is the SITE OWNER's file (T4 "Edit Custom
CSS" GUI → `Action.php`; T3 owner tweak slot). Dark rules there get overwritten or tangled. Keep
them apart.

**FOUC:** the pre-paint resolver must set the hook in `<head>` before first paint. T4: use
`$this->addScriptDeclaration('…')` in `index.php` (renders in `<head>`, before paint, optimizer-
safe). T3: an inline `<script>` at the top of `head.php`. Standalone docs (`offline.php`,
`error.php`, `error-t4.php`) are separate HTML documents — give each its own pre-paint `<script>`
+ its own `<link>` to **darkmode.css** (NOT custom.css — that's now a stub).

## darkmode.css skeleton — palette + TOKEN REMAP

```css
/* Light mode is the original design and is NOT modified. Every rule below is scoped
   under <DARK>. The toggle button + a few authorized layout fixes are the only rules
   that apply in both modes. Dark MIRRORS light — never adds contrast light lacks. */

<DARK> {
  /* 1) Your dark palette as named vars (one source of truth). Tune to mirror light's
        RELATIONSHIPS (subtle band vs page, faint dividers), not to look maximally dark. */
  --dm-bg:#11151f; --dm-band:#161b27; --dm-surface:#1a2130; --dm-surface-2:#222a3b;
  --dm-border:#2c3547; --dm-text:#c2c9d6; --dm-text-muted:#8c97a8; --dm-heading:#eef1f6;

  /* 2) Brand accent — KEEP the template's primary; only define a LIGHTER hover for dark
        (light's own hover shade goes darker and vanishes on dark). */
  --ja-accent:#ff6b00; --ja-accent-hover:#ff8534;

  /* 3) REMAP the template's own color TOKENS — this is the big lever. The names below are
        EXAMPLES; every template names them differently. DISCOVER YOURS first:
          grep -oE '\-\-[a-z0-9-]*(color|bg|light|primary|heading|text|border)[^;{}]*' <bundle>
        then remap the ones actually in use. A typical JA/T4 set looks like: */
  --heading-color: var(--dm-heading);     /* #111 in light → drives many headings/links   */
  --body-text-color: var(--dm-text);      /* #585c63 in light → body copy                  */
  --border-color: var(--dm-border);       /* faint light border                            */
  --body-bg-color: var(--dm-bg);          /* page bg — used by edge-masking pseudo bars!    */
  --color-light: var(--dm-band);          /* #f8f5f0 → .bg-light + sections read this       */
  --mainnav-link-color: var(--dm-text);   /* nav + dropdown link + CARET colour (scope it)  */
  --mainnav-link-hover-color: var(--ja-accent);
  /* Bootstrap-as-T4: --t4-light / --t4-body-bg / --t4-body-color / --t4-border-color /
     --t4-emphasis-color / --t4-secondary-bg / --t4-tertiary-bg … remap the ones in use.   */
  /* DO NOT remap --color-primary (brand) or you lose the accent. */
}

<DARK> body { background:var(--dm-bg); color:var(--dm-text); }
<DARK> .t4-wrapper, <DARK> .t3-wrapper { background:var(--dm-bg); }
```

> **Section-local var overrides win.** Some modules set `--heading-color:#fff` (or accent) on a
> local element; your root remap won't override those — that's usually correct (white text over a
> photo). But it means probing the *element's* computed var value, not assuming the root value.

A proven palette starting point: page `#11151f`/`#0f1320`, band `#161b27`, surface `#1a2130`,
elevated `#222a3b`, border `#2c3547`, heading `#eef1f6`, body `#c2c9d6`, muted `#8c97a8`.
(A neutral variant for templates whose existing dark zones are pure-neutral `#111`/`#000`:
page `#141414`, band `#1a1a1a`, surface `#1d1d1d`, elevated `#262626`, border `#2e2e2e`,
field-border `#4a4a4a`, text `#c9c9c9`, muted `#8f8f8f`, heading `#f0f0f0` — match the family
the template already uses so old and new dark zones don't clash.)

### If the template has NO custom properties at all (LESS → literal hex)

Some templates serve **zero** `var(--…)` color tokens — everything compiled to literals. Then:
- There is **no remap lever**; every fix is a literal, specificity-matched per-rule override.
  Expect many more rules; the probe→fix→verify loop and the scanners carry the weight.
- STILL define your own `--dm-*` palette on `<DARK>` and use the vars in every override — that
  keeps the theme one-place tunable and the GUI hand-off trivial.
- Add `color-scheme: dark` on `<DARK>` for native widgets (scrollbars, selects) — but remember
  it gives UNSTYLED controls UA-dark defaults that may need explicit styling (e.g. a
  framework-less `.btn-secondary`).
- Useful extra tokens for this mode: `--dm-link`/`--dm-link-hover` (a lifted accent for text
  links — the brand red/blue at light's value often drops to ~3:1 on the dark page) and a
  `--dm-field-border` one step above `--dm-border` (gotcha §42).

### Border discipline (owners notice this first)

ONE divider token (`--dm-border`) for every border/frame/separator; one step lighter for form
fields and outline buttons; decorative carets at most one more step. Never "mirror" a strong dark
bar with a bright bar (gotcha §41). De-duplicate coincident inset rings: keep the OUTER frame,
inner boxes draw only the edges the frame doesn't cover — directional inset shadows
(`inset 1px 0 0 0 var(--dm-border)` = left edge only; comma-combine for two edges). Drop element
borders that sit exactly on a frame edge. Verify with the seam scanner.

## Surface vs transparent — the card decision (read this twice)

A card/panel that is **white (`#fff`) in light** is the single biggest source of churn. Probe its
**`margin-top`** and its position relative to the image, then pick:

| Light-mode situation | What it means | Dark treatment |
|---|---|---|
| White card on a white **page**, no overlap (image beside text, author/founder bio, featured side-panel, `margin-top:0`) | A card that **blends invisibly** on white | **transparent** (blend with the page). A dark surface here = a mismatched "two-color" box |
| White card that **overlaps the photo** (`margin-top` negative; content pulled up over image) | Opaque white **hides** the image it covers | **opaque `--dm-surface`** + **square the top corners** (`border-top-*-radius:0`) so it meets the photo flush; back the image with `--dm-surface` too |
| **Frosted** white panel over a photo (`rgba(255,255,255,.x)` + `backdrop-filter`) | A glass label, dark text, over imagery | **keep the frosted white**; force its text **dark** (reset `--heading-color`/`--body-text-color` + explicit dark on title/meta). Do NOT repaint dark |
| A genuinely solid white **box** in light (tour card with border/shadow, a real panel) | A visible card | **`--dm-surface`** + `--dm-border` |

Same class can be BOTH (e.g. `.item-content` is a side-panel on the featured post but an
overlap-card in the grid). Distinguish by the **wrapper class** (`.blog-item-content` vs `.item`)
or by `:has(.top-lead)` — never by margin (CSS can't select on it). When unsure, **mirror light**:
if light shows no visible box, dark shows no visible box.

### The rounded-corner seam gap
When an opaque content card overlaps a photo and the card has rounded TOP corners, the corners
curve away and reveal the page bg as a notch — invisible on light's white page, a **black gap** on
dark. Fix: **square the card's top corners** (`border-top-left/right-radius:0`) so it meets the
photo edge-to-edge, and give the image container `background:var(--dm-surface)`.

## Delivery architecture (localStorage scaffold — **T3 ONLY**) — copy-paste

Static button in a layout override + delegated JS + a separate `darkmode.css` loaded after
`template.css`. Verify the result with `scripts/review/toggle-test.mjs`.

> ⚠️ **T4 STOP:** the persistence + pre-paint below (localStorage + client-side resolver) is the
> **T3** delivery. On **T4** the delivery is the mandatory **cookie + server-resolve** standard —
> use `references/darkmode/gui-config-delivery.md` instead (its `index.php`/`component.php` resolver, cookie
> `darkmode.js`, gated `theme-toggle.php` element, and standalone-doc resolution). The **static
> button (§1) and the button CSS/icon-crossfade are shared** — reuse those; just take the JS +
> pre-paint from the T4 doc, not from §2/§3 here.

### 1) Static toggle button (layout override — NOT built by JS)
Drop this into the header layout override, in the header-right zone. Inline SVGs avoid icon-font
mismatches; the two icons cross-fade via CSS keyed on the dark hook.
```html
<button type="button" class="t4-theme-toggle" aria-label="Toggle dark mode" aria-pressed="false" title="Toggle light / dark">
  <svg class="t4-theme-toggle__moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  <svg class="t4-theme-toggle__sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/></svg>
</button>
```
- **T4:** copy the rendered header block into `html/layouts/t4/block/mainnav.html` (or
  `header.html`) and put the button in `.t4-header-r`. **Split headers** (separate mobile bar):
  add a second copy with `d-lg-none` in the mobile group (`.t4-nav-toggle`) and `d-none
  d-lg-inline-flex` on the desktop one — let Bootstrap utilities pick per breakpoint (no JS host
  detection). On a navy/topbar surface, force the icon white (`.t4-nav-toggle .t4-theme-toggle{color:#fff}`).
- **T3:** add identical markup to **every** `tpls/blocks/header/header*.php` variant.
- The button styles are the ONE unscoped block in `darkmode.css` (visible in both modes); the
  icon swap is scoped: `<DARK> .t4-theme-toggle__moon{opacity:0}` / `…__sun{opacity:1}`.

### 2) darkmode.js — delegated click + persist + OS-follow (does NOT build the button)
```js
(function () {
  var KEY = 't4-theme';
  // `?theme=dark|light` wins for THIS load and is never saved (the pre-paint script reads it too).
  function asked() {
    try { var m = /[?&]theme=(dark|light)(?:&|#|$)/.exec(window.location.search || ''); return m ? m[1] : ''; }
    catch (e) { return ''; }
  }
  var askedTheme = asked();
  function stored(){ try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function current(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function apply(m){
    var el = document.documentElement;
    el.setAttribute('data-theme', m);
    el.setAttribute('data-bs-theme', m);            // T4 / Bootstrap-5 native components key off this — DON'T omit on a T4 build
    el.classList.toggle('t4-dark', m === 'dark');   // T4 dark hook (harmless on T3 where the scope is data-theme)
    document.querySelectorAll('.t4-theme-toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', m === 'dark' ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function (e) {                 // delegation: every button, even injected later
    var btn = e.target.closest && e.target.closest('.t4-theme-toggle');
    if (!btn) return;
    var next = current() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (err) {}
    apply(next);
  });
  document.addEventListener('DOMContentLoaded', function () { apply(askedTheme || current()); });
  if (window.matchMedia) {                                          // follow OS until an explicit choice
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var on = function (e) { if (askedTheme || stored()) return; apply(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
  }
})();
```

### 3a) Wire it — T4 `index.php`
```php
// Pre-paint (FOUC-safe): set data-theme in <head> before first paint.
// NOTE: the closing `JS` marker MUST be alone on its line with `);` on the NEXT
// line. Writing `JS);` on one line is PHP 7.3+ only — on PHP < 7.3 it is a fatal
// PARSE error, which (since this is the template index.php loaded on every page)
// takes the WHOLE site down with a white screen. Keep the `);` on its own line.
$this->addScriptDeclaration(<<<'JS'
(function(){try{var q=/[?&]theme=(dark|light)(?:&|#|$)/.exec(location.search);var s=q?q[1]:localStorage.getItem('t4-theme');var d=s?s==='dark':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var h=document.documentElement,t=d?'dark':'light';h.setAttribute('data-theme',t);h.setAttribute('data-bs-theme',t);h.classList.toggle('t4-dark',d);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();
JS
);
// Load darkmode.css LAST in <head> (addCustomTag renders after the optimize bundle) so it wins.
$darkCss = __DIR__ . '/css/darkmode.css';
if (is_file($darkCss)) {
  $href = \Joomla\CMS\Uri\Uri::root(true) . '/templates/' . $this->template . '/css/darkmode.css?' . filemtime($darkCss);
  $this->addCustomTag('<link rel="stylesheet" type="text/css" href="' . $href . '">');
}
$this->getWebAssetManager()->registerAndUseScript('tpl.<NAME>.darkmode', 'templates/' . $this->template . '/js/darkmode.js', [], ['defer' => true]);
```
> ⚠️ Do **not** load darkmode.css with `registerAndUseStyle` — WAM can place it BEFORE `template.css`
> (vega's one flaw), so equal-specificity ties leak light. `addCustomTag` is render-last and robust.

### 3b) Wire it — T3 `head.php` (right AFTER the custom.css block)
```php
if (is_file(T3_TEMPLATE_PATH . '/css/darkmode.css')) {
  $this->addStyleSheet(T3_TEMPLATE_URL . '/css/darkmode.css?' . filemtime(T3_TEMPLATE_PATH . '/css/darkmode.css'));
}
```
Plus the inline pre-paint `<script>` at the top of `head.php`, and `addScript(.../darkmode.js)`
from the header blocks (or once in head.php).

### 4) Standalone docs (offline.php / error.php / error-t4.php) — don't forget them
Each is its own HTML document. Give each its own pre-paint `<script>` (same as above) AND its own
link to **darkmode.css** (these used to rely on custom.css — which is now a stub, so they break
unless you add the darkmode.css link):
```php
<link rel="stylesheet" href="<?php echo $this->baseurl; ?>/templates/<?php echo $this->template; ?>/css/darkmode.css" type="text/css" />
```

## Alternative control — a two-button segmented switch (gotcha §44–§45)

The vega-standard default is the **single round button with cross-fading sun/moon icons** (scaffold
above) — it's the cleanest and what ja_vega ships. If an owner specifically wants both states
always visible, a **sun | moon segmented control** is a fine alternative (active side carries a
chip, clicking the other side switches). Keep the SAME delivery rules either way: static markup in
a layout override, delegated JS, rules in `darkmode.css`.

```html
<div class="ja-theme-switch" role="group" aria-label="Color theme">
  <button type="button" class="ja-ts-btn ja-ts-light" data-set-theme="light" aria-label="Light mode">[sun svg]</button>
  <button type="button" class="ja-ts-btn ja-ts-dark"  data-set-theme="dark"  aria-label="Dark mode">[moon svg]</button>
</div>
```
```js
// delegated — works for every instance, including ones injected later
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest ? e.target.closest('[data-set-theme]') : null;
  if (!b) return;
  var m = b.getAttribute('data-set-theme') === 'dark' ? 'dark' : 'light';
  apply(m); try { localStorage.setItem(KEY, m) } catch (err) {}
});
```
Active-state styling lives in CSS keyed off `<DARK>` (light: dark chip on the light bar; dark:
light chip) — **surface-aware**: on an always-dark panel (off-canvas) the active chip must be
light in BOTH modes.

**Placement:** the topbar/utility bar next to the search module — one consistent location on
every layout (often `position:fixed` on mobile, so it stays reachable). Keep one copy in the
off-canvas header. Traps: grid columns are `position:relative` (an absolute-positioned control
pins to the column, not the bar), and on mobile a flex wrapper can stretch over the hamburger
and **intercept its clicks** — always test clicking the hamburger at mobile width.

## Per-home accent (only if the template has per-home colors)
Key a var off the menu-item class on `<html>` (or `<body>` if `<html>` has none):
`html.itemid-128<DARK_SUFFIX> { --ja-accent:#21c674; }`. Get each home's itemid in discovery
(`document.documentElement.className.match(/itemid-(\d+)/)` or the body `item-N` class). Many
single-brand templates have ONE accent — don't invent per-home complexity that isn't there.

## Surface awareness — toggle button look (icon color AND background) — gotcha §53
A control's look depends on the **surface**, which can be dark in BOTH modes.

**Icon color:** default light header → dark icon (use `color: inherit`); navy/topbar or
hero-over-photo → light icon in **both** modes.

**Background — match the header, do NOT default to a chip:**
- **Solid header** (most templates) → **`background: transparent`**; let the icon use the header
  text color and add only a subtle hover wash. Or adopt the template's own header-item treatment
  (e.g. a full-height **square cell** with faint vertical dividers, like impact's toggle beside its
  "Donate now" CTA). A grey pill on a solid header looks foreign/unbalanced — owners flag it fast.
- **Hero-over-photo / translucent header** (e.g. ja_vega) → a **faint chip**
  (`background: rgba(127,140,160,.12)`) is justified ONLY here: it backs a white icon so it doesn't
  vanish on light patches of the photo. This is the exception, not the default.

**Preserve an existing button when refactoring.** If the template already ships a toggle and you're
just moving the CSS (e.g. into `darkmode.css`), keep its EXACT styling — copy the original button
rules over verbatim (adapt only icon selectors to the static markup). "Move the CSS" ≠ redesign it.

Always confirm with a **header screenshot in BOTH modes** — the probe gives computed values, but
balance/alignment beside neighbouring header items is a visual judgement. Any expanding search
overlay that covers content must be **opaque** (see gotchas: bleed-through).
