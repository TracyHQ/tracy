/**
 * Measure real render, through the skill's own read-only probe.
 *
 * The probe is the skill's `captureDesign` callback, serialised into the page and evaluated there;
 * nothing here computes an expected value, and no observation is ever written from the contract.
 * The theme is switched the way the site switches it — the `tracy-theme` cookie the template
 * resolves server-side — and then read back from the DOM, so a capture that silently stayed light
 * fails on `mode` instead of quietly passing.
 *
 * Usage: node design-capture.mjs <contract.json> <out.json> <page-id> [page-id...]
 *        node design-capture.mjs <contract.json> <out.json> --pages <file-with-one-id-per-line>
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  designRequest,
  validateDesign
} from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/design-contract.mjs'
import { captureDesign } from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/design-probe.mjs'

const [contractFile, outFile, ...rest] = process.argv.slice(2)
if (!contractFile || !outFile || rest.length === 0)
  throw new Error('Usage: node design-capture.mjs <contract.json> <out.json> <page-id...>')
const pageIds =
  rest[0] === '--pages'
    ? readFileSync(rest[1], 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : rest

const contract = validateDesign(JSON.parse(readFileSync(contractFile, 'utf8')))
const known = new Set(contract.pages.map((page) => page.id))
for (const id of pageIds) if (!known.has(id)) throw new Error(`Page outside the design contract: ${id}`)

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = Number(process.env.CDP_PORT ?? 9381)
mkdirSync(path.dirname(outFile), { recursive: true })
// The browser profile never belongs beside the evidence: its sockets and stale symlinks break
// every file walker the repo's gates run.
const profile = path.join(tmpdir(), 'tracy-design-capture-profile')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-features=MacAppCodeSignClone',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1440,900',
    `--user-data-dir=${profile}`,
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
}, 1_800_000)

let targets
for (let attempt = 0; attempt < 80; attempt++) {
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
await send('Network.enable')

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluate failed')
  return result.result.value
}

const probe = captureDesign.toString()
const observations = []
for (const pageId of pageIds) {
  for (const variant of contract.variants) {
    const request = designRequest(contract, pageId, variant.id)
    await send('Emulation.setDeviceMetricsOverride', {
      width: variant.width,
      height: variant.height,
      deviceScaleFactor: 1,
      mobile: variant.width <= 430
    })
    // The template resolves the theme server-side from this cookie, so setting it before the
    // navigation measures the theme a visitor gets rather than one flipped after paint.
    await send('Network.setCookie', {
      name: 'tracy-theme',
      value: variant.mode,
      url: new URL(request.url).origin,
      path: '/'
    })
    await send('Page.navigate', { url: request.url })
    for (let attempt = 0; attempt < 120; attempt++) {
      const ready = await evaluate(
        "(async () => { if (document.readyState !== 'complete') return false; await document.fonts.ready; return document.fonts.status === 'loaded'; })()"
      )
      if (ready) break
      await sleep(250)
    }
    await sleep(400)
    const observation = await evaluate(`(${probe})(${JSON.stringify(request)})`)
    observations.push(observation)
    console.log(
      `${pageId} ${variant.id}`.padEnd(58),
      `mode=${observation.mode} fonts=${observation.fontsReady} scrollWidth=${observation.scrollWidth}`,
      observation.mode !== variant.mode || !observation.fontsReady ? '  <-- CHECK' : ''
    )
  }
}
writeFileSync(outFile, JSON.stringify(observations, null, 2) + '\n')
clearTimeout(timer)
console.log(`wrote ${observations.length} observation(s) to ${outFile}`)
stop(0)
