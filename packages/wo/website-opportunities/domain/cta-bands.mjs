import { isButtonSlot } from './button-actions.mjs'
import { heroSlotsOf, limitOf } from './hero-first-screen.mjs'

// A call-to-action band is ONE unit (COO decision, spec TracyHQ/tracy#189 item 7): its message (a heading and a short line),
// its button (with the action role the content map declares) and its ground picture. A brief build writes the message from
// the brief so that it leads to the button's action; a kept band never shows a lone button.
//
// A content map declares its bands in the top-level `ctaBands` (quickstart-contract skill):
//   { id, entity, message: [{ key, part: "heading" | "line" }], buttons: [<button text slot key>], ground: <image slot> | null }

export const CTA_BAND_PARTS = Object.freeze(['heading', 'line'])
/** The button jobs that make a block a conversion band (a navigation button is a "see more" link of a section). */
const CONVERSION_ACTIONS = new Set(['primary-cta', 'contact'])

const list = (v) => (Array.isArray(v) ? v : [])
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const entityOf = (slot) => slot?.entity ?? String(slot?.key ?? '').split('.')[0]
const indexOf = (key) => Number(/\.(\d+)$/.exec(String(key))?.[1] ?? 0)
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''

/** The bands a content map declares, well formed or not. */
export function ctaBandsOf(contentMap) {
  return list(contentMap?.ctaBands).filter(object)
}

/** Every hero entity of the map's pages: a hero is the first screen's unit (`hero-first-screen.mjs`), never a band. */
function heroEntities(contentMap) {
  const out = new Set()
  for (const page of [undefined, ...list(contentMap?.pages)]) {
    const entity = heroSlotsOf(contentMap, page)?.entity
    if (entity) out.add(entity)
  }
  return out
}

/**
 * The blocks of a content map that are call-to-action bands: one block (not a hero) whose only words are at most two
 * single message lines and a conversion button, with no repeated cards. Its message is its words other than the button;
 * its ground is its picture.
 * @returns {Array<{id: string, entity: string, message: Array<{key: string, part: string}>, buttons: string[], ground: string | null}>}
 */
export function proposeCtaBands(contentMap) {
  const heroes = heroEntities(contentMap)
  const modules = new Set(
    list(contentMap?.entities)
      .filter((e) => e?.kind === 'module')
      .map((e) => e.key)
  )
  // A module record's own title is the admin's label of the block (shown only when the module is set to), never band words.
  const shownWords = (s) => !(s.column === 'title' && modules.has(entityOf(s)))
  const byEntity = new Map()
  for (const slot of list(contentMap?.slots)) {
    const entity = entityOf(slot)
    byEntity.set(entity, [...(byEntity.get(entity) ?? []), slot])
  }
  const out = []
  for (const [entity, slots] of byEntity) {
    if (heroes.has(entity)) continue
    if (slots.some((s) => Number(s.group?.item ?? 0) > 0)) continue
    const buttons = slots.filter(
      (s) => s.type === 'text' && isButtonSlot(s) && CONVERSION_ACTIONS.has(s.action?.kind)
    )
    if (!buttons.length) continue
    const words = slots
      .filter((s) => s.type === 'text' && !isButtonSlot(s) && nonEmpty(s.sample) && shownWords(s))
      .sort((a, b) => indexOf(a.key) - indexOf(b.key))
    const pictures = slots.filter(
      (s) => s.type === 'image' && !['editorial.item_icon', 'editorial.design_element'].includes(s.role)
    )
    if (words.length > CTA_BAND_PARTS.length || (!words.length && !pictures.length)) continue
    out.push({
      id: `${entity}.cta-band`,
      entity,
      message: words.map((s, i) => ({ key: s.key, part: CTA_BAND_PARTS[i] })),
      buttons: buttons.map((s) => s.key),
      ground: pictures[0]?.key ?? null
    })
  }
  return out
}

/**
 * Structural check of a content map's call-to-action bands: each declared band names its message slots (each a text slot
 * of the band with a message part), its declared buttons and, when it has one, its ground picture; every band the map
 * holds (`proposeCtaBands`) is declared.
 * @returns {string[]}
 */
export function ctaBandProblems(contentMap) {
  const raw = contentMap?.ctaBands
  if (raw !== undefined && !Array.isArray(raw)) return ['ctaBands must be an array']
  const slots = new Map(list(contentMap?.slots).map((s) => [s.key, s]))
  const errors = []
  const ids = new Set()
  for (const band of list(raw)) {
    if (!object(band) || !nonEmpty(band.id)) {
      errors.push('a call-to-action band has no id')
      continue
    }
    const named = `call-to-action band "${band.id}"`
    if (ids.has(band.id)) errors.push(`${named} is declared twice`)
    ids.add(band.id)
    const message = list(band.message)
    if (!message.length) errors.push(`${named} has no message slot role`)
    for (const part of message) {
      const slot = slots.get(part?.key)
      if (!CTA_BAND_PARTS.includes(part?.part))
        errors.push(`${named} message "${part?.key}" has no message slot role (heading or line)`)
      if (slot?.type !== 'text' || isButtonSlot(slot))
        errors.push(`${named} message "${part?.key}" must name a text slot that is not a button`)
      else if (band.entity && entityOf(slot) !== band.entity)
        errors.push(`${named} message "${part.key}" is outside the band's entity`)
    }
    if (!message.some((p) => p?.part === 'heading'))
      errors.push(`${named} has no heading message slot`)
    const buttons = list(band.buttons)
    if (!buttons.length) errors.push(`${named} has no button`)
    for (const key of buttons)
      if (!slots.get(key)?.action) errors.push(`${named} button "${key}" must name a slot with an action role`)
    if (band.ground !== undefined && band.ground !== null && slots.get(band.ground)?.type !== 'image')
      errors.push(`${named} ground must name an image slot`)
  }
  const declared = new Set(ctaBandsOf(contentMap).map((b) => b.entity))
  for (const band of proposeCtaBands(contentMap))
    if (!declared.has(band.entity))
      errors.push(`call-to-action band "${band.entity}" is not declared in ctaBands`)
  return errors
}

const OFFER_WORDS =
  /\b(?:free|trial|discount|offer|sale|deal|promo|promotion|voucher|coupon|bonus|gift|save|cheap|guarantee[ds]?)\b/giu

/**
 * Why a band's message line cannot stand, or null. Editorial words are free; a number, a price, a dash, the demo's own
 * words or an offer word the brief never says (a free trial, a discount) are refused.
 * @param {string} value
 * @param {{slot?: any, max?: number, briefText?: string}} [options]
 */
export function ctaBandMessageProblem(value, { slot = null, max, briefText = '' } = {}) {
  const line = String(value ?? '').trim()
  if (!line) return 'empty'
  const limit = max ?? (slot ? limitOf(slot) : 120)
  if ([...line].length > limit) return 'too-long'
  if (/[<>{}\n\r]/.test(line)) return 'markup'
  if (/[\u2013\u2014]/u.test(line)) return 'dash'
  if (/\p{Nd}/u.test(line)) return 'number'
  if (/[$\u00a3\u20ac\u00a5\u20b9\u20ab%]|\b(?:aed|usd|eur|gbp|dhs?)\b/iu.test(line)) return 'price'
  const said = String(briefText).toLowerCase()
  for (const [word] of line.toLowerCase().matchAll(OFFER_WORDS))
    if (!new RegExp(`\\b${word}\\b`, 'u').test(said)) return 'invented-offer'
  const fold = (t) =>
    String(t ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  if (slot && nonEmpty(slot.sample) && fold(line) === fold(slot.sample)) return 'demo-words'
  return null
}
