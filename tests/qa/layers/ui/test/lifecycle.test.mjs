// Lifecycle and safety: file access, atomic writes, ownership ledger, scratch tree, ENV classification
// of a missing browser or Storybook, and per-visit event isolation.

import { KNOWN_OUTPUT } from '../../infra/lib/legacy.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  lstatSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  REPO_ROOT,
  UnsafePathError,
  artifactRootDir,
  confineOutput,
  ensureDir,
  insideDir,
  readJson,
  readRegular,
  stableStringify,
  writeAtomic
} from '../artifacts.mjs'
import {
  EnvError,
  Ledger,
  freePort,
  launchBrowser,
  portIsOpen,
  startStorybook,
  visitStory
} from '../browser.mjs'
import { captureProduct, invalidateOnCleanup, probeStand, sheetIsFresh, standOrigin } from '../engine.mjs'
import { exitCodeFor } from '../run.mjs'
import { ScratchCleanupError } from '../../../lib/fsafe.mjs'
import { listCases } from '../index.mjs'
import { STORY_MUTANTS, applyEdit, buildScratch, removeScratch } from '../red.mjs'
import { cleanup, tempDir, tryBrowser } from './helpers.mjs'
import { deltaIsEmpty, diffSnapshots, observe, parseObserveArgs, snapshotTree } from './observe-check.mjs'
import { readBytesSync, readTextAsync, readTextSync } from '../../../lib/bounded-reader.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

test('readRegular refuses symlinks, directories, FIFOs, escapes, empties and oversize files without hanging', async () => {
  const dir = await tempDir('ui-fs')
  try {
    const real = path.join(dir, 'real.json')
    writeFileSync(real, '{"a":1}')
    assert.equal(await readRegular(real, { root: dir }), '{"a":1}')
    assert.deepEqual(await readJson(real, { root: dir }), { a: 1 })
    symlinkSync(real, path.join(dir, 'link.json'))
    await assert.rejects(
      () => readRegular(path.join(dir, 'link.json'), { root: dir }),
      (e) => e instanceof UnsafePathError && e.code === 'SYMLINK'
    )
    await mkdir(path.join(dir, 'sub'))
    await assert.rejects(
      () => readRegular(path.join(dir, 'sub'), { root: dir }),
      (e) => e.code === 'NOT_REGULAR'
    )
    execFileSync('mkfifo', [path.join(dir, 'pipe')])
    await assert.rejects(
      () => readRegular(path.join(dir, 'pipe'), { root: dir }),
      (e) => e.code === 'NOT_REGULAR'
    )
    await assert.rejects(
      () => readRegular(path.join(dir, 'missing.json'), { root: dir }),
      (e) => e.code === 'UNREADABLE'
    )
    await assert.rejects(
      () => readRegular(path.join(REPO_ROOT, 'package.json'), { root: dir }),
      (e) => e.code === 'ESCAPE'
    )
    writeFileSync(path.join(dir, 'empty.json'), '  ')
    await assert.rejects(
      () => readJson(path.join(dir, 'empty.json'), { root: dir }),
      (e) => e.code === 'EMPTY'
    )
    writeFileSync(path.join(dir, 'bad.json'), '{')
    await assert.rejects(
      () => readJson(path.join(dir, 'bad.json'), { root: dir }),
      (e) => e.code === 'MALFORMED'
    )
    writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(100))
    await assert.rejects(
      () => readRegular(path.join(dir, 'big.txt'), { root: dir, maxBytes: 10 }),
      (e) => e.code === 'TOO_LARGE'
    )
  } finally {
    await cleanup(dir)
  }
})

test('output paths: traversal, empty names and symlinked targets are refused; writes are atomic', async () => {
  const dir = await tempDir('ui-out')
  try {
    assert.throws(() => confineOutput(''), UnsafePathError)
    assert.throws(() => confineOutput('a\0b'), UnsafePathError)
    assert.throws(
      () => insideDir(dir, '../escape.txt'),
      (e) => e.code === 'TRAVERSAL'
    )
    assert.equal(insideDir(dir, 'ok/x.txt'), path.join(dir, 'ok/x.txt'))
    const target = path.join(dir, 'results.json')
    await writeAtomic(target, '[1]')
    await writeAtomic(target, '[2]')
    assert.equal(readTextSync(target), '[2]')
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.endsWith('.tmp')),
      [],
      'no temp file is left behind'
    )
    symlinkSync(target, path.join(dir, 'link.json'))
    await assert.rejects(
      () => writeAtomic(path.join(dir, 'link.json'), 'x'),
      (e) => e.code === 'NOT_REGULAR'
    )
    await mkdir(path.join(dir, 'isdir'))
    await assert.rejects(
      () => writeAtomic(path.join(dir, 'isdir'), 'x'),
      (e) => e.code === 'NOT_REGULAR'
    )
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.endsWith('.tmp')),
      []
    )
    symlinkSync(dir, path.join(dir, 'dirlink'))
    await assert.rejects(
      () => ensureDir(path.join(dir, 'dirlink')),
      (e) => e.code === 'NOT_DIR'
    )
    assert.equal(
      stableStringify({ b: 1, a: { d: 1, c: 2 } }),
      '{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}\n'
    )
  } finally {
    await cleanup(dir)
  }
})

test('ownership ledger: written before the start, rewritten on stop, open entries listed, stopAll stops what is registered', async () => {
  const dir = await tempDir('ui-ledger')
  try {
    const ledger = new Ledger(path.join(dir, 'owned.json'))
    const entry = await ledger.add({ kind: 'storybook', port: 1234 })
    assert.equal(JSON.parse(readTextSync(path.join(dir, 'owned.json'))).entries[0].stopped, false)
    assert.equal(ledger.open.length, 1)
    let stopped = 0
    ledger.onStop(entry, async () => {
      stopped++
      await ledger.mark(entry, { stopped: true })
    })
    await ledger.stopAll()
    await ledger.stopAll()
    assert.equal(stopped, 1)
    assert.equal(ledger.open.length, 0)
    assert.equal(JSON.parse(readTextSync(path.join(dir, 'owned.json'))).entries[0].stopped, true)
  } finally {
    await cleanup(dir)
  }
})

