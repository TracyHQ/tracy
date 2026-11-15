// The system pages a built site is read at (ticket #586 with #587 slice C): a kit that declares a `system-menu` data fix
// gives each system page a menu item of its own, and the gate reads the page at that item's address, read from the
// mapping (never written here); a kit with none keeps the raw component addresses. Invented kit declarations.
import assert from 'node:assert/strict'
import test from 'node:test'
import { SYSTEM_PAGES, systemPagesOf } from '../ai-quickstart/gate/adapters/joomla-t4.mjs'

const mapping = {
  dataFixes: [
    {
      id: 'system-menu',
      menu: { menutype: 'system-pages', title: 'System pages' },
      items: [
        {
          page: 'system-search',
          title: 'Search',
          alias: 'find',
          link: 'index.php?option=com_finder&view=search'
        },
        {
          page: 'system-login',
          title: 'Log in',
          alias: 'sign-in',
          link: 'index.php?option=com_users&view=login'
        }
      ],
      why: 'invented'
    }
  ]
}

test('a declared system menu: each system page it names is read at its item, the rest at the raw address', () => {
  const paths = Object.fromEntries(systemPagesOf(mapping).map((p) => [p.pageType, p.path]))
  assert.equal(paths['system-search'], 'index.php/find?q=qqqqq')
  assert.equal(paths['system-login'], 'index.php/sign-in')
  assert.equal(paths['system-reset'], 'index.php?option=com_users&view=reset')
  assert.equal(paths['system-404'], 'index.php/qx-no-such-page')
  assert.equal(systemPagesOf(mapping).find((p) => p.pageType === 'system-404').status, 404)
})

test('no system menu: the raw addresses', () => {
  assert.deepEqual(systemPagesOf({}), [...SYSTEM_PAGES])
  assert.deepEqual(systemPagesOf(null), [...SYSTEM_PAGES])
})

test('a system page read at its item on the marker site is compared with the same page read raw on the control', async () => {
  const { qualityOf } = await import('../ai-quickstart/gate/quality.mjs')
  const { seoOf } = await import('../ai-quickstart/gate/quality-seo.mjs')
  const html = '<html><head><title>Log in</title></head><body></body></html>'
  const render = (path) => [
    { pageType: 'system-login', path, status: 200, theme: 'light', width: 1440, html }
  ]
  const seo = seoOf(render('index.php/sign-in'), { origin: 'http://site.test' })
  const controlSeo = seoOf(render('index.php?option=com_users&view=login'), { origin: 'http://site.test' })
  const g = { groups: [{ name: 'cms-errors', status: 'green', failures: [] }] }
  const q = qualityOf({
    marker: g,
    control: { from: 'measured', ...g, seo: controlSeo },
    seo,
    systemPages: ['index.php/sign-in']
  })
  assert.ok(seo.missing.length > 0)
  assert.deepEqual(q.seo.blocking, [], JSON.stringify(q.seo))
  assert.equal(q.seo.same.length, seo.missing.length)
})
