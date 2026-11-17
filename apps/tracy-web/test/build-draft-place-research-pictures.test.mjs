// The pictures of the build chat's research of links (#575) are the step chain's own: the place's Google photos stored
// by the place executor under the /ops/wo photo switch, labelled by the step chain's labelling when the content brief
// is made, so a Google photo whose author is the business is the business's own photo in the brief and in the needs
// profile research, and a stranger's is set aside as not its own. Invented bakery, invented bytes, a scripted vision
// model: nothing reaches a network.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-place-research-pictures.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { researchOf } from 'website-opportunities/domain/needs-research.mjs'
import { createBriefPictureLabels } from '../src/opportunities-build/brief-picture-labels.js'
import { fileDb } from './_db.mjs'
import { MAPS, PLACE_ID, SITE, placeDetails, websiteResult } from './build-draft-gather-fakes.mjs'
import {
  bakeryDomain,
  drain,
  memoryObjects,
  placeExecutor,
  pngBytes,
  server
} from './build-draft-place-research-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const photoName = (n) => `places/${PLACE_ID}/photos/photo${n}`
const AUTHORS = ['Hollowmere Bakehouse', 'Invented Visitor One']
const VISION = { door: { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }, key: 'vision-key-1' }

test(
  'a Google photo by the business is its own in the brief and the needs research; a stranger photo is not',
  opts,
  async () => {
    const objects = memoryObjects()
    const png = await pngBytes()
    const { domain } = await bakeryDomain({ png })
    const photos = AUTHORS.map((name, n) => ({
      name: photoName(n),
      authorAttributions: [{ displayName: name }]
    }))
    domain.fetchPlaceDetails = async (id) => ({ ...placeDetails(), id, photos })
    domain.fetchPlacePhoto = async (name, deps) => ({
      bytes: await pngBytes(40 + Number(name.slice(-1)) * 90),
      mime: 'image/png',
      sourceUrl: `google-places:${name}`,
      attributions: deps.attributions ?? []
    })
    const asked = []
    const pictureLabels = createBriefPictureLabels({
      pool: db.pool,
      objects,
      visionFor: async () => VISION,
      observe: null,
      // The scripted vision model: it says nothing of whose photo it is, so the author decides.
      label: async ({ pictures }) => {
        asked.push(pictures.length)
        return {
          labels: new Map(
            pictures.map((p) => [p.id, { subject: 'food', content: 'product', caption: 'Loaves.' }])
          ),
          reasons: new Map(),
          usage: { promptTokens: 100, completionTokens: 10, requests: [] }
        }
      }
    })
    const s = server(db.pool, {
      domain,
      objects,
      appDeps: { websiteOpportunitiesPictureLabels: pictureLabels }
    })
    const ex = placeExecutor(db.pool, domain, objects, { googlePlacesPhotos: true })
    await s.call('POST', '/research', { links: [MAPS] })
    await s.app.buildDraftEngine.settled(await s.accountId())
    await drain(ex)
    const { later } = await s.poll()
    const fault = (await db.pool.query('select fault from build_draft')).rows[0]?.fault
    assert.equal(later.body.state, 'done', JSON.stringify(fault ?? later.body))
    const { research } = (await db.pool.query('select research from build_draft')).rows[0]
    const { brief, manifest } = research
    assert.equal(asked.length, 1, 'the step chain labelled the photographs once, when the brief was made')
    const byUrl = new Map(manifest.map((m) => [m.sourceUrl, m.id]))
    const assetOf = (n) => brief.assets.find((a) => a.id === byUrl.get(`google-places:${photoName(n)}`))
    assert.ok(assetOf(0) && assetOf(1), JSON.stringify(manifest.map((m) => m.sourceUrl)))
    assert.equal(assetOf(0).isOwnPhoto, true, 'the author is the business')
    assert.notEqual(assetOf(1).isOwnPhoto, true)
    const { sources } = researchOf(brief, { manifest })
    const kept = sources.flatMap((x) => (x.pictures ?? []).map((p) => p.id))
    assert.ok(kept.includes(assetOf(0).id), 'the needs research keeps the business own photo')
    assert.ok(!kept.includes(assetOf(1).id), 'and never a stranger photo as the business own')
  }
)

