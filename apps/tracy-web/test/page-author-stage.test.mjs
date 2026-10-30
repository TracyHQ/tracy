/**
 * The page writing stage of a brief build with an accepted site plan (spec TracyHQ/tracy#231 seam 1, ticket #235): the same
 * author writes the site page by page in the plan's writing order, each call carrying the rulebook, this page's plan, the
 * glossary, its own slots with their limits and the pages already written; a section the plan hid gets no call; a line still
 * failing the shared checks after its send-back is traced and taken off, never left as demo. Without an accepted plan the
 * current writers run unchanged. The real Joomla engine's prepare runs on a released template with scripted model doubles.
 * Fictional business: a florist.
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

const sha = (/** @type {string} */ c) => c.repeat(64)
const ABOUT = 'Fern & Petal arranges seasonal flowers for weddings and homes from a small corner shop.'
const BRIEF = {
  reading: {
    about: ABOUT,
    services: [
      { id: 's1', label: 'Wedding bouquets', quote: 'Bouquets and buttonholes made for the day' },
      { id: 's2', label: 'Flower subscription', quote: 'Fresh stems delivered every week' }
    ]
  },
  assets: [
    {
      id: 'a1',
      kind: 'image',
      category: 'space',
      sha256: sha('c'),
      width: 2000,
      height: 1300,
      orientation: 'landscape',
      quality: 'high',
      content: 'people-in-action',
      caption: 'A florist tying a bouquet of peonies',
      depicts: { id: 's1' },
      isGraphic: false
    }
  ]
}

const HOME = 'page:menuItem-101'
const CLASSES = 'page:menuItem-167'
const CONTACT = 'page:menuItem-168'
const TEAM = 'section:module-163'
const ITEMS = ['Wedding bouquets', 'Flower subscription']
/** The glossary description the offerings page writes and the home page, which summarises it, reuses verbatim. */
const SHARED = 'Bouquets and buttonholes arranged by hand for the wedding day'
/** A line of the offerings page the author always writes too long: it fails the length check after its send-back. */
const FAIL = 'module-166.18'
const RECORD_ROWS = new Set(['person', 'quote', 'service', 'package'])

/** The author's plan: only the real choices; the home page summarises the offerings page; no team. */
function authorPlan() {
  const kept = new Set([HOME, CLASSES, CONTACT])
  const els = new Map(inventory.elements.map((e) => [e.id, e]))
  const onKept = (/** @type {any} */ e) => {
    const section = els.get(e.section)
    return section && section.id !== TEAM && section.pages.some((p) => kept.has(p))
  }
  const cards = inventory.elements
    .filter((e) => e.kind === 'cards' && onKept(e) && RECORD_ROWS.has(e.groupKind))
    .map((e) => {
      const count = Math.min(2, e.limits.capacity)
      return { element: e.id, decision: 'keep', count, items: ITEMS.slice(0, count) }
    })
  const page = (/** @type {string} */ id, /** @type {string} */ lead, /** @type {string[]} */ dependsOn) => ({
    id,
    decision: 'keep',
    purpose: `The ${id === HOME ? 'front door' : id === CLASSES ? 'list of offerings' : 'way to reach the shop'}`,
    lead,
    facts: [],
    items: id === CONTACT ? [] : ITEMS,
    dependsOn
  })
  return {
    version: 'site-plan/1',
    pages: [
      page(HOME, 'Seasonal flowers arranged by hand', [CLASSES, 'record-page:classes']),
      page(CLASSES, 'What the shop makes for you', []),
      page(CONTACT, 'Visit or write to the shop', []),
      { id: 'record-page:classes', decision: 'keep' }
    ],
    decisions: [
      { element: TEAM, decision: 'hide', reason: 'the brief names no team members' },
      { element: 'record-page:classes', decision: 'keep' },
      ...cards
    ],
    photos: [{ photo: 'photo:a1', decision: 'use', slots: ['picture:module-156.0'] }],
    glossary: [
      { name: 'Wedding bouquets', kind: 'offering', description: SHARED },
      { name: 'Flower subscription', kind: 'offering', description: 'Fresh stems delivered every week' }
    ],
    outOfScope: { brief: [] }
  }
}

/** The editorial door double: answers the scripted plan. */
function editorialDouble(answer) {
  const used = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 }
  return {
    chat: async () => {
      used.calls += 1
      return typeof answer === 'string' ? answer : JSON.stringify(answer)
    },
    usage: () => ({ model: 'deepseek/deepseek-v4-pro', ...used, stages: {} })
  }
}

