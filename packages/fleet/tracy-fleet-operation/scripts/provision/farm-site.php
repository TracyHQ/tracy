<?php
// The webroot half of folding a demo into the host's demo farm (provision/fold.sh, unfold.sh).
//
// Run INSIDE the demo's web context, as the user that owns the webroot (www-data), with the
// docroot as the working directory — `tracy_site_web_exec <label> -i -- php -- VERB … < farm-site.php`.
// Inside, because the files belong to the container's www-data: an edit from the host would have
// to guess the owner, and on a rootless docker it cannot write them at all.
//
//   config-get joomla|wordpress
//        prints what the CMS connects to and where it writes, as KEY=VALUE lines:
//        joomla:    host user password db log_path tmp_path
//        wordpress: DB_HOST DB_USER DB_PASSWORD DB_NAME, and form=literal|env — `env` is the
//                   official image's wp-config.php, which reads WORDPRESS_DB_* at runtime
//                   (getenv_docker); such a file is not rewritten, the pool's environment is.
//   config-set joomla|wordpress
//        rewrites the keys given as FARM_SET_<KEY> environment variables, in place (same inode,
//        owner and mode), literal values only; refuses a key it cannot find as a literal.
//   htaccess-farm
//        mod_php directives (php_value, php_flag) have no meaning to Apache without mod_php — a
//        bare one is a 500 for the whole directory. Every .htaccess under the docroot that has one
//        live today (bare, or inside <IfModule mod_php.c>/<IfModule php_module>) gets the line
//        commented with `#tracy-farm# ` (bare ones only; a guarded one is already inert), and the
//        setting written to the .user.ini beside it, which PHP-FPM reads. Prints one line per file.
//   htaccess-unfarm
//        the exact reverse, read from the markers alone.
//
// Exit 0 on success, 1 with a reason on stderr otherwise. Nothing is half-written: every file is
// rendered fully before it is written.

const MARK = '#tracy-farm# ';
const INI_BEGIN = '; tracy-farm begin (provision/fold.sh: the .htaccess php_value/php_flag lines of this folder)';
const INI_END = '; tracy-farm end';
const INI_CREATED = '; tracy-farm created this file';

function fail(string $why): never
{
    fwrite(STDERR, "farm-site: $why\n");
    exit(1);
}

function put_in_place(string $file, string $body): void
{
    // The same inode, truncated: owner, mode and every hard link stay as they were. A file the
    // CMS keeps read-only (Joomla writes configuration.php 0444) is made writable for the owner for
    // the write, and given its mode back.
    $mode = fileperms($file) & 0777;
    if (!($mode & 0200)) {
        chmod($file, $mode | 0200) || fail("$file is read-only and its mode cannot be changed");
    }
    $fh = fopen($file, 'c+');
    if ($fh === false || !flock($fh, LOCK_EX)) {
        chmod($file, $mode);
        fail("$file cannot be opened for writing");
    }
    ftruncate($fh, 0);
    rewind($fh);
    $ok = fwrite($fh, $body) === strlen($body);
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    chmod($file, $mode);
    if (!$ok) {
        fail("$file could not be written whole");
    }
}

function quote_single(string $v): string
{
    return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $v) . "'";
}

function unquote(string $literal): ?string
{
    $literal = trim($literal);
    if (preg_match('/^\'((?:[^\'\\\\]|\\\\.)*)\'$/s', $literal, $m)) {
        return preg_replace('/\\\\([\'\\\\])/', '$1', $m[1]);
    }
    if (preg_match('/^"((?:[^"\\\\$]|\\\\.)*)"$/s', $literal, $m)) {
        return stripcslashes($m[1]);
    }
    return null;
}

const JOOMLA_KEYS = ['host', 'user', 'password', 'db', 'log_path', 'tmp_path'];
const WP_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

function joomla_pattern(string $key): string
{
    return '/^(\s*(?:public|var)\s+\$' . preg_quote($key, '/') . '\s*=\s*)(\'(?:[^\'\\\\]|\\\\.)*\'|"(?:[^"\\\\]|\\\\.)*")(\s*;)/m';
}

