/**
 * The words a Joomla site prints that live in no row and no slot: its template's and extensions' language strings, written in
 * the site's language as Joomla language overrides (`template.languageOverrides`, Claude Cowork for Joomla).
 *
 * 🔒 A SITE WRITTEN IN ANOTHER LANGUAGE SAYS EVERY WORD A VISITOR READS IN IT (TCH #1013, LANG-2). Measured 10/10/2026 on dev
 * g58-ess-j-full (JA Essence j6 1.0.4, Vietnamese): the words were Vietnamese and Joomla's own were too (the vi-VN pack), but
 * "Share article:", "Tags in:", "Author's latest articles" (the template's own language file, shipped in en-GB only) and
 * "All Rights Reserved." (left English by the pack) were not, and every article's details read "Banner được lưu thành công."
 * (the vi-VN 4.2.2.1 pack gives COM_CONTENT_ARTICLE_INFO, "Details", the translation of another string). The plugin names
 * each string that still reads in en-GB, or reads as another string's translation; each is translated from its en-GB words
 * and written to `language/overrides/<tag>.override.ini`, which Joomla reads after every other file. Nothing the template
 * or the pack ships is edited, so it works for every template, and one revert takes it back.
 *
 * Translated by the text model in batches, all at once, and kept in this process by language and words: the template's
 * words and Joomla's are the same on every site made from the same release, so the second site in a language asks nothing.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { translateKit } from './joomla-kit.js'

/**
 * How many pages of strings one Apply reads at most, when the plugin pages its list (`nextOffset`). 🔒 NO STRING IS CUT HERE (TCH
 * #1013, LANG-2): every one the site offers is translated. This used to stop at 600, so on dev g59-ess-j-full (JA Essence,
 * vi-VN, 10/10/2026) the strings past it ("All Rights Reserved", "Remember me", the short month names) were never asked.
 */
export const MOST_PAGES = 20
/** Translations already made, by `<tag>:<limit>:<en-GB words>`: shared by every Apply this process runs. */
const MADE = new Map()
/** How many entries the shared cache keeps before it starts again. */
const MADE_MAX = 20_000

/** The template folder a release is made for (`ja_essence`), from its contract manifest; null when it does not say. */
export function templateOf(/** @type {string} */ dir) {
  try {
    const template = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).template
    return typeof template === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(template) ? template : null
  } catch {
    return null
  }
}

/** The page after this one, when the plugin pages its list (`nextOffset`, or `next`), else null. */
const nextPage = (/** @type {any} */ read) => {
  const next = read?.nextOffset ?? read?.next
  return typeof next === 'number' || (typeof next === 'string' && next !== '') ? next : null
}

/** What a refusal says: its code and its words, never a bare "refused". */
const refusalOf = (/** @type {any} */ answer) => {
  const code = [
    answer?.code,
    answer?.error?.code,
    typeof answer?.error === 'string' ? answer.error : null
  ].find((w) => typeof w === 'string' && w !== '')
  const words = [answer?.message, answer?.error?.message].find((w) => typeof w === 'string' && w !== '')
  return { code: code ?? null, words: words && words !== code ? words : null }
}

/** The note for a read the site or the door refused: who refused, and the code. */
function refusedNote(/** @type {any} */ read) {
  const { code, words } = refusalOf(read)
  const told = [code, words].filter(Boolean).join(': ') || 'no answer'
  if (/^(bad_action|unavailable)$/.test(code ?? '') || /unknown action/i.test(words ?? ''))
    return `this site’s Claude Cowork plugin cannot write language overrides (${told}), so the template’s own words keep their English: the plugin needs 0.24.11 or later`
  if (code === 'ACTION_NOT_ALLOWED' || code === 'TOOLSET_NOT_GRANTED' || code === 'SEAT_NOT_AUTHORIZED')
    return `the Apply door refused template.languageOverrides (${told}), so the template’s own words keep their English`
  return `the site refused template.languageOverrides (${told}), so the template’s own words keep their English`
}

/**
 * Translate and write the site's language strings that still read in en-GB in `locale`: every string the site offers, page by
 * page when the plugin pages them (`nextOffset`, asked back as `offset`). Never throws; what cannot be read, translated or written
 * keeps its words, said with the reason.
 * @param {Parameters<typeof translateLanguageOverrides>[0]} input
 * @returns {Promise<{ written: number, offered: number, refused: number }>}
 */
export async function writeLanguageOverrides(input) {
  return (await translateLanguageOverrides(input)).write()
}

/**
 * The first half of `writeLanguageOverrides`: read the strings and translate them, nothing written. Its `write` writes them.
 *
 * 🔒 THE TRANSLATING RUNS BESIDE THE LONG STEP, THE WRITING WHERE IT ALWAYS WAS (TCH #1367, 15/10/2026). The list is the
 * template's and its extensions' en-GB strings the language pack the site installed leaves in English: no write of an Apply
 * changes it. Measured on the local stand (Tracy Business Joomla 1.2.3, Dutch): translating 601 strings took 58 s after the
 * menu's 96 s, and the apply ran past its 180 s; started with the menu's, it costs the apply only its write.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {string | null} input.template - the site template's folder
 * @param {string} input.locale - a Joomla tag, `vi-VN`
 * @param {{ chat: Function } | null} input.model
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @param {number} [input.pages] - the most pages read
 * @returns {Promise<{ write: () => Promise<{ written: number, offered: number, refused: number }> }>}
 */
