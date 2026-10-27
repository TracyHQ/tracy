// Selftest of the cms layer machinery: a known-good case passes only with its RED proof, an injected fault is caught,
// a missing dependency is ENV, a case with no RED proof stays PENDING, prod refuses writes, exit codes map, and hostile
// inputs (malformed, empty, symlink, FIFO, duplicate, wrong shape, unwritable output, mutation that does not apply) are
// refused or reported without hanging. Run:  node --test tests/qa/layers/cms/test/selftest.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { probes } from '../lib/probes.mjs'
import { createLayer } from '../index.mjs'
import { generateFiles } from '../generate.mjs'
import {
  applyMutation,
  assertManifests,
  atomicWrite,
  canonicalJson,
  copyTree,
  exitCodeFor,
  loadCaseFiles,
  parseCli,
  readJsonFile,
  runCases,
  ContractError
} from '../lib/kit.mjs'
import { WEB_COPY } from '../lib/helpers.mjs'
import { readTextAsync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../../..')
const BASE = process.env.QA_TASK_ARTIFACTS
  ? path.join(process.env.QA_TASK_ARTIFACTS, 'selftest-cms')
  : path.join(os.tmpdir(), 'qa-cms-selftest')

// Every area is granted by mkdtemp: nothing here deletes a path it did not just create.
const fresh = async (name) => {
  await fs.mkdir(BASE, { recursive: true })
  return fs.mkdtemp(path.join(BASE, `${name}-`))
}
const layer = createLayer()
const byId = async (...ids) => {
  const all = await layer.listCases({})
  return ids.map((id) => {
    const found = all.find((c) => c.id === id)
    assert.ok(found, `case ${id} exists`)
    return found
  })
}
const GOOD = 'QA-CMS-release-assets.download-bad-hash-modified-byte'

test('a known-good case passes only with a RED proof whose log names the failing assertion', async () => {
  const out = await fresh('good')
  const [c] = await byId(GOOD)
  const [r] = await layer.run({ cases: [c], target: 'local', proveRed: true, outDir: out })
  assert.equal(r.verdict, 'PASS', r.reason)
  assert.ok(r.redProof && r.redProof.assertionId === c.assertionIds[0])
  const log = await readTextAsync(path.join(out, r.redProof.log))
  assert.match(log, new RegExp(`assertionId: ${c.assertionIds[0]}`))
  assert.match(log, /result: RED/)
  assert.match(log, /"ok":false/)
  for (const rel of r.evidence) await fs.stat(path.join(out, rel))
})

test('without --prove-red the same case is PENDING, never PASS', async () => {
  const out = await fresh('nored')
  const [c] = await byId(GOOD)
  const [r] = await layer.run({ cases: [c], target: 'local', proveRed: false, outDir: out })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /no RED proof/)
  assert.equal(r.redProof, null)
})

test('an injected fault in the product is caught as FAIL by the same case', async () => {
  const out = await fresh('fault')
  const faulty = await fresh('faulty-tree')
  await copyTree(REPO, faulty, WEB_COPY)
  await applyMutation(faulty, {
    id: 'inject',
    files: [
      { path: 'apps/tracy-web/src/lib/release-assets.js', find: 'got !== sha256', replace: "got === 'never'" }
    ]
  })
  const [c] = await byId(GOOD)
  const [r] = await createLayer({ productRoot: faulty }).run({
    cases: [c],
    target: 'local',
    proveRed: false,
    outDir: out
  })
  assert.equal(r.verdict, 'FAIL', r.reason)
  assert.match(r.reason, /release-assets\.refuses-bytes-that-miss-the-pin/)
})

test('the retired tier-two finding passes under D11: a CMS default is not served for a named quickstart', async () => {
  // CLAUDE.md §1 replaced the three tiers with D11 (always the CMS standard file), so the former finding is the rule now.
  const out = await fresh('finding')
  const [c] = await byId(
    'QA-CMS-build-questions.resolveQuestions-happy-cms-default-not-served-for-a-quickstart'
  )
  const [r] = await layer.run({ cases: [c], target: 'local', proveRed: true, outDir: out })
  assert.equal(r.verdict, 'PASS', r.reason)
  assert.ok(r.redProof, 'a PASS carries a RED proof')
})

