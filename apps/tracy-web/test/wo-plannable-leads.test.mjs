// The page leads a build's plan must write (`agent-demo.js` `plannableLeads`): only those a frozen record or slot holds.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plannableLeads } from '../src/opportunities-build/agent-demo.js'

const leads = [
  {
    page: '/index.php/offer',
    at: 'div.hp-desc > p',
    text: 'Disputando consectetuer ex vim, qui prima eleifend id.'
  },
  { page: '/about', at: 'p.lead', text: 'Since 1999 we have served the harbour' },
  { page: '/blog', at: 'p.lead', text: 'Donec convallis nulla mauris, eget aucibus elit interdum quis ...' },
  // Printed from a template language string: no record field, no contract slot.
  { page: '/index.php/contact', at: 'div.title-lead.mb-4 > p', text: 'Write a Message' }
]
const structure = (complete) => ({
  inventory: {
    complete,
    records: [
      {
        kind: 'module',
        id: 7,
        data: {
          content: '<p>Disputando consectetuer ex vim, qui prima eleifend id. In qui affert persius.</p>'
        }
      },
      {
        kind: 'article',
        id: 3,
        data: {
          introtext: '<p>Donec convallis nulla mauris, eget aucibus elit interdum quis. Proin a est.</p>'
        }
      }
    ]
  },
  contract: { pages: [{ slots: [{ key: 'about.lead', current: 'Since 1999 we have served the harbour' }] }] }
})

test('a lead held by a record, a contract slot, or cut short by the theme is planned; one nothing holds is not', () => {
  assert.deepEqual(
    plannableLeads(leads, structure(true)).map((l) => l.page),
    ['/index.php/offer', '/about', '/blog']
  )
})

test('with the inventory not read whole, every lead stays the plan’s', () => {
  assert.deepEqual(plannableLeads(leads, structure(false)), leads)
  assert.deepEqual(plannableLeads(leads, undefined), leads)
})

// Local measure 28/10/2026: an EmDash template of 126 posts asked the agent for 126 written posts in one plan.
test('a plan writes one post per topic, as many as the template has, at most twelve; the build writes the rest', async () => {
  const { postsAsked, PLAN_POSTS_MAX } = await import('../src/opportunities-build/agent-demo.js')
  assert.equal(PLAN_POSTS_MAX, 12)
  assert.equal(postsAsked({ templatePosts: 9, researchTopics: 140 }), 9)
  assert.equal(postsAsked({ templatePosts: 21, researchTopics: 4 }), 4)
  assert.equal(postsAsked({ templatePosts: 126, researchTopics: 130 }), 12)
})
