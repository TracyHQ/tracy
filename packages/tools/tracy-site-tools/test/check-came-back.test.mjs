/**
 * Findings a build repaired at one check and undid before the next (`findingsCameBack`), on the shape of local round
 * 31 (25/10/2026, WordPress): native-structure went 9 → 3 → 9 → 9 → 3 findings while each repair of the words over a
 * photo broke what the one before had put back, and no answer said so.
 *
 *   node --test packages/tools/tracy-site-tools/test/check-came-back.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cameBackNext, checkVerdicts, findingsCameBack } from '../src/host/site-context.mjs'

/** A log of `tracy_demo` checks, each answered with `verdicts[n]`. */
function log(verdicts) {
  return verdicts.flatMap((v, n) => [
    { type: 'tool/call', data: { name: 'tracy_demo', arguments: { operation: 'check' }, callId: `k${n}` } },
    {
      type: 'tool/result',
      data: { message: { source: { callId: `k${n}` }, content: [{ type: 'text', text: JSON.stringify(v) }] } }
    }
  ])
}
const failing = (...checks) => ({
  pass: false,
  checks: checks.map(([id, detail]) => ({ id, pass: false, detail }))
})
const markup = { record: 'post/100', path: '.post_content', part: 'shape', at: 247 }
const overlay = {
  page: '/',
  style: 'head > style#global-styles-inline-css',
  declaration: 'background-color:rgba(0,0,0,0.65)'
}
const looks = {
  page: '/offers/',
  where: 'Cookie Club card over the photo',
  viewport: 'desktop',
  fix: 'Darken it'
}

test('a finding repaired at one check and back at the next is named, with the template guards said once', () => {
  const before = log([
    failing(['native-structure', [markup]], ['looks-finished', [looks]]),
    failing(['looks-finished', [looks]])
  ])
  assert.equal(checkVerdicts(before).length, 2)
  const came = findingsCameBack(
    before,
    failing(['native-structure', [{ ...markup, at: 251 }]], ['look-kept', [overlay]])
  )
  assert.deepEqual(came, {
    fixedAt: 2,
    back: [{ check: 'native-structure', detail: { ...markup, at: 251 } }]
  })
  const next = cameBackNext(/** @type {any} */ (came))
  assert.match(
    next,
    /^These came back after check 2 had them repaired: native-structure \(post\/100 \.post_content\)\./
  )
  assert.match(next, /put that change back as it was/)
  assert.match(
    next,
    /never repair another failure by changing a block's markup, adding a colour or editing a stylesheet/
  )
})

test('a finding seen for the first time, one never repaired, and the vision model findings do not come back', () => {
  const before = log([failing(['native-structure', [markup]]), failing(['native-structure', [markup]])])
  // still failing at the check before: not repaired, so not back
  assert.equal(findingsCameBack(before, failing(['native-structure', [markup]])), null)
  // new at this check: not back either
  assert.equal(findingsCameBack(before, failing(['look-kept', [overlay]])), null)
  // looks-finished words its findings anew each time: no identity, never "back"
  const eye = log([
    failing(['looks-finished', [looks]]),
    failing(['cta-real', [{ page: '/', text: 'Book' }]])
  ])
  assert.equal(findingsCameBack(eye, failing(['looks-finished', [looks]])), null)
  // one check before is not enough to have repaired anything
  assert.equal(
    findingsCameBack(log([failing(['native-structure', [markup]])]), failing(['native-structure', [markup]])),
    null
  )
})

test('only guard checks bring the guard sentence; at most six are listed', () => {
  const words = Array.from({ length: 8 }, (_, n) => ({ page: `/p${n}/`, text: `Bar & Restaurant ${n}` }))
  const came = findingsCameBack(
    log([failing(['no-demo-words', words]), failing(['cta-real', [{ page: '/', text: 'Book' }]])]),
    failing(['no-demo-words', words])
  )
  const next = cameBackNext(/** @type {any} */ (came))
  assert.match(next, /and 2 more\./)
  assert.doesNotMatch(next, /native-structure, look-kept and css-intact/)
})
