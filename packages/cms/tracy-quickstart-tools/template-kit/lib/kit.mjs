// template-kit.json: the whole kit in one file, in CMS-neutral words, for the agent that plans a site build.
// Every field the kit cannot know is named in `errors` with its path and the reason; nothing is invented.
import { imagesDigest } from '../../../../../apps/tracy-web/src/lib/template-kit/reader.js'
import { imageIdOf, neutralKey, pageIdOf } from './ids.mjs'
import { buildBlock } from './kit-blocks.mjs'
import { itemListsOf, itemParents, joinMeasuredTwins, listingListKeys } from './kit-item-lists.mjs'
import { canonicalPath, pathOfRoute } from './kit-paths.mjs'
import { applyLayouts } from './layouts.mjs'
import { listingMax } from './listing-rows.mjs'
import { indexMap, ownerOfPath } from './map-index.mjs'
import { noMinReason } from './min-evidence.mjs'
import { orphanTextChecks, paragraphChecks, settleForeignTexts } from './orphan-text.mjs'
import { representativeChecks } from './pack.mjs'
import { detailPageChecks, groupPages, LISTING, mixedGroupChecks } from './page-groups.mjs'
import { sampleIndex } from './sample-index.mjs'
import { judgeShowcase, showcaseChecks } from './showcase-pages.mjs'
import { assignSlotOwners, slotOwnerChecks } from './slot-owners.mjs'
import { formatTextSlots } from './text-format.mjs'
import { harmonizeLimits, limitChecks } from './text-limits.mjs'

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

export { groupPages } from './page-groups.mjs'