test('a missing dependency is ENV and names its probe; a stand case with no QA_STAND_URL never passes', async () => {
  const out = await fresh('env')
  const cases = await byId(
    'QA-CMS-quickstart:ja-nova:j6@1.0.4-fresh-install-read',
    'QA-CMS-quickstart.py.download-archive-path-webroot-parent-traversal',
    'QA-CMS-quickstart:ja-nova:j6@1.0.4-missing-asset-live-pins'
  )
  const empty = { PATH: '' }
  const results = await createLayer({
    env: empty,
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    }
  }).run({ cases, target: 'local', proveRed: true, outDir: out })
  const [stand, py, live] = results
  assert.equal(stand.verdict, 'ENV')
  assert.match(stand.reason, /QA_STAND_URL is not set.*\[probe: stand:url\]/)
  assert.equal(py.verdict, 'ENV')
  assert.match(py.reason, /\[probe: tool:python3\]/)
  assert.equal(live.verdict, 'ENV')
  assert.match(live.reason, /\[probe: net:github\]/)
})

test('GitHub answering 503 is ENV with the status, not a pass and not a FAIL of the product', async () => {
  const out = await fresh('gh503')
  const [c] = await byId('QA-CMS-quickstart:ja-nova:j6@1.0.4-missing-asset-live-pins')
  const l = createLayer({
    env: { ...process.env, QA_RELEASES_TOKEN: 'x' },
    fetchImpl: async () => new Response('down', { status: 503 })
  })
  const [r] = await l.run({ cases: [c], target: 'local', proveRed: true, outDir: out })
  assert.equal(r.verdict, 'ENV')
  assert.match(r.reason, /503/)
})

test('a live pin check FAILs when GitHub states another sha256 than the pin, and PASSes only with RED when it matches', async () => {
  const [c] = await byId('QA-CMS-quickstart:ja-nova:j6@1.0.4-missing-asset-live-pins')
  const manifest = JSON.parse(await readTextAsync(path.join(REPO, c.dimensions.dir, 'manifest.json')))
  const part = Object.values(manifest.quickstart.parts)[0]
  const github = (digest) => async (url) => {
    if (String(url).includes('/rate_limit')) return new Response('{}', { status: 200 })
    if (String(url).includes('/releases/tags/'))
      return new Response(
        JSON.stringify({
          tag_name: manifest.quickstart.release,
          assets: [{ name: part.file, id: 9, size: part.bytes, digest }]
        }),
        { status: 200 }
      )
    return new Response('x', { status: 404 })
  }
  const env = { ...process.env, QA_RELEASES_TOKEN: 'x' }
  const [bad] = await createLayer({ env, fetchImpl: github(`sha256:${'0'.repeat(64)}`) }).run({
    cases: [c],
    target: 'local',
    proveRed: false,
    outDir: await fresh('livebad')
  })
  assert.equal(bad.verdict, 'FAIL', bad.reason)
  assert.match(bad.reason, /GitHub states sha256/)
  const out = await fresh('livegood')
  const [good] = await createLayer({ env, fetchImpl: github(`sha256:${part.sha256}`) }).run({
    cases: [c],
    target: 'local',
    proveRed: true,
    outDir: out
  })
  assert.equal(good.verdict, 'PASS', good.reason)
  assert.ok(good.redProof)
})

test('prod refuses every case that writes; read-only live cases are the only candidates', async () => {
  const out = await fresh('prod')
  const cases = await byId(
    GOOD,
    'QA-CMS-quickstart:ja-nova:j6@1.0.4-fresh-install-read',
    'QA-CMS-quickstart:ja-nova:j6@1.0.4-missing-asset-live-pins'
  )
  const results = await layer.run({ cases, target: 'prod', proveRed: false, outDir: out })
  assert.match(results[0].reason, /target-policy/)
  assert.equal(results[0].verdict, 'PENDING')
  assert.match(results[1].reason, /target-policy/)
  assert.notEqual(
    results[2].reason.startsWith('target-policy'),
    true,
    'a declared read-only case is not refused by policy'
  )
})

