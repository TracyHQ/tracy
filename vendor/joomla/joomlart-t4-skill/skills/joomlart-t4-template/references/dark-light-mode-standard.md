# Dark / Light mode — the STANDARD (T4 Joomla 6)

> **Cross-cutting reference — the SINGLE source for dark/light wiring (used from Phase 6 on).**
> `css-tokenizing.md` §3e only summarizes this; the full spec, copy-paste PHP/JS blocks, GUI/cookie
> variant, and standalone-page wiring live HERE. Don't duplicate them elsewhere.

This is the **canonical, verified** way to ship light **and** dark in a T4 template.
Use it verbatim for every new template. Do not re-derive the logic — copy the blocks
below and rename the placeholders. It was hardened live (JA Stratum) against every trap
listed in "Why this shape" and verified on home + content + 404 + offline in both modes.

> Placeholders to rename per template:
> - `ja_<name>` → your template element (e.g. `ja_acme`)
> - cookie `ja_<name>-theme` → keep one cookie name per template
> - JS global `window.ja<Name>Theme` → e.g. `window.jaAcmeTheme`

The user configures it in **Template → Settings → Other**:
- `other_darkmode` — on/off (is the live switch / OS-follow allowed?)
- `other_default_theme` — `auto` | `light` | `dark` (the first-paint default)

---

## Why this shape (read once — these are the traps)

