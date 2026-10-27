<?php
// A stub WordPress for `cms-log-wordpress.php` (test/wordpress-cms-log-adapter.test.mjs): just the
// `$wpdb` calls the adapter makes, over an in-memory log table that exists only when
// STUB_TABLE=yes. STUB_MU is the must-use plugin directory the adapter looks in.
define('ARRAY_A', 'ARRAY_A');
define('WPMU_PLUGIN_DIR', getenv('STUB_MU') ?: '/nonexistent');
// STUB_ATTACH=yes: the log holds one upload (attachment 88) and postmeta its file and sizes (E5.1c).
if (!function_exists('maybe_unserialize')) {
  function maybe_unserialize($v) { $u = @unserialize($v); return $u === false && $v !== 'b:0;' ? $v : $u; }
}
class Stub_Adapter_Wpdb {
  public $prefix = 'wp_';
  public $postmeta = 'wp_postmeta';
  private $table;
  public function __construct() { $this->table = getenv('STUB_TABLE') === 'yes'; }
  public function esc_like($s) { return $s; }
  public function prepare($q, ...$a) { return vsprintf(str_replace(['%s', '%d'], ["'%s'", '%d'], $q), $a); }
  public function get_var($q) {
    if (str_starts_with($q, 'SHOW TABLES')) return $this->table ? 'wp_tracy_admin_log' : null;
    if (str_contains($q, 'MAX(id)')) return $this->table ? '1' : '0';
    if (str_contains($q, 'UTC_TIMESTAMP')) return '2026-10-02 10:00:00';
    return null;
  }
  public function get_col($q) {
    return ['id', 'at', 'user_id', 'user_name', 'type', 'resource_type', 'resource_id', 'resource_title', 'op',
      'producer_version', 'producer_hash', 'context'];
  }
  public function get_results($q, $o = null) {
    if (getenv('STUB_ATTACH') === 'yes') {
      if (str_contains($q, 'wp_postmeta')) {
        return [
          ['post_id' => '88', 'meta_key' => '_wp_attached_file', 'meta_value' => '2026/10/e2e04-upload.png'],
          ['post_id' => '88', 'meta_key' => '_wp_attachment_metadata', 'meta_value' => serialize([
            'file' => '2026/10/e2e04-upload.png',
            'sizes' => [
              'thumbnail' => ['file' => 'e2e04-upload-150x150.png'],
              'medium' => ['file' => 'e2e04-upload-300x200.png'],
              'evil' => ['file' => '../../wp-config.php']
            ],
            'original_image' => 'e2e04-upload-orig.png'
          ])]
        ];
      }
      return [
        ['id' => '1', 'at' => '2026-10-02 09:00:00', 'user_id' => '1', 'user_name' => 'admin', 'type' => 'add_attachment',
          'resource_type' => 'attachment', 'resource_id' => '88', 'resource_title' => 'e2e04-upload', 'op' => 'upload',
          'producer_version' => '0.3.1', 'producer_hash' => '', 'context' => ''],
        ['id' => '2', 'at' => '2026-10-02 09:00:01', 'user_id' => '1', 'user_name' => 'admin', 'type' => 'wp_after_insert_post',
          'resource_type' => 'post', 'resource_id' => '42', 'resource_title' => 'Home', 'op' => 'update',
          'producer_version' => '0.3.1', 'producer_hash' => '', 'context' => '']
      ];
    }
    return [['id' => '1', 'at' => '2026-10-02 09:00:00', 'user_id' => '0', 'user_name' => '', 'type' => 'upgrader_process_complete',
      'resource_type' => 'core', 'resource_id' => 'wordpress', 'resource_title' => 'WordPress', 'op' => 'install',
      'producer_version' => '0.3.0', 'producer_hash' => '', 'context' => 'cron']];
  }
}
$GLOBALS['wpdb'] = new Stub_Adapter_Wpdb();
