/**
 * One author replaces the separate copy writers (spec TracyHQ/tracy#231 seam 1, ticket #237). With an accepted site plan the
 * sibling card lists, the record pages, the offering descriptions and summaries are written by the plan's author from the
 * plan and its glossary, record pages before the pages that summarise them; the sibling-list, record-page, offering and
 * call-to-action writers get no call, and their checks still refuse a bad line, which is traced and taken off. People are
 * glossary items like offerings. The real Joomla engine's prepare runs on a released template with scripted model doubles.
 * Fictional business: a pottery studio.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { inventoryOfContract } from '../src/sites/brief-engines/template-inventory.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const inventory = inventoryOfContract(contract)
const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const slotOf = new Map(map.slots.map((s) => [s.key, s]))

const ABOUT =
  'Kiln & Clay is a small pottery studio where adults learn to throw, glaze and fire their own pieces, taught by Ottilie Brandt and Ravi Lindqvist.'
const OFFERINGS = [
  {
    name: 'Wheel throwing',
    description: 'Wheel throwing classes where you centre the clay and shape cups and bowls at a calm pace.'
  },
  {
    name: 'Hand building',
    description: 'Hand building classes where you pinch, coil and join slabs into vases with your own hands.'
  },
  {
    name: 'Glaze studio',
    description:
      'Glaze studio evenings where you choose colours, dip your pieces and learn how glazes behave.'
  },
  {
    name: 'Kiln firing',
    description: 'Kiln firing sessions where your finished pieces are loaded, fired and handed back to you.'
  }
]
const PEOPLE = [
  { name: 'Ottilie Brandt', description: 'Studio founder' },
  { name: 'Ravi Lindqvist', description: 'Glaze teacher' }
]
const BRIEF = {
  reading: {
    about: ABOUT,
    services: OFFERINGS.map((o, i) => ({ id: `s${i + 1}`, label: o.name, quote: o.description })),
    team: PEOPLE.map((p, i) => ({ id: `t${i + 1}`, label: p.name, role: p.description }))
  },
  assets: []
}

const HOME = 'page:menuItem-101'
const CLASSES = 'page:menuItem-167'
const CONTACT = 'page:menuItem-168'
const COACHES = 'page:menuItem-195'
const RECORDS = 'record-page:classes'
const NAMES = OFFERINGS.map((o) => o.name)
/** The record pages of the template, in order: record N shows offering N. */
const RECORD_ENTITIES = map.recordPages.find((r) => r.id === 'classes').entities
/** The home page's feature cards, which the plan uses to show the offerings, and the coach rows. */
const HOME_CARDS = 'cards:module-157.item'
const PERSON_CARDS = ['cards:module-163.person', 'cards:module-178.person']

/** The author's plan: home, the classes list, its record pages, the coaches and the contact page. */
function authorPlan() {
  const kept = new Set([HOME, CLASSES, CONTACT, COACHES])
  const els = new Map(inventory.elements.map((e) => [e.id, e]))
  const onKept = (/** @type {any} */ e) => els.get(e.section)?.pages.some((p) => kept.has(p))
  const cards = inventory.elements
    .filter(
      (e) =>
        e.kind === 'cards' && onKept(e) && ['service', 'package'].includes(e.groupKind) && e.id !== HOME_CARDS
    )
    .map((e) => {
      const count = Math.min(2, e.limits.capacity)
      return { element: e.id, decision: 'keep', count, items: NAMES.slice(0, count) }
    })
  const page = (/** @type {string} */ id, /** @type {string} */ lead, /** @type {string[]} */ dependsOn) => ({
    id,
    decision: 'keep',
    purpose: `The ${id === HOME ? 'front door' : id === CLASSES ? 'list of classes' : id === COACHES ? 'teachers' : 'way to reach the studio'}`,
    lead,
    facts: [],
    items: id === COACHES ? PEOPLE.map((p) => p.name) : id === CONTACT ? [] : NAMES,
    dependsOn
  })
  return {
    version: 'site-plan/1',
    pages: [
      page(HOME, 'Pottery classes for adults', [CLASSES, COACHES]),
      page(CLASSES, 'Classes for every hand', []),
      page(COACHES, 'The teachers of the studio', []),
      page(CONTACT, 'Visit or write to the studio', [])
    ],
    decisions: [
      { element: RECORDS, decision: 'keep', items: NAMES },
      { element: HOME_CARDS, decision: 'keep', count: 4, items: NAMES },
      ...PERSON_CARDS.map((element) => ({
        element,
        decision: 'keep',
        count: 2,
        items: PEOPLE.map((p) => p.name)
      })),
      ...cards
    ],
    photos: [],
    glossary: [
      ...OFFERINGS.map((o) => ({ ...o, kind: 'offering' })),
      ...PEOPLE.map((p) => ({ ...p, kind: 'person' }))
    ],
    outOfScope: { brief: [] }
  }
}

