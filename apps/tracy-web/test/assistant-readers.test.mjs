// Help's read-only readers (`assistant/readers.js`): they read the asker's own rows, return only
// chosen columns, hide what only an owner or admin may see, and say "unavailable" instead of throwing.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileDb } from './_db.mjs'
import {
  buildProgress,
  domainState,
  pendingWork,
  recentActivity,
  siteOrigin,
  teamOf
} from '../src/assistant/readers.js'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

async function account(pool, email, name = null) {
  const { rows } = await pool.query(
    `insert into account (email, display_name) values ($1, $2)
     on conflict (email) do update set email = excluded.email returning id`,
    [email, name]
  )
  return rows[0].id
}
async function site(pool, siteKey) {
  await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
    siteKey,
    'x',
    'local',
    'wordpress'
  ])
}
async function seat(pool, siteKey, email, role, accepted = true) {
  const id = await account(pool, email, email.split('@')[0])
  await pool.query(
    'insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, $4)',
    [siteKey, id, role, accepted ? new Date() : null]
  )
  return id
}

test('the readers import nothing of sites/ or seats/ and call no door', () => {
  const src = readFileSync(new URL('../src/assistant/readers.js', import.meta.url), 'utf8')
  assert.ok(!/from ['"]\.\.\/(sites|seats)\//.test(src))
  assert.ok(!/\bfetch\(|hostCall|hostJob/.test(src))
})

test('a failing database reads as unavailable, never as an empty answer or a throw', opts, async () => {
  const broken = { query: async () => Promise.reject(new Error('down')) }
  for (const out of [
    await buildProgress(broken, 'a'),
    await recentActivity(broken, 'k'),
    await domainState(broken, 'k'),
    await pendingWork(broken, 'a', 'k'),
    await siteOrigin(broken, 'k'),
    await teamOf(broken, 'k', 'owner')
  ])
    assert.deepEqual(out, { unavailable: true })
})

test('recentActivity gives times and the end reason, never the turn title or reply', opts, async () => {
  const { pool } = db
  await site(pool, 'a.localhost')
  await pool.query(
    `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, state, closed_at, end_reason, files)
     values ('t1', 'a.localhost', 's', 1, 'x@y.z', 'SECRET TITLE', 'closed', now(), 'aborted', 2)`
  )
  const out = await recentActivity(pool, 'a.localhost')
  assert.equal(out.lastTurn.endReason, 'aborted')
  assert.equal(out.lastTurn.filesChanged, 2)
  assert.ok(!JSON.stringify(out).includes('SECRET'))
  assert.equal(out.lastApplyWriteAt, null)
})

test('pendingWork counts the inbox and open comments only, no text', opts, async () => {
  const { pool } = db
  const id = await account(pool, 'a@x.y')
  await site(pool, 'a.localhost')
  await pool.query(
    `insert into notification (account_id, kind, data) values ($1, 'comment.mention', '{"text":"SECRET BODY"}'), ($1, 'comment.mention', '{}')`,
    [id]
  )
  await pool.query(
    `insert into site_comment (site_key, n, author_account_id, url, text) values ('a.localhost', 1, $1, '/x', 'SECRET COMMENT')`,
    [id]
  )
  const out = await pendingWork(pool, id, 'a.localhost')
  assert.ok(!out.unavailable, 'the columns the reader uses exist')
  assert.equal(out.inboxUnread, 2)
  assert.equal(out.openComments, 1)
  assert.ok(!JSON.stringify(out).includes('SECRET'))
})

test('domainState and siteOrigin read their columns without error', opts, async () => {
  const { pool } = db
  await site(pool, 'a.localhost')
  assert.equal(await domainState(pool, 'a.localhost'), null)
  const origin = await siteOrigin(pool, 'a.localhost')
  assert.ok(!origin.unavailable)
  assert.equal(origin.template, null)
})

test('buildProgress answers a list for the asker, and for nobody else’s builds', opts, async () => {
  const { pool } = db
  const id = await account(pool, 'a@x.y')
  const other = await account(pool, 'b@x.y')
  assert.deepEqual(await buildProgress(pool, id), [], 'no build yet')
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state) values ($1, 'b-mine', 'h1', 'claiming'), ($2, 'b-theirs', 'h2', 'failed')`,
    [id, other]
  )
  const out = await buildProgress(pool, id)
  assert.deepEqual(
    out.map((b) => b.creation),
    ['claiming'],
    "the asker's own build, and not the other account's"
  )
})

test(
  'teamOf: an editor sees names and roles only; an owner also sees emails and waiting invitations',
  opts,
  async () => {
    const { pool } = db
    await site(pool, 'a.localhost')
    await seat(pool, 'a.localhost', 'owner@x.y', 'owner')
    await seat(pool, 'a.localhost', 'ed@x.y', 'editor')
    await seat(pool, 'a.localhost', 'wait@x.y', 'editor', false)
    const asEditor = await teamOf(pool, 'a.localhost', 'editor')
    assert.equal(asEditor.members.length, 2)
    assert.ok(!JSON.stringify(asEditor).includes('@'))
    assert.equal(asEditor.invitationsWaiting, undefined)
    const asViewer = await teamOf(pool, 'a.localhost', 'viewer')
    assert.ok(!JSON.stringify(asViewer).includes('@'))
    const asOwner = await teamOf(pool, 'a.localhost', 'owner')
    assert.ok(asOwner.members.some((m) => m.email === 'owner@x.y'))
    assert.equal(asOwner.invitationsWaiting, 1)
  }
)

// ── what reaches the model ───────────────────────────────────────────────────────────────────────
import { readAskerContext } from '../src/assistant/context.js'
import { navigationFor, systemPrompt } from '../src/assistant/prompt.js'
import { accountByEmail, sitesOfAccount } from '../src/seats/store.js'
import { siteByKey } from '../src/sites/store.js'
import { briefOf } from '../src/sites/brief-store.js'
import { canonicalSiteKey, publicSiteFields } from '../src/sites/address.js'

const readers = { accountByEmail, sitesOfAccount, siteByKey, briefOf, publicSiteFields, canonicalSiteKey }
const promptFor = async (pool, email, currentSite) => {
  const ctx = await readAskerContext(pool, readers, { email, currentSite })
  return systemPrompt(ctx, navigationFor(ctx), new Date('2026-10-07T00:00:00Z'))
}

test(
  'the prompt carries the site on screen’s facts and none of the turn, comment or notification text',
  opts,
  async () => {
    const { pool } = db
    await site(pool, 'a.localhost')
    const owner = await seat(pool, 'a.localhost', 'owner@x.y', 'owner')
    await pool.query(
      `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, reply, state, closed_at, end_reason)
     values ('t1', 'a.localhost', 's', 1, 'x@y.z', 'SECRET TITLE', 'SECRET REPLY', 'closed', now(), 'completed')`
    )
    await pool.query(
      `insert into notification (account_id, kind, data) values ($1, 'comment.mention', '{"text":"SECRET BODY"}')`,
      [owner]
    )
    const prompt = await promptFor(pool, 'owner@x.y', 'a.localhost')
    assert.match(prompt, /Last agent turn: opened .*\(completed\)/)
    assert.match(prompt, /Inbox unread: 1/)
    for (const leak of ['SECRET TITLE', 'SECRET REPLY', 'SECRET BODY'])
      assert.ok(!prompt.includes(leak), leak)
  }
)

test('an editor’s prompt lists teammates without emails; an owner’s lists them', opts, async () => {
  const { pool } = db
  await site(pool, 'a.localhost')
  await seat(pool, 'a.localhost', 'owner@x.y', 'owner')
  await seat(pool, 'a.localhost', 'ed@x.y', 'editor')
  const asEditor = await promptFor(pool, 'ed@x.y', 'a.localhost')
  const teamLine = /Team: .*/.exec(asEditor)[0]
  assert.ok(!teamLine.includes('owner@x.y'))
  const asOwner = await promptFor(pool, 'owner@x.y', 'a.localhost')
  assert.ok(/Team: .*owner@x\.y/.test(asOwner))
})

test('without a site on screen no per-site reader runs', opts, async () => {
  const { pool } = db
  await site(pool, 'a.localhost')
  await seat(pool, 'a.localhost', 'owner@x.y', 'owner')
  const seen = []
  const spy = { query: (...a) => (seen.push(String(a[0])), pool.query(...a)) }
  await readAskerContext(spy, readers, { email: 'owner@x.y', currentSite: null })
  assert.ok(!seen.some((q) => /from site_turn|from site_comment|from site_name/.test(q)))
})

test('a reader that cannot read leaves a "cannot see" line, not a guess', opts, async () => {
  const { pool } = db
  await site(pool, 'a.localhost')
  await seat(pool, 'a.localhost', 'owner@x.y', 'owner')
  const real = pool.query.bind(pool)
  const flaky = {
    query: (q, p) => (/from site_turn/.test(String(q)) ? Promise.reject(new Error('down')) : real(q, p))
  }
  const ctx = await readAskerContext(flaky, readers, { email: 'owner@x.y', currentSite: 'a.localhost' })
  const prompt = systemPrompt(ctx, navigationFor(ctx), new Date('2026-10-07T00:00:00Z'))
  assert.match(prompt, /Recent activity: not available right now \(say you cannot see it, do not guess\)/)
  assert.match(prompt, /Own domain: none/)
})

// ── Own domain: Help says what the Domains card says (21/10/2026) ───────────────────────────────────────
// Help told every person with an own domain "routing and TLS not available yet", from 07/10 on, long after
// routing (08/10) and Cloudflare for SaaS (09/10) shipped. The line now follows the card's own rule
// (`sites/address.js` `shownConnected`, `site-domain-provider.js` `gateOf`).
import { domainLine, guideFacts } from '../src/assistant/prompt.js'

async function ownDomain(pool, siteKey, row = {}, hostname = null) {
  const r = {
    name: 'www.example.com',
    state: 'pending',
    token: 'tok1',
    ownership_proven_at: null,
    routing_verified_at: null,
    connected_at: null,
    ...row
  }
  await pool.query(
    `insert into site_name (name, site_key, kind, state, token, ownership_proven_at, routing_verified_at, connected_at)
     values ($1, $2, 'custom', $3, $4, $5, $6, $7)`,
    [r.name, siteKey, r.state, r.token, r.ownership_proven_at, r.routing_verified_at, r.connected_at]
  )
  if (hostname)
    await pool.query(
      `insert into site_custom_hostname (name, zone_id, site_key, token, state, hostname_status, ssl_status, reason)
       values ($1, 'z', $2, $3, $4, $5, $6, $7)`,
      [
        r.name,
        siteKey,
        r.token,
        hostname.state ?? 'created',
        hostname.status,
        hostname.ssl,
        hostname.reason ?? null
      ]
    )
}
const NOW = '2026-10-21T00:00:00Z'

test(
  'domainState follows the card: waiting for TXT, then CNAME, then the certificate, then connected',
  opts,
  async () => {
    const { pool } = db
    await site(pool, 'a.localhost')
    assert.equal(await domainState(pool, 'a.localhost'), null)

    await ownDomain(pool, 'a.localhost')
    assert.equal((await domainState(pool, 'a.localhost')).status, 'waiting_ownership')

    await pool.query("update site_name set ownership_proven_at = $1 where name = 'www.example.com'", [NOW])
    assert.equal((await domainState(pool, 'a.localhost')).status, 'waiting_routing')

    await pool.query("update site_name set routing_verified_at = $1 where name = 'www.example.com'", [NOW])
    assert.equal((await domainState(pool, 'a.localhost')).status, 'waiting_certificate')

    await pool.query(
      "update site_name set state = 'active', connected_at = $1 where name = 'www.example.com'",
      [NOW]
    )
    assert.equal(
      (await domainState(pool, 'a.localhost')).status,
      'connected',
      'no hostname row: the legacy path'
    )
  }
)

test('a connected domain whose certificate is not active yet is not called connected', opts, async () => {
  const { pool } = db
  await site(pool, 'a.localhost')
  await ownDomain(
    pool,
    'a.localhost',
    { state: 'active', ownership_proven_at: NOW, routing_verified_at: NOW, connected_at: NOW },
    { status: 'active', ssl: 'pending_validation' }
  )
  assert.equal((await domainState(pool, 'a.localhost')).status, 'waiting_certificate')
  await pool.query("update site_custom_hostname set ssl_status = 'active'")
  assert.equal((await domainState(pool, 'a.localhost')).status, 'connected')
  await pool.query("update site_custom_hostname set reason = 'HOSTNAME_UNREAD'")
  assert.equal(
    (await domainState(pool, 'a.localhost')).status,
    'waiting_certificate',
    'a hostname read with a fault'
  )
})

test('the Help line for an own domain never says routing and TLS are unavailable', () => {
  for (const status of [
    'connected',
    'waiting_ownership',
    'waiting_routing',
    'waiting_certificate',
    undefined
  ]) {
    const line = domainLine({ name: 'www.example.com', status })
    assert.ok(!/not available yet/.test(line), line)
    assert.ok(line.includes('www.example.com'))
  }
  assert.match(domainLine({ name: 'a.b.c', status: 'connected' }), /CONNECTED/)
  assert.match(domainLine({ name: 'a.b.c', status: 'waiting_ownership' }), /TXT record/)
  assert.match(domainLine({ name: 'a.b.c', status: 'waiting_routing' }), /CNAME record/)
  assert.match(domainLine({ name: 'a.b.c', status: 'weird' }), /not known right now/)
  assert.equal(domainLine(null), '  Own domain: none')
})

test('guideFacts lists what Tracy can do, puts the matching article in full, and drops a switched-off feature', () => {
  const ctx = {
    current: { name: 'shop', platform: 'wordpress', role: 'editor', workspaceUrl: 'https://x.test/shop/' }
  }
  const text = guideFacts(ctx, [], 'how do I connect my own domain')
  assert.match(text, /Connect your own domain \(DNS\) \(own-domain\)/)
  assert.match(text, /Guide text for this conversation:/)
  assert.match(text, /A TXT record at `_tracy\./)
  assert.match(text, /Your role on this site \(editor\) cannot do this\. It takes an Owner/)
  assert.match(text, /Screen: https:\/\/x\.test\/shop\/\?tab=tracy:site-publish&site=shop/)
  // The operator switched Connect domain off: the feature is not offered at all.
  const off = guideFacts(ctx, ['site-connect-domain'], 'how do I connect my own domain')
  assert.ok(!off.includes('own-domain'))
  assert.ok(!off.includes('_tracy.'))
  // Nothing asked: only the list.
  assert.ok(!guideFacts(ctx, []).includes('Guide text for this conversation'))
})
