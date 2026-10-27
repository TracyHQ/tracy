#!/usr/bin/env node
/**
 * Take a Design inspiration card's pictures off a live demo, and put them in a deployment's store.
 *
 *   node scripts/shoot-template.mjs <base-url> --template <id> \
 *        --layouts home=/,services=/services,contact=/contact \
 *        [--api https://cowork.tracy.site] [--cookie "tracy_sess=…"] [--out <dir>]
 *        [--cdp http://127.0.0.1:9222]
 *
 * A SECOND WAY IN, NOT THE ONLY ONE. The operations page now has a working *Capture shots from
 * demo* button: it asks the demo host's `tracy-host` (which grew a headless browser) to shoot the
 * live demo and stores the pictures server-side — no checkout, no browser on the operator's
 * machine. This script stays as the checkout-side road: it runs the capture on the operator's own
 * machine and uploads through the same door the browser's file input uses
 * (`PUT /api/ops/templates/<id>/shots/<file>`), useful when there is no live demo to shoot from a
 * server, or to re-take pictures without the ops page. Nothing here is a second way past the
 * store's rules: those are the door's, and this script only sends bytes at them.
 *
 * ⚠ AND A BUTTON NEEDS A DEMO BEFORE IT NEEDS A BROWSER. Every picture here is taken OFF a running
 * demo — `parseShoot` refuses a command line without one. A card whose release has no demo
 * installed has nothing to shoot, and no amount of browser anywhere changes that.
 *
 * `--cdp` ATTACHES TO A BROWSER THAT IS ALREADY RUNNING, instead of launching one. Without it the
 * script spawns the Mac's own Chrome from the fixed path below, which is why it only ever ran on
 * a Mac. With it the same script runs wherever a browser answers CDP — and the fleet already has
 * one: the dsh image installs chromium, firefox and webkit into `/opt/playwright` and wraps
 * Chromium as `/usr/local/bin/tracy-chrome` (with `--no-sandbox` and `--disable-dev-shm-usage`,
 * both of which a container needs). So the browser is paid for; it just sits in the dsh container
 * rather than in tracy-web's.
 *
 *   docker exec <dsh> tracy-chrome --headless=new --remote-debugging-port=9222 about:blank &
 *   node scripts/shoot-template.mjs https://demo… --template … --layouts … --cdp http://127.0.0.1:9222
 *
 * ⚠ The demo has to be reachable FROM THE BROWSER, not from the machine typing the command.
 *
 * 🔒 THE NAME IS COMPOSED, NEVER CARRIED. `<template>-<key>-<width>.png` is decided by `shotName`,
 * so a page whose title or URL contains anything at all still produces a name the store accepts.
 * A name taken from the page would be refused by the door AFTER the browser work was done — the
 * expensive way to find out — or, worse, spell a path.
 *
 * Chrome is driven over CDP the way `scripts/probe-story.mjs` drives it. No Playwright: this is a
 * script an operator runs occasionally, and adding a browser download to the repository's install
 * for it would be paid by everybody, every install.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// The name and the viewports are the store's, not this script's — the operations capture door
// names its pictures the same way, and one shared source is how the two never disagree. This
// script re-exports them so its own test (and its callers) keep the same import.
import { shotName, VIEWPORTS } from '../apps/tracy-web/src/lib/template-shots.js'

export { shotName, VIEWPORTS }

/** The Mac's own Chrome, used only when no `--cdp` address was given. */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CDP_PORT = 9351

/** The store's own two shapes, restated here so a bad argument is refused before Chrome starts. */
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]*$/
const KEY = /^[a-z0-9][a-z0-9-]*$/

/**
 * The command line, read into what the run needs — or one sentence saying what is wrong with it.
 *
 * Pure, and it returns the FIRST problem rather than throwing: an operator fixing a command line
 * wants the next thing to change, and a list of six would not be read.
 * @param {string[]} argv the arguments after the script name
 * @returns {{ base: string, template: string, layouts: { key: string, path: string }[],
 *   api: string | null, cookie: string | null, cdp: string | null, out: string,
 *   error: string | null }}
 */
