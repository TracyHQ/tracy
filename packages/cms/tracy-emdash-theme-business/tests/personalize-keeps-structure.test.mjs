// tools/personalize.mjs with THIS template's rules and FULL answers (TCH #1013): the fields the customer answered change, the
// pages they unticked go, and everything else keeps the template's structure: the same number of entries, the same
// pictures. Measured 11/10/2026 on dev (g57-biz-emd-full, Tracy Business 1.7.4, About given, Projects and News unticked):
// /careers listed 2 open roles where the demo lists 6 (and lost its "Show all" button), and "Life on our sites" showed three
// placeholder labels where the demo shows three photographs.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { keepSiteRowKeys } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const en = (collection) => (seed.content[collection] ?? []).filter((e) => (e.locale ?? 'en') === 'en')

/** A picture as the template's importer leaves it in an image field (seed-apply.mjs uploads it after the seed). */
const picture = (i) => ({
  id: `01MEDIA${String(i)}`,
  src: `/_emdash/api/media/file/life-${String(i)}.png`,
  alt: ''
})

/** The pictures the importer places on a demo project or post (`seed/media-map.json`), keyed by the entry's slug. */
const entryPictures = (collection, slug) =>
  collection === 'projects'
    ? { image: picture(`${slug}-cover`), galleryImage: (i) => picture(`${slug}-gallery-${String(i)}`) }
    : { featured_image: picture(`${slug}-cover`) }

/**
 * English only: the chrome, the pages the run writes, every demo vacancy, project and post; the careers photographs and
 * the entries' pictures placed, as the importer leaves them after the seed.
 */
function englishSite() {
  const mock = createMockEmdash()
  for (const coll of [
    'site',
    'home',
    'about',
    'contact',
    'news_page',
    'projects_page',
    'careers',
    'investors',
    'vacancies',
    'projects',
    'posts'
  ])
    for (const e of en(coll)) {
      const data = structuredClone(e.data)
      if (coll === 'careers') data.life = (data.life ?? []).map((row, i) => ({ ...row, image: picture(i) }))
      if (coll === 'projects') {
        const pics = entryPictures(coll, e.slug)
        data.image = pics.image
        data.gallery = (data.gallery ?? []).map((row, i) => ({ ...row, image: pics.galleryImage(i) }))
      }
      if (coll === 'posts') data.featured_image = entryPictures(coll, e.slug).featured_image
      mock.state.addEntry(coll, e.slug, 'en', data)
    }
  return mock
}

/**
 * A model that answers every shape the tool asks, in words that are not the demo's. `echoRow` names a card-list row the
 * model hands back in the demo's own words (`caption`, for the first `times` asks), as a real model does now and then.
 * `echoTitle` names a demo entry (by its title) the model always hands back as the demo wrote it, on every ask.
 */
function modelServer({ echoRow = null, echoTitle = null } = {}) {
  let echoed = 0
  return http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages.at(-1).content)
    const say = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }))
    }
    if (Array.isArray(user.rows)) {
      const echo =
        echoRow && echoed < (echoRow.times ?? 1) && user.rows.some((r) => r.caption === echoRow.caption)
      if (echo) echoed += 1
      return say({
        rows: user.rows.map((row, i) =>
          echo && row.caption === echoRow.caption
            ? row
            : Object.fromEntries(Object.keys(row).map((k) => [k, `Bakery ${k} ${String(i)}`]))
        )
      })
    }
    if (Array.isArray(user.terms))
      return say(Object.fromEntries(user.terms.map((t) => [t.slug, `Bakery ${t.slug}`])))
    if (Array.isArray(user.entries))
      return say(
        Object.fromEntries(
          user.entries.map((e) => [
            e.key,
            echoTitle !== null && (e.example?.title ?? e.given?.title) === echoTitle
              ? Object.fromEntries(Object.entries(e.example ?? {}).filter(([k]) => k !== 'body'))
              : {
                  title: `Bakery role ${e.key}`,
                  ...Object.fromEntries(
                    Object.entries(e.example ?? {})
                      .filter(([k]) => k !== 'title')
                      .map(([k, v]) => [
                        k,
                        Array.isArray(v)
                          ? v.map((_, i) => `Bakery ${k} ${String(i)}`)
                          : k === 'body'
                            ? 'Fresh loaves every morning.\n\nThe oven is lit before dawn.'
                            : `Bakery ${k} ${e.key}`
                      ])
                  )
                }
          ])
        )
      )
    if (Array.isArray(user.fields) && user.fields[0]?.name !== undefined)
      return say(Object.fromEntries(user.fields.map((f) => [f.name, { label: `Bakery ${f.name}` }])))
    if (Array.isArray(user.fields))
      return say(Object.fromEntries(user.fields.map((f) => [f.key, `Bakery ${f.key}`])))
    if (user.labels)
      return say(Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `VI ${String(v)}`])))
    return say({})
  })
}

