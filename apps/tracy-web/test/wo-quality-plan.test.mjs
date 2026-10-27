import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildQualityDossier, deterministicFacts } from '../src/opportunities-build/quality-dossier.js'
import {
  qualityManifest,
  qualityManifestModelView,
  validateQualityPlan
} from '../src/opportunities-build/quality-plan.js'

const sha = 'a'.repeat(64),
  tag = 'synthetic/emdash'
const seed = {
  defaultLocale: 'en',
  collections: [
    {
      slug: 'home',
      fields: [
        { slug: 'title', type: 'string', required: true },
        { slug: 'hero_text', type: 'text' }
      ]
    },
    {
      slug: 'stories',
      urlPattern: '/stories/{slug}',
      fields: [{ slug: 'title', type: 'string', required: true }]
    }
  ],
  content: {
    home: [
      { slug: 'home', locale: 'en', data: { title: 'Home', hero_text: 'Industrial sample' } },
      { slug: 'home', locale: 'fr', data: { title: 'Maison', hero_text: 'Sample' } }
    ],
    stories: [{ slug: 'sample', locale: 'en', data: { title: 'Industrial project' } }]
  },
  menus: [{ id: 'primary', locale: 'en', name: 'primary', items: [{ label: 'Home', url: '/' }] }]
}
const release = { tag, setting: { version: '1.0.0' }, pages: [{ id: 'home', home: true, label: 'Home' }] }
const capabilities = {
  hash: 'capabilities',
  release: { tag, version: '1.0.0', parts: { state: sha } },
  completeness: { unresolved: [] }
}
const manifest = qualityManifest({
  release,
  capabilities,
  seed,
  seedSha256: sha,
  archiveSha256: sha,
  personalize: {}
})
const source = {
  id: 'official',
  kind: 'official-website',
  branch: 'main',
  body: 'Coffee and sandwiches by the river.\n\nOpen daily 7AM to 10PM.'
}
const dossier = buildQualityDossier({
  accountId: 'a',
  snapshotId: 'snapshot',
  business: { name: 'Synthetic cafe' },
  at: '2026-10-20T12:00:00Z',
  sources: [source],
  proposals: deterministicFacts([source])
})
const observations = { hash: 'observed', pictures: [] }
const quote = 'Coffee and sandwiches by the river.'
const good = () => ({
  schemaVersion: 'tracy-wo-plan/v1',
  inputHash: dossier.inputHash,
  manifestHash: manifest.hash,
  observationHash: observations.hash,
  locale: 'en',
  otherLocales: 'empty-by-policy',
  message: 'A concise cafe site',
  unresolved: [],
  records: [
    {
      key: 'home/home@en',
      state: 'planned',
      reason: 'Required home',
      fields: [
        { field: 'title', action: 'preserve', reason: 'Interface label' },
        {
          field: 'hero_text',
          action: 'set',
          value: quote,
          copyPolicy: 'source-exact',
          sourceRefs: [{ sourceId: 'official', start: 0, end: quote.length, quote }],
          claimRefs: [],
          reason: 'Own website'
        }
      ]
    },
    {
      key: 'stories/sample@en',
      state: 'empty-by-policy',
      reason: 'No source for industrial project',
      fields: []
    }
  ],
  navigation: [
    { menuId: 'primary', reason: 'Keep the useful home route', items: [{ label: 'Home', url: '/' }] }
  ]
})
const check = (p) => validateQualityPlan(p, { manifest, dossier, observations })

