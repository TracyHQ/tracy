// run-record.mjs: the run record of a measured port. The summary must count parallel work once,
// keep waiting and idle time out of work, report open spans instead of closing them, and read time
// across midnight as plain elapsed time. The record is evidence: a bad argument, a rejected event,
// a lock already held or a failed append must leave its bytes as they were, and a truncated or
// hand-edited record must be refused, never repaired.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { machine, withHome } from './lib/test-root.mjs'
import { appendEvent, main, parseArgs, parseRecord, parseTime, peak, readSummary, RecordError, summarize, union } from '../run-record.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOL = path.resolve(HERE, '..', 'run-record.mjs')
const PROTOCOL = path.resolve(HERE, '..', '..', 'references', 'measurement-protocol.md')
let ROOT
let n = 0
const fresh = (name = 'run.jsonl') => {
  const dir = path.join(ROOT, `case-${++n}`)
  fs.mkdirSync(dir)
  return path.join(dir, name)
}
const T = (hms, day = '2026-09-28') => `${day}T${hms}Z`
const MIN = 60_000

before(() => {
  const base = process.env.THEME_PORT_TEST_ROOT || process.env.TRACY_RUN_RECORD_TEST_ROOT || tmpdir()
  fs.mkdirSync(base, { recursive: true })
  ROOT = fs.mkdtempSync(path.join(base, 'run-record-test-'))
})
after(() => fs.rmSync(ROOT, { recursive: true, force: true }))

/** Run the CLI in-process; returns { code, out, err }. */
function cli(...argv) {
  let out = ''
  let err = ''
  const code = main(argv, { stdout: { write: (s) => (out += s) }, stderr: { write: (s) => (err += s) } })
  return { code, out, err }
}
/** Record lines [cmd, at, extra] → JSONL text, seq filled in. */
function record(events) {
  return events.map(([cmd, at, extra], i) => `${JSON.stringify({ v: 1, seq: i + 1, at, cmd, ...extra })}\n`).join('')
}
const ph = (lane, phase) => ({ lane, phase })
const wt = (lane, reason) => ({ lane, reason })
const sum = (events, opts) => summarize(parseRecord(record(events)), opts)

// ── arithmetic ───────────────────────────────────────────────────────────────────────────────────

test('run-record summary: acquisition [0,10), build [5,15) and build on another lane [7,12) → acquisition 10, build 10, work 15, wall 15, peak 3', () => {
  const s = sum([
    ['start', T('10:00:00'), ph('main', 'acquisition')],
    ['start', T('10:05:00'), ph('b', 'build')],
    ['start', T('10:07:00'), ph('c', 'build')],
    ['end', T('10:10:00'), ph('main', 'acquisition')],
    ['end', T('10:12:00'), ph('c', 'build')],
    ['end', T('10:15:00'), ph('b', 'build')]
  ])
  assert.equal(s.unit, 'ms')
  assert.deepEqual(s.perPhaseMs, { acquisition: 10 * MIN, build: 10 * MIN })
  assert.equal(s.workMs, 15 * MIN)
  assert.equal(s.wallMs, 15 * MIN)
  assert.equal(s.peakConcurrency, 3)
  assert.equal(s.laneSumMs, 25 * MIN, 'the per-lane sum is the double-counted figure, kept apart from work')
  assert.deepEqual(s.perLaneMs, { main: 10 * MIN, b: 10 * MIN, c: 5 * MIN })
  assert.equal(s.parallelMs, 7 * MIN, '[5,12) has two or more phases open')
  assert.equal(s.idleMs, 0)
  assert.equal(s.status, 'complete')
  assert.equal(s.complete, true)
})

test('run-record summary: nested, touching and different-phase spans are never counted twice', () => {
  // qa [0,20) on main, qa [5,10) nested on b, review [20,30) touching on main, review [25,30) on b.
  const s = sum([
    ['start', T('10:00:00'), ph('main', 'qa')],
    ['start', T('10:05:00'), ph('b', 'qa')],
    ['end', T('10:10:00'), ph('b', 'qa')],
    ['end', T('10:20:00'), ph('main', 'qa')],
    ['start', T('10:20:00'), ph('main', 'review')],
    ['start', T('10:25:00'), ph('b', 'review')],
    ['end', T('10:30:00'), ph('main', 'review')],
    ['end', T('10:30:00'), ph('b', 'review')]
  ])
  assert.deepEqual(s.perPhaseMs, { qa: 20 * MIN, review: 10 * MIN })
  assert.equal(s.workMs, 30 * MIN)
  assert.equal(s.peakConcurrency, 2, 'an end and a start at the same instant do not overlap')
  assert.equal(s.parallelMs, 10 * MIN)
  assert.deepEqual(union([[0, 10], [10, 20], [3, 4], [30, 30]]), [[0, 20]])
  assert.equal(peak([[0, 10], [10, 20], [5, 5]]), 1)
})

