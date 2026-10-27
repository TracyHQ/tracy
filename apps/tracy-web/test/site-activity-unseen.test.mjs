// The Site changes badge (plan `tasks/todo-site-changes-badge-count.md` §2): what one person has not
// looked at yet on a site — rows of the V2 ledger recorded after their watermark, under a badge
// Source, and not made by them through Tracy. The watermark is one person's, on the server
// (`site_activity_seen`, migration 058), set to "now" the first time the badge is asked (no history
// is dug up) and moved forward by the tab once it has drawn the list.
//
// 🔒 RECORDED, NOT OCCURRED. A WordPress row the collector pulls five minutes after the edit, or a
// seal Tracy commits after the person looked, carries an `occurred_at` / `at` BEFORE the watermark —
// measured 04/10 on scv2: occurred 10:10:29, pulled 10:14:57. Counting by occurrence would swallow
// both; the count and `recordedAt` read the moment Tracy wrote the row.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, describe, test } from 'node:test'
import { Hono } from 'hono'
import { mountActivity } from '../src/sites/activity.js'
import { BADGE_SOURCES, SOURCES, softwareUnitOf } from '../src/sites/activity-source.js'
import { countUnseenV2, ensureSeen, markSeen, seenAtOf } from '../src/sites/activity-store.js'
import { readActivityV2 } from '../src/sites/activity-v2.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
const skip = !process.env.TEST_DATABASE_URL

const SITE = { site_key: 'scwp1002.tracy.test', label: 'scwp1002', host: 'local', platform: 'wordpress' }
const MAI = 'mai.tran@example.test'
const SAM = 'sam.ortiz@example.test'
const T0 = Date.parse('2026-10-01T10:00:00Z')
const iso = (minutes) => new Date(T0 + minutes * 60_000).toISOString()
const sha = (c) => String(c).repeat(40).slice(0, 40)

/**
 * A host for these tests: Git moments for the list, and an empty CMS log for the pull the badge door
 * may start (`cms-log-pull` answered as the real host answers, so no `last_error` is written).
 * `pulls` counts those pulls; `settle` holds every pull until the test lets it go (null = at once).
 */
function fakeHost(rows = [], { settle = null } = {}) {
  const pulls = []
  const started = Promise.withResolvers()
  const runJob = async (_site, input) => {
    if (input?.kind === 'cms-log-pull') {
      pulls.push(input)
      started.resolve()
      if (settle) await settle
      return {
        ok: true,
        output: JSON.stringify({ entries: [], cursor: String(pulls.length), enabled: true })
      }
    }
    return { ok: true, output: JSON.stringify({ ok: true, head: sha('f'), rows }) }
  }
  return { runJob, pulls, pullStarted: started.promise }
}

async function seed(pool) {
  await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
    SITE.site_key,
    SITE.label,
    SITE.host,
    SITE.platform
  ])
  await pool.query(
    `insert into account (email, display_name) values ($1, 'Mai Tran'), ($2, 'Sam Ortiz') on conflict do nothing`,
    [MAI, SAM]
  )
  const { rows } = await pool.query('select id, email from account where email = any($1::text[])', [
    [MAI, SAM]
  ])
  const ids = Object.fromEntries(rows.map((r) => [r.email, r.id]))
  return { mai: ids[MAI], sam: ids[SAM] }
}

async function turn(pool, id, over = {}) {
  const row = {
    actor: MAI,
    title: `prompt ${id}`,
    source: 'panel',
    opened_at: iso(0),
    closed_at: iso(1),
    state: 'closed',
    head_sha: sha('a'),
    files: 1,
    ...over
  }
  await pool.query(
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, opened_at, closed_at, state,
       head_sha, files)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      SITE.site_key,
      id.split(':')[0],
      Number(id.split(':')[1] ?? 1),
      row.actor,
      row.title,
      row.source,
      row.opened_at,
      row.closed_at,
      row.state,
      row.head_sha,
      row.files
    ]
  )
}

