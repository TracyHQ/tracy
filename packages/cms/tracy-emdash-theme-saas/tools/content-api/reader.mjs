import { createHmac, timingSafeEqual } from 'node:crypto'
const TYPES = new Set(['page', 'article', 'service', 'project', 'shared', 'generic'])
export const MAX_BYTES = 256 * 1024
// `maxBytes`: the caller's budget for one answer, measured on the UTF-8 of the JSON envelope.
export const MIN_BUDGET = 8192
export const DEFAULT_BUDGET = 65536
export class ContentError extends Error {
  constructor(status, code, field, extras = {}) {
    super(code)
    this.status = status
    this.code = code
    this.field = field
    this.extras = extras
  }
}
const fail = () => {
  throw new ContentError(400, 'CONTENT_BAD_QUERY')
}
export function queryOf(url, locales) {
  const q = Object.fromEntries(url.searchParams)
  if ([...url.searchParams.keys()].length !== Object.keys(q).length) fail()
  if (
    Object.keys(q).some(
      (k) => !['id', 'type', 'locale', 'limit', 'cursor', 'blockId', 'blocksCursor', 'maxBytes'].includes(k)
    )
  )
    fail()
  if (Object.values(q).some((v) => !v || v.length > 4096)) fail()
  if (q.id && q.type) fail()
  if (
    (q.blockId || q.blocksCursor) &&
    (!q.id || !q.blockId || !q.blocksCursor || q.cursor || q.limit || q.locale)
  )
    fail()
  if ((q.type && !TYPES.has(q.type)) || (q.locale && !locales.includes(q.locale))) fail()
  if (q.limit && (!/^[1-9]\d*$/.test(q.limit) || +q.limit > 100)) fail()
  if (q.id && !/^[A-Za-z0-9_-]{43}$/.test(q.id)) fail()
  if (
    q.maxBytes !== undefined &&
    (!/^[1-9]\d*$/.test(q.maxBytes) || +q.maxBytes < MIN_BUDGET || +q.maxBytes > MAX_BYTES)
  )
    throw new ContentError(400, 'CONTENT_BAD_QUERY', 'maxBytes', {
      message: `maxBytes must be an integer from ${MIN_BUDGET} to ${MAX_BYTES}`,
      range: { min: MIN_BUDGET, max: MAX_BYTES }
    })
  return { ...q, limit: +(q.limit ?? 30), ...(q.maxBytes ? { maxBytes: +q.maxBytes } : {}) }
}
/**
 * Bring an answer holding one content within `budget` by cutting its text, never by dropping it.
 * The longest text value (a text field anywhere in the content, the HTML body, or a summary's
 * title) is cut to budget/2 characters first; if the answer still does not fit, that value and
 * then the next longest are cut further. Cuts fall on code-point boundaries, so the UTF-8 stays
 * whole. The content says `truncated: true`, and so does each field that was cut. Revisions are
 * those of the stored record and do not change.
 */
