/**
 * The Node half of `@tracy/dsh-brand-engine`: OpenDesign's brand pipeline, run ON THE LANE (the lane
 * reaches public sites; the browser must not fetch third-party pages), writing into the site folder.
 *
 *   POST /api/tracy-brand-engine/extract  { url?, kind?, deep?, refresh? }  start one extraction; default url = https://<siteKey>;
 *                                                            `deep: true` = the quick card first, then crawl + recon swapped in (`phase`);
 *                                                            a site measured in the last 30 days answers 200 `reused` and runs nothing,
 *                                                            unless `refresh: true`
 *   GET  /api/tracy-brand-engine/extract/<host>             its progress: steps so far, then done | failed — and, with no job in this
 *                                                            process, the measurement on disk, so a restart mid-poll loses no card
 *   GET  /api/tracy-brand-engine/jobs                        every job this process remembers, newest first
 *   GET  /api/tracy-brand-engine/brands                      every extracted brand: manifest + a brand.json summary
 *   GET  /api/tracy-brand-engine/brands/<host>/logos/<file>  one downloaded logo, for the card
 *   GET  /api/tracy-brand-engine/brands/<host>/imagery/<file> one harvested image, for the card
 *   DELETE /api/tracy-brand-engine/brands/<host>            forget one
 *   POST /api/tracy-brand-engine/start-from { url }         "Fork a site": crawl the site into Brand/<host>/pages/,
 *                                                            extract it as a reference, add the rendered-DOM recon when
 *                                                            the lane has a browser, and leave docs/agents/start-from.json
 *                                                            for the design skill (step 0). A fresh result is reused.
 *
 * Plus ONE agent tool, `tracy_brand({ action: 'extract' | 'read' | 'list', url? })`: `extract` runs
 * the same pipeline and waits for it; `read` hands the agent `brand.json` and the harvested
 * material as text — this is skill step 1's "what does the site look like today", replacing the
 * screenshot-based `tracy-brand-extract` (spec-brand-engine §3.2).
 *
 * Where it lands: `<siteDir>/Brand/<host>/` (06/09 decision 3), and `@tracy/dsh-design-inspiration`
 * reads that directory to pin `brand:<host>` to the front of its library. Two plugins, one folder,
 * no message between them: the filesystem is the contract.
 *
 * HOLDS NO SECRET, KNOWS NO SEAT: it fetches public pages and writes the customer's own site folder;
 * dsh's gateway already decided who may reach this lane.
 */

