#!/usr/bin/env node
/**
 * Open one Storybook story in headless Chrome, click something, and report what the popup did.
 *
 * Usage:
 *   node scripts/probe-story.mjs <story-id> <out-dir> [text-to-click]
 *
 * It exists to split one question in two: a screen that misbehaves inside dsh (mode B) and the
 * same screen on the bench (mode A). A component that works here and not there is an environment
 * problem; one that fails in both is the component's own.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [story, outDir, clickText] = process.argv.slice(2)
if (!story || !outDir) {
  console.error('usage: probe-story.mjs <story-id> <out-dir> [text-to-click]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = 9343
const PORT = process.env.STORYBOOK_PORT ?? '6008'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    // No macOS 'Keychain Not Found' dialog when launched outside the GUI session (ssh, a background job)
    '--use-mock-keychain',
    '--disable-gpu',
    '--no-sandbox',
    // Chrome clones its whole app bundle into $TMPDIR/X on every launch and only removes the
    // clone on a clean exit. SIGKILL below skips that exit, and 129 leftover clones filled the
    // iMac disk on 2026-09-05. Skipping the clone is the fix; do not drop this flag.
    '--disable-features=MacAppCodeSignClone',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1500,950',
    `--user-data-dir=${path.join(outDir, '.chrome')}`,
    'about:blank'
  ],
  { stdio: 'ignore' }
)
const shutdown = (code) => {
  chrome.kill('SIGKILL')
  process.exit(code)
}
setTimeout(() => {
  console.error('TIMEOUT')
  shutdown(1)
}, 120_000)

let targets
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
    break
  } catch {
    await sleep(500)
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const logs = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push(
      (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 200)
    )
  }
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  return r.result?.exceptionDetails ? { __error: r.result.exceptionDetails.text } : r.result?.result?.value
}
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  await sleep(80)
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
    buttons: 1
  })
  await sleep(60)
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
    buttons: 0
  })
  await sleep(500)
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: `http://localhost:${PORT}/iframe.html?id=${story}&viewMode=story` })
await sleep(7000)
await send('Page.captureScreenshot', { format: 'png' }).then((r) =>
  writeFileSync(path.join(outDir, 'before.png'), Buffer.from(r.result.data, 'base64'))
)

const report = { story }
if (clickText) {
  const box = await ev(`(() => {
    const el = [...document.querySelectorAll('button,[role="menuitem"],a')].find((n) => (n.textContent||'').trim().startsWith(${JSON.stringify(clickText)}))
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
  })()`)
  report.trigger = box
  if (box) {
    await clickAt(box.x, box.y)
    await sleep(1200)
    report.popup = await ev(`(() => {
      // Either shape: base UI's portalled popup, or Tracy's own in-tab popover.
      const pop = document.querySelector('[data-slot="dropdown-menu-content"]') || document.querySelector('[role="menu"]')
      if (!pop) return { mounted: false, menus: document.querySelectorAll('[role="menu"]').length }
      const r = pop.getBoundingClientRect()
      const cs = getComputedStyle(pop)
      return {
        mounted: true,
        popupRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        positionerStyle: pop.parentElement ? pop.parentElement.getAttribute('style') : null,
        opacity: cs.opacity,
        items: pop.querySelectorAll('[role="menuitem"]').length,
        text: (pop.textContent || '').trim().slice(0, 140)
      }
    })()`)
    await send('Page.captureScreenshot', { format: 'png' }).then((r) =>
      writeFileSync(path.join(outDir, 'after.png'), Buffer.from(r.result.data, 'base64'))
    )
  }
}
report.errors = logs.slice(0, 10)
console.log(JSON.stringify(report, null, 2))
shutdown(0)
