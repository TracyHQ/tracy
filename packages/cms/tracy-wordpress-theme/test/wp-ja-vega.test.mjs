/**
 * wp-ja-vega 1.1.6 — the 03/10 audit's defects, held as behaviour where a script or PHP function can run here and as source facts
 * where only a browser sees the result (the browser measurements are tasks/ja-vega-wp7/tools/measure116.mjs and its release record).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'
import { taskDossier } from './task-dossier.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(path.join(PKG, rel), 'utf8')
const { dir: TASK, skip: noDossier } = taskDossier('ja-vega-wp7')
const readTask = (rel) => readFileSync(path.join(TASK, rel), 'utf8')
const BASES = ['overlays', 'src']

// ── the theme switch flips what the page shows ─────────────────────────────────────────────────────
function runSwitch(file, { osDark = false, cookie = '', search = '', clicks = 0, blocked = false }) {
  const attrs = new Map()
  const listeners = {}
  const buttons = [new Map(), new Map()]
  const document = {
    readyState: 'complete',
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      removeAttribute: (k) => attrs.delete(k)
    },
    querySelectorAll: () => buttons.map((b) => ({ setAttribute: (k, v) => b.set(k, v) })),
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn)
  }
  let jar = cookie
  Object.defineProperty(document, 'cookie', {
    get() {
      if (blocked) throw new Error('blocked')
      return jar
    },
    set(v) {
      if (blocked) throw new Error('blocked')
      jar = v
    }
  })
  const mq = { matches: osDark, listeners: [], addEventListener: (_t, fn) => mq.listeners.push(fn) }
  const window = { matchMedia: () => mq }
  new Function('document', 'window', 'location', read(file))(document, window, { search, protocol: 'https:' })
  const seen = []
  for (let i = 0; i < clicks; i += 1) {
    const button = { closest: () => button }
    for (const fn of listeners.click ?? []) fn({ target: button, preventDefault: () => {} })
    seen.push(attrs.get('data-theme') ?? 'auto')
  }
  return { seen, cookie: blocked ? '' : jar, attrs, buttons, mq }
}

for (const base of BASES) {
  const file = `${base}/wp-ja-vega/assets/js/wp-ja-vega-dark.js`
  test(`${file}: every click flips light and dark, so the first click always changes the page`, () => {
    assert.deepEqual(runSwitch(file, { osDark: false, clicks: 3 }).seen, ['dark', 'light', 'dark'])
    assert.deepEqual(runSwitch(file, { osDark: true, clicks: 3 }).seen, ['light', 'dark', 'light'])
    // the old three-state cookie that says auto, and a cookie that says nothing valid, are flipped like no cookie
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=auto', osDark: true, clicks: 1 }).seen, ['light'])
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=purple', osDark: false, clicks: 2 }).seen, [
      'dark',
      'light'
    ])
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=dark', osDark: false, clicks: 2 }).seen, [
      'light',
      'dark'
    ])
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=light', osDark: true, clicks: 2 }).seen, [
      'dark',
      'light'
    ])
  })

  test(`${file}: a click saves the flipped choice, a plain load saves nothing, ?theme= is flipped like any state`, () => {
    assert.match(runSwitch(file, { clicks: 1 }).cookie, /tracy_theme=dark/)
    assert.equal(runSwitch(file, { search: '?theme=dark' }).cookie, '')
    const queried = runSwitch(file, { search: '?theme=dark', clicks: 1 })
    assert.deepEqual(queried.seen, ['light'])
    assert.match(queried.cookie, /tracy_theme=light/)
    assert.equal(
      runSwitch(file, { search: '?theme=purple&theme=dark', osDark: true }).attrs.get('data-theme'),
      undefined
    )
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
    dark.mq.matches = false
    for (const fn of dark.mq.listeners) fn()
    assert.equal(dark.buttons[0].get('data-theme-state'), 'light')
  })

  test(`${file}: with cookies blocked the click still flips the page and nothing throws`, () => {
    assert.deepEqual(runSwitch(file, { blocked: true, osDark: false, clicks: 2 }).seen, ['dark', 'light'])
  })
}

// ── touch: the first tap on a parent's label opens its panel, the second follows the link ──────────
class FakeElement {
  constructor(name) {
    this.name = name
    this.listeners = {}
    this.attrs = new Map()
    this.classes = new Set()
    this.classList = {
      contains: (c) => this.classes.has(c),
      toggle: (c, on) => {
        if (on === undefined ? !this.classes.has(c) : on) this.classes.add(c)
        else this.classes.delete(c)
      }
    }
    this.style = { removeProperty() {}, setProperty() {} }
    this.textContent = name
    this.children = []
  }
  addEventListener(type, fn) {
    ;(this.listeners[type] ??= []).push(fn)
  }
  setAttribute(k, v) {
    this.attrs.set(k, v)
  }
  getAttribute(k) {
    return this.attrs.get(k) ?? null
  }
  append() {}
  prepend(child) {
    this.children.unshift(child)
  }
  focus() {}
  getBoundingClientRect() {
    return { right: 100 }
  }
  matches() {
    return false
  }
}

function runMega(file, { desktop = true, hover = false } = {}) {
  const mega = new FakeElement('mega')
  const link = new FakeElement('link')
  const trigger = new FakeElement('trigger')
  const panel = new FakeElement('panel')
  mega.querySelector = (q) =>
    ({
      ':scope > .jv-mega__trigger': trigger,
      ':scope > .jv-mega__link': link,
      ':scope > .jv-mega__panel': panel
    })[q] ?? null
  const docListeners = {}
  const document = {
    documentElement: { clientWidth: 1024, classList: { contains: () => false, toggle() {} } },
    querySelectorAll: (q) => (q === '[data-jv-mega]' ? [mega] : []),
    querySelector: () => null,
    getElementById: () => null,
    createElement: (n) => new FakeElement(n),
    createTextNode: (t) => ({ t }),
    addEventListener: (type, fn) => (docListeners[type] ??= []).push(fn),
    activeElement: null
  }
  const window = {
    wpJaVega: {},
    matchMedia: (q) => ({
      matches: /min-width: 992px/.test(q) ? desktop : /hover: hover/.test(q) ? hover : false,
      addEventListener() {}
    }),
    addEventListener() {}
  }
  new Function('window', 'document', 'Element', 'HTMLDialogElement', read(file))(
    window,
    document,
    FakeElement,
    function () {}
  )
  const click = (pointerType) => {
    const event = {
      type: 'click',
      pointerType,
      defaultPrevented: false,
      target: link,
      preventDefault() {
        this.defaultPrevented = true
      }
    }
    for (const fn of link.listeners.click ?? []) fn(event)
    return event
  }
  const focusIn = (target, focusVisible) => {
    target.matches = (q) => q === ':focus-visible' && focusVisible
    for (const fn of mega.listeners.focusin ?? []) fn({ target })
  }
  return { mega, link, trigger, click, focusIn, open: () => mega.classes.has('is-open') }
}

for (const base of BASES) {
  const file = `${base}/wp-ja-vega/assets/js/wp-ja-vega.js`
  test(`${file}: on touch the first tap on a parent's label opens its panel and does not follow the link; the second does`, () => {
    const page = runMega(file)
    const first = page.click('touch')
    assert.equal(first.defaultPrevented, true)
    assert.equal(page.open(), true)
    assert.equal(page.trigger.getAttribute('aria-expanded'), 'true')
    const second = page.click('touch')
    assert.equal(second.defaultPrevented, false, 'the second tap goes to the link')
    assert.equal(page.open(), true)
  })

  test(`${file}: a tap that arrives after focus reached the label still counts as the first`, () => {
    const page = runMega(file)
    page.focusIn(page.link, false) // pointer focus: not a keyboard focus, so it opens nothing
    assert.equal(page.open(), false)
    assert.equal(page.click('touch').defaultPrevented, true)
    assert.equal(page.open(), true)
  })

  test(`${file}: a mouse click, a key press, a pen-less desktop and the phone drawer keep the link`, () => {
    assert.equal(runMega(file).click('mouse').defaultPrevented, false)
    assert.equal(runMega(file).click('').defaultPrevented, false, 'Enter on the link has no pointer type')
    assert.equal(
      runMega(file, { desktop: false }).click('touch').defaultPrevented,
      false,
      'below 992 the drawer is used'
    )
    const closed = runMega(file, { hover: true })
    assert.equal(
      closed.click(undefined).defaultPrevented,
      false,
      'a hover-capable device with no pointer type keeps the link'
    )
  })

  test(`${file}: keyboard focus on the caret still opens the panel`, () => {
    const page = runMega(file)
    page.focusIn(page.trigger, true)
    assert.equal(page.open(), true)
    const other = runMega(file)
    other.focusIn(other.trigger, false)
    assert.equal(other.open(), false)
  })
}

// ── source facts ───────────────────────────────────────────────────────────────────────────────────
test('the caret and every header control is at least 24 px wide', () => {
  for (const base of BASES) {
    const css = read(`${base}/wp-ja-vega/assets/css/wp-ja-vega.css`)
    assert.match(css, /\.jv-header \.jv-mega__trigger \{[^}]*width: 24px/)
    assert.doesNotMatch(css, /\.jv-header \.jv-mega__trigger \{[^}]*width: 22px/)
  }
})

test('the project template is a post template, drawn by the wave filter and named by the body class', () => {
  const overlay = JSON.parse(read('overlays/wp-ja-vega/theme.overlay.json'))
  const entry = overlay.customTemplates.find((t) => t.name === 'post-project')
  assert.ok(entry, 'theme.overlay.json names post-project')
  assert.deepEqual(entry.postTypes, ['post'])
  for (const base of BASES) {
    const tpl = read(`${base}/wp-ja-vega/templates/post-project.html`)
    assert.match(tpl, /wp:post-content/)
    assert.match(tpl, /wp-ja-vega\/head-more-projects/)
    assert.match(read(`${base}/wp-ja-vega/patterns/head-more-projects.php`), /More our projects/)
    assert.match(
      tpl,
      /"wpJaVegaCategory":"database-security"/,
      "the source's module lists Database Security by title, whatever the project"
    )
    const php = read(`${base}/wp-ja-vega/inc/extra.php`)
    assert.match(php, /'post-project' === get_page_template_slug/)
    assert.match(php, /jv-project-page/)
  }
})

test('every portfolio post of the spec is a project page whose numbers come from its article', {
  skip: noDossier
}, async () => {
  const { TEMPLATE, projectOf, projectContent, bodyOf } = await import(
    '../../../../tasks/ja-vega-wp7/tools/build-projects.mjs'
  )
  const content = JSON.parse(readTask('spec/content.json'))
  const portfolio = content.posts.filter((p) => p.meta?._wp_page_template === TEMPLATE)
  assert.ok(portfolio.length >= 47, `only ${portfolio.length} project posts`)
  for (const post of portfolio) {
    assert.match(post.content, /jv-project__masthead/, post.slug)
    assert.equal(
      (post.content.match(/<div class="wp-block-group jv-project__stat">/g) ?? []).length,
      3,
      `${post.slug}: three stat tiles`
    )
    assert.equal(
      (
        post.content.match(
          /class="wp-block-image size-full"><img src="\/wp-content\/uploads\/pic-\d\.jpg"/g
        ) ?? []
      ).length,
      4,
      `${post.slug}: four gallery pictures`
    )
    assert.match(post.content, /Book a demo/)
    assert.ok(
      post.meta.jv_client && post.meta.jv_date && post.meta.jv_type,
      `${post.slug}: client, date and type meta`
    )
    assert.ok(
      post.images.some((i) => i.file === 'Client.png'),
      `${post.slug}: the client logo is a media record`
    )
    assert.doesNotMatch(post.content, /joomlart\.com|Joomla/i, post.slug)
  }
  // The generator reads what the source's layout reads and refuses what it would have to invent.
  const article = {
    id: 1,
    attribs: JSON.stringify({
      rating: '80',
      'portfolio-task': { 'portfolio-task0': { task_title: '+ 1%', task_label: 'A' } }
    })
  }
  assert.equal(projectOf(article).rating, 80)
  assert.throws(
    () =>
      projectOf({
        id: 2,
        attribs: JSON.stringify({
          rating: '150',
          'portfolio-task': { a: { task_title: 'x', task_label: 'y' } }
        })
      }),
    /rating/
  )
  assert.throws(() => projectOf({ id: 3, attribs: JSON.stringify({ rating: '80' }) }), /portfolio-task/)
  const page = projectContent(
    projectOf(article),
    'item--1.jpg',
    '<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->'
  )
  assert.match(page, /jv-project__rating--80/)
  assert.equal(
    bodyOf('<!-- wp:paragraph -->\n<p>a</p>\n<!-- /wp:paragraph -->'),
    '<!-- wp:paragraph -->\n<p>a</p>\n<!-- /wp:paragraph -->'
  )
})

test('no page text of the spec names the source CMS, and the dead exemptions are gone', {
  skip: noDossier
}, async () => {
  const { wordingHits } = await import('../../../../tasks/ja-vega-wp7/tools/measure116.mjs')
  const content = JSON.parse(readTask('spec/content.json'))
  for (const item of [...content.pages, ...content.posts]) {
    // the spec's own bookkeeping (notes, provenance) may name the source; what a visitor can read may not
    // the picture paths of the spec ("/images/joomlart/…") are rewritten to media-library addresses by the seeder
    assert.deepEqual(
      wordingHits((item.content ?? '').replaceAll('/images/joomlart/', '/images/')),
      [],
      item.slug
    )
  }
  const footer = read('overlays/wp-ja-vega/parts/footer.html')
  assert.deepEqual(wordingHits(footer), [])
  const accepted = JSON.parse(readTask('parity-accepted.json')).accept
  assert.equal(
    accepted.some((a) => /Biometrics/.test(a.match)),
    false,
    'the Biometrics exemption cited an open gap that D-42 closed'
  )
  assert.equal(
    accepted.some((a) => a.match === '^JA Vega$'),
    false,
    'the tagged-items masthead matches the source since D-43'
  )
  const authors = content.authors.find((a) => a.id === 'joomla-user-42')
  assert.equal(authors.name, 'Admin', 'the source names user 42 Admin')
  assert.equal(JSON.stringify(content.pages).includes('"Dev"'), false)
})

test('the footer part carries the newsletter and the form is a real handler, not a drawn button', () => {
  for (const base of BASES) {
    const footer = read(`${base}/wp-ja-vega/parts/footer.html`)
    assert.match(footer, /\[wp_ja_vega_newsletter\]/)
    assert.match(footer, /Join 150K\+ Designers For Weekly Creative Insights/)
    const php = read(`${base}/wp-ja-vega/inc/extra.php`)
    assert.match(php, /add_action\( 'admin_post_nopriv_wp_ja_vega_newsletter'/)
    assert.match(php, /wp_verify_nonce/)
    assert.match(php, /wp_mail\(/)
  }
})

// ── the newsletter handler, as real PHP ────────────────────────────────────────────────────────────
const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({})
})
after(() => php?.stop())

const NEWSLETTER_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
class Redirected extends Exception {}
$GLOBALS['mails'] = []; $GLOBALS['transients'] = $in['transients'] ?? []; $GLOBALS['mail_ok'] = $in['mail_ok'];
$GLOBALS['options'] = $in['options'] ?? ['tracy_contact_to' => 'owner@s.test'];
function wp_verify_nonce($n, $a) { return $n === 'good'; }
function sanitize_text_field($v) { return trim((string) $v); }
function sanitize_email($v) { return preg_replace('/[^a-zA-Z0-9@._+-]/', '', (string) $v); }
function sanitize_key($v) { return preg_replace('/[^a-z0-9_-]/', '', strtolower((string) $v)); }
function wp_unslash($v) { return $v; }
function is_email($v) { return (bool) filter_var($v, FILTER_VALIDATE_EMAIL); }
function get_transient($k) { return $GLOBALS['transients'][$k] ?? false; }
function set_transient($k, $v, $t) { $GLOBALS['transients'][$k] = $v; return true; }
function delete_transient($k) { unset($GLOBALS['transients'][$k]); return true; }
function wp_get_referer() { return 'http://s.test/about/?jv_newsletter=old'; }
function home_url($p = '') { return 'http://s.test' . $p; }
function remove_query_arg($k, $u) { return preg_replace('/[?&]' . $k . '=[^&#]*/', '', $u); }
function add_query_arg($k, $v, $u) { return $u . (str_contains($u, '?') ? '&' : '?') . $k . '=' . $v; }
function wp_safe_redirect($u) { throw new Redirected($u); }
function get_option($k) { return array_merge(['admin_email' => 'tracy@admin.test', 'blogname' => 'Site &amp; Co'], $GLOBALS['options'])[$k] ?? false; }
function apply_filters($h, $v) { return $v; }
function wp_specialchars_decode($s) { return html_entity_decode($s); }
function __($s) { return $s; }
function esc_html__($s) { return $s; }
function esc_html_e($s) { echo $s; }
function esc_attr_e($s) { echo $s; }
function esc_attr($s) { return $s; }
function esc_html($s) { return htmlspecialchars($s); }
function esc_url($s) { return $s; }
function admin_url($p) { return 'http://s.test/wp-admin/' . $p; }
function wp_unique_id($p) { return $p . '1'; }
function wp_nonce_field($a, $n) { echo '<input type="hidden" name="' . $n . '" value="good">'; }
function wp_mail($to, $subject, $body, $headers = []) { $GLOBALS['mails'][] = [$to, $subject, $body, $headers]; return $GLOBALS['mail_ok']; }
const HOUR_IN_SECONDS = 3600;
eval($in['code']);
$out = [];
foreach ($in['cases'] as $c) {
  $GLOBALS['mails'] = []; $_POST = $c['post'] ?? []; $_GET = $c['get'] ?? []; $GLOBALS['mail_ok'] = $c['mail_ok'] ?? true;
  if (isset($c['shortcode'])) { $out[] = ['html' => wp_ja_vega_newsletter_shortcode()]; continue; }
  $to = null;
  try { wp_ja_vega_newsletter_submit(); } catch (Redirected $r) { $to = $r->getMessage(); }
  $out[] = ['to' => $to, 'mails' => $GLOBALS['mails'], 'transients' => array_keys($GLOBALS['transients'])];
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
`

test('the newsletter form and handler: validate, refuse bots, send once, and say "sent" only when the mail left', {
  skip: PHP_SKIP
}, () => {
  for (const base of BASES) {
    const text = read(`${base}/wp-ja-vega/inc/extra.php`)
    const code = ['wp_ja_vega_contact_to', 'wp_ja_vega_newsletter_shortcode', 'wp_ja_vega_newsletter_submit']
      .map((fn) => text.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`))?.[0])
      .join('\n')
    assert.ok(!code.includes('undefined'), `${base}: handler functions found`)
    const good = { _jv_nonce: 'good', jv_email: 'Reader@Example.com', jv_website: '' }
    const cases = [
      { post: good },
      { post: { ...good, jv_email: '' } },
      { post: { ...good, jv_email: 'not-an-email' } },
      { post: { ...good, jv_email: 'a@b.co\nBcc: x@y.z' } },
      { post: { ...good, _jv_nonce: 'stale' } },
      { post: { ...good, jv_website: 'http://spam' } },
      { post: { ...good, jv_email: 'down@example.com' }, mail_ok: false },
      { shortcode: true },
      { shortcode: true, get: { jv_newsletter: 'failed' } },
      { shortcode: true, get: { jv_newsletter: '<script>' } }
    ]
    const [first, empty, bad, inject, stale, bot, down, form, failedForm, hostile] = JSON.parse(
      php.run([{ args: ['-r', NEWSLETTER_PROBE], input: JSON.stringify({ code, cases, mail_ok: true }) }])[0]
        .stdout
    )
    assert.match(first.to, /jv_newsletter=sent#jv-newsletter$/)
    assert.equal(first.mails.length, 1)
    assert.equal(first.mails[0][0], 'owner@s.test')
    assert.equal(first.mails[0][1], '[Site & Co] Newsletter subscription request')
    assert.deepEqual(first.mails[0][3], ['Reply-To: Reader@Example.com'])
    assert.ok(!first.to.includes('old'), 'the previous result is not carried')
    for (const c of [empty, bad]) {
      assert.match(c.to, /jv_newsletter=invalid#/)
      assert.equal(c.mails.length, 0)
    }
    // a newline cannot reach a header: sanitize_email drops it, the rest is judged as an address
    assert.equal(
      inject.mails.every((m) => !/\n/.test(m[3].join('')) && !/\n/.test(m[1])),
      true
    )
    assert.match(stale.to, /jv_newsletter=failed#/)
    assert.equal(stale.mails.length, 0)
    assert.match(bot.to, /jv_newsletter=sent#/)
    assert.equal(bot.mails.length, 0, 'a bot gets no mail sent on its behalf')
    assert.match(down.to, /jv_newsletter=failed#/, 'mail down: the page says so')
    assert.equal(
      down.transients.includes(`jv_nl_${createHash('md5').update('down@example.com').digest('hex')}`),
      false,
      'a request that did not leave is not remembered as sent'
    )
    // the same address twice within the hour is one message
    const twice = JSON.parse(
      php.run([
        {
          args: ['-r', NEWSLETTER_PROBE],
          input: JSON.stringify({
            code,
            cases: [{ post: good }],
            transients: { ['jv_nl_' + '0'.repeat(32)]: 1 },
            mail_ok: true
          })
        }
      ])[0].stdout
    )
    assert.equal(twice[0].mails.length, 1)
    // The admin address is Tracy's mailbox on a site Tracy built: with no tracy_contact_to, nothing is sent there.
    for (const options of [{}, { tracy_contact_to: '' }, { tracy_contact_to: 'not-an-address' }]) {
      const [none] = JSON.parse(
        php.run([
          {
            args: ['-r', NEWSLETTER_PROBE],
            input: JSON.stringify({ code, cases: [{ post: good }], options, mail_ok: true })
          }
        ])[0].stdout
      )
      assert.match(none.to, /jv_newsletter=failed#/, `${base}: ${JSON.stringify(options)} says failed`)
      assert.equal(none.mails.length, 0, `${base}: ${JSON.stringify(options)} mails nobody`)
      assert.deepEqual(none.transients, [], `${base}: ${JSON.stringify(options)} remembers nothing`)
    }
    assert.doesNotMatch(form.html, /\n/, 'one line: wpautop would put a <br> inside the form')
    assert.match(form.html, /name="jv_email"[^>]*required/)
    assert.match(form.html, /name="action" value="wp_ja_vega_newsletter"/)
    assert.match(form.html, /name="_jv_nonce"/)
    assert.match(
      failedForm.html,
      /jv-newsletter__status--failed" role="status">Your request could not be sent/
    )
    assert.match(
      hostile.html,
      /jv-newsletter__status" role="status"><\/p>/,
      'an unknown result word prints nothing'
    )
  }
})

test('the toggle label list has two states only', () => {
  for (const base of BASES) {
    const js = read(`${base}/wp-ja-vega/assets/js/wp-ja-vega-dark.js`)
    assert.doesNotMatch(js, /STATES\s*=/)
    assert.match(js, /Switch to light/)
    assert.match(js, /Switch to dark/)
  }
})

// ── a project page lights Portfolio and its category's link in the menu ────────────────────────────
const CURRENT_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['ctx'] = $in['ctx'];
function is_singular($t) { return $GLOBALS['ctx']['singular'] === $t; }
function get_page_template_slug($id) { return $GLOBALS['ctx']['template']; }
function get_queried_object_id() { return 7; }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function untrailingslashit($s) { return rtrim($s, '/'); }
function get_the_category($id) { return array_map(fn($s) => (object) ['slug' => $s], $GLOBALS['ctx']['cats']); }
function add_filter() {}
eval($in['code']);
$out = [];
foreach ($in['cases'] as $c) {
  $out[] = $c[0] === 'is' ? wp_ja_vega_is_project_of($c[1]) : wp_ja_vega_project_current_link($c[1], ['attrs' => ['url' => $c[2]]]);
}
echo json_encode($out);
`

test('a project page marks Portfolio and its category link current, and nothing else', {
  skip: PHP_SKIP
}, () => {
  for (const base of BASES) {
    const text = read(`${base}/wp-ja-vega/inc/extra.php`)
    const code = ['wp_ja_vega_is_project_of', 'wp_ja_vega_project_current_link']
      .map((fn) => text.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`))?.[0])
      .join('\n')
    assert.ok(!code.includes('undefined'), base)
    const li =
      '<li class="wp-block-navigation-item wp-block-navigation-link"><a class="wp-block-navigation-item__content" href="x">Database Security</a></li>'
    const cases = [
      ['is', 'https://s.test/portfolio/'],
      ['is', 'https://s.test/portfolio/database-security'],
      ['is', 'https://s.test/portfolio/it-consultancy'],
      ['is', 'https://s.test/services'],
      ['link', li, 'https://s.test/portfolio/database-security'],
      ['link', li, 'https://s.test/portfolio/it-consultancy'],
      ['link', li, 'https://s.test/portfolio']
    ]
    const run = (ctx) =>
      JSON.parse(
        php.run([{ args: ['-r', CURRENT_PROBE], input: JSON.stringify({ code, cases, ctx }) }])[0].stdout
      )
    const on = run({ singular: 'post', template: 'post-project', cats: ['database-security'] })
    assert.deepEqual(on.slice(0, 4), [true, true, false, false])
    assert.match(
      on[4],
      /^<li class="wp-block-navigation-item wp-block-navigation-link current-menu-item"><a class="wp-block-navigation-item__content" aria-current="page"/
    )
    assert.equal(on[5], li)
    assert.equal(on[6], li, 'the section link itself is lit by the mega block, not marked here')
    for (const [ctx, section] of [
      [{ singular: 'post', template: '', cats: ['database-security'] }, false],
      [{ singular: 'page', template: 'post-project', cats: [] }, false],
      [{ singular: 'post', template: 'post-project', cats: [] }, true]
    ]) {
      const off = run(ctx)
      assert.equal(off[0], section, JSON.stringify(ctx))
      assert.equal(off[1], false)
      assert.equal(off[4], li)
    }
  }
})

// 1.1.12 (T28): a site without a logo shows its name in the black bar, and the copyright names the site.
// 1.1.16: both spots sit on the black bar in both modes, so they are dark-background spots (the dark logo, or the name).
for (const base of ['overlays', 'src']) {
  test(`${base}: both header Site Logo blocks fall back to the name; the copyright names the site`, () => {
    const header = readFileSync(path.join(PKG, base, 'wp-ja-vega/parts/header.html'), 'utf8')
    const footer = readFileSync(path.join(PKG, base, 'wp-ja-vega/parts/footer.html'), 'utf8')
    for (const cls of ['jv-header__logo', 'jv-drawer__logo'])
      assert.match(header, new RegExp(`<!-- wp:site-logo \\{[^}]*"className":"${cls} ${cls}--dark"\\} /-->`))
    assert.match(footer, /Copyright © \{year\} \{site\.title\}\. All Rights Reserved\./)
    assert.doesNotMatch(footer, /JA Vega/)
  })
}
