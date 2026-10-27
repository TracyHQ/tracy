// site-sweep-publish.mjs — the reports of a sweep and its history, published as one transaction.
//
// One run writes the report files of --out (OUTPUT_NAMES), a snapshot of them under <run-root>/site-sweep-evidence/<key>/ that the
// history points at, and one entry of <run-root>/site-sweep-state.json. publish() does it so that the result is whole, old or new:
//
//   locks    <out>/.sweep-out.lock and <run-root>/site-sweep-state.json.lock, taken in path order, held from the recovery of an
//            interrupted transaction to the end. A lock names its process; one whose process is gone is taken over through an
//            exclusive claim file; one whose process lives is waited for, then refused. A lock that cannot be read is refused.
//   check    the history is read under the locks and must still be at the revision the run started from, and the entry to publish
//            must decode (stateProblems), both before anything is changed.
//   journal  <out>/.sweep-txn.json is written first (state `prepared`): what is replaced, where the old files go (.sweep-aside-*),
//            the snapshot directory, the history entry. Then the snapshot is created (a directory that exists is refused, never
//            removed), the old files are moved aside, the new ones put in (state `installed`).
//   commit   a run with a history commits by the rename of the history file; one without, by the journal reaching `committed`.
//   cleanup  after the commit the aside directory and the journal are removed; a failure there is a warning, the run is published.
//
// An error before the commit puts the old files back and removes the snapshot this transaction created. A process that stops
// anywhere leaves the journal: the next writer into the same --out, and every reader of site-sweep.json (settleOutput), first
// finishes it — forward when the history has the new revision, back when it still has the old one — and refuses when it cannot
// tell or cannot restore; the journal and the aside directory stay until it can. The snapshot is the evidence the history carries;
// it is never overwritten.
import { closeSync, constants, cpSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, fstatSync, writeSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { HistoryError, STATE_FILE, STATE_SCHEMA, kindOf, readState, regularOrAbsent, stateProblems } from './site-sweep-scope.mjs'

export const OUTPUT_NAMES = Object.freeze(['site-sweep.json', 'site-sweep.md', 'summary.md', 'summary.json', 'fix-measure.json'])
export const EVIDENCE_DIR = 'site-sweep-evidence'
const JOURNAL = '.sweep-txn.json'
const OUT_LOCK = '.sweep-out.lock'
const PENDING = '.sweep-pending.json'
const OWNER = '.sweep-owner'
const JOURNAL_SCHEMA = 'tracy-site-sweep-txn/v1'
const LOCK_WAIT_MS = 5000
const MAX_SMALL_BYTES = 4 * 1024 * 1024

/** The transaction could not be completed or recovered; what it left is named in the message. */
export class PublishError extends Error {}
/** A process that stopped inside the transaction (tests): nothing is put back, as when the process is gone. */
export class Interrupted extends Error {}

const isStr = (x) => typeof x === 'string'
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}
const present = (f) => {
  try {
    lstatSync(f)
    return true
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
}
const O_NEW = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0)

