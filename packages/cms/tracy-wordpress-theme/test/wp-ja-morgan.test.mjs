/**
 * wp-ja-morgan 1.1.5 — the 03/10/2026 audited defects, held as behaviour where a script or PHP function can run here and as
 * source facts where only a browser sees the result (the browser measurements live with the release record,
 * tasks/ja-morgan-wp7/release/ and tasks/ja-morgan-wp7/tools/measure115.mjs).
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
const { dir: TASK, skip: noDossier } = taskDossier('ja-morgan-wp7')
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
  const file = `${base}/wp-ja-morgan/assets/js/wp-ja-morgan-dark.js`
  test(`${file}: every click flips light and dark, so the first click always changes the page`, () => {
    assert.deepEqual(runSwitch(file, { osDark: false, clicks: 4 }).seen, ['dark', 'light', 'dark', 'light'])
    assert.deepEqual(runSwitch(file, { osDark: true, clicks: 4 }).seen, ['light', 'dark', 'light', 'dark'])
    // an old three-state cookie that says auto is still read, and is flipped like no cookie
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=auto', osDark: true, clicks: 1 }).seen, ['light'])
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=auto', osDark: false, clicks: 1 }).seen, ['dark'])
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
    // the first value decides; an invalid or empty first value asks for nothing
    assert.equal(runSwitch(file, { search: '?theme=dark&theme=light' }).attrs.get('data-theme'), 'dark')
    assert.equal(runSwitch(file, { search: '?theme=purple&theme=dark' }).attrs.get('data-theme'), undefined)
    assert.equal(runSwitch(file, { search: '?theme=&theme=dark' }).attrs.get('data-theme'), undefined)
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

// ── navigation, drawer, footers and the other style facts ──────────────────────────────────────────
for (const base of BASES) {
  test(`${base}: the lit navigation states are restated at the weight of the colour rule they must beat`, () => {
    const css = read(`${base}/wp-ja-morgan/assets/css/wp-ja-morgan.css`)
    assert.match(
      css,
      /\.t3-mainnav \.wp-block-navigation__container > \.current-menu-item > \.wp-block-navigation-item__content,/
    )
    assert.match(
      css,
      /\.t3-mainnav \.wp-block-navigation__container > \.wp-block-navigation-item > \.wp-block-navigation-item__content:hover,/
    )
  })

  test(`${base}: the open drawer beats core's overlay colours and the caret is a 24 px control above the link`, () => {
    const css = read(`${base}/wp-ja-morgan/assets/css/wp-ja-morgan.css`)
    assert.match(
      css,
      /\.t3-header \.t3-mainnav\.wp-block-navigation \.wp-block-navigation__responsive-container\.is-menu-open:not\(\.disable-default-overlay\) \{/
    )
    assert.match(
      css,
      /> \.wp-block-navigation-submenu__toggle \{\s*position: absolute;\s*right: 15px;\s*top: 50%;[^}]*z-index: 2;[^}]*width: 24px;\s*height: 24px;/
    )
    assert.match(css, /\.jm-touch-open > \.wp-block-navigation__submenu-container \{/)
  })

  test(`${base}: Home Style 3 and 4 have their own footers and the social glyphs are white`, () => {
    const dir = `${base}/wp-ja-morgan`
    // The parts draw their pattern, whose words go through the theme's text domain (LANG-2).
    assert.match(read(`${dir}/parts/footer-hs3.html`), /"slug":"wp-ja-morgan\/part-footer-hs3"/)
    assert.match(read(`${dir}/parts/footer-hs4.html`), /"slug":"wp-ja-morgan\/part-footer-hs4"/)
    const hs3 = read(`${dir}/patterns/part-footer-hs3.php`)
    const hs4 = read(`${dir}/patterns/part-footer-hs4.php`)
    const word = (/** @type {string} */ title) =>
      new RegExp(`esc_html_e\\( '${title.replace('.', '\\.')}', 'wp-ja-morgan' \\)`)
    for (const title of ['Info.', 'Office.', 'Social.']) assert.match(hs3, word(title))
    for (const title of ['Office.', 'Start a Conversation.', 'Copyright.']) assert.match(hs4, word(title))
    assert.doesNotMatch(hs4, /Morgan Office/)
    assert.doesNotMatch(hs3 + hs4, />Navigate\.</)
    const php = read(`${dir}/inc/extra.php`)
    assert.match(php, /'footer-hs3'/)
    assert.match(php, /'footer-hs4'/)
    assert.match(php, /add_filter\(\s*'render_block_data'/)
    const css = read(`${dir}/assets/css/wp-ja-morgan.css`)
    assert.match(
      css,
      /\.social-follow\.wp-block-social-links\.is-style-logos-only \.wp-social-link svg \{\s*fill: #ffffff;/
    )
  })

  test(`${base}: the back-to-top control is 60 px, 992 px and up, and the page carries it`, () => {
    const css = read(`${base}/wp-ja-morgan/assets/css/wp-ja-morgan.css`)
    assert.match(css, /@media \(min-width: 992px\) \{\s*\.back-to-top \{[^}]*width: 60px;\s*height: 60px;/)
    assert.match(read(`${base}/wp-ja-morgan/inc/extra.php`), /class="back-to-top"/)
    assert.match(read(`${base}/wp-ja-morgan/assets/js/wp-ja-morgan.js`), /window\.scrollTo\(\{ top: 0/)
  })

  test(`${base}: the feature-slide arrows are the source's 50 px squares under 768 px and absent above`, () => {
    const css = read(`${base}/wp-ja-morgan/assets/css/groups/home.css`)
    assert.match(css, /\.acm-feature-slide \.tracy-motion-nav \{\s*display: none;/)
    assert.match(
      css,
      /@media \(max-width: 767px\) \{\s*\.acm-feature-slide \.tracy-motion-nav \{\s*display: flex;/
    )
    assert.match(css, /width: 50px;\s*height: 50px;/)
  })
}

// ── no other CMS is named on the WordPress site ─────────────────────────────────────────────────────
test('the footer, the menus, the hero, the notices, the tags and the Contact link name no other CMS and no template vendor', {
  skip: noDossier
}, () => {
  for (const base of BASES) {
    for (const part of ['footer', 'footer-hs3', 'footer-hs4', 'header']) {
      const html = read(`${base}/wp-ja-morgan/parts/${part}.html`)
      assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /joomla|joomlart/i, `${base}: ${part}`)
      assert.doesNotMatch(html, /joomlart\.com|joomla\.org/i, `${base}: ${part} links`)
    }
    const contact = read(`${base}/wp-ja-morgan/patterns/contact-details.php`)
    assert.doesNotMatch(contact.replace(/<\?php[\s\S]*?\?>/g, ''), /joomla/i, `${base}: contact details`)
    const content = read(`${base}/wp-ja-morgan/inc/groups/content.php`)
    assert.doesNotMatch(content, /'joomla'\s*=>|'joomlart'\s*=>/, `${base}: tag cards`)
  }
  const content = JSON.parse(readTask('spec/content.json'))
  assert.doesNotMatch(content.site.tagline, /joomla/i)
  for (const slug of ['offline-page', 'error-page']) {
    const page = content.pages.find((p) => p.slug === slug)
    assert.ok(page, slug)
    assert.doesNotMatch(`${page.excerpt ?? ''} ${page.content}`, /joomla/i, slug)
  }
  for (const page of content.pages)
    assert.doesNotMatch(`${page.title} ${page.menuLabel ?? ''}`, /joomla|J!/i, page.slug)
  for (const post of content.posts)
    for (const tag of post.tags ?? []) assert.doesNotMatch(tag, /joomla/i, post.path)
  assert.doesNotMatch(readTask('spec/menus.json'), /"label": "(Joomla|J!)/)
  const sections = JSON.parse(readTask('spec/sections.json'))
  const visible = JSON.stringify(sections)
    .replace(/images\/joomlart\//g, '')
    .replace(/\\u00a0/g, ' ')
  assert.doesNotMatch(visible.replace(/\/joomlart-content\//g, ''), /joomlart\.com|Joomla|J!/)
})

// ── PHP: Quick Contact, registration and the listing filters ────────────────────────────────────────
const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({})
})
after(() => php?.stop())

const FN_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return is_scalar($v) ? trim(preg_replace('/[\r\n\t ]+/', ' ', strip_tags((string) $v))) : ''; }
function sanitize_textarea_field($v) { return is_scalar($v) ? trim(strip_tags((string) $v)) : ''; }
function sanitize_key($v) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string) $v)); }
function get_term_by($f, $slug, $tax) { $names = ['finance' => 'Finance', 'business' => 'Business']; return isset($names[$slug]) ? (object) ['name' => $names[$slug]] : false; }
function selected($a, $b, $echo = true) { return (string) $a === (string) $b ? ' selected="selected"' : ''; }
function __($t, $d = '') { return $t; }
function esc_html__($t, $d = '') { return htmlspecialchars($t); }
function esc_html($t) { return htmlspecialchars($t); }
function esc_attr($t) { return htmlspecialchars($t); }
function esc_attr__($t, $d = '') { return htmlspecialchars($t); }
function esc_url($t) { return $t; }
function get_permalink($id = 0) { return 'http://s.test/page/'; }
function get_queried_object_id() { return 1; }
function add_filter() {}
function add_action() {}
eval($in['code']);
$out = [];
foreach ($in['cases'] as $c) {
  $_GET = $c['get'] ?? []; $_POST = $c['post'] ?? [];
  $out[] = eval($c['expr']);
}
echo json_encode($out);
`

const fnText = (text, names) =>
  names.map((fn) => text.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`))?.[0]).join('\n')

