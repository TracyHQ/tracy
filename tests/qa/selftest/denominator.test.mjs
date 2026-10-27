// The shared denominator contract (contracts/denominator.schema.json + lib/denominator.mjs): every layer's
// committed file satisfies it, and each rule refuses what it should. A file that breaks a rule is rejected
// whole: nothing is repaired, dropped or given coverage credit.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { KNOWN_LAYERS } from '../lib/args.mjs'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonAsync } from '../lib/bounded-reader.mjs'
import {
  DENOMINATOR_LAYERS,
  DENOMINATOR_SCHEMA_ID,
  LAYER_CONTRACT,
  MAX_CONTRACT_BYTES,
  NaTable,
  allowedTags,
  assertDenominator,
  citedFile,
  denominatorSchema,
  edgeTagsOf,
  isReference,
  loadEdgeTags,
  naResolve,
  naText,
  parseNa,
  readContract,
  revisionCommitTokens,
  validateDenominator
} from '../lib/denominator.mjs'
import { compileSchema } from '../lib/schema.mjs'
import { cli, fakeGit, fakeFingerprint, SHA, tmpDir } from './helpers.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const QA = path.resolve(HERE, '..')
const REPO = path.resolve(QA, '../..')
const readJson = async (file) => readBoundedJsonAsync(file, { maxBytes: MAX_LAYER_FILE_BYTES })
const committed = (layer) => readJson(path.join(QA, 'layers', layer, 'denominator.json'))

const NA = 'the door returns one record; source: docs/x.md'
const base = (extra = {}, item = {}) => ({
  schema: DENOMINATOR_SCHEMA_ID,
  layer: 'api',
  source: 's',
  revision: SHA,
  command: 'c',
  naReasons: { r0: NA },
  items: [{ id: 'GET /a', kind: 'api-door', requiredTags: ['happy'], na: { pagination: 'r0' }, ...item }],
  unresolved: [],
  ...extra
})
const problemsOf = (doc, layer = 'api') => validateDenominator(doc, layer).problems
const omit = (key) => Object.fromEntries(Object.entries(base()).filter(([k]) => k !== key))

test('the contract names exactly the ten layers the runner knows', () => {
  assert.deepEqual([...DENOMINATOR_LAYERS].sort(), [...KNOWN_LAYERS].sort())
  assert.deepEqual([...denominatorSchema().properties.layer.enum].sort(), [...KNOWN_LAYERS].sort())
  compileSchema(denominatorSchema())
})

