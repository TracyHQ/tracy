import sharp from 'sharp'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { briefOf } from '../src/opportunities-build/demo-qa.js'
import { inventoryInvariant } from '../src/sites/agent-demo-inventory.js'
import {
  AGENT_DEMO,
  freezeAgentResearch,
  checkedResearch,
  bundlePart,
  validateAgentPlan as validateUnwired,
  agentDemoCollected,
  clientSendSteps,
  demoInstructions,
  ownSiteInstructions,
  agentPlanGuide,
  agentPlanSources,
  agentDemoCreateContext,
  agentDemoCapabilities,
  agentDemoPrompt,
  researchHash,
  amendsPlan,
  postCoverage,
  templatePostTitles,
  templatePostsLeft,
  isLogo,
  structurePage,
  editorialLeads,
  leadCoverage,
  wordpressLogoOptions,
  inventoryRoutes,
  postDraftsOf,
  postTopicNames
} from '../src/opportunities-build/agent-demo.js'
import { planSweep } from '../src/opportunities-build/residue-sweep.js'

// app.js hands the sites domain's invariant to the plan validator; the tests wire it the same way.
const validateAgentPlan = (plan, bundle, options = {}) =>
  validateUnwired(plan, bundle, { inventoryInvariant, ...options })

const bytes = Buffer.from('frozen picture')
const sha256 = createHash('sha256').update(bytes).digest('hex')
function fixture(cms = 'wordpress', sourceBytes = bytes) {
  const sourceSha = createHash('sha256').update(sourceBytes).digest('hex')
  const media = Array.from({ length: 30 }, (_, i) => ({
    id: `asset-${i}`,
    sha256: sourceSha,
    kind: 'image',
    mime: 'image/jpeg',
    source: 'facebook',
    sourceUrl: `https://example.test/photos/${i}`
  }))
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-22T00:00:00Z',
    read: {
      profile: { name: 'Place', password: 'never disclose' },
      media,
      rawSources: [
        {
          id: 'source-1',
          source: 'facebook',
          collected: { posts: [{ text: 'historic offer' }], authorization: 'secret' }
        }
      ],
      posts: [{ text: 'historic offer' }]
    }
  })
  // The brief names no template; the build's choice does (`build-choice.js`).
  const choice = {
    cms,
    template: { design: 'template', quickstart: 'tag', version: '1' },
    quickstartWorkflow: AGENT_DEMO
  }
  const revision = {
    id: 'revision',
    account_id: 'account',
    cms,
    template: choice.template,
    asset_manifest: media,
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle }
  }
  const structure = {
    contract: { slots: [{ key: 'hero.image' }] },
    pages: [{ route: '/', count: 3, publication: 'published' }],
    inventory: {
      version: 'agent-demo-native/1',
      complete: true,
      records: [
        { key: 'module/4', identity: { kind: 'module', id: 4 }, data: { params: { image: 'photo.jpg' } } },
        {
          key: 'pages/home',
          identity: { collection: 'pages', id: 'home', slug: 'home', locale: 'en' },
          data: { blocks: [{ image: 'photo.jpg' }] }
        }
      ]
    }
  }
  const plan = {
    version: AGENT_DEMO,
    researchHash: bundle.hash,
    structureHash: researchHash(structure),
    structure,
    rows: [
      {
        page: '/',
        section: 'hero',
        goal: 'Use verified facts',
        sourceIds: ['source-1'],
        assetIds: ['asset-29'],
        target: { kind: 'contract', slot: 'hero.image' },
        operation: 'replace-image',
        verify: 'Read back the native image and inspect mobile'
      }
    ]
  }
  const build = {
    ...revision,
    brief: { agentDemoSnapshot: bundle },
    choice,
    id: 'build',
    revision_id: 'revision',
    site_key: 'site.test',
    action_id: 'action',
    action_status: 'queued',
    request_id: 'request',
    label: 'site',
    content: { agentDemo: { structure: plan.structure, structureHash: plan.structureHash } },
    handoff: {}
  }
  let revoked = false
  const pool = {
    async query(sql, args) {
      if (sql.startsWith('select b.*,r.brief,r.brief_md,r.research,r.place_profile,r.id'))
        return { rows: [{ ...build, revision_account_id: 'account' }] }
      if (sql.startsWith('select id,session_id,selection from wo_demo_action'))
        return { rows: build.action_status === 'queued' ? [{ id: 'action' }] : [] }
      if (sql.includes('join wo_demo_action a'))
        return {
          rows: args[0] === 'site.test' && args[1] === 'account' && args[2] === 'session' ? [build] : []
        }
      if (sql.includes('from wo_media'))
        return {
          rows: revoked
            ? []
            : media.map((m) => ({ ...m, object_key: 'private/frozen', bytes: sourceBytes.length }))
        }
      if (sql.startsWith('update wo_build set handoff=jsonb_set')) {
        build.content.agentDemo.imports[args[1]] = JSON.parse(args[3])
        return { rows: [] }
      }
      if (sql.startsWith('update wo_build set content=jsonb_set(content,array[')) {
        build.content.agentDemo.imports[args[1]].state = 'unknown'
        return { rows: [] }
      }
      if (sql.includes("'{agentDemo,imports}'")) {
        build.content.agentDemo.imports ??= {}
        build.content.agentDemo.imports[args[1]] = JSON.parse(args[2])
        return { rows: [{ id: 'build' }] }
      }
      if (sql.startsWith('update wo_build set content=jsonb_set')) {
        build.content.agentDemo = JSON.parse(args[1])
        return { rows: [{ id: 'build' }] }
      }
      if (sql.startsWith('update wo_build set handoff=jsonb_set')) return { rows: [] }
      throw new Error(`Unexpected test SQL: ${sql}`)
    }
  }
  return {
    bundle,
    revision,
    plan,
    build,
    pool,
    revoke: () => {
      revoked = true
    }
  }
}

test('full research is frozen, hashed, privately serializable and media pagination reaches beyond first 24', () => {
  const { bundle, revision } = fixture()
  assert.equal(bundle.counts.media, 30)
  assert.equal(checkedResearch(revision).hash, bundle.hash)
  assert.equal(JSON.stringify(bundle).includes('never disclose'), false)
  assert.equal(JSON.stringify(bundle).includes('secret'), false)
  assert.equal(bundlePart(bundle, 'media', 25, 5).items.at(-1).id, 'asset-29')
  assert.equal(bundlePart(bundle, 'media', 25, 5).nextOffset, null)
  assert.equal(bundlePart(bundle, 'sources').items[0].data.collected.posts[0].text, 'historic offer')
  assert.throws(() => bundlePart(bundle, 'media', -1), /BAD_PAGE/)
  revision.brief.agentDemoSnapshot.profile.name = 'Changed'
  assert.throws(() => checkedResearch(revision), /SNAPSHOT_CHANGED/)
})

test('contract plan refuses an unknown live slot and a forged structure under the saved hash', async () => {
  const { bundle, plan, pool } = fixture()
  assert.throws(
    () =>
      validateAgentPlan(
        { ...plan, rows: [{ ...plan.rows[0], target: { kind: 'contract', slot: 'not-in-live-contract' } }] },
        bundle
      ),
    /SLOT_UNRESOLVED/
  )
  const service = agentDemoCapabilities({ pool, objects: null })
  await assert.rejects(
    service.call(
      { accountId: 'account', siteKey: 'site.test', sessionId: 'session' },
      { operation: 'plan.save', plan: { ...plan, structure: { contract: { slots: [{ key: 'forged' }] } } } }
    ),
    /STRUCTURE_CHANGED/
  )
})

test('review and platform rating views keep verbatim attribution, source paths and honest record counts', () => {
  const bundle = freezeAgentResearch({
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    cms: 'joomla',
    template: {},
    at: '2026-10-22',
    read: {
      // The shapes a real read holds: Place Details' facts (`placeFactsFromDetails`, which asks for the rating since
      // 26/10/2026), the search listing on the candidate, and the read's rating decision (`business-rating.js`).
      opportunity: {
        candidate: { provider: 'google-places', providerId: 'ChIJp1', rating: 4.7, reviews: 100 }
      },
      profile: {
        googlePlace: {
          placeId: 'ChIJp1',
          rating: 4.7,
          userRatingCount: 100,
          reviews: [
            {
              author: 'Reviewer',
              text: 'Original words',
              publishTime: '2026-01-01T00:00:00Z',
              googleMapsUri: 'https://maps.google.com/?cid=1&review=1'
            }
          ],
          attribution: 'Google',
          fetchedAt: '2026-10-22T00:00:00.000Z'
        },
        googleRating: { state: 'shown', score: 4.7, reviews: 100, few: false, choice: null, from: 'details' }
      },
      rawSources: [
        {
          id: 'ta',
          source: 'tripadvisor',
          collected: {
            rating: 4.1,
            reviewCount: 30,
            reviews: [{ text: 'Separate platform', author: 'Other reviewer' }]
          }
        }
      ],
      media: [],
      posts: []
    }
  })
  assert.equal(bundle.counts.reviews, 2)
  assert.equal(bundle.counts.ratings, 2)
  const reviews = bundlePart(bundle, 'reviews').items
  assert.equal(reviews[0].review.text, 'Original words')
  assert.equal(reviews[0].review.author, 'Reviewer')
  assert.equal(reviews[0].sourcePath, 'profile.googlePlace.reviews[0]')
  assert.equal(reviews[1].sourceId, 'ta')
  const ratings = bundlePart(bundle, 'ratings').items
  assert.deepEqual(
    ratings.map((row) => row.rating),
    [4.7, 4.1]
  )
  assert.deepEqual(
    ratings.map((row) => row.reviewCount),
    [100, 30]
  )
  assert.match(bundle.countBasis, /not deduplicated/)
})

test("Google's rating of the place, paid for at discovery, is one of the platform ratings", () => {
  const read = (googlePlace) => ({
    opportunity: {
      candidate: {
        provider: 'google-places',
        providerId: 'p1',
        rating: 4.6,
        reviews: 1234,
        mapsUrl: 'https://maps.google.com/?cid=1'
      }
    },
    profile: { googlePlace },
    rawSources: [],
    media: [],
    posts: []
  })
  const bundle = freezeAgentResearch({
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    at: '2026-10-26',
    read: read({})
  })
  assert.equal(bundle.counts.ratings, 1)
  assert.deepEqual(bundlePart(bundle, 'ratings').items, [
    {
      sourceId: null,
      sourcePath: 'opportunity.candidate.rating',
      platform: 'Google',
      rating: 4.6,
      reviewCount: 1234,
      url: 'https://maps.google.com/?cid=1'
    }
  ])
  // A rating the listing itself carries is not counted twice.
  const held = freezeAgentResearch({
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    at: '2026-10-26',
    read: read({ rating: 4.6, userRatingCount: 1234 })
  })
  assert.equal(held.counts.ratings, 1)
})

