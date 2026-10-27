// The publication of a sweep (site-sweep-publish.mjs): the reports of --out, the snapshot and the history entry, as one transaction.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_CHECKS } from '../visual/site-sweep.mjs'
import { HistoryError, STATE_FILE, entryAfter, keyOf, readState, resolveEntry } from '../visual/site-sweep-scope.mjs'
import { EVIDENCE_DIR, Interrupted, OUTPUT_NAMES, PublishError, publish, publishState, settleOutput } from '../visual/site-sweep-publish.mjs'
import { IDENTITY, KEY, at, docOf, fullScope, group, rec, record, storedOf } from './lib/sweep-history-fixture.mjs'

const PUBLISH = fileURLToPath(new URL('../visual/site-sweep-publish.mjs', import.meta.url))
const tmps = []
after(() => {
  for (const t of tmps) {
    try {
      chmodSync(t, 0o755)
    } catch {
      // already gone
    }
    rmSync(t, { recursive: true, force: true })
  }
})
const tmp = () => {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), 'sweep-publish-')))
  tmps.push(d)
  return d
}

// ---- a dossier with a history, an --out with the reports of its first run, and the stage of the next one ----------------------

const reports = (gen) => ({ 'site-sweep.json': `json-${gen}`, 'site-sweep.md': `md-${gen}`, 'summary.md': `summary-${gen}`, 'summary.json': `sj-${gen}`, 'fix-measure.json': `fix-${gen}` })
const stageOf = (out, gen, only = null) => {
  const stage = mkdtempSync(path.join(out, '.sweep-stage-'))
  for (const [n, t] of Object.entries(reports(gen))) if (!only || only.includes(n)) writeFileSync(path.join(stage, n), t)
  return stage
}
const evidencePath = (runRoot, name) => path.join(runRoot, EVIDENCE_DIR, KEY, name)
/** The entry a run of generation `n` publishes: the first is full, the rest scoped; every check is clean. */
const entryFor = (runRoot, n, name) => {
  const previous = existsSync(path.join(runRoot, STATE_FILE)) ? resolveEntry(readState(runRoot).doc.runs[KEY]) : null
  const ranAt = `t${String(n).padStart(3, '0')}`
  const out = evidencePath(runRoot, name)
  const mode = n === 1 ? 'full' : 'scoped'
  const first = previous?.full ?? { ranAt, out, mode }
  const run = { ...record({ ranAt, mode, out, exit: 0 }), ...(mode === 'scoped' ? { scope: { ...fullScope(), checks: ['overflow'] } } : {}) }
  const checks = Object.fromEntries(ALL_CHECKS.map((id) => [id, rec(id, {}, id === 'overflow' || n === 1 ? at(ranAt, out, mode) : at(first.ranAt, first.out, 'full'))]))
  return entryAfter({ previous, identity: IDENTITY, record: run, merged: { checks }, exit: 0 })
}
const args = (w, n, o = {}) => {
  const name = `run-${n}`
  const stage = stageOf(w.out, n, o.only)
  return { out: w.out, stage, drop: o.drop ?? (o.only ? ['fix-measure.json'] : []), history: o.noHistory ? null : { runRoot: w.runRoot, key: KEY, expectedRevision: o.expectedRevision ?? revision(w.runRoot), entry: entryFor(w.runRoot, n, name) }, evidence: o.noHistory ? null : (o.evidence ?? name), lockWaitMs: 200, ...(o.step ? { step: o.step } : {}) }
}
const revision = (runRoot) => (existsSync(path.join(runRoot, STATE_FILE)) ? (readState(runRoot).doc.runs[KEY]?.revision ?? 0) : 0)
/** A dossier that has published its first run (generation 1, revision 1). */
const world = () => {
  const w = { out: tmp(), runRoot: tmp() }
  writeFileSync(path.join(w.out, 'keep.txt'), 'mine')
  publish(args(w, 1))
  return w
}
const files = (dir) => Object.fromEntries(readdirSync(dir).filter((n) => OUTPUT_NAMES.includes(n)).sort().map((n) => [n, readFileSync(path.join(dir, n), 'utf8')]))
const evidences = (runRoot) => (existsSync(path.join(runRoot, EVIDENCE_DIR, KEY)) ? readdirSync(path.join(runRoot, EVIDENCE_DIR, KEY)).sort() : [])
const leftovers = (dir) => readdirSync(dir).filter((n) => n.startsWith('.sweep-') && !n.startsWith('.sweep-stage-') && n !== '.sweep-out.lock')
const stages = (dir) => readdirSync(dir).filter((n) => n.startsWith('.sweep-stage-'))
/** What the dossier is: generation of the reports, revision of the history, its snapshots, nothing left over. */
const state = (w) => ({ files: files(w.out), revision: revision(w.runRoot), evidence: evidences(w.runRoot), leftovers: leftovers(w.out), keep: readFileSync(path.join(w.out, 'keep.txt'), 'utf8'), locks: [...readdirSync(w.runRoot).filter((n) => n.endsWith('.lock') || n === '.sweep-pending.json'), ...readdirSync(w.out).filter((n) => n === '.sweep-out.lock')] })
const GEN1 = (extra = {}) => ({ files: reports(1), revision: 1, evidence: ['run-1'], leftovers: [], keep: 'mine', locks: [], ...extra })
const GEN2 = () => ({ files: reports(2), revision: 2, evidence: ['run-1', 'run-2'], leftovers: [], keep: 'mine', locks: [] })

