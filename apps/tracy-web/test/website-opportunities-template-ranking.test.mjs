// How the template picker groups the cards for a business's trade, against the 32 cards dev offered on 26/10/2026.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { recommendTemplate, templateRankingOf } from '../src/opportunities-build/demo-actions.js'
import { autoTemplate, templateRanking, tradeOfWords } from '../src/lib/wo-revision-choice.js'

const devCards = JSON.parse(
  readFileSync(new URL('./fixtures/wo-template-cards-dev-2026-10-26.json', import.meta.url), 'utf8')
)
const templates = { cards: devCards }

test('Harbour Sport Club, a fitness business: JA Boxing is made for it, the business templates fit it', () => {
  assert.equal(tradeOfWords('Harbour Sport Club'), 'fitness')
  assert.deepEqual(templateRanking(templates, 'fitness'), {
    trade: 'fitness',
    recommended: ['ja-boxing'],
    generic: ['ja-morgan', 'ja-smallbiz']
  })
})

test('the boxing words match JA Boxing and no other card of the dev catalogue', () => {
  const fitness = devCards.filter((card) => templateRanking({ cards: [card] }, 'fitness').recommended.length)
  assert.deepEqual(
    fitness.map((card) => card.id),
    ['ja-boxing']
  )
  // The words alone, card by card: a boxing studio, a martial arts school, a swimming club.
  for (const blurb of [
    'A boxing studio website featuring class descriptions, workout details and membership plans.',
    'A martial arts school with class times.',
    'A swimming club with lessons.',
    'A tennis and padel academy.',
    'Personal training and coaching for busy people.'
  ])
    assert.deepEqual(
      templateRanking({ cards: [{ id: 'x', label: 'X', card: { blurb } }] }, 'fitness').recommended,
      ['x'],
      blurb
    )
})

test('a tennis or padel coach is a fitness business by its own words', () => {
  assert.equal(tradeOfWords('Padel & Tennis Coach'), 'fitness')
  assert.equal(tradeOfWords('Ace Padel Dubai'), 'fitness')
  assert.equal(tradeOfWords('Kids tennis coaching in Jumeirah'), 'fitness')
})

test('the auto pick of a fitness business is JA Boxing now, on the CMS it exists on', () => {
  const t = autoTemplate(templates, { trade: 'fitness', seed: 'harbour-sport-club' })
  assert.deepEqual([t.design, t.platform, t.reason], ['ja-boxing', 'joomla', 'auto:trade-match:fitness'])
})

test('a trade no card is made for (home services) still gets the generic group, and nothing recommended', () => {
  const ranking = templateRanking(templates, 'home')
  assert.deepEqual(ranking?.recommended, [])
  assert.deepEqual(ranking?.generic, ['ja-morgan', 'ja-smallbiz'])
})

test('no trade, other, a trade no business has, or no catalogue: no ranking, the picker as it is', () => {
  for (const trade of [null, undefined, '', 'other', 'music', 'editorial'])
    assert.equal(templateRanking(templates, trade), null, String(trade))
  assert.equal(templateRanking({ error: 'TEMPLATES_UNREADABLE' }, 'fitness'), null)
})

test('each card once, in catalogue order, whatever platforms it lists', () => {
  const cards = [
    { id: 'gym', label: 'Gym', card: { blurb: 'A gym site.' } },
    { id: 'biz', label: 'Biz', card: { blurb: 'A small business site.' } },
    { id: 'gym', label: 'Gym', card: { blurb: 'A gym site.' } }
  ]
  assert.deepEqual(templateRanking({ cards }, 'fitness'), {
    trade: 'fitness',
    recommended: ['gym'],
    generic: ['biz']
  })
})

/** A db that answers the opportunity rows these doors read, by the ids asked. */
function fakeDb(byId) {
  return {
    async query(sql, params) {
      if (sql.includes('from wo_preference')) return { rows: [] }
      const ids = Array.isArray(params[1]) ? params[1] : [params[1]]
      const rows = ids.filter((id) => byId[id]).map((id) => byId[id])
      if (sql.includes("candidate->>'trade'")) return { rows: rows.map((r) => ({ trade: r.trade ?? null })) }
      return { rows: rows.map((r) => ({ candidate: { trade: r.trade, ownSite: r.ownSite ?? undefined } })) }
    }
  }
}

test('the own door answers the ranking beside its suggestion', async () => {
  const db = fakeDb({ a: { trade: 'fitness', ownSite: { requestId: 'r' } } })
  const tip = await recommendTemplate(db, { accountId: 'acc', opportunityId: 'a', templates })
  assert.equal(tip.template.design, 'ja-boxing')
  assert.deepEqual(tip.ranking?.recommended, ['ja-boxing'])
  const unknown = await recommendTemplate(fakeDb({ a: { trade: 'other' } }), {
    accountId: 'acc',
    opportunityId: 'a',
    templates
  })
  assert.equal(unknown.ranking, null)
})

test('a Website Opportunities build is ranked by its one trade, never by a mix or a stranger', async () => {
  const db = fakeDb({ a: { trade: 'fitness' }, b: { trade: 'fitness' }, c: { trade: 'food' }, d: {} })
  const rank = (ids) => templateRankingOf(db, { accountId: 'acc', opportunityIds: ids, templates })
  assert.deepEqual((await rank(['a', 'b']))?.recommended, ['ja-boxing'])
  assert.equal(await rank(['a', 'c']), null, 'two trades: no one business to recommend for')
  assert.equal(await rank(['a', 'missing']), null, 'not all this account’s')
  assert.equal(await rank(['d']), null, 'no trade')
  assert.equal(await templateRankingOf(db, { accountId: null, opportunityIds: ['a'], templates }), null)
})

test('a generic template is judged by its description, not its name: Tracy Business is not one', () => {
  const ranking = templateRanking(templates, 'fitness')
  assert.ok(!ranking.generic.includes('tracy-business'), 'its blurb is an industrial infrastructure company')
  assert.ok(!ranking.recommended.includes('tracy-business'))
  assert.ok(ranking.generic.includes('ja-smallbiz'))
  assert.ok(ranking.generic.includes('ja-morgan'))
  const named = { id: 'acme-business', label: 'Acme Business', card: { blurb: 'A fishing gear catalogue.' } }
  assert.deepEqual(templateRanking({ cards: [named] }, 'fitness').generic, [])
})
