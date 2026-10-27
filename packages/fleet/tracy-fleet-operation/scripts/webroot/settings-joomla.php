<?php
ini_set('display_errors', '0');
require '/var/www/html/configuration.php';
$c = new JConfig();
$db = new mysqli($c->host, $c->user, $c->password, $c->db);
$db->set_charset('utf8mb4');
if (!preg_match('/^[A-Za-z0-9_]+$/', $c->dbprefix)) exit(1);
$xml = simplexml_load_file('/var/www/html/administrator/manifests/files/joomla.xml');
$language = $db->query("SELECT params FROM {$c->dbprefix}extensions WHERE type='component' AND element='com_languages'")->fetch_assoc();
$style = $db->query("SELECT title FROM {$c->dbprefix}template_styles WHERE client_id=0 AND home='1' LIMIT 1")->fetch_assoc();
$languages = $db->query("SELECT COUNT(*) AS n FROM {$c->dbprefix}languages WHERE published=1")->fetch_assoc();
echo json_encode(['ok'=>true, 'platform'=>'joomla', 'version'=>(string)$xml->version,
 'title'=>$c->sitename, 'timezone'=>$c->offset, 'sef'=>(bool)$c->sef,
 'language'=>json_decode($language['params'] ?? '{}', true)['site'] ?? null,
 'languages'=>(int)$languages['n'], 'template'=>$style['title'] ?? null], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n";
