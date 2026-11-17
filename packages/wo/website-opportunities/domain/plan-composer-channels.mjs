// The contact channels the needs profile has no kind for, placed on the site where the template has room (#575, plan
// stage restore of the step chain's site planner, planner-prompt.md lines 167 to 176 and 184 to 185): "A second phone
// goes in that field ... WhatsApp or a DM ...: put that information in another place that can be written (the footer,
// the social list ...) or into an owner task". The build chat reads the template's form, not its demo, so the places
// are the block store's fields:
// - WhatsApp: a link of kind `contact.social_url` (a social row: its icon and label follow the link's network,
//   `row-network-text.mjs`), as the fact `contact-whatsapp`. Only a number a source labels WhatsApp is linked (brief
//   schema 1 `verified`, schema 2 the brief fact `factId` names, on the site); one inferred from a mobile number is not.
// - A second phone: a second `contact.phone` field on the pages of one recipe, as the fact `contact-phone-2`: the one
//   the owner wrote in an answer first (`mention` of an owner statement, `plan-answer-readings.mjs`: the owner chose to
//   show it), else the brief's first other number, never one the owner turned down on a phone conflict question.
// Where the template has no such place, the brief's left out entry stays (`plan-composer-brief.mjs`). Pure: the plan
// data is extended in place and what was placed is returned.
import { whatsappLinkOf } from './business-phones.mjs'
import { samePhone } from './needs-profile-phone.mjs'
import { factSlotsFor } from './plan-placement-facts.mjs'
import { FACT_LABELS, SOURCE_NAMES } from './plan-data.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

export const WHATSAPP_FACT_ID = 'contact-whatsapp'
export const SECOND_PHONE_FACT_ID = 'contact-phone-2'
/** The left out entry of a WhatsApp number no source labels WhatsApp. */
export const WHATSAPP_UNCONFIRMED = Object.freeze({
  what: 'WhatsApp',
  reason: 'No source says this number takes WhatsApp messages, so your site does not link to WhatsApp.',
  code: 'whatsapp_unconfirmed'
})

/** The plan source kind of a brief evidence source (`google`, `website`, `instagram`, ...). */
function originOf(source) {
  const s = String(source ?? '').toLowerCase()
  if (s.includes('google')) return 'google'
  if (s === 'website' || s === 'site') return 'website'
  if (/instagram|facebook|tiktok|youtube|linkedin|twitter|^x$|social/.test(s)) return 'social'
  if (s === 'answer' || s === 'owner') return 'answer'
  return s ? 'listing' : null
}
/** The plan sources of the brief facts of `field`, named as the plan names them. */
function sourcesOfField(brief, field, value) {
  const facts = list(brief?.facts).filter((f) => f?.field === field)
  const fact =
    facts.find((f) => JSON.stringify(f.value ?? '').includes(String(value ?? '\u0000'))) ?? facts[0]
  const kinds = [
    ...new Set(
      list(fact?.evidence)
        .map((e) => originOf(e?.source))
        .filter(Boolean)
    )
  ]
  return kinds.map((kind) => ({ kind, name: SOURCE_NAMES[kind] }))
}

const hasField = (block, kind) =>
  block?.source !== 'library' &&
  [...list(block?.fields), ...list(block?.itemFields)].some((f) => f?.kind === kind)

/** Whether one page type of the template shows two phone numbers. */
function twoPhonePlaces(blocks, recipes) {
  return [...recipes.values()].some(
    (r) =>
      list(r?.blocks)
        .map((id) => blocks.get(id))
        .filter((b) => b && b.source !== 'library')
        .reduce((n, b) => n + factSlotsFor(b, 'contact.phone'), 0) >= 2
  )
}

function whatsappOfBrief(brief) {
  const w = brief?.contact?.whatsapp
  if (!isText(w?.number) && !isText(w?.href)) return null
  const href = isText(w.href) ? w.href.trim() : whatsappLinkOf(w.number)
  const linked = isText(w.factId)
    ? list(brief.facts).some((f) => f?.id === w.factId && f.onSite !== false)
    : w.verified !== false
  return { href, number: w.number, linked }
}

