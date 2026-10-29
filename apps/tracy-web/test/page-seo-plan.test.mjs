/**
 * Every kept page says the site plan's own search title and description, and the not-found page speaks for the business
 * (spec TracyHQ/tracy#189, round 9, class G and I): the Joomla write (`pageMetaSteps`, `writePageTitles`) and the final check
 * of the served pages (`page-seo-check.js`). Every business is made up.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { pageMetaSteps, shippedPageMeta } from '../src/sites/brief-engines/joomla-tidy.js'
import { NAME_OFF, writePageTitles } from '../src/sites/brief-engines/joomla-page-titles.js'
import { checkPageSeo, unusedBriefContent } from '../src/opportunities-build/page-seo-check.js'

const CONTRACTS = fileURLToPath(
  new URL('../../../packages/cms/tracy-joomla-quickstart/contracts/', import.meta.url)
)

/** A release's menu as the site holds it after install. */
function releaseMenu(release) {
  const dir = path.join(CONTRACTS, release)
  const { entities } = JSON.parse(readFileSync(path.join(dir, 'presentation-lock.json'), 'utf8'))
  const rows = Object.entries(entities)
    .filter(([key]) => key.startsWith('menuItem-'))
    .map(([key, row]) => ({ id: Number(key.slice('menuItem-'.length)), ...row }))
  return { dir, rows }
}

const written = (steps, id) => {
  const step = steps.find((s) => s.id === id)
  return step ? JSON.parse(step.fields.params) : null
}

/** A made-up bakery's plan for the pages it keeps. */
const bakeryPlan = [
  {
    id: 'home',
    path: '/',
    role: 'home',
    title: 'Sourdough and pastries in Ashby Vale | Copperleaf Bakery',
    description: 'Copperleaf Bakery, based in Ashby Vale. Sourdough and pastries.'
  },
  {
    id: 'about-us/contact',
    path: '/about-us/contact',
    role: 'contact',
    title: 'Contact | Copperleaf Bakery',
    description: 'Contact Copperleaf Bakery in Ashby Vale: call +44 20 7946 0321.'
  },
  {
    id: 'classes',
    path: '/classes',
    role: 'services',
    title: 'Sourdough and pastries | Copperleaf Bakery',
    description: 'Sourdough and pastries with Copperleaf Bakery in Ashby Vale.'
  }
]

test('every kept menu entry takes its planned title and description, the home included, whatever it held', () => {
  const { dir, rows } = releaseMenu('ja-boxing/j6/1.0.8')
  const home = rows.find((r) => Number(r.home) === 1)
  const contact = rows.find((r) => r.path === 'about-us/contact')
  const services = rows.find((r) => r.path === 'classes')
  const { steps } = pageMetaSteps({
    rows,
    visible: new Set(['en-GB']),
    owner: {
      name: 'Copperleaf Bakery',
      title: bakeryPlan[0].title,
      said: 'Copperleaf Bakery',
      about: 'A warm little bakery. Come and find your loaf with us.',
      pages: bakeryPlan
    },
    wroteIn: 'en-GB',
    shipped: shippedPageMeta(dir)
  })
  for (const [row, plan] of [
    [home, bakeryPlan[0]],
    [contact, bakeryPlan[1]],
    [services, bakeryPlan[2]]
  ]) {
    const after = written(steps, row.id)
    assert.ok(after, `entry ${row.path} is written`)
    assert.equal(after.page_title, plan.title)
    assert.equal(after['menu-meta_description'], plan.description)
  }
})

test('a site written in another language keeps the old rule: the English plan is not written onto it', () => {
  const { dir, rows } = releaseMenu('ja-boxing/j6/1.0.8')
  const contact = rows.find((r) => r.path === 'about-us/contact')
  const { steps } = pageMetaSteps({
    rows,
    visible: new Set(['de-DE']),
    owner: { name: 'Copperleaf Bakery', said: '', about: '', pages: bakeryPlan },
    wroteIn: 'de-DE',
    shipped: shippedPageMeta(dir)
  })
  assert.notEqual(written(steps, contact.id)?.page_title, bakeryPlan[1].title)
})

