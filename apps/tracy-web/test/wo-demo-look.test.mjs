// The finished demo looked at by a vision model (`src/opportunities-build/demo-look.js`), with the host and model faked.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import {
  createDemoLook,
  DEMO_LOOK_SYSTEM,
  deferToMeasure,
  heldFaults,
  lookLayouts,
  LOOK_PROMPT_VERSION,
  reusableLookPages
} from '../src/opportunities-build/demo-look.js'

const door = async () => ({ url: 'https://vision.test/chat/completions', key: 'k', model: 'vision-x' })
const images = new Map()
async function image(width, height) {
  const key = `${width}x${height}`
  if (!images.has(key))
    images.set(
      key,
      await sharp({ create: { width, height, channels: 3, background: '#c86' } })
        .jpeg()
        .toBuffer()
    )
  return images.get(key)
}
async function fakes(answer, { height = 700, change = (frames) => frames } = {}) {
  const asked = []
  const captures = []
  const capture = async (_site, layouts, { onFrame, signal }) => {
    captures.push(layouts)
    const frames = []
    for (const layout of layouts)
      for (const [viewport, width, viewportHeight] of [
        ['desktop', 1440, 900],
        ['phone', 390, 844]
      ]) {
        const identity = { page: layout.path, key: layout.key, viewport, width, viewportHeight }
        frames.push({ type: 'view-start', ...identity, documentHeight: height })
        let covered = 0
        let index = 0
        while (covered < height) {
          const y = Math.max(0, covered - (index ? 128 : 0))
          const to = Math.min(height, y + viewportHeight)
          const bytes = await image(width, viewportHeight)
          frames.push({
            type: 'tile',
            ...identity,
            index: index++,
            y,
            height: viewportHeight,
            from: y,
            to,
            documentHeight: height,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            jpeg: bytes.toString('base64')
          })
          covered = to
        }
        frames.push({
          type: 'view-end',
          ...identity,
          complete: true,
          tiles: index,
          covered,
          documentHeight: height
        })
      }
    frames.push({ type: 'end', version: 'vision-tiles/1', complete: true })
    for (const frame of change(frames)) await onFrame(frame, signal)
    return { ok: true }
  }
  const fetchImpl = async (url, init) => {
    asked.push({ url, body: JSON.parse(init.body), bytes: Buffer.byteLength(init.body) })
    return new Response(
      JSON.stringify({
        usage: { prompt_tokens: 9000, completion_tokens: 200 },
        choices: [{ message: { content: JSON.stringify({ imageCode: 'ABC12345', ...answer }) } }]
      })
    )
  }
  return {
    capture,
    fetchImpl,
    asked,
    captures,
    challengeFor: async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })
  }
}
const labels = (call) =>
  call.body.messages[0].content
    .filter((c) => c.type === 'text')
    .slice(1)
    .map((c) => c.text)

test('every selected page and both widths are streamed through the footer, with three tiles plus one input check per model call', async () => {
  const fake = await fakes({ faults: [] }, { height: 10604 })
  const r = await createDemoLook({ ...fake, visionFor: door })({}, { pages: ['/', '/menu', '/menu'] })
  assert.equal(r.pass, true)
  assert.equal(r.looked, true)
  assert.equal(fake.captures.length, 1)
  for (const call of fake.asked) {
    assert.ok(call.body.messages[0].content[0].text.startsWith(DEMO_LOOK_SYSTEM))
    assert.ok(labels(call).length <= 4)
    assert.ok(call.bytes <= 4 * 1024 * 1024)
  }
  for (const path of ['/', '/menu'])
    for (const viewport of ['desktop', 'phone']) {
      const sent = fake.asked.flatMap(labels).filter((l) => l.startsWith(`Page ${path}, ${viewport},`))
      assert.match(sent[0], /vertical 0–/)
      const final = sent.at(-1).match(/vertical (\d+)–(\d+) of (\d+)/)
      assert.ok(Number(final[2]) >= 10604, sent.at(-1))
      assert.equal(Number(final[3]), 10604)
      assert.ok(sent.length > 3, 'no three-slice truncation')
    }
  const first = fake.asked[0].body.messages[0].content[3].image_url.url.split(',')[1]
  const meta = await sharp(Buffer.from(first, 'base64')).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 1024, 640])
})

