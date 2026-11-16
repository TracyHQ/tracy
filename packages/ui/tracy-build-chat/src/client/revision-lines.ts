/**
 * A change request's lines in the card's own words (#609 over #617). The plan step writes each line in English and
 * gives it a stable code (`codes` of the note, parallel to the lines; null for a line the model wrote). For a code
 * this table knows, the card reads the line's names out of the server's sentence (each sentence below is the
 * server's, with its names as `{parameters}`) and says the sentence from the translated strings, the names as the plan
 * has them. A line with no code, a code the table does not know, a line that no longer reads as its code's sentence,
 * or a line the server cut short ("...") keeps the server's text: never a made up sentence.
 */
import { en, type StringKey, type Translate } from './strings'
import { factLabelOf, wordOf } from './plan-words'
import { openingHoursOf, sectionLabelOf, sectionNameOf } from './plan-codes'

/** The keys tried for each code of a changed line, in order (the first whose sentence fits is said). */
const CHANGED: Record<string, StringKey[]> = {
  owner_value_saved: ['plan.revised.line.owner_value_saved'],
  item_renamed: ['plan.revised.line.item_renamed'],
  item_taken_off: ['plan.revised.line.item_taken_off'],
  'page-removed': ['plan.revised.line.page-removed'],
  'page-added': ['plan.revised.line.page-added'],
  'page-renamed': ['plan.revised.line.page-renamed'],
  'page-order': ['plan.revised.line.page-order'],
  'block-removed': ['plan.revised.line.block-removed'],
  'block-added': ['plan.revised.line.block-added'],
  'block-data': ['plan.revised.line.block-data.count', 'plan.revised.line.block-data'],
  'block-order': ['plan.revised.line.block-order'],
  'data-off': ['plan.revised.line.data-off'],
  'data-on': ['plan.revised.line.data-on'],
  'data-again': ['plan.revised.line.data-again'],
  'pictures-own': ['plan.revised.line.pictures-own.one', 'plan.revised.line.pictures-own.other'],
  'pictures-drawn': [
    'plan.revised.line.pictures-drawn.none',
    'plan.revised.line.pictures-drawn.one',
    'plan.revised.line.pictures-drawn.other'
  ]
}

/** The keys of a not done line's two parts, by its code. */
const NOT_DONE: Record<string, { what?: StringKey; why?: StringKey }> = {
  nothing_to_change: {
    what: 'plan.revised.notDone.nothing_to_change.what',
    why: 'plan.revised.notDone.nothing_to_change.why'
  },
  page_already_on_plan: { why: 'plan.revised.notDone.page_already_on_plan.why' },
  section_not_filled: {
    what: 'plan.revised.notDone.section_not_filled.what',
    why: 'plan.revised.notDone.section_not_filled.why'
  },
  item_rename_refused: { what: 'plan.revised.notDone.item_rename_refused.what' }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The parameters of `text` read by the English sentence of `key`, or null when the text is not that sentence. */
function paramsOf(key: StringKey, text: string): Record<string, string> | null {
  const names: string[] = []
  const source = en[key]
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1]
      if (!name) return escape(part)
      names.push(name)
      // A count is a whole number; every other name is any text of at least one character.
      return name === 'count' ? '(\\d+)' : '(.+?)'
    })
    .join('')
  const found = new RegExp(`^${source}$`, 'su').exec(text)
  if (!found) return null
  return Object.fromEntries(names.map((name, i) => [name, found[i + 1] as string]))
}

/** "Opening hours" in the card's words: a generic English fact label said from the table, any other kept. */
function factLabelSaid(t: Translate, label: string): string {
  const key = (Object.keys(en) as StringKey[]).find((k) => k.startsWith('plan.fact.') && en[k] === label)
  return key ? wordOf(t, key, label) : label
}

/** One part said by the first of `keys` whose sentence fits `text`, or `text` as it came. */
function saidBy(t: Translate, keys: StringKey[] | undefined, text: string): string {
  if (!keys || text.endsWith('...')) return text
  for (const key of keys) {
    const params = paramsOf(key, text)
    if (!params) continue
    if (Object.keys(params).length === 0) return wordOf(t, key, text)
    if (key === 'plan.revised.line.owner_value_saved' && params.label)
      params.label = factLabelSaid(t, params.label)
    return t(key, params)
  }
  return text
}

type Params = Record<string, unknown>
/** What a line is said with beside its params: the interface language and the plan's facts (for opening hours). */
export interface LineContext {
  locale?: string
  // biome-ignore lint/suspicious/noExplicitAny: Contract B facts
  facts?: any[]
}

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const countOf = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null

