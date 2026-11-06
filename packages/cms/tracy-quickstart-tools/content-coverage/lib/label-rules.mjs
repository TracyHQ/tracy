// The mechanical label rules R2 to R9 (ADR 0040, spec #37): is every slot of a content map labelled in a way no
// meaning-judge is needed to refuse? Pure: a content map, the page snapshots the audit took and the holes it found go
// in; per rule the slots (or holes) that fail come out. `coverage-file.mjs` writes the result into the committed
// `content-coverage.json`; the Road to live step reads it there and never runs this. R1 (the share of fact roles) is a
// number only. A rule that finds nothing has `count: 0`.
//
//   R2  a phone, email, address, price or hours sample needs a contact or price role
//   R3  every URL slot has a role
//   R4  an indexed repeat is grouped (one group per item); a CTA URL shares a group with its label (a mailto: or tel:
//       link with the email or phone it calls)
//   R5  no keep on a fact role; a face, signature or cut-out picture needs a person, quote or business role (faces
//       may also prove a number: `stat.proof_image`, ADR 0040)
//   R6  no link or list item inside a fact slot
//   R7  siblings of a repeat share a role (info cards, one contact fact per card, may each hold their own)
//   R8  adjacent short slots of one entity and one card on one line are flagged as a cut heading
//   R9  a fact-like hole blocks (an accepted reason does not lift it: a fact the map misses stays the demo's), except
//       inside a code sample (<pre>, <code>): "user@example.com" in a log line is code, not the business's
//
// Slots of a demo-only entity (a style-guide page, `demo-only.mjs`) are left out of R1 to R8; R9 reads every hole.
import {
  ROLE_VOCABULARY_V3,
  isFactRole,
  isRole
} from '../../../../wo/website-opportunities/domain/place-content-roles.mjs'
import { demoOnlyEntities } from './demo-only.mjs'
import { slotHash } from './label-judge.mjs'
import { factKindsOf } from './fact-samples.mjs'

export const LABEL_RULES_VERSION = 'label-rules/1'
/** The vocabulary version whose maps these rules judge as blocking; older maps are measured and reported only. */
export const APPLIES_TO = ROLE_VOCABULARY_V3
/** How many failing keys a rule names in the committed file; `count` is always the full number. */
const SHOWN = 12

const TITLES = Object.freeze({
  R2: 'fact-like sample without a contact or price role',
  R3: 'URL slot without a role',
  R4: 'repeat or CTA not grouped',
  R5: 'keep on a fact role, or a face, signature or cut-out without a person, quote or business role',
  R6: 'link or list item inside a fact slot',
  R7: 'siblings with different roles',
  R8: 'adjacent short slots on one line (a cut heading)',
  R9: 'fact-like hole'
})

const isTextual = (s) => s?.type === 'text' || s?.type === 'html'
const hasRole = (s, version) => typeof s?.role === 'string' && isRole(s.role, version)
const roleOf = (s) => (typeof s?.role === 'string' ? s.role : '')
const FACT_SAMPLE_ROLE = /^contact\.|\.price$|^offering\.(?:price_note|schedule)$|^package\.price$/
/**
 * A sum that states a result ("$4.8m in profits", "helped raise over $500 million") reads like a price but is a stat or
 * a claim: those roles never keep the demo's words in a build (a dash or empty), so a price-like sample may carry them.
 * A phone, email, address or hours sample still needs a contact role.
 */
const PRICE_LIKE_RESULT_ROLES = new Set(['stat.value', 'claim.notice'])
const CTA_LABEL_ROLES = new Set([
  'contact.cta_label',
  'offering.cta_label',
  'package.cta_label',
  'editorial.button_label'
])
const CTA_URL_ROLES = new Set(['contact.cta_url', 'offering.cta_url', 'package.cta_url'])
/** A contact card whose link wraps the fact itself (`<a href="mailto:…"><h5>email</h5></a>`): the fact is the label. */
const CONTACT_FACT_ROLES = new Set(['contact.address', 'contact.email', 'contact.phone'])
const PERSON_LIKE = /^(?:person|quote|business)\./
const FACE_KINDS = new Set(['avatar', 'avatar-group', 'signature', 'cutout'])
/** Faces that prove a number ("5k happy members" beside a strip of faces) have their own role (ADR 0040). */
const PROOF_FACE_KINDS = new Set(['avatar', 'avatar-group'])
const PROOF_ROLE = 'stat.proof_image'
/** A transparent picture of the design (a brush stroke) measures as a cut-out by shape; the label judge, not R5, can
 * tell it from a person cut out of a photo. Such a slot fails R5 until the judge saw it, as it is now, and said right. */
