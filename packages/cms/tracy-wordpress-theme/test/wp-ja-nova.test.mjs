/**
 * wp-ja-nova 1.1.5 — the audited defects, held as behaviour where a script or PHP function can run here and as
 * source facts where only a browser sees the result (the browser measurements live with the release record,
 * tasks/ja-nova-wp7/release/BROWSER.json, made by tasks/ja-nova-wp7/tools/measure115.mjs).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'
import { taskDossier } from './task-dossier.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(path.join(PKG, rel), 'utf8')
const { dir: TASK, skip: noDossier } = taskDossier('ja-nova-wp7')
const readTask = (rel) => readFileSync(path.join(TASK, rel), 'utf8')
const BASES = ['overlays', 'src']

// ── the theme switch flips what the page shows ─────────────────────────────────────────────────────
function runSwitch(file, { osDark = false, cookie = '', search = '', clicks = 0 }) {
  const attrs = new Map()
  const listeners = {}
  const buttons = [new Map(), new Map()]
  const document = {
    cookie,
    readyState: 'complete',
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      removeAttribute: (k) => attrs.delete(k)
    },
    querySelectorAll: () => buttons.map((b) => ({ setAttribute: (k, v) => b.set(k, v) })),
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn)
  }
  const mq = { matches: osDark, listeners: [], addEventListener: (_t, fn) => mq.listeners.push(fn) }
  const window = { matchMedia: () => mq }
  new Function('document', 'window', 'location', read(file))(document, window, { search, protocol: 'https:' })
  const seen = []
  for (let i = 0; i < clicks; i += 1) {
    const button = { closest: () => button }
    for (const fn of listeners.click ?? []) fn({ target: button, preventDefault: () => {} })
    seen.push(attrs.get('data-theme') ?? 'auto')
  }
  return { seen, cookie: document.cookie, attrs, buttons, mq }
}

for (const base of BASES) {
  const file = `${base}/wp-ja-nova/assets/js/wp-ja-nova-dark.js`
  test(`${file}: every click flips light and dark, so the first click always changes the page`, () => {
    assert.deepEqual(runSwitch(file, { osDark: false, clicks: 3 }).seen, ['dark', 'light', 'dark'])
    assert.deepEqual(runSwitch(file, { osDark: true, clicks: 3 }).seen, ['light', 'dark', 'light'])
    // an old three-state cookie that says auto is still read, and is flipped like no cookie
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=auto', osDark: true, clicks: 1 }).seen, ['light'])
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=dark', osDark: false, clicks: 2 }).seen, [
      'light',
      'dark'
    ])
    // a cookie value that is no state is no cookie; two cookies of the name: the first in the string decides
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=purple', osDark: false, clicks: 1 }).seen, [
      'dark'
    ])
    assert.deepEqual(
      runSwitch(file, { cookie: 'a=b; tracy_theme=dark; tracy_theme=light', osDark: false, clicks: 1 }).seen,
      ['light']
    )
  })

  test(`${file}: a click saves the flipped choice, a plain load saves nothing, ?theme= is flipped like any state`, () => {
    assert.match(runSwitch(file, { clicks: 1 }).cookie, /tracy_theme=dark/)
    assert.equal(runSwitch(file, { search: '?theme=dark' }).cookie, '')
    const queried = runSwitch(file, { search: '?theme=dark', clicks: 1 })
    assert.deepEqual(queried.seen, ['light'])
    assert.match(queried.cookie, /tracy_theme=light/)
    // the first `theme` value decides; an invalid or empty first value leaves the cookie and the default
    assert.equal(runSwitch(file, { search: '?theme=purple&theme=dark' }).attrs.get('data-theme'), 'light')
    assert.equal(runSwitch(file, { search: '?theme=&theme=dark' }).attrs.get('data-theme'), 'light')
  })

  test(`${file}: with no choice saved the root always says what the system shows, and follows the system live (1.1.6)`, () => {
    // the hand-written dark rules are keyed on [data-theme=dark]; an unset root left a dark system half light
    assert.equal(runSwitch(file, { osDark: true }).attrs.get('data-theme'), 'dark')
    assert.equal(runSwitch(file, { osDark: false }).attrs.get('data-theme'), 'light')
    assert.equal(
      runSwitch(file, { cookie: 'tracy_theme=auto', osDark: true }).attrs.get('data-theme'),
      'dark'
    )
    // a saved choice beats the system
    assert.equal(
      runSwitch(file, { cookie: 'tracy_theme=light', osDark: true }).attrs.get('data-theme'),
      'light'
    )
    const live = runSwitch(file, { osDark: true })
    live.mq.matches = false
    for (const fn of live.mq.listeners) fn()
    assert.equal(live.attrs.get('data-theme'), 'light')
  })

  test(`${file}: the buttons say what a click does, from what the page shows (auto follows the OS)`, () => {
    const light = runSwitch(file, { osDark: false })
    assert.equal(light.buttons[0].get('data-theme-state'), 'light')
    assert.equal(light.buttons[0].get('aria-pressed'), 'false')
    assert.match(light.buttons[1].get('aria-label'), /Switch to dark/)
    const dark = runSwitch(file, { osDark: true })
    assert.equal(dark.buttons[0].get('data-theme-state'), 'dark')
    assert.equal(dark.buttons[0].get('aria-pressed'), 'true')
    assert.match(dark.buttons[0].get('aria-label'), /Switch to light/)
    // the OS flips while the choice is auto: the buttons follow without a click
    dark.mq.matches = false
    for (const fn of dark.mq.listeners) fn()
    assert.equal(dark.buttons[0].get('data-theme-state'), 'light')
  })
}

// ── source facts of the header, the drawer, the career cards, the search page ─────────────────────────
for (const base of BASES) {
  test(`${base}: the header and footer logos are Site Logo blocks, a light and a dark one swapped by theme (1.1.10, T28)`, () => {
    const header = read(`${base}/wp-ja-nova/parts/header.html`)
    const footer = read(`${base}/wp-ja-nova/parts/footer.html`)
    assert.ok(!header.includes('wp:site-title'), 'the text site name is gone')
    assert.ok(!header.includes('Sidebar Menu'), 'the drawer head is no longer a text title')
    // no demo picture is wired into a part any more: the customer's logo is site_logo / tracy_logo_dark
    for (const part of [header, footer]) assert.doesNotMatch(part, /wp:image|item-[12]\.png|wp-image-/)
    const logos = header.match(/<!-- wp:site-logo \{[^}]*\} \/-->/g) ?? []
    assert.equal(logos.length, 4, 'a light and a dark logo in the bar and in the drawer')
    assert.equal(logos.filter((b) => b.includes('jn-logo--light')).length, 2)
    assert.equal(logos.filter((b) => b.includes('jn-logo--dark')).length, 2)
    // the footer sits on a dark ground in both modes: it reads the dark logo
    assert.match(footer, /<!-- wp:site-logo \{[^}]*"className":"jn-footer__logo tracy-logo-dark"\} \/-->/)
    // the copyright line names the site, not the demo
    assert.match(footer, /Copyright © \{year\} \{site\.title\}\. All Rights Reserved\./)
    assert.doesNotMatch(footer, /ja_nova/)
  })

  test(`${base}: the menu order follows the source's markup from lg to xxl, and the controls are 24 px or more`, () => {
    const css = read(`${base}/wp-ja-nova/assets/css/wp-ja-nova.css`)
    assert.match(
      css,
      /@media \(max-width: 1399\.98px\) and \(min-width: 992px\) \{[^}]*\.jn-header__brand \{ order: 1;[^}]*\}\s*body\.tracy \.jn-header__menu \{ order: 2;/
    )
    assert.match(
      css,
      /> \.has-child > \.wp-block-navigation__submenu-icon \{ display: flex; align-items: center; justify-content: center; width: 24px; height: 24px;/
    )
    assert.doesNotMatch(css, /width: 22px; height: 22px/)
    assert.match(css, /\.jn-drawer-toggle \{[^}]*padding: 1px 2\.5px;/)
    // the drawer drills down: a panel over the list, a back row, ruled child rows
    assert.match(css, /\.jn-drill-back__button \{/)
    assert.match(css, /text-transform: uppercase;/)
    assert.doesNotMatch(css, /\.jn-drawer__title/)
    assert.doesNotMatch(css, /\.jn-site-name/)
  })

  test(`${base}: career cards draw the clock and the pin before their lines`, () => {
    const css = read(`${base}/wp-ja-nova/assets/css/wp-ja-nova.css`)
    assert.match(
      css,
      /\.jn-position__type::before,\s*body\.tracy \.jn-position__place::before \{[^}]*content: '';/
    )
    assert.match(css, /\.jn-position__type::before \{ width: 16px; \}/)
    assert.match(css, /\.jn-position__place::before \{ width: 12px; \}/)
  })

  test(`${base}: no source-CMS wording in anything a visitor reads`, { skip: noDossier }, () => {
    const re = /joomla|J!|joomlart\.com|JoomlArt/i
    const files = [
      'parts/header.html',
      'parts/footer.html',
      'patterns/acm-search-band.php',
      'patterns/acm-positions.php'
    ]
    for (const f of files) {
      const text = read(`${base}/wp-ja-nova/${f}`)
      // the license credit lines of an icon set are not site wording
      // and a slot name such as images/joomlart/logo/item-1.png is a media key, never printed
      // (the pattern header comment is inserter metadata for editors, not page text)
      const visible = text
        .replace(/^<\?php\s*\/\*\*[\s\S]*?\*\/\s*\?>/, '')
        .replace(/Font Awesome[^\n]*/g, '')
        .replace(/images\/joomlart\/[\w./-]+/g, '')
      assert.doesNotMatch(visible, re, f)
    }
    const content = JSON.parse(readTask('spec/content.json'))
    const shown = (s) =>
      String(s)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/images\/joomlart\/[\w./-]+/g, '')
    for (const p of [...content.pages, ...content.posts]) {
      assert.doesNotMatch(shown(p.content ?? ''), re, `page ${p.slug}`)
      assert.doesNotMatch(String(p.excerpt ?? ''), re, `excerpt ${p.slug}`)
      assert.doesNotMatch(String(p.title ?? ''), re, `title ${p.slug}`)
    }
    const menus = readTask('spec/menus.json')
    assert.doesNotMatch(menus.replace(/"joomlaPath": "[^"]*"/g, ''), /"label": "[^"]*(J!|Joomla)/)
    for (const [label] of menus.matchAll(/"label": "[^"]*"/g)) assert.doesNotMatch(label, /J!|joomla/i, label)
  })
}

