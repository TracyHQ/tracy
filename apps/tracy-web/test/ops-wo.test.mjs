// /ops/wo (`src/ops/wo.js` + `src/lib/wo-ops.js`): Website Opportunities Live Queue across all
// accounts, sealed provider keys (`deepseek`, `firecrawl`, `jina`, `apify`), live connectivity
// tests, pipeline settings, per-operator read state, and operator recovery actions.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sealSecret } from '../src/lib/secret-box.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { testWoProviderKey, woRuntime } from '../src/lib/wo-ops.js'
import { DEFAULT_WO_OPS_SETTINGS, normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { woOpsRoutes } from '../src/ops/wo.js'

const SECRET = 'ops-wo-secret-32-chars-minimum!!'
const ORIGIN = 'https://cowork.tracy.test'
const NOW_ISO = '2026-10-18T12:00:00.000Z'

function releaseRow(tag, platform, hidden) {
  return {
    tag,
    release: { name: tag, kind: 'quickstart', github: 'published', publishedAt: NOW_ISO, assets: [] },
    setting: { platform, version: '1.0.0', label: 'Tracy Base', template: 'tracy-base' },
    inspiration: { template: 'tracy' },
    inspiration_hidden: hidden,
    pages: null,
    tracy: 'ready',
    reason: null,
    fetched_at: new Date(NOW_ISO)
  }
}

function createStandInPool({ role = 'admin', switchOn = true } = {}) {
  const state = {
    role,
    switchOn,
    settingRow: null,
    readSet: new Set(),
    // `readReleases` rows: Tracy Base on Joomla (unpublished from the shelf) and WordPress; no EmDash.
    releases: [releaseRow('tracy-base/j6', 'joomla', true), releaseRow('tracy-base/wp7', 'wordpress', false)],
    opportunities: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        account_id: 'aaaa1111-1111-4111-8111-111111111111',
        name: 'Bếp Nhà Xứ Quảng',
        branch: 'Hội An',
        provider: 'google-maps',
        provider_id: 'ChIJ_bep_nha',
        candidate: { address: '12 Trần Phú, Hội An', rating: 4.8, reviewCount: 312 },
        status: 'collecting',
        created_at: new Date(NOW_ISO),
        updated_at: new Date(NOW_ISO),
        account_email: 'ceo@tracy.ai',
        account_name: 'Lee'
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        account_id: 'bbbb2222-2222-4222-8222-222222222222',
        name: 'Anan Saigon',
        branch: 'District 1',
        provider: 'google-maps',
        provider_id: 'ChIJ_anan',
        candidate: { address: '89 Tôn Thất Đạm, Q1', rating: 4.7, reviewCount: 940 },
        status: 'built',
        created_at: new Date(NOW_ISO),
        updated_at: new Date(NOW_ISO),
        account_email: 'sarah@tracy.test',
        account_name: 'Sarah'
      }
    ],
    jobs: [
      {
        id: '99991111-1111-4111-8111-111111111111',
        opportunity_id: '11111111-1111-4111-8111-111111111111',
        account_id: 'aaaa1111-1111-4111-8111-111111111111',
        kind: 'research',
        request_id: 'req-1',
        state: 'paused',
        stage: 'collection',
        progress: {},
        lease_owner: null,
        lease_token: 2,
        lease_until: null,
        heartbeat_at: new Date(NOW_ISO),
        attempt: 1,
        last_error: { code: 'APIFY_DAILY_CAP', message: 'Daily Apify cap reached for account' },
        created_at: new Date(NOW_ISO),
        updated_at: new Date(NOW_ISO)
      }
    ],
    sources: [
      {
        opportunity_id: '11111111-1111-4111-8111-111111111111',
        source: 'website',
        ref: 'https://homekitchen-danang.example',
        status: 'done',
        reason: null,
        coverage: {},
        updated_at: new Date(NOW_ISO)
      },
      {
        opportunity_id: '11111111-1111-4111-8111-111111111111',
        source: 'instagram',
        ref: 'https://instagram.com/homekitchendanang',
        status: 'blocked',
        reason: 'quota',
        coverage: {},
        updated_at: new Date(NOW_ISO)
      }
    ],
    revisions: [
      {
        id: '77772222-2222-4222-8222-222222222222',
        opportunity_id: '22222222-2222-4222-8222-222222222222',
        account_id: 'bbbb2222-2222-4222-8222-222222222222',
        n: 2,
        cms: 'joomla',
        cms_source: 'preference',
        template: { slug: 'ja_restora' },
        asset_manifest: [],
        created_at: new Date(NOW_ISO)
      }
    ],
    builds: [
      {
        id: '88882222-2222-4222-8222-222222222222',
        opportunity_id: '22222222-2222-4222-8222-222222222222',
        revision_id: '77772222-2222-4222-8222-222222222222',
        site_key: 'anan-saigon.tracy.site',
        site_job_id: 'job-2',
        state: 'live',
        receipt: { ok: true },
        handoff: { ok: true },
        pictures: {},
        created_at: new Date(NOW_ISO),
        updated_at: new Date(NOW_ISO)
      }
    ],
    queries: []
  }

  const pool = {
    state,
    // The recovery actions run in one transaction (`lib/wo-operator-fence.js`); this book has none.
    async connect() {
      return {
        query: (sql, params) =>
          /^(begin|commit|rollback)$/.test(sql.trim()) ? { rows: [] } : pool.query(sql, params),
        release() {}
      }
    },
    async query(sql, params = []) {
      const norm = sql.replace(/\s+/g, ' ').trim()
      state.queries.push({ sql: norm, params })

      if (norm.includes('seat_workspace')) {
        return { rows: state.role ? [{ role: state.role }] : [] }
      }
      if (norm.startsWith('select id, email, display_name as name from account')) {
        return {
          rows: [
            {
              id: 'aaaa1111-1111-4111-8111-111111111111',
              email: params[0],
              name: 'Ops Admin'
            }
          ]
        }
      }
      if (norm.includes('from ui_setting')) {
        return { rows: [{ on: state.switchOn, overrides: { 'website-opportunities': state.switchOn } }] }
      }
      if (norm.includes('insert into ui_setting')) {
        const away = JSON.parse(params[0] || '{}')
        if ('website-opportunities' in away) {
          state.switchOn = Boolean(away['website-opportunities'])
        } else {
          state.switchOn = false
        }
        return { rows: [] }
      }
      if (norm.includes('from wo_ops_setting')) {
        return { rows: state.settingRow ? [state.settingRow] : [] }
      }
      if (norm.includes('insert into wo_ops_setting (id, settings')) {
        state.settingRow = {
          ...state.settingRow,
          settings: JSON.parse(params[0]),
          updated_by: params[1],
          updated_at: new Date(NOW_ISO)
        }
        return { rows: [] }
      }
      for (const col of [
        'deepseek_key_cipher',
        'firecrawl_key_cipher',
        'jina_key_cipher',
        'apify_key_cipher',
        'google_key_cipher',
        'rapidapi_key_cipher',
        'serpapi_key_cipher',
        'litescrape_key_cipher',
        'scrapecreators_key_cipher'
      ]) {
        if (norm.includes(`insert into wo_ops_setting (id, ${col}`)) {
          state.settingRow = {
            ...(state.settingRow ?? { settings: {} }),
            [col]: params[0],
            updated_by: params[1],
            updated_at: new Date(NOW_ISO)
          }
          return { rows: [] }
        }
      }
      if (norm.includes('from quickstart_releases')) {
        return { rows: state.releases }
      }
      if (norm.includes('from wo_opportunity o left join account')) {
        return { rows: state.opportunities }
      }
      if (norm.startsWith('select * from wo_opportunity where id = $1')) {
        const hit = state.opportunities.find((o) => o.id === params[0])
        return { rows: hit ? [hit] : [] }
      }
      if (norm.includes('from wo_job')) {
        return { rows: state.jobs }
      }
      if (norm.includes('from wo_source')) {
        return { rows: state.sources }
      }
      if (norm.includes('from wo_media')) {
        return {
          rows: [
            {
              opportunity_id: '22222222-2222-4222-8222-222222222222',
              total_count: 28,
              stored_count: 24,
              google_photo_count: 3
            }
          ]
        }
      }
      if (norm.includes('from wo_revision')) {
        return { rows: state.revisions }
      }
      if (norm.includes('from wo_build')) {
        return { rows: state.builds }
      }
      if (norm.includes('from wo_preference')) {
        return { rows: [] }
      }
      if (norm.includes('from ops_wo_read')) {
        return {
          rows: [...state.readSet].map((id) => ({
            opportunity_id: id,
            read_at: new Date(NOW_ISO)
          }))
        }
      }
      if (norm.startsWith('insert into ops_wo_read')) {
        state.readSet.add(params[1])
        return { rows: [] }
      }
      if (norm.startsWith('delete from ops_wo_read')) {
        state.readSet.delete(params[1])
        return { rows: [] }
      }
      if (norm.startsWith('update wo_source')) {
        for (const s of state.sources) {
          if (s.opportunity_id === params[0]) s.status = 'skipped'
        }
        return { rows: [] }
      }
      if (norm.startsWith('update wo_job')) {
        for (const j of state.jobs) {
          if (j.opportunity_id === params[0]) {
            if (norm.includes("state = 'completed'")) j.state = 'completed'
            if (norm.includes("state = 'queued'")) {
              j.state = 'queued'
              j.last_error = null
            }
          }
        }
        return { rows: [] }
      }
      if (norm.startsWith('insert into wo_revision')) {
        state.revisions.push({
          id: '77771111-1111-4111-8111-111111111111',
          opportunity_id: params[0],
          account_id: params[1],
          n: 1,
          cms: 'joomla',
          cms_source: 'ops_force',
          template: { slug: 'ja_restora' },
          asset_manifest: [],
          created_at: new Date(NOW_ISO)
        })
        return { rows: [] }
      }
      if (norm.startsWith('update wo_opportunity')) {
        const opp = state.opportunities.find((o) => o.id === params[0])
        if (opp) {
          if (norm.includes("status = 'ready'")) opp.status = 'ready'
          if (norm.includes("status = 'collecting'")) opp.status = 'collecting'
        }
        return { rows: [] }
      }
      if (norm.startsWith('delete from rate_bucket')) {
        return { rows: [] }
      }
      throw new Error(`Unexpected SQL in ops-wo test: ${norm}`)
    }
  }
  return pool
}

