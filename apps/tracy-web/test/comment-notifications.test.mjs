/**
 * Comment notifications (spec #809 cases C1–C3, rules R1–R3), through the real comment doors
 * (`src/sites/comments.js` → `src/sites/comment-notify.js` → the notifier → the letters), against
 * Postgres: each case checks the Inbox rows written and the emails sent.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { createSite } from '../src/sites/store.js'
import { pageOf, quoteOf } from '../src/sites/comment-notify.js'
import { fileDb } from './_db.mjs'

/** Letter HTML as the reader sees it: the invisible joiners that stop autolinks taken out. */
const visible = (html) => String(html).replaceAll('&zwnj;', '')

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const SECRET = 's'.repeat(32)
const SITE = 'kinetic.vn'
const OTHER = 'harbor.example'

// One migrated database for the file, emptied before each test (`fileDb` in `_db.mjs`): a fresh schema
// per test re-ran all of the migrations for every test.
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** A site with Lee (owner), Akemi and David (editors), Vincent on another site only, and Hano whose
 * seat on this site was revoked. Every email sent lands in `sent`. */
async function world(_t) {
  const { pool } = db
  const cfg = readConfig({
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: SECRET,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  await createSite(pool, { siteKey: SITE, label: 'kinetic', host: 'local' })
  await createSite(pool, { siteKey: OTHER, label: 'harbor', host: 'local' })
  const seat = async (email, name, siteKey, role, { revoked = false } = {}) => {
    const { rows } = await pool.query(
      `insert into account (email, display_name) values ($1, $2)
       on conflict (email) do update set email = excluded.email returning id`,
      [email, name]
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at, revoked_at)
       values ($1, $2, $3, $2, now(), $4)`,
      [siteKey, rows[0].id, role, revoked ? new Date() : null]
    )
    return rows[0].id
  }
  const ids = {
    lee: await seat('lee@lab3.example', 'Lee', SITE, 'owner'),
    akemi: await seat('akemi@lab3.example', 'Akemi', SITE, 'editor'),
    david: await seat('david@lab3.example', 'David', SITE, 'editor'),
    vincent: await seat('vincent@lab3.example', 'Vincent', OTHER, 'owner'),
    hano: await seat('hano@lab3.example', 'Hano', SITE, 'editor', { revoked: true })
  }
  const sent = []
  const app = buildApp({
    config: cfg,
    pool,
    mail: { send: async (m) => sent.push(m) },
    sites: dbSitesResolver(pool, cfg),
    host: { hostCall, hostJob }
  })
  const call = async (email, method, path, body) => {
    const headers = { cookie: `tracy_sess=${await mintSession(email, SECRET)}` }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    )
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const base = `/api/sites/${SITE}/comments`
  const post = async (email, body) => {
    const res = await call(email, 'POST', base, { url: 'http://kinetic.localhost/', element: null, ...body })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    return res.body.comment
  }
  /** Every notification row, oldest first, with who it is for by name. */
  const rows = async () => {
    const { rows } = await pool.query(
      `select n.*, a.display_name as who from notification n join account a on a.id = n.account_id
        order by n.created_at, n.id`
    )
    return rows
  }
  return { pool, app, call, post, base, ids, sent, rows }
}

test('C1: a picked mention tells that person once, in the Inbox and by email', opts, async (t) => {
  const { post, ids, sent, rows } = await world(t)
  const made = await post('lee@lab3.example', {
    text: '@Akemi is this banner colour approved?',
    mentions: [ids.akemi]
  })
  assert.deepEqual(made.mentions, [ids.akemi], 'the row carries who it names')
  const [row, ...rest] = await rows()
  assert.equal(rest.length, 0)
  assert.equal(row.who, 'Akemi')
  assert.equal(row.kind, 'comment.mention')
  assert.equal(row.actor_account_id, ids.lee)
  assert.deepEqual(row.data, {
    quote: '@Akemi is this banner colour approved?',
    page: '/',
    n: made.n,
    commentId: made.id
  })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'akemi@lab3.example')
  assert.equal(sent[0].subject, 'Lee mentioned you in a comment on kinetic.vn')
  assert.match(sent[0].text, /“@Akemi is this banner colour approved\?”/)
  assert.match(sent[0].text, /Home page/)
  // The internal comment number is not in the letter; the button opens that comment.
  assert.doesNotMatch(sent[0].text, /comment #/)
  assert.match(
    sent[0].text,
    new RegExp(
      `View comment: http://tracy.test:8080/kinetic.vn/\\?open=browser&page=/&mode=edit&comment=${made.id}`
    )
  )
  assert.match(visible(sent[0].html), /&nbsp; Mention</)
})