// ── the navigation script: touch tap order, drawer drill-down ────────────────────────────────────────
for (const base of BASES) {
  const file = `${base}/wp-ja-nova/assets/js/wp-ja-nova.js`
  test(`${file}: a first touch tap on a parent opens its panel, the second follows the link; the drawer drills down`, () => {
    const js = read(file)
    assert.match(js, /event\.pointerType \? event\.pointerType === 'touch' : lastPointer === 'touch'/)
    assert.match(js, /onLabel && touch && top && !isOpen\(item\)/)
    assert.match(
      js,
      /event\.preventDefault\(\)\s*event\.stopPropagation\(\)\s*for \(const other of openParents\(\)\)/
    )
    // a touch pointer never reaches WordPress's hover handlers, which would open the panel before the click decides
    assert.match(js, /!desktop\.matches \|\| event\.pointerType === 'touch'/)
    assert.match(js, /jn-drill-back/)
    assert.match(js, /Escape/)
    assert.match(js, /closeAll\(\)/)
  })
}

// ── the sign-in, registration and search additions of inc/extra.php (PHP) ─────────────────────────────
const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({})
})
after(() => php?.stop())

const WP_STUBS = String.raw`
define('ABSPATH', '/');
class WP_REST_Request { public function __construct(public string $body = '') {} public function get_body() { return $this->body; } }
class WP_REST_Response { public function __construct(public $data = null, public int $status = 200) {} }
$GLOBALS['t'] = []; $GLOBALS['um'] = []; $GLOBALS['cookie'] = null; $GLOBALS['uid'] = 7; $GLOBALS['logged'] = true;
$GLOBALS['home'] = 'https://shop.example'; $GLOBALS['opts'] = []; $GLOBALS['tpl'] = 'page-register'; $GLOBALS['singular'] = true;
function add_filter(...$a) {} function add_action(...$a) {} function do_action(...$a) {}
function home_url($p = '') { return $GLOBALS['home'] . $p; }
function wp_parse_url($u, $c = -1) { return parse_url($u); }
function get_bloginfo($k) { return 'Shop'; }
function __($t, $d = '') { return $t; } function esc_html__($t, $d = '') { return htmlspecialchars($t); } function esc_attr__($t, $d = '') { return htmlspecialchars($t); }
function esc_html($t) { return htmlspecialchars($t); } function esc_attr($t) { return htmlspecialchars($t); } function esc_url($t) { return $t; }
function wp_kses($t, $a = []) { return $t; }
function set_transient($k, $v, $e) { $GLOBALS['t'][$k] = $v; return true; }
function get_transient($k) { return $GLOBALS['t'][$k] ?? false; }
function delete_transient($k) { unset($GLOBALS['t'][$k]); return true; }
function get_current_user_id() { return $GLOBALS['uid']; }
function wp_get_current_user() { return (object) ['ID' => $GLOBALS['uid'], 'user_login' => 'ann', 'display_name' => 'Ann']; }
function is_user_logged_in() { return $GLOBALS['logged']; }
function maybe_unserialize($v) { return $v; }
function get_user_meta($id, $key = '', $single = false) { if ($key === '') { $o = []; foreach ($GLOBALS['um'][$id] ?? [] as $k => $v) { $o[$k] = [$v]; } return $o; } return $GLOBALS['um'][$id][$key] ?? ''; }
function add_user_meta($id, $k, $v, $u = false) { $GLOBALS['um'][$id][$k] = $v; return true; }
function update_user_meta($id, $k, $v) { $GLOBALS['um'][$id][$k] = $v; return true; }
function delete_user_meta($id, $k) { $had = isset($GLOBALS['um'][$id][$k]); unset($GLOBALS['um'][$id][$k]); return $had; }
function get_users($a) { foreach ($GLOBALS['um'] as $id => $m) { if (isset($m[$a['meta_key']])) { return [$id]; } } return []; }
function sanitize_text_field($s) { return trim(strip_tags($s)); }
function get_userdata($id) { return (object) ['ID' => $id, 'user_login' => 'ann']; }
function wp_set_current_user($id) {} function wp_set_auth_cookie($id, $r = false) { $GLOBALS['cookie'] = $id; }
function get_page_by_path($p) { return null; } function get_permalink($p) { return '/'; }
function get_option($n) { return $GLOBALS['opts'][$n] ?? false; }
function is_singular($t = '') { return $GLOBALS['singular']; } function get_page_template_slug() { return $GLOBALS['tpl']; }
function is_page() { return true; } function is_search() { return false; }
function site_url($p = '', $s = '') { return 'https://shop.example/' . $p; }
function wp_lostpassword_url() { return '/lost'; }
function get_posts($a) { return []; }
`

