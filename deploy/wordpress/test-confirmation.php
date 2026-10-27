<?php
// Run with PHP CLI. No WordPress database, network access or mail delivery is used.
define('ABSPATH', '/fixture/');
define('TRACY_WL_RELAY_URL', 'https://relay.example.com/internal/beta/confirmation');
define('TRACY_WL_RELAY_SECRET', str_repeat('x', 32));
function add_action(...$args) {}
function add_filter(...$args) {}
function add_shortcode(...$args) {}
function get_option(...$args) { return array('reply_to' => 'support@example.com'); }
function wp_parse_args($args, $defaults) { return array_merge($defaults, $args); }
function wp_parse_url($url, $component) { return parse_url($url, $component); }
function is_email($s) { return filter_var($s, FILTER_VALIDATE_EMAIL); }
function esc_html($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function wp_json_encode($s) { return json_encode($s); }
function is_wp_error($s) { return false; }
function current_time(...$args) { return '2026-10-01 10:00:00'; }
function wp_remote_retrieve_response_code($r) { return $r['code']; }
function wp_remote_retrieve_body($r) { return json_encode($r['body']); }
function wp_remote_post($url, $args) {
    global $response, $requests;
    $requests[] = array($url, $args);
    return $response;
}
class FixtureDB {
    public $prefix = 'wp_';
    public $row;
    public $updates = array();
    function prepare($sql, ...$args) { return $sql; }
    function get_row($sql) { return $this->row; }
    function get_var($sql) { return 0; }
    function query($sql) { return 1; }
    function update($table, $values, $where) {
        $this->updates[] = array($values, $where);
        foreach ($where as $key => $value) { if ($this->row->$key !== $value) { return 0; } }
        foreach ($values as $key => $value) { $this->row->$key = $value; }
        return 1;
    }
}
function check($condition, $message) { if (!$condition) { throw new Exception($message); } }
$wpdb = new FixtureDB();
$wpdb->row = (object) array('id' => 1, 'confirm_status' => 'queued', 'name' => 'Visitor', 'email' => 'visitor@example.com', 'platforms' => 'wordpress,joomla', 'role' => 'client-sites', 'sites' => '0', 'website' => '');
$requests = array();
require __DIR__ . '/tracy-whitelist.php';
$response = array('code' => 202, 'body' => array('status' => 'queued'));
tracy_wl_send_confirmation(1);
$payload = json_decode($requests[0][1]['body'], true);
check($payload['platforms'] === array('WordPress', 'Joomla'), 'platform mapping');
check($payload['role'] === 'clients' && $payload['site_count'] === 'none', 'role/count mapping');
check($payload['replyTo'] === 'support@example.com', 'reply-to forwarded');
check(str_contains($payload['confirmation']['html'], 'Visitor'), 'original template forwarded');
check($requests[0][1]['redirection'] === 0, 'secret must not follow redirects');
check($wpdb->row->confirm_status === 'queued', 'pending stays queued');
$response = array('code' => 200, 'body' => array('status' => 'sent'));
tracy_wl_send_confirmation(1);
check($wpdb->row->confirm_status === 'queued', 'missing provider id is not success');
$response = array('code' => 200, 'body' => array('status' => 'sent', 'id' => 'ack'));
tracy_wl_send_confirmation(1);
check($wpdb->row->confirm_status === 'sent' && $wpdb->row->confirm_id === 'ack', 'ack marks sent');
$count = count($requests);
tracy_wl_send_confirmation(1);
check(count($requests) === $count, 'resubmitted sent row sends nothing');
$wpdb->row->confirm_status = 'queued';
$response = array('code' => 409, 'body' => array('status' => 'review'));
tracy_wl_send_confirmation(1);
check($wpdb->row->confirm_status === 'failed', 'ambiguous delivery requires manual review');
echo "WordPress confirmation adapter checks passed\n";
