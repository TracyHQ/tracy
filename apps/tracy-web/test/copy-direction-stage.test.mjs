/**
 * The copy stage of a brief build with a site direction and sourced facts (spec TracyHQ/tracy#189, COO 30/10/2026): one
 * site-direction call reads the whole fact sheet before the page writers and every writer is given its answer; every writer
 * call carries the brief's fact digest, each fact with its `sourceId`; a line that states a specific fact (a price, a name,
 * a number, a date, an address, a claim) with no valid source is sent back once, then refused. Explanatory copy with no
 * specific fact needs no source. Fictional businesses: a dog grooming salon, a piano tuner.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { planJoomlaContract } from '../../../packages/cms/tracy-seeder/src/plan-joomla-contract.mjs'
import { sourceTexts, unsourcedLines } from '../../../packages/cms/tracy-seeder/src/fact-sources.mjs'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { briefFactSheet } from '../src/sites/brief-engines/brief-fact-sheet.js'
import { pendingByKind } from '../src/sites/brief-engines/copy-plan-stage.js'
import { sourcedWriter } from '../src/sites/brief-engines/copy-sources.js'
import { writeSiteDirection } from '../src/sites/brief-engines/site-direction.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const state = { contract: 'ja-boxing/j6/1.0.8', revision: 'before', slots: map.slots, pages: map.pages }

const BRIEF = {
  reading: {
    about: 'Wag & Comb is a calm grooming salon for dogs of every size.',
    services: [
      { id: 's1', label: 'Full groom', quote: 'Full groom from $45, bath and trim included' },
      { id: 's2', label: 'Nail trim', quote: 'Quick nail trims for nervous dogs' }
    ],
    team: [{ id: 't1', label: 'Rosa', role: 'groomer', quote: 'Rosa has groomed dogs for twelve years' }],
    story: [{ label: 'Opened by the canal', quote: 'We opened our first salon by the canal in 2009' }]
  },
  googlePlace: { reviews: [{ text: 'Gentle with my old terrier.', author: 'Keld', rating: 5 }] },
  content: { items: [{ title: 'Summer cuts', body: 'Short summer cuts keep long coats cool.' }] },
  keyMessages: [{ label: 'Calm handling', quotes: [{ text: 'No rushing, no stress' }] }],
  brand: { logoResearch: { chosen: { readsAs: 'WAG & COMB GROOMING' } } },
  assets: [{ caption: 'A poodle on the grooming table', depicts: { id: 's1' } }]
}
const SITE = {
  name: 'Wag & Comb',
  about: 'A dog grooming salon.',
  phone: '+1 555 0100',
  languages: ['en'],
  sourceLanguage: 'en',
  statistics: [{ value: 400, label: 'dogs groomed a month' }],
  factSheet: briefFactSheet(BRIEF)
}

test('every fact of the sheet carries its own sourceId, and the brief fields are sources by their name', () => {
  const sheet = SITE.factSheet
  assert.equal(sheet.offerings[0].sourceId, 'offering-1')
  assert.equal(sheet.offerings[1].sourceId, 'offering-2')
  assert.deepEqual(sheet.offerings[0].photos, [
    { sourceId: 'photo-1', label: 'A poodle on the grooming table' }
  ])
  assert.equal(sheet.people[0].sourceId, 'person-1')
  assert.equal(sheet.people[0].role, 'groomer')
  assert.equal(sheet.reviews[0].sourceId, 'review-1')
  assert.equal(sheet.posts[0].sourceId, 'post-1')
  assert.equal(sheet.keyMessages[0].sourceId, 'message-1')
  assert.equal(sheet.story[0].sourceId, 'story-1')
  assert.equal(sheet.logoReads, 'WAG & COMB GROOMING')
  const texts = sourceTexts(SITE)
  assert.match(texts.get('offering-1'), /\$45/)
  assert.match(texts.get('phone'), /555 0100/)
  assert.match(texts.get('statistic-1'), /400/)
  assert.match(texts.get('logoReads'), /WAG & COMB/)
})

test('one site-direction call reads the whole sheet, and every page writer call carries it with the digest', async () => {
  const asked = []
  const model = {
    chat: async ({ messages }) => {
      asked.push(JSON.parse(messages[1].content))
      return JSON.stringify({
        voice: 'Calm, precise and warm.',
        pages: {
          'menuItem-101': {
            leads: 'The full groom and calm handling.',
            sourceIds: ['offering-1', 'message-1', 'nowhere-9']
          },
          'menuItem-999': { leads: 'A page that does not exist.', sourceIds: [] }
        }
      })
    }
  }
  const direction = await writeSiteDirection({ model, site: SITE, pages: state.pages })
  assert.equal(asked.length, 1, 'one call for the whole site')
  assert.deepEqual(asked[0].facts.factSheet, SITE.factSheet, 'the call reads the whole sheet')
  assert.ok(asked[0].pages.some((p) => p.page === 'menuItem-101'))
  assert.equal(direction.voice, 'Calm, precise and warm.')
  assert.deepEqual(
    direction.pages['menuItem-101'].sourceIds,
    ['offering-1', 'message-1'],
    'an unknown source is dropped'
  )
  assert.equal(direction.pages['menuItem-999'], undefined, 'a page the site does not have is dropped')

  const calls = []
  await planJoomlaContract({
    state,
    site: { ...SITE, direction },
    surface: 'pages',
    inventions: 'never',
    byPage: true,
    generate: async ({ system, input }) => {
      calls.push({ system, input })
      return JSON.stringify({ values: {}, pending: input.slots.map((s) => s.key), invented: [] })
    }
  })
  assert.ok(calls.length > 1)
  for (const { system, input } of calls) {
    assert.deepEqual(input.brief.direction, direction, 'every page writer is given the direction')
    assert.ok(input.brief.factSheet.offerings.every((o) => typeof o.sourceId === 'string'))
    assert.match(system, /"sources"/, 'every writer is asked for the sources of its facts')
  }
  assert.ok(
    calls.some((c) => c.input.pageDirection?.['menuItem-101']),
    'the batch of a page is told that page’s own direction'
  )
})

/** The planner double: three chosen paragraph slots state facts, every other slot explanatory words. */
const factWriter = () => {
  const seen = { fixes: [], chosen: null }
  const wordOf = (n) => {
    let out = ''
    for (let v = n, i = 0; i < 4; v = Math.floor(v / 70), i += 1)
      out += 'bdfgklmnprstvz'[(v % 70) % 14] + 'aeiou'[Math.floor((v % 70) / 14)]
    return out
  }
  let calls = 0
  const generate = async ({ input }) => {
    calls += 1
    if (input.fix) seen.fixes.push(input.fix)
    if (!seen.chosen) {
      const fit = input.slots.filter(
        (s) =>
          (s.element === 'p' || s.element === undefined) &&
          s.maxCharacters >= 70 &&
          String(s.sample).trim() &&
          !s.requiresEvidence
      )
      if (fit.length >= 3) seen.chosen = { a: fit[0].key, b: fit[1].key, c: fit[2].key }
    }
    const { a, b, c } = seen.chosen ?? {}
    const values = {}
    const sources = {}
    input.slots.forEach((s, i) => {
      const n = calls * 1000 + i
      values[s.key] = String(s.sample ?? '').trim()
        ? `${wordOf(n * 3 + 1)} ${wordOf(n * 3 + 2)} ${wordOf(n * 3 + 3)}`.slice(
            0,
            Math.max(1, s.maxCharacters)
          )
        : ''
    })
    if (input.slots.some((s) => s.key === a)) {
      values[a] = 'A full groom from $45, with a bath and a trim.'
      if (input.fix) sources[a] = ['offering-1']
    }
    if (input.slots.some((s) => s.key === b))
      values[b] = 'Certified by the national grooming guild since 2011.'
    if (input.slots.some((s) => s.key === c)) {
      values[c] = 'Nail trims from $60 for every dog we see.'
      sources[c] = ['offering-2']
    }
    return JSON.stringify({ values, pending: [], invented: [], sources })
  }
  return { seen, generate }
}

