/**
 * The demo blog articles of a Joomla template, held against the contract JA Essence j6 1.0.3 really ships (45 articles that
 * no page opens on its own, 630 text lines, every body the same demo text): a customer who described the business gets
 * their text written for it, pictures, links and aliases kept (D10, TCH #1013); About left blank keeps them, and keeps every
 * other demo line too: the footer tagline and the gallery title the name alone used to rewrite (g55-ess-j-blank, 10/10/2026).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { blogArticleSlots, POST_SLOTS } from '../src/sites/brief-engines/joomla-blog-articles.js'
import { throughDoor } from './_apply-door.mjs'

const essence = contractFor(defaultContracts(), 'quickstart/ja-essence/j6', '1.0.3')
assert.ok(essence, 'the checkout ships the JA Essence j6 1.0.3 profile')
const map = JSON.parse(readFileSync(`${essence.dir}/content-map.json`, 'utf8'))
const sampleOf = (/** @type {string} */ key) => map.slots.find((s) => s.key === key)?.sample
const lock = JSON.parse(readFileSync(`${essence.dir}/presentation-lock.json`, 'utf8'))
/** The categories JA Essence ships, as the site lists them: Health, Design, Fashion, Lifestyle, Resources, Blog… */
const categories = Object.entries(lock.entities)
  .filter(([key]) => key.startsWith('category-'))
  .map(([key, row]) => ({
    id: Number(key.slice('category-'.length)),
    language: '*',
    .../** @type {any} */ (row)
  }))

/** The articles a page opens on its own (`view=article&id=N`): planned with their page, not as blog articles. */
const opened = new Set(
  map.pages
    .map((p) => /[?&]view=article(?:&|$)/.test(p.link ?? '') && /[?&]id=(\d+)/.exec(p.link))
    .filter(Boolean)
    .map((m) => `article-${m[1]}`)
)
const blogSlots = map.slots.filter(
  (s) => /^article-\d+$/.test(s.entity) && !opened.has(s.entity) && s.type === 'text'
)

/**
 * A model double: every text line gets the bakery's words, or what `say` puts in it; every other slot keeps its sample. A
 * translation batch (an array) is answered by `translate`, the text as it is by default.
 */
/** Words for article titles no two articles share most of (`post-titles.js`): one list, none repeated. */
const WORDS = (
  'almond apple apricot banana basil berry butter caramel carrot cashew cherry chestnut chili cinnamon citrus clove cocoa ' +
  'coconut coffee cream cumin custard date fennel fig garlic ginger grape hazelnut honey lemon lime mango maple milk mint ' +
  'mocha nutmeg oat olive onion orange papaya peach peanut pear pecan pepper pine plum poppy potato pumpkin quince raisin ' +
  'rice rose rye saffron sage salt sesame sugar tahini thyme toffee tomato truffle vanilla walnut wheat yam yogurt zest'
).split(' ')
/** A title of its own for an article's title slot (`article-<n>.<i>`), so the titles are told apart as a visitor would. */
const ownTitle = (/** @type {string} */ key) => {
  const n = Number(/^article-(\d+)/.exec(key)?.[1] ?? 0)
  return `Bánh ${WORDS[n % WORDS.length]} ${WORDS[(n + 17) % WORDS.length]} ${WORDS[(n + 41) % WORDS.length]}`
}

function bakeryModel({ say = () => null, translate = (/** @type {string} */ text) => text } = {}) {
  const calls = []
  return {
    calls,
    models: async () => ({
      text: {
        usage: () => ({}),
        chat: async ({ messages }) => {
          const input = JSON.parse(messages[1].content)
          if (messages[0].content.startsWith('You are tidying')) return '{"relabel": {}}'
          if (messages[0].content.startsWith('You finish the words')) return '{"values": {}}'
          calls.push(input)
          if (Array.isArray(input))
            return JSON.stringify(input.map(({ i, text }) => ({ i, text: translate(text) })))
          const values = {}
          for (const s of input.slots ?? []) {
            if (s.requiresEvidence) continue
            values[s.key] =
              s.type === 'text' && s.sample.trim()
                ? (
                    say(s) ??
                    (s.column === 'title' && s.entity.startsWith('article-')
                      ? ownTitle(s.key)
                      : s.entity.startsWith('article-')
                        ? // An article's own words, which its title is written from (`post-title-stage.js`).
                          `${ownTitle(s.key)} nướng mỗi sáng.`
                        : `Bakery ${s.key}`)
                  ).slice(0, s.maxCharacters)
                : s.sample
          }
          return JSON.stringify({ values, pending: [], invented: [] })
        }
      }
    })
  }
}

