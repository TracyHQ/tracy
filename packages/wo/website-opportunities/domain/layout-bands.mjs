// Layout bands (COO decision, spec TracyHQ/tracy#189 item 30): a band of the page is ONE unit made of several blocks side by
// side (a footer strip with a logo beside a sign-up box; an intro strip with an icon beside a heading and a button). Measured
// on a local brief build (a coaching club on a Joomla T4 template): the sign-up box of the footer's top band came off (no
// destination for it in the brief) and the band stayed, with only the template's logo standing alone in an empty dark strip.
//
// 🔒 A BAND THAT LOST ITS WORKING PARTS COMES OFF WHOLE. A working part says or does something (a heading, a text, a form, a
// button); a decoration part only decorates (a logo, an icon, a divider, a background). When every working part of a band
// is taken off, its decoration parts are taken off with it, unless the content map declares that decoration `standalone`
// (a logo strip the template means to show alone). Rules by slot role, never by template, module or trade. Pure.
//
// A content map declares its bands in the top-level `layoutBands` (quickstart-contract skill):
//   { id, parts: [{ entity: <entity key>, part: "working" | "decoration" | "standalone" }] }
// A map that declares none is read by `proposeLayoutBands` (blocks sharing one layout place stem, see below).

export const LAYOUT_BAND_PARTS = Object.freeze(['working', 'decoration', 'standalone'])

/** Picture roles that only decorate: a logo, an item icon, a drawn shape. */
const DECORATION_ROLES = new Set([
  'business.logo',
  'editorial.item_icon',
  'editorial.design_element',
  'editorial.decorative_image'
])
/** Fit kinds of a picture that only decorates. */
const DECORATION_FITS = new Set(['logo', 'icon', 'decoration'])

const list = (v) => (Array.isArray(v) ? v : [])
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const entityOf = (slot) => slot?.entity ?? String(slot?.key ?? '').split('.')[0]

/** A slot a visitor sees as decoration only: a decorating picture, or the link a decorating picture carries. */
const decorating = (slot) =>
  slot?.type === 'url' ||
  (slot?.type === 'image' && (DECORATION_ROLES.has(slot.role) || DECORATION_FITS.has(slot.fit?.kind)))

/**
 * What one block of a content map is: `decoration` when every slot it has decorates (and at least one is a picture),
 * `working` when it shows words or a form, else null (a block with nothing the map reads).
 * @returns {'working' | 'decoration' | null}
 */
export function blockPartOf(contentMap, entity) {
  const slots = list(contentMap?.slots).filter((s) => entityOf(s) === entity)
  const own = list(contentMap?.entities).find((e) => e?.key === entity)
  // A module record's own title is the admin's label (shown only when the module is set to), never a working part.
  const shown = slots.filter((s) => !(s.column === 'title' && own?.kind === 'module'))
  if (shown.some((s) => s.type === 'text' && nonEmpty(s.sample))) return 'working'
  if (
    /^mod_(?:acym|\w*newsletter|\w*mailchimp|login|\w*form\w*|\w*booking\w*)/i.test(
      own?.identity?.module ?? ''
    )
  )
    return 'working'
  if (shown.length && shown.every(decorating) && shown.some((s) => s.type === 'image')) return 'decoration'
  return null
}

/** The stem of a layout place: `footer-info-2` and `footer-info-1` share `footer-info`. */
const stemOf = (position) => String(position ?? '').replace(/[-_]?\d+$/, '')

/**
 * The bands of a content map no declaration names: the blocks (Joomla modules) whose layout places share one stem
 * (`<stem>-1`, `<stem>-2`), when at least one of them is decoration only and another is a working part. A band of
 * working parts only needs no declaration: taking one off leaves the others standing.
 * @returns {Array<{id: string, parts: Array<{entity: string, part: 'working' | 'decoration'}>}>}
 */
