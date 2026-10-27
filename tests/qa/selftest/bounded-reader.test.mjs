// The shared bounded reader (lib/bounded-reader.mjs) and every real reader of contract files that
// goes through it. Four hostile inputs (a FIFO, a symlink, a file over the ceiling, a file that changes
// while it is read) must each be refused with a clear error within a bounded time, by the shared reader
// and by a real caller in every layer. Each caller runs in its own process with a deadline, so a reader
// that blocks on a FIFO fails the test instead of hanging it.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BoundedReadError,
  CHUNK_BYTES,
  listBoundedDirAsync,
  listBoundedDirSync,
  readBoundedAsync,
  readBoundedJsonSync,
  readBoundedSync
} from '../lib/bounded-reader.mjs'
import { UnsafePathError, containedPath, listRegularFiles, lstatOrNull } from '../lib/fsafe.mjs'
import { pinCheck, PINS } from '../layers/related/specs/chain.mjs'
import { CALLERS, GOOD } from './fixtures/bounded-reader/callers.mjs'
import { tmpDir } from './helpers.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHILD = path.join(HERE, 'fixtures/bounded-reader/child.mjs')
const PRELOAD = path.join(HERE, 'fixtures/bounded-reader/preload.mjs')
const DEADLINE_MS = 20_000

/**
 * Runs one reader on one file in a child process. Resolves { status, signal, ...reply } only after the child
 * has closed: a reader that blocks is killed at the deadline and reported as { hung: true } once it is gone.
 */
function runCaller(name, file, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', PRELOAD, CHILD, name, file], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let hung = false
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => {
      hung = true
      child.kill('SIGKILL')
    }, DEADLINE_MS)
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      if (hung) return resolve({ hung: true, status, signal, stderr })
      try {
        resolve({ status, signal, stderr, ...JSON.parse(stdout.trim().split('\n').at(-1)) })
      } catch {
        resolve({ crashed: true, status, signal, stdout, stderr })
      }
    })
  })
}

const REFUSAL = {
  fifo: /regular file/i,
  symlink: /symlink|not a regular file/i,
  oversized: /larger than|too large|limit/i,
  grows: /changed while|unstable/i,
  shrinks: /changed while|unstable/i
}

async function scenario(dir, kind, caller) {
  const { limit } = caller
  const content = caller.content ?? GOOD
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, 'hostile.json')
  if (kind === 'fifo') assert.equal(spawnSync('mkfifo', [file]).status, 0, 'mkfifo')
  else if (kind === 'symlink') {
    await fs.writeFile(path.join(dir, 'real.json'), content)
    await fs.symlink(path.join(dir, 'real.json'), file)
  } else if (kind === 'oversized') {
    await fs.writeFile(file, content)
    await fs.truncate(file, limit + 1)
  } else await fs.writeFile(file, kind === 'control' ? content : content.repeat(64))
  return file
}

const ENV = { grows: { QA_GROW_MODE: 'grow' }, shrinks: { QA_GROW_MODE: 'shrink' } }

for (const [name, caller] of Object.entries(CALLERS)) {
  test(`${name}: refuses a FIFO, a symlink, an oversized file and a file that changes while read`, async () => {
    const root = await tmpDir('bounded')
    const control = await scenario(path.join(root, 'control'), 'control', caller)
    const accepted = await runCaller(name, control)
    // The positive control: the caller exits cleanly and returns exactly what its own contract says it read.
    assert.ok(!accepted.hung && !accepted.crashed, `positive control: ${JSON.stringify(accepted)}`)
    assert.equal(accepted.status, 0, `positive control exit status: ${JSON.stringify(accepted)}`)
    assert.equal(accepted.ok, true, `positive control was refused: ${accepted.message}`)
    assert.deepEqual(accepted.value, caller.expected, 'positive control read the wrong value')
    for (const kind of ['fifo', 'symlink', 'oversized', 'grows', 'shrinks']) {
      const file = await scenario(path.join(root, kind), kind, caller)
      const result = await runCaller(name, file, ENV[kind])
      assert.ok(!result.hung, `${kind}: the reader did not return within ${DEADLINE_MS} ms`)
      assert.ok(!result.crashed, `${kind}: the check itself failed: ${JSON.stringify(result)}`)
      assert.equal(result.status, 0, `${kind}: child exit status ${result.status} ${result.signal ?? ''}`)
      assert.equal(result.ok, false, `${kind}: the hostile file was accepted`)
      assert.match(result.message, REFUSAL[kind], `${kind}: refused for the wrong reason: ${result.message}`)
    }
  })
}

