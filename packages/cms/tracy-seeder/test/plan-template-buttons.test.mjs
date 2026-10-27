// A social button is the template's: translated, never rewritten (K6); a button that still leads nowhere keeps the demo's
// label (PAGE-5).
//
// Measured 10/10/2026 on dev g60-ess-wp-full and g60-ess-j-full (JA Essence, a bakery, Vietnamese): the gallery's
// "@Grazia on instagram" → `#` came back "Xem bộ bánh" (WordPress, 56 pages) and "Tiệm bánh Tamarind & Co" (Joomla, 155
// pages). The button is a contract slot (`gallery.title`, `basic[gallery_title]`), so it went to the business rewrite.
// Every model here DISOBEYS: it writes a business action for every label, keeps answering with the business name, drops the
// handle, or answers nothing; an obedient model is how the round before passed while the site failed.

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  liveContact,
  planJoomlaContract,
  templateButtons as joomlaButtons
} from '../src/plan-joomla-contract.mjs'
import { planWordpressContract, templateButtons as wpButtons } from '../src/plan-wordpress-contract.mjs'
import { buttonKindOf, translateLabels, translationRefusal } from '../src/template-buttons.mjs'

const CONTRACTS = fileURLToPath(new URL('../../', import.meta.url))
const NAME = 'Tiệm Bánh Tamarind & Co'
const ABOUT = 'Tiệm bánh gia đình ở Dubai, nướng bánh mì sourdough và bánh mì Việt mỗi sáng.'
const json = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'))

/**
 * A disobedient model: every rewrite answers a bakery action for every slot; a translation answers per `translate`.
 * @param {(label: any, input: any, n: number) => string | null} translate
 */
function model(translate) {
  /** @type {Array<{ system: string, input: any }>} */
  const calls = []
  let n = 0
  const generate = async (/** @type {{ system: string, input: any }} */ call) => {
    calls.push(call)
    if (Array.isArray(call.input?.labels)) {
      n += 1
      const values = {}
      for (const l of call.input.labels) {
        const said = translate(l, call.input, n)
        if (said !== null) values[l.key] = said
      }
      return JSON.stringify({ values })
    }
    const values = {}
    for (const s of call.input?.slots ?? [])
      if (s.type !== 'url' && typeof s.sample === 'string' && s.sample.trim()) values[s.key] = 'Xem bộ bánh'
    return JSON.stringify({ values, pending: [], invented: [] })
  }
  return { calls, generate }
}

const vi = (/** @type {string} */ text) => text.replace(/\bon\b/, 'trên')

test('the kinds: a handle or a network is social, `#` and empty lead nowhere, a page is neither', () => {
  assert.equal(buttonKindOf({ label: '@Grazia on instagram', link: '#' }), 'social')
  assert.equal(buttonKindOf({ label: 'Follow us', link: 'https://www.instagram.com/x' }), 'social')
  assert.equal(buttonKindOf({ label: 'Facebook', link: '{social.facebook}' }), 'social')
  assert.equal(buttonKindOf({ label: 'Get a quote', link: '#' }), 'void')
  assert.equal(buttonKindOf({ label: 'Get a quote', link: '' }), 'void')
  assert.equal(buttonKindOf({ label: 'Get a quote', link: '/contact' }), null)
  const slot = { sample: '@Grazia on instagram', maxCharacters: 80 }
  const context = { language: 'vi', forbidden: [NAME] }
  assert.equal(translationRefusal(slot, '@Grazia trên instagram', context), null)
  assert.match(String(translationRefusal(slot, 'Xem bộ bánh', context)), /drops "@Grazia"/)
  assert.match(String(translationRefusal(slot, `@Grazia ${NAME} instagram`, context)), /names/)
  assert.match(String(translationRefusal(slot, '@Grazia on instagram', context)), /not translated/)
  assert.equal(translationRefusal(slot, '@Grazia on instagram', { language: 'en', forbidden: [] }), null)
})

test('WordPress JA Essence 1.0.13, Vietnamese: the gallery button never reaches the rewrite and is translated; its link stays', async () => {
  const contentMap = json(
    path.join(CONTRACTS, 'tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.13/content-map.json')
  )
  const buttons = wpButtons(contentMap.slots)
  assert.equal(buttons.get('contact.gallery.title')?.kind, 'social')
  const m = model((l) => vi(l.label))
  const out = await planWordpressContract({
    contentMap,
    site: { name: NAME, about: ABOUT, languages: ['vi'], sourceLanguage: 'vi' },
    generate: m.generate
  })
  const rewritten = m.calls
    .filter((c) => Array.isArray(c.input?.slots))
    .flatMap((c) => c.input.slots.map((s) => s.key))
  assert.ok(!rewritten.includes('contact.gallery.title'), 'the label is not in a rewrite batch')
  assert.ok(!rewritten.includes('contact.gallery.title.url'), 'nor is its link')
  for (const key of ['contact.gallery.title', 'home-3.gallery.title'])
    assert.equal(out.changes[key], '@Grazia trên instagram', `${key}: translated`)
  assert.equal(out.changes['contact.gallery.title.url'], undefined, 'the link keeps the demo’s')
  const asked = m.calls.filter((c) => Array.isArray(c.input?.labels))
  assert.ok(asked.length > 0)
  assert.ok(
    asked.every((c) => c.input.brief === undefined && !JSON.stringify(c.input).includes(ABOUT)),
    'no brief'
  )
})

