/**
 * An unticked Joomla blog page stops answering at its address, held against the menu JA Phio 1.0.3 really ships: its Blog
 * page is a category blog view (`mainmenu` 106, `/blog`) that the `resources` menu repeats as an alias (127). Joomla routes
 * `/blog` only through a published menu entry, so the address 404s once the entry is unpublished; the alias that only led
 * there goes with it (`strandedMenuItems`), so nothing a visitor can click still leads to it. (The WordPress twin of this
 * case is `page_for_posts`, `brief-wp-residue.test.mjs`.)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { strandedMenuItems } from '../src/sites/brief-engines/joomla-tidy.js'
import { unpickedMenuItems } from '../src/sites/brief-engines/picked-pages.js'

const LOCK = fileURLToPath(
  new URL(
    '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-phio/j6/1.0.3/presentation-lock.json',
    import.meta.url
  )
)

test('JA Phio: the unticked Blog page leaves no published entry at /blog and none that leads there', async () => {
  const { entities } = JSON.parse(readFileSync(LOCK, 'utf8'))
  const rows = Object.entries(entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => ({ id: Number(key.slice('menuItem-'.length)), ...row }))
  const blog = rows.find((r) => r.id === 106)
  assert.match(blog.link, /view=category/, 'the Blog page is a category view')
  const visible = new Set(['en-GB'])
  const pageIds = rows
    .filter((r) => r.menutype === 'mainmenu' && String(r.level) === '1' && Number(r.published) === 1)
    .map((r) => r.alias)
  const sitePages = {
    all: pageIds.map((id) => ({ id, label: id, ...(id === 'home' ? { home: true } : {}) })),
    picked: pageIds.filter((id) => id !== 'blog')
  }
  const read = async (/** @type {number} */ id) => rows.find((r) => r.id === id) ?? null
  const unpicked = await unpickedMenuItems(undefined, rows, visible, read, sitePages)
  assert.ok(unpicked.ids.includes(106), 'the Blog entry is unpublished')
  const stranded = await strandedMenuItems({
    apply: async () => assert.fail('the whole rows carry where each alias leads'),
    siteKey: 's',
    rows,
    hiding: unpicked.ids,
    visible
  })
  assert.ok(stranded.ids.includes(127), 'the resources alias that only led to the Blog goes with it')
  const off = new Set([...unpicked.ids, ...stranded.ids])
  const left = rows.filter(
    (r) =>
      Number(r.published) === 1 &&
      !off.has(r.id) &&
      (r.path === 'blog' || String(r.params ?? '').includes('"aliasoptions":"106"'))
  )
  assert.deepEqual(left, [], 'no entry a visitor can reach answers at /blog or leads there')
})
