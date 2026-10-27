// The six role-scan defects found in the design-system review of Tracy Base, Business and SaaS
// EmDash (15/10/2026), each pinned on the fixture `REVIEW`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanTemplate } from '../src/role-scan/index.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'
import { REVIEW } from './role-scan-review-fixtures.mjs'

const scan = scanTemplate(writeFixture(REVIEW))
const at = (file, line, text) => {
  const f = scan.findings.find(
    (x) => x.file === file && x.line === line && (text === undefined || x.text === text)
  )
  assert.ok(f, `no finding ${file}:${line} ${text ?? ''}`)
  return `${f.class} ${f.role ?? ''}`.trim()
}
const missing = (file) =>
  scan.findings.filter((f) => f.class === 'missing' && f.file === file).map((f) => `${f.line} ${f.role}`)

test('defect 1: a call-to-action band, inline block or card is a card corner, its button a button', () => {
  assert.equal(at('src/components/sections/CtaBand.astro', 2), 'auto --ds-card-radius')
  assert.equal(at('src/components/sections/CtaBand.astro', 3), 'auto --ds-btn-radius', 'the .btn inside')
  assert.equal(at('src/components/sections/InlineCta.astro', 1), 'auto --ds-card-radius')
  assert.equal(at('src/components/sections/Cta.astro', 3), 'auto --ds-card-radius', '.cta--card .cta-inner')
  assert.equal(at('src/components/sections/Cta.astro', 4), 'auto --ds-btn-radius', '.cta-button')
})

test('defect 2: an <input> whose attributes run over several lines reads the field corner', () => {
  assert.equal(at('src/components/islands/MegaMenu.tsx', 7), 'auto --ds-input-radius')
  assert.equal(at('src/components/islands/MegaMenu.tsx', 9), 'auto --ds-card-radius', 'a span of the menu')
})

test('defect 3: a class whose element carries another class that sets the corner is not missing', () => {
  assert.deepEqual(missing('src/components/Teams.astro'), ['10 --ds-pill-radius'], 'only .badge')
})

test('defect 4: a ds-keep right before a multi-line rule keeps its missing corner', () => {
  assert.match(at('src/components/Teams.astro', 8), /^keep/)
})

test('defect 5: a full-bleed scrim button (inset 0) draws no button face: not missing', () => {
  assert.deepEqual(missing('src/views/Search.astro'), ['3 --ds-btn-radius'], 'only the real button')
})

test('defect 6: a dark panel family reads ink / on-ink; a highlight mark is not a field', () => {
  assert.equal(at('src/styles/tokens.css', 5), 'auto --ds-c-ink', '--k-panel')
  assert.equal(at('src/styles/tokens.css', 6), 'auto --ds-c-on-ink', '--k-panel-text')
  assert.equal(at('src/styles/tokens.css', 7), 'flag', '--k-panel-accent: no role for an accent on ink')
  assert.match(at('src/views/Search.astro', 4), /^keep/, '[&_mark]:rounded')
  assert.match(at('src/views/Search.astro', 8), /^keep/, 'mark { border-radius }')
})