test('WordPress, English: the gallery button keeps the demo’s label and no model is asked for it', async () => {
  const contentMap = json(
    path.join(CONTRACTS, 'tracy-wordpress-quickstart/contracts/ja-essence/wp7/1.0.13/content-map.json')
  )
  const m = model(() => 'never')
  const out = await planWordpressContract({
    contentMap,
    site: { name: NAME, about: ABOUT, languages: ['en'] },
    generate: m.generate
  })
  assert.equal(out.changes['contact.gallery.title'], undefined)
  assert.ok(!out.pending.includes('contact.gallery.title'))
  assert.equal(m.calls.filter((c) => Array.isArray(c.input?.labels)).length, 0)
})

/** A disobedient model: an action of the bakery for every label and a page for one link; labels translated as `VI …`. */
const actionModel = () => {
  /** @type {any[]} */
  const calls = []
  const generate = async (/** @type {any} */ call) => {
    calls.push(call)
    if (Array.isArray(call.input?.labels))
      return JSON.stringify({
        values: Object.fromEntries(call.input.labels.map((l) => [l.key, `VI ${l.label}`]))
      })
    const values = {}
    for (const s of call.input.slots)
      if (!s.key.endsWith('.url') && s.sample) values[s.key] = 'Đặt bánh sinh nhật'
    values['home.go'] = 'Liên hệ tiệm'
    values['home.go.url'] = '/contact'
    return JSON.stringify({ values, pending: [] })
  }
  return { calls, generate }
}
const voidMap = (/** @type {boolean} */ withContact) => ({
  entities: [
    { key: 'page-home', identity: { postType: 'page', slug: 'home' } },
    ...(withContact ? [{ key: 'page-contact', identity: { postType: 'page', slug: 'contact' } }] : [])
  ],
  slots: [
    ['cta', 'Get a quote'],
    ['go', 'Book now'],
    ['talk', 'Contact us'],
    ['arrow', '→']
  ].flatMap(([block, sample]) => [
    {
      key: `home.${block}`,
      entity: 'page-home',
      target: { block, attr: 'content' },
      type: 'text',
      sample,
      maxCharacters: 40
    },
    {
      key: `home.${block}.url`,
      entity: 'page-home',
      target: { block, attr: 'url' },
      type: 'url',
      sample: '#',
      maxCharacters: 2048
    }
  ])
})

test('WordPress FULL, a button that leads nowhere: it leads to the Contact page under the template’s contact label, translated', async () => {
  const out = await planWordpressContract({
    contentMap: voidMap(true),
    site: { name: NAME, about: ABOUT, languages: ['vi'], sourceLanguage: 'vi' },
    generate: actionModel().generate
  })
  assert.equal(out.changes['home.cta.url'], '/contact')
  assert.equal(
    out.changes['home.cta'],
    'VI Contact us',
    'the template’s own contact label, never the model’s action'
  )
  assert.equal(out.changes['home.talk.url'], '/contact')
  assert.equal(out.changes['home.go'], 'Liên hệ tiệm', 'its link was given a page: the label names it')
  assert.equal(out.changes['home.go.url'], '/contact')
  assert.equal(out.changes['home.arrow'], undefined, 'decor stays as the template made it')
  assert.equal(out.changes['home.arrow.url'], undefined)
})

test('WordPress FULL with no Contact page (or one the customer unticked): the demo’s label, translated, and pending void-no-contact', async () => {
  for (const [map, hidden] of [
    [voidMap(false), new Set()],
    [voidMap(true), new Set(['page-contact'])]
  ]) {
    const out = await planWordpressContract({
      contentMap: map,
      site: { name: NAME, about: ABOUT, languages: ['vi'], sourceLanguage: 'vi' },
      generate: actionModel().generate,
      hidden
    })
    assert.equal(out.changes['home.cta'], 'VI Get a quote')
    assert.equal(out.changes['home.cta.url'], undefined)
    assert.equal(out.reasons['home.cta'], 'void-no-contact')
    assert.ok(out.pending.includes('home.cta'))
  }
})

