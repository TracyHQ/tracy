/**
 * The EmDash engine of "Apply": the template's own personalize tool, asked its questions before the site exists and
 * run against the site once it does. The runner is a double for the unit cases and the REAL tool, over the template's own
 * mock of the EmDash admin API, for the one that matters.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, mkdirSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { emdashToolFor, runNode } from '../src/lib/emdash-tool.js'
import {
  answersOf,
  createEmdashEngine,
  hideRest,
  templateQuestionIds
} from '../src/sites/brief-engines/emdash.js'
import { planMenuLabels, renameMenuItems, seedMenus } from '../src/sites/brief-engines/emdash-menus.js'
import { normalizeBrief } from '../src/sites/brief-normalize.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** Wait until `ready()` holds, a few seconds at most: what a test waits for, not a fixed sleep. */
async function until(ready, what, ms = 5000) {
  const end = Date.now() + ms
  while (!ready()) {
    if (Date.now() > end) assert.fail(`never: ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}
const THEME = path.resolve(HERE, '../../../packages/cms/tracy-emdash-theme-business')
const roots = []
const root = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'engine-'))
  roots.push(d)
  return d
}
after(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true })
})

const textDoor = { apiKey: 'sk-secret-text', baseUrl: 'https://api.deepseek.com', words: 'deepseek-flash' }
const openrouter = {
  url: 'https://openrouter.ai/api/v1/chat/completions',
  key: 'sk-or-secret',
  imageModel: 'google/gemini-3.1-flash-lite-image'
}

function context(overrides = {}) {
  const times = {}
  const notes = []
  return {
    times,
    notes,
    ctx: {
      siteKey: 'bakery.tracy.test',
      label: 'golden-crust',
      platform: 'emdash',
      quickstart: 'tracy-business/emdash-0.x',
      contract: null,
      email: 'owner@example.com',
      brief: { about: 'A family bakery in Hanoi.', goal: 'sell', style: 'friendly' },
      normalized: {
        name: 'Golden Crust Bakery',
        about: 'Golden Crust Bakery is a family bakery in Hanoi.',
        tone: 'friendly and warm',
        contact: '+84 24 3555 0144 · hello@goldencrust.vn',
        languages: ['en']
      },
      signal: new AbortController().signal,
      time: (name, ms) => {
        times[name] = ms
      },
      note: (n) => notes.push(n),
      deadlineAt: Date.now() + 60_000,
      ...overrides
    }
  }
}

/** A runner that records every call and answers as scripted: the warm-up, then the real run. */
function fakeRun({
  warm = { code: 3, stderr: 'fetch-cache record: hits=0 misses=0 kept=41' },
  real = {}
} = {}) {
  const calls = []
  const files = []
  const run = async (call) => {
    calls.push(call)
    const mode = call.env.TRACY_FETCH_MODE === 'record' ? 'warm' : 'real'
    // What each run is given to read is read NOW: a folder is gone once the run is over.
    const tokenFile = call.args[call.args.indexOf('--token-file') + 1]
    files.push({
      mode,
      token: existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : null,
      tokenFile
    })
    if (mode === 'warm') return { code: 0, stdout: '', stderr: '', killed: false, ...warm }
    const report = {
      written: [{ entry: 'site/site/en' }, { entry: 'home/home/en' }],
      errors: [],
      copy: { done: [], skipped: [] },
      pictures: { done: 3, skipped: [] },
      skipped: [],
      ...real.report
    }
    return {
      code: 0,
      stdout: JSON.stringify(report),
      stderr: 'fetch-cache replay: hits=41 misses=0 kept=0',
      killed: false,
      ...real,
      report: undefined
    }
  }
  return { run, calls, files }
}

/** A log that keeps the test output to the tests' own lines. */
const quiet = { info() {}, warn() {} }

const make = (extra = {}) => {
  const workRoot = root()
  const runner = extra.runner ?? fakeRun()
  const engine = createEmdashEngine({
    models: async () => ({ textDoor, image: openrouter, ...extra.models }),
    siteAccess: async () => ({
      origin: 'http://golden-crust-web-1:4321',
      token: 'ec_pat_realtoken00000000000000000000'
    }),
    run: runner.run,
    workRoot,
    ...(extra.fetchImpl ? { fetchImpl: extra.fetchImpl } : {}),
    log: extra.log ?? quiet
  })
  return { engine, runner, workRoot }
}

test('what the popup said becomes the tool’s questionnaire: only what was given, the phone apart from the mailbox', () => {
  assert.deepEqual(
    answersOf({
      name: 'Golden Crust Bakery',
      about: 'A bakery.',
      tone: 'warm',
      contact: '+84 24 3555 0144 · hello@goldencrust.vn',
      languages: ['en', 'vi']
    }),
    {
      name: 'Golden Crust Bakery',
      about: 'A bakery.',
      tone: 'warm',
      contact: '+84 24 3555 0144',
      email: 'hello@goldencrust.vn',
      languages: ['en', 'vi']
    }
  )
  assert.deepEqual(answersOf({ name: 'N', about: '', contact: '', languages: [] }), { name: 'N' })
  assert.deepEqual(answersOf({ name: 'N', about: 'x', contact: 'hello@n.example' }), {
    name: 'N',
    about: 'x',
    email: 'hello@n.example'
  })
})

test('T15: the tone reaches the tool as its own field, with a description or without one, and is never folded into it', () => {
  assert.deepEqual(answersOf({ name: 'N', about: '', tone: 'Warm', contact: '' }), {
    name: 'N',
    tone: 'Warm'
  })
  assert.deepEqual(answersOf({ name: 'N', about: 'A bakery.', tone: 'Warm', contact: '' }), {
    name: 'N',
    about: 'A bakery.',
    tone: 'Warm'
  })
  assert.deepEqual(answersOf({ name: 'N', about: '', tone: '', contact: '' }), { name: 'N' })
})

test('T15: with the standard questions and no template question of the same id, the description and tone reach the tool', () => {
  const tool = emdashToolFor('tracy-business/emdash')
  assert.ok(tool, 'the Business template ships its tool')
  const ids = templateQuestionIds(tool.seedDir)
  assert.ok(!ids.includes('about') && !ids.includes('tone'), 'the template asks neither itself')
  // What the standard sheet sends: the description and the tone, by their feeds.
  const typed = [
    { id: 'name', feeds: ['site.name', 'agent'], value: 'Golden Crust' },
    { id: 'about', feeds: ['copy.about', 'agent'], value: 'Sourdough and pastries in Hanoi.' },
    { id: 'tone', feeds: ['copy.tone', 'agent'], value: 'warm', valueLabel: 'Warm' }
  ]
  const answers = answersOf(
    { name: 'Golden Crust', about: 'Sourdough and pastries in Hanoi.', tone: 'Warm', contact: '' },
    typed,
    ids
  )
  assert.equal(answers.about, 'Sourdough and pastries in Hanoi.')
  assert.equal(
    answers.tone,
    'Warm',
    'the voice, beside the description, read by the tool (tests/personalize-tone.test.mjs)'
  )
})

test('T15/O5: a regional tag from the cleaned WordPress/Joomla list reaches the locale the EmDash template ships', async () => {
  const tool = emdashToolFor('tracy-business/emdash')
  assert.ok(tool)
  const { localesFrom, displayLocalesFrom } = await import(tool.tool)
  const card = JSON.parse(
    readFileSync(path.join(HERE, '../../../packages/cms/tracy-emdash-theme-business/artifact.json'), 'utf8')
  )
  const shipped = card.locales.all
  for (const [picked, locale] of [
    ['vi-VN', 'vi'],
    ['en-GB', 'en'],
    ['en-US', 'en'],
    ['pt-BR', 'pt'],
    ['zh-TW', 'zh'],
    ['nb-NO', 'nb']
  ]) {
    // The tag goes to the tool as the normalizer cleaned it: the region is kept on purpose.
    const answers = answersOf({ name: 'N', about: '', contact: '', languages: [picked] })
    assert.deepEqual(answers.languages, [picked])
    const decided = localesFrom(answers, shipped, card.locales.default)
    // One language other than the root's is written INTO the root (TCH #1013, O2): `as` names it.
    const written = decided.write.map((l) => decided.as?.[l] ?? l)
    assert.ok(written.includes(locale), `${picked} writes ${locale}: ${written.join(',')}`)
    assert.equal(decided.why, null, `${picked} is not refused`)
  }
  // The region the customer picked is what the page says it is written in (`<html lang>`, hreflang).
  const vi = answersOf({ name: 'N', about: '', contact: '', languages: ['vi-VN'] })
  assert.deepEqual(displayLocalesFrom(vi, ['en', 'vi']), { vi: 'vi-VN' })
  assert.deepEqual(displayLocalesFrom(vi, ['en'], { en: 'vi' }), { en: 'vi-VN' }, 'the root written in it')
})

test('LANG-5: a brief with no language chosen sends the tool no language, so it hides no locale', async () => {
  // The blank Tracy Business build of 09/10/2026 (only the name typed) unpublished 1911 entries: the normalizer's
  // fallback English (`languagesFrom: 'default'`) went to the tool as if the customer had picked it.
  const normalized = await normalizeBrief({
    brief: {
      about: '',
      goal: null,
      style: null,
      answers: [{ id: 'name', feeds: ['site.name'], value: 'Tamarind Bakery' }]
    },
    label: 'tamarind',
    model: null
  })
  assert.equal(normalized.languagesFrom, 'default')
  const answers = answersOf(normalized)
  assert.equal(answers.languages, undefined, 'no language chosen: none sent')
  const tool = emdashToolFor('tracy-business/emdash')
  assert.ok(tool)
  const { localesFrom } = await import(tool.tool)
  const card = JSON.parse(
    readFileSync(path.join(HERE, '../../../packages/cms/tracy-emdash-theme-business/artifact.json'), 'utf8')
  )
  assert.deepEqual(localesFrom(answers, card.locales.all, card.locales.default).hide, [])
  // A language the customer did pick still goes, and still hides the rest.
  assert.deepEqual(answersOf({ ...normalized, languages: ['vi'], languagesFrom: 'answer' }).languages, ['vi'])
})

test('the profiles the owner linked go to the tool as they are, and an empty list is not sent', () => {
  const social = { instagram: 'https://instagram.com/goldencrust' }
  assert.deepEqual(answersOf({ name: 'N', about: '', contact: '', social }), { name: 'N', social })
  assert.deepEqual(answersOf({ name: 'N', about: '', contact: '', social: {} }), { name: 'N' })
})

test('the address goes first, its comma kept, and the opening hours go with it: a street number cannot be read as the end of the phone', () => {
  assert.deepEqual(
    answersOf({
      name: 'Golden Crust Bakery',
      about: 'A bakery.',
      contact: '0912 345 678 · hello@goldencrust.vn · 12 Hang Bac, Hanoi',
      hours: 'Open 6am-8pm every day',
      languages: ['en']
    }),
    {
      name: 'Golden Crust Bakery',
      about: 'A bakery.',
      contact: '12 Hang Bac, Hanoi ; 0912 345 678',
      email: 'hello@goldencrust.vn',
      hours: 'Open 6am-8pm every day',
      languages: ['en']
    }
  )
})

/** The template's own questions, answered in the popup: what `briefFromAnswers` keeps on the brief. */
const BOOKSHOP_ANSWERS = [
  {
    id: 'name',
    kind: 'text',
    feeds: ['site.name', 'agent'],
    label: 'Company name',
    value: 'Lantern Bookshop'
  },
  { id: 'languages', kind: 'languages', feeds: ['site.languages'], label: 'Site language', value: ['en'] },
  { id: 'sector', kind: 'choice', feeds: ['agent'], label: 'Sector', value: 'other', valueLabel: 'Other' },
  {
    id: 'contact',
    kind: 'text',
    feeds: ['agent'],
    label: 'Address and hotline',
    value: '7 Quay Lane, Harbourtown · +44 20 7946 0321'
  },
  { id: 'email', kind: 'text', feeds: ['agent'], label: 'Contact email', value: 'shop@lantern.example' },
  { id: 'favourite-shelf', kind: 'text', feeds: [], label: 'Favourite shelf', value: 'poetry' }
]

test('the template’s own answers reach the tool as the customer typed them, beside what the text was read for', () => {
  // What the normalizer made of them: the model did not echo the street, so its contact line has none.
  const normalized = {
    name: 'Lantern Bookshop',
    about: 'An independent bookshop with a reading room.',
    sector: 'Other',
    contact: '+44 20 7946 0321 · shop@lantern.example',
    phone: '+44 20 7946 0321',
    email: 'shop@lantern.example',
    address: '',
    languages: ['en']
  }
  assert.deepEqual(
    answersOf(normalized, BOOKSHOP_ANSWERS, ['name', 'languages', 'sector', 'contact', 'email']),
    {
      name: 'Lantern Bookshop',
      about: 'An independent bookshop with a reading room.',
      // The option as the template's question names it: the tool turns it into its label itself.
      sector: 'other',
      contact: '7 Quay Lane, Harbourtown · +44 20 7946 0321',
      email: 'shop@lantern.example',
      languages: ['en']
    },
    'the street the customer typed survives; an answer to a question the template does not ask is not sent'
  )
  // Popup text only (no questionnaire): the sector the text was read for still reaches the copy and the pictures.
  assert.deepEqual(
    answersOf({
      name: 'Lantern Bookshop',
      about: 'A bookshop.',
      sector: 'independent bookshop',
      contact: ''
    }),
    { name: 'Lantern Bookshop', about: 'A bookshop.', sector: 'independent bookshop' }
  )
})

test('prepare reads the template’s questions from its seed and hands the tool the answers to them', async () => {
  const { engine, runner } = make()
  const { ctx } = context({
    brief: { about: 'An independent bookshop.', goal: null, style: null, answers: BOOKSHOP_ANSWERS },
    normalized: {
      name: 'Lantern Bookshop',
      about: 'An independent bookshop.',
      sector: 'Other',
      contact: '+44 20 7946 0321 · shop@lantern.example',
      languages: ['en']
    }
  })
  await engine.prepare(ctx)
  const answers = JSON.parse(runner.calls[0].args[runner.calls[0].args.indexOf('--answers-json') + 1])
  assert.equal(answers.sector, 'other')
  assert.equal(answers.contact, '7 Quay Lane, Harbourtown · +44 20 7946 0321')
  assert.equal(answers.email, 'shop@lantern.example')
  assert.equal('favourite-shelf' in answers, false)
})

test('T23: the pages the customer unticked go to the tool by id, never the home page; no page list sends nothing', async () => {
  const all = [
    { id: 'home', label: 'Home', home: true },
    { id: 'about', label: 'About' },
    { id: 'news', label: 'News' },
    { id: 'contact', label: 'Contact' }
  ]
  const normalized = { name: 'N', about: '', contact: '' }
  assert.deepEqual(answersOf(normalized, [], [], { all, picked: ['about', 'contact'] }).hidePages, ['news'])
  assert.equal(
    answersOf(normalized, [], [], { all, picked: ['about', 'news', 'contact'] }).hidePages,
    undefined,
    'every page ticked hides none'
  )
  assert.equal(answersOf(normalized, [], [], null).hidePages, undefined)
  assert.equal(answersOf(normalized, [], [], { all }).hidePages, undefined, 'no picked list keeps every page')

  const { engine, runner } = make()
  const { ctx } = context({
    brief: { about: 'An independent bookshop.', answers: [], pages: { all, picked: [] } },
    normalized: {
      name: 'Lantern Bookshop',
      about: 'An independent bookshop.',
      contact: '',
      languages: ['en']
    }
  })
  await engine.prepare(ctx)
  const answers = JSON.parse(runner.calls[0].args[runner.calls[0].args.indexOf('--answers-json') + 1])
  assert.deepEqual(answers.hidePages, ['about', 'news', 'contact'], 'the home page stays, picked or not')
})

test('the pages the customer kept go to the tool as keepPages, the home page with them, so a template rule cannot hide a ticked page', () => {
  // Tracy SaaS hid its Pricing page by its own rule while the release offered Pricing to keep (measured 08/10/2026 on dev):
  // the tool drops a template rule naming a kept page, which it can only do when it is told which pages were kept.
  const all = [
    { id: 'home', label: 'Home', home: true },
    { id: 'pricing', label: 'Pricing' },
    { id: 'blog', label: 'Blog' }
  ]
  const normalized = { name: 'N', about: '', contact: '' }
  assert.deepEqual(answersOf(normalized, [], [], { all, picked: ['pricing'] }).keepPages, ['home', 'pricing'])
  assert.deepEqual(answersOf(normalized, [], [], { all, picked: [] }).keepPages, ['home'])
  assert.deepEqual(answersOf(normalized, [], [], { all, picked: ['pricing', 'nope'] }).keepPages, [
    'home',
    'pricing'
  ])
  assert.equal(
    answersOf(normalized, [], [], null).keepPages,
    undefined,
    'no Pages answer, the template rules stand'
  )
  assert.equal(answersOf(normalized, [], [], { all }).keepPages, undefined)
})

test('the name and the languages are the ones the normalizer read as typed: its cap holds, and the menus are planned for the same set', async () => {
  // The normalizer reads the name and the languages questions as typed too, and caps the languages (MAX_LANGUAGES, 4).
  // A raw answer laid over them would write six languages while the menu labels were judged for four.
  const typed = [
    ...BOOKSHOP_ANSWERS.filter((a) => a.id !== 'languages' && a.id !== 'name'),
    {
      id: 'name',
      kind: 'text',
      feeds: ['site.name', 'agent'],
      label: 'Company name',
      value: 'lantern  bookshop '
    },
    {
      id: 'languages',
      kind: 'languages',
      feeds: ['site.languages'],
      label: 'Site language',
      value: ['en', 'vi', 'de', 'fr', 'it', 'es']
    }
  ]
  const normalized = {
    name: 'Lantern Bookshop',
    about: 'An independent bookshop.',
    contact: '',
    languages: ['en', 'vi', 'de', 'fr']
  }
  const ids = ['name', 'languages', 'sector', 'contact', 'email']
  const answers = answersOf(normalized, typed, ids)
  assert.deepEqual(answers.languages, ['en', 'vi', 'de', 'fr'], 'the normalizer’s four, not the six typed')
  assert.equal(answers.name, 'Lantern Bookshop')
  assert.equal(answers.sector, 'other', 'the other questions still go as typed')
  const { engine, runner } = make()
  const { ctx } = context({
    brief: { about: 'An independent bookshop.', goal: null, style: null, answers: typed },
    normalized
  })
  await engine.prepare(ctx)
  const sent = JSON.parse(runner.calls[0].args[runner.calls[0].args.indexOf('--answers-json') + 1])
  assert.deepEqual(
    sent.languages,
    ctx.normalized.languages,
    'the tool writes the languages the menus were planned for'
  )
})

test('the template’s tool and seed are found for the three templates that ship one, and for no other', () => {
  for (const id of ['tracy-business', 'tracy-saas', 'tracy-base']) {
    const found = emdashToolFor(`${id}/emdash-0.x`)
    assert.ok(found && existsSync(found.tool) && existsSync(path.join(found.seedDir, 'seed.json')), id)
  }
  assert.equal(emdashToolFor('some-packed/emdash-0.x'), null)
  assert.equal(emdashToolFor(null), null)
})

test('prepare asks the tool its questions against a stand-in, with an environment of its own and no secret of ours', async () => {
  const { engine, runner, workRoot } = make()
  const { ctx, times, notes } = context()
  const prepared = await engine.prepare(ctx)
  assert.equal(runner.calls.length, 1, 'one run before the site exists')
  const [warm] = runner.calls
  assert.ok(warm.args[0] === '--import' && warm.args[1].endsWith('emdash-preload.mjs'))
  assert.equal(warm.args[warm.args.indexOf('--site') + 1], 'http://emdash-warmup.invalid')
  assert.ok(warm.args.includes('--hide-chrome-only'))
  assert.ok(!warm.args.includes('--concurrency'), 'the warm-up has no real site to be gentle with')
  assert.deepEqual(
    JSON.parse(warm.args[warm.args.indexOf('--answers-json') + 1]).email,
    'hello@goldencrust.vn'
  )
  assert.equal(warm.env.TRACY_FETCH_MODE, 'record')
  assert.equal(warm.env.TRACY_MODEL_URL, 'https://api.deepseek.com/chat/completions')
  assert.equal(warm.env.TRACY_MODEL_KEY, 'sk-secret-text')
  assert.equal(warm.env.OPENROUTER_API_KEY, 'sk-or-secret')
  assert.deepEqual(
    Object.keys(warm.env).filter((k) => /SESSION|DATABASE|SECRET|POSTGRES/.test(k)),
    [],
    'nothing of this process’s own'
  )
  assert.equal(runner.files[0].token, 'ec_pat_warmup0000000000000000000000')
  assert.equal(prepared.warmed, true)
  assert.equal(times.modelCalls, 41)
  assert.ok('warmMs' in times)
  assert.deepEqual(notes, [])
  assert.ok(
    readdirSync(workRoot).some((n) => n.startsWith('tracy-emdash-')),
    'the run’s folder is kept until it is disposed of'
  )
})

test('apply runs the same tool against the real site, from the answers written down, hiding languages by their chrome entry', async () => {
  const { engine, runner, workRoot } = make()
  const { ctx, times, notes } = context()
  const prepared = await engine.prepare(ctx)
  const report = await engine.apply(ctx, prepared)
  assert.equal(runner.calls.length, 2)
  const [warm, real] = runner.calls
  assert.equal(real.args[real.args.indexOf('--site') + 1], 'http://golden-crust-web-1:4321')
  assert.equal(
    runner.files[1].token,
    'ec_pat_realtoken00000000000000000000',
    'the real run holds the site’s own token'
  )
  assert.equal(real.env.TRACY_FETCH_MODE, 'replay')
  assert.equal(real.env.TRACY_FETCH_CACHE, warm.env.TRACY_FETCH_CACHE, 'it reads what the warm-up wrote')
  assert.equal(real.env.TRACY_FETCH_SITE, 'http://golden-crust-web-1:4321')
  assert.ok(real.args.includes('--hide-chrome-only'))
  assert.equal(real.args[real.args.indexOf('--concurrency') + 1], '8')
  assert.equal(
    real.args[real.args.indexOf('--answers-json') + 1],
    warm.args[warm.args.indexOf('--answers-json') + 1],
    'the same questions'
  )
  assert.notEqual(
    real.args[real.args.indexOf('--receipts') + 1],
    warm.args[warm.args.indexOf('--receipts') + 1],
    'the warm-up’s notes are not the real run’s: a repeat would write nothing'
  )
  assert.deepEqual(report, { wrote: 2, kept: 0 })
  assert.deepEqual([times.replayHits, times.replayMisses], [41, 0])
  assert.ok('toolMs' in times)
  assert.deepEqual(notes, [])
  await engine.dispose(prepared)
  assert.deepEqual(
    readdirSync(workRoot).filter((n) => n.startsWith('tracy-emdash-')),
    [],
    'the folder, token and all, is gone'
  )
})

test('no text model: the tool still writes what the customer gave, with no warm-up, no model and no pictures', async () => {
  const { engine, runner } = make({ models: { textDoor: null, image: null } })
  const { ctx, notes } = context()
  const prepared = await engine.prepare(ctx)
  assert.equal(runner.calls.length, 0)
  await engine.apply(ctx, prepared)
  const [real] = runner.calls
  assert.ok(real.args.includes('--no-model') && real.args.includes('--no-images'))
  assert.ok(!real.args.includes('--import'), 'no model call to answer from memory')
  assert.ok(
    notes.some((n) => /no text model/.test(n)),
    notes.join(' | ')
  )
})

test('pictures are drawn only through a door the tool knows (OpenRouter); any other keeps the template’s own and says so', async () => {
  const other = { url: 'https://images.example/v1/chat/completions', key: 'k', imageModel: 'm' }
  const { engine, runner } = make({ models: { image: other } })
  const { ctx, notes } = context()
  await engine.prepare(ctx)
  assert.ok(runner.calls[0].args.includes('--no-images'))
  assert.equal(runner.calls[0].env.OPENROUTER_API_KEY, undefined)
  assert.ok(
    notes.some((n) => /no picture model/.test(n)),
    notes.join(' | ')
  )
  const withPictures = make()
  await withPictures.engine.prepare(context().ctx)
  assert.ok(!withPictures.runner.calls[0].args.includes('--no-images'))
})

test('a warm-up that fails or is cut short costs time and not words: the real run asks the model itself', async () => {
  for (const warm of [
    { code: 1, stderr: 'boom: no such seed' },
    { code: 143, killed: true, stderr: '' }
  ]) {
    const { engine, runner } = make({ runner: fakeRun({ warm }) })
    const { ctx, notes } = context()
    const prepared = await engine.prepare(ctx)
    assert.equal(prepared.warmed, false)
    assert.ok(notes.length === 1, notes.join(' | '))
    assert.deepEqual(await engine.apply(ctx, prepared), { wrote: 2, kept: 0 })
    assert.equal(runner.calls.length, 2)
  }
})

test('what the tool could not do is said: refused writes, copy it could not write, pictures it could not place', async () => {
  const report = {
    written: [{ entry: 'a' }],
    errors: [{ rule: 'x' }, { rule: 'y' }],
    copy: { done: [], skipped: [{}, {}, {}] },
    pictures: { done: 1, skipped: [{}] },
    skipped: [{ rule: 'language', why: 'this template ships en, ru, not sw: the words were written in en' }]
  }
  const { engine } = make({ runner: fakeRun({ real: { code: 4, report } }) })
  const { ctx, notes } = context()
  const result = await engine.apply(ctx, await engine.prepare(ctx))
  assert.deepEqual(result, { wrote: 1, kept: 5 })
  assert.deepEqual(
    notes.sort(),
    [
      '1 picture(s) could not be placed, so the template keeps its own',
      '2 write(s) were refused by the site and keep the template’s words',
      '3 line(s) of text could not be written and keep the template’s words',
      'this template ships en, ru, not sw: the words were written in en'
    ].sort()
  )
})

test('a tool that gave no report, or was cut short, is a failure said in plain words', async () => {
  const none = make({ runner: fakeRun({ real: { code: 1, stdout: '', stderr: 'no agent token at x' } }) })
  const { ctx } = context()
  await assert.rejects(
    none.engine.apply(ctx, await none.engine.prepare(ctx)),
    /no report \(exit 1\): no agent token at x/
  )
  const slow = make({ runner: fakeRun({ real: { code: 143, killed: true, stdout: '' } }) })
  await assert.rejects(slow.engine.apply(ctx, await slow.engine.prepare(ctx)), /took too long/)
})

test('a template that ships no tool keeps its words, and prepare says so', async () => {
  const { engine } = make()
  await assert.rejects(
    engine.prepare(context({ quickstart: 'some-packed/emdash-0.x' }).ctx),
    /ships no personalize tool/
  )
})

test('a run’s folder that outlived its process is cleared when the engine is made; a recent one is left', () => {
  const workRoot = root()
  const old = path.join(workRoot, 'tracy-emdash-old')
  const recent = path.join(workRoot, 'tracy-emdash-recent')
  for (const d of [old, recent]) mkdirSync(d)
  const longAgo = new Date(Date.now() - 4 * 60 * 60_000)
  utimesSync(old, longAgo, longAgo)
  createEmdashEngine({ models: async () => ({}), siteAccess: async () => ({}), workRoot })
  assert.ok(!existsSync(old) && existsSync(recent))
})

// ── The real tool, the real runner, the template's own mock of the EmDash admin API ──────────────────────────────

test('end to end with the real tool: the words are asked for before the site exists, and the site is written without asking again', async () => {
  const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const mock = createMockEmdash()
  for (const coll of ['site', 'home', 'about', 'contact', 'services_page'])
    for (const e of seed.content[coll]) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  let asked = 0
  const model = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    asked += 1
    const user = JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages[1].content)
    const say = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }))
    }
    if (Array.isArray(user.rows))
      return say({
        rows: user.rows.map((row, i) => Object.fromEntries(Object.keys(row).map((k) => [k, `${k} ${i}`])))
      })
    if (Array.isArray(user.terms))
      return say(Object.fromEntries(user.terms.map((t) => [t.slug, `L ${t.slug}`])))
    if (Array.isArray(user.fields) && user.fields[0]?.name !== undefined)
      return say(Object.fromEntries(user.fields.map((f) => [f.name, { label: `F ${f.name}` }])))
    // Every field an entry is asked for is answered, a list in its length (the engine names whatever is not, g60).
    if (Array.isArray(user.entries))
      return say(
        Object.fromEntries(
          user.entries.map((e) => [
            e.key,
            {
              title: `Bake ${e.key}`,
              ...Object.fromEntries(
                Object.entries(e.example ?? {}).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v.map((_, i) => `Bake ${k} ${i}`) : `Bake ${k} ${e.key}`
                ])
              )
            }
          ])
        )
      )
    // A body asked again on its own, its parts counted (`rewriteBody`, g60).
    if (Array.isArray(user.parts)) return say({ body: user.parts.map((p) => `Part ${p.part}`) })
    return say(Object.fromEntries(user.fields.map((f) => [f.key, `Fresh ${f.key.split('.').pop()}`])))
  })
  const modelBase = await new Promise((resolve) =>
    model.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${model.address().port}/v1`))
  )
  const site = await mock.listen()
  const workRoot = root()
  const engine = createEmdashEngine({
    models: async () => ({ textDoor: { apiKey: 'k', baseUrl: modelBase, words: 'm' }, image: null }),
    siteAccess: async () => ({ origin: site, token: 'ec_pat_0123456789abcdef0123456789abcdef' }),
    workRoot,
    log: quiet
  })
  try {
    const { ctx, notes } = context()
    const prepared = await engine.prepare(ctx)
    const askedBeforeTheSite = asked
    assert.ok(askedBeforeTheSite > 10, `the model was asked while there was no site: ${askedBeforeTheSite}`)
    assert.equal(mock.state.log.length, 0, 'and the site was not touched')
    const report = await engine.apply(ctx, prepared)
    assert.equal(asked, askedBeforeTheSite, 'the site was written without asking the model again')
    assert.ok(report.wrote >= 3, JSON.stringify(report))
    const home = [...mock.state.entries.values()].find((e) => e.collection === 'home' && e.locale === 'en')
    assert.match(JSON.stringify(home.live), /Golden Crust Bakery/, 'the customer’s name is on the page')
    assert.match(JSON.stringify(home.live), /Fresh /, 'and the model’s words, written ahead')
    const chrome = [...mock.state.entries.values()].find((e) => e.collection === 'site' && e.locale === 'en')
    assert.equal(chrome.live.hotline, '+84 24 3555 0144', 'a phone the customer gave')
    assert.equal(chrome.live.footer_legal_1, '', 'the demo registration numbers are gone')
    const hiddenChrome = [...mock.state.entries.values()].filter(
      (e) => e.collection === 'site' && e.locale !== 'en'
    )
    assert.ok(
      hiddenChrome.length > 0 && hiddenChrome.every((e) => e.status === 'draft'),
      'the other languages are hidden by their chrome entry'
    )
    assert.deepEqual(
      notes.filter((n) => !/no picture model/.test(n)),
      []
    )
    await engine.dispose(prepared)
    assert.deepEqual(
      readdirSync(workRoot).filter((n) => n.startsWith('tracy-emdash-')),
      []
    )
  } finally {
    await mock.close()
    await new Promise((resolve) => model.close(resolve))
  }
})