const LETTERS = 'bcdfghjklmnpqrstvwxz'
/** A word of letters only, its own for each seed: no figure, no repeat across slots. */
const wordOf = (/** @type {string} */ seed) => {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  let w = ''
  for (let i = 0; i < 6; i += 1) w += LETTERS[(h >>> (i * 4)) % LETTERS.length] + (i % 2 ? 'a' : 'o')
  return w
}
const plain = (/** @type {unknown} */ v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Words of their own for a slot, about the length of its demo text and never over its limit. */
function ownWords(/** @type {any} */ s) {
  const target = Math.max(6, Math.min(s.maxCharacters, [...plain(s.sample)].length))
  const words = []
  let i = 0
  while ([...words.join(' ')].length < target - 8) words.push(wordOf(`${s.key}:${i++}`))
  const text = words.join(' ') || wordOf(s.key)
  return `${text[0].toUpperCase()}${text.slice(1)}`.slice(0, s.maxCharacters)
}

/**
 * The text door double. A page-author call (one that carries `plan`) is answered with words of its own for every slot of
 * the page; the first long line of a page states the glossary description of the first offering, so the summary page
 * repeats words the summarised page wrote; `FAIL` is always written too long. Every other writer answers nothing.
 */
function textDouble() {
  /** @type {Array<{page: string, keys: string[], system: string, input: any}>} */
  const pageCalls = []
  return {
    pageCalls,
    chat: async ({ messages }) => {
      let input = null
      try {
        input = JSON.parse(messages.at(-1).content)
      } catch {
        return '{}'
      }
      if (!input?.plan) return JSON.stringify({ values: {}, lines: {}, pending: [], invented: [] })
      pageCalls.push({
        page: input.plan.page?.id ?? '',
        keys: input.slots.map((/** @type {any} */ s) => s.key),
        system: messages[0].content,
        input
      })
      const values = {}
      let shared = false
      for (const s of input.slots) {
        if (s.type !== 'text') values[s.key] = s.sample
        else if (!plain(s.sample)) values[s.key] = ''
        else if (s.key === FAIL) values[s.key] = `${ownWords(s)} ${'longer '.repeat(60)}`.trim()
        else if (!shared && s.maxCharacters >= SHARED.length + 10 && plain(s.sample).length >= 60) {
          values[s.key] = `${SHARED}.`
          shared = true
        } else values[s.key] = ownWords(s)
      }
      return JSON.stringify({ values, pending: [], invented: [] })
    },
    usage: () => ({ calls: pageCalls.length, promptTokens: 1_000 * pageCalls.length, completionTokens: 0 })
  }
}

async function prepareWith(models) {
  const records = {}
  const times = {}
  const engine = createJoomlaEngine({
    models: async () => models,
    woContent: { sitePlanFor: async () => null, briefFor: async () => BRIEF }
  })
  const prepared = await engine.prepare({
    siteKey: 'page-author-test',
    label: 'page-author',
    platform: 'joomla',
    quickstart: 'quickstart/ja-boxing/j6',
    contract,
    email: 'owner@example.com',
    brief: { about: ABOUT, goal: 'contact', style: 'plain' },
    normalized: {
      name: 'Fern & Petal',
      about: ABOUT,
      nameFrom: 'answer',
      tone: 'plain',
      contact: '',
      languages: ['en']
    },
    signal: new AbortController().signal,
    time: (k, v) => {
      times[k] = v
    },
    record: (k, v) => {
      records[k] = v
    },
    note: () => {},
    deadlineAt: Date.now() + 60_000
  })
  return { prepared, records, times }
}

const slotOf = new Map(map.slots.map((s) => [s.key, s]))
/** Whether a line does not reach the site with the demo's words: written, emptied, or its block or card taken off. */
const notDemo = (/** @type {any} */ prepared, /** @type {string} */ key) => {
  const slot = slotOf.get(key)
  const value = prepared.changes[key]
  if (typeof value === 'string' && plain(value) !== plain(slot.sample)) return true
  if ((prepared.demoBlanks ?? []).some((b) => b.key === key)) return true
  if ((prepared.factModules ?? []).some((m) => slot.entity === `module-${m.id}`)) return true
  return (prepared.demoHides ?? []).some(
    (h) => (h.group && h.group === slot.group?.id) || (h.how === 'entity' && h.entity === slot.entity)
  )
}

test('the author writes the pages in dependency order, each call carrying the rulebook, its page plan, the glossary and the pages written', async () => {
  const text = textDouble()
  const { records } = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  assert.equal(records.sitePlan.status, 'accepted')
  const order = [...new Set(text.pageCalls.map((c) => c.page))]
  // The contact page's own lines are the template's form and its kept labels: it may need no call.
  assert.ok(order.includes(CLASSES) && order.includes(HOME), JSON.stringify(order))
  assert.ok(
    !order.some((p) => p.startsWith('page:') && ![HOME, CLASSES, CONTACT].includes(p)),
    'no dropped page'
  )
  assert.ok(order.indexOf(CLASSES) < order.indexOf(HOME), 'the summarised page is written before its summary')
  for (const call of text.pageCalls) {
    assert.match(call.system, /Planning a brief-built website/, 'the rulebook is the author’s instructions')
    assert.deepEqual(
      call.input.glossary.map((g) => g.name),
      ITEMS
    )
    assert.ok(
      call.input.slots.every((s) => Number.isFinite(s.maxCharacters)),
      'each slot carries its limit'
    )
  }
  const home = text.pageCalls.find((c) => c.page === HOME)
  assert.equal(home.input.plan.page.lead, 'Seasonal flowers arranged by hand')
  assert.ok(
    home.input.writtenPages.some((p) => p.page === CLASSES && p.lines.some((l) => l.includes(SHARED))),
    'the home page is given the words of the offerings page'
  )
  // Per-page time and tokens on the build record.
  const writer = records.pageAuthor
  assert.deepEqual(
    writer.pages.filter((p) => p.calls > 0).map((p) => p.page),
    order
  )
  for (const p of writer.pages) {
    assert.ok(Number.isFinite(p.ms) && Number.isFinite(p.calls), JSON.stringify(p))
    assert.ok(Number.isFinite(p.promptTokens))
  }
})

test('a summary page reuses the glossary words of the page it summarises, and no written page keeps demo text', async () => {
  const text = textDouble()
  const { prepared } = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  const written = (/** @type {string} */ page) =>
    text.pageCalls.filter((c) => c.page === page).flatMap((c) => c.keys)
  const says = (/** @type {string} */ page) =>
    written(page).some((key) => String(prepared.changes[key] ?? '').includes(SHARED))
  assert.ok(says(CLASSES), 'the offerings page states the glossary description')
  assert.ok(says(HOME), 'the home page reuses it verbatim')
  // The pages of the plan; the shared parts (and the pages the plan drops, taken off by a later stage) are apart.
  const asked = new Set(text.pageCalls.filter((c) => c.page.startsWith('page:')).flatMap((c) => c.keys))
  const left = [...asked].filter(
    (key) => slotOf.get(key)?.type === 'text' && plain(slotOf.get(key)?.sample) && !notDemo(prepared, key)
  )
  assert.deepEqual(left, [], 'every line the author was given is written or taken off')
})

test('a section the plan hid gets no writer call and comes off the page', async () => {
  const text = textDouble()
  const { prepared } = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  const asked = text.pageCalls.flatMap((c) => c.keys)
  assert.deepEqual(
    asked.filter((key) => key.startsWith('module-163.')),
    []
  )
  assert.ok(
    prepared.factModules.some((m) => m.id === 163),
    'the team module is unpublished'
  )
})

test('a line still failing after its send-back is in the line trace with its page, slot, check and reason, and is not left as demo', async () => {
  const text = textDouble()
  const { prepared, records } = await prepareWith({ text, editorial: editorialDouble(authorPlan()) })
  const sent = text.pageCalls.filter((c) => c.keys.includes(FAIL))
  assert.ok(sent.length >= 2, 'the failing line goes back to the same author once')
  assert.ok(
    sent.slice(1).some((c) => String(c.input.fix ?? '').includes(FAIL)),
    'the send-back names the line'
  )
  const traced = records.copyLineTrace.find((t) => t.key === FAIL)
  assert.ok(traced, JSON.stringify(records.copyLineTrace?.slice(0, 5)))
  assert.equal(traced.check, 'too-long')
  assert.equal(traced.reason, 'refused')
  assert.equal(traced.page, 'menuItem-167')
  assert.ok(notDemo(prepared, FAIL), 'the failing line is taken off or emptied, never left as demo')
})

test('without an accepted plan the current page writer runs: no call carries a page plan', async () => {
  const text = textDouble()
  const { records, prepared } = await prepareWith({ text, editorial: editorialDouble('not a plan') })
  assert.equal(records.sitePlan.status, 'refused')
  assert.equal(text.pageCalls.length, 0)
  assert.equal(records.pageAuthor, undefined)
  assert.ok(prepared.changes)
})