test('WordPress BLANK (no description): a button that leads nowhere keeps the demo’s label, translated, and its link', async () => {
  const out = await planWordpressContract({
    contentMap: voidMap(true),
    site: { name: NAME, languages: ['vi'], sourceLanguage: 'vi' },
    generate: actionModel().generate
  })
  assert.equal(out.changes['home.cta'], 'VI Get a quote')
  assert.equal(out.changes['home.cta.url'], undefined)
  assert.ok(!out.pending.includes('home.cta'))
})

for (const [release, contact] of [
  ['ja-nova/wp7/1.1.10', true],
  ['ja-impact/wp7/1.0.7', false],
  ['ja-essence/wp7/1.0.13', true]
])
  test(`WordPress ${release} FULL in Vietnamese, every label answered with an action: no button keeps an action to nowhere`, async () => {
    const contentMap = json(
      path.join(CONTRACTS, 'tracy-wordpress-quickstart/contracts', release, 'content-map.json')
    )
    const m = actionModel()
    const out = await planWordpressContract({
      contentMap,
      site: { name: NAME, about: ABOUT, languages: ['vi'], sourceLanguage: 'vi' },
      generate: m.generate
    })
    const buttons = wpButtons(contentMap.slots)
    for (const [key, b] of buttons) {
      if (b.kind !== 'void') continue
      const label = contentMap.slots.find((s) => s.key === key)
      if (!/\p{L}{2}/u.test(label.sample)) continue
      assert.notEqual(out.changes[key], 'Đặt bánh sinh nhật', `${key}: never the model's action`)
      if (contact) assert.equal(out.changes[b.link.key], '/contact', `${key} leads to the Contact page`)
      else assert.equal(out.reasons[key], 'void-no-contact', key)
    }
  })

test('a model that keeps rewriting instead of translating: asked again with the reason, then alone, then the label is pending', async () => {
  const m = model((l, input) => (input.labels.length > 1 || !input.fix ? NAME : 'Xem bộ bánh'))
  const out = await translateLabels({
    slots: [
      { key: 'a', sample: '@Grazia on instagram', maxCharacters: 60 },
      { key: 'b', sample: 'Follow us on Facebook', maxCharacters: 60 }
    ],
    languageOf: () => 'vi',
    generate: m.generate,
    forbidden: [NAME]
  })
  assert.deepEqual(out.changes, {}, 'nothing a model rewrote is written')
  assert.deepEqual(out.pending.sort(), ['a', 'b'])
  assert.equal(out.reasons.a, 'button-untranslated')
  const asks = m.calls.map((c) => c.input.labels.length)
  assert.deepEqual(asks, [2, 2, 1, 1], 'the set, the set again with the reason, then one label per call')
  assert.match(m.calls[1].input.fix, /a: it drops "@Grazia"/)
})

test('a model that drops the handle the first time and translates when told why: the translation is written', async () => {
  const m = model((l, input) => (input.fix ? vi(l.label) : 'Ảnh từ tiệm'))
  const out = await translateLabels({
    slots: [{ key: 'a', sample: '@Grazia on instagram', maxCharacters: 60 }],
    languageOf: () => 'vi',
    generate: m.generate,
    forbidden: [NAME]
  })
  assert.deepEqual(out.changes, { a: '@Grazia trên instagram' })
  assert.match(m.calls[1].input.fix, /drops "@Grazia"/)
})

function joomlaDataDir(/** @type {string} */ id) {
  const root = mkdtempSync(path.join(tmpdir(), 'template-buttons-'))
  mkdirSync(path.join(root, 'quickstart-contracts', path.dirname(id)), { recursive: true })
  symlinkSync(
    path.join(CONTRACTS, 'tracy-joomla-quickstart/contracts', id),
    path.join(root, 'quickstart-contracts', id)
  )
  return root
}

test('Joomla JA Essence 1.0.4, Vietnamese: the gallery buttons never reach the rewrite and are translated', async () => {
  const id = 'ja-essence/j6/1.0.4'
  const map = json(path.join(CONTRACTS, 'tracy-joomla-quickstart/contracts', id, 'content-map.json'))
  const state = {
    contract: id,
    slots: map.slots.map((s) => ({ ...s, current: s.sample })),
    pages: map.pages ?? []
  }
  const buttons = joomlaButtons(state.slots)
  assert.equal(buttons.get('module-120.0')?.kind, 'social')
  assert.equal(buttons.get('module-140.0')?.kind, 'social')
  const m = model((l) => vi(l.label))
  const out = await planJoomlaContract({
    state,
    site: { name: NAME, about: ABOUT, languages: ['vi'], sourceLanguage: 'vi' },
    generate: m.generate,
    dataDir: joomlaDataDir(id),
    surface: 'pages',
    trimmed: true,
    inventions: 'never'
  })
  const rewritten = m.calls
    .filter((c) => Array.isArray(c.input?.slots))
    .flatMap((c) => c.input.slots.map((s) => s.key))
  for (const key of ['module-120.0', 'module-140.0']) {
    assert.ok(!rewritten.includes(key), `${key} is not in a rewrite batch`)
    assert.equal(out.changes[key], '@Grazia trên instagram')
  }
  assert.ok(!rewritten.includes('module-120.1'), 'nor is its link')
})

