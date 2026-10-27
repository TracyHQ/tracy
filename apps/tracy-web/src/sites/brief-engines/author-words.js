/**
 * The words of the template's authors a visitor reads (their job and their bio) said in the site's language (LANG-2, TCH #1013).
 *
 * 🔒 AN AUTHOR'S JOB AND BIO ARE THE SITE'S WORDS. Measured 10/10/2026 on dev g60-ess-wp-full and g60-ess-j-full (JA Essence,
 * a bakery, Vietnamese): the author listing and every author block printed "Collaborator & Editor" and "It's remarkable to
 * watch a five-year-old draw…" in English on 17 pages. They are not in any contract slot: WordPress keeps them in user meta
 * (`description`, the theme's `job_title`), Joomla in the user's profile (`#__user_profiles` `profile.aboutme`,
 * `profile.user_jobtitle`), so no step of Apply reached them. The Claude Cowork plugins now list and write those fields
 * (a whitelist of the visitor-facing ones, every write recorded for revert): WordPress kind `usermeta`, Joomla kind
 * `userProfile`, through `content.list` and `content.update`.
 *
 * 🔒 FULL ONLY, AND ONLY TRANSLATED. On a site written for the customer (About given) in another language than the template's,
 * each field is translated from the template's words (`translateLines`: asked again, split, line by line; an answer that keeps
 * the English counts as no answer), never rewritten for the business: the authors stay the template's sample people. BLANK keeps
 * the demo as it is (BLANK = demo except the name); the author's name is never touched. What cannot be translated or written
 * keeps its words, and the build report says how many and why.
 */
import { translateLines } from './translate-lines.js'

/** How many lines one translation asks at a time. */
const BATCH = 20
/** How many author fields one site may hold that this step reads (a list page of the plugin). */
const MOST = 200

/** Each CMS's door: the kind its plugin lists and writes, and how one item becomes the lines it holds. */
const DOORS = /** @type {const} */ ({
  wordpress: {
    kind: 'usermeta',
    /** `{ id, name, meta: { description, job_title… } }` → one line per field. */
    lines: (/** @type {any} */ item) =>
      Object.entries(item?.meta ?? {}).map(([key, value]) => ({ id: Number(item.id), key, value })),
    write: (/** @type {{ id: number, key: string }} */ line, /** @type {string} */ value) => ({
      kind: 'usermeta',
      id: line.id,
      key: line.key,
      fields: { value }
    })
  },
  joomla: {
    kind: 'userProfile',
    /** `{ id, user_id, name, field, value }` → its one line. */
    lines: (/** @type {any} */ item) => [
      { id: Number(item.id), key: String(item.field ?? ''), value: item.value }
    ],
    write: (/** @type {{ id: number }} */ line, /** @type {string} */ value) => ({
      kind: 'userProfile',
      id: line.id,
      fields: { value }
    })
  }
})

/** What a refusal says, code and words. */
const refusal = (/** @type {any} */ answer) =>
  [answer?.code, answer?.error?.code ?? answer?.error, answer?.message ?? answer?.error?.message]
    .filter((w) => typeof w === 'string' && w !== '')
    .join(': ') || 'no answer'

/**
 * Translate and write the visitor-facing fields of the site's authors. Never throws.
 * @param {object} input
 * @param {'wordpress' | 'joomla'} input.platform
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {string} input.locale - the language the site is written in
 * @param {string} input.source - the template's own language
 * @param {boolean} input.described - whether the customer described the business (FULL)
 * @param {{ chat: Function } | null} input.model
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @returns {Promise<{ found: number, written: number }>}
 */
export async function translateAuthorWords({
  platform,
  apply,
  siteKey,
  locale,
  source,
  described,
  model,
  signal,
  note
}) {
  const none = { found: 0, written: 0 }
  const door = DOORS[platform]
  const primary = (/** @type {string} */ tag) =>
    String(tag ?? '')
      .toLowerCase()
      .split(/[-_]/)[0]
  if (!door || !described || primary(locale) === primary(source)) return none
  try {
    const listed = await apply({ siteKey, action: 'content.list', params: { kind: door.kind, limit: MOST } })
    if (!listed?.ok) {
      note(
        `the authors' job and bio keep the template's words: this site's Claude Cowork plugin cannot list them (${refusal(listed)})`
      )
      return none
    }
    const items = Array.isArray(listed.items) ? listed.items : []
    const lines = items
      .flatMap((item) => door.lines(item))
      .filter((line) => Number.isInteger(line.id) && line.id > 0 && typeof line.value === 'string')
      .filter((line) => /\p{L}{2}/u.test(line.value))
      .map((line, at) => ({
        ...line,
        slot: {
          key: `author-${at}`,
          type: 'text',
          sample: line.value,
          // A bio may grow in another language; a job title stays a title.
          maxCharacters: Math.max(80, Math.ceil(line.value.length * 2))
        }
      }))
    if (lines.length === 0) return none
    if (!model) {
      note(`${lines.length} author field(s) keep the template's words: no text model is set`)
      return { found: lines.length, written: 0 }
    }
    const said = await translateLines({
      lines: lines.map((l) => l.slot),
      locale,
      shipped: new Map(),
      model,
      signal,
      note,
      what: "the authors' job and bio",
      batch: BATCH
    })
    const applyId = `authors-${Date.now().toString(36)}`
    let written = 0
    /** @type {string[]} */
    const why = []
    for (const line of lines) {
      const words = said[line.slot.key]
      if (typeof words !== 'string') continue
      // eslint-disable-next-line no-await-in-loop -- one field at a time, under one apply id.
      const set = await apply({
        siteKey,
        action: 'content.update',
        params: { ...door.write(line, words), apply_id: applyId }
      }).catch((/** @type {unknown} */ error) => ({ ok: false, message: String(error) }))
      if (set?.ok) written += 1
      else why.push(refusal(set))
    }
    const kept = lines.length - written
    if (written > 0) note(`${written} author field(s) (job, bio) were translated into the site's language`)
    if (kept > 0)
      note(
        `${kept} author field(s) (job, bio) keep the template's words${why.length > 0 ? `: the site refused them (${why.slice(0, 2).join('; ')})` : ': no usable translation came back'}`
      )
    return { found: lines.length, written }
  } catch (error) {
    note(
      `the authors' job and bio keep the template's words: ${error instanceof Error ? error.message : error}`
    )
    return none
  }
}