async function runFull(
  mock,
  {
    languages = ['en'],
    site: siteOf = (url) => url,
    hidePages = ['projects', 'news'],
    echoRow = null,
    echoTitle = null,
    answers: more = {}
  } = {}
) {
  const site = await siteOf(await mock.listen())
  const model = modelServer({ echoRow, echoTitle })
  const modelUrl = await new Promise((r) =>
    model.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${model.address().port}/v1/chat`))
  )
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-structure-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  const answers = {
    name: 'Tamarind & Co',
    about: 'A family bakery in Dubai baking sourdough and Vietnamese bread every morning.',
    languages,
    hidePages,
    ...more
  }
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
          '--no-images'
        ],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            TRACY_MODEL_URL: modelUrl,
            TRACY_MODEL_KEY: 'k-test',
            TRACY_MODEL_NAME: 'm',
            OPENROUTER_API_KEY: '',
            DEEPSEEK_API_KEY: ''
          },
          maxBuffer: 64 * 1024 * 1024
        },
        (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
      )
    })
  } finally {
    await mock.close()
    await new Promise((r) => model.close(r))
  }
}

test('FULL answers: every open role of the demo stays on /careers, rewritten for the business', async () => {
  const mock = englishSite()
  const out = await runFull(mock)
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const roles = [...mock.state.entries.values()].filter((e) => e.collection === 'vacancies')
  const live = roles.filter((e) => e.status === 'published')
  assert.equal(live.length, en('vacancies').length, 'as many open roles as the demo lists')
  for (const e of live) assert.match(e.live.title, /^Bakery role /, `${e.slug} is rewritten, not the demo's`)
})

test('FULL answers: the careers photographs stay under the rewritten captions', async () => {
  const mock = englishSite()
  const out = await runFull(mock)
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const careers = [...mock.state.entries.values()].find((e) => e.collection === 'careers')
  const life = careers.live.life
  assert.equal(life.length, en('careers')[0].data.life.length, 'as many pictures as the demo')
  life.forEach((row, i) => {
    assert.match(String(row.caption), /^Bakery caption/, 'the caption is the business’s')
    assert.deepEqual(row.image, picture(i), `row ${String(i)} keeps its photograph`)
  })
})

