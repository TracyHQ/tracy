#!/usr/bin/env node
/**
 * Edge checks for a worn system on a RUNNING EmDash site:
 *   node scripts/edges-emdash.mjs <site-url> <data-dir> <out-dir> <ds-slot.mjs>
 * 11 pages × two systems × 390/1440 (status, horizontal scroll), `?theme` × OS light/dark with and
 * without a system, and the admin untouched. Writes <out-dir>/edges.json; exit 1 when one fails.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
async function browser(port) {
  const dir = mkdtempSync(join(tmpdir(), 'ds-flow-'))
  // --proxy-server=direct:// — this Mac's PAC script stalls every connection otherwise.
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      '--proxy-server=direct://',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${dir}`,
      'about:blank'
    ],
    { stdio: 'ignore', detached: true }
  )
  let url = ''
  for (let i = 0; i < 100 && !url; i++) {
    try {
      url = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  if (!url) throw new Error('Chrome did not start')
  const ws = new WebSocket(url)
  await new Promise((ok, no) => {
    ws.onopen = ok
    ws.onerror = no
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    const f = pending.get(m.id)
    if (!f) return
    pending.delete(m.id)
    m.error ? f.no(new Error(m.error.message)) : f.ok(m.result)
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, no) => {
      const n = ++id
      pending.set(n, { ok, no })
      ws.send(JSON.stringify({ id: n, method, params, sessionId }))
    })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p) => send(m, p, sessionId)
  await s('Page.enable')
  return {
    async open(href, width) {
      await s('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 600
      })
      await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
      await s('Page.navigate', { url: href })
      await new Promise((r) => setTimeout(r, 1800))
      await s('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => 1)', awaitPromise: true })
    },
    async evaluate(expression) {
      const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
      return r.result.value
    },
    async shot(file) {
      const m = await s('Page.getLayoutMetrics')
      const r = await s('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(m.cssContentSize.width),
          height: Math.min(Math.ceil(m.cssContentSize.height), 6000),
          scale: m.cssContentSize.width > 800 ? 0.5 : 1
        }
      })
      writeFileSync(file, Buffer.from(r.data, 'base64'))
    },
    close() {
      try {
        ws.close()
      } catch {}
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

const [SITE, DATA, OUT, CLI] = process.argv.slice(2)
mkdirSync(OUT, { recursive: true })
const apply = (id) =>
  execFileSync(process.execPath, [CLI, id ? 'apply' : 'clear', ...(id ? [id] : []), '--emdash', DATA])
const PAGES = [
  '/',
  '/about',
  '/blog',
  '/careers',
  '/contact',
  '/design-system',
  '/help',
  '/pricing',
  '/product',
  '/services',
  '/team'
]
const b = await browser(9351)
const res = { pages: [], dark: [], admin: null }
try {
  for (const [id, key] of [
    ['refero:5f446754-1fb7-4a99-8cee-7bd5de3bfd9e', 'eddie'],
    ['refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', 'moxie']
  ]) {
    apply(id)
    for (const path of PAGES) {
      const status = (await fetch(SITE + path)).status
      for (const w of [390, 1440]) {
        await b.open(SITE + path, w)
        const r = await b.evaluate(
          `({ hs: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, sw: document.documentElement.scrollWidth, slot: document.getElementById('tracy-ds-slot')?.dataset.ds ?? null, wide: [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).split(' ')[0]) })`
        )
        res.pages.push({ key, path, w, status, ...r })
        if ((path === '/pricing' || path === '/contact') && w === 390)
          await b.shot(join(OUT, `${key}${path.replace('/', '-')}-phone.png`))
      }
    }
  }
  // dark: OS dark preference and ?theme=dark must not flip a worn system; the toggle is hidden
  for (const [id, key] of [
    ['refero:03b3d707-2a30-4f53-a524-347d1b70eb2c', 'voiceflow-light'],
    ['refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', 'moxie-dark'],
    [null, 'default']
  ]) {
    apply(id)
    for (const [q, scheme] of [
      ['', 'light'],
      ['', 'dark'],
      ['?theme=dark', 'light'],
      ['?theme=light', 'dark']
    ]) {
      await b.open(SITE + '/' + q, 1440)
      const r = await b.evaluate(
        `({ theme: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, toggleShown: [...document.querySelectorAll('[data-tracy-theme-toggle]')].some((e) => e.getClientRects().length > 0) })`
      )
      res.dark.push({ key, q: q || '(none)', os: scheme, ...r })
    }
  }
  apply(null)
} finally {
  b.close()
}
const admin = await (await fetch(SITE + '/_emdash/admin')).text()
apply('refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0')
const adminWorn = await (await fetch(SITE + '/_emdash/admin')).text()
apply(null)
res.admin = { slotInAdmin: /tracy-ds-slot/.test(adminWorn), sameBytes: admin.length === adminWorn.length }
writeFileSync(join(OUT, 'edges.json'), JSON.stringify(res, null, 1))
const bad = res.pages.filter((p) => p.hs || p.status !== 200)
console.log(
  'pages',
  res.pages.length,
  'checked;',
  bad.length,
  'with overflow or non-200',
  JSON.stringify(bad.slice(0, 6))
)
for (const d of res.dark)
  console.log(
    'dark',
    d.key.padEnd(16),
    d.q.padEnd(12),
    'os',
    d.os.padEnd(5),
    'data-theme',
    String(d.theme).padEnd(5),
    'bg',
    d.bg,
    'toggle',
    d.toggleShown
  )
console.log('admin', JSON.stringify(res.admin))
const darkOk =
  res.dark.every((d) =>
    d.key === 'voiceflow-light'
      ? d.bg === 'rgb(255, 255, 255)' && !d.toggleShown
      : d.key === 'moxie-dark'
        ? d.bg === 'rgb(0, 0, 0)' && !d.toggleShown
        : d.toggleShown
  ) && res.dark.some((d) => d.key === 'default' && d.q === '?theme=dark' && d.theme === 'dark')
process.exitCode = bad.length === 0 && darkOk && !res.admin.slotInAdmin && res.admin.sameBytes ? 0 : 1