test('exit codes: all PASS 0, any FAIL 1, ENV/PENDING only 3', () => {
  const r = (verdict) => ({ id: 'x', verdict })
  assert.equal(exitCodeFor([r('PASS')]), 0)
  assert.equal(exitCodeFor([r('PASS'), r('FAIL'), r('ENV')]), 1)
  assert.equal(exitCodeFor([r('PASS'), r('ENV')]), 3)
  assert.equal(exitCodeFor([r('PENDING')]), 3)
})

test('the CLI refuses unknown flags, targets and areas with exit 2 before running anything', () => {
  const entry = path.join(HERE, '../run.mjs')
  for (const args of [['--bogus'], ['--target', 'moon'], ['--area', 'nowhere'], ['--out']]) {
    const r = spawnSync('node', [entry, ...args], { encoding: 'utf8', timeout: 60_000 })
    assert.equal(r.status, 2, `${args.join(' ')} -> ${r.status}`)
  }
  assert.throws(() => parseCli(['--area'], { areas: ['a'] }), ContractError)
})

test('hostile case files are refused: malformed, empty, wrong type, symlink, FIFO, duplicate id, extra key', async () => {
  const dir = await fresh('hostile')
  const cases = path.join(dir, 'cases')
  await fs.mkdir(cases)
  const valid = (await layer.listCases({}))[0]
  const put = (name, text) => fs.writeFile(path.join(cases, name), text)
  const expectRefused = async (label, pattern) => {
    await assert.rejects(
      () => loadCaseFiles(cases, 'CMS'),
      (e) => e instanceof ContractError && pattern.test(`${e.message} ${e.problems.join(' ')}`),
      label
    )
    await fs.rm(cases, { recursive: true, force: true })
    await fs.mkdir(cases)
  }
  await put('a.json', '{ not json')
  await expectRefused('malformed', /malformed JSON/)
  await put('a.json', '   \n')
  await expectRefused('empty', /empty file/)
  await put('a.json', '{"id":"x"}')
  await expectRefused('object instead of array', /must be a JSON array/)
  await put('a.json', JSON.stringify([{ ...valid, extra: 1 }]))
  await expectRefused('extra key', /unknown key extra/)
  await put('a.json', JSON.stringify([valid, valid]))
  await expectRefused('duplicate id', /duplicate case id/)
  await put('a.json', JSON.stringify([{ ...valid, assertionIds: [] }]))
  await expectRefused('no assertion', /assertionIds/)
  await fs.symlink(path.join(REPO, 'package.json'), path.join(cases, 'a.json'))
  await expectRefused('symlink', /not a regular file/)
  const fifo = spawnSync('mkfifo', [path.join(cases, 'a.json')])
  if (fifo.status === 0) await expectRefused('fifo (must not hang)', /not a regular file/)
  assert.throws(
    () => assertManifests([{ ...valid, id: 'QA-OTHER-x' }], 'CMS'),
    (e) => e instanceof ContractError && e.problems.join(' ').includes('must start with QA-CMS-')
  )
})

