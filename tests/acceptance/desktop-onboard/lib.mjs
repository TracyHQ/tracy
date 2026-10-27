/**
 * Shared pieces of the Onboard-Agent acceptance cases (ACC-1 … ACC-9, tasks/todo-desktop-onboard-agent.md
 * "Independent acceptance on dev"): arguments, the sign-in strategy, the browser (chrome-watch only),
 * the desktop app launched from source, and the evidence writer.
 *
 * Two kinds of target, chosen by `--base`:
 * - a STAND (`http://oa.tracy.test:44080`, any non-`tracy.site` address): the session cookie is minted
 *   with the SESSION_SECRET of the tracy-web container that publishes the base's port;
 * - DEV (`https://cowork.tracy.site`): the cookie is a run account's, minted on the dev host through
 *   `tests/e2e-dev/lib/dev.mjs` (ssh over the VPN), or the token in `--cookie-file` (a file holding a
 *   `tracy_sess` value, e.g. written by `tests/e2e-dev/bin/mint.mjs`).
 *
 * Browser pages are opened in chrome-watch's DEFAULT context and left open for the person watching;
 * the scripts never launch or close a Chrome. The desktop app runs from source in a fresh profile of
 * its own per launch (`packages/desktop/tracy-desktop/test/e2e/launch.mjs`).
 *
 * Results: each case ends PASS · FAIL (a check disagreed with the case) · BLOCKED (the environment
 * cannot run a part: missing admin seat, no site, …) · MANUAL (everything automatic passed; a step
 * only a person can do is still open).
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { machineSetting } from '../../../scripts/lib/machine-hosts.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const DEFAULT_BASE = 'http://oa.tracy.test:44080'
// The stand account is a machine setting: a team stand keeps its own in E2E_STAND_EMAIL.
export const STAND_EMAIL = machineSetting('E2E_STAND_EMAIL', 'patowner@example.com')

// ── Arguments ────────────────────────────────────────────────────────────────────────────────────

/**
 * `--base <url>` · `--only ACC-1,ACC-2` · `--out <dir>` · `--email <addr>` (stand: whose session to
 * mint) · `--cookie-file <path>` · `--admin-cookie-file <path>` (ACC-2 on dev: an owner/admin seat
 * of `tracy_admin`) · `--site <siteKey>` (ACC-3 chip, ACC-7 real turn) · `--chat` (ACC-7: send one
 * real prompt) · `--manual-wait <minutes>` (ACC-3/4: how long to wait for the person's external
 * step; 0 = do not wait).
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const o = {
    base: DEFAULT_BASE,
    only: null,
    out: null,
    email: null,
    cookieFile: null,
    adminCookieFile: null,
    site: null,
    chat: false,
    manualWait: 0
  }
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split(/=(.*)/s)
    const value = () => (inline !== undefined ? inline : argv[++i])
    if (flag === '--base') o.base = value()
    else if (flag === '--only')
      o.only = value()
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    else if (flag === '--out') o.out = resolve(value())
    else if (flag === '--email') o.email = value()
    else if (flag === '--cookie-file') o.cookieFile = resolve(value())
    else if (flag === '--admin-cookie-file') o.adminCookieFile = resolve(value())
    else if (flag === '--site') o.site = value()
    else if (flag === '--chat') o.chat = true
    else if (flag === '--manual-wait') o.manualWait = Number(value())
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  o.base = o.base.replace(/\/+$/, '')
  if (!o.out)
    o.out = join(
      ROOT,
      'output',
      'acceptance-desktop-onboard',
      new Date().toISOString().slice(0, 19).replace(/:/g, '')
    )
  return o
}

/** `dev` for a `*.tracy.site` address, `stand` for anything else. */
export function targetKind(base) {
  return new URL(base).hostname.endsWith('.tracy.site') ? 'dev' : 'stand'
}

// ── Evidence and verdicts ───────────────────────────────────────────────────────────────────────

const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v))