import { createReadStream, promises as fs, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

import { siteDirFor } from '@tracy/core/site-dir'

import { PAGES_DIR } from './crawl.mjs'
import {
  BRAND_DIR,
  brandHostOf,
  EXTRACT_TIMEOUT_MS,
  extractBrand,
  kindOf,
  listBrands,
  urlOf
} from './pipeline.mjs'
import { RECON_DIR, RECON_TIMEOUT_MS } from './recon.mjs'
import type { Config, HostContext, WebRoute } from './types.js'
import { resolveSitesRoot, siteRootOf } from '../../../../tools/tracy-subprocess-docker/src/route.mjs'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (LAW #2). */
export const name = 'tracy-brand-engine'

/**
 * 🔒 Every `ctx.<name>` must be listed here. cordis throws the moment a property outside `inject`
 * is READ — a missing name is a dead plugin with no log line.
 */
export const inject = ['webServer', 'tools']

const PREFIX = '/api/tracy-brand-engine'
const MAX_BODY = 4 * 1024
/** How much of material.md the tool hands the agent: the colour and font tables come first, copy last. */
const MATERIAL_CAP = 16 * 1024
/** How much of the recon summary (computed palette, fonts, screenshots list) rides along on `read`. */
const RECON_CAP = 8 * 1024
/** Page rows `read` hands the agent: the crawl is bounded at 20, this is the ceiling either way. */
const PAGES_CAP = 40
/** A forked extraction younger than this is reused by `start-from` instead of redone. */
const FRESH_MS = 24 * 60 * 60 * 1000
/** Where the design skill reads the fork from (step 0), beside design-preview.json. */
const START_FROM_FILE = path.join('docs', 'agents', 'start-from.json')

type Step = { step: string; detail?: string; at: number }
interface Job {
  host: string
  kind: 'own' | 'reference'
  state: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  steps: Step[]
  manifest?: unknown
  error?: { code: string; error: string }
  /**
   * A deep extraction (ADR 0011 §4, the public page): `quick` once the fast pass wrote the card
   * while the crawl + recon still run, `full` once they replaced it — or gave up, in which case
   * the quick card stays and `deepError` says why. A plain extraction has no phase.
   */
  phase?: 'quick' | 'full'
  deepError?: { code: string; error: string }
  done: Promise<unknown>
  controller: AbortController
}

const jobs = new Map<string, Job>()
/** Keyed by site folder and host: one dsh serves every site, and two sites are two folders. */
const jobKey = (config: Config, host: string): string => `${siteDirOf(config)}\n${host}`

/** Where a deep pass writes before it swaps in (relative to the site folder). */
const DEEP_SIDE_DIR = '.brand-deep'

/**
 * Move the deep measurement in `from` over the card in `to` so that `to` is never absent, and
 * remove what the new measurement did not bring.
 *
 * 🔒 THIS CANNOT BE TWO DIRECTORY RENAMES, which is what it used to be. POSIX has no atomic
 * exchange for two non-empty directories, so `rename(to, aside)` then `rename(from, to)` leaves a
 * window in which the card's folder does not exist at all — and `phase` still says `quick`, so a
 * poller is being told to read it. The window is microseconds on an idle laptop and wide enough to
 * hit on the shared CI runner: `routes.test.mjs` went red there on `tokens.css` missing during the
 * deep pass, in single-digit runs, for months.
 *
 * File by file, every replacement IS atomic: `rename` over an existing file swaps the name in one
 * step, so a reader sees either the quick file or the deep one, never nothing.
 *
 * @param {string} from
 * @param {string} to
 */
export async function swapOver(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true })
  const incoming = await fs.readdir(from, { withFileTypes: true })
  for (const entry of incoming) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    const dstIsDir = await fs
      .stat(dst)
      .then((st) => st.isDirectory())
      .catch(() => false)
    if (entry.isDirectory() && dstIsDir) {
      await swapOver(src, dst)
      continue
    }
    // A name that changed kind (file where a directory stood, or the reverse) cannot be renamed
    // over; it is the one case that has to clear the way first.
    if (dstIsDir || entry.isDirectory()) await fs.rm(dst, { recursive: true, force: true })
    await fs.rename(src, dst)
  }
  const kept = new Set(incoming.map((e) => e.name))
  for (const stale of await fs.readdir(to)) {
    if (!kept.has(stale)) await fs.rm(path.join(to, stale), { recursive: true, force: true })
  }
  await fs.rm(from, { recursive: true, force: true }).catch(() => undefined)
}

/**
 * How long a measurement answers for. A site's palette and typefaces do not move in a month, while
 * measuring one costs a crawl and a headless browser on a shared lane — so within this window the
 * folder on disk IS the answer (settled 07/09/2026: thirty days). `refresh: true` overrides it.
 */
const REUSE_MS = 30 * 24 * 60 * 60 * 1000

/** Where write locks live, under a name `SAFE_HOST` cannot match, so it is never read as a brand. */
const LOCK_DIR = '.locks'

/** A lock this old outlived the longest possible extraction: its holder died. */
const LOCK_STALE_MS = EXTRACT_TIMEOUT_MS + RECON_TIMEOUT_MS + 30_000

/** The fields of `manifest.json` this file reads. The engine owns the rest. */
interface Manifest {
  kind?: string
  source?: { extractedAt?: unknown; pages?: unknown }
  [key: string]: unknown
}

/**
 * The site this lane serves, from the env file the lane was created with (`MCP_TRACY_SITE_KEY`).
 * Read lazily and once — same reasoning as `tracy-site-tools`.
 */
let siteKey: string | null | undefined
function laneSiteKey(): string | null {
  if (siteKey !== undefined) return siteKey
  siteKey = process.env.MCP_TRACY_SITE_KEY?.trim() || null
  if (siteKey === null) {
    const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim()
    if (file) {
      try {
        const m = /^MCP_TRACY_SITE_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))
        siteKey = m ? m[1]!.trim().replace(/^["']|["']$/g, '') : null
      } catch {
        siteKey = null
      }
    }
  }
  return siteKey
}

/**
 * The site folder: `config.siteDir` wins; otherwise where dsh stands (same rule as design-inspiration).
 *
 * The HTTP handler never reads this off the plugin's own `config`: one dsh serves every site of a
 * host (ADR 0014) and stands at the sites ROOT, so it scopes `config` per request first —
 * `siteDirFor(config, req)` reads the folder the gate stamped for the caller's seat — and every
 * function below receives that scoped copy. The agent tools scope by their session instead (`scopedTo`).
 */
const siteDirOf = (config: Config): string => config.siteDir ?? path.resolve('.')