test('run-record summary: zero-length spans count nothing and keep the summary complete', () => {
  const s = sum([
    ['start', T('10:00:00'), ph('main', 'ingest')],
    ['end', T('10:00:00'), ph('main', 'ingest')]
  ])
  assert.equal(s.workMs, 0)
  assert.equal(s.wallMs, 0)
  assert.equal(s.peakConcurrency, 0)
  assert.deepEqual(s.perPhaseMs, {})
  assert.equal(s.complete, true)
})

test('run-record summary: waiting that overlaps work on another lane is reported apart and does not grow the wall; idle is not work', () => {
  // build [0,10) on main; wait "restore-queue" [5,20) on b; nothing [20,25); a note at 25.
  const s = sum([
    ['start', T('09:00:00'), ph('main', 'build')],
    ['wait', T('09:05:00'), wt('b', 'restore-queue')],
    ['end', T('09:10:00'), ph('main', 'build')],
    ['wait-end', T('09:20:00'), wt('b', 'restore-queue')],
    ['note', T('09:25:00'), { text: 'closing' }]
  ])
  assert.equal(s.wallMs, 25 * MIN)
  assert.equal(s.workMs, 10 * MIN)
  assert.equal(s.waitingMs, 15 * MIN)
  assert.equal(s.waitingOverlapWorkMs, 5 * MIN)
  assert.equal(s.waitingOnlyMs, 10 * MIN)
  assert.deepEqual(s.waitReasonsMs, { 'restore-queue': 15 * MIN })
  assert.equal(s.idleMs, 5 * MIN)
  assert.equal(s.workMs + s.waitingOnlyMs + s.idleMs, s.wallMs)
  assert.equal(s.peakConcurrency, 1, 'waits are not concurrency of work')
  assert.equal(s.notes, 1)
})

test('run-record summary: open spans are listed and count nothing without --as-of; --as-of makes a provisional result', () => {
  const events = [
    ['start', T('10:00:00'), ph('main', 'build')],
    ['wait', T('10:02:00'), wt('b', 'stand boot')],
    ['start', T('10:03:00'), ph('c', 'qa')],
    ['end', T('10:04:00'), ph('c', 'qa')]
  ]
  const s = sum(events)
  assert.equal(s.status, 'incomplete')
  assert.equal(s.complete, false)
  assert.deepEqual(s.open, [
    { kind: 'phase', name: 'build', lane: 'main', since: T('10:00:00.000') },
    { kind: 'wait', name: 'stand boot', lane: 'b', since: T('10:02:00.000') }
  ])
  assert.equal(s.workMs, 1 * MIN, 'only the closed qa span')
  assert.equal(s.wallMs, 4 * MIN)
  const p = sum(events, { asOf: parseTime(T('10:10:00')) })
  assert.equal(p.status, 'provisional')
  assert.equal(p.complete, false)
  assert.equal(p.asOf, T('10:10:00.000'))
  assert.equal(p.wallMs, 10 * MIN)
  assert.deepEqual(p.perPhaseMs, { build: 10 * MIN, qa: 1 * MIN })
  assert.equal(p.workMs, 10 * MIN)
  assert.equal(p.waitingMs, 8 * MIN)
  assert.deepEqual(sum(events, { asOf: parseTime(T('10:10:00')) }), p, 'the same --as-of gives the same numbers')
  assert.throws(() => sum(events, { asOf: parseTime(T('10:03:59')) }), /before the last event/)
})

test('run-record summary: --as-of on a record with nothing open changes no number and keeps the wall at the last event', () => {
  const events = [
    ['start', T('10:00:00'), ph('main', 'build')],
    ['end', T('11:00:00'), ph('main', 'build')]
  ]
  const s = sum(events)
  const a = sum(events, { asOf: parseTime(T('12:00:00')) })
  assert.equal(a.status, 'complete')
  assert.equal(a.wallMs, 60 * MIN, 'the record ends at 11:00, not at the assumed 12:00')
  assert.equal(a.idleMs, 0)
  assert.deepEqual({ ...a, asOf: null }, s, 'only the echoed --as-of differs')
  assert.throws(() => sum(events, { asOf: parseTime(T('10:59:59')) }), /before the last event/)
})

