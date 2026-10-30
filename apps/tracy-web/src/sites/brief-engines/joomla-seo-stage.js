/**
 * The SEO stage of a Joomla brief build (spec TracyHQ/tracy#189, criteria 8.1, 8.4 and 8.5, R12 group G), run last, after
 * every other write to the menu, so it is the last word on what each page says to a search engine.
 *
 * 🔒 THE LAST WRITE OF A PAGE'S HEAD WINS, SO THE PLAN IS WRITTEN LAST. Measured on a brief build 30/10/2026: the tidy-up wrote
 * the Contact page's planned title into its menu entry, then the contact record's settings were written onto the same
 * entry from the params read before that, so the whole `params` column went back without the title, and the page read
 * "Contact" with no description. Every write of a menu entry's `params` writes the column whole; this stage reads the menu
 * again and writes the planned title, description and share words (`og_title`, `og_desc`, which a T4 template prints when
 * its Open Graph is on) where they are not what the plan says.
 *
 *   menu pages    `page_title`, `menu-meta_description`, `og_title`, `og_desc` of the entry that opens the page
 *   record pages  the article's own `metadesc` and browser title (`attribs.article_page_title`, which Joomla's article
 *                 view prints when the menu entry is not the article's own), from the page's written copy
 *                 (`record-seo.mjs`)
 *   business      the site plan's one LocalBusiness record, as a JSON-LD script in one custom module on every page
 *
 * 🔒 NEVER IN THE WAY OF A BUILD: what the site refuses is said, and the build goes on. The plan is written in English, so
 * only an entry of every language or of an English site takes it.
 */
import { schemaScript, withSiteUrl } from 'website-opportunities/domain/business-schema.mjs'
import {
  AS_MAIN_HEADING,
  headingParamsOf,
  mainHeadingsOf
} from 'website-opportunities/domain/main-headings.mjs'
import { recordSeoOf } from 'website-opportunities/domain/record-seo.mjs'
import { listWhole } from './joomla-articles.js'
import { writeHeadModules } from './joomla-head-module.js'
import { enableTemplateOpenGraph } from './joomla-open-graph.js'
import { altSteps } from './joomla-picture-alt.js'
import { paramsOf, writeSteps } from './joomla-tidy.js'

/** The note of the business record module. */
export const SCHEMA_NOTE = 'tracy-business-schema'
/** The roles of a record page's own copy, most telling first: what its description is cut from. */
const COPY_ROLES = ['offering.summary', 'person.bio', 'offering.description', 'editorial.paragraph']
const NO_PAGE = new Set(['heading', 'alias', 'url', 'separator'])

const trimmed = (/** @type {unknown} */ p) => String(p ?? '').replace(/^\/+|\/+$/g, '')
const english = (/** @type {string} */ language) => language === '*' || /^en\b/i.test(language)

/**
 * The menu writes that make each planned page's entry say its plan, and switch on the component's own page heading (an
 * h1 of the page's name) where the template declares that is the page's main heading (`main-headings.mjs`).
 * @param {{ rows: any[], plans: Array<{path: string | null, role: string, title: string, description: string}>,
 *   contentMap?: any }} input
 * @returns {Array<{kind: 'menuItem', id: number, fields: {params: string}}>}
 */
export function seoMenuSteps({ rows, plans, contentMap = null }) {
  const steps = []
  const headings = mainHeadingsOf(contentMap)
  const entityOf = (/** @type {any} */ row) =>
    (contentMap?.pages ?? []).find((p) => trimmed(p.route) === trimmed(row.path))?.entity ?? null
  for (const row of rows ?? []) {
    if (Number(row?.published) !== 1 || Number(row.id) <= 1 || NO_PAGE.has(String(row.type ?? ''))) continue
    const plan = english(String(row.language ?? '*'))
      ? ((plans ?? []).find((p) =>
          Number(row.home) === 1
            ? p.role === 'home'
            : p.role !== 'home' && typeof p.path === 'string' && trimmed(p.path) === trimmed(row.path)
        ) ?? null)
      : null
    const name = String(row.title ?? '').trim()
    const heading = name === '' ? null : headingParamsOf(headings.get(entityOf(row)), name)
    if (!plan && !heading) continue
    const params = paramsOf(row.params)
    if (!params) continue
    const want = {
      ...(plan ? { page_title: plan.title, og_title: plan.title } : {}),
      ...(plan?.description ? { 'menu-meta_description': plan.description, og_desc: plan.description } : {}),
      ...(heading ?? {})
    }
    if (Object.entries(want).every(([k, v]) => params[k] === v)) continue
    steps.push({
      kind: 'menuItem',
      id: Number(row.id),
      fields: { params: JSON.stringify({ ...params, ...want }) }
    })
  }
  return steps
}

/** Text as HTML. */
const escaped = (/** @type {string} */ t) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The record field the template prints as the page's title, as the page's one h1; null when it is not to be written. */
function headingField(entry, holder, label) {
  if (entry?.via !== 'field' || !Array.isArray(entry.jsonPath) || entry.jsonPath.length !== 1) return null
  const held = String(holder?.[entry.jsonPath[0]] ?? '')
  if (/<h1\b/i.test(held)) return null
  // A field the build left blank ("&nbsp;") takes the record's own name, never stays empty.
  const words = held.replace(/<[^>]*>|&nbsp;/g, ' ').trim()
  return AS_MAIN_HEADING(words === '' ? escaped(label) : held)
}

/**
 * The article writes that give each record page its own title and description.
 * @param {{ records: any[], contentMap: any, articles: any[], written: Record<string, string> }} input - `written`: the
 *   slot values the build wrote, by slot key
 * @returns {Array<{kind: 'article', id: number, fields: Record<string, string>}>}
 */