test('ports: a free port is free, an occupied one is seen as open', async () => {
  const port = await freePort()
  assert.equal(await portIsOpen(port), false)
  const server = http.createServer((_, res) => res.end('x'))
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  try {
    assert.equal(await portIsOpen(port), true)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('a Storybook that cannot start is an ENV error naming its probe, with nothing left running', async () => {
  const dir = await tempDir('ui-sb')
  try {
    const ledger = new Ledger(path.join(dir, 'owned.json'))
    await assert.rejects(
      () => startStorybook({ benchDir: path.join(dir, 'no-such-bench'), outDir: dir, ledger }),
      (e) => e instanceof EnvError && e.probe.probe === 'storybook-bin'
    )
    assert.equal(ledger.open.length, 0)
  } finally {
    await cleanup(dir)
  }
})

test('a missing browser gives ENV, not FAIL: switch cases run in a child with no Chromium available', async () => {
  const dir = await tempDir('ui-env')
  try {
    const out = path.join(dir, 'out')
    const child = spawnSync(
      process.execPath,
      [path.join(here, '../run.mjs'), '--area', 'switches', '--out', out],
      {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(dir, 'no-browsers') },
        encoding: 'utf8',
        timeout: 120_000
      }
    )
    assert.equal(child.status, 3, `exit status (stderr: ${child.stderr})`)
    const results = JSON.parse(readTextSync(path.join(out, 'results.json')))
    const browserCases = results.filter((r) => /-switch-(binding|door-down|tab-policy)$/.test(r.id))
    assert.ok(browserCases.length > 100)
    for (const r of browserCases) {
      assert.equal(r.verdict, 'ENV', r.id)
      assert.match(r.reason, /chromium|playwright/i)
    }
    assert.ok(
      !results.some((r) => browserCases.includes(r) && (r.verdict === 'PASS' || r.verdict === 'FAIL')),
      'no browser-dependent verdict can be claimed without the browser'
    )
    const probes = JSON.parse(readTextSync(path.join(out, 'probes.json')))
    assert.equal(probes.chromium, 'chromium-launch')
    const owned = JSON.parse(readTextSync(path.join(out, 'owned.json')))
    assert.ok(
      owned.entries.every((e) => e.stopped),
      'every owned entry is closed'
    )
    assert.ok(
      owned.entries.every((e) => !e.scratchLeft),
      'a failed launch removes its browser scratch'
    )
  } finally {
    await cleanup(dir)
  }
})

// Whether Chromium starts at all, measured without launchBrowser: only a machine where this fails may skip the
// long-path test, so a launchBrowser regression cannot hide behind an EnvError.
async function chromiumStarts() {
  try {
    const { chromium } = await import('@playwright/test')
    const b = await chromium.launch({ headless: true })
    await b.close()
    return null
  } catch (error) {
    return String(error.message).split('\n')[0]
  }
}

test('browser scratch: a long output path still launches; TMPDIR is a short owned scratch removed on close', async (t) => {
  const absent = await chromiumStarts()
  if (absent) return t.skip(`chromium does not start on this machine: ${absent}`)
  const dir = await tempDir('ui-long')
  try {
    const out = path.join(dir, 'x'.repeat(60), 'y'.repeat(60))
    await mkdir(out, { recursive: true })
    const ledger = new Ledger(path.join(out, 'owned.json'))
    const browser = await launchBrowser({ ledger, outDir: out })
    const scratch = browser.scratchDir
    assert.ok(Buffer.byteLength(scratch) < 64, `short scratch path (${scratch})`)
    assert.ok(!scratch.startsWith(out), 'the scratch is not under the long output path')
    assert.ok(existsSync(scratch), 'the scratch exists while the browser runs')
    const page = await browser.newPage()
    await page.setContent('<p>ok</p>')
    await page.close()
    await browser.close()
    assert.ok(!existsSync(scratch), 'close removes the scratch')
    assert.ok(!existsSync(path.join(out, 'browser-tmp')), 'no profile under the output path')
    const owned = JSON.parse(readTextSync(path.join(out, 'owned.json')))
    assert.ok(owned.entries.every((e) => e.stopped && !e.scratchLeft))
  } finally {
    await cleanup(dir)
  }
})

test('browser cleanup: a scratch left behind turns every PASS into TEST_INVALID, keeps a measured FAIL, never exits 0', () => {
  const err = new ScratchCleanupError('browser scratch was not removed: EACCES')
  assert.equal(err.code, 'TEST_INVALID', 'engine keys the invalidation on this code')
  const pass = { id: 'a', verdict: 'PASS', reason: '', evidence: ['shot.png'] }
  const fail = { id: 'b', verdict: 'FAIL', reason: 'contrast', evidence: ['b.png'] }
  assert.equal(exitCodeFor([pass]), 0)
  const out = invalidateOnCleanup([pass, fail], [err.message])
  assert.equal(out[0].verdict, 'PENDING')
  assert.match(out[0].reason, /^TEST_INVALID: .*EACCES/)
  assert.deepEqual(out[0].evidence, ['shot.png'], 'evidence is kept')
  assert.deepEqual(out[1], fail, 'a measured product FAIL is kept as measured')
  assert.notEqual(exitCodeFor([out[0]]), 0)
  assert.deepEqual(invalidateOnCleanup([pass], []), [pass], 'a clean run is untouched')
})

test('scratch tree: an edit never reaches the real repo, symlinks and bad anchors are refused, cleanup unlinks without following', async () => {
  const dir = await tempDir('ui-scratch')
  const realFile = path.join(REPO_ROOT, STORY_MUTANTS[0].edits[0].file)
  const before = createHash('sha256').update(readBytesSync(realFile)).digest('hex')
  try {
    const root = path.join(dir, 'scratch-bench')
    const light = { copied: [['ui', 'tracy-ui']], patchBench: false }
    await buildScratch(root, light)
    await assert.rejects(
      () => buildScratch(root, light),
      (e) => e.code === 'EXISTS'
    )
    // tool write paths are never linked into the real node_modules
    const scratchModules = path.join(root, 'packages/ui/tracy-ui/node_modules')
    for (const name of ['.vite-temp', '.vite', '.cache'])
      assert.equal(existsSync(path.join(scratchModules, name)), false, `${name} must not be linked`)
    // the root node_modules is a farm of its own, never one link to the real folder, and has no write paths
    assert.equal(lstatSync(path.join(root, 'node_modules')).isSymbolicLink(), false)
    for (const name of ['.vite-temp', '.vite', '.cache'])
      assert.equal(
        existsSync(path.join(root, 'node_modules', name)),
        false,
        `root ${name} must not be linked`
      )
    // stories import apps/tracy-web by relative path, so the scratch carries the apps
    assert.ok(existsSync(path.join(root, 'apps/tracy-web')), 'apps are present in the scratch')
    const edit = STORY_MUTANTS[0].edits[0]
    const applied = await applyEdit(root, edit)
    assert.equal(applied.changed, true)
    assert.match(readTextSync(path.join(root, edit.file)), /tabIndex=\{-1\}/)
    assert.equal(
      createHash('sha256').update(readBytesSync(realFile)).digest('hex'),
      before,
      'the real file is untouched'
    )
    await assert.rejects(
      () => applyEdit(root, { ...edit, find: 'text that is not there' }),
      (e) => e.code === 'ANCHOR'
    )
    // a file reached through a symlink into the real tree is never edited
    await assert.rejects(
      () =>
        applyEdit(root, {
          file: 'packages/ui/tracy-ui/../../core/tracy-core/package.json',
          find: '"name"',
          replace: '"nome"'
        }),
      UnsafePathError
    )
    await assert.rejects(
      () =>
        applyEdit(root, { file: 'packages/core/tracy-core/package.json', find: '"name"', replace: '"nome"' }),
      UnsafePathError
    )
    assert.equal(
      JSON.parse(readTextSync(path.join(REPO_ROOT, 'packages/core/tracy-core/package.json'))).name.startsWith(
        '@tracy/'
      ),
      true
    )
    await removeScratch(dir, root)
    assert.equal(existsSync(root), false)
    assert.equal(
      existsSync(path.join(REPO_ROOT, 'packages/core/tracy-core/package.json')),
      true,
      'unlinking the scratch symlinks did not follow them'
    )
    await assert.rejects(() => removeScratch(dir, path.join(dir, 'not-scratch')), UnsafePathError)
    await assert.rejects(() => removeScratch(dir, REPO_ROOT), UnsafePathError)
  } finally {
    await cleanup(dir)
  }
})

test('every mutation anchor occurs exactly once in the real file', async () => {
  for (const mutant of STORY_MUTANTS) {
    for (const edit of mutant.edits) {
      const text = await readTextAsync(path.join(REPO_ROOT, edit.file))
      assert.equal(text.split(edit.find).length - 1, 1, `${mutant.id}: anchor in ${edit.file}`)
    }
  }
})

test('visits are isolated: an event that arrives after dispose is not charged to anyone', async () => {
  const b = await tryBrowser()
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/iframe.html')) {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(
        '<body class="sb-show-main"><script>console.error("early");setTimeout(()=>console.error("late"),700)</script></body>'
      )
    } else res.end('')
  })
  try {
    if (b.error) return assertEnvError(b.error)
    const port = await freePort()
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
    const visit = await visitStory(b.browser, {
      baseUrl: `http://localhost:${port}`,
      storyId: 'x',
      viewport: { width: 400, height: 300 }
    })
    assert.equal(visit.state, 'ok')
    const seen = visit.events.filter((e) => e.type === 'console').map((e) => e.text)
    assert.ok(seen.includes('early'))
    await visit.dispose()
    const count = visit.events.length
    await new Promise((resolve) => setTimeout(resolve, 900))
    assert.equal(visit.events.length, count, 'a late event after dispose is dropped')
    const second = await visitStory(b.browser, {
      baseUrl: `http://localhost:${port}`,
      storyId: 'y',
      viewport: { width: 400, height: 300 }
    })
    assert.equal(
      second.events.filter((e) => e.text === 'early').length,
      1,
      'the second visit sees only its own events'
    )
    await second.dispose()
  } finally {
    await new Promise((resolve) => server.close(resolve))
    if (b.browser) await b.browser.close()
    await cleanup(b.dir)
  }

  function assertEnvError(error) {
    assert.ok(error instanceof EnvError)
  }
})