test('shared reader: a file over the ceiling is refused before any byte is read', async () => {
  const dir = await tmpDir('bounded-size')
  const file = path.join(dir, 'big.bin')
  await fs.writeFile(file, '')
  await fs.truncate(file, 101)
  let chunks = 0
  const hooks = { afterChunk: () => chunks++ }
  assert.throws(() => readBoundedSync(file, { maxBytes: 100, hooks }), /larger than 100 bytes/)
  await assert.rejects(readBoundedAsync(file, { maxBytes: 100, hooks }), /larger than 100 bytes/)
  assert.equal(chunks, 0)
  await fs.truncate(file, 100)
  assert.equal(readBoundedSync(file, { maxBytes: 100 }).length, 100, 'exactly the ceiling is allowed')
  assert.equal((await readBoundedAsync(file, { maxBytes: 100 })).length, 100)
})

test('shared reader: a file that grows after the size check is read for at most maxBytes + 1 bytes', async () => {
  const dir = await tmpDir('bounded-grow')
  const file = path.join(dir, 'grow.bin')
  const ceiling = 3 * CHUNK_BYTES
  for (const mode of ['sync', 'async']) {
    await fs.writeFile(file, 'tiny')
    let chunks = 0
    const hooks = {
      // Grows right after the descriptor's own stat, with plain sync I/O in both modes.
      afterHandleStat: () => appendFileSync(file, Buffer.alloc(10 * CHUNK_BYTES)),
      afterChunk: () => chunks++
    }
    const read =
      mode === 'sync'
        ? async () => readBoundedSync(file, { maxBytes: ceiling, hooks })
        : () => readBoundedAsync(file, { maxBytes: ceiling, hooks })
    await assert.rejects(read(), /larger than/, mode)
    assert.equal(chunks, 3, `${mode}: read ${chunks} chunks, expected the 3 below the ceiling and no more`)
  }
})

test('shared reader: growth below the ceiling, shrinking and an in-place rewrite are refused', async () => {
  const dir = await tmpDir('bounded-unstable')
  const file = path.join(dir, 'data.bin')
  const cases = {
    'grows below the ceiling': () => appendFileSync(file, 'more'),
    shrinks: () => truncateSync(file, 2),
    'same size, other mtime': () => {
      writeFileSync(file, 'ABCDEFGH')
      utimesSync(file, new Date(2001, 1, 1), new Date(2001, 1, 1))
    }
  }
  for (const [label, change] of Object.entries(cases)) {
    for (const hook of ['afterHandleStat', 'afterChunk']) {
      await fs.writeFile(file, 'abcdefgh')
      let fired = false
      const hooks = {
        [hook]: () => {
          if (!fired) change()
          fired = true
        }
      }
      assert.throws(
        () => readBoundedSync(file, { maxBytes: 1000, hooks }),
        /changed while being read/,
        `sync ${label} ${hook}`
      )
      fired = false
      await fs.writeFile(file, 'abcdefgh')
      await assert.rejects(
        readBoundedAsync(file, { maxBytes: 1000, hooks }),
        /changed while being read/,
        `async ${label} ${hook}`
      )
    }
  }
  await fs.writeFile(file, 'abcdefgh')
  assert.equal(
    readBoundedSync(file, { maxBytes: 1000 }).toString(),
    'abcdefgh',
    'stable file: positive control'
  )
})

test('shared reader: a file swapped for a symlink or another file between inspection and open is refused', async () => {
  const dir = await tmpDir('bounded-swap')
  const file = path.join(dir, 'data.json')
  const other = path.join(dir, 'other.json')
  const swaps = {
    symlink: [
      () => {
        rmSync(file)
        symlinkSync(other, file)
      },
      /symlink|not a regular file/
    ],
    'another regular file': [
      () => {
        rmSync(file)
        writeFileSync(file, GOOD)
      },
      /replaced between inspection and open/
    ],
    fifo: [
      () => {
        rmSync(file)
        spawnSync('mkfifo', [file])
      },
      /not a regular file/
    ]
  }
  for (const [label, [swap, expected]] of Object.entries(swaps)) {
    for (const mode of ['sync', 'async']) {
      writeFileSync(file, GOOD)
      writeFileSync(other, GOOD)
      const hooks = { afterLstat: swap }
      const attempt =
        mode === 'sync'
          ? async () => readBoundedSync(file, { maxBytes: 100, hooks })
          : () => readBoundedAsync(file, { maxBytes: 100, hooks })
      await assert.rejects(attempt(), expected, `${mode} ${label}`)
      rmSync(file, { force: true })
    }
  }
})