test('run-record keys: lanes, reasons and commands named like Object.prototype members are data, never lookups', () => {
  // `constructor` is a valid lane; `__proto__`, `constructor`, `toString` are valid reasons.
  const s = sum([
    ['start', T('10:00:00'), ph('constructor', 'build')],
    ['wait', T('10:00:00'), wt('main', '__proto__')],
    ['wait-end', T('10:05:00'), wt('main', '__proto__')],
    ['wait', T('10:05:00'), wt('main', 'constructor')],
    ['wait-end', T('10:06:00'), wt('main', 'constructor')],
    ['wait', T('10:06:00'), wt('main', 'toString')],
    ['wait-end', T('10:08:00'), wt('main', 'toString')],
    ['end', T('10:10:00'), ph('constructor', 'build')]
  ])
  assert.equal(s.perLaneMs.constructor, 10 * MIN)
  assert.equal(s.laneSumMs, 10 * MIN)
  assert.deepEqual(Object.keys(s.waitReasonsMs), ['__proto__', 'constructor', 'toString'])
  assert.equal(Object.getOwnPropertyDescriptor(s.waitReasonsMs, '__proto__').value, 5 * MIN)
  assert.equal(s.waitReasonsMs.constructor, 1 * MIN)
  assert.equal(s.waitReasonsMs.toString, 2 * MIN)
  assert.match(JSON.stringify(s.waitReasonsMs), /"__proto__":300000/)
  for (const cmd of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.throws(() => parseRecord(record([[cmd, T('10:00:00'), ph('main', 'build')]])), (err) => err instanceof RecordError && /line 1: unknown cmd/.test(err.message), cmd)
    const r = cli('--file', fresh(), cmd, 'build')
    assert.equal(r.code, 2, cmd)
    assert.match(r.err, new RegExp(`unknown command "${cmd}"`))
  }
  const file = fresh()
  for (const argv of [
    ['--at', T('10:00:00'), '--lane', 'constructor', 'start', 'qa'],
    ['--at', T('10:00:00'), 'wait', '__proto__'],
    ['--at', T('10:03:00'), 'wait', '__proto__', '--end'],
    ['--at', T('10:04:00'), '--lane', 'constructor', 'end', 'qa']
  ]) assert.equal(cli('--file', file, ...argv).code, 0, argv.join(' '))
  const out = JSON.parse(cli('--file', file, 'summary').out)
  assert.deepEqual(out.perLaneMs, { constructor: 4 * MIN })
  assert.equal(Object.getOwnPropertyDescriptor(out.waitReasonsMs, '__proto__').value, 3 * MIN)
})

test('run-record summary: elapsed time across midnight, month end and year end is exact', () => {
  const s = sum([
    ['start', T('23:50:00', '2026-12-31'), ph('main', 'restore')],
    ['end', T('00:10:00.250', '2027-01-01'), ph('main', 'restore')]
  ])
  assert.equal(s.workMs, 20 * MIN + 250)
  assert.equal(s.wallMs, 20 * MIN + 250)
  assert.deepEqual(s.perPhaseMs, { restore: 20 * MIN + 250 })
  const m = sum([
    ['start', T('23:59:59.999', '2026-09-30'), ph('main', 'qa')],
    ['end', T('00:00:00.001', '2026-10-01'), ph('main', 'qa')]
  ])
  assert.equal(m.workMs, 2)
})

test('run-record summary: an empty record is empty and incomplete, never a completed run', () => {
  const s = summarize(parseRecord(''))
  assert.equal(s.status, 'empty')
  assert.equal(s.complete, false)
  assert.equal(s.wallMs, 0)
  assert.equal(s.first, null)
})

test('run-record timestamps: only canonical UTC instants are accepted', () => {
  assert.equal(parseTime('2026-09-28T10:00:00Z'), Date.UTC(2026, 8, 28, 10))
  assert.equal(parseTime('2026-09-28T10:00:00.123Z'), Date.UTC(2026, 8, 28, 10, 0, 0, 123))
  for (const bad of ['2026-09-28T10:00:00+07:00', '2026-09-28T10:00:00', '2026-09-28 10:00:00Z', '2026-02-30T10:00:00Z', '2026-09-28T24:00:00Z', '2026-09-28T10:00:00.1234Z', '2026-09-28T10:00:60Z', '1727517600', '', 42]) {
    assert.throws(() => parseTime(bad), RecordError, JSON.stringify(bad))
  }
})

// ── record validation ────────────────────────────────────────────────────────────────────────────