/** A bound JA Essence site: it hands over the contract's slots as shipped and remembers every contract write and record write. */
function essenceSite() {
  const site = {
    revision: 'rev-1',
    /** Every contract write's changes, in order. */
    writes: /** @type {Record<string, string>[]} */ ([]),
    /** Every record write (menu entries, articles), in order. */
    records: /** @type {any[]} */ ([]),
    apply: async ({ action, params }) => {
      // The site's categories are the release's own (its presentation lock), one page of them.
      if (action === 'content.list')
        return { ok: true, items: params.kind === 'category' && !params.offset ? categories : [] }
      if (action === 'content.get') return { ok: false, error: 'not_found' }
      if (action === 'content.update') return site.records.push(params), { ok: true }
      if (action === 'content.batch') return site.records.push(...params.operations), { ok: true }
      if (action === 'media.upload') return { ok: true }
      if (action !== 'content.contract') return { ok: false, error: `unknown action: ${action}` }
      switch (params.operation) {
        case 'inspect':
          return {
            ok: true,
            contract: essence.id,
            revision: site.revision,
            slots: map.slots.map((s) => ({ ...s, current: s.sample })),
            pages: map.pages,
            job: null
          }
        case 'apply':
          site.writes.push(params.changes ?? {})
          site.revision = 'rev-2'
          return { ok: true, afterRevision: 'rev-2' }
        case 'demoTrim.apply':
          return { ok: true, status: 'completed', moved: 0 }
        case 'siteLanguage.set':
          return { ok: true, status: 'completed', locale: params.locale }
        default:
          return {
            ok: false,
            error: 'unsupported',
            message: `Unknown contract operation ${params.operation}`
          }
      }
    }
  }
  return site
}

const ABOUT = 'Tiệm bánh gia đình ở Dubai, nướng bánh mì sourdough và bánh mì Việt mỗi sáng.'

/** A JA Essence Apply: About given (`about`), or the name alone (`about: ''`). */
async function run({ about = ABOUT, model = bakeryModel(), languages = ['vi'] } = {}) {
  const site = essenceSite()
  const notes = []
  const times = {}
  const ctx = {
    siteKey: 'ess-test',
    label: 'tamarind',
    platform: 'joomla',
    quickstart: 'quickstart/ja-essence/j6',
    contract: essence,
    email: 'owner@example.com',
    brief: { about, goal: 'contact', style: 'plain' },
    normalized: {
      name: about ? 'Tiệm Bánh Tamarind & Co' : 'Tamarind Bakery',
      nameFrom: 'answer',
      about,
      tone: 'plain',
      contact: '',
      languages
    },
    signal: new AbortController().signal,
    time: (/** @type {string} */ name, /** @type {number} */ ms) => {
      times[name] = ms
    },
    note: (/** @type {string} */ n) => notes.push(n),
    deadlineAt: Date.now() + 60_000
  }
  const engine = createJoomlaEngine({ models: model.models, applyFor: () => throughDoor(site.apply) })
  const prepared = await engine.prepare(ctx)
  await engine.apply(ctx, prepared)
  const written = Object.assign({}, ...site.writes)
  return { site, written, notes, times, model }
}

test('JA Essence: 45 demo articles no page opens, 630 text lines, all within one Apply', () => {
  assert.equal(new Set(blogSlots.map((s) => s.entity)).size, 45)
  assert.equal(blogSlots.length, 630)
  const taken = blogArticleSlots({
    slots: map.slots,
    pages: map.pages,
    kit: new Set(),
    shown: () => true,
    isDerived: () => false
  })
  assert.equal(taken.articles, 45)
  assert.equal(taken.left, 0)
  assert.ok(taken.slots.length <= POST_SLOTS)
})

// 🔒 Decision 1 after g65 (12/10/2026): the demo articles of a FULL site are translated where they stand, never rewritten.
test('About given, Vietnamese: every demo article line is translated where it stands, titles too; pictures, links and records kept', async () => {
  const { written, site, times } = await run({ model: bakeryModel({ translate: (text) => `vi ${text}` }) })
  const lines = blogSlots.filter((s) => /\p{L}/u.test(s.sample) && !s.requiresEvidence)
  const wrong = lines.filter((s) => written[s.key] !== `vi ${s.sample}`).map((s) => [s.key, written[s.key]])
  assert.deepEqual(wrong.slice(0, 5), [], `${wrong.length} of ${lines.length} lines`)
  const kept = map.slots.filter(
    (s) => s.entity.startsWith('article-') && (s.type === 'image' || s.type === 'url') && s.key in written
  )
  assert.deepEqual(
    kept.filter((s) => written[s.key] !== s.sample).map((s) => s.key),
    [],
    'no picture or link of an article changes'
  )
  // The number of articles, their aliases and categories are records, not slots: nothing writes them.
  assert.deepEqual(
    site.records.filter(
      (r) => r.kind === 'article' || 'alias' in (r.fields ?? {}) || 'catid' in (r.fields ?? {})
    ),
    [],
    'no article record is written: none unpublished, none moved, no alias changed'
  )
  // The 45 no page opens, and the 6 posts of the blog's categories the Detail pages open (POSTS, g64).
  assert.equal(times.articlesPlanned, 51)
  assert.ok(Object.keys(written).length <= 1500, 'one contract write holds it')
})

