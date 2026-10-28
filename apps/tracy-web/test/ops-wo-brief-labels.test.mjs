// /ops/wo › Briefs (`src/ops/wo-brief-labels*.js`, #51): the label view of a brief revision, its review page and the
// doors that serve them. The shaper and the page are pure (no database); the doors run on real PostgreSQL.
// Every business, person and URL below is made up.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { briefReadinessOf } from 'website-opportunities/domain/brief-readiness.mjs'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { woBriefLabelsRoutes } from '../src/ops/wo-brief-labels.js'
import { renderBriefLabelsPage } from '../src/ops/wo-brief-labels-page.js'
import { briefLabelsViewOf } from '../src/ops/wo-brief-labels-view.js'
import { fileDb } from './_db.mjs'

const SECRET = 'ops-wo-brief-labels-secret-32ch!'
const ORIGIN = 'https://cowork.tracy.test'
const SHA = (c) => c.repeat(64)
const IDS = { tennis: 'svc-tennis', padel: 'svc-padel', ana: 'person-ana' }

const asset = (id, extra = {}) => ({
  id,
  kind: 'image',
  category: 'people',
  sha256: SHA(id.slice(-1)),
  source: 'instagram',
  credit: '',
  uploaderRole: 'owner',
  width: 1600,
  height: 1000,
  orientation: 'landscape',
  quality: 'high',
  content: 'people-in-action',
  caption: 'Two players on a court',
  ...extra
})

/** A fictional brief: a racquet club with two offerings, one named person and five photos told apart by their links. */
function brief() {
  const assets = [
    asset('asset-a', {
      depicts: { id: IDS.padel, evidence: { via: 'alt', quote: 'Padel night at the club' } },
      role: 'offering.image',
      subjectBox: [0.1, 0.2, 0.5, 0.6],
      faceBoxes: [[0.2, 0.2, 0.1, 0.1]],
      peopleCount: 2,
      isGraphic: false,
      isOwnPhoto: true
    }),
    asset('asset-b', {
      depicts: { id: 'general', evidence: { via: 'vision' } },
      role: 'business.gallery_image'
    }),
    asset('asset-c', {
      depicts: { id: 'general', evidence: { via: 'none' } },
      content: 'unlabelled',
      caption: undefined,
      unlabelledReason: 'no_vision_model'
    }),
    asset('asset-d', {
      depicts: { id: 'general', evidence: { via: 'vision' } },
      portraitOf: { id: IDS.ana, evidence: { via: 'post', quote: 'Coach Ana Example' } },
      role: 'person.image',
      source: 'google-places',
      credit: 'Sam Visitor (https://maps.example/contrib/1)',
      uploaderRole: 'customer'
    }),
    asset('asset-e', {
      kind: 'video',
      content: 'unlabelled',
      unlabelledReason: 'video',
      caption: undefined
    })
  ]
  const b = {
    business: { name: 'Harbour Racquet Club' },
    reading: {
      method: 'rules',
      services: [
        { id: IDS.tennis, label: 'Tennis coaching', source: 'instagram' },
        { id: IDS.padel, label: 'Padel night', source: 'instagram' }
      ],
      audience: [],
      story: [],
      team: [{ id: IDS.ana, label: 'Ana Example', source: 'instagram' }]
    },
    brand: { logo: null },
    sitemap: [],
    assets
  }
  return { ...b, readiness: briefReadinessOf(b) }
}

const row = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  n: 3,
  opportunity_id: '22222222-2222-4222-8222-222222222222',
  created_at: '2026-10-20T10:00:00.000Z',
  brief: brief(),
  asset_manifest: [
    { id: 'asset-a', origin: 'opportunity', sha256: SHA('a'), sourceUrl: 'https://photos.example/a.jpg' }
  ],
  ...overrides
})

test('the view tells linked, general and unlabelled photos apart and names the links', () => {
  const v = briefLabelsViewOf(row())
  const by = Object.fromEntries(v.photos.map((p) => [p.id, p]))
  assert.deepEqual(by['asset-a'].depicts, {
    id: IDS.padel,
    label: 'Padel night',
    via: 'alt',
    quote: 'Padel night at the club'
  })
  assert.equal(by['asset-a'].general, false)
  assert.equal(by['asset-b'].general, true)
  // Nobody looked and no words linked it: unlabelled, never "general".
  assert.equal(by['asset-c'].labelled, false)
  assert.equal(by['asset-c'].general, false)
  assert.equal(by['asset-c'].depicts, null)
  assert.equal(by['asset-c'].unlabelledReason, 'no_vision_model')
  assert.deepEqual(v.counts, {
    photos: 4,
    videos: 1,
    labelled: 3,
    linkedToOffering: 1,
    general: 2,
    unlabelled: 1
  })
})

