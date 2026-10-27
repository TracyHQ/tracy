// tools/personalize.mjs against the mock EmDash: the customer's name, address and hotline land in
// the chrome, the demo brand is gone from every string, missing answers leave fields EMPTY (never
// the demo value), copy is written by a model when one answers and skipped by name when none does,
// and a second run with the same answers writes nothing.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  addressIn,
  blocksFrom,
  drawPicture,
  factsFrom,
  fill,
  initialsOf,
  languageDecision,
  languageNameOfWritten,
  languageName,
  localesFrom,
  noThinking,
  phoneIn,
  pictureSpot,
  planFrom,
  replaceDeep,
  rewriteBlock,
  rewriteEntries,
  rewriteTerms,
  socialFrom
} from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
/** The same four-by-hand-then-ICU rule tools/personalize.mjs applies; kept here so the test reads
 *  the seed rather than a typed list. */
const NAMED = { en: 'English', ru: 'Russian', vi: 'Vietnamese', zh: 'Chinese' }
const languageNameOf = (locale) =>
  NAMED[locale] ?? new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))
const questions = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'questions.json'), 'utf8'))

/** A site that first-run setup seeded from seed.json: chrome, home, about, contact, one post — both locales. */
function seededMock() {
  const mock = createMockEmdash()
  for (const coll of ['site', 'home', 'about', 'contact', 'services_page'])
    for (const e of seed.content[coll]) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  const post = seed.content.posts.find((e) => e.locale === 'en' && /Northgate/.test(e.data.title))
  mock.state.addEntry('posts', post.slug, 'en', post.data)
  return { mock, post }
}

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [TOOL, ...args],
      // The report names every entry of every shipped locale; the default buffer cut it (16/09).
      { cwd: ROOT, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

function tokenDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return dir
}

test('facts: name, initials, phone and address come out of the three answers; nothing is invented', () => {
  const f = factsFrom(
    {
      name: 'An Leather handmade Studio',
      sector: 'manufacturing',
      contact: 'Ngã tư Ô Chợ Dừa, Hà Nội · +84 24 3999 0000'
    },
    questions,
    new Date('2026-09-15')
  )
  assert.equal(f.NAME, 'AN LEATHER HANDMADE STUDIO')
  assert.equal(f.initials, 'ALS')
  assert.equal(f.phone, '+84 24 3999 0000')
  assert.equal(f.address, 'Ngã tư Ô Chợ Dừa, Hà Nội')
  assert.equal(f.sectorLabel, 'Manufacturing')
  assert.equal(f.year, '2026')
  const none = factsFrom({ name: 'Granite', contact: 'Ngã tư ô chợ dừa , Hà nội' })
  assert.equal(none.phone, undefined, 'no digits, no phone')
  assert.equal(none.address, 'Ngã tư ô chợ dừa , Hà nội')
  assert.equal(none.initials, 'GR')
  assert.deepEqual(Object.keys(factsFrom({})), ['year'])
  assert.match(initialsOf('Công ty Cổ phần Công nghiệp Bắc Môn'), /^[A-ZÀ-Ỹ]{3}$/)
  assert.equal(phoneIn('Hotline 0225 000 000, plot 12'), '0225 000 000')
  assert.equal(
    addressIn('12 Northgate Road, Hai Phong · +84 225 000 000', '+84 225 000 000'),
    '12 Northgate Road, Hai Phong'
  )
  assert.deepEqual(fill('© {year} {name}', { year: '2026' }), { missing: 'name' })
  assert.deepEqual(fill('{NAME}', {}), { missing: 'NAME' })
})

test('the plan replaces the demo brand in every string but never in a URL, slug or reference', () => {
  const facts = factsFrom({ name: 'Granite Works', contact: 'Hà Nội' })
  const { patches, unanswered } = planFrom(map, seed, facts)
  const site = patches.get('site/site/en').fields
  assert.equal(site.brand_name, 'GRANITE WORKS')
  assert.equal(site.brand_mark, 'GW')
  assert.equal(site.topbar_address, 'Hà Nội')
  // 🔒 A contact line the customer did not give keeps the template's, as a placeholder (product owner, 11/10/2026): the
  // run writes nothing there, so the demo value stands byte for byte.
  const demoSite = (locale) => seed.content.site.find((e) => e.locale === locale).data
  assert.equal(
    site.hotline ?? demoSite('en').hotline,
    demoSite('en').hotline,
    'no phone given → the demo number stays'
  )
  assert.equal(site.topbar_phone ?? demoSite('en').topbar_phone, demoSite('en').topbar_phone)
  assert.equal(
    site.topbar_email ?? demoSite('en').topbar_email,
    demoSite('en').topbar_email,
    'nobody asked for an email → the demo address stays as a placeholder'
  )
  // K6: the demo's social buttons stay, their links emptied and no handle naming the demo company.
  assert.equal(site.social.length, demoSite('en').social.length)
  assert.ok(site.social.every((x) => x.url === '' && !/northgate/i.test(x.handle)))
  assert.match(site.footer_text, /^Granite Works\. /)
  assert.match(
    site.copyright,
    /^© \d{4} Granite Works\. EmDash CMS Template by Tracy\.ai$/,
    'the template credit stays'
  )
  const ru = patches.get('site/site/ru').fields
  assert.equal(ru.topbar_phone ?? demoSite('ru').topbar_phone, demoSite('ru').topbar_phone)
  assert.equal(patches.get('home/home/ru').fields.why_eyebrow, 'Почему «Granite Works»')
  assert.equal(patches.get('home/home/en').fields.why_eyebrow, 'Why Granite Works')
  const about = patches.get('about/about/en').fields
  assert.match(about.lede, /^Granite Works is a full-cycle/)
  assert.equal(about.cta_url, undefined, 'a URL is not a string to rewrite')
  for (const u of unanswered) assert.match(u.why, /stays as a placeholder$/, u.rule)
  const kept = replaceDeep(
    {
      url: '/northgate',
      href: 'https://northgate.example',
      ref: '$ref:projects:northgate:en',
      t: 'Northgate x'
    },
    [{ find: 'Northgate', with: 'G' }]
  )
  assert.deepEqual(kept, {
    url: '/northgate',
    href: 'https://northgate.example',
    ref: '$ref:projects:northgate:en',
    t: 'G x'
  })
})

