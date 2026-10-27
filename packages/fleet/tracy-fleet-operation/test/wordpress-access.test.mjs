/**
 * The Tracy Access mu-plugin for WordPress, on the FIRST request a seat holder makes — #339.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/wordpress-access.test.mjs
 *
 * ⚠ WHY THIS EXISTS. "Open admin" sends an owner straight to `/wp-admin/`, often as their very first
 * request to the site. `wp-admin/admin.php` loads WordPress (the plugin signs the person in on
 * `init`) and then calls `auth_redirect()`, which validates the auth cookie of the REQUEST
 * (`$_COOKIE`). `wp_set_auth_cookie` only sets it on the RESPONSE, so that first hit answered
 * `302 wp-login.php?reauth=1` — and `reauth=1` clears the cookie just issued. The plugin now copies
 * the cookie WordPress minted into this request's `$_COOKIE`; these tests hold it to that, and to
 * never doing it for anyone the fleet did not vouch for as `editor`.
 *
 * ⚠ WHAT THIS IS NOT: a WordPress install. The plugin runs for real, but on a stub of the handful of
 * WordPress functions it calls. The stub's `wp_set_auth_cookie` and `auth_redirect_passes` follow
 * WordPress core's own order (actions fire, then `send_auth_cookies` decides, then `setcookie`;
 * the check reads `$_COOKIE[SECURE_AUTH_COOKIE]` over https and `$_COOKIE[AUTH_COOKIE]` over http)
 * so they catch the defect's shape; a regression in how core itself behaves would not show here.
 *
 * 0.4.0 (P0, open-source line): the plugin believes only the assertion tracy-web signs with the site's
 * key (`apps/tracy-web/src/bar/site-access.js`); every request below is signed by that very signer.
 *
 * Runs the real PHP through scripts/test-support/php.mjs: local `php`, else ONE php container for the
 * file; every request below runs in a single batch in `before()`. No PHP: fails on CI, skips locally.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'
import { siteAccessHeaders } from '../../../../apps/tracy-web/src/bar/site-access.js'

const PLUGIN = fileURLToPath(
  new URL('../scripts/provision/access/wordpress/tracy-access.php', import.meta.url)
)
const SOURCE = readFileSync(PLUGIN, 'utf8')

const PHP_SKIP = phpSupport().skip

/**
 * The WordPress surface the plugin touches, reduced to what a sign-in needs. Hooks are real
 * (add/remove/do/apply with priorities and arg counts); users live in an array; a session token is
 * remembered so the auth check can refuse a cookie WordPress never minted.
 */