async function write(pool, over = {}) {
  await pool.query(
    `insert into site_write (site_key, at, turn_id, session_id, actor, action, outcome, target, via)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      SITE.site_key,
      over.at ?? iso(0),
      over.turn_id ?? null,
      over.session_id ?? null,
      over.actor === undefined ? MAI : over.actor,
      over.action ?? 'content.update',
      over.outcome ?? 'ok',
      over.target ? JSON.stringify(over.target) : null,
      over.via ?? 'apply'
    ]
  )
}

/** An outside row: `at` is the commit time the host sent, `recorded_at` when Tracy wrote the row. */
async function outside(pool, c, minutes, over = {}) {
  await pool.query(
    `insert into site_outside (sha, site_key, at, files, cause, deploy_tag, recorded_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      sha(c),
      SITE.site_key,
      over.at ?? iso(minutes),
      over.files ?? 2,
      over.cause ?? 'seal',
      over.deploy_tag ?? null,
      over.recorded_at ?? iso(minutes)
    ]
  )
}

/** A CMS log row: `occurred_at` is the CMS's clock, `pulled_at` when the collector stored it. */
async function cms(pool, key, minutes, over = {}) {
  await pool.query(
    `insert into site_cms_change (site_key, source, cms_actor, resource_type, resource_id, resource_title, op,
       occurred_at, cursor_key, change_type, producer, pulled_at)
     values ($1, $2, $3, $4, $5, $6, $12, $7, $8, $9, $10, $11)`,
    [
      SITE.site_key,
      over.source ?? 'wordpress-tracy-log',
      over.actor === undefined ? JSON.stringify({ name: 'minh', id: '3' }) : over.actor,
      over.type ?? 'page',
      over.id ?? '42',
      over.title ?? 'About us',
      over.at ?? iso(minutes),
      key,
      over.change_type ?? 'wp_after_insert_post',
      over.producer ? JSON.stringify(over.producer) : null,
      over.pulled_at ?? iso(minutes),
      over.op ?? 'update'
    ]
  )
}
/** A WP-Cron row under the hook's contract (no user, context cron, a known hook version). */
const cron = (pool, key, minutes, over = {}) =>
  cms(pool, key, minutes, { actor: null, producer: { context: 'cron', version: '0.3.1' }, ...over })
/** Minutes with a fraction of a second: `at(60, 1.5)` = 60 min + 1.5 s after T0. */
const at = (minutes, seconds = 0) => new Date(T0 + minutes * 60_000 + seconds * 1000).toISOString()

/** Each operation its own resulting commit (`site_operation_result` is unique per site). */
let opN = 0
async function operation(pool, over = {}) {
  opN += 1
  const { rows } = await pool.query(
    `insert into site_operation (site_key, action, target_sha, actor_email, status, resulting_sha, job_id,
       created_at, finished_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id::text`,
    [
      SITE.site_key,
      over.action ?? 'undo',
      over.target_sha ?? sha('9'),
      over.actor_email ?? SAM,
      over.status ?? 'succeeded',
      over.resulting_sha === undefined ? sha(String(opN % 10)) : over.resulting_sha,
      over.job_id ?? `job-${opN}`,
      over.created_at ?? iso(0),
      over.finished_at ?? null
    ]
  )
  return rows[0].id
}

/** The watermark set by hand, before any door is asked (the doors only ever set it to "now"). */
const seenAt = (pool, accountId, minutes) =>
  pool.query(
    `insert into site_activity_seen (site_key, account_id, seen_at) values ($1, $2, $3)
     on conflict (site_key, account_id) do update set seen_at = excluded.seen_at`,
    [SITE.site_key, accountId, iso(minutes)]
  )

const count = (pool, since, viewer = MAI) => countUnseenV2(pool, SITE.site_key, { since: iso(since), viewer })

