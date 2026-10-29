// The site plan (spec TracyHQ/tracy#189, ticket #191): what a brief build writes, decided once from a brief revision, the
// Site questions the template's create door serves and the template's content map. It grows out of the fill plan (#132):
// the fill plan decides the picture and text slots, the site plan adds the brand, every contact fact with the link it is
// written with, and which pages stay. Every decision carries a reason code. Pure and deterministic: no model, no site,
// no clock (the caller passes `now`), and the inputs are never changed.
//
// 🔒 A PAGE THE BUSINESS HAS DATA FOR STAYS: the Contact page is kept whenever the brief holds a contact fact
// (`page-plan.mjs`, `CONTACT_FACTS_WHY`).
// 🔒 A CONTACT FACT IS WRITTEN WITH ITS OWN LINK: a phone as `tel:`, an email as `mailto:`, WhatsApp as `https://wa.me/`.
// A fact the brief does not hold is absent, never invented; the engine then removes the demo's (`demo-leftovers.mjs`
// reports what is still there).
//
// Later slices add records (keep, hide), showcase removal, aliases, logo and colours here, each with its reason code.
import { pictureDecisionsOf } from './site-plan-pictures.mjs'
import { CONTACT_FACTS_WHY } from './page-plan.mjs'
import { answersFromBrief, contactFacts } from './site-answers.mjs'
import { IDENTITY_REASONS, planIdentity } from './site-plan-identity.mjs'
import { planOutsideMap } from './outside-map.mjs'
import { HONESTY_REASONS, planHonesty } from './site-plan-honesty.mjs'

export const SITE_PLAN_VERSION = 'site-plan/1'

/** Every reason code a site plan decision carries, with the sentence a report shows for it. */
export const SITE_PLAN_REASONS = Object.freeze({
  'brief-name': 'the business name the brief holds',
  'brief-about': 'the one line about the business the brief holds',
  'brief-voice': 'the tone the brief observed in the business’s own words',
  'contact-facts': 'the business gave contact details, so its Contact page stays',
  'home-page': 'the home page',
  'template-page': 'a page of the template the business has content for',
  'showcase-page': 'a sample page the template ships to show its features',
  'no-data': 'the brief holds nothing for this page',
  'contact-fact': 'a contact fact the brief holds',
  'business-name': 'the business name the brief holds',
  ...IDENTITY_REASONS,
  ...HONESTY_REASONS
})

/** Text slot roles a contact fact fills as it stands: the fact's kind by role. */
const CONTACT_ROLES = Object.freeze({
  'contact.phone': 'phone',
  'contact.email': 'email',
  'contact.address': 'address',
  'contact.hours': 'hours'
})