test('end to end with the real tool: the language the root is written in reaches the site as the tag it prints (#1013)', async () => {
  // The tool decides `<html lang>` (`display-locale.json`, read by the template from its own data folder), but Apply runs it
  // from a scratch folder of this process: the decision has to be handed to the site's host, or the page says `en`.
  const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const mock = createMockEmdash()
  for (const coll of ['site', 'home', 'about', 'contact', 'services_page'])
    for (const e of seed.content[coll]) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  const site = await mock.listen()
  const delivered = []
  const engine = createEmdashEngine({
    models: async () => ({ textDoor: null, image: null }),
    siteAccess: async () => ({ origin: site, token: 'ec_pat_0123456789abcdef0123456789abcdef' }),
    displayLocale: async (siteKey, locales) => {
      delivered.push({ siteKey, locales })
    },
    workRoot: root(),
    log: quiet
  })
  try {
    const { ctx, notes } = context({
      normalized: { ...context().ctx.normalized, languages: ['vi-vn'] }
    })
    const prepared = await engine.prepare(ctx)
    await engine.apply(ctx, prepared)
    assert.deepEqual(
      delivered,
      [{ siteKey: 'bakery.tracy.test', locales: { en: 'vi-VN' } }],
      notes.join(' | ')
    )
    await engine.dispose(prepared)
  } finally {
    await mock.close()
  }
})

