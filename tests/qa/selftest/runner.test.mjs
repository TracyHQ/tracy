import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { validateAgainst } from '../lib/contracts.mjs'
import { FIXTURE_LAYERS, HERE, SHA, cli, latestRunDir, readJson, tmpDir } from './helpers.mjs'
import { readTextAsync } from '../lib/bounded-reader.mjs'

async function readRun(resultsRoot, layer) {
  const dir = await latestRunDir(resultsRoot, layer)
  return {
    dir,
    cases: await readJson(path.join(dir, 'cases.json')),
    results: await readJson(path.join(dir, 'results.json'))
  }
}

test('known-good layer: exit 0, every artifact valid, complete marker written', async () => {
  const r = await cli(['good'])
  assert.equal(r.code, 0, r.err)
  const { dir, cases, results } = await readRun(r.resultsRoot, 'good')
  assert.deepEqual(cases.counts, { PASS: 2, FAIL: 0, ENV: 0, PENDING: 0 })
  assert.deepEqual(await validateAgainst('result.schema.json', results), [])
  assert.equal(results.outcome, 'success')
  assert.equal(results.environment.workflow_ref, 'manual:pnpm-qa')
  assert.equal(results.assurance_target, 'T2')
  assert.equal(results.revision, SHA)
  assert.equal(results.exit_code, 0)
  assert.ok(!results.repository.includes('secret'), 'credentials must be stripped from the repository URL')
  assert.deepEqual(results.findings, [])
  const provenance = await readJson(path.join(dir, 'provenance.json'))
  assert.equal(provenance.git_sha, SHA)
  assert.equal(provenance.dirty, false)
  assert.equal(provenance.node_version, process.version)
  assert.equal(provenance.target, 'local')
  for (const file of ['cases.json', 'report.md', 'provenance.json', 'results.json', 'complete.json'])
    await fs.access(path.join(dir, file))
  for (const c of cases.cases) assert.ok(c.redProof && c.manifestHash)
  const report = await readTextAsync(path.join(dir, 'report.md'))
  assert.match(report, /PASS 2 · FAIL 0 · ENV 0 · PENDING 0/)
})

test('dirty tree is recorded in provenance', async () => {
  const r = await cli(['good'], {
    git: async (a) => (a[0] === 'status' ? ' M file\0' : a[0] === 'rev-parse' ? `${SHA}\n` : '')
  })
  assert.equal(r.code, 0)
  assert.equal(
    (await readJson(path.join(await latestRunDir(r.resultsRoot, 'good'), 'provenance.json'))).dirty,
    true
  )
})

test('a FAIL exits 1 and the aggregate outcome is failure', async () => {
  const r = await cli(['failing'])
  assert.equal(r.code, 1)
  const { cases, results } = await readRun(r.resultsRoot, 'failing')
  assert.equal(results.outcome, 'failure')
  assert.deepEqual(cases.counts, { PASS: 1, FAIL: 1, ENV: 0, PENDING: 0 })
  assert.match(
    await readTextAsync(path.join(await latestRunDir(r.resultsRoot, 'failing'), 'report.md')),
    /injected fault caught/
  )
})

test('schema-invalid manifest exits 2 before run() is called and writes no run directory', async () => {
  const r = await cli(['badmanifest'])
  assert.equal(r.code, 2)
  assert.match(r.err, /effects/)
  assert.deepEqual(await fs.readdir(r.resultsRoot), [])
})

test('ENV and PENDING only exits 3 with outcome skipped', async () => {
  const r = await cli(['envpending'])
  assert.equal(r.code, 3)
  const { cases, results } = await readRun(r.resultsRoot, 'envpending')
  assert.equal(results.outcome, 'skipped')
  assert.deepEqual(cases.counts, { PASS: 0, FAIL: 0, ENV: 1, PENDING: 1 })
  assert.match(cases.cases[0].reason, /QA_STAND_URL/)
})

test('missing layer folder is reported missing (exit 3), never passed', async () => {
  const r = await cli(['harness'])
  assert.equal(r.code, 3)
  assert.match(r.out, /harness: MISSING/)
  assert.deepEqual(await fs.readdir(r.resultsRoot), [])
})

