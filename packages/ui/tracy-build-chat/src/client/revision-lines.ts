/**
 * A change request's lines in the card's own words (#609 over #617). The plan step writes each line in English and
 * gives it a stable code (`codes` of the note, parallel to the lines; null for a line the model wrote). For a code
 * this table knows, the card reads the line's names out of the server's sentence (each sentence below is the
 * server's, with its names as `{parameters}`) and says the sentence from the translated strings, the names as the plan
 * has them. A line with no code, a code the table does not know, a line that no longer reads as its code's sentence,
 * or a line the server cut short ("...") keeps the server's text: never a made up sentence.
 */
import { en, type StringKey, type Translate } from './strings'
import { wordOf } from './plan-words'

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

/** A changed line in the card's words, by its code; the server's text for a null or unknown code. */
export const changedLineOf = (t: Translate, code: string | null | undefined, text: string): string =>
  saidBy(t, code && Object.hasOwn(CHANGED, code) ? CHANGED[code] : undefined, text)

/** A not done line's what and why in the card's words, by its code; each part the server's when no sentence fits. */
export function notDoneLineOf(
  t: Translate,
  code: string | null | undefined,
  line: { what: string; why: string }
): { what: string; why: string } {
  const keys = code && Object.hasOwn(NOT_DONE, code) ? NOT_DONE[code] : undefined
  return {
    what: saidBy(t, keys?.what ? [keys.what] : undefined, line.what),
    why: saidBy(t, keys?.why ? [keys.why] : undefined, line.why)
  }
}
