/**
 * wp-ja-morgan — the anonymous account forms cannot be used to flood a mailbox or mass-create accounts.
 *
 * WHAT THIS FILE RUNS. The theme's real `inc/groups/account.php`, in real PHP, for the overlay (the source) and for `src/` (what
 * the build writes): the username reminder (`jm_remind`) and the registration (`jm_register`) handlers. WordPress is a stub of
 * the functions the handlers call: `wp_mail` records, `add_option` is a JSON file that survives from one request to the next,
 * `wp_safe_redirect` records where the visitor is sent. Every PHP warning or notice raised while a handler runs is recorded, and
 * each case asserts there were none.
 *
 * WHAT IT DOES NOT RUN. WordPress, a database (the clean-up's DELETE is not exercised: no `$wpdb`), a mail server, PHP's clock
 * across a window boundary.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { phpSupport, scratchRoot, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const BASES = ['overlays', 'src']
const SCRATCH_ROOT = scratchRoot()
const PHP = phpSupport()
const PHP_SKIP = SCRATCH_ROOT ? false : PHP.skip
let php
let scratch

before(() => {
  if (PHP_SKIP) return
  php = startPhp({
    scratch: SCRATCH_ROOT,
    files: { cwd: PKG, paths: BASES.map((base) => `${base}/wp-ja-morgan/inc/groups/account.php`) }
  })
  scratch = run(`
    $dir = (getenv('TRACY_PHP_SCRATCH') ?: sys_get_temp_dir()) . '/jm-forms-' . bin2hex(random_bytes(8));
    if (!mkdir($dir, 0700)) exit(1);
    echo $dir;
  `)
})
after(() => {
  try {
    if (scratch)
      run(
        `foreach (scandir($argv[1]) as $n) { if (preg_match('/^store-[0-9]+\\.json$/', $n)) unlink($argv[1] . '/' . $n); } rmdir($argv[1]);`,
        [scratch]
      )
  } finally {
    php?.stop()
  }
})

function run(code, args = [], input = '') {
  const [result] = php.run([{ args: ['-r', code, ...args], input }])
  assert.equal(result.status, 0, `php: ${result.stderr}${result.stdout}`)
  return result.stdout
}

/** As much WordPress as the two handlers touch. */
const PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['jr'] = ['mails' => [], 'redirect' => null, 'users' => 0, 'notes' => []];
set_error_handler(static function ($no, $str, $file, $line) { $GLOBALS['jr']['notes'][] = $str . ' @' . basename($file) . ':' . $line; return true; });
register_shutdown_function(static function () { while (ob_get_level() > 0) ob_end_clean(); echo json_encode($GLOBALS['jr']); });
ob_start();
define('ABSPATH', '/');
define('HOUR_IN_SECONDS', 3600);
define('MINUTE_IN_SECONDS', 60);
function add_action() { return true; }
function add_filter() { return true; }
function __($t, $d = '') { return $t; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return is_string($v) ? trim($v) : ''; }
function sanitize_email($v) { return is_string($v) ? trim($v) : ''; }
function sanitize_user($v, $strict = false) { return is_string($v) ? trim($v) : ''; }
function sanitize_textarea_field($v) { return is_string($v) ? $v : ''; }
function is_email($v) { return is_string($v) && (bool) preg_match('/^[^@\s]+@[^@\s]+\.[a-z]+$/i', $v); }
function wp_verify_nonce($n, $a) { return $n === 'nonce-' . $a; }
function wp_hash($v) { return hash('sha256', 'salt|' . $v); }
function get_option($k, $d = false) { return ['users_can_register' => 1, 'blogname' => 'MOR', 'default_role' => 'subscriber', 'admin_email' => 'owner@site.test'][$k] ?? $d; }
function wp_specialchars_decode($v, $q = 0) { return $v; }
function home_url($p = '') { return 'https://site.test' . $p; }
function add_query_arg($k, $v, $u) { return $u . '?' . $k . '=' . $v; }
function wp_safe_redirect($u, $s = 302) { $GLOBALS['jr']['redirect'] = $u; return true; }
function wp_mail($to, $subject, $body, $headers = []) { $GLOBALS['jr']['mails'][] = $to; return true; }
function get_user_by($f, $v) { return $v === 'known@site.test' ? (object) ['user_login' => 'known'] : false; }
function username_exists($v) { return false; }
function email_exists($v) { return false; }
function wp_insert_user($a) { $GLOBALS['jr']['users']++; return 42; }
function is_wp_error($v) { return false; }
function update_user_meta() { return true; }
function add_option($name, $value = '', $dep = '', $auto = true) {
  $file = $GLOBALS['store'];
  $all = is_file($file) ? json_decode(file_get_contents($file), true) : [];
  if (array_key_exists($name, $all)) return false;
  $all[$name] = $value;
  file_put_contents($file, json_encode($all));
  return true;
}
$GLOBALS['store'] = $in['store'];
$_SERVER['REMOTE_ADDR'] = $in['ip'];
$_POST = $in['post'];
require $in['account'];
$in['handler']();
`

function request(base, n, { handler, post, ip = '203.0.113.7' }) {
  const out = run(
    PROBE,
    [],
    JSON.stringify({
      store: `${scratch}/store-${n}.json`,
      ip,
      post,
      handler,
      account: path.join(php.root, base, 'wp-ja-morgan/inc/groups/account.php')
    })
  )
  const r = JSON.parse(out)
  assert.deepEqual(r.notes, [], `PHP notices: ${r.notes.join('; ')}`)
  return r
}

const remind = (email) => ({
  handler: 'wp_ja_morgan_handle_remind',
  post: { jm_nonce: 'nonce-jm_remind', email }
})
const register = (i) => ({
  handler: 'wp_ja_morgan_handle_register',
  post: {
    jm_nonce: 'nonce-jm_register',
    jform: {
      name: `Guest ${i}`,
      username: `guest${i}`,
      email1: `guest${i}@site.test`,
      password1: 'secret12',
      password2: 'secret12',
      profile: { tos: '1' }
    }
  }
})

let store = 0
for (const base of BASES) {
  test(`${base}: the reminder mails a known address once per window and answers ok every time`, {
    skip: PHP_SKIP
  }, () => {
    const n = ++store
    const answers = []
    let mails = 0
    for (let i = 0; i < 4; i++) {
      const r = request(base, n, remind('known@site.test'))
      answers.push(r.redirect)
      mails += r.mails.length
    }
    assert.equal(mails, 1, 'one mail for four requests on the same address')
    assert.ok(
      answers.every((a) => a === answers[0] && a.endsWith('jm_notice=ok')),
      `same ok answer each time: ${answers}`
    )
  })

  test(`${base}: an unknown address gets the same answer and no mail`, { skip: PHP_SKIP }, () => {
    const r = request(base, ++store, remind('nobody@site.test'))
    assert.equal(r.mails.length, 0)
    assert.ok(r.redirect.endsWith('username-reminder-request/?jm_notice=ok'))
  })

  test(`${base}: one client cannot mail more than five addresses per window`, { skip: PHP_SKIP }, () => {
    const n = ++store
    // every address is "known" for this case: the stub knows one, so count the places the client took instead
    const answers = []
    for (let i = 0; i < 7; i++) answers.push(request(base, n, remind(`a${i}@site.test`)).redirect)
    assert.ok(answers.every((a) => a.endsWith('jm_notice=ok')))
    const known = []
    for (let i = 0; i < 2; i++) known.push(request(base, n, remind('known@site.test')).mails.length)
    assert.deepEqual(known, [0, 0], 'after five requests the client gets no mail, even for a known address')
    // another client is not held by the first one's count
    assert.equal(request(base, n, { ...remind('known@site.test'), ip: '198.51.100.9' }).mails.length, 1)
  })

  test(`${base}: registration creates at most five accounts per client per hour`, { skip: PHP_SKIP }, () => {
    const n = ++store
    const results = []
    for (let i = 0; i < 7; i++) results.push(request(base, n, register(i)))
    assert.equal(
      results.reduce((s, r) => s + r.users, 0),
      5
    )
    assert.ok(results.slice(0, 5).every((r) => r.redirect.endsWith('jm_notice=ok')))
    assert.ok(results.slice(5).every((r) => r.redirect.endsWith('jm_notice=error-limit')))
    assert.equal(
      request(base, n, { ...register(9), ip: '198.51.100.9' }).users,
      1,
      'another client still registers'
    )
  })
}