/**
 * ONE CONVERSATION, ONE SITE — for the agent's tools. The HTTP doors scope by the gate's header
 * (`siteDirFor`); a tool call has no request, so it scopes by its session's `header.cwd`, through the
 * path fence's own `siteRootOf`. A folder outside the sites root (the `/new/` creation workspace) is
 * its own; the sites root itself is no site (null). No cwd, or a bundle-set `siteDir`: as before.
 */
function scopedTo(config: Config, place: unknown): Config | null {
  if (config.siteDir !== undefined || typeof place !== 'string' || place === '') return config
  const root = resolveSitesRoot(undefined)
  if (place !== root && !place.startsWith(`${root}/`)) return { ...config, siteDir: place }
  try {
    return { ...config, siteDir: siteRootOf(place, root) }
  } catch {
    return null
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY) chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > MAX_BODY) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

/** What a client polls: the job without its promise and controller. */
function publicJob(j: Job): Record<string, unknown> {
  const out: Record<string, unknown> = {
    host: j.host,
    kind: j.kind,
    state: j.state,
    startedAt: j.startedAt,
    steps: j.steps
  }
  if (j.endedAt !== undefined) out.endedAt = j.endedAt
  if (j.manifest !== undefined) out.manifest = j.manifest
  if (j.error !== undefined) out.error = j.error
  if (j.phase !== undefined) out.phase = j.phase
  if (j.deepError !== undefined) out.deepError = j.deepError
  return out
}

/**
 * Start (or join) one extraction per host. A second request for a host already running joins it —
 * the button and the tool may both ask for the same site in one minute, and two harvests writing one
 * directory is the one race this plugin could have.
 */
/**
 * Start an extraction job, or hand back the one already running for this host.
 *
 * `beforeDone` runs after a successful extraction and BEFORE the job reports `done`. It exists
 * because `done` is a promise to whoever polls it: "everything this job leaves behind is on disk".
 * The start-from door used to attach its own `.then` to `job.done` to write
 * `docs/agents/start-from.json` — a second listener on the same promise, so the file landed
 * AFTER `state` had already flipped, and a poller reading the file the moment it saw `done` found
 * ENOENT. Measured 14/09 under CPU contention (#72); the design skill reads that file at its
 * step 0 and would hit the same gap.
 *
 * The write lock belongs to the same promise. Its release used to ride on `.finally`, not awaited,
 * so `done` could be read while the lock file was still on disk — and the next `POST /extract`
 * (a refresh the moment the last run ended) found it, took this process's own finished job for
 * "another writer", answered 202 `waiting-for-writer` and started nothing; the poll then read the
 * OLD job back as done. Measured 14/09 as a red `POST extract deep` on the CI runner (twice), and
 * reproduced by delaying the release 300 ms. Every state flip below now waits for `settle()`.
 */
