/** Native inventory for the quickstart-first workflow. IDs and publication state are never model output. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import RENDER_MAP from '../../lib/quickstart-render-map.json' with { type: 'json' }
import { emdashToolFor } from '../../lib/emdash-tool.js'
import { compileQuickstartContract } from './quickstart-contract-plan.js'
import { quickstartTextRanges } from './quickstart-editorial.js'
import { siteApi } from './emdash-menus.js'

const fail = (code) => Object.assign(new Error(code), { code })
const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const managedFields = new Set([
  'hits',
  'version',
  'modified',
  'modified_by',
  'checked_out',
  'checked_out_time',
  'post_modified',
  'post_modified_gmt',
  'comment_count'
])
const textKey =
  /(?:title|heading|label|text|description|desc|intro|content|excerpt|summary|lede|name|tagline|slogan|caption|alt|breadcrumb|button|quote|mission|history|hours|hotline|address|phone|email|copyright|\bvalue\b)/i
const technical =
  /(?:^|_)(?:id|class|style|font|color|layout|type|key|slug|alias|url|href|src|link|target|icon|date|time|locale|language|status|position|ordering|path|mime|width|height|provider|storageKey|_rowId)(?:$|_)/i
const picture = /\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i
const get = (root, path) => path.reduce((v, k) => v?.[k], root)
const set = (root, path, value) => {
  let p = root
  for (const key of path.slice(0, -1)) p = p[key]
  p[path.at(-1)] = value
}

/** Flatten only declared editorial fields; nested array membership and row identities remain in the original object. */
export function nativeCopyBindings(data, allowedFields) {
  const copy = {},
    bindings = []
  function visit(v, path, enabled) {
    const name = String(path.at(-1) ?? ''),
      parent = String(path.at(-2) ?? '')
    if (
      (typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) &&
      String(v).trim() &&
      !picture.test(v) &&
      !/^https?:|^mailto:|^tel:|^\$ref:/i.test(v) &&
      /[\p{L}\d]/u.test(v)
    ) {
      if (
        (!technical.test(name) || /^(?:type_label|brand_name)$/.test(name)) &&
        (enabled || textKey.test(name) || (/^\d+$/.test(name) && textKey.test(parent)))
      ) {
        const key = JSON.stringify(path)
        copy[key] = v
        bindings.push({ key, path, valueType: typeof v })
      }
    } else if (Array.isArray(v))
      v.forEach((child, n) => visit(child, [...path, n], enabled || textKey.test(name)))
    else if (v && typeof v === 'object' && !v.provider && !v.mimeType)
      for (const [key, child] of Object.entries(v))
        if (!technical.test(key) || /^(?:type_label|brand_name)$/.test(key))
          visit(child, [...path, key], enabled || textKey.test(name))
  }
  for (const field of allowedFields) if (Object.hasOwn(data, field)) visit(data[field], [field], true)
  return { copy, bindings }
}

export function nativeStructure(records) {
  const volatile = new Set([...managedFields, 'featured_image_id'])
  const normalize = (v) =>
    Array.isArray(v)
      ? v.map(normalize)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .filter(([k]) => !volatile.has(k))
              .map(([k, c]) => [k, k === '_rowId' ? '$row' : normalize(c)])
          )
        : v
  return records.map((r) => {
    const data = structuredClone(r.data)
    if (['template', 'templatePart'].includes(r.identity?.kind)) delete data.id
    for (const binding of r.bindings) {
      let value = get(data, binding.path)
      if (typeof value === 'number') {
        set(data, binding.path, '$number')
        continue
      }
      if (typeof value !== 'string') continue
      for (const range of quickstartTextRanges(value).sort((a, b) => b.start - a.start))
        value =
          value.slice(0, range.start) +
          (range.attribute ? `${range.attribute}="$copy"` : '$copy') +
          value.slice(range.end)
      set(data, binding.path, value)
    }
    return { key: r.key, identity: r.identity, shape: normalize(data), references: r.references ?? null }
  })
}

export async function assertQuickstartEmdashCowork(api) {
  let capability
  try {
    capability = await api('GET', '/_emdash/api/write-capabilities')
  } catch {
    throw fail('QUICKSTART_COWORK_REQUIRED')
  }
  if (
    capability?.schemaVersion !== 'emdash-conditional-writes/1' ||
    capability.backend !== 'node-sqlite' ||
    [
      'conditionalContentWrite',
      'conditionalPublish',
      'conditionalDiscardDraft',
      'mutationRevisionReceipts'
    ].some((key) => capability[key] !== true)
  )
    throw fail('QUICKSTART_COWORK_REQUIRED')
  return capability
}

