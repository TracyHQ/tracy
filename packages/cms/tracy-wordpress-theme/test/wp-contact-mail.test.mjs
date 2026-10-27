/**
 * wp-ja-morgan — the Contact page's form cannot be used to send mail to an address a visitor types
 * (TCH #794, F-S7-011). Contact mail goes to `tracy_contact_to` and never to `admin_email`, which is
 * Tracy's own mailbox on a site Tracy built; the last cases check the same for wp-ja-restaurant,
 * whose handlers are the same code.
 *
 * WHAT THIS FILE RUNS. The theme's real `inc/groups/account.php` and `patterns/contact-form.php`,
 * in real PHP, for the overlay (the source) and for `src/` (what the build writes). WordPress is a
 * stub of the functions those two files call: `wp_mail` records, `add_option` is a JSON file that
 * survives from one request to the next, `wp_safe_redirect` records where the visitor is sent.
 * Every PHP warning, notice or deprecation raised while the handler runs is recorded, and a case
 * asserts there were none.
 *
 * WHAT IT DOES NOT RUN. WordPress itself, a database (two requests racing for the same slot are
 * simulated by handing the handler a store where the slot is already taken; `add_option`'s real
 * INSERT is not exercised, and the clean-up's DELETE is applied to the JSON file by a reading of
 * its two known shapes, not by MySQL), PHP's clock (a request that waited across the turn of the
 * hour is a stale `REQUEST_TIME` plus the clean-up called for the earlier hour), a mail server, and a reverse proxy in front of PHP (the test sets
 * `REMOTE_ADDR` itself; what a proxy puts there is the host's configuration).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, beforeEach, test } from 'node:test'
import { parseHTML } from 'linkedom'
import { phpSupport, scratchRoot, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const BASES = ['overlays', 'src']
/** The business's own address (`tracy_contact_to`): where contact mail goes. */
const OWNER = 'owner@site.test'
/** The site's `admin_email`: Tracy's mailbox on a site Tracy built, never a recipient. */
const TRACY_ADMIN = 'tracy@admin.test'
/** Themes whose account.php carries the same contact handlers. */
const THEMES = ['wp-ja-morgan', 'wp-ja-restaurant']
/** A request-start time far from the real clock. The limiter must not read it: its hour is the
 * hour in which the place is taken (`time()`), which PHP gives no way to replace here. */
const AT = 1_790_000_000
const PER_HOUR = 5
/** The hour of the clock the limiter counts in, as PHP's `time()` sees it now. */
const hourNow = () => Math.floor(Date.now() / 3_600_000)
const RATE_KEY = /^jm_contact_rate_(\d+)_([0-9a-f]{20})_([1-5])$/
/** The same places, moved to another hour of the clock. */
const inHour = (keys, hour) => keys.map((key) => key.replace(RATE_KEY, `jm_contact_rate_${hour}_$2_$3`))

/**
 * `TRACY_TEST_SCRATCH` names the directory every temporary file of this run goes under (the stores,
 * the PHP runner and its per-case files). A run that names one is a run whose result is relied on:
 * it must execute in local PHP, so "PHP is not here" is a failure that says BLOCKED, never a skip.
 * Without the variable the stores live in PHP's temporary directory, local or container-backed;
 * a laptop with neither PHP nor Docker skips with the shared runner's reason.
 */
const SCRATCH_ROOT = scratchRoot()
const PHP = phpSupport()
const PHP_SKIP = SCRATCH_ROOT ? false : PHP.skip
let php
let scratch
before(() => {
  if (PHP_SKIP) return
  if (SCRATCH_ROOT && !PHP.local) {
    throw new Error('BLOCKED: TRACY_TEST_SCRATCH is set and this host has no local `php` on PATH')
  }
  php = startPhp({
    scratch: SCRATCH_ROOT,
    files: {
      cwd: PKG,
      paths: BASES.flatMap((base) => [
        ...THEMES.map((theme) => `${base}/${theme}/inc/groups/account.php`),
        `${base}/wp-ja-morgan/patterns/contact-form.php`
      ])
    }
  })
  // The stores must live beside the PHP processes, including when the daemon is remote.
  scratch = storePhp(`
    $dir = (getenv('TRACY_PHP_SCRATCH') ?: sys_get_temp_dir()) . '/jm-contact-' . bin2hex(random_bytes(8));
    if (!mkdir($dir, 0700)) exit(1);
    echo $dir;
  `)
})
// The window is an hour of the real clock, and a case counts several requests in one window: one
// that would run across the turn of the hour waits for it instead.
beforeEach(() => {
  const left = 3_600_000 - (Date.now() % 3_600_000)
  if (left < 20_000) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, left + 50)
})
after(() => {
  try {
    if (scratch) {
      storePhp(
        `
        foreach (scandir($argv[1]) as $name) {
          if (preg_match('/^store-[0-9]+\\.json$/', $name) && !unlink($argv[1] . '/' . $name)) exit(1);
        }
        if (!rmdir($argv[1])) exit(1);
      `,
        [scratch]
      )
    }
  } finally {
    php?.stop()
  }
})

/** Keep fixture I/O in the same filesystem as the handler; never mount a host directory. */
function storePhp(code, args = [], input = '') {
  const [result] = php.run([{ args: ['-r', code, ...args], input }])
  assert.equal(result.status, 0, `store fixture: ${result.stderr}${result.stdout}`)
  assert.equal(result.stderr, '', 'store fixture raised a PHP warning')
  return result.stdout
}