test('a line stating a fact with no valid source is sent back once, then refused; explanatory lines need none', async () => {
  const writer = factWriter()
  const plan = await planJoomlaContract({
    state,
    site: SITE,
    surface: 'pages',
    inventions: 'never',
    byPage: true,
    generate: writer.generate
  })
  const { a, b, c } = writer.seen.chosen
  assert.equal(
    plan.changes[a],
    'A full groom from $45, with a bath and a trim.',
    'a sourced price is written'
  )
  assert.equal(plan.changes[b], undefined, 'a claim the brief never makes is not written')
  assert.equal(plan.changes[c], undefined, 'a price its cited source does not state is not written')
  assert.equal(plan.reasons[b], 'unsourced-fact')
  assert.equal(plan.reasons[c], 'unsourced-fact')
  const byKind = pendingByKind(plan)
  assert.ok(byKind.refused.includes(b) && byKind.refused.includes(c), 'the receipt lists them as refused')
  assert.equal(writer.seen.fixes.filter((f) => f.includes(b)).length, 1, 'rewritten once, never twice')
  // The explanatory lines around them were written with no source.
  const written = Object.keys(plan.changes).filter((k) => ![a].includes(k))
  assert.ok(written.length > 100, `explanatory lines written: ${written.length}`)
  assert.ok(plan.sources?.[a]?.includes('offering-1'), 'the plan keeps the source of each sourced line')
})