test('the filter parameters are bounded plain strings, the cards are filtered by name and cut to the limit', {
  skip: PHP_SKIP
}, () => {
  for (const base of BASES) {
    const text = read(`${base}/wp-ja-morgan/inc/groups/content.php`)
    const code = fnText(text, [
      'wp_ja_morgan_b_limits',
      'wp_ja_morgan_b_filter_params',
      'wp_ja_morgan_b_filter_form',
      'wp_ja_morgan_b_filter_cards'
    ])
    assert.ok(!code.includes('undefined') && code.length > 300, `${base}: the functions`)
    const cards = `['business'=>['a','b',1],'finance'=>['c','d',2],'morgan'=>['e','f',3],'platform'=>['g','h',4],'studio'=>['i','j',5]]`
    const cases = [
      { get: {}, expr: 'return wp_ja_morgan_b_filter_params();' },
      { get: { 'filter-search': '  Fin ', limit: '5' }, expr: 'return wp_ja_morgan_b_filter_params();' },
      { get: { 'filter-search': ['x'], limit: ['5'] }, expr: 'return wp_ja_morgan_b_filter_params();' },
      { get: { 'filter-search': 'a', limit: '7' }, expr: 'return wp_ja_morgan_b_filter_params();' },
      { get: { limit: '0' }, expr: 'return wp_ja_morgan_b_filter_params();' },
      { get: { limit: '-5' }, expr: 'return wp_ja_morgan_b_filter_params();' },
      { get: { limit: '99999' }, expr: 'return wp_ja_morgan_b_filter_params();' },
      {
        get: { 'filter-search': 'fin' },
        expr: `return array_keys(wp_ja_morgan_b_filter_cards(${cards}, wp_ja_morgan_b_filter_params()));`
      },
      {
        get: { 'filter-search': 'FIN' },
        expr: `return array_keys(wp_ja_morgan_b_filter_cards(${cards}, wp_ja_morgan_b_filter_params()));`
      },
      {
        get: { 'filter-search': 'zzz' },
        expr: `return array_keys(wp_ja_morgan_b_filter_cards(${cards}, wp_ja_morgan_b_filter_params()));`
      },
      {
        get: { limit: '5' },
        expr: `return array_keys(wp_ja_morgan_b_filter_cards(${cards}, ['search'=>'','limit'=>2]));`
      },
      {
        get: { limit: '0' },
        expr: `return array_keys(wp_ja_morgan_b_filter_cards(${cards}, ['search'=>'','limit'=>0]));`
      },
      {
        get: { 'filter-search': '"><script>x</script>' },
        expr: 'return wp_ja_morgan_b_filter_form(wp_ja_morgan_b_filter_params());'
      }
    ]
    cases[3].get['filter-search'] = 'a'.repeat(300)
    const [out] = php.run([{ args: ['-r', FN_PROBE], input: JSON.stringify({ code, cases }) }])
    assert.equal(out.status, 0, `${base}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    assert.deepEqual(got[0], { search: '', limit: 20 })
    assert.deepEqual(got[1], { search: 'Fin', limit: 5 })
    assert.deepEqual(got[2], { search: '', limit: 20 }, 'arrays are ignored')
    assert.equal(got[3].search.length, 100)
    assert.equal(got[3].limit, 20, 'a limit outside the offered list')
    assert.equal(got[4].limit, 0, '0 is All')
    assert.equal(got[5].limit, 20)
    assert.equal(got[6].limit, 20)
    assert.deepEqual(got[7], ['finance'])
    assert.deepEqual(got[8], ['finance'], 'any case')
    assert.deepEqual(got[9], [])
    assert.deepEqual(got[10], ['business', 'finance'])
    assert.equal(got[11].length, 5)
    assert.doesNotMatch(got[12], /<script>/, 'the typed text is escaped in the form')
    // tags are stripped by the sanitizer, and what is left (a quote and a bracket) is escaped, so the value cannot close its attribute
    assert.match(got[12], /value="&quot;&gt;x"/)
  }
})

test('Quick Contact reads only bounded plain strings and never trusts the return path', {
  skip: PHP_SKIP
}, () => {
  for (const base of BASES) {
    const text = read(`${base}/wp-ja-morgan/inc/groups/account.php`)
    const code = fnText(text, ['wp_ja_morgan_qc_messages', 'wp_ja_morgan_qc_fields'])
    assert.ok(!code.includes('undefined') && code.length > 200, `${base}: the functions`)
    const cases = [
      {
        expr: `return wp_ja_morgan_qc_fields(['name'=>' Ann ','email'=>'a@b.test','subject'=>'Hi','text'=>"x\\ny"]);`
      },
      {
        expr: `return wp_ja_morgan_qc_fields(['name'=>['x'],'email'=>null,'subject'=>5,'text'=>new stdClass]);`
      },
      { expr: `return wp_ja_morgan_qc_fields('nope');` },
      {
        expr: `return wp_ja_morgan_qc_fields(['name'=>str_repeat('n', 500),'subject'=>str_repeat('s', 500),'text'=>str_repeat('t', 9000)]);`
      },
      { expr: 'return array_keys(wp_ja_morgan_qc_messages());' }
    ]
    const [out] = php.run([{ args: ['-r', FN_PROBE], input: JSON.stringify({ code, cases }) }])
    assert.equal(out.status, 0, `${base}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    assert.deepEqual(got[0], { name: 'Ann', email: 'a@b.test', subject: 'Hi', text: 'x\ny' })
    assert.deepEqual(got[1], { name: '', email: '', subject: '', text: '' }, 'non-strings become empty')
    assert.deepEqual(got[2], { name: '', email: '', subject: '', text: '' })
    assert.equal(got[3].name.length, 60)
    assert.equal(got[3].subject.length, 200)
    assert.equal(got[3].text.length, 5000)
    assert.deepEqual(got[4], ['ok-qc', 'error-qc-token', 'error-qc-field', 'error-qc-send'])
    // the handler: nonce first, then fields, then the real send, and an honest failure
    assert.match(text, /add_action\( 'admin_post_nopriv_jm_quick_contact'/)
    assert.match(
      text,
      /wp_verify_nonce\( sanitize_text_field\( wp_unslash\( \$_POST\['jm_nonce'\] \) \), 'jm_quick_contact' \)/
    )
    assert.match(text, /\$sent \? 'ok-qc' : 'error-qc-send'/)
    assert.match(text, /'error-qc-send' === \$code \? 502 : 422/)
    assert.match(
      text,
      /name="jm_qc\[name\]"/,
      'a namespaced field: a bare `name` collides with the WordPress query variable'
    )
    assert.doesNotMatch(text, /name="name"/)
    assert.match(
      read(`${base}/wp-ja-morgan/patterns/acm-features-3-contact.php`),
      /wp_ja_morgan_quick_contact_form\(\)/
    )
  }
})

test('registration says it is closed when it is, and the sign-in module drops its Create an account link then', () => {
  for (const base of BASES) {
    const pattern = read(`${base}/wp-ja-morgan/patterns/account-register.php`)
    assert.match(pattern, /if \( ! get_option\( 'users_can_register' \) \) :/)
    assert.match(pattern, /Registration is closed on this site\./)
    const account = read(`${base}/wp-ja-morgan/inc/groups/account.php`)
    assert.match(account, /render_block_core\/list-item/)
    assert.match(
      account,
      /get_option\( 'users_can_register' \) \|\| false === strpos\( \$content, '\/j-pages\/registration\/' \)/
    )
    // the handler still refuses a closed site and a wrong nonce
    assert.match(account, /error-closed/)
  }
})

test('the scripts wire the filters, the quick contact and the back-to-top button', () => {
  for (const base of BASES) {
    const js = read(`${base}/wp-ja-morgan/assets/js/wp-ja-morgan.js`)
    for (const piece of ['touchSubmenus()', 'tagFilters()', 'quickContact()', 'backToTop()'])
      assert.ok(js.includes(piece), `${base}: ${piece}`)
    assert.match(js, /form\.dataset\.busy === '1'/, 'a second click while a send is running does nothing')
    assert.match(js, /if \(mine !== latest\) return/, 'a late answer to an older send is ignored')
    // the Quick Contact form holds a field named `action`, which shadows the `form.action` property: the address
    // must be read as an attribute, and nothing may post to the property
    assert.match(js, /fetch\(form\.getAttribute\('action'\)/)
    assert.doesNotMatch(js, /fetch\(form\.action/)
    assert.match(js, /lastPointer === 'touch'/)
    assert.match(js, /classList\.contains\('jm-touch-open'\)/)
  }
})

test('the part navigation blocks keep the menutype names the seeder reads, so the sidebar menu is not lost', {
  skip: noDossier
}, () => {
  const menus = JSON.parse(readTask('spec/menus.json'))
  const types = menus.menus.map((m) => m.menutype)
  for (const base of BASES) {
    const header = read(`${base}/wp-ja-morgan/parts/header.html`)
    const names = [...header.matchAll(/"name":"nav\.([a-z0-9-]+)"/g)].map((m) => m[1])
    assert.ok(names.includes('mainmenu') && names.includes('joomla-pages'), `${base}: ${names}`)
    for (const n of names) assert.ok(types.includes(n), `${base}: nav.${n} names no menutype of the spec`)
  }
})

test('the tagged-items filter bar sits inside .tag-category, where its styles are', () => {
  for (const base of BASES) {
    const php = read(`${base}/wp-ja-morgan/inc/groups/content.php`)
    assert.match(
      php,
      /'<div class="tag-category jm-tagged-filter">' \. wp_ja_morgan_b_filter_form\( \$params, 'tagged-items-form' \) \. '<\/div>'/
    )
  }
})

test("the tagged-items filter reaches only the tag listing, never the sidebar's most-read query", () => {
  for (const base of BASES) {
    const php = read(`${base}/wp-ja-morgan/inc/groups/content.php`)
    assert.match(php, /empty\( \$context\['taxQuery'\]\['post_tag'\] \)/)
  }
})

test('a social link carries its name on the anchor and has no separate label box', () => {
  for (const base of BASES) {
    const php = read(`${base}/wp-ja-morgan/inc/extra.php`)
    assert.match(php, /add_filter\(\s*'render_block_core\/social-link'/)
    assert.match(php, /aria-label="' \. esc_attr\( \$name \)/)
  }
})

test('the narrow-screen fixes are in the group sheets: team columns, statement box, quote slides, category titles, social labels', () => {
  for (const base of BASES) {
    const mobile = read(`${base}/wp-ja-morgan/assets/css/groups/mobile.css`)
    assert.match(mobile, /\.item-page \.acm-teams \.jm-cards \{\s*grid-template-columns: repeat\(2, 1fr\);/)
    assert.match(mobile, /\.item-page \.acm-teams \.jm-cards \{\s*grid-template-columns: 1fr;/)
    assert.match(mobile, /\.acm-features\.style-5 \.group-item \{\s*padding: 45px 15px;/)
    assert.match(
      mobile,
      /\.acm-testimonial\.style-3 \.testimonial-item \{\s*flex-basis: calc\(100% - 30px\);/
    )
    assert.doesNotMatch(mobile, /\.category-item-inner \.item-title \{\s*flex-wrap: wrap;/)
    const content = read(`${base}/wp-ja-morgan/assets/css/groups/content.css`)
    assert.match(content, /\.categories-list \.item-title \.badge \{[^}]*float: right;/)
  }
})

test('the category list draws each picture from the term meta thumbnail_id, never from a file name', () => {
  for (const base of BASES) {
    const pattern = read(`${base}/wp-ja-morgan/patterns/b-category-list.php`)
    assert.match(
      pattern,
      /wp_get_attachment_image_url\( \(int\) get_term_meta\( \$term->term_id, 'thumbnail_id', true \), 'full' \)/
    )
    assert.doesNotMatch(pattern, /wp_ja_morgan_b_media|img-\d+/)
    const content = read(`${base}/wp-ja-morgan/inc/groups/content.php`)
    assert.doesNotMatch(content, /wp_ja_morgan_b_category_pictures|img-(2|10|13|5)\.jpg/)
    assert.match(content, /function wp_ja_morgan_b_category_slugs\(\)/)
  }
})

// 1.1.11 (T29, Q8): the header shows the site's logo when it has one, else the name in Morgan's text style; the
// copyright names the site.
for (const base of ['overlays', 'src']) {
  test(`${base}: the header brand is a Site Logo pair with the name in Morgan's text style; the copyright names the site`, () => {
    const header = read(`${base}/wp-ja-morgan/parts/header.html`)
    const footer = read(`${base}/wp-ja-morgan/parts/footer.html`)
    assert.ok(header.includes('"className":"jm-logo jm-logo--light tracy-logo-bare"'))
    assert.ok(header.includes('"className":"jm-logo jm-logo--dark tracy-logo-bare"'))
    assert.ok(header.includes('<p class="logo logo-text"><a href="/">{site.title}<strong>.</strong></a></p>'))
    assert.ok(!header.includes('>Morgan<strong>'), 'the demo word is gone')
    assert.ok(footer.includes('Copyright © {year} {site.title}. All Rights Reserved.'))
    assert.ok(!footer.includes('ja_morgan'))
  })
}

// 1.1.19 (D-81): the source draws Font Awesome's `fa-twitter` bird for Twitter in the top bar and the footers. WordPress
// core draws the X mark for the `x` service and the bird for `twitter`, so every Twitter link is a `twitter` link; the
// footer square keeps the `x` selector too, for a footer a site edited in the Site Editor before 1.1.19.
for (const base of BASES) {
  test(`${base}: every Twitter social link is core's twitter service (the bird), never x; the footer square styles both`, () => {
    for (const rel of ['parts/header.html', 'parts/footer.html', 'patterns/part-footer-hs3.php']) {
      const markup = read(`${base}/wp-ja-morgan/${rel}`)
      assert.ok(markup.includes('<!-- wp:social-link {"url":'), `${rel} carries social links`)
      assert.match(markup, /"service":"twitter","label":"Twitter"/, `${rel}: Twitter is the twitter service`)
      assert.doesNotMatch(markup, /"service":"x"/, `${rel}: no X link`)
    }
    const css = read(`${base}/wp-ja-morgan/assets/css/wp-ja-morgan.css`)
    assert.match(
      css,
      /\.social-follow \.wp-social-link-twitter,\n\.social-follow \.wp-social-link-x \{\n\tbackground: #55acee;/
    )
    assert.match(
      css,
      /\.social-follow \.wp-social-link-twitter a::before,\n\.social-follow \.wp-social-link-x a::before \{/
    )
  })
}

// D-81: the visible brand is "Morgan" (logo `Morgan<b>.</b>`, "© 2019 Morgan."), so the demo's site name, which the
// seeder writes to blogname and the logo and copyright print through {site.title}, is "Morgan", not "JA Morgan".
test('the demo site name the seeder writes to blogname is "Morgan", and the logo still prints the site name', {
  skip: noDossier
}, () => {
  assert.equal(JSON.parse(readTask('spec/content.json')).site.name, 'Morgan')
  assert.equal(JSON.parse(readTask('spec/content-contract.json')).facts['site.name'].value, 'Morgan')
  for (const base of BASES)
    assert.ok(read(`${base}/wp-ja-morgan/parts/header.html`).includes('{site.title}<strong>.</strong>'))
})
