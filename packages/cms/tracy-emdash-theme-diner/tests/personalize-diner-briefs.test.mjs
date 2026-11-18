// tools/personalize.mjs on this template's real seed, with the three briefs of the independent review of JA Diner 0.1.3
// (pack.5, 18/11/2026): an address and a phone, no contact, a phone only. Applied without a model on an in-memory site
// that holds the seed. Each case below failed on the tool the review ran (DECISIONS D-K14) and holds the rule that fixed
// it; the three behaviours the review also reported and the owner kept (keep-demo with no address, the footer address
// with a phone only, the emptied demo social links) are asserted as they are meant to be.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { demoPlaceWordsOf } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const SEED_DIR = path.join(ROOT, 'seed')
const seed = JSON.parse(readFileSync(path.join(SEED_DIR, 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(SEED_DIR, 'personalize.json'), 'utf8'))
const entries = Object.entries(seed.content).flatMap(([collection, rows]) =>
  rows.map((e) => ({ collection, slug: e.slug, locale: e.locale ?? 'en', data: e.data }))
)
const demo = (collection, slug) => entries.find((e) => e.collection === collection && e.slug === slug).data
const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

const BRIEFS = {
  address: { name: 'Test Cafe', sector: 'restaurant', contact: '1 Main St, Springfield · +1 555 0100' },
  none: { name: 'Test Cafe', sector: 'restaurant' },
  phone: { name: 'Test Cafe', sector: 'restaurant', contact: '+1 555 0100' }
}
const ADDRESS = '1 Main St, Springfield'

const run = (args) =>
  new Promise((resolve) => {
    execFile(
      'node',
      [TOOL, ...args],
      { cwd: ROOT, env: { ...process.env, ...NO_MODEL }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })

/** The tool applied to a fresh in-memory site seeded with this template's seed; the site's entries afterwards. */
async function applied(answers) {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale ?? 'en', e.data)
  const site = await mock.listen()
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-diner-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  try {
    const r = await run([
      '--seed',
      SEED_DIR,
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      path.join(dir, 'receipts.json'),
      '--answers-json',
      JSON.stringify(answers),
      '--no-model',
      '--json'
    ])
    const data = (collection, slug) => {
      const e = [...mock.state.entries.values()].find(
        (x) => x.collection === collection && x.slug === slug && x.locale === 'en'
      )
      return { ...e.live, ...e.draft }
    }
    return { report: JSON.parse(r.stdout), data, code: r.code }
  } finally {
    await mock.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const out = {}
before(async () => {
  for (const [k, answers] of Object.entries(BRIEFS)) out[k] = await applied(answers)
})
after(() => {})

/** Every text leaf of a value with its path; link targets (url, href, link) are not text. */
const LINK_KEY = /^(?:url|href|link)$|_(?:url|href|link)$/i
const leaves = (v, p = '', acc = []) => {
  if (typeof v === 'string') acc.push([p, v])
  else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${p}[${i}]`, acc))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v))
      if (!k.startsWith('_') && !LINK_KEY.test(k)) leaves(x, `${p}.${k}`, acc)
  return acc
}

test('a field that held text before still holds text after, with an address (empty home headings, D-K14)', () => {
  const { data } = out.address
  const emptied = []
  for (const e of entries) {
    const after = data(e.collection, e.slug)
    for (const [p, v] of leaves(e.data)) {
      if (v.trim() === '') continue
      const now = leaves(after).find(([q]) => q === p)
      if (now && now[1].trim() === '') emptied.push(`${e.collection}/${e.slug}${p}`)
    }
  }
  assert.deepEqual(emptied, [])
  const intro = data('features_intro', 'meet-three-broomsticks').sub_heading
  const news = data('chrome', 'chrome').news_title
  // a collection's own label ("Site chrome") names a record for editors, never a fallback a visitor reads
  const labels = new Set(seed.collections.flatMap((c) => [c.label, c.labelSingular]).filter(Boolean))
  for (const t of [intro, news]) {
    assert.notEqual(t.trim(), '')
    assert.doesNotMatch(t, /Hogsmeade|Dumbledore|Britain/)
    assert.ok(!labels.has(t), t)
  }
})

test("the Location card shows the brief's address, and keeps the demo's without one (D-K14)", () => {
  const card = (k) =>
    out[k].data('features_intro', 'meet-three-broomsticks').items.find((r) => r.title.startsWith('Location'))
  const demoCard = demo('features_intro', 'meet-three-broomsticks').items.find((r) =>
    r.title.startsWith('Location')
  )
  assert.equal(card('address').description, ADDRESS)
  assert.equal(card('none').description, demoCard.description)
  assert.equal(card('phone').description, demoCard.description)
})

test('"Mountain View" is one place and no button or link label loses a word (D-K14)', () => {
  const words = demoPlaceWordsOf(map, entries)
  assert.ok(words.has('Mountain View'), [...words].join(', '))
  for (const w of ['View', 'Mountain']) assert.ok(!words.has(w), `${w} is not a place on its own`)
  for (const k of Object.keys(BRIEFS)) {
    const slides = out[k].data('slideshow', 'slideshow').items
    assert.deepEqual(
      slides.map((s) => s.button2),
      demo('slideshow', 'slideshow').items.map((s) => s.button2),
      k
    )
  }
})

test("an award post keeps its title: a country is not the demo's place, and no title becomes the brief's name (D-K14)", () => {
  const slug = 'we-ve-been-nominated-for-the-britain-restaurant-awards'
  assert.equal(out.address.data('posts', slug).title, demo('posts', slug).title)
  assert.ok(!demoPlaceWordsOf(map, entries).has('Britain'))
  for (const e of entries.filter((x) => x.collection === 'posts'))
    assert.notEqual(out.address.data('posts', e.slug).title, BRIEFS.address.name, e.slug)
})

test("the template vendor's domain is never a demo domain: the credit line stays, and what the report keeps is kept (D-K14)", () => {
  for (const k of Object.keys(BRIEFS)) {
    const { data, report } = out[k]
    assert.match(data('chrome', 'chrome').copyright, /Designed by JoomlArt\.com\.$/, k)
    // a field the report lists as unanswered (kept as the template's) still holds the template's value
    for (const u of report.unanswered.filter((x) => /^[a-z_]+\.[a-z0-9-]+\.[a-z_]+$/.test(x.rule))) {
      const [collection, slug, field] = u.rule.split('.')
      assert.deepEqual(data(collection, slug)[field], demo(collection, slug)[field], `${k}: ${u.rule}`)
    }
  }
})

test('kept as the owner decided: no address keeps the demo contacts, a phone only keeps the footer address, the demo social links lead nowhere', () => {
  const footer = (k) => out[k].data('chrome', 'chrome')
  const demoFooter = demo('chrome', 'chrome')
  assert.equal(footer('none').footer_address, demoFooter.footer_address)
  assert.equal(footer('none').footer_phone, demoFooter.footer_phone)
  assert.equal(footer('phone').footer_address, demoFooter.footer_address)
  assert.equal(footer('phone').footer_phone, '+1 555 0100')
  assert.equal(footer('address').footer_address, ADDRESS)
  for (const k of Object.keys(BRIEFS))
    for (const l of out[k].data('contact', 'contact').social_links)
      assert.equal(l.url, '', `${k}: ${l.label}`)
})