describe('the badge Sources', () => {
  test('deployment is on the badge whole; automatic only for its software rows; the rest are on', () => {
    assert.deepEqual(
      [...BADGE_SOURCES],
      // `design-system`: a colleague's Design system press (walkthrough 11/10/2026), counted like a chat change.
      // `setup` / `api` (sweep 11/10/2026): a colleague's new site set up by Tracy, a write with a seat key.
      [
        'chat',
        'comment',
        'design-system',
        'setup',
        'api',
        'cms-admin',
        'site-changes',
        'unknown',
        'deployment'
      ]
    )
    assert.ok(BADGE_SOURCES.every((s) => SOURCES.includes(s)))
    assert.ok(!BADGE_SOURCES.includes('automatic'))
  })

  test('softwareUnitOf: a plugin/theme/core/extension install, update or removal has a unit; content has none', () => {
    const wp = (over) => softwareUnitOf({ source: 'wordpress-tracy-log', cms_actor: null, ...over })
    assert.equal(wp({ resource_type: 'plugin', op: 'update' }), 'wordpress-tracy-log:auto')
    assert.equal(wp({ resource_type: 'theme', op: 'install' }), 'wordpress-tracy-log:auto')
    assert.equal(wp({ resource_type: 'core', op: 'update', cms_actor: { id: '3' } }), 'wordpress-tracy-log:3')
    assert.equal(
      wp({ resource_type: 'core', op: 'update', cms_actor: { id: '0' } }),
      'wordpress-tracy-log:auto'
    )
    assert.equal(
      softwareUnitOf({
        source: 'joomla-action-log',
        resource_type: 'package',
        op: 'install',
        cms_actor: { id: '42' }
      }),
      'joomla-action-log:42'
    )
    assert.equal(wp({ resource_type: 'post', op: 'update' }), null, 'content is never grouped')
    assert.equal(wp({ resource_type: 'catalog_item', op: 'update' }), null)
    assert.equal(
      wp({ resource_type: 'plugin', op: 'activate' }),
      null,
      'switching a plugin on is not a software change'
    )
  })
})

