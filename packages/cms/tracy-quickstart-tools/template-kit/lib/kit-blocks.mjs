// The `blocks[]` of template-kit.json: per block what a planner may change (lists, picture frames, links)
// and what it may not (template words, the demo business's own facts), joined from the capture and the map.
import { labelLinks } from './link-labels.mjs'
import { shownParagraphs } from './orphan-text.mjs'
import { isFactRole } from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { imageIdOf, neutralKey } from './ids.mjs'
import { actionAddress, canonicalPath, pathOfRoute, siteAddress } from './kit-paths.mjs'
import { slotsOfBlock } from './block-slots.mjs'
import { buildFrames } from './kit-frames.mjs'
import { itemListsOf } from './kit-item-lists.mjs'
import { measuredMin } from './min-evidence.mjs'
import { matchRepeat, ruleOneMin } from './rows.mjs'
import { addIconSlots } from './icon-slots.mjs'
import { networkOf } from './site/helpers.mjs'
import { sampleOf } from './text-format.mjs'

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const short = (s, n = 60) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return t ? t.slice(0, n) : null
}
// A text slot's sample is the whole demo text (cut only past SAMPLE_CAP, a long article body): the writer aims its
// length at it. Formatted samples (one part per line) are set later by formatTextSlots; an image path stays short.
const sampleOfSlot = (x) => (x.type === 'text' ? sampleOf(x.sample).sample || null : short(x.sample))

/**
 * The block's shown links, one per position (links repeating a label and an address are each kept), each with the
 * icon it draws. The words-and-links reading lists them by position with their icons; without it, the read pass's
 * list, with icons from an older `label|href` file.
 */
