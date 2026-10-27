// http-parity refuses an input named on the command line that it cannot read, before it fetches
// anything: a mistyped --accept path used to be skipped in silence, so every written-down exception
// vanished and the run still looked like a judged one (issue #7 item 3). A missing file, a flag with
// no value and a file that is not JSON each exit 2 naming the flag; a route list still works.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

let requests = 0
const server = createServer((req, res) => {
  requests++
  res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><html><body><main><h1>Same page here</h1></main></body></html>')
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
const scratch = mkdtempSync(join(tmpdir(), 'parity-inputs-'))
const nowhere = join(scratch, 'no-such-file.json')
const notJson = join(scratch, 'broken.json')
writeFileSync(notJson, '{ "accept": [ ')
test.after(async () => {
  server.close()
  await once(server, 'close')
  rmSync(scratch, { recursive: true, force: true })
})

async function run(...extra) {
  const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', base, '--target', base, '--out', join(scratch, 'report.json'), ...extra])
  let stderr = ''
  child.stderr.on('data', (d) => (stderr += d))
  child.stdout.resume()
  const [code] = await once(child, 'close')
  return { code, stderr }
}

for (const flag of ['--accept', '--pairs', '--map', '--media-map', '--source-snapshot']) {
  test(`${flag} naming a file that does not exist exits 2 before any request`, async () => {
    const before = requests
    const r = await run('--routes', '/', flag, nowhere)
    assert.equal(r.code, 2, r.stderr)
    assert.match(r.stderr, new RegExp(`${flag}.*no-such-file\\.json`))
    assert.equal(requests, before, 'nothing was fetched')
  })
}

test('--routes naming a page-map file that does not exist exits 2 (it is not a route list)', async () => {
  const r = await run('--routes', nowhere)
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /--routes/)
})

test('a flag with no value exits 2 naming the flag', async () => {
  const r = await run('--routes', '/', '--accept')
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /--accept/)
  const r2 = await run('--routes', '/', '--pairs', '--no-cache')
  assert.equal(r2.code, 2, r2.stderr)
  assert.match(r2.stderr, /--pairs/)
})

test('an --accept file that is not JSON exits 2 naming the flag', async () => {
  const r = await run('--routes', '/', '--accept', notJson)
  assert.equal(r.code, 2, r.stderr)
  assert.match(r.stderr, /--accept.*broken\.json/)
})

test('a route list is still a route list, the root alone included (`/` is a route, not the file system root)', async () => {
  const r = await run('--routes', '/,/about')
  assert.equal(r.code, 0, r.stderr)
  const root = await run('--routes', '/')
  assert.equal(root.code, 0, root.stderr)
})
