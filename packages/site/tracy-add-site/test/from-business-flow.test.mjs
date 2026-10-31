// Build from my business (`src/client/from-business-flow.mjs`): what the one field reads, and the page's walk from the
// research to the chat, with the doors faked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  businessQuestionOf,
  chatEntryOf,
  failureKey,
  followBusiness,
  linkOf,
  linksStart,
  looksLikeLink,
  pendingDelay,
  placeLine,
  startOutcome
} from '../src/client/from-business-flow.mjs'

test('a link is told from a name: scheme, www. or a bare domain, never a name with spaces', () => {
  for (const link of [
    'https://smiledental.example',
    'http://x.com/a',
    'www.phocorner.example',
    'phocorner.example',
    'maps.app.goo.gl/AbC'
  ])
    assert.equal(looksLikeLink(link), true, link)
  for (const name of ['Pho Corner Hanoi', 'Smile Dental, Da Nang', 'cafe', '', '  '])
    assert.equal(looksLikeLink(name), false, name)
  assert.equal(linkOf('phocorner.example'), 'https://phocorner.example')
  assert.equal(linkOf('https://phocorner.example'), 'https://phocorner.example')
})

test('the field is the questionnaire’s business question; a set without one offers nothing', () => {
  const served = {
    questions: [
      { id: 'name', kind: 'text', label: 'Business name' },
      { id: 'business', kind: 'business', label: 'Find your business', hint: 'Type its name and city.' }
    ]
  }
  assert.deepEqual(businessQuestionOf(served), {
    id: 'business',
    label: 'Find your business',
    hint: 'Type its name and city.'
  })
  assert.equal(businessQuestionOf({ questions: [{ id: 'name', kind: 'text', label: 'x' }] }), null)
  assert.equal(businessQuestionOf(null), null)
  assert.equal(
    placeLine({ address: '12 Trang Tien, Hanoi', category: 'Dentist' }),
    '12 Trang Tien, Hanoi · Dentist'
  )
})

test('the chat entry is the claimed site’s session carrying the action, and nothing else', () => {
  const prepared = {
    action: { id: 'a1' },
    chat: { siteKey: 'smile.tracy.site', sessionId: 's1', href: '/smile.tracy.site/s/s1' }
  }
  assert.equal(chatEntryOf(prepared), '/smile.tracy.site/s/s1?wo-demo-chat=a1')
  assert.equal(
    chatEntryOf({ ...prepared, chat: { ...prepared.chat, href: 'https://evil.test/smile.tracy.site/s/s1' } }),
    null
  )
  assert.equal(chatEntryOf({ ...prepared, chat: { ...prepared.chat, href: '/other/s/s1' } }), null)
  assert.equal(chatEntryOf({ chat: prepared.chat }), null)
})

test('the page follows the research, then prepares the chat once and opens it', async () => {
  const states = [
    { ok: true, body: { business: { phase: 'research' } } },
    { ok: true, body: { business: { phase: 'research' } } },
    { ok: true, body: { business: { phase: 'build', action: { id: 'a1' } } } }
  ]
  const prepared = []
  const api = {
    state: async () => states.shift(),
    prepare: async (id) => {
      prepared.push(id)
      return { ok: true, body: { action: { id }, chat: { siteKey: 'k', sessionId: 's', href: '/k/s/s' } } }
    }
  }
  const seen = []
  const opened = []
  const done = await followBusiness({
    api,
    id: 'b1',
    onState: (b) => seen.push(b.phase),
    open: (href) => opened.push(href),
    signal: new AbortController().signal,
    wait: async () => {}
  })
  assert.deepEqual(done, { opened: true })
  assert.deepEqual(seen, ['research', 'research', 'build'])
  assert.deepEqual(prepared, ['a1'])
  assert.deepEqual(opened, ['/k/s/s?wo-demo-chat=a1'])
})

