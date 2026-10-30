/**
 * 🔒 PAGES ARE ADDED ONLY BY COPYING A TEMPLATE PAGE LAYOUT (spec TracyHQ/tracy#231, ticket #238). When the brief lists more
 * items than the template has sample pages, the accepted site plan adds pages that each copy a template page; its author
 * writes each one like any other page (`page-author.js`). Here, on Joomla, the build makes them, never a new layout:
 *   - a copy of a record page is a new article copied from the family's first record (its category, layout settings,
 *     pictures and every field as the template record now shows them), with the author's words in every copy slot and no
 *     demo line left (a line the author did not write is emptied). It joins the family's category, so the listing page
 *     lists it, the footer's offerings column (which reads that category) links it, and the pager reads it as a sibling;
 *   - a copy of a page that opens an article of its own also gets a menu entry copied from the template page's, at its
 *     route, and every block the template page shows by choice (an "only on these pages" assignment) is shown on it too;
 *   - a button or link the plan sends to an added page is given its address once the page exists (`linkAddedPages`).
 * A page made by an earlier pass of the build is rewritten, never made twice (it carries its plan id in `note`). A page
 * that cannot be made is said, and the build goes on. Joomla only: WordPress and EmDash have no writer for added pages yet.
 */
import { listWhole } from './joomla-articles.js'
import { pageBodyOf } from './template-inventory-pages.js'
import { setSlotValue } from './joomla-slot-write.js'
import { readMenu, writeSteps } from './joomla-tidy.js'
import { addedSlug } from './site-plan-fill.js'

