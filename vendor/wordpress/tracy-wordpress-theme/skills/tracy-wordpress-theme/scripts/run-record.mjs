#!/usr/bin/env node
// Run record of a measured port: an append-only JSONL file of phase spans, waits and notes, and a
// summary that turns it into totals without counting parallel work twice.
//
//   node scripts/run-record.mjs --file <run.jsonl> [--lane L] [--at T] start <phase>
//   node scripts/run-record.mjs --file <run.jsonl> [--lane L] [--at T] end <phase>
//   node scripts/run-record.mjs --file <run.jsonl> [--lane L] [--at T] wait <reason> [--end]
//   node scripts/run-record.mjs --file <run.jsonl> [--at T] note <text> [--data <JSON object>]
//   node scripts/run-record.mjs --file <run.jsonl> summary [--as-of T]
//
// Phases are the fixed list PHASES. A lane is one stream of work (default `main`); a lane holds at
// most one open phase or wait, and nothing is closed or switched implicitly. `wait` needs an idle
// lane; `wait <reason> --end` closes that wait. T is a UTC timestamp `YYYY-MM-DDTHH:MM:SS[.sss]Z`;
// without --at the time is read while the lock is held. Timestamps never go back in a record.
//
// Every mutation takes `<file>.lock` (O_EXCL), reads and validates the whole record, appends one
// complete line and fsyncs; summary takes the same lock so it never reads a half-written line. A
// lock already there is reported (exit 3) and left alone: the caller retries, or removes it after
// confirming its holder is gone. A record that does not parse — a truncated tail, a bad sequence,
// an event the replay rejects — is invalid evidence: every command refuses it and nothing repairs
// it. Spans are half-open [start, end) in milliseconds. Summary: per-phase time is the union of the
// phase's spans over all lanes, work the union of every phase span, waiting the union of waits
// (split into the part that overlaps work and the part that does not), idle the rest of the wall.
// Open spans are listed and make the summary incomplete; they count only up to an explicit --as-of.
// Exit 0: done / complete summary; 1: summary printed but incomplete (open spans or empty record);
// 2: usage error, unreadable or invalid record, rejected event; 3: lock held. Protocol:
// references/measurement-protocol.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordData, recordText, repoRootOf } from './lib/record-paths.mjs'

const VERSION = 1
const PHASES = ['acquisition', 'restore', 'ingest', 'build', 'qa', 'review', 'tool-repair']
const DEFAULT_LANE = 'main'
const LANE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{3})?Z$/
const MAX_TEXT = 4000
const MAX_RECORD = 64 * 1024 * 1024

export class RecordError extends Error {
  constructor(message, code = 2) {
    super(message)
    this.code = code
  }
}

