// Only the languages the customer chose get their words replaced.
//
// A quickstart may ship several editions of the same site. `tracy-business/j6` carries 899 en-GB
// slots and 899 ru-RU ones, because the demo it was cut from is a Russian contractor. A customer
// who asks for English used to have all 1800 planned: the model was handed Russian marketing copy
// to rewrite from a brief that says nothing about it, and pended it.
//
// Measured 22/09/2026 on `site-sc76lv` (answers `languages: ['en-gb']`): 135 slots written, 1249
// kept, of which 644 were ru-RU, and 1223 carried the reason `model-pended`. The build then told
// the customer "1249 slot(s) still hold demo words" about a site half of whose slots they had
// never asked anything about.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { languageScope, languageWanted } from '../src/locales.mjs'

test('a language the customer did not choose is left alone', () => {
  const chosen = new Set(['en'])
  assert.equal(languageWanted('en-GB', chosen), true)
  assert.equal(languageWanted('ru-RU', chosen), false, 'the Russian edition is not this site')
})

test('the answer and the contract may spell the same language differently', () => {
  // 🔒 THE THREE CMS ANSWERED THREE DIFFERENT SPELLINGS ON THE SAME DAY — `en-gb`, `en-us`, `en`
  // (measured 22/09/2026 across one Joomla, one WordPress and one EmDash site). Comparing the full
  // tag would leave the English edition untouched on two of the three.
  for (const answer of ['en', 'en-gb', 'en-us', 'EN-GB']) {
    const chosen = new Set([answer.toLowerCase().split('-')[0]])
    assert.equal(languageWanted('en-GB', chosen), true, answer)
    assert.equal(languageWanted('ru-RU', chosen), false, answer)
  }
})

test('two chosen languages keep both editions, and only those', () => {
  const chosen = new Set(['en', 'vi'])
  assert.equal(languageWanted('en-GB', chosen), true)
  assert.equal(languageWanted('vi-VN', chosen), true)
  assert.equal(languageWanted('ru-RU', chosen), false)
})

test('🔒 anything unknown is KEPT — dropping content on a guess is the failure this may not have', () => {
  const chosen = new Set(['en'])
  assert.equal(languageWanted('*', chosen), true, 'all-languages content belongs to every edition')
  assert.equal(languageWanted(null, chosen), true, 'an entity with no language is not evidence')
  assert.equal(languageWanted(undefined, chosen), true)
  assert.equal(languageWanted('', chosen), true)
})

test('🔒 no language chosen means English, not every edition (David, 23/09/2026)', () => {
  // The editions left out keep the quickstart's own words; nothing is hidden.
  const scope = languageScope({ name: 'x' })
  assert.deepEqual([...scope], ['en'])
  assert.equal(languageWanted('en-GB', scope), true)
  assert.equal(languageWanted('ru-RU', scope), false, 'the Russian edition keeps its demo words')
  assert.equal(languageWanted('*', scope), true, 'content no language can be told for is still written')
  assert.deepEqual(
    [...languageScope({ languages: ['de-DE'] })],
    ['de'],
    'a choice without English is kept as made'
  )
})

// ── …and the plan actually drops them ───────────────────────────────────────────────────────────
//
// 🔒 THE FOUR TESTS ABOVE PASS WITHOUT THE FIX, AND THAT IS WHY THIS ONE EXISTS. They call
// `languageWanted` directly, so they pin the rule and measure nothing about whether the plan uses
// it — measured by deleting the filter clause and watching all four stay green. This one runs the
// planner and counts what reached the model.

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'

function contractOnDisk(id, entities) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lang-'))
  const at = path.join(dir, 'quickstart-contracts', id)
  mkdirSync(at, { recursive: true })
  writeFileSync(path.join(at, 'content-map.json'), JSON.stringify({ entities, slots: [], pages: [] }))
  return dir
}

test('the planner asks the model about the chosen language only', async () => {
  const id = 'tracy-business/j6/1.0.0'
  const dataDir = contractOnDisk(id, [
    { key: 'mod-en', identity: { language: 'en-GB' } },
    { key: 'mod-ru', identity: { language: 'ru-RU' } },
    { key: 'mod-any', identity: { language: '*' } }
  ])
  const slot = (key, entity) => ({
    key,
    entity,
    column: 'content',
    type: 'text',
    sample: 'demo words',
    maxCharacters: 200,
    label: key
  })
  const state = {
    contract: id,
    pages: [],
    slots: [slot('mod-en.0', 'mod-en'), slot('mod-ru.0', 'mod-ru'), slot('mod-any.0', 'mod-any')]
  }

  const asked = []
  const generate = async ({ input }) => {
    for (const s of input?.slots ?? []) asked.push(s.key)
    return JSON.stringify({ values: {}, pending: [] })
  }
  await planJoomlaContract({
    state,
    site: { name: 'bán xe honda', languages: ['en-gb'] },
    generate,
    now: new Date('2026-09-22T00:00:00Z'),
    dataDir
  })

  assert.ok(asked.includes('mod-en.0'), 'the chosen language is planned')
  assert.ok(asked.includes('mod-any.0'), 'all-languages content belongs to every edition')
  assert.ok(
    !asked.includes('mod-ru.0'),
    `a language the customer did not choose must never reach the model — asked: ${asked.join(', ')}`
  )
})