test('shared reader: missing files, bad limits and bad paths', async () => {
  const dir = await tmpDir('bounded-args')
  const missing = path.join(dir, 'absent.json')
  assert.throws(
    () => readBoundedSync(missing, { maxBytes: 10 }),
    (e) => e instanceof BoundedReadError && e.code === 'MISSING' && /ENOENT/.test(e.message)
  )
  assert.equal(readBoundedSync(missing, { maxBytes: 10, allowMissing: true }), null)
  assert.equal(await readBoundedAsync(missing, { maxBytes: 10, allowMissing: true }), null)
  const dangling = path.join(dir, 'dangling.json')
  await fs.symlink(missing, dangling)
  assert.throws(
    () => readBoundedSync(dangling, { maxBytes: 10, allowMissing: true }),
    /not a regular file/,
    'a dangling symlink is not "missing"'
  )
  await assert.rejects(readBoundedAsync(dir, { maxBytes: 10 }), /not a regular file/, 'directory')
  // Bad limits are refused before any I/O, so even a FIFO that would block cannot hang them.
  const fifo = path.join(dir, 'pipe')
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0)
  for (const bad of [undefined, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, '10', null])
    assert.throws(() => readBoundedSync(fifo, { maxBytes: bad }), /maxBytes/, String(bad))
  for (const badPath of ['', undefined, 'a\0b', 5])
    assert.throws(() => readBoundedSync(badPath, { maxBytes: 1 }), /bad path/)
  await assert.rejects(readBoundedAsync(fifo, { maxBytes: Number.NaN }), /maxBytes/)
  assert.throws(
    () => readBoundedSync(fifo, { maxBytes: 10 }),
    /not a regular file/,
    'a FIFO is refused, not waited for'
  )
  // Empty and malformed JSON.
  const empty = path.join(dir, 'empty.json')
  await fs.writeFile(empty, '')
  assert.equal(readBoundedSync(empty, { maxBytes: 10 }).length, 0)
  assert.throws(
    () => readBoundedJsonSync(empty, { maxBytes: 10 }),
    (e) => e.code === 'MALFORMED'
  )
  await fs.writeFile(empty, '{"a":1}')
  assert.deepEqual(readBoundedJsonSync(empty, { maxBytes: 100 }), { a: 1 })
})

test('shared reader: no descriptor is left open by a refusal or a failure', async () => {
  const dir = await tmpDir('bounded-fd')
  const file = path.join(dir, 'data.bin')
  const open = () => readdirSync('/dev/fd').length
  await fs.writeFile(file, 'abcdefgh')
  const refusals = [
    () => readBoundedSync(file, { maxBytes: 3 }),
    () =>
      readBoundedSync(file, {
        maxBytes: 100,
        hooks: {
          afterHandleStat: () => {
            throw new Error('hook')
          }
        }
      }),
    () =>
      readBoundedSync(file, {
        maxBytes: 100,
        hooks: {
          afterChunk: () => {
            throw new Error('hook')
          }
        }
      }),
    () => readBoundedSync(dir, { maxBytes: 100 })
  ]
  const before = open()
  for (let i = 0; i < 100; i += 1) {
    for (const refuse of refusals) assert.throws(refuse)
    await assert.rejects(readBoundedAsync(file, { maxBytes: 3 }))
    await assert.rejects(
      readBoundedAsync(file, {
        maxBytes: 100,
        hooks: {
          afterChunk: () => {
            throw new Error('hook')
          }
        }
      })
    )
  }
  assert.ok(open() <= before + 2, `descriptors: ${before} before, ${open()} after`)
  assert.equal(readBoundedSync(file, { maxBytes: 100 }).toString(), 'abcdefgh', 'readable again')
})