const WP_STUB = String.raw`
define('ABSPATH', '/tmp/wp/');
define('AUTH_COOKIE', 'wordpress_h');
define('SECURE_AUTH_COOKIE', 'wordpress_sec_h');
define('LOGGED_IN_COOKIE', 'wordpress_logged_in_h');
define('DAY_IN_SECONDS', 86400);
class WP_User { public $ID = 0; public $user_email = ''; public $user_login = ''; public $roles = [];
  public function set_role($r) { $this->roles = [$r]; } }
class WP_Error {}
$GLOBALS['hooks'] = []; $GLOBALS['users'] = []; $GLOBALS['current'] = 0; $GLOBALS['sessions'] = [];
$GLOBALS['sent'] = []; $GLOBALS['logins'] = 0; $GLOBALS['logouts'] = 0;
function add_action($h, $cb, $p = 10, $n = 1) { $GLOBALS['hooks'][$h][$p][] = [$cb, $n]; return true; }
function add_filter($h, $cb, $p = 10, $n = 1) { return add_action($h, $cb, $p, $n); }
function remove_action($h, $cb, $p = 10) {
  foreach ($GLOBALS['hooks'][$h][$p] ?? [] as $i => $e) { if ($e[0] === $cb) { unset($GLOBALS['hooks'][$h][$p][$i]); return true; } }
  return false; }
function remove_filter($h, $cb, $p = 10) { return remove_action($h, $cb, $p); }
function apply_filters($h, $value, ...$args) {
  $all = $GLOBALS['hooks'][$h] ?? []; ksort($all);
  foreach ($all as $entries) foreach ($entries as [$cb, $n]) $value = $cb(...array_slice(array_merge([$value], $args), 0, $n));
  return $value; }
function do_action($h, ...$args) {
  $all = $GLOBALS['hooks'][$h] ?? []; ksort($all);
  foreach ($all as $entries) foreach ($entries as [$cb, $n]) $cb(...array_slice($args, 0, $n)); }
function is_ssl() { return ($_SERVER['HTTPS'] ?? '') === 'on'; }
function get_option($k, $d = false) { return $d; }
function wp_roles() { return new class { public function is_role($r) { return in_array($r, ['administrator', 'editor'], true); } }; }
function is_wp_error($v) { return $v instanceof WP_Error; }
function sanitize_user($u, $strict = false) { return preg_replace('/[^a-z0-9_.-]/i', '', $u); }
function wp_generate_password($n = 12, $a = true, $b = false) { return str_repeat('x', $n); }
function update_user_meta($id, $k, $v) { $GLOBALS['meta'][$id][$k] = $v; return true; }
function get_user_meta($id, $k, $single = false) { return $GLOBALS['meta'][$id][$k] ?? ''; }
// The nonce table: a primary key on the nonce, as MySQL would hold it. 'broken' fails every write.
class Tracy_Wpdb_Stub { public $prefix = 'wp_'; public $nonces = []; public $broken = false;
  public function suppress_errors($q = true) { return false; }
  public function insert($table, $row, $formats = null) {
    if ($this->broken || isset($this->nonces[$row['nonce']])) return false;
    $this->nonces[$row['nonce']] = $row['exp']; return 1; }
  public function query($sql) { return true; }
  public function prepare($sql, ...$a) { return $sql; } }
$GLOBALS['wpdb'] = new Tracy_Wpdb_Stub(); $GLOBALS['meta'] = [];
// A key file of this process only: a shared /tmp path can be held by another run on the same host.
$tracy_key_file = tempnam(sys_get_temp_dir(), 'tracy-access-key-');
if ($tracy_key_file === false || file_put_contents($tracy_key_file, getenv('TRACY_KEY_JSON')) === false) { fwrite(STDERR, "cannot write the test key\n"); exit(3); }
register_shutdown_function(function () use ($tracy_key_file) { @unlink($tracy_key_file); });
putenv('TRACY_ACCESS_KEY_FILE=' . (getenv('TRACY_NO_KEY') ? $tracy_key_file . '.absent' : $tracy_key_file));
function get_user_by($field, $value) {
  foreach ($GLOBALS['users'] as $u) {
    if (($field === 'email' && $u->user_email === $value) || ($field === 'login' && $u->user_login === $value) || ($field === 'id' && $u->ID === (int) $value)) return $u; }
  return false; }
function wp_insert_user($d) { $u = new WP_User(); $u->ID = count($GLOBALS['users']) + 1; $u->user_email = $d['user_email'];
  $u->user_login = $d['user_login']; $u->roles = [$d['role']]; $GLOBALS['users'][] = $u; return $u->ID; }
function wp_get_current_user() { return get_user_by('id', $GLOBALS['current']) ?: new WP_User(); }
function wp_set_current_user($id) { $GLOBALS['current'] = (int) $id; return wp_get_current_user(); }
function wp_logout() { $GLOBALS['logouts']++; $GLOBALS['current'] = 0; }
// Core's order: mint, fire both actions, THEN ask send_auth_cookies, THEN setcookie.
function wp_set_auth_cookie($user_id, $remember = false, $secure = '', $token = '') {
  $expiration = time() + 14 * DAY_IN_SECONDS; $expire = $expiration + 43200;
  if ($secure === '') $secure = is_ssl();
  $scheme = $secure ? 'secure_auth' : 'auth';
  $token = bin2hex(random_bytes(8)); $GLOBALS['sessions'][$token] = (int) $user_id;
  $auth = "u$user_id|$expiration|$token|$scheme"; $logged_in = "u$user_id|$expiration|$token|logged_in";
  do_action('set_auth_cookie', $auth, $expire, $expiration, $user_id, $scheme, $token);
  do_action('set_logged_in_cookie', $logged_in, $expire, $expiration, $user_id, 'logged_in', $token);
  if (!apply_filters('send_auth_cookies', true, $expire, $expiration, $user_id, $scheme, $token)) return;
  $GLOBALS['sent'][] = $secure ? SECURE_AUTH_COOKIE : AUTH_COOKIE; $GLOBALS['sent'][] = LOGGED_IN_COOKIE; }
// auth_redirect()'s own question: is there a valid auth cookie on THIS request, for its scheme?
function auth_redirect_passes() {
  $scheme = is_ssl() ? 'secure_auth' : 'auth';
  $cookie = $_COOKIE[$scheme === 'secure_auth' ? SECURE_AUTH_COOKIE : AUTH_COOKIE] ?? '';
  $parts = explode('|', $cookie);
  if (count($parts) !== 4 || $parts[3] !== $scheme) return false;
  return isset($GLOBALS['sessions'][$parts[2]]) && 'u' . $GLOBALS['sessions'][$parts[2]] === $parts[0]; }
`

