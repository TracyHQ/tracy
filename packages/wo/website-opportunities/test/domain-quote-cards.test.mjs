// A guest quote card holds only one sourced review, whole, or nothing (spec TracyHQ/tracy#189, criterion 2.2). Two
// invented businesses: a bike repair shop with one Google review, and a bakery with none.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strayQuoteLinesOf } from '../domain/quote-cards.mjs'
import { planHonesty } from '../domain/site-plan-honesty.mjs'

const quote = { id: 'module-40.quote.0', item: 0, kind: 'quote' }
const field = (key, path, role, sample, group = null, max = 300) => ({
  key,
  entity: 'module-40',
  column: 'params',
  nestedJson: 'block-config',
  type: 'text',
  sample,
  maxCharacters: max,
  jsonPath: path,
  role,
  ...(group ? { group } : {})
})
/** A pull-quote block: a heading with the quote mark, a longer body, the reviewer and the section's own heading. */
const card = (headingRole, headingGroup) => ({
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-40', kind: 'module' }],
  slots: [
    field('module-40.1', ['pull', 'pull[title]', 0], headingRole, 'Demo pull quote.', headingGroup, 120),
    field('module-40.2', ['pull', 'pull[desc]', 0], 'quote.text', 'Demo body of the quote.', quote, 500),
    field('module-40.3', ['pull', 'pull[name]', 0], 'quote.author_name', 'Demo Name', quote, 40),
    field('module-40.4', ['section-title'], 'editorial.heading', 'What people say')
  ]
})
const BIKES = {
  business: { name: 'Spoke & Chain Repairs', trade: 'bike repair' },
  googlePlace: {
    reviews: [{ author: 'Rowan Vale', text: 'They trued my back wheel in under an hour. Fair price too.' }]
  }
}
const BAKERY = { business: { name: 'Crumb Street Bakery', trade: 'bakery' } }

test('a line of a quote card outside its group is emptied, never left to the copy writer', () => {
  const map = card('editorial.paragraph', null)
  assert.deepEqual(
    strayQuoteLinesOf(map).map((s) => s.slot.key),
    ['module-40.1']
  )
  for (const brief of [BIKES, BAKERY]) {
    const { honesty } = planHonesty(brief, map)
    const blank = honesty.blanks.find((b) => b.key === 'module-40.1')
    assert.equal(blank?.reason, 'quote-card-line', brief.business.name)
    assert.equal(honesty.values['module-40.1'], undefined)
    // The section heading is no line of the card: the copy writer still writes it.
    assert.ok(!honesty.blanks.some((b) => b.key === 'module-40.4'))
  }
})

test("a card with two quote word slots shows the review's words once, with its real reviewer", () => {
  const { honesty } = planHonesty(BIKES, card('quote.text', quote))
  const words = BIKES.googlePlace.reviews[0].text
  const written = ['module-40.1', 'module-40.2'].filter((k) => honesty.values[k]?.value === words)
  assert.equal(written.length, 1, 'the review is written in one slot only')
  assert.equal(honesty.values['module-40.3']?.value, 'Rowan Vale, Google review')
  // The bakery holds no review: every line of the card is emptied, nothing is written.
  const none = planHonesty(BAKERY, card('quote.text', quote)).honesty
  for (const k of ['module-40.1', 'module-40.2', 'module-40.3']) {
    assert.equal(none.values[k], undefined, k)
    assert.ok(
      none.blanks.some((b) => b.key === k),
      k
    )
  }
})
