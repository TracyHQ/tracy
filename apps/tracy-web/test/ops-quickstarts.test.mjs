/**
 * The Quickstarts doors: the list as last read, one release with its candidates, and the four
 * presses that change something — choose, write, delete, translate.
 *
 * Every test seeds `quickstart_releases` directly, the way a read of GitHub would have left it, so
 * what these assert is the SCREEN's contract and not the reader's (that one has its own file).
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { DESIGN_CATEGORIES } from '../src/lib/design-inspiration.js'
import { loadStandardQuestions, resolveQuestions } from '../src/lib/build-questions.js'
import { isTemplateId, readReleases, templateOfTag, templateRelease } from '../src/lib/quickstart-releases.js'
import { mintSession } from '../src/lib/session.js'
import { demoPublicHost } from '../src/ops/quickstarts.js'
import { deleteShot, putShot } from '../src/lib/template-shots.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(async () => {
  seedCoverage()
  await db.reset()
})
after(db.close)

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
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const TAG = 'tracy-business/emdash-0.x'
const DRAFT = 'tracy-base/wp7'

// Publish fixtures borrow a released WordPress contract. Give this process a private copy with a
// measured audit, keeping the released map and lock unchanged and exercising the real coverage reader.
const contracts = defaultContracts()
const wpContract = contractFor(contracts, DRAFT, '1.0.0')
const releasedDir = wpContract.dir
let fixtureDir
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
before(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), 'ops-quickstarts-'))
  cpSync(releasedDir, fixtureDir, { recursive: true })
  wpContract.dir = fixtureDir
})
after(() => {
  wpContract.dir = releasedDir
  rmSync(fixtureDir, { recursive: true, force: true })
})
function seedCoverage() {
  writeFileSync(
    path.join(fixtureDir, 'content-coverage.json'),
    JSON.stringify({
      schemaVersion: 'tracy-content-coverage/v1',
      tool: { name: 'test', version: '1.1.0' },
      contract: {
        id: wpContract.id,
        contentMapSha256: digest(path.join(fixtureDir, 'content-map.json')),
        presentationLockSha256: digest(path.join(fixtureDir, 'presentation-lock.json'))
      },
      pages: { failed: 0, capReached: false },
      counts: {},
      coverage: { text: 100, images: 100, links: 100 },
      holes: [],
      hygiene: []
    })
  )
}

const questionnaire = (owner, label) => ({
  schemaVersion: 'tracy-questions/v1',
  owner,
  languages: ['en', 'vi'],
  questions: [
    { id: 'name', kind: 'text', step: 1, label: { en: label, vi: 'Tên công ty' }, feeds: ['site.name'] }
  ]
})

/**
 * Every text and image slot has a role (Content coverage, ADR 0038). The released contracts these fixtures borrow
 * predate ADR 0038 and are never edited, so the harness answers for them; `realRoles` reads the contract instead.
 */
const ROLES_READY = () => ({ state: 'ready' })
/** The same for Slot fit (ADR 0039): the released contracts these fixtures borrow predate it. */
const FIT_READY = () => ({ state: 'ready' })

function harness(pool, { opsFetch, extraEnv, realRoles = false } = {}) {
  const config = readConfig({
    ...env,
    ...(opsFetch ? { MODEL_API_KEY: 'test-key', MODEL_BASE_URL: 'https://model.test/v1' } : {}),
    ...extraEnv
  })
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    ...(realRoles ? {} : { rolesOf: ROLES_READY, fitOf: FIT_READY }),
    ...(opsFetch ? { fetchImpl: opsFetch } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
    )
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'http://tracy.test',
          'content-type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
  /** Raw bytes, the way the picture upload door is pressed from a browser's file input. */
  const sendBytes = (method, path, cookie, bytes, contentType = 'image/png') =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: 'http://tracy.test',
          'content-type': contentType
        },
        ...(bytes === undefined ? {} : { body: bytes })
      })
    )
  return { app, get, send, sendBytes, cookieFor }
}

async function seedStaff(pool, email, role = 'owner') {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  // One `tracy_admin` workspace per run, however many people are seeded into it — the display name
  // is unique, and two staff in a test are two SEATS, not two Tracys.
  const ws =
    (await pool.query("select id from workspace where kind = 'tracy_admin' limit 1")).rows[0]?.id ??
    (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
      )
    ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
     values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
}

async function seedReleases(pool) {
  const insert = (tag, release, setting, tracy, reason) =>
    pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, $4, $5)`,
      [tag, JSON.stringify(release), setting ? JSON.stringify(setting) : null, tracy, reason]
    )
  const emdash = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'emdash',
    label: 'Tracy Business',
    version: '1.0.0',
    cms: '0.37.0',
    install: {
      source: { file: 'q.zip', sha256: 'a'.repeat(64) },
      state: { file: 's.tar.gz', sha256: 'b'.repeat(64) }
    }
  }
  await insert(
    TAG,
    {
      name: 'Quickstart: Tracy Business',
      kind: 'quickstart',
      github: 'published',
      publishedAt: '2026-09-14T19:33:55Z',
      assets: []
    },
    emdash,
    'ready',
    null
  )
  await insert(
    DRAFT,
    {
      name: 'Quickstart: Tracy Base / WordPress',
      kind: 'quickstart',
      github: 'draft',
      publishedAt: null,
      assets: []
    },
    {
      ...emdash,
      platform: 'wordpress',
      cms: '7.1',
      install: {
        webroot: { file: 'w.tar.gz', sha256: 'c'.repeat(64) },
        database: { file: 'd.sql.gz', sha256: 'd'.repeat(64) }
      }
    },
    'ready',
    null
  )
  await insert(
    'quickstart/ja-kinetic/j6',
    {
      name: 'Quickstart: ja_kinetic',
      kind: 'quickstart',
      github: 'prerelease',
      publishedAt: '2026-09-14T10:55:20Z',
      assets: []
    },
    null,
    'no-setting',
    'No tracy_setting.json among the assets.'
  )
  await pool.query(
    `insert into question_set (id, owner, name, source, version, sha256, doc)
     values ($1, $2, 'Released 1.0.0', 'released', '1.0.0', 'aa', $3::jsonb)`,
    [`${TAG}@aa`, TAG, JSON.stringify(questionnaire(TAG, 'Business name'))]
  )
}

test(
  'the list is what was last read, counted per CMS, with a guessed CMS marked as a guess',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedReleases(pool)
    assert.equal((await get('/api/ops/quickstarts')).status, 302, 'a stranger is sent to sign in')
    const outsider = await cookieFor('outside@example.test')
    assert.equal((await get('/api/ops/quickstarts', outsider)).status, 403)

    await seedStaff(pool, 'owner@example.test')
    const owner = await cookieFor('owner@example.test')
    const body = await (await get('/api/ops/quickstarts', owner)).json()
    assert.equal(body.releases.length, 3)
    assert.deepEqual(body.counts, { all: 3, joomla: 1, wordpress: 1, emdash: 1 })
    assert.ok(body.readAt, 'the screen can say how old the reading is')
    assert.equal(body.writable, true)

    const business = body.releases.find((r) => r.tag === TAG)
    assert.deepEqual(
      [business.kind, business.github, business.tracy, business.choosable],
      ['quickstart', 'published', 'ready', true]
    )

    const draft = body.releases.find((r) => r.tag === DRAFT)
    assert.equal(draft.tracy, 'ready')
    assert.equal(draft.choosable, false, 'a draft is readable and still not choosable')

    const kinetic = body.releases.find((r) => r.tag === 'quickstart/ja-kinetic/j6')
    assert.equal(kinetic.platform, 'joomla')
    assert.equal(kinetic.platformFromTag, true, 'the CMS is a guess from the tag, and says so')
    assert.match(kinetic.reason, /tracy_setting\.json/)
  }
)

test(
  'one release: what it declares and the sites built from it, with no questionnaire candidates',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedReleases(pool)
    await seedStaff(pool, 'owner@example.test')
    const owner = await cookieFor('owner@example.test')

    assert.equal((await get('/api/ops/quickstart?tag=nope', owner)).status, 404)
    const body = await (await get(`/api/ops/quickstart?tag=${encodeURIComponent(TAG)}`, owner)).json()
    assert.equal(body.setting.label, 'Tracy Business')
    assert.equal(body.platform, 'emdash')
    assert.deepEqual(body.sites, [], 'no site has been built from it here')
    // The generator and the /ops question-set editor are gone (10/10/2026): the door names none of it.
    for (const gone of ['sets', 'choice', 'capabilities', 'generations', 'canGenerate', 'canTranslate'])
      assert.equal(body[gone], undefined, gone)
  }
)

test(
  'customer questions: the /ops preview is the customer door’s own resolveQuestions, fitted to the release',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedReleases(pool)
    const door = `/api/ops/quickstart/customer-questions?tag=${encodeURIComponent(TAG)}`
    assert.equal((await get(door)).status, 302, 'a stranger is sent to sign in')
    assert.equal((await get(door, await cookieFor('outside@example.test'))).status, 403)
    await seedStaff(pool, 'dev@example.test', 'developer')
    const reader = await cookieFor('dev@example.test')
    assert.equal(
      (await get('/api/ops/quickstart/customer-questions?tag=nope', reader)).status,
      404,
      'an unknown release'
    )
    const before = (await pool.query('select count(*)::int as n from question_snapshot')).rows[0].n
    const res = await get(door, reader)
    assert.equal(res.status, 200, 'a read-only door: any staff seat may read it')
    const body = await res.json()

    const release = (await readReleases(pool)).find((r) => r.tag === TAG)
    const served = await resolveQuestions({
      platform: 'emdash',
      quickstart: TAG,
      lang: 'en',
      pool,
      standard: loadStandardQuestions(),
      release,
      brandUploads: false,
      warn: () => {}
    })
    assert.deepEqual(body.questions, served.questions, 'the questions the customer door serves, not a copy')
    assert.equal(body.set.contentHash, served.set.contentHash)
    assert.equal(body.brandUploads, false, 'no artifact store here, so brand uploads are off')
    assert.deepEqual(
      body.brandQuestions.map((q) => q.kind).sort(),
      ['favicon', 'logo'],
      'the brand questions as they would be asked once uploads are on'
    )
    assert.deepEqual(body.fitted.logo.variants, ['single'], 'no template profile row: one logo is asked')
    assert.equal(body.fitted.logo.profile, null)
    assert.equal(body.fitted.pages, null, 'the release ships no page list: the build keeps every page')
    assert.equal(
      (await pool.query('select count(*)::int as n from question_snapshot')).rows[0].n,
      before,
      'the preview keeps no snapshot'
    )
  }
)

test(
  'GET /api/templates: the finished sites Design inspiration can show, one card per template',
  opts,
  async () => {
    const { pool } = db
    const { get } = harness(pool)
    // Two releases of one template — Joomla and EmDash — plus a release with no card at all.
    const card = {
      provider: 'JoomlArt',
      category: 'Professional & Corporate',
      blurb: 'Industrial / B2B company site.',
      image: 'business-home-1440.png',
      template: 'tracy-business',
      demo: { url: 'https://business-emdash.tracy.ai', version: '1.0.0' },
      layouts: [{ key: 'home', label: 'Home', path: '/' }]
    }
    const insert = (tag, platform, withCard) =>
      pool.query(
        `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
        [
          tag,
          JSON.stringify({
            name: tag,
            kind: 'quickstart',
            github: 'published',
            publishedAt: null,
            assets: []
          }),
          JSON.stringify({
            schemaVersion: 'tracy-setting/v1',
            platform,
            label: 'Tracy Business',
            version: '1.0.0',
            cms: platform === 'joomla' ? '6.1.1' : '0.37.0',
            install:
              platform === 'joomla'
                ? {
                    webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
                    database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
                  }
                : {
                    source: { file: 'q.zip', sha256: 'c'.repeat(64) },
                    state: { file: 's.tar.gz', sha256: 'd'.repeat(64) }
                  },
            ...(withCard ? { card } : {})
          })
        ]
      )
    await insert('tracy-business/j6', 'joomla', true)
    await insert('tracy-business/emdash-0.x', 'emdash', true)
    await insert('tracy-base/j6', 'joomla', false)

    // Public: Design inspiration is served to anyone who can see a lane, so this door does not admit.
    const body = await (await get('/api/templates')).json()
    assert.equal(body.templates.length, 1, 'two archives of one site are ONE card, not two')
    const [t] = body.templates
    assert.equal(t.id, 'tracy-business')
    assert.deepEqual(
      t.platforms.map((p) => p.platform).sort(),
      ['emdash', 'joomla'],
      'the card lists every CMS that builds it, so Create with can light both'
    )
    assert.equal(t.platforms.find((p) => p.platform === 'emdash').tag, 'tracy-business/emdash-0.x')
    // A sealed Joomla build and an EmDash template with the personalize tool take the popup's Apply.
    assert.deepEqual(t.platforms.map((p) => [p.platform, p.apply]).sort(), [
      ['emdash', true],
      ['joomla', true]
    ])
    assert.equal(t.card.blurb, card.blurb)
    assert.ok(body.readAt, 'a reader can tell how old this is')
  }
)