const SITE = 'p0acc-wpa'
const KEY = Buffer.alloc(32, 7)
const KEY_JSON = JSON.stringify({ v: 1, kid: 'k-test', site: SITE, key: KEY.toString('base64url') })
const HOST = 'p0acc-wpa.tracy.test:8080'

/**
 * `$_SERVER` of one request tracy-web proxied: the signed assertion for `who`, plus the request line
 * it is bound to. `sign` overrides what is signed (another key, another site, another host…).
 */
// PHP's clock, as an offset from this process's: the verifier reads time(), and a container's clock
// (a Docker VM on a CI runner) can drift further than an assertion's 30 s life.
let phpClockOffset = 0

function signed(who, { method = 'GET', target = '/wp-admin/', sign = {}, extra = {} } = {}) {
  const headers = siteAccessHeaders({
    now: Date.now() + phpClockOffset,
    site: SITE,
    kid: 'k-test',
    key: KEY,
    email: '',
    role: '',
    tier: 'guest',
    host: HOST,
    method,
    target,
    ...who,
    ...sign
  })
  return {
    HTTP_HOST: HOST,
    REQUEST_METHOD: method,
    REQUEST_URI: target,
    HTTP_X_TRACY_ASSERT: headers['x-tracy-assert'],
    HTTP_X_TRACY_SIG: headers['x-tracy-sig'],
    ...extra
  }
}

/**
 * One first request to `/wp-admin/`: the headers the proxy set, no cookie in the browser. Runs the
 * plugin's `init`, then answers what `auth_redirect()` would. the `after` snippet runs after `init` (a second
 * request in the same process, for replay). Returns the php case to run.
 */
const firstAdminHitCase = ({ server = {}, setup = '', after = '', noKey = false } = {}) => {
  const code = `${WP_STUB}
$_COOKIE = [];
foreach (json_decode(getenv('TRACY_SERVER'), true) as $k => $v) { $_SERVER[$k] = $v; }
${setup}
eval('?>' . getenv('TRACY_ACCESS_SRC'));
do_action('init');
${after}
$u = wp_get_current_user();
echo json_encode([
  'current' => $u->ID > 0 ? $u->user_email : null,
  'roles' => $u->roles,
  'authRedirectPasses' => auth_redirect_passes(),
  'requestCookies' => array_keys($_COOKIE),
  'sent' => $GLOBALS['sent'],
  'users' => count($GLOBALS['users']),
  'logouts' => $GLOBALS['logouts'],
  'hooksLeft' => count($GLOBALS['hooks']['set_auth_cookie'][PHP_INT_MAX] ?? [])
    + count($GLOBALS['hooks']['set_logged_in_cookie'][PHP_INT_MAX] ?? [])
    + count($GLOBALS['hooks']['send_auth_cookies'][PHP_INT_MAX] ?? []),
]);`
  return {
    args: ['-r', code],
    env: {
      TRACY_ACCESS_SRC: SOURCE,
      TRACY_SERVER: JSON.stringify(server),
      TRACY_KEY_JSON: KEY_JSON,
      ...(noKey ? { TRACY_NO_KEY: '1' } : {})
    }
  }
}

