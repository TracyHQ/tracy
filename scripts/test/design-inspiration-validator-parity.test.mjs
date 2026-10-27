/**
 * The two copies of `validateDesignInspiration` answer the same for the same card.
 *
 *   node --test scripts/test/design-inspiration-validator-parity.test.mjs
 *
 * One lives in tracy-web (it judges a card read off a release), the other in build-core (the CLI
 * `scripts/tracy-setting.mjs` judges a card before WRITING it to a release). They drifted once
 * without anything red (found 29/09/2026: the CLI copy still checked the retired `vi` flag and did
 * not check a layout's `address`), so a card the CLI accepted could be dropped by tracy-web on read.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validateDesignInspiration as ofWeb } from '../../apps/tracy-web/src/lib/tracy-setting.mjs'
import { validateDesignInspiration as ofCore } from '../../packages/site/tracy-site-build-core/src/tracy-setting.mjs'

const card = (over = {}) => ({
  schemaVersion: 'tracy-design-inspiration/v1',
  template: 'tracy-business',
  provider: 'JoomlArt',
  category: 'Professional & Corporate',
  blurb: 'B2B site.',
  image: 'business-home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'business-home-1440.png' } }],
  ...over
})

const cases = {
  valid: card(),
  'wrong schema': card({ schemaVersion: 'tracy-design-inspiration/v2' }),
  'bad provider': card({ provider: 'Acme' }),
  'demo refused': card({ demo: 'https://x' }),
  'dark not boolean': card({ dark: 'yes' }),
  'retired vi flag is ignored': card({ vi: 'yes' }),
  'no layouts': card({ layouts: [] }),
  'address not a path': card({
    layouts: [{ key: 'about', label: 'About', path: '/about', address: 'about', shots: { desktop: 'a.png' } }]
  }),
  'address is a path': card({
    layouts: [
      {
        key: 'about',
        label: 'About',
        path: '/about',
        address: '/index.php/about',
        shots: { desktop: 'a.png' }
      }
    ]
  }),
  'unknown field ignored': card({ someday: 1 })
}

// What the answer MUST be, written down independently of both copies: agreeing with each other is
// not enough when both drift the same way. `null` = accepted (no problem); a pattern = exactly one
// problem, naming that field.
/** @type {Record<keyof typeof cases, RegExp | null>} */
const expected = {
  valid: null,
  'wrong schema': /^schemaVersion must be tracy-design-inspiration\/v1/,
  'bad provider': /^provider must be one of/,
  'demo refused': /^demo is the server's/,
  'dark not boolean': /^dark must be true or false$/,
  'retired vi flag is ignored': null,
  'no layouts': /^layouts must list at least one layout/,
  'address not a path': /^layouts\[0\]\.address must be/,
  'address is a path': null,
  'unknown field ignored': null
}

test('every case has a written expectation', () => {
  assert.deepEqual(Object.keys(expected).sort(), Object.keys(cases).sort())
})

for (const [name, doc] of Object.entries(cases))
  test(`both validators agree, and are right: ${name}`, () => {
    const core = ofCore(structuredClone(doc))
    assert.deepEqual(core, ofWeb(structuredClone(doc)))
    const want = expected[/** @type {keyof typeof cases} */ (name)]
    if (want === null) assert.deepEqual(core, [])
    else {
      assert.equal(core.length, 1, JSON.stringify(core))
      assert.match(core[0], want)
    }
  })
