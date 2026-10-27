/**
 * A WordPress site's REGISTERED BLOCK PATTERNS as the Claude Cowork plugin answers them: one read by name
 * (`content.get {kind:"pattern", key}`, in the plugin since it learned `patternGet`) and the list
 * (`content.list {kind:"pattern", search?, category?, offset?, limit?}`, the release after 0.16.0). The host
 * inserts a pattern by its name (`wp-blocks.mjs` `patternsOf`, `site-call.mjs` `expandBlockEdits`), so the
 * model never re-types a layout the site already has.
 *
 * 🔒 A LIST IS TRUSTED ONLY BY ITS ECHO, NEVER BY A VERSION NUMBER (the `search` precedent, #671). A very
 * old plugin answers ANY `content.list` with its posts and `ok:true`; the 0.16.0 one refuses every kind but
 * `post` by name. Only an answer that says `kind:"pattern"` is a list of patterns. This host keeps no
 * plugin version per site, and no model-facing sentence here names one: the plugin updates itself, and
 * what it answers is the fact.
 *
 * Pure: no I/O.
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** The code of a refusal that says this site's plugin has no road to patterns at all. */
export const PATTERNS_UNSUPPORTED = 'PATTERNS_UNSUPPORTED'
/** The code of an insert that named a pattern this site does not register. */
export const PATTERN_NOT_FOUND = 'PATTERN_NOT_FOUND'

/**
 * Whether a plugin's refusal says it has no road to patterns — never one that names a pattern it lacks
 * (`not_found`), or a read that failed (`read_failed`), which the plugin answers once it has the road:
 * - `bad_params` "kind must be one of: post, …" without `pattern` — a plugin that predates `patternGet`;
 * - `bad_params` "content.list serves kind(s) …; "pattern" is not listed here" — every released plugin, which
 *   lists no pattern. 🔒 THE SENTENCE CHANGED BETWEEN RELEASES (B1, E2E 02/10/2026): `wordpress-v0.14.9` says
 *   `serves kind "post" only`, `wordpress-v0.15.3` and `wordpress-v0.16.0` say `serves kinds "post",
 *   "templatePart" and "template"` (`contentList`, read at each tag). Matched only on the first wording, the
 *   0.16.0 refusal — every live site — reached the model as a call to correct;
 * - `unavailable` naming patterns — a plugin whose writer cannot read or list them;
 * - `LIST_SEARCH_UNSUPPORTED` — the relay's word for a list that ignored `search` (a plugin that lists its
 *   posts for any kind).
 * @param {unknown} answer
 * @returns {boolean}
 */
export function patternsRefused(answer) {
  if (!isRecord(answer) || answer.ok !== false) return false
  const code =
    typeof answer.code === 'string' && answer.code !== ''
      ? answer.code
      : typeof answer.error === 'string'
        ? answer.error
        : ''
  const message = typeof answer.message === 'string' ? answer.message : ''
  if (code === 'LIST_SEARCH_UNSUPPORTED') return true
  if (code === 'unavailable') return /pattern/i.test(message)
  if (code !== 'bad_params') return false
  // Both wordings name the list door and the kind it refuses; the new plugin's own refusals of a pattern
  // list it CAN make (`category`, `offset`, `limit`, `search`) name neither, and pass through as said.
  if (/\bcontent\.list serves kinds?\b/.test(message) || /"pattern" is not listed/.test(message)) return true
  return /kind must be one of/i.test(message) && !/\bpattern\b/.test(message)
}

/**
 * What the model reads when this site's plugin has no road to patterns. `list`: it cannot LIST them — the
 * section goes in as markup, and a name already known may still insert (a plugin may read a pattern by name
 * and list none). Otherwise it cannot READ one either, and markup is the one road.
 * @param {{ list: boolean }} what
 */
export const patternsUnsupported = ({ list }) => ({
  ok: false,
  code: PATTERNS_UNSUPPORTED,
  error: list
    ? "This site's Claude Cowork plugin cannot list patterns yet."
    : "This site's Claude Cowork plugin cannot read patterns.",
  next: list
    ? 'Build the section as block markup: content.update {kind, id, rev, blocks:{"+<i>":"<markup>"}}; a pattern name you already know may still insert with {pattern:"<name>"}.'
    : 'Build the section as block markup: content.update {kind, id, rev, blocks:{"+<i>":"<markup>"}}.'
})

/**
 * 🔒 A PATTERN READ OR LISTED SAYS HOW IT GOES IN (M2 rerun r1, 02/10/2026). The model listed the theme's
 * patterns, read `twentytwentyfive/text-faqs`, and then wrote its own FAQ markup: nothing in either answer
 * said the pattern goes in by its name. A pattern's read names the insert with that name, and a list with
 * rows names the shape — both within a next's 200 characters.
 * @param {string} name - the pattern's name, as read.
 */
export function patternReadNext(name) {
  /** @param {string} n */
  const said = (n) =>
    `content.update {kind, id, rev, blocks:{"+<i>":{pattern:"${n}"}}} inserts it as the theme ships it; change its words after with {find, replace}.`
  const exact = said(name)
  return exact.length <= 200 ? exact : said('<this name>')
}

/** The next of a pattern list that has rows. */
export const PATTERN_LIST_NEXT =
  'Insert one by its name: content.update {kind, id, rev, blocks:{"+<i>":{pattern:"<name>"}}}; never re-type a pattern\'s markup.'

/**
 * A pattern answer with its way on: a read of one pattern ({@link patternReadNext}), or a list with rows
 * ({@link PATTERN_LIST_NEXT}). A refusal, an empty list, or an answer that already names its next is left
 * as it is.
 * @param {'content.get' | 'content.list'} action
 * @param {unknown} answer
 * @returns {unknown}
 */
export function withPatternNext(action, answer) {
  if (!isRecord(answer) || answer.ok !== true || 'next' in answer) return answer
  if (action === 'content.get' && isRecord(answer.item) && typeof answer.item.content === 'string') {
    const name = typeof answer.key === 'string' && answer.key !== '' ? answer.key : '<this name>'
    return { ...answer, next: patternReadNext(name) }
  }
  if (
    action === 'content.list' &&
    answer.kind === 'pattern' &&
    Array.isArray(answer.items) &&
    answer.items.length > 0
  )
    return { ...answer, next: PATTERN_LIST_NEXT }
  return answer
}

/**
 * A `content.list {kind:"pattern"}` answer as the model may read it: the plugin's list when it says it is
 * one (`kind:"pattern"` and `items`), else {@link patternsUnsupported} — the posts an old plugin lists for
 * any kind look like an answer and are not one. A refusal that is not about patterns (a read that failed)
 * is passed on as the plugin said it.
 * @param {unknown} answer
 * @returns {unknown}
 */
export function patternListOrRefused(answer) {
  if (isRecord(answer) && answer.ok === true)
    return answer.kind === 'pattern' && Array.isArray(answer.items)
      ? answer
      : patternsUnsupported({ list: true })
  return patternsRefused(answer) ? patternsUnsupported({ list: true }) : answer
}