test('publish: the reports replace those of --out, the snapshot holds them, the history advances; what is not a report stays, nothing is left over', () => {
  const w = world()
  assert.deepEqual(state(w), GEN1())
  assert.equal(readFileSync(path.join(evidencePath(w.runRoot, 'run-1'), 'summary.md'), 'utf8'), 'summary-1')
  const done = publish(args(w, 2))
  assert.deepEqual(done.warnings, [])
  assert.deepEqual(state(w), GEN2())
  assert.equal(readFileSync(path.join(evidencePath(w.runRoot, 'run-2'), 'site-sweep.json'), 'utf8'), 'json-2')
  assert.equal(readFileSync(path.join(evidencePath(w.runRoot, 'run-1'), 'site-sweep.json'), 'utf8'), 'json-1')
  assert.equal(readState(w.runRoot).doc.runs[KEY].latest, 't002')
})

test('publish: a generation without fix-measure.json takes the old one away; a run with no history publishes through the journal alone', () => {
  const w = world()
  publish(args(w, 2, { only: ['site-sweep.json', 'site-sweep.md', 'summary.md', 'summary.json'] }))
  assert.equal(existsSync(path.join(w.out, 'fix-measure.json')), false)
  assert.equal(existsSync(path.join(evidencePath(w.runRoot, 'run-2'), 'fix-measure.json')), false)
  const explicit = publish(args(w, 3, { noHistory: true }))
  assert.deepEqual(explicit, { warnings: [], written: null })
  assert.deepEqual([files(w.out), leftovers(w.out), revision(w.runRoot), evidences(w.runRoot)], [reports(3), [], 2, ['run-1', 'run-2']])
})

// every boundary of the transaction, once as an error and once as a process that stops there
const STEPS = (() => {
  const w = world()
  const seen = []
  publish(args(w, 2, { step: (s) => seen.push(s) }))
  return seen
})()

test('publish: the boundaries of the transaction are the ones the recovery is tested at', () => {
  assert.deepEqual(STEPS.slice(0, 2), ['journal', 'evidence'])
  assert.deepEqual(STEPS.slice(-2), ['installed', 'committed'])
  assert.deepEqual(STEPS.slice(2, -2).sort(), OUTPUT_NAMES.flatMap((n) => [`aside:${n}`, `install:${n}`]).sort())
})

test('publish: an error at any step before the commit puts the whole old generation back — reports, snapshot, history', () => {
  for (const at of STEPS.filter((s) => s !== 'committed')) {
    const w = world()
    assert.throws(() => publish(args(w, 2, { step: (s) => { if (s === at) throw new Error(`disk full at ${s}`) } })), (e) => e instanceof PublishError && new RegExp(`disk full at ${at}`).test(e.message), at)
    assert.deepEqual(state(w), GEN1(), at)
    assert.deepEqual(stages(w.out), [], at)
  }
})

test('publish: a process that stops at any step leaves a journal; the next reader or writer finishes it forward after the commit and back before it', () => {
  for (const at of STEPS) {
    const w = world()
    assert.throws(() => publish(args(w, 2, { step: (s) => { if (s === at) throw new Interrupted(s) } })), Interrupted, at)
    assert.equal(existsSync(path.join(w.out, '.sweep-txn.json')), true, at)
    // a reader settles first
    settleOutput(w.out)
    assert.deepEqual(state(w), at === 'committed' ? GEN2() : GEN1(), at)
    assert.deepEqual(stages(w.out), [], at)
    // and the next writer goes on from there
    publish(args(w, 3))
    assert.equal(revision(w.runRoot), at === 'committed' ? 3 : 2, at)
    assert.deepEqual(leftovers(w.out), [], at)
    assert.equal(files(w.out)['site-sweep.json'], 'json-3', at)
  }
  // a writer finds the journal itself
  for (const at of ['journal', 'installed', 'committed']) {
    const w = world()
    assert.throws(() => publish(args(w, 2, { step: (s) => { if (s === at) throw new Interrupted(s) } })), Interrupted)
    publish(args(w, 3, { expectedRevision: at === 'committed' ? 2 : 1 }))
    assert.deepEqual([files(w.out)['site-sweep.json'], leftovers(w.out), revision(w.runRoot)], ['json-3', [], at === 'committed' ? 3 : 2], at)
  }
  // a run with no history is committed by its journal
  for (const at of ['installed', 'committed']) {
    const w = world()
    assert.throws(() => publish(args(w, 2, { noHistory: true, step: (s) => { if (s === at) throw new Interrupted(s) } })), Interrupted)
    settleOutput(w.out)
    assert.deepEqual([files(w.out), leftovers(w.out)], [at === 'committed' ? reports(2) : reports(1), []], at)
  }
})

