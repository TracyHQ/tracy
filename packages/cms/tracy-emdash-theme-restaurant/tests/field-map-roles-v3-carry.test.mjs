// tools/carry-field-map-roles.mjs on this template's own field map: a regenerated seed keeps the place-content-roles/3
// declarations the content map of 1.0.3 is built from, the per-taxonomy roles (`taxonomyRoles`) and the per-slot ones
// (`slotRoles`) included. Without them a recompile of the seed would leave every category and tag without a role and
// put the dish descriptions that end on a price back under `offering.description` (label rule R2), silently.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { carryRolesIntoCompiledMap } from '../tools/carry-field-map-roles.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const previous = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'field-map.json'), 'utf8'))

test('a regenerated field map keeps the version 3 vocabulary, the taxonomy roles and the slot roles', () => {
  // What compile-seed.mjs writes: the same fields with no role keys and no declarations at the top.
  const fields = Object.fromEntries(
    Object.entries(previous.fields).map(([key, { role: _r, group: _g, subRoles: _s, ...rest }]) => [key, rest])
  )
  const carried = carryRolesIntoCompiledMap(previous, { generatedAt: previous.generatedAt, fields })
  assert.equal(carried.roleVocabularyVersion, 'place-content-roles/3')
  assert.deepEqual(carried.taxonomyRoles, previous.taxonomyRoles)
  assert.deepEqual(carried.slotRoles, previous.slotRoles)
  assert.deepEqual(carried.fields, previous.fields)
})
