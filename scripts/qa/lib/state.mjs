/**
 * Daily QA state under `<QA_HOME>/state/` (default `~/TCH-local/qa`). Every JSON file is written
 * temp file -> fsync -> rename -> fsync(dir), so a writer killed at any point leaves either the old or
 * the new file, never a torn one. Each file has exactly one writing process (the orchestrator).
 *
 * Exports:
 *   qaHome(env = process.env): string
 *   stateDir(home: string): string
 *   writeJsonAtomic(path: string, value: unknown): void
 *   readJson(path: string, fallback?: unknown): unknown            // fallback when missing (throws on bad JSON)
 *   readDiscovery(home): { discoveredThrough: string | null, updatedAt?: string }
 *   writeDiscovery(home, sha: string): void
 *   newQueueEntry({ number, mergeCommit, kind?, priority?, firstSeen?, title?, author? }, lanes: string[]): QueueEntry
 *   readQueueEntry(home, number): QueueEntry | null
 *   writeQueueEntry(home, entry: QueueEntry): void
 *   listQueue(home): QueueEntry[]                                    // sorted by PR number
 *   advance(entry, lane, to, { reason?, at? } = {}): QueueEntry      // pure; throws on an illegal step
 *   beginAttempt(entry, lane): QueueEntry                            // pure; attempts + 1 for the current state
 *   recordTimeout(entry, lane): QueueEntry                           // pure; 1st -> queued, 2nd -> gave-up
 *   writeRun(home, { runId, laneKeyHashes, leaseUntil: epoch ms, ...rest }): void
 *   readActiveRun(home, now = Date.now()): object | null              // null when missing, unreadable or expired
 *   nextRunId(home, date = new Date()): string                       // 'YYYYMMDD' + first free letter under r/
 *   PR_STATES, TERMINAL_STATES
 *
 * QueueEntry: { number, mergeCommit, kind, priority, firstSeen, title?, author?,
 *               lanes: { [lane]: { state, attempts, timeouts, reason?, updatedAt } } }
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeSync
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export const PR_STATES = ['queued', 'planned', 'written', 'rerun', 'verified', 'reported']
export const TERMINAL_STATES = ['reported', 'skipped', 'gave-up', 'superseded', 'reverted']
const EARLY_END = ['skipped', 'gave-up', 'superseded', 'reverted']

export function qaHome(env = process.env) {
  if (env.QA_HOME) return env.QA_HOME
  return join(env.HOME || homedir(), 'TCH-local', 'qa')
}

export const stateDir = (home) => join(home, 'state')

export function writeJsonAtomic(path, value) {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`)
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, `${JSON.stringify(value, null, 2)}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
  const dfd = openSync(dir, 'r')
  try {
    fsyncSync(dfd)
  } finally {
    closeSync(dfd)
  }
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8'))
}

const discoveryPath = (home) => join(stateDir(home), 'discovery.json')

export function readDiscovery(home) {
  return readJson(discoveryPath(home), { discoveredThrough: null })
}

export function writeDiscovery(home, sha) {
  writeJsonAtomic(discoveryPath(home), { discoveredThrough: sha, updatedAt: new Date().toISOString() })
}

const queueDir = (home) => join(stateDir(home), 'queue')
const queuePath = (home, number) => join(queueDir(home), `pr-${number}.json`)

export function newQueueEntry(
  { number, mergeCommit, kind = null, priority = null, firstSeen = null, ...rest },
  lanes
) {
  const at = new Date().toISOString()
  return {
    ...rest,
    number,
    mergeCommit,
    kind,
    priority,
    firstSeen,
    lanes: Object.fromEntries(
      lanes.map((l) => [l, { state: 'queued', attempts: 0, timeouts: 0, updatedAt: at }])
    )
  }
}

export function readQueueEntry(home, number) {
  return readJson(queuePath(home, number), null)
}

export function writeQueueEntry(home, entry) {
  writeJsonAtomic(queuePath(home, entry.number), entry)
}

export function listQueue(home) {
  const dir = queueDir(home)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^pr-\d+\.json$/.test(f))
    .map((f) => readJson(join(dir, f)))
    .sort((a, b) => a.number - b.number)
}

function laneOf(entry, lane) {
  const l = entry.lanes?.[lane]
  if (!l) throw new Error(`PR ${entry.number}: no lane ${lane}`)
  return l
}

function withLane(entry, lane, patch) {
  return { ...entry, lanes: { ...entry.lanes, [lane]: { ...entry.lanes[lane], ...patch } } }
}

/** Move one lane of a PR to `to`. Forward by exactly one step, or to an early end from any live state. */
export function advance(entry, lane, to, { reason, at = new Date().toISOString() } = {}) {
  const cur = laneOf(entry, lane)
  if (TERMINAL_STATES.includes(cur.state))
    throw new Error(`PR ${entry.number} ${lane}: ${cur.state} is final`)
  const forward = PR_STATES.indexOf(to) === PR_STATES.indexOf(cur.state) + 1 && PR_STATES.includes(to)
  if (!forward && !EARLY_END.includes(to))
    throw new Error(`PR ${entry.number} ${lane}: illegal step ${cur.state} -> ${to}`)
  const { reason: _old, ...rest } = cur
  const next = { ...rest, state: to, attempts: 0, updatedAt: at }
  if (reason !== undefined) next.reason = reason
  return { ...entry, lanes: { ...entry.lanes, [lane]: next } }
}

/** Start (or restart after an interruption) the lane's current state: attempts + 1. */
export function beginAttempt(entry, lane) {
  const cur = laneOf(entry, lane)
  if (TERMINAL_STATES.includes(cur.state))
    throw new Error(`PR ${entry.number} ${lane}: ${cur.state} is final`)
  return withLane(entry, lane, { attempts: cur.attempts + 1, updatedAt: new Date().toISOString() })
}

/** A process ran out of time or money: back to the queue once, then give up. */
export function recordTimeout(entry, lane) {
  const cur = laneOf(entry, lane)
  if (TERMINAL_STATES.includes(cur.state))
    throw new Error(`PR ${entry.number} ${lane}: ${cur.state} is final`)
  const timeouts = (cur.timeouts ?? 0) + 1
  const at = new Date().toISOString()
  if (timeouts >= 2)
    return withLane(entry, lane, { state: 'gave-up', timeouts, reason: 'timeout twice', updatedAt: at })
  return withLane(entry, lane, { state: 'queued', timeouts, attempts: 0, updatedAt: at })
}

const runPath = (home) => join(stateDir(home), 'run.json')

export function writeRun(home, run) {
  if (!run.runId || !Number.isFinite(run.leaseUntil)) throw new Error('run.json needs runId and leaseUntil')
  writeJsonAtomic(runPath(home), run)
}

export function readActiveRun(home, now = Date.now()) {
  let run
  try {
    run = readJson(runPath(home), null)
  } catch {
    return null
  }
  if (!run || !Number.isFinite(run.leaseUntil) || run.leaseUntil <= now) return null
  return run
}

export function nextRunId(home, date = new Date()) {
  const p = (x) => String(x).padStart(2, '0')
  const day = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`
  const rDir = join(home, 'r')
  const taken = new Set(existsSync(rDir) ? readdirSync(rDir) : [])
  for (const c of 'abcdefghijklmnopqrstuvwxyz') if (!taken.has(day + c)) return day + c
  throw new Error(`no free runId left for ${day}`)
}
