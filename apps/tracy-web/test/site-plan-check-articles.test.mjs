import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'

const kit = {
  blocks: [
    {
      id: 'news',
      slots: [
        { id: 'title', role: 'article.title' },
        { id: 'lead', role: 'article.lead' }
      ],
      lists: [{ id: 'articles', rowSlots: [{ field: 'title', role: 'article.title' }] }]
    }
  ]
}
const brief = {
  facts: [
    { id: 'post', field: 'posts', value: { kind: 'post', text: 'Fight night thanks' }, onSite: true },
    { id: 'service', field: 'services', value: 'Boxing' },
    { id: 'held', field: 'posts', value: { kind: 'post', text: 'Private post' }, onSite: false }
  ]
}
const rule = (copy, lists = []) =>
  checkPlan({
    kit,
    brief,
    plan: {
      sharedBlocks: [{ block: 'news', decision: 'keep', copy, lists }]
    }
  }).rules.find((r) => r.id === 'R25')
const line = (slot, fact, basis = 'brief') => ({ slot, basis, factIds: fact ? [fact] : [], says: 'a post' })

test('article copy cannot be invented from trade knowledge, a service or a withheld post', () => {
  for (const copy of [line('title', null, 'trade'), line('title', 'service'), line('title', 'held')])
    assert.equal(rule([copy]).status, 'fail')
  assert.equal(rule([line('title', 'post'), line('lead', 'post')]).status, 'pass')
})
test('two cards cannot turn one owner post into two articles', () => {
  const lists = [
    { list: 'articles', items: [{ copy: [line('title', 'post')] }, { copy: [line('title', 'post')] }] }
  ]
  assert.equal(rule([], lists).status, 'fail')
  lists[0].items.pop()
  assert.equal(rule([], lists).status, 'pass')
})

test('a post can have one detail page, plus its listing teaser, but never two detail pages', () => {
  const block = (id) => ({ block: id, decision: 'keep', copy: [line('title-' + id, 'post')] })
  const k = {
    blocks: ['a', 'b'].map((id) => ({ id, slots: [{ id: 'title-' + id, role: 'article.title' }] }))
  }
  const plan = {
    pages: [
      { id: 'article-a', decision: 'keep', blocks: [block('a')] },
      { id: 'article-b', decision: 'keep', blocks: [block('b')] }
    ]
  }
  const grade = () => checkPlan({ plan, kit: k, brief }).rules.find((r) => r.id === 'R25')
  assert.equal(grade().status, 'fail')
  plan.pages.pop()
  assert.equal(grade().status, 'pass')
})
