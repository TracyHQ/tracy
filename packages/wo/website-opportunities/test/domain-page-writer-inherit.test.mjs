// What the build chat's page writer inherits from the step chain's site writer (#575, page writer audit): what each
// block and page is for reaches the writer, accent words (W16), returned fields, the template's name (W07), quotes
// (W05) and numbers held to the field's own block (W04). The invented club, scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-page-writer-inherit.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { withEmphasisMarkers } from '../domain/page-writer-emphasis.mjs'
import { PAGE_WRITER_PROMPT, writePages } from '../domain/page-writer.mjs'
import { dataView } from '../domain/page-writer-request.mjs'
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

const HERO = 'home-b2/heading'
const SERVICES = 'home-b3/heading'
const SPAN_END = {
  emphasis: [{ tag: 'br' }, { tag: 'span', attrs: '', at: 'end' }],
  from: 'template-kit',
  write: 'codes'
}

async function approved() {
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

/** A store whose hero heading the template draws with an accent span at its end. */
const accentStore = () => {
  const store = blockStore()
  store.blocks.find((b) => b.id === 'hero-home').fields.find((f) => f.name === 'heading').inline = SPAN_END
  return store
}

/** A field the fake model leaves out of `fields`. */
const SKIP = Symbol('skip')

/** A fake model: `write(field, user)` answers each field (default a fitting text), `extra(user)` adds reply keys. */
function scripted(write = () => undefined, extra = () => ({})) {
  const calls = []
  const model = async (request) => {
    const user = JSON.parse(request.user)
    calls.push(user)
    const fields = {}
    for (const block of user.blocks)
      for (const field of block.fields) {
        const value = write(field, user)
        if (value !== SKIP)
          fields[field.key] = value ?? `${field.name} of ${user.page.id}`.slice(0, field.limit)
      }
    return JSON.stringify({ fields, ...extra(user) })
  }
  return Object.assign(model, { calls })
}

const run = async (model, { store = blockStore(), change = (p) => p } = {}) => {
  const { plan, profile } = await approved()
  return writePages({
    plan: change(plan),
    profile,
    blockStore: store,
    library: library(),
    model,
    template: template()
  })
}
const fieldOf = (out, key) => out.pages.flatMap((p) => p.fields).find((f) => f.key === key)

test('what each block and page is for reaches the writer, read defensively', async () => {
  const model = scripted()
  await run(model, {
    change: (plan) => {
      plan.primaryAction = 'Book a court'
      plan.pages[0].visitorQuestion = 'Can I play here this week?'
      plan.pages[0].keyMessage = 'Courts for every level'
      plan.pages[0].blocks[2].message = 'Coaching comes first'
      plan.pages[0].blocks[2].carries = ['proof']
      return plan
    }
  })
  const home = model.calls.find((u) => u.page.id === 'home')
  assert.equal(home.primaryAction, 'Book a court')
  assert.equal(home.page.visitorQuestion, 'Can I play here this week?')
  assert.equal(home.page.keyMessage, 'Courts for every level')
  const services = home.blocks.find((b) => b.id === 'home-b3')
  assert.equal(services.reason, 'All four things you offer, coaching first.')
  assert.equal(services.message, 'Coaching comes first')
  assert.deepEqual(services.carries, ['proof'])
  // Absent fields are absent, never empty.
  const team = model.calls.find((u) => u.page.id === 'team')
  assert.equal(team.page.visitorQuestion, undefined)
  assert.equal(team.blocks[0].message, undefined)
})

test('accent words: asked where the template draws them, checked, and wrapped in the declared span', async () => {
  const model = scripted(
    (field, user) => (user.rewrite && field.key === HERO ? 'Play at the Club' : undefined),
    (user) => (user.page.id === 'home' ? { emphasis: { [HERO]: user.rewrite ? 'Club' : 'Racquet' } } : {})
  )
  const out = await run(model, { store: accentStore(), change: (p) => p })
  const first = model.calls.find((u) => u.page.id === 'home' && !u.rewrite)
  const hero = first.blocks.flatMap((b) => b.fields).find((f) => f.key === HERO)
  assert.deepEqual(hero.emphasis, { at: 'end' })
  // "Racquet" is not words of the text: sent back once (W16).
  const rewrite = model.calls.find((u) => u.page.id === 'home' && u.rewrite)
  assert.deepEqual(
    rewrite.rewrite.map((f) => f.key),
    [HERO]
  )
  assert.deepEqual([fieldOf(out, HERO).value, fieldOf(out, HERO).emphasis], ['Play at the Club', 'Club'])
  assert.equal(
    withEmphasisMarkers('Play at the Club', 'Club', SPAN_END),
    'Play at the ((br/))((span))Club((/span))'
  )
  assert.equal(
    withEmphasisMarkers('Play at the Club', 'Club', { ...SPAN_END, write: 'html' }),
    'Play at the Club'
  )
})

test('an emphasis on a field the template draws plainly is sent back', async () => {
  const model = scripted(undefined, (user) =>
    user.page.id === 'home' && !user.rewrite ? { emphasis: { [SERVICES]: 'heading' } } : {}
  )
  await run(model)
  const rewrite = model.calls.find((u) => u.page.id === 'home' && u.rewrite)
  assert.ok(rewrite.rewrite.find((f) => f.key === SERVICES).problems.some((p) => /draws no words/.test(p)))
})

test('a field the writer returns with a reason follows its block no data rule', async () => {
  const model = scripted(
    (field) => (field.key === SERVICES ? SKIP : undefined),
    (user) => (user.page.id === 'home' ? { returns: [{ key: SERVICES, reason: 'Nothing true fits.' }] } : {})
  )
  const out = await run(model)
  const services = fieldOf(out, SERVICES)
  assert.deepEqual(
    [services.from, services.action, services.returned],
    ['no-data', 'hide', 'Nothing true fits.']
  )
  assert.equal(model.calls.length, 2, 'no rewrite: a returned field is not a failure')
})

test('the template name, a quote and a number of another block are sent back', async () => {
  const model = scripted((field, user) => {
    if (user.rewrite) return undefined
    if (field.key === HERO) return 'An Example Court club'
    if (field.key === SERVICES) return 'Members say "the best courts in the county"'
    return undefined
  })
  await run(model)
  const rewrite = model.calls.find((u) => u.page.id === 'home' && u.rewrite)
  const codes = Object.fromEntries(rewrite.rewrite.map((f) => [f.key, f.problems.join(' ')]))
  assert.match(codes[HERO], /template's name/)
  assert.match(codes[SERVICES], /no passage of a review/)
  const counting = scripted((field, user) =>
    !user.rewrite && field.key === HERO
      ? '4 ways to play'
      : !user.rewrite && field.key === SERVICES
        ? '4 ways to play here'
        : undefined
  )
  await run(counting)
  const second = counting.calls.find((u) => u.page.id === 'home' && u.rewrite)
  // The services block shows four services: "4" is their count. The hero shows none: "4" is invented there.
  assert.deepEqual(
    second.rewrite.map((f) => f.key),
    [HERO]
  )
})

test('a person the customers named in reviews reaches the writer marked, so it writes name and role only', () => {
  const byId = new Map([
    [
      'p-1',
      {
        what: 'item',
        kind: 'person',
        entry: { id: 'p-1', label: 'Odile Varnsby' },
        source: { namedBy: 'customer', fields: { 'person.name': { value: 'Odile Varnsby' } } }
      }
    ],
    [
      'p-2',
      { what: 'item', kind: 'person', entry: { id: 'p-2', label: 'Brannoc Tull' }, source: { fields: {} } }
    ]
  ])
  assert.equal(dataView('p-1', byId).namedBy, 'customer')
  assert.equal('namedBy' in dataView('p-2', byId), false)
  assert.match(PAGE_WRITER_PROMPT, /namedBy: "customer"/)
})
