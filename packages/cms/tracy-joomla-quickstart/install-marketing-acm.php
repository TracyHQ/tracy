<?php
/**
 * Turn the Marketing samples page from one baked article into an ACM module the owner can edit.
 *
 * Seeded from `manifest.json`, which the builder writes from the site content contract — so the
 * module starts out saying exactly what the compiled plan says, and every later word is an admin
 * field. The article keeps its route and menu item; its body becomes a single `{loadposition}`.
 *
 * Usage: php install-marketing-acm.php <manifest.json> <backup.json> [webroot] [article-id] [menu-id]
 */
if (PHP_SAPI !== 'cli') exit(1);
if (empty($argv[1]) || empty($argv[2])) throw new RuntimeException('Usage: php install-marketing-acm.php <manifest.json> <backup.json> [webroot] [article] [menu]');
if (file_exists($argv[2])) throw new RuntimeException('Backup already exists.');
define('_JEXEC', 1);
define('JPATH_BASE', $argv[3] ?? '/var/www/html');
$_SERVER['HTTP_HOST'] = 'localhost'; $_SERVER['REQUEST_URI'] = '/';
$_SERVER['SCRIPT_NAME'] = '/index.php'; $_SERVER['PHP_SELF'] = '/index.php';
require JPATH_BASE . '/includes/defines.php'; require JPATH_BASE . '/includes/framework.php';
use Joomla\CMS\Factory;
use Joomla\CMS\Table\Table;
use Joomla\Database\DatabaseInterface;
use Joomla\Session\SessionInterface;
$container = Factory::getContainer();
$container->alias('session.web', 'session.web.site')->alias('session', 'session.web.site')->alias(SessionInterface::class, 'session.web.site');
$app = $container->get(Joomla\CMS\Application\SiteApplication::class);
Factory::$application = $app; $app->createExtensionNamespaceMap();
$db = $container->get(DatabaseInterface::class);

$manifest = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$articleId = (int) ($argv[4] ?? 83);
$menuId = (int) ($argv[5] ?? 325);
$position = 'marketing-samples-page';

$article = $db->setQuery('SELECT * FROM #__content WHERE id=' . $articleId)->loadAssoc();
if (!$article) throw new RuntimeException('Marketing samples article not found.');
// The layout override is pinned in TWO places and the menu item wins: clearing only the article
// leaves the old baked layout rendering and the new module invisible, with no error anywhere.
$menu = $db->setQuery('SELECT * FROM #__menu WHERE id=' . $menuId)->loadAssoc();
if (!$menu) throw new RuntimeException('Marketing samples menu item not found.');
$existing = $db->setQuery('SELECT * FROM #__modules WHERE position=' . $db->quote($position))->loadAssocList();
file_put_contents($argv[2], json_encode(['article' => $article, 'menu' => $menu, 'modules' => $existing], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
if ($existing) throw new RuntimeException('A module already occupies ' . $position . '; existing content was not overwritten.');

// The ACM payload is JSON inside a params JSON string, with every field addressed as name[field]
// and every value an array — one entry per repeatable row.
$fields = [
    'marketing-samples[eyebrow]' => [$manifest['name'] . ' · Creative collection'],
    'marketing-samples[heading]' => ['One identity. Every message.'],
    'marketing-samples[lead]' => [$manifest['summary']],
    'marketing-samples[note]' => [$manifest['disclosure'] . ' Forms, subscriptions and campaign actions are previews; no information is submitted.'],
    'marketing-samples[base]' => ['media/tracy-marketing/'],
    'marketing-samples[appearance-label]' => ['Appearance'],
    'marketing-samples[light-label]' => ['Light'],
    'marketing-samples[dark-label]' => ['Dark'],
    'marketing-samples[open-label]' => ['Open full page ↗'],
    'marketing-samples[download-label]' => ['Download HTML ↓'],
    'marketing-samples[sample-key]' => array_column($manifest['samples'], 'kind'),
    'marketing-samples[sample-title]' => array_column($manifest['samples'], 'title'),
    'marketing-samples[sample-description]' => array_column($manifest['samples'], 'description'),
    'jatools-layout-marketing-samples' => 'style-1',
];
$config = json_encode([':type' => 'tracy:marketing-samples', 'marketing-samples' => $fields], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$params = json_encode([
    'jatools-config' => $config,
    'jatools-layout-marketing-samples' => 'style-1',
    'moduleclass_sfx' => '',
    'cache' => 0,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

$db->transactionStart();
try {
    $module = Table::getInstance('Module');
    $module->bind([
        'title' => '[Tracy Apple] Marketing samples - Collection',
        'module' => 'mod_ja_acm',
        'position' => $position,
        'content' => '',
        'showtitle' => 0,
        'published' => 1,
        'access' => 1,
        'ordering' => 1,
        'language' => '*',
        'client_id' => 0,
        'params' => $params,
    ]);
    if (!$module->check() || !$module->store()) throw new RuntimeException($module->getError());
    // Assignment mode "only on the pages selected": the collection belongs to its own menu item.
    $db->setQuery('INSERT INTO #__modules_menu (moduleid, menuid) VALUES (' . (int) $module->id . ', ' . $menuId . ')')->execute();

    $content = Table::getInstance('Content');
    $content->load($articleId);
    $content->introtext = '{loadposition ' . $position . '}';
    $content->fulltext = '';
    $attribs = json_decode((string) $content->attribs, true) ?: [];
    unset($attribs['article_layout']);
    $content->attribs = json_encode($attribs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!$content->check() || !$content->store()) throw new RuntimeException($content->getError());

    $item = Table::getInstance('Menu');
    $item->load($menuId);
    $menuParams = json_decode((string) $item->params, true) ?: [];
    unset($menuParams['article_layout']);
    $item->params = json_encode($menuParams, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $item->setLocation((int) $item->parent_id, 'last-child');
    if (!$item->check() || !$item->store()) throw new RuntimeException($item->getError());
    $db->transactionCommit();
} catch (Throwable $error) {
    $db->transactionRollback();
    throw $error;
}
echo json_encode(['moduleId' => (int) $module->id, 'position' => $position, 'menuId' => $menuId, 'articleId' => $articleId], JSON_PRETTY_PRINT) . "\n";
