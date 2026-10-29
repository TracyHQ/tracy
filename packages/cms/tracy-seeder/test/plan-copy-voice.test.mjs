// How a brief build's copy reads across a site (spec TracyHQ/tracy#189, round 9 class F): no sentence said twice on a
// page or across pages, a key phrase within its budget, no count the brief does not state, headings in sentence case,
// and an offering written from the owner's own posts about it. Fictional businesses of two trades.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countClaims,
  keyPhrases,
  PAGE_PHRASE_BUDGET,
  phraseLedger,
  sentenceCase,
  ungroundedCounts
} from '../src/copy-voice.mjs'
import { containedCopy } from '../src/distinct-copy.mjs'
import { OWN_POSTS_RULE, planJoomlaContract } from '../src/plan-joomla-contract.mjs'

const TRADES = [
  {
    name: 'Cedar Bakery',
    about: 'Cedar Bakery bakes sourdough and rye in Lindenfield for every table, from families to cafes.',
    phrase: 'every table',
    person: 'baker',
    offering: 'Sourdough Classes'
  },
  {
    name: 'Willow Dental',
    about: 'Willow Dental offers gentle checkups and whitening in Harborview for every family member.',
    phrase: 'every family member',
    person: 'dentist',
    offering: 'Teeth Whitening'
  }
]

/** A page holding `n` sections, one paragraph slot each. */
function onePage(n, entity = 'menuItem-5', prefix = 'module') {
  const slots = Array.from({ length: n }, (_, i) => ({
    key: `${prefix}-${i + 1}.0`,
    entity: `${prefix}-${i + 1}`,
    type: 'text',
    role: 'editorial.paragraph',
    label: 'Intro',
    maxCharacters: 300,
    sample: `Demo paragraph number ${i + 1} that is long enough to count as copy.`
  }))
  const pages = [
    { entity, assignedModules: slots.map((s) => ({ entity: s.entity, assignmentMode: 'include' })) }
  ]
  return { slots, pages }
}

for (const trade of TRADES) {
  test(`${trade.name}: a key phrase over the page budget is refused and rewritten`, async () => {
    const { slots, pages } = onePage(PAGE_PHRASE_BUDGET + 1)
    const lines = [
      `Fresh work prepared each morning, made for ${trade.phrase} in town.`,
      `Our team listens first and plans the visit for ${trade.phrase} with care.`,
      `Booking is simple and open to ${trade.phrase} who asks us.`
    ]
    const rewritten = 'Booking is simple: write to us and we answer the same day.'
    const fixes = []
    const result = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots, pages },
      site: { name: trade.name, about: trade.about, sourceLanguage: 'en' },
      generate: async ({ input }) => {
        if (input.fix) fixes.push(input.fix)
        const values = Object.fromEntries(slots.map((s, i) => [s.key, lines[i]]))
        if (input.fix) values[slots[2].key] = rewritten
        return { values, pending: [] }
      }
    })
    assert.equal(fixes.length, 1)
    assert.match(fixes[0], new RegExp(`"[^"]*${trade.phrase.split(' ').slice(-2).join(' ')}"`))
    assert.equal(result.changes[slots[2].key], rewritten)
  })

  test(`${trade.name}: a count the brief does not state is refused, and pended when it stays`, async () => {
    const slot = {
      key: 'module-1.0',
      entity: 'module-1',
      type: 'text',
      role: 'editorial.heading',
      label: 'Hero',
      maxCharacters: 80,
      sample: 'The demo heading of the hero'
    }
    const about = `${trade.about} Our ${trade.person}s know every regular by name.`
    const stays = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots: [slot] },
      site: { name: trade.name, about, sourceLanguage: 'en' },
      generate: async () => ({
        values: { [slot.key]: `One ${trade.person} for the whole family` },
        pending: []
      })
    })
    assert.equal(stays.changes[slot.key], undefined)
    assert.equal(stays.reasons[slot.key], 'ungrounded-count')
    // The site plan's own figure (a team of two) grounds "two".
    const grounded = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots: [slot] },
      site: { name: trade.name, about, sourceLanguage: 'en', statistics: [{ kind: 'people', value: '2' }] },
      generate: async () => ({
        values: { [slot.key]: `Two ${trade.person}s for the whole family` },
        pending: []
      })
    })
    assert.equal(grounded.changes[slot.key], `Two ${trade.person}s for the whole family`)
  })

  test(`${trade.name}: an English heading is written in sentence case, the brief's names kept`, async () => {
    const slots = [
      {
        key: 'h.0',
        entity: 'm-1',
        type: 'text',
        role: 'editorial.heading',
        label: 'H',
        maxCharacters: 80,
        sample: 'Demo Heading Here Today'
      },
      {
        key: 'p.0',
        entity: 'm-1',
        type: 'text',
        role: 'editorial.paragraph',
        label: 'P',
        maxCharacters: 80,
        sample: 'A Demo Line'
      }
    ]
    const town = trade.about.match(/in (\p{Lu}\p{Ll}+)/u)[1]
    const result = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots },
      site: { name: trade.name, about: trade.about, sourceLanguage: 'en' },
      generate: async () => ({
        values: { 'h.0': `Ready For Your First Visit In ${town}`, 'p.0': 'Come As You Are' },
        pending: []
      })
    })
    assert.equal(result.changes['h.0'], `Ready for your first visit in ${town}`)
    assert.equal(result.changes['p.0'], 'Come As You Are', 'only headings are cased')
  })

  test(`${trade.name}: a line the build pinned is not said again, reworded, in another section of its page`, async () => {
    const { slots, pages } = onePage(1)
    const pinned = {
      key: 'module-9.0',
      entity: 'module-9',
      type: 'text',
      role: 'editorial.paragraph',
      sample: 'x',
      value: trade.about
    }
    pages[0].assignedModules.push({ entity: 'module-9', assignmentMode: 'include' })
    const reworded = `At ${trade.about.replace(/ offers | bakes /, ' we offer ')}`
    const fresh = 'Ask us anything before your first visit, we answer within a day.'
    let calls = 0
    const result = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots, pages },
      site: { name: trade.name, about: trade.about, sourceLanguage: 'en' },
      written: [pinned],
      generate: async ({ input }) => {
        calls += 1
        return { values: { [slots[0].key]: input.fix ? fresh : reworded }, pending: [] }
      }
    })
    assert.equal(calls, 2)
    assert.equal(result.changes[slots[0].key], fresh)
  })

  test(`${trade.name}: the same sentence on two pages is refused`, async () => {
    const a = onePage(1, 'menuItem-5', 'left')
    const b = onePage(1, 'menuItem-6', 'right')
    const line = `Every visit to ${trade.name} starts with a short and friendly conversation.`
    const result = await planJoomlaContract({
      state: {
        contract: 'fictional/v1',
        revision: 'r',
        slots: [...a.slots, ...b.slots],
        pages: [...a.pages, ...b.pages]
      },
      site: { name: trade.name, about: trade.about, sourceLanguage: 'en' },
      generate: async ({ input }) => ({
        values: Object.fromEntries(input.slots.map((s) => [s.key, `Opening line. ${line}`])),
        pending: []
      })
    })
    assert.equal(result.changes['left-1.0'], `Opening line. ${line}`)
    assert.equal(result.reasons['right-1.0'], 'duplicate-copy')
  })

  test(`${trade.name}: an offering's slots carry the owner's posts about that offering only`, async () => {
    const slots = [
      {
        key: 'o.0',
        entity: 'page-1',
        type: 'text',
        role: 'editorial.paragraph',
        label: 'P',
        maxCharacters: 200,
        sample: 'Demo offering text that is long'
      },
      {
        key: 'q.0',
        entity: 'page-2',
        type: 'text',
        role: 'editorial.paragraph',
        label: 'P',
        maxCharacters: 200,
        sample: 'Demo other text that is long'
      }
    ]
    const posts = [`${trade.offering}: small groups, weekday evenings, message us to book.`]
    const seen = []
    await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'r', slots },
      site: { name: trade.name, about: trade.about, sourceLanguage: 'en' },
      offerings: { 'page-1.offering': trade.offering },
      offeringPosts: { [trade.offering]: posts, 'Something Else': ['not this one'] },
      generate: async ({ system, input }) => {
        seen.push({ system, input })
        return { values: Object.fromEntries(input.slots.map((s) => [s.key, s.sample])), pending: [] }
      }
    })
    const withPosts = seen.filter((c) => c.input.ownPosts)
    assert.ok(withPosts.length > 0)
    for (const call of withPosts) {
      assert.deepEqual(call.input.ownPosts, { [trade.offering]: posts })
      assert.ok(call.system.includes(OWN_POSTS_RULE))
    }
  })
}