// 🔒 DEMO ENTRIES ARE REWRITTEN, NEVER CUT (product owner, decision A, 11/10/2026). `seed/personalize.json` trimmed the
// demo projects to 4 of 10 and the demo posts to 0 of 12 when the customer kept Projects and News: /news listed nothing.
test('FULL answers with Projects and News ticked: every demo project and post stays, rewritten, with its pictures', async () => {
  const mock = englishSite()
  const out = await runFull(mock, { hidePages: [] })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const report = JSON.parse(out.stdout)
  assert.deepEqual(report.trimmed, [], 'no demo entry is cut')
  assert.deepEqual(report.unlinked, [], 'no link into a demo entry is taken out')
  for (const collection of ['projects', 'posts']) {
    const demo = en(collection)
    const live = [...mock.state.entries.values()].filter(
      (e) => e.collection === collection && e.status === 'published'
    )
    assert.equal(live.length, demo.length, `${collection}: as many entries as the demo`)
    // The slug is the entry's address: the detail page, the cards and the menus point at it, so it never moves.
    assert.deepEqual(
      live.map((e) => e.slug).sort(),
      demo.map((e) => e.slug).sort(),
      `${collection}: every detail page answers at its demo address`
    )
    for (const e of live) {
      assert.match(e.live.title, /^Bakery /, `${collection}/${e.slug}: the title is the business’s`)
      const pics = entryPictures(collection, e.slug)
      if (collection === 'projects') {
        assert.deepEqual(e.live.image, pics.image, `${e.slug} keeps its cover picture`)
        e.live.gallery.forEach((row, i) => {
          assert.match(String(row.caption), /^Bakery gallery /, `${e.slug} gallery ${String(i)} is rewritten`)
          assert.deepEqual(
            row.image,
            pics.galleryImage(i),
            `${e.slug} gallery ${String(i)} keeps its picture`
          )
        })
      } else assert.deepEqual(e.live.featured_image, pics.featured_image, `${e.slug} keeps its picture`)
    }
  }
  assert.equal(
    [...mock.state.entries.values()].find((e) => e.collection === 'news_page').status,
    'published',
    'the news page is kept, and it lists the notes'
  )
})

// 🔒 A ROW THE MODEL LEFT IN THE DEMO'S WORDS IS ASKED AGAIN, NEVER DROPPED. The card-list lane dropped such a row, and a
// list shorter than the site's lost the photograph merge (`keepSiteRowKeys` matched by position only for equal lengths):
// "Life on our sites" would show two captions over the wrong photographs, or none.
test('FULL answers: a card-list row the model handed back in the demo’s words is asked again; count and photos stay', async () => {
  const mock = englishSite()
  const out = await runFull(mock, { echoRow: { caption: en('careers')[0].data.life[1].caption } })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const careers = [...mock.state.entries.values()].find((e) => e.collection === 'careers')
  const life = careers.live.life
  assert.equal(life.length, en('careers')[0].data.life.length, 'no row dropped')
  life.forEach((row, i) => {
    assert.match(String(row.caption), /^Bakery caption/, `row ${String(i)} is the business’s`)
    assert.deepEqual(row.image, picture(i), `row ${String(i)} keeps its photograph`)
  })
})

test('FULL answers: a card-list row still in the demo’s words after the second ask stays, with its photograph', async () => {
  const mock = englishSite()
  const out = await runFull(mock, { echoRow: { caption: en('careers')[0].data.life[1].caption, times: 99 } })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const careers = [...mock.state.entries.values()].find((e) => e.collection === 'careers')
  const life = careers.live.life
  const demo = en('careers')[0].data.life
  assert.equal(life.length, demo.length, 'no row dropped')
  life.forEach((row, i) => assert.deepEqual(row.image, picture(i), `row ${String(i)} keeps its photograph`))
  assert.match(String(life[0].caption), /^Bakery caption/)
  assert.equal(
    life[1].caption,
    demo[1].caption,
    'the row the model would not rewrite keeps the template’s words'
  )
  const report = JSON.parse(out.stdout)
  assert.ok(
    report.rewritten.skipped.some(
      (x) => x.entry === 'careers/careers/en.life' && /kept the template/.test(x.why)
    ),
    'and the report names it'
  )
})