test("Google's rating left off the site (few reviews) is no rating the agent reads; other platforms' stay", () => {
  const bundle = freezeAgentResearch({
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    at: '2026-10-26',
    read: {
      opportunity: {
        candidate: { provider: 'google-places', providerId: 'ChIJd', rating: 5, reviews: 4 }
      },
      profile: {
        googlePlace: { placeId: 'ChIJd', rating: 5, userRatingCount: 4, reviews: [] },
        googleRating: { state: 'left', score: 5, reviews: 4, few: true, choice: null, from: 'details' }
      },
      rawSources: [
        { id: 'g', source: 'google-places', collected: { placeId: 'ChIJd', rating: 5, userRatingCount: 4 } },
        { id: 'ta', source: 'tripadvisor', collected: { rating: 4.1, reviewCount: 30, reviews: [] } }
      ],
      media: [],
      posts: []
    }
  })
  assert.equal(bundle.counts.ratings, 1)
  assert.deepEqual(
    bundlePart(bundle, 'ratings').items.map((r) => [r.sourceId, r.rating]),
    [['ta', 4.1]]
  )
})

test('old revisions missing canonical snapshot fail explicitly', () => {
  assert.throws(() => checkedResearch({ brief: { quickstartWorkflow: AGENT_DEMO } }), /SNAPSHOT_MISSING/)
})

test('plans validate all CMS native targets and refuse outside sources/assets/site/unsupported actions', () => {
  const { bundle, plan } = fixture()
  for (const target of [
    { kind: 'contract', slot: 'hero.image' },
    { kind: 'native', type: 'module', id: 4, path: 'params.image' },
    { kind: 'emdash', collection: 'pages', id: 'home', path: 'blocks[0].image' }
  ]) {
    assert.match(
      validateAgentPlan({ ...plan, rows: [{ ...plan.rows[0], target }] }, bundle).hash,
      /^[a-f0-9]{64}$/
    )
  }
  for (const patch of [
    { sourceIds: ['outside'] },
    { assetIds: ['outside'] },
    { operation: 'unpublish' },
    { target: { kind: 'contract', slot: 'hero.image', siteKey: 'other.test' } },
    { target: { kind: 'native', id: 4 } }
  ]) {
    assert.throws(
      () => validateAgentPlan({ ...plan, rows: [{ ...plan.rows[0], ...patch }] }, bundle),
      /PLAN_INVALID/
    )
  }
})

test('provision-only requires frozen server WO build and active action; browser cannot bypass fill', async () => {
  const { pool, build, bundle } = fixture()
  const args = {
    accountId: 'account',
    buildId: 'create-id',
    body: {
      platform: 'wordpress',
      design: 'template',
      quickstart: 'tag',
      label: 'site',
      workflow: AGENT_DEMO
    }
  }
  assert.equal((await agentDemoCreateContext(pool, args)).hash, bundle.hash)
  await assert.rejects(
    agentDemoCreateContext(pool, { ...args, body: { ...args.body, brief: {} } }),
    /CREATE_PAYLOAD/
  )
  await assert.rejects(
    agentDemoCreateContext(pool, { ...args, body: { ...args.body, quickstart: 'other' } }),
    /CREATE_PAYLOAD/
  )
  await assert.rejects(agentDemoCreateContext(pool, { ...args, buildId: null }), /BUILD_REQUIRED/)
  build.action_status = 'failed'
  await assert.rejects(agentDemoCreateContext(pool, args), /ACTION_CLOSED/)
})

test('provision refuses changed archive identity, omitted release pin and extra browser instructions', async () => {
  const { pool, build, bundle } = fixture()
  const release = { version: '1', files: { source: { file: 'source.zip', sha256: 'a'.repeat(64) } } }
  build.choice.template.release = release
  const { hash: _hash, ...payload } = bundle
  bundle.hash = researchHash(payload)
  const args = {
    accountId: 'account',
    buildId: 'create-id',
    body: {
      workflow: AGENT_DEMO,
      platform: 'wordpress',
      design: 'template',
      quickstart: 'tag',
      label: 'site',
      expectedQuickstartRelease: release
    },
    install: { version: '1', install: release.files }
  }
  assert.equal((await agentDemoCreateContext(pool, args)).revisionId, 'revision')
  await assert.rejects(
    agentDemoCreateContext(pool, { ...args, install: { version: '2', install: release.files } }),
    /RELEASE_CHANGED/
  )
  await assert.rejects(
    agentDemoCreateContext(pool, { ...args, body: { ...args.body, expectedQuickstartRelease: undefined } }),
    /RELEASE_CHANGED/
  )
  await assert.rejects(
    agentDemoCreateContext(pool, { ...args, body: { ...args.body, designSystem: 'outside' } }),
    /CREATE_PAYLOAD/
  )
})

test('capability binds account/site/session, persists plan before import and imports frozen asset 29 with receipts', async () => {
  const { pool, plan, build } = fixture()
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(bytes) } })
  for (const patch of [{ accountId: 'other' }, { siteKey: 'other.test' }, { sessionId: 'other-session' }]) {
    await assert.rejects(service.call({ ...auth, ...patch }, { operation: 'read' }), /NOT_GRANTED/)
  }
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'asset-29' }),
    /PLAN_REQUIRED/
  )
  const saved = await service.call(auth, { operation: 'plan.save', plan })
  assert.equal((await service.call(auth, { operation: 'plan.read' })).plan.hash, saved.planHash)
  await assert.rejects(
    service.call(auth, { operation: 'plan.save', plan: { ...plan, structure: {} } }),
    /PLAN_FROZEN|STRUCTURE_CHANGED/
  )
  let uploads = 0
  const result = await service.call(
    auth,
    { operation: 'media.import', assetId: 'asset-29' },
    {
      upload: async ({ action, params }) => {
        uploads++
        assert.equal(action, 'media.upload')
        assert.equal(Buffer.from(params.content_b64, 'base64').toString(), bytes.toString())
        // WordPress answers the attachment it made (`Engine.php` mediaUpload)
        return { status: 200, body: { ok: true, attachment: 4417 } }
      }
    }
  )
  assert.equal(uploads, 1)
  assert.equal(result.assetId, 'asset-29')
  // the build can name it as a post's featured image (local stand 24/10/2026)
  assert.equal(result.attachmentId, 4417)
  assert.equal(result.sha256, sha256)
  assert.equal(result.sourceUrl, 'https://example.test/photos/29')
  const replay = await service.call(
    auth,
    { operation: 'media.import', assetId: 'asset-29' },
    {
      upload: async () => {
        throw new Error('must not replay a confirmed upload')
      }
    }
  )
  assert.equal(replay.state, 'written')
  assert.equal(uploads, 1)
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'outside' }),
    /ASSET_NOT_PLANNED/
  )
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'asset-29', url: 'https://outside.test' }),
    /BAD_ASSET_REQUEST/
  )
  build.action_status = 'failed'
  await assert.rejects(service.call(auth, { operation: 'guard' }), /ACTION_CLOSED/)
})

test("the brief's logo imports with no plan row naming it; any other unplanned picture is still refused", async () => {
  // The Willow Nook (lrsweep rig, JA Diner wp7, 25/10/2026): the research found the business's logo, the agent's
  // frozen plan named no row for it, and both of its imports were refused, so the header kept a wordmark.
  const { pool, plan, build } = fixture()
  build.brief = { ...build.brief, brand: { logo: 'asset-3' } }
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(bytes) } })
  await service.call(auth, { operation: 'plan.save', plan })
  const upload = async () => ({ status: 200, body: { ok: true, attachment: 4420 } })
  const logo = await service.call(auth, { operation: 'media.import', assetId: 'asset-3' }, { upload })
  assert.equal(logo.assetId, 'asset-3')
  assert.equal(logo.attachmentId, 4420)
  assert.equal(build.content.agentDemo.imports['asset-3'].state, 'written')
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'asset-4' }, { upload }),
    /ASSET_NOT_PLANNED/
  )
  // A row index is still a planned row's: the logo is not laid in a row it is not in.
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'asset-3', rowIndex: 0 }, { upload }),
    /ASSET_NOT_PLANNED/
  )
})

test('Stop/revocation during byte read blocks import; corrupted store bytes and provider errors never claim receipt', async () => {
  for (const issue of ['stopped', 'revoked', 'corrupt', 'provider']) {
    const { pool, plan, build, revoke } = fixture()
    const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
    let uploads = 0
    const service = agentDemoCapabilities({
      pool,
      objects: {
        get: async () => {
          if (issue === 'stopped') build.action_status = 'failed'
          if (issue === 'revoked') revoke()
          if (issue === 'provider') return new Response('', { status: 503 })
          return new Response(issue === 'corrupt' ? 'tampered' : bytes)
        }
      }
    })
    await service.call(auth, { operation: 'plan.save', plan })
    await assert.rejects(
      service.call(
        auth,
        { operation: 'media.import', assetId: 'asset-29' },
        {
          upload: async () => {
            uploads++
            return { status: 200, body: {} }
          }
        }
      ),
      /ACTION_CLOSED|ASSET_REVOKED|ASSET_CHANGED|MEDIA_UNAVAILABLE/
    )
    assert.equal(uploads, 0)
  }
})

test('new prompt names only implemented capability and requires plan/readback/independent review', () => {
  const { revision, bundle } = fixture()
  const prompt = agentDemoPrompt(revision)
  assert.ok(prompt.includes(bundle.hash))
  assert.ok(prompt.includes('30 media'))
  assert.ok(prompt.includes('Before ANY content mutation'))
  assert.ok(prompt.includes('pilot always needs human review'))
  assert.ok(prompt.includes('same photo'))
})

test('unknown in-flight import is kept for reconciliation and blocked/budget-stopped turns cannot continue', async () => {
  const { pool, plan, build } = fixture()
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(bytes) } })
  await service.call(auth, { operation: 'plan.save', plan })
  let attempts = 0
  const upload = async () => {
    attempts++
    throw new Error('lost receipt after native write')
  }
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'asset-29' }, { upload }),
    /IMPORT_UNCERTAIN/
  )
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'asset-29' }, { upload }),
    /IMPORT_UNCERTAIN/
  )
  assert.equal(attempts, 1)
  for (const reason of ['blocked', 'aborted', 'max-tokens', 'error']) {
    build.turn_end_reason = reason
    await assert.rejects(service.call(auth, { operation: 'guard' }), /TURN_STOPPED/)
  }
})

