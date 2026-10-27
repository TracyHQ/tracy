/**
 * wp-ja-impact 1.0.2 — the audited defects, held as behaviour where a script or PHP function can run here and as
 * source facts where only a browser sees the result (the browser measurements live with the release record,
 * tasks/ja-impact-wp7/release/).
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
const { dir: TASK, skip: noDossier } = taskDossier('ja-impact-wp7')
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
  const file = `${base}/wp-ja-impact/assets/js/wp-ja-impact-dark.js`
  test(`${file}: every click flips light and dark, so the first click always changes the page`, () => {
    assert.deepEqual(runSwitch(file, { osDark: false, clicks: 3 }).seen, ['dark', 'light', 'dark'])
    assert.deepEqual(runSwitch(file, { osDark: true, clicks: 3 }).seen, ['light', 'dark', 'light'])
    // an old three-state cookie that says auto is still read, and is flipped like no cookie
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=auto', osDark: true, clicks: 1 }).seen, ['light'])
    assert.deepEqual(runSwitch(file, { cookie: 'tracy_theme=dark', osDark: false, clicks: 2 }).seen, [
      'light',
      'dark'
    ])
  })

  test(`${file}: a click saves the flipped choice, a plain load saves nothing, ?theme= is flipped like any state`, () => {
    assert.match(runSwitch(file, { clicks: 1 }).cookie, /tracy_theme=dark/)
    assert.equal(runSwitch(file, { search: '?theme=dark' }).cookie, '')
    const queried = runSwitch(file, { search: '?theme=dark', clicks: 1 })
    assert.deepEqual(queried.seen, ['light'])
    assert.match(queried.cookie, /tracy_theme=light/)
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

// ── the header: Donate hides below 1200, the phone header carries a switch, no parent waits for a class ──
test('the header hides Donate below 1200 px, keeps the switch 48 px and gives phones a switch of their own', () => {
  const css = read('overlays/wp-ja-impact/assets/css/groups/z-pilot.css')
  assert.match(css, /@media \(max-width: 1199\.98px\) \{\s*body\.tracy \.jim-donate \{ display: none; \}/)
  assert.match(css, /\.jim-theme-toggle \{ flex: 0 0 48px; \}/)
  const header = read('overlays/wp-ja-impact/parts/header.html')
  assert.equal(header.match(/data-tracy-theme-toggle/g).length, 2, 'a desktop switch and a phone switch')
  assert.match(
    header,
    /jim-header__tools"><button type="button" class="jim-theme-toggle jim-theme-toggle--phone"/
  )
  assert.match(css, /\.jim-theme-toggle--phone \{ flex: 0 0 32px; width: 32px; height: 32px;/)
})

test('the parent items open from state a script sets: no rule waits for `.is-open`, the caret is not shifted under the label', () => {
  for (const base of BASES) {
    const css = read(`${base}/wp-ja-impact/assets/css/groups/z-pilot.css`)
    const js = read(`${base}/wp-ja-impact/assets/js/wp-ja-impact.js`)
    assert.doesNotMatch(css, /is-open/, `${base}: z-pilot.css`)
    assert.doesNotMatch(css, /translateX\(-34px\)/, `${base}: the caret over the label`)
    assert.match(css, /submenu-icon \{[^}]*width: 57px; height: 24px;/)
    assert.match(
      css,
      /\[aria-expanded='true'\] ~ \.wp-block-navigation__submenu-container \{ display: flex; \}/
    )
    assert.match(js, /setAttribute\('aria-expanded'/)
    assert.match(js, /jim-drill-back/)
    assert.match(
      css,
      /\.wp-block-navigation__submenu-container \.wp-block-navigation-submenu > \.wp-block-navigation__submenu-container \{ inset: 0; \}/,
      `${base}: a third-level panel covers its parent whole, so one back row shows`
    )
    assert.match(
      js,
      /li\.wp-block-navigation-submenu/,
      'parents are the items, not their list elements (which share the class)'
    )
  }
})

// ── single posts keep their section current ─────────────────────────────────────────────────────────
const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({})
})
after(() => php?.stop())

const SECTION_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
class WP_Term { public $term_id; public $slug; function __construct($i, $s) { $this->term_id = $i; $this->slug = $s; } }
class WP_Post { public $post_parent = 0; public $post_name = ''; public $post_type = 'page'; public $post_content = ''; }
function parse_blocks($c) { return json_decode($c, true); }
$GLOBALS['terms'] = [3 => ['blog', 0], 4 => ['events', 3], 5 => ['animals', 3], 7 => ['donations', 3], 8 => ['elsewhere', 0]];
$GLOBALS['single'] = true; $GLOBALS['post_cats'] = [];
function is_singular($t = '') { return $GLOBALS['single']; }
function get_queried_object_id() { return 1; }
function get_query_var($n) { return $GLOBALS['route'] ?? false; }
function get_the_category($id) { return array_map(fn($i) => new WP_Term($i, $GLOBALS['terms'][$i][0]), $GLOBALS['post_cats']); }
function get_ancestors($id, $type) { $out = []; for ($p = $GLOBALS['terms'][$id][1]; $p; $p = $GLOBALS['terms'][$p][1]) { $out[] = $p; } return $out; }
function get_term($id, $tax) { return isset($GLOBALS['terms'][$id]) ? new WP_Term($id, $GLOBALS['terms'][$id][0]) : null; }
function get_post($id) { if (isset($GLOBALS['navs'][$id])) { $n = new WP_Post(); $n->post_type = 'wp_navigation'; $n->post_content = json_encode($GLOBALS['navs'][$id]); return $n; } if (!isset($GLOBALS['pages'][$id])) { return null; } $p = new WP_Post(); [$p->post_name, $p->post_parent] = $GLOBALS['pages'][$id]; return $p; }
function add_filter() {}
eval($in['code']);
$out = [];
foreach ($in['cases'] as $c) {
  $GLOBALS['single'] = $c['single']; $GLOBALS['post_cats'] = $c['cats']; $GLOBALS['pages'] = $c['pages'] ?? []; $GLOBALS['route'] = $c['route'] ?? false; $GLOBALS['navs'] = $c['navs'] ?? [];
  wp_ja_impact_navigation_points_at_post($c['nav'] ?? ['innerBlocks' => []]);
  $out[] = isset($c['link']) ? wp_ja_impact_section_menu_link($c['link']['html'], $c['link']['block']) : wp_ja_impact_single_section();
}
echo json_encode($out);
`

test('a single post marks one menu section by its category, and marks nothing when it cannot tell', {
  skip: PHP_SKIP
}, () => {
  for (const base of BASES) {
    const file = `${base}/wp-ja-impact/inc/extra.php`
    const text = read(file)
    const code = [
      'wp_ja_impact_single_section',
      'wp_ja_impact_section_menu_link',
      'wp_ja_impact_blocks_link_to_post',
      'wp_ja_impact_navigation_points_at_post'
    ]
      .map((fn) => text.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n}\\n`))?.[0])
      .join('\n')
    assert.ok(!code.includes('undefined') && code.length > 100, `${file}: the functions`)
    assert.match(text, /add_filter\( 'render_block_data', 'wp_ja_impact_navigation_read_items' \);/)
    assert.match(
      text,
      /add_filter\( 'render_block_core\/navigation-link', 'wp_ja_impact_section_menu_link', 20, 2 \);/
    )
    const link = (id) => ({
      html: '<li class="wp-block-navigation-item wp-block-navigation-link"><a>x</a></li>',
      block: { attrs: { kind: 'post-type', type: 'page', id } }
    })
    const pages = {
      10: ['donations', 0],
      11: ['events', 0],
      12: ['category-blog', 0],
      13: ['category-blog', 9],
      14: ['about', 0]
    }
    const post = (id) => ({
      blockName: 'core/navigation-link',
      attrs: { kind: 'post-type', type: 'post', id }
    })
    const nav = (...innerBlocks) => ({ innerBlocks })
    const cases = [
      { single: true, cats: [7] }, // donations is a child of blog: its own section wins
      { single: true, cats: [4] },
      { single: true, cats: [5] }, // animals reaches blog through its parent
      { single: true, cats: [7, 4] }, // two sections: ambiguous
      { single: true, cats: [8] },
      { single: true, cats: [] },
      { single: false, cats: [7] },
      { single: true, cats: [7], pages, link: link(10) },
      { single: true, cats: [7], pages, link: link(11) },
      { single: true, cats: [5], pages, link: link(12) },
      { single: true, cats: [5], pages, link: link(13) }, // the nested Category Blog item is not the section
      { single: true, cats: [5], pages, link: link(14) },
      { single: true, cats: [5], pages, link: link(99) },
      { single: true, cats: [7, 4], pages, link: link(10) },
      { single: true, cats: [5], route: 1 },
      { single: true, cats: [5], pages, link: link(12), route: 1 },
      // a menu item that points at the post itself wins over the section, wherever it sits in the navigation
      { single: true, cats: [5], pages, link: link(12), nav: nav(post(1)) },
      {
        single: true,
        cats: [5],
        pages,
        link: link(12),
        nav: nav({ blockName: 'core/navigation-submenu', innerBlocks: [post(2), post(1)] })
      },
      { single: true, cats: [5], pages, link: link(12), nav: nav(post(2)) },
      {
        single: true,
        cats: [5],
        pages,
        link: link(12),
        nav: nav({ blockName: 'core/navigation-link', attrs: { kind: 'post-type', type: 'page', id: 1 } })
      },
      {
        single: true,
        cats: [5],
        pages,
        link: link(12),
        nav: { attrs: { ref: 1000 }, innerBlocks: [] },
        navs: { 1000: [{ blockName: 'core/navigation-submenu', innerBlocks: [post(1)] }] }
      },
      {
        single: true,
        cats: [5],
        pages,
        link: link(12),
        nav: { attrs: { ref: 1001 }, innerBlocks: [post(1)] },
        navs: {}
      },
      {
        single: true,
        cats: [5],
        pages,
        link: link(12),
        nav: nav({ blockName: 'core/navigation-link', attrs: { kind: 'post-type', type: 'post' } })
      }
    ]
    const [out] = php.run([{ args: ['-r', SECTION_PROBE], input: JSON.stringify({ code, cases }) }])
    assert.equal(out.status, 0, `${file}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    assert.deepEqual(got.slice(0, 7), ['donations', 'events', 'category-blog', '', '', '', ''])
    assert.match(got[7], /current-menu-item/)
    assert.doesNotMatch(got[8], /current-menu-item/)
    assert.match(got[9], /current-menu-item/)
    for (const i of [10, 11, 12, 13, 15]) assert.doesNotMatch(got[i], /current-menu-item/, `case ${i}`)
    assert.equal(got[14], '', 'an article at a menu address marks no section')
    assert.doesNotMatch(got[16], /current-menu-item/, 'the menu item for the post itself is the highlight')
    assert.doesNotMatch(got[17], /current-menu-item/, 'a nested item, after a sibling')
    assert.match(got[18], /current-menu-item/, 'an item for another post leaves the section')
    assert.match(got[19], /current-menu-item/, 'a page item with the same id is not the post')
    assert.doesNotMatch(got[20], /current-menu-item/, 'a navigation read through its ref')
    assert.doesNotMatch(
      got[21],
      /current-menu-item/,
      'a ref that does not resolve falls back to the block tree'
    )
    assert.match(got[22], /current-menu-item/, 'an item with no id points at nothing')
  }
})

// ── no other CMS is named on the WordPress site ─────────────────────────────────────────────────────
test('the footer, the menu, the Offline and Error notices and the Contact links name no other CMS and no template vendor', {
  skip: noDossier
}, () => {
  for (const base of BASES) {
    const footer = read(`${base}/wp-ja-impact/parts/footer.html`)
    assert.doesNotMatch(footer.replace(/<!--[\s\S]*?-->/g, ''), /joomla/i, `${base}: footer`)
    assert.match(
      footer,
      /WordPress<\/a> is free software released under the <a href="https:\/\/www\.gnu\.org\/licenses\/gpl-2\.0\.html">GNU General Public License\./
    )
  }
  const content = JSON.parse(readTask('spec/content.json'))
  for (const slug of ['offline-page', 'error-page', 'contact']) {
    const page = content.pages.find((p) => p.slug === slug)
    assert.ok(page, slug)
    assert.doesNotMatch(`${page.excerpt ?? ''} ${page.content}`, /joomla/i, slug)
  }
  const menus = readTask('spec/menus.json')
  assert.doesNotMatch(menus, /Joomla content/)
  assert.match(menus, /"label": "Articles"/)
})

test('the Username Reminder says what the form does: a password-reset link, not an emailed username', () => {
  for (const base of BASES) {
    const ga = read(`${base}/wp-ja-impact/inc/groups/ga.php`)
    assert.doesNotMatch(ga, /username will be emailed/i, base)
    assert.match(
      ga,
      /WordPress does not email usernames: we will send a link to that address to reset your password\./,
      base
    )
    assert.match(ga, /action=lostpassword/, `${base}: the form still posts to the lost-password flow`)
  }
})

test('the contact form seed makes only the privacy consent mandatory and validates on submit', {
  skip: noDossier
}, () => {
  const seed = readTask('tools/seed.sh')
  assert.match(seed, /\[checkbox send-a-copy-to-yourself use_label_element/)
  assert.match(seed, /acceptance_as_validation: on/)
  assert.match(seed, /_tracy_seed. fingerprint, so a second seed sees the form as unchanged/)
  const css = read('overlays/wp-ja-impact/assets/css/groups/ga.css')
  assert.match(css, /:is\(\.wpcf7-acceptance, \.wpcf7-checkbox\)/)
  assert.match(css, /button\[type='submit'\]\):disabled \{ opacity: 0\.5; cursor: not-allowed; \}/)
})

// 1.0.7 (T28): the three logo spots read the site's logo, never a demo picture, and the copyright names the site.
// 1.0.9: the spots sit on the navy bar in both modes, so each is the dark-background spot (option tracy_logo_dark).
for (const base of ['overlays', 'src']) {
  test(`${base}: header, drawer and footer logos are dark-background Site Logo blocks that fall back to the name; the copyright names the site`, () => {
    const header = readFileSync(path.join(PKG, base, 'wp-ja-impact/parts/header.html'), 'utf8')
    const footer = readFileSync(path.join(PKG, base, 'wp-ja-impact/parts/footer.html'), 'utf8')
    for (const part of [header, footer]) assert.doesNotMatch(part, /wp:image[^\n]*logo|logo\.png|JA Impact/)
    for (const cls of ['jim-logo', 'jim-drawer__logo'])
      assert.match(
        header,
        new RegExp(`<!-- wp:site-logo \\{[^}]*"className":"${cls} tracy-logo-dark"\\} /-->`)
      )
    assert.match(footer, /<!-- wp:site-logo \{[^}]*"className":"jim-footer__logo tracy-logo-dark"\} \/-->/)
    assert.match(footer, /Copyright © \{year\} \{site\.title\}\. All Rights Reserved\./)
  })
}