// ── The target language, named — and checked ─────────────────────────────────────────────────────
//
// The same hole the WordPress planner had until 23/09/2026: the input carried the brief and the
// slots but no language, so a brief typed in Vietnamese could fill the English edition in
// Vietnamese. Measured on WordPress (`wp-oyib7i`); on Joomla the 615 pended slots of `j-8zjzs6` hid it.

const id = 'tracy-business/j6/1.1.0'
const joomlaSlot = (key, entity, sample = 'Built for the way you work') => ({
  key,
  entity,
  column: 'content',
  type: 'text',
  sample,
  maxCharacters: 200,
  label: key
})
const joomla = () => ({
  dataDir: contractOnDisk(id, [
    { key: 'mod-en', identity: { language: 'en-GB' } },
    { key: 'mod-ru', identity: { language: 'ru-RU' } }
  ]),
  state: {
    contract: id,
    pages: [],
    slots: [
      joomlaSlot('mod-en.0', 'mod-en'),
      joomlaSlot('mod-en.1', 'mod-en'),
      joomlaSlot('mod-ru.0', 'mod-ru', 'Строим для вас')
    ]
  }
})
const brief = { name: 'Toyota Hà Nội', about: 'Đại lý xe Toyota chính hãng', languages: ['en-GB'] }
const now = new Date('2026-09-23T00:00:00Z')

test('the Joomla planner names each slot’s language and the batch’s, and the prompt makes it the one to write in', async () => {
  const { dataDir, state } = joomla()
  let seen = null
  let system = ''
  const generate = async ({ system: words, input }) => {
    system = words
    seen = input
    return JSON.stringify({ values: {}, pending: input.slots.map((s) => s.key) })
  }
  await planJoomlaContract({ state, site: brief, generate, now, dataDir })
  assert.equal(seen.language, 'en-GB')
  assert.deepEqual(
    seen.slots.map((s) => [s.key, s.language]),
    [
      ['mod-en.0', 'en-GB'],
      ['mod-en.1', 'en-GB']
    ]
  )
  assert.match(system, /whatever language the brief is written in/)
})

test('🔒 a Joomla answer in the brief’s language is asked again, and a value still wrong keeps the demo words', async () => {
  const { dataDir, state } = joomla()
  const inputs = []
  const generate = async ({ input }) => {
    inputs.push(input)
    return JSON.stringify({
      values: {
        'mod-en.0':
          inputs.length === 1
            ? 'Đại lý xe Toyota chính hãng tại Hà Nội'
            : 'An authorised Toyota dealer in Hà Nội',
        'mod-en.1': 'Chúng tôi cung cấp dịch vụ bảo dưỡng xe'
      },
      pending: []
    })
  }
  const out = await planJoomlaContract({ state, site: brief, generate, now, dataDir })
  assert.equal(inputs.length, 3)
  assert.match(inputs[1].fix, /in another language/)
  assert.equal(out.changes['mod-en.0'], 'An authorised Toyota dealer in Hà Nội')
  assert.equal(out.changes['mod-en.1'], undefined)
  assert.equal(out.reasons['mod-en.1'], 'wrong-language')
})

test('a retry that cannot be read does not cost the usable answer before it', async () => {
  // Before the language check a readable answer ended the loop; asking again for a language must
  // not turn two garbled retries into a failed seed.
  const { dataDir, state } = joomla()
  let calls = 0
  const generate = async () => {
    calls += 1
    return calls === 1
      ? JSON.stringify({
          values: {
            'mod-en.0': 'An authorised Toyota dealer in Hà Nội',
            'mod-en.1': 'Chúng tôi cung cấp dịch vụ bảo dưỡng xe'
          },
          pending: []
        })
      : 'not json'
  }
  const out = await planJoomlaContract({ state, site: brief, generate, now, dataDir })
  assert.equal(calls, 3)
  assert.equal(out.changes['mod-en.0'], 'An authorised Toyota dealer in Hà Nội')
  assert.equal(out.reasons['mod-en.1'], 'wrong-language')
})
