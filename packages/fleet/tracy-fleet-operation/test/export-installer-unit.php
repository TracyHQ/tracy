<?php
/**
 * Unit cases for the pure parts of `scripts/lib/export-installer.php`: the serialized-aware address
 * replace, the SQL dump reader and classifier, tar member names and the configuration editors.
 * Run by `export-installer.test.mjs`; prints one line per case and exits 1 on the first failure.
 */

define('TRACY_INSTALLER_LIBRARY', true);
define('TRACY_INSTALLER_PLATFORM', 'wordpress');
define('TRACY_INSTALLER_OLD_ADDRESS', 'https://lantern.tracy.site');
define('TRACY_INSTALLER_LABEL', 'lantern');
define('TRACY_INSTALLER_BACKUP', '');
define('TRACY_INSTALLER_COMPANIONS', '{}');
define('TRACY_INSTALLER_PAYLOAD_SIZES', '{}');
require __DIR__ . '/../scripts/lib/export-installer.php';

$failures = 0;
function ti_span(array $ab): array
{
    return [$ab[0], $ab[1] - $ab[0]];
}
function check(string $name, $actual, $expected): void
{
    global $failures;
    if ($actual === $expected) {
        echo "ok - $name\n";
        return;
    }
    $failures++;
    echo "not ok - $name\n  expected: " . var_export($expected, true) . "\n  actual:   " . var_export($actual, true) . "\n";
}

$old = 'https://lantern.tracy.site';
$new = 'https://www.example.com';
$map = ti_address_map($old, $new);

function replaced(string $value, array $map, &$bad = 0): string
{
    $count = 0;
    $out = ti_replace_value($value, $map, $count);
    $bad = $count;
    return $out;
}

// ── serialized data ─────────────────────────────────────────────────────────────────────────────

$value = serialize(['url' => $old . '/about', 'n' => 3]);
$out = replaced($value, $map, $bad);
check('array: unserializes to the new address', unserialize($out), ['url' => $new . '/about', 'n' => 3]);
check('array: nothing malformed', $bad, 0);

$value = serialize(['title' => 'Café — Ngôi nhà', 'text' => "Xem tại $old/trang-chủ ✓"]);
$out = replaced($value, $map, $bad);
check('multibyte: lengths counted in bytes', unserialize($out), ['title' => 'Café — Ngôi nhà', 'text' => "Xem tại $new/trang-chủ ✓"]);

$inner = serialize(['link' => "$old/x"]);
$value = serialize(['nested' => $inner, 'plain' => "$old/y"]);
$out = replaced($value, $map, $bad);
$decoded = unserialize($out);
check('nested serialized string: rewritten inside', unserialize($decoded['nested']), ['link' => "$new/x"]);
check('nested serialized string: outer value too', $decoded['plain'], "$new/y");

final class TiFixturePerson
{
    public $home;
    protected $site;
    private $secret;
    public function __construct($home, $site, $secret)
    {
        $this->home = $home;
        $this->site = $site;
        $this->secret = $secret;
    }
    public function all(): array
    {
        return [$this->home, $this->site, $this->secret];
    }
}
$value = serialize(new TiFixturePerson("$old/a", "$old/b", 'keep'));
$out = replaced($value, $map, $bad);
check('object: class and property names kept', strpos($out, 'O:15:"TiFixturePerson":3:{') === 0 && strpos($out, "\0*\0site") !== false && strpos($out, "\0TiFixturePerson\0secret") !== false, true);
check('object: properties rewritten', unserialize($out)->all(), ["$new/a", "$new/b", 'keep']);

$shared = new stdClass();
$shared->url = "$old/shared";
$arr = ['a' => $shared, 'b' => $shared];
$arr['c'] = &$arr['a'];
$value = serialize($arr);
$out = replaced($value, $map, $bad);
check('references: r: and R: tokens kept', preg_match('/r:\d+;/', $out) === 1 && preg_match('/R:\d+;/', $out) === 1, true);
$back = unserialize($out);
check('references: still the same object', $back['a'] === $back['b'] && $back['a']->url === "$new/shared", true);

$json = json_encode(['image' => "$old/wp-content/uploads/a.png"]);
check('JSON fixture holds escaped slashes', strpos($json, 'https:\/\/lantern.tracy.site') !== false, true);
$value = serialize(['blocks' => $json]);
$out = replaced($value, $map, $bad);
check('JSON inside a serialized string: escaped form replaced', json_decode(unserialize($out)['blocks'], true), ['image' => "$new/wp-content/uploads/a.png"]);
check('JSON inside a serialized string: stays escaped', strpos(unserialize($out)['blocks'], 'https:\/\/www.example.com') !== false, true);

