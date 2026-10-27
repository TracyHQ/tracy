import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { makeDocker } from '../lib/docker.mjs'
import { SHA, cli, fakeGit, tmpDir } from './helpers.mjs'
import { readTextAsync } from '../lib/bounded-reader.mjs'

// An executable standing in for `docker`: behaviour comes from a JSON file next to it.
async function fakeBinary(behavior) {
  const dir = await tmpDir('docker-bin')
  const bin = path.join(dir, 'docker')
  await fs.writeFile(path.join(dir, 'behavior.json'), JSON.stringify(behavior))
  await fs.writeFile(
    bin,
    `#!${process.execPath}
const fs = require('node:fs')
const b = JSON.parse(fs.readFileSync(__dirname + '/behavior.json', 'utf8'))
if (b.sleepMs) setTimeout(() => {}, b.sleepMs)
else {
  if (b.stdout) process.stdout.write(b.stdout)
  if (b.stderr) process.stderr.write(b.stderr)
  process.exit(b.code ?? 0)
}
`,
    { mode: 0o755 }
  )
  return bin
}

const ID = 'a'.repeat(64)
const DOCS = {
  container: (name, labels = {}) => ({
    Id: ID,
    Name: `/${name}`,
    Image: 'sha256:img',
    Config: { Labels: labels },
    State: { Status: 'running' }
  }),
  network: (name, labels = {}) => ({
    Id: ID,
    Name: name,
    Driver: 'bridge',
    Scope: 'local',
    IPAM: { Config: [] },
    Labels: labels
  }),
  volume: (name, labels = {}) => ({
    Name: name,
    Driver: 'local',
    Scope: 'local',
    CreatedAt: '2026-01-01T00:00:00Z',
    Labels: labels
  })
}
const inspectOut = (doc) => JSON.stringify([doc])

test('inspect: only an explicit "no such object" means absent', async () => {
  const gone = makeDocker({
    bin: await fakeBinary({ code: 1, stderr: 'Error: No such container: x' })
  })
  assert.equal(await gone.inspect('container', 'x'), null)
  const noDaemon = makeDocker({
    bin: await fakeBinary({ code: 1, stderr: 'Cannot connect to the Docker daemon' })
  })
  await assert.rejects(noDaemon.inspect('container', 'x'), /inspect x failed/)
  const missingBinary = makeDocker({ bin: path.join(await tmpDir('none'), 'docker') })
  await assert.rejects(missingBinary.inspect('volume', 'x'), /failed/)
})

test('inspect: malformed output is an error, even a successful empty list', async () => {
  const junk = makeDocker({ bin: await fakeBinary({ stdout: 'not json' }) })
  await assert.rejects(junk.inspect('network', 'x'), /unparseable/)
  const empty = makeDocker({ bin: await fakeBinary({ stdout: '[]' }) })
  await assert.rejects(empty.inspect('network', 'x'), /unexpected output shape/)
  const noName = makeDocker({ bin: await fakeBinary({ stdout: '[{"Id":"abc","Labels":{}}]' }) })
  await assert.rejects(noName.inspect('network', 'x'), /lacks a Name/)
  const many = makeDocker({
    bin: await fakeBinary({ stdout: JSON.stringify([DOCS.network('x'), DOCS.network('x')]) })
  })
  await assert.rejects(many.inspect('network', 'x'), /unexpected output shape/)
  const emptyOut = makeDocker({ bin: await fakeBinary({ stdout: '' }) })
  await assert.rejects(emptyOut.inspect('container', 'x'), /unparseable/)
  const garbled = makeDocker({ bin: await fakeBinary({ stdout: 'tchqa-x_a\nwarning: odd line\n' }) })
  await assert.rejects(garbled.list('network', 'tchqa-x'), /malformed output line/)
  await assert.rejects(garbled.listByPrefix('network', 'tchqa-x'), /malformed output line/)
})

test('list failures and daemon timeouts throw instead of returning an empty list', async () => {
  const broken = makeDocker({ bin: await fakeBinary({ code: 1, stderr: 'daemon not running' }) })
  await assert.rejects(broken.list('container', 'tchqa-x'), /failed/)
  await assert.rejects(broken.listByPrefix('volume', 'tchqa-x'), /failed/)
  assert.equal((await broken.available()).ok, false)
  const exec = await makeDocker({ bin: await fakeBinary({ sleepMs: 60_000 }) }).exec('c', ['true'], {
    timeoutMs: 200
  })
  assert.equal(exec.ok, false)
  assert.equal(exec.timedOut, true)
})

