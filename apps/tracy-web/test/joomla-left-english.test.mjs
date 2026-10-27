/**
 * The words a plan leaves in the template's language on a Joomla site written in another one (LANG-2, TCH #1013). Measured
 * 10/10/2026 on dev g60-ess-j-full (JA Essence j6 1.0.4, FULL, Vietnamese): the menu headings "User", "J!Pages" and
 * "J! Content" (contract slots `menuItem-103.0`, `-104.0`, `-105.0`) stayed English on all 158 pages, beside a translated
 * "Pages". A planner answer that keeps a line's English, or leaves the line out, wrote nothing and said nothing.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { essenceModel, map, runEssence } from './_joomla-essence-site.mjs'

const toVi = (/** @type {string} */ text) => `VI ${text}`
const HEADINGS = ['menuItem-103.0', 'menuItem-104.0', 'menuItem-105.0']
const sampleOf = (/** @type {string} */ key) => map.slots.find((/** @type {any} */ s) => s.key === key).sample

/**
 * A disobedient model, the way answers went wrong on dev: the planner answers the menu headings with their English words
 * unchanged, leaves one out entirely, and answers every other line; a translation batch that holds a heading drops its last
 * entry and answers the headings in English again; asked alone, a heading first comes back in English, then translated.
 */
function disobedient() {
  const seen = new Map()
  const echo = new Set(HEADINGS.slice(0, 2).map(sampleOf))
  return essenceModel({
    lookup: (input) => {
      if (Array.isArray(input)) {
        if (!input.some((item) => echo.has(item.text) || item.text === sampleOf(HEADINGS[2]))) return null
        return JSON.stringify(
          input.slice(0, -1).map(({ i, text }) => ({
            i,
            text: echo.has(text) || text === sampleOf(HEADINGS[2]) ? text : toVi(text)
          }))
        )
      }
      if (typeof input?.text === 'string' && typeof input?.limit === 'number') {
        const times = (seen.get(input.text) ?? 0) + 1
        seen.set(input.text, times)
        return JSON.stringify({ text: times === 1 ? input.text : toVi(input.text) })
      }
      if (!Array.isArray(input?.slots)) return null
      const values = {}
      for (const s of input.slots) {
        if (s.requiresEvidence || s.key === HEADINGS[2]) continue
        values[s.key] = HEADINGS.includes(s.key)
          ? s.sample
          : s.type === 'text' && s.sample.trim()
            ? `Bakery ${s.key}`.slice(0, s.maxCharacters)
            : s.sample
      }
      return JSON.stringify({ values, pending: [], invented: [] })
    },
    translate: toVi
  })
}

test('g60: menu headings the planner kept in English or left out are translated, and the report says so', async () => {
  const { written, notes } = await runEssence({ model: disobedient() })
  for (const key of HEADINGS)
    assert.equal(written[key], toVi(sampleOf(key)), `${key} "${sampleOf(key)}" is Vietnamese`)
  assert.ok(
    notes.some((n) => /left in the template’s language were translated/.test(n)),
    notes.join(' | ')
  )
})

test('an English site translates nothing the plan left', async () => {
  const model = disobedient()
  const { written } = await runEssence({ model, languages: ['en'] })
  for (const key of HEADINGS) assert.notEqual(written[key], toVi(sampleOf(key)))
})