check('plain JSON value', replaced($json, $map), json_encode(['image' => "$new/wp-content/uploads/a.png"]));
check('plain text, both schemes', replaced("<a href=\"$old/x\">x</a> http://lantern.tracy.site/y", $map), "<a href=\"$new/x\">x</a> $new/y");
check('a value without the address is returned as it is', replaced('s:3:"abc";', $map), 's:3:"abc";');

$broken = 's:10:"' . $old . '";';
$out = replaced($broken, $map, $bad);
check('malformed: left unchanged', $out, $broken);
check('malformed: counted', $bad, 1);
$broken = 'a:2:{s:1:"u";s:26:"' . $old . '";}';
$out = replaced($broken, $map, $bad);
check('malformed array (member count): unchanged', $out, $broken);
check('malformed array: counted', $bad, 1);
$value = serialize(['u' => $old]) . 'trailing';
check('trailing bytes after serialized data: unchanged', replaced($value, $map, $bad), $value);

$value = 'a:3:{i:0;d:1.5;i:1;b:1;s:1:"u";s:' . strlen($old) . ':"' . $old . '";}';
check('scalars kept byte for byte', replaced($value, $map), 'a:3:{i:0;d:1.5;i:1;b:1;s:1:"u";s:' . strlen($new) . ':"' . $new . '";}');
$value = 'a:2:{i:0;C:11:"ArrayObject":21:{x:i:0;a:0:{};m:a:0:{}}s:1:"u";s:' . strlen($old) . ':"' . $old . '";}';
check('custom-serialized (C:) payload copied', replaced($value, $map), 'a:2:{i:0;C:11:"ArrayObject":21:{x:i:0;a:0:{};m:a:0:{}}s:1:"u";s:' . strlen($new) . ':"' . $new . '";}');
$value = 'a:2:{i:0;N;i:1;s:' . strlen($old) . ':"' . $old . '";}';
check('null kept', unserialize(replaced($value, $map)), [null, $new]);
$deep = $old;
for ($k = 0; $k < 200; $k++) {
    $deep = [$deep];
}
$value = serialize($deep);
check('too deep: left unchanged', replaced($value, $map, $bad), $value);

// ── SQL dump reader ────────────────────────────────────────────────────────────────────────────

$big = str_repeat("('" . str_repeat('x', 1000) . "'),", 2600) . "('end')";
$dump = "/*M!999999\\- enable the sandbox mode */ \n"
    . "-- MariaDB dump 10.19\n"
    . "/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n"
    . "/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;\n"
    . "DROP TABLE IF EXISTS `wp_posts`;\n"
    . "CREATE TABLE `wp_posts` (\n  `ID` int, -- a comment; with a semicolon\n  `t` text # another; one\n) ENGINE=InnoDB;\n"
    . "/*!40000 ALTER TABLE `wp_posts` DISABLE KEYS */;\n"
    . "LOCK TABLES `wp_posts` WRITE;\n"
    . "INSERT INTO `wp_posts` VALUES (1,'it''s; \\'quoted\\'; and \\\\'),(2,'/* not a comment; */');\n"
    . "INSERT INTO `big` VALUES $big;\n"
    . "UNLOCK TABLES;\n"
    . "DELIMITER ;;\n"
    . "/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `wp_t` BEFORE INSERT ON `wp_posts` FOR EACH ROW BEGIN SET NEW.t = 'a;b'; END */;;\n"
    . "DELIMITER ;\n"
    . "DELIMITER ;;\n"
    . "CREATE DEFINER=`admin`@`%` PROCEDURE `wp_p`()\nBEGIN\n  SELECT 1;\n  SELECT 2;\nEND ;;\n"
    . "DELIMITER ;\n"
    . "/*!50003 SET sql_mode = @saved_sql_mode */ ;\n"
    . "-- Dump completed on 2026-10-19\n";