/** One case's evidence folder, its steps.log and its verdict. */
export class Case {
  constructor(id, opts) {
    this.id = id
    this.opts = opts
    this.dir = join(opts.out, id)
    mkdirSync(this.dir, { recursive: true })
    this.file = join(this.dir, 'steps.log')
    writeFileSync(this.file, `# ${id} ${new Date().toISOString()} base ${opts.base}\n`)
    this.failed = []
    this.blocked = []
    this.manual = []
    this.notes = []
    this.passed = 0
  }
  log(line) {
    appendFileSync(this.file, `${line}\n`)
  }
  check(label, pass, got) {
    this.log(`${pass ? 'PASS' : 'FAIL'} ${label}${pass ? '' : ` — got ${show(got)}`}`)
    if (pass) this.passed++
    else this.failed.push(`${label} (got ${show(got)?.slice(0, 160)})`)
    return pass
  }
  eq(label, got, want) {
    return this.check(`${label} = ${show(want)}`, got === want, got)
  }
  block(why) {
    this.log(`BLOCKED ${why}`)
    this.blocked.push(why)
  }
  needsPerson(what) {
    this.log(`MANUAL ${what}`)
    this.manual.push(what)
  }
  note(what) {
    this.log(`NOTE ${what}`)
    this.notes.push(what)
  }
  save(name, value) {
    writeFileSync(
      join(this.dir, name),
      typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
    )
  }
  async shot(page, name) {
    try {
      await page.screenshot({ path: join(this.dir, name) })
    } catch (error) {
      this.log(`NOTE screenshot ${name} failed: ${String(error?.message ?? error).slice(0, 120)}`)
    }
  }
  /** The verdict: any FAIL wins, then BLOCKED, then MANUAL, else PASS. */
  verdict() {
    const status = this.failed.length
      ? 'FAIL'
      : this.blocked.length
        ? 'BLOCKED'
        : this.manual.length
          ? 'MANUAL'
          : this.passed > 0
            ? 'PASS'
            : 'BLOCKED'
    const why = this.failed.length
      ? this.failed.join('; ')
      : this.blocked.length
        ? this.blocked.join('; ')
        : this.manual.length
          ? `${this.passed} checks passed; open: ${this.manual.join('; ')}`
          : `${this.passed} checks passed${this.notes.length ? `; ${this.notes.join('; ')}` : ''}`
    const result = {
      id: this.id,
      status,
      why,
      passed: this.passed,
      failed: this.failed,
      blocked: this.blocked,
      manual: this.manual,
      notes: this.notes
    }
    this.save('result.json', result)
    this.log(`RESULT ${status} — ${why}`)
    return result
  }
}

/** Run one case's body: an exception it did not expect is a FAIL with the message, never a crash. */
export async function runCase(id, opts, body) {
  const c = new Case(id, opts)
  try {
    await body(c)
  } catch (error) {
    if (error instanceof Blocked) c.block(error.message)
    else c.check('the case ran to the end', false, String(error?.stack ?? error).slice(0, 600))
  }
  return c.verdict()
}

/** Thrown to stop a case because the environment cannot run it. */
export class Blocked extends Error {}

/** Run a case module directly: `node acc-1.mjs --base …`. */
export async function standalone(importMetaUrl, id, run) {
  if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(importMetaUrl)) {
    const opts = parseArgs()
    const r = await run(opts)
    process.stdout.write(`${r.id} ${r.status} — ${r.why}\n`)
    process.exit(r.status === 'FAIL' ? 1 : 0)
  }
}

// ── Sessions ────────────────────────────────────────────────────────────────────────────────────

/** The tracy-web container that publishes the stand base's port, and its session env. */
function standWeb(base) {
  const port = new URL(base).port || '80'
  const ps = spawnSync('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}'], {
    encoding: 'utf8'
  })
  const web = (ps.stdout ?? '').split('\n').find((n) => /tracy-web/.test(n))
  if (!web) throw new Blocked(`no tracy-web container publishes port ${port}`)
  const envs = spawnSync(
    'docker',
    ['inspect', web, '--format', '{{range .Config.Env}}{{println .}}{{end}}'],
    {
      encoding: 'utf8'
    }
  ).stdout
  const read = (k) =>
    envs
      .split('\n')
      .find((l) => l.startsWith(`${k}=`))
      ?.slice(k.length + 1)
  const secret = read('SESSION_SECRET')?.split(',')[0]
  if (!secret) throw new Blocked(`${web} has no SESSION_SECRET`)
  return { web, secret, domain: read('SESSION_DOMAIN') ?? new URL(base).hostname }
}

/**
 * A `tracy_sess` token for the target, and where the cookie goes.
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {{ role?: string, cookieFile?: string | null, email?: string | null }} [who]
 * @returns {Promise<{ token: string, email: string | null, via: string, domain: string, secure: boolean }>}
 */
