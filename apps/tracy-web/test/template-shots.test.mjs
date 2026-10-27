/**
 * The pictures a Design inspiration card is drawn with, kept by Tracy rather than by the dsh image.
 *
 * Two halves are asserted here: the shapes a template id and a picture name may have — pure, so
 * they run on a machine with no database — and the round trip through the table, which is what
 * lets a card be published without a commit and an image build.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import {
  MAX_PICTURE_BYTES,
  ShotRejected,
  deleteShot,
  getShot,
  listShots,
  pictureType,
  putShot,
  shotFilesFor,
  shotProblem,
  withPictureUrls,
  templateIdOf
} from '../src/lib/template-shots.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const bytes = Buffer.from('a picture, as far as the store is concerned')

test('a template id and a picture name are held to one shape each', () => {
  assert.equal(shotProblem({ templateId: 'tracy-business', file: 'business-home-1440.png' }), null)
  assert.equal(shotProblem({ templateId: 'tracy-business', file: 'home.webp' }), null)

  // No path may ever be spelled out of either half: the pair becomes a URL, and a URL is a path.
  for (const templateId of ['', '../etc', 'Tracy', 'a/b', '-lead', 'tracy business']) {
    assert.notEqual(shotProblem({ templateId, file: 'home.png' }), null, templateId)
  }
  for (const file of ['', '../home.png', 'a/b.png', 'home.PNG', 'home.gif', 'home', '.png', 'home.png.exe']) {
    assert.notEqual(shotProblem({ templateId: 'tracy-business', file }), null, file)
  }
})

test('a picture bigger than the cap is refused, and the cap is eight megabytes — a 2× shot of four screens', () => {
  assert.equal(MAX_PICTURE_BYTES, 8 * 1024 * 1024)
  assert.equal(shotProblem({ templateId: 'x', file: 'home.png', bytes: Buffer.alloc(1024) }), null)
  assert.notEqual(
    shotProblem({ templateId: 'x', file: 'home.png', bytes: Buffer.alloc(MAX_PICTURE_BYTES + 1) }),
    null
  )
})

test('the media type comes from the extension and nothing else', () => {
  assert.equal(pictureType('home.png'), 'image/png')
  assert.equal(pictureType('home.webp'), 'image/webp')
  assert.equal(pictureType('home.jpg'), 'image/jpeg')
  assert.equal(pictureType('home.jpeg'), 'image/jpeg')
})

test('a picture goes in and comes back out as the same bytes', opts, async () => {
  const { pool } = db
  const put = await putShot(pool, {
    templateId: 'tracy-business',
    file: 'business-home-1440.png',
    contentType: 'image/png',
    bytes
  })
  assert.match(put.sha256, /^[0-9a-f]{64}$/)

  const got = await getShot(pool, 'tracy-business', 'business-home-1440.png')
  assert.deepEqual(got.bytes, bytes)
  assert.equal(got.contentType, 'image/png')
  assert.equal(got.sha256, put.sha256)
  assert.equal(await getShot(pool, 'tracy-business', 'missing.png'), null)
  // A name that could never have been stored is not a query: it is a refusal, before the table.
  assert.equal(await getShot(pool, 'tracy-business', '../../etc/passwd'), null)
})

test('the media type stored is the extension, whatever the caller claimed', opts, async () => {
  const { pool } = db
  await putShot(pool, {
    templateId: 'tracy-business',
    file: 'home.webp',
    contentType: 'text/html',
    bytes
  })
  assert.equal((await getShot(pool, 'tracy-business', 'home.webp')).contentType, 'image/webp')
})

test('putting the same name twice replaces the picture, it does not add a second', opts, async () => {
  const { pool } = db
  await putShot(pool, { templateId: 'tracy-business', file: 'home.png', bytes })
  const second = await putShot(pool, {
    templateId: 'tracy-business',
    file: 'home.png',
    bytes: Buffer.from('a newer shot')
  })
  const got = await getShot(pool, 'tracy-business', 'home.png')
  assert.equal(got.bytes.toString(), 'a newer shot')
  assert.equal(got.sha256, second.sha256)
  assert.equal((await listShots(pool, 'tracy-business')).length, 1)
})

test('a refused picture never reaches the table', opts, async () => {
  const { pool } = db
  await assert.rejects(
    () => putShot(pool, { templateId: 'Tracy Business', file: 'home.png', bytes }),
    ShotRejected
  )
  await assert.rejects(
    () => putShot(pool, { templateId: 'tracy-business', file: 'home.gif', bytes }),
    ShotRejected
  )
  await assert.rejects(
    () =>
      putShot(pool, {
        templateId: 'tracy-business',
        file: 'home.png',
        bytes: Buffer.alloc(MAX_PICTURE_BYTES + 1)
      }),
    ShotRejected
  )
  assert.deepEqual(await listShots(pool, 'tracy-business'), [])
})

test('a template lists its own pictures, by name, without their bytes', opts, async () => {
  const { pool } = db
  await putShot(pool, { templateId: 'tracy-business', file: 'home.png', bytes })
  await putShot(pool, { templateId: 'tracy-business', file: 'about.png', bytes })
  await putShot(pool, { templateId: 'tracy-saas', file: 'home.png', bytes })

  const shots = await listShots(pool, 'tracy-business')
  assert.deepEqual(
    shots.map((s) => s.file),
    ['about.png', 'home.png']
  )
  assert.equal(shots[0].bytes, bytes.length)
  assert.equal(shots[0].contentType, 'image/png')
  assert.match(shots[0].sha256, /^[0-9a-f]{64}$/)
  assert.ok(shots[0].updatedAt instanceof Date)
})

test('one query says which pictures every template on the page has', opts, async () => {
  const { pool } = db
  await putShot(pool, { templateId: 'tracy-business', file: 'home.png', bytes })
  await putShot(pool, { templateId: 'tracy-saas', file: 'home.png', bytes })
  const index = await shotFilesFor(pool, ['tracy-business', 'tracy-nothing'])
  assert.deepEqual([...(index.get('tracy-business')?.keys() ?? [])], ['home.png'])
  // The digest rides along with the name: it is what makes a re-shot picture a new address.
  assert.match(index.get('tracy-business')?.get('home.png') ?? '', /^[0-9a-f]{64}$/)
  // And a caller that only asks whether the picture is held still asks the same way.
  assert.equal(index.get('tracy-business')?.has('home.png'), true)
  assert.equal(index.get('tracy-saas'), undefined)
  assert.equal(index.get('tracy-nothing'), undefined)
  assert.deepEqual([...(await shotFilesFor(pool, [])).keys()], [])
})

/**
 * ── The addresses a card hands out ──────────────────────────────────────────────────────────────
 *
 * A picture this server holds travels as an absolute address; one it does not travels as the bare
 * name it has always travelled as, which every lane resolves against its own image. That is what
 * makes publishing a card a press rather than a commit, without taking the road back away.
 */
