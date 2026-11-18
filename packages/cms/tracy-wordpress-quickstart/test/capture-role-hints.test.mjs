import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyRoleHints } from '../scripts/role-hints.mjs'

const V3 = 'place-content-roles/3'
const map = () => ({
  slots: [
    { key: 'home.hero.plate', type: 'image', sample: 'plate.png', role: 'editorial.illustration' },
    { key: 'home.team.photo', type: 'image', sample: 'cook.png', role: 'editorial.illustration' },
    { key: 'home.team.name', type: 'text', sample: 'A name' }
  ]
})

test('a hint sets the role (and the group) of the slot it names, and nothing else', () => {
  const hints = {
    version: 1,
    hints: [
      { key: 'home.hero.plate', role: 'offering.image', why: 'a plated dish' },
      {
        key: 'home.team.photo',
        role: 'person.image',
        group: { id: 'home.team.person.0', item: 0, kind: 'person' },
        why: 'a cook'
      }
    ]
  }
  const out = applyRoleHints(map(), hints, V3)
  assert.deepEqual(out.errors, [])
  const by = Object.fromEntries(out.contentMap.slots.map((s) => [s.key, s]))
  assert.equal(by['home.hero.plate'].role, 'offering.image')
  assert.deepEqual(by['home.team.photo'].group, { id: 'home.team.person.0', item: 0, kind: 'person' })
  assert.equal(by['home.team.name'].role, undefined)
})

test('a hint that names no slot, an unknown role or an unknown group kind is an error, never applied', () => {
  const bad = (hint) =>
    applyRoleHints(map(), { version: 1, hints: [{ why: 'x', ...hint }] }, V3).errors.join('\n')
  assert.match(bad({ key: 'home.gone', role: 'offering.image' }), /names no slot/)
  assert.match(bad({ key: 'home.hero.plate', role: 'made.up' }), /not a place-content-roles\/3 role/)
  assert.match(
    bad({ key: 'home.hero.plate', role: 'person.image', group: { id: 'g', item: 0, kind: 'nope' } }),
    /group kind/
  )
  assert.match(bad({ key: 'home.hero.plate', role: 'offering.image', why: '' }), /needs a reason/)
  assert.match(applyRoleHints(map(), { version: 2, hints: [] }, V3).errors.join('\n'), /version/)
  assert.equal(applyRoleHints(map(), undefined, V3).contentMap.slots.length, 3)
})

test('hints for slots that do not exist yet pass when allowed, and fail when every key is required', () => {
  const map = { slots: [{ key: 'a.b', role: 'editorial.paragraph' }] }
  const hints = { version: 1, hints: [{ key: 'img.c', role: 'offering.image', why: 'a plated dish' }] }
  assert.deepEqual(applyRoleHints(map, hints, V3, { allowMissing: true }).errors, [])
  assert.match(applyRoleHints(map, hints, V3).errors[0], /names no slot/)
})