const OWNER = { email: 'owner@x.y', role: 'owner', tier: 'editor' }

/** A signed-in account already in this browser before the request: `created` = made by this plugin. */
const alreadySignedIn = (email, roles, created) =>
  `$u = new WP_User(); $u->ID = 1; $u->user_email = '${email}'; $u->user_login = 'pre'; $u->roles = ${roles};
   $GLOBALS['users'][] = $u; $GLOBALS['current'] = 1; ${created ? "$GLOBALS['meta'][1]['tracy_access_created'] = 1;" : ''}`

const NOT_EDITOR = [
  ['a viewer tier', () => signed({ ...OWNER, tier: 'viewer' })],
  ['an anonymous guest (no seat)', () => signed({})]
]
const STATEFUL = [
  ['refuses, then would allow', 'false, true', false],
  ['allows, then would refuse', 'true, false', true]
]
// What other sites' code could send: the bare headers the plugin believed before 0.4.0, and
// assertions that are real but not for this site, this request, or under this key.
const FORGED = [
  [
    'bare x-tracy-* headers (the cross-site hole)',
    () => ({
      HTTP_HOST: HOST,
      REQUEST_METHOD: 'GET',
      REQUEST_URI: '/wp-admin/',
      HTTP_X_TRACY_EMAIL: 'stranger@evil.example',
      HTTP_X_TRACY_TIER: 'editor',
      HTTP_X_TRACY_ROLE: 'owner'
    })
  ],
  [
    "an assertion signed with another site's key",
    () => signed(OWNER, { sign: { key: Buffer.alloc(32, 9) } })
  ],
  ['an assertion for another site, under its own key', () => signed(OWNER, { sign: { site: 'p0acc-wpb' } })],
  ['an assertion for another request target', () => signed(OWNER, { sign: { target: '/' } })],
  ['an assertion for another host', () => signed(OWNER, { sign: { host: 'p0acc-wpb.tracy.test:8080' } })],
  ['an assertion that expired', () => signed(OWNER, { sign: { now: Date.now() + phpClockOffset - 120_000 } })]
]

/** The front end after the plugin signed the owner in: is anyone signed in, and would the toolbar draw. */
const toolbarCase = () => ({
  args: [
    '-r',
    `${WP_STUB}
$_COOKIE = [];
foreach (json_decode(getenv('TRACY_SERVER'), true) as $k => $v) { $_SERVER[$k] = $v; }
eval('?>' . getenv('TRACY_ACCESS_SRC'));
do_action('init');
echo json_encode([
  'signedIn' => wp_get_current_user()->ID > 0,
  'toolbar' => apply_filters('show_admin_bar', true),
]);`
  ],
  env: {
    TRACY_ACCESS_SRC: SOURCE,
    TRACY_SERVER: JSON.stringify(signed(OWNER, { target: '/' })),
    TRACY_KEY_JSON: KEY_JSON
  }
})

/** Request headers as PHP's `$_SERVER` carries them. */
const asServer = (headers) =>
  Object.fromEntries(
    [...new Headers(headers).entries()].map(([name, value]) => [
      `HTTP_${name.toUpperCase().replaceAll('-', '_')}`,
      value
    ])
  )
/** What the site is sent when a forged request arrives on the own domain through tracy-web. */
async function throughOwnDomainProxy(forged) {
  const { proxySite } = await import('../../../../apps/tracy-web/src/bar/site-proxy.js')
  let reached = null
  await proxySite(
    new Request('https://www.customer-shop.com/wp-admin/admin-ajax.php', { headers: forged }),
    new URL('http://shop-web-1/wp-admin/admin-ajax.php'),
    {
      email: null,
      role: null,
      sameHost: true,
      viewerHost: 'www.customer-shop.com',
      viewerProto: 'https',
      publish: 'published',
      variant: 'none',
      canonical: new URL('https://shop.tracy.site'),
      fetchImpl: async (request) => {
        reached = request.headers
        return new Response('ok', { headers: { 'content-type': 'text/plain' } })
      }
    }
  )
  return asServer(reached)
}

