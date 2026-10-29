// The fill plan (spec TracyHQ/tracy#132, ticket #133): the meeting point of a brief revision and a template's content
// map. For every slot it answers one decision with a reason code: a photo, the neutral substitute, keep the template's,
// skip it, or text (written by the copy path). Meaning first, then shape: the v3 slot role and group decide which
// photos qualify, then the slot's frame chooses among them. Pure and deterministic: ties break on ids.
//
// 🔒 AN OFFERING CARD TAKES ONLY A PHOTO LINKED TO ITS OWN OFFERING. A card's offering is the one of the brief's closed
// list its name says (the name the text path writes on it); a photo the brief links to another offering, or to none
// ("general", unsure), never fills it.
// 🔒 A GENERAL SLOT TAKES ANY OF THE BUSINESS'S OWN PHOTOGRAPHS, general or unsure ones first, then photos of its
// offerings; never a portrait. The rule is one-directional: an unsure photo never fills an offering card (#141).
// 🔒 A LOGO OR A DRAWING NEVER FILLS A PHOTO SLOT: a picture the brief marks as a logo, a graphic or not a photograph.
// 🔒 ONE PHOTO, ONCE A PAGE: a photo may serve several pages, never two pictures of the same page (the map's `pages`;
// an entity no page lists, an article, shares one page with the other entities of its kind).
// 🔒 A DEMO PICTURE CARDS OF TWO OFFERINGS SHARE NEVER HOLDS ONE OFFERING'S PHOTO: it shows on both cards, so it takes
// a general or unsure photo, else keeps the demo's. Cards of the same offering may share that offering's photo.
// 🔒 A LOW-QUALITY PHOTO RANKS LAST among those that qualify, and still fills a slot nothing better fits.
// 🔒 A WIDE GENERAL SLOT (a hero band) MAY CUT UP TO 70% OF A PHOTO, rather than keep the demo's, only around a labelled
// subject the crop holds whole with every face (`general-photo-wide-crop`).
// 🔒 ONLY A FACT PICTURE TAKES A SUBSTITUTE: a person, a quote's author, a proof or a signature with no fitting photo is
// drawn neutral; every other picture with no fitting photo keeps the template's demo picture (no grey box in a hero, a
// gallery or an article).
// 🔒 THE OWNER'S PHOTOS FIRST, AND A MAP PHOTO BY SOMEONE ELSE NEVER REPRESENTS THE BUSINESS (#135): among qualifying
// photos the business's own rank first; an identity slot (the hero, an about picture, a gallery's lead picture) refuses a
// photo someone else posted on a map listing, because it can show another venue.
// 🔒 THE ROLE DECIDES KEEP (ADR 0040), never a name: a keep slot and every slot of a `demoOnly` entity stay as shipped.
// The slots that share one demo file are replaced together, so they form one unit: the strictest need among them wins.
import { keepDecisionOf } from './content-map-keep-decision.mjs'
import { LOGO_ROLES } from './place-content-roles.mjs'
import { closedListOf, GENERAL, namedIn } from './pictures/picture-links.mjs'
import { avatarSubstitute } from './person-avatar.mjs'
import { showablePeopleOf } from './brief-people.mjs'
import { scriptSignature } from './neutral-signature.mjs'
import { isMapPhotoByOthers, publisherRankOf } from './pictures/asset-origin.mjs'
import { ROLES } from './pictures/placement.mjs'
import { declaredSize, fileOf } from './pictures/slot-map.mjs'
import { subjectCrop } from './pictures/subject-crop.mjs'

export const FILL_PLAN_VERSION = 'fill-plan/1'

