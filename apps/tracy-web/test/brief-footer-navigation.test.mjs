import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writeJoomlaFooterNavigation } from '../src/sites/brief-engines/footer-navigation-joomla.js'
import { checkFooterNavigation } from '../src/opportunities-build/footer-navigation-check.js'

// A trimmed content map: two footer menu columns of a T3/T4 template, the demo's headings and link labels.
const contentMap = {
  slots: [
    {
      key: 'module-73.0',
      type: 'text',
      sample: 'CLASSES',
      role: 'editorial.heading',
      fit: { maxCharacters: 22 }
    },
    {
      key: 'module-74.0',
      type: 'text',
      sample: 'SITE MAP',
      role: 'editorial.heading',
      fit: { maxCharacters: 22 }
    },
    ...[84, 85, 86, 88].map((id) => ({
      key: `menuItem-${id}.0`,
      type: 'text',
      sample: { 84: 'About', 85: 'Class', 86: 'Schedule', 88: 'Pound it' }[id],
      role: 'editorial.menu_label'
    }))
  ],
  navigationGroups: [
    {
      id: 'footer-offerings',
      placement: 'footer',
      holds: 'offerings',
      heading: 'module-73.0',
      container: 'module-73',
      menu: 'classes',
      links: ['menuItem-88.0']
    },
    {
      id: 'footer-company',
      placement: 'footer',
      holds: 'company',
      heading: 'module-74.0',
      container: 'module-74',
      menu: 'site-map',
      links: ['menuItem-84.0', 'menuItem-85.0', 'menuItem-86.0']
    }
  ]
}

/** A fictional Joomla site: the main menu, the two demo footer menus with `#` links, two footer modules, articles. */
function site(index, offerings) {
  const rows = [
    {
      id: 1,
      menutype: 'mainmenu',
      path: 'home',
      home: 1,
      type: 'component',
      link: 'index.php?option=com_content&view=featured',
      published: 1,
      title: 'Home',
      lft: 1
    },
    {
      id: 2,
      menutype: 'mainmenu',
      path: index,
      type: 'component',
      link: 'index.php?option=com_content&view=category&layout=blog&id=9',
      published: 1,
      title: 'X',
      lft: 2
    },
    {
      id: 3,
      menutype: 'mainmenu',
      path: 'about',
      type: 'component',
      link: 'index.php?option=com_content&view=article&id=1',
      published: 1,
      title: 'About',
      lft: 3
    },
    {
      id: 4,
      menutype: 'mainmenu',
      path: 'about/team',
      type: 'component',
      link: 'index.php?option=com_content&view=article&id=2',
      published: 1,
      title: 'Team',
      lft: 4
    },
    {
      id: 5,
      menutype: 'mainmenu',
      path: 'about/contact',
      type: 'component',
      link: 'index.php?option=com_contact&view=contact&id=1',
      published: 1,
      title: 'Contact',
      lft: 5
    },
    {
      id: 84,
      menutype: 'site-map',
      path: 'about-demo',
      type: 'url',
      link: '#',
      published: 1,
      title: 'About',
      lft: 10
    },
    {
      id: 85,
      menutype: 'site-map',
      path: 'class',
      type: 'url',
      link: '#',
      published: 1,
      title: 'Class',
      lft: 11
    },
    {
      id: 86,
      menutype: 'site-map',
      path: 'schedule',
      type: 'url',
      link: '#',
      published: 0,
      title: 'Schedule',
      lft: 12
    },
    {
      id: 88,
      menutype: 'classes',
      path: 'pound-it',
      type: 'url',
      link: '#',
      published: 1,
      title: 'Pound it',
      lft: 20
    }
  ]
  const modules = [
    { id: 73, title: 'CLASSES', module: 'mod_menu', position: 'footnav-3', published: 0 },
    { id: 74, title: 'SITE MAP', module: 'mod_menu', position: 'footnav-4', published: 1 }
  ]
  const articles = offerings.map((o, i) => ({
    id: 20 + i,
    catid: 9,
    state: 1,
    alias: o.alias,
    title: o.title
  }))
  articles.push({ id: 99, catid: 9, state: 0, alias: 'old-demo', title: 'Old demo class' })
  let next = 200
  const apply = async ({ action, params }) => {
    if (action === 'content.list') {
      const all = { menuItem: rows, module: modules, article: articles }[params.kind] ?? []
      return { ok: true, items: all.slice(params.offset ?? 0, (params.offset ?? 0) + params.limit) }
    }
    if (action === 'content.batch') {
      for (const step of params.operations)
        Object.assign(
          (step.kind === 'module' ? modules : rows).find((r) => r.id === step.id),
          step.fields
        )
      return { ok: true }
    }
    if (action === 'content.update' && params.id === 0) {
      next += 1
      rows.push({ id: next, lft: 100 + next, path: params.fields.alias, ...params.fields })
      return { ok: true, id: next, created: true }
    }
    throw new Error(`unexpected ${action}`)
  }
  return { apply, rows, modules }
}

