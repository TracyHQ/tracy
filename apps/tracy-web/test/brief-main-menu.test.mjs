import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mainMenuRole } from 'website-opportunities/domain/main-menu.mjs'
import { writeMainMenu } from '../src/sites/brief-engines/main-menu.js'
import { checkMainMenu } from '../src/opportunities-build/main-menu-check.js'

for (const [name, about, offering, team] of [
  ['Copperleaf Bakery', 'Sourdough workshops and pastries, taught by our bakers.', 'Workshops', 'Our bakers'],
  ['Juniper Dental', 'Preventive treatments from our dental team.', 'Treatments', 'Our dentists']
]) {
  test(`${name}: final menu labels follow kept page roles after empty copy pins and cleanup`, async () => {
    const pages = [
      { id: 'home', path: '/', role: 'home', decision: 'keep' },
      { id: 'classes', path: '/classes', role: 'services', decision: 'keep' },
      { id: 'about', path: '/about', role: 'about', decision: 'keep' },
      { id: 'about/trainers', path: '/about/trainers', role: 'team', decision: 'keep' },
      { id: 'pricing', path: '/pricing', role: 'pricing', decision: 'drop' }
    ]
    let items = pages.slice(0, 4).map((p, i) => ({
      key: String(i),
      path: p.path,
      label: i === 1 ? '' : i === 3 ? 'Learn more' : 'Contact',
      parent: i === 3 ? '2' : '',
      menu: 'primary'
    }))
    const writes = []
    const output = await writeMainMenu({
      sitePlan: { pages, brand: { name: { value: name }, description: { value: about } } },
      read: async () => structuredClone(items),
      write: async (rows) => {
        writes.push(rows)
        items = items.map((item) => ({ ...item, label: rows.find((r) => r.key === item.key).label }))
      },
      model: {
        chat: async ({ messages }) => {
          const input = JSON.parse(messages[1].content)
          assert.equal(input.business.description, about)
          assert.deepEqual(
            input.items.map((i) => i.role),
            ['home', 'services', 'about', 'team']
          )
          return JSON.stringify({ labels: { 0: 'Home', 1: offering, 2: 'About', 3: team } })
        }
      }
    })
    assert.equal(writes.length, 1)
    assert.deepEqual(
      output.items.map((i) => i.label),
      ['Home', offering, 'About', team]
    )
    const nav = (rows) =>
      `<header><nav><ul>${rows.map((i) => `<li><a href="/index.php${i.path === '/' ? '' : i.path}">${i.label}</a></li>`).join('')}</ul></nav></header>`
    assert.equal(checkMainMenu({ pages: [{ path: '/', html: nav(items) }], sitePlan: { pages } }).pass, true)
    const broken = checkMainMenu({
      pages: [{ path: '/', html: nav(items.map((i) => (i.key === '1' ? { ...i, label: '' } : i))) }],
      sitePlan: { pages }
    })
    assert.equal(broken.pass, false)
    assert.ok(broken.findings.some((f) => f.href === '/classes' && f.reason === 'empty-label'))
  })
}

test('page roles distinguish offerings, team children and booking from contact', () => {
  assert.equal(mainMenuRole({ id: 'classes' }), 'services')
  assert.equal(mainMenuRole({ id: 'about/our-trainers' }), 'team')
  assert.equal(mainMenuRole({ id: 'booking' }), 'booking')
  assert.equal(mainMenuRole({ id: 'services/cleaning', role: 'other' }), 'offering-detail')
})

test('an invalid model label takes the page title, recorded; with no valid title it is a blocker finding, never a stop', async () => {
  const read = async () => [{ key: 's', path: '/services', parent: '', menu: 'primary' }]
  for (const label of ['', 'Learn more', 'Contact', 'x'.repeat(80)]) {
    const written = []
    const out = await writeMainMenu({
      sitePlan: {
        pages: [{ id: 'services', path: '/services', role: 'services', label: 'Haircuts', decision: 'keep' }]
      },
      read: async () => (written.length ? written.at(-1) : await read()),
      write: async (rows) => written.push(rows),
      model: { chat: async () => JSON.stringify({ labels: { s: label } }) }
    })
    assert.deepEqual(
      out.items.map((i) => i.label),
      ['Haircuts']
    )
    assert.equal(out.fallbacks.length, 1)
    assert.equal(out.fallbacks[0].label, 'Haircuts')
    assert.deepEqual(out.findings, [])
  }
  const out = await writeMainMenu({
    sitePlan: { pages: [{ id: 'services', path: '/services', role: 'services', decision: 'keep' }] },
    read,
    write: async () => {},
    model: { chat: async () => JSON.stringify({ labels: { s: 'Learn more' } }) }
  })
  assert.deepEqual(out.items, [])
  assert.equal(out.findings[0].severity, 'blocker')
  assert.equal(out.findings[0].key, 's')
})

test('missing placements and refused writes fail clearly; duplicate siblings take their page titles', async () => {
  const sitePlan = { pages: [{ id: 'services', path: '/services', role: 'services', decision: 'keep' }] }
  await assert.rejects(
    writeMainMenu({ sitePlan, read: async () => [], model: null }),
    /MAIN_MENU_MISSING_PAGE/
  )
  await assert.rejects(
    writeMainMenu({
      sitePlan,
      read: async () => [{ key: 's', path: '/services', label: 'Demo', parent: '', menu: 'primary' }],
      write: async () => {},
      model: { chat: async () => '{"labels":{"s":"Treatments"}}' }
    }),
    /MAIN_MENU_READBACK/
  )
  const duplicatePlan = {
    pages: [...sitePlan.pages, { id: 'products', path: '/products', role: 'menu', decision: 'keep' }]
  }
  duplicatePlan.pages[1].label = 'Shop'
  const dup = await writeMainMenu({
    sitePlan: duplicatePlan,
    read: async () => [
      { key: 's', path: '/services' },
      { key: 'p', path: '/products' }
    ],
    write: async () => {},
    model: { chat: async () => '{"labels":{"s":"Treatments","p":"Treatments"}}' }
  }).catch((e) => e)
  // The write is a no-op here, so the read-back reports; the labels chosen before it are what this test pins.
  assert.match(String(dup.message), /MAIN_MENU_READBACK/)
})

