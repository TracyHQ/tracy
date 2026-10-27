// Process and browser lifecycle of the ui layer, plus the story driver.
//
// Ownership: every process this module starts (a Storybook server) and every browser it launches is
// written to a ledger (`owned.json` in the output directory) BEFORE it is started, and only what the
// ledger names is ever stopped. Another session's Storybook on another port is never touched.

import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { assertOutsideRepo, ensureDir, insideDir, writeJson } from './artifacts.mjs'
import {
  COMPOSITE_ROLES,
  OPTIMIZE_RELOAD,
  activeIndex,
  collectDialogFacts,
  collectFacts,
  readFocusStyle
} from './assertions.mjs'
import { VIEWPORTS } from './tables.mjs'
import { ScratchCleanupError, createOwnedScratch } from '../../lib/fsafe.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A failure to reach a dependency, not a product failure. The runner turns it into ENV. */
/** Remove ANSI colour codes from a log tail (the escape byte is built, not typed into a regex). */
const stripAnsi = (text) =>
  text
    .split(String.fromCharCode(27))
    .map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, '')))
    .join('')

export class EnvError extends Error {
  constructor(message, probe) {
    super(message)
    this.name = 'EnvError'
    this.probe = probe
  }
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', (error) =>
      reject(
        ['EPERM', 'EACCES'].includes(error.code)
          ? new EnvError(`cannot bind a local port: ${error.code}`, { probe: 'port-bind', code: error.code })
          : error
      )
    )
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

export const portIsOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(false)
    })
  })

/** Ownership ledger: written before each start, rewritten when the thing stops. */
export class Ledger {
  constructor(file) {
    this.file = file
    this.entries = []
    /** entry -> async stop function; never serialised */
    this.stoppers = new Map()
  }

  /** Register how an entry is stopped, so a signal handler can stop everything the run owns. */
  onStop(entry, fn) {
    this.stoppers.set(entry, fn)
  }

  /** Stop everything still open, newest first. Safe to call twice. */
  async stopAll() {
    for (const entry of [...this.entries].reverse()) {
      const stop = this.stoppers.get(entry)
      if (stop && !entry.stopped) await stop().catch(() => {})
    }
  }

  async add(entry) {
    this.entries.push({ ...entry, startedAt: new Date().toISOString(), stopped: false })
    await writeJson(this.file, { entries: this.entries })
    return this.entries[this.entries.length - 1]
  }

  async mark(entry, patch) {
    Object.assign(entry, patch)
    await writeJson(this.file, { entries: this.entries })
  }

  /** Entries not yet confirmed stopped. */
  get open() {
    return this.entries.filter((e) => !e.stopped)
  }
}

async function fetchOk(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res
  } catch {
    return null
  }
}

/**
 * Start a Storybook dev server on a free port from `benchDir`, which must be a scratch copy of the bench
 * outside the repository (see buildScratch): Vite writes node_modules/.vite-temp next to the bench, and a
 * bench inside the worktree would turn that into a write inside the tree under test.
 * Resolves to `{ port, baseUrl, index, stop }`; throws EnvError with the log tail when it cannot.
 */
