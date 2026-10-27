// The lessons catalog as data: schema, pointers that resolve, size, source coverage, and the
// documents that tell an agent when to scan. The detectors themselves: lessons.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DETECTORS,
  RECORD_MAX_BYTES,
  RECORD_TARGET_BYTES,
  SOURCES_FILE,
  CatalogError,
  kindOf,
  loadCatalog,
  parseCatalog,
  pointerProblems,
  snapshotProblems,
  sourceProblems
} from '../lib/lessons.mjs'
import { measure } from '../check-docs-numbers.mjs'
import { STAGES } from '../visual/contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL = path.join(HERE, '..', '..')
const read = (rel) => fs.readFileSync(path.join(SKILL, rel), 'utf8')
const CATALOG = loadCatalog()
const LINES = read('references/lessons.jsonl').trimEnd().split('\n')
const SOURCES = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'))
const GOTCHAS = measure(SKILL).gotchas
const CASES = JSON.parse(read('scripts/test/fixtures/lessons/cases.json'))

test('catalog: every record parses, ids run ascending and unique, every when is a detector or "always"', () => {
  assert.equal(CATALOG.length, LINES.length)
  const ids = CATALOG.map((r) => r.id)
  assert.deepEqual(ids, [...new Set(ids)].sort())
  for (const r of CATALOG) if (r.when && r.when !== 'always') assert.ok(DETECTORS[r.when], `${r.id} ${r.when}`)
})

test('catalog: L-001…L-0NN are the gotchas, one for one, each ref naming its gotcha', () => {
  for (let n = 1; n <= GOTCHAS; n++) {
    const r = CATALOG.find((x) => x.id === `L-${String(n).padStart(3, '0')}`)
    assert.ok(r, `a lesson for gotcha ${n}`)
    assert.ok(r.ref.split(' ').includes(`g${n}`), `${r.id} refs g${n}`)
  }
})

test('catalog: every fix and test pointer resolves — the file exists and holds the symbol or test text', () => {
  assert.deepEqual(pointerProblems(CATALOG, SKILL), [])
  for (const r of CATALOG.filter((x) => x.status === 'fixed-in-code')) assert.ok(r.test && !r.fix.startsWith('$ '), `${r.id} names code and a test`)
  const broken = [
    { id: 'L-900', fix: 'no-such-file#x', ref: 'g1' },
    { id: 'L-901', fix: 'seed#noSuchSymbolAnywhere', ref: 'g1' },
    { id: 'L-902', fix: '$ a rule', test: 'seed~no such test title anywhere', ref: 'g1' },
    { id: 'L-903', fix: '$ a rule', test: 'no-such~x', ref: 'g1' }
  ]
  assert.deepEqual(pointerProblems(broken, SKILL), [
    'L-900 fix: scripts/no-such-file.mjs does not exist',
    'L-901 fix: "noSuchSymbolAnywhere" is not in scripts/seed.mjs',
    'L-902 test: "no such test title anywhere" is not in scripts/test/seed.test.mjs',
    'L-903 test: scripts/test/no-such.test.mjs does not exist'
  ])
})

test('catalog: records aim at 200 bytes; the ones over it are exactly the list lessons.md names, none over the cap', () => {
  const over = []
  LINES.forEach((l, i) => {
    const bytes = Buffer.byteLength(l)
    assert.ok(bytes <= RECORD_MAX_BYTES, `${CATALOG[i].id}: ${bytes} bytes`)
    if (bytes > RECORD_TARGET_BYTES) over.push(CATALOG[i].id)
  })
  const doc = /Records over 200 bytes \(each through its fix\/test pointer\): ([^.]+)\./.exec(read('references/lessons.md').replace(/\s+/g, ' '))
  assert.ok(doc, 'lessons.md names the records over 200 bytes')
  assert.deepEqual(over, doc[1].split(', '))
  for (const r of CATALOG) assert.ok(r.sym.length <= 100 && !/\n/.test(r.sym), r.id)
})

test('catalog: every detector is used by a lesson and has a positive and a negative fixture case', () => {
  const used = new Set(CATALOG.map((r) => r.when))
  for (const id of Object.keys(DETECTORS)) {
    assert.ok(used.has(id), `${id} is used`)
    assert.ok(CASES[id]?.positive && CASES[id]?.negative, `${id} has both cases`)
    assert.ok(['na', 'resolved'].includes(CASES[id].negative.expect), `${id} negative expects na or resolved`)
  }
  assert.deepEqual(Object.keys(CASES).sort(), Object.keys(DETECTORS).sort(), 'no case for a detector that does not exist')
})