test('a story that never becomes ready is reported as a timeout, not as a pass', async () => {
  const b = await tryBrowser()
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end('<body>never ready</body>')
  })
  try {
    if (b.error) return assert.ok(b.error instanceof EnvError)
    const port = await freePort()
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
    const visit = await visitStory(b.browser, {
      baseUrl: `http://localhost:${port}`,
      storyId: 'z',
      viewport: { width: 400, height: 300 },
      readyTimeoutMs: 1500
    })
    assert.equal(visit.state, 'timeout')
    await visit.dispose()
  } finally {
    await new Promise((resolve) => server.close(resolve))
    if (b.browser) await b.browser.close()
    await cleanup(b.dir)
  }
})

test('listCases is stable across calls (the manifests are derived, not remembered)', async () => {
  const a = await listCases({ area: 'switches' })
  const b = await listCases({ area: 'switches' })
  assert.deepEqual(a, b)
  await rm(path.join(here, 'nonexistent'), { recursive: true, force: true })
})

const LAYER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const WORKTREE = path.resolve(LAYER, '../../../..')

/**
 * Whole physical worktree (tracked, untracked, ignored, node_modules) except Git's own metadata and
 * the build outputs another layer's selftest is known to write while this one runs: the infra layer's
 * legacy suite builds `packages/cms/tracy-seeder/dist/` (its `KNOWN_OUTPUT`), and `node --test` runs
 * the two files side by side. Measured 07/10/2026: that build landed inside this snapshot and every
 * file under it read "UNSTABLE (changed while hashed)". Nothing of the ui layer writes there; the
 * path is named, not a pattern.
 */