test('publish: a writer that started from an older revision is refused before anything is replaced, and cannot touch what the winner published', () => {
  const w = world()
  const a = args(w, 2)
  const b = args(w, 2, { evidence: 'run-b' })
  publish(b)
  const after = state(w)
  assert.throws(() => publish(a), (e) => e instanceof HistoryError && /history revision 2, this run started from 1/.test(e.message))
  assert.deepEqual(state(w), after)
  rmSync(a.stage, { recursive: true })
  assert.equal(files(w.out)['site-sweep.json'], 'json-2')
  assert.equal(existsSync(evidencePath(w.runRoot, 'run-2')), false, 'the refused run created no snapshot')
  assert.equal(existsSync(path.join(w.out, '.sweep-txn.json')), false)
  // the same with two outs of one history
  const other = tmp()
  writeFileSync(path.join(other, 'keep.txt'), 'other')
  const late = { out: other, runRoot: w.runRoot }
  assert.throws(() => publish({ ...args(late, 3, { expectedRevision: 1 }) }), HistoryError)
  assert.deepEqual([files(other), leftovers(other)], [{}, []])
  // two outs, two histories: each keeps its own; the out they share ends with the last, whole
  const w2 = { out: w.out, runRoot: tmp() }
  publish(args(w2, 1, { expectedRevision: 0 }))
  assert.deepEqual([files(w.out), revision(w2.runRoot), revision(w.runRoot), leftovers(w.out)], [reports(1), 1, 2, []])
  assert.equal(readFileSync(path.join(evidencePath(w.runRoot, 'run-b'), 'site-sweep.json'), 'utf8'), 'json-2', 'the evidence of the other history is as it was')
})

const child = (w, n, { sleepAt, evidence }) => {
  const file = path.join(tmp(), 'child.mjs')
  const a = args(w, n, { evidence })
  writeFileSync(file, `import { publish } from ${JSON.stringify(PUBLISH)}\nconst a = ${JSON.stringify({ ...a, lockWaitMs: 5000 })}\npublish({ ...a, step: (s) => { if (s === ${JSON.stringify(sleepAt)}) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 800) } })\n`)
  return spawn(process.execPath, [file], { stdio: 'inherit' })
}

test('publish: two writers at once are serialised by the locks; the one that started from the old revision is refused after waiting, the reports are the winner\'s', async () => {
  const w = world()
  const a = child(w, 2, { sleepAt: 'installed', evidence: 'run-a' })
  await new Promise((r) => setTimeout(r, 400))
  const t0 = Date.now()
  assert.throws(() => publish({ ...args(w, 2, { evidence: 'run-late', expectedRevision: 1 }), lockWaitMs: 5000 }), (e) => e instanceof HistoryError && /history revision 2, this run started from 1/.test(e.message))
  assert.ok(Date.now() - t0 >= 100, 'it waited for the winner')
  assert.equal(await new Promise((r) => a.on('close', r)), 0)
  assert.deepEqual([files(w.out), revision(w.runRoot), evidences(w.runRoot), leftovers(w.out).filter((n) => !n.startsWith('.sweep-stage-'))], [reports(2), 2, ['run-1', 'run-a'], []])
})

test('publish: a snapshot that exists is never replaced or removed; a link or file where its directories go is refused', () => {
  const w = world()
  mkdirSync(evidencePath(w.runRoot, 'run-2'))
  writeFileSync(path.join(evidencePath(w.runRoot, 'run-2'), 'precious.txt'), 'evidence')
  assert.throws(() => publish(args(w, 2)), PublishError)
  assert.equal(readFileSync(path.join(evidencePath(w.runRoot, 'run-2'), 'precious.txt'), 'utf8'), 'evidence')
  assert.deepEqual([files(w.out), revision(w.runRoot), leftovers(w.out)], [reports(1), 1, []])
  // the snapshot of the history is a link
  const v = world()
  const elsewhere = tmp()
  rmSync(path.join(v.runRoot, EVIDENCE_DIR), { recursive: true })
  symlinkSync(elsewhere, path.join(v.runRoot, EVIDENCE_DIR))
  assert.throws(() => publish(args(v, 2)), /is a symbolic link, not a directory: refused/)
  assert.deepEqual(readdirSync(elsewhere), [])
  assert.deepEqual([files(v.out), revision(v.runRoot), leftovers(v.out)], [reports(1), 1, []])
  // a file in the place of the directory of the key
  const x = world()
  rmSync(path.join(x.runRoot, EVIDENCE_DIR), { recursive: true })
  writeFileSync(path.join(x.runRoot, EVIDENCE_DIR), 'a file')
  assert.throws(() => publish(args(x, 2)), /is a file|not a directory/)
  assert.deepEqual([files(x.out), revision(x.runRoot)], [reports(1), 1])
})

