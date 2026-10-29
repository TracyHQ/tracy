/**
 * Place content roles v3 is an expand step (ADR 0040): every content map already committed in this tree validates and
 * reads exactly as it did under version 2. A released map is never edited (its hash is bound on every site), so a
 * vocabulary change that refused one would lock its sites out.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  checkContentMapFit,
  checkContentMapRoles,
  keepDecisionOf,
  roleDecidesKeep,
  slotFitOf
} from 'website-opportunities/domain'
import { customizable } from '../src/lib/contract-customize.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const MAPS = execFileSync('git', ['ls-files', 'packages/cms/*/contracts/*content-map.json'], {
  cwd: ROOT,
  encoding: 'utf8'
})
  .split('\n')
  .filter(Boolean)
const read = (file) => JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'))

test('every committed content map still passes the role and Slot fit checks; only a version 3 map lets the role decide keep', () => {
  assert.ok(MAPS.length > 0)
  let declared = 0
  for (const file of MAPS) {
    const map = read(file)
    const roles = checkContentMapRoles(map)
    const fit = checkContentMapFit(map)
    assert.deepEqual(roles.errors, [], file)
    assert.deepEqual(fit.errors, [], file)
    // JA Boxing 1.0.8 is the first version 3 map (ADR 0040); every older map keeps its version 2 reading
    assert.equal(roleDecidesKeep(map), map.roleVocabularyVersion === 'place-content-roles/3', file)
    if (roles.declared) declared += 1
  }
  assert.ok(declared >= 3, 'the JA Boxing contracts with roles are among them')
})

test('in a released map the keep decision is the one Customize and the picture planner already read', () => {
  const map = read('packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.7/content-map.json')
  let kept = 0
  for (const slot of map.slots) {
    const decision = keepDecisionOf(slot, map)
    const fitKeeps = slot.type === 'image' && slotFitOf(slot)?.replace === 'keep'
    assert.equal(decision === 'keep', !customizable(slot) || fitKeeps, slot.key)
    if (decision === 'keep') kept += 1
  }
  assert.ok(kept > 0)
})