const DESIGN_ROLE = 'editorial.design_element'

/** `['team','team[name]',2]` → the pattern `team/team[name]/#` and the index tuple `2`; null when nothing is indexed. */
function repeatOf(slot) {
  if (!Array.isArray(slot?.jsonPath)) return null
  const idx = []
  // The sections of a T4 layout are the page's different places (hero, features, footer), not copies of one item.
  const layoutSection = (i) =>
    i === 2 &&
    String(slot.entity ?? '').startsWith('templateConfig-') &&
    slot.jsonPath[0] === 'layout' &&
    slot.jsonPath[1] === 'sections'
  const parts = slot.jsonPath.map((p, i) => {
    if (Number.isInteger(p) && !layoutSection(i)) {
      idx.push(p)
      return '#'
    }
    return String(p)
  })
  // Pieces of one HTML field (an image and three text spans of one description) are not siblings of each other: the
  // place inside the field (its xpath without positions) is part of the pattern.
  const inField = typeof slot.xpath === 'string' ? `|${slot.xpath.replace(/\[\d+\]/g, '')}` : ''
  return idx.length > 0
    ? { pattern: `${slot.entity ?? ''}/${parts.join('/')}${inField}`, tuple: idx.join('.') }
    : null
}

/** Slots that share a pattern and show at least two index tuples: the repeats of the map. */
function repeatsOf(slots) {
  const byPattern = new Map()
  for (const slot of slots) {
    const r = repeatOf(slot)
    if (!r) continue
    const g = byPattern.get(r.pattern) ?? { tuples: new Set(), members: [] }
    g.tuples.add(r.tuple)
    g.members.push({ slot, tuple: r.tuple })
    byPattern.set(r.pattern, g)
  }
  return [...byPattern.values()].filter((g) => g.tuples.size >= 2)
}

function r2(slots, version) {
  const out = []
  for (const s of slots) {
    const kinds = isTextual(s) ? factKindsOf(s.sample) : []
    if (kinds.length === 0) continue
    if (!hasRole(s, version)) {
      out.push(s.key)
      continue
    }
    const result = kinds.every((k) => k === 'price') && PRICE_LIKE_RESULT_ROLES.has(roleOf(s))
    if (!result && !FACT_SAMPLE_ROLE.test(roleOf(s))) out.push(s.key)
  }
  return out
}

const r3 = (slots, version) =>
  slots.filter((s) => s?.type === 'url' && !hasRole(s, version)).map((s) => s.key)

function r4(slots, repeats) {
  const out = new Set()
  for (const { members } of repeats) {
    const groupTuples = new Map()
    for (const { slot, tuple } of members) {
      if (!slot.group?.id) {
        out.add(slot.key)
        continue
      }
      const seen = groupTuples.get(slot.group.id) ?? new Set()
      seen.add(tuple)
      groupTuples.set(slot.group.id, seen)
    }
    for (const { slot } of members)
      if (slot.group?.id && groupTuples.get(slot.group.id).size > 1) out.add(slot.key)
  }
  for (const s of slots) {
    if (!CTA_URL_ROLES.has(roleOf(s))) continue
    const id = s.group?.id
    // A mailto: or tel: link's words are the address or number it calls: that fact slot is its label.
    const labels = new Set(CTA_LABEL_ROLES)
    if (/^mailto:/i.test(String(s.sample ?? ''))) labels.add('contact.email')
    if (/^tel:/i.test(String(s.sample ?? ''))) labels.add('contact.phone')
    // A contact card's link with no address of its own wraps the fact it shows (the address, the e-mail, the number).
    if (roleOf(s) === 'contact.cta_url' && !String(s.sample ?? '').trim())
      for (const r of CONTACT_FACT_ROLES) labels.add(r)
    if (!id || !slots.some((o) => o !== s && o.group?.id === id && labels.has(roleOf(o)))) out.add(s.key)
  }
  return [...out]
}