/** Every reason code a slot decision carries, with the sentence a report shows for it. */
export const FILL_REASONS = Object.freeze({
  'offering-photo': "a photo the brief links to this card's offering",
  'person-portrait': 'the portrait of the person this card names',
  'general-photo': 'a general photo of the business',
  'general-photo-wide-crop':
    'a general photo of the business, cut wider than usual for a wide slot with its subject and faces whole',
  'role-keeps': "the slot's role keeps the template's content",
  'demo-only-entity': 'a style sample of the template (demo-only entity), never filled',
  'logo-own-door': "the business logo, written through the logo's own door",
  'text-by-copy': 'a text slot, written by the copy writer',
  'no-role': 'the slot has no role the vocabulary lists',
  'no-offering-for-group': 'the brief has no offering left for this card',
  'no-photo-of-offering': "no photo of this card's offering fits",
  'no-general-photo': 'no general photo of the business fits',
  'no-portrait': 'no portrait of a person the brief names',
  'role-takes-no-brief-photo': "the brief holds no photo this slot's role can take",
  'conflicting-offerings':
    'one demo picture is shared by cards of two offerings, and no general photo fits it',
  'conflicting-people': 'one demo picture is shared by cards of two people',
  'conflicting-needs': 'one demo picture is shared by a person card and an offering card',
  'demo-size-unknown': "the demo picture's size is not known"
})

/** Group kinds whose cards each show one offering. */
const OFFERING_GROUP_KINDS = new Set(['service', 'menu_item', 'package'])
/** Picture roles a general or unsure photo of the business may fill. */
const GENERAL_ROLES = new Set([
  'business.hero_image',
  'business.gallery_image',
  'editorial.illustration',
  'article.image'
])

/** Identity pictures: the ones that represent the business itself. A gallery's lead is decided per slot (`leadsOf`). */
const IDENTITY_ROLES = new Set(['business.hero_image', 'editorial.illustration'])

/** The reason a unit's decision carries, by the kind of its need: with a photo, and without one. */
const REASONS_BY_NEED = Object.freeze({
  person: { photo: 'person-portrait', none: 'no-portrait' },
  offering: { photo: 'offering-photo', none: 'no-photo-of-offering' },
  general: { photo: 'general-photo', none: 'no-general-photo' }
})
const needKind = (need) => (need.person ? 'person' : need.offering ? 'offering' : 'general')
/** A need as a key: the slots of one demo file with the same key form one unit when the plan decides per slot. */
const needKeyOf = (need) =>
  need.person
    ? `person:${need.person}`
    : need.offering
      ? `offering:${need.offering}`
      : need.reason
        ? `none:${need.reason}`
        : 'general'

/** Picture roles that state a fact about a person or a claim: with no fitting photo they take a neutral substitute. */
const FACT_PICTURE_ROLES = new Set(['person.image', 'quote.author_image', 'stat.proof_image'])
const isFactSlot = (slot) => FACT_PICTURE_ROLES.has(slot.role) || slot.fit?.kind === 'signature'

/**
 * Whether a unit is a claim picture (`stat.proof_image`, a strip of customer faces or badges beside a number) whose file
 * can be clear. With no brief picture it takes a blank: a colour block where faces stood reads as a broken picture.
 */
const proofStrip = (unit) =>
  unit.slots.some((s) => s.role === 'stat.proof_image') && /\.(png|webp|svg)$/i.test(String(unit.file ?? ''))

/**
 * Whether a photo carries words or graphic labels: the labeller saw words added on it, or called it a text graphic or a
 * poster. Such a photo is never a card, a thumbnail, a hero, a background or an offering picture.
 */
export const wordedPhoto = (asset) =>
  asset?.hasTextOverlay === true || asset?.content === 'text-graphic' || asset?.subject === 'poster'

/**
 * Whether a unit is a real gallery: every slot is a gallery tile in a gallery group that does not sit in an article. A
 * gallery group inside an article is a row of card thumbnails (a class, a related item), which is a card, not a gallery.
 * The only place a photo with words added on it (an event poster, a before/after label) may show, and only as the last
 * photo left.
 */
const galleryUnit = (unit, kindOf) =>
  unit.slots.every(
    (s) =>
      s.role === 'business.gallery_image' &&
      (s.group?.kind ?? 'gallery') === 'gallery' &&
      kindOf.get(s.entity) !== 'article'
  )

