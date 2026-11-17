/**
 * The plan card's words for what the plan says by a stable code and its parameters (#609, `build-contract.md`
 * "Build plan"): a left out reason, the pictures estimate, the logo's source, the logo assumptions, the opening hours
 * and a section's name. Each English text in the table is the plan step's own sentence for that code word for word
 * (`test/plan-codes.test.mjs` holds them equal), so an English card reads as the plan does. A code this table does
 * not know, or parameters that do not fit its sentence, keep the plan's own text: never a made up sentence.
 * Site content (a page name, the owner's own values, a service name) is never translated: it follows the site.
 */
import { en, type StringKey, type Translate } from './strings'

const known = (key: string): key is StringKey => Object.hasOwn(en, key)
type Params = Record<string, unknown> | null | undefined
const count = (params: Params, name = 'count'): number | null => {
  const value = params?.[name]
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null
}

/** A section's name by its code (`blocks[].labelCode`, the `section` of a change line), or null for none known. */
export function sectionNameOf(t: Translate, code: unknown): string | null {
  const key = `plan.section.${String(code)}`
  return typeof code === 'string' && known(key) ? t(key) : null
}

/**
 * A section as the card names it: by its code in another interface language, its own label otherwise. In English the
 * label stays (a design may name its section "Our classes" where the code's name is "Services"), so an English card
 * reads as the plan does; a language with no translation of the code keeps the label too.
 */
export function sectionLabelOf(t: Translate, code: unknown, label: string): string {
  const key = `plan.section.${String(code)}`
  if (typeof code !== 'string' || !known(key)) return label
  const said = t(key)
  return said !== en[key] ? said : label
}

/**
 * A left out entry's reason by its code (`leftOut[].code`, `params`), or the plan's text. `model_reason` and
 * `stated` are sentences without a code of their own: kept as written. `kind` is the entry's kind (`page`, `block`,
 * `item`, `feature`), for the neutral sentence.
 */
export function leftOutReasonOf(
  t: Translate,
  entry: { code?: string | null; params?: Params; kind?: string | null },
  reason: string
): string {
  const code = entry.code
  if (typeof code !== 'string') return reason
  if (code === 'left_out_neutral') {
    const kind = entry.kind === 'page' || entry.kind === 'block' ? entry.kind : 'item'
    return t(`plan.leftOut.reason.left_out_neutral.${kind}` as StringKey)
  }
  if (code === 'no_gallery_room') {
    // Only the sentence worded for its number has one: an entry without a count keeps the plan's own.
    const n = count(entry.params)
    if (n === null || n === 0) return reason
    return t(
      n === 1 ? 'plan.leftOut.reason.no_gallery_room.one' : 'plan.leftOut.reason.no_gallery_room.other',
      {
        count: n
      }
    )
  }
  const key = `plan.leftOut.reason.${code}`
  return known(key) ? t(key) : reason
}

/** Codes of left out lines that name no fact or item of the plan and have a name of their own. */
const NAMED_LEFT_OUT = new Set([
  'no_place_for_whatsapp',
  'no_place_for_other_phones',
  'no_place_for_google_rating',
  'hours_unconfirmed',
  'hours_sources_disagree'
])

/**
 * What a left out line names, in the card's words: a count of items of one kind ("3 reviews", `dataKind`), a fact by
 * its label (`factKind`, `factLabel`), a named code, or the plan's own words. Site content in `what` (a page's name)
 * stays as the plan has it.
 */
export function leftOutWhatOf(
  t: Translate,
  line: {
    what: string
    code?: string | null
    params?: Params
    dataKind?: string
    factKind?: string
    count?: number
    pages?: string[]
  },
  factLabel: (kind: string, label: string) => string
): string {
  if (Array.isArray(line.pages) && line.pages.length > 0) return pagesOf(t, line.pages)
  if (typeof line.dataKind === 'string' && typeof line.count === 'number') {
    const kind = COUNTED_KINDS.has(line.dataKind) ? line.dataKind : 'item'
    return t(`plan.count.${kind}.${line.count === 1 ? 'one' : 'other'}` as StringKey, { count: line.count })
  }
  if (typeof line.factKind === 'string') return factLabel(line.factKind, line.what)
  if (typeof line.code === 'string' && NAMED_LEFT_OUT.has(line.code))
    return t(`plan.leftOut.what.${line.code}` as StringKey)
  if (line.code === 'no_fitting_video') {
    const n = count(line.params)
    if (n !== null && n > 0)
      return t(
        n === 1 ? 'plan.leftOut.what.no_fitting_video.one' : 'plan.leftOut.what.no_fitting_video.other',
        {
          count: n
        }
      )
  }
  return line.what
}
const COUNTED_KINDS = new Set(['service', 'person', 'quote', 'gallery'])

/** The pages of a left out line in a sentence of the interface language: a few named, the others counted. */
function pagesOf(t: Translate, pages: string[]): string {
  const [first, second, third] = pages
  if (pages.length === 1) return t('plan.leftOut.what.pages.one', { page: first })
  if (pages.length === 2) return t('plan.leftOut.what.pages.two', { first, last: second })
  if (pages.length === 3) return t('plan.leftOut.what.pages.three', { first, second, last: third })
  return t('plan.leftOut.what.pages.more', { first, second, third, count: pages.length - 3 })
}

/** A left out line's reasons in the interface language: its own, then the other reasons of its items (`also`). */
export function leftOutReasonsOf(
  t: Translate,
  line: {
    reason: string
    code?: string | null
    params?: Params
    kind?: string | null
    also?: { reason: string; code?: string | null; params?: Params }[]
  }
): string {
  const also = Array.isArray(line.also) ? line.also : []
  return [line, ...also.map((a) => ({ ...a, kind: line.kind }))]
    .map((r) => leftOutReasonOf(t, r, r.reason))
    .join(' ')
}