function r5(slots, pending) {
  const out = []
  for (const s of slots) {
    const fact = isFactRole(s.role)
    const keeps = s.customize === 'keep' || (s.type === 'image' && s.fit?.replace === 'keep')
    const kind = s.fit?.kind
    const proof = roleOf(s) === PROOF_ROLE && PROOF_FACE_KINDS.has(kind)
    const face = s.type === 'image' && FACE_KINDS.has(kind) && !PERSON_LIKE.test(roleOf(s)) && !proof
    if ((fact && keeps) || face) out.push(s.key)
    if (face && kind === 'cutout' && roleOf(s) === DESIGN_ROLE)
      pending.push({ key: s.key, hash: slotHash(s) })
  }
  return out
}

const r6 = (slots) =>
  slots
    .filter((s) => s?.type === 'html' && isFactRole(s.role) && /<a[\s>]|<li[\s>]/i.test(String(s.sample)))
    .map((s) => s.key)

/** A contact fact role: info cards (Location, Hours, Call us) each hold a different one. */
const CONTACT_FACT = /^contact\.(?:address|hours|phone|email)$/
/** One card per item: every member is grouped and no two items share a group. */
const cardPerItem = (members) =>
  members.every(({ slot }) => slot.group?.id) &&
  new Set(members.map(({ slot, tuple }) => `${slot.group.id}|${tuple}`)).size ===
    new Set(members.map(({ slot }) => slot.group.id)).size

/** Cards of one contact block each hold a different channel (address, email, phone): one kind of sibling for R7. */
const siblingRole = (slot) => (CONTACT_FACT_ROLES.has(roleOf(slot)) ? 'contact.fact' : roleOf(slot))
function r7(repeats) {
  const out = []
  for (const { members } of repeats) {
    // A row of info cards, one contact fact per card (the address on Location, the hours on Hours): their roles
    // differ because the facts do, not because a label slipped.
    if (cardPerItem(members) && members.every(({ slot }) => CONTACT_FACT.test(roleOf(slot)))) continue
    const counts = new Map()
    for (const { slot } of members) counts.set(siblingRole(slot), (counts.get(siblingRole(slot)) ?? 0) + 1)
    const [majority] = [...counts].sort((a, b) => b[1] - a[1])[0]
    for (const { slot } of members) if (siblingRole(slot) !== majority) out.push(slot.key)
  }
  return out
}

/** Adjacent short slots of one entity on one line: the pieces of one heading cut in words. */
function r8(slots, pages) {
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const short = (v) =>
    String(v ?? '').trim().length <= 24 &&
    String(v ?? '')
      .trim()
      .split(/\s+/).length <= 4
  const out = new Set()
  for (const page of pages) {
    const boxes = []
    for (const it of page.items ?? []) {
      const slot =
        it.kind === 'text' && it.status === 'matched' && it.slots?.length === 1
          ? byKey.get(it.slots[0])
          : null
      const rect = it.viewports?.desktop?.visible ? it.viewports.desktop.rect : null
      if (!slot || !rect || !slot.entity || !short(it.value) || ['a', 'button', 'li'].includes(it.tag))
        continue
      boxes.push({ slot, rect })
    }
    boxes.sort((a, b) => a.rect.x - b.rect.x)
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        const height = Math.max(a.rect.h, b.rect.h)
        const sameLine = Math.abs(a.rect.y - b.rect.y) <= height * 0.25
        const gap = b.rect.x - (a.rect.x + a.rect.w)
        if (a.slot.entity !== b.slot.entity || a.slot.key === b.slot.key || !sameLine) continue
        // Two cards side by side (the names of two team members in a row): one heading is never cut across cards.
        if (a.slot.group?.id && b.slot.group?.id && a.slot.group.id !== b.slot.group.id) continue
        if (gap < -2 || gap > height * 1.5) continue
        if (isFactRole(a.slot.role) && isFactRole(b.slot.role) && a.slot.role !== b.slot.role) continue
        // Two items of a grouped repeat (a row of member cards) side by side: each is its own item, never half a heading.
        if (a.slot.group?.id && b.slot.group?.id && a.slot.group.id !== b.slot.group.id) continue
        out.add(`${a.slot.key} + ${b.slot.key}`)
      }
  }
  return [...out]
}

