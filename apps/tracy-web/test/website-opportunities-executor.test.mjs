// The Website Opportunities research executor (spec §5): one claim per job across executors, a
// fencing token that stops a stale writer, recovery of an expired lease, the switch pausing a job at
// its next checkpoint, a resumable source, and SSRF refusal in the crawler path. The domain is the
// real subtree with connectors replaced; media bytes are a real PNG through `sharp`.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { APIFY_RUNS_PER_DAY } from 'website-opportunities/src/apify-budget.js'
import {
  createExecutor,
  fairShare,
  mergeCollected,
  mergeProfile
} from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { createPinnedFetch } from 'website-opportunities/src/pinned-fetch.js'
import {
  cancelJob,
  checkpoint,
  claimJob,
  fenced,
  resumeJob,
  StaleLeaseError
} from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }]
let PNG
before(async () => {
  PNG = new Uint8Array(
    await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 40, b: 30 } } })
      .png()
      .toBuffer()
  )
})

async function seed(pool, { candidate } = {}) {
  const account = (await pool.query(`insert into account (email) values ('a@tracy.test') returning id`))
    .rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Pho Ba', 'osm', 'node/1', $2) returning *`,
      [
        account,
        JSON.stringify(
          candidate ?? {
            provider: 'osm',
            providerId: 'node/1',
            name: 'Pho Ba',
            website: 'https://phoba.example/',
            socials: {}
          }
        )
      ]
    )
  ).rows[0]
  const job = (
    await pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id) values ($1, $2, 'research', 'req-00000001') returning *`,
      [account, opp.id]
    )
  ).rows[0]
  return { account, opp, job }
}

/** The real domain, its connectors replaced; `fetchLimited` answers a PNG for every media URL. */
async function domainWith(connectors, { fetchLimited } = {}) {
  const real = await websiteOpportunitiesDomain()
  return {
    ...real,
    connectorsFor: () => connectors,
    fetchLimited:
      fetchLimited ??
      (async (u) => ({ url: u, status: 200, mime: 'image/png', bytes: PNG, truncated: false }))
  }
}

function executor(pool, domain, extra = {}) {
  const put = new Map()
  const ex = createExecutor({
    host: woHost,
    pool,
    loadDomain: async () => domain,
    objects: {
      put: async (key, bytes) => {
        put.set(key, bytes)
        return true
      }
    },
    switchOn: async () => true,
    imageInfo,
    resolve: PUBLIC,
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {} },
    ...extra
  })
  return { ex, put }
}

/** What `woRuntime` answers: keys from `/ops/wo` or env, settings normalized. */
const runtimeOf =
  ({ keys = {}, settings = {} } = {}) =>
  async () => ({
    keys: { google: null, apify: null, firecrawl: null, jina: null, deepseek: null, ...keys },
    settings: normalizeWoOpsSettings(settings)
  })

const blocked = (reason = 'credential_missing') => ({
  available: false,
  reason,
  collect: async () => ({ status: 'blocked', reason, media: [], coverage: { fetched: 0 } })
})

const websiteOk = {
  available: true,
  collect: async () => ({
    source: 'website',
    status: 'complete',
    profile: {
      name: 'Pho Ba',
      bio: 'Noodles since 1990',
      phone: '+84 1',
      links: ['https://www.instagram.com/phoba/']
    },
    pages: [{ url: 'https://phoba.example/', title: 'Pho Ba', text: 'Pho' }],
    media: [
      {
        url: 'https://phoba.example/pho.png',
        kind: 'image',
        sourceUrl: 'https://phoba.example/',
        caption: 'pho dish'
      }
    ],
    coverage: { fetched: 1, total: 1 }
  })
}

const job = async (pool, id) => (await pool.query('select * from wo_job where id = $1', [id])).rows[0]
const sources = async (pool, oppId) =>
  Object.fromEntries(
    (await pool.query('select * from wo_source where opportunity_id = $1', [oppId])).rows.map((r) => [
      r.source,
      r
    ])
  )

test(
  'a job runs every stage: website, a social found on it (blocked without credentials), media, profile, brand',
  opts,
  async () => {
    const { pool } = db
    const { opp, job: queued } = await seed(pool)
    const domain = await domainWith({
      website: websiteOk,
      facebook: blocked(),
      instagram: blocked(),
      tiktok: blocked(),
      youtube: blocked()
    })
    const { ex, put } = executor(pool, domain)
    const { claimed, done } = await ex.tick()
    assert.equal(claimed.id, queued.id)
    await done
    const finished = await job(pool, queued.id)
    assert.equal(finished.state, 'completed', JSON.stringify(finished.last_error))
    assert.equal(finished.stage, 'done')
    const s = await sources(pool, opp.id)
    assert.equal(s.website.status, 'complete')
    assert.equal(s.instagram.ref, 'https://www.instagram.com/phoba')
    assert.equal(s.instagram.status, 'blocked')
    assert.equal(s.instagram.reason, 'credential_missing')
    const media = (await pool.query('select * from wo_media where opportunity_id = $1', [opp.id])).rows
    assert.equal(media.length, 1)
    assert.equal(media[0].status, 'stored')
    assert.equal(media[0].width, 40)
    assert.equal(media[0].height, 30)
    assert.equal(media[0].category, 'food')
    assert.ok(put.has(media[0].object_key))
    assert.match(
      media[0].object_key,
      new RegExp(`^opportunities/${opp.account_id}/${opp.id}/[0-9a-f]{64}\\.png$`)
    )
    const profile = (await pool.query('select * from wo_profile where opportunity_id = $1', [opp.id])).rows[0]
    assert.equal(profile.profile.phone, '+84 1')
    assert.equal(profile.brand.website.origin, 'website')
    assert.equal(profile.brand.website.colors[0].role, 'primary')
    assert.equal(profile.brand.engine.status, 'not_integrated')
    const attempts = (await pool.query('select * from wo_job_attempt where job_id = $1', [queued.id])).rows
    assert.deepEqual(
      attempts.map((a) => a.outcome),
      ['completed']
    )
  }
)

test('two executors racing: exactly one claims the job', opts, async () => {
  const { pool } = db
  await seed(pool)
  const claims = await Promise.all([
    claimJob(pool, 'one', 60_000),
    claimJob(pool, 'two', 60_000),
    claimJob(pool, 'three', 60_000)
  ])
  assert.equal(claims.filter(Boolean).length, 1)
})

test(
  'fencing: after another executor reclaims an expired lease, the old one can no longer write',
  opts,
  async () => {
    const { pool } = db
    const { job: queued } = await seed(pool)
    const first = await claimJob(pool, 'one', 60_000)
    await pool.query(`update wo_job set lease_until = now() - interval '1 second' where id = $1`, [queued.id])
    const second = await claimJob(pool, 'two', 60_000)
    assert.equal(second.id, queued.id)
    assert.equal(Number(second.lease_token), Number(first.lease_token) + 1)
    const stale = { jobId: queued.id, token: String(first.lease_token) }
    assert.equal(await checkpoint(pool, stale, { stage: 'media' }), false)
    await assert.rejects(
      fenced(pool, stale, async () => 'written'),
      StaleLeaseError
    )
    assert.equal(
      await fenced(pool, { jobId: queued.id, token: String(second.lease_token) }, async () => 'written'),
      'written'
    )
    const attempts = (
      await pool.query('select attempt, outcome from wo_job_attempt where job_id = $1 order by attempt', [
        queued.id
      ])
    ).rows
    assert.deepEqual(attempts, [
      { attempt: 1, outcome: 'lease_expired' },
      { attempt: 2, outcome: null }
    ])
  }
)

test('a crashed executor: its expired lease is reclaimed and the job still completes', opts, async () => {
  const { pool } = db
  const { job: queued } = await seed(pool)
  await claimJob(pool, 'dead', 60_000) // claimed, never finished
  await pool.query(`update wo_job set lease_until = now() - interval '1 second' where id = $1`, [queued.id])
  const domain = await domainWith({
    website: websiteOk,
    facebook: blocked(),
    instagram: blocked(),
    tiktok: blocked(),
    youtube: blocked()
  })
  const { ex } = executor(pool, domain)
  const { claimed, done } = await ex.tick()
  assert.equal(claimed.id, queued.id)
  await done
  assert.equal((await job(pool, queued.id)).state, 'completed')
})

test('cancel while running: the executor stops writing and the job stays cancelled', opts, async () => {
  const { pool } = db
  const { account, job: queued } = await seed(pool)
  let release
  const gate = new Promise((r) => (release = r))
  const slowWebsite = {
    available: true,
    collect: async () => {
      await gate
      return websiteOk.collect()
    }
  }
  const domain = await domainWith({
    website: slowWebsite,
    facebook: blocked(),
    instagram: blocked(),
    tiktok: blocked(),
    youtube: blocked()
  })
  const { ex } = executor(pool, domain)
  const { done } = await ex.tick()
  await new Promise((r) => setTimeout(r, 100))
  assert.ok(await cancelJob(pool, account, queued.id))
  release()
  await done
  const after = await job(pool, queued.id)
  assert.equal(after.state, 'cancelled')
  const website = (await pool.query(`select status from wo_source where source = 'website'`)).rows[0]
  assert.equal(website.status, 'pending', 'the stale result was not written')
})

test(
  'switch off mid-job: the next checkpoint pauses with FEATURE_OFF and keeps what was collected; resume finishes',
  opts,
  async () => {
    const { pool } = db
    const { account, opp, job: queued } = await seed(pool)
    let on = true
    const website = {
      available: true,
      collect: async () => {
        const result = await websiteOk.collect()
        on = false // the operator turns the switch off while the website is being collected
        return result
      }
    }
    const domain = await domainWith({
      website,
      facebook: blocked(),
      instagram: blocked(),
      tiktok: blocked(),
      youtube: blocked()
    })
    const { ex } = executor(pool, domain, { switchOn: async () => on })
    await (await ex.tick()).done
    const paused = await job(pool, queued.id)
    assert.equal(paused.state, 'paused')
    assert.deepEqual(paused.last_error, { code: 'FEATURE_OFF' })
    assert.equal((await sources(pool, opp.id)).website.status, 'complete', 'collected data kept')
    on = true
    assert.ok(await resumeJob(pool, account, queued.id))
    await (await ex.tick()).done
    assert.equal((await job(pool, queued.id)).state, 'completed')
  }
)

for (const reason of ['quota', 'timeout'])
  test(
    reason === 'quota'
      ? 'a source that hits its quota pauses the job with its cursor; resume continues from it'
      : 'a timed-out website resumes its cursor without losing root facts or repeating the first crawl',
    opts,
    async () => {
      const { pool } = db
      const { account, opp, job: queued } = await seed(pool)
      const cursors = []
      const website = {
        available: true,
        collect: async (_ref, { cursor }) => {
          cursors.push(cursor)
          if (!cursor)
            return {
              status: 'partial',
              reason,
              cursor: { page: 2 },
              profile: {
                name: 'Observed restaurant',
                bio: 'Observed home page description',
                phone: '+000 observed',
                address: 'Observed street',
                links: ['https://www.instagram.com/observed.restaurant/']
              },
              pages: [{ url: 'https://phoba.example/', title: 'Home', text: 'x' }],
              media: [],
              coverage: { fetched: 1 }
            }
          return {
            status: 'complete',
            profile: {
              name: '',
              bio: null,
              phone: ' ',
              hours: ['Monday: Closed'],
              links: ['https://www.instagram.com/observed.restaurant/', 'https://www.facebook.com/observed']
            },
            media: [],
            pages: [{ url: 'https://phoba.example/menu', title: 'Menu', text: 'y' }],
            coverage: { fetched: 2 }
          }
        }
      }
      const domain = await domainWith({
        website,
        facebook: blocked(),
        instagram: blocked(),
        tiktok: blocked(),
        youtube: blocked()
      })
      const { ex } = executor(pool, domain)
      await (await ex.tick()).done
      const paused = await job(pool, queued.id)
      assert.equal(paused.state, 'paused')
      assert.deepEqual(paused.last_error, { code: 'SOURCE_PAUSED', source: 'website', reason })
      assert.equal((await sources(pool, opp.id)).website.status, 'partial')
      await resumeJob(pool, account, queued.id)
      await (await ex.tick()).done
      assert.equal((await job(pool, queued.id)).state, 'completed')
      assert.deepEqual(cursors, [null, { page: 2 }])
      const collected = (await sources(pool, opp.id)).website.collected
      assert.equal(cursors.length, 2)
      assert.deepEqual(collected.profile, {
        name: 'Observed restaurant',
        bio: 'Observed home page description',
        phone: '+000 observed',
        address: 'Observed street',
        hours: ['Monday: Closed'],
        links: ['https://www.instagram.com/observed.restaurant/', 'https://www.facebook.com/observed']
      })
      assert.deepEqual(
        collected.pages.map((p) => p.title),
        ['Home', 'Menu']
      )
    }
  )

test('cursor continuation preserves observed profile fields while adding evidence and deduplicating links', () => {
  const previous = {
    profile: {
      name: 'Observed restaurant',
      bio: 'Root page description',
      phone: '+000 observed',
      address: 'Observed street',
      links: ['https://fixture.example/menu'],
      hours: ['Monday: Closed']
    }
  }
  const before = structuredClone(previous)
  for (const profile of [{}, null, { name: '', bio: null, phone: ' ', address: undefined, links: [] }])
    assert.deepEqual(mergeCollected(previous, { profile }).profile, previous.profile)
  assert.deepEqual(
    mergeCollected(previous, {
      profile: {
        name: 'A later conflicting name',
        bio: 'A later description',
        phone: '+111 later',
        address: 'A later address',
        email: 'observed@fixture.example',
        hours: ['Tuesday: Closed'],
        links: ['https://fixture.example/menu', 'https://fixture.example/booking']
      }
    }).profile,
    {
      ...previous.profile,
      email: 'observed@fixture.example',
      links: ['https://fixture.example/menu', 'https://fixture.example/booking']
    }
  )
  assert.deepEqual(previous, before)
  assert.deepEqual(mergeCollected({}, { profile: { name: 'A new crawl' } }).profile, { name: 'A new crawl' })
})

test(
  'SSRF: a crawler refused by the URL guard is a blocked source; a media URL on a private address is never fetched',
  opts,
  async () => {
    const { pool } = db
    const { opp, job: queued } = await seed(pool)
    const real = await websiteOpportunitiesDomain()
    const fetched = []
    const website = {
      available: true,
      collect: async () => ({
        status: 'complete',
        media: [{ url: 'http://internal.example/secret.png', kind: 'image' }],
        coverage: { fetched: 1 }
      })
    }
    const domain = {
      ...real,
      connectorsFor: () => ({
        website,
        facebook: {
          available: true,
          collect: async (ref, o, deps) => real.fetchLimited('http://10.0.0.1/', deps)
        },
        instagram: blocked(),
        tiktok: blocked(),
        youtube: blocked()
      })
    }
    await pool.query(
      `insert into wo_source (opportunity_id, source, ref) values ($1, 'facebook', 'https://facebook.com/phoba')`,
      [opp.id]
    )
    const { ex } = executor(pool, domain, {
      resolve: async () => [{ address: '10.0.0.7', family: 4 }],
      fetchImpl: async (u) => {
        fetched.push(u)
        return new Response(PNG)
      }
    })
    await (await ex.tick()).done
    assert.equal((await job(pool, queued.id)).state, 'completed')
    const s = await sources(pool, opp.id)
    assert.equal(s.facebook.status, 'blocked')
    assert.equal(s.facebook.reason, 'url_blocked')
    const media = (
      await pool.query('select status, reason from wo_media where opportunity_id = $1', [opp.id])
    ).rows
    assert.deepEqual(media, [{ status: 'reference', reason: 'url_blocked' }])
    assert.deepEqual(fetched, [], 'nothing private was dialled')
  }
)

test(
  'a picture whose large copy does not answer is stored from its fallback copy, never left as a reference',
  opts,
  async () => {
    const { pool } = db
    const { opp, job: queued } = await seed(pool)
    const real = await websiteOpportunitiesDomain()
    const fetched = []
    const website = {
      available: true,
      collect: async () => ({
        status: 'complete',
        media: [
          {
            url: 'https://photos.example/large.jpg',
            fallbackUrl: 'https://photos.example/small.jpg',
            kind: 'image'
          },
          {
            url: 'https://photos.example/gone.jpg',
            fallbackUrl: 'https://photos.example/gone-too.jpg',
            kind: 'image'
          }
        ],
        coverage: { fetched: 1 }
      })
    }
    const domain = {
      ...real,
      connectorsFor: () => ({
        website,
        facebook: blocked(),
        instagram: blocked(),
        tiktok: blocked(),
        youtube: blocked()
      })
    }
    const { ex } = executor(pool, domain, {
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      fetchImpl: async (u) => {
        fetched.push(String(u))
        return String(u).endsWith('/small.jpg') ? new Response(PNG) : new Response('nope', { status: 404 })
      }
    })
    await (await ex.tick()).done
    assert.equal((await job(pool, queued.id)).state, 'completed')
    const media = (
      await pool.query(
        'select status, reason, source_url from wo_media where opportunity_id = $1 order by source_url',
        [opp.id]
      )
    ).rows
    assert.deepEqual(media, [
      { status: 'reference', reason: 'download_failed', source_url: 'https://photos.example/gone.jpg' },
      { status: 'stored', reason: null, source_url: 'https://photos.example/large.jpg' }
    ])
    assert.deepEqual(fetched, [
      'https://photos.example/large.jpg',
      'https://photos.example/small.jpg',
      'https://photos.example/gone.jpg',
      'https://photos.example/gone-too.jpg'
    ])
  }
)

test(
  "a Wix picture is stored from its original, and from the crawler's copy when the original is not usable",
  opts,
  async () => {
    const { pool } = db
    const { opp, job: queued } = await seed(pool)
    const real = await websiteOpportunitiesDomain()
    const shrunk = (id) =>
      `https://static.wixstatic.com/media/${id}~mv2.jpg/v1/fit/w_480,h_320,q_90/${id}~mv2.jpg`
    const original = (id) => `https://static.wixstatic.com/media/${id}~mv2.jpg`
    const unknown = 'https://images.example.test/media/plain~mv2.jpg/v1/fit/w_480/plain~mv2.jpg'
    // The crawler's own reading of a page decides the candidates, as in a real research.
    const page = real.extractPage(
      `<html><body>${['good', 'html', 'huge'].map((id) => `<img src="${shrunk(id)}">`).join('')}<img src="${unknown}"></body></html>`,
      'https://wix-site.test/'
    )
    const website = {
      available: true,
      collect: async () => ({
        status: 'complete',
        media: page.images.map((image) => ({ ...image, kind: 'image', sourceUrl: page.url })),
        coverage: { fetched: 1 }
      })
    }
    const domain = {
      ...real,
      connectorsFor: () => ({
        website,
        facebook: blocked(),
        instagram: blocked(),
        tiktok: blocked(),
        youtube: blocked()
      })
    }
    const sharp = (await import('sharp')).default
    const picture = (n) =>
      sharp({ create: { width: 8, height: 8, channels: 3, background: { r: n * 40, g: 90, b: 30 } } })
        .png()
        .toBuffer()
    const bodies = new Map([
      [original('good'), await picture(1)],
      [shrunk('html'), await picture(2)],
      [shrunk('huge'), await picture(3)],
      [unknown, await picture(4)]
    ])
    const fetched = []
    const { ex } = executor(pool, domain, {
      resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      fetchImpl: async (u) => {
        const url = String(u)
        fetched.push(url)
        if (url === original('html')) return new Response('<html>Not found</html>')
        if (url === original('huge')) return new Response(new Uint8Array(26 * 1024 * 1024))
        return bodies.has(url) ? new Response(bodies.get(url)) : new Response('nope', { status: 404 })
      }
    })
    await (await ex.tick()).done
    assert.equal((await job(pool, queued.id)).state, 'completed')
    assert.deepEqual(fetched, [
      original('good'),
      original('html'),
      shrunk('html'),
      original('huge'),
      shrunk('huge'),
      unknown
    ])
    const media = (
      await pool.query(
        `select status, source_url, labels->>'fetchedFrom' as fetched_from from wo_media
         where opportunity_id = $1 order by source_url`,
        [opp.id]
      )
    ).rows
    assert.deepEqual(media, [
      { status: 'stored', source_url: unknown, fetched_from: null },
      { status: 'stored', source_url: original('good'), fetched_from: null },
      { status: 'stored', source_url: original('html'), fetched_from: shrunk('html') },
      { status: 'stored', source_url: original('huge'), fetched_from: shrunk('huge') }
    ])
  }
)

