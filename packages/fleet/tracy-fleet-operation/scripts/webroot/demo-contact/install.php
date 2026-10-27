<?php
/** Install only on the explicitly selected Website Opportunities site, never on a template demo or ordinary build. */
if (PHP_SAPI !== 'cli') exit(1);
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['REQUEST_URI'] = '/';
$root = '/var/www/html';
$view = $root . '/templates/tracy_business/html/com_contact/contact/default.php';
if (!is_file($view)) { echo json_encode(['ok' => true, 'skipped' => 'unsupported-template']) . "\n"; exit; }
$before = file_get_contents($view);
require __DIR__ . '/view-patch.php';
$after = tracy_demo_contact_view($before);

define('_JEXEC', 1);
define('JPATH_BASE', $root);
require $root . '/includes/defines.php';
require $root . '/includes/framework.php';
$container = \Joomla\CMS\Factory::getContainer();
$container->alias('session.web', 'session.web.administrator')->alias('session', 'session.web.administrator')->alias('JSession', 'session.web.administrator')->alias(\Joomla\CMS\Session\Session::class, 'session.web.administrator')->alias(\Joomla\Session\SessionInterface::class, 'session.web.administrator');
$app = $container->get(\Joomla\CMS\Application\AdministratorApplication::class);
\Joomla\CMS\Factory::$application = $app;
$app->loadIdentity(new \Joomla\CMS\User\User());
$app->createExtensionNamespaceMap();
$db = $container->get(\Joomla\Database\DatabaseInterface::class);
$installer = new \Joomla\CMS\Installer\Installer();
$installer->setDatabase($db);
if (!$installer->install(__DIR__)) throw new RuntimeException('Could not install demo contact preview');
$extension = new \Joomla\CMS\Table\Extension($db);
if (!$extension->load(['type' => 'plugin', 'folder' => 'system', 'element' => 'tracydemocontact'])) throw new RuntimeException('Installed plugin not found');
$extension->enabled = 1;
if (!$extension->check() || !$extension->store()) throw new RuntimeException('Could not enable demo contact preview');
if ($after !== $before) {
    if (file_get_contents($view) !== $before) throw new RuntimeException('Contact view changed during installation; retry');
    $temp = tempnam(dirname($view), '.tracy-contact-');
    try {
        if (file_put_contents($temp, $after) === false || !chmod($temp, fileperms($view) & 0777) || !rename($temp, $view)) throw new RuntimeException('Could not update contact view');
    } finally {
        if (is_file($temp)) unlink($temp);
    }
}
echo json_encode(['ok' => true, 'preview' => true]) . "\n";