test('a chat whose logo research is still pending is asked again on the next beat, never failed', async () => {
  const pending = { ok: false, body: { code: 'DEMO_LOGO_RESEARCH_PENDING' } }
  const answers = [pending, pending]
  const prepared = []
  const waits = []
  const opened = []
  // What the page says, in order: the logo line while the research is pending, gone before the chat opens.
  const said = []
  const done = await followBusiness({
    api: {
      state: async () => ({ ok: true, body: { business: { phase: 'build', action: { id: 'a1' } } } }),
      prepare: async (id) => {
        said.push(`prepare ${id}`)
        prepared.push(id)
        return (
          answers.shift() ?? {
            ok: true,
            body: { action: { id }, chat: { siteKey: 'k', sessionId: 's', href: '/k/s/s' } }
          }
        )
      }
    },
    id: 'b1',
    onState: () => {},
    onLogoWait: (waiting) => said.push(waiting ? 'logo line shown' : 'logo line gone'),
    open: (href) => {
      said.push('open')
      opened.push(href)
    },
    signal: new AbortController().signal,
    wait: async (ms) => {
      waits.push(ms)
    }
  })
  assert.deepEqual(done, { opened: true })
  assert.deepEqual(prepared, ['a1', 'a1', 'a1'])
  assert.equal(waits.length, 2)
  assert.deepEqual(opened, ['/k/s/s?wo-demo-chat=a1'])
  assert.deepEqual(said, [
    'prepare a1',
    'logo line shown',
    'prepare a1',
    'prepare a1',
    'logo line gone',
    'open'
  ])
})

test('a pending logo research is asked again on the next beat, sooner only when its retryAt deadline is nearer', async () => {
  const at = Date.parse('2026-10-24T10:00:00Z')
  const answers = [
    { ok: false, body: { code: 'DEMO_LOGO_RESEARCH_PENDING', retryAt: '2026-10-24T10:00:45.000Z' } },
    { ok: false, body: { code: 'DEMO_LOGO_RESEARCH_PENDING' } }
  ]
  const waits = []
  const done = await followBusiness({
    api: {
      state: async () => ({ ok: true, body: { business: { phase: 'build', action: { id: 'a1' } } } }),
      prepare: async (id) =>
        answers.shift() ?? {
          ok: true,
          body: { action: { id }, chat: { siteKey: 'k', sessionId: 's', href: '/k/s/s' } }
        }
    },
    id: 'b1',
    onState: () => {},
    open: () => {},
    signal: new AbortController().signal,
    now: () => at,
    wait: async (ms) => {
      waits.push(ms)
    }
  })
  assert.deepEqual(done, { opened: true })
  assert.deepEqual(waits, [4_000, 4_000])
  // The research can finish long before its deadline, so a far deadline never lengthens the beat; a near one
  // shortens it, and one already past never makes the walk spin.
  assert.equal(pendingDelay('2026-10-24T09:59:00.000Z', at), 500)
  assert.equal(pendingDelay(undefined, at), 4_000)
  assert.equal(pendingDelay('2026-10-24T11:00:00.000Z', at), 4_000)
  assert.equal(pendingDelay('2026-10-24T10:00:02.000Z', at), 2_000)
})

test('the logo line goes when the walk stops while the research is still pending', async () => {
  const controller = new AbortController()
  const said = []
  const done = await followBusiness({
    api: {
      state: async () => ({ ok: true, body: { business: { phase: 'build', action: { id: 'a1' } } } }),
      prepare: async () => ({ ok: false, body: { code: 'DEMO_LOGO_RESEARCH_PENDING' } })
    },
    id: 'b1',
    onState: () => {},
    onLogoWait: (waiting) => said.push(waiting),
    open: () => assert.fail('nothing opens'),
    signal: controller.signal,
    wait: async () => controller.abort()
  })
  assert.deepEqual(done, { failed: 'STOPPED' })
  assert.deepEqual(said, [true, false])
})