$file = tempnam(sys_get_temp_dir(), 'ti-unit');
try {
    file_put_contents($file, gzencode($dump));
    $reader = new TiSqlReader($file, 0, ';');
    $all = [];
    while (($next = $reader->next()) !== null) {
        $all[] = $next;
    }
    $reader->close();
    $kinds = array_map(fn ($s) => ti_sql_classify($s[0]), $all);
    check('reader: statement kinds in order', array_map(fn ($k) => $k[0] . ($k[1] !== null ? ':' . $k[1] : ''), $kinds), [
        'set', 'set', 'harmless', 'table:wp_posts', 'harmless', 'skip', 'insert:wp_posts', 'insert:big', 'skip',
        'trigger:wp_t', 'procedure:wp_p', 'set',
    ]);
    check('reader: quotes and escapes kept whole', $all[6][0], "INSERT INTO `wp_posts` VALUES (1,'it''s; \\'quoted\\'; and \\\\'),(2,'/* not a comment; */')");
    check('reader: statement longer than the read buffer', strlen($all[7][0]), strlen("INSERT INTO `big` VALUES $big"));
    check('reader: trigger body keeps its semicolons', strpos($all[9][0], "SET NEW.t = 'a;b'; END */") !== false, true);
    check('reader: procedure body whole', substr($all[10][0], -29), "\n  SELECT 1;\n  SELECT 2;\nEND ");
    check('reader: last offset is the end of the last statement', $all[11][1], strpos($dump, "-- Dump completed") - 1);
    check('reader: MariaDB-only statement detected', ti_mariadb_only($all[1][0]), true);
    check('reader: ordinary statement is not MariaDB-only', ti_mariadb_only($all[0][0]), false);

    // Resuming from each checkpoint gives exactly the rest, with the delimiter that was in force.
    $resumeOk = true;
    foreach ($all as $k => [$sql, $end]) {
        $delimiter = $k === 9 || $k === 10 ? ';;' : ';';
        $reader = new TiSqlReader($file, $end, $delimiter);
        $rest = [];
        while (($next = $reader->next()) !== null) {
            $rest[] = $next;
        }
        $reader->close();
        if ($rest !== array_slice($all, $k + 1)) {
            $resumeOk = false;
            echo "  resume after statement $k differs\n";
        }
    }
    check('reader: resume from every checkpoint', $resumeOk, true);
} finally {
    unlink($file);
}

// Session settings replayed on a resumed request: one per assigned name, in first-seen order.
$save = '/*!40101 SET @saved_cs_client     = @@character_set_client */';
$set = '/*!40101 SET character_set_client = utf8mb4 */';
$restore = '/*!40101 SET character_set_client = @saved_cs_client */';
check('set key: user variable', ti_set_key($save), '@saved_cs_client');
check('set key: session variable', ti_set_key($restore), 'character_set_client');
check('set key: several, a comma inside a string ignored', ti_set_key("/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO,STRICT' */"), '@old_sql_mode,sql_mode');
check('set key: @@SESSION. prefix dropped', ti_set_key('SET @@SESSION.sql_mode = 1'), 'sql_mode');
check('set key: SESSION keyword', ti_set_key('SET SESSION sql_mode = 1, LOCAL time_zone = 2'), 'sql_mode,time_zone');
check('set key: NAMES', ti_set_key('/*!40101 SET NAMES utf8mb4 */'), 'names');
$sets = [];
foreach ([$save, $set, $restore, $save, $set] as $statement) {
    $sets = ti_remember_set($sets, $statement);
}
// A cut between the second table's `= utf8mb4` and its restore: the save must still come first.
check('replay: a save before the value that depends on it', array_values($sets), [$save, $set]);
$sets = ti_remember_set($sets, $restore);
check('replay: the restore replaces the set in place', array_values($sets), [$save, $restore]);
check('replay: survives the state file (JSON)', array_values(json_decode(json_encode($sets), true)), [$save, $restore]);