test('C1: a typed @name nobody picked is plain text and tells nobody', opts, async (t) => {
  const { post, sent, rows } = await world(t)
  const made = await post('lee@lab3.example', { text: '@Akemi what do you think?' })
  assert.deepEqual(made.mentions, [])
  assert.equal((await rows()).length, 0)
  assert.equal(sent.length, 0)
})

test('C1: a mentioned non-member, a revoked seat and a bad id are dropped, not stored', opts, async (t) => {
  const { post, ids, sent, rows, pool } = await world(t)
  const made = await post('lee@lab3.example', {
    text: 'Ping @Vincent @Hano @David',
    mentions: [ids.vincent, ids.hano, 'not-an-id', ids.david, ids.david]
  })
  assert.deepEqual(made.mentions, [ids.david])
  const stored = await pool.query('select mentions from site_comment where id = $1', [made.id])
  assert.deepEqual(stored.rows[0].mentions, [ids.david])
  assert.deepEqual(
    (await rows()).map((r) => r.who),
    ['David']
  )
  assert.deepEqual(
    sent.map((m) => m.to),
    ['david@lab3.example']
  )
})

test('C1 on edit: only the people the edit adds are told', opts, async (t) => {
  const { call, post, base, ids, sent, rows } = await world(t)
  const made = await post('lee@lab3.example', { text: '@Akemi look', mentions: [ids.akemi] })
  const edited = await call('lee@lab3.example', 'PATCH', `${base}/${made.id}`, {
    text: '@Akemi @David look',
    mentions: [ids.akemi, ids.david]
  })
  assert.equal(edited.status, 200)
  assert.deepEqual(edited.body.comment.mentions, [ids.akemi, ids.david])
  assert.deepEqual(
    (await rows()).map((r) => [r.who, r.data.quote]),
    [
      ['Akemi', '@Akemi look'],
      ['David', '@Akemi @David look']
    ]
  )
  // An edit of the words alone keeps the list and tells nobody again.
  await call('lee@lab3.example', 'PATCH', `${base}/${made.id}`, { text: '@Akemi @David look again' })
  assert.equal((await rows()).length, 2)
  assert.equal(sent.length, 2)
})

test('C2: a reply tells the root author and earlier repliers, never the actor', opts, async (t) => {
  const { post, ids, sent, rows } = await world(t)
  const root = await post('akemi@lab3.example', { text: 'Swap the hero image' })
  await post('lee@lab3.example', { text: 'Can we try a darker one?', replyTo: root.id })
  sent.length = 0
  const reply = await post('david@lab3.example', { text: 'Done, I swapped the image.', replyTo: root.id })
  const replies = (await rows()).filter((r) => r.kind === 'comment.reply')
  // Lee's reply told Akemi; David's tells Akemi (yours) and Lee (a thread he is in).
  const david = replies.filter((r) => r.actor_account_id === ids.david)
  assert.deepEqual(david.map((r) => [r.who, r.data.yours]).sort(), [
    ['Akemi', true],
    ['Lee', false]
  ])
  for (const r of david) {
    assert.equal(r.ref, `thread:${root.id}`)
    assert.deepEqual(
      { quote: r.data.quote, page: r.data.page, n: r.data.n, commentId: r.data.commentId },
      { quote: 'Done, I swapped the image.', page: '/', n: reply.n, commentId: reply.id }
    )
  }
  assert.ok(!replies.some((r) => r.account_id === r.actor_account_id), 'R2: never the actor')
  // Lee had no reply mail in this thread before: his goes at once. Akemi had one a moment ago
  // (Lee's reply), so hers is held for the 5-minute group.
  assert.deepEqual(
    sent.map((m) => [m.to, m.subject]),
    [['lee@lab3.example', 'David replied on kinetic.vn']]
  )
  assert.match(sent[0].text, /View thread: /)
  assert.equal(david.find((r) => r.who === 'Akemi').mail_state, 'held')
})

