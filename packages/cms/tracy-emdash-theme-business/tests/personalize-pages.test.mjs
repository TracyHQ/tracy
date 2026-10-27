// tools/personalize.mjs, the pages a customer unticked in Tracy's "Pages" question (TCH #1013, T23): the answer `hidePages`
// names them by the id the release's tracy_site_pages.json lists (the page record's slug); each is unpublished in every
// language the run writes and the menu items that led there are dropped — the same doors a `hide` rule's page goes
// through — and `--revert` brings both back. The home page never goes. Written against its own tiny seed (as
// `personalize-journal.test.mjs` is), so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { templateHideRules, unpickedPageRules } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const both = (slug, data) => [
  { slug, locale: 'en', data },
  { slug, locale: 'ru', data }
]
const seed = {
  defaultLocale: 'en',
  content: {
    site: both('site', { brand_name: 'DEMO WORKS' }),
    home: both('home', { title: 'Demo' }),
    about: both('about', { title: 'About' }),
    news_page: both('news', { title: 'News' }),
    services_page: both('services_page', { title: 'Services' }),
    services: [
      { slug: 'design', locale: 'en', data: { title: 'Design' } },
      { slug: 'build', locale: 'en', data: { title: 'Build' } }
    ],
    pages: [{ slug: 'privacy', locale: 'en', data: { title: 'Privacy' } }]
  },
  menus: ['en', 'ru'].map((locale) => ({
    id: `menu:primary:${locale}`,
    name: 'primary',
    locale,
    items: [
      { type: 'custom', label: 'Home', url: locale === 'en' ? '/' : '/ru' },
      { type: 'custom', label: 'About', url: locale === 'en' ? '/about' : '/ru/about' },
      { type: 'custom', label: 'Services', url: locale === 'en' ? '/services' : '/ru/services' },
      { type: 'custom', label: 'News', url: locale === 'en' ? '/news' : '/ru/news' }
    ]
  }))
}
const map = { identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' }] }
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-pages-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

function site() {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale, e.data)
  for (const menu of seed.menus)
    for (const item of menu.items) mock.state.addMenuItem('primary', menu.locale, item.label, item.url)
  return mock
}

function run(args) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [TOOL, ...args],
      { cwd: ROOT, env: { ...process.env, ...NO_MODEL }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

function args(url, answers, seedDir = SEED_DIR) {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-pages-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  const common = [
    '--seed',
    seedDir,
    '--site',
    url,
    '--token-file',
    path.join(dir, 'token'),
    '--receipts',
    path.join(dir, 'receipts.json'),
    '--json'
  ]
  return { write: [...common, '--answers-json', JSON.stringify(answers), '--no-model'], common }
}

const status = (mock, collection, locale) =>
  [...mock.state.entries.values()].find((e) => e.collection === collection && e.locale === locale)?.status
const labels = (mock, locale) =>
  [...mock.state.menuItems.values()]
    .filter((i) => i.menu === 'primary' && i.locale === locale)
    .map((i) => i.label)
    .sort()

test('an unticked id becomes a hide rule on its page record; the address its menu item links is found when it is not the slug', () => {
  const { rules, skipped } = unpickedPageRules(
    { hidePages: ['news', 'services_page', 'home', 'nope', 'news'] },
    seed
  )
  assert.deepEqual(rules, [
    { collection: 'news_page', slug: 'news', why: 'the customer did not pick this page' },
    {
      collection: 'services_page',
      slug: 'services_page',
      path: '/services',
      why: 'the customer did not pick this page'
    }
  ])
  assert.deepEqual(
    skipped.map((s) => s.rule),
    ['pages home', 'pages nope']
  )
  assert.deepEqual(unpickedPageRules({}, seed), { rules: [], skipped: [] })
})

test('News unticked: its page is off the site in every language written, its menu items are gone, and --revert brings both back', async () => {
  const mock = site()
  const url = await mock.listen()
  try {
    const a = args(url, {
      name: 'Golden Crust',
      languages: ['en', 'ru'],
      hidePages: ['news', 'services_page']
    })
    const r = await run(a.write)
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [])
    for (const locale of ['en', 'ru']) {
      assert.equal(status(mock, 'news_page', locale), 'draft', `news/${locale} is unpublished`)
      assert.equal(status(mock, 'services_page', locale), 'draft', `services_page/${locale} is unpublished`)
      assert.equal(status(mock, 'home', locale), 'published')
      assert.equal(status(mock, 'about', locale), 'published', 'a page left ticked stays')
      assert.deepEqual(labels(mock, locale), ['About', 'Home'], `the ${locale} menu leads to no hidden page`)
    }
    const back = await run([...a.common, '--revert', report.applyId])
    assert.equal(back.code, 0, back.stdout + back.stderr)
    for (const locale of ['en', 'ru']) {
      assert.equal(status(mock, 'news_page', locale), 'published')
      assert.equal(status(mock, 'services_page', locale), 'published')
      assert.deepEqual(labels(mock, locale), ['About', 'Home', 'News', 'Services'])
    }
  } finally {
    await mock.close()
  }
})

test('the home page is never hidden, even when its id comes unticked', async () => {
  const mock = site()
  const url = await mock.listen()
  try {
    const r = await run(args(url, { name: 'Golden Crust', languages: ['en'], hidePages: ['home'] }).write)
    const report = JSON.parse(r.stdout)
    assert.equal(status(mock, 'home', 'en'), 'published')
    assert.deepEqual(labels(mock, 'en'), ['About', 'Home', 'News', 'Services'])
    assert.ok(report.skipped.some((s) => s.rule === 'pages home' && /never hidden/.test(s.why)))
  } finally {
    await mock.close()
  }
})

