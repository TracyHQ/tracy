<?php
/**
 * Trusted provisioner only: install and activate one pinned design template on a restored base.
 *
 * Runs BEFORE the contract is bound and before the site is attached, so the only writer here is
 * the provisioner. The recipe arrives as a file the host wrote from its own pinned registry — it
 * is never read off a request, and the ZIP it installs was hash-checked by `quickstart.py` on the
 * host before it was copied in.
 *
 * Every step is idempotent and checks the state it expects to find rather than a flag it wrote:
 * a crash between "installed" and "styles rewritten" must leave a retry able to finish the job
 * without creating a second style, a second extension row, or a second copy of the directory.
 * The exit code is the whole contract — a non-zero exit must leave provisioning refusing to bind
 * or attach, because a half-activated site is a site whose design nobody can name.
 */
if (PHP_SAPI !== 'cli') exit(1);

$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_URI'] = '/';
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';
define('_JEXEC', 1);
define('JPATH_BASE', '/var/www/html');
require JPATH_BASE . '/includes/defines.php';
require JPATH_BASE . '/includes/framework.php';

$container = \Joomla\CMS\Factory::getContainer();
$container->alias('session.web', 'session.web.site')
    ->alias('session', 'session.web.site')
    ->alias('JSession', 'session.web.site')
    ->alias(\Joomla\CMS\Session\Session::class, 'session.web.site')
    ->alias(\Joomla\Session\SessionInterface::class, 'session.web.site');
$app = $container->get(\Joomla\CMS\Application\SiteApplication::class);
\Joomla\CMS\Factory::$application = $app;
$app->createExtensionNamespaceMap();
$db = $container->get(\Joomla\Database\DatabaseInterface::class);

$planFile = getenv('TRACY_TEMPLATE_PLAN') ?: '/tmp/tracy-template-plan.json';
$zipFile = getenv('TRACY_TEMPLATE_ZIP') ?: '/tmp/tracy-template.zip';
$verifyOnly = getenv('TRACY_TEMPLATE_VERIFY_ONLY') === '1';

$plan = json_decode((string) @file_get_contents($planFile), true);
if (!is_array($plan)) throw new RuntimeException('template plan is unreadable');

$element = (string) ($plan['template']['element'] ?? '');
$version = (string) ($plan['template']['version'] ?? '');
// The element names a directory and an extension row; anything outside this shape would let a
// recipe reach out of `templates/`.
if (!preg_match('/^[a-z][a-z0-9_]{2,40}$/D', $element)) throw new RuntimeException('invalid template element');
if (!preg_match('/^[0-9][0-9a-zA-Z.\-]{0,20}$/D', $version)) throw new RuntimeException('invalid template version');

$recipe = $plan['activation'] ?? null;
if (!is_array($recipe)) throw new RuntimeException('template plan carries no activation recipe');
$styles = $recipe['styles'] ?? null;
if (!is_array($styles) || !count($styles)) throw new RuntimeException('activation recipe names no styles');
if (!preg_match('/^[a-z][a-z0-9_]{2,40}$/D', (string) ($recipe['fromTemplate'] ?? '')))
    throw new RuntimeException('activation recipe names no source template');

/** The installed row for this template, or null. */
$extensionRow = function () use ($db, $element) {
    return $db->setQuery(
        $db->getQuery(true)
            ->select(['extension_id', 'enabled', 'manifest_cache'])
            ->from('#__extensions')
            ->where('type = ' . $db->quote('template'))
            ->where('client_id = 0')
            ->where('element = ' . $db->quote($element))
    )->loadAssoc();
};

/** The version Joomla recorded when it installed the package, or ''. */
$installedVersion = function (?array $row): string {
    if (!$row) return '';
    $cache = json_decode((string) ($row['manifest_cache'] ?? ''), true);
    return is_array($cache) ? trim((string) ($cache['version'] ?? '')) : '';
};

$steps = [];

