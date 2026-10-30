// Drawn pictures in the fill plan (spec TracyHQ/tracy#189, ticket #194): a picture slot no brief photo fits gets a picture
// drawn from the owner's own photos instead of the template's demo picture. Pure and deterministic: it plans the drawings
// (which slot, which mode, from which photos, for which subject) and never calls a model; the engine draws them.
//
// 🔒 ONE RULE: every picture slot the fill plan leaves on the demo picture because no brief photo fits is drawn, except
// the slots that are never drawn (a person, a logo, a fact picture, a keep slot, a slot of a demo-only entity). Those keep
// the fill plan's own decision.
// 🔒 OUTPAINT FIRST, SCENE SECOND, NEVER FROM WORDS ALONE: one owner photo of the slot's subject extended to the slot's
// shape when it covers enough of the frame; else a scene drawn with up to four owner photos as references; with no photo
// to start from, the slot takes a brand colour block in its frame (a neutral substitute), never the demo's subject.
// 🔒 THE SUBJECT COMES FROM THE SLOT: an offering card is drawn as its offering (its own photos first), any other slot as
// the business's place (its general photos first). A photo someone else posted on a map listing is never a reference.
// 🔒 REUSE AND CAP: a drawing serves every slot of the same subject and a close shape on other pages, never two slots of
// one page; at most `DRAW_CAP` drawings per build, the home page first, then the largest slot. A slot past the cap takes
// the brand colour block.
// 🔒 COPY FIRST, THEN PICTURES (#189, site build rule 2): every drawing is told its page's topic, the copy written next
// to its frame and the frame's place (role and shape). A frame of a page about one offering is drawn as that offering and
// is reused only for the same record, never on another record's page.
// 🔒 ONLY WHAT THE SITE SHOWS: a slot on no page the site keeps (a demo post the tidy-up takes off) is never drawn and
// never counts toward the cap, so the cap is spent on pictures a visitor sees.
import { pagesOfMap, shownWidthOf, wordedPhoto } from './fill-plan.mjs'
import { isMapPhotoByOthers, publisherRankOf } from './pictures/asset-origin.mjs'
import { GENERAL } from './pictures/picture-links.mjs'
import { declaredSize, fileOf } from './pictures/slot-map.mjs'
import { nearbyCopyOf, pageTopicsOf } from './pictures/nearby-copy.mjs'

export const DRAW_PLAN_VERSION = 'fill-draw/1'
/** The most pictures one build draws (each is a paid model call, retried at most once). */
export const DRAW_CAP = 20
/** An extension keeps the real photo whole: it must cover at least this share of the new frame's width. */
const OUTPAINT_MIN_SHARE = 0.3
/** The most references a scene is drawn with. */
const SCENE_REFERENCES = 4
/** How far two slots' shapes may differ, relative, for one drawing to serve both (each is cut to its own shape). */
const REUSE_ASPECT = 0.12
const HOME_ROUTES = new Set(['home', 'homepage'])

/** Every reason code a drawing decision carries, with the sentence a report shows for it. */
export const DRAW_REASONS = Object.freeze({
  'drawn-outpaint': "no brief photo fits this slot, so one of the owner's photos is extended to its shape",
  'drawn-scene': "no brief photo fits this slot, so a picture is drawn in the style of the owner's photos",
  'drawn-reused': 'a picture drawn for the same subject and shape on another page',
  'no-reference-photo':
    'no brief photo fits this slot and the owner has no photo to draw from, so a brand colour block fills its frame',
  'drawing-cap': 'this build drew as many pictures as it may, so a brand colour block fills the frame'
})

/** Fill reasons that mean "no brief photo fits": the slot would keep the demo's picture. */
const DRAWABLE_REASONS = new Set([
  'no-photo-of-offering',
  'no-general-photo',
  'no-offering-for-group',
  'conflicting-offerings',
  'role-takes-no-brief-photo'
])
/** Picture roles never drawn: a person, a logo, a fact. */
const NEVER_DRAWN_ROLES = new Set([
  'person.image',
  'quote.author_image',
  'stat.proof_image',
  'business.logo',
  'business.logo_light',
  'business.logo_dark'
])

