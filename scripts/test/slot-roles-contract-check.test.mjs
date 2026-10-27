// The slot roles contract check (gate `slot-roles`, ADR 0038): content maps that declare roles, and the sidecars that
// remain, on a throwaway tree of fictional contracts.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkAllSlotRoles } from '../slot-roles/check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CHECK = path.join(ROOT, 'scripts/slot-roles/check.mjs')
const FIXTURE = JSON.parse(
  readFileSync(
    path.join(ROOT, 'packages/wo/website-opportunities/test/fixtures/content-map-with-roles.json'),
    'utf8'
  )
)
const CONTRACT = 'packages/cms/tracy-joomla-quickstart/contracts/juniper-crumb/j6/1.0.0'

/** A tree with one fictional Joomla contract whose content map is `edit(fixture)`. */
function treeWith(t, edit = (map) => map) {
  const root = mkdtempSync(path.join(tmpdir(), 'slot-roles-check-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, CONTRACT)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ quickstart: { slug: 'juniper-crumb', cms: 'j6', version: '1.0.0' } })
  )
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(edit(structuredClone(FIXTURE))))
  return { root, dir }
}

const slot = (map, key) => map.slots.find((s) => s.key === key)

test('a content map with a role on every text and image slot passes', (t) => {
  const { root } = treeWith(t)
  const res = checkAllSlotRoles(root)
  assert.deepEqual(res.errors, [])
  assert.equal(res.ok, true)
  assert.equal(res.checkedCount, 1)
})

test('unknown role, split group and missing role each fail with the contract and the reason', (t) => {
  const cases = [
    [(m) => ((slot(m, 'module-503.1').role = 'offering.cost'), m), 'unknown role "offering.cost"'],
    [
      (m) => ((slot(m, 'module-503.4').group = { id: 'module-503.item.1', item: 0, kind: 'menu_item' }), m),
      'group "module-503.item.1" is split'
    ],
    [(m) => (delete slot(m, 'module-501.0').role, m), 'slot "module-501.0" (text) has no role']
  ]
  for (const [edit, reason] of cases) {
    const { root } = treeWith(t, edit)
    const res = checkAllSlotRoles(root)
    assert.equal(res.ok, false, reason)
    assert.ok(
      res.errors.some((e) => e.startsWith(CONTRACT) && e.includes(reason)),
      `${reason}\n${res.errors.join('\n')}`
    )
  }
})

test('a content map that declares no roles is not held: contracts released before roles stay valid', (t) => {
  const { root } = treeWith(t, (m) => {
    delete m.roleVocabularyVersion
    for (const s of m.slots) {
      delete s.role
      delete s.group
    }
    return m
  })
  const res = checkAllSlotRoles(root)
  assert.equal(res.checkedCount, 0)
  assert.ok(res.errors.some((e) => e.includes('no slot roles found')))
})

test('the committed tree passes, sidecars included', () => {
  const res = checkAllSlotRoles(ROOT)
  assert.deepEqual(res.errors, [])
  assert.ok(res.checkedCount >= 3)
})

test('run as a script on one contract, it exits 1 and says why', (t) => {
  const { dir } = treeWith(t, (m) => ((slot(m, 'module-504.1').role = 'quote.speaker'), m))
  const run = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8' })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /unknown role "quote\.speaker"/)
})