function wp_pattern(string $key): string
{
    return '/(define\s*\(\s*([\'"])' . preg_quote($key, '/') . '\2\s*,\s*)(.+?)(\s*\)\s*;)/';
}

function config_file(string $platform): string
{
    $file = $platform === 'joomla' ? 'configuration.php' : 'wp-config.php';
    if (!is_file($file)) {
        fail(getcwd() . "/$file does not exist");
    }
    return $file;
}

function config_get(string $platform): void
{
    $src = file_get_contents(config_file($platform));
    if ($platform === 'joomla') {
        foreach (JOOMLA_KEYS as $key) {
            if (!preg_match(joomla_pattern($key), $src, $m)) {
                fail("configuration.php has no literal \$$key");
            }
            $v = unquote($m[2]);
            if ($v === null || str_contains($v, "\n")) {
                fail("configuration.php \$$key is not a plain string");
            }
            echo "$key=$v\n";
        }
        return;
    }
    $env = 0;
    foreach (WP_KEYS as $key) {
        if (!preg_match(wp_pattern($key), $src, $m)) {
            fail("wp-config.php does not define $key");
        }
        $v = unquote($m[3]);
        if ($v === null) {
            if (!preg_match('/^getenv_docker\(\s*[\'"]WORDPRESS_' . $key . '[\'"]/', trim($m[3]))) {
                fail("wp-config.php sets $key from an expression this cannot rewrite: " . trim($m[3]));
            }
            $env++;
            $v = '';
        } elseif (str_contains($v, "\n")) {
            fail("wp-config.php $key is not a plain string");
        }
        echo "$key=$v\n";
    }
    if ($env !== 0 && $env !== count(WP_KEYS)) {
        fail('wp-config.php reads some database settings from the environment and states others');
    }
    echo 'form=' . ($env ? 'env' : 'literal') . "\n";
}

function config_set(string $platform): void
{
    $file = config_file($platform);
    $src = file_get_contents($file);
    $keys = $platform === 'joomla' ? JOOMLA_KEYS : WP_KEYS;
    $changed = 0;
    foreach ($keys as $key) {
        $new = getenv('FARM_SET_' . $key);
        if ($new === false) {
            continue;
        }
        if (str_contains($new, "\n")) {
            fail("the new $key holds a newline");
        }
        $pattern = $platform === 'joomla' ? joomla_pattern($key) : wp_pattern($key);
        $count = 0;
        $src = preg_replace_callback($pattern, function ($m) use ($platform, $new, $key) {
            if ($platform === 'joomla') {
                return $m[1] . quote_single($new) . $m[3];
            }
            if (unquote($m[3]) === null) {
                fail("wp-config.php sets $key from an expression — not rewritten");
            }
            return $m[1] . quote_single($new) . $m[4];
        }, $src, 1, $count);
        if ($count !== 1) {
            fail("$file has no literal $key to rewrite");
        }
        $changed++;
    }
    put_in_place($file, $src);
    echo "rewrote $changed setting(s) in $file\n";
}

function htaccess_files(): array
{
    $found = [];
    $it = new RecursiveIteratorIterator(
        new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator('.', FilesystemIterator::SKIP_DOTS),
            fn($f) => !$f->isLink() && ($f->isDir() ? !in_array($f->getFilename(), ['.git', 'node_modules'], true) : $f->getFilename() === '.htaccess')
        )
    );
    foreach ($it as $f) {
        $found[] = $f->getPathname();
    }
    sort($found);
    return $found;
}