/** The footer a Joomla site renders from its rows: each published column module and its published entries. */
function renderFooter({ rows, modules }, index, offerings) {
  const route = (row) => {
    if (row.type !== 'url') return row.home ? '/index.php' : `/index.php/${row.path}`
    const article = row.link.match(/view=article&id=(\d+)/)?.[1]
    if (article) return `/index.php/${index}/${offerings[Number(article) - 20].alias}`
    const target = rows.find((r) => r.id === Number(row.link.match(/Itemid=(\d+)/)?.[1]))
    return target ? route(target) : row.link
  }
  const column = (menu, moduleId) => {
    const module = modules.find((m) => m.id === moduleId)
    if (!module.published) return ''
    const items = rows.filter((r) => r.menutype === menu && r.published === 1).sort((a, b) => a.lft - b.lft)
    return `<div class="t4-module" id="Mod${moduleId}"><h3 class="module-title"><span>${module.title}</span></h3><nav class="navbar"><ul>${items.map((r) => `<li><a href="${route(r)}">${r.title}</a></li>`).join('')}</ul></nav></div>`
  }
  return `<div id="t4-footnav" class="t4-footnav"><a href="/index.php"><img src="logo.png"></a>${column('classes', 73)}${column('site-map', 74)}</div>`
}

for (const [name, index, offerings, headings] of [
  [
    'Copperleaf Bakery',
    'workshops',
    [
      { alias: 'sourdough-basics', title: 'Sourdough basics' },
      { alias: 'croissant-day', title: 'Croissant day' }
    ],
    { 'footer-offerings': 'Our workshops', 'footer-company': 'Copperleaf' }
  ],
  [
    'Juniper Dental',
    'treatments',
    [
      { alias: 'cleaning', title: 'Cleaning' },
      { alias: 'whitening', title: 'Whitening' },
      { alias: 'implants', title: 'Implants' }
    ],
    { 'footer-offerings': 'Treatments we offer', 'footer-company': 'Juniper Dental' }
  ]
]) {
  const sitePlan = {
    brand: { name: { value: name }, description: { value: `${name} description.` } },
    pages: [
      { id: 'home', path: '/', role: 'home', decision: 'keep' },
      { id: index, path: `/${index}`, role: 'other', decision: 'keep' },
      { id: 'about', path: '/about', role: 'about', decision: 'keep' },
      { id: 'about/team', path: '/about/team', role: 'team', decision: 'keep' },
      { id: 'about/contact', path: '/about/contact', role: 'contact', decision: 'keep' }
    ]
  }
  const header = `<header><nav><ul><li><a href="/index.php">Home</a></li><li><a href="/index.php/${index}">X</a></li><li><a href="/index.php/about/contact">Contact</a></li></ul></nav></header>`
  const indexPage = `<main>${offerings.map((o) => `<a href="/index.php/${index}/${o.alias}">${o.title}</a>`).join('')}</main>`

  test(`${name}: the demo footer is checked incomplete, then every kept page and offering is listed under the business's headings`, async () => {
    const native = site(index, offerings)
    const pages = () => [
      { path: '/', status: 200, html: header + renderFooter(native, index, offerings) },
      { path: `/${index}`, status: 200, html: header + indexPage + renderFooter(native, index, offerings) }
    ]
    const before = checkFooterNavigation({ pages: pages(), sitePlan, contentMap })
    assert.equal(before.pass, false)
    for (const reason of ['footer-missing-page', 'footer-demo-heading', 'footer-dead-link'])
      assert.ok(
        before.findings.some((f) => f.reason === reason),
        reason
      )

    let asked = null
    const result = await writeJoomlaFooterNavigation({
      apply: native.apply,
      siteKey: 'fictional',
      sitePlan,
      contentMap,
      known: { home: 'Home', [index]: 'Offerings', 'about/contact': 'Contact' },
      model: {
        chat: async ({ messages }) => {
          asked = JSON.parse(messages[1].content)
          return JSON.stringify({
            headings,
            labels: Object.fromEntries(
              asked.links.map((l) => [l.key, l.name || { about: 'About', team: 'Our team' }[l.role]])
            )
          })
        }
      }
    })
    assert.deepEqual(
      asked.columns.map((c) => c.demoHeading),
      ['CLASSES', 'SITE MAP']
    )
    assert.equal(result.columns[0].links.length, 1 + offerings.length)
    assert.deepEqual(
      result.columns[1].links.map((l) => l.label),
      ['Home', 'About', 'Our team', 'Contact']
    )
    assert.deepEqual(
      native.modules.map((m) => [m.title, m.published]),
      [
        [headings['footer-offerings'], 1],
        [headings['footer-company'], 1]
      ]
    )
    const after = checkFooterNavigation({ pages: pages(), sitePlan, contentMap })
    assert.deepEqual(after.findings, [])
    assert.equal(after.pass, true)
  })

  test(`${name}: a demo heading or a generic action from the model is refused before any write`, async () => {
    const native = site(index, offerings)
    for (const answer of [
      { headings: { ...headings, 'footer-company': 'Site map' } },
      { headings, labelOverride: 'Learn more' }
    ])
      await assert.rejects(
        writeJoomlaFooterNavigation({
          apply: async (call) => {
            if (call.action !== 'content.list') assert.fail('nothing may be written')
            return native.apply(call)
          },
          siteKey: 'fictional',
          sitePlan,
          contentMap,
          model: {
            chat: async ({ messages }) =>
              JSON.stringify({
                headings: answer.headings,
                labels: Object.fromEntries(
                  JSON.parse(messages[1].content).links.map((l) => [
                    l.key,
                    answer.labelOverride ?? l.name ?? l.role
                  ])
                )
              })
          }
        }),
        /FOOTER_INVALID/
      )
  })
}

