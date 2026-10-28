/**
 * The content map verify viewer (`content-coverage/verify-viewer.mjs`): from a content map and the audit's findings
 * it must number the slots it located, and list apart the slots it could not locate or that no page shows. Fictional
 * data, no browser: the locating and the page are pure functions of the map, the findings and the module boxes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isFactRole } from '../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { locate } from '../content-coverage/lib/verify/locate.mjs'
import { buildHtml } from '../content-coverage/lib/verify/page-html.mjs'
import { suspicion } from '../content-coverage/lib/verify/suspicion.mjs'

const slot = (key, extra = {}) => ({
  key,
  entity: 'module-7',
  type: 'text',
  label: key,
  sample: key,
  ...extra
})
const MAP = {
  slots: [
    slot('module-7.title', { sample: 'Harbor Lane Bakery', role: 'business.name' }),
    slot('module-7.badge', { sample: 'Over 100k loaves baked', role: 'editorial.heading' }),
    slot('module-7.carousel', { sample: 'Seasonal rye with caraway' }),
    slot('module-7.tagline', { sample: 'Baked before sunrise' }),
    slot('module-7.fine-print', { sample: 'Ask about gluten free', fit: { measured: false } })
  ]
}
const rect = (y) => ({ visible: true, rect: { x: 40, y, w: 400, h: 30 }, selector: '#Mod7 h2' })
const matched = (key, desktop, phone) => ({
  status: 'matched',
  matchBy: 'exact',
  kind: 'text',
  slots: [key],
  viewports: { desktop, phone }
})
const FINDINGS = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  pages: [
    {
      n: 1,
      url: 'https://bakery.example/',
      title: 'Home',
      shots: {
        desktop: { file: 'shots/001-desktop.jpg', width: 1440, height: 3000 },
        phone: { file: 'shots/001-phone.jpg', width: 390, height: 4000 }
      },
      items: [
        matched('module-7.title', rect(100), rect(80)),
        matched('module-7.badge', rect(160), rect(130)),
        // Matched, but hidden at both viewports (a slide that is not the active one).
        matched('module-7.carousel', { visible: false }, { visible: false })
        // module-7.tagline matches nothing; module-7.fine-print is not measured and nothing shows it.
      ]
    }
  ]
}
const MODS = { 1: { desktop: { 'module-7': { x: 0, y: 60, w: 1440, h: 200 }, containers: [] }, phone: {} } }

const model = () => locate({ map: MAP, findings: FINDINGS, isFactRole, mods: MODS })

test('slots matched to a visible element are numbered in page order', () => {
  const m = model()
  assert.equal(m.components.length, 1)
  assert.deepEqual(
    m.components[0].rows.map((r) => [r.n, r.slot.key]),
    [
      [1, 'module-7.title'],
      [2, 'module-7.badge']
    ]
  )
})

test('a slot no visible element matches, or that only a hidden element matches, is listed as not located with its reason', () => {
  const m = model()
  const byKey = Object.fromEntries(m.notLocated.map((r) => [r.slot.key, r.reason]))
  assert.deepEqual(Object.keys(byKey).sort(), ['module-7.carousel', 'module-7.tagline'])
  assert.match(byKey['module-7.carousel'], /hidden on both desktop and phone/)
  assert.match(byKey['module-7.tagline'], /No visible element/)
})

test('an unmatched slot whose fit is not measured is listed as not shown, not as not located', () => {
  const m = model()
  assert.deepEqual(
    m.notShown.map((r) => r.slot.key),
    ['module-7.fine-print']
  )
  assert.equal(m.counts.notLocated, 2)
  assert.equal(m.counts.notShown, 1)
})

test('a figure filed as editorial is marked suspicious', () => {
  const m = model()
  const badge = m.components[0].rows.find((r) => r.slot.key === 'module-7.badge')
  assert.deepEqual(
    badge.flags.map((f) => [f.rule, f.level]),
    [[2, 'red']]
  )
  assert.equal(m.counts.suspicious, 1)
})

test('the page shows the numbered slots, both unlocated lists and the suspicious mark', () => {
  const html = buildHtml({
    model: model(),
    label: '9.9.9',
    site: 'https://bakery.example/',
    generatedAt: FINDINGS.generatedAt,
    isFactRole
  })
  assert.match(html, /Content map verification, contract 9\.9\.9/)
  assert.match(html, /id="not-located"[\s\S]*module-7\.tagline/)
  assert.match(html, /id="not-shown"[\s\S]*module-7\.fine-print/)
  assert.match(html, /lv-red[\s\S]*module-7\.badge/)
  assert.match(html, /Not located on a page \(2\)/)
  assert.match(html, /Not shown on any page, fit not measured \(1\)/)
})

test('rule 1 accepts faces that prove a number (stat.proof_image, ADR 0040) and still marks a signature under it', () => {
  const picture = (kind, role) =>
    slot(`module-7.${kind}`, { type: 'image', role, fit: { measured: true, kind, replace: 'photo' } })
  const rules = (s) => suspicion(s, true, isFactRole).map((f) => f.rule)
  assert.deepEqual(rules(picture('avatar-group', 'stat.proof_image')), [])
  assert.deepEqual(rules(picture('avatar', 'stat.proof_image')), [])
  assert.deepEqual(rules(picture('signature', 'stat.proof_image')), [1])
  assert.deepEqual(rules(picture('avatar-group', 'editorial.illustration')), [1])
})
