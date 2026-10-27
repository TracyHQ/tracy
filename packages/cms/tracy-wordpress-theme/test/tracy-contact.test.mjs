/**
 * The shared contact handler (`tracy_contact_submit`) sends only to a configured recipient
 * (TCH #811, F-S6-010).
 *
 * WHAT THIS FILE RUNS. Each theme's whole, real `functions.php` (and every file it requires), in
 * real PHP, for the source theme and for every generated copy under `src/`. The handler is reached
 * the way WordPress reaches it: through the `admin_post_*` action the theme registered. WordPress
 * is a stub: hooks are real (a case can add a `tracy_contact_to` filter), options are the case's
 * input, `wp_mail` records, `wp_safe_redirect` records where the visitor is sent, and `is_email`
 * is core's own check, untyped as core's is, so a non-string recipient fails here as it would on
 * a site. Every PHP warning, notice, deprecation or uncaught error raised while the handler runs
 * is recorded, and a case asserts there were none.
 *
 * WHAT IT DOES NOT RUN. WordPress itself, a database, a mail server (a recorded `wp_mail` call is
 * not a delivered message), a browser, and the contact pages of the themes that use their own
 * handler or Contact Form 7 instead of this one.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { phpSupport, scratchRoot, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
/** The source theme, then every copy the build writes from it. */
const THEMES = [
  'tracy',
  'tracy-base',
  'wp-tracy-business',
  'wp-ja-impact',
  'wp-ja-essence',
  'wp-ja-nova',
  'wp-ja-morgan',
  'wp-ja-kinetic',
  'wp-ja-vega',
  'wp-ja-restaurant',
  'wp-ja-diner',
  'wp-ja-fresco'
]
/** What a site built by Tracy has as its admin address: never the customer's mailbox. */
const ADMIN = 'tracy-agent@tracy.ai'
const OWNER = 'owner@customer.test'

// Same rule as wp-contact-mail.test.mjs: a run that names a scratch root is one whose result is
// relied on, so "PHP is not here" is a failure that says BLOCKED, never a skip.
const SCRATCH_ROOT = scratchRoot()
const PHP = phpSupport()
const PHP_SKIP = SCRATCH_ROOT ? false : PHP.skip
let php
before(() => {
  if (PHP_SKIP) return
  if (SCRATCH_ROOT && !PHP.local) {
    throw new Error('BLOCKED: TRACY_TEST_SCRATCH is set and this host has no local `php` on PATH')
  }
  php = startPhp({ scratch: SCRATCH_ROOT, files: { cwd: PKG, paths: THEMES.map((theme) => `src/${theme}`) } })
})
after(() => php?.stop())

/** As much WordPress as loading a theme's `functions.php` and running the handler touches. */
const PROBE =
  String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['tc'] = ['in' => $in, 'hooks' => [], 'mails' => [], 'redirect' => null, 'notes' => [], 'saw' => [], 'registered' => false];
