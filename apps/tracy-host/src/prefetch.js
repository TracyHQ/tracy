/**
 * `POST /_host/prefetch`'s job: fetch and verify every part of one quickstart release into this
 * host's quickstart cache, and touch no site.
 *
 * 🔒 WHY A DEMO UPDATE STARTS HERE (25/10/2026). Updating a live demo used to tear the old copy down
 * first and only then download the new release. On dev, JA Boxing 1.0.3 → 1.0.4 met a 403 from
 * GitHub at that download, twice (the release credential's hourly quota was spent), and the public
 * demo stood blank from 08:56 to 09:08 UTC. Run first, while the old copy still serves, this job
 * makes every download failure (403, a checksum that does not match, an asset missing from the
 * release) cost nothing; and the provision after the teardown then reads the verified files from
 * the cache (`quickstart.py`'s `cached`) instead of asking GitHub a second time.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** A release tag as tracy-web sends it (`quickstart/ja-boxing/j6`): never a path out of the catalogue file. */
export const SAFE_TAG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/

/** Long enough for a few hundred MB on a slow link, short enough that a stuck fetch ends. */
export const PREFETCH_TIMEOUT_MS = 30 * 60_000
export const PREFETCH_IDLE_MS = 10 * 60_000

/**
 * The refusal for a prefetch body, or null when it may run.
 * @param {Record<string, any>} body
 * @param {{ safeLabel: RegExp, safeToken: RegExp }} fences
 */
export function prefetchRefusal(body, { safeLabel, safeToken }) {
  if (!body.label || !safeLabel.test(String(body.label))) return 'refused label'
  if (
    typeof body.quickstart !== 'string' ||
    !SAFE_TAG.test(body.quickstart) ||
    body.quickstart.includes('..')
  )
    return 'refused quickstart'
  const entry = body.quickstartEntry
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 'need quickstartEntry'
  if (body.releasesToken !== undefined && !safeToken.test(String(body.releasesToken)))
    return 'refused releasesToken'
  return null
}

/**
 * Run `quickstart.py --prefetch` as a background job. The entry is written to a file of the job's
 * own and named with `TRACY_QUICKSTARTS_JSON`, the same road a provision takes; the token goes
 * through the environment only, never argv or a log line.
 * @param {object} input
 * @param {string} input.jobId
 * @param {{ label: string, quickstart: string, quickstartEntry: object, releasesToken?: string }} input.body
 * @param {{ logDir: string, scriptsDir: string }} input.config
 * @param {{ put: Function }} input.jobs
 * @param {Function} input.run - `run.js`'s `runScript`, or a test fake of the same shape.
 */
export async function runPrefetchJob({ jobId, body, config, jobs, run }) {
  const label = String(body.label)
  const logPath = path.join(config.logDir, `prefetch-${label}.log`)
  await jobs.put(jobId, { state: 'running', step: 'fetching the new release', label })
  try {
    await mkdir(config.logDir, { recursive: true })
    const file = path.join(config.logDir, `prefetch-${label}.json`)
    await writeFile(file, `${JSON.stringify({ [body.quickstart]: body.quickstartEntry }, null, 2)}\n`)
    const env = { ...process.env, TRACY_QUICKSTARTS_JSON: file }
    if (body.releasesToken) env.TRACY_RELEASES_GITHUB_TOKEN = String(body.releasesToken)
    else delete env.TRACY_RELEASES_GITHUB_TOKEN
    const { code, tail, timedOut } = await run({
      script: 'python3',
      args: [path.join(config.scriptsDir, 'provision/quickstart.py'), '--id', body.quickstart, '--prefetch'],
      env,
      logPath,
      timeoutMs: PREFETCH_TIMEOUT_MS,
      idleMs: PREFETCH_IDLE_MS,
      onLine: async (line) => {
        if (line.startsWith('==> ')) await jobs.put(jobId, { step: line.slice(4).trim().slice(0, 120) })
      }
    })
    await jobs.put(jobId, {
      state: code === 0 ? 'done' : 'failed',
      step: code === 0 ? 'fetched' : 'prefetch',
      exitCode: code,
      ...(timedOut ? { reason: 'timeout' } : {}),
      // Bounded by `run` already; the last line is the sentence tracy-web shows (`failureReason`).
      output: tail.join('\n')
    })
  } catch (error) {
    await jobs.put(jobId, {
      state: 'failed',
      step: 'prefetch',
      detail: String(error?.message ?? error).slice(0, 200)
    })
  }
}
