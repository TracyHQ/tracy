// A logo hint whose url was re-signed by its CDN still finds the media row its picture was deduplicated onto.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { menuVisionDoorOf } from 'website-opportunities/src/menu-photo-reading.js'
import {
  LOGO_PROMPT_VERSION,
  bindLogoHints,
  logoCandidatesOf,
  logoResearchToKeep,
  researchLogo
} from 'website-opportunities/src/place-logo.js'
import { createTracyWoHost } from '../src/wo-host.js'

const OLD_URL = 'https://cdn-a.ig.test/v/t51-19/5733_profile_n.jpg?sig=old'
const NEW_URL = 'https://cdn-b.ig.test/v/t51-19/5733_profile_n.jpg?sig=new'

// The row the first collection stored; the second collection's url downloaded the same bytes, and `keepMedia` kept
// this row (one row per sha256), so no stored row carries the new url.
const keptRow = {
  id: 'media-kept',
  sha256: 'sha-profile',
  object_key: 'places/p/sha-profile.jpg',
  status: 'stored',
  kind: 'image',
  mime: 'image/jpeg',
  source: 'instagram',
  source_url: OLD_URL,
  width: 1080,
  height: 1080,
  post_id: null,
  alt: null,
  caption: null,
  revoked_at: null
}

test('a social profile picture hint with a re-signed url finds the row its picture was deduplicated onto', () => {
  const sources = [
    {
      source: 'instagram',
      collected: {
        // The media step records which media row the hint's url became (`known` after `keepMedia`).
        media: [{ url: NEW_URL, kind: 'image', role: 'profile', mediaId: 'media-kept' }]
      }
    }
  ]
  const out = logoCandidatesOf({ media: [keptRow], sources })
  assert.deepEqual(
    out.map((c) => [c.mediaId, c.via]),
    [['media-kept', 'social-profile']]
  )
})

test('the media step binds each logo hint to the row its url became, and leaves other items alone', () => {
  const sources = [
    {
      source: 'instagram',
      collected: {
        media: [
          { url: NEW_URL, kind: 'image', role: 'profile' },
          { url: 'https://cdn-b.ig.test/post.jpg', kind: 'image', postId: 'p1' }
        ]
      }
    },
    { source: 'website', collected: { logos: [{ url: 'https://site.test/logo.svg', via: 'header-img' }] } },
    { source: 'tripadvisor', collected: { media: [{ url: NEW_URL }] } }
  ]
  const known = new Map([
    [NEW_URL, 'media-kept'],
    ['https://cdn-b.ig.test/post.jpg', 'media-post']
  ])
  const bound = bindLogoHints(sources, (url) => known.get(url))
  assert.deepEqual(bound, [
    {
      source: 'instagram',
      collected: {
        media: [
          { url: NEW_URL, kind: 'image', role: 'profile', mediaId: 'media-kept' },
          { url: 'https://cdn-b.ig.test/post.jpg', kind: 'image', postId: 'p1' }
        ]
      }
    }
  ])
  // Bound once, a second pass changes nothing.
  assert.deepEqual(
    bindLogoHints([bound[0]], (url) => known.get(url)),
    []
  )
  const out = logoCandidatesOf({ media: [keptRow], sources: bound })
  assert.deepEqual(
    out.map((c) => [c.mediaId, c.via]),
    [['media-kept', 'social-profile']]
  )
})

const heldFound = {
  version: LOGO_PROMPT_VERSION,
  at: '2026-10-26T10:00:00.000Z',
  status: 'found',
  chosen: { mediaId: 'media-kept', via: 'social-profile', recognised: 'words', readsAs: null },
  candidates: [{ mediaId: 'media-kept', sha256: 'sha-profile', via: 'social-profile' }],
  vision: { status: 'not_configured', calls: 0, promptTokens: 0, completionTokens: 0, cents: 0 }
}
const noneOfNothing = {
  version: LOGO_PROMPT_VERSION,
  at: '2026-11-09T10:00:00.000Z',
  status: 'none',
  chosen: null,
  candidates: [],
  vision: { status: 'no_candidates', calls: 0, promptTokens: 0, completionTokens: 0, cents: 0 }
}

test('a none that looked at zero candidates never replaces a found logo still in the snapshot', () => {
  assert.equal(logoResearchToKeep({ found: noneOfNothing, held: heldFound, media: [keptRow] }), heldFound)
  // The logo on record left the snapshot: the none is a finding and is stored.
  assert.equal(logoResearchToKeep({ found: noneOfNothing, held: heldFound, media: [] }), noneOfNothing)
  // A none reached by looking at candidates is a finding too.
  const lookedAt = { ...noneOfNothing, candidates: [{ mediaId: 'media-kept', via: 'social-profile' }] }
  assert.equal(logoResearchToKeep({ found: lookedAt, held: heldFound, media: [keptRow] }), lookedAt)
  assert.equal(logoResearchToKeep({ found: noneOfNothing, held: null, media: [keptRow] }), noneOfNothing)
})

test('a from-scratch run reads the logo found under a re-signed url again with vision', async () => {
  const door = menuVisionDoorOf(
    {
      state: 'ok',
      credential: { apiKey: 'k', baseUrl: 'https://api.test', model: 'deepseek-flash' },
      snapshot: {
        presetId: 'deepseek',
        metadata: { vision: true, reasoning: true, reasoningEfforts: ['low'] }
      }
    },
    createTracyWoHost()
  )
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'r',
        choices: [
          { message: { content: JSON.stringify({ kind: 'logo', showsName: true, readsAs: 'Vela' }) } }
        ],
        usage: { prompt_tokens: 900, completion_tokens: 100 }
      })
    }
  }
  const sources = [
    {
      source: 'instagram',
      collected: { media: [{ url: NEW_URL, kind: 'image', role: 'profile', mediaId: 'media-kept' }] }
    }
  ]
  const input = {
    media: [keptRow],
    sources,
    door,
    name: 'Vela',
    image: async () => ({ data: 'data:image/jpeg;base64,AA', hasAlpha: false }),
    charge: async (_spec, call) => call(),
    fetchImpl,
    now: () => Date.parse('2026-11-09T10:00:00.000Z')
  }
  const first = await researchLogo({ ...input, previous: null })
  assert.equal(first.status, 'found')
  assert.equal(calls.length, 1)
  // Read under the same model and prompt: an ordinary run reuses the reading, a from-scratch run reads it again.
  await researchLogo({ ...input, previous: first })
  assert.equal(calls.length, 1)
  const again = await researchLogo({ ...input, previous: first, force: true })
  assert.equal(calls.length, 2)
  assert.equal(again.status, 'found')
  assert.equal(again.chosen.mediaId, 'media-kept')
  assert.equal(again.chosen.readsAs, 'Vela')
})
