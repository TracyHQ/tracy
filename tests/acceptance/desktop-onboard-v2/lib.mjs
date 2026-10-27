/**
 * Shared pieces of the desktop first-run v2 end-to-end cases (ST-1 … ST-9,
 * tasks/todo-desktop-onboard-v2.md step "E. E2E on the local stand"). Built on the previous line's
 * acceptance kit (`../desktop-onboard/lib.mjs`: the Case/verdict writer, sessions, chrome-watch) and
 * adds what this line needs: the sign-in code mail, an isolated browser context per person, and the
 * desktop app launched from source with three TEST-ONLY seams that live in this folder, never in the
 * app:
 *
 *   - `shell.openExternal` is replaced in the app's main process, so the browser URL of a desktop
 *     round is CAPTURED (and driven in chrome-watch's Chrome) instead of opening the machine's browser;
 *   - the operating-system language is set with Cocoa's argument domain (`-AppleLanguages (de-AT)`),
 *     which `app.getPreferredSystemLanguages()` reads like a real system setting;
 *   - the macOS notification permission comes from `fake-notify-addon.cjs`, preloaded into the main
 *     process with `-r` (launch.mjs `require`; Playwright drops NODE_OPTIONS): it answers `require(<…>/notify-permission.node)` with an object whose
 *     `read()` returns what a state file says, so a case can switch `denied → allowed` mid-run.
 *
 * Two kinds of target (`targetKind`, same rule as the previous kit): a STAND (any non-`tracy.site`
 * address; sessions minted with the stand's SESSION_SECRET, sign-in codes read from the tracy-web
 * container's console mail) and DEV (`https://cowork.tracy.site`; sessions minted on the dev host,
 * codes read from `--code-file`, a file the person or agent writing the code into it owns, because
 * dev sends real mail).
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { machineHost } from '../../../scripts/lib/machine-hosts.mjs'
import { Blocked, chrome, cookieOf, session, sleep, targetKind, until } from '../desktop-onboard/lib.mjs'

export {
  Blocked,
  chromeErrors,
  cookieOf,
  readPrefs,
  runCase,
  session,
  sleep,
  targetKind,
  until
} from '../desktop-onboard/lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = resolve(HERE, '../../..')
export const DEFAULT_BASE = 'http://ob2.tracy.test:46080'
export const CASES = ['ST-1', 'ST-2', 'ST-3', 'ST-4', 'ST-5', 'ST-6', 'ST-7', 'ST-8', 'ST-9']

// ── Arguments ────────────────────────────────────────────────────────────────────────────────────

/**
 * `--base <url>` · `--old-base <url>` (ST-9: a server without this line's tracy-web) · `--only ST-1,ST-2`
 * · `--out <dir>` · `--typed <addr>` (the address typed in the app; stand default: a fresh
 * `@example.test` one per case) · `--code-file <path>` (dev: where the sign-in code is written) ·
 * `--cookie-file <path>` (dev: the "other account" browser session of ST-3).
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const o = {
    base: DEFAULT_BASE,
    oldBase: null,
    only: null,
    out: null,
    typed: null,
    codeFile: null,
    cookieFile: null,
    email: null
  }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s)
    const value = () => (inline !== undefined ? inline : argv[++i])
    if (flag === '--base') o.base = value()
    else if (flag === '--old-base') o.oldBase = value().replace(/\/+$/, '')
    else if (flag === '--only')
      o.only = value()
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    else if (flag === '--out') o.out = resolve(value())
    else if (flag === '--typed') o.typed = value()
    else if (flag === '--code-file') o.codeFile = resolve(value())
    else if (flag === '--cookie-file') o.cookieFile = resolve(value())
    else if (flag === '--run-id') o.runId = value()
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  o.base = o.base.replace(/\/+$/, '')
  o.runId ??= randomBytes(3).toString('hex')
  if (!o.out)
    o.out = join(
      ROOT,
      'output',
      'acceptance-desktop-onboard-v2',
      new Date().toISOString().slice(0, 19).replace(/:/g, '')
    )
  mkdirSync(o.out, { recursive: true })
  return o
}

/** Run a case module directly: `node st-1.mjs --base …`. */
export async function standalone(importMetaUrl, run) {
  if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(importMetaUrl)) {
    const r = await run(parseArgs())
    process.stdout.write(`${r.id} ${r.status} — ${r.why}\n`)
    process.exit(r.status === 'FAIL' ? 1 : 0)
  }
}

