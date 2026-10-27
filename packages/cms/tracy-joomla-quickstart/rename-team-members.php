<?php
/**
 * Rename the four demo team members everywhere the site states them.
 *
 * The names and the portraits are one fact: a profile whose name reads against its photograph is
 * the kind of defect a field audit cannot see, because every mapped string still matches. The
 * renames therefore happen in ONE pass across articles, ACM team modules and the two Custom
 * modules, so no surface is left telling the older version of the same story.
 *
 * Article aliases are deliberately left alone — the routes are declared surfaces of the content
 * contract, and moving them would invalidate every observation recorded against them.
 */
if (PHP_SAPI !== 'cli') exit(1);
if (empty($argv[1])) throw new RuntimeException('Usage: php rename-team-members.php <backup.json> [webroot]');
if (file_exists($argv[1])) throw new RuntimeException('Backup already exists.');
define('_JEXEC', 1);
define('JPATH_BASE', $argv[2] ?? '/var/www/html');
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

$renames = ['Mai Tran' => 'Adam Hale', 'Dan Okonkwo' => 'Peter Lang', 'Ravi Menon' => 'Lucas Meyer'];
$from = array_keys($renames);
$to = array_values($renames);
$like = [];
foreach ($from as $name) $like[] = $db->quote('%' . $name . '%');
$like = implode(' OR ', array_map(fn($q) => 'CONCAT(title, introtext, `fulltext`, metadesc) LIKE ' . $q, $like));

$articles = $db->setQuery("SELECT id, title, introtext, `fulltext`, metadesc FROM #__content WHERE $like")->loadAssocList('id');
$moduleLike = implode(' OR ', array_map(fn($name) => 'CONCAT(content, params) LIKE ' . $db->quote('%' . $name . '%'), $from));
$modules = $db->setQuery("SELECT id, title, content, params FROM #__modules WHERE $moduleLike")->loadAssocList('id');
file_put_contents($argv[1], json_encode(['articles' => $articles, 'modules' => $modules], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

$db->transactionStart();
try {
    foreach ($articles as $id => $row) {
        $article = Table::getInstance('Content');
        $article->load($id);
        foreach (['title', 'introtext', 'fulltext', 'metadesc'] as $field)
            $article->$field = str_replace($from, $to, (string) $article->$field);
        if (!$article->check() || !$article->store()) throw new RuntimeException($article->getError());
    }
    foreach ($modules as $id => $row) {
        $module = Table::getInstance('Module');
        $module->load($id);
        // Params hold the ACM payload as JSON inside JSON; a plain replace is safe because a name
        // carries no character that either level escapes.
        foreach (['title', 'content', 'params'] as $field)
            $module->$field = str_replace($from, $to, (string) $module->$field);
        if (!$module->check() || !$module->store()) throw new RuntimeException($module->getError());
    }
    $db->transactionCommit();
} catch (Throwable $error) {
    $db->transactionRollback();
    throw $error;
}
echo json_encode(['articles' => array_keys($articles), 'modules' => array_keys($modules)], JSON_PRETTY_PRINT) . "\n";
