/**
 * The copy-plan stage when the model's answer stops at the reply cap (R13, spec TracyHQ/tracy#189): a provider double that
 * answers HTTP 200 with `finish_reason: "length"` and half a JSON object for any batch over a size, behind the real seed
 * model, on a released Joomla template's content map. Fictional business: a bicycle repair shop.
 *
 * The stage keeps four promises: no line is lost to a cut answer (the batch is split until it fits), a cut answer is
 * never taken for an answer nor asked again as it was, the receipt names each lost line's own kind, and the run stays
 * inside the words budget. Every call carries the brief's fact sheet.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { factSheetFor } from '../../../packages/cms/tracy-seeder/src/fact-sheet-batch.mjs'
import { planJoomlaContract } from '../../../packages/cms/tracy-seeder/src/plan-joomla-contract.mjs'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createSeedModel } from '../src/lib/seed-model.js'
import { briefFactSheet } from '../src/sites/brief-engines/brief-fact-sheet.js'
import { COPY_BUDGET, copyBudgetMs } from '../src/sites/brief-engines/copy-plan-budget.js'
import { pendingByKind, UNWRITTEN_KINDS } from '../src/sites/brief-engines/copy-plan-stage.js'
import { firmGenerate, planConcurrently } from '../src/sites/brief-engines/shared.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const state = { contract: 'ja-boxing/j6/1.0.8', revision: 'before', slots: map.slots, pages: map.pages }

/** Answers past this many slots are cut at the reply cap. */
const FITS = 12
/** The maximum output the double's model listing states. */
const MODEL_MAX = 128000

const FACT_SHEET = {
  about: 'Spoke & Chain repairs and services city bicycles in a small workshop near the harbour.',
  offerings: [
    { name: 'Puncture repair', said: ['Flat tyres fixed while you wait'] },
    { name: 'Full service', said: ['Brakes, gears and bearings checked and adjusted'] }
  ],
  people: [{ name: 'Ines', role: 'mechanic', said: ['Ines trued my wheel in ten minutes'] }],
  reviews: [{ text: 'Quick, friendly and fair. My old bike rides like new.', author: 'Tomas', rating: 5 }],
  keyMessages: [{ label: 'Same-day repairs', said: ['Most repairs done the same day'] }]
}
const SITE = {
  name: 'Spoke & Chain',
  about: 'A bicycle repair workshop.',
  languages: ['en'],
  sourceLanguage: 'en',
  factSheet: FACT_SHEET
}

/** A pronounceable word no other slot uses: the double's words never repeat a phrase or a sentence. */
const wordOf = (n) => {
  let out = ''
  for (let v = n, i = 0; i < 4; v = Math.floor(v / 70), i += 1)
    out += 'bdfgklmnprstvz'[(v % 70) % 14] + 'aeiou'[Math.floor((v % 70) / 14)]
  return out
}
/** Words for one slot, within its length, unique to the call and the slot. */
const wordsFor = (slot, n) => {
  if (!String(slot.sample ?? '').trim()) return ''
  const line = `${wordOf(n * 3 + 1)} ${wordOf(n * 3 + 2)} ${wordOf(n * 3 + 3)}`
  return line.slice(0, Math.max(1, Number(slot.maxCharacters) || line.length))
}