test('publish: an output that is not a regular file, a stage that is not in --out, a report that is not one of the sweep, an --out inside the evidence are refused', () => {
  const w = world()
  for (const make of [(p) => mkdirSync(p), (p) => symlinkSync(tmp(), p), (p) => execFileSync('mkfifo', [p])]) {
    rmSync(path.join(w.out, 'summary.md'))
    make(path.join(w.out, 'summary.md'))
    assert.throws(() => publish(args(w, 2)), /summary\.md is a (directory|symbolic link|FIFO), not a regular file: refused/)
    rmSync(path.join(w.out, 'summary.md'), { recursive: true, force: true })
    writeFileSync(path.join(w.out, 'summary.md'), 'summary-1')
    assert.deepEqual([files(w.out), revision(w.runRoot), leftovers(w.out).filter((n) => !n.startsWith('.sweep-stage-'))], [reports(1), 1, []])
  }
  const outside = tmp()
  const stage = mkdtempSync(path.join(outside, '.sweep-stage-'))
  writeFileSync(path.join(stage, 'site-sweep.json'), 'x')
  assert.throws(() => publish({ ...args(w, 2), stage }), /is not a directory of/)
  const odd = mkdtempSync(path.join(w.out, '.sweep-stage-'))
  writeFileSync(path.join(odd, 'passwd'), 'x')
  assert.throws(() => publish({ ...args(w, 2), stage: odd }), /is not a report file of the sweep: refused/)
  assert.throws(() => publish({ ...args(w, 2), drop: ['keep.txt'] }), /not a report file of the sweep/)
  assert.deepEqual(state(w).files, reports(1))
  assert.equal(readFileSync(path.join(w.out, 'keep.txt'), 'utf8'), 'mine')
  // --out inside the snapshots of the history
  const v = { out: evidencePath(w.runRoot, 'run-1'), runRoot: w.runRoot }
  const inside = args(v, 2)
  assert.throws(() => publish(inside), /is inside the evidence of the sweep history/)
  rmSync(inside.stage, { recursive: true })
  assert.deepEqual(readdirSync(v.out).sort(), Object.keys(reports(1)).sort())
  assert.throws(() => publish({ ...args(w, 2), evidence: '../x' }), /not a plain name/)
  assert.throws(() => publish({ ...args(w, 2), evidence: null }), /a history is published with its snapshot/)
})

test('publish: a directory that cannot be written leaves the old generation, with nothing left over', () => {
  const w = world()
  const a = args(w, 2)
  chmodSync(w.out, 0o555)
  try {
    assert.throws(() => publish(a), PublishError)
  } finally {
    chmodSync(w.out, 0o755)
  }
  assert.deepEqual([files(w.out), revision(w.runRoot), evidences(w.runRoot)], [reports(1), 1, ['run-1']])
  assert.equal(existsSync(path.join(w.out, '.sweep-txn.json')), false)
  const b = args(w, 2)
  chmodSync(w.runRoot, 0o555)
  try {
    assert.throws(() => publish(b), PublishError)
  } finally {
    chmodSync(w.runRoot, 0o755)
  }
  assert.deepEqual([files(w.out), revision(w.runRoot), evidences(w.runRoot), leftovers(w.out).filter((n) => !n.startsWith('.sweep-stage-'))], [reports(1), 1, ['run-1'], []])
})

// ---- the locks -------------------------------------------------------------------------------------------------------------

const deadPid = () => new Promise((resolve) => {
  const dead = spawn(process.execPath, ['-e', ''])
  dead.on('close', () => resolve(dead.pid))
})

