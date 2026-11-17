// The held opening hours settled before compose never stop the plan (#575 walk, 17/11/2026): the owner answered a
// three page card (the hours one source alone gives, Keep; the phone two sources disagree on; the main button), chose
// the template, the brand step ran, and compose stopped `answer_invalid` because the held hours answer reached the plan
// composer, which knows no such question. The whole path runs here as the dsh tool calls it: the step chain's place
// research over the database (its network doors faked), the answers, the template, the brand step (a fake), the brief
// made again with the hours pick, and compose. Every business, phone number and link is invented; models are scripted.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-held-hours-compose.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { ANSWER_READING_PROMPT } from 'website-opportunities/domain/answer-reading.mjs'
import { NEEDS_PROFILE_PROMPT } from 'website-opportunities/domain/needs-profile.mjs'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { answersCarriedOver } from '../src/build-draft/answers-kept.js'
import { fileDb } from './_db.mjs'
import { kits } from './build-draft-engine-fixtures.mjs'
import {
  connector,
  fakeDomain,
  MAPS,
  placeDetails,
  SITE,
  websiteResult
} from './build-draft-gather-fakes.mjs'
import {
  drain,
  memoryObjects,
  placeExecutor,
  pngBytes,
  server
} from './build-draft-place-research-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const one = async (sql, params) => (await db.pool.query(sql, params)).rows[0]
const SITE_PHONE = '+1 555 0142 318'
const GOOGLE_PHONE = '+1 555 0199 777'
const SAID = `Call ${SITE_PHONE}.`
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** The invented bakery: its website gives one phone, Google another and open 24 hours every day. */
async function domainOf() {
  const png = await pngBytes()
  const { domain } = await fakeDomain({
    connectors: {
      website: connector(() => {
        const site = websiteResult()
        site.profile.bio = `Sourdough baked before dawn since 2011. ${SAID}`
        return site
      })
    },
    details: () => ({
      ...placeDetails(),
      nationalPhoneNumber: GOOGLE_PHONE,
      regularOpeningHours: { weekdayDescriptions: DAYS.map((d) => `${d}: Open 24 hours`) }
    })
  })
  domain.fetchLimited = async (url) => ({ url, status: 200, mime: 'image/png', bytes: png, truncated: false })
  return domain
}

/** A plan of one page the invented club template holds, naming the phone and the address. */
const composition = () => ({
  pages: [
    {
      pageType: 'home',
      name: 'Home',
      blocks: [
        { block: 'header-main', label: 'Top bar', data: ['contact-phone'], reason: 'Visitors can call.' },
        {
          block: 'hero-home',
          label: 'Top banner',
          data: ['business-name'],
          reason: 'Your name first.',
          targets: ['heading']
        },
        {
          block: 'contact-strip',
          label: 'Contact',
          data: ['contact-phone', 'contact-address'],
          reason: 'Visitors can call or find you.'
        },
        { block: 'footer-main', label: 'Footer', data: ['business-name'], reason: 'Your name at the end.' }
      ]
    }
  ],
  assumptions: [],
  leftOut: []
})

/**
 * One scripted build model for every step: the needs profile reads the website's phone, the answer reading reads
 * nothing in typed hours (`readsHours: false`), the plan composer answers the composition.
 */
const modelOf = () => async (request) => {
  if (request?.system === NEEDS_PROFILE_PROMPT)
    return JSON.stringify({
      languages: [{ source: 'website', language: 'en' }],
      facts: [{ source: 'website', kind: 'contact.phone', value: SITE_PHONE, evidence: SAID }],
      items: []
    })
  if (request?.system === ANSWER_READING_PROMPT)
    return JSON.stringify({
      answers: JSON.parse(request.user).answers.map((a) => ({ question: a.question, facts: [] }))
    })
  return JSON.stringify(composition())
}

/** One server over the invented bakery's research. */
async function serverOf() {
  const domain = await domainOf()
  const objects = memoryObjects()
  // The invented club's template is the one offered, whatever the bakery's trade.
  const offered = { ...kits, templatesFor: () => kits.templatesFor('fitness'), trades: () => ['food'] }
  const s = server(db.pool, {
    domain,
    objects,
    model: modelOf(),
    offered,
    brandStep: async () => club.brand()
  })
  return { s, ex: placeExecutor(db.pool, domain, objects) }
}

/** Research the links and wait for the research's questions. */
async function researchOf({ s, ex }) {
  await s.call('POST', '/research', { links: [SITE, MAPS] })
  await s.app.buildDraftEngine.settled(await s.accountId())
  await drain(ex)
  const { later } = await s.poll()
  assert.equal(later.body.state, 'done', JSON.stringify(later.body))
  return later.body.result.questions
}

