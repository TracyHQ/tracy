// The fill plan (spec TracyHQ/tracy#132, ticket #133): the meeting point of a brief revision and a template's content
// map. For every slot it answers one decision with a reason code: a photo, the neutral substitute, keep the template's,
// skip it, or text (written by the copy path). Meaning first, then shape: the v3 slot role and group decide which
// photos qualify, then the slot's frame chooses among them. Pure and deterministic: ties break on ids.
//
// 🔒 AN OFFERING CARD TAKES ONLY A PHOTO LINKED TO ITS OWN OFFERING. Each offering group is locked to one offering of
// the brief's closed list; a photo the brief links to another offering, or to none ("general", unsure), never fills it.
// 🔒 A GENERAL SLOT TAKES ONLY A GENERAL OR UNSURE PHOTO: never one linked to an offering, never a portrait.
// 🔒 THE ROLE DECIDES KEEP (ADR 0040), never a name: a keep slot and every slot of a `demoOnly` entity stay as shipped.
// The slots that share one demo file are replaced together, so they form one unit: the strictest need among them wins.
import { keepDecisionOf } from './content-map-keep-decision.mjs'
import { LOGO_ROLES } from './place-content-roles.mjs'
import { closedListOf, focusOfBox, GENERAL } from './pictures/picture-links.mjs'
import { fitCrop, ROLES } from './pictures/placement.mjs'
import { declaredSize, fileOf } from './pictures/slot-map.mjs'

export const FILL_PLAN_VERSION = 'fill-plan/1'

/** Every reason code a slot decision carries, with the sentence a report shows for it. */
export const FILL_REASONS = Object.freeze({
  'offering-photo': "a photo the brief links to this card's offering",
  'general-photo': 'a general photo of the business',
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
  'conflicting-offerings': 'one demo picture is shared by cards of two offerings',
  'demo-size-unknown': "the demo picture's size is not known"
})

/** Why a photo was refused for a unit nothing filled, counted per reason. */
export const REFUSAL_REASONS = Object.freeze([
  'graphic',
  'wrong-offering',
  'unsure',
  'linked-to-offering',
  'portrait',
  'used',
  'shape'
])

/** Group kinds whose cards each show one offering. */
const OFFERING_GROUP_KINDS = new Set(['service', 'menu_item', 'package'])
/** Picture roles a general or unsure photo of the business may fill. */
const GENERAL_ROLES = new Set([
  'business.hero_image',
  'business.gallery_image',
  'editorial.illustration',
  'article.image'
])

const depictsOf = (asset) => asset?.depicts?.id ?? asset?.depicts ?? GENERAL
const portraitOf = (asset) => asset?.portraitOf?.id ?? asset?.portraitOf ?? null

/** What one image slot needs, before any photo is looked at: a reason code alone means it takes no brief photo. */
function needOf(slot, lockOf) {
  const role = slot.role
  if (role === 'offering.image') {
    const offering = slot.group?.id ? lockOf.get(slot.group.id) : null
    return offering ? { offering: offering.offeringId } : { reason: 'no-offering-for-group' }
  }
  if (GENERAL_ROLES.has(role)) return { general: true }
  if (role === 'person.image') return { reason: 'no-portrait' }
  return { reason: 'role-takes-no-brief-photo' }
}

/** The strictest need of a unit's slots: no photo > one offering > general. */
function unitNeed(needs) {
  const none = needs.find((n) => n.reason)
  if (none) return none
  const offerings = [...new Set(needs.filter((n) => n.offering).map((n) => n.offering))]
  if (offerings.length > 1) return { reason: 'conflicting-offerings' }
  return offerings.length ? { offering: offerings[0] } : { general: true }
}

/** Why `asset` cannot take a unit of `need`, or null when it qualifies by meaning. */
function refusalOf(asset, need) {
  if (asset.isGraphic === true || asset.content === 'logo') return 'graphic'
  const depicts = depictsOf(asset)
  if (need.offering) {
    if (depicts === need.offering) return null
    return depicts === GENERAL ? 'unsure' : 'wrong-offering'
  }
  if (depicts !== GENERAL) return 'linked-to-offering'
  return portraitOf(asset) ? 'portrait' : null
}

