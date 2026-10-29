import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyJobs, repeatedSentences } from '../src/distinct-copy.mjs'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'

const DEMO = 'Ten rounds and forty five minutes split between two styles of training, then a calm cooldown.'

/** One About-like section: two paragraph slots whose demo carries the same sentence. */
const sectionOf = (entity) =>
  [
    ['top-desc', 'top-desc'],
    ['hero-paragraph', 'hero / title']
  ].map(([id, label]) => ({
    key: `${entity}.${id}`,
    entity,
    type: 'text',
    role: 'editorial.paragraph',
    label: `Our Story / ${label}`,
    maxCharacters: 400,
    sample: DEMO
  }))

for (const [name, entity, about, same, distinct] of [
  [
    'Cedar Bakery',
    'module-7',
    'A family bakery that bakes sourdough every morning.',
    'We bake sourdough, rye and seeded loaves fresh every single morning for the street.',
    'Order ahead and collect warm bread before work.'
  ],
  [
    'Willow Dental',
    'module-9',
    'A friendly dental clinic for families.',
    'Gentle checkups, fillings and whitening for every member of your family, all in one place.',
    'Book online and see a dentist within the week.'
  ]
]) {
  test(`${name}: slots of one section whose demo repeats are given distinct jobs`, async () => {
    const slots = sectionOf(entity)
    const jobs = copyJobs(slots)
    assert.equal(jobs.get(slots[0].key).job, 'lead')
    assert.equal(jobs.get(slots[1].key).job, 'body')
    assert.deepEqual(jobs.get(slots[0].key).distinctFrom, [slots[1].key])
    let seen
    await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots },
      site: { name, about, sourceLanguage: 'en' },
      generate: async ({ input }) => {
        seen = input
        return { values: Object.fromEntries(slots.map((s, i) => [s.key, [same, distinct][i]])), pending: [] }
      }
    })
    assert.equal(seen.slots[1].job, 'body')
    assert.deepEqual(seen.slots[1].distinctFrom, [slots[0].key])
  })

  test(`${name}: a duplicate answer is rejected, rewritten, and never written twice`, async () => {
    const slots = sectionOf(entity)
    let calls = 0
    const fixes = []
    const result = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots },
      site: { name, about, sourceLanguage: 'en' },
      generate: async ({ input }) => {
        calls += 1
        if (input.fix) fixes.push(input.fix)
        const second = input.fix ? distinct : same
        return { values: { [slots[0].key]: same, [slots[1].key]: second }, pending: [] }
      }
    })
    assert.equal(calls, 2)
    assert.match(fixes[0], /repeats the same sentence/)
    assert.equal(result.changes[slots[0].key], same)
    assert.equal(result.changes[slots[1].key], distinct)
  })

  test(`${name}: an answer that stays a duplicate pends the later slot instead of writing it`, async () => {
    const slots = sectionOf(entity)
    const result = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots },
      site: { name, about, sourceLanguage: 'en' },
      generate: async () => ({ values: { [slots[0].key]: same, [slots[1].key]: `${same} ` }, pending: [] })
    })
    assert.equal(result.changes[slots[0].key], same)
    assert.equal(result.changes[slots[1].key], undefined)
    assert.deepEqual(result.pending, [slots[1].key])
    assert.equal(result.reasons[slots[1].key], 'duplicate-copy')
  })
}

test('a verbatim repeat on one page is refused even across two sections', async () => {
  const line = 'Visit us any weekday and meet the people who run this place every day.'
  const slots = ['module-1', 'module-2'].map((entity) => ({
    key: `${entity}.0`,
    entity,
    type: 'text',
    role: 'editorial.paragraph',
    label: 'Intro',
    maxCharacters: 300,
    sample: `Demo text number ${entity} that is long enough to count`
  }))
  const pages = [
    {
      entity: 'menuItem-5',
      assignedModules: slots.map((s) => ({ entity: s.entity, assignmentMode: 'include' }))
    }
  ]
  const result = await planJoomlaContract({
    state: { contract: 'fictional/v1', revision: 'r', slots, pages },
    site: { name: 'Cedar Bakery', about: 'A bakery.', sourceLanguage: 'en' },
    generate: async () => ({ values: Object.fromEntries(slots.map((s) => [s.key, line])), pending: [] })
  })
  assert.equal(result.changes['module-1.0'], line)
  assert.equal(result.reasons['module-2.0'], 'duplicate-copy')
})

test('repeatedSentences finds a sentence said twice in one rendered section', () => {
  const text = 'We bake fresh bread every morning. Order ahead today. We bake fresh bread every morning.'
  assert.deepEqual(repeatedSentences(text), ['We bake fresh bread every morning.'])
  assert.deepEqual(repeatedSentences('Short. Short.'), [])
})