/** Research the links, and answer the research's card as `answer(question)` says. */
async function researched(answerOf, running) {
  const { s, ex } = running ?? (await serverOf())
  const questions = await researchOf({ s, ex })
  for (const question of questions) {
    const answer = { schema: 'tracy-build-answer/v1', question: question.id, ...answerOf(question) }
    const put = await s.call('PUT', '/answers', { question, answer })
    assert.equal(put.status, 200, JSON.stringify(put.body))
  }
  return { s, ex, questions }
}

/** Choose the template (the brand step runs), then ask for the plan as the tool does. */
async function composed(s) {
  const { accent: _accent, ...template } = club.template()
  assert.equal((await s.call('PUT', '/template', { template })).status, 200)
  await s.app.buildDraftEngine.settled(await s.accountId())
  await s.call('POST', '/compose', {})
  await s.app.buildDraftEngine.settled(await s.accountId())
  return s.call('GET', '/engine')
}

const first = (question) => ({
  choice: question.choices.find((c) => c.recommended)?.id ?? question.choices[0].id
})

test(
  'Keep on the held hours, a phone conflict and the main button: compose ends with the plan',
  opts,
  async () => {
    const { s, questions } = await researched(first)
    assert.deepEqual(
      questions.map((q) => q.id),
      ['held-hours', 'fact-conflict.facts.contact.phone', 'main-button'],
      'the three page card of the walk'
    )
    const ended = await composed(s)
    const row = await one('select fault, answers, research, plan, needs_profile from build_draft')
    assert.equal(row.fault, null, JSON.stringify(row.fault))
    assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
    assert.deepEqual(JSON.parse(row.research.heldHoursSettled), ['held-hours', 'keep', null])
    // The owner's other answers still count: the phone they chose and their main button.
    assert.deepEqual(
      row.answers.map((a) => a.question),
      ['fact-conflict.facts.contact.phone', 'main-button']
    )
    const conflict = row.needs_profile.conflicts.find(
      (c) => c.question === 'fact-conflict.facts.contact.phone'
    )
    assert.equal(conflict.chosenBy, 'answer')
    assert.equal(row.needs_profile.facts['contact.phone'][0].value, conflict.chosen)
    assert.ok(row.needs_profile.facts['contact.cta_label']?.[0]?.value, 'the main button is the plan fact')
    // The held hours answer settled the hours, and nothing was dropped as unanswerable.
    assert.deepEqual(row.research.answersDropped, [{ question: 'held-hours', reason: 'question_gone' }])
    assert.ok(row.plan, 'the plan is in the draft')
  }
)

test('typed hours that cannot be read stay held, and compose still ends with the plan', opts, async () => {
  const { s } = await researched((question) =>
    question.id === 'held-hours' ? { text: 'the usual times' } : first(question)
  )
  const ended = await composed(s)
  const row = await one('select fault, research, plan from build_draft')
  assert.equal(row.fault, null, JSON.stringify(row.fault))
  assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
  assert.ok(row.research.heldHoursSettled, 'settled, never asked twice')
  assert.ok(row.plan)
})

test(
  'the hours kept once stay the business pick: a fresh research of the same links does not ask them again',
  opts,
  async () => {
    const { s, ex } = await researched(first)
    await composed(s)
    const over = await s.call('POST', '/start-over', { confirm: true })
    assert.ok(over.status < 300, JSON.stringify(over.body))
    const again = await researchOf({ s, ex })
    assert.ok(!again.some((q) => q.id === 'held-hours'), 'the brief no longer holds the hours')
    const { research } = await one('select research from build_draft')
    assert.ok(!(research.brief.missing ?? []).some((m) => m?.field === 'hours'))
    assert.equal(research.brief.facts.find((f) => f.field === 'hours')?.onSite, true)
  }
)

test('a research made again carries each answer onto its question as asked now, or drops it with a record', () => {
  const choices = (...labels) => labels.map((label, i) => ({ id: `value-${i + 1}`, label }))
  const phone = {
    id: 'phone',
    prompt: 'Which phone?',
    choices: choices('+1 555 0100 001', '+1 555 0100 002')
  }
  const button = { id: 'button', prompt: 'Main button?', choices: choices('Call', 'Visit') }
  const gone = { id: 'gone', prompt: 'Gone?', choices: choices('Yes') }
  const answer = (question, choice) => ({ schema: 'tracy-build-answer/v1', question, choice })
  const draft = {
    questions: [phone, button, gone],
    answers: [answer('phone', 'value-2'), answer('button', 'value-1'), answer('gone', 'value-1')]
  }
  // The phone question came back with its values in the other order; the main button no longer offers Call.
  const asked = [
    { ...phone, choices: choices('+1 555 0100 002', '+1 555 0100 001') },
    { ...button, choices: choices('Visit') }
  ]
  const carried = answersCarriedOver(draft, asked)
  assert.deepEqual(carried.answers, [answer('phone', 'value-1')], 'the same number, under its new choice id')
  assert.deepEqual(carried.questions, [asked[0]])
  assert.deepEqual(carried.dropped, [
    { question: 'button', reason: 'choice_gone' },
    { question: 'gone', reason: 'question_gone' }
  ])
})
