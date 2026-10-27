/**
 * `designProblem` — the pure half of the contracts gate's design rule, tested away from the trees.
 *
 *   node --test scripts/test/check-contract-design.test.mjs
 *
 * The subject: since 29/09/2026 a profile's `<version>.design.json` (beside its sealed directory) is the ONE place that names
 * the design system its quickstart wears (`design: {id, source:'catalog'} | null`). tracy-web reads
 * it into every template card and the build writes it into the site folder, so a half-written
 * value there (a bare string, an id the catalogue cannot spell, a missing key) reaches a customer's
 * site as "wears none" with nothing red on the way. This is where it goes red instead.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { designProblem } from '../lib/contract-design.mjs'

const ids = new Set(['apple', 'airbnb', 'ja-kinetic'])

test('a design the catalogue lists, or an explicit null, is clean', () => {
  assert.equal(designProblem({ design: { id: 'apple', source: 'catalog' } }, ids), null)
  assert.equal(designProblem({ design: null }, ids), null)
})

test('a missing file, or a file without the key, is a problem — "wears none" must be said, not implied', () => {
  assert.match(designProblem(undefined, ids), /design\.json/)
  assert.match(designProblem({ schemaVersion: 'tracy-contract-design/v1' }, ids), /design/)
})

test('a value of another shape is a problem that names what is wrong', () => {
  assert.match(designProblem({ design: 'apple' }, ids), /apple/)
  assert.match(designProblem({ design: { id: 'apple' } }, ids), /source/)
  assert.match(designProblem({ design: { id: 'apple', source: 'brand' } }, ids), /source/)
  assert.match(designProblem({ design: { id: 'stripe', source: 'catalog' } }, ids), /stripe/)
  assert.match(designProblem({ design: { id: 'Apple Inc', source: 'catalog' } }, ids), /Apple Inc/)
})

// ── source "quickstart": a quickstart that wears its OWN look, not one of the catalogue's ─────────
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { quickstartTokens } from '../lib/contract-design.mjs'

const NAMES = ['--bg', '--accent', '--font-body']
const TOKEN_CSS = `/* a quickstart's own sheet */
:root {
  --tb-paper: #F5F3EE;
  --tb-forest: #14483A;
  --bg: var(--tb-paper);
  --accent: var(--tb-forest, #000);
  --font-body: Archivo, system-ui, sans-serif;
  --unused: 1px;
}`

function tokenFile(css = TOKEN_CSS) {
  const root = mkdtempSync(path.join(tmpdir(), 'qs-design-'))
  writeFileSync(path.join(root, 'tokens.css'), css)
  return root
}

test('quickstartTokens resolves var() inside the file and keeps only the named tokens', () => {
  const root = tokenFile()
  assert.deepEqual(quickstartTokens(path.join(root, 'tokens.css'), NAMES), {
    '--bg': '#F5F3EE',
    '--accent': '#14483A',
    '--font-body': 'Archivo, system-ui, sans-serif'
  })
})

test('quickstartTokens uses a var() fallback when the name is not declared, and throws on a missing name or a cycle', () => {
  const root = tokenFile(':root { --bg: var(--nope, #fff); --accent: #111; --font-body: x; }')
  assert.equal(quickstartTokens(path.join(root, 'tokens.css'), NAMES)['--bg'], '#fff')
  const missing = tokenFile(':root { --bg: #fff; --accent: #111; }')
  assert.throws(() => quickstartTokens(path.join(missing, 'tokens.css'), NAMES), /--font-body/)
  const cycle = tokenFile(':root { --bg: var(--accent); --accent: var(--bg); --font-body: x; }')
  assert.throws(() => quickstartTokens(path.join(cycle, 'tokens.css'), NAMES), /--bg|--accent/)
})

test('a quickstart design names its own quickstart, a real token file, and the resolved tokens of that file', () => {
  const root = tokenFile()
  const ctx = { root, release: 'tracy-business/j6', names: NAMES }
  const good = {
    design: { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business', tokensFrom: 'tokens.css' },
    tokens: quickstartTokens(path.join(root, 'tokens.css'), NAMES)
  }
  assert.equal(designProblem(good, ids, ctx), null)
  assert.match(
    designProblem({ ...good, design: { ...good.design, id: 'apple' } }, ids, ctx),
    /tracy-business/
  )
  assert.match(
    designProblem({ ...good, design: { ...good.design, tokensFrom: 'nope.css' } }, ids, ctx),
    /nope\.css/
  )
  assert.match(designProblem({ ...good, tokens: { ...good.tokens, '--bg': '#000' } }, ids, ctx), /--bg/)
  assert.match(designProblem({ ...good, design: { ...good.design, name: '' } }, ids, ctx), /name/)
})