const hit = {}
const HITS = {}
let php
let proxied = null
before(async () => {
  if (PHP_SKIP) return
  // Start PHP first: assertions live 30 s, and a cold runner can spend longer pulling the image.
  php = startPhp()
  const [clock] = php.run([{ args: ['-r', 'echo time();'] }])
  phpClockOffset = Number(clock.stdout) * 1000 - Date.now()
  HITS.http = { server: signed(OWNER) }
  HITS.https = { server: signed(OWNER, { extra: { HTTPS: 'on' } }) }
  HITS.refuse = {
    server: signed(OWNER),
    setup:
      "add_filter('send_auth_cookies', '__return_false_stub', 10, 1); function __return_false_stub() { return false; }"
  }
  for (const [name, server] of NOT_EDITOR) HITS[name] = { server: server() }
  for (const [name, answers] of STATEFUL)
    HITS[name] = {
      server: signed(OWNER),
      setup:
        `$GLOBALS['answers'] = [${answers}]; ` +
        "add_filter('send_auth_cookies', 'stateful_send_stub', 10, 1); " +
        "function stateful_send_stub() { return array_shift($GLOBALS['answers']) ?? true; }"
    }
  for (const [name, server] of FORGED) HITS[name] = { server: server() }
  HITS.replay = {
    server: signed(OWNER),
    // The same assertion again, in a fresh browser: the nonce was taken by the first request.
    after:
      "$first = wp_get_current_user()->user_email; $GLOBALS['current'] = 0; $_COOKIE = []; $GLOBALS['sent'] = []; tracy_access_sync_identity();"
  }
  HITS['nonce store fails'] = { server: signed(OWNER), setup: "$GLOBALS['wpdb']->broken = true;" }
  HITS['no key on this site'] = { server: signed(OWNER), noKey: true }
  HITS['lost seat, Tracy-made session'] = {
    server: signed({}),
    setup: alreadySignedIn('gone@x.y', "['administrator']", true)
  }
  HITS["lost seat, customer's own session"] = {
    server: signed({}),
    setup: alreadySignedIn('customer@x.y', "['administrator']", false)
  }
  HITS['owner demoted to editor'] = {
    server: signed({ email: 'owner@x.y', role: 'editor', tier: 'editor' }),
    setup: alreadySignedIn('owner@x.y', "['administrator']", true)
  }
  HITS['customer admin vouched as editor'] = {
    server: signed({ email: 'customer@x.y', role: 'editor', tier: 'editor' }),
    setup: alreadySignedIn('customer@x.y', "['administrator']", false)
  }
  proxied = await throughOwnDomainProxy({
    'x-tracy-email': 'stranger@evil.example',
    'x-tracy-tier': 'editor',
    'x-tracy-role': 'owner'
  })
  HITS['forged, through the own-domain proxy'] = { server: { ...proxied, HTTPS: 'on' } }
  const keys = [...Object.keys(HITS), 'toolbar']
  const outs = php.run([...Object.keys(HITS).map((k) => firstAdminHitCase(HITS[k])), toolbarCase()])
  keys.forEach((k, i) => {
    assert.equal(outs[i].status, 0, `php failed: ${outs[i].stderr}${outs[i].stdout}`)
    hit[k] = JSON.parse(outs[i].stdout)
  })
})
after(() => php?.stop())

const nobody = (r) => {
  assert.equal(r.current, null)
  assert.equal(r.authRedirectPasses, false)
  assert.deepEqual(r.requestCookies, [])
  assert.deepEqual(r.sent, [])
}

test('an editor-tier owner passes auth_redirect on the FIRST /wp-admin hit, over http', {
  skip: PHP_SKIP
}, () => {
  const r = hit.http
  assert.equal(r.current, 'owner@x.y')
  assert.deepEqual(r.roles, ['administrator'])
  assert.equal(r.authRedirectPasses, true)
  assert.deepEqual(r.requestCookies.sort(), ['wordpress_h', 'wordpress_logged_in_h'])
  assert.deepEqual(r.sent, ['wordpress_h', 'wordpress_logged_in_h'])
  // The capture hooks are gone once the sign-in is done — they never see a later login.
  assert.equal(r.hooksLeft, 0)
})

