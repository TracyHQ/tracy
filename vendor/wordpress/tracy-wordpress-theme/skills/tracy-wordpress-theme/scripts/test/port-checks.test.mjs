// port-checks.mjs: one line per selected gate, read from the reports the gates wrote. A PASS needs the recorded success;
// missing or unfinished evidence is NOT-RUN, an unreadable report or an unsuccessful verdict is FAIL; nothing is measured.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { cleanAudit } from './lib/finish-audit.mjs'
import { portChecks, formatRow, PASS, FAIL, NOT_RUN } from '../port-checks.mjs'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'port-checks.mjs')
const write = (file, v) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v))
  return file
}
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]))
const phase = (ok, extra = {}) => ({ ok, seconds: 1, summary: ok ? { routes: 3 } : null, failing: ok ? [] : [{ route: '/a', targetPath: '/a' }], ...extra })

test('port-audit: clean is PASS, blocking is FAIL naming the checks, patch advisories stay visible, a missing or malformed report is never PASS', () => {
  const dir = testDir('port-checks-audit')
  assert.deepEqual(portChecks({ runRoot: dir }).map((r) => [r.id, r.status]), [['port-audit', NOT_RUN]])
  cleanAudit({ dossier: dir, routes: ['/'], runs: [dir], pages: ['/'] })
  const clean = portChecks({ runRoot: dir })
  assert.deepEqual(clean.map((r) => [r.id, r.status]), [['port-audit', PASS]])
  assert.equal(clean[0].detail, path.join(dir, 'port-audit.json'))

  const report = JSON.parse(readFileSync(path.join(dir, 'port-audit.json'), 'utf8'))
  write(path.join(dir, 'port-audit.json'), { ...report, ok: false, blocking: 1, checks: { ...report.checks, 'cms-leftovers': { ok: false } } })
  const bad = portChecks({ runRoot: dir })[0]
  assert.equal(bad.status, FAIL)
  assert.match(bad.reason, /1 blocking check\(s\): cms-leftovers/)

  write(path.join(dir, 'port-audit.json'), { ...report, advisories: { decisions: 2, exceptions: 0 } })
  const adv = portChecks({ runRoot: dir })[0]
  assert.equal(adv.status, PASS)
  assert.match(adv.reason, /advisories \(do not block a fix release\): decisions=2$/)

  write(path.join(dir, 'port-audit.json'), '{"ok": true')
  assert.equal(portChecks({ runRoot: dir })[0].status, FAIL)
  write(path.join(dir, 'port-audit.json'), { ok: true, blocking: 0, checks: {} })
  assert.match(portChecks({ runRoot: dir })[0].reason, /invalid report/, 'no receipt, no PASS')
  write(path.join(dir, 'port-audit.json'), { ...report, blocking: 'none' })
  assert.equal(portChecks({ runRoot: dir })[0].status, FAIL)
})