check('definer stripped (comment form)', ti_strip_definer("/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `t`"), "/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `t`");
check('definer stripped (plain form)', ti_strip_definer("CREATE DEFINER='a b'@'%' PROCEDURE `p`()"), "CREATE  PROCEDURE `p`()");
check('definer stripped (CURRENT_USER)', ti_strip_definer("CREATE DEFINER=CURRENT_USER FUNCTION f()"), "CREATE  FUNCTION f()");
check('classify: view', ti_sql_classify("/*!50001 CREATE ALGORITHM=UNDEFINED */ /*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */ /*!50001 VIEW `wp_v` AS select 1 */")[0] . ':' . ti_sql_classify("/*!50001 CREATE ALGORITHM=UNDEFINED */ /*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */ /*!50001 VIEW `wp_v` AS select 1 */")[1], 'view:wp_v');
check('classify: event', ti_sql_classify("/*!50106 CREATE*/ /*!50117 DEFINER=`root`@`localhost`*/ /*!50106 EVENT `e1` ON SCHEDULE")[0], 'event');
check('classify: function', ti_sql_classify("CREATE DEFINER=`root`@`localhost` FUNCTION `f`() RETURNS int")[0], 'function');
check('classify: SET GLOBAL refused', ti_sql_classify('SET GLOBAL general_log = 1')[0], 'global');
check('classify: SET @@GLOBAL refused', ti_sql_classify('/*!40101 SET @@GLOBAL.x = 1 */')[0], 'global');
check('classify: CREATE DATABASE refused', ti_sql_classify('CREATE DATABASE /*!32312 IF NOT EXISTS*/ `x`')[0], 'database');
check('classify: USE refused', ti_sql_classify('USE `x`')[0], 'database');
check('classify: GRANT is other', ti_sql_classify('GRANT ALL ON *.* TO x')[0], 'other');
check('classify: autocommit off skipped', ti_sql_classify('set autocommit=0')[0], 'skip');
check('classify: SET @@autocommit skipped', ti_sql_classify('/*!40101 SET @@autocommit = 0 */')[0], 'skip');
check('classify: MariaDB 11 autocommit save-and-set skipped', ti_sql_classify('SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0')[0], 'skip');
check('classify: MariaDB 11 autocommit restore skipped', ti_sql_classify('SET AUTOCOMMIT=@OLD_AUTOCOMMIT')[0], 'skip');
check('classify: autocommit among other names skipped', ti_sql_classify("/*!40101 SET @x=1, SESSION autocommit = 0 */")[0], 'skip');
check('classify: commit skipped', ti_sql_classify('commit')[0], 'skip');
check('classify: other session SET kept', ti_sql_classify('SET NAMES utf8mb4')[0], 'set');
check('classify: ALTER DATABASE skipped', ti_sql_classify('/*!50003 ALTER DATABASE `src` CHARACTER SET latin1 COLLATE latin1_swedish_ci */')[0], 'skip');

// ── tar member names ───────────────────────────────────────────────────────────────────────────

check('name: plain', ti_safe_name('wp-content/themes/a.php'), 'wp-content/themes/a.php');
check('name: ./ prefix dropped', ti_safe_name('./index.php'), 'index.php');
check('name: folder slash dropped', ti_safe_name('wp-admin/'), 'wp-admin');
check('name: root', ti_safe_name('./'), '');
check('name: absolute refused', ti_safe_name('/etc/passwd'), null);
check('name: .. refused', ti_safe_name('a/../../b'), null);
check('name: drive refused', ti_safe_name('C:/x'), null);
check('name: backslash refused', ti_safe_name('a\\..\\b'), null);
check('name: empty part refused', ti_safe_name('a//b'), null);
check('access file recognised', ti_is_access_file('wp-content/mu-plugins/tracy-access.php'), true);
check('access backup recognised', ti_is_access_file('wp-content/mu-plugins/.tracy-access.php.1a2b'), true);
check('other mu-plugin kept', ti_is_access_file('wp-content/mu-plugins/other.php'), false);

// ── configuration files ────────────────────────────────────────────────────────────────────────

$config = "<?php\n// define('DB_NAME', 'commented');\n/* define('WP_HOME', 'x'); */\ndefine( 'DB_NAME', 'tracy-placeholder' );\n"
    . "define('WP_HOME', 'https://lantern.tracy.site');\n\$table_prefix = getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_');\n"
    . "define('WP_DEBUG', !!getenv_docker('WORDPRESS_DEBUG', ''));\n";
$defines = ti_php_defines($config);
check('defines: live DB_NAME only', substr($config, $defines['DB_NAME'][0], $defines['DB_NAME'][1] - $defines['DB_NAME'][0]), "'tracy-placeholder'");
check('defines: WP_HOME value span', substr($config, $defines['WP_HOME'][0], $defines['WP_HOME'][1] - $defines['WP_HOME'][0]), "'https://lantern.tracy.site'");
check('defines: nested call value', substr($config, $defines['WP_DEBUG'][0], $defines['WP_DEBUG'][1] - $defines['WP_DEBUG'][0]), "!!getenv_docker('WORDPRESS_DEBUG', '')");
$spans = ti_wp_prefix_spans($config);
check('table prefix: computed expression found', substr($config, $spans[0][0], $spans[0][1] - $spans[0][0]), "getenv_docker('WORDPRESS_TABLE_PREFIX', 'wp_')");
check('table prefix: computed is not a literal', ti_php_literal(substr($config, $spans[0][0], $spans[0][1] - $spans[0][0])), null);
check('literal with escapes', ti_php_literal("'it\\'s \\\\ x'"), "it's \\ x");
check('php string round trip', ti_php_literal(ti_php_string("p'a\\ss")), "p'a\\ss");