1. **First paint must be resolved SERVER-SIDE and emitted before paint** (a `<head>`
   inline script that sets `data-theme` on `<html>`). localStorage can't drive first
   paint (PHP can't read it) → a cookie is the persistence channel so PHP can resolve
   server-side with **no FOUC**.

2. **Do NOT read the `site-settings` Registry at template-root `index.php` time.**
   At that point T4 has not built it yet — `$this->params->get('site-settings')` is a
   **partial `stdClass`** that only carries `site_logo` and has **no `->get()` method**.
   Calling `->get()` on it is a **fatal 500**. T4 only builds the real `Joomla\Registry\Registry`
   later (in `loadTypelistData()` during the body layout render). That is why Titan-style
   "read the Registry" works in `html/layouts/t4/index.php` (late) but NOT in the template
   root `index.php` / standalone pages (early). → **Read the profile JSON from disk instead.**

3. **Read the profile JSON LOCAL-FIRST**: `local/etc/site/<profile>.json` then base
   `etc/site/<profile>.json`. The admin GUI **saves edits to `local/`** (mirrors
   `T4\Helper\Path::findInTheme`, which checks local→base). Reading only the base `etc/`
   ignores every admin change — toggling dark off / switching default does nothing.

4. **Gate everything consistently** — the toggle button, `darkmode.css`, and `darkmode.js`
   must all key off the same `darkEnabled` / `default==auto` decision, on **every** page
   type including `error.php` / `offline.php` / `error-t4.php`. Otherwise a locked-light
   site shows a stray toggle, or a 404 follows the OS into dark and breaks the lock.

5. **Standalone pages (`error.php`, `offline.php`, `error-t4.php`) do NOT run through
   `T4::render()`** → they must repeat the disk resolution themselves and emit the same
   first-paint script + gated toggle + gated `darkmode.js`.

### The single resolution contract (all surfaces obey it)

```
profile JSON (local→base)  ─►  $darkEnabled, $defaultTheme
                                     │
?theme=dark|light ─► cookie (only if $darkEnabled) ─► default(light|dark) ─► auto/OS ─► $resolved
(the address wins for THIS load and is never written anywhere)
                                     │
$resolved !== ''  → emit locked first-paint script (var t = $resolved)
$resolved === ''  → emit OS-follow first-paint script (prefers-color-scheme)
```

---

## 1. `templates/ja_<name>/index.php` — the resolution + emit block

Paste this where the template sets up the `<head>` (it uses `$this`, the T4 document):

```php
/* ---- Dark mode wiring — GUI-configurable (cookie + server-resolve) ----------
 * Admin: Template → Settings → Other → other_darkmode (on/off) + other_default_theme
 * (auto/light/dark). Persistence = a COOKIE (ja_<name>-theme); PHP resolves the theme
 * server-side HERE and emits it before paint → no FOUC. CSS lives in css/darkmode.css
 * scoped under html[data-theme="dark"] / html.t4-dark, loaded LAST. */
$darkEnabled  = true;
$defaultTheme = 'auto';
$siteProfile  = $this->params->get('typelist-site', 'default');

/* Resolve the active "site" profile JSON LOCAL-FIRST, exactly like T4 itself
 * (T4\Helper\Path::findInTheme checks local/ then base etc/). The admin GUI writes
 * saved settings to local/etc/site/<profile>.json — reading only base etc/ here would
 * ignore every admin edit. */
$profileFile  = __DIR__ . '/local/etc/site/' . basename($siteProfile) . '.json';
if (!is_file($profileFile)) {
    $profileFile = __DIR__ . '/etc/site/' . basename($siteProfile) . '.json';
}
if (is_file($profileFile)) {
    $cfg          = json_decode((string) file_get_contents($profileFile), true) ?: [];
    $darkEnabled  = !isset($cfg['other_darkmode'])
        || filter_var($cfg['other_darkmode'], FILTER_VALIDATE_BOOLEAN);
    $defaultTheme = (string) ($cfg['other_default_theme'] ?? 'auto');
} else {
    /* Last-resort only (no profile JSON on disk). At template-root index.php time
     * `site-settings` is a partial stdClass WITHOUT ->get() — calling ->get() would
     * FATAL. Guard for a real Registry; otherwise keep the safe defaults. */
    $siteSettings = $this->params->get('site-settings');
    if ($siteSettings instanceof \Joomla\Registry\Registry) {
        $darkEnabled  = filter_var($siteSettings->get('other_darkmode', '1'), FILTER_VALIDATE_BOOLEAN);
        $defaultTheme = (string) $siteSettings->get('other_default_theme', 'auto');
    }
}

/* normalize legacy values (light-active/dark-active) → auto|light|dark */
if ($defaultTheme === 'light-active')      { $defaultTheme = 'light'; }
elseif ($defaultTheme === 'dark-active')   { $defaultTheme = 'dark'; }
if (!in_array($defaultTheme, ['auto', 'light', 'dark'], true)) { $defaultTheme = 'auto'; }

$cookieChoice = \Joomla\CMS\Factory::getApplication()->input->cookie->get('ja_<name>-theme', '');
if ($cookieChoice !== 'dark' && $cookieChoice !== 'light') { $cookieChoice = ''; }

/* First-paint theme.
 *  - ?theme=dark|light : that theme, for this load only (below).
 *  - Switcher ON  : visitor's cookie choice → GUI default → OS (auto).
 *  - Switcher OFF : LOCKED to the GUI default (cookie ignored, no toggle rendered). */
/* `?theme=dark|light` on the address wins for THIS load (over the cookie, the GUI default and the
 * OS) and is NEVER saved. Tracy's Design inspiration preview frames the demo from another origin and
 * asks for a theme this way: it cannot set this cookie, and an iframe's `color-scheme` does not change
 * the framed page's prefers-color-scheme (measured). darkmode.js keeps it against OS changes. */
$askedTheme = \Joomla\CMS\Factory::getApplication()->input->get->getWord('theme', '');
if ($askedTheme !== 'dark' && $askedTheme !== 'light') { $askedTheme = ''; }
if ($askedTheme !== '')                                         { $resolved = $askedTheme; }
elseif ($darkEnabled && $cookieChoice !== '')                  { $resolved = $cookieChoice; }
elseif ($defaultTheme === 'light' || $defaultTheme === 'dark') { $resolved = $defaultTheme; }
else                                                           { $resolved = ''; } // auto → OS

if ($resolved !== '') {
    $this->addScriptDeclaration(
        '(function(){var t=' . json_encode($resolved) . ';'
        . "document.documentElement.setAttribute('data-theme',t);"
        . "document.documentElement.setAttribute('data-bs-theme',t);"
        . "if(t==='dark'){document.documentElement.classList.add('t4-dark');}})();"
    );
} else {
    $this->addScriptDeclaration(
        "(function(){try{var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;"
        . "var t=d?'dark':'light';document.documentElement.setAttribute('data-theme',t);"
        . "document.documentElement.setAttribute('data-bs-theme',t);"
        . "if(d){document.documentElement.classList.add('t4-dark');}}"
        . "catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-bs-theme','light');}})();"
    );
}

/* expose default + enabled to darkmode.js (OS-follow gating) */
$this->addScriptDeclaration('window.ja<Name>Theme={def:' . json_encode($defaultTheme) . ',enabled:' . ($darkEnabled ? 'true' : 'false') . '};');

/* darkmode.css whenever the page CAN render dark (switch on, default resolves dark, or ?theme=dark). */
if ($darkEnabled || $defaultTheme === 'dark' || $defaultTheme === 'auto' || $askedTheme === 'dark') {
    $darkCss = __DIR__ . '/css/darkmode.css';
    if (is_file($darkCss)) {
        $href = \Joomla\CMS\Uri\Uri::root(true) . '/templates/' . $this->template . '/css/darkmode.css?' . filemtime($darkCss);
        $this->addCustomTag('<link rel="stylesheet" type="text/css" href="' . $href . '">');
    }
}

/* darkmode.js only when live switching (toggle on) or OS-follow (default=auto). */
if ($darkEnabled || $defaultTheme === 'auto') {
    $darkJs = __DIR__ . '/js/darkmode.js';
    if (is_file($darkJs)) {
        $this->getWebAssetManager()->registerAndUseScript(
            'tpl.ja_<name>.darkmode',
            'templates/' . $this->template . '/js/darkmode.js?' . filemtime($darkJs),
            [], ['defer' => true]
        );
    }
}
```

---

## 2. `html/layouts/t4/element/theme-toggle.php` — the toggle button (GATED)

The button is **static markup**, gated by `other_darkmode`. When dark is disabled it
renders NOTHING. `darkmode.js` wires the click by delegation (the JS does not build it).

```php
<?php
defined('_JEXEC') or die;
use Joomla\CMS\Factory;

/* Same authoritative source as index.php: the active "site" profile JSON, LOCAL-FIRST.
 * This element is FOUR levels below the template root (element→t4→layouts→html→<tpl>). */
$darkEnabled = true;
$params      = Factory::getDocument()->params;
$siteProfile = $params ? $params->get('typelist-site', 'default') : 'default';
$tplRoot     = dirname(__DIR__, 4);
$profileFile = $tplRoot . '/local/etc/site/' . basename((string) $siteProfile) . '.json';
if (!is_file($profileFile)) {
    $profileFile = $tplRoot . '/etc/site/' . basename((string) $siteProfile) . '.json';
}
if (is_file($profileFile)) {
    $cfg         = json_decode((string) file_get_contents($profileFile), true) ?: [];
    $darkEnabled = !isset($cfg['other_darkmode'])
        || filter_var($cfg['other_darkmode'], FILTER_VALIDATE_BOOLEAN);
} elseif ($params && ($siteSettings = $params->get('site-settings')) instanceof \Joomla\Registry\Registry) {
    /* Guard: site-settings can be a partial stdClass without ->get() (would fatal). */
    $darkEnabled = filter_var($siteSettings->get('other_darkmode', '1'), FILTER_VALIDATE_BOOLEAN);
}

if (!$darkEnabled) {
    return; // dark mode disabled in the GUI → render no toggle
}
?>
<button type="button" class="t4-theme-toggle" aria-label="Toggle dark mode" aria-pressed="false" title="Toggle light / dark">
  <svg class="t4-theme-toggle__moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  <svg class="t4-theme-toggle__sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/></svg>
</button>
```

Place `{{ load:t4.element.theme-toggle }}` (or include) inside the header/mainnav block.

---

## 3. `js/darkmode.js` — wires the toggle + OS-follow (only)

First paint is already done server-side; this file ONLY: wires the toggle click,
persists the choice to the cookie, keeps `aria-pressed` in sync, and follows the OS
**while `def === 'auto'` and the visitor hasn't chosen**. It binds by delegation, so a
missing toggle (disabled mode) is harmless.

```js
(function () {
  'use strict';
  var KEY  = 'ja_<name>-theme';
  var root = document.documentElement;
  var def  = (window.ja<Name>Theme && window.ja<Name>Theme.def) || 'auto';
  // `?theme=dark|light` wins for THIS load and is never saved (index.php already painted it).
  function asked() {
    try { var m = /[?&]theme=(dark|light)(?:&|#|$)/.exec(window.location.search || ''); return m ? m[1] : ''; }
    catch (e) { return ''; }
  }
  var askedTheme = asked();

  function getCookie() {
    var m = document.cookie.match(/(?:^|;\s*)ja_<name>-theme=(dark|light)\b/);
    return m ? m[1] : '';
  }
  function setCookie(v) {
    document.cookie = KEY + '=' + v + ';path=/;max-age=31536000;SameSite=Lax';
  }
  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function apply(mode) {
    var dark = mode === 'dark';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
    if (dark) { root.classList.add('t4-dark'); } else { root.classList.remove('t4-dark'); }
    document.querySelectorAll('.t4-theme-toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', dark ? 'true' : 'false');
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('.t4-theme-toggle') : null;
    if (!btn) { return; }
    var next = current() === 'dark' ? 'light' : 'dark';
    setCookie(next);
    apply(next);
  });

  document.addEventListener('DOMContentLoaded', function () { apply(askedTheme || current()); });

  if (def === 'auto' && window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (e) { if (askedTheme || getCookie()) { return; } apply(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) { mq.addEventListener('change', onChange); }
    else if (mq.addListener) { mq.addListener(onChange); }
  }
})();
```

---

## 4. Standalone pages — `error.php`, `offline.php`, `error-t4.php`

These render **outside** `T4::render()`, so they MUST repeat the disk resolution and
emit the same gated surfaces. Add this PHP block near the top (they have `$app`/`$doc`
or use `Factory`; `__DIR__` is the template root):

```php
/* ---- Dark-mode resolution — honor the GUI lock/default like index.php (local-first).
 * Standalone pages don't run through T4::render(), so site-settings isn't a usable
 * Registry here — resolve the "site" profile from disk (local/etc/site → etc/site). */
$app          = \Joomla\CMS\Factory::getApplication();
$doc          = \Joomla\CMS\Factory::getDocument();
$darkEnabled  = true;
$defaultTheme = 'auto';
$siteProfile  = $doc->params ? $doc->params->get('typelist-site', 'default') : 'default';
$profileFile  = __DIR__ . '/local/etc/site/' . basename((string) $siteProfile) . '.json';
if (!is_file($profileFile)) {
    $profileFile = __DIR__ . '/etc/site/' . basename((string) $siteProfile) . '.json';
}
if (is_file($profileFile)) {
    $cfg          = json_decode((string) file_get_contents($profileFile), true) ?: [];
    $darkEnabled  = !isset($cfg['other_darkmode']) || filter_var($cfg['other_darkmode'], FILTER_VALIDATE_BOOLEAN);
    $defaultTheme = (string) ($cfg['other_default_theme'] ?? 'auto');
}
if ($defaultTheme === 'light-active')    { $defaultTheme = 'light'; }
elseif ($defaultTheme === 'dark-active') { $defaultTheme = 'dark'; }
if (!in_array($defaultTheme, ['auto', 'light', 'dark'], true)) { $defaultTheme = 'auto'; }
$cookieChoice = $app->input->cookie->get('ja_<name>-theme', '');
if ($cookieChoice !== 'dark' && $cookieChoice !== 'light') { $cookieChoice = ''; }
/* `?theme=dark|light` on the address wins for THIS load (over the cookie, the GUI default and the
 * OS) and is NEVER saved. Tracy's Design inspiration preview frames the demo from another origin and
 * asks for a theme this way: it cannot set this cookie, and an iframe's `color-scheme` does not change
 * the framed page's prefers-color-scheme (measured). darkmode.js keeps it against OS changes. */
$askedTheme = \Joomla\CMS\Factory::getApplication()->input->get->getWord('theme', '');
if ($askedTheme !== 'dark' && $askedTheme !== 'light') { $askedTheme = ''; }
if ($askedTheme !== '')                                         { $resolved = $askedTheme; }
elseif ($darkEnabled && $cookieChoice !== '')                  { $resolved = $cookieChoice; }
elseif ($defaultTheme === 'light' || $defaultTheme === 'dark') { $resolved = $defaultTheme; }
else                                                           { $resolved = ''; }
```

First-paint script in `<head>` (honors lock → cookie → OS):

```php
<?php if ($resolved !== '') : ?>
  <script>(function(){var t=<?php echo json_encode($resolved); ?>;var h=document.documentElement;h.setAttribute('data-theme',t);h.setAttribute('data-bs-theme',t);if(t==='dark')h.classList.add('t4-dark');})();</script>
<?php else : ?>
  <script>(function(){try{var m=document.cookie.match(/(?:^|;\s*)ja_<name>-theme=(dark|light)\b/);var t=m?m[1]:'';if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var h=document.documentElement;h.setAttribute('data-theme',t);h.setAttribute('data-bs-theme',t);if(t==='dark')h.classList.add('t4-dark');}catch(e){}})();</script>
<?php endif; ?>
```

Toggle button (if the page has one) — GATE it:

```php
<?php if ($darkEnabled) : ?>
  <button class="...err/off-toggle t4-theme-toggle" aria-label="Toggle dark mode" aria-pressed="false"> ... </button>
<?php endif; ?>
```

`darkmode.js` at the end of `<body>` — GATE it + emit the global:

```php
<?php if ($darkEnabled || $defaultTheme === 'auto') : ?>
  <script>window.ja<Name>Theme={def:<?php echo json_encode($defaultTheme); ?>,enabled:<?php echo $darkEnabled ? 'true' : 'false'; ?>};</script>
  <script src="<?php echo $base; ?>/templates/<?php echo $tpl; ?>/js/darkmode.js" defer></script>
<?php endif; ?>
```

(`error-t4.php` is the rare T4 error variant; it has no `darkmode.js` and only needs the
resolution block + first-paint script.)

---

## 5. CSS architecture

`css/darkmode.css` holds ONLY dark overrides, scoped under **`html[data-theme="dark"]`**
(and/or `html.t4-dark` / `[data-bs-theme="dark"]`), loaded LAST so it wins. Light mode is
the base CSS and is never touched. Loading darkmode.css on a locked-light page is harmless
(its selectors never match). See `references/darkmode/css-architecture.md`
for the full dark-theming method (tokens, leaks, seams, borders, hover, masks).

---

## 6. Invariants checklist (every template, every page)

- [ ] First paint resolved server-side from **profile JSON local-first**, never from the
      `site-settings` Registry at root `index.php` time (it's a stub `stdClass` there).
- [ ] `local/etc/site/<profile>.json` checked **before** base `etc/site/`.
- [ ] Any `site-settings->get()` fallback **guarded** with `instanceof \Joomla\Registry\Registry`.
- [ ] Precedence: `?theme=dark|light` (this load only, never saved) → cookie (only if enabled)
      → GUI default → auto/OS. All three hooks move together: `data-theme`, `data-bs-theme`,
      `html.t4-dark`. `darkmode.js` never lets an OS change take the asked theme back, and only a
      click on the toggle writes the cookie. Gate: `scripts/review/dark-toggle.mjs`.
- [ ] Toggle button **gated** by `other_darkmode` (renders nothing when off) — header AND
      every standalone page.
- [ ] `darkmode.css` gated by `darkEnabled || default in {dark,auto}`.
- [ ] `darkmode.js` gated by `darkEnabled || default==auto`; the page also emits
      `window.ja<Name>Theme={def,enabled}` wherever it loads `darkmode.js`.
- [ ] `error.php`, `offline.php`, `error-t4.php` repeat the SAME resolution (they don't run
      through `T4::render()`).
- [ ] One cookie name `ja_<name>-theme`; one JS global `window.ja<Name>Theme`.

## 7. Verify recipe (run in BOTH modes)

Set the profile (admin or `local/etc/site/default.json`) and clear `media/t4/optimize/*`,
then for `/` (home), a real content page (e.g. `/login`), a 404 (`/nope-xyz`), and offline:

```bash
for url in "/" "/login" "/nope-xyz"; do
  html=$(curl -s "http://<site>${url}")
  echo "$url $(echo "$html" | grep -oE 'var t="[a-z]+"|prefers-color-scheme' | head -1) \
        darkmodeJS=$(echo "$html" | grep -c 'js/darkmode.js') \
        toggleBtn=$(echo "$html" | grep -coE '<button[^>]*t4-theme-toggle')"
done
```

- **Locked light** (`other_darkmode:false, other_default_theme:light`): every row →
  `var t="light"`, `darkmodeJS=0`, `toggleBtn=0`.
- **Locked dark** (`true,dark`): every row → `var t="dark"`, `darkmodeJS=1`, `toggleBtn=1`,
  and `window.ja<Name>Theme={def:"dark",enabled:true}`.
- **Auto** (`true,auto`): OS-follow script (`prefers-color-scheme`), `darkmodeJS=1`, toggle on.

All three page types MUST agree in each mode. (Verified live on JA Stratum.)

**`?theme=dark|light` in every mode.** Add `?theme=dark` and `?theme=light` to any row above: the
first-paint script must carry that literal (`var t="dark"` / `var t="light"`) whatever the cookie,
the default or the OS say, and no `Set-Cookie` may come back for it. In a browser, the gate that
proves it end to end (first paint, all three hooks, OS change mid-page, nothing saved) is:

```bash
node scripts/review/dark-toggle.mjs http://<site>/ 1366 --config <review-config.json>
```

## 8. The ADMIN surface — the two layers people forget (the field must SHOW + read right)

The resolution above can be perfect and the admin still shows nothing usable. Two separate admin
layers must ALSO be correct, and both are easy to miss (each was a real bug found across the fleet).
(Full long-form source — manifest/language/scaffold detail + the cookie variant rationale: the
dark-mode skill's `references/darkmode/gui-config-delivery.md`.)

### 8a. The field must RENDER in the T4 settings form (`site-other` legend)
T4 builds the style "Site" settings form from `params/typelist-site.xml` — **the template's own copy
if it ships one (`Path::findInTheme` returns local→template→base), else the base plugin's** — and THEN
merges `templateDetails.xml`'s `<site><fields name="typelist-site">` into it. The two dark fields sit in
a `<fieldset name="site-other" subgroup="1">`, which only renders if a **`type="legend"` `site-other`
group exists in the form T4 loads**.
- Most templates ship NO `params/typelist-site.xml` → T4 uses the base plugin's (which HAS a legend
  `site-other`) → the templateDetails merge lands the fields there → renders. ✓
- **BUG `[ADMIN-FORM-NO-LEGEND]`** (QA-detect: design-review platform bug **P85** / recurring `[ADMIN-FORM-NO-LEGEND]`)**:** a template that ships its OWN `params/typelist-site.xml` (e.g. to
  customise the logo fieldset) usually omits `site-other` → the dark fields have no legend group →
  **they never appear in admin** (seen on ja_spark, ja_voyara). **Fix:** add a full `site-other` legend
  fieldset (favicon + back-to-top + the two dark fields) to the template's own `params/typelist-site.xml`.
- **Verify** (no UI needed): `Path::findInTheme('params/typelist-site.xml')` resolves to the template's
  copy when present; confirm `other_darkmode`/`other_default_theme` end up under a `type="legend"` fieldset
  in THAT file.

### 8b. The admin reads the SITE-LEVEL language file FIRST (`<root>/language/...`)
Joomla's `StyleModel` loads `tpl_<name>` language via `$lang->load('tpl_'.$tpl, $client->path) || $lang->load(..., $client->path.'/templates/'.$tpl)` — and `$client->path` is the **site root**. So it loads
`<root>/language/en-GB/en-GB.tpl_<name>.ini` FIRST and **short-circuits** (only falls back to the
template-folder copy if the site-level one is ABSENT). JA quickstarts ship a site-level copy → that is
what the admin reads.
- **BUG `[ADMIN-LANG-SITELEVEL-STALE]`** (QA-detect: design-review platform bug **P84** / recurring `[ADMIN-LANG-SITELEVEL-STALE]`)**:** the 7 dark constants get added to
  `templates/<name>/language/...` (the obvious place) but the admin reads the **site-level** file, which
  lacks them → labels/options render as raw `T4_DARK_MODE_LABEL` / `TPL_THEME_AUTO` (seen fleet-wide:
  most site-level files had 0/7). **Fix:** put the 7 constants in **BOTH** the site-level
  `<root>/language/en-GB/en-GB.tpl_<name>.ini` AND the template-folder copy.
- The 7 constants (use ONE unified wording across all templates):
  `T4_DARK_MODE_LABEL="Enable Dark/Light mode"`, `T4_DARK_MODE_DESC="..."`,
  `TPL_DEFAULT_THEME_LABEL="Default theme"`, `TPL_DEFAULT_THEME_DESC="..."`,
  `TPL_THEME_AUTO="Auto (follow device)"`, `TPL_THEME_LIGHT="Light"`, `TPL_THEME_DARK="Dark"`.
- **Verify with REAL `parse_ini_string`** (a single malformed line drops the WHOLE file → all raw): run
  `php` inside the container, pass the ini base64-encoded as an arg via a small `.php` file (`ddev exec
  php -r` mangles `$` through its shell, and BSD `grep \s` gives false negatives — use PHP).
- **Packaging caveat:** the site-level file lives OUTSIDE `templates/<name>/` → it is NOT in the template
  zip. A clean install (no site-level override) uses the template-folder copy (correct); a quickstart-based
  system needs the site-level file updated separately, or removed so the template copy takes over.

### 8c. Don't forget `component.php`, and pack the new files
- **`component.php`** (`?tmpl=component`: print/iframe/embed) is the most-forgotten surface — it bypasses
  `index.php` and must repeat the SAME local-first resolver. Even the reference build (JA Stratum) shipped
  a `component.php` still on the old base-`etc/` + `(int)===1` pattern after `index.php` was fixed. Always
  re-check it. (`[COMPONENT-TMPL-DARK-UNWIRED]`, platform bug P81.)
- **Manifest completeness:** any NEW root file (a shared resolver) or NEW top-level folder (`local/`) must
  be added to `templateDetails.xml` `<files>` (`<filename>`/`<folder>`), or it is dropped on
  package/reinstall — a `require_once` of a dropped root file then fatals every page. (`[PKG-MANIFEST-INCOMPLETE]`)

### 8d. The `site-settings` guard must be `instanceof Registry`, not `is_object()`
At `index.php`/standalone time `site-settings` is a partial **`stdClass`** — which IS an object, so an
`is_object($ss)` guard PASSES and `$ss->get()` still **fatals** (P83). The guard MUST be
`$ss instanceof \Joomla\Registry\Registry` (seen on ja_nexora).