test('ui readIfExists: only ENOENT is absence; a file used as a directory is refused', async () => {
  const dir = await tmpDir('bounded-enotdir')
  const plain = path.join(dir, 'plain.json')
  await fs.writeFile(plain, GOOD)
  const { readIfExists } = await import(path.join(HERE, '../layers/ui/artifacts.mjs'))
  assert.equal(await readIfExists(path.join(dir, 'missing.json'), { root: dir }), null)
  await assert.rejects(readIfExists(path.join(plain, 'child.json'), { root: dir }), /not a directory|ENOTDIR/)
})

test('cms checkSecrets: a FIFO or symlink inside the contract directory fails the scan', async () => {
  const dir = await tmpDir('bounded-secrets')
  const { checkSecrets } = await import(path.join(HERE, '../layers/cms/specs/release-data.mjs'))
  const ctx = { dataRoot: dir, params: { dir: 'rel' } }
  await fs.mkdir(path.join(dir, 'rel/sub'), { recursive: true })
  await fs.writeFile(path.join(dir, 'rel/sub/ok.json'), GOOD)
  assert.equal((await checkSecrets(ctx)).ok, true)
  assert.equal(spawnSync('mkfifo', [path.join(dir, 'rel/sub/pipe')]).status, 0, 'mkfifo')
  const withFifo = await checkSecrets(ctx)
  assert.equal(withFifo.ok, false)
  assert.match(withFifo.detail, /pipe/)
  await fs.rm(path.join(dir, 'rel/sub/pipe'))
  await fs.symlink(path.join(dir, 'rel/sub/ok.json'), path.join(dir, 'rel/link.json'))
  const withLink = await checkSecrets(ctx)
  assert.equal(withLink.ok, false)
  assert.match(withLink.detail, /link\.json/)
})

// ---- ancestors, absence and vanishing: the part of the policy that is about the path, not the file ----

const refusal = (code) => (error) => error instanceof BoundedReadError && error.code === code

test('shared reader: with a root, a symlink, a file or a missing directory on the way is refused, never read through', async () => {
  const dir = await tmpDir('bounded-ancestors')
  await fs.mkdir(path.join(dir, 'real'))
  await fs.writeFile(path.join(dir, 'real/f.json'), GOOD)
  await fs.symlink(path.join(dir, 'real'), path.join(dir, 'live'))
  await fs.symlink(path.join(dir, 'nowhere'), path.join(dir, 'broken'))
  await fs.symlink(dir, path.join(dir, 'self'))
  await fs.writeFile(path.join(dir, 'plain.json'), GOOD)
  const options = { maxBytes: 100, root: dir }
  const options2 = { ...options, allowMissing: true }
  assert.equal(readBoundedSync(path.join(dir, 'real/f.json'), options).toString(), GOOD)
  for (const opts of [options, options2]) {
    for (const [what, rel, code] of [
      ['live symlink ancestor', 'live/f.json', 'SYMLINK'],
      ['broken symlink ancestor', 'broken/f.json', 'SYMLINK'],
      ['symlink to the root itself', 'self/real/f.json', 'SYMLINK'],
      ['a file used as a directory', 'plain.json/f.json', 'ANCESTOR'],
      ['a missing intermediate directory', 'absent/f.json', 'ANCESTOR']
    ]) {
      const file = path.join(dir, rel)
      assert.throws(() => readBoundedSync(file, opts), refusal(code), `sync ${what}`)
      await assert.rejects(readBoundedAsync(file, opts), refusal(code), `async ${what}`)
    }
  }
  assert.throws(() => readBoundedSync(path.join(dir, '../elsewhere.json'), options), refusal('ESCAPE'))
  assert.throws(() => readBoundedSync(path.join(dir, 'real/f.json'), { ...options, root: '' }), /bad root/)
})

