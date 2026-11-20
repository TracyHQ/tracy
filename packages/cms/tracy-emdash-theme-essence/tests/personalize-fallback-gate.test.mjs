// tools/personalize.mjs, round g60 of TCH #1013 (measured 10/10/2026 on g59-biz-emd-{full,blank}, Tracy Business 1.7.7):
//  - FULL in Vietnamese: /terms and /privacy had a Vietnamese lede over the demo's English body: the model answered the
//    body one part short, the body fell back to the template's English, and the report said nothing;
//  - the hero's second button opened the demo company's PDF under a label written for a bakery: no copy question said
//    where a label's link goes;
//  - BLANK: the enquiry form's options were rewritten for the business from the name alone: the form step had no About gate;
//  - the demo's social buttons were removed from BLANK and FULL alike (K6 keeps them, links emptied).
// Every model here is SCRIPTED TO DISOBEY where it matters (a body one part short, the same mistake after the retry, a
// placeholder respelled), because an obedient model is how the round before passed while the site failed.
// Written against its own tiny seed, so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  contactPathOf,
  demoFileLinksOf,
  destinationOf,
  linkBearing,
  modelMay,
  socialKept
} from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const block = (key, style, text, extra = {}) => ({
  _type: 'block',
  _key: key,
  style,
  markDefs: [],
  children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }],
  ...extra
})
const TERMS_EN = [
  block('t1', 'h2', 'Use of the site'),
  block('t2', 'normal', 'This site is run by Demo Works, Vorsino Industrial Park, plot 12.'),
  block('t3', 'normal', 'You may read it freely.', { listItem: 'bullet', level: 1 }),
  block('t4', 'h2', 'Contact'),
  block('t5', 'normal', 'Write to Demo Works about these terms.')
]
const TERMS_VI = [
  block('t1', 'h2', 'Sử dụng trang'),
  block('t2', 'normal', 'Trang này do Demo Works vận hành.'),
  block('t3', 'normal', 'Bạn có thể đọc tự do.', { listItem: 'bullet', level: 1 }),
  block('t4', 'h2', 'Liên hệ'),
  block('t5', 'normal', 'Hãy viết cho Demo Works về các điều khoản này.')
]
const PRIVACY_EN = [
  block('p1', 'h2', 'What we collect'),
  block('p2', 'normal', 'The details you send through the form.'),
  block('p3', 'h2', 'Your rights'),
  block('p4', 'normal', 'Ask Demo Works to delete them at any time.')
]
const PDF = '/_emdash/api/media/file/profile.pdf'

