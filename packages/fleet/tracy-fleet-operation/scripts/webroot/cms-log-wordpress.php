<?php
// Read Tracy's WordPress admin log (<prefix>tracy_admin_log) after a cursor, for tracy-host's
// `cms-log-pull` job (apps/tracy-host/src/cms-log.js, which documents the table contract). The
// hook that writes the table lives in tracy-access.php (site changes plan P2.1); until it has
// created the table this answers `installed: false`. SELECT only.
//
// Schema 2 of the table (hook 0.3.0) adds `producer_version`, `producer_hash` and `context` per
// row — which hook wrote it, and whether inside WP-Cron (Site changes V2, contract D1). They are
// selected only when the table has them, so a site whose hook is still schema 1 reads as before
// and its rows reach Tracy with no producer (legacy).
//
// No table is not the same as no hook: the hook creates the table on the FIRST action it logs, so
// a site nobody has edited in the admin yet has the hook and no table. `hook` says which: the
// must-use plugin file is there and is a version that keeps the log (F-L4-5, Site changes V2).
ini_set('display_errors', '0');
ob_start();
define('SHORTINIT', true);
// The site's root; `TRACY_CMS_LOG_WP_ROOT` exists for the adapter's own test (a stub WordPress).
$wpRoot = getenv('TRACY_CMS_LOG_WP_ROOT') ?: '/var/www/html';
require $wpRoot . '/wp-load.php';
global $wpdb;
$table = $wpdb->prefix . 'tracy_admin_log';
$cursor = getenv('TRACY_CMS_LOG_CURSOR');
$cursor = ($cursor !== false && preg_match('/^[0-9]{1,18}$/', $cursor)) ? (int)$cursor : 0;
$installed = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($table))) === $table;
$answer = ['ok' => true, 'platform' => 'wordpress', 'installed' => $installed];
if (!$installed) {
  $muDir = defined('WPMU_PLUGIN_DIR') ? WPMU_PLUGIN_DIR
    : (defined('WP_CONTENT_DIR') ? WP_CONTENT_DIR : $wpRoot . '/wp-content') . '/mu-plugins';
  $hookFile = $muDir . '/tracy-access.php';
  $source = is_file($hookFile) ? (string) @file_get_contents($hookFile, false, null, 0, 262144) : '';
  $logs = $source !== '' && strpos($source, 'tracy_admin_log_insert') !== false;
  $version = preg_match('/^\s*\*\s*Version:\s*([0-9A-Za-z.+-]{1,32})\s*$/m', $source, $m) ? $m[1] : null;
  $answer['hook'] = ['present' => $logs, 'version' => $logs ? $version : null];
}
if ($installed) {
  $maxId = (int)$wpdb->get_var("SELECT COALESCE(MAX(id), 0) FROM `$table`");
  $reset = $cursor > $maxId;
  if ($reset) $cursor = 0;
  $columns = array_map('strval', (array) $wpdb->get_col("SHOW COLUMNS FROM `$table`"));
  $select = 'id, at, user_id, user_name, type, resource_type, resource_id, resource_title, op';
  foreach (['producer_version', 'producer_hash', 'context'] as $column) {
    if (in_array($column, $columns, true)) $select .= ", $column";
  }
  $rows = $wpdb->get_results($wpdb->prepare(
    "SELECT $select FROM `$table` WHERE id > %d ORDER BY id ASC LIMIT 500", $cursor), ARRAY_A);
  $rows = array_map(function ($r) { $r['id'] = (int)$r['id']; $r['user_id'] = (int)$r['user_id']; return $r; }, $rows ?: []);
  // E5.1c: an upload names the files it wrote — the attachment's own file and the sizes WordPress made
  // of it, relative to the webroot — so Site changes can fold the seal of those files into this row.
  // Read off the attachment as it stands at the pull; a file name that is not a plain name is dropped.
  $uploadIds = [];
  foreach ($rows as $r) {
    if (($r['resource_type'] ?? '') === 'attachment' && ($r['op'] ?? '') === 'upload'
        && preg_match('/^[0-9]{1,18}$/', (string)($r['resource_id'] ?? ''))) $uploadIds[] = (int)$r['resource_id'];
  }
  $contentDir = defined('WP_CONTENT_DIR') ? WP_CONTENT_DIR : $wpRoot . '/wp-content';
  $root = rtrim($wpRoot, '/') . '/';
  $uploadsRel = strpos($contentDir . '/uploads', $root) === 0 ? substr($contentDir . '/uploads', strlen($root)) : null;
  if ($uploadIds && $uploadsRel !== null && isset($wpdb->postmeta)) {
    $meta = $wpdb->get_results('SELECT post_id, meta_key, meta_value FROM `' . $wpdb->postmeta . '`'
      . " WHERE meta_key IN ('_wp_attached_file', '_wp_attachment_metadata')"
      . ' AND post_id IN (' . implode(',', array_unique($uploadIds)) . ')', ARRAY_A) ?: [];
    $byPost = [];
    foreach ($meta as $m) $byPost[(int)$m['post_id']][(string)$m['meta_key']] = $m['meta_value'];
    $plain = function ($name) { return is_string($name) && $name !== '' && strpos($name, '/') === false && strpos($name, '..') === false; };
    foreach ($rows as &$r) {
      if (($r['resource_type'] ?? '') !== 'attachment' || ($r['op'] ?? '') !== 'upload') continue;
      $m = $byPost[(int)$r['resource_id']] ?? null;
      $file = is_array($m) ? (string)($m['_wp_attached_file'] ?? '') : '';
      if ($file === '' || strpos($file, '..') !== false || $file[0] === '/') continue;
      $dir = dirname($file) === '.' ? '' : dirname($file) . '/';
      $files = [$uploadsRel . '/' . $file];
      $data = maybe_unserialize($m['_wp_attachment_metadata'] ?? '');
      if (is_array($data)) {
        foreach ((array)($data['sizes'] ?? []) as $size) {
          if (is_array($size) && $plain($size['file'] ?? null)) $files[] = $uploadsRel . '/' . $dir . $size['file'];
        }
        if ($plain($data['original_image'] ?? null)) $files[] = $uploadsRel . '/' . $dir . $data['original_image'];
      }
      $r['files'] = array_slice(array_values(array_unique($files)), 0, 50);
    }
    unset($r);
  }
  $answer += ['now' => $wpdb->get_var('SELECT UTC_TIMESTAMP()'), 'maxId' => $maxId, 'reset' => $reset,
    'rows' => $rows];
}
ob_end_clean();
echo json_encode($answer, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n";