export async function openNativeQuickstart({
  ctx,
  apply,
  siteAccess,
  checkAllowed = async () => {},
  reader = null,
  fetchImpl = fetch
}) {
  let seedCopyUnchanged = true
  const wordpressRestBases = new Map(),
    coverage = [],
    records = [],
    api =
      ctx.platform === 'emdash'
        ? await (async () => {
            const a = await siteAccess(ctx.siteKey)
            const nativeApi = siteApi(a.origin, a.token, ctx.signal, fetchImpl)
            return async (...args) => {
              await checkAllowed()
              return nativeApi(...args)
            }
          })()
        : null
  const call = async (action, params) => {
    await checkAllowed()
    const result = await apply({ siteKey: ctx.siteKey, action, params })
    if (result?.ok === false) throw fail(result.code ?? result.error?.code ?? 'QUICKSTART_CONTENT_REFUSED')
    return result
  }
  const add = (record, fields) => {
    const selected = record.selected ?? nativeCopyBindings(record.data, fields)
    records.push({
      ...record,
      ...selected,
      picturePaths:
        record.picturePaths ??
        (record.selected ? selected.bindings.map((binding) => binding.path) : fields.map((field) => [field])),
      context:
        record.context ??
        Object.fromEntries(
          Object.entries(record.data).filter(([k]) => /title|heading|summary|intro|lede/.test(k))
        )
    })
    add.lastRecord = records.at(-1)
  }
  const contentMap = ctx.contract?.dir
    ? JSON.parse(readFileSync(`${ctx.contract.dir}/content-map.json`, 'utf8'))
    : null
  if (api) {
    await assertQuickstartEmdashCowork(api)
    const tool = emdashToolFor(ctx.quickstart)
    if (!tool) throw fail('QUICKSTART_RELEASE_UNSUPPORTED')
    const seed = JSON.parse(readFileSync(`${tool.seedDir}/seed.json`, 'utf8'))
    const routeMap = JSON.parse(readFileSync(`${tool.seedDir}/content-api-map.json`, 'utf8'))
    const locale = ctx.normalized.languages?.[0] ?? seed.defaultLocale
    const personalization = JSON.parse(readFileSync(`${tool.seedDir}/personalize.json`, 'utf8'))
    for (const collection of seed.collections) {
      const schema = await api('GET', `/_emdash/api/schema/collections/${collection.slug}?includeFields=true`)
      const fields = schema.item.fields
        .filter((f) => ['string', 'text', 'number', 'integer', 'portableText', 'repeater'].includes(f.type))
        .map((f) => f.slug)
      for (const row of (seed.content[collection.slug] ?? []).filter(
        (r) => (r.locale ?? seed.defaultLocale) === locale
      )) {
        const route = `/_emdash/api/content/${collection.slug}/${encodeURIComponent(row.slug)}?locale=${locale}`
        const current = await api('GET', route),
          item = current.item
        if (item.status !== 'published') continue
        if (item.draftRevisionId || item.scheduledAt) throw fail('QUICKSTART_EDITOR_DRAFT')
        add(
          {
            key: `${collection.slug}/${row.slug}@${locale}`,
            renderRoutes: RENDER_MAP[tool.templateId]?.collections?.[`${locale}:${collection.slug}`] ?? [
              `?${collection.slug}`
            ],
            routes: routeMap.collections?.[collection.slug]?.urlPattern
              ? [
                  routeMap.collections[collection.slug].urlPattern.replace(
                    '{slug}',
                    encodeURIComponent(row.slug)
                  )
                ].map((route) =>
                  locale === seed.defaultLocale ? route : `/${locale}${route === '/' ? '' : route}`
                )
              : [],
            identity: { collection: collection.slug, slug: row.slug, locale, id: item.id, route },
            data: structuredClone(item.liveData ?? item.data),
            references: item.references,
            revision: current._rev,
            schema: schema.item,
            picturePaths: schema.item.fields
              .filter((field) =>
                ['image', 'media', 'string', 'text', 'portableText', 'repeater'].includes(field.type)
              )
              .map((field) => [field.slug]),
            mediaBindings:
              personalization.brand?.logoDark &&
              personalization.brand.logoDark.collection === collection.slug &&
              personalization.brand.logoDark.slug === row.slug
                ? [{ path: [personalization.brand.logoDark.field], role: 'logo' }]
                : [],
            semanticBindings: (personalization.identity ?? []).filter(
              (rule) => rule.collection === collection.slug && rule.slug === row.slug
            )
          },
          fields
        )
        seedCopyUnchanged &&= add.lastRecord.bindings.every(
          (binding) =>
            JSON.stringify(get(row.data, binding.path)) ===
            JSON.stringify(get(add.lastRecord.data, binding.path))
        )
      }
    }
  } else {
    seedCopyUnchanged = false
    const kinds =
      ctx.platform === 'joomla'
        ? ['article', 'module', 'menuItem', 'category', 'contact']
        : ['post', 'templatePart', 'template']
    for (const kind of kinds) {
      const lists =
        ctx.platform === 'wordpress' && kind === 'post'
          ? await wordpressPostTypes(reader, coverage, wordpressRestBases)
          : [null]
      for (const postType of lists) {
        const list = { items: [] }
        const seenRows = new Set()
        for (let offset = 0; ; offset += 100) {
          const page = await call('content.list', {
            kind,
            limit: 100,
            offset,
            ...(postType ? { post_type: postType } : {})
          })
          if (!Array.isArray(page.items)) throw fail('QUICKSTART_INVENTORY_UNREADABLE')
          if (ctx.platform === 'joomla') {
            for (const row of page.items) {
              const key = row.id
              if (key === undefined || key === null || seenRows.has(String(key)))
                throw fail('QUICKSTART_INVENTORY_PAGINATION_REQUIRED')
              seenRows.add(String(key))
            }
          }
          list.items.push(...page.items)
          if ((ctx.platform !== 'joomla' && kind !== 'post') || page.items.length < 100) break
          if (offset >= 9900) throw fail('QUICKSTART_INVENTORY_PAGINATION_REQUIRED')
        }
        for (const row of list.items) {
          const status = row.state ?? row.published ?? row.post_status ?? row.status
          if (
            !['template', 'templatePart'].includes(kind) &&
            ![1, '1', 'publish', 'published'].includes(status)
          )
            continue
          if (
            ctx.platform === 'joomla' &&
            ['module', 'menuItem'].includes(kind) &&
            Number(row.client_id ?? 0) !== 0
          )
            continue
          const identity = ['template', 'templatePart'].includes(kind)
            ? { kind, key: row.key }
            : { kind, id: row.id ?? row.ID }
          const current = await call('content.get', identity),
            item = current.item
          if (!item) throw fail('QUICKSTART_INVENTORY_UNREADABLE')
          if (
            ctx.platform === 'joomla' &&
            ['module', 'menuItem'].includes(kind) &&
            Number(item.client_id ?? 0) !== 0
          )
            continue
          const data = structuredClone(item),
            jsonFields = []
          for (const field of ctx.platform === 'joomla' ? ['params', 'images'] : [])
            if (typeof data[field] === 'string' && data[field].trim().startsWith('{')) {
              data[field] = JSON.parse(data[field])
              jsonFields.push(field)
              if (field === 'params' && typeof data.params['jatools-config'] === 'string') {
                data.params['jatools-config'] = JSON.parse(data.params['jatools-config'])
                jsonFields.push('params.jatools-config')
              }
            }
          const fields =
            ctx.platform === 'wordpress'
              ? ['template', 'templatePart'].includes(kind)
                ? ['content']
                : ['post_title', 'post_content', 'post_excerpt']
              : {
                  article: ['title', 'introtext', 'fulltext'],
                  module: ['title', 'content'],
                  menuItem: ['title'],
                  category: ['title', 'description'],
                  contact: [
                    'name',
                    'misc',
                    'address',
                    'suburb',
                    'state',
                    'country',
                    'postcode',
                    'telephone',
                    'mobile',
                    'email_to',
                    'webpage',
                    'con_position'
                  ]
                }[kind]
          add(
            {
              key: `${kind}/${identity.key ?? item.id ?? item.ID}`,
              identity,
              data,
              raw: item,
              jsonFields,
              ...(ctx.platform === 'joomla' && kind === 'article'
                ? { picturePaths: [...fields.map((field) => [field]), ['images']] }
                : {}),
              restBase: postType ? wordpressRestBases.get(postType) : null,
              bodyRevision: current.body_revision,
              routes:
                typeof row.url === 'string' ? [new URL(row.url, 'http://quickstart.invalid').pathname] : []
            },
            fields
          )
        }
      }
    }
  }
  if (!records.length) throw fail('QUICKSTART_INVENTORY_EMPTY')
  for (const record of records) {
    for (const rule of record.semanticBindings ?? []) {
      const match =
        typeof rule.value === 'string' && rule.value.match(/^\{(name|phone|email|address|hours)\}$/i)
      const binding = record.bindings.find((b) => b.path.length === 1 && b.path[0] === rule.field)
      if (match && binding) binding.fact = match[1].toLowerCase()
    }
  }
  await addWordpressSettings({ ctx, call, add, coverage, map: contentMap })
  const excludedEntities = new Map()
  if (ctx.platform === 'joomla') {
    for (const entity of contentMap?.entities ?? []) {
      if (
        !['module', 'menuItem', 'article', 'category', 'contact'].includes(entity.kind) ||
        entity.sourceId == null ||
        records.some(
          (record) =>
            record.identity.kind === entity.kind && Number(record.identity.id) === Number(entity.sourceId)
        )
      )
        continue
      const answer = await call('content.get', { kind: entity.kind, id: entity.sourceId })
      const item = answer.item
      const status = item?.published ?? item?.state
      if (item && String(item.id) === String(entity.sourceId) && [0, '0', -2, '-2'].includes(status))
        excludedEntities.set(entity.key, {
          reason: Number(status) === -2 ? 'native-record-trashed' : 'native-record-unpublished',
          proof: { kind: entity.kind, id: entity.sourceId, publication: Number(status) }
        })
    }
  }
  if (contentMap && (!Array.isArray(contentMap.entities) || !Array.isArray(contentMap.slots)))
    throw fail('QUICKSTART_CONTRACT_UNREADABLE')
  const contractPlan = compileQuickstartContract({
    map: contentMap,
    records,
    platform: ctx.platform,
    exclusions: excludedEntities
  })
  coverage.push(...contractPlan.coverage)
  for (const record of records)
    for (const binding of record.mediaBindings ?? [])
      if (!record.picturePaths.some((path) => JSON.stringify(path) === JSON.stringify(binding.path)))
        record.picturePaths.push(binding.path)
  const initial = structuredClone(records)
  function patchData(record, copy) {
    const data = structuredClone(record.data)
    for (const binding of record.bindings) {
      if (!Object.hasOwn(copy, binding.key)) throw fail('QUICKSTART_COPY_MISSING')
      set(data, binding.path, copy[binding.key])
    }
    return data
  }
  async function write(record, data, checkpoint) {
    ctx.signal?.throwIfAborted()
    const beforeData = structuredClone(record.data),
      beforeRevision = record.revision ?? record.bodyRevision ?? null
    const id = record.identity,
      before = api ? await api('GET', id.route) : await call('content.get', id)
    if (
      api
        ? before._rev !== record.revision || before.item.draftRevisionId
        : digest(Object.fromEntries(Object.entries(before.item).filter(([k]) => k !== 'hits'))) !==
          digest(Object.fromEntries(Object.entries(record.raw).filter(([k]) => k !== 'hits')))
    )
      throw fail('QUICKSTART_EDITOR_CHANGED')
    await checkpoint?.({ state: 'sending', before, data })
    let after
    if (api) {
      const route = `/_emdash/api/content/${id.collection}/${id.id}?locale=${id.locale}`
      const updated = await api('PUT', route, { data, _rev: record.revision })
      if (!updated._mutationRev) throw fail('QUICKSTART_MUTATION_RECEIPT_REQUIRED')
      await checkpoint?.({ state: 'draft-written', revision: updated._mutationRev })
      const published = await api('POST', route.replace('?', '/publish?'), { _rev: updated._mutationRev })
      after = await api('GET', id.route)
      if (after._rev !== published._mutationRev || after.item.draftRevisionId)
        throw fail('QUICKSTART_READBACK_FAILED')
      const normalize = (value) =>
        value && typeof value === 'object' && value.id && (value.provider || value.mimeType)
          ? {
              id: value.id,
              alt: value.alt ?? '',
              width: value.width,
              height: value.height,
              storageKey: value.meta?.storageKey
            }
          : Array.isArray(value)
            ? value.map(normalize)
            : value && typeof value === 'object'
              ? Object.fromEntries(
                  Object.entries(value)
                    .filter(([k]) => k !== '_rowId')
                    .map(([k, v]) => [k, normalize(v)])
                )
              : value
      if (digest(normalize(after.item.liveData ?? after.item.data)) !== digest(normalize(data)))
        throw fail('QUICKSTART_READBACK_FAILED')
      record.revision = after._rev
      record.data = structuredClone(after.item.liveData ?? after.item.data)
    } else {
      const encoded = structuredClone(data)
      if ((record.jsonFields ?? []).includes('params.jatools-config'))
        encoded.params['jatools-config'] = JSON.stringify(encoded.params['jatools-config'])
      for (const field of (record.jsonFields ?? []).filter((f) => !f.includes('.')))
        encoded[field] = JSON.stringify(encoded[field])
      const fields = Object.fromEntries(
        Object.entries(encoded).filter(
          ([k, v]) => !managedFields.has(k) && JSON.stringify(v) !== JSON.stringify(record.raw[k])
        )
      )
      if (fields.featured_image_id !== undefined) fields.post_title ??= record.raw.post_title
      if (
        Object.keys(fields).length &&
        ctx.platform === 'wordpress' &&
        ['template', 'templatePart'].includes(record.identity.kind)
      ) {
        if (typeof encoded.content !== 'string' || typeof encoded.title !== 'string')
          throw fail('QUICKSTART_INVENTORY_UNREADABLE')
        fields.content = encoded.content
        fields.title = encoded.title
        if (record.identity.kind === 'templatePart' && typeof encoded.area === 'string')
          fields.area = encoded.area
      }
      if (Object.keys(fields).length) {
        const applyId = `qs-${ctx.runId}-${digest({ key: record.key, fields }).slice(0, 16)}`
        await call('content.update', {
          ...id,
          fields,
          apply_id: applyId,
          ...(ctx.platform === 'wordpress' &&
          (fields.post_content !== undefined || fields.content !== undefined) &&
          before.body_revision
            ? { expected_body_revision: before.body_revision }
            : {})
        })
      }
      after = await call('content.get', id)
      for (const [k, v] of Object.entries(fields)) {
        if (k === 'featured_image_id') {
          if (!reader) throw fail('QUICKSTART_FEATURED_READBACK_UNAVAILABLE')
          const rest = JSON.parse(
            await reader.text(
              `/wp-json/wp/v2/${record.restBase ?? (record.data.post_type === 'page' ? 'pages' : 'posts')}/${record.identity.id}`
            )
          )
          if (Number(rest.featured_media) !== Number(v)) throw fail('QUICKSTART_READBACK_FAILED')
        } else if (JSON.stringify(after.item[k]) !== JSON.stringify(v))
          throw fail('QUICKSTART_READBACK_FAILED')
      }
      record.raw = after.item
      record.data =
        ctx.platform === 'wordpress' && ['post', 'template', 'templatePart'].includes(record.identity.kind)
          ? structuredClone(after.item)
          : data
      record.bodyRevision = after.body_revision
    }
    await checkpoint?.({ state: 'verified', beforeData, beforeRevision, after })
    return after
  }
  return { records, initial, api, call, patchData, write, get, set, coverage, seedCopyUnchanged }
}