// 🔒 A DEMO ENTRY THE MODEL WOULD NOT REWRITE STAYS ON THE SITE (product owner, decision A, 11/10/2026). An entry whose
// title was still the demo's after three asks was unpublished: one entry fewer than the demo lists. It now keeps the
// template's words and the report names it, as a card-list row does.
test('FULL answers: a project whose title the model always hands back as the demo’s stays published, unchanged, reported', async () => {
  const mock = englishSite()
  const demo = en('projects')[0]
  const out = await runFull(mock, { echoTitle: demo.data.title, hidePages: [] })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const entry = [...mock.state.entries.values()].find(
    (e) => e.collection === 'projects' && e.slug === demo.slug
  )
  assert.equal(entry.status, 'published', 'the entry stays on the site')
  assert.equal(entry.live.title, demo.data.title, 'with the template’s title')
  const report = JSON.parse(out.stdout)
  assert.ok(!report.hidden.some((x) => x.entry === `projects/${demo.slug}/en`), 'it is not hidden')
  assert.ok(
    report.rewritten.skipped.some(
      (x) => x.entry === `projects/${demo.slug}/en` && /kept the template/.test(x.why)
    ),
    'and the report names it'
  )
})

// 🔒 BUT AN OPEN ROLE IS NEVER ANOTHER COMPANY'S JOB (product owner, TCH #1013, L4, 11/10/2026). A bakery's /careers kept the
// demo construction company's vacancies (g65, Tracy Business 1.7.13). The vacancies rule says `"unwritten": "empty"`: a
// role the model never wrote for this business stays on the site with its title and type emptied, and the report says so.
test('FULL answers: a vacancy whose title the model always hands back as the demo’s stays published, emptied, reported', async () => {
  const mock = englishSite()
  const demo = en('vacancies')[0]
  const out = await runFull(mock, { echoTitle: demo.data.title })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const entry = [...mock.state.entries.values()].find(
    (e) => e.collection === 'vacancies' && e.slug === demo.slug
  )
  assert.equal(entry.status, 'published', 'the entry stays on the site')
  assert.equal(entry.live.title, '', 'its title is emptied, never the demo company’s')
  assert.equal(entry.live.type, '', 'its type too')
  const roles = [...mock.state.entries.values()].filter(
    (e) => e.collection === 'vacancies' && e.status === 'published'
  )
  assert.equal(roles.length, en('vacancies').length, 'as many open roles as the demo lists')
  const report = JSON.parse(out.stdout)
  assert.ok(
    report.rewritten.emptied.some((x) => x.entry === `vacancies/${demo.slug}/en`),
    'and the report names it as emptied'
  )
  assert.ok(
    !report.rewritten.skipped.some((x) => String(x.entry ?? '').startsWith(`vacancies/${demo.slug}`)),
    'not as the template’s words kept'
  )
})

test('keepSiteRowKeys: the site’s keys stay on every row, matched by key when rows carry one, else by position', () => {
  const live = [
    { caption: 'a', image: picture(0) },
    { caption: 'b', image: picture(1) }
  ]
  assert.deepEqual(keepSiteRowKeys([{ caption: 'A' }, { caption: 'B' }], live), [
    { caption: 'A', image: picture(0) },
    { caption: 'B', image: picture(1) }
  ])
  // A list longer than the site's: the rows the site has keep their pictures, the new one has none.
  assert.deepEqual(keepSiteRowKeys([{ caption: 'A' }, { caption: 'B' }, { caption: 'C' }], live), [
    { caption: 'A', image: picture(0) },
    { caption: 'B', image: picture(1) },
    { caption: 'C' }
  ])
  // Rows with an identity are matched by it, whatever their order or the list's length.
  const keyed = [
    { _key: 'x', caption: 'a', image: picture(0) },
    { _key: 'y', caption: 'b', image: picture(1) }
  ]
  assert.deepEqual(keepSiteRowKeys([{ _key: 'y', caption: 'B' }], keyed), [
    { _key: 'y', caption: 'B', image: picture(1) }
  ])
  // A key the written row names still wins.
  assert.deepEqual(keepSiteRowKeys([{ caption: 'A', image: null }], live), [{ caption: 'A', image: null }])
  assert.equal(keepSiteRowKeys('text', live), 'text')
})

