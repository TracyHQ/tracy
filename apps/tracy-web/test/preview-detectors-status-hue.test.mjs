/**
 * status-hue (TPL-1, 15/10/2026): Tracy Business WordPress's orange labels, written with the warn
 * preset (its brand orange), stayed orange under Figma and Moxie through the slot's status role, which
 * keptText cannot see (the colour moved a little and is a role of the slot). Judged on probe data cut
 * from the real preview (fixtures/preview-detectors/status-hue.json): the broken sample fails, the same
 * labels after the contract maps them to the accent pass, and real messages (the style guide's
 * alerts, one field error) are no finding.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { DETECTORS } from '../scripts/preview-detectors/index.mjs'
import { PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/status-hue.json', import.meta.url), 'utf8')
)
const run = async (/** @type {any} */ s) => {
  const m = await import('../scripts/preview-detectors/status-hue.mjs')
  return m.detect({
    worn: { base: null, data: s.worn.data, html: '' },
    plain: { base: null, data: s.plain.data, html: '' },
    systemColours: s.systemColours,
    scheme: 'light'
  })
}

test('status-hue is loaded with a probe and fails TPL-1', () => {
  const d = DETECTORS.find((x) => x.kind === 'status-hue')
  assert.ok(d && typeof d.probe === 'string')
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['status-hue'].rule, 'TPL-1')
})

test('the brand orange labels kept through the warn role are found; the accent-mapped ones and real messages are not', async () => {
  for (const s of fixture.broken) {
    const r = await run(s)
    assert.ok(r.count >= 3, `${s.source}: ${r.count}`)
    assert.ok(r.findings.every((/** @type {any} */ f) => f.role === 'warn' && f.was === '#da5a2a'))
  }
  for (const s of fixture.clean) {
    const r = await run(s)
    assert.equal(r.count, 0, `${s.source}: ${JSON.stringify(r.findings)}`)
  }
})