export async function startStorybook({
  benchDir,
  outDir,
  ledger,
  label = 'storybook',
  attempts = 3,
  readyTimeoutMs = 420_000
}) {
  assertOutsideRepo(benchDir, 'storybook bench')
  assertOutsideRepo(outDir, 'storybook output')
  const bin = path.join(benchDir, 'node_modules/.bin/storybook')
  if (!existsSync(bin))
    throw new EnvError(`storybook binary missing at ${bin}`, { probe: 'storybook-bin', path: bin })
  await ensureDir(outDir)
  let lastTail = ''
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const port = await freePort()
    const logFile = insideDir(outDir, `${label}-${port}.log`)
    const entry = await ledger.add({ kind: 'storybook', label, port, cwd: benchDir, logFile })
    const out = []
    const child = spawn(
      bin,
      ['dev', '-p', String(port), '--ci', '--no-open', '--exact-port', '--disable-telemetry'],
      {
        cwd: benchDir,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        // CACHE_DIR moves Storybook's cache out of the bench's node_modules/.cache; one per label so a
        // mutant never reads the baseline's compiled modules. Vite's .vite-temp follows the bench's own
        // node_modules, so callers pass a scratch bench (see buildScratch), never the repository's.
        env: {
          ...process.env,
          CI: '1',
          STORYBOOK_DISABLE_TELEMETRY: '1',
          BROWSER: 'none',
          CACHE_DIR: path.join(outDir, `${label}-cache`)
        }
      }
    )
    await ledger.mark(entry, { pid: child.pid })
    ledger.onStop(entry, () => stop())
    let exited = null
    child.on('exit', (code, signal) => {
      exited = { code, signal }
    })
    const logStream = createWriteStream(logFile)
    const collect = (chunk) => {
      logStream.write(chunk)
      out.push(chunk.toString())
      if (out.length > 400) out.shift()
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const stop = async () => {
      if (entry.stopped) return
      if (!exited) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          // already gone
        }
        const deadline = Date.now() + 15_000
        while (!exited && Date.now() < deadline) await sleep(200)
        if (!exited) {
          try {
            process.kill(-child.pid, 'SIGKILL')
          } catch {
            // already gone
          }
          const hard = Date.now() + 5000
          while (!exited && Date.now() < hard) await sleep(100)
        }
      }
      const closed = !(await portIsOpen(port))
      await ledger.mark(entry, { stopped: closed && exited !== null, exited, portClosed: closed })
      await new Promise((resolve) => logStream.end(resolve))
    }

    const deadline = Date.now() + readyTimeoutMs
    let index = null
    let warmed = false
    while (Date.now() < deadline && !exited) {
      const res = await fetchOk(`http://localhost:${port}/index.json`)
      if (res?.ok) {
        try {
          index = await res.json()
          break
        } catch {
          // not ready yet
        }
      }
      await sleep(1000)
    }
    if (index) {
      // The first request makes Vite optimise every dependency and answers nothing until it is done
      // (measured: about a minute on a cold cache). Wait for it here so no story pays for it.
      const warm = await fetchOk(`http://localhost:${port}/iframe.html`, 600_000)
      warmed = Boolean(warm?.ok)
      if (!warmed) {
        lastTail = out.join('').slice(-1500)
        await stop()
        break
      }
      return { port, baseUrl: `http://localhost:${port}`, index, stop, entry }
    }
    lastTail = out.join('').slice(-1500)
    await stop()
    if (!exited || !/EADDRINUSE|already in use|port .* in use/i.test(lastTail)) {
      if (exited) break
    }
  }
  throw new EnvError(`storybook did not become ready: ${stripAnsi(lastTail).slice(-600)}`, {
    probe: 'storybook-start',
    tail: lastTail.slice(-600)
  })
}

/** Launch headless Chromium owned by this run. */
export async function launchBrowser({ ledger, outDir = null }) {
  let chromium
  try {
    ;({ chromium } = await import('@playwright/test'))
  } catch (error) {
    throw new EnvError(`playwright is not importable: ${error.message}`, { probe: 'playwright-import' })
  }
  const entry = await ledger.add({ kind: 'browser', label: 'chromium', pid: process.pid })
  let scratch = null
  try {
    // Chromium's profile and its singleton socket go to TMPDIR; a run's output path can be too long for a
    // unix socket, so TMPDIR is a short scratch this run owns (removed on close). Downloads stay under
    // the output directory, so nothing Chromium writes outlives the run outside its namespace.
    if (outDir) assertOutsideRepo(outDir, 'browser output')
    scratch = createOwnedScratch(`ui-browser-${process.pid}`, 'socket')
    const browser = await chromium.launch({
      headless: true,
      env: { ...process.env, ...scratch.env },
      ...(outDir ? { downloadsPath: path.join(outDir, 'browser-downloads') } : {})
    })
    const owned = scratch
    const originalClose = browser.close.bind(browser)
    ledger.onStop(entry, () => browser.close())
    browser.close = async () => {
      await originalClose().catch(() => {})
      const removed = owned.dispose()
      await ledger.mark(entry, { stopped: true, ...(removed.ok ? {} : { scratchLeft: removed.error }) })
      if (!removed.ok) throw new ScratchCleanupError(`browser scratch was not removed: ${removed.error}`)
    }
    browser.scratchDir = owned.path
    return browser
  } catch (error) {
    const removed = scratch ? scratch.dispose() : { ok: true }
    await ledger.mark(entry, {
      stopped: true,
      failed: error.message.split('\n')[0],
      ...(removed.ok ? {} : { scratchLeft: removed.error })
    })
    throw new EnvError(`chromium cannot launch: ${error.message.split('\n')[0]}`, {
      probe: 'chromium-launch',
      message: error.message.slice(0, 400),
      ...(removed.ok ? {} : { scratchLeft: removed.error })
    })
  }
}

/** Map story items to Storybook index entries by (importPath, id suffix). */
export function indexStories(index) {
  const map = new Map()
  for (const entry of Object.values(index.entries ?? {})) {
    if (entry.type !== 'story') continue
    map.set(`${entry.importPath}::${entry.id.slice(entry.id.lastIndexOf('--') + 2)}`, entry)
  }
  return map
}

