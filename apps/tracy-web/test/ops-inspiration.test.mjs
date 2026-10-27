/**
 * Design inspiration as the operations page reads it: ONE rule for "a customer sees this card",
 * shared by the public list (`GET /api/templates`), the Quickstarts column (`inspirationState`) and
 * the `/ops/cms/inspiration` screen (`GET /api/ops/inspiration`).
 *
 * Before 04/10/2026 the column had its own, stricter rule, and the two disagreed on releases a
 * customer could see (`tasks/todo-ops-design-inspiration.md`). These tests hold the three readers
 * to one answer, and pin each edge where the customer's rule won over the column's old one.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import * as host from '../src/host/client.js'
import { cardRefusal, inspirationState, notShownWhy } from '../src/lib/design-inspiration.js'
import { shownOnInspiration, templateCards } from '../src/lib/quickstart-releases.js'
import { mintSession } from '../src/lib/session.js'
import { putShot } from '../src/lib/template-shots.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// ── the predicate, without a database ────────────────────────────────────────────────────────────

const CARD = Object.freeze({
  provider: 'Tracy',
  category: 'Starter',
  blurb: 'A blurb.',
  image: 'base-home-1440.png',
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'base-home-1440.png' } }]
})

/** One release as `readReleases` returns it, built from the axes the truth table varies. */
function release({ kind = 'quickstart', github = 'published', tracy = 'ready', hidden, card, template, n }) {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'wordpress',
    label: `Release ${n}`,
    version: '1.0.0',
    install: { webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) } },
    ...(template === undefined ? {} : { template })
  }
  return {
    tag: `case-${n}/wp7`,
    name: `case-${n}`,
    kind,
    github,
    tracy,
    reason: null,
    publishedAt: null,
    assets: [{ name: 'w.tar.gz', size: 1, id: 1 }],
    setting,
    inspiration: card ? { ...CARD } : null,
    inspirationHidden: hidden,
    local: null,
    choosable: kind === 'quickstart' && github !== 'draft',
    platform: 'wordpress',
    platformFromTag: false
  }
}

/** Every combination of the five axes the rule could look at. */
function everyCase() {
  const out = []
  let n = 0
  for (const [kind, github] of [
    ['quickstart', 'published'],
    ['quickstart', 'prerelease'],
    ['quickstart', 'draft'],
    ['design-pack', 'published']
  ])
    for (const hidden of [false, true])
      for (const card of [false, true])
        for (const template of ['tracy-base', 'Not An Id', undefined])
          for (const tracy of ['ready', 'invalid']) {
            n += 1
            out.push(release({ kind, github, tracy, hidden, card, template, n }))
          }
  return out
}

test('shownOnInspiration: choosable × unpublished × card × template id × Tracy reading', () => {
  for (const r of everyCase()) {
    const expected =
      r.choosable && !r.inspirationHidden && r.inspiration !== null && typeof r.setting.template === 'string'
    assert.equal(shownOnInspiration(r), expected, `${r.tag}: ${JSON.stringify(r)}`)
  }
})

test('templateCards offers exactly the releases the predicate admits', () => {
  const releases = everyCase()
  const offered = templateCards(releases).flatMap((t) => t.platforms.map((p) => p.tag))
  assert.deepEqual(
    offered.sort(),
    releases
      .filter(shownOnInspiration)
      .map((r) => r.tag)
      .sort()
  )
})

test('the column: on = the predicate, card = a card held back, none/n/a = no card', () => {
  for (const r of everyCase()) {
    const { state, why, warnings } = inspirationState(r)
    assert.ok(Array.isArray(warnings), `${r.tag}: warnings is always a list`)
    if (shownOnInspiration(r)) {
      assert.equal(state, 'on', r.tag)
      assert.equal(why, null)
    } else if (r.inspiration) {
      assert.equal(state, 'card', r.tag)
      assert.equal(why, notShownWhy(r))
      assert.equal(typeof why, 'string')
    } else {
      assert.equal(state, cardRefusal(r) ? 'n/a' : 'none', r.tag)
    }
  }
})

