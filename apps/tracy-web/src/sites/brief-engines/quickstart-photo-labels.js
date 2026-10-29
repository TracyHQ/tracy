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
/** What the first batch is assumed to take, before one has been measured. */
const FIRST_BATCH_MS = 60_000

/**
 * The build's vision door, labelling only the batches the picture budget can hold.
 * @param {any} vision - the quickstart model's `generate.vision`; null or undefined is handed back as it is
 * @param {{deadlineAt: number, stop?: AbortSignal, now?: () => number}} budget - `stop`: the picture phase's own signal
 */
export function labelWithinBudget(vision, { deadlineAt, stop, now = Date.now }) {
  if (!vision) return vision
  let slowest = 0
  return {
    ...vision,
    label: async ({ pictures, ...rest }) => {
      const labels = new Map()
      const usage = { calls: 0, promptTokens: 0, completionTokens: 0, requests: [] }
      let deferred = 0
      let failed = 0
      for (let n = 0; n < pictures.length; n += BATCH) {
        if (stop?.aborted || now() + (slowest || FIRST_BATCH_MS) > deadlineAt) {
          deferred = pictures.length - n
          break
        }
        const started = now()
        const answer = await vision.label({ ...rest, pictures: pictures.slice(n, n + BATCH) })
        slowest = Math.max(slowest, now() - started)
        for (const [id, value] of answer.labels) labels.set(id, value)
        failed += answer.failed ?? 0
        usage.calls += answer.usage?.calls ?? 0
        usage.promptTokens += answer.usage?.promptTokens ?? 0
        usage.completionTokens += answer.usage?.completionTokens ?? 0
        usage.requests.push(...(answer.usage?.requests ?? []))
      }
      return { labels, usage, failed, deferred }
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
    labelled: pictures.filter((picture) => picture.vision).length,
    unlabelled: real?.vision?.unlabelled ?? 0,
    fallback: (real?.vision?.unlabelled ?? 0) > 0 ? 'words' : null
  }
}
