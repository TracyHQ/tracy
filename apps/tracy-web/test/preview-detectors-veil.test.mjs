/**
 * The cross-check of PR 2 (14/10/2026) against the eye audit: what the first detectors still missed.
 * - veil-text: JA Essence WordPress's lead card titles went from white on a dark veil to grey on a
 *   grey veil under Moxie (probe data cut from that preview); the template's own page passes.
 * - glare judged on the system's page colour: a WordPress page paints its ground on a wrapper, so
 *   body and html read transparent and the page fell back to white; a light block on a dark system
 *   was then never glare.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { comparePreview } from '../src/sites/design-system-preview-probe.js'
import { detect } from '../scripts/preview-detectors/veil-text.mjs'
import { PREVIEW_KINDS } from '../../../packages/design/tracy-ds-slot/src/measurement.mjs'

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/preview-detectors/veil-text.json', import.meta.url), 'utf8')
)
const run = (/** @type {any} */ s) =>
  detect({
    worn: { base: null, data: s.worn.data, html: '' },
    plain: { base: null, data: s.plain.data, html: '' },
    systemColours: s.systemColours,
    scheme: 'dark'
  })

test('veil-text: fails on the recoloured cover veils of a real preview, passes on the template itself', () => {
  // test-quality: contract the kind's rule (or the rule's group) is the decision this PR states; /ops and Publish read it
  assert.equal(PREVIEW_KINDS['veil-text'].rule, 'CON-2')
  for (const s of fixture.broken) {
    const r = run(s)
    assert.ok(r.count > 0, s.source)
    assert.equal(r.count, r.findings.length)
    assert.ok(
      r.findings.some((f) => /Abstract Wonders/.test(f.text)),
      'the lead card title is found'
    )
    for (const f of r.findings) {
      assert.ok(f.ratio < 3 && f.was >= 3, `${f.text}: unreadable now, readable on the template`)
      assert.ok(String(f.at).trim())
    }
  }
  for (const s of fixture.clean) assert.equal(run(s).count, 0, s.source)
})

test('glare is judged on the page colour the system states, not on a transparent body', () => {
  const block = (bg) => ({ path: 'main:1/section:3', at: 'section.tracy-stats', share: 0.02, top: 4000, bg })
  const plain = { page: { r: 255, g: 255, b: 255, a: 1 }, blocks: [block({ r: 10, g: 79, b: 168, a: 1 })] }
  const khaki = { r: 183, g: 179, b: 159, a: 1 }
  // body and html transparent: the probe's page fell back to white
  const worn = { page: { r: 255, g: 255, b: 255, a: 1 }, blocks: [block(khaki)], texts: [], buttons: [] }
  assert.equal(comparePreview(worn, plain, []).glare.length, 0, 'without the stated page, nothing')
  const stated = { ...worn, said: { '--ds-c-bg': '#000000' } }
  assert.equal(comparePreview(stated, plain, []).glare.length, 1, 'on the system black page, a glare block')
})
