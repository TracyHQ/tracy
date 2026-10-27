/**
 * W2 — a WordPress body by its blocks (`wp-blocks.mjs`), on the ja-business bodies the replace tests
 * use (`fixtures/replace/wordpress/site.json`) and on the shapes WordPress's own parser allows.
 *
 *   node --test packages/tools/tracy-site-tools/test/wp-blocks.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { blockMarkupProblem } from '../src/host/site-call.mjs'
import {
  applyBlockEdits,
  blocksAt,
  blocksTouched,
  outlineOf,
  queryAttrs,
  revOf,
  topBlocks
} from '../src/host/wp-blocks.mjs'
import { SITE } from './fixtures/replace/fake-wordpress.mjs'

const P = (/** @type {string} */ words) => `<!-- wp:paragraph -->\n<p>${words}</p>\n<!-- /wp:paragraph -->`
const BODY = [
  '<!-- wp:group {"className":"hero"} -->\n<div class="wp-block-group hero"><!-- wp:heading -->\n<h1>Built to last</h1>\n<!-- /wp:heading -->\n\n' +
    P('We build plants.') +
    '</div>\n<!-- /wp:group -->',
  P('Second.'),
  '<!-- wp:spacer {"height":"40px"} /-->',
  P('Last &amp; final.')
].join('\n\n')

test('topBlocks: WordPress’s own top level — a block to its closer, a void block, nested blocks inside their parent', () => {
  const spans = /** @type {any[]} */ (topBlocks(BODY))
  assert.deepEqual(
    spans.map((s) => s.name),
    ['core/group', 'core/paragraph', 'core/spacer', 'core/paragraph']
  )
  assert.ok(BODY.slice(spans[0].start, spans[0].end).endsWith('<!-- /wp:group -->'))
  assert.equal(BODY.slice(spans[2].start, spans[2].end), '<!-- wp:spacer {"height":"40px"} /-->')
  // HTML between blocks is a block of its own (freeform), as parse_blocks makes it.
  assert.deepEqual(
    /** @type {any[]} */ (topBlocks(`<p>classic</p>\n\n${P('x')}`)).map((s) => s.name),
    [null, 'core/paragraph']
  )
  // An opener without its closer has no positions to name.
  assert.equal(topBlocks('<!-- wp:group --><div>'), null)
  assert.equal(topBlocks('<!-- /wp:group -->'), null)
})

test('outlineOf: a row per block with its words, never its markup; every ja-business body has one', () => {
  const rows = /** @type {any[]} */ (outlineOf(BODY))
  assert.deepEqual(rows[0], {
    i: 0,
    block: 'core/group',
    chars: rows[0].chars,
    text: 'Built to last We build plants.'
  })
  assert.equal(rows[3].text, 'Last & final.')
  assert.ok(!JSON.stringify(rows).includes('<!--'))
  for (const post of SITE.posts) {
    if (typeof post.post_content !== 'string' || !post.post_content.includes('<!-- wp:')) continue
    const outline = outlineOf(post.post_content)
    assert.ok(outline !== null && outline.length > 0, `post ${post.ID} has an outline`)
    // The spans cover every block comment: nothing outside a span but whitespace.
    const spans = /** @type {any[]} */ (topBlocks(post.post_content))
    let rest = post.post_content
    for (const s of [...spans].reverse()) rest = rest.slice(0, s.start) + rest.slice(s.end)
    assert.equal(rest.trim(), '', `post ${post.ID}: nothing outside its blocks`)
  }
})

// ── F6: the outline row of a query block says which posts it lists ──────────────────────────────────────

/** A listing block as a theme writes it: a query attribute, and a card template inside. */
const QUERY = (/** @type {Record<string, unknown> | string} */ query, extra = '') =>
  `<!-- wp:query {"queryId":1,${typeof query === 'string' ? query : `"query":${JSON.stringify(query)}`}${extra}} -->\n<div class="wp-block-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->`
const PLAIN_QUERY = {
  perPage: 12,
  pages: 0,
  offset: 0,
  postType: 'post',
  order: 'desc',
  orderBy: 'date',
  inherit: false
}