export function entryFor(storyMap, detail) {
  return storyMap.get(`${detail.importPath}::${detail.idSuffix}`) ?? null
}

/**
 * Open one story in its own browser context. Events are collected per visit and the context is
 * closed by `dispose()`, so a late response from one story can never be charged to the next.
 */
export async function visitStory(
  browser,
  { baseUrl, storyId, viewport, theme = 'light', readyTimeoutMs = 150_000 }
) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: theme === 'dark' ? 'dark' : 'light'
  })
  const page = await context.newPage()
  const events = []
  const sink = { closed: false }
  const push = (e) => {
    if (!sink.closed) events.push(e)
  }
  page.on('console', (m) => {
    if (m.type() === 'error') push({ type: 'console', text: m.text(), url: m.location()?.url ?? '' })
  })
  page.on('pageerror', (e) => push({ type: 'pageerror', text: e.message }))
  page.on('requestfailed', (r) =>
    push({ type: 'requestfailed', url: r.url(), text: r.failure()?.errorText ?? 'failed' })
  )
  page.on('response', (r) => {
    if (r.status() >= 400) push({ type: 'response', status: r.status(), url: r.url(), text: r.statusText() })
  })
  const dispose = async () => {
    sink.closed = true
    await context.close().catch(() => {})
  }
  const url = `${baseUrl}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story&globals=theme:${theme}`
  let state = 'timeout'
  let errorText = ''
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: readyTimeoutMs })
    const handle = await page.waitForFunction(
      () =>
        document.body.classList.contains('sb-show-main')
          ? 'ok'
          : document.body.classList.contains('sb-show-errordisplay')
            ? 'error'
            : false,
      null,
      { timeout: readyTimeoutMs }
    )
    state = await handle.jsonValue()
    if (state === 'error') {
      errorText = await page.evaluate(
        () => document.querySelector('.sb-errordisplay')?.innerText?.slice(0, 600) ?? ''
      )
    }
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    await sleep(250)
  } catch (error) {
    state = 'timeout'
    errorText = String(error.message).split('\n')[0]
  }
  return { page, events, state, errorText, dispose }
}

/**
 * Visit with the warm-up rule: Vite re-optimises dependencies on first use and answers 504 "Outdated
 * Optimize Dep" while it does. That is the harness, not the product: wait and try again (bounded).
 */
export async function visitSettled(browser, options, { retries = 3 } = {}) {
  let visit = await visitStory(browser, options)
  for (
    let n = 0;
    n < retries &&
    visit.events.some(
      (e) => OPTIMIZE_RELOAD.test(`${e.text ?? ''}`) || (e.status === 504 && /Optimize/.test(e.text ?? ''))
    );
    n++
  ) {
    await visit.dispose()
    await sleep(3000)
    visit = await visitStory(browser, options)
  }
  return visit
}

/** How many Tab walks a page gets before an unreached control counts as unreachable. */
const TAB_WALKS = 3

/** Tab presses allowed inside one frame's document during a walk. */
const FRAME_TABS = 120

/**
 * Press Tab through the page and read each stop's style. Returns the order and focus styles.
 *
 * A page that is still settling (a list filled in by a late fetch, a focus guard that hands focus
 * back a tick later) can end one walk early, so a walk that misses controls is repeated and the
 * stops are merged. A control no walk reaches is still reported; one that any walk reached is
 * reachable by definition, so merging cannot hide a real gap.
 */
export async function walkTabs(page, facts) {
  const subject = facts.controls.filter((c) => c.named && c.visible && !c.disabled)
  const merged = { order: [], stops: [] }
  for (let pass = 0; pass < TAB_WALKS; pass++) {
    const walk = await walkTabsOnce(page, facts, subject)
    for (const i of walk.order) if (!merged.order.includes(i)) merged.order.push(i)
    for (const stop of walk.stops) if (!merged.stops.some((s) => s.i === stop.i)) merged.stops.push(stop)
    if (subject.every((c) => merged.order.includes(c.i))) break
  }
  return merged
}

async function walkTabsOnce(page, facts, subject) {
  const limit = Math.min(subject.length + 6, 90)
  await page.evaluate(() => {
    document.activeElement?.blur?.()
    window.scrollTo(0, 0)
  })
  const order = []
  const seen = new Set()
  const stops = []
  const before = new Map()
  for (const c of facts.controls) before.set(c.i, await page.evaluate(readFocusStyle, c.i))
  let started = false
  let last = null
  let inFrame = 0
  for (let n = 0; n < limit; n++) {
    await page.keyboard.press('Tab')
    const i = await page.evaluate(activeIndex)
    if (i < 0) {
      if (started && i === -1) break
      continue
    }
    started = true
    // Tab inside a frame moves through the frame's own document while the outer page keeps
    // reporting the frame as active; keep pressing until focus leaves it (bounded).
    if (
      i === last &&
      inFrame < FRAME_TABS &&
      (await page.evaluate(() => document.activeElement?.tagName === 'IFRAME'))
    ) {
      inFrame++
      n--
      continue
    }
    last = i
    if (seen.has(i)) break
    seen.add(i)
    order.push(i)
    stops.push({ i, before: before.get(i), after: await page.evaluate(readFocusStyle, i) })
  }
  return { order, stops: stops.filter((s) => s.before && s.after) }
}

