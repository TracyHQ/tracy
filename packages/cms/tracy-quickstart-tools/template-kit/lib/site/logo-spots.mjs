// `site.logoSpots[]`: every place the site prints a logo, measured in a browser in each theme of the template, joined to
// the content map slot that fills it (its frame id) when one does. A logo in free HTML with no slot is listed too,
// with `frameId: null`. Pure: it takes the browser reads, the map's logo slots and the adapter's logo settings.

import { neutralKey } from '../ids.mjs'
import { sideOfGround } from './colour-maths.mjs'

const WHERE = ['header', 'offcanvas', 'footer', 'other']
const fileOf = (sample) =>
  String(sample ?? '')
    .split('#')[0]
    .split('?')[0]
    .replace(/^\/+/, '')

/**
 * The template setting a logo slot writes: a site settings entity names it (`identity.key`, a T4 profile key); a
 * template style slot names it by its one-step path into the style's params (`logoimage` of a T3 style).
 */
function settingOf(slot, entity) {
  if (entity?.identity?.key) return entity.identity.key
  if (entity?.kind === 'templateStyle' && slot.column === 'params' && slot.jsonPath?.length === 1)
    return String(slot.jsonPath[0])
  return null
}

/** The content map's logo slots (role `business.logo`), with their file, entity and the setting they write. */
export function logoSlotsOf(map) {
  const entities = new Map((map.entities ?? []).map((e) => [e.key, e]))
  return (map.slots ?? [])
    .filter((s) => s.role === 'business.logo')
    .map((s) => ({
      key: s.key,
      entity: s.entity,
      file: fileOf(s.sample),
      setting: settingOf(s, entities.get(s.entity))
    }))
}

/** The frame ids of the kit that are logos: every `business.logo` slot, and every spot's frame. */
export function logoFrameIds(map, site) {
  const ids = new Set(logoSlotsOf(map).map((s) => neutralKey(s.key)))
  for (const s of site?.logoSpots ?? []) if (s.frameId) ids.add(s.frameId)
  return ids
}

/**
 * @param {{reads: Array<{pageId: string, theme: string|null, opening: boolean, logos: object[]}>, map: object, settings: Array<{key: string, value: string, prints: Array<{where: string, emptyShows: string|null}>}>, isFreeHtml: (e: object) => boolean}} o
 * @returns {{logoSpots: object[], errors: object[]}}
 */
