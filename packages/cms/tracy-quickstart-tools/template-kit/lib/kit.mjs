// template-kit.json: the whole kit in one file, in CMS-neutral words, for the agent that plans a site build.
// Every field the kit cannot know is named in `errors` with its path and the reason; nothing is invented.
import { imagesDigest } from '../../../../../apps/tracy-web/src/lib/template-kit/reader.js'
import { imageIdOf, neutralKey, pageIdOf } from './ids.mjs'
import { buildBlock } from './kit-blocks.mjs'
import { sampleIndex } from './sample-index.mjs'
import { itemListsOf, itemParents, listingListKeys } from './kit-item-lists.mjs'
import { canonicalPath, pathOfRoute } from './kit-paths.mjs'
import { applyLayouts } from './layouts.mjs'
import { listingMax } from './listing-rows.mjs'
import { indexMap, ownerOfPath } from './map-index.mjs'
import { noMinReason } from './min-evidence.mjs'

const LISTING = /^(category listing|featured articles|tag listing|author listing)/

/** Whether each page path is in the main menu: from the coverage file's site map, else from the map's menus. */
function mainMenuPaths(map, coverage) {
  const rows = coverage?.sitePages
  if (Array.isArray(rows))
    return {
      paths: new Set(rows.filter((r) => r.inMainMenu).map((r) => pathOfRoute(r.route))),
      from: 'content-coverage sitePages'
    }
  const menuOf = new Map(
    map.entities.filter((e) => e.kind === 'menuItem').map((e) => [e.key, e.identity?.menutype])
  )
  const home = (map.pages ?? []).find((p) => p.route === 'home')
  const main = home?.menu ?? menuOf.get(home?.entity)
  if (!main) return { paths: null, from: null }
  const paths = new Set(
    (map.pages ?? [])
      .filter((p) => (p.menu ?? menuOf.get(p.entity)) === main)
      .map((p) => pathOfRoute(p.route))
  )
  return { paths, from: 'content map menus' }
}

/**
 * Page groups: a listing page with the pages under it (its posts, further result pages, author and tag pages it leads
 * to). `itemParent` (item page path -> category page path) puts a content item's page under its category's page.
 */
export function groupPages(pages, itemParent = new Map()) {
  const byPath = new Map(pages.map((p) => [p.path, p]))
  const roots = pages
    .filter((p) => LISTING.test(p.kind) && !p.path.includes('?'))
    .sort((a, b) => b.path.length - a.path.length)
  const groupOf = new Map()
  const rootOf = (p) => {
    // A content item's detail page belongs to its category's page (the map's itemPages).
    const parent = byPath.get(itemParent.get(p.path))
    if (parent && parent !== p) return parent
    if (p.path.includes('?')) return byPath.get(p.path.split('?')[0]) ?? null
    const prefix = roots.find((r) => r !== p && r.path !== '/' && p.path.startsWith(`${r.path}/`))
    if (prefix) return prefix
    const from = byPath.get(p.from?.find((f) => byPath.has(f)))
    if (!from || from === p) return null
    const base = from.path.includes('?') ? (byPath.get(from.path.split('?')[0]) ?? from) : from
    // A post joins the listing that leads to it; a tag or author page joins whatever page leads to it.
    if (p.kind.startsWith('article') && LISTING.test(from.kind)) return base
    if (/^(tag listing|author listing)/.test(p.kind)) return base
    return null
  }
  for (const p of pages) groupOf.set(p.path, rootOf(p) ?? p)
  const groups = new Map()
  for (const p of pages) {
    let root = groupOf.get(p.path)
    for (let hop = 0; hop < 5 && groupOf.get(root.path) !== root; hop++) root = groupOf.get(root.path)
    const id = `group-${root.id.replace(/^page-/, '')}`
    if (!groups.has(id)) groups.set(id, { id, root: root.id, children: [] })
    if (p !== root) groups.get(id).children.push(p.id)
    p.group = id
  }
  return [...groups.values()]
}

/**
 * @param {{map: object, capture: object, stamp: object, coverage?: object, minEvidence?: object, cardFields?: object, frameKit?: {evidence: object, classes: object, review: object}, siteUrl: string, aliasHosts?: string[]}} o
 */
