// Kit images of the site planner bench (ADR 0041, #302): the kit zip is fetched once per kit version, every image is
// checked against the sha256 the kit lists, the images are cached on disk, and open_kit_image returns one image by id.
// No network: the zip is built here with invented images, and GitHub is a fake fetch.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { zipSync } from 'fflate'
import { createKitImages, kitImagesDirOf, kitZipName, releaseKitZip } from '../src/site-planner/kit-images.js'
import { kitTools } from '../src/site-planner/kit-source.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const bytesOf = (id) => Buffer.from(`invented image bytes of ${id}`)
const IDS = ['page-home-1440', 'page-home-390', 'header-1440']

/** An invented kit whose images list the right sha256 of bytesOf(id). */
function fakeKit({ ids = IDS } = {}) {
  return {
    ref: 'demo/j6/2.0.0',
    release: 'quickstart/demo/j6',
    version: '2.0.0',
    doc: {
      template: { name: 'ja_demo', version: '1.1.0' },
      quickstart: { product: 'demo', version: '2.0.0' },
      images: ids.map((id) => {
        const bytes = bytesOf(id)
        return { id, path: `images/${id}.jpg`, sha256: sha(bytes), bytes: bytes.length }
      })
    }
  }
}

/** A zip of the given images (path → bytes), as the kit pack writes it. */
function zipOf(files) {
  const entries = { 'template-kit.json': new TextEncoder().encode('{}') }
  for (const [p, bytes] of Object.entries(files)) entries[p] = new Uint8Array(bytes)
  return Buffer.from(zipSync(entries))
}
const goodZip = (ids = IDS) => zipOf(Object.fromEntries(ids.map((id) => [`images/${id}.jpg`, bytesOf(id)])))

/** A fetchZip that answers the given zip and counts its calls. */
function zipSource(answer) {
  const calls = []
  const fetchZip = async (request) => {
    calls.push(request)
    return typeof answer === 'function' ? answer(calls.length) : answer
  }
  return { fetchZip, calls }
}

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'kit-images-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('the zip name follows the kit pack: template name and quickstart version, slugged', () => {
  assert.equal(kitZipName(fakeKit().doc), 'template-kit-ja-demo-2.0.0.zip')
  assert.equal(
    kitZipName({ template: { name: 'ja_boxing' }, quickstart: { version: '1.0.10' } }),
    'template-kit-ja-boxing-1.0.10.zip'
  )
})

test('the zip is fetched once per kit version, checked, cached, and reused by a later process', async () => {
  const kit = fakeKit()
  const source = zipSource({ ok: true, bytes: goodZip() })
  const first = await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(kit)
  assert.equal(first.ok, true, JSON.stringify(first))
  assert.deepEqual(source.calls, [{ release: 'quickstart/demo/j6', name: 'template-kit-ja-demo-2.0.0.zip' }])

  const again = await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(kit)
  assert.equal(again.ok, true)
  assert.equal(source.calls.length, 1, 'a cached kit version was downloaded again')

  const opened = await again.images.open('page-home-390')
  assert.equal(opened.images.length, 1)
  assert.equal(opened.images[0].mediaType, 'image/jpeg')
  assert.deepEqual(Buffer.from(opened.images[0].base64, 'base64'), bytesOf('page-home-390'))
  assert.equal(JSON.parse(opened.text).id, 'page-home-390')
})

test('two runs asking at once share one download', async () => {
  const kit = fakeKit()
  const source = zipSource({ ok: true, bytes: goodZip() })
  const images = createKitImages({ dir, fetchZip: source.fetchZip })
  const [a, b] = await Promise.all([images.ensure(kit), images.ensure(kit)])
  assert.equal(a.ok && b.ok, true)
  assert.equal(source.calls.length, 1)
})

test('an image whose bytes do not match the kit sha256 makes the kit unusable, and nothing is cached', async () => {
  const kit = fakeKit()
  const files = Object.fromEntries(IDS.map((id) => [`images/${id}.jpg`, bytesOf(id)]))
  files['images/header-1440.jpg'] = Buffer.from('tampered')
  const source = zipSource({ ok: true, bytes: zipOf(files) })
  const result = await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(kit)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'SITE_PLANNER_KIT_IMAGE_MISMATCH')
  assert.match(result.reason, /header-1440/)
  assert.deepEqual(
    readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.jpg')),
    [],
    'images of a refused zip were left on disk'
  )

  // The next try downloads again: a refusal is not remembered as a cached kit.
  const fixed = zipSource({ ok: true, bytes: goodZip() })
  assert.equal((await createKitImages({ dir, fetchZip: fixed.fetchZip }).ensure(kit)).ok, true)
})

