/**
 * The kit and system sample pages of JA Essence j6 1.0.4 (K3, TCH #1013): Typography, Offline Pages and Error Page show what
 * the template draws, so they keep its words, translated on a site written in another language. Measured 10/10/2026 on dev
 * g58-ess-j-full: the Offline page named the bakery ("Mỗi Trang ngoại tuyến của tiệm bánh Tamarind & Co…"), the Error page's
 * sentence was rewritten into nonsense, and the Typography body stayed English.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { kitEntities, translateKit } from '../src/sites/brief-engines/joomla-kit.js'
import { essence, essenceModel, map, runEssence } from './_joomla-essence-site.mjs'

const toVi = (/** @type {string} */ text) => `VI ${text}`
const linesOf = (/** @type {string} */ entity) =>
  map.slots.filter(
    (/** @type {any} */ s) => s.entity === entity && s.type === 'text' && /\p{L}/u.test(s.sample)
  )

test('Typography, Offline Pages and Error Page are kit pages, found by their entries and by their articles', () => {
  const kit = kitEntities(essence.dir)
  for (const entity of [
    'menuItem-111',
    'article-4',
    'menuItem-110',
    'article-5',
    'menuItem-109',
    'article-6'
  ])
    assert.ok(kit.has(entity), `${entity} is a kit page`)
  assert.ok(!kit.has('article-20'), 'a blog article is not')
})

test('a Vietnamese FULL Apply: the Offline and Error pages are the template’s words translated, never the bakery’s', async () => {
  const { written } = await runEssence({ model: essenceModel({ translate: toVi }) })
  for (const entity of ['article-5', 'article-6', 'article-4'])
    for (const s of linesOf(entity))
      assert.equal(
        written[s.key],
        toVi(s.sample),
        `${s.key} "${s.sample.slice(0, 40)}" is translated, not rewritten`
      )
})

/**
 * A model that misbehaves on the lines `bad` names, the way answers went wrong on dev: in a batch (an array) it drops the
 * last entry and keeps the English of every `bad` line; alone (`{text, limit}`) it first answers the English unchanged, then
 * translates. Every call is counted.
 */
function disobedient(/** @type {Set<string>} */ bad, { aloneEcho = true } = {}) {
  const calls = { batch: 0, alone: 0 }
  const seen = new Map()
  return {
    calls,
    chat: async ({ messages }) => {
      const input = JSON.parse(messages[1].content)
      if (!Array.isArray(input)) {
        calls.alone += 1
        const times = (seen.get(input.text) ?? 0) + 1
        seen.set(input.text, times)
        return JSON.stringify({ text: aloneEcho && times === 1 ? input.text : toVi(input.text) })
      }
      calls.batch += 1
      if (!input.some((/** @type {any} */ item) => bad.has(item.text)))
        return JSON.stringify(input.map(({ i, text }) => ({ i, text: toVi(text) })))
      return JSON.stringify(
        input.slice(0, -1).map(({ i, text }) => ({ i, text: bad.has(text) ? text : toVi(text) }))
      )
    }
  }
}

test('g59: the first batch of Typography that the model answers in English is translated anyway, line by line if need be', async () => {
  const slots = linesOf('article-4')
  assert.ok(slots.length > 60, 'Typography has several batches of lines')
  // Measured on g59-ess-j-full: exactly the first 30 lines ("Typography" … "Alerts") stayed English.
  const model = disobedient(new Set(slots.slice(0, 30).map((s) => s.sample)))
  const notes = []
  const out = await translateKit({
    slots,
    locale: 'vi-VN',
    source: 'en-GB',
    model,
    shipped: new Map(),
    note: (n) => notes.push(n)
  })
  // Spaces around a line are the page's (a line asked alone keeps them where the sample has them).
  const flat = (/** @type {unknown} */ text) =>
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  const english = slots.filter((s) => flat(out[s.key]) !== flat(toVi(s.sample)))
  assert.deepEqual(
    english.map((s) => s.sample),
    [],
    'no line of the kit keeps its English'
  )
  assert.ok(
    notes.some((n) => /asked again/.test(n)),
    notes.join(' | ')
  )
  assert.ok(
    notes.some((n) => /translated one by one/.test(n)),
    notes.join(' | ')
  )
  assert.ok(!notes.some((n) => /keep the template’s language/.test(n)), notes.join(' | '))
})

test('a batch whose answer always fails is split, then each line is asked alone; a line lost is said with its reason', async () => {
  const slots = linesOf('article-4').slice(0, 30)
  const fails = slots[3].sample
  const model = {
    chat: async ({ messages }) => {
      const input = JSON.parse(messages[1].content)
      if (Array.isArray(input)) {
        if (input.some((/** @type {any} */ item) => item.text === fails)) throw new Error('model timed out')
        return JSON.stringify(input.map(({ i, text }) => ({ i, text: toVi(text) })))
      }
      // Alone, the line comes back with its words respelled into English again every time.
      return JSON.stringify({ text: input.text === fails ? fails : toVi(input.text) })
    }
  }
  const notes = []
  const out = await translateKit({
    slots,
    locale: 'vi-VN',
    source: 'en-GB',
    model,
    shipped: new Map(),
    note: (n) => notes.push(n)
  })
  for (const s of slots)
    if (s.sample !== fails) assert.equal(out[s.key], toVi(s.sample), `${s.key} is translated`)
  assert.equal(out[slots[3].key], undefined)
  const kept = notes.find((n) => /keep the template’s language/.test(n))
  assert.ok(kept && kept.includes(fails.slice(0, 20)), notes.join(' | '))
  assert.match(kept, /kept the words as they are/)
})

test('an answer that loses a placeholder is not a translation', async () => {
  const slots = [{ key: 'K1', type: 'text', sample: 'Written by %s', maxCharacters: 60 }]
  let alone = 0
  const model = {
    chat: async ({ messages }) => {
      const input = JSON.parse(messages[1].content)
      if (Array.isArray(input)) return JSON.stringify(input.map(({ i }) => ({ i, text: 'Viết bởi' })))
      alone += 1
      return JSON.stringify({ text: 'Viết bởi %s' })
    }
  }
  const out = await translateKit({
    slots,
    locale: 'vi-VN',
    source: 'en-GB',
    model,
    shipped: new Map(),
    note: () => {}
  })
  assert.deepEqual(out, { K1: 'Viết bởi %s' })
  assert.equal(alone, 1)
})

test('a model that never answers is asked a bounded number of times, and the loss is said', async () => {
  const slots = linesOf('article-4')
  let calls = 0
  const model = {
    chat: async () => {
      calls += 1
      throw new Error('503 overloaded')
    }
  }
  const notes = []
  const out = await translateKit({
    slots,
    locale: 'vi-VN',
    source: 'en-GB',
    model,
    shipped: new Map(),
    note: (n) => notes.push(n)
  })
  assert.deepEqual(out, {})
  assert.ok(calls < 40, `${calls} calls`)
  assert.ok(
    notes.some((n) => new RegExp(`${slots.length} line\\(s\\).*did not answer`).test(n)),
    notes.join(' | ')
  )
})