const said = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error))
const plain = (/** @type {unknown} */ v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const idOf = (/** @type {string} */ entity) => Number(String(entity).split('-')[1])
/** The note an added page's records carry, so a later pass finds them. */
const markerOf = (/** @type {string} */ pageId) => `tracy-added-page:${pageId}`
/** The fields of an article a copy takes from its template record. */
const ARTICLE_FIELDS = [
  'introtext',
  'fulltext',
  'images',
  'urls',
  'attribs',
  'metadata',
  'metakey',
  'catid',
  'language',
  'access'
]

/** Whether a slot holds words a visitor reads (a copy slot), not a video id, an address or a picture. */
export const isCopySlot = (/** @type {any} */ s) =>
  s?.type === 'text' && !/video|url|_id$|\.id$/i.test(String(s.role ?? ''))

/** Whether a slot is a picture frame (not an icon), as the template inventory tells them apart. */
export const isPictureSlot = (/** @type {any} */ s) =>
  s?.type === 'image' && s.role !== 'editorial.item_icon' && s.fit?.kind !== 'icon'

/**
 * 🔒 AN ADDED PAGE'S PICTURES FOLLOW THE PLAN, NEVER THE RECORD IT COPIES (COO rule, debt of ticket #239): the template
 * record holds its demo picture or another record's photo. The plan names no brief photo or drawing for a frame of an added
 * page (its picture ids are the template's), so each frame is hidden: cleared, recorded with the reason.
 * @param {any[]} slots - the slots of the record the page copies
 */
function addedPictures(slots) {
  return Object.fromEntries(
    slots
      .filter(isPictureSlot)
      .map((s) => [
        s.key,
        {
          applied: 'hide',
          reason: 'an added page shows no picture of the record it copies, and the plan gives it none'
        }
      ])
  )
}

/**
 * The added pages of an author run, settled: every copy slot of the record each one copies holds the author's words for it,
 * or is emptied when the author wrote nothing, the demo's words or the template record's own words. Never demo text.
 * @param {{added: any[], slots: any[], changes: Record<string, unknown>, plan?: any}} input - `added` of `writePagesInOrder`
 */
export function settleAddedPages({ added, slots, changes, plan = null }) {
  const pageOf = new Map((plan?.pages ?? []).map((/** @type {any} */ p) => [String(p?.id), p]))
  return (added ?? []).map((a) => {
    /** @type {Record<string, string>} */
    const values = {}
    for (const s of slots.filter((x) => String(x.entity) === a.source && isCopySlot(x))) {
      const value = typeof a.values?.[s.key] === 'string' ? a.values[s.key] : ''
      const words = plain(value)
      const demo = plain(s.sample)
      const own = plain(changes?.[s.key])
      values[s.key] = !words || words === demo || (words === own && words !== plain(a.item)) ? '' : value
    }
    const seo = pageOf.get(a.id)?.seo
    return {
      id: a.id,
      item: a.item,
      copies: { layout: a.copies, entity: a.source },
      values,
      pictures: addedPictures(slots.filter((x) => String(x.entity) === a.source)),
      pending: a.pending ?? [],
      ...(seo && typeof seo === 'object'
        ? { seo }
        : typeof seo === 'string'
          ? { seo: { description: seo } }
          : {})
    }
  })
}

/**
 * Make the added pages on the site.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {ReturnType<typeof settleAddedPages> | null | undefined} input.added
 * @param {any} input.contentMap
 * @param {Record<string, unknown>} [input.changes] - the values the template record's own slots got (its pictures, links)
 * @param {(note: string) => void} [input.note]
 * @returns {Promise<{pages: Array<{id: string, articleId: number, menuId: number | null, href: string}>,
 *   links: Record<string, string>}>}
 */
export async function writeAddedPages({ apply, siteKey, added, contentMap, changes = {}, note = () => {} }) {
  /** @type {Array<{id: string, articleId: number, menuId: number | null, href: string}>} */
  const pages = []
  if (!added?.length) return { pages, links: {} }
  const applyId = `added-pages-${Date.now().toString(36)}`
  const call = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
    const answer = await apply({ siteKey, action, params: { ...params, apply_id: applyId } })
    if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
    return answer
  }
  const slots = Array.isArray(contentMap?.slots) ? contentMap.slots : []
  const mapPages = Array.isArray(contentMap?.pages) ? contentMap.pages : []
  const articles = await listWhole(apply, siteKey, 'article')
  for (const page of added) {
    try {
      const source = String(page.copies?.entity ?? '')
      if (!/^article-\d+$/.test(source)) throw new Error(`it copies ${source}, which is no article`)
      const got = await call('content.get', { kind: 'article', id: idOf(source) })
      const row = got?.item ?? {}
      /** @type {Record<string, any>} */
      const fields = Object.fromEntries(ARTICLE_FIELDS.filter((f) => f in row).map((f) => [f, row[f]]))
      fields.title = page.item
      for (const s of slots.filter((x) => String(x.entity) === source)) {
        let value
        if (isCopySlot(s)) {
          value = String(page.values?.[s.key] ?? '')
          // An emptied line keeps its node (a no-break space), so the layout around it stays.
          if (!plain(value)) value = s.column === 'title' ? page.item : s.xpath ? ' ' : ''
        } else if (isPictureSlot(s)) {
          // A frame shows only what the plan gives the added page; with nothing given it is cleared (hidden).
          value = ''
        } else if (typeof changes?.[s.key] === 'string' && changes[s.key] !== '')
          value = String(changes[s.key])
        else continue
        if (!setSlotValue(fields, s, value)) note(`added page ${page.id}: ${s.key} has no place in the copy`)
      }
      const alias = addedSlug(page.item) || addedSlug(page.id)
      Object.assign(fields, { alias, state: 1, featured: 0, note: markerOf(page.id) })
      if (page.seo?.description) fields.metadesc = String(page.seo.description)
      const earlier = articles.find((a) => a?.note === markerOf(page.id))
      const articleId = earlier
        ? Number(earlier.id)
        : Number((await call('content.update', { kind: 'article', id: 0, fields }))?.id)
      if (earlier) await call('content.update', { kind: 'article', id: articleId, fields })
      if (!(articleId > 0)) throw new Error('the site did not answer with the new article')
      const layout = String(page.copies?.layout ?? '')
      const family = (contentMap?.recordPages ?? []).find((r) => `record-page:${r?.id}` === layout)
      let menuId = null
      let href
      if (family) {
        const listing = Number(String(family.listing ?? '').replace(/^menuItem-/, '')) || null
        href = `index.php?option=com_content&view=article&id=${articleId}&catid=${fields.catid}${listing ? `&Itemid=${listing}` : ''}`
      } else {
        menuId = await copyMenuEntry({ apply, siteKey, applyId, call, page, articleId, alias, mapPages })
        href = `index.php?Itemid=${menuId}`
      }
      pages.push({ id: page.id, articleId, menuId, href })
    } catch (error) {
      note(`added page ${page.id} (${page.item}) could not be made: ${said(error)}`)
    }
  }
  return { pages, links: Object.fromEntries(pages.map((p) => [p.id, p.href])) }
}

/**
 * The menu entry of an added copy of a template page: the template page's entry copied (its menu, layout style and
 * settings) and opening the copied article; every block the template page shows only on chosen pages is shown on it too.
 * @returns {Promise<number>} the entry's id
 */