// ── 1. Install the pinned package ────────────────────────────────────────────────────────────
$row = $extensionRow();
if ($installedVersion($row) === $version) {
    $steps[] = 'install:already';
} elseif ($verifyOnly) {
    throw new RuntimeException('template ' . $element . ' ' . $version . ' is not installed');
} else {
    // The base archive can already carry an OLDER copy of this directory — the Apple 1.1.0
    // webroot ships 240 files under `templates/tracy_airbnb` whose ACM markup differs from the
    // released package. Joomla's installer overwrites what the package names and leaves the rest,
    // so without this the site would run two generations of one template at once and the
    // presentation lock would be pinning files no release produced. Remove, then install.
    $replace = (string) ($recipe['replaceDirectory'] ?? '');
    if ($replace !== '') {
        if ($replace !== 'templates/' . $element) throw new RuntimeException('replaceDirectory must be this template directory');
        $path = JPATH_ROOT . '/' . $replace;
        if (is_dir($path) && !\Joomla\Filesystem\Folder::delete($path)) throw new RuntimeException('could not clear ' . $replace);
        $steps[] = 'replaceDirectory:cleared';
    }
    if (!is_file($zipFile)) throw new RuntimeException('template package is missing');
    $package = \Joomla\CMS\Installer\InstallerHelper::unpack($zipFile);
    if (!$package) throw new RuntimeException('template package could not be unpacked');
    $installed = \Joomla\CMS\Installer\Installer::getInstance()->install($package['dir']);
    \Joomla\CMS\Installer\InstallerHelper::cleanupInstall($package['packagefile'], $package['extractdir']);
    if (!$installed) throw new RuntimeException('template package installation failed');
    $row = $extensionRow();
    if ($installedVersion($row) !== $version) throw new RuntimeException('installed template reports a different version');
    $steps[] = 'install:done';
}
if (!$row || (int) $row['enabled'] !== 1) throw new RuntimeException('template ' . $element . ' is not enabled');

