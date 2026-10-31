/**
 * A header or a footer the content map covers (a `templatePart` entity, TracyHQ/tracy#139) is written by the build through
 * the contract, like any page slot; the residue sweep, which rewrites the words of the template's parts that no slot
 * reaches, leaves such a part alone. A part the map does not cover is swept as before. The fixture is a made-up tea room.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { partsInMap, sweepWordPress, writtenLines } from '../src/sites/brief-engines/wp-residue.js'

const HEADER =
  '<!-- wp:group {"tagName":"header"} -->\n<header class="wp-block-group">' +
  '<!-- wp:navigation-link {"label":"Menu","url":"/menu/","kind":"custom"} /-->\n' +
  '<!-- wp:paragraph -->\n<p>Larkspur Tea Room since 1998</p>\n<!-- /wp:paragraph -->' +
  '</header>\n<!-- /wp:group -->'
const FOOTER =
  '<!-- wp:group {"tagName":"footer"} -->\n<footer class="wp-block-group">' +
  '<!-- wp:navigation-link {"label":"Menu","url":"/menu/","kind":"custom"} /-->\n' +
  '<!-- wp:paragraph -->\n<p>Larkspur Tea Room since 1998</p>\n<!-- /wp:paragraph -->' +
  '</footer>\n<!-- /wp:group -->'

/** A door holding one page and the two parts, the way the plugin answers the sweep. */
function door() {
  const parts = { header: HEADER, footer: FOOTER }
  /** @type {any[]} */
  const writes = []
  const page = {
    id: 5,
    slug: 'home',
    title: 'Home',
    status: 'publish',
    content: '<!-- wp:paragraph -->\n<p>Hi</p>\n<!-- /wp:paragraph -->'
  }
  const call = async (/** @type {string} */ action, /** @type {any} */ params) => {
    if (action === 'content.update') {
      writes.push(params)
      if (params.kind === 'templatePart') parts[params.key] = params.fields.content
      return { ok: true }
    }
    if (action === 'content.list') {
      const rows = params.post_type === 'page' && params.offset === 0 ? [page] : []
      return { ok: true, items: rows }
    }
    if (action === 'content.get' && params.kind === 'templatePart')
      return parts[params.key]
        ? { ok: true, item: { content: parts[params.key] } }
        : { ok: false, error: 'not_found' }
    return { ok: false, error: 'not_found', message: 'not found' }
  }
  return { parts, writes, call }
}

const contentMap = {
  entities: [
    { key: 'page-home', kind: 'page', identity: { postType: 'page', slug: 'home' } },
    { key: 'part-footer', kind: 'templatePart', identity: { slug: 'footer' } }
  ],
  slots: [
    {
      key: 'part-footer.paragraph.1',
      entity: 'part-footer',
      target: { blockType: 'paragraph', occurrence: 1, attr: 'content' },
      type: 'text',
      sample: 'Larkspur Tea Room since 1998'
    }
  ]
}

test('the parts a content map covers are the slugs of its template part entities', () => {
  assert.deepEqual([...partsInMap(contentMap)], ['footer'])
})

test('the sweep rewrites the words of the header the map does not cover, and leaves the footer it covers', async () => {
  const site = door()
  await sweepWordPress({
    call: site.call,
    applyId: 'residue-test',
    written: writtenLines([]),
    entitySlugs: new Set(['home']),
    judged: { hide: new Set(), relabel: new Map([['Menu', 'Our teas']]) },
    lines: [
      { slug: 'part-header', text: 'Larkspur Tea Room since 1998', value: 'Wren Bakery, fresh daily' },
      { slug: 'part-footer', text: 'Larkspur Tea Room since 1998', value: 'Wren Bakery, fresh daily' }
    ],
    prune: false,
    mapParts: partsInMap(contentMap)
  })
  assert.match(site.parts.header, /Wren Bakery, fresh daily/)
  assert.match(site.parts.header, /"label":"Our teas"/)
  assert.equal(site.parts.footer, FOOTER)
  assert.ok(!site.writes.some((w) => w.kind === 'templatePart' && w.key === 'footer'))
})

test('a released WordPress map covers no part, so its header and footer are swept as before', () => {
  const released = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(
          '../../../packages/cms/tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.12/content-map.json',
          import.meta.url
        )
      ),
      'utf8'
    )
  )
  assert.equal(partsInMap(released).size, 0)
})
