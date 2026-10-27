<?php
/** Trusted provisioner only: install the host-verified Claude Cowork plugin before binding the quickstart. */
if (PHP_SAPI !== 'cli') exit(1);
$_SERVER['HTTP_HOST']='localhost';
$_SERVER['REQUEST_URI']='/';
$_SERVER['SCRIPT_NAME']='/index.php';
$_SERVER['PHP_SELF']='/index.php';
define('_JEXEC', 1);
define('JPATH_BASE', '/var/www/html');
require JPATH_BASE.'/includes/defines.php';
require JPATH_BASE.'/includes/framework.php';
$container=\Joomla\CMS\Factory::getContainer();
$container->alias('session.web','session.web.site')->alias('session','session.web.site')->alias('JSession','session.web.site')->alias(\Joomla\CMS\Session\Session::class,'session.web.site')->alias(\Joomla\Session\SessionInterface::class,'session.web.site');
$app=$container->get(\Joomla\CMS\Application\SiteApplication::class);
\Joomla\CMS\Factory::$application=$app;
$app->createExtensionNamespaceMap();
$package=\Joomla\CMS\Installer\InstallerHelper::unpack('/tmp/tracy-contract-cowork.zip');
if (!$package || !\Joomla\CMS\Installer\Installer::getInstance()->install($package['dir'])) throw new RuntimeException('Contract Claude Cowork plugin installation failed');
\Joomla\CMS\Installer\InstallerHelper::cleanupInstall($package['packagefile'], $package['extractdir']);
// Rebuild the PSR-4 map ourselves. Joomla leaves it to the core plugin plg_extension_namespacemap,
// and a quickstart whose custom.sql rewrites #__extensions without that row never runs it: the map
// the CLI installer wrote a minute earlier stays, without Cowork's namespaces, and the door answers
// 500 `Class "Tracy\Plugin\System\ClaudeCoworkApi\Extension\ClaudeCoworkApi" not found`
// (quickstart/ja-intranet/j6, measured 23/09: provision died at "Cowork token probe failed").
(new \JNamespacePsr4Map())->create();
echo "Contract Claude Cowork plugin installed\n";
