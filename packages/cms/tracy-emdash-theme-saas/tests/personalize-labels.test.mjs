// tools/personalize.mjs, the labels of a root written in another language (TCH #1013): a customer who asked for Vietnamese
// had every page in Vietnamese and the chrome around it still in the template's English — the menu ("Home", "Pricing",
// "Contact us"), the header and footer labels of the chrome entries (measured 08/10/2026 on dev, tamq-7q-edvi). Those
// words are translated by the model the copy is written with, written through the same journaled doors, and `--revert`
// puts the English back. A run written in the root's own language asks nothing. Written against its own tiny seed (as
// `personalize-journal.test.mjs` is), so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { acceptLabel, chromeLabelsOf, menuLabelsOf } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const chrome = {
  title: 'Site chrome (EN)',
  brand_name: 'DEMO WORKS',
  tagline: 'Built to last',
  home_label: 'Home',
  quote_url: '/contact',
  sales_email: 'sales@demo.example',
  social_handle: '@demo',
  results_line: '{count} results for “{query}”',
  language_name: 'English',
  footer_links: [{ label: 'Privacy', url: '/privacy' }],
  hero_image_alt: 'A workshop'
}
const seed = {
  defaultLocale: 'en',
  content: {
    site: [{ slug: 'site', locale: 'en', data: chrome }],
    newsletter: [
      {
        slug: 'footer-newsletter',
        locale: 'en',
        data: { title: 'Monthly dispatch', button_label: 'Subscribe' }
      }
    ],
    pages: [{ slug: 'about', locale: 'en', data: { title: 'About Demo' } }]
  },
  menus: [
    {
      id: 'menu:primary:en',
      name: 'primary',
      locale: 'en',
      items: [
        { type: 'custom', label: 'Home', url: '/' },
        {
          type: 'custom',
          label: 'Company',
          url: '/about',
          children: [{ type: 'custom', label: 'Contact us', url: '/contact' }]
        }
      ]
    }
  ]
}
const map = {
  identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' }],
  copy: [{ collection: 'site', slug: 'site', field: 'tagline', brief: 'one short line', maxWords: 8 }],
  labels: [{ collection: 'site' }, { collection: 'newsletter', slug: 'footer-newsletter' }]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-labels-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

test('the chrome labels are the words a visitor reads, never an address, a name, a copy field or an answer', () => {
  const entries = seed.content.site.map((e) => ({
    collection: 'site',
    slug: e.slug,
    locale: e.locale,
    data: e.data
  }))
  const patches = new Map([
    [
      'site/site/en',
      {
        fields: { brand_name: 'Golden Crust', title: 'Site chrome (Golden Crust)' },
        origins: { brand_name: 'customer', title: 'replaced' }
      }
    ]
  ])
  const got = chromeLabelsOf({ map, seedEntries: entries, locale: 'en', patches })
  assert.deepEqual(
    got.map((l) => [l.id, l.text]),
    [
      ['site/site.title', 'Site chrome (Golden Crust)'],
      ['site/site.home_label', 'Home'],
      ['site/site.results_line', '{count} results for “{query}”'],
      ['site/site.footer_links.0.label', 'Privacy'],
      ['site/site.hero_image_alt', 'A workshop']
    ]
  )
  // A map that names no chrome reads the `site` entry, which is where the business and base templates keep it.
  assert.equal(chromeLabelsOf({ map: {}, seedEntries: entries, locale: 'en', patches: new Map() }).length, 6)
  assert.deepEqual(chromeLabelsOf({ map, seedEntries: entries, locale: 'ru', patches }), [])
})

test('the menu labels are read from the seed, children included, once each', () => {
  assert.deepEqual(menuLabelsOf(seed, 'en'), ['Home', 'Company', 'Contact us'])
  assert.deepEqual(menuLabelsOf(seed, 'ru'), [])
})

test('a translation keeps every placeholder and stays a label', () => {
  assert.equal(acceptLabel('Home', ' Trang chủ '), 'Trang chủ')
  assert.equal(acceptLabel('{count} results', '{count} kết quả'), '{count} kết quả')
  assert.equal(acceptLabel('{count} results', 'kết quả'), null, 'a placeholder lost')
  assert.equal(acceptLabel('Home', ''), null)
  assert.equal(acceptLabel('Home', 'x'.repeat(80)), null, 'a label is not a paragraph')
  assert.equal(acceptLabel('Home', 42), null)
})

/**
 * A model that writes copy as "vi copy" and translates every label: a line of several words into Vietnamese words (`VI`),
 * one word as `vi:<label>`; it keeps what it was asked. A line that kept a common English word would be asked again
 * (`wordsLeft`, g64), so this model, obedient, leaves none.
 */
const VI = {
  'Site chrome (EN)': 'Khung trang (EN)',
  '{count} results for “{query}”': '{count} kết quả cho “{query}”',
  'A workshop': 'Một xưởng làm việc',
  'Contact us': 'Liên hệ',
  'Monthly dispatch': 'Bản tin hằng tháng'
}
async function modelServer() {
  const asked = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    asked.push({ system: body.messages[0].content, user })
    const answer = user.labels
      ? Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, VI[v] ?? `vi:${v}`]))
      : Array.isArray(user.fields)
        ? Object.fromEntries(user.fields.map((f) => [f.key, 'vi copy']))
        : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, asked, close: () => server.close() }
}

