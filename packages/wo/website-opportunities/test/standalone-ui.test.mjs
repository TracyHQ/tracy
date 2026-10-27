// The web page beside the standalone API (`serveUi`): files from one folder, `index.html` for client routes,
// never in place of an API answer.
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { Hono } from 'hono'
import { serveUi } from '../src/standalone/ui.js'

let dir
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wo-ui-'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>WO</title>')
  await writeFile(join(dir, 'app.js'), 'console.log(1)')
})
after(async () => {
  await rm(dir, { recursive: true, force: true })
})

function appWith(uiDir) {
  const app = new Hono()
  app.get('/api/x', (c) => c.json({ api: true }))
  return { app, mounted: serveUi(app, uiDir) }
}

test('serves the folder, and index.html for a path that is no file', async () => {
  const { app, mounted } = appWith(dir)
  assert.equal(mounted, true)
  assert.match(await (await app.request('/')).text(), /<title>WO<\/title>/)
  assert.equal(await (await app.request('/app.js')).text(), 'console.log(1)')
  assert.match(await (await app.request('/places/123')).text(), /<title>WO<\/title>/)
})

test('API and health paths are never answered by the page', async () => {
  const { app } = appWith(dir)
  assert.deepEqual(await (await app.request('/api/x')).json(), { api: true })
  assert.equal((await app.request('/api/missing')).status, 404)
  assert.equal((await app.request('/healthz')).status, 404)
})

test('a folder without index.html mounts nothing', async () => {
  const { app, mounted } = appWith(join(dir, 'missing'))
  assert.equal(mounted, false)
  assert.equal((await app.request('/')).status, 404)
})