test('a chat whose photos are still being labelled is asked again, with its own line, never failed (#250)', async () => {
  const pending = {
    ok: false,
    body: { code: 'DEMO_PICTURE_LABELS_PENDING', retryAt: '2026-10-31T10:00:04.000Z' }
  }
  const answers = [pending, pending]
  const said = []
  const waits = []
  const done = await followBusiness({
    api: {
      state: async () => ({ ok: true, body: { business: { phase: 'build', action: { id: 'a1' } } } }),
      prepare: async (id) => {
        said.push('prepare')
        return (
          answers.shift() ?? {
            ok: true,
            body: { action: { id }, chat: { siteKey: 'k', sessionId: 's', href: '/k/s/s' } }
          }
        )
      }
    },
    id: 'b1',
    onState: () => {},
    onLogoWait: (waiting) => said.push(waiting ? 'logo line shown' : 'logo line gone'),
    onPicturesWait: (waiting) => said.push(waiting ? 'photos line shown' : 'photos line gone'),
    open: () => said.push('open'),
    signal: new AbortController().signal,
    now: () => Date.parse('2026-10-31T10:00:00Z'),
    wait: async (ms) => {
      waits.push(ms)
    }
  })
  assert.deepEqual(done, { opened: true })
  assert.deepEqual(waits, [4_000, 4_000])
  assert.deepEqual(said, ['prepare', 'photos line shown', 'prepare', 'prepare', 'photos line gone', 'open'])
})

test('a failed research, a refused chat and Stop each end the walk, said with their own message', async () => {
  const signal = new AbortController().signal
  const wait = async () => {}
  const failed = await followBusiness({
    api: {
      state: async () => ({ ok: true, body: { business: { phase: 'failed', code: 'RESEARCH_FAILED' } } })
    },
    id: 'b',
    onState() {},
    open() {},
    signal,
    wait
  })
  assert.deepEqual(failed, { failed: 'RESEARCH_FAILED' })
  const refused = await followBusiness({
    api: {
      state: async () => ({ ok: true, body: { business: { phase: 'build', action: { id: 'a' } } } }),
      prepare: async () => ({ ok: false, body: { code: 'DEMO_SESSION_UNAVAILABLE' } })
    },
    id: 'b',
    onState() {},
    open: () => assert.fail('opened'),
    signal,
    wait
  })
  assert.deepEqual(refused, { failed: 'DEMO_SESSION_UNAVAILABLE' })
  const stop = new AbortController()
  stop.abort()
  assert.deepEqual(
    await followBusiness({ api: {}, id: 'b', onState() {}, open() {}, signal: stop.signal, wait }),
    {
      failed: 'STOPPED'
    }
  )
  assert.equal(failureKey('DEMO_BUILD_DAILY_LIMIT'), 'own_limit')
  assert.equal(failureKey('URL_BLOCKED'), 'own_bad_link')
  assert.equal(failureKey('ANYTHING'), 'own_failed')
})

test('a press’s request id on a plain-http stand, where crypto.randomUUID is missing', async () => {
  const { newRequestId } = await import('../src/client/from-business-flow.mjs')
  assert.match(newRequestId(), /^own-[0-9a-f-]{32,36}$/)
  const real = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const webCrypto = globalThis.crypto
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: (a) => webCrypto.getRandomValues(a) },
    configurable: true
  })
  try {
    const a = newRequestId()
    assert.match(a, /^own-[0-9a-f]{32}$/)
    assert.notEqual(a, newRequestId())
  } finally {
    Object.defineProperty(globalThis, 'crypto', real)
  }
})

