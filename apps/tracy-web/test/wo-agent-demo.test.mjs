import sharp from 'sharp'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { briefOf } from '../src/opportunities-build/demo-qa.js'
import {
  AGENT_DEMO,
  freezeAgentResearch,
  checkedResearch,
  bundlePart,
  pictureSourceAssociations,
  validateAgentPlan,
  agentDemoCollected,
  agentDemoInventoryPolicy,
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
  isLogo,
  structurePage,
  joinPlan,
  compactSource
} from '../src/opportunities-build/agent-demo.js'

const bytes = Buffer.from('frozen picture')
const sha256 = createHash('sha256').update(bytes).digest('hex')

test('native text branding is authorized only by frozen WordPress research without a logo', () => {
  const revision = (read) => ({
    id: 'revision',
    account_id: 'account',
    brief: {
      quickstartWorkflow: AGENT_DEMO,
      agentDemoSnapshot: freezeAgentResearch({
        accountId: 'account',
        opportunityId: 'opp',
        revisionId: 'revision',
        at: '2026-10-27T00:00:00Z',
        read: { profile: {}, posts: [], rawSources: [], media: [], ...read }
      })
    }
  })
  assert.equal(agentDemoInventoryPolicy(revision({}), 'wordpress').allowWordPressSiteTitle, true)
  assert.deepEqual(agentDemoInventoryPolicy(revision({}), 'joomla'), {})
  assert.deepEqual(agentDemoInventoryPolicy(revision({}), 'emdash'), {})
  // A selected logo without an import (or even an available media row) still requires the logo.
  assert.equal(
    agentDemoInventoryPolicy(revision({ brand: { logo: 'logo-id' } }), 'wordpress').allowWordPressSiteTitle,
    false
  )
  assert.equal(
    agentDemoInventoryPolicy(
      revision({ media: [{ id: 'asset', kind: 'image', sourceUrl: 'https://x.test/logo.png' }] }),
      'wordpress'
    ).allowWordPressSiteTitle,
    false
  )
  const changed = revision({})
  changed.brief.agentDemoSnapshot.brand = { logo: null }
  assert.throws(() => agentDemoInventoryPolicy(changed, 'wordpress'), /SNAPSHOT_CHANGED/)
})

test('plan.read pages through picture proposals and marks unknown native targets explicitly', async () => {
  const { pool, build } = fixture()
  build.qa = {
    baseline: {
      pictureFrames: Array.from({ length: 25 }, (_, i) => ({
        frameId: `frame-${i}`,
        page: '/',
        width: 800,
        height: 400,
        underWords: true
      }))
    }
  }
  const service = agentDemoCapabilities({ pool, objects: null })
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const first = (await service.call(auth, { operation: 'plan.read' })).pictureProposal
  assert.equal(first.total, 25)
  assert.match(first.instructions, /Identity is unverified/)
  assert.equal(first.proposals[0].identity, 'unverified')
  assert.equal(first.proposals.length, 12)
  assert.equal(first.nextOffset, 12)
  assert.equal(first.proposals[0].mapping, 'unmapped')
  assert.equal(first.proposals[0].photo, null)
  const last = (await service.call(auth, { operation: 'plan.read', offset: 12, limit: 20 })).pictureProposal
  assert.equal(last.proposals.length, 13)
  assert.equal(last.nextOffset, null)
})

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

test('identical bytes from distinct research assets reuse the confirmed native attachment and retain attribution', async () => {
  const { pool, plan } = fixture()
  plan.rows.push({ ...plan.rows[0], assetIds: ['asset-28'] })
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: { get: async () => new Response(bytes) } })
  await service.call(auth, { operation: 'plan.save', plan })
  let uploads = 0
  const upload = async () => {
    uploads++
    // WordPress returns zero on a second write to an existing attachment's path.
    return { status: 200, body: { ok: true, attachment: uploads === 1 ? 4417 : 0 } }
  }
  const first = await service.call(auth, { operation: 'media.import', assetId: 'asset-29' }, { upload })
  const second = await service.call(auth, { operation: 'media.import', assetId: 'asset-28' }, { upload })
  assert.equal(second.attachmentId, first.attachmentId)
  assert.equal(second.path, first.path)
  assert.equal(second.assetId, 'asset-28')
  assert.equal(second.sourceUrl, 'https://example.test/photos/28')
  assert.equal(uploads, 1)
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
              goal: 'A sample email for the owner',
              operation: 'rewrite',
              sourceIds: [],
              sample: true,
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