test(
  'GET /api/templates says per platform whether Apply can write the build: a release no contract seals cannot',
  opts,
  async () => {
    const { pool } = db
    const { get } = harness(pool)
    await pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        'quickstart/ja-nova/j6',
        JSON.stringify({
          name: 'j6',
          kind: 'quickstart',
          github: 'published',
          publishedAt: null,
          assets: []
        }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform: 'joomla',
          label: 'JA Nova',
          version: '1.0.0',
          cms: '6.1.1',
          install: {
            webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
            database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
          },
          card: {
            provider: 'JoomlArt',
            category: 'Professional & Corporate',
            blurb: 'A corporate site.',
            template: 'ja-nova'
          }
        })
      ]
    )
    const { templates } = await (await get('/api/templates')).json()
    const nova = templates.find((t) => t.id === 'ja-nova')
    assert.ok(nova, 'the card is offered')
    assert.deepEqual(
      nova.platforms.map((p) => [p.platform, p.apply]),
      [['joomla', false]],
      'no profile seals it, so the wizard does not ask what its text should say'
    )
  }
)

test(
  'a template whose only release is a draft is not offered — the same rule as a build base',
  opts,
  async () => {
    const { pool } = db
    const { get } = harness(pool)
    await pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        'tracy-base/wp7',
        JSON.stringify({ name: 'wp7', kind: 'quickstart', github: 'draft', publishedAt: null, assets: [] }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform: 'wordpress',
          label: 'Tracy Base',
          version: '1.0.0',
          cms: '7.1',
          install: {
            webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
            database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
          },
          card: { provider: 'Tracy', template: 'tracy-base', blurb: 'x', image: 'x.png' }
        })
      ]
    )
    assert.deepEqual((await (await get('/api/templates')).json()).templates, [])
  }
)

// ── the card as its own file ───────────────────────────────────────────────────────────────────

/** Seed one ready release, with a card in either shape, both, or neither. */
async function seedCard(pool, tag, { card = null, inspiration = null, reason = null } = {}) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, inspiration, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, $4::jsonb, 'ready', $5)`,
    [
      tag,
      JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt: null, assets: [] }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        label: 'Tracy Business',
        version: '1.0.0',
        cms: '0.37.0',
        template: 'tracy-business',
        install: {
          source: { file: 'q.zip', sha256: 'a'.repeat(64) },
          state: { file: 's.tar.gz', sha256: 'b'.repeat(64) }
        },
        ...(card ? { card } : {})
      }),
      inspiration ? JSON.stringify(inspiration) : null,
      reason
    ]
  )
}

const inspirationDoc = (over = {}) => ({
  schemaVersion: 'tracy-design-inspiration/v1',
  template: 'tracy-business',
  provider: 'JoomlArt',
  category: 'Professional & Corporate',
  blurb: 'From the file.',
  image: 'business-home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'business-home-1440.png' } }],
  ...over
})

const legacyBlock = {
  provider: 'JoomlArt',
  template: 'tracy-business',
  blurb: 'From the setting.',
  image: 'x.png',
  layouts: [{ key: 'home', label: 'Home', path: '/' }]
}

test('GET /api/templates draws the card from tracy_design_inspiration.json', opts, async () => {
  const { pool } = db
  const { get } = harness(pool)
  await seedCard(pool, TAG, { inspiration: inspirationDoc() })
  const { templates } = await (await get('/api/templates')).json()
  assert.equal(templates.length, 1)
  assert.equal(templates[0].id, 'tracy-business')
  assert.equal(templates[0].card.blurb, 'From the file.')
})

test(
  'GET /api/templates: a picture the store does not hold is null, never a bare name (#523)',
  opts,
  async () => {
    // Measured 27/09: `ja-restaurant` has no picture assets and no demo, so the store holds nothing
    // for it, and the door answered `"image": "ja-restaurant-home-390.png"` — a name no surface can
    // serve, drawn as a broken image. The card stays; each picture it cannot back is null.
    const { pool } = db
    const { get } = harness(pool)
    await seedCard(pool, TAG, {
      inspiration: inspirationDoc({
        layouts: [
          {
            key: 'home',
            label: 'Home',
            path: '/',
            shots: { desktop: 'business-home-1440.png', mobile: 'business-home-390.png' }
          }
        ]
      })
    })
    await seedCard(pool, 'ja-restaurant/emdash-0.x', {
      inspiration: inspirationDoc({
        template: 'ja-restaurant',
        image: 'ja-restaurant-home-390.png',
        layouts: [
          {
            key: 'home',
            label: 'Home',
            path: '/',
            shots: { desktop: 'ja-restaurant-home-1440.png', mobile: 'ja-restaurant-home-390.png' }
          }
        ]
      })
    })
    const { sha256 } = await putShot(pool, {
      templateId: 'tracy-business',
      file: 'business-home-1440.png',
      bytes: pngBytes()
    })

    const read = async () => {
      const { templates } = await (await get('/api/templates')).json()
      return Object.fromEntries(templates.map((t) => [t.id, t]))
    }
    const cards = await read()
    assert.deepEqual(Object.keys(cards).sort(), ['ja-restaurant', 'tracy-business'], 'no card is hidden')

    const restaurant = cards['ja-restaurant'].card
    assert.equal(restaurant.image, null)
    assert.deepEqual(restaurant.layouts[0].shots, { desktop: null, mobile: null })

    // A held picture keeps its absolute, versioned address; its unheld sibling is null.
    const business = cards['tracy-business'].card
    assert.equal(
      business.image,
      `http://tracy.test/api/templates/tracy-business/shots/business-home-1440.png?v=${sha256.slice(0, 8)}`
    )
    assert.equal(business.layouts[0].shots.desktop, business.image)
    assert.equal(business.layouts[0].shots.mobile, null)

    // A picture deleted between two reads is gone from the next answer, not left as a name.
    await deleteShot(pool, 'tracy-business', 'business-home-1440.png')
    const after = (await read())['tracy-business'].card
    assert.equal(after.image, null)
    assert.equal(after.layouts[0].shots.desktop, null)
  }
)

