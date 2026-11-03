// The size guard of the site planner's fix round change lists: the shared guard of lib/bench-change-size.js (#327),
// worded for a plan.
import { smallEditsMessage as smallEditsMessageFor } from '../lib/bench-change-size.js'

export {
  LARGE_REPLACEMENT_BYTES,
  measureReplacement,
  oversizedReplacements,
  sizeOf,
  UNCHANGED_SHARE,
  unchangedSize
} from '../lib/bench-change-size.js'

/** Sent once in a fix round whose change list has oversized replacements; its answer counts as the same round. */
export const smallEditsMessage = (oversized) => smallEditsMessageFor(oversized, { noun: 'plan' })
