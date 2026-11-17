// The sharpness gate's verdicts (photo-sharpness.js judgePhoto) on worker threads. The gate's measurement is plain
// JavaScript (blurs and sums over float pictures), so on the main thread every verdict waited for the one before it,
// whatever the cuts in flight: a dev picture step (17/11/2026, JA Diner, 205 owner photos) spent about 95 of its 105 s
// of frame preparation on 101 verdicts in a row. The workers run the same function on the same bytes, so a verdict is
// the one the main thread would give; only several are worked out at once.
//
// One pool per process, shared by every picture run (the bench runs several at once): JUDGE_WORKERS threads at most,
// started when the first verdict is asked. A worker holds the process open only while it has work. A worker that dies
// fails its own verdict and is replaced at the next one; when no worker can be started at all, the verdict is worked
// out on the main thread, as before.
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { judgePhoto } from './photo-sharpness.js'

/** Worker threads at most: the cores past one for the server, never more than the cuts in flight (CUTS_AT_ONCE 4). */
export const JUDGE_WORKERS = Math.max(1, Math.min(4, availableParallelism() - 1))

const WORKER_URL = new URL('./photo-sharpness-worker.js', import.meta.url)

/** @type {{ worker: Worker, busy: null | { id: number, resolve: Function, reject: Function } }[]} */
const workers = []
/** @type {{ id: number, message: object, resolve: Function, reject: Function }[]} */
const waiting = []
let nextId = 1
let unavailable = false

function start() {
  const slot = { worker: new Worker(WORKER_URL), busy: null }
  slot.worker.unref()
  slot.worker.on('message', ({ id, ok, result, error }) => {
    const job = slot.busy
    if (!job || job.id !== id) return
    slot.busy = null
    slot.worker.unref()
    if (ok) job.resolve(withBuffer(result))
    else job.reject(new Error(`sharpness worker: ${error}`))
    pump()
  })
  const lost = (why) => {
    const i = workers.indexOf(slot)
    if (i >= 0) workers.splice(i, 1)
    const job = slot.busy
    slot.busy = null
    if (job) job.reject(new Error(`sharpness worker stopped: ${why}`))
    pump()
  }
  slot.worker.on('error', (e) => lost(String(e?.message ?? e)))
  slot.worker.on('exit', (code) => lost(`exit ${code}`))
  workers.push(slot)
  return slot
}

// The corrected bytes come back as a Uint8Array (structured clone); the callers read them as a Buffer.
const withBuffer = (result) =>
  result?.corrected && !Buffer.isBuffer(result.corrected)
    ? { ...result, corrected: Buffer.from(result.corrected) }
    : result

function pump() {
  while (waiting.length) {
    let slot = workers.find((w) => !w.busy)
    if (!slot && workers.length < JUDGE_WORKERS) slot = start()
    if (!slot) return
    const job = waiting.shift()
    slot.busy = job
    slot.worker.ref()
    slot.worker.postMessage(job.message)
  }
}

/**
 * judgePhoto's verdict, worked out on one of the pool's threads.
 * @param {Uint8Array} bytes the cut photo
 * @param {{kind: string, width: number}} slot
 * @param {{source?: Uint8Array | null, scale?: number}} [opts]
 * @returns {ReturnType<typeof judgePhoto>}
 */
export function judgePhotoOffThread(bytes, slot, { source = null, scale = 1 } = {}) {
  if (unavailable) return judgePhoto(bytes, slot, { source, scale })
  return new Promise((resolve, reject) => {
    const id = nextId++
    waiting.push({ id, message: { id, bytes, slot, source, scale }, resolve, reject })
    try {
      pump()
    } catch {
      // The running workers take the waiting verdicts as they free up.
      if (workers.length) return
      // No worker can be started here at all (a runtime without worker threads): the main thread judges, as before.
      unavailable = true
      for (const job of waiting.splice(0)) {
        const m = job.message
        judgePhoto(m.bytes, m.slot, { source: m.source, scale: m.scale }).then(job.resolve, job.reject)
      }
    }
  })
}
