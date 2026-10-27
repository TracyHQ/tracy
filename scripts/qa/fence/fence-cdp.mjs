// Group 2 of fence-check: what a fenced test process can make the lane's Chrome do over CDP.
// Runs INSIDE the `test` fence of the lane; talks raw CDP over WebSocket (no Playwright needed).
// Writes one JSON line per row to $OUT: { group:'cdp', name, expect:'deny'|'allow', ok, detail }.
// Env: OUT CDP GATE DECOY BAIT HOME_REAL INSIDE_FILE SECRET_FILE CHROME_DL MARK
// Exports: none (command only).
import { appendFileSync, writeFileSync } from 'node:fs'

const env = process.env
const OUT = env.OUT
writeFileSync(OUT, '')
const record = (name, expect, ok, detail) =>
  appendFileSync(
    OUT,
    `${JSON.stringify({ group: 'cdp', name, expect, ok: Boolean(ok), detail: String(detail).slice(0, 200) })}\n`
  )

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = new Set()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg)
      }
    })
  }
  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error('cdp websocket failed')), { once: true })
    })
    return new Cdp(ws)
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timeout ${method}`))
      }, 10_000).unref()
    })
  }
  waitFor(pred, ms) {
    return new Promise((resolve) => {
      const fn = (msg) => {
        if (pred(msg)) {
          this.listeners.delete(fn)
          resolve(msg)
        }
      }
      this.listeners.add(fn)
      setTimeout(() => {
        this.listeners.delete(fn)
        resolve(null)
      }, ms).unref()
    })
  }
}

const version = await (await fetch(`http://127.0.0.1:${env.CDP}/json/version`)).json()
const cdp = await Cdp.open(version.webSocketDebuggerUrl)
const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })

async function newPage() {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Network.enable', {}, sessionId)
  return { targetId, sessionId }
}
const closePage = (p) => cdp.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {})

async function navigate(url) {
  const p = await newPage()
  try {
    const loaded = cdp.waitFor((m) => m.sessionId === p.sessionId && m.method === 'Page.loadEventFired', 6000)
    const r = await cdp.send('Page.navigate', { url }, p.sessionId)
    if (r.errorText) return { error: r.errorText }
    await loaded
    const t = await cdp.send(
      'Runtime.evaluate',
      { expression: 'document.body ? document.body.innerText : ""', returnByValue: true },
      p.sessionId
    )
    return { text: t.result.value ?? '' }
  } catch (e) {
    return { error: e.message }
  } finally {
    await closePage(p)
  }
}

/** What a page showed, without its content: a broken fence must not print what it let through. */
const shown = (text) =>
  `loaded ${String(text ?? '').length} chars${EMPTY_INDEX.test(text ?? '') ? ' (empty index)' : ''}`
const EMPTY_INDEX = /^Index of [^\n]*\n\[parent directory\]\nName\tSize\tDate Modified\s*$/

/** Run one row; a probe that throws or hangs fails that row only. */
async function guarded(name, expect, fn) {
  try {
    await fn()
  } catch (e) {
    record(name, expect, false, `probe error: ${e.message}`)
  }
}

const standUrl = `http://shop.qa.tracy.test:${env.GATE}/`

// ---- controls
{
  const r = await navigate(standUrl)
  record(
    'stand by name (control)',
    'allow',
    !r.error && r.text.includes(`shop.qa.tracy.test:${env.GATE}`),
    r.error ?? 'loaded'
  )
}

// ---- navigation must fail
const denyNav = [
  ['navigate another stand on loopback', `http://127.0.0.1:${env.DECOY}/nav-probe`, /ERR_ACCESS_DENIED/],
  ['navigate CDP 9222', 'http://127.0.0.1:9222/json/version', /ERR_ACCESS_DENIED/],
  ['navigate internet by name', 'https://example.com/', /ERR_/],
  ['navigate internet by IP', 'http://1.1.1.1/', /ERR_ACCESS_DENIED/],
  ['file:// home .ssh', `file://${env.HOME_REAL}/.ssh/`, /ERR_/],
  ['file:// bait', `file://${env.BAIT}`, /ERR_/],
  ['file:// other scratch dirs', 'file:///private/tmp/claude-501/', /ERR_/],
  ['file:// the main repo', `file://${env.HOME_REAL}/TCH/package.json`, /ERR_/]
]
// A denied directory still renders Chrome's index page, with no entries: that is a pass, any entry is not.
for (const [name, url, want] of denyNav) {
  const r = await navigate(url)
  const ok = r.error
    ? want.test(r.error)
    : url.startsWith('file:') && url.endsWith('/') && EMPTY_INDEX.test(r.text ?? '')
  record(name, 'deny', ok, r.error ?? shown(r.text))
}
{
  const dir = env.BAIT.slice(0, env.BAIT.lastIndexOf('/') + 1)
  const r = await navigate(`file://${dir}`)
  record(
    'file:// listing of the bait folder',
    'deny',
    r.error || !/secret\.txt/.test(r.text ?? ''),
    r.error ?? shown(r.text)
  )
}

