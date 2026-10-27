/**
 * Demo domains: the address a public demo of a quickstart answers at, and the admin table that
 * pins one per tag. The default is derived from the tag so two people never spell it twice.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { defaultDemoLabel, DEMO_TARGETS } from '../src/lib/demo-domain.js'

test('the default demo label is the template name and the CMS, one level under the zone', () => {
  assert.equal(defaultDemoLabel('tracy-business/j6', 'joomla'), 'business-joomla')
  assert.equal(defaultDemoLabel('tracy-business/emdash-0.x', 'emdash'), 'business-emdash')
  assert.equal(defaultDemoLabel('tracy-business/wp7', 'wordpress'), 'business-wordpress')
  assert.equal(defaultDemoLabel('tracy-apple/j6', 'joomla'), 'apple-joomla')
  assert.equal(defaultDemoLabel('quickstart/ja-kinetic/j6', 'joomla'), 'ja-kinetic-joomla')
  assert.equal(defaultDemoLabel('tracy-base/j6', 'joomla'), 'base-joomla')
})

test('the target list is closed: a name outside it is not a place a demo can be put', () => {
  assert.deepEqual([...DEMO_TARGETS], ['tracy', 'joomlart'])
})

test('a JoomlArt demo is named by the slug the vendor already serves, not by Tracy’s rule', () => {
  // The address exists ALREADY: `ja-kinetic.demo.joomlart.com` has been answering for months, and
  // 70 of them were measured on 16/09. Deriving `ja-kinetic-joomla` for that target would name an
  // address nobody serves, and the screen would offer it as if it were live.
  assert.equal(defaultDemoLabel('quickstart/ja-kinetic/j6', 'joomla', 'joomlart'), 'ja-kinetic')
  assert.equal(defaultDemoLabel('quickstart/ja-teline-v/j6', 'joomla', 'joomlart'), 'ja-teline-v')
  // The same tag, the other target, keeps the rule it always had.
  assert.equal(defaultDemoLabel('quickstart/ja-kinetic/j6', 'joomla', 'tracy'), 'ja-kinetic-joomla')
  assert.equal(defaultDemoLabel('quickstart/ja-kinetic/j6', 'joomla'), 'ja-kinetic-joomla')
})

test('only a JoomlArt-published tag has a JoomlArt default — Tracy’s own releases have none there', () => {
  // `tracy-business/j6` is Tracy's release; JoomlArt does not serve a demo of it, and inventing
  // `business.demo.joomlart.com` would be an address that 404s dressed as one that works.
  assert.equal(defaultDemoLabel('tracy-business/j6', 'joomla', 'joomlart'), null)
})

test('a tag with no readable name or no platform has no default, rather than a made-up one', () => {
  assert.equal(defaultDemoLabel('j6', 'joomla'), null)
  assert.equal(defaultDemoLabel('tracy-business/j6', null), null)
  assert.equal(defaultDemoLabel('Weird Name!/j6', 'joomla'), null)
})

import { readDemoDomains, saveDemoDomain } from '../src/lib/demo-domain.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

/** Two releases as `readReleases` hands them over — one of each CMS a demo can be built for. */
const RELEASES = [
  {
    tag: 'tracy-business/j6',
    platform: 'joomla',
    choosable: true,
    setting: { label: 'Tracy Business', version: '1.0.0' }
  },
  {
    tag: 'tracy-business/emdash-0.x',
    platform: 'emdash',
    choosable: true,
    setting: { label: 'Tracy Business', version: '1.0.0' }
  },
  { tag: 'tracy-base/wp7', platform: 'wordpress', choosable: false, setting: null }
]

test('every installable release has a demo address before anyone pins one', opts, async () => {
  const { pool } = db
  const rows = await readDemoDomains(pool, RELEASES)
  assert.deepEqual(
    rows.map((r) => [r.tag, r.label, r.pinned, r.revision]),
    [
      ['tracy-business/j6', 'business-joomla', false, 0],
      ['tracy-business/emdash-0.x', 'business-emdash', false, 0]
    ],
    'a draft has no demo to name; the derived label is the answer until a person writes one'
  )
})

test('a pinned label survives a re-read, and competing saves are refused by revision', opts, async () => {
  const { pool } = db
  assert.deepEqual(await saveDemoDomain(pool, 'tracy-business/j6', 'business-j6', 0, 'o@t.test'), {
    ok: true,
    revision: 1
  })
  const [row] = await readDemoDomains(pool, RELEASES)
  assert.equal(row.label, 'business-j6')
  assert.equal(row.pinned, true)
  assert.equal(row.revision, 1)
  assert.equal(row.updatedBy, 'o@t.test')
  assert.deepEqual(
    await saveDemoDomain(pool, 'tracy-business/j6', 'business-x', 0, 'o@t.test'),
    { error: 'DEMO_CHANGED' },
    'a save against the revision someone else already moved past is refused, not merged'
  )
  assert.deepEqual(await saveDemoDomain(pool, 'tracy-business/j6', 'business-x', 1, 'p@t.test'), {
    ok: true,
    revision: 2
  })
})