/** Whether a brief picture is not a photograph: a logo, a graphic, or one the labeller found is not a photo. */
const notAPhotograph = (asset) =>
  asset.isGraphic === true ||
  asset.isLogo === true ||
  asset.role === 'logo' ||
  asset.content === 'logo' ||
  asset.content === 'not_a_photograph' ||
  asset.unlabelledReason === 'not_a_photograph'

/**
 * The pages each entity is shown on, from the map's `pages` (a page's own entity and its assigned modules). An entity no
 * page lists shares one page with the other entities of its kind; a map with no pages is one page.
 * @returns {(entity: string) => string[]}
 */
export function pagesOfMap(contentMap) {
  const pages = contentMap?.pages ?? []
  if (!pages.length) return () => ['*']
  const on = new Map()
  for (const page of pages)
    for (const entity of [page.entity, ...(page.assignedModules ?? []).map((m) => m?.entity)])
      if (entity) on.set(entity, (on.get(entity) ?? new Set()).add(`page:${page.route ?? page.entity}`))
  const kindOf = new Map((contentMap.entities ?? []).map((e) => [e.key, e.kind]))
  return (entity) => (on.has(entity) ? [...on.get(entity)] : [`kind:${kindOf.get(entity) ?? entity}`])
}

/** The keys of the gallery pictures that lead their gallery: item 0 of a gallery group, else an entity's first one. */
function leadsOf(slots) {
  const out = new Set()
  const seen = new Set()
  for (const slot of slots) {
    if (slot.role !== 'business.gallery_image') continue
    const lead = slot.group?.kind === 'gallery' ? slot.group.item === 0 : !seen.has(slot.entity)
    seen.add(slot.entity)
    if (lead) out.add(slot.key)
  }
  return out
}

/** The brief's people as the signature builder reads them: name, and the role or relationship that says an owner. */
const signersOf = (reading) =>
  (reading?.team ?? [])
    .filter((p) => typeof p?.label === 'string' && p.reviewsOnly !== true)
    .map((p) => ({ id: p.id, value: { name: p.label, role: p.role, relationship: p.relationship } }))

/**
 * The substitute of a signature picture (Slot fit kind `signature`, #137): the signer's name in a script font sized to
 * the slot, or a blank picture when nobody can sign. Never the demo's hand, never a grey placeholder over a signature.
 */
function signatureSubstitute(slot, people) {
  const signed = scriptSignature({ people, fit: slot.fit })
  if (signed.state !== 'neutral') return { kind: 'blank', reason: signed.reason }
  const { text, svg, width, height, factRefs } = signed
  return { kind: 'script-signature', text, svg, width, height, factRefs }
}

const depictsOf = (asset) => asset?.depicts?.id ?? asset?.depicts ?? GENERAL
const hasFaces = (asset) => (asset?.faceBoxes?.length ?? 0) > 0 || (asset?.peopleCount ?? 0) > 0
const portraitOf = (asset) => asset?.portraitOf?.id ?? asset?.portraitOf ?? null

/**
 * The width a slot's picture is drawn at, the size it must stay sharp at (ADR 0039, consequence of 29/10/2026): the
 * desktop box its Slot fit measured, else its widest measured box, else the `minWidth` an unmeasured fit declares. Never
 * the demo file's own width: a 1920 px demo hero drawn 1440 px wide asks no brief photo for 1920 px.
 * @param {{fit?: {boxes?: Record<string, {width: number}>, minWidth?: number}}} slot
 */
export function shownWidthOf(slot) {
  const boxes = slot?.fit?.boxes && typeof slot.fit.boxes === 'object' ? slot.fit.boxes : {}
  const desktop = Number(boxes.desktop?.width)
  if (desktop > 0) return desktop
  const widest = Math.max(0, ...Object.values(boxes).map((b) => Number(b?.width) || 0))
  if (widest > 0) return widest
  return Number(slot?.fit?.minWidth)
}

