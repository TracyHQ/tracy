/**
 * Requests the WordPress Build tool answers on an owned build (`tracy_site_build_wordpress request`).
 * Registered commands select fixed build stages; catalog data never executes arbitrary code.
 *
 * WordPress has no `language` stage: the seeder does the language work inside `seed` (it writes
 * the source and every chosen edition, hides the demo posts, retires the editions the customer
 * did not choose). So a language change is answered by running the build again from `seed` with
 * the new list of languages — the Claude Cowork plugin's `multilingual.retire` then brings the new edition
 * back to life and the seeder writes the customer's words into it.
 */
/**
 * The tag is normalised HERE, not through the seeder's catalogue: that module carries the
 * languages' native names (third-party data the `language` gate keeps out of a bundle), and the
 * archive — not a catalogue — decides which editions exist. The seeder resolves the tag against
 * the contract's `editions.json` and says by name when the archive ships no such edition.
 */
const AMBIGUOUS = {
  zh: ['zh-cn', 'zh-tw'],
  pt: ['pt-br', 'pt-pt'],
  en: ['en-us', 'en-gb', 'en-au', 'en-ca', 'en-nz']
}
/** @param {string} raw */
function normaliseTag(raw) {
  const lower = raw.trim().replace(/_/g, '-').toLowerCase()
  if (!/^[a-z]{2,3}(-[a-z]{2,4})?$/.test(lower))
    throw new Error(`"${raw}" is not a language tag such as de-de or vi`)
  if (AMBIGUOUS[lower])
    throw new Error(
      `"${raw}" names several editions (${AMBIGUOUS[lower].join(', ')}). Ask the customer, then call language.add again with the tag.`
    )
  return lower
}
const primaryOf = (tag) => String(tag).toLowerCase().split('-')[0]

/** @type {NonNullable<import('@tracy/site-build-core/host').CmsSpec['requests']>} */
export const requests = {
  'content.revise': {
    recipe: 'content.contract',
    hint: '{answers:{...}} — updated brief fields; writes the copy again into the existing slots.',
    change(input) {
      const answers = input.answers
      if (!answers || typeof answers !== 'object' || Array.isArray(answers))
        throw new Error('content.revise needs answers containing the customer brief changes')
      return { answers: /** @type {Record<string, unknown>} */ (answers), stage: 'copy' }
    }
  },
  /**
   * "Add German to the website" — one more of the 41 editions the archive ships becomes live,
   * and the customer's words are written into it.
   */
  'language.add': {
    recipe: 'language.add',
    change(input, job) {
      const raw = typeof input.language === 'string' ? input.language.trim() : ''
      if (!raw) throw new Error('language.add needs language, a BCP 47 tag such as "de-de"')
      const tag = normaliseTag(raw)
      const current = Array.isArray(job.answers?.languages)
        ? job.answers.languages.map((l) => String(l).toLowerCase())
        : []
      // Already live (by language, whatever the region): nothing appended, the seed still runs.
      if (current.some((l) => primaryOf(l) === primaryOf(tag)))
        return { answers: { languages: current }, stage: 'seed' }
      return { answers: { languages: [...current, tag] }, stage: 'seed' }
    },
    hint:
      `{language:"de-de"} — makes one more language of the site live, with the customer's words written into it; ` +
      `the languages already chosen keep working. The build runs again from its seed stage, and its detail names the ` +
      `language when the quickstart's archive ships no such edition. A bare "zh" or "pt" is refused with the choices to ` +
      `ask the customer about. It does NOT translate menu labels the archive did not ship, words inside pictures, or ` +
      `the site title — say so rather than promising them.`
  }
}
