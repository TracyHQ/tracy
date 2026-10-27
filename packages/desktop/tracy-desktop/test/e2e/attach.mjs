/**
 * Attach Playwright to a source run of the app that is ALREADY UP (`pnpm debug`), instead of
 * launching a new one (`launch.mjs`). The run's `<profile>/runtime.json` names its pid, origin and
 * Chromium debug address; this attaches only when that pid is alive, runs the origin asked for, and is
 * the process listening on that address — a stale file or another agent's run is refused with the
 * reason, never driven by mistake.
 *
 *   TRACY_DESKTOP_INSTANCE=me TRACY_DESKTOP_ORIGIN=http://tracy.test:8080 pnpm debug   # the run
 *   pnpm attach --origin http://tracy.test:8080 --instance me                       # this, from the same checkout
 *   pnpm attach --runtime <profile>/runtime.json --origin http://tracy.test:8080
 *
 *   import { attachToRunning } from './attach.mjs'
 *   const { browser, pid } = await attachToRunning({ origin, instance: 'me' })
 *   const page = browser.contexts()[0].pages()[0]
 *
 * It never closes the app: leaving disconnects Playwright and the run goes on. Stop the run by the pid
 * in runtime.json, and only a run you started.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const REPO = path.resolve(PKG, '..', '..', '..')

const LOOPBACK_CDP = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/

/**
 * May this run be attached? Pure: the caller reads the file, the process table and the port owner.
 * @param {{
 *   file: string,
 *   record: object | { parseError: string } | null, - runtime.json parsed, or null when there is none
 *   origin?: string, - the origin the agent means to drive
 *   alive: (pid: number) => boolean,
 *   portOwner: (port: number) => number | null - the pid listening on that loopback port, or null
 * }} input
 * @returns {{ ok: true, pid: number, cdp: string, origin: string } | { ok: false, reason: string }}
 */
export function attachDecision({ file, record, origin, alive, portOwner }) {
  const no = (reason) => ({ ok: false, reason })
  if (record === null)
    return no(
      `no runtime.json at ${file} — start the app with \`pnpm debug\` and the same TRACY_DESKTOP_INSTANCE and origin`
    )
  if ('parseError' in record) return no(`${file} is not JSON: ${record.parseError}`)
  const { pid } = record
  if (!Number.isInteger(pid) || pid <= 0) return no(`${file} names no pid`)
  if (!alive(pid)) return no(`pid ${pid} is not running — ${file} is left from a run that ended`)
  const want = origin?.replace(/\/+$/, '')
  if (want !== undefined && record.origin !== want) return no(`pid ${pid} runs ${record.origin}, not ${want}`)
  if (!record.cdp) return no(`pid ${pid} was started without a debug port — start it with \`pnpm debug\``)
  const port = LOOPBACK_CDP.exec(record.cdp)?.[1]
  if (!port) return no(`debug address ${record.cdp} is not on loopback (http://127.0.0.1:<port>)`)
  const owner = portOwner(Number(port))
  if (owner === null) return no(`nothing listens on port ${port} — pid ${pid} has no debug port open`)
  if (owner !== pid) return no(`port ${port} is held by pid ${owner}, not ${pid} — not this run's debug port`)
  return { ok: true, pid, cdp: record.cdp, origin: record.origin }
}

/** @param {number} pid */
function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

/** @param {number} port @returns {number | null} the pid listening on 127.0.0.1:<port>. */
function listenerOf(port) {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP@127.0.0.1:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const pid = Number(out.trim().split('\n')[0])
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

/** @param {string} file */
function readRecord(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    return { parseError: error.message }
  }
}

/**
 * The runtime.json a source run of this checkout writes for (origin, instance) — the same function
 * the app uses to pick its profile (src/dev-profile.js).
 * @param {{ origin: string, instance?: string }} input
 */
export function runtimeFileFor({ origin, instance }) {
  const require = createRequire(path.join(PKG, 'package.json'))
  const { sourceProfile } = require('./src/dev-profile.js')
  const env = { ...process.env, TRACY_DESKTOP_ORIGIN: origin }
  if (instance === undefined) delete env.TRACY_DESKTOP_INSTANCE
  else env.TRACY_DESKTOP_INSTANCE = instance
  const appData = path.join(homedir(), 'Library', 'Application Support')
  const { dir } = sourceProfile({ packaged: false, repo: REPO, origin, env, appData })
  return path.join(dir, 'runtime.json')
}

/**
 * @param {{ origin: string, instance?: string, runtime?: string }} input - `runtime` names the file
 *   directly; otherwise it is found from origin + instance.
 * @returns {Promise<{ browser: import('@playwright/test').Browser, pid: number, cdp: string, file: string }>}
 */
export async function attachToRunning({ origin, instance, runtime }) {
  const file = runtime ?? runtimeFileFor({ origin, instance })
  const decision = attachDecision({
    file,
    record: readRecord(file),
    origin,
    alive: isAlive,
    portOwner: listenerOf
  })
  if (!decision.ok) throw new Error(`attach refused: ${decision.reason}`)
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.connectOverCDP(decision.cdp)
  return { browser, pid: decision.pid, cdp: decision.cdp, file }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { origin: { type: 'string' }, instance: { type: 'string' }, runtime: { type: 'string' } },
    strict: true
  })
  if (!values.origin) {
    process.stderr.write('usage: attach.mjs --origin <url> [--instance <name> | --runtime <runtime.json>]\n')
    process.exit(2)
  }
  try {
    const { browser, pid, cdp, file } = await attachToRunning(values)
    process.stdout.write(`attach: pid ${pid} via ${cdp} (${file})\n`)
    for (const page of browser.contexts().flatMap((c) => c.pages()))
      process.stdout.write(`attach: page ${page.url()} — ${JSON.stringify(await page.title())}\n`)
    // Leave without closing: the app is the run's, not this script's.
    process.exit(0)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}