test(
  'pinned fetch: a name the guard saw as public but that connects to loopback is refused',
  opts,
  async (t) => {
    const server = createServer((_req, res) => res.end('internal'))
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    t.after(() => server.close())
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
    const { isBlockedAddress } = await websiteOpportunitiesDomain()
    const rebinding = createPinnedFetch({
      isBlockedAddress: async () => isBlockedAddress,
      lookup: (_host, options, cb) =>
        options?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)
    })
    await assert.rejects(rebinding(`http://public.example:${port}/`), (e) => e.code === 'URL_BLOCKED')
    // The same server reached through a lookup that is allowed answers normally.
    const open = createPinnedFetch({
      isBlockedAddress: async () => () => false,
      lookup: (_host, options, cb) =>
        options?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)
    })
    const res = await open(`http://public.example:${port}/`)
    assert.equal(await res.text(), 'internal')
  }
)

test(
  "the account's Apify day is spent: the job pauses with quota before any paid run, and resumes later",
  opts,
  async () => {
    const { pool } = db
    const { account, opp, job: queued } = await seed(pool)
    let paidRuns = 0
    const instagram = {
      available: true,
      collect: async () => {
        paidRuns++
        return { source: 'instagram', status: 'complete', media: [], posts: [], coverage: { fetched: 0 } }
      }
    }
    const domain = await domainWith({
      website: websiteOk,
      facebook: blocked(),
      instagram,
      tiktok: blocked(),
      youtube: blocked()
    })
    const day = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000)
    await pool.query(`insert into rate_bucket (bucket, window_start, count) values ($1, $2, $3)`, [
      `wo:apify:${account}`,
      day,
      APIFY_RUNS_PER_DAY
    ])
    const { ex } = executor(pool, domain, { runtime: runtimeOf({ keys: { apify: 'apify-test' } }) })
    await (await ex.tick()).done
    const paused = await job(pool, queued.id)
    assert.equal(paused.state, 'paused')
    assert.deepEqual(paused.last_error, { code: 'SOURCE_PAUSED', source: 'instagram', reason: 'quota' })
    assert.equal(paidRuns, 0, 'no paid run past the day')
    assert.equal((await sources(pool, opp.id)).website.status, 'complete', 'the free website is kept')
    await pool.query(`delete from rate_bucket where bucket = $1`, [`wo:apify:${account}`])
    assert.ok(await resumeJob(pool, account, queued.id))
    await (await ex.tick()).done
    assert.equal((await job(pool, queued.id)).state, 'completed')
    assert.equal(paidRuns, 1)
  }
)