test('verify.json: fast and full are separate rows; a red fast leaves full NOT-RUN; unfinished phases are NOT-RUN; malformed is FAIL', () => {
  const dir = testDir('port-checks-verify')
  const file = path.join(dir, 'ev', 'verify.json')
  const rows = (v) => {
    write(file, v)
    return byId(portChecks({ runRoot: dir, verify: file }).filter((r) => r.id.startsWith('verify')))
  }
  const green = rows({ mode: 'both', ok: true, results: { fast: { parity: phase(true), scan: phase(true), shoot: phase(true) }, full: { parity: phase(true), scan: phase(true), shoot: phase(true) } } })
  assert.equal(Object.keys(green).length, 6)
  assert.ok(Object.values(green).every((r) => r.status === PASS))
  assert.equal(green['verify.fast.parity'].detail, path.join(dir, 'ev', 'fast', 'http-parity.json'))
  assert.equal(green['verify.full.scan'].detail, path.join(dir, 'ev', 'full', 'review', 'scanners.json'))
  assert.equal(green['verify.full.shoot'].detail, path.join(dir, 'ev', 'full', 'shots', 'index.json'))

  const red = rows({ mode: 'both', ok: false, results: { fast: { parity: phase(false) } } })
  assert.equal(red['verify.fast.parity'].status, FAIL)
  assert.match(red['verify.fast.parity'].reason, /^1 failing; first: \/a$/)
  assert.equal(red['verify.fast.scan'].status, NOT_RUN)
  assert.match(red['verify.fast.scan'].reason, /earlier fast phase failed/)
  assert.match(red['verify.full.parity'].reason, /fast is red/)

  const unfinished = rows({ mode: 'full', ok: null, results: { full: { parity: phase(true) } } })
  assert.deepEqual(Object.keys(unfinished), ['verify.full.parity', 'verify.full.scan', 'verify.full.shoot'], 'only the selected mode')
  assert.deepEqual(Object.values(unfinished).map((r) => r.status), [NOT_RUN, NOT_RUN, NOT_RUN], 'ok: null is an unfinished run — a phase that passed so far is not a verification')
  assert.match(unfinished['verify.full.parity'].reason, /unfinished/)
  // a finished run with a red phase keeps its green phases as rows of their own
  const finishedRed = rows({ mode: 'full', ok: false, results: { full: { parity: phase(true), scan: phase(false), shoot: phase(true) } } })
  assert.deepEqual(Object.values(finishedRed).map((r) => r.status), [PASS, FAIL, PASS])
  assert.equal(rows({ mode: 'fast', ok: 'yes', results: { fast: {} } }).verify.status, FAIL)

  assert.equal(rows({ mode: 'sometimes', results: {} })['verify'].status, FAIL)
  assert.equal(rows({ mode: 'fast', ok: null, results: { fast: { parity: { seconds: 1 } } } })['verify.fast.parity'].status, FAIL)
  assert.equal(rows({ mode: 'fast', ok: true, results: [] })['verify'].status, FAIL)
  const missing = byId(portChecks({ runRoot: dir, verify: path.join(dir, 'nope.json') }).filter((r) => r.id.startsWith('verify')))
  assert.equal(Object.keys(missing).length, 6)
  assert.ok(Object.values(missing).every((r) => r.status === NOT_RUN))
})

test('fast-gate and group-verdict: only done / pass is PASS; open is FAIL, incomplete is NOT-RUN, an unknown shape is FAIL', () => {
  const dir = testDir('port-checks-verdicts')
  const fg = path.join(dir, 'FAST-GATE.json')
  const gv = path.join(dir, 'verdict.json')
  const one = (opts) => portChecks({ runRoot: dir, ...opts }).find((r) => r.id !== 'port-audit')
  assert.equal(one({ fastGate: fg }).status, NOT_RUN)
  write(fg, { scope: 'fast-gate', status: 'pass', reasons: [] })
  assert.equal(one({ fastGate: fg }).status, PASS)
  write(fg, { scope: 'fast-gate', status: 'fail', reasons: ['stage dark: fail', 'stale: 2 page(s)'] })
  assert.match(one({ fastGate: fg }).reason, /^2 reason\(s\); first: stage dark: fail$/)
  write(fg, { scope: 'fast-gate', status: 'pass', reasons: ['but a reason'] })
  assert.equal(one({ fastGate: fg }).status, FAIL, 'a pass with reasons is not a pass')
  write(fg, { status: 'pass' })
  assert.equal(one({ fastGate: fg }).status, FAIL)

  write(gv, { verdict: 'done', group: 'g1', incomplete: [], open: [] })
  assert.equal(one({ groupVerdict: gv }).status, PASS)
  write(gv, { verdict: 'open', group: 'g1', incomplete: [], open: [{ id: 'C-1', note: 'x' }] })
  assert.equal(one({ groupVerdict: gv }).status, FAIL)
  write(gv, { verdict: 'incomplete', group: 'g1', incomplete: ['parity: no run'], open: [] })
  const inc = one({ groupVerdict: gv })
  assert.equal(inc.status, NOT_RUN)
  assert.match(inc.reason, /first: parity: no run/)
  write(gv, { verdict: 'done', incomplete: ['x'], open: [] })
  assert.equal(one({ groupVerdict: gv }).status, FAIL, 'done with a recorded gap is not a pass')
  write(gv, { verdict: 'maybe', incomplete: [], open: [] })
  assert.equal(one({ groupVerdict: gv }).status, FAIL)
})