const notAPhotograph = (a) =>
  a.isGraphic === true ||
  a.isLogo === true ||
  a.role === 'logo' ||
  a.content === 'logo' ||
  a.content === 'text-graphic' ||
  a.content === 'not_a_photograph' ||
  a.unlabelledReason === 'not_a_photograph'
const depictsOf = (a) => a?.depicts?.id ?? a?.depicts ?? GENERAL
const portraitOf = (a) => a?.portraitOf?.id ?? a?.portraitOf ?? null

/**
 * The shape a site holds a slot to, as the Claude Cowork plugin reads it (`SlotFit::referenceAspect`): a measured slot
 * that crops (`cover`) is held to its desktop box (`fit.aspect`), which is often not the demo file's shape (a 1920 x 960
 * hero file in a 1440 x 960 box). Null when the slot names none, and the demo file's shape decides.
 */
export function fitAspectOf(slot) {
  const fit = slot?.fit
  if (fit?.measured !== true || fit.crop === 'contain' || fit.crop === 'none') return null
  return typeof fit.aspect === 'number' && fit.aspect > 0 ? fit.aspect : null
}

/**
 * What a drawing is told about the business, from the brief alone: its name, its kind (the sub-trade's id, else the
 * trade) and up to three of its key messages. A model drawing for a business it knows only as "a fitness" draws a stock
 * gym; told who it serves and how, it draws that business at work.
 */
export function drawingFactsOf(brief) {
  const sub = brief?.business?.subTrade
  const category =
    (typeof sub === 'string' ? sub : typeof sub?.id === 'string' ? sub.id : null) ??
    (typeof brief?.business?.trade === 'string' ? brief.business.trade : null)
  const messages = (brief?.keyMessages ?? [])
    .map((m) => (typeof m?.label === 'string' ? m.label.trim() : ''))
    .filter(Boolean)
    .slice(0, 3)
  const name = typeof brief?.business?.name === 'string' ? brief.business.name.trim() : ''
  return { category, about: [name, ...messages].filter(Boolean).join('; ') || null }
}

/** Whether a fill decision is one a drawing replaces. */
function drawable(decision, slot) {
  if (decision.type !== 'image' || decision.action !== 'keep') return false
  if (!DRAWABLE_REASONS.has(decision.reason)) return false
  if (NEVER_DRAWN_ROLES.has(decision.role) || slot?.fit?.kind === 'signature') return false
  // A cut-out or an icon is decided by its own plan (`decor-plan.mjs`).
  return !['cutout', 'icon', 'decoration', 'avatar', 'avatar-group', 'map', 'logo'].includes(slot?.fit?.kind)
}

/**
 * @param {object} input
 * @param {ReturnType<import('./fill-plan.mjs').planFill>} input.fill - the fill plan
 * @param {{slots: any[], pages?: any[], entities?: any[]}} input.contentMap
 * @param {{assets?: any[], business?: {name?: string, trade?: string, subTrade?: string | {id?: string}},
 *   keyMessages?: Array<{label?: string}>, brand?: {logo?: string | null}}} input.brief
 * @param {Map<string, {width: number, height: number}>} [input.demo] - demo files as the site serves them
 * @param {number} [input.max]
 * @param {Map<string, Set<string>>} [input.unsharp] - per slot key, the owner photos the sharpness gate refused for
 *   it: never extended into that slot (an extension keeps the photo whole, softness and all); still a scene's reference
 * @param {Set<string>} [input.onSite] - the keys of the slots on a page the site keeps (the slot map's occurrences);
 *   when given, every other slot is left as the fill plan decided it
 * @param {Record<string, string> | null} [input.written] - the words the build writes, by slot key: a record page's
 *   drawing is told the copy next to its frame
 * @returns {{version: string, slots: any[], drawings: Array<{id: string, mode: 'outpaint' | 'scene', sourceId?: string,
 *   referenceIds: string[], aspect: number, subject: {kind: 'offering' | 'venue', id?: string, label?: string,
 *   category: string | null, about?: string, record?: true, topic?: string, near?: string,
 *   placement?: {role: string, frame: string}},
 *   keys: string[]}>, capped: number}}
 */