test(
  'GET /api/ops/quickstarts names the ONE release whose card customers see, the same one GET /api/templates serves',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedStaff(pool, 'owner@tracy.test')
    const OTHER = 'tracy-business/j6'
    await seedCard(pool, TAG, { inspiration: inspirationDoc({ blurb: 'EmDash card.' }) })
    await seedCard(pool, OTHER, { inspiration: inspirationDoc({ blurb: 'Joomla card.' }) })
    const read = async () => {
      const { releases } = await (
        await get('/api/ops/quickstarts', await cookieFor('owner@tracy.test'))
      ).json()
      const { templates } = await (await get('/api/templates')).json()
      return {
        sources: releases.filter((r) => r.cardSource).map((r) => r.tag),
        blurb: templates[0]?.card.blurb ?? null
      }
    }

    // Same date, so the tag breaks the tie: the EmDash release is read first and supplies the card.
    assert.deepEqual(await read(), { sources: [TAG], blurb: 'EmDash card.' })

    // Hidden: the next shown release supplies the card, and the badge moves with it.
    await pool.query('update quickstart_releases set inspiration_hidden = true where tag = $1', [TAG])
    assert.deepEqual(await read(), { sources: [OTHER], blurb: 'Joomla card.' })

    // Nothing shown: no release is named.
    await pool.query('update quickstart_releases set inspiration_hidden = true where tag = $1', [OTHER])
    assert.deepEqual(await read(), { sources: [], blurb: null })
  }
)

test('GET /api/templates still draws a card left inside tracy_setting.json', opts, async () => {
  const { pool } = db
  const { get } = harness(pool)
  await seedCard(pool, TAG, { card: legacyBlock })
  const { templates } = await (await get('/api/templates')).json()
  assert.equal(templates.length, 1)
  assert.equal(templates[0].card.blurb, 'From the setting.')
})

test('a release carrying both shapes shows the file, and the row still says so', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seedStaff(pool, 'owner@tracy.test')
  await seedCard(pool, TAG, { card: legacyBlock, inspiration: inspirationDoc() })
  const { templates } = await (await get('/api/templates')).json()
  assert.equal(templates[0].card.blurb, 'From the file.')

  const detail = await (
    await get(`/api/ops/quickstart?tag=${encodeURIComponent(TAG)}`, await cookieFor('owner@tracy.test'))
  ).json()
  assert.equal(detail.inspiration.blurb, 'From the file.', 'the screen reads the file, not the block')
})

test('a card the reader refused leaves no card and a reason the screen can show', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seedStaff(pool, 'owner@tracy.test')
  await seedCard(pool, TAG, {
    reason: 'tracy_design_inspiration.json: provider must be one of Tracy, JoomlArt'
  })
  assert.deepEqual((await (await get('/api/templates')).json()).templates, [])

  const detail = await (
    await get(`/api/ops/quickstart?tag=${encodeURIComponent(TAG)}`, await cookieFor('owner@tracy.test'))
  ).json()
  assert.equal(detail.inspiration, null)
  assert.equal(detail.tracy, 'ready')
  assert.equal(detail.choosable, true, 'a wrong card does not stop a site being built')
  assert.match(detail.reason, /tracy_design_inspiration\.json/)
})

// ── publishing a card from the operations page ─────────────────────────────────────────────────

/**
 * GitHub, as far as the two release-asset calls are concerned: one release behind the tag, one
 * upload address, and a log of what was asked of it. Everything else answers 404, so a door that
 * called somewhere unexpected fails loudly rather than passing on a stub that says yes to all.
 */
function fakeGithub({ assets = [], uploadStatus = 201 } = {}) {
  const calls = []
  const release = { id: 7, assets: [...assets] }
  // Each upload its own id, as on GitHub: deleting one asset must not take another with it.
  let nextId = 42
  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url
    const method = init.method ?? 'GET'
    calls.push(`${method} ${url}`)
    if (url.startsWith('https://api.github.com/repos/JoomlArt-Products/joomlart-products/releases/tags/'))
      return new Response(JSON.stringify(release), { status: 200 })
    if (/^https:\/\/api\.github\.com\/.*\/releases\/assets\/\d+$/.test(url) && method === 'DELETE') {
      release.assets = release.assets.filter((a) => `${a.id}` !== url.split('/').pop())
      return new Response(null, { status: 204 })
    }
    if (url.startsWith('https://uploads.github.com/') && method === 'POST') {
      if (uploadStatus >= 400) return new Response('no', { status: uploadStatus })
      const name = new URL(url).searchParams.get('name')
      const id = nextId++
      release.assets.push({ id, name })
      return new Response(JSON.stringify({ id, name }), { status: 201 })
    }
    return new Response('unexpected', { status: 404 })
  }
  return { fetchImpl, calls, release }
}

/** What an administrator types into the sheet — no schemaVersion, no template, no demo. */
const typedCard = (over = {}) => ({
  provider: 'JoomlArt',
  category: 'Professional & Corporate',
  blurb: 'Industrial / B2B company site.',
  image: 'business-home-1440.png',
  nav: 'top-left',
  hero: 'split',
  dark: true,
  layouts: [
    {
      key: 'home',
      label: 'Home',
      path: '/',
      shots: { desktop: 'business-home-1440.png', mobile: 'business-home-390.png' }
    }
  ],
  ...over
})

const DOOR = `/api/ops/quickstart/inspiration?tag=${encodeURIComponent(TAG)}`
const withToken = { TRACY_RELEASES_GITHUB_TOKEN: 'ghs_test' }

const PUBLISH = `/api/ops/quickstart/inspiration/publish?tag=${encodeURIComponent(TAG)}`
const names = (github) => github.release.assets.map((a) => a.name).sort()

test('Save card writes the card onto the release and keeps it hidden from customers', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  const column = async () =>
    (await (await get('/api/ops/quickstarts', owner)).json()).releases.find((r) => r.tag === TAG).inspiration
  assert.equal((await column()).state, 'none', 'no card yet: the Templates page lists "No card"')

  const answer = await send('PUT', DOOR, owner, typedCard())
  assert.equal(answer.status, 200)
  const body = await answer.json()
  assert.equal(body.ok, true)
  assert.equal(body.hidden, true)
  assert.equal(body.replaced, false, 'the release carried no card before')

  // The card file AND the hidden mark on the release: other servers read it hidden too.
  assert.deepEqual(names(github), ['tracy_design_inspiration.json', 'tracy_design_inspiration_hidden.json'])
  const markAt = github.calls.findIndex((c) => c.includes('name=tracy_design_inspiration_hidden.json'))
  const cardAt = github.calls.findIndex((c) => c.includes('name=tracy_design_inspiration.json'))
  assert.ok(markAt >= 0 && markAt < cardAt, 'the mark is written before the card')
  // The file on the release: composed by the server, not taken on trust from the browser.
  assert.equal(body.inspiration.schemaVersion, 'tracy-design-inspiration/v1')
  assert.equal(body.inspiration.template, 'tracy-business', 'the template is the release’s, not typed')

  // Not on Design inspiration; the "No card" issue is gone (the release now has a card).
  assert.deepEqual((await (await get('/api/templates')).json()).templates, [])
  const cell = await column()
  assert.equal(cell.state, 'card')
  assert.equal(cell.code, 'unpublished')
  const sheet = await (await get(DOOR, owner)).json()
  assert.equal(sheet.published, false)
  assert.equal(sheet.card.blurb, 'Industrial / B2B company site.')
})

test('Publish shows the saved card, and writes no card', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  const none = await send('POST', PUBLISH, owner)
  assert.equal(none.status, 400, 'nothing to show before Save card')
  assert.equal((await none.json()).error, 'NO_CARD')
  assert.deepEqual(github.release.assets, [], 'and nothing was written')

  assert.equal((await send('PUT', DOOR, owner, typedCard())).status, 200)
  const uploads = github.calls.filter((c) => c.startsWith('POST https://uploads.github.com/')).length

  await passCustomize(pool, TAG)
  const beforeRow = (await (await get('/api/ops/quickstarts', owner)).json()).releases.find(
    (r) => r.tag === TAG
  )
  assert.equal(
    beforeRow.road.some((s) => s.step === 'slot-roles'),
    false,
    'the road has no separate Slot roles step'
  )

  const answer = await send('POST', PUBLISH, owner)
  assert.equal(answer.status, 200)
  const body = await answer.json()
  assert.equal(body.ok, true)
  const afterRow = (await (await get('/api/ops/quickstarts', owner)).json()).releases.find(
    (r) => r.tag === TAG
  )
  assert.equal(
    afterRow.road.some((s) => s.step === 'slot-roles'),
    false
  )
  assert.deepEqual(body.warnings, [], 'EmDash has no component to bind, so nothing to warn about')
  assert.deepEqual(names(github), ['tracy_design_inspiration.json'], 'the mark is gone, the card stays')
  assert.equal(
    github.calls.filter((c) => c.startsWith('POST https://uploads.github.com/')).length,
    uploads,
    'Publish uploads nothing'
  )
  const { templates } = await (await get('/api/templates')).json()
  assert.equal(templates.length, 1)
  assert.equal(templates[0].card.blurb, 'Industrial / B2B company site.')

  // Save card on a card customers already see keeps it shown: edits are live at once.
  const edit = await send('PUT', DOOR, owner, typedCard({ blurb: 'Edited.' }))
  assert.equal((await edit.json()).hidden, false)
  assert.deepEqual(names(github), ['tracy_design_inspiration.json'])
  assert.equal((await (await get('/api/templates')).json()).templates[0].card.blurb, 'Edited.')
})

