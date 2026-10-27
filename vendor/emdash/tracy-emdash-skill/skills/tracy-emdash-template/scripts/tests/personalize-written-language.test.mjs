// tools/personalize.mjs, a root written in another language leaves no template English behind (TCH #1013, measured
// 08/10/2026 on dev, tamq-9e-bizvi / bizvi2, Tracy Business 1.7.1, a brief in Vietnamese):
//  - the home labels ("Selected projects", "All services →") and every inner page's headings and <title> source
//    (`breadcrumb`, `title`) stayed English: the `labels` rule named only the `site` entry;
//  - "Why Tamarind Bakery" stayed English: an identity template in the template's own language, filled with the name;
//  - the enquiry form kept "Email", "Phone", "Send request": only the fields the map briefs were asked for;
//  - on one build in two the hero subtitle and <meta name="description"> kept the demo's English: the copy step counted
//    words by spaces, so a Vietnamese answer (one syllable per space) was rejected as too long and nothing was asked again.
// Written against its own tiny seed, so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { chromeLabelsOf, planFrom, withinWords } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

// 60 Vietnamese syllables: two ordinary sentences, about 30 English words of meaning.
const VI_HERO =
  'Tiệm bánh Tamarind nướng bánh mì, bánh ngọt và bánh kem mỗi sáng bằng bột mì chọn lọc và bơ tươi. ' +
  'Chúng tôi nhận đặt bánh sinh nhật, tiệc cưới và tiệc công ty cho khách hàng ở trung tâm thành phố, ' +
  'giao tận nơi trong ngày và luôn tư vấn tận tình.'
const EN_RAMBLE = Array.from({ length: 120 }, (_, i) => `word${String(i)}`).join(' ')