test('researched, the walk stops at choose with Tracy’s pick; nothing is prepared until the person chooses', async () => {
  const { reasonKey } = await import('../src/client/from-business-flow.mjs')
  const tip = {
    cms: 'joomla',
    design: 'ja-vital',
    quickstart: 'quickstart/ja-vital/j6',
    reason: 'auto:trade-match:health'
  }
  const api = {
    state: async () => ({
      ok: true,
      body: { business: { phase: 'choose', name: 'Smile', recommended: tip } }
    }),
    prepare: async () => assert.fail('prepared before the person chose')
  }
  const done = await followBusiness({
    api,
    id: 'b',
    onState() {},
    open: () => assert.fail('opened'),
    signal: new AbortController().signal,
    wait: async () => {}
  })
  assert.deepEqual(done, { choose: { phase: 'choose', name: 'Smile', recommended: tip } })
  assert.equal(reasonKey('auto:trade-match:health'), 'own_reason_trade')
  assert.equal(reasonKey('auto:restaurant-match;kind:bars'), 'own_reason_food')
  assert.equal(reasonKey('auto:business-match;cms:wordpress'), 'own_reason_business')
  assert.equal(reasonKey(undefined), 'own_reason_nearest')
})

// Local stand 24/10/2026: a bakery's research took ten minutes behind one sentence while its job counted 101 photos.
test('researchProgressOf: the source being read, the photos saved and the minutes, from the job the state door answers', async () => {
  const { researchProgressOf } = await import('../src/client/from-business-flow.mjs')
  const start = Date.parse('2026-10-24T07:00:00Z')
  const job = (progress) => ({ progress, createdAt: '2026-10-24T07:00:00Z' })
  assert.deepEqual(
    researchProgressOf(job({ collecting: 'instagram', media: { done: 45, total: 101 } }), start + 190_000),
    {
      source: 'Instagram',
      reading: false,
      photos: { done: 45, total: 101 },
      minutes: 3
    }
  )
  assert.equal(researchProgressOf(job({ collecting: 'website' }), start).source, 'website')
  // Unknown sources and empty counts show nothing rather than a raw id or "0 of 0".
  assert.deepEqual(
    researchProgressOf(job({ collecting: 'x-internal', media: { done: 0, total: 0 } }), start),
    {
      source: null,
      reading: false,
      photos: null,
      minutes: 0
    }
  )
  assert.deepEqual(researchProgressOf(null), { source: null, reading: false, photos: null, minutes: null })
})

// #251: the profile stage waited ~110 s on the business reading while the page still said "Now reading Instagram".
test('researchProgressOf: while the research reads the business it says so, and names no source left behind', async () => {
  const { researchProgressOf } = await import('../src/client/from-business-flow.mjs')
  const job = { progress: { collecting: 'instagram', media: { done: 49, total: 49 }, reading: 'business' } }
  const read = researchProgressOf(job)
  assert.equal(read.reading, true)
  assert.equal(read.source, null)
  assert.deepEqual(read.photos, { done: 49, total: 49 })
})

// Local stand 24/10/2026: a reload ten minutes into a research showed the empty form.
test('keptBusiness: a started business is kept for a day; forgetting it, a broken or throwing storage start afresh', async () => {
  const { keepBusiness, keptBusiness } = await import('../src/client/from-business-flow.mjs')
  const store = new Map()
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k)
  }
  const at = Date.parse('2026-10-24T07:00:00Z')
  keepBusiness(storage, { id: 'b1', name: 'Crumb & Co' }, at)
  assert.deepEqual(keptBusiness(storage, at + 60_000), { id: 'b1', name: 'Crumb & Co' })
  assert.equal(keptBusiness(storage, at + 25 * 60 * 60_000), null)
  keepBusiness(storage, null)
  assert.equal(keptBusiness(storage, at), null)
  store.set('tracy:from-business:v1', '{not json')
  assert.equal(keptBusiness(storage, at), null)
  const throwing = {
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('blocked')
    },
    removeItem() {}
  }
  assert.equal(keptBusiness(throwing, at), null)
  assert.doesNotThrow(() => keepBusiness(throwing, { id: 'b2', name: 'x' }, at))
})