test('unknown layer names and unsafe names exit 2', async () => {
  for (const name of ['nonesuch', '../good', 'Good', 'good/..']) {
    const r = await cli([name])
    assert.equal(r.code, 2, name)
  }
})

test('all: runs present layers, lists absent ones as MISSING, worst exit wins', async () => {
  const dir = await tmpDir('layers-ok')
  await fs.mkdir(path.join(dir, 'unit'))
  const kit = pathToFileURL(path.join(HERE, 'fixtures/kit.mjs')).href
  await fs.writeFile(
    path.join(dir, 'unit/index.mjs'),
    `import { makeCase, passWithProof } from ${JSON.stringify(kit)};
export const layer = 'unit';
const cases = [makeCase(layer, 'a')];
export const listCases = async () => cases;
export const run = async ({ cases: asked, outDir }) => Promise.all(asked.map((m) => passWithProof(m, outDir)));
`
  )
  const r = await cli(['all'], { layersDir: dir })
  assert.equal(r.code, 3, r.err)
  assert.match(r.out, /unit: PASS 1/)
  assert.match(r.out, /MISSING layers \(not run, not passed\): static, api, infra/)
  const failing = await cli(['all'])
  assert.equal(failing.code, 2, 'a layer with an invalid manifest makes the whole run exit 2')
})

test('PASS without valid RED proof is downgraded to PENDING in every sibling form', async () => {
  const r = await cli(['nored'])
  assert.equal(r.code, 3)
  const { cases, results } = await readRun(r.resultsRoot, 'nored')
  assert.deepEqual(cases.counts, { PASS: 0, FAIL: 0, ENV: 0, PENDING: 5 })
  assert.equal(results.outcome, 'skipped')
  const byKey = Object.fromEntries(cases.cases.map((c) => [c.itemIds[0], c]))
  assert.match(byKey.none.reason, /no redProof/)
  assert.match(byKey.empty.reason, /log is empty/)
  // The log's directory does not exist either: an absent ancestor is reported as such, never as a plain miss.
  assert.match(byKey.missing.reason, /not found|cannot be inspected \(ENOENT\)/)
  assert.match(byKey.wrongid.reason, /not among/)
  assert.match(byKey.noassert.reason, /no assertion id/)
  for (const c of cases.cases) assert.equal(c.downgradedFrom, 'PASS')
})

test('prod target: writing/mail/model/container/non-prod cases become PENDING: target-policy and never reach run()', async () => {
  const r = await cli(['prodwrite', '--target', 'prod'])
  assert.equal(r.code, 3)
  const { dir, cases } = await readRun(r.resultsRoot, 'prodwrite')
  assert.deepEqual(JSON.parse(await readTextAsync(path.join(dir, 'received.json'))), [
    'QA-PRODWRITE-reader-happy'
  ])
  const byKey = Object.fromEntries(cases.cases.map((c) => [c.itemIds[0], c]))
  assert.equal(byKey.reader.verdict, 'PASS')
  for (const key of ['writer', 'mailer', 'modeler', 'boxer', 'localonly']) {
    assert.equal(byKey[key].verdict, 'PENDING', key)
    assert.match(byKey[key].reason, /^target-policy/, key)
  }
  assert.match(byKey.writer.reason, /writes/)
  const local = await cli(['prodwrite'])
  assert.equal(local.code, 0, 'default local target runs every case that declares local')
})

test('prod target with only blocked cases never calls run()', async () => {
  const r = await cli(['prodwrite', '--target', 'prod', '--area', 'x'])
  assert.equal(r.code, 3)
})

test('result contract violations exit 2 and keep a harness-error record', async () => {
  for (const mode of ['duplicate', 'unsolicited', 'malformed', 'badassertion', 'escape', 'absolute']) {
    process.env.QA_FIXTURE_MODE = mode
    const r = await cli(['contractbreak'])
    assert.equal(r.code, 2, `${mode}: ${r.out}${r.err}`)
    const dir = await latestRunDir(r.resultsRoot, 'contractbreak')
    await fs.access(path.join(dir, 'harness-error.json'))
    await assert.rejects(
      fs.access(path.join(dir, 'complete.json')),
      `${mode}: no completion marker for an invalid run`
    )
  }
  delete process.env.QA_FIXTURE_MODE
})

