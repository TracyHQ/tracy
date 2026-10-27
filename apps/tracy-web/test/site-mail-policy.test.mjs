/**
 * What a site's mail policy means without a database: modes, limits, the address mail leaves from,
 * the SMTP-host fence, and Resend's domain API reduced to the shape the screen draws.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fromAddressFor,
  isPublicIp,
  limitCrossed,
  limitsFor,
  modeOf,
  normaliseDomain,
  refusalFor,
  smtpRefusal
} from '../src/mail/site-mail/policy.js'
import { resendDomains } from '../src/mail/site-mail/resend-domains.js'

const siteMail = { domain: 'sites.example.test', siteHourly: 10, siteDaily: 20 }
const site = { label: 'lantern', publish: 'published' }

test('no row is mode tracy with the deployment defaults', () => {
  assert.equal(modeOf(null), 'tracy')
  assert.equal(modeOf({ mode: 'bogus' }), 'tracy')
  assert.deepEqual(limitsFor(null, siteMail), { hourly: 10, daily: 20 })
  assert.deepEqual(limitsFor({ hourly_limit: 0, daily_limit: null }, siteMail), { hourly: 0, daily: 20 })
  assert.equal(fromAddressFor(site, null, siteMail), 'lantern@sites.example.test')
})

test('refusals: draft first, then off/own-cms', () => {
  assert.deepEqual(refusalFor({ publish: 'draft' }, { mode: 'off' }), {
    status: 403,
    code: 'SITE_MAIL_DRAFT'
  })
  assert.deepEqual(refusalFor(site, { mode: 'off' }), { status: 403, code: 'SITE_MAIL_OFF' })
  assert.deepEqual(refusalFor(site, { mode: 'own-cms' }), { status: 403, code: 'SITE_MAIL_OFF' })
  assert.equal(refusalFor(site, null), null)
  assert.equal(refusalFor(site, { mode: 'own-smtp' }), null)
})

test('limits: site hour, then site day, then global day; own-smtp has none', () => {
  const l = { hourly: 2, daily: 3 }
  assert.equal(limitCrossed('tracy', { hour: 1, day: 1, globalDay: 1 }, l, 5), null)
  assert.equal(limitCrossed('tracy', { hour: 2, day: 2, globalDay: 9 }, l, 5), 'site-hour')
  assert.equal(limitCrossed('tracy-domain', { hour: 0, day: 3, globalDay: 9 }, l, 5), 'site-day')
  assert.equal(limitCrossed('tracy', { hour: 0, day: 0, globalDay: 5 }, l, 5), 'global-day')
  assert.equal(limitCrossed('own-smtp', { hour: 99, day: 99, globalDay: 99 }, l, 5), null)
})

test('fromAddress for tracy-domain follows verification', () => {
  const pending = { mode: 'tracy-domain', domain: 'shop.test', domain_status: 'pending' }
  assert.equal(fromAddressFor(site, pending, siteMail), 'lantern@sites.example.test')
  assert.equal(fromAddressFor(site, { ...pending, domain_status: 'verified' }, siteMail), 'noreply@shop.test')
  assert.equal(fromAddressFor(site, { mode: 'own-smtp' }, siteMail), null)
})

test('the SMTP host fence refuses anything that points into a private network', () => {
  assert.equal(smtpRefusal({ host: 'smtp.gmail.test', port: 587, user: 'u', password: 'p' }), null)
  assert.equal(smtpRefusal({ host: 'postgres', port: 587, user: 'u' }), 'SMTP_HOST_INVALID')
  assert.equal(smtpRefusal({ host: '172.30.0.10', port: 587, user: 'u' }), 'SMTP_HOST_INVALID')
  assert.equal(smtpRefusal({ host: '127.0.0.1', port: 465, user: 'u' }), 'SMTP_HOST_INVALID')
  assert.equal(smtpRefusal({ host: 'smtp.x.test', port: 5432, user: 'u' }), 'SMTP_PORT_INVALID')
  assert.equal(smtpRefusal({ host: 'smtp.x.test', port: 465, user: '' }), 'SMTP_USER_INVALID')
  assert.equal(
    smtpRefusal({ host: 'smtp.x.test', port: 465, user: 'u', password: '' }),
    'SMTP_PASSWORD_INVALID'
  )
  assert.equal(smtpRefusal(null), 'SMTP_REQUIRED')
  for (const ip of [
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1'
  ])
    assert.equal(isPublicIp(ip), false, ip)
  for (const ip of ['8.8.8.8', '2001:4860:4860::8888']) assert.equal(isPublicIp(ip), true, ip)
})

test('domains are normalised or refused', () => {
  assert.equal(normaliseDomain(' Shop.Example.TEST. '), 'shop.example.test')
  assert.equal(normaliseDomain('localhost'), null)
  assert.equal(normaliseDomain('a b.test'), null)
  assert.equal(normaliseDomain(42), null)
})

test('resend domain client: create, verify, and errors carry the status', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push(`${init.method} ${url}`)
    assert.equal(init.headers.authorization, 'Bearer re_k')
    if (url.endsWith('/domains') && init.method === 'POST')
      return Response.json({
        id: 'd_1',
        name: 'shop.test',
        status: 'not_started',
        records: [
          {
            record: 'SPF',
            name: 'send',
            type: 'MX',
            value: 'feedback-smtp.test',
            priority: 10,
            status: 'not_started'
          }
        ]
      })
    if (url.endsWith('/verify')) return Response.json({ object: 'domain', id: 'd_1' })
    if (url.endsWith('/domains/d_1'))
      return Response.json({ id: 'd_1', name: 'shop.test', status: 'verified', records: [] })
    return Response.json({ message: 'nope' }, { status: 422 })
  }
  const r = resendDomains({ key: 're_k', fetchImpl })
  assert.deepEqual(await r.create('shop.test'), {
    id: 'd_1',
    name: 'shop.test',
    status: 'not_started',
    records: [{ type: 'MX', name: 'send', value: 'feedback-smtp.test', status: 'not_started', priority: 10 }]
  })
  assert.equal((await r.verify('d_1')).status, 'verified')
  await assert.rejects(r.get('zzz'), (e) => e.status === 422 && /nope/.test(e.message))
  assert.deepEqual(calls.slice(0, 3), [
    'POST https://api.resend.com/domains',
    'POST https://api.resend.com/domains/d_1/verify',
    'GET https://api.resend.com/domains/d_1'
  ])
})
