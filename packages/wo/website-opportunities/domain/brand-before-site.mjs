// The brand step before the site exists (ticket #616). The brand step itself is the existing locked brand bench (prompt
// v10, 21 decisions): it reads the `brand` part of the stored research brief and the template kit, never a site, and
// writes a brand file. This module is the pure part: it reads that brand file, with the brief it was made from, as the
// record the plan composer shows on the plan card (`brandLookOf`), and turns the record into the plan's look section
// (`lookOfBrandRecord`). Where the accent comes from when the step kept the template's accent is decided in
// `brand-look-accent.mjs` (the product owner's rules of 13/11), never by the template silently.
import {
  ACCENT_FROM_LOGO,
  ACCENT_LOGO_WITHOUT_HUE,
  ACCENT_NO_LOGO,
  ACCENT_UNSETTLED,
  accentOfBrandFile
} from './brand-look-accent.mjs'
import { PlanComposerError } from './plan-composer-error.mjs'

export { ACCENT_FROM_LOGO, ACCENT_LOGO_WITHOUT_HUE, ACCENT_NO_LOGO, ACCENT_UNSETTLED }

/** The schema of the record `brandLookOf` returns, and the brand file version it reads (prompt v10). */
export const BRAND_LOOK_SCHEMA = 'tracy-brand-look/v1'
export const BRAND_FILE_VERSION = 10
/** Where a text logo came from: the business's own name, set by code. */
export const LOGO_FROM_NAME = 'business-name'

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isText = (value) => typeof value === 'string' && value.trim() !== ''

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

/**
 * The look record of one brand file: the accent with where it came from, and the logo with where it came from.
 * @param {{brandFile: object, brief: object, kit?: object}} input the brand step's brand file (version 10), the research
 *   brief it was made from (only `brief.brand` is read: the logo's colours and research source) and the template kit
 *   it ran on (`accentOfBrandFile`)
 * @returns {{schema: string, kit: string, name: string | null, accent: ReturnType<typeof accentOfBrandFile>,
 *   logo: {kind: 'own', from: string, source: string, mediaId: string, mark: string} |
 *     {kind: 'text', from: string, mark: string}}}
 * @throws {BrandStepError} `brand_file_unreadable` when the file is not a brand file of the version read here
 */
export function brandLookOf({ brandFile, brief, kit }) {
  const unreadable = (why) => new BrandStepError('brand_file_unreadable', why)
  if (!isObject(brandFile) || brandFile.kind !== 'brand-file') throw unreadable('not a brand file')
  if (brandFile.version !== BRAND_FILE_VERSION)
    throw unreadable(`brand file version ${brandFile.version}, ${BRAND_FILE_VERSION} is read`)
  const accent = accentOfBrandFile({ brandFile, brief, kit })
  if (accent.problem) throw unreadable(accent.problem)
  const material = brandFile.logo?.material
  const mark = brandFile.logo?.mark?.decision
  if (!isText(mark)) throw unreadable('logo.mark.decision is missing')
  const chosen = brief?.brand?.logoResearch?.chosen
  const logo =
    isObject(material) && isText(material.mediaId)
      ? {
          kind: 'own',
          from: isText(chosen?.source) ? chosen.source : 'unknown',
          source: logoSourceName(chosen?.source),
          mediaId: material.mediaId,
          mark
        }
      : { kind: 'text', from: LOGO_FROM_NAME, mark }
  const name = isText(brandFile.name?.value) ? brandFile.name.value : null
  return { schema: BRAND_LOOK_SCHEMA, kit: brandFile.kit ?? null, name, accent, logo }
}

/** Whether a value is a look record of `brandLookOf`. */
export const isBrandLook = (brand) => isObject(brand) && brand.schema === BRAND_LOOK_SCHEMA

/** What the customer reads about a logo made for them, per the brand step's mark decision. */
const MADE_LOGO_SAID = Object.freeze({
  icon: "No logo was found, so one was made for you: a simple icon of your trade with your business name, in the template's accent colour.",
  lettermark:
    "No logo was found, so one was made for you: your initials with your business name, in the template's accent colour."
})
const MADE_LOGO_DEFAULT =
  "No logo was found, so your business name is set as text, in the template's accent colour."
const NO_HUE_SAID =
  'Your logo has no colour, so buttons and links are black on the light theme and white on the dark theme.'

const brandMissing = (why) => new PlanComposerError('brand_missing', why, {}, { noRerun: true })

/** How the customer reads where the accent came from, per its source. */
const ACCENT_NAMES = Object.freeze({
  [ACCENT_FROM_LOGO]: 'Your logo',
  [ACCENT_LOGO_WITHOUT_HUE]: 'Your logo, which has no colour',
  [ACCENT_NO_LOGO]: 'The template, as you have no logo'
})

/**
 * The plan's look section from the template and the brand step's record, the assumptions it brings, and where the
 * accent and the logo came from (`sources`, kept beside the plan: Contract B's look section has no field for them).
 * @param {{slug: string, name: string, version: string, accent?: string}} template the chosen template
 * @param {object} record the record of `brandLookOf`
 * @throws {PlanComposerError} `brand_missing` when there is no record; `brand_accent_unsettled` when the brand step
 *   kept the template's accent in a case no rule covers
 */
export function lookOfBrandRecord(template, record) {
  if (!isBrandLook(record)) throw brandMissing('no brand step result was given')
  const from = record.accent?.from
  if (from === ACCENT_UNSETTLED)
    throw new PlanComposerError(
      'brand_accent_unsettled',
      'the brand step kept the template accent for a logo that is not colourless; no rule covers it',
      { why: record.accent.why ?? null },
      { noRerun: true }
    )
  if (!ACCENT_NAMES[from] || !HEX_COLOUR.test(record.accent.hex ?? ''))
    throw brandMissing('the brand step result has no accent')
  const assumptions = []
  const accent = record.accent.hex.toLowerCase()
  const accentDark = HEX_COLOUR.test(record.accent.dark ?? '') ? record.accent.dark.toLowerCase() : null
  const sources = { accent: { from, name: ACCENT_NAMES[from] } }
  if (from === ACCENT_FROM_LOGO && isText(record.accent.say))
    assumptions.push({ id: 'accent', field: 'look.accent', said: record.accent.say })
  if (from === ACCENT_LOGO_WITHOUT_HUE)
    assumptions.push({ id: 'accent', field: 'look.accent', said: NO_HUE_SAID })
  let logo
  if (record.logo?.kind === 'own' && isText(record.logo.source)) {
    logo = { kind: 'own', source: record.logo.source }
    sources.logo = { from: record.logo.from, name: record.logo.source }
  } else if (record.logo?.kind === 'text') {
    logo = { kind: 'text' }
    sources.logo = { from: LOGO_FROM_NAME, name: 'Your business name' }
    assumptions.push({
      id: 'logo',
      field: 'look.logo',
      said: MADE_LOGO_SAID[record.logo.mark] ?? MADE_LOGO_DEFAULT
    })
  } else throw brandMissing('the brand step result has no logo')
  // A made logo goes with the no logo accent, an own logo with any other: anything else is a broken record.
  if ((logo.kind === 'text') !== (from === ACCENT_NO_LOGO))
    throw brandMissing('the accent and the logo of the brand step result disagree')
  const { slug, name, version } = template ?? {}
  return {
    look: { template: { slug, name, version }, accent, ...(accentDark ? { accentDark } : {}), logo },
    assumptions,
    sources
  }
}
