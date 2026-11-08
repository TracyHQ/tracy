// Who answers for demo words a page still shows (card AS, 2026-11-06). The host reports the words, not the slot. When they are the
// demo words of a slot the write report says was ordered and not written (the plugin refused it and no fallback took it off), the
// writer gave words and the write step did not put them on the site: that is step 9's, not the writer's step 6.
import { visibleText } from '../lib/site-copy/emphasis-markup.js'
import { WRITE_STEP } from '../lib/site-build-steps.js'
import { kitSlotIndex } from '../lib/template-kit/kit-slots.js'

const each = (value) => (Array.isArray(value) ? value : [])
const words = (text) => visibleText(text).toLowerCase()
/** Demo words shorter than this say too little to name one slot. */
const MIN_WORDS = 6

/** The kit's text slots with their demo words, by id (demo-owned slots included). */
function demoWords(kit) {
  const out = new Map()
  for (const [id, slot] of kitSlotIndex(kit))
    if (typeof slot.sample === 'string') out.set(id, words(slot.sample))
  return out
}

/**
 * @param {{ measured?: string | null, slot?: string | null }} failure a demo-words failure of the host
 * @param {{ report?: object, kit?: object | null }} context
 * @returns {object | null} the failure blamed on step 9, or null to leave it as it is
 */
export function demoLeftByWrite(failure, { report, kit }) {
  const seen = typeof failure?.measured === 'string' ? words(failure.measured) : ''
  if (seen.length < MIN_WORDS || !kit) return null
  const demo = demoWords(kit)
  const left = each(report?.slots).find((line) => {
    if (!['failed', 'refused'].includes(line?.status) || typeof line.ordered !== 'string') return false
    const sample = demo.get(line.slot)
    return Boolean(sample) && (sample === seen || sample.includes(seen) || seen.includes(sample))
  })
  if (!left) return null
  return {
    ...failure,
    slot: left.slot,
    causingStep: WRITE_STEP,
    reason: `${failure.reason}; the write step was given words for ${left.slot} and did not write them (${left.reason ?? left.status}), so its demo text shows`
  }
}