test('media budget: the website first, then each source in turn, so one feed cannot take it all', () => {
  const item = (source, i) => ({ source, url: `https://${source}.test/${i}.jpg` })
  const items = [
    ...Array.from({ length: 10 }, (_, i) => item('facebook', i)),
    ...Array.from({ length: 3 }, (_, i) => item('website', i)),
    ...Array.from({ length: 10 }, (_, i) => item('instagram', i))
  ]
  const picked = fairShare(items, 7)
  assert.deepEqual(
    picked.map((m) => m.source),
    ['website', 'instagram', 'facebook', 'website', 'instagram', 'facebook', 'website']
  )
})

test('a pasted URL: its hostname placeholder never wins the name over the site’s own', () => {
  const profile = mergeProfile(
    { provider: 'url', name: 'www.thelarchhouse.example', candidate: { name: 'www.thelarchhouse.example' } },
    [
      {
        source: 'website',
        ref: 'https://www.thelarchhouse.example/',
        collected: { profile: { name: 'The Larch House' } }
      }
    ]
  )
  assert.equal(profile.name, 'The Larch House')
  assert.deepEqual(profile.conflicts ?? [], [])
  // a name the person typed with the link is theirs and comes first (pilot 24/10/2026)
  const typed = mergeProfile(
    { provider: 'url', name: 'Casa Tortilla No. 1', candidate: { name: 'Casa Tortilla No. 1' } },
    [
      {
        source: 'website',
        ref: 'https://www.lastortas1.example/',
        collected: { profile: { name: 'Casa Tortilla No. 1 | Taquerias in New York City' } }
      }
    ]
  )
  assert.equal(typed.name, 'Casa Tortilla No. 1')
})

