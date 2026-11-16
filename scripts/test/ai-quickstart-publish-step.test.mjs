// The publish step of an AI quickstart (ticket #588): it goes through `publishVerified`, builds the asset set only on
// a verified passing record, writes it locally in a dry run (the default) and uploads to the human quickstart's own
// release only when told to, and pins exactly what it published. The record is one the gate really made on the
// invented florist kit (as the guard's tests make it); `gh` is a fake that records what it was asked.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { resolvePinnedAiQuickstart } from '../../packages/wo/website-opportunities/domain/ai-quickstart-pin.mjs'
import { kitFilesSha256, kitHashesOf } from '../ai-quickstart/gate/record.mjs'
import { verdictFromRecord } from '../ai-quickstart/gate/record-verdict.mjs'
import {
  RECORD_FILE,
  VERDICT_FILE,
  recordText,
  verdictFileOf
} from '../ai-quickstart/gate/release-binding.mjs'
import { releaseGate } from '../ai-quickstart/gate/release-gate.mjs'
import { publishKit } from '../ai-quickstart/publish/publish-step.mjs'
import { floristGate } from './fixtures/ai-quickstart-gate/florist-gate.mjs'

const sha = (text) => createHash('sha256').update(text).digest('hex')
const HUMAN = 'invented human quickstart'
const BLANK = 'invented blank site archive'
const REPO = 'Example-Org/example-products'
const TAG = 'quickstart/example-petal/j6'
const HUMAN_FILE = 'example-petal-j6-quickstart-1.0.0.zip'

async function tree({ reset = true, site = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'publish-step-'))
  mkdirSync(path.join(root, 'apps/tracy-web/src'), { recursive: true })
  const url =
    'https://github.com/' + REPO + '/releases/download/' + encodeURIComponent(TAG) + '/' + HUMAN_FILE
  const entry = {
    version: '1.0.0',
    installer: { file: HUMAN_FILE, sha256: sha(HUMAN), url },
    cowork: { version: '1.0.0' }
  }
  writeFileSync(
    path.join(root, 'apps/tracy-web/src/quickstarts.json'),
    JSON.stringify({ 'quickstart/example-petal/j6': entry })
  )
  const kits = path.join(root, 'packages/cms/example-quickstart/ai-quickstarts')
  const folder = path.join(kits, 'example-petal', 'j6', '1.0.0')
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  const manifest = {
    schema: 'tracy-ai-quickstart-kit/v1',
    template: { slug: 'example-petal', version: '1.0.0' }
  }
  if (site) manifest.site = { platform: 'joomla', design: 'petal', quickstart: TAG + '/1.0.0' }
  writeFileSync(path.join(folder, 'kit-manifest.json'), JSON.stringify(manifest))
  writeFileSync(path.join(folder, 'mapping.json'), '{"template":{"slug":"example-petal"}}\n')
  const human = path.join(root, HUMAN_FILE)
  writeFileSync(human, HUMAN)
  const s = floristGate({
    inputs: { blankSite: { sha256: sha(BLANK) }, humanQuickstart: { sha256: sha(HUMAN) } },
    reset
  })
  s.input.out = null
  let record
  try {
    record = (await releaseGate(s.input)).record
  } finally {
    s.done()
  }
  record.kitFiles = kitHashesOf(folder)
  record.binding.kitFilesSha256 = kitFilesSha256(record.kitFiles)
  record.verdict = { ...record.verdict, ...verdictFromRecord(record) }
  // What `gate.mjs --into-kit` does at the end of its run: the record and its verdict file in the kit folder.
  const runGate = async () => {
    writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
    writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdictFileOf(record), null, 1))
    return { record }
  }
  const plan = async () => ({
    places: record.places.map((p) => [p.key, p.account]),
    probed: record.measurements.writeSafety.placeKeys ?? []
  })
  const buildBlankSite = async ({ out }) => {
    mkdirSync(path.join(out, 'blank'), { recursive: true })
    const file = path.join(out, 'blank', 'example-petal-blank-1.0.0.zip')
    writeFileSync(file, BLANK)
    return file
  }
  return { root, kits, folder, human, out: path.join(root, 'out'), deps: { runGate, plan, buildBlankSite } }
}

function fakeGh(names = [HUMAN_FILE, 'SHA256SUMS', 'manifest.json']) {
  const calls = []
  const gh = (args) => {
    calls.push(args)
    if (args[1] === 'view') return JSON.stringify({ assets: names.map((name) => ({ name })) })
    return ''
  }
  return { calls, gh }
}