function cutToBudget(owner, budget, size) {
  const slots = []
  const field = (f) => {
    if (f?.type === 'text' && typeof f.value === 'string')
      slots.push({
        value: f.value,
        set(v, shorter) {
          if (f.key === 'title' && owner.title === f.value) owner.title = v
          f.value = v
          if (shorter) f.truncated = true
          else delete f.truncated
        }
      })
  }
  for (const f of owner.fields ?? []) field(f)
  for (const b of owner.blocks ?? []) {
    for (const f of b.fields ?? []) field(f)
    for (const item of b.items ?? []) for (const f of item.fields ?? []) field(f)
  }
  if (typeof owner.bodyHtml === 'string')
    slots.push({ value: owner.bodyHtml, set: (v) => (owner.bodyHtml = v) })
  // A summary carries no fields[]: its title and summary are the text it has.
  if (!owner.fields)
    for (const key of ['title', 'summary'])
      if (typeof owner[key] === 'string') slots.push({ value: owner[key], set: (v) => (owner[key] = v) })
  slots.sort((a, b) => b.value.length - a.value.length)
  // Flags are part of the answer, so they are in place before anything is measured.
  owner.truncated = true
  let cutAny = false
  slots.forEach((slot, rank) => {
    if (rank > 0 && size() <= budget) return
    const points = Array.from(slot.value)
    const cut = (n) => slot.set(points.slice(0, n).join(''), n < points.length)
    let keep = rank === 0 ? Math.min(points.length, Math.floor(budget / 2)) : points.length
    if (keep < points.length) cut(keep)
    if (size() > budget) {
      let low = 0
      while (low < keep) {
        const mid = Math.ceil((low + keep) / 2)
        cut(mid)
        if (size() <= budget) low = mid
        else keep = mid - 1
      }
      cut(low)
      keep = low
    }
    if (keep < points.length) cutAny = true
  })
  if (!cutAny) delete owner.truncated
}
/**
 * Every record in `collections`, as the native single-entry GET returns it, in native list order.
 * `list(collection, cursor)` answers one native list page ({ items, nextCursor }); `get(collection,
 * id)` one native entry ({ item }). Both throw a ContentError when the source refuses.
 *
 * A native list item is the same row, mapped by the same code, as the native GET's item, with
 * one difference: the GET overlays a pending draft (`liveData`) and hides draft fields from a
 * caller who may not read drafts. So only an entry with a draft revision is fetched on its own,
 * and the first entry without one in each collection is fetched too and compared byte for byte with its list item:
 * if they differ (another EmDash version, another caller role), that collection is fetched as before.
 * When current transactional schema is provided, reference-bearing collections always use GET;
 * reference-free collections reproduce the native empty references object before comparison.
 * A listing that took one GET per entry (~2000 on the Business seed) now takes one per list page.
 */
export async function sourceRows({ collections, list, get, published, referenceFree = null }) {
  const rows = []
  // null: not yet compared; true: list items equal native GET items on this site and caller.
  for (const collection of collections) {
    let listed = null
    let cursor
    do {
      const page = await list(collection, cursor)
      for (const nativeEntry of page.items) {
        // Schema is read in the same transaction as these rows. Native GET appends an empty
        // reference object only for a translation group in a collection without reference fields.
        const entry =
          referenceFree?.has(collection) && nativeEntry.translationGroup
            ? { ...nativeEntry, references: {} }
            : nativeEntry
        let item = entry
        if (
          entry.draftRevisionId ||
          listed !== true ||
          (referenceFree !== null && !referenceFree.has(collection))
        ) {
          item = (await get(collection, entry.id)).item
          if (listed === null && !entry.draftRevisionId)
            listed = JSON.stringify(entry) === JSON.stringify(item)
        }
        // Native draft hydration logs/falls back on failure. Fail closed instead.
        if (item.draftRevisionId && !item.liveData) throw new ContentError(503, 'CONTENT_SOURCE_UNAVAILABLE')
        if (published) {
          if (item.status !== 'published') continue
          item.data = item.liveData ?? item.data
          item.draftRevisionId = null
          delete item.liveData
        }
        rows.push({ collection, item })
      }
      cursor = page.nextCursor
      if (rows.length > 10000) throw new ContentError(501, 'CONTENT_ADAPTER_UNSUPPORTED')
    } while (cursor)
  }
  return rows
}
export function hasher(key) {
  return (...values) => createHmac('sha256', key).update(JSON.stringify(values)).digest('base64url')
}
export function cursorCodec(key) {
  const hash = hasher(key)
  return {
    encode(value) {
      const data = Buffer.from(JSON.stringify(value)).toString('base64url')
      return `${data}.${hash('cursor', data)}`
    },
    decode(cursor) {
      try {
        const [data, signature, extra] = cursor.split('.')
        const expected = hash('cursor', data)
        if (
          extra ||
          !signature ||
          signature.length !== expected.length ||
          !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        )
          fail()
        const value = JSON.parse(Buffer.from(data, 'base64url').toString())
        if (!Number.isSafeInteger(value.offset) || value.offset < 0 || !Number.isFinite(value.expires)) fail()
        return value
      } catch {
        fail()
      }
    }
  }
}
const iso = (v) => (v == null ? null : new Date(v).toISOString())
const ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
// `prose` is the site model's multi-line text: a plain string, projected as text.
const SCALARS = { text: 'text', prose: 'text', url: 'url', number: 'number', boolean: 'boolean' }
const scalarFits = (type, v) =>
  v === null ||
  (['text', 'url'].includes(type) && typeof v === 'string') ||
  (type === 'number' && typeof v === 'number' && Number.isFinite(v)) ||
  (type === 'boolean' && typeof v === 'boolean')