const quiet = { log() {} }

async function requestWo({
  pool,
  method = 'GET',
  path = '/api/ops/wo',
  body,
  origin = ORIGIN,
  signedIn = true,
  apifyToken = 'apify_env_token_12345',
  modelApiKey = 'sk-deepseek-env-12345',
  fetchImpl
}) {
  const app = woOpsRoutes({
    pool,
    config: {
      origin: ORIGIN,
      sessionSecret: SECRET,
      siteDomain: 'tracy.site',
      apifyToken,
      model: modelApiKey ? { apiKey: modelApiKey } : null
    },
    log: quiet,
    ...(fetchImpl ? { fetchImpl } : {})
  })
  const headers = { origin, 'content-type': 'application/json' }
  if (signedIn) {
    headers.cookie = `${SESSION_COOKIE}=${await mintSession('ops@tracy.test', SECRET)}`
  }
  return app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
}

test('GET /api/ops/wo returns live queue across all users, lifecycle stages, template pin status, and masked provider hints', async () => {
  const pool = createStandInPool()
  const res = await requestWo({ pool })
  assert.equal(res.status, 200)
  const doc = await res.json()

  assert.equal(doc.uiEnabled, true)
  assert.equal(doc.writable, true)
  assert.equal(doc.members.length, 2)
  assert.equal(doc.opportunities.length, 2)

  const pausedRow = doc.opportunities.find((r) => r.name === 'Bếp Nhà Xứ Quảng')
  assert.equal(pausedRow.stage, '3-researching')
  assert.equal(pausedRow.needsAttention, true)
  assert.equal(pausedRow.queueState, 'PAUSED')

  const liveRow = doc.opportunities.find((r) => r.name === 'Anan Saigon')
  assert.equal(liveRow.stage, '7-live')
  assert.equal(liveRow.needsAttention, false)
  assert.equal(liveRow.demoSite, 'anan-saigon.tracy.site')

  // Verify env fallback hints and that raw keys never leak
  assert.equal(doc.providers.apify.configured, true)
  assert.equal(doc.providers.apify.source, 'env')
  assert.equal(doc.providers.deepseek.configured, true)
  assert.equal(doc.providers.deepseek.source, 'env')
  assert.equal(doc.providers.firecrawl.configured, false)
  assert.equal(doc.providers.jina.configured, false)
  assert.ok(!JSON.stringify(doc).includes('apify_env_token_12345'))
  assert.ok(!JSON.stringify(doc).includes('sk-deepseek-env-12345'))

  // Verify hidden template warning is surfaced from quickstart_releases
  const joomlaPin = doc.templateStatuses.find((t) => t.cms === 'joomla')
  assert.equal(joomlaPin.inspirationHidden, true)
})