test('a label is refused when malformed or already the demo of another quickstart', opts, async () => {
  const { pool } = db
  assert.deepEqual(await saveDemoDomain(pool, 'tracy-business/j6', 'Business.Joomla', 0, 'o@t.test'), {
    error: 'INVALID_LABEL'
  })
  assert.deepEqual(await saveDemoDomain(pool, 'tracy-business/j6', 'shared', 0, 'o@t.test'), {
    ok: true,
    revision: 1
  })
  assert.deepEqual(
    await saveDemoDomain(pool, 'tracy-business/emdash-0.x', 'shared', 0, 'o@t.test'),
    { error: 'LABEL_TAKEN', by: 'tracy-business/j6' },
    'one address serves one demo — two quickstarts on it would silently overwrite each other'
  )
})

import { readConfig } from '../src/config.js'

/** The smallest env `readConfig` accepts, so a test can say one thing and change one thing. */
const baseEnv = () => ({
  TRACY_ORIGIN: 'https://cowork.example',
  SITE_DOMAIN: 'tracy.example',
  SESSION_SECRET: 'x'.repeat(32),
  MAIL_FROM: 'a@b.c',
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host:8081',
  HOST_local_DSH_ORIGIN: 'http://dsh:7000',
  HOST_local_SECRET: 's',
  SEAT_local_SECRET: 's',
  DEMO_HOST: 'local'
})

test('a deployment that never heard of JoomlArt draws one target, exactly as before', () => {
  const { demoTargets } = readConfig(baseEnv())
  assert.deepEqual(
    demoTargets.map((t) => [t.name, t.kind, t.zone]),
    [['tracy', 'host', 'tracy.example']]
  )
})

test('the second target appears only when its zone is declared, and says which machine it is', () => {
  const { demoTargets } = readConfig({
    ...baseEnv(),
    DEMO_JOOMLART_ZONE: 'demo.joomlart.com',
    DEMO_JOOMLART_SERVER_NAME: 'j-ja-demo',
    DEMO_JOOMLART_SERVER_IP: '203.0.113.46'
  })
  const ja = demoTargets.find((t) => t.name === 'joomlart')
  assert.deepEqual(
    [ja.kind, ja.zone, ja.serverName, ja.serverIp],
    // `record`, not `host`: Tracy did not build that machine and installs nothing onto it.
    ['record', 'demo.joomlart.com', 'j-ja-demo', '203.0.113.46']
  )
})

test('a deployment with no demo host at all has no targets, rather than an unusable one', () => {
  const env = baseEnv()
  delete env.DEMO_HOST
  assert.deepEqual(readConfig(env).demoTargets, [])
})

import { demoAddress } from '../src/lib/demo-sites.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

test('a demo address answers where its deployment answers — scheme and port included', () => {
  // ⚠ THE BUG THIS EXISTS FOR. `https://<label>.<zone>/` was written in by hand, which is right on
  // cowork.tracy.ai and wrong on every developer's machine: measured 17/09, the Demos screen's own
  // link answered HTTP 000 while the site answered 200 at http://…:8080. The address a screen
  // offers has to be one a browser can open.
  const local = { name: 'tracy', zone: 'tracy.test', scheme: 'http', port: ':8080' }
  assert.equal(demoAddress('ja-kinetic-joomla', local), 'http://ja-kinetic-joomla.tracy.test:8080/')
  // Somebody else's public server is https on 443 whatever shape this deployment has.
  const vendor = { name: 'joomlart', zone: 'demo.joomlart.com', scheme: 'https', port: '' }
  assert.equal(demoAddress('ja-kinetic', vendor), 'https://ja-kinetic.demo.joomlart.com/')
  // A caller still handing over the whole config gets this deployment's own address.
  assert.equal(
    demoAddress('base-joomla', { origin: 'https://cowork.tracy.ai', siteDomain: 'tracy.ai' }),
    'https://base-joomla.tracy.ai/'
  )
})

test('the tracy target takes its scheme and port from TRACY_ORIGIN, never from a literal', () => {
  const env = {
    ...baseEnv(),
    TRACY_ORIGIN: 'http://tracy.test:8080',
    SITE_DOMAIN: 'tracy.test'
  }
  const tracy = readConfig(env).demoTargets.find((t) => t.name === 'tracy')
  assert.deepEqual([tracy.scheme, tracy.port], ['http', ':8080'])
  const prod = readConfig({ ...baseEnv(), TRACY_ORIGIN: 'https://cowork.tracy.ai' }).demoTargets.find(
    (t) => t.name === 'tracy'
  )
  assert.deepEqual([prod.scheme, prod.port], ['https', ''])
})

test('one label is two addresses, because the zone belongs to the target and not to the process', () => {
  const tracy = { name: 'tracy', zone: 'tracy.example' }
  const joomlart = { name: 'joomlart', zone: 'demo.joomlart.com' }
  assert.equal(demoAddress('ja-kinetic', joomlart), 'https://ja-kinetic.demo.joomlart.com/')
  assert.equal(demoAddress('ja-kinetic', tracy), 'https://ja-kinetic.tracy.example/')
  // Every caller that still hands over the whole config keeps meaning Tracy's own zone.
  assert.equal(
    demoAddress('business-joomla', { origin: 'https://cowork.tracy.example', siteDomain: 'tracy.example' }),
    'https://business-joomla.tracy.example/'
  )
})