test('run-record replay: a record that does not parse or replay is refused with its line', () => {
  const ok = record([['start', T('10:00:00'), ph('main', 'build')]])
  const cases = [
    [ok.slice(0, -1), /does not end with a newline/],
    [ok.slice(0, 20) + '\n', /line 1: malformed JSON/],
    [ok + '\n', /line 2: blank line/],
    [ok.replace('"seq":1', '"seq":2'), /line 1: seq 2, expected 1/],
    [ok.replace('"v":1', '"v":2'), /line 1: version 2/],
    [ok.replace('"lane"', '"extra":1,"lane"'), /unexpected field "extra"/],
    [ok.replace('"build"', '"deploy"'), /phase must be one of/],
    [ok.replace('10:00:00Z', '10:00:00+00:00'), /line 1: at must be UTC/],
    ['[1]\n', /line 1: not a JSON object/],
    [record([['end', T('10:00:00'), ph('main', 'build')]]), /line 1: lane main has no open phase to close/],
    [record([['start', T('10:00:00'), ph('main', 'build')], ['start', T('10:01:00'), ph('main', 'qa')]]), /line 2: lane main is busy with phase "build"/],
    [record([['start', T('10:00:00'), ph('main', 'build')], ['end', T('10:01:00'), ph('main', 'qa')]]), /line 2: lane main has phase "build" open, not phase "qa"/],
    [record([['wait', T('10:00:00'), wt('main', 'a')], ['wait-end', T('10:01:00'), wt('main', 'b')]]), /wait "a" open, not wait "b"/],
    [record([['note', T('10:00:00'), { text: 'x' }], ['note', T('09:59:59'), { text: 'y' }]]), /line 2: time goes back/],
    [record([['note', T('10:00:00'), { text: 'x', data: [1] }]]), /data must be a JSON object/]
  ]
  for (const [text, re] of cases) assert.throws(() => parseRecord(text), (e) => e instanceof RecordError && re.test(e.message), `${re}`)
})

// ── CLI: arguments ───────────────────────────────────────────────────────────────────────────────

test('run-record arguments: every usage error is reported before the record is touched', () => {
  const file = fresh()
  fs.writeFileSync(file, record([['start', T('10:00:00'), ph('main', 'build')]]))
  const before = fs.readFileSync(file)
  const bad = [
    [[], /usage/],
    [['--file', file], /missing command/],
    [['--file', file, 'launch'], /unknown command "launch"/],
    [['start', 'build'], /--file is required/],
    [['--file', file, 'start'], /start needs a phase/],
    [['--file', file, 'start', 'deploy'], /phase must be one of/],
    [['--file', file, 'start', 'build', 'qa'], /unexpected argument "qa"/],
    [['--file', file, '--file', file, 'summary'], /--file given twice/],
    [['--file', file, '--lane', 'Main Lane', 'start', 'qa'], /lane must match/],
    [['--file', file, '--lane', 'x', 'note', 'hi'], /--lane does not apply to note/],
    [['--file', file, '--as-of', T('11:00:00'), 'start', 'qa'], /--as-of does not apply to start/],
    [['--file', file, '--end', 'start', 'qa'], /--end does not apply to start/],
    [['--file', file, '--data', '{}', 'wait', 'x'], /--data does not apply to wait/],
    [['--file', file, '--bogus', 'summary'], /unknown option "--bogus"/],
    [['--file', file, '--at', '2026-09-28 11:00', 'end', 'build'], /--at must be UTC/],
    [['--file', file, '--at'], /--at needs a value/],
    [['--file', file, 'wait', '  '], /reason must be a non-empty string/],
    [['--file', file, 'note', ''], /note text must be a non-empty string/],
    [['--file', file, 'note', 'x', '--data', '[1,2]'], /--data must be a JSON object/],
    [['--file', file, 'note', 'x', '--data', 'null'], /--data must be a JSON object/],
    [['--file', file, 'note', 'x', '--data', '{bad'], /--data is not JSON/],
    [['--file', file, 'summary', 'extra'], /unexpected argument "extra"/]
  ]
  for (const [argv, re] of bad) {
    const r = cli(...argv)
    assert.equal(r.code, 2, argv.join(' '))
    assert.match(r.err, re, argv.join(' '))
  }
  assert.deepEqual(fs.readFileSync(file), before)
  assert.equal(fs.existsSync(`${file}.lock`), false)
  assert.throws(() => parseArgs(['--file', file, 'note', '--data']), /--data needs a value/)
})

// ── CLI: the five commands ───────────────────────────────────────────────────────────────────────