test('shared reader: only the file itself being absent is MISSING, and only allowMissing turns that into null', async () => {
  const dir = await tmpDir('bounded-missing')
  await fs.mkdir(path.join(dir, 'real'))
  const absent = path.join(dir, 'real/absent.json')
  const options = { maxBytes: 100, root: dir }
  assert.equal(readBoundedSync(absent, { ...options, allowMissing: true }), null)
  assert.equal(await readBoundedAsync(absent, { ...options, allowMissing: true }), null)
  assert.equal(readBoundedJsonSync(absent, { ...options, allowMissing: true }), null)
  assert.throws(() => readBoundedSync(absent, options), refusal('MISSING'))
  await assert.rejects(readBoundedAsync(absent, options), refusal('MISSING'))
  // Without a root the parent must still be a directory that exists.
  assert.throws(
    () => readBoundedSync(path.join(dir, 'nope/x.json'), { maxBytes: 5, allowMissing: true }),
    refusal('ANCESTOR')
  )
  // A file that disappears after it was inspected is an error, not an absent optional file.
  const vanishing = path.join(dir, 'real/vanishing.json')
  await fs.writeFile(vanishing, GOOD)
  const vanish = () => rmSync(vanishing)
  assert.throws(
    () => readBoundedSync(vanishing, { ...options, allowMissing: true, hooks: { afterLstat: vanish } }),
    refusal('VANISHED')
  )
  await fs.writeFile(vanishing, GOOD)
  await assert.rejects(
    readBoundedAsync(vanishing, { ...options, allowMissing: true, hooks: { afterLstat: vanish } }),
    refusal('VANISHED')
  )
})

test('shared reader: a directory that cannot be searched is an error, not an absent file', async (t) => {
  if (process.getuid?.() === 0) return t.skip('root ignores directory permissions')
  const dir = await tmpDir('bounded-eacces')
  const locked = path.join(dir, 'locked')
  await fs.mkdir(locked)
  await fs.writeFile(path.join(locked, 'f.json'), GOOD)
  await fs.chmod(locked, 0)
  try {
    const options = { maxBytes: 100, root: dir, allowMissing: true }
    assert.throws(() => readBoundedSync(path.join(locked, 'f.json'), options), refusal('UNREADABLE'))
    await assert.rejects(readBoundedAsync(path.join(locked, 'absent.json'), options), refusal('UNREADABLE'))
  } finally {
    await fs.chmod(locked, 0o700)
  }
})

test('shared lister: a symlinked or missing directory is refused and non-files are named, not dropped', async () => {
  const dir = await tmpDir('bounded-list')
  await fs.mkdir(path.join(dir, 'real/sub'), { recursive: true })
  await fs.writeFile(path.join(dir, 'real/a.json'), GOOD)
  await fs.symlink(path.join(dir, 'real/a.json'), path.join(dir, 'real/link.json'))
  assert.equal(spawnSync('mkfifo', [path.join(dir, 'real/pipe')]).status, 0, 'mkfifo')
  await fs.symlink(path.join(dir, 'real'), path.join(dir, 'alias'))
  const kinds = (entries) => Object.fromEntries(entries.map((e) => [e.name, e.kind]))
  const expected = { 'a.json': 'file', 'link.json': 'other', pipe: 'other', sub: 'dir' }
  assert.deepEqual(kinds(listBoundedDirSync(path.join(dir, 'real'), { root: dir })), expected)
  assert.deepEqual(kinds(await listBoundedDirAsync(path.join(dir, 'real'), { root: dir })), expected)
  for (const rel of ['alias', 'absent', 'real/a.json']) {
    assert.throws(() => listBoundedDirSync(path.join(dir, rel), { root: dir }), BoundedReadError, rel)
    await assert.rejects(listBoundedDirAsync(path.join(dir, rel), { root: dir }), BoundedReadError, rel)
  }
})

test('ui readRegular/readIfExists: a symlink or broken link in the parent chain is refused, not read or treated as absent', async () => {
  const dir = await tmpDir('bounded-ui-ancestors')
  const { readIfExists, readRegular } = await import(path.join(HERE, '../layers/ui/artifacts.mjs'))
  await fs.mkdir(path.join(dir, 'real'))
  await fs.writeFile(path.join(dir, 'real/f.json'), GOOD)
  await fs.symlink(path.join(dir, 'real'), path.join(dir, 'live'))
  await fs.symlink(path.join(dir, 'nowhere'), path.join(dir, 'broken'))
  assert.equal(await readRegular(path.join(dir, 'real/f.json'), { root: dir }), GOOD)
  assert.equal(await readIfExists(path.join(dir, 'real/absent.json'), { root: dir }), null)
  for (const rel of ['live/f.json', 'broken/f.json', 'absent/f.json', 'real/f.json/x']) {
    await assert.rejects(
      readIfExists(path.join(dir, rel), { root: dir }),
      /symlink|not a directory|cannot be inspected/,
      rel
    )
    await assert.rejects(readRegular(path.join(dir, rel), { root: dir }), undefined, rel)
  }
  await assert.rejects(readIfExists(path.join(dir, '../out.json'), { root: dir }), /outside/)
})