test("the owner's opening hours land in the footer; none given, the template's stay as a placeholder", () => {
  const given = planFrom(map, seed, factsFrom({ name: 'Granite Works', hours: 'Open 6am-8pm every day' }))
  assert.equal(given.patches.get('site/site/en').fields.hours, 'Open 6am-8pm every day')
  const none = planFrom(map, seed, factsFrom({ name: 'Granite Works' }))
  assert.equal(
    none.patches.get('site/site/en')?.fields.hours,
    undefined,
    'nothing written: the demo hours stay'
  )
  assert.ok(none.unanswered.some((u) => u.rule === 'site.site.hours' && /placeholder/.test(u.why)))
})

test("the profiles the owner linked replace the demo company's, in the shape the field holds; none linked, the demo's buttons stay unlinked (K6)", () => {
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
  const given = planFrom(map, seed, factsFrom({ name: 'Granite Works', social: linked }))
  assert.deepEqual(given.patches.get('site/site/en').fields.social, [
    { name: 'Instagram', handle: '@goldencrust', url: 'https://instagram.com/goldencrust', text: '' },
    { name: 'Facebook', handle: '@golden.crust', url: 'https://facebook.com/golden.crust?ref=1', text: '' }
  ])
  const none = planFrom(map, seed, factsFrom({ name: 'Granite Works' }))
  const demo = seed.content.site.find((e) => e.locale === 'en').data.social
  const kept = none.patches.get('site/site/en').fields.social
  assert.deepEqual(
    kept.map((x) => x.name),
    demo.map((x) => x.name),
    "no profile of theirs: the demo's buttons stay (K6)"
  )
  assert.ok(
    kept.every((x) => x.url === '' && x.handle === ''),
    "none leads to the demo company's profiles, and no handle names it"
  )
})

// That the description reaches the form's prompt is run, not read, in personalize-apply.test.mjs
// ("the enquiry form is written from what the business does, …").
test('the enquiry form rule asks for its four fields and carries over no law of the demo', () => {
  const rule = map.forms.find((r) => r.slug === 'quote-request')
  assert.deepEqual(Object.keys(rule.fields).sort(), ['consent', 'description', 'name', 'type'])
  assert.match(rule.fields.consent, /naming no law/, "the demo's Federal Law 152-FZ is not carried over")
})

test('without a name nothing is guessed: brand rules are skipped and named, address still lands', () => {
  const { patches, unanswered } = planFrom(
    map,
    seed,
    factsFrom({ contact: 'Plot 4, Da Nang · 0236 555 555' })
  )
  assert.ok(unanswered.some((s) => s.rule === 'site.site.brand_name' && /no name/.test(s.why)))
  assert.ok(unanswered.some((s) => s.rule === 'replace "Northgate"'))
  assert.equal(patches.get('site/site/en').fields.hotline, '0236 555 555')
  assert.equal(patches.get('site/site/en').fields.brand_name, undefined)
})

test('end to end on the mock: writes and publishes, empties what it must, then writes nothing the second time', async () => {
  const { mock, post } = seededMock()
  const site = await mock.listen()
  const dir = tokenDir()
  const receipts = path.join(dir, 'receipts.json')
  // English chosen: every other locale is hidden (no language chosen hides nothing, LANG-5; its own test below).
  const answers = JSON.stringify({
    name: 'An Leather handmade Studio',
    sector: 'manufacturing',
    contact: 'Ngã tư Ô Chợ Dừa, Hà Nội · +84 24 3999 0000',
    languages: ['en']
  })
  try {
    const first = await run([
      '--answers-json',
      answers,
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      receipts,
      '--no-model',
      '--json'
    ])
    assert.equal(first.code, 3, `exit 3: copy skipped by name\n${first.stderr}`)
    const report = JSON.parse(first.stdout)
    assert.ok(report.written.some((w) => w.entry === 'site/site/en'))
    assert.ok(report.written.some((w) => w.entry === 'settings'))
    assert.deepEqual(report.copy.done, [])
    assert.match(report.copy.skipped[0].why, /--no-model/)
    // What a visitor sees: the PUBLISHED data, both locales.
    const en = [...mock.state.entries.values()].find((e) => e.collection === 'site' && e.locale === 'en')
    assert.equal(en.draft, null, 'published, not left as a draft')
    assert.equal(en.live.brand_name, 'AN LEATHER HANDMADE STUDIO')
    assert.equal(en.live.hotline, '+84 24 3999 0000')
    assert.equal(en.live.topbar_phone, 'Hotline: +84 24 3999 0000')
    assert.equal(en.live.topbar_address, 'Ngã tư Ô Chợ Dừa, Hà Nội')
    // No About answer: the demo company's registration line stays like every other claim (ABOUT-3, TCH #1013).
    assert.equal(
      en.live.footer_legal_1,
      seed.content.site.find((e) => e.locale === 'en').data.footer_legal_1,
      'no About answer: the legal line stays as the template has it'
    )
    assert.equal(en.live.quote_label, 'Request a quote', 'untouched fields keep their text')
    // 🔒 NO LANGUAGE IN THE ANSWERS MEANS ENGLISH ONLY, AND EVERY OTHER LOCALE IS HIDDEN (David,
    // 23/09/2026 — as Joomla hides them, PR #267): unpublished, never deleted, words untouched.
    const ru = [...mock.state.entries.values()].find((e) => e.collection === 'site' && e.locale === 'ru')
    assert.equal(ru.live.topbar_phone, seed.content.site.find((e) => e.locale === 'ru').data.topbar_phone)
    const others = [...mock.state.entries.values()].filter((e) => e.locale !== 'en')
    assert.ok(others.length > 0)
    assert.deepEqual(
      others.filter((e) => e.status === 'published').map((e) => `${e.collection}/${e.locale}`),
      [],
      'every other locale is taken off the site'
    )
    assert.deepEqual(report.language.write, ['en'])
    assert.equal(report.language.hidden.length, 39)
    assert.equal(report.language.unpublished, others.length, 'each hidden entry once')
    assert.ok(!report.hidden.some((h) => h.menu), 'no menu item is deleted for a hidden locale')
    assert.ok(
      report.written.every((w) => w.entry === 'settings' || w.entry.endsWith('/en')),
      `only English is written: ${report.written.map((w) => w.entry).join(', ')}`
    )
    const home = [...mock.state.entries.values()].find((e) => e.collection === 'home' && e.locale === 'en')
    assert.equal(home.live.why_eyebrow, 'Why An Leather handmade Studio')
    assert.equal(home.live.hero_title_a, 'Building the groundwork for', 'copy stays demo without a model')
    const p = [...mock.state.entries.values()].find((e) => e.collection === 'posts')
    // No model and no About answer: the demo note stays with its words, the demo company renamed (TCH #1013, ABOUT-3, K7);
    // a demo row is cut only for a customer who described the business, with a model to rewrite what stays.
    assert.match(p.live.title, /^An Leather handmade Studio wins/, 'renamed, never cut')
    assert.equal(p.status, 'published', 'still on the site')
    assert.equal(p.slug, post.slug, 'the slug is not rewritten')
    assert.equal(mock.state.settings.title, 'An Leather handmade Studio')

    const again = await run([
      '--answers-json',
      answers,
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      receipts,
      '--no-model',
      '--json'
    ])
    const r2 = JSON.parse(again.stdout)
    assert.deepEqual(r2.written, [], 'same answers, nothing written twice')
    assert.equal(r2.language.unpublished, 0, 'and nothing hidden twice')
    assert.ok(r2.unchanged.length > 0)

    // The revision moved without anyone touching what was written (a discarded draft, an
    // unpublish, a republish): still ours, so a new name is written, not left to an editor.
    en.version++
    en.updatedAt = new Date().toISOString()
    const moved = await run([
      '--answers-json',
      JSON.stringify({ ...JSON.parse(answers), name: 'Moved Name' }),
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      receipts,
      '--no-model',
      '--json'
    ])
    const rm = JSON.parse(moved.stdout)
    assert.ok(!rm.editor.includes('site/site/en'), 'a moved rev with our values intact is not an editor')
    assert.ok(
      rm.written.some((w) => w.entry === 'site/site/en'),
      'the new name is written'
    )
    assert.equal(en.live.brand_name, 'MOVED NAME')

    // An editor changed the chrome since: it is left alone and reported.
    en.live.brand_name = 'EDITED'
    en.version++
    en.updatedAt = new Date().toISOString()
    const third = await run([
      '--answers-json',
      JSON.stringify({ ...JSON.parse(answers), name: 'Other Name' }),
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      receipts,
      '--no-model',
      '--json'
    ])
    const r3 = JSON.parse(third.stdout)
    assert.ok(r3.editor.includes('site/site/en'))
    assert.equal(en.live.brand_name, 'EDITED')
  } finally {
    await mock.close()
  }
})

