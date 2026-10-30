/**
 * 🔒 EVERY VISIBLE SLOT OF A KEPT BLOCK IS WRITTEN OR REMOVED (spec TracyHQ/tracy#189, R12 group A, COO criteria 1.1, 1.2,
 * 1.5, 1.7, 4.3, 4.4). After the copy plan and the tidy plan, a demo line of the template is in exactly one of two states:
 * written for the business, or its whole item or block taken off by the template's own hide mechanism. Never an emptied
 * line, never the demo's words served as the business's. A line still unwritten (its call lost, or refused and not
 * removable) keeps its demo words for the repair loop as a `copy-lines` finding, and the blocker gate is red while it
 * stands. A group (the cards of a row, the steps of an outline) is all written or all removed, else the gate is red.
 *
 * Prepare runs on a released Joomla template's content map for two fictional businesses of other trades, with a text model
 * double that fails some calls, refuses some keys and runs past the words budget.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { buildBlockers } from 'website-opportunities/domain/build-blockers.mjs'
import { ruleOfFinding } from 'website-opportunities/domain/build-rules.mjs'
import { checkCopyLines } from '../src/opportunities-build/copy-lines-check.js'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { isBlockCopyLine } from '../src/sites/brief-engines/copy-plan-stage.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const MAP = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const slotOf = new Map(MAP.slots.map((s) => [s.key, s]))

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
    { contentMap: MAP }
  )
}

const LETTERS = 'bcdfghjklmnpqrstvwxz'
/** A word of letters only, its own for each seed. */
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
    const words = s === 0 && title ? title.toLowerCase().split(/\s+/) : []
    let i = 0
    while ([...words.join(' ')].length < per - 6) words.push(wordOf(`${key}:${s}:${i++}`))
    const line = words.join(' ')
    sentences.push(`${line[0].toUpperCase()}${line.slice(1)}.`)
  }
  let text = sentences.join(' ')
  const [least, most] = shape.characters
  while ([...text].length > most && /\p{L}{2}\.$/u.test(text)) text = `${text.slice(0, -2)}.`
  while ([...text].length < least) text = `${text.slice(0, -1)}o.`
  return text
}

/** One page-pass answer that meets the page hints, for the slots it is given. */
function passAnswer(input) {
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
      values[s.key] = !s.fill
        ? ''
        : s.describe
          ? shaped(s.key, { sentences: [1, 1], characters: [40, 80] }, s.describe)
          : `Item ${wordOf(s.key)}`.slice(0, s.maxCharacters)
      continue
    }
    const own = titles.get(s.key) ?? `Item ${wordOf(s.key)}`.slice(0, s.maxCharacters)
    if (s.action) values[s.key] = `Ready to ${s.action.toLowerCase()}`.slice(0, s.maxCharacters)
    else if (s.shape) {
      const title = s.shape.titleText ?? (s.shape.title ? titles.get(s.shape.title) : s.describe)
      const top = Math.min(s.shape.characters[1], s.maxCharacters)
      values[s.key] = shaped(s.key, { ...s.shape, characters: [s.shape.characters[0], top] }, title ?? '')
    } else if (s.describe)
      values[s.key] = shaped(s.key, { sentences: [1, 1], characters: [40, 80] }, s.describe)
    else values[s.key] = own
  }
  return { values, pending: [], invented: [] }
}

/**
 * The faulty text model: a page-pass call holding a `fail` key throws (its split retries too), one holding a `slow` key
 * waits until the words budget aborts it, and a `refuse` key is answered as pending. Every later writer writes nothing.
 */
function faultyModel({ fail, refuse, slow }) {
  const stats = { failed: 0, refused: 0, slow: 0 }
  /** Every line a page-pass call was given: the lines a visitor sees that the writer is asked for. */
  const given = new Set()
  return {
    stats,
    given,
    models: async () => ({
      text: {
        usage: () => ({}),
        chat: async (call) => {
          const pass = call.messages[0].content.startsWith('Replace Joomla quickstart')
          const input = JSON.parse(call.messages[1].content)
          if (!pass) return JSON.stringify({ lines: {}, values: {} })
          const keys = (input.slots ?? []).map((s) => s.key)
          for (const key of keys) given.add(key)
          if (keys.some((k) => fail.has(k))) {
            stats.failed += 1
            throw new Error('the model did not answer')
          }
          if (keys.some((k) => slow.has(k))) {
            stats.slow += 1
            await new Promise((_resolve, reject) => {
              const stop = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
              if (call.signal?.aborted) stop()
              call.signal?.addEventListener('abort', stop)
            })
          }
          const answer = passAnswer(input)
          for (const key of keys)
            if (refuse.has(key)) {
              delete answer.values[key]
              answer.pending.push(key)
              stats.refused += 1
            }
          return JSON.stringify(answer)
        }
      }
    })
  }
}

