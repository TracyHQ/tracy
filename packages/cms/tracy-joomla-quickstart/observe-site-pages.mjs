/**
 * Read the 128 site surfaces the way a visitor's browser renders them.
 *
 * A site page is a Joomla view: no build-time field markers, so each field is read through the
 * selector its surface declares in `site-plan.mjs`. Chrome does the reading rather than a parser,
 * because a page that only looks right after its scripts run is still the page people get, and the
 * observation has to be of that.
 *
 * Usage: node observe-site-pages.mjs <site-origin> <out-directory>
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SITE_SURFACES, selectorsFor } from './site-plan.mjs'
import { studioContract, studioContentHash } from './studio-content.mjs'

const [origin, outDir] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('Usage: node observe-site-pages.mjs <site-origin> <out-dir>')
mkdirSync(outDir, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? 9371)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-features=MacAppCodeSignClone',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1440,1000',
    `--user-data-dir=${path.join(outDir, '.chrome')}`,
    'about:blank'
  ],
  { stdio: 'ignore' }
)
const stop = (code) => {
  chrome.kill('SIGKILL')
  process.exit(code)
}
const timer = setTimeout(() => {
  console.error('TIMEOUT')
  stop(1)
}, 900_000)

let targets
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
    if (targets.some((t) => t.type === 'page')) break
  } catch {
    /* Chrome is still starting. */
  }
  await sleep(500)
}
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((resolve) => (socket.onopen = resolve))
let nextId = 0
const pending = new Map()
socket.onmessage = (message) => {
  const frame = JSON.parse(message.data)
  if (frame.id && pending.has(frame.id)) {
    const { resolve, reject } = pending.get(frame.id)
    pending.delete(frame.id)
    frame.error ? reject(new Error(frame.error.message)) : resolve(frame.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
await send('Page.enable')

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

const surfaces = []
const evidence = []
const missing = []
for (const id of SITE_SURFACES) {
  const selectors = selectorsFor(id)
  await send('Page.navigate', { url: origin + id })
  let payload
  for (let attempt = 0; attempt < 80; attempt++) {
    payload = await evaluate(
      `(function(){ if (document.readyState !== 'complete') return null;
        var map = ${JSON.stringify(selectors)};
        var out = {}, missing = [];
        for (var key in map) {
          var spec = map[key];
          if (typeof spec === 'string') spec = { selector: spec };
          var nodes = document.querySelectorAll(spec.selector);
          var node = nodes[spec.index || 0];
          if (!node) { missing.push(key); continue; }
          var value = spec.attribute ? node.getAttribute(spec.attribute) : node.textContent;
          out[key] = String(value == null ? '' : value).replace(/\\s+/g, ' ').trim();
        }
        return JSON.stringify({ fields: out, missing: missing, url: location.href, title: document.title });
      })()`
    )
    if (payload) break
    await sleep(200)
  }
  if (!payload) throw new Error(`Could not read ${id}`)
  const read = JSON.parse(payload)
  if (read.missing.length) missing.push(`${id}: ${read.missing.join(', ')}`)
  surfaces.push({ id, fields: read.fields })
  evidence.push({
    id,
    requestedUrl: origin + id,
    finalUrl: read.url,
    documentTitle: read.title,
    selectors,
    capturedAt: new Date().toISOString()
  })
}

writeFileSync(
  path.join(outDir, 'observed-site.json'),
  JSON.stringify({ contractId: studioContract.id, contractHash: studioContentHash, surfaces }, null, 2) + '\n'
)
writeFileSync(
  path.join(outDir, 'observed-site-evidence.json'),
  JSON.stringify({ origin, contractHash: studioContentHash, surfaces: evidence }, null, 2) + '\n'
)
spawnSync(
  'node',
  [
    new URL('../../../node_modules/@biomejs/biome/bin/biome', import.meta.url).pathname,
    'format',
    '--write',
    path.join(outDir, 'observed-site.json'),
    path.join(outDir, 'observed-site-evidence.json')
  ],
  { stdio: 'ignore' }
)
clearTimeout(timer)
console.log(`read ${surfaces.length} site surfaces`)
if (missing.length) {
  console.error(`selectors matched nothing on ${missing.length} surface(s):\n  ${missing.join('\n  ')}`)
  stop(1)
}
console.log(`Wrote observed-site.json and observed-site-evidence.json in ${outDir}`)
stop(0)
