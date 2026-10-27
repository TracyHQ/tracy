import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BudgetExceededError } from 'website-opportunities/src/cost-ledger.js'
import { menuVisionDoorOf } from 'website-opportunities/src/menu-photo-reading.js'
import {
  LOGO_VISION_MAX,
  chooseLogo,
  classifyLogos,
  logoCandidatesOf,
  parseLogoAnswer,
  researchLogo
} from 'website-opportunities/src/place-logo.js'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const AT = Date.parse('2026-10-23T10:00:00.000Z')
const ready = menuVisionDoorOf(
  {
    state: 'ok',
    credential: { apiKey: 'k', baseUrl: 'https://api.test', model: 'deepseek-flash' },
    snapshot: { presetId: 'deepseek', metadata: { vision: true, reasoning: true, reasoningEfforts: ['low'] } }
  },
  woHost
)

const row = (n, extra = {}) => ({
  id: `m${n}`,
  sha256: `sha${n}`,
  object_key: `places/p/sha${n}.png`,
  status: 'stored',
  kind: 'image',
  mime: 'image/png',
  source: 'website',
  source_url: `https://site.test/img/${n}.png`,
  width: 300,
  height: 300,
  post_id: null,
  alt: null,
  caption: null,
  revoked_at: null,
  ...extra
})
const sourceRow = (source, collected) => ({ source, collected })

test('every kind of source gives candidates, and none of them is cut by the 480 px rule', () => {
  const media = [
    row(1, { source: 'instagram', source_url: 'https://cdn.ig/pp.jpg', width: 320, height: 320 }),
    row(2, { source_url: 'https://site.test/brand/ld.png', width: 90, height: 40 }),
    row(3, { source_url: 'https://site.test/img/header.png', width: 200, height: 60 }),
    row(4, { source_url: 'https://site.test/img/touch.png', width: 180, height: 180 }),
    row(5, { source_url: 'https://site.test/uploads/Fu-Lin-Logo-2.png', width: 435, height: 129 }),
    row(6, { source_url: 'https://site.test/img/dish.jpg', width: 3000, height: 2000 }),
    row(7, {
      source: 'google-maps',
      source_url: 'https://lh3.test/visitor-logo.jpg',
      width: 800,
      height: 800
    })
  ]
  const sources = [
    sourceRow('website', {
      logos: [
        { url: 'https://site.test/brand/ld.png', via: 'jsonld-logo' },
        { url: 'https://site.test/img/header.png', via: 'header-img' },
        { url: 'https://site.test/img/touch.png', via: 'apple-touch-icon' }
      ]
    }),
    sourceRow('instagram', {
      media: [{ url: 'https://cdn.ig/pp.jpg', role: 'profile', sourceUrl: 'https://instagram.com/x' }]
    })
  ]
  const out = logoCandidatesOf({ media, sources })
  assert.deepEqual(
    out.map((c) => [c.mediaId, c.via]),
    [
      ['m1', 'social-profile'],
      ['m2', 'jsonld-logo'],
      ['m3', 'header-img'],
      ['m5', 'img-named'],
      ['m4', 'apple-touch-icon']
    ]
  )
  assert.equal(out[1].width, 90)
  assert.equal(out[0].source, 'instagram')
})

test('a picture too small to read, a duplicate and a visitor photo are not candidates', () => {
  const media = [
    row(1, { source_url: 'https://site.test/logo.png', width: 12, height: 12 }),
    row(2, { source_url: 'https://site.test/logo-a.png', sha256: 'same' }),
    row(3, { source_url: 'https://site.test/logo-b.png', sha256: 'same' }),
    row(4, { status: 'reference', object_key: null, source_url: 'https://site.test/logo-c.svg' }),
    row(5, { revoked_at: '2026-10-01T00:00:00Z', source_url: 'https://site.test/logo-d.png' })
  ]
  const out = logoCandidatesOf({ media, sources: [] })
  assert.deepEqual(
    out.map((c) => c.mediaId),
    ['m2']
  )
})

test('a profile photo collected before pictures were marked is found as the first picture of the social page', () => {
  const media = [
    row(1, { source: 'facebook', source_url: 'https://fb.test/pp.jpg' }),
    row(2, { source: 'facebook', source_url: 'https://fb.test/post.jpg', post_id: 'p1' })
  ]
  const sources = [
    sourceRow('facebook', {
      media: [
        { url: 'https://fb.test/pp.jpg', sourceUrl: 'https://facebook.com/x' },
        { url: 'https://fb.test/post.jpg', sourceUrl: 'https://facebook.com/x/posts/p1', postId: 'p1' }
      ]
    })
  ]
  const out = logoCandidatesOf({ media, sources })
  assert.deepEqual(
    out.map((c) => [c.mediaId, c.via, c.guess]),
    [['m1', 'social-profile', true]]
  )
})

