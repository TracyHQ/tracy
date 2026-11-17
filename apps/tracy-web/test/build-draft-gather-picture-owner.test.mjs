// The build chat's research labels its pictures with the step chain's labelling before the brief is made (#575): a
// Google photo whose author is the business is the business's own, a visitor's photo the vision model calls the
// business's own is too, and the needs profile research then keeps both (`needs-research-media.mjs`). The labels land
// on the draft picture rows, and the vision call is held to the research job's cap. Invented bakery, invented bytes,
// a scripted vision model: nothing reaches a network.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-picture-owner.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from 'website-opportunities/domain/needs-research.mjs'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import {
  MAPS,
  PLACE_ID,
  fakeDomain,
  fakeObjects,
  fakePicturePool,
  placeDetails,
  pngOf,
  runtimeWith
} from './build-draft-gather-fakes.mjs'

const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const VISION = { door: DOOR, key: 'vision-key-1' }
const photoName = (n) => `places/${PLACE_ID}/photos/photo${n}`
const AUTHORS = ['Hollowmere Bakehouse', 'Invented Visitor One', 'Invented Visitor Two']

/** The picture pool, answering also the labelling's two statements on `build_draft_picture` (`brief-picture-labels.js`). */
function labelPool() {
  const pool = fakePicturePool()
  const query = pool.query
  pool.query = async (sql, params) => {
    if (/visionUnanswered'->>'key'/.test(sql)) return { rows: [] }
    if (/^\s*update build_draft_picture set labels/.test(sql)) {
      const row = pool.rows.find((r) => r.id === params[0])
      const entry = JSON.parse(params[1])
      if (row) row.labels = { ...row.labels, [/'vision'/.test(sql) ? 'vision' : 'x']: entry }
      return { rows: [] }
    }
    return query(sql, params)
  }
  return pool
}

async function gatherWith({ settings = {}, asked }) {
  const photos = AUTHORS.map((name, n) => ({
    name: photoName(n),
    authorAttributions: [{ displayName: name }]
  }))
  const { domain } = await fakeDomain({ details: () => ({ ...placeDetails(), photos }) })
  domain.fetchPlacePhoto = async (name, deps) => ({
    bytes: await pngOf(1200, 800, { r: 40 + Number(name.slice(-1)) * 60, g: 120, b: 90 }),
    mime: 'image/png',
    sourceUrl: `google-places:${name}`,
    attributions: deps.attributions
  })
  const pool = labelPool()
  const gather = preSiteGatherer({
    pool,
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith({ google: 'google-test' }, settings),
      fetch: async () => assert.fail('no fetch outside the fakes'),
      paidRunAllowed: async () => true,
      objects: fakeObjects(),
      visionFor: async () => VISION,
      visionObserve: null,
      // The scripted vision model: the visitor's first photo is the business's own, the second is not.
      visionLabel: async ({ pictures }) => {
        asked.push(pictures.map((p) => p.id))
        const urlOf = (id) => pool.rows.find((r) => r.id === id).source_url
        const own = { [`google-places:${photoName(1)}`]: true, [`google-places:${photoName(2)}`]: false }
        return {
          labels: new Map(
            pictures.map((p) => [
              p.id,
              {
                subject: 'people',
                content: 'people-in-action',
                caption: 'Bakers at the counter.',
                ...(urlOf(p.id) in own ? { isOwnPhoto: own[urlOf(p.id)] } : {})
              }
            ])
          ),
          reasons: new Map(),
          usage: { promptTokens: 1000, completionTokens: 100, requests: [] }
        }
      }
    }
  })
  const gathered = await gather({ links: [MAPS], description: null }, { accountId: 'acc-1' })
  return { gathered, pool }
}

test('a Google photo by the business, and one the vision model calls its own, are the business own photos', async () => {
  const asked = []
  const { gathered, pool } = await gatherWith({ asked })
  const { brief, manifest } = gathered
  // One labelling, of the three stored Google photos, before the brief was made.
  assert.equal(asked.length, 1)
  assert.equal(asked[0].length, 3)
  const byUrl = new Map(manifest.map((m) => [m.sourceUrl, m.id]))
  const assetOf = (n) => brief.assets.find((a) => a.id === byUrl.get(`google-places:${photoName(n)}`))
  assert.equal(assetOf(0).isOwnPhoto, true, 'the author is the business')
  assert.equal(assetOf(1).isOwnPhoto, true, 'the vision model called it the business own')
  assert.equal(assetOf(2).isOwnPhoto, false)
  assert.equal(brief.assetLabelling.status, 'labelled')
  // The needs profile research keeps the two own photos and sets the stranger's aside as not own.
  const { sources, setAside } = researchOf(brief, { manifest })
  const kept = sources.flatMap((s) => (s.pictures ?? []).map((p) => p.id)).sort()
  assert.deepEqual(kept, [assetOf(0).id, assetOf(1).id].sort())
  const aside = setAside.find((s) => s.id === assetOf(2).id)
  assert.equal(aside.notOwn, true)
  assert.equal(aside.source, 'google-places')
  // The draft picture rows keep their labels, so a later build never pays for them again (#610).
  assert.ok(pool.rows.every((r) => r.labels?.vision?.key === VISION.key))
})

test('the labelling is held to the research job cap: past it, nothing is sent and the brief says so', async () => {
  const asked = []
  const { gathered } = await gatherWith({ settings: { researchJobCapCents: 1 }, asked })
  assert.deepEqual(asked, [], 'the vision call is never sent')
  assert.equal(gathered.brief.assetLabelling.status, 'failed')
  // The author rule still holds without the model.
  const byUrl = new Map(gathered.manifest.map((m) => [m.sourceUrl, m.id]))
  const own = gathered.brief.assets.find((a) => a.id === byUrl.get(`google-places:${photoName(0)}`))
  assert.equal(own.isOwnPhoto, true)
})
