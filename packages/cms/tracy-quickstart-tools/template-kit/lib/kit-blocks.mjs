// The `blocks[]` of template-kit.json: per block what a planner may change (lists, picture frames, links)
// and what it may not (template words, the demo business's own facts), joined from the capture and the map.
import { isFactRole } from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { imageIdOf, neutralKey } from './ids.mjs'
import { canonicalPath, pathOfRoute } from './kit-paths.mjs'
import { slotsOfBlock } from './block-slots.mjs'
import { buildFrames } from './kit-frames.mjs'
import { itemListsOf } from './kit-item-lists.mjs'
import { measuredMin } from './min-evidence.mjs'
import { matchRepeat, ruleOneMin } from './rows.mjs'

const short = (s, n = 60) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return t ? t.slice(0, n) : null
}

/** The area a block sits in, from its kind and position, in CMS-neutral words. */
export function roleOf(rec, position) {
  if (rec.id === 'header' || String(position ?? '').startsWith('header')) return 'header'
  if (rec.kind === 'component') return 'page-body'
  if (rec.offCanvas) return 'mobile-menu'
  const p = String(position ?? '')
  if (/^(foot|copyright|bottom)/.test(p)) return 'footer'
  if (/^(hero|masthead|slideshow|banner)/.test(p)) return 'hero'
  if (/sidebar/.test(p)) return 'sidebar'
  return 'section'
}

/** Every normalized slot sample of the map, to tell template words from content. */
export function sampleIndex(map) {
  const exact = new Set()
  const all = []
  for (const s of map.slots ?? []) {
    if (s.type === 'image' || s.type === 'url') continue
    const n = normText(s.sample)
    if (!n) continue
    exact.add(n)
    all.push(n)
  }
  // A piece of a slot (a heading split by inline markup) is the slot's words, not the template's.
  return {
    has: (t) => exact.has(t) || (t.length >= 3 && all.some((l) => l.length > t.length && l.includes(t)))
  }
}

/**
 * @param {{rec: object, entity: string|null, idx: object, samples: object, errors: object[], minEvidence: object, cardFields?: object, frameKit?: {evidence: object, classes: object, review: object}, siteUrl: string, aliasHosts: string[], widths: string[]}} o
 */
