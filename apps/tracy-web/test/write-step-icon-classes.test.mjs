// The icon of a social row is written in the template's own icon set (ADR 0044): a copy that names the icon field directly in
// another icon set's syntax (Font Awesome 6 `fa-brands` on a template that loads Font Awesome 5) prints an empty square, and a
// row whose link changes network keeps the demo network's glyph unless its icon field is owned. Invented kit, invented accounts.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { linkIconChanges, routeChanges } from '../src/write-step/kit-slot-routes.js'

const icon = (row, network) => ({
  id: `block-9.${row}.icon`,
  role: 'icon',
  type: 'icon',
  network,
  value: `font-icon fa fa-${network}`,
  field: `block-9.${row + 4}`,
  fieldValue: `fa fa-${network}`
})
const kit = {
  blocks: [
    {
      id: 'block-9',
      lists: [
        {
          id: 'block-9.social',
          rows: [
            { index: 0, slots: [{ id: 'block-9.0', type: 'url' }, icon(0, 'facebook')] },
            { index: 1, slots: [{ id: 'block-9.1', type: 'url' }, icon(1, 'instagram')] }
          ]
        }
      ]
    }
  ]
}

test('an icon field the copy fills in another icon set takes the template class of the same network', () => {
  const out = routeChanges({ 'module-9.4': 'fa-brands fa-instagram' }, kit, [{ slot: 'block-9.4' }])
  assert.equal(out.changes['module-9.4'], 'fa fa-instagram')
})

test('an icon field the copy fills with a network the template has no glyph for is not written', () => {
  const out = routeChanges({ 'module-9.4': 'fa-brands fa-mastodon' }, kit, [{ slot: 'block-9.4' }])
  assert.equal(out.changes['module-9.4'], undefined)
  assert.match(out.deferred.get('module-9.4'), /no icon/)
})

test('a row whose link changes network owns its icon field, in the template class of the new network', () => {
  const out = linkIconChanges({ kit, links: { 'module-9.0': 'https://www.instagram.com/invented.club/' } })
  assert.deepEqual(out.changes, { 'module-9.4': 'fa fa-instagram' })
  assert.deepEqual(out.owned, ['block-9.0.icon'])
})

test('a row whose link is no network the template draws says so', () => {
  const out = linkIconChanges({ kit, links: { 'module-9.0': 'https://invented-club.example/' } })
  assert.deepEqual(out.changes, {})
  assert.equal(out.unknown[0].slot, 'block-9.0.icon')
})

test('YouTube uses the loaded Font Awesome family even when the demo list has no YouTube row', () => {
  const out = linkIconChanges({ kit, links: { 'module-9.0': 'https://youtu.be/invented' } })
  assert.deepEqual(out.changes, { 'module-9.4': 'fa fa-youtube' })
  assert.deepEqual(out.unknown, [])
  const mixed = structuredClone(kit)
  mixed.blocks[0].lists[0].rows[1].slots[1].fieldValue = 'fab fa-instagram'
  assert.equal(
    linkIconChanges({ kit: mixed, links: { 'module-9.0': 'https://youtu.be/invented' } }).unknown.length,
    1
  )
})
