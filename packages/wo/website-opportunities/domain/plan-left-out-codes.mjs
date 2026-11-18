// Every code a left out line of the plan card can carry (#575 stand: a Vietnamese card read "This stays off your site
// until you confirm it." and "You asked to take this off the plan." in English). The card says a line by its code
// only, so every sentence code writes has a code here, and the plan card has words for each code in every language
// it ships (`tracy-build-chat` test `plan-left-out-codes`). The sentences are the producers' own; this module only
// lists them:
// - `LEFT_OUT_SENTENCES`: a code with one sentence, the same for every entry;
// - `COUNTED_LEFT_OUT_CODES`: a code whose sentence names a number or a kind of item, said by the card from the
//   entry's `params` and kind;
// - `MODEL_LEFT_OUT_CODES`: the model's own words, which have no code of their own.
// Entries that never reach the card are not listed: sections (`kind: block`, never listed) and the picture spots of
// the template (`plan-left-out.mjs` in tracy-core, `TEMPLATE_SPOT_CODES`). Pure.
import { HELD_HOURS_LEFT_OUT, BRIEF_LEFT_OUT } from './plan-composer-brief.mjs'
import { WHATSAPP_UNCONFIRMED } from './plan-composer-channels.mjs'
import { CONTACT_VALUE_MISSING_REASON } from './plan-answers.mjs'
import { DATA_OVER_LIMIT_REASON } from './plan-data-limits.mjs'
import { HELD_BACK_REASONS } from './plan-held-back.mjs'
import { NEUTRAL_LEFT_OUT, NOTHING_TO_SHOW_CODE, NOTHING_TO_SHOW_REASON } from './plan-left-out-plain.mjs'
import { DERIVED_LEFT_OUT_REASONS, MODEL_REASON_CODE, STATED_REASON_CODE } from './plan-left-out-wording.mjs'
import { PAGE_NOT_PLANNED, PAGE_NOTHING_TO_SHOW } from './plan-left-out-pages.mjs'
import { OWNER_REMOVED, OWNER_REMOVED_REASON } from './plan-operations.mjs'
import { FACT_LEFT_OUT } from './plan-placement-facts.mjs'
import { REMOVED_PAGE_DATA_CODE, REMOVED_PAGE_DATA_REASON } from './plan-request-apply.mjs'
import {
  REMOVED_PAGE_CODE,
  REMOVED_PAGE_REASON,
  STALE_PAGE_CODE,
  STALE_PAGE_REASON
} from './plan-request-settled.mjs'
import { REQUESTED_OFF_CODE, REQUESTED_OFF_REASON } from './plan-request-taken-off.mjs'
import { CHILD_LIST_REASONS, NO_LIST_CODE, NO_LIST_REASON } from './plan-rows-fit.mjs'

/** Codes with one sentence each, the sentence the plan writes beside the code. */
export const LEFT_OUT_SENTENCES = Object.freeze({
  ...Object.fromEntries(Object.values(BRIEF_LEFT_OUT).map((e) => [e.code, e.reason])),
  ...Object.fromEntries(Object.values(HELD_HOURS_LEFT_OUT).map((e) => [e.code, e.reason])),
  [WHATSAPP_UNCONFIRMED.code]: WHATSAPP_UNCONFIRMED.reason,
  contact_value_missing: CONTACT_VALUE_MISSING_REASON,
  ...HELD_BACK_REASONS,
  ...DERIVED_LEFT_OUT_REASONS,
  [NOTHING_TO_SHOW_CODE]: NOTHING_TO_SHOW_REASON,
  ...Object.fromEntries(Object.values(FACT_LEFT_OUT).map((e) => [e.code, e.reason])),
  data_over_limit: DATA_OVER_LIMIT_REASON,
  ...Object.fromEntries(Object.entries(CHILD_LIST_REASONS).filter(([code]) => code !== 'list_below_min')),
  [NO_LIST_CODE]: NO_LIST_REASON,
  [PAGE_NOT_PLANNED.code]: PAGE_NOT_PLANNED.reason,
  [PAGE_NOTHING_TO_SHOW.code]: PAGE_NOTHING_TO_SHOW.reason,
  [REMOVED_PAGE_CODE]: REMOVED_PAGE_REASON,
  [STALE_PAGE_CODE]: STALE_PAGE_REASON,
  [REQUESTED_OFF_CODE]: REQUESTED_OFF_REASON,
  [REMOVED_PAGE_DATA_CODE]: REMOVED_PAGE_DATA_REASON,
  [OWNER_REMOVED]: OWNER_REMOVED_REASON
})

/**
 * Codes whose sentence the plan words for each entry (a number, a kind of item, a quoted value) or another step writes
 * (the video spot's, `plan-look-pictures.mjs`), and what the card says it from: `count` (`params.count`), `min`
 * (`params.min`), `why` (`params.why`), `kind` (the entry's kind, `item` or `feature`).
 */
export const COUNTED_LEFT_OUT_CODES = Object.freeze({
  left_out_neutral: ['kind'],
  no_gallery_room: ['count'],
  gallery_photo_shown_elsewhere: ['count'],
  library_section_refused: ['why'],
  no_room_left: ['kind'],
  fewer_than_section_needs: ['min'],
  section_below_minimum: ['min'],
  value_over_limit: [],
  no_fitting_video: []
})

/** The codes of the model's own words: kept as the model wrote them, in the language it wrote them. */
export const MODEL_LEFT_OUT_CODES = Object.freeze([MODEL_REASON_CODE, STATED_REASON_CODE])

/** Every code a left out line on the card can carry. */
export const LEFT_OUT_CODES = Object.freeze([
  ...new Set([...Object.keys(LEFT_OUT_SENTENCES), ...Object.keys(COUNTED_LEFT_OUT_CODES)])
])

/** The neutral sentence by kind, listed so a test can hold the card to it (`left_out_neutral`). */
export { NEUTRAL_LEFT_OUT }

/** The code of each sentence only one code writes (the row codes share a sentence, and always carry their own). */
const BY_SENTENCE = new Map(
  Object.entries(LEFT_OUT_SENTENCES)
    .filter(([, reason]) => Object.values(LEFT_OUT_SENTENCES).filter((r) => r === reason).length === 1)
    .map(([code, reason]) => [reason, code])
)

/**
 * The entries with the code of the sentence they carry, when they carry no code of their own or the model's: a
 * sentence code writes, carried through a change request as a model style entry (`carriedLeftOutOf`), or kept by a
 * plan stored before its code existed. Exact sentences only.
 */
export function withSentenceCodes(entries) {
  return entries.map((e) => {
    const own = typeof e?.code === 'string' && e.code !== '' && !MODEL_LEFT_OUT_CODES.includes(e.code)
    const code = own ? null : BY_SENTENCE.get(e?.reason)
    return code ? { ...e, code } : e
  })
}