const cardTemplate = () => ({
  id: 'tracy-business',
  label: 'Tracy Business',
  card: {
    provider: 'JoomlArt',
    category: 'Professional & Corporate',
    image: 'business-home-1440.png',
    demo: { url: 'https://business-emdash.example', version: '1.0.0' },
    layouts: [
      {
        key: 'home',
        label: 'Home',
        path: '/',
        shots: { desktop: 'business-home-1440.png', mobile: 'business-home-390.png' }
      },
      { key: 'about', label: 'About', path: '/about', shots: { desktop: 'business-about-1440.png' } }
    ]
  },
  platforms: [{ platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '1.0.0', demo: null }]
})

test('a picture this server holds becomes an absolute address on the card', () => {
  const held = new Set(['business-home-1440.png', 'business-home-390.png'])
  const out = withPictureUrls(cardTemplate(), {
    origin: 'https://cowork.example',
    has: (id, file) => id === 'tracy-business' && held.has(file)
  })
  const door = 'https://cowork.example/api/templates/tracy-business/shots'
  assert.equal(out.card.image, `${door}/business-home-1440.png`)
  assert.equal(out.card.layouts[0].shots.desktop, `${door}/business-home-1440.png`)
  assert.equal(out.card.layouts[0].shots.mobile, `${door}/business-home-390.png`)
  // Not held here: no picture. The bare name used to travel on for the lane to resolve against its
  // own image, which holds none since 16/09 — a broken image on the card (#523).
  assert.equal(out.card.layouts[1].shots.desktop, null)
  // Everything else on the card is carried through untouched — this function is about addresses.
  assert.equal(out.card.category, 'Professional & Corporate')
  // A live demo carries the door a card asks before framing it — absolute, like the pictures.
  assert.deepEqual(out.card.demo, {
    url: 'https://business-emdash.example',
    version: '1.0.0',
    probe: 'https://cowork.example/api/templates/tracy-business/demo-frame'
  })
  assert.deepEqual(out.platforms, cardTemplate().platforms)
  assert.equal(out.label, 'Tracy Business')
})

