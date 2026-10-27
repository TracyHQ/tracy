<?php
/**
 * Opt a Joomla site into the Content API reader: the site seed and the row identity registry
 * (`ContentIdentity::install`, shipped inside com_claudecowork). Two callers, both through
 * `docker compose exec -T web php < joomla-content-identity.php`, never over HTTP and never by an
 * agent: the provision (`platform/joomla.sh`, `TRACY_NEW_SITE=1` on a site's first pass), and
 * tracy-host's start-up pass over sites built before the reader existed
 * (`apps/tracy-host/src/content-identity.js`, never `TRACY_NEW_SITE`: an existing site keeps its seed).
 * A component that predates the reader carries no ContentIdentity.php: that is not a failure — the
 * site simply has no `/content.json` and the reader answers 501.
 *
 * Exit 0: enabled, or skipped (said on stdout). Exit 1: the component has the reader and the
 * install failed — the provision stops rather than hand over a half-registered site.
 * The last stdout line names the outcome for a machine: `TRACY_RESULT content_reader=<enabled |
 * none | unsupported | outdated>` (the provision reads the exit code only).
 */
if (PHP_SAPI !== 'cli') exit(1);
$root = '/var/www/html';
$lib = $root . '/administrator/components/com_claudecowork/lib/ContentIdentity.php';
if (!is_file($lib)) {
    echo "    content reader: this Cowork component has none — skipped\n";
    echo "TRACY_RESULT content_reader=none\n";
    exit(0);
}
define('_JEXEC', 1);
define('JPATH_BASE', $root);
require JPATH_BASE . '/includes/defines.php';
require JPATH_BASE . '/includes/framework.php';
if (explode('.', JVERSION)[0] !== '6') {
    echo "    content reader: Joomla " . JVERSION . " is not supported by the reader — skipped\n";
    echo "TRACY_RESULT content_reader=unsupported\n";
    exit(0);
}
try {
    $db = \Joomla\CMS\Factory::getContainer()->get(\Joomla\Database\DatabaseInterface::class);
    require $lib;
    // A reader from 0.18.0-rc.1 to rc.6 is not installed: its install() puts a trigger on #__menu,
    // which Joomla writes under LOCK TABLES, and MariaDB then refuses every menu item insert and
    // delete (error 1442) — by an agent, by an administrator, and the component's own update
    // (measured 26/09/2026). From rc.7 pages carry no trigger (`ContentIdentity::TRIGGERED`). Such a
    // site is skipped until its component is upgraded.
    if (!defined('ContentIdentity::TRIGGERED') || in_array('menu', ContentIdentity::TRIGGERED, true)) {
        echo "    content reader: this Cowork component's reader would lock Joomla's menu table — skipped until the component is upgraded\n";
        echo "TRACY_RESULT content_reader=outdated\n";
        exit(0);
    }
    // The first pass of a provision is a NEW site (TRACY_NEW_SITE=1): a seed copied with the archive
    // must not be shared with other sites. A later pass keeps the seed it already got, and so does
    // an existing site (INSERT IGNORE: a seed is created only where there is none).
    ContentIdentity::install($db, getenv('TRACY_NEW_SITE') === '1');
} catch (\Throwable $e) {
    fwrite(STDERR, '!! content reader could not be enabled: ' . $e->getMessage() . "\n");
    exit(1);
}
echo "    content reader: enabled (" . (getenv('TRACY_NEW_SITE') === '1' ? 'new site seed' : 'seed kept') . ", identity registry installed)\n";
echo "TRACY_RESULT content_reader=enabled\n";
