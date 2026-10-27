# GUI-configurable dark mode (cookie + server-resolve) — the T4 standard

> **Canonical, condensed standard + copy-paste blocks:**
> `references/dark-light-mode-standard.md`. This file is the long-form
> rationale + manifest/language/scaffold detail. Both were hardened & verified live on ja_stratum
> (home + content + 404 + offline, light/dark/auto). The non-negotiable rules: resolve from the
> profile JSON **local-first** (NOT the `site-settings` Registry — it's a stub `stdClass` at
> `index.php` time), and gate the toggle / `darkmode.css` / `darkmode.js` consistently on **every**
> page including the standalone error/offline ones. Long-form source for the builder's condensed
> `dark-light-mode-standard.md`; maps to design-review P81/P83/P84/P85 +
> `[DARK-REGISTRY-STDCLASS]`/`[DARK-NOT-LOCAL-FIRST]`/`[DARK-STANDALONE-LOCK-DESYNC]`/`[ADMIN-FORM-NO-LEGEND]`/`[ADMIN-LANG-SITELEVEL-STALE]`.

**This is THE dark-mode standard for T4 templates — the only one.** There is no localStorage
alternative to choose on T4; ship this. (localStorage persistence is T3-only.) It keeps the shared
plumbing (a dedicated `css/darkmode.css`, the `html[data-theme="dark"]` hook, a static toggle
button, dark rules loaded last) and adds the two admin controls + server-side resolution:

1. **Two admin settings** — in the style edit under **Theme Configuration → "Other Settings"**
   group (NOT a top-level "Settings/Other" tab; the field name is `typelist-site[other_darkmode]`,
   so it lives in the *site* theme config). They are two **independent** controls:
   - `other_darkmode` — on/off: **shows/hides the toggle button only** (i.e. whether visitors may
     switch). It does NOT decide which theme the site uses.
   - `other_default_theme` — `light` / `dark` / `auto` (auto = follow the visitor's OS): the theme
     the site uses by default. With the toggle **off** this is the *locked* theme; with it **on**
     it's the *starting* theme a visitor gets before they choose.
2. **Persistence = a cookie** (`ja_<name>-theme`), NOT localStorage. A cookie is readable by **PHP**,
   so the initial theme is resolved on the server in `index.php` and emitted before paint — no
   FOUC, and the GUI default actually drives first-paint. localStorage can't do this (PHP can't
   read it, so a server default + localStorage choice fight → flicker).

> This is the JoomlArt house pattern (ja_titan ships it). The notes below are the **complete,
> verified mechanism** — you do NOT need to read any template's code to reproduce it. Reproduced
> 1:1 and verified end-to-end on ja_nova (Joomla 6 / T4).

## T4: this is the only standard (no localStorage variant)

On **T4** there is no "when to use this vs localStorage" decision — this cookie + server-resolve
delivery is mandatory, even when dark mode is effectively always-on (ship it with `other_darkmode=1`
+ `other_default_theme=auto` and it behaves exactly like an always-on OS-follow toggle, but the owner
can still lock/disable it later without a code change). The shared plumbing (separate `darkmode.css`,
`data-theme` hook, static button, load order, standalone docs) is identical to what T3 uses; only the
persistence + first-paint layer is T4-specific and lives here.

**localStorage is T3-only.** If you are theming a T3 template, use the localStorage scaffold in
`references/darkmode/css-architecture.md` §"Delivery architecture" instead — T3 has no `etc/site` profile
JSON / `t4radio` mechanism, so the server-side resolver in this file does not apply.

## How it resolves (the whole logic in one place)

**The two settings are orthogonal: `other_darkmode` only gates the toggle BUTTON; `other_default_theme`
always decides the theme.** A common bug is to "force light when disabled" — that throws away the
owner's Default-theme choice, so "toggle off + default Dark" wrongly renders light. Don't do that.

```
initial theme =
   cookie 'ja_<name>-theme' (dark|light)   ONLY IF other_darkmode = 1   (switching allowed → visitor's choice wins)
   else other_default_theme (light|dark)                            (the GUI default / locked theme)
   else follow the OS (prefers-color-scheme)                        [auto]

toggle button   = rendered ONLY IF other_darkmode = 1
darkmode.css    = loaded whenever the page CAN be dark  (other_darkmode=1 OR default ∈ {dark, auto})
darkmode.js     = loaded for switching or OS-follow      (other_darkmode=1 OR default = auto)
```