test('key phrases skip function-word runs and the names a site repeats by design', () => {
  const phrases = keyPhrases('Lessons for all ages at Cedar Bakery, and of our town.', ['Cedar Bakery'])
  assert.ok(phrases.has('all ages'))
  assert.ok(!phrases.has('cedar bakery'))
  assert.ok(!phrases.has('of our'))
})

test('the site budget is one per page, never below four; chrome is not counted', () => {
  const ledger = phraseLedger({ pageOf: (e) => (e === 'chrome' ? [] : [`p-${e}`]), pages: 2 })
  for (const e of ['1', '2', '3', '4']) ledger.record({ entity: e }, 'Gentle care for every family.')
  assert.equal(ledger.over({ entity: 'chrome' }, 'Gentle care for every family.').length, 0)
  assert.ok(ledger.over({ entity: '5' }, 'Gentle care for every family.').some((f) => f.scope === 'site'))
})

test('a count is a claim only about a word the brief uses, and pronouns are no counts', () => {
  const facts = ['Our dentists and hygienists welcome families.']
  assert.deepEqual(
    countClaims('One dentist for the whole family, all in one place, no one waits.', facts).map(
      (c) => c.said
    ),
    ['one dentist']
  )
  assert.equal(
    ungroundedCounts('Meet our three hygienists.', ['We have three hygienists on staff.']).length,
    0
  )
})

test('sentence case leaves short, mixed and German-like headings alone', () => {
  assert.equal(sentenceCase('Our Bakery'), 'Our Bakery')
  assert.equal(sentenceCase('Fresh bread for Lindenfield'), 'Fresh bread for Lindenfield')
  assert.equal(sentenceCase('[[Fresh Bread]] For Your Table'), '[[Fresh bread]] for your table')
})

test('a reworded line is the same line; two lines that share a subject are not', () => {
  assert.ok(
    containedCopy(
      'at cedar bakery we bake sourdough and rye in lindenfield for families',
      'cedar bakery bakes sourdough and rye in lindenfield for every table from families to cafes'
    )
  )
  assert.ok(
    !containedCopy(
      'cedar bakery opens at seven with warm rolls and coffee',
      'cedar bakery bakes sourdough and rye in lindenfield for every table'
    )
  )
})
