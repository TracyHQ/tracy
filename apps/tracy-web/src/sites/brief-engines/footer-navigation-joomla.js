import { mainMenuRole, menuPath } from 'website-opportunities/domain/main-menu.mjs'
import { footerNavigationGroups, isOfferingIndex } from 'website-opportunities/domain/footer-navigation.mjs'
import { readMenu, readModules, writeSteps } from './joomla-tidy.js'
import { writeFooterNavigation } from './footer-navigation.js'

/** How many article rows one listing call reads. */
const ARTICLE_PAGE = 100

const live = (row) => Number(row?.published) === 1
const order = (a, b) =>
  Number(a.lft ?? a.ordering ?? 0) - Number(b.lft ?? b.ordering ?? 0) || Number(a.id) - Number(b.id)
const rowPath = (row) => (Number(row.home) === 1 ? '/' : menuPath(`/${row.path ?? ''}`))
const param = (link, name) => String(link ?? '').match(new RegExp(`[?&]${name}=([^&]+)`))?.[1] ?? null
const slug = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'link'

/** Every published article of the site, a page at a time. */
async function readArticles(apply, siteKey) {
  const rows = []
  for (let offset = 0; offset < 5000; offset += ARTICLE_PAGE) {
    const answer = await apply({
      siteKey,
      action: 'content.list',
      params: { kind: 'article', limit: ARTICLE_PAGE, offset }
    })
    if (answer?.ok === false)
      throw new Error(String(answer.message ?? answer.error ?? 'the articles could not be listed'))
    const items = Array.isArray(answer?.items) ? answer.items : []
    rows.push(...items)
    if (items.length < ARTICLE_PAGE) break
  }
  return rows
}

/** The page entry (component or alias, published) a kept page's route opens; the main menu first. */
function entryOf(rows, path) {
  const want = menuPath(path)
  return (
    rows
      .filter((r) => live(r) && ['component', 'alias'].includes(r.type ?? 'component') && rowPath(r) === want)
      .sort(
        (a, b) =>
          (a.menutype === 'mainmenu' ? 0 : 1) - (b.menutype === 'mainmenu' ? 0 : 1) ||
          Number(a.id) - Number(b.id)
      )[0] ?? null
  )
}

/**
 * The name an offering article's footer link shows: the site plan's name of that offering (`honesty.cardNames` of the
 * article's content-map entity), else the article's title. A title the build did not rename is the demo's (#189 round 9,
 * C6: an offering page listed under the demo class's name).
 * @param {{ id: number | string, title?: string }} article
 * @param {{ contentMap?: any, cardNames?: Record<string, string> }} plan
 * @returns {{ label: string, planned: boolean }}
 */
export function offeringNameOf(article, { contentMap = null, cardNames = {} } = {}) {
  const entity =
    (contentMap?.entities ?? []).find(
      (e) => e?.kind === 'article' && String(e.sourceId) === String(article.id)
    )?.key ?? `article-${article.id}`
  const named = cardNames?.[`${entity}.offering`]
  return typeof named === 'string' && named.trim()
    ? { label: named.trim(), planned: true }
    : { label: String(article.title ?? '').trim(), planned: false }
}

/**
 * Joomla T3 and T4 footer link columns: each declared navigation group is one `mod_menu` module (`container`) showing one
 * menu (`menu`). Its entries become link items (`type: url`) that point at the kept pages by their Itemid, and at each
 * offering article under the offerings index's own entry, so Joomla routes them to the pages' own addresses.
 */
