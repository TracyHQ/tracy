/**
 * One pass per page (spec TracyHQ/tracy#189, COO decision 30/10/2026): the copy writer writes each page whole, told the
 * shape of every sibling list, the lines of sibling record pages, the offering a line describes and the action of every
 * band; the writers that used to patch the page afterwards only write what the pass hands them. Fictional businesses of
 * two trades (a bakery, a bicycle repair shop) on a released Joomla template's content map.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { pageBatches } from '../../../packages/cms/tracy-seeder/src/page-pass.mjs'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { pagePass, reachable } from '../src/sites/brief-engines/page-pass.js'
import { siblingLists } from 'website-opportunities/domain/sibling-copy-shape.mjs'
import { recordFamilies } from 'website-opportunities/domain/record-page-copy.mjs'
import { slotOwnership } from '../src/sites/brief-engines/slot-ownership.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const mapOf = (c) => JSON.parse(readFileSync(path.join(c.dir, 'content-map.json'), 'utf8'))

test('whole pages share a call, first fit, and a page too large for one call is split by its sections', () => {
  const slot = (entity, n) => Array.from({ length: n }, (_, i) => ({ key: `${entity}.${i}`, entity }))
  const pageOf = (e) => ({ a: ['home'], b: ['home'], c: ['about'], d: ['shop'], e: ['big'] })[e] ?? []
  const slots = [
    ...slot('a', 4),
    ...slot('c', 7),
    ...slot('x', 2),
    ...slot('b', 3),
    ...slot('d', 4),
    ...slot('e', 12)
  ]
  const split = (s, size) => [s.slice(0, size), s.slice(size)]
  const calls = pageBatches(slots, pageOf, 10, split)
  const entitiesOf = (call) => [...new Set(call.map((s) => s.entity))]
  // home (a + b, 7 slots) and about (7) do not fit one call of 10; the slots of no page (x) go last into the first room.
  // The last part of the split page fills the room the first call left.
  assert.deepEqual(calls.map(entitiesOf), [['a', 'b', 'e'], ['c', 'x'], ['d'], ['e']])
  assert.ok(calls.every((call) => call.length <= 10))
  assert.equal(calls.flat().length, slots.length, 'every slot is planned once')
})

test('a later writer never overwrites a line the pass holds; a guard that changed the line frees it', () => {
  const owned = slotOwnership()
  owned.claim({ 'm.1': 'Fresh loaves every morning.', 'm.2': 'Too short' }, 'page-copy', { 'm.2': 'sibling' })
  const now = { 'm.1': 'Fresh loaves every morning.', 'm.2': 'Too short', 'm.3': '' }
  assert.deepEqual(owned.admit({ 'm.1': 'Other words.', 'm.2': 'Long enough words.' }, 'sibling', now), {
    'm.2': 'Long enough words.'
  })
  assert.deepEqual(owned.refused(), [{ key: 'm.1', writer: 'sibling', owner: 'page-copy' }])
  // A guard emptied the pass's line: it is free for the writer that fills empty lines.
  assert.deepEqual(owned.admit({ 'm.1': 'Written again.' }, 'record-page', { 'm.1': '' }), {
    'm.1': 'Written again.'
  })
  // A change the writer may still make to a held line (its spelling aligned to the title) passes.
  owned.claim({ 'm.4': 'Personalised plans' })
  assert.deepEqual(
    owned.admit(
      { 'm.4': 'Personalized plans' },
      'sibling',
      { 'm.4': 'Personalised plans' },
      { refines: () => true }
    ),
    { 'm.4': 'Personalized plans' }
  )
})

/** A fictional business on the template, its site plan read from the content map. */
async function planFor(name, description, services, action) {
  const { planSite } = await import('website-opportunities/domain/site-plan.mjs')
  return planSite(
    {
      business: { name, description },
      primaryAction: { label: action, channel: 'contact', href: null, basis: 'sourced', evidence: [] },
      reading: { services: services.map((label, i) => ({ id: `s${i}`, label })) }
    },
    { questions: [] },
    { contentMap: mapOf(contract) }
  )
}

