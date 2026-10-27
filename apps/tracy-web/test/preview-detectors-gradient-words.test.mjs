/**
 * gradient-stop judges the words a gradient ground carries (15/10/2026). JA Kinetic Joomla's tags
 * masthead under Moxie's dark side, found by eye: its title and lead turned light on the template's
 * #f2f5ee wash and no detector fired, because a text on a gradient has no flat ground for CON-2.
 * Fixtures are real probe data from preview-check.mjs PREVIEW_DATA=1, before and after the fix.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { detect } from '../scripts/preview-detectors/gradient-stop.mjs'

const G = JSON.parse(
  readFileSync(
    new URL('./fixtures/preview-detectors/gradient-stop-masthead-words.json', import.meta.url),
    'utf8'
  )
)
const run = (/** @type {any} */ s) => detect({ worn: s.worn, plain: s.plain, systemColours: s.systemColours })

test("the tags masthead before the fix: its words under the CON floor on the wash, the system's doing", () => {
  for (const s of G.broken) {
    const r = run(s)
    assert.equal(r.count, 1, s.source)
    const f = r.findings[0]
    assert.equal(f.by, 'system')
    const title = f.words.find((/** @type {any} */ w) => /h1/.test(w.at))
    assert.ok(title, 'the page title is named')
    assert.equal(title.stop, '#f2f5ee')
    assert.ok(title.ratio < 3)
  }
})

test('the words branch fires on its own: no page ground to compare the wash with', () => {
  for (const s of G.broken) {
    const worn = { ...s.worn, base: { ...s.worn.base, page: null, said: {} } }
    const r = detect({ worn, plain: s.plain, systemColours: s.systemColours })
    assert.equal(r.count, 1)
    assert.deepEqual(r.findings[0].template, [])
    assert.ok(r.findings[0].words.length >= 1)
  }
})

test('the tags masthead after the fix: nothing', () => {
  for (const s of G.clean) assert.equal(run(s).count, 0, s.source)
})

test("a text the template itself had under the floor on a stop is not the system's", () => {
  for (const s of G.broken) {
    const plain = structuredClone(s.plain)
    for (const g of plain.data) for (const x of g.texts) x.fg = { r: 240, g: 240, b: 240, a: 1 }
    const worn = { ...s.worn, base: { ...s.worn.base, page: null, said: {} } }
    assert.equal(detect({ worn, plain, systemColours: s.systemColours }).count, 0)
  }
})