export function buildLogoSpots({ reads, map, settings, isFreeHtml }) {
  const errors = []
  const entities = new Map((map.entities ?? []).map((e) => [e.key, e]))
  const slots = logoSlotsOf(map)
  const groups = new Map()
  for (const r of reads)
    for (const l of r.logos ?? []) {
      const block = l.block && l.block !== 'header' ? l.block : null
      const key = `${l.region}|${block ?? ''}|${l.themeClass ?? ''}|${l.file ?? ''}`
      // A phone read only sizes a logo the desktop reads found but never showed (`sizeAt`); it adds no place.
      if (r.width) {
        const g = groups.get(key)
        if (g && l.shown && !g.phone) g.phone = { ...l, at: r.width, theme: r.theme }
        continue
      }
      const g = groups.get(key) ?? {
        ...l,
        block,
        pages: new Set(),
        shownIn: new Set(),
        at: null,
        phone: null
      }
      g.pages.add(r.pageId)
      if (l.shown) {
        g.shownIn.add(r.theme ?? 'base')
        if (!g.at || r.opening) g.at = l
      }
      groups.set(key, g)
    }
  const spots = []
  for (const g of groups.values()) {
    const where = WHERE.includes(g.region) ? g.region : 'other'
    const own = g.block ? slots.filter((s) => s.entity === g.block && s.file === g.file) : []
    const siteLevel = slots.filter((s) => !s.entity.startsWith('module-') && s.file === g.file)
    // A block whose own content holds no slot with this file wraps the template's logo element (a T4 footer or
    // off-canvas logo found inside a module's section): the site setting prints it. A block that does hold the file
    // prints it itself, so only its own logo slot can change it.
    const blockPrints =
      g.block && (map.slots ?? []).some((s) => s.entity === g.block && fileOf(s.sample) === g.file)
    const slot = own[0] ?? (blockPrints ? null : pickByTheme(siteLevel, g.themeClass))
    // No slot: a template logo setting whose layout prints here, holding this file or empty (the page shows the
    // layout's stand-in, a drawn mark or the name), is what writes this logo.
    const byLayout = slot || blockPrints ? null : settingPrinting(settings, where, g.file, g.themeClass)
    const settingKey = slot?.setting ?? byLayout ?? null
    const setting = settings.find((s) => s.key === settingKey)
    const entity = g.block ? entities.get(g.block) : null
    let emptyShows = setting?.prints.find((p) => p.where === where)?.emptyShows ?? null
    if (!emptyShows && entity && isFreeHtml(entity) && g.blockTextOnly) emptyShows = 'nothing'
    const viaPhone = !g.at && g.phone
    const m = g.at ?? (viaPhone ? g.phone : g)
    const spot = {
      id: `logo-${where}-${spots.filter((s) => s.where === where).length + 1}`,
      frameId: slot ? neutralKey(slot.key) : null,
      where,
      block: g.block ? neutralKey(g.block) : where === 'header' ? 'header' : null,
      ground: {
        colour: m.ground?.colour ?? null,
        side: m.ground?.colour ? sideOfGround(m.ground.colour) : null,
        ...(m.ground?.picture ? { onPicture: true } : {})
      },
      width: g.at || viaPhone ? m.width : null,
      height: g.at || viaPhone ? m.height : null,
      ...(viaPhone ? { sizeAt: g.phone.at } : {}),
      shownIn: viaPhone ? [g.phone.theme ?? 'base'] : [...g.shownIn],
      twinOf: null,
      emptyShows,
      demoFiles: g.file ? [g.file] : [],
      setting: settingKey ?? null,
      pages: g.pages.size,
      theme: g.themeClass ?? null
    }
    const missing = (field, reason) =>
      errors.push({ kind: 'missing', field: `site.logoSpots[${spot.id}].${field}`, reason })
    if (!spot.frameId)
      missing('frameId', 'no content map slot prints this logo (free HTML or a template file)')
    if (!spot.emptyShows)
      missing('emptyShows', 'neither a template layout nor the block shows what prints without it')
    if (!spot.ground.colour)
      missing('ground', spot.ground.onPicture ? 'the logo sits on a picture' : 'no opaque ground')
    if (spot.width == null)
      missing('width', 'the logo is never shown in any theme of the template, at any width')
    spots.push(spot)
  }
  // Light and dark twins: same place and block, other theme marker; the one shown as the page opens is the main one.
  for (const s of spots) {
    if (!s.theme) continue
    const main = spots.find(
      (o) =>
        o !== s &&
        o.where === s.where &&
        o.block === s.block &&
        o.theme &&
        o.theme !== s.theme &&
        isOpening(o, reads)
    )
    if (main && !isOpening(s, reads)) s.twinOf = main.id
  }
  return { logoSpots: spots.sort((a, b) => WHERE.indexOf(a.where) - WHERE.indexOf(b.where)), errors }
}

const openingTheme = (reads) => reads.find((r) => r.opening)?.theme ?? 'base'
const isOpening = (spot, reads) => spot.shownIn.includes(openingTheme(reads))

/** The key of the logo setting a template layout prints at `where`, holding `file` or empty; of several, by theme. */
function settingPrinting(settings, where, file, themeClass) {
  const list = settings
    .filter(
      (s) => (s.value === file || s.value === '') && s.prints.some((p) => p.where === where && p.emptyShows)
    )
    .map((s) => ({ setting: s.key }))
  return pickByTheme(list, themeClass)?.setting ?? null
}

/** Of several site-level slots with the same file, the one whose setting names the logo's theme. */
function pickByTheme(list, themeClass) {
  if (list.length <= 1) return list[0] ?? null
  const dark = /dark/.test(themeClass ?? '')
  return list.find((s) => /dark/.test(s.setting ?? '') === dark) ?? list[0]
}
