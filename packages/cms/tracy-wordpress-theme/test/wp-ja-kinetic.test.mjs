/**
 * wp-ja-kinetic 1.1.5 — the audited defects, held as behaviour where PHP can run here and as source facts where only a
 * browser sees the result (the browser measurements are tasks/ja-kinetic-wp7/tools/measure115.mjs, whose run is recorded
 * with the release in tasks/ja-kinetic-wp7/release/). 1.1.6 — the Contact page's mailboxes are the site's (ledger L17).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'
import { taskDossier } from './task-dossier.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const read = (rel) => readFileSync(path.join(PKG, rel), 'utf8')
const BASES = ['overlays', 'src']
const DOSSIER = taskDossier('ja-kinetic-wp7')

/** Asserts without echoing a whole stylesheet when it fails. */
const has = (text, re, msg) => assert.ok(re.test(text), msg ?? `missing ${re}`)
const hasNot = (text, re, msg) => assert.ok(!re.test(text), msg ?? `unexpected ${re}`)

/** The source text of one top-level PHP function, found by brace matching. */
function phpFunction(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `function ${name} is not in the file`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  throw new Error(`function ${name} never closes`)
}

const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP) php = startPhp({})
})
after(() => php?.stop())

/** Runs `code` (PHP, after the stubs) once per case in one PHP process; returns what each case's run_case() returned. */
async function runPhp(stubs, code, cases) {
  const prog = `
class WP_Post { public $ID = 0; public $post_author = 0; }
class WP_User { public $display_name = ''; }
class WP_Term { public $term_id = 0; public $slug = ''; public $parent = 0; public $name = ''; }
function is_wp_error($x) { return false; }
${stubs}
${code}
$cases = json_decode(stream_get_contents(STDIN), true);
$out = [];
foreach ($cases as $c) { $out[] = run_case($c); }
echo json_encode($out);
`
  const [r] = await php.run([{ args: ['-r', prog], input: JSON.stringify(cases) }])
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}

// ── 1. the byline of a post the block fetched itself ────────────────────────────────────────────────────
const itemIds = read('overlays/wp-ja-kinetic/inc/item-ids.php')
const AUTHOR_STUBS = String.raw`
$GLOBALS['posts'] = []; $GLOBALS['meta'] = []; $GLOBALS['users'] = []; $GLOBALS['current'] = 0;
function get_post($p) { if ($p instanceof WP_Post) return $p; return $GLOBALS['posts'][$p] ?? null; }
function get_post_meta($id, $key, $single) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function get_userdata($id) { return $GLOBALS['users'][$id] ?? false; }
function get_the_ID() { return $GLOBALS['current'] ?: false; }
`
const AUTHOR_CODE = `${phpFunction(itemIds, 'wp_ja_kinetic_post_author_name')}
${phpFunction(itemIds, 'wp_ja_kinetic_author_alias_override')}
function run_case($c) {
  foreach ($c['posts'] as $id => $author) { $p = new WP_Post(); $p->ID = (int) $id; $p->post_author = $author; $GLOBALS['posts'][(int) $id] = $p; }
  foreach ($c['users'] as $id => $name) { $u = new WP_User(); $u->display_name = $name; $GLOBALS['users'][(int) $id] = $u; }
  foreach ($c['alias'] as $id => $a) { $GLOBALS['meta'][(int) $id]['wp_ja_kinetic_article_author_alias'] = $a; }
  $GLOBALS['current'] = $c['current'] ?? 0;
  return ['name' => wp_ja_kinetic_post_author_name($c['ask']), 'filter' => wp_ja_kinetic_author_alias_override('user-name')];
}`

test('the byline names the post asked about, never the global post (defect 1)', {
  skip: PHP_SKIP
}, async () => {
  const [other, own, empty, ghost, noAuthor, byObject] = await runPhp(AUTHOR_STUBS, AUTHOR_CODE, [
    // the global post (7) carries an alias; the featured post (5) is another one and has none
    {
      posts: { 5: 11, 7: 12 },
      users: { 11: 'Arjun Mehta', 12: 'Lena Park' },
      alias: { 7: 'Someone Else' },
      current: 7,
      ask: 5
    },
    // the post asked about has its own alias
    {
      posts: { 5: 11, 7: 12 },
      users: { 11: 'Arjun Mehta', 12: 'Lena Park' },
      alias: { 5: 'Priya Raman' },
      current: 7,
      ask: 5
    },
    // an empty alias falls through to the user
    { posts: { 5: 11 }, users: { 11: 'Arjun Mehta' }, alias: { 5: '   ' }, current: 0, ask: 5 },
    // no such post
    { posts: {}, users: { 11: 'Arjun Mehta' }, alias: {}, current: 0, ask: 99 },
    // the author is gone
    { posts: { 5: 77 }, users: {}, alias: {}, current: 0, ask: 5 },
    // asked with an id of a post whose object is not in the list: still no borrowed name
    {
      posts: { 5: 11, 7: 12 },
      users: { 11: 'Arjun Mehta', 12: 'Lena Park' },
      alias: { 7: 'Someone Else' },
      current: 7,
      ask: 7
    }
  ])
  assert.equal(other.name, 'Arjun Mehta', "the global post's alias is not lent to another post")
  assert.equal(own.name, 'Priya Raman')
  assert.equal(empty.name, 'Arjun Mehta')
  assert.equal(ghost.name, '')
  assert.equal(noAuthor.name, '')
  assert.equal(byObject.name, 'Someone Else')
  // the in-loop filter is as it was: the current post's alias, else the name it was given
  assert.equal(other.filter, 'Someone Else')
  assert.equal(empty.filter, 'user-name')
})

