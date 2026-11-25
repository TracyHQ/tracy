/**
 * `content.contract` (`inspect`, `apply`) and `info` on an EmDash site, for the Apply door (`route.js` `applyDoorOnce`): the
 * content contract the write step reads and writes on every CMS (`write-step/site-doors/`), answered from the release's
 * content map (`lib/content-map-source.js`) over the site's own MCP tools. EmDash has no Tracy component, so the site's host
 * makes the calls inside the site's container (`apps/tracy-host/src/emdash-content.js`), as `media.upload` is made
 * (`emdash-media.js`); tracy-web keeps its read-only PAT.
 *
 * THE CONTRACT IS THE CONTENT MAP. One slot per mapped field, read from the entry, setting or term the map names: an entry
 * field (`{collection, entry, field}`), one field of a repeater row (`… item, sub`), a site setting (`{setting}`) or a
 * term's label (`{taxonomy, term}`). An entry or row the site does not hold lists no slot, so the write step leaves its
 * slots out by name (`missingOnSite`). The answers have the shape the Claude Cowork for Joomla gives (`slots`, `pages`,
 * `revision`; a refusal `errors: [{code, message, field: {slotKey}}]`), so the write step's rounds and words are the same.
 *
 * 🔒 ALL OR NOTHING, AS ON JOOMLA. `apply` checks the revision, every slot and every picture before the first write; a
 * refusal names the slots it refuses and writes nothing, so the write step's next round goes without exactly those
 * (`contract-write.js`). Only a call the site itself refuses after an earlier one landed is a partial write, said with
 * `landed: true`.
 *
 * 🔒 THE REVISION IS EVERY MAPPED ENTITY'S `_rev`, plus the settings and the terms the map names: any change to any of them
 * between an inspect and an apply refuses the apply ("Content changed; inspect again"), as the plugin's does.
 *
 * What a published entry was stays published: its new words are published at once (`content_update` with `status:
 * 'published'`). An entry that is a draft (a page hidden earlier) gets its words and stays a draft.
 */
import { createHash } from 'node:crypto'
import { openContentMap } from '../lib/content-map-source.js'
import { contractFor } from '../lib/contracts.js'
import { kitContracts } from '../lib/template-kit-contracts.js'

/** What the write step's stages ask of `info` (write-step/plugin-doors.js): slots are emptied through `empty_slots`. */
export const EMDASH_INFO = Object.freeze({
  platform: 'emdash',
  hide_ops: Object.freeze({ version: 1, rows_remove: 0 }),
  page_create: Object.freeze({ version: 0 }),
  slot_corrections: 0
})

