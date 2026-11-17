// The page writer reads the plan's intent (#575, the step chain writer's page notes): each page's visitor question,
// key message, search intent and terms, and each block's point and the key messages it
// carries, by their words. A plan without them sends what it always sent. Invented data only, no model call.
import assert from 'node:assert/strict'
import test from 'node:test'
import { pageWriterUser } from '../domain/page-writer-request.mjs'

const blocks = new Map([['hero-a', { id: 'hero-a', type: 'hero' }]])
const slot = {
  key: 'b1.heading',
  block: 'b1',
  field: { name: 'heading', type: 'text', kind: 'editorial.heading', limit: 40 }
}
const plan = (page) => ({
  language: 'en',
  facts: [{ id: 'business-name', kind: 'business.name', value: 'Quillmoor Rowing Club' }],
  keyMessages: [{ id: 'km-1', label: 'Rowing for every age' }],
  pages: [page]
})

test('the writer reads the page and block intent of the plan', () => {
  const page = {
    id: 'home',
    name: 'Home',
    pageType: 'home',
    visitorQuestion: 'Can I learn to row here?',
    keyMessage: 'Rowing for every age, close to home.',
    seo: { titleIntent: 'The club and its town', searchTerms: ['rowing lessons Fernhollow'] },
    endAction: { block: 'b1', factIds: [] },
    blocks: [
      {
        id: 'b1',
        block: 'hero-a',
        label: 'Top banner',
        data: [],
        message: 'Who the club is for.',
        carries: ['km-1', 'km-9']
      }
    ]
  }
  const user = pageWriterUser({ plan: plan(page), page, slots: [slot], byId: new Map(), blocks })
  assert.deepEqual(user.page, {
    id: 'home',
    name: 'Home',
    pageType: 'home',
    visitorQuestion: 'Can I learn to row here?',
    keyMessage: 'Rowing for every age, close to home.',
    search: { titleIntent: 'The club and its town', searchTerms: ['rowing lessons Fernhollow'] }
  })
  assert.equal(user.blocks[0].message, 'Who the club is for.')
  assert.deepEqual(user.blocks[0].keyMessages, ['Rowing for every age'])
})

test('a plan without intent sends the page and blocks as before', () => {
  const page = {
    id: 'home',
    name: 'Home',
    pageType: 'home',
    blocks: [{ id: 'b1', block: 'hero-a', label: 'Top banner', data: [] }]
  }
  const user = pageWriterUser({ plan: plan(page), page, slots: [slot], byId: new Map(), blocks })
  assert.deepEqual(user.page, { id: 'home', name: 'Home', pageType: 'home' })
  assert.ok(!('message' in user.blocks[0]) && !('keyMessages' in user.blocks[0]))
})
