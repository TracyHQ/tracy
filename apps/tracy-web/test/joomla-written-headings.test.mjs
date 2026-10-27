/** The headings a written language rewrites: never the plugin's mask of a content slot (`__CONTENT_SLOT__`). */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { setSiteLanguage, writeSourceLanguage } from '../src/sites/brief-engines/joomla-languages.js'

// What the Claude Cowork plugin's plan names on a JA Boxing 1.0.4 site: a footer heading the contract carries as a slot
// (`module-175.6`, "GET IN TOUCH") is masked in the binding, so the plan hands over the mask as its words.
const titles = [
  { key: 'module-175.title', source: '__CONTENT_SLOT__', maxCharacters: 100 },
  { key: 'module-160.params.title-btn', source: '__CONTENT_SLOT__', maxCharacters: 400 },
  { key: 'module-200.title', source: 'Newsletter', maxCharacters: 100 }
]
// A model (or the cache it filled) answers a placeholder with itself: it is not words to translate.
const cache = new Map([
  ['vi-VN:100:__CONTENT_SLOT__', '__CONTENT_SLOT__'],
  ['vi-VN:400:__CONTENT_SLOT__', '__CONTENT_SLOT__'],
  ['vi-VN:100:Newsletter', 'Bản tin']
])

/** A content.contract double answering the plan and recording the set. */
function site(planOp, extra = {}) {
  /** @type {any[]} */
  const sets = []
  const contract = async (/** @type {any} */ params) => {
    if (params.operation === planOp) return { ok: true, titles, ...extra }
    sets.push(params)
    return { ok: true }
  }
  return { contract, sets }
}

test('a one-edition site written in Vietnamese never writes the mask over a heading', async () => {
  const { contract, sets } = site('siteLanguage.plan')
  assert.equal(await setSiteLanguage({ contract, locale: 'vi-VN', note: () => {}, cache }), true)
  assert.deepEqual(sets[0].titles, { 'module-200.title': 'Bản tin' })
})

test('a two-edition site written in Vietnamese never writes the mask over a heading', async () => {
  const { contract, sets } = site('sourceLanguage.plan', { written: true })
  assert.equal(
    await writeSourceLanguage({ contract, locale: 'vi-VN', note: () => {}, cache, model: null }),
    true
  )
  assert.deepEqual(sets[0].titles, { 'module-200.title': 'Bản tin' })
})