test('the template handed in is not changed', () => {
  const template = cardTemplate()
  withPictureUrls(template, { origin: 'https://cowork.example', has: () => true })
  assert.equal(template.card.image, 'business-home-1440.png')
  assert.equal(template.card.layouts[0].shots.desktop, 'business-home-1440.png')
})

test('an http(s) address is left alone; anything else that is not a held name is no picture', () => {
  const template = cardTemplate()
  template.card.image = 'https://pictures.example/one.png'
  const out = withPictureUrls(template, { origin: 'https://cowork.example', has: () => true })
  assert.equal(out.card.image, 'https://pictures.example/one.png')
  for (const bad of [
    '/api/templates/tracy-business/shots/one.png',
    '../secrets.png',
    'template/tracy-business/one.png',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://',
    // Parsed by `new URL`, yet read by a browser on an https page as a same-origin relative path.
    'https:shot.png',
    'https:/shot.png',
    'http:shot.png',
    'HTTPS:/\\evil.example/x.png',
    'https:///shot.png',
    '',
    7,
    null
  ]) {
    template.card.image = bad
    template.card.layouts[0].shots.desktop = bad
    const odd = withPictureUrls(template, { origin: 'https://cowork.example', has: () => true })
    assert.equal(odd.card.image, null, String(bad))
    assert.equal(odd.card.layouts[0].shots.desktop, null, String(bad))
  }
})

test('a card whose store holds nothing keeps every picture field, each null (#523, JA Restaurant)', () => {
  // Measured 27/09: `ja-restaurant`'s release carries no picture assets and no demo, so the store
  // holds nothing, and `/api/templates` answered `"image": "ja-restaurant-home-390.png"` — a name
  // no surface can serve, drawn as a broken image. The card stays; its pictures are absent.
  const template = {
    id: 'ja-restaurant',
    label: 'JA Restaurant',
    card: {
      image: 'ja-restaurant-home-390.png',
      layouts: [
        {
          key: 'home',
          label: 'Home',
          path: '/',
          shots: { desktop: 'ja-restaurant-home-1440.png', mobile: 'ja-restaurant-home-390.png' }
        }
      ]
    },
    platforms: [{ platform: 'joomla', tag: 'quickstart/ja-restaurant/j6', version: '1.0.0' }]
  }
  const out = withPictureUrls(template, {
    origin: 'https://cowork.example',
    has: () => false,
    version: () => 'a'.repeat(64)
  })
  assert.equal(out.id, 'ja-restaurant')
  assert.equal(out.card.image, null)
  assert.deepEqual(out.card.layouts[0].shots, { desktop: null, mobile: null })
  assert.equal(out.card.layouts[0].key, 'home')
  assert.equal(out.card.demo, undefined, 'no demo is invented either')
  assert.equal(template.card.image, 'ja-restaurant-home-390.png', 'the input is not changed')
})

test('a card with no pictures to speak of is carried through, not thrown on', () => {
  const bare = { id: 'tracy-base', label: 'Tracy Base', card: { provider: 'Tracy' }, platforms: [] }
  assert.deepEqual(withPictureUrls(bare, { origin: 'https://cowork.example', has: () => true }), bare)
  const noCard = { id: 'tracy-base', label: 'Tracy Base', platforms: [] }
  assert.deepEqual(withPictureUrls(noCard, { origin: 'https://cowork.example', has: () => true }), noCard)
})

test('a deleted picture is gone, and deleting a picture that was never there says so', opts, async () => {
  const { pool } = db
  await putShot(pool, { templateId: 'tracy-business', file: 'home.png', bytes })
  assert.equal(await deleteShot(pool, 'tracy-business', 'home.png'), true)
  assert.equal(await getShot(pool, 'tracy-business', 'home.png'), null)
  assert.equal(await deleteShot(pool, 'tracy-business', 'home.png'), false)
})