const dimension = (n) => (Number.isInteger(n) && n >= 1 ? n : null)
// A Portable Text block key that can stand in a field key (`<field>.<_key>`) and in a page stamp.
const BLOCK_KEY = /^[A-Za-z0-9_-]{1,64}$/
/**
 * Long text (`prose` in the site model), as plain-text values. A string (an EmDash `text` field) is
 * one value under the field's own key. Portable Text is one value per text block, keyed
 * `<field>.<_key>`: the block's stored key, which the EmDash editor keeps across saves, so a
 * paragraph's id survives edits, inserts and moves elsewhere in the field; the template stamps the
 * same key on the element it renders. A block without a usable key (absent, repeated, or not
 * stamp-safe) is never given an index-derived id: it is left out and `invalid` is set. Blocks that
 * are not text (images, embeds) are not words and are skipped. Anything else is `undefined`.
 */
function proseOf(key, value) {
  if (value === null || typeof value === 'string')
    return { fields: [{ key, type: 'text', value, slotKey: null, semanticKey: null }], invalid: false }
  if (!Array.isArray(value)) return undefined
  const text = value.filter((b) => b && b._type === 'block' && Array.isArray(b.children))
  const count = new Map()
  for (const b of text) count.set(b._key, (count.get(b._key) ?? 0) + 1)
  const usable = (b) => typeof b._key === 'string' && BLOCK_KEY.test(b._key) && count.get(b._key) === 1
  return {
    fields: text.filter(usable).map((b) => ({
      key: `${key}.${b._key}`,
      type: 'text',
      value: b.children.map((c) => (typeof c?.text === 'string' ? c.text : '')).join(''),
      slotKey: null,
      semanticKey: null
    })),
    invalid: text.some((b) => !usable(b))
  }
}
/**
 * The address the page serves a stored image at, as `src/lib/media.ts` mediaUrl() renders it:
 * local media at `/_emdash/api/media/file/<storageKey>` on the site origin, an external provider
 * at its own URL. `null` is an empty field; `undefined` a value this reader cannot place.
 */
