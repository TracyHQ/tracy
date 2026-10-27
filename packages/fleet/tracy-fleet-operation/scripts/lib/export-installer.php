<?php
/**
 * Tracy site installer — the one file a WordPress or Joomla export package installs itself with.
 *
 * `export-package.py` writes this file at the root of the package with the `__TRACY_…__` values
 * filled in. The person who downloaded the package unpacks it into an empty web folder, creates an
 * empty database, opens `installer.php` in a browser and gives the database and the site's new
 * address. Everything else happens here, in short resumable steps:
 *
 *   check     the installer's age, PHP, the database (reachable, none of the package's tables or prefix in it),
 *             the payload, the web folder (empty but for the package, nothing in the archive's way),
 *             the scope of v1 (one site, no multisite, the address in the installer's own folder)
 *   scan      reads the whole dump once: every table, view, trigger, routine and event it creates
 *             must be absent from the database, and nothing in it needs a privilege the user lacks
 *   extract   webroot.tar into this folder: files and folders only, no absolute path, no `..`,
 *             never Tracy's auto-login (`wp-content/mu-plugins/tracy-access.php`)
 *   import    db.sql.gz, streamed statement by statement; a checkpoint around every statement that
 *             writes, so a request cut at any point resumes without running one twice
 *   replace   the old address for the new one in the imported tables only — WordPress serialized
 *             strings are rewritten with their byte lengths, JSON-escaped forms too, `guid` skipped
 *   configure the configuration file for a plain host (address, paths, Tracy-only settings) and
 *             Tracy's auto-login switched off; the database credentials are written LAST
 *   cleanup   the package files, the uploaded ZIP, the state file and this installer are deleted
 *
 * The state lives in `installer-state.php` beside this file. It holds the database password, so it
 * starts with a PHP line that ends any request for it. One request at a time holds a lock on this
 * file; a second one is told to wait.
 *
 * Every file written in passing ends in `.php`, so a web server runs it rather than serving its
 * bytes: the state's temporary copy (`installer-state.tmp.php`, behind the same guard line) and the
 * configuration file's (`<payload>/<config>.tracy-tmp.php`, inside the denied payload folder). A
 * request killed before the rename leaves one behind; the next request deletes it. Each step can
 * run again after a kill at any point: one already done finds its work in place and goes on.
 *
 * The uploaded ZIP is deleted on the first request that finds the payload unpacked whole: until
 * then it is the whole site and database under a name anyone may guess.
 *
 * A database on another machine needs the install code. Without a key, a stranger who finds this
 * file within its age limit could give a database server of their own and receive the whole site;
 * a database on this machine or its private network gives a stranger nothing, as the data stays
 * in the customer's own hosting. So the database host is resolved once — `localhost`, a socket,
 * loopback, RFC 1918 or private IPv6, or a name resolving only to those, is local — and every
 * connection of the run goes to the address that was checked, never the name again (DNS
 * rebinding). Any other host asks for the six-digit code Tracy made for this export, before any
 * connection to it. The package holds only its PBKDF2 hash, in the payload folder; five wrong
 * codes per unpack close the remote path until the ZIP is unpacked again. The local path stays.
 *
 * There is no install key. What stands in its place:
 *   - the package files sit in a folder with a random name, closed by `.htaccess` and an empty
 *     `index.html`, so the dump and the archive cannot be downloaded;
 *   - a new installation starts only within TI_MAX_AGE of the unpack, measured from this file's
 *     ctime — the moment the file appeared on this server. Not its mtime: unzip, cPanel and Plesk
 *     restore the time stored in the ZIP, which is the export time. Not a stamp written on first
 *     open: an installer unpacked and never opened would stay open to the first stranger. Nothing
 *     can set a ctime back, and unpacking the ZIP again renews it. A run already started goes on
 *     past the limit;
 *   - a run belongs to the browser that started it: a random cookie whose hash is in the state.
 *     Another browser is told that an installation is in progress and cannot take it over.
 *
 * Nothing is written before `check` and `scan` have passed. A refusal there removes the state, so
 * the person can fix what was named (another database, an empty folder) and start again.
 *
 * Requirements: PHP 7.4 or 8.x with mysqli, zlib and tokenizer (all standard).
 */

if (!defined('TRACY_INSTALLER_PLATFORM')) {
    define('TRACY_INSTALLER_PLATFORM', '__TRACY_PLATFORM__');
    define('TRACY_INSTALLER_OLD_ADDRESS', '__TRACY_OLD_ADDRESS__');
    define('TRACY_INSTALLER_LABEL', '__TRACY_LABEL__');
    define('TRACY_INSTALLER_BACKUP', '__TRACY_BACKUP__');
    // sha256 of the package's own files at the root, so they can be told from the person's files.
    define('TRACY_INSTALLER_COMPANIONS', '__TRACY_COMPANIONS__');
    // Byte sizes of webroot.tar and db.sql.gz: the payload is unpacked whole when both match.
    define('TRACY_INSTALLER_PAYLOAD_SIZES', '__TRACY_PAYLOAD_SIZES__');
}
if (!defined('TRACY_INSTALLER_TREAT_AS_REMOTE')) {
    // Test harness only: database hosts (comma-separated) to treat as remote although they resolve
    // to a private address, so Docker can stand in for "another server". It can only ADD the code
    // requirement, never lift it, and nothing but an edit of this file sets it.
    define('TRACY_INSTALLER_TREAT_AS_REMOTE', '');
}

const TI_STATE = 'installer-state.php';
// `.php`, behind TI_STATE_GUARD like the state itself: a request for it runs and prints nothing.
const TI_STATE_TMP = 'installer-state.tmp.php';
const TI_CONFIG_TMP_SUFFIX = '.tracy-tmp.php';
const TI_STATE_GUARD = "<?php http_response_code(404); exit; ?>\n";
const TI_PAYLOAD_GLOB = 'tracy-package-*';
const TI_PLACEHOLDER = 'tracy-placeholder';
// In the payload folder: the install code's PBKDF2 hash, and the wrong codes counted per unpack.
const TI_CODE_FILE = 'install-code.json';
const TI_CODE_ATTEMPTS = 'install-code-attempts.php';
const TI_CODE_MAX_WRONG = 5;
// Where a customer can ask when they cannot find the code (Tracy's help center).
const TI_HELP_URL = 'https://tracy.ai/help';
// How long after the unpack a new installation may start.
const TI_MAX_AGE = 3 * 3600;
const TI_OWNER_COOKIE = 'tracy_installer_run';
const TI_ADDRESS = '#^(https?)://([A-Za-z0-9.-]+(?::[0-9]+)?)(/[A-Za-z0-9._~/-]*)?$#';
// What a hosting panel puts into a fresh web folder, or what PHP itself writes there.
const TI_HOST_FILES = ['cgi-bin', '.well-known', 'error_log', '.user.ini', 'php_errorlog'];
// Tracy's auto-login: trusts headers only Tracy's own proxy may set; anywhere else, a way in.
const TI_ACCESS_FILES = ['wp-content/mu-plugins/tracy-access.php'];
const TI_ACCESS_PREFIXES = ['wp-content/mu-plugins/.tracy-access.php.'];
const TI_TEXT_TYPES = ['char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'json',
    'binary', 'varbinary', 'tinyblob', 'blob', 'mediumblob', 'longblob'];

final class TiRefusal extends Exception
{
    /** @var array<string, mixed> fields the page reads besides the message (`needCode`) */
    public array $extra;

    public function __construct(string $message, array $extra = [])
    {
        parent::__construct($message);
        $this->extra = $extra;
    }
}

// ── Serialized-aware replace ────────────────────────────────────────────────────────────────────

/**
 * The address replace for one database value.
 *
 * A value that looks like PHP-serialized data is parsed byte by byte — never `unserialize`d, the
 * data is not ours to instantiate — and rebuilt with every `s:N:"…"` string replaced inside and its
 * length counted again in bytes. Class names, property names, references, integers and custom
 * (`C:`) payloads are copied untouched. A serialized string that itself holds serialized data is
 * rewritten the same way. Anything that looks serialized but does not parse as a whole is left
 * exactly as it was and counted in `$malformed`. Every other value gets a plain replace, which also
 * covers JSON (`https:\/\/…`), as `$map` carries both forms.
 */
function ti_replace_value(string $value, array $map, int &$malformed): string
{
    if (!ti_contains_any($value, $map)) {
        return $value;
    }
    if (!ti_looks_serialized($value)) {
        return strtr($value, $map);
    }
    $i = 0;
    $out = ti_ser_value($value, $i, $map, 0, $malformed);
    if ($out === null || $i !== strlen($value)) {
        $malformed++;
        return $value;
    }
    return $out;
}

function ti_contains_any(string $value, array $map): bool
{
    foreach ($map as $from => $_) {
        if (strpos($value, (string) $from) !== false) {
            return true;
        }
    }
    return false;
}

function ti_looks_serialized(string $value): bool
{
    return (bool) preg_match('/^(?:a:\d+:\{|O:\d+:"|C:\d+:"|s:\d+:"|S:\d+:"|E:\d+:"|i:-?\d+;|d:[0-9.eE+\-INFA]+;|b:[01];|N;)/', $value);
}

/** One serialized value from `$s[$i]`, rebuilt; `$i` ends just past it. Null when malformed. */
function ti_ser_value(string $s, int &$i, array $map, int $depth, int &$malformed): ?string
{
    if ($depth > 128 || $i >= strlen($s)) {
        return null;
    }
    $c = $s[$i];
    if ($c === 'N') {
        if (substr($s, $i, 2) !== 'N;') {
            return null;
        }
        $i += 2;
        return 'N;';
    }
    if ($c === 'b' || $c === 'i' || $c === 'd' || $c === 'r' || $c === 'R') {
        $patterns = ['b' => '[01]', 'i' => '-?\d+', 'd' => '-?(?:\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|INF|NAN)', 'r' => '\d+', 'R' => '\d+'];
        if (!preg_match('/\G' . $c . ':' . $patterns[$c] . ';/', $s, $m, 0, $i)) {
            return null;
        }
        $i += strlen($m[0]);
        return $m[0];
    }
    if ($c === 's') {
        if (!preg_match('/\Gs:(\d+):"/', $s, $m, 0, $i)) {
            return null;
        }
        $len = (int) $m[1];
        $start = $i + strlen($m[0]);
        if ($start + $len + 2 > strlen($s) || substr($s, $start + $len, 2) !== '";') {
            return null;
        }
        $content = substr($s, $start, $len);
        $i = $start + $len + 2;
        $new = ti_ser_string($content, $map, $depth, $malformed);
        return 's:' . strlen($new) . ':"' . $new . '";';
    }
    if ($c === 'E') {
        // An enum case: `E:N:"Class:Case";` — a name, nothing to replace.
        if (!preg_match('/\GE:(\d+):"/', $s, $m, 0, $i)) {
            return null;
        }
        $end = $i + strlen($m[0]) + (int) $m[1];
        if (substr($s, $end, 2) !== '";') {
            return null;
        }
        $token = substr($s, $i, $end + 2 - $i);
        $i = $end + 2;
        return $token;
    }
    if ($c === 'a') {
        if (!preg_match('/\Ga:(\d+):\{/', $s, $m, 0, $i)) {
            return null;
        }
        $i += strlen($m[0]);
        return ti_ser_members($s, $i, (int) $m[1], $m[0], $map, $depth, $malformed);
    }
    if ($c === 'O') {
        if (!preg_match('/\GO:(\d+):"/', $s, $m, 0, $i)) {
            return null;
        }
        $nameEnd = $i + strlen($m[0]) + (int) $m[1];
        if (!preg_match('/\G":(\d+):\{/', $s, $n, 0, $nameEnd)) {
            return null;
        }
        $head = substr($s, $i, $nameEnd - $i) . $n[0];
        $i = $nameEnd + strlen($n[0]);
        return ti_ser_members($s, $i, (int) $n[1], $head, $map, $depth, $malformed);
    }
    if ($c === 'C') {
        // A class with its own serializer: the payload's format is that class's business. Copied.
        if (!preg_match('/\GC:(\d+):"/', $s, $m, 0, $i)) {
            return null;
        }
        $nameEnd = $i + strlen($m[0]) + (int) $m[1];
        if (!preg_match('/\G":(\d+):\{/', $s, $n, 0, $nameEnd)) {
            return null;
        }
        $end = $nameEnd + strlen($n[0]) + (int) $n[1];
        if (($s[$end] ?? '') !== '}') {
            return null;
        }
        $token = substr($s, $i, $end + 1 - $i);
        $i = $end + 1;
        return $token;
    }
    return null;
}

function ti_ser_members(string $s, int &$i, int $count, string $head, array $map, int $depth, int &$malformed): ?string
{
    $out = $head;
    for ($k = 0; $k < $count * 2; $k++) {
        $part = ti_ser_value($s, $i, $map, $depth + 1, $malformed);
        if ($part === null) {
            return null;
        }
        $out .= $part;
    }
    if (($s[$i] ?? '') !== '}') {
        return null;
    }
    $i++;
    return $out . '}';
}

/** The inside of a serialized string: serialized itself (rewritten), or text (replaced). */
function ti_ser_string(string $content, array $map, int $depth, int &$malformed): string
{
    if (!ti_contains_any($content, $map)) {
        return $content;
    }
    if (!ti_looks_serialized($content)) {
        return strtr($content, $map);
    }
    $j = 0;
    $inner = ti_ser_value($content, $j, $map, $depth + 1, $malformed);
    if ($inner === null || $j !== strlen($content)) {
        $malformed++;
        return $content;
    }
    return $inner;
}

/** Old address → new address, in the plain and the JSON-escaped (`\/`) forms, both schemes. */
function ti_address_map(string $old, string $new): array
{
    $rest = preg_replace('#^https?://#', '', $old);
    $json = str_replace('/', '\\/', $new);
    $escapedRest = str_replace('/', '\\/', $rest);
    return [
        'https://' . $rest => $new,
        'http://' . $rest => $new,
        'https:\\/\\/' . $escapedRest => $json,
        'http:\\/\\/' . $escapedRest => $json,
    ];
}

// ── SQL dump reader ─────────────────────────────────────────────────────────────────────────────

/**
 * Statements out of a gzip'd mariadb-dump, one at a time, with the uncompressed byte offset where
 * each ends — the checkpoint a resumed request seeks back to. Honours `DELIMITER` (routines,
 * triggers, events), quotes with backslash escapes, `--`/`#`/block comments, and statements far
 * longer than one read.
 */
final class TiSqlReader
{
    /** @var resource */
    private $gz;
    private string $buf = '';
    private int $bufStart;
    private int $pos = 0;
    private bool $eof = false;
    public string $delimiter;

    public function __construct(string $path, int $offset, string $delimiter)
    {
        $gz = gzopen($path, 'rb');
        if ($gz === false) {
            throw new TiRefusal('The database file in the package cannot be opened.');
        }
        if ($offset > 0 && gzseek($gz, $offset) !== 0) {
            throw new TiRefusal('The database file in the package ends before the saved progress point.');
        }
        $this->gz = $gz;
        $this->bufStart = $offset;
        $this->delimiter = $delimiter;
    }

    public function close(): void
    {
        gzclose($this->gz);
    }

    private function fill(): bool
    {
        if ($this->eof) {
            return false;
        }
        $chunk = gzread($this->gz, 1 << 20);
        if ($chunk === false || $chunk === '') {
            $this->eof = true;
            return false;
        }
        if ($this->pos > 0) {
            $this->buf = substr($this->buf, $this->pos);
            $this->bufStart += $this->pos;
            $this->pos = 0;
        }
        $this->buf .= $chunk;
        return true;
    }

