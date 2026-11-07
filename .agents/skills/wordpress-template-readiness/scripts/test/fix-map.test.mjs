/**
 * The WordPress fix map (`references/fix-map.md`) covers every code the readiness verdict can return. The code list is
 * the fix registry (`fixes.js`): `apps/tracy-web/test/template-readiness-fixes.test.mjs` already holds it equal to the
 * codes the check modules produce, so a code added to a check fails there until it has an entry, and here until the
 * WordPress skill says how it is fixed on WordPress (or that it stops, or never happens).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { FIXES } from '../../../../../apps/tracy-web/src/lib/template-readiness/fixes.js'

const MAP = new URL('../../references/fix-map.md', import.meta.url)
const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/

/** The codes the map names in the first cell of a table row of its "Every code" section. */
export function mappedCodes(markdown) {
  const section = markdown.split(/^## Every code$/m)[1] ?? ''
  const out = new Set()
  for (const line of section.split('\n')) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue
    const first = line.split('|')[1] ?? ''
    for (const m of first.matchAll(/`([^`]+)`/g)) if (CODE.test(m[1])) out.add(m[1])
  }
  return out
}

test('every code of the fix registry has a row in the WordPress fix map', () => {
  const mapped = mappedCodes(readFileSync(MAP, 'utf8'))
  assert.deepEqual(
    Object.keys(FIXES).filter((c) => !mapped.has(c)),
    [],
    'codes without a WordPress fix map row'
  )
})

test('the WordPress fix map names no code the registry does not hold', () => {
  const mapped = mappedCodes(readFileSync(MAP, 'utf8'))
  assert.deepEqual(
    [...mapped].filter((c) => !(c in FIXES)),
    []
  )
})

test('the reader finds codes in the first cell only', () => {
  const md = [
    '## Stops',
    '| W1 | `kit-missing` |',
    '## Every code',
    '| Code | On WordPress |',
    '|---|---|',
    '| `kit-missing`, `kit-stale` | rebuild, see `kit-invalid` |'
  ].join('\n')
  assert.deepEqual([...mappedCodes(md)], ['kit-missing', 'kit-stale'])
})
