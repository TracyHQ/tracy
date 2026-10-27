<?php
/**
 * t4-scss.php — compile a Joomla template's `scss/` into its `css/` with the site's own PHP.
 *
 * A Tracy Joomla site runs the stock `joomla:6-apache` image: no node, no dart-sass, and T4 compiles
 * SCSS only through plg_system_jadev, a development plugin the quickstarts do not ship. Without this
 * tool an agent asked to change the look writes plain CSS beside `darkmode.css` (measured 27/09/2026
 * on `capiv2j`). This compiles with scssphp (`tools/scssphp/`, vendored at `vendor/php/scssphp`), the
 * compiler T4's own admin action uses (`admin/src/Action/Scss.php`). T4 ships scssphp 1.6.0 itself,
 * but that copy dies on the sites' PHP 8.4 (`array_walk_recursive(): Argument #1 must be of type
 * array` in Compiler.php:2038, measured 27/09/2026 on tracy_business) — hence the site's own copy.
 *
 * Usage, from the site container, as the web user so the files stay writable by the site:
 *
 *   php /site/<label>/tools/t4-scss.php [--template=<name>] [--all | --only=<file.scss>] [--root=<webroot>]
 *
 * By default compiles `scss/template.scss` → `css/template.css`, the one file the page loads
 * (T4's `etc/assets.json`) and the one T4's own action compiles. `--all` takes every top-level
 * `scss/*.scss` that is not a partial (`_*.scss`); `--only` names one. ⚠ Not every entry file a
 * template ships builds: tracy_business's `theme.scss` imports bootstrap's `_root` without `_maps`
 * and nothing loads its css — a failure there is the template's, reported per file, not the tool's.
 * `--template` picks the template when the webroot holds more than one with a `scss/` folder.
 * Exit 0 with one line per file; non-zero with the compiler's message on failure.
 *
 * ⚠ `media/t4/css/<style>.css` is NOT a compiled file: T4 renders it from the template style's
 * parameters (colours, fonts) on the next page load. Colours and fonts change through the style, not
 * through scss; layout and components change here.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "t4-scss.php runs from the command line only\n");
    exit(1);
}

$options = getopt('', ['template::', 'only::', 'root::', 'all', 'help']);
if (isset($options['help'])) {
    fwrite(STDOUT, "php t4-scss.php [--template=<name>] [--all | --only=<file.scss>] [--root=<webroot>]\n");
    exit(0);
}

$candidates = [
    $options['root'] ?? null,
    '/var/www/html',
    dirname(__DIR__) . '/.webroot',
];
$root = null;
foreach ($candidates as $candidate) {
    if (is_string($candidate) && $candidate !== '' && is_dir($candidate . '/templates')) {
        $root = rtrim($candidate, '/');
        break;
    }
}
if ($root === null) {
    fwrite(STDERR, "no Joomla webroot found (tried --root, /var/www/html, ../.webroot): pass --root=<webroot>\n");
    exit(2);
}

$withScss = [];
foreach (glob($root . '/templates/*/scss', GLOB_ONLYDIR) ?: [] as $dir) {
    $withScss[basename(dirname($dir))] = $dir;
}
$template = $options['template'] ?? null;
if (is_string($template) && $template !== '') {
    if (!isset($withScss[$template])) {
        fwrite(STDERR, "template \"$template\" has no scss/ folder under $root/templates; templates with one: " . (implode(', ', array_keys($withScss)) ?: 'none') . "\n");
        exit(2);
    }
} elseif (count($withScss) === 1) {
    $template = array_key_first($withScss);
} else {
    fwrite(STDERR, "which template? --template=<name>; templates with a scss/ folder: " . (implode(', ', array_keys($withScss)) ?: 'none') . "\n");
    exit(2);
}
$scssDir = $withScss[$template];
$cssDir = dirname($scssDir) . '/css';

// scssphp is PSR-4 under ScssPhp\ScssPhp; no composer on a site, so one loader here.
$lib = __DIR__ . '/scssphp';
if (!is_dir($lib)) {
    fwrite(STDERR, "tools/scssphp/ is missing beside this script: re-run ensure-site-folder for this site\n");
    exit(2);
}
spl_autoload_register(static function (string $class) use ($lib): void {
    $prefix = 'ScssPhp\\ScssPhp\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = $lib . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

$only = $options['only'] ?? null;
if (!isset($options['all']) && (!is_string($only) || $only === '')) {
    $only = 'template.scss';
}
$sources = [];
foreach (glob($scssDir . '/*.scss') ?: [] as $file) {
    $name = basename($file);
    if ($name[0] === '_') {
        continue;
    }
    if (is_string($only) && $only !== '' && $name !== $only && $name !== $only . '.scss') {
        continue;
    }
    $sources[] = $file;
}
if ($sources === []) {
    fwrite(STDERR, "nothing to compile in $scssDir" . (is_string($only) && $only !== '' ? " matching \"$only\" (--all for every entry file)" : '') . "\n");
    exit(2);
}
if (!is_dir($cssDir) && !mkdir($cssDir, 0755, true) && !is_dir($cssDir)) {
    fwrite(STDERR, "cannot create $cssDir\n");
    exit(2);
}

// scssphp 1.x warns "Array to string conversion" from its own @extend bookkeeping (Compiler.php,
// `array_diff` over nested selector parts) on bootstrap 5.3's selectors; the css is right. Swallow
// exactly that warning from inside the library so an agent does not chase it; everything else stays.
set_error_handler(static function (int $no, string $message, string $file) use ($lib): bool {
    return $no === E_WARNING && $message === 'Array to string conversion' && strncmp($file, $lib . '/', strlen($lib) + 1) === 0;
});

$compiler = new \ScssPhp\ScssPhp\Compiler();
$compiler->setImportPaths([$scssDir]);
$compiler->setOutputStyle(\ScssPhp\ScssPhp\OutputStyle::EXPANDED);
$failed = 0;
foreach ($sources as $file) {
    $target = $cssDir . '/' . substr(basename($file), 0, -5) . '.css';
    try {
        $result = $compiler->compileString((string) file_get_contents($file), $file);
        $css = $result->getCss();
        if (file_put_contents($target, $css) === false) {
            throw new \RuntimeException("cannot write $target");
        }
        fwrite(STDOUT, sprintf("%s -> %s (%d bytes)\n", substr($file, strlen($root) + 1), substr($target, strlen($root) + 1), strlen($css)));
    } catch (\Throwable $e) {
        $failed++;
        fwrite(STDERR, sprintf("%s: %s\n", substr($file, strlen($root) + 1), $e->getMessage()));
    }
}
exit($failed === 0 ? 0 : 1);
