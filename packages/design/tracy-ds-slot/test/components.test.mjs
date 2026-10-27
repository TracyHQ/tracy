import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { componentsOf, lengthPx, resolve as resolveVar, topLevelCss } from '../src/components.mjs'
import { slotVars } from '../src/emit.mjs'
import { loadProfile } from '../src/library.mjs'
import { expected, score } from '../src/probe.mjs'
import { build } from '../scripts/od-components.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')

test('the probe respects EmDash reference capability without hiding stated-token regressions', () => {
  const apple = loadProfile(ROOT, 'od:apple')
  const adopted = expected(apple)
  const emdash = expected(apple, null, { components: false })
  assert.equal(adopted['button-primary.borderTopLeftRadius'][1], '8px')
  assert.equal(Number(adopted['button-primary.fontWeight'][1]), 500)
  assert.equal(emdash['button-primary.borderTopLeftRadius'][1], undefined)
  assert.equal(emdash['button-primary.fontWeight'][1], undefined)
  assert.deepEqual(emdash['page.backgroundColor'], adopted['page.backgroundColor'])
  assert.deepEqual(emdash['page.fontFamily'], adopted['page.fontFamily'])
  const view = { roles: { 'button-primary': { borderTopLeftRadius: '980px', fontWeight: '400' } } }
  assert.equal(score(view, adopted, 'desktop').misses.length, 2)
  assert.equal(score(view, emdash, 'desktop').misses.length, 0)
  assert.ok(
    score({ roles: { page: { backgroundColor: 'rgb(255, 0, 255)' } } }, emdash, 'desktop').misses.length
  )
  const refero = loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
  assert.deepEqual(expected(refero, null, { components: false }), expected(refero))
})

test('src/od-components.json is what every system’s reference page says now', () => {
  // compared as data: the repository's formatter lays the file out its own way
  assert.deepEqual(
    JSON.parse(readFileSync(resolve(HERE, '../src/od-components.json'), 'utf8')),
    JSON.parse(build())
  )
})

test('the reference page is read at its top level only, its tokens resolved', () => {
  const css = topLevelCss(
    '<style>/* x */ h1{font-size:var(--text-4xl)} @media (max-width:600px){h1{font-size:20px}}</style>'
  )
  assert.equal(css.trim(), 'h1{font-size:var(--text-4xl)}')
  assert.equal(resolveVar('var(--a, 3px)', {}), '3px')
  assert.equal(resolveVar('var(--a)', { '--a': 'var(--b)', '--b': '0' }), '0')
  assert.equal(lengthPx('0.75rem'), 12)
  assert.equal(lengthPx('auto'), null)
  const c = componentsOf(
    '<style>h1,h2,h3{font-family:var(--font-display)} h1{font-size:60px;font-weight:300;text-transform:uppercase} .btn{padding:14px 24px;border-radius:var(--radius-sm);font-weight:700} .eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase}</style>',
    { '--radius-sm': '0' }
  )
  assert.deepEqual(
    [c.display.size, c.display.weight, c.display.transform, c.display.face],
    [60, 300, 'uppercase', 'display']
  )
  assert.deepEqual([c.button.radius, c.button.pad, c.button.weight], [0, { y: 14, x: 24 }, 700])
  assert.equal(c.eyebrow.tracking, '.12em')
  // a button with no line height of its own takes the body's, as on the reference page
  const inherited = componentsOf(
    '<style>body{line-height:1.5} .btn{padding:8px 16px;font-size:14px}</style>',
    {}
  )
  assert.equal(inherited.button.leading, 1.5)
})

test('BMW wears its own display, buttons and eyebrow; a page-title h1 is not a display line', () => {
  const bmw = slotVars(loadProfile(ROOT, 'od:bmw'))
  assert.equal(bmw['--ds-size-display'], '60px')
  assert.equal(bmw['--ds-weight-display'], 300)
  assert.equal(bmw['--ds-transform-display'], 'uppercase')
  assert.equal(bmw['--ds-btn-radius'], '0px')
  assert.equal(bmw['--ds-btn-pad-y'], '14px')
  // with its padding, its own line: the template's tall line under BMW's padding doubled the button
  assert.equal(bmw['--ds-btn-leading'], '1.2')
  assert.equal(bmw['--ds-eyebrow-tracking'], '0.12em')
  // Spotify's reference h1 is a 24px title and its scale stops at 24px: the template keeps its display
  const spotify = loadProfile(ROOT, 'od:spotify')
  assert.equal(spotify.scale.display.s, 'empty')
  assert.equal(slotVars(spotify)['--ds-size-display'], undefined)
  // EmDash reads none of it
  assert.equal(slotVars(loadProfile(ROOT, 'od:bmw'), { components: false })['--ds-weight-display'], undefined)
})
