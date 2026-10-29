// A brief build must never print neutral step labels or empty tab panels.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyFrameSelectors } from '../src/sites/brief-engines/empty-frames.js'

for (const [trade, title, body] of [
  ['bakery', 'Choose your loaf', 'Browse the breads and choose what you would like.'],
  ['dentist', 'Discuss your concerns', 'Talk through the care you are looking for.']
]) {
  test(`${trade}: neutral steps go while meaningful steps and unrelated controls stay`, () => {
    const html = `<body><nav id="menu"><a href="/item">Item</a></nav>
      <section id="journey"><h2>Your journey</h2><ol class="steps">
      <li class="step" id="blank"><h3>Step</h3><p></p></li>
      <li class="step" id="number"><h3>02</h3><p>Item</p></li>
      <li class="step" id="useful"><h3>${title}</h3><p>${body}</p></li>
      </ol><button id="next" aria-label="Next step"></button></section></body>`
    const selectors = emptyFrameSelectors(html)
    assert.ok(selectors.includes('#blank'))
    assert.ok(selectors.includes('#number'))
    assert.ok(!selectors.some((selector) => /#(?:journey|useful|menu|next)$/.test(selector)))
  })

  test(`${trade}: title-only tabs lose both control and panel`, () => {
    const html = `<body><section id="journey"><h2>Your journey</h2>
      <ul role="tablist"><li id="empty-tab"><a role="tab" href="#empty-panel">${title}</a></li>
      <li id="kept-tab"><a role="tab" href="#kept-panel">${title}</a></li></ul>
      <div id="empty-panel" role="tabpanel"><p></p></div>
      <div id="kept-panel" role="tabpanel"><p>${body}</p></div></section></body>`
    const selectors = emptyFrameSelectors(html)
    assert.ok(selectors.includes('#empty-tab'))
    assert.ok(selectors.includes('#empty-panel'))
    assert.ok(!selectors.includes('#journey'))
    assert.ok(!selectors.includes('#kept-tab'))
    assert.ok(!selectors.includes('#kept-panel'))
  })

  test(`${trade}: the section goes when all of its steps are empty placeholders`, () => {
    const html = `<body><section id="journey"><h2>Your journey</h2><ol class="steps">
      <li class="step"><h3>Step 1</h3><p>Item</p></li>
      <li class="step"><h3>2</h3><p></p></li></ol></section>
      <section id="other"><h2>${title}</h2><p>${body}</p></section></body>`
    assert.ok(emptyFrameSelectors(html).includes('#journey'))
    assert.ok(!emptyFrameSelectors(html).includes('#other'))
  })

  test(`${trade}: an all-empty tab group loses the enclosing section`, () => {
    const html = `<body><section id="journey"><h2>Your journey</h2><ul class="nav nav-tabs">
      <li><a data-toggle="tab" href="#one">Step</a></li>
      <li><a data-bs-toggle="tab" href="#two">Item</a></li></ul>
      <div id="one" class="tab-pane"><p></p></div><div id="two" class="tab-pane"></div>
      </section></body>`
    assert.ok(emptyFrameSelectors(html).includes('#journey'))
  })
}

test('an unsemantic process wrapper goes when linked tabs have no useful content', () => {
  const html = `<body><div id="journey"><h2>Your journey</h2><ul role="tablist">
    <li><a role="tab" href="#one">Step</a></li><li><a role="tab" href="#two">Item</a></li></ul>
    <div class="tab-content"><div id="one" role="tabpanel"></div><div id="two" role="tabpanel"></div></div>
    </div><nav id="menu"><a href="/step">Step</a></nav></body>`
  const selectors = emptyFrameSelectors(html)
  assert.ok(selectors.includes('#journey'))
  assert.ok(!selectors.includes('#menu'))
})

test('unrelated navigation and toolbar tabs with no panel are left alone', () => {
  assert.deepEqual(
    emptyFrameSelectors(`<body><nav id="menu"><a href="/step">Step</a></nav>
    <div role="tablist"><button role="tab" aria-controls="missing">Item</button></div>
    <ol class="pagination"><li><a href="?page=1">1</a></li><li><a href="?page=2">2</a></li></ol></body>`),
    []
  )
})

test('a declared step needs a title as well as a body; placeholder-only bodies stay empty', () => {
  const html = `<body><section id="journey"><ol class="steps">
    <li class="step" id="untitled"><p>Tell us which loaf you would like.</p></li>
    <li class="step" id="placeholder-body"><h3>Choose your loaf</h3><p>Step</p><p>Item</p></li>
    <li class="step" id="useful"><h3>Order your loaf</h3><p>Let us know what you would like.</p></li>
    </ol></section></body>`
  const selectors = emptyFrameSelectors(html)
  assert.ok(selectors.includes('#untitled'))
  assert.ok(selectors.includes('#placeholder-body'))
  assert.ok(!selectors.includes('#journey'))
  assert.ok(!selectors.includes('#useful'))
})

test('step titles carried by declared text roles receive the same empty-frame rule', () => {
  const html = `<body><section id="journey"><div class="steps">
    <div class="step" id="blank"><div class="step-title">Step</div><p></p></div>
    <div class="step" id="useful"><div class="step-title">Choose a loaf</div><p>Tell us what you would like.</p></div>
    </div></section></body>`
  const selectors = emptyFrameSelectors(html)
  assert.ok(selectors.includes('#blank'))
  assert.ok(!selectors.includes('#useful'))
  assert.ok(!selectors.includes('#journey'))
})