export async function session(opts, who = {}) {
  const kind = targetKind(opts.base)
  const file = who.cookieFile ?? opts.cookieFile
  const secure = new URL(opts.base).protocol === 'https:'
  if (file) {
    if (!existsSync(file)) throw new Blocked(`cookie file ${file} does not exist`)
    const token = readFileSync(file, 'utf8').trim()
    return {
      token,
      email: null,
      via: `cookie-file ${file}`,
      domain: kind === 'dev' ? 'tracy.site' : new URL(opts.base).hostname,
      secure
    }
  }
  if (kind === 'stand') {
    const { secret, domain, web } = standWeb(opts.base)
    const { mintSession } = await import(pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/session.js')).href)
    const email = who.email ?? opts.email ?? STAND_EMAIL
    return { token: await mintSession(email, secret), email, via: `minted from ${web}`, domain, secure }
  }
  // dev: a run account minted on the host (e2e-dev's door refuses any other address).
  process.env.E2E_DEV_ORIGIN ??= opts.base
  const { mintCookie } = await import(pathToFileURL(join(ROOT, 'tests/e2e-dev/lib/dev.mjs')).href)
  const runId = (opts.runId ??= `acc${randomBytes(3).toString('hex')}`)
  const email = `e2e-${runId}-${who.role ?? 'owner'}@example.test`
  try {
    return {
      token: await mintCookie(email),
      email,
      via: 'minted on the dev host (e2e-dev)',
      domain: 'tracy.site',
      secure
    }
  } catch (error) {
    throw new Blocked(
      `cannot mint a dev session (${String(error?.message ?? error).slice(0, 160)}); pass --cookie-file`
    )
  }
}

/** The cookie object Playwright adds for a session. */
export const cookieOf = (s) => ({
  name: 'tracy_sess',
  value: s.token,
  domain: `.${s.domain}`,
  path: '/',
  httpOnly: true,
  secure: s.secure,
  sameSite: 'Lax'
})

/** A fetch against the target carrying a session (and Origin on writes, as a browser does). */
export async function api(opts, s, path, { method = 'GET', json } = {}) {
  const headers = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 tracy-acceptance' }
  if (s) headers.cookie = `tracy_sess=${s.token}`
  if (json !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET') headers.origin = new URL(opts.base).origin
  const res = await fetch(`${opts.base}${path}`, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000)
  })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {}
  return { status: res.status, json: body, text }
}

// ── Browser: chrome-watch only ──────────────────────────────────────────────────────────────────

let chromeBrowser = null

/** chrome-watch's Chrome over CDP, and its default context (never a new Chrome, never closed). */
export async function chrome() {
  if (chromeBrowser) return { browser: chromeBrowser, context: chromeBrowser.contexts()[0] }
  const up = spawnSync('chrome-watch', [], { encoding: 'utf8', timeout: 60_000 })
  if (up.status !== 0)
    throw new Blocked(`chrome-watch did not start: ${(up.stderr || up.stdout).slice(0, 200)}`)
  const { chromium } = await import('@playwright/test')
  chromeBrowser = await chromium.connectOverCDP('http://127.0.0.1:9222')
  return { browser: chromeBrowser, context: chromeBrowser.contexts()[0] }
}

/**
 * A page in the default context on `url`, with a session if the browser has none for the target.
 * Opened blank and then navigated (a page opened on its URL can lose its first requests).
 */
let runPage = null

export async function browserPage(opts, url, { s = null } = {}) {
  const { context } = await chrome()
  if (s) await context.addCookies([cookieOf(s)])
  // ONE tab per run, navigated from case to case: every dsh tab keeps long-lived connections to the
  // origin, and Chrome allows six per host — a run that left a tab per step starved the next ones
  // ("Loading…" forever, measured 10/10/2026). The tab stays open for the person afterwards.
  if (!runPage || runPage.isClosed()) runPage = await context.newPage()
  await runPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  return runPage
}