test('only the failed tile batch is retried; successful earlier tiles are not recaptured or charged again', async () => {
  const fake = await fakes({ faults: [] }, { height: 4000 })
  let calls = 0
  const fetchImpl = async (...args) =>
    ++calls === 2 ? new Response('busy', { status: 503 }) : fake.fetchImpl(...args)
  const r = await createDemoLook({ ...fake, fetchImpl, visionFor: door })({}, {})
  assert.equal(r.pass, true)
  assert.equal(fake.captures.length, 1)
  assert.equal(calls, r.usage.calls + 1)
})

test('a later model failure retains earlier real findings but cannot pass incomplete coverage', async () => {
  const fake = await fakes(
    { faults: [{ page: '/', viewport: 'desktop', kind: 'photo', where: 'hero', fix: 'crop the source' }] },
    { height: 4000 }
  )
  let calls = 0
  const r = await createDemoLook({
    ...fake,
    visionFor: door,
    fetchImpl: (...args) => (++calls === 1 ? fake.fetchImpl(...args) : new Response('busy', { status: 503 }))
  })({}, {})
  assert.equal(r.pass, false)
  assert.equal(r.looked, 'partly')
  assert.equal(r.detail.length, 1)
  assert.equal(r.unlooked[0].why, 'VISION_FAILED')
})

for (const [name, change] of [
  ['missing terminal manifest', (frames) => frames.filter((f) => f.type !== 'end')],
  ['missing phone view', (frames) => frames.filter((f) => f.viewport !== 'phone')],
  [
    'gap between ranges',
    (frames) => frames.map((f) => (f.type === 'tile' && f.index === 1 ? { ...f, from: f.from + 1000 } : f))
  ],
  ['duplicate tile', (frames) => frames.flatMap((f) => (f.type === 'tile' && f.index === 0 ? [f, f] : [f]))],
  [
    'changed image digest',
    (frames) => frames.map((f) => (f.type === 'tile' ? { ...f, sha256: '0'.repeat(64) } : f))
  ],
  [
    'false completion',
    (frames) =>
      frames.map((f) =>
        f.type === 'view-end' ? { ...f, complete: false, reason: 'CAPTURE_LAYOUT_CHANGED' } : f
      )
  ],
  ['bad terminal version', (frames) => frames.map((f) => (f.type === 'end' ? { ...f, version: 'old' } : f))]
])
  test(`${name} never passes`, async () => {
    const fake = await fakes({ faults: [] }, { height: 2000, change })
    const r = await createDemoLook({ ...fake, visionFor: door })({}, {})
    assert.equal(r.pass, false)
    assert.notEqual(r.looked, true)
    assert.ok(r.unlooked.length)
  })

test('model faults are held to page and viewport in that batch, and overlap repeats are deduplicated', async () => {
  const fake = await fakes(
    {
      faults: [
        { page: '/', viewport: 'desktop', kind: 'photo', where: 'hero', fix: 'crop source' },
        { page: '/', viewport: 'phone', kind: 'layout', where: 'phone section', fix: 'repair width' },
        { page: '/unseen', viewport: 'desktop', kind: 'photo', where: 'x', fix: 'replace' },
        { page: '/', viewport: 'desktop', kind: 'taste', where: 'colours', fix: 'repaint' }
      ]
    },
    { height: 4000 }
  )
  const r = await createDemoLook({ ...fake, visionFor: door })({}, {})
  assert.equal(r.pass, false)
  assert.equal(r.looked, true)
  assert.deepEqual(
    r.detail.map((f) => f.kind),
    ['photo', 'layout']
  )
})

test('no model keeps needs-review policy; missing evidence and invalid JSON cannot pass', async () => {
  const fake = await fakes({})
  const none = await createDemoLook({ ...fake, visionFor: async () => null })({}, {})
  assert.deepEqual([none.pass, none.looked, none.why], [true, false, 'NO_VISION_MODEL'])
  const invalid = await createDemoLook({ ...fake, visionFor: door })({}, {})
  assert.deepEqual([invalid.pass, invalid.looked, invalid.why], [false, false, 'VISION_ANSWER_UNREADABLE'])
  const unavailable = await createDemoLook({
    ...fake,
    capture: async () => ({ ok: false, body: { code: 'VISION_STREAM_UNAVAILABLE' } }),
    visionFor: door
  })({}, {})
  assert.equal(unavailable.pass, false)
  assert.equal(unavailable.why, 'VISION_STREAM_UNAVAILABLE')
})

