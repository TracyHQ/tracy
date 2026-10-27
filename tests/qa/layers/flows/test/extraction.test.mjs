import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractDoors, extractJourneys, listJourneyFiles } from '../generate.mjs'

const table = (rows) => `const JOURNEYS = [\n${rows}\n]\n`
const doorsOf = (text) => extractDoors([{ rel: 'a.mjs', text }])

test('defect 1: a table or call with its closing bracket missing is an error, not a shorter list', () => {
  assert.throws(
    () => extractJourneys("const JOURNEYS = [\n  { id: 'J0', perCms: false },\n"),
    /tests\/e2e-dev\/run\.mjs:\d+:\d+: cannot parse/
  )
  assert.throws(() => doorsOf("x.post('/api/a', {});\nx.get('/api/b'"), /a\.mjs:\d+:\d+: cannot parse/)
  // A valid table followed by a broken tail gives no list from the head.
  assert.throws(() => extractJourneys(`${table("  { id: 'J0', perCms: false }")}\nfoo(`), /cannot parse/)
})

test('defect 2: a row that cannot be read is named with file and line, never dropped silently', () => {
  const r = extractJourneys(
    table("  { id: 'J0', perCms: false },\n  makeJourney('J1'),\n  { id: 'J2', perCms: false }")
  )
  assert.deepEqual(
    r.items.map((x) => x.id),
    ['J0', 'J2']
  )
  assert.equal(r.unresolved.length, 1)
  assert.equal(r.unresolved[0].source, 'tests/e2e-dev/run.mjs')
  assert.equal(r.unresolved[0].detail.line, 3)
  assert.equal(r.unresolved[0].detail.construct, 'CallExpression')
})

test('defect 3: a door call inside a comment or a string is not a door', () => {
  const { doors, unresolved } = doorsOf(
    "// x.get('/api/in-comment')\n/* y.post('/api/in-block') */\nconst s = \"z.get('/api/in-string')\"\nconst t = `w.get('/api/in-template')`\nc.get('/api/real')"
  )
  assert.deepEqual([...doors.keys()], ['door:GET /api/real'])
  assert.deepEqual(unresolved, [])
})

test('positive control: journeys and doors are read entry by entry', () => {
  const j = extractJourneys(
    table(
      "  { id: 'J13', perCms: false, smoke: true },\n  { 'id': 'J2c', perCms: true, notCovered: 'no source' },\n  { id: 'J14', perCms: false }"
    )
  )
  assert.deepEqual(j, {
    items: [
      { id: 'J13', perCms: false, notCovered: null },
      { id: 'J2c', perCms: true, notCovered: 'no source' },
      { id: 'J14', perCms: false, notCovered: null }
    ],
    unresolved: []
  })
  const { doors, unresolved } = extractDoors([
    {
      rel: 'a.mjs',
      text: "c.post('/api/sites', {}); c.get('/api/sites?x=1'); c.get(`/api/plain`); c.get('https://example.com/x'); h.get('content-type'); c.delete('/api/sites')"
    },
    { rel: 'b.mjs', text: "c.get('/api/sites'); c['patch']('/api/p')" }
  ])
  assert.deepEqual(
    [...doors.entries()].map(([id, d]) => [id, d.method, d.path, [...d.sources]]),
    [
      ['door:POST /api/sites', 'POST', '/api/sites', ['a.mjs']],
      ['door:GET /api/sites', 'GET', '/api/sites', ['a.mjs', 'b.mjs']],
      ['door:GET /api/plain', 'GET', '/api/plain', ['a.mjs']],
      ['door:DELETE /api/sites', 'DELETE', '/api/sites', ['a.mjs']],
      ['door:PATCH /api/p', 'PATCH', '/api/p', ['b.mjs']]
    ]
  )
  assert.deepEqual(unresolved, [])
})

test('unsupported journey constructs each become an unresolved entry with the line and construct', () => {
  const cases = [
    ["{ ['id']: 'J1', perCms: false }", 'computed key'],
    ['...more', 'SpreadElement'],
    ["{ ...base, id: 'J1', perCms: false }", 'SpreadElement'],
    ["{ id: 'J1', perCms: false, tier: 'slow' }", 'unknown field'],
    ["{ id: 'J1' }", 'ObjectExpression'],
    ["{ id: 'J1', perCms: 1 }", 'Property (perCms)'],
    ["{ id: 'J1', perCms: false, notCovered: true }", 'Property (notCovered)'],
    ["{ id: 'J0', perCms: false }", 'ObjectExpression'],
    ["{ id: 'J1', id: 'J2', perCms: false }", 'Property (id)'],
    ['{ id, perCms: false }', 'shorthand'],
    ["{ get id() { return 'J1' }, perCms: false }", 'accessor'],
    ['{ id() {}, perCms: false }', 'method'],
    ['{ id: ID, perCms: false }', 'Property (id)'],
    ['ROW', 'Identifier'],
    [',', 'array hole']
  ]
  for (const [row, construct] of cases) {
    const r = extractJourneys(table(`  { id: 'J0', perCms: false },\n  ${row}`))
    assert.ok(
      r.unresolved.some((u) => u.detail.construct.includes(construct) && u.detail.line >= 2),
      `${row} → ${JSON.stringify(r.unresolved)}`
    )
    assert.ok(r.items.some((x) => x.id === 'J0'))
  }
})