test('rows are one bounded physical line: control characters in report text are flattened', () => {
  const dir = testDir('port-checks-line')
  const fg = write(path.join(dir, 'FAST-GATE.json'), { scope: 'fast-gate', status: 'fail', reasons: [`line one\nline two\u001b[31m ${'x'.repeat(500)} | pipe`] })
  const row = portChecks({ runRoot: dir, fastGate: fg }).find((r) => r.id === 'fast-gate')
  const line = formatRow(row)
  assert.equal(line.split('\n').length, 1)
  assert.ok(row.reason.length <= 140)
  assert.doesNotMatch(row.reason, /[\u001b|]/)
})

test('CLI: one line per gate, exit 0 only when every selected gate passes, 1 otherwise, 2 for usage; reads, never writes', () => {
  const dir = testDir('port-checks-cli')
  cleanAudit({ dossier: dir, routes: ['/'], runs: [dir], pages: ['/'] })
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  const before = readdirSync(dir).sort()
  const ok = run('--run-root', dir)
  assert.deepEqual(readdirSync(dir).sort(), before, 'nothing is written without --out')
  assert.equal(ok.status, 0)
  assert.equal(ok.stdout, `port-audit | PASS | ${ok.stdout.split(' | ')[2]} | ${path.join(dir, 'port-audit.json')}\n`)
  const fg = write(path.join(dir, 'FAST-GATE.json'), { scope: 'fast-gate', status: 'fail', reasons: ['r'] })
  const mixed = run('--run-root', dir, '--fast-gate', fg)
  assert.equal(mixed.status, 1)
  assert.deepEqual(mixed.stdout.trim().split('\n').map((l) => l.split(' | ')[1]), ['PASS', 'FAIL'])
  const notRun = run('--run-root', dir, '--group-verdict', path.join(dir, 'missing.json'))
  assert.equal(notRun.status, 1)
  assert.match(notRun.stdout, /group-verdict \| NOT-RUN \| verdict\.json not found \|/)
  // the result file is never a report the command read or selected
  for (const target of [path.join(dir, 'port-audit.json'), fg]) {
    const before = readFileSync(target, 'utf8')
    const refused = run('--run-root', dir, '--fast-gate', fg, '--out', target)
    assert.equal(refused.status, 2, target)
    assert.match(refused.stderr, /must not replace it/)
    assert.equal(readFileSync(target, 'utf8'), before)
  }
  // a path with a newline or the separator keeps the four-field row
  const odd = write(path.join(dir, 'odd|na\nme', 'FAST-GATE.json'), { scope: 'fast-gate', status: 'pass', reasons: [] })
  const oddRun = run('--run-root', dir, '--fast-gate', odd)
  const oddLines = oddRun.stdout.trim().split('\n')
  assert.equal(oddLines.length, 2)
  const cells = oddLines[1].split(' | ')
  assert.equal(cells.length, 4)
  assert.equal(decodeURIComponent(cells[3]), odd)
  const out = path.join(dir, 'rows.json')
  const json = run('--run-root', dir, '--fast-gate', fg, '--json', '--out', out)
  assert.deepEqual(JSON.parse(json.stdout), JSON.parse(readFileSync(out, 'utf8')))
  assert.equal(JSON.parse(json.stdout).rows.length, 2)
  for (const bad of [[], ['--verify'], ['--run-root', dir, '--bogus', 'x'], ['--run-root', dir, 'extra']]) assert.equal(run(...bad).status, 2, JSON.stringify(bad))
})
