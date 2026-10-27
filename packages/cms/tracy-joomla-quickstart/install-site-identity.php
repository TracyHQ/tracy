<?php
/**
 * Create — or normalise — the "[Tracy] Site identity" module a Tracy quickstart keeps its name,
 * contact and social links in (plg_system_tracyidentity reads it; tasks/todo-danh-tinh-site.md).
 *
 * WHY THROUGH Joomla's Table AND NOT AN INSERT. A module written by SQL has `asset_id = 0`, and the
 * first `Table\Module::store()` on it — which is what the Cowork component's content writes are —
 * creates an asset and moves `ordering` from 0 to the next free place. Both are presentation the
 * contract locks, so the very first seed of a customer's site failed with
 * "Presentation drift: module-4369 — ordering [want 0 got 1]" and left the asset behind (measured
 * 23/09/2026 on the Business 1.2.0 lab site; the same class of failure as demo-trim's 0.16.8). Stored
 * once here, before the capture, the module already is what every later store keeps it as.
 *
 * Usage: php install-site-identity.php <acm-type> <values.json> [webroot]
 *   <acm-type>   the block's `:type`, e.g. `tracy_business:site-identity`
 *   <values.json> the ACM fields (`site-name`, `phone`…) — the DEMO's values: the archive must look
 *                as it did, only now from one place
 * Run twice, it changes nothing the second time.
 */
if (PHP_SAPI !== 'cli') exit(1);
if (empty($argv[1]) || empty($argv[2])) throw new RuntimeException('Usage: php install-site-identity.php <acm-type> <values.json> [webroot]');
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

$type = $argv[1];
$block = substr($type, strrpos($type, ':') + 1);
$fields = json_decode((string) file_get_contents($argv[2]), true, 512, JSON_THROW_ON_ERROR);
$config = [':type' => $type, $block => $fields + ['jatools-layout-' . $block => 'style-1']];
$params = json_encode(['jatools-config' => json_encode($config, JSON_UNESCAPED_UNICODE), 'jatools-layout-' . $block => 'style-1', 'cache' => 0], JSON_UNESCAPED_UNICODE);

$id = (int) $db->setQuery($db->getQuery(true)->select('id')->from('#__modules')->where($db->quoteName('note') . ' = ' . $db->quote('tracy:identity'))->where('client_id = 0'))->loadResult();
$table = Table::getInstance('Module', 'Joomla\\CMS\\Table\\');
if ($id && !$table->load($id)) throw new RuntimeException('Cannot load module ' . $id);
$table->bind([
    'title' => '[Tracy] Site identity', 'note' => 'tracy:identity', 'module' => 'mod_ja_acm', 'position' => '',
    'published' => 1, 'access' => 1, 'showtitle' => 0, 'language' => '*', 'client_id' => 0, 'content' => '', 'params' => $params,
]);
if (!$table->check() || !$table->store()) throw new RuntimeException('Cannot store the identity module: ' . $table->getError());
// Assigned to no page: it renders nothing, and plg_system_tracyidentity reads it by its note.
$db->setQuery('DELETE FROM #__modules_menu WHERE moduleid = ' . (int) $table->id)->execute();
echo json_encode(['id' => (int) $table->id, 'ordering' => (int) $table->ordering, 'asset_id' => (int) $table->asset_id]), "\n";