function mediaOf(value, origin) {
  if (value === null || value === undefined || value === '') return null
  const local =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (!value.provider || value.provider === 'local') &&
        typeof value.meta?.storageKey === 'string' &&
        value.meta.storageKey
      : null
  const path =
    typeof value === 'string'
      ? value
      : local
        ? `/_emdash/api/media/file/${local}`
        : [value?.src, value?.url].find((u) => typeof u === 'string' && u)
  if (!path) return undefined
  let src
  try {
    src = new URL(path, origin).href
  } catch {
    return undefined
  }
  return {
    key: typeof value === 'object' && typeof value.id === 'string' && value.id ? value.id : src,
    src,
    // Stored text only: an absent alt stays null, never a filename or caption.
    alt: typeof value === 'object' && typeof value.alt === 'string' ? value.alt : null,
    width: typeof value === 'object' ? dimension(value.width) : null,
    height: typeof value === 'object' ? dimension(value.height) : null
  }
}
// Mapped scalars, long text, images and repeater rows that carry a stored row identity (`_rowId`, stamped by
// identity-sqlite.mjs). Rows without one are never given index- or hash-derived IDs.
// `detail: false` projects the head only (identity, summary, revision) with empty fields, blocks
// and images: what a listing sends, and all the rest of a scope contributes to any answer.
export function project(item, collection, options, hash, origin, detail = true) {
  const map = options.mapping.collections[collection]
  const defs = options.types.find((t) => t.name === collection)?.fields
  if (!map || !defs) throw new ContentError(501, 'CONTENT_ADAPTER_UNSUPPORTED')
  const id = hash('entry', collection, item.id, item.createdAt)
  const known = new Map(defs.map((f) => [f.name, f]))
  const fields = []
  const unresolved = []
  const blocks = []
  const images = new Map()
  // One entry per field: a repeater subfield is named once, not once per row.
  const unsupported = (key, message) => {
    if (!unresolved.some((u) => u.code === 'FIELD_UNSUPPORTED' && u.key === key))
      unresolved.push({ code: 'FIELD_UNSUPPORTED', message, contentId: id, key })
  }
  // One image entry per stored media, with every place in this content that shows it.
  const image = (value, key, usage) => {
    const m = mediaOf(value, origin)
    if (m === undefined) {
      unsupported(key, 'An image value has no address this reader can place.')
      return undefined
    }
    if (!m) return null
    const mediaId = hash('media', m.key)
    const entry = images.get(mediaId) ?? {
      id: mediaId,
      src: m.src,
      alt: m.alt,
      width: m.width,
      height: m.height,
      usages: []
    }
    // EmDash stores alt and size with each use; the first use that stores one fills it.
    entry.alt ??= m.alt
    entry.width ??= m.width
    entry.height ??= m.height
    entry.usages.push({ contentId: id, ...usage })
    images.set(mediaId, entry)
    return m.src
  }
  for (const [key, value] of Object.entries(detail ? item.data : {})) {
    if (key === map.bodyField) continue
    const def = known.get(key)
    if (
      def?.type === 'group' &&
      options.identifiedFields?.includes(`${collection}.${key}`) &&
      Array.isArray(value)
    ) {
      const seen = new Set()
      if (
        value.some(
          (row) =>
            !row ||
            typeof row._rowId !== 'string' ||
            !ROW_ID.test(row._rowId) ||
            seen.has(row._rowId) ||
            !seen.add(row._rowId)
        )
      ) {
        unresolved.push({
          code: 'REPEATER_IDENTITY_INVALID',
          message: 'Explicit identity repair is required.',
          contentId: id,
          key
        })
        continue
      }
      const blockId = hash('group', id, key)
      const items = value.map((row, position) => {
        const itemId = hash('item', id, key, row._rowId)
        return {
          id: itemId,
          position,
          contentId: null,
          fields: (def.fields ?? []).flatMap((f) => {
            const v = row[f.name] ?? null
            if (f.type === 'image') {
              const src = image(v, `${key}.${f.name}`, { blockId, itemId })
              return src === undefined
                ? []
                : [{ key: f.name, type: 'image', value: src, slotKey: null, semanticKey: null }]
            }
            if (f.type === 'prose' && (v === null || typeof v === 'string'))
              return [{ key: f.name, type: 'text', value: v, slotKey: null, semanticKey: null }]
            const type = SCALARS[f.type]
            if (!type || !scalarFits(type, v)) {
              unsupported(`${key}.${f.name}`, 'A repeater subfield is outside the supported projection.')
              return []
            }
            return [{ key: f.name, type, value: v, slotKey: null, semanticKey: null }]
          })
        }
      })
      blocks.push({
        id: blockId,
        key,
        role: null,
        position: blocks.length,
        sharedContentId: null,
        visibility: 'unknown',
        fields: [],
        items
      })
      continue
    }
    if (def?.type === 'image') {
      const src = image(value, key, { blockId: null, itemId: null })
      if (src !== undefined) fields.push({ key, type: 'image', value: src, slotKey: null, semanticKey: null })
      continue
    }
    if (def?.type === 'prose') {
      const prose = proseOf(key, value)
      if (!prose) unsupported(key, 'A readable field is outside the supported projection.')
      else {
        fields.push(...prose.fields)
        if (prose.invalid)
          unresolved.push({
            code: 'PROSE_IDENTITY_INVALID',
            message: 'Text blocks without a unique stored key are left out.',
            contentId: id,
            key
          })
      }
      continue
    }
    const type = SCALARS[def?.type]
    if (!type || !scalarFits(type, value)) {
      if (def?.type === 'group')
        unresolved.push({
          code: 'REPEATER_IDENTITY_UNSUPPORTED',
          message: 'This repeater has no stored row identity.',
          contentId: id,
          key
        })
      else unsupported(key, 'A readable field is outside the supported projection.')
      continue
    }
    fields.push({ key, type, value, slotKey: null, semanticKey: null })
  }
  if (item.locale && !options.locales.includes(item.locale))
    throw new ContentError(501, 'CONTENT_ADAPTER_UNSUPPORTED')
  const locale = item.locale ? Intl.getCanonicalLocales(item.locale)[0] : null
  // `urlField` names a data field holding the entry's own path: a site built from sections keeps
  // each page's path in its data (`/product/features` for slug `features`), which no slug pattern
  // can express. Otherwise `urlPattern` builds the path from the slug.
  const own = map.urlField ? item.data?.[map.urlField] : undefined
  let url =
    typeof own === 'string' && own.startsWith('/')
      ? own
      : map.urlPattern
        ? map.urlPattern.replace('{slug}', encodeURIComponent(item.slug ?? ''))
        : null
  if (url && item.locale && item.locale !== options.defaultLocale)
    url = `/${item.locale}${url === '/' ? '' : url}`
  const content = {
    id,
    type: map.type,
    title: typeof item.data.title === 'string' ? item.data.title : null,
    slug: item.slug ?? null,
    url: url ? new URL(url, origin).href : null,
    locale,
    translationGroupId: item.translationGroup
      ? hash('translations', collection, item.translationGroup)
      : null,
    summary: null,
    publishedAt: iso(item.publishedAt),
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
    revision: hash('record', item),
    publication: {
      status: ['published', 'draft', 'scheduled', 'private', 'archived'].includes(item.status)
        ? item.status
        : 'unknown',
      valueSource: item.draftRevisionId ? 'draft' : item.status === 'published' ? 'published' : 'current',
      scheduledAt: iso(item.scheduledAt)
    },
    detailState: 'complete',
    bodyHtml: map.bodyField && typeof item.data[map.bodyField] === 'string' ? item.data[map.bodyField] : null,
    tags: [],
    fields,
    blocks,
    images: [...images.values()],
    relations: [],
    links: { self: `/_emdash/api/content/tracy-content-v1.json?id=${id}` }
  }
  return { content, unresolved }
}
export function envelope(rows, query, options, identity, key, origin, siteSeed = key) {
  const hash = hasher(siteSeed)
  const codec = cursorCodec(key)
  // Only the content an `id` read returns needs its fields, blocks and images; every other
  // record contributes its head alone (ids, types, locales, revisions, summaries).
  const projected = rows.map(({ item, collection }) =>
    project(item, collection, options, hash, origin, false)
  )
  const target = query.id ? projected.findIndex((x) => x.content.id === query.id) : -1
  if (target >= 0)
    projected[target] = project(rows[target].item, rows[target].collection, options, hash, origin)
  const chromeIds = new Set(
    projected
      .filter((_, i) => {
        // One binding, or several when the chrome is printed from more than one entry (a header CTA,
        // a footer brand, a legal line…).
        const bindings = [options.mapping.chrome ?? []].flat()
        return bindings.some((b) => rows[i].collection === b.collection && rows[i].item.slug === b.slug)
      })
      .map((x) => x.content.id)
  )
  const all = projected.map((x) => x.content).sort((a, b) => a.id.localeCompare(b.id))
  // Relations and chrome occurrences are detail: a listing's summaries drop them, so they are
  // worked out only for the one content an `id` read returns (for every content this was
  // quadratic in the scope, ~2/3 of a `{limit:1}` read over the Business seed).
  for (const c of query.id ? all.filter((x) => x.id === query.id) : []) {
    c.relations = c.translationGroupId
      ? all
          .filter(
            (t) => t.id !== c.id && t.translationGroupId === c.translationGroupId && t.locale !== c.locale
          )
          .map((t) => ({ type: 'translation', contentId: t.id }))
      : []
    if (c.type !== 'shared' && c.url) {
      const shared = all.filter((s) => s.type === 'shared' && chromeIds.has(s.id) && s.locale === c.locale)
      c.blocks.push(
        ...shared.map((s, position) => ({
          id: hash('shared-occurrence', c.id, s.id),
          key: 'site-chrome',
          role: null,
          position: c.blocks.length + position,
          sharedContentId: s.id,
          visibility: 'unknown',
          fields: [],
          items: []
        }))
      )
    }
  }
  // Full authorized scope, including unsupported readable fields: conservative invalidation.
  // Permission-limited native GET strips drafts before they enter this digest.
  const revision = hash(
    'snapshot',
    origin,
    options,
    identity,
    all.map((c) => [c.id, c.revision]),
    rows.map((r) => [
      r.item.scheduledAt,
      r.item.scheduledAt ? Date.now() >= Date.parse(r.item.scheduledAt) : false
    ])
  )
  // Without an explicit maxBytes an answer is what it was before the budget existed: a listing
  // pages by whole contents at the default, a detail read keeps the 256 KiB ceiling, and nothing
  // is ever cut. Only a caller that sent maxBytes can receive a cut (`truncated: true`).
  const cuts = query.maxBytes !== undefined
  const budget = query.maxBytes ?? (query.id ? MAX_BYTES : DEFAULT_BUDGET)
  const filters = {
    id: query.id ?? null,
    type: query.type ?? null,
    locale: query.locale ?? null,
    limit: query.limit
  }
  const principal = hash('principal', identity)
  let offset = 0,
    expires = Date.now() + 300000
  if (query.cursor) {
    const cursor = codec.decode(query.cursor)
    if (JSON.stringify(cursor.filters) !== JSON.stringify(filters) || cursor.principal !== principal) fail()
    if (cursor.revision !== revision || cursor.expires < Date.now())
      throw new ContentError(409, 'CONTENT_SNAPSHOT_EXPIRED')
    offset = cursor.offset
    expires = cursor.expires
  }
  if (query.blocksCursor) {
    const c = codec.decode(query.blocksCursor)
    if (c.principal !== principal || c.owner !== query.id) fail()
    if (c.revision !== revision || c.expires < Date.now())
      throw new ContentError(409, 'CONTENT_SNAPSHOT_EXPIRED')
  }
  const filtered = all.filter(
    (c) =>
      (!query.id || c.id === query.id) &&
      (!query.type || c.type === query.type) &&
      (!query.locale || c.locale === query.locale)
  )
  if (query.id && !filtered.length) throw new ContentError(404, 'CONTENT_NOT_FOUND')
  const contents = filtered.slice(query.id ? 0 : offset, query.id ? 1 : offset + query.limit).map((c) => {
    if (query.id) return c
    const summary = { ...c }
    for (const key of ['bodyHtml', 'tags', 'fields', 'blocks', 'images', 'relations']) delete summary[key]
    return { ...summary, detailState: 'summary' }
  })
  const result = {
    schemaVersion: 'tracy-content/v1',
    view: 'authenticated',
    site: {
      id: hash('site'),
      name: null,
      url: origin,
      defaultLocale: Intl.getCanonicalLocales(options.defaultLocale)[0],
      locales: options.locales.map((l) => Intl.getCanonicalLocales(l)[0])
    },
    provenance: null,
    snapshot: { revision, readAt: new Date().toISOString() },
    // `bytes` holds the budget until the answer is final, so fitting counts its widest value.
    pagination: { limit: query.limit, nextCursor: null, total: filtered.length, budget, bytes: budget },
    completeness: {
      scope: 'mapped-content',
      status: 'partial',
      unresolved: [
        {
          code: 'RICH_TEXT_AND_MENUS_UNSUPPORTED',
          message:
            'Mapped scalars, long text (one value per Portable Text block with a stored key), images with their usages, repeater rows with a stored row identity and shared references; other rich-text blocks, references, menus and unmapped collections remain unsupported.'
        }
      ]
    },
    contents
  }
  const bytes = () => Buffer.byteLength(JSON.stringify(result))
  // The first content alone over an explicit budget is sent cut, never dropped (the 256 KiB
  // ceiling still refuses with 413); then `bytes` becomes the size of the answer as sent.
  const finish = (owner) => {
    if (cuts && owner && bytes() > budget) cutToBudget(owner, budget, bytes)
    for (let settled = false; !settled; ) {
      const size = bytes()
      settled = size === result.pagination.bytes
      result.pagination.bytes = size
    }
    return result
  }
  const relevant = new Set(contents.map((c) => c.id))
  if (query.id)
    result.completeness.unresolved.push(
      ...projected.filter((x) => relevant.has(x.content.id)).flatMap((x) => x.unresolved)
    )
  const blockCursor = (owner, position, itemOffset = 0) =>
    codec.encode({
      kind: 'blocks',
      owner: owner.id,
      offset: position,
      itemOffset,
      principal,
      revision,
      expires
    })
  const blockLink = (owner, position, cursor) =>
    new URL(
      `${owner.links.self}&blockId=${owner.blocks[position].id}&blocksCursor=${encodeURIComponent(cursor)}`,
      origin
    ).href
  if (query.blockId) {
    const cursor = codec.decode(query.blocksCursor),
      owner = contents[0],
      position = cursor.offset
    if (
      cursor.kind !== 'blocks' ||
      cursor.owner !== owner.id ||
      cursor.principal !== principal ||
      !Number.isSafeInteger(cursor.itemOffset) ||
      cursor.itemOffset < 0
    )
      fail()
    if (cursor.revision !== revision || cursor.expires < Date.now())
      throw new ContentError(409, 'CONTENT_SNAPSHOT_EXPIRED')
    if (owner.blocks[position]?.id !== query.blockId) fail()
    expires = cursor.expires
    const fullBlocks = owner.blocks,
      block = structuredClone(fullBlocks[position]),
      items = block.items,
      start = cursor.itemOffset
    let count = Math.min(30, items.length - start)
    if (count < 0) fail()
    delete owner.bodyHtml
    delete owner.fields
    delete owner.images
    delete owner.tags
    delete owner.relations
    owner.detailState = 'partial'
    owner.blocks = [block]
    const render = () => {
      block.items = items.slice(start, start + count)
      const moreItems = start + count < items.length,
        nextPosition = moreItems ? position : position + 1
      const next =
        nextPosition < fullBlocks.length
          ? blockCursor(owner, nextPosition, moreItems ? start + count : 0)
          : null
      owner.blocksPagination = { limit: 1, total: fullBlocks.length, nextCursor: next }
      block.itemsPagination = {
        limit: 30,
        total: items.length,
        nextCursor: moreItems ? next : null
      }
      owner.links.next = next
        ? new URL(
            `${owner.links.self}&blockId=${fullBlocks[nextPosition].id}&blocksCursor=${encodeURIComponent(next)}`,
            origin
          ).href
        : owner.links.self
    }
    render()
    while (Buffer.byteLength(JSON.stringify(result)) > budget && count > 1) {
      count--
      render()
    }
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) {
      const item = block.items[0],
        field = item?.fields.reduce((a, b) => (JSON.stringify(a).length > JSON.stringify(b).length ? a : b), {
          key: block.key,
          value: null
        })
      throw new ContentError(413, 'CONTENT_FIELD_TOO_LARGE', {
        contentId: owner.id,
        blockId: block.id,
        itemId: item?.id ?? null,
        key: field?.key ?? block.key
      })
    }
    return finish(owner)
  }
  if (
    query.id &&
    contents[0].bodyHtml &&
    Buffer.byteLength(JSON.stringify(contents[0].bodyHtml)) > MAX_BYTES - 4096
  ) {
    const owner = contents[0],
      first = owner.blocks.length ? blockCursor(owner, 0) : null
    throw new ContentError(
      413,
      'CONTENT_FIELD_TOO_LARGE',
      { contentId: owner.id, blockId: null, itemId: null, key: 'bodyHtml' },
      first ? { snapshot: result.snapshot, links: { firstBlock: blockLink(owner, 0, first) } } : {}
    )
  }
  const setCursor = () => {
    const next = offset + result.contents.length
    result.pagination.nextCursor =
      next < filtered.length ? codec.encode({ filters, principal, revision, offset: next, expires }) : null
  }
  if (query.id) {
    const owner = contents[0],
      full = owner.blocks.map((b) => b.items),
      flat = full.flat(),
      images = owner.images
    let count = Math.min(query.limit, Math.max(0, flat.length - offset))
    const render = () => {
      const end = offset + count,
        next = end < flat.length ? codec.encode({ filters, principal, revision, offset: end, expires }) : null
      let start = 0
      owner.blocks.forEach((b, i) => {
        const items = full[i]
        b.items = items.filter((_, j) => start + j >= offset && start + j < end)
        start += items.length
        b.itemsPagination = {
          limit: query.limit,
          total: items.length,
          nextCursor: start > end ? next : null
        }
      })
      // An image is listed with the usages this page can resolve: its content-level fields and
      // the items on this page. The rest come back with the items on the pages that carry them.
      const present = new Set(owner.blocks.flatMap((b) => b.items.map((item) => item.id)))
      owner.images = images
        .map((m) => ({ ...m, usages: m.usages.filter((u) => u.itemId === null || present.has(u.itemId)) }))
        .filter((m) => m.usages.length)
      owner.detailState = next || offset ? 'partial' : 'complete'
      owner.links = {
        self: owner.links.self,
        ...(next
          ? {
              next: `${owner.links.self}&limit=${query.limit}${query.maxBytes ? `&maxBytes=${budget}` : ''}&cursor=${encodeURIComponent(next)}`
            }
          : offset
            ? { next: owner.links.self }
            : {})
      }
    }
    render()
    while (Buffer.byteLength(JSON.stringify(result)) > budget && count > 1) {
      count--
      render()
    }
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES && flat[offset]) {
      const item = flat[offset],
        block = owner.blocks.find((b) => b.items.some((i) => i.id === item.id)),
        field = item.fields.reduce((a, b) => (JSON.stringify(a).length > JSON.stringify(b).length ? a : b), {
          key: 'title',
          value: null
        })
      if (Buffer.byteLength(JSON.stringify(field)) > MAX_BYTES - 4096)
        throw new ContentError(413, 'CONTENT_FIELD_TOO_LARGE', {
          contentId: owner.id,
          blockId: block.id,
          itemId: item.id,
          key: field.key
        })
    }
  } else setCursor()
  // A listing pages by content: whole contents while they fit the budget; the cursor names the
  // first one not sent. Sizes are summed once, then the sum is checked on the real serialization.
  if (!query.id && bytes() > budget) {
    const page = result.contents,
      sizes = page.map((c) => Buffer.byteLength(JSON.stringify(c)))
    result.contents = []
    setCursor()
    let used = bytes(),
      fit = 0
    // Each content after the first also costs its separating comma.
    while (fit < page.length && used + sizes[fit] + (fit ? 1 : 0) <= budget) {
      used += sizes[fit] + (fit ? 1 : 0)
      fit++
    }
    result.contents = page.slice(0, Math.max(fit, 1))
    setCursor()
    while (bytes() > budget && result.contents.length > 1) {
      result.contents.pop()
      setCursor()
    }
  }
  if (bytes() > MAX_BYTES) {
    const owner = result.contents[0]
    const field = owner?.fields?.reduce(
      (a, b) => (JSON.stringify(a).length > JSON.stringify(b).length ? a : b),
      { key: 'title', value: owner.title }
    )
    if (query.id && Buffer.byteLength(JSON.stringify(field)) < MAX_BYTES - 4096)
      throw new ContentError(501, 'CONTENT_ADAPTER_UNSUPPORTED')
    throw new ContentError(413, 'CONTENT_FIELD_TOO_LARGE', {
      contentId: owner.id,
      blockId: null,
      itemId: null,
      key: field?.key ?? 'title'
    })
  }
  return finish(result.contents[0])
}
