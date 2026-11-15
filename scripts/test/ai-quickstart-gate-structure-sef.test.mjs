// A link is judged by the page it reaches, not by how it is spelled (ticket #586, review round 3): a site that prints
// friendly menu addresses (`/index.php/news` for the planned `index.php?Itemid=245`) links to its planned pages, and
// such a link is no broken link; a link that reaches a page the plan has not got is recorded apart, as a link to an
// unplanned page, never as a link to a missing page. And a hide that takes the pages still shown down fails the hidden
// variant (U4). An invented site, and the invented florist kit on a memory site.
import assert from 'node:assert/strict'
import test from 'node:test'
import { markerBuild } from '../ai-quickstart/gate/marker-plan.mjs'
import { memoryTryWrite } from '../ai-quickstart/gate/memory-write.mjs'
import { structure } from '../ai-quickstart/gate/structure.mjs'
import { linksOf } from '../ai-quickstart/gate/structure-read.mjs'
import { floristKit } from './fixtures/ai-quickstart-gate/florist-kit.mjs'
import { memorySiteOf, ORIGIN } from './fixtures/ai-quickstart-gate/memory-site.mjs'

const base = 'http://site.test/'
/** The identity a page prints: the menu item of its body class and its title, as a CMS adapter reads it. */
const identify = (html) => {
  const item = /<body class="item-(\d+)"/.exec(html)?.[1]
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]
  return item ? item + '|' + title : null
}
const page = (item, title, body) =>
  `<html><head><title>${title}</title></head><body class="item-${item}">${body}</body></html>`
const PAGES = {
  'http://site.test/index.php': page(
    101,
    'Home',
    '<a href="/index.php/news">News</a><a href="/index.php/old">Old</a>'
  ),
  'http://site.test/index.php?Itemid=245': page(245, 'News', '<a href="/index.php">Home</a>'),
  // The same page as Itemid=245, at the address the menu prints.
  'http://site.test/index.php/news': page(245, 'News', '<a href="/index.php">Home</a>'),
  // A page the plan has not got that the site still serves.
  'http://site.test/index.php/old': page(300, 'Old', '')
}
const fetchOf = (pages) => async (url) =>
  pages[url] != null ? { status: 200, html: pages[url] } : { status: 404, html: '' }
const readOf = (pages) =>
  [
    { pageType: 'home', path: 'index.php', url: base + 'index.php' },
    { pageType: 'news', path: 'index.php?Itemid=245', url: base + 'index.php?Itemid=245' }
  ].map((p) => ({ ...p, status: pages[p.url] ? 200 : 404, expected: 200, html: pages[p.url] ?? '' }))

test('U3: a friendly address of a planned page that answers is no broken link, and names its page', async () => {
  const site = { fetch: fetchOf(PAGES) }
  const links = await linksOf(site, readOf(PAGES), { base, demoRoutes: [], identify })
  assert.deepEqual(
    links.broken.map((f) => f.href),
    [],
    'no link is broken: ' + JSON.stringify(links.broken)
  )
  assert.deepEqual(
    links.unplanned.map((f) => [f.href, f.status]),
    [['/index.php/old', 200]],
    'a link to a page the plan has not got is recorded apart'
  )
})

test('U3: a friendly address of a page that does not answer is still a link to a missing page', async () => {
  const pages = { ...PAGES }
  delete pages['http://site.test/index.php/news']
  const links = await linksOf({ fetch: fetchOf(pages) }, readOf(pages), { base, demoRoutes: [], identify })
  assert.deepEqual(
    links.broken.map((f) => [f.kind, f.href]),
    [['missing_page', '/index.php/news']]
  )
})

const icons = { set: 'invented-icons@1', icons: [{ name: 'leaf', tags: ['plant'], categories: [] }] }
const measure = (wrapSite) => {
  const kit = floristKit()
  const site = wrapSite(memorySiteOf(kit, {}))
  const build = (options) =>
    markerBuild(kit, { iconLibrary: icons, tryWrite: memoryTryWrite(kit), ...options })
  return structure({ build, site, kit, base: ORIGIN + '/' })
}

test('U4: a hide that takes every page down while it lasts fails the hidden variant', async () => {
  const result = await measure((s) => {
    let down = 0
    return {
      ...s,
      hide: async (r) => {
        down += 1
        return s.hide(r)
      },
      show: async (r) => {
        down -= 1
        return s.show(r)
      },
      fetch: async (u) => (down > 0 ? { status: 404, html: '' } : s.fetch(u))
    }
  })
  assert.equal(result.hidden.status, 'failed', JSON.stringify(result.hidden).slice(0, 400))
  assert.ok(result.hidden.shownBroken.length >= 1, 'the pages still shown that did not answer are named')
  assert.notEqual(result.status, 'passed')
})

test('U3: the Joomla adapter tells a page by its menu item and title, at any address', async () => {
  const { joomlaPageIdentity } = await import('../ai-quickstart/gate/adapters/joomla-page-identity.mjs')
  const a = '<html><head><title>Classes</title></head><body class="site layout-default item-245 dark-active">'
  const b = '<html><head><title> Classes </title></head><body class="site itemid-245">'
  assert.equal(joomlaPageIdentity(a), '245|Classes')
  assert.equal(joomlaPageIdentity(b), '245|Classes')
  assert.notEqual(joomlaPageIdentity(a.replace('Classes', 'Plans')), joomlaPageIdentity(a))
  assert.equal(joomlaPageIdentity('<body class="site">'), null)
})