const writtenByAnotherLayer = (rel) => KNOWN_OUTPUT.some((re) => re.test(`${rel}/`))
const worktreeSnapshot = (previous = null) =>
  snapshotTree(WORKTREE, { previous, skip: (rel) => rel === '.git' || writtenByAnotherLayer(rel) })

function assertUnchanged(before, after, what) {
  assert.deepEqual(before.unreadable, [], 'the snapshot before was incomplete')
  assert.deepEqual(after.unreadable, [], 'the snapshot after was incomplete')
  const delta = diffSnapshots(before, after)
  assert.ok(deltaIsEmpty(delta), `${what} changed the worktree: ${JSON.stringify(delta).slice(0, 600)}`)
}

test('the snapshot catches what size and mtime cannot: same-size rewrites, new ignored files, retargeted links, non-regular files', async () => {
  const dir = await tempDir('ui-snapshot')
  try {
    const tree = path.join(dir, 'tree')
    await mkdir(path.join(tree, 'sub'), { recursive: true })
    writeFileSync(path.join(tree, 'a.txt'), 'AAAA')
    symlinkSync('/one', path.join(tree, 'link'))
    execFileSync('mkfifo', [path.join(tree, 'pipe')])
    const before = await snapshotTree(tree)
    assert.equal(before.entries.pipe.type, 'other', 'a FIFO is recorded by type and never read')
    assert.deepEqual(before.unreadable, [])
    assertUnchanged(before, await snapshotTree(tree), 'an untouched tree')
    // same size, same mtime, different bytes
    const original = lstatSync(path.join(tree, 'a.txt'))
    writeFileSync(path.join(tree, 'a.txt'), 'BBBB')
    utimesSync(path.join(tree, 'a.txt'), original.atime, original.mtime)
    const rewritten = diffSnapshots(before, await snapshotTree(tree))
    assert.deepEqual(rewritten.changed, ['a.txt'])
    writeFileSync(path.join(tree, 'a.txt'), 'AAAA')
    utimesSync(path.join(tree, 'a.txt'), original.atime, original.mtime)
    // a new file a .gitignore would hide
    writeFileSync(path.join(tree, '.gitignore'), '*.cache\n')
    const withIgnored = await snapshotTree(tree)
    writeFileSync(path.join(tree, 'sub/x.cache'), 'x')
    assert.deepEqual(diffSnapshots(withIgnored, await snapshotTree(tree)).added, ['sub/x.cache'])
    // a link retargeted
    rmSync(path.join(tree, 'link'))
    symlinkSync('/two', path.join(tree, 'link'))
    assert.ok(diffSnapshots(withIgnored, await snapshotTree(tree)).changed.includes('link'))
    // a file replaced by a directory
    rmSync(path.join(tree, 'a.txt'))
    await mkdir(path.join(tree, 'a.txt'))
    assert.ok(diffSnapshots(withIgnored, await snapshotTree(tree)).changed.includes('a.txt'))
  } finally {
    await cleanup(dir)
  }
})

test('output confinement: every output path must stay outside the repository, judged before anything is created', async () => {
  const dir = await tempDir('ui-confine')
  try {
    assert.equal(confineOutput(path.join(dir, 'ok/deeper')), path.join(dir, 'ok/deeper'))
    assert.equal(confineOutput(dir), dir, 'the artifact root itself is a valid output')
    // outside the repository is not enough: it must be inside the artifact root
    assert.throws(() => confineOutput(`${REPO_ROOT}-sibling/out`), /not inside the artifact root/)
    assert.throws(() => confineOutput(`${artifactRootDir()}-sibling/out`), /not inside the artifact root/)
    assert.throws(
      () => confineOutput(path.join(artifactRootDir(), '..', 'escaped')),
      /not inside the artifact root/
    )
    const outside = mkdtempSync(path.join(realpathSync(tmpdir()), 'ui-confine-outside-'))
    try {
      symlinkSync(outside, path.join(dir, 'leak'))
      assert.throws(() => confineOutput(path.join(dir, 'leak/deeper')), /not inside the artifact root/)
    } finally {
      await cleanup(outside)
    }
    assert.throws(() => confineOutput(REPO_ROOT), UnsafePathError)
    assert.throws(() => confineOutput(path.join(REPO_ROOT, 'qa-results/x')), UnsafePathError)
    assert.throws(() => confineOutput('tests/qa/out', REPO_ROOT), UnsafePathError)
    assert.throws(() => confineOutput(path.join(REPO_ROOT, 'tests', '..', 'x')), UnsafePathError)
    symlinkSync(REPO_ROOT, path.join(dir, 'alias'))
    assert.throws(() => confineOutput(path.join(dir, 'alias/not-yet/created')), UnsafePathError)
    assert.throws(() => confineOutput(path.join(dir, 'alias')), UnsafePathError)
    assert.equal(existsSync(path.join(REPO_ROOT, 'not-yet')), false)
    // the entries refuse an in-repo output with exit 2 and create nothing there
    const marker = path.join(REPO_ROOT, 'qa-confine-probe')
    const env = { ...process.env, QA_UI_ARTIFACT_ROOT: dir }
    const run = (script, args, extra = {}) =>
      spawnSync(process.execPath, [path.join(LAYER, script), ...args], {
        env: { ...env, ...extra },
        encoding: 'utf8',
        timeout: 120000
      })
    const cases = [
      run('run.mjs', ['--dry', '--out', marker]),
      run('run.mjs', ['--dry', '--out', path.join(dir, 'alias/probe')]),
      run('run.mjs', ['--dry'], { QA_UI_ARTIFACT_ROOT: marker }),
      run('run.mjs', ['--dry', '--out', `${dir}-outside-root`], { QA_UI_ARTIFACT_ROOT: dir }),
      run('generate.mjs', ['--check', '--scratch-out', `${dir}-outside-root`], { QA_UI_ARTIFACT_ROOT: dir }),
      run('generate.mjs', ['--check', '--scratch-out', marker]),
      run('generate.mjs', ['--check', '--scratch-out', path.join(dir, 'alias/probe')])
    ]
    for (const r of cases) assert.equal(r.status, 2, `${r.stdout}${r.stderr}`)
    assert.equal(existsSync(marker), false)
    assert.equal(existsSync(`${dir}-outside-root`), false)
    assert.equal(existsSync(path.join(REPO_ROOT, 'probe')), false)
  } finally {
    await cleanup(dir)
  }
})

