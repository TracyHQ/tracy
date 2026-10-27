// tools/personalize.mjs as a CALLER OTHER THAN THE BUILD runs it: tracy-web's "Apply" (the popup of Add site) runs this very
// tool from outside the site's container, for one customer's typed description, and needs five things the Build never did:
// the owner's opening hours and social links as answers, the DeepSeek door told not to reason, a language hidden by its
// site chrome alone, a bound on requests in flight, and an enquiry form written from what the business does rather than
// from its name. Written against its own tiny seed (as `personalize-journal.test.mjs` is), so the kit and every template
// carry the same file; a template's own rules are tested beside it.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, noThinking, planFrom, socialFrom } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const demoSocial = [{ name: 'Telegram', handle: '@demo', url: 'https://t.me/demo', text: 'Demo news' }]
const seed = {
  defaultLocale: 'en',
  content: {
    site: [
      {
        slug: 'site',
        locale: 'en',
        data: { brand_name: 'DEMO WORKS', hours: 'Mon–Fri, 9:00–18:00 (MSK)', social: demoSocial }
      },
      {
        slug: 'site',
        locale: 'ru',
        data: { brand_name: 'DEMO WORKS', hours: 'Пн–Пт, 9:00–18:00', social: demoSocial }
      }
    ],
    pages: [
      { slug: 'about', locale: 'en', data: { title: 'About Demo' } },
      { slug: 'about', locale: 'ru', data: { title: 'О Demo' } }
    ]
  }
}
const map = {
  identity: [
    { collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' },
    { collection: 'site', slug: 'site', field: 'hours', value: '{hours}', empty: '' },
    {
      collection: 'site',
      slug: 'site',
      field: 'social',
      value: [],
      from: 'social',
      item: { name: '{name}', handle: '{handle}', url: '{url}', text: '' }
    }
  ],
  replace: [{ find: 'Demo', with: '{name}' }],
  forms: [
    {
      slug: 'quote-request',
      fields: { type: 'the kinds of request this business takes' },
      brief: 'the enquiry form of this business'
    }
  ]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-apply-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

function siteMock() {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale, e.data)
  mock.state.forms.set('f1', {
    id: 'f1',
    name: 'Contact (EN)',
    slug: 'quote-request-en',
    pages: [
      {
        fields: [
          {
            name: 'type',
            type: 'radio',
            label: 'Request type',
            options: [
              { label: 'Construction quote', value: 'Construction quote' },
              { label: 'Site survey', value: 'Site survey' }
            ]
          }
        ]
      }
    ],
    settings: { notifyEmails: ['sales@demo.example'] }
  })
  return mock
}

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [TOOL, ...args],
      { cwd: ROOT, env: { ...process.env, ...NO_MODEL, ...env }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

function siteArgs(site, extra = []) {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-apply-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return [
    '--seed',
    SEED_DIR,
    '--site',
    site,
    '--token-file',
    path.join(dir, 'token'),
    '--receipts',
    path.join(dir, 'receipts.json'),
    ...extra,
    '--json'
  ]
}

const entry = (mock, collection, locale = 'en') =>
  [...mock.state.entries.values()].find((e) => e.collection === collection && e.locale === locale)

test('noThinking: DeepSeek is told not to reason, every other door is left alone', () => {
  assert.deepEqual(noThinking({ url: 'https://api.deepseek.com/chat/completions' }), {
    thinking: { type: 'disabled' }
  })
  for (const url of [
    'https://openrouter.ai/api/v1/chat/completions',
    'http://127.0.0.1:9/v1/chat/completions',
    undefined
  ])
    assert.deepEqual(noThinking({ url }), {})
  assert.deepEqual(noThinking(null), {})
})

test('socialFrom keeps only the web addresses the customer linked, in the pieces a template may ask for', () => {
  const linked = {
    instagram: 'https://instagram.com/goldencrust',
    facebook: 'https://facebook.com/golden.crust?ref=1'
  }
  assert.deepEqual(socialFrom(linked), [
    {
      network: 'instagram',
      name: 'Instagram',
      handle: '@goldencrust',
      url: 'https://instagram.com/goldencrust'
    },
    {
      network: 'facebook',
      name: 'Facebook',
      handle: '@golden.crust',
      url: 'https://facebook.com/golden.crust?ref=1'
    }
  ])
  assert.deepEqual(
    socialFrom([{ network: 'x', url: 'https://twitter.com/golden' }]).map((p) => [p.name, p.handle]),
    [['X', '@golden']],
    'a list of {network, url} reads like the object'
  )
  for (const odd of [
    undefined,
    null,
    'instagram.com/x',
    [],
    {},
    { instagram: 'not a link' },
    { 'bad name!': 'https://x.test/a' }
  ])
    assert.deepEqual(socialFrom(odd), [], `${JSON.stringify(odd)} links no profile`)
})

test('facts carry the hours and the profiles the customer gave, and nothing when they gave none', () => {
  const given = factsFrom({
    name: 'Granite Works',
    hours: ' Open 6am-8pm every day ',
    social: { instagram: 'https://instagram.com/g1' }
  })
  assert.equal(given.hours, 'Open 6am-8pm every day')
  assert.deepEqual(
    given.social.map((p) => p.network),
    ['instagram']
  )
  const none = factsFrom({ name: 'Granite Works' })
  assert.equal('hours' in none || 'social' in none, false)
})

test("the plan writes the customer's hours and profiles where the demo's were; none given, the demo's buttons stay with no link (K6)", () => {
  const linked = { instagram: 'https://instagram.com/goldencrust', zalo: 'https://zalo.me/0912345678' }
  const given = planFrom(
    map,
    seed,
    factsFrom({ name: 'Granite Works', hours: 'Open 6am-8pm', social: linked })
  )
  const fields = given.patches.get('site/site/en').fields
  assert.equal(fields.hours, 'Open 6am-8pm')
  assert.deepEqual(fields.social, [
    { name: 'Instagram', handle: '@goldencrust', url: 'https://instagram.com/goldencrust', text: '' },
    { name: 'Zalo', handle: '@0912345678', url: 'https://zalo.me/0912345678', text: '' }
  ])
  const none = planFrom(map, seed, factsFrom({ name: 'Granite Works' })).patches.get('site/site/en').fields
  assert.equal(none.hours, '', "another company's opening hours are not kept")
  // K6 (Akemi 10/10/2026): the demo's social buttons are kept, in BLANK and FULL alike; only their links go, and a handle
  // that names the demo company (`@demo`) goes with them. BLANK keeps the other words, renamed.
  const blank = planFrom(map, seed, factsFrom({ name: 'Granite Works' }), { claims: false }).patches.get(
    'site/site/en'
  )
  assert.deepEqual(
    blank.fields.social,
    [{ name: 'Telegram', handle: '', url: '', text: 'Granite Works news' }],
    "another company's profiles are not linked, and its buttons stay"
  )
  // FULL (g62): the same buttons; the line under each is what the demo company posts, and the rule's own item has none.
  const described = planFrom(map, seed, factsFrom({ name: 'Granite Works', about: 'A bakery.' })).patches.get(
    'site/site/en'
  ).fields
  assert.deepEqual(
    described.social,
    [{ name: 'Telegram', handle: '', url: '', text: '' }],
    'FULL keeps the buttons'
  )

  // `networks` bounds what a field can hold; a template whose field cannot hold a network leaves it out.
  const bounded = {
    ...map,
    identity: [
      {
        collection: 'site',
        slug: 'site',
        field: 'social',
        value: [],
        from: 'social',
        networks: ['instagram'],
        item: { platform: '{network}', url: '{url}' }
      }
    ]
  }
  assert.deepEqual(
    planFrom(bounded, seed, factsFrom({ name: 'Granite Works', social: linked })).patches.get('site/site/en')
      .fields.social,
    [{ platform: 'instagram', url: 'https://instagram.com/goldencrust' }]
  )
  // A tool that does not know `from` still empties the list through the rule's own `value`: the rule is safe to ship first.
  const old = { ...map, identity: [{ collection: 'site', slug: 'site', field: 'social', value: [] }] }
  assert.deepEqual(
    planFrom(old, seed, factsFrom({ name: 'Granite Works', social: linked })).patches.get('site/site/en')
      .fields.social,
    []
  )
})

test('--hide-chrome-only: a language nobody asked for is unpublished by its site chrome alone', async () => {
  const everyEntry = async (extra) => {
    const mock = siteMock()
    const site = await mock.listen()
    try {
      const r = await run(
        siteArgs(site, [
          '--answers-json',
          JSON.stringify({ name: 'Granite Works', languages: ['en'] }),
          '--no-model',
          ...extra
        ])
      )
      return { report: JSON.parse(r.stdout), ru: ['site', 'pages'].map((c) => entry(mock, c, 'ru').status) }
    } finally {
      await mock.close()
    }
  }
  const all = await everyEntry([])
  assert.deepEqual(all.ru, ['draft', 'draft'], 'by default every entry of the hidden language goes')
  const chrome = await everyEntry(['--hide-chrome-only', '--concurrency', '8'])
  assert.deepEqual(
    chrome.ru,
    ['draft', 'published'],
    'with the flag only the chrome entry goes: that is what the template serves a locale by'
  )
  assert.equal(chrome.report.language.unpublished, 1)
})

test('--concurrency is a bound of 1 to 16 and a bad value is the default, not a crash', async () => {
  for (const value of ['2', '99', '0', 'many']) {
    const mock = siteMock()
    const site = await mock.listen()
    try {
      const r = await run(
        siteArgs(site, [
          '--answers-json',
          JSON.stringify({ name: 'Granite Works', languages: ['en'] }),
          '--no-model',
          '--concurrency',
          value
        ])
      )
      // 0 is done, 3 is done with some copy left (no model was given); anything else is the flag breaking the run.
      assert.ok([0, 3].includes(r.code), `--concurrency ${value} ended with ${r.code}`)
      assert.equal(JSON.parse(r.stdout).errors.length, 0)
    } finally {
      await mock.close()
    }
  }
})

test("the enquiry form is written from what the business does, the mailbox is the customer's, and the profiles and hours land on the site", async () => {
  const mock = siteMock()
  const site = await mock.listen()
  const asked = []
  const model = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    asked.push({ system: body.messages[0].content, user, thinking: body.thinking })
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: { label: 'Request type', options: ['Cake order', 'Wholesale'] }
              })
            }
          }
        ]
      })
    )
  })
  const modelUrl = await new Promise((r) =>
    model.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${model.address().port}/v1/chat`))
  )
  try {
    const r = await run(
      siteArgs(site, [
        '--answers-json',
        JSON.stringify({
          name: 'Golden Crust',
          about: 'A family bakery in Hanoi selling sourdough, croissants and made-to-order cakes.',
          email: 'hello@goldencrust.vn',
          hours: 'Open 6am-9pm daily',
          social: { instagram: 'https://instagram.com/goldencrust' },
          languages: ['en']
        })
      ]),
      { TRACY_MODEL_URL: modelUrl, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.forms, ['quote-request-en'])
    assert.equal(asked.length, 1, 'one question for the one form')
    assert.equal(
      asked[0].user.business.about,
      'A family bakery in Hanoi selling sourdough, croissants and made-to-order cakes.',
      'the form is told what the business does, not only its name'
    )
    assert.match(asked[0].system, /another kind of business is rewritten for this one/)
    const form = mock.state.forms.get('f1')
    assert.deepEqual(
      form.pages[0].fields[0].options.map((o) => o.label),
      ['Cake order', 'Wholesale']
    )
    assert.deepEqual(
      form.pages[0].fields[0].options.map((o) => o.value),
      ['Cake order', 'Wholesale'],
      "the value is what the owner is mailed: it follows the label, never stays the demo's"
    )
    assert.deepEqual(
      form.settings.notifyEmails,
      ['hello@goldencrust.vn'],
      'the enquiries reach the customer, not the demo company'
    )
    const site1 = entry(mock, 'site')
    assert.equal(site1.live.hours, 'Open 6am-9pm daily')
    assert.deepEqual(site1.live.social, [
      { name: 'Instagram', handle: '@goldencrust', url: 'https://instagram.com/goldencrust', text: '' }
    ])
  } finally {
    await mock.close()
    model.close()
  }
})

test("a form option list of another length is still believed (two to eight), and an answer with fewer than two keeps the demo's", async () => {
  const optionsAfter = async (answer) => {
    const mock = siteMock()
    const site = await mock.listen()
    const model = http.createServer(async (req, res) => {
      for await (const _ of req);
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ type: { label: 'Request type', options: answer } }) } }
          ]
        })
      )
    })
    const modelUrl = await new Promise((r) =>
      model.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${model.address().port}/v1/chat`))
    )
    try {
      await run(
        siteArgs(site, [
          '--answers-json',
          JSON.stringify({ name: 'Golden Crust', about: 'A family bakery in Hanoi.', languages: ['en'] })
        ]),
        { TRACY_MODEL_URL: modelUrl, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
      )
      return mock.state.forms.get('f1').pages[0].fields[0].options.map((o) => [o.label, o.value])
    } finally {
      await mock.close()
      model.close()
    }
  }
  assert.deepEqual(await optionsAfter(['Cake order', 'Bread', 'Wholesale']), [
    ['Cake order', 'Cake order'],
    ['Bread', 'Bread'],
    ['Wholesale', 'Wholesale']
  ])
  assert.deepEqual(await optionsAfter(['Only one']), [
    ['Construction quote', 'Construction quote'],
    ['Site survey', 'Site survey']
  ])
  assert.equal(
    (await optionsAfter(Array.from({ length: 9 }, (_, i) => `Option ${i}`))).length,
    2,
    'nine is a model gone wrong'
  )
})