/** The digits of a number, a leading `+` kept when it had one. */
function dialable(value) {
  const digits = String(value).replace(/\D+/g, '')
  return /^\s*\(?\+/.test(String(value)) ? `+${digits}` : digits
}

/** The link a contact fact is written with, or none for a fact that is no link (an address, the hours). */
function hrefOf(kind, value) {
  if (kind === 'phone') return `tel:${dialable(value)}`
  if (kind === 'email') return `mailto:${value}`
  if (kind === 'whatsapp') return `https://wa.me/${String(value).replace(/\D+/g, '')}`
  return null
}

/** Every contact fact of the brief, each with its source and, for a phone, an email or WhatsApp, its link. */
function contactOfBrief(facts) {
  const out = {}
  for (const [kind, fact] of Object.entries(facts)) {
    const href = hrefOf(kind, fact.value)
    out[kind] = { value: fact.value, ...(href ? { href } : {}), source: fact.source }
  }
  return out
}

/** The page decisions, read from the page plan the answers were made from. */
function pagesOf(pagePlan) {
  return (pagePlan?.pages ?? []).map((row) => ({
    id: row.id,
    ...(row.path ? { path: row.path } : {}),
    role: row.role,
    decision: row.keep ? 'keep' : 'drop',
    reason: row.keep
      ? row.why === CONTACT_FACTS_WHY
        ? 'contact-facts'
        : row.role === 'home'
          ? 'home-page'
          : 'template-page'
      : row.role === 'sample'
        ? 'showcase-page'
        : 'no-data',
    why: row.why
  }))
}

/** The slot decisions: a contact fact or the name where the slot's role asks for one, else the fill plan's. */
function slotsOf(contentMap, brief, contact, name, cardNames = {}) {
  if (!contentMap?.slots?.length) return []
  // Pictures: per slot, drawn where no photo fits, icons and cut-outs by subject (#194, #195).
  const fill = pictureDecisionsOf(contentMap, brief, cardNames)
  return contentMap.slots.map((slot) => {
    const kind = slot.type === 'text' ? CONTACT_ROLES[slot.role] : null
    if (kind && contact[kind])
      return {
        key: slot.key,
        role: slot.role,
        decision: 'value',
        value: contact[kind].value,
        reason: 'contact-fact'
      }
    if (slot.type === 'text' && slot.role === 'business.name' && name)
      return { key: slot.key, role: slot.role, decision: 'value', value: name, reason: 'business-name' }
    const d = fill.get(slot.key)
    return {
      key: slot.key,
      role: slot.role ?? null,
      decision: d?.action ?? 'skip',
      reason: d?.reason ?? 'no-role',
      ...(d?.assetId ? { assetId: d.assetId } : {}),
      ...(d?.mediaId ? { mediaId: d.mediaId } : {}),
      ...(d?.drawing ? { drawing: d.drawing } : {}),
      ...(d?.glyph ? { glyph: d.glyph } : {}),
      ...(d?.mode ? { mode: d.mode } : {})
    }
  })
}

/**
 * @param {object} brief - a validated brief revision
 * @param {{questions: any[], set?: {contentHash?: string}}} served - the create door's Site questions for the template
 * @param {{now?: string, contentMap?: {slots: any[], pages?: any[], entities?: any[]} | null}} [options]
 * @returns {{version: string, brand: Record<string, {value: string, reason: string}>,
 *   contact: Record<string, {value: string, href?: string, source: string}>,
 *   facts: Record<string, {value: string, source: string, fetchedAt?: string}>,
 *   pages: Array<{id: string, path?: string, role: string, decision: 'keep' | 'drop', reason: string, why: string}>,
 *   slots: Array<{key: string, role: string | null, decision: string, reason: string, value?: string}>,
 *   answers: Record<string, string | string[]>, questionnaire: string | null, notes: string[], pagePlan: object | null}}
 */
export function planSite(brief, served, { now, contentMap = null } = {}) {
  const { answers, questionnaire, notes, pagePlan } = answersFromBrief(brief, served, { now })
  const facts = contactFacts(brief)
  const contact = contactOfBrief(facts)
  const name = typeof answers.name === 'string' ? answers.name : null
  const brand = {}
  if (name) brand.name = { value: name, reason: 'brief-name' }
  if (typeof answers.about === 'string') brand.description = { value: answers.about, reason: 'brief-about' }
  if (typeof answers.tone === 'string') brand.tone = { value: answers.tone, reason: 'brief-voice' }
  // Records kept or hidden, people, offerings and facts from the brief only (ticket #192): `site-plan-honesty.mjs`.
  const honesty = planHonesty(brief, contentMap, { name, contact })
  return {
    version: SITE_PLAN_VERSION,
    brand,
    contact,
    facts,
    pages: pagesOf(pagePlan),
    // A kept card's picture shows what its words name: the honesty plan's card labels (#192, #194).
    slots: slotsOf(contentMap, brief, contact, name, honesty.honesty.cardNames),
    // Logo, posts, social profiles and map (ticket #193): `site-plan-identity.mjs`.
    ...planIdentity(brief, contentMap),
    // What the content map does not reach: videos, backgrounds, showcase, addresses, credit line (ticket #196).
    outside: planOutsideMap({ brief, contentMap }),
    ...honesty,
    answers,
    questionnaire,
    notes,
    pagePlan
  }
}