test('the view carries source, credit, role, boxes and the manifest source address', () => {
  const v = briefLabelsViewOf(row(), { imageUrlOf: (id) => `/img/${id}` })
  const a = v.photos.find((p) => p.id === 'asset-a')
  assert.equal(a.imageUrl, '/img/asset-a')
  assert.equal(a.sourceUrl, 'https://photos.example/a.jpg')
  assert.deepEqual(a.subjectBox, [0.1, 0.2, 0.5, 0.6])
  assert.equal(a.faceBoxes.length, 1)
  assert.equal(a.role, 'offering.image')
  assert.equal(a.isOwnPhoto, true)
  const d = v.photos.find((p) => p.id === 'asset-d')
  assert.equal(d.credit, 'Sam Visitor (https://maps.example/contrib/1)')
  assert.equal(d.uploaderRole, 'customer')
  assert.equal(v.photos.find((p) => p.kind === 'video').imageUrl, null)
})

test('offerings list their photos and a named person lists their portraits', () => {
  const v = briefLabelsViewOf(row())
  assert.deepEqual(
    v.offerings.map((o) => [o.label, o.photos]),
    [
      ['Tennis coaching', []],
      ['Padel night', ['asset-a']]
    ]
  )
  assert.deepEqual(v.people, [{ id: IDS.ana, label: 'Ana Example', portraits: ['asset-d'] }])
  assert.equal(v.photos.find((p) => p.id === 'asset-d').portraitOf.label, 'Ana Example')
})

test('the view passes the stored readiness through and answers null for an older revision', () => {
  const v = briefLabelsViewOf(row())
  assert.equal(v.readiness.version, 'brief-readiness/1')
  assert.ok(['pass', 'warn', 'block'].includes(v.readiness.verdict))
  const old = row({ brief: { ...brief(), readiness: undefined } })
  assert.equal(briefLabelsViewOf(old).readiness, null)
})

test('the page shows photos, links, boxes and the verdict, and escapes what the brief holds', () => {
  const r = row()
  r.brief.business.name = 'Harbour <b>Club</b>'
  const html = renderBriefLabelsPage([briefLabelsViewOf(r, { imageUrlOf: (id) => `/img/${id}` })])
  assert.match(html, /Padel night/)
  assert.match(html, /via alt/)
  assert.match(html, /Ana Example/)
  assert.match(html, /unlabelled/)
  assert.match(html, /class="box subject"/)
  assert.match(html, /class="box face"/)
  assert.match(html, /Verdict/)
  assert.match(html, /Sam Visitor/)
  assert.doesNotMatch(html, /Harbour <b>/)
  assert.match(html, /Harbour &lt;b&gt;Club/)
  // The house rule for text people read: no long dashes.
  assert.doesNotMatch(html, /[–—]/)
})

test('the page says so when a revision has no readiness or the list is empty', () => {
  const old = row({ brief: { ...brief(), readiness: undefined } })
  assert.match(renderBriefLabelsPage([briefLabelsViewOf(old)]), /no readiness verdict/)
  assert.match(renderBriefLabelsPage([]), /No brief revision to show/)
})