test('🔒 outlineOf: a query block’s row carries its query — what it lists — so the page needs no block read for it', () => {
  // Before: `{i, block:"core/query", chars, text}` and nothing of what it lists: the model read the whole block
  // (`block:0`, 2.5k characters with the item record) only to learn `postType` and `inherit`.
  const body = [P('Intro.'), QUERY(PLAIN_QUERY), P('Outro.')].join('\n\n')
  const rows = /** @type {any[]} */ (outlineOf(body))
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[1].query, PLAIN_QUERY)
  assert.equal(rows[1].block, 'core/query')
  assert.equal(rows[1].queryMore, undefined, 'nothing was left out')
  // the other rows are what they always were: no key they did not have
  assert.deepEqual(Object.keys(rows[0]), ['i', 'block', 'chars', 'text'])
  assert.deepEqual(Object.keys(rows[2]), ['i', 'block', 'chars', 'text'])
  assert.ok(!JSON.stringify(rows).includes('<!--'), 'still never its markup')
  assert.ok(!JSON.stringify(rows).includes('wp-block-query'), 'nor the block’s own html')
})

test('outlineOf: every top-level query block of the ja-business bodies shows the query its own comment holds', () => {
  let seen = 0
  for (const post of SITE.posts) {
    if (typeof post.post_content !== 'string' || !post.post_content.includes('<!-- wp:query ')) continue
    const body = post.post_content
    const spans = /** @type {any[]} */ (topBlocks(body))
    const rows = /** @type {any[]} */ (outlineOf(body))
    spans.forEach((span, i) => {
      if (span.name !== 'core/query') return
      const opener = /<!-- wp:query (\{.*?\}) -->/.exec(body.slice(span.start, span.end))
      const held = JSON.parse(/** @type {RegExpExecArray} */ (opener)[1]).query
      assert.deepEqual(rows[i].query, held, `post ${post.ID}`)
      assert.ok(JSON.stringify(rows[i]).length < 500, `post ${post.ID}: the row stays a row`)
      seen += 1
    })
  }
  assert.ok(seen >= 2, `the fixtures hold query blocks (${seen})`)
})

test('outlineOf: a query filtered by category, or by a key only one theme knows, says so — the filters come first', () => {
  const filtered = { ...PLAIN_QUERY, taxQuery: { category: [9] } }
  const themed = { ...PLAIN_QUERY, themeCategory: 'blog' }
  const rows = /** @type {any[]} */ (outlineOf([QUERY(filtered), QUERY(themed)].join('\n\n')))
  assert.deepEqual(rows[0].query.taxQuery, { category: [9] })
  assert.deepEqual(Object.keys(rows[0].query).slice(0, 3), ['postType', 'taxQuery', 'inherit'])
  assert.equal(rows[1].query.themeCategory, 'blog', 'a key the row has no name for is still a query key')
})

test('outlineOf: only a core/query block gets a query — not a block whose own attribute is named query, nor a query nested in another block', () => {
  const search = '<!-- wp:search {"label":"Search","query":{"s":"x"}} /-->'
  const nested = `<!-- wp:group -->\n<div class="wp-block-group">${QUERY(PLAIN_QUERY)}</div>\n<!-- /wp:group -->`
  const rows = /** @type {any[]} */ (outlineOf([search, nested].join('\n\n')))
  assert.deepEqual(
    rows.map((r) => r.block),
    ['core/search', 'core/group']
  )
  assert.equal('query' in rows[0], false)
  assert.equal(
    'query' in rows[1],
    false,
    'the outline is the top level: a nested query is read with its block'
  )
  // the `core/` spelling of the name is the same block
  const spelled = /** @type {any[]} */ (outlineOf(QUERY(PLAIN_QUERY).replaceAll('wp:query', 'wp:core/query')))
  assert.deepEqual(spelled[0].query, PLAIN_QUERY)
})