test('the vision charge uses research caps and accounts for actual tokens', async () => {
  const fake = await fakes({ faults: [] })
  const specs = []
  const chargeable = async (spec, fn) => {
    const result = await fn()
    specs.push({ ...spec, actual: spec.actualCents(result), measured: spec.tokens(result) })
    return result
  }
  await createDemoLook({ ...fake, visionFor: door, chargeable })({}, { accountId: 'a', buildId: 'b' })
  assert.equal(specs[0].provider, 'vision')
  assert.equal(specs[0].accountId, undefined)
  assert.ok(specs[0].maxCents > 0)
  assert.equal(specs[0].purpose, 'demo-look')
  assert.deepEqual(specs[0].payer, { kind: 'account', accountId: 'a' })
  assert.equal(specs[0].measured.prompt, 9000)
  assert.equal(specs[0].measured.completion, 200)
})

test('layout keys are capture-safe and unique; a fault names a page and viewport it was shown', () => {
  assert.deepEqual(lookLayouts(['/', 'menu', '/a', '/a']), [
    { key: 'p0', path: '/' },
    { key: 'p1', path: '/a' }
  ])
  assert.equal(lookLayouts(Array.from({ length: 30 }, (_, i) => `/p${i}`)).length, 30)
  assert.deepEqual(heldFaults({ faults: 'x' }, []), [])
})

// Local stand 24/10/2026: the real ledger refused every look's spec before it spent a cent.
test("the real cost ledger accepts the look's charge", async () => {
  const { createChargeable, createCostLedger } = await import('website-opportunities/src/cost-ledger.js')
  const { capture, fetchImpl } = await fakes({ faults: [] })
  const pool = {
    connect: async () => {
      throw new Error('ledger reached')
    }
  }
  const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 }) })
  const r = await createDemoLook({
    capture,
    visionFor: door,
    fetchImpl,
    chargeable: createChargeable(ledger)
  })({}, { accountId: 'a', buildId: 'b' })
  assert.match(r.measured, /ledger reached/, r.measured)
})

// Local round 37 (26/10/2026): the look asked for a darker photo under a dark line with a white shadow while the host's
// measure asked for a lighter one; the measure judges the words it measured over a photo.
test('a look fault about words the host measured over a photo is left to the measure; others stay', () => {
  const look = {
    id: 'looks-finished',
    pass: false,
    looked: true,
    measured: '3 visible faults',
    detail: [
      {
        kind: 'text',
        page: '/offers/',
        viewport: 'desktop',
        where:
          'Gifts & Cookie Club card, "OUR FAMOUS 6-OUNCE CHOCOLATE CHIP WALNUT COOKIE, SHIPPED NATIONWIDE"',
        fix: 'Darken the photo behind these light words'
      },
      {
        kind: 'text',
        page: '/offers/',
        where: 'Visit Us card — the phone number is cut off',
        fix: 'Give the card more height'
      },
      {
        kind: 'photo',
        page: '/blog/',
        where: "sidebar 'ONLY $5.99' promo showing a sandwich",
        fix: 'Use a cookie photo'
      }
    ]
  }
  const measuredOver = [
    {
      page: '/offers/',
      text: 'OUR FAMOUS 6-OUNCE CHOCOLATE CHIP WALNUT COOKIE, SHIPPED NATIONWIDE',
      viewports: ['desktop']
    },
    { page: '/', text: 'Visit Us', viewports: ['desktop'] }
  ]
  const judged = deferToMeasure(look, measuredOver)
  assert.deepEqual(
    judged.detail.map((f) => f.kind),
    ['text', 'photo']
  )
  assert.equal(judged.pass, false)
  assert.match(judged.measured, /1 words over a photo left to contrast-readable/)
  // all of a page's faults measured: the look passes
  const one = deferToMeasure({ ...look, detail: [look.detail[0]] }, measuredOver)
  assert.equal(one.pass, true)
  assert.equal(deferToMeasure(look, []), look)
})

