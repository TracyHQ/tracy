/**
 * The customer lock on design systems (`src/lib/design-system-customer-lock.js`, Akemi 15/10/2026): customers may
 * put a design system only on a template whose /ops Design system step says ready
 * (`src/lib/design-system-ready-templates.js`), minus the emergency deny-list; staff keep every template. The
 * derived verdict, the Add site doors (support, preview) and the running site's preview door, over the real
 * contracts (`lib/ds-slot.js`); the door tests stand /ops in with Tracy Business on Joomla and EmDash ready. The
 * press, the chat route, a new site's build and a site that already wears a system: `design-system-door.test.mjs`.
 *
 *   node --test apps/tracy-web/test/design-system-customer-lock.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import {
  CUSTOMER_DESIGN_SYSTEM_DENY,
  customerLock,
  staffReader
} from '../src/lib/design-system-customer-lock.js'
import { readyTemplates, readyTemplatesReader } from '../src/lib/design-system-ready-templates.js'
import {
  contractFor,
  emitFor,
  maxVersionOf,
  minVersionOf,
  modesOf,
  quickstartContractOf,
  quickstartTemplateOf,
  rawTemplatesOf,
  referoLibrary,
  supportForNewSite,
  templateKeyOf,
  versionKeyOf
} from '../src/lib/ds-slot.js'
import { mountDesignSystem } from '../src/sites/design-system.js'
import { mountDesignSystemPreview } from '../src/sites/design-system-preview.js'

const SYSTEM = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0' // Moxie
const CUSTOMER = 'customer@x.test'
const STAFF = 'staff@tracy.test'
/** What /ops says is ready, for the door tests below: Tracy Business on Joomla and on EmDash. */
const READY = new Set(['joomla/tracy-business', 'emdash/tracy-business'])
const lock = customerLock({
  isStaff: async (email) => email === STAFF,
  isReady: async (key) => READY.has(key)
})

/** The newest release of each quickstart these tests ask about, as `quickstart_releases` would say it. */
const RELEASES = {
  'tracy-business/j6': '1.2.1',
  'tracy-business/emdash-0.x': '1.7.10',
  'quickstart/ja-kinetic/j6': '1.0.4'
}

const ds = {
  refero: referoLibrary,
  templateKeyOf,
  contractFor,
  rawTemplatesOf,
  versionKeyOf,
  minVersionOf,
  maxVersionOf,
  emitFor,
  supportForNewSite,
  quickstartTemplateOf,
  modesOf
}

/** The running site the doors serve: Tracy Business on EmDash (open), or JA Kinetic on Joomla (locked). */
const EMDASH_SITE = {
  platform: 'emdash',
  quickstart_tag: 'tracy-business/emdash-0.x',
  quickstart_version: '1.7.10'
}
const KINETIC_SITE = {
  platform: 'joomla',
  quickstart_tag: 'quickstart/ja-kinetic/j6',
  quickstart_version: '1.0.6'
}

/** The Design system doors as `sites/route.js` mounts them, for one signed-in person and one running site. */
function doors(email, { probe = false, site = EMDASH_SITE } = {}) {
  const app = new Hono()
  app.server = mountDesignSystem(app, {
    requireGrant: async () => ({ kind: 'session', email, grant: { role: 'owner' } }),
    signedIn: async () => ({ email, ...(probe ? { probe: true } : {}) }),
    releaseVersion: async (tag) => RELEASES[tag] ?? null,
    siteByKey: async (key) => ({
      site_key: key,
      label: 'dslock',
      host: 'local',
      address: 'https://dslock.tracy.test',
      ...site
    }),
    toolsetRefusal: async () => null,
    runJob: async () => ({ ok: true, output: JSON.stringify({ ok: true, slot: null }) }),
    lease: { take: async () => ({ ok: true, fresh: true }), release: async () => {} },
    record: async () => {},
    store: { insert: async () => {}, latest: async () => null, markUndone: async () => {} },
    ds,
    customerLock: lock,
    preview: {
      innerOf: () => new URL('http://dslock.inner'),
      publicOf: () => 'https://dslock.tracy.test',
      fetchImpl: async () =>
        new Response('<html><head></head><body>home</body></html>', {
          headers: { 'content-type': 'text/html' }
        })
    }
  })
  return app
}

const support = (app, tag, platform) =>
  app
    .request(`/api/design-system/support?quickstart=${encodeURIComponent(tag)}&platform=${platform}`)
    .then((r) => r.json())

