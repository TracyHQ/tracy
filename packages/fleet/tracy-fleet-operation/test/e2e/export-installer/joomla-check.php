<?php
// Run inside the installed target by run.sh: reads the database and the config back, one PASS/FAIL line per check.
[$_, $host, $new, $old] = $argv;
$db = new mysqli($host, 'siteuser', 'sitepw', 'site');
$row = $db->query("SELECT introtext, urls FROM tr_content WHERE alias='moving-day'")->fetch_assoc();
$out = [];
$out['the article holds the new address'] = strpos($row['introtext'], "$new/about") !== false && strpos($row['introtext'], $old) === false;
$out['the JSON-escaped link holds the new address'] = json_decode($row['urls'], true)['urla'] === "$new/shop";
$out['the tracyaccess plugin is disabled'] =
    (int) $db->query("SELECT enabled FROM tr_extensions WHERE element='tracyaccess' AND folder='system'")->fetch_row()[0] === 0;
$c = file_get_contents('/var/www/html/configuration.php');
$get = function ($n) use ($c) { preg_match('/public \$' . $n . ' = \'?([^\';]*)\'?;/', $c, $m); return $m[1] ?? null; };
$out['configuration.php: database settings, no placeholder'] = strpos($c, 'tracy-placeholder') === false
    && $get('db') === 'site' && $get('user') === 'siteuser' && $get('host') === $host;
$out['configuration.php: live_site is the new address'] = $get('live_site') === $new;
$out['configuration.php: force_ssl 0, behind_loadbalancer 0, mailer mail'] =
    $get('force_ssl') === '0' && $get('behind_loadbalancer') === '0' && $get('mailer') === 'mail';
$out['configuration.php: tmp_path and log_path under the new folder'] =
    $get('tmp_path') === '/var/www/html/tmp' && $get('log_path') === '/var/www/html/administrator/logs';
$out['.htaccess is in place for SEF rewriting'] = is_file('/var/www/html/.htaccess');
foreach ($out as $what => $ok) echo ($ok ? 'PASS' : 'FAIL'), "\t", $what, "\n";
