<?php

/**
 * Tracy — the one server-side dark/light resolution.
 *
 * `index.php`, `error.php`, `error-t4.php` and `offline.php` all need it, and gotcha #6 is
 * precisely that the standalone pages drift from index.php: a stale cookie or a dark OS flips a
 * locked-light site's 404 page, and the toggle appears on pages where the admin switched it off.
 * Keeping ONE copy makes that drift impossible rather than merely unlikely.
 *
 * Sets, for the caller:
 *   $tracyBaseDarkEnabled  bool    the GUI switch — gates the toggle button and live switching
 *   $tracyBaseDefaultTheme string  auto|light|dark
 *   $tracyBaseResolved     string  ''|light|dark — '' means follow the OS at first paint
 *   $tracyBaseHeadScript   string  the pre-paint script, ready to inline
 *
 * @package TRACY_BASE
 */

defined('_JEXEC') or die;

$tracyBaseDarkEnabled  = true;
$tracyBaseDefaultTheme = 'auto';

// Local-first, exactly like T4's own Path::findInTheme: the admin GUI writes saved settings to
// local/, and reading only the shipped etc/ would silently ignore the owner's choice.
$tracyBaseProfile = 'default';

if (isset($tracyBaseSiteProfile) && $tracyBaseSiteProfile !== '') {
    $tracyBaseProfile = basename((string) $tracyBaseSiteProfile);
}

$tracyBaseFile = __DIR__ . '/local/etc/site/' . $tracyBaseProfile . '.json';

if (!is_file($tracyBaseFile)) {
    $tracyBaseFile = __DIR__ . '/etc/site/' . $tracyBaseProfile . '.json';
}

if (is_file($tracyBaseFile)) {
    $tracyBaseCfg = json_decode((string) file_get_contents($tracyBaseFile), true) ?: [];
    $tracyBaseDarkEnabled = !isset($tracyBaseCfg['other_darkmode'])
        || filter_var($tracyBaseCfg['other_darkmode'], FILTER_VALIDATE_BOOLEAN);
    $tracyBaseDefaultTheme = (string) ($tracyBaseCfg['other_default_theme'] ?? 'auto');
}

if (!in_array($tracyBaseDefaultTheme, ['auto', 'light', 'dark'], true)) {
    $tracyBaseDefaultTheme = 'auto';
}

$tracyBaseCookie = \Joomla\CMS\Factory::getApplication()->input->cookie->get('tracy-theme', '');

if ($tracyBaseCookie !== 'dark' && $tracyBaseCookie !== 'light') {
    $tracyBaseCookie = '';
}

// `?theme=dark|light` on the address wins for THIS load, over everything below, and is never
// saved: Tracy's Design inspiration preview frames the site from another origin and asks for a
// theme this way (it cannot reach the cookie, and a frame cannot change the page's OS preference).
// Honoured whenever the site can render both — not when locked to light with the switcher off.
// The same rule as index.php and js/darkmode.js.
$tracyBaseAsked = \Joomla\CMS\Factory::getApplication()->input->getCmd('theme', '');

if ($tracyBaseAsked !== 'dark' && $tracyBaseAsked !== 'light') {
    $tracyBaseAsked = '';
}

// Switcher ON: the visitor's choice wins, then the GUI default, then the OS.
// Switcher OFF: locked to the GUI default — the cookie is ignored and no toggle is rendered.
if ($tracyBaseAsked !== '' && ($tracyBaseDarkEnabled || $tracyBaseDefaultTheme !== 'light')) {
    $tracyBaseResolved = $tracyBaseAsked;
} elseif ($tracyBaseDarkEnabled && $tracyBaseCookie !== '') {
    $tracyBaseResolved = $tracyBaseCookie;
} elseif ($tracyBaseDefaultTheme === 'light' || $tracyBaseDefaultTheme === 'dark') {
    $tracyBaseResolved = $tracyBaseDefaultTheme;
} else {
    $tracyBaseResolved = '';
}

if ($tracyBaseResolved !== '') {
    $tracyBaseHeadScript =
        '(function(){var t=' . json_encode($tracyBaseResolved) . ';'
        . "document.documentElement.setAttribute('data-theme',t);"
        . "document.documentElement.setAttribute('data-bs-theme',t);"
        . "if(t==='dark'){document.documentElement.classList.add('t4-dark');}})();";
} else {
    $tracyBaseHeadScript =
        "(function(){try{var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;"
        . "var t=d?'dark':'light';document.documentElement.setAttribute('data-theme',t);"
        . "document.documentElement.setAttribute('data-bs-theme',t);"
        . "if(d){document.documentElement.classList.add('t4-dark');}}"
        . "catch(e){document.documentElement.setAttribute('data-theme','light');"
        . "document.documentElement.setAttribute('data-bs-theme','light');}})();";
}