async function copyMenuEntry({ apply, siteKey, applyId, call, page, articleId, alias, mapPages }) {
  const sourcePage = String(page.copies?.layout ?? '').replace(/^page:/, '')
  const template = mapPages.find((/** @type {any} */ p) => p?.entity === sourcePage)
  if (!template || !pageBodyOf(template.link))
    throw new Error(`${sourcePage} is no page that opens an article`)
  const sourceId = idOf(sourcePage)
  const entry = (await call('content.get', { kind: 'menuItem', id: sourceId }))?.item ?? {}
  const marker = markerOf(page.id)
  const find = async () => (await readMenu(apply, siteKey)).find((/** @type {any} */ r) => r?.note === marker)
  const fields = {
    menutype: entry.menutype,
    title: page.item,
    alias,
    note: marker,
    link: `index.php?option=com_content&view=article&id=${articleId}`,
    type: entry.type ?? 'component',
    parent_id: entry.parent_id ?? 1,
    published: 1,
    access: entry.access ?? 1,
    language: entry.language ?? '*',
    template_style_id: entry.template_style_id ?? 0,
    params: entry.params ?? '{}'
  }
  const earlier = await find()
  const steps = [{ kind: 'menuItem', id: earlier ? Number(earlier.id) : 0, fields }]
  const written = await writeSteps({ apply, siteKey, applyId, steps })
  if (written.refused.length || written.skipped.length) throw new Error('the menu entry was refused')
  const made = await find()
  const menuId = Number(made?.id)
  if (!(menuId > 0)) throw new Error('the menu entry did not read back')
  // The blocks the template page shows by choice are shown on its copy too: the copied layout is the whole page.
  const assignments = []
  for (const a of template.assignedModules ?? []) {
    if (a?.assignmentMode !== 'include') continue
    const id = idOf(a.entity)
    const read = await call('content.get', { kind: 'moduleAssignment', id })
    const ids = JSON.parse(String(read?.item?.menuids ?? '[]'))
    if (Array.isArray(ids) && ids.map(Number).includes(sourceId) && !ids.map(Number).includes(menuId))
      assignments.push({
        kind: 'moduleAssignment',
        id,
        fields: { menuids: JSON.stringify([...ids, menuId]) }
      })
  }
  if (assignments.length) {
    const shown = await writeSteps({ apply, siteKey, applyId, steps: assignments })
    if (shown.refused.length) throw new Error('a block of the page could not be shown on its copy')
  }
  return menuId
}

/**
 * Give every button and link the plan sends to an added page that page's address, now that it exists.
 * @param {object} input
 * @param {(call: any) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {any} input.plan - the accepted site plan
 * @param {{elements: any[]}} input.inventory
 * @param {any} input.contentMap
 * @param {Record<string, string>} input.links - the address of each added page, by its plan id
 * @param {(note: string) => void} [input.note]
 * @returns {Promise<number>} how many were linked
 */
export async function linkAddedPages({
  apply,
  siteKey,
  plan,
  inventory,
  contentMap,
  links,
  note = () => {}
}) {
  if (!plan || !links || !Object.keys(links).length) return 0
  const elements = new Map((inventory?.elements ?? []).map((e) => [e.id, e]))
  const slotOf = new Map((contentMap?.slots ?? []).map((/** @type {any} */ s) => [s.key, s]))
  const applyId = `added-links-${Date.now().toString(36)}`
  /** @type {Map<string, {kind: string, id: number, fields: Record<string, any>}>} */
  const rows = new Map()
  let linked = 0
  for (const d of plan.decisions ?? []) {
    const href = d?.action?.kind === 'page' ? links[String(d.action.target)] : null
    const element = elements.get(String(d?.element))
    if (!href || d.decision !== 'keep' || !element) continue
    const slot = slotOf.get(element.kind === 'link' ? element.key : element.urlKey)
    const [kind, id] = [String(slot?.entity ?? '').split('-')[0], idOf(String(slot?.entity ?? ''))]
    if (!slot || !['module', 'article', 'menuItem'].includes(kind) || !(id > 0)) {
      note(`${d.element} could not be linked to ${d.action.target}: no link field`)
      continue
    }
    try {
      const at = `${kind}-${id}`
      if (!rows.has(at)) {
        const got = await apply({ siteKey, action: 'content.get', params: { kind, id } })
        if (got?.ok === false || !got?.item) throw new Error('its record could not be read')
        rows.set(at, { kind, id, fields: { [slot.column]: got.item[slot.column] } })
      }
      const row = /** @type {any} */ (rows.get(at))
      if (!(slot.column in row.fields)) {
        const got = await apply({ siteKey, action: 'content.get', params: { kind, id } })
        row.fields[slot.column] = got?.item?.[slot.column]
      }
      if (!setSlotValue(row.fields, slot, href)) throw new Error(`${slot.key} has no place in its record`)
      linked += 1
    } catch (error) {
      note(`${d.element} could not be linked to ${d.action.target}: ${said(error)}`)
    }
  }
  if (rows.size) {
    const written = await writeSteps({ apply, siteKey, applyId, steps: [...rows.values()] })
    if (written.refused.length)
      note(`${written.refused.length} link(s) to added pages were refused by the site`)
  }
  return linked
}