test('About given, English: the demo articles keep the template’s words, and the planner never rewrites them', async () => {
  const model = bakeryModel({ say: () => 'Fresh bread every morning' })
  const { written } = await run({ model, languages: ['en'] })
  assert.deepEqual(
    blogSlots.filter((s) => s.key in written).map((s) => s.key),
    [],
    'no demo article line is written'
  )
})

test('About blank: no model call; the demo articles, the footer tagline and the gallery title stay as the template ships them', async () => {
  const model = bakeryModel({ say: () => 'A warm bakery theme centred on fresh breads' })
  const { written, notes } = await run({ about: '', model, languages: ['en'] })
  assert.deepEqual(model.calls, [], 'nothing is asked of the model with the name alone')
  for (const key of ['module-121.2', 'module-120.0', 'module-140.0'])
    assert.ok(!(key in written), `${key} keeps "${sampleOf(key)?.trim()}" (${written[key]})`)
  assert.deepEqual(
    blogSlots.filter((s) => s.key in written).map((s) => s.key),
    [],
    'no demo article line is written'
  )
  assert.ok(
    notes.some((n) => /About was left blank/.test(n)),
    notes.join(' | ')
  )
})

test('a template whose blog does not fit one write: whole articles up to the room left, the rest kept and counted', () => {
  const lines = (/** @type {number} */ id, /** @type {number} */ n) =>
    Array.from({ length: n }, (_, i) => ({
      key: `article-${id}.${i}`,
      entity: `article-${id}`,
      type: 'text',
      sample: 'x'
    }))
  const slots = [...lines(1, 10), ...lines(2, 10), ...lines(3, 10)]
  const taken = blogArticleSlots({
    slots,
    pages: [{ entity: 'menuItem-1', link: 'index.php?option=com_content&view=article&id=3' }],
    kit: new Set(),
    shown: () => true,
    isDerived: () => false,
    most: 15
  })
  assert.deepEqual(
    taken.slots.map((s) => s.entity).filter((e, i, a) => a.indexOf(e) === i),
    ['article-1'],
    'an article a page opens is not a blog article; one that does not fit is kept whole'
  )
  assert.equal(taken.left, 1)
})

/** A translation double: Vietnamese is marked, so a translated line is told from the template's own. */
const toVi = (/** @type {string} */ text) => `VI ${text}`

test('A site written in Vietnamese: the blog categories are called in it, their aliases kept (LANG-2)', async () => {
  const { site } = await run({ model: bakeryModel({ translate: toVi }) })
  const named = site.records.filter((r) => r.kind === 'category')
  const byId = new Map(named.map((r) => [r.id, r.fields]))
  for (const [id, title] of [
    [9, 'Health'],
    [10, 'Design'],
    [11, 'Fashion'],
    [17, 'Lifestyle']
  ])
    assert.equal(byId.get(id)?.title, `VI ${title}`, `category ${id} "${title}" is called in Vietnamese`)
  assert.match(
    String(byId.get(9)?.description),
    /^VI It’s remarkable/,
    'a description shown is translated too'
  )
  assert.ok(!('description' in (byId.get(13) ?? {})), 'an empty description stays empty')
  for (const fields of byId.values())
    assert.deepEqual(
      Object.keys(fields).filter((f) => f !== 'title' && f !== 'description'),
      [],
      'only words: no alias, parent or state is written'
    )
})

test('A site written in English: no category is renamed', async () => {
  const { site } = await run({ model: bakeryModel({ translate: toVi }), languages: ['en'] })
  assert.deepEqual(
    site.records.filter((r) => r.kind === 'category'),
    []
  )
})

test('The Typography page is a kit page (K3): never planned in the bakery’s words, only translated', async () => {
  const typography = map.slots.filter((s) => s.entity === 'article-4' && s.type === 'text' && s.sample.trim())
  assert.ok(typography.length > 0)
  const vi = await run({ model: bakeryModel({ translate: toVi }) })
  for (const s of typography)
    assert.ok(
      !(s.key in vi.written) || vi.written[s.key] === toVi(s.sample),
      `${s.key}: "${vi.written[s.key]}" is the template's words translated, not the bakery's`
    )
  assert.equal(vi.written['article-4.196'], 'VI Typography')
  const en = await run({ model: bakeryModel({ translate: toVi }), languages: ['en'] })
  assert.deepEqual(
    typography.filter((s) => s.key in en.written).map((s) => s.key),
    [],
    'in the template’s own language the Typography page keeps its words'
  )
})