test('outlineOf: no query attribute, an empty one, one that is not an object, or attributes that are not JSON: no key, no throw', () => {
  for (const [name, markup] of /** @type {[string, string][]} */ ([
    ['no attributes', '<!-- wp:query -->\n<div></div>\n<!-- /wp:query -->'],
    ['no query key', QUERY('"perPage":3')],
    ['an empty query', QUERY({})],
    ['a query that is a list', QUERY('"query":[1,2]')],
    ['a query that is text', QUERY('"query":"posts"')],
    ['attributes that are not JSON', '<!-- wp:query {not json} -->\n<div></div>\n<!-- /wp:query -->']
  ])) {
    const rows = /** @type {any[] | null} */ (outlineOf(markup))
    // not JSON attributes are not a block comment at all (`DELIMITER`): the body may have no positions to name
    if (rows === null) continue
    assert.equal('query' in rows[0], false, name)
  }
})

test('outlineOf: a runaway query is cut after the keys that decide what it lists, and says how many keys it left out', () => {
  const huge = {
    ...PLAIN_QUERY,
    taxQuery: { category: [9] },
    exclude: Array.from({ length: 500 }, (_, i) => 1000 + i),
    sticky: ''
  }
  const [row] = /** @type {any[]} */ (outlineOf(QUERY(huge)))
  const shown = JSON.stringify(row.query).length
  assert.ok(shown <= 400, `${shown} characters`)
  // the keys that say which posts come first, whole
  assert.equal(row.query.postType, 'post')
  assert.deepEqual(row.query.taxQuery, { category: [9] })
  assert.equal(row.query.inherit, false)
  assert.equal('exclude' in row.query, false, 'the list that would not fit is left out, not half-shown')
  assert.equal(row.query.sticky, '', 'a small key after it still fits')
  assert.equal(row.queryMore, Object.keys(huge).length - Object.keys(row.query).length)
  assert.ok(row.queryMore >= 1)
  // even filters that are themselves big are kept whole — they are the point
  const wide = { postType: 'post', taxQuery: { category: Array.from({ length: 200 }, (_, i) => i + 1) } }
  const [kept] = /** @type {any[]} */ (outlineOf(QUERY(wide)))
  assert.equal(kept.query.taxQuery.category.length, 200)
})

test('blocksAt: the markup of the named blocks, or the count when one is not there', () => {
  const got = /** @type {any} */ (blocksAt(BODY, [1, 3]))
  assert.equal(got.ok, true)
  assert.deepEqual(
    got.blocks.map((/** @type {any} */ b) => [b.i, b.markup]),
    [
      [1, P('Second.')],
      [3, P('Last &amp; final.')]
    ]
  )
  assert.deepEqual(blocksAt(BODY, [4]), { ok: false, error: 'there is no block 4: the body has 4', count: 4 })
})

test('applyBlockEdits: replace, drop and insert by the positions AS READ; every other byte stays', () => {
  const out = /** @type {any} */ (
    applyBlockEdits(BODY, {
      1: P('Second, rewritten.'),
      2: null,
      '+0': P('First of all.'),
      '+4': P('The end.')
    })
  )
  assert.equal(out.ok, true, out.error)
  assert.deepEqual([out.replaced, out.dropped, out.inserted], [[1], [2], [0, 4]])
  assert.deepEqual(
    /** @type {any[]} */ (outlineOf(out.body)).map((r) => r.text),
    ['First of all.', 'Built to last We build plants.', 'Second, rewritten.', 'Last & final.', 'The end.']
  )
  assert.equal(blockMarkupProblem(out.body), null)
  // The untouched blocks are byte for byte the stored ones.
  assert.ok(out.body.includes(/** @type {any} */ (blocksAt(BODY, [0])).blocks[0].markup))
  assert.ok(out.body.includes(P('Last &amp; final.')))
  // No edit is a no-op body: applying nothing is refused, not written.
  assert.equal(applyBlockEdits(BODY, {}).ok, false)
})