/** What one image slot needs, before any photo is looked at: a reason code alone means it takes no brief photo. */
function needOf(slot, lockOf, peopleOf) {
  const role = slot.role
  if (role === 'offering.image') {
    const offering = slot.group?.id ? lockOf.get(slot.group.id) : null
    return offering ? { offering: offering.offeringId } : { reason: 'no-offering-for-group' }
  }
  if (GENERAL_ROLES.has(role)) return { general: true }
  if (role === 'person.image') {
    const person = slot.group?.id ? peopleOf.get(slot.group.id) : null
    return person ? { person: person.personId } : { reason: 'no-portrait' }
  }
  return { reason: 'role-takes-no-brief-photo' }
}

/**
 * The strictest need of a unit's slots: no photo > one person > one offering > general. A demo picture that shows on cards
 * of two offerings, or on a card of an offering and one the brief has no offering for, may only take a general photo:
 * any offering's photo would be wrong on the other card (#141).
 */
function unitNeed(needs) {
  const offerings = [...new Set(needs.filter((n) => n.offering).map((n) => n.offering))]
  const unnamed = needs.some((n) => n.reason === 'no-offering-for-group')
  if (offerings.length > 1 || (offerings.length && unnamed)) {
    const other = needs.find((n) => n.reason && n.reason !== 'no-offering-for-group')
    return other ?? { general: true, shared: true }
  }
  const none = needs.find((n) => n.reason)
  if (none) return none
  const people = [...new Set(needs.filter((n) => n.person).map((n) => n.person))]
  if (people.length && offerings.length) return { reason: 'conflicting-needs' }
  if (people.length > 1) return { reason: 'conflicting-people' }
  if (people.length) return { person: people[0] }
  return offerings.length ? { offering: offerings[0] } : { general: true }
}

/** Why `asset` cannot take a unit of `need`, or null when it qualifies by meaning. */
function refusalOf(asset, need) {
  if (notAPhotograph(asset)) return 'not-a-photograph'
  const depicts = depictsOf(asset)
  if (need.person) {
    const of = portraitOf(asset)
    if (of === need.person) return null
    if (of) return 'portrait-of-another'
    // 🔒 A STRANGER'S FACE NEVER FILLS A PERSON SLOT: a face the brief links to nobody is refused by name.
    return hasFaces(asset) ? 'face-not-linked' : 'not-a-portrait'
  }
  if (need.offering) {
    if (depicts === need.offering) return null
    return depicts === GENERAL ? 'unsure' : 'wrong-offering'
  }
  if (need.shared && depicts !== GENERAL) return 'linked-to-offering'
  return portraitOf(asset) ? 'portrait' : null
}

/** The aspect at and past which a general slot is a wide band (a hero): it may take a wider crop (`WIDE_MAX_LOSS`). */
const WIDE_ASPECT = 1.6

/**
 * @param {object} input
 * @param {{slots: any[], entities?: any[], roleVocabularyVersion?: string}} input.contentMap - a version 3 map
 * @param {{assets?: any[], reading?: any}} input.brief - the revision's brief: its assets carry `depicts` and `portraitOf`
 *   (`picture-links.mjs`), its reading the closed list of offerings
 * @param {Map<string, {width: number, height: number}>} [input.demo] - demo files as the site serves them, by file
 * @param {Record<string, string>} [input.cardNames] - the name the text path writes on each offering card, by group id
 *   (`cardNamesOf`): the one decider of which offering a card shows, for its words and its photo alike
 * @param {boolean} [input.perSlot] - slots that share one demo file are decided apart when their needs differ (spec #189,
 *   ticket #194): each need is its own unit, and each decision names its `unit`, so a writer that uploads one file per
 *   unit gives each slot its own picture. Off by default for the writers that still write one file per demo file.
 * @param {Map<string, Set<string>>} [input.unsharp] - per slot key, the photos the sharpness gate measured too soft for
 *   it once cut and shown (`photo-sharpness.js`): refused there as `unsharp`, so the next photo of the ranking is met
 * @returns {{version: string, offerings: Array<{groupId: string, offeringId: string, label: string}>,
 *   people: Array<{groupId: string, personId: string, label: string}>,
 *   slots: Array<{key: string, entity: string, type: string, role: string | null, groupId: string | null,
 *   action: 'photo' | 'substitute' | 'keep' | 'skip' | 'text', reason: string, file?: string, mediaId?: string,
 *   crop?: object, refused?: Record<string, number>}>, unused: string[]}}
 */