    /** Make sure `$n` bytes from `$at` are buffered (or the file has ended). */
    private function need(int $at, int $n): bool
    {
        while ($at + $n > strlen($this->buf)) {
            $shift = $this->pos;
            if (!$this->fill()) {
                return $at + $n <= strlen($this->buf);
            }
            $at -= $shift;
        }
        return true;
    }

    /**
     * The next statement as [text, end offset], or null at the end of the dump. The text excludes
     * the delimiter. `DELIMITER` lines are consumed here and change `$this->delimiter`.
     */
    public function next(): ?array
    {
        // Skip what separates statements: whitespace and plain comments (not `/*!…*/`, which runs).
        while (true) {
            if (!$this->need($this->pos, 1)) {
                return null;
            }
            $c = $this->buf[$this->pos];
            if (ctype_space($c)) {
                $this->pos += strspn($this->buf, " \t\r\n", $this->pos);
                continue;
            }
            $this->need($this->pos, 10);
            $head = substr($this->buf, $this->pos, 10);
            if ($c === '#' || (substr($head, 0, 2) === '--' && (strlen($head) === 2 || ctype_space($head[2])))) {
                $this->skipLine();
                continue;
            }
            // `/*M!999999\- enable the sandbox mode */` is a command for the mariadb client only.
            if (substr($head, 0, 2) === '/*' && (($head[2] ?? '') !== '!' && substr($head, 2, 2) !== 'M!' || $head === '/*M!999999')) {
                $this->skipBlockComment();
                continue;
            }
            if (strncasecmp($head, 'DELIMITER', 9) === 0 && ctype_space($head[9] ?? 'x')) {
                $line = $this->readLine();
                $this->delimiter = trim(substr($line, 9));
                if ($this->delimiter === '') {
                    throw new TiRefusal('The database file has a DELIMITER line with no delimiter.');
                }
                continue;
            }
            break;
        }
        $start = $this->pos;
        $i = $this->pos;
        $delim = $this->delimiter;
        $d0 = $delim[0];
        $stops = "'\"`#-/" . $d0;
        while (true) {
            if ($i >= strlen($this->buf)) {
                // `fill` drops what is before `pos` (= `start`), so indexes shift back by that much.
                $shift = $this->pos;
                if (!$this->fill()) {
                    // The file ended without a delimiter: whatever is left is the last statement.
                    $text = trim(substr($this->buf, $start));
                    $this->pos = strlen($this->buf);
                    return $text === '' ? null : [$text, $this->bufStart + $this->pos];
                }
                $i -= $shift;
                $start -= $shift;
                continue;
            }
            $i += strcspn($this->buf, $stops, $i);
            if ($i >= strlen($this->buf)) {
                continue;
            }
            $c = $this->buf[$i];
            if ($c === "'" || $c === '"' || $c === '`') {
                $i = $this->skipQuoted($i, $c, $start);
                continue;
            }
            if ($c === '#') {
                $i = $this->skipTo($i, "\n", $start);
                continue;
            }
            if ($c === '-') {
                $this->needRel($i, 3, $start);
                if (substr($this->buf, $i, 2) === '--' && ($i + 2 >= strlen($this->buf) || ctype_space($this->buf[$i + 2]))) {
                    $i = $this->skipTo($i, "\n", $start);
                    continue;
                }
                if ($d0 !== '-') {
                    $i++;
                    continue;
                }
            }
            if ($c === '/') {
                $this->needRel($i, 2, $start);
                if (substr($this->buf, $i, 2) === '/*') {
                    $i = $this->skipTo($i + 2, '*/', $start);
                    continue;
                }
                if ($d0 !== '/') {
                    $i++;
                    continue;
                }
            }
            if ($c === $d0) {
                $this->needRel($i, strlen($delim), $start);
                if (substr($this->buf, $i, strlen($delim)) === $delim) {
                    $text = substr($this->buf, $start, $i - $start);
                    $this->pos = $i + strlen($delim);
                    return [$text, $this->bufStart + $this->pos];
                }
            }
            $i++;
        }
    }

    /** `need` for an index relative to a statement in progress: keeps `$i`/`$start` valid. */
    private function needRel(int &$i, int $n, int &$start): void
    {
        while ($i + $n > strlen($this->buf)) {
            $shift = $this->pos;
            if (!$this->fill()) {
                return;
            }
            $i -= $shift;
            $start -= $shift;
        }
    }

    private function skipQuoted(int $i, string $q, int &$start): int
    {
        $i++;
        $stops = $q === '`' ? '`' : $q . '\\';
        while (true) {
            $i += strcspn($this->buf, $stops, $i);
            if ($i >= strlen($this->buf)) {
                $shift = $this->pos;
                if (!$this->fill()) {
                    return $i;
                }
                $i -= $shift;
                $start -= $shift;
                continue;
            }
            if ($this->buf[$i] === '\\') {
                $this->needRel($i, 2, $start);
                $i += 2;
                continue;
            }
            return $i + 1;
        }
    }

    private function skipTo(int $i, string $end, int &$start): int
    {
        while (true) {
            $at = strpos($this->buf, $end, $i);
            if ($at !== false) {
                return $at + strlen($end);
            }
            $i = max($i, strlen($this->buf) - strlen($end) + 1);
            $shift = $this->pos;
            if (!$this->fill()) {
                return strlen($this->buf);
            }
            $i -= $shift;
            $start -= $shift;
        }
    }

    private function skipLine(): void
    {
        $start = $this->pos;
        $this->pos = $this->skipTo($this->pos, "\n", $start);
    }

    private function skipBlockComment(): void
    {
        $start = $this->pos;
        $this->pos = $this->skipTo($this->pos + 2, '*/', $start);
    }

    private function readLine(): string
    {
        $start = $this->pos;
        $end = $this->skipTo($this->pos, "\n", $start);
        $line = substr($this->buf, $start, $end - $start);
        $this->pos = $end;
        return $line;
    }
}

/**
 * What a statement is, from its first bytes with comments taken out and executable comments
 * (`/*!50003 …*\/`, `/*M!100616 …*\/`) opened: [kind, object name, flags].
 */
function ti_sql_classify(string $sql): array
{
    $head = substr($sql, 0, 4096);
    $head = preg_replace('#/\*M?!\d*\s?#', ' ', $head);
    $head = preg_replace('#/\*.*?\*/#s', ' ', $head);
    $head = str_replace('*/', ' ', $head);
    $head = preg_replace('/^\s*(?:(?:--[ \t][^\n]*|#[^\n]*)\n\s*)+/', '', $head);
    $head = trim(preg_replace('/\s+/', ' ', $head));
    $ident = '(?:`((?:[^`]|``)+)`|([A-Za-z0-9_$]+))';
    $definer = '(?:DEFINER\s*=\s*\S+\s+)?';
    if ($head === '') {
        return ['empty', null];
    }
    if (preg_match('/^SET\s+(?:GLOBAL\b|@@GLOBAL\.|PERSIST\b|@@PERSIST)/i', $head)) {
        return ['global', null];
    }
    if (preg_match('/^(?:SET\s+(?:SESSION\s+|@@SESSION\.|@@)?autocommit\s*=|COMMIT\b|START\s+TRANSACTION\b|BEGIN\s*$)/i', $head)) {
        // mariadb-dump wraps each table in `set autocommit=0; … commit;`. The checkpoint after each
        // statement is only true if that statement is committed when it returns, so every one runs
        // on its own with autocommit on.
        return ['skip', null];
    }
    if (preg_match('/^SET\b/i', $head)) {
        // MariaDB 11 writes `SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;` and restores it after
        // the table: whatever form, a statement that touches autocommit is not run (see above).
        if (in_array('autocommit', explode(',', ti_set_key($sql)), true)) {
            return ['skip', null];
        }
        return ['set', null];
    }
    if (preg_match('/^(?:LOCK|UNLOCK)\s+TABLES?\b/i', $head)) {
        return ['skip', null];
    }
    if (preg_match('/^INSERT\s+(?:IGNORE\s+)?INTO\s+' . $ident . '/i', $head, $m)) {
        return ['insert', ti_ident($m)];
    }
    if (preg_match('/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?' . $ident . '/i', $head, $m)) {
        return ['table', ti_ident($m)];
    }
    if (preg_match('/^CREATE\s+(?:OR\s+REPLACE\s+)?(?:ALGORITHM\s*=\s*\S+\s+)?' . $definer . '(?:SQL\s+SECURITY\s+\S+\s+)?VIEW\s+' . $ident . '/i', $head, $m)) {
        return ['view', ti_ident($m)];
    }
    if (preg_match('/^CREATE\s+' . $definer . 'TRIGGER\s+' . $ident . '/i', $head, $m)) {
        return ['trigger', ti_ident($m)];
    }
    if (preg_match('/^CREATE\s+' . $definer . '(PROCEDURE|FUNCTION)\s+' . $ident . '/i', $head, $m)) {
        $name = $m[2] !== '' ? str_replace('``', '`', $m[2]) : $m[3];
        return [strtolower($m[1]), $name];
    }
    if (preg_match('/^CREATE\s+' . $definer . 'EVENT\s+' . $ident . '/i', $head, $m)) {
        return ['event', ti_ident($m)];
    }
    if (preg_match('/^ALTER\s+(?:DATABASE|SCHEMA)\s+\S*\s*(?:DEFAULT\s+)?(?:CHARACTER\s+SET|CHARSET|COLLATE)\b/i', $head)) {
        // Names the source database around routines; the target's own character set stays.
        return ['skip', null];
    }
    if (preg_match('/^(?:DROP\s+(?:TABLE|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT)\s+IF\s+EXISTS|ALTER\s+TABLE\s+\S+\s+(?:DISABLE|ENABLE)\s+KEYS)\b/i', $head)) {
        return ['harmless', null];
    }
    if (preg_match('/^(?:CREATE\s+(?:DATABASE|SCHEMA)|USE\b)/i', $head)) {
        return ['database', null];
    }
    return ['other', null];
}

function ti_ident(array $m): string
{
    return $m[1] !== '' ? str_replace('``', '`', $m[1]) : $m[2];
}

/**
 * What a session `SET` assigns, as a key: the sorted names on the left of each `=`
 * (`@saved_cs_client`, `character_set_client`, `names`). A resumed request replays the session
 * settings on a new connection, one statement per key, the latest of each, in the order the keys
 * first appeared. Keyed by text instead, mariadb-dump's save/set/restore triple around every
 * table (`@saved_cs_client = @@character_set_client`, `= utf8mb4`, `= @saved_cs_client`) would
 * replay a restore before its save once a cut lands inside the triple.
 */
function ti_set_key(string $sql): string
{
    $text = preg_replace('#/\*M?!\d*\s?#', ' ', $sql);
    $text = str_replace('*/', ' ', $text);
    $text = preg_replace("/'(?:[^'\\\\]|\\\\.|'')*'|\"(?:[^\"\\\\]|\\\\.)*\"/s", "''", $text);
    if (preg_match('/^\s*SET\s+NAMES\b/i', $text)) {
        return 'names';
    }
    if (!preg_match_all('/(?:\bSET\s+|,\s*)(?:(?:SESSION|LOCAL)\s+)?((?:@@(?:SESSION\.|LOCAL\.)?|@)?[A-Za-z_][A-Za-z0-9_.$]*)\s*:?=/i', $text, $m)) {
        return trim($sql);
    }
    $names = array_map(function ($n) {
        return strtolower(preg_replace('/^@@(?:session\.|local\.)?/i', '', $n));
    }, $m[1]);
    $names = array_unique($names);
    sort($names);
    return implode(',', $names);
}

/** Remember a session `SET` for replay (see `ti_set_key`): `$sets` is [key => statement]. */
function ti_remember_set(array $sets, string $sql): array
{
    $sets[ti_set_key($sql)] = trim($sql);
    return $sets;
}

/** `DEFINER=user@host` out of a CREATE: the objects belong to whoever imports them. */
function ti_strip_definer(string $sql): string
{
    $part = '(?:`(?:[^`]|``)*`|\'(?:[^\'\\\\]|\\\\.)*\'|[A-Za-z0-9_.%\-]+)';
    $head = substr($sql, 0, 4096);
    $tail = substr($sql, 4096);
    $head = preg_replace('/\bDEFINER\s*=\s*(?:CURRENT_USER(?:\(\))?|' . $part . '(?:@' . $part . ')?)/i', '', $head, 1);
    return $head . $tail;
}

/** Statements that only executable comments carry for MariaDB (`/*M!…*\/`) mean nothing to MySQL. */
function ti_mariadb_only(string $sql): bool
{
    $rest = preg_replace('#/\*M!.*?\*/#s', '', $sql);
    $rest = preg_replace('#/\*(?!!).*?\*/#s', '', $rest);
    $rest = preg_replace('/^\s*(?:--[ \t][^\n]*|#[^\n]*)$/m', '', $rest);
    return trim($rest) === '';
}

// ── tar reader ──────────────────────────────────────────────────────────────────────────────────

/**
 * The next entry of a tar from byte `$offset`: [type, name, size, mode, mtime, data offset, next
 * header offset], or null at the end. PAX (`x`, `g`) and GNU long names (`L`) are read; every
 * other type than a file or a folder is returned as it is for the caller to refuse.
 *
 * @param resource $fh
 */
function ti_tar_next($fh, int $offset): ?array
{
    $pax = [];
    $longName = null;
    while (true) {
        if (fseek($fh, $offset) !== 0) {
            throw new TiRefusal('The site archive in the package is damaged (cannot seek).');
        }
        $h = fread($fh, 512);
        if ($h === false || strlen($h) < 512) {
            throw new TiRefusal('The site archive in the package ends early.');
        }
        if (trim($h, "\0") === '') {
            return null;
        }
        $sum = 0;
        for ($k = 0; $k < 512; $k++) {
            $sum += ($k >= 148 && $k < 156) ? 32 : ord($h[$k]);
        }
        if ($sum !== (int) octdec(trim(substr($h, 148, 8), " \0"))) {
            throw new TiRefusal('The site archive in the package is damaged (header checksum).');
        }
        $type = $h[156] === "\0" ? '0' : $h[156];
        $size = ti_tar_number(substr($h, 124, 12));
        $data = $offset + 512;
        $next = $data + (int) (ceil($size / 512) * 512);
        if ($type === 'x' || $type === 'g' || $type === 'L') {
            if ($size > 1 << 20) {
                throw new TiRefusal('The site archive in the package has an oversized header.');
            }
            $body = $size > 0 ? fread($fh, $size) : '';
            if ($type === 'L') {
                $longName = rtrim($body, "\0");
            } elseif ($type === 'x') {
                $pax = ti_pax($body) + $pax;
            }
            $offset = $next;
            continue;
        }
        $name = rtrim(substr($h, 0, 100), "\0");
        $prefix = substr($h, 257, 6) === "ustar\0" ? rtrim(substr($h, 345, 155), "\0") : '';
        if ($prefix !== '') {
            $name = $prefix . '/' . $name;
        }
        if ($longName !== null) {
            $name = $longName;
        }
        if (isset($pax['path'])) {
            $name = $pax['path'];
        }
        if (isset($pax['size'])) {
            $size = (int) $pax['size'];
            $next = $data + (int) (ceil($size / 512) * 512);
        }
        $mode = (int) octdec(trim(substr($h, 100, 8), " \0"));
        $mtime = isset($pax['mtime']) ? (int) $pax['mtime'] : ti_tar_number(substr($h, 136, 12));
        return [$type, $name, $size, $mode, $mtime, $data, $next];
    }
}