/** A canonical UTC timestamp → ms since epoch; anything else (offsets, µs, 24:00, Feb 30) throws. */
export function parseTime(s, what = 'timestamp') {
  const m = typeof s === 'string' ? TIME_RE.exec(s) : null
  if (!m) throw new RecordError(`${what} must be UTC YYYY-MM-DDTHH:MM:SS[.sss]Z, got ${JSON.stringify(s)}`)
  const ms = Date.parse(s)
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? '.000'}Z`) {
    throw new RecordError(`${what} ${JSON.stringify(s)} is not a real UTC instant`)
  }
  return ms
}

// ── the event shapes ─────────────────────────────────────────────────────────────────────────────

const FIELDS = {
  start: ['lane', 'phase'],
  end: ['lane', 'phase'],
  wait: ['lane', 'reason'],
  'wait-end': ['lane', 'reason'],
  note: ['text', 'data']
}
const BASE = ['v', 'seq', 'at', 'cmd']

function checkText(v, what) {
  if (typeof v !== 'string' || v.trim() === '') throw new RecordError(`${what} must be a non-empty string`)
  if (v.length > MAX_TEXT) throw new RecordError(`${what} is longer than ${MAX_TEXT} characters`)
  return v
}
function checkLane(v) {
  if (typeof v !== 'string' || !LANE_RE.test(v)) throw new RecordError(`lane must match ${LANE_RE}, got ${JSON.stringify(v)}`)
  return v
}
function checkPhase(v) {
  if (!PHASES.includes(v)) throw new RecordError(`phase must be one of ${PHASES.join(', ')}, got ${JSON.stringify(v)}`)
  return v
}
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** One parsed line → the event, or a RecordError naming what is wrong with it. */
function checkEvent(e) {
  if (!isPlainObject(e)) throw new RecordError('not a JSON object')
  if (e.v !== VERSION) throw new RecordError(`version ${JSON.stringify(e.v)}, this tool reads ${VERSION}`)
  const fields = typeof e.cmd === 'string' && Object.hasOwn(FIELDS, e.cmd) ? FIELDS[e.cmd] : null
  if (!fields) throw new RecordError(`unknown cmd ${JSON.stringify(e.cmd)}`)
  for (const k of Object.keys(e)) if (!BASE.includes(k) && !fields.includes(k)) throw new RecordError(`unexpected field ${JSON.stringify(k)}`)
  if (!Number.isSafeInteger(e.seq) || e.seq < 1) throw new RecordError(`seq ${JSON.stringify(e.seq)} is not a positive integer`)
  parseTime(e.at, 'at')
  if (e.cmd === 'note') {
    checkText(e.text, 'text')
    if (Object.hasOwn(e, 'data') && !isPlainObject(e.data)) throw new RecordError('data must be a JSON object')
  } else {
    checkLane(e.lane)
    if (e.cmd === 'start' || e.cmd === 'end') checkPhase(e.phase)
    else checkText(e.reason, 'reason')
  }
  return e
}

// ── replay ───────────────────────────────────────────────────────────────────────────────────────

/** Apply one event to the replay state (lanes, spans, clock), or throw why it cannot follow. */
function apply(state, e) {
  const t = parseTime(e.at, 'at')
  if (state.last !== null && t < state.last) throw new RecordError(`time goes back: ${e.at} is before the previous event at ${new Date(state.last).toISOString()}`)
  if (state.first === null) state.first = t
  state.last = t
  if (e.cmd === 'note') {
    state.notes++
    return
  }
  const open = state.lanes.get(e.lane)
  if (e.cmd === 'start' || e.cmd === 'wait') {
    if (open) throw new RecordError(`lane ${e.lane} is busy with ${open.kind} ${JSON.stringify(open.name)} since ${new Date(open.start).toISOString()}`)
    const span = { kind: e.cmd === 'start' ? 'phase' : 'wait', name: e.cmd === 'start' ? e.phase : e.reason, lane: e.lane, start: t, end: null }
    state.lanes.set(e.lane, span)
    state.spans.push(span)
    return
  }
  const kind = e.cmd === 'end' ? 'phase' : 'wait'
  const name = e.cmd === 'end' ? e.phase : e.reason
  if (!open) throw new RecordError(`lane ${e.lane} has no open ${kind} to close`)
  if (open.kind !== kind || open.name !== name) throw new RecordError(`lane ${e.lane} has ${open.kind} ${JSON.stringify(open.name)} open, not ${kind} ${JSON.stringify(name)}`)
  open.end = t
  state.lanes.delete(e.lane)
}

function emptyState() {
  return { first: null, last: null, lanes: new Map(), spans: [], notes: 0, events: 0 }
}

/** Record bytes → validated events and replay state. Any flaw rejects the whole record, by line. */
export function parseRecord(text) {
  const state = emptyState()
  if (text === '') return state
  if (!text.endsWith('\n')) throw new RecordError('record does not end with a newline: the last line is truncated or was written by hand')
  const lines = text.slice(0, -1).split('\n')
  lines.forEach((line, i) => {
    const where = `line ${i + 1}`
    let e
    try {
      if (line.trim() === '') throw new RecordError('blank line')
      try {
        e = JSON.parse(line)
      } catch (err) {
        throw new RecordError(`malformed JSON (${err.message})`)
      }
      checkEvent(e)
      if (e.seq !== i + 1) throw new RecordError(`seq ${e.seq}, expected ${i + 1}`)
      apply(state, e)
    } catch (err) {
      if (err instanceof RecordError) throw new RecordError(`invalid record at ${where}: ${err.message}`)
      throw err
    }
    state.events++
  })
  return state
}

// ── interval arithmetic ──────────────────────────────────────────────────────────────────────────

/** [start, end) intervals → sorted, disjoint, non-empty union. */
export function union(intervals) {
  const xs = intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const out = []
  for (const [a, b] of xs) {
    const top = out[out.length - 1]
    if (top && a <= top[1]) top[1] = Math.max(top[1], b)
    else out.push([a, b])
  }
  return out
}
const length = (u) => u.reduce((n, [a, b]) => n + (b - a), 0)
/** Length of the overlap of two unions. */
function overlap(u, w) {
  let n = 0
  let i = 0
  let j = 0
  while (i < u.length && j < w.length) {
    const a = Math.max(u[i][0], w[j][0])
    const b = Math.min(u[i][1], w[j][1])
    if (b > a) n += b - a
    if (u[i][1] < w[j][1]) i++
    else j++
  }
  return n
}
/** Highest number of intervals active at one instant; an end and a start at the same instant do not overlap. */
export function peak(intervals) {
  const edges = []
  for (const [a, b] of intervals) if (b > a) edges.push([a, 1], [b, -1])
  edges.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  let cur = 0
  let top = 0
  for (const [, d] of edges) top = Math.max(top, (cur += d))
  return top
}

/**
 * Replay state → totals in ms. Without asOf an open span adds nothing and the summary is
 * incomplete; with asOf (≥ the last event) open spans run to asOf and the summary is provisional.
 * asOf only closes open spans: a record with none keeps its wall at the last event.
 */
export function summarize(state, { asOf = null } = {}) {
  if (asOf !== null && state.last !== null && asOf < state.last) {
    throw new RecordError(`--as-of ${new Date(asOf).toISOString()} is before the last event at ${new Date(state.last).toISOString()}`)
  }
  const open = state.spans.filter((s) => s.end === null)
  const endOf = (s) => (s.end !== null ? s.end : asOf)
  const counted = state.spans.filter((s) => endOf(s) !== null)
  const iv = (xs) => xs.map((s) => [s.start, endOf(s)])
  const phases = counted.filter((s) => s.kind === 'phase')
  const waits = counted.filter((s) => s.kind === 'wait')
  const work = union(iv(phases))
  const waiting = union(iv(waits))
  const wallEnd = state.last === null ? null : open.length && asOf !== null ? asOf : state.last
  const wallMs = state.first === null ? 0 : wallEnd - state.first
  // Keys are lanes and reasons a person typed (`constructor`, `__proto__`): counted in Maps and
  // turned into own properties, never looked up on a plain object.
  const perPhase = new Map()
  for (const p of PHASES) {
    const u = union(iv(phases.filter((s) => s.name === p)))
    if (u.length) perPhase.set(p, length(u))
  }
  const perLane = new Map()
  for (const s of phases) perLane.set(s.lane, (perLane.get(s.lane) ?? 0) + (endOf(s) - s.start))
  const waitReasons = new Map()
  for (const r of new Set(waits.map((s) => s.name))) waitReasons.set(r, length(union(iv(waits.filter((s) => s.name === r)))))
  const workMs = length(work)
  const waitingMs = length(waiting)
  const waitingOverlapWorkMs = overlap(waiting, work)
  const active = union([...work, ...waiting])
  return {
    status: state.events === 0 ? 'empty' : open.length ? (asOf !== null ? 'provisional' : 'incomplete') : 'complete',
    complete: state.events > 0 && open.length === 0,
    events: state.events,
    notes: state.notes,
    first: state.first === null ? null : new Date(state.first).toISOString(),
    last: state.last === null ? null : new Date(state.last).toISOString(),
    asOf: asOf === null ? null : new Date(asOf).toISOString(),
    unit: 'ms',
    wallMs,
    workMs,
    perPhaseMs: Object.fromEntries(perPhase),
    laneSumMs: [...perLane.values()].reduce((a, b) => a + b, 0),
    perLaneMs: Object.fromEntries(perLane),
    parallelMs: length(union(parallelIntervals(iv(phases)))),
    peakConcurrency: peak(iv(phases)),
    waitingMs,
    waitingOverlapWorkMs,
    waitingOnlyMs: waitingMs - waitingOverlapWorkMs,
    waitReasonsMs: Object.fromEntries(waitReasons),
    idleMs: wallMs - length(active),
    open: open.map((s) => ({ kind: s.kind, name: s.name, lane: s.lane, since: new Date(s.start).toISOString() }))
  }
}

/** Stretches where two or more intervals are active. */
function parallelIntervals(intervals) {
  const edges = []
  for (const [a, b] of intervals) if (b > a) edges.push([a, 1], [b, -1])
  edges.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const out = []
  let cur = 0
  let from = null
  for (const [t, d] of edges) {
    cur += d
    if (cur >= 2 && from === null) from = t
    else if (cur < 2 && from !== null) {
      out.push([from, t])
      from = null
    }
  }
  return out
}

// ── the file: lock, safe open, read, append ──────────────────────────────────────────────────────

const C = fs.constants
const NOFOLLOW = C.O_NOFOLLOW ?? 0
const NONBLOCK = C.O_NONBLOCK ?? 0
// fatal: a malformed sequence is an error, not U+FFFD; ignoreBOM: a BOM stays and fails JSON.parse.
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function describe(st) {
  if (st.isDirectory()) return 'a directory'
  if (st.isFIFO()) return 'a FIFO'
  if (st.isCharacterDevice() || st.isBlockDevice()) return 'a device'
  if (st.isSocket()) return 'a socket'
  return 'not a regular file'
}

function openErr(err, file) {
  if (err.code === 'ELOOP' || err.code === 'EMLINK') return new RecordError(`${file} is a symlink; the record must be a regular file`)
  if (err.code === 'EISDIR') return new RecordError(`${file} is a directory`)
  if (err.code === 'ENOENT') return new RecordError(`${path.dirname(file)} does not exist`)
  return new RecordError(`cannot open ${file}: ${err.code ?? err.message}`)
}

/** Open without following a symlink or blocking on a FIFO, then insist on a regular file. null when missing. */
function openRecord(io, file, flags) {
  let fd
  try {
    fd = io.openSync(file, flags | NOFOLLOW | NONBLOCK)
  } catch (err) {
    if (err.code === 'ENOENT' && !(flags & C.O_CREAT) && fs.existsSync(path.dirname(file))) return null
    throw openErr(err, file)
  }
  const st = io.fstatSync(fd)
  if (!st.isFile()) {
    io.closeSync(fd)
    throw new RecordError(`${file} is ${describe(st)}; the record must be a regular file`)
  }
  return fd
}

function readAll(io, fd, file) {
  const size = io.fstatSync(fd).size
  if (size > MAX_RECORD) throw new RecordError(`${file} is larger than ${MAX_RECORD} bytes`)
  const buf = Buffer.alloc(size)
  let got = 0
  try {
    while (got < size) {
      const n = io.readSync(fd, buf, got, size - got, got)
      if (n === 0) break
      got += n
    }
  } catch (err) {
    throw new RecordError(`cannot read ${file}: ${err.code ?? err.message}`)
  }
  if (got !== size) throw new RecordError(`${file} changed size while it was read (${got} of ${size} bytes)`)
  try {
    return UTF8.decode(buf)
  } catch {
    throw new RecordError(`${file} is not valid UTF-8`)
  }
}

/** Run fn while holding `<file>.lock`. An existing lock is never taken over. */
function withLock(file, fn, io = fs) {
  const lock = `${file}.lock`
  let fd
  try {
    fd = io.openSync(lock, C.O_WRONLY | C.O_CREAT | C.O_EXCL | NOFOLLOW, 0o644)
  } catch (err) {
    if (err.code === 'EEXIST') {
      let holder = ''
      try {
        if (fs.lstatSync(lock).isFile()) holder = fs.readFileSync(lock, 'utf8').trim()
      } catch {}
      throw new RecordError(`${lock} is held${holder ? ` (${holder})` : ''}; retry, or remove it after confirming that process is gone`, 3)
    }
    throw openErr(err, lock)
  }
  try {
    io.writeSync(fd, `pid ${process.pid} since ${new Date().toISOString()}\n`)
    io.closeSync(fd)
  } catch (err) {
    io.unlinkSync(lock)
    throw new RecordError(`cannot write ${lock}: ${err.code ?? err.message}`)
  }
  try {
    return fn()
  } finally {
    io.unlinkSync(lock)
  }
}

/** Read and replay the record under the lock. Missing file → null. */
function loadRecord(file, io = fs) {
  const fd = openRecord(io, file, C.O_RDONLY)
  if (fd === null) return null
  try {
    return parseRecord(readAll(io, fd, file))
  } finally {
    io.closeSync(fd)
  }
}

function writeFully(io, fd, buf) {
  let off = 0
  while (off < buf.length) {
    const n = io.writeSync(fd, buf, off, buf.length - off)
    if (!(n > 0)) throw new Error(`write returned ${n}`)
    off += n
  }
}

/**
 * Validate `fields` against the record and append it as the next line. Returns the event written.
 * `at` null → the time now, read under the lock.
 */
export function appendEvent(file, fields, { at = null, io = fs, now = () => Date.now() } = {}) {
  return withLock(
    file,
    () => {
      let fd = openRecord(io, file, C.O_RDWR | C.O_APPEND)
      try {
        const state = fd === null ? emptyState() : parseRecord(readAll(io, fd, file))
        const ms = at ?? now()
        const event = { v: VERSION, seq: state.events + 1, at: new Date(ms).toISOString(), ...fields }
        checkEvent(event)
        apply(state, event)
        const line = Buffer.from(`${JSON.stringify(event)}\n`)
        if (fd === null) fd = openRecord(io, file, C.O_RDWR | C.O_APPEND | C.O_CREAT | C.O_EXCL)
        try {
          writeFully(io, fd, line)
          io.fsyncSync(fd)
        } catch (err) {
          throw new RecordError(`append to ${file} failed (${err.code ?? err.message}); the record may now end in a partial line and is invalid evidence until inspected`)
        }
        return event
      } finally {
        if (fd !== null) io.closeSync(fd)
      }
    },
    io
  )
}

export function readSummary(file, { asOf = null, io = fs } = {}) {
  return withLock(
    file,
    () => {
      const state = loadRecord(file, io)
      if (state === null) throw new RecordError(`${file} does not exist: no run recorded`)
      return summarize(state, { asOf })
    },
    io
  )
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────

const USAGE = [
  'usage: run-record.mjs --file <run.jsonl> [--lane L] [--at T] start <phase>',
  '       run-record.mjs --file <run.jsonl> [--lane L] [--at T] end <phase>',
  '       run-record.mjs --file <run.jsonl> [--lane L] [--at T] wait <reason> [--end]',
  '       run-record.mjs --file <run.jsonl> [--at T] note <text> [--data <JSON object>]',
  '       run-record.mjs --file <run.jsonl> summary [--as-of T]',
  `phases: ${PHASES.join(' ')} · T: UTC YYYY-MM-DDTHH:MM:SS[.sss]Z · \`--\` ends the options`
].join('\n')
const VALUED = ['--file', '--lane', '--at', '--data', '--as-of']
const ALLOWED = {
  start: ['--file', '--lane', '--at'],
  end: ['--file', '--lane', '--at'],
  wait: ['--file', '--lane', '--at', '--end'],
  note: ['--file', '--at', '--data'],
  summary: ['--file', '--as-of']
}

