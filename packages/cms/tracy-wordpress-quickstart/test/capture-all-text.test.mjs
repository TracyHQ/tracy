/**
 * Spec #37 (issue #43): a WordPress capture takes every visible text of a page, not only the named plain-text
 * blocks. The fixture is a made-up tea room page: named and unnamed headings, paragraphs with inline markup, buttons,
 * block lists and an old-style list, a table, a quote with its cite, a link inside a sentence.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveProfile, pageSlots } from '../scripts/capture-contract.mjs'

const wp = (type, inner, attrs = '') =>
  `<!-- wp:${type}${attrs ? ` ${attrs}` : ''} -->\n${inner}\n<!-- /wp:${type} -->`
const named = (type, name, inner, extra = '') => wp(type, inner, `{"metadata":{"name":"${name}"}${extra}}`)

const PAGE = [
  wp('heading', '<h1 class="wp-block-heading">Larkspur <br>Tea Room</h1>', '{"level":1}'),
  named('paragraph', 'intro', '<p>Open daily, <strong>all year</strong>.</p>'),
  wp(
    'paragraph',
    '<p>Scones are baked at 7am. <a href="/menu/">See the menu</a> or <a href="/book/">book a table</a>.</p>'
  ),
  wp('paragraph', '<p>Scones are baked at 7am.</p>'),
  named('paragraph', 'intro', '<p>A second block of the same name</p>'),
  wp(
    'buttons',
    wp(
      'button',
      '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/book/">Book now</a></div>'
    )
  ),
  named(
    'button',
    'hero.cta',
    '<div class="wp-block-button"><a class="wp-block-button__link" href="/go/">Order</a></div>',
    ',"url":"/go/"'
  ),
  wp('list', wp('list-item', '<li>Pot of tea</li>') + '\n' + wp('list-item', '<li>Cream scone</li>')),
  wp('list', '<ul class="wp-block-list"><li>Soup of the day</li><li>Rye toast</li></ul>'),
  wp('quote', wp('paragraph', '<p>The best scones in the valley.</p>') + '\n<cite>Mira Holt</cite>', ''),
  wp(
    'table',
    '<figure class="wp-block-table"><table><tbody><tr><td>Mon</td><td>9 to 5</td></tr></tbody></table></figure>'
  ),
  '<!-- wp:image {"id":4} -->\n<figure><img src="/a.png" alt="Tea pot"/></figure>\n<!-- /wp:image -->',
  wp('paragraph', '<p>&nbsp;</p>'),
  '<!-- wp:navigation-link {"label":"Visit us","url":"/visit/","kind":"custom"} /-->'
].join('\n')

const all = (content = PAGE) => pageSlots({ content, entityKey: 'page-home', prefix: 'home', allText: true })
const byKey = (slots) => Object.fromEntries(slots.map((s) => [s.key, s]))

test('without the flag the capture is the one every released profile was made with', () => {
  const { slots } = pageSlots({ content: PAGE, entityKey: 'page-home', prefix: 'home' })
  assert.deepEqual(
    slots.map((s) => s.key),
    ['home.hero.cta', 'home.hero.cta.url']
  )
})

test('every visible text of the page is a slot', () => {
  const { slots } = all()
  const text = slots.filter((s) => s.type === 'text').map((s) => s.sample)
  assert.deepEqual(text, [
    'Larkspur Tea Room',
    'Open daily, all year.',
    'Scones are baked at 7am. See the menu or book a table.',
    'Scones are baked at 7am.',
    'A second block of the same name',
    'Book now',
    'Order',
    'Pot of tea',
    'Cream scone',
    'Soup of the day',
    'Rye toast',
    'Mira Holt',
    'The best scones in the valley.',
    'Mon',
    '9 to 5',
    'Visit us'
  ])
})

test('a named first block keeps its name key and target; the rest are addressed by position', () => {
  const s = byKey(all().slots)
  assert.deepEqual(s['home.intro'].target, { block: 'intro', attr: 'content' })
  assert.equal(s['home.intro'].sample, 'Open daily, all year.')
  assert.deepEqual(s['home.heading.1'].target, { blockType: 'heading', occurrence: 1, attr: 'content' })
  assert.deepEqual(s['home.paragraph.3'].target, { blockType: 'paragraph', occurrence: 3, attr: 'content' })
  assert.equal(s['home.paragraph.3'].sample, 'Scones are baked at 7am.')
  assert.equal(
    s['home.paragraph.4'].sample,
    'A second block of the same name',
    'a repeated name is positional'
  )
  assert.deepEqual(s['home.button.1'].target, { blockType: 'button', occurrence: 1, attr: 'content' })
  assert.deepEqual(s['home.button.1.url'].target, { blockType: 'button', occurrence: 1, attr: 'url' })
  assert.equal(s['home.button.1.url'].sample, '/book/')
  assert.equal(s['home.hero.cta.url'].sample, '/go/')
})

test('a link inside a sentence is a url slot beside its text, one per link', () => {
  const s = byKey(all().slots)
  assert.equal(s['home.paragraph.2.link.1'].sample, '/menu/')
  assert.equal(s['home.paragraph.2.link.2'].sample, '/book/')
  assert.deepEqual(s['home.paragraph.2.link.2'].target, {
    blockType: 'paragraph',
    occurrence: 2,
    attr: 'url',
    link: 2
  })
})

test('list items, old-style list items, table cells, cites and navigation labels each have a slot', () => {
  const s = byKey(all().slots)
  assert.equal(s['home.list-item.1'].sample, 'Pot of tea')
  assert.equal(s['home.list.2.1'].sample, 'Soup of the day')
  assert.equal(s['home.list.2.2'].sample, 'Rye toast')
  assert.equal(s['home.quote.1.cite'].sample, 'Mira Holt')
  assert.equal(s['home.table.1.1'].sample, 'Mon')
  assert.equal(s['home.table.1.2'].sample, '9 to 5')
  assert.deepEqual(s['home.navigation-link.1'].target, {
    blockType: 'navigation-link',
    occurrence: 1,
    attr: 'label'
  })
  assert.equal(s['home.navigation-link.1.url'].sample, '/visit/')
})

test('nothing is invented: pictures and empty paragraphs make no text slot, keys never repeat', () => {
  const { slots } = all()
  assert.ok(!slots.some((s) => /Tea pot|a\.png/.test(s.sample)))
  assert.equal(new Set(slots.map((s) => s.key)).size, slots.length)
  for (const slot of slots) assert.ok(slot.maxCharacters >= 80 && slot.sample.trim() !== '')
})

test('the capture is deterministic', () => {
  assert.deepEqual(all(), all())
})

// ── through a whole profile ──

const q = (v) =>
  v === null ? 'NULL' : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
const table = (name, columns, rows) =>
  `CREATE TABLE \`tr_${name}\` (\n${columns.map((c) => `  \`${c}\` text`).join(',\n')}\n) ENGINE=InnoDB;\nINSERT INTO \`tr_${name}\` VALUES ${rows.map((r) => `(${r.map(q).join(',')})`).join(',')};\n`
const SQL =
  table(
    'options',
    ['option_id', 'option_name', 'option_value'],
    [
      [1, 'stylesheet', 'wp-demo'],
      [2, 'template', 'wp-demo'],
      [3, 'blogname', 'Larkspur'],
      [4, 'blogdescription', 'Tea']
    ]
  ) +
  table(
    'term_taxonomy',
    ['term_taxonomy_id', 'term_id', 'taxonomy', 'description'],
    [[1, 1, 'category', '']]
  ) +
  table(
    'posts',
    ['ID', 'post_content', 'post_title', 'post_status', 'post_name', 'post_type', 'post_parent'],
    [[10, PAGE, 'Home', 'publish', 'home', 'page', 0]]
  )
const RELEASE = {
  version: '1.0.0',
  prefix: 'tr_',
  wpVersion: '7.1',
  phpVersion: '8.3.1',
  placeholderUrl: 'https://quickstart.invalid',
  theme: { name: 'wp-demo' },
  webroot: { file: 'w.tar.gz', bytes: 1, sha256: 'a'.repeat(64) },
  database: { file: 'd.sql.gz', bytes: 1, sha256: 'b'.repeat(64) }
}
const derive = (options = {}) =>
  deriveProfile({
    sql: SQL,
    release: RELEASE,
    card: { slug: 'ja-demo', version: '1.0.0', tag: 'quickstart/ja-demo/wp7', repo: 'o/r', assets: {} },
    coworkVersion: '0.17.1',
    themeRoots: ['wp-content/themes/wp-demo'],
    ...options
  })

test('a profile made with allText carries every text slot, and the default profile stays as it was', () => {
  const full = derive({ allText: true })
  const plain = derive()
  assert.equal(plain.contentMap.slots.filter((s) => s.entity === 'page-home').length, 2)
  assert.equal(
    full.contentMap.slots.filter((s) => s.entity === 'page-home').length,
    21,
    '16 texts and 5 links'
  )
  assert.equal(full.contentMap.roleVocabularyVersion, 'place-content-roles/2')
})

test('version 3 labels the page links and groups a button with its link', () => {
  const { contentMap } = derive({ allText: true, vocabulary: 'place-content-roles/3' })
  const s = byKey(contentMap.slots)
  assert.equal(contentMap.roleVocabularyVersion, 'place-content-roles/3')
  assert.equal(s['home.paragraph.2.link.1'].role, 'editorial.navigation_url')
  assert.equal(s['home.button.1'].role, 'contact.cta_label')
  assert.equal(s['home.button.1.url'].role, 'contact.cta_url')
  assert.equal(s['home.button.1'].group.id, s['home.button.1.url'].group.id)
  assert.equal(
    contentMap.slots.filter((x) => x.type === 'url' && !x.role).length,
    0,
    'every URL slot has a role (rule R3)'
  )
})

// ── the header and the footer (TracyHQ/tracy#139) ──

const HEADER = [
  '<!-- wp:site-title /-->',
  '<!-- wp:navigation-link {"label":"Menu","url":"/menu/","kind":"custom"} /-->',
  named('paragraph', 'header.note', '<p>Fresh scones every morning</p>')
].join('\n')
const FOOTER = [
  wp('heading', '<h3 class="wp-block-heading">Find us</h3>'),
  wp('paragraph', '<p>2 Orchard Lane, Larkspur</p>')
].join('\n')
/** A dump whose theme stores its header and footer, plus a header of another theme that must not be read. */
const withThemes =
  table(
    'options',
    ['option_id', 'option_name', 'option_value'],
    [
      [1, 'stylesheet', 'wp-demo'],
      [2, 'template', 'wp-demo'],
      [3, 'blogname', 'Larkspur'],
      [4, 'blogdescription', 'Tea']
    ]
  ) +
  table(
    'term_taxonomy',
    ['term_taxonomy_id', 'term_id', 'taxonomy', 'description'],
    [
      [1, 1, 'category', ''],
      [5, 5, 'wp_theme', ''],
      [6, 6, 'wp_theme', '']
    ]
  ) +
  table(
    'terms',
    ['term_id', 'name', 'slug'],
    [
      [5, 'wp-demo', 'wp-demo'],
      [6, 'wp-other', 'wp-other']
    ]
  ) +
  table(
    'term_relationships',
    ['object_id', 'term_taxonomy_id'],
    [
      [20, 5],
      [21, 5],
      [22, 6]
    ]
  ) +
  table(
    'posts',
    ['ID', 'post_content', 'post_title', 'post_status', 'post_name', 'post_type', 'post_parent'],
    [
      [10, PAGE, 'Home', 'publish', 'home', 'page', 0],
      [20, HEADER, 'Header', 'publish', 'header', 'wp_template_part', 0],
      [21, FOOTER, 'Footer', 'publish', 'footer', 'wp_template_part', 0],
      [22, wp('paragraph', '<p>Another theme</p>'), 'Header', 'publish', 'header', 'wp_template_part', 0]
    ]
  )

