import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeJoomlaMainMenu } from '../src/sites/brief-engines/main-menu-joomla.js'
import { writeWordPressMainMenu } from '../src/sites/brief-engines/main-menu-wordpress.js'
import { writeEmdashMainMenu } from '../src/sites/brief-engines/main-menu-emdash.js'

const plan = (description) => ({
  brand: { name: { value: 'Fictional Business' }, description: { value: description } },
  pages: [
    { id: 'home', path: '/', role: 'home', decision: 'keep' },
    { id: 'services', path: '/services', role: 'services', decision: 'keep' }
  ]
})
const model = (offering) => ({
  chat: async ({ messages }) =>
    JSON.stringify({
      labels: Object.fromEntries(
        JSON.parse(messages[1].content).items.map((i) => [i.key, i.role === 'home' ? 'Home' : offering])
      )
    })
})
for (const [description, offering] of [
  ['Bakery workshops and pastries.', 'Workshops'],
  ['Dental treatments.', 'Treatments']
]) {
  for (const framework of ['T3', 'T4'])
    test(`${framework}: ${offering} takes the native menu title after blanking, never the footer`, async () => {
      const rows = [
        {
          id: 1,
          menutype: 'mainmenu',
          path: 'home',
          home: 1,
          parent_id: 0,
          published: 1,
          title: 'Demo home'
        },
        { id: 2, menutype: 'mainmenu', path: 'services', parent_id: 0, published: 1, title: '\u00a0' },
        { id: 3, menutype: 'footer', path: 'services', parent_id: 0, published: 1, title: 'Footer sample' }
      ]
      const apply = async ({ action, params }) => {
        if (action === 'content.list') return { ok: true, items: rows }
        if (action === 'content.get') return { ok: true, item: rows.find((r) => r.id === params.id) }
        assert.equal(action, 'content.batch')
        assert.ok(
          Array.isArray(params.operations),
          'the Joomla door receives its documented operations field'
        )
        for (const step of params.operations)
          Object.assign(
            rows.find((r) => r.id === step.id),
            step.fields
          )
        return { ok: true }
      }
      await writeJoomlaMainMenu({
        apply,
        siteKey: 'fictional',
        sitePlan: plan(description),
        model: model(offering),
        contentMap: { slots: [] }
      })
      assert.equal(rows[1].title, offering)
      assert.equal(rows[2].title, 'Footer sample')
    })

  test(`WordPress: ${offering} is written into the header's referenced navigation only`, async () => {
    const header = '<!-- wp:navigation {"ref":10} /-->'
    const navs = [
      {
        id: 10,
        status: 'publish',
        content:
          '<!-- wp:navigation-link {"label":"Demo home","url":"/"} /--><!-- wp:navigation-link {"label":"","url":"/services"} /-->'
      },
      { id: 11, status: 'publish', content: 'Footer sample' }
    ]
    const call = async (action, params) => {
      if (action === 'content.get') return { ok: true, item: { content: header } }
      if (action === 'content.list')
        return { ok: true, items: params.post_type === 'wp_navigation' ? navs : [] }
      assert.equal(action, 'content.update')
      navs.find((r) => r.id === params.id).content = params.fields.post_content
      return { ok: true }
    }
    await writeWordPressMainMenu({ call, sitePlan: plan(description), model: model(offering) })
    assert.match(navs[0].content, new RegExp(`"label":"${offering}"`))
    assert.equal(navs[1].content, 'Footer sample')
  })

  test(`EmDash: ${offering} follows native primary-menu destinations and leaves footer menus alone`, async () => {
    const rows = [
      { id: 'h', url: '/', label: 'Demo home' },
      { id: 's', url: '/services', label: 'Learn more' }
    ]
    const api = async (method, path, body) => {
      assert.ok(!path.includes('footer'))
      if (method === 'GET') return { items: rows }
      rows.find((r) => path.includes(`/items/${r.id}?`)).label = body.label
      return {}
    }
    const sitePlan = plan(description)
    delete sitePlan.pages[1].path
    sitePlan.pages[1].id = 'services_page'
    await writeEmdashMainMenu({
      api,
      seed: {
        defaultLocale: 'en',
        menus: [
          { name: 'primary', locale: 'en' },
          { name: 'footer_company', locale: 'en' }
        ]
      },
      sitePlan,
      model: model(offering)
    })
    assert.equal(rows[1].label, offering)
  })
}

test('WordPress automatic page-list placement becomes explicit kept-page navigation with its own labels', async () => {
  let header =
    '<!-- wp:group --><div><!-- wp:navigation {"overlayMenu":"mobile"} /--></div><!-- /wp:group -->'
  const pages = [
    { id: 1, slug: 'home', url: '/', title: 'Fictional Bakery', status: 'publish' },
    { id: 2, slug: 'services', url: '/services', title: 'Demo services', status: 'publish' },
    { id: 3, slug: 'pricing', url: '/pricing', title: 'Demo prices', status: 'draft' }
  ]
  const call = async (action, params) => {
    if (action === 'content.get') return { ok: true, item: { content: header } }
    if (action === 'content.list') return { ok: true, items: pages }
    assert.equal(params.kind, 'templatePart')
    assert.equal(params.key, 'header')
    header = params.fields.content
    return { ok: true }
  }
  await writeWordPressMainMenu({ call, sitePlan: plan('Bakery workshops.'), model: model('Workshops') })
  assert.match(header, /"label":"Home"/)
  assert.match(header, /"label":"Workshops"/)
  assert.ok(!header.includes('/pricing'))
  assert.match(header, /"overlayMenu":"mobile"/)
})

// A menu label is written at apply, after the site's one spelling was chosen (criterion 1.6): it is spelt the site's way,
// the business's own name kept as it is.
for (const [locale, offering, spelt] of [
  ['en-GB', 'Color consults', 'Colour consults'],
  ['en-US', 'Organised tours', 'Organized tours']
])
  test(`Joomla: a menu label of a ${locale} site takes the site's spelling`, async () => {
    const rows = [
      { id: 1, menutype: 'mainmenu', path: 'home', home: 1, parent_id: 0, published: 1, title: 'Home' },
      { id: 2, menutype: 'mainmenu', path: 'services', parent_id: 0, published: 1, title: 'Demo' }
    ]
    const apply = async ({ action, params }) => {
      if (action === 'content.list') return { ok: true, items: rows }
      if (action === 'content.get') return { ok: true, item: rows.find((r) => r.id === params.id) }
      if (action === 'content.batch') {
        for (const step of params.operations ?? []) {
          const row = rows.find((r) => r.id === step.id)
          if (row) Object.assign(row, step.fields)
        }
        return { ok: true, results: (params.operations ?? []).map(() => ({ ok: true })) }
      }
      return { ok: true }
    }
    await writeJoomlaMainMenu({
      apply,
      siteKey: 'fictional',
      sitePlan: { ...plan('Fictional trade.'), styleSheet: { locale } },
      model: model(offering),
      contentMap: { slots: [] }
    })
    assert.equal(rows[1].title, spelt)
  })