function startJob(
  config: Config,
  input: string,
  host: string,
  requested: 'own' | 'reference' | undefined,
  pages = false,
  deep = false,
  beforeDone?: () => Promise<void>
): Job {
  const running = jobs.get(jobKey(config, host))
  if (running && running.state === 'running') return running
  const controller = new AbortController()
  // A fork also crawls (≤ 20 pages, ~12 s on joomlart.com) and runs the recon scripts (bounded on
  // their own at RECON_TIMEOUT_MS): the plain 90 s bound cut route-crawl mid-way on the first real
  // run (lucaswp, 06/09) — measured 95 s end to end with routes aborted, so the fork bound is the sum.
  const timer = setTimeout(
    () => controller.abort(),
    pages || deep ? EXTRACT_TIMEOUT_MS + RECON_TIMEOUT_MS : EXTRACT_TIMEOUT_MS
  )
  const job: Job = {
    host,
    kind: kindOf(host, laneSiteKey(), requested),
    state: 'running',
    startedAt: Date.now(),
    steps: [],
    controller,
    done: Promise.resolve()
  }
  // Taken before the first byte is written and released whatever happens, so the publisher on the
  // fleet host never copies a folder mid-rewrite. Not awaited: the lock is advisory and an
  // extraction must not fail because a lock file could not be written — but the release below
  // CHAINS OFF THIS PROMISE, because a measurement that finishes in fifty milliseconds can
  // otherwise release before the take lands and leave a lock nobody holds standing for five
  // minutes.
  const lock = takeLock(config, host).catch(() => undefined)
  const settle = () => lock.then(() => releaseLock(config, host))
  job.done = extractBrand({
    input,
    siteDir: siteDirOf(config),
    siteKey: laneSiteKey(),
    kind: requested,
    pages,
    fetch: config.fetch,
    enrich: config.enrich as Parameters<typeof extractBrand>[0]['enrich'],
    reconScriptsDir: config.reconScriptsDir,
    signal: controller.signal,
    onProgress: (step, detail) => {
      const s: Step = { step, at: Date.now() }
      if (detail !== undefined) s.detail = String(detail).slice(0, 200)
      job.steps.push(s)
    }
  })
    .then(async (r) => {
      if (!r.ok) {
        await settle()
        job.state = 'failed'
        job.error = { code: r.code, error: r.error }
        return r
      }
      job.manifest = r.manifest
      job.kind = (r.manifest as { kind: 'own' | 'reference' }).kind
      if (!deep) {
        if (beforeDone) await beforeDone()
        await settle()
        job.state = 'done'
        return r
      }
      // The quick card is in; the page shows it while the deep pass runs. That pass crawls and
      // runs the recon into a SIDE folder and swaps it in when done, so the card's files never go
      // missing under a poll — `extractBrand` empties its target first.
      job.phase = 'quick'
      const sideSiteDir = path.join(siteDirOf(config), DEEP_SIDE_DIR)
      const deepResult = await extractBrand({
        input,
        siteDir: sideSiteDir,
        siteKey: laneSiteKey(),
        kind: requested,
        pages: true,
        fetch: config.fetch,
        enrich: config.enrich as Parameters<typeof extractBrand>[0]['enrich'],
        reconScriptsDir: config.reconScriptsDir,
        signal: controller.signal,
        onProgress: (step, detail) => {
          const s: Step = { step: `deep:${step}`, at: Date.now() }
          if (detail !== undefined) s.detail = String(detail).slice(0, 200)
          job.steps.push(s)
        }
      }).catch((error: unknown) => ({
        ok: false as const,
        code: 'EXTRACT_FAILED',
        error: error instanceof Error ? error.message : String(error)
      }))
      if (deepResult.ok) {
        // Swap without a moment of nothing — see `swapOver`.
        await swapOver(path.join(sideSiteDir, BRAND_DIR, host), path.join(siteDirOf(config), BRAND_DIR, host))
        job.manifest = deepResult.manifest
      } else {
        job.deepError = { code: deepResult.code, error: deepResult.error }
      }
      await fs.rm(sideSiteDir, { recursive: true, force: true }).catch(() => undefined)
      job.phase = 'full'
      if (beforeDone) await beforeDone()
      await settle()
      job.state = 'done'
      return deepResult.ok ? deepResult : r
    })
    .catch(async (error: unknown) => {
      await settle()
      job.state = 'failed'
      job.error = { code: 'EXTRACT_FAILED', error: error instanceof Error ? error.message : String(error) }
      return { ok: false as const, ...job.error }
    })
    .finally(() => {
      clearTimeout(timer)
      job.endedAt = Date.now()
    })
  jobs.set(jobKey(config, host), job)
  return job
}

/** Image files the harvesters write (logos/, imagery/): a plain name, one of the types they download. */
const LOGO_FILE = /^[a-z0-9][a-z0-9._-]{0,120}\.(png|svg|ico|jpe?g|webp|gif|avif)$/i
const IMAGE_DIRS = new Set(['logos', 'imagery'])
const LOGO_TYPES: Record<string, string> = {
  png: 'image/png',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif'
}

/**
 * What the card shows of a brand, lifted from brand.json: enough to draw it without the browser
 * reading the whole file (imagery, voice and layout stay behind).
 */
function brandSummary(brand: unknown): Record<string, unknown> | null {
  const b = brand && typeof brand === 'object' ? (brand as Record<string, unknown>) : null
  if (!b) return null
  const logo = (b.logo && typeof b.logo === 'object' ? (b.logo as { primary?: unknown }) : {}).primary
  const typo = (b.typography && typeof b.typography === 'object' ? b.typography : {}) as Record<
    string,
    { family?: unknown } | undefined
  >
  const samples = (b.imagery && typeof b.imagery === 'object' ? (b.imagery as { samples?: unknown }) : {})
    .samples
  return {
    name: typeof b.name === 'string' ? b.name : '',
    tagline: typeof b.tagline === 'string' ? b.tagline : '',
    logo: typeof logo === 'string' ? logo : null,
    imagery: Array.isArray(samples)
      ? samples
          .map((x) => (x && typeof x === 'object' ? (x as { file?: unknown }).file : null))
          .filter((f): f is string => typeof f === 'string')
      : [],
    colors: Array.isArray(b.colors)
      ? b.colors
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            role: String((c as { role?: unknown }).role ?? ''),
            hex: String((c as { hex?: unknown }).hex ?? '')
          }))
      : [],
    display: typeof typo.display?.family === 'string' ? typo.display.family : null,
    body: typeof typo.body?.family === 'string' ? typo.body.family : null
  }
}

