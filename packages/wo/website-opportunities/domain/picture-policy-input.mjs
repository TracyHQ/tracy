// The inputs of the picture policy (ticket #595, spec #577), checked before any frame is filled: every own picture is
// labelled, every light and dark pair is well formed, and the generated count the customer approved is read. Pure.
import { isLabelled, PicturePolicyError } from './picture-labelling.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const THEMES = ['light', 'dark']

/** Every own picture is labelled before it is placed (`labelOwnPictures`), or `picture_unlabelled` is thrown. */
export function checkLabelled(pictures) {
  const unlabelled = list(pictures).filter((p) => !p.stock && !isLabelled(p))
  if (unlabelled.length)
    throw new PicturePolicyError(
      'picture_unlabelled',
      'own pictures must be labelled before they are placed',
      {
        pictures: unlabelled.map((p) => p.id)
      }
    )
}

/**
 * The generated count the customer approved. `null` (the plan is being counted, nothing approved yet) allows every
 * drawable frame (no cap per site, D45); an approved count that is missing or not a whole number allows none, and says
 * so in a note.
 */
export function approvedCountOf(approved) {
  if (approved === null || approved === undefined) return { count: Number.POSITIVE_INFINITY, note: null }
  const given = approved?.generated?.frames
  if (Number.isInteger(given) && given >= 0) return { count: given, note: null }
  return {
    count: 0,
    note: {
      code: 'approved_count_invalid',
      given: given === undefined ? null : given,
      message: 'the plan approves no valid generated count, so no picture is generated'
    }
  }
}

/**
 * A picture pair holds like an icon pair: its variant names another frame of its scope, that base is no variant
 * itself, and the two declare different themes ("light" and "dark"). Anything else throws `picture_variant_invalid`.
 */
export function checkPicturePairs(frames, baseOf) {
  const byId = new Map(frames.map((f) => [f.id, f]))
  for (const f of frames.filter((v) => v.variantOf !== undefined)) {
    const base = byId.get(baseOf(f))
    const problem =
      !base || base === f || base.variantOf !== undefined
        ? 'variantOf names no base frame of its scope'
        : !THEMES.includes(f.theme) || !THEMES.includes(base.theme) || f.theme === base.theme
          ? 'a pair declares a light and a dark theme'
          : null
    if (problem) throw new PicturePolicyError('picture_variant_invalid', `${f.id}: ${problem}`, { at: f.id })
  }
}
