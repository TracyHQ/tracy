/**
 * The plan card's words for what the plan says by a stable code and its parameters (#609, `build-contract.md`
 * "Build plan"): a left out reason, the pictures estimate, the logo's source, the logo assumptions, the opening hours
 * and a section's name. Each English text in the table is the plan step's own sentence for that code word for word
 * (`test/plan-codes.test.mjs` holds them equal), so an English card reads as the plan does. A code this table does
 * not know, or parameters that do not fit its sentence, keep the plan's own text: never a made up sentence.
 * Site content (a page name, the owner's own values, a service name) is never translated: it follows the site.
 */
import { en, languageOf, type StringKey, type Translate } from './strings'

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
 * The names of a page's sections as the card shows them (`sectionLabelOf`), told apart when two would read the same
 * (two sections whose code is "services" both read "Services"): each such section is named by its own label when the
 * plan gives it one that differs, else by its message, both data the plan holds. Nothing is made up: sections the plan
 * gives nothing to tell apart keep the same name.
 */
export function pageSectionLabelsOf(
  t: Translate,
  sections: readonly { id: string; label: string; labelCode?: string; message?: string }[]
): Map<string, string> {
  const named = sections.map((s) => [s, sectionLabelOf(t, s.labelCode, s.label)] as const)
  const count = new Map<string, number>()
  for (const [, label] of named) count.set(label, (count.get(label) ?? 0) + 1)
  const out = new Map<string, string>()
  for (const [s, label] of named) {
    if ((count.get(label) ?? 0) < 2) {
      out.set(s.id, label)
      continue
    }
    // Its own label first when no other section of the same name has it, then its message, then its own label.
    const twins = named.filter(([o, l]) => l === label && o !== s).map(([o]) => o.label)
    const own = s.label.trim() !== '' && s.label !== label ? s.label : null
    const message = typeof s.message === 'string' && s.message.trim() !== '' ? s.message : null
    const by = own && !twins.includes(s.label) ? own : (message ?? own)
    out.set(s.id, by ? `${label}: ${by}` : label)
  }
  return out
}

/**
 * A section as the card names it: by its code in another language, its own label otherwise. In English the label
 * stays (a design may name its section "Our classes" where the code's name is "Services"), so an English card reads as
 * the plan does. A translator that says its language (`languageOf`) is decided by that language, never by comparing
 * words: Vietnamese "Menu" is the same word as the English one and is still the Vietnamese name (#575 C2). A translator
 * that does not say keeps the label when its word is the English one.
 */
export function sectionLabelOf(t: Translate, code: unknown, label: string): string {
  const key = `plan.section.${String(code)}`
  if (typeof code !== 'string' || !known(key)) return label
  const language = languageOf(t)
  if (language === 'en') return label
  const said = t(key)
  if (language !== null) return said
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
  const code = codeOf(entry.code, reason)
  if (code === null) return reason
  if (code === 'left_out_neutral') {
    const kind = entry.kind === 'page' || entry.kind === 'block' ? entry.kind : 'item'
    return t(`plan.leftOut.reason.left_out_neutral.${kind}` as StringKey)
  }
  if (code === 'no_gallery_room' || code === 'gallery_photo_shown_elsewhere') {
    // Only the sentence worded for its number has one: an entry without a count keeps the plan's own.
    const n = count(entry.params)
    if (n === null || n === 0) return reason
    return t(`plan.leftOut.reason.${code}.${n === 1 ? 'one' : 'other'}` as StringKey, { count: n })
  }
  if (code === LIBRARY_REFUSED) {
    const why = whyOf(t, entry.params)
    return why === null ? reason : t('plan.leftOut.reason.library_section_refused', { why })
  }
  // An item with no room left names the kind in the plan's sentence; the card's line names it already.
  if (code === 'no_room_left' && entry.kind === 'item') return t('plan.leftOut.reason.no_room_left.item')
  if (code === 'fewer_than_section_needs' || code === 'section_below_minimum') {
    const min = count(entry.params, 'min')
    return min === null ? reason : t(`plan.leftOut.reason.${code}` as StringKey, { min })
  }
  const key = `plan.leftOut.reason.${code}`
  return known(key) ? t(key) : reason
}

/**
 * The reason sentences that are the whole text of one code, by sentence: a plan stored before its sentence had a code
 * carries it as the model's words (`model_reason`, `stated`) or under a code of the brief the card does not say
 * (`stale`, read as `kept_off_site` since, #575 stand). Exact sentences only, and only one code's.
 */