test('contrast vision defers a unique measured quote with one omitted word only at its measured viewport', () => {
  const fault = {
    kind: 'text',
    page: '/',
    viewport: 'phone',
    where: "hero 'NEW YORK’S MOST FAMOUS COOKIES' over the cookie photo",
    fix: 'Tone the photo darker so these words read clearly'
  }
  const target = {
    page: '/',
    text: "NEW YORK CITY'S MOST FAMOUS COOKIES",
    viewports: ['phone'],
    selector: 'h1'
  }
  const judge = (f = fault, measured = [target]) =>
    deferToMeasure({ pass: false, looked: true, detail: [f] }, measured)
  assert.equal(judge().detail.length, 0)
  assert.equal(judge(fault, [target, { ...target, selector: 'h2' }]).detail.length, 1)
  assert.equal(judge(fault, [{ ...target, viewports: ['desktop'] }]).detail.length, 1)
  assert.equal(judge(fault, [{ ...target, viewports: undefined }]).detail.length, 1)
  for (const f of [
    { ...fault, kind: 'photo' },
    { ...fault, where: fault.where + ' is clipped over the photo' },
    { ...fault, fix: 'Darken the photo and fix the overlapping words' },
    { ...fault, where: "hero 'NEW YORK FAMOUS COOKIES' over the photo" },
    { ...fault, where: "hero 'NEW YORK’S BEST FAMOUS COOKIES' over the photo" },
    { ...fault, where: 'hero NEW YORK’S MOST FAMOUS COOKIES over the photo' }
  ])
    assert.equal(judge(f).detail.length, 1)
  for (const [text, quoted] of [
    ['Order our fresh 6 ounce cookies today', 'Order our fresh ounce cookies today'],
    ['Fresh cookies are not baked every morning', 'Fresh cookies are baked every morning']
  ])
    assert.equal(
      judge({ ...fault, where: `hero "${quoted}" over the photo` }, [{ ...target, text }]).detail.length,
      1
    )
})

// Real turn 5: the section name in a vision location is context, while the single quote identifies its body text.
test('a unique measured quote is not made ambiguous by its unquoted section heading', () => {
  const where =
    "Gifts & Specials hero card, 'FAMOUS FOR OUR 6-OUNCE CHOCOLATE CHIP WALNUT COOKIE' over the white shirt photo"
  const fault = {
    page: '/offers/',
    viewport: 'desktop',
    kind: 'text',
    where,
    fix: 'Use a calmer, darker photo behind these light words'
  }
  const measured = [
    { page: '/offers/', text: 'Gifts & Specials', viewports: ['desktop', 'phone'] },
    {
      page: '/offers/',
      text: 'FAMOUS FOR OUR 6-OUNCE CHOCOLATE CHIP WALNUT COOKIE',
      viewports: ['desktop', 'phone']
    }
  ]
  const look = { looked: true, pass: false, detail: [fault] }
  assert.equal(deferToMeasure(look, measured).pass, true)
  assert.deepEqual(deferToMeasure(look, measured).detail, [])
  assert.equal(deferToMeasure(look, [...measured, { ...measured[1] }]).pass, false)
  const wrongQuote = {
    ...look,
    detail: [
      {
        ...fault,
        where: "Gifts & Specials hero card, 'A DIFFERENT UNMEASURED SENTENCE' over the white shirt photo"
      }
    ]
  }
  assert.equal(deferToMeasure(wrongQuote, measured).pass, false)
})

test('quote identity keeps multiple, malformed, apostrophe and geometry boundaries', () => {
  const text = "NEW YORK CITY'S MOST FAMOUS COOKIES"
  const measured = [
    { page: '/', text, viewports: ['desktop'] },
    { page: '/', text: 'Gift card', viewports: ['desktop'] }
  ]
  const result = (where) =>
    deferToMeasure(
      {
        looked: true,
        pass: false,
        detail: [
          { page: '/', viewport: 'desktop', kind: 'text', where, fix: 'Improve contrast over the photo' }
        ]
      },
      measured
    )
  assert.equal(result(`Hero, '${text}' over the photo`).pass, true)
  assert.equal(result('Hero, ‘NEW YORK CITY’S MOST FAMOUS COOKIES’ over the photo').pass, true)
  assert.equal(result(`Gift card, '${text}' and 'Gift card' over the photo`).pass, false)
  assert.equal(result("Gift card, 'an unfinished quote over the photo").pass, false)
  assert.equal(result('Gift card—“A DIFFERENT UNMEASURED SENTENCE” over the photo').pass, false)
  assert.equal(result(`Hero, '${text}' clipped over the photo`).pass, false)
})

for (const faults of [
  [null],
  [{ kind: 'text' }],
  [{ page: '/', viewport: 'desktop', kind: 'text', fix: 'repair' }]
])
  test(`malformed fault verdict ${JSON.stringify(faults)} cannot become a clean pass`, async () => {
    const fake = await fakes({ faults })
    const result = await createDemoLook({ ...fake, visionFor: door })({}, {})
    assert.equal(result.pass, false)
    assert.equal(result.looked, false)
    assert.equal(result.why, 'VISION_ANSWER_UNREADABLE')
    assert.equal(fake.asked.length, 2)
  })

