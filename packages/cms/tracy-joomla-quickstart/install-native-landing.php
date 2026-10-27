<?php
/** Install a complete native landing as separate Custom modules, scoped to one Joomla menu item. */
if (PHP_SAPI !== 'cli') exit(1);
if (empty($argv[1]) || empty($argv[2])) throw new RuntimeException('Usage: php install-native-landing.php <blocks.json> <backup.json> [webroot]');
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
$pack = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$onepage = ($pack['variant'] ?? '') === 'onepage';
$layoutName = $onepage ? 'od-onepage' : 'od-landing';
$get = fn($table, $where) => $db->setQuery('SELECT * FROM #__' . $table . ' WHERE ' . $where)->loadAssoc();
$home = $get('menu', "home=1 AND client_id=0 AND language='*'");
$resources = $get('menu', "path='resources' AND published=1");
if (!$home || !$resources) throw new RuntimeException('Missing Home or Resources menu.');
$baseStyle = $get('template_styles', 'id=' . (int)$home['template_style_id']);
$template = $baseStyle['template'];
$templateRoot = JPATH_BASE . '/templates/' . $template;
$layoutPath = $templateRoot . '/etc/layout/' . $layoutName . '.json';
if (file_exists($layoutPath)) throw new RuntimeException('This layout is already installed; refusing to overwrite it.');
if (!is_file($templateRoot . '/html/mod_custom/od-landing.php')) throw new RuntimeException('Copy the native module layout first.');
if (!is_file(JPATH_BASE . '/media/tracy-landing/native-landing.css')) throw new RuntimeException('Copy the native stylesheet first.');
$baseLayout = json_decode(file_get_contents($templateRoot . '/etc/layout/landing.json'), true, 512, JSON_THROW_ON_ERROR);
$siteShell = json_decode(file_get_contents($templateRoot . '/etc/layout/no-sidebar.json'), true, 512, JSON_THROW_ON_ERROR);
$positionRow = $baseLayout['layout']['sections'][1];
$rows = [];
$rows[] = $siteShell['layout']['sections'][0];
foreach ($pack['blocks'] as $block) {
    if (!preg_match('/^[a-z-]+$/D', $block['kind'])) throw new RuntimeException('Invalid block kind.');
    $row = $positionRow;
    $position = $layoutName . '-' . $block['kind'];
    $row['name'] = $position; $row['container'] = 'none'; $row['extra_class'] = 'od-landing-row';
    $row['contents'][0]['name'] = $position; $row['contents'][0]['positions'] = $position;
    $row['contents'][0]['style'] = 'none';
    $rows[] = $row;
}
if (!$onepage) foreach ($siteShell['layout']['sections'] as $shellRow) {
    if (in_array($shellRow['name'], ['Footnav', 'Footer'], true)) $rows[] = $shellRow;
}
$baseLayout['layout']['sections'] = $rows;
$navigationPath = $templateRoot . '/etc/navigation/default.json';
$navigationBefore = file_get_contents($navigationPath);
$backup = ['home'=>$home, 'baseStyle'=>$baseStyle, 'layoutPath'=>$layoutPath, 'navigationPath'=>$navigationPath, 'navigation'=>$navigationBefore];
if (file_put_contents($argv[2], json_encode($backup, JSON_PRETTY_PRINT)) === false) throw new RuntimeException('Cannot write backup.');
$store = function ($table) { if (!$table->check() || !$table->store()) throw new RuntimeException($table->getError()); };
$db->transactionStart();
$writtenNavigation = null;
try {
    $style = $app->bootComponent('com_templates')->getMVCFactory()->createTable('Style', 'Administrator');
    $styleParams = json_decode($baseStyle['params'], true);
    $styleParams['typelist-layout'] = $layoutName;
    // Keep native CSS nesting intact; older T4 optimizers do not understand nested selectors.
    $styleParams['system_optimizecss'] = 0;
    $style->bind(['template'=>$template, 'client_id'=>0, 'home'=>0, 'title'=>$onepage ? 'Tracy · Company onepage' : 'Tracy · Complete OpenDesign landing', 'params'=>json_encode($styleParams)]);
    $store($style);
    $menu = Table::getInstance('Menu');
    if ($onepage) {
        if ($get('menu', "path='resources/home-onepage'")) throw new RuntimeException('Home - Onepage already exists.');
        $menu->setLocation((int)$resources['id'], 'last-child');
        $menu->bind(['menutype'=>$resources['menutype'], 'title'=>'Home - Onepage', 'alias'=>'home-onepage', 'link'=>$home['link'], 'type'=>'component', 'published'=>1, 'parent_id'=>(int)$resources['id'], 'component_id'=>(int)$home['component_id'], 'access'=>1, 'language'=>'*', 'client_id'=>0, 'home'=>0, 'params'=>$home['params'], 'template_style_id'=>$style->id]);
    } else {
        $menu->load($home['id']); $menu->template_style_id = $style->id;
    }
    $menuParams = json_decode($menu->params ?: '{}', true);
    $menuParams['page_title'] = $onepage ? 'Home - Onepage' : 'Home';
    $menu->params = json_encode($menuParams);
    $store($menu);
    if (!$menu->rebuildPath($menu->id)) throw new RuntimeException($menu->getError());
    $moduleIds = [];
    foreach ($pack['blocks'] as $index => $block) {
        $module = Table::getInstance('Module');
        $module->bind(['title'=>($onepage ? 'Onepage' : 'OpenDesign') . ' · ' . $block['title'], 'content'=>$block['html'], 'ordering'=>$index + 1, 'position'=>$layoutName . '-' . $block['kind'], 'published'=>1, 'module'=>'mod_custom', 'access'=>1, 'showtitle'=>0, 'client_id'=>0, 'language'=>'*', 'params'=>json_encode(['layout'=>$template . ':od-landing', 'prepare_content'=>0, 'cache'=>0])]);
        $store($module);
        $assignment = (object)['moduleid'=>$module->id, 'menuid'=>$menu->id];
        $db->insertObject('#__modules_menu', $assignment);
        $moduleIds[] = $module->id;
    }
    if ($onepage) {
        $nav = json_decode($navigationBefore, true, 512, JSON_THROW_ON_ERROR);
        $mega = json_decode($nav['mega_settings'], true, 512, JSON_THROW_ON_ERROR);
        $added = false;
        foreach ($mega[$resources['menutype']][$resources['id']]['settings'] as &$row) {
            foreach ($row['contents'] as &$column) {
                if (($column['type'] ?? '') !== 'items') continue;
                $ids = explode(',', $column['items']);
                // The existing home variation identifies the column without relying on its translated title.
                foreach ($ids as $id) {
                    $entry = $get('menu', 'id=' . (int)$id);
                    if (($entry['path'] ?? '') === 'resources/home-variation') {
                        $ids[] = (string)$menu->id; $column['items'] = implode(',', $ids); $added = true; break;
                    }
                }
            }
            unset($column);
        }
        unset($row);
        if (!$added) throw new RuntimeException('Cannot find Home variation in Resources navigation.');
        $nav['mega_settings'] = json_encode($mega);
        $writtenNavigation = json_encode($nav, JSON_PRETTY_PRINT) . "\n";
        if (file_get_contents($navigationPath) !== $navigationBefore) throw new RuntimeException('Navigation changed during installation.');
        if (file_put_contents($navigationPath, $writtenNavigation) === false) throw new RuntimeException('Cannot write navigation.');
    }
    if (file_put_contents($layoutPath, json_encode($baseLayout, JSON_PRETTY_PRINT)) === false) throw new RuntimeException('Cannot write layout.');
    $backup['created'] = ['styleId'=>$style->id, 'menuId'=>$menu->id, 'moduleIds'=>$moduleIds, 'onepage'=>$onepage];
    if (file_put_contents($argv[2], json_encode($backup, JSON_PRETTY_PRINT)) === false) throw new RuntimeException('Cannot update backup.');
    $db->transactionCommit();
    echo json_encode($backup['created'], JSON_PRETTY_PRINT) . "\n";
} catch (Throwable $error) {
    $db->transactionRollback();
    if ($writtenNavigation !== null && file_get_contents($navigationPath) === $writtenNavigation) file_put_contents($navigationPath, $navigationBefore);
    if (is_file($layoutPath)) unlink($layoutPath);
    throw $error;
}