test('the profile carries the email the restaurant’s own website publishes, with its source', () => {
  const profile = mergeProfile({ provider: 'url', name: 'x', candidate: {} }, [
    {
      source: 'website',
      ref: 'https://bistro.test/',
      collected: { profile: { name: 'Bistro', email: 'hello@bistro.test' } }
    }
  ])
  assert.equal(profile.email, 'hello@bistro.test')
  assert.deepEqual(profile.provenance.email, { source: 'website' })
})

test('the profile carries the website’s hours, menu and booking links into the brief, dated', () => {
  const profile = mergeProfile({ provider: 'url', name: 'x', candidate: {} }, [
    {
      source: 'website',
      ref: 'https://bistro.test/',
      updated_at: new Date('2026-10-18T00:00:00Z'),
      collected: {
        profile: { name: 'Bistro', hours: ['Mo-Su 07:00-22:00'], cuisine: ['European'] },
        menus: [{ url: 'https://bistro.test/menu' }],
        bookings: [{ url: 'https://bistro.test/book-online' }]
      }
    }
  ])
  assert.deepEqual(profile.hours, ['Mo-Su 07:00-22:00'])
  assert.deepEqual(profile.cuisine, ['European'])
  assert.deepEqual(profile.menus, [
    { url: 'https://bistro.test/menu', source: 'website', seenAt: '2026-10-18T00:00:00.000Z' }
  ])
  assert.deepEqual(profile.booking, [
    { url: 'https://bistro.test/book-online', verified: true, source: 'website' }
  ])
  assert.deepEqual(profile.hoursBySource, { website: ['Mo-Su 07:00-22:00'] })
  assert.equal('hoursConflict' in profile, false)
})