export function planDrawings({
  fill,
  contentMap,
  brief,
  demo = new Map(),
  max = DRAW_CAP,
  onSite = null,
  unsharp = new Map(),
  written = null
}) {
  const near = nearbyCopyOf(contentMap, written)
  const topics = pageTopicsOf(contentMap, written)
  const recordOf = new Map((fill.records ?? []).map((r) => [r.offeringId, r]))
  const slotOf = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  const offeringOf = new Map((fill.offerings ?? []).map((o) => [o.groupId, o]))
  const pagesOf = pagesOfMap(contentMap)
  const home = new Set(
    (contentMap?.pages ?? [])
      .filter((p) => p.home === true || HOME_ROUTES.has(String(p.route ?? '')))
      .map((p) => `page:${p.route ?? p.entity}`)
  )
  const { category, about } = drawingFactsOf(brief)
  const told = about ? { about } : {}
  const owners = [...(brief?.assets ?? [])]
    .filter((a) => a?.kind === 'image' && a.id && a.width && a.height)
    // The brief's own logo is a mark, never a scene to extend or to draw from, whatever its labels say.
    .filter((a) => a.id !== brief?.brand?.logo)
    // A photo with words added on it is never extended or copied: the words would come along.
    .filter((a) => !notAPhotograph(a) && !portraitOf(a) && !isMapPhotoByOthers(a) && !wordedPhoto(a))
    .sort(
      (a, b) =>
        publisherRankOf(a) - publisherRankOf(b) ||
        (a.quality === 'low') - (b.quality === 'low') ||
        b.width * b.height - a.width * a.height ||
        String(a.id).localeCompare(String(b.id))
    )
  // Which photos each page already shows: an extension of one of them would repeat it.
  const shownOn = new Map()
  for (const d of fill.slots)
    if (d.action === 'photo' && d.mediaId)
      for (const page of pagesOf(d.entity)) shownOn.set(page, (shownOn.get(page) ?? new Set()).add(d.mediaId))

  const candidates = []
  for (const d of fill.slots) {
    const slot = slotOf.get(d.key)
    if (!drawable(d, slot)) continue
    if (onSite && !onSite.has(d.key)) continue
    const file = d.file ?? fileOf(slot?.sample)
    const frame = demo.get(file) ?? slot?.fit?.source ?? declaredSize(slot?.sample)
    if (!frame?.width || !frame?.height) continue
    const aspect = fitAspectOf(slot) ?? frame.width / frame.height
    const record = d.record ? recordOf.get(d.record) : null
    const offering = (d.groupId ? offeringOf.get(d.groupId) : null) ?? record
    // Copy first (#189): every drawing is told its page's topic, the copy written next to its frame and where the frame
    // sits (its role and shape); a record page's drawing is its record's. Nothing when no words were planned.
    const placed = written
      ? {
          ...(record ? { record: true } : {}),
          ...(topics.get(d.entity) ? { topic: topics.get(d.entity) } : {}),
          ...(near.get(d.key) ? { near: near.get(d.key) } : {}),
          placement: { role: d.role, frame: aspect >= 1.6 ? 'wide band' : aspect <= 0.8 ? 'tall' : 'card' }
        }
      : {}
    const pages = pagesOf(d.entity)
    const width = shownWidthOf(slot) || frame.width
    candidates.push({
      d,
      aspect,
      pages,
      subject: offering
        ? { kind: 'offering', id: offering.offeringId, label: offering.label, category, ...told, ...placed }
        : { kind: 'venue', category, ...told, ...placed },
      onHome: pages.some((p) => home.has(p)) ? 0 : 1,
      // The widest shown first: a band across the page before a tile beside others.
      width
    })
  }
  candidates.sort(
    (a, b) => a.onHome - b.onHome || b.width - a.width || String(a.d.key).localeCompare(String(b.d.key))
  )

  const drawings = []
  const decided = new Map()
  let capped = 0
  const subjectKey = (s) => (s.kind === 'offering' ? `offering:${s.id}` : 'venue')
  for (const c of candidates) {
    const key = subjectKey(c.subject)
    // Reuse: the same subject, a close shape, and none of its slots on this slot's pages.
    const reuse = drawings.find(
      (g) =>
        subjectKey(g.subject) === key &&
        Math.abs(g.aspect - c.aspect) / c.aspect <= REUSE_ASPECT &&
        !g.pages.some((p) => c.pages.includes(p))
    )
    if (reuse) {
      reuse.keys.push(c.d.key)
      reuse.pages.push(...c.pages)
      decided.set(c.d.key, { action: 'draw', reason: 'drawn-reused', drawing: reuse.id, aspect: c.aspect })
      continue
    }
    const ofSubject = (a) => (c.subject.kind === 'offering' ? depictsOf(a) === c.subject.id : true)
    // A place is drawn from its general photos first, an offering from its own photos only for an extension.
    const generalFirst = (a) => (c.subject.kind === 'venue' && depictsOf(a) !== GENERAL ? 1 : 0)
    const shownHere = (a) => c.pages.some((p) => shownOn.get(p)?.has(a.id))
    const extended = new Set(
      drawings.filter((g) => g.pages.some((p) => c.pages.includes(p))).map((g) => g.sourceId)
    )
    const source = owners
      .filter((a) => ofSubject(a) && !shownHere(a) && !extended.has(a.id))
      .filter((a) => !unsharp.get(c.d.key)?.has(a.id))
      .filter((a) => a.width / a.height / c.aspect >= OUTPAINT_MIN_SHARE)
      .sort((a, b) => generalFirst(a) - generalFirst(b))[0]
    const offeringFirst = (a) => (c.subject.kind === 'offering' && depictsOf(a) === c.subject.id ? 0 : 1)
    const references = source
      ? [source.id]
      : owners
          .filter(
            (a) => c.subject.kind === 'venue' || depictsOf(a) === c.subject.id || depictsOf(a) === GENERAL
          )
          .sort((a, b) => offeringFirst(a) - offeringFirst(b) || generalFirst(a) - generalFirst(b))
          .slice(0, SCENE_REFERENCES)
          .map((a) => a.id)
    if (references.length === 0) {
      decided.set(c.d.key, colourBlock('no-reference-photo'))
      continue
    }
    if (drawings.length >= max) {
      capped += 1
      decided.set(c.d.key, colourBlock('drawing-cap'))
      continue
    }
    const variant = drawings.filter((g) => subjectKey(g.subject) === key).length
    const drawing = {
      id: `draw-${drawings.length + 1}`,
      mode: /** @type {'outpaint' | 'scene'} */ (source ? 'outpaint' : 'scene'),
      ...(source ? { sourceId: source.id } : {}),
      referenceIds: references,
      aspect: Number(c.aspect.toFixed(4)),
      subject: c.subject,
      variant,
      keys: [c.d.key],
      pages: [...c.pages]
    }
    drawings.push(drawing)
    decided.set(c.d.key, {
      action: 'draw',
      reason: source ? 'drawn-outpaint' : 'drawn-scene',
      drawing: drawing.id,
      aspect: c.aspect
    })
  }
  return {
    version: DRAW_PLAN_VERSION,
    slots: fill.slots.map((d) => (decided.has(d.key) ? { ...d, ...decided.get(d.key) } : d)),
    drawings: drawings.map(({ pages: _pages, ...g }) => g),
    capped
  }
}

/** A brand colour block in the slot's frame: the neutral substitute of a picture nothing can be drawn for. */
const colourBlock = (reason) => ({ action: 'substitute', reason, substitute: { kind: 'brand-colour' } })

/**
 * The drawn-picture content rule: refuse lettering, accept people and faces in every slot. Owner photos use planFill's
 * separate eligibility and face-safe crop rules; this verdict never changes them.
 * @param {Record<string, any> | null | undefined} labels - the labeller's labels of the drawing, null when it gave none
 *   (then the drawing is refused: `labeller-unavailable`)
 * @returns {{ok: boolean, reason: string | null}}
 */
export function drawnPictureVerdict(labels) {
  // A drawing nobody looked at is never shown: no labeller answer, no picture (#194).
  if (!labels) return { ok: false, reason: 'labeller-unavailable' }
  if (
    labels.textPresence === 'present' ||
    labels.hasTextOverlay === true ||
    labels.content === 'text-graphic'
  )
    return { ok: false, reason: 'text-found' }
  return { ok: true, reason: null }
}
