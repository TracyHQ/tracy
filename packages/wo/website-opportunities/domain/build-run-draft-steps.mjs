// The engine steps of a run assembled from an approved build draft (#597, #610) under Contract B's engine names
// (`build-run-events.mjs` `ENGINE_STEPS`), so a draft run's record goes straight into `progressEventOf` / `outcomeOf`.
// Pure. A draft run names its steps `doors`, `kit`, `brand`, `plan` (reading the approved plan and its look: after the
// approval, so part of the build, unlike the same names before approval in `PRE_APPROVAL_STEPS`), `copy` (every page
// at once), `pictures`, `icons`, `order`, `write`:
//   doors, kit, brand, plan  -> look
//   copy                     -> writer:<pageId>, one per page of the plan
//   pictures, icons          -> pictures, icons (one Contract B pictures step)
//   order, write             -> order, write (one Contract B write step)
// Any other line (the base site's `site` line of the frame) is left out. A stop of `copy` is carried by its first
// page; a stop of a step with no Contract B name is the frame's (`run`).
import { FRAME_STEP } from './build-run-events.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const READING = new Set(['doors', 'kit', 'brand', 'plan'])
const KEPT = new Set(['pictures', 'icons', 'order', 'write'])

/** Every step a draft run names, in the order it runs. */
export const DRAFT_RUN_STEPS = Object.freeze([
  'doors',
  'kit',
  'brand',
  'plan',
  'copy',
  'pictures',
  'icons',
  'order',
  'write'
])

/** The Contract B engine names one draft run step stands for (none for a step Contract B does not show). */
export function draftEngineNamesOf(step, pages) {
  if (READING.has(step)) return ['look']
  if (step === 'copy') return list(pages).map((p) => `writer:${p.id}`)
  if (KEPT.has(step)) return [step]
  return []
}

/** The record lines of a draft run under Contract B's engine names. */
export const draftEngineLinesOf = (lines, pages) =>
  list(lines).flatMap((line) => draftEngineNamesOf(line?.step, pages).map((step) => ({ ...line, step })))

/** A draft run's stop under Contract B's engine names: a stop of `copy` is carried by its first page. */
export function draftEngineStopOf(stop, pages) {
  if (!stop || typeof stop !== 'object') return null
  if (stop.step === FRAME_STEP) return stop
  const [step] = draftEngineNamesOf(stop.step, pages)
  return step ? { ...stop, step } : { ...stop, step: FRAME_STEP }
}

/**
 * The Contract B input of a draft run's measurement (`timings.chain` of its brief row: `{steps, running, stop}`):
 * `{record, running, stop}` for `progressEventOf` / `outcomeOf`, beside the plan's `pages`.
 */
export function draftRunInputOf(chain, pages) {
  return {
    record: draftEngineLinesOf(chain?.steps, pages),
    running: [...new Set(list(chain?.running).flatMap((s) => draftEngineNamesOf(s, pages)))],
    stop: draftEngineStopOf(chain?.stop, pages)
  }
}