test('applyBlockEdits: a position the body does not have, a key that is not one, and markup that is not whole blocks are refused by name', () => {
  assert.deepEqual(pick(applyBlockEdits(BODY, { 4: P('x') })), {
    ok: false,
    code: 'BAD_PARAMS',
    param: 'blocks.4',
    count: 4
  })
  assert.equal(/** @type {any} */ (applyBlockEdits(BODY, { '+4': P('ok') })).ok, true, '"+count" appends')
  assert.equal(/** @type {any} */ (applyBlockEdits(BODY, { hero: P('x') })).param, 'blocks.hero')
  const half = /** @type {any} */ (applyBlockEdits(BODY, { 0: '<!-- wp:group --><div>no closer</div>' }))
  assert.equal(half.code, 'BLOCK_MARKUP')
  assert.equal(half.param, 'blocks.0')
  assert.equal(/** @type {any} */ (applyBlockEdits(BODY, { 0: 7 })).code, 'BAD_PARAMS')
  // An insert may carry several blocks at once.
  const two = /** @type {any} */ (applyBlockEdits(BODY, { '+1': [P('a'), P('b')] }))
  assert.deepEqual(/** @type {any[]} */ (outlineOf(two.body)).map((r) => r.text).slice(1, 3), ['a', 'b'])
})

/** @param {any} r */
const pick = (r) => ({ ok: r.ok, code: r.code, param: r.param, count: r.count })

const NAMED = [
  '<!-- wp:html {"metadata":{"name":"hero.map"},"align":"wide"} -->\n<iframe src="https://old.example/map"></iframe><p>Visit us</p>\n<!-- /wp:html -->',
  P('Same. Same.'),
  '<!-- wp:spacer /-->'
].join('\n\n')

test('v6 fix M: {find, replace} changes one piece of one block; every other byte stays', () => {
  const out = /** @type {any} */ (
    applyBlockEdits(NAMED, { 0: { find: 'https://old.example/map', replace: 'https://new.example/map' } })
  )
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(out.replaced, [0])
  assert.equal(out.body, NAMED.replace('old.example', 'new.example'))
  assert.equal(blockMarkupProblem(out.body), null)
})

test('v6 fix M: find must stand exactly once in the block, and the result must be whole blocks', () => {
  const none = /** @type {any} */ (applyBlockEdits(NAMED, { 1: { find: 'nowhere', replace: 'x' } }))
  assert.deepEqual([none.code, none.param], ['NOT_FOUND', 'blocks.1'])
  const twice = /** @type {any} */ (applyBlockEdits(NAMED, { 1: { find: 'Same.', replace: 'x' } }))
  assert.deepEqual([twice.code, twice.param], ['AMBIGUOUS', 'blocks.1'])
  const cut = /** @type {any} */ (
    applyBlockEdits(NAMED, { 1: { find: '<!-- /wp:paragraph -->', replace: '' } })
  )
  assert.equal(cut.code, 'BLOCK_MARKUP')
  assert.equal(
    /** @type {any} */ (applyBlockEdits(NAMED, { 1: { find: '', replace: 'x' } })).code,
    'BAD_PARAMS'
  )
  assert.equal(
    /** @type {any} */ (applyBlockEdits(NAMED, { 1: { find: 'Same', replace: 'x', attrs: {} } })).code,
    'BAD_PARAMS'
  )
})

test('v6 fix M: {attrs} merges into the block’s own attributes; null removes a key; nothing else moves', () => {
  // A nested object merges into the stored one instead of replacing it, and nothing else moves.
  const nested = /** @type {any} */ (applyBlockEdits(NAMED, { 0: { attrs: { metadata: { name: 'x' } } } }))
  assert.equal(nested.ok, true, nested.error)
  assert.ok(
    nested.body.startsWith('<!-- wp:html {"metadata":{"name":"x"},"align":"wide"} -->\n<iframe'),
    nested.body.slice(0, 80)
  )
  assert.ok(nested.body.endsWith('<!-- wp:spacer /-->'))
  // `align` and `className` of a block with saved HTML live in its HTML too: refused, never merged (02/10/2026).
  const inHtml = /** @type {any} */ (
    applyBlockEdits(NAMED, { 0: { attrs: { align: null, className: 'map' } } })
  )
  assert.deepEqual([inHtml.code, inHtml.keys], ['ATTRS_IN_HTML', ['align', 'className']])
  // A void block gains attributes and stays void; emptied attributes drop the object.
  const gain = /** @type {any} */ (applyBlockEdits(NAMED, { 2: { attrs: { height: '20px' } } }))
  assert.ok(gain.body.endsWith('<!-- wp:spacer {"height":"20px"} /-->'))
  const empty = /** @type {any} */ (applyBlockEdits(gain.body, { 2: { attrs: { height: null } } }))
  assert.ok(empty.body.endsWith('<!-- wp:spacer /-->'))
  // A value that would end the comment early is refused, not written.
  const bad = /** @type {any} */ (applyBlockEdits(NAMED, { 0: { attrs: { metadata: { name: 'a --> b' } } } }))
  assert.equal(bad.ok, false)
  assert.equal(
    /** @type {any} */ (applyBlockEdits(`<p>classic</p>\n\n${P('x')}`, { 0: { attrs: { a: 1 } } })).code,
    'BLOCK_MARKUP'
  )
})

