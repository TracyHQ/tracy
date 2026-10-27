import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { HERE, cli, fakeGit, tmpDir } from './helpers.mjs'
import { readTextAsync } from '../lib/bounded-reader.mjs'

const KIT = pathToFileURL(path.join(HERE, 'fixtures/kit.mjs')).href

// A layer whose run() plants a hostile file in the run directory, per QA_PLANT.
const PLANT_LAYER = `import fs from 'node:fs/promises';
import path from 'node:path';
import { makeCase, passWithProof, writeProof } from ${JSON.stringify(KIT)};
export const layer = 'unit';
const cases = [makeCase(layer, 'a')];
export const listCases = async () => cases;
export async function run({ cases: asked, outDir }) {
  const [m] = asked;
  const outside = path.join(outDir, '..', 'outside.txt');
  await fs.writeFile(outside, 'secret');
  if (process.env.QA_PLANT === 'evidence-link') {
    await fs.symlink(outside, path.join(outDir, 'leak.txt'));
    return [{ ...(await passWithProof(m, outDir)), evidence: ['leak.txt'] }];
  }
  if (process.env.QA_PLANT === 'proof-link') {
    await fs.mkdir(path.join(outDir, 'red'), { recursive: true });
    await fs.symlink(outside, path.join(outDir, 'red', 'x.log'));
    const r = await passWithProof(m, outDir);
    await fs.rm(path.join(outDir, r.redProof.log));
    await fs.symlink(outside, path.join(outDir, r.redProof.log));
    return [r];
  }
  if (process.env.QA_PLANT === 'evidence-missing') {
    return [{ ...(await passWithProof(m, outDir)), evidence: ['gone.png'] }];
  }
  return [await passWithProof(m, outDir)];
}
`

async function plantedLayers() {
  const layersDir = await tmpDir('plant')
  await fs.mkdir(path.join(layersDir, 'unit'))
  await fs.writeFile(path.join(layersDir, 'unit/index.mjs'), PLANT_LAYER)
  return layersDir
}

test('evidence that is a symlink leaving the run directory is a contract error', async () => {
  const layersDir = await plantedLayers()
  process.env.QA_PLANT = 'evidence-link'
  const r = await cli(['unit'], { layersDir })
  delete process.env.QA_PLANT
  assert.equal(r.code, 2)
  assert.match(r.err, /symlink component refused/)
})

test('a RED-proof log that is a symlink is not accepted as proof', async () => {
  const layersDir = await plantedLayers()
  process.env.QA_PLANT = 'proof-link'
  const r = await cli(['unit'], { layersDir })
  delete process.env.QA_PLANT
  assert.equal(r.code, 3)
  assert.match(r.out, /unit: PASS 0/)
  assert.match(
    await readTextAsync(path.join(r.resultsRoot, (await fs.readdir(r.resultsRoot))[0], 'report.md')),
    /PASS downgraded to PENDING: redProof log/
  )
})

test('PASS whose evidence file is missing is downgraded', async () => {
  const layersDir = await plantedLayers()
  process.env.QA_PLANT = 'evidence-missing'
  const r = await cli(['unit'], { layersDir })
  delete process.env.QA_PLANT
  assert.equal(r.code, 3)
  assert.match(r.out, /evidence file "gone\.png" is missing/)
})

test('symlinked layer entry, symlinked --out and FIFO inputs are refused without blocking', async () => {
  const layersDir = await tmpDir('entry')
  await fs.mkdir(path.join(layersDir, 'unit'))
  await fs.symlink(path.join(HERE, 'fixtures/layers/good/index.mjs'), path.join(layersDir, 'unit/index.mjs'))
  const entry = await cli(['unit'], { layersDir })
  assert.equal(entry.code, 2)
  assert.match(entry.err, /index\.mjs is not a regular file/)

  const emptyTarget = await tmpDir('target')
  const link = path.join(await tmpDir('linkroot'), 'out')
  await fs.symlink(emptyTarget, link)
  const out = await cli(['good', '--out', link])
  assert.equal(out.code, 2)

  const layers = await tmpDir('fifo')
  const unit = path.join(layers, 'unit')
  await fs.mkdir(path.join(unit, 'cases'), { recursive: true })
  execFileSync('mkfifo', [path.join(unit, 'denominator.json')])
  execFileSync('mkfifo', [path.join(unit, 'cases', 'x.json')])
  await fs.symlink(path.join(layers, 'nowhere'), path.join(unit, 'cases', 'y.json'))
  const resultsRoot = await tmpDir('fiforesults')
  const coverage = await cli(['coverage', '--layer', 'unit', '--json', '--require-complete'], {
    layersDir: layers,
    resultsRoot,
    git: fakeGit()
  })
  assert.equal(coverage.code, 3)
  const report = JSON.parse(coverage.out)[0]
  assert.match(report.reasons.join(' | '), /not a regular file/)
  assert.equal(report.cases.invalid, 2)
})

