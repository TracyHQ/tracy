// The tagline the owner marks as theirs in the build chat (decision D46 as amended, #609): the one case where the
// owner's wording is the fact. It is found only when the owner says the words ARE their tagline, slogan or motto,
// rides to the plan as the fact `business-tagline` ("Your answer"), is placed like a website's tagline (a field of
// kind `business.tagline`, the hero heading of the invented template) and shown word for word, exempt from the echo
// guard for exactly that string. Too long for every such field, it is reported, never cut. Invented club, scripted
// fakes, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-tagline.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { heldPersonFormsOf } from '../domain/held-person-forms.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { readingWithoutOwnerQuotes } from '../domain/owner-statement.mjs'
import { taglineOf } from '../domain/owner-tagline.mjs'
import { blockDescriptionsOf } from '../domain/page-writer-fields.mjs'
import { PageWriterError } from '../domain/page-writer.mjs'
import { dropOverLimitData } from '../domain/plan-data-limits.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  HELD,
  STATEMENT,
  factWriter,
  ownerPlan,
  writeOwnerPlan
} from './fixtures/owner-statement/club-owner-facts.mjs'
import { blockStore, library } from './fixtures/plan-composer/invented-club.mjs'

/** Twenty invented statements, both sides: what the detection must find, word for word, or null. */
export const TAGLINE_CASES = [
  ['Our motto is "Clay for everyone".', 'Clay for everyone'],
  ['Our tagline is Strong Hands Calm Minds.', 'Strong Hands Calm Minds'],
  ['"Shape the day" is our slogan.', 'Shape the day'],
  ["Our studio's motto is simple: make it by hand.", 'make it by hand'],
  ['Motto: Fire, glaze, repeat.', 'Fire, glaze, repeat'],
  ['We live by the motto "Slow hands, warm kilns".', 'Slow hands, warm kilns'],
  ['Our slogan has always been “Built to last”.', 'Built to last'],
  ['My strapline is Fresh bread before sunrise.', 'Fresh bread before sunrise'],
  ['Tagline: "Every bowl tells a story"', 'Every bowl tells a story'],
  ['Our own motto is "Mud is magic"!', 'Mud is magic'],
  ['We print slogans on mugs and tote bags.', null],
  ['Can you write a tagline for us?', null],
  ['We do not have a motto yet.', null],
  ['Our motto is not something we take lightly.', null],
  ['My tagline is on the business card.', null],
  ['The slogan on our old website was outdated.', null],
  ['Our slogan workshop teaches lettering on pots.', null],
  ['We sell "Clay for everyone" kits for kids.', null],
  ['Our tagline is still a work in progress.', null],
  ['Customers say our motto should be about joy.', null]
]
/** The detection before this change: any statement holding a marker word. */
const OLD = /\b(?:tag ?line|slogan|motto|strap ?line)\b/iu

test('the detection finds a marked tagline word for word, and never a sentence that only holds the word', () => {
  for (const [text, want] of TAGLINE_CASES) assert.equal(taglineOf(text), want, text)
  // The old one: every marked case, and eight sentences that only hold the word (a lost fact each time).
  const old = TAGLINE_CASES.filter(([text, want]) => OLD.test(text) !== (want !== null)).map(([t]) => t)
  assert.equal(old.length, 8)
})

const MOTTO = 'Serve, rally, smile'

/** A label of the motto item in the reading's own words: the word motto and three of its words, no run of four. */
const labelOf = (motto) =>
  `motto ${motto
    .replace(/[^\p{L}\s]/gu, '')
    .split(/\s+/u)
    .slice(0, 3)
    .join(' ')
    .toLowerCase()}`

/** The brief part of the club whose owner marks a tagline (`motto`), read from the statement by the reading. */
function taglineBrief(motto = MOTTO, { held = false, heldInBrief = held } = {}) {
  const statement = `${STATEMENT} Our motto is "${motto}".`
  const sources = readingSourcesOf({
    bio: 'Tennis club with four courts.',
    ownerStatement: statement,
    ...(held ? { heldTexts: [HELD], heldPeople: [HELD] } : {})
  })
  const answer = {
    story: [{ text: labelOf(motto), quote: `Our motto is "${motto}"`, ref: 'owner' }]
  }
  const reading = readingWithoutOwnerQuotes({
    method: 'model',
    ...checkBusinessReading(answer, sources, { trade: 'fitness' })
  })
  return {
    statement,
    brief: {
      facts: [],
      reading: { ownerFacts: reading.ownerFacts ?? [] },
      ...(heldInBrief ? { missing: [{ field: 'team', withheld: [{ values: [HELD] }] }] } : {})
    }
  }
}