Resulting matrix (verified end-to-end on ja_stratum, Joomla 6 / T4):

| other_darkmode | default | result |
|---|---|---|
| off | dark  | **dark-only site, no toggle button** |
| off | light | light-only site, no toggle |
| off | auto  | follows the visitor's OS, no toggle |
| on  | dark/light/auto | that default + the toggle (visitor can switch; choice cookie wins) |

- The **cookie only applies when the toggle is enabled** (when disabled there is no button to set it,
  and a stale cookie must NOT override the locked theme — so ignore it).
- PHP reads the resolved value → emits a one-line `<head>` script before paint. No FOUC.
- **auto** is the only case that needs a client check (`matchMedia`) — PHP can't know the OS — so
  for auto we emit a tiny `matchMedia` resolver instead of a literal.
- Runtime OS changes are followed by `darkmode.js` **only** while default is `auto` AND no cookie.

## Where each piece lives (T4)

```
templateDetails.xml                              # the two <field>s (this is the GUI form source!)
etc/site/default.json                            # factory default VALUES (base; ships in the package)
local/etc/site/<profile>.json                    # where the admin GUI SAVES edits → READ THIS FIRST
language/en-GB/en-GB.tpl_<NAME>.ini              # field labels/descriptions
html/layouts/t4/element/theme-toggle.php         # toggle button, gated by other_darkmode (profile JSON, local-first)
html/layouts/t4/block/<header block>.html        # replace inline button → <jdoc element="theme-toggle">
index.php                                        # read profile JSON (local-first) + cookie → server-resolve pre-paint
component.php                                     # SAME resolver (component-view pages bypass index.php)
js/darkmode.js                                   # cookie persist + OS-follow (gated on auto)
css/darkmode.css                                 # unchanged from the vega standard
offline.php / error.php / error-t4.php           # repeat the SAME local-first resolution (lock/default + cookie + OS)
```

⚠️ **The GUI fields are defined in `templateDetails.xml`, not `etc/site/default.json`.** The
manifest's `<site><fields>` block is what T4 renders into the admin "Settings" form;
`etc/site/default.json` only stores the **saved values** (the factory defaults). Putting the field
only in default.json gives you a stored value with no control in the UI.

---

## Copy-paste scaffold

Substitute `<NAME>` (e.g. `ja_nova`) and pick a cookie name (`ja_<name>-theme`, e.g. `ja_nova-theme`).

### 1) `templateDetails.xml` — the admin fields (append inside `<extension>`, after `</t4>`)
T4 merges `subgroup="1"` fieldsets into the matching base group, so `site-other` lands these in the
existing **"Other"** settings tab.
```xml
<site>
    <fields name="typelist-site">
        <fieldset name="site-other" subgroup="1">
            <field name="other_darkmode" type="t4radio" default="1"
                   label="T4_DARK_MODE_LABEL" description="T4_DARK_MODE_DESC" />
            <field name="other_default_theme" type="list" default="auto"
                   label="TPL_DEFAULT_THEME_LABEL" description="TPL_DEFAULT_THEME_DESC">
                <option value="auto">TPL_THEME_AUTO</option>
                <option value="light">TPL_THEME_LIGHT</option>
                <option value="dark">TPL_THEME_DARK</option>
            </field>
        </fieldset>
    </fields>
</site>
```
`type="t4radio"` is the T4 on/off toggle field (same plugin both templates use). If the template's
manifest has **no** `<site>` block yet (many don't — they inherit the whole form from the t4
plugin), add the whole block; you're extending, not replacing.