test('with every text, the header and the footer of the theme are template part entities with their own slots', () => {
  const { contentMap } = deriveProfile({
    sql: withThemes,
    release: RELEASE,
    card: { slug: 'ja-demo', version: '1.0.0', tag: 'quickstart/ja-demo/wp7', repo: 'o/r', assets: {} },
    coworkVersion: '0.17.1',
    themeRoots: ['wp-content/themes/wp-demo'],
    allText: true
  })
  const parts = contentMap.entities.filter((e) => e.kind === 'templatePart')
  assert.deepEqual(parts, [
    { key: 'part-header', kind: 'templatePart', identity: { slug: 'header' } },
    { key: 'part-footer', kind: 'templatePart', identity: { slug: 'footer' } }
  ])
  const s = byKey(contentMap.slots)
  assert.deepEqual(s['part-header.navigation-link.1'].target, {
    blockType: 'navigation-link',
    occurrence: 1,
    attr: 'label'
  })
  assert.equal(s['part-header.navigation-link.1'].sample, 'Menu')
  assert.deepEqual(s['part-header.header.note'].target, { block: 'header.note', attr: 'content' })
  assert.equal(s['part-footer.paragraph.1'].sample, '2 Orchard Lane, Larkspur')
  assert.equal(s['part-footer.heading.1'].entity, 'part-footer')
  assert.ok(!contentMap.slots.some((x) => x.sample === 'Another theme'), "another theme's part is not read")
  // Without every text, a released profile re-captures as it was: no part is added.
  const plain = deriveProfile({
    sql: withThemes,
    release: RELEASE,
    card: { slug: 'ja-demo', version: '1.0.0', tag: 'quickstart/ja-demo/wp7', repo: 'o/r', assets: {} },
    coworkVersion: '0.17.1',
    themeRoots: ['wp-content/themes/wp-demo']
  })
  assert.equal(plain.contentMap.entities.filter((e) => e.kind === 'templatePart').length, 0)
})

test('a list item found by position names its item, so the writer reaches that item', () => {
  const s = byKey(all().slots)
  assert.deepEqual(s['home.list.2.2'].target, {
    blockType: 'list',
    occurrence: 2,
    attr: 'content',
    field: '2'
  })
})
