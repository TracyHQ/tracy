// The inline markup rules of ticket #584 on the invented fixture: a text field whose demo value carries an accent
// span, a line break or a wrapper declares it (`inline`), in the template kit's notation, and the declaration covers
// every tag the draft report found.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'
import { inlineProblem, inlineWriteOfSlot, spanAtOfSample } from '../domain/ai-quickstart-inline.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const valid = () => ({
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
})
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)
const heading = (set) =>
  set.blockStore.blocks.find((b) => b.id === 'hero-home').fields.find((f) => f.name === 'heading')

test('an inline declaration names emphasis parts in the kit notation, a wrapper and where it was read', () => {
  const ok = {
    emphasis: [{ tag: 'br' }, { tag: 'span', attrs: '', at: 'end' }],
    from: 'template-kit',
    write: 'html'
  }
  assert.equal(inlineProblem(ok), null)
  assert.equal(inlineProblem({ emphasis: [], wrapper: ['p'], from: 'content-map', write: 'codes' }), null)
  assert.match(
    inlineProblem({ emphasis: [{ tag: 'em' }], from: 'template-kit', write: 'html' }),
    /an emphasis part is/
  )
  assert.match(
    inlineProblem({ emphasis: [{ tag: 'span', at: 'middle' }], from: 'template-kit', write: 'html' }),
    /accent span/
  )
  assert.match(
    inlineProblem({ emphasis: [], from: 'template-kit', write: 'html' }),
    /an emphasis or a wrapper/
  )
  assert.match(inlineProblem({ emphasis: [{ tag: 'br' }], from: 'demo' }), /inline.from/)
  assert.match(
    inlineProblem({ emphasis: [], wrapper: ['div'], from: 'content-map', write: 'codes' }),
    /inline.wrapper/
  )
  // How the build writes the value through the door: the markers as they are, or real tags (#584).
  assert.match(inlineProblem({ emphasis: [{ tag: 'br' }], from: 'template-kit' }), /inline.write/)
  assert.match(
    inlineProblem({ emphasis: [{ tag: 'br' }], from: 'template-kit', write: 'markers' }),
    /inline.write/
  )
})

test('the write form follows how a slot stores the value, and the span position follows the demo words (#584)', () => {
  assert.equal(
    inlineWriteOfSlot({ column: 'params', nestedJson: 'jatools-config', jsonPath: ['a'] }),
    'codes'
  )
  assert.equal(
    inlineWriteOfSlot({ column: 'params', jsonPath: ['main-section'], xpath: '/html/body/span' }),
    'html'
  )
  assert.equal(inlineWriteOfSlot({ column: 'content', xpath: '/html/body/p/a/@href' }), null)
  assert.equal(inlineWriteOfSlot({ column: 'title' }), null)
  assert.equal(spanAtOfSample('((span))ONE((/span)) invented words'), 'start')
  assert.equal(spanAtOfSample('Invented((br/)) ((span)) words ((/span)) '), 'end')
  assert.equal(spanAtOfSample('Join the ((span))invented((/span)) list'), 'inside')
  assert.equal(spanAtOfSample('Plain((br/))words'), null)
})

test('a field the draft report finds carrying inline markup declares it, covering every tag', () => {
  const set = valid()
  set.draftReport = {
    inlineMarkup: { fields: [{ block: 'hero-home', field: 'heading', markup: ['br', 'span'] }] }
  }
  assert.deepEqual(problemsOf(set), [
    'blocks[hero-home].fields[heading].inline: the stored value carries br, span: declare its inline markup'
  ])
  heading(set).inline = { emphasis: [{ tag: 'br' }], from: 'template-kit', write: 'html' }
  assert.deepEqual(problemsOf(set), [
    'blocks[hero-home].fields[heading].inline: the stored value also carries span: declare it'
  ])
  heading(set).inline.emphasis.push({ tag: 'span', attrs: '', at: 'end' })
  assert.deepEqual(problemsOf(set), [])
})

test('inline is a key of text fields', () => {
  const set = valid()
  const photo = set.blockStore.blocks.find((b) => b.id === 'hero-home').fields.find((f) => f.name === 'photo')
  photo.inline = { emphasis: [{ tag: 'br' }], from: 'template-kit', write: 'html' }
  assert.deepEqual(problemsOf(set), [
    'blocks[hero-home].fields[photo].inline: inline is a key of text fields'
  ])
})