test('startStorybook only starts from a scratch bench outside the repository, with its caches under the output directory', async () => {
  const dir = await tempDir('ui-fake-sb')
  try {
    const ledger = new Ledger(path.join(dir, 'owned.json'))
    await assert.rejects(
      () =>
        startStorybook({ benchDir: path.join(REPO_ROOT, 'packages/dev/tracy-design'), outDir: dir, ledger }),
      UnsafePathError
    )
    await assert.rejects(
      () =>
        startStorybook({ benchDir: path.join(dir, 'bench'), outDir: path.join(REPO_ROOT, 'qa-x'), ledger }),
      UnsafePathError
    )
    await assert.rejects(() => startStorybook({ outDir: dir, ledger }), UnsafePathError)
    // a fake storybook binary records where the harness points it
    const bench = path.join(dir, 'bench')
    await mkdir(path.join(bench, 'node_modules/.bin'), { recursive: true })
    const bin = path.join(bench, 'node_modules/.bin/storybook')
    writeFileSync(
      bin,
      `#!/bin/sh\nprintf '%s\\n%s\\n' "$PWD" "$CACHE_DIR" > "${dir}/fake-sb.txt"\nexit 1\n`,
      { mode: 0o755 }
    )
    await assert.rejects(
      () => startStorybook({ benchDir: bench, outDir: dir, ledger, attempts: 1, readyTimeoutMs: 5000 }),
      (e) => e instanceof EnvError
    )
    const [cwd, cacheDir] = readTextSync(path.join(dir, 'fake-sb.txt')).trim().split('\n')
    assert.equal(realpathSync(cwd), realpathSync(bench))
    assert.ok(cacheDir.startsWith(dir), `CACHE_DIR ${cacheDir} is not under the output directory`)
  } finally {
    await cleanup(dir)
  }
})

test('observe-check: a clean exit that leaves a delta fails, arguments are strict, logs and snapshots land outside the repo', async () => {
  const dir = await tempDir('ui-observe')
  try {
    for (const bad of [
      [],
      ['--name', 'x'],
      ['--name', 'x', '--'],
      ['--name', '../x', '--', 'true'],
      ['--name', 'x', '--name', 'y', '--', 'true'],
      ['--name', 'x', '--bogus', '--', 'true'],
      ['--name', 'x', '--timeout-ms', 'abc', '--', 'true'],
      ['--timeout-ms', '5', '--', 'true']
    ])
      assert.throws(() => parseObserveArgs(bad), Error, JSON.stringify(bad))
    const cwd = path.join(dir, 'work')
    await mkdir(cwd, { recursive: true })
    writeFileSync(path.join(cwd, 'kept.txt'), 'k')
    assert.equal(spawnSync('git', ['init', '-q'], { cwd }).status, 0)
    const clean = await observe({
      name: 'clean',
      command: ['node', '-e', '0'],
      timeoutMs: 20000,
      artifactRoot: path.join(dir, 'art'),
      cwd
    })
    assert.equal(clean.ok, true)
    const writer = await observe({
      name: 'writer',
      fullTree: true,
      command: ['node', '-e', "require('fs').writeFileSync('new.txt','x')"],
      timeoutMs: 20000,
      artifactRoot: path.join(dir, 'art'),
      cwd
    })
    assert.equal(writer.record.exit.status, 0)
    assert.equal(writer.ok, false, 'exit 0 with a delta is a failed check')
    assert.deepEqual(writer.record.delta.added, ['new.txt'])
    const failing = await observe({
      name: 'failing',
      command: ['node', '-e', 'process.exit(3)'],
      timeoutMs: 20000,
      artifactRoot: path.join(dir, 'art'),
      cwd
    })
    assert.equal(failing.ok, false)
    const timedOut = await observe({
      name: 'slow',
      command: ['node', '-e', 'setTimeout(()=>{},60000)'],
      timeoutMs: 500,
      artifactRoot: path.join(dir, 'art'),
      cwd
    })
    assert.equal(timedOut.ok, false)
    assert.equal(timedOut.record.exit.signal, 'SIGKILL')
    for (const name of ['stdout.log', 'stderr.log', 'record.json', 'git-before.txt', 'tree-after.json'])
      assert.ok(existsSync(path.join(clean.dir, name)), name)
    await assert.rejects(
      () =>
        observe({
          name: 'inrepo',
          command: ['node', '-e', '0'],
          timeoutMs: 1000,
          artifactRoot: path.join(REPO_ROOT, 'qa-observe-probe'),
          cwd
        }),
      /inside the repository/
    )
    assert.equal(existsSync(path.join(REPO_ROOT, 'qa-observe-probe')), false)
    // Two runs of one check keep two evidence directories.
    const again = await observe({
      name: 'clean',
      command: ['node', '-e', '0'],
      timeoutMs: 20000,
      artifactRoot: path.join(dir, 'art'),
      cwd
    })
    assert.notEqual(again.dir, clean.dir)
    assert.ok(existsSync(path.join(clean.dir, 'record.json')))
    // A directory that is not a Git worktree makes the measurement incomplete, never "same".
    const plain = path.join(dir, 'plain')
    await mkdir(plain, { recursive: true })
    const nogit = await observe({
      name: 'nogit',
      command: ['node', '-e', '0'],
      timeoutMs: 20000,
      artifactRoot: path.join(dir, 'art'),
      cwd: plain
    })
    assert.equal(nogit.ok, false)
    assert.ok(nogit.record.incomplete.some((m) => m.startsWith('git status failed')))
    // A file rewritten while the snapshot hashes it is reported as unstable.
    const busy = path.join(dir, 'busy')
    await mkdir(busy, { recursive: true })
    writeFileSync(path.join(busy, 'f.txt'), 'one')
    const unstable = await snapshotTree(busy, {
      hasher: async (file) => {
        writeFileSync(file, 'changed while hashing')
        return 'x'
      }
    })
    assert.ok(unstable.unreadable.some((m) => m.includes('UNSTABLE')))
  } finally {
    await cleanup(dir)
  }
})