test('GET /api/ops/wo says per CMS pin whether Design inspiration still offers it', async () => {
  const pool = createStandInPool()
  const doc = await (await requestWo({ pool })).json()
  assert.deepEqual(
    doc.templateStatuses.map(({ cms, slug, found, offered }) => ({ cms, slug, found, offered })),
    [
      { cms: 'joomla', slug: 'tracy-base/j6', found: true, offered: false },
      { cms: 'wordpress', slug: 'tracy-base/wp7', found: true, offered: true },
      { cms: 'emdash', slug: 'tracy-base/emdash-0.x', found: false, offered: false }
    ]
  )
})

test('settings pins: a release tag and the strict policy are saved; a junk tag or policy is refused 400', async () => {
  const pool = createStandInPool()
  const put = (settings) =>
    requestWo({ pool, method: 'PUT', path: '/api/ops/wo/settings', body: { settings } })
  const saved = await put({
    templatePinPolicy: 'strict',
    pinnedTemplates: { joomla: 'tracy-business/j6', wordpress: 'tracy-base/wp7', emdash: '' }
  })
  assert.equal(saved.status, 200)
  const doc = await saved.json()
  assert.equal(doc.settings.templatePinPolicy, 'strict')
  assert.deepEqual(doc.settings.pinnedTemplates, {
    joomla: 'tracy-business/j6',
    wordpress: 'tracy-base/wp7',
    emdash: 'tracy-base/emdash-0.x'
  })
  for (const [settings, error] of [
    [{ pinnedTemplates: { joomla: 'ja_restora' } }, 'INVALID_PINNED_TEMPLATE'],
    [{ pinnedTemplates: { joomla: 'a/b/c' } }, 'INVALID_PINNED_TEMPLATE'],
    [{ pinnedTemplates: { drupal: 'tracy-base/d10' } }, 'INVALID_PINNED_TEMPLATE'],
    [{ templatePinPolicy: 'refuse' }, 'INVALID_TEMPLATE_PIN_POLICY']
  ]) {
    const res = await put(settings)
    assert.equal(res.status, 400, JSON.stringify(settings))
    assert.equal((await res.json()).error, error)
  }
})

test('settings pins: the new defaults are Tracy Base; slugs and policies saved before #1436 read as today', () => {
  // test-quality: contract — Lee's 19/10 decision (tasks/todo-wo-per-template.md) names Tracy Base as the pin for all three CMSs
  assert.deepEqual(DEFAULT_WO_OPS_SETTINGS.pinnedTemplates, {
    joomla: 'tracy-base/j6',
    wordpress: 'tracy-base/wp7',
    emdash: 'tracy-base/emdash-0.x'
  })
  const old = normalizeWoOpsSettings({
    templatePinPolicy: 'refuse',
    pinnedTemplates: { joomla: 'ja_restora', wordpress: 'tracy-business/wp7', emdash: 'bravada-restaurant' }
  })
  assert.equal(old.templatePinPolicy, 'strict')
  assert.deepEqual(old.pinnedTemplates, {
    joomla: 'tracy-base/j6',
    wordpress: 'tracy-business/wp7',
    emdash: 'tracy-base/emdash-0.x'
  })
})