test('an image the kit lists but the zip lacks makes the kit unusable', async () => {
  const source = zipSource({ ok: true, bytes: goodZip(['page-home-1440', 'page-home-390']) })
  const result = await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(fakeKit())
  assert.equal(result.code, 'SITE_PLANNER_KIT_IMAGE_MISSING')
  assert.match(result.reason, /header-1440/)
})

test('a missing zip, an unreadable release and bytes that are not a zip are refused with the reason', async () => {
  const missing = zipSource({
    ok: false,
    code: 'SITE_PLANNER_KIT_ZIP_MISSING',
    reason: 'the release has no asset template-kit-ja-demo-2.0.0.zip'
  })
  const a = await createKitImages({ dir, fetchZip: missing.fetchZip }).ensure(fakeKit())
  assert.deepEqual(a, {
    ok: false,
    code: 'SITE_PLANNER_KIT_ZIP_MISSING',
    reason: 'the release has no asset template-kit-ja-demo-2.0.0.zip'
  })

  const garbage = zipSource({ ok: true, bytes: Buffer.from('not a zip at all') })
  const b = await createKitImages({ dir, fetchZip: garbage.fetchZip }).ensure(fakeKit())
  assert.equal(b.code, 'SITE_PLANNER_KIT_ZIP_INVALID')

  const thrown = { fetchZip: async () => Promise.reject(new Error('socket hang up')) }
  const c = await createKitImages({ dir, ...thrown }).ensure(fakeKit())
  assert.equal(c.code, 'SITE_PLANNER_KIT_ZIP_UNREADABLE')
  assert.match(c.reason, /socket hang up/)
})

test('a kit image path that leaves the cache folder, or is not a picture, is refused before any download', async () => {
  const kit = fakeKit()
  kit.doc.images[0].path = '../outside.jpg'
  const source = zipSource({ ok: true, bytes: goodZip() })
  const a = await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(kit)
  assert.equal(a.code, 'SITE_PLANNER_KIT_IMAGE_PATH')

  const kit2 = fakeKit()
  kit2.doc.images[0].path = 'images/page-home-1440.svg'
  const b = await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(kit2)
  assert.equal(b.code, 'SITE_PLANNER_KIT_IMAGE_PATH')
  assert.equal(source.calls.length, 0)
})

test('a cached image changed on disk is found at the next check and the zip is fetched again', async () => {
  const kit = fakeKit()
  const source = zipSource({ ok: true, bytes: goodZip() })
  assert.equal((await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(kit)).ok, true)
  const cached = readdirSync(dir, { recursive: true }).find((f) => String(f).endsWith('header-1440.jpg'))
  writeFileSync(path.join(dir, String(cached)), 'changed on disk')

  const again = await createKitImages({ dir, fetchZip: source.fetchZip }).ensure(kit)
  assert.equal(again.ok, true)
  assert.equal(source.calls.length, 2)
  const opened = await again.images.open('header-1440')
  assert.deepEqual(Buffer.from(opened.images[0].base64, 'base64'), bytesOf('header-1440'))
})

test('open_kit_image returns the image by id, one per result; an unknown id is an error the planner can read', async () => {
  const kit = fakeKit()
  const ready = await createKitImages({
    dir,
    fetchZip: zipSource({ ok: true, bytes: goodZip() }).fetchZip
  }).ensure(kit)
  const [, openImage] = kitTools(kit.doc, { images: ready.images })
  const found = await openImage.run({ id: 'header-1440' })
  assert.equal(found.images.length, 1)
  assert.deepEqual(Buffer.from(found.images[0].base64, 'base64'), bytesOf('header-1440'))

  const unknown = JSON.parse(await openImage.run({ id: 'nothing-1440' }))
  assert.equal(unknown.error, 'UNKNOWN_IMAGE')
  assert.equal(unknown.id, 'nothing-1440')
  assert.match(unknown.detail, /images/)
  assert.equal(JSON.parse(await openImage.run({})).error, 'INVALID_ARGUMENTS')
})

