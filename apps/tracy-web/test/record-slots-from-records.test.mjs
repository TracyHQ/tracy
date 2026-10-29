import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { planSite } from 'website-opportunities/domain/site-plan.mjs'
import { copyPinsOf } from '../src/sites/brief-engines/wo-copy-pins.js'
import { sourcedPinEvidence } from '../src/sites/brief-engines/copy-pin-priority.js'
import { checkRecordSlots } from '../src/opportunities-build/record-slot-check.js'

// A quote card whose author line wants evidence, as Joomla T4 maps declare it: the write gate skips such a line unless
// it carries evidence, and the demo's reviewer stayed on the page (measured 30/10/2026 on a local brief build).
const map = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-12', kind: 'module' }],
  slots: ['quote.text', 'quote.author_name', 'quote.author_context'].map((role, i) => ({
    key: `module-12.${i}`,
    entity: 'module-12',
    type: 'text',
    role,
    sample: ['Demo guest words.', 'Demo Guest', 'Demo title'][i],
    requiresEvidence: role === 'quote.author_name',
    group: { id: 'module-12.quote.0', kind: 'quote', item: 0 },
    maxCharacters: 200
  }))
}
const trades = {
  florist: {
    business: { name: 'Fernhill Florist' },
    googlePlace: { reviews: [{ author: 'Ada Quill', text: 'The bouquet lasted two weeks.' }] }
  },
  locksmith: {
    business: { name: 'Keyway Locksmiths' },
    googlePlace: { reviews: [{ author: 'Rui Penn', text: 'They opened my door in ten minutes.' }] }
  }
}

async function pinsFor(t, brief) {
  const dir = mkdtempSync(path.join(tmpdir(), 'record-slots-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(map))
  const plan = planSite(brief, { questions: [] }, { contentMap: map })
  const copy = await copyPinsOf(
    {
      copyFor: async () => ({ buildId: 'b1', pinned: {}, placeProfile: { profile: {}, assessment: [] } }),
      sitePlanFor: async () => plan
    },
    { siteKey: 'fictional', email: 'owner@example.test', contract: { id: 'fictional/1.0.0', dir }, note() {} },
    { cms: 'joomla', contentMap: map, lang: 'en' }
  )
  return { copy, plan }
}

for (const [trade, brief] of Object.entries(trades)) {
  const review = brief.googlePlace.reviews[0]
  test(`${trade}: a sourced pin is its own evidence, so the reviewer's name passes the write gate`, async (t) => {
    const { copy } = await pinsFor(t, brief)
    assert.equal(copy.pins['module-12.1'], review.author)
    const evidence = sourcedPinEvidence(copy, { ...copy.pins })
    assert.equal(evidence['module-12.1'], review.author)
  })

  test(`${trade}: a pin another step replaced, or a placeholder, carries no evidence`, async (t) => {
    const { copy } = await pinsFor(t, brief)
    const evidence = sourcedPinEvidence(
      { ...copy, pins: { ...copy.pins, 'module-12.9': '' }, sources: { ...copy.sources, 'module-12.9': 'placeholder' } },
      { ...copy.pins, 'module-12.1': brief.business.name }
    )
    assert.equal('module-12.1' in evidence, false)
    assert.equal('module-12.9' in evidence, false)
  })

  test(`${trade}: the final check is a blocker when a record slot's record is not on the site`, async (t) => {
    const { plan } = await pinsFor(t, brief)
    // The review signed by the business, its platform kept: the author line holds the wrong value.
    const signedByBusiness = `<main><blockquote>${review.text}</blockquote><p>${brief.business.name}</p><p>Google review</p></main>`
    const found = checkRecordSlots({ pages: [{ path: '/about', status: 200, html: signedByBusiness }], sitePlan: plan })
    assert.deepEqual(
      found.map((f) => [f.kind, f.severity, f.place, f.found]),
      [['record-not-shown', 'blocker', 'module-12.1', review.author]]
    )
    const signed = `<main><blockquote>${review.text}</blockquote><cite>${review.author}</cite><p>Google review</p></main>`
    assert.deepEqual(checkRecordSlots({ pages: [{ path: '/about', status: 200, html: signed }], sitePlan: plan }), [])
  })
}

test('a record of a page the plan drops is not asked for on the site', () => {
  const sitePlan = {
    pages: [{ id: 'team', path: '/team', decision: 'drop' }],
    slots: [{ key: 'module-30.0', role: 'person.name', decision: 'value', value: 'Ada Quill' }],
    honesty: { values: { 'module-30.0': { value: 'Ada Quill', reason: 'brief-person' } } }
  }
  const contentMap = {
    slots: [{ key: 'module-30.0', entity: 'module-30' }],
    pages: [{ route: 'team', assignedModules: [{ entity: 'module-30', assignmentMode: 'include' }] }]
  }
  assert.deepEqual(
    checkRecordSlots({ pages: [{ path: '/', status: 200, html: '<p>Home</p>' }], sitePlan, contentMap }),
    []
  )
})
