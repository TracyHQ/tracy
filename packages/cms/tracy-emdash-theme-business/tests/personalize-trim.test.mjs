// tools/personalize.mjs with THIS template's own rules: every demo row stays (TCH #1013, decision A, 11/10/2026), rewritten
// for the business once the customer described it and a model can write, renamed only otherwise (ABOUT-3/K7). The `trim`
// mechanism is still tested on a map that names it (`TRIMMING`): the rows beyond `keep` leave before anything is written
// to them, links into them are taken out (never pointed at another page). The email answer reaches the top bar, the sales
// line and the enquiry form's mailbox.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, planFrom, trimPlan, unlinkDeep } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))
/** The demo collections a list page shows, every row of which a customer's site keeps. */
const ROWS = ['projects', 'posts', 'services', 'vacancies']
/** This template's map as it was before decision A, with the `trim` rules the mechanism tests exercise. */
const TRIMMING = {
  ...map,
  trim: [
    { collection: 'posts', keep: 0 },
    { collection: 'projects', keep: 4 }
  ]
}
const demoCount = (collection) =>
  new Set(seed.content[collection].filter((e) => (e.locale ?? 'en') === 'en').map((e) => e.slug)).size
const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

/** English only: the chrome, the pages and the list pages, and every demo row of the list collections. */
function englishSite() {
  const mock = createMockEmdash()
  const collections = [
    'site',
    'home',
    'about',
    'contact',
    'news_page',
    'projects_page',
    'careers',
    'services_page'
  ]
  collections.push(...ROWS)
  for (const coll of collections)
    for (const e of seed.content[coll] ?? [])
      if ((e.locale ?? 'en') === 'en') mock.state.addEntry(coll, e.slug, 'en', e.data)
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

function siteFiles() {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-trim-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return {
    dir,
    args: (site) => [
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      path.join(dir, 'r.json'),
      '--json'
    ]
  }
}

const ANSWERS = JSON.stringify({
  name: 'Granite Works',
  about: 'We cut and polish granite worktops for kitchens in Hanoi.',
  contact: 'Hà Nội · +84 24 3999 0000',
  email: 'hello@granite.example',
  languages: ['en']
})

/** The same customer with the About question left blank: the name is the only thing that may change (ABOUT-3, K7). */
const ANSWERS_NO_ABOUT = JSON.stringify({ ...JSON.parse(ANSWERS), about: '' })

/** The answers of a customer who unticked the pages named in Tracy's Pages question: the only way a page leaves (TCH #1013). */
const unticking = (...ids) => JSON.stringify({ ...JSON.parse(ANSWERS), hidePages: ids })

const entryOf = (mock, collection, slug) =>
  [...mock.state.entries.values()].find(
    (e) => e.collection === collection && e.slug === slug && e.locale === 'en'
  )

test("facts: a junk email is no email; a real one reaches the top bar and the sales line; none keeps the template's", () => {
  assert.equal(factsFrom({ email: '0236 555 555' }).email, undefined)
  assert.equal(factsFrom({ email: 'n/a' }).email, undefined)
  const facts = factsFrom({ name: 'Granite Works', email: ' hello@granite.example ' })
  assert.equal(facts.email, 'hello@granite.example')
  const site = planFrom(map, seed, facts).patches.get('site/site/en')
  assert.equal(site.fields.topbar_email, 'hello@granite.example')
  assert.equal(site.fields.sales_email, 'hello@granite.example')
  assert.equal(site.origins.topbar_email, 'customer')
  const none = planFrom(map, seed, factsFrom({ name: 'Granite Works', email: 'nope' })).patches.get(
    'site/site/en'
  )
  // 🔒 No email → the template's top-bar address stays as a placeholder (product owner, 11/10/2026, TCH #1013).
  assert.equal(none?.fields.topbar_email, undefined, 'no email → nothing written, the demo address stays')
})

test('this template cuts no demo row: projects, notes, services and roles are rewritten, never trimmed (decision A)', () => {
  assert.deepEqual(map.trim ?? [], [], 'seed/personalize.json names no trim rule')
  const plan = trimPlan(map, seed)
  assert.deepEqual(plan.trimmed, [])
  assert.deepEqual(plan.emptied, [])
  const rewritten = new Set((map.rewrite ?? []).map((r) => r.collection))
  for (const c of ROWS) assert.ok(rewritten.has(c), `${c} is rewritten for the business`)
})

test('trimPlan: `keep` rows of each collection stay, in seed order after the brand-free ones; the rest leave', () => {
  const map = TRIMMING
  const plan = trimPlan(map, seed)
  const brand = (map.replace ?? [])
    .map((r) => String(r.find).toLowerCase())
    .filter((w) => /^[a-z0-9]+$/.test(w))
  const names = (s) => brand.some((w) => s.includes(w))
  for (const rule of map.trim) {
    const all = [...new Set(seed.content[rule.collection].map((e) => e.slug))]
    const slugs = [...all.filter((s) => !names(s)), ...all.filter(names)]
    assert.deepEqual(plan.kept[rule.collection], slugs.slice(0, rule.keep))
    assert.equal(
      plan.trimmed.filter((t) => t.collection === rule.collection).length,
      slugs.length - rule.keep
    )
  }
  // No patch for a trimmed row: a write would PUT and publish it again under the customer's name.
  const { patches } = planFrom(map, seed, factsFrom({ name: 'Granite Works' }))
  for (const t of plan.trimmed) assert.equal(patches.has(`${t.collection}/${t.slug}/en`), false, t.slug)
})

test('a link into a cut row is taken out, never pointed at another page (TCH #1013, PAGE-5)', () => {
  const map = TRIMMING
  assert.equal(
    map.trim.some((r) => 'leadsTo' in r),
    false,
    'no trim rule sends its links elsewhere'
  )
  const cut = trimPlan(map, seed).trimmed.find((t) => t.collection === 'projects')
  assert.ok(cut, 'the demo has a project beyond the four kept')
  const path = `/projects/${cut.slug}`
  // A demo page whose button and body both lead into the cut project.
  const linked = structuredClone(seed)
  const home = linked.content.home.find((e) => e.locale === 'en')
  home.data.extra_url = path
  home.data.extra_body = [
    {
      _type: 'block',
      _key: 'b1',
      markDefs: [{ _key: 'l1', _type: 'link', href: `/ru${path}` }],
      children: [{ _type: 'span', text: 'the job', marks: ['l1', 'strong'] }]
    }
  ]
  const { patches, unlinked } = planFrom(map, linked, factsFrom({ name: 'Granite Works' }))
  const fields = patches.get('home/home/en').fields
  assert.equal(fields.extra_url, '', 'the button keeps its words and loses the link')
  assert.deepEqual(fields.extra_body[0].markDefs, [])
  assert.deepEqual(fields.extra_body[0].children[0].marks, ['strong'], 'the words stay, the link mark goes')
  assert.deepEqual(
    unlinked.filter((u) => u.entry === 'home/home/en').map((u) => u.from),
    [path, `/ru${path}`]
  )
  // An anchor written in a string keeps its words; a link to a row that stays is left alone.
  const kept = trimPlan(map, seed).kept.projects[0]
  assert.equal(
    unlinkDeep(`See <a href="${path}">it</a> or <a href="/projects/${kept}">this</a>`, [cut.slug]).value,
    `See it or <a href="/projects/${kept}">this</a>`
  )
})

/** A model endpoint that rewrites whatever it is asked, in the shape each lane asks for. */
async function fakeModel() {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    const say = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }))
    }
    if (Array.isArray(user.rows))
      return say({
        rows: user.rows.map((row, i) =>
          Object.fromEntries(Object.keys(row).map((k) => [k, `${k} ${String(i)}`]))
        )
      })
    if (Array.isArray(user.terms))
      return say(Object.fromEntries(user.terms.map((t) => [t.slug, `L ${t.slug}`])))
    if (Array.isArray(user.entries)) {
      const out = {}
      for (const e of user.entries)
        out[e.key] = Object.fromEntries(
          Object.entries(e.example ?? {}).map(([k, v]) => [
            k,
            Array.isArray(v)
              ? v.map((x, i) => `R ${k} ${String(i)}`)
              : k === 'body'
                ? 'One paragraph.\n\nTwo.'
                : `R ${k} ${e.key}`
          ])
        )
      return say(out)
    }
    if (Array.isArray(user.fields) && user.fields[0]?.name !== undefined)
      return say(Object.fromEntries(user.fields.map((f) => [f.name, { label: `F ${f.name}` }])))
    if (Array.isArray(user.fields))
      return say(Object.fromEntries(user.fields.map((f) => [f.key, `C ${f.key}`])))
    return say({})
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1`))
  )
  return { url, close: () => new Promise((r) => server.close(r)) }
}
const published = (mock, collection) =>
  [...mock.state.entries.values()].filter(
    (e) => e.collection === collection && e.locale === 'en' && e.status === 'published'
  )

test('with a model: every demo row stays and is rewritten; a menu item into one still leads to it', async () => {
  const mock = englishSite()
  const project = [...new Set(seed.content.projects.map((e) => e.slug))].at(-1)
  mock.state.addMenuItem('primary', 'en', 'Old project', `/projects/${project}`)
  const model = await fakeModel()
  const site = await mock.listen()
  const f = siteFiles()
  try {
    const out = await run(['--answers-json', ANSWERS, ...f.args(site), '--no-images'], {
      TRACY_MODEL_URL: model.url,
      TRACY_MODEL_KEY: 'k',
      TRACY_MODEL_NAME: 'm'
    })
    const report = JSON.parse(out.stdout)
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.trimmed, [], 'no demo row is cut')
    for (const c of ROWS) assert.equal(published(mock, c).length, demoCount(c), c)
    assert.equal([...mock.state.menuItems.values()].filter((i) => i.label === 'Old project').length, 1)
    // Every row was rewritten: no demo title under the customer's name.
    for (const c of ROWS) for (const e of published(mock, c)) assert.match(e.live.title, /^R title /, e.slug)
    assert.equal(report.model.provider, 'custom')
    assert.ok(report.generated.length > 0, 'what the model wrote is named')
  } finally {
    await mock.close()
    await model.close()
  }
})

test('a page the customer unticked is never written to or published again, whatever copy, block and picture rules also name it', async () => {
  const mock = englishSite()
  const model = await fakeModel()
  const site = await mock.listen()
  const f = siteFiles()
  try {
    // A hidden page that also has rules of every writing kind: the careers page does (`copy`, `blocks`, a picture target).
    const hidden = [{ collection: 'careers', slug: 'careers' }]
    assert.ok(
      (map.copy ?? []).some((c) => c.collection === 'careers'),
      'and it has copy rules, which used to publish it again'
    )
    const out = await run(['--answers-json', unticking('careers'), ...f.args(site)], {
      TRACY_MODEL_URL: model.url,
      TRACY_MODEL_KEY: 'k',
      TRACY_MODEL_NAME: 'm'
    })
    const report = JSON.parse(out.stdout)
    assert.deepEqual(report.errors, [])
    for (const h of hidden) {
      const e = entryOf(mock, h.collection, h.slug)
      assert.equal(e.status, 'draft', `${h.collection} stays hidden`)
      // The first write of the run (the demo brand replaced) comes before the page is hidden; nothing after that may write to it
      // or publish it: the last request that touched it is the unpublish.
      const calls = mock.state.log.filter((l) => l.path.includes(`/${e.id}`) && l.method !== 'GET')
      const last = calls.at(-1)
      assert.ok(
        last?.path.replace(/\?.*$/, '').endsWith('/unpublish'),
        `${h.collection}: the last request is the unpublish, not ${last?.method} ${last?.path}`
      )
    }
    assert.ok(report.hidden.some((x) => x.entry === 'careers/careers/en'))
  } finally {
    await mock.close()
    await model.close()
  }
})

test('no model key: every demo row stays, renamed; nothing leaves the site (TCH #1013, ABOUT-3, K7)', async () => {
  const mock = englishSite()
  mock.state.addMenuItem('primary', 'en', 'News', '/news')
  mock.state.addMenuItem('primary', 'en', 'Contact', '/contact')
  mock.state.addMenuItem('topbar', 'en', 'Careers', '/careers')
  mock.state.addMenuItem('footer_company', 'en', 'Careers', '/careers')
  const site = await mock.listen()
  const f = siteFiles()
  try {
    const out = await run(['--answers-json', ANSWERS, ...f.args(site)])
    const report = JSON.parse(out.stdout)
    assert.equal(out.code, 3, JSON.stringify(report.errors))
    assert.deepEqual(report.trimmed, [], 'no model writes what stays, so nothing is cut')
    for (const c of ROWS) assert.equal(published(mock, c).length, demoCount(c), c)
    // No page goes that the customer did not untick (TCH #1013, 08/10/2026), and so do the menu items that lead to it.
    assert.equal(report.hidden.length, 0, JSON.stringify(report.hidden))
    assert.equal(entryOf(mock, 'careers', 'careers').status, 'published')
    const labels = [...mock.state.menuItems.values()].map((i) => i.label).sort()
    assert.deepEqual(labels, ['Careers', 'Careers', 'Contact', 'News'])
    // The demo company's name is the customer's in every row that stays.
    for (const e of mock.state.entries.values())
      if (e.status === 'published') assert.doesNotMatch(JSON.stringify(e.live), /Northgate|NORTHGATE/)
    assert.equal(entryOf(mock, 'site', 'site').live.topbar_email, 'hello@granite.example')
    // The about page's geography is a claim: emptied, never kept, never invented.
    assert.equal(entryOf(mock, 'about', 'about')?.live.geo_text ?? '', '')
  } finally {
    await mock.close()
  }
})

test('About left blank, with a model: every demo row stays, renamed; nothing leaves the site (TCH #1013, ABOUT-3, K7)', async () => {
  const mock = englishSite()
  const model = await fakeModel()
  const site = await mock.listen()
  const f = siteFiles()
  try {
    const out = await run(['--answers-json', ANSWERS_NO_ABOUT, ...f.args(site), '--no-images'], {
      TRACY_MODEL_URL: model.url,
      TRACY_MODEL_KEY: 'k',
      TRACY_MODEL_NAME: 'm'
    })
    const report = JSON.parse(out.stdout)
    assert.deepEqual(report.trimmed, [], 'nothing is cut when the customer did not describe the business')
    assert.deepEqual(report.unlinked, [], 'and no link into a demo row is taken out')
    // 🔒 The name and nothing else (TCH #1013, K7): no lane has the model rewrite the demo's words, its titles, its terms
    // or its card lists, though a model is there to ask.
    assert.deepEqual(report.copy.done, [], 'no copy written')
    // A choice, not text that failed: Tracy reports `copy.skipped` lines as "could not be written".
    assert.deepEqual(report.copy.skipped, [])
    assert.ok(report.skipped.some((s) => s.rule === 'copy' && /About left blank/.test(s.why)))
    assert.equal(report.rewritten.done, 0, 'no demo entry rewritten')
    assert.deepEqual(report.terms, [], 'no term relabelled')
    const modelWords = /"(?:C|R|L|F) [^"]*"|"[a-z_]+ \d+"/
    for (const e of mock.state.entries.values())
      if (e.status === 'published')
        assert.doesNotMatch(
          JSON.stringify(e.live),
          modelWords,
          `${e.collection}/${e.slug} keeps the demo's words`
        )
    for (const c of ROWS) assert.equal(published(mock, c).length, demoCount(c), c)
  } finally {
    await mock.close()
    await model.close()
  }
})