const seed = {
  defaultLocale: 'en',
  content: {
    site: [
      {
        slug: 'site',
        locale: 'en',
        data: {
          brand_name: 'DEMO WORKS',
          social: [
            {
              name: 'Telegram',
              handle: '@demo_works',
              url: 'https://t.me/demo_works',
              text: 'News from Demo'
            }
          ]
        }
      },
      {
        slug: 'site',
        locale: 'vi',
        data: {
          brand_name: 'DEMO WORKS',
          social: [
            {
              name: 'Telegram',
              handle: '@demo_works',
              url: 'https://t.me/demo_works',
              text: 'Tin tức của Demo'
            }
          ]
        }
      }
    ],
    home: [
      {
        slug: 'home',
        locale: 'en',
        data: {
          hero_text: 'Steel frames for industrial parks.',
          hero_cta1_label: 'See our capabilities',
          hero_cta1_url: '/services',
          hero_cta2_label: 'Download company profile (PDF)',
          hero_cta2_url: '',
          band_button: 'Talk to our sales team',
          band_url: '/contact',
          survey_button: 'Book a site survey'
        }
      },
      {
        slug: 'home',
        locale: 'vi',
        data: {
          hero_text: 'Khung thép cho khu công nghiệp.',
          hero_cta1_label: 'Xem năng lực',
          hero_cta1_url: '/services',
          hero_cta2_label: 'Tải hồ sơ công ty (PDF)',
          hero_cta2_url: '',
          band_button: 'Liên hệ bộ phận kinh doanh',
          band_url: '/contact',
          survey_button: 'Đặt lịch khảo sát'
        }
      }
    ],
    pages: [
      {
        slug: 'terms',
        locale: 'en',
        data: { title: 'Terms', lede: 'These terms apply.', content: TERMS_EN }
      },
      {
        slug: 'terms',
        locale: 'vi',
        data: { title: 'Điều khoản', lede: 'Các điều khoản này áp dụng.', content: TERMS_VI }
      },
      // No Vietnamese edition of this one: its words are translated, its outline kept.
      {
        slug: 'privacy',
        locale: 'en',
        data: { title: 'Privacy', lede: 'How we use data.', content: PRIVACY_EN }
      }
    ]
  }
}
const map = {
  identity: [
    { collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' },
    {
      collection: 'site',
      slug: 'site',
      field: 'social',
      value: [],
      from: 'social',
      item: { name: '{name}', handle: '{handle}', url: '{url}', text: '' }
    }
  ],
  replace: [{ find: 'Demo Works', with: '{name}' }],
  copy: [
    { collection: 'home', slug: 'home', field: 'hero_text', brief: 'the headline', maxWords: 12 },
    { collection: 'home', slug: 'home', field: 'hero_cta1_label', brief: 'the main button', maxWords: 4 },
    { collection: 'home', slug: 'home', field: 'hero_cta2_label', brief: 'the second button', maxWords: 4 },
    { collection: 'home', slug: 'home', field: 'survey_button', brief: 'a button', maxWords: 4 }
  ],
  rewrite: [
    {
      collection: 'pages',
      slugs: ['terms', 'privacy'],
      brief: 'one legal page of this business',
      fields: ['lede'],
      body: 'content',
      batch: 1,
      decides: []
    }
  ],
  forms: [{ slug: 'quote-request', fields: { type: 'the kinds of request' }, brief: 'the enquiry form' }]
}
const mediaMap = {
  items: [
    {
      key: 'decks/profile',
      mime: 'application/pdf',
      targets: [{ collection: 'home', slug: 'home', locale: 'en', path: 'hero_cta2_url' }]
    }
  ]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-fallback-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))
writeFileSync(path.join(SEED_DIR, 'media-map.json'), JSON.stringify(mediaMap))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}
const DEMO_OPTIONS = ['Construction quote', 'Site survey']

function site() {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows)
      mock.state.addEntry(
        collection,
        e.slug,
        e.locale,
        // The importer put the demo company's brochure on the button (`media-map.json`).
        collection === 'home' ? { ...e.data, hero_cta2_url: PDF } : e.data
      )
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
            options: DEMO_OPTIONS.map((label) => ({ label, value: label }))
          }
        ]
      }
    ],
    settings: { submitLabel: 'Send request', notifyEmails: ['sales@demo.example'] }
  })
  return mock
}

/**
 * A scripted model. `short` answers every body one part short, in the batch and again in the retry (`retryRight` answers
 * the retry right). Labels come back as `vi:<text>`; one respelled placeholder is refused by the tool.
 */
async function modelServer({ short = false, retryRight = false } = {}) {
  const asked = []
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    asked.push({ system: body.messages[0].content, user })
    let answer = {}
    if (user.labels) answer = Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `vi:${v}`]))
    else if (Array.isArray(user.parts)) {
      const n = user.parts.length - (retryRight ? 0 : 1)
      answer = { body: Array.from({ length: n }, (_, i) => `Phần ${String(i + 1)} do model viết`) }
    } else if (Array.isArray(user.entries))
      for (const e of user.entries)
        answer[e.key] = {
          lede: 'Lời mở đầu do model viết.',
          ...(Array.isArray(e.example.body)
            ? {
                body: e.example.body
                  .slice(0, short ? e.example.body.length - 1 : e.example.body.length)
                  .map((_, i) => `Phần ${String(i + 1)}`)
              }
            : {})
        }
    else if (user.form)
      answer = Object.fromEntries(
        user.fields.map((f) => [f.name, { label: 'Bakery request', options: ['Cake order', 'Bread order'] }])
      )
    else if (Array.isArray(user.fields))
      answer = Object.fromEntries(user.fields.map((f) => [f.key, `Viết: ${f.key.split('.').pop()}`]))
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, asked, close: () => server.close() }
}