test('PUT /api/ops/wo/keys/:provider seals and rotates keys, and POST /test verifies connectivity', async () => {
  const pool = createStandInPool()

  const saveRes = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/firecrawl',
    body: { apiKey: 'fc-live-secret-key-987654' }
  })
  assert.equal(saveRes.status, 200)
  const afterSave = await saveRes.json()
  assert.equal(afterSave.providers.firecrawl.configured, true)
  assert.equal(afterSave.providers.firecrawl.source, 'ops')
  assert.equal(afterSave.providers.firecrawl.hint, 'fc-… (25 chars)')
  assert.ok(!JSON.stringify(afterSave).includes('fc-live-secret-key-987654'))

  const testRes = await requestWo({
    pool,
    method: 'POST',
    path: '/api/ops/wo/keys/firecrawl/test',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.firecrawl.dev/v1/search')
      assert.equal(init.headers.authorization, 'Bearer fc-live-secret-key-987654')
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
  })
  assert.equal(testRes.status, 200)
  const testBody = await testRes.json()
  assert.equal(testBody.ok, true)
  assert.equal(testBody.status, 'connected')
})

test('ScrapeCreators provider key is sealed and its probe checks the balance without exposing the key', async () => {
  const pool = createStandInPool()
  const key = 'scrapecreators-live-secret-987654'
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/scrapecreators',
    body: { apiKey: key }
  })
  assert.equal(saved.status, 200)
  const document = await saved.json()
  assert.equal(document.providers.scrapecreators.configured, true)
  assert.equal(document.providers.scrapecreators.source, 'ops')
  assert.ok(!JSON.stringify(document).includes(key))
  const probed = await requestWo({
    pool,
    method: 'POST',
    path: '/api/ops/wo/keys/scrapecreators/test',
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://api.scrapecreators.com/v1/account/credit-balance')
      assert.equal(init.headers['x-api-key'], key)
      return Response.json({ success: true, creditCount: 87, credits_charged: 1 })
    }
  })
  const result = await probed.json()
  assert.equal(result.ok, true)
  assert.match(result.detail, /87 credits available/)
  assert.ok(!JSON.stringify(result).includes(key))
})

test('PUT /api/ops/wo/settings saves pipeline policies and POST /action recovers stuck jobs', async () => {
  const pool = createStandInPool()

  const settingsRes = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: {
      uiEnabled: true,
      settings: {
        defaultRadiusM: 3500,
        webSearchProvider: 'deepseek',
        searchRunsPerDay: 25,
        researchRunsPerDay: 50
      }
    }
  })
  assert.equal(settingsRes.status, 200)
  const updatedDoc = await settingsRes.json()
  assert.equal(updatedDoc.settings.defaultRadiusM, 3500)
  assert.equal(updatedDoc.settings.webSearchProvider, 'deepseek')
  assert.equal(updatedDoc.settings.searchRunsPerDay, 25)
  assert.equal(updatedDoc.settings.researchRunsPerDay, 50)

  // Force-complete the paused opportunity so it advances to 4-brief-ready
  const actionRes = await requestWo({
    pool,
    method: 'POST',
    path: '/api/ops/wo/opportunities/11111111-1111-4111-8111-111111111111/action',
    body: { action: 'force-complete-brief' }
  })
  assert.equal(actionRes.status, 200)
  const actionBody = await actionRes.json()
  assert.equal(actionBody.ok, true)
  const recovered = actionBody.queue.opportunities.find(
    (r) => r.id === '11111111-1111-4111-8111-111111111111'
  )
  assert.equal(recovered.stage, '4-brief-ready')
  assert.equal(recovered.needsAttention, false)
})

test('provider order: PUT saves one group, the payload shows every group with its order and states, a bad order is 400', async () => {
  const pool = createStandInPool()
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: { settings: { providerOrder: { facebook: ['apify', 'scrapecreators'] } } }
  })
  assert.equal(saved.status, 200)
  const doc = await saved.json()
  assert.deepEqual(doc.settings.providerOrder, { facebook: ['apify', 'scrapecreators'] })
  const facebook = doc.capabilities.find((g) => g.id === 'facebook')
  assert.deepEqual(facebook.order, ['apify', 'scrapecreators'])
  assert.equal(facebook.declared, true)
  assert.deepEqual(facebook.defaultOrder, ['scrapecreators', 'rapidapi-scraper3', 'apify'])
  assert.ok(
    facebook.providers.every((p) => ['connected', 'missing_key', 'limit_reached', 'error'].includes(p.state))
  )
  const instagram = doc.capabilities.find((g) => g.id === 'instagram')
  assert.equal(instagram.declared, false)
  assert.equal(instagram.order[0], 'scrapecreators')
  assert.equal(doc.capabilities.length, 12)
  assert.equal(facebook.wired, true)
  assert.deepEqual(
    doc.capabilities.filter((g) => g.wired).map((g) => g.id),
    [
      'facebook',
      'instagram',
      'tiktok',
      'youtube',
      'website-content',
      'web-search',
      'tripadvisor',
      'menu-links',
      'menu-photos',
      'menu-items'
    ],
    'a group is wired only together with the research step that reads its order'
  )
  assert.equal(
    doc.capabilities.find((g) => g.id === 'map-discovery').wired,
    false,
    'still set by mapDiscoveryProvider'
  )

  const bad = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: { settings: { providerOrder: { facebook: ['looter2'] } } }
  })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error, 'INVALID_PROVIDER_ORDER')
  const rt = await woRuntime(pool, { sessionSecret: SECRET })
  assert.deepEqual(
    rt.settings.providerOrder,
    { facebook: ['apify', 'scrapecreators'] },
    'a refused order leaves the saved one'
  )
})

