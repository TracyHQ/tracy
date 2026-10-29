/**
 * The restaurant's sourced words in the text fields of an EmDash demo site a Website Opportunities build made — hero title,
 * lead and button, the About story, the dish cards — written without a model (tasks/plan-wo-contract-writer.md, B2). Which
 * field holds which role is the WO domain's map (`domain/slot-roles/emdash.json`); the values are `pinnedCopy`'s, each with
 * its source. Contact facts are not here: the personalize tool's `identity` rules write them (B1).
 *
 * 🔒 RUN AFTER THE PERSONALIZE TOOL, never before: its model writes these same fields and would write over them.
 * 🔒 WHAT IS IN THE FIELD NOW IS THE TOOL'S OWN OUTPUT of this same Apply, so a re-Apply writes ours over it again. The
 * template's words are kept once, by the first run (`recordBefore`). `conflict` is only an entry that moved between our read
 * and our write twice (`_rev` refused).
 */
import { isDeepStrictEqual } from 'node:util'

import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { handMapOf, planFillOf } from '../../lib/contract-slot-roles.js'
import { portableText } from './wo-content.js'

/**
 * The slot-role map of one EmDash template, or null when the WO domain has none for it. Read through the shared slot
 * roles reader (`contract-slot-roles.js`, ADR 0038).
 * @param {string} templateId - `emdashToolFor(...).templateId`
 */

/** Whether what the site holds is what we wrote: keys the site adds itself (a list row's `_rowId`) do not count. */
function holds(/** @type {any} */ got, /** @type {any} */ want) {
  if (Array.isArray(want))
    return Array.isArray(got) && got.length === want.length && want.every((w, i) => holds(got[i], w))
  if (want && typeof want === 'object')
    return !!got && typeof got === 'object' && Object.keys(want).every((k) => holds(got[k], want[k]))
  return isDeepStrictEqual(got, want)
}

export function emdashSlotRoles(templateId) {
  return handMapOf('emdash', templateId)
}

/** How many dish cards the template has: what `copyFor` is asked for. @param {any} map @param {any} seed */
export function cardCount(map, seed) {
  if (!map?.cards) return 0
  const items = entryData(seed, map.cards)?.[map.cards.field]
  return Array.isArray(items) ? items.length : 0
}

/** @param {any} seed @param {{collection: string, slug: string}} at */
function entryData(seed, at) {
  const locale = seed?.defaultLocale ?? 'en'
  const list = seed?.content?.[at.collection]
  return Array.isArray(list)
    ? list.find((e) => e?.slug === at.slug && (e.locale ?? locale) === locale)?.data
    : undefined
}

/** @param {any} seed @param {string} collection @param {string} field */
const typeOf = (seed, collection, field) =>
  seed?.collections
    ?.find((/** @type {any} */ c) => c?.slug === collection)
    ?.fields?.find((/** @type {any} */ f) => f?.slug === field)?.type

const nonEmpty = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== ''

/**
 * A list group's item patches (`patchItems`): item i takes the i-th whole pinned value, each item left over has the
 * group's fields emptied in place, so the template keeps its card and no demo person's words stay.
 * @param {any} g - a role group with `list`
 * @param {any} pin - one pinned value, or a list of them
 * @param {any} seed
 * @returns {{reason: string} | {items: Record<string, Array<{index: number, sub: string, value: string}>>,
 *   sources: Record<string, any>}}
 */
function listWrites(g, pin, seed) {
  const locale = seed?.defaultLocale ?? 'en'
  const data = entryData(seed, g)
  if (!data) return { reason: `the seed has no ${g.collection}/${g.slug} in ${locale}` }
  const subs = seed?.collections
    ?.find((/** @type {any} */ c) => c?.slug === g.collection)
    ?.fields?.find((/** @type {any} */ f) => f?.slug === g.list && f.type === 'repeater')
    ?.validation?.subFields
  const cards = data[g.list]
  const gone = g.fields
    .map((/** @type {any} */ f) => f.field)
    .filter(
      (/** @type {string} */ f) =>
        !subs?.some((/** @type {any} */ s) => s.slug === f) ||
        !Array.isArray(cards) ||
        !cards.every((c) => c && typeof c === 'object' && f in c)
    )
  if (gone.length)
    return {
      reason: `the seed has no ${gone.map((f) => `${g.collection}/${g.slug}.${g.list}[].${f}`).join(', ')}`
    }
  // A value missing any of its parts (a review without its author or platform) is never put on a card.
  const whole = (Array.isArray(pin) ? pin : [pin]).filter((p) =>
    g.fields.every((/** @type {any} */ f) => nonEmpty(f.from === 'value' ? p?.value : p?.value?.[f.from]))
  )
  if (!whole.length) return { reason: 'no source' }
  /** @type {Array<{index: number, sub: string, value: string}>} */
  const patches = []
  /** @type {Record<string, any>} */
  const sources = {}
  for (const index of cards.keys()) {
    const p = whole[index]
    for (const f of g.fields) {
      patches.push({
        index,
        sub: f.field,
        value: p ? String(f.from === 'value' ? p.value : p.value[f.from]) : ''
      })
      sources[`${g.list}[${index}].${f.field}`] = p ? p.source : 'placeholder'
    }
  }
  return { items: { [g.list]: patches }, sources }
}