test('the profile keeps every source’s hours and says when two disagree', () => {
  const row = (source, hours) => ({
    source,
    ref: `https://${source}.test/`,
    collected: { profile: { hours } }
  })
  const agree = mergeProfile({ provider: 'url', name: 'x', candidate: {} }, [
    row('website', ['Mo-Su 09:00-17:00']),
    row('facebook', ['Monday: 9:00 AM – 5:00 PM'])
  ])
  assert.equal('hoursConflict' in agree, false)
  const differ = mergeProfile({ provider: 'url', name: 'x', candidate: {} }, [
    row('website', ['Mo-Su 09:00-17:00']),
    row('facebook', ['Mo-Su 09:00-12:00'])
  ])
  assert.deepEqual(differ.hoursBySource, {
    website: ['Mo-Su 09:00-17:00'],
    facebook: ['Mo-Su 09:00-12:00']
  })
  assert.equal(differ.hoursConflict, true)
})

test(
  'a source switched off in /ops/wo is not collected: skipped, not blocked, and the job completes',
  opts,
  async () => {
    const { pool } = db
    const { opp, job: queued } = await seed(pool)
    let instagramRuns = 0
    const instagram = {
      available: true,
      collect: async () => {
        instagramRuns++
        return { source: 'instagram', status: 'complete', media: [], posts: [], coverage: { fetched: 0 } }
      }
    }
    const domain = await domainWith({
      website: websiteOk,
      facebook: blocked(),
      instagram,
      tiktok: blocked(),
      youtube: blocked()
    })
    const { ex } = executor(pool, domain, {
      runtime: runtimeOf({
        keys: { apify: 'apify-test' },
        settings: { autoCollectSources: { instagram: false } }
      })
    })
    await (await ex.tick()).done
    assert.equal((await job(pool, queued.id)).state, 'completed')
    const s = await sources(pool, opp.id)
    assert.equal(instagramRuns, 0)
    assert.equal(s.instagram.status, 'skipped')
    assert.equal(s.instagram.reason, 'switched_off')
    assert.equal(s.website.status, 'complete')
  }
)