test('cms checkSecrets: a symlinked contract directory or ancestor, a vanished or non-regular design copy and a listing error fail the scan', async () => {
  const dir = await tmpDir('bounded-secrets-ancestors')
  const { checkSecrets } = await import(path.join(HERE, '../layers/cms/specs/release-data.mjs'))
  const ctxFor = (rel) => ({ dataRoot: dir, params: { dir: rel } })
  await fs.mkdir(path.join(dir, 'real/rel'), { recursive: true })
  await fs.writeFile(path.join(dir, 'real/rel/ok.json'), GOOD)
  await fs.symlink(path.join(dir, 'real/rel'), path.join(dir, 'link-rel'))
  await fs.symlink(path.join(dir, 'real'), path.join(dir, 'link-real'))
  assert.equal((await checkSecrets(ctxFor('real/rel'))).ok, true, 'absent design copy is allowed')
  for (const rel of ['link-rel', 'link-real/rel', 'absent', 'real/rel/ok.json']) {
    const result = await checkSecrets(ctxFor(rel))
    assert.equal(result.ok, false, `${rel}: scan reported ok`)
    assert.match(result.detail, /unsafe or unreadable/, rel)
  }
  // The companion design file is optional, but if it is there it must be a regular file.
  await fs.writeFile(path.join(dir, 'real/rel.design.json'), GOOD)
  assert.equal((await checkSecrets(ctxFor('real/rel'))).ok, true)
  await fs.rm(path.join(dir, 'real/rel.design.json'))
  await fs.symlink(path.join(dir, 'real/rel/ok.json'), path.join(dir, 'real/rel.design.json'))
  const linked = await checkSecrets(ctxFor('real/rel'))
  assert.equal(linked.ok, false)
  assert.match(linked.detail, /rel\.design\.json/)
  await fs.rm(path.join(dir, 'real/rel.design.json'))
  assert.equal(spawnSync('mkfifo', [path.join(dir, 'real/rel.design.json')]).status, 0, 'mkfifo')
  const piped = await checkSecrets(ctxFor('real/rel'))
  assert.equal(piped.ok, false)
  assert.match(piped.detail, /rel\.design\.json/)
})

test('cms checkLocks: the lock files must be regular and under real directories; only the design copy may be absent', async () => {
  const dir = await tmpDir('bounded-locks')
  const { checkLocks } = await import(path.join(HERE, '../layers/cms/specs/release-data.mjs'))
  const ctxFor = (rel) => ({ dataRoot: dir, params: { dir: rel, platform: 'joomla', id: 'x' } })
  const write = (rel, text = '{}') => fs.writeFile(path.join(dir, rel), text)
  await fs.mkdir(path.join(dir, 'rel'))
  await write('rel/presentation-lock.json')
  await write('rel/content-map.json')
  assert.equal((await checkLocks(ctxFor('rel'))).ok, true, 'absent design copy is allowed')
  await write('rel.design.json')
  assert.equal((await checkLocks(ctxFor('rel'))).ok, true)
  await fs.rm(path.join(dir, 'rel.design.json'))
  await fs.symlink(path.join(dir, 'rel/content-map.json'), path.join(dir, 'rel.design.json'))
  assert.match((await checkLocks(ctxFor('rel'))).detail, /design file/)
  await fs.rm(path.join(dir, 'rel.design.json'))
  await fs.symlink(path.join(dir, 'rel'), path.join(dir, 'link'))
  await fs.symlink(path.join(dir, 'nowhere'), path.join(dir, 'broken'))
  for (const rel of ['link', 'broken', 'absent']) {
    const result = await checkLocks(ctxFor(rel))
    assert.equal(result.ok, false, `${rel}: reported ok`)
  }
  await fs.rm(path.join(dir, 'rel/content-map.json'))
  assert.match((await checkLocks(ctxFor('rel'))).detail, /content-map\.json/)
})