$joomla = "<?php\nclass JConfig {\n\tpublic \$live_site = '';\n\tpublic \$host = 'tracy-placeholder';\n\tpublic \$force_ssl = 2;\n}\n";
$out = ti_joomla_set($joomla, ['live_site' => "'https://www.example.com'", 'force_ssl' => '0', 'tmp_path' => "'/srv/tmp'"]);
check('joomla: set and append', $out, "<?php\nclass JConfig {\n\tpublic \$live_site = 'https://www.example.com';\n\tpublic \$host = 'tracy-placeholder';\n\tpublic \$force_ssl = 0;\n\tpublic \$tmp_path = '/srv/tmp';\n}\n");
check('joomla: settings read', ti_joomla_settings($out)['host'][2], "'tracy-placeholder'");

// The credentials step run again after a kill between the rename and the checkpoint.
$db = ['name' => 'site', 'user' => 'siteuser', 'password' => "p'w\\x", 'host' => 'db:3306'];
$wp = "<?php\ndefine( 'DB_NAME', 'tracy-placeholder' );\ndefine( 'DB_USER', 'tracy-placeholder' );\n"
    . "define( 'DB_PASSWORD', 'tracy-placeholder' );\ndefine( 'DB_HOST', 'tracy-placeholder' );\n";
$filled = ti_fill_credentials('wordpress', $wp, $db);
check('credentials (WordPress): placeholders filled', strpos($filled, TI_PLACEHOLDER) === false && ti_php_literal(substr($filled, ...ti_span(ti_php_defines($filled)['DB_PASSWORD']))) === "p'w\\x", true);
check('credentials (WordPress): a second run finds them done and changes nothing', ti_fill_credentials('wordpress', $filled, $db), $filled);
$half = str_replace("'DB_HOST', 'tracy-placeholder'", "'DB_HOST', 'db:3306'", $wp);
check('credentials (WordPress): some done, the rest filled', ti_fill_credentials('wordpress', $half, $db), $filled);
$refused = null;
try {
    ti_fill_credentials('wordpress', str_replace("'tracy-placeholder' );\ndefine( 'DB_USER'", "'other_db' );\ndefine( 'DB_USER'", $wp), $db);
} catch (TiRefusal $e) {
    $refused = $e->getMessage();
}
check('credentials (WordPress): someone else\'s value refused', $refused, 'wp-config.php holds a value for DB_NAME that the installer did not expect.');
$jconf = "<?php\nclass JConfig {\n\tpublic \$host = 'tracy-placeholder';\n\tpublic \$user = 'tracy-placeholder';\n"
    . "\tpublic \$password = 'tracy-placeholder';\n\tpublic \$db = 'tracy-placeholder';\n}\n";
$jfilled = ti_fill_credentials('joomla', $jconf, $db);
check('credentials (Joomla): filled', ti_php_literal(ti_joomla_settings($jfilled)['db'][2]) === 'site' && strpos($jfilled, TI_PLACEHOLDER) === false, true);
check('credentials (Joomla): a second run changes nothing', ti_fill_credentials('joomla', $jfilled, $db), $jfilled);
$refused = null;
try {
    ti_fill_credentials('joomla', str_replace("\$user = 'tracy-placeholder'", "\$user = 'root'", $jconf), $db);
} catch (TiRefusal $e) {
    $refused = $e->getMessage();
}
check('credentials (Joomla): someone else\'s value refused', $refused, 'configuration.php holds a value for $user that the installer did not expect.');

$ht = "# BEGIN WordPress\nRewriteEngine On\nRewriteBase /\nRewriteRule ^index\\.php$ - [L]\nRewriteRule . /index.php [L]\n# END WordPress\nRewriteBase /\n";
$once = ti_wp_rewrite_base($ht, '/shop');
check('rewrite base: the WordPress block names the folder', $once, "# BEGIN WordPress\nRewriteEngine On\nRewriteBase /shop/\nRewriteRule ^index\\.php$ - [L]\nRewriteRule . /shop/index.php [L]\n# END WordPress\nRewriteBase /\n");
check('rewrite base: a second run changes nothing', ti_wp_rewrite_base($once, '/shop'), $once);

// ── database host: local or another server ─────────────────────────────────────────────────────

