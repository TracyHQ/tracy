// The one reader of a contract's slot roles (ADR 0038): the content map first, then the `slot-roles.json` sidecar, then
// the hand-written Website Opportunities map.
import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readSlotRoles } from '../src/lib/contract-slot-roles.js'
import { slotRolesOf } from '../src/lib/slot-roles.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SIDECAR_DIRS = {
  'tracy-base': path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts/tracy-base/j6/1.0.5'),
  'ja-restaurant': path.join(
    ROOT,
    'packages/cms/tracy-wordpress-quickstart/contracts/ja-restaurant/wp7/1.0.1'
  ),
  'tracy-base-emdash': path.join(ROOT, 'packages/cms/tracy-emdash-theme-base/contracts/0.5.6')
}
const FIXTURE = path.join(ROOT, 'packages/wo/website-opportunities/test/fixtures/content-map-with-roles.json')

/** A throwaway copy of a released contract whose content map is replaced by `contentMap`. */
function contractWith(t, from, contentMap) {
  const dir = mkdtempSync(path.join(tmpdir(), 'contract-slot-roles-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  cpSync(from, dir, { recursive: true })
  if (contentMap) writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(contentMap, null, 2))
  return dir
}

// The EmDash base theme's roles come from its field map (ticket 1804), so its 0.5.6 sidecar is read only as the fallback
// and is stale beside the current seed; `emdash-field-map-roles.test.mjs` covers that theme.
test('the Joomla and WordPress sidecars read identically through the shared reader', () => {
  for (const [name, dir] of Object.entries(SIDECAR_DIRS)) {
    if (name === 'tracy-base-emdash') continue
    const sidecar = slotRolesOf(dir)
    const read = readSlotRoles(dir)
    assert.equal(read.source, 'sidecar', name)
    assert.equal(read.state, 'ready', name)
    assert.equal(read.state, sidecar.state, name)
    assert.deepEqual(read.doc, sidecar.doc, name)
    assert.deepEqual(read.gaps, sidecar.gaps, name)
    assert.deepEqual(read.errors, sidecar.errors, name)
  }
})

test('roles on the content map come first, even with a sidecar beside it', (t) => {
  const contentMap = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const dir = contractWith(t, SIDECAR_DIRS['tracy-base'], contentMap)
  const read = readSlotRoles(dir)
  assert.equal(read.source, 'content-map')
  assert.equal(read.state, 'ready')
  assert.equal(read.doc.status, 'checked')
  assert.deepEqual(
    read.doc.groups.map((g) => g.groupId),
    ['site.identity.0', 'module-503.item.0', 'module-503.item.1', 'module-504.quote.0']
  )
  assert.deepEqual(read.gaps, [])
})

test('a content map with broken roles is invalid, with the reason, and never falls back to the sidecar', (t) => {
  const contentMap = JSON.parse(readFileSync(FIXTURE, 'utf8'))
  contentMap.slots.find((s) => s.key === 'module-503.1').role = 'offering.cost'
  delete contentMap.slots.find((s) => s.key === 'module-504.0').role
  const read = readSlotRoles(contractWith(t, SIDECAR_DIRS['tracy-base'], contentMap))
  assert.equal(read.source, 'content-map')
  assert.equal(read.state, 'invalid')
  assert.ok(read.errors.some((e) => e.includes('unknown role "offering.cost"')))
  // The evidence slot that lost its role is a gap, as it is for a sidecar.
  assert.ok(read.gaps.includes('module-504.0'))
})

test('no roles and no sidecar: the hand-written map of the template, or nothing', (t) => {
  const dir = contractWith(t, SIDECAR_DIRS['tracy-base'])
  rmSync(path.join(dir, 'slot-roles.json'))
  const withMap = readSlotRoles(dir, { template: 'tracy-base' })
  assert.equal(withMap.source, 'hand-map')
  assert.equal(withMap.state, 'missing')
  assert.ok(withMap.handMap?.roles, 'the hand-written map is returned')
  assert.equal(withMap.doc, undefined)
  assert.ok(withMap.gaps.length > 0)

  const none = readSlotRoles(dir, { template: 'no-such-template' })
  assert.equal(none.source, 'none')
  assert.equal(none.state, 'missing')
  assert.equal(none.handMap, null)
})

test('the hand-written map comes with any source, for the callers that pin from it too', () => {
  const read = readSlotRoles(SIDECAR_DIRS['ja-restaurant'], { template: 'ja-restaurant' })
  assert.equal(read.source, 'sidecar')
  assert.ok(read.handMap?.roles)
  const emdash = readSlotRoles(SIDECAR_DIRS['tracy-base-emdash'], { template: 'tracy-base' })
  assert.equal(emdash.source, 'field-map')
  assert.ok(emdash.handMap?.roles, 'an EmDash theme map is read from the same reader')
})

test('no contract at all reads as missing', () => {
  assert.deepEqual(readSlotRoles(null), {
    source: 'none',
    state: 'missing',
    gaps: [],
    handMap: null,
    fit: { state: 'missing', version: null, slots: {}, groups: {}, missing: { image: 0, text: 0 } }
  })
})
