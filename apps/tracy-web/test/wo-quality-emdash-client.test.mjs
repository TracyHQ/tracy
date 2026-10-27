/** HTTP protocol simulation. Real image installation and CAS tests are separate evidence. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openQualityEmdashClient } from '../src/opportunities-build/quality-emdash-client.js'

const operation = {
  kind: 'update',
  key: 'home/home@en',
  collection: 'home',
  slug: 'home',
  locale: 'en',
  fields: { title: 'After' }
}
const menuOperation = {
  kind: 'menu-update',
  menuId: 'menu-primary',
  name: 'primary',
  locale: 'en',
  items: [{ label: 'Home', url: '/' }]
}
const fields = [
  { slug: 'title', type: 'string' },
  { slug: 'featured', type: 'reference', validation: { targetCollection: 'projects' } }
]
const manifest = {
  records: [{ key: operation.key, collection: 'home', slug: 'home', locale: 'en', fields }],
  menus: [{ id: 'menu-primary', name: 'primary', locale: 'en' }]
}
const evidence = {
  state: 'passed',
  contract: 'emdash-conditional-writes/1',
  imageId: `sha256:${'a'.repeat(64)}`,
  cmsCommit: 'c'.repeat(40),
  assertions: [
    'update-cas',
    'publish-cas',
    'unpublish-cas',
    'draft-discard-cas',
    'mutation-receipt',
    'menu-snapshot-cas'
  ]
}
const inspection = { imageId: evidence.imageId, cmsCommit: evidence.cmsCommit, backend: 'node-sqlite' }
const capability = {
  schemaVersion: evidence.contract,
  backend: 'node-sqlite',
  genericUndo: false,
  mutationRevisionReceipts: true,
  conditionalContentWrite: true,
  conditionalPublish: true,
  conditionalUnpublish: true,
  conditionalDiscardDraft: true,
  conditionalMenuSnapshot: true
}
const snapshot = {
  id: 'real-menu',
  name: 'primary',
  locale: 'en',
  label: 'Primary',
  _rev: 'menu-r1',
  items: [
    {
      id: 'original-item',
      menuId: 'real-menu',
      locale: 'en',
      label: 'Before',
      customUrl: '/before',
      translationGroup: 'original-group',
      parentId: null,
      sortOrder: 9
    }
  ]
}
function scenario() {
  const calls = []
  const state = {
    capability: structuredClone(capability),
    collection: { fields: structuredClone(fields), supports: ['revisions'] },
    item: {
      id: 'actual-home',
      slug: 'home',
      locale: 'en',
      data: { title: 'Before', featured: 'actual-target' },
      status: 'published',
      publishedAt: '2026-10-20T00:00:00Z',
      draftRevisionId: null
    },
    liveData: null,
    revision: 'before-r1',
    snapshot: structuredClone(snapshot),
    mutation: { _mutationRev: 'our-r2', _rev: 'later-human-r3' }
  }
  const api = async (method, path, body) => {
    calls.push({ method, path, body })
    if (method !== 'GET') return state.mutation
    if (path.endsWith('/write-capabilities')) return state.capability
    if (path.includes('/schema/collections/')) return { item: state.collection }
    if (path.includes('/content/projects/'))
      return {
        item: { id: 'actual-target', slug: 'real-story', locale: 'en', translationGroup: 'target-group' }
      }
    if (path.includes('/menus/')) return state.snapshot
    return { item: state.item, _rev: state.revision, ...(state.liveData ? { liveData: state.liveData } : {}) }
  }
  return { state, calls, open: () => openQualityEmdashClient({ api, manifest, inspection, evidence }), api }
}
test('a capability declaration alone cannot certify an untested or changed installed image', async () => {
  const s = scenario()
  for (const change of [
    { evidence: null },
    { inspection: { ...inspection, imageId: `sha256:${'b'.repeat(64)}` } },
    { inspection: { ...inspection, backend: 'd1' } }
  ])
    await assert.rejects(
      openQualityEmdashClient({ api: s.api, manifest, inspection, evidence, ...change }),
      /IMAGE_UNVERIFIED/
    )
  assert.equal(s.calls.length, 0)
  s.state.capability.mutationRevisionReceipts = false
  await assert.rejects(s.open(), /CONDITIONAL_CMS_UNAVAILABLE/)
})
test('reads actual reference targets and published data separately from an owned draft', async () => {
  const s = scenario(),
    cms = await s.open()
  s.state.item.draftRevisionId = 'draft-id'
  s.state.item.data = { title: 'Draft', featured: 'actual-target' }
  s.state.liveData = { title: 'Before', featured: 'actual-target' }
  const read = await cms.read(operation)
  assert.equal(read.data.title, 'Before')
  assert.equal(read.draft.data.title, 'Draft')
  assert.equal(read.references.featured[0].id, 'actual-target')
  assert.equal(read.referenceTargets.featured[0].slug, 'real-story')
  await assert.rejects(cms.read({ ...operation, id: 'seed-home-id' }), /TARGET_CHANGED/)
  s.state.liveData = null
  await assert.rejects(cms.read(operation), /LIVE_DATA_MISSING/)
})
test('schema drift, shared fields and reference writes are refused before mutation', async () => {
  const s = scenario(),
    cms = await s.open(),
    before = await cms.read(operation)
  await cms.preflight(operation, before)
  s.state.collection.fields[0].translatable = false
  await assert.rejects(cms.preflight(operation, before), /FIELD_SCOPE/)
  s.state.collection.fields[0].translatable = true
  await assert.rejects(
    cms.preflight({ ...operation, fields: { featured: 'other-target' } }, before),
    /FIELD_SCOPE/
  )
  s.state.collection.fields.push({ slug: 'new-demo-copy', type: 'string' })
  await assert.rejects(cms.preflight(operation, before), /SCHEMA_CHANGED/)
  assert.equal(
    s.calls.some((c) => c.method !== 'GET'),
    false
  )
})
test('bound reference expectations compare actual target IDs and trusted repair slugs do not rebind identities', async () => {
  const s = scenario(),
    cms = await s.open()
  const scoped = { ...operation, id: 'actual-home', expectedReferences: { featured: ['actual-target'] } }
  assert.equal((await cms.read(scoped)).references.featured[0].id, 'actual-target')
  await assert.rejects(
    cms.read({ ...scoped, expectedReferences: { featured: ['another-target'] } }),
    /REFERENCE_CHANGED/
  )
  s.state.item.slug = 'own-initial-rename'
  await assert.rejects(cms.read(scoped), /TARGET_CHANGED/)
  assert.equal((await cms.read({ ...scoped, currentSlug: 'own-initial-rename' })).id, 'actual-home')
  s.state.item.id = 'human-replacement'
  await assert.rejects(cms.read({ ...scoped, currentSlug: 'own-initial-rename' }), /TARGET_CHANGED/)
})
test('writes only bounded fields with the supplied CAS token and returns its mutation token, never a later read revision', async () => {
  const s = scenario(),
    cms = await s.open()
  const result = await cms.write({ ...operation, id: 'actual-home' }, operation.fields, {
    expectedRevision: 'before-r1'
  })
  assert.equal(result.revision, 'our-r2')
  assert.deepEqual(s.calls.at(-1), {
    method: 'PUT',
    path: '/_emdash/api/content/home/actual-home',
    body: { data: { title: 'After' }, _rev: 'before-r1' }
  })
  assert.throws(
    () => cms.write(operation, { title: 'After', slug: 'hijack' }, { expectedRevision: 'r1' }),
    /FIELD_SCOPE/
  )
  s.state.mutation = { _rev: 'later-human-r3' }
  await assert.rejects(cms.publish(operation, { expectedRevision: 'our-r2' }), /MUTATION_RECEIPT_MISSING/)
})
test('menu replacement uses semantic URLs while restoration preserves original identities and metadata', async () => {
  const s = scenario(),
    cms = await s.open(),
    before = await cms.read(menuOperation)
  assert.deepEqual(before.data.items, [{ label: 'Before', url: '/before' }])
  await cms.menuSet(menuOperation, menuOperation.items, { expectedRevision: before.revision })
  assert.deepEqual(s.calls.at(-1).body, {
    mode: 'replace',
    _rev: 'menu-r1',
    items: [{ type: 'custom', label: 'Home', customUrl: '/' }]
  })
  await cms.restoreMenu(menuOperation, before.snapshot, { expectedRevision: 'our-r2' })
  assert.deepEqual(s.calls.at(-1).body.snapshot, { label: 'Primary', items: snapshot.items })
  assert.equal(s.calls.at(-1).body.snapshot.items[0].id, 'original-item')
  await assert.rejects(cms.read({ ...menuOperation, name: 'other' }), /MENU_SCOPE/)
})

test('term and slug writes require matching image proofs and use bounded native requests', async () => {
  const detail = {
    kind: 'update',
    key: 'stories/sample@en',
    collection: 'stories',
    slug: 'sample',
    newSlug: 'coffee-story',
    locale: 'en',
    id: 'actual-story',
    fields: { title: 'Coffee' }
  }
  const term = {
    kind: 'term-update',
    key: 'term:sector/energy@en',
    name: 'sector',
    slug: 'energy',
    locale: 'en',
    id: 'actual-term',
    fields: { label: 'Coffee', slug: 'coffee', description: '' }
  }
  const declared = {
    ...manifest,
    records: [
      {
        key: detail.key,
        collection: 'stories',
        slug: 'sample',
        locale: 'en',
        route: '/stories/sample',
        fields: [{ slug: 'title', type: 'string' }]
      }
    ],
    terms: [{ key: term.key, name: 'sector', slug: 'energy', locale: 'en' }]
  }
  const calls = [],
    state = {
      redirects: [],
      snapshot: {
        id: 'actual-term',
        name: 'sector',
        locale: 'en',
        label: 'Energy',
        slug: 'energy',
        dataRaw: '{"custom":"keep"}',
        parentId: null,
        translationGroup: 'term-group',
        sortOrder: 3,
        associations: [],
        _rev: 'term-r1'
      }
    }
  const api = async (method, path, body) => {
    calls.push({ method, path, body })
    if (path.endsWith('/write-capabilities'))
      return { ...capability, conditionalSlugRename: true, conditionalTermMetadata: true }
    if (method === 'GET' && path.includes('/schema/collections/'))
      return { item: { supports: ['revisions'], fields: declared.records[0].fields } }
    if (method === 'GET' && path.includes('/redirects?')) return { items: state.redirects }
    if (method === 'GET' && path.includes('/term-metadata/')) return structuredClone(state.snapshot)
    if (method === 'PUT') return { _rev: 'later-read', _mutationRev: 'own-r2' }
    throw new Error(`Unexpected test request ${method} ${path}`)
  }
  const unverified = await openQualityEmdashClient({ api, manifest: declared, evidence, inspection })
  await assert.rejects(unverified.rename(detail, 'coffee-story', { expectedRevision: 'r1' }), /RENAME_SCOPE/)
  assert.throws(() => unverified.termSet(term, term.fields, { expectedRevision: 'r1' }), /TERM_SCOPE/)
  const tested = { ...evidence, assertions: [...evidence.assertions, 'slug-omit-cas', 'term-metadata-cas'] }
  const cms = await openQualityEmdashClient({ api, manifest: declared, evidence: tested, inspection })
  const before = await cms.read(term)
  const expected = cms.intendedAfter(term, before)
  assert.deepEqual(JSON.parse(expected.data.dataRaw), { custom: 'keep', description: '' })
  await cms.preflight(term, before)
  await cms.termSet(term, term.fields, { expectedRevision: 'term-r1' })
  assert.deepEqual(calls.at(-1).body, {
    mode: 'patch',
    _rev: 'term-r1',
    label: 'Coffee',
    slug: 'coffee',
    description: ''
  })
  await cms.restoreTerm(term, before.snapshot, { expectedRevision: 'own-r2' })
  assert.deepEqual(calls.at(-1).body.snapshot, {
    label: 'Energy',
    slug: 'energy',
    dataRaw: '{"custom":"keep"}'
  })
  await cms.preflight(detail, { references: {} })
  assert.equal(
    (await cms.rename(detail, 'coffee-story', { expectedRevision: 'published-r1' })).revision,
    'own-r2'
  )
  assert.deepEqual(calls.at(-1).body, { slug: 'coffee-story', redirectPolicy: 'omit', _rev: 'published-r1' })
  state.redirects = [
    {
      id: 'redirect',
      enabled: true,
      isPattern: false,
      source: '/stories/coffee-story',
      destination: '/other'
    }
  ]
  await assert.rejects(cms.preflight(detail, { references: {} }), /INTERCEPTS_ROUTE/)
  state.redirects = [
    { id: 'pattern', enabled: true, isPattern: true, source: '^/stories/.*$', destination: '/other' }
  ]
  await assert.rejects(cms.rename(detail, 'sample', { expectedRevision: 'own-r2' }), /PATTERN_UNSUPPORTED/)
})