test('optional readers (fsafe, mail, harness coverage) return null only for a file absent under a valid parent', async () => {
  const dir = await tmpDir('bounded-optional')
  await fs.writeFile(path.join(dir, 'plain'), GOOD)
  await fs.mkdir(path.join(dir, 'real'))
  const { readRegularFile } = await import(path.join(HERE, '../lib/fsafe.mjs'))
  const { readRegularBytes } = await import(path.join(HERE, '../layers/mail/common.mjs'))
  const { coverageRun } = await import(path.join(HERE, '../layers/harness/report.mjs'))
  assert.equal(await readRegularFile(path.join(dir, 'real/absent.json')), null)
  assert.equal(readRegularBytes(path.join(dir, 'real/absent.json')), null)
  assert.equal(coverageRun([], path.join(dir, 'real/absent.json')), null)
  assert.equal(coverageRun([], null), null)
  for (const rel of ['plain/x.json', 'absent/x.json']) {
    await assert.rejects(readRegularFile(path.join(dir, rel)), undefined, `fsafe ${rel}`)
    assert.throws(() => readRegularBytes(path.join(dir, rel)), undefined, `mail ${rel}`)
    assert.throws(() => coverageRun([], path.join(dir, rel)), undefined, `coverageRun ${rel}`)
  }
})

test("shared reader without a root: a symlink at the leaf or at the leaf's parent is refused; links above the parent are followed", async () => {
  const dir = await tmpDir('bounded-noroot')
  await fs.mkdir(path.join(dir, 'real/inner'), { recursive: true })
  await fs.writeFile(path.join(dir, 'real/inner/f.json'), GOOD)
  await fs.symlink(path.join(dir, 'real/inner'), path.join(dir, 'parent-link'))
  await fs.symlink(path.join(dir, 'real/inner'), path.join(dir, 'real/dangling-parent'))
  await fs.symlink(path.join(dir, 'nowhere'), path.join(dir, 'broken-parent'))
  await fs.symlink(path.join(dir, 'real/inner/f.json'), path.join(dir, 'real/inner/leaf-link.json'))
  await fs.symlink(path.join(dir, 'real'), path.join(dir, 'grand-link'))
  const options = { maxBytes: 100 }
  assert.equal(readBoundedSync(path.join(dir, 'real/inner/f.json'), options).toString(), GOOD)
  // Above the parent a symlink is allowed (checkouts and CI directories live under symlinked paths).
  assert.equal(readBoundedSync(path.join(dir, 'grand-link/inner/f.json'), options).toString(), GOOD)
  assert.equal((await readBoundedAsync(path.join(dir, 'grand-link/inner/f.json'), options)).toString(), GOOD)
  for (const allowMissing of [false, true]) {
    for (const [what, rel, code] of [
      ['leaf symlink', 'real/inner/leaf-link.json', 'SYMLINK'],
      ['symlinked parent', 'parent-link/f.json', 'SYMLINK'],
      ['symlinked parent (second link)', 'real/dangling-parent/f.json', 'SYMLINK'],
      ['broken symlinked parent', 'broken-parent/f.json', 'SYMLINK']
    ]) {
      const file = path.join(dir, rel)
      assert.throws(() => readBoundedSync(file, { ...options, allowMissing }), refusal(code), `sync ${what}`)
      await assert.rejects(
        readBoundedAsync(file, { ...options, allowMissing }),
        refusal(code),
        `async ${what}`
      )
    }
  }
  assert.throws(() => listBoundedDirSync(path.join(dir, 'parent-link')), refusal('SYMLINK'))
})