function ti_tar_number(string $field): int
{
    if ($field !== '' && (ord($field[0]) & 0x80)) {
        $n = ord($field[0]) & 0x7f;
        for ($k = 1; $k < strlen($field); $k++) {
            $n = $n * 256 + ord($field[$k]);
        }
        return $n;
    }
    return (int) octdec(trim($field, " \0"));
}

function ti_pax(string $body): array
{
    $out = [];
    $i = 0;
    while ($i < strlen($body)) {
        $sp = strpos($body, ' ', $i);
        if ($sp === false) {
            break;
        }
        $len = (int) substr($body, $i, $sp - $i);
        if ($len <= 0) {
            break;
        }
        $record = substr($body, $sp + 1, $len - ($sp - $i) - 2);
        $eq = strpos($record, '=');
        if ($eq !== false) {
            $out[substr($record, 0, $eq)] = substr($record, $eq + 1);
        }
        $i += $len;
    }
    return $out;
}

/** A tar member name made safe to join under the target folder, or null when it is not. */
function ti_safe_name(string $name): ?string
{
    if (strpos($name, "\0") !== false || $name === '' || $name[0] === '/' || preg_match('#^[A-Za-z]:#', $name)) {
        return null;
    }
    if (strpos($name, '\\') !== false) {
        return null;
    }
    $name = preg_replace('#^(\./)+#', '', $name);
    $name = rtrim($name, '/');
    if ($name === '' || $name === '.') {
        return '';
    }
    foreach (explode('/', $name) as $part) {
        if ($part === '..' || $part === '') {
            return null;
        }
    }
    return $name;
}

function ti_is_access_file(string $name): bool
{
    if (in_array($name, TI_ACCESS_FILES, true)) {
        return true;
    }
    foreach (TI_ACCESS_PREFIXES as $prefix) {
        if (strpos($name, $prefix) === 0) {
            return true;
        }
    }
    return false;
}

// ── configuration files ─────────────────────────────────────────────────────────────────────────

function ti_php_string(string $value): string
{
    return "'" . str_replace(['\\', "'"], ['\\\\', "\\'"], $value) . "'";
}

/**
 * Every live `define('NAME', <value>);` in a PHP file, from its tokens: [name => [start, end]] as
 * byte offsets of the value expression (the first live define of a name, as PHP keeps the first).
 */
function ti_php_defines(string $source): array
{
    $tokens = token_get_all($source);
    $found = [];
    $offset = 0;
    $positions = [];
    foreach ($tokens as $k => $t) {
        $positions[$k] = $offset;
        $offset += strlen(is_array($t) ? $t[1] : $t);
    }
    $count = count($tokens);
    for ($k = 0; $k < $count; $k++) {
        $t = $tokens[$k];
        if (!is_array($t) || $t[0] !== T_STRING || strtolower($t[1]) !== 'define') {
            continue;
        }
        $j = ti_next_token($tokens, $k + 1);
        if ($j === null || $tokens[$j] !== '(') {
            continue;
        }
        $j = ti_next_token($tokens, $j + 1);
        if ($j === null || !is_array($tokens[$j]) || $tokens[$j][0] !== T_CONSTANT_ENCAPSED_STRING) {
            continue;
        }
        $name = substr($tokens[$j][1], 1, -1);
        $j = ti_next_token($tokens, $j + 1);
        if ($j === null || $tokens[$j] !== ',') {
            continue;
        }
        $valueStart = ti_next_token($tokens, $j + 1);
        if ($valueStart === null) {
            continue;
        }
        $depth = 0;
        $end = null;
        for ($m = $valueStart; $m < $count; $m++) {
            $tok = $tokens[$m];
            if ($tok === '(' || $tok === '[') {
                $depth++;
            } elseif ($tok === ')' || $tok === ']') {
                if ($depth === 0) {
                    $end = $m;
                    break;
                }
                $depth--;
            } elseif ($tok === ',' && $depth === 0) {
                $end = $m;
                break;
            }
        }
        if ($end === null) {
            continue;
        }
        $last = $end - 1;
        while ($last > $valueStart && is_array($tokens[$last]) && $tokens[$last][0] === T_WHITESPACE) {
            $last--;
        }
        if (!isset($found[$name])) {
            $found[$name] = [$positions[$valueStart], $positions[$last] + strlen(is_array($tokens[$last]) ? $tokens[$last][1] : $tokens[$last])];
        }
    }
    return $found;
}

function ti_next_token(array $tokens, int $k): ?int
{
    $count = count($tokens);
    for (; $k < $count; $k++) {
        $t = $tokens[$k];
        if (is_array($t) && in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
            continue;
        }
        return $k;
    }
    return null;
}

/** `$table_prefix = <expression>;` spans (live code only), from tokens. */
function ti_wp_prefix_spans(string $source): array
{
    $tokens = token_get_all($source);
    $spans = [];
    $offset = 0;
    $positions = [];
    foreach ($tokens as $k => $t) {
        $positions[$k] = $offset;
        $offset += strlen(is_array($t) ? $t[1] : $t);
    }
    $count = count($tokens);
    for ($k = 0; $k < $count; $k++) {
        $t = $tokens[$k];
        if (!is_array($t) || $t[0] !== T_VARIABLE || $t[1] !== '$table_prefix') {
            continue;
        }
        $j = ti_next_token($tokens, $k + 1);
        if ($j === null || $tokens[$j] !== '=') {
            continue;
        }
        $start = ti_next_token($tokens, $j + 1);
        $depth = 0;
        for ($m = $start; $m !== null && $m < $count; $m++) {
            $tok = $tokens[$m];
            if ($tok === '(' || $tok === '[') {
                $depth++;
            } elseif ($tok === ')' || $tok === ']') {
                $depth--;
            } elseif ($tok === ';' && $depth <= 0) {
                $last = $m - 1;
                while ($last > $start && is_array($tokens[$last]) && $tokens[$last][0] === T_WHITESPACE) {
                    $last--;
                }
                $spans[] = [$positions[$start], $positions[$last] + strlen(is_array($tokens[$last]) ? $tokens[$last][1] : $tokens[$last])];
                break;
            }
        }
    }
    return $spans;
}

/** A PHP single- or double-quoted literal with nothing to interpolate, as its value; else null. */
function ti_php_literal(string $expr): ?string
{
    $expr = trim($expr);
    if (preg_match("/^'((?:[^'\\\\]|\\\\.)*)'$/s", $expr, $m)) {
        return str_replace(["\\'", '\\\\'], ["'", '\\'], $m[1]);
    }
    if (preg_match('/^"([^"\\\\$]*)"$/', $expr, $m)) {
        return $m[1];
    }
    return null;
}

function ti_splice(string $source, int $start, int $end, string $value): string
{
    return substr($source, 0, $start) . $value . substr($source, $end);
}

/** Joomla's `public $name = <value>;` lines: [name => [start, end, raw value]] of the live ones. */
function ti_joomla_settings(string $source): array
{
    $tokens = token_get_all($source);
    $offset = 0;
    $positions = [];
    foreach ($tokens as $k => $t) {
        $positions[$k] = $offset;
        $offset += strlen(is_array($t) ? $t[1] : $t);
    }
    $found = [];
    $count = count($tokens);
    for ($k = 0; $k < $count; $k++) {
        $t = $tokens[$k];
        if (!is_array($t) || $t[0] !== T_PUBLIC) {
            continue;
        }
        $j = ti_next_token($tokens, $k + 1);
        if ($j === null || !is_array($tokens[$j]) || $tokens[$j][0] !== T_VARIABLE) {
            continue;
        }
        $name = substr($tokens[$j][1], 1);
        $eq = ti_next_token($tokens, $j + 1);
        if ($eq === null || $tokens[$eq] !== '=') {
            continue;
        }
        $start = ti_next_token($tokens, $eq + 1);
        $depth = 0;
        for ($m = $start; $m !== null && $m < $count; $m++) {
            $tok = $tokens[$m];
            if ($tok === '(' || $tok === '[') {
                $depth++;
            } elseif ($tok === ')' || $tok === ']') {
                $depth--;
            } elseif ($tok === ';' && $depth <= 0) {
                $last = $m - 1;
                while ($last > $start && is_array($tokens[$last]) && $tokens[$last][0] === T_WHITESPACE) {
                    $last--;
                }
                $a = $positions[$start];
                $b = $positions[$last] + strlen(is_array($tokens[$last]) ? $tokens[$last][1] : $tokens[$last]);
                if (!isset($found[$name])) {
                    $found[$name] = [$a, $b, substr($source, $a, $b - $a)];
                }
                break;
            }
        }
    }
    return $found;
}

/** Set Joomla settings in place (appended inside the class when absent). */
function ti_joomla_set(string $source, array $values): string
{
    foreach ($values as $name => $literal) {
        $settings = ti_joomla_settings($source);
        if (isset($settings[$name])) {
            [$a, $b] = $settings[$name];
            $source = ti_splice($source, $a, $b, $literal);
            continue;
        }
        $close = strrpos($source, '}');
        if ($close === false) {
            throw new TiRefusal('configuration.php is not a Joomla configuration class.');
        }
        $source = substr($source, 0, $close) . "\tpublic \$" . $name . ' = ' . $literal . ";\n" . substr($source, $close);
    }
    return $source;
}

/**
 * The configuration file with the database settings filled in where `tracy-placeholder` stands.
 * A setting that already holds exactly the value this run writes counts as done, so a request
 * killed after the file was renamed into place and before the checkpoint resumes; any other value
 * is refused (someone else's configuration). Returns the source unchanged when all four are done.
 */
function ti_fill_credentials(string $platform, string $source, array $db): string
{
    if ($platform === 'wordpress') {
        $file = 'wp-config.php';
        $wanted = ['DB_NAME' => $db['name'], 'DB_USER' => $db['user'], 'DB_PASSWORD' => $db['password'], 'DB_HOST' => $db['host']];
    } else {
        $file = 'configuration.php';
        $wanted = ['host' => $db['host'], 'user' => $db['user'], 'password' => $db['password'], 'db' => $db['name']];
    }
    foreach ($wanted as $name => $value) {
        if ($platform === 'wordpress') {
            $defines = ti_php_defines($source);
            if (!isset($defines[$name])) {
                throw new TiRefusal('wp-config.php does not define ' . $name . '.');
            }
            [$a, $b] = $defines[$name];
        } else {
            $settings = ti_joomla_settings($source);
            if (!isset($settings[$name])) {
                throw new TiRefusal('configuration.php has no $' . $name . ' setting.');
            }
            [$a, $b] = $settings[$name];
        }
        $current = ti_php_literal(substr($source, $a, $b - $a));
        if ($current === $value) {
            continue;
        }
        if ($current !== TI_PLACEHOLDER) {
            throw new TiRefusal($file . ' holds a value for ' . ($platform === 'wordpress' ? $name : '$' . $name) . ' that the installer did not expect.');
        }
        $source = ti_splice($source, $a, $b, ti_php_string($value));
    }
    return $source;
}

/**
 * WordPress's rewrite block in .htaccess pointed at the folder `$base` (`/shop`). Only the exact
 * root forms are rewritten, so running it twice changes nothing the second time.
 */
function ti_wp_rewrite_base(string $text, string $base): string
{
    return preg_replace_callback('/(# BEGIN WordPress.*?# END WordPress)/s', function ($m) use ($base) {
        $block = preg_replace('#^([ \t]*RewriteBase[ \t]+)/[ \t]*$#m', '${1}' . $base . '/', $m[1]);
        return preg_replace('#^([ \t]*RewriteRule[ \t]+\.[ \t]+)/index\.php\b#m', '${1}' . $base . '/index.php', $block);
    }, $text);
}

// ── database host and install code ──────────────────────────────────────────────────────────────

