// Slot fit declared on the slots of a quickstart content map (ADR 0039): what the content put in a slot must look like
// so the template's layout holds. Measured at capture from the rendered demo (the content coverage audit, `--fit`),
// never declared by hand. Next to `content-map-roles.mjs`: a role says WHAT a slot holds, a fit says what SHAPE.
//
// The content map shape. One OPTIONAL field per text and image slot; a reader that ignores it keeps working:
//
//   picture  "fit": { "measured": true, "kind": "photo", "replace": "photo", "transparent": false,
//                     "source": {"width": 1408, "height": 604, "format": "jpg"},
//                     "boxes": {"desktop": {"width": 704, "height": 302}, "phone": {"width": 358, "height": 154}},
//                     "aspect": 2.3311, "tolerance": 0.02, "minWidth": 1056, "crop": "cover", "focus": "top" }
//            kind         one of `PICTURE_KINDS`
//            replace      what a build may put there: "photo", "logo" (the business's own), "keep" (the template's stays)
//            transparent  the demo file has a transparent ground (measured on the file), null when it was not read
//            boxes        the box the demo draws it in, per viewport (only the viewports that show it)
//            aspect       width / height of the desktop box (else the phone box); a photo is cut to it within `tolerance`
//            minWidth     the narrowest source that stays sharp: 1.5 x the widest box
//            crop         "cover" (cut to the box), "contain" (fitted whole, a logo), "none" (never cut)
//            focus        where the demo anchors the picture (object-position / background-position), when not centred
//   text     "fit": { "measured": true, "boxes": {...}, "lines": {"desktop": 2, "phone": 3},
//                     "maxChars": {"desktop": 48, "phone": 40}, "maxCharacters": 40, "casing": "upper",
//                     "overflow": "rewrite" }
//            maxChars     characters the box holds in its demo lines, per viewport; maxCharacters is the smallest
//            overflow     always "rewrite": a longer text is written shorter, never cut with an ellipsis
//   a slot no page shows: "fit": { "measured": false } (a picture adds what its file says: kind, replace, source)
//
// and, at the top level of the map:
//
//   "slotFitVersion": "slot-fit/1"
//   "fitGroups": { "module-163.person": { "items": 4, "uniform": true, "whenFewer": "neutral" } }
//            one entry per collection of role groups (ADR 0038 `group.id` without its item number): how many items the
//            demo shows, whether every picture of it has one shape, and what a build does when the brief has fewer
//            (ADR 0037: the layout stays, a missing item takes neutral words).
//
// Released content maps are never edited (their hash is bound on every site), so Slot fit appears only in contract
// versions captured after ADR 0039.

export const SLOT_FIT_VERSION = 'slot-fit/1'
/** How far a picture's shape may be from its box's, relative; a sealed site refuses a write past it. */
export const SLOT_FIT_TOLERANCE = 0.02
/** A picture drawn smaller than this on every viewport is an icon. */
export const ICON_PX = 120

/** Each picture kind and what a build may put in its place. */
export const PICTURE_KINDS = Object.freeze({
  photo: { replace: 'photo', what: 'a photograph' },
  'video-poster': { replace: 'photo', what: 'the still of a video' },
  logo: { replace: 'logo', what: 'a logo: only the business logo replaces it' },
  icon: { replace: 'keep', what: 'an icon or mark' },
  avatar: { replace: 'keep', what: "a face: somebody's own picture" },
  'avatar-group': { replace: 'keep', what: 'a strip of faces' },
  signature: { replace: 'keep', what: "a signature: somebody's own hand" },
  cutout: { replace: 'keep', what: 'a cut-out (transparent ground): a photo would show a box' },
  decoration: { replace: 'keep', what: 'decoration, not a photograph' },
  map: { replace: 'keep', what: 'a map: a picture of a place would invent one' }
})
const CROPS = new Set(['cover', 'contain', 'none'])
const CASINGS = new Set(['none', 'upper', 'lower', 'capitalize'])
const FIT_TYPES = new Set(['text', 'image'])

/** What a build may put in the place of a picture of `kind`: "photo", "logo" or "keep"; null for an unknown kind. */
export function pictureReplaceOf(kind) {
  return Object.hasOwn(PICTURE_KINDS, kind) ? PICTURE_KINDS[kind].replace : null
}

// The rule table, first match wins. Words are the slot's label, field names and file path.
const MAP_WORDS = /\bmaps?\b|google\.[a-z.]+\/maps/
const LOGO_WORDS = /\blogos?\b|hp-brand|\bbrand\b|favicon/
const SIGNATURE_WORDS = /signature|\bsign\b/
const AVATAR_WORDS = /avatars?|author-img|\bfaces?\b|testimonial/
const ICON_WORDS = /\bicons?\b|\bflags?\b|sprite|\bbadges?\b|\bpartners?\b|\bclients?\b/
const DECORATION_WORDS = /decor|\bshapes?\b|pattern|ornament|\bmask\b/
const VIDEO_WORDS = /video|poster/

