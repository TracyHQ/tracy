// Which template a restaurant demo is built on, against the cards develop offered on 19/10/2026.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { chooseTemplate } from '../src/opportunities-build/revisions.js'
import { autoTemplate, pinsOf, templateChoices, tradeOfWords } from '../src/lib/wo-revision-choice.js'

const devCards = JSON.parse(
  readFileSync(new URL('./fixtures/wo-template-cards-dev-2026-10-19.json', import.meta.url), 'utf8')
)
const card = (id, blurb, platforms = ['joomla']) => ({
  id,
  label: id,
  card: { blurb },
  platforms: platforms.map((platform) => ({ platform, tag: `quickstart/${id}/x`, version: '1.0.0' }))
})
const pick = (cards, cms) => chooseTemplate({ cards }, cms, undefined)

test('a restaurant template wins whenever one is offered', () => {
  const cards = [
    ...devCards,
    card('ja-restaurant', 'A Joomla restaurant site template with menu and reservation.')
  ]
  assert.deepEqual(
    [pick(cards, 'joomla').design, pick(cards, 'joomla').reason],
    ['ja-restaurant', 'restaurant-match']
  )
})

test('Joomla on develop: the hotel and resort template, never the beauty spa', () => {
  const t = pick(devCards, 'joomla')
  assert.equal(t.design, 'ja-resort')
  assert.equal(t.reason, 'hospitality-match')
})

test('WordPress on develop: the multipurpose business template, never the charity one', () => {
  const t = pick(devCards, 'wordpress')
  assert.equal(t.design, 'ja-morgan')
  assert.equal(t.reason, 'multipurpose-match')
})

test('a hotel or resort template beats a template made for another trade', () => {
  const cards = [
    card('ja-impact', 'A charity and non-profit site.'),
    card('ja-resort', 'A hotel and resort website.')
  ]
  assert.deepEqual(
    [pick(cards, 'joomla').design, pick(cards, 'joomla').reason],
    ['ja-resort', 'hospitality-match']
  )
})

test('a beauty spa is not hospitality for a restaurant', () => {
  const cards = [
    card('ja-spa', 'A themed business site for a beauty spa.'),
    card('ja-nova', 'A business site template with pages for services and news.')
  ]
  assert.deepEqual(
    [pick(cards, 'joomla').design, pick(cards, 'joomla').reason],
    ['ja-nova', 'business-match']
  )
})

test('with only other trades on offer, the first one is taken and says so', () => {
  const t = pick(devCards, 'emdash')
  assert.equal(t.design, 'tracy')
  assert.equal(t.reason, 'first-available')
})

// Tracy picks the template itself (`selection: {auto: true}`), across every CMS, against develop's 22/10 cards.
const cards22 = JSON.parse(
  readFileSync(new URL('./fixtures/wo-template-cards-dev-2026-10-22.json', import.meta.url), 'utf8')
)
const restaurantDesigns = new Set(['ja-restaurant', 'ja-fresco', 'ja-diner'])
const auto = (want) => autoTemplate({ cards: cards22 }, want)

test('auto: a restaurant always lands on a restaurant template, whichever CMS has one', () => {
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const t = auto({ kind: 'restaurants', seed })
    assert.ok(restaurantDesigns.has(t.design), `${seed}: ${t.design}`)
    assert.match(t.reason, /^auto:restaurant-match/)
  }
})

test('auto: EmDash as the Default CMS does not put a restaurant on the agency template', () => {
  const t = auto({ kind: 'restaurants', preferredCms: 'emdash', seed: 'x' })
  assert.ok(restaurantDesigns.has(t.design))
  assert.notEqual(t.platform, 'emdash')
  assert.doesNotMatch(t.reason, /cms:/)
})

test('auto: the Default CMS wins when it has a template of the best tier', () => {
  const t = auto({ kind: 'restaurants', preferredCms: 'wordpress', seed: 'x' })
  assert.equal(t.platform, 'wordpress')
  assert.equal(t.design, 'ja-restaurant')
  assert.match(t.reason, /cms:wordpress/)
})

test('auto: a bar takes the restaurant-and-bar template', () => {
  for (const seed of ['a', 'b', 'c', 'd']) {
    const t = auto({ kind: 'bars', seed })
    assert.match(t.reason, /kind:bars/)
    assert.ok(['ja-fresco', 'ja-restaurant'].includes(t.design), t.design)
  }
})

test('auto: the same place gets the same template, other places spread over the tier', () => {
  assert.deepEqual(auto({ kind: 'restaurants', seed: 'one' }), auto({ kind: 'restaurants', seed: 'one' }))
  const seen = new Set(
    Array.from({ length: 40 }, (_, i) => {
      const t = auto({ kind: 'restaurants', seed: `place-${i}` })
      return `${t.design}:${t.platform}`
    })
  )
  assert.ok(seen.size >= 3, [...seen].join(','))
})

test('auto: an unknown kind still gets the best tier; no card at all is unavailable', () => {
  assert.match(auto({ kind: null, seed: 'z' }).reason, /^auto:restaurant-match$/)
  assert.deepEqual(autoTemplate({ cards: [] }, {}), { status: 'unavailable', reason: 'NO_TEMPLATE_FOR_CMS' })
  assert.deepEqual(autoTemplate({ error: 'TEMPLATES_UNREADABLE' }, {}), {
    status: 'unavailable',
    reason: 'TEMPLATES_UNREADABLE'
  })
})

