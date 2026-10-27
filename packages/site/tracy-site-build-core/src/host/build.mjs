/**
 * The build job of one site (tasks/todo-build-with-experience.md §B): the customer pressed Create
 * with <platform> on an inspiration, and a CMS's own stages turn that into a site. This module is
 * the SEQUENCING and the FILE only; every stage is a function handed in by the plugin's host (so
 * the tests run without WordPress, a model or a browser), and the file `docs/agents/build/job.json`
 * is what the chat card and the Build tab poll.
 *
 * 🔒 THE STAGE LIST IS THE JOB'S, NOT THIS MODULE'S. It used to be a constant here — six names,
 * the same for every CMS — and that is what made a Joomla build carry an "Apply the look" line
 * nobody ran (Lee, 09/09: the two CMSes are two processes). `createJob` takes the names; every
 * loop below walks `job.stages`; a plugin decides how many there are and what they are called.
 *
 * 🔒 ONE JOB PER SITE, NOT ONE PER FOLDER. A build always dresses a NEW site (Lee, 09/09) and a
 * customer has several, so two presses in one session are two jobs — keyed by `targetSiteKey`,
 * each with its own file under `docs/agents/build/sites/`. `job.json` stays the LATEST one, for
 * the agent's `status` and for a tab that names no site. Keyed by folder alone, the second press
 * silently joined the first site's build and the second site was never dressed.
 *
 * A stage answers with one of four statuses. `done` and optional `skipped` stages let the run
 * continue; a missing required executor is a failure. `waiting` pauses the run for the
 * customer (the copy stage has nothing to write from: `waiting:form:<fields>`), and `failed` stops
 * it; both are resumed by `rerunJob` from that stage. One job per site at a time: `startBuild`
 * while one runs returns the running job, so the button can be pressed twice without two builds.
 *
 * 🔒 A DEPLOY WAITS FOR A BUILD, AND A BUILD STEPS ASIDE FOR A DEPLOY (#295). One dsh serves every
 * site, and a deploy that recreates it kills the stage running at that moment. While a run is on,
 * it holds a `@tracy/core/lease` lease (`build-<job>`), which `deploy-host-dsh.sh` waits for. When
 * the deploy has asked long work to hold off (`draining`), the run starts no new stage: the job is
 * written as `paused` (`paused: 'host-updating'`) and the lease released, so the deploy can go on.
 * The stage already running finishes first. The host resumes a paused job once the drain is over,
 * in whichever process is alive by then (`resumePausedBuilds` in `host.ts`).
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
// A relative path, not `@tracy/core/lease`: this file is also bundled by `tracy-site-tabs` and
// `tracy-site-tools`, whose hosts keep bare package imports external, and the image installs no
// `@tracy/core` for them to resolve at boot. A relative import is always bundled.
import { draining, holdLease } from '../../../../core/tracy-core/src/lease/index.mjs'
import { acquireLease, leaseHeld } from './lease.mjs'
import { detailOf } from '../host-messages.mjs'

export const JOB_FILE = path.join('docs', 'agents', 'build', 'job.json')
const SITES_DIR = path.join('docs', 'agents', 'build', 'sites')

/**
 * The per-site file of a job, or null for a job that names no site (a test, or the old shape).
 * @param {string} siteKey
 */
export function jobFileFor(siteKey) {
  return path.join(SITES_DIR, `${siteKey.replace(/[^a-z0-9.-]/gi, '_')}.json`)
}