export function buildKit({
  map,
  capture,
  stamp,
  coverage,
  minEvidence = {},
  cardFields = {},
  frameKit,
  wordsLinks = {},
  siteUrl,
  aliasHosts = []
}) {
  const idx = indexMap(map)
  const widths = capture.widths.map(String)
  const errors = [
    ...(capture.dead ?? []).map((d) => ({
      kind: 'dead-path',
      path: d.path,
      status: d.status,
      linkedFrom: d.from ?? []
    })),
    ...(capture.failures ?? []).map((f) => ({
      kind: 'capture-failed',
      path: f.path,
      width: f.width,
      reason: f.error
    })),
    ...(capture.capReached
      ? [{ kind: 'page-cap-reached', reason: 'the crawl stopped at the page cap: pages may be missing' }]
      : [])
  ]
  const menu = mainMenuPaths(map, coverage)
  if (!menu.paths)
    errors.push({
      kind: 'missing',
      field: 'pages[].inMainMenu',
      reason: 'neither the coverage file nor the content map names the main menu'
    })
  const owners = new Map()
  const kindByPath = new Map()
  const pathOfBody = new Map()
  const pagePaths = capture.pages.map((p) => p.path)
  const pages = capture.pages.map((p) => {
    const { owner, kind } = ownerOfPath(idx, p.path)
    owners.set(`body-${p.slug}`, { owner, kind })
    kindByPath.set(p.path, kind)
    pathOfBody.set(`body-${p.slug}`, p.path)
    const blocks = {}
    const images = {}
    for (const w of widths) {
      if (!p.widths?.[w]) continue
      blocks[w] = p.widths[w].blocks
      // Only a group's representative has a full-page shot; the others show it (`fullShotOf` in the pack).
      if (p.widths[w].full) images[w] = imageIdOf(p.widths[w].full)
    }
    const inMainMenu = menu.paths ? [p.path, ...(p.aliases ?? [])].some((x) => menu.paths.has(x)) : null
    return {
      id: pageIdOf(p.slug),
      group: null,
      path: p.path,
      inMainMenu,
      blocks,
      images,
      kind,
      aliases: p.aliases ?? [],
      from: p.from ?? []
    }
  })
  const itemParent = new Map(
    itemParents(map).map((x) => [canonicalPath(x.path, siteUrl, aliasHosts), pathOfRoute(x.categoryRoute)])
  )
  const pageGroups = groupPages(pages, itemParent)
  const samples = sampleIndex(map)
  const blocks = Object.values(capture.blocks).map((rec) => {
    const body = owners.get(rec.id)
    const entity = body ? body.owner : rec.id === 'header' ? null : rec.source
    const block = buildBlock({
      rec,
      entity,
      idx,
      samples,
      errors,
      minEvidence,
      cardFields,
      frameKit,
      linkIcons: wordsLinks.links?.[rec.id] ?? [],
      iconProbe: wordsLinks.iconProbes?.[rec.id] ?? null,
      siteUrl,
      aliasHosts,
      widths
    })
    if (body) {
      block.source.owner = body.owner ? neutralKey(body.owner) : null
      block.source.ownerKind = body.kind
      // The map's lists of this page (a listing page's: no block of their own): attached to the page's body block.
      // A further result page (`?start=6`) takes page 1's card fields instead (itemsListChecks).
      const bodyPath = String(pathOfBody.get(rec.id) ?? '')
      const keys = bodyPath.includes('?') ? [] : listingListKeys(map, bodyPath, pathOfRoute)
      if (keys.length) {
        const r = itemListsOf({
          map,
          blockId: rec.id,
          entities: [],
          minEvidence,
          cardFields,
          errors,
          only: keys
        })
        block.lists.push(...r.lists)
        for (const d of r.demoOwned) if (!block.demoOwned.some((x) => x.id === d.id)) block.demoOwned.push(d)
      }
      if (LISTING.test(body.kind)) {
        // A listing's items list: the content map's (with its card fields) when it declares one for the page's
        // owner, else the one measured rows made (min-evidence.json), else a new one. A measured minimum joins the
        // map's list.
        const own = block.lists.find((l) => l.id === `${rec.id}.items`)
        const fromMap = block.lists.find((l) => l.rowKind === 'items' && l !== own && l.rowSlots?.length)
        if (fromMap && own) {
          if (fromMap.min == null && own.min != null) {
            const { id: _id, rowKind: _k, rowSlots: _r, max: _m, ...measured } = own
            Object.assign(fromMap, measured)
            // The map's list now has the measured minimum: its "no minimum" error no longer holds.
            const stale = `blocks[${rec.id}].lists[${fromMap.id}].min`
            for (let i = errors.length - 1; i >= 0; i--) if (errors[i].field === stale) errors.splice(i, 1)
          }
          block.lists.splice(block.lists.indexOf(own), 1)
        }
        let list = fromMap ?? own
        if (!list) {
          list = { id: `${rec.id}.items`, rowKind: 'items', min: null, max: null, rowSlots: [] }
          block.lists.unshift(list)
        }
        const field = (f) => `blocks[${rec.id}].lists[${list.id}].${f}`
        if (list.min == null)
          errors.push({
            kind: 'missing',
            field: field('min'),
            reason: noMinReason(minEvidence[list.id], list.max)
          })
        const most = listingMax({
          path: pathOfBody.get(rec.id),
          repeats: rec.widths[widths[0]]?.details?.repeats,
          pagePaths,
          isItemPage: (p) => String(kindByPath.get(p) ?? '').startsWith('article'),
          siteUrl,
          aliasHosts
        })
        // The view's page size from the map beats a count of the rows this demo happens to show (an author with
        // three articles on a page of six).
        if (most && most.maxSource === 'captured-rows' && list.maxFrom === 'view-setting' && list.max != null)
          Object.assign(list, { maxSource: 'view-setting', maxEvidence: most.maxEvidence })
        else if (most) Object.assign(list, most)
        else
          errors.push({
            kind: 'missing',
            field: field('max'),
            reason: 'no later list position and no set of item rows on the page: the page size is not shown'
          })
      }
    }
    return block
  })
  // Pages of one layout: one body shot and one canHide measurement stand for all of them (layouts.mjs).
  const skeletons = new Map(
    Object.values(capture.blocks)
      .map((r) => [r.id, r.widths?.[widths[0]]?.details?.skeleton])
      .filter(([, sk]) => sk)
  )
  const { checks: layoutChecks } = applyLayouts({ pages, pageGroups, blocks, errors }, { skeletons })
  const checks = itemsListChecks({ pages, blocks, errors })
  for (const p of pages) {
    delete p.kind
  }
  const articlesNoLinkLeadsTo = map.entities
    .filter((e) => e.kind === 'article' && ![...owners.values()].some((o) => o.owner === e.key))
    .map((e) => neutralKey(e.key))
  if (articlesNoLinkLeadsTo.length)
    errors.push({
      kind: 'unreached-content',
      items: articlesNoLinkLeadsTo,
      reason: 'no link on any page leads to these content items'
    })
  const images = stamp.images.files.map((f) => ({
    id: imageIdOf(f.file),
    path: `images/${f.file}`,
    sha256: f.sha256,
    bytes: f.bytes
  }))
  return {
    kit: 'tracy-template-kit/2',
    tool: stamp.tool,
    contract: stamp.contract,
    template: stamp.template,
    quickstart: stamp.quickstart,
    widths: capture.widths,
    mainMenuFrom: menu.from,
    pageGroups,
    pages,
    blocks,
    // Pairs of layouts of one kind with close skeletons, kept apart (layouts.mjs): for a person to look at.
    layoutChecks,
    // Counts that must be 0 for a kit a planner can use.
    checks,
    images,
    imagesSha256: imagesDigest(images),
    // Test-data pages left out of the kit, counted by reason and never named (see exclude.mjs).
    excludedPages: capture.excluded ?? [],
    errors,
    approval: null
  }
}

/**
 * Items lists and their card fields: a further result page's list takes page 1's card fields (`rowSlotsFrom`);
 * every items list still without card fields is an error, and their count is a check that must be 0.
 */
export function itemsListChecks({ pages, blocks, errors }) {
  const bodyOf = (pageId) => blocks.find((b) => b.id === `body-${String(pageId).replace(/^page-/, '')}`)
  const itemsOf = (b) => b?.lists.find((l) => l.rowKind === 'items')
  for (const p of pages) {
    if (!p.paginationOf) continue
    const list = itemsOf(bodyOf(p.id))
    const first = itemsOf(bodyOf(p.paginationOf))
    if (list && !list.rowSlots?.length && first?.rowSlots?.length) {
      list.rowSlots = first.rowSlots
      list.rowSlotsFrom = first.id
    }
  }
  let without = 0
  for (const b of blocks)
    for (const l of b.lists)
      if (l.rowKind === 'items' && !l.rowSlots?.length) {
        without++
        errors.push({
          kind: 'missing',
          field: `blocks[${b.id}].lists[${l.id}].rowSlots`,
          reason: 'no card fields: the content map declares none for this items list'
        })
      }
  return { itemsListsWithoutCardFields: without }
}