/** A fresh address for one role of one case (stand), or the one given with `--typed` (dev). */
export function address(opts, role) {
  if (targetKind(opts.base) === 'dev') {
    if (!opts.typed)
      throw new Blocked('dev sends real mail: pass --typed <an inbox you read> and --code-file')
    // `{role}` in --typed gives each role its own address (e.g. delivered+acc-{role}@resend.dev).
    return opts.typed.replace('{role}', `${opts.runId}-${role}`)
  }
  return `ob2-${opts.runId}-${role}@example.test`
}

// ── The sign-in code ─────────────────────────────────────────────────────────────────────────────

/** The tracy-web container that publishes `base`'s port. */
export function webContainer(base) {
  const port = new URL(base).port || '80'
  const ps = spawnSync('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}'], {
    encoding: 'utf8'
  })
  const web = (ps.stdout ?? '').split('\n').find((n) => /tracy-web/.test(n))
  if (!web) throw new Blocked(`no tracy-web container publishes port ${port}`)
  return web
}

/**
 * Every sign-in code mailed to `email` since `sinceMs` (stand: the console mail lines
 * `[mail] to=<email> subject="… 123456 …"` of tracy-web), oldest first.
 */
export function mailedCodes(opts, email, sinceMs, base = opts.base) {
  if (targetKind(base) === 'dev') return devMailedCodes(email, sinceMs)
  const since = new Date(sinceMs - 2000).toISOString()
  const r = spawnSync('docker', ['logs', '--since', since, webContainer(base)], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`
  const codes = []
  for (const line of text.split('\n')) {
    if (!line.includes(`[mail] to=${email} `)) continue
    const m = /subject=.*?\b(\d{6})\b/.exec(line)
    if (m) codes.push(m[1])
  }
  return codes
}

/**
 * DEV: every sign-in code sent to `email` since `sinceMs`, oldest first, read from the outgoing
 * mail log of dev's mail provider (Resend's `GET /emails`, read-only), queried ON the dev host with
 * the key tracy-web already holds, so the key never leaves that machine. Only the subject lines of
 * mail to `email` come back. Addresses a run types on dev are Resend's test sink
 * (`delivered+<tag>@resend.dev`, see `--typed`), so no person's inbox is involved.
 */
export function devMailedCodes(email, sinceMs) {
  if (!/^[a-z0-9._+-]{1,80}@[a-z0-9.-]{1,80}$/i.test(email)) throw new Error(`refusing address ${email}`)
  const since = new Date(sinceMs - 2000).toISOString().replace('T', ' ').slice(0, 19)
  const filter = `.data[] | select((.to | map(ascii_downcase) | index("${email.toLowerCase()}")) and .created_at >= "${since}") | [.created_at, .subject] | @tsv`
  const remote = [
    'K=$(sudo docker exec tracy-tracy-web-1 printenv MAIL | cut -d: -f2-)',
    `curl -s -H "Authorization: Bearer $K" 'https://api.resend.com/emails?limit=100' | jq -r '${filter}'`
  ].join('; ')
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', devSsh(), remote], {
    encoding: 'utf8',
    timeout: 60_000
  })
  if (r.status !== 0) throw new Blocked(`cannot read dev's sent mail (${(r.stderr || '').slice(0, 200)})`)
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .sort()
    .map((line) => /\b(\d{6})\b/.exec(line.split('\t')[1] ?? '')?.[1])
    .filter(Boolean)
}

/** The dev host over the VPN (same setting the e2e-dev suite uses), read on first use. */
const devSsh = () => process.env.E2E_DEV_SSH ?? machineHost('E2E_SSH_DEV')

/** The latest code mailed to `email` since `sinceMs`, waiting up to `ms`. */
export async function readCode(opts, email, sinceMs, ms = 30_000, base = opts.base) {
  const until = Date.now() + ms
  if (targetKind(base) === 'dev' && !opts.codeFile) {
    while (Date.now() < until + 60_000) {
      const codes = devMailedCodes(email, sinceMs)
      if (codes.length) return codes.at(-1)
      await sleep(3000)
    }
    return null
  }
  if (targetKind(base) === 'dev') {
    while (Date.now() < until + 5 * 60_000) {
      if (existsSync(opts.codeFile) && statSync(opts.codeFile).mtimeMs >= sinceMs) {
        const code = /\d{6}/.exec(readFileSync(opts.codeFile, 'utf8'))?.[0]
        if (code) return code
      }
      await sleep(2000)
    }
    throw new Blocked(`no code written to ${opts.codeFile} within five minutes`)
  }
  while (Date.now() < until) {
    const codes = mailedCodes(opts, email, sinceMs, base)
    if (codes.length) return codes.at(-1)
    await sleep(1000)
  }
  return null
}

// ── Browser: chrome-watch, one context per person ───────────────────────────────────────────────

/**
 * A new context in chrome-watch's Chrome (its default context keeps other sessions' cookies for
 * `.tracy.test`), optionally signed in. Never closed: the person may keep looking at it.
 */
export async function browserContext(opts, s = null) {
  const { browser } = await chrome()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  if (s) await context.addCookies([cookieOf(s)])
  return context
}

/** Who a context is signed in as on the target (`/auth/me` from a page of it), or null. */
export async function viewerOf(page) {
  return page.evaluate(() =>
    fetch('/auth/me', { headers: { accept: 'application/json' }, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.email ?? b?.account?.email ?? null)
      .catch(() => null)
  )
}

// ── Desktop app from source ─────────────────────────────────────────────────────────────────────

const FAKE_ADDON = join(HERE, 'fake-notify-addon.cjs')
const PKG = join(ROOT, 'packages/desktop/tracy-desktop')

/**
 * Where the app under test opens its windows. `imac` (default, rule of 11/10/2026: a GUI under
 * test never opens on the workstation someone is typing on): the app's sources go to the iMac and
 * Electron starts there through `imac-app`; the renderer is driven over CDP and the main process
 * over the Node inspector, both forwarded to this machine. `local` (`E2E_APP_HOST=local`, e.g. on a
 * machine nobody is typing on): Playwright's `_electron.launch` here.
 */
const APP_HOST = process.env.E2E_APP_HOST ?? 'imac'
/** Ports on the iMac (and forwarded here): the window's CDP and the main process's inspector. */
const CDP_PORT = Number(process.env.E2E_APP_CDP_PORT ?? 9351)
const INSPECT_PORT = Number(process.env.E2E_APP_INSPECT_PORT ?? 9352)
const REMOTE_DIR = 'agent-apps/ob2-src'

/** A shell command on the iMac (through `imac-app sh`); its stdout. */
function onImac(command, input) {
  const r = spawnSync('imac-app', ['sh', command], { encoding: 'utf8', input, timeout: 120_000 })
  if (r.status !== 0)
    throw new Error(`imac-app sh failed (${r.status}): ${(r.stderr || r.stdout).slice(0, 300)}`)
  return r.stdout
}

let imacHomeDir
/** The iMac user's home, asked once: the remote paths below must be absolute. */
function imacHome() {
  imacHomeDir ??= onImac('printf %s "$HOME"').trim()
  return imacHomeDir
}

let synced = false
/** The app's sources (package.json, src/ with the built window shell) and the fake addon, on the iMac. */
function syncToImac() {
  if (synced) return
  if (!existsSync(join(PKG, 'src/generated/shell-main.cjs')))
    throw new Blocked(`the window shell is not built — run: node ${join(PKG, 'build/build-shell.mjs')}`)
  onImac(`mkdir -p ~/${REMOTE_DIR}/tracy-desktop`)
  const rsync = spawnSync(
    'rsync',
    [
      '-a',
      '--delete',
      '-e',
      'ssh -o BatchMode=yes',
      join(PKG, 'package.json'),
      join(PKG, 'src'),
      `imac:${REMOTE_DIR}/tracy-desktop/`
    ],
    { encoding: 'utf8' }
  )
  if (rsync.status !== 0) throw new Error(`rsync to the iMac failed: ${rsync.stderr}`)
  spawnSync('rsync', ['-a', '-e', 'ssh -o BatchMode=yes', FAKE_ADDON, `imac:${REMOTE_DIR}/`])
  synced = true
}

/** Forward this machine's 127.0.0.1:`port` to the iMac's, once (ssh -L, in the background). */
async function forwardFromImac(port) {
  const ok = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) }).then(
    () => true,
    () => false
  )
  if (ok) return
  spawnSync('ssh', ['-f', '-N', '-o', 'ExitOnForwardFailure=yes', '-L', `${port}:127.0.0.1:${port}`, 'imac'])
}