/** The provider double: its model listing, and chat answers cut at the cap for batches over `FITS` (or naming `cut`). */
const provider = ({ cut = () => false } = {}) => {
  const seen = { bodies: [], sizes: [], briefs: [], caps: [], fixes: [] }
  const fetchImpl = async (url, init) => {
    if (String(url).endsWith('/models'))
      return Response.json({ data: [{ id: 'gw/writer', root: 'writer', max_output_tokens: MODEL_MAX }] })
    const body = JSON.parse(init.body)
    seen.bodies.push(init.body)
    seen.caps.push(body.max_tokens)
    const input = JSON.parse(body.messages[1].content)
    seen.sizes.push(input.slots.length)
    seen.briefs.push(input.brief)
    if (input.fix) seen.fixes.push(input.fix)
    const values = Object.fromEntries(
      input.slots.map((s, i) => [s.key, wordsFor(s, seen.bodies.length * 1000 + i)])
    )
    const whole = JSON.stringify({ values, pending: [], invented: [] })
    const isCut = input.slots.length > FITS || input.slots.some((s) => cut(s.key))
    return Response.json({
      choices: [
        {
          finish_reason: isCut ? 'length' : 'stop',
          message: { content: isCut ? whole.slice(0, Math.floor(whole.length * 0.6)) : whole }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    })
  }
  return { seen, fetchImpl }
}

const run = async (double) => {
  const model = createSeedModel({
    model: { apiKey: 'k', baseUrl: 'https://gateway.example/v1', words: 'writer' },
    fetchImpl: double.fetchImpl,
    sleep: () => Promise.resolve()
  })
  return planConcurrently(
    (ask) =>
      planJoomlaContract({
        state,
        site: SITE,
        generate: ask,
        surface: 'pages',
        inventions: 'never',
        byPage: true
      }),
    firmGenerate(model),
    { inFlight: COPY_BUDGET.inFlight, budgetOf: (work) => copyBudgetMs(work) }
  )
}

test('a batch whose answer is cut at the reply cap is split until it fits: no line is lost, and nothing cut is kept', async () => {
  const double = provider()
  const out = await run(double)
  const plan = out.result
  const byKind = pendingByKind(plan)
  // Batches were cut and split: the first round asks the planner's own sizes, later rounds ask parts that fit.
  assert.ok(
    double.seen.sizes.some((n) => n > FITS),
    'the planner asks batches larger than the cap allows'
  )
  assert.ok(
    double.seen.sizes.some((n) => n <= FITS),
    'a cut batch is asked again in parts'
  )
  assert.ok(out.failed > 0, 'a cut call is counted as failed')
  // No key lost to a cut answer: every lost kind is empty.
  for (const kind of UNWRITTEN_KINDS) assert.deepEqual(byKind[kind], [], `no line left as ${kind}`)
  assert.ok(Object.keys(plan.changes).length > 100, 'the lines are written')
  // A cut answer is never read nor asked again as it was.
  assert.equal(
    Object.values(plan.reasons).filter((r) => r === 'model-unreadable').length,
    0,
    'a cut answer is never read as an unreadable one'
  )
  assert.equal(new Set(double.seen.bodies).size, double.seen.bodies.length, 'no request is sent twice')
  // Within the words budget: no call cut by it, and no more rounds than the budget allows.
  assert.equal(out.cut, 0)
  assert.ok(out.rounds <= 4, `rounds: ${out.rounds}`)
  // The reply cap is the model's own maximum output, read from its listing.
  assert.ok(double.seen.caps.every((c) => c === MODEL_MAX))
  // Every call carries the brief's fact sheet whole: offerings, people, reviews, key messages.
  for (const brief of double.seen.briefs) {
    assert.deepEqual(brief.factSheet, FACT_SHEET)
    assert.equal(brief.about, SITE.about)
  }
})

test('a line cut even alone waits as "truncated", in the receipt and as a line unwritten', async () => {
  const double = provider({ cut: (key) => key === 'module-156.3' })
  const out = await run(double)
  const byKind = pendingByKind(out.result)
  assert.ok(byKind.truncated.includes('module-156.3'), 'the cut line waits as truncated')
  assert.ok(byKind.truncated.length < FITS, 'only the last part it was split into waits with it')
  assert.deepEqual(byKind.unreadable, [])
  assert.deepEqual(byKind['model-failed'], [])
  assert.ok(UNWRITTEN_KINDS.has('truncated'), 'the tidy step never blanks it: it goes to the repair turn')
  assert.equal(out.cut, 0)
})

test('the fact sheet is read from the content brief whole: every record with its own words, and only facts kept on the site', () => {
  const brief = {
    reading: {
      about: 'Fern & Fig is a small plant shop and workshop.',
      services: [
        {
          id: 's1',
          label: 'Repotting',
          quote: 'We repot your plants',
          mentions: [{ quote: 'Bring your plant in' }]
        },
        { id: 's2', label: 'Workshops', quote: 'Terrarium evenings' }
      ],
      team: [{ id: 't1', label: 'Mara', role: 'florist', quote: 'Mara knows every fern' }],
      audience: [{ label: 'new plant owners' }],
      story: [{ label: 'Since the market days', quote: 'We started at the Saturday market' }]
    },
    googlePlace: { reviews: [{ text: 'Lovely shop, kind advice.', author: 'Noor', rating: 5 }] },
    content: { items: [{ title: 'Spring workshop', body: 'Join our spring terrarium evening.' }] },
    keyMessages: [{ label: 'Plant care', quotes: [{ text: 'Care advice for every plant' }] }],
    facts: [
      { field: 'hours', value: ['Monday: Open 24 hours'], onSite: false },
      { field: 'serviceAreas', value: ['North quarter'], onSite: true }
    ],
    primaryAction: { label: 'Book a workshop' },
    brand: { logoResearch: { chosen: { readsAs: 'FERN & FIG PLANTS' } } },
    assets: [{ caption: 'Hands repotting a fern on a wooden bench', depicts: { id: 's1' } }]
  }
  const sheet = briefFactSheet(brief)
  assert.deepEqual(sheet.offerings, [
    {
      name: 'Repotting',
      said: ['We repot your plants', 'Bring your plant in'],
      photos: ['Hands repotting a fern on a wooden bench']
    },
    { name: 'Workshops', said: ['Terrarium evenings'] }
  ])
  assert.deepEqual(sheet.people, [{ name: 'Mara', role: 'florist', said: ['Mara knows every fern'] }])
  assert.deepEqual(sheet.reviews, [{ text: 'Lovely shop, kind advice.', author: 'Noor', rating: 5 }])
  assert.deepEqual(sheet.posts, [{ title: 'Spring workshop', text: 'Join our spring terrarium evening.' }])
  assert.equal(sheet.hours, undefined, 'hours the brief kept off the site are not on the sheet')
  assert.deepEqual(sheet.serviceAreas, ['North quarter'])
  assert.equal(sheet.logoReads, 'FERN & FIG PLANTS')
  assert.equal(sheet.primaryAction, 'Book a workshop')
  assert.equal(briefFactSheet(null), null)
})

test('a catalogue too large for every call carries the full records of its own offerings and the names of the others', () => {
  const offerings = Array.from({ length: 40 }, (_, i) => ({
    name: `Plant ${String.fromCharCode(65 + (i % 26))}${i}`,
    said: ['x']
  }))
  const sheet = factSheetFor({ about: 'a', offerings }, ['Plant A0'])
  assert.deepEqual(sheet.offerings, [offerings[0]])
  assert.equal(sheet.otherOfferings.length, 39)
  const small = { about: 'a', offerings: offerings.slice(0, 3) }
  assert.equal(factSheetFor(small, []), small, 'a small sheet travels whole')
})
