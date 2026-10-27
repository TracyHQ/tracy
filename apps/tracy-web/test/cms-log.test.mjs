// Edits made in the CMS admin, outside Tracy (site changes P2): `sites/cms-log.js` pulls the host's
// `cms-log-pull` answer into `site_cms_change`, keeps one cursor per site, and serves the rows as
// `outside-cms` items. The host side (adapters, mapping) is tested in apps/tracy-host/test.
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { Hono } from 'hono'
import { hostJobRunner, sweepCmsLogTick } from '../src/cron.js'
import { mountCmsLog, pullCmsLog, readCmsLog, sitesDueForCmsLog, sweepCmsLogs } from '../src/sites/cms-log.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
const skip = !process.env.TEST_DATABASE_URL

const SITE = { site_key: 'scjo1002.tracy.test', label: 'scjo1002', host: 'local', platform: 'joomla' }

const entry = (n, over = {}) => ({
  cursorKey: `${n}@2026-10-01T19:${String(n).padStart(2, '0')}:00Z`,
  occurredAt: `2026-10-01T19:${String(n).padStart(2, '0')}:00Z`,
  actor: { id: '546', name: 'minh' },
  resourceType: 'article',
  resourceId: '7',
  resourceTitle: 'About us',
  op: 'update',
  ...over
})

/** A `runJob` answering `answers` in turn, recording each input. */
function fakeHost(...answers) {
  const calls = []
  const runJob = async (site, input) => {
    calls.push({ site: site.label, ...input })
    const next = answers.length > 1 ? answers.shift() : answers[0]
    if (next instanceof Error) return { ok: false, reason: next.message }
    return { ok: true, output: `noise\n${JSON.stringify(next)}` }
  }
  return { runJob, calls }
}

async function seedSite(pool, site = SITE) {
  await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
    site.site_key,
    site.label,
    site.host,
    site.platform
  ])
}