export function buildBlock({
  rec,
  entity,
  idx,
  samples,
  errors,
  minEvidence,
  cardFields,
  frameKit,
  siteUrl,
  aliasHosts,
  widths
}) {
  const id = rec.id
  const missing = (field, reason) => errors.push({ kind: 'missing', field: `blocks[${id}].${field}`, reason })
  // A block may hold other blocks' content (a tabs block shows one block per tab): their slots are its own.
  const { entities, slots } = slotsOfBlock({ rec, entity, idx })
  const desk = rec.widths[widths[0]]?.details ?? rec.widths[widths[1]]?.details ?? null
  const position = rec.position ?? (entity ? idx.positionOf.get(entity) : null)
  const used = new Set()
  const owns = (listId) => [id, ...entities.map(neutralKey)].some((x) => listId.startsWith(`${x}.`))
  const lists = Object.entries(idx.map.fitGroups ?? {})
    .filter(([k]) => entities.some((e) => k.startsWith(`${e}.`)))
    .map(([k, g]) => {
      const listId = neutralKey(k)
      const max = g.max ?? g.items ?? null
      const row0 = slots.filter((s) => String(s.group?.id ?? '') === `${k}.0`)
      // What the map says of the list beyond its size (a listing's source category, the items it shows...)
      // is carried as it is, so a richer content map needs no change here.
      const { min: _min, max: _max, items: _items, minFrom: _from, rowKind = 'slots', ...extra } = g
      const list = {
        id: listId,
        rowKind,
        min: null,
        max,
        rowSlots: row0.map((s) => ({
          id: neutralKey(s.key),
          role: s.role ?? null,
          type: s.type,
          ...(s.maxCharacters != null ? { maxCharacters: s.maxCharacters } : {})
        })),
        ...extra
      }
      const measured = minEvidence?.[listId]
      const repeat = matchRepeat(desk?.repeats, max, used)
      const rule = repeat?.shownCount === 0 ? null : ruleOneMin(repeat, max)
      if (g.min != null) Object.assign(list, { min: g.min, minSource: g.minFrom ?? 'content map' })
      else if (measured?.okCounts?.length) Object.assign(list, measuredMin(measured))
      else if (rule) Object.assign(list, rule)
      else
        missing(
          `lists[${listId}].min`,
          repeat?.shownCount === 0
            ? 'the rows are on the page but hidden until a part of it is opened (a closed tab): not measured'
            : 'no row set with this many rows was found on the page at desktop width'
        )
      if (max == null) missing(`lists[${listId}].max`, 'the content map gives no row count')
      return list
    })
  // Lists of content items a block pulls from a category (the map's itemLists).
  const items = itemListsOf({ map: idx.map, blockId: id, entities, minEvidence, cardFields, errors })
  lists.push(...items.lists)
  for (const [listId, m] of Object.entries(minEvidence ?? {})) {
    if (!owns(listId) || lists.some((l) => l.id === listId)) continue
    lists.push({
      id: listId,
      rowKind: m.rowKind ?? 'slots',
      min: null,
      max: m.max,
      rowSlots: [],
      ...measuredMin(m)
    })
    if (m.rowKind !== 'items')
      missing(
        `lists[${listId}].rowSlots`,
        'the rows are on the page but the content map declares no list for them'
      )
  }
  const { frames, demoIcons } = buildFrames({
    blockId: id,
    slots,
    evidence: frameKit?.evidence ?? {},
    classes: frameKit?.classes ?? {},
    review: frameKit?.review ?? {},
    logoIds: frameKit?.logoIds,
    widths,
    errors
  })
  const urlSlots = slots.filter((s) => s.type === 'url')
  const labelSlot = new Map(slots.filter((s) => s.type === 'text').map((s) => [normText(s.sample), s]))
  const links = (desk?.links ?? []).map((l, i) => {
    const target =
      canonicalPath(l.href, siteUrl, aliasHosts) ??
      (/^(https?:|mailto:|tel:)/i.test(l.href ?? '') && !aliasHosts.some((h) => l.href.includes(h))
        ? l.href
        : null)
    const label = labelSlot.get(normText(l.label))
    const pair = label?.group ? urlSlots.find((u) => u.group?.id === label.group.id) : null
    return { id: pair ? neutralKey(pair.key) : `${id}.link-${i + 1}`, label: l.label || null, target }
  })
  // A menu the pages never show (an off-canvas menu) has its links in the content map's menu block.
  const menu = !desk && entity ? idx.map.menuBlocks?.[entity] : null
  if (menu)
    for (const [i, it] of (menu.items ?? []).entries()) {
      // A heading or separator of the menu is a label, not a link.
      if (/^(heading|separator)$/.test(it.target?.kind ?? '')) continue
      links.push({
        id: `${id}.link-${i + 1}`,
        label: it.label?.text ?? null,
        target: it.target?.path ?? (it.target?.page ? pathOfPage(idx.map, it.target.page) : null),
        menuItem: it.item,
        from: 'menu'
      })
    }
  else if (!desk) missing('links', 'the block was never shown, so its links could not be read')
  // Words the block shows that no slot holds; the site part names the CMS language string behind a sentence.
  const fixedText = [
    ...new Set(
      (desk?.texts ?? []).filter((t) => {
        const n = normText(t)
        return n && /\p{L}/u.test(n) && !samples.has(n)
      })
    )
  ].map((text) => ({ text, source: null }))
  const demoOwned = slots
    .filter((s) => isFactRole(s.role) || (id === 'header' && String(s.role ?? '').startsWith('business.')))
    .map((s) => ({ id: neutralKey(s.key), role: s.role, sample: short(s.sample) }))
  for (const d of items.demoOwned) if (!demoOwned.some((x) => x.id === d.id)) demoOwned.push(d)
  // Icons drawing the demo business's trade must be replaced or hidden like its facts.
  for (const icon of demoIcons) {
    const had = demoOwned.find((d) => d.id === icon.id)
    if (!had) demoOwned.push(icon)
    else if (icon.class) Object.assign(had, { kind: icon.kind, class: icon.class }) // why it is the demo's
  }
  const images = {}
  for (const w of widths) if (rec.widths[w]?.image) images[w] = imageIdOf(rec.widths[w].image)
  const visibleAt = widths.filter((w) => rec.widths[w]?.pages?.length)
  // A block on the page but hidden at a width (the off-canvas menu, a phone-only or desktop-only block) has no
  // picture there by design; it is said here, never left as a silent gap.
  const notShownAt = widths.filter((w) => !visibleAt.includes(w))
  const pagesShown = new Set(widths.flatMap((w) => rec.widths[w]?.pages ?? []))
  return {
    id,
    role: roleOf(rec, position),
    shared: pagesShown.size > 1,
    visibleAt,
    notShownAt,
    ...(notShownAt.length
      ? {
          notShownBecause: rec.offCanvas
            ? 'off-canvas menu: opens only on demand'
            : 'hidden at this width by the template'
        }
      : {}),
    images,
    lists,
    frames,
    links,
    fixedText,
    demoOwned,
    source: {
      ref: rec.source,
      entity,
      contains: entities.slice(1),
      position: position ?? null,
      pages: pagesShown.size
    }
  }
}

/** The path of the map page an entity opens, or null. */
function pathOfPage(map, entity) {
  const route = (map.pages ?? []).find((p) => p.entity === entity)?.route
  // The front page's route is `home`, served at the site root (as the site part reads it).
  return route == null ? null : route === 'home' ? '/' : pathOfRoute(route)
}
