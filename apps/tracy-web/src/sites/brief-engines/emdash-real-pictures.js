/** Image-only EmDash adapter. Maps are read from the release; prose is never part of this stage. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { cutForPlace, demoTransparency, placeholderPicture } from '../../lib/picture-cut.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'

const fail = (code) => Object.assign(new Error(code), { code })
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, child]) => [key, stable(child)])
        )
      : value
const hash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')
const enc = encodeURIComponent
const withoutGeneratedRows = (value, row = false) =>
  Array.isArray(value)
    ? value.map((child) => withoutGeneratedRows(child, true))
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(
              ([key, child]) =>
                !(
                  row &&
                  key === '_rowId' &&
                  typeof child === 'string' &&
                  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(child)
                )
            )
            .map(([key, child]) => [key, withoutGeneratedRows(child)])
        )
      : value
const PROTECTED = /(?:^|[\s/_-])(?:logo|icon|avatar|portrait|owner|founder|certificate|award)(?:$|[\s/_-])/i
const parts = (field) => {
  if (!/^[a-zA-Z_]\w*(?:\[\d+\]|\.[a-zA-Z_]\w*)*$/.test(field)) throw fail('PICTURE_FIELD_PATH')
  const keys = field.replace(/\[(\d+)\]/g, '.$1').split('.')
  if (keys.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key)))
    throw fail('PICTURE_FIELD_PATH')
  return keys
}
const get = (data, field) => parts(field).reduce((value, key) => value?.[key], data)
function put(data, field, value) {
  const keys = parts(field),
    last = keys.pop()
  const parent = keys.reduce((value, key) => value?.[key], data)
  if (!parent || typeof parent !== 'object') throw fail('PICTURE_FIELD_MISSING')
  parent[last] = value
}
function recordHash(data, slots) {
  const copy = structuredClone(data)
  for (const slot of slots) {
    const image = get(copy, slot.path)
    if (image?.id)
      put(copy, slot.path, {
        id: image.id,
        alt: image.alt ?? '',
        width: image.width ?? null,
        height: image.height ?? null,
        storageKey: image.meta?.storageKey ?? null
      })
  }
  return hash(withoutGeneratedRows(copy))
}
function imageField(collection, field) {
  const keys = parts(field)
  let fields = collection?.fields ?? [],
    definition
  for (let i = 0; i < keys.length; i += 1) {
    if (/^\d+$/.test(keys[i])) continue
    definition = fields.find((f) => f.slug === keys[i])
    if (!definition) return false
    fields = definition.type === 'repeater' ? (definition.validation?.subFields ?? []) : []
  }
  return ['image', 'media'].includes(definition?.type)
}

/** A derived inventory, not a second contract. Every binding is declared by the release's media map. */
/**
 * @param {{seedDir: string, locales?: string[], hiddenPageIds?: string[], keep?: (target: any) => boolean,
 *   admit?: Set<string>}} input - `admit`: picture slots of a sidecar's entity groups (`collection.slug.path`,
 *   `emdashCardPictureSlots`), filled from their own entity even in a collection otherwise left alone (a team, reviews)
 */