async function wordpressPostTypes(reader, coverage, restBases) {
  const types = new Set(['post', 'page', 'wp_navigation'])
  if (!reader) {
    coverage.push({
      surface: 'post-types',
      state: 'required-unresolved',
      reason: 'discovery-reader-unavailable'
    })
    return [...types]
  }
  const discovered = JSON.parse(await reader.text('/wp-json/wp/v2/types'))
  if (!discovered || Array.isArray(discovered) || typeof discovered !== 'object')
    throw fail('QUICKSTART_INVENTORY_UNREADABLE')
  for (const [type, descriptor] of Object.entries(discovered)) {
    if (['attachment', 'wp_template', 'wp_template_part'].includes(type)) continue
    if (!descriptor?.rest_base || !/^[a-z0-9_-]+$/i.test(type)) continue
    types.add(type)
    restBases.set(type, descriptor.rest_base)
  }
  coverage.push({ surface: 'post-types', state: 'supported', types: [...types] })
  return [...types]
}

async function addWordpressSettings({ ctx, call, add, coverage, map }) {
  if (ctx.platform !== 'wordpress') return
  const descriptors = new Map([
    ['blogname', { role: 'name' }],
    ['blogdescription', {}]
  ])
  for (const slot of map?.slots ?? []) {
    if (!['text', 'number'].includes(slot.type) || typeof slot.target?.option !== 'string') continue
    descriptors.set(slot.target.option, {
      ...descriptors.get(slot.target.option),
      slots: [...(descriptors.get(slot.target.option)?.slots ?? []), slot]
    })
  }
  const readOption = async (key) => {
    const answer = await call('content.get', { kind: 'option', key })
    if (answer?.ok === false && answer.error === 'not_found') return null
    if (answer?.ok === false) throw fail('QUICKSTART_SETTINGS_UNREADABLE')
    return answer.item && Object.hasOwn(answer.item, 'value') ? answer.item : null
  }
  const widgets = await readOption('sidebars_widgets')
  for (const [sidebar, ids] of Object.entries(widgets?.value ?? {})) {
    if (sidebar === 'wp_inactive_widgets') continue
    if (!Array.isArray(ids)) continue
    for (const id of ids) {
      const match = typeof id === 'string' && id.match(/^(.+)-(\d+)$/)
      if (match) descriptors.set(`widget_${match[1]}`, { widget: true })
    }
  }
  for (const [key, descriptor] of descriptors) {
    const item = await readOption(key)
    if (!item) continue
    const rawItem = structuredClone(item)
    let encodedValue = false
    if (typeof item.value === 'string' && descriptor.slots?.some((slot) => slot.target.jsonPath?.length)) {
      try {
        item.value = JSON.parse(item.value)
        if (!item.value || typeof item.value !== 'object')
          throw new Error('Expected object for declared JSON paths')
        encodedValue = true
      } catch {
        coverage.push({
          surface: `option/${key}`,
          state: 'required-unresolved',
          reason: 'declared-json-path-unreadable'
        })
        continue
      }
    }
    if (descriptor.widget && typeof item.value === 'string') {
      coverage.push({
        surface: `option/${key}`,
        state: 'required-unresolved',
        reason: 'widget-object-unreadable'
      })
      continue
    }
    if (typeof item.value === 'string' || (typeof item.value === 'number' && Number.isFinite(item.value))) {
      add(
        {
          key: `option/${key}`,
          identity: { kind: 'option', key },
          data: structuredClone(item),
          raw: item,
          jsonFields: []
        },
        ['value']
      )
      const record = add.lastRecord
      if (record)
        for (const binding of record.bindings) {
          const slot = descriptor.slots?.find((s) => !s.target.jsonPath?.length)
          binding.role = slot?.role ?? descriptor.role
          binding.fact = slot?.input
          binding.maxCharacters = slot?.maxCharacters
          binding.renderer = slot?.renderer
        }
    } else if (item.value && typeof item.value === 'object') {
      // Configuration objects are never enabled wholesale: only contract paths or widget text leaves.
      const selected = { copy: {}, bindings: [] }
      const paths = descriptor.slots?.map((slot) => slot.target.jsonPath).filter(Array.isArray) ?? []
      if (descriptor.widget)
        for (const [index, widget] of Object.entries(item.value)) {
          if (!/^\d+$/.test(index) || !widget || typeof widget !== 'object') continue
          for (const field of ['title', 'text', 'content', 'description'])
            if (typeof widget[field] === 'string') paths.push([index, field])
        }
      for (const path of paths) {
        const full = ['value', ...path],
          value = get(item, full),
          field = JSON.stringify(full)
        if (
          !(typeof value === 'string' && value.trim()) &&
          !(typeof value === 'number' && Number.isFinite(value))
        )
          continue
        if (
          selected.bindings.some(
            (binding) => JSON.stringify(binding.path.map(String)) === JSON.stringify(full.map(String))
          )
        )
          continue
        const slot = descriptor.slots?.find(
          (item) =>
            JSON.stringify((item.target.jsonPath ?? []).map(String)) === JSON.stringify(path.map(String))
        )
        selected.copy[field] = value
        selected.bindings.push({
          key: field,
          path: full,
          valueType: typeof value,
          role: slot?.role,
          fact: slot?.input,
          renderer: slot?.renderer,
          maxCharacters: slot?.maxCharacters
        })
      }
      add(
        {
          key: `option/${key}`,
          identity: { kind: 'option', key },
          data: structuredClone(item),
          raw: rawItem,
          jsonFields: encodedValue ? ['value'] : [],
          selected
        },
        []
      )
      if (!selected.bindings.length && !descriptor.slots?.length)
        coverage.push({
          surface: `option/${key}`,
          state: 'required-unresolved',
          reason: 'no-declared-editorial-paths'
        })
    }
  }
}
