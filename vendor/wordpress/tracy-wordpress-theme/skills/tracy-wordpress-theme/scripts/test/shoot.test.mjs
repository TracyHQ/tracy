// shoot.mjs runs its routes in parallel now; the matrix, the file names and the order of
// index.json must be exactly what the serial version wrote, and a route that is not 200 is
// recorded — never dropped — whichever context happened to finish first.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const server = createServer((req, res) => {
  if (req.url.startsWith('/missing')) {
    res.writeHead(404, { 'content-type': 'text/html' })
    return res.end('<h1>404</h1>')
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><head><style>html[data-theme=dark] body{background:#111;color:#eee}</style></head>
  <body><h1>${req.url}</h1><script>document.body.dataset.theme=document.documentElement.getAttribute('data-theme')||'light'</script></body></html>`)
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const base = `http://127.0.0.1:${server.address().port}`
const scratch = mkdtempSync(join(tmpdir(), 'shoot-'))
test.after(async () => {
  server.close()
  await once(server, 'close')
  rmSync(scratch, { recursive: true, force: true })
})

test('shoot: routes × viewports × themes in serial order, parallel run, not-200 recorded and exit 1', async () => {
  const out = join(scratch, 'shots')
  const child = spawn(process.execPath, [
    new URL('../shoot.mjs', import.meta.url).pathname,
    base,
    '--routes',
    '/,/a,/missing',
    '--out',
    out,
    '--viewports',
    '600x400,320x400',
    '--concurrency',
    '3'
  ])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  assert.equal(code, 1, output)
  const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
  assert.deepEqual(
    index.map((r) => `${r.route}|${r.width}|${r.theme}|${r.status}`),
    [
      '/|600|light|200', '/a|600|light|200', '/missing|600|light|404',
      '/|600|dark|200', '/a|600|dark|200', '/missing|600|dark|404',
      '/|320|light|200', '/a|320|light|200', '/missing|320|light|404',
      '/|320|dark|200', '/a|320|dark|200', '/missing|320|dark|404'
    ]
  )
  assert.equal(index[0].file, 'home__600__light.png')
  assert.equal(index[3].file, 'home__600__dark.png')
  for (const r of index) assert.ok(existsSync(join(out, r.file)), r.file)
  assert.match(output, /shoot: 12 shots → .*; 4 not-200\/failed/)
})
