/**
 * The seeder's own CSS keeps to the design system (ADR 0023): `sectionModule` wraps every seeded
 * Joomla section, so a raw hex or a raw size in it reaches every customer site the seeder dresses —
 * and would be the first thing `tracy_design_check` names on a page the seeder itself wrote.
 *
 *   node --test packages/cms/tracy-seeder/test/section-module-tokens.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { sectionModule } from '../src/t4-content.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
// The 56 names every vendored system declares — read from one, not retyped here.
const TOKENS = new Set(
  [
    ...readFileSync(
      path.join(here, '../../../../vendor/tracy/od-design-system/systems/apple/tokens.css'),
      'utf8'
    ).matchAll(/(--[a-z][\w-]*)\s*:/g)
  ].map((m) => m[1])
)
assert.ok(TOKENS.size >= 56, `expected the 56 token names, read ${TOKENS.size}`)

const css = (/<style>([\s\S]*?)<\/style>/.exec(sectionModule('<p>x</p>')) ?? [])[1] ?? ''
/** Sizes a token exists for must be written as that token; these carry a raw number by nature. */
const RAW_ALLOWED = new Set(['grid-template-columns', 'max-width', 'border'])

test('sectionModule writes no raw hex colour', () => {
  assert.ok(css.length > 0, 'the module has a <style> block')
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i)
})

test('every var() the module writes names one of the 56 tokens', () => {
  const names = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
  assert.ok(names.length >= 8, `expected the module to lean on tokens, found ${names.length} var()`)
  const unknown = names.filter((n) => !TOKENS.has(n))
  assert.deepEqual(unknown, [], 'a var() that is not a token falls to its fallback on every site')
})

test('a size the system has a token for is written as that token; a raw px survives only as a var() fallback', () => {
  const stripVar = (v) => v.replace(/var\((?:[^()]|\([^()]*\))*\)/g, 'var()')
  for (const block of css.split('}')) {
    const body = block.split('{')[1]
    if (!body) continue
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':')
      const value = rest.join(':').trim()
      if (!prop || value === '' || RAW_ALLOWED.has(prop.trim())) continue
      const bare = stripVar(value)
      assert.doesNotMatch(bare, /\d+px\b/, `${prop.trim()}: ${value} — a size outside a token fallback`)
      assert.doesNotMatch(bare, /#[0-9a-f]{3,8}\b/i, `${prop.trim()}: ${value}`)
    }
  }
})

test('the wrapper markup itself is unchanged: container, section, the html inside', () => {
  assert.match(
    sectionModule('<p>x</p>'),
    /<div class="container"><div class="tracy-seeded-section"><p>x<\/p><\/div><\/div>$/
  )
})