test('Publish is refused while the card still could not reach customers', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  // A draft cannot be a card at all; Publish says so before writing anything.
  const draft = await send(
    'POST',
    `/api/ops/quickstart/inspiration/publish?tag=${encodeURIComponent(DRAFT)}`,
    owner
  )
  assert.equal(draft.status, 400)
  assert.equal((await draft.json()).error, 'NOT_A_CARD')
  assert.equal(
    (await send('POST', '/api/ops/quickstart/inspiration/publish?tag=nope%2Fj6', owner)).status,
    404
  )
  assert.deepEqual(github.release.assets, [])
})
/** A WordPress release of `tracy-base` at `version`: 1.0.0 is sealed, 1.0.99 is served by it, 99.0.0 has no profile. */
async function seedWordpressRelease(pool, tag, version) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      tag,
      JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt: null, assets: [] }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'wordpress',
        label: 'Tracy Base',
        version,
        cms: '7.1',
        template: 'tracy-base',
        install: {
          webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
          database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
        }
      })
    ]
  )
}

/**
 * A Customize your site check and a Design system check of the release's current version where
 * every rule passes (`lib/customize-readiness.js`, `lib/design-system-readiness.js`): Publish waits
 * for both (ADR 0029 §4, ADR 0031).
 */
async function passCustomize(pool, tag) {
  await pool.query(
    `insert into template_readiness (tag, version, fingerprint, state, report, checked_at)
     select tag, setting->>'version', 'seeded', 'done', $2::jsonb, now() from quickstart_releases where tag = $1
     on conflict (tag, version) do update set state = 'done', report = excluded.report`,
    [
      tag,
      JSON.stringify({
        results: [{ id: 'NAME-1', status: 'pass', owner: 'template', message: '', fix: null }]
      })
    ]
  )
  await passDesignSystem(pool, tag)
}

/**
 * A live demo of the release on this server: the Add site preview door dresses it, so DEMO-1 passes
 * (no demo there: the Add site panel offers no design system picker, must-fix since PR 2, 14/10/2026).
 */
async function seedLiveDemo(pool, tag) {
  await pool.query(
    `insert into site (site_key, label, host, platform, publish, address, demo, quickstart_tag, quickstart_version)
     select 'demo-' || md5(tag) || '.tracy.test', 'demo-' || left(md5(tag), 12), 'demo', setting->>'platform', 'published',
            'https://demo-' || left(md5(tag), 12) || '.tracy.test/', true, tag, setting->>'version'
       from quickstart_releases where tag = $1
     on conflict do nothing`,
    [tag]
  )
}

/** A Design system check of the release's current version where every rule passes (ADR 0031), its demo live. */
async function passDesignSystem(pool, tag) {
  await seedLiveDemo(pool, tag)
  await pool.query(
    `insert into template_ds_readiness (tag, version, fingerprint, state, report, checked_at)
     select tag, setting->>'version', 'seeded', 'done', $2::jsonb, now() from quickstart_releases where tag = $1
     on conflict (tag, version) do update set state = 'done', report = excluded.report`,
    [
      tag,
      JSON.stringify({
        results: [{ id: 'SLOT-1', status: 'pass', owner: 'contract', message: '', fix: null }]
      })
    ]
  )
}

const doorOf = (tag) => `/api/ops/quickstart/inspiration?tag=${encodeURIComponent(tag)}`
const publishOf = (tag) => `/api/ops/quickstart/inspiration/publish?tag=${encodeURIComponent(tag)}`

test(
  'Save card works without a content contract; Publish is refused for it, nothing written',
  opts,
  async () => {
    const { pool } = db
    const github = fakeGithub()
    const { send, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
    const tag = 'tracy-base/wp7'
    await seedWordpressRelease(pool, tag, '99.0.0')
    await seedStaff(pool, 'owner@tracy.test')
    const owner = await cookieFor('owner@tracy.test')

    const sheet = await (await send('GET', doorOf(tag), owner)).json()
    assert.deepEqual(sheet.platforms[0].contract, { state: 'none', profile: null, version: '99.0.0' })

    // Saving is not offering: the contract rule is about the shelf, so the card is stored hidden.
    const saved = await send('PUT', doorOf(tag), owner, typedCard())
    assert.equal(saved.status, 200)
    assert.equal((await saved.json()).hidden, true)
    const before = names(github)

    const answer = await send('POST', publishOf(tag), owner)
    assert.equal(answer.status, 400)
    const body = await answer.json()
    assert.equal(body.error, 'NO_CONTRACT')
    assert.deepEqual(body.tags, [tag])
    // batch-contracts cannot capture a never published release, so the refusal names the docs' way.
    assert.doesNotMatch(body.reason, /batch-contracts/)
    assert.match(body.reason, /tracy-wordpress-quickstart\/contracts/)
    assert.match(body.reason, /publish again once CI has deployed this server/)

    // The list says the same before anyone presses, so the Templates screen counts it as an issue.
    const row = (await (await send('GET', '/api/ops/quickstarts', owner)).json()).releases.find(
      (r) => r.tag === tag
    )
    assert.equal(row.contract.state, 'none')
    assert.equal(row.notShowable, null, 'no contract is the only refusal: unhidden, the card would show')
    // The road says it too, and its first blocked step is the refusal the door gave.
    const published = row.road.find((s) => s.step === 'published')
    assert.deepEqual([published.state, published.blockedBy], ['blocked', 'contract'])
    assert.equal(row.road.find((s) => s.step === 'contract').code, 'no-contract')

    assert.deepEqual(names(github), before, 'the mark stays on the release')
    const after = await (await send('GET', doorOf(tag), owner)).json()
    assert.equal(after.published, false)
    assert.notEqual(after.card, null, 'the saved card is kept')
  }
)

test('Publish of a card served by a lower contract still publishes, with a warning', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  const tag = 'tracy-base/wp7'
  await seedWordpressRelease(pool, tag, '1.0.99')
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  assert.equal((await send('PUT', doorOf(tag), owner, typedCard())).status, 200)
  await passCustomize(pool, tag)
  const answer = await send('POST', publishOf(tag), owner)
  assert.equal(answer.status, 200)
  const body = await answer.json()
  assert.equal(body.ok, true)
  assert.deepEqual(
    body.warnings.map((w) => [w.code, w.tag]),
    [['LOWER_CONTRACT', tag]]
  )
})

test('Publish of a card bound exactly to a contract publishes without a warning', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  const tag = 'tracy-base/wp7'
  await seedWordpressRelease(pool, tag, '1.0.0')
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  assert.equal((await send('PUT', doorOf(tag), owner, typedCard())).status, 200)
  await passCustomize(pool, tag)
  const answer = await send('POST', publishOf(tag), owner)
  assert.equal(answer.status, 200)
  assert.deepEqual((await answer.json()).warnings, [])
})

test(
  'Publish of a release whose contract declares no slot roles is held by Content coverage (ADR 0038)',
  opts,
  async () => {
    const { pool } = db
    const github = fakeGithub()
    // The contract's own roles, not the harness's answer: tracy-base/wp7 1.0.0 was released before ADR 0038.
    const { send, cookieFor } = harness(pool, {
      opsFetch: github.fetchImpl,
      extraEnv: withToken,
      realRoles: true
    })
    const tag = 'tracy-base/wp7'
    await seedWordpressRelease(pool, tag, '1.0.0')
    await seedStaff(pool, 'owner@tracy.test')
    const owner = await cookieFor('owner@tracy.test')

    assert.equal((await send('PUT', doorOf(tag), owner, typedCard())).status, 200)
    await passCustomize(pool, tag)
    const before = names(github)
    const answer = await send('POST', publishOf(tag), owner)
    assert.equal(answer.status, 400)
    const body = await answer.json()
    assert.equal(body.error, 'CONTENT_COVERAGE_NOT_READY')
    assert.match(body.reason, /slot roles/)
    assert.deepEqual(names(github), before, 'the mark stays on the release')

    const row = (await (await send('GET', '/api/ops/quickstarts', owner)).json()).releases.find(
      (r) => r.tag === tag
    )
    const coverage = row.road.find((s) => s.step === 'content-coverage')
    assert.deepEqual([coverage.state, coverage.code], ['todo', 'coverage-roles'])
  }
)

for (const coverageState of ['missing', 'stale']) {
  test(`Publish refuses ${coverageState} Content coverage without changing GitHub`, opts, async () => {
    const { pool } = db
    const github = fakeGithub()
    const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
    await seedWordpressRelease(pool, DRAFT, '1.0.0')
    await seedStaff(pool, 'owner@tracy.test')
    const owner = await cookieFor('owner@tracy.test')
    assert.equal((await send('PUT', doorOf(DRAFT), owner, typedCard())).status, 200)
    await passCustomize(pool, DRAFT)
    if (coverageState === 'missing') rmSync(path.join(fixtureDir, 'content-coverage.json'))
    else {
      const file = path.join(fixtureDir, 'content-coverage.json')
      const doc = JSON.parse(readFileSync(file, 'utf8'))
      doc.contract.contentMapSha256 = '0'.repeat(64)
      writeFileSync(file, JSON.stringify(doc))
    }
    const before = names(github)
    const answer = await send('POST', publishOf(DRAFT), owner)
    assert.equal(answer.status, 400)
    const body = await answer.json()
    assert.equal(body.error, 'CONTENT_COVERAGE_NOT_READY')
    assert.match(body.reason, coverageState === 'missing' ? /not measured/ : /changed after/)
    assert.deepEqual(names(github), before)
    const row = (await (await get('/api/ops/quickstarts', owner)).json()).releases.find(
      (r) => r.tag === DRAFT
    )
    assert.equal(
      row.road.find((s) => s.step === 'content-coverage').code,
      coverageState === 'missing' ? 'coverage-not-measured' : 'coverage-stale'
    )
  })
}

