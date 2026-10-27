/**
 * The Customize your site check of every release, run on this server (ADR 0029 §4): the Template
 * Customization Question Readiness check (`template-customization-question-readiness/`) run once
 * per release version, its report stored in `template_readiness`, and read by the Road to live step
 * `customize` and the publish door (`road-to-live.js`).
 *
 * 🔒 ONCE PER VERSION AND INPUTS, WHEN THE RELEASES ARE READ. After every read of the releases (the
 * ten minute schedule, the boot read, Sync GitHub, the release webhook) `kickReadiness` checks each
 * release whose version this table does not hold yet, or whose result was judged with other inputs
 * than this server has now: the release's files (`fingerprintOf`), the rule set, the template's own
 * profile rows, its contract (`readiness-inputs.js`). So a deploy that adds a profile row re-checks
 * that template alone, and one that changes the rules re-checks every release. Opening a page never
 * checks. Check again (`checkAgain`) runs one release now.
 *
 * 🔒 A RE-CHECK KEEPS THE LAST RESULT. A release that already has a result is marked
 * `rechecking_since`, not `checking`: its state and report stay, so the Road to live shows them with
 * a "Rechecking" note and the publish door keeps judging by them until the new result lands. Only a
 * release never checked before reads `checking`.
 *
 * 🔒 IN THE BACKGROUND, BOUNDED. A check downloads the assets the rules read (the demo database, the
 * installer or source zip, the theme zip: `contentAssetsOf`) into a scratch folder, runs the check
 * in a child process (`check-runner.mjs`) and deletes the folder. Each part has a time limit, so a
 * stuck download or check ends as `error`, never as a row that says "checking" for ever. Rows are
 * marked before any work starts, so the page shows "Checking" (or "Rechecking") at once. One release
 * at a time: the sweep is single flight, and a kick that arrives while it runs makes it look again.
 *
 * 🔒 THE PLUGIN IS READ HERE, NOT IN THE CHILD (25/10/2026). STAB-1 asks whether the Claude Cowork
 * plugin a new site gets carries the contract's maps (`cowork-contract-evidence.js`). That plugin is
 * not a file of the release: it is the pin, the release zip, or on the fleet's own road the latest
 * claude-cowork names and the floor (`cowork-install.js`). Before each check its bytes are read here,
 * bounded and cached by digest, and handed to the child as a JSON file; the rule only judges them.
 * Each sweep first reads `update.json`, so a new latest plugin re-checks the releases that take it
 * (input `plugin`, `readiness-inputs.js`) without a deploy. A plugin that could not be read leaves
 * STAB-1 `not-checked` and is read again after `EVIDENCE_RETRY_MS`. Until a re-check lands, the road
 * reads a result judged with another plugin than now as not checked (`readinessForRoad`), never as
 * the old green; so does a fleet release before this process has read `update.json` (a restart).
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { artifactFetchers, collectCoworkEvidence, readFleetLatest } from './cowork-contract-evidence.js'
import { readReleases, RELEASES_REPO, releasesToken } from './quickstart-releases.js'
import {
  changedInputs,
  currentInputs,
  fleetLatestOf,
  pluginSelectionOf,
  setFleetLatest
} from './readiness-inputs.js'
import {
  contentAssetsOf,
  isSmallAsset,
  themeZipOf
} from './template-customization-question-readiness/gallery-cache.js'

const run = promisify(execFile)
const API = 'https://api.github.com'
const RUNNER = fileURLToPath(
  new URL('./template-customization-question-readiness/check-runner.mjs', import.meta.url)
)

/** The most the downloads of one release may take together. */
export const DOWNLOAD_TIMEOUT_MS = 5 * 60_000
/** The most the check itself may take, in its child process. */
export const CHECK_TIMEOUT_MS = 3 * 60_000
/** A `checking` (or re-checking) row older than this was left by a process that stopped: checked again. */
export const STALE_MS = DOWNLOAD_TIMEOUT_MS + CHECK_TIMEOUT_MS + 60_000
/** How soon a result whose plugin could not be read is checked again. */
export const EVIDENCE_RETRY_MS = 30 * 60_000
/** The largest report the child may print. */
const REPORT_MAX_BYTES = 32 * 1024 * 1024
/** The CMSes the check has rules for. */
const PLATFORMS = new Set(['joomla', 'wordpress', 'emdash'])