test('PUT /api/ops/wo/read records operator read state and non-admin writes are refused 403', async () => {
  const pool = createStandInPool({ role: 'developer' })

  // A developer can mark their own row read
  const readRes = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/read',
    body: { opportunityId: '11111111-1111-4111-8111-111111111111', read: true }
  })
  assert.equal(readRes.status, 200)

  // A developer cannot rotate keys or run operator actions
  const writeKeyRes = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/jina',
    body: { apiKey: 'jina_secret_123' }
  })
  assert.equal(writeKeyRes.status, 403)
})

test('woRuntime with nothing saved in /ops: env keys and default settings', async () => {
  const pool = createStandInPool()
  const rt = await woRuntime(pool, {
    sessionSecret: SECRET,
    apifyToken: 'apify_env_token_12345',
    googleApiKey: 'AIza-env-key',
    rapidapiKey: 'rapid-env-key',
    scrapeCreatorsApiKey: 'scrapecreators-env-key'
  })
  // The vision model menu photos are read with is looked up only when a Research again preview asks for it.
  const { menuVision, ...keys } = rt.keys
  assert.equal(typeof menuVision, 'function')
  assert.deepEqual(keys, {
    google: 'AIza-env-key',
    apify: 'apify_env_token_12345',
    firecrawl: null,
    jina: null,
    deepseek: null,
    rapidapi: 'rapid-env-key',
    serpapi: null,
    litescrape: null,
    scrapecreators: 'scrapecreators-env-key'
  })
  assert.equal(rt.settings.mapDiscoveryProvider, 'auto')
  assert.equal(rt.settings.defaultRadiusM, DEFAULT_WO_OPS_SETTINGS.defaultRadiusM)
})

test('woRuntime: a key sealed in /ops wins over env, settings are normalized, each call reads afresh', async () => {
  const pool = createStandInPool()
  pool.state.settingRow = {
    settings: { defaultRadiusM: 99999, mapDiscoveryProvider: 'google', searchRunsPerDay: 7 },
    apify_key_cipher: await sealSecret('apify_ops_token', SECRET)
  }
  const config = { sessionSecret: SECRET, apifyToken: 'apify_env_token_12345' }
  const rt = await woRuntime(pool, config)
  assert.equal(rt.keys.apify, 'apify_ops_token')
  assert.equal(rt.settings.mapDiscoveryProvider, 'google')
  assert.equal(rt.settings.searchRunsPerDay, 7)
  assert.equal(rt.settings.defaultRadiusM, DEFAULT_WO_OPS_SETTINGS.defaultRadiusM, 'out of range → default')
  pool.state.settingRow = null
  assert.equal((await woRuntime(pool, config)).keys.apify, 'apify_env_token_12345')
})

test('woRuntime: a database error falls back to env keys and defaults, never throws', async () => {
  const pool = {
    async query() {
      throw new Error('relation "wo_ops_setting" does not exist')
    }
  }
  const warned = []
  const rt = await woRuntime(
    pool,
    { sessionSecret: SECRET, apifyToken: 'apify_env' },
    { log: { warn: (m) => warned.push(m) } }
  )
  assert.equal(rt.keys.apify, 'apify_env')
  assert.equal(rt.settings.gmapsMaxPlaces, DEFAULT_WO_OPS_SETTINGS.gmapsMaxPlaces)
  assert.equal(warned.length, 1)
  assert.equal((await woRuntime(null, { apifyToken: 'x' })).keys.apify, 'x')
})

test('testWoProviderKey google probes Places, PageSpeed and Maps Embed separately; ok only when all three are', async () => {
  const pool = createStandInPool()
  const config = { sessionSecret: SECRET, googleApiKey: 'AIza-test' }
  const asked = []
  const answers = { places: 200, pagespeed: 200, embed: 200 }
  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    if (u.startsWith('https://places.googleapis.com/v1/places:searchText')) {
      asked.push('places')
      assert.equal(init.headers['X-Goog-FieldMask'], 'places.id')
      assert.equal(JSON.parse(init.body).maxResultCount, 1)
      return Response.json(
        answers.places === 200
          ? { places: [{ id: 'x' }] }
          : { error: { message: 'Places API (New) has not been used' } },
        { status: answers.places }
      )
    }
    if (u.startsWith('https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed')) {
      asked.push('pagespeed')
      assert.match(u, /url=https%3A%2F%2Fexample\.com/)
      assert.match(u, /key=AIza-test/)
      return Response.json({ lighthouseResult: {} }, { status: answers.pagespeed })
    }
    if (u.startsWith('https://www.google.com/maps/embed/v1/place')) {
      asked.push('embed')
      assert.match(u, /key=AIza-test/)
      return new Response('<html></html>', { status: answers.embed })
    }
    throw new Error(`unexpected ${u}`)
  }
  const ok = await testWoProviderKey(pool, config, 'google', fetchImpl)
  assert.deepEqual(asked.sort(), ['embed', 'pagespeed', 'places'])
  assert.equal(ok.ok, true)
  assert.equal(ok.status, 'connected')
  assert.equal(ok.apis.places.ok, true)
  assert.equal(ok.apis.pagespeed.ok, true)
  assert.equal(ok.apis.embed.ok, true)
  assert.ok(!/custom search/i.test(JSON.stringify(ok)))
  assert.ok(!JSON.stringify(ok).includes('AIza-test'), 'the key never reaches the answer')

  answers.places = 403
  const partly = await testWoProviderKey(pool, config, 'google', fetchImpl)
  assert.equal(partly.ok, false)
  assert.equal(partly.apis.places.ok, false)
  assert.match(partly.apis.places.detail, /403/)
  assert.equal(partly.apis.pagespeed.ok, true)
  assert.equal(partly.apis.embed.ok, true)
})