test('C2: later replies inside 5 minutes go out as ONE grouped email', opts, async (t) => {
  const { app, pool, post, sent } = await world(t)
  const root = await post('akemi@lab3.example', { text: 'Swap the hero image' })
  await post('david@lab3.example', { text: 'Done, I swapped the image.', replyTo: root.id })
  await post('lee@lab3.example', { text: 'Can we try a darker one?', replyTo: root.id })
  await post('david@lab3.example', { text: 'Sure, uploading now.', replyTo: root.id })
  const toAkemi = () => sent.filter((m) => m.to === 'akemi@lab3.example')
  assert.deepEqual(
    toAkemi().map((m) => m.subject),
    ['David replied on kinetic.vn'],
    'the first email at once'
  )
  await pool.query(
    `update notification set mail_due_at = now() - interval '1 second' where mail_state = 'held'`
  )
  await app.notifier.deliverDue()
  const grouped = toAkemi()[1]
  assert.equal(grouped.subject, '2 new replies on kinetic.vn')
  assert.match(grouped.text, /Lee: “Can we try a darker one\?”\n\nDavid: “Sure, uploading now\.”/)
  assert.equal(toAkemi().length, 2)
})

test('R1: a reply that also mentions the root author tells them once, as a mention', opts, async (t) => {
  const { post, ids, rows, sent } = await world(t)
  const root = await post('akemi@lab3.example', { text: 'Swap the hero image' })
  await post('lee@lab3.example', { text: '@Akemi done', replyTo: root.id, mentions: [ids.akemi] })
  assert.deepEqual(
    (await rows()).map((r) => [r.who, r.kind]),
    [['Akemi', 'comment.mention']]
  )
  assert.deepEqual(
    sent.map((m) => m.subject),
    ['Lee mentioned you in a comment on kinetic.vn']
  )
})

test('R2: mentioning yourself, or replying in your own thread, tells nobody', opts, async (t) => {
  const { post, ids, rows } = await world(t)
  const root = await post('akemi@lab3.example', { text: 'Note to self @Akemi', mentions: [ids.akemi] })
  await post('akemi@lab3.example', { text: 'And another', replyTo: root.id })
  assert.equal((await rows()).length, 0)
})

test(
  'C3: resolve and reopen tell the root author; a reply that reopens sends no "reopened"',
  opts,
  async (t) => {
    const { call, post, base, sent, rows } = await world(t)
    const root = await post('akemi@lab3.example', { text: 'Change the phone number in the footer' })
    assert.equal((await call('lee@lab3.example', 'POST', `${base}/${root.id}/resolve`)).status, 200)
    assert.equal((await call('lee@lab3.example', 'POST', `${base}/${root.id}/reopen`)).status, 200)
    assert.deepEqual(
      (await rows()).map((r) => [r.who, r.kind, r.data]),
      [
        [
          'Akemi',
          'comment.resolved',
          { quote: 'Change the phone number in the footer', page: '/', n: root.n, commentId: root.id }
        ],
        [
          'Akemi',
          'comment.reopened',
          { quote: 'Change the phone number in the footer', page: '/', n: root.n, commentId: root.id }
        ]
      ]
    )
    assert.deepEqual(
      sent.map((m) => m.subject),
      ['Lee resolved your comment on kinetic.vn', 'Lee reopened your comment on kinetic.vn']
    )
    assert.match(visible(sent[0].html), /&nbsp; Resolved</)
    assert.match(visible(sent[1].html), /&nbsp; Reopened</)
    // Resolving twice is no change and no second notification; the author resolving tells nobody.
    await call('akemi@lab3.example', 'POST', `${base}/${root.id}/resolve`)
    await call('akemi@lab3.example', 'POST', `${base}/${root.id}/resolve`)
    const before = (await rows()).length
    // David's reply reopens it: Akemi hears of the reply only.
    await post('david@lab3.example', { text: 'Not done yet', replyTo: root.id })
    const after = (await rows()).slice(before)
    assert.deepEqual(
      after.map((r) => [r.who, r.kind]),
      [['Akemi', 'comment.reply']]
    )
  }
)