const LETTERS = 'bcdfghjklmnpqrstvwxz'
/** A word of letters only, its own for each seed: no figure, no repeat across slots. */
const wordOf = (seed) => {
  let h = 7
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  let w = ''
  for (let i = 0; i < 6; i += 1) w += LETTERS[(h >>> (i * 4)) % LETTERS.length] + (i % 2 ? 'a' : 'o')
  return w
}

/** Words of a page hint's shape: its least sentences, the middle of its length, the card's title in it. */
function shaped(key, shape, title) {
  const target = Math.round((shape.characters[0] + shape.characters[1]) / 2)
  const n = shape.sentences[0]
  const per = Math.max(8, Math.floor(target / n))
  const sentences = []
  for (let s = 0; s < n; s += 1) {
    let words = s === 0 && title ? title.toLowerCase().split(/\s+/) : []
    let i = 0
    while ([...words.join(' ')].length < per - 6) words.push(wordOf(`${key}:${s}:${i++}`))
    const line = words.join(' ')
    sentences.push(`${line[0].toUpperCase()}${line.slice(1)}.`)
  }
  // Words of whole letters overshoot a narrow band: the last word is cut or grown so the text lands inside it.
  let text = sentences.join(' ')
  const [least, most] = shape.characters
  while ([...text].length > most && /\p{L}{2}\.$/u.test(text)) text = `${text.slice(0, -2)}.`
  while ([...text].length < least) text = `${text.slice(0, -1)}o.`
  return text
}

/**
 * A text model double. `obeys`: the copy writer follows the page hints it is given (each line to its shape, about its
 * title, its own words on each record page, the band's action); otherwise it rewrites every demo line the same way and
 * ignores the hints. Every call is counted by the writer that made it.
 */
function textModel({ obeys }) {
  const calls = {}
  /** Every line a later writer was asked for. */
  const asked = new Set()
  const count = (system) => {
    const writer = system.startsWith('Replace Joomla quickstart')
      ? 'page pass'
      : system.startsWith('You write the body text of cards')
        ? 'sibling'
        : system.startsWith('You write lines of the record pages')
          ? 'record-page'
          : system.startsWith('You write the line under an offering')
            ? 'offering'
            : system.startsWith('You write the message of one call-to-action band')
              ? 'cta-band'
              : 'other'
    calls[writer] = (calls[writer] ?? 0) + 1
    return writer
  }
  return {
    calls,
    asked,
    models: async () => ({
      text: {
        usage: () => ({}),
        chat: async ({ messages }) => {
          const writer = count(messages[0].content)
          const input = JSON.parse(messages[1].content)
          if (writer !== 'page pass') {
            for (const l of [...(input.lines ?? []), ...(input.slots ?? [])]) asked.add(l.key)
            return JSON.stringify({ lines: {}, values: {} })
          }
          const values = {}
          const titles = new Map()
          for (const s of input.slots)
            if (s.type === 'text' && String(s.sample ?? '').trim())
              titles.set(s.key, `Item ${wordOf(s.key)}`.slice(0, s.maxCharacters))
          for (const s of input.slots) {
            if (s.type !== 'text') {
              values[s.key] = s.sample
              continue
            }
            if (!String(s.sample ?? '').trim()) {
              values[s.key] =
                !obeys || !s.fill
                  ? ''
                  : s.describe
                    ? shaped(s.key, { sentences: [1, 1], characters: [40, 80] }, s.describe)
                    : `Item ${wordOf(s.key)}`.slice(0, s.maxCharacters)
              continue
            }
            const own = titles.get(s.key) ?? `Item ${wordOf(s.key)}`.slice(0, s.maxCharacters)
            if (!obeys)
              values[s.key] = `Golden ${String(s.sample).replace(/\d/g, '')}`.slice(0, s.maxCharacters)
            else if (s.action) values[s.key] = `Ready to ${s.action.toLowerCase()}`.slice(0, s.maxCharacters)
            else if (s.shape) {
              const title = s.shape.titleText ?? (s.shape.title ? titles.get(s.shape.title) : s.describe)
              const top = Math.min(s.shape.characters[1], s.maxCharacters)
              values[s.key] = shaped(
                s.key,
                { ...s.shape, characters: [s.shape.characters[0], top] },
                title ?? ''
              )
            } else if (s.describe)
              values[s.key] = shaped(s.key, { sentences: [1, 1], characters: [40, 80] }, s.describe)
            else values[s.key] = own
          }
          return JSON.stringify({ values, pending: [], invented: [] })
        }
      }
    })
  }
}