test('a missing, empty, non-array or touched JOURNEYS table is unresolved, never a clean empty list', () => {
  const sources = {
    missing: 'const X = 1',
    empty: 'const JOURNEYS = []',
    call: 'const JOURNEYS = build()',
    identifier: 'const JOURNEYS = OTHER',
    destructured: 'const { JOURNEYS } = other',
    push: `${table("  { id: 'J0', perCms: false }")}JOURNEYS.push({ id: 'J1', perCms: false })`,
    assign: `${table("  { id: 'J0', perCms: false }")}JOURNEYS[0] = null`,
    reexport: `${table("  { id: 'J0', perCms: false }")}export { JOURNEYS as ALL }`,
    constructed: `${table("  { id: 'J0', perCms: false }")}new Editor(JOURNEYS)`
  }
  for (const [name, text] of Object.entries(sources)) {
    const r = extractJourneys(text)
    assert.ok(r.unresolved.length > 0, name)
    assert.ok(
      r.unresolved.every(
        (u) =>
          (u.source === 'tests/e2e-dev/run.mjs' && u.reason.includes('run.mjs:')) ||
          u.reason.includes('run.mjs')
      ),
      name
    )
  }
  assert.equal(extractJourneys('').unresolved.length, 1)
})

test('unsupported door calls are unresolved with file, line and construct', () => {
  const { doors, unresolved } = doorsOf(
    [
      'a.get(`${base}/x`)',
      'a.get(path)',
      'a.get(helper())',
      'a.get()',
      'a.get(...args)',
      "a[verb]('/api/c')",
      "a.get('/api/ok')",
      "a.get('/api/' + id)"
    ].join('\n')
  )
  assert.deepEqual([...doors.keys()], ['door:GET /api/ok'])
  assert.deepEqual(
    unresolved.map((u) => [u.source, u.detail.line, u.detail.construct]),
    [
      ['a.mjs', 1, 'TemplateLiteral (interpolation)'],
      ['a.mjs', 2, 'Identifier'],
      ['a.mjs', 3, 'CallExpression'],
      ['a.mjs', 4, 'CallExpression (no argument)'],
      ['a.mjs', 5, 'SpreadElement'],
      ['a.mjs', 6, 'CallExpression (computed method)'],
      ['a.mjs', 8, 'BinaryExpression']
    ]
  )
})

test('a template path starting with "/" is a door: each interpolation becomes :param', () => {
  const { doors, unresolved } = doorsOf(
    [
      'client.get(`/api/sites/${key}/applies`)',
      'client.post(`/api/sites/${key}/moments/${m}/files?x=${y}`)',
      'client.get(`/${a}/`)',
      'client.get(path)'
    ].join('\n')
  )
  assert.deepEqual(
    [...doors.keys()],
    [
      'door:GET /api/sites/:param/applies',
      'door:POST /api/sites/:param/moments/:param/files',
      'door:GET /:param/'
    ]
  )
  assert.deepEqual(
    unresolved.map((u) => [u.detail.line, u.detail.construct]),
    [[4, 'Identifier']]
  )
})

test('every computed call is unresolved whatever its arguments, a literal method name is not', () => {
  const { doors, unresolved } = doorsOf(
    [
      'c[verb](path)',
      'c[verb]()',
      'c[verb](`/${id}`)',
      'c[verb](...args)',
      "c[verb]('/api/c')",
      "c['get']('/api/lit')"
    ].join('\n')
  )
  assert.deepEqual([...doors.keys()], ['door:GET /api/lit'])
  assert.deepEqual(
    unresolved.map((u) => [u.detail.line, u.detail.construct]),
    [1, 2, 3, 4, 5].map((l) => [l, 'CallExpression (computed method)'])
  )
})