/**
 * The stored check of one release version, as the road reads it.
 * `inputs` is what the result was judged with; `recheckingSince` is set while it is judged again.
 * @typedef {{ state: 'checking' | 'done' | 'error', version: string, fingerprint: string, inputs: import('./readiness-inputs.js').ReadinessInputs | null, report: any, reason: string | null, checkedAt: string | null, startedAt: string | null, recheckingSince: string | null }} Readiness
 */

/** Whether the check has anything to say about this release: a quickstart Tracy can read. */
export function checkable(release) {
  return (
    release?.kind === 'quickstart' &&
    release.setting !== null &&
    typeof release.setting?.version === 'string' &&
    PLATFORMS.has(release.platform)
  )
}

/**
 * What the check read, in one string: every asset's name, size and digest. A file uploaded again
 * under the same version changes it, and the release is checked again.
 * @param {{ assets?: { name: string, size?: number | null, digest?: string, id?: number | null }[] }} release
 */
export function fingerprintOf(release) {
  const parts = (release.assets ?? [])
    .map((a) => `${a.name}:${a.size ?? ''}:${a.digest ?? a.id ?? ''}`)
    .sort()
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32)
}

/**
 * The inputs this server judges a release with now (`readiness-inputs.js`).
 * @param {any} release
 */
export const inputsNow = (release) => currentInputs(release, fingerprintOf(release))

/**
 * Every stored check, keyed `<tag> <version>`.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @returns {Promise<Map<string, Readiness>>}
 */
export async function readinessRows(pool) {
  const { rows } = await pool.query(
    `select tag, version, fingerprint, inputs, state, report, reason, started_at, checked_at, rechecking_since
     from template_readiness`
  )
  return new Map(
    rows.map((r) => [
      `${r.tag} ${r.version}`,
      {
        state: r.state,
        version: r.version,
        fingerprint: r.fingerprint,
        inputs: typeof r.inputs === 'string' ? JSON.parse(r.inputs) : (r.inputs ?? null),
        report: typeof r.report === 'string' ? JSON.parse(r.report) : r.report,
        reason: r.reason,
        startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
        checkedAt: r.checked_at ? new Date(r.checked_at).toISOString() : null,
        recheckingSince: r.rechecking_since ? new Date(r.rechecking_since).toISOString() : null
      }
    ])
  )
}

/**
 * The stored check of a release's current version, or null.
 * @param {Map<string, Readiness>} rows from `readinessRows`
 * @param {any} release
 */
export function readinessOf(rows, release) {
  const version = release?.setting?.version
  return typeof version === 'string' ? (rows.get(`${release.tag} ${version}`) ?? null) : null
}

/**
 * The stored check of a release's current version as the Road to live and the publish door judge
 * it: a STAB-1 pass judged with another Claude Cowork plugin than a new site gets now (input
 * `plugin`) reads `not-checked` until the re-check lands, so an old green never opens Publish.
 * Before this process has read `update.json` once, a fleet release is not judged stale over it.
 * @param {Map<string, Readiness>} rows from `readinessRows`
 * @param {any} release
 * @param {{ inputsOf?: (release: any) => import('./readiness-inputs.js').ReadinessInputs }} [opts]
 * @returns {(Readiness & { pluginStale?: true }) | null}
 */
export function readinessForRoad(rows, release, { inputsOf = inputsNow } = {}) {
  const row = readinessOf(rows, release)
  if (!row || row.state !== 'done' || !Array.isArray(row.report?.results)) return row
  const stab1 = row.report.results.find((/** @type {any} */ r) => r.id === 'STAB-1')
  if (stab1?.status !== 'pass') return row
  // A pass stands only when this server confirms it was judged with the plugin a new site gets now.
  // Anything else (another plugin, a row stored before the plugin was an input, a fleet latest not
  // read since this process started, inputs that cannot be computed) reads not checked, so it never
  // opens a new Publish; a published template only warns (`customize-live-unchecked`).
  let now
  try {
    now = inputsOf(release).plugin
  } catch {
    now = null
  }
  const stored = row.inputs?.plugin
  if (now !== null && stored === now) return row
  const platform = release.setting?.platform ?? release.platform
  const unread =
    now !== null &&
    fleetLatestOf(platform) === 'unread' &&
    pluginSelectionOf(release).selection.source === 'fleet'
  const why =
    now === null
      ? 'the Claude Cowork plugin a new site gets could not be worked out'
      : unread
        ? 'the Claude Cowork plugin a new site gets has not been read since this server started'
        : stored === undefined
          ? 'this result was stored before the Claude Cowork plugin a new site gets was read'
          : 'the Claude Cowork plugin a new site gets changed since this check'
  return {
    ...row,
    pluginStale: true,
    report: {
      ...row.report,
      results: row.report.results.map((/** @type {any} */ r) =>
        r === stab1
          ? {
              ...r,
              status: 'not-checked',
              message: `${why}; it is read again by the next check.`,
              fix: 'Wait for the check that is running, or press Check again.'
            }
          : r
      )
    }
  }
}

