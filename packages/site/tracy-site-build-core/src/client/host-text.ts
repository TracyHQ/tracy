/**
 * The host's sentences in the reader's language.
 *
 * The host writes a stage's `detail` (and a refusal's `message`) in English, and beside it the code
 * of the sentence it wrote (`host-messages.mjs`): `detailCode` + `detailParams`, or `messageCode` +
 * `messageParams`. This reads that code through the plugin's own namespace as `host.<code>`.
 *
 * A code is a promise about a sentence, not about a key: a code the plugin's catalogue does not
 * carry (an older client, a code from a newer host) leaves dsh's `t` answering the key itself, and
 * then the English the host wrote is the honest answer. So is a detail with no code at all, which
 * is text from somewhere Tracy does not translate (a site's own words, a tool's output).
 */
import type { Key, Translate } from './strings'

/** The key prefix of a host sentence; the same one `hostKeys` writes. */
const PREFIX = 'host.'

/**
 * One host sentence: its translation when the catalogue has the code, else `fallback` as written.
 * @param t - the plugin's bound translate.
 * @param code - the sentence's code, when the host sent one.
 * @param params - the values it was filled with.
 * @param fallback - the English the host wrote.
 */
export function hostText(
  t: Translate,
  code: string | undefined,
  params: Record<string, string | number> | undefined,
  fallback: string
): string {
  if (typeof code !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(code)) return fallback
  const key = `${PREFIX}${code}` as Key
  const said = t(key, params ?? {})
  // dsh answers the key itself for a key no dictionary holds.
  return said === key || said === '' ? fallback : said
}

/** A stage's detail as the customer reads it; undefined when it has none. */
export function stageDetail(
  t: Translate,
  stage: { detail?: string; detailCode?: string; detailParams?: Record<string, string | number> }
): string | undefined {
  if (!stage.detail) return undefined
  return hostText(t, stage.detailCode, stage.detailParams, stage.detail)
}

/** A refused request's sentence as the customer reads it. */
export function refusalText(
  t: Translate,
  refused: { message: string; messageCode?: string; messageParams?: Record<string, string | number> }
): string {
  return hostText(t, refused.messageCode, refused.messageParams, refused.message)
}
