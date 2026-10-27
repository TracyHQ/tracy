/**
 * The Mail screen's doors (`/ops/mail`, tasks/todo-mail-site-khach.md) — request shapes and the
 * reading of answers, against a fetch stub. Pure module, so `node --test` loads it directly.
 *
 * What would go wrong silently without these:
 *   - saving a row that was only opened turns a site's DEFAULT limit into a fixed override (the
 *     body must carry only what changed; an emptied cell is `null`, "back to the default");
 *   - a field the door did not send shows up as 0 instead of a dash;
 *   - the log query drops the site filter.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  editBody,
  editFrom,
  fetchMailLog,
  fetchOpsMail,
  fetchWritable,
  limitInput,
  logPath,
  parseLog,
  codeKey,
  parseOpsMail,
  putSiteMail,
  releaseSiteDomain,
  slotsFull
} from '../src/mail-api.ts'
import { en } from '../src/i18n/ns/mail.ts'

const site = (over = {}) => ({
  siteKey: 'joomlart.com',
  label: 'joomlart-com',
  mode: 'tracy',
  fromAddress: '"JoomlArt" <joomlart-com@sites.example>',
  hourly: 10,
  daily: 20,
  sentToday: 4,
  domain: null,
  domainStatus: null,
  lastError: null,
  ...over
})

function stubFetch(status, body) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }
  return { calls, impl }
}

test('the ops read parses the contract shape and keeps missing numbers null', async () => {
  const stub = stubFetch(200, {
    enabled: true,
    mode: 'smtp',
    domain: 'sites.example',
    globalDaily: 50,
    usedToday: 12,
    sites: [site(), { siteKey: 'bare.example' }, { label: 'no key' }]
  })
  const answer = await fetchOpsMail(stub.impl)
  assert.equal(stub.calls[0].url, '/api/ops/mail')
  assert.equal(stub.calls[0].init.method, 'GET')
  assert.equal(answer.ok, true)
  assert.equal(answer.value.sites.length, 2, 'a row without a siteKey is not a site')
  const bare = answer.value.sites[1]
  assert.equal(bare.sentToday, null)
  assert.equal(bare.hourly, null)
  assert.equal(bare.mode, null)
  assert.equal(answer.value.writable, null, 'the contract has no writable; unknown stays unknown')
})

test('a body that is not the mail answer is refused, not half-drawn', () => {
  assert.equal(parseOpsMail({ sites: [] }), null)
  assert.equal(parseOpsMail(null), null)
  assert.equal(parseOpsMail({ enabled: false }).mode, null)
})

test('a refusal carries its status and code', async () => {
  const answer = await fetchOpsMail(stubFetch(403, { code: 'NOT_STAFF' }).impl)
  assert.deepEqual(answer, { ok: false, status: 403, code: 'NOT_STAFF' })
})

test('opening a row and saving sends nothing: the edit carries only what changed', () => {
  const s = site()
  assert.equal(editBody(s, editFrom(s)), null)
  assert.deepEqual(editBody(s, { ...editFrom(s), daily: '200' }), { daily: 200 })
  assert.deepEqual(editBody(s, { ...editFrom(s), hourly: '' }), { hourly: null }, 'emptied = back to default')
  assert.deepEqual(editBody(s, { ...editFrom(s), mode: 'off' }), { mode: 'off' })
  assert.equal(editBody(s, { ...editFrom(s), daily: '-3' }), null, 'an invalid cell blocks the save')
})

test('a default limit (null) opens as an empty cell and stays unsent unless typed into', () => {
  const s = site({ hourly: null, daily: null })
  const edit = editFrom(s)
  assert.equal(edit.hourly, '')
  assert.equal(editBody(s, edit), null)
  assert.deepEqual(editBody(s, { ...edit, hourly: '5' }), { hourly: 5 })
})

test('limit cells accept whole numbers only', () => {
  assert.equal(limitInput(''), null)
  assert.equal(limitInput(' 0 '), 0)
  assert.equal(limitInput('25'), 25)
  assert.equal(limitInput('2.5'), 'invalid')
  assert.equal(limitInput('ten'), 'invalid')
})

test('the PUT goes to the site door with a JSON body', async () => {
  const stub = stubFetch(200, { ok: true })
  const answer = await putSiteMail('joomlart.com', { daily: 500 }, stub.impl)
  assert.equal(answer.ok, true)
  assert.equal(stub.calls[0].url, '/api/ops/mail/sites/joomlart.com')
  assert.equal(stub.calls[0].init.method, 'PUT')
  assert.equal(stub.calls[0].init.headers['content-type'], 'application/json')
  assert.deepEqual(JSON.parse(stub.calls[0].init.body), { daily: 500 })
  const odd = stubFetch(200, {})
  await putSiteMail('a/b', {}, odd.impl)
  assert.equal(odd.calls[0].url, '/api/ops/mail/sites/a%2Fb')
})

test('the log query carries the site filter and the limit', async () => {
  assert.equal(logPath(null, 50), '/api/ops/mail/log?limit=50')
  assert.equal(logPath('joomlart.com', 20), '/api/ops/mail/log?siteKey=joomlart.com&limit=20')
  const stub = stubFetch(200, { entries: [] })
  await fetchMailLog('x.example', 10, stub.impl)
  assert.equal(stub.calls[0].url, '/api/ops/mail/log?siteKey=x.example&limit=10')
})

test('log rows are read under the likely names, and nothing is invented', () => {
  const rows = parseLog({
    entries: [
      {
        at: '2026-09-23T10:00:00Z',
        siteKey: 'a.example',
        status: 'sent',
        to: ['x@y.z', 'q@r.s'],
        subject: 'Hi'
      },
      { createdAt: '2026-09-23T09:00:00Z', label: 'b', outcome: 'refused', code: 'SITE_MAIL_LIMIT' },
      'junk'
    ]
  })
  assert.equal(rows.length, 2)
  assert.equal(rows[0].to, 'x@y.z, q@r.s')
  assert.equal(rows[1].result, 'refused')
  assert.equal(rows[1].code, 'SITE_MAIL_LIMIT')
  assert.equal(rows[1].subject, null)
  assert.deepEqual(parseLog([{ status: 'sent' }]).length, 1, 'a bare array is accepted too')
  assert.deepEqual(parseLog({}), [])
})

test('writable is the door’s verdict; a refusal or silence is read-only', async () => {
  assert.equal(
    await fetchWritable(stubFetch(200, { email: 'a@b.c', role: 'owner', writable: true }).impl),
    true
  )
  assert.equal(await fetchWritable(stubFetch(200, { email: 'a@b.c', role: 'developer' }).impl), false)
  assert.equal(await fetchWritable(stubFetch(403, {}).impl), null)
})

test('own-domain slots and the release clock are read from the door, null when it said nothing', () => {
  const read = parseOpsMail({
    enabled: true,
    domainSlots: { used: 3, limit: 3 },
    domainPendingDays: 3,
    sites: [
      site({
        mode: 'tracy-domain',
        domain: 'shop.example',
        domainStatus: 'pending',
        domainOwned: true,
        domainPendingSince: '2026-09-24T08:00:00.000Z',
        domainReleaseAt: '2026-09-27T08:00:00.000Z'
      })
    ]
  })
  assert.deepEqual(read.domainSlots, { used: 3, limit: 3 })
  assert.equal(read.domainPendingDays, 3)
  assert.equal(read.sites[0].domainOwned, true)
  assert.equal(read.sites[0].domainReleaseAt, '2026-09-27T08:00:00.000Z')
  assert.equal(read.sites[0].domainReleasedAt, null)
  assert.equal(slotsFull(read.domainSlots), true)
  assert.equal(slotsFull({ used: null, limit: 3 }), false, 'an uncounted account is not called full')
  assert.equal(slotsFull(null), false)
  const bare = parseOpsMail({ enabled: true, sites: [site()] })
  assert.equal(bare.domainSlots, null)
  assert.equal(bare.sites[0].domainOwned, null)
})

test('release goes to the domain door with DELETE; a full plan is said in words', async () => {
  const stub = stubFetch(200, {})
  const answer = await releaseSiteDomain('joomlart.com', stub.impl)
  assert.equal(answer.ok, true)
  assert.equal(stub.calls[0].url, '/api/ops/mail/sites/joomlart.com/domain')
  assert.equal(stub.calls[0].init.method, 'DELETE')
  assert.match(en[codeKey('SITE_MAIL_DOMAIN_LIMIT')], /no room for another domain/)
  assert.equal(codeKey('SOMETHING_ELSE'), null)
  assert.equal(codeKey(null), null)
})