/**
 * As much WordPress as the two files touch. The sanitizers are typed the way core's behave on a
 * non-string in PHP 8 (`sanitize_email( array )` is a TypeError there), so a handler that passes
 * one through fails here as it would on a site.
 */
const PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['jm'] = ['in' => $in, 'mails' => [], 'redirect' => null, 'json' => null, 'notes' => [], 'added' => [], 'queries' => [], 'out' => ''];
set_error_handler(static function ($no, $str, $file, $line) { $GLOBALS['jm']['notes'][] = $str . ' @' . basename($file) . ':' . $line; return true; });
register_shutdown_function(static function () {
  $last = error_get_last();
  if ($last && in_array($last['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) $GLOBALS['jm']['notes'][] = 'FATAL ' . $last['message'];
  $jm = $GLOBALS['jm'];
  $buffered = '';
  while (ob_get_level() > 0) $buffered = ob_get_clean() . $buffered;
  echo json_encode(['mails' => $jm['mails'], 'redirect' => $jm['redirect'], 'json' => $jm['json'], 'notes' => $jm['notes'], 'added' => $jm['added'], 'queries' => $jm['queries'], 'out' => $buffered], JSON_INVALID_UTF8_SUBSTITUTE);
});
set_exception_handler(static function ($e) { $GLOBALS['jm']['notes'][] = 'UNCAUGHT ' . get_class($e) . ': ' . $e->getMessage(); });
ob_start();
define('ABSPATH', '/');
define('HOUR_IN_SECONDS', 3600);
define('MINUTE_IN_SECONDS', 60);
function add_filter() { return true; }
function add_action() { return true; }
function apply_filters($hook, $value) { $in = $GLOBALS['jm']['in']; return 'tracy_contact_to' === $hook && array_key_exists('filter_to', $in) ? $in['filter_to'] : $value; }
function __($t, $d = '') { return $t; }
function esc_html__($t, $d = '') { return htmlspecialchars($t, ENT_QUOTES); }
function esc_attr__($t, $d = '') { return htmlspecialchars($t, ENT_QUOTES); }
function esc_html_e($t, $d = '') { echo htmlspecialchars($t, ENT_QUOTES); }
function esc_attr_e($t, $d = '') { echo htmlspecialchars($t, ENT_QUOTES); }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_url($t) { return (string) $t; }
function admin_url($p = '') { return 'http://s.test/wp-admin/' . $p; }
function home_url($p = '') { return 'http://s.test' . $p; }
function get_permalink($id = 0) { return 'http://s.test/contact-us/'; }
function get_queried_object_id() { return 1; }
function url_to_postid($u) { return 0; }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function wp_create_nonce($a) { return 'nonce-' . $a; }
function wp_verify_nonce(string $n, $a) { return $n === 'nonce-' . $a ? 1 : false; }
function wp_unslash($v) { return $v; }
function wp_generate_password($l = 12, $s = true) { return str_repeat('a', $l); }
function set_transient($k, $v, $t = 0) { return true; }
function get_transient($k) { return false; }
function sanitize_key($v) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $v)); }
function sanitize_text_field($v) { if (is_array($v) || is_object($v)) return ''; return trim(preg_replace('/[\r\n\t ]+/', ' ', strip_tags((string) $v))); }
function sanitize_textarea_field($v) { if (is_array($v) || is_object($v)) return ''; return trim(strip_tags((string) $v)); }
function sanitize_email(string $e) { return preg_replace('/[^a-zA-Z0-9@._+\-]/', '', $e); }
function is_email(string $e) { return (bool) preg_match('/^[A-Za-z0-9._+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$/', $e) ? $e : false; }
function add_query_arg($k, $v, $u) { return $u . (false === strpos($u, '?') ? '?' : '&') . $k . '=' . rawurlencode((string) $v); }
function wp_safe_redirect($u, $s = 302) { $GLOBALS['jm']['redirect'] = ['url' => $u, 'status' => $s]; return true; }
function wp_send_json($d, $s = 200) { $GLOBALS['jm']['json'] = ['body' => $d, 'status' => $s]; exit; }
function wp_hash($d) { return hash_hmac('md5', (string) $d, 'test-salt'); }
function wp_mail($to, $subject, $message, $headers = '') {
  $GLOBALS['jm']['mails'][] = ['to' => $to, 'subject' => $subject, 'message' => $message, 'headers' => $headers];
  return (bool) ($GLOBALS['jm']['in']['mail_ok'] ?? true);
}
function jm_store() { $f = $GLOBALS['jm']['in']['store']; return is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : []; }
function get_option($name, $default = false) {
  $o = $GLOBALS['jm']['in']['options'] ?? [];
  if (array_key_exists($name, $o)) return $o[$name];
  $s = jm_store();
  return array_key_exists($name, $s) ? $s[$name] : $default;
}
function add_option($name, $value = '', $deprecated = '', $autoload = null) {
  if (($GLOBALS['jm']['in']['storage'] ?? 'ok') === 'down') return false;
  $s = jm_store();
  if (array_key_exists($name, $s)) return false;
  $s[$name] = $value;
  file_put_contents($GLOBALS['jm']['in']['store'], json_encode($s));
  $GLOBALS['jm']['added'][] = ['name' => $name, 'value' => $value, 'autoload' => $autoload];
  return true;
}
class JM_Fake_Wpdb {
  public $options = 'wp_options';
  public function esc_like($t) { return addcslashes($t, '_%\\'); }
  public function prepare($q, ...$a) { return vsprintf(str_replace('%s', "'%s'", $q), $a); }
  // Applies the clean-up to the JSON store. It reads the two shapes this handler has written: the
  // places of every hour but one (NOT LIKE), and the places of the hours before one (< N).
  public function query($q) {
    $GLOBALS['jm']['queries'][] = $q;
    if (($GLOBALS['jm']['in']['storage'] ?? 'ok') === 'sweep-fails') return false;
    $s = jm_store();
    $gone = 0;
    foreach (array_keys($s) as $name) {
      if (!preg_match('/^jm_contact_rate_(\\d+)_/', (string) $name, $m)) continue;
      if (preg_match("/NOT LIKE 'jm\\\\_contact\\\\_rate\\\\_(\\d+)\\\\_%'/", $q, $keep)) $drop = $m[1] !== $keep[1];
      elseif (preg_match('/AS UNSIGNED\\) < (\\d+)$/', $q, $before)) $drop = (int) $m[1] < (int) $before[1];
      else $drop = false;
      if ($drop) { unset($s[$name]); $gone++; }
    }
    if ($gone > 0) file_put_contents($GLOBALS['jm']['in']['store'], json_encode($s));
    return $gone;
  }
}
if (($in['wpdb'] ?? true) === true) $GLOBALS['wpdb'] = new JM_Fake_Wpdb();
$_POST = $in['post'] ?? [];
$_GET = $in['get'] ?? [];
$_SERVER = array_merge(['REQUEST_TIME' => $in['at']], $in['server'] ?? []);
foreach ($in['unset_server'] ?? [] as $k) unset($_SERVER[$k]);
require $in['account'];
if (isset($in['pattern'])) { require $in['pattern']; exit; }
($in['handler'])(...($in['args'] ?? []));
`

let storeSeq = 0
const newStore = (seed) => {
  const file = path.join(scratch, `store-${(storeSeq += 1)}.json`)
  if (seed) {
    storePhp(
      'if (file_put_contents($argv[1], stream_get_contents(STDIN)) === false) exit(1);',
      [file],
      JSON.stringify(seed)
    )
  }
  return file
}
const readStore = (file) => {
  return JSON.parse(storePhp('echo is_file($argv[1]) ? file_get_contents($argv[1]) : "{}";', [file]))
}

const VALID = {
  contact_name: 'Ada Lovelace',
  contact_email: 'ada@visitor.test',
  contact_subject: 'A question',
  contact_message: 'Hello.\nSecond line.',
  contact_url: ''
}
const post = (jform, extra = {}) => ({ action: 'jm_contact', jm_nonce: 'nonce-jm_contact', jform, ...extra })

/** Run the handler once per input, each in its own PHP process; return what each one did. */
function submit(base, inputs) {
  const root = php.root
  const cases = inputs.map((input) => ({
    args: ['-r', PROBE],
    input: JSON.stringify({
      account: path.join(root, base, `${input.theme ?? 'wp-ja-morgan'}/inc/groups/account.php`),
      handler: 'wp_ja_morgan_handle_contact',
      at: AT,
      options: { admin_email: TRACY_ADMIN, tracy_contact_to: OWNER },
      server: { REMOTE_ADDR: '203.0.113.9' },
      ...input,
      store: input.store ?? newStore()
    })
  }))
  return php.run(cases).map((result, index) => {
    assert.equal(result.status, 0, `php exited ${result.status}: ${result.stderr}${result.stdout}`)
    let seen
    try {
      seen = JSON.parse(result.stdout)
    } catch {
      assert.fail(`case ${index}: php printed no result: ${result.stdout}${result.stderr}`)
    }
    return { ...seen, notice: new URL(seen.redirect?.url ?? 'http://none/').searchParams.get('jm_notice') }
  })
}

/** No mail, no PHP complaint, the visitor is sent back with `code`. */
function assertRefused(seen, code, label) {
  assert.deepEqual(seen.notes, [], `${label}: PHP raised ${JSON.stringify(seen.notes)}`)
  assert.deepEqual(seen.mails, [], `${label}: mail was sent`)
  assert.equal(seen.notice, code, `${label}: notice`)
  assert.equal(seen.redirect.status, 303, `${label}: redirect status`)
}

for (const base of BASES) {
  const name = (title) => `${base}: ${title}`

  test(name('a valid message goes once, to tracy_contact_to only, with the visitor as Reply-To'), {
    skip: PHP_SKIP
  }, () => {
    const [seen] = submit(base, [{ post: post(VALID) }])
    assert.deepEqual(seen.notes, [])
    assert.equal(seen.mails.length, 1)
    const [mail] = seen.mails
    assert.equal(mail.to, OWNER)
    assert.equal(mail.subject, 'A question')
    assert.equal(mail.message, 'Hello.\nSecond line.\n\nAda Lovelace <ada@visitor.test>')
    assert.deepEqual(mail.headers, ['Reply-To: Ada Lovelace <ada@visitor.test>'])
    assert.equal(seen.notice, 'ok')
    assert.equal(seen.redirect.url, 'http://s.test/contact-us/?jm_notice=ok')
  })

  test(name('"send me a copy" selects no recipient, however it is posted'), { skip: PHP_SKIP }, () => {
    const flags = ['1', 'on', 1, true, ['1'], { to: 'victim@elsewhere.test' }, 'victim@elsewhere.test']
    const seen = submit(
      base,
      flags.map((flag) => ({
        post: post(
          { ...VALID, contact_email_copy: flag, contact_email: 'victim@elsewhere.test' },
          { contact_email_copy: flag }
        )
      }))
    )
    seen.forEach((one, index) => {
      assert.deepEqual(one.notes, [], `flag ${index}`)
      assert.equal(one.mails.length, 1, `flag ${index}: exactly one message`)
      assert.equal(one.mails[0].to, OWNER, `flag ${index}: only the business's address`)
      assert.ok(!JSON.stringify(one.mails.map((m) => m.to)).includes('victim@'), `flag ${index}`)
      assert.equal(one.notice, 'ok')
    })
  })

  test(name('a filled, malformed or missing honeypot sends nothing'), { skip: PHP_SKIP }, () => {
    const { contact_url: _dropped, ...withoutTrap } = VALID
    const seen = submit(base, [
      { post: post({ ...VALID, contact_url: 'http://spam.test' }) },
      { post: post({ ...VALID, contact_url: ' ' }) },
      { post: post({ ...VALID, contact_url: ['x'] }) },
      { post: post({ ...VALID, contact_url: { a: 'b' } }) },
      { post: post({ ...VALID, contact_url: 0 }) },
      { post: post(withoutTrap) }
    ])
    seen.slice(0, 5).forEach((one, index) => assertRefused(one, 'error-send', `trap ${index}`))
    // A form with no trap field at all is one printed before this change: it reads as expired.
    assertRefused(seen[5], 'error-token', 'no trap field')
    for (const one of seen) assert.deepEqual(one.added, [], 'a refused post spends no slot')
  })

  test(name('a missing, empty, non-string or oversized field is refused before any mail'), {
    skip: PHP_SKIP
  }, () => {
    const bad = []
    for (const key of ['contact_name', 'contact_email', 'contact_subject', 'contact_message']) {
      const { [key]: _gone, ...missing } = VALID
      bad.push([`${key} missing`, missing])
      for (const [label, value] of [
        ['empty', ''],
        ['blank', '   '],
        ['array', ['x']],
        ['nested', { a: ['x'] }],
        ['number', 7],
        ['null', null],
        ['bool', true]
      ]) {
        bad.push([`${key} ${label}`, { ...VALID, [key]: value }])
      }
    }
    bad.push(['name over 60', { ...VALID, contact_name: 'n'.repeat(61) }])
    bad.push(['subject over 200', { ...VALID, contact_subject: 's'.repeat(201) }])
    bad.push(['message over 5000', { ...VALID, contact_message: 'm'.repeat(5001) }])
    bad.push(['address over 254', { ...VALID, contact_email: `${'a'.repeat(250)}@x.test` }])
    for (const address of [
      'not-an-address',
      'a@b',
      'a b@x.test',
      'ada@visitor.test, victim@elsewhere.test',
      'ada@visitor.test\nBcc: victim@elsewhere.test',
      '<ada@visitor.test>'
    ]) {
      bad.push([`address ${JSON.stringify(address)}`, { ...VALID, contact_email: address }])
    }
    const seen = submit(
      base,
      bad.map(([, jform]) => ({ post: post(jform) }))
    )
    seen.forEach((one, index) => {
      assertRefused(one, 'error-fields', bad[index][0])
      assert.deepEqual(one.added, [], `${bad[index][0]}: a refused post spends no slot`)
    })
    // `jform` itself absent or not a list of fields.
    for (const [label, body] of [
      ['no jform', { action: 'jm_contact', jm_nonce: 'nonce-jm_contact' }],
      ['jform a string', post('x')],
      ['jform empty', post([])]
    ]) {
      const [one] = submit(base, [{ post: body }])
      assertRefused(one, 'error-fields', label)
    }
    // At the limits exactly, the message goes.
    const [edge] = submit(base, [
      {
        post: post({
          ...VALID,
          contact_name: 'n'.repeat(60),
          contact_subject: 's'.repeat(200),
          contact_message: 'm'.repeat(5000)
        })
      }
    ])
    assert.deepEqual(edge.notes, [])
    assert.equal(edge.mails.length, 1)
    assert.equal(edge.notice, 'ok')
  })

  test(name('a missing, wrong or non-string nonce is refused before anything is read'), {
    skip: PHP_SKIP
  }, () => {
    const seen = submit(base, [
      { post: { action: 'jm_contact', jform: VALID } },
      { post: post(VALID, { jm_nonce: 'nonce-jm_register' }) },
      { post: post(VALID, { jm_nonce: '' }) },
      { post: post(VALID, { jm_nonce: ['nonce-jm_contact'] }) },
      { post: post(VALID, { jm_nonce: { a: 'nonce-jm_contact' } }) },
      { post: post(VALID, { jm_nonce: 12 }) }
    ])
    seen.forEach((one, index) => {
      assertRefused(one, 'error-token', `nonce ${index}`)
      assert.deepEqual(one.added, [])
    })
  })

  test(name('text that tries to add headers or recipients stays inside the one message'), {
    skip: PHP_SKIP
  }, () => {
    const seen = submit(base, [
      {
        post: post({
          ...VALID,
          contact_name: 'Eve, "x" (c) ; Cc: victim@elsewhere.test',
          contact_subject: 'Hi\r\nBcc: victim@elsewhere.test',
          contact_message: 'Body\r\nBcc: victim@elsewhere.test'
        })
      },
      { post: post({ ...VALID, contact_name: '@@ ;; :: ,, "" ()' }) }
    ])
    const [mail] = seen[0].mails
    assert.deepEqual(seen[0].notes, [])
    assert.equal(seen[0].mails.length, 1)
    assert.equal(mail.to, OWNER)
    assert.doesNotMatch(mail.subject, /[\r\n]/)
    assert.equal(mail.headers.length, 1)
    const [header] = mail.headers
    assert.doesNotMatch(header, /[\r\n]/)
    assert.match(header, /^Reply-To: [^<>,;:"@()]* <ada@visitor\.test>$/, header)
    assert.equal((header.match(/@/g) ?? []).length, 1, 'one address in Reply-To')
    // A name with nothing usable left gives the bare address, never an empty display name.
    assert.deepEqual(seen[1].mails[0].headers, ['Reply-To: ada@visitor.test'])
  })

  test(name(
    'no usable tracy_contact_to: nothing is sent, and neither admin_email nor the visitor’s address is the fallback'
  ), { skip: PHP_SKIP }, () => {
    const seen = submit(
      base,
      [false, '', null, 'not-an-address', ['owner@site.test'], 0].map((tracy_contact_to) => ({
        post: post(VALID),
        options: { admin_email: TRACY_ADMIN, tracy_contact_to }
      }))
    )
    seen.forEach((one, index) => {
      assertRefused(one, 'error-send', `recipient ${index}`)
      assert.deepEqual(one.added, [], 'no slot is spent on a site that cannot receive mail')
    })
  })

  test(name(
    `one client address sends ${PER_HOUR} an hour; the next is refused, and another address is not affected`
  ), { skip: PHP_SKIP }, () => {
    const store = newStore()
    const seen = []
    for (let i = 0; i < PER_HOUR + 2; i += 1) seen.push(submit(base, [{ post: post(VALID), store }])[0])
    seen.slice(0, PER_HOUR).forEach((one, index) => {
      assert.deepEqual(one.notes, [])
      assert.equal(one.mails.length, 1, `message ${index + 1} goes`)
      assert.equal(one.notice, 'ok')
      assert.equal(one.added.length, 1, 'one slot per message')
      assert.equal(one.added[0].autoload, false, 'the counter is not autoloaded')
    })
    for (const over of seen.slice(PER_HOUR)) assertRefused(over, 'error-send', 'over the limit')
    assert.equal(Object.keys(readStore(store)).length, PER_HOUR, 'the store holds exactly the limit')
    // The stored names carry no address in the clear.
    assert.ok(Object.keys(readStore(store)).every((key) => !key.includes('203.0.113.9')))

    const [other] = submit(base, [{ post: post(VALID), store, server: { REMOTE_ADDR: '198.51.100.7' } }])
    assert.equal(other.mails.length, 1, 'another client address has its own count')
    // The request's own start time is not the clock the limit runs on: an hour earlier, an hour
    // later, zero or absent, the same address is still over this hour's count.
    for (const stale of [
      { at: AT - 3600 },
      { at: AT + 3600 },
      { at: 0 },
      { unset_server: ['REQUEST_TIME'] }
    ]) {
      const [again] = submit(base, [{ post: post(VALID), store, ...stale }])
      assertRefused(again, 'error-send', `request start ${JSON.stringify(stale)}`)
    }
  })

  test(name('places taken in the hour before do not count against this hour'), { skip: PHP_SKIP }, () => {
    const probe = newStore()
    for (let i = 0; i < PER_HOUR; i += 1) submit(base, [{ post: post(VALID), store: probe }])
    const slots = Object.keys(readStore(probe))
    assert.equal(slots.length, PER_HOUR)
    const hour = Number(slots[0].match(RATE_KEY)[1])
    assert.ok(
      Math.abs(hour - hourNow()) <= 1,
      'the window is the hour of the clock, not of the request start'
    )
    assert.notEqual(hour, Math.floor(AT / 3600))

    const earlier = inHour(slots, hour - 1)
    const store = newStore(Object.fromEntries(earlier.map((key) => [key, '1'])))
    const [fresh] = submit(base, [{ post: post(VALID), store }])
    assert.deepEqual(fresh.notes, [])
    assert.equal(fresh.mails.length, 1, 'a new hour is a new count')
    assert.deepEqual(
      fresh.added.map((row) => row.name),
      [slots[0]]
    )
    // Its clean-up removes hours before its own, and that is the previous hour here.
    assert.deepEqual(Object.keys(readStore(store)), [slots[0]])
  })

  test(name('a request left over from the hour before cannot clear or reopen this hour’s places'), {
    skip: PHP_SKIP
  }, () => {
    const probe = newStore()
    for (let i = 0; i < PER_HOUR; i += 1) submit(base, [{ post: post(VALID), store: probe }])
    const current = Object.keys(readStore(probe))
    const hour = Number(current[0].match(RATE_KEY)[1])
    const older = inHour(current.slice(0, 2), hour - 2)
    const previous = inHour(current.slice(0, 1), hour - 1)
    const other = 'jm_contact_rate_note'
    const seed = Object.fromEntries([...older, ...previous, ...current, other].map((key) => [key, '1']))

    // The clean-up a request runs after taking the FIRST place of the hour before: it may remove
    // what is older than its own hour, never the places of the hour that has begun since.
    const swept = newStore(seed)
    const [run] = submit(base, [
      { handler: 'wp_ja_morgan_contact_rate_sweep', args: [hour - 1], store: swept }
    ])
    assert.deepEqual(run.notes, [])
    assert.equal(run.queries.length, 1)
    assert.deepEqual(Object.keys(readStore(swept)).sort(), [...previous, ...current, other].sort())

    // And a request whose start was an hour ago still meets this hour's full count.
    const store = newStore(seed)
    const [late] = submit(base, [{ post: post(VALID), store, at: Math.floor(Date.now() / 1000) - 3600 }])
    assertRefused(late, 'error-send', 'late request')
    assert.deepEqual(late.added, [])
    assert.deepEqual(late.queries, [], 'a refused request clears nothing')
    assert.deepEqual(Object.keys(readStore(store)).sort(), Object.keys(seed).sort())
    const [lateQuick] = submit(base, [
      {
        handler: 'wp_ja_morgan_handle_quick_contact',
        post: {
          action: 'jm_quick_contact',
          jm_nonce: 'nonce-jm_quick_contact',
          jm_ajax: '1',
          jm_qc: { name: 'Ada', email: 'ada@visitor.test', subject: 'Quick', text: 'Hello' }
        },
        store,
        at: Math.floor(Date.now() / 1000) - 3600
      }
    ])
    assert.deepEqual(lateQuick.notes, [])
    assert.deepEqual(lateQuick.mails, [], 'Quick Contact is held to the same hour')
    assert.equal(lateQuick.json.body.code, 'error-qc-send')
    assert.deepEqual(Object.keys(readStore(store)).sort(), Object.keys(seed).sort())
  })

  test(name('headers a visitor controls do not move them to another bucket'), { skip: PHP_SKIP }, () => {
    const store = newStore()
    const seen = []
    for (let i = 0; i < PER_HOUR + 1; i += 1) {
      seen.push(
        submit(base, [
          {
            post: post(VALID),
            store,
            server: {
              REMOTE_ADDR: '203.0.113.9',
              HTTP_X_FORWARDED_FOR: `10.0.0.${i}`,
              HTTP_CLIENT_IP: `10.0.1.${i}`,
              HTTP_X_REAL_IP: `10.0.2.${i}`,
              HTTP_CF_CONNECTING_IP: `10.0.3.${i}`,
              HTTP_FORWARDED: `for=10.0.4.${i}`
            }
          }
        ])[0]
      )
    }
    assert.equal(seen.filter((one) => one.mails.length === 1).length, PER_HOUR)
    assertRefused(seen[PER_HOUR], 'error-send', 'forwarding headers ignored')
  })

  test(name('requests with no usable client address share one bucket'), { skip: PHP_SKIP }, () => {
    const store = newStore()
    const shapes = [
      { unset_server: ['REMOTE_ADDR'], server: {} },
      { server: { REMOTE_ADDR: '' } },
      { server: { REMOTE_ADDR: 'not-an-address' } },
      { server: { REMOTE_ADDR: ['203.0.113.9'] } },
      { server: { REMOTE_ADDR: '203.0.113.9, 10.0.0.1' } },
      { unset_server: ['REMOTE_ADDR'], server: {} },
      { server: { REMOTE_ADDR: '999.1.1.1' } }
    ]
    const seen = shapes.map((shape) => submit(base, [{ post: post(VALID), store, ...shape }])[0])
    for (const one of seen) assert.deepEqual(one.notes, [])
    assert.equal(seen.filter((one) => one.mails.length === 1).length, PER_HOUR)
    for (const over of seen.slice(PER_HOUR)) assertRefused(over, 'error-send', 'shared bucket full')
  })

  test(name('one IPv6 network is one client, and an IPv4-mapped address is its IPv4 self'), {
    skip: PHP_SKIP
  }, () => {
    const store = newStore()
    const hosts = [
      '2001:db8:1:2::1',
      '2001:db8:1:2::2',
      '2001:DB8:1:2:ffff::3',
      '2001:db8:1:2:a:b:c:d',
      '2001:db8:1:2::5',
      '2001:db8:1:2::6'
    ]
    const seen = hosts.map(
      (REMOTE_ADDR) => submit(base, [{ post: post(VALID), store, server: { REMOTE_ADDR } }])[0]
    )
    assert.equal(seen.filter((one) => one.mails.length === 1).length, PER_HOUR, 'a /64 shares one count')
    assertRefused(seen[PER_HOUR], 'error-send', 'same /64')
    const [neighbour] = submit(base, [
      { post: post(VALID), store, server: { REMOTE_ADDR: '2001:db8:1:3::1' } }
    ])
    assert.equal(neighbour.mails.length, 1, 'another /64 has its own count')

    const mapped = newStore()
    const first = [
      '::ffff:203.0.113.9',
      '203.0.113.9',
      '::ffff:203.0.113.9',
      '203.0.113.9',
      '::ffff:203.0.113.9',
      '203.0.113.9'
    ]
    const mixed = first.map(
      (REMOTE_ADDR) => submit(base, [{ post: post(VALID), store: mapped, server: { REMOTE_ADDR } }])[0]
    )
    assert.equal(
      mixed.filter((one) => one.mails.length === 1).length,
      PER_HOUR,
      'mapped and plain are one client'
    )
    const [otherMapped] = submit(base, [
      { post: post(VALID), store: mapped, server: { REMOTE_ADDR: '::ffff:198.51.100.7' } }
    ])
    assert.equal(otherMapped.mails.length, 1, 'another mapped address is another client')
  })

  test(name('a slot another request took first is not taken twice'), { skip: PHP_SKIP }, () => {
    // Learn the slot names from one accepted message, then hand the handler stores in which
    // competing requests already hold some or all of them.
    const probe = newStore()
    for (let i = 0; i < PER_HOUR; i += 1) submit(base, [{ post: post(VALID), store: probe }])
    const slots = Object.keys(readStore(probe))
    assert.equal(slots.length, PER_HOUR)

    const partly = newStore(Object.fromEntries(slots.slice(0, PER_HOUR - 1).map((key) => [key, '1'])))
    const [last] = submit(base, [{ post: post(VALID), store: partly }])
    assert.equal(last.mails.length, 1, 'the one free slot is used')
    assert.deepEqual(
      last.added.map((row) => row.name),
      [slots[PER_HOUR - 1]]
    )
    const [none] = submit(base, [{ post: post(VALID), store: partly }])
    assertRefused(none, 'error-send', 'no free slot')

    // Whatever a stored slot holds, its presence is what counts: junk does not free it.
    const junk = newStore(
      Object.fromEntries(slots.map((key, index) => [key, [null, '', 0, 'garbage', { a: 1 }][index]]))
    )
    const [stuck] = submit(base, [{ post: post(VALID), store: junk }])
    assertRefused(stuck, 'error-send', 'malformed stored state')
    assert.deepEqual(stuck.added, [])
  })

  test(name('a store that cannot be written refuses the message instead of letting it through'), {
    skip: PHP_SKIP
  }, () => {
    const [down] = submit(base, [{ post: post(VALID), storage: 'down' }])
    assertRefused(down, 'error-send', 'storage down')
    // The clean-up of old windows failing, or no database handle at all, does not block a
    // message whose slot WAS reserved.
    const [sweep] = submit(base, [{ post: post(VALID), storage: 'sweep-fails' }])
    assert.deepEqual(sweep.notes, [])
    assert.equal(sweep.mails.length, 1)
    const [noDb] = submit(base, [{ post: post(VALID), wpdb: false }])
    assert.deepEqual(noDb.notes, [])
    assert.equal(noDb.mails.length, 1)
  })

  test(name('only hours before the current one are cleared'), { skip: PHP_SKIP }, () => {
    const from = hourNow()
    const [seen] = submit(base, [{ post: post(VALID) }])
    assert.equal(seen.queries.length, 1, 'one clean-up with the first message of a window')
    const [query] = seen.queries
    const found = query.match(
      /^DELETE FROM wp_options WHERE option_name LIKE 'jm\\_contact\\_rate\\_%' AND CAST\(SUBSTRING_INDEX\(SUBSTRING\(option_name, 17\), '_', 1\) AS UNSIGNED\) < (\d+)$/
    )
    assert.ok(found, query)
    assert.ok(Number(found[1]) >= from && Number(found[1]) <= hourNow(), query)
    assert.equal('jm_contact_rate_'.length + 1, 17)
    assert.doesNotMatch(query, /NOT LIKE/)
    // Later messages of the same hour clear nothing.
    const store = newStore()
    const runs = [0, 1, 2].map(() => submit(base, [{ post: post(VALID), store }])[0])
    assert.deepEqual(
      runs.map((one) => one.queries.length),
      [1, 0, 0]
    )
  })

  test(name('a send the mailer reports as failed is never reported as sent'), { skip: PHP_SKIP }, () => {
    const [seen] = submit(base, [{ post: post(VALID), mail_ok: false }])
    assert.deepEqual(seen.notes, [])
    assert.equal(seen.mails.length, 1, 'it was attempted once')
    assert.equal(seen.mails[0].to, OWNER)
    assert.equal(seen.notice, 'error-send')
  })

  test(name('Quick Contact spends the same hourly count and is refused once it is used up'), {
    skip: PHP_SKIP
  }, () => {
    const store = newStore()
    const quick = {
      post: {
        action: 'jm_quick_contact',
        jm_nonce: 'nonce-jm_quick_contact',
        jm_ajax: '1',
        jm_qc: { name: 'Ada', email: 'ada@visitor.test', subject: 'Quick', text: 'Hello' }
      },
      handler: 'wp_ja_morgan_handle_quick_contact',
      store
    }
    const seen = []
    for (let i = 0; i < PER_HOUR - 1; i += 1) seen.push(submit(base, [quick])[0])
    seen.push(submit(base, [{ post: post(VALID), store }])[0])
    for (const one of seen) {
      assert.deepEqual(one.notes, [])
      assert.equal(one.mails.length, 1)
      assert.equal(one.mails[0].to, OWNER)
    }
    const [over] = submit(base, [quick])
    assert.deepEqual(over.notes, [])
    assert.deepEqual(over.mails, [])
    assert.equal(over.json.status, 502)
    assert.equal(over.json.body.code, 'error-qc-send')
    assert.equal(over.json.body.ok, false)
    assertRefused(
      submit(base, [{ post: post(VALID), store }])[0],
      'error-send',
      'contact form after quick contact'
    )
  })

  test(name('the printed form has a trap no person reaches, bounded fields and no working copy box'), {
    skip: PHP_SKIP
  }, () => {
    const root = php.root
    const [result] = php.run([
      {
        args: ['-r', PROBE],
        input: JSON.stringify({
          account: path.join(root, base, 'wp-ja-morgan/inc/groups/account.php'),
          pattern: path.join(root, base, 'wp-ja-morgan/patterns/contact-form.php'),
          at: AT,
          store: newStore()
        })
      }
    ])
    assert.equal(result.status, 0, result.stderr)
    const printed = JSON.parse(result.stdout)
    assert.deepEqual(printed.notes, [])
    const { document } = parseHTML(`<!doctype html><html><body>${printed.out}</body></html>`)
    const form = document.querySelector('form#contact-form')
    assert.ok(form, 'the form is printed')
    assert.equal(form.querySelector('input[name="action"]').getAttribute('value'), 'jm_contact')

    const trap = form.querySelector('input[name="jform[contact_url]"]')
    assert.ok(trap, 'the trap field is in the form')
    assert.equal(trap.getAttribute('tabindex'), '-1')
    assert.equal(trap.getAttribute('autocomplete'), 'off')
    assert.equal(trap.getAttribute('value') ?? '', '')
    assert.equal(trap.hasAttribute('required'), false)
    const hidden = trap.closest('[aria-hidden="true"]')
    assert.ok(hidden, 'the trap sits in a region assistive technology skips')
    assert.match(hidden.getAttribute('style') ?? '', /position:\s*absolute/)
    assert.match(hidden.getAttribute('style') ?? '', /left:\s*-\d+px/)
    assert.equal(
      hidden.querySelectorAll('input, textarea, select, button, a').length,
      1,
      'nothing else is hidden with it'
    )

    const limits = {
      'jform[contact_name]': '60',
      'jform[contact_email]': '254',
      'jform[contact_subject]': '200',
      'jform[contact_message]': '5000'
    }
    for (const [field, max] of Object.entries(limits)) {
      const input = form.querySelector(`[name="${field}"]`)
      assert.ok(input, field)
      assert.equal(input.getAttribute('maxlength'), max, `${field} maxlength`)
      assert.equal(input.hasAttribute('required'), true, `${field} required`)
    }

    assert.equal(form.querySelector('[name="jform[contact_email_copy]"]'), null, 'the copy box posts nothing')
    const copy = form.querySelector('#jform_contact_email_copy')
    assert.ok(copy, 'the box keeps its place in the layout')
    assert.equal(copy.hasAttribute('disabled'), true, 'and is switched off')
    assert.equal(copy.hasAttribute('name'), false)
  })
}

for (const base of BASES) {
  for (const theme of THEMES) {
    const prefix = theme.replaceAll('-', '_')
    const quick = {
      handler: `${prefix}_handle_quick_contact`,
      post: {
        action: 'jm_quick_contact',
        jm_nonce: 'nonce-jm_quick_contact',
        jm_ajax: '1',
        jm_qc: { name: 'Ada', email: 'ada@visitor.test', subject: 'Quick', text: 'Hello' }
      }
    }
    const contact = { handler: `${prefix}_handle_contact`, post: post(VALID) }
    const cases = (options, extra = {}) =>
      [contact, quick].map((one) => ({ theme, ...one, options, ...extra }))

    test(`${base}/${theme}: both forms mail tracy_contact_to, or the address its filter names, never admin_email`, {
      skip: PHP_SKIP
    }, () => {
      const seen = submit(base, [
        ...cases({ admin_email: TRACY_ADMIN, tracy_contact_to: OWNER }),
        ...cases({ admin_email: TRACY_ADMIN, tracy_contact_to: false }, { filter_to: 'filtered@site.test' })
      ])
      seen.forEach((one, index) => {
        assert.deepEqual(one.notes, [], `case ${index}`)
        assert.deepEqual(
          one.mails.map((mail) => mail.to),
          [index < 2 ? OWNER : 'filtered@site.test'],
          `case ${index}`
        )
      })
    })

    test(`${base}/${theme}: with no tracy_contact_to neither form sends mail, and admin_email is not the fallback`, {
      skip: PHP_SKIP
    }, () => {
      const seen = submit(base, [
        ...cases({ admin_email: TRACY_ADMIN }),
        ...cases({ admin_email: TRACY_ADMIN, tracy_contact_to: OWNER }, { filter_to: 'not-an-address' })
      ])
      seen.forEach((one, index) => {
        assert.deepEqual(one.notes, [], `case ${index}`)
        assert.deepEqual(one.mails, [], `case ${index}: mail was sent`)
        assert.deepEqual(one.added, [], `case ${index}: no hourly place is spent`)
        if (index % 2 === 0) assertRefused(one, 'error-send', `contact ${index}`)
        else assert.equal(one.json.body.code, 'error-qc-send', `quick contact ${index}`)
      })
    })
  }
}

test('the build output is the overlay, byte for byte', () => {
  const files = [
    ...THEMES.map((theme) => `${theme}/inc/groups/account.php`),
    'wp-ja-morgan/patterns/contact-form.php'
  ]
  for (const file of files) {
    assert.equal(
      readFileSync(path.join(PKG, 'src', file), 'utf8'),
      readFileSync(path.join(PKG, 'overlays', file), 'utf8'),
      file
    )
  }
})