test('run-record CLI: start, end, wait, note and summary on a new file; summary leaves the bytes alone', () => {
  const file = fresh()
  const run = (...a) => {
    const r = cli('--file', file, ...a)
    assert.equal(r.code, 0, `${a.join(' ')}: ${r.err}`)
    return r
  }
  run('--at', T('10:00:00'), 'start', 'acquisition')
  run('--at', T('10:01:00'), '--lane', 'b', 'wait', 'source export')
  run('--at', T('10:05:00'), 'end', 'acquisition')
  run('--at', T('10:06:00'), '--lane', 'b', 'wait', 'source export', '--end')
  const text = 'first line\nsecond — Tiếng Việt ✓ `rm -rf /` $(whoami) ../../etc/passwd' // language-allow: data: non-ASCII text the record must keep
  const r = run('--at', T('10:07:00'), 'note', text, '--data', '{"freezeSha256":"ab12","counts":{"routes":43}}')
  assert.deepEqual(JSON.parse(r.out), { v: 1, seq: 5, at: T('10:07:00.000'), cmd: 'note', text, data: { freezeSha256: 'ab12', counts: { routes: 43 } } })
  run('note', '--', '--looks-like-a-flag')
  const bytes = fs.readFileSync(file)
  const lines = bytes.toString('utf8').split('\n')
  assert.equal(lines.length, 7, 'six events, one line each, trailing newline')
  assert.equal(JSON.parse(lines[4]).text, text, 'newline and Unicode kept verbatim inside one line')
  assert.equal(JSON.parse(lines[5]).text, '--looks-like-a-flag')
  const s = cli('--file', file, 'summary')
  assert.equal(s.code, 0, s.err)
  const out = JSON.parse(s.out)
  assert.equal(out.status, 'complete')
  assert.deepEqual(out.perPhaseMs, { acquisition: 5 * MIN })
  assert.equal(out.waitingMs, 5 * MIN)
  assert.equal(out.waitingOverlapWorkMs, 4 * MIN)
  assert.equal(out.notes, 2)
  assert.deepEqual(fs.readFileSync(file), bytes)
  assert.equal(fs.existsSync(`${file}.lock`), false)
})

test('run-record CLI: without --at the time is read at append; open spans exit 1 and --as-of reports provisional', () => {
  const file = fresh()
  const t0 = Date.now()
  assert.equal(cli('--file', file, 'start', 'build').code, 0)
  const at = Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).at)
  assert.ok(at >= t0 - 1 && at <= Date.now(), 'the stored time is the time of the append')
  const s = cli('--file', file, 'summary')
  assert.equal(s.code, 1)
  assert.equal(JSON.parse(s.out).status, 'incomplete')
  assert.match(s.err, /open: main\/phase build/)
  const future = new Date(at + 60_000).toISOString()
  const p = cli('--file', file, 'summary', '--as-of', future)
  assert.equal(p.code, 1)
  assert.equal(JSON.parse(p.out).status, 'provisional')
  assert.equal(JSON.parse(p.out).perPhaseMs.build, 60_000)
})

test('run-record CLI: missing and empty files — a mutation creates the record, summary never reports a completed run', () => {
  const file = fresh()
  const miss = cli('--file', file, 'summary')
  assert.equal(miss.code, 2)
  assert.match(miss.err, /does not exist/)
  assert.equal(fs.existsSync(file), false)
  const bad = cli('--file', file, '--at', T('10:00:00'), 'end', 'build')
  assert.equal(bad.code, 2)
  assert.match(bad.err, /no open phase/)
  assert.equal(fs.existsSync(file), false, 'a rejected first event creates no file')
  fs.writeFileSync(file, '')
  const empty = cli('--file', file, 'summary')
  assert.equal(empty.code, 1)
  assert.equal(JSON.parse(empty.out).status, 'empty')
  assert.equal(cli('--file', file, '--at', T('10:00:00'), 'start', 'build').code, 0)
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).seq, 1)
  const nodir = cli('--file', path.join(ROOT, 'no-such-dir', 'run.jsonl'), 'start', 'build')
  assert.equal(nodir.code, 2)
  assert.match(nodir.err, /does not exist/)
})

test('run-record CLI: rejected events leave the prefix byte for byte', () => {
  const file = fresh()
  assert.equal(cli('--file', file, '--at', T('10:00:00'), 'start', 'build').code, 0)
  assert.equal(cli('--file', file, '--at', T('10:01:00'), '--lane', 'b', 'wait', 'queue').code, 0)
  const before = fs.readFileSync(file)
  const rejected = [
    [['--at', T('10:02:00'), 'start', 'qa'], /lane main is busy with phase "build"/],
    [['--at', T('10:02:00'), 'wait', 'x'], /lane main is busy/],
    [['--at', T('10:02:00'), 'end', 'qa'], /phase "build" open, not phase "qa"/],
    [['--at', T('10:02:00'), '--lane', 'c', 'end', 'build'], /lane c has no open phase/],
    [['--at', T('10:02:00'), '--lane', 'b', 'wait', 'other', '--end'], /wait "queue" open, not wait "other"/],
    [['--at', T('10:02:00'), '--lane', 'b', 'start', 'qa'], /lane b is busy with wait "queue"/],
    [['--at', T('10:00:59'), 'note', 'late'], /time goes back/]
  ]
  for (const [argv, re] of rejected) {
    const r = cli('--file', file, ...argv)
    assert.equal(r.code, 2, argv.join(' '))
    assert.match(r.err, re)
  }
  assert.deepEqual(fs.readFileSync(file), before)
  assert.equal(fs.existsSync(`${file}.lock`), false)
})

