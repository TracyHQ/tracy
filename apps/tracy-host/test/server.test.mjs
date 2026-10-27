import { test } from 'node:test'
import assert from 'node:assert/strict'
import { start } from '../src/server.js'

const env = {
  HOST_NAME: 'local',
  HOST_SECRET: 's3cr3t',
  TRACY_SITES_ROOT: process.cwd(),
  TRACY_PRIVATE_ROOT: process.cwd(),
  TRACY_FLEET_DIR: process.cwd(),
  PORT: '0'
}

test('start: boots a real HTTP server, serves /health, and closes cleanly', async () => {
  const { port, close } = await start({
    env,
    log: { log() {}, warn() {} },
    run: async () => ({ code: 0, tail: [] })
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { docker: true, sitesRoot: true })
  } finally {
    await close()
  }
})

test('start: an unsigned call to /_host/* is refused over a real socket too, not just app.fetch', async () => {
  const { port, close } = await start({
    env,
    log: { log() {}, warn() {} },
    run: async () => ({ code: 0, tail: [] })
  })
  try {
    const res = await fetch(`http://127.0.0.1:${port}/_host/provision`, { method: 'POST', body: '{}' })
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'BAD_SIGNATURE', why: 'missing' })
  } finally {
    await close()
  }
})