function run(answers, url, modelUrl) {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-fallback-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  const args = [
    TOOL,
    '--seed',
    SEED_DIR,
    '--site',
    url,
    '--token-file',
    path.join(dir, 'token'),
    '--receipts',
    path.join(dir, 'receipts.json'),
    '--answers-json',
    JSON.stringify(answers),
    '--no-images',
    '--json'
  ]
  const env = {
    ...process.env,
    ...NO_MODEL,
    TRACY_MODEL_URL: modelUrl,
    TRACY_MODEL_KEY: 'k-test',
    TRACY_MODEL_NAME: 'm-test'
  }
  return new Promise((resolve) =>
    execFile('node', args, { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  )
}

const live = (mock, collection, slug) =>
  [...mock.state.entries.values()].find(
    (e) => e.collection === collection && e.slug === slug && e.locale === 'en'
  ).live
const textsOf = (blocks) => blocks.map((b) => b.children.map((c) => c.text).join(''))
const stylesOf = (blocks) => blocks.map((b) => `${b.style}${b.listItem ? `/${b.listItem}` : ''}`)
const optionsOf = (mock) => mock.state.forms.get('f1').pages[0].fields[0].options.map((o) => o.label)

test('the gate: a step that writes needs the description, a translation needs a root written in another language', () => {
  const blank = { name: 'Golden Crust' }
  const full = { name: 'Golden Crust', about: 'A family bakery.' }
  for (const step of ['copy', 'entries', 'body', 'blocks', 'terms', 'form', 'pictures']) {
    assert.equal(modelMay(step, 'en', blank, {}), false, `${step}: About blank keeps the demo's words`)
    assert.equal(
      modelMay(step, 'en', blank, { en: 'vi' }),
      false,
      `${step}: even on a root written in Vietnamese`
    )
    assert.equal(modelMay(step, 'en', full, {}), true, `${step}: a description is written from`)
  }
  assert.equal(modelMay('labels', 'en', blank, {}), false, 'a root in its own language translates nothing')
  assert.equal(
    modelMay('labels', 'en', blank, { en: 'vi' }),
    true,
    'a root written in Vietnamese is translated'
  )
  // A Name left blank keeps the template's (TCH #1013, 13/10/2026): the site is still translated, and a description still
  // written; only the name stays absent.
  assert.equal(
    modelMay('labels', 'en', {}, { en: 'vi' }),
    true,
    'no name: a root written in Vietnamese is still translated'
  )
  assert.equal(
    modelMay('copy', 'en', { about: 'A family bakery.' }, {}),
    true,
    'no name: the description is still written from'
  )
  assert.equal(modelMay('a-new-step', 'en', full, {}), false, 'a step the gate does not know is refused')
})

test('BLANK, name only, root in its own language: no model question at all, and the demo stays, renamed', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  try {
    const r = await run({ name: 'Golden Crust', languages: ['en'] }, url, model.url)
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    assert.deepEqual(
      model.asked.map((a) => a.system.slice(0, 60)),
      [],
      'not one question: the words, the form and the labels are the template’s'
    )
    assert.deepEqual(optionsOf(mock), DEMO_OPTIONS, 'the form keeps the demo’s request types (ABOUT-3)')
    assert.deepEqual(report.forms, [], 'and no form is reported written')
    const home = live(mock, 'home', 'home')
    assert.equal(home.hero_text, 'Steel frames for industrial parks.')
    // DEMO FILE LINKS is FULL's rule (g62): BLANK is the demo renamed, the brochure button with its file and its words.
    assert.equal(home.hero_cta2_url, PDF)
    assert.equal(home.hero_cta2_label, 'Download company profile (PDF)')
    // K6: the demo's social button stays, with no link and no handle of the demo company, and its line (BLANK keeps words).
    assert.deepEqual(live(mock, 'site', 'site').social, [
      { name: 'Telegram', handle: '', url: '', text: 'News from Demo' }
    ])
  } finally {
    await mock.close()
    model.close()
  }
})

test('BLANK, name only, root written in Vietnamese: only translations are asked; the words are the template’s Vietnamese edition, else translated with the outline kept', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  try {
    const r = await run({ name: 'Golden Crust', languages: ['vi'] }, url, model.url)
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    assert.ok(model.asked.length > 0)
    assert.ok(
      model.asked.every((a) => a.user.labels !== undefined && /translate/i.test(a.system)),
      `only translations: ${JSON.stringify(model.asked.map((a) => Object.keys(a.user)))}`
    )
    const home = live(mock, 'home', 'home')
    assert.equal(home.hero_text, 'Khung thép cho khu công nghiệp.', 'the template’s own Vietnamese words')
    assert.equal(home.hero_cta2_url, PDF, 'BLANK keeps the demo’s file (DEMO FILE LINKS is FULL’s rule, g62)')
    assert.equal(home.hero_cta2_label, 'Tải hồ sơ công ty (PDF)', 'the Vietnamese edition’s own label')
    const terms = live(mock, 'pages', 'terms')
    assert.equal(terms.lede, 'Các điều khoản này áp dụng.')
    assert.deepEqual(
      textsOf(terms.content),
      textsOf(TERMS_VI).map((t) => t.replaceAll('Demo Works', 'Golden Crust'))
    )
    const privacy = live(mock, 'pages', 'privacy')
    assert.deepEqual(stylesOf(privacy.content), stylesOf(PRIVACY_EN), 'headings stay headings')
    assert.ok(
      textsOf(privacy.content).every((t) => t.startsWith('vi:')),
      `every part is translated: ${JSON.stringify(textsOf(privacy.content))}`
    )
    assert.ok(
      textsOf(privacy.content).some((t) => t.includes('Golden Crust')),
      'translated after the name swap'
    )
    assert.equal(privacy.lede, 'vi:How we use data.')
    assert.ok(
      optionsOf(mock).every((o) => o.startsWith('vi:')),
      'the form’s options are the demo’s, translated'
    )
    assert.ok(
      report.skipped.some((s) => /About left blank: the template’s words stand in Vietnamese/.test(s.why)),
      'the report says where the words came from'
    )
  } finally {
    await mock.close()
    model.close()
  }
})