$dns = [
    'db.internal' => ['10.0.3.7'],
    'mysql.example.com' => ['203.0.113.9'],
    'mixed.example.com' => ['10.0.0.5', '198.51.100.4'],
    'v6.internal' => ['fd12:3456::7'],
];
$resolve = function (string $name) use ($dns) {
    return $dns[$name] ?? [];
};
$where = function (string $field, string $forced = '') use ($resolve) {
    $t = ti_classify_db_host($field, $resolve, $forced);
    return ($t['local'] ? 'local ' : 'remote ') . $t['host'] . ($t['port'] !== null ? ':' . $t['port'] : '') . ($t['socket'] !== null ? ' ' . $t['socket'] : '');
};
check('host: localhost (socket)', $where('localhost'), 'local localhost');
check('host: empty means localhost', $where(''), 'local localhost');
check('host: localhost with a socket path', $where('localhost:/run/mysqld/mysqld.sock'), 'local localhost /run/mysqld/mysqld.sock');
check('host: loopback with a port', $where('127.0.0.1:3307'), 'local 127.0.0.1:3307');
check('host: RFC 1918', $where('192.168.1.20'), 'local 192.168.1.20');
check('host: 172.16/12 edge', $where('172.31.255.1'), 'local 172.31.255.1');
check('host: 172.32 is public', $where('172.32.0.1'), 'remote 172.32.0.1');
check('host: public IPv4', $where('8.8.8.8:3306'), 'remote 8.8.8.8:3306');
check('host: IPv6 loopback in brackets', $where('[::1]:3306'), 'local ::1:3306');
check('host: IPv6 unique-local', $where('fd00::1'), 'local fd00::1');
check('host: IPv6 public', $where('2001:db8::1'), 'remote 2001:db8::1');
check('host: IPv4-mapped private', $where('::ffff:10.1.2.3'), 'local ::ffff:10.1.2.3');
check('host: IPv4-mapped public', $where('::ffff:8.8.8.8'), 'remote ::ffff:8.8.8.8');
check('host: a name resolving to a private IP connects to that IP', $where('db.internal:3306'), 'local 10.0.3.7:3306');
check('host: a name resolving to a public IP is remote, pinned to it', $where('mysql.example.com'), 'remote 203.0.113.9');
check('host: a name with one public address among private ones is remote', $where('mixed.example.com'), 'remote 10.0.0.5');
check('host: a name resolving to private IPv6', $where('v6.internal'), 'local fd12:3456::7');
check('host: the test override only makes a host remote', $where('db.internal', 'other,DB.internal'), 'remote 10.0.3.7');
check('host: the override on localhost', $where('localhost', 'localhost'), 'remote localhost');
check('host: persistent prefix ignored', $where('p:127.0.0.1'), 'local 127.0.0.1');
$refused = null;
try {
    $where('nowhere.example');
} catch (TiRefusal $e) {
    $refused = $e->getMessage();
}
check('host: a name that does not resolve is refused', strpos((string) $refused, 'cannot be found') !== false, true);
$refused = null;
try {
    $where("db'; DROP");
} catch (TiRefusal $e) {
    $refused = $e->getMessage();
}
check('host: not a name is refused before any lookup', strpos((string) $refused, 'is not a host name') !== false, true);

// ── install code ───────────────────────────────────────────────────────────────────────────────

$salt = random_bytes(16);
$stored = ['algorithm' => 'pbkdf2-sha256', 'iterations' => 2000, 'salt' => bin2hex($salt),
    'hash' => bin2hex(hash_pbkdf2('sha256', '042917', $salt, 2000, 32, true))];
check('code: the right code matches', ti_code_matches('042917', $stored), true);
check('code: spaces and a dash are allowed', ti_code_matches(' 042 917 ', $stored) && ti_code_matches('042-917', $stored), true);
check('code: a wrong code does not', ti_code_matches('042918', $stored), false);
check('code: not six digits does not', ti_code_matches('42917', $stored) || ti_code_matches('0429170', $stored), false);
check('code: an unknown algorithm does not', ti_code_matches('042917', ['algorithm' => 'md5'] + $stored), false);
check('code: too few iterations do not', ti_code_matches('042917', ['iterations' => 10] + $stored), false);

