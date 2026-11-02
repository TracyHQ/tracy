// `site` of the template kit: what the template holds once for the whole site, joined from the browser reads, the
// stylesheets, the content map and the CMS adapter. Pure. Every field without data is named in `errors` with its
// path and the reason; nothing is guessed.
import { normText } from '../../../content-coverage/lib/normalize.mjs'
import { blockIdOf, neutralKey } from '../ids.mjs'
import { pathOfRoute } from '../kit-paths.mjs'
import { buildBrandColours } from './brand-colours.mjs'
import { siteCmsTexts, withNameSource } from './cms-strings.mjs'
import { h1Source } from './helpers.mjs'
import { buildLogoSpots } from './logo-spots.mjs'
import { menuNavigationGroups } from './menu-groups.mjs'
import { buildContactBlocks, buildForms, buildNavigationGroups } from './site-parts.mjs'
import { buildSystemPages } from './system-pages.mjs'

const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Every place the site name is printed: settings, map slots, and what the pages print outside those slots. */
export function buildNameSlots({ settings, map, reads, idOf }) {
  const slots = (map.slots ?? [])
    .filter((s) => s.role === 'business.name')
    .map((s) => ({ kind: 'slot', id: neutralKey(s.key), block: neutralKey(s.entity), sample: s.sample }))
  const slotBlocks = new Set(slots.map((s) => s.block))
  const printed = new Map()
  for (const r of reads)
    for (const n of r.names ?? []) {
      const block = n.block ? idOf(n.block, r) : null
      if (block && slotBlocks.has(block) && n.where === 'text') continue
      const key = `${n.where}|${block ?? ''}|${n.region ?? ''}`
      const rec = printed.get(key) ?? {
        kind: 'printed',
        where: n.where,
        block,
        region: n.region ?? null,
        pages: new Set(),
        sample: n.sample
      }
      rec.pages.add(r.pageId)
      printed.set(key, rec)
    }
  const prints = [...printed.values()]
    .map((p) => ({ ...p, pages: p.pages.size }))
    .sort((a, b) => b.pages - a.pages)
  return [...settings, ...slots, ...prints]
}

/**
 * @param {{map: object, adapter: object, reads: object[], logoReads: object[], notFound: object|null, styles: object[], htmls: object[], cms?: object|null}} o
 *   `cms`: the adapter's language files (`adapter.cmsStrings()`), for the sentences the CMS prints
 * @returns {{site: object, mainHeadings: object[], errors: object[]}}
 */