/** A choosable release as `readReleases` gives it. */
const releaseOf = (tag, platform, template, version) => ({
  tag,
  platform,
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  choosable: true,
  assets: [],
  setting: { template, version }
})
const BASE = releaseOf('tracy-base/emdash-0.x', 'emdash', 'tracy-base', '0.5.4')
const LIVE = new Map([[BASE.tag, { url: 'https://base.tracy.test', version: '0.5.4', platform: 'emdash' }]])
/** The stored Design system check of BASE 0.5.4 with these rule results. */
const checked = (results, state = 'done') =>
  new Map([[`${BASE.tag} 0.5.4`, { state, version: '0.5.4', report: { results } }]])
const verdict = (dsChecks, releases = [BASE]) =>
  readyTemplates({ releases, dsChecks, live: LIVE }).get('emdash/tracy-base')

test('derived from /ops: open only when the Design system step of the release says ds-ready', () => {
  const open = verdict(checked([{ id: 'SLOT-1', status: 'pass' }]))
  assert.equal(open?.open, true)
  assert.deepEqual(open?.releases, [{ tag: BASE.tag, version: '0.5.4', code: 'ds-ready' }])
  for (const [why, dsChecks, code] of [
    ['a must-fix rule fails', checked([{ id: 'CSS-1', status: 'fail' }]), 'ds-must-fix'],
    ['a worth-fixing rule fails', checked([{ id: 'CSS-2', status: 'fail' }]), 'ds-worth-fixing'],
    ['a rule is not measured', checked([{ id: 'ROLE-1', status: 'unmeasured' }]), 'ds-not-measured'],
    ['the check is still running', checked([], 'checking'), 'ds-checking'],
    ['the version was never checked', new Map(), 'ds-not-checked']
  ]) {
    const v = verdict(dsChecks)
    assert.equal(v?.open, false, why)
    assert.equal(v?.releases[0].code, code, why)
  }
})

test('derived from /ops: one release not ready locks the template; a draft or no release is no verdict', () => {
  const other = releaseOf('tracy-base/emdash-1.x', 'emdash', 'tracy-base', '1.0.0')
  assert.equal(verdict(checked([{ id: 'SLOT-1', status: 'pass' }]), [BASE, other])?.open, false)
  const draft = { ...other, github: 'draft', choosable: false }
  assert.equal(verdict(checked([{ id: 'SLOT-1', status: 'pass' }]), [BASE, draft])?.open, true)
  assert.equal(verdict(checked([{ id: 'SLOT-1', status: 'pass' }]), [])?.open, undefined)
})

test('the lock: open when /ops says ready, the deny-list wins, staff bypass, a failed read keeps it shut', async () => {
  assert.deepEqual([...CUSTOMER_DESIGN_SYSTEM_DENY], [], 'the emergency deny-list is empty')
  const ready = async (/** @type {any} */ key) => key === 'emdash/tracy-base'
  const open = customerLock({ isStaff: async () => false, isReady: ready })
  assert.equal(await open.blocked(CUSTOMER, 'emdash/tracy-base'), false)
  assert.equal(await open.blocked(CUSTOMER, 'emdash/tracy-saas'), true)
  assert.equal(await open.blocked(CUSTOMER, null), true)
  const denied = customerLock({
    isStaff: async (e) => e === STAFF,
    isReady: ready,
    deny: ['emdash/tracy-base']
  })
  assert.equal(await denied.blocked(CUSTOMER, 'emdash/tracy-base'), true, 'the deny-list wins over /ops')
  assert.equal(await denied.blocked(STAFF, 'emdash/tracy-base'), false, 'staff still pass')
  const failing = customerLock({
    isStaff: async () => false,
    isReady: async () => {
      throw new Error('db down')
    }
  })
  assert.equal(await failing.blocked(CUSTOMER, 'emdash/tracy-base'), true)
})

