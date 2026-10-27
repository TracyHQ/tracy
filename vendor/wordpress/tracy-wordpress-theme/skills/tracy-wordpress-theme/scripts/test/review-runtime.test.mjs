// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/review-runtime.test.mjs — WordPress changes: the fixture's hook is a custom `data-mode` attribute (proving --config overrides the html[data-theme] default) instead of Bootstrap's data-bs-theme.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
const scratch = mkdtempSync(join(tmpdir(), 'wp-browser-fixture-'))
const server = createServer((req, res) => {
  const noToggle = req.url.includes('missing')
  res.writeHead(req.url.includes('error') ? 404 : 200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html data-mode="light"><head><style>
  body {background:rgb(255,255,255);color:rgb(0,0,0)}
  html[data-mode=dark] body {background:rgb(20,20,20);color:rgb(240,240,240)}
  </style></head><body><header>Fixture</header><main>${'<p>Visible content</p>'.repeat(25)}</main>
  ${noToggle ? '' : '<button class="toggle">Theme</button>'}
  <script>
  const key='fixture-theme',root=document.documentElement;
  const get=()=>document.cookie.split('; ').find(c=>c.startsWith(key+'='))?.split('=')[1];
  root.setAttribute('data-mode',get()||'light');
  document.querySelector('.toggle')?.addEventListener('click',()=>{
    const value=root.getAttribute('data-mode')==='dark'?'light':'dark';
    root.setAttribute('data-mode',value);document.cookie=key+'='+value+';path=/';
  });
  </script></body></html>`)
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const url = `http://127.0.0.1:${server.address().port}`
const config = join(scratch, 'config.json')
writeFileSync(
  config,
  JSON.stringify({
    hook: { type: 'attribute', name: 'data-mode' },
    toggle: '.toggle',
    persistence: { type: 'cookie', key: 'fixture-theme' },
    expectedSelectors: ['header', 'main']
  })
)
test.after(async () => {
  server.close()
  await once(server, 'close')
  rmSync(scratch, { recursive: true, force: true })
})
async function run(script, path = '/', ...args) {
  const child = spawn(process.execPath, [
    new URL('../review/' + script + '.mjs', import.meta.url).pathname,
    url + path,
    ...args,
    '--config',
    config
  ])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output }
}
test('real toggle supports attribute hook and cookie persistence', async () => {
  const r = await run('toggle-test')
  assert.equal(r.code, 0, r.output)
  assert.match(r.output, /"status":"pass"/)
})
test('missing toggle and unexpected HTTP status are failures', async () => {
  for (const path of ['/missing', '/error']) {
    const r = await run('toggle-test', path)
    assert.equal(r.code, 1, r.output)
  }
})
test('all shared scanners execute against the configured fixture', async () => {
  for (const script of ['leak-scan', 'contrast-audit', 'border-scan', 'seam-scan', 'hover-scan']) {
    const r = await run(script)
    assert.ok([0, 3].includes(r.code), script + ': ' + r.output)
    assert.match(r.output, /"url":"http:/)
    assert.match(r.output, /"examined":/)
  }
})
test('probe rejects missing selectors and measures the configured dark theme', async () => {
  const good = await run('probe', '/', 'dark', 'body')
  assert.equal(good.code, 0, good.output)
  assert.match(good.output, /rgb\(20, 20, 20\)/)
  const bad = await run('probe', '/', 'dark', '.does-not-exist')
  assert.equal(bad.code, 1, bad.output)
})
