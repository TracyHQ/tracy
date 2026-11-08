// The found logo reaches the run folder before any model call (brand step trial bench, #321): from the brief's media
// id (wo_media, read through the object store) or from --logo-file; a logo that cannot be had stops the run first.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { runCli } from '../src/brand-step/brand-cli.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { memoryRunFiles } from '../src/brand-step/run-files.js'
import { fileDb } from './_db.mjs'
import {
  assignBrandDoors,
  brandCase,
  done,
  fakeWiring,
  KIT_REF,
  modelRouter,
  quiet,
  SECRET,
  startRun
} from './_brand-bench.mjs'
import { readyKitImages } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const LOGO_ID = '5b9e3c10-8a24-4f6d-b7c1-2d4e6f801a33'
// the invented logo: a dark ring on white
const logoPng = await sharp({ create: { width: 120, height: 80, channels: 4, background: '#ffffff' } })
  .composite([
    {
      input: await sharp({ create: { width: 40, height: 40, channels: 4, background: '#1a1a1a' } })
        .png()
        .toBuffer()
    }
  ])
  .png()
  .toBuffer()

/** The case with an invented logo id and an empty run folder. */
async function caseWithLogo() {
  const c = await brandCase()
  return { ...c, files: memoryRunFiles(), brief: { ...c.brief, brand: { ...c.brief.brand, logo: LOGO_ID } } }
}