const longest = (size) => (size?.width && size?.height ? Math.max(size.width, size.height) : 0)

/**
 * The kind of a picture slot from what capture measured, and why.
 * @param {{words?: string, file?: string, source?: {width?: number, height?: number, alpha?: boolean | null} | null,
 *   boxes?: Record<string, {width: number, height: number}> | null}} evidence
 * @returns {{kind: string, why: string}}
 */
export function pictureKindOf({ words = '', file = '', source = null, boxes = null } = {}) {
  const text = `${words} ${file}`.toLowerCase()
  const shown = Object.values(boxes ?? {}).filter((b) => b?.width > 0 && b?.height > 0)
  const widest = Math.max(0, ...shown.map(longest))
  const desktop = boxes?.desktop ?? shown[0] ?? null
  if (MAP_WORDS.test(text)) return { kind: 'map', why: 'its name says map' }
  if (LOGO_WORDS.test(text)) return { kind: 'logo', why: 'its name says logo' }
  if (SIGNATURE_WORDS.test(text)) return { kind: 'signature', why: 'its name says signature' }
  if (AVATAR_WORDS.test(text)) {
    const strip = desktop && desktop.width / desktop.height >= 2.5
    return strip
      ? { kind: 'avatar-group', why: 'faces drawn in a wide strip' }
      : { kind: 'avatar', why: 'its name says avatar' }
  }
  if (/\.svg(?:[?#]|$)/.test(text)) return { kind: 'icon', why: 'a drawing (SVG)' }
  // A field named like an icon that the demo draws as a large opaque picture holds a photo (JA Boxing's "Video Trainer /
  // img-icon": 448x598 trainer photos): what was measured beats the name.
  const drawnAsPhoto = widest >= 2 * ICON_PX && source?.alpha === false
  if (ICON_WORDS.test(text) && !drawnAsPhoto) return { kind: 'icon', why: 'its name says icon' }
  const size = widest || longest(source)
  if (source?.alpha === true)
    return size >= ICON_PX
      ? { kind: 'cutout', why: `a transparent picture drawn ${size}px wide` }
      : { kind: 'icon', why: `a transparent picture under ${ICON_PX}px` }
  if (size > 0 && size < ICON_PX) return { kind: 'icon', why: `drawn under ${ICON_PX}px` }
  if (DECORATION_WORDS.test(text)) return { kind: 'decoration', why: 'its name says decoration' }
  if (VIDEO_WORDS.test(text)) return { kind: 'video-poster', why: 'its name says video' }
  return { kind: 'photo', why: source?.alpha === false ? 'an opaque picture' : 'no other rule matched' }
}

const has = (object, key) => Boolean(object && typeof object === 'object' && Object.hasOwn(object, key))
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const wholeFrom = (n, min) => Number.isInteger(n) && n >= min

function boxesProblems(boxes) {
  if (!isObject(boxes) || Object.keys(boxes).length === 0) return ['boxes must name at least one viewport']
  const out = []
  for (const [vp, b] of Object.entries(boxes))
    if (!wholeFrom(b?.width, 1) || !wholeFrom(b?.height, 1))
      out.push(`box ${vp} must be whole positive width and height`)
  return out
}

function pictureProblems(fit, slot) {
  const out = []
  if (has(fit, 'kind') || fit.measured) {
    if (!Object.hasOwn(PICTURE_KINDS, fit.kind)) return [`unknown kind ${JSON.stringify(fit.kind)}`]
    if (fit.replace !== pictureReplaceOf(fit.kind))
      out.push(`replace must be "${pictureReplaceOf(fit.kind)}" for kind ${fit.kind}`)
    const kept = slot?.customize === 'keep'
    if (fit.replace === 'keep' && !kept)
      out.push(`is kind ${fit.kind}, which no build replaces, so it needs customize "keep"`)
    if (fit.replace === 'photo' && kept)
      out.push(`is kind ${fit.kind}, which a build replaces, so it must not carry customize "keep"`)
  }
  if (has(fit, 'transparent') && fit.transparent !== null && typeof fit.transparent !== 'boolean')
    out.push('transparent must be true, false or null')
  if (!fit.measured) return out
  out.push(...boxesProblems(fit.boxes))
  if (!(typeof fit.aspect === 'number' && fit.aspect > 0)) out.push('aspect must be a positive number')
  if (!(typeof fit.tolerance === 'number' && fit.tolerance > 0 && fit.tolerance <= 0.2))
    out.push('tolerance must be a number above 0, at most 0.2')
  if (fit.minWidth !== null && !wholeFrom(fit.minWidth, 1))
    out.push('minWidth must be a whole positive number or null')
  if (!CROPS.has(fit.crop)) out.push(`crop must be one of ${[...CROPS].join(', ')}`)
  return out
}

function textProblems(fit) {
  if (!fit.measured) return []
  const out = boxesProblems(fit.boxes)
  for (const field of ['lines', 'maxChars']) {
    if (!isObject(fit[field])) out.push(`${field} must name each viewport`)
    else
      for (const [vp, n] of Object.entries(fit[field]))
        if (!wholeFrom(n, 1)) out.push(`${field} ${vp} must be a whole number from 1`)
  }
  const least = isObject(fit.maxChars) ? Math.min(...Object.values(fit.maxChars)) : NaN
  if (fit.maxCharacters !== least) out.push('maxCharacters must be the smallest of maxChars')
  if (!CASINGS.has(fit.casing)) out.push(`casing must be one of ${[...CASINGS].join(', ')}`)
  if (fit.overflow !== 'rewrite') out.push('overflow must be "rewrite"')
  return out
}

/** What is wrong with a slot's fit (empty: nothing, or the slot has none). */
function fitProblems(slot) {
  const fit = slot?.fit
  if (!isObject(fit)) return ['fit must be an object']
  if (typeof fit.measured !== 'boolean') return ['fit needs measured true or false']
  return slot.type === 'image' ? pictureProblems(fit, slot) : textProblems(fit)
}

/** A slot's fit when it is well formed, else null. */
export function slotFitOf(slot) {
  if (!has(slot, 'fit') || !FIT_TYPES.has(slot?.type)) return null
  return fitProblems(slot).length === 0 ? slot.fit : null
}

/** Whether a content map declares Slot fit at all: a version, or a fit on any slot. */
export function contentMapDeclaresFit(contentMap) {
  const slots = Array.isArray(contentMap?.slots) ? contentMap.slots : []
  return has(contentMap, 'slotFitVersion') || slots.some((slot) => has(slot, 'fit'))
}

/**
 * The contract check of a content map's Slot fit. A map that declares none is not checked (`declared: false`), but the
 * count of text and image slots without a fit is always given (the Road to live counts them). A map that declares
 * Slot fit must name the current version, carry a well-formed fit on every text and image slot, and keep each
 * picture's `customize: "keep"` in step with its kind.
 * @param {any} contentMap
 * @returns {{declared: boolean, ok: boolean, errors: string[], missing: {image: number, text: number},
 *   slots: {image: number, text: number}, missingKeys: string[]}}
 */
export function checkContentMapFit(contentMap) {
  const slots = Array.isArray(contentMap?.slots) ? contentMap.slots : []
  const counted = { image: 0, text: 0 }
  const missing = { image: 0, text: 0 }
  const missingKeys = []
  const errors = []
  const declared = contentMapDeclaresFit(contentMap)
  for (const slot of slots) {
    if (!FIT_TYPES.has(slot?.type)) continue
    const key = String(slot?.key ?? '')
    counted[slot.type] += 1
    if (!has(slot, 'fit')) {
      missing[slot.type] += 1
      missingKeys.push(key)
      if (declared) errors.push(`slot "${key}" (${slot.type}) has no fit`)
      continue
    }
    for (const problem of fitProblems(slot)) errors.push(`slot "${key}" (${slot.type}) ${problem}`)
  }
  if (declared && contentMap.slotFitVersion !== SLOT_FIT_VERSION)
    errors.push(
      `slotFitVersion must be "${SLOT_FIT_VERSION}", got ${JSON.stringify(contentMap.slotFitVersion)}`
    )
  for (const [id, group] of Object.entries(contentMap?.fitGroups ?? {}))
    if (!wholeFrom(group?.items, 1) || typeof group?.uniform !== 'boolean' || group?.whenFewer !== 'neutral')
      errors.push(
        `fitGroups "${id}" must be {items: whole from 1, uniform: true or false, whenFewer: "neutral"}`
      )
  return { declared, ok: errors.length === 0, errors, missing, slots: counted, missingKeys }
}

/**
 * The Slot fit of a content map as readers take it (the WO fill planner, the agent demo, the Claude Cowork slot list):
 * `missing` when the map declares none (every contract released before ADR 0039), `invalid` with the errors when it is
 * broken, else `ready`. `slots` maps each slot key to its fit; `groups` is the map's `fitGroups`.
 * @param {any} contentMap
 */
export function slotFitOfContentMap(contentMap) {
  const check = checkContentMapFit(contentMap)
  if (!check.declared)
    return { state: 'missing', version: null, slots: {}, groups: {}, missing: check.missing }
  const slots = {}
  for (const slot of contentMap.slots ?? []) if (has(slot, 'fit')) slots[String(slot.key)] = slot.fit
  return {
    state: check.ok ? 'ready' : 'invalid',
    version: contentMap.slotFitVersion ?? null,
    slots,
    groups: contentMap.fitGroups ?? {},
    missing: check.missing,
    ...(check.ok ? {} : { errors: check.errors })
  }
}