function contextOf(name, about, deadlineMs) {
  const records = {}
  return {
    records,
    ctx: {
      siteKey: 'kept-slots-test',
      label: 'kept-slots',
      platform: 'joomla',
      quickstart: 'quickstart/ja-boxing/j6',
      contract,
      email: 'owner@example.com',
      brief: { about, goal: 'contact', style: 'plain' },
      normalized: { name, about, nameFrom: 'answer', tone: 'plain', contact: '', languages: ['en'] },
      signal: new AbortController().signal,
      time: () => {},
      record: (k, v) => {
        records[k] = v
      },
      note: () => {},
      deadlineAt: Date.now() + deadlineMs
    }
  }
}

const plain = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The state each visible demo line of the plan ends in after the tidy plan: `written`, `removed` (its item or block is
 * taken off), `blank` (emptied in a kept block) or `demo` (still the template's words).
 */
function lineStates(prepared, plan, given) {
  const removedEntities = new Set([
    ...(prepared.demoHides ?? []).filter((h) => h.how === 'entity').map((h) => h.entity),
    ...(prepared.factModules ?? []).map((m) => `module-${m.id}`),
    ...(prepared.ctaBands?.removed ?? []).map((b) => b.entity),
    ...(plan.honesty?.hide ?? []).filter((h) => h.how === 'entity').map((h) => h.entity)
  ])
  const removedGroups = new Set([
    ...(prepared.demoHides ?? []).map((h) => h.group).filter(Boolean),
    ...(plan.honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group)
  ])
  const planBlanks = new Set((plan.honesty?.blanks ?? []).map((b) => b.key))
  const blanks = new Set((prepared.demoBlanks ?? []).map((b) => b.key))
  /** @type {Map<string, string>} */
  const states = new Map()
  for (const key of given) {
    const slot = slotOf.get(key)
    if (!slot || slot.type !== 'text' || !plain(slot.sample) || planBlanks.has(key)) continue
    // A copy line of a block: a fact, a button, a menu label or a template UI string is another rule's.
    if (!isBlockCopyLine(slot)) continue
    if (removedEntities.has(slot.entity) || (slot.group?.id && removedGroups.has(slot.group.id)))
      states.set(key, 'removed')
    else if (blanks.has(key)) states.set(key, 'blank')
    else if (
      key in prepared.changes &&
      plain(prepared.changes[key]) &&
      plain(prepared.changes[key]) !== plain(slot.sample)
    )
      states.set(key, 'written')
    else if (key in prepared.changes && !plain(prepared.changes[key])) states.set(key, 'blank')
    else states.set(key, 'demo')
  }
  return states
}

/** The keys of a page-pass batch to fault: the text lines of a module list, a record page's outline and others. */
function faultsOf(plan) {
  const asked = (plan.slots ?? []).filter((s) => s?.decision === 'text').map((s) => s.key)
  const text = asked.filter((k) => slotOf.get(k)?.type === 'text' && plain(slotOf.get(k)?.sample))
  const ofGroup = (re) => text.filter((k) => re.test(String(slotOf.get(k)?.group?.id ?? '')))
  // A module's JSON list item (the block can come off whole) and a record page's outline step (it cannot).
  const listItem = ofGroup(/^module-\d+\.item\.\d+$/)
  const outline = ofGroup(/^article-\d+\.outline\.\d+$/)
  const feature = ofGroup(/^article-\d+\.feature\.\d+$/)
  assert.ok(
    listItem.length && outline.length && feature.length,
    'the template has the groups the test faults'
  )
  return {
    refuse: new Set([listItem[0], outline[1], feature[2]]),
    fail: new Set([outline.at(-1)]),
    slow: new Set([feature.at(-1)])
  }
}

for (const [trade, name, about, services, action] of [
  [
    'locksmith',
    'Keyway Locksmiths',
    'Keyway Locksmiths opens, repairs and replaces locks for homes and small shops.',
    ['Lock repair', 'Emergency opening', 'Key cutting', 'Safe service'],
    'Call a locksmith'
  ],
  [
    'yoga studio',
    'Stillwater Yoga Studio',
    'Stillwater Yoga Studio teaches calm, slow yoga classes for every level.',
    ['Morning flow', 'Gentle yoga', 'Breath work', 'Private lessons'],
    'Book a class'
  ]
])
  test(`${trade}: after the tidy plan no kept slot is blank or silently demo, groups are whole, and the gate sees the rest`, async () => {
    const plan = await planFor(name, about, services, action)
    const faults = faultsOf(plan)
    const model = faultyModel(faults)
    const { ctx, records } = contextOf(name, about, 6_000)
    const engine = createJoomlaEngine({ models: model.models, woContent: { sitePlanFor: async () => plan } })
    const prepared = await engine.prepare(ctx)
    assert.ok(
      model.stats.failed > 0 && model.stats.refused > 0 && model.stats.slow > 0,
      JSON.stringify(model.stats)
    )

    const pendingKeys = Object.values(records.copyPending ?? {}).flat()
    const states = lineStates(prepared, plan, new Set([...model.given, ...pendingKeys]))
    const of = (state) => [...states].filter(([, s]) => s === state).map(([k]) => k)
    // 1. No kept slot is emptied silently: an emptied line in a kept block is the `&nbsp;` card of R12. Only a line whose
    // demo words name the demo company is emptied, and it is on the row as "blanked", a blocker.
    const blankedOnRow = new Set(records.copyLines?.blanked ?? [])
    assert.deepEqual(
      of('blank').filter((k) => !blankedOnRow.has(k)),
      [],
      'no line of a kept block is emptied silently'
    )
    // 2. A refused line whose block the template can take off is taken off: the module list item's block goes whole.
    const refusedItem = [...faults.refuse].find((k) => /^module-/.test(k))
    assert.equal(states.get(refusedItem), 'removed', `${refusedItem} is removed with its block`)
    // 3. Every line still in the demo's words is handed to the repair loop on the row.
    const unwritten = new Set((records.copyLines?.unwritten ?? []).map((l) => l.key))
    const silent = of('demo').filter((key) => !unwritten.has(key))
    assert.deepEqual(
      silent,
      [],
      `every line still in demo words is unwritten on the row: ${silent.map((k) => `${k} ${slotOf.get(k)?.role} ${JSON.stringify(String(slotOf.get(k)?.sample).slice(0, 30))}`).join(' | ')}`
    )
    for (const key of [...faults.refuse].filter((k) => !/^module-/.test(k)))
      assert.ok(
        ['written', 'removed'].includes(states.get(key)) || unwritten.has(key),
        `${key} is never blanked`
      )
    // 4. A group is all written or all removed, else its lines are findings.
    const groups = new Map()
    for (const [key, state] of states) {
      const id = slotOf.get(key)?.group?.id
      if (id) groups.set(id, [...(groups.get(id) ?? []), state])
    }
    const mixed = [...groups].filter(
      ([, s]) => new Set(s).size > 1 && !s.every((x) => x === 'written' || x === 'removed')
    )
    // 5. The blocker gate is red whenever a kept slot is blank or demo, or a group is not whole; clear otherwise.
    const findings = checkCopyLines({ copyLines: records.copyLines }).map((f) => ({
      ...f,
      rule: ruleOfFinding(f)?.id
    }))
    const gate = buildBlockers({ findings })
    const broken = of('blank').length + of('demo').length + mixed.length
    assert.ok(broken > 0, 'the faults leave lines for the repair loop')
    assert.equal(gate.state, 'needs-fixes', `the gate stops the site: ${JSON.stringify(gate.items)}`)
    assert.ok(
      gate.items.some((i) => ruleOfFinding({ kind: 'unwritten' })?.id === i.rule),
      'the copy-lines rule is the blocker'
    )
    // And a run with no lines left is clear.
    assert.equal(buildBlockers({ findings: [] }).state, 'clear')
  })