/** The second phone to show: the owner's own first, then the brief's, never one the owner turned down. */
function secondPhoneOf({ brief, profile, data }) {
  const main = data.facts.filter((f) => f.kind === 'contact.phone').map((f) => f.value)
  const turnedDown = list(profile?.conflicts)
    .filter((c) => c?.at === 'facts.contact.phone' && c.chosen !== null && c.chosen !== undefined)
    .flatMap((c) => list(c.values).map((v) => v?.value))
  const owner = list(profile?.ownerFacts)
    .flatMap((s) => list(s?.mention))
    .filter((m) => m?.kind === 'contact.phone' && isText(m.value))
    .map((m) => ({ value: m.value.trim(), sources: [{ kind: 'answer', name: SOURCE_NAMES.answer }] }))
  const fromBrief = list(brief?.business?.otherPhones)
    .filter((p) => isText(p?.phone) && !turnedDown.some((v) => samePhone(v, p.phone)))
    .map((p) => ({ value: p.phone.trim(), sources: sourcesOfField(brief, 'otherPhones', p.phone) }))
  return (
    [...owner, ...fromBrief].find((p) => p.sources.length && !main.some((m) => samePhone(m, p.value))) ?? null
  )
}

const addFact = (data, entry) => {
  data.facts.push(entry)
  data.byId.set(entry.id, { what: 'fact', kind: entry.kind, entry, source: { value: entry.value } })
}

/**
 * Add WhatsApp and a second phone to the plan data where the template has a place for them.
 * @param {{brief: object | null, profile: object, data: object, blocks: Map<string, object>,
 *   recipes: Map<string, object>}} input
 * @returns {{placed: Set<'whatsapp' | 'otherPhones'>, leftOut: object[]}} `placed`: the brief entries now facts of
 *   the plan, so their brief left out entry goes; `leftOut`: a WhatsApp number no source confirms
 */
export function addBriefChannels({ brief, profile, data, blocks, recipes }) {
  const placed = new Set()
  const leftOut = []
  const whatsapp = whatsappOfBrief(brief)
  if (whatsapp && !whatsapp.linked) {
    leftOut.push({ ...WHATSAPP_UNCONFIRMED, kind: 'feature' })
    placed.add('whatsapp')
  } else if (whatsapp && [...blocks.values()].some((b) => hasField(b, 'contact.social_url'))) {
    const known = data.facts.some((f) => f.kind === 'contact.social_url' && f.value.includes('wa.me'))
    const sources = sourcesOfField(brief, 'whatsapp', whatsapp.number)
    if (known) placed.add('whatsapp')
    else if (sources.length && !data.byId.has(WHATSAPP_FACT_ID)) {
      addFact(data, {
        id: WHATSAPP_FACT_ID,
        kind: 'contact.social_url',
        label: 'WhatsApp',
        value: whatsapp.href,
        sources
      })
      placed.add('whatsapp')
    }
  }
  const second = twoPhonePlaces(blocks, recipes) ? secondPhoneOf({ brief, profile, data }) : null
  if (second && !data.byId.has(SECOND_PHONE_FACT_ID)) {
    addFact(data, {
      id: SECOND_PHONE_FACT_ID,
      kind: 'contact.phone',
      label: `${FACT_LABELS['contact.phone']} 2`,
      value: second.value,
      sources: second.sources
    })
    placed.add('otherPhones')
  }
  return { placed, leftOut }
}

/**
 * The channel facts a plan holds from its brief, carried into the plan data of a revision (which reads no brief), so a
 * block that shows them keeps them. Extends `data` in place.
 */
export function carryChannelFacts(plan, data) {
  for (const id of [WHATSAPP_FACT_ID, SECOND_PHONE_FACT_ID]) {
    const fact = list(plan?.facts).find((f) => f?.id === id)
    if (fact && !data.byId.has(id)) addFact(data, structuredClone(fact))
  }
}