test('the Live Queue carries the PageSpeed facts of the research profile', async () => {
  const pool = createStandInPool()
  const facts = { performance: 41, seo: 88, lcpMs: 5200, https: false, checkedAt: NOW_ISO }
  pool.state.opportunities[0].page_speed = facts
  const doc = await (await requestWo({ pool })).json()
  assert.deepEqual(doc.opportunities.find((r) => r.name === 'Bếp Nhà Xứ Quảng').pageSpeed, facts)
  assert.equal(doc.opportunities.find((r) => r.name === 'Anan Saigon').pageSpeed, null)
  assert.ok(pool.state.queries.some((q) => q.sql.includes("p.profile->'pageSpeed' as page_speed")))
})

test('the Live Queue carries a short Google Places summary: amenities, reviews and stored photos', async () => {
  const pool = createStandInPool()
  pool.state.opportunities[1].google_place = { amenities: 4, reviews: 5, fetchedAt: NOW_ISO }
  const doc = await (await requestWo({ pool })).json()
  const row = doc.opportunities.find((r) => r.name === 'Anan Saigon')
  assert.deepEqual(row.googlePlace, { amenities: 4, reviews: 5, photos: 3, fetchedAt: NOW_ISO })
  assert.equal(doc.opportunities.find((r) => r.name === 'Bếp Nhà Xứ Quảng').googlePlace, null)
  assert.ok(pool.state.queries.some((q) => q.sql.includes('as google_place')))
})

test('find places v2 settings: the browser map key (public, AIza… or empty), the slow-site threshold and the auto-check limit', async () => {
  const pool = createStandInPool()
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: {
      settings: {
        googleMapsBrowserKey: '  AIzaSyBrowserKey_0123456789abcdef  ',
        slowSiteThreshold: 40,
        siteChecksAutoLimit: 10
      }
    }
  })
  assert.equal(saved.status, 200)
  const doc = await saved.json()
  assert.equal(
    doc.settings.googleMapsBrowserKey,
    'AIzaSyBrowserKey_0123456789abcdef',
    'trimmed, kept in clear'
  )
  assert.equal(doc.settings.slowSiteThreshold, 40)
  assert.equal(doc.settings.siteChecksAutoLimit, 10)
  const rt = await woRuntime(pool, { sessionSecret: SECRET })
  assert.equal(rt.settings.googleMapsBrowserKey, 'AIzaSyBrowserKey_0123456789abcdef')
  assert.equal(rt.settings.slowSiteThreshold, 40)
  assert.equal(rt.settings.siteChecksAutoLimit, 10)

  const cleared = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: { settings: { googleMapsBrowserKey: '', slowSiteThreshold: 0, siteChecksAutoLimit: 99 } }
  })
  const after = (await cleared.json()).settings
  assert.equal(after.googleMapsBrowserKey, '')
  assert.equal(after.slowSiteThreshold, DEFAULT_WO_OPS_SETTINGS.slowSiteThreshold, 'out of range → default')
  assert.equal(
    after.siteChecksAutoLimit,
    DEFAULT_WO_OPS_SETTINGS.siteChecksAutoLimit,
    'out of range → default'
  )
  // test-quality: contract — the API reference and the /ops/wo page both state these defaults (50 and 20)
  assert.equal(DEFAULT_WO_OPS_SETTINGS.slowSiteThreshold, 50)
  // test-quality: contract — same: the documented default, not a copy of the constant
  assert.equal(DEFAULT_WO_OPS_SETTINGS.siteChecksAutoLimit, 20)

  const bad = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: { settings: { googleMapsBrowserKey: 'not-a-google-key' } }
  })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error, 'INVALID_GOOGLE_MAPS_BROWSER_KEY')
})

