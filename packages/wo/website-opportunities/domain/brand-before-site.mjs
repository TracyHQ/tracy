// The brand step before the site exists (ticket #616). The brand step itself is the existing locked brand bench (prompt
// v10, 21 decisions): it reads the `brand` part of the stored research brief and the template kit, never a site, and
// writes a brand file. This module is the pure part: it reads that brand file, with the brief it was made from, as the
// record the plan composer shows on the plan card (`brandLookOf`), and turns the record into the plan's look section
// (`lookOfBrandRecord`). Where the accent comes from when the step kept the template's accent is decided in
// `brand-look-accent.mjs` (the product owner's rules of 13/11), never by the template silently.
import {
  ACCENT_FROM_LOGO,
  ACCENT_LOGO_ADJUSTED,
  ACCENT_LOGO_UNMEASURED,
  ACCENT_LOGO_UNREADABLE,
  ACCENT_LOGO_WITHOUT_HUE,
  ACCENT_NO_LOGO,
  accentOfBrandFile,
  researchLogoIdOf
} from './brand-look-accent.mjs'
import { unreadableSaid } from './brand-look-adjust.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'

export {
  ACCENT_FROM_LOGO,
  ACCENT_LOGO_ADJUSTED,
  ACCENT_LOGO_UNMEASURED,
  ACCENT_LOGO_UNREADABLE,
  ACCENT_LOGO_WITHOUT_HUE,
  ACCENT_NO_LOGO
}

/** The schema of the record `brandLookOf` returns, and the brand file version it reads (prompt v10). */
export const BRAND_LOOK_SCHEMA = 'tracy-brand-look/v1'
export const BRAND_FILE_VERSION = 10

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/** How the customer reads where a logo came from, per `logoResearch.chosen.source` of the research. */
export const LOGO_SOURCE_NAMES = Object.freeze({
  website: 'Website',
  google: 'Google listing',
  instagram: 'Instagram profile',
  facebook: 'Facebook page',
  tiktok: 'TikTok profile'
})
export const logoSourceName = (source) =>
  LOGO_SOURCE_NAMES[source] ?? (isText(source) ? source : 'Your pages')

/** A brand step failure, with a code the step chain reports; `noRerun` when a second run cannot change it. */
export class BrandStepError extends Error {
  constructor(code, message, details = {}, { noRerun = false } = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
    if (noRerun) this.noRerun = true
  }
}

/** The owner task the brand step adds when the logo it set is temporary (`gate-finish.js`). */
const TEMPORARY_LOGO_TASK = 'replace-temporary-logo'
/** Where a made logo came from: the brand step made it, for the business has no usable logo. */
export const LOGO_MADE = 'made-temporary'

/**
 * Whether the brand step set a temporary logo it made itself: a lettermark, or any mark with the owner task that asks
 * for the real logo (an icon in the accent with no logo). A logo rebuilt from the business's own logo is not.
 */
const madeLogo = (brandFile) =>
  brandFile.logo?.mark?.decision === 'lettermark' ||
  list(brandFile.ownerTasks).some((task) => task?.kind === TEMPORARY_LOGO_TASK)

/**
 * The look record of one brand file: the accent with where it came from, and the logo with where it came from.
 * @param {{brandFile: object, brief: object, kit?: object}} input the brand step's brand file (version 10), the research
 *   brief it was made from (only `brief.brand` is read: the logo's colours and research source) and the template kit
 *   it ran on (`accentOfBrandFile`; required when the logo has no hue or its colour is adjusted); `minRatio` only to
 *   test the fallback of an adjusted colour
 * @returns {{schema: string, kit: string, name: string | null, accent: ReturnType<typeof accentOfBrandFile>,
 *   logo: {kind: 'own', from: string, source: string, mediaId: string, mark: string} |
 *     {kind: 'made', from: string, mark: string, mediaId: string | null}}} a `made` logo is the temporary one the step
 *   made; `mediaId` is the business's logo it could not use, or null when it has none
 * @throws {BrandStepError} `brand_file_unreadable` (`noRerun`) when the file is not a brand file of the version read
 *   here, or its colours cannot be read with the kit
 */
export function brandLookOf({ brandFile, brief, kit, minRatio }) {
  const unreadable = (why) => new BrandStepError('brand_file_unreadable', why, {}, { noRerun: true })
  if (!isObject(brandFile) || brandFile.kind !== 'brand-file') throw unreadable('not a brand file')
  if (brandFile.version !== BRAND_FILE_VERSION)
    throw unreadable(`brand file version ${JSON.stringify(brandFile.version)}, ${BRAND_FILE_VERSION} is read`)
  const accent = accentOfBrandFile({ brandFile, brief, kit, minRatio })
  if (accent.problem) throw unreadable(accent.problem)
  const material = brandFile.logo?.material
  const mark = brandFile.logo?.mark?.decision
  if (!isText(mark)) throw unreadable('logo.mark.decision is missing')
  const usedId = isObject(material) && isText(material.mediaId) ? material.mediaId : null
  // A logo the research found but the step did not use (its safe version writes `material: null`) is still the
  // business's logo: a made logo says so ("could not be used"), never "no logo was found".
  const mediaId = usedId ?? researchLogoIdOf(brief)
  const chosen = brief?.brand?.logoResearch?.chosen
  const logo =
    usedId && !madeLogo(brandFile)
      ? {
          kind: 'own',
          from: isText(chosen?.source) ? chosen.source : 'unknown',
          source: logoSourceName(chosen?.source),
          mediaId,
          mark
        }
      : { kind: 'made', from: LOGO_MADE, mark, mediaId }
  const name = isText(brandFile.name?.value) ? brandFile.name.value : null
  return { schema: BRAND_LOOK_SCHEMA, kit: brandFile.kit ?? null, name, accent, logo }
}

