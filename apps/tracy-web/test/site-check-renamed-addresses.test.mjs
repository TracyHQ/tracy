// Card AD on the site check: a dead link to an address the write step's route stage moved is the write step's (step 9), not
// the planner's. Every site, page and row here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { findDeadLinks } from '../src/site-check/page-measures.js'

const ROUTES = [
  {
    pageId: 'page-lessons',
    itemId: 10,
    slug: 'classes',
    from: '/lessons',
    to: '/classes',
    outcome: 'written'
  },
  {
    pageId: 'page-lessons_rowing',
    itemId: null,
    slug: 'kayak-tours',
    from: '/lessons/rowing',
    to: null,
    outcome: 'refused'
  }
]

test('a dead link to an address the write step moved is blamed on step 9; any other dead link stays step 3', () => {
  const failures = findDeadLinks(
    [],
    [
      {
        path: '/',
        links: [
          { href: 'https://quay.example/index.php/lessons/rowing', text: 'Rowing', status: 404 },
          { href: '/nowhere', text: 'Lost', status: 404 }
        ]
      }
    ],
    ROUTES
  )
  assert.deepEqual(
    failures.map((f) => f.causingStep ?? 3),
    [9, 3]
  )
  assert.match(failures[0].reason, /renamed \/lessons to \/classes/)
  const group = PAGE_CHECK_GROUPS.find((g) => g.name === 'dead-links')
  assert.equal(group.causingStep, 3)
})
