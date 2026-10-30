// The packing rule of guest quote cards (spec TracyHQ/tracy#189, criterion 2.2), on trimmed maps of two invented
// templates: a bike repair shop's pull-quote block and a bakery's testimonial list.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { lintContentMap } from '../src/lib/content-map-lint.js'

const map = (slots) => ({ roleVocabularyVersion: 3, entities: [], slots })
const rules = (m) => lintContentMap(m).findings.filter((f) => f.rule === 'quote-line-outside-group')
const field = (key, path, role, sample, group = null) => ({
  key,
  entity: key.split('.')[0],
  column: 'params',
  nestedJson: 'block-config',
  type: 'text',
  sample,
  jsonPath: path,
  role,
  ...(group ? { group } : {})
})
const quote = { id: 'module-40.quote.0', item: 0, kind: 'quote' }

test('a pull-quote heading outside its quote group is an error; inside the group it passes', () => {
  const slots = [
    field('module-40.1', ['pull', 'pull[title]', 0], 'editorial.paragraph', 'Fast fixes, fair prices.'),
    field('module-40.2', ['pull', 'pull[desc]', 0], 'quote.text', 'They trued my wheel in an hour.', quote),
    field('module-40.3', ['pull', 'pull[name]', 0], 'quote.author_name', 'Demo Rider', quote),
    // The section's own heading is another field of the block: it is no line of the card.
    field('module-40.4', ['section-title'], 'editorial.heading', 'What riders say')
  ]
  assert.deepEqual(
    rules(map(slots)).map((f) => [f.key, f.severity]),
    [['module-40.1', 'error']]
  )
  slots[0] = { ...slots[0], role: 'quote.text', group: quote }
  assert.deepEqual(rules(map(slots)), [])
})

test('a reviewer line of a repeated testimonial item outside its group, or a quote role with no group, is an error', () => {
  const g = (n) => ({ id: `module-41.testimonials.${n}`, item: n, kind: 'quote' })
  const slots = [
    field('module-41.0', ['testimonials', 'testimonials0', 'text'], 'quote.text', 'Best rye in town.', g(0)),
    field('module-41.1', ['testimonials', 'testimonials0', 'name'], 'editorial.paragraph', 'Demo Baker'),
    field('module-41.2', ['testimonials', 'testimonials1', 'text'], 'quote.text', 'Lovely croissants.', g(1)),
    field('module-41.3', ['testimonials', 'testimonials1', 'name'], 'quote.author_name', 'Demo Guest', g(1)),
    { key: 'article-7.2', entity: 'article-7', type: 'text', sample: 'A quote', role: 'quote.text' }
  ]
  assert.deepEqual(
    rules(map(slots)).map((f) => f.key),
    ['module-41.1', 'article-7.2']
  )
})

test('the released JA Boxing 1.0.8 content map declares every line of its quote cards inside the group', () => {
  const released = JSON.parse(
    readFileSync(
      new URL(
        '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.8/content-map.json',
        import.meta.url
      ),
      'utf8'
    )
  )
  assert.deepEqual(rules(released), [])
})

test("the writer never puts the business's words into a line of a quote card, on both CMS write paths", async () => {
  const { planHonesty } = await import('website-opportunities/domain/site-plan-honesty.mjs')
  const { withHonestyPins } = await import('../src/sites/brief-engines/copy-pin-priority.js')
  const contentMap = {
    roleVocabularyVersion: 'place-content-roles/3',
    entities: [{ key: 'module-40', kind: 'module' }],
    slots: [
      field('module-40.1', ['pull', 'pull[title]', 0], 'editorial.paragraph', 'Demo pull quote.'),
      field('module-40.2', ['pull', 'pull[desc]', 0], 'quote.text', 'Demo body.', quote),
      field('module-40.3', ['pull', 'pull[name]', 0], 'quote.author_name', 'Demo Rider', quote)
    ]
  }
  // A florist with no review: the copy writer drafted a blurb for the heading and the body.
  const brief = { business: { name: 'Petal Row Florist', trade: 'florist' } }
  const { honesty } = planHonesty(brief, contentMap)
  const copy = {
    pins: { 'module-40.1': 'Fresh bouquets every morning.', 'module-40.2': 'We love flowers.' },
    sources: { 'module-40.1': 'writer', 'module-40.2': 'writer' },
    roles: {}
  }
  const out = withHonestyPins(copy, contentMap, honesty)
  assert.equal(out.pins['module-40.1'], '')
  assert.equal(out.pins['module-40.2'], '')
})