function contextOf(name, about) {
  const notes = []
  return {
    notes,
    ctx: {
      siteKey: 'page-pass-test',
      label: 'page-pass',
      platform: 'joomla',
      quickstart: 'quickstart/ja-boxing/j6',
      contract,
      email: 'owner@example.com',
      brief: { about, goal: 'contact', style: 'plain' },
      normalized: { name, about, nameFrom: 'answer', tone: 'plain', contact: '', languages: ['en'] },
      signal: new AbortController().signal,
      time: () => {},
      note: (n) => notes.push(n),
      deadlineAt: Date.now() + 60_000
    }
  }
}

for (const [trade, name, about, services, action] of [
  [
    'bakery',
    'Rye Hill Bakery',
    'Rye Hill Bakery bakes sourdough bread and pastries every morning.',
    ['Sourdough bread', 'Pastries', 'Rye loaves', 'Seed rolls'],
    'Order bread'
  ],
  [
    'bicycle repair shop',
    'Spoke and Chain Repairs',
    'Spoke and Chain Repairs fixes and tunes city and road bicycles.',
    ['Tune ups', 'Wheel truing', 'Brake service', 'Chain fitting'],
    'Book a repair'
  ]
])
  test(`${trade}: a pass that meets its page rules leaves the later writers nothing to ask, and none overwrites it`, async () => {
    assert.ok(contract, 'the checkout ships the template release')
    const plan = await planFor(name, about, services, action)
    const pass = pagePass({
      slots: mapOf(contract).slots,
      contentMap: mapOf(contract),
      honesty: plan.honesty,
      sitePlan: plan
    })
    const hinted = Object.values(pass.hints)
    assert.ok(
      hinted.some((h) => h.shape),
      'sibling lists are told their shape'
    )
    assert.ok(
      hinted.some((h) => h.siblings),
      'record page lines are told their sibling pages'
    )
    assert.ok(
      hinted.some((h) => h.describe),
      'offering lines are told their offering'
    )
    assert.ok(
      hinted.some((h) => h.action),
      'band lines are told their action'
    )

    // A band no line can meet: its characters and its line count per viewport exclude each other (a defect of the band
    // reader, reported apart); its lines are asked of the later writers whatever the pass writes.
    const unreachable = new Set(
      siblingLists(mapOf(contract).slots)
        .filter((l) => !reachable(l.band))
        .flatMap((l) => l.siblings.map(({ slot }) => slot.key))
    )
    const runs = {}
    for (const obeys of [false, true]) {
      const model = textModel({ obeys })
      const { ctx } = contextOf(name, about)
      const engine = createJoomlaEngine({
        models: model.models,
        woContent: { sitePlanFor: async () => plan }
      })
      const prepared = await engine.prepare(ctx)
      runs[obeys ? 'obeys' : 'ignores'] = { calls: model.calls, asked: model.asked, prepared }
    }
    const pages = mapOf(contract).pages.length
    const { obeys, ignores } = runs
    const later = (calls) =>
      ['sibling', 'record-page', 'offering', 'cta-band'].reduce((n, w) => n + (calls[w] ?? 0), 0)
    // A writer that ignores the page rules still has every later writer asked, as before.
    assert.ok(later(ignores.calls) > 0, `the later writers are asked: ${JSON.stringify(ignores.calls)}`)
    // One that meets them: no later writer is asked for a line it could meet, and the site takes fewer calls.
    assert.deepEqual(
      [...obeys.asked].filter((key) => !unreachable.has(key)),
      [],
      `no later writer is asked: ${JSON.stringify(obeys.calls)}`
    )
    assert.ok(later(obeys.calls) < later(ignores.calls))
    const total = (calls) => Object.values(calls).reduce((n, v) => n + v, 0)
    assert.ok(
      total(obeys.calls) < total(ignores.calls),
      JSON.stringify({ obeys: obeys.calls, ignores: ignores.calls })
    )
    assert.ok(obeys.calls['page pass'] <= pages * 2, 'about one call per page')
    // The band keeps the pass's message, written for the action its button carries.
    const band = mapOf(contract).ctaBands[0]
    assert.match(String(obeys.prepared.changes[band.message[0].key]), new RegExp(action, 'i'))
  })

