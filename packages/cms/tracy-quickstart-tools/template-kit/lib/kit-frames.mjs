// The `frames[]` of a block: `{ id, shape, width, height, kind, canHide, twinOf, fixed }`, every value from what
// was measured on the site (frame-evidence.json), the icon classes (icon-classes.json) and a person's review
// (frame-review.json); nothing guessed. A field that could not be measured is null and named in `errors`.
import { pictureOf } from './block-slots.mjs'
import { imageIdOf, neutralKey } from './ids.mjs'

const ICON_SIDE = 128 // a frame no wider or taller than this on the page is an icon
const MARK_SIDE = 320 // a picture mostly clear (drawn on nothing), up to this size, is a drawn mark: an icon too

/** The kind of a frame from its measured box and pixels: `photo`, `cutout` or `icon`; null when unmeasured. */
export function kindOf(m) {
  if (!m?.found || !m.box?.width) return null
  const side = Math.max(m.box.width, m.box.height)
  const clear = m.pixels?.share ?? 0
  if (side <= ICON_SIDE) return 'icon'
  if (clear >= 0.1 && m.over) return 'cutout'
  if (clear >= 0.15 && side <= MARK_SIDE) return 'icon'
  return 'photo'
}

/** A frame's shape from its measured width and height. */
export function shapeOfBox(width, height) {
  if (!width || !height) return null
  const aspect = width / height
  const name = aspect > 1.9 ? 'wide' : aspect > 1.1 ? 'landscape' : aspect >= 0.9 ? 'square' : 'portrait'
  return { name, aspect: Math.round(aspect * 1000) / 1000 }
}

/** canHide from the checks at every width: one no is no; an invalid measurement is unknown; else yes. */
export function canHideOf(checks) {
  if (!checks.length) return null
  if (checks.some((c) => c.ok === false)) return false
  if (checks.some((c) => c.ok == null)) return null
  return true
}

/** The row a slot fills: its list group and item, else the field path that holds it (an item of a field list). */
const rowOf = (s) =>
  s.group
    ? `${s.group.id}#${s.group.item}`
    : (s.jsonPath?.length ?? 0) > 1
      ? `${s.entity}:${s.jsonPath.slice(0, -1).join('/')}`
      : null

const seen = (ev) => Object.values(ev?.widths ?? {}).find((m) => m.found) ?? null

/**
 * Light/dark twins in one block: two frames of the same row (or both outside rows) whose markup carries
 * different theme markers, one shown and the other not. The shown one is the main frame.
 * @returns {Map<string, string>} twin id -> main id
 */
export function twinsOf(frames, evidence) {
  const out = new Map()
  const info = frames
    .map((f) => ({ ...f, m: seen(evidence[f.id]), block: evidence[f.id]?.block }))
    .filter((f) => f.m)
  for (const hidden of info.filter((f) => !f.m.shown)) {
    const mains = info.filter(
      (f) =>
        f.m.shown &&
        f.row === hidden.row &&
        f.block === hidden.block &&
        f.m.theme !== hidden.m.theme &&
        (f.m.theme || hidden.m.theme) &&
        ![...out.values()].includes(f.id)
    )
    // A main frame marked with the other theme beats one with no marker at all.
    const marked = mains.filter((f) => f.m.theme && hidden.m.theme)
    const pick = marked.length === 1 ? marked : mains
    if (pick.length === 1) out.set(hidden.id, pick[0].id)
  }
  return out
}

/**
 * `logoIds`: the frames the site part found to be the site's logo (lib/site/logo-spots.mjs); kind `logo`.
 * @param {{blockId: string, slots: object[], evidence: object, classes: object, review: object, widths: string[], errors: object[], logoIds?: Set<string>}} o
 * @returns {{frames: object[], demoIcons: object[]}}
 */