$payloadDir = sys_get_temp_dir() . '/ti-unit-payload-' . bin2hex(random_bytes(4));
mkdir($payloadDir);
try {
    $attempt = function (string $typed, int $unpacked) use ($payloadDir) {
        try {
            ti_require_code($payloadDir, $typed, $unpacked);
            return 'ok';
        } catch (TiRefusal $e) {
            return (isset($e->extra['codeLocked']) ? 'locked' : (isset($e->extra['needCode']) ? 'need' : 'refused')) . ': ' . $e->getMessage();
        }
    };
    check('attempts: a package without a code refuses the remote path', strpos($attempt('042917', 100), 'refused: ') === 0 && strpos($attempt('042917', 100), 'has no install code') !== false, true);
    file_put_contents($payloadDir . '/' . TI_CODE_FILE, json_encode($stored));
    check('attempts: no code typed asks for it and says where it is', strpos($attempt('', 100), 'need: ') === 0 && strpos($attempt('', 100), 'the email from Tracy with your install code, sent when you downloaded the ZIP') !== false && strpos($attempt('', 100), 'menu of the site (lantern), Export site as ZIP') !== false, true);
    $tries = [];
    for ($k = 1; $k <= 4; $k++) {
        $answer = $attempt('111111', 100);
        $tries[] = preg_match('/^need: That install code is not right\. (\d) tr/', $answer, $m) ? (int) $m[1] : $answer;
    }
    check('attempts: four wrong codes count down', $tries, [4, 3, 2, 1]);
    check('attempts: the fifth wrong code locks', substr($attempt('111111', 100), 0, 7), 'locked:');
    check('attempts: locked, even the right code is refused', substr($attempt('042917', 100), 0, 7), 'locked:');
    check('attempts: the count is kept behind the guard line', strpos((string) file_get_contents($payloadDir . '/' . TI_CODE_ATTEMPTS), TI_STATE_GUARD) === 0, true);
    check('attempts: a new unpack starts again', $attempt('042917', 200), 'ok');
    check('attempts: the count of another unpack is ignored', ti_code_wrong_count(['unpacked' => 100, 'wrong' => 5], 200), 0);
} finally {
    foreach (glob($payloadDir . '/{,.}*', GLOB_BRACE) ?: [] as $f) {
        if (is_file($f)) {
            unlink($f);
        }
    }
    rmdir($payloadDir);
}

check('prefix from tables (WordPress)', ti_dump_prefix('wordpress', ['tr_options', 'tr_posts', 'tr_users', 'other']), 'tr_');
check('prefix ambiguous', ti_dump_prefix('wordpress', ['a_options', 'a_posts', 'b_options', 'b_posts']), null);
check('prefix from tables (Joomla)', ti_dump_prefix('joomla', ['jx7_extensions', 'jx7_content']), 'jx7_');

// The done screen: what the customer must act on outside Details, the rest inside, no zero counts.
check('changes: a plain string from an older state file stays in sight (whether it asks for action is unknown)', ti_changes(['Old line.']), [['text' => 'Old line.', 'act' => true]]);
check('changes: a rerun lists a change once and keeps its flag', ti_merge_changes([ti_change('A.', true), 'B.'], [ti_change('A.', true), ti_change('C.')]), [['text' => 'A.', 'act' => true], ['text' => 'B.', 'act' => true], ['text' => 'C.', 'act' => false]]);
$done = ti_done_html([
    'address' => ['old' => 'https://lantern.tracy.site', 'new' => 'https://www.example.com'],
    'replace' => ['values' => 12, 'malformed' => 0, 'skippedSerialized' => 0],
    'changes' => [ti_change('Force HTTPS is off. Turn it on.', true), ti_change('$tmp_path set.'), 'Legacy <line>.'],
    'notes' => [],
], []);
[$head, $tail] = explode('<details>', $done, 2) + [1 => ''];
check('done: the header and the two buttons', strpos($head, 'Your site is installed') !== false && strpos($head, 'href="https://www.example.com/">Open the site</a>') !== false && strpos($head, 'href="https://www.example.com/wp-admin/">Open the admin area</a>') !== false, true);
check('done: an action item is outside Details', strpos($head, 'Force HTTPS is off') !== false && strpos($tail, 'Force HTTPS') === false, true);
check('done: other changes, the address and the backup point are inside Details', strpos($tail, '$tmp_path set.') !== false && strpos($tail, 'in 12 database values') !== false && strpos($tail, 'backup point') !== false && strpos($head, '$tmp_path') === false, true);
check('done: an older state line is escaped and kept in sight, outside Details', strpos($head, 'Legacy &lt;line&gt;.') !== false && strpos($tail, 'Legacy') === false, true);
check('done: no line reports a count of 0', strpos($done, 'could not be read') === false && strpos($done, 'without a primary key') === false && strpos($done, 'class="danger"') === false, true);
$bad = ti_done_html(['address' => ['old' => '', 'new' => 'https://www.example.com'], 'replace' => ['malformed' => 2, 'skippedSerialized' => 3], 'changes' => [], 'notes' => []], ['installer.php']);
[$head] = explode('<details>', $bad, 2);
check('done: files left, unreadable and skipped values are outside Details, files first', strpos($head, '<div class="danger">') === 0 && strpos($head, '<code>installer.php</code>') !== false && strpos($head, '2 serialized database values could not be read') !== false && strpos($head, '3 serialized values in tables without a primary key') !== false, true);

