/**
 * 🔒 PICTURES AND ICONS FOLLOW THE ACCEPTED SITE PLAN (spec TracyHQ/tracy#231, ticket #239, site build rules 2 and 4). After
 * the copy is settled, every picture slot gets exactly the plan's decision and every icon slot the plan's meaning:
 *   - a picture the plan fills with a brief photo takes that photo and no other, through the same acceptance and crop
 *     rules (crop keeps people); a photo those rules refuse there leaves the slot hidden, recorded;
 *   - a picture the plan draws is drawn from the plan's description (and the record, page and copy beside it); a picture
 *     is drawn ONLY where the plan says so;
 *   - a picture the plan hides is cleared and hidden; one the plan takes off (its section hidden, its page dropped, its
 *     card past the row's count) is not written at all;
 *   - a kept slot with no usable decision is hidden, recorded: no demo picture stays in a kept slot;
 *   - a logo slot takes only the logo (the brief's, or the business name), through the logo's own door;
 *   - a brief photo the plan does not use is never placed, extended or drawn from;
 *   - an icon shows the item meaning the plan names, or the one neutral icon for its whole row when the plan says
 *     neutral; the default (`item-meaning`) keeps the item's own words deciding.
 * With no accepted plan nothing here runs and the picture stage decides as before. CMS-neutral: it reads the plan, the
 * template inventory (`template-inventory.js`) and the picture stage's slot decisions only.
 */
import { isLogoPicture, showsLogo } from './site-plan-check-identity.js'
import { takenOff } from './site-plan-check.js'

/** The drawing description `completePlan` fills by default: no description of the author's own. */
const DEFAULT_DRAW = 'the record, page and copy beside this frame'
/** Icon meanings that keep the item's own words deciding. */
const OWN_MEANING = new Set(['', 'item-meaning', 'item meaning', 'own', 'item'])

const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])
const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')
/** A brief photo id of the plan (`photo:<asset id>`, `brief-photos.js`) as the picture stage names it (the asset id). */
export const assetIdOf = (/** @type {unknown} */ photo) => String(photo ?? '').replace(/^photo:/, '')

/**
 * The picture and icon decisions of an accepted site plan, by slot key; null without a plan.
 * @param {any} plan - the accepted site plan (`site-plan/1`, completed by `completePlan`)
 * @param {{inventory: {elements: any[]}}} input
 * @returns {null | {
 *   pictures: Map<string, {element: string, decision: 'photo' | 'draw' | 'hide' | 'template' | 'off' | 'none' | 'logo',
 *     mediaId?: string, describe?: string, reason?: string}>,
 *   icons: Map<string, {element: string, decision: 'meaning' | 'neutral' | 'own' | 'off', meaning?: string}>,
 *   skipped: Set<string>, used: Set<string>}}
 */
export function plannedPictures(plan, { inventory }) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.decisions)) return null
  const elements = new Map(list(inventory?.elements).map((e) => [e.id, e]))
  const decided = new Map([
    ...list(plan.pages).map((p) => [String(p?.id), p]),
    ...list(plan.decisions).map((d) => [String(d?.element), d])
  ])
  const off = takenOff(elements, decided)
  // The photos the plan uses, by picture slot, and the ones it leaves out.
  const photoOf = new Map()
  const used = new Set()
  const skipped = new Set()
  for (const entry of list(plan.photos)) {
    const id = assetIdOf(entry?.photo)
    if (!id) continue
    if (entry.decision === 'use') {
      used.add(id)
      for (const slot of list(entry.slots)) photoOf.set(String(slot), id)
    } else skipped.add(id)
  }
  for (const id of used) skipped.delete(id)
  const pictures = new Map()
  const icons = new Map()
  for (const e of elements.values()) {
    if ((e.kind !== 'picture' && e.kind !== 'icon') || !e.key) continue
    const d = decided.get(e.id)
    if (off(e) || decided.get(e.section)?.decision === 'hide') {
      ;(e.kind === 'picture' ? pictures : icons).set(e.key, { element: e.id, decision: 'off' })
      continue
    }
    if (e.kind === 'icon') {
      const meaning = text(typeof d?.icon === 'string' ? d.icon : d?.icon?.meaning)
      const decision =
        d?.decision === 'hide'
          ? 'off'
          : /^neutral$/i.test(meaning)
            ? 'neutral'
            : OWN_MEANING.has(meaning.toLowerCase())
              ? 'own'
              : 'meaning'
      icons.set(e.key, { element: e.id, decision, ...(decision === 'meaning' ? { meaning } : {}) })
      continue
    }
    // A logo slot shows the logo through its own door, whatever else the plan says (the plan check refuses anything else).
    if (isLogoPicture(e)) {
      pictures.set(e.key, {
        element: e.id,
        decision: 'logo',
        ...(showsLogo(d) ? {} : { reason: 'a logo slot takes only the logo' })
      })
      continue
    }
    if (!d) {
      pictures.set(e.key, {
        element: e.id,
        decision: 'none',
        reason: 'the site plan gives this picture no decision'
      })
      continue
    }
    if (d.decision === 'hide') {
      pictures.set(e.key, {
        element: e.id,
        decision: 'hide',
        reason: text(d.reason) || 'the site plan hides it'
      })
      continue
    }
    const photo = typeof d.picture?.photo === 'string' ? assetIdOf(d.picture.photo) : photoOf.get(e.id)
    if (photo && !skipped.has(photo))
      pictures.set(e.key, { element: e.id, decision: 'photo', mediaId: photo })
    else if (photo)
      pictures.set(e.key, {
        element: e.id,
        decision: 'none',
        reason: `the site plan names ${photo}, a photo it does not use`
      })
    else if (typeof d.picture?.draw === 'string') {
      const describe = text(d.picture.draw)
      pictures.set(e.key, {
        element: e.id,
        decision: 'draw',
        ...(describe && describe !== DEFAULT_DRAW ? { describe } : {})
      })
    } else if (d.picture?.template === true) pictures.set(e.key, { element: e.id, decision: 'template' })
    else
      pictures.set(e.key, {
        element: e.id,
        decision: 'none',
        reason: 'the site plan keeps this picture without saying what it shows'
      })
  }
  return { pictures, icons, skipped, used }
}

