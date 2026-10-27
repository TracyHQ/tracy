#!/usr/bin/env node
/**
 * C07 — a held response from the ref you LEFT must not land on the ref you are looking at.
 *
 * The shape of the bug this exists to catch: pick Dev, pick Main before Dev answers, and let Dev
 * answer last. Without a guard the later response wins and the page shows Dev's numbers under
 * Main's heading — and because every number is plausible for either ref, nothing on screen looks
 * wrong. That is why this is a timing test and not an inspection of the source for `AbortController`.
 *
 * How the timing is controlled: a fetch shim is installed BEFORE the app's own script runs, so the
 * app's `fetch` is the shim. The shim parks any response the test asks it to park and releases it
 * on command, which makes the interleaving exact rather than hopeful.
 *
 * usage: ORIGIN=… COOKIE_FILE=… node race-c07.mjs [out-dir]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const outDir = process.argv[2] ?? 'race-c07'
mkdirSync(outDir, { recursive: true })
const ORIGIN = process.env.ORIGIN ?? 'http://qa.tracy.test:51770'
const COOKIE = readFileSync(process.env.COOKIE_FILE, 'utf8').trim()
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9391
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    // No macOS 'Keychain Not Found' dialog when launched outside the GUI session (ssh, a background job)
    '--use-mock-keychain',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-features=MacAppCodeSignClone',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,900',
    `--user-data-dir=${path.join(outDir, '.chrome')}`,
    'about:blank'
  ],
  { stdio: 'ignore' }
)
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  << ${detail}`}`)
}
const shutdown = (code) => {
  chrome.kill('SIGKILL')
  process.exit(code)
}
setTimeout(() => {
  console.error('TIMEOUT')
  shutdown(1)
}, 300_000)

let targets
for (let i = 0; i < 60; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
    break
  } catch {
    await sleep(500)
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text }
  return r.result?.result?.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false
})
const [cname, cvalue] = COOKIE.split('=')
await send('Network.setCookie', { name: cname, value: cvalue, domain: new URL(ORIGIN).hostname, path: '/' })

/**
 * The shim. `__race.hold(pattern)` parks the NEXT response whose URL matches; `__race.release()`
 * lets the parked one through; `__race.fail()` releases it as a network error instead, which is the
 * second half of the condition — a late FAILURE from the ref you left must not blank the ref you
 * are on either.
 */
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    (() => {
      const real = window.fetch.bind(window)
      const state = { pattern: null, parked: [], log: [] }
      window.__race = {
        hold: (p) => { state.pattern = p; state.parked = [] },
        parked: () => state.parked.length,
        release: async () => { const p = state.parked.shift(); if (p) p.go(); },
        fail: async () => { const p = state.parked.shift(); if (p) p.boom(); },
        log: () => state.log
      }
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url
        state.log.push(url)
        if (state.pattern && url.includes(state.pattern)) {
          const res = await real(input, init)
          return new Promise((resolve, reject) => {
            state.parked.push({
              go: () => resolve(res),
              boom: () => reject(new TypeError('Failed to fetch (simulated late failure)'))
            })
          })
        }
        return real(input, init)
      }
    })()
  `
})

const shot = async (f) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, f), Buffer.from(r.result.data, 'base64'))
}
const bodyText = () => ev('document.body.innerText')
const shownSha = () => ev(`(document.body.innerText.match(/Commit\\s+([0-9a-f]{9})/) || [])[1] || ''`)
const shownRef = () => ev(`(document.body.innerText.match(/Ref\\s+(\\S+)/) || [])[1] || ''`)

// The two SHAs, straight from the API, so the assertions compare against truth rather than a guess.
const envs = await (await fetch(`${ORIGIN}/api/ops/cms/environments`, { headers: { cookie: COOKIE } })).json()
const DEV = envs.environments.find((e) => e.id === 'dev')
const MAIN = envs.environments.find((e) => e.id === 'main')
console.log(`dev=${DEV.shortSha}  main=${MAIN.shortSha}`)
check(
  'the two refs have different commits (otherwise this test proves nothing)',
  DEV.sha !== MAIN.sha,
  `${DEV.sha} ${MAIN.sha}`
)

/**
 * Selecting the ref you are ALREADY on issues no request, so the sequence has to start on Main:
 * Main → Dev (parked) → Main. The first version of this test started on Dev and asked for Dev, and
 * every later assertion passed against an empty parking lot — the "a request is parked" check is
 * what caught it, and it stays for that reason.
 */
const pick = (env) =>
  ev(`(() => {
  const sel = document.querySelector('select[aria-label="Environment"]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  set.call(sel, '${env}'); sel.dispatchEvent(new Event('change', { bubbles: true }))
})()`)

// ── case 1: a late SUCCESS from the ref we left ──────────────────────────────────────────────
await send('Page.navigate', { url: `${ORIGIN}/ops/cms/catalog?env=main&cms=wordpress` })
await sleep(3000)
check('starts on Main', (await shownSha()) === MAIN.shortSha, await shownSha())

await ev(`window.__race.hold('/api/ops/cms/snapshot?env=dev')`)
await pick('dev')
await sleep(600)
const parkedDev = await ev('window.__race.parked()')
check('a Dev request is in flight and parked', parkedDev >= 1, String(parkedDev))

// Back to Main. Main is NOT held, so it answers first and the page settles on Main.
await pick('main')
await sleep(2500)
check('Main rendered while Dev was still parked', (await shownSha()) === MAIN.shortSha, await shownSha())
const mainBody = await bodyText()

// Release the stale Dev response. This is the moment the bug would happen.
await ev('window.__race.release()')
await sleep(2500)
const afterSha = await shownSha()
const afterRef = await shownRef()
const afterCms = await ev(`new URLSearchParams(location.search).get('cms')`)
await shot('after-late-success.png')

check(
  'a late Dev response does NOT replace the commit on screen',
  afterSha === MAIN.shortSha,
  `${afterSha} (expected ${MAIN.shortSha})`
)
check('…nor the ref label', /^origin\/main(-v3)?$/.test(afterRef), afterRef)
check('…nor the chosen CMS', afterCms === 'wordpress', String(afterCms))
const afterBody = await bodyText()
check(
  '…and the page still reads as Main, not Dev',
  afterBody.includes('Not on this ref') === mainBody.includes('Not on this ref'),
  'the Main-only wording changed after the stale response landed'
)
check(
  'the environment selector still says Main',
  (await ev(`document.querySelector('select[aria-label="Environment"]').value`)) === 'main',
  ''
)

// ── case 2: a late FAILURE from the ref we left ──────────────────────────────────────────────
await send('Page.navigate', { url: `${ORIGIN}/ops/cms/catalog?env=main&cms=joomla` })
await sleep(3000)
await ev(`window.__race.hold('/api/ops/cms/snapshot?env=dev')`)
await pick('dev')
await sleep(600)
check('a Dev request is parked for the failure case too', (await ev('window.__race.parked()')) >= 1, '')
await pick('main')
await sleep(2500)
check('Main rendered again', (await shownSha()) === MAIN.shortSha, await shownSha())

await ev('window.__race.fail()')
await sleep(2500)
const failSha = await shownSha()
const failBody = await bodyText()
await shot('after-late-failure.png')
check(
  'a late Dev FAILURE does not blank Main',
  failSha === MAIN.shortSha,
  `${failSha} (expected ${MAIN.shortSha})`
)
check(
  '…and does not raise an error notice over Main',
  !/Could not read this|The request did not complete/.test(failBody),
  failBody.slice(0, 160)
)

writeFileSync(
  path.join(outDir, 'results.json'),
  `${JSON.stringify({ dev: DEV, main: MAIN, results }, null, 2)}\n`
)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
shutdown(failed.length > 0 ? 1 : 0)