/**
 * @param {object} input
 * @param {{slots: any[], entities?: any[], roleVocabularyVersion?: string}} input.contentMap - a version 3 map
 * @param {{assets?: any[], reading?: any}} input.brief - the revision's brief: its assets carry `depicts` and `portraitOf`
 *   (`picture-links.mjs`), its reading the closed list of offerings
 * @param {Map<string, {width: number, height: number}>} [input.demo] - demo files as the site serves them, by file
 * @returns {{version: string, offerings: Array<{groupId: string, offeringId: string, label: string}>,
 *   slots: Array<{key: string, entity: string, type: string, role: string | null, groupId: string | null,
 *   action: 'photo' | 'substitute' | 'keep' | 'skip' | 'text', reason: string, file?: string, mediaId?: string,
 *   crop?: object, refused?: Record<string, number>}>, unused: string[]}}
 */
export function planFill({ contentMap, brief, demo = new Map() }) {
  const slots = contentMap?.slots ?? []
  const demoOnly = new Set((contentMap?.entities ?? []).filter((e) => e?.demoOnly === true).map((e) => e.key))
  const live = (slot) => !demoOnly.has(slot.entity) && keepDecisionOf(slot, contentMap) !== 'keep'

  // Each offering card (a group with `offering.*` slots; a membership tier's `package.*` is not one) is locked to one
  // offering of the brief, the brief's order against the content map's, the cards that show an offering photo first.
  const groupIds = []
  const pictured = new Set()
  for (const slot of slots) {
    if (!live(slot) || !OFFERING_GROUP_KINDS.has(slot.group?.kind) || !slot.role?.startsWith('offering.'))
      continue
    if (!groupIds.includes(slot.group.id)) groupIds.push(slot.group.id)
    if (slot.role === 'offering.image') pictured.add(slot.group.id)
  }
  groupIds.sort((a, b) => Number(pictured.has(b)) - Number(pictured.has(a)))
  const list = closedListOf(brief?.reading).offerings
  const offerings = groupIds
    .slice(0, list.length)
    .map((groupId, i) => ({ groupId, offeringId: list[i].id, label: list[i].label }))
  const lockOf = new Map(offerings.map((o) => [o.groupId, o]))

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
      const unit = units.get(file) ?? { file, slots: [], needs: [], frame: null }
      unit.slots.push(slot)
      unit.needs.push(needOf(slot, lockOf))
      unit.frame ??= demo.get(file) ?? slot.fit?.source ?? declaredSize(slot.sample)
      units.set(file, unit)
    }
  }

  const assets = [...(brief?.assets ?? [])]
    .filter((a) => a?.kind === 'image' && a.id && a.width && a.height)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const used = new Set()
  const hero = (u) => u.slots.some((s) => s.role === 'business.hero_image')
  const order = [...units.values()].map((u) => ({ ...u, need: unitNeed(u.needs) }))
  const rank = (u) => (u.need.offering ? 0 : hero(u) ? 1 : 2)
  order.sort((a, b) => rank(a) - rank(b))

  for (const unit of order) {
    const settle = (action, reason, extra = {}) => {
      for (const slot of unit.slots) decide(slot, action, reason, { file: unit.file, ...extra })
    }
    if (unit.need.reason) {
      settle('substitute', unit.need.reason)
      continue
    }
    if (!unit.frame?.width || !unit.frame?.height) {
      settle('substitute', 'demo-size-unknown')
      continue
    }
    const min = hero(unit) ? ROLES.hero.min : ROLES.section.min
    const refused = {}
    const fitting = []
    for (const asset of assets) {
      const why =
        refusalOf(asset, unit.need) ??
        (used.has(asset.id) ? 'used' : null) ??
        (fitCrop(asset, unit.frame, { min }) ? null : 'shape')
      if (why) refused[why] = (refused[why] ?? 0) + 1
      else fitting.push(asset)
    }
    const lossOf = (a) => {
      const { source } = fitCrop(a, unit.frame, { min })
      return 1 - (source.width * source.height) / (a.width * a.height)
    }
    fitting.sort(
      (a, b) =>
        lossOf(a) - lossOf(b) ||
        b.width * b.height - a.width * a.height ||
        String(a.id).localeCompare(String(b.id))
    )
    const best = fitting[0]
    if (!best) {
      settle('substitute', unit.need.offering ? 'no-photo-of-offering' : 'no-general-photo', { refused })
      continue
    }
    used.add(best.id)
    const focus = focusOfBox(best.subjectBox)
    const crop = fitCrop(best, unit.frame, { min, label: focus ? { focus } : {} })
    settle('photo', unit.need.offering ? 'offering-photo' : 'general-photo', { mediaId: best.id, crop })
  }

  return {
    version: FILL_PLAN_VERSION,
    offerings,
    slots: slots.map((s) => decisions.get(s.key)).filter(Boolean),
    unused: assets.filter((a) => !used.has(a.id)).map((a) => a.id)
  }
}