test('the tagline reaches the plan as a fact of the owner and the hero heading word for word', async () => {
  const { statement, brief } = taglineBrief()
  const [fact] = brief.reading.ownerFacts
  assert.deepEqual([fact.kind, fact.value], ['owner-tagline', MOTTO])
  const built = await ownerPlan(brief)
  assert.deepEqual(built.research.sources.find((s) => s.id === 'owner-statement').ownerTagline.value, MOTTO)
  const planned = built.plan.facts.find((f) => f.id === 'business-tagline')
  assert.deepEqual(planned, {
    id: 'business-tagline',
    kind: 'business.tagline',
    label: 'Tagline',
    value: MOTTO,
    sources: [{ kind: 'answer', name: 'Your answer' }]
  })
  const hero = built.plan.pages[0].blocks.find((b) => b.block === 'hero-home')
  assert.ok(hero.data.includes('business-tagline'))
  // The writer writes the other fields; the heading is the owner's words, never asked of the model.
  const model = factWriter()
  const written = await writeOwnerPlan(built, model, statement)
  const heading = written.pages[0].fields.find((f) => f.key === `${hero.id}/heading`)
  assert.deepEqual([heading.from, heading.value, heading.data], ['data', MOTTO, 'business-tagline'])
  for (const call of model.calls)
    assert.ok(!JSON.parse(call.user).blocks.some((b) => b.fields?.some((f) => f.key === heading.key)))
})

/** A writer that writes `text` in every field it fits, and a short fitting value elsewhere. */
function everyField(text) {
  return async (request) => {
    const fields = {}
    for (const block of JSON.parse(request.user).blocks)
      for (const field of block.fields)
        fields[field.key] = field.limit >= text.length ? text : `${field.name} ok`.slice(0, field.limit)
    return JSON.stringify({ fields })
  }
}

test('only that string is exempt: the tagline elsewhere stands, another owner sentence still copies', async () => {
  const { statement, brief } = taglineBrief()
  const built = await ownerPlan(brief)
  const ok = await writeOwnerPlan(built, everyField(MOTTO), statement)
  assert.equal(ok.pages.length, 3)
  const error = await writeOwnerPlan(
    built,
    everyField('We have coached tennis on our four courts'),
    statement
  ).then(
    () => null,
    (e) => e
  )
  assert.ok(error instanceof PageWriterError)
  assert.equal(error.code, 'copy_check_failed')
  assert.ok(error.details.failing.length > 0)
  assert.ok(error.details.failing.every((f) => f.problems.some((p) => p.code === 'copies_owner')))
})

test('a tagline longer than every tagline field is reported with its reason, never cut', async () => {
  const long = 'Serve it, rally it, smile at every single lesson'
  assert.ok(long.length > 42)
  const built = await ownerPlan(taglineBrief(long).brief)
  const shown = built.plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data))
  assert.ok(!shown.includes('business-tagline'))
  const out = built.plan.leftOut.find((e) => e.what === 'Tagline')
  assert.match(out.reason, /longer than every place your design has for it, and Tracy never shortens it/)
  assert.equal(out.code, 'fact_longer_than_every_place')
  assert.ok(!JSON.stringify(built.plan.pages).includes('Serve it, rally'))
})

test('a too long tagline the composer itself puts on a block leaves it by the limits rule, never cut', async () => {
  const long = 'Serve it, rally it, smile at every single lesson'
  const built = await ownerPlan(taglineBrief(long).brief)
  const pages = structuredClone(built.plan.pages)
  pages[0].blocks.find((b) => b.block === 'hero-home').data.push('business-tagline')
  const { dropped } = dropOverLimitData(
    pages,
    blockDescriptionsOf(blockStore(), library()),
    planDataOf(built.profile)
  )
  assert.deepEqual(
    dropped.map((d) => [d.id, d.code, d.limit]),
    [['business-tagline', 'data_over_limit', 42]]
  )
})

test('a tagline naming a held person is set aside, and no form of the name reaches a request', async () => {
  // The reading never reads the sentence: it names a held person.
  assert.deepEqual(taglineBrief(`${HELD} serves best`, { held: true }).brief.reading.ownerFacts, [])
  // A brief that carries one anyway (an older reading): the research sets it aside by id, never its words.
  const { brief } = taglineBrief(`${HELD} serves best`, { heldInBrief: true })
  const research = researchOf(brief)
  assert.equal(research.sources.find((s) => s.id === 'owner-statement')?.ownerTagline, undefined)
  assert.ok(research.setAside.some((a) => a.reason === 'it names a text the owner keeps off the site'))
  const built = await ownerPlan(brief)
  const model = factWriter()
  await writeOwnerPlan(built, model)
  const all = JSON.stringify([built.plan, research.sources, ...model.calls]).toLowerCase()
  const { forms } = heldPersonFormsOf(HELD)
  for (const form of forms) assert.ok(!all.includes(form.toLowerCase()), form)
})