test('FULL in Vietnamese, a model that answers the legal body one part short, and again when asked alone: the body is the site’s language, and the report names it', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer({ short: true })
  try {
    const r = await run(
      { name: 'Golden Crust', about: 'A family bakery in Hanoi.', languages: ['vi'] },
      url,
      model.url
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    const retries = model.asked.filter((a) => Array.isArray(a.user.parts))
    assert.equal(retries.length, 2, 'each body is asked again once, on its own')
    assert.match(retries[0].system, /EXACTLY \d+ strings/, 'the retry states the count')
    const terms = live(mock, 'pages', 'terms')
    assert.equal(terms.lede, 'Lời mở đầu do model viết.')
    assert.deepEqual(
      textsOf(terms.content),
      textsOf(TERMS_VI).map((t) => t.replaceAll('Demo Works', 'Golden Crust')),
      'the template’s Vietnamese edition, renamed: never the English body'
    )
    const privacy = live(mock, 'pages', 'privacy')
    assert.deepEqual(stylesOf(privacy.content), stylesOf(PRIVACY_EN))
    assert.ok(
      textsOf(privacy.content).every((t) => t.startsWith('vi:')),
      'translated part by part'
    )
    const said = report.rewritten.skipped.filter((s) => typeof s.entry === 'string').map((s) => s.entry)
    assert.ok(said.includes('pages/terms/en.content'), JSON.stringify(said))
    assert.ok(said.includes('pages/privacy/en.content'), JSON.stringify(said))
  } finally {
    await mock.close()
    model.close()
  }
})

test('FULL in Vietnamese, the retry answered part by part: the model’s body stands', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer({ short: true, retryRight: true })
  try {
    const r = await run(
      { name: 'Golden Crust', about: 'A family bakery in Hanoi.', languages: ['vi'] },
      url,
      model.url
    )
    assert.deepEqual(JSON.parse(r.stdout).errors, [], r.stderr)
    const terms = live(mock, 'pages', 'terms')
    assert.deepEqual(
      textsOf(terms.content),
      TERMS_EN.map((_, i) => `Phần ${String(i + 1)} do model viết`)
    )
    assert.deepEqual(stylesOf(terms.content), stylesOf(TERMS_EN))
  } finally {
    await mock.close()
    model.close()
  }
})