// ── 2. Rewrite the base styles in place ──────────────────────────────────────────────────────
// In place, and this is the load-bearing half of the recipe: menu items point at a style by id
// (`#__menu.template_style_id`) and modules are assigned to menu items. Creating new styles and
// repointing would rewrite rows the contract protects; rewriting the six existing rows changes
// three columns and leaves every relationship exactly where the base archive put it.
$rewritten = 0;
$expected = [];
foreach ($styles as $style) {
    $id = $style['sourceStyleId'] ?? null;
    $title = $style['title'] ?? null;
    $overrides = $style['params'] ?? [];
    if (!is_int($id) || $id < 1 || !is_string($title) || $title === '' || !is_array($overrides))
        throw new RuntimeException('invalid style entry in activation recipe');
    $current = $db->setQuery(
        $db->getQuery(true)->select(['id', 'template', 'title', 'params', 'home', 'client_id'])
            ->from('#__template_styles')->where('id = ' . (int) $id)
    )->loadAssoc();
    if (!$current) throw new RuntimeException('base style ' . $id . ' is missing');
    if ((int) $current['client_id'] !== 0) throw new RuntimeException('base style ' . $id . ' is not a site style');
    $params = json_decode((string) $current['params'], true);
    if (!is_array($params)) throw new RuntimeException('base style ' . $id . ' has unreadable params');
    foreach ($overrides as $key => $value) {
        if (!is_string($key) || !array_key_exists($key, $params))
            throw new RuntimeException('activation may only change parameters the base style already declares: ' . $key);
        if (!is_string($value)) throw new RuntimeException('activation parameters are text');
        $params[$key] = $value;
    }
    $encoded = json_encode($params, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $expected[$id] = ['template' => $element, 'title' => $title, 'params' => $encoded];
    if ($current['template'] === $element && $current['title'] === $title && $current['params'] === $encoded) continue;
    if ($verifyOnly) throw new RuntimeException('base style ' . $id . ' does not match the activation recipe');
    // The recipe names the template it rewrites FROM, and only those two are accepted: a style
    // already carrying some third template is a site that is not the base this recipe was reviewed
    // against, and rewriting it would be guessing.
    $from = (string) ($recipe['fromTemplate'] ?? '');
    if ($current['template'] !== $element && $current['template'] !== $from)
        throw new RuntimeException('base style ' . $id . ' carries an unexpected template: ' . $current['template']);
    $db->setQuery(
        $db->getQuery(true)->update('#__template_styles')
            ->set('template = ' . $db->quote($element))
            ->set('title = ' . $db->quote($title))
            ->set('params = ' . $db->quote($encoded))
            ->where('id = ' . (int) $id)
    )->execute();
    $rewritten++;
}
$steps[] = 'styles:' . $rewritten . '/' . count($styles);

// ── 3. Drop the style Joomla's installer adds for a newly installed template ─────────────────
// It is not in the recipe, carries `JLIB_INSTALLER_DEFAULT_STYLE` as its title, and is assigned
// to nothing. Left behind it is a seventh style the profile would have to pin for no reason.
if (!empty($recipe['dropInstallerStyle'])) {
    $strays = $db->setQuery(
        $db->getQuery(true)->select(['id', 'home'])->from('#__template_styles')
            ->where('client_id = 0')
            ->where('template = ' . $db->quote($element))
            ->whereNotIn('id', array_keys($expected))
    )->loadAssocList();
    foreach ($strays as $stray) {
        if ((string) $stray['home'] !== '0') throw new RuntimeException('refusing to drop the site default style');
        if ($verifyOnly) throw new RuntimeException('an installer style survived activation');
        $db->setQuery($db->getQuery(true)->delete('#__template_styles')->where('id = ' . (int) $stray['id']))->execute();
    }
    $steps[] = 'installerStyles:' . count($strays);
}

// ── 3b. Make T4 rebuild the per-style CSS it writes lazily ───────────────────────────────────
// `media/t4/css/<styleId>.css` is compiled from the style's own parameters the first time a route
// using that style is served — so straight after an activation those files still hold the base
// design's colours, and they only change when somebody happens to visit that page. That is a
// contract problem, not a cosmetic one: the profile pins these bytes, so a site would bind green
// and then drift red on its first visitor. Regenerating them here means the site that gets bound
// is the site the profile was captured from. The output is a pure function of the locked template
// sources and the style parameters, so this is deterministic — measured by deleting and reserving
// the same route twice.
$warmed = [];
foreach (array_keys($expected) as $styleId) {
    $item = $db->setQuery(
        $db->getQuery(true)->select('MIN(id)')->from('#__menu')
            ->where('client_id = 0')->where('published = 1')->where('type = ' . $db->quote('component'))
            ->where('template_style_id = ' . (int) $styleId)
    )->loadResult();
    if (!$item) {
        // Nothing routes to this style on its own; the site default answers for it.
        $item = $db->setQuery(
            $db->getQuery(true)->select('MIN(id)')->from('#__menu')
                ->where('client_id = 0')->where('published = 1')->where('home = ' . $db->quote('1'))
        )->loadResult();
    }
    if (!$item) continue;
    $css = JPATH_ROOT . '/media/t4/css/' . (int) $styleId . '.css';
    $existed = is_file($css);
    if ($existed) @unlink($css);
    $curl = curl_init('http://127.0.0.1/index.php?Itemid=' . (int) $item);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);
    if ($status !== 200 || !is_string($body) || $body === '')
        throw new RuntimeException('route for style ' . $styleId . ' answered ' . $status . ' after activation');
    if ($existed && !is_file($css)) throw new RuntimeException('T4 did not rebuild the CSS for style ' . $styleId);
    $warmed[] = (int) $styleId;
}
$steps[] = 'warmed:' . count($warmed);