test('frozen plan crop/source canvas imports real derivative bytes once and keeps parent attribution', async () => {
  const original = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#bf5b3d' } })
    .jpeg()
    .toBuffer()
  const { pool, plan, build } = fixture('wordpress', original)
  plan.rows[0].image = {
    assetId: 'asset-29',
    crop: {
      aspect: 4 / 3,
      source: { width: 400, height: 300 },
      output: { width: 200, height: 150 },
      strategy: 'centre'
    },
    canvas: {
      version: 1,
      output: { width: 400, height: 150 },
      foreground: { width: 200, height: 150, left: 100, top: 0 },
      minimumSourceWidth: 100
    }
  }
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(original) } })
  await service.call(auth, { operation: 'plan.save', plan })
  let uploads = 0
  const upload = async ({ params }) => {
    uploads++
    const output = Buffer.from(params.content_b64, 'base64')
    const meta = await sharp(output).metadata()
    assert.equal(meta.width, 400)
    assert.equal(meta.height, 150)
    assert.ok(params.path.includes(createHash('sha256').update(output).digest('hex')))
    return { status: 200, body: { ok: true } }
  }
  const result = await service.call(
    auth,
    { operation: 'media.import', assetId: 'asset-29', rowIndex: 0 },
    { upload }
  )
  assert.equal(result.derivative.parentAssetId, 'asset-29')
  assert.equal(result.derivative.parentSha256, createHash('sha256').update(original).digest('hex'))
  assert.equal(result.derivative.recipe.generatedScene, false)
  assert.equal(result.sourceUrl, 'https://example.test/photos/29')
  assert.equal(build.content.agentDemo.imports[result.importKey].sha256, result.sha256)
  await service.call(auth, { operation: 'media.import', assetId: 'asset-29', rowIndex: 0 }, { upload })
  assert.equal(uploads, 1)
})

test('plan guide supplies canonical frozen part refs and valid native keys/field examples without changing the snapshot', () => {
  const { bundle, plan, revision } = fixture()
  const original = JSON.stringify(bundle),
    hash = bundle.hash
  const refs = agentPlanSources(bundle)
  assert.equal(refs.find((ref) => ref.id === 'part:profile').sha256, researchHash(bundle.profile))
  assert.equal(refs.find((ref) => ref.id === 'part:profile').bundleHash, hash)
  const structure = {
    ...plan.structure,
    inventory: {
      complete: true,
      records: [
        {
          key: 'option/blogname',
          identity: { kind: 'option', key: 'blogname' },
          data: { value: 'Demo' },
          editorialFields: ['value']
        },
        {
          key: 'templatePart/header',
          identity: { kind: 'templatePart', key: 'header' },
          data: { id: 157, content: '<header>Demo</header>' },
          editorialFields: ['content']
        }
      ]
    }
  }
  const guide = agentPlanGuide(bundle, structure)
  // A plan places the place's own photos too (`coverage.photos`); each example row stands beside one.
  const photo = { ...guide.rowExamples[0], operation: 'replace-image', assetIds: ['asset-1'] }
  for (const row of guide.rowExamples)
    assert.ok(validateAgentPlan({ ...plan, structure, rows: [row, photo] }, bundle).hash)
  assert.deepEqual(guide.rowExamples[0].target, {
    kind: 'native',
    type: 'option',
    key: 'blogname',
    path: 'value'
  })
  assert.equal(JSON.stringify(bundle), original)
  assert.equal(checkedResearch(revision).hash, hash)
  for (const patch of [
    { sourceIds: ['profile.name'] },
    { sourceIds: ['part:invented'] },
    { operation: 'create' },
    { target: { kind: 'native', type: 'templatePart', id: 157, path: '/' } },
    { target: { kind: 'native', type: 'option', key: 'blogname', path: '/' } }
  ]) {
    try {
      validateAgentPlan({ ...plan, structure, rows: [{ ...guide.rowExamples[0], ...patch }] }, bundle)
      assert.fail('invalid plan accepted')
    } catch (error) {
      assert.ok(error.detail.issues.length)
      assert.equal(error.detail.issues[0].rowIndex, 0)
      assert.ok(error.detail.issues[0].field)
      assert.ok(error.detail.issues[0].reason)
      assert.ok(error.detail.guide.sourceRefs.some((ref) => ref.id === 'part:profile'))
    }
  }
  // The Willow Nook build 8b: WordPress pages are `post/<id>` records; a row naming type "page" was refused with
  // `expected: []` six times, and the agent dropped its page rows. The refusal names the record with that id.
  const page = {
    key: 'post/63',
    identity: { kind: 'post', id: 63 },
    data: { post_title: 'About', post_content: '<p>Template</p>' },
    editorialFields: ['post_title', 'post_content']
  }
  const pages = {
    ...structure,
    inventory: { ...structure.inventory, records: [...structure.inventory.records, page] }
  }
  try {
    validateAgentPlan(
      {
        ...plan,
        structure: pages,
        rows: [
          { ...guide.rowExamples[0], target: { kind: 'native', type: 'page', id: 63, path: 'post_content' } },
          photo
        ]
      },
      bundle
    )
    assert.fail('a page-typed target accepted')
  } catch (error) {
    const refusal = error.detail.issues.find((item) => item.path === 'rows[0].target')
    assert.deepEqual(refusal.expected[0].target, { kind: 'native', type: 'post', id: 63 })
    assert.match(refusal.reason, /type "post"/)
  }
})

test('a plan must place what the research collected: a review (or say why the template has none) and own photos', () => {
  const { bundle: plain, plan } = fixture()
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    template: plain.template,
    cms: 'wordpress',
    at: plain.at,
    read: {
      profile: {
        name: 'Place',
        googlePlace: { reviews: [{ text: 'Best pho in town, kind staff.', author: 'Lan' }] }
      },
      media: plain.media,
      rawSources: [{ id: 'source-1', source: 'facebook', collected: {} }],
      posts: []
    }
  })
  const base = { ...plan, researchHash: bundle.hash }
  const codes = (p) => {
    try {
      validateAgentPlan(p, bundle)
      return []
    } catch (error) {
      return error.detail.issues.map((i) => i.path)
    }
  }
  assert.deepEqual(codes(base), ['coverage.reviews'])
  const quote = {
    ...base.rows[0],
    operation: 'rewrite',
    sourceIds: ['part:reviews'],
    assetIds: [],
    section: 'testimonials'
  }
  assert.deepEqual(codes({ ...base, rows: [...base.rows, quote] }), [])
  assert.deepEqual(
    codes({
      ...base,
      unplaced: [{ item: 'reviews', reason: 'No testimonial, quote or review area in this quickstart.' }]
    }),
    []
  )
  assert.deepEqual(codes({ ...base, unplaced: [{ item: 'reviews', reason: 'none' }] }), ['unplaced'])
  assert.deepEqual(
    codes({ ...base, unplaced: [{ item: 'photos', reason: 'No room for any photo here at all.' }] }),
    ['unplaced', 'coverage.reviews']
  )
  assert.deepEqual(codes({ ...base, rows: [quote] }), ['coverage.photos'])
})

test('collected for the final check: brief facts, every collected review, own photo count and imported paths', () => {
  const { revision } = fixture()
  revision.brief.business = {
    name: 'Place',
    phone: '+84 90 000 1111',
    otherPhones: [{ phone: '+84 90 000 2222', whatsapp: true }],
    address: '1 Lê Lợi, Huế',
    hours: ['Monday: 7:00 AM – 9:00 PM']
  }
  const build = {
    content: {
      agentDemo: {
        plan: {
          unplaced: [{ item: 'reviews', reason: 'No testimonial area anywhere in this quickstart.' }],
          rows: [
            { page: '/', section: 'hero', goal: 'Name', operation: 'rewrite', sourceIds: ['p'], target: {} },
            {
              page: '/contact',
              section: 'Contact',
              goal: 'Email',
              operation: 'rewrite',
              sourceIds: ['p'],
              target: { kind: 'contract', slot: 'contact_email' }
            }
          ]
        },
        imports: {
          a: { state: 'written', path: 'https://site.test/wp-content/uploads/2026/10/a.jpg' },
          b: { state: 'unknown', path: '/wp-content/uploads/b.jpg' }
        }
      }
    }
  }
  const { collected, placed } = agentDemoCollected(revision, build)
  assert.equal(collected.name, 'Place')
  assert.equal(collected.phone, '+84 90 000 1111')
  // The other numbers are allowed on the site (its Contact section), never required.
  assert.deepEqual(collected.otherPhones, ['+84 90 000 2222'])
  assert.equal(collected.email, null)
  assert.deepEqual(collected.hours, ['Monday: 7:00 AM – 9:00 PM'])
  assert.equal(collected.pictures, 30)
  assert.equal(collected.reviewsWaived, 'No testimonial area anywhere in this quickstart.')
  assert.deepEqual(placed, ['wp-content/uploads/2026/10/a.jpg'])
  // 🔒 No sample exemption (plan §7, 26/10/2026): `collected-used` is told of no sample row.
  assert.equal(collected.samples, undefined)
})