test('Unpublish still works for a published card whose release has no contract', opts, async () => {
  const { pool } = db
  const github = fakeGithub({ assets: [{ id: 5, name: 'tracy_design_inspiration.json' }] })
  const { send, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  const tag = 'tracy-base/wp7'
  await seedWordpressRelease(pool, tag, '99.0.0')
  await pool.query('update quickstart_releases set inspiration = $2::jsonb where tag = $1', [
    tag,
    JSON.stringify(inspirationDoc({ template: 'tracy-base' }))
  ])
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  assert.equal((await (await send('GET', doorOf(tag), owner)).json()).published, true)

  assert.equal((await send('DELETE', doorOf(tag), owner)).status, 200)
  assert.equal((await (await send('GET', doorOf(tag), owner)).json()).published, false)
  assert.equal((await send('POST', publishOf(tag), owner)).status, 400, 'and cannot come back without one')
})

test('a card the validator refuses is refused whole — nothing reaches GitHub', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  const answer = await send('PUT', DOOR, owner, typedCard({ provider: 'Somebody Else', blurb: 7 }))
  assert.equal(answer.status, 400)
  const body = await answer.json()
  assert.equal(body.error, 'INVALID_CARD')
  assert.equal(body.problems.length, 2, 'every problem at once, not one per press')
  assert.ok(
    body.problems.some((p) => /provider must be one of/.test(p)),
    'the sentence is the validator’s own, so the sheet and the reader say the same thing'
  )

  assert.deepEqual(github.release.assets, [], 'nothing was attached')
  assert.deepEqual((await (await get('/api/templates')).json()).templates, [], 'and nothing stored')
})

test('a category outside Design inspiration’s own list is refused by name', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const answer = await send(
    'PUT',
    DOOR,
    await cookieFor('owner@tracy.test'),
    typedCard({ category: 'Industrial' })
  )
  assert.equal(answer.status, 400)
  assert.match((await answer.json()).problems.join(' '), /category must be one of/)
})

test('a demo typed into the body is refused, never quietly dropped', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const answer = await send(
    'PUT',
    DOOR,
    await cookieFor('owner@tracy.test'),
    typedCard({ demo: { url: 'https://pinned.example', version: '1.0.0' } })
  )
  assert.equal(answer.status, 400)
  assert.match((await answer.json()).problems.join(' '), /demo is the server's/)
})

test('a draft, a design pack and a release with no setting cannot be a card', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedReleases(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  const press = (tag) =>
    send('PUT', `/api/ops/quickstart/inspiration?tag=${encodeURIComponent(tag)}`, owner, typedCard())
  const draft = await press(DRAFT)
  assert.equal(draft.status, 400)
  assert.match((await draft.json()).reason, /draft/)

  const noSetting = await press('quickstart/ja-kinetic/j6')
  assert.equal(noSetting.status, 400)
  assert.match((await noSetting.json()).reason, /Ready/)

  assert.equal((await press('nope/j6')).status, 404, 'a tag this server never read is not a 400')

  // `seedReleases` gives Tracy Business no template, and a card is filed under one.
  const noTemplate = await press(TAG)
  assert.equal(noTemplate.status, 400)
  assert.match((await noTemplate.json()).reason, /names no template/)

  // The column says the same thing without anybody pressing anything.
  const listed = (await (await get('/api/ops/quickstarts', owner)).json()).releases
  assert.equal(listed.find((r) => r.tag === DRAFT).inspiration.state, 'n/a')
  assert.deepEqual(github.release.assets, [])
})

test('Unpublish takes the card off Design inspiration and keeps it', opts, async () => {
  const { pool } = db
  const github = fakeGithub({ assets: [{ id: 5, name: 'tracy_design_inspiration.json' }] })
  const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedCard(pool, TAG, { inspiration: inspirationDoc() })
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  assert.equal((await (await get('/api/templates')).json()).templates.length, 1)

  const answer = await send('DELETE', DOOR, owner)
  assert.equal(answer.status, 200)
  assert.deepEqual(await answer.json(), { ok: true, hidden: true })
  assert.deepEqual(names(github), ['tracy_design_inspiration.json', 'tracy_design_inspiration_hidden.json'])
  assert.deepEqual((await (await get('/api/templates')).json()).templates, [], 'off the shelf')
  assert.notEqual((await (await get(DOOR, owner)).json()).card, null, 'the card is kept')

  // Twice in a row is the same end state.
  assert.equal((await send('DELETE', DOOR, owner)).status, 200)
  assert.deepEqual(names(github), ['tracy_design_inspiration.json', 'tracy_design_inspiration_hidden.json'])

  // Publish brings the same card back.
  await passCustomize(pool, TAG)
  assert.equal((await send('POST', PUBLISH, owner)).status, 200)
  assert.equal((await (await get('/api/templates')).json()).templates.length, 1)
})

test(
  'a card left inside tracy_setting.json is published, and Unpublish takes it off with a mark on the release',
  opts,
  async () => {
    const { pool } = db
    const github = fakeGithub()
    const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
    await seedCard(pool, TAG, { card: legacyBlock })
    await seedStaff(pool, 'owner@tracy.test')
    const owner = await cookieFor('owner@tracy.test')
    const sheet = async () => (await get(DOOR, owner)).json()
    const templates = async () => (await (await get('/api/templates')).json()).templates
    const column = async () =>
      (await (await get('/api/ops/quickstarts', owner)).json()).releases.find((r) => r.tag === TAG)
        .inspiration

    assert.equal((await sheet()).published, true, 'the sheet offers Unpublish for the old block')
    assert.equal((await templates()).length, 1)

    const off = await send('DELETE', DOOR, owner)
    assert.equal(off.status, 200)
    assert.deepEqual(
      names(github),
      ['tracy_design_inspiration_hidden.json'],
      'the mark is on the release, where every server reads it'
    )
    assert.ok(
      !github.calls.some((call) => call.includes('name=tracy_setting.json')),
      'tracy_setting.json is never rewritten'
    )
    assert.deepEqual(await templates(), [], 'off Design inspiration')
    assert.equal((await sheet()).published, false)
    assert.equal((await column()).state, 'card', 'the status column says not published')

    // Still a template: "Create with Tracy" and site creation read the same release as before.
    const releases = await readReleases(pool)
    assert.equal(templateOfTag(releases, TAG), 'tracy-business')
    assert.equal(isTemplateId(releases, 'tracy-business'), true)
    assert.equal(templateRelease(releases, 'emdash', 'tracy-business'), TAG)

    // Save card while hidden keeps it hidden; Publish takes the mark off.
    assert.equal((await send('PUT', DOOR, owner, typedCard())).status, 200)
    assert.deepEqual(names(github), ['tracy_design_inspiration.json', 'tracy_design_inspiration_hidden.json'])
    assert.deepEqual(await templates(), [], 'still hidden after Save card')
    await passCustomize(pool, TAG)
    const on = await send('POST', PUBLISH, owner)
    assert.equal(on.status, 200)
    assert.deepEqual(names(github), ['tracy_design_inspiration.json'], 'Publish takes the mark off')
    assert.equal((await templates()).length, 1, 'back on Design inspiration')
    assert.equal((await sheet()).published, true)
  }
)

test('a Save GitHub refuses leaves this server’s copy untouched', opts, async () => {
  const { pool } = db
  const github = fakeGithub({ uploadStatus: 422 })
  const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  const answer = await send('PUT', DOOR, owner, typedCard())
  assert.equal(answer.status, 502)
  assert.match((await answer.json()).reason, /422/)
  assert.deepEqual((await (await get('/api/templates')).json()).templates, [])
  assert.equal((await (await get(DOOR, owner)).json()).card, null, 'no card stored here either')
})

// ── the pictures a card is drawn with ──────────────────────────────────────────────────────────

const PNG = '/api/ops/templates/tracy-business/shots/business-home-1440.png'
/** The first bytes of a real PNG, so what is stored is a picture and not a string of letters. */
const pngBytes = (size = 64) => {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return bytes
}

test('a picture uploaded from a checkout is stored, served, and listed', opts, async () => {
  const { pool } = db
  const { sendBytes, get, cookieFor } = harness(pool)
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  const answer = await sendBytes('PUT', PNG, owner, pngBytes())
  assert.equal(answer.status, 200)
  assert.equal((await answer.json()).bytes, 64)

  const listed = await (await get('/api/ops/templates/tracy-business/shots', owner)).json()
  assert.deepEqual(
    listed.shots.map((s) => s.file),
    ['business-home-1440.png']
  )
  // The public door now serves it, and serves it as a picture rather than as what was announced.
  const served = await get('/api/templates/tracy-business/shots/business-home-1440.png')
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'image/png')

  assert.equal((await sendBytes('DELETE', PNG, owner)).status, 200)
  assert.equal((await get('/api/templates/tracy-business/shots/business-home-1440.png')).status, 404)
})

test('a picture too large is refused by the size the store names', opts, async () => {
  const { pool } = db
  const { sendBytes, get, cookieFor } = harness(pool)
  await seedCard(pool, TAG)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  const answer = await sendBytes('PUT', PNG, owner, pngBytes(8 * 1024 * 1024 + 1))
  assert.equal(answer.status, 413)
  assert.match((await answer.json()).reason, /at most 8388608 bytes/)
  assert.equal(
    (await (await get('/api/ops/templates/tracy-business/shots', owner)).json()).shots.length,
    0,
    'and nothing was stored on the way to the refusal'
  )
})

