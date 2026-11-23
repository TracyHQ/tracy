/**
 * The newest EmDash version each tag has a template profile row for is the version that tag publishes, and
 * production reads that release as soon as the row ships. The road of that version measures it from two
 * other places in this repository: the theme's `contracts/<version>/` folder (content coverage, template
 * kit, design system) and the slot contract's `maxVersion` (`packages/design/tracy-ds-slot/templates`).
 * A row that reaches a branch without them leaves the road there reporting coverage-not-measured,
 * kit-missing and ds-not-at-probe for a release that is already live.
 */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { TEMPLATE_PROFILES } from '../src/lib/template-profiles.js'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const SLOTS = path.join(ROOT, 'packages/design/tracy-ds-slot/templates')
const parts = (v) => v.split('.').map(Number)
const cmp = (a, b) => {
  const x = parts(a), y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}
const emdashTags = Object.keys(TEMPLATE_PROFILES.releases).filter((tag) => /^tracy-[a-z-]+\/emdash-/.test(tag))
const newest = (tag) => Object.keys(TEMPLATE_PROFILES.releases[tag]).sort(cmp).at(-1)
const slotMax = (tag) => {
  const found = []
  for (const file of readdirSync(SLOTS).filter((f) => f.endsWith('.json'))) {
    const max = JSON.parse(readFileSync(path.join(SLOTS, file), 'utf8')).maxVersion?.[tag]
    if (max) found.push(max)
  }
  return found.sort(cmp).at(-1)
}

test('every EmDash tag with a profile row has its newest version covered by a contract folder and a slot contract', () => {
  assert.ok(emdashTags.length > 0, 'no EmDash tag in template-profiles.json')
  for (const tag of emdashTags) {
    const version = newest(tag)
    const theme = tag.split('/')[0].replace(/^tracy-/, '')
    const dir = path.join(ROOT, 'packages/cms', `tracy-emdash-theme-${theme}`, 'contracts', version)
    assert.ok(existsSync(dir), `${tag}@${version} has a profile row but no packages/cms/tracy-emdash-theme-${theme}/contracts/${version}/`)
    const max = slotMax(tag)
    assert.ok(max, `${tag} has no slot contract naming a maxVersion`)
    assert.ok(cmp(max, version) >= 0, `${tag}@${version} has a profile row but its slot contracts stop at ${max}`)
  }
})