/** The database host field as mysqli takes it: [host, port, socket]. `[v6]:port`, `host:port`, `host:/socket`. */
function ti_parse_db_host(string $field): array
{
    $field = trim($field);
    if (strncasecmp($field, 'p:', 2) === 0) {
        $field = substr($field, 2);
    }
    if (preg_match('/^\[([0-9A-Fa-f:.]+)\](?::(\d+))?$/', $field, $m)) {
        return [$m[1], isset($m[2]) ? (int) $m[2] : null, null];
    }
    if (substr_count($field, ':') >= 2 && filter_var($field, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        return [$field, null, null];
    }
    if (preg_match('/^(.*):(\d+)$/', $field, $m)) {
        return [$m[1], (int) $m[2], null];
    }
    if (preg_match('/^(.*):(\/.+)$/', $field, $m)) {
        return [$m[1], null, $m[2]];
    }
    return [$field, null, null];
}

/** Loopback, RFC 1918, IPv6 unique-local or link-local (and IPv4-mapped forms of those). */
function ti_ip_is_private(string $ip): bool
{
    $bin = @inet_pton($ip);
    if ($bin === false) {
        return false;
    }
    if (strlen($bin) === 16) {
        if ($bin === str_repeat("\0", 15) . "\1") {
            return true;
        }
        if (substr($bin, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
            return ti_ip_is_private((string) inet_ntop(substr($bin, 12)));
        }
        $first = ord($bin[0]);
        return ($first & 0xfe) === 0xfc || ($first === 0xfe && (ord($bin[1]) & 0xc0) === 0x80);
    }
    [$a, $b] = [ord($bin[0]), ord($bin[1])];
    return $a === 127 || $a === 10 || ($a === 172 && $b >= 16 && $b <= 31) || ($a === 192 && $b === 168);
}

/** Every address `$name` resolves to: A records through the system resolver, then AAAA. */
function ti_resolve(string $name): array
{
    $ips = gethostbynamel($name) ?: [];
    if (function_exists('dns_get_record')) {
        foreach (@dns_get_record($name, DNS_AAAA) ?: [] as $record) {
            if (isset($record['ipv6'])) {
                $ips[] = $record['ipv6'];
            }
        }
    }
    return array_values(array_unique($ips));
}

/**
 * Where the run will connect, and whether that is local: ['local' => bool, 'host' => what mysqli
 * gets (an IP, or `localhost` for its socket), 'port' => ?int, 'socket' => ?string]. A name is
 * resolved here once; it is local only when EVERY address it has is private, and the run connects
 * to the address checked. `$treatAsRemote`: see TRACY_INSTALLER_TREAT_AS_REMOTE.
 * @param callable(string): array $resolve
 */
function ti_classify_db_host(string $field, callable $resolve, string $treatAsRemote = ''): array
{
    [$host, $port, $socket] = ti_parse_db_host($field);
    $forced = in_array(strtolower($host), array_filter(array_map('trim', explode(',', strtolower($treatAsRemote)))), true);
    if ($host === '' || strtolower($host) === 'localhost') {
        // mysqli talks to `localhost` over its unix socket: this machine.
        return ['local' => !$forced, 'host' => 'localhost', 'port' => $port, 'socket' => $socket];
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips = [$host];
    } else {
        if (!preg_match('/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*\.?$/', $host)) {
            throw new TiRefusal('The database host "' . $host . '" is not a host name or an IP address.');
        }
        $ips = $resolve($host);
        if (!$ips) {
            throw new TiRefusal('The database host "' . $host . '" cannot be found. Check the name your hosting panel shows on its database page.');
        }
    }
    $local = !$forced;
    foreach ($ips as $ip) {
        if (!ti_ip_is_private($ip)) {
            $local = false;
        }
    }
    // An IPv6 address keeps no port separator in mysqli's host: it is passed as it is.
    return ['local' => $local, 'host' => $ips[0], 'port' => $port, 'socket' => null];
}

/** A typed code in its six digits ('123 456', '123-456' allowed), or '' when it has no such shape. */
function ti_normalize_code(string $typed): string
{
    $digits = preg_replace('/[\s-]+/', '', $typed);
    return preg_match('/^\d{6}$/', $digits) ? $digits : '';
}

/** Whether `$code` matches the stored `{algorithm: pbkdf2-sha256, iterations, salt, hash}` (hex). */
function ti_code_matches(string $code, array $stored): bool
{
    if (($stored['algorithm'] ?? '') !== 'pbkdf2-sha256' || !is_int($stored['iterations'] ?? null)
        || $stored['iterations'] < 1000 || !is_string($stored['salt'] ?? null) || !is_string($stored['hash'] ?? null)
        || !ctype_xdigit($stored['salt']) || !ctype_xdigit($stored['hash'])) {
        return false;
    }
    $code = ti_normalize_code($code);
    if ($code === '') {
        return false;
    }
    $hash = hash_pbkdf2('sha256', $code, (string) hex2bin($stored['salt']), $stored['iterations'], 32, true);
    return hash_equals((string) hex2bin($stored['hash']), $hash);
}

/**
 * The wrong-code count of this unpack: `$record` as stored (`{unpacked, wrong}`), read against the
 * installer's unpack time — a count from an earlier unpack starts again at zero.
 */
function ti_code_wrong_count(array $record, int $unpackedAt): int
{
    return (int) ($record['unpacked'] ?? -1) === $unpackedAt ? (int) ($record['wrong'] ?? 0) : 0;
}

/** Where a customer finds the code, as one sentence for the page. */
function ti_code_where(): string
{
    // Not the mail's subject: it is in the language the customer reads Tracy in, this page is not.
    $site = TRACY_INSTALLER_LABEL !== '' ? ' (' . TRACY_INSTALLER_LABEL . ')' : '';
    return 'Find it in the email from Tracy with your install code, sent when you downloaded the ZIP. It is also shown in Tracy: My Sites, the … menu of the site' . $site . ', Export site as ZIP.';
}

/**
 * The install code for a database on another machine. Called under the run's lock (`begin`), so
 * two requests cannot both spend the last attempt. `$unpacked`: the installer's unpack time, which
 * the wrong-code count belongs to. Throws, with `needCode` for the page, until the
 * right code is given; five wrong ones per unpack close this path.
 */
function ti_require_code(string $payload, string $typed, int $unpacked): void
{
    $why = 'The database is not on this server or its private network, so the installer needs the 6-digit install code to send the site there.';
    $raw = @file_get_contents($payload . '/' . TI_CODE_FILE);
    $stored = $raw === false ? null : json_decode($raw, true);
    if (!is_array($stored)) {
        throw new TiRefusal('The database is not on this server or its private network, and this package has no install code, so it can only be installed with a database on this server. Use the database your hosting panel gives this site.');
    }
    $file = $payload . '/' . TI_CODE_ATTEMPTS;
    $record = [];
    $kept = @file_get_contents($file);
    if ($kept !== false && strpos($kept, TI_STATE_GUARD) === 0) {
        $record = json_decode(substr($kept, strlen(TI_STATE_GUARD)), true) ?: [];
    }
    $wrong = ti_code_wrong_count($record, $unpacked);
    if ($wrong >= TI_CODE_MAX_WRONG) {
        throw new TiRefusal('The install code was wrong ' . TI_CODE_MAX_WRONG . ' times, so the installer no longer sends this site to a database on another server. Upload the ZIP again and unpack it over these files to get ' . TI_CODE_MAX_WRONG . ' new tries, or use a database on this server.', ['codeLocked' => true]);
    }
    if (trim($typed) === '') {
        throw new TiRefusal($why . ' ' . ti_code_where(), ['needCode' => true]);
    }
    if (ti_code_matches($typed, $stored)) {
        return;
    }
    $wrong++;
    $raw = TI_STATE_GUARD . json_encode(['unpacked' => $unpacked, 'wrong' => $wrong]);
    if (file_put_contents($file, $raw, LOCK_EX) !== strlen($raw)) {
        throw new TiRefusal('The installer cannot write into its package folder. Check that the web folder is writable by PHP.');
    }
    $left = TI_CODE_MAX_WRONG - $wrong;
    if ($left <= 0) {
        throw new TiRefusal('That install code is not right, and it was the last try. Upload the ZIP again and unpack it over these files to get ' . TI_CODE_MAX_WRONG . ' new tries, or use a database on this server.', ['codeLocked' => true]);
    }
    throw new TiRefusal('That install code is not right. ' . $left . ($left === 1 ? ' try' : ' tries') . ' left. ' . ti_code_where(), ['needCode' => true]);
}

// Everything below runs only as the installer, not when a test includes this file for its functions.
if (defined('TRACY_INSTALLER_LIBRARY')) {
    return;
}

// ── the installer ───────────────────────────────────────────────────────────────────────────────

mysqli_report(MYSQLI_REPORT_OFF);
ini_set('display_errors', '0');

final class TiInstaller
{
    public string $dir;
    public array $state = [];
    /** @var resource|null */
    private $lock = null;
    private float $started;
    private float $budget;

    public function __construct()
    {
        $this->dir = __DIR__;
        $this->started = microtime(true);
        $limit = (int) ini_get('max_execution_time');
        // Stop well inside the host's limit: on Linux it counts CPU time, wall time runs longer.
        $budget = $limit > 0 ? max(1.0, min(20.0, $limit * 0.4)) : 20.0;
        $override = getenv('TRACY_INSTALLER_TEST_BUDGET');
        if ($override !== false && $override !== '') {
            $budget = (float) $override;
        }
        $this->budget = $budget;
    }

    public function timeLeft(): bool
    {
        return microtime(true) - $this->started < $this->budget;
    }

    public function path(string $name): string
    {
        return $this->dir . '/' . $name;
    }

    public function platform(): string
    {
        return TRACY_INSTALLER_PLATFORM;
    }

    public function configName(): string
    {
        return $this->platform() === 'wordpress' ? 'wp-config.php' : 'configuration.php';
    }

    // ── state and lock ─────────────────────────────────────────────────────────────────────────

    public function lock(): bool
    {
        $fh = fopen(__FILE__, 'r');
        if ($fh === false || !flock($fh, LOCK_EX | LOCK_NB)) {
            return false;
        }
        $this->lock = $fh;
        return true;
    }

    public function loadState(): bool
    {
        $file = $this->path(TI_STATE);
        if (!is_file($file)) {
            return false;
        }
        $raw = (string) file_get_contents($file);
        if (strpos($raw, TI_STATE_GUARD) !== 0) {
            return false;
        }
        $state = json_decode(substr($raw, strlen(TI_STATE_GUARD)), true);
        if (!is_array($state)) {
            return false;
        }
        $this->state = $state;
        return true;
    }

    public function saveState(): void
    {
        $file = $this->path(TI_STATE);
        $tmp = $this->path(TI_STATE_TMP);
        $raw = TI_STATE_GUARD . json_encode($this->state, JSON_UNESCAPED_SLASHES);
        $written = file_put_contents($tmp, $raw, LOCK_EX) === strlen($raw);
        @chmod($tmp, 0600);
        ti_fault('state-temp');
        if (!$written || !rename($tmp, $file)) {
            throw new TiRefusal('The installer cannot write its progress file next to installer.php. Check that the web folder is writable by PHP.');
        }
        @chmod($file, 0600);
    }

    public function dropState(): void
    {
        @unlink($this->path(TI_STATE));
        $this->removeLeftovers();
        $this->state = [];
    }

    /** Temporary files a killed request left behind: never needed again, and they hold secrets. */
    public function removeLeftovers(): void
    {
        @unlink($this->path(TI_STATE_TMP));
        foreach (glob($this->dir . '/' . TI_PAYLOAD_GLOB . '/{,.}*' . TI_CONFIG_TMP_SUFFIX, GLOB_BRACE) ?: [] as $file) {
            @unlink($file);
        }
    }

    /**
     * Writes the configuration file through a temporary copy in the payload folder (denied to the
     * web, and `.php` so a server that ignores the denial runs it instead of serving it) and a
     * rename, so a cut request leaves either the old file or the new one, whole.
     */
    public function writeConfig(string $source, string $fault): void
    {
        $this->writeSiteFile($this->configName(), $source, $fault);
    }

    /** `writeConfig` for any file of the site at the root of this folder (`.htaccess` too). */
    public function writeSiteFile(string $name, string $source, string $fault = ''): void
    {
        $file = $this->path($name);
        $tmp = $this->path($this->state['payload'] . '/' . $name . TI_CONFIG_TMP_SUFFIX);
        $written = file_put_contents($tmp, $source) === strlen($source);
        ti_fault($fault . '-temp');
        if (!$written || !rename($tmp, $file)) {
            @unlink($tmp);
            throw new TiRefusal('The installer cannot write ' . $name . '.');
        }
        ti_fault($fault . '-renamed');
    }

    // ── age, owner and payload ─────────────────────────────────────────────────────────────────

    public static function maxAge(): int
    {
        $override = getenv('TRACY_INSTALLER_TEST_MAX_AGE');
        return $override !== false && $override !== '' ? (int) $override : TI_MAX_AGE;
    }

    /** When this file appeared on the server (see the header), and whether that is too long ago. */
    public static function unpackedAt(): int
    {
        clearstatcache(true, __FILE__);
        return (int) filectime(__FILE__);
    }

    public static function expired(): bool
    {
        return time() - self::unpackedAt() > self::maxAge();
    }

    /** Starts a run for this browser: a fresh cookie, its hash kept in the state. */
    public function claim(): void
    {
        $token = bin2hex(random_bytes(16));
        $this->state['owner'] = hash('sha256', $token);
        setcookie(TI_OWNER_COOKIE, $token, [
            'path' => ti_base_path() . '/',
            'secure' => strpos(ti_request_address(), 'https://') === 0,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }

    public function ownedByThisBrowser(): bool
    {
        $token = (string) ($_COOKIE[TI_OWNER_COOKIE] ?? '');
        return $token !== '' && isset($this->state['owner'])
            && hash_equals((string) $this->state['owner'], hash('sha256', $token));
    }

    public function payload(): string
    {
        $found = glob($this->dir . '/' . TI_PAYLOAD_GLOB, GLOB_ONLYDIR) ?: [];
        if (count($found) !== 1) {
            throw new TiRefusal(count($found) === 0
                ? 'The package folder (its name starts with "tracy-package-") is not next to installer.php. Unpack the whole ZIP into this folder.'
                : 'There is more than one package folder (names starting with "tracy-package-") here. Keep only the one that came with this installer.');
        }
        return $found[0];
    }

    public function companions(): array
    {
        $list = json_decode(TRACY_INSTALLER_COMPANIONS, true);
        return is_array($list) ? $list : [];
    }

    // ── the database ───────────────────────────────────────────────────────────────────────────

    /** `$db['target']`: the address `ti_classify_db_host` checked; the run never resolves the name again. */
    public function connect(array $db): mysqli
    {
        $host = $db['target']['host'];
        $port = $db['target']['port'];
        $socket = $db['target']['socket'];
        $link = mysqli_init();
        $link->options(MYSQLI_OPT_CONNECT_TIMEOUT, 10);
        if (!@$link->real_connect($host, $db['user'], $db['password'], $db['name'], $port, $socket)) {
            throw new TiRefusal('The installer cannot connect to the database: ' . mysqli_connect_error() . '. Check the database host, name, user and password.');
        }
        $link->set_charset('utf8mb4');
        $link->autocommit(true);
        return $link;
    }

    public static function q(mysqli $db, string $sql): mysqli_result
    {
        $r = $db->query($sql);
        if (!$r instanceof mysqli_result) {
            throw new TiRefusal('The database answered an error: ' . $db->error);
        }
        return $r;
    }

    public static function exec(mysqli $db, string $sql): void
    {
        if ($db->query($sql) === false) {
            throw new TiRefusal('The database answered an error: ' . $db->error);
        }
    }

    public static function quoteIdent(string $name): string
    {
        return '`' . str_replace('`', '``', $name) . '`';
    }

    // ── the archive ────────────────────────────────────────────────────────────────────────────

    /** Every entry of webroot.tar: [name => [type, size]], refusing anything that is not safe. */
    public function tarIndex(string $tar): array
    {
        $fh = fopen($tar, 'rb');
        if ($fh === false) {
            throw new TiRefusal('The site archive in the package cannot be opened.');
        }
        $entries = [];
        $offset = 0;
        try {
            while (($e = ti_tar_next($fh, $offset)) !== null) {
                [$type, $name, $size] = $e;
                $offset = $e[6];
                $safe = ti_safe_name($name);
                if ($safe === null) {
                    throw new TiRefusal('The site archive holds an entry with an unsafe path (' . substr($name, 0, 120) . '). Nothing was written.');
                }
                if ($type !== '0' && $type !== '5' && $type !== '7') {
                    throw new TiRefusal('The site archive holds an entry that is not a file or a folder (' . substr($safe, 0, 120) . '). Nothing was written.');
                }
                if ($safe === '') {
                    continue;
                }
                $entries[$safe] = [$type === '5' ? 'dir' : 'file', $size];
            }
        } finally {
            fclose($fh);
        }
        return $entries;
    }

    /** One file's bytes out of the tar (small files only: configuration, version). */
    public function tarRead(string $tar, string $wanted, int $max = 4 << 20): ?string
    {
        $fh = fopen($tar, 'rb');
        $offset = 0;
        try {
            while (($e = ti_tar_next($fh, $offset)) !== null) {
                $offset = $e[6];
                if (ti_safe_name($e[1]) === $wanted && ($e[0] === '0' || $e[0] === '7')) {
                    if ($e[2] > $max) {
                        return null;
                    }
                    fseek($fh, $e[5]);
                    return $e[2] > 0 ? (string) fread($fh, $e[2]) : '';
                }
            }
        } finally {
            fclose($fh);
        }
        return null;
    }
}

/** The address suggested from this request: scheme, host and the installer's own folder. */
function ti_request_address(): string
{
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (($_SERVER['REQUEST_SCHEME'] ?? '') === 'https')
        || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    if (!preg_match('/^[A-Za-z0-9.-]+(?::\d+)?$/', $host)) {
        $host = '';
    }
    return ($https ? 'https' : 'http') . '://' . $host . ti_base_path();
}

/** The URL path of the folder installer.php is in, without a trailing slash ('' at the root). */
function ti_base_path(): string
{
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '/installer.php');
    $dir = str_replace('\\', '/', dirname($script));
    return rtrim($dir, '/.');
}

function ti_h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// ── phases ──────────────────────────────────────────────────────────────────────────────────────

/** Phase `check`: everything that can be refused without reading the whole dump. Writes nothing. */
function ti_check(TiInstaller $ti, array $input): array
{
    $errors = [];
    if (version_compare(PHP_VERSION, '7.4.0', '<')) {
        throw new TiRefusal('This installer needs PHP 7.4 or newer; this server runs PHP ' . PHP_VERSION . '.');
    }
    foreach (['mysqli' => 'mysqli', 'zlib' => 'zlib', 'tokenizer' => 'tokenizer', 'json' => 'json'] as $ext => $label) {
        if (!extension_loaded($ext)) {
            $errors[] = 'the PHP extension ' . $label . ' is not enabled';
        }
    }
    if ($errors) {
        throw new TiRefusal('This server cannot run the installer: ' . implode('; ', $errors) . '.');
    }

    $new = rtrim(trim((string) ($input['address'] ?? '')), '/');
    if (!preg_match(TI_ADDRESS, $new, $m)) {
        throw new TiRefusal('The new address must look like https://www.example.com (letters, digits, dots and dashes; an optional path).');
    }
    if (empty($input['confirm'])) {
        throw new TiRefusal('Confirm that the new address is the final address of the site.');
    }
    $newPath = rtrim($m[3] ?? '', '/');
    if ($newPath !== ti_base_path()) {
        throw new TiRefusal('The new address must point at the folder this installer runs in (' . (ti_base_path() === '' ? 'the root of the domain' : ti_base_path()) . '). Installing into another folder is not supported: move the package there and open installer.php from it.');
    }
    $old = TRACY_INSTALLER_OLD_ADDRESS !== '' ? TRACY_INSTALLER_OLD_ADDRESS : rtrim(trim((string) ($input['old_address'] ?? '')), '/');
    if ($old !== '' && !preg_match(TI_ADDRESS, $old)) {
        throw new TiRefusal('The old address must look like https://name.tracy.site.');
    }

    $db = [
        'host' => trim((string) ($input['db_host'] ?? '')) ?: 'localhost',
        'name' => trim((string) ($input['db_name'] ?? '')),
        'user' => trim((string) ($input['db_user'] ?? '')),
        'password' => (string) ($input['db_password'] ?? ''),
    ];
    if ($db['name'] === '' || $db['user'] === '') {
        throw new TiRefusal('Fill in the database name and the database user.');
    }

    $payload = $ti->payload();
    $tar = $payload . '/webroot.tar';
    $dump = $payload . '/db.sql.gz';
    foreach ([$tar, $dump] as $file) {
        if (!is_file($file) || !is_readable($file)) {
            throw new TiRefusal('The package is incomplete: ' . basename($file) . ' is missing from ' . basename($payload) . '. Unpack the whole ZIP again.');
        }
    }
    if (ti_payload_complete($ti) === null) {
        throw new TiRefusal('The package is incomplete: webroot.tar or db.sql.gz in ' . basename($payload) . ' is not the size it was packed at. Wait until the unpacking has finished, or unpack the whole ZIP again.');
    }
    // Before any connection: where the database is, and the code when it is elsewhere.
    $db['target'] = ti_classify_db_host($db['host'], 'ti_resolve', TRACY_INSTALLER_TREAT_AS_REMOTE);
    if (!$db['target']['local']) {
        ti_require_code($payload, (string) ($input['install_code'] ?? ''), TiInstaller::unpackedAt());
    }
    if (!is_writable($ti->dir)) {
        throw new TiRefusal('PHP cannot write into this folder. Give the web server write access to it (your hosting panel can do this) and try again.');
    }

    // The archive: every path safe, nothing of the person's in its way, the folder otherwise empty.
    $entries = $ti->tarIndex($tar);
    $config = $ti->configName();
    if (!isset($entries[$config])) {
        throw new TiRefusal('The site archive holds no ' . $config . '. This package cannot be installed by this installer.');
    }
    $ours = ['installer.php', TI_STATE, TI_STATE_TMP, basename($payload)];
    foreach (array_keys($entries) as $name) {
        $top = explode('/', $name)[0];
        if (in_array($top, $ours, true)) {
            throw new TiRefusal('The site archive holds ' . $name . ', which this installer itself uses. It cannot be installed here.');
        }
    }
    $companions = $ti->companions();
    $blocking = [];
    $removable = [];
    foreach (scandir($ti->dir) ?: [] as $item) {
        if ($item === '.' || $item === '..' || in_array($item, $ours, true)) {
            continue;
        }
        $path = $ti->path($item);
        if (isset($companions[$item]) && is_file($path) && !is_link($path) && hash_file('sha256', $path) === $companions[$item]) {
            // Deleted before the archive is unpacked, so never in its way.
            $removable[$item] = true;
            continue;
        }
        if (substr(strtolower($item), -4) === '.zip' && is_file($path) && ti_zip_is_ours($path, basename($payload))) {
            continue;
        }
        if (in_array($item, TI_HOST_FILES, true) && !isset($entries[$item])) {
            continue;
        }
        $blocking[] = $item;
    }
    if ($blocking) {
        sort($blocking);
        $more = count($blocking) > 12 ? ' and ' . (count($blocking) - 12) . ' more' : '';
        throw new TiRefusal('This folder is not empty. The installer only installs into an empty folder, so it does not overwrite anything. Move or delete these first: ' . implode(', ', array_slice($blocking, 0, 12)) . $more . '.');
    }
    foreach ($entries as $name => [$type]) {
        if (isset($removable[$name])) {
            continue;
        }
        $parts = explode('/', $name);
        $path = $ti->dir;
        foreach ($parts as $k => $part) {
            $path .= '/' . $part;
            if (is_link($path)) {
                throw new TiRefusal('A symbolic link is in the way of ' . $name . '. Remove it and try again.');
            }
            $last = $k === count($parts) - 1;
            if (!file_exists($path)) {
                break;
            }
            if (!$last && !is_dir($path)) {
                throw new TiRefusal($path . ' is in the way of ' . $name . '.');
            }
            if ($last && ($type === 'file' || !is_dir($path))) {
                throw new TiRefusal(substr($path, strlen($ti->dir) + 1) . ' already exists here. The installer does not overwrite files.');
            }
        }
    }

    // The configuration file as packaged: placeholders present, the site's shape in scope.
    $source = $ti->tarRead($tar, $config);
    if ($source === null || strpos($source, TI_PLACEHOLDER) === false) {
        throw new TiRefusal('The ' . $config . ' in the package has no tracy-placeholder values. It is not a package this installer can complete.');
    }
    $facts = ['config' => $config];
    if ($ti->platform() === 'wordpress') {
        $defines = ti_php_defines($source);
        foreach (['MULTISITE', 'WP_ALLOW_MULTISITE'] as $flag) {
            if (isset($defines[$flag])) {
                $value = strtolower(trim(substr($source, $defines[$flag][0], $defines[$flag][1] - $defines[$flag][0])));
                if (!in_array($value, ['false', '0', "''", '""'], true)) {
                    throw new TiRefusal('This WordPress site is a multisite network. The installer moves single sites only.');
                }
            }
        }
        $spans = ti_wp_prefix_spans($source);
        $facts['configPrefix'] = $spans ? ti_php_literal(substr($source, $spans[0][0], $spans[0][1] - $spans[0][0])) : null;
        $version = $ti->tarRead($tar, 'wp-includes/version.php');
        if ($version !== null && preg_match('/\$required_php_version\s*=\s*\'([0-9.]+)\'/', $version, $v)
            && version_compare(PHP_VERSION, $v[1], '<')) {
            throw new TiRefusal('This WordPress version needs PHP ' . $v[1] . ' or newer; this server runs PHP ' . PHP_VERSION . '. Choose a newer PHP version in your hosting panel.');
        }
    } else {
        $settings = ti_joomla_settings($source);
        $facts['configPrefix'] = isset($settings['dbprefix']) ? ti_php_literal($settings['dbprefix'][2]) : null;
        if (!$facts['configPrefix']) {
            throw new TiRefusal('configuration.php states no table prefix ($dbprefix).');
        }
        $dbtype = isset($settings['dbtype']) ? ti_php_literal($settings['dbtype'][2]) : 'mysqli';
        if ($dbtype === 'pdomysql' && !extension_loaded('pdo_mysql')) {
            throw new TiRefusal('This Joomla site uses the PDO MySQL driver, which is not enabled on this server.');
        }
        if (!in_array($dbtype, ['mysqli', 'mysql', 'pdomysql'], true)) {
            throw new TiRefusal('This Joomla site uses the database driver "' . $dbtype . '"; the installer supports MySQL and MariaDB only.');
        }
        $index = $ti->tarRead($tar, 'index.php');
        if ($index !== null && preg_match("/define\\('JOOMLA_MINIMUM_PHP',\\s*'([0-9.]+)'\\)/", $index, $v)
            && version_compare(PHP_VERSION, $v[1], '<')) {
            throw new TiRefusal('This Joomla version needs PHP ' . $v[1] . ' or newer; this server runs PHP ' . PHP_VERSION . '. Choose a newer PHP version in your hosting panel.');
        }
    }

    // The database: reachable, and nothing in it with the package's prefix.
    $link = $ti->connect($db);
    $version = (string) $link->server_info;
    $prefix = (string) $facts['configPrefix'];
    if ($prefix !== '') {
        $like = $link->real_escape_string(addcslashes($prefix, '\\%_')) . '%';
        $r = TiInstaller::q($link, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '$like'");
        if ((int) $r->fetch_row()[0] > 0) {
            throw new TiRefusal('The database "' . $db['name'] . '" already has tables starting with "' . $prefix . '". Use a new, empty database: the installer never deletes or overwrites tables.');
        }
    }
    $link->close();

    return [
        'phase' => 'scan',
        'db' => $db,
        'address' => ['old' => $old, 'new' => $new],
        'payload' => basename($payload),
        'facts' => $facts + ['server' => $version, 'entries' => count($entries)],
        'scan' => ['offset' => 0, 'delimiter' => ';', 'tables' => [], 'views' => [], 'objects' => [], 'needs' => [], 'largest' => 0, 'statements' => 0],
        'notes' => [],
    ];
}

function ti_zip_is_ours(string $path, string $payload): bool
{
    $size = filesize($path);
    $fh = @fopen($path, 'rb');
    if ($fh === false || $size === false) {
        return false;
    }
    $read = (int) min($size, 4 << 20);
    fseek($fh, $size - $read);
    $tail = (string) fread($fh, $read);
    fclose($fh);
    return strpos($tail, $payload . '/') !== false;
}

/** The payload folder when it is unpacked whole (both big files at their packaged sizes), else null. */
function ti_payload_complete(TiInstaller $ti): ?string
{
    $found = glob($ti->dir . '/' . TI_PAYLOAD_GLOB, GLOB_ONLYDIR) ?: [];
    if (count($found) !== 1) {
        return null;
    }
    $sizes = json_decode(TRACY_INSTALLER_PAYLOAD_SIZES, true);
    foreach (['webroot.tar', 'db.sql.gz'] as $name) {
        $path = $found[0] . '/' . $name;
        clearstatcache(true, $path);
        if (!is_file($path) || (is_array($sizes) && isset($sizes[$name]) && filesize($path) !== (int) $sizes[$name])) {
            return null;
        }
    }
    return $found[0];
}

/**
 * Deletes the uploaded ZIP once the payload it holds is unpacked whole: the installer reads only
 * the folder, and the ZIP is the whole site and database under a guessable name. Returns the
 * names that could not be deleted.
 */
function ti_remove_uploaded_zips(TiInstaller $ti): array
{
    $payload = ti_payload_complete($ti);
    if ($payload === null) {
        return [];
    }
    $failed = [];
    foreach (scandir($ti->dir) ?: [] as $item) {
        $path = $ti->path($item);
        if (substr(strtolower($item), -4) === '.zip' && is_file($path) && !is_link($path) && ti_zip_is_ours($path, basename($payload))
            && !@unlink($path)) {
            $failed[] = $item;
        }
    }
    return $failed;
}

/** Test hook: with TRACY_INSTALLER_TEST_FAULT naming `$point`, the request dies there, once. */
function ti_fault(string $point): void
{
    $faults = getenv('TRACY_INSTALLER_TEST_FAULT');
    if ($faults === false || !in_array($point, explode(',', $faults), true)) {
        return;
    }
    $marker = sys_get_temp_dir() . '/tracy-installer-fault-' . $point . '-' . md5(__DIR__);
    if (!is_file($marker) && touch($marker)) {
        exit;
    }
}

/** Phase `scan`: read the dump once, collect what it creates, refuse what cannot be imported. */
function ti_scan(TiInstaller $ti): ?string
{
    $s = &$ti->state['scan'];
    $dump = $ti->path($ti->state['payload'] . '/db.sql.gz');
    $reader = new TiSqlReader($dump, (int) $s['offset'], (string) $s['delimiter']);
    try {
        while (true) {
            $next = $reader->next();
            if ($next === null) {
                break;
            }
            [$sql, $end] = $next;
            [$kind, $name] = ti_sql_classify($sql);
            $s['statements']++;
            $s['largest'] = max($s['largest'], strlen($sql));
            switch ($kind) {
                case 'table':
                    $s['tables'][$name] = true;
                    break;
                case 'view':
                    $s['views'][$name] = true;
                    break;
                case 'trigger':
                case 'procedure':
                case 'function':
                case 'event':
                    $s['objects'][] = [$kind, $name];
                    break;
                case 'global':
                    throw new TiRefusal('The database file changes a global server setting (SET GLOBAL), which needs the SUPER privilege. It was not made by Tracy; nothing was written.');
                case 'database':
                    throw new TiRefusal('The database file creates or switches databases (CREATE DATABASE / USE). It was not made by Tracy; nothing was written.');
                case 'other':
                    $head = substr(preg_replace('/\s+/', ' ', $sql), 0, 60);
                    throw new TiRefusal('The database file holds a statement the installer does not import (' . $head . '…). Nothing was written.');
            }
            $s['offset'] = $end;
            $s['delimiter'] = $reader->delimiter;
            if (!$ti->timeLeft()) {
                return 'Reading the database file: ' . number_format($end / 1048576, 1) . ' MB';
            }
        }
    } finally {
        $reader->close();
    }

    // Every name the dump will create must be free; checked once the whole list is known.
    $link = $ti->connect($ti->state['db']);
    $taken = [];
    $tables = array_keys($s['tables'] + $s['views']);
    foreach (array_chunk($tables, 200) as $chunk) {
        $list = implode(',', array_map(fn ($t) => "'" . $link->real_escape_string($t) . "'", $chunk));
        $r = TiInstaller::q($link, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ($list)");
        while ($row = $r->fetch_row()) {
            $taken[] = $row[0];
        }
    }
    $queries = [
        'trigger' => "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = '%s'",
        'procedure' => "SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_NAME = '%s'",
        'function' => "SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'FUNCTION' AND ROUTINE_NAME = '%s'",
        'event' => "SELECT EVENT_NAME FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE() AND EVENT_NAME = '%s'",
    ];
    foreach ($s['objects'] as [$kind, $name]) {
        $r = TiInstaller::q($link, sprintf($queries[$kind], $link->real_escape_string($name)));
        if ($r->fetch_row()) {
            $taken[] = $kind . ' ' . $name;
        }
    }
    if ($taken) {
        $link->close();
        throw new TiRefusal('The database "' . $ti->state['db']['name'] . '" already has ' . implode(', ', array_slice($taken, 0, 10)) . (count($taken) > 10 ? ' and ' . (count($taken) - 10) . ' more' : '') . '. Use a new, empty database: the installer never deletes or overwrites anything.');
    }

    // The table prefix the dump holds, against the configuration file's.
    $prefix = ti_dump_prefix($ti->platform(), array_keys($s['tables']));
    if ($prefix === null) {
        $link->close();
        throw new TiRefusal('The database file does not hold the ' . ($ti->platform() === 'wordpress' ? 'WordPress options and posts tables' : 'Joomla extensions and content tables') . '. It is not a complete site.');
    }
    if ($ti->platform() === 'wordpress' && (isset($s['tables'][$prefix . 'blogs']) || isset($s['tables'][$prefix . 'site']))) {
        $link->close();
        throw new TiRefusal('This WordPress site is a multisite network. The installer moves single sites only.');
    }
    $configPrefix = $ti->state['facts']['configPrefix'];
    if ($ti->platform() === 'joomla' && $configPrefix !== $prefix) {
        $link->close();
        throw new TiRefusal('configuration.php names the table prefix "' . $configPrefix . '" but the database file holds "' . $prefix . '". Changing the prefix is not supported.');
    }
    $ti->state['facts']['prefix'] = $prefix;
    if ($prefix !== $configPrefix) {
        $like = $link->real_escape_string(addcslashes($prefix, '\\%_')) . '%';
        $r = TiInstaller::q($link, "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '$like'");
        if ((int) $r->fetch_row()[0] > 0) {
            $link->close();
            throw new TiRefusal('The database "' . $ti->state['db']['name'] . '" already has tables starting with "' . $prefix . '". Use a new, empty database.');
        }
    }

    // What the server will refuse: a statement over its packet size, routines under binary logging.
    $packet = (int) TiInstaller::q($link, 'SELECT @@max_allowed_packet')->fetch_row()[0];
    if ($s['largest'] + 1024 > $packet) {
        $link->close();
        throw new TiRefusal('The database file has a statement of ' . number_format($s['largest']) . ' bytes, more than this database server accepts in one go (max_allowed_packet = ' . number_format($packet) . '). Ask your host to raise max_allowed_packet, then start again.');
    }
    $kinds = array_unique(array_map(fn ($o) => $o[0], $s['objects']));
    if (array_intersect($kinds, ['trigger', 'function', 'procedure'])) {
        $row = TiInstaller::q($link, 'SELECT @@log_bin, @@log_bin_trust_function_creators')->fetch_row();
        if ((int) $row[0] === 1 && (int) $row[1] === 0 && !ti_has_super($link)) {
            $names = array_map(fn ($o) => $o[0] . ' ' . $o[1], $s['objects']);
            $link->close();
            throw new TiRefusal('The database file creates ' . implode(', ', array_slice($names, 0, 6)) . '. With binary logging on, this server only lets a user with the SUPER privilege create them. Ask your host to set log_bin_trust_function_creators = 1 (or to grant SUPER), then start again. Nothing was written.');
        }
    }
    $link->close();

    $ti->state['phase'] = 'extract';
    $ti->state['extract'] = ['offset' => 0, 'file' => null, 'written' => 0, 'files' => 0, 'skipped' => []];
    return null;
}

function ti_has_super(mysqli $link): bool
{
    $r = $link->query('SHOW GRANTS FOR CURRENT_USER()');
    if (!$r instanceof mysqli_result) {
        return false;
    }
    while ($row = $r->fetch_row()) {
        if (preg_match('/GRANT (?:ALL PRIVILEGES|.*\bSUPER\b).* ON \*\.\*/i', $row[0])) {
            return true;
        }
    }
    return false;
}

/** The table prefix from the dump's table names: the one whose core tables are all there. */
function ti_dump_prefix(string $platform, array $tables): ?string
{
    $set = array_flip($tables);
    $anchor = $platform === 'wordpress' ? 'options' : 'extensions';
    $partner = $platform === 'wordpress' ? 'posts' : 'content';
    $found = [];
    foreach ($tables as $t) {
        if (substr($t, -strlen($anchor)) === $anchor) {
            $prefix = substr($t, 0, -strlen($anchor));
            if (isset($set[$prefix . $partner])) {
                $found[] = $prefix;
            }
        }
    }
    return count($found) === 1 ? $found[0] : null;
}

/** Phase `extract`: webroot.tar into this folder, one entry at a time, resumable inside a file. */
function ti_extract(TiInstaller $ti): ?string
{
    $x = &$ti->state['extract'];
    if ((int) $x['offset'] === 0 && $x['file'] === null && empty($x['companionsRemoved'])) {
        // The package's own README and placeholder page go before the site's files come in.
        foreach ($ti->companions() as $name => $sha) {
            $path = $ti->path($name);
            if (is_file($path) && !is_link($path) && hash_file('sha256', $path) === $sha) {
                @unlink($path);
            }
        }
        $x['companionsRemoved'] = true;
    }
    $tar = $ti->path($ti->state['payload'] . '/webroot.tar');
    $fh = fopen($tar, 'rb');
    try {
        while (true) {
            $e = ti_tar_next($fh, (int) $x['offset']);
            if ($e === null) {
                break;
            }
            [$type, $name, $size, $mode, $mtime, $data, $next] = $e;
            $safe = ti_safe_name($name);
            if ($safe === null || ($type !== '0' && $type !== '5' && $type !== '7')) {
                throw new TiRefusal('The site archive changed since it was checked. Start again with a fresh copy of the package.');
            }
            $target = $ti->path($safe);
            if ($safe === '') {
                // The archive's root folder.
            } elseif ($type === '5') {
                if (!is_dir($target) && !@mkdir($target, 0755, true)) {
                    throw new TiRefusal('The installer cannot create the folder ' . $safe . '.');
                }
            } elseif (ti_is_access_file($safe)) {
                // Tracy's auto-login trusts headers only Tracy's proxy sets. Never unpacked.
                $x['skipped'][] = $safe;
            } else {
                $dir = dirname($target);
                if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
                    throw new TiRefusal('The installer cannot create the folder ' . dirname($safe) . '.');
                }
                $resume = $x['file'] === $safe ? (int) $x['written'] : 0;
                $out = fopen($target, $resume > 0 ? 'cb' : 'wb');
                if ($out === false) {
                    throw new TiRefusal('The installer cannot write ' . $safe . '. Check the folder permissions.');
                }
                if ($resume > 0) {
                    ftruncate($out, $resume);
                    fseek($out, $resume);
                }
                fseek($fh, $data + $resume);
                $left = $size - $resume;
                $x['file'] = $safe;
                $x['written'] = $resume;
                while ($left > 0) {
                    $chunk = fread($fh, (int) min($left, 1 << 20));
                    if ($chunk === false || $chunk === '') {
                        fclose($out);
                        throw new TiRefusal('The site archive in the package ends early.');
                    }
                    if (fwrite($out, $chunk) !== strlen($chunk)) {
                        fclose($out);
                        throw new TiRefusal('Writing ' . $safe . ' failed. Is the disk full?');
                    }
                    $left -= strlen($chunk);
                    $x['written'] += strlen($chunk);
                    if ($left > 0 && !$ti->timeLeft()) {
                        fclose($out);
                        return 'Unpacking files: ' . $x['files'] . ' done, ' . $safe;
                    }
                }
                fclose($out);
                @chmod($target, ($mode & 0111) ? 0755 : 0644);
                if ($mtime > 0) {
                    @touch($target, $mtime);
                }
                $x['files']++;
            }
            $x['offset'] = $next;
            $x['file'] = null;
            $x['written'] = 0;
            if (!$ti->timeLeft()) {
                return 'Unpacking files: ' . $x['files'] . ' done';
            }
        }
    } finally {
        fclose($fh);
    }
    $ti->state['phase'] = 'import';
    $ti->state['import'] = ['offset' => 0, 'delimiter' => ';', 'sets' => [], 'pending' => null, 'rows' => [], 'statements' => 0];
    return null;
}

/** Phase `import`: the dump, statement by statement, with a checkpoint around each write. */
function ti_import(TiInstaller $ti): ?string
{
    $im = &$ti->state['import'];
    $link = $ti->connect($ti->state['db']);
    $mariadb = stripos((string) $link->server_info, 'mariadb') !== false;
    // A new connection has none of the dump's session settings: give them back first.
    foreach ($im['sets'] as $set) {
        if ($link->query($set) === false) {
            throw new TiRefusal('The database refused a session setting from the database file (' . substr($set, 0, 80) . '): ' . $link->error);
        }
    }
    $fault = getenv('TRACY_INSTALLER_TEST_FAULT') ?: '';
    $trace = getenv('TRACY_INSTALLER_TEST_TRACE') ?: '';
    $log = function (string $line) use ($trace) {
        if ($trace !== '') {
            file_put_contents($trace, getmypid() . ' ' . $line . "\n", FILE_APPEND);
        }
    };
    $log('start offset=' . $im['offset'] . ' pending=' . json_encode($im['pending']));
    $reader = new TiSqlReader($ti->path($ti->state['payload'] . '/db.sql.gz'), (int) $im['offset'], (string) $im['delimiter']);
    try {
        while (true) {
            $next = $reader->next();
            if ($next === null) {
                break;
            }
            [$sql, $end] = $next;
            [$kind, $name] = ti_sql_classify($sql);
            $pending = $im['pending'];
            $im['pending'] = null;
            if ($kind === 'skip' || $kind === 'empty' || (!$mariadb && ti_mariadb_only($sql))) {
                // LOCK TABLES needs a privilege shared hosts often withhold, and protects nothing here.
                $im['offset'] = $end;
                $im['delimiter'] = $reader->delimiter;
                continue;
            }
            if (in_array($kind, ['table', 'view', 'trigger', 'procedure', 'function', 'event'], true)) {
                $sql = ti_strip_definer($sql);
            }
            $writes = in_array($kind, ['insert', 'table', 'view', 'trigger', 'procedure', 'function', 'event'], true);
            if ($writes && $pending !== null && (int) $pending['end'] === $end) {
                // The request before this one was cut around this statement: did it apply?
                $log('check end=' . $end . ' ' . $kind . ' ' . $name . ' before=' . json_encode($pending['before']));
                if (ti_applied($link, $pending, $kind, $name)) {
                    $log('applied already');
                    if ($kind === 'insert') {
                        $im['rows'][$name] = ti_count($link, (string) $name);
                    }
                    $im['offset'] = $end;
                    $im['delimiter'] = $reader->delimiter;
                    $im['statements']++;
                    $ti->saveState();
                    continue;
                }
            }
            if ($writes) {
                if ($kind === 'insert' && !isset($im['rows'][$name])) {
                    $im['rows'][$name] = ti_count($link, $name);
                }
                $im['pending'] = ['end' => $end, 'kind' => $kind, 'name' => $name, 'before' => $kind === 'insert' ? $im['rows'][$name] : null];
                $ti->saveState();
            }
            if ($link->query($sql) === false) {
                $errno = $link->errno;
                $error = $link->error;
                $im['pending'] = null;
                $ti->saveState();
                throw new TiRefusal(ti_import_error($errno, $error, $kind, $name, $sql));
            }
            if ($kind === 'set') {
                $im['sets'] = ti_remember_set($im['sets'], $sql);
                // Every checkpoint assumes the write before it is committed.
                if ((int) TiInstaller::q($link, 'SELECT @@autocommit')->fetch_row()[0] !== 1) {
                    throw new TiRefusal('A statement in the database file switched off autocommit (' . substr(preg_replace('/\s+/', ' ', $sql), 0, 80) . '). The installer cannot import it safely.');
                }
            }
            if ($kind === 'table') {
                $im['rows'][$name] = 0;
            }
            if ($kind === 'insert') {
                $im['rows'][$name] += max(0, (int) $link->affected_rows);
            }
            if ($writes) {
                $log('done end=' . $end . ' ' . $kind . ' ' . $name . ' affected=' . $link->affected_rows . ' rows=' . ($im['rows'][$name] ?? '-'));
            }
            $im['statements']++;
            if ($writes && $fault !== '' && preg_match('/^after-commit:(\d+)$/', $fault, $f) && $im['statements'] >= (int) $f[1]) {
                // Test hook: once, the request dies after the server applied a write, before the checkpoint.
                $marker = sys_get_temp_dir() . '/tracy-installer-fault-after-commit-' . md5(__DIR__);
                if (!is_file($marker) && touch($marker)) {
                    exit;
                }
            }
            $im['pending'] = null;
            $im['offset'] = $end;
            $im['delimiter'] = $reader->delimiter;
            if ($writes) {
                $ti->saveState();
            }
            if (!$ti->timeLeft()) {
                $ti->saveState();
                return 'Importing the database: ' . number_format($end / 1048576, 1) . ' MB, ' . number_format($im['statements']) . ' statements';
            }
        }
    } finally {
        $reader->close();
        $link->close();
    }
    $ti->state['phase'] = 'replace';
    $ti->state['replace'] = ['table' => 0, 'after' => null, 'rows' => 0, 'values' => 0, 'malformed' => 0, 'skippedSerialized' => 0, 'old' => null];
    return null;
}

/** Whether a write the last request may have been cut around is in the database already. */
function ti_applied(mysqli $link, array $pending, string $kind, ?string $name): bool
{
    if ($kind === 'insert') {
        $now = ti_count($link, (string) $name);
        if ($now === (int) $pending['before']) {
            return false;
        }
        // One INSERT is atomic on the server: the count moved, so all of it is in.
        return true;
    }
    $queries = [
        'table' => "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '%s'",
        'view' => "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '%s'",
        'trigger' => "SELECT 1 FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = '%s'",
        'procedure' => "SELECT 1 FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_NAME = '%s'",
        'function' => "SELECT 1 FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'FUNCTION' AND ROUTINE_NAME = '%s'",
        'event' => "SELECT 1 FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE() AND EVENT_NAME = '%s'",
    ];
    $r = TiInstaller::q($link, sprintf($queries[$kind], $link->real_escape_string((string) $name)));
    return (bool) $r->fetch_row();
}

function ti_count(mysqli $link, string $table): int
{
    return (int) TiInstaller::q($link, 'SELECT COUNT(*) FROM ' . TiInstaller::quoteIdent($table))->fetch_row()[0];
}

function ti_import_error(int $errno, string $error, string $kind, ?string $name, string $sql): string
{
    $what = $name !== null ? $kind . ' ' . $name : substr(preg_replace('/\s+/', ' ', $sql), 0, 60) . '…';
    $privilege = [1044, 1045, 1142, 1143, 1227, 1370, 1419];
    if (in_array($errno, $privilege, true)) {
        return 'The database user lacks a privilege the site needs (' . $what . '): ' . $error . '. Ask your host to grant it, then press Try again: the import continues where it stopped. The database now holds part of the site.';
    }
    if ($errno === 2006 || $errno === 1153 || $errno === 2013) {
        return 'The database server dropped the connection while importing ' . $what . ' (' . $error . '). This usually means max_allowed_packet is too small. Ask your host, then press Try again.';
    }
    return 'The database refused ' . $what . ' (error ' . $errno . ': ' . $error . '). The import stopped here; the database now holds part of the site. Press Try again once the cause is fixed.';
}

/** Phase `replace`: the old address for the new one, in the tables this install created. */
function ti_replace(TiInstaller $ti): ?string
{
    $r = &$ti->state['replace'];
    $link = $ti->connect($ti->state['db']);
    $prefix = $ti->state['facts']['prefix'];
    try {
        if ($r['old'] === null) {
            $old = $ti->state['address']['old'];
            if ($old === '' && $ti->platform() === 'wordpress') {
                $row = TiInstaller::q($link, 'SELECT option_value FROM ' . TiInstaller::quoteIdent($prefix . 'options') . " WHERE option_name = 'home'")->fetch_row();
                $old = $row ? rtrim((string) $row[0], '/') : '';
                if (!preg_match(TI_ADDRESS, $old)) {
                    $old = '';
                }
            }
            $r['old'] = $old;
            $ti->state['address']['old'] = $old;
        }
        $old = $r['old'];
        $new = $ti->state['address']['new'];
        if ($old === '' || $old === $new) {
            if ($old === '') {
                $ti->state['notes'][] = 'The package does not say which address the site had on Tracy, so no address was replaced in the database. Links that start with the old address still point there.';
            }
            $ti->state['phase'] = 'configure';
            return null;
        }
        $map = ti_address_map($old, $new);
        $host = preg_replace('#^https?://#', '', $old);
        $like = $link->real_escape_string('%' . addcslashes($host, '\\%_') . '%');
        $tables = array_keys($ti->state['scan']['tables']);
        sort($tables);
        while ($r['table'] < count($tables)) {
            $table = $tables[$r['table']];
            $q = TiInstaller::quoteIdent($table);
            $columns = [];
            $keys = [];
            $res = TiInstaller::q($link, "SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '" . $link->real_escape_string($table) . "' ORDER BY ORDINAL_POSITION");
            while ($c = $res->fetch_assoc()) {
                if (in_array(strtolower($c['DATA_TYPE']), TI_TEXT_TYPES, true)
                    && !($ti->platform() === 'wordpress' && $c['COLUMN_NAME'] === 'guid')) {
                    $columns[] = $c['COLUMN_NAME'];
                }
            }
            $res = TiInstaller::q($link, 'SHOW KEYS FROM ' . $q . " WHERE Key_name = 'PRIMARY'");
            $seq = [];
            while ($k = $res->fetch_assoc()) {
                $seq[(int) $k['Seq_in_index']] = $k['Column_name'];
            }
            ksort($seq);
            $keys = array_values($seq);
            if (!$columns) {
                $r['table']++;
                $r['after'] = null;
                continue;
            }
            $match = '(' . implode(' OR ', array_map(fn ($c) => TiInstaller::quoteIdent($c) . " LIKE '$like'", $columns)) . ')';
            if (!$keys) {
                // No primary key: rows cannot be told apart, so a plain replace in SQL, and
                // serialized values (whose lengths SQL cannot count) are left and counted.
                $serial = "'^(a:[0-9]+:\\\\{|O:[0-9]+:\"|s:[0-9]+:\")'";
                foreach ($columns as $c) {
                    $qc = TiInstaller::quoteIdent($c);
                    $r['skippedSerialized'] += (int) TiInstaller::q($link, "SELECT COUNT(*) FROM $q WHERE $qc LIKE '$like' AND $qc REGEXP $serial")->fetch_row()[0];
                    $expr = $qc;
                    foreach ($map as $from => $to) {
                        $expr = "REPLACE($expr, '" . $link->real_escape_string($from) . "', '" . $link->real_escape_string($to) . "')";
                    }
                    TiInstaller::exec($link, "UPDATE $q SET $qc = $expr WHERE $qc LIKE '$like' AND NOT ($qc REGEXP $serial)");
                    $r['values'] += $link->affected_rows;
                }
                $r['table']++;
                $r['after'] = null;
                continue;
            }
            $keyList = implode(', ', array_map([TiInstaller::class, 'quoteIdent'], $keys));
            $where = $match;
            if ($r['after'] !== null) {
                $values = implode(', ', array_map(fn ($v) => "'" . $link->real_escape_string((string) $v) . "'", $r['after']));
                $where .= " AND ($keyList) > ($values)";
            }
            $select = 'SELECT ' . $keyList . ', ' . implode(', ', array_map([TiInstaller::class, 'quoteIdent'], $columns)) . " FROM $q WHERE $where ORDER BY $keyList LIMIT 200";
            $res = TiInstaller::q($link, $select);
            $rows = $res->fetch_all(MYSQLI_NUM);
            foreach ($rows as $row) {
                $keyValues = array_slice($row, 0, count($keys));
                $sets = [];
                foreach ($columns as $n => $c) {
                    $value = $row[count($keys) + $n];
                    if ($value === null) {
                        continue;
                    }
                    $replaced = ti_replace_value($value, $map, $r['malformed']);
                    if ($replaced !== $value) {
                        $sets[] = TiInstaller::quoteIdent($c) . " = '" . $link->real_escape_string($replaced) . "'";
                        $r['values']++;
                    }
                }
                if ($sets) {
                    $cond = implode(' AND ', array_map(fn ($k, $v) => TiInstaller::quoteIdent($k) . " = '" . $link->real_escape_string((string) $v) . "'", $keys, $keyValues));
                    TiInstaller::exec($link, "UPDATE $q SET " . implode(', ', $sets) . " WHERE $cond");
                    $r['rows']++;
                }
                $r['after'] = $keyValues;
            }
            if (count($rows) < 200) {
                $r['table']++;
                $r['after'] = null;
            }
            // Each batch is committed: a request killed after it does not redo it.
            $ti->saveState();
            if (!$ti->timeLeft()) {
                return 'Replacing the old address: table ' . ($r['table'] + 1) . ' of ' . count($tables);
            }
        }
    } finally {
        $link->close();
    }
    $ti->state['phase'] = 'configure';
    return null;
}

/** Phase `configure`: the configuration file for a plain host, and Tracy's auto-login off. */
function ti_configure(TiInstaller $ti): ?string
{
    $file = $ti->path($ti->configName());
    $source = (string) file_get_contents($file);
    $new = $ti->state['address']['new'];
    $old = $ti->state['address']['old'];
    $prefix = $ti->state['facts']['prefix'];
    $changes = [];
    $link = $ti->connect($ti->state['db']);
    try {
        if ($ti->platform() === 'wordpress') {
            foreach (['WP_HOME', 'WP_SITEURL'] as $name) {
                $defines = ti_php_defines($source);
                if (isset($defines[$name])) {
                    $source = ti_splice($source, $defines[$name][0], $defines[$name][1], ti_php_string($new));
                    $changes[] = ti_change($name . ' set to ' . $new . ' in wp-config.php.');
                }
            }
            $spans = ti_wp_prefix_spans($source);
            if ($spans) {
                $current = ti_php_literal(substr($source, $spans[0][0], $spans[0][1] - $spans[0][0]));
                if ($current !== $prefix) {
                    // Tracy's own containers compute it from an environment variable no plain host has.
                    $source = ti_splice($source, $spans[0][0], $spans[0][1], ti_php_string($prefix));
                    $changes[] = ti_change('The table prefix is now written in wp-config.php as \'' . $prefix . '\'.');
                }
            } else {
                throw new TiRefusal('wp-config.php has no $table_prefix line. It cannot be completed.');
            }
            foreach (TI_ACCESS_FILES as $access) {
                if (file_exists($ti->path($access))) {
                    if (!@unlink($ti->path($access))) {
                        throw new TiRefusal('Tracy\'s sign-in plugin ' . $access . ' is in the site and cannot be deleted. Delete it by hand, then press Try again: the installer does not finish while it is there.');
                    }
                }
            }
            $ht = $ti->path('.htaccess');
            $base = ti_base_path();
            if ($base !== '' && is_file($ht)) {
                $text = (string) file_get_contents($ht);
                $fixed = ti_wp_rewrite_base($text, $base);
                if ($fixed !== $text) {
                    $ti->writeSiteFile('.htaccess', $fixed);
                    $changes[] = ti_change('The rewrite rules in .htaccess now name the folder ' . $base . '/.');
                }
            }
        } else {
            $settings = ti_joomla_settings($source);
            $values = [
                'live_site' => ti_php_string($new),
                'tmp_path' => ti_php_string($ti->dir . '/tmp'),
                'log_path' => ti_php_string($ti->dir . '/administrator/logs'),
                // Tracy's server ends TLS in front of the site and trusts the proxy's headers; a plain
                // host does neither. Redirecting to https is the person's choice once it works.
                'force_ssl' => '0',
                'behind_loadbalancer' => '0',
            ];
            $changes[] = ti_change('$live_site set to ' . $new . '.');
            $changes[] = ti_change('$tmp_path and $log_path set to folders inside ' . $ti->dir . '.');
            $changes[] = ti_change('"Behind Load Balancer" is off.');
            $changes[] = ti_change('Force HTTPS is off. Turn it on in System → Global Configuration → Server once https works on this host.', true);
            $mailer = isset($settings['mailer']) ? ti_php_literal($settings['mailer'][2]) : null;
            if (!in_array($mailer, ['mail', 'smtp', 'sendmail'], true)) {
                $values['mailer'] = "'mail'";
                $changes[] = ti_change('Mail now goes through PHP mail() (it was off on Tracy). If your host needs SMTP, set it in System → Global Configuration → Server.', true);
            }
            $cookie = isset($settings['cookie_domain']) ? (string) ti_php_literal($settings['cookie_domain'][2]) : '';
            $oldHost = $old !== '' ? (string) parse_url($old, PHP_URL_HOST) : '';
            if ($cookie !== '' && (($oldHost !== '' && stripos($oldHost, ltrim($cookie, '.')) !== false) || stripos($cookie, 'tracy') !== false)) {
                $values['cookie_domain'] = "''";
                $changes[] = ti_change('The cookie domain named Tracy\'s address; it is now empty.');
            }
            $source = ti_joomla_set($source, $values);
            if (!is_file($ti->path('.htaccess')) && is_file($ti->path('htaccess.txt'))) {
                $sef = isset($settings['sef_rewrite']) ? trim($settings['sef_rewrite'][2], "'\" ") : '0';
                if ($sef === '1' || strtolower($sef) === 'true') {
                    // Through a temporary copy: a half-written .htaccess would be skipped on a rerun.
                    $text = file_get_contents($ti->path('htaccess.txt'));
                    if ($text !== false) {
                        $ti->writeSiteFile('.htaccess', $text);
                        $changes[] = ti_change('htaccess.txt was copied to .htaccess, because the site uses URL rewriting.');
                    }
                }
            }
            // Tracy's auto-login plugin (shipped in pkg_claudecowork) signs in anyone who sends its
            // headers once it is off Tracy's network. Switched off before the site goes live.
            $ext = TiInstaller::quoteIdent($prefix . 'extensions');
            TiInstaller::exec($link, "UPDATE $ext SET enabled = 0 WHERE type = 'plugin' AND folder = 'system' AND element = 'tracyaccess'");
            if ($link->affected_rows > 0) {
                $changes[] = ti_change('Tracy\'s sign-in plugin (System - Tracy Access) is switched off.');
            }
            $left = (int) TiInstaller::q($link, "SELECT COUNT(*) FROM $ext WHERE type = 'plugin' AND folder = 'system' AND element = 'tracyaccess' AND enabled <> 0")->fetch_row()[0];
            if ($left > 0) {
                throw new TiRefusal('Tracy\'s sign-in plugin could not be switched off in the database. The installer does not finish while it is on.');
            }
        }
        $after = $source;
        if ($old !== '') {
            $oldHost = (string) parse_url($old, PHP_URL_HOST);
            if ($oldHost !== '' && stripos($after, $oldHost) !== false) {
                $changes[] = ti_change($ti->configName() . ' still mentions ' . $oldHost . ' somewhere the installer did not change. Check it.', true);
            }
        }
        // A run again after a kill finds some changes already made and does not list them: what
        // the earlier attempt listed is kept.
        $ti->state['changes'] = ti_merge_changes($ti->state['changes'] ?? [], $changes);
        $ti->saveState();
        $ti->writeConfig($source, 'config');
    } finally {
        $link->close();
    }
    $ti->state['phase'] = 'credentials';
    return null;
}

/** Phase `credentials`: the database settings, last of all — after this the site is live. */
function ti_credentials(TiInstaller $ti): ?string
{
    $file = $ti->path($ti->configName());
    $source = (string) file_get_contents($file);
    $db = $ti->state['db'];
    foreach (TI_ACCESS_FILES as $access) {
        if ($ti->platform() === 'wordpress' && file_exists($ti->path($access))) {
            throw new TiRefusal('Tracy\'s sign-in plugin ' . $access . ' is in the site. Delete it, then press Try again.');
        }
    }
    $filled = ti_fill_credentials($ti->platform(), $source, $db);
    if ($filled !== $source) {
        $ti->writeConfig($filled, 'credentials');
    }
    $ti->state['phase'] = 'cleanup';
    return null;
}

/** Phase `cleanup`: everything the package brought that is not the site, this file last. */
function ti_cleanup(TiInstaller $ti): array
{
    $failed = [];
    $payload = $ti->path($ti->state['payload']);
    foreach (scandir($payload) ?: [] as $item) {
        if ($item !== '.' && $item !== '..' && !@unlink($payload . '/' . $item)) {
            $failed[] = $ti->state['payload'] . '/' . $item;
        }
    }
    if (is_dir($payload) && !@rmdir($payload)) {
        $failed[] = $ti->state['payload'] . '/';
    }
    foreach ($ti->companions() as $name => $sha) {
        $path = $ti->path($name);
        if (is_file($path) && hash_file('sha256', $path) === $sha && !@unlink($path)) {
            $failed[] = $name;
        }
    }
    $zips = [];
    foreach (scandir($ti->dir) ?: [] as $item) {
        if (substr(strtolower($item), -4) === '.zip' && is_file($ti->path($item)) && ti_zip_is_ours($ti->path($item), $ti->state['payload'])) {
            $zips[] = $item;
        }
    }
    foreach ($zips as $zip) {
        if (!@unlink($ti->path($zip))) {
            $failed[] = $zip;
        }
    }
    $state = $ti->state;
    $ti->dropState();
    if (file_exists($ti->path(TI_STATE))) {
        $failed[] = TI_STATE;
    }
    if (!@unlink(__FILE__)) {
        $failed[] = basename(__FILE__);
    }
    return [$state, $failed];
}

// ── HTTP ────────────────────────────────────────────────────────────────────────────────────────

function ti_json(array $body, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
}

function ti_installed_already(TiInstaller $ti): bool
{
    $config = $ti->path($ti->configName());
    return is_file($config) && strpos((string) file_get_contents($config), TI_PLACEHOLDER) === false;
}

/**
 * One line of what the installer changed for this host. `act` marks a change that leaves the
 * customer something to do; the done screen shows those outside Details.
 */
function ti_change(string $text, bool $act = false): array
{
    return ['text' => $text, 'act' => $act];
}

/**
 * The changes in the state, each as ti_change(). A state file written before changes carried the
 * flag holds plain strings; which of them ask the customer to act is unknown, so they all stay in
 * sight rather than hide an instruction (Force HTTPS, SMTP) inside Details.
 */
function ti_changes(array $list): array
{
    $out = [];
    foreach ($list as $c) {
        if (is_string($c)) {
            $c = ti_change($c, true);
        }
        if (is_array($c) && isset($c['text']) && is_string($c['text'])) {
            $out[$c['text']] = ti_change($c['text'], !empty($c['act']));
        }
    }
    return array_values($out);
}

/** Earlier changes first, a change already listed once only (a rerun after a kill finds it again). */
function ti_merge_changes(array $earlier, array $now): array
{
    return ti_changes(array_merge($earlier, $now));
}

function ti_done_html(array $state, array $failed): string
{
    $new = $state['address']['new'];
    $admin = $new . (TRACY_INSTALLER_PLATFORM === 'wordpress' ? '/wp-admin/' : '/administrator/');
    $r = $state['replace'] ?? [];
    $todo = [];
    $details = [];
    if (!empty($r['malformed'])) {
        $todo[] = ti_h((int) $r['malformed'] . ' serialized database values could not be read. They were left as they were and may still hold the old address.');
    }
    if (!empty($r['skippedSerialized'])) {
        $todo[] = ti_h((int) $r['skippedSerialized'] . ' serialized values in tables without a primary key were left as they were and may still hold the old address.');
    }
    $details[] = 'Restored from the backup point in the package' . (TRACY_INSTALLER_BACKUP !== '' ? ' (' . ti_h(TRACY_INSTALLER_BACKUP) . ')' : '') . '. Changes made on Tracy after that point are not in it.';
    if (!empty($state['address']['old']) && $state['address']['old'] !== $new) {
        $details[] = 'Address <code>' . ti_h($state['address']['old']) . '</code> replaced by <code>' . ti_h($new) . '</code> in ' . (int) ($r['values'] ?? 0) . ' database values.';
    }
    foreach (ti_changes($state['changes'] ?? []) as $c) {
        if ($c['act']) {
            $todo[] = ti_h($c['text']);
        } else {
            $details[] = ti_h($c['text']);
        }
    }
    foreach ($state['notes'] ?? [] as $n) {
        $details[] = ti_h((string) $n);
    }
    if (!empty($state['extract']['skipped'])) {
        $details[] = ti_h('Tracy\'s sign-in plugin was not installed: ' . implode(', ', $state['extract']['skipped']) . '.');
    }
    $html = '';
    if ($failed) {
        $html .= '<div class="danger"><h2>Delete these files now</h2><p>The installer could not delete them. Until you do, anyone who finds them can download your site and its database.</p><ul>';
        foreach ($failed as $f) {
            $html .= '<li><code>' . ti_h($f) . '</code></li>';
        }
        $html .= '</ul></div>';
    }
    $html .= '<div class="done"><span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
        . '<h2>Your site is installed</h2></div>';
    $html .= '<div class="buttons"><a class="button" href="' . ti_h($new . '/') . '">Open the site</a><a class="button secondary" href="' . ti_h($admin) . '">Open the admin area</a></div>';
    $html .= '<p class="hint">Sign in with the user name and password you use on Tracy.</p>';
    if ($todo) {
        $html .= '<div class="todo"><h3>Check these</h3><ul><li>' . implode('</li><li>', $todo) . '</li></ul></div>';
    }
    $html .= '<details><summary>Details</summary><ul><li>' . implode('</li><li>', $details) . '</li></ul></details>';
    return $html;
}

function ti_expired_message(): string
{
    $age = TiInstaller::maxAge();
    $minutes = max(1, (int) round($age / 60));
    $span = $age >= 3600 ? round($age / 3600, 1) . ' hours' : $minutes . ($minutes === 1 ? ' minute' : ' minutes');
    return 'This installer was unpacked more than ' . str_replace('.0 ', ' ', $span) . ' ago ('
        . gmdate('Y-m-d H:i', TiInstaller::unpackedAt()) . ' UTC). For safety it does not start an installation after that. '
        . 'Upload the ZIP again, unpack it into this folder over these files, and open installer.php right away.';
}

function ti_foreign_message(): string
{
    return 'An installation is in progress here, started from another browser. It cannot be continued or taken over from this one. '
        . 'If you started it, open installer.php again in the browser you used. Otherwise empty this folder and the database, and unpack the ZIP again.';
}

function ti_handle_post(TiInstaller $ti): void
{
    // A request the host kills (its time or memory limit) says in the host's error log where it
    // stopped; the next request resumes from the last checkpoint either way.
    register_shutdown_function(function () use ($ti) {
        $e = error_get_last();
        if ($e !== null && in_array($e['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            error_log('Tracy installer: stopped during ' . ($ti->state['phase'] ?? 'the checks') . ': ' . $e['message']);
        }
    });
    // Ownership first, without the lock: a stranger is told so even while a step is running.
    if ($ti->loadState() && !$ti->ownedByThisBrowser()) {
        ti_json(['ok' => false, 'foreign' => true, 'error' => ti_foreign_message()], 409);
        return;
    }
    if (!$ti->lock()) {
        ti_json(['ok' => false, 'busy' => true, 'error' => 'The installer is already working in another request. Wait a moment.'], 409);
        return;
    }
    ti_remove_uploaded_zips($ti);
    $ti->removeLeftovers();
    $action = (string) ($_POST['action'] ?? 'step');
    $hasState = $ti->loadState();
    if ($hasState && !$ti->ownedByThisBrowser()) {
        // Another browser began while this request waited for the lock.
        ti_json(['ok' => false, 'foreign' => true, 'error' => ti_foreign_message()], 409);
        return;
    }
    try {
        if (!$hasState) {
            if (ti_installed_already($ti)) {
                throw new TiRefusal('This site is already installed: ' . $ti->configName() . ' holds database settings. The installer does not run twice. Delete installer.php.');
            }
            if ($action !== 'begin') {
                throw new TiRefusal('Start the installation from the form.');
            }
            if (TiInstaller::expired()) {
                throw new TiRefusal(ti_expired_message());
            }
            $ti->state = ti_check($ti, $_POST);
            $ti->claim();
            $ti->saveState();
            ti_json(['ok' => true, 'phase' => 'scan', 'message' => 'Checks passed. Reading the database file…']);
            return;
        }
        $phase = $ti->state['phase'];
        $message = null;
        while ($message === null && $ti->timeLeft()) {
            $phase = $ti->state['phase'];
            try {
                if ($phase === 'scan') {
                    $message = ti_scan($ti);
                }
            } catch (TiRefusal $e) {
                // Nothing has been written yet: forget this attempt so it can start over.
                $ti->dropState();
                ti_json(['ok' => false, 'restart' => true, 'error' => $e->getMessage()], 422);
                return;
            }
            if ($phase === 'extract') {
                $message = ti_extract($ti);
            } elseif ($phase === 'import') {
                $message = ti_import($ti);
            } elseif ($phase === 'replace') {
                $message = ti_replace($ti);
            } elseif ($phase === 'configure') {
                $message = ti_configure($ti);
            } elseif ($phase === 'credentials') {
                $message = ti_credentials($ti);
            } elseif ($phase === 'cleanup') {
                [$state, $failed] = ti_cleanup($ti);
                setcookie(TI_OWNER_COOKIE, '', ['expires' => 1, 'path' => ti_base_path() . '/']);
                ti_json(['ok' => true, 'done' => true, 'failed' => $failed, 'html' => ti_done_html($state, $failed)]);
                return;
            }
            $ti->saveState();
        }
        ti_json(['ok' => true, 'phase' => $ti->state['phase'], 'message' => $message ?? ('Working: ' . $ti->state['phase'])]);
    } catch (TiRefusal $e) {
        if (!empty($ti->state)) {
            $ti->saveState();
        }
        ti_json(['ok' => false, 'phase' => $ti->state['phase'] ?? null, 'error' => $e->getMessage()] + $e->extra, 422);
    }
}

function ti_page(TiInstaller $ti): void
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    $zipsLeft = ti_remove_uploaded_zips($ti);
    $resume = $ti->loadState();
    $foreign = $resume && !$ti->ownedByThisBrowser();
    $installed = !$resume && ti_installed_already($ti);
    $expired = !$resume && !$installed && TiInstaller::expired();
    $cms = TRACY_INSTALLER_PLATFORM === 'wordpress' ? 'WordPress' : 'Joomla';
    $address = ti_request_address();
    ?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Install your <?= ti_h($cms) ?> site</title>
<style>
:root{--primary:#bf5b3d;--primary-hover:#a84d31;--foreground:#1f1f1f;--muted-foreground:#5c574e;--background:#f6f5f2;--card:#fff;--border:#e2ded6;--input:#bdb7ab;--muted:#f1efe9;--success:#0f8a5f;--success-bg:#e6f4ee;--radius:10px}
*{box-sizing:border-box}
body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--foreground);background:var(--background);margin:0;padding:40px 16px}
main{max-width:520px;margin:0 auto;padding:32px;background:var(--card);border:1px solid var(--border);border-radius:var(--radius)}
.brand{margin:0 0 20px;font-weight:700;font-size:15px;letter-spacing:.02em;color:var(--primary)}
h1{font-size:24px;line-height:1.25;margin:0 0 6px}h2{font-size:20px;line-height:1.3;margin:0}h3{font-size:16px;margin:0 0 6px}
p{margin:0}
#intro{color:var(--muted-foreground);margin-bottom:8px}
a{color:var(--primary)}a:hover{color:var(--primary-hover)}
a:focus-visible,summary:focus-visible,input[type=checkbox]:focus-visible{outline:1px solid var(--primary);outline-offset:2px}
label{display:block;font-weight:600;font-size:15px;margin:18px 0 6px}
input[type=text],input[type=password]{display:block;width:100%;padding:9px 12px;font:inherit;color:inherit;background:var(--card);border:1px solid var(--input);border-radius:6px}
input:focus{outline:none;border-color:var(--primary)}
input[disabled]{color:var(--muted-foreground);background:var(--muted);border-color:var(--border)}
.hint{color:var(--muted-foreground);font-size:14px;margin-top:6px}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin-top:20px}
.check input{margin:4px 0 0;width:16px;height:16px;flex:none;accent-color:var(--primary)}
button,.button{display:inline-block;margin-top:24px;padding:10px 20px;font:inherit;font-weight:600;line-height:1.4;text-align:center;text-decoration:none;color:#fff;background:var(--primary);border:1px solid var(--primary);border-radius:6px;cursor:pointer}
button:hover,.button:hover{color:#fff;background:var(--primary-hover);border-color:var(--primary-hover)}
button:focus-visible,.button:focus-visible{outline:none;border-color:var(--foreground)}
button[disabled]{opacity:.6;cursor:default}
#go{width:100%}
.button.secondary{color:var(--foreground);background:var(--card);border-color:var(--input)}
.button.secondary:hover{color:var(--foreground);background:var(--muted)}
.button.secondary:focus-visible{border-color:var(--primary)}
.error{color:#a12d1b;background:#fbeeea;border:1px solid #e7b8ab;padding:12px 14px;border-radius:6px;margin-top:16px}
.danger{color:#7a1405;background:#fbeeea;border:1px solid #a12d1b;padding:16px;border-radius:6px;margin-bottom:24px}
.danger h2{font-size:18px;margin-bottom:6px}.danger ul{margin:8px 0 0;padding-left:20px}
#progress{margin-top:16px;color:var(--muted-foreground)}
code{background:var(--muted);padding:1px 4px;border-radius:4px;font-size:.9em;word-break:break-all}
.done{display:flex;gap:12px;align-items:center}
.tick{display:flex;flex:none;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;color:var(--success);background:var(--success-bg)}
.buttons{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.buttons .button{margin:0}
.buttons+.hint{margin-top:10px}
.todo{margin-top:24px;padding:14px 16px;font-size:15px;color:#5a3a06;background:#fdf6ec;border:1px solid #ecd9b8;border-radius:6px}
.todo ul,details ul{margin:0;padding-left:20px}.todo li+li,details li+li{margin-top:6px}
details{margin-top:24px;border-top:1px solid var(--border);padding-top:14px;font-size:14px;color:var(--muted-foreground)}
summary{cursor:pointer;font-weight:600;color:var(--foreground)}
details ul{margin-top:10px}
@media (max-width:480px){body{padding:16px}main{padding:24px 20px}.buttons .button{flex:1 1 100%}}
</style>
</head>
<body>
<main>
<p class="brand">Tracy</p>
<h1 id="title">Install your <?= ti_h($cms) ?> site</h1>
<?php if ($zipsLeft): ?>
<div class="danger"><h2>Delete the ZIP now</h2><p>The installer could not delete the uploaded package. It holds the whole site and its database, and anyone who guesses its name can download it. Delete it in your hosting panel's file manager:</p><ul><?php foreach ($zipsLeft as $zip): ?><li><code><?= ti_h($zip) ?></code></li><?php endforeach; ?></ul></div>
<?php endif; ?>
<?php if ($installed): ?>
<p class="error">This site is already installed (<?= ti_h($ti->configName()) ?> holds database settings), and the installer does not run twice. Delete <code>installer.php</code> from the server.</p>
<?php elseif ($foreign): ?>
<p class="error"><?= ti_h(ti_foreign_message()) ?></p>
<?php elseif ($expired): ?>
<p class="error"><?= ti_h(ti_expired_message()) ?></p>
<?php else: ?>
<?php if ($resume): ?>
<p id="intro">The installation you started here has not finished. Continue where it stopped.</p>
<?php else: ?>
<p id="intro">You need an empty MySQL or MariaDB database and its user, from your hosting panel.</p>
<?php endif; ?>
<form id="form" autocomplete="off">
<?php if ($resume): ?>
<input type="hidden" name="action" value="step">
<?php else: ?>
<input type="hidden" name="action" value="begin">
<label for="db_host">Database host</label>
<input type="text" id="db_host" name="db_host" value="localhost">
<p class="hint">Usually <code>localhost</code>. Your hosting panel shows it.</p>
<label for="db_name">Database name</label>
<input type="text" id="db_name" name="db_name" required>
<label for="db_user">Database user</label>
<input type="text" id="db_user" name="db_user" required>
<label for="db_password">Database password</label>
<input type="password" id="db_password" name="db_password">
<label for="prefix">Table prefix</label>
<input type="text" id="prefix" value="Kept from the package" disabled>
<?php if (TRACY_INSTALLER_OLD_ADDRESS === '' && TRACY_INSTALLER_PLATFORM === 'joomla'): ?>
<label for="old_address">Old address (optional)</label>
<input type="text" id="old_address" name="old_address" value="">
<p class="hint">The address on Tracy, starting with <code>https://<?= ti_h(TRACY_INSTALLER_LABEL) ?>.</code> Links to it become links to the new address.</p>
<?php endif; ?>
<label for="address">Site address</label>
<input type="text" id="address" name="address" value="<?= ti_h($address) ?>" required>
<p class="hint">The site is installed in this folder<?= ti_base_path() === '' ? '' : ' (' . ti_h(ti_base_path()) . ')' ?>.</p>
<label class="check"><input type="checkbox" name="confirm" value="1" required> This is the final address of the site.</label>
<div id="code-row" hidden>
<label for="install_code">Install code</label>
<input type="text" id="install_code" name="install_code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="6 digits">
<p class="hint">Needed for a database on another server. It is in the email Tracy sent when you downloaded the ZIP. <a href="<?= ti_h(TI_HELP_URL) ?>" target="_blank" rel="noopener noreferrer">Can't find the code?</a></p>
</div>
<?php endif; ?>
<button type="submit" id="go"><?= $resume ? 'Continue' : 'Install' ?></button>
</form>
<div id="progress" aria-live="polite"></div>
<div id="result"></div>
<script>
(function () {
  var form = document.getElementById('form');
  var go = document.getElementById('go');
  var progress = document.getElementById('progress');
  var result = document.getElementById('result');
  var failures = 0;
  function show(text) { progress.textContent = text; }
  function error(text, retry) {
    show('');
    result.innerHTML = '';
    var p = document.createElement('p');
    p.className = 'error';
    p.textContent = text;
    result.appendChild(p);
    if (retry) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Try again';
      b.onclick = function () { result.innerHTML = ''; step(); };
      result.appendChild(b);
    } else {
      go.disabled = false;
    }
  }
  function post(data) {
    return fetch(location.pathname, { method: 'POST', body: data, credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return { ok: false, transient: true, error: 'The server answered ' + r.status + '.' }; }); },
            function () { return { ok: false, transient: true, error: 'The connection to the server failed.' }; });
  }
  function step() {
    var data = new FormData();
    data.append('action', 'step');
    post(data).then(handle);
  }
  function handle(r) {
    if (r.ok && r.done) {
      form.style.display = 'none';
      document.getElementById('intro').style.display = 'none';
      document.getElementById('title').style.display = 'none';
      document.title = 'Your site is installed';
      show('');
      result.innerHTML = r.html;
      return;
    }
    if (r.ok) { failures = 0; show(r.message || 'Working…'); step(); return; }
    if (r.busy || r.transient) {
      // A cut request (a time limit, a proxy) or another one still running: the next one resumes.
      failures++;
      if (failures <= 30) { show((r.error || '') + ' Continuing…'); setTimeout(step, 2000); return; }
    }
    if (r.needCode) {
      // A database on another server: the code row opens, and the same form is sent again.
      var row = document.getElementById('code-row');
      row.hidden = false;
      error(r.error, false);
      document.getElementById('install_code').focus();
      return;
    }
    if (r.restart || r.foreign || r.codeLocked) { error(r.error, false); return; }
    error(r.error || 'The installation stopped.', !!r.phase);
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    go.disabled = true;
    result.innerHTML = '';
    show('Checking…');
    post(new FormData(form)).then(handle);
  });
})();
</script>
<?php endif; ?>
</main>
</body>
</html>
<?php
}

$ti = new TiInstaller();
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    ti_handle_post($ti);
} else {
    ti_page($ti);
}
