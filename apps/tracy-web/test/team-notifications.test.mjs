// Team notifications (spec #809, step 3), end to end through the real doors: for each case, who
// gets an Inbox row, who gets an email and with which subject, and that the person who acted gets
// nothing (rule R2).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { letterFor } from '../src/mail/letters/index.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

/** Letter HTML as the reader sees it: the invisible joiners that stop autolinks taken out. */
const visible = (html) => String(html).replaceAll('&zwnj;', '')

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const SITE = 'kinetic.vn'

/** One app over the test database, with every mail captured instead of sent. */
async function world() {
  const { pool } = db
  const sent = []
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async (m) => void sent.push(m) },
    sites: dbSitesResolver(pool, config)
  })
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [SITE, 'kinetic', 'local'])

  /** An account with a display name, and optionally a seat on the site. */
  const person = async (
    name,
    { role = null, status = 'accepted', grantedBy = null, language = null } = {}
  ) => {
    const email = `${name.toLowerCase()}@lab3.example`
    const { rows } = await pool.query(
      'insert into account (email, display_name, language) values ($1, $2, $3) returning id',
      [email, name, language]
    )
    const id = rows[0].id
    if (role) {
      await pool.query(
        `insert into seat (site_key, account_id, role, granted_by, accepted_at, requested_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          SITE,
          id,
          role,
          grantedBy ?? id,
          status === 'accepted' ? new Date() : null,
          status === 'requested' ? new Date() : null
        ]
      )
    }
    return { id, email, name }
  }

  const call = async (who, method, path, body) => {
    // `who: null` is a visitor with no session (the decline link works signed out).
    const headers = who ? { cookie: `tracy_sess=${await mintSession(who.email, config.sessionSecret)}` } : {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { status: res.status, text, json }
  }

  /** Every notification row, as `kind → recipient` lines, plus their data and settled state. */
  const rows = async () =>
    (
      await pool.query(
        `select n.kind, a.email, n.data, n.ref, n.settled_at, n.mail_state
           from notification n join account a on a.id = n.account_id order by n.created_at, a.email`
      )
    ).rows
  const mailTo = (who) => sent.filter((m) => m.to === who.email)
  const tokenOf = (mail) => mail.text.match(/\/invite\/([\w.-]+)/)[1]

  return { pool, sent, person, call, rows, mailTo, tokenOf }
}

test(
  'T1: an invitation writes an Inbox row and sends the one invitation mail, with Decline',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const res = await w.call(akemi, 'POST', '/api/team/invite', {
      emails: ['vincent@lab3.example'],
      role: 'editor',
      siteKeys: [SITE]
    })
    assert.equal(res.status, 200)
    const rows = await w.rows()
    assert.deepEqual(
      rows.map((r) => [r.kind, r.email, r.data, r.mail_state]),
      [['team.invited', 'vincent@lab3.example', { role: 'editor' }, 'none']]
    )
    assert.equal(w.sent.length, 1, 'one mail: the invitation itself')
    const [mail] = w.sent
    assert.equal(mail.to, 'vincent@lab3.example')
    assert.equal(mail.subject, 'Akemi invited you to join kinetic.vn')
    assert.match(
      visible(mail.html),
      /Akemi \(akemi@lab3\.example\) has invited you to work on kinetic\.vn in Tracy\./
    )
    assert.match(
      visible(mail.html),
      /Not for you\? <a href="http:\/\/tracy\.test\/invite\/[\w.-]+\/decline"[^>]*>Decline<\/a>/
    )
    assert.match(mail.text, /Not for you\? Decline \(http:\/\/tracy\.test\/invite\/[\w.-]+\/decline\)/)
    assert.equal(w.mailTo(akemi).length, 0, 'the inviter gets nothing')
  }
)

test('T6 from the mail: the page asks first, the button declines, the inviter is told', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  await w.person('Vincent')
  await w.call(akemi, 'POST', '/api/team/invite', {
    emails: ['vincent@lab3.example'],
    role: 'editor',
    siteKeys: [SITE]
  })
  const token = w.tokenOf(w.sent[0])
  w.sent.length = 0

  // Opening the link declines nothing, signed in or not.
  const page = await w.call(null, 'GET', `/invite/${token}/decline`)
  assert.equal(page.status, 200)
  assert.match(page.text, /Decline this invitation\?/)
  assert.equal((await w.rows()).filter((r) => r.kind === 'team.invite_declined').length, 0)

  const declined = await w.call(null, 'POST', `/invite/${token}/decline`)
  assert.equal(declined.status, 200)
  assert.deepEqual(declined.json, { declined: [SITE] })
  const told = (await w.rows()).filter((r) => r.kind === 'team.invite_declined')
  assert.deepEqual(
    told.map((r) => r.email),
    ['akemi@lab3.example']
  )
  assert.deepEqual(
    w.sent.map((m) => [m.to, m.subject]),
    [['akemi@lab3.example', 'Vincent declined your invitation to kinetic.vn']]
  )
  assert.match(visible(w.sent[0].html), /Vincent \(vincent@lab3\.example\) won’t be joining kinetic\.vn\./)

  const again = await w.call(null, 'GET', `/invite/${token}/decline`)
  assert.match(again.text, /Invitation declined/)
  const twice = await w.call(null, 'POST', `/invite/${token}/decline`)
  assert.deepEqual(twice.json, { declined: [] })
  assert.equal(w.sent.length, 1, 'declining twice tells the inviter once')
})

test('T6 from My Sites: Decline answers like the workspace door and tells the inviter', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const vincent = await w.person('Vincent')
  await w.call(akemi, 'POST', '/api/team/invite', {
    emails: [vincent.email],
    role: 'editor',
    siteKeys: [SITE]
  })
  w.sent.length = 0

  const res = await w.call(vincent, 'POST', `/api/sites/${SITE}/decline`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { declined: true })
  assert.deepEqual(
    w.sent.map((m) => [m.to, m.subject]),
    [['akemi@lab3.example', 'Vincent declined your invitation to kinetic.vn']]
  )
  assert.equal(w.mailTo(vincent).length, 0)
  assert.deepEqual((await w.call(vincent, 'POST', `/api/sites/${SITE}/decline`)).json, { declined: true })
  assert.equal(w.sent.length, 1)

  // A seat already held is left, not declined; a stranger has nothing to decline.
  const lee = await w.person('Lee', { role: 'editor' })
  assert.equal((await w.call(lee, 'POST', `/api/sites/${SITE}/decline`)).status, 409)
  const nobody = await w.person('Nobody')
  assert.equal((await w.call(nobody, 'POST', `/api/sites/${SITE}/decline`)).status, 403)
})

test('T2: a join request reaches every Owner (and no Editor), each in their own language', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const lee = await w.person('Lee', { role: 'owner', language: 'vi' })
  const hano = await w.person('Hano', { role: 'editor' })
  const vincent = await w.person('Vincent')

  const res = await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
  assert.equal(res.status, 201)
  const rows = await w.rows()
  assert.deepEqual(rows.map((r) => [r.kind, r.email]).sort(), [
    ['team.join_request', akemi.email],
    ['team.join_request', lee.email]
  ])
  assert.ok(rows.every((r) => r.ref === `join:${SITE}:${vincent.id}`))
  assert.deepEqual(
    w.mailTo(akemi).map((m) => m.subject),
    ['Vincent asked to join kinetic.vn']
  )
  assert.deepEqual(
    w.mailTo(lee).map((m) => m.subject),
    ['Vincent xin tham gia kinetic.vn']
  )
  assert.match(
    visible(w.mailTo(akemi)[0].html),
    /href="http:\/\/tracy\.test\/kinetic\.vn\?open=my-sites&amp;team=kinetic\.vn&amp;member=vincent%40lab3\.example"/
  )
  assert.equal(w.mailTo(hano).length + w.mailTo(vincent).length, 0)
})

test(
  'T2b + T3 + T7: approving a request sends "You now have access", never the invitation',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const lee = await w.person('Lee', { role: 'owner' })
    const hano = await w.person('Hano', { role: 'editor' })
    const vincent = await w.person('Vincent')
    await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
    w.sent.length = 0

    const res = await w.call(akemi, 'POST', '/api/team/invite', {
      emails: [vincent.email],
      role: 'editor',
      siteKeys: [SITE]
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.results[0].sites[0].outcome, 'approved')

    assert.deepEqual(
      w.mailTo(vincent).map((m) => m.subject),
      ['You now have access to kinetic.vn']
    )
    assert.match(
      visible(w.mailTo(vincent)[0].html),
      /Akemi \(akemi@lab3\.example\) approved your request\. You’ve joined kinetic\.vn as an Editor/
    )
    assert.match(visible(w.mailTo(vincent)[0].html), />Open kinetic\.vn<\/a>/)
    assert.doesNotMatch(w.mailTo(vincent)[0].text, /\/invite\//, 'no invitation link')
    assert.deepEqual(
      w
        .mailTo(lee)
        .map((m) => m.subject)
        .sort(),
      ['Akemi approved Vincent’s request to join kinetic.vn', 'Vincent joined kinetic.vn']
    )
    assert.deepEqual(
      w.mailTo(hano).map((m) => m.subject),
      ['Vincent joined kinetic.vn']
    )
    assert.equal(w.mailTo(akemi).length, 0, 'the approver gets nothing')

    const rows = await w.rows()
    const answered = rows.find((r) => r.kind === 'team.join_answered')
    assert.deepEqual(answered.data, {
      decision: 'approved',
      requesterName: 'Vincent',
      requesterEmail: vincent.email,
      role: 'editor'
    })
    assert.ok(
      rows.filter((r) => r.kind === 'team.join_request').every((r) => r.settled_at),
      'every admin row about the request is closed'
    )
    assert.equal(rows.filter((r) => r.email === akemi.email && r.kind !== 'team.join_request').length, 0)
  }
)

test('T2b + T4: declining a request tells the requester without naming who declined', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const lee = await w.person('Lee', { role: 'owner' })
  const vincent = await w.person('Vincent')
  await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
  w.sent.length = 0

  const res = await w.call(lee, 'DELETE', `/api/sites/${SITE}/seats/${vincent.id}`)
  assert.equal(res.status, 200)
  assert.deepEqual(
    w.mailTo(vincent).map((m) => m.subject),
    ['Your request to join kinetic.vn was declined']
  )
  assert.doesNotMatch(visible(w.mailTo(vincent)[0].html), /Lee/)
  assert.equal(buttons(w.mailTo(vincent)[0].html), 0)
  assert.deepEqual(
    w.mailTo(akemi).map((m) => m.subject),
    ['Lee declined Vincent’s request to join kinetic.vn']
  )
  assert.match(
    visible(w.mailTo(akemi)[0].html),
    /Lee \(lee@lab3\.example\) declined the request from Vincent \(vincent@lab3\.example\)\./
  )
  assert.equal(w.mailTo(lee).length, 0)
  assert.ok((await w.rows()).filter((r) => r.kind === 'team.join_request').every((r) => r.settled_at))
})

test('T5 + T7: accepting by link tells the inviter and the rest of the team, once each', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  const david = await w.person('David')
  await w.call(akemi, 'POST', '/api/team/invite', { emails: [david.email], role: 'editor', siteKeys: [SITE] })
  const token = w.tokenOf(w.sent[0])
  w.sent.length = 0

  const res = await w.call(david, 'GET', `/invite/${token}`)
  assert.equal(res.status, 200)
  assert.deepEqual(
    w.mailTo(akemi).map((m) => m.subject),
    ['David accepted your invitation to kinetic.vn']
  )
  assert.match(
    visible(w.mailTo(akemi)[0].html),
    /David \(david@lab3\.example\) has joined kinetic\.vn as an Editor\./
  )
  assert.deepEqual(
    w.mailTo(hano).map((m) => m.subject),
    ['David joined kinetic.vn']
  )
  assert.match(
    visible(w.mailTo(hano)[0].html),
    /David \(david@lab3\.example\) is now part of the kinetic\.vn team as an Editor\./
  )
  assert.match(visible(w.mailTo(hano)[0].html), /Akemi \(akemi@lab3\.example\) invited them\./)
  assert.equal(w.mailTo(david).length, 0, 'the new member gets nothing')
})

test('T5 from My Sites: Accept tells the inviter too', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const david = await w.person('David')
  await w.call(akemi, 'POST', '/api/team/invite', { emails: [david.email], role: 'editor', siteKeys: [SITE] })
  w.sent.length = 0
  assert.equal((await w.call(david, 'POST', `/api/sites/${SITE}/accept`)).status, 200)
  assert.deepEqual(
    w.sent.map((m) => [m.to, m.subject]),
    [['akemi@lab3.example', 'David accepted your invitation to kinetic.vn']]
  )
})

test('T8: removing a seat tells that person, with no button', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  assert.equal((await w.call(akemi, 'DELETE', `/api/sites/${SITE}/seats/${hano.id}`)).status, 200)
  assert.deepEqual(
    w.sent.map((m) => [m.to, m.subject]),
    [['hano@lab3.example', 'You no longer have access to kinetic.vn']]
  )
  assert.match(visible(w.sent[0].html), /Akemi \(akemi@lab3\.example\) removed you from the kinetic\.vn team/)
  assert.match(w.sent[0].text, /contact Akemi\./)
  assert.equal(buttons(w.sent[0].html), 0)
  assert.deepEqual(
    (await w.rows()).map((r) => [r.kind, r.email]),
    [['team.removed', hano.email]]
  )
})

test('T11: cancelling an invitation tells the invitee the earlier link no longer works', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const vincent = await w.person('Vincent')
  await w.call(akemi, 'POST', '/api/team/invite', {
    emails: [vincent.email],
    role: 'editor',
    siteKeys: [SITE]
  })
  w.sent.length = 0
  assert.equal((await w.call(akemi, 'DELETE', `/api/sites/${SITE}/seats/${vincent.id}`)).status, 200)
  assert.deepEqual(
    w.sent.map((m) => [m.to, m.subject]),
    [['vincent@lab3.example', 'Your invitation to kinetic.vn is no longer available']]
  )
  assert.match(visible(w.sent[0].html), /so the Accept link in the earlier email won’t work anymore\./)
  assert.equal(buttons(w.sent[0].html), 0)
  const cancelled = (await w.rows()).filter((r) => r.kind === 'team.invite_cancelled')
  assert.deepEqual(
    cancelled.map((r) => [r.email, r.data]),
    [[vincent.email, { role: 'editor' }]]
  )
})

test('T9: a role change tells that person, and nobody is told about their own change', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  assert.equal(
    (await w.call(akemi, 'PATCH', `/api/sites/${SITE}/seats/${hano.id}`, { role: 'owner' })).status,
    200
  )
  assert.deepEqual(
    w.sent.map((m) => [m.to, m.subject]),
    [['hano@lab3.example', 'Your role on kinetic.vn changed to Owner']]
  )
  assert.match(
    visible(w.sent[0].html),
    /Akemi \(akemi@lab3\.example\) changed your role from Editor to Owner\./
  )
  assert.deepEqual(
    (await w.rows()).map((r) => [r.kind, r.email, r.data]),
    [['team.role_changed', hano.email, { from: 'editor', to: 'owner' }]]
  )
  // Two owners now: one changes their own role. That is not news to anyone.
  w.sent.length = 0
  await w.pool.query('delete from notification')
  assert.equal(
    (await w.call(akemi, 'PATCH', `/api/sites/${SITE}/seats/${akemi.id}`, { role: 'editor' })).status,
    200
  )
  assert.equal(w.sent.length, 0)
  assert.equal((await w.rows()).length, 0)
})

test('T10: leaving tells every remaining teammate, and not the person who left', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const lee = await w.person('Lee', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  await w.person('Vincent', { role: 'editor', status: 'requested' })
  assert.equal((await w.call(hano, 'POST', `/api/sites/${SITE}/leave`)).status, 200)
  assert.deepEqual(w.sent.map((m) => [m.to, m.subject]).sort(), [
    [akemi.email, 'Hano left kinetic.vn'],
    [lee.email, 'Hano left kinetic.vn']
  ])
  assert.match(
    visible(w.sent[0].html),
    /Hano \(hano@lab3\.example\) is no longer on the kinetic\.vn team\. They were an Editor\./
  )
  assert.deepEqual((await w.rows()).map((r) => r.email).sort(), [akemi.email, lee.email])
})

/** How many call-to-action buttons a mail carries (the footer's links are not buttons). */
function buttons(html) {
  return (html.match(/<a href="[^"]*" style="display:inline-block/g) ?? []).length
}

test(
  'an answered invitation records its outcome on the invitee row; a cancel records none',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const [david, vincent] = [await w.person('David'), await w.person('Vincent')]
    await w.call(akemi, 'POST', '/api/team/invite', {
      emails: [david.email, vincent.email],
      role: 'editor',
      siteKeys: [SITE]
    })
    assert.equal((await w.call(david, 'POST', `/api/sites/${SITE}/accept`)).status, 200)
    assert.equal((await w.call(vincent, 'POST', `/api/sites/${SITE}/decline`)).status, 200)
    const invited = (await w.rows()).filter((r) => r.kind === 'team.invited')
    const of = (who) => invited.find((r) => r.email === who.email)
    assert.ok(of(david).settled_at)
    assert.equal(of(david).data.outcome, 'accepted')
    assert.ok(of(vincent).settled_at)
    assert.equal(of(vincent).data.outcome, 'declined')
  }
)

test(
  'every Team-targeting letter links to the Team tab of its site, on the person it is about',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const hano = await w.person('Hano', { role: 'editor' })
    const david = await w.person('David')
    await w.call(akemi, 'POST', '/api/team/invite', {
      emails: [david.email],
      role: 'editor',
      siteKeys: [SITE]
    })
    w.sent.length = 0
    assert.equal((await w.call(david, 'POST', `/api/sites/${SITE}/accept`)).status, 200)
    await new Promise((r) => setTimeout(r, 50))
    const button = (mail) => {
      const href = [...mail.html.matchAll(/<a href="([^"]+)"[^>]*>View team<\/a>/g)].map((m) =>
        m[1].replaceAll('&amp;', '&')
      )[0]
      assert.ok(href, `${mail.subject}: has a View team button`)
      return new URL(href)
    }
    // T5 to the inviter, T7 to the rest of the team: both name David.
    for (const mail of [w.mailTo(akemi)[0], w.mailTo(hano)[0]]) {
      assert.ok(mail, 'a letter was sent')
      const url = button(mail)
      assert.equal(url.pathname, `/${SITE}`)
      assert.equal(url.searchParams.get('open'), 'my-sites')
      assert.equal(url.searchParams.get('team'), SITE)
      assert.equal(url.searchParams.get('member'), david.email, `${mail.subject}: highlights the new member`)
    }
  }
)

test('T2b names the approved requester in its View team link', () => {
  const links = {
    team: (siteKey, member = null) =>
      `https://tracy.test/${siteKey}?open=my-sites&team=${siteKey}${member ? `&member=${encodeURIComponent(member)}` : ''}`,
    site: (k) => `https://tracy.test/${k}`,
    comment: () => 'https://tracy.test/',
    manage: () => 'https://tracy.test/?settings=notifications'
  }
  const render = (decision) =>
    letterFor({
      kind: 'team.join_answered',
      lang: 'en',
      rows: [
        {
          id: 'n',
          kind: 'team.join_answered',
          siteKey: SITE,
          actor: { id: 'a', email: 'lee@lab3.example', name: 'Lee' },
          data: { decision, requesterEmail: 'brian@lab3.example', role: 'editor' },
          createdAt: '2026-10-04T00:00:00Z'
        }
      ],
      recipient: { id: 'r', email: 'akemi@lab3.example' },
      links
    })
  assert.match(render('approved').html, /team=kinetic\.vn&amp;member=brian%40lab3\.example"/)
  assert.doesNotMatch(render('declined').html, /member=/)
})

test(
  'T2b: a requester with no display name is stored without a name, and named by the local part',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const lee = await w.person('Lee', { role: 'owner' })
    const vincent = await w.person('Vincent')
    await db.pool.query('update account set display_name = null where email = $1', [vincent.email])
    await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
    w.sent.length = 0
    await w.call(akemi, 'POST', '/api/team/invite', {
      emails: [vincent.email],
      role: 'editor',
      siteKeys: [SITE]
    })
    const answered = (await w.rows()).find((r) => r.kind === 'team.join_answered')
    assert.equal(answered.data.requesterName, null, 'the address is not stored as a name')
    assert.equal(answered.data.requesterEmail, vincent.email)
    const mail = w.mailTo(lee).find((m) => /request/.test(m.subject))
    assert.equal(mail.subject, 'Akemi approved vincent’s request to join kinetic.vn')
    assert.match(visible(mail.html), /vincent \(vincent@lab3\.example\)/)
  }
)