/** The most calls one host request carries (`MAX_CALLS` in apps/tracy-host/src/emdash-content.js). */
const HOST_CALLS = 200
/** How many pages of the media library a picture is looked for in, newest first, 100 a page. */
const MEDIA_PAGES = 10
/** A picture the write step uploaded: `images/tracy-content/<sha256>.<ext>` (write-step/picture-package.js). */
const PICTURE_PATH = /^\/?images\/tracy-content\/([0-9a-f]{64}\.(?:png|jpe?g|webp))$/i
/** An address a link field may hold. */
const ADDRESS = /^(?:\/(?!\/)|#|https?:\/\/|mailto:|tel:)\S*$/i
/** The slot types whose field may be left empty: the Diner theme draws nothing for an empty one; nobody measured it. */
const EMPTIABLE = new Set(['text', 'url', 'image', 'richtext'])

const refusal = (error, message, extra = {}) => ({ ok: false, error, message, ...extra })
const slotError = (slotKey, code, message) => ({ code, message, field: { slotKey } })
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/**
 * The contract and content map an EmDash site is built from, or null: its release tag and version against the kit index
 * (`template-kit-contracts.js`, which alone holds the EmDash kits).
 * @param {{ quickstart_tag?: string | null, quickstart_version?: string | null } | null} site
 * @param {{ index?: Map<string, any> }} [options]
 * @returns {{ contract: string, contentMap: any } | null}
 */
export function emdashContractOf(site, { index = kitContracts() } = {}) {
  const found = contractFor(index, site?.quickstart_tag, site?.quickstart_version)
  if (!found?.id || found.platform !== 'emdash') return null
  const map = openContentMap(found.id, { index })
  if (!map?.doc || !Array.isArray(map.doc.slots) || !Array.isArray(map.doc.entities)) return null
  return { contract: found.id, contentMap: map.doc }
}

/** The host's 11 minutes: longer than its own bound on one request of calls (`emdash-content.js`, 10 minutes). */
const HOST_TIMEOUT_MS = 11 * 60_000

/**
 * A list of calls on this site, made by the site's host (`POST /_host/emdash-content`): `{ok, results}`, or the host's
 * refusal `{code, detail}`, or `SITE_UNREACHABLE` when the host gave no answer at all.
 * @param {{ host: { hostCall: Function }, config: any, fetchImpl: typeof fetch, site: { label: string, host: string } }} input
 */
export function emdashHostCalls({ host, config, fetchImpl, site }) {
  return async (list) => {
    const answer = await host.hostCall(
      config,
      site.host,
      '/emdash-content',
      { label: site.label, calls: list },
      { fetchImpl, timeoutMs: HOST_TIMEOUT_MS }
    )
    return answer?.body ?? { ok: false, code: 'SITE_UNREACHABLE', detail: `HTTP ${answer?.status ?? 0}` }
  }
}

// ── Pictures the Apply door uploaded ─────────────────────────────────────────────────────────────────────────────────────
// `media.upload` answers the item's id (`emdash-media.js`); the contract write names the picture by the path it uploaded,
// whose file name is the library's. Kept here for the run that uploads and then writes, in this process; the library is
// looked through by file name when the process restarted between the two.
const UPLOADED_LIMIT = 5000
/** @type {Map<string, string>} `<siteKey> <file name>` → media id, oldest first */
const uploaded = new Map()

/** A picture the door just placed in a site's library. */
export function rememberEmdashPicture(siteKey, filename, id) {
  if (typeof filename !== 'string' || typeof id !== 'string') return
  const key = `${siteKey} ${filename.toLowerCase()}`
  uploaded.delete(key)
  uploaded.set(key, id)
  if (uploaded.size > UPLOADED_LIMIT) uploaded.delete(uploaded.keys().next().value)
}
const uploadedPicture = (siteKey, filename) => uploaded.get(`${siteKey} ${filename.toLowerCase()}`) ?? null

// ── Reading the site ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every call in order, in host requests of at most {@link HOST_CALLS}; a refused request refuses all. */
async function callAll(calls, list) {
  const results = []
  for (let at = 0; at < list.length; at += HOST_CALLS) {
    const done = await calls(list.slice(at, at + HOST_CALLS))
    if (!done?.ok) return { ok: false, code: done?.code ?? 'SITE_UNREACHABLE', detail: done?.detail ?? null }
    results.push(...done.results)
  }
  return { ok: true, results }
}

/** The MCP call that reads one content map entity. */
function readCall(entity, { markdown }) {
  if (entity.kind === 'entry')
    return {
      tool: 'content_get',
      args: {
        collection: entity.identity.collection,
        id: entity.identity.slug,
        ...(markdown ? { markdown: true } : {})
      }
    }
  if (entity.kind === 'settings') return { tool: 'settings_get', args: {} }
  if (entity.kind === 'taxonomy')
    return { tool: 'taxonomy_list_terms', args: { taxonomy: entity.identity.taxonomy, limit: 100 } }
  if (entity.kind === 'menu') return { tool: 'menu_get', args: { name: entity.identity.name } }
  return null
}

/** The menus the content map lists, as entities of their own: `menu.<name>`. */
const menuEntities = (contentMap) =>
  (Array.isArray(contentMap.menus) ? contentMap.menus : [])
    .filter((m) => typeof m?.name === 'string' && m.name)
    .map((m) => ({ key: `menu.${m.name}`, kind: 'menu', identity: { name: m.name } }))

/**
 * A menu's items as a tree in menu order, parents before their children: `{position, item, parent}`, the position 1-based
 * by order under its parent (`2.1`: the first child of the second top item), as the main menu's slot ids name them
 * (`lib/site-copy/main-menu-emdash.js`: `menu.<name>.<position>.label`).
 */
export function menuTree(items) {
  const list = (Array.isArray(items) ? items : []).filter((i) => isObject(i) && typeof i.id === 'string')
  const under = (parent) =>
    list
      .filter((i) => (i.parentId ?? null) === parent)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const out = []
  const walk = (parent, prefix) =>
    under(parent).forEach((item, i) => {
      const position = prefix ? `${prefix}.${i + 1}` : String(i + 1)
      out.push({ position, item, parent: prefix || null })
      walk(item.id, position)
    })
  walk(null, '')
  return out
}

/** The label slots of the menus the site holds: one per item, text, emptied by taking the item off the menu. */
function menuSlotsOf(state) {
  const slots = []
  for (const held of state.values()) {
    if (held.entity.kind !== 'menu' || !held.found) continue
    for (const node of menuTree(held.items))
      slots.push({
        key: `${held.entity.key}.${node.position}.label`,
        entity: held.entity.key,
        target: { menu: held.entity.identity.name, position: node.position },
        type: 'text',
        role: 'editorial.menu_label',
        label: `Menu ${held.entity.identity.name}: ${node.item.label}`,
        sample: String(node.item.label ?? '')
      })
  }
  return slots
}

/** Every slot of the contract on this site: the content map's, and the menus' labels. */
const slotsOf = (contentMap, state) => [...contentMap.slots.filter((s) => s?.key), ...menuSlotsOf(state)]

/**
 * Every entity the content map names, as the site holds it now: `{entity, found, item?, rev?, settings?, terms?}`.
 * @returns {Promise<{ ok: true, state: Map<string, any>, revision: string } | { ok: false, code: string, detail: any }>}
 */
async function readState({ contentMap, calls, markdown }) {
  const entities = [...contentMap.entities, ...menuEntities(contentMap)].filter(
    (e) => e?.key && readCall(e, { markdown })
  )
  const read = await callAll(
    calls,
    entities.map((e) => readCall(e, { markdown }))
  )
  if (!read.ok) return read
  const state = new Map()
  for (const [i, entity] of entities.entries()) {
    const answer = read.results[i]
    if (!answer?.ok) {
      state.set(entity.key, { entity, found: false, why: answer?.detail ?? answer?.code ?? null })
      continue
    }
    const data = answer.data
    if (entity.kind === 'entry') {
      const item = data?.item ?? null
      state.set(entity.key, { entity, found: Boolean(item?.id), item, rev: data?._rev ?? item?._rev ?? null })
    } else if (entity.kind === 'settings')
      state.set(entity.key, { entity, found: true, settings: data ?? {} })
    else if (entity.kind === 'menu')
      state.set(entity.key, { entity, found: true, items: Array.isArray(data?.items) ? data.items : [] })
    else
      state.set(entity.key, {
        entity,
        found: true,
        terms: (Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.terms)
            ? data.terms
            : []
        ).filter(isObject)
      })
  }
  return { ok: true, state, revision: revisionOf(state, contentMap) }
}

