/**
 * The Design system check of every release, run on this server (ADR 0031): the Template Design
 * System Readiness check (`template-design-system-readiness/`) run once per release version and
 * inputs, its report stored in `template_ds_readiness`, and read by the Road to live step
 * `design-system` and the publish door (`road-to-live.js`). The twin of the Customize your site check
 * (`customize-readiness.js`), on its own sweep and table (council 12/10/2026: two checks, two
 * results, so one never holds the other's re-check).
 *
 * 🔒 ONCE PER VERSION AND INPUTS, WHEN THE RELEASES ARE READ. After every read of the releases
 * `kickDsReadiness` checks each release whose version this table does not hold yet, or whose result
 * was judged with other inputs than this server has now (`dsInputsOf`): the release's files, the
 * check's code and the slot library it judges with, and the slot contract of the release's own
 * template. A deploy that edits one contract re-checks that template alone. Opening a page never
 * checks. Check again (`dsCheckAgain`) runs one release now.
 *
 * 🔒 A RE-CHECK KEEPS THE LAST RESULT, IN THE BACKGROUND, BOUNDED: as `customize-readiness.js`. A
 * check downloads only the archive holding the template's stylesheets (`dsAssetsOf`) into a scratch
 * folder, runs the check in a child process and deletes the folder.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, readdirSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  CHECK_TIMEOUT_MS,
  checkable,
  DOWNLOAD_TIMEOUT_MS,
  fingerprintOf,
  STALE_MS
} from './customize-readiness.js'
import { DS_SLOT_DIR, slotContracts, templateKeyOf } from './ds-slot.js'
import { publishedTagOf } from './local-releases.js'
import { readReleases, RELEASES_REPO, releasesToken } from './quickstart-releases.js'
import { codeFilesOf } from './readiness-inputs.js'
import { dsAssetsOf } from './template-design-system-readiness/assets.js'
import { treeMeasurementBytes } from './template-design-system-readiness/readers/measurement.js'

const run = promisify(execFile)
const API = 'https://api.github.com'
const LIBRARY = fileURLToPath(new URL('./template-design-system-readiness/', import.meta.url))
const RUNNER = path.join(LIBRARY, 'check-runner.mjs')
const SEVERITY = path.join(LIBRARY, 'rule-severity.json')
/** The largest report the child may print. */
const REPORT_MAX_BYTES = 8 * 1024 * 1024

/** The input names, in the order a log line lists them. */
export const DS_INPUT_KEYS = Object.freeze(['files', 'rules', 'slot', 'measurement'])

/**
 * @typedef {{ files: string, rules: string, slot: string, measurement: string }} DsInputs
 * @typedef {import('./customize-readiness.js').Readiness} Readiness
 */

const digest = (/** @type {string | Buffer} */ data) =>
  createHash('sha256').update(data).digest('hex').slice(0, 32)

let rulesMemo = /** @type {string | null} */ (null)

/**
 * The version of the rule set this server runs: every file its runner reaches by a relative import,
 * `rule-severity.json`, and the slot library's own code (`@tracy/ds-slot` `src/`, loaded by path, so
 * the walk does not reach it): a new tokenizer judges every release again. Computed once per process.
 */
export function dsRulesVersion() {
  if (rulesMemo !== null) return rulesMemo
  try {
    const slotSrc = path.join(DS_SLOT_DIR, 'src')
    const files = [
      ...codeFilesOf(RUNNER),
      SEVERITY,
      ...readdirSync(slotSrc)
        .filter((f) => f.endsWith('.mjs'))
        .map((f) => path.join(slotSrc, f))
    ]
    const parts = [...new Set(files)].sort().map((f) => `${path.basename(f)}:${digest(readFileSync(f))}`)
    rulesMemo = digest(parts.join('\n'))
  } catch (e) {
    rulesMemo = digest(`unreadable:${e instanceof Error ? e.message : String(e)}`)
  }
  return rulesMemo
}

/**
 * The template keys a release may stand for, before its files are read: Joomla's template element,
 * EmDash's tag, and for WordPress the two stylesheets a theme of that template is called by.
 * @param {any} release
 */