test('a name that could never be a picture is refused before the bytes are read', opts, async () => {
  const { pool } = db
  const { sendBytes, cookieFor } = harness(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  const answer = await sendBytes(
    'PUT',
    '/api/ops/templates/tracy-business/shots/home.html',
    owner,
    pngBytes()
  )
  assert.equal(answer.status, 400)
  assert.match((await answer.json()).reason, /\.png, \.jpg, \.jpeg or \.webp/)
})

test('every Design inspiration write refuses the same way the other ops writes do', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { app, send, sendBytes, cookieFor } = harness(pool, {
    opsFetch: github.fetchImpl,
    extraEnv: withToken
  })
  await seedCard(pool, TAG, { inspiration: inspirationDoc() })
  await seedStaff(pool, 'owner@tracy.test')
  await seedStaff(pool, 'member@tracy.test', 'editor')
  const owner = await cookieFor('owner@tracy.test')
  const member = await cookieFor('member@tracy.test')
  const outsider = await cookieFor('outside@tracy.test')

  // Signed out is sent to sign in; a stranger with a session gets a bare 403; a staff member
  // without owner/admin gets the same 403 the other write doors give.
  assert.equal((await send('PUT', DOOR, undefined, typedCard())).status, 302)
  assert.equal((await send('PUT', DOOR, outsider, typedCard())).status, 403)
  assert.equal((await send('PUT', DOOR, member, typedCard())).status, 403)
  assert.equal((await send('DELETE', DOOR, member)).status, 403)
  assert.equal((await send('POST', PUBLISH, member)).status, 403)
  assert.equal((await sendBytes('PUT', PNG, member, pngBytes())).status, 403)
  assert.equal((await sendBytes('DELETE', PNG, member)).status, 403)
  assert.deepEqual(github.release.assets, [])

  // A write from another origin is refused even with the owner's own cookie.
  const crossOrigin = await app.fetch(
    new Request(`http://tracy.test${DOOR}`, {
      method: 'PUT',
      redirect: 'manual',
      headers: { cookie: owner, origin: 'https://elsewhere.test', 'content-type': 'application/json' },
      body: JSON.stringify(typedCard())
    })
  )
  assert.equal(crossOrigin.status, 403)

  // Reading is staff-wide, the way the rest of this screen is.
  assert.equal((await send('GET', DOOR, member)).status, 200)
})

test('the list column and the sheet agree on what a card is still missing', opts, async () => {
  const { pool } = db
  const { get, sendBytes, cookieFor } = harness(pool)
  await seedCard(pool, TAG, { inspiration: inspirationDoc() })
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')

  const rowOf = async () =>
    (await (await get('/api/ops/quickstarts', owner)).json()).releases.find((r) => r.tag === TAG)
  // Since 04/10/2026 a missing picture or demo is a WARNING on a card customers do see — the
  // customer's rule (`shownOnInspiration`) decides `on`, and the column says what is missing.
  let row = await rowOf()
  assert.equal(row.inspiration.state, 'on', 'customers are offered it, picture or not')
  assert.ok(row.inspiration.warnings.some((w) => /business-home-1440\.png/.test(w)))

  await sendBytes('PUT', PNG, owner, pngBytes())
  row = await rowOf()
  assert.equal(row.inspiration.state, 'on')
  assert.ok(!row.inspiration.warnings.some((w) => /pictures are not on this server/.test(w)))
  assert.ok(row.inspiration.warnings.includes('No demo on this server to preview'))

  const sheet = await (await get(DOOR, owner)).json()
  assert.equal(sheet.demo, null)
  assert.equal(sheet.template, 'tracy-business')
  assert.equal(sheet.published, true)
  assert.deepEqual(
    sheet.shots.map((s) => s.file),
    ['business-home-1440.png'],
    'the sheet lists what the thumbnail dropdown may offer'
  )
  assert.ok(sheet.categories.includes('Professional & Corporate'))
})

test('Generate card answers a draft, not a 500 — the door is actually wired', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@example.test')
  await seedReleases(pool)
  // The shared fixture states no template; a card is filed under one, so this release gets the
  // underscore spelling a Joomla release would really carry — which is also the shape the door
  // has to normalise on both sides.
  await pool.query(
    `update quickstart_releases set setting = jsonb_set(setting, '{template}', '"tracy_business"') where tag = $1`,
    [TAG]
  )
  const setting = (await pool.query('select setting from quickstart_releases where tag = $1', [TAG])).rows[0]
    .setting
  // A demo of that release, live on the host this process is beside.
  await pool.query(
    `insert into site (site_key, label, host, platform, publish, port, demo, quickstart_tag)
     values ($1, $2, $5, $3, 'published', 52011, true, $4)`,
    ['business-emdash.tracy.test', 'business-emdash', setting.platform, TAG, env.HOSTS.split(',')[0]]
  )

  // The host answers /outline the way tracy-host does; the model answers the two judged fields.
  const answered = async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/_host/outline'))
      return Response.json({
        title: 'Northgate Industrial',
        description: '',
        links: [
          { label: 'Home', path: '/' },
          { label: 'Services', path: '/services' }
        ],
        dark: true,
        defaultTheme: 'dark',
        text: 'An industrial company site.'
      })
    if (path.endsWith('/chat/completions'))
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: DESIGN_CATEGORIES[0],
                blurb: 'An industrial company site.'
              })
            }
          }
        ]
      })
    return Response.json({ error: `unexpected ${path}` }, { status: 500 })
  }

  const { send, cookieFor } = harness(pool, { opsFetch: answered })
  const owner = await cookieFor('owner@example.test')
  const response = await send(
    'POST',
    `/api/ops/templates/${setting.template}/generate?tag=${encodeURIComponent(TAG)}`,
    owner,
    {}
  )
  // ⚠ THE BUG THIS EXISTS FOR. The door shipped once with its import missing: `judgeCard is not
  // defined`, a 500 on every press. Nothing caught it — typecheck does not read .js imports, the
  // unit tests import the library directly, and importing the route module never runs its body.
  const body = await response.json()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.draft.dark, true)
  assert.equal(body.draft.defaultTheme, 'dark')
  assert.equal(body.draft.category, DESIGN_CATEGORIES[0])
  assert.deepEqual(
    body.draft.layouts.map((l) => l.key),
    ['home', 'services']
  )
})

/**
 * Generate card on a demo that the host could not read, or a model that would not answer
 * (11/10/2026, ja-restaurant on dev: Create listing filled nothing and the page said only "the door
 * answered 502", 25.4 s after the press — the host's own page-load limit). The door answers a
 * Tracy JSON reason in bounded time, and a model failure never costs the layouts that were read.
 */
async function generateWith(pool, answered) {
  await seedStaff(pool, 'owner@example.test')
  await seedReleases(pool)
  await pool.query(
    `update quickstart_releases set setting = jsonb_set(setting, '{template}', '"tracy_business"') where tag = $1`,
    [TAG]
  )
  const setting = (await pool.query('select setting from quickstart_releases where tag = $1', [TAG])).rows[0]
    .setting
  await pool.query(
    `insert into site (site_key, label, host, platform, publish, port, demo, quickstart_tag)
     values ($1, $2, $5, $3, 'published', 52011, true, $4)`,
    ['business-emdash.tracy.test', 'business-emdash', setting.platform, TAG, env.HOSTS.split(',')[0]]
  )
  const { send, cookieFor } = harness(pool, { opsFetch: answered })
  const owner = await cookieFor('owner@example.test')
  const response = await send(
    'POST',
    `/api/ops/templates/${setting.template}/generate?tag=${encodeURIComponent(TAG)}`,
    owner,
    {}
  )
  return { status: response.status, body: await response.json() }
}
const OUTLINE = {
  title: 'Northgate Industrial',
  description: '',
  links: [
    { label: 'Home', path: '/' },
    { label: 'Services', path: '/services' }
  ],
  dark: false,
  text: 'An industrial company site.'
}

test(
  'Generate card: a demo the host could not read answers a Tracy reason, never a bare gateway status',
  opts,
  async () => {
    let deadline = null
    const { status, body } = await generateWith(db.pool, async (url, init = {}) => {
      const path = new URL(url).pathname
      if (path.endsWith('/_host/outline')) {
        deadline = init.signal ?? null
        return Response.json(
          { code: 'OUTLINE_FAILED', why: 'page.goto: Timeout 25000ms exceeded.' },
          { status: 502 }
        )
      }
      return Response.json({ error: `unexpected ${path}` }, { status: 500 })
    })
    assert.ok(deadline, 'the host is asked with a deadline of its own')
    assert.notEqual(status, 502, 'a 502 from this door reads as the proxy failing, not as the demo')
    assert.equal(body.error, 'OUTLINE_FAILED')
    assert.match(body.reason, /Couldn’t read the demo/)
    assert.match(body.reason, /Timeout 25000ms/)
  }
)

test('Generate card: a host that never answers is a Tracy reason too', opts, async () => {
  const { status, body } = await generateWith(db.pool, async (url) => {
    const path = new URL(url).pathname
    if (path.endsWith('/_host/outline')) throw new Error('socket hang up')
    return Response.json({ error: `unexpected ${path}` }, { status: 500 })
  })
  assert.notEqual(status, 502)
  assert.equal(body.error, 'OUTLINE_FAILED')
  assert.match(body.reason, /did not answer/)
})