export function buildSite({ map, adapter, reads, logoReads, notFound, styles, htmls, cms = null }) {
  const errors = [...adapter.errors]
  const idOf = (raw, read) => blockIdOf(raw, read.slug)
  const opening = reads.find((r) => r.opensOn)?.opensOn ?? null
  const seenPictures = new Map()
  for (const r of reads)
    for (const p of r.pictures ?? [])
      seenPictures.set(`${p.file}|${p.colour}`, { ...p, block: p.block ? idOf(p.block, r) : null })
  const inlineIcons = new Map()
  for (const r of reads)
    for (const i of r.inlineIcons ?? []) {
      const block = i.block ? idOf(i.block, r) : null
      inlineIcons.set(`${block}|${i.paints.join(',')}`, { block, paints: i.paints })
    }
  const colours = buildBrandColours({
    styles,
    pages: htmls,
    seen: reads.length
      ? { opensOn: opening, inlineIcons: [...inlineIcons.values()], pictures: [...seenPictures.values()] }
      : {}
  })
  errors.push(...colours.errors)
  const logos = buildLogoSpots({
    reads: logoReads,
    map,
    settings: adapter.logoSettings(),
    isFreeHtml: adapter.isFreeHtml
  })
  errors.push(...logos.errors)
  const mapPageOf = new Map((map.pages ?? []).map((p) => [pathOfRoute(p.route), p]))
  const listingTitles = new Map()
  for (const r of reads) {
    const mp = mapPageOf.get(r.path)
    const title = adapter.menuOf(mp?.entity)?.title
    if (mp && title && adapter.isListing(mp)) listingTitles.set(norm(title), r.pageId)
  }
  const nav = buildNavigationGroups(reads, {
    listingTitles,
    menuLabels: new Set(adapter.mainMenuTitles().map(norm)),
    idOf
  })
  errors.push(...nav.errors)
  const menus = menuNavigationGroups(map, nav.navigationGroups)
  errors.push(...menus.errors)
  const addressSamples = (map.slots ?? []).filter((s) => s.role === 'contact.address').map((s) => s.sample)
  const system = buildSystemPages({
    pages: reads.map((r) => ({
      pageId: r.pageId,
      path: r.path,
      title: r.head?.title,
      bodyClass: r.bodyClass,
      blockCount: r.blockCount
    })),
    notFound
  })
  errors.push(...system.errors)
  const head = adapter.head(titleSummary(reads, adapter.siteName))
  const free = (map.entities ?? []).filter((e) => adapter.isFreeHtml(e))
  const onPages = free
    .map((e) => ({ e, pages: reads.filter((r) => r.blocks?.includes(e.key)).length }))
    .sort((a, b) => b.pages - a.pages)[0]
  head.injection.position = onPages
    ? {
        name: onPages.e.identity?.position ?? null,
        block: neutralKey(onPages.e.key),
        onPages: onPages.pages,
        of: reads.length
      }
    : null
  if (!onPages || onPages.pages < reads.length)
    errors.push({
      kind: 'missing',
      field: 'site.head.injection.position',
      reason: 'no free HTML block prints on every page read'
    })
  const slotOf = textSlotIndex(map)
  const mainHeadings = reads.map((r) => ({
    pageId: r.pageId,
    path: r.path,
    ...h1Source({
      h1s: r.h1s,
      titleShownAs: r.titleShownAs
        ? { ...r.titleShownAs, block: r.titleShownAs.block ? idOf(r.titleShownAs.block, r) : null }
        : null,
      menu: adapter.menuOf(mapPageOf.get(r.path)?.entity),
      slotOf
    })
  }))
  for (const h of mainHeadings)
    if (!h.via) errors.push({ kind: 'missing', field: `pages[${h.pageId}].h1`, reason: h.reason })
  const nameSettings = adapter.nameSettings()
  const cmsTexts = siteCmsTexts({
    reads,
    idOf,
    cms,
    slotTexts: (map.slots ?? []).filter((s) => s.type === 'text').map((s) => s.sample),
    nameSetting: nameSettings.find((s) => s.scope === 'cms')?.setting ?? null
  })
  errors.push(...cmsTexts.errors)
  const site = {
    logoSpots: logos.logoSpots,
    favicon: adapter.favicon(reads[0]?.head?.icons),
    nameSlots: buildNameSlots({ settings: nameSettings, map, reads, idOf }).map((e) =>
      withNameSource(e, cmsTexts.nameLines)
    ),
    brandColours: colours.brandColours,
    head,
    navigationGroups: menus.navigationGroups,
    contactBlocks: buildContactBlocks(reads, { addressSamples, idOf }),
    // What each CMS contact accepts, said on its block by the kit (kit-site.mjs).
    contactChannels: Object.fromEntries(
      (map.entities ?? [])
        .filter((e) => e.kind === 'contact')
        .map((e) => [e.key, adapter.contactChannels?.(e.key) ?? null])
        .filter(([, c]) => c)
    ),
    forms: buildForms(reads, { idOf }),
    systemPages: system.systemPages,
    fixedTexts: cmsTexts.fixedTexts,
    // The maps blocks draw from their own content; the kit turns the ones a button opens into setting slots
    // (setting-slots.mjs) and drops this list.
    mapSettings: adapter.mapSettings?.() ?? []
  }
  if (!site.favicon.currentFile)
    errors.push({ kind: 'missing', field: 'site.favicon.currentFile', reason: 'no page links an icon' })
  return { site, mainHeadings, errors }
}

/** How page titles carry the site name now: how many of the pages read, and three examples. */
function titleSummary(reads, siteName) {
  const titles = reads.map((r) => r.head?.title ?? '')
  const n = norm(siteName)
  return {
    withName: n ? titles.filter((t) => norm(t).includes(n)).length : null,
    of: titles.length,
    examples: titles.slice(0, 3)
  }
}

/** Text slots by their normalized sample, for telling a main title that is content from one the template prints. */
function textSlotIndex(map) {
  const by = new Map()
  for (const s of map.slots ?? []) {
    if (s.type !== 'text') continue
    const k = normText(s.sample)
    if (k && !by.has(k)) by.set(k, { id: neutralKey(s.key) })
  }
  return (text) => by.get(normText(text)) ?? null
}