test('a site whose host cannot take the language tag keeps its words, and says so', async () => {
  const report = { displayLocale: { en: 'vi-VN' } }
  const workRoot = root()
  const runner = fakeRun({ real: { report } })
  const engine = createEmdashEngine({
    models: async () => ({ textDoor: null, image: null }),
    siteAccess: async () => ({
      origin: 'http://golden-crust-web-1:4321',
      token: 'ec_pat_realtoken00000000000000000000'
    }),
    displayLocale: async () => {
      throw new Error('the host answered 404')
    },
    run: runner.run,
    workRoot,
    log: quiet
  })
  const { ctx, notes } = context()
  const result = await engine.apply(ctx, await engine.prepare(ctx))
  assert.deepEqual(result, { wrote: 2, kept: 0 })
  assert.ok(
    notes.some((n) => /vi-VN/.test(n) && /404/.test(n)),
    notes.join(' | ')
  )
})

test('T23 end to end with the real tool: News unticked on Tracy Business is off the site and out of its menu, Home stays', async () => {
  const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const mock = createMockEmdash()
  for (const coll of ['site', 'home', 'about', 'news_page', 'contact'])
    for (const e of seed.content[coll]) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  for (const item of seed.menus.find((m) => m.name === 'primary' && m.locale === 'en').items)
    mock.state.addMenuItem('primary', 'en', item.label, item.url)
  const site = await mock.listen()
  const engine = createEmdashEngine({
    models: async () => ({}),
    siteAccess: async () => ({ origin: site, token: 'ec_pat_0123456789abcdef0123456789abcdef' }),
    workRoot: root(),
    log: quiet
  })
  try {
    const all = [
      { id: 'home', label: 'Home', home: true },
      { id: 'about', label: 'About' },
      { id: 'services', label: 'Services' },
      { id: 'projects', label: 'Projects' },
      { id: 'news', label: 'News' },
      { id: 'contact', label: 'Contact' }
    ]
    const { ctx } = context({
      brief: { about: '', answers: [], pages: { all, picked: ['about', 'services', 'projects', 'contact'] } }
    })
    const prepared = await engine.prepare(ctx)
    await engine.apply(ctx, prepared)
    const entry = (c) => [...mock.state.entries.values()].find((e) => e.collection === c && e.locale === 'en')
    assert.equal(entry('news_page').status, 'draft', 'the News page is unpublished')
    assert.equal(entry('home').status, 'published')
    assert.equal(entry('about').status, 'published')
    const menu = [...mock.state.menuItems.values()].filter((i) => i.menu === 'primary' && i.locale === 'en')
    assert.deepEqual(
      menu.map((i) => i.label),
      ['Home', 'About', 'Services', 'Projects', 'Contact'],
      'and its menu item is gone'
    )
    await engine.dispose(prepared)
  } finally {
    await mock.close()
  }
})