test('locks: one of a process that is gone is taken over, one of a live process is waited for and refused, one that cannot be read is refused, a link or a directory is refused', async () => {
  const w = world()
  const lockOf = { history: path.join(w.runRoot, `${STATE_FILE}.lock`), out: path.join(w.out, '.sweep-out.lock') }
  const dead = await deadPid()
  for (const lock of Object.values(lockOf)) {
    writeFileSync(lock, `${JSON.stringify({ pid: dead, token: 'gone' })}\n`)
    publish(args(w, 2))
    assert.equal(existsSync(lock), false)
    assert.deepEqual([files(w.out)['site-sweep.json'], leftovers(w.out)], ['json-2', []])
    // go back to a world of one generation for the next
    rmSync(w.out, { recursive: true })
    mkdirSync(w.out)
    rmSync(w.runRoot, { recursive: true })
    mkdirSync(w.runRoot)
    writeFileSync(path.join(w.out, 'keep.txt'), 'mine')
    publish(args(w, 1))
  }
  for (const lock of Object.values(lockOf)) {
    writeFileSync(lock, `${JSON.stringify({ pid: process.pid, token: 'live' })}\n`)
    const before = state(w)
    assert.throws(() => publish(args(w, 2)), (e) => e instanceof PublishError && /is being written by another sweep .* not published/.test(e.message))
    assert.equal(readFileSync(lock, 'utf8').includes('live'), true, 'a lock that is not ours is not removed')
    rmSync(lock)
    assert.deepEqual({ ...state(w), locks: [] }, { ...before, locks: [] })
    for (const text of ['', 'garbage', '{"pid":"x"}', `${process.pid}\n`]) {
      writeFileSync(lock, text)
      assert.throws(() => publish(args(w, 2)), /has no owner that can be identified: refused/, text)
      rmSync(lock)
    }
  }
  // a takeover someone else is making is not interfered with
  writeFileSync(lockOf.history, `${JSON.stringify({ pid: dead, token: 'gone' })}\n`)
  writeFileSync(`${lockOf.history}.claim`, `${process.pid}\n`)
  assert.throws(() => publish(args(w, 2)), /was left by process \d+, which is gone, and cannot be taken over/)
  rmSync(`${lockOf.history}.claim`)
  rmSync(lockOf.history)
  // a link, a directory, a FIFO in the place of a lock
  const real = tmp()
  writeFileSync(path.join(real, 'elsewhere'), 'x')
  for (const [make, kind] of [[(p) => symlinkSync(path.join(real, 'elsewhere'), p), 'symbolic link'], [(p) => mkdirSync(p), 'directory'], [(p) => execFileSync('mkfifo', [p]), 'FIFO']]) {
    make(lockOf.out)
    assert.throws(() => publish(args(w, 2)), new RegExp(`is a ${kind}, not a regular file: refused`))
    rmSync(lockOf.out, { recursive: true })
  }
  assert.equal(readFileSync(path.join(real, 'elsewhere'), 'utf8'), 'x')
  assert.equal(revision(w.runRoot), 1)
})

// ---- recovery that cannot proceed ------------------------------------------------------------------------------------------

const interrupted = (w, at, o = {}) => {
  assert.throws(() => publish(args(w, 2, { ...o, step: (s) => { if (s === at) throw new Interrupted(s) } })), Interrupted)
}

test('recovery: a journal that is not one this tool wrote is refused with the old reports and the directory beside it untouched', () => {
  const w = world()
  interrupted(w, 'installed')
  const journal = path.join(w.out, '.sweep-txn.json')
  const good = readFileSync(journal, 'utf8')
  const aside = readdirSync(w.out).find((n) => n.startsWith('.sweep-aside-'))
  const asideBefore = readdirSync(path.join(w.out, aside)).sort()
  const mutate = (f) => {
    const j = JSON.parse(good)
    f(j)
    return JSON.stringify(j)
  }
  for (const text of ['', '{', '[]', mutate((j) => (j.names[0].name = 'passwd')), mutate((j) => (j.names[0].name = '../escape')), mutate((j) => (j.aside = '../elsewhere')), mutate((j) => (j.schema = 'x')), mutate((j) => (j.extra = 1)), mutate((j) => (j.history.runRoot = 'relative')), mutate((j) => (j.evidence.path = '/etc')), mutate((j) => (j.state = 'finished')), mutate((j) => (j.stage = '../x'))]) {
    writeFileSync(journal, text)
    assert.throws(() => settleOutput(w.out), PublishError, text.slice(0, 60))
    assert.throws(() => publish(args(w, 3)), PublishError, text.slice(0, 60))
    assert.deepEqual(readdirSync(path.join(w.out, aside)).sort(), asideBefore)
    assert.equal(revision(w.runRoot), 1)
  }
  // a journal in the place of which there is a directory or a link
  rmSync(journal)
  mkdirSync(journal)
  assert.throws(() => settleOutput(w.out), /is a directory, not a regular file: refused/)
  rmSync(journal, { recursive: true })
  writeFileSync(journal, good)
  settleOutput(w.out)
  assert.deepEqual(state(w), GEN1())
})