export function planFill({
  contentMap,
  brief,
  demo = new Map(),
  cardNames = {},
  perSlot = false,
  unsharp = new Map()
}) {
  const slots = contentMap?.slots ?? []
  const demoOnly = new Set((contentMap?.entities ?? []).filter((e) => e?.demoOnly === true).map((e) => e.key))
  const live = (slot) => !demoOnly.has(slot.entity) && keepDecisionOf(slot, contentMap) !== 'keep'

  // 🔒 A CARD'S NAME AND ITS PHOTO COME FROM ONE DECIDER: the text path names each offering card (`cardNames`), and the
  // card takes the brief offering its name says. A card whose name is unknown or names no offering is never guessed.
  const list = closedListOf(brief?.reading).offerings
  const offerings = []
  for (const slot of slots) {
    const groupId = slot.group?.id
    if (!live(slot) || !OFFERING_GROUP_KINDS.has(slot.group?.kind) || !slot.role?.startsWith('offering.'))
      continue
    if (offerings.some((o) => o.groupId === groupId) || typeof cardNames[groupId] !== 'string') continue
    const hit = namedIn(cardNames[groupId], list)
    if (hit) offerings.push({ groupId, offeringId: hit.id, label: hit.label })
  }
  const lockOf = new Map(offerings.map((o) => [o.groupId, o]))
  // A person card takes the brief person its name says, by the same decider as an offering card.
  // The people the site may show, a person only reviews name with a role included (`brief-people.mjs`).
  const shownIds = new Set(showablePeopleOf(brief).map((p) => p.id))
  const team = (brief?.reading?.team ?? [])
    .filter((p) => shownIds.has(p?.id))
    .map((p) => ({ id: p.id, label: p.label }))
  const peopleOf = new Map()
  for (const slot of slots) {
    const groupId = slot.group?.id
    if (!live(slot) || slot.group?.kind !== 'person' || peopleOf.has(groupId)) continue
    const hit = typeof cardNames[groupId] === 'string' ? namedIn(cardNames[groupId], team) : null
    if (hit) peopleOf.set(groupId, { personId: hit.id, label: hit.label })
  }
  const personById = new Map([...peopleOf.values()].map((p) => [p.personId, p]))

  /** @type {Map<string, any>} */
  const decisions = new Map()
  const decide = (slot, action, reason, extra = {}) =>
    decisions.set(slot.key, {
      key: slot.key,
      entity: slot.entity,
      type: slot.type,
      role: slot.role ?? null,
      groupId: slot.group?.id ?? null,
      action,
      reason,
      ...extra
    })

  // The units: the replaceable image slots of one demo file, in content-map order.
  /** @type {Map<string, {file: string, slots: any[], needs: any[], frame: any}>} */
  const units = new Map()
  for (const slot of slots) {
    if (demoOnly.has(slot.entity)) decide(slot, 'skip', 'demo-only-entity')
    else if (keepDecisionOf(slot, contentMap) === 'keep') decide(slot, 'keep', 'role-keeps')
    else if (keepDecisionOf(slot, contentMap) === null) decide(slot, 'skip', 'no-role')
    else if (slot.type !== 'image') decide(slot, 'text', 'text-by-copy')
    else if (LOGO_ROLES.includes(slot.role)) decide(slot, 'skip', 'logo-own-door')
    else {
      const file = fileOf(slot.sample)
      const need = needOf(slot, lockOf, peopleOf)
      // Per slot (#194): one unit per need of the file, so cards of two offerings no longer wait on each other.
      const key = perSlot ? `${file}#${needKeyOf(need)}` : file
      const unit = units.get(key) ?? { file, key, slots: [], needs: [], frame: null }
      unit.slots.push(slot)
      unit.needs.push(need)
      unit.frame ??= demo.get(file) ?? slot.fit?.source ?? declaredSize(slot.sample)
      units.set(key, unit)
    }
  }

  const entityKindOf = new Map((contentMap?.entities ?? []).map((e) => [e.key, e.kind]))
  const assets = [...(brief?.assets ?? [])]
    .filter((a) => a?.kind === 'image' && a.id && a.width && a.height)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  // Which photos each page already shows: a photo serves once a page (#141).
  const pagesOf = pagesOfMap(contentMap)
  const shownOn = new Map()
  const usedAnywhere = new Set()
  const hero = (u) => u.slots.some((s) => s.role === 'business.hero_image')
  const leads = leadsOf(slots)
  const identity = (u) => u.slots.some((s) => IDENTITY_ROLES.has(s.role) || leads.has(s.key))
  const order = [...units.values()].map((u) => ({ ...u, need: unitNeed(u.needs) }))
  // Specific cards choose first, then the hero, then the other identity pictures, so they meet the owner's photos first.
  const rank = (u) => (u.need.offering || u.need.person ? 0 : hero(u) ? 1 : identity(u) ? 2 : 3)
  order.sort((a, b) => rank(a) - rank(b))

  for (const unit of order) {
    const pages = [...new Set(unit.slots.flatMap((s) => pagesOf(s.entity)))]
    const settle = (decided, reason, extra = {}) => {
      // Only a fact picture takes a substitute; any other picture with no fitting photo keeps the demo's (#141).
      const action = decided === 'substitute' && !unit.slots.some(isFactSlot) ? 'keep' : decided
      // A person picture with no portrait shows the person's initials (ticket #134), in the frame of the slot.
      const signature = unit.slots.find((s) => s.fit?.kind === 'signature')
      const substitute =
        action !== 'substitute'
          ? {}
          : signature
            ? { substitute: signatureSubstitute(signature, signersOf(brief?.reading)) }
            : unit.slots.some((s) => s.role === 'person.image')
              ? { substitute: avatarSubstitute(personById.get(unit.need.person) ?? null, unit.frame) }
              : proofStrip(unit)
                ? { substitute: { kind: 'blank', reason: 'no-proof-picture' } }
                : {}
      for (const slot of unit.slots)
        decide(slot, action, reason, {
          file: unit.file,
          ...(perSlot ? { unit: unit.key } : {}),
          ...extra,
          ...substitute
        })
    }
    if (unit.need.reason) {
      settle('substitute', unit.need.reason)
      continue
    }
    if (!unit.frame?.width || !unit.frame?.height) {
      settle('substitute', 'demo-size-unknown')
      continue
    }
    // The slot's minimum width: the widest box it is drawn in (`shownWidthOf`) among the unit's slots, else the role's
    // target. A photo may still be enlarged by `MAX_SCALE` to reach it (`subjectCrop`).
    const declared = unit.slots.map(shownWidthOf).filter((n) => Number.isFinite(n) && n > 0)
    const min = declared.length ? Math.max(...declared) : hero(unit) ? ROLES.hero.min : ROLES.section.min
    // A card's own offering or person is a match: its photo may lose more of itself to the crop (#136).
    const matches = Boolean(unit.need.offering || unit.need.person)
    // Every photo that qualifies, with its crop; a wide general slot looks again with the wider crop when none does.
    const candidates = (wide) => {
      const refused = {}
      const fitting = []
      const crops = new Map()
      for (const asset of assets) {
        let why =
          refusalOf(asset, unit.need) ??
          (identity(unit) && isMapPhotoByOthers(asset) ? 'map-photo-by-others' : null) ??
          (pages.some((page) => shownOn.get(page)?.has(asset.id)) ? 'used' : null) ??
          (wordedPhoto(asset) && !galleryUnit(unit, entityKindOf) ? 'words-on-photo' : null) ??
          (unit.slots.some((slot) => unsharp.get(slot.key)?.has(asset.id)) ? 'unsharp' : null)
        if (!why) {
          const cut = subjectCrop(asset, unit.frame, { min, matches, wide })
          if (cut.refused) why = cut.refused
          else crops.set(asset.id, cut.crop)
        }
        if (why) refused[why] = (refused[why] ?? 0) + 1
        else fitting.push(asset)
      }
      return { refused, fitting, crops }
    }
    let { refused, fitting, crops } = candidates(false)
    const wideSlot = unit.need.general && unit.frame.width / unit.frame.height >= WIDE_ASPECT
    if (!fitting.length && wideSlot) ({ refused, fitting, crops } = candidates(true))
    const lossOf = (a) => {
      const { source } = crops.get(a.id)
      return 1 - (source.width * source.height) / (a.width * a.height)
    }
    // A general slot meets the general and unsure photos first, then the photos of the offerings.
    const offeringPhoto = (a) => (unit.need.general && depictsOf(a) !== GENERAL ? 1 : 0)
    const lowQuality = (a) => (a.quality === 'low' ? 1 : 0)
    // A gallery takes a photo with words added on it only when no clean photo is left.
    const worded = (a) => (wordedPhoto(a) ? 1 : 0)
    fitting.sort(
      (a, b) =>
        worded(a) - worded(b) ||
        offeringPhoto(a) - offeringPhoto(b) ||
        publisherRankOf(a) - publisherRankOf(b) ||
        lowQuality(a) - lowQuality(b) ||
        lossOf(a) - lossOf(b) ||
        b.width * b.height - a.width * a.height ||
        String(a.id).localeCompare(String(b.id))
    )
    const best = fitting[0]
    if (!best) {
      const none = unit.need.shared ? 'conflicting-offerings' : REASONS_BY_NEED[needKind(unit.need)].none
      settle('substitute', none, { refused })
      continue
    }
    usedAnywhere.add(best.id)
    for (const page of pages) shownOn.set(page, (shownOn.get(page) ?? new Set()).add(best.id))
    const crop = crops.get(best.id)
    const reason = crop.loosened ? 'general-photo-wide-crop' : REASONS_BY_NEED[needKind(unit.need)].photo
    settle('photo', reason, { mediaId: best.id, crop })
  }

  return {
    version: FILL_PLAN_VERSION,
    offerings,
    people: [...peopleOf].map(([groupId, p]) => ({ groupId, personId: p.personId, label: p.label })),
    slots: slots.map((s) => decisions.get(s.key)).filter(Boolean),
    unused: assets.filter((a) => !usedAnywhere.has(a.id)).map((a) => a.id)
  }
}

/** The text roles that name a card: an offering's and a person's. */
const NAME_ROLES = new Set(['offering.name', 'person.name'])

/**
 * The name the text path writes on each offering or person card: the sourced `offering.name` or `person.name` pin of
 * each group (copy pins, `slotFillPins`), by group id. A placeholder (a neutral name) names nothing, so its card takes no
 * offering photo and no portrait.
 * @param {{slots?: any[]}} contentMap
 * @param {{pins?: Record<string, string>, sources?: Record<string, string>} | null | undefined} copy
 * @returns {Record<string, string>}
 */
export function cardNamesOf(contentMap, copy) {
  const out = {}
  for (const slot of contentMap?.slots ?? []) {
    const name = copy?.pins?.[slot.key]
    if (!NAME_ROLES.has(slot.role) || !slot.group?.id || typeof name !== 'string' || !name.trim()) continue
    if (copy?.sources?.[slot.key] === 'placeholder') continue
    out[slot.group.id] ??= name
  }
  return out
}