test(
  'Generate card: a model that fails or times out still answers the layouts that were read',
  opts,
  async () => {
    let deadline = null
    const { status, body } = await generateWith(db.pool, async (url, init = {}) => {
      const path = new URL(url).pathname
      if (path.endsWith('/_host/outline')) return Response.json(OUTLINE)
      if (path.endsWith('/chat/completions')) {
        deadline = init.signal ?? null
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
      return Response.json({ error: `unexpected ${path}` }, { status: 500 })
    })
    assert.ok(deadline, 'the model is asked with a deadline of its own')
    assert.equal(status, 200, JSON.stringify(body))
    assert.deepEqual(
      body.draft.layouts.map((l) => l.key),
      ['home', 'services']
    )
    assert.equal(body.draft.category, null)
    assert.equal(body.draft.blurb, null)
    assert.match(body.why, /model did not answer in time/)
  }
)

test('demoPublicHost: a bare hostname is only sent where https on 443 IS the public shape', () => {
  const demo = { label: 'ja-vital-joomla', publish: 'published' }

  // A server: the demo target says https with no port, so the hostname alone is a real address and
  // the far side's `https://<host>/` is right. This is the case the field exists for — a
  // Tracy-built Joomla demo carries force_ssl=2 and 301s a loopback request to a port with no TLS.
  const server = readConfig({
    ...env,
    TRACY_ORIGIN: 'https://cowork.tracy.ai',
    SITE_DOMAIN: 'tracy.ai',
    DEMO_HOST: 'local'
  })
  assert.equal(demoPublicHost(server, demo), 'ja-vital-joomla.tracy.ai')

  // A developer's machine: http on 51710. Sending the hostname asserts https/443, and the far side
  // builds a URL that answers nothing — measured 17/09, `Generate card` hung until tracy-web's own
  // body timeout and the sheet read "the door answered 502" while the demo served 200 throughout.
  // null hands the far side back its own fallbacks: the loopback port, then the container name.
  const laptop = readConfig({ ...env, TRACY_ORIGIN: 'http://tracy.test:51710', DEMO_HOST: 'local' })
  assert.equal(demoPublicHost(laptop, demo), null)

  // https on a non-default port is the same assertion and the same failure.
  const odd = readConfig({ ...env, TRACY_ORIGIN: 'https://tracy.test:8443', DEMO_HOST: 'local' })
  assert.equal(demoPublicHost(odd, demo), null)

  // A demo that is not published has no public address at all, whatever the deployment's shape.
  assert.equal(demoPublicHost(server, { label: 'ja-vital-joomla', publish: 'draft' }), null)
  assert.equal(demoPublicHost(server, { label: 'ja-vital-joomla' }), null)

  // A deployment that states no demo target keeps the old answer: https is what it always assumed.
  const noTarget = readConfig({ ...env, TRACY_ORIGIN: 'https://cowork.tracy.ai', SITE_DOMAIN: 'tracy.ai' })
  assert.equal(demoPublicHost({ ...noTarget, demoTargets: [] }, demo), 'ja-vital-joomla.tracy.ai')
})

// ── a release whose install file names another template than its card ────────────────────────

/**
 * Tracy Base as dev holds it (10/10/2026): one customer card `tracy` built by Joomla and WordPress,
 * while the WordPress and EmDash install files say `template: "tracy-base"`. The admin page keyed
 * the WordPress pictures by the install file and drew a broken `/api/templates/tracy-base/shots/…`
 * while customers read `/api/templates/tracy/shots/…` fine.
 */
async function seedTracyBase(pool) {
  const card = inspirationDoc({
    template: 'tracy',
    image: 'tracy-home-1440.png',
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'tracy-home-1440.png' } }]
  })
  const insert = (tag, platform, template, publishedAt, inspiration) =>
    pool.query(
      `insert into quickstart_releases (tag, release, setting, inspiration, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, $4::jsonb, 'ready', null)`,
      [
        tag,
        JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt, assets: [] }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform,
          label: 'Tracy Base',
          version: '1.0.0',
          cms: '1.0',
          template,
          install: {}
        }),
        inspiration ? JSON.stringify(inspiration) : null
      ]
    )
  await insert('tracy-base/wp7', 'wordpress', 'tracy-base', '2026-10-09T00:00:00Z', card)
  await insert('tracy-base/j6', 'joomla', 'tracy', '2026-10-08T00:00:00Z', card)
  await insert('tracy-base/emdash-0.x', 'emdash', 'tracy-base', '2026-10-07T00:00:00Z', null)
}
const TRACY_PNG = '/api/ops/templates/tracy/shots/tracy-home-1440.png'

test('the admin keys a release’s pictures by the customer card, not its install file', opts, async () => {
  const { pool } = db
  const { get, sendBytes, cookieFor } = harness(pool)
  await seedTracyBase(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  assert.equal((await sendBytes('PUT', TRACY_PNG, owner, pngBytes())).status, 200)

  // The customer door: one card `tracy`, and its picture is served.
  const { templates } = await (await get('/api/templates')).json()
  assert.deepEqual(
    templates.map((t) => t.id),
    ['tracy']
  )
  assert.match(templates[0].card.image, /\/api\/templates\/tracy\/shots\/tracy-home-1440\.png/)

  // The list: each row names the card it is filed under, and the WordPress cell sees the picture.
  const rows = (await (await get('/api/ops/quickstarts', owner)).json()).releases
  const row = (tag) => rows.find((r) => r.tag === tag)
  assert.equal(row('tracy-base/wp7').cardTemplate, 'tracy')
  assert.equal(row('tracy-base/j6').cardTemplate, 'tracy')
  assert.equal(row('tracy-base/wp7').template, 'tracy-base', 'the install file is still reported as it is')
  assert.ok(
    !row('tracy-base/wp7').inspiration.warnings.some((w) => /pictures are not on this server/.test(w))
  )

  // The sheet the WordPress chip opens: pictures under `tracy`, both CMSes of the card folded in.
  const sheet = await (await get(doorOf('tracy-base/wp7'), owner)).json()
  assert.equal(sheet.template, 'tracy')
  assert.deepEqual(
    sheet.shots.map((s) => s.file),
    ['tracy-home-1440.png']
  )
  assert.deepEqual(sheet.platforms.map((p) => p.tag).sort(), ['tracy-base/j6', 'tracy-base/wp7'])
  const detail = await (
    await get(`/api/ops/quickstart?tag=${encodeURIComponent('tracy-base/wp7')}`, owner)
  ).json()
  assert.ok(!detail.inspirationState.warnings.some((w) => /pictures are not on this server/.test(w)))
})

test('Save, Generate and Capture on such a release write under the customer card id', opts, async () => {
  const { pool } = db
  const github = fakeGithub()
  const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
  await seedTracyBase(pool)
  await seedStaff(pool, 'owner@tracy.test')
  const owner = await cookieFor('owner@tracy.test')
  const wp7 = encodeURIComponent('tracy-base/wp7')

  // Save keeps the card filed under `tracy`: re-filing it under the install file's `tracy-base`
  // would take WordPress off the card customers see and give it a second one.
  const saved = await send(
    'PUT',
    doorOf('tracy-base/wp7'),
    owner,
    typedCard({
      image: 'tracy-home-1440.png',
      layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'tracy-home-1440.png' } }]
    })
  )
  const savedBody = await saved.json()
  assert.equal(saved.status, 200, JSON.stringify(savedBody))
  assert.equal(savedBody.inspiration.template, 'tracy')
  assert.deepEqual(
    (await (await get('/api/templates')).json()).templates.map((t) => t.id),
    ['tracy']
  )

  // The card id is this release's template for the picture doors; the install file's is not.
  const capture = (id) =>
    send('POST', `/api/ops/templates/${id}/capture?tag=${wp7}`, owner, {
      layouts: [{ key: 'home', path: '/' }]
    })
  assert.equal((await capture('tracy')).status, 409, 'past the template check: no demo to shoot')
  assert.equal((await (await capture('tracy-base')).json()).error, 'TEMPLATE_MISMATCH')
  const generate = (id) => send('POST', `/api/ops/templates/${id}/generate?tag=${wp7}`, owner)
  assert.equal((await generate('tracy')).status, 409)
  assert.equal((await (await generate('tracy-base')).json()).error, 'TEMPLATE_MISMATCH')
})

test(
  'a demo that failed on an older version: the road says which, and Sites built from it marks the demo',
  opts,
  async () => {
    const { pool } = db
    const { recordDemoJob, noteDemoJob, upsertDemoSite } = await import('../src/lib/demo-sites.js')
    const { send, cookieFor } = harness(pool)
    const tag = 'tracy-base/wp7'
    await seedWordpressRelease(pool, tag, '1.0.2')
    await upsertDemoSite(pool, {
      siteKey: 'demo-base',
      label: 'base',
      host: 'local',
      platform: 'wordpress',
      tag,
      version: '1.0.0',
      sha256: 'a'.repeat(64)
    })
    await recordDemoJob(pool, { id: 'job-base-1', siteKey: 'demo-base', host: 'local', kind: 'provision' })
    await noteDemoJob(pool, 'job-base-1', { state: 'failed', step: 'provision', detail: { output: 'boom' } })
    await seedStaff(pool, 'owner@tracy.test')
    const owner = await cookieFor('owner@tracy.test')

    const row = (await (await send('GET', '/api/ops/quickstarts', owner)).json()).releases.find(
      (r) => r.tag === tag
    )
    const demo = row.road.find((s) => s.step === 'demo')
    assert.deepEqual([demo.state, demo.code], ['todo', 'demo-failed'])
    assert.equal(demo.params.version, '1.0.0', 'the version the failed attempt installed')
    assert.equal(demo.params.releaseVersion, '1.0.2')
    // With no listing saved, the listing waits for a live demo: Create listing reads it.
    const listing = row.road.find((s) => s.step === 'listing')
    assert.deepEqual([listing.state, listing.blockedBy, listing.params.demo], ['blocked', 'demo', false])

    const detail = await (
      await send('GET', `/api/ops/quickstart?tag=${encodeURIComponent(tag)}`, owner)
    ).json()
    const site = detail.sites.find((s) => s.label === 'base')
    assert.deepEqual([site.demo, site.live], [true, false], 'the failed demo is not a built site')
  }
)

// ── Customize your site (ADR 0029 §4): the readiness check on the road and at the publish door ──

const CHECK = `/api/ops/quickstart/customize/check?tag=${encodeURIComponent(TAG)}`

