import { after, before, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { start } from '../src/server.js'

let root
let env
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'host-server-roots-'))
  env = {
    HOST_NAME: 'local',
    HOST_SECRET: 's3cr3t',
    TRACY_SITES_ROOT: root,
    TRACY_PRIVATE_ROOT: root,
    TRACY_FLEET_DIR: root,
    PORT: '0'
  }
})
after(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

test('start: boots a real HTTP server, serves /health, and closes cleanly', async () => {
  const { port, close, identified } = await start({
    env,
    log: { log() {}, warn() {} },
    run: async () => ({ code: 0, tail: [] })
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { docker: true, sitesRoot: true })
  } finally {
    await identified
    await close()
  }
})

test('start: an unsigned call to /_host/* is refused over a real socket too, not just app.fetch', async () => {
  const { port, close, identified } = await start({
    env,
    log: { log() {}, warn() {} },
    run: async () => ({ code: 0, tail: [] })
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/_host/provision`, { method: 'POST', body: '{}' })
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'BAD_SIGNATURE', why: 'missing' })
  } finally {
    await identified
    await close()
  }
})
