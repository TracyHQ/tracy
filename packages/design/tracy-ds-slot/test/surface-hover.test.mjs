// The neutral hover ground `--ds-c-surface-hover` (20/10/2026): a code review of JA Restaurant found its
// grey buttons and rows mapped to the surface role at rest AND on :hover on its dark variants, so under a
// system the pointer changed nothing. The role is optional (role-variables.mjs), filled by the tokenizer
// from a contract's palette, known to followRules, and given by the role scanner to a grey a :hover rule
// paints or a ground variable named for its hover.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followRules } from '../src/joomla.mjs'
import { colourRoleOfName } from '../src/role-scan/hints.mjs'
import { genericRole } from '../src/role-scan/palette.mjs'
import { roleVariable } from '../src/role-variables.mjs'
import { tokenizeCss } from '../src/tokenize.mjs'

test('surface-hover is an optional colour role, both sides', () => {
  const r = roleVariable('--ds-c-surface-hover')
  assert.equal(r?.kind, 'color')
  assert.equal(r?.required, false)
  assert.deepEqual([...(r?.schemes ?? [])], ['light', 'dark'])
})

test('the tokenizer fills surface-hover from a palette that names it; a hex the surface holds stays the surface', () => {
  const palette = { bg: '#ffffff', surface: '#f2f2f2', 'surface-hover': '#e4e4e4', fg: '#222222' }
  const r = tokenizeCss('.row{background:#f2f2f2}.row:hover{background:#e4e4e4}', palette)
  assert.equal(
    r.css,
    '.row{background:var(--ds-c-surface, #f2f2f2)}.row:hover{background:var(--ds-c-surface-hover, #e4e4e4)}'
  )
  // a palette without the role tokenizes as it always did
  const before = tokenizeCss('.row:hover{background:#f2f2f2}', { bg: '#ffffff', surface: '#f2f2f2' })
  assert.equal(before.css, '.row:hover{background:var(--ds-c-surface, #f2f2f2)}')
})

test('followRules may paint a hover with surface-hover', () => {
  const rules = followRules({
    followRules: { '.btn-default:hover': { 'background-color': 'surface-hover' } }
  })
  assert.deepEqual(rules, [['.btn-default:hover', { 'background-color': 'var(--ds-c-surface-hover)' }]])
})

test('the role scanner gives a grey :hover ground and a hover ground variable the hover role', () => {
  const grounds = { light: '#ffffff', dark: '#111111' }
  assert.equal(
    genericRole({ hex: '#eeeeee', kind: 'fill', selector: '.btn-default:hover', scheme: 'light' }, grounds),
    '--ds-c-surface-hover'
  )
  // its rest state keeps the ground it had
  assert.match(
    genericRole({ hex: '#eeeeee', kind: 'fill', selector: '.btn-default', scheme: 'light' }, grounds) ?? '',
    /^--ds-c-surface(-warm)?$/
  )
  assert.equal(
    genericRole({ hex: '#222222', kind: 'fill', selector: '.row:hover', scheme: 'dark' }, grounds),
    '--ds-c-surface-hover'
  )
  assert.equal(colourRoleOfName('--t4-card-hover-bg', 0.9), '--ds-c-surface-hover')
  assert.equal(colourRoleOfName('--t4-card-bg', 0.9), '--ds-c-surface')
  // an accent hover stays the accent's
  assert.equal(colourRoleOfName('--t4-primary-bg-hover', 0.3), '--ds-c-accent-hover')
})