test('recovery: what cannot be told or restored is refused and kept until it can — a history that cannot be read or has another revision, an obstacle where an old report goes', () => {
  // the history is damaged: it is unknown whether the interrupted run committed
  const w = world()
  interrupted(w, 'installed')
  const history = path.join(w.runRoot, STATE_FILE)
  const text = readFileSync(history, 'utf8')
  writeFileSync(history, '{')
  assert.throws(() => settleOutput(w.out), /whether .* was committed is unknown; refused/)
  assert.equal(existsSync(path.join(w.out, '.sweep-txn.json')), true)
  assert.equal(readdirSync(w.out).some((n) => n.startsWith('.sweep-aside-')), true)
  writeFileSync(history, text)
  // the history is at a revision this journal does not lead to
  const moved = JSON.parse(text)
  moved.runs[KEY].revision = 7
  writeFileSync(history, JSON.stringify(moved))
  assert.throws(() => settleOutput(w.out), /is at revision 7, an interrupted sweep went from 1 to 2: .* cannot be settled; refused/)
  writeFileSync(history, text)
  // an obstacle: a directory where a new report was put
  const mid = path.join(w.out, 'summary.md')
  const newer = readFileSync(mid, 'utf8')
  rmSync(mid)
  mkdirSync(mid)
  writeFileSync(path.join(mid, 'x'), 'x')
  assert.throws(() => settleOutput(w.out), /could not be undone .* are kept: refused until it can/)
  assert.throws(() => publish(args(w, 3)), /could not be undone/)
  assert.equal(existsSync(path.join(w.out, '.sweep-txn.json')), true)
  assert.equal(readFileSync(path.join(w.out, readdirSync(w.out).find((n) => n.startsWith('.sweep-aside-')), 'summary.md'), 'utf8'), 'summary-1', 'the old report is still aside')
  rmSync(mid, { recursive: true })
  writeFileSync(mid, newer)
  settleOutput(w.out)
  assert.deepEqual(state(w), GEN1())
})

test('recovery: an error after the commit is a warning; the run is published and the next one finishes the cleanup', () => {
  const w = world()
  const aside = (dir) => readdirSync(dir).find((n) => n.startsWith('.sweep-aside-'))
  // a failure of the cleanup: the aside directory holds something that cannot be removed
  let obstacle = null
  const done = publish(args(w, 2, { step: (s) => { if (s === 'committed') { obstacle = path.join(w.out, aside(w.out)); chmodSync(obstacle, 0o555) } } }))
  chmodSync(obstacle, 0o755)
  assert.equal(done.warnings.length, 1)
  assert.match(done.warnings[0], /could not be finished/)
  assert.equal(revision(w.runRoot), 2)
  assert.equal(files(w.out)['site-sweep.json'], 'json-2')
  assert.ok(aside(w.out), 'the aside directory is still there')
  settleOutput(w.out)
  assert.deepEqual(state(w), GEN2())
})

test('settleOutput: nothing to settle is nothing; a lock of a live writer is waited for; a missing directory is not an error', () => {
  const w = world()
  settleOutput(w.out)
  settleOutput(path.join(w.out, 'nowhere'))
  assert.deepEqual(state(w), GEN1())
  writeFileSync(path.join(w.out, '.sweep-out.lock'), `${JSON.stringify({ pid: process.pid, token: 'live' })}\n`)
  assert.throws(() => settleOutput(w.out, { waitMs: 100 }), /is being written by another sweep/)
  rmSync(path.join(w.out, '.sweep-out.lock'))
})

// ---- the history alone -----------------------------------------------------------------------------------------------------

