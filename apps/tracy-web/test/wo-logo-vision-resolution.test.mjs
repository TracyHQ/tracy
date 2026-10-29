import assert from 'node:assert/strict'
import { test } from 'node:test'
import { menuVisionDoorFor } from 'website-opportunities/src/menu-photo-reading.js'
import { researchLogo } from 'website-opportunities/src/place-logo.js'
import { sameLogoFindings } from 'website-opportunities/src/place-logo.js'
import { logoResearchSourceOf } from 'website-opportunities/src/logo-research-source.js'
import { placeDetail } from 'website-opportunities/src/wo-places-store.js'
import { nameClaimsOf, withNameDecision } from 'website-opportunities/src/business-name.js'
import { buildBrief } from 'website-opportunities/domain/brief.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const fallback = {
  url: 'https://gateway.example/v1/chat/completions',
  key: 'fixture-key',
  model: 'fictional/vision'
}
const host = (state = 'unassigned') => ({
  ...createTracyWoHost(),
  lookupDoor: async () => ({ state }),
  visionFallback: () => fallback,
  currentVisionProof: async () => {
    throw new Error('Research does not require an expiring pixel proof')
  }
})

for (const [listing, name, handle] of [
  ['Tennis & Fitness Coach', 'Harbour Sports Club', 'harbour.sportsclub'],
  ['Bakery & Cafe', 'Maple Crust Bakehouse', 'maplecrust.bakehouse']
])
  test(`environment vision reads the logo and the brief uses its name: ${name}`, async () => {
    const door = await menuVisionDoorFor({}, 'fixture', host())
    let calls = 0
    const url = 'https://images.example/profile.png'
    const sources = [
      {
        source: 'instagram',
        ref: `https://instagram.com/${handle}/`,
        collected: {
          profile: { name: handle },
          media: [{ url, role: 'profile' }]
        }
      }
    ]
    const logo = await researchLogo({
      name: listing,
      door,
      sources,
      media: [
        {
          id: 'logo',
          sha256: 'a'.repeat(64),
          object_key: 'logo.png',
          status: 'stored',
          kind: 'image',
          source: 'instagram',
          source_url: url,
          width: 1080,
          height: 1080
        }
      ],
      image: async () => ({ data: 'data:image/png;base64,AAAA', hasAlpha: true }),
      charge: async (spec, run) => {
        assert.ok(spec.maxCents > 0)
        return run()
      },
      fetchImpl: async (url, init) => {
        calls++
        assert.equal(url, fallback.url)
        assert.equal(JSON.parse(init.body).model, fallback.model)
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: 'logo',
                    showsName: true,
                    readsAs: `${name.toUpperCase()} EST. 2001`
                  })
                }
              }
            ],
            usage: { prompt_tokens: 900, completion_tokens: 100 }
          })
        }
      }
    })
    assert.equal(calls, 1)
    assert.equal(logo.vision.status, 'complete')
    assert.equal(logo.chosen.readsAs, `${name.toUpperCase()} EST. 2001`)
    const opportunity = { id: 'fictional', provider: 'google-places', candidate: { name: listing } }
    const profile = withNameDecision(
      { name: listing, nameClaims: nameClaimsOf(opportunity, sources) },
      { opportunity, brand: { logoResearch: logo } }
    )
    assert.equal(profile.name, name)
    assert.deepEqual(profile.nameCheck.options[0].sources.map((s) => s.source).sort(), ['instagram', 'logo'])
    const brief = buildBrief({
      opportunity,
      profile,
      sources: [],
      media: [],
      brand: { logoResearch: logo },
      madeAt: '2026-10-29T00:00:00Z'
    })
    assert.equal(brief.business.name, name)
  })

test('an unavailable assignment falls back; a ready assignment without catalog metadata needs no proof', async () => {
  const unavailable = await menuVisionDoorFor({}, 'fixture', host('disabled'))
  assert.equal(unavailable.state, 'ready')
  assert.equal(unavailable.door.model, fallback.model)
  const ready = await menuVisionDoorFor({}, 'fixture', {
    ...host(),
    lookupDoor: async () => ({
      state: 'ok',
      credential: {
        apiKey: 'assigned-key',
        baseUrl: 'https://assigned.example/v1',
        model: 'assigned-vision'
      },
      snapshot: {}
    })
  })
  assert.equal(ready.state, 'ready')
  assert.equal(ready.door.model, 'assigned-vision')
})

test('missing vision records a plain reason without credentials', async () => {
  const door = await menuVisionDoorFor({}, 'fixture', { ...host(), visionFallback: () => null })
  assert.equal(door.state, 'not_configured')
  assert.match(door.reason, /vision model/i)
  assert.equal(JSON.stringify(door).includes('fixture-key'), false)
  const research = await researchLogo({
    media: [
      {
        id: 'logo',
        sha256: 'a'.repeat(64),
        object_key: 'logo.png',
        status: 'stored',
        kind: 'image',
        width: 1080,
        height: 1080,
        source: 'instagram',
        source_url: 'https://images.example/profile.png'
      }
    ],
    sources: [
      {
        source: 'instagram',
        collected: { media: [{ url: 'https://images.example/profile.png', role: 'profile' }] }
      }
    ],
    door,
    image: async () => null
  })
  assert.equal(research.vision.status, 'not_configured')
  assert.equal(research.vision.reason, door.reason)
  assert.equal(logoResearchSourceOf(research).lastError.message, door.reason)
})

test('a newly recorded reason must replace an older unconfigured reading with identical candidates', () => {
  const held = {
    version: 'l3',
    status: 'none',
    chosen: null,
    candidates: [],
    vision: { status: 'not_configured' }
  }
  const fresh = { ...held, vision: { ...held.vision, reason: 'No vision model is configured.' } }
  assert.equal(sameLogoFindings(held, fresh), false)
})

test('the operator place inspector receives the recorded logo reason on its existing source table', async () => {
  const reason = 'No vision model is assigned. No environment vision model is configured.'
  const db = {
    query: async (sql) => ({
      rows: sql.includes('select * from graded')
        ? [{ id: 'fictional-place', current_snapshot_id: 'fictional-snapshot', sources: [] }]
        : sql.startsWith('select profile, brand')
          ? [
              {
                brand: {
                  logoResearch: { at: '2026-10-29T00:00:00Z', vision: { status: 'not_configured', reason } }
                }
              }
            ]
          : []
    })
  }
  const detail = await placeDetail(db, 'fictional-place', Date.parse('2026-10-29T00:00:00Z'))
  assert.deepEqual(
    detail.place.sources.map((s) => [s.source, s.status, s.lastError.message]),
    [['logo', 'not_configured', reason]]
  )
})