test('an omitted result is retained as PENDING, not dropped', async () => {
  process.env.QA_FIXTURE_MODE = 'omit'
  const r = await cli(['contractbreak'])
  delete process.env.QA_FIXTURE_MODE
  assert.equal(r.code, 3)
  const { cases } = await readRun(r.resultsRoot, 'contractbreak')
  assert.equal(cases.cases.length, 2)
  assert.match(cases.cases[1].reason, /no result returned/)
})

test('layer exception is a harness error (exit 2), not ENV and not PASS', async () => {
  process.env.QA_FIXTURE_MODE = 'throw'
  const r = await cli(['contractbreak'])
  delete process.env.QA_FIXTURE_MODE
  assert.equal(r.code, 2)
  const { cases, results } = await readRun(r.resultsRoot, 'contractbreak')
  assert.equal(results.outcome, 'failure')
  assert.ok(cases.cases.every((c) => c.verdict === 'PENDING' && /harness error/.test(c.reason)))
})

test('a hanging layer is cancelled on timeout; its late answer is ignored', async () => {
  for (const mode of ['hang', 'late']) {
    process.env.QA_FIXTURE_MODE = mode
    const r = await cli(['contractbreak', '--timeout-ms', '100'])
    assert.equal(r.code, 3, mode)
    const { cases, results } = await readRun(r.resultsRoot, 'contractbreak')
    assert.equal(results.outcome, 'cancelled')
    assert.equal(results.exit_code, null)
    assert.ok(cases.cases.every((c) => c.verdict === 'PENDING' && /cancelled/.test(c.reason)))
    await new Promise((resolve) => setTimeout(resolve, 450))
    assert.deepEqual(
      (await readJson(path.join(await latestRunDir(r.resultsRoot, 'contractbreak'), 'cases.json'))).counts
        .PASS,
      0,
      'late result must not rewrite the run'
    )
  }
  delete process.env.QA_FIXTURE_MODE
})

test('an aborted signal cancels the run', async () => {
  process.env.QA_FIXTURE_MODE = 'hang'
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 50)
  const r = await cli(['contractbreak'], { signal: controller.signal })
  delete process.env.QA_FIXTURE_MODE
  assert.equal(r.code, 3)
  assert.equal((await readRun(r.resultsRoot, 'contractbreak')).results.outcome, 'cancelled')
})

test('empty selection is not a pass: exit 3 and a note', async () => {
  const r = await cli(['good', '--area', 'none'])
  assert.equal(r.code, 3)
  assert.match(r.out, /no cases selected/)
  assert.equal((await readRun(r.resultsRoot, 'good')).results.outcome, 'skipped')
})

test('layer module problems: wrong exported name and symlinked folder exit 2', async () => {
  assert.equal((await cli(['wrongname'])).code, 2)
  const dir = await tmpDir('layers-link')
  await fs.symlink(path.join(FIXTURE_LAYERS, 'good'), path.join(dir, 'good'))
  const r = await cli(['good'], { layersDir: dir })
  assert.equal(r.code, 2)
  assert.match(r.err, /not a directory/)
})

test('output directories: never reused, unique per run, --out must be empty', async () => {
  const resultsRoot = await tmpDir('results-unique')
  const fixedNow = () => new Date('2026-10-05T10:00:00Z')
  const a = await cli(['good'], { resultsRoot, now: fixedNow })
  const b = await cli(['good'], { resultsRoot, now: fixedNow })
  assert.equal(a.code + b.code, 0)
  const names = (await fs.readdir(resultsRoot)).sort()
  assert.deepEqual(names, ['20261005T100000Z-good', '20261005T100000Z-good-2'])
  const out = await tmpDir('out-explicit')
  assert.equal((await cli(['good', '--out', out])).code, 0)
  const again = await cli(['good', '--out', out])
  assert.equal(again.code, 2)
  assert.match(again.err, /not an empty directory/)
})