const PASSKEY_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
eval($in['stubs']);
eval($in['code']);
$rpId = 'shop.example'; $origin = 'https://shop.example';
function b64u($b) { return wp_ja_nova_b64u_encode($b); }
function cbor_head($major, $n) { if ($n < 24) return chr(($major << 5) | $n); if ($n < 256) return chr(($major << 5) | 24) . chr($n); return chr(($major << 5) | 25) . pack('n', $n); }
function cbor_int($n) { return $n >= 0 ? cbor_head(0, $n) : cbor_head(1, -1 - $n); }
function cbor_bytes($s) { return cbor_head(2, strlen($s)) . $s; }
function cbor_text($s) { return cbor_head(3, strlen($s)) . $s; }
function cbor_map($pairs) { $o = cbor_head(5, count($pairs)); foreach ($pairs as [$k, $v]) { $o .= $k . $v; } return $o; }
function pad32($s) { return str_pad($s, 32, "\0", STR_PAD_LEFT); }
function new_key($kind) {
  if ($kind === 'es') {
    $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    $d = openssl_pkey_get_details($k)['ec'];
    $cose = cbor_map([[cbor_int(1), cbor_int(2)], [cbor_int(3), cbor_int(-7)], [cbor_int(-1), cbor_int(1)], [cbor_int(-2), cbor_bytes(pad32($d['x']))], [cbor_int(-3), cbor_bytes(pad32($d['y']))]]);
  } else {
    $k = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    $d = openssl_pkey_get_details($k)['rsa'];
    $cose = cbor_map([[cbor_int(1), cbor_int(3)], [cbor_int(3), cbor_int(-257)], [cbor_int(-1), cbor_bytes($d['n'])], [cbor_int(-2), cbor_bytes($d['e'])]]);
  }
  return [$k, $cose];
}
function fresh() { $GLOBALS['t'] = []; $GLOBALS['um'] = []; $GLOBALS['cookie'] = null; }
function challenge($purpose, $user) { return wp_ja_nova_passkey_issue($purpose, $user); }
function register_body($key, $cose, $credId, $o = []) {
  global $rpId, $origin;
  $ch = $o['challenge'] ?? challenge('register', 7);
  $client = json_encode(['type' => $o['type'] ?? 'webauthn.create', 'challenge' => $ch, 'origin' => $o['origin'] ?? $origin]);
  $auth = hash('sha256', $o['rp'] ?? $rpId, true) . chr($o['flags'] ?? 0x45) . pack('N', 0) . str_repeat("\0", 16) . pack('n', strlen($credId)) . $credId . $cose;
  $obj = cbor_map([[cbor_text('fmt'), cbor_text('none')], [cbor_text('attStmt'), cbor_map([])], [cbor_text('authData'), cbor_bytes($auth)]]);
  return json_encode(['id' => b64u($credId), 'clientDataJSON' => b64u($client), 'attestationObject' => b64u($obj), 'name' => 'Laptop']);
}
function login_body($key, $credId, $o = []) {
  global $rpId, $origin;
  $ch = $o['challenge'] ?? challenge('login', 0);
  $client = json_encode(['type' => 'webauthn.get', 'challenge' => $ch, 'origin' => $o['origin'] ?? $origin]);
  $auth = hash('sha256', $o['rp'] ?? $rpId, true) . chr($o['flags'] ?? 0x05) . pack('N', $o['count'] ?? 5);
  openssl_sign($auth . hash('sha256', $client, true), $sig, $o['signKey'] ?? $key, OPENSSL_ALGO_SHA256);
  if (!empty($o['tamper'])) { $sig[strlen($sig) - 1] = chr(ord($sig[strlen($sig) - 1]) ^ 1); }
  return json_encode(['id' => b64u($credId), 'clientDataJSON' => b64u($client), 'authenticatorData' => b64u($auth), 'signature' => b64u($sig)]);
}
function reg($body) { return wp_ja_nova_rest_passkey_register(new WP_REST_Request($body))->status; }
function log_in($body) { return wp_ja_nova_rest_passkey_login(new WP_REST_Request($body))->status; }
$out = [];
foreach (['es', 'rs'] as $kind) {
  fresh(); [$key, $cose] = new_key($kind); $cid = random_bytes(32);
  $out["$kind register"] = reg(register_body($key, $cose, $cid));
  $out["$kind stored"] = count(wp_ja_nova_passkeys_of(7));
  $out["$kind login"] = log_in(login_body($key, $cid)); $out["$kind cookie"] = $GLOBALS['cookie'];
}
// registration refusals
fresh(); [$key, $cose] = new_key('es'); $cid = random_bytes(32);
$out['register wrong origin'] = reg(register_body($key, $cose, $cid, ['origin' => 'https://evil.example']));
$out['register wrong type'] = reg(register_body($key, $cose, $cid, ['type' => 'webauthn.get']));
$out['register wrong rp'] = reg(register_body($key, $cose, $cid, ['rp' => 'evil.example']));
$out['register no user-present'] = reg(register_body($key, $cose, $cid, ['flags' => 0x44]));
$out['register login challenge'] = reg(register_body($key, $cose, $cid, ['challenge' => challenge('login', 7)]));
$out['register other user challenge'] = reg(register_body($key, $cose, $cid, ['challenge' => challenge('register', 99)]));
$out['register unknown challenge'] = reg(register_body($key, $cose, $cid, ['challenge' => b64u(random_bytes(32))]));
$out['register junk'] = reg('not json'); $out['register empty'] = reg('{}'); $out['register oversize'] = reg(json_encode(['x' => str_repeat('a', 30000)]));
$out['register nothing stored'] = count(wp_ja_nova_passkeys_of(7));
$ch = challenge('register', 7); $b = register_body($key, $cose, $cid, ['challenge' => $ch]);
$out['register ok'] = reg($b); $out['register replay'] = reg($b);
$out['register duplicate credential'] = reg(register_body($key, $cose, $cid));
// an expired challenge
$ch = challenge('register', 7); $k = WP_JA_NOVA_PASSKEY_PREFIX . 'c_' . hash('sha256', $ch); $GLOBALS['t'][$k]['expires'] = time() - 1;
[$key2, $cose2] = new_key('es');
$out['register expired'] = reg(register_body($key2, $cose2, random_bytes(32), ['challenge' => $ch]));
// sign-in refusals, on the credential registered above (counter 0 stored)
$out['login wrong origin'] = log_in(login_body($key, $cid, ['origin' => 'https://evil.example']));
$out['login wrong rp'] = log_in(login_body($key, $cid, ['rp' => 'evil.example']));
$out['login no user-present'] = log_in(login_body($key, $cid, ['flags' => 0x04]));
$out['login tampered'] = log_in(login_body($key, $cid, ['tamper' => 1]));
[$other] = new_key('es');
$out['login other key'] = log_in(login_body($key, $cid, ['signKey' => $other]));
$out['login unknown credential'] = log_in(login_body($key, random_bytes(32)));
$out['login register challenge'] = log_in(login_body($key, $cid, ['challenge' => challenge('register', 7)]));
$out['login unknown challenge'] = log_in(login_body($key, $cid, ['challenge' => b64u(random_bytes(32))]));
$GLOBALS['cookie'] = null;
$b = login_body($key, $cid, ['count' => 5]);
$out['login ok'] = log_in($b); $out['login ok cookie'] = $GLOBALS['cookie'];
$GLOBALS['cookie'] = null;
$out['login replay'] = log_in($b); $out['login replay cookie'] = $GLOBALS['cookie'];
$out['login counter rolled back'] = log_in(login_body($key, $cid, ['count' => 5]));
$out['login counter forward'] = log_in(login_body($key, $cid, ['count' => 6]));
$out['login junk'] = log_in('not json'); $out['login empty'] = log_in('{}');
$out['challenge single use'] = (function () use ($key, $cid) { $ch = challenge('login', 0); $a = log_in(login_body($key, $cid, ['challenge' => $ch, 'count' => 9])); $b = log_in(login_body($key, $cid, ['challenge' => $ch, 'count' => 10])); return [$a, $b]; })();
// the limits: ten passkeys and the challenge throttle
fresh(); for ($i = 0; $i < 10; $i++) { [$k, $c] = new_key('es'); wp_ja_nova_rest_passkey_register(new WP_REST_Request(register_body($k, $c, random_bytes(32)))); }
[$k, $c] = new_key('es'); $out['register eleventh'] = reg(register_body($k, $c, random_bytes(32))); $out['register-options eleventh'] = wp_ja_nova_rest_passkey_register_options()->status;
fresh(); $s = []; for ($i = 0; $i < 32; $i++) { $s[] = wp_ja_nova_rest_passkey_login_options()->status; } $out['throttle'] = [$s[0], $s[29], $s[30], $s[31]];
// encoders refuse what is not theirs
$out['b64u padded'] = wp_ja_nova_b64u_decode('QUI='); $out['b64u std alphabet'] = wp_ja_nova_b64u_decode('a+b/'); $out['b64u empty'] = wp_ja_nova_b64u_decode(''); $out['b64u ok'] = wp_ja_nova_b64u_decode('QUI'); $out['b64u non-string'] = wp_ja_nova_b64u_decode(['x']); $out['b64u noncanonical'] = wp_ja_nova_b64u_decode('QUJ');
foreach (['truncated' => "\xa1\x01", 'deep' => str_repeat("\x81", 12) . "\x00", 'indefinite' => "\x9f\x00\xff", 'huge array' => "\x99\xff\xff", 'huge bytes' => "\x5a\xff\xff\xff\xff", 'float' => "\xfb\x3f\xf0\x00\x00\x00\x00\x00\x00", 'tag' => "\xc1\x00", 'bad map key' => "\xa1\x80\x00"] as $label => $bytes) {
  try { $p = 0; wp_ja_nova_cbor_item($bytes, $p); $out["cbor $label"] = 'accepted'; } catch (UnexpectedValueException $e) { $out["cbor $label"] = 'refused'; }
}
echo json_encode($out);
`

function passkeyProbe(base) {
  const text = read(`${base}/wp-ja-nova/inc/extra.php`)
  const start = text.indexOf('/* ── Sign-in with a passkey (WebAuthn)')
  assert.ok(start > 0, `${base}: the passkey section`)
  const code = text.slice(start).replace(/^<\?php/, '')
  const run = php.run([
    {
      args: [
        '-r',
        '$GLOBALS["stdin"] = json_decode(stream_get_contents(STDIN), true); eval($GLOBALS["stdin"]["probe"]);'
      ],
      input: JSON.stringify({
        probe: PASSKEY_PROBE.replace(
          '$in = json_decode(stream_get_contents(STDIN), true);',
          '$in = $GLOBALS["stdin"];'
        ),
        stubs: WP_STUBS,
        code
      })
    }
  ])[0]
  assert.equal(run.status, 0, `${base}: php said ${run.stderr}${run.stdout.slice(0, 300)}`)
  return JSON.parse(run.stdout)
}

for (const base of BASES) {
  test(`${base}: passkeys verify the whole assertion — origin, relying party, challenge, signature, counter`, {
    skip: PHP_SKIP
  }, () => {
    const r = passkeyProbe(base)
    for (const kind of ['es', 'rs']) {
      assert.equal(r[`${kind} register`], 200, `${kind}: a registration is stored`)
      assert.equal(r[`${kind} stored`], 1)
      assert.equal(r[`${kind} login`], 200, `${kind}: a signature by the stored key signs in`)
      assert.equal(r[`${kind} cookie`], 7)
    }
    for (const k of [
      'register wrong origin',
      'register wrong type',
      'register wrong rp',
      'register no user-present',
      'register login challenge',
      'register other user challenge',
      'register unknown challenge',
      'register junk',
      'register empty',
      'register oversize',
      'register replay',
      'register expired'
    ])
      assert.equal(r[k], 400, k)
    assert.equal(r['register nothing stored'], 0, 'a refused registration stores nothing')
    assert.equal(r['register ok'], 200)
    assert.equal(r['register duplicate credential'], 409)
    for (const k of [
      'login wrong origin',
      'login wrong rp',
      'login no user-present',
      'login tampered',
      'login other key',
      'login unknown credential',
      'login register challenge',
      'login unknown challenge',
      'login replay',
      'login counter rolled back',
      'login junk',
      'login empty'
    ])
      assert.equal(r[k], 401, k)
    assert.equal(r['login ok'], 200)
    assert.equal(r['login ok cookie'], 7)
    assert.equal(r['login replay cookie'], null, 'a refused sign-in sets no cookie')
    assert.equal(r['login counter forward'], 200)
    assert.deepEqual(r['challenge single use'], [200, 401])
    assert.equal(r['register eleventh'], 409)
    assert.equal(r['register-options eleventh'], 409)
    assert.deepEqual(r.throttle, [200, 200, 429, 429])
  })

  test(`${base}: the base64url and CBOR readers refuse what is not theirs`, { skip: PHP_SKIP }, () => {
    const r = passkeyProbe(base)
    assert.equal(r['b64u padded'], null)
    assert.equal(r['b64u std alphabet'], null)
    assert.equal(r['b64u empty'], null)
    assert.equal(r['b64u non-string'], null)
    assert.equal(r['b64u noncanonical'], null)
    assert.equal(r['b64u ok'], 'AB')
    for (const k of [
      'truncated',
      'deep',
      'indefinite',
      'huge array',
      'huge bytes',
      'float',
      'tag',
      'bad map key'
    ])
      assert.equal(r[`cbor ${k}`], 'refused', k)
  })
}

const FORM_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
eval($in['stubs']);
eval($in['code']);
$GLOBALS['tpl'] = 'page-register'; $GLOBALS['logged'] = false;
$out = [];
// registration closed: a notice, never a form that posts to registration=disabled
$GLOBALS['opts'] = ['users_can_register' => 0];
$out['closed'] = wp_ja_nova_register_closed('<form id="registerform"></form>', []);
$GLOBALS['opts'] = ['users_can_register' => 1];
$out['open'] = wp_ja_nova_register_closed('<form id="registerform"></form>', []);
$GLOBALS['logged'] = true; $GLOBALS['opts'] = ['users_can_register' => 0];
$out['signed in'] = wp_ja_nova_register_closed('<a>Log out</a>', []);
$GLOBALS['logged'] = false;
$GLOBALS['tpl'] = 'page'; $out['other page'] = wp_ja_nova_register_closed('<p>x</p>', []);
// the sign-in form: required fields and the passkey button above Log in
$login = '<form id="loginform"><p class="login-username"><label for="user_login">Username</label><input type="text" name="log" id="user_login" autocomplete="username" class="input" value="" size="20" /></p><p class="login-password"><label for="user_pass">Password</label><input type="password" name="pwd" id="user_pass" class="input" value="" size="20" /></p><p class="login-remember"><label><input name="rememberme" type="checkbox" id="rememberme" value="forever" /> Remember me</label></p><p class="login-submit"><input type="submit" name="wp-submit" id="wp-submit" class="button button-primary" value="Log in" /></p></form>';
$out['login'] = wp_ja_nova_login_form($login, []);
$out['not login'] = wp_ja_nova_login_form('<form id="other"><input id="user_login"></form>', []);
$out['registered note'] = ''; $_GET['registered'] = '1'; $out['registered note'] = wp_ja_nova_registered_note($login, []);
$_GET['registered'] = '2'; $out['registered other'] = wp_ja_nova_registered_note($login, []);
echo json_encode($out);
`