export function recordSeoSteps({ records, contentMap, articles, written = {} }) {
  const steps = []
  for (const record of records ?? []) {
    const entity = (contentMap?.entities ?? []).find((e) => e.key === record.entity)
    if (!entity || entity.kind !== 'article') continue
    const alias = entity.identity?.alias
    const row =
      articles.find((a) => alias && a.alias === alias) ??
      articles.find((a) => Number(a.id) === Number(entity.sourceId))
    if (!row) continue
    const slots = (contentMap?.slots ?? []).filter((s) => s.entity === record.entity)
    const copy = COPY_ROLES.flatMap((role) =>
      slots.filter((s) => s.role === role).map((s) => written[s.key] ?? '')
    )
    const { title, description } = recordSeoOf(record, copy)
    const attribs = paramsOf(row.attribs ?? '{}') ?? {}
    const fields = /** @type {Record<string, string>} */ ({})
    if (String(row.metadesc ?? '') !== description) fields.metadesc = description
    // The page's one h1, where the template declares a record field is its title (`main-headings.mjs`).
    const entry = mainHeadingsOf(contentMap).get(record.entity)
    const h1 = entry?.column === 'attribs' ? headingField(entry, attribs, record.label) : null
    const next = {
      ...attribs,
      article_page_title: title,
      ...(h1 ? { [entry.jsonPath[0]]: h1 } : {})
    }
    if (attribs.article_page_title !== title || h1) fields.attribs = JSON.stringify(next)
    if (Object.keys(fields).length > 0) steps.push({ kind: 'article', id: Number(row.id), fields })
  }
  return steps
}

/**
 * Write the SEO stage. Never throws.
 * @param {{ apply: Function, siteKey: string, sitePlan: any, contentMap: any, written?: Record<string, string>,
 *   alts?: Map<string, string>, template?: string | null,
 *   origin?: string | null, note: (line: string) => void, time?: (key: string, n: number) => void }} input
 * @returns {Promise<{menu: number, records: number, schema: number, altsUnplaced: number, openGraph: string}>}
 */
export async function writeJoomlaSeo({
  apply,
  siteKey,
  sitePlan,
  contentMap,
  written = {},
  alts = new Map(),
  template = null,
  origin = null,
  note,
  time
}) {
  const out = { menu: 0, records: 0, schema: 0, altsUnplaced: 0, openGraph: 'none' }
  const seo = sitePlan?.seo
  if (!seo) return out
  const stamp = Date.now().toString(36)
  const say = (/** @type {string} */ what, /** @type {unknown} */ error) =>
    note(`${what} could not be written: ${error instanceof Error ? error.message : error}`)
  try {
    const rows = await listWhole(/** @type {any} */ (apply), siteKey, 'menuItem')
    const steps = seoMenuSteps({ rows, plans: Array.isArray(seo.pages) ? seo.pages : [], contentMap })
    if (steps.length)
      out.menu = (await writeSteps({ apply, siteKey, steps, applyId: `seo-menu-${stamp}` })).written
  } catch (error) {
    say("the pages' planned titles and descriptions", error)
  }
  // The articles take their pictures' alt text, then the record pages' titles, read once and written once per row: two
  // writes of one row's whole `attribs` from one read would undo each other.
  try {
    const records = Array.isArray(seo.records) ? seo.records : []
    if (records.length || alts.size) {
      const articles = await listWhole(/** @type {any} */ (apply), siteKey, 'article')
      const alt = altSteps({ rows: articles, kind: 'article', alts })
      const patched = articles.map((row) => {
        const step = alt.steps.find((s) => s.id === Number(row.id))
        return step ? { ...row, ...step.fields } : row
      })
      const byId = new Map(alt.steps.map((s) => [s.id, s]))
      for (const step of recordSeoSteps({ records, contentMap, articles: patched, written }))
        byId.set(step.id, { ...step, fields: { ...(byId.get(step.id)?.fields ?? {}), ...step.fields } })
      const modules = alts.size
        ? altSteps({
            rows: await listWhole(/** @type {any} */ (apply), siteKey, 'module'),
            kind: 'module',
            alts
          })
        : { steps: [], missed: 0 }
      const steps = [...byId.values(), ...modules.steps]
      if (steps.length) {
        const done = await writeSteps({ apply, siteKey, steps, applyId: `seo-records-${stamp}` })
        out.records = done.written
      }
      out.altsUnplaced = alt.missed + modules.missed
      if (out.altsUnplaced > 0)
        note(
          `${out.altsUnplaced} placed picture(s) have no alt field beside them in the template, so they keep its own alt`
        )
    }
  } catch (error) {
    say("the record pages' titles and the pictures' alt text", error)
  }
  // The template's own Open Graph, which prints each page's og:title and og:description from the words written above.
  out.openGraph = await enableTemplateOpenGraph({
    apply,
    siteKey,
    template,
    applyId: `seo-og-${stamp}`,
    note
  })
  if (seo.schema) {
    const wrote = await writeHeadModules({
      apply: /** @type {any} */ (apply),
      siteKey,
      blocks: [
        {
          note: SCHEMA_NOTE,
          title: 'Tracy business record',
          content: schemaScript(withSiteUrl(seo.schema, origin)),
          part: /** @type {any} */ ('schema')
        }
      ],
      applyId: `seo-schema-${stamp}`,
      note,
      retire: false
    }).catch((error) => {
      say('the business record for search engines', error)
      return { written: 0 }
    })
    out.schema = wrote.written
  }
  if (time) {
    if (out.openGraph === 'on') time('seoOpenGraphOn', 1)
    for (const [k, n] of Object.entries(out))
      if (typeof n === 'number' && n > 0) time(`seo${k[0].toUpperCase()}${k.slice(1)}`, n)
  }
  return out
}