test('rapidapi key: sealed on /ops/wo like the others; Test is one free call that proves the key', async () => {
  const pool = createStandInPool()
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/rapidapi',
    body: { apiKey: 'rapid-ops-key-0123456789' }
  })
  assert.equal(saved.status, 200)
  const doc = await saved.json()
  assert.equal(doc.providers.rapidapi.configured, true)
  assert.equal(doc.providers.rapidapi.source, 'ops')
  assert.ok(!JSON.stringify(doc).includes('rapid-ops-key-0123456789'))
  assert.equal((await woRuntime(pool, { sessionSecret: SECRET })).keys.rapidapi, 'rapid-ops-key-0123456789')

  const asked = []
  const answer = { status: 404, message: "Endpoint '/__tracy_probe' does not exist" }
  const fetchImpl = async (u, init = {}) => {
    asked.push({ url: String(u), headers: init.headers })
    return Response.json({ message: answer.message }, { status: answer.status })
  }
  const ok = await (
    await requestWo({ pool, method: 'POST', path: '/api/ops/wo/keys/rapidapi/test', fetchImpl })
  ).json()
  assert.equal(asked.length, 1, 'one call')
  // An endpoint that does not exist is answered by the RapidAPI gateway: no listing quota is spent.
  assert.equal(asked[0].url, 'https://yt-api.p.rapidapi.com/__tracy_probe')
  assert.equal(asked[0].headers['X-RapidAPI-Key'], 'rapid-ops-key-0123456789')
  assert.equal(asked[0].headers['X-RapidAPI-Host'], 'yt-api.p.rapidapi.com')
  assert.equal(ok.ok, true)
  assert.equal(ok.status, 'connected')
  assert.ok(!JSON.stringify(ok).includes('rapid-ops-key'), 'the key never reaches the answer')

  Object.assign(answer, { status: 403, message: 'You are not subscribed to this API.' })
  const bad = await testWoProviderKey(pool, { sessionSecret: SECRET }, 'rapidapi', fetchImpl)
  assert.equal(bad.ok, false)
  assert.equal(bad.status, 'invalid_key')
})

test('social stats settings: auto limit 0–40, a per-account day, and one daily cap per provider', async () => {
  const pool = createStandInPool()
  // test-quality: contract the documented default of 10 auto-enriched places a search is what the plan states
  assert.equal(DEFAULT_WO_OPS_SETTINGS.socialStatsAutoLimit, 10)
  // test-quality: contract 200 billable calls per account and day is the documented default
  assert.equal(DEFAULT_WO_OPS_SETTINGS.socialStatsPerAccountPerDay, 200)
  // test-quality: contract the documented defaults keep every free RapidAPI tier inside its month
  assert.deepEqual(DEFAULT_WO_OPS_SETTINGS.socialStatsProviderDailyCap, {
    'facebook-scraper3': 3,
    'facebook-scrapecreators': 10,
    'facebook-apify': 0,
    'instagram-scrapecreators': 10,
    'instagram-apify': 0,
    'tiktok-scrapecreators': 10,
    'tiktok-apify': 0,
    'instagram-looter2': 4,
    'instagram-stable': 0,
    'tiktok-api23': 3,
    'yt-api': 9,
    'youtube-official': 500
  })
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: {
      settings: {
        socialStatsAutoLimit: 25,
        socialStatsPerAccountPerDay: 50,
        socialStatsProviderDailyCap: { 'tiktok-api23': 300, 'instagram-stable': -1, 'made-up': 9 }
      }
    }
  })
  assert.equal(saved.status, 200)
  const { settings } = await saved.json()
  assert.equal(settings.socialStatsAutoLimit, 25)
  assert.equal(settings.socialStatsPerAccountPerDay, 50)
  assert.deepEqual(settings.socialStatsProviderDailyCap, {
    ...DEFAULT_WO_OPS_SETTINGS.socialStatsProviderDailyCap,
    'tiktok-api23': 300
  })
  const rt = await woRuntime(pool, { sessionSecret: SECRET })
  assert.equal(rt.settings.socialStatsProviderDailyCap['tiktok-api23'], 300)
  const clamped = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: { settings: { socialStatsAutoLimit: 41 } }
  })
  assert.equal((await clamped.json()).settings.socialStatsAutoLimit, 10, 'out of range → default')
})

// Lee, 19/10/2026 (after runs 1–3): a deployment whose operator never chose builds with EmDash; a saved choice is kept.
test('Default CMS: EmDash when the setting is absent, the operator’s saved choice when there is one', () => {
  // test-quality: contract — Lee's 19/10 decision after runs 1–3: EmDash is the default a fresh deployment builds with
  assert.equal(DEFAULT_WO_OPS_SETTINGS.defaultCms, 'emdash')
  assert.equal(normalizeWoOpsSettings({}).defaultCms, 'emdash')
  assert.equal(normalizeWoOpsSettings({ defaultCms: 'nope' }).defaultCms, 'emdash')
  assert.equal(normalizeWoOpsSettings({ defaultCms: 'wordpress' }).defaultCms, 'wordpress')
  assert.equal(normalizeWoOpsSettings({ defaultCms: 'joomla' }).defaultCms, 'joomla')
})

test('demo retention settings: documented defaults, saved alone without resetting the rest, refused out of range', async () => {
  const pool = createStandInPool()
  // test-quality: contract the defaults Lee set on 19/10 (tasks/todo-wo-demo-retention.md)
  assert.deepEqual(
    Object.fromEntries(Object.entries(DEFAULT_WO_OPS_SETTINGS).filter(([k]) => k.startsWith('demo'))),
    {
      demoBuildsPerAccountPerDay: 20,
      demoRetentionEnabled: true,
      demoTtlDays: 14,
      demoReviewTtlDays: 7,
      demoFreezeGraceDays: 7,
      demoMaxPerAccount: 50,
      demoMaxPerHost: 500,
      demoDiskHighWaterPct: 80,
      demoSweepBatch: 10
    }
  )
  const first = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: { settings: { slowSiteThreshold: 40 } }
  })
  assert.equal(first.status, 200)
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/settings',
    body: { settings: { demoTtlDays: 21, demoRetentionEnabled: false, demoMaxPerAccount: 0 } }
  })
  assert.equal(saved.status, 200)
  const { settings } = await saved.json()
  assert.equal(settings.demoTtlDays, 21)
  assert.equal(settings.demoRetentionEnabled, false)
  assert.equal(settings.demoMaxPerAccount, 0)
  assert.equal(settings.slowSiteThreshold, 40, 'a save of some keys keeps the others saved before')
  for (const bad of [
    { demoTtlDays: 0 },
    { demoTtlDays: 366 },
    { demoDiskHighWaterPct: 49 },
    { demoDiskHighWaterPct: 96 },
    { demoSweepBatch: 101 },
    { demoMaxPerHost: -1 },
    { demoFreezeGraceDays: 2.5 },
    { demoReviewTtlDays: '7' },
    { demoRetentionEnabled: 'yes' }
  ]) {
    const refused = await requestWo({
      pool,
      method: 'PUT',
      path: '/api/ops/wo/settings',
      body: { settings: bad }
    })
    assert.equal(refused.status, 400, JSON.stringify(bad))
    assert.equal((await refused.json()).error, 'INVALID_DEMO_RETENTION')
  }
  const rt = await woRuntime(pool, { sessionSecret: SECRET })
  assert.equal(rt.settings.demoTtlDays, 21)
})