test('R3: deleting a comment marks every row about it, blanks the quote, sends nothing', opts, async (t) => {
  const { app, call, post, base, ids, sent, rows, pool } = await world(t)
  const root = await post('akemi@lab3.example', { text: 'Swap the hero image' })
  await post('david@lab3.example', { text: 'first', replyTo: root.id })
  const second = await post('lee@lab3.example', {
    text: '@David second',
    replyTo: root.id,
    mentions: [ids.david]
  })
  const mailsBefore = sent.length
  const heldBefore = (await rows()).filter((r) => r.data.commentId === second.id && r.mail_state === 'held')
  assert.equal(heldBefore.length, 1, "Akemi's reply mail from Lee is held for the group")
  assert.equal((await call('lee@lab3.example', 'DELETE', `${base}/${second.id}`)).status, 200)
  const about = (await rows()).filter((r) => r.data.commentId === second.id)
  assert.equal(about.length, 2)
  for (const r of about) {
    assert.equal(r.data.deleted, true)
    assert.equal(r.data.quote, '')
    assert.ok(r.mail_state !== 'held' && r.mail_state !== 'pending', 'no email still owed')
  }
  await pool.query(
    `update notification set mail_due_at = now() - interval '1 second' where mail_state = 'held'`
  )
  await app.notifier.deliverDue()
  assert.equal(sent.length, mailsBefore, 'a delete sends no email, and the held one is dropped')
  // Rows about other comments are untouched.
  const others = (await rows()).filter((r) => r.data.commentId !== second.id)
  assert.ok(others.every((r) => r.data.deleted === undefined))
})

test('R3 through Delete all on a page: every cleared comment is marked', opts, async (t) => {
  const { call, post, base, ids, rows } = await world(t)
  const a = await post('lee@lab3.example', { text: '@Akemi one', mentions: [ids.akemi] })
  await post('lee@lab3.example', { text: '@Akemi two', mentions: [ids.akemi] })
  const cleared = await call('lee@lab3.example', 'POST', `${base}/clear`, {
    url: 'http://kinetic.localhost/'
  })
  assert.equal(cleared.status, 200)
  assert.ok(cleared.body.cleared.includes(a.id))
  assert.ok((await rows()).every((r) => r.data.deleted === true))
})

test('the picker roster lists live seats of this site only', opts, async (t) => {
  const { call, ids } = await world(t)
  const res = await call('akemi@lab3.example', 'GET', `/api/sites/${SITE}/comments/people`)
  assert.equal(res.status, 200)
  assert.deepEqual(
    res.body.people.map((p) => [p.name, p.email, p.role, p.you]),
    [
      ['Akemi', 'akemi@lab3.example', 'editor', true],
      ['David', 'david@lab3.example', 'editor', false],
      ['Lee', 'lee@lab3.example', 'owner', false]
    ]
  )
  assert.equal(res.body.people[0].accountId, ids.akemi)
  assert.equal(res.body.people[0].initial, 'A')
  const stranger = await call('vincent@lab3.example', 'GET', `/api/sites/${SITE}/comments/people`)
  assert.equal(stranger.status, 403)
})

test('quote and page: trimmed words, the page path', () => {
  assert.equal(quoteOf('  a\n\nb  '), 'a b')
  const long = 'word '.repeat(60)
  const q = quoteOf(long)
  assert.ok(q.length <= 140 && q.endsWith('…'), q)
  assert.equal(pageOf('http://kinetic.localhost/'), '/')
  assert.equal(pageOf('http://kinetic.localhost/about/?x=1'), '/about')
  assert.equal(pageOf('not a url'), '/')
})

test('C3: the View comment link opens the page the comment sits on', opts, async (t) => {
  const { call, post, base, sent } = await world(t)
  const root = await post('akemi@lab3.example', {
    text: 'Fix the about photo',
    url: 'http://kinetic.localhost/about'
  })
  assert.equal((await call('lee@lab3.example', 'POST', `${base}/${root.id}/resolve`)).status, 200)
  const href = visible(sent[0].html)
    .match(/<a href="([^"]+)"[^>]*>View comment<\/a>/)?.[1]
    ?.replaceAll('&amp;', '&')
  assert.ok(href, 'the letter has a View comment button')
  assert.equal(new URL(href).searchParams.get('page'), '/about')
})

test('letter links are built on TRACY_ORIGIN only: no origin fails at startup, never a production fallback', () => {
  const cfg = readConfig({
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: SECRET,
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://tracy-host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  })
  const mail = { send: async () => {} }
  for (const origin of ['', undefined]) {
    assert.throws(
      () => buildApp({ config: { ...cfg, origin }, pool: {}, mail }),
      /TRACY_ORIGIN is required/,
      `origin ${JSON.stringify(origin)}`
    )
  }
  assert.doesNotThrow(() => buildApp({ config: cfg, pool: {}, mail }))
})