test('a customer’s own site: its steps say website, never demo or pilot, and travel in the catalogue instructions', () => {
  const { revision } = fixture()
  revision.brief.business = { name: 'Smile Dental', trade: 'health' }
  const own = ownSiteInstructions(revision)
  assert.match(own, /customer's own business/)
  assert.match(own, /"name":"Smile Dental"/)
  assert.match(own, /provision\.start/)
  // `agent-demo/1` and `tracy_demo` are a workflow and a tool, not words said about the site.
  assert.doesNotMatch(agentDemoPrompt(revision, { ownSite: true }), /(?:this|a|the) demo\b|pilot/i)
  assert.match(agentDemoPrompt(revision), /Build this demo[\s\S]*this pilot always needs human review/)
  assert.match(clientSendSteps(revision, { retry: true }), /^This is an explicit Retry/)
  // A demo's steps travel there too (local stand 24/10/2026: its whole brief showed as the person's message).
  const demo = demoInstructions(revision)
  assert.match(demo, /^Build a complete demo website/)
  assert.match(demo, /"name":"Smile Dental"/)
  assert.match(
    demo,
    /Frozen research counts:[\s\S]*provision\.start[\s\S]*this pilot always needs human review/
  )
})

test('a saved plan grows: rows appended and an image given to a row without one; nothing saved moves or changes', () => {
  const row = { page: '/', section: 'hero', goal: 'Own photo', assetIds: ['a'], operation: 'replace-image' }
  const image = {
    assetId: 'a',
    crop: {
      aspect: 2,
      source: { width: 800, height: 400 },
      output: { width: 800, height: 400 },
      strategy: 'centre'
    }
  }
  const held = { version: 'agent-demo/1', researchHash: 'r', structureHash: 's', rows: [row], hash: 'h1' }
  assert.equal(amendsPlan(held, { ...held, rows: [{ ...row, image }], hash: 'h2' }), true)
  assert.equal(amendsPlan(held, { ...held, rows: [row, { ...row, section: 'footer' }], hash: 'h2' }), true)
  assert.equal(amendsPlan(held, { ...held, rows: [{ ...row, goal: 'Other' }], hash: 'h2' }), false)
  assert.equal(amendsPlan(held, { ...held, rows: [], hash: 'h2' }), false)
  assert.equal(amendsPlan(held, { ...held, structureHash: 'other', rows: [row], hash: 'h2' }), false)
  const imaged = { ...held, rows: [{ ...row, image }] }
  assert.equal(
    amendsPlan(imaged, {
      ...imaged,
      rows: [{ ...row, image: { ...image, crop: { ...image.crop, strategy: 'entropy' } } }]
    }),
    false
  )
})

// Pilot 24/10/2026: menu prices copied from the business's own pages read as invented, 31 of 102.
test("an agent build's facts check reads its frozen research as evidence, never its reviews", () => {
  const { revision } = fixture()
  const { briefText } = briefOf(revision)
  assert.match(briefText, /historic offer/)
  assert.doesNotMatch(briefText, /never disclose/)
})

test('a dish and price read off a photo travel to the agent in the menu part, with their source', () => {
  const dish = {
    name: 'Shawarma plate',
    price: '38',
    currency: 'AED',
    section: null,
    source: { url: 'https://maps.test/menu-1.jpg', kind: 'photo', region: 'm1' },
    collectedAt: '2026-10-23T00:00:00Z',
    verified: false,
    provenance: 'read from photo'
  }
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    template: { design: 'template', quickstart: 'tag', version: '1' },
    cms: 'wordpress',
    at: '2026-10-23T00:00:00Z',
    read: { profile: { name: 'Place', menuItems: [dish] }, media: [], rawSources: [], posts: [] }
  })
  assert.deepEqual(bundlePart(bundle, 'menu').items, [
    {
      name: 'Shawarma plate',
      price: '38',
      currency: 'AED',
      section: null,
      source: { kind: 'photo', url: 'https://maps.test/menu-1.jpg' },
      verified: false
    }
  ])
})

// 🔒 No sample content (plan §7, 26/10/2026): a field with no source is empty or holds an approved neutral word.
test('a row with no source is neutral: sample content is refused, and the prompt names the neutral words and no filler as a stand-in', () => {
  const { revision, bundle, plan } = fixture()
  const prompt = agentDemoPrompt(revision)
  assert.match(
    prompt,
    /Where the research has a value for a field, use it\. Where it has none, never write sample or made-up content/
  )
  assert.match(
    prompt,
    /write one approved neutral word in the site's language \("Menu item", "Service", "Product"/
  )
  assert.match(prompt, /never "Coming soon", "Chef's selection"/)
  assert.match(prompt, /on a plan row with neutral:true/)
  assert.match(prompt, /a post keeps the date the site was built/)
  assert.match(prompt, /a button naming a page of this site \(menu, offers, gallery, about\) keeps that page/)
  assert.doesNotMatch(prompt, /sample:true|sample content as a suggestion|sample dishes/)
  assert.ok(prompt.includes('Preserve review text and attribution; ratings stay separated by platform.'))
  assert.doesNotMatch(prompt, /verified business facts|invent people|menu items, prices, claims/)
  const neutral = {
    ...plan.rows[0],
    goal: 'The price of a dish the research has no price for',
    sourceIds: [],
    assetIds: [],
    operation: 'rewrite',
    neutral: true
  }
  // The plan keeps its photo row: a saved plan places the place's own photos (`coverage.photos`).
  const saved = validateAgentPlan({ ...plan, rows: [...plan.rows, neutral] }, bundle)
  assert.equal(saved.rows.at(-1).neutral, true)
  for (const patch of [
    { neutral: false },
    { neutral: 'yes' },
    { neutral: undefined },
    { neutral: undefined, sample: true },
    { sample: true }
  ])
    assert.throws(
      () => validateAgentPlan({ ...plan, rows: [...plan.rows, { ...neutral, ...patch }] }, bundle),
      /PLAN_INVALID/,
      JSON.stringify(patch)
    )
  const guide = agentPlanGuide(bundle).schema.rows
  assert.equal(guide.sample, undefined)
  assert.match(guide.neutral, /left empty, or holds one approved neutral word/)
  assert.match(guide.sourceIds, /unless neutral:true/)
})

test('a place with no collected reviews keeps its testimonials empty or neutral; collected reviews are untouched and a collected rating is never replaced', () => {
  const { revision, bundle, plan } = fixture()
  const prompt = agentDemoPrompt(revision)
  assert.match(
    prompt,
    /In a testimonial or quote area, collected reviews keep their exact text and author, never shortened, merged or re-attributed/
  )
  assert.match(prompt, /a blog post is never a review/)
  assert.match(prompt, /a collected rating is never replaced or made up/)
  assert.doesNotMatch(prompt, /with no person's name or rating|come only from the research/)
  const emptyTestimonial = {
    ...plan.rows[0],
    section: 'testimonials',
    goal: 'The testimonial area, its quotes left empty',
    sourceIds: [],
    assetIds: [],
    operation: 'rewrite',
    neutral: true
  }
  assert.equal(
    validateAgentPlan({ ...plan, rows: [...plan.rows, emptyTestimonial] }, bundle).rows.at(-1).neutral,
    true
  )
  const reviewed = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    template: bundle.template,
    cms: 'wordpress',
    at: '2026-10-23T00:00:00Z',
    read: {
      profile: {
        name: 'Place',
        googlePlace: { rating: 4.6, reviews: [{ text: 'Lovely tea', author: 'Lan' }] }
      },
      media: bundle.media,
      // The photo row of `plan` cites source-1.
      rawSources: [{ id: 'source-1', source: 'facebook', collected: {} }],
      posts: []
    }
  })
  const withReviews = { ...plan, researchHash: reviewed.hash }
  const quoted = { ...emptyTestimonial, neutral: undefined, sourceIds: ['part:reviews'] }
  assert.ok(validateAgentPlan({ ...withReviews, rows: [...plan.rows, quoted] }, reviewed).hash)
  for (const sourceIds of [['part:reviews'], ['part:ratings']])
    assert.throws(
      () =>
        validateAgentPlan(
          { ...withReviews, rows: [...plan.rows, quoted, { ...emptyTestimonial, sourceIds }] },
          reviewed
        ),
      /PLAN_INVALID/
    )
})

const menuDish = (name, price, extra = {}) => ({
  name,
  price,
  currency: 'AED',
  section: 'Mains',
  source: { url: 'https://place.test/menu', kind: 'page' },
  collectedAt: '2026-10-23T00:00:00Z',
  verified: true,
  ...extra
})
const freezeWithMenu = (menuItems, profile = {}, opportunity = null) =>
  freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    template: { design: 'template', quickstart: 'tag', version: '1' },
    cms: 'wordpress',
    at: '2026-10-23T00:00:00Z',
    read: {
      profile: { name: 'Place', ...profile, menuItems },
      media: [],
      rawSources: [],
      posts: [],
      ...(opportunity ? { opportunity } : {})
    }
  })

test('the menu is its own paged part with a summary first; the profile no longer carries the dishes', () => {
  const dishes = Array.from({ length: 30 }, (_, i) => menuDish(`Dish ${i}`, String(10 + i)))
  const bundle = freezeWithMenu(dishes)
  assert.equal(bundle.profile.menuItems, undefined)
  assert.equal(bundle.counts.menu, 30)
  assert.ok(bundlePart(bundle).parts.includes('menu'))
  const first = bundlePart(bundle, 'menu')
  assert.match(first.summary, /^30 dishes in 1 section: Mains\. Prices: AED 10–39 \(30 dishes\)\./)
  assert.deepEqual([first.total, first.items.length, first.nextOffset], [30, 20, 20])
  assert.deepEqual(first.items[0], {
    name: 'Dish 0',
    price: '10',
    currency: 'AED',
    section: 'Mains',
    source: { kind: 'page', url: 'https://place.test/menu' },
    verified: true
  })
  assert.equal(bundlePart(bundle, 'menu', 20).items.length, 10)
  assert.ok(agentPlanSources(bundle).some((ref) => ref.id === 'part:menu'))
})

test('a dish read off a photo or a search result keeps its source in the menu part, ranked under the website', () => {
  const bundle = freezeWithMenu(
    [
      menuDish('Hummus', '28', {
        source: { url: 'https://maps.test/m.jpg', kind: 'photo' },
        verified: false,
        provenance: 'read from photo'
      }),
      menuDish('Hummus', '32'),
      menuDish('Kofta', '41', {
        source: { url: 'https://other.test/menu', kind: 'page' },
        verified: false,
        currencyAssumed: true
      })
    ],
    { menus: [{ url: 'https://other.test/menu', source: 'search' }] }
  )
  assert.deepEqual(
    bundlePart(bundle, 'menu').items.map((i) => [
      i.name,
      i.price,
      i.verified,
      i.source.kind,
      i.found ?? null
    ]),
    [
      ['Hummus', '32', true, 'page', null],
      ['Kofta', '41', false, 'page', 'search']
    ]
  )
  assert.equal(bundlePart(bundle, 'menu').items[1].currencyAssumed, true)
})

// Tin Lantern Saigon (stand, 24/10/2026): "110" printed for 110,000 VND must reach the agent with its scale.
test('a price printed in thousands reaches the agent with its scale, and the prompt says how to write it', () => {
  const bundle = freezeWithMenu([
    menuDish('Mojito', '110', {
      currency: 'VND',
      priceScale: 1000,
      source: { url: 'https://maps.test/m.jpg', kind: 'photo' },
      verified: false
    })
  ])
  const menu = bundlePart(bundle, 'menu')
  assert.deepEqual([menu.items[0].price, menu.items[0].priceScale], ['110', 1000])
  assert.match(menu.summary, /printed in thousands \(110 means 110,000\)/)
  const { revision } = fixture()
  assert.match(agentDemoPrompt(revision), /priceScale 1000 is 110,000/)
  assert.doesNotMatch(agentDemoPrompt(revision), /VND|dong/, 'no currency is special')
})

