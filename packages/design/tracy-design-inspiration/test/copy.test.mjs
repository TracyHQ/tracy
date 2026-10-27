/**
 * The copy contract v2 (spec §4h decision 5) and the model round trip, pinned without a model or a
 * disk: what a chip is drawn on, how a v1 file gains addresses, what a version does to the file, what
 * the model is told, and how its answer is read — over-long texts cut, never refused.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  addVersion,
  agentVersion,
  buildCopyPrompt,
  buildShortenPrompt,
  canonicalChip,
  chipLayout,
  clampToSlot,
  COPY_SCHEMA,
  DEFAULT_PROMPTS,
  emptyCopy,
  normalizeCopy,
  parseModelCopy,
  promptFor,
  promptOf,
  removeVersion,
  selectVersion
} from '../src/host/copy.mjs'

const PAGES = [
  { path: '/', type: 'home', label: 'Home' },
  { path: '/pricing/', type: 'pricing', label: 'Pricing' },
  { path: '/odd/', type: 'brochure', label: 'Odd' }
]

const SLOTS = [
  { id: 'h1.1', role: 'headline', words: 6, chars: 40, text: 'Design that ships' },
  {
    id: 'p.1',
    role: 'paragraph',
    words: 12,
    chars: 80,
    text: 'A paragraph of eighty characters or so, written by the author of the fixture.'
  },
  { id: 'button.1', role: 'button', words: 2, chars: 10, text: 'Get started' },
  { id: 'a.3', role: 'button', words: 1, chars: 5, text: 'Docs', inNav: true }
]

test('chipLayout: artifacts, the brand landing clone, real pages by their type, nothing else', () => {
  assert.deepEqual(chipLayout('form', PAGES), { artifact: 'form', kind: 'form' })
  assert.deepEqual(chipLayout('lucaswp_landing', PAGES), { artifact: 'landing', kind: 'landing' })
  assert.deepEqual(chipLayout('fijitrips.example_landing', PAGES), { artifact: 'landing', kind: 'landing' })
  assert.deepEqual(chipLayout('/', PAGES), { fixture: true, kind: 'home' })
  assert.deepEqual(chipLayout('/pricing/', PAGES), { fixture: true, kind: 'pricing' })
  assert.deepEqual(
    chipLayout('/pricing', PAGES),
    { fixture: true, kind: 'pricing' },
    'a trailing slash is not a different page'
  )
  assert.equal(canonicalChip('/pricing', PAGES), '/pricing/')
  assert.equal(canonicalChip('/', PAGES), '/')
  assert.equal(canonicalChip('form', PAGES), 'form')
  assert.deepEqual(
    chipLayout('/odd/', PAGES),
    { fixture: true, kind: 'home' },
    'an unknown page type draws as home'
  )
  assert.equal(chipLayout('/missing/', PAGES), null)
  assert.equal(chipLayout('kit', PAGES), null)
  assert.equal(chipLayout('', PAGES), null)
  assert.equal(chipLayout('../x_landing', PAGES), null)
})

test('DEFAULT_PROMPTS: one per page kind the dialog can show; promptFor falls back to home', () => {
  assert.deepEqual(Object.keys(DEFAULT_PROMPTS).sort(), [
    'article',
    'deck',
    'email',
    'form',
    'home',
    'landing',
    'listing',
    'newsletter',
    'poster',
    'pricing',
    'typography'
  ])
  assert.equal(promptFor('poster'), DEFAULT_PROMPTS.poster)
  assert.equal(promptFor('brochure'), DEFAULT_PROMPTS.home)
})

test('normalizeCopy: a v2 file comes back as written, with a dangling selected dropped', () => {
  const file = emptyCopy('airbnb', 'vi')
  addVersion(file, 'form', {
    id: 'v-1',
    title: 'Warmer',
    kind: 'llm',
    prompt: 'warmer',
    slots: { 'h1.1': 'Hello' },
    at: '2026-09-06T00:00:00.000Z',
    model: 'deepseek-chat'
  })
  const back = normalizeCopy(JSON.parse(JSON.stringify(file)), 'airbnb')
  assert.deepEqual(back, file)
  const dangling = normalizeCopy(
    {
      ...JSON.parse(JSON.stringify(file)),
      pages: { form: { versions: [], selected: 'v-1', nextPrompt: '' } }
    },
    'airbnb'
  )
  assert.deepEqual(dangling?.pages.form, { versions: [], selected: null, nextPrompt: null })
  const builtin = normalizeCopy(
    {
      ...JSON.parse(JSON.stringify(file)),
      pages: { form: { versions: [], selected: 'default', nextPrompt: null } }
    },
    'airbnb'
  )
  assert.equal(builtin?.pages.form.selected, 'default', 'a built-in choice survives')
  assert.equal(normalizeCopy(file, 'bugatti'), null, 'another inspiration')
  assert.equal(normalizeCopy({ schemaVersion: 'tracy-design-copy/v9', system: 'airbnb' }, 'airbnb'), null)
})

test('normalizeCopy: a v1 file — inspiration copy to "/", generated pages to their chip, nothing lost', () => {
  const v1 = {
    schemaVersion: 'tracy-design-copy/v1',
    system: 'airbnb',
    writtenAt: '2026-09-05T10:00:00.000Z',
    lang: 'en',
    brief: { goal: 'Sell the course', voice: 'plain' },
    slots: { 'h1.1': 'Learn to ship' },
    pages: [
      {
        id: 'gen-a',
        type: 'article',
        label: 'About Tracy',
        path: '/about/',
        generated: true,
        brief: null,
        slots: { 'h1.1': 'About us' }
      },
      {
        id: 'gen-f',
        type: 'form',
        label: 'Contact',
        path: '/contact/',
        generated: true,
        brief: { goal: 'g', voice: '' },
        slots: { 'h1.1': 'Talk to us' }
      }
    ]
  }
  const file = normalizeCopy(v1, 'airbnb')
  assert.ok(file)
  assert.equal(file.schemaVersion, COPY_SCHEMA)
  assert.equal(file.writtenAt, v1.writtenAt)
  assert.deepEqual(file.brief, v1.brief)
  assert.deepEqual(Object.keys(file.pages).sort(), ['/', 'form'])
  assert.deepEqual(
    file.pages['/'].versions.map((v) => [v.id, v.title, v.kind, v.prompt]),
    [
      ['v1-direction', 'Rewritten', 'rewritten', 'Sell the course — plain'],
      ['v1-gen-a', 'About Tracy', 'rewritten', null]
    ]
  )
  assert.deepEqual(
    file.pages.form.versions.map((v) => [v.id, v.title, v.prompt, v.slots]),
    [['v1-gen-f', 'Contact', 'g', { 'h1.1': 'Talk to us' }]]
  )
  assert.equal(file.pages['/'].selected, null, 'a migrated file selects nothing: the customer picks')
})

test('addVersion / removeVersion / selectVersion: appended and selected; removal falls back; built-ins allowed', () => {
  const file = emptyCopy('airbnb')
  const mk = (id) => ({
    id,
    title: id,
    kind: 'llm',
    prompt: null,
    slots: { 'h1.1': id },
    at: `2026-09-06T00:00:0${id.at(-1)}.000Z`,
    model: 'm'
  })
  addVersion(file, 'form', mk('v-1'), 'next one')
  addVersion(file, 'form', mk('v-2'))
  assert.deepEqual(
    file.pages.form.versions.map((v) => v.id),
    ['v-1', 'v-2']
  )
  assert.equal(file.pages.form.selected, 'v-2')
  assert.equal(file.pages.form.nextPrompt, 'next one', 'undefined leaves the next prompt alone')
  assert.equal(file.writtenAt, '2026-09-06T00:00:02.000Z')
  addVersion(file, 'form', mk('v-2'))
  assert.equal(file.pages.form.versions.length, 2, 'same id replaces')

  assert.equal(selectVersion(file, 'form', 'v-1'), true)
  assert.equal(file.pages.form.selected, 'v-1')
  assert.equal(selectVersion(file, 'form', 'default'), true)
  assert.equal(selectVersion(file, 'form', 'yours'), true)
  assert.equal(selectVersion(file, 'form', 'v-9'), false)
  assert.equal(selectVersion(file, 'form', 7), false)
  assert.equal(
    selectVersion(file, '/', 'default'),
    true,
    'a chip with no versions still remembers a built-in'
  )

  selectVersion(file, 'form', 'v-2')
  assert.equal(removeVersion(file, 'form', 'v-2'), true)
  assert.equal(file.pages.form.selected, null, 'the removed one was selected: fall back')
  assert.equal(removeVersion(file, 'form', 'v-2'), false)
  assert.equal(removeVersion(file, 'poster', 'v-1'), false)
})

test('promptOf: the body wins, then the chip’s next prompt, then the kind’s default; too long refused', () => {
  assert.deepEqual(
    promptOf({ prompt: '  Shorter.  ' }, { versions: [], selected: null, nextPrompt: 'n' }, 'form'),
    { ok: true, prompt: 'Shorter.' }
  )
  assert.deepEqual(promptOf({}, { versions: [], selected: null, nextPrompt: 'n' }, 'form'), {
    ok: true,
    prompt: 'n'
  })
  assert.deepEqual(promptOf(null, undefined, 'poster'), { ok: true, prompt: DEFAULT_PROMPTS.poster })
  assert.equal(promptOf({ prompt: 'x'.repeat(1201) }, undefined, 'home').ok, false)
})

test('buildCopyPrompt: the fixed part names kind, slots with limits and current text, the facts, then the ask; nav slots stay out', () => {
  const fresh = buildCopyPrompt({
    kind: 'landing',
    chip: 'landing',
    prompt: 'Coffee shop',
    slots: [],
    current: {},
    site: null,
    lang: 'en',
    factsOnly: true
  })
  assert.doesNotMatch(fresh.system, /Invent freely/)
  assert.match(fresh.system, /Use only facts supplied/)
  const { system, user } = buildCopyPrompt({
    kind: 'pricing',
    chip: '/pricing/',
    prompt: 'Cheaper sounding.',
    slots: SLOTS,
    current: { 'h1.1': 'Plans for teams' },
    site: {
      site: { name: 'Acme' },
      pages: PAGES.map((p) => ({ ...p, data: { plans: ['Solo'] } })),
      log: ['x']
    },
    lang: 'vi'
  })
  assert.match(system, /ONE JSON object/)
  assert.match(system, /"nextPrompt"/)
  assert.match(user, /^Page kind: pricing \(the site's page at \/pricing\/\)\./m)
  assert.match(user, /Language of the site: vi\./)
  assert.match(
    user,
    /- h1\.1 \[headline, max 8 words\]: "Plans for teams"/,
    'the current text wins over the author’s'
  )
  assert.match(user, /- p\.1 \[paragraph, max 100 chars\]: "A paragraph/)
  assert.match(user, /- button\.1 \[button, max 3 words\]: "Get started"/)
  assert.doesNotMatch(user, /a\.3/, 'nav slots are not offered')
  assert.match(user, /"plans": \[\s*"Solo"\s*\]/, 'the page’s own data is in the facts')
  assert.doesNotMatch(user, /"log"/, 'the agent’s log is not')
  assert.match(user, /What the customer asked for this take:\nCheaper sounding\.$/)
  const art = buildCopyPrompt({
    kind: 'form',
    chip: 'form',
    prompt: 'p',
    slots: [],
    current: {},
    site: null,
    lang: 'en'
  })
  assert.match(art.user, /^Page kind: form \(a sample product of the design template\)\./m)
  assert.doesNotMatch(art.user, /Facts about the site/)
})

test('clampToSlot: within the ceiling untouched; words cut by count, characters at a word boundary', () => {
  const h = SLOTS[0]
  assert.equal(clampToSlot('  Two   words ', h), 'Two words')
  assert.equal(
    clampToSlot('one two three four five six seven eight nine ten', h),
    'one two three four five six seven eight'
  )
  const p = SLOTS[1]
  const long = 'word '.repeat(40).trim()
  const cut = clampToSlot(long, p)
  assert.ok(cut.length <= 100 && cut.endsWith('word') && !cut.endsWith(' '), cut)
  assert.equal(clampToSlot('x'.repeat(150), p).length, 100, 'one unbreakable word is cut hard')
})

test('parseModelCopy: JSON dug out of prose or a fence; unknown ids dropped; over-long cut and named; title and nextPrompt bounded', () => {
  const answer =
    'Here you go:\n```json\n' +
    JSON.stringify({
      title: '  Bolder   claims ',
      nextPrompt: 'Try a calmer tone next. Fewer numbers.',
      slots: {
        'h1.1': 'Ship design work every single week without a designer',
        'p.1': 'Short.',
        'button.1': 'Start now',
        'a.3': 'Nav',
        'zz.9': 'ghost',
        x: ''
      }
    }) +
    '\n```\nHope that helps.'
  const r = parseModelCopy(answer, SLOTS)
  assert.equal(r.ok, true)
  assert.equal(r.title, 'Bolder claims')
  assert.equal(r.nextPrompt, 'Try a calmer tone next. Fewer numbers.')
  assert.deepEqual(Object.keys(r.slots).sort(), ['a.3', 'button.1', 'h1.1', 'p.1'])
  assert.equal(r.slots['h1.1'], 'Ship design work every single week without a', 'cut to 8 words')
  assert.deepEqual(r.trimmed, ['h1.1'])
  assert.deepEqual(r.over, { 'h1.1': 'Ship design work every single week without a designer' })
  const again = buildShortenPrompt(r.over, SLOTS, 'vi')
  assert.match(again.user, /Rewrite ONLY these, in vi/)
  assert.match(
    again.user,
    /- h1\.1 \[headline, max 8 words, you wrote 9\]: "Ship design work every single week without a designer"/
  )
  assert.doesNotMatch(again.user, /p\.1/)

  const bare = parseModelCopy('{"slots":{"p.1":"Fine."}}', SLOTS)
  assert.equal(bare.ok, true)
  assert.equal(bare.title, 'New take')
  assert.equal(bare.nextPrompt, null)

  assert.equal(parseModelCopy('Sorry, I cannot.', SLOTS).ok, false)
  assert.equal(parseModelCopy('{"slots":{"h1.1":"a"', SLOTS).ok, false)
  assert.equal(parseModelCopy('{"title":"t"}', SLOTS).ok, false)
  assert.equal(parseModelCopy('{"slots":{"zz.9":"ghost"}}', SLOTS).ok, false, 'nothing usable')
  const longTitle = parseModelCopy(JSON.stringify({ title: 'w'.repeat(80), slots: { 'p.1': 'x' } }), SLOTS)
  assert.equal(longTitle.title.length, 40)
})

test('agentVersion: the tool’s write becomes a rewritten version, titled by the agent or "Rewritten"; over-long refused by name', () => {
  const r = agentVersion(
    { id: 'airbnb', lang: 'vi', slots: { 'h1.1': 'Thiết kế giao ngay' }, title: ' Calm   and clear ' },
    SLOTS
  )
  assert.equal(r.ok, true)
  assert.equal(r.version.kind, 'rewritten')
  assert.equal(r.version.title, 'Calm and clear')
  assert.equal(r.version.model, null)
  assert.match(r.version.id, /^v-/)
  assert.equal(r.lang, 'vi')
  const untitled = agentVersion({ slots: { 'h1.1': 'x' }, brief: { goal: 'Sell', voice: 'warm' } }, SLOTS)
  assert.equal(untitled.version.title, 'Rewritten')
  assert.equal(untitled.version.prompt, 'Sell — warm')
  const over = agentVersion({ slots: { 'h1.1': 'one two three four five six seven eight nine' } }, SLOTS)
  assert.equal(over.ok, false)
  assert.match(over.error, /h1\.1 9\/8 words/)
})