/**
 * 🔒 THE COPY-PLAN STAGE KEEPS ITS INVARIANTS UNDER A FAILING MODEL (spec TracyHQ/tracy#189, R12 stage diff): the same
 * contract and brief, the writer that ignores the page rules (so its pages are sent back), and three doubles of what went
 * wrong on the pilot: (a) every send-back fails, (b) send-backs are slower than the budget, (c) one batch is lost.
 */
function faulty(model, { failSendBacks = false, sendBackMs = 0, loseBatchWith = null } = {}) {
  const lost = { count: null, done: false }
  const stats = { sendBacks: 0, lost: 0 }
  return {
    stats,
    models: async () => {
      const { text } = await model.models()
      return {
        text: {
          usage: () => ({}),
          chat: async (call) => {
            const input = JSON.parse(call.messages[1].content)
            const pass = call.messages[0].content.startsWith('Replace Joomla quickstart')
            if (pass && input.fix) {
              stats.sendBacks += 1
              if (failSendBacks) throw new Error('the model did not answer')
              if (sendBackMs && call.signal?.aborted)
                throw Object.assign(new Error('aborted'), { name: 'AbortError' })
              if (sendBackMs)
                await new Promise((resolve, reject) => {
                  const timer = setTimeout(resolve, sendBackMs)
                  call.signal?.addEventListener('abort', () => {
                    clearTimeout(timer)
                    reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
                  })
                })
            }
            const keys = (input.slots ?? []).map((s) => s.key)
            if (pass && loseBatchWith && keys.includes(loseBatchWith)) {
              lost.count ??= keys.length
              if (!lost.done && keys.length === lost.count) {
                lost.done = true
                stats.lost += 1
                throw new Error('the model did not answer')
              }
            }
            return text.chat(call)
          }
        }
      }
    }
  }
}

/** One build of the stage, its prepared plan and what the run recorded on its row. */
async function stageRun(name, about, plan, models, deadlineMs = 60_000) {
  const { ctx } = contextOf(name, about)
  const times = {}
  const records = {}
  ctx.time = (k, v) => {
    times[k] = v
  }
  ctx.record = (k, v) => {
    records[k] = v
  }
  ctx.deadlineAt = Date.now() + deadlineMs
  const engine = createJoomlaEngine({ models, woContent: { sitePlanFor: async () => plan } })
  const prepared = await engine.prepare(ctx)
  return { prepared, times, records }
}

const MAP = mapOf(contract)
const slotOf = new Map(MAP.slots.map((s) => [s.key, s]))
/** The demo lines each record page of a family still shows: a text slot the demo filled that the plan did not write. */
function demoKeptByRecord(prepared) {
  return recordFamilies(MAP).map((family) =>
    family.map(
      (entity) =>
        MAP.slots.filter(
          (s) =>
            s.entity === entity &&
            s.type === 'text' &&
            String(s.sample ?? '').trim() &&
            !(s.key in prepared.changes) &&
            !(prepared.demoBlanks ?? []).some((b) => b.key === s.key)
        ).length
    )
  )
}
const written = (prepared) => Object.keys(prepared.changes).length