const PSI_ANSWER = {
  lighthouseResult: {
    finalUrl: 'https://phoba.example/',
    categories: { performance: { score: 0.87 }, seo: { score: 0.92 } },
    audits: { 'largest-contentful-paint': { numericValue: 2412.6 } }
  }
}

test(
  'PageSpeed: a website with a Google key is measured once, mobile, and the facts land on the profile',
  opts,
  async () => {
    const { pool } = db
    const { opp, job: queued } = await seed(pool)
    const asked = []
    const domain = await domainWith({
      website: websiteOk,
      facebook: blocked(),
      instagram: blocked(),
      tiktok: blocked(),
      youtube: blocked()
    })
    const { ex } = executor(pool, domain, {
      runtime: runtimeOf({ keys: { google: 'AIza-test' } }),
      apiFetch: async (u) => {
        asked.push(String(u))
        return Response.json(PSI_ANSWER)
      }
    })
    await (await ex.tick()).done
    assert.equal((await job(pool, queued.id)).state, 'completed')
    assert.equal(asked.length, 1)
    const q = new URL(asked[0])
    assert.equal(
      q.origin + q.pathname,
      'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed'
    )
    assert.equal(q.searchParams.get('url'), 'https://phoba.example/')
    assert.equal(q.searchParams.get('strategy'), 'mobile')
    assert.deepEqual(q.searchParams.getAll('category'), ['performance', 'seo'])
    assert.equal(q.searchParams.get('key'), 'AIza-test')
    const profile = (await pool.query('select profile from wo_profile where opportunity_id = $1', [opp.id]))
      .rows[0].profile
    assert.equal(profile.pageSpeed.performance, 87)
    assert.equal(profile.pageSpeed.seo, 92)
    assert.equal(profile.pageSpeed.lcpMs, 2413)
    assert.equal(profile.pageSpeed.https, true)
    assert.ok(!Number.isNaN(Date.parse(profile.pageSpeed.checkedAt)))
  }
)

test(
  'PageSpeed never fails the job, and is not called when switched off or without a Google key',
  opts,
  async () => {
    const { pool } = db
    const domain = await domainWith({
      website: websiteOk,
      facebook: blocked(),
      instagram: blocked(),
      tiktok: blocked(),
      youtube: blocked()
    })
    const cases = [
      {
        runtime: runtimeOf({ keys: { google: 'AIza-test' } }),
        answer: () => Response.json({ error: { message: 'quota' } }, { status: 429 })
      },
      {
        runtime: runtimeOf({ keys: { google: 'AIza-test' } }),
        answer: () => {
          throw new Error('network down')
        }
      },
      {
        runtime: runtimeOf({ keys: { google: 'AIza-test' }, settings: { pageSpeedCheckEnabled: false } }),
        answer: () => Response.json(PSI_ANSWER)
      },
      { runtime: runtimeOf(), answer: () => Response.json(PSI_ANSWER) }
    ]
    const calls = []
    for (const [i, c] of cases.entries()) {
      await pool.query('delete from account')
      const { opp, job: queued } = await seed(pool)
      const { ex } = executor(pool, domain, {
        runtime: c.runtime,
        apiFetch: async () => {
          calls.push(i)
          return c.answer()
        }
      })
      await (await ex.tick()).done
      assert.equal((await job(pool, queued.id)).state, 'completed', `case ${i}`)
      const profile = (await pool.query('select profile from wo_profile where opportunity_id = $1', [opp.id]))
        .rows[0].profile
      assert.equal(profile.pageSpeed, undefined, `case ${i}`)
      assert.equal(profile.phone, '+84 1', `case ${i}: the rest of the profile is kept`)
    }
    assert.deepEqual(calls, [0, 1])
  }
)

