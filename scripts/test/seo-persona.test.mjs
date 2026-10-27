// The SEO/GEO persona: measure a page before PROPOSING anything for it — and not before an edit the
// customer already spelled out (fix A of perf/round7, 30/09/2026).
//
// WHY A TEST AND NOT ONLY THE `presets` GATE. That gate compares the generated presets with the matrix, so
// it stays green whatever the matrix SAYS: the sentence deleted from `personas["seo-geo"]` regenerates
// cleanly and three presets go back to measuring a page before changing a heading they were handed word
// for word. The round-7 bench ran the same wording edit in every mode on every platform: Designer,
// Developer and Writer went straight to `content.replace` in 9 of 9 runs; SEO/GEO did in 2 of 3 — and its
// own reasoning in one of the two shows why it nearly did not ("the instruction says measure the page
// before proposing? That's for SEO work. This is a simple word change"); the third described the site,
// read the page's outline, the page map and the article list, and inspected the contract before its one
// write (6 LLM calls against 2). Only this persona says "measure … first"; the Writer's says "Putting in wording the customer
// has already given you is not writing: make the change and stop", and this is that sentence's twin.
//
// The job itself must survive: measuring one page before choosing or proposing wording stays.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { parsePatch } from '../check-image-profile.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** @type {{ personas: Record<string, string> }} */
const matrix = JSON.parse(readFileSync(join(ROOT, 'config/mode-matrix.json'), 'utf8'))

/** The two bundles that carry the twelve rows; profiles load one of them each. */
const PRESET_FILES = [
  'packages/bundle/tracy-cowork/presets.patch.yml',
  'packages/bundle/tracy-native/presets.patch.yml'
]

const MEASURE =
  'Measure the page you are about to change — its title, description, headings and links — before proposing anything for it; that one page, not a sweep of the site.'
const GIVEN =
  'Wording the customer has already given you is not a proposal: make that change first, with no measuring before it.'

/**
 * Every preset row of a bundle: its id and the prefix of its `dsh-persona` plugin, which is the first
 * text of a session's system prompt (identity, then the role's persona, then the platform's).
 * @param {string} file
 * @returns {Map<string, string>}
 */
function personasOf(file) {
  const { rows, problems } = parsePatch(readFileSync(join(ROOT, file), 'utf8'), file)
  assert.deepEqual(problems, [])
  /** @type {Map<string, string>} */
  const out = new Map()
  for (const row of rows) {
    const insert = /** @type {any} */ (row).insert
    if (!Array.isArray(insert)) continue
    for (const entry of insert) {
      if (entry?.name !== '@deepseek-ai/dsh-agent-preset') continue
      const persona = (entry.config.plugins ?? []).find((/** @type {any} */ p) => p.id === 'persona')
      assert.equal(typeof persona?.config?.prefix, 'string', `${file}: ${entry.config.id} has no persona`)
      out.set(entry.config.id, persona.config.prefix)
    }
  }
  return out
}

test('the SEO/GEO persona keeps its job — measure one page before proposing — and says wording the customer gave is changed first', () => {
  const persona = matrix.personas['seo-geo']
  assert.ok(persona.includes(MEASURE), 'measuring the page before proposing for it stays')
  assert.ok(persona.includes(GIVEN), 'wording already given is not a proposal')
  // It reads as a qualification of the measuring, not a second rule far from it, and the rest is intact.
  assert.ok(persona.indexOf(MEASURE) < persona.indexOf(GIVEN))
  assert.match(persona, /The site context says where each lives on this site and how to read a page's head\./)
  assert.match(persona, /Never stuff keywords/)
  assert.match(persona, /survive being lifted out of the page\.$/)
  // Every-step text of one mode: the addition stays one short sentence.
  assert.ok(GIVEN.length <= 120, String(GIVEN.length))
})

test('all three SEO/GEO presets of both bundles carry it, no other mode does, and the two bundles agree', () => {
  /** @type {Map<string, string>[]} */
  const both = PRESET_FILES.map(personasOf)
  for (const [i, presets] of both.entries()) {
    const file = PRESET_FILES[i]
    const seo = [...presets.keys()].filter((id) => id.startsWith('seo-geo-'))
    assert.deepEqual(seo.sort(), ['seo-geo-emdash', 'seo-geo-joomla', 'seo-geo-wordpress'], file)
    for (const [id, prefix] of presets) {
      if (id.startsWith('seo-geo-')) {
        assert.ok(prefix.includes(GIVEN), `${file}: ${id} is told wording it was given is changed first`)
        assert.ok(prefix.includes(MEASURE), `${file}: ${id} keeps measuring before proposing`)
      } else assert.ok(!prefix.includes(GIVEN), `${file}: ${id} is not the SEO/GEO mode`)
    }
  }
  assert.deepEqual(
    [...both[0]],
    [...both[1]],
    'the two bundles are byte-identical, as the matrix generates them'
  )
})
