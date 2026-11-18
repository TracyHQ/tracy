// Every left out code the plan can write has words on the plan card in every language the card ships (#575 stand: a
// Vietnamese card read "This stays off your site until you confirm it." and "You asked to take this off the plan."
// in English). The codes come from the domain's own list (`plan-left-out-codes.mjs`), so a code added there without
// the card's words fails here. A plan stored before a sentence had its code is said by its exact sentence.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/plan-left-out-codes.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import {
  COUNTED_LEFT_OUT_CODES,
  LEFT_OUT_CODES,
  LEFT_OUT_SENTENCES,
  NEUTRAL_LEFT_OUT
} from '../../../wo/website-opportunities/domain/plan-left-out-codes.mjs'
import { bundleClient, translatorOf, viTablePath } from './bundle-client.mjs'

const localesDir = path.resolve(path.dirname(viTablePath), '../../tracy-locales')
const TABLES = {
  vi: JSON.parse(readFileSync(viTablePath, 'utf8')),
  ...Object.fromEntries(
    ['de', 'es', 'fr', 'it', 'nl', 'zh'].map((l) => [
      l,
      JSON.parse(readFileSync(path.join(localesDir, l, 'tracy-build-chat.json'), 'utf8'))
    ])
  )
}
const UNSAID = '\u0000not said\u0000'
let lib
let done
before(async () => {
  ;({ lib, done } = await bundleClient(`
    export { english, en } from './strings'
    export * from './plan-codes'`))
})
after(() => done?.())

/** Every form a line of `code` takes: its kinds and the parameters its sentence is said from. */
function formsOf(code) {
  const uses = COUNTED_LEFT_OUT_CODES[code] ?? []
  const kinds = uses.includes('kind') ? ['item', 'feature', 'page', 'block'] : ['item']
  const params = uses.includes('count')
    ? [{ count: 1 }, { count: 3 }]
    : uses.includes('min')
      ? [{ min: 2 }]
      : uses.includes('why')
        ? [{ why: 'not_google_review' }]
        : [undefined]
  return kinds.flatMap((kind) => params.map((p) => ({ code, kind, ...(p ? { params: p } : {}) })))
}

test('every left out code the plan writes is said on the card, in every language it ships', () => {
  const missing = []
  for (const code of LEFT_OUT_CODES)
    for (const entry of formsOf(code)) {
      const used = new Set()
      const t = (key, vars) => {
        used.add(key)
        return lib.english(key, vars)
      }
      const said = lib.leftOutReasonOf(t, entry, UNSAID)
      if (said === UNSAID || used.size === 0) {
        missing.push(`${code} ${JSON.stringify(entry)}: no English words`)
        continue
      }
      for (const key of used)
        for (const [locale, table] of Object.entries(TABLES))
          if (!Object.hasOwn(table, key)) missing.push(`${locale}: ${key}`)
    }
  assert.deepEqual(missing, [])
})

test('the English card says each sentence code writes word for word', () => {
  for (const [code, sentence] of Object.entries(LEFT_OUT_SENTENCES))
    assert.equal(lib.leftOutReasonOf(lib.english, { code, kind: 'feature' }, UNSAID), sentence, code)
  for (const [kind, sentence] of Object.entries(NEUTRAL_LEFT_OUT))
    if (kind !== 'feature')
      assert.equal(
        lib.leftOutReasonOf(lib.english, { code: 'left_out_neutral', kind }, UNSAID),
        sentence,
        kind
      )
})

test('a stored line whose sentence is a code sentence is said in the card language; other words stay', () => {
  const vi = translatorOf(TABLES.vi, lib.en)
  const asked = LEFT_OUT_SENTENCES.requested_off
  // Carried as the model's words, or under a brief code the card has no words for (`stale`).
  for (const code of ['model_reason', 'stated', 'stale', undefined])
    assert.equal(
      lib.leftOutReasonOf(vi, { code, kind: 'item' }, asked),
      TABLES.vi['plan.leftOut.reason.requested_off'],
      String(code)
    )
  assert.equal(
    lib.leftOutReasonOf(vi, { code: 'stale', kind: 'feature' }, LEFT_OUT_SENTENCES.kept_off_site),
    TABLES.vi['plan.leftOut.reason.kept_off_site']
  )
  // Words that are no code sentence, exactly, stay as the plan wrote them.
  const own = 'Our team section needs two people.'
  assert.equal(lib.leftOutReasonOf(vi, { code: 'model_reason', kind: 'item' }, own), own)
  assert.equal(lib.leftOutReasonOf(vi, { code: 'model_reason', kind: 'item' }, `${asked} `), `${asked} `)
  // A line of items with another reason after it: both said in the card language.
  assert.equal(
    lib.leftOutReasonsOf(vi, {
      reason: LEFT_OUT_SENTENCES.no_place_in_design,
      code: 'no_place_in_design',
      kind: 'item',
      also: [{ reason: asked, code: 'model_reason' }]
    }),
    `${TABLES.vi['plan.leftOut.reason.no_place_in_design']} ${TABLES.vi['plan.leftOut.reason.requested_off']}`
  )
})
