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

import { factsFrom, fill, planFrom, replaceDeep } from '../tools/personalize.mjs'
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

// 🔒 A KEPT SOCIAL PROFILE OF THE DEMO SAYS NOTHING ABOUT THE CUSTOMER (TCH #1013, K6 + facts, g62). Measured 11/10/2026 on
// g61-biz-emd-full (a bakery): the /contact cards still read "Site progress and tender announcements", "Erection footage and
// site time-lapses", what the demo company posts. A customer's own profile holds what the rule's `item` names, and an item
// field the rule sets to a constant "" is words no answer gives; a kept demo profile on FULL takes that "" too (a claim of
// the demo company, emptied, never invented), while its name, icon and kept handle stay (K6). BLANK keeps every word.
test('FULL: a kept demo social profile loses the words the rule gives a customer’s none of; BLANK keeps them', () => {
  const rules = (map.identity ?? []).filter(
    (r) => r.from === 'social' && r.item && typeof r.item === 'object'
  )
  const emptied = rules.flatMap((r) =>
    Object.entries(r.item)
      .filter(([, v]) => v === '')
      .map(([k]) => ({ rule: r, field: k }))
  )
  if (emptied.length === 0) return // this template's customer items carry no field left empty
  const full = planFrom(map, seed, factsFrom(FULL), { rewrite: false, cut: false, claims: true })
  const blank = planFrom(map, seed, factsFrom(BLANK), { rewrite: false, cut: false, claims: false })
  for (const { rule, field } of emptied) {
    const k = `${rule.collection}/${rule.slug}/${ROOT_LOCALE}`
    const demo = seed.content[rule.collection].find(
      (e) => e.slug === rule.slug && (e.locale ?? ROOT_LOCALE) === ROOT_LOCALE
    ).data[rule.field]
    const f = full.patches.get(k)?.fields?.[rule.field]
    const b = blank.patches.get(k)?.fields?.[rule.field]
    assert.equal(f.length, demo.length, 'K6: every demo profile kept')
    assert.equal(b.length, demo.length, 'K6: every demo profile kept')
    for (let i = 0; i < demo.length; i += 1) {
      if (typeof demo[i]?.[field] !== 'string') continue
      assert.equal(f[i][field], '', `FULL ${k}.${rule.field}[${i}].${field}`)
      assert.equal(
        b[i][field],
        renamed({ x: demo[i][field] }, factsFrom(BLANK)).x,
        `BLANK keeps ${rule.field}[${i}].${field}`
      )
      for (const [key, v] of Object.entries(demo[i]))
        if (key !== field && !/url|href|link|handle/i.test(key)) assert.equal(f[i][key], v, `K6 keeps ${key}`)
    }
  }
})