// 🔒 A PAGE IS HIDDEN ONLY WHEN THE CUSTOMER UNTICKED IT (product owner, 08/10/2026, TCH #1013). Tracy SaaS shipped a `hide`
// rule that always unpublished its Pricing page while the release offered Pricing as a page to keep: ticked, and still 404
// (measured 08/10/2026 on dev). A template's own hide rule was its guess for a customer who was not asked; no such rule hides
// a page now, ticked, unasked or never listed, and the page keeps the template's words.
const hiding = { ...map, hide: [{ collection: 'pages', slug: 'privacy', why: 'a demo policy' }] }
const HIDING_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-pages-hiding-'))
writeFileSync(path.join(HIDING_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(HIDING_DIR, 'personalize.json'), JSON.stringify(hiding))

test('a template hide rule never applies, whether the page was kept, not listed, or the pages were not asked', () => {
  assert.deepEqual(templateHideRules(hiding, { keepPages: ['home', 'privacy'] }), [])
  assert.deepEqual(templateHideRules(hiding, { keepPages: ['home'] }), [])
  assert.deepEqual(templateHideRules(hiding, {}), [])
  assert.deepEqual(templateHideRules({}, { keepPages: ['privacy'] }), [])
})

test('a page a template rule names stays published unless the customer unticked it', async () => {
  for (const [answers, want] of [
    [{ name: 'Golden Crust', languages: ['en'], keepPages: ['home', 'privacy'] }, 'published'],
    [{ name: 'Golden Crust', languages: ['en'], keepPages: ['home'] }, 'published'],
    [{ name: 'Golden Crust', languages: ['en'] }, 'published'],
    [{ name: 'Golden Crust', languages: ['en'], hidePages: ['privacy'] }, 'draft']
  ]) {
    const mock = site()
    const url = await mock.listen()
    try {
      const r = await run(args(url, answers, HIDING_DIR).write)
      assert.deepEqual(JSON.parse(r.stdout).errors, [])
      assert.equal(status(mock, 'pages', 'en'), want, JSON.stringify(answers))
    } finally {
      await mock.close()
    }
  }
})

/** A model that writes every copy field as "vi copy" and translates every label as `vi:<label>`. */
async function modelServer() {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const user = JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages[1].content)
    const answer = user.labels
      ? Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `vi:${v}`]))
      : Array.isArray(user.fields)
        ? Object.fromEntries(user.fields.map((f) => [f.key, 'vi copy']))
        : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, close: () => server.close() }
}

// 🔒 AN UNTICKED PAGE STAYS OFF ON A SITE IN ANY LANGUAGE (TCH #1013, task 9). Measured 08/10/2026 on dev (Tracy Business
// EmDash 1.7.2, a site in Vietnamese): Projects unticked, yet `/projects` answered 200 and the home page linked it ten
// times. The root written in Vietnamese has its page labels translated (`labels` names the page entry), and the write door
// PUTs and then PUBLISHES, so the labels lane published the page the hide step had just unpublished. An English site has no
// labels lane, which is why only a non-English site showed it.
const labelled = { ...map, labels: [{ collection: 'site' }, { collection: 'news_page' }] }
const LABELLED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-pages-labelled-'))
writeFileSync(path.join(LABELLED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(LABELLED_DIR, 'personalize.json'), JSON.stringify(labelled))

test('a site written in Vietnamese: the unticked page stays unpublished and out of the menu, though its labels are translated', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  try {
    const a = args(url, { name: 'Golden Crust', languages: ['vi'], hidePages: ['news'] }, LABELLED_DIR)
    const write = a.write.filter((x) => x !== '--no-model')
    const r = await new Promise((resolve) => {
      execFile(
        'node',
        [TOOL, ...write, '--no-images'],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            ...NO_MODEL,
            TRACY_MODEL_URL: model.url,
            TRACY_MODEL_KEY: 'k-test',
            TRACY_MODEL_NAME: 'm-test'
          },
          maxBuffer: 64 * 1024 * 1024
        },
        (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
      )
    })
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    assert.equal(
      status(mock, 'news_page', 'en'),
      'draft',
      'the unticked page is off the root written in Vietnamese'
    )
    assert.equal(status(mock, 'about', 'en'), 'published', 'a page left ticked stays')
    assert.ok(!labels(mock, 'en').some((l) => /News/.test(l)), 'no menu item leads to the unticked page')
  } finally {
    await mock.close()
    model.close()
  }
})

// 🔒 AN UNTICKED PAGE GOES FROM EVERY EDITION THE SITE SERVES (TCH #1013, PAGE-1, 09/10/2026). With no language chosen every
// edition stays published (LANG-5), but the unticked page was unpublished only in the locales written (the root and
// English): its other editions (`/de/careers` on Tracy Business) stayed open, and their menus still led there.
test('no language chosen: the unticked page is off every edition still served, and no menu leads to it', async () => {
  const mock = site()
  const url = await mock.listen()
  try {
    const r = await run(args(url, { name: 'Golden Crust', hidePages: ['news'] }).write)
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.language.hidden, [], 'no language chosen hides no locale')
    for (const locale of ['en', 'ru']) {
      assert.equal(status(mock, 'news_page', locale), 'draft', `news/${locale} is unpublished`)
      assert.equal(status(mock, 'about', locale), 'published', `about/${locale}, ticked, stays`)
      assert.equal(status(mock, 'site', locale), 'published', `the ${locale} edition is still served`)
      assert.deepEqual(
        labels(mock, locale),
        ['About', 'Home', 'Services'],
        `the ${locale} menu leads to no hidden page`
      )
    }
  } finally {
    await mock.close()
  }
})
