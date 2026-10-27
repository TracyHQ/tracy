<?php

/**
 * @package   TRACY_BASE
 * @copyright Copyright (C) 2005 - 2026 Open Source Matters, Inc. All rights reserved.
 * @license   GNU General Public License version 2 or later; see LICENSE.txt
 */

defined('_JEXEC') or die;

/* ---- Dark mode wiring — GUI-configurable (cookie + server-resolve) ----------
 * The vega standard from dark-light-mode-standard.md: PHP resolves the theme server-side HERE and
 * emits it before paint, so there is no flash of the wrong palette. Persistence is a cookie
 * (tracy-theme). The hook is set three ways at once — data-theme (this template's tokens),
 * html.t4-dark (T4's own convention) and data-bs-theme (so Bootstrap components follow).
 *
 * Admin: Template -> Settings -> Other -> other_darkmode (on/off, gates the toggle BUTTON and live
 * switching) + other_default_theme (auto/light/dark, the first paint).
 *
 * Read the active "site" profile JSON LOCAL-FIRST (local/etc/site/<profile>.json -> etc/site/),
 * exactly like T4's own Path::findInTheme. NEVER read the site-settings Registry at index.php time:
 * it is a partial stdClass without ->get() and would fatal (gotcha #12) — hence the instanceof
 * guard on the fallback. */
$darkEnabled  = true;
$defaultTheme = 'auto';
$siteProfile  = $this->params->get('typelist-site', 'default');
$profileFile  = __DIR__ . '/local/etc/site/' . basename((string) $siteProfile) . '.json';

if (!is_file($profileFile)) {
    $profileFile = __DIR__ . '/etc/site/' . basename((string) $siteProfile) . '.json';
}

if (is_file($profileFile)) {
    $cfg          = json_decode((string) file_get_contents($profileFile), true) ?: [];
    $darkEnabled  = !isset($cfg['other_darkmode'])
        || filter_var($cfg['other_darkmode'], FILTER_VALIDATE_BOOLEAN);
    $defaultTheme = (string) ($cfg['other_default_theme'] ?? 'auto');
} else {
    $siteSettings = $this->params->get('site-settings');

    if ($siteSettings instanceof \Joomla\Registry\Registry) {
        $darkEnabled  = filter_var($siteSettings->get('other_darkmode', '1'), FILTER_VALIDATE_BOOLEAN);
        $defaultTheme = (string) $siteSettings->get('other_default_theme', 'auto');
    }
}

if (!in_array($defaultTheme, ['auto', 'light', 'dark'], true)) {
    $defaultTheme = 'auto';
}

$cookieChoice = \Joomla\CMS\Factory::getApplication()->input->cookie->get('tracy-theme', '');

if ($cookieChoice !== 'dark' && $cookieChoice !== 'light') {
    $cookieChoice = '';
}

/* `?theme=dark|light` on the address wins for THIS load, over the cookie, the GUI default and the
 * OS, and is never saved. Tracy's Design inspiration preview frames the site from another origin
 * and asks for a theme this way: it cannot reach the cookie, and a frame cannot change what the page
 * reads as the OS preference (measured 29/09/2026). Honoured whenever the site can render both —
 * not on a site locked to light with the switcher off, which loads no dark stylesheet.
 * Same rule in theme-resolve.php (error, offline and component pages) and in js/darkmode.js. */
$askedTheme = \Joomla\CMS\Factory::getApplication()->input->getCmd('theme', '');

if ($askedTheme !== 'dark' && $askedTheme !== 'light') {
    $askedTheme = '';
}

/* First paint. The address first (above). Switcher ON: cookie -> GUI default -> OS.
 * Switcher OFF: locked to the GUI default. */
if ($askedTheme !== '' && ($darkEnabled || $defaultTheme !== 'light')) {
    $resolved = $askedTheme;
} elseif ($darkEnabled && $cookieChoice !== '') {
    $resolved = $cookieChoice;
} elseif ($defaultTheme === 'light' || $defaultTheme === 'dark') {
    $resolved = $defaultTheme;
} else {
    $resolved = '';
}

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
        . "catch(e){document.documentElement.setAttribute('data-theme','light');"
        . "document.documentElement.setAttribute('data-bs-theme','light');}})();"
    );
}

/* Expose the resolved config to js/darkmode.js (toggle gating + OS-follow). */
$this->addScriptDeclaration(
    'window.tracyTheme={def:' . json_encode($defaultTheme) . ','
    . 'enabled:' . ($darkEnabled ? 'true' : 'false') . '};'
);

/* The design system's own stylesheet: the 56 tokens, the dark remap, and T4's runtime variables.
 * `template.css` declares NONE of the names it is written against — they arrive here, chosen by the
 * style's own `typelist-theme` profile. That is what lets one template wear any of the 152, and it
 * is T4's own mechanism rather than a new one: the same param already picks `etc/theme/<name>.json`.
 * Loaded AFTER the optimize bundle so the tokens win over anything compiled before them. */
$designSystem = $this->params->get('typelist-theme', 'default');
$dsCss        = __DIR__ . '/css/styles/' . $designSystem . '.css';

if (is_file($dsCss)) {
    $href = \Joomla\CMS\Uri\Uri::root(true) . '/templates/' . $this->template
        . '/css/styles/' . $designSystem . '.css?' . filemtime($dsCss);
    $this->addCustomTag('<link rel="stylesheet" type="text/css" href="' . $href . '">');
}

/* darkmode.css is loaded LAST, after the optimize bundle, so its token remap wins. */
if ($darkEnabled || $defaultTheme === 'dark' || $defaultTheme === 'auto') {
    $darkCss = __DIR__ . '/css/darkmode.css';

    if (is_file($darkCss)) {
        $href = \Joomla\CMS\Uri\Uri::root(true) . '/templates/' . $this->template
            . '/css/darkmode.css?' . filemtime($darkCss);
        $this->addCustomTag('<link rel="stylesheet" type="text/css" href="' . $href . '">');
    }
}

/* darkmode.js only when live switching is on, or the default follows the OS. */
if ($darkEnabled || $defaultTheme === 'auto') {
    $darkJs = __DIR__ . '/js/darkmode.js';

    if (is_file($darkJs)) {
        $this->getWebAssetManager()->registerAndUseScript(
            'tpl.tracy.darkmode',
            'templates/' . $this->template . '/js/darkmode.js?' . filemtime($darkJs),
            [],
            ['defer' => true]
        );
    }
}

// Keep measured component repairs after generated token and optimize sheets.
$repairCss = __DIR__ . '/css/site-repairs.css';
$this->addCustomTag('<link rel="stylesheet" href="' . \Joomla\CMS\Uri\Uri::root(true)
    . '/templates/' . $this->template . '/css/site-repairs.css?' . filemtime($repairCss) . '">');
$this->setMetaData('viewport', 'width=device-width, initial-scale=1');

if (class_exists('\T4\T4')) {
    \T4\T4::render($this);
} else {
    include 'error-t4.php';
}