test('publishState: a writer that started from an older revision, a busy lock or a failed write leaves the previous history as it was', () => {
  const dir = tmp()
  const entry = storedOf({})
  const first = publishState({ runRoot: dir, key: KEY, expectedRevision: 0, entry })
  assert.equal(first.revision, 1)
  assert.deepEqual(readdirSync(dir), [STATE_FILE])
  const second = publishState({ runRoot: dir, key: KEY, expectedRevision: 1, entry })
  assert.equal(second.revision, 2)
  assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: 1, entry }), /another sweep of this site, source and dossier finished while this one ran \(history revision 2, this run started from 1\)/)
  assert.equal(readState(dir).doc.runs[KEY].revision, 2)
  // an entry that does not decode is not published
  const bad = structuredClone(entry)
  bad.effective.exit = 0
  bad.effective.checks.overflow.open = [group('x|y', [['/a', 320, 'light']])]
  assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: 2, entry: bad }), /not a tracy-site-sweep-state\/v2 history: .*effective exit 0 .* not published/)
  // another site of the dossier has its own entry and its own revision
  const otherId = { ...IDENTITY, site: 'http://q' }
  publishState({ runRoot: dir, key: keyOf(otherId), expectedRevision: 0, entry: storedOf({}, { identity: otherId }) })
  assert.deepEqual(Object.values(readState(dir).doc.runs).map((e) => e.revision).sort(), [1, 2])
  // a busy lock, then a directory that cannot be written, then a history damaged meanwhile
  const kept = readFileSync(path.join(dir, STATE_FILE), 'utf8')
  writeFileSync(path.join(dir, `${STATE_FILE}.lock`), `${JSON.stringify({ pid: process.pid, token: 'live' })}\n`)
  assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: 2, entry, lockWaitMs: 100 }), /is being written by another sweep/)
  rmSync(path.join(dir, `${STATE_FILE}.lock`))
  chmodSync(dir, 0o555)
  try {
    assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: 2, entry, lockWaitMs: 100 }), PublishError)
  } finally {
    chmodSync(dir, 0o755)
  }
  assert.equal(readFileSync(path.join(dir, STATE_FILE), 'utf8'), kept)
  assert.deepEqual(readdirSync(dir), [STATE_FILE])
  writeFileSync(path.join(dir, STATE_FILE), '{')
  assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: 2, entry }), /is not valid JSON/)
  assert.equal(readFileSync(path.join(dir, STATE_FILE), 'utf8'), '{')
  // a link or a directory in the place of the history
  const real = tmp()
  writeFileSync(path.join(real, 'elsewhere.json'), JSON.stringify(docOf(entry)))
  const link = tmp()
  symlinkSync(path.join(real, 'elsewhere.json'), path.join(link, STATE_FILE))
  assert.throws(() => publishState({ runRoot: link, key: KEY, expectedRevision: 0, entry, lockWaitMs: 100 }), /is a symbolic link/)
  assert.equal(JSON.parse(readFileSync(path.join(real, 'elsewhere.json'), 'utf8')).runs[KEY].revision, 1)
})

// ---- one transaction at a time on one history, and only what a transaction made is removed ---------------------------------------

test('publish: a run that committed and stopped before its cleanup is settled by the next writer of another --out, whatever it commits', () => {
  const w = world()
  const b = { out: tmp(), runRoot: w.runRoot }
  interrupted(w, 'committed')
  assert.equal(revision(w.runRoot), 2)
  assert.deepEqual(publish(args(b, 3)).warnings, [])
  assert.equal(revision(w.runRoot), 3)
  assert.deepEqual([files(w.out), leftovers(w.out), existsSync(path.join(w.runRoot, '.sweep-pending.json'))], [reports(2), [], false])
  assert.deepEqual(files(b.out), reports(3))
  settleOutput(w.out)
  assert.deepEqual(evidences(w.runRoot), ['run-1', 'run-2', 'run-3'])
  // one that stopped before the commit is put back, and the other commits from the revision it had
  const v = world()
  const c = { out: tmp(), runRoot: v.runRoot }
  interrupted(v, 'installed')
  const next = args(c, 3)
  publish(next)
  assert.deepEqual([files(v.out), leftovers(v.out), revision(v.runRoot), evidences(v.runRoot)], [reports(1), [], 2, ['run-1', 'run-3']])
  assert.deepEqual(files(c.out), reports(3))
  // a marker whose output is gone, or that is not one this tool wrote
  const x = world()
  const y = { out: tmp(), runRoot: x.runRoot }
  const gone = tmp()
  writeFileSync(path.join(x.runRoot, '.sweep-pending.json'), JSON.stringify({ out: path.join(gone, 'nowhere'), token: 't' }))
  publish(args(y, 2))
  assert.equal(revision(x.runRoot), 2)
  writeFileSync(path.join(x.runRoot, '.sweep-pending.json'), '{')
  assert.throws(() => publish(args(y, 3)), /transaction marker .* is not one this tool wrote/)
  assert.equal(revision(x.runRoot), 2)
})

test('recovery: a stop between the snapshot directory and its token leaves nothing; a directory that is not the transaction\'s is never removed', () => {
  const w = world()
  interrupted(w, 'journal')
  mkdirSync(evidencePath(w.runRoot, 'run-2'))
  settleOutput(w.out)
  assert.deepEqual(state(w), GEN1())
  // the snapshot the journal names holds something that is not the transaction's
  const v = world()
  interrupted(v, 'journal')
  mkdirSync(evidencePath(v.runRoot, 'run-2'))
  writeFileSync(path.join(evidencePath(v.runRoot, 'run-2'), 'precious.txt'), 'evidence')
  assert.throws(() => settleOutput(v.out), /does not carry the token of the interrupted sweep: it is not removed; refused/)
  assert.equal(readFileSync(path.join(evidencePath(v.runRoot, 'run-2'), 'precious.txt'), 'utf8'), 'evidence')
  assert.equal(existsSync(path.join(v.out, '.sweep-txn.json')), true)
})