/**
 * ── The door ────────────────────────────────────────────────────────────────────────────────────
 *
 * PUBLIC, like `/api/templates` itself: the reader is a lane drawing cards for a customer, not a
 * person on the operations page. It answers a picture that is already on a published card and
 * nothing else. Writing one is an administrator's press and lives on the operations doors (W3).
 */
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
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config)
  })
  // No cookie, ever: what these assert is that the door answers a reader with no seat at all.
  const get = (path) => app.fetch(new Request(`http://tracy.test${path}`, { redirect: 'manual' }))
  return { get }
}

/** One release of one template, ready and carrying a card — what a card is drawn from. */
async function seedBusiness(pool) {
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
    [
      'tracy-business/emdash-0.x',
      JSON.stringify({
        name: 'Tracy Business',
        kind: 'quickstart',
        github: 'published',
        publishedAt: null,
        assets: []
      }),
      JSON.stringify({
        schemaVersion: 'tracy-setting/v1',
        platform: 'emdash',
        label: 'Tracy Business',
        version: '1.0.0',
        cms: '0.37.0',
        install: {
          source: { file: 'q.zip', sha256: 'c'.repeat(64) },
          state: { file: 's.tar.gz', sha256: 'd'.repeat(64) }
        },
        card: {
          provider: 'JoomlArt',
          category: 'Professional & Corporate',
          blurb: 'Industrial / B2B company site.',
          template: 'tracy-business',
          image: 'business-home-1440.png',
          layouts: [
            {
              key: 'home',
              label: 'Home',
              path: '/',
              shots: { desktop: 'business-home-1440.png', mobile: 'business-home-390.png' }
            }
          ]
        }
      })
    ]
  )
}

test(
  'the picture door hands out the bytes, the type and an ETag, to a reader with no seat',
  opts,
  async () => {
    const { pool } = db
    const { get } = harness(pool)
    const put = await putShot(pool, {
      templateId: 'tracy-business',
      file: 'business-home-1440.png',
      bytes
    })
    const response = await get('/api/templates/tracy-business/shots/business-home-1440.png')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600')
    assert.equal(response.headers.get('etag'), `"${put.sha256}"`)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  }
)

test(
  'a picture that is not here says so in one code, and a name that never could says the same',
  opts,
  async () => {
    const { pool } = db
    const { get } = harness(pool)
    const missing = await get('/api/templates/tracy-business/shots/nothing-here.png')
    assert.equal(missing.status, 404)
    assert.deepEqual(await missing.json(), { code: 'NO_PICTURE' })
    // A name outside the shape is refused before the table, and as the same answer: a door that
    // told a stranger WHICH names are impossible would be answering a different question.
    const refused = await get('/api/templates/tracy-business/shots/Home.PNG')
    assert.equal(refused.status, 404)
    assert.deepEqual(await refused.json(), { code: 'NO_PICTURE' })

    // 🔒 A MISS IS NEVER CACHED, and this is not a nicety. Measured on dev 16/09: the miss
    // carried no cache-control, so the edge applied the zone default — four hours — and the
    // picture uploaded a minute later kept answering 404 to every visitor for the rest of the
    // afternoon. The card publishes, and the thumbnail stays an empty rectangle with nothing
    // anywhere saying why. A hit may be cached for an hour; a miss may not be cached at all.
    for (const answer of [missing, refused]) assert.equal(answer.headers.get('cache-control'), 'no-store')
  }
)

test('a card names a stored picture by address and an absent one as no picture', opts, async () => {
  const { pool } = db
  const { get } = harness(pool)
  await seedBusiness(pool)
  await putShot(pool, { templateId: 'tracy-business', file: 'business-home-1440.png', bytes })

  const body = await (await get('/api/templates')).json()
  const [template] = body.templates
  const door = 'http://tracy.test/api/templates/tracy-business/shots/business-home-1440.png'
  // The address is this deployment's own, never a fixed one — and it carries the bytes' digest,
  // so re-shooting the picture hands the browser a different address instead of the same one it
  // is already holding for an hour.
  assert.match(
    template.card.image,
    new RegExp(`^${door.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?v=[0-9a-f]{8}$`),
    'the address is this deployment own, never a fixed one'
  )
  assert.equal(template.card.layouts[0].shots.desktop, template.card.image)
  // Never shot through Tracy: no picture. The bare name used to travel on for the lane to read out
  // of its own image, which holds none since 16/09 — a broken image on the card (#523).
  assert.equal(template.card.layouts[0].shots.mobile, null)
})