test('every layer has a committed denominator.json that satisfies the shared contract', async () => {
  const edge = loadEdgeTags()
  for (const layer of KNOWN_LAYERS) {
    const doc = await committed(layer)
    const { problems, doc: normal } = validateDenominator(doc, layer, edge)
    assert.deepEqual(problems, [], `${layer}: ${problems[0]}`)
    assert.equal(doc.schema, DENOMINATOR_SCHEMA_ID)
    assert.equal(doc.layer, layer)
    assert.ok(doc.items.length > 0, `${layer}: an empty extraction proves nothing`)
    assert.match(doc.command, /^node tests\/qa\/layers\//, `${layer}: command regenerates the file`)
    // Every N-A resolves to a reason and a reference, and no tag is both owed and N-A.
    for (const item of normal.items) {
      for (const [tag, text] of Object.entries(item.na)) {
        assert.ok(parseNa(text), `${layer} ${item.id}/${tag}`)
        assert.ok(!item.requiredTags.includes(tag), `${layer} ${item.id}/${tag} is both`)
      }
    }
    for (const u of doc.unresolved) assert.ok(u.reason && (u.id || u.source), `${layer}: unresolved entry`)
  }
})

test('every kind a layer may list resolves to edge-tag groups that exist', () => {
  const edge = loadEdgeTags()
  for (const [layer, contract] of Object.entries(LAYER_CONTRACT))
    for (const kind of Object.keys(contract.kinds)) {
      const tags = allowedTags(layer, kind, edge)
      for (const tag of edge.common) assert.ok(tags.has(tag), `${layer}/${kind} lacks ${tag}`)
      for (const tag of contract.extraTags)
        assert.ok(!edge.universe.has(tag), `${tag} is already a master tag`)
    }
  assert.equal(allowedTags('api', 'gate', edge), null, 'a kind of another layer is not this layer`s')
  assert.throws(() => edgeTagsOf({ common: [], kinds: {} }), /edge tags/)
  assert.throws(() => edgeTagsOf({ common: ['happy'], kinds: { x: [] } }), /group "x"/)
  assert.throws(() => edgeTagsOf(null), /edge tags/)
})

test('a conforming document passes; N-A keys are resolved to their text and tags are sorted', () => {
  const doc = base({}, { requiredTags: ['invalid', 'happy'] })
  const { problems, doc: normal } = validateDenominator(doc, 'api')
  assert.deepEqual(problems, [])
  assert.deepEqual(normal.items[0].requiredTags, ['happy', 'invalid'])
  assert.equal(normal.items[0].na.pagination, NA)
  assert.equal(assertDenominator(doc, 'api'), doc)
  // `{id}` in a stored reason stands for the item that cites it.
  const templated = base({ naReasons: { r0: '{id} returns one record; source: docs/x.md' } })
  assert.equal(
    validateDenominator(templated, 'api').doc.items[0].na.pagination,
    'GET /a returns one record; source: docs/x.md'
  )
})

test('structure: missing, extra and mistyped fields are refused', () => {
  const cases = [
    ['not an object', [], /expected object/],
    ['null', null, /expected object/],
    ['no schema', omit('schema'), /missing required "schema"/],
    ['an older schema', base({ schema: 'tracy-qa-denominator/v0' }), /must equal/],
    ['no layer', omit('layer'), /missing required "layer"/],
    ['no command', omit('command'), /missing required "command"/],
    ['no revision', omit('revision'), /missing required "revision"/],
    ['a numeric revision', base({ revision: 7 }), /revision/],
    ['an empty revision', base({ revision: '' }), /revision/],
    ['no naReasons', omit('naReasons'), /missing required "naReasons"/],
    ['no unresolved list', omit('unresolved'), /missing required "unresolved"/],
    ['items not an array', base({ items: {} }), /items: expected array/],
    ['an unknown top-level field', base({ coverage: {} }), /coverage/],
    ['an unknown item field', base({}, { membership: 'public' }), /membership/],
    ['an item without na', base({ items: [{ id: 'a', kind: 'api-door', requiredTags: [] }] }), /"na"/],
    ['requiredTags as a string', base({}, { requiredTags: 'happy' }), /expected array/],
    ['a tag listed twice', base({}, { requiredTags: ['happy', 'happy'] }), /requiredTags/],
    ['na as a compact string', base({}, { na: 'pagination=0' }), /na: expected object/],
    [
      'na value as an object',
      base({}, { na: { pagination: { reason: 'a', source: 'b' } } }),
      /expected string/
    ],
    ['meta as a list', base({}, { meta: [] }), /meta: expected object/],
    ['details as a list', base({ details: [] }), /details: expected object/],
    ['a bare-string unresolved entry', base({ unresolved: ['x'] }), /expected object/],
    ['an unresolved entry without a reason', base({ unresolved: [{ id: 'x' }] }), /"reason"/],
    ['an unresolved entry with neither id nor source', base({ unresolved: [{ reason: 'r' }] }), /unresolved/],
    [
      'an unresolved entry with a stray field',
      base({ unresolved: [{ id: 'x', reason: 'r', what: 1 }] }),
      /what/
    ],
    ['manual without an id', base({ manual: [{}] }), /"id"/],
    ['sourcePaths as a string', base({ sourcePaths: '.' }), /expected array/]
  ]
  for (const [label, doc, message] of cases) assert.match(problemsOf(doc).join('\n'), message, label)
  assert.throws(() => assertDenominator(base({ coverage: {} }), 'api'), /breaks the shared contract/)
})

test('semantics: layer, ids, kinds, tags, meta, details, manual', () => {
  const two = (b) =>
    base({ items: [base().items[0], { id: b, kind: 'api-door', requiredTags: ['happy'], na: {} }] })
  const cases = [
    ['a layer that is not the directory', base({ layer: 'ui' }), /does not match its directory "api"/],
    ['a duplicate item id', two('GET /a'), /duplicate item id GET \/a/],
    ['a kind of another layer', base({}, { kind: 'gate' }), /unknown kind "gate" for layer api/],
    ['an invented kind', base({}, { kind: 'made-up' }), /unknown kind "made-up"/],
    ['an unknown tag', base({}, { requiredTags: ['happy', 'made-up'] }), /unknown tag\(s\) made-up/],
    ['an unknown N-A tag', base({}, { na: { 'made-up': 'r0' } }), /unknown tag\(s\) made-up/],
    ['a tag of another group', base({}, { requiredTags: ['loading'] }), /do not apply to kind "api-door"/],
    [
      'a tag both required and N-A',
      base({}, { requiredTags: ['pagination'] }),
      /both required and N-A: pagination/
    ],
    [
      'a meta key the kind lacks',
      base({}, { meta: { timer: 'x' } }),
      /meta\.timer is not a field of kind "api-door"/
    ],
    [
      'a details key the layer lacks',
      base({ details: { matrix: {} } }),
      /details\.matrix is not a field of layer api/
    ],
    ['a repeated manual id', base({ manual: [{ id: 'm' }, { id: 'm' }] }), /duplicate manual id m/]
  ]
  for (const [label, doc, message] of cases) assert.match(problemsOf(doc).join('\n'), message, label)
  assert.deepEqual(problemsOf(base(), 'nope'), ['unknown layer "nope"'])
  assert.deepEqual(problemsOf(two('GET /b')), [])
  assert.deepEqual(problemsOf(base({}, { meta: { membership: 'public' } })), [])
  assert.deepEqual(problemsOf(base({ details: { complete: false } })), [])
  // A layer's own extra tag is accepted for that layer only.
  const harness = (tag) => ({
    ...base({ layer: 'harness', naReasons: {} }),
    items: [{ id: 'approval:x', kind: 'approval', requiredTags: [tag], na: {} }]
  })
  assert.deepEqual(problemsOf(harness('audit-seam'), 'harness'), [])
  assert.match(
    problemsOf(base({ naReasons: {} }, { requiredTags: ['audit-seam'], na: {} })).join(),
    /unknown tag/
  )
})

test('a cross-layer claim is accepted only for a kind the caller passes as foreign', () => {
  const claim = {
    ...base({ layer: 'flows', naReasons: {} }),
    items: [{ id: 'x', kind: 'api-door', requiredTags: ['happy', 'anonymous'], na: {} }]
  }
  assert.match(problemsOf(claim, 'flows').join(), /unknown kind "api-door" for layer flows/)
  const foreignKinds = { 'api-door': { layer: 'api', groups: ['api-host'] } }
  assert.deepEqual(validateDenominator(claim, 'flows', loadEdgeTags(), { foreignKinds }).problems, [])
  const withMeta = { ...claim, items: [{ ...claim.items[0], meta: { membership: 'public' } }] }
  assert.match(
    validateDenominator(withMeta, 'flows', loadEdgeTags(), { foreignKinds }).problems.join(),
    /meta\.membership is not a field/
  )
  const wrongTag = { ...claim, items: [{ ...claim.items[0], requiredTags: ['loading'] }] }
  assert.match(
    validateDenominator(wrongTag, 'flows', loadEdgeTags(), { foreignKinds }).problems.join(),
    /do not apply to kind "api-door"/
  )
})

test('N-A: one grammar, stored once, cited by key; every other form is refused', () => {
  for (const good of [
    'no collection here; source: docs/x.md',
    'no collection here; docs/x.md#anchor',
    'no collection here; source: ADR 14 §2',
    'no collection here; source: #662',
    'no collection here; source: https://example.test/spec',
    'a (nested; clause) stays in the reason; source: apps/tracy-web/src/lib/x.js',
    'scoped package path is a file; source: packages/@tracy/x/index.mjs'
  ])
    assert.ok(parseNa(good), good)
  for (const bad of [
    '',
    '  ',
    'because',
    'not applicable',
    'because; docs/x.md',
    'no collection here; nonsense',
    'no collection here (docs/x.md)',
    'no collection here — docs/x.md',
    'no collection here; source: /etc/passwd.md',
    'no collection here; source: ../x.md',
    'no collection here; source: docs/x',
    'no collection here; source: ADR',
    'no collection here; source: #',
    'no collection here; source: http://',
    'docs/x.md; ADR 14',
    'no collection here; docs/x.md and more words',
    3,
    null,
    { reason: 'no collection here', source: 'docs/x.md' }
  ])
    assert.equal(parseNa(bad), null, JSON.stringify(bad))
  const withReason = (text) => base({ naReasons: { r0: text } })
  assert.match(problemsOf(withReason('because')).join(), /N-A for pagination is not/)
  assert.match(problemsOf(withReason('no list (docs/x.md)')).join(), /N-A for pagination is not/)
  assert.match(problemsOf(base({}, { na: { pagination: 'ghost' } })).join(), /names reason "ghost"/)
  assert.match(problemsOf(base({}, { na: { pagination: NA } })).join(), /does not list/, 'text in the item')
  assert.match(
    problemsOf(base({ naReasons: { r0: NA, dead: NA } })).join(),
    /naReasons\.dead is cited by no item/
  )
  assert.equal(naText('no collection here', 'docs/x.md'), 'no collection here; source: docs/x.md')
  assert.throws(() => naText('because', 'docs/x.md'), /not an N-A entry/)
  assert.throws(() => naText('no collection here', 'not a reference'), /not an N-A entry/)
  assert.throws(() => naText('no collection here; docs/y.md', 'nonsense'), /not an N-A entry/)
})

test('NaTable stores a reason once, templates the item id, and refuses what it cannot give back', () => {
  const table = new NaTable()
  const a = table.add('GET /a declares no body', 'docs/x.md', 'GET /a')
  const b = table.add('GET /b declares no body', 'docs/x.md', 'GET /b')
  const c = table.add('a GET writes nothing', 'docs/x.md', 'GET /a')
  const d = table.add('no item id here', 'docs/x.md')
  assert.equal(a, b, 'one template for both doors')
  assert.notEqual(a, c)
  assert.deepEqual(table.table(), {
    r0: '{id} declares no body; source: docs/x.md',
    r1: 'a GET writes nothing; source: docs/x.md',
    r2: 'no item id here; source: docs/x.md'
  })
  assert.equal(naResolve(table.table()[a], 'GET /b'), 'GET /b declares no body; source: docs/x.md')
  assert.equal(d, 'r2')
  // An id that itself contains `{id}` round-trips; a reason that says `{id}` about something else does not.
  const door = 'DELETE /api/me/keys/{id}'
  const k = table.add(`${door} is gated by identity only`, 'docs/x.md', door)
  assert.equal(naResolve(table.table()[k], door), `${door} is gated by identity only; source: docs/x.md`)
  assert.throws(
    () => table.add('the path parameter {id} is free text', 'docs/x.md', 'GET /a'),
    /cannot be stored/
  )
  assert.throws(() => table.add('because', 'docs/x.md', 'GET /a'), /not an N-A entry/)
  assert.throws(() => table.add('no source at all', 'the live registry', 'GET /a'), /not an N-A entry/)
})

test('citedFile and isReference: the last file a sentence names, never a bare word or an escape', () => {
  assert.equal(
    citedFile('no cookie on this door (apps/tracy-host/src/auth.js header: "admits NO cookie")'),
    'apps/tracy-host/src/auth.js'
  )
  assert.equal(citedFile('see docs/a.md, then apps/b/c.mjs.'), 'apps/b/c.mjs')
  assert.equal(citedFile('nothing here names a file'), null)
  assert.equal(citedFile('up ../../etc/passwd.md and out'), null)
  for (const ok of [
    'docs/x.md',
    'SYSTEM.md',
    'a/b/c.json#anchor',
    'ADR 0014',
    'ADR-14 §3.2',
    '#12',
    'https://a.test/x'
  ])
    assert.ok(isReference(ok), ok)
  for (const no of ['/abs/x.md', '../x.md', 'docs/x', 'a b.md', 'ADR', '#', 'http://', '', null, 7])
    assert.ok(!isReference(no), String(no))
})

test('revision: only a commit can be proven fresh; a content hash or null names none', () => {
  assert.deepEqual(revisionCommitTokens(SHA), [SHA])
  assert.deepEqual(revisionCommitTokens('origin/develop fa4dc66a5'), ['fa4dc66a5'])
  for (const none of [
    null,
    undefined,
    7,
    `sha256:${'a'.repeat(64)}`,
    'tree:ce09a69409f50727',
    'specs:bf0efcdf30d33d3d',
    `gates-sha256:${'b'.repeat(64)}`,
    'c'.repeat(64),
    'unknown'
  ])
    assert.deepEqual(revisionCommitTokens(none), [], String(none))
})

test('the contract files are read the guarded way: no symlink, FIFO, directory, oversized or malformed file', async () => {
  const dir = await tmpDir('den-contract')
  const good = path.join(dir, 'good.json')
  await fs.writeFile(good, '{"common":["happy"],"kinds":{}}')
  assert.deepEqual(readContract(good), { common: ['happy'], kinds: {} })
  await fs.symlink(good, path.join(dir, 'link.json'))
  assert.throws(() => readContract(path.join(dir, 'link.json')), /not a regular file/)
  execFileSync('mkfifo', [path.join(dir, 'pipe.json')])
  assert.throws(() => readContract(path.join(dir, 'pipe.json')), /not a regular file/)
  await fs.mkdir(path.join(dir, 'dir.json'))
  assert.throws(() => readContract(path.join(dir, 'dir.json')), /not a regular file/)
  assert.throws(() => readContract(path.join(dir, 'absent.json')), /ENOENT/)
  await fs.writeFile(path.join(dir, 'empty.json'), '')
  assert.throws(() => readContract(path.join(dir, 'empty.json')), /invalid JSON/)
  await fs.writeFile(path.join(dir, 'broken.json'), '{ nope')
  assert.throws(() => readContract(path.join(dir, 'broken.json')), /invalid JSON/)
  await fs.writeFile(path.join(dir, 'big.json'), `"${'x'.repeat(MAX_CONTRACT_BYTES)}"`)
  assert.throws(() => readContract(path.join(dir, 'big.json')), /larger than/)
})

// --- coverage reads the same contract, and fails closed -------------------------------------------------

const INDEX = `export default { layer: 'unit', async listCases() { return [] }, async run() { return [] } }\n`
async function coverageOf(doc, state = { sha: SHA, dirty: '' }) {
  const layersDir = await tmpDir('den-layers')
  await fs.mkdir(path.join(layersDir, 'unit/cases'), { recursive: true })
  await fs.writeFile(path.join(layersDir, 'unit/index.mjs'), INDEX)
  if (typeof doc === 'function') await doc(path.join(layersDir, 'unit/denominator.json'))
  else
    await fs.writeFile(
      path.join(layersDir, 'unit/denominator.json'),
      typeof doc === 'string' ? doc : JSON.stringify(doc)
    )
  const env = {
    layersDir,
    resultsRoot: await tmpDir('den-results'),
    git: fakeGit(state),
    fingerprint: fakeFingerprint(state)
  }
  const r = await cli(['coverage', '--layer', 'unit', '--json', '--require-complete'], env)
  return { code: r.code, report: r.out ? JSON.parse(r.out)[0] : null, err: r.err }
}
const unitDoc = (extra = {}) => ({
  ...base({ layer: 'unit', naReasons: {} }),
  items: [{ id: 'a', kind: 'test-area', requiredTags: ['happy'], na: {} }],
  ...extra
})

test('coverage: a denominator in an old or broken shape gives no credit and says why', async () => {
  const old = {
    source: 's',
    revision: SHA,
    items: [{ id: 'a', kind: 'test-area', requiredTags: ['happy'] }],
    unresolved: []
  }
  for (const [label, doc, message] of [
    ['the shape before the shared contract', old, /denominator\.json invalid: .*missing required "schema"/],
    ['another layer`s file', unitDoc({ layer: 'api' }), /does not match its directory "unit"/],
    ['a duplicate id', unitDoc({ items: [unitDoc().items[0], unitDoc().items[0]] }), /duplicate item id a/],
    [
      'a compact N-A string',
      unitDoc({ items: [{ ...unitDoc().items[0], na: 'happy=0' }] }),
      /na: expected object/
    ],
    [
      'an N-A key with no reason',
      unitDoc({ items: [{ ...unitDoc().items[0], requiredTags: [], na: { happy: 'r9' } }] }),
      /names reason "r9"/
    ],
    ['an unknown field', unitDoc({ counts: {} }), /counts/]
  ]) {
    const r = await coverageOf(doc)
    assert.equal(r.code, 3, label)
    assert.match(r.report.reasons.join(' '), message, label)
    assert.equal(r.report.items, 0, `${label}: no item of a rejected file is counted`)
    assert.deepEqual(r.report.obligations.verdicts, { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }, label)
  }
})

test('coverage: empty, malformed, oversized and non-regular denominators stay open, without hanging', async () => {
  for (const [label, doc, message] of [
    ['an empty file', '', /./],
    ['malformed JSON', '{ nope', /./],
    ['a JSON scalar', '7', /expected object/],
    ['a JSON array', '[]', /expected object/]
  ]) {
    const r = await coverageOf(doc)
    assert.equal(r.code, 3, label)
    assert.match(r.report.reasons.join(' '), message, label)
    assert.equal(r.report.items, 0, label)
  }
  const fifo = await coverageOf(async (file) => execFileSync('mkfifo', [file]))
  assert.equal(fifo.code, 3)
  assert.match(fifo.report.reasons.join(' '), /not a regular file/)
  const dir = await coverageOf(async (file) => fs.mkdir(file))
  assert.equal(dir.code, 3)
  assert.match(dir.report.reasons.join(' '), /not a regular file/)
  const link = await coverageOf(async (file) => {
    await fs.writeFile(`${file}.real`, JSON.stringify(unitDoc()))
    await fs.symlink(`${file}.real`, file)
  })
  assert.equal(link.code, 3)
  assert.match(link.report.reasons.join(' '), /not a regular file/)
  assert.equal(link.report.items, 0, 'a symlinked denominator is not read')
})

test('coverage: an unknown or content-hash revision is guarded before any freshness check', async () => {
  for (const [revision, message] of [
    [null, /revision is unknown \(null\): freshness cannot be proven/],
    [`sha256:${'a'.repeat(64)}`, /is a content hash, not a commit: freshness cannot be proven/],
    ['tree:ce09a69409f50727', /is a content hash, not a commit/],
    ['b'.repeat(64), /is a content hash, not a commit/]
  ]) {
    const r = await coverageOf(unitDoc({ revision }))
    assert.equal(r.code, 3, String(revision))
    assert.match(r.report.reasons.join(' '), message, String(revision))
    assert.match(r.report.reasons.join(' '), /denominator\.json is stale/)
  }
  // A commit git does not know, and one that is not an ancestor, are refused too.
  const unknown = await coverageOf(unitDoc({ revision: 'c'.repeat(40) }))
  assert.match(unknown.report.reasons.join(' '), /names no commit in this repository/)
  const foreign = await coverageOf(unitDoc(), { sha: SHA, dirty: '', notAncestor: true })
  assert.match(foreign.report.reasons.join(' '), /is not an ancestor of the tree/)
})

test('coverage: N-A is counted from the table, a missing oracle stays required, unresolved stays open', async () => {
  const doc = unitDoc({
    naReasons: { r0: NA },
    items: [
      { id: 'a', kind: 'test-area', requiredTags: ['happy', 'invalid'], na: { boundary: 'r0' } },
      // Everything N-A with a source: nothing owed, and not an "empty extraction".
      { id: 'b', kind: 'test-area', requiredTags: [], na: { happy: 'r0' } }
    ],
    unresolved: [{ source: 'routes/x.js', reason: 'not read' }]
  })
  const r = await coverageOf(doc)
  assert.equal(r.code, 3)
  assert.equal(r.report.obligations.required, 2, 'the two tags with no case stay required')
  assert.equal(r.report.obligations.na, 2)
  assert.equal(r.report.obligations.verdicts.PENDING, 2)
  assert.equal(r.report.unresolved, 1)
  assert.doesNotMatch(r.report.reasons.join(' '), /require no edge tag/)
  const bare = await coverageOf(
    unitDoc({ items: [{ id: 'a', kind: 'test-area', requiredTags: [], na: {} }] })
  )
  assert.match(bare.report.reasons.join(' '), /require no edge tag/)
})

test('the real tree: no layer is given freshness it cannot prove', async () => {
  // Layers whose revision is a content hash are valid denominators and open in coverage; that is stated, not hidden.
  const hashOnly = []
  for (const layer of KNOWN_LAYERS) {
    const doc = await committed(layer)
    if (revisionCommitTokens(doc.revision).length === 0) hashOnly.push(layer)
  }
  assert.deepEqual(hashOnly.sort(), ['cms', 'flows', 'harness', 'infra', 'related', 'static', 'ui', 'unit'])
  const out = execFileSync(process.execPath, [path.join(QA, 'cli.mjs'), 'coverage', '--json'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const reports = JSON.parse(out)
  assert.deepEqual(reports.map((r) => r.layer).sort(), [...KNOWN_LAYERS].sort())
  for (const r of reports) {
    assert.doesNotMatch(
      r.reasons.join(' '),
      /denominator\.json invalid|denominator\.json is missing/,
      r.layer
    )
    assert.ok(r.open > 0, `${r.layer} is not complete and must not look it`)
    if (hashOnly.includes(r.layer)) assert.match(r.reasons.join(' '), /freshness cannot be proven/, r.layer)
  }
})
