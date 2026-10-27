/**
 * The run lock and the orphan reconciliation that opens every daily QA run.
 *
 * The bootstrap runs the orchestrator as `lockf -k -t 0 state/run.lock <orchestrator>`: a second run
 * exits 75, and the kernel releases the lock when the holder dies. `lockf` does NOT hold the lock for
 * grandchildren, so every run starts by reconciling the previous run's `procs.jsonl`:
 *   - a recorded process still alive with the same start time -> its whole group is killed;
 *   - alive with another start time (PID reused) -> left alone, reported as mismatched;
 *   - recorded leader gone but members of its group still alive (grandchildren) -> killed;
 *   - an intent with no pid (the orchestrator died between intent and spawn record) -> found by the
 *     run id, which every tracked spawn carries in its argv marker and in `QA_RUN_ID`.
 *
 * Why an argv marker as well as `QA_RUN_ID`: on this macOS the kernel no longer hands other processes'
 * environments to `ps -E` (KERN_PROCARGS2 returns argv only; measured 03/10/2026), so the environment
 * cannot be read back. A tracked spawn therefore runs under `/bin/sh -c '"$@"; exit $?' qa-run=<runId>/<id>`,
 * a shell that stays alive as group leader and shows the marker in `ps`. On Linux `/proc/<pid>/environ`
 * is read too.
 *
 * Exports:
 *   LOCKF = '/usr/bin/lockf', LOCK_BUSY = 75
 *   lockArgv(lockFile: string, argv: string[]): string[]
 *   procStart(pid: number): string | null                  // `ps -o lstart=`, whitespace-normalised
 *   listProcesses(): { pid, pgid, start, command }[]
 *   runMarker(runId: string, spawnId?: string): string     // 'qa-run=<runId>/<spawnId>'
 *   trackedSpawnArgs(runId, spawnId, cmd, args): { cmd, args, env }
 *   spawnTracked(procsPath, { runId, label, ...data }, cmd, args, spawnOptions?): ChildProcess
 *       // journal: intent -> 'spawned' { pid, pgid, start } -> result { code, signal } on exit
 *   reconcileOrphans({ procsPath, runId }): {
 *     killed: { pid, pgid, why }[], mismatched: { pid, recorded, actual }[],
 *     foundByRunId: { pid, pgid }[], gone: { id, pid? }[] }
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { appendLine, openJournal } from './journal.mjs'

export const LOCKF = '/usr/bin/lockf'
export const LOCK_BUSY = 75

export function lockArgv(lockFile, argv) {
  return [LOCKF, '-k', '-t', '0', lockFile, ...argv]
}

const norm = (s) => s.trim().replace(/\s+/g, ' ')

export function procStart(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return norm(out) || null
  } catch {
    return null
  }
}

export function listProcesses() {
  const out = execFileSync('ps', ['-ax', '-ww', '-o', 'pid=,pgid=,lstart=,command='], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  const rows = []
  for (const line of out.split('\n')) {
    // lstart is always five tokens: "Sat Oct  3 00:00:51 2026".
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s?(.*)$/)
    if (m) rows.push({ pid: Number(m[1]), pgid: Number(m[2]), start: norm(m[3]), command: m[4] })
  }
  return rows
}

export const runMarker = (runId, spawnId = '') => `qa-run=${runId}/${spawnId}`

export function trackedSpawnArgs(runId, spawnId, cmd, args = []) {
  return {
    cmd: '/bin/sh',
    args: ['-c', '"$@"; exit $?', runMarker(runId, spawnId), cmd, ...args],
    env: { QA_RUN_ID: runId }
  }
}

/** Spawn in a new process group, journalling intent first and pid/pgid/start right after. */
export function spawnTracked(procsPath, { runId, label, ...data }, cmd, args = [], options = {}) {
  const journal = openJournal(procsPath)
  const id = journal.intent(label ?? cmd, { ...data, runId, cmd, args })
  const t = trackedSpawnArgs(runId, id, cmd, args)
  const child = spawn(t.cmd, t.args, {
    ...options,
    detached: true,
    env: { ...(options.env ?? process.env), ...t.env }
  })
  if (child.pid)
    appendLine(procsPath, {
      t: 'spawned',
      id,
      pid: child.pid,
      pgid: child.pid,
      start: procStart(child.pid),
      at: new Date().toISOString()
    })
  child.once('exit', (code, signal) => journal.result(id, { code, signal }))
  child.once('error', (err) => journal.result(id, { error: String(err.message) }))
  return child
}

function envHasRunId(pid, runId) {
  const f = `/proc/${pid}/environ`
  if (!existsSync(f)) return false
  try {
    return readFileSync(f, 'latin1').split('\0').includes(`QA_RUN_ID=${runId}`)
  } catch {
    return false
  }
}

const startMs = (s) => Date.parse(s)

export function reconcileOrphans({ procsPath, runId }) {
  const report = { killed: [], mismatched: [], foundByRunId: [], gone: [] }
  const procs = listProcesses()
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  const self = new Set([process.pid, process.ppid, 1])
  let ownPgid = null
  try {
    ownPgid = Number(
      execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' }).trim()
    )
  } catch {}

  const doomed = new Map() // pid -> { pid, pgid, why }
  const killGroup = (pgid, notBefore, why) => {
    if (!pgid || pgid === ownPgid || pgid <= 1) return
    for (const p of procs) {
      if (p.pgid !== pgid || self.has(p.pid)) continue
      if (notBefore && startMs(p.start) < startMs(notBefore)) continue
      if (!doomed.has(p.pid)) doomed.set(p.pid, { pid: p.pid, pgid, why })
    }
  }

  const lines = openJournal(procsPath).lines()
  const spawned = new Map(lines.filter((l) => l.t === 'spawned').map((l) => [l.id, l]))
  for (const intent of lines.filter((l) => l.t === 'intent')) {
    const sp = spawned.get(intent.id)
    if (!sp) continue // no pid: handled by the run-id sweep below
    const leader = byPid.get(sp.pid)
    if (leader) {
      if (leader.start === sp.start) killGroup(sp.pgid, sp.start, 'alive, start time matches')
      else report.mismatched.push({ pid: sp.pid, recorded: sp.start, actual: leader.start })
      continue
    }
    const members = procs.filter((p) => p.pgid === sp.pgid)
    const groupReused = members.some((p) => p.pid === sp.pgid)
    if (!groupReused && members.length) killGroup(sp.pgid, sp.start, 'leader gone, group members alive')
    else report.gone.push({ id: intent.id, pid: sp.pid })
  }

  // Every tracked spawn of this run carries the marker; a grandchild on Linux carries QA_RUN_ID.
  const marker = runMarker(runId)
  for (const p of procs) {
    if (self.has(p.pid)) continue
    if (p.command.includes(marker) || envHasRunId(p.pid, runId)) {
      const known = doomed.has(p.pid)
      killGroup(p.pgid, p.start, 'carries the run id')
      if (!doomed.has(p.pid)) doomed.set(p.pid, { pid: p.pid, pgid: p.pgid, why: 'carries the run id' })
      if (!known) report.foundByRunId.push({ pid: p.pid, pgid: p.pgid })
    }
  }

  for (const d of doomed.values()) {
    try {
      process.kill(d.pid, 'SIGKILL')
      report.killed.push(d)
    } catch {}
  }
  return report
}