export function shownLinks(read = [], linkIcons = {}) {
  if (Array.isArray(linkIcons) && linkIcons.length) return linkIcons
  const byKey = Array.isArray(linkIcons) ? {} : linkIcons
  return read.map((l, position) => ({
    position,
    label: l.label,
    href: l.href,
    icon: byKey[`${l.label}|${l.href}`] ?? null,
    ...(l.current ? { current: true } : {})
  }))
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

/**
 * @param {{rec: object, entity: string|null, idx: object, samples: object, errors: object[], minEvidence: object, cardFields?: object, frameKit?: {evidence: object, classes: object, review: object}, linkIcons?: object[]|Record<string, object>, iconProbe?: object|null, siteUrl: string, aliasHosts: string[], widths: string[]}} o
 *   `linkIcons`: every shown link by position with the icon it draws (measure-words-links.mjs; an older file keys
 *   icons by `label|href`); `iconProbe`: whether
 *   setting a font icon's class changed its glyph
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
  linkIcons = {},
  iconProbe = null,
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
      // The rows are the list's slot groups (`<list>.<n>`), in order: a map that numbers every row as its own group
      // (item 0 of each) still has as many rows as groups, whatever its item count says.
      const groupIds = [
        ...new Set(
          slots
            .map((s) => String(s.group?.id ?? ''))
            .filter((gid) => new RegExp(`^${esc(k)}\\.\\d+$`).test(gid))
        )
      ].sort((a, b) => Number(a.slice(k.length + 1)) - Number(b.slice(k.length + 1)))
      const slotOut = (s) => ({
        id: neutralKey(s.key),
        role: s.role ?? null,
        type: s.type,
        ...(s.maxCharacters != null ? { maxCharacters: s.maxCharacters } : {})
      })
      const rowsOf = groupIds.map((gid, index) => ({
        index,
        slots: slots
          .filter((s) => String(s.group?.id ?? '') === gid)
          .map((s) => ({
            ...slotOut(s),
            ...(s.type === 'image' || s.type === 'url' ? {} : { sample: sampleOfSlot(s) })
          }))
      }))
      const mapMax = g.max ?? g.items ?? null
      const max = mapMax != null && groupIds.length > mapMax ? groupIds.length : mapMax
      const row0 = slots.filter((s) => String(s.group?.id ?? '') === groupIds[0])
      // What the map says of the list beyond its size (a listing's source category, the items it shows...)
      // is carried as it is, so a richer content map needs no change here.
      const { min: _min, max: _max, items: _items, minFrom: _from, rowKind = 'slots', ...extra } = g
      const list = {
        id: listId,
        rowKind,
        min: null,
        max,
        rowSlots: row0.map(slotOut),
        ...extra,
        ...(max !== mapMax ? { maxFrom: 'slot-rows', shown: groupIds.length } : {}),
        ...(rowsOf.length > 1 ? { rows: rowsOf } : {})
      }
      const measured = minEvidence?.[listId]
      const repeat = matchRepeat(desk?.repeats, max, used)
      const rule = repeat?.shownCount === 0 ? null : ruleOneMin(repeat, max)
      if (g.min != null) Object.assign(list, { min: g.min, minSource: g.minFrom ?? 'content map' })
      else if (measured?.okCounts?.length) Object.assign(list, measuredMin(measured))
      else if (rule) Object.assign(list, rule)
      // Rows of uneven shapes (a masonry gallery) form no row set to measure: the demo's own count is the safe
      // minimum, said as not measured.
      else if (list.uniform === false && repeat?.shownCount !== 0 && Number.isFinite(list.shown ?? max))
        Object.assign(list, { min: list.shown ?? max, minSource: 'demo count (not measured)' })
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
  const usedIds = new Set()
  // The address slots of icon-only rows (every text slot of the row is blank: JA Impact's "Follow us" icons print no
  // words), in row order: an icon link no words pair takes the next one.
  const rowOrder = (g) => Number(/\.(\d+)$/.exec(String(g ?? ''))?.[1] ?? Infinity)
  const iconRowUrls = urlSlots
    .filter((u) => {
      const row = slots.filter((s) => s.group?.id && s.group.id === u.group?.id && s.type === 'text')
      return row.length && row.every((s) => !String(s.sample ?? '').trim())
    })
    .sort((a, b) => rowOrder(a.group.id) - rowOrder(b.group.id))
  const links = shownLinks(desk?.links, linkIcons).map((l, i) => {
    const target =
      canonicalPath(l.href, siteUrl, aliasHosts) ??
      // A same-site address that is no page (a picture file) has no target, on whatever host it was read.
      (/^(https?:|mailto:|tel:)/i.test(l.href ?? '') && siteAddress(l.href, siteUrl, aliasHosts) === null
        ? l.href
        : null)
    const icon = l.icon ?? null
    // Paired with a row's address slot by its words, or, for an icon-only link, by the network its icon draws
    // when a row's label slot names that network ("Facebook" for fa-facebook).
    const network = icon ? networkOf({ icon, target: l.href, label: l.label }) : null
    const urlOf = (t) => (t?.group ? urlSlots.find((u) => u.group?.id === t.group.id) : null)
    // No words pair by no words: a blank label would match whichever blank label slot came last.
    const worded = !!normText(l.label)
    const pair =
      (worded ? urlOf(labelSlot.get(normText(l.label))) : null) ??
      (network ? urlOf(labelSlot.get(normText(network))) : null) ??
      (icon && !worded ? iconRowUrls.find((u) => !usedIds.has(neutralKey(u.key))) : null)
    // A repeat of a paired link (same label) keeps its own position id, so every id stays one link.
    const paired = pair ? neutralKey(pair.key) : null
    const linkId = paired && !usedIds.has(paired) ? paired : `${id}.link-${i + 1}`
    usedIds.add(linkId)
    // An address of the site that runs a task (a question form opened in a modal, a print view) is no page: the link
    // opens that action.
    const action = target ? null : actionAddress(l.href, siteUrl, aliasHosts)
    return {
      id: linkId,
      position: l.position ?? i,
      label: l.label || null,
      target,
      ...(action ? { opens: { kind: 'action', action } } : {}),
      ...(icon ? { icon: { ...icon, network } } : {}),
      ...(l.current ? { current: true } : {})
    }
  })
  addIconSlots(lists, links, iconProbe, slots, neutralKey)
  // The slot each text link's label comes from: the block's own menu item, or the one slot printing its words.
  labelLinks({
    links,
    menuBlocks: idx.map.menuBlocks,
    mapSlots: idx.map.slots,
    entities,
    siteUrl,
    aliasHosts
  })
  // A clickable element without an address (a button opening a modal or a tab panel, a form's submit) is listed like a
  // link when a slot prints its label, with what it opens (`opens`), so its label and its target are both declared.
  const buttons = (desk?.clickables ?? []).map((c) => ({
    id: `${id}.button-${c.position + 1}`,
    position: c.position,
    label: c.label,
    target: null,
    element: c.tag,
    opens: opensOf(c.target, siteUrl, aliasHosts)
  }))
  labelLinks({ links: buttons, menuBlocks: {}, mapSlots: idx.map.slots, entities, siteUrl, aliasHosts })
  for (const b of buttons) {
    const own = labelSlot.get(normText(b.label))
    if (!b.labelId && own) b.labelId = neutralKey(own.key)
    // A tab or menu heading read as a link too (its address is a #fragment or a script) takes what it opens there.
    const same = links.find((l) => !l.target && !l.opens && normText(l.label ?? '') === normText(b.label))
    if (same && b.opens) same.opens = b.opens
    else if (b.labelId) links.push(b)
  }
  const labelOfText = new Map(links.filter((l) => l.labelId).map((l) => [normText(l.label), l.labelId]))
  const mapSlot = new Map((idx.map.slots ?? []).map((x) => [neutralKey(x.key), x]))
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
        ...(it.label?.slot ? { labelId: neutralKey(it.label.slot) } : {}),
        from: 'menu'
      })
    }
  else if (!desk) missing('links', 'the block was never shown, so its links could not be read')
  // Words the block shows that no slot holds; the site part names the CMS language string behind a sentence.
  // Shown words that are a content slot's (whole, cut short, or split by markup) are content, never fixed text: a
  // slot of this block is already declared; another entity's (an item's intro on a listing) is the demo's own.
  const ownKeys = new Set(slots.map((s) => s.key))
  const fixedText = []
  const shownContent = []
  // Each shown text and the slot it comes from (orphan-text.mjs checks every one is declared somewhere).
  const textsShown = []
  for (const text of new Set(desk?.texts ?? [])) {
    const n = normText(text)
    if (!n || !/\p{L}/u.test(n)) continue
    // A link's label is the slot the link names, not the first slot sharing its words.
    const label = labelOfText.get(n)
    if (label) {
      textsShown.push({ text, slot: label, source: mapSlot.get(label) ?? null, how: 'whole', label: true })
      continue
    }
    const m = samples.matchOf(n, slots)
    textsShown.push({ text, slot: m ? neutralKey(m.slot.key) : null, source: m?.slot ?? null, how: m?.how })
    if (!m) fixedText.push({ text, source: null })
    // Another entity's words shown whole or as a piece are an item's card or a menu label, read as content
    // already; words only a looser match recognizes (cut short, split, run together) are named as the demo's.
    else if (!ownKeys.has(m.slot.key) && !/^(whole|piece)$/.test(m.how))
      shownContent.push({ slot: m.slot, text, how: m.how })
  }
  // A text printed by several elements is several slots: each further element takes the next slot of the block's
  // own entities with those words, in content map order, never the first one again.
  const counts = desk?.textCounts ?? {}
  for (const t of textsShown.slice()) {
    const k = counts[t.text] ?? 1
    if (k < 2 || !t.source || t.label || !ownKeys.has(t.source.key) || t.how !== 'whole') continue
    const n = normText(t.text)
    const twins = slots.filter((x) => x.type === 'text' && x.key !== t.source.key && normText(x.sample) === n)
    for (const x of twins.slice(0, k - 1))
      textsShown.push({ text: t.text, slot: neutralKey(x.key), source: x, how: 'whole' })
  }
  // Each paragraph the page shows, the slot it comes from, and whether the shown texts read all of its words (a
  // paragraph split by inline markup is read in pieces): orphan-text.mjs paragraphChecks.
  const paragraphsShown = shownParagraphs({
    paragraphs: desk?.paragraphs ?? [],
    texts: desk?.texts ?? [],
    slots,
    matchOf: (n) => samples.matchOf(n, slots),
    keyOf: neutralKey
  })
  const demoOwned = slots
    .filter((s) => isFactRole(s.role) || (id === 'header' && String(s.role ?? '').startsWith('business.')))
    .map((s) => ({ id: neutralKey(s.key), role: s.role, sample: sampleOfSlot(s) }))
  for (const { slot, text, how } of shownContent)
    if (!demoOwned.some((d) => d.id === neutralKey(slot.key)))
      demoOwned.push({
        id: neutralKey(slot.key),
        role: slot.role ?? null,
        sample: sampleOfSlot({ ...slot, type: 'text' }),
        kind: 'text',
        shownAs: short(text),
        matched: how
      })
  for (const d of items.demoOwned) if (!demoOwned.some((x) => x.id === d.id)) demoOwned.push(d)
  // Icons drawing the demo business's trade must be replaced or hidden like its facts.
  for (const icon of demoIcons) {
    const had = demoOwned.find((d) => d.id === icon.id)
    if (!had) demoOwned.push(icon)
    else if (icon.class) Object.assign(had, { kind: icon.kind, class: icon.class }) // why it is the demo's
  }
  // The block's own slots it shows that no list row, frame, link or demo fact holds (a section title, an intro, a
  // lone button label), with the address slot that goes with a shown label: what a planner writes or hides.
  const held = new Set([
    ...lists.flatMap((l) => [
      ...(l.rowSlots ?? []).map((x) => x.id),
      ...(l.rows ?? []).flatMap((r) => r.slots.map((x) => x.id))
    ]),
    ...frames.map((f) => f.id),
    ...links.map((l) => l.id),
    ...demoOwned.map((d) => d.id)
  ])
  // Another entity's words shown here are settled across the kit (orphan-text.mjs settleForeignTexts): a content
  // item's, menu item's or category's words, or a piece of a longer sample, unless the page prints them as its own
  // heading (a page shows its menu item's title).
  const pageItems = new Set(
    (idx.map.pages ?? []).filter((p) => pagesOf(rec, widths).has(pageIdOf(p.route))).map((p) => p.entity)
  )
  for (const t of textsShown) {
    const s = t.source
    if (!s || t.label || ownKeys.has(s.key) || held.has(t.slot) || pageItems.has(entityOfKey(s.key))) continue
    if (PLACED.test(s.key) || t.how === 'piece') t.foreign = slotOut(s)
  }
  // The block's own slots it shows that nothing above holds (a section title, an intro, a lone button label), and
  // the shown words of other entities it prints (a CMS string, a form field label, a module shown inside it).
  const shown = new Map()
  for (const t of textsShown) if (t.slot && !held.has(t.slot) && !t.foreign) shown.set(t.slot, t.source)
  // The address slot that goes with a shown label: the same JSON path, or the same row group.
  const slotPath = (x) => JSON.stringify(x.jsonPath ?? null)
  const shownPaths = new Set([...shown.values()].filter((x) => x.jsonPath).map(slotPath))
  const shownGroups = new Set([...shown.values()].map((x) => x.group?.id).filter(Boolean))
  const urls = slots.filter(
    (x) =>
      x.type === 'url' &&
      !held.has(neutralKey(x.key)) &&
      String(x.sample ?? '').trim() &&
      ((x.jsonPath && shownPaths.has(slotPath(x))) || (x.group && shownGroups.has(x.group.id)))
  )
  const blockSlots = [...shown.values(), ...urls]
    .filter((x, i, all) => all.findIndex((y) => y.key === x.key) === i)
    .map(slotOut)
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
    slots: blockSlots,
    lists,
    frames,
    links,
    fixedText,
    demoOwned,
    textsShown,
    paragraphsShown,
    source: {
      ref: rec.source,
      entity,
      contains: entities.slice(1),
      position: position ?? null,
      pages: pagesShown.size
    }
  }
}

// Entities with a page of their own: their words on another block are a link, a card, or a coincidence.
const PLACED = /^(article|menuItem|category)-/
const entityOfKey = (key) => String(key).replace(/\.[^.]*$/, '')
/** A map page's route as the capture names pages ("about-us/contact" is "about-us_contact"). */
const pageIdOf = (route) => String(route ?? '').replace(/\//g, '_')
const pagesOf = (rec, widths) => new Set(widths.flatMap((w) => rec.widths[w]?.pages ?? []))

/**
 * What a clickable element without an address opens, as the read pass found it: a modal (a map drawn from the
 * page's settings, which no content map slot holds, says so), a tab or collapse panel, a menu heading's submenu, the
 * form it sends, or a script.
 */
function opensOf(t, siteUrl, aliasHosts) {
  if (!t) return null
  if (t.kind === 'form')
    return { kind: 'form', action: siteAddress(t.action, siteUrl, aliasHosts) ?? t.action ?? null }
  if (t.kind === 'script') return { kind: 'script' }
  if (t.kind === 'submenu') return { kind: 'submenu' }
  const out = { kind: t.kind === 'modal' || t.kind === 'slide' ? t.kind : 'panel', element: t.element }
  if (t.shows === 'map')
    Object.assign(out, {
      shows: 'map',
      writable: false,
      writableReason:
        'the button opens a map the page draws from its own settings, which no content map slot holds; a planner cannot point it at the customer address'
    })
  return out
}

/** A slot as a block declares it. */
const slotOut = (x) => ({
  id: neutralKey(x.key),
  role: x.role ?? null,
  type: x.type,
  ...(x.maxCharacters != null ? { maxCharacters: x.maxCharacters } : {}),
  ...(x.type === 'url' ? {} : { sample: sampleOfSlot(x) })
})

/** The path of the map page an entity opens, or null. */
function pathOfPage(map, entity) {
  const route = (map.pages ?? []).find((p) => p.entity === entity)?.route
  // The front page's route is `home`, served at the site root (as the site part reads it).
  return route == null ? null : route === 'home' ? '/' : pathOfRoute(route)
}