const url = process.env.TEST_DATABASE_URL
const pg = { skip: url ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function seed() {
  const w = (
    await db.pool.query("insert into workspace(display_name, kind) values('Ops', 'tracy_admin') returning id")
  ).rows[0].id
  const staff = (await db.pool.query("insert into account(email) values('dev@tracy.test') returning id"))
    .rows[0].id
  await db.pool.query(
    'insert into seat_workspace(workspace_id, account_id, role, granted_by, accepted_at) values($1, $2, $3, $2, now())',
    [w, staff, 'developer']
  )
  await db.pool.query("insert into account(email) values('outsider@tracy.test')")
  const owner = (
    await db.pool.query("insert into account(email) values('club-owner@tracy.test') returning id")
  ).rows[0].id
  const place = (
    await db.pool.query("insert into wo_place (display_name) values ('Harbour Racquet Club') returning id")
  ).rows[0].id
  const opp = (
    await db.pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, place_id) values ($1, 'Harbour Racquet Club', 'google-places', 'pid-1', $2) returning id`,
      [owner, place]
    )
  ).rows[0].id
  const placeMedia = (
    await db.pool.query(
      `insert into wo_place_media (place_id, sha256, kind, status, source, source_url, mime, object_key)
       values ($1, $2, 'image', 'stored', 'instagram', 'https://photos.example/a.jpg', 'image/jpeg', 'media/a.jpg') returning id`,
      [place, SHA('a')]
    )
  ).rows[0].id
  const manifest = [
    { id: placeMedia, origin: 'place', sha256: SHA('a'), sourceUrl: 'https://photos.example/a.jpg' }
  ]
  const b = brief()
  b.assets[0].id = placeMedia
  const rev = async (n) =>
    (
      await db.pool.query(
        `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest) values ($1, $2, $3, $4::jsonb, '', $5::jsonb) returning id`,
        [opp, owner, n, JSON.stringify(b), JSON.stringify(manifest)]
      )
    ).rows[0].id
  return { place, opp, placeMedia, revOld: await rev(1), revNew: await rev(2) }
}

function door(objects = null) {
  const app = woBriefLabelsRoutes({
    pool: db.pool,
    config: { origin: ORIGIN, sessionSecret: SECRET },
    objects
  })
  return async (path, as = 'dev@tracy.test') => {
    const headers = as ? { cookie: `${SESSION_COOKIE}=${await mintSession(as, SECRET)}` } : {}
    return app.request(path, { headers })
  }
}

test('staff read the label view of any revision, as JSON and as a page', pg, async () => {
  const s = await seed()
  const get = door()
  const json = await get(`/api/ops/wo/revisions/${s.revNew}/labels`)
  assert.equal(json.status, 200)
  const view = await json.json()
  assert.equal(view.revision.id, s.revNew)
  assert.equal(view.photos[0].imageUrl, `/api/ops/wo/revisions/${s.revNew}/assets/${s.placeMedia}/image`)
  const page = await get(`/ops/wo/revisions/${s.revNew}/labels`)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type'), /text\/html/)
  assert.match(await page.text(), /Padel night/)
})

test('a place lists the latest revision of each of its opportunities', pg, async () => {
  const s = await seed()
  const get = door()
  const { revisions } = await (await get(`/api/ops/wo/places/${s.place}/briefs`)).json()
  assert.deepEqual(
    revisions.map((r) => r.revision.id),
    [s.revNew]
  )
  const page = await (await get(`/ops/wo/places/${s.place}/briefs`)).text()
  assert.match(page, /Harbour Racquet Club/)
  assert.match(page, /revision 2/)
})

test('signed out is sent to sign in, and a non-staff session gets a bare 403', pg, async () => {
  const s = await seed()
  const get = door()
  const signedOut = await get(`/api/ops/wo/revisions/${s.revNew}/labels`, null)
  assert.equal(signedOut.status, 302)
  assert.match(signedOut.headers.get('location'), /login/)
  const refused = await get(`/api/ops/wo/revisions/${s.revNew}/labels`, 'outsider@tracy.test')
  assert.equal(refused.status, 403)
  assert.equal(await refused.text(), '')
})

test('an unknown or malformed id is a 404', pg, async () => {
  await seed()
  const get = door()
  assert.equal((await get('/api/ops/wo/revisions/not-a-uuid/labels')).status, 404)
  assert.equal((await get('/api/ops/wo/revisions/33333333-3333-4333-8333-333333333333/labels')).status, 404)
  assert.equal((await get('/ops/wo/revisions/33333333-3333-4333-8333-333333333333/labels')).status, 404)
  assert.equal((await get('/api/ops/wo/places/not-a-uuid/briefs')).status, 404)
})

test('the image door serves the stored bytes of a photo the revision pinned', pg, async () => {
  const s = await seed()
  const reads = []
  const objects = {
    async get(key) {
      reads.push(key)
      return new Response('fake-bytes', { status: 200 })
    }
  }
  const res = await door(objects)(`/api/ops/wo/revisions/${s.revNew}/assets/${s.placeMedia}/image`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/jpeg')
  assert.equal(await res.text(), 'fake-bytes')
  assert.deepEqual(reads, ['media/a.jpg'])
  // A different asset id, or no file store configured, never serves anything.
  assert.equal((await door(objects)(`/api/ops/wo/revisions/${s.revNew}/assets/other/image`)).status, 404)
  assert.equal(
    (await door(null)(`/api/ops/wo/revisions/${s.revNew}/assets/${s.placeMedia}/image`)).status,
    503
  )
})

test('the image door refuses bytes whose hash is not the one the manifest pinned', pg, async () => {
  const s = await seed()
  // A revision is immutable: make another one whose manifest pins different bytes than the stored row holds.
  const { rows } = await db.pool.query(
    `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest)
     select opportunity_id, account_id, 3, brief, '', jsonb_set(asset_manifest, '{0,sha256}', to_jsonb($2::text))
       from wo_revision where id = $1 returning id`,
    [s.revNew, SHA('f')]
  )
  const objects = {
    async get() {
      return new Response('x')
    }
  }
  const res = await door(objects)(`/api/ops/wo/revisions/${rows[0].id}/assets/${s.placeMedia}/image`)
  assert.equal(res.status, 404)
})