test('a specific fact is told apart from explanatory copy', () => {
  const slots = [{ key: 'x' }, { key: 'y' }, { key: 'z' }, { key: 'w', item: { n: 2, of: 3 } }, { key: 'v' }]
  const bad = unsourcedLines({
    slots,
    values: {
      x: 'Regular tuning keeps a piano stable through the seasons.',
      y: 'Rosa trims every coat by hand.',
      z: 'Wag & Comb grooms dogs of every size.',
      w: '2',
      v: 'An award-winning salon.'
    },
    sources: {},
    site: SITE
  }).map((l) => l.key)
  assert.deepEqual(
    bad.sort(),
    ['v'],
    'a claim the brief never makes needs a source; a person the brief names, trade knowledge and an ordinal do not'
  )
})

test('every other copy writer is given the digest and the direction, and an unsourced line is rewritten once, then dropped', async () => {
  const requests = []
  const answers = [
    {
      lines: {
        k1: 'Open by the canal since 2009.',
        k2: 'A calm and careful groom.',
        k3: 'Award-winning salon since 1999.'
      }
    },
    {
      lines: { k1: 'Open by the canal since 2009.', k3: 'Award-winning salon since 1999.' },
      sources: { k1: ['story-1'] }
    }
  ]
  const model = {
    usage: () => ({ calls: requests.length }),
    chat: async ({ messages }) => {
      requests.push(messages)
      return JSON.stringify(answers[requests.length - 1])
    }
  }
  const refused = new Set()
  const direction = { voice: 'Calm.', pages: {} }
  const wrapped = sourcedWriter(model, { site: { ...SITE, direction }, refused })
  const raw = await wrapped.chat({
    messages: [
      { role: 'system', content: 'Write the card lines. Answer JSON {"lines": {"<key>": "<text>"}}.' },
      {
        role: 'user',
        content: JSON.stringify({ locale: 'en', lines: [{ key: 'k1' }, { key: 'k2' }, { key: 'k3' }] })
      }
    ]
  })
  assert.equal(requests.length, 2, 'one rewrite')
  const first = JSON.parse(requests[0][1].content)
  assert.equal(first.facts.factSheet.offerings[0].sourceId, 'offering-1', 'the writer is given the digest')
  assert.deepEqual(first.direction, direction, 'the writer is given the direction')
  assert.match(requests[0][0].content, /"sources"/)
  assert.match(JSON.parse(requests[1][1].content).fix, /k3/)
  const answer = JSON.parse(raw)
  assert.equal(answer.lines.k1, 'Open by the canal since 2009.')
  assert.equal(answer.lines.k2, 'A calm and careful groom.')
  assert.equal(answer.lines.k3, undefined, 'the unsourced line is dropped')
  assert.deepEqual([...refused], ['k3'])
  assert.equal(wrapped.usage().calls, 2, 'the writer keeps its model’s usage')
})

// 🔒 THE COO DEFINITION OF A SPECIFIC FACT (30/10/2026): the system checks a fact against the whole brief, whatever the
// writer cited; only business facts need the brief; trade knowledge with numbers needs none. A fictional climbing gym.
const GYM = {
  name: 'Crag Hall',
  about: 'Crag Hall is an indoor bouldering gym with 6 courts for squash beside the walls.',
  phone: '+44 20 7946 0321',
  languages: ['en'],
  sourceLanguage: 'en',
  statistics: [{ kind: 'years', line: 'Since 2016', value: '9' }],
  factSheet: briefFactSheet({
    reading: {
      about: 'Crag Hall is an indoor bouldering gym.',
      services: [{ id: 's1', label: 'Intro session', quote: 'Intro session for first-timers, 25 GBP' }],
      team: [{ id: 't1', label: 'Odile', role: 'route setter', quote: 'Odile sets the walls every week' }]
    },
    brand: { logoResearch: { chosen: { readsAs: 'CRAG HALL' } } }
  })
}
const refusedOf = (values, sources = {}) =>
  unsourcedLines({ slots: Object.keys(values).map((key) => ({ key })), values, sources, site: GYM })