/**
 * What to write, entry by entry, for the pinned values the map has a place for. Pure.
 * @param {object} input
 * @param {any} input.map - one template of `slot-roles/emdash.json`
 * @param {Record<string, any>} input.pinned - `pinnedCopy(...)`
 * @param {any} input.seed - the release's `seed/seed.json`
 * @returns {{writes: Array<{collection: string, slug: string, locale: string, roles: string[], fields: Record<string, any>,
 *   items?: Record<string, Array<{index: number, sub: string, value: string}>>, sources: Record<string, any>}>,
 *   skipped: Array<{role: string, reason: string}>}}
 */
export function emdashCopyWrites({ map, pinned, seed }) {
  const locale = String(seed?.defaultLocale ?? 'en')
  /** @type {Map<string, {collection: string, slug: string, locale: string, roles: string[], fields: Record<string, any>, items?: Record<string, any[]>, sources: Record<string, any>}>} */
  const byEntry = new Map()
  /** @type {Array<{role: string, reason: string}>} */
  const skipped = []
  const add = (/** @type {any} */ g, /** @type {string} */ role, fields, sources, items = null) => {
    const key = `${g.collection}/${g.slug}`
    if (!byEntry.has(key))
      byEntry.set(key, { collection: g.collection, slug: g.slug, locale, roles: [], fields: {}, sources: {} })
    const e = /** @type {any} */ (byEntry.get(key))
    e.roles.push(role)
    Object.assign(e.fields, fields)
    Object.assign(e.sources, sources)
    if (items) e.items = { ...e.items, ...items }
  }
  const missing = (/** @type {any} */ g, /** @type {string[]} */ fields) => {
    const data = entryData(seed, g)
    if (!data) return `the seed has no ${g.collection}/${g.slug} in ${locale}`
    const gone = fields.filter((f) => !(f in data) || !typeOf(seed, g.collection, f))
    return gone.length
      ? `the seed has no ${gone.map((f) => `${g.collection}/${g.slug}.${f}`).join(', ')}`
      : null
  }
  const asType = (/** @type {any} */ g, /** @type {string} */ field, /** @type {string} */ text) =>
    typeOf(seed, g.collection, field) === 'portableText' ? portableText(text) : text

  for (const [role, g] of Object.entries(map?.roles ?? {})) {
    const pin = pinned?.[role]
    if (!pin) {
      skipped.push({ role, reason: 'no source' })
      continue
    }
    if (g.list) {
      const got = listWrites(g, pin, seed)
      if ('reason' in got) skipped.push({ role, reason: got.reason })
      else add(g, role, {}, got.sources, got.items)
      continue
    }
    const gone = missing(
      g,
      g.fields.map((/** @type {any} */ f) => f.field)
    )
    if (gone) {
      skipped.push({ role, reason: gone })
      continue
    }
    /** @type {Record<string, any>} */
    const fields = {}
    /** @type {Record<string, any>} */
    const sources = {}
    let whole = true
    for (const f of g.fields) {
      if (f.fromRole) {
        // Another role's value joins the group; without one the field takes `else`.
        const other = pinned?.[f.fromRole]
        const has = nonEmpty(other?.value)
        fields[f.field] = asType(g, f.field, has ? other.value : (f.else ?? ''))
        sources[f.field] = has ? other.source : pin.source
        continue
      }
      const text = f.from === 'value' ? pin.value : pin.value?.[f.from]
      if (!nonEmpty(text)) whole = false
      else {
        fields[f.field] = asType(g, f.field, text)
        sources[f.field] = pin.source
      }
    }
    if (!whole) skipped.push({ role, reason: 'no source' })
    else add(g, role, fields, sources)
  }

  const cards = Array.isArray(pinned?.cards) ? pinned.cards : []
  const c = map?.cards
  if (!c) skipped.push({ role: 'cards', reason: 'no card group for dishes' })
  else if (cards.length === 0) skipped.push({ role: 'cards', reason: 'no source' })
  else {
    const gone = missing(c, [c.field])
    const items = entryData(seed, c)?.[c.field]
    if (gone || !Array.isArray(items))
      skipped.push({ role: 'cards', reason: gone ?? `${c.field} is not a list` })
    else if (c.minItems === 'all' && cards.length < items.length)
      skipped.push({ role: 'cards', reason: `${cards.length} dish(es) for ${items.length} cards` })
    else {
      const used = cards.slice(0, items.length)
      add(
        c,
        'cards',
        {
          [c.field]: used.map((card, i) => {
            const out = { ...items[i] }
            for (const [sub, from] of Object.entries(c.item)) out[sub] = card.value?.[from] ?? ''
            return out
          })
        },
        { [c.field]: used.map((card) => card.source) }
      )
    }
  }
  return { writes: [...byEntry.values()], skipped }
}

