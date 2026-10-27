import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutRules } from '../src/tokens56.mjs'

const rule = (s, d) =>
  `${[s].flat().join(',')}{${Object.entries(d)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`

test("a system's container width is never worn: the template's columns keep their own width", () => {
  // JA Kinetic (15/10/2026): the containers the contract named took the system's width while the
  // template's other columns (prose, related posts, the archive header) kept 1240px, and one page
  // started at two left edges (edge-split, LAYOUT-3). A T3 container is no longer widened either
  const profile = { layout: { container: { s: 'stated', v: 1440 } }, fonts: {} }
  const sel = { container: ['#t3-mainbody .container, .container', 'div.hx-container'] }
  const out = layoutRules(profile, { '--container-max': '1440px' }, sel, (x) => x, rule)
  assert.deepEqual(out, [])
})

test("form controls keep the template's box metrics: the slot's button padding stops at a form", async () => {
  const { OUTSIDE_FORMS, outsideForms } = await import('../src/tokens56.mjs')
  assert.deepEqual(outsideForms(['.btn', 'a.hx-btn, .button::after']), [
    `.btn${OUTSIDE_FORMS}`,
    `a.hx-btn${OUTSIDE_FORMS}`,
    `.button${OUTSIDE_FORMS}::after`
  ])
  assert.deepEqual(outsideForms(undefined), [])
  const { emitFor } = await import('../../../../apps/tracy-web/src/lib/ds-slot.js')
  // JA Kinetic Joomla under Moxie (7 px button padding): Subscribe went 33 px tall beside its 45 px field
  for (const platform of ['joomla', 'wordpress']) {
    const out = await emitFor({
      platform,
      contract: `${platform}-ja-kinetic`,
      id: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
    })
    assert.ok(out.ok, platform)
    const css = JSON.stringify(out)
    const padded = [...css.matchAll(/([^{}]*)\{[^{}]*padding-top:7px[^{}]*\}/g)].map((m) => m[1])
    assert.ok(padded.length, `${platform}: the system's button padding is still worn`)
    for (const sel of padded)
      for (const one of sel.split(/,(?![^(]*\))/))
        assert.ok(one.includes(OUTSIDE_FORMS), `${platform}: ${one}`)
  }
})