const seed = {
  defaultLocale: 'en',
  content: {
    site: [{ slug: 'site', locale: 'en', data: { brand_name: 'DEMO', home_label: 'Home' } }],
    home: [
      {
        slug: 'home',
        locale: 'en',
        data: {
          title: 'Home',
          hero_text: 'Design–build main contractor for industrial parks in Central and Volga Russia.',
          why_eyebrow: 'Why Demo',
          projects_title: 'Selected projects',
          services_all_label: 'All services →',
          project_big: '$ref:projects:elektra:en',
          services_items: [{ title: 'Steel frames', text: 'We weld.' }]
        }
      }
    ],
    contact: [
      {
        slug: 'contact',
        locale: 'en',
        data: {
          title: 'Contact',
          form: 'quote-request-en',
          reset_label: 'Clear form',
          body: [{ _type: 'block', _key: 'a1', style: 'normal' }]
        }
      }
    ],
    about: [
      {
        slug: 'about',
        locale: 'en',
        data: { breadcrumb: 'About us', history_title: 'History', note: 'Kept' }
      }
    ]
  }
}
const map = {
  identity: [
    { collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' },
    {
      collection: 'home',
      slug: 'home',
      field: 'why_eyebrow',
      value: { en: 'Why {name}', ru: 'Почему «{name}»' }
    }
  ],
  copy: [
    { collection: 'home', slug: 'home', field: 'hero_text', brief: 'one or two sentences', maxWords: 32 }
  ],
  labels: [
    { collection: 'site' },
    { collection: 'home', slug: 'home' },
    { collection: 'contact', slug: 'contact' },
    { collection: 'about', slug: 'about', fields: ['breadcrumb', 'history_title'] }
  ],
  blocks: [
    {
      collection: 'home',
      slug: 'home',
      field: 'services_items',
      itemFields: ['title', 'text'],
      brief: 'one thing this business offers'
    }
  ],
  forms: [{ slug: 'quote-request', fields: { name: 'the visitor’s name' }, brief: 'the enquiry form' }]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-written-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

test('a word limit is not a space count: ordinary Vietnamese and Chinese fit, a rambling answer does not', () => {
  assert.equal(withinWords(VI_HERO, 32), true, 'two Vietnamese sentences are not "too long" for 32 words')
  assert.equal(
    withinWords(
      '我们每天早上用精选面粉和新鲜黄油烘焙面包、蛋糕和点心，并提供生日蛋糕和婚礼蛋糕的预订服务。',
      32
    ),
    true
  )
  assert.equal(withinWords('Fresh bread every morning.', 4), true)
  assert.equal(withinWords(EN_RAMBLE, 32), false)
  assert.equal(withinWords('x'.repeat(2000), 32), false, 'a wall of text without spaces is still too long')
})

test('the labels of a page are its words: never a block the model rewrites, a reference, a form slug or a portable-text key', () => {
  const plan = planFrom(map, seed, { name: 'Golden Crust', NAME: 'GOLDEN CRUST', year: '2026' })
  const got = chromeLabelsOf({ map, seedEntries: plan.seedEntries, locale: 'en', patches: plan.patches })
  assert.deepEqual(
    got.map((l) => [l.id, l.text]),
    [
      ['site/site.home_label', 'Home'],
      ['home/home.title', 'Home'],
      ['home/home.projects_title', 'Selected projects'],
      ['home/home.services_all_label', 'All services →'],
      ['contact/contact.title', 'Contact'],
      ['contact/contact.reset_label', 'Clear form'],
      ['about/about.breadcrumb', 'About us'],
      ['about/about.history_title', 'History']
    ]
  )
})

test('an identity template in the template’s own language is the run’s words, translated with the labels', () => {
  const plan = planFrom(
    map,
    seed,
    { name: 'Golden Crust', NAME: 'GOLDEN CRUST', year: '2026' },
    { writtenAs: { en: 'vi' } }
  )
  const got = chromeLabelsOf({ map, seedEntries: plan.seedEntries, locale: 'en', patches: plan.patches })
  assert.deepEqual(
    got.filter((l) => l.field === 'why_eyebrow').map((l) => l.text),
    ['Why Golden Crust']
  )
  // Written in its own language, the template's sentence is final: nothing to translate.
  const own = planFrom(map, seed, { name: 'Golden Crust', NAME: 'GOLDEN CRUST', year: '2026' })
  assert.equal(
    chromeLabelsOf({ map, seedEntries: own.seedEntries, locale: 'en', patches: own.patches }).some(
      (l) => l.field === 'why_eyebrow'
    ),
    false
  )
})

/**
 * A model that answers copy from `copyAnswers` (a list per key, one per ask), rows as "vi block", form fields as
 * "vi form" and every label as `vi:<label>`.
 */
async function modelServer(copyAnswers) {
  const asked = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    asked.push({ system: body.messages[0].content, user })
    let answer = {}
    if (user.labels) answer = Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `vi:${v}`]))
    else if (Array.isArray(user.rows))
      answer = { rows: user.rows.map((r) => Object.fromEntries(Object.keys(r).map((k) => [k, 'vi block']))) }
    else if (user.form)
      answer = Object.fromEntries(
        user.fields.map((f) => [f.name, { label: 'vi form', placeholder: 'vi form' }])
      )
    else if (Array.isArray(user.fields))
      answer = Object.fromEntries(
        user.fields.map((f) => {
          const list = copyAnswers[f.key] ?? ['vi copy']
          return [f.key, list.length > 1 ? list.shift() : list[0]]
        })
      )
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
  mock.state.forms.set('f1', {
    id: 'f1',
    name: 'Contact (EN)',
    slug: 'quote-request-en',
    pages: [
      {
        fields: [
          {
            id: 'n',
            type: 'text',
            name: 'name',
            label: 'Full name',
            placeholder: 'Ivan Petrov',
            helpText: 'Your full name'
          },
          { id: 'e', type: 'email', name: 'email', label: 'Email', placeholder: 'Email' },
          { id: 'p', type: 'tel', name: 'phone', label: 'Phone', placeholder: 'Phone' },
          {
            id: 'c',
            type: 'checkbox',
            name: 'consentbox',
            label: 'Agree to the Privacy Policy',
            helpText: 'Privacy Note',
            required: true
          }
        ]
      }
    ],
    settings: {
      submitLabel: 'Send request',
      confirmationMessage: 'Success — Your quote request has been sent.',
      notifyEmails: ['sales@demo.example'],
      spamProtection: 'honeypot'
    }
  })
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
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-written-'))
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
    '--json',
    '--no-images'
  ]
}

const live = (mock, collection) =>
  [...mock.state.entries.values()].find((e) => e.collection === collection && e.locale === 'en').live

