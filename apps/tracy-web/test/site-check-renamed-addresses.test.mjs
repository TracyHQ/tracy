// Cards AD and AE on the site check: a dead link to an address the write step's route stage moved is the write step's (step 9),
// not the planner's; the kept pages are opened where they answer now, a page under a renamed parent too; and page-slug reads
// the address the site answers now, not the one the contract was captured with. Every site, page and row here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptPaths } from '../src/lib/site-kept-paths.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { findDeadLinks } from '../src/site-check/page-measures.js'
import { pageSlugGroup } from '../src/site-check/page-slug.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { report } from './_site-check.mjs'
import { CONTRACT } from './_write-step-run.mjs'

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

test('the kept pages are opened where they answer now, a page under a renamed parent too', () => {
  assert.deepEqual(
    keptPaths(
      {},
      {
        routes: ROUTES,
        keptPages: [
          { id: 'page-lessons', path: '/classes' },
          { id: 'page-lessons_rowing', path: '/lessons/rowing' },
          { id: 'page-team', path: '/team' }
        ]
      }
    ),
    ['/classes', '/classes/rowing', '/team']
  )
})

test('page-slug reads the address the site answers now, not the one inspect was captured with', async () => {
  const door = {
    async apply({ action, params }) {
      if (action === 'content.contract')
        return {
          ok: true,
          contract: CONTRACT,
          revision: 'rev-1',
          slots: [],
          pages: [{ entity: 'menuItem-10', route: 'lessons', link: 'index.php' }]
        }
      if (action === 'content.get' && params.kind === 'menuItem' && params.id === 10)
        return { ok: true, item: { alias: 'classes', path: 'classes' } }
      return { ok: false, error: 'unexpected_action' }
    }
  }
  const line = {
    slot: 'page-lessons:slug',
    key: null,
    owner: 'plan',
    part: 'page-slug',
    status: 'written',
    reason: null,
    readBack: null,
    ordered: 'classes',
    readFrom: { action: 'content.get', params: { kind: 'menuItem', id: 10 }, path: ['item', 'alias'] },
    outcome: 'written'
  }
  const check = await runSiteCheck({
    door,
    report: report([line], { routes: [ROUTES[0]], keptPages: [{ id: 'page-lessons', path: '/classes' }] }),
    groups: [pageSlugGroup]
  })
  const group = check.groups.find((g) => g.name === 'page-slug')
  assert.deepEqual([group.status, group.failures], ['green', []])
})
