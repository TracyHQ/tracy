// C09 reads neutral titles by step/tab structure, independently of the template's demo words.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'

const c09 = (html) =>
  checkDemoLeftovers({
    pages: [{ path: '/', html }],
    brief: { business: { name: 'Juniper Works' } }
  }).findings.filter((finding) => finding.kind === 'C09')

for (const [trade, title] of [
  ['bakery', 'Choose a loaf'],
  ['dentist', 'Discuss your care']
]) {
  test(`${trade}: C09 reports visible neutral step and tab titles without content-map samples`, () => {
    const html = `<body><section><ol class="steps"><li class="step"><h3>STEP</h3><p></p></li>
      <li class="step"><h3>02</h3><p></p></li></ol>
      <ul role="tablist"><li><a role="tab" href="#panel">Item</a></li></ul>
      <div id="panel" role="tabpanel"></div></section></body>`
    assert.deepEqual(
      c09(html).map((finding) => finding.found),
      ['STEP', '02', 'Item']
    )
  })

  test(`${trade}: meaningful titles, ordinary navigation, counters and hidden steps are clean`, () => {
    const html = `<body><nav><a href="/step">Step</a><a href="/item">Item</a></nav>
      <div class="stat"><h3>42</h3></div><section><ol class="steps">
      <li class="step"><h3>${title}</h3><p>Tell us what you are looking for.</p></li>
      <li class="step" hidden><h3>Step</h3></li><li class="step" style="display:none"><h3>Item</h3></li>
      </ol></section></body>`
    assert.deepEqual(c09(html), [])
  })
}

test('C09 ignores placeholder frames hidden by the build head block, including nested labels', () => {
  assert.deepEqual(
    c09(`<html><head><style data-tracy-leftovers>#journey{display:none !important}</style></head>
    <body><section id="journey"><ol class="steps"><li><h3>Step</h3></li></ol></section></body></html>`),
    []
  )
})

test('localized neutral step labels are unfinished copy too', () => {
  assert.deepEqual(
    c09('<body><ol class="steps"><li><h3>Schritt 1</h3></li><li><h3>&#233;tape 2</h3></li></ol></body>').map(
      (finding) => finding.found
    ),
    ['Schritt 1', '\u00e9tape 2']
  )
})

test('C09 ignores a frame hidden by a structural selector without an ancestor id', () => {
  assert.deepEqual(
    c09(`<head><style data-tracy-leftovers>body > section:nth-child(1) > ol.steps:nth-child(1) > li.step:nth-child(1){display:none !important}</style></head>
    <body><section><ol class="steps"><li class="step"><h3>Step</h3></li></ol></section></body>`),
    []
  )
})

test('C09 reads step title classes as well as heading tags', () => {
  assert.deepEqual(
    c09(
      '<body><div class="steps"><div class="step"><span class="step-title">Step</span></div></div></body>'
    ).map((finding) => finding.found),
    ['Step']
  )
})