test('the generator check and the dry pilot entry each leave the whole worktree byte-identical, outputs under the artifact root', {
  timeout: 900000
}, async () => {
  const dir = await tempDir('ui-worktree-clean')
  try {
    const env = { ...process.env, QA_UI_ARTIFACT_ROOT: dir }
    const generatorBefore = await worktreeSnapshot()
    let last = generatorBefore
    const gen = spawnSync(
      process.execPath,
      [path.join(LAYER, 'generate.mjs'), '--check', '--scratch-out', path.join(dir, 'regen')],
      { env, encoding: 'utf8', timeout: 120000 }
    )
    assert.equal(gen.status, 0, gen.stderr)
    const afterGenerator = await worktreeSnapshot(generatorBefore)
    assertUnchanged(generatorBefore, afterGenerator, 'the generator check')
    last = afterGenerator
    assert.ok(
      existsSync(path.join(dir, 'regen', 'denominator.json')),
      'the regenerated copy is outside the repo'
    )

    const caseId = (await listCases())[0].id
    const pilotBefore = last
    const pilot = spawnSync(process.execPath, [path.join(LAYER, 'run.mjs'), '--dry', '--case', caseId], {
      env,
      encoding: 'utf8',
      timeout: 600000
    })
    assert.equal(pilot.status, 0, `${pilot.stdout}${pilot.stderr}`)
    assertUnchanged(pilotBefore, await worktreeSnapshot(pilotBefore), 'the dry pilot')
    assert.ok(
      readdirSync(dir).some((n) => n.startsWith('ui-')),
      'the pilot output did not land under the artifact root'
    )
  } finally {
    await cleanup(dir)
  }
})

test('stand safety: only a bare loopback origin is a stand; off-stand routes, redirects and subrequests are never requested', async () => {
  for (const ok of ['http://127.0.0.1:51710/', 'http://localhost:6007', 'http://[::1]:80/'])
    assert.ok(standOrigin(ok), ok)
  for (const bad of [
    'https://production.invalid/',
    'https://127.0.0.1:1/',
    'http://127.0.0.1.evil.invalid/',
    'http://user:pw@127.0.0.1:1/',
    'http://127.0.0.1:1/other-site',
    'http://127.0.0.1:1/?x=1',
    'http://tracy.test:51710/',
    'not a url',
    ''
  ])
    assert.equal(standOrigin(bad), null, bad)
  const realFetch = globalThis.fetch
  let fetched = 0
  globalThis.fetch = async () => {
    fetched++
    throw new Error('must not be called')
  }
  try {
    const probe = await probeStand('https://production.invalid/')
    assert.equal(probe.ok, false)
    assert.match(probe.detail, /refused.*nothing was requested/)
    assert.equal(fetched, 0, 'a refused stand must not be fetched')
  } finally {
    globalThis.fetch = realFetch
  }
  const touched = []
  const browser = {
    newContext: async () => {
      touched.push('context')
      return {
        route: async () => touched.push('route'),
        routeWebSocket: async () => touched.push('ws'),
        newPage: async () => ({ goto: async (u) => touched.push(`goto ${u}`) }),
        close: async () => {}
      }
    }
  }
  const route = (path, query = '') => ({
    'screen:a': {
      path,
      identity: { selector: '#s', attribute: 'data-screen', value: 'a' },
      revisionHeader: 'x-rev',
      locales: { en: query },
      localeProof: { en: { selector: 'h1', includes: 'Hello' } }
    }
  })
  const args = { itemId: 'screen:a', lang: 'en', viewport: { width: 400, height: 300 }, browser }
  const stand = { ok: true, url: 'http://127.0.0.1:1/', detail: 'up' }
  for (const path of [
    'https://production.invalid/other-site',
    '//production.invalid/x',
    '/\\production.invalid/x',
    'a/relative',
    '/ok x'
  ]) {
    const r = await captureProduct({ ...args, stand, routes: route(path) })
    assert.match(r.reason, /^PENDING: route .* nothing was requested/, path)
  }
  const q = await captureProduct({ ...args, stand, routes: route('/a', '@production.invalid') })
  assert.match(q.reason, /nothing was requested/)
  const off = await captureProduct({
    ...args,
    stand: { ok: true, url: 'https://production.invalid/', detail: 'up' },
    routes: route('/a')
  })
  assert.match(off.reason, /^ENV: .*not a loopback origin/)
  assert.deepEqual(touched, [], 'no context, route or goto for any refused target')
  // A route on the stand installs the off-origin abort before the first navigation.
  const seen = []
  const gate = {
    newContext: async (opts) => ({
      route: async (_p, handler) => {
        seen.push(`serviceWorkers ${opts.serviceWorkers}`)
        for (const url of ['http://127.0.0.1:1/a', 'https://production.invalid/x', 'http://other.test/']) {
          let verdict = 'continue'
          await handler({
            request: () => ({ url: () => url, method: () => 'GET' }),
            continue: () => {},
            abort: () => {
              verdict = 'abort'
            }
          })
          seen.push(`${url} ${verdict}`)
        }
      },
      newPage: async () => ({
        goto: async () => {
          throw new Error('stop after the gate')
        }
      }),
      close: async () => {}
    })
  }
  const gated = await captureProduct({ ...args, browser: gate, stand, routes: route('/a') })
  assert.match(gated.reason, /product capture failed/)
  assert.deepEqual(seen, [
    'serviceWorkers block',
    'http://127.0.0.1:1/a continue',
    'https://production.invalid/x abort',
    'http://other.test/ abort'
  ])
})

