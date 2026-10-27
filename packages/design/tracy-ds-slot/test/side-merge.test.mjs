// A two-mode Joomla module writes a rule both sides write alike once (side-merge.mjs): JA Vital with both modes
// and its bands was 88-116 KB, over the 64000 bytes Joomla stores (16/10/2026). The page must not change: on
// every side of the switch the rules that apply, in their order, with their values, are the ones the two whole
// sides gave before.
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { joomlaSlot, MODULE_MAX_BYTES, nestNots } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { mergeSides } from '../src/side-merge.mjs'
import { sidesOf } from '../src/sides.mjs'
import { sideView, statesOf } from './side-view.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = {
  moxie: 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  apple: 'od:apple',
  supabase: 'od:supabase',
  runwayml: 'od:runwayml',
  ollama: 'od:ollama',
  mailchimp: 'refero:24929007-7e62-4c96-a940-7de65438a578'
}
// JA Vital wears both modes for MODE-3 and keeps its bands (manager's decision, 16/10/2026)
const vitalModes = () => ({
  ...loadContract('joomla-ja-vital'),
  modes: true,
  modeHook: ':has(> body.dark-active)',
  modesAuto: false
})

test('mergeSides: a rule alike on both sides is written once, a colour-only difference reads a variable, order kept', () => {
  const sides = { light: ':where(.L)', dark: ':where(.D)' }
  const light = '.a{color:#fff!important;margin:0}\n.b{color:red}\n.c{padding:1px}\n.e{color:#fff}'
  const dark = '.a{color:#000!important;margin:0}\n.c{padding:1px}\n.d{color:#000}\n.e{color:#000}'
  assert.equal(
    mergeSides(light, dark, sides),
    [
      ':root:where(.L){--dsv-0:#fff}',
      ':root:where(.D){--dsv-0:#000}',
      ':root .a{color:var(--dsv-0)!important;margin:0}',
      ':root:where(.L) .b{color:red}',
      ':root .c{padding:1px}',
      ':root:where(.D) .d{color:#000}',
      ':root .e{color:var(--dsv-0)}'
    ].join('\n')
  )
  // a rule that sets custom properties (a role block) keeps its side, whatever it holds
  const roles = mergeSides(':root{--ds-c-bg:#fff}', ':root{--ds-c-bg:#000}', sides)
  assert.equal(roles, ':root:where(.L){--ds-c-bg:#fff}\n:root:where(.D){--ds-c-bg:#000}')
  // a value that is not one colour literal (a var(), a keyword, two colours) is never moved into a variable
  for (const v of ['var(--ds-c-fg)', 'inherit', '#fff #000', 'currentColor'])
    assert.doesNotMatch(mergeSides(`.x{color:${v}}`, '.x{color:#123456}', sides), /--dsv-/, v)
})

test('a two-mode Joomla module is the same page on every side of the switch: JA Kinetic, Tracy Business, Tracy Base, JA Podcast, JA Vital', () => {
  const contracts = {
    'joomla-ja-kinetic': loadContract('joomla-ja-kinetic'),
    'joomla-tracy-business': loadContract('joomla-tracy-business'),
    'joomla-tracy-base': loadContract('joomla-tracy-base'),
    'joomla-ja-podcast-modes': loadContract('joomla-ja-podcast-modes'),
    'joomla-ja-vital (modes)': vitalModes()
  }
  for (const [name, c] of Object.entries(contracts)) {
    assert.equal(c.modes, true, `${name} has two modes`)
    const sides = sidesOf(c)
    for (const [key, id] of Object.entries(SYSTEMS)) {
      const r = joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, c), c)
      assert.ok(!('refused' in r), `${name} ${key}`)
      // the module carries the merged sheet, its band guards nested as before
      assert.ok(r.html.includes(nestNots(r.sheet)), `${name} ${key}: the module is the merged sheet`)
      assert.ok(r.sheet.length < r.css.length, `${name} ${key}: merging saves bytes`)
      assert.match(
        r.sheet,
        /^\/\* tracy-ds-slot: [^\n]*\n\/\* mode: (light|dark) \*\//,
        `${name} ${key}: mode line first`
      )
      for (const state of statesOf(sides)) {
        const before = sideView(r.css, sides, state)
        const after = sideView(r.sheet, sides, state)
        assert.ok(before.length > 10, `${name} ${key}: rules seen`)
        assert.deepEqual(after, before, `${name} ${key} ${JSON.stringify(state)}`)
      }
    }
  }
})

test('JA Vital with both modes and its bands fits a Joomla module under every OpenDesign system and a Refero sample', () => {
  const c = vitalModes()
  assert.ok(Object.keys(c.bands ?? {}).length > 0, 'the contract keeps its bands')
  const ids = [
    ...readdirSync(resolve(ROOT, 'vendor/tracy/od-design-system/systems')).map((k) => `od:${k}`),
    ...readdirSync(resolve(ROOT, 'vendor/tracy/refero/systems'))
      .filter((_, i) => i % 25 === 0)
      .map((k) => `refero:${k}`)
  ]
  let worst = 0
  let seen = 0
  for (const id of ids) {
    let profile
    try {
      profile = loadProfile(ROOT, id)
    } catch {
      continue
    }
    const r = joomlaSlot(profile, contractBase(ROOT, c), c)
    if ('refused' in r) continue
    seen++
    worst = Math.max(worst, Buffer.byteLength(r.html))
  }
  assert.ok(seen > 100, `systems measured: ${seen}`)
  assert.ok(worst <= MODULE_MAX_BYTES, `largest module ${worst} bytes`)
})