test('render check reads every main menu copy on every page, excludes footer and rejects missing pages and duplicates', () => {
  const sitePlan = {
    pages: [
      { path: '/', role: 'home', decision: 'keep' },
      { path: '/services', role: 'services', decision: 'keep' }
    ]
  }
  const good = '<nav><a href="/">Home</a><a href="/services">Treatments</a></nav>'
  const bad = '<nav><a href="/">Home</a><a href="/services">Learn more</a></nav>'
  const report = checkMainMenu({
    sitePlan,
    pages: [
      { path: '/', html: `<header>${good}${bad}</header><footer>${bad}</footer>` },
      { path: '/services', html: `<header><nav><a href="/">Home</a></nav></header>` }
    ]
  })
  assert.equal(report.pass, false)
  assert.ok(report.findings.some((f) => f.path === '/' && f.reason === 'generic-label'))
  assert.ok(report.findings.some((f) => f.path === '/services' && f.reason === 'unreachable-page'))
  assert.equal(
    checkMainMenu({ sitePlan, pages: [{ path: '/', html: `<footer>${good}</footer>` }] }).pass,
    false
  )
})

test('the build result fails when rendered main navigation is invalid although leftover rules pass', async () => {
  const { runLeftoverCheck } = await import('../src/opportunities-build/demo-leftover-check.js')
  const r = await runLeftoverCheck({
    readPage: async (path) =>
      path.includes('missing-page')
        ? { status: 404, html: '' }
        : {
            status: 200,
            html: '<header><nav><a href="/">Home</a><a href="/services"> </a></nav></header>'
          },
    check: () => ({ pass: true, findings: [], counts: {} }),
    contentMap: null,
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
  assert.equal(r.mainMenu.pass, false)
  assert.ok(r.findings.some((f) => f.kind === 'main-menu' && f.reason === 'empty-label'))
})

test('translated neutral actions and links to another site cannot pass as main navigation', async () => {
  const sitePlan = { pages: [{ path: '/services', role: 'services', decision: 'keep' }] }
  const refused = await writeMainMenu({
    sitePlan,
    read: async () => [{ key: 's', path: '/services' }],
    model: { chat: async () => '{"labels":{"s":"Mehr erfahren"}}' },
    write: async () => assert.fail('generic translation must be refused')
  })
  assert.equal(refused.findings[0].severity, 'blocker')
  const html = '<header><nav><a href="https://another.example/services">Treatments</a></nav></header>'
  assert.equal(
    checkMainMenu({ sitePlan, origin: 'clinic.example', pages: [{ path: '/', html }] }).pass,
    false
  )
  assert.equal(
    checkMainMenu({ sitePlan, origin: 'another.example', pages: [{ path: '/', html }] }).pass,
    true
  )
})

for (const [name, offering, team] of [
  ['Copperleaf Bakery', 'workshops', 'bakers'],
  ['Juniper Dental', 'treatments', 'dentists']
]) {
  test(`${name}: the header may leave out a team page but never home, offerings, contact or about`, async () => {
    const pages = [
      { id: 'home', path: '/', role: 'home', decision: 'keep' },
      { id: offering, path: `/${offering}`, role: 'other', decision: 'keep' },
      { id: 'about', path: '/about', role: 'about', decision: 'keep' },
      { id: `about/${team}`, path: `/about/${team}`, role: 'team', decision: 'keep' },
      { id: 'about/contact', path: '/about/contact', role: 'contact', decision: 'keep' }
    ]
    const primary = pages.filter((p) => p.role !== 'team')
    const items = primary.map((p, i) => ({
      key: String(i),
      path: p.path,
      label: '',
      parent: '',
      menu: 'primary'
    }))
    const labels = ['Home', 'Our offer', 'About', 'Contact']
    let rows = structuredClone(items)
    const written = await writeMainMenu({
      sitePlan: { pages },
      read: async () => structuredClone(rows),
      write: async (values) => {
        rows = rows.map((r) => ({ ...r, label: values.find((v) => v.key === r.key).label }))
      },
      model: {
        chat: async () => JSON.stringify({ labels: Object.fromEntries(labels.map((l, i) => [i, l])) })
      }
    })
    assert.equal(written.items.length, 4)
    const html = `<header><nav>${rows.map((r) => `<a href="${r.path}">${r.label}</a>`).join('')}</nav></header>`
    assert.equal(checkMainMenu({ pages: [{ path: '/', html }], sitePlan: { pages } }).pass, true)
    const withoutAbout = rows.filter((r) => r.path !== '/about')
    await assert.rejects(
      writeMainMenu({ sitePlan: { pages }, read: async () => withoutAbout, model: null }),
      /MAIN_MENU_MISSING_PAGE: about$/
    )
    const shorter = `<header><nav>${withoutAbout.map((r) => `<a href="${r.path}">${r.label}</a>`).join('')}</nav></header>`
    const report = checkMainMenu({ pages: [{ path: '/', html: shorter }], sitePlan: { pages } })
    assert.deepEqual(
      report.findings.map((f) => [f.reason, f.href]),
      [['unreachable-page', '/about']]
    )
  })
}
