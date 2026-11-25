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
  return null
}

/**
 * Every entity the content map names, as the site holds it now: `{entity, found, item?, rev?, settings?, terms?}`.
 * @returns {Promise<{ ok: true, state: Map<string, any>, revision: string } | { ok: false, code: string, detail: any }>}
 */
async function readState({ contentMap, calls, markdown }) {
  const entities = contentMap.entities.filter((e) => e?.key && readCall(e, { markdown }))
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
  for (const slot of contentMap.slots) {
    if (!slot?.key || !slot.entity) continue
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
  return { body: { ok: true, contract, revision: read.revision, slots, pages } }
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
    if ((slot.target?.setting === 'title' || slot.type === 'term') && value.trim() === '') {
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
    const into = byEntity.get(slot.entity) ?? { held, data: {}, settings: {}, terms: new Map() }
    byEntity.set(slot.entity, into)
    const t = slot.target
    const v = stored(slot, value, pictures)
    if (v === undefined) continue
    if (t.setting) into.settings[t.setting] = v
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
    if (e.kind === 'taxonomy')
      for (const [termSlug, label] of w.terms)
        writes.push({
          entity: entityKey,
          call: { tool: 'taxonomy_update_term', args: { taxonomy: e.identity.taxonomy, termSlug, label } }
        })
  }
  return writes
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
  const mapSlots = new Map(contentMap.slots.filter((s) => s?.key).map((s) => [s.key, s]))
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
  if (operation === 'apply') {
    const done = await apply({ siteKey, contentMap, calls, params })
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
      `content.contract ${operation} has no EmDash door: an EmDash site takes inspect and apply (words, pictures, links, emptied slots)`
    )
  }
}