test('edges where the customer’s rule wins over the column’s old one', () => {
  // A choosable release Tracy did not mark `ready`: the old column said "—", customers see it.
  const notReady = release({ tracy: 'invalid', hidden: false, card: true, template: 'tracy-base', n: 1 })
  assert.equal(inspirationState(notReady).state, 'on')
  // A template that cannot be a picture id: shown, and the column says why its pictures cannot exist.
  const oddId = release({ hidden: false, card: true, template: 'Not An Id', n: 2 })
  const odd = inspirationState(oddId)
  assert.equal(odd.state, 'on')
  assert.ok(odd.warnings.some((w) => /cannot be a card id/.test(w)))
  // A draft carrying a card: held back, and the reason is the draft, in the sheet's own words.
  const draft = release({ github: 'draft', hidden: false, card: true, template: 'tracy-base', n: 3 })
  assert.deepEqual(inspirationState(draft).state, 'card')
  assert.equal(inspirationState(draft).why, cardRefusal(draft))
  // Unpublished wins over every other reason: it is the one this page can undo.
  const hiddenDraft = release({ github: 'draft', hidden: true, card: true, template: 'tracy-base', n: 4 })
  assert.equal(inspirationState(hiddenDraft).why, 'Saved but hidden from Design templates')
})

test('a missing picture, demo, blurb or asset is a warning on a card that stays on', () => {
  const r = release({ hidden: false, card: true, template: 'tracy-base', n: 1 })
  r.inspiration = { ...CARD, blurb: '', category: '' }
  r.assets = []
  const { state, warnings } = inspirationState(r, { demo: null, has: () => false })
  assert.equal(state, 'on')
  assert.deepEqual(warnings, [
    '1 of 1 pictures are not on this server yet: base-home-1440.png',
    'No demo on this server to preview',
    'The card names no category, so no filter finds it',
    'The card has no blurb',
    'The release has no asset w.tar.gz, so a build cannot download it'
  ])
  const fine = inspirationState(release({ hidden: false, card: true, template: 'tracy-base', n: 2 }), {
    demo: { url: 'https://demo.test/' },
    has: () => true
  })
  assert.deepEqual(fine, { state: 'on', why: null, code: null, params: {}, warnings: [], issues: [] })
})

test('a demo running another version than the release is a warning, not a reason', () => {
  // Measured on dev 04/10: tracy-business/j6 released 1.2.0, its demo still runs 1.1.0 — the
  // preview a customer opens is not the site they would get.
  const r = release({ hidden: false, card: true, template: 'tracy-base', n: 1 })
  const has = () => true
  const old = inspirationState(r, { demo: { url: 'https://demo.test/', version: '0.9.0' }, has })
  assert.equal(old.state, 'on')
  assert.deepEqual(old.warnings, ['The demo on this server runs 0.9.0, not the release’s 1.0.0'])
  // A demo row that does not say its version is not a mismatch anyone can state.
  assert.deepEqual(
    inspirationState(r, { demo: { url: 'https://demo.test/', version: null }, has }).warnings,
    []
  )
  assert.deepEqual(
    inspirationState(r, { demo: { url: 'https://demo.test/', version: '1.0.0' }, has }).warnings,
    []
  )
})

// ── the door ─────────────────────────────────────────────────────────────────────────────────────

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

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    host,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config)
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
    )
  return { get, cookieFor }
}

async function seedStaff(pool, email, role = 'owner') {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
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

const INSTALL = {
  joomla: { site: { file: 'site.jpa', sha256: 'a'.repeat(64) } },
  wordpress: { webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) } },
  emdash: { source: { file: 'q.zip', sha256: 'a'.repeat(64) } }
}