/** The record the design skill reads at step 0: which site was forked, and that the mode is rewrite. */
async function writeStartFrom(config: Config, url: string, host: string): Promise<void> {
  const file = path.join(siteDirOf(config), START_FROM_FILE)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const record = {
    schemaVersion: 'tracy-start-from/v1',
    url,
    host,
    id: `brand:${host}`,
    mode: 'rewrite',
    at: new Date().toISOString()
  }
  await fs.writeFile(file, `${JSON.stringify(record, null, 2)}\n`)
}

/** A forked extraction of this host younger than FRESH_MS, or `null` — the reason `start-from` twice is cheap. */
async function freshFork(config: Config, host: string): Promise<Record<string, unknown> | null> {
  const raw = await brandText(config, host, 'manifest.json')
  if (raw === null) return null
  try {
    const m = JSON.parse(raw) as { source?: { pages?: unknown; extractedAt?: unknown } }
    const at = typeof m.source?.extractedAt === 'string' ? Date.parse(m.source.extractedAt) : NaN
    if (m.source?.pages !== true || !Number.isFinite(at) || Date.now() - at > FRESH_MS) return null
    return m as Record<string, unknown>
  } catch {
    return null
  }
}

/** The page list of a forked site, as the tool hands it to the agent; `null` for a plain extraction. */
async function pagesOf(
  config: Config,
  host: string
): Promise<{ url: string; title: string; h1: string; file: string }[] | null> {
  const raw = await brandText(config, host, path.join(PAGES_DIR, 'pages.json'))
  if (raw === null) return null
  try {
    const rows = (JSON.parse(raw) as { pages?: unknown }).pages
    if (!Array.isArray(rows)) return null
    return rows.slice(0, PAGES_CAP).map((r) => {
      const p = (r ?? {}) as Record<string, unknown>
      return {
        url: String(p.url ?? ''),
        title: String(p.title ?? ''),
        h1: String(p.h1 ?? ''),
        file: String(p.file ?? '')
      }
    })
  } catch {
    return null
  }
}

/** Read one text file of a brand, or `null`. The host was validated by `brandHostOf` before this. */
async function brandText(config: Config, host: string, file: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(siteDirOf(config), BRAND_DIR, host, file), 'utf8')
  } catch {
    return null
  }
}

/** This host's manifest as an object, or `null` when there is no readable one. */
async function manifestOnDisk(config: Config, host: string): Promise<Manifest | null> {
  const raw = await brandText(config, host, 'manifest.json')
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as Manifest
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Whether a measurement on disk answers the question being asked, so nothing has to run.
 *
 * A site's colours and typefaces do not move in a month, and measuring one costs a crawl and a
 * headless browser — so a folder younger than `REUSE_MS` is the answer, not a starting point
 * (settled 07/09/2026: thirty days). `refresh: true` is how a caller says it wants the site as it is now.
 *
 * The one thing that is NOT interchangeable is depth: a quick measurement cannot answer a request
 * that asked for the crawl, so `wantPages` demands a folder that has one.
 */
function reusable(manifest: Manifest | null, wantPages: boolean, now = Date.now()): boolean {
  const at = manifest?.source?.extractedAt
  if (typeof at !== 'string') return false
  const stamp = Date.parse(at)
  if (!Number.isFinite(stamp) || now - stamp > REUSE_MS || stamp > now + 60_000) return false
  return !wantPages || manifest?.source?.pages === true
}

/** What a caller polling for a job is told about a measurement that was already on disk. */
function jobFromDisk(host: string, manifest: Manifest, reused: boolean): Record<string, unknown> {
  const at = Date.parse(String(manifest.source?.extractedAt ?? '')) || Date.now()
  return {
    host,
    kind: manifest.kind === 'own' ? 'own' : 'reference',
    state: 'done',
    phase: 'full',
    startedAt: at,
    endedAt: at,
    steps: [{ step: reused ? 'reused' : 'on-disk', detail: String(manifest.source?.extractedAt ?? ''), at }],
    // Whether this measurement still answers for the site, decided HERE so the caller does not
    // carry a second copy of the thirty days. `cowork-web` reads it to skip a human check nobody
    // needs when there is nothing to run.
    fresh: reusable(manifest, false),
    manifest
  }
}

/** Where the write locks live: inside `Brand/`, under a name no hostname can take. */
const lockFile = (config: Config, host: string): string =>
  path.join(siteDirOf(config), BRAND_DIR, LOCK_DIR, host)

/**
 * Whether some other process is writing this host's folder right now.
 *
 * 🔒 THIS IS NOT ABOUT TWO EXTRACTIONS. `startJob` already joins a second request to a running one,
 * and one lane runs one dsh. It is about the PUBLISHER: `sync-brands.sh` on the fleet host copies
 * `Brand/<host>/` out to the public shelf on a ten-minute timer, and `extractBrand` empties that
 * folder before refilling it. A copy that lands in that window publishes half a design system —
 * and, because `manifest.json` is written last, one that looks complete on its next pass.
 *
 * A lock older than the longest an extraction can run belonged to a process that died holding it,
 * and is ignored rather than waited on: a stale lock that blocked forever would be worse than the
 * race it guards.
 */
async function lockedElsewhere(config: Config, host: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockFile(config, host))
    return Date.now() - stat.mtimeMs < LOCK_STALE_MS
  } catch {
    return false
  }
}