for (const [trade, name, about, services, action] of [
  [
    'dental clinic',
    'Lindenhof Dental Care',
    'Lindenhof Dental Care cleans, fills and whitens teeth for families.',
    ['Check ups', 'Fillings', 'Whitening', 'Hygiene visits'],
    'Book a visit'
  ],
  [
    'flower shop',
    'Moss and Petal Florist',
    'Moss and Petal Florist arranges bouquets and wedding flowers by hand.',
    ['Bouquets', 'Wedding flowers', 'Plants', 'Wreaths'],
    'Order flowers'
  ]
])
  test(`${trade}: a lost send-back, a slow one or a lost batch never costs a line a readable answer wrote`, async () => {
    const plan = await planFor(name, about, services, action)
    // The baseline: the same writer, every send-back answered as the first answer was (a page rule changes nothing).
    const base = await stageRun(name, about, plan, textModel({ obeys: false }).models)
    assert.ok(written(base.prepared) > 0)

    // (a) every send-back fails: the first answers stand, nothing is pending as model-pended, nothing blanked for it.
    const a = faulty(textModel({ obeys: false }), { failSendBacks: true })
    const runA = await stageRun(name, about, plan, a.models)
    assert.ok(a.stats.sendBacks > 0, 'the writer is sent back')
    assert.ok(
      written(runA.prepared) >= written(base.prepared),
      `lines written ${written(runA.prepared)} >= ${written(base.prepared)}`
    )
    for (const [key, value] of Object.entries(base.prepared.changes))
      if (slotOf.get(key)?.type === 'text')
        assert.equal(runA.prepared.changes[key], value, `the first answer of ${key} survives`)

    // (b) send-backs slower than the budget: cut, recorded as "deadline", and the first answers stand.
    const b = faulty(textModel({ obeys: false }), { sendBackMs: 5_000 })
    const runB = await stageRun(name, about, plan, b.models, 2_500)
    assert.ok(
      runB.times.copyCallsCut >= 1,
      `a call the budget cut is recorded: ${JSON.stringify(runB.times)}`
    )
    assert.ok(Number.isFinite(runB.times.copyCallP95Ms), 'the per-call p95 is recorded')
    for (const key of Object.keys(base.prepared.changes))
      if (slotOf.get(key)?.type === 'text' && slotOf.get(key)?.entity?.startsWith('article-'))
        assert.ok(key in runB.prepared.changes, `${key} keeps its first answer past the budget`)

    // (c) one batch is lost: it is retried split, so no record page keeps more demo lines than its siblings.
    const family = recordFamilies(MAP)[0]
    const key = MAP.slots.find(
      (s) => s.entity === family[0] && s.type === 'text' && String(s.sample ?? '').trim()
    )?.key
    const c = faulty(textModel({ obeys: false }), { loseBatchWith: key })
    const runC = await stageRun(name, about, plan, c.models)
    assert.equal(c.stats.lost, 1, 'one batch is lost')
    assert.ok(written(runC.prepared) >= written(base.prepared), 'the split retry writes what the batch held')
    // The template's own record pages differ in how many lines the writer is given; a lost batch adds none to any of them.
    const before = demoKeptByRecord(base.prepared)
    demoKeptByRecord(runC.prepared).forEach((counts, f) =>
      counts.forEach((n, i) =>
        assert.ok(
          n <= before[f][i],
          `record page ${family[i]} keeps ${n} demo line(s), ${before[f][i]} without the loss`
        )
      )
    )

    // No visible demo line whose call was lost is blanked silently: it is kept out of the blanks and recorded "unwritten".
    for (const run of [runA, runB, runC]) {
      const lost = new Set([
        ...(run.records.copyPending?.['model-failed'] ?? []),
        ...(run.records.copyPending?.deadline ?? [])
      ])
      const blanked = (run.prepared.demoBlanks ?? []).filter((s) => lost.has(s.key))
      assert.deepEqual(
        blanked.map((s) => s.key),
        [],
        'a lost line is never in the blanks'
      )
      assert.ok(run.records.copyLines, 'the lines the build emptied or never wrote are on the row')
    }
  })