test('the research hash changes when a dish changes; a place with no menu has an empty part that says so', () => {
  assert.notEqual(
    freezeWithMenu([menuDish('Hummus', '32')]).hash,
    freezeWithMenu([menuDish('Hummus', '33')]).hash
  )
  const restaurant = { candidate: { trade: 'food' } }
  const none = bundlePart(freezeWithMenu(undefined, {}, restaurant), 'menu')
  assert.deepEqual([none.total, none.items], [0, []])
  assert.match(none.summary, /^No menu link or menu photo was found/)
  assert.match(none.summary, /never presented as read/)
  const off = bundlePart(freezeWithMenu(undefined, { menuPhotoStatus: 'switched_off' }, restaurant), 'menu')
  assert.match(off.summary, /photo reading is off on this site/)
  // A business that is not food or drink hears no word of menus or dishes, only that no price was collected.
  for (const opportunity of [{ candidate: { trade: 'fitness' } }, { candidate: { trade: 'beauty' } }, null]) {
    const other = bundlePart(freezeWithMenu(undefined, {}, opportunity), 'menu')
    assert.match(other.summary, /^No prices were collected/)
    assert.doesNotMatch(other.summary, /menu|dish/i)
  }
})

test('a bundle frozen before the menu part still answers it from its profile, without changing its hash', () => {
  const { bundle } = fixture()
  const { hash, ...data } = bundle
  const old = { ...data, profile: { ...data.profile, menuItems: [menuDish('Hummus', '32')] } }
  delete old.menu
  const frozen = { ...old, hash: researchHash(old) }
  assert.deepEqual(
    bundlePart(frozen, 'menu').items.map((i) => i.name),
    ['Hummus']
  )
  assert.ok(hash)
})

test('the plan guide and the prompt name the menu part once each', () => {
  const { revision, bundle } = fixture()
  assert.ok(agentPlanGuide(bundle).rules.some((rule) => /part menu/.test(rule)))
  assert.match(agentDemoPrompt(revision), /Read the menu part first/)
})

test('a template post is written from research: a claim no quote holds is refused, an unwritten blog is a gap', () => {
  const { bundle, plan } = fixture()
  const structure = structuredClone(plan.structure)
  structure.inventory.records.push({
    key: 'post/7',
    identity: { kind: 'post', id: 7 },
    data: { post_type: 'post', post_title: 'Template post', post_content: '<p>Template words</p>' }
  })
  const base = { ...plan, structure, structureHash: researchHash(structure) }
  const row = {
    page: '/template-post/',
    section: 'post',
    goal: "The business's own post",
    sourceIds: ['part:posts'],
    assetIds: [],
    target: { kind: 'native', type: 'post', id: 7, path: 'post_content' },
    operation: 'rewrite',
    verify: 'Read the post back',
    post: {
      topic: 'own-post',
      title: 'From our page',
      body: '<p>We wrote: historic offer</p>',
      excerpt: 'We wrote: historic offer',
      claims: [
        {
          text: 'We wrote: historic offer',
          sourceRefs: [{ sourceId: 'part:posts', quote: 'historic offer' }]
        }
      ]
    }
  }
  const issuesOf = (rows) => {
    try {
      validateAgentPlan({ ...base, rows }, bundle)
      return []
    } catch (error) {
      return (error.detail?.issues ?? [error.code ?? error.message]).map((i) => i.path ?? i)
    }
  }
  assert.deepEqual(issuesOf([plan.rows[0]]), ['coverage.posts'])
  assert.deepEqual(issuesOf([plan.rows[0], row]), [])
  const invented = structuredClone(row)
  invented.post.claims[0].sourceRefs[0].quote = 'new offer'
  assert.deepEqual(issuesOf([plan.rows[0], invented]), [
    'rows[1].post.claims[0].sourceRefs[0]',
    'rows[1].post.body'
  ])
  const {
    own: _own,
    writtenPosts: _writtenPosts,
    ...counted
  } = postCoverage({ ...base, rows: [plan.rows[0], row] }, bundle)
  assert.deepEqual(counted, {
    researchTopics: 1,
    templatePosts: 1,
    written: 1,
    topics: 1,
    thin: null
  }) // A composed post row on the title alone writes the title: the gap names that row and the body field it needs
  // (The Willow Nook, build 8: all 22 post rows targeted post_title, "0 are written", and the agent stopped).
  const titled = { ...structuredClone(row), target: { ...row.target, path: 'post_title' } }
  const gap = (() => {
    try {
      validateAgentPlan({ ...base, rows: [plan.rows[0], titled] }, bundle)
    } catch (error) {
      return error.detail?.issues?.find((i) => i.path === 'coverage.posts')
    }
  })()
  assert.ok(gap, 'a title-only post row is not a written post')
  assert.match(gap.message, /rows\[1\] carry a post but write only post_title/)
  assert.match(gap.message, /a rewrite row on the post's body field \(post_content\)/)
})

test('Joomla: an article is a template post unless a menu item opens it as its own page; it carries the fields written', () => {
  const article = (id) => ({ identity: { kind: 'article', id }, data: { title: `Article ${id}` } })
  const records = [
    article(3),
    article(7),
    article(12),
    {
      identity: { kind: 'menuItem', id: 101 },
      data: { link: 'index.php?option=com_content&view=article&id=3' }
    },
    {
      identity: { kind: 'menuItem', id: 102 },
      data: { link: 'index.php?option=com_content&view=category&id=9' }
    }
  ]
  const plan = {
    structure: { inventory: { records } },
    rows: [
      {
        operation: 'rewrite',
        target: { kind: 'native', type: 'article', id: '7', path: 'introtext' },
        post: { topic: 'story' }
      }
    ]
  }
  assert.deepEqual(
    templatePostsLeft(plan).map((r) => [r.identity.id, r.written]),
    [
      [7, ['introtext']],
      [12, []]
    ]
  )
  const coverage = postCoverage(plan, { posts: [], media: [], profile: {}, sources: [], menu: [] })
  assert.equal(coverage.templatePosts, 2)
  assert.equal(coverage.written, 1)
})

test('a post is written field by field: a title-only row leaves the body to the sweep and is not a written post', () => {
  const records = [
    { identity: { kind: 'post', id: 41 }, data: { post_type: 'post', post_title: 'Efforts to curb soda' } },
    { identity: { kind: 'post', id: 42 }, data: { post_type: 'post', post_title: 'Drink beer' } }
  ]
  const row = (id, path, extra = {}) => ({
    operation: 'rewrite',
    target: { kind: 'native', type: 'post', id, path },
    ...extra
  })
  const plan = {
    structure: { inventory: { records } },
    rows: [
      row(41, 'post_title', { post: { topic: 'story' } }),
      row(42, 'post_title'),
      row(42, 'post_content'),
      { operation: 'retain', target: { kind: 'native', type: 'post', id: 42, path: 'post_excerpt' } },
      // A picture row writes the picture: the featured one when it targets that, never the body it sits in.
      { operation: 'replace-image', target: { kind: 'native', type: 'post', id: 41, path: 'post_content' } },
      {
        operation: 'replace-image',
        target: { kind: 'native', type: 'postmeta', id: 41, key: '_thumbnail_id', path: 'value' }
      }
    ]
  }
  assert.deepEqual(
    templatePostsLeft(plan).map((r) => [r.identity.id, r.written]),
    [
      [41, ['post_title', 'featured_image_id']],
      [42, ['post_title', 'post_content']]
    ]
  )
  const coverage = postCoverage(plan, { posts: [], media: [], profile: {}, sources: [], menu: [] })
  assert.equal(coverage.templatePosts, 2)
  assert.equal(coverage.written, 1)
})

test("every template post's title reaches the QA, written or not, from each CMS's own field", () => {
  const records = [
    { identity: { kind: 'post', id: 41 }, data: { post_type: 'post', post_title: 'Efforts to curb soda' } },
    { identity: { kind: 'post', id: 2 }, data: { post_type: 'page', post_title: 'About us' } },
    { identity: { kind: 'article', id: 7 }, data: { title: 'Article 7' } },
    {
      identity: { collection: 'posts', id: 'p1' },
      titleField: 'headline',
      data: { headline: 'Spring menu' }
    },
    { identity: { collection: 'posts', id: 'p2' }, data: { title: '  ' } }
  ]
  const plan = {
    structure: { inventory: { records } },
    rows: [{ target: { kind: 'native', type: 'post', id: '41' }, post: { topic: 'story' } }]
  }
  assert.deepEqual(templatePostTitles(plan), ['Efforts to curb soda', 'Article 7', 'Spring menu'])
})

test('structure.read pages are large by default and bounded by size, never by a fixed 20', () => {
  // ja-fresco (24/10/2026): ~40 agent steps went on paging the native structure 20 records at a time.
  const small = Array.from({ length: 180 }, (_, i) => ({ key: `article/${i}`, data: { title: `T${i}` } }))
  const first = structurePage(small)
  assert.equal(first.items.length, 180)
  assert.equal(first.nextOffset, null)
  const big = Array.from({ length: 40 }, (_, i) => ({
    key: `post/${i}`,
    data: { post_content: 'x'.repeat(10_000) }
  }))
  const page = structurePage(big)
  assert.ok(page.items.length >= 1 && page.items.length < 40, String(page.items.length))
  assert.ok(JSON.stringify(page.items).length <= 64_000 + 10_100)
  assert.equal(page.nextOffset, page.items.length)
  const rest = structurePage(big, page.nextOffset)
  assert.equal(rest.items[0].key, `post/${page.items.length}`)
  // One record larger than the bound still comes alone, so paging always moves.
  const huge = structurePage([{ key: 'p/0', data: 'y'.repeat(200_000) }, { key: 'p/1' }])
  assert.deepEqual([huge.items.length, huge.nextOffset], [1, 1])
  assert.equal(structurePage(small, 0, 5).items.length, 5)
  assert.throws(() => structurePage(small, 0, 201), /BAD_PAGE/)
  assert.throws(() => structurePage(small, -1), /BAD_PAGE/)
})

test('the brand part names every WordPress logo option the template reads, its dark one included', () => {
  // ja-fresco WordPress (24/10/2026): the build set site_logo to 0, the theme's dark spot kept tracy_logo_dark and
  // the header showed the template's logo.png.
  const { bundle } = fixture()
  const fresco = bundlePart(
    { ...bundle, cms: 'wordpress', template: { quickstart: 'quickstart/ja-fresco/wp7', version: '1.0.1' } },
    'brand'
  )
  assert.deepEqual(fresco.logoOptions.keys, ['site_logo', 'tracy_logo_dark'])
  assert.match(fresco.logoOptions.instructions, /tracy_logo_dark/)
  assert.match(fresco.logoOptions.instructions, /site name/)
  const other = bundlePart(
    { ...bundle, cms: 'wordpress', template: { quickstart: 'quickstart/unknown/wp7', version: '1.0.0' } },
    'brand'
  )
  assert.deepEqual(other.logoOptions.keys, ['site_logo'])
  assert.equal(bundlePart({ ...bundle, cms: 'emdash', template: {} }, 'brand').logoOptions, undefined)
})

test('a source photo over 8 MB imports through its crop, which re-encodes it within the limit', async () => {
  // Tin Lantern (24/10/2026): its 16:9 hero photo was a 22.5 MB, 5312×3984 PNG; the import refused it as
  // AGENT_DEMO_MEDIA_UNAVAILABLE and the hero kept the template's picture.
  const width = 1800,
    height = 1700
  const noise = Buffer.alloc(width * height * 3)
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24
  const original = await sharp(noise, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
  assert.ok(original.length > 8 * 1024 * 1024, String(original.length))
  const { pool, plan } = fixture('wordpress', original)
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const upload = async ({ params }) => {
    assert.ok(Buffer.from(params.content_b64, 'base64').length <= 8 * 1024 * 1024)
    return { status: 200, body: { ok: true } }
  }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(original) } })
  await service.call(auth, { operation: 'plan.save', plan })
  // Raw, it is still too large to place as it is.
  await assert.rejects(
    service.call(auth, { operation: 'media.import', assetId: 'asset-29', rowIndex: 0 }, { upload }),
    /MEDIA_UNAVAILABLE/
  )
  plan.rows[0].image = {
    assetId: 'asset-29',
    crop: {
      aspect: '16/9',
      source: { width, height },
      output: { width: 1440, height: 810 },
      strategy: 'centre'
    }
  }
  await service.call(auth, { operation: 'plan.save', plan })
  const result = await service.call(
    auth,
    { operation: 'media.import', assetId: 'asset-29', rowIndex: 0 },
    { upload }
  )
  assert.equal(result.derivative.parentAssetId, 'asset-29')
})

