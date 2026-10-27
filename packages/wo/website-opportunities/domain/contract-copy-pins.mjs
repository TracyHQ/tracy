// The sourced words (`pinnedCopy`) as the slot keys of one content contract: what a Joomla or WordPress build writes
// as it stands, so the model planner never writes those slots. Which slot holds which role is a hand-made map per
// template (`slot-roles/<cms>.json`), checked against a real release; a key the release being built lacks costs its
// whole group, never a half-written card.
import { readFileSync } from 'node:fs'
import { neutralItemName, placeholderFor } from './section-fills.mjs'
import { whatsappLinkOf } from './business-phones.mjs'
import { contentMapDeclaresRoles } from './content-map-roles.mjs'

const MAPS = {}

/**
 * 🔒 RETIRING THE HAND-WRITTEN MAPS (ADR 0038, #1805). A role map in `slot-roles/<cms>.json` is a stand-in for roles the
 * template's content map did not carry. Once a template's CURRENT contract declares roles on its content map, the map
 * of that template is ignored (`handMapApplies` is false) and the roles are read from the contract, so the two can
 * never disagree. No released contract has content-map roles today, so every entry stays; the entry of a template, and
 * its seed hash in `slot-roles/emdash.json`, goes in the same change that releases the contract version with roles.
 * @param {any} contentMap - the parsed `content-map.json` of the contract being built, or null when there is none
 */
export function handMapApplies(contentMap) {
  return !contentMapDeclaresRoles(contentMap)
}

/**
 * @param {'joomla' | 'wordpress'} cms
 * @param {string} template the release's product (`tracy-base`), the first part of a contract id
 * @returns {{checked?: string, roles: Record<string, Array<Record<string, string>>>, sections?: Record<string, string>} | null}
 *   `sections`: what the hand-off asks of each section of the template's pages, by its name (`section-fills.mjs`)
 */
export function slotRolesFor(cms, template) {
  // Callers that hold the contract's content map ask `handMapApplies` first (`readSlotRoles` does).
  if (cms !== 'joomla' && cms !== 'wordpress') return null
  MAPS[cms] ??= JSON.parse(readFileSync(new URL(`./slot-roles/${cms}.json`, import.meta.url), 'utf8'))
  const entry = MAPS[cms][template]
  return entry?.roles ? entry : null
}

/**
 * Roles that are lists, and the sourced list each reads: the nth sourced value fills the nth group. A template with a menu on
 * more than one page names one role per page (`dishes:menu`), each filled from the same dishes.
 */
const listOf = (role) =>
  role === 'cards' ? 'cards' : role === 'dishes' || role.startsWith('dishes:') ? 'dishes' : null
/**
 * Fields a group may lack a source for: the slot is left empty (`section-fills.mjs`), the rest of the group is written. A
 * `badge` ("Hot", "Sale") is never collected: always empty.
 */
const OPTIONAL = new Set(['price', 'description', 'badge'])
/** A group's own notes, never a slot: `$item` names the block that holds the whole group (a dish item of the template). */
const isField = (field) => !field.startsWith('$')

/** The slot kind each field wants: a link's address is a url slot, every other field a line of text. */
const kindOf = (field) => (field === 'href' ? 'url' : 'text')