test('product capture: ENV for an unreachable stand, PENDING without a verified route, a screenshot only from a verified screen', async () => {
  const viewport = { width: 400, height: 300 }
  const args = { itemId: 'screen:a', lang: 'en', viewport }
  const down = await captureProduct({
    ...args,
    browser: null,
    stand: { ok: false, detail: 'QA_STAND_URL is not set' },
    routes: {}
  })
  assert.match(down.reason, /^ENV: QA_STAND_URL/)
  const stand = { ok: true, url: 'http://127.0.0.1:1/', detail: 'up' }
  assert.match(
    (await captureProduct({ ...args, browser: null, stand, routes: null })).reason,
    /^PENDING.*malformed/
  )
  assert.match(
    (await captureProduct({ ...args, browser: null, stand, routes: {} })).reason,
    /^PENDING: no verified product route/
  )
  const route = (extra = {}) => ({
    'screen:a': {
      path: '/a',
      identity: { selector: '#screen-a', attribute: 'data-screen', value: 'a' },
      revisionHeader: 'x-rev',
      locales: { en: '', vi: '?lang=vi' },
      localeProof: {
        en: { selector: 'h1', includes: 'Hello' },
        vi: { selector: 'h1', includes: 'Xin chào' }
      },
      ...extra
    }
  })
  assert.match(
    (
      await captureProduct({
        ...args,
        browser: null,
        stand,
        routes: { 'screen:a': { path: '/a', locales: { en: '' } } }
      })
    ).reason,
    /declares no screen identity/
  )
  assert.match(
    (await captureProduct({ ...args, lang: 'de', browser: null, stand, routes: route() })).reason,
    /no product locale mechanism recorded for "de"/
  )
  const b = await tryBrowser()
  const page = (lang, { marker = true, theme = '', rev = true, wrongScreen = false } = {}) => ({
    headers: rev ? { 'x-rev': 'abc123' } : {},
    body: `<html lang="${lang}" class="${theme}"><body><h1>${lang === 'vi' ? 'Xin chào' : 'Hello'}</h1>${marker ? `<div id="screen-a" data-screen="${wrongScreen ? 'b' : 'a'}">screen</div>` : '<p>other</p>'}</body></html>`
  })
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const routes = {
      '/a': url.searchParams.get('lang') === 'vi' ? page('vi') : page('en'),
      '/a-nomarker': page('en', { marker: false }),
      '/a-dark': page('en', { theme: 'dark' }),
      '/a-norev': page('en', { rev: false }),
      '/a-wronglang': page('fr'),
      '/a-otherscreen': page('en', { wrongScreen: true })
    }
    if (url.pathname === '/login-redirect') {
      res.statusCode = 302
      res.setHeader('location', '/login')
      res.end()
      return
    }
    if (url.pathname === '/login') {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(page('en').body)
      return
    }
    const hit = routes[url.pathname]
    if (!hit) {
      res.statusCode = 404
      res.end('nope')
      return
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    for (const [k, v] of Object.entries(hit.headers)) res.setHeader(k, v)
    res.end(hit.body)
  })
  try {
    if (b.error) return assert.ok(b.error instanceof EnvError)
    const port = await freePort()
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
    const live = { ok: true, url: `http://127.0.0.1:${port}/`, detail: 'up' }
    const shot = await captureProduct({ ...args, browser: b.browser, stand: live, routes: route() })
    assert.ok(shot.png?.length > 100 && shot.url.endsWith('/a'), 'a verified route is photographed')
    assert.deepEqual(shot.provenance, {
      route: '/a',
      identity: '#screen-a',
      identityValue: 'a',
      localeProof: 'Hello',
      routeSha256: shot.provenance.routeSha256,
      locale: 'en',
      theme: 'light',
      viewport: '400x300',
      revision: 'abc123'
    })
    const vi = await captureProduct({ ...args, lang: 'vi', browser: b.browser, stand: live, routes: route() })
    assert.equal(vi.provenance.locale, 'vi')
    const refused = async (extra, pattern, lang = 'en') => {
      const r = await captureProduct({
        ...args,
        lang,
        browser: b.browser,
        stand: live,
        routes: route(extra)
      })
      assert.equal(r.png, undefined, `${JSON.stringify(extra)} must not yield a product image`)
      assert.match(r.reason, pattern)
    }
    await refused({ path: '/missing' }, /^PENDING: .* answered HTTP 404, not a screen/)
    await refused({ path: '/login-redirect' }, /ended on \/login/)
    await refused({ path: '/a-nomarker' }, /does not show the identity marker/)
    await refused({ path: '/a-otherscreen' }, /identifies as data-screen="b", not the screen "a"/)
    await refused({ localeProof: { en: { selector: 'h1', includes: 'Goodbye' } } }, /locale proof expects/)
    await refused({ localeProof: {} }, /no locale proof/)
    await refused({ path: '/a-dark' }, /dark theme/)
    await refused({ path: '/a-norev' }, /did not state its revision/)
    await refused({ path: '/a-wronglang' }, /is in locale "fr", not "en"/)
    await refused({ locales: { en: '', vi: '' } }, /locale proof expects/, 'vi')
  } catch (error) {
    if (error.code === 'EPERM') return
    throw error
  } finally {
    server.close()
    if (b.browser) await b.browser.close()
    await cleanup(b.dir)
  }
})

