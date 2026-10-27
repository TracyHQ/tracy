// tools/personalize.mjs with THIS template's own `facts` rules (seed/personalize.json): the demo company's claims (counts,
// clients, team, history, prices, project facts) are emptied only for a customer who described the business. With the
// About answer blank the site keeps every one of them as the template has them, renamed (TCH #1013, ABOUT-3): measured
// 11/10/2026 on dev, a blank Tracy Business site showed "Clients we have built for" over no logos and project cards with
// no tag line. The file reads only the template it sits in, so the same file runs in every EmDash theme.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, fill, planFrom, replaceDeep, rewriteBlock } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))
const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}
const ROOT_LOCALE = seed.defaultLocale ?? 'en'

/** The answer set Tracy sends when the customer typed a name and left every other question blank. */
const BLANK = { name: 'Tamarind Bakery' }
const FULL = {
  name: 'Tamarind Bakery',
  about: 'We bake sourdough bread and pastries in Hanoi.',
  languages: ['en']
}

/** Every entry of the root locale whose collection a `facts` rule names, seeded as first-run setup would. */
function factSite() {
  const mock = createMockEmdash()
  const collections = new Set((map.facts ?? []).map((r) => r.collection))
  for (const coll of collections)
    for (const e of seed.content[coll] ?? [])
      if ((e.locale ?? ROOT_LOCALE) === ROOT_LOCALE) mock.state.addEntry(coll, e.slug, ROOT_LOCALE, e.data)
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

function args(site, answers) {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-facts-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return [
    '--answers-json',
    JSON.stringify(answers),
    '--site',
    site,
    '--token-file',
    path.join(dir, 'token'),
    '--receipts',
    path.join(dir, 'r.json'),
    '--no-images',
    '--json'
  ]
}

/** Each `facts` rule with the root-locale seed entries it names that carry the field. */
function factTargets() {
  return (map.facts ?? []).map((rule) => ({
    rule,
    entries: (seed.content[rule.collection] ?? []).filter(
      (e) =>
        (e.locale ?? ROOT_LOCALE) === ROOT_LOCALE &&
        (rule.slug === undefined || e.slug === rule.slug) &&
        e.data?.[rule.field] !== undefined
    )
  }))
}

/** The demo value with the demo company's name swapped for the customer's: what a blank About keeps. */
function renamed(data, facts) {
  const rules = (map.replace ?? [])
    .map((r) => ({ find: r.find, filled: fill(r.with, facts) }))
    .filter((r) => !('missing' in r.filled))
    .map((r) => ({ find: r.find, with: r.filled.value }))
  return replaceDeep(data, rules)
}

const liveOf = (mock, collection, slug) =>
  [...mock.state.entries.values()].find(
    (e) => e.collection === collection && e.slug === slug && e.locale === ROOT_LOCALE
  )

test('every `facts` rule of this template names a field its demo actually carries', () => {
  const targets = factTargets()
  assert.ok(targets.length > 0, 'the template has facts rules')
  for (const { rule, entries } of targets)
    assert.ok(entries.length > 0, `${rule.collection}${rule.slug ? `/${rule.slug}` : ''}.${rule.field}`)
})

test('planFrom: About left blank empties no claim; described, every claim is emptied', () => {
  const blank = planFrom(map, seed, factsFrom(BLANK), { rewrite: false, cut: false, claims: false })
  for (const p of blank.patches.values())
    for (const [field, origin] of Object.entries(p.origins))
      assert.notEqual(origin, 'removed', `${p.collection}/${p.slug}/${p.locale}.${field}`)
  const full = planFrom(map, seed, factsFrom(FULL), { rewrite: false, cut: false, claims: true })
  for (const { rule, entries } of factTargets())
    for (const e of entries)
      assert.equal(
        full.patches.get(`${rule.collection}/${e.slug}/${ROOT_LOCALE}`)?.origins[rule.field],
        'removed',
        `${rule.collection}/${e.slug}.${rule.field}`
      )
})

test('end to end, About left blank: every demo claim stays as the template has it, renamed (TCH #1013, ABOUT-3)', async () => {
  const mock = factSite()
  const site = await mock.listen()
  try {
    const out = await run(args(site, BLANK))
    const report = JSON.parse(out.stdout)
    assert.deepEqual(report.errors ?? [], [], out.stderr)
    const facts = factsFrom(BLANK)
    let checked = 0
    for (const { rule, entries } of factTargets())
      for (const e of entries) {
        const live = liveOf(mock, rule.collection, e.slug)
        assert.ok(live, `${rule.collection}/${e.slug} is on the site`)
        assert.deepEqual(
          live.live[rule.field],
          renamed(e.data, facts)[rule.field],
          `${rule.collection}/${e.slug}.${rule.field} keeps the demo value (${rule.why})`
        )
        checked += 1
      }
    assert.ok(checked >= (map.facts ?? []).length, `${checked} fact fields checked`)
  } finally {
    await mock.close()
  }
})

test('end to end, About given: every demo claim is emptied, never kept, never invented', async () => {
  const mock = factSite()
  const site = await mock.listen()
  try {
    const out = await run(args(site, FULL))
    const report = JSON.parse(out.stdout)
    assert.deepEqual(report.errors ?? [], [], out.stderr)
    for (const { rule, entries } of factTargets())
      for (const e of entries) {
        const live = liveOf(mock, rule.collection, e.slug)
        // A demo row the run cut (`trim`) is off the site: what it held no longer shows.
        if (!live || live.status !== 'published') continue
        const value = live.live[rule.field]
        assert.ok(
          value === '' || (Array.isArray(value) && value.length === 0),
          `${rule.collection}/${e.slug}.${rule.field} is emptied (${rule.why})`
        )
      }
  } finally {
    await mock.close()
  }
})

// 🔒 A CONTACT LINE NOBODY ASKED FOR KEEPS THE TEMPLATE'S (product owner, 11/10/2026, TCH #1013): the questions never ask for
// an e-mail, so the contact page keeps the template's address as a placeholder the customer replaces later; one given is
// written, and the template's "demo address" label goes with the demo address.
test('the contact e-mail: none given keeps the template’s, with its label; one given is written and the demo label goes', () => {
  const demo = seed.content.contact.find((e) => (e.locale ?? 'en') === 'en').data
  for (const about of ['Granite worktops for kitchens.', '']) {
    const none = planFrom(map, seed, factsFrom({ name: 'Granite Works', about })).patches.get(
      'contact/contact/en'
    )
    assert.equal(none?.fields.email ?? demo.email, demo.email, 'the template’s e-mail stays')
    assert.equal(none?.fields.email_label ?? demo.email_label, demo.email_label, 'with its label')
  }
  const given = planFrom(
    map,
    seed,
    factsFrom({ name: 'Granite Works', about: 'Granite worktops.', email: 'hello@granite.example' })
  ).patches.get('contact/contact/en')
  assert.equal(given.fields.email, 'hello@granite.example')
  assert.equal(given.fields.email_label, '')
})

// 🔒 BLANK KEEPS THE TEMPLATE'S CREDIT AND ITS DEMO NOTICES, RENAMED (TCH #1013, g58). Identity rules run on every run, so
// the footer credit "Designed by Tracy · Inspired by Apple." and the "Tracy Base is a studio demo…" notices were emptied
// even when the customer gave only a name. A blank run is the demo with the name swapped; the notices describe the demo
// company, so they go only for a customer who described the business (`facts`); the credit is the template's own and stays.
test('BLANK keeps the footer credit and the demo notices (renamed); FULL empties the notices and keeps the credit', () => {
  const demo = (collection) =>
    seed.content[collection].find((e) => (e.locale ?? ROOT_LOCALE) === ROOT_LOCALE).data
  const notices = [
    ['site', 'notice'],
    ['onepage', 'footer_note'],
    ['contact', 'notice'],
    ['marketing', 'note']
  ]
  const blank = planFrom(map, seed, factsFrom(BLANK), { rewrite: false, cut: false, claims: false })
  const field = (plan, collection, name) =>
    plan.patches.get(`${collection}/${collection}/${ROOT_LOCALE}`)?.fields[name]
  const facts = factsFrom(BLANK)
  assert.equal(field(blank, 'onepage', 'footer_credit'), undefined, 'BLANK writes nothing over the credit')
  for (const [collection, name] of notices) {
    assert.ok(demo(collection)[name], `${collection}.${name} has demo words`)
    assert.equal(
      field(blank, collection, name) ?? demo(collection)[name],
      renamed(demo(collection), facts)[name],
      `BLANK: ${collection}.${name} keeps the demo words, renamed`
    )
  }
  const full = planFrom(map, seed, factsFrom(FULL), { rewrite: false, cut: false, claims: true })
  assert.equal(field(full, 'onepage', 'footer_credit'), undefined, 'FULL keeps the template credit too')
  for (const [collection, name] of notices)
    assert.equal(field(full, collection, name), '', `FULL: ${collection}.${name} is emptied`)
})

test('home benefit cards translate every visible word and preserve links and other data', async () => {
  const targets = [
    ['home', 'features_items', ['kicker', 'title', 'text', 'link_label']],
    ['onepage', 'product_parts', ['kicker', 'title', 'text', 'cta_label']],
    ['landing', 'features_cards', ['title', 'text', 'link_label']],
    ['product', 'carousel_slides', ['title', 'text', 'kicker']],
    ['product', 'tabs_tabs', ['title', 'body', 'label']]
  ]
  for (const [collection, field, fields] of targets) {
    const rule = map.blocks.find((r) => r.collection === collection && r.field === field)
    const entry = seed.content[collection].find((e) => e.slug === rule.slug)
    const rows = entry.data[field]
    const translated = await rewriteBlock({
      model: { url: 'https://model.invalid', model: 'test' },
      rule,
      facts: { name: 'Hafenblick Beratung', about: 'We advise small businesses.' },
      locale: 'de',
      rows,
      fetchImpl: async (_url, options) => {
        const input = JSON.parse(JSON.parse(options.body).messages.at(-1).content)
        assert.deepEqual(Object.keys(input.rows[0]).sort(), [...fields].sort(), `${collection}.${field}`)
        return Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rows: input.rows.map((row) =>
                    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, `de:${value}`]))
                  )
                })
              }
            }
          ]
        })
      }
    })
    assert.equal(translated.why, null, `${collection}.${field}`)
    for (let i = 0; i < rows.length; i++) {
      for (const key of fields) assert.equal(translated.rows[i][key], `de:${rows[i][key]}`)
      for (const [key, value] of Object.entries(rows[i]))
        if (!rule.itemFields.includes(key)) assert.deepEqual(translated.rows[i][key], value)
    }
  }
})