// Both doors take plain text and escape it themselves (a sent `&amp;` showed on the page); Joomla refuses `<`, `>`,
// control characters and `{directive}` braces outright, so they are taken out here instead of losing the line.
function plain(value, max) {
  let out = String(value ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the bytes the Claude Cowork plugin refuses
    // oxlint-disable-next-line no-control-regex -- SAFETY: the bytes the Claude Cowork plugin refuses
    .replace(/[<>\u0000-\u001f]/g, ' ')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
  out = out.replace(/\s+/g, ' ').trim()
  if (max > 0 && [...out].length > max)
    out = `${[...out]
      .slice(0, max - 1)
      .join('')
      .replace(/\s+\S*$/, '')
      .trimEnd()}…`
  return out
}

/** A link as both doors take it, or null: a phone keeps only its digits, anything but https/tel/mailto is refused. */
function link(value) {
  const href = String(value ?? '').trim()
  if (/^tel:/i.test(href)) {
    const digits = href.slice(4).replace(/[^+\d]/g, '')
    return /^\+?\d{4,}$/.test(digits) ? `tel:${digits}` : null
  }
  if (/^https:\/\/[^\s<>"]+$/i.test(href) || /^mailto:[^\s<>"@]+@[^\s<>"]+$/i.test(href)) return href
  return null
}

/**
 * @param {object} input
 * @param {{roles: Record<string, Array<Record<string, string>>>}} input.map - `slotRolesFor`
 * @param {{slots: Array<{key: string, type: string, maxCharacters?: number}>}} input.contentMap - of the release being built
 * @param {Record<string, any>} input.pinned - `pinnedCopy`
 * @param {string} [input.locale] - the site's language: the neutral item name is written in it (`neutral-copy.mjs`)
 * @param {string} [input.kind] - what the business offers (`tradeWords(trade).itemKind`): the neutral item name speaks of it
 * @returns {{pins: Record<string, string>, sources: Record<string, string>, skipped: Array<{role: string, reason: string}>,
 *   placeholders: string[], dishes: Array<{name: string, description: string, price: string}>}}
 *   🔒 NOTHING IS HIDDEN (product owner, 22/10/2026), AND NO FILLER (plan §7, 26/10/2026): a dish item with no dish of the
 *   restaurant takes the neutral item name; its other fields, a price nobody collected and a section of the template's own
 *   facts (`map.placeholders`) are pinned empty (`placeholders`: their keys, source `placeholder`), which no door writes — the
 *   build's sweep empties that line itself; `dishes`: the dishes as written, for the template's dish items no slot covers
 */
export function contractCopyPins({ map, contentMap, pinned, locale = 'en', kind = 'dish' }) {
  const slots = new Map()
  // A key the contract gives to two blocks is written into the first (the door's own rule): its budget is the first's.
  for (const s of contentMap?.slots ?? []) if (!slots.has(s.key)) slots.set(s.key, s)
  const pins = {}
  const sources = {}
  const skipped = []
  const placeholders = []
  /** A slot the research holds nothing for: empty, or a dish's neutral name. */
  const stand = (key, value) => {
    pins[key] = value
    sources[key] = 'placeholder'
    placeholders.push(key)
  }

  /** One group of slots from one sourced value: all of it, or none of it. */
  const place = (group, { value, source }) => {
    const fields = typeof value === 'string' ? { text: value } : (value ?? {})
    const out = {}
    const unsourced = []
    for (const [field, key] of Object.entries(group).filter(([f]) => isField(f))) {
      const slot = slots.get(key)
      if (!slot) return `${key} is not in this release`
      if (slot.type !== kindOf(field)) return `${key} is a ${slot.type} slot, not ${kindOf(field)}`
      const shaped =
        field === 'href' ? link(fields[field]) : plain(fields[field], Number(slot.maxCharacters ?? 0))
      if (!shaped && OPTIONAL.has(field)) {
        unsourced.push([key, ''])
        continue
      }
      if (!shaped)
        return field === 'href' ? `${key}: the site would refuse this link` : `${key}: no ${field} to write`
      out[key] = shaped
    }
    Object.assign(pins, out)
    for (const key of Object.keys(out)) sources[key] = source
    // 🔒 A PRICE NOBODY COLLECTED IS EMPTY (plan §7, 26/10/2026): never the demo's, never a guess, never a filler.
    for (const [key, value] of unsourced) stand(key, value)
    return null
  }
  /**
   * A dish item of a list the research holds no dish for: kept under the neutral item name, every other field empty.
   */
  const standIn = (group) => {
    for (const [field, key] of Object.entries(group).filter(([f]) => isField(f))) {
      const slot = slots.get(key)
      if (!slot || slot.type !== 'text') continue
      const value = field === 'name' ? neutralItemName({ kind, locale }) : ''
      stand(key, plain(value, Number(slot.maxCharacters ?? 0)))
    }
  }

  const written = new Set()
  for (const [role, groups] of Object.entries(map?.roles ?? {})) {
    if (listOf(role)) {
      const list = Array.isArray(pinned?.[listOf(role)]) ? pinned[listOf(role)] : []
      groups.forEach((group, n) => {
        const reason = n < list.length ? place(group, list[n]) : 'no sourced value'
        if (!reason) return written.add(role)
        if (n < list.length) skipped.push({ role: `${role}[${n}]`, reason })
        // 🔒 A DISH ITEM OF THE TEMPLATE WITH NO DISH OF THE RESTAURANT STAYS (product owner, 22/10/2026), when the map names
        // the block that holds it: the neutral item name, every other field empty — the demo's dish and its price never stay.
        if (group.$item) standIn(group)
      })
      continue
    }
    const sourced = pinned?.[role]
    if (!sourced) continue
    const reasons = groups.map((group) => place(group, sourced)).filter(Boolean)
    // A role whose every variant failed is skipped; a variant a template lacks is no loss when another was written.
    if (reasons.length === groups.length) skipped.push({ role, reason: reasons.join('; ') })
    else written.add(role)
  }
  // The template's sections of its own facts (a testimonial, a weekly special with its price, the demo's dishes no role
  // reaches): their bodies and prices are emptied and their dish names neutral unless the role that would make them true
  // was written. Headings, titles and pictures are left to the brief's words and the restaurant's pictures.
  for (const h of map?.placeholders ?? []) {
    if (h.unless && written.has(h.unless)) continue
    for (const key of h.slots ?? []) {
      const slot = slots.get(key)
      if (!slot || slot.type !== 'text' || key in pins) continue
      const value = placeholderFor(key, { kind, locale })
      if (value !== null) stand(key, plain(value, Number(slot.maxCharacters ?? 0)))
    }
  }
  const dishList = Array.isArray(pinned?.dishes) ? pinned.dishes : []
  const dishes = dishList
    .map(({ value }) => ({
      name: plain(value?.name, 80),
      description: plain(value?.description, 200),
      price: plain(value?.price, 40)
    }))
    .filter((d) => d.name)
  return {
    pins,
    sources,
    skipped,
    placeholders,
    dishes,
    facts: factBlocks(map?.facts ?? [], pinned?.contact ?? {})
  }
}

/**
 * A sourced fact as a line links it: the address to a map search, a phone to a call, a mailbox to a mail, a WhatsApp
 * number to a chat.
 */
function factHref(kind, fact) {
  if (kind === 'maps') return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fact)}`
  if (kind === 'tel') return link(`tel:${fact}`)
  if (kind === 'mailto') return link(`mailto:${fact}`)
  if (kind === 'whatsapp') return /^\+?[\d\s().-]{8,}$/.test(fact) ? link(whatsappLinkOf(fact)) : null
  return null
}

/**
 * 🔒 A DEMO FACT OUTSIDE THE CONTRACT'S SLOTS — the footer's phone, mailbox and hours, the hero's address link — SAYS THE
 * RESTAURANT'S, OR IS HIDDEN (manager, 22/10/2026). Each block the map names (`facts`) is written from the facts collected
 * (Google, the profiles), one line per fact; a block with none of its facts collected is hidden, never left with the demo's.
 * @param {Array<{page?: string, part?: string, block: string, nth?: number, lines: Array<{fact: string, label?: string,
 *   text?: string, link?: 'maps' | 'tel' | 'mailto' | 'whatsapp'}>}>} specs
 * @param {Record<string, {value: string, source: string}>} contact - `contactOf`
 * @returns {Array<{page?: string, part?: string, block: string, nth: number, lines: Array<{label?: string, text: string,
 *   href?: string, source: string}> | null}>} `lines: null` hides the block
 */
function factBlocks(specs, contact) {
  return specs.map((spec) => {
    const lines = []
    for (const line of spec.lines ?? []) {
      const fact = contact[line.fact]
      const value = plain(fact?.value, 0)
      if (!value) continue
      // Opening hours are collected as one line per run of days: each is a line of its own.
      const values = line.fact === 'hours' && !line.text ? value.split(/\s*;\s*/).filter(Boolean) : [value]
      for (const v of values) {
        const href = line.link ? factHref(line.link, v) : null
        if (line.link && !href) continue
        lines.push({
          ...(line.label ? { label: line.label } : {}),
          text: line.text ?? v,
          ...(href ? { href } : {}),
          source: fact.source
        })
      }
    }
    const where = spec.part ? { part: spec.part } : { page: spec.page }
    return { ...where, block: spec.block, nth: spec.nth ?? 1, lines: lines.length ? lines : null }
  })
}

/** The subjects of a picture of the place's own inside or outside. */
const SPACE = new Set(['interior', 'exterior', 'room'])

/**
 * The build's picture (`realPictures.forSite`) a profile's media fact is: same bytes, or the media row its evidence names.
 * @param {any} profile - a place profile 1.0.0
 * @param {Array<{id: string, sha256?: string}>} pictures
 * @returns {(mediaId: string) => string | null}
 */
function buildPictureOf(profile, pictures) {
  const evidence = new Map((profile?.evidence ?? []).map((e) => [e.id, e]))
  return (mediaId) => {
    const media = (profile?.media ?? []).find((m) => m.id === mediaId)
    if (!media) return pictures.find((p) => p.id === mediaId)?.id ?? null
    const sha = media.value?.sha256
    const rows = (media.evidenceRefs ?? [])
      .map((ref) => /^\$\.media\[id=("[^"]*")\]$/.exec(String(evidence.get(ref)?.locator?.value ?? ''))?.[1])
      .filter(Boolean)
      .map((quoted) => JSON.parse(quoted))
    return (
      pictures.find((p) => (sha && p.sha256 === sha) || rows.includes(p.id) || p.id === mediaId)?.id ?? null
    )
  }
}

/**
 * A `planSlotFill` plan (`slot-fill.mjs`, a release with a `ready` `slot-roles.json`) as the pins of one content contract,
 * in the shape `contractCopyPins` answers. A composed slot is the planner's; a picture is the pictures' (`asset`).
 * 🔒 A NUMBER, A PRICE OR A CONTACT FACT IS NEVER CUT TO FIT (`verbatim`, `format`): one too long for its slot is emptied.
 * 🔒 A CARD'S PICTURE IS ITS OWN ENTITY'S (plan §7): `pictures` binds each picture slot of an entity's group to the build's
 * picture of that entity, or to the placeholder (`null`) — a team member's to the place's own space (`{space: true}`) when
 * the build holds one — and the manifest says what the page will show. Without `profile` no picture is bound.
 * @param {{plan: ReturnType<typeof import('./slot-fill.mjs').planSlotFill>, contentMap: {slots: any[]}, profile?: any,
 *   pictures?: Array<{id: string, sha256?: string, vision?: {subject?: string} | null}>}} input
 * @returns {{pins: Record<string, string>, sources: Record<string, string>, roles: Record<string, string>,
 *   skipped: Array<{role: string, reason: string}>, placeholders: string[], dishes: Array<{name: string,
 *   description: string, price: string, pictureId?: string}>, manifest: object[],
 *   pictures?: Record<string, string | {space: true} | null>}} `placeholders`: the slots pinned neutral or empty
 */
export function slotFillPins({ plan, contentMap, profile, pictures: held = [] }) {
  const slots = new Map()
  for (const s of contentMap?.slots ?? []) if (!slots.has(s.key)) slots.set(s.key, s)
  const pins = {}
  const sources = {}
  const roles = {}
  const skipped = []
  const placeholders = []
  const states = new Map()
  for (const w of plan?.writes ?? []) {
    if (w.state === 'composed' || w.mode === 'asset') continue
    const slot = slots.get(w.slotKey)
    if (!slot) {
      skipped.push({ role: w.slotKey, reason: `${w.slotKey} is not in this release` })
      continue
    }
    let value
    if (slot.type === 'url') {
      // No door takes an empty link: an empty call to action's label is pinned, its link left as the template's.
      if (!w.value) continue
      value = link(w.value)
      if (value === null) {
        skipped.push({ role: w.slotKey, reason: `${w.slotKey}: the site would refuse this link` })
        continue
      }
    } else if (slot.type === 'text') {
      const max = Number(slot.maxCharacters ?? 0)
      const whole = plain(w.value, 0)
      value =
        (w.mode === 'verbatim' || w.mode === 'format') && max > 0 && [...whole].length > max
          ? ''
          : plain(whole, max)
    } else {
      skipped.push({ role: w.slotKey, reason: `${w.slotKey} is a ${slot.type} slot` })
      continue
    }
    const state = w.state === 'sourced' && !value ? 'empty' : w.state
    states.set(w.slotKey, state)
    pins[w.slotKey] = value
    roles[w.slotKey] = w.role
    sources[w.slotKey] = state === 'sourced' ? (w.entityId ?? w.factRefs[0]) : 'placeholder'
    if (state !== 'sourced') placeholders.push(w.slotKey)
  }
  /** @type {Record<string, string | {space: true} | null> | undefined} */
  let pictures
  const pictureOfEntity = new Map()
  if (profile) {
    pictures = {}
    const pictureOf = buildPictureOf(profile, held)
    const space = held.some((p) => SPACE.has(p?.vision?.subject))
    for (const w of plan?.writes ?? []) {
      if (w.mode !== 'asset' || String(w.role).startsWith('business.')) continue
      const id = w.state === 'sourced' && w.value?.mediaId ? pictureOf(w.value.mediaId) : null
      if (id) {
        pictures[w.slotKey] = id
        if (w.entityId && !pictureOfEntity.has(w.entityId)) pictureOfEntity.set(w.entityId, id)
        continue
      }
      // A team member with no photo of their own: the place's inside or outside, never a stranger's face.
      const neutral = w.role === 'person.image' && space
      pictures[w.slotKey] = neutral ? { space: true } : null
      states.set(w.slotKey, neutral ? 'neutral' : 'empty')
    }
  }
  const manifest = (plan?.manifest ?? []).map((e) => {
    const state = states.get(e.slotKey)
    if ((state === 'empty' || state === 'neutral') && e.state !== state) {
      const { neutralKey: _neutralKey, ...rest } = e
      return { ...rest, state, factRefs: [] }
    }
    return e
  })
  const dishes = (plan?.offerings ?? [])
    .filter((o) => o.kind === 'dish' || o.kind === 'drink')
    .map((o) => ({
      name: plain(o.name, 80),
      description: plain(o.description, 200),
      price: plain(o.price, 40),
      ...(pictureOfEntity.has(o.entityId) ? { pictureId: pictureOfEntity.get(o.entityId) } : {})
    }))
    .filter((d) => d.name)
  return { pins, sources, roles, skipped, placeholders, dishes, manifest, ...(pictures ? { pictures } : {}) }
}