// ── collations the target server does not know (beta report 25/10/2026) ──
$table = "CREATE TABLE `jd_claudecowork_apply_log` (\n  `id` int(11) NOT NULL,\n  `note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_as_cs DEFAULT NULL\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci";
check('collations: a table names its own and its columns\'', ti_collations_in($table), ['utf8mb4_uca1400_as_cs', 'utf8mb4_uca1400_ai_ci']);
check('collations: mysqldump\'s line around a routine', ti_collations_in('/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */'), ['utf8mb4_0900_ai_ci']);
check('collations: rows are not read for them', in_array('insert', TI_COLLATION_KINDS, true), false);
check('candidates: an insensitive one takes the charset\'s Unicode collation, newer UCA first', ti_collation_candidates('utf8mb4_uca1400_ai_ci'), ['utf8mb4_unicode_520_ci', 'utf8mb4_unicode_ci']);
check('candidates: a sensitive one keeps distinct values distinct', ti_collation_candidates('utf8mb4_0900_as_cs'), ['utf8mb4_bin']);
check('candidates: utf8mb3 is utf8 on an older server', ti_collation_candidates('utf8mb3_uca1400_ai_ci'), ['utf8mb3_unicode_520_ci', 'utf8mb3_unicode_ci', 'utf8_uca1400_ai_ci', 'utf8_unicode_520_ci', 'utf8_unicode_ci']);
// MariaDB 10.4: no uca1400, no 0900; unicode_520 and the defaults are there
$knows = ['utf8mb4_unicode_520_ci', 'utf8mb4_unicode_ci', 'utf8mb4_general_ci', 'utf8mb4_bin', 'latin1_swedish_ci'];
$known = fn ($c) => in_array($c, $knows, true);
$defaults = ['utf8mb4' => 'utf8mb4_general_ci', 'latin1' => 'latin1_swedish_ci'];
$fallback = fn ($cs) => $defaults[$cs] ?? null;
[$plan, $missing] = ti_collation_plan(['utf8mb4_uca1400_ai_ci', 'utf8mb4_uca1400_as_cs', 'utf8mb4_unicode_ci', 'latin1_german3_ci', 'koi9_odd_ci'], $known, $fallback);
check('plan: only what the server lacks, each to the nearest it has', $plan, ['utf8mb4_uca1400_ai_ci' => 'utf8mb4_unicode_520_ci', 'utf8mb4_uca1400_as_cs' => 'utf8mb4_bin', 'latin1_german3_ci' => 'latin1_swedish_ci']);
check('plan: a collation of a charset the server has never heard of is missing', $missing, ['koi9_odd_ci']);
[$plan, $missing] = ti_collation_plan(['utf8mb4_uca1400_ai_ci'], fn ($c) => true, $fallback);
check('plan: a server that knows every collation changes nothing', [$plan, $missing], [[], []]);
check('apply: the definition takes the plan, a name that only starts the same stays',
    ti_apply_collations($table . ' COMMENT=\'utf8mb4_uca1400_ai_ci_x\'', ['utf8mb4_uca1400_ai_ci' => 'utf8mb4_unicode_520_ci', 'utf8mb4_uca1400_as_cs' => 'utf8mb4_bin']),
    str_replace(['utf8mb4_uca1400_as_cs', 'COLLATE=utf8mb4_uca1400_ai_ci'], ['utf8mb4_bin', 'COLLATE=utf8mb4_unicode_520_ci'], $table) . ' COMMENT=\'utf8mb4_uca1400_ai_ci_x\'');
check('apply: no plan, the bytes as they were', ti_apply_collations($table, []), $table);

// A definition may carry customer data too: defaults, comments and routine bodies are not names.
$literal = "CREATE TABLE t (`utf8mb4_uca1400_ai_ci` text DEFAULT 'COLLATE utf8mb4_uca1400_ai_ci') COLLATE=utf8mb4_uca1400_ai_ci COMMENT='utf8mb4_uca1400_ai_ci'";
$literalPlan = ['utf8mb4_uca1400_ai_ci' => 'utf8mb4_unicode_520_ci'];
check('collations: defaults, comments and identifiers are preserved', ti_apply_collations($literal, $literalPlan), str_replace(') COLLATE=utf8mb4_uca1400_ai_ci', ') COLLATE=utf8mb4_unicode_520_ci', $literal));
check('collations: text in defaults and comments names no collation', ti_collations_in("CREATE TABLE t (v text DEFAULT 'COLLATE utf8mb4_uca1400_ai_ci') COMMENT='COLLATE utf8mb4_0900_ai_ci'"), []);
check('collations: quoted session setting in executable comment', ti_apply_collations("/*!50003 SET collation_connection = 'utf8mb4_uca1400_ai_ci' */", $literalPlan), "/*!50003 SET collation_connection = 'utf8mb4_unicode_520_ci' */");

echo $failures === 0 ? "all passed\n" : "$failures failed\n";
exit($failures === 0 ? 0 : 1);