/**
 * @typedef {'pending' | 'running' | 'done' | 'skipped' | 'waiting' | 'failed'} StageStatus
 * @typedef {{ name: string, status: StageStatus, detail?: string, code?: string, detailCode?: string, detailParams?: Record<string, string | number>, facts?: Record<string, string | number>, note?: { kind: string, done?: number, total?: number }, startedAt?: string, endedAt?: string }} Stage
 * @typedef {{ stage: string, pages?: string[] }} Rerun
 * @typedef {{
 *   schemaVersion: string, job: string, inspiration: string, platform: string,
 *   status: 'running' | 'done' | 'waiting' | 'failed' | 'paused', startedAt: string, endedAt?: string,
 *   stages: Stage[], runs: number, waiting?: string, failed?: string, paused?: 'host-updating', rerun?: Rerun, contentRevision?: string, lastApplyId?: string,
 *   briefRevision?: number, pendingStage?: string, appliedRequests?: string[], answers?: Record<string, unknown>, ownerSessionId?: string, targetSiteKey?: string, targetUrl?: string, designPlan?: DesignPlan, uiLang?: string, finished?: Promise<Job>
 * }} Job
 * @typedef {{
 *   requestedDesign: string, effectiveDesign: string, contractProfile: string | null, workflow?: string,
 *   template?: { element: string, version: string, source: string },
 *   fallback: boolean, fallbackReason?: string, registryRevision?: string, multilingual?: false,
 *   design?: { id: string, source: 'catalog' } | { id: string, source: 'brand' } | { id: string, source: 'quickstart', name: string, tokensFrom: string, tokens: Record<string, string> } | null
 * }} DesignPlan
/**
 * `code` is the refusal's own identifier when a stage stopped on one, kept BESIDE the sentence
 * rather than inside it. `detail` is what a person reads; `code` is what the Build tab decides
 * with — above all whether "run it again" is honest. A stage that simply did not work carries
 * none, and everything downstream treats its absence as "no idea, offer the retry".
 *
 * `detailCode` (+ `detailParams`) is set when `detail` is one of Tracy's own sentences
 * (`host-messages.mjs`): the Build tab shows that sentence in the reader's language, and keeps
 * `detail` as written for anything without a code. Never inferred from `code`: a refusal's code
 * says who refused, not which words were written.
 * @typedef {{ status: StageStatus, detail?: string, code?: string, detailCode?: string, detailParams?: Record<string, string | number>, facts?: Record<string, string | number>, contentRevision?: string, lastApplyId?: string }} StageResult
 * @typedef {(job: Job) => Promise<StageResult> | StageResult} StageFn
 * @typedef {{ onChange?: (job: Job) => void, now?: () => number }} RunOptions
 */

/** The job as written: everything but the in-memory promise. @param {Job} job */
function toDisk(job) {
  const { finished: _finished, ...rest } = job
  return rest
}

