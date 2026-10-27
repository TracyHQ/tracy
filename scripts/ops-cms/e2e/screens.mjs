#!/usr/bin/env node
/**
 * Browser acceptance for /ops/cms, against the packaged app (not Storybook, not Vite preview).
 *
 * usage: node e2e-ops-cms.mjs <out-dir> [width] [height] [globals]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [outDir, W = '1440', H = '900', THEME = 'light'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })

const ORIGIN = process.env.E2E_ORIGIN ?? 'http://localhost:51791'
const COOKIE_FILE = process.env.E2E_COOKIE_FILE ?? process.env.HOME + '/.tracy-ops-cms-cookie'
const COOKIE = readFileSync(COOKIE_FILE, 'utf8').trim()
const COOKIE_DOMAIN = process.env.E2E_COOKIE_DOMAIN ?? new URL(ORIGIN).hostname

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9381
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
    `--window-size=${W},${H}`,
    `--user-data-dir=${path.join(outDir, '.chrome')}`,
    'about:blank'
  ],
  { stdio: 'ignore' }
)
const results = []
const shutdown = (code) => {
  chrome.kill('SIGKILL')
  process.exit(code)
}
setTimeout(() => {
  console.error('TIMEOUT')
  shutdown(1)
}, 600_000)

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
let consoleErrors = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  } else if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(
      (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300)
    )
  } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(
      m.params.args
        .map((a) => a.value ?? a.description ?? '')
        .join(' ')
        .slice(0, 300)
    )
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
  return r.result?.exceptionDetails ? { __error: r.result.exceptionDetails.text } : r.result?.result?.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: Number(W),
  height: Number(H),
  deviceScaleFactor: 1,
  mobile: Number(W) < 500
})
if (THEME === 'dark')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })

const [name, value] = COOKIE.split('=')
await send('Network.setCookie', { name, value, domain: COOKIE_DOMAIN, path: '/' })

/** Every request the page makes, so we can prove nothing but read APIs were touched. */
const requests = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Network.requestWillBeSent')
    requests.push({ method: m.params.request.method, url: m.params.request.url })
})

function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) console.error(`FAIL ${name} ${detail}`)
}

async function go(url, settle = 2500) {
  consoleErrors = []
  await send('Page.navigate', { url })
  await sleep(settle)
}

async function text() {
  return (await ev('document.body.innerText')) ?? ''
}

async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(outDir, file), Buffer.from(r.result.data, 'base64'))
}

const SCREENS = [
  ['overview', 'Website builds'],
  ['stages', 'Build stages'],
  ['catalog', 'Quickstarts'],
  ['contracts', 'Contracts'],
  ['presets', 'Presets'],
  ['tools', 'Tools'],
  ['questions', 'Site questions']
]

// ── the seven screens, each reached by a direct URL (reload + deep link in one) ───────────────
for (const [id, heading] of SCREENS) {
  const url = `${ORIGIN}/ops/cms${id === 'overview' ? '' : `/${id}`}?env=dev&cms=joomla`
  await go(url)
  const body = await text()
  check(`${id}: heading`, body.includes(heading), body.slice(0, 120))
  check(`${id}: no console error`, consoleErrors.length === 0, consoleErrors[0] ?? '')
  check(`${id}: ref shown`, /origin\/(develop|main(-v3)?)/.test(body) || /[0-9a-f]{9}/.test(body), '')
  const overflow = await ev(
    '({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth })'
  )
  check(`${id}: no horizontal page scroll`, overflow.s <= overflow.c, JSON.stringify(overflow))
  await shot(`${id}.png`)
}

// ── the two refs really differ ───────────────────────────────────────────────────────────────
await go(`${ORIGIN}/ops/cms?env=dev&cms=joomla`)
const devText = await text()
await go(`${ORIGIN}/ops/cms?env=main&cms=joomla`)
const mainText = await text()
check('dev and main render differently', devText !== mainText, '')
check('main says the contract is not on this ref', /Not on this ref/i.test(mainText), mainText.slice(0, 200))
check('dev shows providers', /providers/i.test(devText), '')
await shot('main-overview.png')