test('a mutation that does not apply, or breaks an import, is never RED proof', async () => {
  const out = await fresh('badmut')
  const manifest = (id, mutation) => ({
    id,
    itemIds: ['x'],
    requirement: 'r',
    oracle: { source: 's', ref: 'r', invariant: 'i' },
    edgeTags: ['happy'],
    targets: ['local'],
    effects: { reads: [], writes: [], mail: false, model: false, containers: false },
    prerequisites: [],
    assertionIds: ['synthetic.assertion'],
    fixtures: mutation ? [`mutation:${mutation}`] : [],
    redProof: null,
    legacyIds: []
  })
  const root = await fresh('synthetic-root')
  await fs.writeFile(path.join(root, 'prod.mjs'), 'export const answer = () => 42\n')
  const registry = {
    'synthetic.assertion': {
      async execute(ctx) {
        const mod = await import(`file://${path.join(ctx.root, 'prod.mjs')}?${Math.random()}`).catch((e) => {
          throw Object.assign(new Error(`cannot import: ${e.message}`), { name: 'HarnessError' })
        })
        return {
          control: { ok: true, detail: 'c' },
          check: { ok: mod.answer() === 42, detail: String(mod.answer()) }
        }
      },
      mutations: {
        'no-match': {
          id: 'no-match',
          kind: 'product',
          copy: ['prod.mjs'],
          files: [{ path: 'prod.mjs', find: 'nothing like this', replace: 'x' }]
        },
        'syntax-error': {
          id: 'syntax-error',
          kind: 'product',
          copy: ['prod.mjs'],
          files: [{ path: 'prod.mjs', find: 'export const', replace: 'export const = =' }]
        },
        'real-break': {
          id: 'real-break',
          kind: 'product',
          copy: ['prod.mjs'],
          files: [{ path: 'prod.mjs', find: '42', replace: '41' }]
        }
      }
    }
  }
  const cases = [
    manifest('QA-CMS-synthetic-happy-nomatch', 'no-match'),
    manifest('QA-CMS-synthetic-happy-syntax', 'syntax-error'),
    manifest('QA-CMS-synthetic-happy-real', 'real-break'),
    manifest('QA-CMS-synthetic-happy-none', null)
  ]
  const results = await runCases({
    layer: 'cms',
    cases,
    target: 'local',
    proveRed: true,
    outDir: out,
    registry,
    probes: {},
    repoRoot: root
  })
  const byCase = Object.fromEntries(results.map((r) => [r.id, r]))
  assert.equal(byCase['QA-CMS-synthetic-happy-nomatch'].verdict, 'PENDING')
  assert.match(byCase['QA-CMS-synthetic-happy-nomatch'].reason, /exactly one match/)
  assert.equal(byCase['QA-CMS-synthetic-happy-syntax'].verdict, 'PENDING')
  assert.match(byCase['QA-CMS-synthetic-happy-syntax'].reason, /invalid|cannot import/)
  assert.equal(byCase['QA-CMS-synthetic-happy-real'].verdict, 'PASS')
  assert.equal(byCase['QA-CMS-synthetic-happy-none'].verdict, 'PENDING')
  assert.match(byCase['QA-CMS-synthetic-happy-none'].reason, /names no mutation/)
})

test('a case whose positive control fails is TEST_INVALID, never PASS or FAIL', async () => {
  const out = await fresh('control')
  const registry = {
    'synthetic.assertion': {
      async execute() {
        return { control: { ok: false, detail: 'control broke' }, check: { ok: false, detail: 'x' } }
      },
      mutations: {}
    }
  }
  const c = {
    id: 'QA-CMS-synthetic-happy-control',
    itemIds: ['x'],
    requirement: 'r',
    oracle: { source: 's', ref: 'r', invariant: 'i' },
    edgeTags: ['happy'],
    targets: ['local'],
    effects: { reads: [], writes: [], mail: false, model: false, containers: false },
    prerequisites: [],
    assertionIds: ['synthetic.assertion'],
    fixtures: [],
    redProof: null,
    legacyIds: []
  }
  const [r] = await runCases({
    layer: 'cms',
    cases: [c],
    target: 'local',
    proveRed: true,
    outDir: out,
    registry,
    probes: {},
    repoRoot: REPO
  })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /TEST_INVALID: positive control failed/)
})

