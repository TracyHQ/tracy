<?php
/**
 * Publish the demo disclosure in the footer of every page, and in the Onepage footer.
 *
 * Onepage renders its own layout and never reaches the global `footer` position, so a single module
 * would leave exactly one surface undisclosed — the kind of gap that passes a spot check and fails
 * the contract. Both placements are written here, in one pass, from the same fact.
 *
 * Usage: php install-site-notice.php <notice-text-file> <backup.json> [webroot]
 */
if (PHP_SAPI !== 'cli') exit(1);
if (empty($argv[1]) || empty($argv[2])) throw new RuntimeException('Usage: php install-site-notice.php <notice.txt> <backup.json> [webroot]');
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

$notice = trim(file_get_contents($argv[1]));
if ($notice === '') throw new RuntimeException('The notice text is empty.');
$onepageId = (int) $db->setQuery("SELECT id FROM #__modules WHERE position='od-onepage-footer' AND published=1")->loadResult();
$existing = $db->setQuery("SELECT * FROM #__modules WHERE title LIKE '%Global - Demo notice%' OR id=" . $onepageId)->loadAssocList();
file_put_contents($argv[2], json_encode(['modules' => $existing], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$config = json_encode([':type' => 'tracy:site-notice', 'site-notice' => [
    'site-notice[notice]' => [$notice],
    'jatools-layout-site-notice' => 'style-1',
]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$params = json_encode([
    'jatools-config' => $config,
    'jatools-layout-site-notice' => 'style-1',
    'moduleclass_sfx' => '',
    'cache' => 0,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

$db->transactionStart();
try {
    $id = (int) $db->setQuery("SELECT id FROM #__modules WHERE title='[Tracy Apple] Global - Demo notice'")->loadResult();
    $module = Table::getInstance('Module');
    if ($id) $module->load($id);
    $module->bind([
        'title' => '[Tracy Apple] Global - Demo notice',
        'module' => 'mod_ja_acm',
        'position' => 'footer',
        'content' => '',
        'showtitle' => 0,
        'published' => 1,
        'access' => 1,
        'ordering' => 9,
        'language' => '*',
        'client_id' => 0,
        'params' => $params,
    ]);
    if (!$module->check() || !$module->store()) throw new RuntimeException($module->getError());
    // menuid 0 is Joomla's "all pages" assignment; it must exist exactly once.
    $db->setQuery('DELETE FROM #__modules_menu WHERE moduleid=' . (int) $module->id)->execute();
    $db->setQuery('INSERT INTO #__modules_menu (moduleid, menuid) VALUES (' . (int) $module->id . ', 0)')->execute();

    if ($onepageId) {
        $onepage = Table::getInstance('Module');
        $onepage->load($onepageId);
        $line = '<p class="tracy-site-notice">' . htmlspecialchars($notice, ENT_QUOTES, 'UTF-8') . '</p>';
        $content = preg_replace('~<p class="tracy-site-notice">.*?</p>~s', '', (string) $onepage->content);
        $onepage->content = rtrim($content) . "\n" . $line;
        if (!$onepage->check() || !$onepage->store()) throw new RuntimeException($onepage->getError());
    }
    $db->transactionCommit();
} catch (Throwable $error) {
    $db->transactionRollback();
    throw $error;
}
echo json_encode(['moduleId' => (int) $module->id, 'onepageModuleId' => $onepageId], JSON_PRETTY_PRINT) . "\n";