/** "photos" for "Photo": the plan step's own plural of a generic name (`plan-request-lines.mjs pluralOf`). */
function pluralOf(name: string): string {
  const low = name.charAt(0).toLowerCase() + name.slice(1)
  if (/(?:s|x|z|ch|sh)$/i.test(low)) return `${low}es`
  if (/[^aeiou]y$/i.test(low)) return `${low.slice(0, -1)}ies`
  return `${low}s`
}

/** The names of a data line (`names: [{name, count}]`), each once, a repeated one with its count; null if unreadable. */
function namesOf(t: Translate, names: unknown): string | null {
  if (!Array.isArray(names) || names.length === 0) return null
  const said = names.map((n) => {
    const name = textOf(n?.name)
    const count = countOf(n?.count)
    if (name === null || count === null || count === 0) return null
    return count === 1 ? name : t('plan.revised.names.counted', { count, name, plural: pluralOf(name) })
  })
  return said.some((s) => s === null) ? null : said.join(', ')
}

/** A section named in a line: by its code in another language (`sectionLabelOf`), else the line's own label. */
const sectionOf = (t: Translate, params: Params): string | null => {
  const label = textOf(params.label)
  return label === null ? sectionNameOf(t, params.section) : sectionLabelOf(t, params.section, label)
}

/** The value of an owner's saved answer as it reads: opening hours in the interface language when the plan has them. */
function savedValueOf(t: Translate, params: Params, ctx: LineContext): string | null {
  const value = textOf(params.value)
  if (params.kind === 'contact.hours' && value !== null) {
    const fact = (ctx.facts ?? []).find((f) => f?.kind === 'contact.hours' && f?.value === value)
    const hours = fact?.code === 'opening_hours' ? openingHoursOf(t, fact.params, ctx.locale ?? 'en') : null
    if (hours !== null) return hours
    return textOf(params.display) ?? value
  }
  return value
}

/** A changed line said from its code and params; null when the params do not fill its sentence. */
function changedByParams(t: Translate, code: string, params: Params, ctx: LineContext): string | null {
  const name = textOf(params.name)
  const page = textOf(params.pageName)
  const count = countOf(params.count)
  switch (code) {
    case 'owner_value_saved': {
      const kind = textOf(params.kind)
      const label = kind ? factLabelOf(t, kind, textOf(params.label) ?? kind) : textOf(params.label)
      const value = savedValueOf(t, params, ctx)
      return label && value ? t('plan.revised.line.owner_value_saved', { label, value }) : null
    }
    case 'item_renamed':
      return textOf(params.from) && name
        ? t('plan.revised.line.item_renamed', { from: params.from as string, to: name })
        : null
    case 'item_taken_off':
      return name ? t('plan.revised.line.item_taken_off', { label: name }) : null
    case 'page-removed':
    case 'page-added':
      return name ? t(`plan.revised.line.${code}`, { name }) : null
    case 'page-renamed':
      return textOf(params.from) && name
        ? t('plan.revised.line.page-renamed', { from: params.from as string, to: name })
        : null
    case 'page-order': {
      const names = Array.isArray(params.names) ? params.names.map(textOf) : []
      return names.length > 0 && names.every((n) => n !== null)
        ? t('plan.revised.line.page-order', { names: names.join(', ') })
        : null
    }
    case 'block-removed':
    case 'block-added': {
      const section = sectionOf(t, params)
      return section && page ? t(`plan.revised.line.${code}`, { section, page }) : null
    }
    case 'block-data': {
      const section = sectionOf(t, params)
      if (!section || !page) return null
      // A line that said only the count has no names (`names` absent): its sentence says the count.
      if (params.names === undefined)
        return count === null ? null : t('plan.revised.line.block-data.count', { section, page, count })
      const names = namesOf(t, params.names)
      return names === null ? null : t('plan.revised.line.block-data', { section, page, names })
    }
    case 'block-order':
      return page ? t('plan.revised.line.block-order', { page }) : null
    case 'data-off':
    case 'data-on':
    case 'data-again': {
      const names = namesOf(t, params.names)
      return names === null ? null : t(`plan.revised.line.${code}`, { names })
    }
    case 'pictures-own':
      return count === null
        ? null
        : t(count === 1 ? 'plan.revised.line.pictures-own.one' : 'plan.revised.line.pictures-own.other', {
            count
          })
    case 'pictures-drawn':
      if (count === null) return null
      if (count === 0) return t('plan.revised.line.pictures-drawn.none')
      return t(
        count === 1 ? 'plan.revised.line.pictures-drawn.one' : 'plan.revised.line.pictures-drawn.other',
        {
          count
        }
      )
    default:
      return null
  }
}