// 🔒 A CONTACT LINE NOBODY ASKED FOR KEEPS THE TEMPLATE'S (product owner, 11/10/2026, TCH #1013). The questions never ask
// for a phone, an e-mail, an address or opening hours; emptied, the top bar, the footer and the contact page showed no place
// for them, and the customer could not see what to fill in later through the chat. The demo's social links stay emptied (K6).
const CONTACT = {
  site: [
    'hotline',
    'topbar_phone',
    'topbar_address',
    'footer_legal_2',
    'topbar_email',
    'sales_email',
    'hours'
  ],
  contact: ['hq_address_1', 'hq_address_2', 'branches']
}
for (const [run, about] of [
  ['FULL', undefined],
  ['BLANK', '']
])
  test(`${run} answers with no contact details: the template's hotline, e-mails, address and hours stay byte for byte`, async () => {
    const mock = englishSite()
    const out = await runFull(mock, { answers: about === undefined ? {} : { about } })
    assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
    for (const [collection, fields] of Object.entries(CONTACT)) {
      const live = [...mock.state.entries.values()].find((e) => e.collection === collection).live
      const demo = en(collection)[0].data
      for (const f of fields) assert.deepEqual(live[f], demo[f], `${collection}.${f} is the template's`)
    }
    // K6 (Akemi 10/10/2026): the demo's social buttons stay, as many as the demo has, and only lead nowhere; a handle
    // that named the demo company is gone, the network's name and its line stay.
    const site = [...mock.state.entries.values()].find((e) => e.collection === 'site').live
    const demoSocial = en('site')[0].data.social
    assert.equal(site.social.length, demoSocial.length, 'every demo social button is kept (K6)')
    assert.deepEqual(
      site.social.map((x) => x.name),
      demoSocial.map((x) => x.name),
      'the networks are the demo’s'
    )
    assert.ok(
      site.social.every((x) => x.url === ''),
      'no link leads to the demo company’s profiles'
    )
    assert.ok(
      site.social.every((x) => !/northgate|tamarind/i.test(String(x.handle))),
      `no handle names the demo company: ${JSON.stringify(site.social.map((x) => x.handle))}`
    )
  })

test('FULL answers with contact details: the customer\u2019s phone, e-mail, address and hours are written', async () => {
  const mock = englishSite()
  const out = await runFull(mock, {
    answers: {
      contact: 'Ngã tư Ô Chợ Dừa, Hà Nội · +84 24 3999 0000',
      email: 'hello@tamarind.example',
      hours: 'Open 6am-8pm every day'
    }
  })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const live = (c) => [...mock.state.entries.values()].find((e) => e.collection === c).live
  const site = live('site')
  assert.equal(site.hotline, '+84 24 3999 0000')
  assert.equal(site.topbar_phone, 'Hotline: +84 24 3999 0000')
  assert.equal(site.topbar_address, 'Ngã tư Ô Chợ Dừa, Hà Nội')
  assert.equal(site.topbar_email, 'hello@tamarind.example')
  assert.equal(site.sales_email, 'hello@tamarind.example')
  assert.equal(site.hours, 'Open 6am-8pm every day')
  const contact = live('contact')
  assert.equal(contact.hq_address_1, 'Ngã tư Ô Chợ Dừa, Hà Nội')
  assert.equal(
    contact.hq_address_2,
    '',
    'the demo\u2019s second address line does not trail the customer\u2019s address'
  )
  assert.deepEqual(contact.branches, [], 'nor do the demo\u2019s branch offices')
})

