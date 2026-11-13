// The page writer never lets the model write business data (ticket #594 review): data fields are copied from the plan
// data, data fields without data follow the block's no data rule, a data value over its limit is a plan matter, and
// written copy cannot smuggle a phone number, email address, link or price. Scripted fake models only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { PageWriterError, writePages } from '../domain/page-writer.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

async function approvedPlan() {
  const profile = clubProfile()
  const { plan } = await composePlan({
    profile,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  return { plan, profile }
}

/** A fake model that records every call and answers each asked field with `write(field)`. */
function recording(write) {
  const calls = []
  const model = async (request) => {
    const user = JSON.parse(request.user)
    calls.push(user)
    const fields = {}
    for (const block of user.blocks) for (const field of block.fields) fields[field.key] = write(field)
    return JSON.stringify({ fields })
  }
  return Object.assign(model, { calls })
}

const run = async (model, store = blockStore()) => {
  const { plan, profile } = await approvedPlan()
  return writePages({ plan, profile, blockStore: store, library: library(), model })
}
const fieldOf = (pages, key) => pages.flatMap((p) => p.fields).find((f) => f.key === key)

test('a model that invents names, reviews and a phone number cannot place one of them', async () => {
  const model = recording((f) =>
    /phone/.test(f.kind) ? '+1 555 0100' : /quote|name/.test(f.kind) ? 'Invented' : 'Fine'
  )
  const { pages } = await run(model)
  const all = pages.flatMap((p) => p.fields)
  assert.deepEqual(
    all.filter((f) => f.value === 'Invented' || f.value === '+1 555 0100'),
    []
  )
  const asked = model.calls.flatMap((u) => u.blocks.flatMap((b) => b.fields.map((f) => f.kind)))
  assert.ok(
    asked.every((kind) => !/^(offering|person|quote|contact\.(phone|email|address|hours))\./.test(kind)),
    asked.join()
  )
  const names = all.filter((f) => f.kind === 'offering.name')
  assert.deepEqual(
    names.map((f) => [f.from, f.value, f.data]),
    [
      ['data', 'Junior coaching', 'service-junior-coaching'],
      ['data', 'Adult group lessons', 'service-adult-group-lessons'],
      ['data', 'Court hire', 'service-court-hire'],
      ['data', 'Cardio tennis', 'service-cardio-tennis']
    ]
  )
  const review = fieldOf(pages, 'home-extra-7/quote-my-two-kids-love-the-junior-coaching/text')
  assert.deepEqual([review.from, review.value], ['data', 'My two kids love the junior coaching.'])
  assert.deepEqual([fieldOf(pages, 'team-b1/person-ilse-varrow/name').value], ['Ilse Varrow'])
  assert.equal(fieldOf(pages, 'home-b5/address').value, '14 Quillmoor Lane, Fernhollow')
  assert.equal(fieldOf(pages, 'home-b2/heading').from, 'writer', 'the tagline is copy')
})

test('the model sees the data values as context, never as fields to write', async () => {
  const model = recording(() => 'Fine')
  await run(model)
  const home = model.calls.find((u) => u.page.id === 'home')
  const reviews = home.blocks.find((b) => b.id === 'home-extra-7')
  assert.deepEqual(
    reviews.fields.map((f) => f.key),
    ['home-extra-7/heading']
  )
  assert.ok(reviews.shows.some((f) => f.kind === 'quote.author_name' && f.value === 'Osric Vale'))
  assert.ok(reviews.data.length === 2)
})

test('a data field without data follows the block no data rule and never stops the build', async () => {
  const store = blockStore()
  const hero = store.blocks.find((b) => b.id === 'hero-home')
  hero.fields.push({ name: 'phone_line', type: 'text', kind: 'contact.phone', limit: 30 })
  const model = recording(() => 'Fine')
  const { pages } = await run(model, store)
  const contact = pages.find((p) => p.id === 'contact')
  assert.deepEqual(
    contact.fields.map((f) => [f.key, f.from, f.action]),
    [
      ['contact-b1/address', 'data', undefined],
      ['contact-b1/hours', 'no-data', 'hide']
    ]
  )
  assert.ok(!model.calls.some((u) => u.page.id === 'contact'), 'a page of data fields only needs no call')
  const line = fieldOf(pages, 'home-b2/phone_line')
  assert.deepEqual([line.from, line.action, line.fallback], ['no-data', 'fallback', 'the template picture'])
  assert.ok(!model.calls.some((u) => u.blocks.some((b) => b.fields.some((f) => f.name === 'phone_line'))))
})

test('a data value longer than its field is a plan matter: data_over_limit, before any call', async () => {
  const store = blockStore()
  store.blocks.find((b) => b.id === 'contact-strip').fields.find((f) => f.name === 'address').limit = 10
  const model = recording(() => 'Fine')
  await assert.rejects(run(model, store), (error) => {
    assert.ok(error instanceof PageWriterError)
    assert.equal(error.code, 'data_over_limit')
    assert.deepEqual(
      error.details.fields.map((f) => [f.key, f.length, f.limit]),
      [
        ['home-b5/address', 29, 10],
        ['contact-b1/address', 29, 10]
      ]
    )
    return true
  })
  assert.equal(model.calls.length, 0)
})

test('copy that smuggles a phone number the data does not hold fails; the real one passes', async () => {
  const smuggler = recording((f) => (f.key === 'home-b2/heading' ? 'Call +1 555 0100' : 'Fine'))
  await assert.rejects(run(smuggler), (error) => {
    assert.equal(error.code, 'copy_check_failed')
    assert.deepEqual(
      error.details.failing.map((f) => [f.key, f.problems[0].code]),
      [['home-b2/heading', 'invented_data']]
    )
    return true
  })
  const honest = recording((f) => (f.key === 'home-b2/heading' ? 'Call +1 555 0142 778' : 'Fine'))
  const { pages } = await run(honest)
  assert.equal(fieldOf(pages, 'home-b2/heading').value, 'Call +1 555 0142 778')
})

test('a text field of a role without text, or of no known role, is a typed error', async () => {
  for (const [kind, code] of [
    ['business.hero_image', 'field_kind_not_text'],
    ['business.slogan', 'field_kind_unknown']
  ]) {
    const store = blockStore()
    store.blocks.find((b) => b.id === 'hero-home').fields.push({ name: 'odd', type: 'text', kind, limit: 10 })
    await assert.rejects(
      run(
        recording(() => 'Fine'),
        store
      ),
      (error) => error.code === code
    )
  }
})