/**
 * Mark one release version as being checked, before any work starts. A version never checked
 * (no row, or a row still `checking`) reads `checking`; one that has a result keeps it, and is only
 * marked `rechecking_since` (see the 🔒 above).
 */
async function markChecking(pool, release) {
  await pool.query(
    `insert into template_readiness (tag, version, fingerprint, state, started_at)
     values ($1, $2, $3, 'checking', now())
     on conflict (tag, version) do update set
       state = case when template_readiness.checked_at is null then 'checking' else template_readiness.state end,
       rechecking_since = case when template_readiness.checked_at is null then null else now() end,
       reason = case when template_readiness.checked_at is null then null else template_readiness.reason end,
       started_at = now()`,
    [release.tag, release.setting.version, fingerprintOf(release)]
  )
}

/**
 * Write what a check found, with the inputs it was judged with. The report replaces the one before;
 * an error keeps it for reference.
 */
async function writeOutcome(pool, release, outcome, inputs) {
  await pool.query(
    `update template_readiness set state = $3, report = coalesce($4::jsonb, report), reason = $5,
       fingerprint = $6, inputs = $7::jsonb, checked_at = now(), rechecking_since = null
     where tag = $1 and version = $2`,
    [
      release.tag,
      release.setting.version,
      outcome.state,
      outcome.report ? JSON.stringify(outcome.report) : null,
      outcome.reason ?? null,
      inputs.files,
      JSON.stringify(inputs)
    ]
  )
}

/**
 * Download one asset by id into `dir`, streamed: an installer zip may be large.
 * @param {typeof fetch} fetchImpl
 * @param {{ name: string, id: number }} asset
 */
async function downloadAsset(fetchImpl, asset, token, dir, signal) {
  const response = await fetchImpl(`${API}/repos/${RELEASES_REPO}/releases/assets/${asset.id}`, {
    headers: {
      accept: 'application/octet-stream',
      authorization: `Bearer ${token}`,
      'user-agent': 'tracy-web',
      'x-github-api-version': '2022-11-28'
    },
    signal
  })
  if (!response.ok || !response.body) throw new Error(`GitHub answered ${response.status} for ${asset.name}`)
  await pipeline(
    Readable.fromWeb(/** @type {any} */ (response.body)),
    createWriteStream(path.join(dir, asset.name)),
    { signal }
  )
}

/**
 * Whether the rules need the webroot: a Joomla template is read from it (a captured package has no
 * other copy of the template files), and a WordPress theme too when the release ships no theme zip
 * the readers would open (`themeZipOf`). Measured 11/10/2026 on ja-essence j6 1.0.6: without it 12
 * rules fail only because they cannot read the template.
 * @param {any} setting @param {string[]} names
 */
const needsWebroot = (setting, names) =>
  setting?.platform === 'joomla' || (setting?.platform === 'wordpress' && themeZipOf(setting, names) === null)

/**
 * The folder the check reads one release from: a local pack's own folder, or a scratch folder the
 * assets the rules read are downloaded into (deleted by the caller through `cleanup`).
 */
async function sourceFolder(release, { token, fetchImpl, cacheDir }) {
  if (release.local?.dir) return { dir: release.local.dir, cleanup: async () => {} }
  if (!token) throw new Error('this server cannot read the releases repository')
  await mkdir(cacheDir, { recursive: true })
  const dir = await mkdtemp(path.join(cacheDir, `${release.tag.replaceAll('/', '_')}-`))
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    const assets = (release.assets ?? []).filter((a) => typeof a?.name === 'string' && a.id != null)
    const names = assets.map((a) => a.name)
    const wanted = new Set([
      ...names.filter(isSmallAsset),
      ...contentAssetsOf(release.setting, names, { withWebroot: needsWebroot(release.setting, names) })
    ])
    if (!wanted.has('tracy_setting.json'))
      throw new Error('the release lists no tracy_setting.json to download')
    const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    // eslint-disable-next-line no-await-in-loop -- one file at a time keeps memory and bandwidth flat.
    for (const asset of assets.filter((a) => wanted.has(a.name)))
      await downloadAsset(fetchImpl, asset, token, dir, signal)
    return { dir, cleanup }
  } catch (e) {
    await cleanup()
    throw e
  }
}