describe('cms log', { skip }, () => {
  before(db.open)
  beforeEach(db.reset)
  after(db.close)

  test('a pull stores each admin entry once and moves the cursor; the same pull again adds nothing', async () => {
    const { pool } = db
    await seedSite(pool)
    const answer = { entries: [entry(1), entry(2)], cursor: '117', enabled: true, reset: false }
    const host = fakeHost(answer, { ...answer, entries: [entry(2)], cursor: '117' })
    const first = await pullCmsLog(pool, SITE, { runJob: host.runJob })
    assert.deepEqual(first, { pulled: 2, cursor: '117', enabled: true })
    assert.deepEqual(host.calls[0], {
      site: 'scjo1002',
      kind: 'cms-log-pull',
      platform: 'joomla',
      cursor: ''
    })
    const second = await pullCmsLog(pool, SITE, { runJob: host.runJob })
    assert.deepEqual(second, { pulled: 0, cursor: '117', enabled: true }, 'a row seen twice is stored once')
    assert.equal(host.calls[1].cursor, '117', 'the next pull starts where the last one stopped')
    const { rows } = await pool.query('select count(*)::int as n from site_cms_change')
    assert.equal(rows[0].n, 2)
  })

  test('a failed pull keeps the cursor and stores the reason; nothing is invented', async () => {
    const { pool } = db
    await seedSite(pool)
    const host = fakeHost(
      { entries: [entry(1)], cursor: '5', enabled: true, reset: false },
      new Error('timeout')
    )
    await pullCmsLog(pool, SITE, { runJob: host.runJob })
    const failed = await pullCmsLog(pool, SITE, { runJob: host.runJob })
    assert.equal(failed.pulled, 0)
    assert.equal(failed.error, 'timeout')
    assert.equal(failed.cursor, '5')
    const { coverage } = await readCmsLog(pool, SITE)
    assert.equal(coverage.cmsLog.lastError, 'timeout')
    assert.equal(coverage.cmsLog.enabled, true)
  })

  test('a log the CMS keeps switched off reads enabled=false with its reason in coverage', async () => {
    const { pool } = db
    await seedSite(pool)
    const host = fakeHost({ entries: [], cursor: '0', enabled: false, reason: 'log-disabled', reset: false })
    const result = await pullCmsLog(pool, SITE, { runJob: host.runJob })
    assert.deepEqual(result, { pulled: 0, cursor: '0', enabled: false, reason: 'log-disabled' })
    const { coverage } = await readCmsLog(pool, SITE)
    assert.equal(coverage.cmsLog.source, 'joomla-action-log')
    assert.equal(coverage.cmsLog.enabled, false)
    assert.equal(coverage.cmsLog.reason, 'log-disabled')
    assert.ok(coverage.cmsLog.lastPulledAt)
  })

  test('a slow pull that finishes after a newer one does not move the cursor back', async () => {
    const { pool } = db
    await seedSite(pool)
    let release
    const gate = new Promise((r) => (release = r))
    let markStarted
    const started = new Promise((r) => (markStarted = r))
    const slow = async () => {
      markStarted()
      await gate
      return {
        ok: true,
        output: JSON.stringify({ entries: [entry(1)], cursor: '1', enabled: true, reset: false })
      }
    }
    const fast = fakeHost({ entries: [entry(1), entry(2)], cursor: '2', enabled: true, reset: false })
    const pending = pullCmsLog(pool, SITE, { runJob: slow })
    // Both pulls must read the same starting cursor before the newer answer is stored.
    await started
    await pullCmsLog(pool, SITE, { runJob: fast.runJob })
    release()
    await pending
    const { rows } = await pool.query('select cursor from site_cms_log_cursor')
    assert.equal(rows[0].cursor, '2')
  })

  test('E5.1c: the files an upload wrote are kept with its row; a row with none keeps null', async () => {
    const { pool } = db
    const files = ['wp-content/uploads/2026/10/a.png', 'wp-content/uploads/2026/10/a-150x150.png']
    const host = fakeHost({
      entries: [entry(1, { resourceType: 'attachment', resourceId: '88', op: 'upload', files }), entry(2)],
      cursor: '2',
      enabled: true,
      reset: false
    })
    await pullCmsLog(pool, SITE, { runJob: host.runJob })
    const { rows } = await pool.query('select resource_type, files from site_cms_change order by id')
    assert.deepEqual(
      rows.map((r) => r.files),
      [files, null]
    )
  })

  test('a site with no CMS log adapter (no platform yet) is not pulled', async () => {
    const { pool } = db
    const host = fakeHost({ entries: [], cursor: '0', enabled: true, reset: false })
    const result = await pullCmsLog(pool, { ...SITE, platform: null }, { runJob: host.runJob })
    assert.equal(result.pulled, 0)
    assert.equal(result.enabled, false)
    assert.equal(result.reason, 'unsupported')
    assert.equal(host.calls.length, 0)
  })

  test('emdash: the publish-state snapshot the host answers is kept beside the cursor and sent back on the next pull', async () => {
    const { pool } = db
    const site = { site_key: 'c1em1004.tracy.test', label: 'c1em1004', host: 'local', platform: 'emdash' }
    await seedSite(pool, site)
    const state1 = { w: '2026-10-04T13:20:00.000Z', e: { 'posts/01DRAFT': ['draft', null, null] } }
    const state2 = { w: '2026-10-04T13:25:00.000Z', e: {} }
    const publish = entry(9, {
      cursorKey: 'state:2026-10-04T13:23:43.017Z:posts/01DRAFT:publish',
      occurredAt: '2026-10-04T13:23:43.017Z',
      actor: null,
      resourceType: 'posts',
      resourceId: '01DRAFT',
      op: 'publish',
      changeType: 'entry-state:publish'
    })
    const host = fakeHost(
      { entries: [], cursor: '', enabled: true, reset: false, state: state1 },
      { entries: [publish], cursor: '', enabled: true, reset: false, state: state2 },
      // An older host answers no state: the snapshot stays as it was.
      { entries: [], cursor: '', enabled: true, reset: false }
    )
    await pullCmsLog(pool, site, { runJob: host.runJob })
    assert.equal(host.calls[0].state, null, 'no snapshot yet: the host takes one')
    const second = await pullCmsLog(pool, site, { runJob: host.runJob })
    assert.deepEqual(host.calls[1].state, state1)
    assert.equal(second.pulled, 1)
    await pullCmsLog(pool, site, { runJob: host.runJob })
    assert.deepEqual(host.calls[2].state, state2)
    await pullCmsLog(pool, site, { runJob: host.runJob })
    assert.deepEqual(host.calls[3].state, state2, 'an answer with no state leaves the snapshot alone')
    const { rows } = await pool.query(
      "select op, cms_actor, change_type from site_cms_change where site_key = 'c1em1004.tracy.test'"
    )
    assert.deepEqual(rows, [{ op: 'publish', cms_actor: null, change_type: 'entry-state:publish' }])
  })

  test('emdash: a slow pull that finishes after a newer one does not put its older snapshot back', async () => {
    const { pool } = db
    const site = { site_key: 'c1em1004.tracy.test', label: 'c1em1004', host: 'local', platform: 'emdash' }
    await seedSite(pool, site)
    let release
    const gate = new Promise((r) => (release = r))
    let markStarted
    const started = new Promise((r) => (markStarted = r))
    const older = { w: '2026-10-04T13:00:00.000Z', e: {} }
    const newer = { w: '2026-10-04T13:05:00.000Z', e: {} }
    const slow = async () => {
      markStarted()
      await gate
      return {
        ok: true,
        output: JSON.stringify({ entries: [], cursor: '', enabled: true, reset: false, state: older })
      }
    }
    const fast = fakeHost({ entries: [], cursor: '', enabled: true, reset: false, state: newer })
    const pending = pullCmsLog(pool, site, { runJob: slow })
    // Both pulls must read the same starting snapshot before the newer answer is stored.
    await started
    await pullCmsLog(pool, site, { runJob: fast.runJob })
    release()
    await pending
    const { rows } = await pool.query('select state from site_cms_log_cursor')
    assert.deepEqual(rows[0].state, newer)
  })

  test('joomla: no snapshot is sent to a platform that keeps none', async () => {
    const { pool } = db
    await seedSite(pool)
    const host = fakeHost({ entries: [], cursor: '1', enabled: true, reset: false })
    await pullCmsLog(pool, SITE, { runJob: host.runJob })
    assert.equal('state' in host.calls[0], false)
  })

  test('the list is outside-cms items, newest first, paged by cursor without repeats or gaps', async () => {
    const { pool } = db
    await seedSite(pool)
    const host = fakeHost({
      entries: [1, 2, 3, 4, 5].map((n) => entry(n, { resourceTitle: `Page ${n}` })),
      cursor: '5',
      enabled: true,
      reset: false
    })
    await pullCmsLog(pool, SITE, { runJob: host.runJob })
    const page1 = await readCmsLog(pool, SITE, { limit: 2 })
    assert.deepEqual(page1.items[0], {
      kind: 'outside-cms',
      id: 'joomla-action-log:5@2026-10-01T19:05:00Z',
      at: '2026-10-01T19:05:00.000Z',
      cms: 'joomla',
      cmsActor: { name: 'minh', id: '546' },
      resource: { type: 'article', id: '7', title: 'Page 5' },
      op: 'update'
    })
    const page2 = await readCmsLog(pool, SITE, { limit: 2, cursor: page1.nextCursor })
    const page3 = await readCmsLog(pool, SITE, { limit: 2, cursor: page2.nextCursor })
    const titles = [...page1.items, ...page2.items, ...page3.items].map((i) => i.resource.title)
    assert.deepEqual(titles, ['Page 5', 'Page 4', 'Page 3', 'Page 2', 'Page 1'])
    assert.equal(page3.nextCursor, null)
  })

  test('an entry with no CMS user reads cmsActor null', async () => {
    const { pool } = db
    const site = { ...SITE, site_key: 'scem1002.tracy.test', label: 'scem1002', platform: 'emdash' }
    await seedSite(pool, site)
    const host = fakeHost({
      entries: [
        entry(1, {
          cursorKey: '1790000000000-01MEDIA',
          actor: null,
          resourceType: 'media',
          resourceTitle: null,
          op: 'upload'
        })
      ],
      cursor: '1790000000000-01MEDIA',
      enabled: true,
      reset: false
    })
    await pullCmsLog(pool, site, { runJob: host.runJob })
    const { items } = await readCmsLog(pool, site)
    assert.equal(items[0].cmsActor, null)
    assert.equal(items[0].cms, 'emdash')
    assert.equal(items[0].id, 'emdash-audit-log:1790000000000-01MEDIA')
  })

  test('the timer also picks a site written to, or whose rows were read, in the last 30 minutes', async () => {
    const { pool } = db
    const written = { ...SITE, site_key: 'written.tracy.test', label: 'written', platform: 'emdash' }
    const viewed = { ...SITE, site_key: 'viewed.tracy.test', label: 'viewed' }
    for (const s of [written, viewed]) await seedSite(pool, s)
    await pool.query(`update site set last_write_at = now() - interval '3 minutes' where site_key = $1`, [
      written.site_key
    ])
    await readCmsLog(pool, viewed)
    const due = await sitesDueForCmsLog(pool)
    assert.deepEqual(due.map((s) => s.label).sort(), ['viewed', 'written'])
  })

  test('the timer picks sites someone worked on in the last 30 minutes and not pulled in the last 5', async () => {
    const { pool } = db
    const quiet = { ...SITE, site_key: 'quiet.tracy.test', label: 'quiet' }
    const fresh = { ...SITE, site_key: 'fresh.tracy.test', label: 'fresh' }
    const busy = SITE
    for (const s of [busy, quiet, fresh]) await seedSite(pool, s)
    await pool.query(
      `insert into site_presence (site_key, session_id, seen_at) values
        ($1, 's1', now() - interval '10 minutes'), ($2, 's2', now() - interval '2 hours'), ($3, 's3', now())`,
      [busy.site_key, quiet.site_key, fresh.site_key]
    )
    await pool.query(
      `insert into site_cms_log_cursor (site_key, source, cursor, last_pulled_at) values ($1, 'joomla-action-log', '3', now() - interval '1 minute')`,
      [fresh.site_key]
    )
    const due = await sitesDueForCmsLog(pool)
    assert.deepEqual(
      due.map((s) => s.label),
      ['scjo1002']
    )

    const host = fakeHost({ entries: [entry(1)], cursor: '1', enabled: true, reset: false })
    const swept = await sweepCmsLogs(pool, { runJob: host.runJob, log: { warn() {} } })
    assert.deepEqual(swept, { pulled: 1, sites: 1, failed: 0 })
    assert.deepEqual(await sitesDueForCmsLog(pool), [], 'pulled just now: not due again')
  })

  test('the timer tick runs under its own lock: a second replica skips while the first holds it', async () => {
    const { pool } = db
    await seedSite(pool)
    await pool.query(`insert into site_presence (site_key, session_id) values ($1, 's1')`, [SITE.site_key])
    let release
    const gate = new Promise((r) => (release = r))
    const runJob = async () => {
      await gate
      return {
        ok: true,
        output: JSON.stringify({ entries: [entry(1)], cursor: '1', enabled: true, reset: false })
      }
    }
    const first = sweepCmsLogTick(pool, {}, { runJob, log: { warn() {} } })
    await new Promise((r) => setTimeout(r, 50))
    const second = await sweepCmsLogTick(pool, {}, { runJob, log: { warn() {} } })
    assert.deepEqual(second, { ran: false })
    release()
    assert.deepEqual(await first, { ran: true, pulled: 1, sites: 1, failed: 0 })
  })

  describe('doors', () => {
    function app({
      grant = { grant: { role: 'editor' } },
      host = fakeHost({ entries: [entry(1)], cursor: '1', enabled: true, reset: false })
    } = {}) {
      const a = new Hono()
      mountCmsLog(a, {
        pool: db.pool,
        requireGrant: async (c) =>
          grant.error ? { error: c.json(grant.error.body, grant.error.status) } : grant,
        siteByKey: async (key) => (key === SITE.site_key ? SITE : null),
        runJob: host.runJob
      })
      return a
    }

    test('POST /pull answers {pulled, cursor, enabled}; GET lists the rows and coverage', async () => {
      await seedSite(db.pool)
      const a = app()
      const pulled = await a.request(`/api/sites/${SITE.site_key}/cms-log/pull`, { method: 'POST' })
      assert.equal(pulled.status, 200)
      assert.deepEqual(await pulled.json(), { pulled: 1, cursor: '1', enabled: true })
      const listed = await a.request(`/api/sites/${SITE.site_key}/cms-log`)
      assert.equal(listed.status, 200)
      assert.equal(listed.headers.get('cache-control'), 'private, no-store')
      const body = await listed.json()
      assert.equal(body.items.length, 1)
      assert.equal(body.items[0].kind, 'outside-cms')
      assert.equal(body.coverage.cmsLog.source, 'joomla-action-log')
      assert.equal(body.nextCursor, null)
    })

    test('both doors need a live seat on the site, and an unknown site is 404', async () => {
      await seedSite(db.pool)
      const refused = app({ grant: { error: { status: 403, body: { code: 'SEAT_NOT_AUTHORIZED' } } } })
      for (const [path, method] of [
        [`/api/sites/${SITE.site_key}/cms-log`, 'GET'],
        [`/api/sites/${SITE.site_key}/cms-log/pull`, 'POST']
      ]) {
        const res = await refused.request(path, { method })
        assert.equal(res.status, 403)
      }
      const unknown = await app().request('/api/sites/nobody.tracy.test/cms-log')
      assert.equal(unknown.status, 404)
    })

    test('a malformed list cursor or limit is 400, not a guess', async () => {
      await seedSite(db.pool)
      const a = app()
      assert.equal((await a.request(`/api/sites/${SITE.site_key}/cms-log?cursor=%%%`)).status, 400)
      assert.equal((await a.request(`/api/sites/${SITE.site_key}/cms-log?limit=0`)).status, 400)
    })

    test('a pull the host could not run is 502 with its reason', async () => {
      await seedSite(db.pool)
      const a = app({ host: fakeHost(new Error('FLEET_REFUSED')) })
      const res = await a.request(`/api/sites/${SITE.site_key}/cms-log/pull`, { method: 'POST' })
      assert.equal(res.status, 502)
      assert.deepEqual(await res.json(), { code: 'CMS_LOG_PULL_FAILED', reason: 'FLEET_REFUSED' })
    })
  })
})

test("hostJobRunner starts the job on the site's host and polls it to its output", async () => {
  const seen = []
  const host = {
    hostCall: async (_config, hostName, path, payload) => {
      seen.push([hostName, path, payload])
      return { ok: true, status: 202, body: { jobId: 'j9' } }
    },
    hostJob: async (_config, _host, id) =>
      seen.push(['poll', id]) && { ok: true, body: { state: 'done', output: '{"entries":[]}' } }
  }
  const runJob = hostJobRunner({}, { host })
  const result = await runJob(SITE, { kind: 'cms-log-pull', platform: 'joomla', cursor: '' }, 5000)
  assert.deepEqual(result, { ok: true, output: '{"entries":[]}' })
  assert.deepEqual(seen[0], [
    'local',
    '/site',
    { kind: 'cms-log-pull', platform: 'joomla', cursor: '', label: 'scjo1002' }
  ])
})
