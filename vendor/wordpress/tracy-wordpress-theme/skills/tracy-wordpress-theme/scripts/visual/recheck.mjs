#!/usr/bin/env node
// recheck.mjs — the agent's side of the ROLLING Visual QA loop (`round.mjs --watch`, the controller).
//
//   node scripts/visual/recheck.mjs --config <round.json> --name <session> --changed a.css,b.html [--clusters C-1,C-2] [--note "…"] [--timeout 1800]
//        → the controller deploys and re-measures, on every tier of the session, a SAMPLE of the pages
//          the change can reach: each affected layout's representative, the pages it cannot stand in
//          for, and the affected pages of the clusters being fixed (`--clusters`, ids from `--status`
//          work; without it, every affected page with findings). It answers with their verdicts
//          (closed / new / same per page and tier) and the pages it `deferred` to the next checkpoint.
//   node scripts/visual/recheck.mjs --config … --name … --checkpoint [--reason "…"] [--timeout 3600]   (a third or later full checkpoint needs --reason)
//        → a FULL checkpoint (every page × every tier at one deployment); exit 0 only on close-tier.
//   node scripts/visual/recheck.mjs --config … --name … --status
//        → no waiting: the latest findings of every page and tier measured so far in the session, and
//          `work` — what to fix next: open clusters (clusters.json, when a run of the tier wrote one)
//          largest first, then pages no cluster covers; without clusters, pages by findings.
//   node scripts/visual/recheck.mjs --config … --name … --stop
//
// Why: JA Vega M4c (27/09) spent ~50 of 125 minutes of step 8b waiting — every fix waited for a full
// measurement of every page, and every measurement for the whole batch of fixes. Here a page's
// findings are readable as soon as that page is measured (`--status`), a fix is judged on the pages
// it can reach within the time those pages take, and the full run is a periodic checkpoint.
//
// Protocol (files, so any agent process can talk to the controller):
//   <evidence>/rolling.lock                 the controller's pid — ONE writer of the ledger
//   <evidence>/rolling.lock.takeover        held only while a dead controller's lock is replaced
//   <evidence>/<session>/control.json        what the controller is doing (generation, phase, active run)
//   <evidence>/<session>/requests/<id>.json  a request; <id>.result.json its answer (written by rename)
// A request is never answered by this script: no controller, a dead controller, or no answer
// before --timeout is exit 2 with the reason — never a pass. A recheck answer never closes the
// visual gate (`closesGate: false`); only a complete checkpoint does.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDIT_FILE, DOSSIER_INPUTS } from '../lib/audit-receipt.mjs'
import { CLUSTERS, readEvidence } from './evidence.mjs'
import { assertNotProtected, emitResult, encodeField, oneLine, takeOutputFlags, writeResultFile } from '../lib/cli-output.mjs'

export const lockFile = (evidence) => path.join(evidence, 'rolling.lock')
export const takeoverFile = (evidence) => path.join(evidence, 'rolling.lock.takeover')
export const requestsDir = (evidence, name) => path.join(evidence, name, 'requests')
export const controlFile = (evidence, name) => path.join(evidence, name, 'control.json')

/** Whether a process id is alive (EPERM: alive, not ours). */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'))
  } catch {
    return null
  }
}

/** The answer without its per-page tables: what a shell prints by default; the whole answer is the `detail` file. */
export function summarize(r, detail) {
  const { pages, deferred, ...rest } = r
  const stages = Object.fromEntries(Object.entries(pages ?? {}).map(([stage, ps]) => [stage, { pages: Object.keys(ps).length, withFindings: Object.values(ps).filter((p) => p.findings).length }]))
  return { ...rest, ...(pages ? { pages: stages } : {}), ...(deferred ? { deferred: Array.isArray(deferred) ? deferred.length : deferred } : {}), detail }
}

/** The lock holder `{pid, name, at, alive}`, or null when there is no lock. */
export function lockHolder(evidence) {
  const f = lockFile(evidence)
  if (!existsSync(f)) return null
  const h = readJson(f)
  // A lock that cannot be read is held: whoever wrote it may be mid-write.
  if (!h) return { pid: null, name: null, at: null, alive: true, unreadable: true }
  return { ...h, alive: pidAlive(h.pid) }
}

/**
 * Take the ledger for one writer: a rolling controller, or a one-round run (`role: 'round'`,
 * round.mjs without --watch, for the length of its run). A lock held by a live process is an Error; a lock
 * left by a dead one is taken over and returned as `recovered` (the dead controller's last line is
 * whatever it managed to write — an unfinished checkpoint never reached the ledger, so it counts
 * for nothing).
 */