test('the PageSpeed audit of the business website reaches the brief the build chat keeps', opts, async () => {
  const objects = memoryObjects()
  const { domain } = await bakeryDomain({ png: await pngBytes() })
  const audits = []
  // Google's PageSpeed answer for the invented website, the only call the executor sends out.
  const fetchImpl = async (url) => {
    audits.push(String(url))
    if (!String(url).includes('pagespeedonline')) throw new Error('no network in tests')
    return Response.json({
      lighthouseResult: {
        finalDisplayedUrl: SITE,
        categories: { performance: { score: 0.41 }, seo: { score: 0.77 } },
        audits: { 'largest-contentful-paint': { numericValue: 5120 } }
      }
    })
  }
  const s = server(db.pool, { domain, objects })
  const ex = placeExecutor(db.pool, domain, objects, { pageSpeedCheckEnabled: true }, { apiFetch: fetchImpl })
  await s.call('POST', '/research', { links: [SITE] })
  await s.app.buildDraftEngine.settled(await s.accountId())
  await drain(ex)
  const { later } = await s.poll()
  assert.equal(later.body.state, 'done', JSON.stringify(later.body))
  const { research } = (await db.pool.query('select research from build_draft')).rows[0]
  assert.ok(
    audits.some((u) => u.includes('pagespeedonline')),
    'the step chain ran its audit'
  )
  const text = JSON.stringify(research.brief)
  assert.ok(text.includes('5120') || text.includes('"performance":41'), text.slice(0, 600))
})

test('the dishes the menu of the business names reach the brief the build chat keeps', opts, async () => {
  const objects = memoryObjects()
  const { domain } = await bakeryDomain({ png: await pngBytes() })
  const menu = 'https://hollowmere-bakehouse.example/menu'
  const site = websiteResult()
  site.menus = [{ url: menu, label: 'Menu' }]
  domain.connectorsFor = ((connectorsFor) => (env) => ({
    ...connectorsFor(env),
    website: { available: true, provider: 'fake', collect: async () => site }
  }))(domain.connectorsFor)
  const read = []
  domain.readMenus = async ({ menus }) => (
    read.push(menus),
    {
      items: [
        {
          name: 'Rye sourdough loaf',
          price: '7.50',
          section: 'Breads',
          source: { kind: 'page', url: menus[0].url }
        }
      ],
      reads: [{ url: menus[0].url, kind: 'page', status: 'complete', items: 1 }]
    }
  )
  const s = server(db.pool, { domain, objects })
  const ex = placeExecutor(db.pool, domain, objects)
  await s.call('POST', '/research', { links: [SITE] })
  await s.app.buildDraftEngine.settled(await s.accountId())
  await drain(ex)
  const { later } = await s.poll()
  assert.equal(later.body.state, 'done', JSON.stringify(later.body))
  const { research } = (await db.pool.query('select research from build_draft')).rows[0]
  const rows = (
    await db.pool.query(
      "select source, status, reason, collected from wo_place_snapshot_source where source like 'menu%'"
    )
  ).rows
  assert.ok(
    JSON.stringify(research.brief).includes('Rye sourdough loaf'),
    `the menu dish is in the brief: ${JSON.stringify({ read, rows }).slice(0, 900)}`
  )
  // The needs research reads the dish as an offering of the business (`needs-research-facts.mjs` `dishItemOf`).
  const { sources } = researchOf(research.brief, { manifest: research.manifest })
  const offered = sources
    .flatMap((x) => x.items ?? [])
    .map((i) => i.fields?.['offering.name']?.value ?? i.fields?.['offering.name'])
  assert.ok(JSON.stringify(offered).includes('Rye sourdough loaf'), JSON.stringify(sources).slice(0, 900))
})