/** The revision of what the content map reads: each entry's `_rev`, the mapped settings, the mapped terms' labels. */
function revisionOf(state, contentMap) {
  const settingNames = contentMap.slots.filter((s) => s?.target?.setting).map((s) => s.target.setting)
  const parts = [...state.values()].map((s) => {
    if (!s.found) return [s.entity.key, null]
    if (s.entity.kind === 'entry') return [s.entity.key, s.rev ?? hashOf(s.item?.data ?? null)]
    if (s.entity.kind === 'settings')
      return [s.entity.key, settingNames.map((name) => [name, s.settings?.[name] ?? null])]
    if (s.entity.kind === 'menu')
      return [s.entity.key, menuTree(s.items).map((n) => [n.position, n.item.id, n.item.label])]
    return [s.entity.key, s.terms.map((t) => [t.slug, t.label]).sort()]
  })
  return `emdash-${hashOf(parts).slice(0, 40)}`
}

const hashOf = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** The working data of an entry: what `content_update` changes (its draft when it has one). */
const dataOf = (item) => (isObject(item?.data) ? item.data : {})

/** A picture field's value as a page draws it (`mediaUrl` in the theme's `src/lib/media.ts`), '' when empty. */
function pictureUrl(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  const key = value.meta?.storageKey
  if ((!value.provider || value.provider === 'local') && typeof key === 'string' && key)
    return `/_emdash/api/media/file/${key}`
  return String(value.src ?? value.url ?? '')
}

/** What a slot's field holds now, or undefined when the site has no such field (an entry or row it lacks). */
function heldValue(slot, state) {
  const t = slot.target ?? {}
  const held = state.get(slot.entity)
  if (!held?.found) return undefined
  if (t.setting) return held.settings?.[t.setting] ?? ''
  if (t.menu) {
    const node = menuTree(held.items).find((n) => n.position === t.position)
    return node ? String(node.item.label ?? '') : undefined
  }
  if (t.taxonomy) {
    const term = held.terms.find((x) => x.slug === t.term)
    return term ? String(term.label ?? '') : undefined
  }
  const data = dataOf(held.item)
  if (t.item === undefined) return data[t.field] ?? ''
  const rows = data[t.field]
  if (!Array.isArray(rows) || !isObject(rows[t.item])) return undefined
  return rows[t.item][t.sub] ?? ''
}

/** A held value as the contract reads it: words, an address, a picture's address. */
function asWords(slot, value) {
  if (slot.type === 'image') return pictureUrl(value)
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // A rich text field read without its Markdown (an array of blocks): its words, block by block.
  if (Array.isArray(value))
    return value
      .map((b) => (Array.isArray(b?.children) ? b.children.map((c) => String(c?.text ?? '')).join('') : ''))
      .filter(Boolean)
      .join('\n\n')
  return ''
}

/** Whether the site can leave this slot's field empty. */
const canEmpty = (slot) => EMPTIABLE.has(slot.type) && !slot.target?.setting && !slot.target?.taxonomy