/**
 * A site of the template, as first-run setup leaves it, in two of its languages: the chrome, the contact page and the
 * template's forms, each mailing the demo company's sales desk — and one form the template's map does not name.
 */
async function formsSite() {
  const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const mock = createMockEmdash()
  for (const coll of ['site', 'contact'])
    for (const e of seed.content[coll])
      if (['en', 'ru'].includes(e.locale)) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  for (const slug of [
    'quote-request-en',
    'newsletter-en',
    'quote-request-ru',
    'newsletter-ru',
    'event-signup-en'
  ])
    mock.state.forms.set(`form-${slug}`, {
      id: `form-${slug}`,
      name: slug,
      slug,
      pages: [{ fields: [{ name: 'email', type: 'email', label: 'Email' }] }],
      settings: { confirmationMessage: 'Thank you.', notifyEmails: ['sales@demo-company.example'] }
    })
  return mock
}

test('no email typed: the forms mail the person who pressed Apply, an address no page shows; a typed email still wins', async () => {
  for (const [contact, mailbox] of [
    ['+44 20 7946 0321', 'owner@lantern.example'],
    ['+44 20 7946 0321 · shop@lantern.example', 'shop@lantern.example']
  ]) {
    const mock = await formsSite()
    const site = await mock.listen()
    const engine = createEmdashEngine({
      models: async () => ({ textDoor: null, image: null }),
      siteAccess: async () => ({ origin: site, token: 'ec_pat_0123456789abcdef0123456789abcdef' }),
      workRoot: root(),
      log: quiet
    })
    try {
      const { ctx } = context({
        email: 'owner@lantern.example',
        normalized: {
          name: 'Lantern Bookshop',
          about: 'An independent bookshop.',
          contact,
          languages: ['en']
        }
      })
      const prepared = await engine.prepare(ctx)
      await engine.apply(ctx, prepared)
      await engine.dispose(prepared)
      const notify = (slug) => mock.state.forms.get(`form-${slug}`).settings.notifyEmails
      assert.deepEqual(notify('quote-request-en'), [mailbox], `${contact}: the enquiry form`)
      assert.deepEqual(notify('newsletter-en'), [mailbox], `${contact}: the newsletter signup`)
      assert.equal(
        mock.state.forms.get('form-quote-request-en').settings.confirmationMessage,
        'Thank you.',
        'the rest of the form’s settings stay'
      )
      if (mailbox === 'owner@lantern.example') {
        // Decision (05/10/2026): every form of the map, hidden languages too, so none mails the demo company's domain
        // when a language is switched on later. Written by the engine with the settings alone: the forms door merges.
        assert.deepEqual(notify('quote-request-ru'), [mailbox], 'a hidden language’s enquiry form too')
        assert.deepEqual(notify('newsletter-ru'), [mailbox], 'and its newsletter signup')
        const updates = mock.state.log.filter((l) =>
          l.path.startsWith('/_emdash/api/plugins/emdash-forms/forms/update')
        )
        assert.equal(updates.length, 4)
        assert.ok(
          updates.every((u) => !('pages' in u.body) && u.body.settings.notifyEmails[0] === mailbox),
          'the recipient alone is written, never the pages'
        )
      }
      assert.deepEqual(
        notify('event-signup-en'),
        ['sales@demo-company.example'],
        'a form the map does not name is left'
      )
      // The account's address is a recipient, never a line on the site.
      const shown = JSON.stringify([...mock.state.entries.values()].map((e) => [e.live, e.draft]))
      assert.ok(!shown.includes('owner@lantern.example'), `${contact}: no page shows the account's address`)
    } finally {
      await mock.close()
    }
  }
})

