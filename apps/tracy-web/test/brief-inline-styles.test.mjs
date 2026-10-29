/**
 * Replace the words, never the style (spec TracyHQ/tracy#189): a Joomla brief build keeps the demo's inline tags of a heading
 * (an accent span, a strong word, a line break) around the new words. The contract writes the plain words; a records step
 * puts the demo's tags back at the same path; a JA ACM marker field takes its markers through the contract. Fictional
 * templates of two trades (a bakery, a dental clinic); the module rows are made up.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { demoMarkupOf, withInlineStyles } from '../src/sites/brief-engines/inline-styles.js'
import {
  inlineStyleSteps,
  lostInlineStyles,
  styleChanges,
  takeStyleMarks
} from '../src/sites/brief-engines/joomla-inline-styles.js'
import { keepBoundNodes } from '../src/sites/brief-engines/joomla-bound-nodes.js'

/** A bakery template: a T4 section title in module parameters (a whole unit), and an ACM hero title with markers. */
const bakeryRows = {
  'module-301': {
    params: JSON.stringify({
      'main-section': 'OUR<br/>\r\n<span class="accent">BREADS</span>',
      'top-desc': 'Since 1990'
    })
  },
  'module-302': {
    params: JSON.stringify({
      'jatools-config': JSON.stringify({
        ':type': 'demo:hero',
        hero: { 'hero[title]': ['((span))BEST((/span)) BAKERY in town'] }
      })
    })
  }
}
const bakerySlots = [
  {
    key: 'module-301.0',
    entity: 'module-301',
    column: 'params',
    type: 'text',
    sample: 'OUR BREADS',
    maxCharacters: 40,
    jsonPath: ['main-section'],
    xpath: '/html/body/div',
    role: 'editorial.heading'
  },
  {
    key: 'module-301.1',
    entity: 'module-301',
    column: 'params',
    type: 'text',
    sample: 'Since 1990',
    maxCharacters: 40,
    jsonPath: ['top-desc'],
    role: 'editorial.paragraph'
  },
  {
    key: 'module-302.0',
    entity: 'module-302',
    column: 'params',
    type: 'text',
    sample: '((span))BEST((/span)) BAKERY in town',
    maxCharacters: 60,
    nestedJson: 'jatools-config',
    jsonPath: ['hero', 'hero[title]', 0],
    role: 'claim.heading'
  }
]

/** A dental clinic template: an article heading unit inside the article body. */
const dentalRows = {
  'article-41': { introtext: '<h2>Smile<br><strong>brighter</strong></h2><p>Our <em>team</em> cares.</p>' }
}
const dentalSlots = [
  {
    key: 'article-41.0',
    entity: 'article-41',
    column: 'introtext',
    type: 'text',
    sample: 'Smile brighter',
    maxCharacters: 40,
    xpath: '/html/body/div/h2',
    role: 'editorial.heading'
  },
  {
    key: 'article-41.1',
    entity: 'article-41',
    column: 'introtext',
    type: 'text',
    sample: 'Our',
    maxCharacters: 40,
    xpath: '/html/body/div/p/text()[1]',
    role: 'editorial.paragraph'
  }
]

function releaseDir(/** @type {Record<string, any>} */ rows) {
  const dir = mkdtempSync(path.join(tmpdir(), 'inline-style-'))
  writeFileSync(path.join(dir, 'presentation-lock.json'), JSON.stringify({ entities: rows }))
  return dir
}

const rowsById = (/** @type {Record<string, any>} */ rows, /** @type {string} */ kind) =>
  new Map(
    Object.entries(rows)
      .filter(([key]) => key.startsWith(`${kind}-`))
      .map(([key, row]) => [Number(key.split('-')[1]), row])
  )

test('the demo markup of a unit is read from the release rows, the ACM markers from the sample, a text node has none', () => {
  assert.equal(demoMarkupOf(bakerySlots[0], bakeryRows), 'OUR<br/>\r\n<span class="accent">BREADS</span>')
  assert.equal(demoMarkupOf(bakerySlots[1], bakeryRows), null)
  assert.equal(demoMarkupOf(bakerySlots[2], bakeryRows), '((span))BEST((/span)) BAKERY in town')
  assert.equal(demoMarkupOf(dentalSlots[0], dentalRows), 'Smile<br><strong>brighter</strong>')
  assert.equal(demoMarkupOf(dentalSlots[1], dentalRows), null)
  const styled = withInlineStyles(bakerySlots, releaseDir(bakeryRows))
  assert.equal(styled[0].inlineStyle?.hint, 'OUR[[br]][[BREADS]]')
  assert.equal(styled[1].inlineStyle, undefined)
})