/** Whether a value is a look record of `brandLookOf`. */
export const isBrandLook = (brand) => isObject(brand) && brand.schema === BRAND_LOOK_SCHEMA

/** What the made logo shows, per the brand step's mark decision. */
const MADE_MARKS = Object.freeze({ icon: 'a simple icon of your trade', lettermark: 'your initials' })
/** What the customer reads about a temporary logo: none found (in the template's accent), or theirs unusable. */
function madeLogoSaid(logo) {
  const shows = MADE_MARKS[logo.mark] ?? 'a simple mark'
  return logo.mediaId
    ? `Your logo could not be used as it is, so a temporary one was made for you: ${shows} beside your business name. Send us your logo file to replace it.`
    : `No logo was found, so a temporary one was made for you: ${shows} beside your business name, in the template's accent colour. Send us your logo to replace it.`
}
/** What the customer reads about a black and white accent, per the themes it is worn on. */
function noHueSaid(accent, accentDark) {
  if (accentDark)
    return 'Your logo has no colour, so buttons and links are black on the light theme and white on the dark theme.'
  return `Your logo has no colour, so buttons and links are ${accent === '#ffffff' ? 'white' : 'black'}.`
}

const brandMissing = (why) => new PlanComposerError('brand_missing', why, {}, { noRerun: true })

/** How the customer reads where the accent came from, per its source. */
const ACCENT_NAMES = Object.freeze({
  [ACCENT_FROM_LOGO]: 'Your logo',
  [ACCENT_LOGO_WITHOUT_HUE]: 'Your logo, which has no colour',
  [ACCENT_LOGO_ADJUSTED]: 'Your logo, made darker or lighter to read',
  [ACCENT_LOGO_UNREADABLE]: 'Your logo, whose colour cannot read on buttons',
  [ACCENT_NO_LOGO]: 'The template, as you have no logo'
})

/**
 * The plan's look section from the template and the brand step's record, the assumptions it brings, and where the
 * accent and the logo came from (`sources`, kept beside the plan: Contract B's look section has no field for them). A
 * made logo is a text logo on the plan (Contract B knows `own` and `text` only), with a line saying it is temporary.
 * @param {{slug: string, name: string, version: string, accent?: string}} template the chosen template
 * @param {object} record the record of `brandLookOf`
 * @throws {PlanComposerError} `brand_missing` when there is no record or it is broken;
 *   `brand_logo_colours_unmeasured` when the logo's colours were never measured, so no rule can read its accent
 */
export function lookOfBrandRecord(template, record) {
  if (!isBrandLook(record)) throw brandMissing('no brand step result was given')
  const from = record.accent?.from
  if (from === ACCENT_LOGO_UNMEASURED)
    throw new PlanComposerError(
      'brand_logo_colours_unmeasured',
      'the brand step kept the template accent and the colours of the logo were never measured',
      { why: record.accent.why ?? null },
      { noRerun: true }
    )
  if (!ACCENT_NAMES[from] || !HEX_COLOUR.test(record.accent.hex ?? ''))
    throw brandMissing('the brand step result has no accent')
  const assumptions = []
  const accent = record.accent.hex.toLowerCase()
  const accentDark = HEX_COLOUR.test(record.accent.dark ?? '') ? record.accent.dark.toLowerCase() : null
  const sources = { accent: { from, name: ACCENT_NAMES[from] } }
  // The logo's own colour that happens to be the template's accent is said so, for the look check to accept it.
  const ownColour = from === ACCENT_FROM_LOGO || from === ACCENT_LOGO_ADJUSTED
  if (ownColour && [accent, accentDark].includes(String(template?.accent ?? '').toLowerCase()))
    sources.accent.sameAsTemplate = true
  if (ownColour && isText(record.accent.say))
    assumptions.push({ id: 'accent', field: 'look.accent', said: record.accent.say })
  if (from === ACCENT_LOGO_WITHOUT_HUE)
    assumptions.push({ id: 'accent', field: 'look.accent', said: noHueSaid(accent, accentDark) })
  if (from === ACCENT_LOGO_UNREADABLE)
    assumptions.push({ id: 'accent', field: 'look.accent', said: unreadableSaid(accent, accentDark) })
  let logo
  if (record.logo?.kind === 'own' && isText(record.logo.source)) {
    logo = { kind: 'own', source: record.logo.source }
    sources.logo = { from: record.logo.from, name: record.logo.source }
  } else if (record.logo?.kind === 'made') {
    logo = { kind: 'text' }
    sources.logo = { from: LOGO_MADE, name: 'A temporary logo made for you' }
    assumptions.push({ id: 'logo', field: 'look.logo', said: madeLogoSaid(record.logo) })
  } else throw brandMissing('the brand step result has no logo')
  // The template's accent goes only with a business that has no logo at all: anything else is a broken record.
  const noLogo = record.logo.kind === 'made' && !record.logo.mediaId
  if (noLogo !== (from === ACCENT_NO_LOGO))
    throw brandMissing('the accent and the logo of the brand step result disagree')
  const { slug, name, version } = template ?? {}
  return {
    look: { template: { slug, name, version }, accent, ...(accentDark ? { accentDark } : {}), logo },
    assumptions,
    sources
  }
}
