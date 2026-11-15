/**
 * The plan card's own words for what the plan names by a stable code (#609), and the one way the card joins a short
 * server line to the sentence after it.
 *
 * A business fact carries its data kind (`business.name`) and a source its origin (`website`). Where the plan's own
 * text is only the generic English name of that code (exactly this table's English, "Business name", "Social
 * profile"), or is missing, the card says it from this plugin's translated strings, so a card in another language
 * reads that language's word. Text the plan made more specific ("Instagram bio", "Court booking button") says more
 * than the code does and is shown as the plan wrote it. A code this table does not know keeps the plan's own text,
 * never a made up word.
 */
import { en, type StringKey, type Translate } from './strings'

const known = (key: string): key is StringKey => Object.hasOwn(en, key)

/** The table's word for `key` when the plan's text is missing or only the generic English; else the plan's text. */
export function wordOf(t: Translate, key: string, text: string | null | undefined): string {
  if (!known(key)) return text ?? ''
  return text == null || text === '' || text === en[key] ? t(key) : text
}

/** A business fact's label in the card's words, by its data kind, unless the plan made the label specific. */
export function factLabelOf(t: Translate, kind: string | null | undefined, label: string): string {
  return kind ? wordOf(t, `plan.fact.${kind}`, label) : label
}

/** A source's name in the card's words, by its origin code, unless the plan names the source more exactly. */
export function sourceNameOf(
  t: Translate,
  kind: string | null | undefined,
  name: string | null | undefined
): string {
  return kind ? wordOf(t, `plan.source.${kind}`, name) : (name ?? '')
}

/**
 * A short line as one sentence: its own final full stop is kept, never doubled ("on the site.." was seen), and a line
 * without one gets one. A count said again and again goes before the stop: "Move the logo (2).".
 */
export function sentenceOf(text: string, count = 1): string {
  const trimmed = text.trim()
  const end = /[.!?…。]$/.exec(trimmed)?.[0] ?? null
  const body = end === '.' ? trimmed.slice(0, -1).trimEnd() : trimmed
  const counted = count === 1 ? body : `${body} (${count})`
  if (end === '.' || end === null) return `${counted}.`
  // A question or an exclamation keeps its own mark; its count follows it.
  return count === 1 ? trimmed : `${trimmed} (${count})`
}