test('a root written in Vietnamese: headings, page titles, the templated eyebrow, the form and the hero are all Vietnamese', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer({ 'home.home.hero_text': [VI_HERO] })
  const env = { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
  try {
    const r = await run(
      [
        ...common(url),
        '--answers-json',
        JSON.stringify({ name: 'Golden Crust', about: 'A bakery in Hanoi.', languages: ['vi'] })
      ],
      env
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    const home = live(mock, 'home')
    assert.equal(home.hero_text, VI_HERO, 'a Vietnamese hero is not rejected for its syllables')
    assert.equal(home.title, 'vi:Home', 'the <title> source of the home page')
    assert.equal(home.projects_title, 'vi:Selected projects')
    assert.equal(home.services_all_label, 'vi:All services →')
    assert.equal(home.why_eyebrow, 'vi:Why Golden Crust')
    assert.equal(home.project_big, '$ref:projects:elektra:en', 'a reference is not a label')
    assert.deepEqual(
      home.services_items,
      [{ title: 'vi block', text: 'vi block' }],
      'a block the model rewrites is the block step’s, never translated over'
    )
    const contact = live(mock, 'contact')
    assert.equal(contact.title, 'vi:Contact')
    assert.equal(contact.form, 'quote-request-en', 'the form reference stays')
    assert.equal(contact.reset_label, 'vi:Clear form')
    const about = live(mock, 'about')
    assert.equal(about.breadcrumb, 'vi:About us')
    assert.equal(about.history_title, 'vi:History')
    assert.equal(about.note, 'Kept', 'a field the rule does not list is left alone')

    const form = mock.state.forms.get('f1')
    const fields = Object.fromEntries(form.pages[0].fields.map((f) => [f.name, f]))
    assert.equal(fields.name.label, 'vi form', 'the briefed field is written')
    assert.equal(fields.name.helpText, 'vi:Your full name', 'briefed fields still translate help text')
    assert.equal(fields.consentbox.helpText, 'vi:Privacy Note', 'unbriefed consent help is translated')
    assert.equal(fields.consentbox.required, true, 'translation preserves consent semantics')
    assert.equal(fields.email.label, 'vi:Email', 'a field the map does not brief is translated')
    assert.equal(fields.phone.placeholder, 'vi:Phone')
    assert.equal(form.settings.submitLabel, 'vi:Send request')
    assert.equal(form.settings.confirmationMessage, 'vi:Success — Your quote request has been sent.')
    assert.deepEqual(form.settings.notifyEmails, ['sales@demo.example'])
  } finally {
    await mock.close()
    model.close()
  }
})

test('a copy answer that is really too long is asked for again, shorter, instead of leaving the demo’s words', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer({ 'home.home.hero_text': [EN_RAMBLE, 'Bánh mì nướng mỗi sáng.'] })
  const env = { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
  try {
    const r = await run(
      [
        ...common(url),
        '--answers-json',
        JSON.stringify({ name: 'Golden Crust', about: 'A bakery in Hanoi.', languages: ['vi'] })
      ],
      env
    )
    assert.deepEqual(JSON.parse(r.stdout).errors, [], r.stderr)
    assert.equal(live(mock, 'home').hero_text, 'Bánh mì nướng mỗi sáng.')
    const copyAsks = model.asked.filter((a) => Array.isArray(a.user.fields) && !a.user.form)
    assert.equal(copyAsks.length, 2, 'asked once more')
    assert.match(copyAsks[1].system, /too long|shorter/i, 'the second ask says why')
  } finally {
    await mock.close()
    model.close()
  }
})

test('technical state enums survive translation while their visible labels remain translatable', () => {
  const data = {
    hero_aside_state: 'success',
    publication_status: 'published',
    state_label: 'Ready',
    status_text: 'Published',
    type_title: 'Service',
    cards: [{ state: 'warning', status: 'active', state_label: 'Needs attention', title: 'Card' }]
  }
  const labels = chromeLabelsOf({
    map: { labels: [{ collection: 'home' }] },
    seedEntries: [{ collection: 'home', slug: 'home', locale: 'en', data }],
    locale: 'en',
    patches: new Map()
  })
  assert.deepEqual(
    labels.map(({ id }) => id),
    [
      'home/home.state_label',
      'home/home.status_text',
      'home/home.type_title',
      'home/home.cards.0.state_label',
      'home/home.cards.0.title'
    ]
  )
  const translated = structuredClone(data)
  for (const label of labels) {
    if (label.index === undefined) translated[label.field] = `de:${label.text}`
    else translated[label.field][label.index][label.prop] = `de:${label.text}`
  }
  assert.equal(translated.hero_aside_state, 'success')
  assert.equal(translated.cards[0].state, 'warning')
  assert.equal(translated.state_label, 'de:Ready')
})
