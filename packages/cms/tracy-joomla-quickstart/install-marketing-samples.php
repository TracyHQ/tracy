<?php
/** CLI-only registration through Joomla tables, preserving menu nesting and article assets. */
if (PHP_SAPI !== 'cli') exit(1);
define('_JEXEC', 1);
define('JPATH_BASE', $argv[1] ?? '/var/www/html');
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
$row = function ($table, $where) use ($db) {
    return $db->setQuery('SELECT * FROM #__' . $table . ' WHERE ' . $where)->loadAssoc();
};
$parent = $row('menu', "path='resources' AND published=1 AND client_id=0");
$reference = $row('menu', "path='resources/style-guide' AND published=1 AND client_id=0");
if (!$parent || !$reference) throw new RuntimeException('Expected Resources and Design system menu items.');
if ($row('menu', "path='resources/marketing-samples'")) throw new RuntimeException('Marketing samples already registered; existing content was not overwritten.');
$style = $row('template_styles', 'id=' . (int) $reference['template_style_id']);
$manifest = JPATH_BASE . '/media/tracy-marketing/manifest.json';
if (!is_file($manifest)) throw new RuntimeException('Build and copy the sample collection first.');
$block = JPATH_BASE . '/templates/' . $style['template'] . '/acm/marketing-samples/tmpl/style-1.php';
if (!is_file($block)) throw new RuntimeException('Install the marketing-samples ACM block first.');
$component = $row('extensions', "element='com_content' AND type='component'");
$category = $row('categories', "extension='com_content' AND published=1 AND parent_id=1");
if (!$category) throw new RuntimeException('A published article category is required.');
// No article_layout: the page is a stack of modules loaded into a minimal article, so the owner
// edits it in Module Manager. The override this replaced was baked into code.
$params = ['show_title'=>0, 'show_page_heading'=>0, 'show_author'=>0, 'show_category'=>0, 'show_publish_date'=>0, 'show_hits'=>0];
$db->transactionStart();
try {
    $article = Table::getInstance('Content');
    $article->bind(['title'=>'Marketing samples', 'alias'=>'tracy-marketing-samples',
        'introtext'=>'{loadposition marketing-samples-page}', 'fulltext'=>'',
        'state'=>1, 'catid'=>(int)$category['id'], 'access'=>1, 'language'=>'*',
        'created'=>gmdate('Y-m-d H:i:s'), 'publish_up'=>gmdate('Y-m-d H:i:s'),
        'attribs'=>json_encode($params), 'images'=>'{}', 'urls'=>'{}', 'metadata'=>'{}']);
    if (!$article->check() || !$article->store()) throw new RuntimeException($article->getError());
    $menu = Table::getInstance('Menu');
    $menu->setLocation((int)$parent['id'], 'last-child');
    $menu->bind(['menutype'=>$parent['menutype'], 'title'=>'Marketing samples', 'alias'=>'marketing-samples',
        'type'=>'component', 'link'=>'index.php?option=com_content&view=article&id=' . $article->id,
        'published'=>1, 'parent_id'=>(int)$parent['id'], 'component_id'=>(int)$component['extension_id'],
        'access'=>1, 'language'=>'*', 'client_id'=>0, 'home'=>0,
        'template_style_id'=>(int)$reference['template_style_id'], 'params'=>json_encode($params)]);
    if (!$menu->check() || !$menu->store() || !$menu->rebuildPath($menu->id)) throw new RuntimeException($menu->getError());
    $db->transactionCommit();
    echo json_encode(['articleId'=>$article->id, 'menuId'=>$menu->id, 'template'=>$style['template'], 'path'=>'resources/marketing-samples'], JSON_PRETTY_PRINT) . "\n";
} catch (Throwable $error) {
    $db->transactionRollback();
    throw $error;
}