test('run-record CLI: a truncated or hand-edited record is refused by every command and left as it is', () => {
  const file = fresh()
  const good = record([['start', T('10:00:00'), ph('main', 'build')], ['end', T('10:05:00'), ph('main', 'build')]])
  for (const broken of [good.slice(0, -7), good.replace('"seq":2', '"seq":3'), good + '{"v":1,']) {
    fs.writeFileSync(file, broken)
    for (const argv of [['summary'], ['--at', T('10:06:00'), 'note', 'x'], ['--at', T('10:06:00'), 'start', 'qa']]) {
      const r = cli('--file', file, ...argv)
      assert.equal(r.code, 2, argv.join(' '))
      assert.match(r.err, /invalid record|does not end with a newline/)
      assert.equal(fs.readFileSync(file, 'utf8'), broken)
    }
  }
})

test('run-record CLI: bytes that are not UTF-8 are refused even when the replacement keeps the byte count', () => {
  const file = fresh()
  const good = Buffer.from(record([['note', T('10:00:00'), { text: 'X' }]]))
  const at = good.indexOf('"X"') + 1
  // F0 9F 98 is a 4-byte sequence cut after 3 bytes: a lenient decoder gives one U+FFFD, also 3 bytes.
  const cut = Buffer.concat([good.subarray(0, at), Buffer.from([0xf0, 0x9f, 0x98]), good.subarray(at + 1)])
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), good])
  for (const broken of [cut, bom]) {
    fs.writeFileSync(file, broken)
    for (const argv of [['summary'], ['--at', T('10:06:00'), 'note', 'x']]) {
      const r = cli('--file', file, ...argv)
      assert.equal(r.code, 2, argv.join(' '))
      assert.match(r.err, broken === cut ? /is not valid UTF-8/ : /invalid record at line 1/)
      assert.deepEqual(fs.readFileSync(file), broken)
    }
  }
})

test('run-record CLI: --help and -h ask for help only before `--`; after it they are data', () => {
  const file = fresh()
  for (const argv of [['--help'], ['-h'], ['--file', file, 'summary', '--help'], ['--file', file, '-h', 'note', 'x']]) {
    const r = cli(...argv)
    assert.equal(r.code, 0, argv.join(' '))
    assert.match(r.out, /^usage: run-record\.mjs/)
  }
  assert.equal(fs.existsSync(file), false, 'help writes nothing')
  assert.equal(cli('--file', file, '--at', T('10:00:00'), 'note', '--', '--help').code, 0)
  assert.equal(cli('--file', file, '--at', T('10:00:00'), 'wait', '--', '-h').code, 0)
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(lines.map((e) => [e.cmd, e.text ?? e.reason]), [['note', '--help'], ['wait', '-h']])
})

// ── the file: kinds, lock, faults ────────────────────────────────────────────────────────────────

test('run-record file kinds: symlink, directory and FIFO are refused before any read that could block', { timeout: 10_000 }, () => {
  const file = fresh()
  const target = path.join(path.dirname(file), 'real.jsonl')
  fs.writeFileSync(target, record([['start', T('10:00:00'), ph('main', 'build')]]))
  fs.symlinkSync(target, file)
  for (const argv of [['summary'], ['--at', T('10:01:00'), 'end', 'build']]) {
    const r = cli('--file', file, ...argv)
    assert.equal(r.code, 2)
    assert.match(r.err, /symlink/)
  }
  const dir = fresh()
  fs.mkdirSync(dir)
  for (const argv of [['summary'], ['note', 'x']]) {
    const r = cli('--file', dir, ...argv)
    assert.equal(r.code, 2)
    assert.match(r.err, /directory/)
  }
  const fifo = fresh()
  const mk = spawnSync('mkfifo', [fifo])
  if (mk.status === 0) {
    for (const argv of [['summary'], ['note', 'x']]) {
      const r = cli('--file', fifo, ...argv)
      assert.equal(r.code, 2)
      assert.match(r.err, /FIFO/)
    }
  }
  const dev = cli('--file', '/dev/null', 'summary')
  assert.equal(dev.code, 2, 'a device, or its directory refusing the lock')
  assert.equal(fs.readFileSync(target, 'utf8'), record([['start', T('10:00:00'), ph('main', 'build')]]))
})