// Plan "10/10" §3 (26/10/2026): words a check finds unreadable over a photo are fixed by toning that photo, so a saved
// image's tone may be set later; its photo and crop stay as saved.
test("a saved image's tone may be set or changed later; its photo and crop may not", () => {
  const row = {
    page: '/',
    section: 'hero',
    goal: 'Own photo',
    assetIds: ['a', 'b'],
    operation: 'replace-image'
  }
  const image = {
    assetId: 'a',
    crop: {
      aspect: 2,
      source: { width: 800, height: 400 },
      output: { width: 800, height: 400 },
      strategy: 'centre'
    }
  }
  const held = {
    version: 'agent-demo/1',
    researchHash: 'r',
    structureHash: 's',
    rows: [{ ...row, image }],
    hash: 'h1'
  }
  const next = (img) => ({ ...held, rows: [{ ...row, image: img }], hash: 'h2' })
  assert.equal(amendsPlan(held, next({ ...image, tone: 'dark' })), true)
  assert.equal(
    amendsPlan(
      { ...held, rows: [{ ...row, image: { ...image, tone: 'dark' } }] },
      next({ ...image, tone: 'light' })
    ),
    true
  )
  assert.equal(amendsPlan(held, next({ ...image, assetId: 'b', tone: 'dark' })), false)
  assert.equal(
    amendsPlan(held, next({ ...image, crop: { ...image.crop, strategy: 'attention' }, tone: 'dark' })),
    false
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
const freezeWithMenu = (menuItems, profile = {}) =>
  freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    template: { design: 'template', quickstart: 'tag', version: '1' },
    cms: 'wordpress',
    at: '2026-10-23T00:00:00Z',
    read: { profile: { name: 'Place', ...profile, menuItems }, media: [], rawSources: [], posts: [] }
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

// Barb Wire Saigon (stand, 24/10/2026): "110" printed for 110,000 VND must reach the agent with its scale.
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
  const none = bundlePart(freezeWithMenu(undefined), 'menu')
  assert.deepEqual([none.total, none.items], [0, []])
  assert.match(none.summary, /^No prices were collected/)
  assert.match(none.summary, /add no item or price of your own/)
  const off = bundlePart(freezeWithMenu(undefined, { menuPhotoStatus: 'switched_off' }), 'menu')
  assert.match(off.summary, /No prices were collected/)
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
  // Barb Wire (24/10/2026): its 16:9 hero photo was a 22.5 MB, 5312×3984 PNG; the import refused it as
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

// Plan "10/10" P1-1 (26/10/2026): media.look says what each photo shows, from labels made once per photo.
test('media.look gives each labelled photo its subject and says where people, posters and logos never go', async () => {
  const { pool } = fixture()
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const asked = []
  const photoLabels = async (rows, origins, bytesOf, options) => {
    asked.push({
      rows: rows.length,
      origins: origins.size,
      bytes: Boolean(await bytesOf(rows[0])),
      payer: options.payer
    })
    return new Map(
      rows.map((row, i) => [
        row.id,
        i === 0
          ? { subject: 'people', oneLine: 'two bakers on a bench', quality: 'good' }
          : { subject: 'food', oneLine: 'chocolate chip cookies', heroWorthy: true, quality: 'good' }
      ])
    )
  }
  const service = agentDemoCapabilities({
    pool,
    objects: { get: async () => new Response(bytes) },
    photoLabels
  })
  const looked = await service.call(auth, { operation: 'media.look', limit: 3 })
  assert.deepEqual(
    looked.photos.map((p) => [p.subject, p.shows, p.heroWorthy ?? false]),
    [
      ['people', 'two bakers on a bench', false],
      ['food', 'chocolate chip cookies', true],
      ['food', 'chocolate chip cookies', true]
    ]
  )
  assert.equal(asked[0].rows, 3)
  assert.equal(asked[0].bytes, true)
  assert.deepEqual(asked[0].payer, { kind: 'account', accountId: 'account' })
  assert.match(String(looked.next), /people, event, poster, menu-board, logo .* never behind words/)
  // a labeller that fails answers no subject, never an error
  const failing = agentDemoCapabilities({
    pool,
    objects: { get: async () => new Response(bytes) },
    photoLabels: async () => {
      throw new Error('vision down')
    }
  })
  const plain = await failing.call(auth, { operation: 'media.look', limit: 2 })
  assert.equal(plain.photos[0].subject, undefined)
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
  // Local round 36: written as an object `{id, alt}` it kept a shape the template's field never had.
  // Round 37: a bare id inside a JSON field stays a string EmDash never fills in; the shape the field had is kept.
  assert.match(result.next, /in the shape it had: a picture field that held an object keeps that object/)
})

// Plan "10/10" §7 S1 (26/10/2026): a WordPress build sent its 74 saved rows again to add a few (65K characters).
test('plan.add appends rows, gives images to rows that had none and tones to saved images, never the whole plan again', async () => {
  const { plan, pool } = fixture()
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const service = agentDemoCapabilities({ pool, objects: null })
  await assert.rejects(service.call(auth, { operation: 'plan.add', rows: [] }), /PLAN_REQUIRED/)
  await service.call(auth, { operation: 'plan.save', plan })
  const added = await service.call(auth, {
    operation: 'plan.add',
    rows: [{ ...plan.rows[0], section: 'story' }]
  })
  assert.deepEqual([added.ok, added.rows, added.appended], [true, 2, 1])
  await assert.rejects(service.call(auth, { operation: 'plan.add', tones: { 0: 'dark' } }), (e) =>
    /row 0 has no image to tone/.test(JSON.stringify(e.detail))
  )
  const image = {
    assetId: 'asset-29',
    crop: {
      aspect: 2,
      source: { width: 800, height: 400 },
      output: { width: 800, height: 400 },
      strategy: 'centre'
    }
  }
  await service.call(auth, { operation: 'plan.add', images: { 0: image } })
  const toned = await service.call(auth, { operation: 'plan.add', tones: { 0: 'dark' } })
  assert.equal(toned.ok, true)
  await assert.rejects(service.call(auth, { operation: 'plan.add', images: { 0: image } }), (e) =>
    /row 0 has its image/.test(JSON.stringify(e.detail))
  )
  await assert.rejects(service.call(auth, { operation: 'plan.add', plan }), (e) =>
    /not plan/.test(JSON.stringify(e.detail))
  )
  assert.throws(
    () => joinPlan({ rows: [] }, { operation: 'plan.add', tones: { 3: 'dark' } }),
    (e) => /3 is no saved row/.test(JSON.stringify(e.detail))
  )
})

// Plan "10/10" §7 S1c (26/10/2026): one `read part sources` answered 518K characters in local round 33.
test('a crawled source is read as its index of pages, and one page whole when asked', () => {
  const item = {
    id: 'source:website:1',
    hash: 'h',
    data: {
      ref: 'https://bakery.test/',
      source: 'website',
      cursor: { seen: ['a', 'b'], queue: [] },
      collected: {
        pages: [
          { url: 'https://bakery.test/', title: 'Home', text: 'Fresh cookies. '.repeat(100) },
          { url: 'https://bakery.test/gifts', title: 'Gifts', text: 'Cookie tins and boxes.' }
        ],
        media: Array.from({ length: 449 }, (_, i) => ({ url: `https://bakery.test/${i}.jpg` })),
        profile: { name: 'Bakery' }
      }
    }
  }
  const index = compactSource(item)
  assert.equal(index.data.cursor, undefined)
  assert.deepEqual(index.data.collected.media, { count: 449 })
  assert.deepEqual(index.data.collected.profile, { name: 'Bakery' })
  assert.deepEqual(
    index.data.collected.pages.map((p) => [p.n, p.title, p.lead.length, p.chars]),
    [
      [0, 'Home', 400, 1500],
      [1, 'Gifts', 22, 22]
    ]
  )
  assert.match(index.data.collected.pageRead, /page:<n>/)
  const one = compactSource(item, 0)
  assert.deepEqual([one.title, one.text.length], ['Home', 1500])
  assert.throws(() => compactSource(item, 5), /BAD_PAGE/)
  const bundle = { hash: 'b', sources: [item] }
  assert.equal(bundlePart(bundle, 'sources', 0, 1, 1).text, 'Cookie tins and boxes.')
  assert.ok(JSON.stringify(bundlePart(bundle, 'sources')).length < 4000)
  assert.throws(() => bundlePart(bundle, 'media', 0, 1, 1), /BAD_PAGE/)
})

// Plan "10/10" §7 S5 (26/10/2026): the words of every page written in small structured tasks, then read as packs.
test('copy.start runs the copy tasks once, copy.status says each page, copy.read answers the packs', async () => {
  const { pool, build } = fixture()
  build.qa = { baseline: { pageBlocks: { '/': [{ text: 'Welcome', kind: 'heading' }] } } }
  const query = pool.query.bind(pool)
  pool.query = async (sql, args) => {
    if (sql.startsWith('select') && sql.includes("'{agentDemo,copy}'"))
      return { rows: [{ copy: build.content.agentDemo.copy ?? null }] }
    if (sql.includes("'{agentDemo,copy}'")) {
      build.content.agentDemo.copy = JSON.parse(args[1])
      return { rows: [{ id: 'build' }] }
    }
    return query(sql, args)
  }
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  let release
  const asked = []
  const writeCopy = async (input) => {
    asked.push(input)
    await new Promise((r) => (release = r))
    return {
      version: 'demo-copy/1',
      ok: true,
      pages: { '/': { changes: [{ find: 'Welcome', replace: 'Fresh cookies' }], issues: [], kept: 0 } }
    }
  }
  const service = agentDemoCapabilities({ pool, objects: null, writeCopy })
  assert.deepEqual(await service.call(auth, { operation: 'copy.status' }), {
    ok: false,
    code: 'COPY_NOT_STARTED'
  })
  assert.deepEqual(await service.call(auth, { operation: 'copy.start' }), { ok: true, running: true })
  assert.deepEqual(
    await service.call(auth, { operation: 'copy.start' }),
    { ok: true, running: true },
    'never started twice'
  )
  assert.equal(asked.length, 1)
  assert.deepEqual(asked[0].pageBlocks, build.qa.baseline.pageBlocks)
  assert.equal(typeof asked[0].sourced, 'string')
  release()
  await new Promise((r) => setTimeout(r, 20))
  const status = await service.call(auth, { operation: 'copy.status' })
  assert.deepEqual(status.pages, [{ page: '/', changes: 1, issues: 0 }])
  assert.match(status.next, /copy\.apply/)
  assert.deepEqual((await service.call(auth, { operation: 'copy.read', page: '/' })).pages, [
    { path: '/', changes: [{ find: 'Welcome', replace: 'Fresh cookies' }], issues: [] }
  ])
  // no baseline words: refused with why
  build.qa = {}
  build.content.agentDemo.copy = undefined
  await assert.rejects(service.call(auth, { operation: 'copy.start' }), /COPY_NO_BASELINE/)
})

// Local round 35 (26/10/2026): the words were written in 107 s and the poll answered COPY_NOT_STARTED — its read of
// the build came before the run's write, its look at the running jobs after the run ended.
test('copy.status that read the build before the run wrote it answers the written words, not "not started"', async () => {
  const { pool, build } = fixture()
  build.qa = { baseline: { pageBlocks: { '/': [{ text: 'Welcome', kind: 'heading' }] } } }
  let row = null
  const query = pool.query.bind(pool)
  pool.query = async (sql, args) => {
    if (sql.startsWith('select') && sql.includes("'{agentDemo,copy}'")) return { rows: [{ copy: row }] }
    if (sql.includes("'{agentDemo,copy}'")) {
      row = JSON.parse(args[1])
      return { rows: [{ id: 'build' }] }
    }
    return query(sql, args)
  }
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const writeCopy = async () => ({
    version: 'demo-copy/1',
    ok: true,
    pages: { '/': { changes: [{ find: 'Welcome', replace: 'Fresh cookies' }], issues: [], kept: 0 } }
  })
  const service = agentDemoCapabilities({ pool, objects: null, writeCopy })
  assert.deepEqual(await service.call(auth, { operation: 'copy.start' }), { ok: true, running: true })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(build.content.agentDemo.copy, undefined, 'the build this request read holds no words')
  const status = await service.call(auth, { operation: 'copy.status' })
  assert.deepEqual(status.pages, [{ page: '/', changes: 1, issues: 0 }])
})

// Local round 35 (26/10/2026): a WordPress build lost a block's wrapper and class retyping it, and could not see the
// installed markup to put them back ("the original is gone"). A failed check names the record; this reads it whole.
test('structure.read with a record answers that record as the template installed it; an unknown one is refused', async () => {
  const { pool } = fixture()
  const service = agentDemoCapabilities({ pool, objects: null })
  const auth = { accountId: 'account', siteKey: 'site.test', sessionId: 'session' }
  const one = await service.call(auth, { operation: 'structure.read', record: 'pages/home' })
  assert.equal(one.record, 'pages/home')
  assert.deepEqual(one.data, { blocks: [{ image: 'photo.jpg' }] })
  assert.match(one.next, /only the words and pictures changed/)
  await assert.rejects(
    service.call(auth, { operation: 'structure.read', record: 'post/999' }),
    /AGENT_DEMO_RECORD_UNKNOWN/
  )
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
      contact: { whatsapp: { number: '+971 58 596 9059', verified: false, basis: 'uae-mobile' } },
      business: {
        serviceAreas: [{ text: 'Locations across Dubai', quote: 'Locations across Dubai', source: 's' }]
      }
    }
  }
  const prompt = agentDemoPrompt(branded)
  assert.match(prompt, /:root\{--ds-c-accent:#052514;[^}]*--ds-c-accent-on:#ffffff\}/)
  assert.match(prompt, /https:\/\/wa\.me\/971585969059/)
  assert.match(prompt, /Serving: Locations across Dubai/)
})

test('media source context joins only exact frozen picture URLs and does not certify product identity', () => {
  const bundle = {
    sources: [
      {
        id: 'source:website:0',
        data: {
          collected: {
            media: [
              {
                url: 'https://x.test/oats.jpg',
                sourceUrl: 'https://x.test/products/oat-cookie',
                caption: 'Oat cookie'
              },
              {
                url: 'https://x.test/other.jpg',
                sourceUrl: 'https://x.test/products/another-cookie',
                caption: 'Other'
              }
            ]
          }
        }
      }
    ]
  }
  const item = { id: 'oats', sourceUrl: 'https://x.test/oats.jpg' }
  const expected = [
    { sourceId: 'source:website:0', page: 'https://x.test/products/oat-cookie', caption: 'Oat cookie' }
  ]
  assert.deepEqual(pictureSourceAssociations(bundle, item), expected)
  assert.deepEqual(pictureSourceAssociations(bundle, { sourceUrl: 'https://x.test/oats.jpg?invented' }), [])
  assert.deepEqual(bundlePart({ ...bundle, media: [item] }, 'media').items[0].sourceAssociations, expected)
})
