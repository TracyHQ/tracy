<?php
/** Promote the native landing page while retaining each page's module assignments and style. */
if (PHP_SAPI !== 'cli') exit(1);
if (empty($argv[1])) throw new RuntimeException('Usage: php promote-landing.php <backup.json> [webroot]');
if (file_exists($argv[1])) throw new RuntimeException('Refusing to overwrite the backup.');
define('_JEXEC', 1);
define('JPATH_BASE', $argv[2] ?? '/var/www/html');
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_URI'] = '/';
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';
require JPATH_BASE . '/includes/defines.php';
require JPATH_BASE . '/includes/framework.php';
use Joomla\CMS\Factory;
use Joomla\CMS\Table\Table;
use Joomla\Database\DatabaseInterface;
use Joomla\Session\SessionInterface;
$container = Factory::getContainer();
$container->alias('session.web', 'session.web.site')->alias('session', 'session.web.site')->alias(SessionInterface::class, 'session.web.site');
$app = $container->get(Joomla\CMS\Application\SiteApplication::class);
Factory::$application = $app;
$app->createExtensionNamespaceMap();
$db = $container->get(DatabaseInterface::class);
$find = fn($where) => $db->setQuery('SELECT * FROM #__menu WHERE client_id=0 AND ' . $where)->loadAssoc();
$home = $find("home=1 AND language='*'");
$landing = $find("path='resources/landing' AND published=1");
$resources = $find("path='resources' AND published=1");
if (!$home || !$landing || !$resources || $home['id'] === $landing['id']) {
    throw new RuntimeException('Expected separate Home, Resources and native Landing menu items.');
}
if ($find("path='resources/home-variation'")) throw new RuntimeException('Home variation already exists.');
$style = $db->setQuery('SELECT template FROM #__template_styles WHERE id=' . (int)$home['template_style_id'])->loadResult();
$navigationPath = JPATH_BASE . '/templates/' . $style . '/etc/navigation/default.json';
$navigationBefore = file_get_contents($navigationPath);
$navigation = json_decode($navigationBefore, true, 512, JSON_THROW_ON_ERROR);
$mega = json_decode($navigation['mega_settings'], true, 512, JSON_THROW_ON_ERROR);
$replacementCount = 0;
foreach ($mega[$resources['menutype']][$resources['id']]['settings'] as &$row) {
    foreach ($row['contents'] as &$column) {
        if (($column['type'] ?? '') !== 'items') continue;
        $ids = explode(',', $column['items']);
        foreach ($ids as &$id) {
            if ($id === (string)$landing['id']) { $id = (string)$home['id']; $replacementCount++; }
        }
        unset($id);
        $column['items'] = implode(',', $ids);
    }
    unset($column);
}
unset($row);
if ($replacementCount !== 1) throw new RuntimeException('Expected one Landing entry in the Resources megamenu.');
$navigation['mega_settings'] = json_encode($mega);
$backup = ['home'=>$home, 'landing'=>$landing, 'navigationPath'=>$navigationPath, 'navigation'=>$navigationBefore];
if (file_put_contents($argv[1], json_encode($backup, JSON_PRETTY_PRINT)) === false) throw new RuntimeException('Cannot save backup.');
$db->transactionStart();
try {
    $oldHome = Table::getInstance('Menu');
    $oldHome->load($home['id']);
    $oldHome->setLocation((int)$resources['id'], 'last-child');
    $oldHome->bind(['home'=>0, 'parent_id'=>(int)$resources['id']]);
    if (!$oldHome->check() || !$oldHome->store()) throw new RuntimeException($oldHome->getError());
    // Nested-table moves reload fields. Rename only after the move has been stored.
    $oldHome->load($home['id']);
    $oldHome->bind(['home'=>0, 'title'=>'Home variation', 'alias'=>'home-variation']);
    if (!$oldHome->check() || !$oldHome->store() || !$oldHome->rebuildPath($oldHome->id)) throw new RuntimeException($oldHome->getError());
    $newHome = Table::getInstance('Menu');
    $newHome->load($landing['id']);
    $newHome->setLocation(1, 'first-child');
    $newHome->bind(['home'=>1, 'parent_id'=>1]);
    if (!$newHome->check() || !$newHome->store()) throw new RuntimeException($newHome->getError());
    $newHome->load($landing['id']);
    $newHome->bind(['home'=>1, 'title'=>'Home', 'alias'=>'home']);
    if (!$newHome->check() || !$newHome->store() || !$newHome->rebuildPath($newHome->id)) throw new RuntimeException($newHome->getError());
    // Check again immediately before writing; another session may be editing the menu.
    if (file_get_contents($navigationPath) !== $navigationBefore) throw new RuntimeException('Navigation changed during the update; retry with a new backup.');
    if (file_put_contents($navigationPath, json_encode($navigation, JSON_PRETTY_PRINT) . "\n") === false) throw new RuntimeException('Cannot update navigation.');
    $db->transactionCommit();
    echo json_encode(['homeMenuId'=>$newHome->id, 'variationMenuId'=>$oldHome->id, 'variationPath'=>$oldHome->path], JSON_PRETTY_PRINT) . "\n";
} catch (Throwable $error) {
    $db->transactionRollback();
    if (file_get_contents($navigationPath) === json_encode($navigation, JSON_PRETTY_PRINT) . "\n") file_put_contents($navigationPath, $navigationBefore);
    throw $error;
}