test('atomic writes leave no partial file, and an unwritable output directory is a refusal, not a report', async () => {
  const dir = await fresh('atomic')
  const target = path.join(dir, 'ro', 'file.json')
  await fs.mkdir(path.dirname(target))
  await fs.chmod(path.dirname(target), 0o500)
  try {
    if (process.getuid?.() !== 0) {
      await assert.rejects(() => atomicWrite(target, 'x'))
      assert.deepEqual(await fs.readdir(path.dirname(target)), [])
    }
  } finally {
    await fs.chmod(path.dirname(target), 0o700)
  }
  const ok = path.join(dir, 'ok.json')
  await atomicWrite(ok, '{"a":1}')
  assert.deepEqual(await readJsonFile(ok), { a: 1 })
  assert.deepEqual(
    (await fs.readdir(dir)).filter((n) => n.endsWith('.tmp')),
    []
  )
  if (process.getuid?.() !== 0) {
    const roOut = path.join(dir, 'ro')
    await fs.chmod(roOut, 0o500)
    try {
      const r = spawnSync(
        'node',
        [path.join(HERE, '../run.mjs'), '--area', 'legacy', '--out', path.join(roOut, 'nested')],
        { encoding: 'utf8', timeout: 60_000 }
      )
      assert.equal(r.status, 2)
    } finally {
      await fs.chmod(roOut, 0o700)
    }
  }
})

test('cases/ and denominator.json on disk are exactly what the tree generates, and a stale case is refused at run time', async () => {
  const { files } = generateFiles()
  for (const [rel, content] of Object.entries(files))
    assert.equal(await readTextAsync(path.join(HERE, '..', rel)), content, rel)
  const [c] = await byId(GOOD)
  await assert.rejects(
    () =>
      layer.run({
        cases: [{ ...c, requirement: 'edited by hand' }],
        target: 'local',
        proveRed: false,
        outDir: path.join(BASE, 'stale')
      }),
    (e) => e instanceof ContractError && /stale/.test(e.message)
  )
})

test('every manifest id is unique, every item it names is in the denominator, and no obligation is silently dropped', async () => {
  const all = await layer.listCases({})
  const denominator = await layer.denominator()
  const items = new Set(denominator.items.map((i) => i.id))
  assert.equal(new Set(all.map((c) => c.id)).size, all.length)
  for (const c of all) for (const item of c.itemIds) assert.ok(items.has(item), `${c.id} -> ${item}`)
  const cov = await layer.coverage({})
  assert.equal(cov.totals.obligations, cov.totals.na + cov.totals.open + cov.totals.implemented)
  assert.equal(cov.complete, false, 'unresolved sources keep the inventory incomplete')
  assert.ok(denominator.unresolved.length > 0)
})

test('a process that ignores SIGTERM or floods output is bounded by spawnBounded', async () => {
  const { spawnBounded } = await import('../lib/kit.mjs')
  const slow = await spawnBounded({
    argv: ['node', '-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],
    timeoutMs: 800
  })
  assert.equal(slow.timedOut, true)
  const flood = await spawnBounded({
    argv: ['node', '-e', "for(;;)require('fs').writeSync(1,'x'.repeat(65536))"],
    timeoutMs: 20_000,
    maxBytes: 100_000
  })
  assert.equal(flood.truncated, true)
  assert.ok(flood.stdout.length <= 100_000)
  assert.equal(
    canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }),
    '{\n  "a": [\n    {\n      "c": 2,\n      "d": 1\n    }\n  ],\n  "b": 1\n}\n'
  )
})