function editorialDouble(answer) {
  const used = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }
  return {
    chat: async () => {
      used.calls += 1
      return JSON.stringify(answer)
    },
    usage: () => ({ model: 'deepseek/deepseek-v4-pro', ...used, stages: {} })
  }
}

const LETTERS = 'bcdfghjklmnpqrstvwxz'
const wordOf = (/** @type {string} */ seed) => {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  let w = ''
  for (let i = 0; i < 4; i += 1) w += LETTERS[(h >>> (i * 4)) % LETTERS.length] + (i % 2 ? 'a' : 'o')
  return w
}
const plain = (/** @type {unknown} */ v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** A sentence of words of its own, of about `length` characters, ending with a full stop. */
function sentenceOf(/** @type {string} */ seed, /** @type {number} */ length) {
  const words = []
  let i = 0
  while ([...words.join(' ')].length < length - 9) words.push(wordOf(`${seed}:${i++}`))
  const text = words.join(' ') || wordOf(seed)
  return `${text[0].toUpperCase()}${text.slice(1)}.`
}

/** Text of the band a sibling slot is told (`shape`), starting with `lead` when given. */
function shaped(/** @type {any} */ s, /** @type {string | null} */ lead) {
  const [count] = s.shape.sentences
  const [low, high] = s.shape.characters
  const target = Math.round((low + high) / 2)
  const parts = lead ? [lead] : []
  while (parts.length < count) {
    const left = count - parts.length
    const room = target - [...parts.join(' ')].length - (parts.length ? 1 : 0)
    parts.push(sentenceOf(`${s.key}:${parts.length}`, Math.max(12, Math.floor(room / left))))
  }
  return parts.join(' ')
}

/** Own words for a slot, about the length of its demo text and never over its limit. */
function ownWords(/** @type {any} */ s) {
  const target = Math.max(6, Math.min(s.maxCharacters, [...plain(s.sample)].length))
  return sentenceOf(s.key, target).slice(0, s.maxCharacters)
}

/** A step of the home page's process row (no glossary item): the double always writes it outside its band. */
const BAD = 'module-165.7'

const WRITER_PROMPTS = [
  'You write the body text of cards in one list',
  'You write lines of the record pages',
  "You write the line under an offering's name",
  'You write the message of one call-to-action band',
  'You plan the copy of a small business website'
]

/**
 * The text door double. A page-author call (one that carries `plan`) writes each slot the engine bound to a glossary item
 * (`offering`) from that entry: its name where the slot names it, its description first where it describes it; every
 * other line gets words of its own in its band. `wrongPerson` misspells a coach on the first answer; `badSibling` always
 * writes one card body of the home feature row outside its band. Every other call is recorded by its instructions.
 */
function textDouble(mode = {}) {
  /** @type {Array<{page: string, keys: string[], input: any}>} */
  const pageCalls = []
  /** @type {string[]} */
  const otherCalls = []
  return {
    pageCalls,
    otherCalls,
    chat: async ({ messages }) => {
      let input = null
      try {
        input = JSON.parse(messages.at(-1).content)
      } catch {
        input = null
      }
      if (!input?.plan) {
        otherCalls.push(String(messages[0]?.content ?? ''))
        return JSON.stringify({ values: {}, lines: {}, pending: [], invented: [] })
      }
      pageCalls.push({ page: input.plan.page?.id ?? '', keys: input.slots.map((s) => s.key), input })
      const first = !input.fix
      const glossary = new Map(input.glossary.map((g) => [g.name, g]))
      const toSay = [input.plan.page?.lead].filter(Boolean)
      const values = {}
      for (const s of input.slots) {
        const entry = glossary.get(s.offering)
        const fits = (/** @type {string} */ t) => [...t].length <= s.maxCharacters
        const names = ['offering.name', 'package.name', 'person.name', 'editorial.heading'].includes(s.role)
        const describes = [
          'offering.description',
          'offering.summary',
          'person.role',
          'editorial.paragraph'
        ].includes(s.role)
        if (s.type !== 'text') values[s.key] = s.sample
        else if (!plain(s.sample)) values[s.key] = ''
        else if (mode.badSibling && s.key === BAD) values[s.key] = 'Clay.'
        else if (entry && names && fits(entry.name))
          values[s.key] =
            mode.wrongPerson && first && s.role === 'person.name'
              ? `Coach ${entry.name.split(' ')[0]}`
              : entry.name
        else if (entry && describes && fits(entry.description))
          values[s.key] = s.shape ? shaped(s, entry.description) : entry.description
        else if (s.shape) values[s.key] = shaped(s, null)
        else if (toSay.length && fits(toSay[0])) values[s.key] = toSay.shift()
        else values[s.key] = ownWords(s)
      }
      return JSON.stringify({ values, pending: [], invented: [] })
    },
    usage: () => ({ calls: pageCalls.length, promptTokens: 1_000 * pageCalls.length, completionTokens: 0 })
  }
}

async function prepareWith(models) {
  const records = {}
  const engine = createJoomlaEngine({
    models: async () => models,
    woContent: { sitePlanFor: async () => null, briefFor: async () => BRIEF }
  })
  const prepared = await engine.prepare({
    siteKey: 'page-author-writers-test',
    label: 'page-author-writers',
    platform: 'joomla',
    quickstart: 'quickstart/ja-boxing/j6',
    contract,
    email: 'owner@example.com',
    brief: { about: ABOUT, goal: 'contact', style: 'plain' },
    normalized: {
      name: 'Kiln & Clay',
      about: ABOUT,
      nameFrom: 'answer',
      tone: 'plain',
      contact: '',
      languages: ['en']
    },
    signal: new AbortController().signal,
    time: () => {},
    record: (k, v) => {
      records[k] = v
    },
    note: () => {},
    deadlineAt: Date.now() + 60_000
  })
  return { prepared, records }
}

const keyOf = (/** @type {string} */ entity, /** @type {string} */ role) =>
  map.slots.find((s) => s.entity === entity && s.role === role)?.key

test('an offering carries the same name and short description on the home page, the classes page and its own page', async () => {
  const text = textDouble()
  const { prepared, records } = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  assert.equal(records.sitePlan.status, 'accepted', JSON.stringify(records.sitePlan?.refusal))
  const says = (/** @type {string | undefined} */ key) => plain(prepared.changes[key ?? ''])
  OFFERINGS.forEach((o, i) => {
    // Its own page (the record page), whose name and summary the classes page lists.
    const entity = RECORD_ENTITIES[i]
    assert.equal(says(keyOf(entity, 'offering.name')), o.name, `${entity} name`)
    assert.ok(says(keyOf(entity, 'offering.summary')).includes(o.description), `${entity} summary`)
    assert.ok(says(keyOf(entity, 'offering.description')).includes(o.description), `${entity} description`)
    // The home page's feature card N shows offering N.
    assert.equal(says(`module-157.${i}`), o.name, `home card ${i} name`)
    assert.ok(says(`module-157.${4 + i}`).includes(o.description), `home card ${i} description`)
  })
})

test('record pages are written before the pages that summarise them', async () => {
  const text = textDouble()
  await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  const order = [...new Set(text.pageCalls.map((c) => c.page))]
  assert.ok(order.includes(RECORDS), JSON.stringify(order))
  assert.ok(order.indexOf(RECORDS) < order.indexOf(CLASSES), JSON.stringify(order))
  assert.ok(order.indexOf(RECORDS) < order.indexOf(HOME), JSON.stringify(order))
  const records = text.pageCalls.filter((c) => c.page === RECORDS).flatMap((c) => c.keys)
  assert.ok(
    RECORD_ENTITIES.every((e) => records.includes(keyOf(e, 'offering.name'))),
    'every record page is written in its own step'
  )
})

test('a coach is named as the glossary spells it on every page, after one send-back', async () => {
  const text = textDouble({ wrongPerson: true })
  const { prepared } = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  const sent = text.pageCalls.filter((c) => c.input.fix).map((c) => String(c.input.fix))
  assert.ok(
    sent.some((f) => /glossary/i.test(f) && PEOPLE.some((p) => f.includes(p.name))),
    sent.join('|')
  )
  for (const entity of ['module-163', 'module-178'])
    PEOPLE.forEach((p, i) => {
      const key = map.slots.find(
        (s) => s.entity === entity && s.role === 'person.name' && s.group?.item === i
      )?.key
      assert.equal(plain(prepared.changes[key]), p.name, key)
    })
})

test('with an accepted plan the separate writers are not called, and their checks still refuse a bad line', async () => {
  const text = textDouble({ badSibling: true })
  const { prepared, records } = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  for (const call of text.otherCalls)
    assert.ok(!WRITER_PROMPTS.some((p) => call.startsWith(p)), call.slice(0, 80))
  const sent = text.pageCalls.filter((c) => c.keys.includes(BAD))
  assert.ok(sent.length >= 2, 'the bad step goes back to the author')
  const traced = records.copyLineTrace?.find((t) => t.key === BAD && /sibling/.test(String(t.check)))
  assert.ok(traced, JSON.stringify(records.copyLineTrace?.filter((t) => t.key === BAD)))
  assert.equal(traced.reason, 'refused')
  assert.notEqual(prepared.changes[BAD], 'Clay.', 'the refused line never reaches the site')
  const slot = slotOf.get(BAD)
  const off =
    (prepared.demoBlanks ?? []).some((b) => b.key === slot.key) ||
    (prepared.demoHides ?? []).some((h) => h.group === slot.group?.id) ||
    (prepared.factModules ?? []).some((m) => slot.entity === `module-${m.id}`)
  assert.ok(off, 'it is emptied or its card or block taken off, never left as demo')
})
