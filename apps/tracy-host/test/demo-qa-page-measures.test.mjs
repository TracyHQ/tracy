// The host's `pageMeasures` answer, on invented pages: asked for with `measurePages`, one entry per kept page and width,
// and nothing changes for a caller that does not ask. The browser half is read in demo-qa-page-measures-browser.test.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoQaBody, runDemoQa } from '../src/demo-qa.js'

const BASE = 'http://127.0.0.1:5000/'
const measure = (width, extra = {}) => ({
  width,
  links: [],
  textBoxes: [],
  blocks: [],
  pictures: [],
  ...extra
})
/** A page read as the browser half returns it. */
const read =
  (measured = true) =>
  async (url, path) => ({
    path,
    url,
    status: 200,
    error: null,
    loadMs: 10,
    pending: [],
    blocked: [],
    failed: [],
    ...(measured
      ? {
          measures: [
            measure(1440, { links: [{ href: `${BASE}menu`, text: 'Menu' }] }),
            measure(390, { blocks: [{ selector: 'section.long', height: 4000 }] })
          ]
        }
      : {})
  })

test('measurePages is off unless the request says true', () => {
  assert.equal(demoQaBody({ label: 'acme', platform: 'wordpress' }).measurePages, false)
  assert.equal(demoQaBody({ label: 'acme', platform: 'wordpress', measurePages: 'yes' }).measurePages, false)
  assert.equal(demoQaBody({ label: 'acme', platform: 'wordpress', measurePages: true }).measurePages, true)
})

test('a caller that does not ask gets the answer it always got, with no pageMeasures', async () => {
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', pages: ['/', '/a'] })
  const result = await runDemoQa({
    asked,
    base: BASE,
    read: read(false),
    checkLinks: async () => assert.fail()
  })
  assert.equal('pageMeasures' in result, false)
  assert.equal('pageMeasuresSummary' in result, false)
  assert.deepEqual(result.pages, ['/', '/a'])
})

test("asked for, every page read gives one entry per width, 1440 then 390, with the links' status", async () => {
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', pages: ['/', '/a'], measurePages: true })
  const seen = []
  const result = await runDemoQa({
    asked,
    base: BASE,
    read: read(),
    checkLinks: async (entries, { deadlineAt }) => {
      seen.push(deadlineAt)
      return {
        measures: entries.map((e) => ({ ...e, links: e.links.map((l) => ({ ...l, status: 200 })) })),
        summary: { checked: 2, external: 0, overCap: 0, outOfTime: 0 }
      }
    }
  })
  assert.deepEqual(
    result.pageMeasures.map((m) => [m.path, m.width]),
    [
      ['/', 1440],
      ['/', 390],
      ['/a', 1440],
      ['/a', 390]
    ]
  )
  assert.equal(result.pageMeasures[0].links[0].status, 200)
  assert.equal(result.pageMeasures[1].blocks[0].height, 4000)
  assert.equal(result.pageMeasuresSummary.checked, 2)
  assert.ok(Number.isFinite(seen[0]), "the link phase is given the run's own limit")
})

test('the routes and the post are not measured: only the kept pages are', async () => {
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    pages: ['/'],
    routes: ['/r1'],
    routeBudgetMs: 10_000,
    measurePages: true
  })
  const asks = []
  await runDemoQa({
    asked,
    base: BASE,
    read: async (url, path, options) => {
      asks.push([path, options.measurePages])
      return read()(url, path)
    },
    checkLinks: async (entries) => ({ measures: entries, summary: {} })
  })
  assert.deepEqual(asks, [
    ['/', true],
    ['/r1', false]
  ])
})

test('without a link checker the entries still come, with no links rather than links of unknown status', async () => {
  const asked = demoQaBody({ label: 'acme', platform: 'wordpress', measurePages: true })
  const result = await runDemoQa({ asked, base: BASE, read: read() })
  assert.equal(result.pageMeasures.length, 2)
  assert.deepEqual(result.pageMeasures[0].links, [])
})

test('a page that did not open has no entry', async () => {
  const asked = demoQaBody({
    label: 'acme',
    platform: 'wordpress',
    pages: ['/', '/gone'],
    measurePages: true
  })
  const result = await runDemoQa({
    asked,
    base: BASE,
    read: async (url, path) =>
      path === '/gone'
        ? { path, url, status: 404, error: null, loadMs: 5, pending: [], blocked: [], failed: [] }
        : read()(url, path)
  })
  assert.deepEqual([...new Set(result.pageMeasures.map((m) => m.path))], ['/'])
})