// 🔒 HIDING A LANGUAGE BY ITS CHROME ENTRY ALONE (03/10/2026). The template serves a locale only when its `site`
// entry is published (`src/lib/served-locales.ts`: the switcher, the hreflang links, the sitemap and the redirect of
// its URLs all ask that), so the other entries of a hidden language change nothing a visitor can reach — and
// unpublishing them is ~1,750 round trips. Off by default: the agent's own runs keep hiding every entry.
test('--hide-chrome-only: a language nobody asked for is unpublished by its site chrome alone', async () => {
  const { mock } = seededMock()
  const site = await mock.listen()
  const dir = tokenDir()
  try {
    const r = await run([
      '--answers-json',
      JSON.stringify({ name: 'An Leather handmade Studio', languages: ['en'] }),
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      path.join(dir, 'receipts.json'),
      '--no-model',
      '--hide-chrome-only',
      '--concurrency',
      '8',
      '--json'
    ])
    const report = JSON.parse(r.stdout)
    const others = [...mock.state.entries.values()].filter((e) => e.locale !== 'en')
    const chrome = others.filter((e) => e.collection === 'site')
    assert.ok(
      chrome.length > 0 && others.length > chrome.length,
      'the mock holds more than chrome in other locales'
    )
    assert.deepEqual(
      chrome.filter((e) => e.status === 'published'),
      [],
      'every hidden locale lost its chrome entry'
    )
    assert.ok(
      others.some((e) => e.collection !== 'site' && e.status === 'published'),
      'and only that: their pages were not each unpublished'
    )
    assert.equal(report.language.unpublished, chrome.length, 'one unpublish per hidden language')
    const gets = mock.state.log.filter((l) => l.method === 'GET' && /\/content\//.test(l.path)).length
    assert.ok(gets < 200, `a handful of reads, not one per hidden entry: ${gets}`)
  } finally {
    await mock.close()
  }
})

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

test('with a model the copy is written per locale, checked for length, and the tagline follows', async () => {
  const { mock } = seededMock()
  const site = await mock.listen()
  const asked = []
  const model = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    // Several shapes reach one endpoint. Card lists ask for `rows`, taxonomies for labels by slug,
    // the enquiry form for words by field name, and whole demo entries by slug.
    const say = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }))
    }
    if (Array.isArray(user.rows)) {
      say({
        rows: user.rows.map((row, i) =>
          Object.fromEntries(Object.keys(row).map((k) => [k, `${k} ${String(i)}`]))
        )
      })
      return
    }
    if (Array.isArray(user.terms)) {
      say(Object.fromEntries(user.terms.map((t) => [t.slug, `L ${t.slug}`])))
      return
    }
    if (Array.isArray(user.fields) && user.fields[0]?.name !== undefined) {
      say(Object.fromEntries(user.fields.map((f) => [f.name, { label: `F ${f.name}` }])))
      return
    }
    if (Array.isArray(user.entries)) {
      const rewritten = {}
      for (const e of user.entries) rewritten[e.key] = { title: `R ${e.key}` }
      say(rewritten)
      return
    }
    // A body asked again on its own, its parts counted (`rewriteBody`).
    if (Array.isArray(user.parts)) {
      say({ body: user.parts.map((p) => `B ${String(p.part)}`) })
      return
    }
    asked.push({
      auth: req.headers.authorization,
      language: /in (.+?) for/.exec(body.messages[0].content)?.[1],
      keys: user.fields.map((f) => f.key),
      business: user.business
    })
    const answer = {}
    for (const f of user.fields)
      answer[f.key] =
        f.key === 'home.home.hero_text' ? 'word '.repeat(200) : `${asked.length}:${f.key.split('.').pop()}`
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const modelUrl = await new Promise((r) =>
    model.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${model.address().port}/v1/chat`))
  )
  const dir = tokenDir()
  try {
    const out = await run(
      [
        '--answers-json',
        JSON.stringify({
          name: 'Granite Works',
          sector: 'construction',
          // The copy is written only for a customer who described the business (TCH #1013, ABOUT-3, K7).
          about: 'We build granite worktops in Hanoi.',
          contact: 'Hà Nội',
          languages: ['en', 'ru']
        }),
        '--site',
        site,
        '--token-file',
        path.join(dir, 'token'),
        '--receipts',
        path.join(dir, 'r.json'),
        '--json'
      ],
      {
        TRACY_MODEL_URL: modelUrl,
        TRACY_MODEL_KEY: 'k-test',
        TRACY_MODEL_NAME: 'm',
        OPENROUTER_API_KEY: '',
        DEEPSEEK_API_KEY: ''
      }
    )
    const report = JSON.parse(out.stdout)
    assert.equal(out.code, 3, JSON.stringify(report.errors))
    // One COPY call per PAGE and locale since 15/09 (each page goes live as it is answered);
    // every call speaks one language, and only the chosen languages are asked for.
    assert.ok(asked.length >= 2, 'copy is asked for')
    assert.deepEqual([...new Set(asked.map((a) => a.language))].sort(), ['English', 'Russian'])
    // The pages fly four at a time, so which call is first is not fixed: the home page's own
    // call is found by its keys, and a written value is checked by shape (`<call>:<field>`).
    const homeCall = asked.find((a) => a.language === 'English' && a.keys.includes('home.home.hero_title_b'))
    assert.ok(homeCall, 'the home page is asked for in English')
    assert.equal(homeCall.auth, 'Bearer k-test')
    assert.equal(homeCall.business.sector, 'Construction')
    const home = [...mock.state.entries.values()].find((e) => e.collection === 'home' && e.locale === 'en')
    assert.match(home.live.hero_title_b, /^\d+:hero_title_b$/)
    assert.equal(
      home.live.hero_text,
      seed.content.home.find((e) => e.locale === 'en').data.hero_text,
      'too long even when asked again, shorter → kept the demo text, and named'
    )
    assert.ok(report.copy.skipped.some((s) => s.field === 'home.home.hero_text' && s.locale === 'en'))
    assert.match(mock.state.settings.tagline, /^\d+:brand_sub$/, 'the tagline follows the brand line')
    const ru = [...mock.state.entries.values()].find((e) => e.collection === 'home' && e.locale === 'ru')
    assert.match(ru.live.hero_title_b, /^\d+:hero_title_b$/)
    assert.notEqual(ru.live.hero_title_b, home.live.hero_title_b, 'each language is its own call')
    // A locale nobody chose keeps the template's words, and is taken off the site.
    const vi = [...mock.state.entries.values()].find((e) => e.collection === 'home' && e.locale === 'vi')
    assert.equal(vi.live.hero_title_b, seed.content.home.find((e) => e.locale === 'vi').data.hero_title_b)
    assert.notEqual(vi.status, 'published')
    assert.equal(ru.status, 'published', 'a chosen locale stays on the site')
  } finally {
    await mock.close()
    await new Promise((r) => model.close(r))
  }
})

test('facts are removed, never written: counts, years, certifications and named people go empty', () => {
  const { patches } = planFrom(map, seed, factsFrom({ name: 'Granite Works', contact: 'Ha Noi' }))
  const home = patches.get('home/home/en').fields
  assert.deepEqual(home.stats, [], 'no "380 projects since 2004" under a bakery')
  assert.deepEqual(home.client_logos, [])
  const about = patches.get('about/about/en').fields
  assert.deepEqual([about.stats, about.history, about.certs, about.team], [[], [], [], []])
  assert.equal(about.safety_text, '')
  const careers = patches.get('careers/careers/en').fields
  assert.deepEqual(careers.stats, [])
  assert.equal(careers.quote, '')
  assert.equal(careers.cta_mail, '', "another company's mailbox")
  const project = patches.get('projects/elektra-lipetsk/en').fields
  assert.equal(project.year, '')
  assert.equal(project.area, '')
  assert.deepEqual(project.facts, [])
  // And the same fields in the other locale.
  assert.deepEqual(patches.get('home/home/ru').fields.stats, [])
})

// 🔒 THE SAME LANGUAGE IS SPELT THREE WAYS, AND A FULL-TAG COMPARISON FAILED OPEN.
// Measured 22/09/2026: on one day the three Build questionnaires answered `en-gb` (Joomla),
// `en-us` (WordPress) and `en` (EmDash) for the same English. This template ships bare `en`/`ru`,
// so only the third matched — and an answer of `en-us` fell through to "nothing was asked for",
// which then wrote EVERY LOCALE and said nothing. EmDash was correct by a coincidence of spelling.
test('localesFrom: a regional answer picks the template\u2019s bare locale, and the rest is hidden', () => {
  for (const answer of ['en-us', 'en-GB', 'EN']) {
    assert.deepEqual(
      localesFrom({ languages: [answer] }, ['en', 'ru'], 'en'),
      { write: ['en'], hide: ['ru'], why: null },
      answer
    )
  }
  // Two chosen languages write both editions and hide the rest.
  assert.deepEqual(localesFrom({ languages: ['en-us', 'ru-RU'] }, ['en', 'ru', 'de'], 'en'), {
    write: ['en', 'ru'],
    hide: ['de'],
    why: null
  })
  // Languages this template does not ship, among several: the first is written into the root (as one would be, O2), a
  // later one has no edition to be written in, and the report says so.
  const unshipped = localesFrom({ languages: ['sw', 'xx'] }, ['en', 'ru'], 'en')
  assert.deepEqual(unshipped.write, ['en'])
  assert.deepEqual(unshipped.hide, ['ru'])
  assert.deepEqual(unshipped.as, { en: 'sw' })
  assert.match(unshipped.why, /ships en, ru, not xx/)
})

// 🔒 ONE LANGUAGE THAT IS NOT THE ROOT'S IS WRITTEN INTO THE ROOT (TCH #1013, D10, O2). The language
// question asks for one language: `/` is the default locale's, so the root is written in the language
// chosen, no second edition lives under a prefix, and every other locale is hidden — the shipped
// locale of that language too. A language the template does not ship is written at the root all the same.
test('localesFrom: one language other than the root\u2019s is written into the root, and every other locale is hidden', () => {
  assert.deepEqual(localesFrom({ languages: ['vi'] }, ['en', 'ru', 'vi'], 'en'), {
    write: ['en'],
    hide: ['ru', 'vi'],
    why: null,
    as: { en: 'vi' }
  })
  assert.deepEqual(
    localesFrom({ language: 'vi-vn' }, ['en', 'vi'], 'en').as,
    { en: 'vi' },
    'the shipped spelling'
  )
  assert.deepEqual(
    localesFrom({ languages: ['de-de'] }, ['en'], 'en'),
    { write: ['en'], hide: [], why: null, as: { en: 'de-de' } },
    'not shipped: the root is written in it all the same'
  )
  assert.equal(localesFrom({ languages: ['en-gb'] }, ['en', 'vi'], 'en').as, undefined, 'English is the root')
  assert.equal(
    localesFrom({ languages: ['en', 'vi'] }, ['en', 'vi'], 'en').as,
    undefined,
    'several: editions'
  )
})

test('languageDecision: a later run without a language keeps the root written in the language the build chose', () => {
  const shipped = ['en', 'ru', 'vi']
  assert.deepEqual(languageDecision({ name: 'X' }, shipped, 'en', { write: ['en'], as: { en: 'vi' } }), {
    write: ['en'],
    hide: ['ru', 'vi'],
    why: null,
    as: { en: 'vi' }
  })
  assert.equal(languageNameOfWritten('en', { en: 'vi' }), 'Vietnamese')
  assert.equal(languageNameOfWritten('ru', { en: 'vi' }), 'Russian')
})

test('localesFrom: an exact regional tag wins over its language; only an unspelt one falls back to the first', () => {
  const shipped = ['en', 'pt-BR', 'pt-PT']
  assert.deepEqual(localesFrom({ languages: ['en', 'pt-pt'] }, shipped, 'en'), {
    write: ['en', 'pt-PT'],
    hide: ['pt-BR'],
    why: null
  })
  assert.deepEqual(localesFrom({ languages: ['en', 'pt'] }, shipped, 'en'), {
    write: ['en', 'pt-BR'],
    hide: ['pt-PT'],
    why: null
  })
})

test('every locale the seed ships reaches the model by its English name, never as a bare tag', () => {
  // The model end-to-end test above asks for two languages, not forty, since no answer writes
  // English only — so the forty names are pinned here. The list is READ from the seed, not typed:
  // a locale added without a name the model understands reaches it as "write in af", and the
  // answer comes back in English with nothing to say it went wrong.
  const shipped = [
    ...new Set(
      Object.values(seed.content)
        .flat()
        .map((e) => e.locale)
    )
  ]
  assert.ok(shipped.length >= 40, `the seed ships ${shipped.length} locales`)
  for (const locale of shipped) {
    assert.equal(languageName(locale), languageNameOf(locale), locale)
    assert.notEqual(languageName(locale), locale, `${locale} has a name`)
  }
})

test('localesFrom: no answer is English, and the default locale is written whatever was chosen', () => {
  assert.deepEqual(localesFrom({ language: 'en' }, ['en', 'ru'], 'en'), {
    write: ['en'],
    hide: ['ru'],
    why: null
  })
  assert.deepEqual(localesFrom({ languages: ['en', 'ru'] }, ['en', 'ru'], 'en'), {
    write: ['en', 'ru'],
    hide: [],
    why: null
  })
  // 🔒 NO ANSWER WRITES ENGLISH ONLY, NOT EVERY LOCALE THE TEMPLATE SHIPS (David, 23/09/2026).
  // 🔒 AND HIDES NOTHING: no language chosen keeps the template's languages as they are (TCH #1013, LANG-5, 09/10/2026).
  // Measured on a blank Tracy Business EmDash 1.7.3 site: 39 languages hidden, 1911 entries unpublished after hand-over.
  assert.deepEqual(
    localesFrom({}, ['en', 'ru'], 'en'),
    { write: ['en'], hide: [], why: null },
    'unanswered writes English and keeps Russian'
  )
  assert.deepEqual(
    localesFrom({}, ['ru', 'en-GB'], 'ru'),
    { write: ['ru', 'en-GB'], hide: [], why: null },
    'English by language, not by tag, beside the root'
  )
  assert.deepEqual(
    localesFrom({}, ['ru', 'de'], 'ru'),
    { write: ['ru'], hide: [], why: null },
    'no English at all: the root locale, German kept'
  )
  assert.deepEqual(
    localesFrom({ languages: [] }, ['en', 'ru', 'de'], 'en'),
    { write: ['en'], hide: [], why: null },
    'an empty list is no answer'
  )
  // 🔒 A CHOICE WITHOUT THE DEFAULT LOCALE STILL WRITES IT: the root cannot be hidden, and would
  // otherwise open the customer's own site on the demo company's English home page.
  // 🔒 BUT IN THE FIRST LANGUAGE CHOSEN, NOT IN ENGLISH (TCH #1013, D2): the switcher offers only the languages the customer
  // chose. Written in English, the root put an "English" nobody asked for beside Russian and German. The shipped edition of
  // the language the root is written in is hidden, as with one language (O2).
  assert.deepEqual(localesFrom({ languages: ['ru', 'de'] }, ['en', 'ru', 'de'], 'en'), {
    write: ['en', 'de'],
    hide: ['ru'],
    why: null,
    as: { en: 'ru' }
  })
})

test('languageDecision: a run that names no language keeps the languages an earlier run chose', () => {
  const shipped = ['en', 'ru', 'vi', 'de']
  // The build chose Russian; a later run (a new name, a redrawn picture) says nothing about languages.
  assert.deepEqual(languageDecision({ name: 'X' }, shipped, 'en', ['en', 'ru']), {
    write: ['en', 'ru'],
    hide: ['vi', 'de'],
    why: null
  })
  // An answer that names languages always wins over the record.
  assert.deepEqual(languageDecision({ languages: ['en', 'vi'] }, shipped, 'en', ['en', 'ru']), {
    write: ['en', 'vi'],
    hide: ['ru', 'de'],
    why: null
  })
  // A recorded locale the template no longer ships is dropped; nothing recorded is the answers' rule.
  assert.deepEqual(languageDecision({}, shipped, 'en', ['en', 'xx']).write, ['en'])
  // No language answered and nothing recorded hides nothing (LANG-5).
  assert.deepEqual(languageDecision({}, shipped, 'en', undefined), {
    write: ['en'],
    hide: [],
    why: null
  })
  // A build that chose no language recorded that it hid nothing: a later run hides nothing either.
  assert.deepEqual(languageDecision({ name: 'Y' }, shipped, 'en', { write: ['en'], hide: [] }), {
    write: ['en'],
    hide: [],
    why: null
  })
})

test('end to end on the mock: no language chosen hides no locale (LANG-5)', async () => {
  const { mock } = seededMock()
  const site = await mock.listen()
  const dir = tokenDir()
  const receipts = path.join(dir, 'receipts.json')
  try {
    const r = await run([
      '--answers-json',
      JSON.stringify({ name: 'Tamarind Bakery' }),
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      receipts,
      '--no-model',
      '--json'
    ])
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.language.hidden, [])
    assert.equal(report.language.unpublished, 0)
    const others = [...mock.state.entries.values()].filter(
      (e) => e.locale !== 'en' && e.collection === 'site'
    )
    assert.ok(
      others.length > 0 && others.every((e) => e.status === 'published'),
      'every other locale is still served'
    )
    assert.deepEqual(JSON.parse(readFileSync(receipts, 'utf8')).language.hide, [])
  } finally {
    await mock.close()
  }
})

test('end to end on the mock: no language chosen, the customer\u2019s name reaches every edition still served (ABOUT-3)', async () => {
  const { mock } = seededMock()
  const site = await mock.listen()
  const dir = tokenDir()
  try {
    const r = await run([
      '--answers-json',
      JSON.stringify({ name: 'Tamarind Bakery' }),
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      path.join(dir, 'receipts.json'),
      '--no-model',
      '--json'
    ])
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [])
    const brand = new RegExp(
      map.demoCompanyNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    )
    const named = [...mock.state.entries.values()].filter(
      (e) => e.status === 'published' && brand.test(JSON.stringify(e.live))
    )
    assert.deepEqual(
      named.map((e) => `${e.collection}/${e.slug}/${e.locale}`),
      [],
      'no edition a visitor can open names the demo company'
    )
    const de = [...mock.state.entries.values()].find((e) => e.collection === 'site' && e.locale === 'de')
    assert.equal(de.status, 'published', 'German is still served')
    assert.equal(de.live.brand_name, 'TAMARIND BAKERY')
    assert.equal(de.live.brand_mark, 'TB')
    // The name and nothing else: the German edition keeps its own words and the template's other details.
    const seedDe = seed.content.site.find((e) => e.locale === 'de').data
    assert.equal(de.live.brand_sub, seedDe.brand_sub)
    assert.equal(de.live.topbar_phone, seedDe.topbar_phone)
    assert.deepEqual(report.language.hidden, [])
  } finally {
    await mock.close()
  }
})

test('end to end on the mock: a later run that names no language keeps the one the build chose', async () => {
  const { mock } = seededMock()
  const site = await mock.listen()
  const dir = tokenDir()
  const receipts = path.join(dir, 'receipts.json')
  const args = (answers) => [
    '--answers-json',
    JSON.stringify(answers),
    '--site',
    site,
    '--token-file',
    path.join(dir, 'token'),
    '--receipts',
    receipts,
    '--no-model',
    '--json'
  ]
  try {
    const built = JSON.parse((await run(args({ name: 'Granite Works', languages: ['en', 'ru'] }))).stdout)
    assert.deepEqual(built.language.write, ['en', 'ru'])
    const renamed = JSON.parse((await run(args({ name: 'Granite Works Ltd' }))).stdout)
    assert.deepEqual(renamed.language.write, ['en', 'ru'], 'the record, not "English only"')
    const ru = [...mock.state.entries.values()].find((e) => e.collection === 'site' && e.locale === 'ru')
    assert.equal(ru.status, 'published', 'Russian is still on the site')
    assert.equal(renamed.language.unpublished, 0)
  } finally {
    await mock.close()
  }
})

test('rewriteEntries: batches, keeps slugs and shapes, turns a body into blocks, reports what came back empty', async () => {
  const seen = []
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    const user = JSON.parse(body.messages[1].content)
    // The prompt never carries the demo's slug (it names the demo company); entries are keyed.
    assert.ok(user.entries.every((e) => e.slug === undefined && /^entry-\d+$/.test(e.key)))
    seen.push(user.entries.map((e) => e.key))
    const answer = {}
    for (const [i, e] of user.entries.entries()) {
      if (i === 0 && seen.length === 1) continue // one entry the model did not answer
      answer[e.key] = {
        title: `T ${e.key}`,
        description: 'A line about what we make.',
        term: 'Ready the same week',
        includes: Array.isArray(e.example.includes)
          ? e.example.includes.map((_, n) => `item ${String(n)}`)
          : undefined
      }
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) }
  }
  const entries = seed.content.services
    .filter((e) => e.locale === 'en')
    .map((e) => ({ ...e, collection: 'services' }))
  const rule = map.rewrite.find((r) => r.collection === 'services')
  const out = await rewriteEntries({
    model: { url: 'http://x/v1', key: 'k', model: 'm' },
    rule,
    facts: { name: 'Granite Works', about: 'We cut granite worktops.', sectorLabel: 'Manufacturing' },
    locale: 'en',
    entries,
    fetchImpl,
    batch: 6
  })
  assert.equal(seen.length, Math.ceil(entries.length / 6), 'asked in batches of six')
  assert.ok(seen[0].length <= 6)
  const first = entries[0]
  assert.ok(!(`services/${first.slug}/en` in out.written), 'an entry the model skipped is not written')
  assert.ok(out.skipped.some((s) => s.entry === `services/${first.slug}`))
  const one = out.written[`services/${entries[1].slug}/en`]
  assert.equal(one.title, 'T entry-2', 'mapped back from the key to the second entry')
  assert.equal(one.term, 'Ready the same week')
  assert.equal(one.includes.length, entries[1].data.includes.length, 'a list keeps its length and its shape')
  assert.equal(one.includes[0].item, 'item 0')
  assert.equal(one.slug, undefined, 'the slug is an id: never rewritten')
  assert.equal(one.sort, undefined, 'only the fields the map names')

  // A body becomes portable-text blocks with unique keys.
  const blocks = blocksFrom('One paragraph.\n\nAnd another.', 'k-')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0]._type, 'block')
  assert.equal(blocks[0].children[0].text, 'One paragraph.')
  assert.notEqual(blocks[0]._key, blocks[1]._key)
})

test('a model that refuses a batch leaves those entries alone and names the batch', async () => {
  const out = await rewriteEntries({
    model: { url: 'http://x/v1', key: 'k', model: 'm' },
    rule: map.rewrite.find((r) => r.collection === 'vacancies'),
    facts: { name: 'Granite Works', about: 'We cut granite worktops.' },
    locale: 'en',
    entries: seed.content.vacancies
      .filter((e) => e.locale === 'en')
      .map((e) => ({ ...e, collection: 'vacancies' })),
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    batch: 6
  })
  assert.deepEqual(out.written, {})
  assert.ok(out.skipped.length >= 1)
  assert.match(out.skipped[0].why, /^vacancies 1–\d+: HTTP 503/)
})

test('rewriteBlock: the card list keeps its length and every key the row already had', async () => {
  const rows = [
    { number: '01', title: 'Industrial park infrastructure', text: 'Earthworks and roads.' },
    { number: '02', title: 'Factory buildings', text: 'Steel frame and envelope.' }
  ]
  const out = await rewriteBlock({
    model: { url: 'http://x/v1', key: 'k', model: 'm' },
    rule: { itemFields: ['title', 'text'], brief: 'one thing this business offers' },
    facts: { name: 'Tiem Banh Sen', about: 'A bakery.', sectorLabel: 'Other' },
    locale: 'en',
    rows,
    fetchImpl: async (_u, init) => {
      const asked = JSON.parse(JSON.parse(init.body).messages[1].content)
      assert.equal(asked.rows.length, 2)
      assert.deepEqual(
        Object.keys(asked.rows[0]),
        ['title', 'text'],
        'only the fields the map names are shown'
      )
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rows: [
                    { title: 'Breads', text: 'Baked daily.' },
                    { title: 'Cakes', text: 'Made to order.' }
                  ]
                })
              }
            }
          ]
        })
      }
    }
  })
  assert.equal(out.rows.length, 2)
  assert.deepEqual(out.rows[0], { number: '01', title: 'Breads', text: 'Baked daily.' }, 'the number stays')
  assert.equal(out.rows[1].title, 'Cakes')

  const short = await rewriteBlock({
    model: { url: 'http://x/v1', model: 'm' },
    rule: { itemFields: ['title'], brief: 'x' },
    facts: { name: 'A', about: 'A bakery.' },
    locale: 'en',
    rows,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"rows":[]}' } }] })
    })
  })
  assert.equal(short.rows, null, 'an answer that fits nothing changes nothing')
  assert.match(short.why, /fitted/)

  const down = await rewriteBlock({
    model: { url: 'http://x/v1', model: 'm' },
    rule: { itemFields: ['title'], brief: 'x' },
    facts: { name: 'A', about: 'A bakery.' },
    locale: 'en',
    rows,
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) })
  })
  assert.equal(down.rows, null)
  assert.match(down.why, /HTTP 502/)
})

test('rewriteTerms: labels are written by slug, and a slug the model did not name keeps its own', async () => {
  const terms = [
    { slug: 'disclosures', label: 'Disclosures' },
    { slug: 'engineering', label: 'Engineering' }
  ]
  const out = await rewriteTerms({
    model: { url: 'http://x/v1', model: 'm' },
    rule: { taxonomy: 'category', brief: 'a category of note' },
    facts: { name: 'Tiem Banh Sen', about: 'A bakery.' },
    locale: 'en',
    terms,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ disclosures: 'Notices', nope: 'Ignored' }) } }]
      })
    })
  })
  assert.deepEqual(out.labels, { disclosures: 'Notices' }, 'only the slugs that exist')
  assert.equal(out.why, null)
})

test('drawPicture: asks the image model for one photograph and reads the data URI back', async () => {
  let asked = null
  const png = Buffer.from('fake-png-bytes')
  const got = await drawPicture({
    model: { url: 'http://x/v1', key: 'k', imageModel: 'img-model' },
    style: 'A plain, warm photograph.',
    what: 'the place this business works in',
    facts: { name: 'Tiem Banh Sen', about: 'A bakery.', sectorLabel: 'Other' },
    fetchImpl: async (_u, init) => {
      asked = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: { images: [{ image_url: { url: `data:image/png;base64,${png.toString('base64')}` } }] }
            }
          ]
        })
      }
    }
  })
  assert.equal(asked.model, 'img-model')
  assert.deepEqual(asked.modalities, ['image', 'text'])
  assert.match(asked.messages[0].content, /Tiem Banh Sen/)
  assert.match(asked.messages[0].content, /the place this business works in/)
  assert.match(asked.messages[0].content, /plain, warm photograph/)
  assert.equal(got.mime, 'image/png')
  assert.equal(got.bytes.toString(), 'fake-png-bytes')

  // A model that answers with words and no picture leaves the field alone.
  const none = await drawPicture({
    model: { url: 'http://x/v1', key: 'k', imageModel: 'img-model' },
    what: 'x',
    facts: { name: 'A', about: 'A bakery.' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'I cannot.' } }] })
    })
  })
  assert.equal(none, null)

  await assert.rejects(
    () =>
      drawPicture({
        model: { url: 'http://x/v1', key: 'k', imageModel: 'img-model' },
        what: 'x',
        facts: { name: 'A', about: 'A bakery.' },
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          json: async () => ({ error: { message: 'rate limited' } })
        })
      }),
    /rate limited/
  )
})

test('pictureSpot: the names a person uses for a picture, and the ones nobody has', () => {
  const images = map.images
  const entries = seed.content.projects.map((e) => ({ ...e, collection: 'projects' }))
  assert.deepEqual(pictureSpot('home.hero_image', images, entries), {
    collection: 'home',
    slug: 'home',
    field: 'hero_image',
    what: images.targets.find((t) => t.collection === 'home' && t.field === 'hero_image').what
  })
  assert.equal(pictureSpot('home/home.hero_image', images, entries).field, 'hero_image')
  assert.equal(
    pictureSpot('hero_image', images, entries).collection,
    'home',
    'a bare field takes the first page that has one'
  )
  const one = pictureSpot(`projects/${entries[0].slug}.image`, images, entries)
  assert.equal(one.slug, entries[0].slug)
  assert.equal(one.collection, 'projects')
  assert.equal(pictureSpot('home.nope', images, entries), null)
  assert.equal(pictureSpot('', images, entries), null)
  assert.equal(pictureSpot(undefined, images, entries), null)
})

test('factsFrom carries what the business DOES, not only what it is called', () => {
  // 🔒 The difference between personalising a site and renaming one. Measured 20/09/2026 on
  // `site-4x82yk`: the stage wrote 320 fields and 39 model sentences from `name` alone, and the
  // hero went on advertising the demo's SaaS log product. The customer read that as "it only
  // changed the title" — right about the meaning, even though 320 fields moved.
  const f = factsFrom({ name: 'Bàn Ghế Gỗ Minh', about: 'Đóng nội thất gỗ tự nhiên cho xe hơi' })
  assert.equal(f.about, 'Đóng nội thất gỗ tự nhiên cho xe hơi')
  assert.equal(f.name, 'Bàn Ghế Gỗ Minh')
  // Absent stays absent — never invented, the rule the whole file is built on.
  assert.equal('about' in factsFrom({ name: 'Granite' }), false)
  assert.equal('about' in factsFrom({ name: 'Granite', about: '   ' }), false)
})

test("every demo field that states a working time has an identity rule: the owner's hours, or the template's as a placeholder", () => {
  // Measured 03/10/2026: "Mon–Fri, 9:00–18:00 (MSK)" stayed in the footer of a Hanoi bakery because no rule named the field.
  // 🔒 Product owner, 11/10/2026 (TCH #1013): the questions never ask for opening hours, so the template's stay as a
  // placeholder the customer replaces later through the chat; an emptied footer showed no place for them at all.
  const covered = new Set(map.identity.map((rule) => `${rule.collection}/${rule.slug}/${rule.field}`))
  /** @type {string[]} */
  const uncovered = []
  for (const [collection, rows] of Object.entries(seed.content ?? {}))
    for (const entry of rows ?? [])
      for (const [field, value] of Object.entries(entry.data ?? {}))
        if (/\(MSK\)/.test(JSON.stringify(value)) && !covered.has(`${collection}/${entry.slug}/${field}`))
          uncovered.push(`${collection}/${entry.slug}/${field}`)
  assert.deepEqual([...new Set(uncovered)], [])
  const rule = map.identity.find((r) => r.collection === 'site' && r.slug === 'site' && r.field === 'hours')
  assert.deepEqual(
    [rule?.value, rule?.unanswered],
    ['{hours}', 'keep-demo'],
    "the owner's own hours when they wrote some, the template's when they did not"
  )
})

// 🔒 BLANK KEEPS THE FOOTER'S LEGAL LINE AND THE TEMPLATE'S CREDIT (TCH #1013). Measured 11/10/2026 on dev
// (g58-biz-emd-blank, Tracy Business EmDash 1.7.5, only a name given): the footer lost "INN 4003xxxxxx · OGRN … · SRO
// admission No. 214" and the copyright read "© 2026 Tamarind Bakery" where the demo reads "© 2026 Northgate Industrial
// JSC. EmDash CMS Template by Tracy.ai". The registration line is a claim of the demo company, emptied only for a customer
// who described the business (`facts`); the credit is the template's own, kept in every edition's own words.
test('BLANK: the legal line stays; every run keeps the template credit after the customer name', () => {
  const demo = (locale) => seed.content.site.find((e) => e.locale === locale).data
  const blank = planFrom(map, seed, factsFrom({ name: 'Granite Works' }), { claims: false, cut: false })
  const en = blank.patches.get('site/site/en').fields
  assert.equal(en.footer_legal_1, undefined, 'BLANK writes nothing over the legal line')
  assert.match(en.copyright, /^© \d{4} Granite Works\. EmDash CMS Template by Tracy\.ai$/)
  for (const locale of ['ru', 'vi', 'zh', 'es', 'fr']) {
    const credit = demo(locale).copyright.replace(
      /^© \d{4} (АО «Норткейт Индастриал»|Northgate Industrial JSC)/,
      ''
    )
    assert.notEqual(credit, demo(locale).copyright)
    assert.equal(
      blank.nameOnly.get(`site/site/${locale}`)?.fields.copyright,
      `© ${factsFrom({}).year} Granite Works${credit}`,
      `${locale}: the name and the edition's own credit`
    )
  }
  const full = planFrom(map, seed, factsFrom({ name: 'Granite Works', about: 'A bakery.' }), {
    writtenAs: { en: 'vi' }
  })
  const fullEn = full.patches.get('site/site/en').fields
  assert.equal(fullEn.footer_legal_1, '', 'FULL: the demo registration numbers are gone')
  assert.match(fullEn.copyright, /^© \d{4} Granite Works\. Mẫu EmDash CMS bởi Tracy\.ai$/)
})
