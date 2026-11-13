// The inputs of the picture policy (ticket #595, spec #577), checked before any frame is filled: every own picture is
// labelled and every light and dark pair is well formed. Pure.
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
