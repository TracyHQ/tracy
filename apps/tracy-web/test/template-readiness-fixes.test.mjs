/**
 * The fix registry (`src/lib/template-readiness/fixes.js`): every code the readiness verdict can return has an entry,
 * so a red piece always says how to fix it. The codes are read from the modules that produce them, never from a hand
 * list, so a code added to a check without an entry fails here.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { main } from '../scripts/template-readiness.mjs'
import { FAULT_FAMILIES } from '../src/lib/template-readiness/demo-measures-check.js'
import { FIXES, fixOf, withFixes } from '../src/lib/template-readiness/fixes.js'

const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib')
const READINESS = path.join(LIB, 'template-readiness')

/** Every module that puts a code on the verdict: the whole readiness folder plus the two road steps and the kit flow reads. */
const SOURCES = [
  ...readdirSync(READINESS)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(READINESS, f)),
  path.join(LIB, 'content-coverage', 'road-step.js'),
  path.join(LIB, 'template-kit', 'road-step.js'),
  path.join(LIB, 'template-kit', 'flow-reads.js')
]

const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/
// `put(step, state, 'code'` (the third argument) and `code: 'code'`.
const PUT = /\bput\(\s*[^,()]+,\s*[^,]+,\s*'([a-z0-9-]+)'/g
const OBJECT = /\bcode:\s*'([a-z0-9-]+)'/g

/** @returns {Map<string, string>} each code and the first file that produces it */
function producedCodes() {
  const out = new Map()
  for (const file of SOURCES) {
    const text = readFileSync(file, 'utf8')
    for (const re of [PUT, OBJECT])
      for (const m of text.matchAll(re))
        if (CODE.test(m[1]) && !out.has(m[1])) out.set(m[1], path.basename(file))
  }
  // The demo measures name their fault family codes in a table, not at a call site.
  for (const code of Object.values(FAULT_FAMILIES))
    if (!out.has(code)) out.set(code, 'demo-measures-check.js')
  return out
}

test('the scan finds the codes of the road steps and of the checks', () => {
  const codes = producedCodes()
  for (const c of [
    'release-draft',
    'kit-gaps',
    'coverage-holes',
    'customize-must-fix',
    'ds-must-fix',
    'pin-behind-contract'
  ])
    assert.ok(codes.has(c), `${c} not found by the scan`)
  for (const c of [
    'kit-brand-unreadable',
    'cowork-pin-missing-doors',
    'demo-measure-stale',
    'kit-tool-outdated'
  ])
    assert.ok(codes.has(c), `${c} not found by the scan`)
})

test('every code the verdict can return has a fix entry', () => {
  const missing = [...producedCodes()]
    .filter(([code]) => !(code in FIXES))
    .map(([code, file]) => `${code} (${file})`)
  assert.deepEqual(missing, [], 'codes without a fix entry')
})

test('no entry names a code nothing produces', () => {
  const codes = producedCodes()
  assert.deepEqual(
    Object.keys(FIXES).filter((c) => !codes.has(c)),
    []
  )
})

test('an entry is either green with no fix, or carries a fix text', () => {
  for (const [code, e] of Object.entries(FIXES)) {
    if (e.green === true) assert.equal(e.text, undefined, `${code} is green and has a text`)
    else assert.match(e.text ?? '', /\S{3,}/, `${code} has no fix text`)
    assert.doesNotMatch(`${e.text ?? ''}${e.command ?? ''}`, /[^\x20-\x7e]/, `${code} is not ASCII`)
  }
})

test('fixOf fills the placeholders from the params, and says nothing for a green code', () => {
  const fix = fixOf('pin-behind-contract', { pinned: '1.0.0', latest: '1.0.1' })
  assert.match(fix.text, /from 1\.0\.0 to 1\.0\.1/)
  assert.equal(fixOf('release-published', {}), null)
  assert.equal(fixOf('not-a-code', {}), null)
})

test('the outdated kit tool fix settles the committed kit again, which needs no build folder and keeps its approval', () => {
  // A kit beside its contract has no capture or images to assemble from: `assemble --out <dir>` needs a build folder.
  // `samples` is the settle that stamps the current tool and moves no image (JA Diner 1.0.5, 06/11/2026: 3.0.0 to 3.1.0).
  const fix = fixOf('kit-tool-outdated', { required: '3.1.0' })
  assert.match(fix.command, /template-kit\/cli\.mjs samples --out <dir> --contract <contract folder>/)
  assert.doesNotMatch(fix.command, /assemble/)
  assert.match(fix.text, /3\.1\.0/)
})

test('the command line prints the fix under each piece that is not green, and includes it in --json', async () => {
  const run = async (args) => {
    let text = ''
    const code = await main(args, { out: (s) => (text += s), err: () => {} })
    return { code, text }
  }
  const text = await run(['ja-boxing', '--pin-only'])
  assert.match(text.text, /\n\s+fix: \S/)
  const json = JSON.parse((await run(['ja-boxing', '--pin-only', '--json'])).text)
  const red = json.pieces.filter((p) => p.state !== 'done')
  assert.ok(red.length > 0)
  for (const p of red) assert.match(p.fix?.text ?? '', /\S/, `${p.piece} has no fix in --json`)
  for (const p of json.pieces.filter((x) => x.state === 'done')) assert.equal(p.fix, undefined)
})

test('withFixes puts the registry fix on each red or warn step of a road, and nothing on the others', () => {
  const road = [
    { step: 'release', state: 'done', code: 'release-published', params: {} },
    { step: 'install-file', state: 'todo', code: 'release-draft', params: {} },
    {
      step: 'contract',
      state: 'warn',
      code: 'pin-behind-contract',
      params: { pinned: '1.0.0', latest: '1.0.1' }
    },
    { step: 'demo', state: 'todo', code: 'demo-failed', params: {} },
    { step: 'customize', state: 'blocked', code: 'customize-waiting', params: {}, blockedBy: 'contract' }
  ]
  const out = withFixes(road)
  assert.equal(out[0].fix, undefined)
  assert.deepEqual(out[1].fix, fixOf('release-draft', {}))
  assert.match(out[2].fix.text, /from 1\.0\.0 to 1\.0\.1/)
  // A code the registry does not hold yet (the steps after the verdict's) carries no fix.
  assert.equal(out[3].fix, undefined)
  assert.equal(out[4].fix, undefined)
  // The road it was handed is left as it was.
  assert.equal(road[1].fix, undefined)
  assert.equal(withFixes(null), null)
})

test('the missing lists fix runs the audit that writes the lists, on a contract of the next version', () => {
  // The lists (itemLists, itemPages, menuBlocks) are written into content-map.json only by the coverage audit's
  // --fit pass; a capture alone, or the batch capture (which skips a version whose contract exists), adds none.
  // JA Voyara 1.0.11, 06/11/2026: the batch command the registry named left the code as it was.
  const fix = fixOf('content-map-missing-lists', { missing: ['itemLists'] })
  assert.match(fix.command, /content-coverage\/cli\.mjs .*--fit/)
  assert.match(fix.command, /--write/)
  assert.doesNotMatch(fix.command, /batch-contracts/)
  assert.match(fix.text, /next quickstart version/)
})
