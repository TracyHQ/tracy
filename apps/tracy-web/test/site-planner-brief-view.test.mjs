import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PLANNER_BRIEF_VIEW, plannerBriefView } from '../src/site-planner/brief-view.js'
import { SITE_PLANNER_STEP } from '../src/site-planner/bench-worker.js'
import { firstUserMessage, preloadedFirstMessage } from '../src/lib/template-kit-source.js'
import { firstUserMessage as brandMessage } from '../src/brand-step/brand-first-message.js'
import { writerInput } from '../src/site-writer/writer-input.js'
import { briefImages } from '../src/site-pictures/owner-photos.js'
import { VISUAL_REVIEW_POLICY } from '../src/site-planner/visual-review.js'

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

const fullBrief = () =>
  freeze({
    business: { name: 'Example business' },
    assets: [
      {
        id: 'owner-photo-1',
        kind: 'image',
        sha256: 'a'.repeat(64),
        source: 'owner',
        caption: 'Photo metadata sentinel',
        width: 1200
      }
    ],
    brand: { name: { text: 'Example business' }, logo: { mediaId: 'owner-photo-1' } },
    facts: [
      { id: 'f1', field: 'service', value: 'Tennis', evidence: [{ source: 'owner', ref: 'source-1' }] }
    ],
    missing: [{ field: 'price', reason: 'Not supplied' }],
    readiness: { ready: true },
    acceptance: [{ id: 'a1', required: true }],
    sitemap: [{ id: 'home', path: '/', factIds: ['f1'] }],
    ownerContract: { fields: [{ owner: { kind: 'article', id: 7 }, path: 'title', writable: true }] }
  })
const kit = {
  ref: 'test/1',
  platform: 'joomla',
  doc: { site: {}, pages: [], blocks: [], pageGroups: [], images: [] }
}

for (const images of [false, true]) {
  test(`planner model input omits assets with images=${images} while preserving the full brief for other consumers`, () => {
    const brief = fullBrief()
    const original = structuredClone(brief)
    // The existing full-brief handoff is shared by brand, writer, pictures and the checker.
    const writerPlan = { factIds: ['f1'], pages: [] }
    const otherInputs = {
      brand: brandMessage({ kit, brief }),
      writer: writerInput({ plan: writerPlan, kit: kit.doc, brief }),
      pictures: briefImages(brief)
    }
    const row = { brief, harness: { briefView: PLANNER_BRIEF_VIEW, visualReview: VISUAL_REVIEW_POLICY } }
    const request = SITE_PLANNER_STEP.agentRequest({
      row,
      ready: { kit, images: images ? { resolve() {} } : null },
      history: []
    })
    const planned = JSON.parse(
      request.firstUser.split('Input 1, the brief, is this JSON:\n\n')[1].split('\n\n')[0]
    )
    const { assets: _assets, ...expected } = original
    assert.deepEqual(planned, expected)
    for (const field of ['facts', 'missing', 'readiness', 'acceptance', 'sitemap', 'ownerContract'])
      assert.deepEqual(planned[field], original[field])
    assert.deepEqual(brief, original)
    assert.ok(!request.firstUser.includes('Photo metadata sentinel'))
    assert.deepEqual(brandMessage({ kit, brief }), otherInputs.brand)
    assert.deepEqual(writerInput({ plan: writerPlan, kit: kit.doc, brief }), otherInputs.writer)
    assert.deepEqual(briefImages(brief), otherInputs.pictures)
    assert.equal(briefImages(brief).length, 1)
    assert.deepEqual(briefImages(brief)[0], original.assets[0])
    // The shared builder used outside the planner still receives the complete input, not a globally trimmed brief.
    const otherMessage = images ? firstUserMessage({ kit, brief }) : preloadedFirstMessage({ kit, brief })
    assert.ok(otherMessage.includes('Photo metadata sentinel'))
    assert.deepEqual(
      request.tools.map((tool) => tool.name),
      images ? ['read_kit_part', 'open_kit_image'] : []
    )
    if (images) assert.match(request.firstUser, /This run requires visual review/)
  })
}

test('a historical or unknown brief view refuses before preparation I/O and before conversation reconstruction', async () => {
  const deps = new Proxy({}, { get: () => assert.fail('No database, provider or kit I/O is allowed') })
  for (const version of [undefined, 'site-planner-brief/0', 'site-planner-brief/2']) {
    const row = { brief: fullBrief(), harness: { briefView: version } }
    // Destructuring dependencies does read properties; use inert values and an absent kit to prove view validation wins.
    const refused = await SITE_PLANNER_STEP.prepare({}, row)
    assert.equal(refused.code, 'SITE_PLANNER_BRIEF_VIEW_CHANGED')
    assert.equal(refused.ok, false)
    assert.throws(
      () => SITE_PLANNER_STEP.agentRequest({ row, ready: deps, history: [{ n: 0, state: 'answered' }] }),
      { code: 'SITE_PLANNER_BRIEF_VIEW_CHANGED' }
    )
  }
})

test('the planner view preserves briefs without assets and does not alter nested owner or write contracts', () => {
  const brief = fullBrief()
  const planned = plannerBriefView(brief, PLANNER_BRIEF_VIEW)
  assert.notEqual(planned, brief)
  assert.equal(planned.ownerContract, brief.ownerContract)
  assert.equal(planned.facts, brief.facts)
  assert.deepEqual(plannerBriefView(planned, PLANNER_BRIEF_VIEW), planned)
})
