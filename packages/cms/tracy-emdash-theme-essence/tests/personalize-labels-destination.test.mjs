// tools/personalize.mjs, one page one name (TCH #1013, PAGE-5, g65). On g64-biz-emd-full (Tracy Business 1.7.12, a bakery
// written in Vietnamese) the primary menu called /about "Giới thiệu" and the footer called it "Về chúng tôi": the template's
// "About" and "About us" were translated as two labels, and the model chose two names for one page. A label that names the
// same page as a label already translated for that URL (a word in common: "About", "About us") takes the name chosen first,
// in the menus, the footer and the chrome's links alike; a label to that page that names something else (a service in the
// footer's list of services) keeps its own words. Written against its own tiny seed, so the kit and every template carry it.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const chrome = {
  not_found_suggestions: [
    { label: 'About', url: '/about' },
    { label: 'Services', url: '/services' }
  ]
}
const MENUS = {
  primary: [
    ['About', '/about'],
    ['Services', '/services']
  ],
  footer_company: [
    ['About us', '/about'],
    ['Our team', '/about']
  ],
  footer_services: [['Sourdough loaves', '/services']]
}
const seed = {
  defaultLocale: 'en',
  content: { site: [{ slug: 'site', locale: 'en', data: chrome }] },
  menus: Object.entries(MENUS).map(([name, items]) => ({
    id: `menu:${name}:en`,
    name,
    locale: 'en',
    items: items.map(([label, url]) => ({ type: 'custom', label, url }))
  }))
}
const map = { identity: [], labels: [{ collection: 'site' }] }
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-destination-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

/** A DISOBEDIENT model: each label of a page gets its own name, and the same words get another name under another key. */
const VI = {
  About: 'Giới thiệu',
  'About us': 'Về chúng tôi',
  Services: 'Dịch vụ',
  'Our team': 'Đội ngũ',
  'Sourdough loaves': 'Bánh mì sourdough'
}
async function modelServer() {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    const answer = user.labels
      ? Object.fromEntries(
          Object.entries(user.labels).map(([k, v]) => [
            k,
            k.startsWith('site/') && v === 'About' ? 'Về công ty' : (VI[v] ?? `vi:${v}`)
          ])
        )
      : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, close: () => server.close() }
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

test('one page, one name: the footer’s "About us" and the chrome’s "About" take the menu’s name for /about', async () => {
  const mock = createMockEmdash()
  mock.state.addEntry('site', 'site', 'en', chrome)
  for (const [name, items] of Object.entries(MENUS))
    for (const [label, url] of items) mock.state.addMenuItem(name, 'en', label, url)
  const url = await mock.listen()
  const model = await modelServer()
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-destination-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  try {
    const r = await run(
      [
        '--seed',
        SEED_DIR,
        '--site',
        url,
        '--token-file',
        path.join(dir, 'token'),
        '--receipts',
        path.join(dir, 'receipts.json'),
        '--json',
        '--answers-json',
        JSON.stringify({ name: 'Golden Crust', about: 'A bakery in Hanoi.', languages: ['vi'] }),
        '--no-images'
      ],
      { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    const menu = (name) =>
      [...mock.state.menuItems.values()].filter((i) => i.menu === name).map((i) => [i.label, i.customUrl])
    assert.deepEqual(menu('primary'), [
      ['Giới thiệu', '/about'],
      ['Dịch vụ', '/services']
    ])
    assert.deepEqual(
      menu('footer_company'),
      [
        ['Giới thiệu', '/about'],
        ['Đội ngũ', '/about']
      ],
      '"About us" names the page the menu calls "Giới thiệu"; "Our team" names something else'
    )
    assert.deepEqual(
      menu('footer_services'),
      [['Bánh mì sourdough', '/services']],
      'a service keeps its own name'
    )
    const site = [...mock.state.entries.values()].find((e) => e.collection === 'site').live
    assert.deepEqual(site.not_found_suggestions, [
      { label: 'Giới thiệu', url: '/about' },
      { label: 'Dịch vụ', url: '/services' }
    ])
  } finally {
    await mock.close()
    model.close()
  }
})
