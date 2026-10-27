// tools/personalize.mjs on the kit's sample pages (`samples` in seed/personalize.json), with THIS template's seed: the run
// writes a sample's `sample` object from the seed (the demo brand swapped, or the edition in the site's language), and the
// seed holds the words alone; the importer places the pictures afterwards, deep inside that object (`seed/media-map.json`:
// `sample.image`, `sample.frames.ratio16`, `sample.slides[3].image`). Measured 11/10/2026 on dev (Tracy Business 1.7.5):
// FULL in Vietnamese, /kit/style-guide showed 3 placeholders for its 3 frames and /kit/slides lost both photographs; BLANK,
// /kit/newsletter showed a placeholder reading "Tamarind Bakery wins the Zavolzhye 2 infrastructure tender".
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { keepSiteRowKeys } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const media = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'media-map.json'), 'utf8'))

const picture = (key) => ({ id: `01MEDIA-${key}`, src: `/_emdash/api/media/file/${key}.png`, alt: '' })

/** Set `value` at a media-map path (`sample.slides[3].image`) inside `data`. */
function place(data, at, value) {
  const parts = at.replace(/\[(\d+)\]/g, '.$1').split('.')
  let node = data
  for (const [i, part] of parts.entries()) {
    if (i === parts.length - 1) node[part] = value
    else node = node[part] ??= /^\d+$/.test(parts[i + 1]) ? [] : {}
  }
}

/** The pictures the importer puts on one kit page in English: `path` → picture. */
function picturesOf(slug) {
  const out = {}
  for (const item of media.items)
    for (const t of item.targets)
      if (
        t.collection === 'pages' &&
        t.slug === slug &&
        t.locale === 'en' &&
        /\.(image|ratio16|contain|avatar)$/.test(t.path)
      )
        out[t.path] = picture(item.key.replace(/\W+/g, '-'))
  return out
}

const KIT = ['kit-newsletter', 'kit-slides', 'kit-style-guide']

/** The English site with the chrome and the three kit pages, their pictures placed as the importer leaves them. */
function kitSite() {
  const mock = createMockEmdash()
  for (const e of seed.content.site.filter((x) => (x.locale ?? 'en') === 'en'))
    mock.state.addEntry('site', e.slug, 'en', structuredClone(e.data))
  for (const slug of KIT) {
    const e = seed.content.pages.find((x) => x.slug === slug && (x.locale ?? 'en') === 'en')
    const data = structuredClone(e.data)
    for (const [at, pic] of Object.entries(picturesOf(slug))) place(data, at, pic)
    mock.state.addEntry('pages', slug, 'en', data)
  }
  return mock
}

async function run(mock, answers) {
  const site = await mock.listen()
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-kit-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  try {
    return await new Promise((resolve) => {
      execFile(
        'node',
        [
          TOOL,
          '--answers-json',
          JSON.stringify(answers),
          '--site',
          site,
          '--token-file',
          path.join(dir, 'token'),
          '--receipts',
          path.join(dir, 'r.json'),
          '--json',
          '--no-model',
          '--no-images'
        ],
        {
          cwd: ROOT,
          env: { ...process.env, OPENROUTER_API_KEY: '', DEEPSEEK_API_KEY: '', TRACY_MODEL_URL: '' },
          maxBuffer: 64 * 1024 * 1024
        },
        (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
      )
    })
  } finally {
    await mock.close()
  }
}

const at = (data, where) =>
  where
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((node, part) => node?.[part], data)

const page = (mock, slug) =>
  [...mock.state.entries.values()].find((e) => e.collection === 'pages' && e.slug === slug)

for (const [mode, answers] of [
  ['BLANK (the name alone)', { name: 'Tamarind Bakery' }],
  ['FULL in Vietnamese', { name: 'Tamarind Bakery', about: 'A family bakery in Dubai.', languages: ['vi'] }]
])
  test(`${mode}: every picture of the kit pages stays where the importer put it`, async () => {
    const mock = kitSite()
    const out = await run(mock, answers)
    assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
    for (const slug of KIT) {
      const live = page(mock, slug).live
      for (const [where, pic] of Object.entries(picturesOf(slug)))
        assert.deepEqual(at(live, where), pic, `${slug} ${where} keeps its picture`)
    }
    const newsletter = page(mock, 'kit-newsletter').live.sample
    assert.match(newsletter.kicker, /TAMARIND BAKERY/, 'the demo brand is swapped in the sample')
  })

test('keepSiteRowKeys: an object written whole keeps the keys only the site holds, at any depth', () => {
  const live = {
    kicker: 'NORTHGATE',
    image: picture('lead'),
    frames: { ratio16: picture('a'), contain: picture('b') },
    slides: [{ t: 'One' }, { t: 'Two', image: picture('slide') }]
  }
  const written = { kicker: 'TAMARIND', frames: {}, slides: [{ t: 'Một' }, { t: 'Hai' }] }
  assert.deepEqual(keepSiteRowKeys(written, live), {
    kicker: 'TAMARIND',
    image: picture('lead'),
    frames: { ratio16: picture('a'), contain: picture('b') },
    slides: [{ t: 'Một' }, { t: 'Hai', image: picture('slide') }]
  })
  // A value the run names still wins, an emptied one included.
  assert.deepEqual(keepSiteRowKeys({ image: null, frames: [] }, live), {
    ...live,
    image: null,
    frames: []
  })
  assert.equal(keepSiteRowKeys('text', live), 'text')
})

// 🔒 THE KIT'S SUBSCRIBE CARD IS THE KIT PAGE'S OWN (TCH #1013, K3). Measured 11/10/2026 on dev (g58-biz-emd-full, News
// unticked): /kit/newsletter drew an empty green box where the demo shows a heading, a line, the form and its button,
// because the card read every word and the form id from the News page entry, which an unticked News unpublishes. The words
// now ride in the sample of every edition (as the News page words them), and the form falls back to the one bound on the
// investors entry.
test('the kit newsletter card carries its own words in every edition, and keeps a form while News is off', () => {
  const news = new Map(seed.content.news_page.map((e) => [e.locale ?? 'en', e.data]))
  const kits = seed.content.pages.filter((e) => e.slug === 'kit-newsletter')
  assert.ok(kits.length >= 40)
  for (const e of kits) {
    const card = e.data.sample?.subscribe
    const n = news.get(e.locale ?? 'en')
    assert.deepEqual(
      card,
      {
        title: n.newsletter_title,
        text: n.newsletter_text,
        placeholder: n.newsletter_placeholder,
        button: n.newsletter_button
      },
      `kit-newsletter/${e.locale} words its card as the News page of its edition does`
    )
  }
  const model = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'site-model.json'), 'utf8'))
  for (const r of model.records.filter((x) => x.type === 'pages' && x.slug === 'kit-newsletter'))
    assert.deepEqual(
      r.values.sample.subscribe,
      kits.find((e) => (e.locale ?? 'en') === r.locale).data.sample.subscribe,
      `site-model kit-newsletter/${r.locale}`
    )
  const view = readFileSync(path.join(ROOT, 'src', 'components', 'kit', 'KitNewsletter.astro'), 'utf8')
  assert.match(view, /const card = s\.subscribe \?\? \{/)
  assert.match(view, /const formId = n\.newsletter_form_id \|\| investors\.newsletter_form_id/)
  assert.doesNotMatch(view, /\{n\.newsletter_(title|text|button)\}/)
  const kit = readFileSync(path.join(ROOT, 'src', 'views', 'Kit.astro'), 'utf8')
  assert.match(kit, /getEmDashEntry\('investors', 'investors', \{ locale \}\)/)
})