/**
 * Run the check in a child process, bounded by `CHECK_TIMEOUT_MS`.
 * @param {string} dir @param {string} tag @param {string | null} [evidenceFile] the plugin evidence, as JSON
 * @returns {Promise<any>} the report
 */
export async function runCheckInChild(dir, tag, evidenceFile = null) {
  try {
    const { stdout } = await run(
      process.execPath,
      [RUNNER, dir, tag, ...(evidenceFile ? [evidenceFile] : [])],
      {
        timeout: CHECK_TIMEOUT_MS,
        maxBuffer: REPORT_MAX_BYTES
      }
    )
    return JSON.parse(stdout)
  } catch (e) {
    const err = /** @type {any} */ (e)
    if (err?.killed) throw new Error(`the check ran longer than ${CHECK_TIMEOUT_MS / 60_000} minutes`)
    const said = typeof err?.stderr === 'string' ? err.stderr.trim().split('\n').at(-1) : ''
    throw new Error(said || (e instanceof Error ? e.message : String(e)))
  }
}

/**
 * What the Claude Cowork plugin a new site of this release gets carries (`collectCoworkEvidence`).
 * Never throws: a failure to read is evidence `not-checked`, with its reason.
 * @param {any} release
 * @param {{ token: string | null, fetchImpl: typeof fetch, cacheDir: string }} opts
 * @returns {Promise<import('./cowork-contract-evidence.js').CoworkEvidence>}
 */
export async function coworkEvidenceOf(release, { token, fetchImpl, cacheDir }) {
  const { contract, selection } = pluginSelectionOf(release)
  const platform = release.setting?.platform ?? release.platform
  try {
    const { fetchArtifact, fetchAsset } = artifactFetchers({
      fetchImpl,
      token,
      repo: RELEASES_REPO,
      cacheDir: path.join(cacheDir, 'cowork'),
      localDir: release.local?.dir ?? null
    })
    return await collectCoworkEvidence({ platform, contract, selection, fetchArtifact, fetchAsset })
  } catch (e) {
    return {
      state: 'not-checked',
      checkedAt: new Date().toISOString(),
      contract: contract?.id ?? null,
      expected: {},
      source: selection.source,
      plugins: [],
      reason: e instanceof Error ? e.message : String(e)
    }
  }
}

/**
 * Read `update.json` for every platform among `releases` that has a Claude Cowork plugin, so the
 * inputs and the evidence name the latest plugin as of now. A failed read keeps the last answer.
 * @param {any[]} releases @param {{ fetchImpl?: typeof fetch, readLatest?: typeof readFleetLatest }} [opts]
 */
export async function refreshFleetLatest(releases, { fetchImpl = fetch, readLatest = readFleetLatest } = {}) {
  const platforms = new Set(
    releases
      .filter(checkable)
      .map((r) => r.setting?.platform ?? r.platform)
      .filter((p) => p === 'joomla' || p === 'wordpress')
  )
  // eslint-disable-next-line no-await-in-loop -- two small files.
  for (const p of platforms) setFleetLatest(p, await readLatest(p, { fetchImpl }))
}

/** The part of the evidence kept with the inputs: enough to say when to read the plugin again. */
const evidenceSummary = (/** @type {import('./cowork-contract-evidence.js').CoworkEvidence} */ e) => ({
  state: e.state,
  checkedAt: e.checkedAt,
  digests: e.plugins.map((p) => p.digest),
  expected: Object.keys(e.expected ?? {})
})

/**
 * Check one release now and store the outcome. Never throws: a failure is stored as `error`.
 * @param {any} pool
 * @param {any} release a row of `readReleases`
 * @param {{ token: string | null, fetchImpl?: typeof fetch, cacheDir: string, log?: any, runCheck?: (dir: string, tag: string, evidenceFile?: string | null) => Promise<any>, inputsOf?: (release: any) => import('./readiness-inputs.js').ReadinessInputs, evidenceOf?: typeof coworkEvidenceOf }} opts
 *   `inputsOf`: what the check is judged with (`inputsNow` by default; a test passes its own);
 *   `evidenceOf`: reads the plugin a new site gets (`coworkEvidenceOf` by default)
 */