test('the reader: answers from the three /ops reads, kept a while; no pool or a failed read is not ready', async () => {
  let reads = 0
  const pool = {
    query: async (/** @type {string} */ sql) => {
      reads += 1
      if (sql.includes('from quickstart_releases'))
        return {
          rows: [
            {
              tag: BASE.tag,
              release: { name: 'Tracy Base', kind: 'quickstart', github: 'published', assets: [] },
              setting: BASE.setting,
              tracy: 'ready',
              fetched_at: new Date()
            }
          ]
        }
      if (sql.includes('from template_ds_readiness'))
        return {
          rows: [
            {
              tag: BASE.tag,
              version: '0.5.4',
              state: 'done',
              report: { results: [{ id: 'SLOT-1', status: 'pass' }] }
            }
          ]
        }
      return {
        rows: [
          {
            quickstart_tag: BASE.tag,
            address: 'https://base.tracy.test',
            quickstart_version: '0.5.4',
            platform: 'emdash'
          }
        ]
      }
    }
  }
  let t = 0
  const isReady = readyTemplatesReader({ pool, now: () => t })
  assert.equal(await isReady('emdash/tracy-base'), true)
  assert.equal(await isReady('emdash/tracy-saas'), false)
  assert.equal(reads, 3, 'one read of each, kept')
  t = 60_000
  await isReady('emdash/tracy-base')
  assert.equal(reads, 6, 'read again once stale')
  assert.equal(await readyTemplatesReader({ pool: null })('emdash/tracy-base'), false)
  const broken = { query: async () => Promise.reject(new Error('down')) }
  assert.equal(await readyTemplatesReader({ pool: broken })('emdash/tracy-base'), false)
})

test('the lock is keyed by the template a quickstart builds, on its CMS', () => {
  assert.equal(
    quickstartTemplateOf({ platform: 'joomla', tag: 'tracy-business/j6' }),
    'joomla/tracy-business'
  )
  assert.equal(
    quickstartTemplateOf({ platform: 'wordpress', tag: 'tracy-business/wp7' }),
    'wordpress/wp-tracy-business'
  )
  assert.equal(
    quickstartTemplateOf({ platform: 'emdash', tag: 'tracy-business/emdash-0.x' }),
    'emdash/tracy-business'
  )
  assert.equal(
    quickstartTemplateOf({ platform: 'joomla', tag: 'quickstart/ja-kinetic/j6' }),
    'joomla/ja-kinetic'
  )
  assert.equal(
    quickstartTemplateOf({ platform: 'wordpress', tag: 'quickstart/ja-kinetic/wp7' }),
    'wordpress/wp-ja-kinetic'
  )
  assert.equal(quickstartTemplateOf({ platform: 'joomla', tag: 'nobody/j6' }), null)
  assert.equal(quickstartTemplateOf({ platform: 'joomla', tag: null }), null)
})

test('the lock: staff pass every template; a staff read that fails keeps it shut', async () => {
  assert.equal(await lock.blocked(CUSTOMER, 'joomla/tracy-business'), false)
  assert.equal(await lock.blocked(CUSTOMER, 'joomla/ja-kinetic'), true)
  assert.equal(await lock.blocked(STAFF, 'joomla/ja-kinetic'), false)
  const broken = customerLock({
    isStaff: async () => {
      throw new Error('db down')
    },
    isReady: async (key) => READY.has(key)
  })
  assert.equal(await broken.blocked(STAFF, 'joomla/ja-kinetic'), true)
  assert.equal(await staffReader(null)(STAFF), false, 'no database: not staff')
  const failing = { query: async () => Promise.reject(new Error('down')) }
  assert.equal(await staffReader(failing)(STAFF), false, 'a failed query: not staff')
  const seat = { query: async (_sql, [email]) => ({ rows: email === STAFF ? [{ '?column?': 1 }] : [] }) }
  assert.equal(await staffReader(seat)(STAFF), true)
  assert.equal(await staffReader(seat)(CUSTOMER), false)
})

test('Add site support: a customer is offered Tracy Business / Joomla only; staff and the door probe see the contract', async () => {
  const customer = doors(CUSTOMER)
  assert.equal((await support(customer, 'tracy-business/j6', 'joomla')).supported, true)
  assert.deepEqual(await support(customer, 'quickstart/ja-kinetic/j6', 'joomla'), {
    supported: false,
    reason: 'TEMPLATE_NOT_READY',
    need: null,
    have: null,
    locked: true
  })
  assert.equal((await support(customer, 'tracy-business/emdash-0.x', 'emdash')).supported, true)
  assert.equal((await support(customer, 'tracy-business/wp7', 'wordpress')).locked, true)
  assert.equal((await support(customer, 'quickstart/ja-kinetic/wp7', 'wordpress')).locked, true)
  const staff = doors(STAFF)
  assert.equal((await support(staff, 'quickstart/ja-kinetic/j6', 'joomla')).supported, true)
  assert.equal((await support(staff, 'tracy-business/wp7', 'wordpress')).supported, true)
  const probe = doors('door-probe@tracy.internal', { probe: true })
  assert.equal((await support(probe, 'tracy-business/emdash-0.x', 'emdash')).supported, true)
})