// ── 4. Verify the result, not the fact that the writes returned ──────────────────────────────
foreach ($expected as $id => $want) {
    $have = $db->setQuery(
        $db->getQuery(true)->select(['template', 'title', 'params'])->from('#__template_styles')->where('id = ' . (int) $id)
    )->loadAssoc();
    if (!$have || $have['template'] !== $want['template'] || $have['title'] !== $want['title'] || $have['params'] !== $want['params'])
        throw new RuntimeException('style ' . $id . ' did not take the activation');
}
$home = $db->setQuery(
    $db->getQuery(true)->select(['id', 'template'])->from('#__template_styles')->where('client_id = 0')->where('home = ' . $db->quote('1'))
)->loadAssoc();
if (!$home || $home['template'] !== $element) throw new RuntimeException('the site default style does not use ' . $element);
$orphans = (int) $db->setQuery(
    'SELECT COUNT(*) FROM #__menu m LEFT JOIN #__template_styles s ON s.id = m.template_style_id'
    . ' WHERE m.client_id = 0 AND m.template_style_id > 0 AND s.id IS NULL'
)->loadResult();
if ($orphans) throw new RuntimeException($orphans . ' menu items point at a style that no longer exists');

// THE MEGA MENU IS CONFIGURED BY MENU ITEM ID, AND A MISSING ID FAILS SILENTLY. T4 reads
// `etc/navigation/<profile>.json` -> `mega_settings[<menutype>][<itemId>]`, and each column names
// its children as an id list. An id that no menu item carries does not error: the column renders
// empty, or the whole item degrades to a plain dropdown, with HTTP 200 and the nav still visible.
// Measured 12/09/2026 on a translated route, where every id was the source language's and every
// lookup missed. That case is fixed in the template override; this check is for the OTHER way the
// same shape happens - a recaptured archive, a renamed menutype, a pruned item - and it turns a
// silent degradation into a refusal that names the id.
$megaMissing = [];
foreach (glob(JPATH_ROOT . '/templates/' . $element . '/etc/navigation/*.json') ?: [] as $navFile) {
    $nav = json_decode((string) file_get_contents($navFile), true);
    $mega = $nav['mega_settings'] ?? [];
    if (is_string($mega)) $mega = json_decode($mega, true) ?: [];
    if (!is_array($mega)) continue;
    $wanted = [];
    foreach ($mega as $menutype => $items) {
        if (!is_array($items)) continue;
        foreach ($items as $itemId => $config) {
            $wanted[(int) $itemId] = true;
            $columns = is_array($config) ? ($config['submenu']['items'] ?? $config['items'] ?? []) : [];
            $walk = static function ($node) use (&$walk, &$wanted) {
                if (is_string($node)) {
                    foreach (preg_split('/\s*,\s*/', $node, -1, PREG_SPLIT_NO_EMPTY) as $one) {
                        if (ctype_digit($one)) $wanted[(int) $one] = true;
                    }
                    return;
                }
                if (!is_array($node)) return;
                foreach ($node as $key => $child) {
                    if ($key === 'items' || $key === 'item') $walk($child);
                    elseif (is_array($child)) $walk($child);
                }
            };
            $walk($columns);
        }
    }
    if ($wanted === []) continue;
    $ids = array_keys($wanted);
    $present = $db->setQuery(
        'SELECT id FROM #__menu WHERE client_id = 0 AND id IN (' . implode(',', array_map('intval', $ids)) . ')'
    )->loadColumn();
    $missing = array_values(array_diff($ids, array_map('intval', $present)));
    if ($missing) $megaMissing[basename($navFile)] = $missing;
}
if ($megaMissing) {
    $detail = [];
    foreach ($megaMissing as $file => $ids) $detail[] = $file . ': ' . implode(',', $ids);
    throw new RuntimeException(
        'mega menu configuration names menu items that do not exist - ' . implode('; ', $detail)
        . '. The layout would silently fall back to a plain dropdown.'
    );
}
// Named "presence" on purpose: this proves every configured id EXISTS, not that it is the right
// language's. On a translated route every id exists and is the source language's - that case is
// the template override's, not this check's. A bare "ok" here was read as covering both.
$steps[] = 'megaMenuIdPresence:' . ($megaMissing === [] ? 'ok' : 'missing');

echo json_encode([
    'ok' => true,
    'template' => $element,
    'version' => $version,
    'activation' => (string) ($recipe['id'] ?? ''),
    'homeStyle' => (int) $home['id'],
    'steps' => $steps
]), "\n";