describe('unseen changes: the count', { skip }, () => {
  before(db.open)
  beforeEach(db.reset)
  after(db.close)

  test('(b) another seat’s closed chat turn after the watermark counts; the viewer’s own does not', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(60), closed_at: iso(61) })
    await turn(pool, 's2:1', { actor: MAI, opened_at: iso(62), closed_at: iso(63) })
    assert.equal(await count(pool, 50, MAI), 1)
    assert.equal(await count(pool, 50, SAM), 1)
    assert.equal(await count(pool, 70, MAI), 0, 'nothing after a later watermark')
  })

  test('(b′) a turn is recorded when it CLOSES: opened before the watermark, closed after → counted', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(40), closed_at: iso(55) })
    assert.equal(await count(pool, 50, MAI), 1)
  })

  test('(c) a WordPress row that occurred before the watermark but was pulled after it counts', async () => {
    const { pool } = db
    await seed(pool)
    await cms(pool, '1@x', 45, { pulled_at: iso(55) })
    await cms(pool, '2@x', 44, { pulled_at: iso(46) })
    assert.equal(await count(pool, 50), 1)
  })

  test('(d) automatic CONTENT (a cron post, a catalogue sync) and housekeeping never count; a Tracy deploy does', async () => {
    const { pool } = db
    await seed(pool)
    await cron(pool, '6@x', 60)
    await cron(pool, '7@x', 60, { type: 'catalog_item', id: 'sku-1' })
    await outside(pool, '1', 62, { cause: 'housekeeping', files: 3 })
    assert.equal(await count(pool, 50), 0)
    await outside(pool, '2', 61, { cause: 'deploy', deploy_tag: 'app-77' })
    assert.equal(await count(pool, 50), 1, 'the deploy is the site’s software changing')
  })

  test('(d′) automatic SOFTWARE counts: one cron upgrade run of three rows within two seconds is ONE', async () => {
    const { pool } = db
    await seed(pool)
    await cron(pool, 'u1', 60, { type: 'plugin', id: 'akismet/akismet.php', op: 'update', at: at(60, 0) })
    await cron(pool, 'u2', 60, { type: 'theme', id: 'twentytwentyfive', op: 'update', at: at(60, 0.8) })
    await cron(pool, 'u3', 60, { type: 'core', id: 'wordpress', op: 'update', at: at(60, 1.9) })
    assert.equal(await count(pool, 50), 1)
    // A second run ten seconds later is another thing.
    await cron(pool, 'u4', 60, { type: 'plugin', id: 'hello.php', op: 'install', at: at(60, 12) })
    assert.equal(await count(pool, 50), 2)
    // A person's own upgrade in wp-admin is its own unit (cms-admin), not the cron's.
    await cms(pool, 'u5', 60, { type: 'plugin', id: 'jetpack/jetpack.php', op: 'update', at: at(60, 12.5) })
    assert.equal(await count(pool, 50), 3)
  })

  test('(d″) content rows never group: two Saves a second apart by one CMS account are two things', async () => {
    const { pool } = db
    await seed(pool)
    await cms(pool, 'p1', 60, { at: at(60, 0) })
    await cms(pool, 'p2', 60, { at: at(60, 1) })
    assert.equal(await count(pool, 50), 2)
  })

  test('(d‴) an island is cut over every row of its unit: a run that straddles the watermark counts once, by its last row', async () => {
    const { pool } = db
    await seed(pool)
    // Two rows before the watermark (seen), one after — one run, one new thing.
    await cron(pool, 'w1', 49, {
      type: 'plugin',
      id: 'a',
      op: 'update',
      at: at(49, 58.5),
      pulled_at: at(49, 59)
    })
    await cron(pool, 'w2', 49, {
      type: 'plugin',
      id: 'b',
      op: 'update',
      at: at(49, 59.5),
      pulled_at: at(49, 59.8)
    })
    await cron(pool, 'w3', 50, {
      type: 'theme',
      id: 'c',
      op: 'update',
      at: at(50, 0.5),
      pulled_at: at(50, 1)
    })
    assert.equal(await count(pool, 50), 1)
    // Islands are cut by occurred_at, not by the pull: three rows pulled at one instant but an hour apart are three.
    await cron(pool, 'x1', 70, { type: 'plugin', id: 'a', op: 'update', at: at(70, 0), pulled_at: at(72, 0) })
    await cron(pool, 'x2', 71, { type: 'plugin', id: 'a', op: 'update', at: at(71, 0), pulled_at: at(72, 0) })
    assert.equal(await count(pool, 50), 3)
  })

  test('(e) a seal whose commit time is before the watermark but was recorded after it counts', async () => {
    const { pool } = db
    await seed(pool)
    await outside(pool, 'e', 40, { recorded_at: iso(55) })
    await outside(pool, 'f', 41, { recorded_at: iso(42) })
    assert.equal(await count(pool, 50), 1)
  })

  test('(f) a succeeded operation by another seat counts; by the viewer it does not; pending ones never', async () => {
    const { pool } = db
    await seed(pool)
    await operation(pool, { actor_email: SAM, created_at: iso(60), finished_at: iso(61) })
    await operation(pool, { actor_email: MAI, created_at: iso(62), finished_at: iso(63) })
    await operation(pool, { actor_email: SAM, created_at: iso(64), status: 'pending', resulting_sha: null })
    assert.equal(await count(pool, 50, MAI), 1)
    assert.equal(await count(pool, 50, SAM), 1)
  })

  test('(f′) an operation is recorded when it FINISHES: created before the watermark, finished after → counted', async () => {
    const { pool } = db
    await seed(pool)
    await operation(pool, { actor_email: SAM, created_at: iso(40), finished_at: iso(55) })
    assert.equal(await count(pool, 50, MAI), 1)
  })

  test('(i) the actor comparison is case-blind: a turn typed as Mai.Tran@ is the viewer mai.tran@', async () => {
    const { pool } = db
    await seed(pool)
    await turn(pool, 's1:1', { actor: 'Mai.Tran@example.test', opened_at: iso(60), closed_at: iso(61) })
    assert.equal(await count(pool, 50, MAI), 0)
    assert.equal(await count(pool, 50, SAM), 1)
  })

  test('writes with no turn record: a group of the viewer’s own writes is theirs; one with no actor counts', async () => {
    const { pool } = db
    await seed(pool)
    await write(pool, { at: iso(60), actor: MAI, session_id: 'session-x' })
    await write(pool, { at: iso(61), actor: MAI, session_id: 'session-x' })
    await write(pool, { at: iso(62), actor: null })
    assert.equal(await count(pool, 50, MAI), 1)
    assert.equal(await count(pool, 50, SAM), 2)
  })

  test('a group of writes is recorded at its LAST write: a write added after the watermark re-counts the group', async () => {
    const { pool } = db
    await seed(pool)
    await write(pool, { at: iso(40), actor: SAM, session_id: 'session-x' })
    await write(pool, { at: iso(55), actor: SAM, session_id: 'session-x' })
    assert.equal(await count(pool, 50, MAI), 1)
  })

  test('the watermark store: none → null; ensureSeen writes once; markSeen never moves it backwards', async () => {
    const { pool } = db
    const { mai } = await seed(pool)
    assert.equal(await seenAtOf(pool, SITE.site_key, mai), null)
    const first = await ensureSeen(pool, SITE.site_key, mai, new Date(iso(50)))
    assert.deepEqual(first, { seenAt: iso(50), created: true })
    const again = await ensureSeen(pool, SITE.site_key, mai, new Date(iso(70)))
    assert.deepEqual(again, { seenAt: iso(50), created: false })
    assert.equal(await markSeen(pool, SITE.site_key, mai, new Date(iso(60))), iso(60))
    assert.equal(await markSeen(pool, SITE.site_key, mai, new Date(iso(55))), iso(60), 'never backwards')
    assert.equal(await seenAtOf(pool, SITE.site_key, mai), iso(60))
  })
})

