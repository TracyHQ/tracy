/**
 * A page whose menu entry opens a component other than com_content is a page like any other for the Pages answer
 * (Akemi, 12/10/2026): JA Resort j6's Rooms (`com_solidres`, its booking engine) is kept when ticked and goes when
 * unticked, by its entry in the main menu. Held against the menu the release ships (its presentation lock).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tickedMenuItems, unpickedMenuItems } from '../src/sites/brief-engines/picked-pages.js'

const LOCK =
  '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-resort/j6/1.0.2/presentation-lock.json'

/** The release's menu, as the site lists it. */
function menu() {
  const { entities } = JSON.parse(readFileSync(fileURLToPath(new URL(LOCK, import.meta.url)), 'utf8'))
  return Object.entries(entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => ({ id: Number(key.slice('menuItem-'.length)), ...row }))
}

const ALL = ['homepage', 'rooms', 'about-us', 'blogs', 'contact-us']
const pages = (/** @type {string[]} */ picked) => ({
  all: ALL.map((id) => ({ id, label: id, ...(id === 'homepage' ? { home: true } : {}) })),
  picked
})

test('JA Resort j6: the com_solidres Rooms page goes when unticked and stays when ticked', async () => {
  const rows = menu()
  const visible = new Set(['en-GB'])
  const rooms = rows.find((r) => r.path === 'rooms')
  assert.match(String(rooms?.link), /option=com_solidres/)
  const read = async (/** @type {number} */ id) => rows.find((r) => r.id === id) ?? null

  const unticked = await unpickedMenuItems(
    undefined,
    rows,
    visible,
    read,
    pages(['about-us', 'blogs', 'contact-us'])
  )
  assert.ok(unticked.ids.includes(Number(rooms?.id)), `unticked Rooms goes: ${unticked.ids}`)
  assert.ok(!unticked.ids.includes(101), 'never the home entry')

  const kept = await unpickedMenuItems(
    undefined,
    rows,
    visible,
    read,
    pages(['rooms', 'about-us', 'blogs', 'contact-us'])
  )
  assert.ok(!kept.ids.includes(Number(rooms?.id)), 'ticked Rooms stays')
  assert.ok(tickedMenuItems(rows, visible, pages(['rooms'])).ids.includes(Number(rooms?.id)))
})
