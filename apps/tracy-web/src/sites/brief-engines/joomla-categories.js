/**
 * The article categories of a Joomla site written in a language the template has no words in, called in that language.
 *
 * 🔒 A CATEGORY'S NAME IS A WORD A VISITOR READS, SO IT FOLLOWS THE SITE'S LANGUAGE (TCH #1013, LANG-2). A category is a record,
 * not a contract slot: the planner never sees it, so a Vietnamese site built from JA Essence j6 1.0.3 still labelled every
 * blog card "Design", "Fashion" and "Health" (measured 10/10/2026, g56-ess-j-full). The template's own names are translated,
 * never renamed into the customer's trade: a category is how the demo articles are filed, and the customer files their own.
 * Only the title and a plain-text description change; the alias, the path, the parent and the state stay, so no address
 * moves. A description holding markup keeps its words (a translation of HTML is not a line the planner checks).
 *
 * 🔒 SO DOES A TAG'S (measured 10/10/2026 on dev g58-ess-j-full, JA Essence j6 1.0.4: "Tags in: Lifestyle, Line art" beside
 * Vietnamese categories). `kind: 'tag'` translates the published tags the same way, the root tag left alone; a tag's alias,
 * path and parent stay, so its page keeps its address.
 *
 * 🔒 ON A FULL SITE THE BLOG CATEGORIES ARE RENAMED FOR THE TRADE (product owner, decision (3) of 12/10/2026; this replaces
 * "never renamed" above for categories): with About given (`rename`), each leaf article category (a topic, not a section that
 * holds others, nor Joomla's own "Uncategorised") takes a name of the business (`blog-categories.js`). Its alias, path,
 * parent, state and articles stay, so a kit's "Category Style N" page still lists the same articles at the same address.
 * Refused twice, the category keeps today's name: the translation, said in the build report. Tags are only translated.
 *
 * 🔒 A CATEGORY NAMED WITH A GENERIC SECTION LABEL KEEPS IT (25/10/2026): JA Boxing's "Classes" became "Boxing Basics",
 * and its main-menu entry with it, while the planner keeps that same menu label (`nav-labels.mjs` of the seeder). A label any
 * business of the kind uses as is ("Classes", "Blog", "News") names a section, not another company's topic: it is only
 * translated, never renamed. The same list decides both, so the category and its menu entry never disagree.
 */
import { seeder } from '../../lib/seeder.js'
import { listWhole } from './joomla-articles.js'
import { tradeCategoryNames } from './blog-categories.js'
import { warmTranslations } from './joomla-languages.js'

/** Joomla's column limit for a category title. */
const TITLE_MAX = 255
/** The most characters a description translated here may take. */
const DESCRIPTION_MAX = 4000

/**
 * The writes that call the site's article categories in `locale`.
 * Never rejects: what could not be read or translated keeps the template's words, said.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {string} input.locale - the language the site is written in, a Joomla tag
 * @param {string} input.source - the template's own language
 * @param {{ chat: Function } | null} input.model
 * @param {AbortSignal} [input.signal]
 * @param {'category' | 'tag'} [input.kind] - the article categories (the default), or the tags
 * @param {{ generate: ((call: { system: string, input: unknown }) => Promise<string>) | null, about: string, name: unknown } | null} [input.rename]
 *   - About was given: the categories are named for the business (`blog-categories.js`); never for tags
 * @returns {Promise<{ steps: Array<{ kind: string, id: number, fields: Record<string, string> }>, note: string | null, renamed: Map<number, { to: string, names: string[] }> }>}
 *   `renamed`: the categories named for the business, id → new name (their menu entries take it, `joomla-menu-categories.js`)
 */