function site() {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale, e.data)
  mock.state.addMenuItem('primary', 'en', 'Home', '/')
  mock.state.addMenuItem('primary', 'en', 'Company', '/about')
  mock.state.addMenuItem('primary', 'en', 'Contact us', '/contact')
  // A label Tracy already made the customer's before the tool ran (`emdash-menus.js`): not the seed's, so not translated.
  mock.state.addMenuItem('primary', 'en', 'Bánh mì', '/services')
  return mock
}

function run(args, env) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [TOOL, ...args],
      { cwd: ROOT, env: { ...process.env, ...NO_MODEL, ...env }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

function common(url) {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-labels-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return [
    '--seed',
    SEED_DIR,
    '--site',
    url,
    '--token-file',
    path.join(dir, 'token'),
    '--receipts',
    path.join(dir, 'receipts.json'),
    '--json'
  ]
}

const live = (mock, collection) =>
  [...mock.state.entries.values()].find((e) => e.collection === collection && e.locale === 'en')
const menu = (mock) =>
  [...mock.state.menuItems.values()]
    .filter((i) => i.menu === 'primary' && i.locale === 'en')
    .map((i) => i.label)

test('a root written in Vietnamese: the menu and the chrome labels are Vietnamese, and --revert puts the English back', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  const env = { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
  try {
    const args = common(url)
    const r = await run(
      [
        ...args,
        '--answers-json',
        JSON.stringify({ name: 'Golden Crust', about: 'A bakery in Hanoi.', languages: ['vi'] }),
        '--no-images'
      ],
      env
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    const asked = model.asked.filter((a) => a.user.labels)
    assert.equal(
      asked.length,
      1,
      `the labels are one question: ${JSON.stringify(asked.map((a) => a.user.labels))}`
    )
    assert.match(asked[0].system, /Vietnamese/)
    const s = live(mock, 'site').live
    assert.equal(s.home_label, 'vi:Home')
    assert.equal(s.results_line, '{count} kết quả cho “{query}”')
    assert.deepEqual(s.footer_links, [{ label: 'vi:Privacy', url: '/privacy' }])
    assert.equal(s.hero_image_alt, 'Một xưởng làm việc')
    assert.equal(s.tagline, 'vi copy', 'a copy field is the copy step’s, not translated over')
    assert.equal(s.brand_name, 'GOLDEN CRUST', 'the customer’s name is not translated')
    assert.equal(s.quote_url, '/contact')
    assert.equal(s.sales_email, 'sales@demo.example')
    assert.equal(
      s.language_name,
      'Tiếng Việt',
      'the switcher names the language the root is written in, in itself'
    )
    assert.equal(live(mock, 'newsletter').live.button_label, 'vi:Subscribe')
    assert.deepEqual(menu(mock), ['vi:Home', 'vi:Company', 'Liên hệ', 'Bánh mì'])

    const back = await run([...args, '--revert', report.applyId])
    assert.equal(back.code, 0, back.stdout + back.stderr)
    const b = live(mock, 'site').live
    assert.equal(b.home_label, 'Home')
    assert.deepEqual(b.footer_links, [{ label: 'Privacy', url: '/privacy' }])
    assert.equal(b.language_name, 'English')
    assert.equal(live(mock, 'newsletter').live.button_label, 'Subscribe')
    assert.deepEqual(menu(mock), ['Home', 'Company', 'Contact us', 'Bánh mì'])
  } finally {
    await mock.close()
    model.close()
  }
})

test('a root written in its own language asks nothing about labels and leaves them', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  const env = { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
  try {
    const r = await run(
      [
        ...common(url),
        '--answers-json',
        JSON.stringify({ name: 'Golden Crust', languages: ['en'] }),
        '--no-images'
      ],
      env
    )
    assert.deepEqual(JSON.parse(r.stdout).errors, [], r.stderr)
    assert.equal(model.asked.filter((a) => a.user.labels).length, 0)
    assert.equal(live(mock, 'site').live.home_label, 'Home')
    assert.equal(live(mock, 'site').live.language_name, 'English')
    assert.deepEqual(menu(mock), ['Home', 'Company', 'Contact us', 'Bánh mì'])
  } finally {
    await mock.close()
    model.close()
  }
})