export async function emdashPictureInventory({
  seedDir,
  locales,
  hiddenPageIds = [],
  keep = () => true,
  admit = new Set()
}) {
  const read = (name) => JSON.parse(readFileSync(path.join(seedDir, name), 'utf8'))
  const seed = read('seed.json'),
    media = read('media-map.json'),
    personalize = read('personalize.json')
  const apiMap = existsSync(path.join(seedDir, 'content-api-map.json')) ? read('content-api-map.json') : null
  if (hiddenPageIds.length && !apiMap?.collections) throw fail('PICTURE_PAGE_SCOPE_UNAVAILABLE')
  const routeOf = (target) => {
    const binding = apiMap?.collections?.[target.collection]
    const entry = target.data
      ? target
      : seed.content?.[target.collection]?.find(
          (r) =>
            r.slug === target.slug &&
            (r.locale ?? seed.defaultLocale) === (target.locale ?? seed.defaultLocale)
        )
    const route =
      binding?.urlPattern?.replace('{slug}', target.slug) ??
      (binding?.urlField ? entry?.data?.[binding.urlField] : null)
    return typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') ? route : null
  }
  const sharedRoutes = new Map()
  const includeSections = (data, route, locale, visited = new Set()) => {
    for (const section of data?.sections ?? []) {
      if (typeof section?.collection !== 'string' || typeof section.entry !== 'string') continue
      const key = `${section.collection}/${section.entry}@${locale}`
      if (visited.has(key)) continue
      visited.add(key)
      sharedRoutes.set(key, [...new Set([...(sharedRoutes.get(key) ?? []), route])])
      const entry = seed.content?.[section.collection]?.find(
        (r) => r.slug === section.entry && (r.locale ?? seed.defaultLocale) === locale
      )
      if (entry) includeSections(entry.data, route, locale, visited)
    }
  }
  for (const [collection, rows] of Object.entries(seed.content ?? {})) {
    if (apiMap?.collections?.[collection]?.type !== 'page') continue
    for (const entry of rows) {
      const route = routeOf({ collection, ...entry })
      if (route) includeSections(entry.data, route, entry.locale ?? seed.defaultLocale)
    }
  }
  const hiddenRoutes = []
  for (const id of hiddenPageIds) {
    const matches = Object.entries(seed.content ?? {}).flatMap(([collection, rows]) =>
      apiMap.collections[collection]?.type === 'page'
        ? rows
            .filter((r) => r.slug === id && (r.locale ?? seed.defaultLocale) === seed.defaultLocale)
            .map((r) => ({ collection, ...r }))
        : []
    )
    if (matches.length !== 1) throw fail('PICTURE_PAGE_SCOPE_UNAVAILABLE')
    const route = routeOf(matches[0])
    if (route && route !== '/') hiddenRoutes.push(route.replace(/\/$/, ''))
  }
  const allowed = new Set(locales?.length ? locales : [seed.defaultLocale])
  const slots = [],
    excluded = [],
    seen = new Set()
  for (const item of media.items ?? []) {
    if (!/^image\/(?:jpeg|png|webp)$/.test(item.mime ?? '')) continue
    const file = path.resolve(seedDir, item.copied ?? `media/${item.file}`)
    if (!file.startsWith(`${path.resolve(seedDir)}${path.sep}`)) throw fail('PICTURE_SEED_PATH')
    let bytes, metadata
    for (const target of item.targets ?? []) {
      if (!allowed.has(target.locale) || !keep(target)) continue
      const id = `${target.collection}/${target.slug}@${target.locale}:${target.path}`
      const routes = [
        ...new Set(
          [
            routeOf(target),
            ...(sharedRoutes.get(`${target.collection}/${target.slug}@${target.locale}`) ?? [])
          ].filter(Boolean)
        )
      ]
      const keptRoutes = routes.filter(
        (route) => !hiddenRoutes.some((hidden) => route === hidden || route.startsWith(`${hidden}/`))
      )
      if (routes.length && !keptRoutes.length) continue
      if (!routes.length) {
        excluded.push({ id, reason: 'unresolved-page-binding' })
        continue
      }
      if (seen.has(id)) throw fail('PICTURE_DUPLICATE_BINDING')
      seen.add(id)
      const collection = seed.collections.find((c) => c.slug === target.collection)
      const entry = seed.content?.[target.collection]?.find(
        (r) => r.slug === target.slug && (r.locale ?? seed.defaultLocale) === target.locale
      )
      const intent = personalize.images?.targets?.find(
        (t) => t.collection === target.collection && t.slug === target.slug && t.field === target.path
      )
      const admitted = admit.has(`${target.collection}.${target.slug}.${target.path}`)
      if (
        !entry ||
        !imageField(collection, target.path) ||
        (!admitted &&
          (/(?:team|staff|map)[_[.]/i.test(target.path) ||
            PROTECTED.test(`${item.key} ${target.path}`) ||
            /^(?:team|people|clients|testimonials|teams)$/.test(target.collection)))
      ) {
        excluded.push({ id, reason: 'protected-or-unsupported-field' })
        continue
      }
      if (!bytes) {
        bytes = readFileSync(file)
        metadata = await sharp(bytes, { limitInputPixels: 100000000 }).metadata()
        metadata.transparent = metadata.hasAlpha ? await demoTransparency(bytes) : false
      }
      if (
        metadata.transparent !== false ||
        !metadata.width ||
        !metadata.height ||
        Math.max(metadata.width, metadata.height) < 120
      ) {
        excluded.push({ id, reason: 'decorative-or-unmeasured-image' })
        continue
      }
      const role = /hero|banner/.test(`${target.collection} ${target.path}`)
        ? 'hero'
        : /gallery\[/.test(target.path)
          ? 'gallery'
          : 'section-main'
      // A route's bindings share a conservative page identity, including repeater images.
      slots.push({
        id,
        ...target,
        role,
        intent:
          intent?.what ??
          collection.fields.find((f) => f.slug === parts(target.path)[0])?.label ??
          target.path,
        demo: { width: metadata.width, height: metadata.height },
        demoHash: `sha1:${createHash('sha1').update(bytes).digest('hex')}`,
        file: item.file,
        recordKey: `${target.collection}/${target.slug}@${target.locale}`,
        route: keptRoutes[0],
        routes: keptRoutes.map((route) => `${target.locale}:${route}`),
        home: keptRoutes.includes('/'),
        // Keep the row identity so a reordered gallery cannot receive another row's image.
        rowId: target.path.includes('[')
          ? (get(entry.data, target.path.split('.').slice(0, -1).join('.'))?._rowId ?? null)
          : null
      })
    }
  }
  return {
    schemaVersion: 'tracy-emdash-picture-inventory/1',
    slots,
    excluded,
    hash: hash({ seed, media, personalize, apiMap, slots, excluded })
  }
}

/**
 * No writes and no models. Select from every admitted photo using cached labels and the shared planner.
 * `bound`: a sidecar's card pictures by `collection.slug.path` (`emdashCardPictures`), each card its own entity's.
 */
export async function planEmdashPictures({
  inventory,
  real,
  loadDomain = websiteOpportunitiesDomain,
  bound = {}
}) {
  const domain = await loadDomain()
  const groups = [...inventory.slots]
    .sort(
      (a, b) =>
        Number(b.home && b.role === 'hero') - Number(a.home && a.role === 'hero') || a.id.localeCompare(b.id)
    )
    .map((s) => ({
      id: s.id,
      file: s.file,
      demo: s.demo,
      role: s.role,
      routes: s.routes,
      home: s.home,
      topic: [],
      occurrences: [{ key: s.id }]
    }))
  const labels = real.pictures.map((p) => domain.labelPicture(p))
  const { clusterOf } = domain.nearCopies(labels)
  // A picture has no language: a card's binding holds in every locale's copy of it.
  const binding = new Map(
    inventory.slots
      .map((s) => [s.id, `${s.collection}.${s.slug}.${s.path}`])
      .filter(([, key]) => Object.hasOwn(bound ?? {}, key))
      .map(([id, key]) => [id, bound[key]])
  )
  const made = domain.planPlacement({ groups, labels, clusterOf, bound: binding })
  const value = {
    ...made,
    schemaVersion: 'tracy-emdash-real-pictures/1',
    inventoryHash: inventory.hash,
    buildId: real.buildId,
    sources: real.pictures.map(({ id, sha256 }) => ({ id, sha256 })).sort((a, b) => a.id.localeCompare(b.id))
  }
  return { ...value, hash: hash(value) }
}

/** Strict native CAS writes, recorded beside the build's existing picture plan and receipts. */
export async function writeEmdashPictures({
  inventory,
  real,
  realPictures,
  api,
  upload,
  signal,
  loadDomain,
  bound = {}
}) {
  signal?.throwIfAborted()
  const capability = await api('GET', '/_emdash/api/write-capabilities')
  if (
    capability?.schemaVersion !== 'emdash-conditional-writes/1' ||
    capability.backend !== 'node-sqlite' ||
    capability.conditionalContentWrite !== true ||
    capability.conditionalPublish !== true ||
    capability.mutationRevisionReceipts !== true
  )
    throw fail('PICTURE_CONDITIONAL_WRITES_REQUIRED')
  const fresh = await planEmdashPictures({ inventory, real, loadDomain, bound })
  const plan = real.plan ?? (await realPictures.recordPlan(real.buildId, fresh))
  const { hash: digest, ...body } = plan
  if (
    plan.schemaVersion !== fresh.schemaVersion ||
    plan.inventoryHash !== inventory.hash ||
    plan.buildId !== real.buildId ||
    hash(body) !== digest ||
    hash(plan.sources) !== hash(fresh.sources)
  )
    throw fail('PICTURE_PLAN_CHANGED')
  const receipts = { ...real.receipts },
    report = {
      placed: 0,
      placeholders: 0,
      excluded: inventory.excluded,
      gaps: plan.unfilled,
      verified: false
    }
  const save = () => realPictures.recordOutcome(real.buildId, { receipts, report })
  // Validate every live destination before uploading the first photograph.
  const records = new Map(),
    schemas = new Map()
  const targets = [...plan.placements, ...plan.unfilled.map((p) => ({ groupId: p.groupId, mediaId: null }))]
  for (const slot of inventory.slots) {
    if (!targets.some((p) => p.groupId === slot.id)) continue
    if (!schemas.has(slot.collection)) {
      const schema = await api(
        'GET',
        `/_emdash/api/schema/collections/${enc(slot.collection)}?includeFields=true`
      )
      if (!schema.item?.supports?.includes('revisions')) throw fail('PICTURE_SCHEMA_CHANGED')
      schemas.set(slot.collection, schema.item)
    }
    if (!imageField(schemas.get(slot.collection), slot.path)) throw fail('PICTURE_SCHEMA_CHANGED')
    if (!records.has(slot.recordKey)) {
      const route = `/_emdash/api/content/${enc(slot.collection)}/${enc(slot.slug)}?locale=${enc(slot.locale)}`
      const read = await api('GET', route),
        item = read?.item
      const recordSlots = inventory.slots.filter((s) => s.recordKey === slot.recordKey)
      const owned = recordSlots.map((s) => receipts[s.id]).filter(Boolean)
      if (owned.some((r) => ['sending', 'unknown'].includes(r.state)))
        throw fail('PICTURE_MUTATION_UNCERTAIN')
      if (!item?.draftRevisionId && owned.some((r) => r.state === 'written'))
        throw fail('PICTURE_MUTATION_UNCERTAIN')
      const ownedDraft =
        item?.draftRevisionId &&
        owned.length &&
        owned.every(
          (r) =>
            r.state === 'written' &&
            r.revision === read._rev &&
            r.expectedDataHash === recordHash(item.data, recordSlots)
        )
      if (
        !item?.id ||
        item.slug !== slot.slug ||
        (item.type && item.type !== slot.collection) ||
        item.locale !== slot.locale ||
        item.status !== 'published' ||
        (item.draftRevisionId && !ownedDraft) ||
        item.scheduledAt ||
        !read._rev
      )
        throw fail('PICTURE_LIVE_STATE_CHANGED')
      records.set(slot.recordKey, {
        route,
        item,
        revision: read._rev,
        data: structuredClone(ownedDraft ? item.data : (item.liveData ?? item.data))
      })
    }
    const current = get(records.get(slot.recordKey).data, slot.path),
      previous = receipts[slot.id]
    const parentPath = parts(slot.path).slice(0, -1)
    if (
      parentPath.length &&
      !parentPath.reduce((value, key) => value?.[key], records.get(slot.recordKey).data)
    )
      throw fail('PICTURE_REPEATER_CHANGED')
    if (!current?.id) throw fail('PICTURE_EDITOR_CHANGED')
    if (current?.id && current.id !== previous?.mediaId) {
      const media = await api('GET', `/_emdash/api/media/${enc(current.id)}`)
      if ((media.item ?? media).contentHash !== slot.demoHash) throw fail('PICTURE_EDITOR_CHANGED')
    }
    const record = records.get(slot.recordKey)
    const ownPublished =
      previous?.state === 'published' &&
      previous.revision === record.revision &&
      previous.expectedDataHash ===
        recordHash(
          record.data,
          inventory.slots.filter((s) => s.recordKey === slot.recordKey)
        )
    if (
      slot.path.includes('[') &&
      previous?.rowId &&
      !ownPublished &&
      !records.get(slot.recordKey).item.draftRevisionId &&
      get(records.get(slot.recordKey).data, slot.path.split('.').slice(0, -1).join('.'))?._rowId !==
        previous.rowId
    )
      throw fail('PICTURE_REPEATER_CHANGED')
  }
  for (const [key, record] of records) {
    const slots = inventory.slots.filter((s) => s.recordKey === key)
    let changed = false
    for (const slot of slots) {
      const placement = targets.find((p) => p.groupId === slot.id)
      if (!placement) continue
      signal?.throwIfAborted()
      const source = placement.mediaId === null ? null : real.pictures.find((p) => p.id === placement.mediaId)
      let cut
      if (placement.mediaId === null) {
        const scale = Math.min(1, 1600 / slot.demo.width)
        cut = await placeholderPicture({
          width: Math.round(slot.demo.width * scale),
          height: Math.round(slot.demo.height * scale),
          colours: real.colours ?? []
        })
      } else {
        const bytes = await real.bytes(placement.mediaId)
        if (!source || !bytes || createHash('sha256').update(bytes).digest('hex') !== source.sha256)
          throw fail('PICTURE_SOURCE_CHANGED')
        cut = await cutForPlace(bytes, placement.crop)
      }
      const old = receipts[slot.id]
      let receipt = old
      if (!receipt?.mediaId) {
        const got = await upload({ bytes: cut.bytes, hash: cut.sha256, ext: cut.ext })
        if (!got?.ok || !got.id) throw fail('PICTURE_UPLOAD_FAILED')
        const media = await api('GET', `/_emdash/api/media/${enc(got.id)}`),
          item = media.item ?? media
        const expected = `sha1:${createHash('sha1').update(cut.bytes).digest('hex')}`
        if (
          item.id !== got.id ||
          item.status !== 'ready' ||
          item.contentHash !== expected ||
          !item.storageKey
        )
          throw fail('PICTURE_UPLOAD_UNVERIFIED')
        receipt = receipts[slot.id] = {
          state: 'uploaded',
          mediaId: item.id,
          kind: source ? 'photo' : 'placeholder',
          sourceId: source?.id ?? null,
          sourceHash: source?.sha256 ?? null,
          derivativeHash: cut.sha256,
          storageKey: item.storageKey,
          path: `/_emdash/api/media/file/${item.storageKey}`,
          before: get(record.data, slot.path) ?? null,
          rowId: slot.path.includes('[')
            ? (get(record.data, slot.path.split('.').slice(0, -1).join('.'))?._rowId ?? null)
            : null
        }
        await save()
      }
      if (receipt.sourceHash !== (source?.sha256 ?? null) || receipt.derivativeHash !== cut.sha256)
        throw fail('PICTURE_RECEIPT_CHANGED')
      const current = get(record.data, slot.path)
      const checkMedia = await api('GET', `/_emdash/api/media/${enc(receipt.mediaId)}`)
      const heldMedia = checkMedia.item ?? checkMedia
      if (
        heldMedia.status !== 'ready' ||
        heldMedia.storageKey !== receipt.storageKey ||
        heldMedia.contentHash !== `sha1:${createHash('sha1').update(cut.bytes).digest('hex')}`
      )
        throw fail('PICTURE_UPLOAD_UNVERIFIED')
      if (current?.id === receipt.mediaId && receipt.state === 'published') {
        if (
          receipt.revision !== record.revision ||
          receipt.expectedDataHash !== recordHash(record.data, slots)
        )
          throw fail('PICTURE_MUTATION_UNCERTAIN')
        receipt.state = 'verified'
        if (slot.path.includes('['))
          receipt.rowId = get(record.data, slot.path.split('.').slice(0, -1).join('.'))?._rowId ?? null
        await save()
      }
      if (current?.id === receipt.mediaId && receipt.state === 'verified') {
        report[receipt.kind === 'placeholder' ? 'placeholders' : 'placed'] += 1
        continue
      }
      put(record.data, slot.path, {
        id: receipt.mediaId,
        provider: 'local',
        meta: { storageKey: receipt.storageKey },
        src: `/_emdash/api/media/file/${receipt.storageKey}`,
        width: cut.width,
        height: cut.height,
        alt: source?.vision?.oneLine ?? '',
        mimeType: 'image/jpeg'
      })
      changed = true
    }
    if (!changed) continue
    signal?.throwIfAborted()
    const route = `/_emdash/api/content/${enc(slots[0].collection)}/${enc(record.item.id)}?locale=${enc(slots[0].locale)}`
    for (const slot of slots)
      if (receipts[slot.id])
        Object.assign(receipts[slot.id], {
          expectedRevision: record.revision,
          state: 'sending',
          expectedDataHash: recordHash(record.data, slots)
        })
    await save()
    let updated
    try {
      updated = await api('PUT', route, { data: record.data, _rev: record.revision })
    } catch (error) {
      for (const slot of slots)
        if (receipts[slot.id])
          Object.assign(receipts[slot.id], { state: error.status === 409 ? 'conflict' : 'unknown' })
      await save()
      throw error
    }
    if (!updated?._mutationRev) throw fail('PICTURE_MUTATION_RECEIPT_MISSING')
    for (const slot of slots)
      if (receipts[slot.id])
        Object.assign(receipts[slot.id], { state: 'written', revision: updated._mutationRev })
    await save()
    signal?.throwIfAborted()
    const published = await api('POST', route.replace('?', '/publish?'), { _rev: updated._mutationRev })
    if (!published?._mutationRev) throw fail('PICTURE_MUTATION_RECEIPT_MISSING')
    for (const slot of slots)
      if (receipts[slot.id])
        Object.assign(receipts[slot.id], { state: 'published', revision: published._mutationRev })
    await save()
    const back = await api('GET', record.route)
    if (
      back._rev !== published._mutationRev ||
      back.item?.status !== 'published' ||
      back.item?.draftRevisionId
    )
      throw fail('PICTURE_READBACK_FAILED')
    const backData = structuredClone(back.item.liveData ?? back.item.data)
    const expectedData = structuredClone(record.data)
    for (const slot of slots) {
      if (!receipts[slot.id]) continue
      if (get(back.item.liveData ?? back.item.data, slot.path)?.id !== receipts[slot.id].mediaId)
        throw fail('PICTURE_READBACK_FAILED')
      const image = get(backData, slot.path),
        expected = get(expectedData, slot.path)
      if (
        image.alt !== expected.alt ||
        image.width !== expected.width ||
        image.height !== expected.height ||
        image.meta?.storageKey !== expected.meta?.storageKey
      )
        throw fail('PICTURE_READBACK_FAILED')
      put(backData, slot.path, { id: receipts[slot.id].mediaId })
      put(expectedData, slot.path, { id: receipts[slot.id].mediaId })
    }
    if (hash(withoutGeneratedRows(backData)) !== hash(withoutGeneratedRows(expectedData)))
      throw fail('PICTURE_UNRELATED_DATA_CHANGED')
    for (const slot of slots) {
      if (!receipts[slot.id]) continue
      Object.assign(receipts[slot.id], {
        state: 'verified',
        revision: published._mutationRev,
        rowId: slot.path.includes('[')
          ? (get(back.item.liveData ?? back.item.data, slot.path.split('.').slice(0, -1).join('.'))?._rowId ??
            null)
          : null
      })
      report[receipts[slot.id].kind === 'placeholder' ? 'placeholders' : 'placed'] += 1
    }
    await save()
  }
  await save()
  return {
    ...report,
    bindings: inventory.slots
      .filter((s) => receipts[s.id]?.state === 'verified')
      .map((s) => ({
        collection: s.collection,
        slug: s.slug,
        locale: s.locale,
        path: s.path,
        mediaId: receipts[s.id].mediaId,
        derivativeHash: receipts[s.id].derivativeHash
      }))
  }
}

/** Read-only fence after prose: a text writer must not silently replace or clear an image binding. */
export async function verifyEmdashPictureBindings({ api, bindings }) {
  const records = new Map(),
    hidden = []
  let verified = 0
  for (const binding of bindings) {
    const route = `/_emdash/api/content/${enc(binding.collection)}/${enc(binding.slug)}?locale=${enc(binding.locale)}`
    if (!records.has(route)) records.set(route, await api('GET', route))
    const read = records.get(route),
      item = read.item
    if (!item?.id || item.locale !== binding.locale || item.draftRevisionId)
      throw fail('PICTURE_BINDING_CHANGED')
    if (item.status !== 'published') {
      hidden.push(binding)
      continue
    }
    if (get(item.liveData ?? item.data, binding.path)?.id !== binding.mediaId)
      throw fail('PICTURE_BINDING_CHANGED')
    verified += 1
  }
  return { verified, hidden }
}