test('v6 fix M: a key may be the block’s own metadata.name; a name held by none or by two is refused', () => {
  const out = /** @type {any} */ (
    applyBlockEdits(NAMED, { 'hero.map': { find: 'Visit us', replace: 'Find us' } })
  )
  assert.equal(out.ok, true, out.error)
  assert.deepEqual(out.replaced, [0])
  assert.ok(out.body.includes('<p>Find us</p>'))
  assert.equal(/** @type {any} */ (applyBlockEdits(NAMED, { 'no.such': null })).param, 'blocks.no.such')
  const two = `${NAMED}\n\n${NAMED.split('\n\n')[0]}`
  const dup = /** @type {any} */ (applyBlockEdits(two, { 'hero.map': null }))
  assert.equal(dup.ok, false)
  assert.match(dup.error, /2 blocks are named/)
})

// ── the query blocks of a page: what a listing page says it lists (first call of an add) ────────────────

/** A post-query block as a block theme writes it: the attributes JSON, a template, a pager. */
const QUERY_BLOCK = (/** @type {Record<string, unknown>} */ query, /** @type {string} */ inner = '') =>
  `<!-- wp:query ${JSON.stringify({ queryId: 3, query })} -->\n<div class="wp-block-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n<!-- wp:query-pagination -->\n<!-- wp:query-pagination-next /-->\n<!-- /wp:query-pagination -->${inner}\n</div>\n<!-- /wp:query -->`

test('queryAttrs: the attributes of each query block of a body, in order; none is an empty list, not null', () => {
  assert.deepEqual(queryAttrs(BODY), [])
  assert.deepEqual(queryAttrs(''), [])
  const one = /** @type {any[]} */ (
    queryAttrs(`${P('Intro')}\n${QUERY_BLOCK({ postType: 'post', perPage: 12 })}`)
  )
  assert.equal(one.length, 1)
  assert.deepEqual(one[0].query, { postType: 'post', perPage: 12 })
  assert.equal(one[0].queryId, 3)
  // Two queries side by side (a listing and its "more" list) are both reported, in order.
  const two = /** @type {any[]} */ (
    queryAttrs(
      `${QUERY_BLOCK({ postType: 'post', order: 'desc' })}\n${QUERY_BLOCK({ postType: 'post', order: 'asc' })}`
    )
  )
  assert.deepEqual(
    two.map((a) => a.query.order),
    ['desc', 'asc']
  )
  // A query block with no attributes at all is a query with none.
  assert.deepEqual(queryAttrs('<!-- wp:query -->\n<!-- /wp:query -->'), [{}])
  // Inside a group is still one query; the pager and the template are other blocks, not queries.
  const grouped = `<!-- wp:group -->\n<div class="wp-block-group">\n${QUERY_BLOCK({ postType: 'post' })}\n</div>\n<!-- /wp:group -->`
  assert.equal(/** @type {any[]} */ (queryAttrs(grouped)).length, 1)
  assert.deepEqual(queryAttrs(`<!-- wp:query-title {"type":"archive"} /-->`), [])
})