test('the answer of the model is read strictly: not a JSON object with a boolean verdict is no answer', () => {
  assert.deepEqual(parseLogoAnswer('{"showsName":true,"readsAs":"Cafe K","kind":"logo"}'), {
    isLogo: true,
    showsName: true,
    readsAs: 'Cafe K',
    kind: 'logo'
  })
  assert.equal(parseLogoAnswer('{"isLogo":true}'), null)
  assert.equal(parseLogoAnswer('nope'), null)
  assert.equal(parseLogoAnswer('{"kind":"weird"}'), null)
  assert.equal(parseLogoAnswer('{"kind":"other-brand"}').isLogo, false)
})

const candidate = (n, via, extra = {}) => ({
  mediaId: `m${n}`,
  sha256: `sha${n}`,
  objectKey: `k${n}`,
  url: `https://s.test/${n}.png`,
  via,
  source: 'website',
  width: 300,
  height: 300,
  hasAlpha: false,
  ...extra
})
const reading = (isLogo, extra = {}) => ({
  isLogo,
  showsName: false,
  readsAs: null,
  kind: isLogo ? 'logo' : 'photo',
  ...extra
})

test('the best logo is the vision-confirmed one, then the larger, then the transparent', () => {
  const list = [
    candidate(1, 'social-profile', { reading: reading(false) }),
    candidate(2, 'header-img', { reading: reading(true), width: 200, height: 60 }),
    candidate(3, 'img-named', { reading: reading(true), width: 435, height: 129 }),
    candidate(4, 'icon', { reading: reading(true), width: 435, height: 129, hasAlpha: true })
  ]
  const out = chooseLogo(list)
  assert.equal(out.status, 'found')
  assert.equal(out.chosen.mediaId, 'm4')
  assert.equal(out.chosen.recognised, 'vision')
  assert.equal(chooseLogo(list.slice(0, 3)).chosen.mediaId, 'm3')
})

test('with no model look, only a candidate its own page calls a logo is chosen, and says so', () => {
  const out = chooseLogo([candidate(1, 'icon'), candidate(2, 'og-image'), candidate(3, 'jsonld-logo')])
  assert.equal(out.chosen.mediaId, 'm3')
  assert.equal(out.chosen.recognised, 'words')
  const weak = chooseLogo([candidate(1, 'icon'), candidate(2, 'header-img')])
  assert.equal(weak.status, 'none')
  assert.equal(weak.chosen, null)
})

test('a logo naming the place wins over a larger sister brand, read or unread', () => {
  // q. patisserie, local round 24, 25/10/2026: its site also shows the "q. on the go" mark, larger.
  const site = 'https://qpatisserie.example/wp-content/themes/q-patisserie-v115/images'
  const sister = { url: `${site}/q-on-the-go-logo.png`, width: 501, height: 161, hasAlpha: true }
  const own = { url: `${site}/q-patisserie.png`, width: 341, height: 105, hasAlpha: true }
  const unread = [candidate(1, 'img-named', sister), candidate(2, 'img-named', own)]
  assert.equal(chooseLogo(unread, { name: 'q. patisserie' }).chosen.mediaId, 'm2')
  assert.equal(chooseLogo(unread).chosen.mediaId, 'm1', 'with no name the larger one stays first')
  const read = [
    candidate(1, 'img-named', { ...sister, reading: reading(true, { readsAs: 'b. on the go' }) }),
    candidate(2, 'header-img', {
      url: 'https://s.test/mark.png',
      width: 120,
      height: 120,
      reading: reading(true, { readsAs: 'q. patisserie' })
    })
  ]
  assert.equal(chooseLogo(read, { name: 'b. Pâtisserie' }).chosen.mediaId, 'm2')
})

test('when the model looked at every candidate and none is a logo, there is no logo, whatever the words said', () => {
  const out = chooseLogo([
    candidate(1, 'jsonld-logo', { reading: reading(false) }),
    candidate(2, 'social-profile', { reading: reading(false) })
  ])
  assert.equal(out.status, 'none')
})

function harness({ responses, chargeImpl } = {}) {
  const calls = []
  const specs = []
  const queue = [...(responses ?? [])]
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  const charge = async (spec, call) => {
    specs.push(spec)
    if (chargeImpl) await chargeImpl(spec, specs.length)
    return call()
  }
  const image = async (c) => ({ data: `data:image/jpeg;base64,${c.mediaId}`, hasAlpha: c.mediaId === 'm1' })
  return { calls, specs, input: { fetchImpl, charge, image, now: () => AT } }
}
const reply = (obj, usage = { prompt_tokens: 900, completion_tokens: 1500 }) => ({
  ok: true,
  status: 200,
  json: async () => ({ id: 'r', choices: [{ message: { content: JSON.stringify(obj) } }], usage })
})

test('no vision model assigned: nothing is called or charged and the state says not configured', async () => {
  const h = harness({ responses: [reply({ kind: 'logo' })] })
  const out = await classifyLogos({
    ...h.input,
    candidates: [candidate(1, 'jsonld-logo')],
    door: menuVisionDoorOf({ state: 'unassigned' }, woHost),
    name: 'Bistro'
  })
  assert.equal(out.vision.status, 'not_configured')
  assert.equal(h.calls.length, 0)
  assert.equal(h.specs.length, 0)
  assert.equal(out.candidates[0].reading, undefined)
  assert.equal(out.candidates[0].hasAlpha, true)
})