export async function translateLanguageOverrides({
  apply,
  siteKey,
  template,
  locale,
  model,
  signal,
  note,
  pages = MOST_PAGES
}) {
  const none = { written: 0, offered: 0, refused: 0 }
  const nothing = { write: async () => none }
  if (!template || locale === 'en-GB') return nothing
  if (!model) {
    note('no text model is set, so the template’s own words keep their English')
    return nothing
  }
  const door = (/** @type {Record<string, unknown>} */ params) =>
    apply({ siteKey, action: 'template.languageOverrides', params: { template, locale, ...params } })
  try {
    /** @type {Array<{ offset: unknown, rows: any[] }>} */
    const read = []
    /** @type {Set<string>} */
    const overridden = new Set()
    /** @type {Set<string>} */
    const seen = new Set()
    let offset = /** @type {unknown} */ (undefined)
    let cut = false
    let total = /** @type {number | null} */ (null)
    for (let page = 0; page < pages; page += 1) {
      const answer = await door({ operation: 'read', ...(offset === undefined ? {} : { offset }) })
      if (!answer?.ok) {
        note(page === 0 ? refusedNote(answer) : `${refusedNote(answer)} past the first ${seen.size} strings`)
        if (page === 0) return nothing
        break
      }
      for (const key of Object.keys(answer.overrides ?? {})) overridden.add(key)
      if (typeof answer.total === 'number') total = answer.total
      const rows = (Array.isArray(answer.strings) ? answer.strings : []).filter(
        (/** @type {any} */ row) =>
          typeof row?.key === 'string' && typeof row?.source === 'string' && !seen.has(row.key)
      )
      for (const row of rows) seen.add(row.key)
      read.push({ offset, rows })
      const next = nextPage(answer)
      // 🔒 A CUT LIST IS SAID (TCH #1013): a plugin that stops its list (`truncated`) and offers no next page leaves the rest
      // English; the note names it so the build report shows it, and a newer plugin pages them.
      if (answer.truncated === true && next === null) cut = true
      if (next === null || next === offset || rows.length === 0) break
      if (page === pages - 1) cut = true
      offset = next
    }
    if (cut)
      note(
        `the site offered ${seen.size}${total !== null ? ` of ${total}` : ''} of its strings that read in English: the rest keep their English until the Claude Cowork plugin offers them`
      )
    let offered = 0
    /** @type {Array<{ at: unknown, values: Record<string, string> }>} the translated pages, in the order they were read */
    const ready = []
    for (const { offset: at, rows } of read) {
      const asked = rows.filter((/** @type {any} */ row) => !overridden.has(row.key))
      offered += asked.length
      if (asked.length === 0) continue
      // 🔒 A DATE FORMAT IS WRITTEN AS THE PLUGIN GIVES IT, NEVER TRANSLATED (LANG-6, TCH #1013): a layout's `Text::_('F j, Y')`
      // takes the language's own format (`reason: date-format`, `value`), which a model would only turn into words.
      /** @type {Record<string, string>} */
      const formats = {}
      for (const row of asked)
        if (row.reason === 'date-format' && typeof row.value === 'string' && row.value.trim() !== '')
          formats[row.key] = row.value
      const slots = asked
        .filter((/** @type {any} */ row) => row.reason !== 'date-format')
        .map((/** @type {any} */ row) => ({
          key: row.key,
          type: 'text',
          sample: row.source,
          maxCharacters: Math.min(2000, Math.max(40, row.source.length * 3))
        }))
      const known = (/** @type {any} */ slot) => `${locale}:${slot.maxCharacters}:${slot.sample}`
      // Retried, split and asked line by line when an answer cannot be used (`translateKit`), every fallback said.
      const said = await translateKit({
        slots,
        locale,
        source: 'en-GB',
        model,
        shipped: MADE,
        signal,
        note,
        what: 'the template’s own words'
      })
      if (MADE.size > MADE_MAX) MADE.clear()
      /** @type {Record<string, string>} */
      const values = { ...formats }
      for (const slot of slots) {
        const words = said[slot.key]
        if (typeof words !== 'string' || words.trim() === '' || words.trim() === slot.sample.trim()) continue
        values[slot.key] = words
        MADE.set(known(slot), words)
      }
      if (Object.keys(values).length > 0) ready.push({ at, values })
    }
    return { write: () => writeTranslated({ door, ready, paged: read.length > 1, offered, note }) }
  } catch (error) {
    note(`the template’s own words keep their English: ${error instanceof Error ? error.message : error}`)
    return nothing
  }
}

/**
 * Write the pages `translateLanguageOverrides` made, each under its own apply id. Never throws.
 * @param {{ door: (params: Record<string, unknown>) => Promise<any>, ready: Array<{ at: unknown, values: Record<string, string> }>,
 *   paged: boolean, offered: number, note: (note: string) => void }} input
 */
async function writeTranslated({ door, ready, paged, offered, note }) {
  let written = 0
  let refused = 0
  /** @type {string[]} */
  const why = []
  try {
    for (const { at, values } of ready) {
      const stamp = Date.now().toString(36)
      const set = await door({
        operation: 'set',
        strings: values,
        apply_id: `lover-${stamp}${paged ? `-${written}` : ''}`,
        ...(at === undefined ? {} : { offset: at })
      })
      if (!set?.ok) {
        const { code, words } = refusalOf(set)
        note(
          `${Object.keys(values).length} of the template’s own words keep their English: the site refused to write them (${[code, words].filter(Boolean).join(': ') || 'no answer'})`
        )
        continue
      }
      written += Number(set.written ?? 0)
      const no = Array.isArray(set.refused) ? set.refused : []
      refused += no.length
      for (const row of no.slice(0, 3)) why.push(`${row?.key}: ${row?.reason}`)
    }
    if (refused > 0)
      note(
        `${refused} of the template’s own words were refused by the site and keep their English (${why.slice(0, 3).join('; ')})`
      )
    return { written, offered, refused }
  } catch (error) {
    note(`the template’s own words keep their English: ${error instanceof Error ? error.message : error}`)
    return { written, offered, refused }
  }
}