test('auto for any trade: its own trade’s template, else a generic business one, never another trade’s', () => {
  const pick = (trade, seed = 'x') => autoTemplate({ cards: cards22 }, { trade, seed })
  const designs = (trade) => new Set(Array.from({ length: 30 }, (_, i) => pick(trade, `s${i}`).design))
  assert.deepEqual([...designs('health')], ['ja-vital'])
  assert.deepEqual([...designs('beauty')], ['ja-spa'])
  assert.deepEqual([...designs('hospitality')], ['ja-resort'])
  assert.deepEqual([...designs('education')], ['ja-sensei'])
  assert.deepEqual([...designs('auto')], ['ja-rent'])
  assert.match(pick('health').reason, /^auto:trade-match:health$/)
  for (const trade of ['fitness', 'home', 'events', 'retail', 'other']) {
    for (const design of designs(trade))
      assert.ok(
        // Generic is read in the description only (26/10/2026): Tracy Business describes an industrial company.
        ['ja-smallbiz', 'ja-morgan'].includes(design),
        `${trade}: ${design}`
      )
    assert.ok(designs(trade).size >= 2, trade)
    assert.match(pick(trade).reason, /^auto:business-match/)
  }
  // The generic tier lets the Default CMS decide: WordPress for a business of no listed trade. EmDash has no generic
  // template since the tier reads descriptions only (Tracy Business was its one, by name), so another CMS's is taken.
  const onEmdash = autoTemplate({ cards: cards22 }, { trade: 'other', preferredCms: 'emdash', seed: 'x' })
  assert.notEqual(onEmdash.platform, 'emdash')
  assert.ok(['ja-smallbiz', 'ja-morgan'].includes(onEmdash.design), onEmdash.design)
  assert.equal(
    autoTemplate({ cards: cards22 }, { trade: 'other', preferredCms: 'wordpress', seed: 'x' }).platform,
    'wordpress'
  )
  // A restaurant, a magazine, a band or a resume template is no other business's.
  for (const trade of ['health', 'professional', 'creative', 'travel', 'nonprofit', 'other'])
    for (const design of designs(trade))
      assert.ok(
        !/ja-(restaurant|fresco|diner|essence|vogue|symphony|podcast|resume)/.test(design),
        `${trade}: ${design}`
      )
  // `other` is no restaurant either: a business whose trade is unknown gets a business template.
  assert.notEqual(pick('other').design, 'ja-restaurant')
})

// Local stand 24/10/2026: "Flour Bakery", researched by its link alone, was trade `other` and was suggested Tracy Base,
// "a business site template for a web design and development agency".
test('a business of unknown trade gets a template made for no trade, never an agency’s; its own name tells its trade', () => {
  const cards = [
    card(
      'tracy',
      'A business site template for a web design and development agency, with pages for products.',
      ['wordpress']
    ),
    card('tracy-business', 'A business website for any company: services, team and contact.', ['wordpress'])
  ]
  for (const seed of ['flour', 'a', 'b', 'c', 'd'])
    assert.equal(
      autoTemplate({ cards }, { trade: 'other', seed, preferredCms: 'wordpress' }).design,
      'tracy-business'
    )
  assert.equal(tradeOfWords('flour bakery'), 'food')
  assert.equal(tradeOfWords('Elite Smiles Dental'), 'health')
  assert.equal(tradeOfWords('Smith Plumbing & Heating'), 'home')
  assert.equal(tradeOfWords('Death & Co'), 'other')
  assert.equal(tradeOfWords(null, '  '), 'other')
  // A blog or a band is no business's trade, whatever its name says.
  assert.equal(tradeOfWords('The Podcast Company'), 'other')
})

test('the Build form offers each CMS its templates with the /ops/wo pin marked; an unreadable list says so', () => {
  const cards = [
    {
      id: 'tracy-base',
      label: 'Tracy Base',
      platforms: [
        { platform: 'wordpress', tag: 'tracy-base/wp7' },
        { platform: 'joomla', tag: 'tracy-base/j6' }
      ]
    },
    { id: 'diner', platforms: [{ platform: 'wordpress', tag: 'diner/wp' }] }
  ]
  const ops = {
    templatePinPolicy: 'strict',
    pinnedTemplates: { wordpress: 'tracy-base/wp7', joomla: 'gone/j6', emdash: 'x/e' }
  }
  const choices = templateChoices({ cards }, ops)
  assert.deepEqual(choices.wordpress.pinned, { design: 'tracy-base', quickstart: 'tracy-base/wp7' })
  assert.deepEqual(
    choices.wordpress.templates.map((t) => t.label),
    ['Tracy Base', 'diner']
  )
  assert.equal(choices.joomla.pinned, null)
  assert.deepEqual(choices.emdash, { pinned: null, templates: [] })
  assert.deepEqual(pinsOf(ops).wordpress, { tag: 'tracy-base/wp7', policy: 'strict' })
  assert.deepEqual(templateChoices({ error: 'TEMPLATES_UNREADABLE' }, ops), { error: 'TEMPLATES_UNREADABLE' })
})