// ── deep link, reload, Back/Forward ──────────────────────────────────────────────────────────
await go(`${ORIGIN}/ops/cms/catalog?env=dev&cms=wordpress`)
check(
  'deep link keeps the CMS',
  (await ev('new URLSearchParams(location.search).get("cms")')) === 'wordpress'
)
await ev(
  'history.pushState({}, "", "/ops/cms/presets?env=dev&cms=wordpress"); window.dispatchEvent(new PopStateEvent("popstate"))'
)
await sleep(800)
await ev('history.back()')
await sleep(1200)
const backUrl = await ev('location.pathname + location.search')
check('Back returns to the catalogue', backUrl.includes('/ops/cms/catalog'), backUrl)

// ── search actually filters ──────────────────────────────────────────────────────────────────
await go(`${ORIGIN}/ops/cms/catalog?env=dev&cms=joomla`)
const before = await ev(`document.body.innerText.match(/(\\d+) of (\\d+)/)?.[0] ?? ''`)
await ev(`(() => {
  const el = document.querySelector('input[aria-label="Search designs"]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(el, 'airbnb'); el.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await sleep(1200)
const after = await ev(`document.body.innerText.match(/(\\d+) of (\\d+)/)?.[0] ?? ''`)
check('search changes the result count', before !== after && after.startsWith('1 '), `${before} -> ${after}`)
await shot('catalog-search.png')

// ── C08 · the drawers the drawing was approved with ──────────────────────────────────────────
/**
 * A drawer is not decoration. What it owes the person using it: Escape closes it, focus goes INTO
 * it so a screen reader reads it instead of the page behind, and focus comes BACK to the button
 * that opened it so the keyboard does not lose its place. A panel opened inline gives none of those
 * three, which is why substituting one is a behaviour change and not a styling choice.
 */
const key = (name, code, keyCode, text) => {
  // `text` is what turns a key event into a CHARACTER event, and a <button> only activates on
  // Enter when it gets one. Without it the press arrives, nothing happens, and the drawer test
  // reports "did not open" for a reason that has nothing to do with the drawer.
  const p = {
    key: name,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    ...(text ? { text, unmodifiedText: text } : {})
  }
  return send('Input.dispatchKeyEvent', { type: 'keyDown', ...p }).then(() =>
    send('Input.dispatchKeyEvent', { type: 'keyUp', ...p })
  )
}

async function drawerRound(screen, triggerPrefix, expectInside) {
  await go(`${ORIGIN}/ops/cms/${screen}?env=dev&cms=joomla`)
  const sel = `button[aria-label^="${triggerPrefix}"]`
  const present = await ev(`!!document.querySelector(${JSON.stringify(sel)})`)
  check(`${screen}: a drawer trigger exists (${triggerPrefix})`, present === true, sel)
  if (present !== true) return

  // Open it from the KEYBOARD, not a synthetic click: focus the button and press Enter.
  await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`)
  const label = await ev(`document.activeElement.getAttribute('aria-label')`)
  await key('Enter', 'Enter', 13, '\r')
  await sleep(900)

  const open = await ev(`!!document.querySelector('[role="dialog"]')`)
  check(`${screen}: Enter on the trigger opens the drawer`, open === true, '')
  // A drawer that never opened makes every check after this one pass for the wrong reason:
  // Escape closes nothing, and focus "returns" to a button it never left.
  if (open !== true) {
    check(`${screen}: Escape closes the drawer`, false, 'the drawer never opened')
    check(`${screen}: focus returned to the button that opened it`, false, 'the drawer never opened')
    return
  }
  const body = await text()
  check(`${screen}: the drawer carries its content`, body.includes(expectInside), body.slice(-200))
  const inside = await ev(`!!document.activeElement.closest('[role="dialog"]')`)
  check(
    `${screen}: focus moved into the drawer`,
    inside === true,
    await ev(
      `document.activeElement.tagName + ' ' + (document.activeElement.getAttribute('aria-label') ?? '')`
    )
  )
  const fits = await ev(
    '({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth })'
  )
  check(`${screen}: the open drawer does not push the page sideways`, fits.s <= fits.c, JSON.stringify(fits))
  await shot(`${screen}-drawer.png`)

  await key('Escape', 'Escape', 27)
  await sleep(900)
  check(
    `${screen}: Escape closes the drawer`,
    (await ev(`!!document.querySelector('[role="dialog"]')`)) === false,
    ''
  )
  const returned = await ev(`document.activeElement.getAttribute('aria-label')`)
  check(
    `${screen}: focus returned to the button that opened it`,
    returned === label,
    `${returned} (opened by ${label})`
  )
}

