// F9: the distributable is what gets installed, so the packer must refuse to leak runtime state
// or secrets, must refuse an artifact missing a required asset, and `verify` must detect any byte,
// addition or removal after packing. The artifact hash the QA report carries must be the one the
// packed manifest carries, or receipts for a clean install could never match the report.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'
import { pack, verifyDistribution, manifestFor, distributionFiles } from '../tools/distribution.mjs'
import { miniContract } from './fixtures/mini/qa-contract.mjs'
const execFileP = promisify(execFile)
const TOOL = path.resolve(new URL('.', import.meta.url).pathname, '../tools/distribution.mjs')

function sourceTree(extra = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'dist-src-'))
  const files = {
    'package.json': '{"name":"x"}',
    'pnpm-lock.yaml': 'lockfileVersion: 9',
    'template.config.json': '{}',
    'public/favicon.svg': '<svg/>',
    'seed/seed.json': '{"entries":[]}',
    'src/pages/index.astro': '---\n---\n<h1/>',
    // runtime state and secrets that must never ship
    'data/data.db': 'SQLite format 3',
    'uploads/a.png': 'png',
    '.env': 'EMDASH_ENCRYPTION_KEY=x',
    'node_modules/x/index.js': '',
    'seed/agent.token': 'secret',
    ...extra
  }
  for (const [f, body] of Object.entries(files)) {
    if (body === null) continue
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
    writeFileSync(path.join(root, f), body)
  }
  return root
}
const contract = () => ({
  ...miniContract(),
  distribution: {
    include: ['package.json', 'pnpm-lock.yaml', 'template.config.json', 'public', 'seed', 'src'],
    required: ['public/favicon.svg', 'seed/seed.json']
  }
})