export function buildFrames({ blockId, slots, evidence, classes, review, widths, errors, logoIds }) {
  const missing = (id, field, reason) =>
    errors.push({ kind: 'missing', field: `blocks[${blockId}].frames[${id}].${field}`, reason })
  const base = slots
    .filter((s) => s.type === 'image')
    .map((s) => ({ id: neutralKey(s.key), row: rowOf(s), slot: s }))
  const twins = twinsOf(base, evidence)
  const desk = widths[0]
  const one = (f) => {
    const ev = evidence[f.id]
    const m = ev?.widths?.[desk]?.found && ev.widths[desk].shown ? ev.widths[desk] : seen(ev)
    const kind = kindOf(m)
    const measuredAt = Object.entries(ev?.widths ?? {}).filter(([, x]) => x.hidden)
    const checks = Object.fromEntries(measuredAt.map(([w, x]) => [w, x.hidden.check]))
    const auto = canHideOf(Object.values(checks))
    const measuredAs = measuredAt.find(([, x]) => x.hidden.measuredAs)?.[1].hidden.measuredAs ?? 'single'
    const human = review?.[f.id]
    return {
      id: f.id,
      shape: shapeOfBox(
        ev?.widths?.[desk]?.shown ? ev.widths[desk].box?.width : null,
        ev?.widths?.[desk]?.box?.height
      ),
      width: ev?.widths?.[desk]?.shown ? ev.widths[desk].box.width : null,
      height: ev?.widths?.[desk]?.shown ? ev.widths[desk].box.height : null,
      kind,
      canHide: typeof human?.canHide === 'boolean' ? human.canHide : auto,
      twinOf: null,
      fixed: null,
      hideEvidence: measuredAt.length
        ? {
            images: Object.fromEntries(measuredAt.map(([w, x]) => [w, imageIdOf(x.hidden.image)])),
            checks: Object.fromEntries(Object.entries(checks).map(([w, c]) => [w, c.reason])),
            measuredAs,
            invalid: Object.values(checks).some((c) => c.ok === null),
            judgedBy:
              typeof human?.canHide === 'boolean' ? `person: ${human.reason ?? ''}`.trim() : 'automatic check'
          }
        : null,
      kindEvidence: m?.found
        ? {
            clearShare: m.pixels ? Math.round(m.pixels.share * 100) / 100 : null,
            overPicture: m.over,
            paintedBy: m.paintedBy ?? null,
            revealed: m.revealed ?? null,
            measuredIn: m.measuredIn ?? null,
            box: m.box
          }
        : null,
      picture: pictureOf(f.slot),
      role: f.slot.role ?? null
    }
  }
  const frames = base.map(one)
  const byId = new Map(frames.map((f) => [f.id, f]))
  for (const [twin, main] of twins) {
    const t = byId.get(twin)
    const m = byId.get(main)
    Object.assign(t, {
      twinOf: main,
      kind: m.kind,
      width: m.width,
      height: m.height,
      shape: m.shape,
      canHide: m.canHide
    })
  }
  for (const f of frames) if (logoIds?.has(f.id) || (f.twinOf && logoIds?.has(f.twinOf))) f.kind = 'logo'
  const demoIcons = []
  for (const f of frames) {
    const cls = classes?.[f.twinOf ?? f.id]
    const why = cls ? `${cls.reason ?? ''} (${cls.by ?? 'unknown'})`.trim() : null
    if (f.kind === 'logo')
      f.fixed = null // the brand step decides who owns the logo, not the frame measure
    else if (cls?.class === 'demo-faces') {
      // Strangers' faces from the demo: keeping them on a customer site would be fake proof.
      f.fixed = false
      f.faces = true
      f.classReason = why
      demoIcons.push({ id: f.id, role: f.role, sample: f.picture, kind: f.kind, class: 'demo-faces' })
    } else if (f.kind === 'icon') {
      if (cls?.class === 'fixed' || cls?.class === 'demo') {
        f.fixed = cls.class === 'fixed'
        f.classReason = why
        if (!f.fixed) demoIcons.push({ id: f.id, role: f.role, sample: f.picture, kind: 'icon' })
      } else
        missing(
          f.id,
          'fixed',
          'icon not classified (no model answer and no person entry in icon-classes.json)'
        )
    } else {
      f.fixed = f.kind ? cls?.class === 'fixed' : null
      if (cls?.class === 'illustration') {
        f.faces = false
        f.classReason = why
      } else if (f.kind === 'photo' || f.kind === 'cutout') f.faces = null
    }
    if (!f.kind) missing(f.id, 'kind', 'the picture was not found shown in the block on any captured page')
    if (f.width == null) missing(f.id, 'width', 'the frame is not shown at desktop width')
    if (f.canHide == null)
      missing(
        f.id,
        'canHide',
        f.hideEvidence?.invalid
          ? 'emptying the frame and its painters changed no pixel in its box: the measurement is invalid'
          : 'the frame was never shown, so emptying it could not be shot'
      )
  }
  return { frames, demoIcons }
}
