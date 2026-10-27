/**
 * One key's text: the picked language's, English where it has none, the key itself when English
 * has none either. A numeric `count` parameter picks the plural form: `<key>_<category>` by
 * `Intl.PluralRules` of the language (zero, one, two, few, many, other), then `<key>_other`, then
 * `<key>`, in the picked language before English.
 */
import { htmlLang, interpolate, textOf } from '@tracy/core/interface-languages/resolve'

export type Params = Readonly<Record<string, string | number>>
type Table = Readonly<Record<string, unknown>>

const rulesFor = new Map<string, Intl.PluralRules>()
function category(lang: string, count: number): string {
  let rules = rulesFor.get(lang)
  if (!rules) {
    rules = new Intl.PluralRules(htmlLang(lang))
    rulesFor.set(lang, rules)
  }
  return rules.select(count)
}

function lookup(table: Table, lang: string, key: string, count: number | undefined): string | null {
  if (count === undefined) return textOf(table, key)
  return (
    textOf(table, `${key}_${category(lang, count)}`) ?? textOf(table, `${key}_other`) ?? textOf(table, key)
  )
}

/** The text for `key`, or null when neither the language nor English has it. */
export function lookupText(
  lang: string,
  table: Table,
  en: Table,
  key: string,
  params?: Params
): string | null {
  const count = typeof params?.count === 'number' ? params.count : undefined
  return lookup(table, lang, key, count) ?? lookup(en, 'en', key, count)
}

export function translate(lang: string, table: Table, en: Table, key: string, params?: Params): string {
  const text = lookupText(lang, table, en, key, params)
  return text === null ? key : interpolate(text, params)
}