set_error_handler(static function ($no, $str, $file, $line) { $GLOBALS['tc']['notes'][] = $str . ' @' . basename($file) . ':' . $line; return true; });
register_shutdown_function(static function () {
  $last = error_get_last();
  if ($last && in_array($last['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) $GLOBALS['tc']['notes'][] = 'FATAL ' . $last['message'];
  $tc = $GLOBALS['tc'];
  while (ob_get_level() > 0) ob_end_clean();
  echo json_encode(['mails' => $tc['mails'], 'redirect' => $tc['redirect'], 'notes' => $tc['notes'], 'saw' => $tc['saw'], 'registered' => $tc['registered']], JSON_INVALID_UTF8_SUBSTITUTE);
});
ob_start();
define('ABSPATH', '/');
define('MINUTE_IN_SECONDS', 60);
define('HOUR_IN_SECONDS', 3600);
define('DAY_IN_SECONDS', 86400);
define('WEEK_IN_SECONDS', 604800);
function add_filter($name, $callback, $priority = 10, $args = 1) { $GLOBALS['tc']['hooks'][$name][$priority][] = [$callback, $args]; return true; }
function add_action($name, $callback, $priority = 10, $args = 1) { return add_filter($name, $callback, $priority, $args); }
function has_filter($name, $callback = false) { return !empty($GLOBALS['tc']['hooks'][$name]); }
function has_action($name, $callback = false) { return has_filter($name, $callback); }
function apply_filters($name, $value, ...$rest) {
  $hooks = $GLOBALS['tc']['hooks'][$name] ?? [];
  ksort($hooks);
  foreach ($hooks as $callbacks) foreach ($callbacks as [$callback, $args]) $value = $callback(...array_slice([$value, ...$rest], 0, $args));
  return $value;
}
function do_action($name, ...$args) {
  $hooks = $GLOBALS['tc']['hooks'][$name] ?? [];
  ksort($hooks);
  foreach ($hooks as $callbacks) foreach ($callbacks as [$callback, $n]) $callback(...array_slice($args, 0, $n));
}
function get_option($name, $default = false) { $o = $GLOBALS['tc']['in']['options'] ?? []; return array_key_exists($name, $o) ? $o[$name] : $default; }
function get_bloginfo($what = '') { return 'name' === $what ? 'A Site' : ''; }
function get_theme_file_path($file = '') { return $GLOBALS['tc']['in']['theme'] . '/' . $file; }
function get_theme_file_uri($file = '') { return 'http://s.test/theme/' . $file; }
function get_template_directory() { return $GLOBALS['tc']['in']['theme']; }
function get_stylesheet_directory() { return $GLOBALS['tc']['in']['theme']; }
function get_template_directory_uri() { return 'http://s.test/theme'; }
function get_stylesheet_directory_uri() { return 'http://s.test/theme'; }
function get_template() { return basename($GLOBALS['tc']['in']['theme']); }
function get_stylesheet() { return basename($GLOBALS['tc']['in']['theme']); }
function is_admin() { return false; }
function wp_doing_ajax() { return false; }
function wp_get_theme() { return new class() { public function get($header) { return '1.0.0'; } }; }
function __($text, $domain = 'default') { return $text; }
function _x($text, $context, $domain = 'default') { return $text; }
function esc_html__($text, $domain = 'default') { return htmlspecialchars($text, ENT_QUOTES); }
function esc_attr__($text, $domain = 'default') { return htmlspecialchars($text, ENT_QUOTES); }
function esc_html($text) { return htmlspecialchars((string) $text, ENT_QUOTES); }
function esc_attr($text) { return htmlspecialchars((string) $text, ENT_QUOTES); }
function esc_url($url) { return (string) $url; }
function esc_url_raw($url) { return (string) $url; }
function home_url($path = '') { return 'http://s.test' . $path; }
function admin_url($path = '') { return 'http://s.test/wp-admin/' . $path; }
function wp_unslash($value) { return $value; }
function wp_verify_nonce($nonce, $action = -1) { return $nonce === 'nonce-' . $action ? 1 : false; }
function sanitize_key($key) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $key)); }
function sanitize_text_field($value) { return trim(preg_replace('/[\r\n\t ]+/', ' ', strip_tags((string) $value))); }
function sanitize_textarea_field($value) { return trim(strip_tags((string) $value)); }
function sanitize_email($email) { return preg_replace('/[^a-zA-Z0-9@._+\-]/', '', (string) $email); }
// Core's is_email() (wp-includes/formatting.php), untyped as core's is: an array is a TypeError
// in strlen(), null a deprecation, exactly what a site would raise.
function is_email($email, $deprecated = false) {
  if (strlen($email) < 6) return false;
  if (strpos($email, '@', 1) === false) return false;
  list($local, $domain) = explode('@', $email, 2);
  if (!preg_match('/^[a-zA-Z0-9!#$%&\'*+\/=?^_` +
  '`' +
  String.raw`{|}~\.-]+$/', $local)) return false;
  if (preg_match('/\.{2,}/', $domain)) return false;
  if (trim($domain, " \t\n\r\0\x0B.") !== $domain) return false;
  $subs = explode('.', $domain);
  if (2 > count($subs)) return false;
  foreach ($subs as $sub) {
    if (trim($sub, " \t\n\r\0\x0B-") !== $sub) return false;
    if (!preg_match('/^[a-z0-9-]+$/i', $sub)) return false;
  }
  return $email;
}
function add_query_arg($key, $value, $url) { return $url . (false === strpos($url, '?') ? '?' : '&') . $key . '=' . rawurlencode((string) $value); }
function wp_safe_redirect($url, $status = 302) { $GLOBALS['tc']['redirect'] = ['url' => $url, 'status' => $status]; return true; }
function wp_mail($to, $subject, $message, $headers = '') {
  $GLOBALS['tc']['mails'][] = ['to' => $to, 'subject' => $subject, 'message' => $message, 'headers' => $headers];
  $mode = $GLOBALS['tc']['in']['mail'] ?? 'ok';
  if ('throws' === $mode) throw new RuntimeException('mailer is down');
  return 'ok' === $mode;
}
// Called while a theme file loads (not inside a hook) by one theme or another; none of them is
// on the handler's path.
foreach (%NOOPS% as $noop) {
  if (!function_exists($noop)) eval('function ' . $noop . '(...$a) { return null; }');
}
$_POST = $in['post'] ?? [];
$_GET = [];
$_SERVER = array_merge($_SERVER, ['REQUEST_METHOD' => 'POST', 'REMOTE_ADDR' => '203.0.113.9']);
// A try/catch and not set_exception_handler(): code given to "php -r" does not reach that handler.
try {
  require $in['theme'] . '/functions.php';
  if (array_key_exists('filter', $in)) {
    add_filter('tracy_contact_to', static function ($to) { $GLOBALS['tc']['saw'][] = $to; return $GLOBALS['tc']['in']['filter']; });
  } else {
    add_filter('tracy_contact_to', static function ($to) { $GLOBALS['tc']['saw'][] = $to; return $to; });
  }
  $GLOBALS['tc']['registered'] = has_action($in['action']);
  do_action($in['action']);
} catch (\Throwable $e) {
  $GLOBALS['tc']['notes'][] = 'UNCAUGHT ' . get_class($e) . ': ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine();
}
`

/** Functions a theme calls at load time, outside any hook; stubbed to do nothing. */
const NOOPS = ['add_shortcode']

const VALID = {
  _tracy_nonce: 'nonce-tracy_contact',
  tracy_hp: '',
  tracy_return: 'http://s.test/contact/',
  contact_name: 'Ada Lovelace',
  contact_email: 'ada@visitor.test',
  contact_subject: 'A question',
  contact_message: 'Hello.\nSecond line.'
}

/** Run the handler once per input, each in its own PHP process; return what each one did. */
function submit(theme, inputs) {
  const probe = PROBE.replace('%NOOPS%', `[${NOOPS.map((name) => `'${name}'`).join(', ')}]`)
  const cases = inputs.map((input) => ({
    args: ['-r', probe],
    input: JSON.stringify({
      theme: path.join(php.root, 'src', theme),
      action: 'admin_post_nopriv_tracy_contact',
      options: { admin_email: ADMIN, tracy_contact_to: OWNER },
      post: VALID,
      ...input
    })
  }))
  return php.run(cases).map((result, index) => {
    assert.equal(
      result.status,
      0,
      `case ${index}: php exited ${result.status}: ${result.stderr}${result.stdout}`
    )
    let seen
    try {
      seen = JSON.parse(result.stdout)
    } catch {
      assert.fail(`case ${index}: php printed no result: ${result.stdout}${result.stderr}`)
    }
    assert.equal(seen.registered, true, `case ${index}: the theme registered no handler for the action`)
    const url = seen.redirect?.url ?? ''
    return { ...seen, state: /[?&]contact=([a-z]+)#contact-form$/.exec(url)?.[1] ?? null }
  })
}

/** No mail, no PHP complaint, the visitor is sent back with `state`. */
function assertRefused(seen, state, label) {
  assert.deepEqual(seen.notes, [], `${label}: PHP raised ${JSON.stringify(seen.notes)}`)
  assert.deepEqual(
    seen.mails,
    [],
    `${label}: mail was sent to ${JSON.stringify(seen.mails.map((m) => m.to))}`
  )
  assert.equal(seen.state, state, `${label}: state (redirect ${JSON.stringify(seen.redirect)})`)
}

/** One message, to `to` and nobody else, and the visitor is told it went. */
function assertSentTo(seen, to, label) {
  assert.deepEqual(seen.notes, [], `${label}: PHP raised ${JSON.stringify(seen.notes)}`)
  assert.equal(seen.mails.length, 1, `${label}: mails ${JSON.stringify(seen.mails)}`)
  assert.equal(seen.mails[0].to, to, `${label}: recipient`)
  assert.equal(seen.state, 'sent', `${label}: state`)
}

/** A stored `tracy_contact_to` that is not a usable address, by what makes it unusable. */
const UNUSABLE_OPTIONS = {
  'an empty string': '',
  whitespace: '   ',
  'a padded address': ` ${OWNER} `,
  'no @': 'owner.customer.test',
  'no domain dot': 'owner@customer',
  'two addresses': `${OWNER}, other@customer.test`,
  'a display name': `Owner <${OWNER}>`,
  null: null,
  false: false,
  true: true,
  'a number': 12345678,
  'a list': [OWNER],
  'a map': { to: OWNER }
}
/** What a `tracy_contact_to` filter can hand back that is not a usable address. */
const UNUSABLE_FILTERED = {
  'an empty string': '',
  whitespace: ' ',
  'not an address': 'nobody',
  null: null,
  false: false,
  true: true,
  'a number': 0,
  'a list': [OWNER],
  'a map': { to: OWNER }
}

test('every theme under src/ that carries the handler is tested', () => {
  const carrying = readdirSync(path.join(PKG, 'src'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(PKG, 'src', entry.name, 'functions.php')))
    .map((entry) => entry.name)
  assert.deepEqual([...THEMES].sort(), carrying.sort())
})

for (const theme of THEMES) {
  const name = (title) => `${theme}: ${title}`
  const opts = { skip: PHP_SKIP }

  test(
    name('a valid message goes once, to the configured recipient, with the visitor as Reply-To'),
    opts,
    () => {
      for (const action of ['admin_post_nopriv_tracy_contact', 'admin_post_tracy_contact']) {
        const [seen] = submit(theme, [{ action }])
        assertSentTo(seen, OWNER, action)
        assert.equal(seen.mails[0].subject, '[A Site] A question')
        assert.equal(seen.mails[0].message, 'Hello.\nSecond line.\n\n— Ada Lovelace <ada@visitor.test>')
        assert.deepEqual(seen.mails[0].headers, ['Reply-To: Ada Lovelace <ada@visitor.test>'])
        assert.deepEqual(seen.saw, [OWNER], 'the filter is handed the configured recipient')
        assert.equal(seen.redirect.url, 'http://s.test/contact/?contact=sent#contact-form')
      }
    }
  )

  test(name('no recipient configured: nothing is sent, not even to the admin address'), opts, () => {
    const [missing, noAdmin] = submit(theme, [{ options: { admin_email: ADMIN } }, { options: {} }])
    assertRefused(missing, 'failed', 'option missing')
    assert.deepEqual(missing.saw, [''], 'the filter is handed an empty recipient, never the admin address')
    assertRefused(noAdmin, 'failed', 'no option at all')
  })

  test(name('an unusable stored recipient is refused without a fallback or a PHP complaint'), opts, () => {
    const labels = Object.keys(UNUSABLE_OPTIONS)
    const seen = submit(
      theme,
      labels.map((label) => ({ options: { admin_email: ADMIN, tracy_contact_to: UNUSABLE_OPTIONS[label] } }))
    )
    labels.forEach((label, index) => {
      assertRefused(seen[index], 'failed', label)
      assert.deepEqual(seen[index].saw, [''], `${label}: what the filter was handed`)
    })
  })

  test(name('a filter can name the recipient, and only a valid one is used'), opts, () => {
    const [unconfigured, overriding] = submit(theme, [
      { options: { admin_email: ADMIN }, filter: 'filtered@customer.test' },
      { filter: 'filtered@customer.test' }
    ])
    assertSentTo(unconfigured, 'filtered@customer.test', 'filter on an unconfigured site')
    assertSentTo(overriding, 'filtered@customer.test', 'filter over a configured recipient')

    const labels = Object.keys(UNUSABLE_FILTERED)
    const seen = submit(
      theme,
      labels.map((label) => ({ filter: UNUSABLE_FILTERED[label] }))
    )
    labels.forEach((label, index) => assertRefused(seen[index], 'failed', `filter returns ${label}`))
  })

  test(name('nothing a visitor posts chooses the recipient'), opts, () => {
    const extra = {
      tracy_contact_to: 'thief@evil.test',
      to: 'thief@evil.test',
      admin_email: 'thief@evil.test'
    }
    const [configured, unconfigured] = submit(theme, [
      { post: { ...VALID, ...extra } },
      { post: { ...VALID, ...extra }, options: { admin_email: ADMIN } }
    ])
    assertSentTo(configured, OWNER, 'configured site')
    assertRefused(unconfigured, 'failed', 'unconfigured site')
  })

  test(name('a mailer that refuses or throws is never reported as sent'), opts, () => {
    const [refused, threw] = submit(theme, [{ mail: 'refuses' }, { mail: 'throws' }])
    for (const [label, seen] of [
      ['wp_mail returns false', refused],
      ['wp_mail throws', threw]
    ]) {
      assert.deepEqual(seen.notes, [], `${label}: PHP raised ${JSON.stringify(seen.notes)}`)
      assert.equal(seen.mails.length, 1, `${label}: one attempt`)
      assert.equal(seen.mails[0].to, OWNER, `${label}: recipient`)
      assert.equal(seen.state, 'failed', `${label}: state`)
    }
  })

  test(name('a bad nonce, a filled honeypot and missing visitor fields still send nothing'), opts, () => {
    const without = (key) => Object.fromEntries(Object.entries(VALID).filter(([k]) => k !== key))
    const cases = [
      ['a wrong nonce', { ...VALID, _tracy_nonce: 'nonce-other' }, 'invalid'],
      ['no nonce', without('_tracy_nonce'), 'invalid'],
      // A bot is told "sent" so it does not retry; nothing is mailed.
      ['a filled honeypot', { ...VALID, tracy_hp: 'http://spam.test' }, 'sent'],
      ['no name', { ...VALID, contact_name: '  ' }, 'invalid'],
      ['name missing', without('contact_name'), 'invalid'],
      ['an invalid visitor address', { ...VALID, contact_email: 'ada@' }, 'invalid'],
      ['visitor address missing', without('contact_email'), 'invalid'],
      ['an empty message', { ...VALID, contact_message: '' }, 'invalid'],
      ['message missing', without('contact_message'), 'invalid']
    ]
    // On a configured site and on one with no recipient: the guards answer first either way.
    for (const options of [{ admin_email: ADMIN, tracy_contact_to: OWNER }, { admin_email: ADMIN }]) {
      const seen = submit(
        theme,
        cases.map(([, post]) => ({ post, options }))
      )
      cases.forEach(([label, , state], index) => assertRefused(seen[index], state, label))
    }
  })

  test(name('a subject left empty gets the default one, to the configured recipient'), opts, () => {
    const [seen] = submit(theme, [{ post: { ...VALID, contact_subject: '' } }])
    assertSentTo(seen, OWNER, 'empty subject')
    assert.equal(seen.mails[0].subject, '[A Site] Message from the contact form')
  })
}