test('a legacy suite verdict comes only from the process, never from what it printed: every outcome is PENDING with its kind', async () => {
  const { classifyRun, countsOf } = await import('../specs/legacy.mjs')
  const ok = { exit: 0, signal: null, timedOut: false, stdout: '', stderr: '' }
  const tap = (n, skipped = 0) =>
    countsOf('node', `# tests ${n}\n# pass ${n - skipped}\n# skipped ${skipped}\n`)
  const hostile =
    "Cannot find package 'qa-nope-xyz'; ModuleNotFoundError: No module named 'os; open(1)'; jq: command not found"
  const table = [
    [{ ...ok, spawnError: 'spawn x ENOENT', exit: null }, tap(0), 'invalid'],
    [{ ...ok, truncated: true, exit: 1 }, tap(3), 'invalid'],
    [{ ...ok, timedOut: true, exit: null }, tap(3), 'invalid'],
    [{ ...ok, signal: 'SIGKILL', exit: null }, tap(3), 'invalid'],
    [{ ...ok, exit: undefined }, tap(3), 'invalid'],
    [{ ...ok, exit: 1, stdout: hostile }, tap(3), 'nonzero'],
    [{ ...ok, exit: 0 }, tap(0), 'zero'],
    [{ ...ok, exit: 0 }, countsOf('node', ''), 'zero'],
    [{ ...ok, exit: 0 }, tap(3, 1), 'skipped'],
    [{ ...ok, exit: 0, stdout: hostile }, tap(3), 'green']
  ]
  for (const [run, counts, kind] of table) {
    const v = classifyRun(run, counts)
    assert.equal(v.kind, kind, JSON.stringify(run))
    assert.equal(v.verdict, 'PENDING')
    if (kind === 'invalid') assert.match(v.reason, /^TEST_INVALID/)
  }
  // nothing the old attribution exported is left to call
  const mod = await import('../specs/legacy.mjs')
  for (const gone of ['dependencyGap', 'missingDependency', 'failureBlocks', 'unittestBlocks', 'blocksFor'])
    assert.equal(mod[gone], undefined, `${gone} still exists`)
})

test('a legacy suite that fails on a dependency-looking message is PENDING, its scratch folder is removed and a pre-existing file survives', async () => {
  const { runLegacySuite } = await import('../specs/legacy.mjs')
  await fs.mkdir(BASE, { recursive: true })
  const dir = await fs.mkdtemp(path.join(BASE, 'legacy-'))
  const suite = path.join(dir, 'x.test.mjs')
  await fs.writeFile(
    suite,
    "import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('a', () => { assert.fail(\"Cannot find package 'qa-nope-xyz'\") })\ntest('b', () => { assert.equal(process.env.TMPDIR.includes('qa-cms-legacy-'), true); console.log('TMP=' + process.env.TMPDIR) })\n"
  )
  const keepDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-selftest-keep-'))
  const preexisting = path.join(keepDir, 'sentinel.txt')
  await fs.writeFile(preexisting, 'not ours')
  try {
    const out = path.join(dir, 'out')
    const r = await runLegacySuite({
      params: { file: suite, runner: 'node' },
      repoRoot: dir,
      outDir: out,
      caseId: 'QA-CMS-legacy-fake',
      env: process.env
    })
    assert.equal(r.verdict, 'PENDING', r.reason)
    assert.match(r.reason, /neither FAIL nor ENV/)
    const log = await readTextAsync(path.join(out, r.evidence[0]))
    const tmp = /TMP=(\S+)/.exec(log)?.[1]
    assert.ok(tmp, log.slice(0, 300))
    await assert.rejects(() => fs.stat(tmp), 'the run scratch folder was left behind')
    assert.equal(await readTextAsync(preexisting), 'not ours')
  } finally {
    await fs.rm(keepDir, { recursive: true, force: true })
    await fs.rm(dir, { recursive: true, force: true })
  }
})

test('a tool probe says ENV only when the OS reports the executable missing; a failing, hanging or odd answer is inconclusive', async () => {
  const bin = await fresh('probe-bin')
  const env = { PATH: bin }
  const absent = await probes['tool:php']({ env })
  assert.ok(absent && !absent.inconclusive, 'ENOENT is absence')
  assert.match(absent.reason, /ENOENT/)
  await fs.writeFile(path.join(bin, 'php'), '#!/bin/sh\nexit 3\n', { mode: 0o755 })
  const broken = await probes['tool:php']({ env: { PATH: `${bin}:/bin` } })
  assert.equal(broken.inconclusive, true, 'a nonzero --version is not absence')
  await fs.writeFile(path.join(bin, 'php'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  assert.equal(await probes['tool:php']({ env: { PATH: `${bin}:/bin` } }), null)
})
