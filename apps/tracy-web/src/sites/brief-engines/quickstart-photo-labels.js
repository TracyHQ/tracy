/**
 * THE BRIEF'S PHOTOS ARE LABELLED BEFORE THE WRITE CLOCK (item 24).
 *
 * The quickstart workflow asks the vision model what each photo shows in picture preparation, under the drawing budget
 * (`picture-preparation.js`), and keeps each label on its photo (`site-pictures.js`). Apply reads those labels and asks
 * no model (`forSite({label: false})`). A photo the budget left unlabelled is placed by its words, the fallback every
 * unlabelled photo already has (`picture-labels.mjs`, `subjectFrom: 'words'`), and the build's receipt counts it.
 *
 * 🔒 A BATCH IS NEVER CUT IN HALF. A vision call aborted mid-flight leaves its paid attempt uncertain, and an uncertain
 * attempt blocks every later call of the same quality run, the words included. So a batch is started only while the
 * picture budget can still hold it (the slowest batch so far, or `FIRST_BATCH_MS` before the first), and a started
 * batch is not aborted by the picture deadline, only by the build's own signal.
 */

/** Pictures in one vision call, as the quickstart labeller sends them. */
const BATCH = 8
/** Batches in flight at once (item 27): a round of misses takes one batch's time, not four. */
export const PICTURE_BATCHES_IN_FLIGHT = 4
/** What the first batch is assumed to take, before one has been measured. */
const FIRST_BATCH_MS = 60_000
/** What a drawing round is assumed to take, before one has been measured. */
const FIRST_DRAW_MS = 25_000

/**
 * The picture phase's clock, sized by its work (item 27): a short base, one slowest batch per round of misses, one
 * drawing round each, held between one minute and eight.
 * @param {{misses: number, inFlight?: number, p95BatchMs?: number | null, drawRounds?: number,
 *   p95DrawMs?: number | null}} work - `misses`: the photos with no label yet
 */
export function picturePhaseMs({
  misses,
  inFlight = PICTURE_BATCHES_IN_FLIGHT,
  p95BatchMs,
  drawRounds = 0,
  p95DrawMs
}) {
  const rounds = Math.ceil(Math.max(0, misses) / (BATCH * Math.max(1, inFlight)))
  const ms =
    15_000 + rounds * (p95BatchMs || FIRST_BATCH_MS) + Math.max(0, drawRounds) * (p95DrawMs || FIRST_DRAW_MS)
  return Math.min(8 * 60_000, Math.max(60_000, ms))
}

/** The 95th percentile of measured durations, or null before any. */
export function p95(durations) {
  const sorted = (durations ?? []).filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : null
}

/**
 * The build's vision door, labelling only the batches the picture budget can hold, `inFlight` at a time.
 * @param {any} vision - the quickstart model's `generate.vision`; null or undefined is handed back as it is
 * @param {{deadlineAt: number, stop?: AbortSignal, now?: () => number, inFlight?: number,
 *   firstBatchMs?: number | null}} budget - `stop`: the picture phase's own signal; `firstBatchMs`: the learned p95
 */
export function labelWithinBudget(
  vision,
  { deadlineAt, stop, now = Date.now, inFlight = PICTURE_BATCHES_IN_FLIGHT, firstBatchMs = null }
) {
  if (!vision) return vision
  let slowest = 0
  return {
    ...vision,
    label: async ({ pictures, ...rest }) => {
      const labels = new Map()
      const usage = { calls: 0, promptTokens: 0, completionTokens: 0, requests: [] }
      const batchMs = []
      let deferred = 0
      let failed = 0
      const batches = []
      for (let n = 0; n < pictures.length; n += BATCH) batches.push(pictures.slice(n, n + BATCH))
      for (let b = 0; b < batches.length; b += Math.max(1, inFlight)) {
        // A round starts only while the budget can hold its slowest batch; a started batch is never cut.
        if (stop?.aborted || now() + (slowest || firstBatchMs || FIRST_BATCH_MS) > deadlineAt) {
          deferred = batches.slice(b).reduce((sum, batch) => sum + batch.length, 0)
          break
        }
        const round = batches.slice(b, b + Math.max(1, inFlight))
        const settled = await Promise.allSettled(
          round.map(async (batch) => {
            const started = now()
            const answer = await vision.label({ ...rest, pictures: batch })
            const took = now() - started
            batchMs.push(took)
            slowest = Math.max(slowest, took)
            return answer
          })
        )
        const broken = settled.find((r) => r.status === 'rejected')
        for (const r of settled) {
          if (r.status !== 'fulfilled') continue
          const answer = r.value
          for (const [id, value] of answer.labels) labels.set(id, value)
          failed += answer.failed ?? 0
          usage.calls += answer.usage?.calls ?? 0
          usage.promptTokens += answer.usage?.promptTokens ?? 0
          usage.completionTokens += answer.usage?.completionTokens ?? 0
          usage.requests.push(...(answer.usage?.requests ?? []))
        }
        if (broken) throw broken.reason
      }
      return { labels, usage, failed, deferred, batchMs }
    }
  }
}

/**
 * The receipt of the photo labels a build placed with: labelled in preparation, and left to the words fallback.
 * @param {any} prepared - what picture preparation handed back (`photoLabels`), null when it did not run or ran out
 * @param {any} real - apply's read of the photos (`forSite({label: false})`)
 */
export function photoLabelReceipt(prepared, real) {
  const pictures = real?.pictures ?? []
  return {
    phase: 'picture-preparation',
    labelledBeforeApply: prepared?.labelled ?? 0,
    calls: prepared?.calls ?? 0,
    deferred: prepared?.deferred ?? 0,
    // Each vision batch's duration in preparation (item 27): what the picture clock's p95 is learned from.
    batchMs: prepared?.batchMs ?? [],
    labelled: pictures.filter((picture) => picture.vision).length,
    unlabelled: real?.vision?.unlabelled ?? 0,
    fallback: (real?.vision?.unlabelled ?? 0) > 0 ? 'words' : null
  }
}
