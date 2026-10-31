<?php
/**
 * After "Sync from live" put a merged database in place (`webroot-sync.sh --op apply`), what Joomla
 * itself must do for the result to read right. Run inside the site's web container, as
 * `docker compose exec -T -e TRACY_SYNC_REBUILD=<tables> web php < sync-joomla-after.php`.
 *
 *   rebuild  the nested sets the merge took rows into (TRACY_SYNC_REBUILD, comma-separated names
 *            without the prefix: menu, categories, assets, tags). The merge never compares or
 *            merges `lft`/`rgt`/`level`/`path` (lib/live_sync.py `derivedColumns`): Joomla's own
 *            `rebuild()` recomputes them from `parent_id`, the way Joomla's own admin does.
 *   cache    the site's and the administrator's page and module cache, which still hold pages
 *            rendered from the database the merge replaced.
 *
 * Exit 0 always; the last stdout line names each outcome for a machine:
 * `TRACY_RESULT rebuild=<name:ok|failed|unknown,…> cache=<cleared|failed>`.
 */
if (PHP_SAPI !== 'cli') exit(1);
define('_JEXEC', 1);
// The site's web root in its web container; a test names its own stand-in tree.
define('JPATH_BASE', getenv('TRACY_JOOMLA_ROOT') ?: '/var/www/html');
require JPATH_BASE . '/includes/defines.php';
require JPATH_BASE . '/includes/framework.php';

if (method_exists(\Joomla\CMS\Factory::class, 'getContainer')) {
    // An application, as `demo-contact/install.php` makes one: Joomla 6's Menu table reads it in
    // `rebuild()` (its language and client), and without one every menu rebuild threw "Failed to
    // start application" — the copy kept the merged lft/rgt, two menus on one edge (20/10/2026).
    $_SERVER['HTTP_HOST'] = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $container = \Joomla\CMS\Factory::getContainer();
    $container->alias('session.web', 'session.web.administrator')->alias('session', 'session.web.administrator')->alias('JSession', 'session.web.administrator')->alias(\Joomla\CMS\Session\Session::class, 'session.web.administrator')->alias(\Joomla\Session\SessionInterface::class, 'session.web.administrator');
    $app = $container->get(\Joomla\CMS\Application\AdministratorApplication::class);
    \Joomla\CMS\Factory::$application = $app;
    $app->loadIdentity(new \Joomla\CMS\User\User());
    $app->createExtensionNamespaceMap();
    $db = $container->get(\Joomla\Database\DatabaseInterface::class);
    $tagTable = 'Joomla\\Component\\Tags\\Administrator\\Table\\TagTable';
} else {
    // Joomla 3 has no service container, and its nested tables rebuild from the database alone: no
    // application is started (one would start a session). Every sync of a Joomla 3 site had ended
    // SYNC_AFTER_FAILED on `getContainer()` though its data was in place (#217).
    $db = \Joomla\CMS\Factory::getDbo();
    $tagTable = 'TagsTableTag';
    if (!class_exists($tagTable) && is_file(JPATH_ADMINISTRATOR . '/components/com_tags/tables/tag.php')) {
        require_once JPATH_ADMINISTRATOR . '/components/com_tags/tables/tag.php';
    }
}
$tables = [
    'menu' => \Joomla\CMS\Table\Menu::class,
    'categories' => \Joomla\CMS\Table\Category::class,
    'assets' => \Joomla\CMS\Table\Asset::class,
    'tags' => $tagTable,
];
$said = [];
foreach (array_filter(explode(',', (string) getenv('TRACY_SYNC_REBUILD'))) as $name) {
    $class = $tables[$name] ?? null;
    if ($class === null || !class_exists($class)) {
        $said[] = "$name:unknown";
        continue;
    }
    try {
        $table = new $class($db);
        $said[] = $name . ':' . ($table->rebuild() === false ? 'failed' : 'ok');
    } catch (\Throwable $e) {
        fwrite(STDERR, "!! rebuild of $name failed: " . $e->getMessage() . "\n");
        $said[] = "$name:failed";
    }
}

$cache = 'cleared';
foreach ([JPATH_BASE . '/cache', JPATH_BASE . '/administrator/cache'] as $dir) {
    if (!is_dir($dir)) continue;
    $walk = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($walk as $item) {
        // Joomla ships an index.html in each cache folder so it is never listed; it stays.
        if ($item->getFilename() === 'index.html' && $item->getPath() === $dir) continue;
        if (!($item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname()))) $cache = 'failed';
    }
}

echo 'TRACY_RESULT rebuild=' . (implode(',', $said) ?: 'none') . " cache=$cache\n";