export function candidateKeys(release) {
  const platform = release?.platform
  const template = String(release?.setting?.template ?? '')
  const tag = publishedTagOf(String(release?.tag ?? ''))
  if (platform === 'wordpress') {
    const bare = template.replace(/^wp-/, '')
    return [`wp-${bare}`, bare].map((s) => templateKeyOf({ platform, stylesheet: s })).filter(Boolean)
  }
  return [templateKeyOf({ platform, template, quickstartTag: tag })].filter(Boolean)
}

/**
 * The version of the slot contract a release is judged with: the bytes of every contract that names
 * one of its template keys, and of each contract those extend. `none` when no contract names it, so
 * the first contract written for the template re-checks it.
 * @param {any} release
 */
export function slotVersionOf(release) {
  const keys = new Set(candidateKeys(release))
  const dir = path.join(DS_SLOT_DIR, 'templates')
  const names = slotContracts()
    .filter((c) => keys.has(c.template))
    .map((c) => c.name)
  if (names.length === 0) return digest('none')
  const parts = []
  const seen = new Set()
  const add = (/** @type {string} */ name) => {
    if (seen.has(name) || !/^[a-z0-9-]+$/.test(name)) return
    seen.add(name)
    try {
      const bytes = readFileSync(path.join(dir, `${name}.json`))
      parts.push(`${name}:${digest(bytes)}`)
      const parent = JSON.parse(bytes.toString('utf8')).extends
      if (typeof parent === 'string') add(parent)
    } catch (e) {
      parts.push(`${name}:unreadable`)
    }
  }
  for (const n of names) add(n)
  return digest(parts.sort().join('\n'))
}

/**
 * The inputs this server judges a release version with now.
 * @param {any} release
 * @returns {DsInputs}
 */
export const dsInputsOf = (release) => ({
  files: fingerprintOf(release),
  rules: dsRulesVersion(),
  slot: slotVersionOf(release),
  // the measurement file this server holds for the version (`readers/measurement.js`): a file that
  // arrives with a contract PR re-checks that release alone (#1313)
  measurement: digest(
    treeMeasurementBytes({
      tag: publishedTagOf(String(release?.tag ?? '')),
      version: release?.setting?.version
    }) || 'none'
  )
})

/**
 * The inputs that differ between a stored result and now, by name.
 * @param {Partial<DsInputs> | null | undefined} stored @param {DsInputs} now
 */
export function changedDsInputs(stored, now) {
  if (!stored || typeof stored !== 'object') return [...DS_INPUT_KEYS]
  return DS_INPUT_KEYS.filter(
    (k) => stored[/** @type {keyof DsInputs} */ (k)] !== now[/** @type {keyof DsInputs} */ (k)]
  )
}

/**
 * Every stored Design system check, keyed `<tag> <version>`.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @returns {Promise<Map<string, Readiness>>}
 */