test(
  'a template with no pictures here is served with every picture absent, never a bare name (#523)',
  opts,
  async () => {
    const { pool } = db
    const { get } = harness(pool)
    await seedBusiness(pool)
    const [template] = (await (await get('/api/templates')).json()).templates
    // The card is still served — only its pictures are absent, so the surface draws an empty box.
    assert.equal(template.id, 'tracy-business')
    assert.equal(template.card.image, null)
    assert.deepEqual(template.card.layouts[0].shots, { desktop: null, mobile: null })
  }
)

test('a template id has one spelling, whatever the release wrote', () => {
  // ⚠ THE BUG THIS EXISTS FOR, measured 17/09 in quickstart_releases. A Joomla release states its
  // TEMPLATE DIRECTORY, which is Joomla's own underscore convention; an EmDash one states a slug.
  // Two things broke on that and only one was visible: every capture of a Joomla template was
  // refused by this file's name rule, and `tracy-business/j6` did not group with
  // `tracy-business/emdash-0.x` as one card — a card quietly missing a CMS, with nothing said.
  assert.equal(templateIdOf('ja_kinetic'), 'ja-kinetic')
  assert.equal(templateIdOf('ja_voyara'), 'ja-voyara')
  assert.equal(templateIdOf('tracy_business'), 'tracy-business')
  // The two spellings of one template now answer the same id — which is the grouping fix.
  assert.equal(templateIdOf('tracy_business'), templateIdOf('tracy-business'))
})

test('normalising is not a way past the name rule', () => {
  for (const bad of ['../evil', 'a/b', 'has space', '-leading', '', null, undefined, 42])
    assert.equal(templateIdOf(bad), null, `refused ${JSON.stringify(bad)}`)
  // An id the store would accept is still what comes back — normalising only touches case and `_`.
  assert.equal(templateIdOf('JA_Kinetic'), 'ja-kinetic')
})

test("a picture's address carries its own digest, so a re-shot picture is a new address", () => {
  // 🔒 WHY THIS EXISTS. A picture keeps its file name when it is shot again, and the door serves it
  // with `cache-control: public, max-age=3600` — so for an hour a browser that fetched the old one
  // never asks again. Measured 18/09 on dev: the store held the real pages (335 KB–3.2 MB, shot at
  // 03:25) while three thumbnails on screen were still the 404 captures they had replaced. Nothing
  // was wrong on the server; the address simply had not changed.
  const sha = 'a'.repeat(64)
  const template = {
    id: 'ja-vital',
    card: { image: 'home-1440.png', layouts: [{ key: 'home', shots: { desktop: 'home-1440.png' } }] }
  }
  const out = withPictureUrls(template, {
    origin: 'https://cowork.example',
    has: () => true,
    version: () => sha
  })
  assert.equal(
    out.card.image,
    `https://cowork.example/api/templates/ja-vital/shots/home-1440.png?v=${sha.slice(0, 8)}`
  )
  assert.equal(out.card.layouts[0].shots.desktop, out.card.image)

  // ⚠ NO VERSION, NO CHANGE. A caller that does not pass one — and a row written before the digest
  // was there — gets exactly the address it always got, rather than a `?v=undefined`.
  const plain = withPictureUrls(template, { origin: 'https://cowork.example', has: () => true })
  assert.equal(plain.card.image, 'https://cowork.example/api/templates/ja-vital/shots/home-1440.png')
  for (const bad of [null, undefined, '', 'not-hex', 7]) {
    const odd = withPictureUrls(template, {
      origin: 'https://cowork.example',
      has: () => true,
      version: () => bad
    })
    assert.equal(
      odd.card.image,
      'https://cowork.example/api/templates/ja-vital/shots/home-1440.png',
      String(bad)
    )
  }

  // A name this server does not hold is no picture, digest or no digest (#523).
  const absent = withPictureUrls(template, {
    origin: 'https://cowork.example',
    has: () => false,
    version: () => sha
  })
  assert.equal(absent.card.image, null)
})