export function parseShoot(argv) {
  const flag = (name) => {
    const at = argv.indexOf(`--${name}`)
    return at === -1 ? null : (argv[at + 1] ?? null)
  }
  const fail = (error) => ({
    base: '',
    template: '',
    layouts: [],
    api: null,
    cookie: null,
    cdp: null,
    out: '',
    error
  })

  const base = (argv[0] ?? '').replace(/\/+$/, '')
  if (base === '' || base.startsWith('--'))
    return fail("Name the demo's base address first, e.g. https://business-emdash.tracy.site")
  if (!/^https?:\/\//.test(base)) return fail(`The base address must be http or https, not ${argv[0]}`)

  const template = flag('template')
  if (template === null) return fail('--template names the template these pictures belong to')
  if (!TEMPLATE_ID.test(template))
    return fail(`--template ${template} is not a template id: lower case, digits and dashes`)

  const spec = flag('layouts')
  if (spec === null) return fail('--layouts lists the pages to shoot, as key=/path,key=/path')
  /** @type {{ key: string, path: string }[]} */
  const layouts = []
  for (const pair of spec.split(',')) {
    const at = pair.indexOf('=')
    if (at === -1) return fail(`--layouts takes key=/path pairs; ${JSON.stringify(pair)} has no =`)
    const key = pair.slice(0, at)
    const where = pair.slice(at + 1)
    if (!KEY.test(key)) return fail(`--layouts key ${JSON.stringify(key)}: lower case, digits and dashes`)
    if (!where.startsWith('/'))
      return fail(`--layouts path ${JSON.stringify(where)} must start with / — it is a path on the demo`)
    if (layouts.some((l) => l.key === key))
      return fail(`--layouts names ${JSON.stringify(key)} twice; one key is one set of pictures`)
    layouts.push({ key, path: where })
  }

  // An ADDRESS, not an executable. The commonest way to get this wrong is to pass the browser
  // binary — `--cdp /usr/local/bin/tracy-chrome` reads perfectly well to a person — and without
  // this the run would fetch that string and fail somewhere deep, long after the check was free.
  const cdpFlag = flag('cdp')
  if (cdpFlag !== null && !/^https?:\/\//.test(cdpFlag))
    return fail(
      `--cdp takes the browser's http debugging address, e.g. http://127.0.0.1:9222 — not ${cdpFlag}`
    )

  return {
    base,
    template,
    layouts,
    api: flag('api')?.replace(/\/+$/, '') ?? null,
    cookie: flag('cookie'),
    cdp: cdpFlag?.replace(/\/+$/, '') ?? null,
    out: flag('out') ?? `shots-${template}`,
    error: null
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** One CDP call on a target, over its WebSocket. */
function cdp(socket, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== id) return
      socket.removeEventListener('message', onMessage)
      if (message.error) reject(new Error(`${method}: ${message.error.message}`))
      else resolve(message.result)
    }
    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

/**
 * The browser this run drives, and how to let go of it afterwards.
 *
 * TWO WAYS IN, AND THE DIFFERENCE IS WHOSE BROWSER IT IS. Without `--cdp` the script launches the
 * machine's own Chrome and kills it at the end, which is what an operator on a Mac wants. With
 * `--cdp` it attaches to one that is ALREADY RUNNING and must leave it exactly as it found it —
 * the fleet's dsh image already carries Chromium at `/usr/local/bin/tracy-chrome` (its Dockerfile
 * installs chromium, firefox and webkit into `/opt/playwright`), so a fleet host has a browser
 * sitting there and no second one needs installing anywhere.
 *
 * ⚠ AN ATTACHED RUN OPENS ITS OWN PAGE AND CLOSES IT. Driving a page that was already open would
 * navigate somebody else's tab away and leave `Emulation.setDeviceMetricsOverride` on it — a tab
 * stuck at 390×844 afterwards, with nothing on screen saying who did it.
 *
 * @param {string} endpoint the browser's http debugging address
 * @param {boolean} ours whether this run launched the browser
 */
async function attach(endpoint, ours) {
  /** @type {any} */
  let targets = null
  for (let attempt = 0; attempt < 40 && targets === null; attempt += 1) {
    await sleep(250)
    targets = await fetch(`${endpoint}/json/list`)
      .then((r) => r.json())
      .catch(() => null)
  }
  if (targets === null) throw new Error(`No browser answered at ${endpoint}`)

  if (ours) {
    const page = targets.find((/** @type {any} */ t) => t.type === 'page')
    if (!page) throw new Error('Chrome opened no page to drive')
    return { page, close: async () => {} }
  }

  // `/json/new` is a PUT from Chrome 111 on; older builds answer a GET. Try the current spelling
  // first so the fallback is the exception, not the path everybody takes.
  const open = async (method) =>
    fetch(`${endpoint}/json/new?about:blank`, { method })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  const page = (await open('PUT')) ?? (await open('GET'))
  if (!page?.webSocketDebuggerUrl)
    throw new Error(`The browser at ${endpoint} would not open a page to drive`)
  return {
    page,
    close: async () => {
      await fetch(`${endpoint}/json/close/${page.id}`).catch(() => null)
    }
  }
}

async function shoot({ base, template, layouts, out, cdp: endpoint }) {
  mkdirSync(out, { recursive: true })
  const ours = endpoint === null
  if (!ours) console.log(`Attaching to the browser at ${endpoint} — this run will not close it.`)
  const chrome = !ours
    ? null
    : spawn(
        CHROME,
        [
          '--headless=new',
          // No macOS 'Keychain Not Found' dialog when launched outside the GUI session (ssh, a background job)
          '--use-mock-keychain',
          '--disable-gpu',
          '--no-sandbox',
          // Chrome clones its whole app bundle into $TMPDIR on every launch and only removes the clone
          // on a clean exit. The kill below skips that exit, and leftover clones filled a disk once
          // (`probe-story.mjs` carries the same flag for the same reason). Do not drop it.
          '--disable-features=MacAppCodeSignClone',
          `--remote-debugging-port=${CDP_PORT}`,
          `--user-data-dir=${path.join(out, '.chrome')}`,
          'about:blank'
        ],
        { stdio: 'ignore' }
      )
  /** @type {{ file: string, bytes: Buffer }[]} */
  const taken = []
  /** @type {(() => Promise<void>) | null} */
  let closePage = null
  try {
    const where = ours ? `http://127.0.0.1:${CDP_PORT}` : endpoint
    const { page, close } = await attach(where, ours)
    closePage = close

    const socket = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let id = 0
    await cdp(socket, (id += 1), 'Page.enable')
    for (const layout of layouts) {
      for (const view of VIEWPORTS) {
        // 2× like the demo host's own capture (`apps/tracy-host/src/browser.js`): the card shows
        // the shot at a fraction of its width on a two-pixel screen, and a 1× shot reads soft there.
        await cdp(socket, (id += 1), 'Emulation.setDeviceMetricsOverride', {
          width: view.width,
          height: view.height,
          deviceScaleFactor: 2,
          mobile: view.width < 500
        })
        await cdp(socket, (id += 1), 'Page.navigate', { url: `${base}${layout.path}` })
        // No load event to wait on over a bare socket without a listener pump: settle on time, the
        // way a person watching the window would. Slow enough for fonts and lazy images at both
        // widths, measured against the EmDash demo.
        await sleep(3500)
        // Beyond the viewport, but not without end: four screens of page, the same bound the demo
        // host keeps, or a long home page at 2× breaches the store's cap.
        const { data } = await cdp(socket, (id += 1), 'Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: view.width, height: Math.max(view.height, 3600), scale: 1 }
        })
        const file = shotName(template, layout.key, view.width)
        const bytes = Buffer.from(data, 'base64')
        writeFileSync(path.join(out, file), bytes)
        taken.push({ file, bytes })
        console.log(`  ${file} · ${bytes.length} bytes`)
      }
    }
    socket.close()
  } finally {
    // Ours to kill, or theirs to leave alone — never both, and never neither.
    if (closePage !== null) await closePage()
    chrome?.kill('SIGKILL')
  }
  return taken
}

/** Put one picture through the operations door — the same door the sheet's file input uses. */
async function upload({ api, cookie, template, file, bytes }) {
  const response = await fetch(`${api}/api/ops/templates/${template}/shots/${file}`, {
    method: 'PUT',
    headers: {
      'content-type': 'image/png',
      origin: api,
      ...(cookie ? { cookie } : {})
    },
    body: bytes
  })
  if (response.ok) return null
  const body = await response.json().catch(() => ({}))
  return body.reason ?? `the door answered ${response.status}`
}

async function main() {
  const asked = parseShoot(process.argv.slice(2))
  if (asked.error) {
    console.error(asked.error)
    process.exitCode = 2
    return
  }
  console.log(`${asked.layouts.length} layouts × ${VIEWPORTS.length} viewports from ${asked.base}`)
  const taken = await shoot(asked)

  if (asked.api === null) {
    console.log(`${taken.length} pictures in ${asked.out}/ — pass --api to send them to a server.`)
    return
  }
  // The operator's own session, because this door is an administrator's. Without one the upload is
  // refused by the door, which is correct: a script with a way past that would be the way past.
  const cookie = asked.cookie ?? process.env.TRACY_OPS_COOKIE ?? null
  if (!cookie) {
    console.error('Set TRACY_OPS_COOKIE (or pass --cookie) to the operator’s own tracy_sess cookie.')
    process.exitCode = 1
    return
  }
  let failed = 0
  for (const { file, bytes } of taken) {
    const problem = await upload({ ...asked, cookie, file, bytes })
    if (problem) {
      console.error(`  ${file}: ${problem}`)
      failed += 1
    }
  }
  console.log(`${taken.length - failed} of ${taken.length} uploaded to ${asked.api}`)
  if (failed > 0) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
