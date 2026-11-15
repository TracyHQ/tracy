// The model left out reasons code replaces with its own sentence (#609, sixth real run), so a wording fault never
// costs the owner a retry and a reason never says what the plan contradicts. Each replacement is a mechanical fix of
// the gate (`plan-gate-fixes.mjs` rule: nothing the site shows changes, only the words of an entry), recorded in
// `fixes` by `plainModelLeftOut` (`plan-left-out-wording.mjs`):
// - a reason with a build word ("fields", "CTA", a block id) takes the sentence code knows for the entry's section
//   (`derivedReasonOf`), else a neutral sentence that is true of every left out entry (`left_out_neutral`);
// - a section reason saying it has no data to show takes the sentence of a section with nothing to show
//   (`no_items_to_show`);
// - a section reason saying the business has no logo, on a plan whose look has a logo (its own or one Tracy drew),
//   is not true of the plan: it takes the sentence code knows, else the neutral one;
// - a photo reason saying the galleries have no room takes the sentence of a photo no gallery has room for
//   (`no_gallery_room`), which `withCountedReasons` then words for the number of photos left out that way, with
//   `params.count`, so "26 photos" never reads "this photo". Pure.
import { SECTION_LABELS } from './plan-gate-fixes.mjs'

/** The code of the neutral sentence, and the sentence by entry kind. */
export const NEUTRAL_LEFT_OUT_CODE = 'left_out_neutral'
export const NEUTRAL_LEFT_OUT = Object.freeze({
  page: 'This page is not part of your plan.',
  block: 'This section is not part of your plan.',
  item: 'This is not shown on your plan.',
  feature: 'This is not shown on your plan.'
})
export const NOTHING_TO_SHOW_CODE = 'no_items_to_show'
export const NOTHING_TO_SHOW_REASON = 'You have nothing yet for this section to show.'
export const GALLERY_ROOM_CODE = 'no_gallery_room'
/** The sentence of photos no gallery has room for, agreeing with their number. */
export const galleryRoomReason = (count) =>
  count === 1
    ? 'No gallery has room for this photo. It stays with your photos and may be used elsewhere on the site.'
    : `No gallery has room for these ${count} photos. They stay with your photos and may be used elsewhere on the site.`

const NOTHING = /\b(?:no|nothing)\b[^.]*\b(?:data|content|information|details)\b[^.]*\bto show\b/i
const NO_LOGO = /\b(?:no|without(?: a| any)?)\s+logos?\b/i
const PHOTO_ROOM =
  /\bmore photos\b|\b(?:no|not enough)\s+(?:room|space)\b|\bgaller(?:y|ies)\b[^.]*\bcan show\b/i

/** The block type a section label names (`Footer` is `footer`, `Page header` a hero), or null. */
const typeOfLabel = (what) =>
  what === 'Page header'
    ? 'hero'
    : (Object.entries(SECTION_LABELS).find(([, name]) => name === what)?.[0] ?? null)

/**
 * The sentence code writes in place of a model reason, or null to keep the model's.
 * @param {{what: string, kind: string, reason: string, item?: string}} entry the entry after its naming
 * @param {{data: object, blocks: Map<string, object>, look?: object, internal: boolean,
 *   derive: (description: object) => {code: string, reason: string} | null}} context `internal`: the reason holds a
 *   build word; `derive`: the reason code knows for a block of the store
 * @returns {{code: string, reason: string, rule: string} | null}
 */
export function replacedReasonOf(entry, { data, blocks, look, internal, derive }) {
  const { kind, reason } = entry
  const known = () => {
    const type = kind === 'block' ? typeOfLabel(entry.what) : null
    const description = type ? [...blocks.values()].find((d) => d?.type === type) : null
    const derived = description ? derive(description) : null
    return derived ?? { code: NEUTRAL_LEFT_OUT_CODE, reason: NEUTRAL_LEFT_OUT[kind] ?? NEUTRAL_LEFT_OUT.item }
  }
  if (entry.item !== undefined && data.byId.get(entry.item)?.kind === 'gallery' && PHOTO_ROOM.test(reason))
    return {
      code: GALLERY_ROOM_CODE,
      reason: galleryRoomReason(1),
      rule: 'a photo no gallery has room for is said by code'
    }
  if (kind === 'block' && NOTHING.test(reason))
    return {
      code: NOTHING_TO_SHOW_CODE,
      reason: NOTHING_TO_SHOW_REASON,
      rule: 'a section with nothing to show is said by code'
    }
  if (kind === 'block' && NO_LOGO.test(reason) && look?.logo?.kind === 'own')
    return {
      ...known(),
      rule: 'a reason that says there is no logo, on a plan with a logo, is not true of the plan'
    }
  if (internal)
    return { ...known(), rule: 'a left out reason with a build word takes the sentence code writes for it' }
  return null
}

/**
 * The entries with each reason that depends on how many entries share it worded for that number, with
 * `params.count`: the photos no gallery has room for.
 */
export function withCountedReasons(entries) {
  const count = entries.filter((e) => e.code === GALLERY_ROOM_CODE).length
  if (count === 0) return entries
  return entries.map((e) =>
    e.code === GALLERY_ROOM_CODE ? { ...e, reason: galleryRoomReason(count), params: { count } } : e
  )
}