// ---- requests from a stand page must fail
const page = await newPage()
{
  const loaded = cdp.waitFor(
    (m) => m.sessionId === page.sessionId && m.method === 'Page.loadEventFired',
    6000
  )
  await cdp.send('Page.navigate', { url: standUrl }, page.sessionId)
  await loaded
}
const evaluate = async (expression) =>
  (
    await cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      page.sessionId
    )
  ).result.value

async function pageFetch(name, url) {
  const failed = cdp.waitFor(
    (m) => m.sessionId === page.sessionId && m.method === 'Network.loadingFailed',
    6000
  )
  const v = await evaluate(`Promise.race([
    fetch(${JSON.stringify(url)}, { mode: 'no-cors' }).then(() => 'REACHED', () => 'ERR'),
    new Promise((r) => setTimeout(() => r('TIMEOUT'), 5000)),
  ])`)
  const f = await failed
  const why = f?.params?.errorText ?? 'no loadingFailed'
  record(name, 'deny', v === 'ERR' && /ERR_ACCESS_DENIED/.test(why), `${v} ${why}`)
}
await guarded('page fetch internet by IP', 'deny', () =>
  pageFetch('page fetch internet by IP', 'http://1.1.1.1/fetch-probe')
)
await guarded('page fetch another stand', 'deny', () =>
  pageFetch('page fetch another stand', `http://127.0.0.1:${env.DECOY}/fetch-probe`)
)
await guarded('page websocket to another stand', 'deny', async () => {
  const v = await evaluate(`new Promise((r) => {
    const w = new WebSocket('ws://127.0.0.1:${env.DECOY}/ws-probe')
    w.onopen = () => r('OPEN'); w.onerror = () => r('ERR'); setTimeout(() => r('TIMEOUT'), 5000)
  })`)
  // fence-check also asserts the decoy server never saw /ws-probe
  record('page websocket to another stand', 'deny', v !== 'OPEN', v)
})

// ---- file chooser doors: DOM.setFileInputFiles
async function upload(path) {
  try {
    const { root } = await cdp.send('DOM.getDocument', {}, page.sessionId)
    const { nodeId } = await cdp.send(
      'DOM.querySelector',
      { nodeId: root.nodeId, selector: '#f' },
      page.sessionId
    )
    await cdp.send('DOM.setFileInputFiles', { nodeId, files: [path] }, page.sessionId)
    return await evaluate(`(async () => { const f = document.getElementById('f').files[0];
      try { const t = await f.text(); return 'READ ' + t.length } catch (e) { return 'ERR ' + e.name } })()`)
  } catch (e) {
    return `ERR ${e.message}`
  }
}
{
  const v = await upload(env.INSIDE_FILE)
  record('upload a file inside the fence (control)', 'allow', v.startsWith('READ'), v)
}
for (const [name, path] of [
  ['upload bait outside the fence', env.BAIT],
  ['upload ~/.zshenv', `${env.HOME_REAL}/.zshenv`],
  ['upload ~/.ssh/config', `${env.HOME_REAL}/.ssh/config`],
  ['upload a QA secret', env.SECRET_FILE]
]) {
  const v = await upload(path)
  record(name, 'deny', v.startsWith('ERR'), v)
}

// ---- download door: Browser.setDownloadBehavior
async function download(dir) {
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: dir,
    eventsEnabled: true,
    browserContextId
  })
  const done = cdp.waitFor(
    (m) => m.method === 'Browser.downloadProgress' && m.params.state !== 'inProgress',
    6000
  )
  await evaluate(`(() => { const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['x'.repeat(100)])); a.download = 'qaf-dl-${env.MARK}.bin';
    document.body.appendChild(a); a.click(); return 1 })()`)
  const m = await done
  return m ? m.params.state : 'no event'
}
await guarded('download into its own folder (control)', 'allow', async () => {
  const s = await download(env.CHROME_DL)
  record('download into its own folder (control)', 'allow', s === 'completed', s)
})
for (const [name, dir] of [
  ['download to /private/tmp', '/private/tmp'],
  ['download to ~/Downloads', `${env.HOME_REAL}/Downloads`]
]) {
  // fence-check also asserts no file of that name appeared there
  await guarded(name, 'deny', async () => {
    const s = await download(dir)
    record(name, 'deny', s !== 'completed', s)
  })
}

await closePage(page)
await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
appendFileSync(`${OUT}.done`, 'done\n')
process.exit(0)