/**
 * The only brief photos each picture slot may take under the plan (the fill plan's `only`): its planned photo, or none.
 * A slot the plan leaves to the template is not listed, so the fill plan decides it as before.
 * @param {NonNullable<ReturnType<typeof plannedPictures>>} planned
 * @returns {Map<string, Set<string>>}
 */
export function onlyPhotos(planned) {
  const out = new Map()
  for (const [key, p] of planned.pictures)
    if (p.decision !== 'template') out.set(key, new Set(p.decision === 'photo' ? [p.mediaId] : []))
  return out
}

/** The reason a slot hidden by the plan carries in the fill plan. */
export const HIDDEN_BY_PLAN = 'site-plan-hidden'
/** The reason a slot the plan takes off carries in the fill plan: it is not written. */
export const OFF_BY_PLAN = 'site-plan-off'

/**
 * The fill plan's slot decisions with the site plan laid over them, before any drawing is planned, and one record per
 * picture slot of the plan saying what was applied. A slot the plan draws keeps the fill plan's "no photo fits" decision,
 * so the drawing planner draws it; every other slot leaves nothing to draw.
 * @param {any[]} slots - the fill plan's slot decisions (`planFill`)
 * @param {NonNullable<ReturnType<typeof plannedPictures>>} planned
 * @returns {{slots: any[], record: Map<string, any>}}
 */
export function followPlannedPictures(slots, planned) {
  const record = new Map()
  const hide = (/** @type {any} */ d, /** @type {string} */ why) => ({
    ...d,
    action: 'substitute',
    reason: HIDDEN_BY_PLAN,
    substitute: { kind: 'blank', reason: why },
    // Its own unit: a slot hidden never shares a written file with a slot of the same demo file that shows a picture.
    unit: `${d.unit ?? d.file ?? d.key}#${HIDDEN_BY_PLAN}`
  })
  const out = list(slots).map((d) => {
    const p = d?.type === 'image' ? planned.pictures.get(d.key) : null
    if (!p) return d
    const base = { slot: d.key, element: p.element, planned: p.decision }
    if (p.decision === 'off') {
      record.set(d.key, {
        ...base,
        applied: 'off',
        reason: 'the site plan takes its section, page or card off'
      })
      return { ...d, action: 'skip', reason: OFF_BY_PLAN }
    }
    // A logo slot never takes a photo or a drawing: the logo's own door writes the brief's logo or the business name.
    if (p.decision === 'logo') {
      record.set(d.key, { ...base, applied: 'logo', reason: 'the logo, through its own door' })
      return d.reason === 'logo-own-door' ? d : { ...d, action: 'skip', reason: 'logo-own-door' }
    }
    // The logo and a slot the template's role keeps go through their own door, whatever the plan says.
    if (['logo-own-door', 'role-keeps', 'demo-only-entity'].includes(d.reason)) {
      record.set(d.key, { ...base, applied: 'own-door', reason: d.reason })
      return d
    }
    if (p.decision === 'template') {
      record.set(d.key, { ...base, applied: 'template', reason: 'the site plan keeps the template picture' })
      return d
    }
    if (p.decision === 'photo') {
      if (d.action === 'photo' && d.mediaId === p.mediaId) {
        record.set(d.key, { ...base, applied: 'photo', mediaId: p.mediaId })
        return d
      }
      const refused = Object.keys(d.refused ?? {}).join(', ') || d.reason
      const why = `the planned photo ${p.mediaId} does not fit this frame (${refused})`
      record.set(d.key, { ...base, applied: 'hide', mediaId: p.mediaId, reason: why })
      return hide(d, why)
    }
    if (p.decision === 'draw') {
      record.set(d.key, { ...base, applied: 'draw', ...(p.describe ? { describe: p.describe } : {}) })
      return d
    }
    const why =
      p.decision === 'hide' ? (p.reason ?? 'the site plan hides it') : (p.reason ?? 'no usable decision')
    record.set(d.key, { ...base, applied: 'hide', reason: why })
    return hide(d, why)
  })
  return { slots: out, record }
}

