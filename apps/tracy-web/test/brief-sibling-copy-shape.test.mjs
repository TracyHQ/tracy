// Sibling texts of one list share one shape (COO rule 30/10/2026, spec TracyHQ/tracy#189): the brief engine's writer, the
// final page check, the blocker gate and the packing rule. Fictional businesses of two trades: a dental clinic (treatment
// cards, one owner line shouting) and a bakery workshop (four "what to bring" item cards, three with no body and one with
// a sentence about the whole page).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBlockers } from 'website-opportunities/domain/build-blockers.mjs'
import { lintContentMap } from '../src/lib/content-map-lint.js'
import { checkSiblingCopy } from '../src/opportunities-build/sibling-copy-check.js'
import { shapeSiblingCopy } from '../src/sites/brief-engines/sibling-copy-writer.js'

const DEMO =
  'A calm first visit where the whole mouth is checked with care. You leave with a clear plan for the months ahead.'
const TREATMENTS = ['Check-up', 'Cleaning', 'Whitening', 'Braces']
const clinicSlots = TREATMENTS.flatMap((name, i) => [
  {
    key: `post-${i + 1}.0`,
    entity: `post-${i + 1}`,
    type: 'text',
    role: 'offering.summary',
    group: { id: `post-${i + 1}.offering`, kind: 'service' },
    sample: DEMO
  },
  {
    key: `post-${i + 1}.1`,
    entity: `post-${i + 1}`,
    type: 'text',
    role: 'offering.name',
    group: { id: `post-${i + 1}.offering`, kind: 'service' },
    sample: name
  }
])
const clinicWritten = {
  'post-1.0':
    'A calm first visit where every tooth is checked with care. You leave knowing what your smile needs next.',
  'post-2.0':
    'A thorough cleaning that keeps gums healthy between visits. It is done gently and at an easy pace.',
  'post-3.0': 'Book your whitening in Riverton today!',
  'post-4.0':
    'Braces that straighten teeth gently, step by step. Each stage is explained to you before it begins.',
  'post-1.1': 'Check-up',
  'post-2.1': 'Cleaning',
  'post-3.1': 'Whitening',
  'post-4.1': 'Braces'
}
const about = {
  business: 'Riverton Smile Studio',
  sourceText: 'Riverton Smile Studio. Book your whitening in Riverton today!'
}
const modelSaying = (lines) => ({ chat: async () => JSON.stringify({ lines }) })

test('an owner line out of the band is rewritten into it, keeping its place name, without an exclamation mark', async () => {
  const model = modelSaying({
    'post-3.0':
      'Whitening at our Riverton studio brightens teeth gently. Each session is set at a pace that suits the patient.'
  })
  const out = await shapeSiblingCopy({ slots: clinicSlots, written: clinicWritten, about, model })
  assert.deepEqual(Object.keys(out.values), ['post-3.0'])
  assert.ok(!out.values['post-3.0'].includes('!'))
  assert.ok(out.values['post-3.0'].includes('Riverton'))
  assert.deepEqual(out.unreached, [])
})

test('a rewrite that invents a fact is asked once more, and never cuts its siblings to match', async () => {
  let calls = 0
  const model = {
    chat: async () => {
      calls += 1
      return JSON.stringify({
        lines: {
          'post-3.0':
            calls === 1
              ? 'Whitening in Riverton from 90 a session, the best in town. Results are guaranteed for every patient.'
              : 'Whitening at our Riverton studio brightens teeth gently. Each session is set at a pace that suits the patient.'
        }
      })
    }
  }
  const out = await shapeSiblingCopy({ slots: clinicSlots, written: clinicWritten, about, model })
  assert.equal(calls, 2)
  assert.deepEqual(Object.keys(out.values), ['post-3.0'])
  assert.deepEqual(out.unreached, [])
  const stubborn = await shapeSiblingCopy({
    slots: clinicSlots,
    written: clinicWritten,
    about,
    model: modelSaying({ 'post-3.0': 'Whitening from 90, the best in town.' })
  })
  assert.deepEqual(stubborn.values, {}, 'no sibling is shortened or emptied')
  assert.deepEqual(stubborn.unreached, ['post-3.0'])
})

/** A bakery workshop page: four item cards of one field list, as a released map declares them once grouped. */
const ITEMS = ['Apron', 'Hair net', 'Closed shoes', 'Notebook']
const itemSlots = (grouped) =>
  ITEMS.flatMap((name, i) => [
    {
      key: `post-9.${i * 2}`,
      entity: 'post-9',
      type: 'text',
      role: 'editorial.heading',
      jsonPath: ['bring-list', `bring-list${i}`, 'item_title'],
      ...(grouped ? { group: { id: `post-9.bring.${i}`, item: i, kind: 'business' } } : {}),
      sample: name
    },
    {
      key: `post-9.${i * 2 + 1}`,
      entity: 'post-9',
      type: 'text',
      role: grouped ? 'editorial.paragraph' : 'offering.description',
      jsonPath: ['bring-list', `bring-list${i}`, 'item_desc'],
      ...(grouped
        ? { group: { id: `post-9.bring.${i}`, item: i, kind: 'business' } }
        : { group: { id: 'post-9.offering', kind: 'service' } }),
      sample: 'Bring this along so the morning runs smoothly and you can focus on the dough.'
    }
  ])