export async function dsReadinessRows(pool) {
  const { rows } = await pool.query(
    `select tag, version, fingerprint, inputs, state, report, reason, started_at, checked_at, rechecking_since
     from template_ds_readiness`
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
 * @param {Map<string, Readiness>} rows @param {any} release
 */
export function dsReadinessOf(rows, release) {
  const version = release?.setting?.version
  return typeof version === 'string' ? (rows.get(`${release.tag} ${version}`) ?? null) : null
}

/** Mark one release version as being checked (see `customize-readiness.js` `markChecking`). */
async function markChecking(pool, release) {
  await pool.query(
    `insert into template_ds_readiness (tag, version, fingerprint, state, started_at)
     values ($1, $2, $3, 'checking', now())
     on conflict (tag, version) do update set
       state = case when template_ds_readiness.checked_at is null then 'checking' else template_ds_readiness.state end,
       rechecking_since = case when template_ds_readiness.checked_at is null then null else now() end,
       reason = case when template_ds_readiness.checked_at is null then null else template_ds_readiness.reason end,
       started_at = now()`,
    [release.tag, release.setting.version, fingerprintOf(release)]
  )
}

/** Write what a check found, with the inputs it was judged with. */
async function writeOutcome(pool, release, outcome, inputs) {
  await pool.query(
    `update template_ds_readiness set state = $3, report = coalesce($4::jsonb, report), reason = $5,
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

/** Download one asset by id into `dir`, streamed. */
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
    {
      signal
    }
  )
}

/** The folder the check reads one release from: a local pack's own, or a scratch folder. */
async function sourceFolder(release, { token, fetchImpl, cacheDir }) {
  if (release.local?.dir) return { dir: release.local.dir, cleanup: async () => {} }
  if (!token) throw new Error('this server cannot read the releases repository')
  await mkdir(cacheDir, { recursive: true })
  const dir = await mkdtemp(path.join(cacheDir, `${release.tag.replaceAll('/', '_')}-`))
  const cleanup = () => rm(dir, { recursive: true, force: true })
  try {
    const assets = (release.assets ?? []).filter((a) => typeof a?.name === 'string' && a.id != null)
    const wanted = new Set(
      dsAssetsOf(
        release.setting,
        assets.map((a) => a.name)
      )
    )
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
 * The reason a failed child gives, from its stderr: the line of the error it threw (a crash prints a
 * stack and then `Node.js v24…`, so the last line names the runtime, not the cause: /ops read "Could
 * not check: Node.js v24.22.0" for every release after #1405), else the last line it wrote (the
 * runner's own one-line refusal). At most 400 characters.
 * @param {unknown} stderr @returns {string}
 */
export function childErrorOf(stderr) {
  if (typeof stderr !== 'string') return ''
  const lines = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const thrown = lines.find((l) => /^(?:[A-Z]\w*)?Error\b/.test(l))
  const said = thrown ?? lines.filter((l) => !/^Node\.js v\d/.test(l)).at(-1) ?? ''
  return said.length > 400 ? `${said.slice(0, 399)}…` : said
}

/**
 * Run the check in a child process, bounded by `CHECK_TIMEOUT_MS`.
 * @param {string} dir @param {string} tag
 */
export async function runDsCheckInChild(dir, tag) {
  try {
    const { stdout } = await run(process.execPath, [RUNNER, dir, tag], {
      timeout: CHECK_TIMEOUT_MS,
      maxBuffer: REPORT_MAX_BYTES
    })
    return JSON.parse(stdout)
  } catch (e) {
    const err = /** @type {any} */ (e)
    if (err?.killed) throw new Error(`the check ran longer than ${CHECK_TIMEOUT_MS / 60_000} minutes`)
    const said = childErrorOf(err?.stderr)
    throw new Error(said || (e instanceof Error ? e.message : String(e)))
  }
}

/**
 * Check one release now and store the outcome. Never throws: a failure is stored as `error`.
 * @param {any} pool @param {any} release
 * @param {{ token: string | null, fetchImpl?: typeof fetch, cacheDir: string, log?: any, runCheck?: (dir: string, tag: string) => Promise<any>, inputsOf?: (release: any) => DsInputs }} opts
 */
export async function dsCheckOne(
  pool,
  release,
  { token, fetchImpl = fetch, cacheDir, log = console, runCheck = runDsCheckInChild, inputsOf = dsInputsOf }
) {
  const inputs = inputsOf(release)
  try {
    await markChecking(pool, release)
    const { dir, cleanup } = await sourceFolder(release, { token, fetchImpl, cacheDir })
    try {
      const report = await runCheck(dir, release.tag)
      await writeOutcome(pool, release, { state: 'done', report }, inputs)
    } finally {
      await cleanup()
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    log.warn?.(`[ds-readiness] ${release.tag} ${release.setting?.version}: ${reason}`)
    try {
      await writeOutcome(pool, release, { state: 'error', reason }, inputs)
    } catch (written) {
      log.warn?.(`[ds-readiness] ${release.tag}: the outcome could not be stored: ${written}`)
    }
  }
}

/**
 * The releases a sweep checks: never checked, judged with other inputs, or left `checking`.
 * @param {any[]} releases @param {Map<string, Readiness>} rows @param {number} now
 * @param {(release: any) => DsInputs} inputsOf
 */
export function pendingDsReleases(releases, rows, now = Date.now(), inputsOf = dsInputsOf) {
  const left = (/** @type {string | null} */ since) => now - Date.parse(since ?? '') > STALE_MS
  return releases.filter((r) => {
    if (!checkable(r)) return false
    const row = dsReadinessOf(rows, r)
    if (!row) return true
    if (row.state === 'checking') return left(row.startedAt)
    if (row.recheckingSince && !left(row.recheckingSince)) return false
    return changedDsInputs(/** @type {any} */ (row.inputs), inputsOf(r)).length > 0
  })
}

/** Where the scratch folders go: `TRACY_READINESS_DIR`, else the system's temporary folder. */
const cacheDirOf = (config) =>
  path.join(config.readinessDir ?? path.join(tmpdir(), 'tracy-readiness'), 'design-system')

/**
 * One pass over every release: mark each pending one `checking`, then check them one by one.
 * @returns {Promise<number>} how many releases it checked
 */
export async function sweepDsReadiness(
  pool,
  config,
  { fetchImpl = fetch, log = console, runCheck, inputsOf = dsInputsOf } = {}
) {
  const releases = await readReleases(pool)
  const rows = await dsReadinessRows(pool)
  const pending = pendingDsReleases(releases, rows, Date.now(), inputsOf)
  if (pending.length === 0) return 0
  for (const r of pending) {
    const stored = dsReadinessOf(rows, r)
    if (!stored?.checkedAt) continue
    const changed = changedDsInputs(/** @type {any} */ (stored.inputs), inputsOf(r))
    const why = changed.length > 0 ? `${changed.join(', ')} changed` : 'a stopped re-check'
    log.log?.(`[ds-readiness] ${r.tag} ${r.setting.version}: ${why}, checking again`)
  }
  // eslint-disable-next-line no-await-in-loop -- a few rows.
  for (const r of pending) await markChecking(pool, r)
  const needsToken = pending.some((r) => !r.local?.dir)
  const { token } = needsToken ? await releasesToken(config, fetchImpl) : { token: null }
  // eslint-disable-next-line no-await-in-loop -- one release at a time.
  for (const r of pending)
    await dsCheckOne(pool, r, {
      token,
      fetchImpl,
      cacheDir: cacheDirOf(config),
      log,
      inputsOf,
      ...(runCheck ? { runCheck } : {})
    })
  log.log?.(`[ds-readiness] ${pending.length} release(s) checked`)
  return pending.length
}

/** The one background sweep of this process, and whether another read came in while it ran. */
const job = { enabled: false, running: /** @type {Promise<void> | null} */ (null), again: false }

/** Switch the background sweep on: the schedule (`cron.js`) does, so a test app never starts it. */
export function startDsReadinessJob() {
  job.enabled = true
}

/**
 * The releases were just read: check what is new, in the background. Single flight; a kick during a
 * sweep runs one more pass after it. Does nothing until `startDsReadinessJob` was called.
 * @returns {Promise<void> | null}
 */
export function kickDsReadiness(pool, config, { fetchImpl = fetch, log = console } = {}) {
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
        await sweepDsReadiness(pool, config, { fetchImpl, log })
      } while (job.again)
    } catch (e) {
      log.warn?.(`[ds-readiness] sweep failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      job.running = null
    }
  })()
  return job.running
}

/**
 * Check again (staff): one release, now. The row is marked before this returns; the check runs in
 * the background and its promise is returned for a test to wait on.
 * @returns {Promise<{ ok: true, done: Promise<void> } | { ok: false, error: string, reason: string }>}
 */
export async function dsCheckAgain(
  pool,
  config,
  release,
  { fetchImpl = fetch, log = console, runCheck, inputsOf = dsInputsOf } = {}
) {
  if (!checkable(release))
    return {
      ok: false,
      error: 'NOT_CHECKABLE',
      reason: 'Only a quickstart Tracy can read is checked for Design system.'
    }
  await markChecking(pool, release)
  const token = release.local?.dir ? null : (await releasesToken(config, fetchImpl)).token
  const done = dsCheckOne(pool, release, {
    token,
    fetchImpl,
    cacheDir: cacheDirOf(config),
    log,
    inputsOf,
    ...(runCheck ? { runCheck } : {})
  })
  return { ok: true, done }
}