// Local stand 26/10/2026: reopening Add site showed "Search by name" with an empty field for a business added by links.
test('keptBusiness: a business started from links keeps its links and typed name; one from a place keeps none', async () => {
  const { keepBusiness, keptBusiness } = await import('../src/client/from-business-flow.mjs')
  const store = new Map()
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k)
  }
  const at = Date.parse('2026-10-26T07:00:00Z')
  const links = ['https://share.google/x', 'https://magicpin.com/a', 'https://www.instagram.com/club']
  keepBusiness(storage, { id: 'b1', name: 'Harbour Sport Club', links, linkName: ' Harbour Sport Club ' }, at)
  assert.deepEqual(keptBusiness(storage, at), {
    id: 'b1',
    name: 'Harbour Sport Club',
    links,
    linkName: 'Harbour Sport Club'
  })
  keepBusiness(storage, { id: 'b2', name: 'Crumb & Co', links: [], linkName: 'x' }, at)
  assert.deepEqual(keptBusiness(storage, at), { id: 'b2', name: 'Crumb & Co' })
  // A stored value from elsewhere: only strings, at most five.
  store.set(
    'tracy:from-business:v1',
    JSON.stringify({ id: 'b3', name: 'n', at, links: [1, 'a', '', 'b', 'c', 'd', 'e', 'f'] })
  )
  assert.deepEqual(keptBusiness(storage, at), { id: 'b3', name: 'n', links: ['a', 'b', 'c', 'd', 'e'] })
})

// Local stand 26/10/2026: the research line read "about httpbin.org" for a business whose sources named it.
test("researchNameOf: the server's best known name, unless it is a host and the line already has a real name", async () => {
  const { researchNameOf } = await import('../src/client/from-business-flow.mjs')
  assert.equal(researchNameOf('httpbin.org', 'Harbour Sport Club'), 'Harbour Sport Club')
  assert.equal(researchNameOf('https://httpbin.org/html', 'httpbin.org'), 'httpbin.org')
  assert.equal(researchNameOf('Harbour Sport Club', 'httpbin.org'), 'Harbour Sport Club')
  assert.equal(researchNameOf('Harbour Sport Club', 'Harbour Sport Club LLC'), 'Harbour Sport Club LLC')
  assert.equal(researchNameOf('Crumb & Co', ''), 'Crumb & Co')
  assert.equal(researchNameOf('Crumb & Co', undefined), 'Crumb & Co')
})

test('startNameOf: the typed words, else the first link host without www, never empty for a link', async () => {
  const { startNameOf } = await import('../src/client/from-business-flow.mjs')
  assert.equal(startNameOf(' Harbour Sport Club ', ['https://share.google/x']), 'Harbour Sport Club')
  assert.equal(startNameOf('', ['https://www.instagram.com/club', 'https://a.example']), 'instagram.com')
  assert.equal(startNameOf('', ['httpbin.org/html']), 'httpbin.org')
  assert.equal(startNameOf('', ['not a link', 'https://magicpin.com/a']), 'magicpin.com')
  assert.equal(startNameOf('', []), '')
})

// Local stand 24/10/2026: the template choice named a template and nothing else.
test('suggestionCardOf: the suggested template’s picture, sentence and demo from the catalogue, each null when absent', async () => {
  const { suggestionCardOf } = await import('../src/client/from-business-flow.mjs')
  const body = {
    templates: [
      {
        id: 'ja-fresco',
        card: {
          blurb: 'A restaurant website.',
          image: '/api/templates/ja-fresco/card.jpg',
          layouts: [{ key: 'home', shots: { desktop: '/api/templates/ja-fresco/shots/home-d.jpg' } }]
        },
        platforms: [
          {
            platform: 'wordpress',
            tag: 'quickstart/ja-fresco/wp7',
            demo: { url: 'https://demo.example/fresco' }
          },
          { platform: 'joomla', tag: 'quickstart/ja-fresco/j6', demo: null }
        ]
      },
      { id: 'tracy', card: { blurb: '  ', image: null, layouts: [] }, platforms: [] }
    ]
  }
  const pick = (design, cms, quickstart) => ({ design, cms, quickstart })
  assert.deepEqual(suggestionCardOf(body, pick('ja-fresco', 'wordpress', 'quickstart/ja-fresco/wp7')), {
    image: '/api/templates/ja-fresco/shots/home-d.jpg',
    blurb: 'A restaurant website.',
    demo: 'https://demo.example/fresco'
  })
  assert.equal(suggestionCardOf(body, pick('ja-fresco', 'joomla', 'quickstart/ja-fresco/j6')).demo, null)
  assert.deepEqual(suggestionCardOf(body, pick('tracy', 'wordpress', 'tracy-base/wp7')), {
    image: null,
    blurb: null,
    demo: null
  })
  assert.deepEqual(suggestionCardOf(null, pick('x', 'y', 'z')), { image: null, blurb: null, demo: null })
})

