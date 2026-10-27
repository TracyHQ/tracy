#!/usr/bin/env node
// port-checks.mjs — the recorded result of every gate of a port dossier, one line per gate.
//
//   node scripts/port-checks.mjs --run-root <dossier> [--verify <evidence>/verify.json]
//        [--fast-gate <run>/FAST-GATE.json] [--group-verdict <verdict.json>] [--json] [--out rows.json]
//
//   <id> | PASS|FAIL|NOT-RUN | <reason> | <detail file>
//
// Read-only: it opens the reports the gates already wrote and never measures, searches for "the newest"
// report or starts a tool. A PASS is the recorded verdict of that report, not a new live verification.
// Gates: port-audit (the dossier's port-audit.json, always), verify.<mode>.<parity|scan|shoot> (verify.json),
// fast-gate (FAST-GATE.json) and group-verdict (verdict.json) — each only when its path is given.
// A report that is missing or unfinished is NOT-RUN; an unreadable or malformed one, or an unsuccessful
// verdict, is FAIL. Exit 0 only when every selected gate is PASS, 1 otherwise, 2 for a usage error.
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStrict, UsageError } from './lib/cli-args.mjs'
import { encodeField, oneLine, writeResultFile } from './lib/cli-output.mjs'

export const PASS = 'PASS'
export const FAIL = 'FAIL'
export const NOT_RUN = 'NOT-RUN'
const MAX_BYTES = 16 * 1024 * 1024
const VERIFY_PHASES = ['parity', 'scan', 'shoot']
const VERIFY_DETAIL = { parity: 'http-parity.json', scan: path.join('review', 'scanners.json'), shoot: path.join('shots', 'index.json') }
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Reads one JSON report: `{missing}`, `{error}` or `{json}`. Regular files only, size bounded. */
function readReport(file) {
  let st
  try {
    st = lstatSync(file)
  } catch {
    return { missing: true }
  }
  if (!st.isFile()) return { error: 'not a regular file' }
  if (st.size > MAX_BYTES) return { error: `larger than ${MAX_BYTES} bytes` }
  try {
    return { json: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e) {
    return { error: `not JSON (${String(e.message).split('\n')[0]})` }
  }
}

const row = (id, status, reason, detail) => ({ id, status, reason: oneLine(reason, 140).replaceAll('|', '/'), detail })

/** Rows for a report that is absent or unreadable: one row per id, so the gate count does not depend on the file. */
function unusable(ids, rep, file, what) {
  const r = rep.missing ? row('', NOT_RUN, `${what} not found`, file) : row('', FAIL, `${what} unreadable: ${rep.error}`, file)
  return ids.map((id) => ({ ...r, id }))
}

export function auditRows(runRoot) {
  const file = path.join(runRoot, 'port-audit.json')
  const rep = readReport(file)
  if (!rep.json) return unusable(['port-audit'], rep, file, 'port-audit.json')
  const a = rep.json
  if (!isObj(a) || !isObj(a.checks) || typeof a.ok !== 'boolean' || !Number.isInteger(a.blocking) || !isObj(a.receipt))
    return [row('port-audit', FAIL, 'invalid report: needs ok, blocking, checks and a receipt', file)]
  const advisories = isObj(a.advisories) ? Object.entries(a.advisories).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`) : []
  const note = advisories.length ? `; advisories (do not block a fix release): ${advisories.join(' ')}` : ''
  if (a.ok === true && a.blocking === 0) return [row('port-audit', PASS, `clean, scope ${a.receipt.scope ?? '?'}${note}`, file)]
  const bad = Object.entries(a.checks).filter(([, c]) => isObj(c) && c.ok !== true).map(([n]) => n)
  return [row('port-audit', FAIL, `${a.blocking} blocking check(s): ${bad.join(', ') || 'see report'}${note}`, file)]
}

export function verifyRows(file) {
  const dir = path.dirname(file)
  const rep = readReport(file)
  const modesOf = (m) => (m === 'both' ? ['fast', 'full'] : m === 'fast' || m === 'full' ? [m] : null)
  const modes = rep.json && isObj(rep.json) ? modesOf(rep.json.mode) : ['fast', 'full']
  if (!rep.json || !modes) {
    if (rep.json && !modes) return [row('verify', FAIL, 'invalid report: mode is not fast, full or both', file)]
    return unusable(['fast', 'full'].flatMap((m) => VERIFY_PHASES.map((p) => `verify.${m}.${p}`)), rep, file, 'verify.json')
  }
  const results = rep.json.results
  if (!isObj(results)) return [row('verify', FAIL, 'invalid report: results is not an object', file)]
  // verify.mjs rewrites the report after every phase with ok: null; only the finished run sets true / false
  const ok = rep.json.ok
  if (ok !== true && ok !== false && ok !== null) return [row('verify', FAIL, 'invalid report: ok is not true, false or null', file)]
  const unfinished = ok === null
  const rows = []
  const fastRed = Object.values(results.fast ?? {}).some((x) => isObj(x) && x.ok === false)
  for (const mode of modes) {
    const red = VERIFY_PHASES.map((p) => results[mode]?.[p]).some((r) => isObj(r) && r.ok === false)
    for (const phase of VERIFY_PHASES) {
      const id = `verify.${mode}.${phase}`
      const detail = path.join(dir, mode, VERIFY_DETAIL[phase])
      const r = results[mode]?.[phase]
      if (r === undefined) {
        // fast red stops the run; a phase after a red one never started
        rows.push(row(id, NOT_RUN, red ? `not run: an earlier ${mode} phase failed` : mode === 'full' && fastRed ? 'not run: fast is red' : 'not run', detail))
      } else if (!isObj(r) || typeof r.ok !== 'boolean') rows.push(row(id, FAIL, 'invalid report: phase result has no ok', file))
      else if (r.ok && unfinished) rows.push(row(id, NOT_RUN, 'report unfinished (verify.json ok is null): the run did not complete', detail))
      else if (r.ok) rows.push(row(id, PASS, r.summary ? JSON.stringify(r.summary) : 'ok', detail))
      else {
        const first = Array.isArray(r.failing) ? r.failing[0] : null
        rows.push(row(id, FAIL, `${Array.isArray(r.failing) ? r.failing.length : '?'} failing${first ? `; first: ${first.error ?? first.route ?? first.tool ?? ''}` : ''}`, detail))
      }
    }
  }
  return rows
}

export function fastGateRows(file) {
  const rep = readReport(file)
  if (!rep.json) return unusable(['fast-gate'], rep, file, 'FAST-GATE.json')
  const v = rep.json
  if (!isObj(v) || v.scope !== 'fast-gate' || !['pass', 'fail'].includes(v.status) || !Array.isArray(v.reasons))
    return [row('fast-gate', FAIL, 'invalid report: needs scope fast-gate, status pass|fail and reasons', file)]
  if (v.status === 'pass' && v.reasons.length === 0) return [row('fast-gate', PASS, 'pass (not visual acceptance, not a release receipt)', file)]
  return [row('fast-gate', FAIL, `${v.reasons.length} reason(s); first: ${v.reasons[0] ?? 'status is fail'}`, file)]
}

export function groupVerdictRows(file) {
  const rep = readReport(file)
  if (!rep.json) return unusable(['group-verdict'], rep, file, 'verdict.json')
  const v = rep.json
  if (!isObj(v) || !['done', 'open', 'incomplete'].includes(v.verdict) || !Array.isArray(v.incomplete) || !Array.isArray(v.open))
    return [row('group-verdict', FAIL, 'invalid report: needs verdict done|open|incomplete, incomplete[] and open[]', file)]
  if (v.verdict === 'done' && v.incomplete.length === 0 && v.open.length === 0) return [row('group-verdict', PASS, `done, group ${v.group ?? '?'}`, file)]
  if (v.verdict === 'incomplete') return [row('group-verdict', NOT_RUN, `incomplete: ${v.incomplete.length} gap(s); first: ${v.incomplete[0] ?? '?'}`, file)]
  const first = v.open[0]
  return [row('group-verdict', FAIL, `${v.verdict}: ${v.open.length} open; first: ${first?.id ?? first?.note ?? '?'}`, file)]
}

/** @returns {Array<{id: string, status: string, reason: string, detail: string}>} */
export function portChecks({ runRoot, verify = null, fastGate = null, groupVerdict = null }) {
  return [...auditRows(path.resolve(runRoot)), ...(verify ? verifyRows(path.resolve(verify)) : []), ...(fastGate ? fastGateRows(path.resolve(fastGate)) : []), ...(groupVerdict ? groupVerdictRows(path.resolve(groupVerdict)) : [])]
}

// the path is encoded (%XX for control characters, `%` and `|`) so a row keeps its four fields; decodeURIComponent restores it
export const formatRow = (r) => `${r.id} | ${r.status} | ${r.reason} | ${encodeField(r.detail, '|')}`

const isMain = process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  try {
    const a = parseStrict(process.argv.slice(2), { values: ['--run-root', '--verify', '--fast-gate', '--group-verdict', '--out'], flags: ['--json'] })
    if (!a.opt('--run-root')) throw new UsageError('usage: port-checks.mjs --run-root <dossier> [--verify verify.json] [--fast-gate FAST-GATE.json] [--group-verdict verdict.json] [--json] [--out rows.json]')
    const rows = portChecks({ runRoot: a.opt('--run-root'), verify: a.opt('--verify'), fastGate: a.opt('--fast-gate'), groupVerdict: a.opt('--group-verdict') })
    if (a.opt('--out'))
      writeResultFile(a.opt('--out'), { rows }, [path.resolve(a.opt('--run-root'), 'port-audit.json'), ...['--verify', '--fast-gate', '--group-verdict'].map((f) => a.opt(f)), ...rows.map((r) => r.detail)])
    if (a.flag('--json')) console.log(JSON.stringify({ rows }, null, 2))
    else for (const r of rows) console.log(formatRow(r))
    process.exitCode = rows.every((r) => r.status === PASS) ? 0 : 1
  } catch (e) {
    console.error(`port-checks: ${e.message}`)
    process.exitCode = 2
  }
}