test('queryAttrs: nothing readable — a query inside a query, attributes that are not JSON, comments that do not nest — is null', () => {
  const nested = QUERY_BLOCK({ postType: 'post' }, `\n${QUERY_BLOCK({ postType: 'page' })}`)
  assert.equal(queryAttrs(nested), null)
  // A comment that never closes is no block comment at all: nothing there to read, and nothing wrong.
  assert.deepEqual(queryAttrs('<!-- wp:query {"query":{"postType":"post"}}\n<div>'), [])
  assert.equal(
    queryAttrs('<!-- wp:query {"query":{"postType":"post"} -->\n<!-- /wp:query -->'),
    null,
    'attributes that do not parse as JSON'
  )
  assert.equal(
    queryAttrs('<!-- wp:query {"query":{"postType":"post"}} -->\n<div>'),
    null,
    'an opener with no closer'
  )
  assert.equal(queryAttrs('<!-- /wp:query -->'), null)
  assert.equal(queryAttrs(/** @type {any} */ (null)), null)
})

test('revOf: the first 12 hex characters of the sha256 of the body exactly as received, UTF-8', () => {
  // Expected values from `printf '<text>' | shasum -a 256`, not from the code under test.
  assert.equal(revOf('abc'), 'ba7816bf8f01')
  assert.equal(revOf('Café — “x”'), '1cb24f484c75')
  assert.equal(revOf(''), 'e3b0c44298fc')
  // One character more, one whitespace changed: another rev. Nothing is trimmed or normalised first.
  assert.notEqual(revOf('abc '), revOf('abc'))
  assert.notEqual(revOf(BODY), revOf(BODY.replace('Second.', 'Second!')))
  assert.match(revOf(BODY), /^[0-9a-f]{12}$/)
})

// ── {attrs} on a block whose HTML is saved (E2E before pass, 01/10/2026, Twenty Twenty-Five, WP 7.1.2) ──
//
// A non-void block holds most attributes twice: in its comment and in its saved HTML. Measured in the
// editor: `level` on core/heading and `verticalAlignment` on core/columns made the block INVALID; `url` on
// core/button, `sizeSlug` on core/image and `tagName` on core/group stayed valid and changed nothing the
// visitor sees; `metadata.name` was valid, as expected.

const HEADING =
  '<!-- wp:heading {"level":2} -->\n<h2 class="wp-block-heading">Features</h2>\n<!-- /wp:heading -->'
const COLUMNS =
  '<!-- wp:columns -->\n<div class="wp-block-columns"><!-- wp:column -->\n<div class="wp-block-column">' +
  P('One') +
  '</div>\n<!-- /wp:column --></div>\n<!-- /wp:columns -->'
const BUTTON =
  '<!-- wp:button -->\n<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="/old">Go</a></div>\n<!-- /wp:button -->'
const IMAGE =
  '<!-- wp:image {"id":5,"sizeSlug":"large"} -->\n<figure class="wp-block-image size-large"><img src="/a.jpg" alt="" class="wp-image-5"/></figure>\n<!-- /wp:image -->'
const GROUP = `<!-- wp:group {"layout":{"type":"constrained"}} -->\n<div class="wp-block-group">${P('Inside')}</div>\n<!-- /wp:group -->`
const QUERY_BLOCK_SAVED =
  '<!-- wp:query {"queryId":1,"query":{"perPage":6,"postType":"post"}} -->\n<div class="wp-block-query"><!-- wp:post-title /--></div>\n<!-- /wp:query -->'

{
  const cases = [
    {
      label: 'core/heading level (the editor called it invalid)',
      body: HEADING,
      attrs: { level: 3 },
      keys: ['level']
    },
    {
      label: 'core/columns verticalAlignment (invalid)',
      body: COLUMNS,
      attrs: { verticalAlignment: 'center' },
      keys: ['verticalAlignment']
    },
    {
      label: 'core/button url (the page did not change)',
      body: BUTTON,
      attrs: { url: '/new' },
      keys: ['url']
    },
    {
      label: 'core/image sizeSlug (the page did not change)',
      body: IMAGE,
      attrs: { sizeSlug: 'full' },
      keys: ['sizeSlug']
    },
    {
      label: 'core/group tagName (the page did not change)',
      body: GROUP,
      attrs: { tagName: 'section' },
      keys: ['tagName']
    },
    {
      label: 'a mix: metadata may change, level may not — only level is named',
      body: HEADING,
      attrs: { metadata: { name: 'features' }, level: 3 },
      keys: ['level']
    }
  ]
  for (const { label, body, attrs, keys } of cases)
    test(`{attrs} on a block with saved HTML may not change what its HTML holds too — ATTRS_IN_HTML, naming the key: ${label}`, () => {
      const out = /** @type {any} */ (applyBlockEdits(`${P('Top')}\n\n${body}`, { 1: { attrs } }))

      assert.equal(out.ok, false, label)
      assert.equal(out.code, 'ATTRS_IN_HTML', label)
      assert.equal(out.param, 'blocks.1', label)
      assert.deepEqual(out.keys, keys, label)
      assert.equal(out.block, 1, label)
      for (const key of keys) assert.match(out.error, new RegExp(key), label)
      assert.ok(out.error.length <= 160, label)
    })
}