test('the footer has fewer links than the header and a map without footer groups is not judged', () => {
  const sitePlan = { pages: [{ id: 'home', path: '/', role: 'home', decision: 'keep' }] }
  const html =
    '<header><nav><a href="/">Home</a><a href="/a">A</a><a href="/b">B</a></nav></header><footer><ul><li><a href="/">Home</a></li></ul></footer>'
  const report = checkFooterNavigation({ pages: [{ path: '/', html }], sitePlan, contentMap })
  assert.ok(report.findings.some((f) => f.reason === 'footer-shorter-than-header'))
  assert.equal(
    checkFooterNavigation({ pages: [{ path: '/', html }], sitePlan, contentMap: { slots: [] } }),
    null
  )
})

test('the build result fails while the footer misses a kept page', async () => {
  const { runLeftoverCheck } = await import('../src/opportunities-build/demo-leftover-check.js')
  const r = await runLeftoverCheck({
    readPage: async (path) =>
      path.includes('missing-page')
        ? { status: 404, html: '' }
        : {
            status: 200,
            html: '<header><nav><a href="/">Home</a><a href="/services">Treatments</a></nav></header><footer><ul><li><a href="/">Home</a></li></ul></footer>'
          },
    check: () => ({ pass: true, findings: [], counts: {} }),
    contentMap,
    brief: {},
    sitePlan: {
      pages: [
        { id: 'home', path: '/', role: 'home', decision: 'keep' },
        { id: 'services', path: '/services', role: 'services', decision: 'keep' }
      ]
    },
    paths: ['/services']
  })
  assert.equal(r.pass, false)
  assert.equal(r.footerNavigation.pass, false)
  assert.ok(r.findings.some((f) => f.kind === 'footer-navigation' && f.reason === 'footer-missing-page'))
})
