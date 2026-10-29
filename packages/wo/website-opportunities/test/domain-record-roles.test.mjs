import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planSite } from '../domain/site-plan.mjs'
import { renderLeftoverCleanupPrompt } from '../domain/leftover-cleanup.mjs'
import { isRecordRole, recordValuesOf } from '../domain/record-roles.mjs'

const served = { questions: [{ id: 'name', kind: 'text' }] }
const quoteMap = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-40', kind: 'module' }],
  slots: ['quote.text', 'quote.author_name', 'quote.author_context'].map((role, i) => ({
    key: `module-40.${i}`,
    entity: 'module-40',
    column: 'params',
    type: 'text',
    role,
    sample: ['Demo guest words.', 'Demo Guest', 'Demo title'][i],
    maxCharacters: i === 0 ? 300 : 60,
    requiresEvidence: role === 'quote.author_name',
    group: { id: 'module-40.quote.0', kind: 'quote', item: 0 }
  }))
}
const trades = {
  dental: {
    business: { name: 'Bright Arch Dental' },
    googlePlace: { reviews: [{ author: 'Mara Vale', text: 'The cleaning was gentle and quick.' }] }
  },
  bikes: {
    business: { name: 'Spoke and Chain Repairs' },
    googlePlace: { reviews: [{ author: 'Theo Brook', text: 'They trued my wheel the same day.' }] }
  }
}

test('the record roles are one list: review, video, contact, statistic and person records, never page copy', () => {
  for (const role of ['quote.author_name', 'quote.author_context', 'business.video', 'stat.value', 'person.name'])
    assert.equal(isRecordRole(role), true, role)
  for (const role of ['editorial.heading', 'editorial.paragraph', 'offering.description'])
    assert.equal(isRecordRole(role), false, role)
})

for (const [trade, brief] of Object.entries(trades)) {
  const review = brief.googlePlace.reviews[0]
  test(`${trade}: a quote card's record slots are value decisions from the review, never left to the copy writer`, () => {
    const plan = planSite(brief, served, { contentMap: quoteMap })
    const byKey = new Map(plan.slots.map((s) => [s.key, s]))
    assert.deepEqual(
      ['module-40.0', 'module-40.1', 'module-40.2'].map((key) => byKey.get(key)?.decision),
      ['value', 'value', 'value']
    )
    assert.equal(byKey.get('module-40.1').value, review.author)
    assert.equal(byKey.get('module-40.1').reason, 'brief-review')
    assert.ok(![...byKey.values()].some((s) => s.reason === 'text-by-copy' && isRecordRole(s.role)))
    assert.equal(recordValuesOf(plan)['module-40.1'], review.author)
  })

  test(`${trade}: the cleanup turn writes a record place's own record, never the business's name`, () => {
    const plan = planSite(brief, served, { contentMap: quoteMap })
    const prompt = renderLeftoverCleanupPrompt({
      leftovers: {
        findings: [{ kind: 'C07', page: '/about', place: 'module-40.1', found: 'demo guest' }]
      },
      brief,
      records: recordValuesOf(plan)
    })
    assert.match(prompt, new RegExp(`module-40\\.1 .*write exactly ${JSON.stringify(review.author)}`))
    assert.match(prompt, /never the business name/i)
  })
}

test('a record place with no record is hidden by the cleanup turn, not filled with the business name', () => {
  const prompt = renderLeftoverCleanupPrompt({
    leftovers: { findings: [{ kind: 'C07', page: '/about', place: 'module-40.1', found: 'demo guest' }] },
    brief: trades.dental,
    records: {},
    recordPlaces: ['module-40.1']
  })
  assert.match(prompt, /module-40\.1 .*hide the block: this place holds a record the brief does not have/)
})