export async function checkOne(
  pool,
  release,
  {
    token,
    fetchImpl = fetch,
    cacheDir,
    log = console,
    runCheck = runCheckInChild,
    inputsOf = inputsNow,
    evidenceOf = coworkEvidenceOf
  }
) {
  // Read before the check starts: a result is stamped with the inputs it was really judged with.
  let inputs = inputsOf(release)
  try {
    await markChecking(pool, release)
    const { dir, cleanup } = await sourceFolder(release, { token, fetchImpl, cacheDir })
    // The evidence goes to the child in its own scratch folder, never into a local pack's folder.
    let evidenceDir = /** @type {string | null} */ (null)
    try {
      const evidence = await evidenceOf(release, { token, fetchImpl, cacheDir })
      inputs = { ...inputs, pluginEvidence: evidenceSummary(evidence) }
      if (evidence.state === 'not-checked')
        log.warn?.(
          `[readiness] ${release.tag} ${release.setting?.version}: the Claude Cowork plugin could not be read: ${
            evidence.reason ??
            evidence.plugins
              .map((p) => p.reason)
              .filter(Boolean)
              .join('; ')
          }`
        )
      await mkdir(cacheDir, { recursive: true })
      evidenceDir = await mkdtemp(path.join(cacheDir, 'evidence-'))
      const evidenceFile = path.join(evidenceDir, 'cowork.json')
      await writeFile(evidenceFile, JSON.stringify(evidence))
      const report = await runCheck(dir, release.tag, evidenceFile)
      await writeOutcome(pool, release, { state: 'done', report }, inputs)
    } finally {
      if (evidenceDir) await rm(evidenceDir, { recursive: true, force: true })
      await cleanup()
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    log.warn?.(`[readiness] ${release.tag} ${release.setting?.version}: ${reason}`)
    try {
      await writeOutcome(pool, release, { state: 'error', reason }, inputs)
    } catch (written) {
      log.warn?.(`[readiness] ${release.tag}: the outcome could not be stored: ${written}`)
    }
  }
}

/**
 * The releases a sweep checks: every checkable release whose current version has no stored check,
 * whose result was judged with other inputs than this server has now, whose plugin could not be read
 * more than `EVIDENCE_RETRY_MS` ago, or whose `checking` or re-checking row was left by a process
 * that stopped.
 * @param {any[]} releases from `readReleases`
 * @param {Map<string, Readiness>} rows from `readinessRows`
 * @param {number} now
 * @param {(release: any) => import('./readiness-inputs.js').ReadinessInputs} inputsOf
 */
export function pendingReleases(releases, rows, now = Date.now(), inputsOf = inputsNow) {
  const left = (/** @type {string | null} */ since) => now - Date.parse(since ?? '') > STALE_MS
  // A plugin that could not be read (a timeout, a package not uploaded yet) is read again later.
  const retry = (/** @type {Readiness} */ row) =>
    row.state === 'done' &&
    row.inputs?.pluginEvidence?.state === 'not-checked' &&
    now - Date.parse(row.inputs.pluginEvidence.checkedAt ?? '') > EVIDENCE_RETRY_MS
  return releases.filter((r) => {
    if (!checkable(r)) return false
    const row = readinessOf(rows, r)
    if (!row) return true
    if (row.state === 'checking') return left(row.startedAt)
    if (row.recheckingSince && !left(row.recheckingSince)) return false
    return changedInputs(row.inputs, inputsOf(r)).length > 0 || retry(row)
  })
}

/** Where the scratch folders go: `TRACY_READINESS_DIR`, else the system's temporary folder. */
const cacheDirOf = (config) => config.readinessDir ?? path.join(tmpdir(), 'tracy-readiness')

/**
 * One pass over every release: mark each pending one `checking`, then check them one by one.
 * @param {any} pool
 * @param {any} config
 * @param {{ fetchImpl?: typeof fetch, log?: any, runCheck?: (dir: string, tag: string, evidenceFile?: string | null) => Promise<any>, inputsOf?: (release: any) => import('./readiness-inputs.js').ReadinessInputs, evidenceOf?: typeof coworkEvidenceOf, readLatest?: typeof readFleetLatest }} [opts]
 * @returns {Promise<number>} how many releases it checked
 */
export async function sweepReadiness(
  pool,
  config,
  { fetchImpl = fetch, log = console, runCheck, inputsOf = inputsNow, evidenceOf, readLatest } = {}
) {
  const releases = await readReleases(pool)
  await refreshFleetLatest(releases, { fetchImpl, ...(readLatest ? { readLatest } : {}) })
  const rows = await readinessRows(pool)
  const pending = pendingReleases(releases, rows, Date.now(), inputsOf)
  if (pending.length === 0) return 0
  // Say why each one is checked again, so a log answers "why did this re-check".
  for (const r of pending) {
    const stored = readinessOf(rows, r)
    if (!stored?.checkedAt) continue
    const changed = changedInputs(stored.inputs, inputsOf(r))
    const why =
      changed.length > 0
        ? `${changed.join(', ')} changed`
        : stored.inputs?.pluginEvidence?.state === 'not-checked'
          ? 'the plugin could not be read last time'
          : 'a stopped re-check'
    log.log?.(`[readiness] ${r.tag} ${r.setting.version}: ${why}, checking again`)
  }
  // Marked first, every one: the page shows "Checking" for the whole queue at once.
  // eslint-disable-next-line no-await-in-loop -- a few rows.
  for (const r of pending) await markChecking(pool, r)
  const needsToken = pending.some((r) => !r.local?.dir)
  const { token } = needsToken ? await releasesToken(config, fetchImpl) : { token: null }
  // eslint-disable-next-line no-await-in-loop -- one release at a time (see the 🔒 above).
  for (const r of pending)
    await checkOne(pool, r, {
      token,
      fetchImpl,
      cacheDir: cacheDirOf(config),
      log,
      inputsOf,
      ...(runCheck ? { runCheck } : {}),
      ...(evidenceOf ? { evidenceOf } : {})
    })
  log.log?.(`[readiness] ${pending.length} release(s) checked`)
  return pending.length
}

/** The one background sweep of this process, and whether another read came in while it ran. */
const job = { enabled: false, running: /** @type {Promise<void> | null} */ (null), again: false }

/** Switch the background sweep on: the schedule (`cron.js`) does, so a test app never starts it. */
export function startReadinessJob() {
  job.enabled = true
}

/**
 * The releases were just read: check what is new, in the background. Single flight; a kick during
 * a sweep runs one more pass after it. Does nothing until `startReadinessJob` was called.
 * @returns {Promise<void> | null} the sweep, for a caller that wants to wait for it
 */
export function kickReadiness(pool, config, { fetchImpl = fetch, log = console } = {}) {
  if (!job.enabled) return null
  if (job.running) {
    job.again = true
    return job.running
  }
  job.running = (async () => {
    try {
      do {
        job.again = false
        // eslint-disable-next-line no-await-in-loop -- one pass after another, never two at once.
        await sweepReadiness(pool, config, { fetchImpl, log })
      } while (job.again)
    } catch (e) {
      log.warn?.(`[readiness] sweep failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      job.running = null
    }
  })()
  return job.running
}

/**
 * Check again (staff): one release, now, whatever is stored, with the latest plugin read again. The row is marked before this returns
 * (`checking` the first time, else its last result marked re-checking); the check itself runs in the
 * background and its promise is returned for a test to wait on.
 * @param {any} pool
 * @param {any} config
 * @param {any} release a row of `readReleases`
 * @returns {Promise<{ ok: true, done: Promise<void> } | { ok: false, error: string, reason: string }>}
 */
export async function checkAgain(
  pool,
  config,
  release,
  { fetchImpl = fetch, log = console, runCheck, inputsOf = inputsNow, evidenceOf, readLatest } = {}
) {
  if (!checkable(release))
    return {
      ok: false,
      error: 'NOT_CHECKABLE',
      reason: 'Only a quickstart Tracy can read is checked for Customize your site.'
    }
  await markChecking(pool, release)
  const token = release.local?.dir ? null : (await releasesToken(config, fetchImpl)).token
  // The latest plugin as of this press, read in the background with the check itself.
  const done = refreshFleetLatest([release], { fetchImpl, ...(readLatest ? { readLatest } : {}) }).then(() =>
    checkOne(pool, release, {
      token,
      fetchImpl,
      cacheDir: cacheDirOf(config),
      log,
      inputsOf,
      ...(runCheck ? { runCheck } : {}),
      ...(evidenceOf ? { evidenceOf } : {})
    })
  )
  return { ok: true, done }
}