const MENTIONS = [
  "JOURNEYS.push({ id: 'J1', perCms: false })",
  "JOURNEYS.push.call(JOURNEYS, { id: 'J1', perCms: false })",
  "JOURNEYS.push.apply(JOURNEYS, [{ id: 'J1', perCms: false }])",
  "Object.assign(JOURNEYS[0], { id: 'Jx' })",
  "Reflect.set(JOURNEYS, 0, { id: 'Jx', perCms: false })",
  "Array.prototype.push.call(JOURNEYS, { id: 'J1', perCms: false })",
  "Reflect.set(...[JOURNEYS, 0, { id: 'Jx', perCms: false }])",
  "Object.assign(...[JOURNEYS[0], { id: 'Jx' }])",
  "Reflect.set(flag ? JOURNEYS : other, 0, { id: 'Jx', perCms: false })",
  "Reflect.set(other || JOURNEYS, 0, { id: 'Jx', perCms: false })",
  "Reflect.set((0, JOURNEYS), 0, { id: 'Jx', perCms: false })",
  'Object.assign({ t: JOURNEYS[0] }, {})',
  "(flag ? JOURNEYS : other).push({ id: 'J1', perCms: false })",
  "JOURNEYS['push']({ id: 'J1', perCms: false })",
  '[JOURNEYS[0]] = [null]',
  '({ a: JOURNEYS[0] } = {})',
  'for (JOURNEYS[0] of [1]) ;',
  'for (JOURNEYS[0] in {}) ;',
  'JOURNEYS.length--',
  'delete JOURNEYS[0]',
  'JOURNEYS[0] = null',
  'JOURNEYS = []',
  'new Editor(JOURNEYS)',
  'new Editor(...[JOURNEYS])',
  'tag`${JOURNEYS}`',
  'const alias = JOURNEYS',
  'function f() { return JOURNEYS }',
  'async function f() { await JOURNEYS }',
  'function* g() { yield JOURNEYS }',
  'f?.(JOURNEYS)',
  'run(() => JOURNEYS.length)',
  'export { JOURNEYS as ALL }',
  'export default JOURNEYS',
  "JOURNEYS.some((j) => j.id === 'J0')",
  'JOURNEYS.filter(Boolean)',
  'JOURNEYS[0].id'
]

for (const tail of MENTIONS) {
  test(`a mention of JOURNEYS after its declaration is unresolved: ${tail}`, () => {
    const r = extractJourneys(`${table("  { id: 'J0', perCms: false }")};${tail}`)
    assert.ok(r.unresolved.length >= 1, JSON.stringify(r.unresolved))
    for (const u of r.unresolved) {
      assert.equal(u.source, 'tests/e2e-dev/run.mjs')
      assert.ok(u.detail.line >= 4)
      assert.ok(u.detail.construct.length > 0)
      assert.ok(u.reason.startsWith('tests/e2e-dev/run.mjs:'))
    }
    assert.deepEqual(
      r.items.map((x) => x.id),
      ['J0']
    )
  })
}

test('the declaration alone, and same-named keys, are not mentions', () => {
  const r = extractJourneys(
    `${table("  { id: 'J0', perCms: false }")}const o = { JOURNEYS: 1 }; o.JOURNEYS; class A { JOURNEYS() {} }`
  )
  assert.deepEqual(r.unresolved, [])
})

test('an array hole is reported on its own line, first, middle and trailing', () => {
  const r = extractJourneys(
    "const JOURNEYS = [\n  ,\n  { id: 'J0', perCms: false },\n  ,\n  { id: 'J1', perCms: false },\n  { id: 'J2', perCms: false }\n  ,\n  ,\n]\n"
  )
  assert.deepEqual(
    r.unresolved.map((u) => u.detail.line),
    [2, 4, 8]
  )
  assert.deepEqual(
    r.items.map((x) => x.id),
    ['J0', 'J1', 'J2']
  )
})

test('a missing journeys directory or a missing journey file is a gap, notCovered excepted', () => {
  const root = mkdtempSync(path.join(process.env.QA_FLOWS_ARTIFACT_ROOT ?? tmpdir(), 'jf-'))
  try {
    const items = [
      { id: 'J0', perCms: false, notCovered: null },
      { id: 'J10', perCms: false, notCovered: null },
      { id: 'J2c', perCms: true, notCovered: 'no source' }
    ]
    const gone = listJourneyFiles(items, path.join(root, 'absent'))
    assert.deepEqual(gone.files, [])
    assert.equal(gone.gaps.length, 1)
    assert.equal(gone.gaps[0].detail.construct, 'missing journey source')
    const dir = path.join(root, 'journeys')
    mkdirSync(dir)
    writeFileSync(path.join(dir, 'J0.test.mjs'), "c.get('/api/a')\n")
    const partial = listJourneyFiles(items, dir)
    assert.deepEqual(
      partial.files.map((f) => path.basename(f.rel)),
      ['J0.test.mjs']
    )
    assert.equal(partial.gaps.length, 1)
    assert.match(partial.gaps[0].reason, /J10\.test\.mjs is missing/)
    writeFileSync(path.join(dir, 'J10.test.mjs'), '')
    assert.deepEqual(listJourneyFiles(items, dir).gaps, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