test('Litescrape Settings seals and clears the override, env fallback stays private and Test only reads key status', async () => {
  const pool = createStandInPool()
  const secret = 'ls_live_test_0123456789'
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/litescrape',
    body: { apiKey: secret }
  })
  assert.equal(saved.status, 200)
  const facts = await saved.json()
  assert.equal(facts.providers.litescrape.source, 'ops')
  assert.ok(!JSON.stringify(facts).includes(secret))
  assert.equal(
    (await woRuntime(pool, { sessionSecret: SECRET, litescrapeApiKey: 'env-test' })).keys.litescrape,
    secret
  )
  const calls = []
  const probe = await testWoProviderKey(pool, { sessionSecret: SECRET }, 'litescrape', async (u, init) => {
    calls.push(u)
    assert.equal(init.headers.authorization, `Bearer ${secret}`)
    return Response.json({ status: 'active', remaining_calls: 42, concurrency_limit: 1 })
  })
  assert.deepEqual(calls, ['https://api.litescrape.com/api/keys/status'])
  assert.equal(probe.ok, true)
  assert.ok(!JSON.stringify(probe).includes(secret))
  const network = await testWoProviderKey(pool, { sessionSecret: SECRET }, 'litescrape', async () => {
    throw new Error(secret)
  })
  assert.equal(network.ok, false)
  assert.ok(!JSON.stringify(network).includes(secret))
  const cleared = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/litescrape',
    body: { apiKey: '' }
  })
  assert.equal(cleared.status, 200)
  assert.equal(
    (await woRuntime(pool, { sessionSecret: SECRET, litescrapeApiKey: 'env-test' })).keys.litescrape,
    'env-test'
  )
  assert.equal((await woRuntime(pool, { sessionSecret: SECRET })).keys.litescrape, null)
  assert.equal(normalizeWoOpsSettings({ tripadvisorReviews: false }).tripadvisorReviews, false)
})

test('SerpApi Settings seals its key and checks credits without spending search quota or exposing credentials', async () => {
  const pool = createStandInPool()
  const secret = 'serpapi_test_private_0123456789'
  const saved = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/serpapi',
    body: { apiKey: secret }
  })
  assert.equal(saved.status, 200)
  const facts = await saved.json()
  assert.equal(facts.providers.serpapi.source, 'ops')
  assert.ok(!JSON.stringify(facts).includes(secret))
  assert.equal(
    (await woRuntime(pool, { sessionSecret: SECRET, serpapiApiKey: 'env-test' })).keys.serpapi,
    secret
  )
  const probe = await testWoProviderKey(pool, { sessionSecret: SECRET }, 'serpapi', async (u, init) => {
    const url = new URL(u)
    assert.equal(url.origin + url.pathname, 'https://serpapi.com/account.json')
    assert.equal(url.searchParams.get('api_key'), secret)
    assert.equal(init.redirect, 'error')
    return Response.json({ total_searches_left: 247 })
  })
  assert.equal(probe.ok, true)
  assert.ok(probe.detail.includes('247'))
  assert.ok(!JSON.stringify(probe).includes(secret))
  const exhausted = await testWoProviderKey(pool, { sessionSecret: SECRET }, 'serpapi', async () =>
    Response.json({ total_searches_left: 0 })
  )
  assert.equal(exhausted.status, 'quota_exhausted')
  assert.equal(exhausted.ok, false)
  const invalid = await testWoProviderKey(pool, { sessionSecret: SECRET }, 'serpapi', async () =>
    Response.json({ error: secret }, { status: 401 })
  )
  assert.equal(invalid.ok, false)
  assert.ok(!JSON.stringify(invalid).includes(secret))
  const network = await testWoProviderKey(pool, { sessionSecret: SECRET }, 'serpapi', async () => {
    throw new Error('https://serpapi.com/account.json?api_key=' + secret)
  })
  assert.ok(!JSON.stringify(network).includes(secret))
  const cleared = await requestWo({
    pool,
    method: 'PUT',
    path: '/api/ops/wo/keys/serpapi',
    body: { apiKey: '' }
  })
  assert.equal(cleared.status, 200)
  assert.equal(
    (await woRuntime(pool, { sessionSecret: SECRET, serpapiApiKey: 'env-test' })).keys.serpapi,
    'env-test'
  )
})