/**
 * @param {{map: object, capture: object, stamp: object, coverage?: object, minEvidence?: object, cardFields?: object, frameKit?: {evidence: object, classes: object, review: object}, wordsLinks?: object, textFit?: Record<string, {limit: number}>, showcaseView?: (kind: string) => string|null, siteUrl: string, aliasHosts?: string[]}} o
 *   `textFit`: slot id -> the character limit its frame holds (text-fit.json); `showcaseView`: the platform
 *   adapter's rule for page views that only show a CMS feature off
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
  textFit = {},
  showcaseView = () => null,
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
  const allPages = capture.pages.map((p) => {
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
  // Template showcase pages (showcase-pages.mjs) leave the kit; the blocks only they show leave with them. Their
  // content items keep their owner above, so they are not reported as content no link reaches.
  const desk = widths[0]
  const slugOf = new Map(capture.pages.map((p) => [p.path, p.slug]))
  const showcase = judgeShowcase({
    pages: allPages.map((p) => ({ ...p, owner: owners.get(`body-${slugOf.get(p.path)}`)?.owner ?? null })),
    map,
    linksOf: (path) => capture.blocks[`body-${slugOf.get(path)}`]?.widths?.[desk]?.details?.links ?? null,
    viewOf: showcaseView
  })
  const pages = allPages.filter((p) => !showcase.has(p.path))
  const keptSlugs = new Set(capture.pages.filter((p) => !showcase.has(p.path)).map((p) => p.slug))
  // A block leaves only when every page it was seen on left (a block seen on no page stays, as before).
  const recs = Object.values(capture.blocks).filter((rec) => {
    const seen = Object.values(rec.widths ?? {}).flatMap((at) => at?.pages ?? [])
    return !seen.length || seen.some((s) => keptSlugs.has(s))
  })
  const showcaseExcluded = [...Map.groupBy(showcase, ([, why]) => why)].map(([reason, rows]) => ({
    reason: `template showcase page: ${reason}`,
    count: rows.length,
    paths: rows.map(([path]) => path)
  }))
  const itemParent = new Map(
    itemParents(map).map((x) => [canonicalPath(x.path, siteUrl, aliasHosts), pathOfRoute(x.categoryRoute)])
  )
  // The pages each kept page's repeated rows link to (a list of people linking to each person's page). A block
  // shown on most pages (a header or footer menu) navigates; it lists nothing.
  const pathOfSlug = new Map(capture.pages.map((p) => [p.slug, p.path]))
  const keptPaths = new Set(pages.map((p) => p.path))
  const listedBy = new Map()
  for (const rec of recs) {
    const at = rec.widths?.[desk]
    if ((at?.pages ?? []).filter((s) => keptSlugs.has(s)).length > keptSlugs.size / 2) continue
    for (const href of (at?.details?.repeats ?? []).flatMap((r) => r.rowLinks ?? [])) {
      const target = canonicalPath(href, siteUrl, aliasHosts)
      if (!target || !keptPaths.has(target)) continue
      if (!listedBy.has(target)) listedBy.set(target, new Set())
      for (const slug of at.pages ?? [])
        if (keptSlugs.has(slug)) listedBy.get(target).add(pathOfSlug.get(slug))
    }
  }
  const pageGroups = groupPages(pages, itemParent, { listedBy })
  const samples = sampleIndex(map)
  const blocks = recs.map((rec) => {
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
        joinMeasuredTwins(block.lists, r.lists)
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
        const most = listingMax({
          path: pathOfBody.get(rec.id),
          repeats: rec.widths[widths[0]]?.details?.repeats,
          pageSizeControl: rec.widths[widths[0]]?.details?.pageSizeControl ?? null,
          pagePaths,
          isItemPage: (p) => String(kindByPath.get(p) ?? '').startsWith('article'),
          siteUrl,
          aliasHosts
        })
        // A category page that lists nothing (no item of its own in the map, no item row on the page, no list the
        // map declares, no measured rows: "there are no articles in this category") gives a planner no list to fill.
        if (!list && !most && emptyCategory(map, body.owner)) return block
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
    recs.map((r) => [r.id, r.widths?.[widths[0]]?.details?.skeleton]).filter(([, sk]) => sk)
  )
  // Other entities' words no block declares: a link label, a coincidence (fixed text), or the block's slot.
  settleForeignTexts(blocks)
  // Every declared text slot says how many paragraphs and bullets it shows, its sample every part's first words.
  const mapSlotOf = new Map((map.slots ?? []).map((sl) => [neutralKey(sl.key), sl]))
  const detailsById = new Map(recs.map((r) => [r.id, r.widths?.[desk]?.details ?? null]))
  formatTextSlots({ blocks, slotOf: (id) => mapSlotOf.get(id), detailsOf: (id) => detailsById.get(id) })
  // One limit per slot kind of a list, measured from the frame (text-limits.mjs).
  for (const b of blocks) for (const l of b.lists ?? []) harmonizeLimits(l, textFit)
  // One block per slot: the block that renders it, read from the shown words of the read pass (slot-owners.mjs).
  const wordsOf = new Map(
    recs.map((r) => [
      r.id,
      (r.widths?.[desk]?.details?.texts ?? [])
        .map((t) => String(t).replace(/\s+/g, ' ').trim().toLowerCase())
        .join(' | ')
    ])
  )
  const slotByKitId = new Map((map.slots ?? []).map((sl) => [neutralKey(sl.key), sl]))
  assignSlotOwners({
    blocks,
    slotOf: (id) => slotByKitId.get(id) ?? null,
    textsOf: (id) => wordsOf.get(id) ?? ''
  })
  const { checks: layoutChecks } = applyLayouts({ pages, pageGroups, blocks, errors }, { skeletons })
  const excludedPages = [...(capture.excluded ?? []), ...showcaseExcluded]
  const checks = {
    ...itemsListChecks({ pages, blocks, errors }),
    listLimitsDiffering: limitChecks({ blocks, errors }),
    showcasePagesNotExcluded: showcaseChecks({ judged: showcase, pages, excludedPages, errors }),
    mixedPageGroups: mixedGroupChecks({ pages, pageGroups, itemParent, listedBy, errors }),
    detailPagesOutsideListing: detailPageChecks({ pages, pageGroups, itemParent, listedBy, errors }),
    representativesNotListing: representativeChecks({ pages, pageGroups, errors }),
    slotsInTwoBlocks: slotOwnerChecks({ blocks, errors }),
    orphanTexts: orphanTextChecks({ blocks, errors }),
    paragraphsMissing: paragraphChecks({ blocks, errors })
  }
  for (const b of blocks) {
    // The slots the block shows, for the coverage gate (coverage-gate.mjs); kept out of the written kit.
    const shownSlots = new Set(b.textsShown.map((t) => t.slot).filter(Boolean))
    Object.defineProperty(b, 'shownSlots', { value: shownSlots, enumerable: false })
    delete b.textsShown
    delete b.paragraphsShown
  }
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
    // Pages left out of the kit: test-data pages counted by reason and never named (exclude.mjs), and template
    // showcase pages with their paths (showcase-pages.mjs).
    excludedPages,
    errors,
    approval: null
  }
}

/** A category the map knows that holds no content item of its own. */
const emptyCategory = (map, owner) =>
  String(owner ?? '').startsWith('category-') &&
  (map.entities ?? []).some((e) => e.key === owner) &&
  !(map.entities ?? []).some((e) => e.identityReferences?.catid === owner)

/**
 * Items lists and their card fields: a further result page's list takes page 1's card fields (`rowSlotsFrom`);
 * every items list still without card fields is an error, and their count is a check that must be 0.
 */
export function itemsListChecks({ pages, blocks, errors }) {
  const bodyOf = (pageId) => blocks.find((b) => b.id === `body-${String(pageId).replace(/^page-/, '')}`)
  const itemsOf = (b) => b?.lists.find((l) => l.rowKind === 'items')
  for (const p of pages) {
    if (!p.paginationOf) continue
    const first = itemsOf(bodyOf(p.paginationOf))
    if (!first?.rowSlots?.length) continue
    // Every items list of the further page (its own, and one measured under page 1's list id) takes page 1's.
    for (const list of bodyOf(p.id)?.lists ?? [])
      if (list.rowKind === 'items' && !list.rowSlots?.length) {
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