test('a validated plan compiles every record, including hidden locales and navigation, to finite operations', () => {
  const r = check(good())
  assert.deepEqual(r.errors, [])
  assert.equal(r.artifact.operations.length, 4)
  assert.ok(r.artifact.operations.some((o) => o.kind === 'unpublish' && o.locale === 'fr'))
  assert.equal(r.artifact.operations.find((o) => o.kind === 'update').fields.hero_text, quote)
})
test('model view excludes other-locale copies but keeps their explicit policy membership in the frozen manifest', () => {
  const view = qualityManifestModelView(manifest)
  assert.equal(view.records.length, 2)
  assert.equal(manifest.records.length, 3)
  assert.equal(view.schemas.length, 2)
  assert.deepEqual(manifest.inactiveLocalePolicy.members, ['home/home@fr'])
  assert.equal(view.inactiveLocalePolicy.memberCount, 1)
  assert.equal(check(good()).artifact.localePolicies[0].menuAction, 'preserved-but-inactive')
  assert.throws(
    () =>
      qualityManifest({
        release,
        capabilities,
        seed,
        seedSha256: sha,
        archiveSha256: sha,
        requestedLocales: ['en', 'fr']
      }),
    /LANGUAGE_UNSUPPORTED/
  )
})
test('only primary navigation requires Home; a secondary menu may be empty for an explicit reason', () => {
  const full = {
    ...manifest,
    menus: [...manifest.menus, { id: 'legal', name: 'footer_legal', locale: 'en', items: [] }]
  }
  const plan = good()
  plan.navigation.push({ menuId: 'legal', items: [], reason: 'No verified legal document was supplied.' })
  assert.deepEqual(validateQualityPlan(plan, { manifest: full, dossier, observations }).errors, [])
  delete plan.navigation[1].reason
  assert.ok(
    validateQualityPlan(plan, { manifest: full, dossier, observations }).errors.includes(
      'PLAN_NAVIGATION_REASON'
    )
  )
})
test('release drift or unresolved public routes refuse the manifest', () => {
  assert.throws(
    () =>
      qualityManifest({
        release,
        capabilities: { ...capabilities, release: { ...capabilities.release, version: 'latest' } },
        seed,
        seedSha256: sha,
        archiveSha256: sha
      }),
    /RELEASE_MISMATCH/
  )
  assert.throws(
    () =>
      qualityManifest({
        release: { ...release, pages: [{ id: 'missing', label: 'Unknown' }] },
        capabilities,
        seed,
        seedSha256: sha,
        archiveSha256: sha
      }),
    /ROUTE_UNRESOLVED/
  )
})
test('unknown keys, unknown fields and missing group fields refuse before any write', () => {
  assert.ok(check({ ...good(), sql: 'delete' }).errors.includes('PLAN_UNKNOWN_KEY'))
  const p = good()
  p.records[0].fields.push({ field: 'invented', action: 'set', value: 'bad', reason: 'bad' })
  assert.ok(check(p).errors.includes('PLAN_FIELD_UNKNOWN_OR_DUPLICATE'))
  p.records[0].fields = p.records[0].fields.slice(0, 1)
  assert.ok(check(p).errors.some((e) => e.startsWith('PLAN_FIELD_UNCOVERED')))
})
test('required surface blocked, wrong locale and stale frozen hashes are not complete plans', () => {
  const p = good()
  p.records[0].state = 'blocked'
  assert.ok(check(p).errors.some((e) => e.startsWith('PLAN_REQUIRED_ROUTE_BLOCKED')))
  assert.equal(check({ ...good(), locale: 'fr' }).ok, false)
  assert.equal(check({ ...good(), inputHash: 'stale' }).ok, false)
})
test('a numeric opening-hours claim cannot be relabelled happy hour using the same source', () => {
  const p = good(),
    f = dossier.facts.find((f) => f.type === 'opening-hours')
  p.records[0].fields[1] = {
    field: 'hero_text',
    action: 'set',
    value: 'Happy hour 7AM to 10PM.',
    copyPolicy: 'sourced-paraphrase',
    sourceRefs: f.sourceRefs,
    claimRefs: [{ id: f.id, type: f.type, branch: f.branch, value: f.value }],
    reason: 'Claim regression'
  }
  assert.ok(check(p).errors.includes('PLAN_PROMOTION_UNSUPPORTED'))
})
test('unsupported demo prose cannot be preserved and an unsourced CTA cannot enter navigation', () => {
  const p = good()
  p.records[0].fields[1] = { field: 'hero_text', action: 'preserve', reason: 'Keep sample' }
  assert.ok(check(p).errors.includes('PLAN_DEMO_CONTENT_PRESERVED'))
  const q = good()
  q.navigation[0].items.push({ label: 'Contact', url: 'https://booking.invalid' })
  assert.ok(check(q).errors.includes('PLAN_NAVIGATION_TARGET'))
})

