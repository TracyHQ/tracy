/**
 * The blog pager taken off a record page laid out as a landing page (spec TracyHQ/tracy#189, site build rule 3). A
 * template that shows each record of one kind (a lesson, a service, a product) on a page of its own declares those pages
 * in its content map (`recordPages`, `website-opportunities/domain/record-pages.mjs`); a `landing` one is no blog post, so
 * Joomla's Previous / Next article links (`plg_content_pagenavigation`) are switched off in that article's own options
 * (`attribs.show_item_navigation = "0"`). The article stays, its words and pictures stay; only the pager goes.
 *
 * 🔒 NEVER IN THE WAY OF A BUILD: an article the site does not list, or a write the site refuses, is said and the build
 * goes on.
 */
import { landingRecordEntities } from 'website-opportunities/domain/record-pages.mjs'
import { listWhole } from './joomla-articles.js'
import { writeSteps } from './joomla-tidy.js'

const OFF = '0'

const attribsOf = (row) => {
  if (row?.attribs && typeof row.attribs === 'object') return row.attribs
  try {
    const parsed = JSON.parse(String(row?.attribs ?? '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * The writes that take the pager off each declared landing record page, matched to the site's articles by the alias the
 * map names (else by the demo's id).
 * @param {{entities?: any[], recordPages?: any[]}} contentMap
 * @param {any[]} articles - the site's article rows (`content.list`)
 * @returns {Array<{kind: 'article', id: number, fields: {attribs: string}}>}
 */
export function recordPagerSteps(contentMap, articles) {
  const wanted = new Set(landingRecordEntities(contentMap))
  if (!wanted.size) return []
  const entities = (contentMap?.entities ?? []).filter((e) => wanted.has(e.key))
  const steps = []
  for (const entity of entities) {
    const alias = entity.identity?.alias
    const row =
      articles.find((a) => alias && a.alias === alias) ??
      articles.find((a) => Number(a.id) === Number(entity.sourceId))
    if (!row) continue
    const attribs = attribsOf(row)
    if (String(attribs.show_item_navigation ?? '') === OFF) continue
    steps.push({
      kind: 'article',
      id: Number(row.id),
      fields: { attribs: JSON.stringify({ ...attribs, show_item_navigation: OFF }) }
    })
  }
  return steps
}

/**
 * Take the pager off every landing record page. Never throws.
 * @returns {Promise<number>} how many articles were written
 */
export async function hideRecordPagers({ apply, siteKey, contentMap, applyId, note = () => {} }) {
  if (!landingRecordEntities(contentMap).length) return 0
  try {
    const steps = recordPagerSteps(contentMap, await listWhole(apply, siteKey, 'article'))
    if (!steps.length) return 0
    const done = await writeSteps({ apply, siteKey, steps, applyId })
    for (const line of done.notes.slice(0, 3)) note(line)
    return done.written
  } catch (error) {
    note(
      `the blog pager could not be taken off the record pages: ${error instanceof Error ? error.message : error}`
    )
    return 0
  }
}