const CODE_OF_SENTENCE: ReadonlyMap<string, string> = (() => {
  const prefix = 'plan.leftOut.reason.'
  const byText = new Map<string, string[]>()
  for (const [key, text] of Object.entries(en))
    if (key.startsWith(prefix) && !key.slice(prefix.length).includes('.') && !text.includes('{'))
      byText.set(text, [...(byText.get(text) ?? []), key.slice(prefix.length)])
  return new Map([...byText].filter(([, codes]) => codes.length === 1).map(([text, [code]]) => [text, code]))
})()

/** The code a line is said by: its own when the card has words for it, else the one of its exact sentence. */
function codeOf(own: string | null | undefined, reason: string): string | null {
  const sayable = typeof own === 'string' && own !== 'model_reason' && own !== 'stated' && hasWords(own)
  return sayable ? own : (CODE_OF_SENTENCE.get(reason) ?? (typeof own === 'string' ? own : null))
}

/** Whether the card has words for a left out code, in some form. */
const hasWords = (code: string) =>
  Object.keys(en).some(
    (key) => key === `plan.leftOut.reason.${code}` || key.startsWith(`plan.leftOut.reason.${code}.`)
  )

const LIBRARY_REFUSED = 'library_section_refused'
/** Why the Tracy reviews section does not show a review, in the interface language, or null for no known code. */
function whyOf(t: Translate, params: Params): string | null {
  const key = `plan.leftOut.why.${String(params?.why)}`
  return typeof params?.why === 'string' && known(key) ? t(key) : null
}

/** Codes of left out lines that name no fact or item of the plan and have a name of their own. */
/**
 * The count of a left out line that is a number of things of one sort, each said by its count in the interface
 * language: videos with no place in the design (`no_place_in_design` with the videos the plan knows, `params.known`) and the picture
 * spots of people nothing fills (`no_generated_people`). Their plan text ("3 videos") is English only.
 */
function countedWhatOf(t: Translate, line: { code?: string | null; params?: Params }): string | null {
  const n = count(line.params)
  if (n === null || n === 0) return null
  const form = n === 1 ? 'one' : 'other'
  if (line.code === 'no_place_in_design' && count(line.params, 'known') !== null)
    return t(`plan.leftOut.what.videos.${form}` as StringKey, { count: n })
  if (line.code === 'no_generated_people')
    return t(`plan.notOnSite.peopleSpots.${form}` as StringKey, { count: n })
  return null
}

/** The codes of what the content brief holds back, each line naming a brief field (`plan-held-back.mjs`). */
const HELD_BACK = new Set(['not_collected', 'sources_disagree', 'kept_off_site', 'owner_withheld', 'stale'])
const HELD_FIELD_PREFIX = 'plan.heldBack.field.'
const heldFields = Object.keys(en)
  .filter((k) => k.startsWith(HELD_FIELD_PREFIX))
  .map((k) => k.slice(HELD_FIELD_PREFIX.length))
/** How an older plan named a field the plan step had no name for: "booking" as "Booking". */
const plainFieldName = (field: string) => field.charAt(0).toUpperCase() + field.slice(1).replace(/[-_]/g, ' ')

/**
 * The brief field a held back line names, when the card has words for it: its `params.field`, or for a plan made
 * before the field was given, the field whose English name (or plain form) the line's text is.
 */
function heldBackFieldOf(line: { what: string; code?: string | null; params?: Params }): string | null {
  if (typeof line.code !== 'string' || !HELD_BACK.has(line.code)) return null
  const given = line.params?.field
  if (typeof given === 'string') return heldFields.includes(given) ? given : null
  return (
    heldFields.find(
      (f) => line.what === en[`${HELD_FIELD_PREFIX}${f}` as StringKey] || line.what === plainFieldName(f)
    ) ?? null
  )
}

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
  const counted = countedWhatOf(t, line)
  if (counted !== null) return counted
  if (typeof line.code === 'string' && NAMED_LEFT_OUT.has(line.code))
    return t(`plan.leftOut.what.${line.code}` as StringKey)
  const field = heldBackFieldOf(line)
  if (field !== null) return t(`plan.heldBack.field.${field}` as StringKey)
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
  const reasons = [line, ...also.map((a) => ({ ...a, kind: line.kind }))]
  // The reasons the Tracy reviews section gives are said after one lead in (#575 walk, third round: it read twice).
  const whys = reasons.filter((r) => r.code === LIBRARY_REFUSED).map((r) => whyOf(t, r.params))
  const joined =
    whys.length > 1 && whys.every((w) => w !== null)
      ? t('plan.leftOut.reason.library_section_refused', {
          why: [...new Set(whys)].join('; ')
        })
      : null
  const said = reasons.map((r) =>
    joined !== null && r.code === LIBRARY_REFUSED ? joined : leftOutReasonOf(t, r, r.reason)
  )
  // The same sentence twice is said once.
  return [...new Set(said)].join(' ')
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