test('an email the tool would not take ("n/a", a phone typed in its box) is no email: the forms mail the account, whose address never reaches the tool', async () => {
  const ids = templateQuestionIds(path.join(THEME, 'seed'))
  assert.ok(ids.includes('email'), 'the template asks for an email')
  for (const junk of ['n/a', '0912 345 678']) {
    const mock = await formsSite()
    const site = await mock.listen()
    /** @type {string[][]} */
    const toolArgs = []
    const engine = createEmdashEngine({
      models: async () => ({ textDoor: null, image: null }),
      siteAccess: async () => ({ origin: site, token: 'ec_pat_0123456789abcdef0123456789abcdef' }),
      run: (call) => {
        toolArgs.push(call.args)
        return runNode(call)
      },
      workRoot: root(),
      log: quiet
    })
    try {
      const { ctx } = context({
        email: 'owner@lantern.example',
        brief: {
          about: 'An independent bookshop.',
          goal: null,
          style: null,
          answers: [{ id: 'email', kind: 'text', feeds: ['agent'], label: 'Contact email', value: junk }]
        },
        normalized: {
          name: 'Lantern Bookshop',
          about: 'An independent bookshop.',
          contact: '+44 20 7946 0321',
          languages: ['en']
        }
      })
      const prepared = await engine.prepare(ctx)
      await engine.apply(ctx, prepared)
      await engine.dispose(prepared)
      const notify = (slug) => mock.state.forms.get(`form-${slug}`).settings.notifyEmails
      assert.deepEqual(notify('quote-request-en'), ['owner@lantern.example'], `${junk}: the enquiry form`)
      assert.deepEqual(notify('newsletter-en'), ['owner@lantern.example'], `${junk}: the newsletter signup`)
      assert.ok(toolArgs.length > 0)
      for (const args of toolArgs)
        assert.ok(
          !args[args.indexOf('--answers-json') + 1].includes('owner@lantern.example'),
          `${junk}: the account's address is not one of the tool's answers`
        )
    } finally {
      await mock.close()
    }
  }
})

test('a language nobody chose comes off entry by entry, so no page names it in its hreflang links nor EmDash in its sitemap', async () => {
  // Measured 05/10/2026 (ledger L18): after an Apply in two of the 40 shipped languages, every content page still declared
  // 41 alternates, because a page names each PUBLISHED translation of itself and only the chrome entry was unpublished;
  // the alternates of inner pages ended in 404 (78 dead links on a 65-page crawl).
  const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const mock = createMockEmdash()
  for (const coll of ['site', 'home', 'about', 'contact', 'services'])
    for (const e of seed.content[coll])
      if (['en', 'vi', 'de', 'ru'].includes(e.locale)) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  const site = await mock.listen()
  const engine = createEmdashEngine({
    models: async () => ({ textDoor: null, image: null }),
    siteAccess: async () => ({ origin: site, token: 'ec_pat_0123456789abcdef0123456789abcdef' }),
    workRoot: root(),
    log: quiet
  })
  try {
    const { ctx } = context({
      normalized: {
        name: 'Lantern Bookshop',
        about: 'An independent bookshop.',
        contact: '+44 20 7946 0321 · shop@lantern.example',
        languages: ['en', 'vi']
      }
    })
    const prepared = await engine.prepare(ctx)
    await engine.apply(ctx, prepared)
    await engine.dispose(prepared)
    const live = (locale) =>
      [...mock.state.entries.values()]
        .filter((e) => e.locale === locale && e.status === 'published')
        .map((e) => `${e.collection}/${e.slug}`)
    assert.deepEqual([...live('de'), ...live('ru')], [], 'every entry of a hidden language is off the site')
    for (const locale of ['en', 'vi'])
      assert.ok(live(locale).includes('home/home') && live(locale).includes('about/about'), locale)
  } finally {
    await mock.close()
  }
})

test('the clean-up outlives the run: the run’s signal is aborted as it ends, before its end waits for the clean-up', async () => {
  // Measured 05/10/2026 on the PR head image: `brief-build` aborts the run's signal in its `finally`, then calls `dispose`;
  // a clean-up made on that signal logged "0 unpublished, 39 failed" on every EmDash Apply.
  const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const mock = createMockEmdash()
  for (const coll of ['site', 'home', 'about', 'contact', 'services'])
    for (const e of seed.content[coll])
      if (['en', 'de'].includes(e.locale)) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  const site = await mock.listen()
  const lines = []
  const engine = createEmdashEngine({
    models: async () => ({ textDoor: null, image: null }),
    siteAccess: async () => ({ origin: site, token: 'ec_pat_0123456789abcdef0123456789abcdef' }),
    workRoot: root(),
    log: { info: (line) => lines.push(line), warn: (line) => lines.push(line) }
  })
  try {
    const run = new AbortController()
    const { ctx } = context({ signal: run.signal })
    const prepared = await engine.prepare(ctx)
    await engine.apply(ctx, prepared)
    run.abort(new Error('the run is over'))
    await engine.dispose(prepared)
    const live = [...mock.state.entries.values()].filter((e) => e.locale === 'de' && e.status === 'published')
    assert.deepEqual(
      live.map((e) => `${e.collection}/${e.slug}`),
      [],
      'every German entry is off the site'
    )
    assert.ok(
      lines.some((line) => / 0 failed, 0 not reached/.test(line)),
      lines.join('\n')
    )
  } finally {
    await mock.close()
  }
})