const itemWritten = {
  'post-9.0': 'Apron',
  'post-9.2': 'Hair net',
  'post-9.4': 'Closed shoes',
  'post-9.5': 'The head baker sets the pace, and every guest works at a rhythm that feels right.',
  'post-9.6': 'Notebook'
}

test('item cards: every body is written about its own item, and an unwritten one is reported, never hidden', async () => {
  const lines = {
    'post-9.1': 'An apron keeps flour and butter off your clothes while you shape the dough.',
    'post-9.3': 'A hair net keeps the bench clean while you knead, fold and shape each loaf.',
    'post-9.5': 'Closed shoes keep your feet safe around hot trays and a busy bakery floor.',
    'post-9.7': 'A notebook holds the timings and recipes you want to bake again at home.'
  }
  const written = await shapeSiblingCopy({
    slots: itemSlots(true),
    written: itemWritten,
    model: modelSaying(lines)
  })
  assert.deepEqual(written.values, lines)
  const silent = await shapeSiblingCopy({ slots: itemSlots(true), written: itemWritten, model: null })
  assert.deepEqual(silent.values, {}, 'nothing is emptied or cut when no model answers')
  assert.deepEqual(silent.unreached.sort(), ['post-9.1', 'post-9.3', 'post-9.5', 'post-9.7'])
})

const card = (title, body) =>
  `<div class="card"><h3>${title}</h3>${body ? `<p>${body}</p>` : ''}<a href="/x">More</a></div>`
const page = (cards) => `<html><body><main><div class="grid">${cards.join('')}</div></main></body></html>`

test('the final check names a list mixing long and short, one body of four, an exclamation mark, as blockers', () => {
  const pages = [
    {
      path: '/treatments',
      status: 200,
      html: page([
        card('Check-up', clinicWritten['post-1.0']),
        card('Cleaning', clinicWritten['post-2.0']),
        card('Whitening', clinicWritten['post-3.0']),
        card('Braces', clinicWritten['post-4.0'])
      ])
    },
    {
      path: '/workshop',
      status: 200,
      html: page([
        card('Apron', ''),
        card('Hair net', ''),
        card('Closed shoes', itemWritten['post-9.5']),
        card('Notebook', '')
      ])
    }
  ]
  const findings = checkSiblingCopy({ pages })
  const reasons = (path) => findings.filter((f) => f.page === path).map((f) => f.reason)
  assert.ok(reasons('/treatments').includes('exclamation'))
  assert.ok(reasons('/treatments').includes('length-spread'))
  assert.ok(reasons('/workshop').includes('mixed-empty'))
  assert.ok(reasons('/workshop').includes('off-title'))
  const verdict = buildBlockers({ findings })
  assert.equal(verdict.state, 'needs-fixes')
  assert.equal(verdict.items[0].rule, 'sibling-copy-shape')
})

test('the final check passes one shape, and names one record shaped two ways and a word spelt two ways', () => {
  const even = Object.entries({
    Apron: 'An apron keeps flour and butter off your clothes while you shape the dough.',
    Notebook: 'A notebook holds the timings and recipes you want to bake again at home.'
  }).map(([t, b]) => card(t, b))
  assert.deepEqual(checkSiblingCopy({ pages: [{ path: '/', status: 200, html: page(even) }] }), [])
  const long = 'Gentle care for every tooth. A plan you can follow. Visits that run on time.'
  const short = 'Gentle care.'
  const twice = checkSiblingCopy({
    pages: [
      { path: '/', status: 200, html: page([card('Personalized Care', long), card('Braces', long)]) },
      {
        path: '/treatments',
        status: 200,
        html: page([card('Personalized Care', short), card('Braces', short)])
      },
      { path: '/about', status: 200, html: '<main><p>Personalised care plans for every family.</p></main>' }
    ]
  })
  assert.ok(twice.some((f) => f.reason === 'record-shape' && f.severity === 'blocker'))
  assert.ok(twice.some((f) => f.kind === 'spelling-variant' && f.found === 'personalised / personalized'))
})

test('the packing rule: item cards of a field list must be one numbered group with an editorial body', () => {
  const map = (grouped) => ({
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [],
    slots: itemSlots(grouped)
  })
  const hits = (m) => lintContentMap(m).findings.filter((f) => f.rule === 'repeated-item-ungrouped')
  assert.equal(hits(map(false)).length, 4)
  assert.equal(hits(map(true)).length, 0)
})