// ── stored Facebook photos get their original on a later research ───────────────────────────────

const FB_SMALL = 'https://scontent.test/v/1_2_3_n.jpg?ctp=s590x590&cstp=mx1280x720'
const FB_LARGE = 'https://scontent.test/v/1_2_3_n.jpg?ctp=s1280x720&cstp=mx1280x720'
const FB_PHOTO_PAGE = `<html><script>{"uri":"${FB_LARGE}","width":1280,"height":720}</script></html>`

test(
  'a later research swaps a stored feed-size Facebook photo for its original (no Apify run), once, outside the media budget',
  opts,
  async () => {
    const { pool } = db
    const {
      account,
      opp,
      job: queued
    } = await seed(pool, {
      candidate: {
        provider: 'osm',
        providerId: 'node/1',
        name: 'Pho Ba',
        website: 'https://phoba.example/',
        socials: { facebook: 'https://www.facebook.com/phoba' }
      }
    })
    // Distinct bytes per picture: the same bytes twice are one `wo_media` row (unique sha256).
    const png = async (width, height) =>
      new Uint8Array(
        await sharp({ create: { width, height, channels: 3, background: { r: 20, g: 90, b: 140 } } })
          .png()
          .toBuffer()
      )
    const SMALL = await png(60, 45)
    const BIG = await png(1280, 720)
    const facebookOk = {
      available: true,
      collect: async () => ({
        source: 'facebook',
        status: 'complete',
        profile: { name: 'Pho Ba' },
        posts: [],
        media: [
          {
            url: FB_SMALL,
            kind: 'image',
            width: 590,
            height: 590,
            photoId: '1044400055501296',
            sourceUrl: 'https://www.facebook.com/phoba/posts/1',
            postId: '1'
          }
        ],
        coverage: { fetched: 1 }
      })
    }
    const domain = await domainWith(
      {
        website: websiteOk,
        facebook: facebookOk,
        instagram: blocked(),
        tiktok: blocked(),
        youtube: blocked()
      },
      {
        fetchLimited: async (u) => ({
          url: u,
          status: 200,
          mime: 'image/png',
          bytes: u === FB_LARGE ? BIG : u === FB_SMALL ? SMALL : PNG,
          truncated: false
        })
      }
    )
    // The public photo page answers only from the second research on (the first time it is down).
    let pageUp = false
    const pageReads = []
    const { ex } = executor(pool, domain, {
      fetchImpl: async (url) => {
        pageReads.push(url)
        if (!pageUp) throw new Error('facebook unreachable')
        return new Response(FB_PHOTO_PAGE, { status: 200, headers: { 'content-type': 'text/html' } })
      }
    })
    const rows = async () =>
      (
        await pool.query(
          'select source, source_url, status, reason, width from wo_media where opportunity_id = $1 order by source, width',
          [opp.id]
        )
      ).rows
    const research = async (requestId) => {
      const row = (
        await pool.query(
          `insert into wo_job (account_id, opportunity_id, kind, request_id) values ($1, $2, 'research', $3) returning *`,
          [account, opp.id, requestId]
        )
      ).rows[0]
      const { claimed, done } = await ex.tick()
      assert.equal(claimed.id, row.id)
      await done
      const finished = await job(pool, row.id)
      assert.equal(finished.state, 'completed', JSON.stringify(finished.last_error))
      return finished
    }

    // Research 1: the feed copy is stored at feed size (its page could not be read).
    {
      const { claimed, done } = await ex.tick()
      assert.equal(claimed.id, queued.id)
      await done
      assert.equal((await job(pool, queued.id)).state, 'completed')
    }
    assert.deepEqual(
      (await rows()).filter((r) => r.source === 'facebook'),
      [{ source: 'facebook', source_url: FB_SMALL, status: 'stored', reason: null, width: 60 }]
    )
    assert.ok(pageReads.some((u) => u.startsWith('https://www.facebook.com/photo/?fbid=')))

    // Research 2: nothing new is collected (the source is complete), yet the stored photo is swapped.
    pageUp = true
    const second = await research('req-00000002')
    const after = await rows()
    assert.deepEqual(
      after.filter((r) => r.source === 'facebook'),
      [
        { source: 'facebook', source_url: FB_SMALL, status: 'reference', reason: 'superseded', width: 60 },
        { source: 'facebook', source_url: FB_LARGE, status: 'stored', reason: null, width: 1280 }
      ]
    )
    assert.equal(after.filter((r) => r.source === 'website').length, 1, 'the website picture is untouched')
    assert.equal(second.progress?.media?.upgraded, 1)
    const fb = (await sources(pool, opp.id)).facebook
    assert.equal(fb.status, 'complete')
    // Counted across researches: the page read that failed in research 1, the one that answered in 2.
    assert.deepEqual(fb.coverage.photoPages, { tried: 2, upgraded: 1 })
    assert.equal(fb.collected.media[0].url, FB_LARGE)
    assert.equal(fb.collected.media[0].fallbackUrl, FB_SMALL)

    // Research 3: nothing to swap, nothing read, nothing counted twice.
    const reads = pageReads.length
    const third = await research('req-00000003')
    assert.equal(pageReads.length, reads)
    assert.equal(third.progress?.media?.upgraded, undefined)
    assert.equal((await rows()).length, after.length)
    assert.deepEqual((await sources(pool, opp.id)).facebook.coverage.photoPages, { tried: 2, upgraded: 1 })
  }
)