test('concurrent runs of one layer get distinct directories', async () => {
  const resultsRoot = await tmpDir('results-concurrent')
  const runs = await Promise.all(
    [1, 2, 3, 4].map(() => cli(['good'], { resultsRoot, now: () => new Date('2026-10-05T11:00:00Z') }))
  )
  assert.ok(runs.every((r) => r.code === 0))
  assert.equal(new Set(await fs.readdir(resultsRoot)).size, 4)
})

test('argument errors exit 2 before any import or side effect', async () => {
  const cases = [
    [],
    ['--prove-red'],
    ['good', '--target', 'staging'],
    ['good', '--target'],
    ['good', '--nope'],
    ['good', '--area', 'x', '--area', 'y'],
    ['good', '--out'],
    ['good', '--prove-red=yes'],
    ['good', '--timeout-ms', '0'],
    ['good', '--area', '../x'],
    ['stand'],
    ['stand', 'up'],
    ['stand', 'sideways', '--id', 'x'],
    ['coverage', '--layer', '../x'],
    ['affected', '--base', 'HEAD'],
    ['affected', '--base', '--output=x', '--head', 'HEAD']
  ]
  for (const argv of cases) {
    const r = await cli(argv)
    assert.equal(r.code, 2, JSON.stringify(argv))
    assert.deepEqual(await fs.readdir(r.resultsRoot), [], JSON.stringify(argv))
  }
})

test('a layer that ignores cancellation is not published and stops an `all` run', async () => {
  process.env.QA_FIXTURE_MODE = 'stubborn'
  const r = await cli(['contractbreak', '--timeout-ms', '50'], { cancelGraceMs: 50 })
  delete process.env.QA_FIXTURE_MODE
  assert.equal(r.code, 2)
  assert.match(r.err, /did not stop/)
  const names = (await fs.readdir(r.resultsRoot)).filter((n) => /contractbreak/.test(n))
  for (const name of names) {
    await assert.rejects(fs.stat(path.join(r.resultsRoot, name, 'complete.json')), /ENOENT/)
  }
})

test('two runs racing for one new --out: exactly one gets it', async () => {
  const out = path.join(await tmpDir('out-race'), 'shared')
  const runs = await Promise.all([1, 2, 3].map(() => cli(['good', '--out', out])))
  assert.deepEqual(runs.map((r) => r.code).sort(), [0, 2, 2])
  const results = JSON.parse(await readTextAsync(path.join(out, 'results.json')))
  assert.equal(results.outcome, 'success')
})

test('--out and the results root refuse symlinked path components', async () => {
  const base = await tmpDir('out-link')
  const real = path.join(base, 'real')
  await fs.mkdir(real)
  await fs.symlink(real, path.join(base, 'link'))
  const viaLink = await cli(['good', '--out', path.join(base, 'link', 'run')])
  assert.equal(viaLink.code, 2)
  assert.match(viaLink.err, /symlink/)
  await assert.rejects(fs.stat(path.join(real, 'run')), /ENOENT/)
  const rootLink = await cli(['good'], { resultsRoot: path.join(base, 'link', 'results') })
  assert.equal(rootLink.code, 2)
})

test('an evidence path that is a directory downgrades PASS', async () => {
  process.env.QA_FIXTURE_MODE = 'dirEvidence'
  const r = await cli(['contractbreak'])
  delete process.env.QA_FIXTURE_MODE
  const { cases } = await readRun(r.resultsRoot, 'contractbreak')
  const first = cases.cases.find((c) => c.id.endsWith('one-happy'))
  assert.equal(first.verdict, 'PENDING')
  assert.match(first.reason, /not a regular file/)
})

test('unknown git state is a harness error, never "unknown" provenance', async () => {
  const r = await cli(['good'], {
    git: async () => {
      throw new Error('not a git repository')
    }
  })
  assert.equal(r.code, 2)
  assert.match(r.err, /git revision/)
  assert.deepEqual(await fs.readdir(r.resultsRoot), [])
})