/** `collection.slug.field` or `collection.slug.field[i].sub`, as an EmDash sidecar names a slot. */
const SLOT_KEY = /^([^.]+)\.([^.]+)\.([^.[]+)(?:\[(\d+)\]\.([^.]+))?$/

/**
 * What to write, entry by entry, for a `planSlotFill` plan of an EmDash template's `ready` sidecar. Pure. A composed slot is
 * the tool's model's, a picture the tool's pictures', the site's settings the identity rules' (B1): none is written here.
 * A list field's item is patched where it stands on the site (`items`), so the tool's words in its other fields stay.
 * @param {{plan: any, seed: any}} input
 * @returns {{writes: Array<{collection: string, slug: string, locale: string, roles: string[], fields: Record<string, any>,
 *   items: Record<string, Array<{index: number, sub: string, value: string}>>, sources: Record<string, any>}>,
 *   skipped: Array<{role: string, reason: string}>}}
 */
export function emdashSlotFillWrites({ plan, seed }) {
  const locale = String(seed?.defaultLocale ?? 'en')
  /** @type {Map<string, any>} */
  const byEntry = new Map()
  /** @type {Array<{role: string, reason: string}>} */
  const skipped = []
  for (const w of plan?.writes ?? []) {
    if (w.state === 'composed' || w.mode === 'asset' || typeof w.value !== 'string') continue
    // The personalize tool's summary stays when a later copy pin has no sourced words for it.
    if (w.role === 'offering.summary' && !w.value.trim()) continue
    const m = SLOT_KEY.exec(w.slotKey)
    if (!m) continue
    const [, collection, slug, field, index, sub] = m
    const data = entryData(seed, { collection, slug })
    if (!data || !(field in data) || !typeOf(seed, collection, field)) {
      skipped.push({ role: w.slotKey, reason: `the seed has no ${collection}/${slug}.${field} in ${locale}` })
      continue
    }
    const key = `${collection}/${slug}`
    if (!byEntry.has(key))
      byEntry.set(key, { collection, slug, locale, roles: [], fields: {}, items: {}, sources: {} })
    const e = byEntry.get(key)
    if (!e.roles.includes(w.role)) e.roles.push(w.role)
    const source = w.state === 'sourced' ? (w.entityId ?? w.factRefs?.[0] ?? null) : 'placeholder'
    if (index === undefined) {
      e.fields[field] = typeOf(seed, collection, field) === 'portableText' ? portableText(w.value) : w.value
      e.sources[field] = source
    } else {
      ;(e.items[field] ??= []).push({ index: Number(index), sub, value: w.value })
      e.sources[`${field}[${index}].${sub}`] = source
    }
  }
  return { writes: [...byEntry.values()], skipped }
}

/** One entry's writes from the hand-made map and the sidecar's: the sidecar's win where both name a field. */
function mergeEntryWrites(/** @type {any[]} */ first, /** @type {any[]} */ second) {
  const out = new Map(first.map((w) => [`${w.collection}/${w.slug}`, { items: {}, ...w }]))
  for (const w of second) {
    const key = `${w.collection}/${w.slug}`
    const was = out.get(key)
    if (!was) out.set(key, w)
    else
      out.set(key, {
        ...was,
        roles: [...new Set([...was.roles, ...w.roles])],
        fields: { ...was.fields, ...w.fields },
        items: { ...was.items, ...w.items },
        sources: { ...was.sources, ...w.sources }
      })
  }
  return [...out.values()]
}

/** A list field's items with the sidecar's fields set in place; an item the site no longer has is left out. */
function patchItems(/** @type {Record<string, any>} */ data, /** @type {Record<string, any[]>} */ items) {
  const out = { ...data }
  for (const [field, patches] of Object.entries(items ?? {})) {
    if (!Array.isArray(out[field])) continue
    out[field] = out[field].map((/** @type {any} */ item) =>
      item && typeof item === 'object' ? { ...item } : item
    )
    for (const p of patches)
      if (out[field][p.index] && typeof out[field][p.index] === 'object') out[field][p.index][p.sub] = p.value
  }
  return out
}

/** A sidecar's plan of the build's place profile (`planSlotFill`). */
function planOf(
  /** @type {any} */ domain,
  /** @type {any} */ slotRoles,
  /** @type {any} */ copy,
  locale = 'en'
) {
  return planFillOf(domain, slotRoles, { placeProfile: copy.placeProfile, locale })
}

/** The pictures of a person a sidecar binds: a team member's, a reviewer's avatar. */
const PEOPLE_PICTURES = new Set(['person.image', 'quote.author_image'])

/**
 * The picture slots of a sidecar's people (`collection.slug.path`, as its bindings name them): the pictures stage fills
 * these even in a collection it otherwise leaves alone (a team, reviews), from the card's own entity or the place's space.
 * @param {any} slotRoles - a `ready` `slot-roles.json`
 * @returns {Set<string>}
 */
export function emdashCardPictureSlots(slotRoles) {
  return new Set(
    (slotRoles?.bindings ?? [])
      .filter((b) => b.mode === 'asset' && PEOPLE_PICTURES.has(b.role))
      .map((b) => b.slotKey)
  )
}

/**
 * Each card picture of an EmDash sidecar's plan bound to this build's picture of the card's own entity (`slotFillPins`),
 * and the manifest that says what the page will show. Null when the template has no ready sidecar or the build no profile.
 * @param {{copy: any, slotRoles: any, locale?: string, pictures?: any[]}} input - `pictures`: this build's
 *   (`realPictures.forSite`)
 * @returns {Promise<null | {pictures: Record<string, string | {space: true} | null>, manifest: object[], plan: any}>}
 */
export async function emdashCardPictures({ copy, slotRoles, locale = 'en', pictures = [] }) {
  if (!slotRoles || !copy?.placeProfile) return null
  const domain = await websiteOpportunitiesDomain()
  const plan = planOf(domain, slotRoles, copy, locale)
  const fill = domain.slotFillPins({
    plan,
    contentMap: { slots: [] },
    profile: copy.placeProfile.profile,
    pictures
  })
  return { pictures: fill.pictures ?? {}, manifest: fill.manifest, plan }
}

/** The map's writes with a sidecar plan's merged over them; the plan's manifest is kept as the build's receipt. */
async function withSlotFill({ writes, skipped, slotRoles, copy, seed, woContent, locale, pictures }) {
  const domain = await websiteOpportunitiesDomain()
  const plan = planOf(domain, slotRoles, copy, locale)
  // The manifest of the card pictures as the pictures stage binds them (`emdashCardPictures`): what the page shows.
  const manifest = domain.slotFillPins({
    plan,
    contentMap: { slots: [] },
    profile: copy.placeProfile.profile,
    pictures
  }).manifest
  const fill = emdashSlotFillWrites({ plan, seed })
  skipped.push(...fill.skipped)
  // What each slot holds (sourced, composed, neutral, empty): what QA counts.
  await woContent.recordWrite(copy.buildId, 'slot-fill', {
    version: plan.version,
    locale,
    provisional: copy.placeProfile.provisional === true,
    ...(copy.placeProfile.note ? { profileNote: copy.placeProfile.note } : {}),
    manifest
  })
  return mergeEntryWrites(writes, fill.writes)
}

/**
 * Write the pinned words into the site: per entry GET → keep the words before → PUT with `_rev` → publish → read every
 * written field back. A retry that finds our words in a draft publishes it; one that finds them published writes nothing.
 * @param {object} input
 * @param {(method: string, route: string, body?: unknown) => Promise<any>} input.api - `siteApi(...)`
 * @param {{buildId: string, pinned: Record<string, any>}} input.copy - `woContent.copyFor(...)`
 * @param {any} input.map - `emdashSlotRoles(templateId)`
 * @param {any} input.seed - the release's `seed/seed.json`
 * @param {{recordBefore: Function, recordWrite: Function}} input.woContent
 * @param {(note: string) => void} input.note
 * @param {any} [input.slotRoles] - the template's `ready` `slot-roles.json`: its plan (`planSlotFill`) is written over the map's
 * @param {string} [input.locale] - the language the root is written in
 * @param {any[]} [input.pictures] - this build's (`realPictures.forSite`): the manifest says which card shows its own picture
 * @returns {Promise<{written: number, skipped: number, conflict: number, failed: number}>}
 */
export async function writeWoCopy({
  api,
  copy,
  map,
  seed,
  woContent,
  note,
  slotRoles = null,
  locale = 'en',
  pictures = []
}) {
  const fromMap = emdashCopyWrites({ map, pinned: copy.pinned, seed })
  let writes = fromMap.writes
  const skipped = [...fromMap.skipped]
  if (slotRoles && copy.placeProfile)
    try {
      writes = await withSlotFill({ writes, skipped, slotRoles, copy, seed, woContent, locale, pictures })
    } catch (error) {
      // The plan never costs the map's writes: they are written as before.
      note(`the slot plan could not be made: ${error instanceof Error ? error.message : error}`)
    }
  const out = { written: 0, skipped: skipped.length, conflict: 0, failed: 0 }
  for (const w of writes) {
    const key = `emdash:${w.collection}/${w.slug}`
    const what = w.roles.map((r) => labelOf(map, r)).join(', ')
    const names = [...Object.keys(w.fields), ...Object.keys(w.items ?? {}).filter((f) => !(f in w.fields))]
    const route = (/** @type {string} */ ref, suffix = '') =>
      `/_emdash/api/content/${encodeURIComponent(w.collection)}/${encodeURIComponent(ref)}${suffix}?locale=${encodeURIComponent(w.locale)}`
    const read = async () => {
      const got = await api('GET', route(w.slug))
      const item = got?.item ?? got
      return {
        item,
        rev: got?._rev ?? null,
        live: item?.liveData ?? item?.data ?? {},
        draft: item?.draftRevisionId && item?.liveData ? (item.data ?? {}) : null
      }
    }
    const ours = (/** @type {Record<string, any>} */ data) =>
      Object.keys(w.fields).every((f) => holds(data[f], w.fields[f])) &&
      Object.entries(w.items ?? {}).every(([f, patches]) =>
        patches.every((p) => !data[f]?.[p.index] || holds(data[f][p.index][p.sub], p.value))
      )
    const receipt = (/** @type {string} */ state, extra = {}) =>
      woContent.recordWrite(copy.buildId, key, {
        state,
        roles: w.roles,
        labels: w.roles.map((r) => labelOf(map, r)),
        fields: names,
        sources: w.sources,
        ...extra
      })
    try {
      let state = 'failed'
      // One fresh read when the entry moved between our read and our write (`_rev` refused, 409); then it is left alone.
      for (let attempt = 0; attempt < 2 && state === 'failed'; attempt += 1) {
        const got = await read()
        if (got.item?.status !== 'published' || !got.item.id) {
          state = 'skipped'
          break
        }
        // The template's words, kept by the first run only: a re-Apply finds the tool's new words here and writes over them.
        await woContent.recordBefore(
          copy.buildId,
          key,
          Object.fromEntries(names.map((f) => [f, got.live[f] ?? null]))
        )
        if (ours(got.live)) {
          state = 'written'
          break
        }
        // A draft of ours left by a publish that failed is published as it is.
        if (!(got.draft && ours(got.draft))) {
          try {
            await api('PUT', route(String(got.item.id)), {
              data: patchItems({ ...got.live, ...w.fields }, w.items),
              _rev: got.rev
            })
          } catch (error) {
            if (/** @type {any} */ (error)?.status !== 409) throw error
            state = attempt === 0 ? 'failed' : 'conflict'
            continue
          }
        }
        await api('POST', route(String(got.item.id), '/publish'), {})
        const back = await read()
        state = back.item?.status === 'published' && ours(back.live) ? 'written' : 'unread'
      }
      if (state === 'written') {
        out.written += 1
        await receipt('written')
      } else if (state === 'skipped') {
        out.skipped += 1
        await receipt('skipped', { reason: 'the entry is not published on the site' })
      } else if (state === 'conflict') {
        out.conflict += 1
        note(`${what} not written: the entry changed while it was being written, twice`)
        await receipt('conflict', { reason: 'the entry changed between read and write' })
      } else {
        out.failed += 1
        note(`${what} may not be on the site: it did not read back as written`)
        await receipt('failed', { reason: 'did not read back as written' })
      }
    } catch (error) {
      out.failed += 1
      const reason = error instanceof Error ? error.message : String(error)
      note(`${what} could not be written from the restaurant's sources: ${reason}`)
      await receipt('failed', { reason }).catch(() => {})
    }
  }
  return out
}

/** @param {any} map @param {string} role */
const labelOf = (map, role) => (role === 'cards' ? map?.cards?.label : map?.roles?.[role]?.label) ?? role