/** A stored check of TAG 1.0.0 with LOGO-1 failing (must-fix) and LANG-6 failing (worth fixing). */
async function failCustomize(pool) {
  const results = [
    { id: 'NAME-1', status: 'pass', owner: 'template', message: '', fix: null },
    {
      id: 'LOGO-1',
      status: 'fail',
      owner: 'template',
      message: 'the header keeps logo.svg',
      fix: 'Bind it.'
    },
    { id: 'LANG-6', status: 'fail', owner: 'template', message: 'F j, Y', fix: null }
  ]
  await pool.query(
    `insert into template_readiness (tag, version, fingerprint, state, report, checked_at)
     values ($1, '1.0.0', 'seeded', 'done', $2::jsonb, now())`,
    [TAG, JSON.stringify({ results })]
  )
}

test(
  'must-fix rules of Customize your site refuse Publish with CUSTOMIZE_NOT_READY, and the list says so',
  opts,
  async () => {
    const { pool } = db
    const github = fakeGithub()
    const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
    await seedCard(pool, TAG)
    await seedStaff(pool, 'owner@tracy.test')
    const owner = await cookieFor('owner@tracy.test')
    assert.equal((await send('PUT', DOOR, owner, typedCard())).status, 200)
    await failCustomize(pool)
    const before = names(github)

    const answer = await send('POST', PUBLISH, owner)
    assert.equal(answer.status, 400)
    const body = await answer.json()
    assert.equal(body.error, 'CUSTOMIZE_NOT_READY')
    assert.deepEqual(body.rules, ['LOGO-1'])
    assert.deepEqual(names(github), before, 'the hidden mark stays')

    const row = (await (await get('/api/ops/quickstarts', owner)).json()).releases.find((r) => r.tag === TAG)
    const customize = row.road.find((s) => s.step === 'customize')
    assert.deepEqual([customize.state, customize.code], ['todo', 'customize-must-fix'])
    assert.deepEqual([customize.params.passed, customize.params.total], [1, 3])
    assert.deepEqual(
      customize.params.mustFix.map((m) => m.rule),
      ['LOGO-1']
    )
    assert.deepEqual(
      customize.params.worthFixing.map((m) => m.rule),
      ['LANG-6']
    )
    const published = row.road.find((s) => s.step === 'published')
    assert.deepEqual([published.state, published.blockedBy], ['blocked', 'customize'])
  }
)

test(
  'Check again marks the release checking at once; only owners and admins may press it',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool, { extraEnv: withToken })
    await seedCard(pool, TAG)
    await seedStaff(pool, 'owner@tracy.test')
    await seedStaff(pool, 'member@tracy.test', 'editor')
    const owner = await cookieFor('owner@tracy.test')
    const member = await cookieFor('member@tracy.test')

    assert.equal((await send('POST', CHECK, member)).status, 403)
    assert.equal((await send('POST', '/api/ops/quickstart/customize/check?tag=nope%2Fj6', owner)).status, 404)
    const answer = await send('POST', CHECK, owner)
    assert.equal(answer.status, 202)
    assert.deepEqual(await answer.json(), { ok: true, state: 'checking' })
    // The row reads checking before the door answers; the check itself runs on in the background
    // (here it ends as an error: the seeded release lists no file to download).
    const states = (await pool.query('select state from template_readiness where tag = $1', [TAG])).rows
    assert.equal(states.length, 1)
    for (let i = 0; i < 50; i += 1) {
      const { rows } = await pool.query('select state, reason from template_readiness where tag = $1', [TAG])
      if (rows[0].state !== 'checking') {
        assert.equal(rows[0].state, 'error')
        assert.match(rows[0].reason, /tracy_setting\.json/)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.fail('the background check never ended')
  }
)

// ── Design system (ADR 0031): the Template Design System Readiness check at the publish door ──────

const DS_CHECK = `/api/ops/quickstart/design-system/check?tag=${encodeURIComponent(TAG)}`

test(
  'must-fix rules of Design system refuse Publish with DESIGN_SYSTEM_NOT_READY, and the road says so',
  opts,
  async () => {
    const { pool } = db
    const github = fakeGithub()
    const { send, get, cookieFor } = harness(pool, { opsFetch: github.fetchImpl, extraEnv: withToken })
    await seedCard(pool, TAG)
    await seedStaff(pool, 'owner@tracy.test')
    const owner = await cookieFor('owner@tracy.test')
    assert.equal((await send('PUT', DOOR, owner, typedCard())).status, 200)
    await pool.query(
      `insert into template_readiness (tag, version, fingerprint, state, report, checked_at)
       values ($1, '1.0.0', 'seeded', 'done', $2::jsonb, now())`,
      [
        TAG,
        JSON.stringify({
          results: [{ id: 'NAME-1', status: 'pass', owner: 'template', message: '', fix: null }]
        })
      ]
    )
    await pool.query(
      `insert into template_ds_readiness (tag, version, fingerprint, state, report, checked_at)
       values ($1, '1.0.0', 'seeded', 'done', $2::jsonb, now())`,
      [
        TAG,
        JSON.stringify({
          results: [
            { id: 'SLOT-1', status: 'pass', owner: 'contract', message: '', fix: null },
            {
              id: 'CSS-1',
              status: 'fail',
              owner: 'template',
              message: 'css/template.css paints the palette',
              fix: 'Tokenize it.'
            },
            { id: 'BAND-1', status: 'fail', owner: 'contract', message: '.t4-footer kept whole', fix: null }
          ]
        })
      ]
    )
    // a live demo: DEMO-1 passes, so only the release's own must-fix rule refuses
    await seedLiveDemo(pool, TAG)
    const before = names(github)

    const answer = await send('POST', PUBLISH, owner)
    assert.equal(answer.status, 400)
    const body = await answer.json()
    assert.equal(body.error, 'DESIGN_SYSTEM_NOT_READY')
    assert.deepEqual(body.rules, ['CSS-1'])
    assert.deepEqual(names(github), before, 'the hidden mark stays')

    const row = (await (await get('/api/ops/quickstarts', owner)).json()).releases.find((r) => r.tag === TAG)
    const step = row.road.find((s) => s.step === 'design-system')
    assert.deepEqual([step.state, step.code], ['todo', 'ds-must-fix'])
    // SLOT-1 and DEMO-1 (the live demo) pass, CSS-1 and BAND-1 fail
    assert.deepEqual([step.params.passed, step.params.total], [2, 4])
    assert.deepEqual(
      [step.params.mustFix.map((m) => m.rule), step.params.worthFixing.map((m) => m.rule)],
      [['CSS-1'], ['BAND-1']]
    )
    const published = row.road.find((s) => s.step === 'published')
    assert.deepEqual([published.state, published.blockedBy], ['blocked', 'design-system'])
  }
)

test(
  'Design system Check again marks the release checking at once; only owners and admins may press it',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool, { extraEnv: withToken })
    await seedCard(pool, TAG)
    await seedStaff(pool, 'owner@tracy.test')
    await seedStaff(pool, 'member@tracy.test', 'editor')
    const owner = await cookieFor('owner@tracy.test')
    const member = await cookieFor('member@tracy.test')

    assert.equal((await send('POST', DS_CHECK, member)).status, 403)
    assert.equal(
      (await send('POST', '/api/ops/quickstart/design-system/check?tag=nope%2Fj6', owner)).status,
      404
    )
    const answer = await send('POST', DS_CHECK, owner)
    assert.equal(answer.status, 202)
    assert.deepEqual(await answer.json(), { ok: true, state: 'checking' })
    const states = (await pool.query('select state from template_ds_readiness where tag = $1', [TAG])).rows
    assert.equal(states.length, 1)
    for (let i = 0; i < 50; i += 1) {
      const { rows } = await pool.query('select state, reason from template_ds_readiness where tag = $1', [
        TAG
      ])
      if (rows[0].state !== 'checking') {
        assert.equal(rows[0].state, 'error')
        assert.match(rows[0].reason, /tracy_setting\.json/)
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.fail('the background check never ended')
  }
)

test(
  'a release carrying tracy_archived.json is off /ops Templates and off /api/templates; taking the mark off brings it back',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedReleases(pool)
    const ARCHIVED = 'quickstart/ja-directory/j6'
    const release = (assets) =>
      JSON.stringify({ name: 'j6', kind: 'quickstart', github: 'prerelease', publishedAt: null, assets })
    await pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason)
       values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        ARCHIVED,
        release([{ name: 'tracy_archived.json', size: 2, id: 1 }]),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform: 'joomla',
          label: 'JA Directory',
          version: '1.0.3',
          cms: '6.1.1',
          install: {
            webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
            database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
          },
          card: {
            provider: 'JoomlArt',
            category: 'Business',
            blurb: 'A directory site.',
            template: 'ja-directory'
          }
        })
      ]
    )
    await seedStaff(pool, 'owner@example.test')
    const owner = await cookieFor('owner@example.test')
    const listed = async () =>
      (await (await get('/api/ops/quickstarts', owner)).json()).releases.map((r) => r.tag)
    const offered = async () => (await (await get('/api/templates')).json()).templates.map((t) => t.id)

    assert.equal((await listed()).includes(ARCHIVED), false, 'off the /ops Templates list')
    assert.equal(
      (await (await get('/api/ops/quickstarts', owner)).json()).counts.all,
      3,
      'and off its counts'
    )
    assert.equal((await offered()).includes('ja-directory'), false, 'off Design inspiration')

    // The mark deleted on GitHub: the next copy writes the asset list without it.
    await pool.query('update quickstart_releases set release = $2::jsonb where tag = $1', [
      ARCHIVED,
      release([])
    ])
    assert.equal((await listed()).includes(ARCHIVED), true)
    assert.equal((await offered()).includes('ja-directory'), true)
  }
)
