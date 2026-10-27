/**
 * A demo label that reads like a name is visitor text, translated on a site written in another language (LANG-2, TCH #1013).
 * Measured 11/10/2026 on dev g61 (JA Essence, FULL, Vietnamese): WordPress kept "J!Pages" and "J! Content" in its menu on 118
 * pages and Joomla kept them (with "User") as T4 mega column titles on 158 pages. Round 5 sent what the judge kept through
 * `translateLines`, but every prompt on the way said "keep product, brand and people names as written", so a model that took
 * "J!Pages" for a brand kept it at every step and the line ended English. The rule (product owner): only the names the
 * customer gave are kept; a demo label is translated, a model that will not translate it is asked once more with the demo's
 * mark taken off ("J!Pages" → "Pages"), and what still stays English is said.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { judgeSite } from '../src/sites/brief-engines/wp-residue.js'
import { writeLanguageOverrides } from '../src/sites/brief-engines/joomla-site-strings.js'

const business = { name: 'Tamarind & Co', about: 'A family bakery in Dubai.', sector: null }
const toVi = (/** @type {string} */ text) => `VI ${text}`
const looksLikeName = (/** @type {string} */ text) => /J!/.test(text)

/**
 * A disobedient model: whatever it is told, it gives back any words holding "J!" unchanged (the judge, a translation batch,
 * a line asked alone), and translates every other line. It never says what it kept.
 */
function disobedient() {
  /** @type {Array<{ system: string, input: any }>} */
  const calls = []
  return {
    calls,
    usage: () => ({}),
    chat: async (/** @type {any} */ { messages }) => {
      const system = String(messages[0].content)
      const input = JSON.parse(messages[1].content)
      calls.push({ system, input })
      if (system.startsWith('You are tidying'))
        return JSON.stringify({
          relabel: Object.fromEntries(
            input.labels.map((/** @type {string} */ l) => [l, looksLikeName(l) ? l : toVi(l)])
          )
        })
      if (Array.isArray(input))
        return JSON.stringify(
          input.map(({ i, text }) => ({ i, text: looksLikeName(text) ? text : toVi(text) }))
        )
      return JSON.stringify({ text: looksLikeName(input.text) ? input.text : toVi(input.text) })
    }
  }
}

test('g61 WordPress: a menu label a model keeps as a brand still ends translated, and the report says how', async () => {
  const model = disobedient()
  const notes = []
  const out = await judgeSite(
    model,
    business,
    {
      labels: ['Home', 'J!Pages', 'J! Content', 'J!Pages submenu'],
      language: 'Vietnamese',
      locale: 'vi',
      note: (/** @type {string} */ n) => notes.push(n)
    },
    undefined
  )
  assert.deepEqual(Object.fromEntries(out.relabel), {
    Home: 'VI Home',
    'J!Pages': 'VI Pages',
    'J! Content': 'VI Content',
    'J!Pages submenu': 'VI Pages submenu'
  })
  assert.ok(
    notes.some((n) => /without the demo’s mark/.test(n)),
    notes.join(' | ')
  )
})

test('every prompt on the way keeps only the names the customer gave, never a template word that reads like a brand', async () => {
  const model = disobedient()
  await judgeSite(model, business, { labels: ['J!Pages'], language: 'Vietnamese', locale: 'vi' }, undefined)
  for (const { system } of model.calls) {
    assert.doesNotMatch(system, /keep (?:a |product, )?brand/i, system.slice(0, 160))
  }
  const judge = model.calls.find((c) => c.system.startsWith('You are tidying'))
  assert.match(judge?.system ?? '', /J!Pages/)
  // A line asked alone carries the customer's names; a batch names them in its prompt (the batch now takes the mark off
  // itself, round 6, so a disobedient model may never reach the line asked alone).
  const alone = model.calls.filter((c) => !Array.isArray(c.input) && typeof c.input.text === 'string')
  for (const c of alone) assert.deepEqual(c.input.keep, ['Tamarind & Co'])
  const batches = model.calls.filter((c) => Array.isArray(c.input))
  assert.ok(alone.length + batches.length > 0)
  for (const c of batches) assert.match(c.system, /Tamarind & Co/)
})

test('g61 Joomla: mega column titles offered as page literals end translated, "J!Pages" too', async () => {
  const model = disobedient()
  const notes = []
  /** @type {any[]} */
  const sets = []
  const rows = [
    { key: 'TRACY_LITERAL_USER', source: 'User', reason: 'literal', rank: 'used' },
    { key: 'TRACY_LITERAL_J_PAGES', source: 'J!Pages', reason: 'literal', rank: 'used' },
    { key: 'TRACY_LITERAL_J_CONTENT', source: 'J! Content', reason: 'literal', rank: 'used' }
  ]
  await writeLanguageOverrides({
    apply: async ({ params }) =>
      params.operation === 'read'
        ? { ok: true, strings: rows, overrides: {}, total: rows.length, nextOffset: null }
        : (sets.push(params.strings), { ok: true, written: Object.keys(params.strings).length }),
    siteKey: 'g61-j',
    template: 'ja_essence',
    locale: 'vi-VN',
    model,
    note: (n) => notes.push(n)
  })
  assert.deepEqual(sets[0], {
    TRACY_LITERAL_USER: 'VI User',
    TRACY_LITERAL_J_PAGES: 'VI Pages',
    TRACY_LITERAL_J_CONTENT: 'VI Content'
  })
})

test('a model that never answers a line leaves it in the template’s words, and says so', async () => {
  const notes = []
  const dead = {
    usage: () => ({}),
    chat: async (/** @type {any} */ { messages }) => {
      const input = JSON.parse(messages[1].content)
      if (String(messages[0].content).startsWith('You are tidying'))
        return JSON.stringify({
          relabel: Object.fromEntries(input.labels.map((/** @type {string} */ l) => [l, l]))
        })
      if (Array.isArray(input)) return JSON.stringify(input.map(({ i, text }) => ({ i, text })))
      return JSON.stringify({ text: input.text })
    }
  }
  const out = await judgeSite(
    dead,
    business,
    { labels: ['J!Pages'], language: 'Vietnamese', locale: 'vi', note: (n) => notes.push(n) },
    undefined
  )
  assert.ok(!out.relabel.has('J!Pages'))
  assert.ok(
    notes.some((n) => /keep the template’s language/.test(n)),
    notes.join(' | ')
  )
})