// 🔒 A KEPT PAGE OWNS THE FORM IT SHOWS. Measured 11/10/2026 on dev (g57-biz-emd-full, News unticked): /investors showed
// the words "Subscribe to disclosure alerts" and no form, because the view read its form id and placeholder from the
// News page entry, which an unticked News unpublishes. The form is bound on the investors entry itself.
test('FULL answers with News unticked: the investors page keeps its newsletter form, bound on its own entry', async () => {
  const mock = englishSite()
  const out = await runFull(mock)
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const entry = (c) => [...mock.state.entries.values()].find((e) => e.collection === c)
  assert.notEqual(entry('news_page').status, 'published', 'News unticked: its page entry is off the site')
  assert.equal(entry('investors').status, 'published', 'Investors kept')

  const config = JSON.parse(readFileSync(path.join(ROOT, 'template.config.json'), 'utf8'))
  assert.ok(
    config.forms.bindings.some(
      (b) =>
        b.form === 'newsletter-{locale}' &&
        b.collection === 'investors' &&
        b.slug === 'investors' &&
        b.field === 'newsletter_form_id'
    ),
    'the importer writes the newsletter form id onto the investors entry'
  )
  const fields = seed.collections.find((c) => c.slug === 'investors').fields.map((f) => f.slug)
  for (const f of ['newsletter_form_id', 'subscribe_placeholder'])
    assert.ok(fields.includes(f), `investors has ${f}`)
  for (const e of seed.content.investors)
    assert.ok(
      String(e.data.subscribe_placeholder ?? '').trim() !== '',
      `investors/${e.locale} has its placeholder`
    )
  const view = readFileSync(path.join(ROOT, 'src', 'views', 'Investors.astro'), 'utf8')
  assert.doesNotMatch(view, /news_page/, 'the investors view reads no other page’s entry for its form')
  assert.match(view, /data-form-id=\{ir\.newsletter_form_id\}/)
})

// 🔒 THE TOOL IN THE IMAGE MAY BE AHEAD OF THE SITE'S RELEASE. Apply runs the template's tool and seed from the tracy-web
// image, while the site runs the release it was made from; EmDash refuses a whole write that names a field its collection
// does not have (`unknown_field`). A site made from Tracy Business 1.7.4 has no `subscribe_placeholder` on its investors
// page: the run writes the fields the site has, and says which it left.
test('a field the site\u2019s release does not have is left, and the rest of the entry is still written', async () => {
  const mock = englishSite()
  // The investors entry as a 1.7.4 site stores it: without the fields the later release added.
  const stored = [...mock.state.entries.values()].find((e) => e.collection === 'investors')
  delete stored.live.subscribe_placeholder
  const old = seed.collections
    .find((c) => c.slug === 'investors')
    .fields.filter((f) => !['subscribe_placeholder', 'newsletter_form_id'].includes(f.slug))
  /** The site as EmDash answers it: the 1.7.4 investors schema, and a write naming another field refused whole. */
  const strict = async (origin) => {
    const server = http.createServer(async (req, res) => {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const raw = Buffer.concat(chunks)
      const url = new URL(req.url, origin)
      const send = (status, value) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(value))
      }
      if (url.pathname === '/_emdash/api/schema/collections/investors/fields')
        return send(200, { success: true, data: { items: old } })
      if (req.method === 'PUT' && url.pathname.startsWith('/_emdash/api/content/investors/')) {
        const known = new Set(old.map((f) => f.slug))
        const extra = Object.keys(JSON.parse(raw.toString()).data ?? {}).filter(
          (k) => !k.startsWith('_') && !known.has(k)
        )
        if (extra.length > 0)
          return send(400, {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: `unknown field: ${extra.join(', ')}` }
          })
      }
      const answer = await fetch(new URL(req.url, origin), {
        method: req.method,
        headers: Object.fromEntries(
          Object.entries(req.headers).filter(([k]) => !['host', 'content-length'].includes(k))
        ),
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw
      })
      res.writeHead(answer.status, {
        'content-type': answer.headers.get('content-type') ?? 'application/json'
      })
      res.end(Buffer.from(await answer.arrayBuffer()))
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    after(() => new Promise((r) => server.close(r)))
    return `http://127.0.0.1:${String(server.address().port)}`
  }
  const out = await runFull(mock, { languages: ['vi'], site: strict })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const investors = [...mock.state.entries.values()].find((e) => e.collection === 'investors')
  assert.match(
    String(investors.live.subscribe_button),
    /^VI /,
    'the investors labels are written in the site\u2019s language'
  )
  assert.equal(investors.live.subscribe_placeholder, undefined, 'the field the site has not is not sent')
  const report = JSON.parse(out.stdout)
  assert.ok(
    JSON.stringify(report).includes('investors/investors/en.subscribe_placeholder'),
    'the field left is named in the report'
  )
})