/** The inspect answer: the contract's slots the site holds, its pages, its revision. */
async function inspect({ contract, contentMap, calls }) {
  const read = await readState({ contentMap, calls, markdown: true })
  if (!read.ok) return { site: read }
  const slots = []
  for (const slot of slotsOf(contentMap, read.state)) {
    if (!slot.entity) continue
    const value = heldValue(slot, read.state)
    if (value === undefined) continue
    const t = slot.target ?? {}
    slots.push({
      key: slot.key,
      entity: slot.entity,
      type: slot.type,
      ...(slot.role ? { role: slot.role } : {}),
      ...(slot.label ? { label: slot.label } : {}),
      sample: typeof slot.sample === 'string' ? slot.sample : '',
      current: asWords(slot, value),
      canHide: canEmpty(slot) ? 'unmeasured' : false,
      ...(t.item !== undefined ? { row: `${slot.entity}.${t.field}[${t.item}]` } : {})
    })
  }
  const pages = (Array.isArray(contentMap.pages) ? contentMap.pages : [])
    .filter((p) => read.state.get(p?.entity)?.found)
    .map((p) => ({
      entity: p.entity,
      route: p.route,
      ...(p.title ? { title: p.title } : {}),
      published: read.state.get(p.entity).item?.status === 'published'
    }))
  // Each page entry's state by entity, which a page taken off reads back from (`pages.unpublish`).
  const pageStates = Object.fromEntries(
    pages.map((p) => [p.entity, read.state.get(p.entity).item?.status ?? null])
  )
  return { body: { ok: true, contract, revision: read.revision, slots, pages, pageStates } }
}

// ── Words as the field takes them ────────────────────────────────────────────────────────────────────────────────────────
// The write step's words carry the contract's markup in double parentheses (`((p))…((/p))`, `((li))`, `((strong))`:
// `contract-mapping.js` `joinItems`), which the Joomla plugin turns into HTML. A rich text field here takes Markdown (the
// MCP tool converts it to Portable Text); a plain field takes the words alone.

const TAG = /\(\(\s*(\/?)([a-z0-9]+)(?:\s[^()]*)?\s*\)\)/gi

