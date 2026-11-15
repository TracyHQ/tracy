// The logo the brand step hands over, said truthfully. The locked brand step (prompt v10) always builds the site's
// logo the same way: a mark (cut out of the logo the research found, an icon an image model drew, or a lettermark)
// beside the business name set in the template's heading font by code (`compose_logo`, `set_name`). No brand tool
// writes the found logo file as a logo, so no file the step hands over is the business's own file under a mechanical
// change: it is a logo Tracy drew, based on the business's logo. Whether it is that or a temporary logo is read from
// the brand file in `brand-before-site.mjs`; this module holds the reason and the words the customer reads.

/** Where a drawn logo came from: Tracy drew it, based on the business's logo the research found. */
export const LOGO_DRAWN = 'drawn-from-logo'

/** How the customer reads where a drawn logo came from (the plan's `lookSources.logo.name`). */
export const DRAWN_LOGO_NAME = 'A logo Tracy drew, based on your logo'

/** Why a logo is drawn, per the brand step's mark decision; any other mark still sits beside a name set by code. */
const DRAWN_REASONS = Object.freeze({ icon: 'new-symbol-drawn', cut: 'symbol-cut-from-logo' })
const NAME_SET_BY_CODE = 'name-set-in-template-font'
export const drawnReasonOf = (mark) => DRAWN_REASONS[mark] ?? NAME_SET_BY_CODE

/** What the drawn logo shows beside the name, per its reason. */
const SHOWS = Object.freeze({
  'new-symbol-drawn': 'a new symbol of your trade',
  'symbol-cut-from-logo': 'the symbol cut from your logo',
  [NAME_SET_BY_CODE]: 'a mark'
})

/**
 * The plan's `look.logo.source` of a drawn logo: Tracy, and where the logo it is based on was found.
 * @param {string | null} sourceName the customer's name of the research source (`logoSourceName`), or null if unknown
 */
export function drawnSourceOf(sourceName) {
  if (!sourceName) return 'Tracy, based on your logo'
  return `Tracy, based on the logo on your ${sourceName === 'Website' ? 'website' : sourceName}`
}

/** The plan's sentence (Contract B: at most 200 characters) that the logo is drawn, what it shows, how to replace it. */
export function drawnLogoSaid(reason) {
  const shows = SHOWS[reason] ?? SHOWS[NAME_SET_BY_CODE]
  return `Tracy drew a logo based on your logo: ${shows} beside your business name, set in the template's font. It is not your logo file. Approve it, or send us your logo to replace it.`
}