test('a page the customer unticked is not written to again by a copy rule, so it is not published again', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-hide-seed-'))
  writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seed))
  writeFileSync(
    path.join(dir, 'personalize.json'),
    JSON.stringify({
      ...map,
      copy: [
        { collection: 'pages', slug: 'about', field: 'title', brief: 'a title for the page', maxWords: 12 }
      ]
    })
  )
  const mock = siteMock()
  const site = await mock.listen()
  const asked = []
  const model = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const user = JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages[1].content)
    asked.push(user)
    const answer = Array.isArray(user.fields)
      ? Object.fromEntries(user.fields.map((f) => [f.key, 'A line about the bakery.']))
      : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const modelUrl = await new Promise((r) =>
    model.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${model.address().port}/v1/chat`))
  )
  try {
    const args = siteArgs(site, [
      '--answers-json',
      // The customer unticked the page in Tracy's Pages question: the only way a page leaves (TCH #1013, 08/10/2026).
      JSON.stringify({ name: 'Golden Crust', about: 'A bakery.', languages: ['en'], hidePages: ['about'] })
    ])
    args[args.indexOf('--seed') + 1] = dir
    const r = await run(args, {
      TRACY_MODEL_URL: modelUrl,
      TRACY_MODEL_KEY: 'k-test',
      TRACY_MODEL_NAME: 'm-test'
    })
    assert.deepEqual(JSON.parse(r.stdout).errors, [])
    const about = entry(mock, 'pages')
    assert.equal(about.status, 'draft', 'the hidden page stays hidden')
    const touched = mock.state.log.filter((l) => l.path.includes(`/${about.id}`) && l.method !== 'GET')
    assert.ok(
      touched.at(-1)?.path.replace(/\?.*$/, '').endsWith('/unpublish'),
      `nothing after the unpublish: ${touched.map((l) => `${l.method} ${l.path}`).join(' | ')}`
    )
    assert.equal(
      asked.some(
        (u) => Array.isArray(u.fields) && u.fields.some((f) => String(f.key).startsWith('pages.about'))
      ),
      false,
      'and the model is not asked to write for it'
    )
  } finally {
    await mock.close()
    model.close()
  }
})