// Local stand 24/10/2026: a restaurant's logo filled its hero, story, dish cards and gallery.
test("a logo is the brand's or a file called logo; a photo is not", () => {
  const bundle = { brand: { logo: 'a1' } }
  assert.equal(isLogo(bundle, { id: 'a1', sourceUrl: 'https://x.test/p/1.jpg' }), true)
  assert.equal(
    isLogo(bundle, { id: 'a2', sourceUrl: 'https://images.getbento.com/dyX6A9z2_logo.png?w=600' }),
    true
  )
  assert.equal(isLogo(bundle, { id: 'a3', sourceUrl: 'https://x.test/media/dining-room.jpg' }), false)
  assert.equal(isLogo(bundle, { id: 'a4', sourceUrl: 'https://x.test/media/catalogue-cover.jpg' }), false)
})

test("every page lead the handover's ledger names is written by a row carrying it, or the plan goes back", () => {
  const { bundle, plan } = fixture()
  const was = 'Responsive WordPress theme for restaurant'
  const unit = { page: '/our-blog/', kind: 'text', text: was, lead: true, selector: 'div.d > p.l' }
  // Once per page and words; a passage that is no lead is not listed.
  const leads = editorialLeads({
    ledger: { units: [unit, unit, { page: '/', kind: 'text', text: 'A passage of the template here' }] }
  })
  assert.deepEqual(leads, [{ page: '/our-blog/', at: 'div.d > p.l', text: was }])
  const codes = (p, given = leads) => {
    try {
      validateAgentPlan(p, bundle, { leads: given })
      return []
    } catch (error) {
      return error.detail.issues.map((i) => i.path)
    }
  }
  assert.deepEqual(codes(plan, []), [], 'a handover read before leads were named asks for none')
  assert.deepEqual(codes(plan), ['coverage.leads'])
  // The blog page's record, whose banner field holds the template's line.
  const structure = structuredClone(plan.structure)
  structure.inventory.records.push({
    key: 'pages/our-blog',
    identity: { collection: 'pages', id: 'our-blog', slug: 'our-blog', locale: 'en' },
    routes: [{ pattern: '/our-blog' }],
    data: { title: 'Our Blog', hero: { lead: `<p>${was}</p>`, image: 'banner.jpg' } }
  })
  // Another page whose banner carries the same template line, and a record no route ties to a page.
  structure.inventory.records.push(
    {
      key: 'pages/contact',
      identity: { collection: 'pages', id: 'contact', slug: 'contact', locale: 'en' },
      routes: [{ pattern: '/contact' }],
      data: { title: 'Contact', hero: { lead: `<p>${was}</p>` } }
    },
    {
      key: 'pages/unrouted',
      identity: { collection: 'pages', id: 'unrouted', slug: 'unrouted', locale: 'en' },
      data: { title: 'Unrouted', hero: { lead: was } }
    }
  )
  plan.structure = structure
  plan.structureHash = researchHash(structure)
  const target = { kind: 'emdash', collection: 'pages', id: 'our-blog', path: 'hero.lead' }
  const row = {
    ...plan.rows[0],
    page: '/our-blog/',
    operation: 'rewrite',
    sourceIds: ['part:profile'],
    target,
    lead: { page: '/our-blog', was, text: 'News, dishes and evenings from our kitchen' }
  }
  const n = plan.rows.length
  assert.deepEqual(codes({ ...plan, rows: [...plan.rows, row] }), [])
  // 🔒 A row covers a lead only when its target holds the line (review 24/10/2026): one aimed at the hero's
  // picture slot, at the banner's picture, or at the page's title writes no lead, whatever it claims.
  for (const elsewhere of [
    { kind: 'contract', slot: 'hero.image' },
    { ...target, path: 'hero.image' },
    { ...target, path: 'title' }
  ])
    assert.deepEqual(codes({ ...plan, rows: [...plan.rows, { ...row, target: elsewhere }] }), [
      `rows[${n}].lead`,
      'coverage.leads'
    ])
  assert.equal(leadCoverage({ ...plan, rows: [...plan.rows, row] }, leads).written.length, 1)
  // 🔒 The same words on another page write nothing here (review 24/10/2026): `/contact/`'s banner holds the
  // template's line too, yet a row aimed at it leaves `/our-blog/`'s as it was.
  const contactRow = { ...row, target: { ...target, id: 'contact' } }
  assert.deepEqual(codes({ ...plan, rows: [...plan.rows, contactRow] }), [
    `rows[${n}].lead`,
    'coverage.leads'
  ])
  assert.equal(leadCoverage({ ...plan, rows: [...plan.rows, contactRow] }, leads).written.length, 0)
  // A record no route ties to a page cannot say it is the blog's: not counted, not sent back.
  const unrouted = { ...row, target: { ...target, id: 'unrouted' } }
  assert.deepEqual(codes({ ...plan, rows: [...plan.rows, unrouted] }), [])
  assert.equal(leadCoverage({ ...plan, rows: [...plan.rows, unrouted] }, leads).written.length, 0)
  // 🔒 A LEAD BORROWED FROM ANOTHER RECORD (local stand 25/10/2026, JA Diner WP): a single post prints the
  // `/our-blog/` page's masthead (`jrMasthead`), so its lead is stored in no record of its own. A row aimed at a
  // record holding the line is not sent back: not counted as written either, the sweep reads the page after the turn.
  const borrowed = { page: '/a-post/', kind: 'text', text: was, lead: true, selector: 'div.d > p.l' }
  const postLeads = editorialLeads({ ledger: { units: [unit, borrowed] } })
  const withPost = structuredClone(plan.structure)
  withPost.inventory.records.push({
    key: 'pages/a-post',
    identity: { collection: 'pages', id: 'a-post', slug: 'a-post', locale: 'en' },
    routes: [{ pattern: '/a-post' }],
    data: { title: 'A post', content: '<p>Our story.</p>' }
  })
  const postPlan = { ...plan, structure: withPost, structureHash: researchHash(withPost) }
  const postRow = { ...row, page: '/a-post/', lead: { ...row.lead, page: '/a-post/' } }
  assert.deepEqual(codes({ ...postPlan, rows: [...postPlan.rows, row, postRow] }, postLeads), [])
  const borrowedCoverage = leadCoverage({ ...postPlan, rows: [...postPlan.rows, row, postRow] }, postLeads)
  assert.equal(borrowedCoverage.written.length, 1)
  assert.equal(borrowedCoverage.deferred.length, 1)
  // The page's own record holds the line: a row aimed elsewhere is still sent back.
  const ownPost = structuredClone(withPost)
  ownPost.inventory.records.at(-1).data.lead = was
  const ownPlan = { ...plan, structure: ownPost, structureHash: researchHash(ownPost) }
  assert.deepEqual(codes({ ...ownPlan, rows: [...ownPlan.rows, row, postRow] }, postLeads), [
    `rows[${n + 1}].lead`,
    'coverage.leads'
  ])
  // 🔒 A contract slot counts by the value its inspect read (review 24/10/2026): `footer.caption` holds other words
  // and is sent back; the banner's slot holding the line covers it; a slot the read gave no value is never counted
  // as written, yet sends nothing back: the sweep reads the page after the turn and writes the line it still finds.
  const slotted = structuredClone(plan.structure)
  slotted.contract.slots.push(
    {
      key: 'footer.caption',
      type: 'text',
      current: 'Made with love in the city',
      sample: 'Made with love in the city'
    },
    { key: 'banner.lead', type: 'text', current: was, sample: was, routes: ['/our-blog/'] },
    { key: 'contact.lead', type: 'text', current: was, sample: was, routes: ['/contact/'] },
    { key: 'banner.unrouted', type: 'text', current: was, sample: was },
    { key: 'banner.note', type: 'text' },
    { key: 'banner.link', type: 'url', current: was }
  )
  const slotPlan = { ...plan, structure: slotted, structureHash: researchHash(slotted) }
  const toSlot = (slot) => ({ ...row, target: { kind: 'contract', slot } })
  for (const slot of ['footer.caption', 'banner.link', 'contact.lead'])
    assert.deepEqual(
      codes({ ...slotPlan, rows: [...slotPlan.rows, toSlot(slot)] }),
      [`rows[${n}].lead`, 'coverage.leads'],
      slot
    )
  assert.deepEqual(codes({ ...slotPlan, rows: [...slotPlan.rows, toSlot('banner.lead')] }), [])
  for (const slot of ['banner.note', 'banner.unrouted']) {
    assert.deepEqual(codes({ ...slotPlan, rows: [...slotPlan.rows, toSlot(slot)] }), [], slot)
    assert.equal(
      leadCoverage({ ...slotPlan, rows: [...slotPlan.rows, toSlot(slot)] }, leads).written.length,
      0,
      slot
    )
  }
  assert.equal(
    leadCoverage({ ...slotPlan, rows: [...slotPlan.rows, toSlot('banner.lead')] }, leads).written.length,
    1
  )
  // 🔒 The WordPress inspect answers each slot's words as a string, its pictures apart in `imageSlots`, and no page
  // for any slot: a slot holding other words, or a picture, is sent back; one holding the line is not counted as
  // written, since nothing says it is the blog's, and is left to the sweep.
  const wordpress = structuredClone(plan.structure)
  wordpress.contract = {
    bound: true,
    slots: {
      'hero.image': 'photo.jpg',
      'footer.caption': 'Made with love in the city',
      'banner.lead': `<p>${was}</p>`,
      'banner.bg': was
    },
    imageSlots: { 'hero.image': 'photo.jpg', 'banner.bg': was }
  }
  const wpPlan = { ...plan, structure: wordpress, structureHash: researchHash(wordpress) }
  for (const slot of ['footer.caption', 'banner.bg'])
    assert.deepEqual(
      codes({ ...wpPlan, rows: [...wpPlan.rows, toSlot(slot)] }),
      [`rows[${n}].lead`, 'coverage.leads'],
      slot
    )
  assert.deepEqual(codes({ ...wpPlan, rows: [...wpPlan.rows, toSlot('banner.lead')] }), [])
  assert.deepEqual(leadCoverage({ ...wpPlan, rows: [...wpPlan.rows, toSlot('banner.lead')] }, leads), {
    written: [],
    deferred: leads,
    missing: []
  })
  // A route that is no path (a page's name, `home`) says nothing of the page: not sent back, not counted.
  const named = structuredClone(plan.structure)
  named.contract.slots.push({ key: 'banner.lead', type: 'text', current: was, page: 'blog' })
  const namedPlan = { ...plan, structure: named, structureHash: researchHash(named) }
  assert.deepEqual(codes({ ...namedPlan, rows: [...namedPlan.rows, toSlot('banner.lead')] }), [])
  assert.equal(
    leadCoverage({ ...namedPlan, rows: [...namedPlan.rows, toSlot('banner.lead')] }, leads).written.length,
    0
  )
  // An inventory read short of every record cannot say which field holds the line: not counted, not sent back.
  const partial = structuredClone(plan.structure)
  partial.inventory.complete = false
  const partialPlan = { ...plan, structure: partial, structureHash: researchHash(partial) }
  assert.deepEqual(
    codes({ ...partialPlan, rows: [...partialPlan.rows, { ...row, target: { ...target, path: 'title' } }] }),
    []
  )
  assert.equal(leadCoverage({ ...partialPlan, rows: [...partialPlan.rows, row] }, leads).written.length, 0)
  // The placeholder, the template's own line, or a retain row: sent back with the reason.
  assert.deepEqual(
    codes({ ...plan, rows: [...plan.rows, { ...row, lead: { ...row.lead, text: 'Coming soon' } }] }),
    [`rows[${n}].lead.text`]
  )
  assert.deepEqual(codes({ ...plan, rows: [...plan.rows, { ...row, lead: { ...row.lead, text: was } }] }), [
    `rows[${n}].lead.text`
  ])
  assert.deepEqual(codes({ ...plan, rows: [...plan.rows, { ...row, operation: 'retain', sourceIds: [] }] }), [
    `rows[${n}].lead`,
    'coverage.leads'
  ])
  // A row for another page's line does not cover this one, and its target, the blog's banner, is not on that page.
  assert.deepEqual(codes({ ...plan, rows: [...plan.rows, { ...row, lead: { ...row.lead, page: '/' } }] }), [
    `rows[${n}].lead`,
    'coverage.leads'
  ])
})