async function takeLock(config: Config, host: string): Promise<void> {
  const file = lockFile(config, host)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${process.pid} ${new Date().toISOString()}\n`)
}

async function releaseLock(config: Config, host: string): Promise<void> {
  await fs.rm(lockFile(config, host), { force: true }).catch(() => undefined)
}

/**
 * What the model reads to CHOOSE this tool and call it right — sent on every step of every conversation
 * of every mode, so it says what, when, the call and the refusals, and nothing the answer or the skill
 * already says (bench flow D, 05/10/2026: 2,881 characters of schema re-sent on all 445 steps of 55 runs,
 * and called in none). How the brand feeds a redesign — read it in step 1, propose it, write its copy —
 * is the `tracy-design-inspiration` skill's; what a read holds is in the read's own answer.
 * `scripts/test/tool-schema-budget.test.mjs` holds the size and the parts.
 */
const DESCRIPTION =
  "The customer's brand as their live site shows it — colours, fonts, logo, tagline, sample images — or any " +
  'public site\'s, as a design template of its own: `brand:<host>`. action="read" (url default: this site) → ' +
  '{manifest, brand, material}; NOT_EXTRACTED → extract it first. action="extract" measures it (4–10 s); one ' +
  'measured in the last 30 days comes back as it stands, `reused: true`, unless refresh. pages:true also crawls ' +
  'its pages ("Fork a site"): write the customer\'s own pages from that list, never the source\'s words. ' +
  'action="list" → every extracted brand. Refusals: BAD_URL (not a public site), NO_MATERIAL (could not be ' +
  'fetched from here: say so, offer to look in the browser). How it feeds a redesign: the ' +
  'tracy-design-inspiration skill.'

export function apply(ctx: HostContext, bundleConfig: Config = {}): void {
  const route: WebRoute = {
    kind: 'prefix',
    path: PREFIX,
    handler: (req, res) => {
      // Which site this caller stands on — from the gate's header, not from where dsh stands.
      const scoped: Config = { ...bundleConfig, siteDir: siteDirFor(bundleConfig, req) }
      const pathname = (req.url ?? '').split('?')[0] ?? ''
      const rest = pathname.slice(PREFIX.length).replace(/^\/+/, '').replace(/\/+$/, '')
      const parts = rest.split('/').map((p) => decodeURIComponent(p))
      const method = req.method ?? 'GET'

      if (method === 'POST' && rest === 'extract') {
        void readJson(req).then(async (body) => {
          const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
          const key = laneSiteKey()
          const input =
            typeof b.url === 'string' && b.url.trim() ? b.url.trim() : key ? `https://${key}/` : ''
          const host = brandHostOf(input)
          if (host === null) {
            writeJson(res, 400, { ok: false, code: 'BAD_URL', error: 'url must name a public http(s) site' })
            return
          }
          const deep = b.deep === true
          const running = jobs.get(jobKey(scoped, host))
          // Already measured recently: hand back the folder rather than measure it again. Checked
          // before the lock and before any work, because the cheapest answer is the one that
          // touches nothing — `refresh: true` is how a caller asks for the site as it is right now.
          if (b.refresh !== true && !(running && running.state === 'running')) {
            const manifest = await manifestOnDisk(scoped, host)
            if (reusable(manifest, deep)) {
              writeJson(res, 200, { ok: true, reused: true, ...jobFromDisk(host, manifest!, true) })
              return
            }
          }
          // Someone else is rewriting this folder. Do not start a second writer: report the state
          // the caller polls with, and let the poll pick up the result the other writer lands.
          if (!(running && running.state === 'running') && (await lockedElsewhere(scoped, host))) {
            writeJson(res, 202, {
              ok: true,
              host,
              kind: kindOf(host, laneSiteKey(), b.kind === 'own' ? 'own' : undefined),
              state: 'running',
              startedAt: Date.now(),
              steps: [{ step: 'waiting-for-writer', at: Date.now() }]
            })
            return
          }
          const requested = b.kind === 'own' || b.kind === 'reference' ? b.kind : undefined
          const job = startJob(scoped, input, host, requested, false, deep)
          writeJson(res, 202, { ok: true, ...publicJob(job) })
        })
        return
      }
      if (method === 'POST' && rest === 'start-from') {
        void readJson(req).then(async (body) => {
          const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
          const input = typeof b.url === 'string' ? b.url.trim() : ''
          const host = brandHostOf(input)
          const url = urlOf(input)
          if (host === null || url === null) {
            writeJson(res, 400, { ok: false, code: 'BAD_URL', error: 'url must name a public http(s) site' })
            return
          }
          const running = jobs.get(jobKey(scoped, host))
          if (!running || running.state !== 'running') {
            const fresh = await freshFork(scoped, host)
            if (fresh) {
              await writeStartFrom(scoped, url, host)
              writeJson(res, 200, { ok: true, reused: true, host, kind: 'reference', manifest: fresh })
              return
            }
          }
          // The record is written INSIDE the job, before it reports `done` — see `startJob`. A
          // failure to write it is the job's failure: a fork whose record is missing is a fork the
          // design skill cannot start from, and `done` would be a lie.
          const job = startJob(scoped, input, host, 'reference', true, false, () =>
            writeStartFrom(scoped, url, host)
          )
          writeJson(res, 202, { ok: true, ...publicJob(job) })
        })
        return
      }
      // Every job this process remembers, newest first — the Brand builder tab adopts the ones it did
      // not start itself (the `?fork=` hook, the agent's tool), so a fork that failed is SEEN, not silent.
      if (method === 'GET' && rest === 'jobs') {
        const all = [...jobs.entries()]
          .filter(([key]) => key.startsWith(`${siteDirOf(scoped)}\n`))
          .map(([, job]) => job)
          .sort((a, b) => b.startedAt - a.startedAt)
          .map(publicJob)
        writeJson(res, 200, { ok: true, jobs: all })
        return
      }
      if (method === 'GET' && parts.length === 2 && parts[0] === 'extract') {
        const host = brandHostOf(parts[1] ?? '')
        const job = host ? jobs.get(jobKey(scoped, host)) : undefined
        if (job) {
          writeJson(res, 200, { ok: true, ...publicJob(job) })
          return
        }
        // No job in this process, but the card may be on disk: a lane that restarted mid-poll, or a
        // measurement handed back without running. A folder that exists IS a finished measurement —
        // answering 404 would make the caller ask for work that is already done.
        void (async () => {
          const manifest = host === null ? null : await manifestOnDisk(scoped, host)
          if (manifest === null) {
            writeJson(res, 404, { ok: false, code: 'NO_JOB' })
            return
          }
          writeJson(res, 200, { ok: true, ...jobFromDisk(host!, manifest, false) })
        })()
        return
      }
      if (method === 'GET' && rest === 'brands') {
        void listBrands(siteDirOf(scoped)).then(async (brands) => {
          const out = []
          for (const m of brands) {
            const raw = await brandText(scoped, m.host, 'brand.json')
            let brand: Record<string, unknown> | null = null
            try {
              brand = raw === null ? null : brandSummary(JSON.parse(raw))
            } catch {
              brand = null
            }
            out.push({ ...m, brand })
          }
          writeJson(res, 200, { ok: true, brands: out })
        })
        return
      }
      if (method === 'GET' && parts.length === 4 && parts[0] === 'brands' && IMAGE_DIRS.has(parts[2] ?? '')) {
        const host = brandHostOf(parts[1] ?? '')
        const file = parts[3] ?? ''
        if (host === null || !LOGO_FILE.test(file)) {
          writeJson(res, 404, { ok: false, code: 'NO_SUCH_FILE' })
          return
        }
        const full = path.join(siteDirOf(scoped), BRAND_DIR, host, parts[2]!, file)
        void fs
          .stat(full)
          .then((stat) => {
            res.writeHead(200, {
              'content-type': LOGO_TYPES[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream',
              'content-length': String(stat.size),
              'cache-control': 'no-store'
            })
            createReadStream(full).pipe(res)
          })
          .catch(() => writeJson(res, 404, { ok: false, code: 'NO_SUCH_FILE' }))
        return
      }
      if (method === 'DELETE' && parts.length === 2 && parts[0] === 'brands') {
        const host = brandHostOf(parts[1] ?? '')
        if (host === null) {
          writeJson(res, 400, { ok: false, code: 'BAD_URL' })
          return
        }
        const running = jobs.get(jobKey(scoped, host))
        if (running && running.state === 'running') running.controller.abort()
        jobs.delete(jobKey(scoped, host))
        void fs
          .rm(path.join(siteDirOf(scoped), BRAND_DIR, host), { recursive: true, force: true })
          .then(() => writeJson(res, 200, { ok: true, host }))
          .catch(() => writeJson(res, 500, { ok: false, code: 'NOT_REMOVED' }))
        return
      }
      writeJson(res, 404, { code: 'UNKNOWN_ROUTE' })
    }
  }

  // 🔒 In `ctx.effect`: without it HMR or a plugin toggle leaves the old registration, and the
  // next load throws "duplicate route".
  ctx.effect(() => {
    const dispose = ctx.webServer.register(route)
    return () => dispose()
  }, 'tracy-brand-engine: routes')

  /**
   * The agent's tool, as the PLAIN object `ctx.tools.register` takes — no import of dsh's `defineTool`
   * sugar, for the reason `tracy-design-inspiration/src/host/index.ts` spells out (pnpm peers).
   */
  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'tracy_brand',
        description: DESCRIPTION,
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['read', 'extract', 'list'] },
            url: { type: 'string', description: 'A URL or a bare host; omit for this site.' },
            kind: {
              type: 'string',
              enum: ['own', 'reference'],
              description: 'extract: force the label (default: own for this site, reference otherwise).'
            },
            pages: { type: 'boolean', description: 'extract: also crawl up to 20 pages.' },
            refresh: {
              type: 'boolean',
              description: 'extract: measure again even if measured in the last 30 days.'
            }
          },
          required: ['action']
        },
        output: {
          schema: {},
          render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }]
        },
        async execute(args: unknown, exec?: { agent?: { session?: { header?: { cwd?: string } } } }) {
          const config = scopedTo(bundleConfig, exec?.agent?.session?.header?.cwd)
          if (config === null)
            return { ok: false, code: 'NO_SITE', error: "This conversation is not in a site's workspace." }
          const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>
          const action = typeof a.action === 'string' ? a.action : ''
          const key = laneSiteKey()
          if (action === 'list') return { ok: true, brands: await listBrands(siteDirOf(config)) }
          const input =
            typeof a.url === 'string' && a.url.trim() ? a.url.trim() : key ? `https://${key}/` : ''
          const host = brandHostOf(input)
          if (host === null) {
            return {
              ok: false,
              code: input ? 'BAD_URL' : 'NO_SITE',
              error: input
                ? `Not a public http(s) site: ${input.slice(0, 120)}`
                : 'This lane serves no site (MCP_TRACY_SITE_KEY is unset); pass a url.'
            }
          }
          if (action === 'extract') {
            const requested = a.kind === 'own' || a.kind === 'reference' ? a.kind : undefined
            const wantPages = a.pages === true
            // Same rule the door follows: a measurement younger than a month is the answer. The
            // agent is told it was reused, so it can ask again with `refresh` if it wants today's.
            if (a.refresh !== true) {
              const onDisk = await manifestOnDisk(config, host)
              if (reusable(onDisk, wantPages)) return { ok: true, reused: true, manifest: onDisk }
            }
            const job = startJob(config, input, host, requested, wantPages)
            const r = (await job.done) as { ok: boolean }
            return r.ok ? { ok: true, manifest: job.manifest } : { ok: false, ...job.error }
          }
          if (action === 'read') {
            const [manifest, brand, material] = await Promise.all([
              brandText(config, host, 'manifest.json'),
              brandText(config, host, 'brand.json'),
              brandText(config, host, path.join('prefetch', 'material.md'))
            ])
            if (manifest === null || brand === null) {
              return {
                ok: false,
                code: 'NOT_EXTRACTED',
                error: `No brand extracted for ${host} yet; call action='extract' first.`
              }
            }
            const md = material ?? ''
            const pages = await pagesOf(config, host)
            const recon = await brandText(config, host, path.join(RECON_DIR, 'RECON', 'original-summary.md'))
            return {
              ok: true,
              manifest: JSON.parse(manifest),
              brand: JSON.parse(brand),
              material:
                md.length > MATERIAL_CAP
                  ? `${md.slice(0, MATERIAL_CAP)}\n\n… (${md.length - MATERIAL_CAP} more characters in Brand/${host}/prefetch/material.md)`
                  : md,
              ...(pages === null ? {} : { pages }),
              ...(recon === null
                ? {}
                : { recon: recon.length > RECON_CAP ? `${recon.slice(0, RECON_CAP)}\n…` : recon })
            }
          }
          return { ok: false, code: 'BAD_ACTION', error: "action must be 'read', 'extract' or 'list'." }
        }
      }),
    'tracy-brand-engine: tracy_brand'
  )
}
