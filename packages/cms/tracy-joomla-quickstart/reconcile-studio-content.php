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
$homePack = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
$onePack = json_decode(file_get_contents($argv[4]), true, 512, JSON_THROW_ON_ERROR);
$templateRoot = JPATH_BASE . '/templates/tracy';
$layoutFile = $templateRoot . '/etc/layout/od-onepage.json';
$homeLayout = json_decode(file_get_contents($templateRoot . '/etc/layout/od-landing.json'), true);
$layout = json_decode(file_get_contents($layoutFile), true);
$style = $db->setQuery('SELECT * FROM #__template_styles WHERE id=118')->loadAssoc();
$modules = $db->setQuery("SELECT * FROM #__modules WHERE position LIKE 'od-landing-%' OR position LIKE 'od-onepage-%'")->loadAssocList();
file_put_contents($argv[2], json_encode(['style'=>$style,'modules'=>$modules,'layout'=>$layout], JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
$db->transactionStart();
try {
  foreach ([['od-landing-', $homePack], ['od-onepage-', $onePack]] as [$prefix, $pack]) {
    foreach ($pack['blocks'] as $block) {
      if ($block['kind']==='header' && $prefix==='od-onepage-') continue;
      $id=$db->setQuery('SELECT m.id FROM #__modules m JOIN #__modules_menu mm ON mm.moduleid=m.id WHERE m.published=1 AND mm.menuid='.($prefix==='od-landing-' ? 247 : 330).' AND m.position='.$db->quote($prefix.$block['kind']))->loadResult();
      if (!$id) throw new RuntimeException('Missing module '.$prefix.$block['kind']);
      $module=Table::getInstance('Module'); $module->load($id); $module->content=$block['html'];
      if (!$module->check() || !$module->store()) throw new RuntimeException($module->getError());
    }
  }
  $menutype='tracy-onepage';
  foreach ($db->setQuery("SELECT id FROM #__menu WHERE menutype='tracy-onepage' AND alias='about'")->loadColumn() as $legacyId) { $legacy=Table::getInstance('Menu'); $legacy->load($legacyId); $legacy->published=0; $legacy->store(); }
  if (!$db->setQuery('SELECT id FROM #__menu_types WHERE menutype='.$db->quote($menutype))->loadResult()) {
    $type=Table::getInstance('MenuType'); $type->bind(['menutype'=>$menutype,'title'=>'Home - Onepage','description'=>'Section navigation for the company introduction.']);
    if (!$type->check() || !$type->store()) throw new RuntimeException($type->getError());
  }
  foreach (['About'=>'about','Services'=>'services','Product'=>'product','Team'=>'team','Contact'=>'contact'] as $title=>$anchor) {
    if ($db->setQuery('SELECT id FROM #__menu WHERE menutype='.$db->quote($menutype).' AND alias='.$db->quote('onepage-'.$anchor))->loadResult()) continue;
    $menu=Table::getInstance('Menu'); $menu->setLocation(1,'last-child');
    $menu->bind(['menutype'=>$menutype,'title'=>$title,'alias'=>'onepage-'.$anchor,'link'=>'/resources/home-onepage#'.$anchor,'type'=>'url','published'=>1,'parent_id'=>1,'level'=>1,'access'=>1,'language'=>'*','client_id'=>0,'home'=>0,'params'=>'{}']);
    if (!$menu->check() || !$menu->store()) throw new RuntimeException($menu->getError());
  }
  $position='onepage-offcanvas';
  if (!$db->setQuery('SELECT id FROM #__modules WHERE position='.$db->quote($position))->loadResult()) {
    $module=Table::getInstance('Module');
    $module->bind(['title'=>'Home - Onepage navigation','module'=>'mod_menu','position'=>$position,'published'=>1,'access'=>1,'showtitle'=>0,'client_id'=>0,'language'=>'*','params'=>json_encode(['menutype'=>$menutype,'startLevel'=>1,'endLevel'=>1,'showAllChildren'=>0,'layout'=>'_:default','cache'=>0])]);
    if (!$module->check() || !$module->store()) throw new RuntimeException($module->getError());
    $assignment=(object)['moduleid'=>$module->id,'menuid'=>330];$db->insertObject('#__modules_menu',$assignment);
  }
  $nav=json_decode(file_get_contents($templateRoot.'/etc/navigation/default.json'),true);
  $nav['menu_type']=$menutype; $nav['oc_pos_name']=$position;
  foreach(array_keys($nav) as $key) if(str_contains($key,'mega')) unset($nav[$key]);
  file_put_contents($templateRoot.'/etc/navigation/onepage.json',json_encode($nav,JSON_PRETTY_PRINT));
  $params=json_decode($style['params'],true); $params['typelist-navigation']='onepage';
  $table=$app->bootComponent('com_templates')->getMVCFactory()->createTable('Style','Administrator');
  $table->load(118);$table->params=json_encode($params);if(!$table->store())throw new RuntimeException($table->getError());
  $layout['layout']['sections'][0]=$homeLayout['layout']['sections'][0];
  file_put_contents($layoutFile,json_encode($layout,JSON_PRETTY_PRINT));
  $db->transactionCommit();
  echo "Updated studio copy and installed Joomla Onepage navigation using the site header.\n";
} catch (Throwable $e) { $db->transactionRollback(); file_put_contents($layoutFile,json_encode(json_decode(file_get_contents($argv[2]),true)['layout'])); throw $e; }