/** Markdown of contract words, for a rich text field. */
export function markdownOf(words) {
  let out = ''
  let list = null
  let n = 0
  const parts = String(words).split(TAG)
  // split with two groups: [text, close, tag, text, close, tag, …]
  for (let i = 0; i < parts.length; i += 3) {
    // Inside a list, the line breaks between its items are the source's, not the words'.
    const text = parts[i] ?? ''
    if (!(list && text.trim() === '')) out += text
    if (i + 2 >= parts.length) break
    const close = parts[i + 1] === '/'
    const tag = String(parts[i + 2]).toLowerCase()
    if (tag === 'ul' || tag === 'ol') {
      list = close ? null : tag
      n = 0
      out += '\n\n'
    } else if (tag === 'li') {
      if (!close) out += list === 'ol' ? `${++n}. ` : '- '
      else out += '\n'
    } else if (tag === 'p' || tag === 'div') out += close ? '\n\n' : ''
    else if (tag === 'br') out += '  \n'
    else if (tag === 'strong' || tag === 'b') out += '**'
    else if (tag === 'em' || tag === 'i') out += '*'
  }
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, (s) => (s === '  ' ? s : '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The words alone, for a plain field: paragraphs and list items each on a line. */
export function plainOf(words) {
  const text = String(words)
  if (!/\(\(/.test(text)) return text
  return text
    .replace(/\(\(\s*(?:\/p|\/li|br|\/div)\s*\)\)/gi, '\n')
    .replace(TAG, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

// ── Applying ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Each refused slot, before anything is sent: `{errors}`, or the field values to write. */
function judge({ slots, mapSlots, changes, emptySlots, emptyLinks }) {
  const errors = []
  const values = new Map()
  for (const key of emptyLinks)
    errors.push(slotError(key, 'SLOT_NOT_HIDEABLE', 'An EmDash field holds no link to take off on its own'))
  for (const [key, value] of Object.entries(changes)) {
    const slot = mapSlots.get(key)
    const held = slots.get(key)
    if (!slot || held === undefined) {
      errors.push(slotError(key, 'SLOT_UNKNOWN', `The site has no content slot ${key}`))
      continue
    }
    if (typeof value !== 'string') {
      errors.push(slotError(key, 'SLOT_NOT_SCALAR', `The value of ${key} is not words`))
      continue
    }
    if (slot.type === 'url' && value.trim() !== '' && !ADDRESS.test(value.trim())) {
      errors.push(slotError(key, 'SLOT_BAD_URL', `${JSON.stringify(value.slice(0, 80))} is no address`))
      continue
    }
    if (slot.type === 'date' && Number.isNaN(Date.parse(value))) {
      errors.push(slotError(key, 'SLOT_BAD_DATE', `${JSON.stringify(value.slice(0, 40))} is no date`))
      continue
    }
    if (slot.type === 'image' && value !== asWords(slot, held) && !PICTURE_PATH.test(value)) {
      errors.push(
        slotError(
          key,
          'SLOT_BAD_PICTURE',
          `${JSON.stringify(value.slice(0, 80))} is no picture this run uploaded`
        )
      )
      continue
    }
    if (
      (slot.target?.setting === 'title' || slot.target?.menu || slot.type === 'term') &&
      value.trim() === ''
    ) {
      errors.push(slotError(key, 'SLOT_REQUIRED', `${key} cannot be empty`))
      continue
    }
    values.set(key, value)
  }
  for (const key of emptySlots) {
    const slot = mapSlots.get(key)
    if (!slot || slots.get(key) === undefined) {
      errors.push(slotError(key, 'SLOT_UNKNOWN', `The site has no content slot ${key}`))
      continue
    }
    if (!canEmpty(slot)) {
      errors.push(slotError(key, 'SLOT_NOT_HIDEABLE', `${key} cannot be left empty`))
      continue
    }
    values.set(key, null)
  }
  return { errors, values }
}

/** The library items of the pictures the changes name, by file name; the names not found are absent. */
async function findPictures({ siteKey, names, calls }) {
  const ids = new Map()
  const wanted = new Set(names)
  for (const name of wanted) {
    const id = uploadedPicture(siteKey, name)
    if (id) ids.set(name, id)
  }
  let cursor = null
  for (let page = 0; page < MEDIA_PAGES && [...wanted].some((n) => !ids.has(n)); page += 1) {
    const listed = await callAll(calls, [
      { tool: 'media_list', args: { mimeType: 'image/', limit: 100, ...(cursor ? { cursor } : {}) } }
    ])
    if (!listed.ok) return listed
    const answer = listed.results[0]
    if (!answer?.ok) break
    for (const item of Array.isArray(answer.data?.items) ? answer.data.items : []) {
      const name = String(item?.filename ?? '').toLowerCase()
      if (wanted.has(name) && !ids.has(name) && typeof item.id === 'string') ids.set(name, item.id)
    }
    cursor = typeof answer.data?.nextCursor === 'string' ? answer.data.nextCursor : null
    if (!cursor) break
  }
  const list = [...ids.entries()]
  if (!list.length) return { ok: true, items: new Map() }
  const got = await callAll(
    calls,
    list.map(([, id]) => ({ tool: 'media_get', args: { id } }))
  )
  if (!got.ok) return got
  const items = new Map()
  for (const [i, [name]] of list.entries()) {
    const item = got.results[i]?.ok ? (got.results[i].data?.item ?? got.results[i].data) : null
    if (typeof item?.id === 'string' && typeof item.storageKey === 'string') items.set(name, item)
  }
  return { ok: true, items }
}

/** A picture field's value for a library item, the shape the theme and the admin read (`emdash-real-pictures.js`). */
const pictureValue = (item) => ({
  id: item.id,
  provider: 'local',
  meta: { storageKey: item.storageKey },
  src: `/_emdash/api/media/file/${item.storageKey}`,
  ...(Number.isFinite(item.width) ? { width: item.width } : {}),
  ...(Number.isFinite(item.height) ? { height: item.height } : {}),
  alt: typeof item.alt === 'string' ? item.alt : '',
  ...(typeof item.mimeType === 'string' ? { mimeType: item.mimeType } : {})
})

/** One value as its field stores it: null empties the field. */
function stored(slot, value, pictures) {
  if (slot.type === 'image') {
    if (value === null) return null
    const name = PICTURE_PATH.exec(value)?.[1]?.toLowerCase()
    return name ? pictureValue(pictures.get(name)) : undefined
  }
  if (value === null) return ''
  if (slot.type === 'richtext') return markdownOf(value)
  if (slot.type === 'date') return new Date(value).toISOString()
  return plainOf(value)
}

/** The MCP writes of an apply, one per entity it changes. */
function writesOf({ values, mapSlots, state, pictures }) {
  /** @type {Map<string, { entity: any, held: any, data: Record<string, any>, settings: Record<string, any>, terms: Map<string, string> }>} */
  const byEntity = new Map()
  for (const [key, value] of values) {
    const slot = mapSlots.get(key)
    const held = state.get(slot.entity)
    const into = byEntity.get(slot.entity) ?? {
      held,
      data: {},
      settings: {},
      terms: new Map(),
      menu: new Map()
    }
    byEntity.set(slot.entity, into)
    const t = slot.target
    const v = stored(slot, value, pictures)
    if (v === undefined) continue
    if (t.menu) into.menu.set(t.position, value === null ? null : v)
    else if (t.setting) into.settings[t.setting] = v
    else if (t.taxonomy) into.terms.set(t.term, v)
    else if (t.item === undefined) into.data[t.field] = v
    else {
      // A repeater is written whole: its rows as the site holds them, with this row's field changed.
      const rows = into.data[t.field] ?? structuredClone(dataOf(held.item)[t.field])
      rows[t.item] = { ...rows[t.item], [t.sub]: v }
      into.data[t.field] = rows
    }
  }
  const writes = []
  for (const [entityKey, w] of byEntity) {
    const e = w.held.entity
    if (e.kind === 'entry' && Object.keys(w.data).length)
      writes.push({
        entity: entityKey,
        call: {
          tool: 'content_update',
          args: {
            collection: e.identity.collection,
            id: w.held.item.id,
            data: w.data,
            _rev: w.held.rev,
            ...(w.held.item.status === 'published' ? { status: 'published' } : {})
          }
        }
      })
    if (e.kind === 'settings' && Object.keys(w.settings).length)
      writes.push({ entity: entityKey, call: { tool: 'settings_update', args: w.settings } })
    if (e.kind === 'menu' && w.menu.size)
      writes.push({
        entity: entityKey,
        call: {
          tool: 'menu_set_items',
          args: { name: e.identity.name, items: menuItemsOf(w.held.items, w.menu) }
        }
      })
    if (e.kind === 'taxonomy')
      for (const [termSlug, label] of w.terms)
        writes.push({
          entity: entityKey,
          call: { tool: 'taxonomy_update_term', args: { taxonomy: e.identity.taxonomy, termSlug, label } }
        })
  }
  return writes
}

/**
 * A menu's whole item list for `menu_set_items`, from the items it holds: each label of `changed` (by position) changed,
 * each position whose label is null taken off with the items under it. Every other item is kept as it is, in its order.
 */
export function menuItemsOf(items, changed) {
  const out = []
  const index = new Map()
  for (const node of menuTree(items)) {
    if (changed.get(node.position) === null) continue
    if (node.parent && !index.has(node.parent)) continue
    const it = node.item
    const own = (name) => (typeof it[name] === 'string' && it[name] ? { [name]: it[name] } : {})
    index.set(node.position, out.length)
    out.push({
      label: changed.has(node.position) ? changed.get(node.position) : String(it.label ?? ''),
      type: it.type,
      ...own('customUrl'),
      ...own('referenceCollection'),
      ...own('referenceId'),
      ...own('titleAttr'),
      ...own('target'),
      ...own('cssClasses'),
      ...(node.parent ? { parentIndex: index.get(node.parent) } : {})
    })
  }
  return out
}

/**
 * `pages.unpublish` `{pages: [entity], apply_id}`: the page entries a plan drops, made drafts, so no visitor reaches them.
 * Only the content map's pages; one that is a draft already is left as it is. All or nothing: a page refused writes none.
 */
async function unpublishPages({ contentMap, calls, params }) {
  if (typeof params.apply_id !== 'string' || !params.apply_id.trim())
    return { body: refusal('bad_params', 'apply_id required') }
  const asked = Array.isArray(params.pages) ? params.pages.filter((p) => typeof p === 'string') : []
  if (!asked.length) return { body: refusal('bad_params', 'pages: the page entities to take off') }
  const read = await readState({ contentMap, calls, markdown: false })
  if (!read.ok) return { site: read }
  const pages = new Set((Array.isArray(contentMap.pages) ? contentMap.pages : []).map((p) => p?.entity))
  const errors = []
  const writes = []
  for (const entity of asked) {
    const held = read.state.get(entity)
    if (!pages.has(entity) || held?.entity.kind !== 'entry') {
      errors.push(slotError(entity, 'PAGE_UNKNOWN', `${entity} is not a page of this release`))
      continue
    }
    if (!held.found) {
      errors.push(slotError(entity, 'PAGE_UNKNOWN', `The site has no page ${entity}`))
      continue
    }
    if (held.item.status !== 'published') continue
    writes.push({
      entity,
      call: {
        tool: 'content_update',
        args: {
          collection: held.entity.identity.collection,
          id: held.item.id,
          _rev: held.rev,
          status: 'draft'
        }
      }
    })
  }
  if (errors.length)
    return {
      body: refusal('pages_refused', `${errors.length} pages refused; nothing was taken off`, { errors })
    }
  if (!writes.length)
    return { body: { ok: true, apply_id: params.apply_id, unpublished: [], unchanged: true } }
  const sent = await callAll(
    calls,
    writes.map((w) => w.call)
  )
  if (!sent.ok) return { site: sent, writing: true }
  const failed = writes.filter((_, i) => !sent.results[i]?.ok)
  if (failed.length) {
    const landed = failed.length < writes.length
    return {
      body: refusal(
        'write_failed',
        `${failed.length} of ${writes.length} pages were not taken off by the site (${failed
          .map((w) => w.entity)
          .join(', ')})`,
        { landed }
      ),
      landed
    }
  }
  return { body: { ok: true, apply_id: params.apply_id, unpublished: writes.map((w) => w.entity) } }
}

async function apply({ siteKey, contentMap, calls, params }) {
  if (typeof params.expected_revision !== 'string' || !params.expected_revision)
    return { body: refusal('bad_params', 'expected_revision required: inspect the site first') }
  if (typeof params.apply_id !== 'string' || !params.apply_id.trim())
    return { body: refusal('bad_params', 'apply_id required') }
  const changes = params.changes ?? {}
  if (!isObject(changes)) return { body: refusal('bad_params', 'changes: an object of slot keys and words') }
  const list = (name) =>
    Array.isArray(params[name]) ? params[name].filter((k) => typeof k === 'string') : []
  const emptySlots = list('empty_slots')
  const emptyLinks = list('empty_links')
  if (!Object.keys(changes).length && !emptySlots.length && !emptyLinks.length)
    return { body: refusal('bad_params', 'The mapping contains no customer content') }

  const read = await readState({ contentMap, calls, markdown: false })
  if (!read.ok) return { site: read }
  if (read.revision !== params.expected_revision)
    return { body: refusal('revision_mismatch', 'Content changed; inspect again') }
  const mapSlots = new Map(slotsOf(contentMap, read.state).map((s) => [s.key, s]))
  const held = new Map([...mapSlots].map(([key, slot]) => [key, heldValue(slot, read.state)]))
  const { errors, values } = judge({ slots: held, mapSlots, changes, emptySlots, emptyLinks })

  // Every picture named must be in the library before anything is written.
  const names = [...values]
    .filter(([key, v]) => mapSlots.get(key).type === 'image' && typeof v === 'string')
    .map(([, v]) => PICTURE_PATH.exec(v)?.[1]?.toLowerCase())
    .filter(Boolean)
  let pictures = new Map()
  if (names.length) {
    const found = await findPictures({ siteKey, names, calls })
    if (!found.ok) return { site: found }
    pictures = found.items
    for (const [key, v] of values) {
      const name = typeof v === 'string' ? PICTURE_PATH.exec(v)?.[1]?.toLowerCase() : null
      if (mapSlots.get(key).type === 'image' && name && !pictures.has(name)) {
        errors.push(slotError(key, 'PICTURE_NOT_IN_LIBRARY', `${name} is not in the site's media library`))
        values.delete(key)
      }
    }
  }
  // An unchanged picture is not written again.
  for (const [key, v] of values)
    if (mapSlots.get(key).type === 'image' && typeof v === 'string' && !PICTURE_PATH.test(v))
      values.delete(key)
  if (errors.length)
    return {
      body: refusal(
        'contract_refused',
        `${errors.length} slot${errors.length === 1 ? '' : 's'} refused; nothing was written`,
        { errors }
      )
    }

  const writes = writesOf({ values, mapSlots, state: read.state, pictures })
  if (!writes.length) return { body: { ok: true, apply_id: params.apply_id, applied: 0, unchanged: true } }
  const sent = await callAll(
    calls,
    writes.map((w) => w.call)
  )
  if (!sent.ok) return { site: sent, writing: true }
  const failed = writes
    .map((w, i) => ({ entity: w.entity, answer: sent.results[i] }))
    .filter((x) => !x.answer?.ok)
  if (failed.length) {
    const landed = failed.length < writes.length
    return {
      body: refusal(
        'write_failed',
        `${failed.length} of ${writes.length} writes were refused by the site (${failed
          .slice(0, 3)
          .map((f) => `${f.entity}: ${f.answer?.detail ?? f.answer?.code ?? 'no answer'}`)
          .join('; ')})${landed ? '; the others landed' : ''}`,
        { landed, failed: failed.map((f) => ({ entity: f.entity, code: f.answer?.code ?? null })) }
      ),
      landed
    }
  }
  return {
    body: { ok: true, apply_id: params.apply_id, applied: values.size, entities: writes.length }
  }
}

/** Words for a host refusal, as the door answers a site that did not answer. */
function siteAnswer(site, writing) {
  const detail = typeof site.detail === 'string' && site.detail ? `: ${site.detail}` : ''
  const clean = site.code === 'BAD_REQUEST' || site.code === 'NOT_EMDASH' || site.code === 'NO_TOKEN'
  return {
    outcome: clean || !writing ? 'refused' : 'unknown',
    status: clean ? 409 : 502,
    body: {
      ok: false,
      code: clean ? `EMDASH_${site.code}` : 'EMDASH_CONTENT_UNREACHABLE',
      error: site.code,
      message: `The site's content tools did not answer (${site.code}${detail})${
        writing ? '; the write may have landed — inspect again to see what the site holds' : ''
      }`
    }
  }
}

/**
 * One `content.contract` call on an EmDash site.
 * @param {{ siteKey: string, params: Record<string, unknown>, contract: string, contentMap: any,
 *   calls: (list: {tool: string, args?: object}[]) => Promise<any> }} input
 *   `calls`: the host's `/emdash-content` with this site's label (`{ok, results}` or its refusal)
 * @returns {Promise<{ outcome: 'ok' | 'refused' | 'unknown', status: number, body: Record<string, unknown>, landed?: boolean }>}
 */
export async function emdashContractCall({ siteKey, params, contract, contentMap, calls }) {
  const operation = typeof params.operation === 'string' ? params.operation.trim() : 'inspect'
  if (operation === '' || operation === 'inspect') {
    const done = await inspect({ contract, contentMap, calls })
    return done.site ? siteAnswer(done.site, false) : { outcome: 'ok', status: 200, body: done.body }
  }
  if (operation === 'apply' || operation === 'pages.unpublish') {
    const done =
      operation === 'apply'
        ? await apply({ siteKey, contentMap, calls, params })
        : await unpublishPages({ contentMap, calls, params })
    if (done.site) return siteAnswer(done.site, Boolean(done.writing))
    if (done.body.ok) return { outcome: 'ok', status: 200, body: done.body }
    return {
      outcome: done.landed ? 'unknown' : 'refused',
      status: 200,
      body: done.body,
      landed: Boolean(done.landed)
    }
  }
  return {
    outcome: 'refused',
    status: 200,
    body: refusal(
      'operation_not_on_emdash',
      `content.contract ${operation} has no EmDash door: an EmDash site takes inspect, apply (words, pictures, links, emptied slots) and pages.unpublish`
    )
  }
}

// ── The brand's settings ─────────────────────────────────────────────────────────────────────────────────────────────────
// The write step's brand stage on EmDash (`write-step/brand-writes.js` `writeEmdashSettings`) asks two actions of the shape
// the REST door it was written for answers (`write-step/emdash-brand-door.js`): the core settings `logo` and `favicon`, and
// the picture field of a template's singleton entry (the dark logo of `chrome`). Both run over the same content tools.

/** The settings the brand writes: media references `{mediaId, alt?}`, or null to take one off. */
const BRAND_SETTINGS = new Set(['logo', 'favicon'])

const brandAnswer = (body) => ({ outcome: body.ok ? 'ok' : 'refused', status: 200, body })

/**
 * `emdash.settings` `{operation: 'read' | 'set', fields}` and `emdash.entryField` `{operation: 'read' | 'set', collection,
 * slug, field, media}` on an EmDash site.
 * @param {{ action: string, params: Record<string, any>, calls: Function }} input
 * @returns {Promise<{ outcome: 'ok' | 'refused' | 'unknown', status: number, body: Record<string, unknown> }>}
 */
export async function emdashBrandCall({ action, params, calls }) {
  const writing = params.operation === 'set'
  if (params.operation !== undefined && params.operation !== 'read' && !writing)
    return brandAnswer(refusal('bad_params', 'operation: read or set'))
  if (action === 'emdash.settings') {
    if (!writing) {
      const read = await callAll(calls, [{ tool: 'settings_get', args: {} }])
      if (!read.ok) return siteAnswer(read, false)
      const answer = read.results[0]
      return brandAnswer(
        answer.ok ? { ok: true, fields: answer.data ?? {} } : refusal('site_refused', answer.detail)
      )
    }
    const fields = isObject(params.fields) ? params.fields : {}
    const names = Object.keys(fields)
    if (!names.length) return brandAnswer(refusal('bad_params', 'fields: logo and/or favicon'))
    const args = {}
    for (const name of names) {
      const value = fields[name]
      if (!BRAND_SETTINGS.has(name))
        return brandAnswer(
          refusal('unsupported', `${name} is not a setting the brand writes (logo, favicon)`)
        )
      if (value !== null && !(isObject(value) && typeof value.mediaId === 'string' && value.mediaId))
        return brandAnswer(refusal('bad_params', `${name}: {mediaId, alt?} or null`))
      args[name] =
        value === null
          ? null
          : { mediaId: value.mediaId, ...(typeof value.alt === 'string' ? { alt: value.alt } : {}) }
    }
    const sent = await callAll(calls, [{ tool: 'settings_update', args }])
    if (!sent.ok) return siteAnswer(sent, true)
    const answer = sent.results[0]
    return brandAnswer(
      answer.ok ? { ok: true, fields: answer.data ?? {} } : refusal('site_refused', answer.detail)
    )
  }
  // emdash.entryField: one picture field of one entry.
  for (const name of ['collection', 'slug', 'field'])
    if (typeof params[name] !== 'string' || !params[name])
      return brandAnswer(refusal('bad_params', `${name} required`))
  const read = await callAll(calls, [
    { tool: 'content_get', args: { collection: params.collection, id: params.slug } }
  ])
  if (!read.ok) return siteAnswer(read, false)
  const got = read.results[0]
  if (!got.ok || !got.data?.item?.id)
    return brandAnswer(refusal('not_found', got.detail ?? `${params.slug} not found`))
  const item = got.data.item
  const locales = [item.locale].filter(Boolean)
  if (!writing) return brandAnswer({ ok: true, mediaId: dataOf(item)[params.field]?.id ?? null, locales })
  if (typeof params.media !== 'string' || !params.media)
    return brandAnswer(refusal('bad_params', 'media required'))
  const media = await callAll(calls, [{ tool: 'media_get', args: { id: params.media } }])
  if (!media.ok) return siteAnswer(media, false)
  const found = media.results[0]?.ok ? (media.results[0].data?.item ?? media.results[0].data) : null
  if (typeof found?.id !== 'string' || typeof found.storageKey !== 'string')
    return brandAnswer(refusal('not_found', `the media item ${params.media} is not in the library`))
  const sent = await callAll(calls, [
    {
      tool: 'content_update',
      args: {
        collection: params.collection,
        id: item.id,
        data: { [params.field]: pictureValue(found) },
        _rev: got.data._rev ?? null,
        ...(item.status === 'published' ? { status: 'published' } : {})
      }
    }
  ])
  if (!sent.ok) return siteAnswer(sent, true)
  const answer = sent.results[0]
  return brandAnswer(answer.ok ? { ok: true, locales } : refusal('site_refused', answer.detail))
}
