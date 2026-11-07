// The kit's slot corrections reach the site tool through the plugin's own inspect answer: a slot it opens
// comes out with `opensEmpty` and the corrected `maxCharacters`, the same slot the plugin's
// `checkValue` judges and the writer fills (apps/tracy-web/src/write-step/slot-corrections.js). The
// mirror reads that slot and nothing else, so one list decides for the writer, the plugin and the site
// tool alike. Every name and word here is invented.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { checkSlotValue } from '../src/host/contract-check.mjs'
import { replaceOnJoomla } from '../src/host/replace-joomla.mjs'
import { planReplace } from '../src/host/replace.mjs'
import { narrowInspect } from '../src/host/site.mjs'

const KIT = JSON.parse(
  readFileSync(new URL('./fixtures/contract/slot-corrections-kit.json', import.meta.url), 'utf8')
)
const withoutCorrections = () => ({ ...KIT.alt })
const withCorrections = () => ({ ...KIT.alt, ...KIT.corrected })
const inspect = (alt) => ({
  ok: true,
  contract: 'invented-kit/j6/1.0.0',
  revision: 'r1',
  languages: [],
  slots: [KIT.picture, alt],
  pages: [KIT.page]
})

const FITS = 'A made-up boxing ring under warm lights late in the evening'
const TOO_LONG = 'An invented ring '.repeat(8).trim()

/** One content.replace of the alt's words, against doors that record the apply. */
async function replaceAlt(alt, replace) {
  const applies = []
  const r = await replaceOnJoomla({
    plan: planReplace({ find: KIT.alt.current, replace, path: '/' }),
    snapshot: async () => inspect(alt),
    apply: async (params) => {
      applies.push(params)
      return { ok: true }
    },
    pageHtml: async () => ({ ok: true, status: 200, html: KIT.home }),
    evidenceText: null,
    mint: (prefix) => `${prefix}-1`,
    env: {}
  })
  return { r, applies }
}

test('an empty-demo alt is refused when the plugin hands it out uncorrected', () => {
  assert.equal(checkSlotValue(withoutCorrections(), 'Made-up words')?.rule, 'cannot-fill')
})

test('an alt the plugin opens takes words up to its corrected limit, and no further', () => {
  assert.ok(FITS.length > KIT.alt.maxCharacters && FITS.length <= KIT.corrected.maxCharacters)
  assert.equal(checkSlotValue(withCorrections(), FITS), null)
  assert.ok(TOO_LONG.length > KIT.corrected.maxCharacters)
  assert.deepEqual(checkSlotValue(withCorrections(), TOO_LONG), {
    rule: 'max-characters',
    key: KIT.alt.key,
    message: `Content too long: ${KIT.alt.key}`,
    limit: KIT.corrected.maxCharacters,
    length: TOO_LONG.length
  })
  // `opensEmpty` is PHP `empty()`: a false flag opens nothing
  assert.equal(checkSlotValue({ ...withCorrections(), opensEmpty: false }, FITS)?.rule, 'cannot-fill')
})

test('content.replace on an opened alt writes it; without the correction nothing is sent', async () => {
  const open = await replaceAlt(withCorrections(), FITS)
  assert.equal(open.r.ok, true, JSON.stringify(open.r))
  assert.equal(open.applies.at(-1)?.changes?.[KIT.alt.key], FITS)

  const closed = await replaceAlt(withoutCorrections(), 'A made-up ring')
  assert.equal(closed.r.ok, false)
  assert.equal(closed.r.rule, 'cannot-fill')
  assert.equal(closed.applies.length, 0)

  const long = await replaceAlt(withCorrections(), TOO_LONG)
  assert.equal(long.r.rule, 'max-characters')
  assert.equal(long.r.limit, KIT.corrected.maxCharacters)
  assert.equal(long.applies.length, 0)
})

test('a narrowed inspect does not call an opened alt empty, and shows its corrected limit', () => {
  const pick = (alt) =>
    narrowInspect(inspect(alt), { operation: 'inspect', entity: 'module-70' }).slots.find(
      (s) => s.key === KIT.alt.key
    )
  assert.equal(pick(withoutCorrections()).empty, true)
  assert.equal(pick(withCorrections()).empty, undefined)
  assert.equal(pick(withCorrections()).max, KIT.corrected.maxCharacters)
})