test('both blocks that draw a post outside the loop ask for its own byline', () => {
  for (const base of BASES) {
    for (const file of ['blocks/field-notes-featured/render.php', 'blocks/category-card-part/render.php']) {
      const src = read(`${base}/wp-ja-kinetic/${file}`)
      assert.match(src, /wp_ja_kinetic_post_author_name\(/, `${base}/${file}`)
      hasNot(
        src,
        /get_the_author_meta\(\s*'display_name'/,
        `${base}/${file} still reads the global post's alias`
      )
    }
  }
})

// ── 7. the child lists' eyebrow and equal-date order ───────────────────────────────────────────────────
const blogDynamic = read('overlays/wp-ja-kinetic/inc/blog-dynamic.php')
const TOPIC_STUBS = String.raw`
$GLOBALS['cat_term'] = null; $GLOBALS['meta'] = []; $GLOBALS['tags'] = []; $GLOBALS['cats'] = [];
function wp_ja_kinetic_current_category_term() { return $GLOBALS['cat_term']; }
function get_post_meta($id, $key, $single) { return $GLOBALS['meta'][$id][$key] ?? ''; }
function wp_get_object_terms($id, $tax, $args) { return $GLOBALS['tags'][$id] ?? []; }
function get_the_category($id) { return $GLOBALS['cats'][$id] ?? []; }
`
const TOPIC_CODE = `${phpFunction(blogDynamic, 'wp_ja_kinetic_is_child_listing')}
${phpFunction(blogDynamic, 'wp_ja_kinetic_listing_tie_order')}
${phpFunction(blogDynamic, 'wp_ja_kinetic_post_topic')}
function term($slug, $parent) { $t = new WP_Term(); $t->slug = $slug; $t->parent = $parent; return $t; }
function named($n) { $t = new WP_Term(); $t->name = $n; return $t; }
function run_case($c) {
  $GLOBALS['cat_term'] = isset($c['term']) ? term($c['term'][0], $c['term'][1]) : null;
  $GLOBALS['meta'] = [1 => ['wp_ja_kinetic_listing_topic' => $c['listing'] ?? '']];
  $GLOBALS['tags'] = [1 => array_map('named', $c['tags'] ?? [])];
  $GLOBALS['cats'] = [1 => array_map('named', $c['cats'] ?? [])];
  return [
    'child' => wp_ja_kinetic_is_child_listing($GLOBALS['cat_term']),
    'tie' => wp_ja_kinetic_listing_tie_order($GLOBALS['cat_term']),
    'topic' => wp_ja_kinetic_post_topic(1, $c['inListing'] ?? true),
  ];
}`

test("a child list prints the source's tag and takes equal dates newest id first; the top list does neither (defect 7)", {
  skip: PHP_SKIP
}, async () => {
  const [child, top, engineering, none, noMeta, noTags, nothing, notListing] = await runPhp(
    TOPIC_STUBS,
    TOPIC_CODE,
    [
      { term: ['practice', 98], listing: 'SLO', tags: ['incident', 'slo'], cats: ['Practice'] },
      {
        term: ['field-notes-from-the-on-call', 0],
        listing: 'SLO',
        tags: ['incident', 'slo'],
        cats: ['Practice']
      },
      { term: ['engineering', 98], listing: 'SLO', tags: ['incident'], cats: ['Engineering'] },
      { tags: ['kubernetes'], listing: 'POSTGRES' },
      { term: ['culture', 98], listing: '', tags: ['incident', 'slo'], cats: ['Culture'] },
      { term: ['culture', 98], listing: '', tags: [], cats: ['Culture'] },
      { term: ['culture', 98], listing: '', tags: [], cats: [] },
      { term: ['practice', 98], listing: 'SLO', tags: ['incident'], cats: ['Practice'], inListing: false }
    ]
  )
  assert.deepEqual([child.child, child.tie, child.topic], [true, 'DESC', 'SLO'])
  assert.deepEqual([top.child, top.tie, top.topic], [false, 'ASC', 'incident'])
  assert.deepEqual([engineering.child, engineering.tie, engineering.topic], [false, 'ASC', 'incident'])
  assert.deepEqual([none.child, none.tie, none.topic], [false, 'ASC', 'kubernetes'])
  assert.equal(noMeta.topic, 'incident', 'no listing tag written: the first tag by assignment order')
  assert.equal(noTags.topic, 'Culture', 'no tag at all: the category')
  assert.equal(nothing.topic, '')
  assert.equal(notListing.topic, 'incident')
})

test('the eyebrow blocks and the list queries use those helpers; the post-seed step writes the listing tag', {
  skip: DOSSIER.skip
}, () => {
  for (const base of BASES) {
    has(read(`${base}/wp-ja-kinetic/blocks/post-topic-eyebrow/render.php`), /wp_ja_kinetic_post_topic\(/)
    has(read(`${base}/wp-ja-kinetic/blocks/field-notes-featured/render.php`), /wp_ja_kinetic_post_topic\(/)
    const dyn = read(`${base}/wp-ja-kinetic/inc/blog-dynamic.php`)
    assert.equal((dyn.match(/wp_ja_kinetic_listing_tie_order\(/g) ?? []).length >= 3, true)
    hasNot(dyn, /'ID'\s*=>\s*'ASC'/, 'a hard-coded ASC tie-break is back in a category query')
  }
  const seed = readFileSync(path.join(DOSSIER.dir, 'post-seed.mjs'), 'utf8')
  has(seed, /wp_ja_kinetic_listing_topic/)
  has(seed, /ORDER BY m\.core_content_id ASC/)
})

// ── 2, 3, 4, 5, 6, 9: the CSS facts the browser run measures ───────────────────────────────────────────
for (const base of BASES) {
  const sections = read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic-sections.css`)
  const main = read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic.css`)

  test(`${base}: the Features spec-row title keeps the base 19px (defect 2)`, () => {
    const rule = sections.match(/body\.item-218 \.acm-features-ledger \.hx-spec-title \{([^}]*)\}/)
    assert.ok(rule, 'the page rule is there')
    assert.doesNotMatch(rule[1], /font-size/)
    has(sections, /\.acm-features-ledger \.hx-spec-title \{[^}]*font-size: 19px/)
  })

  test(`${base}: the timeline hover card stays inside the cell on phones, and the leading is the source's (defects 3, 9)`, () => {
    has(sections, /\.acm-incident-timeline \.hx-inc-cell::before \{[^}]*inset: -16px -12px -20px/)
    has(
      sections,
      /@media \(max-width: 620px\) \{\s*\.acm-incident-timeline \.hx-inc-cell::before \{\s*inset: -16px 0 -20px/
    )
    hasNot(sections, /overflow-x:\s*hidden/, 'the overflow is removed at its cause, not hidden')
    const time = sections.match(/body\.item-225 \.acm-incident-timeline \.hx-inc-time \{([^}]*)\}/)
    assert.match(time[1], /line-height: 1\.55 !important/)
  })

  test(`${base}: mega panel hangs 14px under the header, links are flex blocks, hover is for pointers (defect 4)`, () => {
    has(main, /\.tracy-mega__panel \{[^}]*top: calc\(100% \+ 21px\)/)
    has(main, /\.tracy-mega__links a \{\s*display: flex;\s*line-height: 1\.55/)
    has(main, /@media \(hover: hover\) \{\s*\.tracy-mega__trigger:hover/)
    has(main, /@media \(hover: hover\) \{\s*\.tracy-mega__links a:hover/)
    has(main, /margin-block-end: 0/)
  })

  test(`${base}: the tablet header buttons and drawer take the source's 40px up to 991.98px (defect 5)`, () => {
    const media = main.match(/@media \(max-width: 991\.98px\) \{([^@]*)\}\s*(?=\/\*|@media|\.)/g) ?? []
    const tablet = media.join('\n')
    has(
      tablet,
      /\.tracy-theme-toggle,\s*\.tracy-header__menu \.tracy-nav \.wp-block-navigation__responsive-container-open \{\s*width: 40px;\s*height: 40px/
    )
    has(tablet, /responsive-container-close \{\s*width: 40px;\s*height: 40px/)
    has(tablet, /tracy-nav__signin > \.wp-block-navigation-item__content \{\s*min-height: 40px/)
    has(tablet, /tracy-nav__drawer-head \{\s*min-height: 76px/)
  })

  test(`${base}: Privacy and Terms are 40px tall on phones (defect 6)`, () => {
    has(
      main,
      /@media \(max-width: 575\.98px\) \{\s*\.tracy-footer__legal a \{\s*display: inline-flex;\s*align-items: center;\s*min-height: 40px/
    )
  })
}

// ── 8. no developer comment in anything the theme ships as markup ─────────────────────────────────────
function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]
  )
}
for (const base of BASES) {
  test(`${base}: no HTML comment but block delimiters in the parts, templates and patterns (defect 8)`, () => {
    const root = path.join(PKG, base, 'wp-ja-kinetic')
    assert.ok(existsSync(root), `${root} exists`)
    let scanned = 0
    for (const dir of ['parts', 'templates', 'patterns']) {
      for (const file of listFiles(path.join(root, dir))) {
        if (!/\.(html|php)$/.test(file)) continue
        scanned++
        const src = readFileSync(file, 'utf8')
        for (const m of src.matchAll(/<!--([\s\S]*?)-->/g)) {
          const body = m[1].trim()
          assert.ok(
            /^\/?wp:/.test(body) || body === 'more' || body === 'nextpage',
            `${path.relative(PKG, file)}: <!--${body.slice(0, 50)}-->`
          )
        }
      }
    }
    assert.ok(scanned > 20, `only ${scanned} files scanned`)
  })

  test(`${base}: the 404 band is the source's copy and Subscribe link, not the form (defect 9)`, () => {
    // The error page wears the site's footer part; on it alone the form is drawn as the Subscribe link.
    const t = read(`${base}/wp-ja-kinetic/templates/404.html`)
    has(t, /"slug":"footer"[^>]*"className":"tracy-footer tracy-404-footer"/)
    const links = read(`${base}/wp-ja-kinetic/inc/page-links.php`)
    has(links, /add_filter\( 'render_block_acymailing\/subscription-form', 'wp_ja_kinetic_404_news_link'/)
    has(links, /is_404\(\)/)
    has(links, /tracy-footer__news-btn" href="' \. esc_url\( home_url\( '\/#kinetic-newsletter' \) \)/)
    has(
      read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic.css`),
      /\.tracy-404-footer \.tracy-footer__news-intro \{\s*flex: 0 1 auto/
    )
  })
}

test('post-seed removes the stored developer comments and only the empty duplicate category', {
  skip: DOSSIER.skip
}, () => {
  const php = readFileSync(path.join(DOSSIER.dir, 'post-seed.php'), 'utf8')
  has(php, /\(\?!\\s\*\\\/\?wp:\)\(\?!\\s\*more/)
  has(php, /0 === \(int\) \$dup->count && ! \$used && 0 === \(int\) \$twin->count/)
  has(php, /update_option\( 'default_category'/)
})

// ── the drawer and the mega panel, as the checkpoint's open-menu capture reads them ─────────────────────
const extraPhp = read('overlays/wp-ja-kinetic/inc/extra.php')
const NAV_STUBS = String.raw`
$GLOBALS['is404'] = false;
function is_404() { return $GLOBALS['is404']; }
function esc_url($u) { return $u; }
function home_url($p = '') { return 'http://site.test' . $p; }
function esc_html($t) { return htmlspecialchars($t, ENT_QUOTES); }
function esc_html__($t, $d = '') { return esc_html($t); }
`
const NAV_CODE = `${phpFunction(extraPhp, 'wp_ja_kinetic_drawer_cta_arrow')}
${phpFunction(extraPhp, 'wp_ja_kinetic_404_drawer_row')}
function run_case($c) {
  $GLOBALS['is404'] = $c['is404'];
  $block = ['blockName' => $c['name'], 'attrs' => $c['attrs']];
  return ['arrow' => wp_ja_kinetic_drawer_cta_arrow($c['html'], $block), 'row' => wp_ja_kinetic_404_drawer_row($c['html'], $block)];
}`
const LINK = (cls) =>
  `<li class="wp-block-navigation-item ${cls}"><a class="wp-block-navigation-item__content" href="/x"><span class="wp-block-navigation-item__label">Start free</span></a></li>`

test('the drawer CTA gets one real arrow, the 404 drawer none, and only the CTA is touched (open-menu parity)', {
  skip: PHP_SKIP
}, async () => {
  const cases = [
    {
      is404: false,
      name: 'core/navigation-link',
      attrs: { className: 'tracy-nav__cta' },
      html: LINK('tracy-nav__cta')
    },
    {
      is404: true,
      name: 'core/navigation-link',
      attrs: { className: 'tracy-nav__cta' },
      html: LINK('tracy-nav__cta')
    },
    {
      is404: false,
      name: 'core/navigation-link',
      attrs: { className: 'tracy-nav__signin' },
      html: LINK('tracy-nav__signin')
    },
    {
      is404: false,
      name: 'core/navigation-link',
      attrs: { className: 'a tracy-nav__cta b' },
      html: LINK('tracy-nav__cta')
    },
    { is404: false, name: 'core/navigation-link', attrs: {}, html: LINK('x') },
    {
      is404: false,
      name: 'core/paragraph',
      attrs: { className: 'tracy-nav__cta' },
      html: '<p>Start free</p>'
    },
    {
      is404: false,
      name: 'core/navigation-link',
      attrs: { className: 'tracy-nav__cta' },
      html: '<li><a>no span</a></li>'
    },
    {
      is404: false,
      name: 'core/navigation-link',
      attrs: { className: 'tracy-nav__cta-not' },
      html: LINK('x')
    }
  ]
  const out = await runPhp(NAV_STUBS, NAV_CODE, cases)
  const arrows = (html) => (html.match(/<svg class="hx-cta-arrow"/g) ?? []).length
  assert.equal(arrows(out[0].arrow), 1)
  assert.match(out[0].arrow, /<\/span><svg class="hx-cta-arrow"[^>]*aria-hidden="true">.*<\/svg><\/a>/)
  assert.equal(out[1].arrow, cases[1].html, 'the source error page has no arrow')
  assert.equal(out[2].arrow, cases[2].html)
  assert.equal(arrows(out[3].arrow), 1, 'one class among several')
  assert.equal(out[4].arrow, cases[4].html, 'no className')
  assert.equal(out[5].arrow, cases[5].html, 'not a navigation link')
  assert.equal(out[6].arrow, cases[6].html, 'no label span to follow')
  assert.equal(out[7].arrow, cases[7].html, 'a class that only starts with the name')
})

test("the 404 drawer swaps only the Pages drill for the source's Search row (open-menu parity)", {
  skip: PHP_SKIP
}, async () => {
  const sub =
    '<li class="wp-block-navigation-item has-child"><a>Pages</a><ul class="wp-block-navigation__submenu-container"></ul></li>'
  const cases = [
    { is404: true, name: 'core/navigation-submenu', attrs: { label: 'Pages' }, html: sub },
    { is404: true, name: 'core/navigation-submenu', attrs: { label: ' Pages ' }, html: sub },
    { is404: false, name: 'core/navigation-submenu', attrs: { label: 'Pages' }, html: sub },
    { is404: true, name: 'core/navigation-submenu', attrs: { label: 'Product' }, html: sub },
    { is404: true, name: 'core/navigation-submenu', attrs: {}, html: sub },
    { is404: true, name: 'core/navigation-link', attrs: { label: 'Pages' }, html: sub }
  ]
  const out = await runPhp(NAV_STUBS, NAV_CODE, cases)
  for (const i of [0, 1]) {
    assert.match(
      out[i].row,
      /^<li class="wp-block-navigation-item wp-block-navigation-link"><a class="wp-block-navigation-item__content" href="http:\/\/site\.test\/pages\/search\/"><span class="wp-block-navigation-item__label">Search<\/span><\/a><\/li>$/
    )
  }
  for (const i of [2, 3, 4, 5]) assert.equal(out[i].row, sub, `case ${i} is left alone`)
})

for (const base of BASES) {
  const main = read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic.css`)

  test(`${base}: the mega panel has a hover bridge, and its title is the heading with no padding in chrome-text`, () => {
    has(
      main,
      /\.tracy-mega__panel::before \{\s*content: '';\s*position: absolute;\s*inset-inline: 0;\s*top: -30px;\s*height: 30px/
    )
    const title = main.match(/\.tracy-mega__title \{([^}]*)\}/)
    assert.ok(title)
    has(title[1], /margin: 0 0 24px/)
    has(title[1], /padding: 0;/)
    has(title[1], /color: var\(--chrome-text\)/)
  })

  test(`${base}: the drawer head and the sign-in row carry their 18px as height and margin, not as padding of the item that holds only their words`, () => {
    const head = main.match(/\.tracy-header__menu \.tracy-nav \.tracy-nav__drawer-head \{([^}]*)\}/)
    has(head[1], /min-height: 68px/)
    has(head[1], /padding: 0 20px/)
    const signin = main.match(/\.wp-block-navigation__container > \.tracy-nav__signin \{([^}]*)\}/)
    hasNot(signin[1], /padding-top/)
    has(main, /\.tracy-nav__signin > \.wp-block-navigation-item__content \{[^}]*margin-top: 18px/)
    hasNot(
      main,
      /\.tracy-nav__cta > \.wp-block-navigation-item__content::after/,
      'the arrow is a real svg, not a mask'
    )
  })
}

// ── L17: the Contact page's mailboxes are the site's, never the theme's ────────────────────────────────────
// Measured 05/10/2026 (ledger L17 of the Apply audit): a site built from `ja-kinetic` and filled by Apply still offered
// the demo company's three mailboxes (`support@`, `sales@`, `security@kinetic.dev`) on its Contact page. They were
// literals of the block's render.php, which no content write reaches, and the form mailed `admin_email`, which on a
// site Tracy built is Tracy's mailbox or the quickstart's, never the owner's (ledger L05).
const DEMO = /kinetic(?:labs)?\.dev/i
const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
/** The public contact mailbox the site was given. */
const PUBLIC = 'hello@bakery.test'
/** The recipient Apply sets (the typed mailbox, else the account of the person who pressed Apply): never shown. */
const OWNER = 'owner@customer.test'
/** What a site Tracy built has as `admin_email`. */
const ADMIN = 'tracy-agent@tracy.ai'
const CONTACT_FORM = 'blocks/kinetic-contact-form/render.php'

/** The file that answers both addresses, as PHP after its opening tag; empty where it does not exist. */
function contactInc(base) {
  const rel = `${base}/wp-ja-kinetic/inc/contact.php`
  return existsSync(path.join(PKG, rel)) ? read(rel).replace(/^<\?php/, '') : ''
}
const CONTACT_STUBS = String.raw`
define('ABSPATH', '/');
$GLOBALS['options'] = []; $GLOBALS['filters'] = []; $GLOBALS['mails'] = []; $GLOBALS['state'] = []; $GLOBALS['notes'] = [];
set_error_handler(static function ($no, $str, $file, $line) { $GLOBALS['notes'][] = $str . ' @' . $line; return true; });
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['options']) ? $GLOBALS['options'][$k] : $d; }
function is_email($e) { return is_string($e) && filter_var($e, FILTER_VALIDATE_EMAIL) ? $e : false; }
function apply_filters($hook, $value) { return array_key_exists($hook, $GLOBALS['filters']) ? $GLOBALS['filters'][$hook] : $value; }
function esc_html($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_attr($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_textarea($t) { return htmlspecialchars((string) $t, ENT_QUOTES); }
function esc_url($u) { return htmlspecialchars((string) $u, ENT_QUOTES); }
function get_permalink() { return 'http://site.test/contact/'; }
function get_the_ID() { return 7; }
function get_post_field($field) { return 'contact'; }
function get_bloginfo($key) { return 'name' === $key ? (string) ($GLOBALS['options']['blogname'] ?? '') : ''; }
function wp_specialchars_decode($t, $q = 0) { return $t; }
function wp_nonce_field($action, $name) { echo '<input type="hidden" name="' . $name . '" value="nonce">'; }
function wp_ja_kinetic_auth_state(?array $set = null): array { if (null !== $set) { $GLOBALS['state'] = $set; } return $GLOBALS['state']; }
function wp_ja_kinetic_notice($type, $message) { return '<div class="notice">' . $message . '</div>'; }
function is_page_template($t) { return 'page-contact' === $t; }
function wp_verify_nonce($nonce, $action) { return 1; }
function wp_unslash($v) { return $v; }
function sanitize_text_field($v) { return trim(strip_tags((string) $v)); }
function sanitize_email($v) { return trim((string) $v); }
function sanitize_textarea_field($v) { return trim((string) $v); }
function wp_mail($to, $subject, $body, $headers = []) { $GLOBALS['mails'][] = ['to' => $to, 'headers' => $headers]; return true; }
`
const contactCode = (base) => `${contactInc(base)}
${phpFunction(read(`${base}/wp-ja-kinetic/inc/extra.php`), 'wp_ja_kinetic_contact_submit')}
function run_case($c) {
  $GLOBALS['options'] = $c['options'] ?? []; $GLOBALS['filters'] = $c['filters'] ?? [];
  $GLOBALS['mails'] = []; $GLOBALS['state'] = []; $GLOBALS['notes'] = [];
  if (isset($c['post'])) {
    $_POST = $c['post'];
    wp_ja_kinetic_contact_submit();
    return ['mails' => $GLOBALS['mails'], 'state' => $GLOBALS['state'], 'notes' => $GLOBALS['notes']];
  }
  ob_start();
  eval('?>' . $c['src']);
  return ['html' => ob_get_clean(), 'notes' => $GLOBALS['notes']];
}`
/** Every address a page prints, once each. */
const addressesIn = (html) => [...new Set(html.match(ADDRESS) ?? [])]

for (const base of BASES) {
  test(`${base}: the Contact page shows no mailbox the site did not give, and the one it gave (L17)`, {
    skip: PHP_SKIP
  }, async () => {
    const src = read(`${base}/wp-ja-kinetic/${CONTACT_FORM}`)
    const site = { blogname: 'Bakery', admin_email: ADMIN }
    const [none, recipientOnly, nested, flat, invalid, malformed] = await runPhp(
      CONTACT_STUBS,
      contactCode(base),
      [
        { src, options: site },
        { src, options: { ...site, tracy_contact_to: OWNER } },
        {
          src,
          options: { ...site, tracy_contact_to: OWNER, tracy_site_identity: { contact: { email: PUBLIC } } }
        },
        { src, options: { ...site, tracy_site_identity: { 'contact.email': PUBLIC } } },
        { src, options: { ...site, tracy_site_identity: { contact: { email: 'not an address' } } } },
        { src, options: { ...site, tracy_site_identity: { contact: PUBLIC } } }
      ]
    )
    for (const [label, out] of Object.entries({ none, recipientOnly, nested, flat, invalid, malformed })) {
      assert.deepEqual(out.notes, [], `${label}: PHP raised nothing`)
      hasNot(out.html, DEMO, `${label}: a demo mailbox is on the page`)
      hasNot(out.html, /Kinetic/, `${label}: the demo company's name is in the markup`)
      has(out.html, /<form id="contact-form"/, `${label}: the form is still there`)
      has(out.html, /itemprop="name">Bakery</, `${label}: the contact is the site`)
    }
    for (const [label, out] of Object.entries({ none, recipientOnly, invalid, malformed })) {
      assert.deepEqual(addressesIn(out.html), [], `${label}: no address at all`)
      hasNot(out.html, /mailto:|hx-method/, `${label}: no contact method`)
      hasNot(out.html, /kinetic-contact__info/, `${label}: no empty info column`)
      has(out.html, /kinetic-contact__grid--form-only/, `${label}: the form stands alone`)
    }
    for (const [label, out] of Object.entries({ nested, flat })) {
      assert.deepEqual(addressesIn(out.html), [PUBLIC], `${label}: the given mailbox and nothing else`)
      has(
        out.html,
        /<a href="mailto:hello@bakery\.test" class="hx-method__email">hello@bakery\.test<\/a>/,
        label
      )
      assert.equal((out.html.match(/class="hx-method"/g) ?? []).length, 1, `${label}: one method`)
    }
  })

  test(`${base}: the Contact form mails the recipient the site was given, else the public mailbox, else admin_email (L17)`, {
    skip: PHP_SKIP
  }, async () => {
    const post = {
      wp_ja_kinetic_contact: '1',
      wp_ja_kinetic_nonce: 'nonce',
      wp_ja_kinetic_contact_name: 'Ana',
      wp_ja_kinetic_contact_email: 'ana@visitor.test',
      wp_ja_kinetic_contact_message: 'Do you bake on Sundays?'
    }
    const site = { blogname: 'Bakery', admin_email: ADMIN }
    const identity = { contact: { email: PUBLIC } }
    const [given, publicOnly, badRecipient, filtered, nobody, badAdmin, noAdmin] = await runPhp(
      CONTACT_STUBS,
      contactCode(base),
      [
        { post, options: { ...site, tracy_contact_to: OWNER, tracy_site_identity: identity } },
        { post, options: { ...site, tracy_site_identity: identity } },
        { post, options: { ...site, tracy_contact_to: 'not-an-address', tracy_site_identity: identity } },
        { post, options: site, filters: { tracy_contact_to: 'desk@customer.test' } },
        { post, options: site },
        { post, options: { blogname: 'Bakery', admin_email: 'not-an-address' } },
        { post, options: { blogname: 'Bakery' } }
      ]
    )
    const to = (out) => out.mails.map((m) => m.to)
    for (const out of [given, publicOnly, badRecipient, filtered, nobody, badAdmin, noAdmin])
      assert.deepEqual(out.notes, [])
    assert.deepEqual(to(given), [OWNER], 'the recipient wins over the public mailbox and admin_email')
    assert.deepEqual(to(publicOnly), [PUBLIC], 'no recipient: the public mailbox the site shows')
    assert.deepEqual(to(badRecipient), [PUBLIC], 'a recipient that is no address is no recipient')
    assert.deepEqual(to(filtered), ['desk@customer.test'], 'the tracy_contact_to filter names one')
    assert.deepEqual(to(nobody), [ADMIN], 'neither option: the administrator, never a failure')
    assert.ok(nobody.state.contact_success && !nobody.state.contact_error)
    assert.deepEqual(to(badAdmin), [], 'an invalid admin_email: no send')
    assert.ok(badAdmin.state.contact_error, 'and the visitor is told it was not sent')
    assert.ok(!badAdmin.state.contact_success)
    assert.deepEqual(to(noAdmin), [], 'no admin_email at all: no send')
    assert.ok(noAdmin.state.contact_error)
    assert.ok(given.state.contact_success)
  })

  test(`${base}: the block holds no mailbox literal and the theme loads the file that answers them`, () => {
    assert.deepEqual(read(`${base}/wp-ja-kinetic/${CONTACT_FORM}`).match(ADDRESS) ?? [], [])
    has(read(`${base}/wp-ja-kinetic/inc/extra.php`), /require get_theme_file_path\( 'inc\/contact\.php' \);/)
    const sections = read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic-sections.css`)
    has(
      sections,
      /body\.item-227 \.kinetic-contact__grid--form-only \{/,
      'the lone form has its own column rule'
    )
  })
}

test('the theme declares 1.1.19', () => {
  const cfg = JSON.parse(read('overlays/wp-ja-kinetic/theme.config.json'))
  assert.equal(cfg.version, '1.1.19')
  has(read('src/wp-ja-kinetic/style.css'), /Version:\s*1\.1\.19/)
})

// 1.1.19 (after dot 3, 20/10/2026): the Integrations marks are uploaded SVG pictures stroked in lime. As an <img> no
// worn system could recolour them, and the client-side preview has no server-side "worn" signal, so the theme
// inlines them on every page view and the stylesheet colours them; unworn, lime (olive through the same filter on the
// light page), so nothing changes.
test('the integration marks are inline on every page view and read the accent role', () => {
  for (const base of ['overlays', 'src']) {
    const php = read(`${base}/wp-ja-kinetic/inc/extra.php`)
    assert.doesNotMatch(
      php,
      /wp_ja_kinetic_wears_design_system/,
      'the inline mark is not gated on a worn system'
    )
    has(php, /add_filter\( 'render_block', 'wp_ja_kinetic_clients_mark_inline', 11, 2 \);/)
    const sections = read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic-sections.css`)
    has(
      sections,
      /\.acm-clients \.acm-clients-mark \.acm-clients-mark-svg \{[^}]*color: var\(--ds-c-accent-text, #A3E635\);/,
      "unworn, the inline mark is the pictures' own lime"
    )
    has(
      sections,
      /html:not\(\.t4-dark\) body\.item-219 \.acm-clients\.style-2 \.acm-clients-mark \.acm-clients-mark-svg \{[^}]*filter: var\(--ds-c-accent-text, brightness\(0\.42\) saturate\(1\.3\)\);/,
      'the light page keeps the <img> olive filter unworn and drops it under a system'
    )
  }
})

// 1.1.18 (dot 3, 19/10/2026): the probe v10 fixes the slot contract carried as patches are the theme's own reads,
// each falling back to the template's value, so with no system worn nothing changes.
test('the dark side reads the roles the slot contract used to patch in', () => {
  for (const base of ['overlays', 'src']) {
    const sections = read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic-sections.css`)
    has(
      sections,
      /body\.item-219 \.acm-cta\.cta-bar \.hx-section \{[^}]*background: var\(--ds-c-bg, #0A0D0C\);/,
      'the Integrations call bar section is level with the page on the dark side'
    )
    has(
      sections,
      /body\.item-222 \.acm-faq-support \.hx-sup-section \{[^}]*background: var\(--ds-c-surface-warm, #161B18\) !important;/,
      'the FAQ support band is the quiet raised surface'
    )
    has(
      sections,
      /html\.t4-dark body\.item-225 \.acm-features-intro \.hx-section \{[^}]*var\(--ds-c-surface-warm, #161B18\) !important;/,
      'the About values band is the quiet raised surface'
    )
    has(
      sections,
      /body\.item-225 \.acm-incident-timeline \.hx-inc-time \{[^}]*background-color: transparent !important;[^}]*box-shadow: none !important;/,
      'the About journey labels carry no ground or ring'
    )
  }
})

// 1.1.9 (T29) — the brand is the customer's: Site Logo pairs beside the Site Title, no inline Kinetic glyph or name.
test('header and footer brand are Site Logo pairs and the Site Title; the copyright names the site', () => {
  for (const base of ['overlays', 'src']) {
    const header = read(`${base}/wp-ja-kinetic/parts/header.html`)
    const footer = read(`${base}/wp-ja-kinetic/parts/footer.html`)
    for (const cls of [
      'tracy-logo tracy-logo--light tracy-logo-bare',
      'tracy-logo tracy-logo--dark tracy-logo-bare'
    ])
      assert.ok(header.includes(`"className":"${cls}"`), `${base} header: ${cls}`)
    for (const cls of [
      'tracy-footer__logo tracy-footer__logo--light tracy-logo-bare',
      'tracy-footer__logo tracy-footer__logo--dark tracy-logo-bare'
    ])
      assert.ok(footer.includes(`"className":"${cls}"`), `${base} footer: ${cls}`)
    assert.ok(footer.includes('<!-- wp:site-title {"level":0,"className":"tracy-brand"} /-->'))
    assert.ok(!header.includes('aria-label="Home"><svg'), 'the inline glyph is gone from the header')
    assert.ok(!footer.includes('>Kinetic</span>'), 'the demo word is gone from the footer')
    assert.ok(footer.includes('© {year} {site.title}. All rights reserved.'))
  }
})

// 1.1.6 — behaviour and layout differences from the source, measured on the local source stand.
{
  const css = read('overlays/wp-ja-kinetic/assets/css/wp-ja-kinetic.css')
  const drawer = read('overlays/wp-ja-kinetic/assets/js/wp-ja-kinetic-drawer.js')

  test('the header bar sticks, except on phones and the 404 page', () => {
    has(css, /\.tracy-header \{\s*position: sticky;\s*top: 0;/)
    has(css, /@media \(max-width: 575\.98px\) \{\s*\.tracy-header \{\s*position: relative;/)
    has(css, /body\.error404 \.tracy-header \{\s*position: relative;/)
  })

  test('the open drawer dims the page beside the panel', () => {
    has(css, /box-shadow: 0 0 0 100vmax rgba\(0, 0, 0, 0\.55\)/)
    has(drawer, /root\.inert = !isOpen/)
  })

  test('the newsletter field shows the source focus: outline and ring', () => {
    has(
      css,
      /outline: 2px solid var\(--primary\);\s*outline-offset: 3px;[^}]*box-shadow: 0 0 0 3px var\(--ds-c-focus-ring, rgba\(77, 124, 15, 0\.25\)\)/
    )
  })

  test('the back-to-top mark is the solid chevron, drawn by mask', () => {
    has(css, /\.tracy-back-to-top::before \{/)
    has(css, /\.tracy-back-to-top svg \{\s*display: none;/)
  })
}

// 1.1.7 — differences from the source found by the sweep on the released 1.1.6.
test('the footer column titles keep one line on a phone, the columns grow to them', () => {
  const css = read('overlays/wp-ja-kinetic/assets/css/wp-ja-kinetic.css')
  has(
    css,
    /@media \(max-width: 575\.98px\) \{[^@]*?\.tracy-footer__title,\s*\.tracy-footer__columns \.wp-block-navigation-item__content,\s*\.tracy-footer__columns \.tracy-footer__links a \{\s*white-space: nowrap;/
  )
  has(
    css,
    /body \.tracy-footer__columns \{\s*grid-template-columns: repeat\(3, minmax\(min-content, 1fr\)\);/
  )
})

// 1.1.9: every tab names the site — the page's own title (the model may rewrite it), then the site name.
test('the document title appends the site name to every page title', () => {
  for (const base of ['overlays', 'src']) {
    const php = read(`${base}/wp-ja-kinetic/inc/extra.php`)
    assert.match(
      php,
      /\$own \. ' ' \. apply_filters\( 'document_title_separator', '–' \) \. ' ' \. get_bloginfo\( 'name' \)/
    )
    assert.doesNotMatch(php, /unset\( \$parts\['site'\]/)
  }
})

// 1.1.19 (after dot 3, 20/10/2026): the hero terminal, the KineticQL code panel and the bento telemetry chart are
// raster pictures drawn in the template's lime, which no worn system can recolour. Each one gets a drawn twin printed
// hidden after the picture; the slot contract shows it (and hides the picture) only while a system is worn.
test('the three lime demo pictures carry a hidden twin whose lime reads the accent-on-ink role', () => {
  const twins = ['hero-terminal-panel-terminal', 'kineticql-code-panel-terminal', 'bento-telemetry-chart']
  for (const base of ['overlays', 'src']) {
    const php = read(`${base}/wp-ja-kinetic/inc/extra.php`)
    has(php, /add_filter\( 'render_block', 'wp_ja_kinetic_picture_twin', 12, 2 \);/)
    for (const name of twins) {
      has(php, new RegExp(`'${name}'`))
      const svg = read(`${base}/wp-ja-kinetic/assets/twins/${name}.svg`)
      has(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/)
      has(svg, /var\(--ds-c-accent-on-ink,#A3E635\)/, 'the lime marks read the accent on a dark band')
      // every lime of the twin goes through the role variable: no literal lime outside a var() fallback
      assert.equal(svg.replace(/var\(--ds-c-accent-on-ink,#A3E635\)/g, '').match(/#A3E635/gi), null)
      assert.doesNotMatch(svg, /<(script|image|foreignObject)\b|\son[a-z]+=/i, 'a plain drawing')
    }
    has(read(`${base}/wp-ja-kinetic/assets/css/wp-ja-kinetic-sections.css`), /\.hx-twin \{\s*display: none;/)
  }
})
