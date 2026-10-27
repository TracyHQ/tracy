/**
 * Screenshots for the design matrix, plus the states a settled-page probe cannot reach.
 *
 * The probe measures one moment of a page; a deck has eleven slides and a form has a state after
 * submit, and neither shows up in a computed-style snapshot. Those are captured here as their own
 * evidence files, named for the case they belong to.
 *
 * Usage: node design-shots.mjs <contract.json> <out-dir> <page-id...>
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { validateDesign } from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/design-contract.mjs'

const [contractFile, outDir, ...pageIds] = process.argv.slice(2)
if (!contractFile || !outDir || !pageIds.length)
  throw new Error('Usage: node design-shots.mjs <contract> <out-dir> <page-id...>')
const contract = validateDesign(JSON.parse(readFileSync(contractFile, 'utf8')))
mkdirSync(outDir, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = Number(process.env.CDP_PORT ?? 9385)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-features=MacAppCodeSignClone',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,900',
    `--user-data-dir=${path.join(tmpdir(), 'tracy-design-shots-profile')}`,
    'about:blank'
  ],
  { stdio: 'ignore' }
)
let targets
for (let i = 0; i < 80; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
    if (targets.some((t) => t.type === 'page')) break
  } catch {
    /* starting */
  }
  await sleep(500)
}
const socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (socket.onopen = r))
let id = 0
const pending = new Map()
socket.onmessage = (m) => {
  const f = JSON.parse(m.data)
  if (f.id && pending.has(f.id)) {
    const { resolve, reject } = pending.get(f.id)
    pending.delete(f.id)
    f.error ? reject(new Error(f.error.message)) : resolve(f.result)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id
    pending.set(i, { resolve, reject })
    socket.send(JSON.stringify({ id: i, method, params }))
  })
await send('Page.enable')
await send('Network.enable')
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'))
  return `${name}.png`
}
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value

const index = []
for (const pageId of pageIds) {
  const page = contract.pages.find((p) => p.id === pageId)
  for (const variant of contract.variants) {
    const url = page.url.replaceAll('{mode}', variant.mode)
    await send('Emulation.setDeviceMetricsOverride', {
      width: variant.width,
      height: variant.height,
      deviceScaleFactor: 1,
      mobile: variant.width <= 430
    })
    await send('Network.setCookie', {
      name: 'tracy-theme',
      value: variant.mode,
      url: new URL(url).origin,
      path: '/'
    })
    await send('Page.navigate', { url })
    for (let i = 0; i < 120; i++) {
      if (
        await evaluate(
          "(async()=>{if(document.readyState!=='complete')return false;await document.fonts.ready;return true})()"
        )
      )
        break
      await sleep(250)
    }
    await sleep(600)
    const slug = `${pageId.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}__${variant.id}`
    index.push({ page: pageId, variant: variant.id, url, file: await shot(slug) })
    if (pageId === 'marketing/deck') {
      // Scroll-snap lands between slides when the offset is computed by hand; the deck's own dots
      // are the control a person uses, so the evidence is taken the same way.
      const slides = await evaluate("document.querySelectorAll('.deck-dot').length")
      for (let n = 0; n < slides; n++) {
        await evaluate(`document.querySelectorAll('.deck-dot')[${n}].click()`)
        // Smooth scrolling means the counter is the only reliable signal that the slide arrived;
        // a fixed sleep caught two captures mid-animation.
        const want = `${String(n + 1).padStart(2, '0')} / ${String(slides).padStart(2, '0')}`
        let at = ''
        for (let wait = 0; wait < 24; wait++) {
          at = await evaluate("document.querySelector('.deck-counter').textContent.trim()")
          if (at === want) break
          await sleep(250)
        }
        await sleep(250)
        index.push({
          page: pageId,
          variant: variant.id,
          url,
          state: `slide-${n + 1}`,
          counter: at,
          file: await shot(`${slug}__slide-${String(n + 1).padStart(2, '0')}`)
        })
      }
    }
    if (pageId === 'marketing/form') {
      await evaluate(
        "(function(){var f=document.querySelector('[data-sample-form]');f.querySelector('#sample-name').value='Test';f.querySelector('#sample-email').value='nobody@example.com';f.querySelector('button[type=submit]').click();return true})()"
      )
      await sleep(500)
      const status = await evaluate(
        "JSON.stringify({hidden:document.querySelector('[data-form-status]').hidden,text:document.querySelector('[data-form-status]').textContent.trim(),action:document.querySelector('[data-sample-form]').getAttribute('action'),url:location.href})"
      )
      index.push({
        page: pageId,
        variant: variant.id,
        url,
        state: 'submitted',
        status: JSON.parse(status),
        file: await shot(`${slug}__submitted`)
      })
    }
  }
}
writeFileSync(path.join(outDir, 'screenshots.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`captured ${index.length} screenshot(s) in ${outDir}`)
chrome.kill('SIGKILL')
process.exit(0)