### 2) `etc/site/default.json` — factory default values
Add two keys to the existing flat value map (it's an OrderedDict of saved settings):
```json
"other_darkmode": "1",
"other_default_theme": "auto"
```

### 3) `language/en-GB/en-GB.tpl_<NAME>.ini` — labels (admin reads this)
```ini
T4_DARK_MODE_LABEL      ="Enable Dark/Light mode"
T4_DARK_MODE_DESC       ="Show the theme toggle button and allow visitors to switch light/dark."
TPL_DEFAULT_THEME_LABEL ="Default theme"
TPL_DEFAULT_THEME_DESC  ="Theme on a visitor's first visit. Auto follows their device setting."
TPL_THEME_AUTO          ="Auto (follow device)"
TPL_THEME_LIGHT         ="Light"
TPL_THEME_DARK          ="Dark"
```

### 4) `html/layouts/t4/element/theme-toggle.php` — gated toggle button (NEW element)
The button is static markup (vega standard); this element only adds the on/off gate. It is pulled
in by `<jdoc:include type="element" name="theme-toggle" />` — T4 resolves element names to
`html/layouts/t4/element/<name>.php` in the template (proven: same base theme as the inline button).
```php
<?php
defined('_JEXEC') or die;
use Joomla\CMS\Factory;

// SAME authoritative source as index.php: the active "site" profile JSON, LOCAL-FIRST.
// This element is FOUR levels below the template root (element→t4→layouts→html→<tpl>).
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
    // Guard: site-settings can be a partial stdClass without ->get() (would fatal).
    $darkEnabled = filter_var($siteSettings->get('other_darkmode', '1'), FILTER_VALIDATE_BOOLEAN);
}
if (!$darkEnabled) {
    return;                       // dark disabled in the GUI → render no toggle
}
?>
<button type="button" class="t4-theme-toggle" aria-label="Toggle dark mode" aria-pressed="false" title="Toggle light / dark">
    <svg class="t4-theme-toggle__moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <svg class="t4-theme-toggle__sun"  width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/></svg>
</button>
```

### 5) Header block — include the element where the button used to be
In `html/layouts/t4/block/<mainnav|header>.html` replace the inline `<button class="t4-theme-toggle">…`
with:
```html
<jdoc:include type="element" name="theme-toggle" />
```

### 6) `index.php` — read settings + cookie → server-resolved pre-paint

> ⚠️ **Read the profile JSON from disk LOCAL-FIRST — do NOT read the `site-settings` Registry here.**
> At template-root `index.php` time the Registry is **not built yet**: `$this->params->get('site-settings')`
> is a partial **`stdClass`** carrying only `site_logo`, with **no `->get()` method** — calling `->get()`
> is a **fatal 500** (verified live on ja_stratum). T4 only builds the real `Joomla\Registry\Registry`
> later, in `loadTypelistData()` during the body layout render. So resolve from the active *site profile*
> JSON file the admin GUI writes, **checking `local/etc/site/` before base `etc/site/`** (the GUI saves
> edits to `local/`; mirrors `T4\Helper\Path::findInTheme`, which is local→base). This is the verified
> path — see `references/dark-light-mode-standard.md` for the full standard.

```php
use Joomla\CMS\Factory;
use Joomla\CMS\Uri\Uri;

$darkEnabled  = true;
$defaultTheme = 'auto';
$siteProfile  = $this->params->get('typelist-site', 'default');

// LOCAL-FIRST: the admin GUI saves to local/etc/site/<profile>.json; fall back to base etc/site/.
$profileFile  = __DIR__ . '/local/etc/site/' . basename($siteProfile) . '.json';
if (!is_file($profileFile)) {
    $profileFile = __DIR__ . '/etc/site/' . basename($siteProfile) . '.json';
}
if (is_file($profileFile)) {
    $cfg          = json_decode((string) file_get_contents($profileFile), true) ?: [];
    $darkEnabled  = !isset($cfg['other_darkmode'])
        || filter_var($cfg['other_darkmode'], FILTER_VALIDATE_BOOLEAN); // handles JSON bool false AND "0"/"1"
    $defaultTheme = (string) ($cfg['other_default_theme'] ?? 'auto');
} else {
    // Last resort only (no profile JSON on disk). site-settings is a stub stdClass here — guard it.
    $siteSettings = $this->params->get('site-settings');
    if ($siteSettings instanceof \Joomla\Registry\Registry) {
        $darkEnabled  = filter_var($siteSettings->get('other_darkmode', '1'), FILTER_VALIDATE_BOOLEAN);
        $defaultTheme = (string) $siteSettings->get('other_default_theme', 'auto');
    }
}
// normalize legacy values
if ($defaultTheme === 'light-active')      { $defaultTheme = 'light'; }
elseif ($defaultTheme === 'dark-active')   { $defaultTheme = 'dark'; }
if (!in_array($defaultTheme, ['auto', 'light', 'dark'], true)) { $defaultTheme = 'auto'; }

$cookieChoice = Factory::getApplication()->input->cookie->get('ja_<name>-theme', '');
if ($cookieChoice !== 'dark' && $cookieChoice !== 'light') { $cookieChoice = ''; }

// Resolve the first-paint theme. The cookie applies ONLY when switching is enabled;
// otherwise the site is locked to the GUI default (so "off + dark" = dark-only). NEVER force light.
/* `?theme=dark|light` on the address wins for THIS load (over the cookie, the GUI default and the
 * OS) and is NEVER saved. Tracy's Design inspiration preview frames the demo from another origin and
 * asks for a theme this way: it cannot set this cookie, and an iframe's `color-scheme` does not change
 * the framed page's prefers-color-scheme (measured). darkmode.js keeps it against OS changes. */
$askedTheme = \Joomla\CMS\Factory::getApplication()->input->get->getWord('theme', '');
if ($askedTheme !== 'dark' && $askedTheme !== 'light') { $askedTheme = ''; }
if ($askedTheme !== '')                                         { $resolved = $askedTheme; }
elseif ($darkEnabled && $cookieChoice !== '')                  { $resolved = $cookieChoice; }
elseif ($defaultTheme === 'light' || $defaultTheme === 'dark') { $resolved = $defaultTheme; }
else                                                           { $resolved = ''; } // auto → OS at first paint

if ($resolved !== '') {
    $this->addScriptDeclaration(
        '(function(){var t=' . json_encode($resolved) . ';'
        . "document.documentElement.setAttribute('data-theme',t);"
        . "document.documentElement.setAttribute('data-bs-theme',t);"
        . "if(t==='dark'){document.documentElement.classList.add('t4-dark');}})();"   // add the framework dark class too
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
// expose default + whether switching is enabled, to darkmode.js (OS-follow / no-clobber gating)
$this->addScriptDeclaration('window.<NAME>Theme={def:' . json_encode($defaultTheme) . ',enabled:' . ($darkEnabled ? 'true' : 'false') . '};');

// darkmode.css whenever the page CAN be dark (NOT only when the toggle is enabled) — else "off + dark"
// emits data-theme=dark but the dark rules never load.
if ($darkEnabled || $defaultTheme === 'dark' || $defaultTheme === 'auto' || $askedTheme === 'dark') {
    $darkCss = __DIR__ . '/css/darkmode.css';
    if (is_file($darkCss)) {
        $href = Uri::root(true) . '/templates/' . $this->template . '/css/darkmode.css?' . filemtime($darkCss);
        $this->addCustomTag('<link rel="stylesheet" type="text/css" href="' . $href . '">');
    }
}
// darkmode.js only for live switching (toggle on) or OS-follow (auto)
if ($darkEnabled || $defaultTheme === 'auto') {
    $darkJs = __DIR__ . '/js/darkmode.js';
    if (is_file($darkJs)) {
        $this->getWebAssetManager()->registerAndUseScript('tpl.<NAME>.darkmode',
            'templates/' . $this->template . '/js/darkmode.js?' . filemtime($darkJs), [], ['defer' => true]);
    }
}
```
> Build the inline JS with normal PHP strings + `json_encode($resolved)` (safe-escapes the value).
> Do NOT use a `<<<'JS'` nowdoc here — you need PHP interpolation, and the nowdoc-closing-marker
> `JS);` is a fatal parse error on PHP < 7.3 (and this is `index.php` — a parse error white-screens
> every page). If you keep any heredoc/nowdoc, the closing `JS` and `);` go on **separate lines**.
> **`component.php` uses the SAME block verbatim** (component-view pages bypass `index.php`).

### 7) `js/darkmode.js` — cookie persistence + gated OS-follow
```js
(function () {
  var KEY = 'ja_<name>-theme';
  var root = document.documentElement;
  var def = (window.<NAME>Theme && window.<NAME>Theme.def) || 'auto';
  // `?theme=dark|light` wins for THIS load and is never saved (index.php already painted it).
  function asked() {
    try { var m = /[?&]theme=(dark|light)(?:&|#|$)/.exec(window.location.search || ''); return m ? m[1] : ''; }
    catch (e) { return ''; }
  }
  var askedTheme = asked();

  function getCookie() { var m = document.cookie.match(/(?:^|;\s*)ja_<name>-theme=(dark|light)\b/); return m ? m[1] : ''; }
  function setCookie(v) { document.cookie = KEY + '=' + v + ';path=/;max-age=31536000;SameSite=Lax'; }
  function current() { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }

  function apply(m) {
    var dark = m === 'dark';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
    root.classList.toggle('t4-dark', dark);                                 // all three hooks move together
    document.querySelectorAll('.t4-theme-toggle').forEach(function (b) { b.setAttribute('aria-pressed', dark ? 'true' : 'false'); });
  }

  document.addEventListener('click', function (e) {                         // delegated
    var btn = e.target && e.target.closest ? e.target.closest('.t4-theme-toggle') : null;
    if (!btn) return;
    var next = current() === 'dark' ? 'light' : 'dark';
    setCookie(next); apply(next);
  });
  document.addEventListener('DOMContentLoaded', function () { apply(askedTheme || current()); });

  if (def === 'auto' && window.matchMedia) {                                // follow OS only in auto, no cookie
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var on = function (e) { if (askedTheme || getCookie()) return; apply(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
  }
})();
```

### 8) Standalone docs (`offline.php` / `error.php` / `error-t4.php`) — repeat the SAME resolution
These bypass `T4::render()`, so each must resolve the theme **itself** — and it must honor the GUI
**lock/default**, not just the cookie+OS. (Cookie-only is the old, incomplete pattern: on a
locked-light site a stale cookie or a dark OS would flip the 404/offline page to dark, breaking the
lock.) Read the profile JSON LOCAL-FIRST exactly like `index.php`. They have `$app`/`$doc` (or use
`Factory`); `__DIR__` is the template root. Add this PHP near the top:
```php
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
First-paint script in `<head>` (locked value, or OS-follow for auto):
```php
<?php if ($resolved !== '') : ?>
  <script>(function(){var t=<?php echo json_encode($resolved); ?>;var h=document.documentElement;h.setAttribute('data-theme',t);h.setAttribute('data-bs-theme',t);if(t==='dark')h.classList.add('t4-dark');})();</script>
<?php else : ?>
  <script>(function(){try{var m=document.cookie.match(/(?:^|;\s*)ja_<name>-theme=(dark|light)\b/);var t=m?m[1]:'';if(t!=='dark'&&t!=='light')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var h=document.documentElement;h.setAttribute('data-theme',t);h.setAttribute('data-bs-theme',t);if(t==='dark')h.classList.add('t4-dark');}catch(e){}})();</script>
<?php endif; ?>
```
Gate any toggle button on the page with `<?php if ($darkEnabled) : ?>…</?php endif; ?>`, and gate
`darkmode.js` + emit the global the same way `index.php` does:
```php
<?php if ($darkEnabled || $defaultTheme === 'auto') : ?>
  <script>window.<NAME>Theme={def:<?php echo json_encode($defaultTheme); ?>,enabled:<?php echo $darkEnabled ? 'true' : 'false'; ?>};</script>
  <script src="<?php echo $base; ?>/templates/<?php echo $tpl; ?>/js/darkmode.js" defer></script>
<?php endif; ?>
```
Keep their guarded `<link …/css/darkmode.css>` (vega standard). `error-t4.php` (the rare "T4
disabled" fallback) has no `darkmode.js`; it only needs the resolution block + first-paint script.

---

## Gotchas specific to this variant

- **Fields go in `templateDetails.xml`, values in `etc/site/default.json`.** Field-only-in-json =
  no UI control; value missing = `->get(name, default)` fallback covers it but the saved style won't
  have it until re-saved. Ship both.
- **`site-settings` is NOT usable in `index.php` — read the profile JSON instead.** At template-root
  `index.php` / standalone-page time the Registry is **not built yet**: `params->get('site-settings')`
  returns a partial **`stdClass`** with only `site_logo` and **no `->get()`** — calling `->get()` is a
  **fatal 500** (white-screens every page). T4 builds the real `Joomla\Registry\Registry` later, in
  `loadTypelistData()` during the body render. That's why a body-layout override (ja_titan) CAN read
  the Registry but the root `index.php` CANNOT. → Resolve from the profile JSON on disk, **local-first**
  (`local/etc/site/<profile>.json` then base `etc/site/`), and if you ever touch `site-settings` as a
  last-resort fallback, guard it with `instanceof \Joomla\Registry\Registry`.
- **Read `local/etc/site/<profile>.json` BEFORE base `etc/site/`.** The admin GUI writes saved edits to
  `local/` (mirrors `T4\Helper\Path::findInTheme`, local→base). Reading only the base `etc/` ignores
  every admin change — toggling dark off or switching the default does nothing on the frontend.
- **You do NOT need to override the base layout.** ja_titan sets a `<body>` class in its
  `html/layouts/t4/index.php` override; you don't have to. Emitting `data-theme` on `<html>` via the
  first `<head>` script (server-resolved value) is FOUC-free and avoids maintaining a copy of the
  framework layout that drifts on update.
- **Cookie name must match in 4 places**: `index.php` read, `darkmode.js` get/set, the three
  standalone docs. Pick one (`ja_<name>-theme`) and grep to confirm.
- **`SameSite=Lax`, `path=/`, long `max-age`.** Lax lets the cookie ride top-level navigations
  (so the server sees it on the next click); path=/ makes it site-wide.
- **Disabling hides the switch, it does NOT force light.** `other_darkmode=0` → no toggle button and
  no `darkmode.js` switching, but the site still renders `other_default_theme` (dark/light/auto) and
  `darkmode.css` still loads when that default can be dark. "Off + Default Dark" = a dark-only site.
  (The old "force light when disabled" behavior was a bug — it silently ignored the owner's Default
  theme. Never reintroduce it.) _Twin: design-review `[DARK-DEFAULT-IGNORED]`._
- **A stale theme cookie must not override a locked theme.** When disabled, ignore the cookie in
  `index.php` (gate it on `$darkEnabled`). Otherwise a visitor who once picked light stays light even
  after the owner sets the site to dark-only.
- **The dark CSS is unchanged** — still the separate `css/darkmode.css`, still scoped under
  `html[data-theme="dark"]`, still loaded last. None of the probe→fix→verify work changes.

### The ADMIN surface — the field must SHOW and the labels must read (two easily-missed layers)
The resolver can be perfect and the admin still shows nothing usable. Both layers were real fleet bugs.
- **The field must RENDER in the T4 "Site" settings form (`site-other` legend).** T4 builds the form from
  `Path::findInTheme('params/typelist-site.xml')` — the TEMPLATE's own copy if it ships one, else the base
  plugin's — then merges templateDetails.xml `<site><fields>`. The dark fields sit in
  `<fieldset name="site-other" subgroup="1">`, which only renders if a `type="legend"` `site-other` group
  exists in the loaded form. Templates with NO params override use the base form (which HAS a legend
  `site-other`) → fine. **BUG:** a template that ships its OWN `params/typelist-site.xml` (e.g. to tweak the
  logo fieldset) usually OMITS `site-other` → the dark fields have no group → they NEVER appear in admin
  (seen ja_spark, ja_voyara). **Fix:** add a full `<fieldset name="site-other" type="legend" subgroup="1"
  icon="cog" label="T4_OTHER_CONFIGURE_LABEL" description="T4_OTHER_CONFIGURE_DESC">` (favicon + back-to-top
  + `other_darkmode` + `other_default_theme`) to the template's own params file. _Twin: design-review P85 `[ADMIN-FORM-NO-LEGEND]`._
- **The admin reads the SITE-LEVEL language file FIRST.** Joomla's `StyleModel` does
  `$lang->load('tpl_'.$tpl, $client->path) || $lang->load(..., $client->path.'/templates/'.$tpl)` and
  `$client->path` is the SITE ROOT — so `<root>/language/en-GB/en-GB.tpl_<NAME>.ini` shadows the
  template-folder copy (short-circuit; the template copy is only used if the site-level one is ABSENT). JA
  quickstarts ship a site-level copy. **BUG:** put the 7 dark constants only in the template-folder ini and
  the admin shows raw `TPL_THEME_AUTO` (a classic tell: LABEL renders but the dropdown OPTIONS are raw —
  the site-level file had the label but not the option lines). **Fix:** put the 7 constants
  (`T4_DARK_MODE_LABEL/DESC`, `TPL_DEFAULT_THEME_LABEL/DESC`, `TPL_THEME_AUTO/LIGHT/DARK`) in **BOTH** files.
  Verify with REAL `parse_ini_string` in-container (`ddev exec php -r` mangles `$`; BSD `grep \s` lies). The
  site-level file is OUTSIDE `templates/<name>/` → NOT in the template zip (quickstart installs need it
  updated separately; clean installs use the template copy). _Twin: design-review P84 `[ADMIN-LANG-SITELEVEL-STALE]`._
- **`component.php` is the most-forgotten surface** — `?tmpl=component` bypasses index.php and must repeat
  the SAME local-first resolver. Even the reference build (ja_stratum) shipped a component.php still on the
  old base-`etc/` + `(int)===1` pattern after index.php was fixed. Always re-check it. _Twin: design-review P81 `[COMPONENT-TMPL-DARK-UNWIRED]`._
- **Guard with `instanceof \Joomla\Registry\Registry`, NOT `is_object()`** — the partial `site-settings`
  stdClass IS an object, so `is_object()` passes and `->get()` still fatals (P83 variant, ja_nexora).
- **Manifest completeness** — any new root file (a shared resolver) or new top-level folder (`local/`)
  must be in `templateDetails.xml` `<files>` or it's dropped on package/reinstall (a `require_once` of a
  dropped root file then fatals every page). _Twin: design-review `[PKG-MANIFEST-INCOMPLETE]`._

## Verify (no admin login needed)

Verify the **matrix**, not just one case. Set `other_darkmode` + `other_default_theme` in
`etc/site/<profile>.json`, clear cache, and check first-paint theme + toggle presence + darkmode.css:

Critically, verify ALL THREE page types — home, a real content page, AND a 404 (error.php) —
because the standalone pages resolve independently and are the easiest to leave inconsistent:
```bash
bash scripts/clear-cache.sh                      # Joomla cache + media/t4/optimize, inside the container
# Set other_darkmode + other_default_theme in local/etc/site/<profile>.json (what the GUI writes), then:
for url in "/" "/login" "/nope-xyz"; do          # home, real content (status 200), 404 (error.php)
  html=$(curl -s "<url>${url}?cb=$RANDOM")
  echo "$url theme=$(echo "$html" | grep -oE 'var t="(dark|light)"|prefers-color-scheme' | head -1) \
       darkmodeJS=$(echo "$html" | grep -c 'js/darkmode.js') \
       toggleBtn=$(echo "$html" | grep -coE '<button[^>]*t4-theme-toggle')"
done
php -l index.php && php -l component.php && php -l html/layouts/t4/element/theme-toggle.php \
  && php -l error.php && php -l offline.php       # parse-safe (a parse error white-screens the page)
```
All three rows MUST agree in each mode:
- **off+light** → every row `var t="light"`, `darkmodeJS=0`, `toggleBtn=0`.
- **off+dark**  → every row `var t="dark"`,  `darkmodeJS=0`, `toggleBtn=0` (locked dark, no switch).
- **on+dark**   → every row `var t="dark"`,  `darkmodeJS=1`, `toggleBtn=1`, `window.<NAME>Theme={def:"dark",enabled:true}`.
- **on+auto**   → every row OS-follow (`prefers-color-scheme`), `darkmodeJS=1`, `toggleBtn=1`.
Also do a real **round-trip**: flip the profile to each mode, re-render, and confirm the toggle +
dark assets appear/disappear together (verified live on ja_stratum). `<button t4-theme-toggle>` is
the BUTTON; CSS class refs in `<style>` are harmless — count `<button[^>]*t4-theme-toggle` only.
⚠️ **curl can lag by one request** — Joomla page-cache may serve the PREVIOUS config's HTML even
after `clear-cache.sh`. Add a unique `?cb=$RANDOM` per request, and confirm the key case **in the
browser** (clear the `ja_<name>-theme` cookie, hard-reload, read `document.documentElement` +
`getComputedStyle(document.body).backgroundColor`). That's the only fully reliable check.

Test the 4 combinations: `off+dark`→dark-only/no toggle, `off+light`→light-only, `on+dark`→dark+toggle,
`on+auto`→OS-follow+toggle. Admin UI: the fields are in the style edit under **Theme Configuration →
Other Settings** (re-save the style if a field is missing — that loads the new manifest).
Also update `component.php` with the SAME resolver (component-view pages bypass `index.php`).