test('running site preview: a customer on a locked template gets 403 for a system, the template look still shows', async () => {
  // `template`: what the panel read; a Joomla site names it, an EmDash one is known by its quickstart
  const at = (app, id, template = '') =>
    app.request(
      `/api/sites/dslock.localhost/design-system/preview?id=${encodeURIComponent(id)}${template ? `&template=${encodeURIComponent(template)}` : ''}`
    )
  const kinetic = (email) => doors(email, { site: KINETIC_SITE })
  const refused = await at(kinetic(CUSTOMER), SYSTEM, 'joomla/ja-kinetic')
  assert.equal(refused.status, 403)
  assert.equal((await refused.json()).code, 'DS_TEMPLATE_LOCKED')
  const bare = await at(kinetic(CUSTOMER), 'template-default', 'joomla/ja-kinetic')
  assert.notEqual(bare.status, 403, 'the Template default card is not a new pick')
  const staff = await at(kinetic(STAFF), SYSTEM, 'joomla/ja-kinetic')
  assert.notEqual(staff.status, 403, 'staff may preview')
  const emdash = await at(doors(CUSTOMER), SYSTEM)
  assert.notEqual(emdash.status, 403, 'Tracy Business on EmDash is open to customers')
})

test('Add site preview: a customer on a locked template gets 403 before the demo is read; staff are not locked', async () => {
  const reads = []
  const mount = (email) => {
    const app = new Hono()
    mountDesignSystemPreview(app, {
      signedIn: async () => ({ email }),
      demoOf: async (tag) => ({
        host: 'local',
        label: 'demo',
        platform: tag.endsWith('/j6') ? 'joomla' : 'emdash',
        address: 'https://demo.tracy.test',
        quickstart_version: RELEASES[tag] ?? null,
        port: 1
      }),
      innerOf: () => new URL('http://demo.inner'),
      fetchImpl: async (url) => {
        reads.push(String(url))
        return new Response('<html><head></head><body>demo</body></html>', {
          headers: { 'content-type': 'text/html' }
        })
      },
      ds: { refero: referoLibrary, quickstartContractOf, emitFor, modesOf },
      customerLock: lock
    })
    return app
  }
  const ask = (app, tag, platform) =>
    app.request(
      `/api/design-system/preview?quickstart=${encodeURIComponent(tag)}&platform=${platform}&id=${encodeURIComponent(SYSTEM)}`
    )
  const locked = await ask(mount(CUSTOMER), 'quickstart/ja-kinetic/j6', 'joomla')
  assert.equal(locked.status, 403)
  assert.equal((await locked.json()).code, 'DS_TEMPLATE_LOCKED')
  assert.equal(reads.length, 0, 'the demo is never read for a locked template')
  const open = await ask(mount(CUSTOMER), 'tracy-business/j6', 'joomla')
  assert.notEqual(open.status, 403)
  const staff = await ask(mount(STAFF), 'quickstart/ja-kinetic/j6', 'joomla')
  assert.notEqual(staff.status, 403)
})

test('Create site: a pick for a locked template is refused for a customer, kept for staff and for Tracy Business on Joomla and EmDash', async () => {
  const create = (email, platform, tag) => doors(email).server.lockedAtCreate({ email, platform, tag })
  assert.equal(await create(CUSTOMER, 'joomla', 'quickstart/ja-kinetic/j6'), 'DS_TEMPLATE_LOCKED')
  assert.equal(await create(CUSTOMER, 'wordpress', 'quickstart/ja-kinetic/wp7'), 'DS_TEMPLATE_LOCKED')
  assert.equal(await create(CUSTOMER, 'wordpress', 'tracy-business/wp7'), 'DS_TEMPLATE_LOCKED')
  assert.equal(
    await create(CUSTOMER, 'joomla', 'nobody/j6'),
    'DS_TEMPLATE_LOCKED',
    'no contract names it: locked'
  )
  assert.equal(await create(CUSTOMER, 'joomla', 'tracy-business/j6'), null)
  assert.equal(await create(CUSTOMER, 'emdash', 'tracy-business/emdash-0.x'), null)
  assert.equal(await create(STAFF, 'joomla', 'quickstart/ja-kinetic/j6'), null)
})
