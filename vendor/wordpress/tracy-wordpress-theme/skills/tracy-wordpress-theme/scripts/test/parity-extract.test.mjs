import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractRuns, norm } from '../lib/parity-extract.mjs'

const page = `<html><body>
<header><a>Home</a><p>chrome text that must never count</p></header>
<main>
  <h2>Indicative pricing</h2>
  <p>Ranges are for early budgeting, excluding VAT.</p>
  <div class="row"><span class="sc-interp">Class A warehouse, turnkey</span></div>
  <div class="row"><div>Frame, envelope, floors, services, docks</div><div>from ₽48,000/m²</div></div>
  <p><span>Split across</span> <b>two inline</b> children of one paragraph</p>
  <div>too short</div>
</main>
<footer><p>footer words are chrome as well</p></footer>
</body></html>`

test('element mode counts headings and p/li/td text only', () => {
  const { runs } = extractRuns(page, { minWords: 4 })
  assert.deepEqual(runs, [
    'Indicative pricing',
    'Ranges are for early budgeting, excluding VAT.',
    'Split across two inline children of one paragraph'
  ])
})

test('leaf mode also counts text that lives in div/span leaves, still outside chrome', () => {
  const { runs } = extractRuns(page, { minWords: 4, runs: 'leaf' })
  assert.ok(runs.includes('Class A warehouse, turnkey'))
  assert.ok(runs.includes('Frame, envelope, floors, services, docks'))
  assert.ok(runs.includes('Split across two inline children of one paragraph'))
  assert.ok(!runs.some((r) => /chrome|footer words/.test(r)))
  assert.ok(!runs.includes('too short'))
})

test('leaf mode does not duplicate a paragraph as its own span', () => {
  const { runs } = extractRuns('<body><p><span>one whole sentence in a span</span></p></body>', {
    minWords: 4,
    runs: 'leaf'
  })
  assert.deepEqual(runs, ['one whole sentence in a span'])
})

test('leaf mode reads a <br> as a space, also inside an inline child', () => {
  const { runs } = extractRuns('<body><div>Building the groundwork for<br>next-generation plants</div><div><span>one two<br>three four</span></div></body>', { minWords: 4, runs: 'leaf' })
  assert.deepEqual(runs, ['Building the groundwork for next-generation plants', 'one two three four'])
})

test('a heading with a <br> reads as one spaced run in both modes', () => {
  const html = '<body><h1>Building the groundwork for<br>next-generation plants</h1></body>'
  assert.deepEqual(extractRuns(html).runs, ['Building the groundwork for next-generation plants'])
  assert.deepEqual(extractRuns(html, { runs: 'leaf' }).runs, ['Building the groundwork for next-generation plants'])
})

test('norm keeps non-Latin letters so a Russian run can be contained', () => {
  assert.equal(norm('Промышленное строительство — с 2004 года'), 'промышленное строительство с 2004 года')
})