export async function categoryLanguageSteps({
  apply,
  siteKey,
  locale,
  source,
  model,
  signal,
  kind = 'category',
  rename = null
}) {
  const what = kind === 'tag' ? 'tags' : 'article categories'
  const renaming = kind === 'category' && rename !== null
  const translating = locale !== source
  /** @type {Map<number, { to: string, names: string[] }>} the categories named for the business: id → new name, and the
   * names it was known by (the demo's, its translation) */
  const renamed = new Map()
  if (!translating && !renaming) return { steps: [], note: null, renamed }
  if (!model && !renaming)
    return { steps: [], note: `no text model is set, so the ${what} keep the template’s language`, renamed }
  try {
    const rows = (await listWhole(apply, siteKey, kind)).filter((row) => {
      const language = String(row.language ?? '*')
      // A tag tree hangs from a root row (id 1, level 0) no visitor ever reads.
      const own =
        kind === 'tag' ? Number(row.id) > 1 && Number(row.level ?? 1) > 0 : row.extension === 'com_content'
      return own && Number(row.published) === 1 && (language === '*' || language === source)
    })
    /** @type {Array<{ key: string, type: string, sample: string, maxCharacters: number, id: number, field: string }>} */
    const slots = []
    for (const row of rows) {
      const id = Number(row.id)
      const title = String(row.title ?? '')
      if (/\p{L}/u.test(title))
        slots.push({
          key: `${kind}-${id}.title`,
          type: 'text',
          sample: title,
          maxCharacters: TITLE_MAX,
          id,
          field: 'title'
        })
      const description = String(row.description ?? '')
      if (/\p{L}/u.test(description) && !/<[a-z/!]/i.test(description))
        slots.push({
          key: `${kind}-${id}.description`,
          type: 'text',
          sample: description,
          maxCharacters: Math.min(DESCRIPTION_MAX, Math.max(description.length * 3, 200)),
          id,
          field: 'description'
        })
    }
    if (slots.length === 0) return { steps: [], note: null, renamed }
    /** @type {Map<number, Record<string, string>>} */
    const byId = new Map()
    /** @type {string[]} */
    const notes = []
    if (translating && model) {
      const { cache, failed } = await warmTranslations({
        locale,
        slots,
        changes: {},
        shipped: new Map(),
        model,
        signal
      })
      for (const slot of slots) {
        const said = cache.get(`${locale}:${slot.maxCharacters}:${slot.sample}`)
        if (typeof said !== 'string' || said.trim() === '' || said === slot.sample) continue
        byId.set(slot.id, { ...byId.get(slot.id), [slot.field]: said })
      }
      if (failed > 0) notes.push(`${failed} part(s) of the ${what} keep the template’s language`)
    }
    if (renaming) {
      /** The title a category was translated to, before its new name was set. */
      const translated = new Map([...byId].map(([id, fields]) => [id, fields.title]))
      const translatedTitle = (/** @type {number} */ id) => translated.get(id)
      const named = await tradeNames({ apply, siteKey, rows, byId, locale, rename })
      for (const [id, title] of named.titles) {
        byId.set(id, { ...byId.get(id), title })
        const row = rows.find((r) => Number(r.id) === id)
        const was = [String(row?.title ?? ''), String(translatedTitle(id) ?? '')].filter(Boolean)
        renamed.set(id, { to: title, names: was })
      }
      if (named.note) notes.push(named.note)
    }
    return {
      steps: [...byId].map(([id, fields]) => ({ kind, id, fields })),
      note: notes.join('; ') || null,
      renamed
    }
  } catch (error) {
    return {
      steps: [],
      note: `the ${what} keep the template’s language: ${error instanceof Error ? error.message : error}`,
      renamed: new Map()
    }
  }
}

/**
 * The leaf article categories named for the business: one name per distinct demo title, the same for every category of that
 * title (JA Essence files "Health" under two blogs). Never rejects.
 * @param {{ apply: Function, siteKey: string, rows: any[], byId: Map<number, Record<string, string>>, locale: string, rename: { generate: any, about: string, name: unknown } }} input
 * @returns {Promise<{ titles: Map<number, string>, note: string | null }>}
 */
async function tradeNames({ apply, siteKey, rows, byId, locale, rename }) {
  /** @type {Map<number, string>} */
  const titles = new Map()
  const parents = new Set(rows.map((row) => Number(row.parent_id)))
  const { isGenericNavLabel } = await seeder('nav-labels')
  const leaves = rows.filter(
    (row) =>
      !parents.has(Number(row.id)) &&
      !/^uncategori[sz]ed$/i.test(String(row.alias ?? '')) &&
      /\p{L}/u.test(String(row.title ?? '')) &&
      !isGenericNavLabel(row.title)
  )
  if (leaves.length === 0) return { titles, note: null }
  // How many published articles each category holds: the model is told how big a topic is, never moves an article.
  /** @type {Map<number, number>} */
  const held = new Map()
  try {
    for (const article of await listWhole(apply, siteKey, 'article'))
      if (Number(article.state ?? 1) === 1)
        held.set(Number(article.catid), (held.get(Number(article.catid)) ?? 0) + 1)
  } catch {
    // Unknown sizes: every category is said to hold none, and is named all the same.
  }
  /** @type {Map<string, { key: string, name: string, posts: number, ids: number[] }>} */
  const byTitle = new Map()
  for (const row of leaves) {
    const title = String(row.title)
    const entry = byTitle.get(title) ?? { key: `c${byTitle.size + 1}`, name: title, posts: 0, ids: [] }
    entry.posts += held.get(Number(row.id)) ?? 0
    entry.ids.push(Number(row.id))
    byTitle.set(title, entry)
  }
  const categories = [...byTitle.values()]
  const translations = categories.flatMap((c) => c.ids.map((id) => byId.get(id)?.title ?? '')).filter(Boolean)
  const { names, why } = await tradeCategoryNames({
    categories: categories.map(({ key, name, posts }) => ({ key, name, posts })),
    about: rename.about,
    name: rename.name,
    language: locale,
    translations,
    generate: rename.generate
  })
  if (!names)
    return {
      titles,
      note: `${categories.length} blog category name(s) were NOT renamed for the business and keep the template’s names, translated where the site is in another language: ${why}`
    }
  for (const c of categories) for (const id of c.ids) titles.set(id, names[c.key])
  return { titles, note: null }
}