/** Evaluate `fn(electron, arg)` in the app's main process through the Node inspector. */
async function inspectorEval(fn, arg) {
  const list = await (await fetch(`http://127.0.0.1:${INSPECT_PORT}/json/list`)).json()
  const ws = new WebSocket(list[0].webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  try {
    const answer = await new Promise((resolve) => {
      ws.addEventListener('message', (e) => {
        const m = JSON.parse(e.data)
        if (m.id === 1) resolve(m)
      })
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(async () => (${fn.toString()})(require('electron'), ${JSON.stringify(arg ?? null)}))()`,
            includeCommandLineAPI: true,
            awaitPromise: true,
            returnByValue: true
          }
        })
      )
    })
    if (answer.result?.exceptionDetails)
      throw new Error(`main process: ${answer.result.exceptionDetails.exception?.description ?? 'exception'}`)
    return answer.result?.result?.value
  } finally {
    ws.close()
  }
}

/**
 * Quit our Electron on the iMac (never anyone else's app: only the copy in ~/agent-apps/Electron/).
 * `imac-app stop Electron` looks for `agent-apps/Electron.app/…` and misses the bundle it copied to
 * `agent-apps/Electron/Electron.app` (measured 11/10/2026), so the processes are ended here.
 */
function stopOnImac() {
  const own = 'agent-apps/Electron/Electron.app/Contents/MacOS/Electron '
  onImac(
    `pkill -TERM -f '${own}' || true; for i in 1 2 3 4 5 6 7 8 9 10 11 12; do pgrep -f '${own}' >/dev/null || exit 0; sleep 0.5; done; pkill -KILL -f '${own}' || true`
  )
}

/** Launch on the iMac; answers the same shape as `launchFromSource`, plus file helpers. */
async function launchOnImac({ base, env, languages, permissionFile, instance }) {
  syncToImac()
  stopOnImac()
  const chosen = instance ?? `e2e-${randomBytes(4).toString('hex')}`
  const bundle = join(
    dirname(createRequire(join(PKG, 'package.json')).resolve('electron')),
    'dist',
    'Electron.app'
  )
  const appEnv = { ...env, TRACY_DESKTOP_ORIGIN: base, TRACY_DESKTOP_INSTANCE: chosen }
  const args = ['open', bundle, '--port', String(CDP_PORT)]
  for (const [k, v] of Object.entries(appEnv)) args.push('--env', `${k}=${v}`)
  args.push('--')
  if (permissionFile) args.push('-r', `${imacHome()}/${REMOTE_DIR}/fake-notify-addon.cjs`)
  args.push(`--inspect=${INSPECT_PORT}`, `${imacHome()}/${REMOTE_DIR}/tracy-desktop`)
  if (languages) args.push('-AppleLanguages', `(${languages.join(',')})`)
  const opened = spawnSync('imac-app', args, { encoding: 'utf8', timeout: 180_000 })
  if (opened.status !== 0)
    throw new Error(`imac-app open failed: ${(opened.stderr || opened.stdout).slice(0, 400)}`)
  await forwardFromImac(INSPECT_PORT)
  const { chromium } = await import('@playwright/test')
  let browser = null
  for (let i = 0; i < 60 && !browser; i++) {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`).catch(() => null)
    if (!browser) await sleep(1000)
  }
  if (!browser) throw new Error(`no CDP from the app on the iMac at :${CDP_PORT}`)
  let window = null
  for (let i = 0; i < 60 && !window; i++) {
    window =
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => !p.url().startsWith('devtools:')) ?? null
    if (!window) await sleep(500)
  }
  if (!window) throw new Error('the app on the iMac opened no window')
  const app = { evaluate: inspectorEval, close: async () => stopOnImac() }
  const profileDir = await inspectorEval(({ app: a }) => a.getPath('userData'))
  return { app, window, profileDir, instance: chosen, browser }
}

/**
 * Launch the app from source on `base` in a fresh profile, with the test seams above.
 * @param {object} opts
 * @param {{ base?: string, languages?: string[], permission?: string, env?: Record<string,string>,
 *   errors?: any[], instance?: string }} o - `languages`: the OS language list (Cocoa argument
 *   domain); `permission`: the fake macOS answer (`allowed|denied|notDetermined|unknown`), none = no
 *   fake (the real reader, which reads `unknown` from source because the addon is not built).
 */
export async function launchApp(
  opts,
  { base = opts.base, languages = ['en-US'], permission, env = {}, errors = [], instance } = {}
) {
  const appEnv = { ...env }
  let permissionFile = null
  let launched
  if (APP_HOST === 'imac') {
    if (permission !== undefined) {
      permissionFile = `${imacHome()}/${REMOTE_DIR}/permission-${randomBytes(3).toString('hex')}.txt`
      onImac(`printf %s ${permission} > ${permissionFile}`)
      appEnv.TRACY_E2E_FAKE_PERMISSION_FILE = permissionFile
    }
    launched = await launchOnImac({ base, env: appEnv, languages, permissionFile, instance })
  } else {
    const { launchFromSource } = await import(pathToFileURL(join(PKG, 'test/e2e/launch.mjs')).href)
    if (permission !== undefined) {
      permissionFile = join(opts.out, `permission-${randomBytes(3).toString('hex')}.txt`)
      writeFileSync(permissionFile, permission)
      appEnv.TRACY_E2E_FAKE_PERMISSION_FILE = permissionFile
    }
    const saved = process.env.TRACY_E2E_CHROMIUM_SWITCHES
    if (languages) process.env.TRACY_E2E_CHROMIUM_SWITCHES = `-AppleLanguages (${languages.join(',')})`
    try {
      launched = await launchFromSource({
        origin: base,
        env: appEnv,
        instance,
        require: permission === undefined ? [] : [FAKE_ADDON]
      })
    } finally {
      if (saved === undefined) delete process.env.TRACY_E2E_CHROMIUM_SWITCHES
      else process.env.TRACY_E2E_CHROMIUM_SWITCHES = saved
    }
  }
  const { app, window } = launched
  // TEST SEAM: every browser open of the main process is recorded instead of performed.
  await app.evaluate(({ shell }) => {
    globalThis.__e2eOpened = []
    shell.openExternal = async (url) => {
      globalThis.__e2eOpened.push(String(url))
    }
  })
  window.on('console', (m) => {
    if (m.type() === 'error') errors.push({ text: m.text().slice(0, 400) })
  })
  window.on('pageerror', (e) => errors.push({ text: `pageerror: ${String(e).slice(0, 400)}` }))
  const remote = APP_HOST === 'imac'
  return {
    ...launched,
    host: APP_HOST,
    permissionFile,
    setPermission: (answer) => {
      if (!permissionFile) return
      if (remote) onImac(`printf %s ${answer} > ${permissionFile}`)
      else writeFileSync(permissionFile, answer)
    },
    /** The profile's preferences.json (wherever the app runs), or null. */
    readPrefs: () => {
      try {
        const file = join(launched.profileDir, 'preferences.json')
        return JSON.parse(remote ? onImac(`cat ${JSON.stringify(file)}`) : readFileSync(file, 'utf8'))
      } catch {
        return null
      }
    },
    /** Write the profile's preferences.json (only while the app is shut). */
    writePrefs: (value) => {
      const file = join(launched.profileDir, 'preferences.json')
      if (remote) onImac(`cat > ${JSON.stringify(file)}`, JSON.stringify(value))
      else writeFileSync(file, JSON.stringify(value))
    },
    opened: () => app.evaluate(() => globalThis.__e2eOpened ?? [])
  }
}

/** Wait for the app to open a browser URL matching `test`; null after `ms`. */
export async function waitOpened(launched, test, ms = 30_000) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const hit = (await launched.opened()).find(test)
    if (hit) return hit
    await sleep(300)
  }
  return null
}