test('{attrs} on a block with saved HTML: metadata (its name) and lock are the comment’s alone, and are applied', () => {
  const named = /** @type {any} */ (
    applyBlockEdits(HEADING, { 0: { attrs: { metadata: { name: 'features' } } } })
  )
  const locked = /** @type {any} */ (
    applyBlockEdits(GROUP, { 0: { attrs: { lock: { move: true, remove: true } } } })
  )

  assert.equal(named.ok, true, named.error)
  assert.equal(
    named.body,
    '<!-- wp:heading {"level":2,"metadata":{"name":"features"}} -->\n<h2 class="wp-block-heading">Features</h2>\n<!-- /wp:heading -->'
  )
  assert.equal(locked.ok, true, locked.error)
  assert.ok(
    locked.body.startsWith(
      '<!-- wp:group {"layout":{"type":"constrained"},"lock":{"move":true,"remove":true}} -->'
    )
  )
  assert.ok(locked.body.endsWith(`<div class="wp-block-group">${P('Inside')}</div>\n<!-- /wp:group -->`))
})

test('{attrs} on core/query may change query: a query block does not save its query in its HTML', () => {
  const out = /** @type {any} */ (
    applyBlockEdits(QUERY_BLOCK_SAVED, { 0: { attrs: { query: { perPage: 3 } } } })
  )

  assert.equal(out.ok, true, out.error)
  assert.ok(out.body.startsWith('<!-- wp:query {"queryId":1,"query":{"perPage":3,"postType":"post"}} -->'))
  // Any other key of a query block is held by the same rule as every block with saved HTML.
  assert.equal(
    /** @type {any} */ (applyBlockEdits(QUERY_BLOCK_SAVED, { 0: { attrs: { queryId: 2 } } })).code,
    'ATTRS_IN_HTML'
  )
})

test('{attrs} on a void block (<!-- wp:x /-->: a dynamic block, every attribute in its comment) takes any key', () => {
  const out = /** @type {any} */ (
    applyBlockEdits('<!-- wp:site-title {"level":0} /-->', {
      0: { attrs: { textAlign: 'center', level: 1 } }
    })
  )

  assert.equal(out.ok, true, out.error)
  assert.equal(out.body, '<!-- wp:site-title {"level":1,"textAlign":"center"} /-->')
})

test('blocksTouched: the existing blocks a whole body changes or drops; blocks put in at one place touch none', () => {
  const p = (/** @type {string} */ t) => `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->`
  const body = [p('a'), p('b'), p('c'), p('d')].join('\n\n')
  assert.deepEqual(blocksTouched(body, body), { touched: [], of: 4 })
  assert.deepEqual(blocksTouched(body, body.replace('<p>b</p>', '<p>B</p>')), { touched: [1], of: 4 })
  // two far apart: everything between them is counted, the run both bodies share is not
  assert.deepEqual(
    blocksTouched(body, body.replace('<p>a</p>', '<p>A</p>').replace('<p>d</p>', '<p>D</p>')),
    { touched: [0, 1, 2, 3], of: 4 }
  )
  assert.deepEqual(blocksTouched(body, `${body}\n\n${p('e')}`), { touched: [], of: 4 })
  assert.deepEqual(blocksTouched(body, [p('a'), p('d')].join('\n')), { touched: [1, 2], of: 4 })
  // whitespace between blocks is no change
  assert.deepEqual(blocksTouched(body, body.replaceAll('\n\n', '\n')), { touched: [], of: 4 })
  assert.equal(blocksTouched(body, '<!-- wp:paragraph -->'), null)
})