test('bakery: the ACM field keeps its markers through the contract, the unit is written plain and styled after it', () => {
  const slots = new Map(withInlineStyles(bakerySlots, releaseDir(bakeryRows)).map((s) => [s.key, s]))
  const changes = {
    'module-301.0': 'FRESH [[LOAVES]]',
    'module-301.1': 'Baked [[daily]] in the old town',
    'module-302.0': '[[WARM]] BREAD every morning'
  }
  const marks = takeStyleMarks(changes)
  assert.equal(changes['module-301.0'], 'FRESH LOAVES')
  const styled = styleChanges({ changes, slots, marks })
  // The contract takes words only: no angle bracket in anything it is sent.
  for (const value of Object.values(changes)) assert.doesNotMatch(value, /[<>]|\[\[/)
  assert.equal(changes['module-302.0'], '((span))WARM((/span)) BREAD every morning')
  assert.equal(changes['module-301.1'], 'Baked daily in the old town')
  assert.equal(changes['module-301.0'], 'FRESH LOAVES')
  assert.deepEqual(
    styled.map((s) => [s.slot.key, s.value]),
    [['module-301.0', 'FRESH<br/> <span class="accent">LOAVES</span>']]
  )
  // After the contract wrote the plain words, the records step lays the demo's tags back at the same path.
  const modules = rowsById(
    {
      'module-301': { params: JSON.stringify({ 'main-section': 'FRESH LOAVES', 'top-desc': 'Baked daily' }) }
    },
    'module'
  )
  const made = inlineStyleSteps({ styled, steps: [], modules })
  assert.deepEqual(made.placed, ['module-301.0'])
  const params = JSON.parse(String(made.steps[0].fields.params))
  assert.equal(params['main-section'], 'FRESH<br/> <span class="accent">LOAVES</span>')
  assert.equal(params['top-desc'], 'Baked daily')
  // Every node a slot binds to is still there: the bound-nodes guard keeps the step.
  const kept = keepBoundNodes({ steps: made.steps, slots: bakerySlots, modules })
  assert.equal(kept.dropped.length, 0)
  assert.deepEqual(
    lostInlineStyles(styled, () => ({ params: made.steps[0].fields.params })),
    []
  )
})

test('dental clinic, no marks (a fallback line): the strong and the break go on by position inside the article body', () => {
  const slots = new Map(withInlineStyles(dentalSlots, releaseDir(dentalRows)).map((s) => [s.key, s]))
  const changes = { 'article-41.0': 'Gentle care for every family', 'article-41.1': 'Our' }
  const styled = styleChanges({ changes, slots })
  assert.equal(changes['article-41.0'], 'Gentle care for every family')
  assert.equal(styled[0].value, 'Gentle care for every<br><strong>family</strong>')
  const articles = rowsById(
    { 'article-41': { introtext: '<h2>Gentle care for every family</h2><p>Our <em>team</em> cares.</p>' } },
    'article'
  )
  // A step the plan already makes on the same column (a fact emptied) takes the style on top of its own value.
  const earlier = [
    {
      kind: 'article',
      id: 41,
      fields: { introtext: '<h2>Gentle care for every family</h2><p>Our <em>team</em> &nbsp;</p>' }
    }
  ]
  const made = inlineStyleSteps({ styled, steps: earlier, modules: new Map(), articles })
  assert.equal(made.steps.length, 1)
  assert.equal(
    made.steps[0].fields.introtext,
    '<h2>Gentle care for every<br><strong>family</strong></h2><p>Our <em>team</em> &nbsp;</p>'
  )
})

test('a slot whose style could not be written is named, never dropped silently', () => {
  const slots = new Map(withInlineStyles(dentalSlots, releaseDir(dentalRows)).map((s) => [s.key, s]))
  const changes = { 'article-41.0': 'Calm visits for children' }
  const styled = styleChanges({ changes, slots })
  const made = inlineStyleSteps({ styled, steps: [], modules: new Map(), articles: new Map() })
  assert.deepEqual(made.missed, ['article-41.0'])
  const lost = lostInlineStyles(styled, () => ({
    introtext: '<h2>Calm visits for children</h2><p>Our team</p>'
  }))
  assert.deepEqual(lost, ['article-41.0'])
})

test('a malicious mark or markup from the writer never reaches the site as markup', () => {
  const slots = new Map(withInlineStyles(bakerySlots, releaseDir(bakeryRows)).map((s) => [s.key, s]))
  const changes = {
    'module-301.0': 'OUR [[<img src=x onerror=alert(1)>CAKES]]',
    'module-302.0': '[[((script))x((/script))]] BAKERY',
    'module-301.1': 'Plain [[words]] <b>here</b>'
  }
  const marks = takeStyleMarks(changes)
  const styled = styleChanges({ changes, slots, marks })
  assert.doesNotMatch(styled[0].value, /<img|onerror/)
  assert.match(styled[0].value, /<span class="accent">CAKES<\/span>$/)
  assert.doesNotMatch(changes['module-302.0'], /script/)
  assert.doesNotMatch(changes['module-301.1'], /[<>]|\[\[/)
})