export async function writeJoomlaFooterNavigation({
  apply,
  siteKey,
  sitePlan,
  model,
  locale,
  signal,
  contentMap,
  known,
  note
}) {
  const groups = footerNavigationGroups(contentMap)
  if (!groups.length) return null
  const slots = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  const maxOf = (key, fallback = 40) =>
    slots.get(key)?.fit?.maxCharacters ?? slots.get(key)?.maxCharacters ?? fallback
  const moduleId = (group) => Number(String(group.container ?? '').replace(/^module-/, '')) || null
  const kept = (sitePlan?.pages ?? []).filter((p) => p.decision === 'keep')

  const offeringPagesOf = async (rows) => {
    const pages = []
    let articles = null
    for (const page of kept.filter((p) => isOfferingIndex({ ...p, role: mainMenuRole(p) }))) {
      const entry = page.path ? entryOf(rows, page.path) : null
      const catid = entry && param(entry.link, 'view') === 'category' ? Number(param(entry.link, 'id')) : null
      if (!catid) continue
      articles ??= await readArticles(apply, siteKey)
      for (const a of articles.filter((x) => Number(x.catid) === catid && Number(x.state) === 1))
        pages.push({
          id: `article-${a.id}`,
          path: `${menuPath(page.path)}/${a.alias}`,
          ...offeringNameOf(a, { contentMap, cardNames: sitePlan?.honesty?.cardNames }),
          link: `index.php?option=com_content&view=article&id=${a.id}&catid=${catid}&Itemid=${entry.id}`,
          articleId: Number(a.id)
        })
    }
    return pages
  }

  const state = async () => {
    const rows = await readMenu(apply, siteKey)
    const modules = await readModules(apply, siteKey)
    const offeringPages = await offeringPagesOf(rows)
    const byId = new Map(rows.map((r) => [Number(r.id), r]))
    const pathOf = (row) => {
      if (row.type !== 'url') return rowPath(row)
      const article = Number(param(row.link, 'id'))
      if (param(row.link, 'view') === 'article')
        return offeringPages.find((o) => o.articleId === article)?.path ?? String(row.link)
      const target = byId.get(Number(param(row.link, 'Itemid')))
      return target ? rowPath(target) : String(row.link ?? '')
    }
    const columns = groups.map((g) => {
      const module = modules.find((m) => Number(m.id) === moduleId(g))
      return {
        id: g.id,
        holds: g.holds,
        menu: g.menu,
        moduleId: moduleId(g),
        hidden: !module || !live(module),
        heading: String(module?.title ?? ''),
        demoHeading: String(slots.get(g.heading)?.sample ?? ''),
        headingMax: g.heading ? maxOf(g.heading) : 40,
        linkMax: Math.min(40, ...(g.links ?? []).map((k) => maxOf(k))),
        rows: rows.filter((r) => r.menutype === g.menu).sort(order),
        links: rows
          .filter((r) => r.menutype === g.menu && live(r))
          .sort(order)
          .map((r) => ({ key: String(r.id), path: pathOf(r), label: String(r.title ?? '') }))
      }
    })
    return { rows, columns, offeringPages }
  }

  return writeFooterNavigation({
    sitePlan,
    model,
    locale,
    signal,
    known,
    note,
    read: state,
    write: async ({ columns, off }) => {
      const { rows, columns: native, offeringPages } = await state()
      const applyId = `footer-navigation-${Date.now().toString(36)}`
      const steps = []
      const creates = []
      for (const column of columns) {
        const group = native.find((c) => c.id === column.id)
        column.links.forEach((link, i) => {
          const offering = offeringPages.find((o) => o.path === menuPath(link.path))
          const entry = offering ? null : entryOf(rows, link.path)
          if (!offering && !entry) throw new Error(`FOOTER_MISSING_PAGE: ${link.pageId}`)
          const fields = {
            title: link.label,
            type: 'url',
            link: offering ? offering.link : `index.php?Itemid=${entry.id}`,
            published: 1
          }
          const row = group.rows[i]
          if (row) steps.push({ kind: 'menuItem', id: Number(row.id), fields })
          else
            creates.push({
              ...fields,
              alias: `${slug(group.menu)}-${slug(link.label)}-${i + 1}`,
              menutype: group.menu,
              language: '*',
              parent_id: 1
            })
        })
        for (const row of group.rows.slice(column.links.length))
          if (live(row)) steps.push({ kind: 'menuItem', id: Number(row.id), fields: { published: 0 } })
        if (group.moduleId)
          steps.push({ kind: 'module', id: group.moduleId, fields: { title: column.heading, published: 1 } })
      }
      for (const id of off) {
        const group = native.find((c) => c.id === id)
        if (group?.moduleId) steps.push({ kind: 'module', id: group.moduleId, fields: { published: 0 } })
      }
      const result = await writeSteps({ apply, siteKey, applyId, steps })
      if (result.refused.length || result.skipped.length)
        throw new Error(`FOOTER_WRITE_REFUSED: ${result.refused.map((r) => `${r.kind} ${r.id}`).join(', ')}`)
      for (const fields of creates) {
        const answer = await apply({
          siteKey,
          action: 'content.update',
          params: { kind: 'menuItem', id: 0, fields, apply_id: applyId }
        })
        if (answer?.ok === false || !(Number(answer?.id) > 0))
          throw new Error(`FOOTER_WRITE_REFUSED: new ${fields.menutype} entry ${fields.title}`)
      }
    }
  })
}
