import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { Hono } from 'hono'
import { mountSiteAddress, addressChangeState } from '../src/sites/address.js'
import { mountSiteGuide } from '../src/sites/guide.js'
import { saveUiSwitches } from '../src/lib/ui-setting.js'
import { fakeCloudflare } from './_fake-cloudflare.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const OWN = 'shop.localhost'
const DOMAIN = 'www.example.com'
const TARGET = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90.cfargotunnel.com'
const dnsError = (code) => Object.assign(new Error(`query${code}`), { code })
const config = { origin: 'https://cowork.tracy.test', siteDomain: 'localhost', siteAddressPrefix: '' }

/** One site, the address doors and the guide door on one app, as `sites/route.js` wires them. */
async function bed({ role = 'owner', platform = 'wordpress', publish = 'published' } = {}) {
  const { pool } = db
  await pool.query(
    "insert into site(site_key,label,host,platform,address,attached,publish) values($1,'shop','local',$2,'http://shop.localhost:8080/',true,$3)",
    [OWN, platform, publish]
  )
  const b = { pool, role, dns: { txt: {}, cname: {} }, probe: { status: 'failed', error: 'DNS_NXDOMAIN' } }
  const answer = async (kind, name) => {
    const found = b.dns[kind][name]
    if (found === undefined) throw dnsError(kind === 'txt' ? 'ENOTFOUND' : 'ENODATA')
    return found
  }
  const app = new Hono()
  const requireGrant = async () => ({
    grant: { role: b.role },
    email: `${b.role}@test.example`,
    kind: 'session'
  })
  const ownDomains = mountSiteAddress(app, {
    pool,
    config,
    customHostnames: fakeCloudflare().client,
    requireGrant,
    run: async () => assert.fail('no site job'),
    domainProbe: async () => b.probe,
    dnsTxt: (n) => answer('txt', n),
    dnsCname: (n) => answer('cname', n),
    dnsAskMs: 150,
    routingTarget: async () => TARGET
  })
  const siteByKey = async (k) =>
    (await pool.query('select * from site where site_key = $1', [k])).rows[0] ?? null
  // The same shape `settingsSnapshot` returns: the row, the address state and the publish state.
  const snapshot = async (site, grant) => {
    const row = await siteByKey(site.site_key)
    return {
      site: row,
      extra: {
        addressChange: await addressChangeState(pool, row, grant.role, config, TARGET),
        publishing: {
          publish: row.publish === 'published' ? 'published' : 'draft',
          mayPublish: grant.role !== 'viewer',
          operation: null
        }
      }
    }
  }
  mountSiteGuide(app, {
    pool,
    conversationSite: async (c) => ({
      siteKey: c.req.param('key') === '_conversation' ? OWN : c.req.param('key')
    }),
    requireGrant,
    siteByKey,
    snapshot,
    ownDomains,
    origin: config.origin
  })
  b.ask = async (query) => {
    const res = await app.request(`/api/sites/_conversation/guide?${query}`)
    return { status: res.status, body: await res.json() }
  }
  b.send = (method, path, body) =>
    app.request(`/api/sites/${OWN}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  b.save = async () => (await b.send('PUT', '/address', { name: DOMAIN, kind: 'custom' })).json()
  b.card = async () => (await snapshot(await siteByKey(OWN), { role: b.role })).extra.addressChange
  return b
}
const stateText = (res) => res.body.articles[0].state.join('\n')

test(
  'no domain yet: the agent is told the site answers at its Tracy address only, and links to Publish',
  opts,
  async () => {
    const b = await bed()
    const res = await b.ask('q=' + encodeURIComponent('how do I point my DNS'))
    assert.equal(res.status, 200)
    const a = res.body.articles[0]
    assert.equal(a.id, 'own-domain')
    assert.match(stateText(res), /No own domain is connected or being connected/)
    assert.equal(
      a.screen.href,
      'https://cowork.tracy.test/shop.localhost/?tab=tracy:site-publish&site=shop.localhost'
    )
    assert.ok(a.body.includes('CNAME') && a.body.includes('TXT'))
    assert.equal(a.roleNote, undefined)
  }
)

test('waiting for the TXT record: every line the card shows is in what the agent is told', opts, async () => {
  const b = await bed()
  const saved = await b.save()
  const token = saved.pending.verification.value
  const card = await b.card()
  const text = stateText(await b.ask('q=dns'))
  assert.match(text, new RegExp(`${DOMAIN}: NOT CONNECTED YET`))
  assert.ok(text.includes(token), 'the Owner is told the TXT value the card shows')
  assert.ok(text.includes(`_tracy.${DOMAIN}`))
  assert.ok(text.includes(TARGET), 'and the CNAME target')
  assert.match(text, /not checked yet/)
  assert.match(text, /ownership no, routing no, HTTPS no/)
  // The card's own readiness is what is reported.
  assert.deepEqual(card.pending.readiness, { ownership: false, routing: false, tls: false })
})

test('a viewer or an editor is not given the TXT value, and is told to ask an Owner', opts, async () => {
  const b = await bed()
  const token = (await b.save()).pending.verification.value
  for (const role of ['editor', 'viewer']) {
    b.role = role
    const res = await b.ask('q=dns')
    assert.ok(!JSON.stringify(res.body).includes(token), `${role} must not see the token`)
    assert.match(res.body.articles[0].roleNote, /Owner/)
    assert.match(stateText(res), /Only a site Owner can connect/)
  }
})

test(
  'recheck is the Check again button: it reads DNS, records it, and the answer shows the new reading',
  opts,
  async () => {
    const b = await bed()
    const token = (await b.save()).pending.verification.value
    b.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
    b.dns.cname[DOMAIN] = [TARGET]
    const res = await b.ask('q=dns&recheck=1')
    assert.equal(res.body.articles[0].recheck.done, true)
    const text = stateText(res)
    assert.match(text, /TXT \(proves the domain is yours\).*found, with the right value/)
    assert.match(text, /CNAME \(points the domain at the site\).*found, with the right value/)
    const row = (await b.pool.query('select checked_at from site_name where name = $1', [DOMAIN])).rows[0]
    assert.ok(row.checked_at, 'the lookup was written, as the button writes it')
  }
)

test('a wrong CNAME is reported as a different value, with what was found', opts, async () => {
  const b = await bed()
  const token = (await b.save()).pending.verification.value
  b.dns.txt[`_tracy.${DOMAIN}`] = [[token]]
  b.dns.cname[DOMAIN] = ['parked.registrar.example']
  const text = stateText(await b.ask('q=cname&recheck=1'))
  assert.match(text, /CNAME.*found with a DIFFERENT value: parked\.registrar\.example/)
})

test('only an Owner can recheck; anyone else gets the stored state and the reason', opts, async () => {
  const b = await bed({ role: 'editor' })
  await b.save().catch(() => {})
  const res = await b.ask('q=dns&recheck=1')
  assert.equal(res.body.articles[0].recheck.done, false)
  assert.equal(res.body.articles[0].recheck.reason, 'NOT_SITE_OWNER')
  const none = await b.pool.query('select checked_at from site_name where name = $1', [DOMAIN])
  assert.equal(none.rows[0]?.checked_at ?? null, null)
})

test('a draft site is told it must be published before a domain can be connected', opts, async () => {
  const b = await bed({ publish: 'draft' })
  assert.match(stateText(await b.ask('q=dns')), /DRAFT.*published first/)
})

test('the operator turned Connect domain off: the agent is not offered the article', opts, async () => {
  const b = await bed()
  await saveUiSwitches(b.pool, { 'site-connect-domain': false }, 'ops@test.example')
  const res = await b.ask('q=dns')
  assert.deepEqual(res.body.articles, [])
  assert.ok(!res.body.topics.some((t) => t.id === 'own-domain'))
})

test('a bare domain is refused by the door and the guide says how to enter it', opts, async () => {
  const b = await bed()
  const res = await b.send('PUT', '/address', { name: 'example.com', kind: 'custom' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).code, 'DOMAIN_APEX_UNSUPPORTED')
  const body = (await b.ask('q=dns')).body.articles[0].body
  assert.match(body, /bare domain such as example\.com/)
})

test('a question the guide does not cover returns no article and the topic list', opts, async () => {
  const b = await bed()
  const res = await b.ask('q=' + encodeURIComponent('what is the capital of France'))
  assert.deepEqual(res.body.articles, [])
  assert.ok(res.body.topics.length >= 8)
})

test('publish state is reported from the same snapshot', opts, async () => {
  const b = await bed({ publish: 'draft' })
  const text = stateText(await b.ask('q=' + encodeURIComponent('how do I publish')))
  assert.match(text, /Publish state: DRAFT/)
})

test('an article for another platform is not offered', opts, async () => {
  const b = await bed({ platform: 'emdash' })
  const res = await b.ask('topic=sync-from-live')
  assert.deepEqual(res.body.articles, [])
})
