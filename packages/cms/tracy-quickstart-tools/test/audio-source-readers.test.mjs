// Synthetic DOM only: exercise the stock page readers without launching a browser or making requests.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { parseHTML } from 'linkedom'
import { extractPage } from '../content-coverage/lib/browser-extract.js'
import { readDetails } from '../template-kit/lib/read-details.js'

function page() {
  const { document, window } = parseHTML(`<html><head></head><body><section data-kit-block="body-album">
    <audio id="native-0" data-audio-entity="article-7" data-audio-track="0" src="images/audio/Same.mp3?sig=A%2FB"></audio>
    <div id="player-2" class="jp-jplayer" data-audio-entity="article-7" data-audio-track="2"><audio id="internal"></audio></div>
    <audio id="other-0" data-audio-entity="article-8" data-audio-track="0" src="images/audio/Same.mp3?sig=A%2FB"></audio>
    </section></body></html>`)
  const url = 'https://site.example/sub/album'
  const source = 'https://site.example/sub/images/audio/Same.mp3?sig=A%2FB'
  const box = { left: 0, top: 0, width: 300, height: 60, right: 300, bottom: 60 }
  for (const el of document.querySelectorAll('*')) {
    el.getBoundingClientRect = () => box
    el.getClientRects = () => [box]
    el.checkVisibility = () => true
  }
  for (const el of document.querySelectorAll('audio'))
    Object.assign(el, { currentSrc: source, readyState: 1, duration: 30, error: null })
  // jPlayer's source holder has its real zero box, never the row or wrapper's larger rectangle.
  const player = document.getElementById('player-2')
  player.getBoundingClientRect = () => ({ ...box, width: 0, height: 0 })
  const state = {
    status: { src: source, media: { mp3: source } },
    htmlElement: { audio: document.getElementById('internal') }
  }
  Object.assign(window, { scrollX: 0, scrollY: 0, innerWidth: 1440, jQuery: () => ({ data: () => state }) })
  const style = new Proxy(
    {
      backgroundImage: 'none',
      backgroundColor: 'rgba(0,0,0,0)',
      content: 'none',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static'
    },
    { get: (o, k) => o[k] ?? '0px' }
  )
  const originalCreate = document.createElement.bind(document)
  document.createElement = (name) =>
    name === 'canvas' ? { getContext: () => ({ measureText: () => ({ width: 1 }) }) } : originalCreate(name)
  const ctx = vm.createContext({
    window,
    document,
    URL,
    location: { href: url },
    getComputedStyle: () => style,
    CSS: { escape: (s) => s },
    scrollY: 0
  })
  return {
    document,
    state,
    read: (fn) => JSON.parse(JSON.stringify(vm.runInContext(`(${fn.toString()})()`, ctx)))
  }
}

test('audio capability readers preserve native and initialized jPlayer owner/track occurrences without picture aliases', () => {
  const p = page()
  const detail = p.read(readDetails)['body-album']
  const sources = detail.audioSources
  assert.deepEqual(
    sources.map((a) => [a.entity, a.track, a.mechanism]),
    [
      ['article-7', '0', 'native'],
      ['article-7', '2', 'jplayer'],
      ['article-8', '0', 'native']
    ]
  )
  assert.ok(
    sources.every(
      (a) => a.value.endsWith('Same.mp3?sig=A%2FB') && a.initialized && a.metadata && a.mediaError === null
    )
  )
  const items = p.read(extractPage).items
  const media = items.filter((i) => i.kind === 'media')
  assert.equal(media.length, 3)
  assert.equal(media.find((i) => i.track === '2').rect.w, 0)
  assert.equal(media.find((i) => i.track === '2').visible, false)
  assert.ok(!items.some((i) => i.kind === 'image' && i.value.includes('.mp3')))
  assert.deepEqual(detail.pictures, [])
  p.state.status.src = 'https://site.example/sub/images/audio/Other.mp3'
  p.state.htmlElement.audio.error = { code: 4 }
  p.state.htmlElement.audio.readyState = 0
  const wrong = p.read(readDetails)['body-album'].audioSources.find((a) => a.track === '2')
  assert.equal(wrong.initialized, false)
  assert.equal(wrong.metadata, false)
  assert.equal(wrong.mediaError, 4)
  p.document.getElementById('player-2').removeAttribute('data-audio-entity')
  assert.equal(p.read(extractPage).items.find((i) => i.kind === 'media' && i.track === '2').entity, null)
})