test('T2b letters written before the fix (the address stored as the name) still read by the local part', () => {
  const links = {
    team: (k) => `https://tracy.test/${k}`,
    site: (k) => `https://tracy.test/${k}`,
    comment: () => 'https://tracy.test/',
    manage: () => 'https://tracy.test/?settings=notifications'
  }
  const mail = letterFor({
    kind: 'team.join_answered',
    lang: 'en',
    rows: [
      {
        id: 'n',
        kind: 'team.join_answered',
        siteKey: SITE,
        actor: { id: 'a', email: 'akemi@lab3.example', name: 'Akemi' },
        data: {
          decision: 'declined',
          requesterName: 'vincent@lab3.example',
          requesterEmail: 'vincent@lab3.example'
        },
        createdAt: '2026-10-04T00:00:00Z'
      }
    ],
    recipient: { id: 'r', email: 'lee@lab3.example' },
    links
  })
  assert.doesNotMatch(mail.subject, /@/)
  assert.doesNotMatch(visible(mail.html), /vincent@lab3\.example \(/)
})

test(
  'Approve adds the requester at once: accepted seat, T3 and T2b, no invitation, the request rows settle',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const lee = await w.person('Lee', { role: 'owner' })
    const vincent = await w.person('Vincent')
    await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
    w.sent.length = 0
    // Exactly the body the Team tab's Approve sends (approveRequestInit in @tracy/core/team).
    const res = await w.call(akemi, 'POST', '/api/team/invite', {
      emails: [vincent.email],
      role: 'editor',
      siteKeys: [SITE]
    })
    assert.equal(res.status, 200)
    assert.equal(res.json.results[0].sites[0].outcome, 'approved')
    const seat = (
      await db.pool.query(
        'select role, accepted_at from seat s join account a on a.id = s.account_id where a.email = $1 and s.site_key = $2',
        [vincent.email, SITE]
      )
    ).rows[0]
    assert.equal(seat.role, 'editor')
    assert.ok(seat.accepted_at, 'the seat is accepted at once')
    const rows = await w.rows()
    assert.equal(rows.filter((r) => r.kind === 'team.invited').length, 0, 'no T1 invitation row')
    assert.ok(
      rows.some((r) => r.kind === 'team.approved' && r.email === vincent.email),
      'T3 Inbox row'
    )
    assert.ok(
      rows.some((r) => r.kind === 'team.join_answered' && r.email === lee.email),
      'T2b to the other owner'
    )
    assert.ok(
      rows.filter((r) => r.kind === 'team.join_request').every((r) => r.settled_at),
      'request rows settle'
    )
    assert.deepEqual(
      w.mailTo(vincent).map((m) => m.subject),
      ['You now have access to kinetic.vn']
    )
    assert.ok(
      w.mailTo(vincent).every((m) => !/\/invite\//.test(m.text)),
      'no invitation link'
    )
  }
)

test('leaving closes the seat as "left", and the roster says so', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  assert.equal((await w.call(hano, 'POST', `/api/sites/${SITE}/leave`)).status, 200)
  const row = (
    await db.pool.query(
      'select removal_kind, revoked_at from seat s join account a on a.id = s.account_id where a.email = $1',
      [hano.email]
    )
  ).rows[0]
  assert.ok(row.revoked_at)
  assert.equal(row.removal_kind, 'left')
  const team = await w.call(akemi, 'GET', '/api/team')
  const seat = team.json.sites.find((s) => s.siteKey === SITE).seats.find((s) => s.email === hano.email)
  assert.equal(seat.removalKind, 'left')
})