describe('unseen changes: the doors', { skip }, () => {
  before(db.open)
  beforeEach(db.reset)
  // A pull the badge door started is settled before the next test resets the schema under it.
  /** @type {{awaitBadgePulls: () => Promise<unknown>} | null} */
  let mounted = null
  afterEach(async () => {
    await mounted?.awaitBadgePulls()
    mounted = null
  })
  after(db.close)

  /** The two doors mounted beside `/activity`, read as one seat. */
  function mount(pool, ids, host = fakeHost()) {
    let reader = MAI
    const app = new Hono()
    mounted = mountActivity(app, {
      pool,
      requireGrant: async () => ({ email: reader, account: { id: ids[reader === MAI ? 'mai' : 'sam'] } }),
      siteByKey: async (key) => (key === SITE.site_key ? SITE : null),
      runJob: host.runJob
    })
    const base = `/api/sites/${SITE.site_key}/activity`
    return {
      as: (who) => {
        reader = who
      },
      unseen: async (key = SITE.site_key) => {
        const res = await app.request(`/api/sites/${key}/activity/unseen`)
        return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') }
      },
      seen: async (body) => {
        const res = await app.request(`${base}/seen`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
        return { status: res.status, body: await res.json() }
      },
      v2: async (q = 'version=2') => (await app.request(`${base}?${q}`)).json()
    }
  }

  test('(a) no watermark yet: the first ask answers 0 and writes the baseline at now, digging up no history', async () => {
    const { pool } = db
    const ids = await seed(pool)
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(60), closed_at: iso(61) })
    const doors = mount(pool, ids)
    const before = Date.now()
    const { status, body, cache } = await doors.unseen()
    assert.equal(status, 200)
    assert.equal(cache, 'private, no-store')
    assert.equal(body.count, 0)
    assert.equal(body.complete, true)
    assert.ok(Date.parse(body.since) >= before - 1000 && Date.parse(body.since) <= Date.now() + 1000)
    assert.equal(body.since, await seenAtOf(pool, SITE.site_key, ids.mai))
    assert.ok(Date.parse(body.readAt) >= Date.parse(body.since))
    // Asked again: the baseline holds, still 0 — the old turn is history, not news.
    assert.equal((await doors.unseen()).body.count, 0)
  })

  test('the count through the door, and the site that is not there', async () => {
    const { pool } = db
    const ids = await seed(pool)
    await seenAt(pool, ids.mai, 50)
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(60), closed_at: iso(61) })
    await cms(pool, '1@x', 62)
    const doors = mount(pool, ids)
    const { body } = await doors.unseen()
    assert.equal(body.count, 2)
    assert.equal(body.since, iso(50))
    assert.equal((await doors.unseen('nowhere.tracy.test')).status, 404)
  })

  test('complete is false while the CMS log collector is in error', async () => {
    const { pool } = db
    const ids = await seed(pool)
    await seenAt(pool, ids.mai, 50)
    await pool.query(
      `insert into site_cms_log_cursor (site_key, source, cursor, enabled, last_error, last_error_at)
       values ($1, 'wordpress-tracy-log', '0', true, 'boom', now())`,
      [SITE.site_key]
    )
    assert.equal((await mount(pool, ids).unseen()).body.complete, false)
  })

  test('a stale CMS log (never pulled) makes the badge door start ONE pull and answer before it settles', async () => {
    const { pool } = db
    const ids = await seed(pool)
    let release
    const host = fakeHost([], { settle: new Promise((r) => (release = r)) })
    const doors = mount(pool, ids, host)
    const { status, body } = await doors.unseen()
    assert.equal(status, 200)
    assert.equal(body.count, 0)
    assert.equal(body.pulling, true, 'the ask says a pull was just started')
    // The pull reads its cursor first, so it reaches the host a tick after the door answered.
    await host.pullStarted
    assert.equal(host.pulls.length, 1, 'one pull started')
    // Asked again while that pull is still out: no second pull.
    await doors.unseen()
    assert.equal(host.pulls.length, 1)
    assert.equal(
      (
        await pool.query('select last_pulled_at from site_cms_log_cursor where site_key = $1', [
          SITE.site_key
        ])
      ).rowCount,
      0,
      'the door did not wait for the pull'
    )
    release()
    let stamped = false
    for (let i = 0; i < 100; i++) {
      const { rows } = await pool.query(
        'select last_pulled_at from site_cms_log_cursor where site_key = $1',
        [SITE.site_key]
      )
      if (rows[0]?.last_pulled_at) {
        stamped = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    assert.equal(stamped, true, 'the pull settled and stamped the cursor')
    // Within a minute of that pull: still no new one, whatever the ask count.
    await doors.unseen()
    assert.equal(host.pulls.length, 1)
  })

  test('a fresh CMS log (pulled within the minute) makes the badge door start no pull', async () => {
    const { pool } = db
    const ids = await seed(pool)
    await pool.query(
      `insert into site_cms_log_cursor (site_key, source, cursor, enabled, last_pulled_at) values ($1, 'wordpress-tracy-log', '0', true, now())`,
      [SITE.site_key]
    )
    const host = fakeHost()
    const doors = mount(pool, ids, host)
    assert.equal((await doors.unseen()).body.pulling, false)
    await doors.unseen()
    assert.equal(host.pulls.length, 0)
  })

  test('a CMS log older than a minute makes the badge door start one pull; a failed pull is not retried within the minute', async () => {
    const { pool } = db
    const ids = await seed(pool)
    await pool.query(
      `insert into site_cms_log_cursor (site_key, source, cursor, enabled, last_pulled_at) values ($1, 'wordpress-tracy-log', '0', true, now() - interval '2 minutes')`,
      [SITE.site_key]
    )
    let pulls = 0
    const runJob = async (_site, input) => {
      if (input?.kind === 'cms-log-pull') {
        pulls += 1
        return { ok: false, reason: 'HOST_DOWN' }
      }
      return { ok: true, output: JSON.stringify({ ok: true, head: sha('f'), rows: [] }) }
    }
    const doors = mount(pool, ids, { runJob })
    await doors.unseen()
    await new Promise((r) => setTimeout(r, 30))
    await doors.unseen()
    assert.equal(pulls, 1, 'one pull, then the minute’s guard holds even though it failed')
    // The failure is on the cursor row, so the next answer says the count is a floor.
    assert.equal((await doors.unseen()).body.complete, false)
  })

  test('(g) PUT seen moves the watermark forward only; a time in the future is refused', async () => {
    const { pool } = db
    const ids = await seed(pool)
    await seenAt(pool, ids.mai, 50)
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(60), closed_at: iso(61) })
    const doors = mount(pool, ids)
    assert.equal((await doors.unseen()).body.count, 1)
    const moved = await doors.seen({ readAt: iso(70) })
    assert.equal(moved.status, 200)
    assert.equal(moved.body.seenAt, iso(70))
    assert.equal((await doors.unseen()).body.count, 0)
    const back = await doors.seen({ readAt: iso(40) })
    assert.equal(back.status, 200)
    assert.equal(back.body.seenAt, iso(70), 'never backwards')
    const ahead = await doors.seen({ readAt: new Date(Date.now() + 2 * 3600_000).toISOString() })
    assert.equal(ahead.status, 400)
    assert.equal(ahead.body.code, 'INVALID_READ_AT')
    assert.equal((await doors.seen({ readAt: 'yesterday' })).status, 400)
    assert.equal((await doors.seen({})).status, 400)
    // Another seat's watermark is their own.
    doors.as(SAM)
    assert.equal((await doors.unseen()).body.count, 0, 'Sam’s first ask: baseline, 0')
    assert.equal(await seenAtOf(pool, SITE.site_key, ids.mai), iso(70))
  })

  test('(h) the V2 answer says when it was read and the watermark before it; every item says when it was recorded', async () => {
    const { pool } = db
    const ids = await seed(pool)
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(60), closed_at: iso(61) })
    await write(pool, { at: iso(62), actor: null, session_id: 'session-x' })
    await write(pool, { at: iso(63), actor: null, session_id: 'session-x' })
    await outside(pool, 'e', 40, { recorded_at: iso(64) })
    await cms(pool, '1@x', 45, { pulled_at: iso(65) })
    await operation(pool, { actor_email: SAM, created_at: iso(66), finished_at: iso(67) })
    await operation(pool, { actor_email: SAM, created_at: iso(68), finished_at: null })
    const doors = mount(pool, ids)
    const before = Date.now()
    const first = await doors.v2()
    assert.equal(first.schemaVersion, 2)
    assert.equal(first.seenBefore, null, 'no watermark yet: null, not now')
    assert.ok(Date.parse(first.readAt) >= before - 1000)
    const recorded = Object.fromEntries(first.items.map((i) => [`${i.kind}:${i.id}`, i.recordedAt]))
    assert.equal(recorded['turn:s1:1'], iso(61), 'a turn: when it closed')
    assert.equal(recorded['writes:session:session-x'], iso(63), 'writes: the last one')
    assert.equal(recorded[`outside-files:${sha('e')}`], iso(64), 'a seal: when Tracy wrote the row')
    assert.equal(recorded['cms-change:wordpress-tracy-log:1@x'], iso(65), 'a CMS row: when it was pulled')
    const ops = first.items
      .filter((i) => i.kind === 'operation')
      .map((i) => i.recordedAt)
      .sort()
    assert.deepEqual(ops, [iso(67), iso(68)], 'an operation: when it finished, else when it was made')
    // The door never marks seen by itself: the client does once it has drawn.
    assert.equal(await seenAtOf(pool, SITE.site_key, ids.mai), null)
    await doors.seen({ readAt: first.readAt })
    const second = await doors.v2()
    assert.equal(second.seenBefore, first.readAt)
    // A read without an account (an older caller) still answers, with no watermark.
    const bare = await readActivityV2(pool, SITE, { runJob: fakeHost().runJob })
    assert.equal(bare.seenBefore, null)
    assert.ok(typeof bare.readAt === 'string')
  })

  test('each V2 item says whether the badge counted it (`unseen`): a badge Source, recorded after the watermark, not the reader’s own', async () => {
    const { pool } = db
    const ids = await seed(pool)
    const doors = mount(pool, ids)
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(60), closed_at: iso(61) })
    await turn(pool, 's2:1', { actor: 'Mai.Tran@example.test', opened_at: iso(62), closed_at: iso(63) })
    await turn(pool, 's3:1', { actor: SAM, opened_at: iso(40), closed_at: iso(41) })
    await cms(pool, '1@x', 45, { pulled_at: iso(65) })
    await cms(pool, '6@x', 64, { actor: null, producer: { context: 'cron', version: '0.3.1' } })
    await outside(pool, '2', 66, { cause: 'deploy', deploy_tag: 'app-77' })
    // No watermark yet: nothing is unseen, whatever was recorded.
    const bare = await doors.v2()
    assert.ok(bare.items.length >= 5)
    assert.ok(bare.items.every((i) => i.unseen === false))
    await doors.seen({ readAt: iso(50) })
    const page = await doors.v2()
    const flag = Object.fromEntries(page.items.map((i) => [`${i.kind}:${i.id}`, i.unseen]))
    assert.equal(flag['turn:s1:1'], true, 'another seat’s turn after the watermark')
    assert.equal(flag['turn:s2:1'], false, 'the reader’s own turn, whatever its case')
    assert.equal(flag['turn:s3:1'], false, 'recorded before the watermark')
    assert.equal(flag['cms-change:wordpress-tracy-log:1@x'], true, 'a CMS account’s change, pulled after')
    assert.equal(flag['cms-change:wordpress-tracy-log:6@x'], false, 'automatic is off the badge')
    assert.equal(
      flag[`outside-files:${sha('2')}`],
      true,
      'a deploy is the site’s software changing: on the badge'
    )
    // The flags agree with the count the card shows.
    const lit = page.items.filter((i) => i.unseen).length
    assert.equal((await doors.unseen()).body.count, lit)
  })

  test('(k) the V2 answer carries the badge’s number (`unseenCount`), items say their software `unit`, and a cron software row is unseen while a cron content row is not', async () => {
    const { pool } = db
    const ids = await seed(pool)
    const doors = mount(pool, ids)
    // Mai's watermark at 50 (the first ask writes it at now; move it to a known time).
    await ensureSeen(pool, SITE.site_key, ids.mai, iso(50))
    await cron(pool, 'u1', 60, {
      type: 'plugin',
      id: 'akismet/akismet.php',
      op: 'update',
      at: at(60, 0),
      pulled_at: iso(61)
    })
    await cron(pool, 'u2', 60, {
      type: 'theme',
      id: 'twentytwentyfive',
      op: 'update',
      at: at(60, 1),
      pulled_at: iso(61)
    })
    await cron(pool, 'c1', 60, { type: 'post', id: '9', op: 'update', at: at(60, 5), pulled_at: iso(61) })
    await turn(pool, 's1:1', { actor: SAM, opened_at: iso(62), closed_at: iso(63) })
    const a = await doors.v2()
    assert.equal(a.seenBefore, iso(50))
    assert.equal(a.unseenCount, 2, 'one upgrade run + one turn: what the card says')
    const of = (kind, pred) => a.items.find((i) => i.kind === kind && pred(i))
    const plugin = of(
      'cms-change',
      (i) => i.unit === 'wordpress-tracy-log:auto' && /akismet/i.test(JSON.stringify(i.description))
    )
    const theme = of('cms-change', (i) => i.unit === 'wordpress-tracy-log:auto' && i !== plugin)
    const post = of('cms-change', (i) => i.unit === null)
    assert.ok(plugin && theme && post, 'three CMS rows on the page')
    assert.equal(plugin.origin.source, 'automatic')
    assert.equal(plugin.unseen, true, 'every row of a counted island is lit')
    assert.equal(theme.unseen, true)
    assert.equal(post.origin.source, 'automatic')
    assert.equal(post.unseen, false, 'a cron content row is on the list, not on the badge')
    assert.equal(a.items.filter((i) => i.unseen).length, 3, 'three rows lit, two things counted')
    const bare = await readActivityV2(pool, SITE, { runJob: fakeHost().runJob })
    assert.equal(bare.unseenCount, null, 'no reader, no watermark, no number')
  })

  test('a Git-only moment (no row of its own) has no recorded time', async () => {
    const { pool } = db
    const ids = await seed(pool)
    const host = fakeHost([
      {
        sha: sha('8'),
        at: Math.floor((T0 + 86 * 60_000) / 1000),
        by: { kind: 'agent' },
        kind: 'moment',
        title: 'old agent moment',
        turn: null,
        files: 1
      }
    ])
    const page = await mount(pool, ids, host).v2()
    const git = page.items.find((i) => i.kind === 'git')
    assert.ok(git, 'the moment is listed')
    assert.equal(git.recordedAt, null)
  })
})