test('the registration form says so when the site is closed; the sign-in form requires both fields and offers the passkey', {
  skip: PHP_SKIP
}, () => {
  for (const base of BASES) {
    const text = read(`${base}/wp-ja-nova/inc/extra.php`)
    const code = [
      'wp_ja_nova_register_closed',
      'wp_ja_nova_login_form',
      'wp_ja_nova_registered_note',
      'wp_ja_nova_registration_redirect'
    ]
      .map((fn) => text.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`))?.[0])
      .join('\n')
    assert.ok(!code.includes('undefined') && code.length > 200, `${base}: the functions`)
    const [run] = php.run([
      {
        args: [
          '-r',
          '$GLOBALS["stdin"] = json_decode(stream_get_contents(STDIN), true); eval($GLOBALS["stdin"]["probe"]);'
        ],
        input: JSON.stringify({
          probe: FORM_PROBE.replace(
            '$in = json_decode(stream_get_contents(STDIN), true);',
            '$in = $GLOBALS["stdin"];'
          ),
          stubs: WP_STUBS,
          code
        })
      }
    ])
    assert.equal(run.status, 0, `${base}: ${run.stderr}${run.stdout.slice(0, 300)}`)
    const r = JSON.parse(run.stdout)
    assert.match(r.closed, /jn-reg__closed/)
    assert.doesNotMatch(r.closed, /registerform/)
    assert.match(r.open, /registerform/)
    assert.match(r['signed in'], /Log out/)
    assert.equal(r['other page'], '<p>x</p>')
    assert.match(r.login, /id="user_login"[^>]* required aria-required="true"/)
    assert.match(r.login, /id="user_pass"[^>]* required aria-required="true"/)
    assert.ok(
      r.login.indexOf('data-jn-passkey="login"') > r.login.indexOf('login-remember'),
      'the passkey button follows Remember me'
    )
    assert.ok(
      r.login.indexOf('data-jn-passkey="login"') < r.login.indexOf('class="login-submit"'),
      '… and is above Log in'
    )
    assert.doesNotMatch(r['not login'], /required|passkey/)
    assert.match(r['registered note'], /jn-reg__done/)
    assert.doesNotMatch(r['registered other'], /jn-reg__done/)
  }
})

test('the search page carries its Advanced Search button and tips, and only on the theme search form', {
  skip: PHP_SKIP
}, () => {
  for (const base of BASES) {
    const text = read(`${base}/wp-ja-nova/inc/extra.php`)
    const code = text.match(/function wp_ja_nova_advanced_search\([\s\S]*?\n}\n/)?.[0]
    assert.ok(code, `${base}: the function`)
    const probe = String.raw`
$in = $GLOBALS['stdin'];
eval($in['stubs']); eval($in['code']);
$form = '<form role="search"><label>Search Terms:</label><div class="wp-block-search__inside-wrapper"><input type="search" name="s"><button type="submit">Search</button></div></form>';
$page = wp_ja_nova_advanced_search($form, ['attrs' => ['className' => 'jn-search']]);
echo json_encode(['page' => $page, 'twice' => wp_ja_nova_advanced_search($page, ['attrs' => ['className' => 'jn-search']]) === $page, 'band' => wp_ja_nova_advanced_search($form, ['attrs' => ['className' => 'jn-search-band__form']]) === $form, 'none' => wp_ja_nova_advanced_search($form, ['attrs' => []]) === $form]);`
    const [run] = php.run([
      {
        args: [
          '-r',
          '$GLOBALS["stdin"] = json_decode(stream_get_contents(STDIN), true); eval($GLOBALS["stdin"]["probe"]);'
        ],
        input: JSON.stringify({ probe, stubs: WP_STUBS, code })
      }
    ])
    assert.equal(run.status, 0, `${base}: ${run.stderr}${run.stdout.slice(0, 300)}`)
    const r = JSON.parse(run.stdout)
    assert.match(
      r.page,
      /<button type="button" class="jn-search__advanced" aria-expanded="true" aria-controls="advancedSearch">/
    )
    assert.match(r.page, /<fieldset id="advancedSearch" class="jn-search__panel">/)
    assert.ok(
      r.page.indexOf('jn-search__advanced') < r.page.indexOf('</form>') &&
        r.page.indexOf('advancedSearch') < r.page.indexOf('</form>'),
      'both inside the form'
    )
    assert.ok(
      r.page.indexOf('</button><button type="button" class="jn-search__advanced"') > 0,
      'the button follows Search inside the wrapper'
    )
    assert.equal(r.twice, true, 'not added twice')
    assert.equal(r.band, true, "the home page's search band is left alone")
    assert.equal(r.none, true)
  }
})

test('the registration option is data, never forced by the theme', () => {
  for (const base of BASES) {
    const text = read(`${base}/wp-ja-nova/inc/extra.php`)
    assert.doesNotMatch(text, /update_option\(\s*'users_can_register'/)
    assert.doesNotMatch(text, /add_filter\(\s*'pre_option_users_can_register'/)
    assert.doesNotMatch(text, /add_filter\(\s*'option_users_can_register'/)
  }
})

// ── the browser check script refuses what it cannot run ──────────────────────────────────────────────
test('measure115.mjs refuses bad arguments before it starts a browser', { skip: noDossier }, async () => {
  const { parseArgs } = await import(path.join(TASK, 'tools/measure115.mjs'))
  const ok = [
    '--site',
    'http://localhost:8461',
    '--out',
    '/tmp/x',
    '--source',
    'https://example.test',
    '--wp',
    'wp'
  ]
  assert.equal(parseArgs(ok).site, 'http://localhost:8461')
  assert.throws(() => parseArgs([...ok, '--nope', '1']), /unknown argument/)
  assert.throws(
    () => parseArgs(['--site', 'http://localhost:8461']),
    /--out is required|--source is required/
  )
  assert.throws(() => parseArgs(['--site', 'ftp://x', '--out', '/tmp/x']), /must be http\(s\)/)
  assert.throws(() => parseArgs(['--site', 'not a url', '--out', '/tmp/x']), /not a URL/)
  assert.throws(() => parseArgs([...ok, '--only', 'bogus']), /unknown check/)
  assert.throws(() => parseArgs([...ok, '--deadline-ms', '0']), /positive integer/)
  assert.throws(() => parseArgs([...ok, '--mode', 'later']), /before or after/)
  assert.throws(() => parseArgs([...ok, '--zip', '/tmp/a.zip']), /go together/)
  assert.throws(
    () => parseArgs([...ok, '--zip', '/tmp/a.zip', '--record', '/tmp/r.json', '--only', 'theme']),
    /whole run/
  )
  assert.throws(
    () => parseArgs(['--site', 'http://localhost:8461', '--out', '/tmp/x', '--only', 'registration']),
    /--wp is required/
  )
  assert.throws(
    () => parseArgs(['--site', 'http://localhost:8461', '--out', '/tmp/x', '--only', 'logos']),
    /--source is required/
  )
  assert.throws(() => parseArgs(['--site']), /needs a value/)
})