export function acquireLock(evidence, name, { role = 'controller' } = {}) {
  mkdirSync(evidence, { recursive: true })
  const f = lockFile(evidence)
  const body = JSON.stringify({ pid: process.pid, name, role, at: new Date().toISOString() }) + '\n'
  try {
    writeFileSync(f, body, { flag: 'wx' })
    return { recovered: null }
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }
  const owned = (h) =>
    new Error(
      h.role === 'round'
        ? `a one-round run (pid ${h.pid ?? '?'}, run ${h.name ?? '?'}) owns ${evidence}: one writer per ledger — wait for it to end`
        : `a rolling controller (pid ${h.pid ?? '?'}, session ${h.name ?? '?'}) owns ${evidence}: one writer per ledger — send it the change (recheck.mjs) or stop it (recheck.mjs --stop) first`
    )
  const h = lockHolder(evidence)
  if (h?.alive) throw owned(h)
  // Taking over a dead lock is check-then-replace, so it runs under a second lock: two controllers
  // that both saw the dead pid would otherwise each delete the other's fresh lock and both run.
  // Only the one that creates the takeover file goes on; it checks the holder again under it.
  const tf = takeoverFile(evidence)
  try {
    writeFileSync(tf, body, { flag: 'wx' })
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
    const t = readJson(tf)
    throw new Error(`another controller (pid ${t?.pid ?? '?'}, session ${t?.name ?? '?'}) is taking over the dead lock of ${evidence}${t && !pidAlive(t.pid) ? ` and died doing it — remove ${tf} once no controller runs` : ''}`)
  }
  try {
    const again = lockHolder(evidence)
    if (again?.alive) throw owned(again)
    rmSync(f, { force: true })
    // wx again: a controller that found no lock at all between the two calls wins, and this one stops
    try {
      writeFileSync(f, body, { flag: 'wx' })
    } catch (e) {
      if (e.code === 'EEXIST') throw owned(lockHolder(evidence) ?? {})
      throw e
    }
    return { recovered: again ?? h }
  } finally {
    rmSync(tf, { force: true })
  }
}

export function releaseLock(evidence) {
  const h = lockHolder(evidence)
  if (h && h.pid === process.pid) rmSync(lockFile(evidence), { force: true })
}

let seq = 0
/** Write a request atomically; returns its id. Ids sort in submission order. */
export function submit({ evidence, name, kind, changed = [], clusters = [], note = null, reason = null }) {
  if (!['recheck', 'checkpoint', 'stop'].includes(kind)) throw new Error(`unknown request kind ${kind}`)
  const dir = requestsDir(evidence, name)
  if (!existsSync(dir)) throw new Error(`no rolling session ${name} in ${evidence} (start it with round.mjs --watch)`)
  const id = `${String(Date.now()).padStart(15, '0')}-${String(process.pid).padStart(7, '0')}-${String(seq++).padStart(4, '0')}`
  const tmp = path.join(dir, `.${id}.tmp`)
  writeFileSync(tmp, JSON.stringify({ id, kind, changed, ...(clusters.length ? { clusters } : {}), ...(reason ? { reason } : {}), note, at: new Date().toISOString(), pid: process.pid }) + '\n', { flag: 'wx' })
  renameSync(tmp, path.join(dir, `${id}.json`))
  return id
}

/** Requests without an answer, in submission order. A request file that does not parse is answered as an error by the controller. */
export function pendingRequests(evidence, name) {
  const dir = requestsDir(evidence, name)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^\d+-\d+-\d+\.json$/.test(f))
    .sort()
    .map((f) => f.replace(/\.json$/, ''))
    .filter((id) => !existsSync(path.join(dir, `${id}.result.json`)))
    .map((id) => readJson(path.join(dir, `${id}.json`)) ?? { id, kind: 'unreadable' })
}