test('the customer is not kept waiting for it: Apply hands the site over first, and the run’s end waits for the rest', async () => {
  let release = () => {}
  const held = new Promise((resolve) => {
    release = resolve
  })
  /** @type {Array<[string, string]>} */
  const calls = []
  const fetchImpl = async (url, init) => {
    const route = new URL(url).pathname
    calls.push([init.method, route])
    if (init.method === 'POST' && route.endsWith('/unpublish')) await held
    const [, , , , collection, slug] = route.split('/')
    // The tool hid the chrome entry; everything else of the language is still published.
    const status = collection === 'site' ? 'draft' : 'published'
    const data = init.method === 'GET' ? { item: { id: `${collection}-${slug}`, status } } : {}
    return new Response(JSON.stringify({ success: true, data }), { status: 200 })
  }
  const runner = fakeRun({
    real: { report: { language: { write: ['en'], hidden: ['de'], unpublished: 1 } } }
  })
  const { engine } = make({ runner, fetchImpl })
  const { ctx } = context()
  const prepared = await engine.prepare(ctx)
  // Every unpublish is held: an Apply that waited for them would never return.
  await engine.apply(ctx, prepared)
  const unpublished = () => calls.filter(([m, r]) => m === 'POST' && r.endsWith('/unpublish'))
  await until(() => unpublished().length > 0, 'the hiding begins after Apply returned')
  let disposed = false
  const disposing = engine.dispose(prepared).then(() => {
    disposed = true
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(disposed, false, 'the run’s end waits for it')
  release()
  await disposing
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const german = Object.entries(seed.content).flatMap(([collection, rows]) =>
    collection === 'site' ? [] : rows.filter((e) => e.locale === 'de').map((e) => `${collection}/${e.slug}`)
  )
  assert.equal(unpublished().length, german.length, 'every German entry but the chrome the tool already hid')
  assert.ok(
    !calls.some(([m, r]) => m === 'POST' && r.startsWith('/_emdash/api/content/site/')),
    'the chrome entry is the tool’s: read, never unpublished here'
  )
})

test('what the clean-up did is counted, and said in one line per site when the run ends', async () => {
  const seedDir = path.join(THEME, 'seed')
  const seed = JSON.parse(readFileSync(path.join(seedDir, 'seed.json'), 'utf8'))
  const german = Object.entries(seed.content).flatMap(([collection, rows]) =>
    collection === 'site'
      ? []
      : rows.filter((e) => e.locale === 'de').map((e) => ({ collection, slug: e.slug }))
  )
  const refused = `/_emdash/api/content/${german[0].collection}/${german[0].collection}-${german[0].slug}/unpublish`
  const api = async (/** @type {string} */ method, /** @type {string} */ route) => {
    const url = new URL(route, 'http://site.test')
    const [, , , , collection, slug] = url.pathname.split('/')
    if (method === 'GET')
      return {
        item: {
          id: `${collection}-${slug}`,
          status: collection === 'site' && url.searchParams.get('locale') === 'de' ? 'draft' : 'published'
        }
      }
    if (url.pathname === refused) throw Object.assign(new Error('POST -> 500'), { status: 500 })
    return {}
  }
  assert.deepEqual(await hideRest({ api, seedDir, hidden: ['de', 'fr'] }), {
    unpublished: german.length - 1,
    failed: 1,
    notReached: 0,
    served: ['fr']
  })
  assert.deepEqual(
    await hideRest({ api, seedDir, hidden: ['de'], deadlineAt: Date.now() - 1 }),
    { unpublished: 0, failed: 0, notReached: german.length, served: [] },
    'rows not started before the deadline are counted, not lost'
  )

  /** @type {string[]} */
  const lines = []
  const log = { info: (line) => lines.push(`info ${line}`), warn: (line) => lines.push(`warn ${line}`) }
  const fetchImpl = async (url, init) => {
    const route = new URL(url).pathname + new URL(url).search
    try {
      const data = await api(init.method, route)
      return new Response(JSON.stringify({ success: true, data }), { status: 200 })
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: { message: error.message } }), {
        status: error.status
      })
    }
  }
  const runner = fakeRun({
    real: { report: { language: { write: ['en'], hidden: ['de'], unpublished: 1 } } }
  })
  const { engine } = make({ runner, fetchImpl, log })
  const { ctx } = context()
  const prepared = await engine.prepare(ctx)
  await engine.apply(ctx, prepared)
  assert.deepEqual(lines, [], 'nothing is said before the run ends')
  await engine.dispose(prepared)
  assert.equal(lines.length, 1, lines.join(' | '))
  assert.match(lines[0], /^warn /, 'a failure makes it a warning')
  assert.ok(lines[0].includes('bakery.tracy.test'), 'it names the site')
  assert.ok(lines[0].includes(`${german.length - 1} unpublished`), lines[0])
  assert.ok(lines[0].includes('1 failed') && lines[0].includes('0 not reached'), lines[0])
})

test('a hidden language whose chrome entry is still published is left whole: the tool did not hide it, or someone switched it back on', async () => {
  /** @type {Array<[string, string]>} */
  const calls = []
  const api = async (/** @type {string} */ method, /** @type {string} */ route) => {
    calls.push([method, route])
    const url = new URL(route, 'http://site.test')
    const [, , , , collection, slug] = url.pathname.split('/')
    const locale = url.searchParams.get('locale')
    if (method !== 'GET') return {}
    // German's chrome entry is published (served); French's is hidden.
    const status = collection === 'site' && locale === 'fr' ? 'draft' : 'published'
    return { item: { id: `${collection}-${slug}-${locale}`, status } }
  }
  await hideRest({ api, seedDir: path.join(THEME, 'seed'), hidden: ['de', 'fr'] })
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const french = Object.entries(seed.content).flatMap(([collection, rows]) =>
    collection === 'site' ? [] : rows.filter((e) => e.locale === 'fr')
  )
  const posts = calls.filter(([m]) => m === 'POST')
  assert.equal(posts.length, french.length, 'every French entry but its chrome comes off')
  assert.ok(
    posts.every(([, r]) => r.endsWith('locale=fr')),
    'no German entry is unpublished'
  )
  assert.deepEqual(
    calls.filter(([, r]) => r.endsWith('locale=de')).map(([m, r]) => `${m} ${r}`),
    ['GET /_emdash/api/content/site/site?locale=de'],
    'German is asked about once, by its chrome entry'
  )
})

// ── The labels of the menus: the template's own services in the footer become the customer's ────────────────────
const THEME_SEED = path.join(THEME, 'seed')
const BAKERY = {
  name: 'Golden Crust Bakery',
  about: 'A family bakery in Hanoi selling sourdough, croissants and cakes.',
  sector: 'bakery'
}
const modelSaying = (answer, asked = []) => ({ chat: async (call) => (asked.push(call), answer) })

test('the menus a template ships are read in the languages asked for, the default always among them', () => {
  const en = seedMenus(THEME_SEED, [])
  assert.deepEqual(
    en.filter((m) => m.name === 'footer_services').map((m) => [m.locale, m.labels]),
    [
      [
        'en',
        [
          'Industrial park infrastructure',
          'Pre-engineered buildings',
          'M&E engineering',
          'Maintenance & retrofit'
        ]
      ]
    ]
  )
  const both = seedMenus(THEME_SEED, ['en', 'vi-VN'])
  assert.deepEqual([...new Set(both.map((m) => m.locale))].sort(), ['en', 'vi'])
  assert.equal(
    both.some((m) => 'language' in m),
    false,
    'two languages keep two editions, each in its own'
  )
  assert.deepEqual(seedMenus(THEME_SEED, ['en', 'en-GB']), en, 'a language already there adds nothing')
})

// 🔒 ONE LANGUAGE THAT IS NOT THE ROOT'S IS WRITTEN INTO THE ROOT (TCH #1013, O2): the tool writes the default locale's
// entries in it and hides every other locale, so the labels are planned for the default locale's menus, in that language.
// Planned in English, a bakery written in Vietnamese read "Breads · Baked Goods" in its menu (measured 08/10/2026, tamq-7q-edvi).
test('one language other than the root’s: the root’s menus are planned, in that language', async () => {
  const menus = seedMenus(THEME_SEED, ['vi-VN'])
  assert.deepEqual([...new Set(menus.map((m) => m.locale))], ['en'])
  assert.ok(menus.every((m) => m.language === 'vi'))
  const asked = []
  await planMenuLabels({ model: modelSaying('{"relabel": []}', asked), business: BAKERY, menus })
  assert.match(asked[0].messages[0].content, /`language`/)
  assert.ok(JSON.parse(asked[0].messages[1].content).menus.every((m) => m.language === 'vi'))
})

// 🔒 SEVERAL LANGUAGES, NONE THE ROOT'S (TCH #1013, D2; `localesFrom`): the root is written in the first, its own edition is
// hidden, and the others keep theirs. Only the root's menus carry the language they are written in.
test('several languages, none the root’s: the root’s menus in the first one, the others in their own editions', () => {
  const menus = seedMenus(THEME_SEED, ['vi-VN', 'ru'])
  assert.deepEqual([...new Set(menus.map((m) => m.locale))].sort(), ['en', 'ru'])
  assert.ok(menus.filter((m) => m.locale === 'en').every((m) => m.language === 'vi'))
  assert.equal(
    menus.some((m) => m.locale === 'ru' && 'language' in m),
    false
  )
})

// 🔒 A LABEL IS RENAMED, ITS ADDRESS NEVER IS (TCH #1013, PAGE-5, K3). Measured 10/10/2026 on dev (g55-biz-emd-full,
// Tracy Business 1.7.4): the Resources menu read "Bánh mì", "Sourdough", "Freshly baked", "Dubai" and still opened
// /kit/newsletter, /kit/email, /kit/slides and /404. The sample pages keep the template's content (K3) and the error page
// is no page of the business, so an item leading to one keeps its template label: it is never put to the planner.
test('items that lead to a sample page or an error page are never planned: their label is what the page is', () => {
  const asOne = (menus) => menus.flatMap((m) => m.labels.map((l) => `${m.name}/${m.locale}/${l}`))
  for (const languages of [[], ['vi-VN'], ['en', 'vi-VN']]) {
    const planned = asOne(seedMenus(THEME_SEED, languages))
    assert.equal(
      planned.filter((l) => l.startsWith('resources_kit/')).length,
      0,
      `no Resources kit label is planned (${languages.join(',') || 'default'}): ${planned.join(' | ')}`
    )
    assert.ok(
      planned.includes(`footer_services/en/Industrial park infrastructure`),
      'the services are still planned'
    )
  }
})

// 🔒 A LABEL STILL NAMES ITS PAGE (TCH #1013, PAGE-5). Measured 10/10/2026 on dev (g56-biz-emd-full, Tracy Business 1.7.4): the
// topbar link to /investors, a page still titled "Investor relations" (translated, never rewritten for the business), read
// "Gia đình" (family); and 11/10/2026 (g58-biz-emd-full, 1.7.5) the topbar link to /careers read "Đặt bánh" (order a cake)
// while the footer named it "Tuyển dụng" (careers). An item whose label names the page it opens (its breadcrumb or title:
// "Careers", "About" of "About us") keeps the template's label, which the tool translates, even when the page's heading is
// written for the business. An item whose label names something else (a demo service leading to /services) is planned.
test('items whose label names the page they open are never planned, even a page whose heading is written for the business', () => {
  const asOne = (menus) => menus.flatMap((m) => m.labels.map((l) => `${m.name}/${l}`))
  for (const languages of [[], ['vi-VN']]) {
    const planned = asOne(seedMenus(THEME_SEED, languages).filter((m) => m.locale === 'en'))
    for (const kept of [
      'topbar/Investors',
      'topbar/Careers',
      'footer_company/Investor relations',
      'footer_company/Careers',
      'primary/About'
    ])
      assert.equal(planned.includes(kept), false, `${kept} is not planned: ${planned.join(' | ')}`)
    assert.ok(
      planned.includes('footer_services/Industrial park infrastructure'),
      `a demo service is still planned: ${planned.join(' | ')}`
    )
  }
})