test('run-record lock: a held lock is reported (exit 3), never taken over, and the record is not touched', () => {
  const file = fresh()
  assert.equal(cli('--file', file, '--at', T('10:00:00'), 'start', 'build').code, 0)
  const before = fs.readFileSync(file)
  fs.writeFileSync(`${file}.lock`, 'pid 999999 since 2026-09-28T09:00:00.000Z\n')
  for (const argv of [['summary'], ['--at', T('10:01:00'), 'end', 'build']]) {
    const r = cli('--file', file, ...argv)
    assert.equal(r.code, 3)
    assert.match(r.err, /is held \(pid 999999/)
  }
  assert.equal(fs.readFileSync(`${file}.lock`, 'utf8'), 'pid 999999 since 2026-09-28T09:00:00.000Z\n', 'the stale lock stays for a person to judge')
  assert.deepEqual(fs.readFileSync(file), before)
  fs.symlinkSync(path.join(ROOT, 'elsewhere'), `${file}.lock2`)
  fs.unlinkSync(`${file}.lock`)
  fs.renameSync(`${file}.lock2`, `${file}.lock`)
  assert.equal(cli('--file', file, 'summary').code, 3, 'a symlinked lock is held, not followed')
  assert.equal(fs.existsSync(path.join(ROOT, 'elsewhere')), false)
  fs.unlinkSync(`${file}.lock`)
  assert.equal(cli('--file', file, '--at', T('10:01:00'), 'end', 'build').code, 0)
})

test('run-record lock: concurrent writers serialize — no event lost, no interleaved line', { timeout: 30_000 }, async () => {
  const file = fresh()
  const writers = 8
  const once = (i) =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [TOOL, '--file', file, '--lane', `w${i}`, 'wait', `writer ${i}`], { stdio: ['ignore', 'pipe', 'pipe'] })
      const kill = setTimeout(() => p.kill('SIGKILL'), 10_000)
      p.on('error', reject)
      p.on('close', (code) => {
        clearTimeout(kill)
        resolve(code)
      })
    })
  const retry = async (i) => {
    for (let k = 0; k < 200; k++) {
      const code = await once(i)
      if (code === 0) return
      if (code !== 3) throw new Error(`writer ${i} exited ${code}`)
      await new Promise((r) => setTimeout(r, 5 + ((i * 7 + k) % 11)))
    }
    throw new Error(`writer ${i} never got the lock`)
  }
  await Promise.all(Array.from({ length: writers }, (_, i) => retry(i)))
  const state = parseRecord(fs.readFileSync(file, 'utf8'))
  assert.equal(state.events, writers)
  assert.deepEqual([...state.lanes.keys()].sort(), Array.from({ length: writers }, (_, i) => `w${i}`).sort())
  assert.equal(fs.existsSync(`${file}.lock`), false)
})

test('run-record faults: short writes complete the line; a failed append or fsync fails loudly and nothing is repaired', () => {
  const file = fresh()
  assert.equal(cli('--file', file, '--at', T('10:00:00'), 'start', 'build').code, 0)
  const chunked = { ...fs, writeSync: (fd, buf, off = 0, len = buf.length) => (typeof buf === 'string' ? fs.writeSync(fd, buf) : fs.writeSync(fd, buf, off, Math.min(3, len))) }
  appendEvent(file, { cmd: 'end', lane: 'main', phase: 'build' }, { at: parseTime(T('10:01:00')), io: chunked })
  assert.equal(parseRecord(fs.readFileSync(file, 'utf8')).events, 2)
  const before = fs.readFileSync(file)
  let calls = 0
  const dies = {
    ...fs,
    writeSync: (fd, buf, off = 0, len = buf.length) => {
      if (typeof buf === 'string') return fs.writeSync(fd, buf)
      if (++calls === 1) return fs.writeSync(fd, buf, off, 10)
      throw Object.assign(new Error('no space'), { code: 'ENOSPC' })
    }
  }
  assert.throws(() => appendEvent(file, { cmd: 'note', text: 'lost' }, { at: parseTime(T('10:02:00')), io: dies }), /append to .* failed \(ENOSPC\).*invalid evidence/)
  const after = fs.readFileSync(file)
  assert.deepEqual(after.subarray(0, before.length), before, 'the prefix is intact')
  assert.equal(after.length, before.length + 10, 'the partial tail is left for inspection, not truncated')
  assert.equal(fs.existsSync(`${file}.lock`), false)
  const r = cli('--file', file, 'summary')
  assert.equal(r.code, 2)
  assert.match(r.err, /does not end with a newline/)
  assert.deepEqual(fs.readFileSync(file), after)

  const file2 = fresh()
  const noSync = { ...fs, fsyncSync: () => { throw Object.assign(new Error('io'), { code: 'EIO' }) } }
  assert.throws(() => appendEvent(file2, { cmd: 'note', text: 'x' }, { at: parseTime(T('10:00:00')), io: noSync }), /failed \(EIO\)/)
  const noRead = { ...fs, readSync: () => { throw Object.assign(new Error('io'), { code: 'EIO' }) } }
  assert.throws(() => readSummary(file2, { io: noRead }), /cannot read .*EIO/)
  assert.equal(fs.existsSync(`${file2}.lock`), false)
})