test('a sheet is fresh only with its story source unchanged and, for a product image, its full provenance', async () => {
  const dir = await tempDir('ui-fresh')
  try {
    writeFileSync(path.join(dir, 's.tsx'), 'story')
    const sha = createHash('sha256').update('story').digest('hex')
    const base = { bench: { file: 'b.png', sha256: 'x' }, storySourceSha256: sha }
    assert.equal(await sheetIsFresh(base, dir, 's.tsx'), true)
    assert.equal(await sheetIsFresh({ ...base, storySourceSha256: 'other' }, dir, 's.tsx'), false)
    assert.equal(await sheetIsFresh({ ...base, bench: { file: 'b.png' } }, dir, 's.tsx'), false)
    const prov = {
      route: '/a',
      identityValue: 'a',
      routeSha256: 'r',
      locale: 'en',
      theme: 'light',
      viewport: '400x300',
      revision: 'r'
    }
    const withProduct = { ...base, product: { file: 'p.png', sha256: 'y', provenance: prov } }
    assert.equal(await sheetIsFresh(withProduct, dir, 's.tsx'), true)
    for (const missing of [
      'route',
      'identityValue',
      'routeSha256',
      'locale',
      'theme',
      'viewport',
      'revision'
    ])
      assert.equal(
        await sheetIsFresh(
          { ...withProduct, product: { ...withProduct.product, provenance: { ...prov, [missing]: '' } } },
          dir,
          's.tsx'
        ),
        false,
        missing
      )
    // the route declared today must still hash to the one the image came from
    const sameRoute = { x: 1 }
    const fresh = { ...withProduct, screen: 'screen:a' }
    fresh.product.provenance.routeSha256 = createHash('sha256')
      .update(stableStringify(sameRoute))
      .digest('hex')
    assert.equal(await sheetIsFresh(fresh, dir, 's.tsx', { routes: { 'screen:a': sameRoute } }), true)
    assert.equal(await sheetIsFresh(fresh, dir, 's.tsx', { routes: { 'screen:a': { x: 2 } } }), false)
    assert.equal(await sheetIsFresh(fresh, dir, 's.tsx', { routes: {} }), false)
    assert.equal(await sheetIsFresh(fresh, dir, 's.tsx', { revision: 'newer' }), false)
    // recorded image hashes must match the files on disk
    writeFileSync(path.join(dir, 'b.png'), 'bench')
    writeFileSync(path.join(dir, 'p.png'), 'prod')
    const imgs = {
      ...fresh,
      bench: { file: 'b.png', sha256: createHash('sha256').update('bench').digest('hex') },
      product: { ...fresh.product, sha256: createHash('sha256').update('prod').digest('hex') }
    }
    assert.equal(await sheetIsFresh(imgs, dir, 's.tsx', { imageRoot: dir }), true)
    writeFileSync(path.join(dir, 'p.png'), 'tampered')
    assert.equal(await sheetIsFresh(imgs, dir, 's.tsx', { imageRoot: dir }), false)
    assert.equal(
      await sheetIsFresh({ ...base, product: { file: 'p.png', sha256: 'y' } }, dir, 's.tsx'),
      false,
      'two images of the same size without provenance are not a fresh sheet'
    )
  } finally {
    await cleanup(dir)
  }
})

test('stand safety in a real browser: a stand page can neither write, register a service worker nor open a WebSocket', async () => {
  const b = await tryBrowser()
  const seen = []
  const html = `<html lang="en"><body><h1>Hello</h1><div id="screen-a" data-screen="a">screen</div><img src="/slow">
<script>
fetch('/write', { method: 'POST', body: 'x' }).catch(() => {})
try { new WebSocket('ws://' + location.host + '/socket') } catch {}
if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(() => {})
</script></body></html>`
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${new URL(req.url, 'http://x').pathname}`)
    if (req.url === '/slow') return void setTimeout(() => res.end(), 700)
    if (req.url === '/sw.js') {
      res.setHeader('content-type', 'text/javascript')
      return void res.end('')
    }
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('x-rev', 'abc123')
    res.end(html)
  })
  server.on('upgrade', (req, socket) => {
    seen.push(`UPGRADE ${req.url}`)
    socket.destroy()
  })
  try {
    if (b.error) return assert.ok(b.error instanceof EnvError)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}/`
    const routes = {
      'screen:a': {
        path: '/a',
        identity: { selector: '#screen-a', attribute: 'data-screen', value: 'a' },
        revisionHeader: 'x-rev',
        locales: { en: '' },
        localeProof: { en: { selector: 'h1', includes: 'Hello' } }
      }
    }
    const r = await captureProduct({
      itemId: 'screen:a',
      lang: 'en',
      viewport: { width: 400, height: 300 },
      browser: b.browser,
      stand: { ok: true, url, detail: 'up' },
      routes
    })
    assert.ok(!r.reason || !/leaves the stand/.test(r.reason), r.reason)
    assert.ok(seen.includes('GET /a'), `the screen itself was read: ${seen}`)
    assert.ok(seen.includes('GET /slow'), `the page stayed open past its scripts: ${seen}`)
    assert.deepEqual(
      seen.filter((s) => s !== 'GET /a' && s !== 'GET /slow' && s !== 'GET /favicon.ico'),
      [],
      'no write, service worker script or WebSocket reached the stand'
    )
  } finally {
    server.close()
    if (b.browser) await b.browser.close()
    await cleanup(b.dir)
  }
})