test('catalog: guidance is only for process rules, open defects keep a detector, fixed ones are never scanned', () => {
  const kinds = Object.groupBy(CATALOG, kindOf)
  assert.ok(kinds.guidance.length <= 12, `guidance stays short (${kinds.guidance.length})`)
  for (const r of kinds.guidance) assert.ok(r.fix.startsWith('$ '), `${r.id}: a rule, not a code pointer`)
  for (const r of kinds.open ?? []) assert.ok(DETECTORS[r.when], r.id)
  for (const r of kinds.fixed) assert.equal(r.when, undefined, r.id)
  // A trap only a running page shows names the script that checks it; the scan never loads a page.
  assert.deepEqual(kinds.tool.map((r) => r.id), ['L-007', 'L-012'])
  for (const r of kinds.tool) assert.ok(r.test && r.when === undefined && r.status === undefined, r.id)
})

test('sources: the inventory covers every gotcha, issue item and PR, each mapping named in the lesson it points at', () => {
  assert.deepEqual(sourceProblems(SOURCES, CATALOG, GOTCHAS), [])
  assert.equal(SOURCES.complete, true)
})

test('sources: the inventory is the issue and PR snapshot it cites — hashes, numbers and closing PRs', (t) => {
  const files = Object.fromEntries(['issues', 'prs'].map((k) => [k, path.join(homedir(), SOURCES.evidence[k].file.slice(2))]))
  if (!Object.values(files).every((f) => fs.existsSync(f))) return t.skip(`the snapshot is not on this machine: ${Object.values(files).join(', ')}`)
  const snap = {}
  for (const [k, f] of Object.entries(files)) {
    const bytes = fs.readFileSync(f)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SOURCES.evidence[k].sha256, `${f} is the file the inventory was read from`)
    snap[k] = JSON.parse(bytes)
  }
  assert.deepEqual(snapshotProblems(SOURCES, snap), [])
})

