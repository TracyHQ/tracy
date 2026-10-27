/** Narrow EmDash HTTP client. An installed image must match independently tested code before writes. */
import { qualityHash } from './quality-dossier.js'

const fail = (code) => Object.assign(new Error(code), { code })
const enc = encodeURIComponent
const API = '/_emdash/api'
const CONTRACT = 'emdash-conditional-writes/1'
const assertions = [
  'update-cas',
  'publish-cas',
  'unpublish-cas',
  'draft-discard-cas',
  'mutation-receipt',
  'menu-snapshot-cas'
]

export async function openQualityEmdashClient({ api, manifest, inspection, evidence }) {
  if (
    evidence?.state !== 'passed' ||
    evidence.contract !== CONTRACT ||
    !/^sha256:[a-f0-9]{64}$/.test(evidence.imageId ?? '') ||
    !/^[a-f0-9]{40}$/.test(evidence.cmsCommit ?? '') ||
    evidence.imageId !== inspection?.imageId ||
    evidence.cmsCommit !== inspection?.cmsCommit ||
    inspection?.backend !== 'node-sqlite' ||
    assertions.some((a) => !evidence.assertions?.includes(a))
  )
    throw fail('QUALITY_CMS_IMAGE_UNVERIFIED')
  const capability = await api('GET', `${API}/write-capabilities`)
  if (
    capability?.schemaVersion !== CONTRACT ||
    capability.backend !== 'node-sqlite' ||
    capability.genericUndo !== false ||
    capability.mutationRevisionReceipts !== true ||
    [
      'conditionalContentWrite',
      'conditionalPublish',
      'conditionalUnpublish',
      'conditionalDiscardDraft',
      'conditionalMenuSnapshot'
    ].some((k) => capability[k] !== true)
  )
    throw fail('QUALITY_CONDITIONAL_CMS_UNAVAILABLE')
  const capabilities = {
    ...capability,
    evidenceHash: qualityHash({ evidence, inspection }),
    conditionalSlugRename:
      capability.conditionalSlugRename === true && evidence.assertions.includes('slug-omit-cas'),
    conditionalTermMetadata:
      capability.conditionalTermMetadata === true && evidence.assertions.includes('term-metadata-cas')
  }
  const target = (operation) => {
    const record = manifest.records.find((r) => r.key === operation.key)
    if (
      !record ||
      record.collection !== operation.collection ||
      record.slug !== operation.slug ||
      record.locale !== operation.locale
    )
      throw fail('QUALITY_CMS_TARGET_SCOPE')
    return record
  }
  const menu = (operation) => {
    const found = manifest.menus.find((m) => m.id === operation.menuId)
    if (!found || found.name !== operation.name || found.locale !== operation.locale)
      throw fail('QUALITY_CMS_MENU_SCOPE')
    return `${API}/menus/${enc(found.name)}/items?locale=${enc(found.locale)}`
  }
  const path = (operation) => {
    target(operation)
    return `${API}/content/${enc(operation.collection)}/${enc(operation.id ?? operation.slug)}`
  }
  const termPath = (operation) => {
    const term = manifest.terms?.find((t) => t.key === operation.key)
    if (
      !term ||
      term.name !== operation.name ||
      term.locale !== operation.locale ||
      term.slug !== operation.slug ||
      !operation.id
    )
      throw fail('QUALITY_CMS_TERM_SCOPE')
    return `${API}/taxonomies/${enc(term.name)}/term-metadata/${enc(operation.id)}?locale=${enc(term.locale)}`
  }
  const requireTerm = (operation) => {
    if (operation.kind !== 'term-update' || !capabilities.conditionalTermMetadata)
      throw fail('QUALITY_CMS_TERM_SCOPE')
    return termPath(operation)
  }
  async function redirectsFor(operation, slug) {
    const record = target(operation)
    if (!record.route?.endsWith(`/${enc(record.slug)}`) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? ''))
      throw fail('QUALITY_CMS_RENAME_SCOPE')
    const route = record.route.slice(0, -enc(record.slug).length) + enc(slug)
    const redirects = [],
      seen = new Set()
    let cursor = null
    do {
      const response = await api('GET', `${API}/redirects?limit=100${cursor ? `&cursor=${enc(cursor)}` : ''}`)
      if (!Array.isArray(response?.items)) throw fail('QUALITY_REDIRECTS_UNREADABLE')
      redirects.push(...response.items)
      cursor = response.nextCursor ?? null
      if (redirects.length > 1000 || (cursor && seen.has(cursor))) throw fail('QUALITY_REDIRECTS_UNREADABLE')
      if (cursor) seen.add(cursor)
    } while (cursor)
    for (const r of redirects.filter((r) => r.enabled !== false)) {
      if (typeof r.source !== 'string' || r.isPattern !== false)
        throw fail('QUALITY_REDIRECT_PATTERN_UNSUPPORTED')
      let source
      try {
        source = decodeURIComponent(new URL(r.source, 'https://site.invalid').pathname)
      } catch {
        throw fail('QUALITY_REDIRECTS_UNREADABLE')
      }
      if (source.replace(/\/$/, '') === decodeURIComponent(route).replace(/\/$/, ''))
        throw fail('QUALITY_REDIRECT_INTERCEPTS_ROUTE')
    }
    return qualityHash(
      redirects.map(({ id, source, destination, type, isPattern, enabled }) => ({
        id,
        source,
        destination,
        type,
        isPattern,
        enabled
      }))
    )
  }
  async function schema(operation) {
    target(operation)
    const response = await api(
      'GET',
      `${API}/schema/collections/${enc(operation.collection)}?includeFields=true`
    )
    if (!Array.isArray(response?.item?.fields)) throw fail('QUALITY_CMS_SCHEMA_MISSING')
    return response.item
  }
  function referenceClears(operation, collection) {
    for (const policy of operation.referenceVisibility ?? []) {
      const field = collection.fields.find((field) => field.slug === policy.field),
        binding = field?.validation
      if (
        policy.mode !== 'hidden-by-unpublished-target' ||
        field?.type !== 'reference' ||
        !binding?.relation ||
        binding.relation !== policy.relation ||
        binding.relationSide !== 'parent' ||
        binding.targetCollection !== policy.targetCollection ||
        Object.hasOwn(operation.fields, policy.field) ||
        qualityHash(operation.expectedReferences?.[policy.field]) !== qualityHash([policy.targetId])
      )
        throw fail('QUALITY_CMS_REFERENCE_SCOPE')
    }
    const fields = Object.keys(operation.fields ?? {}).filter((key) =>
      collection.fields.some((field) => field.slug === key && field.type === 'reference')
    )
    if (!fields.length) {
      if (operation.expectedReferencesAfter) throw fail('QUALITY_CMS_REFERENCE_SCOPE')
      return fields
    }
    if (!operation.expectedReferences || !operation.expectedReferencesAfter)
      throw fail('QUALITY_CMS_FIELD_SCOPE')
    for (const key of fields) {
      const field = collection.fields.find((field) => field.slug === key)
      if (
        operation.fields[key] !== null ||
        field.validation?.relation ||
        !field.validation?.targetCollection ||
        field.translatable === false ||
        !Array.isArray(operation.expectedReferences[key])
      )
        throw fail('QUALITY_CMS_FIELD_SCOPE')
    }
    const after = Object.fromEntries(
      Object.entries(operation.expectedReferences).map(([key, ids]) => [key, fields.includes(key) ? [] : ids])
    )
    if (qualityHash(after) !== qualityHash(operation.expectedReferencesAfter))
      throw fail('QUALITY_CMS_REFERENCE_SCOPE')
    return fields
  }
  async function referenceGraph(operation, item, collection) {
    const graph = {},
      targets = {}
    for (const field of collection.fields.filter((f) => f.type === 'reference')) {
      const binding = field.validation ?? {}
      if (!binding.relation) {
        const id = item.data?.[field.slug]
        if (id == null || id === '') {
          graph[field.slug] = []
          continue
        }
        if (typeof id !== 'string' || !binding.targetCollection)
          throw fail('QUALITY_CMS_REFERENCE_UNSUPPORTED')
        const linked = await api(
          'GET',
          `${API}/content/${enc(binding.targetCollection)}/${enc(id)}?locale=${enc(operation.locale)}`
        )
        if (!linked?.item?.id || linked.item.locale !== operation.locale)
          throw fail('QUALITY_CMS_REFERENCE_LOCALE')
        targets[field.slug] = [{ id: linked.item.id, slug: linked.item.slug, status: linked.item.status }]
        graph[field.slug] = [
          {
            id: linked.item.id,
            collection: binding.targetCollection,
            locale: linked.item.locale,
            translationGroup: linked.item.translationGroup ?? null
          }
        ]
        continue
      }
      const entries = [],
        seen = new Set()
      let cursor = null
      do {
        const side = binding.relationSide === 'child' ? 'parents' : 'children'
        const response = await api(
          'GET',
          `${API}/content/${enc(operation.collection)}/${enc(item.id)}/references/${enc(binding.relation)}/${side}?limit=100${cursor ? `&cursor=${enc(cursor)}` : ''}`
        )
        if (!Array.isArray(response?.[side])) throw fail('QUALITY_CMS_REFERENCE_UNSUPPORTED')
        for (const entry of response[side]) {
          if (!entry.id || entry.locale !== operation.locale) throw fail('QUALITY_CMS_REFERENCE_LOCALE')
          entries.push({
            id: entry.id,
            collection: entry.collection,
            locale: entry.locale,
            translationGroup: entry.translationGroup ?? null,
            sortOrder: entry.sortOrder ?? null
          })
        }
        cursor = response.nextCursor ?? null
        if (entries.length > 1000 || (cursor && seen.has(cursor))) throw fail('QUALITY_CMS_REFERENCE_LIMIT')
        if (cursor) seen.add(cursor)
      } while (cursor)
      graph[field.slug] = entries
    }
    return { graph, targets }
  }
  async function read(operation, { referenceState = 'either' } = {}) {
    if (operation.kind === 'term-update') {
      const snapshot = await api('GET', termPath(operation))
      if (
        snapshot?.id !== operation.id ||
        snapshot.name !== operation.name ||
        snapshot.locale !== operation.locale ||
        !snapshot._rev ||
        !Array.isArray(snapshot.associations) ||
        !(snapshot.dataRaw === null || typeof snapshot.dataRaw === 'string')
      )
        throw fail('QUALITY_CMS_TERM_SNAPSHOT_MISSING')
      return {
        id: snapshot.id,
        revision: snapshot._rev,
        status: 'published',
        snapshot,
        data: { label: snapshot.label, slug: snapshot.slug, dataRaw: snapshot.dataRaw },
        references: {
          associations: snapshot.associations,
          identity: {
            id: snapshot.id,
            locale: snapshot.locale,
            name: snapshot.name,
            translationGroup: snapshot.translationGroup,
            parentId: snapshot.parentId,
            sortOrder: snapshot.sortOrder
          }
        }
      }
    }
    if (operation.kind === 'menu-update') {
      const snapshot = await api('GET', menu(operation))
      if (
        !snapshot?._rev ||
        !snapshot.id ||
        snapshot.locale !== operation.locale ||
        !Array.isArray(snapshot.items)
      )
        throw fail('QUALITY_CMS_MENU_SNAPSHOT_MISSING')
      if (operation.id && operation.id !== snapshot.id) throw fail('QUALITY_CMS_TARGET_CHANGED')
      return {
        id: snapshot.id,
        revision: snapshot._rev,
        status: 'published',
        snapshot,
        data: {
          label: snapshot.label,
          items: snapshot.items.map((i) => ({ label: i.label, url: i.customUrl }))
        }
      }
    }
    const record = target(operation),
      collection = await schema(operation)
    const response = await api('GET', `${path(operation)}?locale=${enc(operation.locale)}`)
    const item = response?.item
    if (
      !response?._rev ||
      !item?.id ||
      ![record.slug, operation.newSlug, operation.currentSlug].includes(item.slug) ||
      item.locale !== record.locale ||
      (operation.id && operation.id !== item.id)
    )
      throw fail('QUALITY_CMS_TARGET_CHANGED')
    // Only a published entry can have a shadow draft; an unpublished entry's draft pointer is its own content.
    const shadowDraft = item.status === 'published' && !!item.draftRevisionId
    const data = shadowDraft ? (response.liveData ?? item.liveData) : item.data
    if (!data || typeof data !== 'object') throw fail('QUALITY_CMS_LIVE_DATA_MISSING')
    referenceClears(operation, collection)
    // Reference identity must describe the publication, just like data; an owned draft is separate.
    const references = await referenceGraph(operation, { ...item, data }, collection)
    if (operation.expectedReferences) {
      const actual = Object.fromEntries(
        Object.entries(references.graph).map(([key, entries]) => [key, entries.map((e) => e.id)])
      )
      if (
        qualityHash(actual) !== qualityHash(operation.expectedReferences) &&
        (referenceState === 'before' ||
          !operation.expectedReferencesAfter ||
          qualityHash(actual) !== qualityHash(operation.expectedReferencesAfter))
      )
        throw fail('QUALITY_CMS_REFERENCE_CHANGED')
    }
    return {
      id: item.id,
      slug: item.slug,
      revision: response._rev,
      data,
      status: item.status,
      draft: shadowDraft ? { id: item.draftRevisionId, data: item.data } : null,
      publishedAt: item.publishedAt,
      scheduledAt: item.scheduledAt ?? null,
      references: references.graph,
      referenceTargets: references.targets
    }
  }
  async function preflight(operation, before) {
    if (operation.kind === 'term-update') {
      termPath(operation)
      if (
        !capabilities.conditionalTermMetadata ||
        !before.snapshot?._rev ||
        Object.keys(operation.fields ?? {}).some((k) => !['label', 'slug', 'description'].includes(k))
      )
        throw fail('QUALITY_CMS_TERM_SCOPE')
      return
    }
    if (operation.kind === 'menu-update') {
      menu(operation)
      if (!before.snapshot?._rev) throw fail('QUALITY_CMS_MENU_SNAPSHOT_MISSING')
      return
    }
    const record = target(operation),
      collection = await schema(operation)
    if (operation.newSlug) {
      if (!capabilities.conditionalSlugRename) throw fail('QUALITY_CMS_RENAME_UNVERIFIED')
      await redirectsFor(operation, operation.newSlug)
    }
    if (!collection.supports?.includes('revisions')) throw fail('QUALITY_CMS_DRAFTS_REQUIRED')
    if (
      qualityHash(
        collection.fields
          .map((f) => ({ slug: f.slug, type: f.type }))
          .sort((a, b) => a.slug.localeCompare(b.slug))
      ) !==
      qualityHash(
        record.fields
          .map((f) => ({ slug: f.slug, type: f.type }))
          .sort((a, b) => a.slug.localeCompare(b.slug))
      )
    )
      throw fail('QUALITY_CMS_SCHEMA_CHANGED')
    const cleared = referenceClears(operation, collection)
    for (const key of Object.keys(operation.fields ?? {})) {
      const field = collection.fields.find((f) => f.slug === key)
      if (!field || (field.type === 'reference' && !cleared.includes(key)) || field.translatable === false)
        throw fail('QUALITY_CMS_FIELD_SCOPE')
    }
  }
  async function mutate(method, route, body) {
    let response
    try {
      response = await api(method, route, body)
    } catch (e) {
      if (e.status === 409) throw fail('QUALITY_CONTENT_CONFLICT')
      throw e
    }
    if (!response?._mutationRev) throw fail('QUALITY_MUTATION_RECEIPT_MISSING')
    return { revision: response._mutationRev, ...(response.items ? { snapshot: response } : {}) }
  }
  return {
    capabilities,
    intendedAfter: (operation, before) => {
      if (operation.kind !== 'term-update') return null
      const raw = before.snapshot.dataRaw
      const data = raw === null ? {} : JSON.parse(raw)
      return {
        ...before,
        data: {
          label: operation.fields.label,
          slug: operation.fields.slug,
          dataRaw:
            operation.fields.description === undefined
              ? raw
              : JSON.stringify({ ...data, description: operation.fields.description })
        }
      }
    },
    read,
    referenceSchema: schema,
    preflight,
    write: (operation, fields, { expectedRevision, restoreReferences = false }) => {
      if (
        operation.kind !== 'update' ||
        Object.keys(fields).some((key) => !Object.hasOwn(operation.fields, key))
      )
        throw fail('QUALITY_CMS_FIELD_SCOPE')
      for (const key of Object.keys(operation.expectedReferencesAfter ?? {})) {
        if (!Object.hasOwn(fields, key)) continue
        if (operation.fields[key] !== null) continue
        const original = operation.expectedReferences[key]
        const allowed = restoreReferences ? (original.length === 1 ? original[0] : null) : null
        if (fields[key] !== allowed) throw fail('QUALITY_CMS_REFERENCE_SCOPE')
      }
      return mutate('PUT', path(operation), { data: fields, _rev: expectedRevision })
    },
    rename: async (operation, slug, { expectedRevision }) => {
      if (
        !operation.id ||
        ![operation.slug, operation.newSlug].includes(slug) ||
        !capabilities.conditionalSlugRename
      )
        throw fail('QUALITY_CMS_RENAME_SCOPE')
      const redirectConfigHash = await redirectsFor(operation, slug)
      const result = await mutate('PUT', path(operation), {
        slug,
        redirectPolicy: 'omit',
        _rev: expectedRevision
      })
      return { ...result, receipt: { redirectConfigHash } }
    },
    termSet: (operation, fields, { expectedRevision }) => {
      const route = requireTerm(operation)
      if (
        Object.keys(fields).some((k) => !['label', 'slug', 'description'].includes(k)) ||
        qualityHash(fields) !== qualityHash(operation.fields)
      )
        throw fail('QUALITY_CMS_TERM_SCOPE')
      return mutate('PUT', route, { mode: 'patch', _rev: expectedRevision, ...fields })
    },
    restoreTerm: (operation, snapshot, { expectedRevision }) =>
      mutate('PUT', requireTerm(operation), {
        mode: 'restore',
        _rev: expectedRevision,
        snapshot: { label: snapshot.label, slug: snapshot.slug, dataRaw: snapshot.dataRaw }
      }),
    publish: (operation, { expectedRevision }) =>
      mutate('POST', `${path(operation)}/publish`, { _rev: expectedRevision }),
    unpublish: (operation, { expectedRevision }) =>
      mutate('POST', `${path(operation)}/unpublish`, { _rev: expectedRevision }),
    discardDraft: (operation, { expectedRevision }) =>
      mutate('POST', `${path(operation)}/discard-draft`, { _rev: expectedRevision }),
    menuSet: (operation, items, { expectedRevision }) =>
      mutate('PUT', menu(operation), {
        mode: 'replace',
        _rev: expectedRevision,
        items: items.map(({ label, url }) => ({ type: 'custom', label, customUrl: url }))
      }),
    restoreMenu: (operation, snapshot, { expectedRevision }) =>
      mutate('PUT', menu(operation), {
        mode: 'restore',
        _rev: expectedRevision,
        snapshot: { label: snapshot.label, items: snapshot.items }
      })
  }
}