export function answer(evidence, name, id, result) {
  const dir = requestsDir(evidence, name)
  const tmp = path.join(dir, `.${id}.result.tmp`)
  writeFileSync(tmp, JSON.stringify({ id, answeredAt: new Date().toISOString(), ...result }, null, 2) + '\n')
  renameSync(tmp, path.join(dir, `${id}.result.json`))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Wait for the answer to one request. No controller (no lock, or its pid dead) and no answer by
 * the deadline are answers too — `verdict: "error"` with the reason, never a pass.
 */
export async function waitFor({ evidence, name, id, timeoutS = 1800, pollMs = 200 }) {
  const file = path.join(requestsDir(evidence, name), `${id}.result.json`)
  const deadline = Date.now() + timeoutS * 1000
  for (;;) {
    if (existsSync(file)) {
      const r = readJson(file)
      if (r) return r
    }
    const h = lockHolder(evidence)
    if (!h || !h.alive || (h.name && h.name !== name)) {
      // the controller may have answered and exited between the two reads
      const late = existsSync(file) ? readJson(file) : null
      if (late) return late
      return { id, verdict: 'error', why: h?.role === 'round' ? `a one-round run (${h.name}) holds the ledger, not session ${name}` : h?.name && h.name !== name ? `the controller running is session ${h.name}, not ${name}` : 'no rolling controller is running for this ledger (round.mjs --watch)', closesGate: false }
    }
    if (Date.now() > deadline) return { id, verdict: 'error', why: `no answer within ${timeoutS} s — the request stays queued; read control.json`, closesGate: false }
    await sleep(pollMs)
  }
}

/** Submit and wait: one call for the agent (and the tests). */
export async function request({ evidence, name, kind, changed = [], clusters = [], note = null, reason = null, timeoutS = 1800, pollMs = 200, onSubmit = null }) {
  const h = lockHolder(evidence)
  if (!h || !h.alive) return { verdict: 'error', why: 'no rolling controller is running for this ledger (round.mjs --watch)', closesGate: false }
  const id = submit({ evidence, name, kind, changed, clusters, note, reason })
  onSubmit?.(id)
  return waitFor({ evidence, name, id, timeoutS, pollMs })
}

/**
 * The latest measurement of every page × tier in the session so far, read from each run's
 * pages.jsonl (visual-qa writes a page there the moment its axes are final), runs in the order the
 * controller started them. What an agent fixes from while the checkpoint is still running.
 */
export function status({ evidence, name }) {
  const control = readJson(controlFile(evidence, name))
  const runs = control?.runs ?? []
  const latest = {}
  for (const r of runs)
    for (const [stage, out] of Object.entries(r.tiers ?? {})) {
      const f = path.join(out, 'pages.jsonl')
      if (!existsSync(f)) continue
      for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
        let e
        try {
          e = JSON.parse(line)
        } catch {
          continue // a line cut by a cancelled run
        }
        ;(latest[stage] ??= {})[e.page] = { run: r.id, kind: r.kind, gen: r.gen, measured: e.measured, findings: e.findings.length, unclassified: e.unclassified, kinds: [...new Set(e.findings.map((x) => x.kind))].sort(), at: e.at }
      }
    }
  return { control, pages: latest, work: workOrder(runs, latest) }
}

/**
 * What to fix next, largest probable fix first. With a `clusters.json` (cluster.mjs, written by the
 * controller after every run) in a tier's latest run that has one: its open clusters, largest first,
 * each listing only the pages whose latest measurement still has findings (a cluster none of whose
 * pages does is left out), then every page with findings no listed cluster names. Without one: every
 * page with findings, most findings first. Ties break by stage and id, so the order is deterministic.
 */