// Run the actual serialized page function against a synthetic DOM; no browser or media request.
async function audioPage() {
  const { parseHTML } = await import('linkedom')
  const { default: vm } = await import('node:vm')
  const { measurePageInPage, MEASURE_CAPS } = await import('../src/demo-qa-page-measures.js')
  const { document, window } = parseHTML(`<html><head><base href="https://site.example/sub/"></head><body>
    <div class="audio-player-wrap" data-audio-entity="article-7">
      <div id="player" class="jp-jplayer" data-audio-entity="article-7" data-audio-track="2"><audio></audio></div>
      <div class="jp-audio" data-audio-entity="article-7" data-audio-track="2"></div>
    </div><audio id="native" data-audio-entity="article-8" data-audio-track="0" src="images/Same.mp3?sig=A%2FB"></audio>
    </body></html>`)
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 60, width: 320, height: 60 }
  for (const el of document.querySelectorAll('*')) {
    el.getBoundingClientRect = () => rect
    el.checkVisibility = () => true
  }
  const source = 'https://site.example/sub/images/Same.mp3?sig=A%2FB'
  Object.defineProperty(document, 'baseURI', { value: 'https://site.example/sub/' })
  const player = document.getElementById('player')
  player.getBoundingClientRect = () => ({ ...rect, width: 0, height: 0 })
  for (const audio of document.querySelectorAll('audio'))
    Object.assign(audio, { currentSrc: source, readyState: 1, duration: 42, error: null })
  const state = {
    status: { src: source, media: { mp3: source } },
    htmlElement: { audio: player.querySelector('audio') }
  }
  window.jQuery = () => ({ data: () => state })
  const style = new Proxy(
    {
      display: 'block',
      position: 'static',
      opacity: '1',
      visibility: 'visible',
      backgroundImage: 'none',
      content: 'none'
    },
    { get: (o, k) => o[k] ?? '0px' }
  )
  const context = vm.createContext({
    document,
    window,
    URL,
    innerWidth: 1440,
    innerHeight: 900,
    location: { href: 'https://site.example/sub/index.php/album' },
    NodeFilter: { SHOW_TEXT: 4 },
    getComputedStyle: () => style
  })
  return {
    document,
    state,
    read: (cap = MEASURE_CAPS.audio) =>
      JSON.parse(
        JSON.stringify(
          vm.runInContext(
            `(${measurePageInPage.toString()})(${JSON.stringify({ tolerance: 2, stretch: 0.05, caps: { ...MEASURE_CAPS, audio: cap } })})`,
            context
          )
        )
      )
  }
}

test('audio postwrite host measures preserve exact owner tracks, own zero box and distinct row/list census', async () => {
  const p = await audioPage()
  const m = p.read()
  assert.deepEqual(
    m.audioSources.map((a) => [a.entity, a.track, a.mechanism]),
    [
      ['article-7', '2', 'jplayer'],
      ['article-8', '0', 'native']
    ]
  )
  assert.equal(m.audioSources[0].rect.width, 0)
  assert.equal(m.audioRows[0].rect.width, 320)
  assert.equal(m.audioSources[0].initialized, true)
  assert.equal(m.audioSources[0].duration, 42)
  assert.equal(m.audioSources[0].mediaError, null)
  assert.equal(m.audioSources[0].source, m.audioSources[1].source)
  assert.equal(m.audioLists.length, 1)
  assert.equal(m.sourceBase, 'https://site.example/sub/')
  assert.equal(m.audioTruncated, false)
  assert.equal(m.audioUnbound, 0)
  p.state.status.src = 'https://site.example/sub/images/Other.mp3'
  p.state.htmlElement.audio.error = { code: 4 }
  p.state.htmlElement.audio.duration = NaN
  const bad = p.read().audioSources[0]
  assert.equal(bad.initialized, false)
  assert.equal(bad.duration, null)
  assert.equal(bad.mediaError, 4)
  assert.equal(p.read(1).audioTruncated, true)
  p.document.querySelector('.jp-audio').removeAttribute('data-audio-entity')
  assert.equal(p.read().audioUnbound, 1)
})

test('audio postwrite host census retains hidden rows and all-empty lists rather than treating them as absent', async () => {
  const p = await audioPage()
  const row = p.document.querySelector('.jp-audio')
  row.checkVisibility = () => false
  p.document.getElementById('player').remove()
  const hidden = p.read()
  assert.equal(hidden.audioSources.length, 1)
  assert.equal(hidden.audioRows.find((a) => a.entity === 'article-7').visible, false)
  assert.equal(hidden.audioLists.length, 1)
  row.remove()
  p.document.querySelector('.audio-player-wrap').remove()
  const absent = p.read()
  assert.ok(!absent.audioRows.some((a) => a.entity === 'article-7'))
  assert.ok(!absent.audioLists.some((a) => a.entity === 'article-7'))
})