test('recovery: a journal that points at a snapshot, an aside directory or a stage of another transaction removes none of them', () => {
  const w = world()
  interrupted(w, 'installed')
  const journal = path.join(w.out, '.sweep-txn.json')
  const good = readFileSync(journal, 'utf8')
  const mutate = (f) => {
    const j = JSON.parse(good)
    f(j)
    return JSON.stringify(j)
  }
  const before = () => [readdirSync(evidencePath(w.runRoot, 'run-1')).sort(), readdirSync(w.out).sort(), revision(w.runRoot)]
  const was = before()
  // another snapshot of the same key: it carries no token
  writeFileSync(journal, mutate((j) => (j.evidence.path = evidencePath(w.runRoot, 'run-1'))))
  assert.throws(() => settleOutput(w.out), /does not carry the token of the interrupted sweep/)
  assert.deepEqual(before(), was)
  // a snapshot of another key
  writeFileSync(journal, mutate((j) => (j.evidence.path = path.join(w.runRoot, EVIDENCE_DIR, 'ab', 'run-1'))))
  const other = path.join(w.runRoot, EVIDENCE_DIR, 'ab', 'run-1')
  mkdirSync(other, { recursive: true })
  writeFileSync(path.join(other, 'x'), 'x')
  assert.throws(() => settleOutput(w.out), PublishError)
  assert.equal(existsSync(path.join(other, 'x')), true)
  // a stage that holds what the sweep does not write
  const stage = mkdtempSync(path.join(w.out, '.sweep-stage-'))
  writeFileSync(path.join(stage, 'passwd'), 'x')
  writeFileSync(journal, mutate((j) => (j.stage = path.basename(stage))))
  assert.throws(() => settleOutput(w.out), /holds a file that is not a report of the sweep: refused/)
  assert.equal(existsSync(path.join(stage, 'passwd')), true)
  rmSync(stage, { recursive: true })
  // an aside directory that is not the transaction's
  writeFileSync(journal, good)
  const aside = readdirSync(w.out).find((n) => n.startsWith('.sweep-aside-'))
  const owner = path.join(w.out, aside, '.sweep-owner')
  const token = readFileSync(owner, 'utf8')
  writeFileSync(owner, 'another\n')
  assert.throws(() => settleOutput(w.out), /does not carry the token of the interrupted sweep/)
  writeFileSync(owner, token)
  settleOutput(w.out)
  assert.deepEqual(state(w), GEN1())
})

test('publish: an --out inside the evidence of the history is refused for a run with no history too', () => {
  const w = world()
  const v = { out: evidencePath(w.runRoot, 'run-1'), runRoot: w.runRoot }
  const explicit = { ...args(v, 2, { noHistory: true }), runRoot: w.runRoot }
  assert.throws(() => publish(explicit), /is inside the evidence of the sweep history/)
  assert.deepEqual(readFileSync(path.join(evidencePath(w.runRoot, 'run-1'), 'site-sweep.json'), 'utf8'), 'json-1')
})

test('publishState: an entry with an intermittent group and a source fingerprint is written and read back whole; a stale revision leaves it as it was', () => {
  const dir = tmp()
  const PRINT = { algorithm: 'tracy-source-fingerprint/v1', url: 'http://s.test/', htmlSha256: 'a'.repeat(64), template: null }
  const sourceFingerprint = { ...PRINT, id: createHash('sha256').update(JSON.stringify([PRINT.algorithm, PRINT.url, PRINT.htmlSha256, PRINT.template])).digest('hex') }
  const intermittent = [{ ...group('page-overflow|gone', [['/a', 320, 'light']]), absent: 1 }]
  const entry = storedOf({ overflow: rec('overflow', { intermittent }) }, { sourceFingerprint })
  publishState({ runRoot: dir, key: KEY, expectedRevision: 0, entry })
  const back = readState(dir).doc.runs[KEY]
  assert.deepEqual([back.effective.checks.overflow.intermittent, back.sourceFingerprint, back.effective.exit], [intermittent, sourceFingerprint, 1])
  const before = readFileSync(path.join(dir, STATE_FILE), 'utf8')
  assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: 0, entry }), /history revision 1, this run started from 0/)
  // a group that was absent twice cannot be stored as intermittent: the entry is refused and the history is as it was
  const bad = structuredClone(entry)
  bad.effective.checks.overflow.intermittent[0].absent = 2
  assert.throws(() => publishState({ runRoot: dir, key: KEY, expectedRevision: 1, entry: bad }), /not a tracy-site-sweep-state\/v2 history/)
  assert.equal(readFileSync(path.join(dir, STATE_FILE), 'utf8'), before)
})