export function workOrder(runs, latest) {
  const items = []
  for (const stage of Object.keys(latest).sort()) {
    const open = (page) => (latest[stage][page]?.findings ?? 0) > 0
    let source = null
    for (const r of runs) {
      const out = r.tiers?.[stage]
      if (out && existsSync(path.join(out, 'clusters.json'))) source = { run: r.id, file: path.join(out, 'clusters.json') }
    }
    const data = source ? readEvidence(source.file, CLUSTERS, { what: 'clusters.json' }) : null
    const covered = new Set()
    for (const c of (data?.clusters ?? []).filter((x) => x.status === 'open')) {
      const pages = (c.pages ?? []).filter(open)
      if (!pages.length) continue
      pages.forEach((pg) => covered.add(pg))
      items.push({ by: 'cluster', stage, cluster: c.id, size: c.size, kind: c.kind, selector: c.selector ?? null, property: c.property ?? null, pages, unchanged: Boolean(c.unchanged), from: source.run })
    }
    for (const [page, e] of Object.entries(latest[stage]))
      if (open(page) && !covered.has(page)) items.push({ by: 'page', stage, page, size: e.findings, kinds: e.kinds, from: e.run })
  }
  const rank = (x) => (x.by === 'cluster' ? 0 : 1)
  return items.sort((x, y) => rank(x) - rank(y) || y.size - x.size || (x.stage < y.stage ? -1 : x.stage > y.stage ? 1 : 0) || String(x.cluster ?? x.page).localeCompare(String(y.cluster ?? y.page)))
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { argv, json: jsonFlag, out } = takeOutputFlags(process.argv.slice(2))
  const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
  const flag = (n) => argv.includes(n)
  const main = async () => {
    const json = jsonFlag || flag('--verbose')
    const name = opt('--name')
    if (!opt('--config') || !name) throw new Error('usage: recheck.mjs --config <round.json> --name <session> (--changed a,b [--clusters C-1,C-2] | --checkpoint [--reason "…"] | --status | --stop) [--timeout s] [--note "…"] [--json] [--out FILE] [--verbose (= --json)]')
    const { loadConfig } = await import('./round.mjs')
    const cfg = loadConfig(opt('--config'), { name })
    // the controller's ledger, lock, session directory (control.json, requests), round directory and the configuration are its own
    const owned = () => [opt('--config'), lockFile(cfg.evidence), takeoverFile(cfg.evidence), path.join(cfg.evidence, 'rounds.jsonl'), path.join(cfg.evidence, name), cfg.roundDir, ...[AUDIT_FILE, ...DOSSIER_INPUTS.map((i) => i.name)].map((n) => path.join(cfg.runRoot, n)), cfg.spec, cfg.artifact, cfg.seedReport, cfg.theme, cfg.patternsMap, cfg.pack]
    const kinds = ['--changed', '--checkpoint', '--status', '--stop'].filter(flag)
    if (kinds.length !== 1) throw new Error('exactly one of --changed, --checkpoint, --status, --stop')
    if (flag('--status')) {
      const st = status({ evidence: cfg.evidence, name })
      const stages = Object.entries(st.pages).map(([stage, ps]) => `${stage}:${Object.keys(ps).length}p/${Object.values(ps).filter((p) => p.findings).length}open`)
      emitResult({ result: st, json, out, script: 'recheck', label: 'status', protect: [...owned(), ...(st.control?.runs ?? []).flatMap((r) => Object.values(r.tiers ?? {}))], key: `${cfg.evidence}\0${name}`, summary: `runs=${st.control?.runs?.length ?? 0} work=${st.work.length} ${stages.join(' ')}` })
      return 0
    }
    const timeoutS = Number(opt('--timeout', flag('--checkpoint') ? 3600 : 1800))
    if (!Number.isFinite(timeoutS) || timeoutS <= 0) throw new Error(`--timeout must be a positive number of seconds, got ${opt('--timeout')}`)
    const kind = flag('--changed') ? 'recheck' : flag('--checkpoint') ? 'checkpoint' : 'stop'
    const changed = flag('--changed') ? (opt('--changed') ?? '').split(',').filter(Boolean) : []
    if (flag('--clusters') && kind !== 'recheck') throw new Error('--clusters goes with --changed')
    const clusters = flag('--clusters') ? (opt('--clusters') ?? '').split(',').filter(Boolean) : []
    if (flag('--reason') && kind !== 'checkpoint') throw new Error('--reason goes with --checkpoint: the reason a third or later full checkpoint is needed')
    // the result destination is checked before a request is sent to the controller
    if (out) assertNotProtected(out, owned())
    let id = null
    const r = await request({ evidence: cfg.evidence, name, kind, changed, clusters, note: opt('--note'), reason: opt('--reason'), timeoutS, onSubmit: (v) => (id = v) })
    const detail = id ? path.join(requestsDir(cfg.evidence, name), `${id}.result.json`) : null
    const line = `verdict=${r.verdict}${r.closesGate != null ? ` closesGate=${r.closesGate}` : ''}${r.line?.next ? ` next=${oneLine(r.line.next, 40)}` : ''}${r.why ? ` why=${oneLine(r.why, 120)}` : ''}`
    if (detail && existsSync(detail)) {
      // the answer file is the complete result already
      if (out) writeResultFile(out, r, [detail, ...owned()])
      if (json) console.log(JSON.stringify(r, null, 2))
      else console.log(`recheck ${kind}: ${line} -> ${encodeField(detail)}`)
    } else emitResult({ result: r, json, out, protect: owned(), script: 'recheck', label: kind, key: `${cfg.evidence}\0${name}\0${kind}`, summary: line })
    if (r.verdict === 'error' || r.verdict === 'refused') return 2
    if (kind === 'checkpoint') return r.line?.next === 'close-tier' ? 0 : 1
    return r.verdict === 'clean' || r.verdict === 'no-change' || r.verdict === 'stopped' ? 0 : 1
  }
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`recheck: ${e.message}`)
      process.exit(2)
    })
}