// --- The release zip on GitHub, the way Tracy already downloads quickstart release assets.

const RELEASE_ROW = (assets) => ({
  tag: 'quickstart/demo/j6',
  release: { name: 'demo', kind: 'quickstart', github: 'published', assets },
  setting: null,
  inspiration: null,
  inspiration_hidden: false,
  pages: null,
  tracy: 'ready',
  reason: null,
  fetched_at: new Date()
})
const fakePool = (rows) => ({ query: async () => ({ rows }) })
const ZIP_ASSET = { name: 'template-kit-ja-demo-2.0.0.zip', id: 4242, size: 10 }

function fakeGithub(answer) {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, headers: init?.headers })
    return answer(url)
  }
  return { fetchImpl, requests }
}

test('the zip is downloaded by asset id from the releases repository with the releases token', async () => {
  const bytes = goodZip()
  const github = fakeGithub(() => new Response(bytes, { status: 200 }))
  const fetchZip = releaseKitZip({
    pool: fakePool([RELEASE_ROW([{ ...ZIP_ASSET, digest: `sha256:${sha(bytes)}` }])]),
    config: { github: null, releasesToken: 'read-only-token' },
    fetchImpl: github.fetchImpl
  })
  const got = await fetchZip({ release: 'quickstart/demo/j6', name: ZIP_ASSET.name })
  assert.equal(got.ok, true)
  assert.deepEqual(Buffer.from(got.bytes), bytes)
  assert.equal(github.requests.length, 1)
  assert.match(github.requests[0].url, /\/repos\/[^/]+\/[^/]+\/releases\/assets\/4242$/)
  assert.equal(github.requests[0].headers.authorization, 'Bearer read-only-token')
  assert.equal(github.requests[0].headers.accept, 'application/octet-stream')
})

test('no release, no zip asset, no credential, a GitHub refusal or a digest mismatch is a reason', async () => {
  const config = { github: null, releasesToken: 'read-only-token' }
  const never = fakeGithub(() => {
    throw new Error('GitHub must not be called')
  })
  const ask = (pool, cfg = config, fetchImpl = never.fetchImpl) =>
    releaseKitZip({ pool, config: cfg, fetchImpl })({ release: 'quickstart/demo/j6', name: ZIP_ASSET.name })

  const noRelease = await ask(fakePool([]))
  assert.equal(noRelease.code, 'SITE_PLANNER_KIT_ZIP_MISSING')
  assert.match(noRelease.reason, /quickstart\/demo\/j6/)

  const noAsset = await ask(fakePool([RELEASE_ROW([{ name: 'tracy_setting.json', id: 1 }])]))
  assert.equal(noAsset.code, 'SITE_PLANNER_KIT_ZIP_MISSING')
  assert.match(noAsset.reason, /template-kit-ja-demo-2\.0\.0\.zip/)

  const noToken = await ask(fakePool([RELEASE_ROW([ZIP_ASSET])]), { github: null, releasesToken: null })
  assert.equal(noToken.code, 'SITE_PLANNER_KIT_ZIP_UNREADABLE')
  assert.match(noToken.reason, /TRACY_RELEASES_GITHUB_TOKEN/)

  const refused = fakeGithub(() => new Response('Not Found', { status: 404 }))
  const notFound = await ask(fakePool([RELEASE_ROW([ZIP_ASSET])]), config, refused.fetchImpl)
  assert.equal(notFound.code, 'SITE_PLANNER_KIT_ZIP_UNREADABLE')
  assert.match(notFound.reason, /404/)

  const other = fakeGithub(() => new Response(Buffer.from('other bytes'), { status: 200 }))
  const mismatch = await ask(
    fakePool([RELEASE_ROW([{ ...ZIP_ASSET, digest: `sha256:${'0'.repeat(64)}` }])]),
    config,
    other.fetchImpl
  )
  assert.equal(mismatch.code, 'SITE_PLANNER_KIT_ZIP_INVALID')
  assert.match(mismatch.reason, /digest/)
})

test('the cache lives in the readiness folder the server is configured with', () => {
  assert.equal(
    kitImagesDirOf({ readinessDir: '/srv/readiness' }),
    path.join('/srv/readiness', 'site-planner-kit-images')
  )
  assert.equal(
    kitImagesDirOf({ readinessDir: null }),
    path.join(tmpdir(), 'tracy-readiness', 'site-planner-kit-images')
  )
})
