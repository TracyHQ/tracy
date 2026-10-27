/**
 * Design systems are closed on imported sites (`src/lib/design-system-imported-site.js`, Akemi 15/10/2026): a site
 * brought into Tracy (`origin = 'migrated'`) may not read a system list as supported, preview a system or apply one,
 * staff included; a site created from a Tracy template (`fleet_born`) may. Undo and the Template default press stay.
 *
 *   node --test apps/tracy-web/test/design-system-imported-site.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'

import { customerLock } from '../src/lib/design-system-customer-lock.js'
import { DS_IMPORTED_SITE, IMPORTED_REASON, isImportedSite } from '../src/lib/design-system-imported-site.js'
import {
  contractFor,
  emitFor,
  maxVersionOf,
  minVersionOf,
  modesOf,
  quickstartTemplateOf,
  rawTemplatesOf,
  referoLibrary,
  supportForNewSite,
  templateKeyOf,
  versionKeyOf
} from '../src/lib/ds-slot.js'
import { mountDesignSystem } from '../src/sites/design-system.js'

const SYSTEM = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0' // Moxie
const CUSTOMER = 'customer@x.test'
const STAFF = 'staff@tracy.test'
const lock = customerLock({
  isStaff: async (email) => email === STAFF,
  isReady: async (key) => key === 'emdash/tracy-business'
})

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

/** Tracy Business on EmDash, open to customers: the same row, born on the fleet or imported. */
const BORN = {
  platform: 'emdash',
  origin: 'fleet_born',
  quickstart_tag: 'tracy-business/emdash-0.x',
  quickstart_version: '1.7.10'
}
const IMPORTED = { ...BORN, origin: 'migrated' }

/** The Design system doors for one signed-in person and one site; `jobs` counts runs in its container. */
function doors(email, site) {
  const jobs = []
  const app = new Hono()
  mountDesignSystem(app, {
    requireGrant: async () => ({ kind: 'session', email, grant: { role: 'owner' } }),
    signedIn: async () => ({ email }),
    siteByKey: async (key) => ({
      site_key: key,
      label: 'dsimport',
      host: 'local',
      address: 'https://dsimport.tracy.test',
      ...site
    }),
    toolsetRefusal: async () => null,
    runJob: async (_site, input) => {
      jobs.push(input)
      return { ok: true, output: JSON.stringify({ ok: true, slot: null }) }
    },
    lease: { take: async () => ({ ok: true, fresh: true }), release: async () => {} },
    record: async () => {},
    store: { insert: async () => {}, latest: async () => null, markUndone: async () => {} },
    ds,
    customerLock: lock,
    preview: {
      innerOf: () => new URL('http://dsimport.inner'),
      publicOf: () => 'https://dsimport.tracy.test',
      fetchImpl: async () =>
        new Response('<html><head></head><body>home</body></html>', {
          headers: { 'content-type': 'text/html' }
        })
    }
  })
  return { app, jobs }
}

const read = (app) => app.request('/api/sites/dsimport.localhost/design-system').then((r) => r.json())
const preview = (app, id) =>
  app.request(`/api/sites/dsimport.localhost/design-system/preview?id=${encodeURIComponent(id)}`)
const apply = (app, id) =>
  app.request('/api/sites/dsimport.localhost/design-system', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id })
  })

test('the signal: only a migrated row is imported', () => {
  assert.equal(isImportedSite({ origin: 'migrated' }), true)
  assert.equal(isImportedSite({ origin: 'fleet_born' }), false)
  assert.equal(isImportedSite({ origin: null }), false)
  assert.equal(isImportedSite(null), false)
})

test('read: an imported site says SITE_IMPORTED without a container run; a template-created one is supported', async () => {
  for (const email of [CUSTOMER, STAFF]) {
    const imported = doors(email, IMPORTED)
    const body = await read(imported.app)
    assert.equal(body.supported, false)
    assert.equal(body.reason, IMPORTED_REASON)
    assert.equal(body.imported, true)
    assert.equal(body.locked, true)
    assert.equal(imported.jobs.length, 0, 'nothing is read in the container')
  }
  const born = await read(doors(CUSTOMER, BORN).app)
  assert.equal(born.supported, true)
  assert.equal(born.imported, undefined)
})

test('preview: a system on an imported site is 403 DS_IMPORTED_SITE for customers and staff; the template look stays', async () => {
  for (const email of [CUSTOMER, STAFF]) {
    const refused = await preview(doors(email, IMPORTED).app, SYSTEM)
    assert.equal(refused.status, 403)
    assert.equal((await refused.json()).code, DS_IMPORTED_SITE)
  }
  const bare = await preview(doors(CUSTOMER, IMPORTED).app, 'template-default')
  assert.notEqual(bare.status, 403, 'the Template default page is not a new look')
  const born = await preview(doors(CUSTOMER, BORN).app, SYSTEM)
  assert.notEqual(born.status, 403)
})

test('apply: an imported site is 403 DS_IMPORTED_SITE before anything runs; a template-created one is written', async () => {
  for (const email of [CUSTOMER, STAFF]) {
    const imported = doors(email, IMPORTED)
    const refused = await apply(imported.app, SYSTEM)
    assert.equal(refused.status, 403)
    assert.deepEqual(await refused.json(), { code: DS_IMPORTED_SITE, reason: IMPORTED_REASON })
    assert.equal(imported.jobs.length, 0, 'nothing is emitted or written')
  }
  const born = doors(CUSTOMER, BORN)
  const ok = await apply(born.app, SYSTEM)
  assert.notEqual(ok.status, 403)
  assert.ok(born.jobs.length > 0, 'the write ran in the container')
})