test('trade knowledge with numbers needs no source', () => {
  assert.deepEqual(
    refusedOf({
      a: 'Squash is played 1 vs 1 and padel is played 2 vs 2.',
      b: 'Bouldering walls are open 24/7 in many cities, and a 60-minute session suits a first visit.',
      c: 'Coaching is 1-on-1, and a route is graded from 3 to 8.',
      d: 'Warm up for 10 minutes before you climb.'
    }),
    []
  )
})

test('a business fact the brief states passes with no sourceId or a wrong one', () => {
  assert.deepEqual(
    refusedOf(
      {
        a: 'The club has 6 courts beside the walls.',
        b: 'Climbing with us since 2016.',
        c: 'Call +44 20 7946 0321 to book.',
        d: 'Odile sets every wall.',
        e: 'Your intro session costs 25 GBP.'
      },
      { a: ['offering-9'], c: ['brief.phone'], e: ['nowhere'] }
    ),
    []
  )
})

test('a business fact the brief does not state is refused: a count, an award, a price, a year, an email', () => {
  const bad = refusedOf({
    a: 'The club has 8 courts beside the walls.',
    b: 'Voted best club 2024.',
    c: 'Day passes from AED 90.',
    d: '120.00/class',
    e: 'Write to hello@craghall.example.',
    f: '32',
    g: 'We have trained over 500 members.',
    h: 'Bouldering for 30 years.'
  })
  assert.deepEqual(
    bad.map((l) => l.key),
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  )
  assert.ok(bad.find((l) => l.key === 'a').facts.includes('8'))
  assert.ok(bad.find((l) => l.key === 'b').facts.some((f) => /voted|2024/i.test(f)))
})

test('the rewrite request names each fact the brief does not state and says to write the line without it', async () => {
  const { sourceComplaint } = await import('../../../packages/cms/tracy-seeder/src/fact-sources.mjs')
  const text = sourceComplaint(refusedOf({ a: 'The club has 8 courts beside the walls.' }))
  assert.match(text, /a \(8\)/)
  assert.match(text, /does not state/)
  assert.match(text, /without/)
})

test('a site direction keyed by route instead of page id still reaches the page writers', async () => {
  const model = {
    chat: async () =>
      JSON.stringify({
        voice: 'Calm.',
        pages: { home: { leads: 'Bouldering for everyone.', sourceIds: ['offering-1'] } }
      })
  }
  const direction = await writeSiteDirection({
    model,
    site: SITE,
    pages: [
      { entity: 'menuItem-101', route: 'home' },
      { entity: 'menuItem-102', route: 'about-us' }
    ]
  })
  assert.deepEqual(direction.pages['menuItem-101'], {
    leads: 'Bouldering for everyone.',
    sourceIds: ['offering-1']
  })
})

test('the planner count check follows the same rule: trade formats pass, business counts and prices not in the brief are refused', async () => {
  const lines = {
    a: 'A first visit is one-on-one, padel is played two vs two, and one session a week is a good start.',
    b: 'We have eight courts beside the walls.',
    c: 'Day passes cost $95.00 per class.',
    d: 'The club has 6 courts beside the walls.',
    e: 'Our award-winning coaches run every court.'
  }
  let chosen = null
  const generate = async ({ input }) => {
    if (!chosen) {
      const fit = input.slots.filter(
        (s) =>
          (s.element === 'p' || s.element === undefined) &&
          s.maxCharacters >= 110 &&
          String(s.sample).trim() &&
          !s.requiresEvidence
      )
      if (fit.length >= 5)
        chosen = { a: fit[0].key, b: fit[1].key, c: fit[2].key, d: fit[3].key, e: fit[4].key }
    }
    const values = {}
    input.slots.forEach((s) => {
      values[s.key] = String(s.sample ?? '')
    })
    for (const [name, key] of Object.entries(chosen ?? {}))
      if (input.slots.some((s) => s.key === key)) values[key] = lines[name]
    return JSON.stringify({ values, pending: [], invented: [] })
  }
  const plan = await planJoomlaContract({
    state,
    site: GYM,
    surface: 'pages',
    inventions: 'never',
    byPage: true,
    generate
  })
  assert.ok(chosen)
  assert.equal(plan.changes[chosen.a], lines.a, `trade formats are written (${plan.reasons[chosen.a]})`)
  assert.equal(
    plan.changes[chosen.d],
    lines.d,
    `a count the brief states is written (${plan.reasons[chosen.d]})`
  )
  assert.equal(plan.changes[chosen.b], undefined, 'a count the brief does not state is refused')
  assert.equal(plan.changes[chosen.c], undefined, 'a price the brief does not state is refused')
  assert.equal(plan.changes[chosen.e], undefined, 'an award the brief does not state is refused')
})