/** The php_* settings a .htaccess makes under mod_php today, and the lines to comment. */
function htaccess_php_lines(array $lines): array
{
    $stack = [];
    $settings = [];
    $comment = [];
    foreach ($lines as $i => $line) {
        $t = trim($line);
        if (preg_match('/^<IfModule\s+(!?)([^>\s]+)\s*>/i', $t, $m)) {
            $mod = strtolower($m[2]);
            $php = in_array($mod, ['mod_php.c', 'php_module', 'mod_php8.c', 'php8_module'], true);
            $other_php = !$php && preg_match('/php/', $mod);
            // Live today under mod_php 8: a guard on php 8's own module names; dead: php 5/7 names.
            $stack[] = $m[1] === '!' ? ($php ? 'dead' : 'live') : ($php ? 'php' : ($other_php ? 'dead' : 'live'));
            continue;
        }
        if (preg_match('/^<\/IfModule\s*>/i', $t)) {
            array_pop($stack);
            continue;
        }
        if (!preg_match('/^(php_value|php_flag)\s+(\S+)\s+(.*)$/i', $t, $m)) {
            continue;
        }
        if (in_array('dead', $stack, true)) {
            continue;
        }
        $name = $m[2];
        $value = trim($m[3]);
        $value = unquote($value) ?? $value;
        if (strtolower($m[1]) === 'php_flag') {
            $value = in_array(strtolower($value), ['on', '1', 'true', 'yes'], true) ? 'On' : 'Off';
        }
        $settings[$name] = $value;
        if (!in_array('php', $stack, true)) {
            $comment[] = $i;
        }
    }
    return [$settings, $comment];
}

function ini_value(string $v): string
{
    if (preg_match('/^[A-Za-z0-9_.\/:-]*$/', $v)) {
        return $v;
    }
    return '"' . str_replace('"', '', $v) . '"';
}

function htaccess_farm(): void
{
    foreach (htaccess_files() as $ht) {
        $body = file_get_contents($ht);
        $ini = dirname($ht) . '/.user.ini';
        $old = is_file($ini) ? file_get_contents($ini) : null;
        if (str_contains($body, MARK) || ($old !== null && str_contains($old, INI_BEGIN))) {
            echo "already $ht\n";
            continue;
        }
        $lines = explode("\n", $body);
        [$settings, $comment] = htaccess_php_lines($lines);
        if (!$settings) {
            continue;
        }
        $block = [INI_BEGIN];
        if ($old === null) {
            $block[] = INI_CREATED;
        }
        foreach ($settings as $name => $value) {
            $block[] = "$name = " . ini_value($value);
        }
        $block[] = INI_END;
        $new_ini = ($old === null || $old === '' ? '' : rtrim($old, "\n") . "\n") . implode("\n", $block) . "\n";
        foreach ($comment as $i) {
            $lines[$i] = MARK . $lines[$i];
        }
        if ($old === null) {
            if (file_put_contents($ini, $new_ini, LOCK_EX) === false) {
                fail("$ini could not be written");
            }
        } else {
            put_in_place($ini, $new_ini);
        }
        put_in_place($ht, implode("\n", $lines));
        echo 'farmed ' . $ht . ' (' . count($settings) . " setting(s), " . count($comment) . " line(s) commented)\n";
    }
}

function htaccess_unfarm(): void
{
    foreach (htaccess_files() as $ht) {
        $body = file_get_contents($ht);
        $ini = dirname($ht) . '/.user.ini';
        if (str_contains($body, MARK)) {
            $lines = array_map(fn($l) => str_starts_with($l, MARK) ? substr($l, strlen(MARK)) : $l, explode("\n", $body));
            put_in_place($ht, implode("\n", $lines));
            echo "restored $ht\n";
        }
        if (is_file($ini) && str_contains($old = file_get_contents($ini), INI_BEGIN)) {
            $created = str_contains($old, INI_CREATED);
            $kept = preg_replace('/^' . preg_quote(INI_BEGIN, '/') . '\n.*?^' . preg_quote(INI_END, '/') . '\n?/ms', '', $old);
            if ($created && trim($kept) === '') {
                unlink($ini) || fail("$ini could not be removed");
            } else {
                put_in_place($ini, $kept);
            }
            echo "restored $ini\n";
        }
    }
}

$verb = $argv[1] ?? '';
$platform = $argv[2] ?? '';
if (in_array($verb, ['config-get', 'config-set'], true) && !in_array($platform, ['joomla', 'wordpress'], true)) {
    fail("$verb needs joomla or wordpress");
}
match ($verb) {
    'config-get' => config_get($platform),
    'config-set' => config_set($platform),
    'htaccess-farm' => htaccess_farm(),
    'htaccess-unfarm' => htaccess_unfarm(),
    default => fail('use: config-get|config-set joomla|wordpress, htaccess-farm, htaccess-unfarm'),
};