/** The pictures estimate by its code (`pictures.generated.code`, `params.count`), or the plan's own sentence. */
export function picturesEstimateOf(
  t: Translate,
  generated: { code?: string | null; params?: Params },
  reason: string
) {
  if (generated.code !== 'pictures_generated_estimate') return reason
  const n = count(generated.params)
  if (n === null || n === 0) return reason
  return t(n === 1 ? 'plan.pictures.estimate.one' : 'plan.pictures.estimate.other', { count: n })
}

/**
 * Where an own logo came from (`look.logo.code: logo_source_own`), by its source kind (`look.logo.sourceKind`), or the
 * plan's own name of it. A drawn logo's line (`logo_source_drawn`) is the card's own `plan.look.logoDrawn`.
 */
export function logoSourceOf(
  t: Translate,
  logo: { code?: string; sourceKind?: string },
  source: string
): string {
  if (logo.code !== 'logo_source_own' || typeof logo.sourceKind !== 'string') return source
  const key = `plan.logoSource.${logo.sourceKind}`
  return known(key) ? t(key) : source
}

/** The drawn logo's reasons and the temporary logo's marks the table has a sentence for. */
const DRAWN_REASONS = new Set(['new-symbol-drawn', 'symbol-cut-from-logo', 'name-set-in-template-font'])
const MADE_MARKS = new Set(['icon', 'lettermark', 'mark'])

/** The main colour line's keys by its code and parameters (`brand-accent-codes.mjs`), or null. */
function accentKeyOf(code: unknown, params: Record<string, unknown>): StringKey | null {
  const plain = ['black', 'white', 'both'].includes(String(params.colours)) ? String(params.colours) : null
  let key: string | null = null
  if (code === 'accent_logo_moved' && ['lighter', 'darker'].includes(String(params.direction)))
    key = `plan.assumption.accent_logo_moved.${params.direction}`
  else if ((code === 'accent_no_hue' || code === 'accent_unreadable') && plain)
    key = `plan.assumption.${code}.${plain}`
  else if (typeof code === 'string') key = `plan.assumption.${code}`
  return key !== null && code !== 'logo_drawn' && code !== 'logo_made' && known(key) ? key : null
}

/**
 * An assumption by its code (`assumptions[].code`, `params`): the logo Tracy drew or made, the main colour; else the
 * plan's text. The main colour line keeps the plan's own sentence on an English card: the brand step may say more
 * there (the colour's name) than the coded sentence does.
 */
export function assumptionOf(
  t: Translate,
  a: { code?: string | null; params?: Params },
  said: string
): string {
  const params = a.params ?? {}
  if (a.code === 'logo_drawn' && typeof params.reason === 'string' && DRAWN_REASONS.has(params.reason))
    return t(`plan.assumption.logo_drawn.${params.reason}` as StringKey)
  if (
    a.code === 'logo_made' &&
    typeof params.found === 'boolean' &&
    typeof params.mark === 'string' &&
    MADE_MARKS.has(params.mark)
  )
    return t(`plan.assumption.logo_made.${params.found ? 'found' : 'none'}.${params.mark}` as StringKey)
  const accent = accentKeyOf(a.code, params)
  if (accent !== null) {
    const coded = t(accent)
    return coded !== en[accent] ? coded : said
  }
  return said
}

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const
/** A day's name in the interface language: 1 January 2024 was a Monday. */
function dayName(day: string, locale: string): string | null {
  const at = DAYS.indexOf(day as (typeof DAYS)[number])
  if (at < 0) return null
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 1 + at))
    )
  } catch {
    return null
  }
}
const spoken = (time: string) => time.replace(/^0(\d)/, '$1')
const joined = (t: Translate, key: StringKey, parts: string[]) =>
  parts.reduce((first, next) => t(key, { first, next }))

/**
 * Opening hours as the owner reads them, from the display code (`facts[].code: opening_hours`, `params`: `groups`,
 * `fromN`, `toN`, `hoursN`): the day names in the interface language, the clock as the plan writes it. Null when the
 * parameters do not read as a week: the card then shows the plan's `display`.
 */
export function openingHoursOf(t: Translate, params: Params, locale: string): string | null {
  const groups = count(params, 'groups')
  if (!params || groups === null || groups === 0) return null
  const parts: string[] = []
  for (let n = 1; n <= groups; n += 1) {
    const from = dayName(String(params[`from${n}`]), locale)
    const to = dayName(String(params[`to${n}`]), locale)
    const hours = params[`hours${n}`]
    if (from === null || to === null || typeof hours !== 'string') return null
    const days = params[`from${n}`] === params[`to${n}`] ? from : t('plan.hours.days', { from, to })
    let said: string
    if (hours === 'closed') said = t('plan.hours.closed')
    else {
      const ranges = hours.split(',').map((range) => {
        const [start, end] = range.split('-')
        return start && end ? t('plan.hours.time', { from: spoken(start), to: spoken(end) }) : null
      })
      if (ranges.some((r) => r === null)) return null
      said = joined(t, 'plan.hours.ranges', ranges as string[])
    }
    parts.push(t('plan.hours.group', { days, hours: said }))
  }
  return joined(t, 'plan.hours.groups', parts)
}

/** A fact's value as the owner reads it: hours by their code, else the plan's `display`, else the value itself. */
export function factShownOf(
  t: Translate,
  fact: { value: string; display?: string | null; code?: string | null; params?: Params },
  locale: string
): string {
  if (fact.code === 'opening_hours') {
    const hours = openingHoursOf(t, fact.params, locale)
    if (hours !== null) return hours
  }
  return fact.display ?? fact.value
}
