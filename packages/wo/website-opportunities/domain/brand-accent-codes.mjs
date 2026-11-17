// The stable code of the accent line of a plan's assumptions (#575 walk: a Vietnamese chat read the accent line in
// English while the logo line beside it was translated by its code). Every accent line code or the brand step writes
// carries a code and its parameters, so the plan card says it in the language of the chat; an English card keeps the
// plan's own sentence. Pure.
import {
  ACCENT_FROM_LOGO,
  ACCENT_LOGO_ADJUSTED,
  ACCENT_LOGO_UNMEASURED,
  ACCENT_LOGO_UNREADABLE,
  ACCENT_LOGO_WITHOUT_HUE,
  ACCENT_TEMPLATE_KEPT
} from './brand-look-accent.mjs'
import { oklchOf } from './brand-hue.mjs'

/** The codes of the accent line. */
export const ACCENT_CODES = Object.freeze({
  moved: 'accent_logo_moved',
  same: 'accent_logo_kept',
  noHue: 'accent_no_hue',
  unreadable: 'accent_unreadable',
  unmeasured: 'accent_kept_unmeasured',
  templateKept: 'accent_kept_template'
})

/** Which plain colours the no hue rules gave buttons: `both` (black on light pages, white on dark), else one. */
const plainOf = (accent, accentDark) => (accentDark ? 'both' : accent === '#ffffff' ? 'white' : 'black')

/**
 * The code and parameters of the accent line, or none when the source has no line code knows.
 * @param {string} from the accent's source (`ACCENT_*`)
 * @param {{accent: string, accentDark: string | null, brandColour?: string | null}} colours `brandColour`: the
 *   logo's own colour the accent was made from, when the record keeps it
 * @returns {{code?: string, params?: Record<string, string>}}
 */
export function accentCodeOf(from, { accent, accentDark, brandColour }) {
  if (from === ACCENT_FROM_LOGO || from === ACCENT_LOGO_ADJUSTED) {
    const was = oklchOf(brandColour ?? '')?.L
    const now = oklchOf(accent)?.L
    if (typeof was !== 'number' || typeof now !== 'number') return {}
    if (Math.abs(now - was) < 0.005) return { code: ACCENT_CODES.same }
    return { code: ACCENT_CODES.moved, params: { direction: now > was ? 'lighter' : 'darker' } }
  }
  if (from === ACCENT_LOGO_WITHOUT_HUE)
    return { code: ACCENT_CODES.noHue, params: { colours: plainOf(accent, accentDark) } }
  if (from === ACCENT_LOGO_UNREADABLE)
    return { code: ACCENT_CODES.unreadable, params: { colours: plainOf(accent, accentDark) } }
  if (from === ACCENT_LOGO_UNMEASURED) return { code: ACCENT_CODES.unmeasured }
  if (from === ACCENT_TEMPLATE_KEPT) return { code: ACCENT_CODES.templateKept }
  return {}
}