const r9 = (holes) =>
  holes
    // A shop catalogue's price or address is the shop's inventory, not a fact the content map could declare.
    .filter(
      (h) =>
        h?.class !== 'core' &&
        h?.class !== 'catalogue' &&
        h?.inCode !== true &&
        (h.kind === 'text' || String(h.kind).startsWith('attr'))
    )
    .filter((h) => factKindsOf(h.value).length > 0)
    .map((h) => String(h.value))

/** R1: how many of the text and image slots with a role carry a fact role. A number, never a threshold. */
function factShare(slots) {
  const roled = slots.filter((s) => (isTextual(s) || s?.type === 'image') && typeof s.role === 'string')
  const facts = roled.filter((s) => isFactRole(s.role)).length
  return {
    facts,
    slots: roled.length,
    percent: roled.length ? Math.round((facts / roled.length) * 1000) / 10 : 0
  }
}

/**
 * @param {{ map: any, pages?: any[], holes?: Array<{kind: string, value: string, class?: string}> }} input
 *   `pages`: the audit's page snapshots (`result.pages`); `holes`: the hole items it found
 * @returns {{ version: string, roleVocabularyVersion: string | null, applies: boolean, r1: {facts: number, slots: number, percent: number}, rules: Record<string, {title: string, count: number, keys: string[]}> }}
 */
export function labelRulesOf({ map, pages = [], holes = [] }) {
  const demoOnly = demoOnlyEntities(map)
  const slots = (Array.isArray(map?.slots) ? map.slots : []).filter((s) => !demoOnly.has(s?.entity))
  const version = map?.roleVocabularyVersion ?? null
  const repeats = repeatsOf(slots)
  const pending = []
  const found = {
    R2: r2(slots, version ?? undefined),
    R3: r3(slots, version ?? undefined),
    R4: r4(slots, repeats),
    R5: r5(slots, pending),
    R6: r6(slots),
    R7: r7(repeats),
    R8: r8(slots, pages),
    R9: r9(holes)
  }
  return {
    version: LABEL_RULES_VERSION,
    roleVocabularyVersion: version,
    applies: version === APPLIES_TO,
    r1: factShare(slots),
    rules: Object.fromEntries(
      Object.entries(found).map(([id, keys]) => [
        id,
        {
          title: TITLES[id],
          count: keys.length,
          keys: keys.slice(0, SHOWN),
          ...(id === 'R5' && pending.length ? { pendingJudge: pending, exempted: [] } : {})
        }
      ])
    )
  }
}

/**
 * Lift from R5 the design cut-outs (`pendingJudge`) the label judge saw as they are now (same slot hash) and said right;
 * they are listed in `exempted`. Run when the audit writes the file and again when record-judge.mjs records verdicts.
 * Idempotent: it starts from the failing keys plus what an earlier run exempted.
 * @param {any} labelRules the `labelRules` block
 * @param {any} labelJudge the `labelJudge` block, or null
 */
export function applyJudgeToLabelRules(labelRules, labelJudge) {
  const r5 = labelRules?.rules?.R5
  if (!Array.isArray(r5?.pendingJudge) || r5.pendingJudge.length === 0) return labelRules
  const right = new Map(
    (Array.isArray(labelJudge?.slots) ? labelJudge.slots : [])
      .filter((v) => v?.verdict === 'right')
      .map((v) => [v.key, v.hash])
  )
  const before = r5.exempted ?? []
  const exempted = r5.pendingJudge.filter((p) => right.get(p.key) === p.hash).map((p) => p.key)
  const lifted = new Set(exempted)
  const keys = [...new Set([...r5.keys, ...before])].filter((k) => !lifted.has(k)).slice(0, SHOWN)
  const count = r5.count + before.length - exempted.length
  return { ...labelRules, rules: { ...labelRules.rules, R5: { ...r5, count, keys, exempted } } }
}
