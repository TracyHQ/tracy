<?php
// Read Joomla's own User Actions Log (#__action_logs) after a cursor, for tracy-host's
// `cms-log-pull` job (apps/tracy-host/src/cms-log.js maps, filters and advances the cursor).
// SELECT only. What leaves the container: the row id, its language key, extension, user id, item
// id, UTC date, the action-log type title, the user's display name, and a fixed subset of the message JSON (no IP, no
// account links). The host decides which rows are people; this file only reads.
ini_set('display_errors', '0');
require '/var/www/html/configuration.php';
$c = new JConfig();
if (!preg_match('/^[A-Za-z0-9_]+$/', $c->dbprefix)) exit(1);
$p = $c->dbprefix;
$cursor = getenv('TRACY_CMS_LOG_CURSOR');
$cursor = ($cursor !== false && preg_match('/^[0-9]{1,18}$/', $cursor)) ? (int)$cursor : 0;
$limit = 500;
$db = new mysqli($c->host, $c->user, $c->password, $c->db);
$db->set_charset('utf8mb4');

// Coverage: the log only fills while the component and both plugins that write it are enabled.
$on = $db->query("SELECT
  (SELECT enabled FROM {$p}extensions WHERE type='component' AND element='com_actionlogs' LIMIT 1) AS component,
  (SELECT enabled FROM {$p}extensions WHERE type='plugin' AND folder='system' AND element='actionlogs' LIMIT 1) AS system_plugin,
  (SELECT enabled FROM {$p}extensions WHERE type='plugin' AND folder='actionlog' AND element='joomla' LIMIT 1) AS joomla_plugin")->fetch_assoc();
$max = $db->query("SELECT COALESCE(MAX(id), 0) AS m FROM {$p}action_logs")->fetch_assoc();
$maxId = (int)$max['m'];
// A cursor past the newest id means the table was emptied (TRUNCATE resets the counter): read
// from the start again and say so. The host's row key carries the date, so a reused id is a new row.
$reset = $cursor > $maxId;
if ($reset) $cursor = 0;
$now = $db->query("SELECT UTC_TIMESTAMP() AS n")->fetch_assoc();

$stmt = $db->prepare("SELECT l.id, l.message_language_key, l.message, l.log_date, l.extension, l.user_id, l.item_id,
  cfg.type_title, u.name AS user_name
  FROM {$p}action_logs l
  LEFT JOIN {$p}action_log_config cfg ON cfg.type_alias = l.extension
  LEFT JOIN {$p}users u ON u.id = l.user_id
  WHERE l.id > ? ORDER BY l.id ASC LIMIT ?");
$stmt->bind_param('ii', $cursor, $limit);
$stmt->execute();
$result = $stmt->get_result();
$rows = [];
while ($r = $result->fetch_assoc()) {
  $m = json_decode($r['message'] ?? '', true);
  if (!is_array($m)) $m = [];
  $keep = [];
  foreach (['action', 'type', 'id', 'title', 'name', 'extension_name', 'username', 'app'] as $k) {
    if (array_key_exists($k, $m) && (is_scalar($m[$k]) || $m[$k] === null)) $keep[$k] = $m[$k];
  }
  $rows[] = ['id' => (int)$r['id'], 'key' => (string)$r['message_language_key'],
    'extension' => (string)$r['extension'], 'userId' => (int)$r['user_id'], 'itemId' => (int)$r['item_id'],
    'logDate' => (string)$r['log_date'], 'typeTitle' => $r['type_title'], 'userName' => $r['user_name'],
    'message' => $keep];
}
echo json_encode(['ok' => true, 'platform' => 'joomla', 'now' => $now['n'], 'maxId' => $maxId, 'reset' => $reset,
  'enabled' => ['component' => (int)$on['component'] === 1, 'systemPlugin' => (int)$on['system_plugin'] === 1,
    'joomlaPlugin' => (int)$on['joomla_plugin'] === 1],
  'rows' => $rows], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n";