/**
 * argv → { cmd, arg, file, ... }, or { help: true } for `--help` / `-h` before `--` (after it they
 * are data); every problem is a RecordError before any file is touched.
 */
export function parseArgs(argv) {
  const o = {}
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      pos.push(...argv.slice(i + 1))
      break
    }
    if (a === '--help' || a === '-h') return { help: true }
    if (a.startsWith('--')) {
      if (!VALUED.includes(a) && a !== '--end') throw new RecordError(`unknown option ${JSON.stringify(a)}`)
      if (Object.hasOwn(o, a)) throw new RecordError(`${a} given twice`)
      if (a === '--end') {
        o[a] = true
        continue
      }
      const v = argv[i + 1]
      if (v === undefined || v === '' || v.startsWith('--')) throw new RecordError(`${a} needs a value`)
      o[a] = v
      i++
    } else pos.push(a)
  }
  const [cmd, ...rest] = pos
  if (!cmd) throw new RecordError('missing command')
  if (!Object.hasOwn(ALLOWED, cmd)) throw new RecordError(`unknown command ${JSON.stringify(cmd)}`)
  for (const k of Object.keys(o)) if (!ALLOWED[cmd].includes(k)) throw new RecordError(`${k} does not apply to ${cmd}`)
  if (!o['--file']) throw new RecordError('--file is required')
  const want = cmd === 'summary' ? 0 : 1
  if (rest.length < want) throw new RecordError(`${cmd} needs ${cmd === 'note' ? 'a text' : cmd === 'wait' ? 'a reason' : 'a phase'}`)
  if (rest.length > want) throw new RecordError(`unexpected argument ${JSON.stringify(rest[want])}`)
  const out = { cmd, file: path.resolve(o['--file']) }
  if (o['--at']) out.at = parseTime(o['--at'], '--at')
  if (o['--as-of']) out.asOf = parseTime(o['--as-of'], '--as-of')
  const lane = checkLane(o['--lane'] ?? DEFAULT_LANE)
  if (cmd === 'start' || cmd === 'end') out.fields = { cmd, lane, phase: checkPhase(rest[0]) }
  else if (cmd === 'wait') out.fields = { cmd: o['--end'] ? 'wait-end' : 'wait', lane, reason: checkText(rest[0], 'reason') }
  else if (cmd === 'note') {
    // a note is kept with the dossier: a path in its text or data is written as lib/record-paths.mjs writes one
    const paths = { repoRoot: repoRootOf(out.file) }
    out.fields = { cmd, text: recordText(checkText(rest[0], 'note text'), paths) }
    if (o['--data'] !== undefined) {
      let data
      try {
        data = JSON.parse(o['--data'])
      } catch (err) {
        throw new RecordError(`--data is not JSON (${err.message})`)
      }
      if (!isPlainObject(data)) throw new RecordError('--data must be a JSON object')
      out.fields.data = recordData(data, paths)
    }
  }
  return out
}

export function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    if (argv.length === 0) {
      stderr.write(`${USAGE}\n`)
      return 2
    }
    let a
    try {
      a = parseArgs(argv)
    } catch (err) {
      if (err instanceof RecordError) err.usage = true
      throw err
    }
    if (a.help) {
      stdout.write(`${USAGE}\n`)
      return 0
    }
    if (a.cmd === 'summary') {
      const s = readSummary(a.file, { asOf: a.asOf ?? null })
      stdout.write(`${JSON.stringify(s, null, 2)}\n`)
      if (!s.complete) stderr.write(`run-record: summary is ${s.status}${s.open.length ? ` — open: ${s.open.map((x) => `${x.lane}/${x.kind} ${x.name}`).join(', ')}` : ''}\n`)
      return s.complete ? 0 : 1
    }
    const e = appendEvent(a.file, a.fields, { at: a.at ?? null })
    stdout.write(`${JSON.stringify(e)}\n`)
    return 0
  } catch (err) {
    if (!(err instanceof RecordError)) throw err
    stderr.write(`run-record: ${err.message}\n`)
    if (err.usage) stderr.write(`${USAGE}\n`)
    return err.code
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exitCode = main(process.argv.slice(2))