test('Approve grants the seat at the approval time, not when the request was made', opts, async () => {
  const w = await world()
  const akemi = await w.person('Akemi', { role: 'owner' })
  const vincent = await w.person('Vincent')
  await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
  // The request was made 53 minutes ago (measured on dev 04/10: the row read "Granted 53 minutes ago").
  await db.pool.query(
    `update seat set granted_at = now() - interval '53 minutes', requested_at = now() - interval '53 minutes'
      where site_key = $1 and account_id = (select id from account where email = $2)`,
    [SITE, vincent.email]
  )
  // The database stamps granted_at, so "just now" is read from its clock too.
  const before = (await db.pool.query('select now() as t')).rows[0].t.getTime()
  await w.call(akemi, 'POST', '/api/team/invite', {
    emails: [vincent.email],
    role: 'editor',
    siteKeys: [SITE]
  })
  const team = await w.call(akemi, 'GET', '/api/team')
  const seat = team.json.sites.find((s) => s.siteKey === SITE).seats.find((s) => s.email === vincent.email)
  assert.equal(seat.status, 'active')
  assert.ok(Date.parse(seat.grantedAt) >= before - 5_000, `granted at ${seat.grantedAt}, approved just now`)
})

test(
  'an answered join request records its outcome on every owner row: approved or declined',
  opts,
  async () => {
    const w = await world()
    const akemi = await w.person('Akemi', { role: 'owner' })
    const lee = await w.person('Lee', { role: 'owner' })
    const [vincent, hano] = [await w.person('Vincent'), await w.person('Hano')]
    await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
    await w.call(hano, 'POST', `/me/sites/${SITE}/join-request`)
    await w.call(akemi, 'POST', '/api/team/invite', {
      emails: [vincent.email],
      role: 'editor',
      siteKeys: [SITE]
    })
    const team = await w.call(akemi, 'GET', '/api/team')
    const hanoSeat = team.json.sites.find((s) => s.siteKey === SITE).seats.find((s) => s.email === hano.email)
    assert.equal(
      (await w.call(akemi, 'DELETE', `/api/sites/${SITE}/seats/${hanoSeat.id}`, { kind: 'decline_request' }))
        .status,
      200
    )
    const requests = (await w.rows()).filter((r) => r.kind === 'team.join_request')
    const about = async (who) => {
      const { rows } = await db.pool.query('select id from account where email = $1', [who.email])
      return requests.filter((r) => r.ref?.endsWith(rows[0].id))
    }
    const approved = await about(vincent)
    const declined = await about(hano)
    assert.equal(approved.length, 2, 'one row per Owner')
    assert.ok(approved.every((r) => r.settled_at && r.data.outcome === 'approved'))
    assert.ok(declined.every((r) => r.settled_at && r.data.outcome === 'declined'))
    void lee
  }
)

test('an Editor cannot approve a request to join by inviting the requester (ADR 0028)', opts, async () => {
  const w = await world()
  await w.person('Akemi', { role: 'owner' })
  const hano = await w.person('Hano', { role: 'editor' })
  const vincent = await w.person('Vincent')
  await w.call(vincent, 'POST', `/me/sites/${SITE}/join-request`)
  w.sent.length = 0
  const res = await w.call(hano, 'POST', '/api/team/invite', {
    emails: [vincent.email],
    role: 'editor',
    siteKeys: [SITE]
  })
  assert.equal(res.status, 200)
  assert.deepEqual(res.json.results[0].sites, [{ siteKey: SITE, outcome: 'refused', code: 'NOT_SITE_OWNER' }])
  assert.equal(w.sent.length, 0)
  const { rows } = await db.pool.query(
    'select accepted_at, requested_at from seat s join account a on a.id = s.account_id where a.email = $1',
    [vincent.email]
  )
  assert.equal(rows[0].accepted_at, null, 'the request still waits for an Owner')
  assert.ok(rows[0].requested_at)
})