describe('F9 — distribution pack/verify', () => {
  it('packs only the allowlist, never runtime state or secrets, and verify passes on the untouched artifact', () => {
    const root = sourceTree({ 'seed/agent.token': null })
    const dest = path.join(mkdtempSync(path.join(tmpdir(), 'dist-out-')), 'artifact')
    const r = pack(root, contract(), dest)
    assert.equal(r.files, 6)
    for (const f of [
      'package.json',
      'public/favicon.svg',
      'seed/seed.json',
      'src/pages/index.astro',
      'distribution.json'
    ])
      assert.ok(existsSync(path.join(dest, f)), f)
    for (const f of ['data', 'uploads', '.env', 'node_modules'])
      assert.ok(!existsSync(path.join(dest, f)), `${f} must not ship`)
    const v = verifyDistribution(dest)
    assert.equal(v.status, 'pass', JSON.stringify(v.errors))
    assert.equal(v.artifactHash, r.artifactHash)
    assert.equal(
      v.contractHash,
      JSON.parse(readFileSync(path.join(dest, 'distribution.json'), 'utf8')).contractHash
    )
  })
  it('revising the contract (pages, rules, revision) does not change the artifact hash: it names the shipped bytes only', () => {
    const root = sourceTree({ 'seed/agent.token': null })
    const a = manifestFor(root, contract()).artifactHash
    const revised = contract()
    revised.revision = 2
    revised.pages[0].path = '/start'
    assert.equal(manifestFor(root, revised).artifactHash, a)
    assert.notEqual(
      manifestFor(root, contract()).manifest.contractHash,
      manifestFor(root, revised).manifest.contractHash
    )
  })
  it('verify passes when a file and a directory share a prefix (src/b.ts next to src/b/x.ts): walk order is not manifest order', () => {
    const root = sourceTree({
      'seed/agent.token': null,
      'src/b.ts': '',
      'src/b/x.ts': '',
      'seed/media/decks/d.png': 'png',
      'seed/media/decks.png': 'png'
    })
    const dest = path.join(mkdtempSync(path.join(tmpdir(), 'dist-out-')), 'artifact')
    pack(root, contract(), dest)
    const v = verifyDistribution(dest)
    assert.equal(v.status, 'pass', JSON.stringify(v.errors))
  })
  it('the artifact hash computed from the source equals the packed manifest hash (reports and receipts agree)', () => {
    const root = sourceTree({ 'seed/agent.token': null })
    const dest = path.join(mkdtempSync(path.join(tmpdir(), 'dist-out-')), 'artifact')
    assert.equal(manifestFor(root, contract()).artifactHash, pack(root, contract(), dest).artifactHash)
  })
  it('refuses a secret or runtime file inside an included directory, an unsafe include entry, and a missing required asset', () => {
    assert.throws(
      () => distributionFiles(sourceTree(), contract()),
      /Runtime or secret file in distribution: seed\/agent.token/
    )
    const c = contract()
    c.distribution.include.push('data')
    assert.throws(
      () => distributionFiles(sourceTree({ 'seed/agent.token': null }), c),
      /Unsafe include: data/
    )
    assert.throws(
      () =>
        distributionFiles(
          sourceTree({ 'seed/agent.token': null, 'public/favicon.svg': null, 'public/robots.txt': '' }),
          contract()
        ),
      /Required asset omitted: public\/favicon.svg/
    )
    assert.throws(
      () =>
        distributionFiles(sourceTree({ 'seed/agent.token': null, 'public/favicon.svg': null }), contract()),
      /Include path missing: public/
    )
  })
  it('refuses a destination that exists, is the source, or nests with it', () => {
    const root = sourceTree({ 'seed/agent.token': null })
    assert.throws(() => pack(root, contract(), root), /new and outside/)
    assert.throws(() => pack(root, contract(), path.join(root, 'out')), /new and outside/)
    assert.throws(() => pack(root, contract(), path.dirname(root)), /new and outside/)
  })
  it('verify fails when a byte changes, a file is added, or a file is removed after packing', () => {
    const root = sourceTree({ 'seed/agent.token': null })
    const base = mkdtempSync(path.join(tmpdir(), 'dist-out-'))
    const dest = path.join(base, 'artifact')
    pack(root, contract(), dest)
    writeFileSync(path.join(dest, 'seed/seed.json'), '{"entries":[1]}')
    assert.match(verifyDistribution(dest).errors.join(), /artifact bytes changed: seed\/seed.json/)
    pack(root, contract(), path.join(base, 'b'))
    writeFileSync(path.join(base, 'b/src/extra.ts'), '')
    assert.match(verifyDistribution(path.join(base, 'b')).errors.join(), /artifact file set changed/)
    pack(root, contract(), path.join(base, 'c'))
    rmSync(path.join(base, 'c/public/favicon.svg'))
    assert.match(verifyDistribution(path.join(base, 'c')).errors.join(), /artifact file set changed/)
    const manifest = JSON.parse(readFileSync(path.join(base, 'c/distribution.json'), 'utf8'))
    manifest.checksums['public/favicon.svg'] = manifest.checksums['seed/seed.json']
    writeFileSync(path.join(base, 'c/distribution.json'), JSON.stringify(manifest))
    assert.match(verifyDistribution(path.join(base, 'c')).errors.join(), /manifest hash mismatch/)
  })
  it('CLI: pack from the template directory, verify the result; exit 1 on a tampered artifact', async () => {
    const root = sourceTree({ 'seed/agent.token': null })
    const cfile = path.join(root, 'qa.contract.json')
    writeFileSync(cfile, JSON.stringify(contract()))
    const dest = path.join(mkdtempSync(path.join(tmpdir(), 'dist-out-')), 'artifact')
    const packed = await execFileP(process.execPath, [TOOL, 'pack', 'qa.contract.json', dest], { cwd: root })
    assert.equal(JSON.parse(packed.stdout).files, 6) // qa.contract.json is not in the allowlist, so it does not ship
    const ok = await execFileP(process.execPath, [TOOL, 'verify', dest])
    assert.equal(JSON.parse(ok.stdout).status, 'pass')
    writeFileSync(path.join(dest, 'package.json'), '{"name":"y"}')
    await assert.rejects(
      execFileP(process.execPath, [TOOL, 'verify', dest]),
      (e) => e.code === 1 && /bytes changed/.test(e.stdout)
    )
  })
})
