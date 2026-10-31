/**
 * The brief's photograph labelling, run beside the request instead of inside it (#250).
 *
 * Labelling every photograph of a brief with the vision model (`brief-picture-labels.js`) took 112 s on a business with
 * 36 photographs, and `chat/prepare` of Build from my business held the page for all of it. Here the labelling of one
 * input runs once, in the background: it starts as soon as the research is done (`warm`, while the person still chooses
 * a template) or at the latest when the brief is asked for; the brief asks `answer`, which never waits.
 *
 * 🔒 A BRIEF NEVER READS HALF-MADE LABELS AS FINAL. While the run of the brief's input is still labelling, `answer`
 * says pending (the caller answers `DEMO_PICTURE_LABELS_PENDING` with when to ask again, and makes no brief). Only the
 * run's own settled answer is final: every label it made, and why each other photograph is unlabelled.
 * 🔒 BOUNDED. A run still out after `overdueMs` answers an honest failed labelling (`labelling_overdue`): the brief is
 * made with no vision labels and says why, never with invented ones, and never later than that.
 * 🔒 ONE RUN PER INPUT. The run is keyed by what the labelling reads (the photographs' ids and bytes, the brand, the
 * trade, the closed list, the name), so a research that changed is labelled again and the same one never twice. The
 * runs live in this process; after a restart the next ask starts a new run, which finds the labels already paid for in
 * the shared cache (`media-analysis.js`).
 */
import { createHash } from 'node:crypto'
import { failedPictureLabelling } from './revisions.js'

export const PICTURE_LABELS_PENDING = 'DEMO_PICTURE_LABELS_PENDING'
/** How long a run may label before a brief is made without its labels. */
export const PICTURE_LABELS_OVERDUE_MS = 5 * 60_000
/** How long a settled run's answer is kept for the brief that asks for it. */
const KEEP_MS = 30 * 60_000
/** When a pending caller asks again. */
const RETRY_MS = 4_000

/** The identity of a labelling input: what the labelling reads, never the labels a picture already carries. */
export function pictureLabelKey(input) {
  const media = (input?.media ?? []).map((m) => [
    m?.id ?? null,
    m?.sha256 ?? null,
    m?.kind ?? null,
    m?.width ?? null,
    m?.height ?? null,
    m?.origin ?? null
  ])
  return createHash('sha256')
    .update(
      JSON.stringify([
        input?.accountId ?? null,
        media,
        input?.brand ?? null,
        input?.trade ?? null,
        input?.closedList ?? null,
        input?.businessName ?? null
      ])
    )
    .digest('hex')
}

/**
 * @param {{label: (input: object) => Promise<{labels: Map<string, any>, note: object}>, now?: () => number,
 *   overdueMs?: number, log?: {warn?: Function}}} deps - `label`: the brief's labelling (`createBriefPictureLabels`)
 */
export function createPictureLabelRuns({
  label,
  now = Date.now,
  overdueMs = PICTURE_LABELS_OVERDUE_MS,
  log = console
}) {
  /** @type {Map<string, {startedAt: number, settledAt: number | null, answer: any, promise: Promise<void>}>} */
  const runs = new Map()

  function prune() {
    const at = now()
    for (const [key, run] of runs)
      if (run.settledAt !== null && at - run.settledAt > KEEP_MS) runs.delete(key)
      else if (run.settledAt === null && at - run.startedAt > KEEP_MS) runs.delete(key)
  }

  /** The run of this input, started now when there is none. */
  function start(input) {
    const key = pictureLabelKey(input)
    const held = runs.get(key)
    if (held) return held
    prune()
    /** @type {{startedAt: number, settledAt: number | null, answer: any, promise: Promise<void>}} */
    const run = { startedAt: now(), settledAt: null, answer: null, promise: Promise.resolve() }
    run.promise = Promise.resolve()
      .then(() => label(input))
      .catch((error) => {
        log.warn?.(`[brief pictures] the labelling run failed (${error?.code ?? error?.message ?? error})`)
        return failedPictureLabelling('vision_failed')
      })
      .then((answer) => {
        run.answer = answer
        run.settledAt = now()
      })
    runs.set(key, run)
    return run
  }

  return {
    start,
    /**
     * The labelling a brief made now reads: the settled answer of this input's run, or `{pending, retryAt}` while it
     * still labels (started here when no run holds it), or a failed labelling once it is overdue.
     * @returns {{labelling: {labels: Map<string, any>, note: object}} | {pending: true, retryAt: number}}
     */
    answer(input) {
      const run = start(input)
      if (run.settledAt !== null) return { labelling: run.answer }
      if (now() - run.startedAt >= overdueMs)
        return { labelling: failedPictureLabelling('labelling_overdue') }
      return { pending: true, retryAt: now() + RETRY_MS }
    },
    /** Settles when every run started so far has (tests). */
    idle: () => Promise.all([...runs.values()].map((r) => r.promise)).then(() => {})
  }
}
