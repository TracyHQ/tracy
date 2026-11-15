/**
 * The plan card's own words for what the plan names by a stable code (#609), and the one way the card joins a short
 * server line to the sentence after it.
 *
 * A business fact carries its data kind (`business.name`) and a source its origin (`website`): the card says both
 * from this plugin's translated strings, so a card in another language reads that language's label, not the English
 * label the plan step wrote. A code this table does not know keeps the plan's own text, never a made up word.
 */
import { en, type StringKey, type Translate } from './strings'

const known = (key: string): key is StringKey => Object.hasOwn(en, key)

/** A business fact's label in the card's words, by its data kind; the plan's label for an unknown kind. */
export function factLabelOf(t: Translate, kind: string | null | undefined, label: string): string {
  const key = `plan.fact.${kind ?? ''}`
  return kind && known(key) ? t(key) : label
}

/** A source's name in the card's words, by its origin code; the plan's name for an unknown origin. */
export function sourceNameOf(t: Translate, kind: string | null | undefined, name: string): string {
  const key = `plan.source.${kind ?? ''}`
  return kind && known(key) ? t(key) : name
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
