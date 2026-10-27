<?php
/** Run only on the disposable packaging database, immediately before its export. */
if (PHP_SAPI !== 'cli') exit(1);
require '/var/www/html/configuration.php';
$c = new JConfig();
$db = new mysqli($c->host, $c->user, $c->password, $c->db);
$p = $c->dbprefix;
if (!preg_match('/^[a-zA-Z0-9_]+$/D', $p)) throw new RuntimeException('invalid prefix');
$db->query("UPDATE {$p}extensions SET params=JSON_SET(params, '$.token', '', '$.webroot', '') WHERE element='com_claudecowork' AND type='component'");
$db->query("UPDATE {$p}users SET password='!tracy-quickstart-unconfigured', otpKey='', otep='', activation='', resetCount=0, requireReset=0");
foreach (['session', 'user_keys', 'user_mfa', 'claudecowork_apply_log', 'action_logs', 'finder_tokens', 'finder_tokens_aggregate'] as $table) {
    if ($db->query("SHOW TABLES LIKE '{$p}{$table}'")->num_rows) $db->query("DELETE FROM {$p}{$table}");
}
$check = $db->query("SELECT params FROM {$p}extensions WHERE element='com_claudecowork' AND type='component'")->fetch_row();
if ((json_decode($check[0], true)['token'] ?? null) !== '') throw new RuntimeException('token was not removed');
echo "Packaging database scrubbed; the write door remains disabled until provision.\n";
