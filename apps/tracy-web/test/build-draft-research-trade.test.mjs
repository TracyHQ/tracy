// The trade the build chat's research ends with is the step chain's own decision (#575): with links only and no Google
// type, the category the business's own sources state (the place profile's classification) still names its trade, so
// the template list is offered; a business nothing names a trade for is asked what kind of business it is, never told
// no template fits. Every business, link and picture here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-research-trade.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { aiQuickstartCatalogue } from '../src/build-draft/ai-quickstarts.js'
import { researchTradeOf } from '../src/build-draft/research-trade.js'
import { fileDb } from './_db.mjs'
import { connector, fakeDomain, placeDetails, websiteResult } from './build-draft-gather-fakes.mjs'
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

const SITE = 'https://brackenford-hall.example/'
const NAME = 'Brackenford Hall'

/** A business whose Google place has no type and whose name, bio and pages name no trade. */
async function hallDomain({ businessType }) {
  const site = websiteResult()
  site.profile = {
    ...site.profile,
    name: NAME,
    bio: 'Open every evening on Quillan Lane.',
    businessType,
    links: []
  }
  site.pages = [{ url: SITE, title: NAME, text: `${NAME}. Open every evening.` }]
  const { domain } = await fakeDomain({
    connectors: { website: connector(site) },
    details: () => ({
      ...placeDetails(),
      displayName: { text: NAME, languageCode: 'en' },
      primaryType: undefined,
      types: []
    })
  })
  const png = await pngBytes()
  domain.fetchLimited = async (url) => ({ url, status: 200, mime: 'image/png', bytes: png, truncated: false })
  return domain
}

async function researched(businessType) {
  const objects = memoryObjects()
  const domain = await hallDomain({ businessType })
  const s = server(db.pool, { domain, objects })
  const ex = placeExecutor(db.pool, domain, objects)
  await s.call('POST', '/research', { links: [SITE], name: NAME })
  await s.app.buildDraftEngine.settled(await s.accountId())
  await drain(ex)
  const { later } = await s.poll()
  assert.equal(later.body.state, 'done', JSON.stringify(later.body))
  return { s, done: later.body }
}

test('the place profile classification names the trade when the brief has none', () => {
  const revision = {
    brief: { trade: 'unknown', business: { name: NAME } },
    place_profile: {
      profile: {
        classification: {
          derivedCategories: [
            {
              value: { taxonomy: 'tracy-trade', code: 'fitness', mappingVersion: 'tracy-trade/2' },
              derivation: { inputRefs: ['fact:website:category'] }
            }
          ]
        }
      }
    },
    research: { profile: { name: NAME } }
  }
  const domain = { tradeOfPlace: () => 'other', tradeOfSchemaType: () => 'other' }
  assert.equal(researchTradeOf({ revision, domain }), 'fitness')
  assert.equal(researchTradeOf({ revision: { brief: { trade: 'unknown' } }, domain }), null)
})

test('the released catalogue offers the boxing kit for a fitness business', () => {
  const kits = aiQuickstartCatalogue()
  assert.ok(kits.trades().includes('fitness'), JSON.stringify(kits.trades()))
  assert.ok(
    kits.templatesFor('fitness').some((t) => t.slug === 'ja-boxing'),
    JSON.stringify(kits.templatesFor('fitness'))
  )
})

test(
  'links only, no Google type: the stated category sets the trade and templates are offered',
  opts,
  async () => {
    const { s } = await researched('SportsActivityLocation')
    const { research } = (await db.pool.query('select research from build_draft')).rows[0]
    assert.equal(research.trade, 'fitness')
    const templates = await s.call('GET', '/templates')
    assert.ok(templates.body.templates.length > 0, JSON.stringify(templates.body))
  }
)

test(
  'trade unknown: the owner is asked what kind of business it is, and the answer offers templates',
  opts,
  async () => {
    const { s, done } = await researched(undefined)
    const { research } = (await db.pool.query('select research from build_draft')).rows[0]
    assert.equal(research.trade, null)
    const question = done.result.questions.find((q) => q.topic === 'business-trade')
    assert.ok(question, JSON.stringify(done.result.questions.map((q) => q.id)))
    assert.ok(question.choices.some((c) => c.id === 'fitness'))
    assert.ok(
      done.result.ask.questions.some((q) => q.id === question.id),
      'the trade question is on the card'
    )
    // Before the answer: no list, the question is still open.
    assert.deepEqual((await s.call('GET', '/templates')).body.templates, [])
    const answered = await s.call('PUT', '/answers', {
      question,
      answer: { schema: 'tracy-build-answer/v1', question: question.id, choice: 'fitness' }
    })
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
    const templates = await s.call('GET', '/templates')
    assert.ok(templates.body.templates.length > 0, JSON.stringify(templates.body))
    const after = (await db.pool.query('select research from build_draft')).rows[0].research
    assert.equal(after.trade, 'fitness', 'the answered trade is kept with the research')
  }
)