test('kept references require kept targets, detail slug changes stay finite and terms require explicit metadata', () => {
  const expandedSeed = structuredClone(seed)
  expandedSeed.collections[0].fields.push({
    slug: 'featured',
    type: 'reference',
    validation: { targetCollection: 'stories' }
  })
  expandedSeed.content.home[0].data.featured = '$ref:stories:sample:en'
  expandedSeed.taxonomies = [
    { name: 'sector', locale: 'en', terms: [{ slug: 'energy', label: 'Energy', locale: 'en' }] }
  ]
  const full = qualityManifest({
    release,
    capabilities,
    seed: expandedSeed,
    seedSha256: sha,
    archiveSha256: sha
  })
  const p = good()
  p.manifestHash = full.hash
  p.records[0].fields.push({
    field: 'featured',
    action: 'preserve',
    reason: 'Keep the actual reference identity.'
  })
  p.terms = [
    {
      key: 'term:sector/energy@en',
      label: 'Food',
      slug: 'food',
      description: '',
      reason: 'The kept story is about food.'
    }
  ]
  assert.ok(
    validateQualityPlan(p, { manifest: full, dossier, observations }).errors.includes(
      'PLAN_REFERENCE_TARGET_NOT_PLANNED'
    )
  )
  p.records[1] = {
    key: 'stories/sample@en',
    state: 'planned',
    reason: 'A truthful food story.',
    newSlug: 'food-story',
    fields: [
      { field: 'title', action: 'set', value: 'Food', copyPolicy: 'label', reason: 'Interface label.' }
    ]
  }
  const checked = validateQualityPlan(p, { manifest: full, dossier, observations })
  assert.deepEqual(checked.errors, [])
  assert.equal(
    checked.artifact.coverage.find((c) => c.key === 'stories/sample@en').route,
    '/stories/food-story'
  )
  assert.equal(checked.artifact.operations.find((o) => o.key === 'stories/sample@en').newSlug, 'food-story')
  assert.equal(checked.artifact.operations.find((o) => o.kind === 'term-update').fields.slug, 'food')
  p.terms = []
  assert.ok(
    validateQualityPlan(p, { manifest: full, dossier, observations }).errors.includes(
      'PLAN_TERM_UNCOVERED:term:sector/energy@en'
    )
  )
  p.records[0].newSlug = 'renamed-home'
  assert.ok(
    validateQualityPlan(p, { manifest: full, dossier, observations }).errors.includes('PLAN_SLUG_SCOPE')
  )
})

test('a testimonial quotes a review source whole, and its author and platform exactly as collected (product owner, 26/10/2026)', () => {
  const review = {
    id: 'review:1',
    kind: 'review',
    branch: 'main',
    author: 'Lan',
    provider: 'Google Reviews',
    url: 'https://maps.test/r1',
    body: 'Best flat white in town.'
  }
  const withReview = buildQualityDossier({
    accountId: 'a',
    snapshotId: 'snapshot',
    business: { name: 'Synthetic cafe' },
    at: '2026-10-20T12:00:00Z',
    sources: [source, review],
    proposals: deterministicFacts([source])
  })
  const ref = { sourceId: 'review:1', start: 0, end: review.body.length, quote: review.body }
  const plan = (author) => {
    const p = good()
    p.inputHash = withReview.inputHash
    p.records[0].fields = [
      {
        field: 'title',
        action: 'set',
        value: author,
        copyPolicy: 'source-exact',
        sourceRefs: [ref],
        claimRefs: [],
        reason: 'The guest who wrote the review'
      },
      {
        field: 'hero_text',
        action: 'set',
        value: review.body,
        copyPolicy: 'source-exact',
        sourceRefs: [ref],
        claimRefs: [],
        reason: 'A guest review, word for word'
      }
    ]
    return validateQualityPlan(p, { manifest, dossier: withReview, observations })
  }
  assert.deepEqual(plan('Lan').errors, [])
  assert.ok(plan('Jane Demo').errors.includes('PLAN_COPY_NOT_EXACT'))
})