/** @param {string} root @param {Job} job */
function writeJob(root, job) {
  const text = `${JSON.stringify(toDisk(job), null, 2)}\n`
  const files = [path.join(root, JOB_FILE), path.join(root, 'docs/agents/build/jobs', `${job.job}.json`)]
  if (job.targetSiteKey) files.push(path.join(root, jobFileFor(job.targetSiteKey)))
  if (job.ownerSessionId)
    files.push(
      path.join(root, 'docs', 'agents', 'build', 'sessions', `${encodeURIComponent(job.ownerSessionId)}.json`)
    )
  for (const file of files) {
    mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${randomUUID()}.tmp`
    writeFileSync(temporary, text, { mode: 0o600 })
    renameSync(temporary, file)
  }
}

/** @param {string} file @returns {Job | null} */
function readJobFile(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && Array.isArray(parsed.stages) ? parsed : null
  } catch {
    return null
  }
}

/**
 * The job on disk, or null when there is none or it is unreadable — the polling route must never
 * throw over a half-written file.
 *
 * Site and session lookups are exact. A missing record never falls back to another build.
 * @param {string} root
 * @param {string} [siteKey]
 * @param {string} [sessionId]
 * @returns {Job | null}
 */
export function readJob(root, siteKey, sessionId) {
  const file = siteKey
    ? jobFileFor(siteKey)
    : sessionId
      ? path.join('docs', 'agents', 'build', 'sessions', `${encodeURIComponent(sessionId)}.json`)
      : JOB_FILE
  const job = readJobFile(path.join(root, file))
  return job?.ownerSessionId && sessionId && job.ownerSessionId !== sessionId ? null : job
}

/**
 * A fresh job with every stage pending, written at once so a poll that lands before the first stage
 * turns already sees it.
 * @param {string} root
 * @param {{ id: string, platform: string, stages: readonly string[], briefRevision?: number, appliedRequests?: string[], answers?: Record<string, unknown>, ownerSessionId?: string, targetSiteKey?: string, targetUrl?: string, designPlan?: DesignPlan, uiLang?: string, now?: () => number }} opts
 * @returns {Job}
 */
export function createJob(
  root,
  {
    id,
    platform,
    stages,
    answers,
    ownerSessionId,
    targetSiteKey,
    targetUrl,
    designPlan,
    uiLang,
    now = Date.now
  }
) {
  if (!Array.isArray(stages) || stages.length === 0) throw new Error('createJob: a job needs its stage names')
  if (new Set(stages).size !== stages.length) throw new Error('createJob: stage names must be distinct')
  const at = now()
  /** @type {Job} */
  const job = {
    schemaVersion: 'tracy-site-build/v1',
    job: `build-${at.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    inspiration: id,
    platform,
    status: 'running',
    startedAt: new Date(at).toISOString(),
    stages: stages.map((name) => ({ name, status: 'pending' })),
    runs: 0
  }
  if (answers) job.answers = answers
  if (ownerSessionId) job.ownerSessionId = ownerSessionId
  // The site being dressed, when it is NOT the lane's own (tasks/todo-build-new-site.md): a build
  // started from the customer's lane creates a new site and works on THAT one. Absent means the
  // lane's own webroot, the older shape — absent, not guessed, so nothing reads a wrong key.
  if (targetSiteKey) job.targetSiteKey = targetSiteKey
  // The address the FLEET gave for that site — the only honest source for it (`liveUrl` on the job
  // row). The picture stage photographs this, and nothing here ever assembles one from the label.
  if (targetUrl) job.targetUrl = targetUrl
  // The interface language of the person who pressed (`<html lang>` on their page): the task list
  // and the retry question are drawn on that page, so they speak it. Absent for a build nobody's
  // page started (the agent's tool, the sweep); readers then fall back to the conversation's.
  if (uiLang) job.uiLang = uiLang
  // What the fleet answered when this site was created: which design was asked for, which one is
  // actually on it, and the contract profile that names. Recorded, never decided here — the
  // `check` stage verifies it against the site itself before any stage acts on it, so a plan that
  // does not match what was built fails the build instead of describing it wrongly.
  if (designPlan) job.designPlan = designPlan
  writeJob(root, job)
  return job
}

/**
 * Run the stages from index `from` to the end. Each stage is marked running (and written) before it
 * starts and settled (and written) after; the first `waiting` or `failed` ends the run.
 * @param {string} root @param {Job} job @param {Record<string, StageFn>} stages @param {number} from @param {RunOptions} opts
 */
async function runFrom(root, job, stages, from, { onChange, now = Date.now } = {}) {
  const change = () => {
    writeJob(root, job)
    onChange?.(job)
  }
  const stamp = () => new Date(now()).toISOString()
  job.status = 'running'
  delete job.waiting
  delete job.failed
  delete job.paused
  delete job.endedAt
  job.runs += 1
  // Only where a deploy can see it: a fleet dsh always sets DSH_HOME, a test run does not, and a
  // lease there would land in whatever folder the test happens to stand in.
  const deployLease = process.env.DSH_HOME
    ? holdLease(`build-${job.job}`, {
        kind: 'build',
        siteKey: job.targetSiteKey ?? '',
        ...(job.ownerSessionId ? { sessionId: job.ownerSessionId } : {})
      })
    : null
  try {
    return await runStages(job, stages, from, change, stamp)
  } finally {
    deployLease?.release()
  }
}

/**
 * The stage loop of `runFrom`, which holds the deploy lease around it.
 * @param {Job} job @param {Record<string, StageFn>} stages @param {number} from
 * @param {() => void} change @param {() => string} stamp
 */
async function runStages(job, stages, from, change, stamp) {
  for (let i = from; i < job.stages.length; i += 1) {
    const stage = job.stages[i]
    const fn = stages[stage.name]
    if (draining()) {
      // A deploy is waiting to replace this process. Start nothing it would cut off.
      job.status = 'paused'
      job.paused = 'host-updating'
      change()
      return job
    }
    stage.status = 'running'
    stage.startedAt = stamp()
    delete stage.endedAt
    delete stage.detail
    delete stage.code
    delete stage.detailCode
    delete stage.detailParams
    change()
    /** @type {StageResult} */
    let result
    try {
      result = fn ? await fn(job) : { status: 'failed', ...detailOf('NO_EXECUTOR') }
    } catch (error) {
      // A stage that throws still knows WHY when the door told it: `call` in the CMS stages hangs
      // the refusal's code on the Error, because an exception is the one path where a structured
      // answer would otherwise be flattened into a sentence. The sentence's own code rides the same
      // way (`detailCode`, `detailParams`), when the message is one of Tracy's.
      const thrown = /** @type {{code?: unknown, detailCode?: unknown, detailParams?: unknown}} */ (
        error ?? {}
      )
      const code = thrown?.code
      result = {
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
        ...(typeof code === 'string' && code !== '' ? { code } : {}),
        ...(typeof thrown?.detailCode === 'string' ? { detailCode: thrown.detailCode } : {}),
        ...(thrown?.detailParams && typeof thrown.detailParams === 'object'
          ? { detailParams: /** @type {Record<string, string | number>} */ (thrown.detailParams) }
          : {})
      }
    }
    const status = ['done', 'skipped', 'waiting', 'failed'].includes(result?.status)
      ? result.status
      : 'failed'
    stage.status = status
    stage.endedAt = stamp()
    if (result?.detail) stage.detail = result.detail
    if (result?.code) stage.code = result.code
    // The code describes `detail`; a result that carries one without the other has nothing to say.
    if (result?.detail && result.detailCode) stage.detailCode = result.detailCode
    if (result?.detail && result.detailCode && result.detailParams) stage.detailParams = result.detailParams
    if (result?.facts && typeof result.facts === 'object') stage.facts = result.facts
    if (status === 'done' && result.contentRevision) job.contentRevision = result.contentRevision
    if (status === 'done' && result.lastApplyId) job.lastApplyId = result.lastApplyId
    if (status === 'waiting') {
      job.status = 'waiting'
      job.waiting = result.detail ?? stage.name
      change()
      return job
    }
    if (status === 'failed') {
      job.status = 'failed'
      job.failed = stage.name
      job.endedAt = stamp()
      change()
      return job
    }
    change()
  }
  job.status = 'done'
  job.endedAt = stamp()
  change()
  return job
}

/**
 * Run a fresh job through every stage it carries.
 * @param {string} root @param {Job} job @param {Record<string, StageFn>} stages @param {RunOptions} [opts]
 */
export function runJob(root, job, stages, opts) {
  return runFrom(root, job, stages, 0, opts)
}

/**
 * Run again from one stage — after the customer answered (`waiting`), after a fix (`failed`), or on
 * request ("change the headline" reruns `seed` for one page). Stages before it keep their result;
 * the request travels on `job.rerun` for the stages to read.
 * @param {string} root @param {Job} job @param {string} stage @param {Record<string, StageFn>} stages
 * @param {{ pages?: string[] } & RunOptions} [opts]
 */
export function rerunJob(root, job, stage, stages, opts = {}) {
  const from = job.stages.findIndex((s) => s.name === stage)
  if (from < 0) return Promise.reject(new Error(`unknown stage: ${stage}`))
  const { pages, ...run } = opts
  job.rerun = pages ? { stage, pages } : { stage }
  for (let i = from; i < job.stages.length; i += 1) {
    job.stages[i] = { name: job.stages[i].name, status: 'pending' }
  }
  return runFrom(root, job, stages, from, run)
}

/**
 * The jobs this process is running, while they run: per folder, then per site (`''` for a job
 * naming none). The one touched last per folder is what a caller naming no site gets.
 * @type {Map<string, Map<string, Job>>}
 */
const running = new Map()

/** @param {string} root @param {string} key @param {Job} job */
function track(root, key, job) {
  let byKey = running.get(root)
  if (!byKey) {
    byKey = new Map()
    running.set(root, byKey)
  }
  // Re-insert so the map's order says which job is the latest.
  byKey.delete(key)
  byKey.set(key, job)
}

/** @param {string} root @param {string} key @param {Job} job */
function untrack(root, key, job) {
  const byKey = running.get(root)
  if (byKey?.get(key) === job && job.status !== 'running') byKey.delete(key)
  if (byKey?.size === 0) running.delete(root)
}

/** @param {string} root @param {string} [siteKey] @returns {Job | undefined} */
function tracked(root, siteKey) {
  const byKey = running.get(root)
  if (!byKey) return undefined
  if (siteKey !== undefined) return byKey.get(siteKey)
  let last
  for (const job of byKey.values()) last = job
  return last
}

/**
 * Start a build unless one is already running for this SITE — then that one is returned, so a
 * second press of the button joins the first instead of racing it. A press for another site is
 * another build. The returned job carries `finished`, a promise of the settled job, for the tool
 * call that waits on it.
 * @param {string} root
 * @param {{ id: string, platform: string, stages: readonly string[], briefRevision?: number, appliedRequests?: string[], answers?: Record<string, unknown>, ownerSessionId?: string, targetSiteKey?: string, targetUrl?: string, designPlan?: DesignPlan, uiLang?: string, now?: () => number }} request
 * @param {Record<string, StageFn>} stages
 * @param {RunOptions} [opts]
 * @returns {Job}
 */
export function startBuild(root, request, stages, opts) {
  const key = request.targetSiteKey ?? ''
  const current = tracked(root, key)
  if (current && current.status === 'running') return current
  const release = acquireLease(root, key)
  if (!release) {
    const existing = readJob(root, key)
    if (existing) return existing
    throw new Error('Another build owns this site.')
  }
  let job
  try {
    job = createJob(root, request)
  } catch (error) {
    release()
    throw error
  }
  track(root, key, job)
  job.finished = finishQueued(root, job, stages, () => runFrom(root, job, stages, 0, opts), opts).finally(
    () => {
      release()
      untrack(root, key, job)
    }
  )
  return job
}

/**
 * The job this process is running for `root` (and site, when one is named), whether or not it has
 * settled yet, else the one on disk from an earlier process.
 * @param {string} root
 * @param {string} [siteKey]
 * @param {string} [sessionId]
 * @returns {Job | null}
 */
export function currentJob(root, siteKey, sessionId) {
  if (sessionId) {
    const own = readJob(root, siteKey, sessionId)
    if (!own) return null
    const live = tracked(root, own.targetSiteKey)
    return live?.job === own.job ? live : own
  }
  return tracked(root, siteKey) ?? readJob(root, siteKey)
}

/**
 * Resume the running job for `root` from a stage (the tool's `rerun`), or the one on disk when
 * the process restarted meanwhile.
 * @param {string} root @param {string} stage @param {Record<string, StageFn>} stages
 * @param {{ pages?: string[], siteKey?: string, answers?: Record<string, unknown> } & RunOptions} [opts]
 * @returns {Job | null}
 */
export function resumeBuild(root, stage, stages, opts = {}) {
  const { siteKey, answers, ...rest } = opts
  const job = currentJob(root, siteKey)
  if (!job) return null
  const key = job.targetSiteKey ?? ''
  if (tracked(root, key)?.status === 'running') return job
  const release = acquireLease(root, key)
  if (!release) return job
  if (answers) {
    job.answers = { ...job.answers, ...answers }
    job.briefRevision = (job.briefRevision ?? 0) + 1
  }
  track(root, key, job)
  job.finished = finishQueued(
    root,
    job,
    stages,
    () => rerunJob(root, job, stage, stages, rest),
    rest
  ).finally(() => {
    release()
    untrack(root, key, job)
  })
  return job
}

/** Save customer changes before returning, including while a stage is using the previous brief.
 * @param {string} root @param {Job} job @param {Record<string, unknown>} answers
 * @param {Record<string, StageFn>} stages @param {RunOptions & {stage?: string, inspiration?: string}} [opts]
 */
export function reviseBuild(root, job, answers, stages, opts) {
  if (opts?.stage && !job.stages.some((step) => step.name === opts.stage))
    throw new Error('Unknown request stage')
  const dir = path.join(root, 'docs/agents/build/requests', job.job)
  mkdirSync(dir, { recursive: true })
  const id = `${Date.now()}-${randomUUID()}`
  const file = path.join(dir, `${id}.json`)
  writeFileSync(
    `${file}.tmp`,
    JSON.stringify({ id, answers, stage: opts?.stage, inspiration: opts?.inspiration }),
    { mode: 0o600 }
  )
  renameSync(`${file}.tmp`, file)
  const live = tracked(root, job.targetSiteKey)
  if (live?.status === 'running' || leaseHeld(root, job.targetSiteKey))
    return { job: live ?? job, requestId: id }
  // Recovery and revisions retain earlier failed prerequisites; they cannot jump over install.
  const first = job.stages.findIndex((s) => !['done', 'skipped'].includes(s.status))
  const copy = job.stages.findIndex((s) => s.name === 'copy')
  const at = first >= 0 && first < copy ? first : Math.max(0, copy)
  // The drain consumes the queued brief before restarting, so it never seeds stale answers first.
  return { job: resumeQueued(root, job, stages, at, opts), requestId: id }
}

/** @param {string} root @param {Job} job @returns {{id: string, answers: Record<string, unknown>, stage?: string, inspiration?: string}[]} */
function pending(root, job) {
  const dir = path.join(root, 'docs/agents/build/requests', job.job)
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8')))
      .filter((request) => !(job.appliedRequests ?? []).includes(request.id))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

/** @param {string} root @param {Job} job */
export function hasPendingBrief(root, job) {
  return pending(root, job).length > 0
}

/** @param {string} root @param {Job} job  */
function mergeRequests(root, job) {
  const requests = pending(root, job)
  for (const request of requests) {
    job.answers = { ...job.answers, ...request.answers }
    if (request.inspiration) job.inspiration = request.inspiration
    const desired = job.stages.findIndex((step) => step.name === (request.stage ?? 'copy'))
    const held = job.stages.findIndex((step) => step.name === job.pendingStage)
    job.pendingStage = job.stages[Math.max(0, held < 0 ? desired : Math.min(held, desired))].name
    job.appliedRequests = [...(job.appliedRequests ?? []), request.id]
    job.briefRevision = (job.briefRevision ?? 0) + 1
  }
  if (requests.length) writeJob(root, job)
  return requests.length > 0
}

/** @param {string} root @param {Job} job @param {Record<string, StageFn>} stages @param {() => Promise<Job>} initial @param {RunOptions} [opts] */
async function finishQueued(root, job, stages, initial, opts) {
  await initial()
  // A paused job keeps its queued brief for the resume, which reads it first.
  while (job.status !== 'paused' && mergeRequests(root, job)) {
    const copy = job.stages.findIndex((s) => s.name === (job.pendingStage ?? 'copy'))
    const failed = job.stages.findIndex((s) => !['done', 'skipped'].includes(s.status))
    const at = failed >= 0 && failed < copy ? failed : Math.max(0, copy)
    delete job.pendingStage
    await rerunJob(root, job, job.stages[at].name, stages, opts)
  }
  return job
}

/** @param {string} root @param {Job} job @param {Record<string, StageFn>} stages @param {number} at @param {RunOptions} [opts] */
function resumeQueued(root, job, stages, at, opts) {
  const key = job.targetSiteKey ?? ''
  const release = acquireLease(root, key)
  if (!release) return job
  track(root, key, job)
  mergeRequests(root, job)
  if (job.pendingStage) {
    const requested = job.stages.findIndex((step) => step.name === job.pendingStage)
    at = Math.min(at, Math.max(0, requested))
    delete job.pendingStage
  }
  job.finished = finishQueued(
    root,
    job,
    stages,
    () => rerunJob(root, job, job.stages[at].name, stages, opts),
    opts
  ).finally(() => {
    release()
    untrack(root, key, job)
  })
  return job
}

/**
 * The jobs in `root` a process left unfinished — `running` (its process died mid-stage) or `paused`
 * (it stepped aside for a deploy) — one per site, read from the per-site files and `job.json`.
 * What the host resumes at boot without waiting for a Build-tab poll (#295).
 * @param {string} root
 * @returns {Job[]}
 */
export function unfinishedJobs(root) {
  const dir = path.join(root, SITES_DIR)
  /** @type {string[]} */
  let files = []
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(dir, name))
  } catch {
    files = []
  }
  /** @type {Map<string, Job>} */
  const jobs = new Map()
  for (const file of [...files, path.join(root, JOB_FILE)]) {
    const job = readJobFile(file)
    if (job && (job.status === 'running' || job.status === 'paused')) jobs.set(job.job, job)
  }
  return [...jobs.values()]
}

/** A persisted running or paused checkpoint without a live owner resumes its interrupted stage.
 * @param {string} root @param {Job} job @param {Record<string, StageFn>} stages @param {RunOptions} [opts]
 */
export function recoverBuild(root, job, stages, opts) {
  if (tracked(root, job.targetSiteKey) || leaseHeld(root, job.targetSiteKey)) return job
  const queued = pending(root, job).length > 0 || Boolean(job.pendingStage)
  if (job.status !== 'running' && job.status !== 'paused' && !queued) return job
  // Paused for a deploy that is still waiting: resuming now would only pause again.
  if (job.status === 'paused' && draining()) return job
  const at = job.stages.findIndex((stage) => !['done', 'skipped'].includes(stage.status))
  return resumeQueued(
    root,
    job,
    stages,
    at < 0 && job.pendingStage
      ? job.stages.findIndex((step) => step.name === job.pendingStage)
      : Math.max(0, at),
    opts
  )
}