test('run-record permissions: an unreadable record or a read-only directory fails without a number', { skip: process.getuid?.() === 0 && 'root reads everything' }, () => {
  const file = fresh()
  assert.equal(cli('--file', file, '--at', T('10:00:00'), 'start', 'build').code, 0)
  fs.chmodSync(file, 0o000)
  try {
    const r = cli('--file', file, 'summary')
    assert.equal(r.code, 2)
    assert.match(r.err, /cannot open .*EACCES/)
    assert.equal(r.out, '')
  } finally {
    fs.chmodSync(file, 0o644)
  }
  const dir = path.dirname(file)
  fs.chmodSync(dir, 0o555)
  try {
    const r = cli('--file', file, '--at', T('10:01:00'), 'end', 'build')
    assert.equal(r.code, 2)
    assert.match(r.err, /cannot open .*\.lock: EACCES/)
  } finally {
    fs.chmodSync(dir, 0o755)
  }
})

// ── the protocol's example ───────────────────────────────────────────────────────────────────────

test('run-record protocol: the example commands in measurement-protocol.md run as written and give the stated totals', () => {
  const doc = fs.readFileSync(PROTOCOL, 'utf8')
  const block = /<!-- run-record example -->\n```bash\n([\s\S]*?)```/.exec(doc)
  assert.ok(block, 'the protocol carries the example block')
  const file = fresh()
  const lines = block[1].split('\n').filter((l) => l.startsWith('node scripts/run-record.mjs'))
  assert.ok(lines.length >= 5)
  for (const l of lines) {
    const argv = [...l.matchAll(/'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2]).slice(2)
    const i = argv.indexOf('--file')
    argv[i + 1] = file
    const r = cli(...argv)
    assert.ok(r.code === 0 || (argv.includes('summary') && r.code === 1), `${l}: ${r.err}`)
  }
  const s = readSummary(file)
  const stated = /<!-- run-record totals: (\{.*\}) -->/.exec(doc)
  assert.ok(stated, 'the protocol states the totals of its example')
  const want = JSON.parse(stated[1])
  for (const [k, v] of Object.entries(want)) assert.deepEqual(s[k], v, k)
})

test('run-record note: a path in the text or the data is recorded without the machine\'s layout; other events and words are left alone', () => {
  const m = machine()
  const file = path.join(m.dossier, 'run.jsonl')
  const report = path.join(m.data, 'evidence', 'pilot-2.json')
  const cwd = process.cwd()
  try {
    process.chdir(m.root)
    withHome(m.home, () => {
      const r = cli('--file', file, '--at', T('10:00:00'), 'note', `pilot on ${m.dossier}/attempts/site/design-contract.json — ok`, '--data', JSON.stringify({ origin: 'measured', report, nested: { logs: [`${m.home}/data/site/a.log`, 'plain'] }, sha256: 'ab12' }))
      assert.equal(r.code, 0, r.err)
      assert.equal(cli('--file', file, '--at', T('10:01:00'), 'start', 'acquisition').code, 0)
    })
  } finally {
    process.chdir(cwd)
  }
  const bytes = fs.readFileSync(file, 'utf8')
  assert.ok(!bytes.includes(m.home), 'the record names the home directory')
  const [note] = bytes.trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(note.text, 'pilot on tasks/site/attempts/site/design-contract.json — ok')
  assert.deepEqual(note.data, { origin: 'measured', report: '~/data/site/evidence/pilot-2.json', nested: { logs: ['~/data/site/a.log', 'plain'] }, sha256: 'ab12' })
  // a record written by an older tool, with absolute paths in it, still parses and replays
  const legacy = fresh()
  fs.writeFileSync(legacy, record([['note', T('09:00:00'), { text: 'x', data: { report: '/srv/legacy/data/site/evidence/pilot-2.json' } }]]))
  const s = cli('--file', legacy, 'summary')
  assert.equal(s.code, 0, s.err)
  assert.equal(JSON.parse(s.out).notes, 1)
})
