/**
 * The rendered-DOM view of a forked site: OpenDesign's `web-clone` scripts (vendored in
 * `@tracy/od-skill`, copied into the lane image at /opt/tracy/skills/web-clone/scripts) driven by
 * the image's Chromium over CDP. Three of the fourteen, in order, into `<dir>/recon/`:
 *
 *   recon-site.mjs    RECON/original-recon.json + original-summary.md + screenshots/original-{1440,768,390}.png
 *                     (computed palette per region, @font-face rules, framework signals, console errors)
 *   route-crawl.mjs   RECON/routes/original-route-map.{json,md} + a screenshot per route (title, H1, headings)
 *   dna-scaffold.mjs  RECON/design-dna.json — the "design DNA" skeleton the skill's rewrite mode fills in
 *
 * Measured on lucaswp 06/09: 40 s + 44 s (8 routes) + < 1 s. The browser is the image's
 * `/usr/local/bin/tracy-chrome` wrapper (Dockerfile) named by `OD_BROWSER_EXECUTABLE_PATH`, which the
 * scripts read themselves; without it, or without the scripts (a dev machine), this step is a note in
 * the manifest — never a failed extraction, because phases 1 and 2 do not need it.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const RECON_DIR = 'recon'
/** Where the lane image puts the enabled skills (Dockerfile: `/opt/tracy/skills/<name>`). */
export const RECON_SCRIPTS_DIR = '/opt/tracy/skills/web-clone/scripts'
/** All three scripts together; recon-site alone took 40 s on a 42-image home page. */
export const RECON_TIMEOUT_MS = 150_000
/** Routes are for the page list and their H1s, not a mirror: one level, a dozen pages. */
export const RECON_ROUTE_ARGS = ['--max-pages', '12', '--max-depth', '1']

/** @typedef {'done' | 'skipped:no-browser' | 'skipped:no-scripts' | 'failed:timeout' | `failed:${string}`} ReconStatus */

/**
 * @param {string} url
 * @param {string} dir  the brand directory; evidence lands in `<dir>/recon/RECON/…`
 * @param {{ scriptsDir?: string, browser?: string | null, timeoutMs?: number, onProgress?: (step: string, detail?: string) => void, signal?: AbortSignal }} [o]
 * @returns {Promise<{ status: ReconStatus, detail?: string }>}
 */
export async function runRecon(url, dir, o = {}) {
  const scriptsDir = o.scriptsDir ?? RECON_SCRIPTS_DIR
  const browser = o.browser === undefined ? process.env.OD_BROWSER_EXECUTABLE_PATH?.trim() || null : o.browser
  const progress = o.onProgress ?? (() => {})
  if (!browser) return { status: 'skipped:no-browser' }
  if (!existsSync(path.join(scriptsDir, 'recon-site.mjs'))) return { status: 'skipped:no-scripts' }

  const cwd = path.join(dir, RECON_DIR)
  await fs.rm(cwd, { recursive: true, force: true })
  await fs.mkdir(cwd, { recursive: true })
  const deadline = Date.now() + (o.timeoutMs ?? RECON_TIMEOUT_MS)
  const env = { ...process.env, OD_BROWSER_EXECUTABLE_PATH: browser }

  /** @type {[string, string, string[]][]} */
  const plan = [
    ['recon', 'recon-site.mjs', ['--url', url, '--out', 'RECON', '--label', 'original']],
    [
      'recon-routes',
      'route-crawl.mjs',
      ['--url', url, '--out', 'RECON/routes', '--label', 'original', ...RECON_ROUTE_ARGS]
    ],
    [
      'recon-dna',
      'dna-scaffold.mjs',
      ['--recon', 'RECON/original-recon.json', '--out', 'RECON/design-dna.json', '--name', new URL(url).host]
    ]
  ]
  for (const [step, script, args] of plan) {
    if (o.signal?.aborted) return { status: 'failed:aborted' }
    progress(step)
    const left = deadline - Date.now()
    if (left <= 0) return { status: 'failed:timeout', detail: step }
    const r = await runScript(path.join(scriptsDir, script), args, {
      cwd,
      env,
      timeoutMs: left,
      signal: o.signal
    })
    if (r.status !== 'ok')
      return { status: r.status === 'timeout' ? 'failed:timeout' : `failed:${step}`, detail: r.detail }
  }
  progress('recon-done')
  return { status: 'done' }
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, signal?: AbortSignal }} o
 * @returns {Promise<{ status: 'ok' | 'timeout' | 'exit', detail?: string }>}
 */
function runScript(file, args, { cwd, env, timeoutMs, signal }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let tail = ''
    /** @param {Buffer | string} chunk */
    const keep = (chunk) => {
      tail = (tail + String(chunk)).slice(-2000)
    }
    child.stdout.on('data', keep)
    child.stderr.on('data', keep)
    let settled = false
    /**
     * @param {'ok' | 'timeout' | 'exit'} status
     * @param {string} [detail]
     */
    const finish = (status, detail) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve({ status, detail })
    }
    const kill = () => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 2000).unref()
    }
    const timer = setTimeout(() => {
      kill()
      finish('timeout', tail.trim().slice(-300))
    }, timeoutMs)
    const onAbort = () => {
      kill()
      finish('exit', 'aborted')
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', (error) => finish('exit', error.message))
    child.on('exit', (code) => finish(code === 0 ? 'ok' : 'exit', tail.trim().slice(-300)))
  })
}