export function proposeLayoutBands(contentMap) {
  /** @type {Map<string, string[]>} */
  const byStem = new Map()
  for (const entity of list(contentMap?.entities)) {
    if (entity?.kind !== 'module') continue
    const position = String(entity.identity?.position ?? '')
    if (!/[-_]?\d+$/.test(position) || !stemOf(position)) continue
    const key = `${entity.identity?.language ?? '*'}|${stemOf(position)}`
    byStem.set(key, [...(byStem.get(key) ?? []), entity.key])
  }
  const out = []
  for (const [key, entities] of byStem) {
    if (entities.length < 2) continue
    const parts = entities
      .map((entity) => ({ entity, part: blockPartOf(contentMap, entity) }))
      .filter((p) => p.part !== null)
    if (!parts.some((p) => p.part === 'decoration') || !parts.some((p) => p.part === 'working')) continue
    out.push({ id: key.split('|')[1], parts })
  }
  return /** @type {any} */ (out)
}

/** The bands a content map declares (`layoutBands`), else the ones it holds undeclared (`proposeLayoutBands`). */
export function layoutBandsOf(contentMap) {
  if (Array.isArray(contentMap?.layoutBands)) return contentMap.layoutBands.filter(object)
  return proposeLayoutBands(contentMap)
}

/**
 * The decoration a band keeps once its working parts are taken off: every `decoration` part (not `standalone`) of a band
 * whose every working part is in `takenOff`. Each entity once, in band order.
 * @param {any} contentMap
 * @param {Iterable<string>} takenOff - the entity keys the build takes off
 * @returns {Array<{band: string, entity: string}>}
 */
export function decorationLeftAlone(contentMap, takenOff) {
  const off = new Set(takenOff)
  const out = []
  for (const band of layoutBandsOf(contentMap)) {
    const parts = list(band.parts).filter(object)
    const working = parts.filter((p) => p.part === 'working')
    if (!working.length || !working.every((p) => off.has(p.entity))) continue
    for (const p of parts)
      if (p.part === 'decoration' && !off.has(p.entity) && !out.some((o) => o.entity === p.entity))
        out.push({ band: String(band.id ?? ''), entity: p.entity })
  }
  return out
}

/**
 * Structural check of a content map's layout bands (the packing check): each declared band names at least two parts, each
 * an entity of the map with a known part, at least one of them working; every band the map holds (`proposeLayoutBands`)
 * is declared, so a template says which blocks make each band before it is released.
 * @returns {string[]}
 */
export function layoutBandProblems(contentMap) {
  const raw = contentMap?.layoutBands
  if (raw !== undefined && !Array.isArray(raw)) return ['layoutBands must be an array']
  const entities = new Set(list(contentMap?.entities).map((e) => e?.key))
  const errors = []
  const ids = new Set()
  const declared = new Set()
  for (const band of list(raw)) {
    if (!object(band) || !nonEmpty(band.id)) {
      errors.push('a layout band has no id')
      continue
    }
    const named = `layout band "${band.id}"`
    if (ids.has(band.id)) errors.push(`${named} is declared twice`)
    ids.add(band.id)
    const parts = list(band.parts)
    if (parts.length < 2) errors.push(`${named} must name at least two parts`)
    for (const p of parts) {
      if (!entities.has(p?.entity)) errors.push(`${named} part "${p?.entity}" is not an entity of the map`)
      if (!LAYOUT_BAND_PARTS.includes(p?.part))
        errors.push(`${named} part "${p?.entity}" must be working, decoration or standalone`)
      declared.add(p?.entity)
    }
    if (!parts.some((p) => p?.part === 'working')) errors.push(`${named} has no working part`)
  }
  for (const band of proposeLayoutBands(contentMap))
    for (const p of band.parts)
      if (p.part === 'decoration' && !declared.has(p.entity))
        errors.push(`layout band "${band.id}" (decoration "${p.entity}") is not declared in layoutBands`)
  return errors
}
