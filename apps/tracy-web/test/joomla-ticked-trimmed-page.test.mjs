/**
 * A page the customer ticked stays on a Joomla site even when the demo trim took its menu entry off. Measured 08/10/2026 on
 * dev (tamq-7q-tbusj, Tracy Business j6 1.2.0): the Pages answer unticked News only, yet /en/projects answered 404 like
 * /en/news. Projects is not under News in the menu (602 and 603 are both level 1 of `tb-main-en`); the release's
 * demo-trim map unpublishes both entries ("every article it lists is hidden"), on every site, before the Pages answer is
 * read. Held against the menu the release really ships (its presentation lock) with the trim applied to it.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { strandedMenuItems } from '../src/sites/brief-engines/joomla-tidy.js'
import { tickedMenuItems, unpickedMenuItems } from '../src/sites/brief-engines/picked-pages.js'

const DIR = '../../../packages/cms/tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/'
const read = (/** @type {string} */ name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(DIR + name, import.meta.url)), 'utf8'))

/** The release's menu as a trimmed site lists it: every row the demo-trim map moves, moved. */
function trimmedMenu() {
  const { entities } = read('presentation-lock.json')
  const trim = new Map(read('demo-trim-map.json').hide.map((h) => [h.key, h]))
  return Object.entries(entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => {
      const moved = trim.get(key)
      return {
        id: Number(key.slice('menuItem-'.length)),
        ...row,
        ...(moved ? { [moved.field]: moved.to } : {})
      }
    })
}

const ALL = ['home', 'about', 'services', 'projects', 'news', 'contact']
const sitePages = (/** @type {string[]} */ picked) => ({
  all: ALL.map((id) => ({ id, label: id, ...(id === 'home' ? { home: true } : {}) })),
  picked
})

test('Tracy Business j6: the trim took Projects and News off; a ticked Projects comes back, an unticked News stays off', async () => {
  const rows = trimmedMenu()
  const visible = new Set(['en-GB'])
  assert.equal(Number(rows.find((r) => r.id === 602)?.published), 0, 'the trim unpublishes Projects')
  assert.equal(Number(rows.find((r) => r.id === 603)?.published), 0, 'the trim unpublishes News')

  const pages = sitePages(['about', 'services', 'projects', 'contact'])
  const ticked = tickedMenuItems(rows, visible, pages)
  assert.deepEqual(ticked.off, [602], 'the ticked Projects entry the trim took off is published again')
  assert.ok(ticked.ids.includes(600) && ticked.ids.includes(602) && !ticked.ids.includes(603))

  const live = rows.map((r) => (ticked.off.includes(r.id) ? { ...r, published: '1' } : r))
  const readRow = async (/** @type {number} */ id) => live.find((r) => r.id === id) ?? null
  const unpicked = await unpickedMenuItems(undefined, live, visible, readRow, pages)
  assert.ok(!unpicked.ids.includes(602), 'Projects is not taken off')
  const stranded = await strandedMenuItems({
    apply: async () => assert.fail('the whole rows carry where each alias leads'),
    siteKey: 's',
    rows: live,
    hiding: unpicked.ids,
    visible
  })
  assert.ok(stranded.ids.includes(626), "the footer's News alias goes with News")
  assert.ok(!stranded.ids.includes(625), "the footer's Projects alias leads to a live page and stays")
})

test('no Pages answer: nothing is published again, the trim stands', () => {
  const rows = trimmedMenu()
  assert.deepEqual(tickedMenuItems(rows, new Set(['en-GB']), null), { ids: [], off: [] })
  assert.deepEqual(tickedMenuItems(rows, new Set(['en-GB']), { all: sitePages([]).all }), {
    ids: [],
    off: []
  })
})