test('coverage never credits a run directory without complete.json or with a symlinked complete.json', async () => {
  const layersDir = await tmpDir('cov-unfinished')
  await fs.mkdir(path.join(layersDir, 'unit'), { recursive: true })
  await fs.writeFile(
    path.join(layersDir, 'unit/denominator.json'),
    JSON.stringify({ source: 's', revision: 'r', items: [], unresolved: [] })
  )
  const resultsRoot = await tmpDir('cov-unfinished-results')
  await fs.mkdir(path.join(resultsRoot, '20261005T100000Z-unit'))
  await fs.mkdir(path.join(resultsRoot, '20261005T100001Z-unit'))
  await fs.writeFile(path.join(resultsRoot, 'real.json'), '{}')
  await fs.symlink(
    path.join(resultsRoot, 'real.json'),
    path.join(resultsRoot, '20261005T100001Z-unit/complete.json')
  )
  const r = await cli(['coverage', '--layer', 'unit', '--json'], { layersDir, resultsRoot, git: fakeGit() })
  const report = JSON.parse(r.out)[0]
  assert.equal(report.run, null)
  assert.match(report.reasons.join(' '), /only run .* never completed/)
})

test('owned scratch: short socket path, removed with its token, refused once the token or the directory changes', async () => {
  const {
    createOwnedScratch,
    withOwnedScratch,
    ScratchCleanupError,
    SCRATCH_OWNER_FILE,
    SOCKET_PATH_BYTES,
    SOCKET_NAME_ROOM
  } = await import('../lib/fsafe.mjs')
  const a = createOwnedScratch('run-a', 'socket')
  const b = createOwnedScratch('run-b', 'socket')
  assert.notEqual(a.path, b.path, 'two runs at once get two directories')
  assert.ok(
    Buffer.byteLength(a.path) + SOCKET_NAME_ROOM <= SOCKET_PATH_BYTES,
    `${a.path} leaves room for a socket name`
  )
  assert.equal(a.env.TMPDIR, a.path)
  // Another owner's token: the directory and its foreign content stay.
  await fs.writeFile(path.join(b.path, SCRATCH_OWNER_FILE), '{"token":"someone-else"}\n')
  await fs.writeFile(path.join(b.path, 'foreign.txt'), 'kept')
  const refused = b.dispose()
  assert.equal(refused.ok, false)
  assert.match(refused.error, /another owner's token/)
  assert.equal(await readTextAsync(path.join(b.path, 'foreign.txt')), 'kept')
  await fs.rm(b.path, { recursive: true })
  // Replaced by a symlink: never followed, never removed.
  const c = createOwnedScratch('run-c', 'workspace')
  const outside = await tmpDir()
  await fs.writeFile(path.join(outside, 'canary'), 'x')
  await fs.rm(c.path, { recursive: true })
  await fs.symlink(outside, c.path)
  assert.match(c.dispose().error, /no longer a directory/)
  assert.equal(await readTextAsync(path.join(outside, 'canary')), 'x', 'the link target is untouched')
  await fs.unlink(c.path)
  // Normal removal, idempotent.
  assert.deepEqual(a.dispose(), { ok: true, error: null })
  await assert.rejects(fs.lstat(a.path), { code: 'ENOENT' })
  assert.deepEqual(a.dispose(), { ok: true, error: null })
  // The callback's error and a failed cleanup are reported together; a clean run returns the callback's value.
  let leftover = ''
  assert.equal(await withOwnedScratch('run-d', 'workspace', () => 42), 42)
  const err = await withOwnedScratch('run-e', 'workspace', async (s) => {
    await fs.writeFile(path.join(s.path, SCRATCH_OWNER_FILE), '{"token":"swapped"}\n')
    leftover = s.path
    throw new Error('the work failed')
  }).catch((e) => e)
  assert.ok(err instanceof ScratchCleanupError, 'a scratch left behind makes the run TEST_INVALID')
  assert.equal(err.code, 'TEST_INVALID')
  assert.equal(err.callbackError?.message, 'the work failed')
  await fs.rm(leftover, { recursive: true })
  await assert.rejects(
    withOwnedScratch('run-f', 'workspace', () => {
      throw new Error('alone')
    }),
    /alone/
  )
})

test('owned scratch: a directory swapped in under the same name is never removed, even with a copied token', async () => {
  const { createOwnedScratch, SCRATCH_OWNER_FILE } = await import('../lib/fsafe.mjs')
  const s = createOwnedScratch('run-swap', 'workspace')
  const token = await readTextAsync(path.join(s.path, SCRATCH_OWNER_FILE))
  const original = `${s.path}.original`
  await fs.rename(s.path, original)
  await fs.mkdir(s.path)
  await fs.writeFile(path.join(s.path, SCRATCH_OWNER_FILE), token)
  await fs.writeFile(path.join(s.path, 'foreign.txt'), 'kept')
  const refused = s.dispose()
  assert.equal(refused.ok, false)
  assert.match(refused.error, /not the directory this run created/)
  assert.equal(
    await readTextAsync(path.join(s.path, 'foreign.txt')),
    'kept',
    'the swapped-in directory is put back'
  )
  await fs.rm(s.path, { recursive: true })
  await fs.rm(original, { recursive: true })
})

test('owned scratch: a rollback never touches a directory swapped in while the token was being written', async () => {
  const { createOwnedScratch, SCRATCH_OWNER_FILE } = await import('../lib/fsafe.mjs')
  let dir = ''
  const swapping = (file) => {
    dir = path.dirname(file)
    renameSync(dir, `${dir}.original`)
    mkdirSync(dir)
    writeFileSync(path.join(dir, SCRATCH_OWNER_FILE), 'foreign\n')
    writeFileSync(path.join(dir, 'canary.txt'), 'kept')
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
  }
  assert.throws(
    () => createOwnedScratch('run-swapped-rollback', 'workspace', { writeOwner: swapping }),
    /owner token could not be written.*not the directory this run created/
  )
  assert.equal(
    await readTextAsync(path.join(dir, SCRATCH_OWNER_FILE)),
    'foreign\n',
    'the foreign marker is kept'
  )
  assert.equal(await readTextAsync(path.join(dir, 'canary.txt')), 'kept', 'the foreign directory is put back')
  assert.deepEqual(
    (await fs.readdir(path.dirname(dir))).filter(
      (n) => n.startsWith('qa-hold-') && n.includes(path.basename(dir))
    ),
    []
  )
  await fs.rm(dir, { recursive: true })
  await fs.rm(`${dir}.original`, { recursive: true })
})

test('owned scratch: removal leaves no private holding place and no entry derived from the scratch name', async () => {
  const { createOwnedScratch } = await import('../lib/fsafe.mjs')
  const s = createOwnedScratch('run-hold', 'workspace')
  const root = path.dirname(s.path)
  const before = new Set(await fs.readdir(root))
  assert.deepEqual(s.dispose(), { ok: true, error: null })
  await assert.rejects(fs.lstat(s.path), { code: 'ENOENT' })
  const added = (await fs.readdir(root)).filter((n) => !before.has(n))
  assert.deepEqual(
    added.filter((n) => n.startsWith('qa-hold-') || n.startsWith(path.basename(s.path))),
    []
  )
})

test('owned scratch: a token that cannot be written rolls the empty directory back and names it', async () => {
  const { createOwnedScratch } = await import('../lib/fsafe.mjs')
  let dir = ''
  const failing = (file) => {
    dir = path.dirname(file)
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
  }
  assert.throws(
    () => createOwnedScratch('run-full', 'workspace', { writeOwner: failing }),
    (e) => {
      assert.match(e.message, /owner token could not be written/)
      assert.ok(e.message.includes(dir), 'the error names the directory')
      assert.doesNotMatch(e.message, /left behind/)
      return true
    }
  )
  await assert.rejects(fs.lstat(dir), { code: 'ENOENT' }, 'the empty directory was removed')
})