test('stand down with an unreadable daemon is nonzero and keeps the manifest', async () => {
  const resultsRoot = await tmpDir('stand-unknown')
  const { FakeDocker } = await import('./fake-docker.mjs')
  const docker = new FakeDocker()
  const env = {
    resultsRoot,
    docker,
    git: fakeGit({ sha: SHA, dirty: '' }),
    platform: 'linux',
    portBusy: async () => false
  }
  assert.equal((await cli(['stand', 'up', '--id', 'u1'], env)).code, 0)
  docker.inspect = async () => {
    throw new Error('docker container inspect failed: cannot connect to the daemon')
  }
  const r = await cli(['stand', 'down', '--id', 'u1', '-v'], env)
  assert.notEqual(r.code, 0)
  const manifest = JSON.parse(await readTextAsync(path.join(resultsRoot, 'stands/u1.json')))
  assert.notEqual(manifest.status, 'down')
  assert.ok(docker.names().containers.length > 0, 'nothing was deleted on an unknown state')
})

test('bounded read: a file that is too large or grows past the limit is refused', async () => {
  const { readRegularFile } = await import('../lib/fsafe.mjs')
  const dir = await tmpDir('bounded')
  const file = path.join(dir, 'big.json')
  await fs.writeFile(file, 'x'.repeat(100))
  assert.equal((await readRegularFile(file, { maxBytes: 100 })).length, 100)
  await assert.rejects(readRegularFile(file, { maxBytes: 99 }), /larger than/)
  // The stat said 10 bytes; the handle then delivers more: the byte limit holds on the handle.
  await fs.writeFile(file, 'y'.repeat(10))
  const fsMod = await import('node:fs/promises')
  const realOpen = fsMod.default.open
  fsMod.default.open = async (...args) => {
    const handle = await realOpen(...args)
    await fs.writeFile(file, 'z'.repeat(500))
    return handle
  }
  try {
    await assert.rejects(readRegularFile(file, { maxBytes: 50 }), /larger than/)
  } finally {
    fsMod.default.open = realOpen
  }
})

test('inspect: output or absence message about another object is never accepted', async () => {
  const otherVolume = makeDocker({
    bin: await fakeBinary({ stdout: inspectOut(DOCS.volume('other')) })
  })
  await assert.rejects(otherVolume.inspect('volume', 'tchqa-x_tracy-pg'), /output describes "other"/)
  const otherContainer = makeDocker({
    bin: await fakeBinary({ stdout: inspectOut(DOCS.container('other')) })
  })
  await assert.rejects(otherContainer.inspect('container', 'tchqa-x-web-1'), /output describes "other"/)
  const slash = makeDocker({
    bin: await fakeBinary({ stdout: inspectOut(DOCS.container('tchqa-x-web-1')) })
  })
  assert.equal((await slash.inspect('container', 'tchqa-x-web-1')).id, ID)
  const otherAbsent = makeDocker({
    bin: await fakeBinary({ code: 1, stderr: 'Error: No such container: other' })
  })
  await assert.rejects(otherAbsent.inspect('container', 'tchqa-x-web-1'), /inspect tchqa-x-web-1 failed/)
  const wrongKind = makeDocker({
    bin: await fakeBinary({ code: 1, stderr: 'Error: No such volume: tchqa-x-web-1' })
  })
  await assert.rejects(wrongKind.inspect('container', 'tchqa-x-web-1'), /failed/)
})

test('bounded read allocates by the real size, not by the ceiling', async () => {
  const { readRegularFile } = await import('../lib/fsafe.mjs')
  const file = path.join(await tmpDir('read-ceiling'), 'small.txt')
  await fs.writeFile(file, 'tiny')
  assert.equal((await readRegularFile(file, { maxBytes: 2 ** 40 })).toString(), 'tiny')
})

