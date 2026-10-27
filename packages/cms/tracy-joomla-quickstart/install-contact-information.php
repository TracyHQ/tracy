<?php
/** Replace only the final footer content block and Contact misc panel with editable ACM modules.
 * Usage: php install-contact-information.php seed.json backup.json [webroot]
 * Files are installed separately from acm/contact-information and overrides/com_contact.
 */
if (PHP_SAPI !== 'cli' || empty($argv[1]) || empty($argv[2])) exit(1);
if (file_exists($argv[2])) throw new RuntimeException('Backup already exists');
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


$seed = json_decode(file_get_contents($argv[1]), true, 512, JSON_THROW_ON_ERROR);
if ((int)$db->setQuery("SELECT COUNT(*) FROM #__modules WHERE position='footer' AND module='mod_ja_acm' AND title='[Tracy Apple] Footer - Contact information' AND client_id=0")->loadResult()) throw new RuntimeException('Contact module already installed; edit its fields in Module Manager.');
$old = $db->setQuery("SELECT * FROM #__modules WHERE client_id=0 AND position IN ('footnav-4','footer','contact-information')")->loadAssocList();
$footerBlocks = array_values(array_filter($old, fn($m) => $m['position'] === 'footer' && $m['module'] === 'mod_custom'));
if (count($footerBlocks) !== 1) throw new RuntimeException('Expected exactly one custom content block in the final footer row');
$socialBlocks = array_values(array_filter($old, fn($m) => $m['position'] === 'footnav-4' && $m['module'] === 'mod_custom'));
if (count($socialBlocks) !== 1) throw new RuntimeException('Expected exactly one custom content block in footnav-4');
$contacts = $db->setQuery('SELECT id,misc,params FROM #__contact_details WHERE id=1')->loadAssocList();
if (count($contacts) !== 1) throw new RuntimeException('Expected demo contact 1');
$ids = array_map(fn($m)=>(int)$m['id'],$old);
$assignments = $ids ? $db->setQuery('SELECT * FROM #__modules_menu WHERE moduleid IN ('.implode(',',$ids).')')->loadAssocList() : [];
file_put_contents($argv[2], json_encode(['modules'=>$old,'assignments'=>$assignments,'contacts'=>$contacts],JSON_PRETTY_PRINT));
$fields=[];
foreach (['heading','email','email-label','notice'] as $key) $fields['contact-information['.$key.']']=[$seed[$key]];
$fields['jatools-layout-contact-information']='style-1';
$config=json_encode([':type'=>'tracy:contact-information','contact-information'=>$fields]);
$params=json_encode(['jatools-config'=>$config,'jatools-layout-contact-information'=>'style-1','cache'=>0]);
$socialFields=['social-links[heading]'=>[$seed['social-heading']],'social-links[handle]'=>[$seed['social-handle']],'social-links[platform]'=>$seed['social-platform'],'social-links[social-url]'=>$seed['social-url'],'jatools-layout-social-links'=>'style-1'];
$socialConfig=json_encode([':type'=>'tracy:social-links','social-links'=>$socialFields]);
$socialParams=json_encode(['jatools-config'=>$socialConfig,'jatools-layout-social-links'=>'style-1','cache'=>0]);
$db->transactionStart();
try {
 $footerModule=Table::getInstance('Module');
 $footerModule->load((int)$footerBlocks[0]['id']);
 $footerModule->bind(['title'=>'[Tracy Apple] Footer - Contact information','module'=>'mod_ja_acm','position'=>'footer','content'=>'','params'=>$params,'published'=>1,'showtitle'=>0,'access'=>1,'client_id'=>0,'language'=>'*','ordering'=>(int)$footerBlocks[0]['ordering']]);
 if (!$footerModule->check() || !$footerModule->store()) throw new RuntimeException($footerModule->getError());
 $db->setQuery('DELETE FROM #__modules_menu WHERE moduleid='.(int)$footerModule->id)->execute();
 $db->setQuery('INSERT INTO #__modules_menu (moduleid,menuid) VALUES ('.(int)$footerModule->id.',0)')->execute();

 $socialModule=Table::getInstance('Module');
 $socialModule->load((int)$socialBlocks[0]['id']);
 $socialModule->bind(['title'=>'[Tracy Apple] Footer - Social links','module'=>'mod_ja_acm','position'=>'footnav-4','content'=>'','params'=>$socialParams,'published'=>1,'showtitle'=>0,'access'=>1,'client_id'=>0,'language'=>'*','ordering'=>(int)$socialBlocks[0]['ordering']]);
 if (!$socialModule->check() || !$socialModule->store()) throw new RuntimeException($socialModule->getError());

 $cparams=json_decode($contacts[0]['params'],true)?:[];
 $cparams['show_misc']=0; $cparams['show_links']=0;
 foreach(['a','b','c','d','e'] as $key) { $cparams['link'.$key]=''; $cparams['link'.$key.'_name']=''; }
 $db->setQuery('UPDATE #__contact_details SET misc='.$db->quote('').',params='.$db->quote(json_encode($cparams)).' WHERE id=1')->execute();
 $db->transactionCommit();
} catch (Throwable $e) { $db->transactionRollback(); throw $e; }
$manifest=JPATH_BASE.'/templates/tracy/templateDetails.xml';
$text=file_get_contents($manifest);
if(!str_contains($text,'<position>contact-information</position>')) file_put_contents($manifest,str_replace('</positions>','<position>contact-information</position></positions>',$text));
echo json_encode(['footerModuleId'=>(int)$footerModule->id,'socialModuleId'=>(int)$socialModule->id,'preservedFooterMenus'=>true],JSON_PRETTY_PRINT)."\n";
