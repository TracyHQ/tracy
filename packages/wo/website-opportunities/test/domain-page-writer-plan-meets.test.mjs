// The plan stage and the page writer meet (#575): what the plan carries in its own shape (Contract B) reaches the
// writer in words. The main action's facts become the button words and the channel; a page's end action names its
// block and the same words; `carries` ids become key message labels; the search intents and terms reach the page; a
// person customers named sends its name and role only; a channel fact the plan holds from the brief reaches the writer.
// Invented data only, no model call.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-page-writer-plan-meets.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { writerContextOf, writerRequestsOf } from '../domain/page-writer-context.mjs'
import { dataView, pageWriterUser } from '../domain/page-writer-request.mjs'
import { blockStore, clubProfile, library } from './fixtures/plan-composer/invented-club.mjs'

const fact = (id, kind, value) => [
  id,
  { what: 'fact', kind, entry: { id, kind, label: kind, value }, source: { value } }
]
const byId = new Map([
  fact('cta-label', 'contact.cta_label', 'Book a court'),
  fact('cta-link', 'contact.cta_url', 'https://quillmoor-rowing.example/book'),
  fact('whatsapp', 'contact.social_url', 'https://wa.me/15550100'),
  fact('phone', 'contact.phone', '+1 555 0100')
])
const blocks = new Map([['cta-a', { id: 'cta-a', type: 'call_to_action' }]])
const slot = {
  key: 'b1.heading',
  block: 'b1',
  field: { name: 'heading', type: 'text', kind: 'editorial.heading', limit: 40 }
}
const pageOf = (extra = {}) => ({
  id: 'home',
  name: 'Home',
  pageType: 'home',
  blocks: [{ id: 'b1', block: 'cta-a', label: 'Call to action', data: ['cta-label'], carries: ['km-1'] }],
  ...extra
})
const planOf = (page, extra = {}) => ({
  language: 'en',
  facts: [{ id: 'business-name', kind: 'business.name', value: 'Quillmoor Rowing Club' }],
  keyMessages: [{ id: 'km-1', label: 'Rowing for every age' }],
  pages: [page],
  ...extra
})
const userOf = (page, plan) => pageWriterUser({ plan, page, slots: [slot], byId, blocks })

test("the plan's main action reaches the writer as the button words and the channel", () => {
  const page = pageOf()
  const cases = [
    [['cta-label', 'cta-link'], { label: 'Book a court', channel: 'booking link' }],
    [['cta-label', 'phone'], { label: 'Book a court', channel: 'call' }],
    [['cta-label', 'whatsapp'], { label: 'Book a court', channel: 'WhatsApp' }],
    [['cta-label'], { label: 'Book a court' }]
  ]
  for (const [factIds, expected] of cases)
    assert.deepEqual(userOf(page, planOf(page, { primaryAction: { factIds } })).primaryAction, expected)
  assert.equal('primaryAction' in userOf(page, planOf(page)), false)
})

test('a page end action names its block and the main action it leads to', () => {
  const page = pageOf({ endAction: { block: 'b1', factIds: ['cta-label', 'cta-link'] } })
  const user = userOf(page, planOf(page))
  assert.deepEqual(user.page.endAction, { block: 'b1', label: 'Book a court', channel: 'booking link' })
  assert.equal('endsWith' in user.page, false)
})

test('carries ids reach the writer as key message labels, never as ids', () => {
  const page = pageOf()
  page.blocks[0].carries = ['km-1', 'km-unknown']
  const block = userOf(page, planOf(page)).blocks[0]
  assert.deepEqual(block.keyMessages, ['Rowing for every age'])
  assert.equal('carries' in block, false)
})

test('the search intents and terms reach the page', () => {
  const seo = {
    titleIntent: 'The club and its town',
    descriptionIntent: 'Lessons for every age',
    searchTerms: ['rowing lessons Fernhollow']
  }
  const page = pageOf({ seo })
  assert.deepEqual(userOf(page, planOf(page)).page.search, seo)
})

test('a person customers named sends its name and role only', () => {
  const ids = new Map([
    [
      'p-1',
      {
        what: 'item',
        kind: 'person',
        entry: { id: 'p-1', label: 'Odile Varnsby', namedBy: 'customer' },
        source: {
          namedBy: 'customer',
          fields: {
            'person.name': { value: 'Odile Varnsby' },
            'person.role': { value: 'Coach' },
            'person.bio': { value: 'Rowed for twenty years.' }
          }
        }
      }
    ]
  ])
  assert.deepEqual(dataView('p-1', ids).fields, { 'person.name': 'Odile Varnsby', 'person.role': 'Coach' })
})

test('a channel fact the plan holds from the brief reaches the writer of the block that shows it', () => {
  const profile = clubProfile()
  const page = pageOf()
  page.blocks = [{ id: 'b1', block: 'hero-home', label: 'Top banner', data: ['contact-whatsapp'] }]
  const plan = planOf(page, {
    facts: [
      { id: 'business-name', kind: 'business.name', value: 'Quillmoor Rowing Club' },
      {
        id: 'contact-whatsapp',
        kind: 'contact.social_url',
        label: 'WhatsApp',
        value: 'https://wa.me/15550100'
      }
    ]
  })
  const context = writerContextOf({ profile, blockStore: blockStore(), library: library(), plan })
  const request = writerRequestsOf(plan, context).get('home')
  assert.ok(request, 'the home page has a field to write')
  assert.deepEqual(
    request.blocks[0].data.map((d) => d.value),
    ['https://wa.me/15550100']
  )
})