test('FULL in English: every label is asked with where its link goes, the brochure button with the contact page; a button with no known link is not asked', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  try {
    const r = await run(
      { name: 'Golden Crust', about: 'A family bakery in Hanoi.', languages: ['en'] },
      url,
      model.url
    )
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    const copy = model.asked.find((a) => Array.isArray(a.user.fields) && a.user.fields[0]?.key)
    const fields = Object.fromEntries(copy.user.fields.map((f) => [f.key, f]))
    assert.deepEqual(fields['home.home.hero_cta1_label'].leadsTo, { url: '/services', kind: 'page' })
    assert.deepEqual(fields['home.home.hero_cta2_label'].leadsTo, { url: '/contact', kind: 'page' })
    assert.equal(fields['home.home.hero_text'].leadsTo, undefined, 'a headline leads nowhere')
    assert.equal(
      fields['home.home.survey_button'],
      undefined,
      'a button whose link is not known is not asked'
    )
    assert.match(copy.system, /Never promise a download, a document/)
    const home = live(mock, 'home', 'home')
    assert.equal(home.hero_cta2_url, '/contact', 'never the demo company’s brochure')
    assert.equal(home.hero_cta2_label, 'Viết: hero_cta2_label')
    assert.equal(home.survey_button, 'Book a site survey', 'its action is kept')
    assert.ok(report.skipped.some((s) => /home\.home\.survey_button/.test(s.rule)))
    // K6 + facts (g62): the button stays; the demo company's line under it goes, as the rule's own item has none.
    assert.deepEqual(live(mock, 'site', 'site').social, [{ name: 'Telegram', handle: '', url: '', text: '' }])
  } finally {
    await mock.close()
    model.close()
  }
})

test('where a label leads, and which labels lead somewhere', () => {
  const data = {
    a_label: 'x',
    a_url: '/contact',
    b_label: 'x',
    b_url: 'mailto:hr@demo.example',
    c_button: 'x'
  }
  assert.deepEqual(destinationOf({ field: 'a_label' }, data), { url: '/contact', kind: 'page' })
  assert.deepEqual(destinationOf({ field: 'b_label' }, data), {
    url: 'mailto:hr@demo.example',
    kind: 'email'
  })
  assert.deepEqual(destinationOf({ field: 'a_label' }, data, { a_url: PDF }), { url: PDF, kind: 'file' })
  assert.deepEqual(destinationOf({ field: 'x_label', leadsTo: '/contact' }, {}), {
    url: '/contact',
    kind: 'page'
  })
  assert.equal(destinationOf({ field: 'c_button' }, data), null)
  assert.equal(linkBearing({ field: 'c_button' }, data), true, 'a button is a link, known or not')
  assert.equal(
    linkBearing({ field: 'clients_label' }, data),
    false,
    'a heading with no link beside it is words'
  )
  assert.equal(linkBearing({ field: 'a_title' }, data), false, 'a heading beside a link is not its label')
})

test('the demo company’s files, the contact page, and the social items it keeps', () => {
  assert.deepEqual(demoFileLinksOf(map, seed, mediaMap), [
    { collection: 'home', slug: 'home', urlField: 'hero_cta2_url', labelField: 'hero_cta2_label' }
  ])
  assert.deepEqual(
    demoFileLinksOf({ ...map, samples: [{ collection: 'home', slug: 'home' }] }, seed, mediaMap),
    []
  )
  assert.equal(contactPathOf(seed, map), '/contact')
  assert.equal(contactPathOf(seed, { contactPath: '/lien-he' }), '/lien-he')
  assert.deepEqual(
    socialKept(
      [
        { network: 'code-xml', url: 'https://github.com/helix-labs', label: 'Source' },
        { name: 'VK', handle: 'vk.com/northgate.ind', url: 'https://vk.com/northgate.ind', text: 'News' },
        { name: 'YouTube', handle: '@NorthgateIndustrial', url: 'https://youtube.com/x', text: 'Films' }
      ],
      ['Northgate Industrial', 'Northgate', 'Helix Labs'],
      [
        { network: 'code-xml', url: 'https://github.com/helix-labs', label: 'Source' },
        { name: 'VK', handle: 'vk.com/northgate.ind', url: 'https://vk.com/northgate.ind', text: 'News' },
        { name: 'YouTube', handle: '@Golden CrustIndustrial', url: 'https://youtube.com/x', text: 'Films' }
      ]
    ),
    [
      { network: 'code-xml', url: '', label: 'Source' },
      { name: 'VK', handle: '', url: '', text: 'News' },
      { name: 'YouTube', handle: '', url: '', text: 'Films' }
    ],
    'a handle is judged before the name swap: the swap does not make it the customer’s'
  )
})