// B8 (ai-flow audit 19/10/2026): every restart during a synchronous Apify run reclaimed the job and paid again.
test(
  'a job whose lease ran out twice is not reclaimed a third time: it fails with its reason',
  opts,
  async () => {
    const { pool } = db
    const { job: queued } = await seed(pool)
    const expire = () =>
      pool.query(`update wo_job set lease_until = now() - interval '1 second' where id = $1`, [queued.id])
    assert.ok(await claimJob(pool, 'one', 60_000))
    await expire()
    assert.ok(await claimJob(pool, 'two', 60_000), 'one restart is reclaimed')
    await expire()
    assert.equal(await claimJob(pool, 'three', 60_000), null)
    const row = await job(pool, queued.id)
    assert.equal(row.state, 'failed')
    assert.equal(row.last_error.code, 'LEASE_EXPIRED_TOO_OFTEN')
    assert.equal(row.lease_until, null)
    const attempts = (
      await pool.query('select attempt, outcome from wo_job_attempt where job_id = $1 order by attempt', [
        queued.id
      ])
    ).rows
    assert.deepEqual(attempts, [
      { attempt: 1, outcome: 'lease_expired' },
      { attempt: 2, outcome: 'lease_expired' }
    ])
  }
)

// B8 remainder (ai-flow audit 19/10/2026): the run id of a paid Apify run is recorded on the job before the
// wait, so a holder that died during the run leaves it to the next one, which reads it and pays nothing more.
test(
  'a restart during a paid Apify run: the next holder reads the recorded run instead of starting another',
  opts,
  async () => {
    const { pool } = db
    const { opp, job: queued } = await seed(pool)
    await pool.query(
      `insert into wo_source (opportunity_id, source, ref) values ($1, 'instagram', 'https://www.instagram.com/phoba/')`,
      [opp.id]
    )
    const runtime = runtimeOf({ keys: { apify: 'apify-test' } })
    const started = []
    const read = []
    const hang = new Promise(() => {})
    const instagram = (dies) => ({
      available: true,
      collect: async (ref, o, deps) => {
        if (o.run) {
          read.push(o.run)
          return {
            source: 'instagram',
            status: 'complete',
            posts: [{ id: 'p1' }],
            media: [],
            coverage: { fetched: 1 }
          }
        }
        const run = { source: 'instagram', offset: 0, id: `run-${started.length + 1}`, datasetId: 'ds-1' }
        started.push(run.id)
        await deps.onRun(run)
        if (dies) return hang // the process restarts here, mid-run
        return { source: 'instagram', status: 'complete', media: [], coverage: { fetched: 0 } }
      }
    })
    const domainOf = async (dies) =>
      domainWith({
        website: websiteOk,
        facebook: blocked(),
        instagram: instagram(dies),
        tiktok: blocked(),
        youtube: blocked()
      })
    const first = executor(pool, await domainOf(true), { runtime, heartbeatMs: 3_600_000 })
    void first.ex.tick()
    for (let i = 0; i < 200 && started.length === 0; i += 1) await new Promise((r) => setTimeout(r, 10))
    for (let i = 0; i < 200; i += 1) {
      if ((await job(pool, queued.id)).progress?.apifyRun) break
      await new Promise((r) => setTimeout(r, 10))
    }
    assert.deepEqual((await job(pool, queued.id)).progress.apifyRun, {
      source: 'instagram',
      offset: 0,
      id: 'run-1',
      datasetId: 'ds-1'
    })
    await pool.query(`update wo_job set lease_until = now() - interval '1 second' where id = $1`, [queued.id])

    const second = executor(pool, await domainOf(false), { runtime })
    const { claimed, done } = await second.ex.tick()
    assert.equal(claimed.id, queued.id)
    await done
    assert.deepEqual(started, ['run-1'], 'one paid run, not two')
    assert.deepEqual(
      read.map((r) => r.id),
      ['run-1']
    )
    const row = await job(pool, queued.id)
    assert.equal(row.state, 'completed')
    assert.equal(row.progress.apifyRun, null, 'the record is spent once its answer is saved')
    assert.equal((await sources(pool, opp.id)).instagram.status, 'complete')
  }
)

test('mergeProfile keeps the schema.org type the business’s own website states', () => {
  const profile = mergeProfile({ provider: 'url', name: 'x', candidate: {} }, [
    {
      source: 'website',
      ref: 'https://smiles.test/',
      status: 'complete',
      collected: { profile: { name: 'Elite Smiles', businessType: 'Dentist' } }
    }
  ])
  assert.equal(profile.businessType, 'Dentist')
  assert.equal(mergeProfile({ provider: 'url', name: 'x', candidate: {} }, []).businessType, undefined)
})
