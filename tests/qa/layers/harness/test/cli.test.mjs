/** The command line and the contract: bad usage is exit 2 before any side effect. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import {
  UsageError,
  assertManifests,
  checkOutDir,
  listCases,
  loadManifests,
  manifestProblems,
  shardProblems
} from '../index.mjs'
import { parseArgs } from '../run.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const RUN = path.join(here, '..', 'run.mjs')
const base = fs.mkdtempSync(path.join(process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir(), 'cli-'))
after(() => fs.rmSync(base, { recursive: true, force: true }))

const cli = (...args) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', timeout: 30000 })

test('parseArgs refuses an unknown flag and a flag without its value', () => {
  assert.throws(() => parseArgs(['--nope']), UsageError)
  assert.throws(() => parseArgs(['--target']), /needs a value/)
  assert.throws(() => parseArgs(['--target', '--prove-red']), /needs a value/)
  assert.deepEqual(parseArgs(['--prove-red', '--target', 'local']), { 'prove-red': true, target: 'local' })
})

test('exit 2: unknown flag, unknown target, unknown area, bad --jobs', () => {
  for (const args of [
    ['--bogus'],
    ['--target', 'mars'],
    ['--target', 'dev'],
    ['--target', 'prod'],
    ['--area', 'no-such-area-zzz'],
    ['--jobs', '0'],
    ['--jobs', 'x']
  ]) {
    const r = cli(...args, '--out', path.join(base, 'never'))
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`)
  }
  assert.equal(fs.existsSync(path.join(base, 'never')), false, 'refused before any side effect')
})

test('exit 2: an output path that is not ours to write', () => {
  const foreign = path.join(base, 'foreign')
  fs.mkdirSync(foreign)
  fs.writeFileSync(path.join(foreign, 'precious.txt'), 'keep')
  assert.throws(() => checkOutDir(foreign), /not empty and was not made by this layer/)
  assert.throws(() => checkOutDir(path.join(here, '..')), /inside the repository but outside qa-results/)
  assert.throws(() => checkOutDir('/'), /unsafe output path/)
  const file = path.join(base, 'afile')
  fs.writeFileSync(file, 'x')
  assert.throws(() => checkOutDir(file), /not a folder/)
  assert.equal(cli('--out', foreign).status, 2)
  assert.equal(readTextSync(path.join(foreign, 'precious.txt')), 'keep', 'nothing was written into it')
})

test('a malformed or incomplete manifest is a contract error, never skipped', () => {
  const dir = path.join(base, 'cases')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'a.json'), '{not json')
  assert.throws(() => loadManifests(dir), /not valid JSON/)
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify([{ id: 'QA-HARNESS-x' }]))
  assert.throws(() => loadManifests(dir), /lacks itemIds/)
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ id: 'x' }))
  assert.throws(() => loadManifests(dir), /must hold a list/)
  assert.throws(() => loadManifests(path.join(base, 'absent')), /no case manifests/)
})

test('the shipped manifests load, ids are unique and the nine live cases are there', async () => {
  const all = await listCases()
  assert.ok(all.length > 300)
  assert.equal(new Set(all.map((m) => m.id)).size, all.length)
  const live = all.filter((m) => m.assertionIds[0].startsWith('harness.live.'))
  assert.equal(live.length, 9)
  assert.deepEqual([...new Set(live.map((m) => m.assertionIds[0].split('.')[2]))].sort(), [
    'emdash',
    'joomla',
    'wordpress'
  ])
  assert.deepEqual([...new Set(live.map((m) => m.assertionIds[0].split('.')[3]))].sort(), [
    'content-edit',
    'file-edit',
    'out-of-bounds'
  ])
  for (const m of live) assert.deepEqual(m.edgeTags, [], 'a live case never credits a coverage cell')
  const fence = await listCases({ area: 'fence' })
  assert.ok(fence.length > 0)
  assert.equal(
    fence.filter((m) => m.family === 'fence').length,
    all.filter((m) => m.family === 'fence').length,
    'the whole family is selected'
  )
  assert.ok(
    fence.every(
      (m) => m.family === 'fence' || m.id.includes('fence') || m.itemIds.some((i) => i.includes('fence'))
    )
  )
})

test('--list style filtering by item or id fragment works', async () => {
  const some = await listCases({ area: 'write-path-apply-emdash' })
  assert.ok(some.length >= 1)
})

test('importing run.mjs neither runs the CLI nor writes output nor ends the process', () => {
  const before = fs.existsSync(path.join(process.cwd(), 'qa-results'))
    ? fs.readdirSync(path.join(process.cwd(), 'qa-results')).length
    : -1
  const r = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(RUN)}); console.log(typeof m.parseArgs, 'alive')`
    ],
    { encoding: 'utf8', timeout: 30000, cwd: process.cwd() }
  )
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /function alive/)
  const after = fs.existsSync(path.join(process.cwd(), 'qa-results'))
    ? fs.readdirSync(path.join(process.cwd(), 'qa-results')).length
    : -1
  assert.equal(after, before, 'no qa-results output created by an import')
})

const good = () => ({
  id: 'QA-HARNESS-x-happy',
  itemIds: ['x'],
  requirement: 'r',
  oracle: { source: 's', ref: 'r', invariant: 'i' },
  edgeTags: ['happy'],
  targets: ['local'],
  effects: { reads: [], writes: [], mail: false, model: false, containers: false },
  prerequisites: [],
  assertionIds: ['a.b'],
  redProof: null,
  legacyIds: []
})

test('manifestProblems: null, wrong types, empty assertionIds and bad oracle are each a contract error', () => {
  assert.deepEqual(manifestProblems(good()), [])
  const bad = [
    null,
    [],
    'x',
    { ...good(), assertionIds: [] },
    { ...good(), assertionIds: [''] },
    { ...good(), effects: { ...good().effects, writes: 'scratch' } },
    { ...good(), effects: null },
    { ...good(), oracle: { source: 's' } },
    { ...good(), targets: ['mars'] },
    { ...good(), targets: [] },
    { ...good(), itemIds: 'x' },
    { ...good(), edgeTags: [1] },
    { ...good(), requirement: '' },
    { ...good(), redProof: 7 },
    { ...good(), id: 'bad id' }
  ]
  for (const m of bad) assert.ok(manifestProblems(m).length > 0, JSON.stringify(m))
  assert.throws(() => assertManifests([good(), good()], 'x'), /duplicate case ids/)
  assert.throws(() => assertManifests({}, 'x'), /must hold a list/)
})

test('exit 2: --cases-file that is broken JSON or holds a malformed manifest, before any output', () => {
  const broken = path.join(base, 'broken.json')
  fs.writeFileSync(broken, '{nope')
  const nul = path.join(base, 'null.json')
  fs.writeFileSync(nul, '[null]')
  const out = path.join(base, 'cases-file-out')
  for (const file of [broken, nul, path.join(base, 'absent.json')]) {
    const r = cli('--cases-file', file, '--out', out)
    assert.equal(r.status, 2, `${file}: ${r.stderr}`)
  }
  assert.equal(fs.existsSync(out), false)
})

test('output ownership: a symlink, a marker that is not ours and a link out of qa-results are refused', () => {
  const real = path.join(base, 'real-out')
  fs.mkdirSync(real)
  const link = path.join(base, 'link-out')
  fs.symlinkSync(real, link)
  assert.throws(() => checkOutDir(link), /symbolic link/)
  const impostor = path.join(base, 'impostor')
  fs.mkdirSync(impostor)
  fs.writeFileSync(path.join(impostor, '.qa-harness-out'), 'something else')
  fs.writeFileSync(path.join(impostor, 'precious.txt'), 'keep')
  assert.throws(() => checkOutDir(impostor), /not made by this layer/)
  const marked = path.join(base, 'marked')
  fs.mkdirSync(marked)
  fs.writeFileSync(path.join(marked, '.qa-harness-out'), 'qa harness layer output\n')
  assert.equal(checkOutDir(marked), marked)
  const repoRoot = path.resolve(here, '../../../..')
  const viaLink = path.join(base, 'to-repo')
  fs.symlinkSync(repoRoot, viaLink)
  assert.throws(() => checkOutDir(path.join(viaLink, 'src-nowhere')), /inside the repository/)
})

test('shardProblems: a worker whose results do not match what it was given cannot be trusted', () => {
  const shard = [{ id: 'A' }, { id: 'B' }]
  const ok = [
    { id: 'A', verdict: 'PASS', reason: 'x' },
    { id: 'B', verdict: 'FAIL', reason: 'y' }
  ]
  assert.deepEqual(shardProblems(ok, shard, 1), [])
  assert.ok(
    shardProblems(ok, shard, 0).some((p) => /exit code/.test(p)),
    'exit code must follow the verdicts'
  )
  assert.ok(shardProblems([ok[0]], shard, 0).some((p) => /missing/.test(p)))
  assert.ok(shardProblems([...ok, ok[0]], shard, 1).some((p) => /duplicate/.test(p)))
  assert.ok(
    shardProblems([...ok, { id: 'Z', verdict: 'PASS' }], shard, 1).some((p) => /not asked for/.test(p))
  )
  assert.ok(
    shardProblems([{ id: 'A', verdict: 'MAYBE', reason: 'x' }, ok[1]], shard, 1).some((p) =>
      /verdict/.test(p)
    )
  )
  assert.ok(shardProblems({}, shard, 0).length > 0)
})