test('over https the SECURE auth cookie is the one placed on the request', { skip: PHP_SKIP }, () => {
  const r = hit.https
  assert.equal(r.authRedirectPasses, true)
  assert.deepEqual(r.requestCookies.sort(), ['wordpress_logged_in_h', 'wordpress_sec_h'])
})

for (const [name] of NOT_EDITOR) {
  test(`${name}: nobody is signed in and no cookie is placed on the request`, { skip: PHP_SKIP }, () => {
    nobody(hit[name])
  })
}

test('a site that refuses to send auth cookies gets none on the request either', { skip: PHP_SKIP }, () => {
  const r = hit.refuse
  assert.deepEqual(r.sent, [])
  assert.deepEqual(r.requestCookies, [])
  assert.equal(r.authRedirectPasses, false)
})

// Astra review: the answer must be the one `wp_set_auth_cookie` acted on, not a second asking.
for (const [name, , placed] of STATEFUL) {
  test(`a send_auth_cookies filter that ${name}: the request follows what was actually sent`, {
    skip: PHP_SKIP
  }, () => {
    const r = hit[name]
    assert.equal(r.sent.length > 0, placed)
    assert.equal(r.authRedirectPasses, placed)
    assert.deepEqual(r.requestCookies.sort(), placed ? ['wordpress_h', 'wordpress_logged_in_h'] : [])
    assert.equal(r.hooksLeft, 0)
  })
}

// Akemi, 29/09: Joomla shows no toolbar on its site pages, so WordPress must not either.
test('the WordPress toolbar is never drawn on the front end, whoever is signed in', {
  skip: PHP_SKIP
}, () => {
  const r = hit.toolbar
  assert.equal(r.signedIn, true, 'the owner is signed in, as the editor WordPress would draw it for')
  assert.equal(r.toolbar, false)
})

for (const [name] of FORGED) {
  test(`P0: ${name} — nobody is signed in and no user is created`, { skip: PHP_SKIP }, () => {
    nobody(hit[name])
    assert.equal(hit[name].users, 0)
  })
}

test('P0: one assertion is accepted once — the replay signs nobody in', { skip: PHP_SKIP }, () => {
  nobody(hit.replay)
  assert.equal(hit.replay.users, 1, 'the first request made the account')
})

test('P0: a nonce store that cannot write refuses the assertion', { skip: PHP_SKIP }, () => {
  nobody(hit['nonce store fails'])
  assert.equal(hit['nonce store fails'].users, 0)
})

test('P0: a site with no key believes no assertion', { skip: PHP_SKIP }, () => {
  nobody(hit['no key on this site'])
})

test('a lost seat ends the session of an account this plugin made', { skip: PHP_SKIP }, () => {
  assert.equal(hit['lost seat, Tracy-made session'].current, null)
  assert.equal(hit['lost seat, Tracy-made session'].logouts, 1)
})

test("a lost seat leaves the customer's own account signed in", { skip: PHP_SKIP }, () => {
  assert.equal(hit["lost seat, customer's own session"].current, 'customer@x.y')
  assert.equal(hit["lost seat, customer's own session"].logouts, 0)
})

test('an owner demoted to editor loses administrator on an account this plugin made', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(hit['owner demoted to editor'].roles, ['editor'])
})

test("the customer's own administrator is never demoted by a seat", { skip: PHP_SKIP }, () => {
  assert.deepEqual(hit['customer admin vouched as editor'].roles, ['administrator'])
})

test('#1037: a forged request on the own domain through tracy-web reaches the site with no x-tracy-* header — nobody is signed in', {
  skip: PHP_SKIP
}, () => {
  assert.deepEqual(
    Object.keys(proxied).filter((name) => name.startsWith('HTTP_X_TRACY')),
    [],
    'the proxy stripped every x-tracy-* header the client sent'
  )
  assert.equal(proxied.HTTP_X_FORWARDED_HOST, 'shop.tracy.site')
  nobody(hit['forged, through the own-domain proxy'])
})
