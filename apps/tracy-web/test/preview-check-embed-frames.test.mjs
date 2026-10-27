/**
 * The live frame reads each provider frame where it runs (`scripts/preview-check/embed-frames.mjs`, probe 10): a
 * YouTube frame playing its video is no embed-error, one showing "This video is unavailable" still is. JA Spa
 * 1.0.7's /our-spa video plays on every customer site and failed PREV-1 only because the probe served the stand at
 * a bare IP (18/10/2026). The two frames here are served from another site than the page (localhost under a page
 * at 127.0.0.1), so Chrome runs them out of the page's process, as it runs YouTube's.
 * Runs a real headless Chrome; skipped when no Chrome is on this machine.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'

import { browser } from '../../../packages/design/tracy-ds-slot/scripts/cdp.mjs'
import {
  CONTENT_MARK,
  FRAME_STATE,
  frameStatesOf,
  markShowingEmbeds
} from '../scripts/preview-check/embed-frames.mjs'
import { detect, probe } from '../scripts/preview-detectors/embed-error.mjs'

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const opts = { skip: existsSync(CHROME) ? false : 'no Chrome on this machine', timeout: 120_000 }

// the two player pages as YouTube's embed draws them: the player, and the player with its error on screen
const PLAYS =
  '<!doctype html><div id="movie_player" class="html5-video-player" style="height:300px">Medical Beauty Spa</div>'
const FAILS =
  '<!doctype html><div id="movie_player" class="html5-video-player"><div class="ytp-error" style="height:300px">This video is unavailable</div></div>'
// the Google Maps embed as it draws itself (20/10/2026, JA Restaurant 1.0.6's contact map): the map with its tiles
// drawn, the map container before any tile (still loading), and Google's error box
const TILE = `<img width="256" height="256" alt="" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e8e4d8"/></svg>')}">`
const MAP = `<!doctype html><div class="gm-style" style="height:300px">${TILE}<div>Keyboard shortcuts</div><div>Map data ©2026 Google</div></div>`
const MAP_LOADING = '<!doctype html><div class="gm-style" style="height:300px"></div>'
// a map still loading whose tile layer is a canvas not yet painted: a blank 256x256 canvas proves nothing is drawn
const MAP_BLANK_CANVAS =
  '<!doctype html><div class="gm-style" style="height:300px"><canvas width="256" height="256" style="width:256px;height:256px"></canvas></div>'
const MAP_FAILS =
  '<!doctype html><div class="gm-style" style="height:300px"><div class="gm-err-container" style="height:300px">Oops! Something went wrong.</div></div>'

let page
let frames
let chrome
let address
before(async () => {
  if (opts.skip) return
  frames = createServer((req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        req.url?.startsWith('/embed/fails')
          ? FAILS
          : req.url?.startsWith('/map/fails')
            ? MAP_FAILS
            : req.url?.startsWith('/map/loading')
              ? MAP_LOADING
              : req.url?.startsWith('/map/canvas')
                ? MAP_BLANK_CANVAS
                : req.url?.startsWith('/map')
                  ? MAP
                  : PLAYS
      )
  )
  await new Promise((ok) => frames.listen(0, '127.0.0.1', () => ok(null)))
  const at = `http://localhost:${frames.address().port}`
  page = createServer((req, res) =>
    res
      .writeHead(200, { 'content-type': 'text/html' })
      .end(
        `<!doctype html><section class="section"><h2>Our spa</h2><iframe width="800" height="450" src="${at}/embed/plays"></iframe></section><section class="section"><h2>Other</h2><iframe width="800" height="450" src="${at}/embed/fails"></iframe></section>`
      )
  )
  await new Promise((ok) => page.listen(0, '127.0.0.1', () => ok(null)))
  address = `http://127.0.0.1:${page.address().port}/`
  chrome = await browser(9560 + Math.floor(Math.random() * 20))
})
after(() => {
  chrome?.close()
  page?.close()
  frames?.close()
})

test(
  'a frame playing its video is marked and left out of embed-error; one showing its error stays',
  opts,
  async () => {
    await chrome.open(address, 1440, {})
    const r = await markShowingEmbeds(chrome, { waitMs: 5000 })
    assert.deepEqual(r, { content: 1, error: 1 })
    const marks = await chrome.evaluate(
      `[...document.querySelectorAll('iframe')].map((f) => f.getAttribute(${JSON.stringify(CONTENT_MARK)}))`
    )
    assert.deepEqual(marks, ['content', null])
    const data = await chrome.evaluate(probe)
    const found = detect({ worn: { data }, plain: { data } })
    assert.equal(found.count, 1)
    assert.equal(found.findings[0].heading, 'Other')
  }
)

test('a page with no frame of another site marks nothing and does not wait', opts, async () => {
  await chrome.open(`${address}?none`, 1440, {})
  await chrome.evaluate(`document.querySelectorAll('iframe').forEach((f) => f.remove())`)
  const t = Date.now()
  assert.deepEqual(await markShowingEmbeds(chrome, { waitMs: 5000 }), { content: 0, error: 0 })
  assert.ok(Date.now() - t < 3000)
})

test(
  'a Google Maps frame showing its map reads as content, one showing its error box as an error',
  opts,
  async () => {
    const at = `http://localhost:${frames.address().port}`
    await chrome.open(`${at}/map`, 1440, {})
    assert.equal(await chrome.evaluate(FRAME_STATE), 'content')
    await chrome.open(`${at}/map/fails`, 1440, {})
    assert.equal(await chrome.evaluate(FRAME_STATE), 'error')
    // the map container with no tile drawn yet is not a map that shows: undecided, so it stays a finding
    await chrome.open(`${at}/map/loading`, 1440, {})
    assert.equal(await chrome.evaluate(FRAME_STATE), null)
    // a visible canvas is no evidence: it may be blank, so only a loaded tile picture counts
    await chrome.open(`${at}/map/canvas`, 1440, {})
    assert.equal(await chrome.evaluate(FRAME_STATE), null)
    await chrome.open(`${at}/other`, 1440, {})
    await chrome.evaluate(`document.body.innerHTML = '<p>A widget the probe cannot tell apart</p>'`)
    assert.equal(await chrome.evaluate(FRAME_STATE), null)
  }
)

test('Google Maps frames are one group, its src and the address it lands on differing in path', () => {
  const src = 'https://www.google.com/maps?q=4+5th+Avenue&output=embed'
  const landed = 'https://www.google.com/maps/embed?origin=mfe&pb=!1m2'
  // the address the frame lands on is the group's, whatever path the page's src spells
  assert.deepEqual(
    [...frameStatesOf([{ url: landed, value: 'content' }], { mapsIframes: 1 })],
    [['google-maps', 'content']]
  )
  assert.deepEqual(
    [...frameStatesOf([{ url: src, value: 'content' }], { mapsIframes: 1 })],
    [['google-maps', 'content']]
  )
  // one Maps frame in error, or one still undecided, keeps every Maps embed a finding
  assert.deepEqual(
    [
      ...frameStatesOf(
        [
          { url: landed, value: 'content' },
          { url: 'https://maps.google.co.uk/maps/embed?pb=2', value: 'error' }
        ],
        { mapsIframes: 2 }
      )
    ],
    [['google-maps', 'error']]
  )
  assert.deepEqual(
    [
      ...frameStatesOf(
        [
          { url: landed, value: 'content' },
          { url: landed, value: null }
        ],
        { mapsIframes: 2 }
      )
    ],
    []
  )
  // two Maps iframes on the page and only one frame answered (the other not readable): neither is marked
  assert.deepEqual([...frameStatesOf([{ url: landed, value: 'content' }], { mapsIframes: 2 })], [])
  // the page's Maps iframes not counted: never content
  assert.deepEqual([...frameStatesOf([{ url: landed, value: 'content' }])], [])
  // another provider and a Google page off /maps keep their own keys, as before
  assert.deepEqual(
    [
      ...frameStatesOf([
        { url: 'https://www.youtube.com/embed/abc', value: 'content' },
        { url: 'https://www.google.com/recaptcha/api2/anchor', value: null }
      ])
    ],
    [['https://www.youtube.com/embed/abc', 'content']]
  )
})