test('inspect: each kind accepts only its own shape; every cross-kind document is refused', async () => {
  const kinds = Object.keys(DOCS)
  for (const kind of kinds) {
    const good = makeDocker({ bin: await fakeBinary({ stdout: inspectOut(DOCS[kind]('res-1')) }) })
    const found = await good.inspect(kind, 'res-1')
    assert.equal(found.id, kind === 'volume' ? 'res-1@2026-01-01T00:00:00Z' : ID, kind)
    for (const other of kinds.filter((k) => k !== kind)) {
      const wrong = makeDocker({ bin: await fakeBinary({ stdout: inspectOut(DOCS[other]('res-1')) }) })
      await assert.rejects(wrong.inspect(kind, 'res-1'), /inspect res-1/, `${other} document as ${kind}`)
    }
    const badLabels = makeDocker({
      bin: await fakeBinary({ stdout: inspectOut(DOCS[kind]('res-1', { a: 1 })) })
    })
    await assert.rejects(badLabels.inspect(kind, 'res-1'), /string map/, `${kind} labels`)
    const noId = { ...DOCS[kind]('res-1') }
    delete noId.Id
    const bad = makeDocker({ bin: await fakeBinary({ stdout: inspectOut({ ...noId, Name: 'res-1' }) }) })
    if (kind !== 'volume') await assert.rejects(bad.inspect(kind, 'res-1'), /Id/, `${kind} without Id`)
  }
  // The reported failure: a network-shaped document must not become a container identity.
  const netAsContainer = makeDocker({
    bin: await fakeBinary({ stdout: '[{"Name":"x","Id":"abc","Labels":{}}]' })
  })
  await assert.rejects(netAsContainer.inspect('container', 'x'), /not a container|container Id/)
})

test('inspect: absence is recognised only as the whole message, per kind and name', async () => {
  const absent = {
    container: ['Error response from daemon: No such container: x', 'Error: No such container: x'],
    volume: ['Error response from daemon: get x: no such volume', 'Error: No such volume: x'],
    network: ['Error response from daemon: network x not found', 'Error: No such network: x']
  }
  for (const [kind, messages] of Object.entries(absent))
    for (const stderr of messages) {
      const d = makeDocker({ bin: await fakeBinary({ code: 1, stderr }) })
      assert.equal(await d.inspect(kind, 'x'), null, `${kind}: ${stderr}`)
      for (const bad of [
        `${stderr}\nCannot connect to the Docker daemon`,
        `Cannot connect to the Docker daemon\n${stderr}`,
        `${stderr} (and more)`
      ]) {
        const mixed = makeDocker({ bin: await fakeBinary({ code: 1, stderr: bad }) })
        await assert.rejects(mixed.inspect(kind, 'x'), /failed/, bad)
      }
      const otherName = makeDocker({ bin: await fakeBinary({ code: 1, stderr: stderr.replace(/x/g, 'y') }) })
      await assert.rejects(otherName.inspect(kind, 'x'), /failed/, `other name: ${stderr}`)
    }
  const crossKind = makeDocker({ bin: await fakeBinary({ code: 1, stderr: 'Error: No such volume: x' }) })
  await assert.rejects(crossKind.inspect('container', 'x'), /failed/)
})

test('inspect: a volume absence message must name the volume that was asked about', async () => {
  for (const stderr of [
    'no such volume',
    'Error: no such volume',
    'Error response from daemon: no such volume'
  ]) {
    const d = makeDocker({ bin: await fakeBinary({ code: 1, stderr }) })
    await assert.rejects(d.inspect('volume', 'x'), /failed/, stderr)
  }
  const named = makeDocker({ bin: await fakeBinary({ code: 1, stderr: 'Error: No such volume: x' }) })
  assert.equal(await named.inspect('volume', 'x'), null, 'positive control')
})

test('list output: only the final newline is dropped; an empty line elsewhere is malformed', async () => {
  const listing = async (stdout) => makeDocker({ bin: await fakeBinary({ stdout }) }).list('container', 'p')
  assert.deepEqual(await listing(''), [])
  assert.deepEqual(await listing('a\nb\n'), ['a', 'b'])
  assert.deepEqual(await listing('a\nb'), ['a', 'b'])
  for (const bad of ['a\n\nb\n', '\na\n', 'a\n\n', '\n', 'a\n WARNING: x\n'])
    await assert.rejects(listing(bad), /malformed output line/, JSON.stringify(bad))
  const prefixed = makeDocker({ bin: await fakeBinary({ stdout: 'p-a\n\np-b\n' }) })
  await assert.rejects(prefixed.listByPrefix('network', 'p'), /malformed output line/)
})

test('bounded read: maxBytes must be a finite non-negative integer, checked before any I/O', async () => {
  const { readRegularFile } = await import('../lib/fsafe.mjs')
  const file = path.join(await tmpDir('read-args'), 'f.txt')
  await fs.writeFile(file, 'abc')
  for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, -1, 1.5, '5', null, 2 ** 60])
    await assert.rejects(readRegularFile(file, { maxBytes: bad }), /maxBytes/, String(bad))
  await assert.rejects(
    readRegularFile(path.join(path.dirname(file), 'absent'), { maxBytes: Infinity }),
    /maxBytes/
  )
  assert.equal((await readRegularFile(file, { maxBytes: 3 })).toString(), 'abc', 'positive control')
  assert.equal(
    (await readRegularFile(file, { maxBytes: 0 }).catch((e) => e.message)).includes('larger'),
    true
  )
  await fs.writeFile(file, '')
  assert.equal((await readRegularFile(file, { maxBytes: 0 })).length, 0)
})