// Decision A (11/10/2026) reverses L21 (05/10/2026): every demo note stays, its title, excerpt and body rewritten for the
// business, so a customer who kept News meets as many notes as the demo shows, not an empty list.
test('every demo post stays on a personalised site, rewritten; the news page lists them', async () => {
  const mock = englishSite()
  mock.state.addMenuItem('primary', 'en', 'News', '/news')
  const model = await fakeModel()
  const site = await mock.listen()
  const f = siteFiles()
  try {
    const out = await run(['--answers-json', ANSWERS, ...f.args(site), '--no-images'], {
      TRACY_MODEL_URL: model.url,
      TRACY_MODEL_KEY: 'k',
      TRACY_MODEL_NAME: 'm'
    })
    const report = JSON.parse(out.stdout)
    assert.deepEqual(report.errors, [])
    const posts = published(mock, 'posts')
    assert.equal(posts.length, demoCount('posts'), 'every demo note is on the site')
    for (const e of posts) {
      assert.match(e.live.title, /^R title /, `${e.slug}: the title is rewritten`)
      assert.match(String(e.live.excerpt), /^R excerpt /, `${e.slug}: the excerpt is rewritten`)
      // A body of plain paragraphs is asked as one text; a body with headings, lists or pictures part by part, so it
      // keeps the template's outline (TCH #1013).
      assert.match(
        JSON.stringify(e.live.content),
        /One paragraph\.|R body 0/,
        `${e.slug}: the body is rewritten`
      )
    }
    assert.equal(entryOf(mock, 'news_page', 'news').status, 'published', 'the news page is still there')
    assert.ok(
      [...mock.state.menuItems.values()].some((i) => i.label === 'News'),
      'and the menu still leads to it'
    )
  } finally {
    await mock.close()
    await model.close()
  }
})

test('trimPlan keeps rows whose slug does not name the demo brand before those that do', () => {
  const map = TRIMMING
  const plan = trimPlan(map, seed)
  const brand = (map.replace ?? [])
    .map((r) => String(r.find).toLowerCase())
    .filter((w) => /^[a-z0-9]+$/.test(w))
  for (const rule of map.trim) {
    const all = [...new Set(seed.content[rule.collection].map((e) => e.slug))]
    const clean = all.filter((s) => !brand.some((w) => s.includes(w)))
    if (clean.length >= rule.keep)
      for (const s of plan.kept[rule.collection])
        assert.ok(!brand.some((w) => s.includes(w)), `${rule.collection}: kept ${s}`)
  }
})

test('the seed keeps taxonomy slugs in every locale: the sector chips of /projects link to real terms', () => {
  const terms = new Set(
    seed.taxonomies.filter((t) => t.name === 'sector').flatMap((t) => t.terms.map((x) => x.slug))
  )
  for (const e of seed.content.projects_page)
    for (const row of e.data.sectors ?? []) assert.ok(terms.has(row.sector), `${e.locale}: ${row.sector}`)
})