// 🔒 A SITE WRITTEN IN ONE LANGUAGE GETS ITS MENU LABELS IN IT (TCH #1013, LANG-2). Measured 10/10/2026 on dev
// (g55-biz-emd-full): the Vietnamese site's footer read "Sourdough", "Vietnamese bread", "Freshly baked", "Family bakery",
// English words lifted from the owner's description and the sector, beside "Bánh mì". A label that only repeats English
// words of the description is asked for again in the site's language, and dropped if it comes back the same (the item
// keeps its seed label, which the tool then translates).
test('a label copied in English from the description is asked again in the site’s language, then dropped', async () => {
  const menus = [
    {
      name: 'footer_services',
      locale: 'en',
      language: 'vi',
      labels: ['Industrial park infrastructure', 'Pre-engineered buildings', 'M&E engineering']
    }
  ]
  const business = {
    name: 'Tamarind & Co',
    about: 'A family bakery in Dubai baking sourdough and Vietnamese bread freshly every morning.',
    sector: 'family bakery'
  }
  const row = (from, to) => ({ menu: 'footer_services', locale: 'en', from, to })
  const answers = [
    JSON.stringify({
      relabel: [
        row('Industrial park infrastructure', 'Bánh mì'),
        row('Pre-engineered buildings', 'Vietnamese bread'),
        row('M&E engineering', 'Family bakery')
      ]
    }),
    JSON.stringify({
      relabel: [row('Pre-engineered buildings', 'Bánh mì Việt'), row('M&E engineering', 'Family bakery')]
    })
  ]
  const asked = []
  const model = { chat: async (call) => (asked.push(call), answers.shift()) }
  const out = await planMenuLabels({ model, business, menus, given: business.about })
  assert.deepEqual(out, [
    row('Industrial park infrastructure', 'Bánh mì'),
    row('Pre-engineered buildings', 'Bánh mì Việt')
  ])
  assert.equal(asked.length, 2, 'asked once more, for the copied labels only')
  assert.match(asked[0].messages[0].content, /Vietnamese/, 'the language is named, not only coded')
  const again = asked[1].messages.at(-1).content
  assert.match(again, /Vietnamese bread/)
  assert.match(again, /Family bakery/)
  assert.doesNotMatch(again, /"Bánh mì"/)
})

// 🔒 ONE MENU NEVER NAMES TWO ITEMS THE SAME (TCH #1013). Measured 11/10/2026 on dev (g57-biz-emd-full, Tracy Business
// 1.7.4): the description named two breads, the footer had four service links, and the footer read
// "Bánh mì sourdough, Bánh mì Việt, Bánh mì sourdough, Bánh mì Việt". A repeated label is asked for again, told the labels already taken;
// one that still repeats is dropped, so its item keeps the seed label the tool then translates.
test('a label that repeats another of its menu is asked again, then dropped if it still repeats', async () => {
  const labels = [
    'Industrial park infrastructure',
    'Pre-engineered buildings',
    'M&E engineering',
    'Maintenance & retrofit'
  ]
  const menus = [{ name: 'footer_services', locale: 'en', language: 'vi', labels }]
  const business = {
    name: 'Tiệm Bánh Tamarind & Co',
    about: 'Tiệm bánh gia đình ở Dubai, nướng bánh mì sourdough và bánh mì Việt mỗi sáng.',
    sector: 'bakery'
  }
  const row = (from, to) => ({ menu: 'footer_services', locale: 'en', from, to })
  const answers = [
    JSON.stringify({
      relabel: [
        row(labels[0], 'Bánh mì sourdough'),
        row(labels[1], 'Bánh mì Việt'),
        row(labels[2], 'Bánh mì sourdough'),
        row(labels[3], 'Bánh mì Việt')
      ]
    }),
    JSON.stringify({ relabel: [row(labels[2], 'Bánh nướng mỗi sáng'), row(labels[3], 'Bánh mì Việt')] })
  ]
  const asked = []
  const model = { chat: async (call) => (asked.push(call), answers.shift()) }
  const out = await planMenuLabels({ model, business, menus, given: business.about })
  assert.deepEqual(out, [
    row(labels[0], 'Bánh mì sourdough'),
    row(labels[1], 'Bánh mì Việt'),
    row(labels[2], 'Bánh nướng mỗi sáng')
  ])
  const tos = out.map((r) => r.to)
  assert.equal(new Set(tos).size, tos.length, 'every label of the menu is its own')
  assert.equal(asked.length, 2, 'asked once more, for the repeated labels only')
  const again = asked[1].messages.at(-1).content
  assert.match(again, /M&E engineering/)
  assert.match(again, /Maintenance & retrofit/)
  assert.doesNotMatch(again, /Industrial park infrastructure/)
})

test('a site in English keeps the English the owner wrote: nothing is asked again', async () => {
  const menus = [{ name: 'footer_services', locale: 'en', labels: ['Pre-engineered buildings'] }]
  const asked = []
  const out = await planMenuLabels({
    model: modelSaying(
      JSON.stringify({
        relabel: [
          { menu: 'footer_services', locale: 'en', from: 'Pre-engineered buildings', to: 'Sourdough' }
        ]
      }),
      asked
    ),
    business: BAKERY,
    menus,
    given: BAKERY.about
  })
  assert.deepEqual(out, [
    { menu: 'footer_services', locale: 'en', from: 'Pre-engineered buildings', to: 'Sourdough' }
  ])
  assert.equal(asked.length, 1)
})

test('only the labels the model names, in menus and labels it was shown, short and free of facts the owner did not give', async () => {
  const menus = [
    {
      name: 'footer_services',
      locale: 'en',
      labels: ['Industrial park infrastructure', 'Pre-engineered buildings']
    },
    { name: 'primary', locale: 'en', labels: ['Home', 'Services'] }
  ]
  const asked = []
  const out = await planMenuLabels({
    model: modelSaying(
      JSON.stringify({
        relabel: [
          {
            menu: 'footer_services',
            locale: 'en',
            from: 'Industrial park infrastructure',
            to: 'Sourdough breads'
          },
          {
            menu: 'footer_services',
            locale: 'en',
            from: 'Pre-engineered buildings',
            to: 'Call 0912 345 678'
          },
          {
            menu: 'footer_services',
            locale: 'en',
            from: 'Pre-engineered buildings',
            to: '<b>Custom cakes</b>'
          },
          { menu: 'primary', locale: 'en', from: 'Home', to: 'Home' },
          { menu: 'primary', locale: 'vi', from: 'Services', to: 'Dịch vụ' },
          { menu: 'primary', locale: 'en', from: 'Missing', to: 'Anything' },
          { menu: 'primary', locale: 'en', from: 'Services', to: 'x'.repeat(41) }
        ]
      }),
      asked
    ),
    business: BAKERY,
    menus,
    given: BAKERY.about
  })
  assert.deepEqual(out, [
    { menu: 'footer_services', locale: 'en', from: 'Industrial park infrastructure', to: 'Sourdough breads' },
    { menu: 'footer_services', locale: 'en', from: 'Pre-engineered buildings', to: 'Custom cakes' }
  ])
  assert.equal(asked[0].temperature, 0)
  assert.match(asked[0].messages[0].content, /HARD RULE/, 'the fact rules go with the question')
  assert.deepEqual(
    await planMenuLabels({ model: modelSaying('never asked'), business: BAKERY, menus: [] }),
    []
  )
})

test('an answer that is not one is asked for again once, then said out loud', async () => {
  const answers = ['no idea', '{"relabel": []}']
  const asked = []
  const model = { chat: async (call) => (asked.push(call), answers.shift()) }
  assert.deepEqual(
    await planMenuLabels({ model, business: BAKERY, menus: [{ name: 'm', locale: 'en', labels: ['a'] }] }),
    []
  )
  assert.equal(asked.length, 2)
  await assert.rejects(
    planMenuLabels({
      model: modelSaying('{"note": 1}'),
      business: BAKERY,
      menus: [{ name: 'm', locale: 'en', labels: ['a'] }]
    }),
    /did not say which menu labels/
  )
})