/** The app window's account, read from inside it (`/auth/me` of the product origin). */
export async function appViewer(window, base) {
  return window.evaluate(
    (origin) =>
      fetch(`${origin}/auth/me`, { headers: { accept: 'application/json' }, cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => b?.email ?? b?.account?.email ?? null)
        .catch(() => null),
    base
  )
}

/** Type `email` on the app's `/login?onboard=1` form and send it; resolves on the waiting page. */
export async function typeEmailInApp(window, email) {
  await window.waitForSelector('#email-form #login-email', { timeout: 30_000 })
  await window.fill('#login-email', email)
  await Promise.all([
    window.waitForURL((u) => u.protocol === 'file:', { timeout: 30_000 }),
    window.click('#email-form button[type="submit"]')
  ])
  await window.waitForFunction(
    () => (document.getElementById('code')?.textContent ?? '').trim().length > 0,
    null,
    {
      timeout: 30_000
    }
  )
  return window.evaluate(() => ({
    url: location.href,
    code: document.getElementById('code').textContent.trim(),
    setup: !document.getElementById('setup')?.hidden
  }))
}

/** The overlay's state: open step, rail marks, the chip of the open step. */
export function overlayState(window) {
  return window.evaluate(() => {
    const dialog = document.querySelector('[data-tracy-onboard]')
    if (!dialog) return null
    return {
      step: Number(dialog.getAttribute('data-step-index')),
      rail: [...dialog.querySelectorAll('[data-rail-step]')].map((b) => ({
        i: Number(b.getAttribute('data-rail-step')),
        done: b.getAttribute('data-done') === 'true',
        current: b.getAttribute('aria-current') === 'step',
        text: b.textContent.trim()
      })),
      chipDone: dialog.querySelector('.tv-ob-chip')?.getAttribute('data-done') === 'true',
      chip: dialog.querySelector('.tv-ob-chip')?.textContent.trim() ?? null,
      title: dialog.querySelector('.tv-ob-title')?.textContent.trim() ?? null,
      lang: document.documentElement.lang
    }
  })
}

/** Jump the overlay to step `i` through its rail. */
export async function jumpTo(window, i) {
  await window.click(`[data-tracy-onboard] [data-rail-step="${i}"]`)
  await window.waitForFunction(
    (n) => document.querySelector('[data-tracy-onboard]')?.getAttribute('data-step-index') === String(n),
    i,
    { timeout: 10_000 }
  )
}

/** Close an app, never failing the case on the way out. */
export const closeApp = (launched) => launched?.app.close().catch(() => {})

// ── The browser half of a desktop round ─────────────────────────────────────────────────────────

/** What a round page in the browser shows, read from inside it. */
export function roundPage(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.querySelector('h1')?.textContent.trim() ?? null,
    text: document.body.innerText,
    sendCode: document.querySelectorAll('form[action="/signin/code"]').length,
    verify: !!document.querySelector('form[action="/signin/verify"] input[name="code"]'),
    approve: !!document.querySelector('form[action="/signin/approve"]'),
    approveEmail: document.querySelector('form[action="/signin/approve"] input[name="email"]')?.value ?? null,
    useSession: !!document.querySelector('form[action="/signin"] input[name="use"][value="session"]'),
    strong: [...document.querySelectorAll('strong')].map((s) => s.textContent.trim())
  }))
}