test('refusals keep their cause: the reader and every adapter that wraps it', async () => {
  const dir = await tmpDir('bounded-cause')
  await fs.writeFile(path.join(dir, 'plain'), GOOD)
  const file = path.join(dir, 'plain/child.json')
  let reader
  try {
    readBoundedSync(path.join(dir, 'absent/child.json'), { maxBytes: 10, root: dir })
  } catch (error) {
    reader = error
  }
  assert.ok(reader instanceof BoundedReadError)
  assert.equal(reader.cause?.code, 'ENOENT', 'the original system error is the cause')
  const { readRegularFile } = await import(path.join(HERE, '../lib/fsafe.mjs'))
  const { readRegular } = await import(path.join(HERE, '../layers/ui/artifacts.mjs'))
  const { readRegularBytes } = await import(path.join(HERE, '../layers/mail/common.mjs'))
  const { readJsonFile } = await import(path.join(HERE, '../layers/cms/lib/kit.mjs'))
  const dangling = path.join(dir, 'dangling.json')
  await fs.symlink(path.join(dir, 'nowhere'), dangling)
  const causeOf = async (run) => {
    try {
      await run()
    } catch (error) {
      return error
    }
    assert.fail('expected a refusal')
  }
  for (const [what, run] of [
    ['fsafe', () => readRegularFile(dangling)],
    ['ui', () => readRegular(dangling, { root: dir })],
    ['mail', () => readRegularBytes(dangling)],
    ['cms', () => readJsonFile(dangling)]
  ]) {
    const error = await causeOf(run)
    assert.ok(error.cause instanceof BoundedReadError, `${what}: refusal lost its cause (${error.cause})`)
  }
  const { lstatOrNull } = await import(path.join(HERE, '../lib/fsafe.mjs'))
  assert.equal(await lstatOrNull(path.join(dir, 'absent')), null)
  await assert.rejects(lstatOrNull(file), (e) => e.code === 'ENOTDIR', 'ENOTDIR is a refusal, not absence')
  await assert.rejects(
    lstatOrNull(path.join(dir, 'missing-parent/child.json')),
    UnsafePathError,
    'missing parent'
  )
  const { listRegularFiles } = await import(path.join(HERE, '../lib/fsafe.mjs'))
  await assert.rejects(listRegularFiles(file, '.json'), (e) => e.code === 'ENOTDIR')
})

test('fsafe: a leaf under a missing or non-directory parent is a refusal, not an absent file', async () => {
  const dir = await tmpDir('bounded-missing-parent')
  await fs.writeFile(path.join(dir, 'plain'), GOOD)
  await fs.symlink(path.join(dir, 'nowhere'), path.join(dir, 'broken'))
  await fs.mkdir(path.join(dir, 'real-dir'))
  await fs.symlink(path.join(dir, 'real-dir'), path.join(dir, 'live'))
  assert.equal(await lstatOrNull(path.join(dir, 'absent.json')), null, 'leaf absent under a real parent')
  assert.deepEqual(
    await listRegularFiles(path.join(dir, 'absent'), '.json'),
    [],
    'absent directory under a real parent'
  )
  const reason = /parent/
  for (const rel of [
    'missing-parent/child.json',
    'plain/child.json',
    'broken/child.json',
    'live/child.json'
  ]) {
    await assert.rejects(lstatOrNull(path.join(dir, rel)), reason, `lstatOrNull ${rel}`)
    await assert.rejects(listRegularFiles(path.join(dir, rel), '.json'), reason, `listRegularFiles ${rel}`)
  }
  await assert.rejects(containedPath(dir, 'missing-parent/child.json'), reason, 'containedPath')
  assert.equal(await containedPath(dir, 'absent.json'), path.join(await fs.realpath(dir), 'absent.json'))
})

test('related pinCheck: a pin note the reader refuses keeps its reason; only an absent note means no pinned commit', async () => {
  const dir = await tmpDir('bounded-pin')
  const pin = 'wordpress-theme'
  const note = path.join(dir, PINS[pin].note)
  await fs.mkdir(path.dirname(note), { recursive: true })
  const ctx = { dataRoot: dir, params: { pin }, env: { PATH: process.env.PATH } }
  const absent = await pinCheck(ctx)
  assert.equal(absent.check.ok, false)
  assert.match(absent.check.detail, /names no pinned commit/, 'an absent note is "no pin"')
  const refused = {
    fifo: {
      code: 'NOT_REGULAR',
      make: async () => assert.equal(spawnSync('mkfifo', [note]).status, 0, 'mkfifo')
    },
    symlink: {
      code: 'SYMLINK',
      make: async () => {
        await fs.writeFile(path.join(dir, 'real.md'), 'x')
        await fs.symlink(path.join(dir, 'real.md'), note)
      }
    },
    oversized: {
      code: 'TOO_LARGE',
      make: async () => {
        await fs.writeFile(note, '')
        await fs.truncate(note, 32 * 1024 * 1024 + 1)
      }
    }
  }
  for (const [kind, { code, make }] of Object.entries(refused)) {
    await fs.rm(note, { force: true })
    await make()
    await assert.rejects(
      pinCheck(ctx),
      (e) => e instanceof BoundedReadError && e.code === code && e.message.includes(note),
      `${kind}: kept its refusal (${code}) and names the path`
    )
  }
})