/** Who the browser is signed in as on the target (`/auth/me` from inside a page of it). */
export async function browserViewer(page) {
  return page.evaluate(() =>
    fetch('/auth/me', { headers: { accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.email ?? b?.account?.email ?? null)
      .catch(() => null)
  )
}

/** chrome-watch's error log for pages whose URL holds `text`, since `since` (e.g. `15m`). */
export function chromeErrors(since, text) {
  const r = spawnSync('chrome-watch', ['--errors', '--since', since, '--page', text, '--json'], {
    encoding: 'utf8',
    timeout: 30_000
  })
  const rows = []
  for (const line of (r.stdout ?? '').split('\n')) {
    try {
      if (line.trim()) rows.push(JSON.parse(line))
    } catch {}
  }
  return { rows, raw: rows.length ? null : (r.stdout ?? '').slice(0, 4000) }
}

// ── Desktop app from source ─────────────────────────────────────────────────────────────────────

/**
 * Launch the app from source on the target, signed in, and land on `path`.
 * @param {ReturnType<typeof parseArgs>} opts
 * @param {{ env?: Record<string,string>, instance?: string, s: Awaited<ReturnType<typeof session>>, path?: string, errors?: any[] }} o
 */
export async function launchApp(opts, { env = {}, instance, s, path = '/', errors = [] }) {
  const launcher = join(ROOT, 'packages/desktop/tracy-desktop/test/e2e/launch.mjs')
  if (!existsSync(launcher)) throw new Blocked(`no launcher at ${launcher}`)
  const { launchFromSource } = await import(pathToFileURL(launcher).href)
  const launched = await launchFromSource({ origin: opts.base, env, instance })
  const { window } = launched
  watchErrors(window, errors, 'window-1')
  await window.waitForLoadState('domcontentloaded')
  await window.context().addCookies([cookieOf(s)])
  await window.goto(`${opts.base}${path}`)
  await window.waitForLoadState('domcontentloaded')
  return launched
}

/** Collect console errors and page errors of an app window. */
export function watchErrors(page, errors, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push({ tag, text: m.text().slice(0, 400) })
  })
  page.on('pageerror', (e) => errors.push({ tag, text: `pageerror: ${String(e).slice(0, 400)}` }))
}

/** Poll `fn` in the page until it returns something truthy, or null after `ms`. */
export async function until(page, fn, arg, ms = 30_000) {
  try {
    return await (await page.waitForFunction(fn, arg, { timeout: ms, polling: 250 })).jsonValue()
  } catch {
    return null
  }
}

/** The profile's preferences.json, or null. */
export function readPrefs(profileDir) {
  try {
    return JSON.parse(readFileSync(join(profileDir, 'preferences.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Wait until the overlay shows, or report that it did not within `ms`. */
export const overlayShown = (window, ms = 45_000) =>
  until(window, () => !!document.querySelector('[data-tracy-onboard]'), undefined, ms)

/** Click the real Help › "Getting started" menu item from the main process. */
export async function clickMenu(app, id) {
  return app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId)
    if (!item) return false
    item.click()
    return true
  }, id)
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Settings › AI accounts in the browser (ACC-3, ACC-4) ─────────────────────────────────────────

/**
 * chrome-watch page on Settings › AI accounts with `vendor`'s row in view, signed in (the browser's
 * own session when it has one on the target, else a minted one).
 */
export async function openAiAccounts(c, opts, vendor) {
  const url = `${opts.base}/new/?settings=ai-accounts&vendor=${vendor}`
  let page = await browserPage(opts, url)
  let viewer = await browserViewer(page)
  if (!viewer) {
    const s = await session(opts)
    c.note(`browser had no session; added one (${s.via})`)
    page = await browserPage(opts, url, { s })
    viewer = await browserViewer(page)
  }
  if (!viewer) throw new Blocked('the browser is not signed in on the target')
  c.log(`signed in as ${viewer}`)
  const row = await until(page, (id) => !!document.querySelector(`[data-vendor="${id}"]`), vendor, 45_000)
  if (!row)
    throw new Blocked(`Settings › AI accounts shows no row for ${vendor} (is it switched on at /ops?)`)
  return { page, viewer }
}

/** The vendor rows as the person sees them: active, dimmed, disabled, the button's words, an alert. */
export function rowsState(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-vendor]')].map((row) => {
      const button = row.querySelector(':scope > button')
      return {
        id: row.getAttribute('data-vendor'),
        active: row.getAttribute('data-active') === 'true',
        dimmed: !!button?.classList.contains('opacity-50'),
        disabled: !!button?.disabled,
        button: button?.textContent?.trim() ?? null,
        alert: row.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
        code: row.querySelector('code')?.textContent?.trim() ?? null,
        buttons: [...row.querySelectorAll('button')].map((b) => b.textContent.trim()),
        link: row.querySelector('a[href]')?.getAttribute('href') ?? null,
        input: !!row.querySelector('input')
      }
    })
  )
}

/** The seat-plan status as the page's own session reads it. */
export function planStatus(page) {
  return page.evaluate(() =>
    fetch('/api/seat-plan/status', { headers: { accept: 'application/json' } }).then((r) => r.json())
  )
}