/** Submit the form whose `action` is `action` (the `index`th one), waiting for the next page. */
export async function submitForm(page, action, index = 0) {
  const button = page.locator(`form[action="${action}"]`).nth(index).locator('button[type="submit"]')
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.waitForNavigation({ timeout: 30_000 }),
    button.click()
  ])
}

/** On the code step: type `code` and press "Verify and sign in to the app". */
export async function verifyCode(page, code) {
  await page.fill('form[action="/signin/verify"] input[name="code"]', code)
  await submitForm(page, '/signin/verify')
}

/** Wait until the app window left the waiting page for the product, signed in; its URL or null. */
export async function appSignedIn(window, base, ms = 60_000) {
  try {
    await window.waitForURL((u) => u.origin === new URL(base).origin && u.pathname !== '/login', {
      timeout: ms,
      waitUntil: 'commit'
    })
    return window.url()
  } catch {
    return null
  }
}

/**
 * A stand session for `email` through the real sign-in (`POST /login`, the mailed code, `POST
 * /verify`), so the account row exists as it does for a person: a minted cookie for an address that
 * never signed in passes `/auth/me` but the seat-plan doors answer 401 `notSignedIn` (no `account`
 * row), which would make ST-6 measure a signed-out status.
 */
export async function signedInSession(opts, email) {
  const origin = new URL(opts.base).origin
  const post = (path, body) =>
    fetch(`${opts.base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (tracy-acceptance)'
      },
      body: JSON.stringify(body),
      redirect: 'manual'
    })
  const before = Date.now()
  const sent = await post('/login', { email })
  if (sent.status >= 400) throw new Blocked(`POST /login for ${email} answered ${sent.status}`)
  const code = await readCode(opts, email, before)
  if (!code) throw new Blocked(`no sign-in code mailed to ${email}`)
  const verified = await post('/verify', { email, code })
  const setCookie = verified.headers.get('set-cookie') ?? ''
  const token = /tracy_sess=([^;]+)/.exec(setCookie)?.[1]
  if (!token) throw new Blocked(`POST /verify for ${email} set no session (${verified.status})`)
  // The browser must hold the cookie exactly where the server puts it (dev: `Domain=.tracy.site`),
  // or a later Set-Cookie for another account lands beside it instead of replacing it.
  const cookieDomain = /;\s*domain=\.?([^;]+)/i.exec(setCookie)?.[1]
  return {
    token,
    email,
    via: 'a real email-code sign-in',
    domain: cookieDomain ?? new URL(opts.base).hostname,
    secure: new URL(opts.base).protocol === 'https:'
  }
}

/**
 * The app from source, signed in with a minted session (no round), on the product page with the
 * first-run screen open. `cookies`: more cookies for the target (e.g. `{ tracy_lang: 'fr' }`).
 * @returns {Promise<Awaited<ReturnType<typeof launchApp>> & { s: any }>}
 */
export async function launchSignedIn(
  opts,
  c,
  { email, languages, permission, cookies = {}, errors = [] } = {}
) {
  const s = email ? await signedInSession(opts, email) : await session(opts, { email })
  const launched = await launchApp(opts, {
    languages,
    permission,
    errors,
    env: { TRACY_DESKTOP_ONBOARDING: 'again' }
  })
  const { window } = launched
  await window.waitForLoadState('domcontentloaded')
  const host = new URL(opts.base).hostname
  await window
    .context()
    .addCookies([
      cookieOf(s),
      ...Object.entries(cookies).map(([name, value]) => ({ name, value, domain: host, path: '/' }))
    ])
  await window.goto(`${opts.base}/`)
  const shown = await until(window, () => !!document.querySelector('[data-tracy-onboard]'), undefined, 90_000)
  if (!shown) throw new Error(`the first-run screen did not open on ${window.url()}`)
  c.log(`app signed in as ${s.email ?? s.via}; first-run screen open on ${window.url()}`)
  return { ...launched, s }
}
