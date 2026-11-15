// What the browser reader of the marker test reads (ticket #585): besides the words a page shows, what the plain word
// reader skips (what `noscript` and `template` hold, SVG words, the address of a frame, a video or its sources) and a
// structured data block that does not parse, recorded as an observation problem rather than dropped. The reader runs
// inside the page; here it reads an invented page parsed with no browser.
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { observeInPage } from '../ai-quickstart/gate/observe-in-page.mjs'

const PAGE = `<html><head><title>Petal</title>
<script type="application/ld+json">{"@type": "Florist", "name": "Petal Demo"</script>
</head><body>
<p>Fresh flowers</p>
<noscript><img src="/images/demo/bouquet.jpg" alt="A demo bouquet"><span>Enable scripts for the demo gallery</span></noscript>
<template><p>Template words of the demo</p></template>
<svg viewBox="0 0 10 10"><text x="1" y="5">Since 1998</text></svg>
<iframe src="https://maps.example/embed?q=demo+shop"></iframe>
<video src="/media/demo.mp4"><source src="/media/demo.webm"></video>
</body></html>`

test('the reader reads what noscript and template hold, SVG words, frame and media addresses, and a broken JSON-LD', () => {
  const { document } = parseHTML(PAGE)
  const { observations } = observeInPage(document)
  const at = (element) => observations.filter((o) => o.place.element === element).map((o) => o.value)
  assert.deepEqual(at('noscript img[src]'), ['/images/demo/bouquet.jpg'])
  assert.deepEqual(at('noscript img[alt]'), ['A demo bouquet'])
  assert.deepEqual(at('noscript text'), ['Enable scripts for the demo gallery'])
  assert.deepEqual(at('template text'), ['Template words of the demo'])
  assert.deepEqual(at('svg text'), ['Since 1998'])
  assert.deepEqual(at('iframe[src]'), ['https://maps.example/embed?q=demo+shop'])
  assert.deepEqual(at('video[src]'), ['/media/demo.mp4'])
  assert.deepEqual(at('source[src]'), ['/media/demo.webm'])
  for (const o of observations.filter((x) => /^(?:noscript|template)/.test(x.place.element)))
    assert.equal(o.visible, false)
  const problem = observations.find((o) => o.kind === 'problem')
  assert.equal(problem.place.element, 'script[ld+json]')
  assert.match(problem.value, /^structured data that does not parse/)
})