test('a site plan that titles its pages turns the site name in titles off and leaves the home title', async () => {
  const calls = []
  const done = await writePageTitles({
    name: 'Copperleaf Bakery',
    own: true,
    write: async (action, params) => calls.push({ action, params }),
    read: async () => {
      throw new Error('the menu is not read')
    },
    wrote: () => {},
    skip: (where, why) => assert.fail(`${where}: ${why}`)
  })
  assert.equal(done, true)
  assert.deepEqual(calls, [
    { action: 'site.identity', params: { operation: 'set', fields: { sitename_pagetitles: NAME_OFF } } }
  ])
})

const page = (pathName, title, description, lang = 'en-gb') => ({
  path: pathName,
  status: 200,
  html: `<html lang="${lang}"><head><title>${title}</title>${
    description === null ? '' : `<meta name="description" content="${description}">`
  }</head><body><p>Copperleaf Bakery</p></body></html>`
})

const sitePlan = {
  brand: { name: { value: 'Copperleaf Bakery' } },
  pages: [
    { id: 'home', path: '/', role: 'home', decision: 'keep' },
    { id: 'pages/j-content/category-blog', role: 'sample', decision: 'drop', reason: 'showcase-page' }
  ],
  seo: {
    pages: bakeryPlan.slice(0, 2),
    notFound: { message: 'This page is not on the Copperleaf Bakery site. Go back to the home page, or contact us.' }
  }
}

test('the final check holds the served title and description against the plan', () => {
  const clean = checkPageSeo({
    pages: [
      page('/', bakeryPlan[0].title, bakeryPlan[0].description),
      page('/about-us/contact', bakeryPlan[1].title.replace('&', '&amp;'), bakeryPlan[1].description)
    ],
    sitePlan
  })
  assert.deepEqual(clean, [])
  const off = checkPageSeo({
    pages: [
      page('/', 'Copperleaf Bakery', 'Come and find your loaf with us.'),
      page('/about-us/contact', 'Contact - Copperleaf Bakery', null)
    ],
    sitePlan
  })
  assert.deepEqual(
    off.map((f) => [f.kind, f.severity, f.page, f.found]),
    [
      ['page-seo', 'major', '/', 'Copperleaf Bakery'],
      ['page-seo', 'major', '/', 'Come and find your loaf with us.'],
      ['page-seo', 'major', '/about-us/contact', 'Contact - Copperleaf Bakery'],
      ['page-seo', 'major', '/about-us/contact', '(none)']
    ]
  )
})

test('a not-found page in the CMS words is a finding; one naming the business is not', () => {
  const missing = '/tracy-missing'
  const cms = {
    path: missing,
    status: 404,
    html: '<html lang="en-gb"><title>Error: 404 Page not found</title><p><strong>An error has occurred while processing your request.</strong></p><a href="/">Home Page</a></html>'
  }
  const [finding] = checkPageSeo({ pages: [cms], sitePlan, missingPath: missing })
  assert.equal(finding.kind, 'not-found-page')
  assert.equal(finding.severity, 'minor')
  const own = {
    path: missing,
    status: 404,
    html: '<html lang="en-gb"><h1>Page not found</h1><p>This page is not on the Copperleaf Bakery site.</p></html>'
  }
  assert.deepEqual(checkPageSeo({ pages: [own], sitePlan, missingPath: missing }), [])
})

test('the brief content no page shows is listed with why: posts, videos, social figures', () => {
  const brief = {
    content: {
      items: [
        { id: 'post:1', authorship: 'page', title: 'Our rye is back on Saturdays' },
        { id: 'post:2', authorship: 'page', title: 'Copperleaf Bakery' }
      ]
    },
    assets: [{ id: 'v1', kind: 'video' }],
    facts: [{ id: 'f1', field: 'socialFigures', value: { label: 'followers', amount: 2481 } }]
  }
  const unused = unusedBriefContent({ pages: [page('/', 'x', 'y')], brief, sitePlan })
  assert.deepEqual(
    unused.map((u) => [u.kind, u.id]),
    [
      ['post', 'post:1'],
      ['video', 'v1'],
      ['social-figure', 'f1']
    ]
  )
  assert.match(unused[0].why, /sample pages/)
})