/** The text of a small regular file, opened without following a link or blocking; null when it is absent. */
function readSmall(file, what) {
  const st = regularOrAbsent(file, what)
  if (!st) return null
  let fd
  try {
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
    const open = fstatSync(fd)
    if (!open.isFile()) throw new PublishError(`${what} ${file} is a ${kindOf(open)}, not a regular file: refused`)
    if (open.size > MAX_SMALL_BYTES) throw new PublishError(`${what} ${file} is ${open.size} bytes: too large`)
    return readFileSync(fd, 'utf8')
  } catch (e) {
    if (e instanceof PublishError || e.code === 'ENOENT') {
      if (e.code === 'ENOENT') return null
      throw e
    }
    throw new PublishError(`${what} ${file} cannot be read: ${e.message}`)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** A file written whole through a temporary file, an fsync and a rename: the old file or the new one, never a part. */
function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  let fd
  try {
    fd = openSync(tmp, O_NEW, 0o644)
    writeSync(fd, text)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(tmp, file)
  } finally {
    if (fd !== undefined) closeSync(fd)
    rmSync(tmp, { force: true })
  }
  try {
    const d = openSync(path.dirname(file), constants.O_RDONLY)
    try {
      fsyncSync(d)
    } finally {
      closeSync(d)
    }
  } catch {
    // the rename is done; syncing the directory is best effort
  }
}

// ---- locks -----------------------------------------------------------------------------------------------------------------

const readLock = (lock) => {
  try {
    const j = JSON.parse(readSmall(lock, 'the lock') ?? '')
    return j && Number.isInteger(j.pid) && j.pid > 0 && isStr(j.token) ? j : null
  } catch {
    return null
  }
}

/** Take a stale lock over: only the process that holds the claim file may remove it, and only the lock it saw. → whether it was removed. */
function breakStale(lock, holder) {
  const claim = `${lock}.claim`
  let fd
  try {
    fd = openSync(claim, O_NEW, 0o600)
  } catch (e) {
    if (e.code === 'EEXIST') return false
    throw new PublishError(`the claim ${claim} cannot be taken: ${e.message}`)
  }
  try {
    writeSync(fd, `${process.pid}\n`)
    const now = readLock(lock)
    if (!now || now.token !== holder.token || alive(now.pid)) return false
    rmSync(lock, { force: true })
    return true
  } finally {
    closeSync(fd)
    rmSync(claim, { force: true })
  }
}

/** Take <lock> (created exclusively). → release, which removes the lock only while it is still this process's. */
function acquire(lock, waitMs, what) {
  const token = randomBytes(8).toString('hex')
  const until = Date.now() + waitMs
  for (;;) {
    let fd
    try {
      fd = openSync(lock, O_NEW, 0o600)
    } catch (e) {
      if (e.code !== 'EEXIST') throw new PublishError(`the lock of ${what} (${lock}) cannot be taken: ${e.message}`)
    }
    if (fd !== undefined) {
      try {
        writeSync(fd, `${JSON.stringify({ pid: process.pid, token })}\n`)
        fsyncSync(fd)
      } catch (e) {
        rmSync(lock, { force: true })
        throw new PublishError(`the lock of ${what} (${lock}) cannot be written: ${e.message}`)
      } finally {
        closeSync(fd)
      }
      return () => {
        try {
          if (readLock(lock)?.token === token) rmSync(lock, { force: true })
        } catch {
          // the lock names this process; it is taken over once the process is gone
        }
      }
    }
    if (!regularOrAbsent(lock, `the lock of ${what}`)) continue
    const holder = readLock(lock)
    if (holder && !alive(holder.pid) && breakStale(lock, holder)) continue
    if (Date.now() >= until) {
      if (!holder) throw new PublishError(`the lock of ${what} (${lock}) has no owner that can be identified: refused; remove it when no sweep is running`)
      throw new PublishError(alive(holder.pid) ? `${what} is being written by another sweep (${lock}, process ${holder.pid}): not published` : `the lock of ${what} (${lock}) was left by process ${holder.pid}, which is gone, and cannot be taken over (${lock}.claim): remove both when no sweep is running`)
    }
    sleep(50)
  }
}

/** Run `fn` holding every lock of `locks` ([{ file, what }]), taken in path order. */
function withLocks(locks, waitMs, fn) {
  const released = []
  try {
    for (const l of [...new Map(locks.map((x) => [x.file, x])).values()].sort((a, b) => (a.file < b.file ? -1 : 1))) released.push(acquire(l.file, waitMs, l.what))
    return fn()
  } finally {
    for (const r of released.reverse()) r()
  }
}

// ---- the journal and its recovery ------------------------------------------------------------------------------------------

const plain = (n) => isStr(n) && n === path.basename(n) && n !== '' && n !== '.' && n !== '..' && !n.includes('\0')
const journalOk = (j) => {
  const o = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
  const keys = (x, k) => o(x) && Object.keys(x).length === k.length && k.every((n) => Object.hasOwn(x, n))
  if (!keys(j, ['schema', 'token', 'state', 'aside', 'stage', 'names', 'history', 'evidence']) || j.schema !== JOURNAL_SCHEMA || !isStr(j.token)) return false
  if (!['prepared', 'installed', 'committed'].includes(j.state) || !/^\.sweep-aside-[0-9a-f]+$/.test(j.aside) || !(j.stage === null || /^\.sweep-stage-[A-Za-z0-9]+$/.test(j.stage))) return false
  if (!Array.isArray(j.names) || !j.names.every((x) => keys(x, ['name', 'had']) && OUTPUT_NAMES.includes(x.name) && typeof x.had === 'boolean') || new Set(j.names.map((x) => x.name)).size !== j.names.length) return false
  const h = j.history
  if (h !== null && !(keys(h, ['runRoot', 'key', 'expectedRevision', 'nextRevision', 'runId']) && isStr(h.runRoot) && path.isAbsolute(h.runRoot) && /^[0-9a-f]+$/.test(h.key) && Number.isInteger(h.expectedRevision) && h.expectedRevision >= 0 && h.nextRevision === h.expectedRevision + 1 && isStr(h.runId))) return false
  const ev = j.evidence
  if (ev !== null && !(keys(ev, ['path', 'created']) && isStr(ev.path) && typeof ev.created === 'boolean' && h !== null && plain(path.basename(ev.path)) && /^[0-9a-f]+$/.test(h.key) && ev.path === path.join(h.runRoot, EVIDENCE_DIR, h.key, path.basename(ev.path)))) return false
  return true
}

function readJournal(out) {
  const file = path.join(out, JOURNAL)
  const text = readSmall(file, 'the sweep transaction journal')
  if (text === null) return null
  let j
  try {
    j = JSON.parse(text)
  } catch (e) {
    throw new PublishError(`the sweep transaction journal ${file} is not valid JSON (${e.message}): the state of ${out} is unknown; refused. Keep ${file} and the .sweep-aside-* directory beside it`)
  }
  if (!journalOk(j)) throw new PublishError(`the sweep transaction journal ${file} is not one this tool wrote: the state of ${out} is unknown; refused. Keep ${file} and the .sweep-aside-* directory beside it`)
  return j
}

/** Whether the history has the revision a transaction was to write: true, false (still the old one), or a PublishError when it cannot be told. */
function committedOf(j, file) {
  if (!j.history) return j.state === 'committed'
  const { runRoot, key, expectedRevision, nextRevision, runId } = j.history
  let doc
  try {
    doc = readState(runRoot).doc
  } catch (e) {
    throw new PublishError(`the history of an interrupted sweep cannot be read (${e.message}): whether ${file} was committed is unknown; refused`)
  }
  const entry = doc?.runs[key]
  const rev = entry?.revision ?? 0
  if (rev === nextRevision && entry.runs[runId]) return true
  if (rev === expectedRevision) return false
  throw new PublishError(`the history of ${runRoot} is at revision ${rev}, an interrupted sweep went from ${expectedRevision} to ${nextRevision}: ${file} cannot be settled; refused`)
}

/** The marker a transaction with a history leaves in the run-root while it is open: the output and the journal token it belongs to. */
const pendingFile = (runRoot) => path.join(runRoot, PENDING)
function readPending(runRoot) {
  const file = pendingFile(runRoot)
  const text = readSmall(file, 'the sweep transaction marker')
  if (text === null) return null
  try {
    const j = JSON.parse(text)
    if (j && typeof j === 'object' && isStr(j.out) && path.isAbsolute(j.out) && isStr(j.token)) return j
  } catch {
    // refused below
  }
  throw new PublishError(`the sweep transaction marker ${file} is not one this tool wrote: whether a sweep was interrupted is unknown; refused. Keep it and the .sweep-aside-* directory of its output`)
}

/** What a transaction owns, checked before anything is put back or removed: nothing that is not proved to be its own is touched. → the checked paths. */
function owned(j, out, committed) {
  const aside = path.join(out, j.aside)
  const state = { aside: null, snapshot: null, stage: null }
  const dir = (p, what) => {
    let st = null
    try {
      st = lstatSync(p)
    } catch (e) {
      if (e.code !== 'ENOENT') throw new PublishError(`${what} ${p} cannot be read: ${e.message}`)
    }
    if (st && !st.isDirectory()) throw new PublishError(`${what} ${p} is a ${kindOf(st)}, not a directory: refused`)
    return st ? p : null
  }
  const proves = (p, what) => {
    const names = readdirSync(p)
    const mine = names.includes(OWNER) && readSmall(path.join(p, OWNER), what)?.trim() === j.token
    if (!mine && names.length) throw new PublishError(`${what} ${p} does not carry the token of the interrupted sweep: it is not removed; refused`)
  }
  // after the commit the old reports in the aside directory are of no use: what is in it must only look like them
  const looksLike = (p, what) => {
    if (!readdirSync(p).every((n) => n === OWNER || OUTPUT_NAMES.includes(n))) throw new PublishError(`${what} ${p} holds a file that is not a report of the sweep: refused`)
  }
  state.aside = dir(aside, 'the aside directory')
  if (state.aside) (committed ? looksLike : proves)(aside, 'the aside directory')
  if (j.evidence?.created && !committed) {
    state.snapshot = dir(j.evidence.path, 'the snapshot directory')
    if (state.snapshot) proves(j.evidence.path, 'the snapshot directory')
  } else if (j.evidence?.created) state.snapshot = dir(j.evidence.path, 'the snapshot directory')
  if (j.stage) {
    state.stage = dir(path.join(out, j.stage), 'the staging directory')
    if (state.stage && !readdirSync(state.stage).every((n) => OUTPUT_NAMES.includes(n))) throw new PublishError(`the staging directory ${state.stage} holds a file that is not a report of the sweep: refused`)
  }
  return state
}

/** A directory of a transaction removed so that an interruption leaves it provable: its content first, then the token, then the directory. */
function removeOwned(dir) {
  for (const n of readdirSync(dir)) if (n !== OWNER) rmSync(path.join(dir, n), { recursive: true })
  rmSync(path.join(dir, OWNER), { force: true })
  rmdirSync(dir)
}

/** Finish or undo the interrupted transaction of `out`, if any. Under the lock of `out`. */
function recoverIn(out) {
  const j = readJournal(out)
  if (!j) return
  const file = path.join(out, JOURNAL)
  const aside = path.join(out, j.aside)
  const committed = committedOf(j, file)
  const kept = `${file} and ${aside} are kept: refused until it can`
  let mine
  try {
    mine = owned(j, out, committed)
  } catch (e) {
    throw new PublishError(`the interrupted sweep of ${out} could not be ${committed ? 'finished' : 'undone'} (${e.message}); ${kept}`)
  }
  try {
    if (!committed) {
      for (const { name, had } of j.names) {
        const old = path.join(aside, name)
        if (present(old)) {
          rmSync(path.join(out, name), { force: true })
          renameSync(old, path.join(out, name))
        } else if (!had) rmSync(path.join(out, name), { force: true })
      }
      if (mine.snapshot) removeOwned(mine.snapshot)
    } else if (mine.snapshot && readSmall(path.join(mine.snapshot, OWNER), 'the snapshot owner')?.trim() === j.token) rmSync(path.join(mine.snapshot, OWNER))
    if (mine.aside) removeOwned(mine.aside)
    if (mine.stage) rmSync(mine.stage, { recursive: true })
    rmSync(file)
  } catch (e) {
    throw new PublishError(`the interrupted sweep of ${out} could not be ${committed ? 'finished' : 'undone'} (${e.message}); ${kept}`)
  }
  try {
    // the marker of the history goes with the journal; one left behind names no journal and is dropped by the next run
    if (j.history && readPending(j.history.runRoot)?.token === j.token) rmSync(pendingFile(j.history.runRoot))
  } catch {
    // nothing is waiting on it
  }
}

/**
 * An open transaction of another output on the same history is finished or undone before this run touches the history: only
 * one transaction is ever between its start and its end for one history, so a run is always at the revision it started from or the next.
 */
function settlePending(runReal, outReal, waitMs) {
  const p = readPending(runReal)
  if (!p || p.out === outReal) return
  let real
  try {
    real = realpathSync(p.out)
  } catch {
    // the output is gone with its journal: nothing in it to settle; the marker is of no use
    rmSync(pendingFile(runReal), { force: true })
    return
  }
  withLocks([{ file: path.join(real, OUT_LOCK), what: real }], waitMs, () => {
    const j = readJournal(real)
    if (j && j.token !== p.token) throw new PublishError(`the journal of ${real} is not the transaction ${pendingFile(runReal)} names: refused`)
    if (j) recoverIn(real)
    else rmSync(pendingFile(runReal), { force: true })
  })
}

/**
 * For a reader of the reports of `out` (a baseline, a release gate, a round): an interrupted transaction is finished or undone
 * first, and a run still writing is waited for. A transaction that cannot be settled is a PublishError; nothing is read from `out`.
 */
export function settleOutput(out, { waitMs = LOCK_WAIT_MS } = {}) {
  let real
  try {
    real = realpathSync(out)
  } catch {
    return
  }
  const journal = path.join(real, JOURNAL)
  const lock = path.join(real, OUT_LOCK)
  if (!present(journal) && !present(lock)) return
  withLocks([{ file: lock, what: real }], waitMs, () => recoverIn(real))
}

// ---- the history entry -----------------------------------------------------------------------------------------------------

/** The document to write for `history` ({ runRoot, key, expectedRevision, entry }): checked against the revision and the schema, nothing written. */
function historyText({ runRoot, key, expectedRevision, entry }) {
  const state = readState(runRoot)
  const now = state.doc?.runs[key]?.revision ?? 0
  if (now !== expectedRevision) throw new HistoryError(`another sweep of this site, source and dossier finished while this one ran (history revision ${now}, this run started from ${expectedRevision}): this run is not published; run the sweep again`)
  const written = { ...entry, revision: expectedRevision + 1 }
  const doc = state.doc ?? { schema: STATE_SCHEMA, runs: {} }
  doc.runs[key] = written
  const problems = stateProblems(doc)
  if (problems.length) throw new HistoryError(`the history to publish is not a ${STATE_SCHEMA} history: ${problems.slice(0, 3).join('; ')}: not published`)
  return { file: state.file, text: JSON.stringify(doc, null, 2) + '\n', written }
}

const historyLock = (runRoot) => ({ file: path.join(runRoot, `${STATE_FILE}.lock`), what: 'the sweep history' })

/**
 * Publish one entry of the history alone: under its lock the file is read again, the entry must still be at `expectedRevision` (the
 * revision this run started from; 0 when it had none), and the new document replaces the old through a temporary file and a rename.
 * → the entry as written. Throws HistoryError / PublishError and leaves the previous history as it was.
 */
export function publishState({ runRoot, key, expectedRevision, entry, lockWaitMs = LOCK_WAIT_MS }) {
  regularOrAbsent(path.join(runRoot, STATE_FILE))
  return withLocks([historyLock(runRoot)], lockWaitMs, () => {
    settlePending(realpathSync(runRoot), null, lockWaitMs)
    const { file, text, written } = historyText({ runRoot, key, expectedRevision, entry })
    try {
      writeAtomic(file, text)
    } catch (e) {
      throw new HistoryError(`the sweep history ${file} cannot be written: ${e.message}`)
    }
    return written
  })
}

// ---- the transaction -------------------------------------------------------------------------------------------------------

/** The token of a transaction, created exclusively in a directory it made: what recovery needs to prove the directory is its own. */
function writeOwner(dir, token) {
  const fd = openSync(path.join(dir, OWNER), O_NEW, 0o600)
  try {
    writeSync(fd, `${token}\n`)
  } finally {
    closeSync(fd)
  }
}

/** The directory <runRoot>/site-sweep-evidence/<key>, created when absent; a link or a file in its place is refused. */
function evidenceParent(runRoot, key) {
  let dir = runRoot
  for (const part of [EVIDENCE_DIR, key]) {
    dir = path.join(dir, part)
    let st = null
    try {
      st = lstatSync(dir)
    } catch (e) {
      if (e.code !== 'ENOENT') throw new PublishError(`${dir} cannot be read: ${e.message}`)
    }
    if (!st) mkdirSync(dir)
    else if (!st.isDirectory()) throw new PublishError(`${dir} is a ${kindOf(st)}, not a directory: refused`)
  }
  return dir
}

/**
 * Publish the reports of `stage` (a directory inside `out`) into `out`, drop the files named in `drop`, and — when `history`
 * ({ runRoot, key, expectedRevision, entry }) and `evidence` (the name of the snapshot directory to create in
 * <runRoot>/site-sweep-evidence/<key>/) are given — keep the snapshot and publish the history entry in the same transaction (see the head of this file).
 * `step(name)` is called at each boundary of the transaction. → { warnings } what could not be cleaned up after the commit.
 * Throws HistoryError (the history is not at the revision, or not valid) or PublishError; the old reports and history stand.
 */
export function publish({ out, stage, drop = [], history = null, evidence = null, runRoot = null, lockWaitMs = LOCK_WAIT_MS, step = () => {} }) {
  const outReal = realpathSync(out)
  const stageName = path.basename(stage)
  if (path.dirname(realpathSync(stage)) !== outReal) throw new PublishError(`the staging directory ${stage} is not a directory of ${out}`)
  if (!!history !== !!evidence) throw new PublishError('a history is published with its snapshot, and a snapshot only with a history')
  let runReal = null
  // no output lies inside the evidence of a sweep history, whether this run keeps a history or not
  const rootReal = history || runRoot ? realpathSync(history ? history.runRoot : runRoot) : null
  if (rootReal && (outReal + path.sep).startsWith(path.join(rootReal, EVIDENCE_DIR) + path.sep)) throw new PublishError(`--out ${outReal} is inside the evidence of the sweep history (${path.join(rootReal, EVIDENCE_DIR)}): refused`)
  if (history) {
    runReal = rootReal
    if (!plain(evidence) || !/^[0-9a-f]+$/.test(history.key)) throw new PublishError('the snapshot name or the history key is not a plain name: refused')
  }
  const locks = [{ file: path.join(outReal, OUT_LOCK), what: outReal }, ...(history ? [historyLock(runReal)] : [])]
  return withLocks(locks, lockWaitMs, () => {
    if (runReal) settlePending(runReal, outReal, lockWaitMs)
    recoverIn(outReal)
    const next = history ? historyText({ ...history, runRoot: runReal }) : null
    const staged = readdirSync(stage)
    for (const n of staged) {
      if (!OUTPUT_NAMES.includes(n)) throw new PublishError(`${stage}/${n} is not a report file of the sweep: refused`)
      regularOrAbsent(path.join(stage, n), 'the staged report')
    }
    const names = [...staged, ...drop.filter((n) => !staged.includes(n))].map((name) => ({ name, had: regularOrAbsent(path.join(outReal, name), 'the output file') !== null }))
    if (names.some((x) => !OUTPUT_NAMES.includes(x.name))) throw new PublishError('a report file to publish or drop is not a report file of the sweep: refused')
    const j = {
      schema: JOURNAL_SCHEMA,
      token: randomBytes(8).toString('hex'),
      state: 'prepared',
      aside: `.sweep-aside-${randomBytes(6).toString('hex')}`,
      stage: /^\.sweep-stage-[A-Za-z0-9]+$/.test(stageName) ? stageName : null,
      names,
      history: history ? { runRoot: runReal, key: history.key, expectedRevision: history.expectedRevision, nextRevision: history.expectedRevision + 1, runId: history.entry.latest } : null,
      evidence: evidence ? { path: path.join(evidenceParent(runReal, history.key), evidence), created: false } : null
    }
    if (j.evidence && present(j.evidence.path)) throw new PublishError(`the snapshot ${j.evidence.path} exists: it is the evidence of a run and is never replaced; refused`)
    const journal = path.join(outReal, JOURNAL)
    const aside = path.join(outReal, j.aside)
    const save = () => writeAtomic(journal, JSON.stringify(j, null, 2) + '\n')
    const undo = (cause) => {
      try {
        recoverIn(outReal)
      } catch (e) {
        throw new PublishError(`${String(cause.message).split('\n')[0]}; and the old reports could not be put back (${e.message})`)
      }
    }
    let committed = false
    try {
      if (history) writeAtomic(pendingFile(runReal), JSON.stringify({ out: outReal, token: j.token }) + '\n')
      if (evidence) j.evidence.created = true
      save()
      step('journal')
      mkdirSync(aside)
      writeOwner(aside, j.token)
      if (evidence) {
        mkdirSync(j.evidence.path)
        writeOwner(j.evidence.path, j.token)
        cpSync(stage, j.evidence.path, { recursive: true, errorOnExist: true, force: false })
        step('evidence')
      }
      for (const { name, had } of names) {
        if (had) renameSync(path.join(outReal, name), path.join(aside, name))
        step(`aside:${name}`)
        if (staged.includes(name)) renameSync(path.join(stage, name), path.join(outReal, name))
        step(`install:${name}`)
      }
      j.state = 'installed'
      save()
      step('installed')
      if (next) writeAtomic(next.file, next.text)
      else {
        j.state = 'committed'
        save()
      }
      committed = true
      step('committed')
    } catch (e) {
      if (e instanceof Interrupted) throw e
      if (committed) throw e
      undo(e)
      throw e instanceof HistoryError || e instanceof PublishError ? e : new PublishError(`the reports could not be written to ${out}: ${String(e.message).split('\n')[0]}`)
    }
    const warnings = []
    try {
      recoverIn(outReal)
    } catch (e) {
      warnings.push(e.message)
    }
    return { warnings, written: next?.written ?? null }
  })
}