// 🔒 A REWRITTEN BODY KEEPS THE TEMPLATE'S OUTLINE (TCH #1013). Measured 11/10/2026 on dev (g58-biz-emd-full, Tracy Business
// 1.7.5): /terms and /privacy, rewritten for the business, came back as five plain paragraphs: 7 headings became 1 and the
// lists went. The body is asked part by part, in the demo's order, and each part keeps its kind: a heading stays a heading,
// a list item a list item; a picture in a post's body stays where it was.
// Since Akemi's decision 2 (12/10/2026) the legal pages are no longer rewritten at all: they keep the template's text, the
// demo company's name swapped (tests/personalize-legal-pages.test.mjs), so their outline is the template's by definition.
test('FULL answers: the legal pages keep their headings and lists, and their words are not the model’s', async () => {
  const mock = englishSite()
  for (const slug of ['terms', 'privacy']) {
    const e = en('pages').find((x) => x.slug === slug)
    mock.state.addEntry('pages', slug, 'en', structuredClone(e.data))
  }
  const out = await runFull(mock)
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const shape = (blocks) => blocks.map((b) => `${b._type}/${b.style ?? ''}/${b.listItem ?? ''}`)
  for (const slug of ['terms', 'privacy']) {
    const demo = en('pages').find((x) => x.slug === slug).data.content
    const live = [...mock.state.entries.values()].find((e) => e.collection === 'pages' && e.slug === slug)
      .live.content
    assert.deepEqual(shape(live), shape(demo), `${slug} keeps the template's outline`)
    for (const [i, b] of live.entries()) {
      const words = (b.children ?? []).map((c) => c.text).join('')
      assert.doesNotMatch(
        words,
        /^Bakery body /,
        `${slug} part ${String(i)} is the template’s, not rewritten`
      )
    }
  }
})

test('FULL answers with News ticked: a post keeps the pictures and the outline of its body', async () => {
  const mock = englishSite()
  const out = await runFull(mock, { hidePages: [] })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const shape = (blocks) => blocks.map((b) => `${b._type}/${b.style ?? ''}/${b.listItem ?? ''}`)
  for (const e of en('posts').filter((x) => (x.data.content ?? []).some((b) => b._type !== 'block'))) {
    const live = [...mock.state.entries.values()].find(
      (x) => x.collection === 'posts' && x.slug === e.slug
    ).live
    assert.deepEqual(shape(live.content), shape(e.data.content), `${e.slug} keeps its outline`)
  }
})

// 🔒 A POST'S FRAME SPEAKS THE SITE'S LANGUAGE (TCH #1013, LANG-2). Measured 11/10/2026 on dev (g58-biz-emd-full, Tracy
// Business 1.7.5, root written in Vietnamese): a news post read "Need advice on equipment foundations?" and "Related
// articles" in English. With News unticked those words came from the unpublished News row (fixed in the theme: a post
// goes with its page); with News ticked the post reads the News page's published words, which the run translates.
test('FULL in Vietnamese with News ticked: the words around a post are the site’s language', async () => {
  const mock = englishSite()
  const out = await runFull(mock, { languages: ['vi'], hidePages: [] })
  assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
  const page = [...mock.state.entries.values()].find((e) => e.collection === 'news_page' && e.slug === 'news')
  assert.equal(page.status, 'published')
  const demo = en('news_page')[0].data
  for (const field of [
    'related_title',
    'tags_label',
    'prev_label',
    'next_label',
    'toc_title',
    'downloads_title',
    'aside_title',
    'aside_text',
    'aside_button'
  ]) {
    if (typeof demo[field] !== 'string' || demo[field] === '') continue
    assert.notEqual(page.live[field], demo[field], `news_page.${field} is not the template's English`)
  }
})
