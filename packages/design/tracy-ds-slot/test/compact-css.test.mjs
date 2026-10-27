// A Joomla module past the 64000 bytes its column holds is written without the whitespace CSS never reads.
// JA Impact two-mode was 64.0-64.6 KB under Stripe, Nike, MiniMax, Superhuman, xAI, Coinbase and ClickHouse
// (17/10/2026), so applying one of them failed on the site ("the module is ... bytes").
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { compactCss } from '../src/compact-css.mjs'
import { joomlaSlot, MODULE_MAX_BYTES } from '../src/joomla.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { gate } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

test('compactCss drops whitespace only next to { } ; , and keeps every other space, string and comment', () => {
  // the space around a comment stays: between two selectors it is a descendant combinator
  const css = `/* tracy-ds-slot: refero:x */\n/* mode: dark */\n.a  .b ,\n .c > .d {\n  color: red ;\n  width: calc(100% - 2px);\n  font-family: "Segoe UI", serif;\n  content: "a , b  { }";\n}\n\n:is(.e, .f) :not(.g) { margin: 0 auto; }\n`
  assert.equal(
    compactCss(css),
    `/* tracy-ds-slot: refero:x */ /* mode: dark */ .a .b,.c > .d{color: red;width: calc(100% - 2px);font-family: "Segoe UI",serif;content: "a , b  { }";}:is(.e,.f) :not(.g){margin: 0 auto;}`
  )
  // an escaped quote stays inside its string
  assert.equal(compactCss(`a::before { content: "x\\" ,  y" ; }`), `a::before{content: "x\\" ,  y";}`)
  // idempotent
  assert.equal(compactCss(compactCss(css)), compactCss(css))
})

test('JA Impact fits its module under every system of the library, and a module that fits keeps its bytes', () => {
  const contract = loadContract('joomla-ja-impact')
  const base = contractBase(ROOT, contract)
  const outsideStrings = (s) => s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\*[\s\S]*?\*\//g, '')
  let worst = 0
  let compacted = 0
  for (const [kind, dir] of [
    ['refero', join(ROOT, 'vendor/tracy/refero/systems')],
    ['od', join(ROOT, 'vendor/tracy/od-design-system/systems')]
  ]) {
    for (const key of readdirSync(dir).sort()) {
      let profile
      try {
        profile = loadProfile(ROOT, `${kind}:${key}`)
      } catch {
        continue
      }
      if (!gate(profile).ok) continue
      const { html } = joomlaSlot(profile, base, contract)
      const bytes = new TextEncoder().encode(html).length
      worst = Math.max(worst, bytes)
      // a compacted module has no line breaks outside its strings and comments; one that fits keeps them
      if (!/\n/.test(outsideStrings(html))) compacted++
    }
  }
  assert.ok(worst <= MODULE_MAX_BYTES, `largest module ${worst} bytes`)
  assert.ok(compacted > 0 && compacted < 50, `${compacted} modules compacted`)
})
