/**
 * The interface words a WordPress site's blocks carry as attributes ("Read more" on an excerpt, "By " before an author, a
 * search button's "Search"), in the site's language, through the Claude Cowork plugin's block-word door.
 *
 * 🔒 A BLOCK ATTRIBUTE IS NO TEXT RUN (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12,
 * Vietnamese): nine pages printed "Read more" because `moreText` lives in the block comment, which no pass of the build
 * reads, and only one theme filtered one spelling of it. The plugin (after 0.18.7) translates those attributes when a page
 * is drawn, for every template: `content.contract {operation: 'blockWords.read', locale}` lists each English attribute
 * word the site's pages and theme carry and WordPress's own translation of it (`core`), and `blockWords.set` stores the
 * words Tracy gives for the rest, under an apply id the undo takes back.
 *
 * Nothing here fails a build: an older plugin refuses the read, and that is said.
 */

/** The most words one `blockWords.set` takes, and the longest one. */
const MOST = 500
const LONGEST = 200

/**
 * The block words of a site in its language: read, the ones WordPress does not translate translated, and stored.
 * @param {object} input
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.call - the Apply door, as one person
 * @param {string} input.locale - the locale the site speaks on its front end (`vi`, `de_DE`)
 * @param {string} input.applyId - never `contract-…`: the door refuses those
 * @param {(texts: string[]) => Promise<Map<string, string>>} input.translate - English words → the site's language
 * @param {(note: string) => void} input.note
 * @returns {Promise<{ found: number, written: number }>}
 */
export async function translateBlockWords({ call, locale, applyId, translate, note }) {
  const none = { found: 0, written: 0 }
  let read
  try {
    read = await call('content.contract', { operation: 'blockWords.read', locale })
  } catch (error) {
    read = { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  if (!read || read.ok === false) {
    note(
      `the words the theme's blocks carry (Read more, By, Search) keep the template's language: this site's Claude Cowork plugin could not list them (${String(read?.message ?? read?.error ?? read?.code ?? 'refused')})`
    )
    return none
  }
  const found = Array.isArray(read.found) ? read.found : []
  // A word WordPress already translates is the plugin's; one it does not (or "translates" into the English) is Tracy's.
  const open = [
    ...new Set(
      found
        .filter((row) => typeof row?.source === 'string' && row.source.trim() !== '')
        .filter(
          (row) =>
            typeof row.core !== 'string' || row.core.trim() === '' || row.core.trim() === row.source.trim()
        )
        .map((row) => String(row.source))
    )
  ]
  if (open.length === 0) return { found: found.length, written: 0 }
  /** @type {Map<string, string>} */
  let said = new Map()
  try {
    said = await translate(open.slice(0, MOST))
  } catch (error) {
    note(
      `the words the theme's blocks carry could not be translated: ${error instanceof Error ? error.message : error}`
    )
  }
  /** @type {Record<string, string>} */
  const words = {}
  for (const source of open.slice(0, MOST)) {
    const value = said
      .get(source)
      ?.replace(/<[^>]*>/g, '')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
    if (!value || value.trim() === '' || value.trim() === source.trim() || value.length > LONGEST) continue
    // A word that ends with a space ("By ") keeps it, so the author's name does not stick to it.
    words[source] = /\s$/.test(source) && !/\s$/.test(value) ? `${value} ` : value
  }
  const left = open.length - Object.keys(words).length
  if (left > 0)
    note(
      `${left} word(s) the theme's blocks carry keep the template's language: no translation came back for them`
    )
  if (Object.keys(words).length === 0) return { found: found.length, written: 0 }
  let set
  try {
    set = await call('content.contract', { operation: 'blockWords.set', apply_id: applyId, locale, words })
  } catch (error) {
    set = { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  if (!set || set.ok === false) {
    note(
      `the words the theme's blocks carry keep the template's language: the site refused them (${String(set?.message ?? set?.error ?? set?.code ?? 'refused')})`
    )
    return { found: found.length, written: 0 }
  }
  return {
    found: found.length,
    written: set.unchanged ? 0 : Number(set.written ?? Object.keys(words).length) || 0
  }
}