/** Open (or find open) a dialog, tab inside it, press Escape, report. Runs against a settled page. */
export async function driveDialog(page) {
  const dialogSelectors =
    '[data-slot=dialog-trigger], [data-slot=sheet-trigger], [data-slot=alert-dialog-trigger], [data-slot=drawer-trigger], [aria-haspopup="dialog"]'
  let before = await page.evaluate(collectDialogFacts)
  let trigger = null
  if (!before.open) {
    const locator = page.locator(dialogSelectors).filter({ visible: true }).first()
    if ((await locator.count()) === 0)
      return { before: { open: false }, afterTab: [], afterEscape: null, trigger: null }
    await locator.evaluate((el) => el.setAttribute('data-qa-trigger', '1'))
    trigger = await locator.evaluate((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`)
    await locator.click({ timeout: 5000 }).catch(() => {})
    for (let n = 0; n < 20 && !(await page.evaluate(collectDialogFacts)).open; n++) await sleep(100)
    before = await page.evaluate(collectDialogFacts)
    if (!before.open) return { before, afterTab: [], afterEscape: null, trigger }
  }
  const afterTab = []
  for (let n = 0; n < 8; n++) {
    await page.keyboard.press('Tab')
    afterTab.push(await page.evaluate(collectDialogFacts))
  }
  await page.keyboard.press('Escape')
  let afterEscape = await page.evaluate(collectDialogFacts)
  for (let n = 0; n < 15 && afterEscape.open; n++) {
    await sleep(100)
    afterEscape = await page.evaluate(collectDialogFacts)
  }
  const focusRestored = trigger
    ? await page.evaluate(() => !!document.activeElement?.closest('[data-qa-trigger]'))
    : null
  return { before, afterTab, afterEscape, trigger, focusRestored }
}

/** Everything the story families need, measured from two visits (1440 and 390). */
export async function measureStory(browser, { baseUrl, storyId, wants }) {
  const result = { storyId, visits: {}, shots: wants.has('shot') ? {} : null }
  // Lets a family tell the bench's own build failure from a failure of any other origin (families.mjs).
  const benchOrigin = new URL(baseUrl).origin
  const desktop = VIEWPORTS.find((v) => v.id === '1440')
  const phone = VIEWPORTS.find((v) => v.id === '390')
  if (wants.has('1440')) {
    const v = await visitSettled(browser, { baseUrl, storyId, viewport: desktop })
    try {
      const m = { state: v.state, errorText: v.errorText, events: v.events, benchOrigin }
      if (v.state === 'ok') {
        m.facts = await v.page.evaluate(collectFacts, { composite: [...COMPOSITE_ROLES] })
        if (wants.has('tab')) Object.assign(m, await walkTabs(v.page, m.facts))
        if (wants.has('dialog')) m.dialog = await driveDialog(v.page)
        m.eventsAfter = [...v.events]
        if (result.shots) result.shots['1440'] = await v.page.screenshot({ fullPage: false })
      }
      result.visits['1440'] = m
    } finally {
      await v.dispose()
    }
  }
  if (wants.has('390')) {
    const v = await visitSettled(browser, { baseUrl, storyId, viewport: phone })
    try {
      const m = { state: v.state, errorText: v.errorText, events: v.events, benchOrigin }
      if (v.state === 'ok') {
        m.facts = await v.page.evaluate(collectFacts, { composite: [...COMPOSITE_ROLES] })
        if (result.shots) result.shots['390'] = await v.page.screenshot({ fullPage: false })
      }
      result.visits['390'] = m
    } finally {
      await v.dispose()
    }
  }
  return result
}

/** Screenshot a story at one viewport/theme. Returns the PNG buffer and visit state. */
export async function screenshotStory(browser, { baseUrl, storyId, viewport, theme = 'light' }) {
  const v = await visitSettled(browser, { baseUrl, storyId, viewport, theme })
  try {
    if (v.state !== 'ok') return { state: v.state, errorText: v.errorText, png: null }
    const png = await v.page.screenshot({ fullPage: false })
    return { state: 'ok', png }
  } finally {
    await v.dispose()
  }
}
