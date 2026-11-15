// The demo scan of rendered pages (ticket #585): each matching rule with a case it catches and a near miss it lets
// pass, on an invented template and an invented customer.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoCorpus, demoScan } from '../ai-quickstart/rendered-scan.mjs'
import { demoWordsIn, demoPictureOf } from '../ai-quickstart/rendered-scan/match.mjs'
import {
  corpusInput,
  DEMO,
  demoPages,
  emptiedPages,
  PICTURE_BYTES,
  PICTURE_SHA
} from './fixtures/rendered-scan/rowing.mjs'

const corpus = demoCorpus(corpusInput())
const rules = (text) => demoWordsIn(text, corpus).map((h) => h.rule)
const scan = (html, extra = {}) => demoScan({ pages: [{ path: '/', status: 200, html }], corpus, ...extra })

test('a demo sentence is caught whole, in any case and spacing; a sentence sharing three words is not', () => {
  assert.deepEqual(rules(DEMO.sentence), ['sentence'])
  assert.deepEqual(rules(`  GLIDE across the still   water at first light!`), ['sentence'])
  assert.deepEqual(rules('Glide across the lake with a friend.'), [])
})

test('a demo sentence kept inside longer words is caught by shared shingles; four shared words are not', () => {
  const kept = 'Brightfen is proud: our coaches have guided rowers of every age, and we teach paddling too'
  assert.deepEqual(rules(kept), ['overlap'])
  assert.equal(
    demoWordsIn(kept, corpus)[0].excerpt,
    DEMO.long.toLowerCase().replace(/\.$/, ''),
    'the demo side'
  )
  assert.deepEqual(rules('Our team has guided rowers of every kind'), [])
})

test('a block the untouched site showed is caught by its baseline hash; a short one is not', () => {
  assert.deepEqual(rules('MORNING  sessions start at the North Pier'), ['baseline_block'])
  assert.deepEqual(rules(DEMO.shortBaseline), [])
  assert.deepEqual(rules('Evening sessions start at the south pier'), [])
})

test('short high signal strings are caught: the demo company, phone, email and address; near misses are not', () => {
  assert.deepEqual(rules(`Crew of the ${DEMO.company}`), ['signal'])
  assert.deepEqual(rules('Join Quillmere'), ['signal'])
  assert.deepEqual(rules('Join the Quillmeres'), [])
  assert.deepEqual(rules('Call 555.010.4477'), ['signal'])
  assert.deepEqual(rules('Call 555 010 9999'), [])
  assert.deepEqual(rules(`Mail ${DEMO.email}`), ['signal'])
  assert.deepEqual(rules('Mail hello@brightfen.example'), [])
  assert.deepEqual(rules('12 Larkspur Quay Port Emberly'), ['signal'])
})

test('interface words are never a hit, even when the demo content holds them', () => {
  for (const words of [
    'Read more',
    'Home',
    'Send message',
    DEMO.memberLine,
    'Follow us on every channel we use'
  ])
    assert.deepEqual(rules(words), [], words)
})

test('a demo picture is caught by its file under any base path and query; a design picture is not', () => {
  assert.equal(demoPictureOf(`/site/${DEMO.picture}?v=2`, corpus), DEMO.picture)
  assert.equal(demoPictureOf(`https://cdn.invalid/${DEMO.baselinePicture}`, corpus), DEMO.baselinePicture)
  assert.equal(demoPictureOf(`/${DEMO.designStore}`, corpus), null, 'a design field')
  assert.equal(
    demoPictureOf(`/${DEMO.designLine}`, corpus),
    null,
    'a design line, though the baseline lists it'
  )
  assert.equal(demoPictureOf('/images/brightfen/boards.jpg', corpus), null)
})

test('a picture renamed by the build is caught by its bytes when the caller gives a hash', async () => {
  const html = '<img src="/images/renamed.jpg">'
  assert.deepEqual(await scan(html), [])
  const found = await scan(html, { shaOf: async () => PICTURE_SHA })
  assert.deepEqual(
    found.map((f) => f.kind),
    ['demo_image']
  )
  assert.equal((await scan(html, { shaOf: async () => 'f'.repeat(64) })).length, 0)
  assert.ok(PICTURE_BYTES)
})

test('hidden words count: a demo sentence in a hidden element is a finding (ADR 0044, decision 2)', async () => {
  const found = await scan(`<div hidden style="display:none"><p>${DEMO.sentence}</p></div>`)
  assert.deepEqual(
    found.map((f) => [f.kind, f.place.element]),
    [['demo_text', 'p']]
  )
})

test('an untouched demo site gives many findings of both kinds; the emptied site gives none', async () => {
  const demo = await demoScan({ pages: demoPages(), corpus })
  assert.ok(demo.length >= 10, `${demo.length} findings`)
  const kinds = new Set(demo.map((f) => f.kind))
  assert.deepEqual([...kinds].sort(), ['demo_image', 'demo_text'])
  for (const f of demo) {
    assert.equal(f.page, '/')
    assert.ok([...f.excerpt].length <= 60, f.excerpt)
    assert.ok(Object.keys(f.place).every((k) => ['element', 'menu'].includes(k)))
  }
  const places = new Set(demo.map((f) => f.place.element))
  for (const p of [
    'h1',
    'img[alt]',
    'title',
    'meta[description]',
    'meta[og:image]',
    'section[style]',
    'a[href]'
  ])
    assert.ok(places.has(p), p)
  assert.deepEqual(await demoScan({ pages: emptiedPages(), corpus }), [])
})

test('a caller with a browser passes its own observations, and the HTML is not parsed', async () => {
  const observations = [{ kind: 'text', value: DEMO.sentence, place: { element: 'h2' }, visible: false }]
  const found = await demoScan({ pages: [{ path: '/x', html: '<p>nothing</p>', observations }], corpus })
  assert.deepEqual(found, [
    { kind: 'demo_text', page: '/x', place: { element: 'h2' }, excerpt: found[0].excerpt }
  ])
})

test('a page that did not answer is not read', async () => {
  assert.deepEqual(
    await demoScan({ pages: [{ path: '/', status: 404, html: `<p>${DEMO.sentence}</p>` }], corpus }),
    []
  )
})

test('an empty corpus is refused, never a silent pass', async () => {
  await assert.rejects(
    demoScan({ pages: demoPages(), kit: { blockStore: {}, mapping: {} } }),
    (e) => e.code === 'demo_corpus_empty'
  )
})