async function addMedia(pool, bytes) {
  const sha = createHash('sha256').update(bytes).digest('hex')
  const account = (await pool.query(`insert into account (email) values ('owner@example.test') returning id`))
    .rows[0]
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, 'Invented Cafe', 'manual', 'ic') returning id`,
      [account.id]
    )
  ).rows[0]
  await pool.query(
    `insert into wo_media (id, account_id, opportunity_id, sha256, object_key, kind, category, source, source_url, mime, bytes)
     values ($1, $2, $3, $4, $5, 'image', 'logo', 'website', 'https://cafe.example.test/logo.png', 'image/png', $6)`,
    [LOGO_ID, account.id, opp.id, sha, `wo/${sha}.png`, bytes.length]
  )
}

/** Queue the run and let one worker play it; the worker's wiring carries the (fake) object store. */
async function play(c, { logoObjects = null, ...over } = {}) {
  await assignBrandDoors(db.pool)
  const run = await startRun(db.pool, c, over)
  const model = modelRouter({ agent: [done()] })
  await createBrandQueue({
    pool: db.pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl.bind(model),
    kitImages: readyKitImages(),
    wiring: async () => ({ ...(await fakeWiring({ files: c.files })()), logoObjects }),
    log: quiet,
    retry: { attempts: 1 }
  }).drain()
  return { run: await readRun(db.pool, run.id), model }
}

test('a media id is loaded from wo_media into the run folder before the first model call', opts, async () => {
  await addMedia(db.pool, logoPng)
  const c = await caseWithLogo()
  const asked = []
  const logoObjects = { get: async (key) => (asked.push(key), new Response(logoPng)) }
  const { run, model } = await play(c, { logoObjects })
  assert.equal(asked.length, 1)
  assert.deepEqual(c.files.read(`media/${LOGO_ID}.png`), logoPng)
  assert.deepEqual(run.logoSource, { kind: 'media', mediaId: LOGO_ID })
  assert.ok(model.requests.length > 0, 'the agent was called once the logo was in place')
})

/** The logo as the place research keeps it: a `wo_place_media` row, named in the brief's media with `origin: 'place'`. */
async function addPlaceMedia(pool, bytes, { revoked = false } = {}) {
  const sha = createHash('sha256').update(bytes).digest('hex')
  const place = (
    await pool.query(`insert into wo_place (display_name) values ('Invented Padel Club') returning id`)
  ).rows[0]
  await pool.query(
    `insert into wo_place_media (id, place_id, sha256, object_key, kind, category, source, source_url, mime, bytes, revoked_at)
     values ($1, $2, $3, $4, 'image', 'logo', 'website', 'https://padel.example.test/logo.png', 'image/png', $5, $6)`,
    [LOGO_ID, place.id, sha, `places/${sha}.png`, bytes.length, revoked ? new Date() : null]
  )
  return sha
}

/** The case whose brief names the logo as a place picture, as a research revision of a researched place does. */
async function caseWithPlaceLogo(sha) {
  const c = await caseWithLogo()
  const media = [
    ...(c.brief.media ?? []),
    { id: LOGO_ID, origin: 'place', kind: 'image', category: 'logo', sha256: sha }
  ]
  return { ...c, brief: { ...c.brief, media } }
}

test(
  'a logo the place research stored (wo_place_media) is loaded before the first model call',
  opts,
  async () => {
    const sha = await addPlaceMedia(db.pool, logoPng)
    const c = await caseWithPlaceLogo(sha)
    const asked = []
    const logoObjects = { get: async (key) => (asked.push(key), new Response(logoPng)) }
    const { run, model } = await play(c, { logoObjects })
    assert.doesNotMatch(String(run.error ?? ''), /BRAND_LOGO_UNAVAILABLE/)
    assert.deepEqual(asked, [`places/${sha}.png`])
    assert.deepEqual(c.files.read(`media/${LOGO_ID}.png`), logoPng)
    assert.deepEqual(run.logoSource, { kind: 'place-media', mediaId: LOGO_ID })
    assert.ok(model.requests.length > 0)
  }
)

test('a place logo the brief media does not list is still found in the place table', opts, async () => {
  await addPlaceMedia(db.pool, logoPng)
  const c = await caseWithLogo()
  const { run } = await play(c, { logoObjects: { get: async () => new Response(logoPng) } })
  assert.doesNotMatch(String(run.error ?? ''), /BRAND_LOGO_UNAVAILABLE/)
  assert.deepEqual(run.logoSource, { kind: 'place-media', mediaId: LOGO_ID })
})

test('a revoked place logo fails the run with the reason and no model call', opts, async () => {
  const sha = await addPlaceMedia(db.pool, logoPng, { revoked: true })
  const c = await caseWithPlaceLogo(sha)
  const { run, model } = await play(c, { logoObjects: { get: async () => new Response(logoPng) } })
  assert.equal(run.status, 'failed')
  assert.match(run.error, /BRAND_LOGO_UNAVAILABLE: logo media .* (revoked|does not exist)/)
  assert.equal(model.requests.length, 0)
})

test('a missing logo media fails the run with the reason and no model call', opts, async () => {
  const c = await caseWithLogo()
  const { run, model } = await play(c, { logoObjects: { get: async () => new Response(logoPng) } })
  assert.equal(run.status, 'failed')
  assert.match(run.error, /BRAND_LOGO_UNAVAILABLE: logo media .* does not exist/)
  assert.equal(model.requests.length, 0)
  assert.deepEqual(c.files.list(), [])
})

test(
  'a brief file naming a media id with no object store fails clearly, before any model call',
  opts,
  async () => {
    await addMedia(db.pool, logoPng)
    const { run, model } = await play(await caseWithLogo())
    assert.equal(run.status, 'failed')
    assert.match(run.error, /BRAND_LOGO_UNAVAILABLE.*no object store/)
    assert.equal(model.requests.length, 0)
  }
)

test('--logo-file stages the file at the start and records its name only', opts, async () => {
  const c = await caseWithLogo()
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-logo-'))
  const out = []
  const err = []
  try {
    writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(c.brief))
    writeFileSync(path.join(dir, 'found-logo.png'), logoPng)
    writeFileSync(path.join(dir, 'notes.txt'), 'not a picture')
    const run = (argv) =>
      runCli(argv, {
        pool: db.pool,
        secret: SECRET,
        kitImages: readyKitImages(),
        wiring: fakeWiring({ files: c.files }),
        runDir: () => path.join(dir, 'run'),
        cwd: dir,
        out: (l) => out.push(l),
        err: (l) => err.push(l)
      })
    await assignBrandDoors(db.pool)
    const base = ['run', '--kit', KIT_REF, '--brief-file', 'brief.json']
    assert.equal(await run([...base, '--logo-file', 'notes.txt']), 1)
    assert.match(err.at(-1), /BRAND_LOGO_NOT_IMAGE/)
    assert.equal(await run([...base, '--logo-file', 'missing.png']), 1)
    assert.match(err.at(-1), /Cannot read the logo file missing.png/)
    assert.equal(
      await run(['run', '--kit', KIT_REF, '--brief-revision', LOGO_ID, '--logo-file', 'found-logo.png']),
      2
    )
    assert.equal(await run([...base, '--logo-file', 'found-logo.png']), 0)
    const row = (
      await db.pool.query('select brief_source, logo_source from brand_run where id = $1', [out.at(-1)])
    ).rows[0]
    assert.deepEqual(row.brief_source, { kind: 'file', name: 'brief.json' })
    assert.deepEqual(row.logo_source, { kind: 'file', name: 'found-logo.png' })
    assert.deepEqual(c.files.read(`media/${LOGO_ID}.png`), logoPng)
    assert.doesNotMatch(JSON.stringify(row), new RegExp(dir))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a logo file with a brief that names no logo is refused', opts, async () => {
  await assignBrandDoors(db.pool)
  const c = await brandCase()
  const dir = mkdtempSync(path.join(tmpdir(), 'brand-logo-'))
  const err = []
  try {
    writeFileSync(
      path.join(dir, 'brief.json'),
      JSON.stringify({ ...c.brief, brand: { ...c.brief.brand, logo: null } })
    )
    writeFileSync(path.join(dir, 'logo.png'), logoPng)
    const code = await runCli(
      ['run', '--kit', KIT_REF, '--brief-file', 'brief.json', '--logo-file', 'logo.png'],
      {
        pool: db.pool,
        secret: SECRET,
        kitImages: readyKitImages(),
        wiring: fakeWiring({ files: c.files }),
        runDir: () => dir,
        cwd: dir,
        out: () => {},
        err: (l) => err.push(l)
      }
    )
    assert.equal(code, 1)
    assert.match(err.at(-1), /BRAND_LOGO_NO_ID/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