test('a partial phone capture retains coverage and real faults from the other three complete views', async () => {
  const fake = await fakes(
    {
      faults: [{ page: '/menu', viewport: 'desktop', kind: 'photo', where: 'menu hero', fix: 'crop source' }]
    },
    {
      change: (frames) =>
        frames
          .filter((f) => !(f.page === '/' && f.viewport === 'phone' && f.type === 'tile'))
          .map((f) => {
            if (f.page === '/' && f.viewport === 'phone' && f.type === 'view-end')
              return { ...f, complete: false, covered: 0, tiles: 0, reason: 'CAPTURE_IMAGES_PENDING' }
            return f.type === 'end' ? { ...f, complete: false } : f
          })
    }
  )
  const result = await createDemoLook({ ...fake, visionFor: door })({}, { pages: ['/', '/menu'] })
  assert.equal(result.pass, false)
  assert.equal(result.looked, 'partly')
  assert.deepEqual(result.unlooked, [{ page: '/', why: 'CAPTURE_IMAGES_PENDING', viewports: ['phone'] }])
  assert.equal(result.detail[0].page, '/menu')
  assert.match(result.measured, /on 1 of 2 pages/)
})

test('unchanged pages cannot reuse a cropped or unversioned vision verdict after contract migration', () => {
  const pages = ['/', '/menu']
  const unchanged = new Set(['/'])
  for (const version of ['look/8', 'look/7', undefined])
    assert.deepEqual(reusableLookPages({ looked: true, version }, pages, unchanged), [])
  assert.deepEqual(
    reusableLookPages({ looked: 'partly', version: LOOK_PROMPT_VERSION }, pages, unchanged),
    []
  )
  assert.deepEqual(reusableLookPages({ looked: true, version: LOOK_PROMPT_VERSION }, pages, unchanged), ['/'])
  assert.deepEqual(
    reusableLookPages({ looked: true, version: LOOK_PROMPT_VERSION }, pages, new Set(['/elsewhere'])),
    []
  )
})

test('a clean verdict without a readable image code cannot acknowledge any tiles', async () => {
  for (const imageCode of [undefined, null, 'WRONG123']) {
    const fake = await fakes({ faults: [], imageCode })
    const result = await createDemoLook({ ...fake, visionFor: door })({}, {})
    assert.equal(result.pass, false)
    assert.equal(result.looked, false)
    assert.ok(result.unlooked.every((v) => v.why === 'VISION_IMAGE_UNREADABLE'))
  }
})

test('input checks share the four-image ceiling and never expose their answer in text', async () => {
  const fake = await fakes({ faults: [] }, { height: 10604 })
  const result = await createDemoLook({ ...fake, visionFor: door })({}, {})
  assert.equal(result.pass, true)
  for (const { body, bytes } of fake.asked) {
    const content = body.messages[0].content
    assert.ok(content.filter((p) => p.type === 'image_url').length <= 4)
    assert.ok(content.filter((p) => p.type === 'text').every((p) => !p.text.includes('ABC12345')))
    assert.ok(bytes <= 4 * 1024 * 1024)
  }
})

test('a retry gets a fresh input check and its real usage is charged', async () => {
  const fake = await fakes({ faults: [] })
  let sequence = 0
  let requests = 0
  const sent = []
  const charged = []
  const result = await createDemoLook({
    ...fake,
    visionFor: door,
    challengeFor: async () => ({
      expectedCode: String(++sequence).padStart(8, '0'),
      image: `data:image/png;base64,${Buffer.from(String(sequence)).toString('base64')}`
    }),
    chargeable: async (spec, fn) => {
      const body = await fn()
      charged.push(spec.tokens(body))
      return body
    },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body)
      sent.push(body.messages[0].content[1].image_url.url)
      const imageCode = ++requests === 1 ? 'wrong' : String(sequence).padStart(8, '0')
      return new Response(
        JSON.stringify({
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          choices: [{ message: { content: JSON.stringify({ imageCode, faults: [] }) } }]
        })
      )
    }
  })({}, {})
  assert.equal(result.pass, true)
  assert.notEqual(sent[0], sent[1])
  assert.equal(charged.length, requests)
})
