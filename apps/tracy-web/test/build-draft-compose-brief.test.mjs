// The build chat's plan step reads the content brief research stored (gap audit of the plan stage, 17/11/2026): its
// key messages, audience and held fields reach the composer's model, and what no block can show (a WhatsApp number)
// is in the plan card's left out list; every section of the step chain's planner prompt is accounted for in the
// composer prompt's mapping (copied, adapted or dropped, with why). The invented club; scripted fake model only, no
// database. The quality of a real model's plan is not judged here.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-compose-brief.test.mjs
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { after, test } from 'node:test'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { composeStep } from '../src/build-draft/engine-steps.js'
import { KIT_ROOT, kits } from './build-draft-engine-fixtures.mjs'

after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

const WHATSAPP = '+00 555 0177 01'
const brief = {
  keyMessages: [{ id: 'km-1', label: 'Courts open to every level', factRefs: ['f-1'] }],
  reading: { audience: [{ label: 'Weekend players' }] },
  missing: [{ field: 'prices', why: 'No supported price is available: show no price.' }],
  contact: { whatsapp: { number: WHATSAPP } }
}
const compose = (research, model) =>
  composeStep(
    { research, answers: [], template: club.template(), brand: club.brand() },
    { model, kit: kits.loadKit(club.template().slug) }
  )

test('the stored brief reaches the composer; what no block can show is left out on the plan card', async () => {
  // With a brief, the reply carries the intent the prompt asks for (#575, `plan-intent.mjs`).
  const model = club.scriptedModel(JSON.stringify(club.withIntentNotes(club.goodComposition(), ['km-1'])))
  const { plan } = await compose({ profile: club.clubProfile(), brief }, model)
  const sent = JSON.parse(model.calls[0].user)
  assert.deepEqual(sent.brief, {
    keyMessages: [{ id: 'km-1', label: 'Courts open to every level' }],
    audience: ['Weekend players'],
    held: [{ field: 'prices', why: 'No supported price is available: show no price.' }]
  })
  assert.ok(!model.calls[0].user.includes(WHATSAPP))
  assert.ok(plan.leftOut.some((e) => e.what === 'WhatsApp' && e.code === 'no_place_for_whatsapp'))
})

test('a research record without a brief composes as before', async () => {
  const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
  const { plan } = await compose({ profile: club.clubProfile() }, model)
  assert.ok(!('brief' in JSON.parse(model.calls[0].user)))
  assert.ok(!plan.leftOut.some((e) => e.what === 'WhatsApp'))
})

test('every section of the step chain planner prompt is mapped in the composer prompt mapping', () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')
  const planner = read('../src/site-planner/planner-prompt.md')
  const mapping = read('../../../packages/wo/website-opportunities/domain/plan-composer-prompt-mapping.md')
  const rows = new Set(
    mapping
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('|---'))
      .map((line) => line.split('|')[1].trim())
  )
  const sections = [...planner.matchAll(/^## (.+)$/gm)].map((m) => m[1])
  assert.ok(sections.length >= 12)
  for (const section of sections) assert.ok(rows.has(section), section)
})
