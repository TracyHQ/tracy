// The build chat's research chooses the business logo with the step chain's logo research (#575, `place-logo.js`
// `researchLogo`): the stored candidates are looked at by the vision model, and the one it calls the place's own logo
// wins over a mark the page merely declares. Each look is a paid call held to the research job's cap. Invented bakery,
// invented bytes, a scripted vision model: nothing reaches a network.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-logo-vision.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import {
  SITE,
  connector,
  fakeDomain,
  fakeObjects,
  fakePicturePool,
  pngOf,
  runtimeWith,
  websiteResult
} from './build-draft-gather-fakes.mjs'

const DECLARED = 'https://hollowmere-bakehouse.example/img/supplier-mark.png'
const HEADER = 'https://hollowmere-bakehouse.example/img/header.png'
const VISION_DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }

/** The scripted vision model: the declared mark is another brand's, the header picture is the bakery's own logo. */
function visionModel(asked) {
  return async (url, init) => {
    assert.equal(url, VISION_DOOR.url)
    const body = JSON.parse(init.body)
    const text = body.messages[1].content[0].text
    asked.push(text)
    const kind = /page data/.test(text) ? 'other-brand' : 'logo'
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ kind, showsName: kind === 'logo', readsAs: null }) } }
        ],
        usage: { prompt_tokens: 900, completion_tokens: 40 }
      })
    )
  }
}

async function gatherLogo({ settings = {}, logoDoor }) {
  const withLogos = {
    ...websiteResult(),
    logos: [
      { url: DECLARED, via: 'jsonld-logo' },
      { url: HEADER, via: 'header-img' }
    ]
  }
  const { domain } = await fakeDomain({ connectors: { website: connector(withLogos) } })
  const served = {
    [DECLARED]: await pngOf(300, 120, { r: 10, g: 10, b: 120 }),
    [HEADER]: await pngOf(320, 128, { r: 20, g: 110, b: 40 })
  }
  domain.fetchLimited = async (u) =>
    served[u]
      ? { status: 200, bytes: served[u], truncated: false }
      : { status: 404, bytes: new Uint8Array(), truncated: false }
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-logo-vision-'))
  const asked = []
  try {
    const gathered = await preSiteGatherer({
      pool: fakePicturePool(),
      config: null,
      overrides: {
        loadDomain: async () => domain,
        runtime: runtimeWith({}, settings),
        fetch: async () => assert.fail('no fetch outside the fakes'),
        paidRunAllowed: async () => true,
        objects: fakeObjects(),
        logoDir: dir,
        logoDoor,
        readingFetch: visionModel(asked)
      }
    })({ links: [SITE], description: null }, { accountId: 'acc-1' })
    return { gathered, asked }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('the vision model looks at the logo candidates, and the one it calls the bakery own logo is chosen', async () => {
  const { gathered, asked } = await gatherLogo({
    logoDoor: async () => ({ state: 'ready', door: VISION_DOOR })
  })
  assert.equal(asked.length, 2, 'each stored candidate is looked at once')
  const research = gathered.brief.brand.logoResearch
  assert.equal(research.status, 'found')
  assert.equal(research.chosen.url, HEADER)
  assert.equal(research.chosen.recognised, 'vision')
  assert.equal(gathered.brief.brand.logo, research.chosen.mediaId)
  assert.ok(gathered.logoFile)
})

test('without a vision model the page own word decides, as the step chain does', async () => {
  const { gathered, asked } = await gatherLogo({ logoDoor: async () => ({ state: 'not_configured' }) })
  assert.deepEqual(asked, [])
  const research = gathered.brief.brand.logoResearch
  assert.equal(research.chosen.url, DECLARED)
  assert.equal(research.chosen.recognised, 'words')
})

test('past the research job cap no candidate is looked at, and the page own word still decides', async () => {
  const { gathered, asked } = await gatherLogo({
    settings: { researchJobCapCents: 0 },
    logoDoor: async () => ({ state: 'ready', door: VISION_DOOR })
  })
  assert.deepEqual(asked, [])
  assert.equal(gathered.brief.brand.logoResearch.chosen.url, DECLARED)
  assert.equal(gathered.brief.brand.logoResearch.chosen.recognised, 'words')
})