test('a label is renamed through the menu API by its text, the item left otherwise as it is, and a refusal costs that label only', async () => {
  const calls = []
  const api = async (method, route, body) => {
    calls.push([method, route, body])
    if (method === 'GET')
      return {
        items: [
          { id: 'a1', label: 'Industrial park infrastructure' },
          { id: 'b2', label: 'M&E engineering' },
          { id: 'c3', label: 'Careers' }
        ]
      }
    if (route.includes('/b2')) throw new Error('PUT -> 403')
    return {}
  }
  const out = await renameMenuItems({
    api,
    changes: [
      {
        menu: 'footer_services',
        locale: 'en',
        from: 'Industrial park infrastructure',
        to: 'Sourdough breads'
      },
      { menu: 'footer_services', locale: 'en', from: 'M&E engineering', to: 'Custom cakes' },
      { menu: 'footer_services', locale: 'en', from: 'Gone already', to: 'Anything' }
    ]
  })
  assert.equal(out.renamed, 1)
  assert.deepEqual(calls[0].slice(0, 2), ['GET', '/_emdash/api/menus/footer_services?locale=en'])
  assert.deepEqual(calls[1], [
    'PUT',
    '/_emdash/api/menus/footer_services/items/a1?locale=en',
    { label: 'Sourdough breads' }
  ])
  assert.equal(calls.length, 3, 'a label the site no longer has is not written')
  assert.equal(out.notes.length, 1)
  assert.match(out.notes[0], /"M&E engineering" could not be renamed/)
})

test('end to end on the engine: the labels are judged while the site installs and renamed before the tool writes', async () => {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push([
      init.method,
      new URL(url).pathname + new URL(url).search,
      init.headers.authorization,
      init.body ? JSON.parse(init.body) : null
    ])
    return new Response(
      JSON.stringify({
        success: true,
        data: init.method === 'GET' ? { items: [{ id: 'f1', label: 'Industrial park infrastructure' }] } : {}
      }),
      { status: 200 }
    )
  }
  const text = modelSaying(
    JSON.stringify({
      relabel: [
        {
          menu: 'footer_services',
          locale: 'en',
          from: 'Industrial park infrastructure',
          to: 'Sourdough breads'
        }
      ]
    })
  )
  const inner = fakeRun()
  /** How many site requests had been made each time the tool was run. */
  const seenByTheTool = []
  const runner = { ...inner, run: async (call) => (seenByTheTool.push(requests.length), inner.run(call)) }
  const { engine } = make({ models: { text }, fetchImpl, runner })
  const { ctx, times, notes } = context({ quickstart: 'tracy-business/emdash-0.x' })
  const prepared = await engine.prepare(ctx)
  assert.equal(prepared.menuLabels.length, 1, 'judged before the site exists')
  assert.equal(requests.length, 0, 'and nothing asked of a site that is not there')
  // 🔒 RENAMED BEFORE THE TOOL RUNS. The tool translates the seed's own labels when the root is written in another language;
  // run first, it would have turned "Industrial park infrastructure" into another language and the rename, which finds the
  // item by that label, would have found nothing.
  await engine.apply(ctx, prepared)
  assert.deepEqual(seenByTheTool, [0, 2], 'the warm-up before any site call, the real run after the rename')
  assert.deepEqual(
    requests.map((r) => [r[0], r[1]]),
    [
      ['GET', '/_emdash/api/menus/footer_services?locale=en'],
      ['PUT', '/_emdash/api/menus/footer_services/items/f1?locale=en']
    ]
  )
  assert.equal(requests[1][2], 'Bearer ec_pat_realtoken00000000000000000000')
  assert.deepEqual(requests[1][3], { label: 'Sourdough breads' })
  assert.equal(times.menusRenamed, 1)
  assert.deepEqual(notes, [])
  await engine.dispose(prepared)
})

test('a model that cannot judge the labels costs the labels only, and says so', async () => {
  const { engine } = make({
    models: {
      text: {
        chat: async () => {
          throw new Error('model gone')
        }
      }
    }
  })
  const { ctx, notes } = context()
  const prepared = await engine.prepare(ctx)
  assert.deepEqual(prepared.menuLabels, [])
  assert.ok(notes.some((n) => /menu labels could not be judged: model gone/.test(n)))
  await engine.apply(ctx, prepared)
  await engine.dispose(prepared)
})

// 🔒 ABOUT LEFT BLANK: THE NAME CHANGES AND NOTHING ELSE, EVEN WITH A MODEL (spec TCQR ABOUT-3, K7; dev g55-biz-emd-blank
// 10/10/2026: the menu read "Baked goods" and "Products" over the industrial demo's pages, and the home photographs were
// bakeries). The tool keeps the demo words itself (`rewritesIn`); the menu labels and the pictures are Tracy's to hold back.
test('About blank with a text and a picture model: no menu label is judged from the name and no picture is drawn', async () => {
  const asked = []
  const text = modelSaying(
    JSON.stringify({ relabel: [{ menu: 'primary', locale: 'en', from: 'Services', to: 'Baked goods' }] }),
    asked
  )
  const { engine, runner } = make({ models: { text } })
  const { ctx, notes } = context({
    brief: { about: '', said: '', goal: null, style: null },
    normalized: { ...context().ctx.normalized, about: '', nameFrom: 'answer' }
  })
  const prepared = await engine.prepare(ctx)
  assert.deepEqual(asked, [], 'the menu labels are not judged from the name')
  assert.deepEqual(prepared.menuLabels, [])
  await engine.apply(ctx, prepared)
  assert.equal(runner.calls.length, 2)
  for (const call of runner.calls)
    assert.ok(call.args.includes('--no-images'), 'no picture is drawn from the name, in either run')
  assert.ok(
    !runner.calls[1].args.includes('--no-model'),
    'the tool still has its model for a root in another language'
  )
  assert.ok(
    notes.some((n) => /About was left blank/.test(n)),
    notes.join(' | ')
  )
  await engine.dispose(prepared)
})

test('SERVICES (Akemi 10/10/2026): a list of services keeps its count, each a distinct service of the business, never a filler word', async () => {
  const asked = []
  const menus = [
    {
      name: 'footer_services',
      locale: 'en',
      language: 'vi',
      labels: ['Industrial park infrastructure', 'Pre-engineered buildings', 'M&E engineering', 'Maintenance']
    }
  ]
  // A disobedient model: two services from the description, then the fillers the old prompt asked for.
  const out = await planMenuLabels({
    model: modelSaying(
      JSON.stringify({
        relabel: [
          {
            menu: 'footer_services',
            locale: 'en',
            from: 'Industrial park infrastructure',
            to: 'Bánh mì sourdough'
          },
          { menu: 'footer_services', locale: 'en', from: 'Pre-engineered buildings', to: 'Bánh sừng bò' },
          { menu: 'footer_services', locale: 'en', from: 'M&E engineering', to: 'Bánh sừng bò' }
        ]
      }),
      asked
    ),
    business: BAKERY,
    menus,
    given: BAKERY.about
  })
  const system = asked[0].messages[0].content
  assert.doesNotMatch(system, /give the others a kind or a way/, 'the filler instruction is gone')
  assert.match(system, /keeps its number of entries/)
  assert.match(system, /never a filler word/)
  // A repeat is asked again and dropped when it still repeats: the item keeps its own label, so the count stays.
  assert.deepEqual(
    out.map((r) => r.from),
    ['Industrial park infrastructure', 'Pre-engineered buildings'],
    'no item is planned twice the same, none is removed'
  )
})

// 🔒 L4 (product owner after g65): a vacancy the model never wrote for the trade is emptied, never another company's job; the
// build report says so (`rewritten.emptied` of the personalize tool, Tracy Business 1.7.14).
test('an entry the tool emptied because the model never wrote it for the business is said in the build report (L4)', async () => {
  const report = {
    written: [],
    errors: [],
    copy: { done: [], skipped: [] },
    rewritten: {
      done: 0,
      retried: 2,
      skipped: [],
      emptied: [
        {
          entry: 'vacancies/estimator-take-off-and-budgets/en',
          fields: ['title', 'type'],
          why: 'not written for this business after every ask (the demo company’s own text): emptied, never another company’s'
        }
      ]
    },
    pictures: { done: 0, skipped: [] },
    skipped: []
  }
  const { engine } = make({ runner: fakeRun({ real: { code: 0, report } }) })
  const { ctx, notes } = context()
  await engine.apply(ctx, await engine.prepare(ctx))
  assert.ok(
    notes.includes(
      '1 entry of the template was not written for the business after asking again and was emptied, never left as another company’s'
    ),
    notes.join(' | ')
  )
  assert.ok(
    notes.some((n) => n.startsWith('vacancies/estimator-take-off-and-budgets/en: ')),
    notes.join(' | ')
  )
})

test('what the model did not write is said: entries, bodies and card lists the tool names in rewritten.skipped (#1013, g60)', async () => {
  const report = {
    written: [{ entry: 'pages/terms/en' }],
    errors: [],
    copy: { done: [], skipped: [] },
    rewritten: {
      done: 3,
      retried: 1,
      skipped: [
        { why: 'About left blank: the demo entries keep their words, renamed' },
        {
          entry: 'pages/terms/en.content',
          why: 'the model wrote no usable words: the template’s Vietnamese edition stands, renamed'
        },
        {
          entry: 'pages/privacy/en.content',
          why: 'the model wrote no usable words: the template’s words, translated into Vietnamese'
        }
      ]
    },
    pictures: { done: 0, skipped: [] },
    skipped: []
  }
  const { engine } = make({ runner: fakeRun({ real: { code: 0, report } }) })
  const { ctx, notes } = context()
  const result = await engine.apply(ctx, await engine.prepare(ctx))
  assert.deepEqual(result, { wrote: 1, kept: 2 }, 'a line without an entry is a choice, not a miss')
  assert.ok(
    notes.includes(
      '2 entries of the template could not be written by the model and keep the template’s words in the site’s language'
    ),
    notes.join(' | ')
  )
  assert.ok(
    notes.some((n) => n.startsWith('pages/terms/en.content: ')),
    notes.join(' | ')
  )
})
