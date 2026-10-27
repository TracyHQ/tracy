<?php
/**
 * Dump the tables a contract capture reads, from inside a disposable quickstart installation.
 *
 * `capture-contract.py` compares identity fields as strings (`str(row[field]) != str(value)`), so
 * every value is emitted as text here — a `client_id` that arrives as the integer 0 in one capture
 * and the string "0" in the next would produce two contracts that disagree about nothing.
 *
 * Read-only, and it never touches a customer's site: it runs against the throwaway container the
 * capture stands up from a pinned archive.
 */
if (PHP_SAPI !== 'cli') exit(1);

require '/var/www/html/configuration.php';
$config = new JConfig();
$db = new mysqli($config->host, $config->user, $config->password, $config->db);
if ($db->connect_errno) throw new RuntimeException('cannot reach the quickstart database');
$prefix = $config->dbprefix;
if (!preg_match('/^[a-zA-Z0-9_]+$/D', $prefix)) throw new RuntimeException('invalid table prefix');

$tables = ['modules', 'modules_menu', 'content', 'menu', 'template_styles', 'categories', 'viewlevels', 'usergroups', 'assets'];
// The kinds `capture-contract.py --full-coverage` adds (contacts, tags, custom field definitions); a capture
// without the flag never reads them, so a published profile re-captures byte for byte.
$tables = array_merge($tables, ['contact_details', 'tags', 'fields']);
$inventory = [];
foreach ($tables as $table) {
    $rows = [];
    $result = $db->query('SELECT * FROM `' . $prefix . $table . '`');
    if (!$result) throw new RuntimeException('cannot read ' . $table);
    while ($row = $result->fetch_assoc()) {
        foreach ($row as $column => $value) $row[$column] = $value === null ? null : (string) $value;
        $rows[] = $row;
    }
    $inventory[$table] = $rows;
}
// Authors a visitor reads (name, picture, bio, job title): only those columns and profile keys, never an
// account's password, e-mail, groups or other profile values. The keys are \UserProfileKey::FIELDS of the plugin.
$people = [
    // `admin`: the account is a Super User (group 8), which a provision takes over and renames; never an author slot.
    'users' => 'SELECT u.id, u.name, u.username, EXISTS(SELECT 1 FROM `' . $prefix . 'user_usergroup_map` m WHERE m.user_id = u.id AND m.group_id = 8) AS admin'
        . ' FROM `' . $prefix . 'users` u',
    'user_profiles' => 'SELECT user_id, profile_key, profile_value FROM `' . $prefix . 'user_profiles`'
        . " WHERE profile_key IN ('profile.aboutme', 'profile.user_jobtitle', 'profile.user_tagline', 'profile.user_avatar')",
];
foreach ($people as $table => $sql) {
    $rows = [];
    $result = $db->query($sql);
    // A site without the profile plugin's table has no author profiles to read.
    if ($result) while ($row = $result->fetch_assoc()) $rows[] = array_map(fn ($v) => $v === null ? null : (string) $v, $row);
    $inventory[$table] = $rows;
}
echo json_encode($inventory, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
