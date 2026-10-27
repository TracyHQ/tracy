/**
 * The menu labels a WordPress site written in another language would keep in English (LANG-2, TCH #1013). Measured 10/10/2026
 * on dev g60-ess-wp-full (JA Essence WordPress 1.0.13, Vietnamese): "J!Pages" and "J! Content" stayed English on all 118
 * pages. The in-language judge is told to keep a brand or a proper name as it is, read "J!…" as one, and gave the label back
 * unchanged; an unchanged label was dropped without a word. A label the judge keeps or leaves out is now translated through
 * `translateLines` (asked again, split, line by line), and what still stays English is said.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { judgeSite } from '../src/sites/brief-engines/wp-residue.js'

const business = { name: 'Tamarind & Co', about: 'A family bakery in Dubai.', sector: null }
const toVi = (/** @type {string} */ text) => `VI ${text}`

/**
 * A disobedient model: the judge gives "J!Pages" back unchanged and leaves "J! Content" out; a translation batch answers
 * "J!Pages" in English again and drops its last entry; asked alone, a label first comes back unchanged, then translated.
 */
function disobedient() {
  const calls = { judge: 0, batch: 0, alone: 0 }
  const seen = new Map()
  return {
    calls,
    chat: async (/** @type {any} */ { messages }) => {
      const system = String(messages[0].content)
      const input = JSON.parse(messages[1].content)
      if (system.startsWith('You are tidying')) {
        calls.judge += 1
        return JSON.stringify({ relabel: { Home: 'Trang chủ', 'J!Pages': 'J!Pages', User: 'Người dùng' } })
      }
      if (Array.isArray(input)) {
        calls.batch += 1
        return JSON.stringify(
          input.slice(0, -1).map(({ i, text }) => ({ i, text: text === 'J!Pages' ? text : toVi(text) }))
        )
      }
      calls.alone += 1
      const times = (seen.get(input.text) ?? 0) + 1
      seen.set(input.text, times)
      return JSON.stringify({ text: times === 1 ? input.text : toVi(input.text) })
    }
  }
}

test('g60: labels the in-language judge keeps or leaves out are translated, and said', async () => {
  const model = disobedient()
  const notes = []
  const out = await judgeSite(
    model,
    business,
    {
      labels: ['Home', 'J!Pages', 'J! Content', 'User'],
      language: 'Vietnamese',
      locale: 'vi',
      note: (/** @type {string} */ n) => notes.push(n)
    },
    undefined
  )
  assert.deepEqual(Object.fromEntries(out.relabel), {
    Home: 'Trang chủ',
    User: 'Người dùng',
    'J!Pages': 'VI J!Pages',
    'J! Content': 'VI J! Content'
  })
  assert.ok(
    notes.some((n) => /left in the template’s language were translated/.test(n)),
    notes.join(' | ')
  )
})

test('a site in the source language translates no label the judge leaves', async () => {
  const model = disobedient()
  const out = await judgeSite(model, business, { labels: ['Home', 'J!Pages'], locale: 'en' })
  assert.equal(model.calls.batch + model.calls.alone, 0)
  assert.ok(!out.relabel.has('J!Pages'))
})