// The Willow Nook local, build 8c (25/10/2026): posts 41–48 were rewritten with bodies of their own shape, and
// native-structure failed on each. A planned body keeps the template's blocks and changes only their words. Since
// local round 21 the inventory reads a blog post's body as its words, so the frame is held on a page's body.
test('bodyFrameKept: a body with the template page’s blocks and new words keeps the frame; a dropped or new block does not', async () => {
  const { bodyFrameKept } = await import('../src/opportunities-build/agent-demo.js')
  const template =
    '<!-- wp:heading -->\n<h2 class="wp-block-heading">Old</h2>\n<!-- /wp:heading -->\n\n<!-- wp:paragraph -->\n<p>Lorem ipsum.</p>\n<!-- /wp:paragraph -->'
  const record = {
    key: 'post/41',
    identity: { kind: 'post', id: 41 },
    editorialFields: ['post_title', 'post_content'],
    data: { post_type: 'page', post_title: 'T', post_content: template }
  }
  assert.equal(
    bodyFrameKept(
      record,
      'post_content',
      template.replace('Old', 'New').replace('Lorem ipsum.', 'Our words.'),
      inventoryInvariant
    ),
    true
  )
  assert.equal(
    bodyFrameKept(
      record,
      'post_content',
      '<!-- wp:paragraph -->\n<p>Our words.</p>\n<!-- /wp:paragraph -->',
      inventoryInvariant
    ),
    false
  )
  // Words alone are the words to put in the blocks: nothing to judge.
  assert.equal(bodyFrameKept(record, 'post_content', 'Our words.\n\nMore words.', inventoryInvariant), true)
  // A blog post's body is its words: rewritten in fewer blocks it is the same post.
  const post = { ...record, data: { ...record.data, post_type: 'post' } }
  assert.equal(
    bodyFrameKept(
      post,
      'post_content',
      '<!-- wp:paragraph -->\n<p>Our words.</p>\n<!-- /wp:paragraph -->',
      inventoryInvariant
    ),
    true
  )
})

test("wordpressLogoOptions: the agent keeps the template's site-logo block and its size", () => {
  // The Willow Nook build 8c (25/10/2026): the agent swapped the header's site-logo block for an image block, then
  // set site_logo to 0, and css-intact failed when the block's stylesheet went with it.
  const { instructions } = wordpressLogoOptions({ quickstart: 'quickstart/ja-diner/wp7' })
  assert.match(instructions, /keep the template's site-logo block/i)
  assert.match(instructions, /width/)
  assert.match(instructions, /never replace it with an image block/i)
})

test('inventoryRoutes: every concrete route of the frozen inventory, once, for the QA to read', () => {
  // The Willow Nook build 8c (25/10/2026): QA read eight pages of 57 routes; the template words on the rest stayed.
  const inventory = {
    records: [
      { identity: { kind: 'post', id: 1 }, routes: ['/'] },
      { identity: { kind: 'post', id: 2 }, routes: ['/lorem-ipsum/'] },
      { identity: { kind: 'post', id: 3 }, routes: [{ pattern: '/about-us/', locale: 'en' }] },
      { identity: { kind: 'post', id: 4 }, routes: ['/lorem-ipsum/', '/blog/[slug]', '$showcase', 'about'] },
      { identity: { kind: 'option', key: 'x' } }
    ]
  }
  assert.deepEqual(inventoryRoutes(inventory), ['/', '/lorem-ipsum/', '/about-us/'])
  assert.deepEqual(inventoryRoutes(null), [])
})

test('postFactsOf: each described dish and each sentence of the profile description, never a review', async () => {
  const { postFactsOf } = await import('../src/opportunities-build/agent-demo.js')
  const facts = postFactsOf({
    menu: {
      items: [
        { name: 'Brunch plate', description: 'Eggs, bacon and sourdough' },
        { name: 'Latte', description: '' }
      ]
    },
    profile: { description: 'A cafe in the Latin Quarter since 2004. Cocktails every evening from six.' },
    reviews: [{ text: 'Best brunch in town!' }]
  })
  assert.deepEqual(facts, [
    'Brunch plate: Eggs, bacon and sourdough',
    'A cafe in the Latin Quarter since 2004.',
    'Cocktails every evening from six.'
  ])
})

/**
 * A plan of `count` template posts over research of one story (`sentences`) and the dishes given, with the posts the
 * agent wrote (`written`: `{id, topic, title, body, quote}`), and the live inventory after its turn.
 */
function blogOf({ count, sentences, dishes = [], written, name = 'Place' }) {
  const { plan, revision } = fixture()
  const media = revision.asset_manifest
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-22T00:00:00Z',
    read: {
      profile: { name, description: sentences.join(' '), menuItems: dishes },
      media,
      rawSources: [{ id: 'source-1', source: 'facebook', collected: { page: 'Place' } }],
      posts: []
    }
  })
  const structure = structuredClone(plan.structure)
  const records = Array.from({ length: count }, (_, i) => ({
    key: `post/${70 + i}`,
    identity: { kind: 'post', id: 70 + i },
    routes: [`/template-post-${i}/`],
    data: {
      post_type: 'post',
      post_title: `Template post ${i}`,
      post_excerpt: `Lorem ipsum ${i}.`,
      post_content: `<!-- wp:paragraph --><p>Lorem ipsum dolor ${i}.</p><!-- /wp:paragraph -->`,
      post_date: '2021-09-10 01:38:00'
    }
  }))
  structure.inventory.records.push(...records)
  const rows = written.map((w) => ({
    page: `/template-post-${w.id - 70}/`,
    section: 'post',
    goal: "The business's own post",
    sourceIds: [w.source ?? 'part:profile'],
    assetIds: [],
    target: { kind: 'native', type: 'post', id: w.id, path: 'post_content' },
    operation: 'rewrite',
    verify: 'Read the post back',
    post: {
      topic: w.topic,
      title: w.title,
      body: `<p>${w.body}</p>`,
      excerpt: w.body,
      claims: [
        { text: w.body, sourceRefs: [{ sourceId: w.source ?? 'part:profile', quote: w.quote ?? w.body }] }
      ]
    }
  }))
  const full = {
    ...plan,
    researchHash: bundle.hash,
    structure,
    structureHash: researchHash(structure),
    rows: [plan.rows[0], ...rows]
  }
  const live = records.map((r) => {
    const w = written.find((x) => x.id === r.identity.id)
    return w ? { ...r, data: { ...r.data, post_title: w.title, post_content: `<p>${w.body}</p>` } } : r
  })
  return { plan: full, bundle, live }
}