for (const id of ['ja-nova/j6/1.0.5', 'ja-impact/j6/1.0.1', 'ja-essence/j6/1.0.4'])
  for (const about of [ABOUT, ''])
    test(`Joomla ${id} ${about ? 'FULL' : 'BLANK'} in Vietnamese, every label answered with an action: a button to nowhere ${about ? 'leads to the Contact page, or keeps the demo’s label' : 'keeps the demo’s label and link'}`, async () => {
      const map = json(path.join(CONTRACTS, 'tracy-joomla-quickstart/contracts', id, 'content-map.json'))
      const state = {
        contract: id,
        slots: map.slots.map((s) => ({ ...s, current: s.sample })),
        pages: map.pages ?? []
      }
      const dataDir = joomlaDataDir(id)
      const m = model((l) => `VI ${l.label}`)
      const out = await planJoomlaContract({
        state,
        site: { name: NAME, about, languages: ['vi'], sourceLanguage: 'vi' },
        generate: m.generate,
        dataDir,
        surface: 'pages',
        trimmed: true,
        inventions: 'never'
      })
      const contact = liveContact(state, dataDir, new Set())
      const voids = [...joomlaButtons(state.slots)].filter(
        ([key, b]) =>
          b.kind === 'void' && /\p{L}{2}/u.test(String(state.slots.find((s) => s.key === key)?.sample))
      )
      // JA Essence j6 names no link field as a button's: its `#` links are card titles and the social gallery button.
      if (id.startsWith('ja-essence/')) return assert.equal(voids.length, 0)
      let seen = 0
      for (const [key, b] of voids) {
        if (!(key in out.changes) && !out.pending.includes(key)) continue
        seen += 1
        assert.notEqual(out.changes[key], 'Xem bộ bánh', `${key}: never the model's action`)
        assert.match(String(out.changes[key] ?? ''), /^VI /, `${key}: a translation of the template's words`)
        if (about && contact) assert.equal(out.changes[b.link.key], `index.php?Itemid=${contact.id}`, key)
        else assert.equal(out.changes[b.link.key], undefined, key)
        if (about && !contact) assert.equal(out.reasons[key], 'void-no-contact', key)
      }
      assert.ok(seen > 0, 'buttons that lead nowhere were planned')
      if (process.env.BUTTON_COUNTS)
        console.log(id, about ? 'FULL' : 'BLANK', 'void', seen, 'contact', contact?.id ?? 'none')
    })

test("the name of a social or icon link and a placeholder never go to the rewrite (JA Mood's Social List)", async () => {
  const { iconLinkKeys } = await import('../src/template-buttons.mjs')
  const li = (n, title) => [
    {
      key: `m.${n}0`,
      entity: 'm',
      column: 'content',
      type: 'url',
      sample: '#',
      xpath: `/html/body/div/ul/li[${n}]/a/@href`
    },
    {
      key: `m.${n}1`,
      entity: 'm',
      column: 'content',
      type: 'text',
      sample: title,
      xpath: `/html/body/div/ul/li[${n}]/a/@title`
    },
    {
      key: `m.${n}2`,
      entity: 'm',
      column: 'content',
      type: 'text',
      sample: 'empty',
      xpath: `/html/body/div/ul/li[${n}]/a/span[2]/text()`
    }
  ]
  const slots = [
    ...li(1, 'Facebook'),
    ...li(2, 'Google plus'),
    // an icon link named for what it does, with no words of its own
    ...li(3, 'Search the site'),
    // a text link: its title goes with its words
    {
      key: 'm.40',
      entity: 'm',
      column: 'content',
      type: 'url',
      sample: '/about',
      xpath: '/html/body/div/p/a/@href'
    },
    {
      key: 'm.41',
      entity: 'm',
      column: 'content',
      type: 'text',
      sample: 'About the studio',
      xpath: '/html/body/div/p/a/@title'
    },
    {
      key: 'm.42',
      entity: 'm',
      column: 'content',
      type: 'text',
      sample: 'Read about us',
      xpath: '/html/body/div/p/a/text()'
    },
    {
      key: 'm.50',
      entity: 'm',
      column: 'content',
      type: 'text',
      sample: 'Our story',
      xpath: '/html/body/div/h2/text()'
    }
  ]
  const kept = iconLinkKeys(slots)
  for (const key of ['m.11', 'm.12', 'm.21', 'm.22', 'm.31', 'm.32']) assert.ok(kept.has(key), key)
  for (const key of ['m.41', 'm.42', 'm.50']) assert.ok(!kept.has(key), key)
})