/**
 * A changed line in the card's words, by its code. With the code's params (#609) the sentence is filled from them;
 * without params, the names are read out of the server's sentence (the older answer). The server's text for a null or
 * unknown code, or params that do not fill the sentence.
 */
export function changedLineOf(
  t: Translate,
  code: string | null | undefined,
  text: string,
  params?: Params | null,
  ctx: LineContext = {}
): string {
  if (code && params) return changedByParams(t, code, params, ctx) ?? text
  return saidBy(t, code && Object.hasOwn(CHANGED, code) ? CHANGED[code] : undefined, text)
}

/** The lead in of a not done line the model wrote, by its refusal kind (Contract B's closed set). */
const LEAD_INS: Record<string, StringKey> = {
  no_recipe: 'plan.revised.notDone.reason.no_recipe',
  no_data: 'plan.revised.notDone.reason.no_data',
  fact_missing: 'plan.revised.notDone.reason.fact_missing',
  kept_private: 'plan.revised.notDone.reason.kept_private',
  outside_plan: 'plan.revised.notDone.reason.outside_plan'
}

/** A not done line said from its code and params: each part, or null to keep the server's. */
function notDoneByParams(
  t: Translate,
  code: string,
  params: Params
): { what: string | null; why: string | null } {
  const name = textOf(params.name)
  switch (code) {
    case 'nothing_to_change':
      return {
        what: t('plan.revised.notDone.nothing_to_change.what'),
        why: t('plan.revised.notDone.nothing_to_change.why')
      }
    case 'page_already_on_plan':
      return { what: null, why: t('plan.revised.notDone.page_already_on_plan.why') }
    case 'section_not_filled':
      return {
        // The plan step's own placeholder name is said in the card's words; a name the request gave stays.
        what:
          name === null || name === en['plan.revised.notDone.section_not_filled.what']
            ? t('plan.revised.notDone.section_not_filled.what')
            : name,
        why: t('plan.revised.notDone.section_not_filled.why')
      }
    case 'item_rename_refused':
      return {
        what: textOf(params.from)
          ? t('plan.revised.notDone.item_rename_refused.what', { name: params.from as string })
          : null,
        why: null
      }
    case 'owner_value_not_shown': {
      const kind = textOf(params.kind)
      const english = textOf(params.label)
      // "your opening hours": an English label goes lower case in the sentence, a translated one keeps its case.
      const word = kind ? factLabelOf(t, kind, english ?? kind) : english
      const label = word === null ? null : word === english ? word.toLowerCase() : word
      return {
        what: label ? t('plan.revised.notDone.owner_value_not_shown.what', { label }) : null,
        why:
          params.because === 'no_place_in_design' ? t('plan.revised.notDone.owner_value_not_shown.why') : null
      }
    }
    default:
      return { what: null, why: null }
  }
}

/**
 * A not done line's what and why in the card's words, by its code. With the code's params (#609) each part is filled
 * from them, else read out of the server's sentence; each part stays the server's when no sentence fits. A line the
 * model wrote (no code) keeps its words; in another interface language its refusal kind (`reason`) puts a translated
 * lead in before them, so the owner reads why in their own language too.
 */
export function notDoneLineOf(
  t: Translate,
  code: string | null | undefined,
  line: { what: string; why: string },
  params?: Params | null,
  reason?: string | null
): { what: string; why: string } {
  if (code && params) {
    const said = notDoneByParams(t, code, params)
    return { what: said.what ?? line.what, why: said.why ?? line.why }
  }
  if (!code) {
    const key = reason && Object.hasOwn(LEAD_INS, reason) ? LEAD_INS[reason] : undefined
    const lead = key ? t(key) : null
    // The English card reads the model's own sentence alone: the lead in would only repeat it.
    return lead && key && lead !== en[key] ? { what: line.what, why: `${lead} ${line.why}` } : line
  }
  const keys = Object.hasOwn(NOT_DONE, code) ? NOT_DONE[code] : undefined
  return {
    what: saidBy(t, keys?.what ? [keys.what] : undefined, line.what),
    why: saidBy(t, keys?.why ? [keys.why] : undefined, line.why)
  }
}