await drawerRound('catalog', 'Artifacts and checksums for', 'Cowork')
await drawerRound('catalog', 'Why ', 'Why')
await drawerRound('contracts', 'Full record for', 'Position')

// ── C08 · a search that matches nothing says so, and lets you back out ───────────────────────
await go(`${ORIGIN}/ops/cms/catalog?env=dev&cms=joomla`)
const typeInto = (label, value) =>
  ev(`(() => {
  const el = document.querySelector('input[aria-label=${JSON.stringify(label)}]')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await typeInto('Search designs', 'zzzzz-no-such-design')
await sleep(1000)
const empty = await text()
check(
  'no-results says which term found nothing',
  /No rows match/.test(empty) && empty.includes('zzzzz-no-such-design'),
  empty.slice(0, 160)
)
await shot('catalog-no-results.png')
await ev(
  `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Clear the search')?.click()`
)
await sleep(900)
check('clearing the search brings the rows back', !/No rows match/.test(await text()), '')

// ── C08 · the CMS and the ref survive moving between screens ─────────────────────────────────
await go(`${ORIGIN}/ops/cms/catalog?env=main&cms=wordpress`)
const wide = Number(W) >= 768
if (wide) {
  await ev(
    `[...document.querySelectorAll('nav a, nav button')].find(el => el.textContent.trim() === 'Presets')?.click()`
  )
} else {
  await ev(`(() => {
    const sel = document.querySelector('select[aria-label="Screen"]')
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    set.call(sel, 'presets'); sel.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}
await sleep(1500)
const keptUrl = await ev('location.pathname + location.search')
check(
  'moving to another screen keeps env and cms',
  keptUrl.includes('/presets') && keptUrl.includes('env=main') && keptUrl.includes('cms=wordpress'),
  keptUrl
)
check('and the ref on screen is still Main', /origin\/main(-v3)?\b/.test(await text()), '')

// ── C08 · the rule bench answers from the rule in THIS snapshot ──────────────────────────────
/**
 * The bench must not carry its own copy of the rule: a copy keeps answering confidently after the
 * real resolver moves. So the expected answer here is recomputed from the resolver the API serves
 * for this very ref, and the bench is only allowed to agree with that.
 */
await go(`${ORIGIN}/ops/cms/presets?env=dev&cms=joomla`)
const snapForRule = await (
  await fetch(`${ORIGIN}/api/ops/cms/snapshot?env=dev`, { headers: { cookie: COOKIE } })
).json()
const resolver = snapForRule.sections?.presets?.data?.resolver ?? null
check(
  'the snapshot carries the resolver rule',
  Boolean(resolver?.roles && resolver?.platforms && resolver?.fallbackRole),
  JSON.stringify(resolver)?.slice(0, 140)
)
if (resolver?.roles) {
  const benchPresent = await ev(`!!document.querySelector('output[aria-label="Resolved preset"]')`)
  check('the rule bench is on the Presets screen', benchPresent === true, '')
  const expect = (have, target) => {
    const role =
      resolver.roles.find((r) => resolver.platforms.some((p) => have === `${r}-${p}`)) ??
      resolver.fallbackRole
    return `${role}-${target}`
  }
  const pickSel = (label, value) =>
    ev(`(() => {
    const el = document.querySelector('select[aria-label=${JSON.stringify(label)}]')
    const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  const cases = [
    [`${resolver.roles[0]}-${resolver.platforms[0]}`, resolver.platforms[1] ?? resolver.platforms[0]],
    [`${resolver.roles[1] ?? resolver.roles[0]}-${resolver.platforms[0]}`, resolver.platforms[0]],
    ['standard', resolver.platforms[0]],
    ['plan', resolver.platforms[resolver.platforms.length - 1]]
  ]
  for (const [have, target] of cases) {
    await pickSel('Source preset', have)
    await pickSel('Target CMS', target)
    await sleep(400)
    const shown = await ev(
      `document.querySelector('output[aria-label="Resolved preset"]').textContent.trim()`
    )
    check(
      `rule bench: ${have} + ${target} → ${expect(have, target)}`,
      shown === expect(have, target),
      String(shown)
    )
  }
  await shot('presets-try-the-rule.png')
  const wrote = requests.filter((r) => r.method !== 'GET')
  check('using the bench wrote nothing', wrote.length === 0, JSON.stringify(wrote.slice(0, 3)))
}

// ── /ops shares the shell but pays nothing for the cms area ──────────────────────────────────
// One SPA since 19/09: the rail on /ops lists the cms screens too, so "the old surface is
// untouched" is no longer the claim. The claim is that opening /ops costs no cms request and no
// cms chunk — the area is lazy-loaded, and /ops must not download it until a cms screen is opened.
const beforeOps = requests.length
await go(`${ORIGIN}/ops`)
const opsText = await text()
check('/ops renders the shell', /CMS agents|Tracy harness/i.test(opsText), opsText.slice(0, 160))
// The rail is in the DOM at every width (hidden below `md`), so read it, not the visible text.
const railText = (await ev(`document.querySelector('nav')?.textContent ?? ''`)) ?? ''
check('/ops lists the cms screens in its rail', railText.includes('Website builds'), railText.slice(0, 160))
const sinceOps = requests.slice(beforeOps)
check(
  '/ops made no cms request',
  !sinceOps.some((r) => r.url.includes('/api/ops/cms/')),
  sinceOps.map((r) => new URL(r.url).pathname).join(', ')
)
check(
  '/ops did not load the cms chunk',
  !sinceOps.some((r) => /\/ops\/assets\/App-[^/]+\.js$/.test(r.url)),
  sinceOps.map((r) => new URL(r.url).pathname).join(', ')
)
await shot('ops-shell.png')

// ── every request this page made was a GET to a read API ─────────────────────────────────────
const nonGet = requests.filter((r) => r.method !== 'GET')
check('no non-GET request was made', nonGet.length === 0, JSON.stringify(nonGet.slice(0, 5)))
const apiCalls = [
  ...new Set(requests.filter((r) => r.url.includes('/api/')).map((r) => new URL(r.url).pathname))
]
// The snapshot screens read `/api/ops/cms/*`; Catalog and Site questions (15/09) also read the
// live `/api/ops/build-base/*` and `/api/ops/build-questions/*` settings. All reads — the non-GET
// check above is what guards against a write.
check(
  'only ops read APIs were called',
  apiCalls.every((p) => /^\/api\/ops\/(cms|build-base|build-questions)\//.test(p)),
  apiCalls.join(', ')
)

writeFileSync(
  path.join(outDir, 'results.json'),
  `${JSON.stringify({ results, apiCalls, requests: requests.length }, null, 2)}\n`
)
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length}/${results.length} checks passed at ${W}x${H} ${THEME}`)
for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`)
shutdown(failed.length > 0 ? 1 : 0)