test('sources: an inventory that disagrees with its snapshot, or cites none, is refused', () => {
  const issue = (number, body = '') => ({ number, title: `issue ${number}`, body })
  // Each item's text is its cites, laid out as the issues write items: `k. **…**`.
  const citesOf = (key) => Object.entries(SOURCES.cites).filter(([pair]) => pair.split(' ')[0] === key).map(([, c]) => c).join(' ')
  const bodyOf = (n) => {
    const keys = Object.keys(SOURCES.items).filter((k) => k.startsWith(`#${n}.`))
    return keys.length ? keys.map((k) => `${k.split('.')[1]}. **${citesOf(k)}**`).join('\n') : citesOf(`#${n}`)
  }
  const prBody = (n) => `${citesOf(`pr${n}`)} Closes ${(SOURCES.items[`pr${n}`]?.closes ?? []).map((c) => `#${c}`).join(' ')}`
  const snap = { issues: SOURCES.issues.map((n) => issue(n, bodyOf(n))), prs: SOURCES.prs.map((n) => issue(n, prBody(n))) }
  assert.deepEqual(snapshotProblems(SOURCES, snap), [])
  // An item the issue holds that the inventory never keyed (as #19 item 7 once was) is a problem.
  const extra = { ...snap, issues: snap.issues.map((i) => (i.number === 19 ? { ...i, body: `${i.body}\n9. (note) **one more defect**` } : i)) }
  assert.match(snapshotProblems(SOURCES, extra).join('\n'), /issue item #19\.9 of the snapshot has no entry/)
  // A key the issue does not hold, and a cite the item's text does not carry, are problems.
  const fewer = { ...snap, issues: snap.issues.map((i) => (i.number === 8 ? { ...i, body: i.body.replace(/^15\. .*$/m, '') } : i)) }
  assert.match(snapshotProblems(SOURCES, fewer).join('\n'), /item #8\.15 is not an item of the snapshot/)
  const moved = { ...snap, issues: snap.issues.map((i) => (i.number === 9 ? { ...i, body: i.body.replace(/^18\. .*$/m, '18. **seeder and contract**') } : i)) }
  assert.match(snapshotProblems(SOURCES, moved).join('\n'), /#9\.18 L-116: the cite "identity" is not in the text of #9\.18/)
  assert.match(snapshotProblems(SOURCES, { ...snap, issues: [...snap.issues, issue(41)] }).join('\n'), /the inventory lists issues .*; the snapshot has .*41/)
  assert.match(snapshotProblems(SOURCES, { ...snap, prs: snap.prs.filter((p) => p.number !== 40) }).join('\n'), /the inventory lists prs/)
  const silent = { ...snap, prs: snap.prs.map((p) => (p.number === 38 ? { ...p, body: 'Mode fix #340' } : p)) }
  assert.match(snapshotProblems(SOURCES, silent).join('\n'), /item pr38 closes #34; the PR does not name it/)
  assert.match(snapshotProblems(SOURCES, { issues: {}, prs: snap.prs }).join('\n'), /issues snapshot is not a list/)
  const noEvidence = structuredClone(SOURCES)
  delete noEvidence.evidence
  assert.match(sourceProblems(noEvidence, CATALOG, GOTCHAS).join('\n'), /evidence\.issues\.file is not a path under ~\/.*evidence\.prs\.sha256/s)
})

test('sources: an item holding several defects maps to one lesson per defect, each with its own fix', () => {
  const several = { g31: 2, g44: 2, g45: 2, g46: 2, g48: 2, g50: 3, g51: 2, g52: 2, g53: 2, g55: 2, g56: 2, g63: 3, '#7.14': 2, '#8.6': 2, '#8.17': 2, '#9.13': 2, '#14.2': 2, '#14.6': 2, '#15.10': 3, '#27.8': 2 }
  const byId = new Map(CATALOG.map((r) => [r.id, r]))
  for (const [key, n] of Object.entries(several)) {
    const ids = SOURCES.items[key]
    assert.equal(ids.length, n, key)
    const lessons = ids.map((id) => byId.get(id))
    assert.equal(new Set(lessons.map((r) => r.fix)).size, n, `${key}: one fix per defect`)
  }
  // #9 items 11 and 12 are two defects of gotcha 46: page order, and the WordPress samples.
  assert.deepEqual([SOURCES.items['#9.11'], SOURCES.items['#9.12']], [['L-101'], ['L-046']])
})

test('sources: an incomplete or inconsistent inventory is refused, never read as coverage', () => {
  const copy = () => structuredClone(SOURCES)
  const partial = copy()
  partial.complete = false
  assert.match(sourceProblems(partial, CATALOG, GOTCHAS).join('\n'), /not complete/)
  const noGotcha = copy()
  delete noGotcha.items.g5
  assert.match(sourceProblems(noGotcha, CATALOG, GOTCHAS).join('\n'), /gotcha 5 has no lesson/)
  const noPr = copy()
  delete noPr.items.pr25
  assert.match(sourceProblems(noPr, CATALOG, GOTCHAS).join('\n'), /PR #25 has no item/)
  const noIssue = copy()
  for (const k of Object.keys(noIssue.items)) if (k.startsWith('#29')) delete noIssue.items[k]
  assert.match(sourceProblems(noIssue, CATALOG, GOTCHAS).join('\n'), /issue #29 has no item/)
  const wrongRef = copy()
  wrongRef.items['#34'] = ['L-001']
  assert.match(sourceProblems(wrongRef, CATALOG, GOTCHAS).join('\n'), /L-001: the lesson's ref does not name #34/)
  assert.match(sourceProblems(SOURCES, CATALOG, GOTCHAS + 1).join('\n'), /gotcha 64 has no lesson/)
  assert.match(sourceProblems(SOURCES, [...CATALOG, { id: 'L-999', ref: 'g1' }], GOTCHAS).join('\n'), /L-999 is reached from no source item/)
})

test('sources: every issue and PR item → lesson pair cites words the lesson holds; a number alone is no mapping', () => {
  const copy = () => structuredClone(SOURCES)
  const uncited = copy()
  delete uncited.cites['#8.7 L-113']
  assert.match(sourceProblems(uncited, CATALOG, GOTCHAS).join('\n'), /#8\.7 L-113: no cite/)
  // #8 item 7 (the contract's mega selectors) once pointed at L-050 (the mega-hover walk).
  const wrong = copy()
  wrong.items['#8.7'] = ['L-050']
  wrong.cites = { ...wrong.cites, '#8.7 L-050': 'contract' }
  delete wrong.cites['#8.7 L-113']
  assert.match(sourceProblems(wrong, CATALOG, GOTCHAS).join('\n'), /#8\.7 L-050: the cite "contract" is not in the lesson/)
  const stray = copy()
  stray.cites['#8.7 L-001'] = 'contract'
  assert.match(sourceProblems(stray, CATALOG, GOTCHAS).join('\n'), /cite "#8\.7 L-001" is no item → lesson pair/)
  const control = copy()
  control.cites['#8.7 L-113'] = 'con\u001btract'
  assert.match(sourceProblems(control, CATALOG, GOTCHAS).join('\n'), /#8\.7 L-113: no cite/)
})

test('parse: duplicates, unknown detectors, bad status combinations and oversized records are refused', () => {
  const r = (o) => JSON.stringify({ id: 'L-001', area: 'seed', when: 'always', sym: 's', fix: '$ f', ref: 'g1', ...o })
  const bad = [
    [`${r()}\n${r()}\n`, /duplicate id L-001/],
    [`${r({ when: 'nope' })}\n`, /is no detector/],
    [`${r({ status: 'fixed-in-code', test: 'seed~x' })}\n`, /fixed-in-code record has no detector/],
    [`${r({ when: undefined, status: 'fixed-in-code', fix: 'seed#x' })}\n`, /names its regression test/],
    [`${r({ status: 'open' })}\n`, /open defect needs a detector/],
    [`${r({ tool: 'review/contrast-audit', test: 'issue27~x' })}\n`, /tool record has neither a detector/],
    [`${r({ when: undefined, tool: 'review/contrast-audit' })}\n`, /tool record names the tool's regression test/],
    [`${r({ when: undefined, tool: '../x.mjs', test: 'issue27~x' })}\n`, /is not a script path/],
    [`${r({ when: undefined, status: 'fixed-in-code', fix: 'seed#x', test: 'seed~x', tool: 'review/probe' })}\n`, /fixed-in-code record names no tool/],
    [`${r({ status: 'done' })}\n`, /status "done"/],
    [`${r({ sym: 'x'.repeat(101) })}\n`, /sym is 101 characters/],
    [`${r({ sym: 'a\u0007b' })}\n`, /sym holds a control character/],
    [`${r({ test: 'seed~a\u001b[31mb' })}\n`, /test holds a control character/],
    [`${r({ when: 'alw\u009bays' })}\n`, /when holds a control character/],
    [`${r({ fix: 'seed.mjs resolveMedia' })}\n`, /neither/],
    [`${r({ ref: 'issue 4' })}\n`, /not gN/],
    [`${r({ extra: 'x' })}\n`, /unknown key/],
    [`${r({ area: 7 })}\n`, /area is not a string/],
    [`${r({ id: 'L-002' })}\n${r()}\n`, /out of order/],
    [`${r({ sym: 'x'.repeat(95), fix: `$ ${'y'.repeat(98)}` })}\n`, /bytes \(at most 240\)/],
    ['[]\n', /not a JSON object/]
  ]
  for (const [text, why] of bad) assert.throws(() => parseCatalog(text), (e) => e instanceof CatalogError && why.test(e.message), String(why))
})

test('docs: SKILL.md scans at the start, before Phase 8 and before Phase 9; show opens a gotcha; gotchas stay whole', () => {
  const skill = read('SKILL.md')
  assert.ok((skill.match(/lessons\.mjs scan/g) ?? []).length >= 3, 'SKILL.md names the scan at three moments')
  assert.match(skill, /lessons\.mjs show/)
  const table = skill.split('\n').filter((l) => l.startsWith('| 8 ') || l.startsWith('| 9 '))
  assert.equal(table.length, 2)
  for (const row of table) assert.match(row, /lessons\.mjs scan/, row.slice(0, 40))
  const gotchas = read('references/gotchas.md')
  assert.doesNotMatch(gotchas, /read the whole file (at|in) Phase 8b/i)
  assert.match(gotchas, /lessons\.mjs/)
  assert.equal(measure(SKILL).gotchaGap, null)
  assert.doesNotMatch(read('references/review.md') + read('references/visual-qa.md'), /read (all( of)?|the whole) gotchas/i)
  const lessonsDoc = read('references/lessons.md')
  for (const id of Object.keys(DETECTORS)) assert.ok(lessonsDoc.includes(`\`${id}\``), `lessons.md documents ${id}`)
  assert.match(read('references/verify-recipes.md'), /lessons\.mjs scan/)
  // The scan reads directories only: no document hands it a live site.
  for (const rel of ['SKILL.md', 'references/lessons.md', 'references/verify-recipes.md', 'references/packaging.md', 'references/gotchas.md', '../../README.md'])
    for (const l of read(rel).split('\n').filter((x) => /lessons\.mjs scan/.test(x))) assert.doesNotMatch(l, /--site|--source <url>/, `${rel}: ${l.slice(0, 80)}`)
  assert.match(read('references/packaging.md'), /lessons\.mjs scan/)
})

// #8 item 15 (L-114): review.md and visual-qa.md stated the four stages in two orders. Both now
// state the contract's order (visual/contract.mjs STAGES).
test('docs: review.md and visual-qa.md state the stages in the contract\'s stage order', () => {
  const words = { 'light-desktop': 'light desktop', 'light-responsive': 'light responsive', 'dark-desktop': 'dark desktop', 'dark-responsive': 'dark responsive' }
  const order = STAGES.map((s) => s.id)
  assert.ok(read('references/visual-qa.md').includes(order.map((id) => `${id} (${id.endsWith('desktop') ? 1440 : 390})`).join(' → ')))
  assert.ok(read('references/review.md').includes(order.map((id) => words[id]).join(' → ')))
})