test('a plan the sweep completes is not refused: the agent writes the research topics, the sweep the split ones', () => {
  // Review 26/10/2026: 3 template posts, one story of three facts split into three topics, the agent wrote the first;
  // coverage.posts asked the agent for all three and the sweep never wrote the other two.
  const sentences = [
    'Place opened on the harbour in 1998.',
    'Its bread is baked every morning in a wood oven.',
    'The terrace seats forty guests in summer.'
  ]
  const { plan, bundle, live } = blogOf({
    count: 3,
    sentences,
    written: [{ id: 70, topic: 'story', title: 'On the harbour since 1998', body: sentences[0] }]
  })
  const issues = (() => {
    try {
      validateAgentPlan(plan, bundle)
      return []
    } catch (error) {
      return (error.detail?.issues ?? [error.code ?? error.message]).map((i) => i.path ?? i)
    }
  })()
  assert.deepEqual(issues, [])
  const postDrafts = postDraftsOf(plan, bundle)
  const { calls, unresolved } = planSweep(
    { items: [] },
    {
      buildDate: '2026-10-26',
      platform: 'wordpress',
      inventory: live,
      templatePosts: templatePostsLeft(plan),
      postDrafts,
      checksLeft: 0
    }
  )
  const swept = calls.filter((c) => c.action === 'post')
  assert.deepEqual(
    swept.map((c) => [c.params.id, c.params.body]),
    [
      [71, sentences[1]],
      [72, sentences[2]]
    ]
  )
  assert.deepEqual(
    unresolved.filter((u) => u.field === 'post_content' || u.field === 'title'),
    []
  )
})

test('the sweep writes the topics the agent did not use, whatever their order, and never one it did', () => {
  // Review 26/10/2026: the agent wrote the story and the pasta posts; the split cut the story in two and the sweep's
  // next draft was the pasta again ("Pasta: Served fresh.").
  const sentences = [
    'Place opened on the harbour in 1998.',
    'Its bread is baked every morning in a wood oven.'
  ]
  const pasta = menuDish('Pasta', '120', { description: 'Served fresh' })
  const both = blogOf({
    count: 3,
    sentences,
    dishes: [pasta],
    written: [
      { id: 70, topic: 'story', title: 'Our harbour story', body: `${sentences[0]} ${sentences[1]}` },
      {
        id: 71,
        topic: 'dish',
        title: 'Fresh pasta',
        body: 'Pasta: Served fresh.',
        source: 'part:menu',
        quote: 'Served fresh'
      }
    ]
  })
  assert.deepEqual(postDraftsOf(both.plan, both.bundle), [], 'every fact is in a written post: no duplicate')
  assert.deepEqual(postTopicNames(both.plan, both.bundle), ['Our story', 'Food'])
  // The agent wrote the dish first and half the story: the other half is the sweep's, never the dish again.
  const half = blogOf({
    count: 3,
    sentences,
    dishes: [pasta],
    written: [
      {
        id: 70,
        topic: 'dish',
        title: 'Fresh pasta',
        body: 'Pasta: Served fresh.',
        source: 'part:menu',
        quote: 'Served fresh'
      },
      { id: 71, topic: 'story', title: 'On the harbour', body: sentences[0] }
    ]
  })
  assert.deepEqual(
    postDraftsOf(half.plan, half.bundle).map((d) => [d.topic, d.body]),
    [['story', sentences[1]]]
  )
  assert.deepEqual(postTopicNames(half.plan, half.bundle), ['Our story', 'Food'])
})

test('a written post uses only the facts its distinct words say: shared words and the business name never match another fact', () => {
  // Review 26/10/2026 (second pass): a post on "Harbour Cafe serves fresh bread every morning" marked "fresh pasta
  // every evening" as used, so postDraftsOf gave nothing while a template post and an unused fact remained.
  const sentences = [
    'Harbour Cafe serves fresh bread every morning.',
    'Harbour Cafe serves fresh pasta every evening.'
  ]
  const bread = blogOf({
    count: 2,
    name: 'Harbour Cafe',
    sentences,
    written: [{ id: 70, topic: 'story', title: 'Fresh bread', body: sentences[0] }]
  })
  assert.deepEqual(
    postDraftsOf(bread.plan, bread.bundle).map((d) => d.body),
    [sentences[1]]
  )
  // A post that says a fact in its own words still uses it: never two posts on one fact.
  const both = blogOf({
    count: 3,
    name: 'Harbour Cafe',
    sentences,
    written: [
      {
        id: 70,
        topic: 'story',
        title: 'Fresh bread',
        body: 'Our bread comes out of the oven every morning.'
      },
      { id: 71, topic: 'story', title: 'Pasta nights', body: 'Fresh pasta is made each evening.' }
    ]
  })
  assert.deepEqual(postDraftsOf(both.plan, both.bundle), [])
})

// Local round 20, 25/10/2026 (Levain, WordPress): a photo put in place of a PNG sketch behind a welcome text.
test('contract plan keeps a drawn section background: a photo into it is refused, into a photo background it is not', () => {
  const { bundle, plan } = fixture()
  const structure = {
    ...plan.structure,
    contract: {
      slots: {
        'homepage.hero.section-bg': 'wp-content/uploads/2026/10/background.png',
        'homepage.subscribe.section-bg': 'wp-content/uploads/2026/10/acymailing.jpg'
      }
    }
  }
  const row = (slot) => ({ ...plan.rows[0], target: { kind: 'contract', slot } })
  const at = (slot) => ({ ...plan, structure, structureHash: researchHash(structure), rows: [row(slot)] })
  const issues = (p) => {
    try {
      validateAgentPlan(p, bundle)
      return []
    } catch (error) {
      return (error.detail?.issues ?? [{ message: error.message }]).map((i) => i.message ?? String(i))
    }
  }
  assert.ok(issues(at('homepage.hero.section-bg')).some((m) => /drawn background/.test(m)))
  assert.deepEqual(issues(at('homepage.subscribe.section-bg')), [])
})

// Local round 21, 25/10/2026: no research photo carries a caption; media.look lets the agent see them before placing.
test('media.look answers a page of the frozen photos, numbered with their ids, and one sheet of them', async () => {
  const { pool } = fixture()
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(bytes) } })
  const first = await service.call(auth, { operation: 'media.look' })
  assert.equal(first.photos.length, 12)
  assert.deepEqual(
    first.photos.slice(0, 2).map((p) => p.n),
    [1, 2]
  )
  assert.equal(first.nextOffset, 12)
  assert.equal(typeof first.sheet, 'string')
  assert.equal((await sharp(Buffer.from(first.sheet, 'base64')).metadata()).format, 'jpeg')
  const last = await service.call(auth, { operation: 'media.look', offset: 24 })
  assert.equal(last.photos[0].n, 25)
  assert.equal(last.nextOffset, null)
  assert.equal((await service.call(auth, { operation: 'media.look', limit: 12 })).photos.length, 12)
  assert.equal((await service.call(auth, { operation: 'media.look', limit: 50 })).photos.length, 12)
  assert.equal((await service.call(auth, { operation: 'media.look', limit: 3 })).photos.length, 3)
  await assert.rejects(service.call(auth, { operation: 'media.look', assetId: 'x' }), /BAD_ASSET_REQUEST/)
  assert.equal(first.photos[0].cutout, undefined, 'an opaque photo is no cut-out')
})

// Local round 27, 25/10/2026: a product cut-out went behind a hero's words; media.look marks it.
test('media.look marks a photo on a clear ground as a cut-out', async () => {
  const { pool } = fixture()
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const cutout = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: await sharp({ create: { width: 32, height: 32, channels: 3, background: '#1f4fa0' } })
          .png()
          .toBuffer(),
        left: 16,
        top: 16
      }
    ])
    .png()
    .toBuffer()
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(cutout) } })
  const look = await service.call(auth, { operation: 'media.look', limit: 2 })
  assert.deepEqual(
    look.photos.map((p) => p.cutout),
    [true, true]
  )
  assert.match(look.next, /cutout/)
})

// Local round 22, 25/10/2026: an EmDash picture field written with the import's path kept only an external src.
test('media.import on EmDash answers the library item’s id to write into a picture field', async () => {
  const { pool, plan } = fixture('emdash')
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(bytes) } })
  await service.call(auth, { operation: 'plan.save', plan })
  const result = await service.call(
    auth,
    { operation: 'media.import', assetId: 'asset-29' },
    {
      upload: async () => ({
        status: 200,
        body: {
          ok: true,
          id: '01M5R3TSZGG82VFGQ86X8Y9E9Z',
          url: '/_emdash/api/media/file/01M5R3TSZGG82VFGQ86X8Y9E9Z.jpg'
        }
      })
    }
  )
  assert.equal(result.mediaId, '01M5R3TSZGG82VFGQ86X8Y9E9Z')
  assert.match(result.next, /mediaId \(not path\)/)
})

test('the agent demo names an item with no source by what the business offers: a gym’s is a Service, a café’s a Menu item', () => {
  const { revision } = fixture()
  assert.match(agentDemoPrompt(revision), /a dish item with no collected dish is named "Menu item"/)
  revision.brief.business = { ...revision.brief.business, trade: 'fitness' }
  const gym = agentDemoPrompt(revision)
  assert.match(gym, /item with no collected [a-z]+ is named "Service"/)
  assert.doesNotMatch(gym, /is named "Menu item"/)
})

test('the prompt carries the logo accent, the WhatsApp button and the areas served when the brief has them (#1780)', () => {
  const { revision } = fixture()
  assert.doesNotMatch(agentDemoPrompt(revision), /--ds-c-accent|wa\.me|Areas served/)
  const branded = {
    ...revision,
    brief: {
      ...revision.brief,
      brand: { accent: { hex: '#052514', source: 'logo', share: 0.87 } },
      contact: { whatsapp: { number: '+971 50 000 1234', verified: false, basis: 'uae-mobile' } },
      business: {
        serviceAreas: [{ text: 'Locations across Dubai', quote: 'Locations across Dubai', source: 's' }]
      }
    }
  }
  const prompt = agentDemoPrompt(branded)
  assert.match(prompt, /:root\{--ds-c-accent:#052514;[^}]*--ds-c-accent-on:#ffffff\}/)
  assert.match(prompt, /https:\/\/wa\.me\/971500001234/)
  assert.match(prompt, /Serving: Locations across Dubai/)
})