/** One release row, the way a read of GitHub leaves it. */
async function seed(
  pool,
  tag,
  {
    platform,
    template,
    label,
    github = 'published',
    kind = 'quickstart',
    card,
    hidden = false,
    version = '1.0.0'
  }
) {
  const install = INSTALL[platform]
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, inspiration, inspiration_hidden, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, 'ready', null)`,
    [
      tag,
      JSON.stringify({
        name: tag,
        kind,
        github,
        publishedAt: '2026-10-01T00:00:00Z',
        assets: Object.values(install).map((p, i) => ({ name: p.file, size: 10, id: i + 1 }))
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform,
        label,
        version,
        cms: '1',
        install,
        ...(template ? { template } : {})
      }),
      card ? JSON.stringify(card) : null,
      hidden
    ]
  )
}

const cardFor = (template, over = {}) => ({
  schemaVersion: 'tracy-design-inspiration/v1',
  template,
  provider: 'Tracy',
  category: 'Professional & Corporate',
  blurb: `${template} blurb`,
  image: `${template}-home-1440.png`,
  layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: `${template}-home-1440.png` } }],
  ...over
})

/** A server with every kind of row the screen sorts. */
async function seedShelf(pool) {
  // One template in three CMSes — one card.
  await seed(pool, 'tracy-business/j6', {
    platform: 'joomla',
    template: 'tracy_business',
    label: 'Tracy Business',
    card: cardFor('tracy-business')
  })
  await seed(pool, 'tracy-business/wp7', {
    platform: 'wordpress',
    template: 'tracy-business',
    label: 'Tracy Business',
    card: cardFor('tracy-business')
  })
  await seed(pool, 'tracy-business/emdash-0.x', {
    platform: 'emdash',
    template: 'tracy-business',
    label: 'Tracy Business',
    card: cardFor('tracy-business')
  })
  // A Joomla-only card.
  await seed(pool, 'quickstart/ja-voyara/j6', {
    platform: 'joomla',
    template: 'ja_voyara',
    label: 'JA Voyara',
    card: cardFor('ja-voyara', { category: 'Bold & Expressive' })
  })
  // Unpublished from Design inspiration.
  await seed(pool, 'quickstart/ja-vogue/j6', {
    platform: 'joomla',
    template: 'ja_vogue',
    label: 'JA Vogue',
    card: cardFor('ja-vogue'),
    hidden: true
  })
  // A draft that carries a card.
  await seed(pool, 'tracy-base/wp7', {
    platform: 'wordpress',
    template: 'tracy-base',
    label: 'Tracy Base',
    card: cardFor('tracy-base'),
    github: 'draft'
  })
  // A choosable release with no card, and two that are not candidates at all.
  await seed(pool, 'quickstart/ja-kinetic/j6', {
    platform: 'joomla',
    template: 'ja_kinetic',
    label: 'JA Kinetic'
  })
  await seed(pool, 'quickstart/ja-old/wp7', {
    platform: 'wordpress',
    template: 'ja-old',
    label: 'JA Old',
    github: 'draft'
  })
  await seed(pool, 'tracy-airbnb/j6', {
    platform: 'joomla',
    template: 'tracy-airbnb',
    label: 'Airbnb pack',
    kind: 'design-pack'
  })
}

test('GET /api/ops/inspiration: shown is /api/templates, one row per template', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seedStaff(pool, 'owner@tracy.test')
  await seedShelf(pool)

  const body = await (await get('/api/ops/inspiration', await cookieFor('owner@tracy.test'))).json()
  const { templates } = await (await get('/api/templates')).json()

  const shape = (list) =>
    list
      .map((t) => ({
        id: t.id,
        label: t.label,
        platforms: t.platforms.map((p) => `${p.platform} ${p.tag}`).sort()
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(shape(body.shown), shape(templates), 'the two doors offer the same cards')
  assert.deepEqual(
    body.shown.map((t) => t.id).sort(),
    ['ja-voyara', 'tracy-business'],
    'unpublished, draft and no-card releases are not on the shelf'
  )
  const business = body.shown.find((t) => t.id === 'tracy-business')
  assert.equal(business.platforms.length, 3, 'one row carries every CMS of the template')
  assert.deepEqual(business.card, {
    provider: 'Tracy',
    category: 'Professional & Corporate',
    blurb: 'tracy-business blurb',
    image: null,
    layouts: 1
  })
  assert.deepEqual(body.counts, { shown: 2, joomla: 2, wordpress: 1, emdash: 1, notShown: 2, noCard: 1 })
  assert.equal(body.origin, 'http://tracy.test')
  assert.equal(typeof body.readAt, 'string')
  assert.equal(body.writable, true)
  assert.equal(body.canRefresh, false, 'this deployment has no way into GitHub')
  assert.match(body.cannotRefreshReason, /cannot read/)
  assert.equal(body.designSystemsShown, false)
})

test('GET /api/ops/inspiration: what is held back, and why', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seedStaff(pool, 'owner@tracy.test')
  await seedShelf(pool)
  const body = await (await get('/api/ops/inspiration', await cookieFor('owner@tracy.test'))).json()

  const byTag = Object.fromEntries(body.notShown.map((r) => [r.tag, r]))
  assert.deepEqual(Object.keys(byTag).sort(), ['quickstart/ja-vogue/j6', 'tracy-base/wp7'])
  assert.deepEqual(byTag['quickstart/ja-vogue/j6'], {
    tag: 'quickstart/ja-vogue/j6',
    platform: 'joomla',
    version: '1.0.0',
    label: 'JA Vogue',
    template: 'ja-vogue',
    image: null,
    category: 'Professional & Corporate',
    why: 'Saved but hidden from Design templates'
  })
  assert.match(byTag['tracy-base/wp7'].why, /draft/)

  // Choosable with no card — and NOT the draft without one, nor the design pack.
  assert.deepEqual(body.noCard, [
    {
      tag: 'quickstart/ja-kinetic/j6',
      platform: 'joomla',
      version: '1.0.0',
      label: 'JA Kinetic',
      template: 'ja-kinetic'
    }
  ])
})

test('a missing demo or picture leaves the card shown, with the warning on it', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seedStaff(pool, 'owner@tracy.test')
  await seedShelf(pool)
  const owner = await cookieFor('owner@tracy.test')
  const read = async () =>
    Object.fromEntries((await (await get('/api/ops/inspiration', owner)).json()).shown.map((t) => [t.id, t]))

  let shown = await read()
  // One CMS: no prefix. Several: each sentence says which CMS it is about.
  assert.ok(shown['ja-voyara'].warnings.includes('No demo on this server to preview'))
  assert.ok(shown['ja-voyara'].warnings.some((w) => /1 of 1 pictures are not on this server/.test(w)))
  for (const cms of ['Joomla', 'WordPress', 'EmDash'])
    assert.ok(shown['tracy-business'].warnings.includes(`${cms}: No demo on this server to preview`), cms)

  await putShot(pool, {
    templateId: 'ja-voyara',
    file: 'ja-voyara-home-1440.png',
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  })
  await pool.query(
    `insert into site (site_key, label, host, platform, publish, address, demo, quickstart_tag, quickstart_version)
     values ('voyara.tracy.test', 'voyara', 'demo', 'joomla', 'published', 'https://voyara.tracy.test/', true, $1, '1.0.0')`,
    ['quickstart/ja-voyara/j6']
  )
  shown = await read()
  assert.deepEqual(shown['ja-voyara'].warnings, [])
  assert.match(shown['ja-voyara'].card.image, /^http:\/\/tracy\.test\/api\/templates\/ja-voyara\/shots\//)
  assert.deepEqual(shown['ja-voyara'].platforms, [
    {
      platform: 'joomla',
      tag: 'quickstart/ja-voyara/j6',
      version: '1.0.0',
      demo: { url: 'https://voyara.tracy.test/', version: '1.0.0' }
    }
  ])
})

test('the Quickstarts column says on exactly for the releases on the shelf', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seedStaff(pool, 'owner@tracy.test')
  await seedShelf(pool)
  const owner = await cookieFor('owner@tracy.test')
  const screen = await (await get('/api/ops/inspiration', owner)).json()
  const { releases } = await (await get('/api/ops/quickstarts', owner)).json()

  const tagsIn = (state) =>
    releases
      .filter((r) => r.inspiration.state === state)
      .map((r) => r.tag)
      .sort()
  assert.deepEqual(tagsIn('on'), screen.shown.flatMap((t) => t.platforms.map((p) => p.tag)).sort())
  assert.deepEqual(tagsIn('card'), screen.notShown.map((r) => r.tag).sort())
  assert.deepEqual(tagsIn('none'), screen.noCard.map((r) => r.tag).sort())
  // The same sentences, column and screen: the column's warnings are the screen's, unprefixed.
  const voyara = releases.find((r) => r.tag === 'quickstart/ja-voyara/j6')
  assert.deepEqual(voyara.inspiration.warnings, screen.shown.find((t) => t.id === 'ja-voyara').warnings)
})

test('GET /api/templates answers what it answered before the shared function', opts, async () => {
  // Written against the door as it was before `customerCards` was extracted (commit effeb0338):
  // the whole body for a fixed shelf, so any drift in the public answer is a red line here.
  const { pool } = db
  const { get } = harness(pool)
  await seedShelf(pool)
  const { readAt, templates } = await (await get('/api/templates')).json()
  assert.equal(typeof readAt, 'string')
  const card = (id, category = 'Professional & Corporate') => ({
    schemaVersion: 'tracy-design-inspiration/v1',
    template: id,
    provider: 'Tracy',
    category,
    blurb: `${id} blurb`,
    image: null,
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: null } }]
  })
  const sorted = [...templates].sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(
    sorted.map((t) => ({ ...t, platforms: [...t.platforms].sort((a, b) => a.tag.localeCompare(b.tag)) })),
    [
      {
        id: 'ja-voyara',
        label: 'JA Voyara',
        card: card('ja-voyara', 'Bold & Expressive'),
        platforms: [
          {
            platform: 'joomla',
            tag: 'quickstart/ja-voyara/j6',
            version: '1.0.0',
            release: { version: '1.0.0', files: INSTALL.joomla },
            demo: null,
            apply: false,
            wears: null
          }
        ],
        design: null
      },
      {
        id: 'tracy-business',
        label: 'Tracy Business',
        card: card('tracy-business'),
        platforms: [
          // What a site built from each archive wears (`wears`): a quickstart look is one CMS's own values,
          // so only the archives whose profile declares it carry it; EmDash has no indexed profile.
          {
            platform: 'emdash',
            tag: 'tracy-business/emdash-0.x',
            version: '1.0.0',
            release: { version: '1.0.0', files: INSTALL.emdash },
            demo: null,
            apply: true,
            wears: null
          },
          {
            platform: 'joomla',
            tag: 'tracy-business/j6',
            version: '1.0.0',
            release: { version: '1.0.0', files: INSTALL.joomla },
            demo: null,
            apply: true,
            wears: { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business' }
          },
          {
            platform: 'wordpress',
            tag: 'tracy-business/wp7',
            version: '1.0.0',
            release: { version: '1.0.0', files: INSTALL.wordpress },
            demo: null,
            apply: true,
            wears: { id: 'tracy-business', source: 'quickstart', name: 'Tracy Business' }
          }
        ],
        // The sealing profiles in this repository name the design (`readContracts`).
        design: { id: 'tracy-business', source: 'quickstart' }
      }
    ]
  )
})

test('GET /api/ops/inspiration is for staff: signed out, stranger, read-only seat', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await seedShelf(pool)
  await seedStaff(pool, 'member@tracy.test', 'editor')
  assert.equal((await get('/api/ops/inspiration')).status, 302)
  assert.equal((await get('/api/ops/inspiration', await cookieFor('outside@tracy.test'))).status, 403)
  const member = await get('/api/ops/inspiration', await cookieFor('member@tracy.test'))
  assert.equal(member.status, 200)
  assert.equal((await member.json()).writable, false, 'a seat that reads /ops is not one that writes')
})