test('each candidate is one reserved call on the ledger, at most the cap, and each is settled at its tokens', async () => {
  const many = Array.from({ length: LOGO_VISION_MAX + 3 }, (_, i) => candidate(i + 1, 'img-named'))
  const h = harness({
    responses: [reply({ showsName: true, readsAs: 'Bistro', kind: 'logo' })]
  })
  const out = await classifyLogos({ ...h.input, candidates: many, door: ready, name: 'Bistro' })
  assert.equal(h.calls.length, LOGO_VISION_MAX)
  assert.equal(h.specs.length, LOGO_VISION_MAX)
  assert.ok(h.specs.every((s) => s.maxCents > 0 && typeof s.actualCents === 'function'))
  assert.equal(h.calls[0].body.model, 'deepseek-flash')
  assert.match(
    h.calls[0].body.messages[1].content[0].text,
    /"Bistro".*website whose name or alt text says logo/
  )
  assert.equal(out.vision.status, 'complete')
  assert.equal(out.vision.calls, LOGO_VISION_MAX)
  assert.equal(out.vision.promptTokens, 900 * LOGO_VISION_MAX)
  assert.equal(out.candidates[0].reading.isLogo, true)
  assert.equal(out.candidates[LOGO_VISION_MAX].reading, undefined)
  assert.equal(out.candidates[0].hasAlpha, true)
})

test('a candidate already read under the same model and prompt is not read again, unless forced', async () => {
  const h = harness({ responses: [reply({ kind: 'photo' })] })
  const first = await classifyLogos({
    ...h.input,
    candidates: [candidate(1, 'img-named')],
    door: ready,
    name: 'B'
  })
  assert.equal(h.calls.length, 1)
  const again = await classifyLogos({
    ...h.input,
    candidates: [candidate(1, 'img-named')],
    previous: first.candidates,
    door: ready,
    name: 'B'
  })
  assert.equal(h.calls.length, 1)
  assert.equal(again.candidates[0].reading.isLogo, false)
  await classifyLogos({
    ...h.input,
    candidates: [candidate(1, 'img-named')],
    previous: first.candidates,
    force: true,
    door: ready,
    name: 'B'
  })
  assert.equal(h.calls.length, 2)
})

test('an unusable answer or a model failure leaves that candidate unread and the state partial; over budget stops the rest', async () => {
  const bad = harness({
    responses: [
      {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'sorry' } }],
          usage: { prompt_tokens: 5, completion_tokens: 5 }
        })
      }
    ]
  })
  const out = await classifyLogos({
    ...bad.input,
    candidates: [candidate(1, 'img-named')],
    door: ready,
    name: 'B'
  })
  assert.equal(out.vision.status, 'partial')
  assert.equal(out.candidates[0].reading, undefined)
  const over = harness({
    responses: [reply({ kind: 'logo' })],
    chargeImpl: async (_s, n) => {
      if (n === 2) throw new BudgetExceededError('cap')
    }
  })
  const stopped = await classifyLogos({
    ...over.input,
    candidates: [candidate(1, 'a'), candidate(2, 'b'), candidate(3, 'c')],
    door: ready,
    name: 'B'
  })
  assert.equal(stopped.vision.status, 'budget')
  assert.equal(over.specs.length, 2)
  assert.equal(stopped.candidates[0].reading.isLogo, true)
})

test('researchLogo keeps the candidates, the chosen one and an explicit none when nothing is a logo', async () => {
  const h = harness({ responses: [reply({ kind: 'service-icon' })] })
  const none = await researchLogo({
    ...h.input,
    media: [row(1, { source_url: 'https://site.test/logo.png' })],
    sources: [],
    previous: null,
    door: ready,
    name: 'B'
  })
  assert.equal(none.status, 'none')
  assert.equal(none.chosen, null)
  assert.equal(none.candidates.length, 1)
  assert.equal(none.candidates[0].objectKey, undefined)
  const empty = await researchLogo({
    ...h.input,
    media: [],
    sources: [],
    previous: null,
    door: ready,
    name: 'B'
  })
  assert.equal(empty.status, 'none')
  assert.equal(empty.vision.status, 'no_candidates')
  const h2 = harness({ responses: [reply({ showsName: true, readsAs: 'B', kind: 'logo' })] })
  const found = await researchLogo({
    ...h2.input,
    media: [row(1, { source_url: 'https://site.test/logo.png' })],
    sources: [],
    previous: null,
    door: ready,
    name: 'B'
  })
  assert.equal(found.status, 'found')
  assert.equal(found.chosen.mediaId, 'm1')
  assert.equal(found.chosen.recognised, 'vision')
  assert.equal(found.chosen.readsAs, 'B')
})
