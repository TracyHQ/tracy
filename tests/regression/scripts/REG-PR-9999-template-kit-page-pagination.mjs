/**
 * REG-PR-9999-template-kit-page-pagination: the template kit tool (3.1.5) treats `?page=`, `?paged=` and `/page/N/`
 * result pages as pagination links, and a rebuild keeps each page's `fullShotOf`.
 * S1: a link "2" to a `?page=2` / `?paged=2` / `/page/2/` page of the listing gets the `pagination` reason.
 * S2: a rebuilt kit takes `fullShotOf` from the previous one.
 */
import { fixedLinkLabels } from '../../../packages/cms/tracy-quickstart-tools/template-kit/lib/link-label-reasons.mjs'
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
      { id: 'page-list-2', path: target, blocks: ['body-list-2'] }
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
c.done()
