<?php
// Run inside the installed target by run.sh: reads the database and the config back, one PASS/FAIL line per check.
[$_, $host, $new, $old, $bulk] = $argv;
$bulk = (int) $bulk;
$db = new mysqli($host, 'siteuser', 'sitepw', 'site');
$opt = fn ($n) => $db->query("SELECT option_value FROM tr_options WHERE option_name='" . $n . "'")->fetch_row()[0];
$out = [];
$w = unserialize($opt('widget_text'), ['allowed_classes' => false]);
$out['widget unserializes, keeps its multibyte title and holds the new address'] =
    is_array($w) && $w[2]['title'] === 'Tiếng Việt ✓ – €' && $w[2]['text'] === "Write to us: $new/contact/";
$m = unserialize($opt('tracy_e2e_mixed'), ['allowed_classes' => false]);
$out['JSON inside a serialized value holds the new address, escaped'] =
    is_array($m) && json_decode($m['blob'], true)['u'] === "$new/x" && $m['plain'] === "$new/y";
$out['a JSON value with escaped slashes holds the new address'] =
    json_decode($opt('tracy_e2e_json'), true)['url'] === "$new/shop/";
$out['home and siteurl are the new address'] = $opt('home') === $new && $opt('siteurl') === $new;
$out['guid is left as it was'] =
    strpos($db->query("SELECT guid FROM tr_posts WHERE post_name='moving-day'")->fetch_row()[0], $old) !== false;
$out['the table without a primary key holds the new address'] =
    (int) $db->query("SELECT COUNT(*) FROM tr_e2e_log WHERE note LIKE '%$new/log%'")->fetch_row()[0] === 1;
$rows = (int) $db->query("SELECT COUNT(*) FROM tr_e2e_bulk")->fetch_row()[0];
$moved = (int) $db->query("SELECT COUNT(*) FROM tr_e2e_bulk WHERE body LIKE '%$new/p/%'")->fetch_row()[0];
if ($rows !== $bulk) {
    // Which ids are missing, as ranges: tells a skipped statement from a lost tail.
    $gaps = $db->query("SELECT a.id + 1 AS first, (SELECT MIN(b.id) - 1 FROM tr_e2e_bulk b WHERE b.id > a.id) AS last FROM tr_e2e_bulk a
        WHERE NOT EXISTS (SELECT 1 FROM tr_e2e_bulk c WHERE c.id = a.id + 1) AND a.id < $bulk")->fetch_all(MYSQLI_ASSOC);
    fwrite(fopen('php://stderr', 'w'), '    missing ids: ' . json_encode($gaps) . "\n");
}
$out["every bulk row arrived ($rows of $bulk) and holds the new address ($moved)"] = $rows === $bulk && $moved === $bulk;
$out['the trigger and the procedure exist'] =
    $db->query("SHOW TRIGGERS LIKE 'tr_e2e_log'")->num_rows === 1
    && $db->query("SHOW PROCEDURE STATUS WHERE Db='site' AND Name='tr_e2e_count'")->num_rows === 1;
$left = 0;
foreach (['tr_options' => 'option_value', 'tr_posts' => 'post_content', 'tr_postmeta' => 'meta_value'] as $t => $c) {
    $left += (int) $db->query("SELECT COUNT(*) FROM $t WHERE $c LIKE '%$old%'")->fetch_row()[0];
}
$out['no option, post or meta still names the old host'] = $left === 0;
$cfg = file_get_contents('/var/www/html/wp-config.php');
$out['wp-config.php: database settings, WP_HOME, a literal prefix, no placeholder'] =
    strpos($cfg, 'tracy-placeholder') === false && strpos($cfg, "define( 'DB_NAME', 'site' )") !== false
    && strpos($cfg, "'WP_HOME', '$new'") !== false && preg_match('/\$table_prefix\s*=\s*\'tr_\';/', $cfg);
foreach ($out as $what => $ok) echo ($ok ? 'PASS' : 'FAIL'), "\t", $what, "\n";