test('bounded read: every step of the race window is checked and the handle is closed', async () => {
  const { readRegularFile } = await import('../lib/fsafe.mjs')
  const dir = await tmpDir('read-race')
  const file = path.join(dir, 'f.txt')
  const reset = () => fs.writeFile(file, 'same-size!')
  await reset()
  assert.equal((await readRegularFile(file, { maxBytes: 100 })).length, 10, 'positive control')
  const swapped = async () => {
    // A different regular file of the same size takes the name between lstat and open.
    await fs.writeFile(path.join(dir, 'other.txt'), 'other-size')
    await fs.rename(path.join(dir, 'other.txt'), file)
  }
  const grow = (extra) => () => fs.appendFile(file, extra)
  const rewriteInPlace = async () => {
    await fs.writeFile(file, 'SAME-SIZE!', { flag: 'r+' })
    await fs.utimes(file, new Date(0), new Date(0))
  }
  const cases = {
    'replaced between lstat and open': [{ afterLstat: swapped }, /replaced between inspection and open/],
    'grows past the ceiling after handle.stat': [{ afterHandleStat: grow('y'.repeat(500)) }, /larger than/],
    'grows within the ceiling after handle.stat': [
      { afterHandleStat: grow('yy') },
      /changed while being read/
    ],
    'rewritten in place with the same size': [{ afterHandleStat: rewriteInPlace }, /changed while being read/]
  }
  for (const [name, [hooks, message]] of Object.entries(cases)) {
    await reset()
    await assert.rejects(readRegularFile(file, { maxBytes: 50, hooks }), message, name)
  }
  // A file large enough for several chunks that grows between chunks.
  await fs.writeFile(file, 'z'.repeat(1024 * 1024 + 10))
  let grown = false
  const growOnce = async () => {
    if (!grown) await fs.appendFile(file, 'q'.repeat(100))
    grown = true
  }
  await assert.rejects(
    readRegularFile(file, { maxBytes: 3 * 1024 * 1024, hooks: { afterChunk: growOnce } }),
    /changed while being read/,
    'grows between chunks'
  )
  await reset()
  assert.equal((await readRegularFile(file, { maxBytes: 100 })).length, 10, 'readable again: no leaked state')
})

test('a list that exits 0 with stderr output is unknown, so `stand down -v` keeps the fixture', async () => {
  const warned = makeDocker({ bin: await fakeBinary({ stdout: '', stderr: 'WARNING: partial answer' }) })
  await assert.rejects(warned.list('container', 'p'), /stderr/)
  await assert.rejects(warned.listByPrefix('volume', 'p'), /stderr/)
  const quiet = makeDocker({ bin: await fakeBinary({ stdout: '', stderr: '  \n' }) })
  await assert.rejects(quiet.list('container', 'p'), /stderr/, 'whitespace-only stderr is still unknown')
  await assert.rejects(quiet.listByPrefix('container', 'p'), /stderr/)
  const clean = makeDocker({ bin: await fakeBinary({ stdout: '', stderr: '' }) })
  assert.deepEqual(await clean.list('container', 'p'), [], 'empty stderr: a genuine empty list')

  const resultsRoot = await tmpDir('stand-stderr')
  const { FakeDocker } = await import('./fake-docker.mjs')
  const docker = new FakeDocker()
  const env = {
    resultsRoot,
    docker,
    git: fakeGit({ sha: SHA, dirty: '' }),
    platform: 'linux',
    portBusy: async () => false
  }
  assert.equal((await cli(['stand', 'up', '--id', 's1'], env)).code, 0)
  // Real adapter lists (warning on stderr), fake daemon for everything else.
  const mixed = Object.create(docker)
  mixed.list = (kind, project) => warned.list(kind, project)
  mixed.listByPrefix = (kind, prefix) => warned.listByPrefix(kind, prefix)
  const r = await cli(['stand', 'down', '--id', 's1', '-v'], { ...env, docker: mixed })
  assert.notEqual(r.code, 0)
  const manifest = JSON.parse(await readTextAsync(path.join(resultsRoot, 'stands/s1.json')))
  assert.notEqual(manifest.status, 'down')
  assert.ok((await fs.stat(path.join(resultsRoot, 'stands/s1'))).isDirectory(), 'fixture directory kept')
})