/**
 * The record of a slot the plan draws once the drawings are planned: drawn, or what the existing rules gave instead (a
 * person picture is never drawn and shows initials; a slot with no owner photo to draw from, or past the drawing cap,
 * takes a brand colour block). A drawing the plan does not ask for is taken off the drawing plan.
 * @param {{slots: any[], drawings: any[], capped?: number}} drawn - `planDrawings`'s answer
 * @param {Map<string, any>} record
 */
export function settleDrawings(drawn, record) {
  const asked = new Set([...record].filter(([, r]) => r.applied === 'draw').map(([key]) => key))
  const slots = drawn.slots.map((d) => {
    if (d.action !== 'draw' || asked.has(d.key)) return d
    // A drawing the plan never asked for: the slot is hidden instead, never drawn.
    record.set(d.key, {
      ...(record.get(d.key) ?? { slot: d.key }),
      applied: 'hide',
      reason: 'the site plan does not draw it'
    })
    return {
      ...d,
      action: 'substitute',
      reason: HIDDEN_BY_PLAN,
      substitute: { kind: 'blank' },
      drawing: undefined
    }
  })
  const drawings = drawn.drawings
    .map((g) => ({ ...g, keys: g.keys.filter((/** @type {string} */ k) => asked.has(k)) }))
    .filter((g) => g.keys.length > 0)
  for (const d of slots) {
    const r = record.get(d.key)
    if (r?.applied !== 'draw') continue
    if (d.action === 'draw') record.set(d.key, { ...r, drawing: d.drawing })
    else
      record.set(d.key, {
        ...r,
        applied: d.action === 'substitute' ? 'substitute' : d.action,
        reason: d.reason
      })
  }
  return { ...drawn, slots, drawings }
}

/**
 * The decor plan's icons with the site plan's meanings laid over them: a planned meaning ranks first for its item, a
 * neutral decision turns its whole row neutral (site build rule 4), and no icon of a section repeats.
 * @param {any[]} decor - the decor plan's slots (`planDecor`)
 * @param {NonNullable<ReturnType<typeof plannedPictures>>} planned
 * @param {{rank: (meaning: string) => string[], neutral: readonly string[], rowOf: (key: string) => string,
 *   sectionOf: (key: string) => string}} tools - `rank`: icon names a meaning says, best first
 * @returns {{slots: any[], record: Map<string, any>}}
 */
export function followPlannedIcons(decor, planned, { rank, neutral, rowOf, sectionOf }) {
  const record = new Map()
  const icons = list(decor).filter((d) => d?.action === 'icon')
  const neutralRows = new Set(
    icons.filter((d) => planned.icons.get(d.key)?.decision === 'neutral').map((d) => rowOf(d.key))
  )
  const used = new Map()
  const glyphOf = new Map()
  // The glyphs the plan does not change are taken first, so a planned meaning never repeats one beside it.
  for (const d of icons) {
    const p = planned.icons.get(d.key)
    if (!p || neutralRows.has(rowOf(d.key)) || p.decision === 'meaning') continue
    const taken = used.get(sectionOf(d.key)) ?? new Set()
    taken.add(d.glyph)
    used.set(sectionOf(d.key), taken)
  }
  for (const d of icons) {
    const p = planned.icons.get(d.key)
    if (!p) continue
    if (neutralRows.has(rowOf(d.key))) {
      glyphOf.set(d.key, { glyph: neutral[0], reason: 'site-plan-neutral', applied: 'neutral' })
      continue
    }
    if (p.decision !== 'meaning') {
      glyphOf.set(d.key, { glyph: d.glyph, reason: d.reason, applied: p.decision === 'off' ? 'off' : 'own' })
      continue
    }
    const taken = used.get(sectionOf(d.key)) ?? new Set()
    used.set(sectionOf(d.key), taken)
    const glyph = rank(p.meaning ?? '').find((g) => !taken.has(g))
    if (glyph) {
      taken.add(glyph)
      glyphOf.set(d.key, { glyph, reason: 'site-plan-meaning', applied: 'meaning', meaning: p.meaning })
    } else glyphOf.set(d.key, { glyph: d.glyph, reason: d.reason, applied: 'own', meaning: p.meaning })
  }
  const slots = list(decor).map((d) => {
    const got = glyphOf.get(d?.key)
    if (!got) return d
    const p = planned.icons.get(d.key)
    record.set(d.key, {
      slot: d.key,
      element: p?.element,
      planned: p?.decision,
      applied: got.applied,
      glyph: got.glyph,
      ...(got.meaning ? { meaning: got.meaning } : {})
    })
    return { ...d, glyph: got.glyph, reason: got.reason }
  })
  return { slots, record }
}