test('a start from links sends the links, the words next to them and, after a pick, the place', () => {
  const links = ['https://share.google/x', 'https://instagram.com/club']
  assert.deepEqual(linksStart('own-1', { links, name: '  ' }), { requestId: 'own-1', links })
  assert.deepEqual(
    linksStart('own-2', { links, name: 'Dubai Club', place: { providerId: 'p1', name: 'Club' } }),
    {
      requestId: 'own-2',
      links,
      name: 'Dubai Club',
      place: { providerId: 'p1', name: 'Club' }
    }
  )
})

test('startOutcome: started, a Google link to pick a place for, no usable link, or a failure by its key', async () => {
  const links = [{ url: 'https://share.google/x', kind: 'google', used: true }]
  assert.deepEqual(
    startOutcome({ ok: true, status: 201, body: { business: { id: 'b1', name: 'Club' }, links } }),
    {
      started: { id: 'b1', name: 'Club' },
      links
    }
  )
  const candidates = Array.from({ length: 7 }, (_, i) => ({
    provider: 'google-places',
    providerId: `p${i}`,
    name: `P${i}`
  }))
  const ambiguous = startOutcome({
    ok: false,
    status: 409,
    body: { code: 'GOOGLE_LINK_AMBIGUOUS', candidates, links }
  })
  assert.equal(ambiguous.pick.length, 5)
  assert.deepEqual(ambiguous.links, links)
  const unusable = [{ url: 'http://10.0.0.1/', used: false, reason: 'blocked' }]
  assert.deepEqual(
    startOutcome({ ok: false, status: 422, body: { code: 'NO_USABLE_LINKS', links: unusable } }),
    {
      unusable
    }
  )
  assert.deepEqual(startOutcome({ ok: false, status: 429, body: { code: 'RATE_LIMITED' } }), {
    failed: 'own_rate'
  })
  assert.deepEqual(startOutcome({ ok: false, status: 0, body: null }), { failed: 'own_failed' })

  // The picker's flow: the first start answers 409, the pick resends the same links with the place.
  const sent = []
  const api = {
    start: async (body) => {
      sent.push(body)
      return body.place
        ? { ok: true, status: 201, body: { business: { id: 'b2', name: body.place.name } } }
        : { ok: false, status: 409, body: { code: 'GOOGLE_LINK_AMBIGUOUS', candidates } }
    }
  }
  const first = startOutcome(await api.start(linksStart('own-a', { links: ['https://share.google/x'] })))
  const second = startOutcome(
    await api.start(linksStart('own-b', { links: ['https://share.google/x'], place: first.pick[2] }))
  )
  assert.deepEqual(second, { started: { id: 'b2', name: 'P2' }, links: undefined })
  assert.deepEqual(sent[1], { requestId: 'own-b', links: ['https://share.google/x'], place: candidates[2] })
})

test('startOutcome keeps the server verdict of each link on a started business', async () => {
  const { startOutcome } = await import('../src/client/from-business-flow.mjs')
  const links = [{ url: 'https://share.google/x', kind: 'google', used: false, reason: 'unresolvable' }]
  const out = startOutcome({ ok: true, status: 201, body: { business: { id: 'b1', name: 'Club' }, links } })
  assert.deepEqual(out.links, links)
})