test('a dry run publishes the asset set locally, named apart from the human quickstart, and uploads nothing', async () => {
  const t = await tree()
  const g = fakeGh()
  const r = await publishKit({
    folder: t.folder,
    human: t.human,
    out: t.out,
    root: t.root,
    deps: { ...t.deps, gh: g.gh }
  })
  assert.deepEqual(r.problems, [])
  assert.equal(r.published, true)
  assert.equal(r.uploaded, false)
  assert.deepEqual(r.release, { repo: REPO, tag: TAG, humanFile: HUMAN_FILE })
  const names = r.assets.map((a) => a.name)
  for (const n of names) assert.ok(n.startsWith('ai-quickstart-example-petal-j6-1.0.0.'), n)
  for (const n of [
    'blank-site.zip',
    'kit-manifest.json',
    'mapping.json',
    'check-record.record.json',
    'manifest.json'
  ])
    assert.ok(names.includes('ai-quickstart-example-petal-j6-1.0.0.' + n), n)
  assert.deepEqual(readdirSync(path.join(t.out, 'assets')).sort(), [...names].sort())
  const manifest = JSON.parse(
    readFileSync(path.join(t.out, 'assets', 'ai-quickstart-example-petal-j6-1.0.0.manifest.json'), 'utf8')
  )
  for (const a of manifest.assets)
    assert.equal(sha(readFileSync(path.join(t.out, 'assets', a.name))), a.sha256, a.name)
  assert.deepEqual(
    g.calls.map((c) => c[1]),
    ['view']
  )
  assert.ok(existsSync(path.join(t.out, 'pin.json')))
  assert.ok(!existsSync(path.join(t.kits, 'pins.json')), 'a dry run pins nothing')
  rmSync(t.root, { recursive: true, force: true })
})

test('with upload, the assets go to the human quickstart release and the pin a build resolves is written', async () => {
  const t = await tree()
  const g = fakeGh()
  const r = await publishKit({
    folder: t.folder,
    human: t.human,
    out: t.out,
    root: t.root,
    upload: true,
    deps: { ...t.deps, gh: g.gh }
  })
  assert.equal(r.uploaded, true)
  const upload = g.calls.find((c) => c[1] === 'upload')
  assert.equal(upload[2], TAG)
  assert.deepEqual(upload.slice(-2), ['--repo', REPO])
  assert.ok(!upload.includes('--clobber'))
  assert.equal(upload.length - 5, r.assets.length)
  const pinned = resolvePinnedAiQuickstart({ root: t.kits, slug: 'example-petal', cms: 'j6' })
  assert.equal(pinned.ok, true, JSON.stringify(pinned.problems))
  assert.equal(pinned.version, '1.0.0')
  assert.equal(pinned.pin.blankSite.sha256, sha(BLANK))
  rmSync(t.root, { recursive: true, force: true })
})

test('a kit naming no site, a human quickstart that is not the pinned one, or a taken release refuse before the gate', async () => {
  let ran = 0
  const count = (deps) => ({ ...deps, runGate: async (i) => (ran++, deps.runGate(i)) })
  const noSite = await tree({ site: false })
  const a = await publishKit({
    folder: noSite.folder,
    human: noSite.human,
    out: noSite.out,
    root: noSite.root,
    deps: { ...count(noSite.deps), gh: fakeGh().gh }
  })
  assert.deepEqual(
    a.problems.map((p) => p.code),
    ['no_site']
  )
  const t = await tree()
  writeFileSync(t.human, 'another installer')
  const b = await publishKit({
    folder: t.folder,
    human: t.human,
    out: t.out,
    root: t.root,
    deps: { ...count(t.deps), gh: fakeGh().gh }
  })
  assert.deepEqual(
    b.problems.map((p) => p.code),
    ['human_quickstart_not_pinned']
  )
  writeFileSync(t.human, HUMAN)
  const taken = fakeGh(['SHA256SUMS', 'ai-quickstart-example-petal-j6-1.0.0.mapping.json'])
  const c = await publishKit({
    folder: t.folder,
    human: t.human,
    out: t.out,
    root: t.root,
    deps: { ...count(t.deps), gh: taken.gh }
  })
  assert.deepEqual(
    c.problems.map((p) => p.code),
    ['human_quickstart_not_in_release', 'already_published']
  )
  const d = await publishKit({
    folder: t.folder,
    human: t.human,
    out: t.out,
    root: t.root,
    upload: true,
    deps: { ...count(t.deps), gh: null }
  })
  assert.deepEqual(
    d.problems.map((p) => p.code),
    ['release_not_read']
  )
  assert.equal(ran, 0)
  rmSync(noSite.root, { recursive: true, force: true })
  rmSync(t.root, { recursive: true, force: true })
})

test('a record that does not pass is refused by publishVerified, and nothing is written or uploaded', async () => {
  const t = await tree({ reset: false })
  const g = fakeGh()
  const r = await publishKit({
    folder: t.folder,
    human: t.human,
    out: t.out,
    root: t.root,
    upload: true,
    deps: { ...t.deps, gh: g.gh }
  })
  assert.equal(r.published, false)
  assert.ok(
    r.problems.some((p) => p.code === 'not_passed'),
    r.problems.map((p) => p.code).join(', ')
  )
  assert.ok(!existsSync(path.join(t.out, 'assets')))
  assert.deepEqual(
    g.calls.map((c) => c[1]),
    ['view']
  )
  assert.ok(!existsSync(path.join(t.kits, 'pins.json')))
  rmSync(t.root, { recursive: true, force: true })
})

test('a gate run that writes no record is refused (gate_failed)', async () => {
  const t = await tree()
  const deps = {
    ...t.deps,
    gh: fakeGh().gh,
    runGate: async () => {
      throw new Error('the gate wrote no record: no site')
    }
  }
  const r = await publishKit({ folder: t.folder, human: t.human, out: t.out, root: t.root, deps })
  assert.deepEqual(
    r.problems.map((p) => p.code),
    ['gate_failed']
  )
  rmSync(t.root, { recursive: true, force: true })
})
