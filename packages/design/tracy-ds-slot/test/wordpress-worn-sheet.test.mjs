// A WordPress site wears its slot as the variation's styles.css on every page, and written whole it was
// 543 KB for JA Impact under Moxie (19/10/2026): each side of a two-mode template in full, and each band
// guard (`:not(<every kept band>)`, ~470 bytes) once per selector. The worn sheet is now written as Joomla's
// module is (side-merge.mjs, nestNots); the readable sheet (`css`) is what it was. The page must not change:
// every rule, in its order, with its selectors and values, on every side of the switch.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { rulesOf } from '../src/side-merge.mjs'
import { sidesOf } from '../src/sides.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'
import { sideView, splitList, statesOf } from './side-view.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const SYSTEMS = {
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  figma: 'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
  apple: 'od:apple',
  supabase: 'od:supabase',
  mailchimp: 'refero:24929007-7e62-4c96-a940-7de65438a578'
}
const CONTRACTS = readdirSync(resolve(HERE, '../templates'))
  .filter((f) => /^wordpress-.*\.json$/.test(f))
  .map((f) => f.slice(0, -5))

/**
 * A sheet with every nested guard block written back on its selectors: `G{a&,b&::after{…}c&{…}}` is
 * `a G, b G::after{…}` and `c G{…}` as nestNots found them (`x&` is `x:is(G)`, the same elements at the same
 * specificity as `xG`). @media blocks are opened and their rules unnested in place.
 * @param {string} css
 * @returns {string[]}
 */
function unnest(css) {
  const out = []
  for (const rule of rulesOf(css)) {
    if (rule.startsWith('/*')) {
      out.push(rule)
      continue
    }
    const open = rule.indexOf('{')
    const prelude = rule.slice(0, open).trim()
    const body = rule.slice(open + 1, -1)
    if (prelude.startsWith('@')) out.push(`${prelude}{${unnest(body).join('\n')}}`)
    else if (body.includes('{'))
      for (const inner of rulesOf(body)) {
        const at = inner.indexOf('{')
        const selectors = splitList(inner.slice(0, at)).map((s) => s.split('&').join(prelude))
        out.push(`${selectors.join(',')}${inner.slice(at)}`)
      }
    else out.push(`${splitList(prelude).join(',')}{${body}}`)
  }
  return out
}

test('the worn styles.css of every WordPress contract is its readable sheet: the same rules on every side, in fewer bytes', () => {
  assert.ok(CONTRACTS.length >= 8, CONTRACTS.join(' '))
  for (const name of CONTRACTS) {
    const c = loadContract(name)
    const base = contractBase(ROOT, c)
    for (const [key, id] of Object.entries(SYSTEMS)) {
      const r = wordpressVariation(loadProfile(ROOT, id), base, c)
      assert.ok(!('refused' in r), `${name} ${key}`)
      const worn = r.variation.styles.css
      assert.match(worn, /^\/\* tracy-ds-slot: [^\n]*\n/, `${name} ${key}: the marker line first`)
      assert.ok(worn.length <= r.css.length, `${name} ${key}: never larger`)
      if (c.modes !== true) {
        // one look: the same rules, word for word, once the guards are written back
        assert.deepEqual(unnest(worn), unnest(r.css), `${name} ${key}`)
        continue
      }
      assert.match(worn, /^[^\n]*\n\/\* mode: (light|dark) \*\//, `${name} ${key}: mode line second`)
      const sides = sidesOf(c)
      const flat = unnest(worn).join('\n')
      const whole = unnest(r.css).join('\n')
      for (const state of statesOf(sides)) {
        const before = sideView(whole, sides, state)
        assert.ok(before.length > 10, `${name} ${key}: rules seen`)
        assert.deepEqual(sideView(flat, sides, state), before, `${name} ${key} ${JSON.stringify(state)}`)
      }
    }
  }
})

test('JA Impact and JA Essence WordPress wear well under half the bytes of their readable sheet', () => {
  for (const name of ['wordpress-ja-impact', 'wordpress-ja-essence']) {
    const c = loadContract(name)
    for (const id of [SYSTEMS.moxie, SYSTEMS.figma]) {
      const r = wordpressVariation(loadProfile(ROOT, id), contractBase(ROOT, c), c)
      assert.ok(!('refused' in r))
      const ratio = Buffer.byteLength(r.variation.styles.css) / Buffer.byteLength(r.css)
      assert.ok(ratio < 0.45, `${name} ${id}: ${(ratio * 100).toFixed(0)}% of the readable sheet`)
    }
  }
})
