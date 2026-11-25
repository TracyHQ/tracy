/**
 * REG-PR-9999-template-kit-page-pagination: the template kit tool (3.1.5) treats `?page=`, `?paged=` and `/page/N/`
 * result pages as pagination links, and a rebuild keeps each page's `fullShotOf`.
 * S1: a link "2" to a `?page=2` / `?paged=2` / `/page/2/` page of the listing gets the `pagination` reason.
 * S2: a rebuilt kit takes `fullShotOf` from the previous one.
 */
import {
  fixedLinkLabels,
  relabelKit
} from '../../../packages/cms/tracy-quickstart-tools/template-kit/lib/link-label-reasons.mjs'
import { linkLabelSlots } from '../../../packages/cms/tracy-quickstart-tools/template-kit/lib/link-label-slots.mjs'
import { keepFullShots } from '../../../packages/cms/tracy-quickstart-tools/template-kit/lib/pack.mjs'
import { checks } from './lib.mjs'

const c = checks()

for (const [path, target] of [
  ['/donations', '/donations?page=2'],
  ['/news', '/news?paged=2'],
  ['/blog', '/blog/page/2/']
]) {
  const kit = {
    pages: [
      { id: 'page-list', path, blocks: ['body-list'] },
      { id: 'page-list-2', path: target, blocks: ['body-list-2'], paginationOf: 'page-list' }
    ],
    blocks: [
      { id: 'body-list', links: [{ id: 'l1', label: '2', target }] },
      { id: 'body-list-2', links: [{ id: 'l2', label: '1', target: path }] }
    ],
    checks: {},
    errors: []
  }
  fixedLinkLabels(kit)
  c.eq(`S1: ${target} is pagination`, kit.blocks[0].links[0].fixedLabel?.rule, 'pagination')
}

const rebuilt = { pages: [{ id: 'page-a' }, { id: 'page-b' }] }
keepFullShots(rebuilt, {
  pages: [
    { id: 'page-a', fullShotOf: 'page-a' },
    { id: 'page-b', fullShotOf: 'page-a' }
  ]
})
c.eq('S2: page-b keeps fullShotOf', rebuilt.pages[1].fullShotOf, 'page-a')
// S4: a value that is no page number, and a real page named `page`, are no pagination.
for (const [path, target, extra] of [
  ['/info', '/info?page=about', { id: 'p', path: '/info?page=about', blocks: [] }],
  ['/news', '/news?start=abc', { id: 'p', path: '/news?start=abc', blocks: [] }],
  ['/', '/page/2/', { id: 'p', path: '/page/2/', blocks: ['x'] }]
]) {
  const kit = {
    pages: [{ id: 'page-list', path, blocks: ['body-list'] }, extra],
    blocks: [{ id: 'body-list', links: [{ id: 'l1', label: '2', target }] }],
    checks: {},
    errors: []
  }
  fixedLinkLabels(kit)
  c.eq(`S4: ${target} is not pagination`, kit.blocks[0].links[0].fixedLabel?.rule, undefined)
}

// S5: a `fullShotOf` pointing at a removed page is not kept.
const gone = { pages: [{ id: 'b', group: 'g' }] }
keepFullShots(gone, {
  pages: [
    { id: 'a', group: 'g' },
    { id: 'b', group: 'g', fullShotOf: 'a' }
  ]
})
c.eq('S5: b drops fullShotOf of removed a', gone.pages[0].fullShotOf, undefined)

// S3: a page read as sections keeps its `pages.<slug>.` slot keys under a section block's entity (JA Nova).
const sectioned = {
  pages: [{ entity: 'pages.development', route: '/development', openAs: '/development' }],
  slots: [
    {
      key: 'pages.development.title',
      entity: 'block-development-body',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Development'
    }
  ]
}
const step = {
  pages: [{ id: 'page-a', path: '/a', blocks: ['block-a'] }],
  blocks: [
    {
      id: 'block-a',
      source: { entity: 'block-a', contains: [] },
      fixedText: [],
      slots: [],
      links: [{ id: 'l1', label: 'Previous article: Development Prev', target: '/development' }]
    }
  ],
  checks: {},
  errors: []
}
relabelKit(step, { map: sectioned, linkLabelSlots })
c.eq('S3: step link names the opened page title', step.blocks[0].links[0].labelId, 'pages.development.title')
c.done()
