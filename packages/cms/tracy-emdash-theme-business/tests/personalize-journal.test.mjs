// tools/personalize.mjs, the parts a customer relies on after the build: a write that fails in
// the middle of a run turns the stage red with the rule named; every mutation is journaled so a
// run killed mid-write is found by the next one; the same request twice writes nothing; a value a
// model wrote reaches the site only with its evidence; and `--inspect` / `--revert` read that
// journal. Written against any template's own seed (the site chrome and its brand field), so the
// kit and every template carry the same file; a template's own rules (`trim`, an email answer)
// are tested beside it.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  EVIDENCE_GENERATED,
  dangling,
  displayLocalesFrom,
  exitCodeOf,
  fieldKey,
  modelFrom,
  nextApplyId,
  readJournal,
  refuseUnevidenced,
  repeatOf,
  sameValue
} from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

/**
 * 🔒 THE TEST CARRIES ITS OWN SEED. The same file runs in the kit (whose throwaway template has an
 * empty `seed.json`) and in every template, so it reads no template's seed: a site chrome with a
 * brand, one page that names the demo, a hidden locale — enough for every journal path.
 */
const seed = {
  defaultLocale: 'en',
  content: {
    site: [
      { slug: 'site', locale: 'en', data: { brand_name: 'DEMO WORKS', tagline: 'Built by Demo' } },
      { slug: 'site', locale: 'ru', data: { brand_name: 'DEMO WORKS', tagline: 'Demo' } }
    ],
    pages: [
      { slug: 'about', locale: 'en', data: { title: 'About Demo', lede: 'Demo builds things.' } },
      { slug: 'about', locale: 'ru', data: { title: 'О Demo', lede: 'Demo.' } }
    ]
  }
}
const map = {
  settings: { title: '{name}' },
  identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' }],
  replace: [{ find: 'Demo', with: '{name}' }]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-journal-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}

/** The site first-run setup would make from that seed: every entry, every locale, published. */
function englishSite() {
  const mock = createMockEmdash()
  for (const [coll, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(coll, e.slug, e.locale, e.data)
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

/** Token, receipts and journal of one site, in a directory of its own. */
function siteFiles() {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-journal-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return {
    dir,
    journal: path.join(dir, 'personalize-journal.jsonl'),
    args: (site) => [
      '--seed',
      SEED_DIR,
      '--site',
      site,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      path.join(dir, 'personalize-receipts.json'),
      '--json'
    ]
  }
}

const ANSWERS = JSON.stringify({
  name: 'Granite Works',
  contact: 'Hà Nội · +84 24 3999 0000',
  email: 'hello@granite.example',
  languages: ['en']
})
const SITE_SLUG = 'site'
const SITE_KEY = `site/${SITE_SLUG}/en`
const BRAND = 'GRANITE WORKS'

const entryOf = (mock, collection, slug) =>
  [...mock.state.entries.values()].find(
    (e) => e.collection === collection && e.slug === slug && e.locale === 'en'
  )

test('modelFrom: what /ops assigned wins when its key is there, and falls through when it is not', () => {
  const both = { OPENROUTER_API_KEY: 'or', DEEPSEEK_API_KEY: 'ds' }
  assert.equal(modelFrom({ ...both, TRACY_SEED_TEXT_PROVIDER: 'openrouter' }).provider, 'openrouter')
  assert.equal(modelFrom({ ...both, TRACY_SEED_TEXT_PROVIDER: 'deepseek' }).provider, 'deepseek')
  assert.equal(modelFrom(both).provider, 'deepseek', 'nobody chose: DeepSeek direct')
  assert.equal(
    modelFrom({ DEEPSEEK_API_KEY: 'ds', TRACY_SEED_TEXT_PROVIDER: 'openrouter' }).provider,
    'deepseek'
  )
  assert.equal(modelFrom({ DEEPSEEK_API_KEY: 'ds' }).model, 'deepseek-flash', 'not the retired deepseek-chat')
  const chosen = modelFrom(
    {
      ...both,
      TRACY_SEED_TEXT_PROVIDER: 'openrouter',
      TRACY_SEED_TEXT_MODEL: 'openai/gpt-5.4-mini',
      TRACY_SEED_IMAGE_MODEL: 'x/img'
    },
    { imageModel: 'map/img' }
  )
  assert.equal(chosen.model, 'openai/gpt-5.4-mini')
  assert.equal(chosen.imageModel, 'x/img', '/ops names the picture model before the map')
  assert.equal(modelFrom({ OPENROUTER_API_KEY: 'or' }, { imageModel: 'map/img' }).imageModel, 'map/img')
  assert.equal(modelFrom({}), null)
})

test('the write door: a generated value without its evidence does not go, the rest of the entry does', () => {
  const { ok, refused } = refuseUnevidenced(
    { title: 'A', lede: 'B', brand_name: 'C' },
    { title: 'generated', lede: 'generated', brand_name: 'customer' },
    { title: EVIDENCE_GENERATED }
  )
  assert.deepEqual(refused, ['lede'])
  assert.deepEqual(Object.keys(ok).sort(), ['brand_name', 'title'])
  assert.equal(
    exitCodeOf({ errors: [{}], copy: { skipped: [{}] } }),
    4,
    'a failed write wins over skipped copy'
  )
  assert.equal(exitCodeOf({ errors: [], copy: { skipped: [{}] } }), 3)
  assert.equal(exitCodeOf({ errors: [], copy: { skipped: [] } }), 0)
})

test('journal helpers: next id, dangling steps, a repeat, and a reverted run is no repeat', () => {
  const lines = [
    { applyId: 'pers-1', requestId: 'r', phase: 'run' },
    { applyId: 'pers-1', requestId: 'r', step: 1, phase: 'before' },
    { applyId: 'pers-1', requestId: 'r', step: 1, phase: 'ok' },
    { applyId: 'pers-1', requestId: 'r', phase: 'done' },
    { applyId: 'pers-2', requestId: 's', phase: 'run' },
    { applyId: 'pers-2', requestId: 's', step: 1, phase: 'before' }
  ]
  assert.equal(nextApplyId(lines), 'pers-3')
  assert.deepEqual(
    dangling(lines).map((l) => l.applyId),
    ['pers-2']
  )
  assert.equal(repeatOf(lines, 'r'), 'pers-1')
  assert.equal(repeatOf(lines, 's'), null, 'a run that never finished is not a repeat')
  const reverted = [
    ...lines,
    { applyId: 'pers-1-revert', requestId: 'r', phase: 'run' },
    { applyId: 'pers-1-revert', requestId: 'r', phase: 'done' }
  ]
  assert.equal(
    repeatOf(reverted, 'r'),
    null,
    'the site no longer holds what pers-1 wrote, and a revert is no run to repeat'
  )
  assert.equal(
    fieldKey({ kind: 'unpublish', collection: 'posts', slug: 'a', locale: 'en' }, null),
    fieldKey({ kind: 'publish', collection: 'posts', slug: 'a', locale: 'en' }, null)
  )
})

test('a 409 in the middle of the writes turns the run red, with the entry and the status named', async () => {
  const mock = englishSite()
  // The SECOND content PUT is refused: the first landed, so this is a failure mid-run, not a dead token.
  mock.state.fail('PUT', /^\/_emdash\/api\/content\/[^/]+\/[^/]+$/, 2)
  const site = await mock.listen()
  const f = siteFiles()
  try {
    const out = await run(['--answers-json', ANSWERS, ...f.args(site)])
    const report = JSON.parse(out.stdout)
    assert.equal(out.code, 4)
    assert.equal(report.errors.length, 1, JSON.stringify(report.errors))
    assert.equal(report.errors[0].status, 409)
    assert.match(report.errors[0].rule, /^[a-z_]+\/[^/]+\/en$/)
    assert.ok(report.written.length > 0, 'the other entries still went')
    const lines = readJournal(f.journal)
    assert.ok(lines.some((l) => l.phase === 'failed' && /409/.test(l.why)))
  } finally {
    await mock.close()
  }
})

test('a run killed between its before and after line is found by the next run, named once', async () => {
  const mock = englishSite()
  const site = await mock.listen()
  const f = siteFiles()
  writeFileSync(
    f.journal,
    `${JSON.stringify({ applyId: 'pers-1', requestId: 'old', phase: 'run' })}\n${JSON.stringify({
      applyId: 'pers-1',
      requestId: 'old',
      step: 1,
      phase: 'before',
      target: { kind: 'entry', collection: 'site', slug: SITE_SLUG, locale: 'en', fields: ['brand_name'] },
      before: { brand_name: 'DEMO' },
      after: { brand_name: 'X' }
    })}\n`
  )
  try {
    const first = await run(['--answers-json', ANSWERS, ...f.args(site)])
    const report = JSON.parse(first.stdout)
    assert.equal(first.code, 4)
    assert.equal(report.applyId, 'pers-2')
    assert.deepEqual(report.errors, [
      { rule: 'site/site/en', why: 'a previous run stopped mid-write', applyId: 'pers-1' }
    ])
    // The entry was read from the site and written all the same.
    assert.equal(entryOf(mock, 'site', SITE_SLUG).live.brand_name, BRAND)
    assert.deepEqual(dangling(readJournal(f.journal)), [], 'closed in the journal')
    const second = await run(['--answers-json', ANSWERS, ...f.args(site)])
    assert.deepEqual(JSON.parse(second.stdout).errors, [], 'named once, not on every run')
  } finally {
    await mock.close()
  }
})

test('the same request twice: the second run writes nothing and says which run it repeats', async () => {
  const mock = englishSite()
  const site = await mock.listen()
  const f = siteFiles()
  try {
    const first = JSON.parse((await run(['--answers-json', ANSWERS, ...f.args(site)])).stdout)
    assert.ok(first.written.length > 0)
    const before = mock.state.log.length
    const second = JSON.parse((await run(['--answers-json', ANSWERS, ...f.args(site)])).stdout)
    assert.equal(second.repeatOf, first.applyId)
    assert.deepEqual(second.written, [])
    assert.equal(mock.state.log.length, before, 'not even a GET')
  } finally {
    await mock.close()
  }
})

test('inspect lists what a run wrote with before and origin; revert refuses over an edit, puts a clean run back, and a rerun writes again', async () => {
  const mock = englishSite()
  const site = await mock.listen()
  const f = siteFiles()
  const demoBrand = entryOf(mock, 'site', SITE_SLUG).live.brand_name
  try {
    const built = JSON.parse((await run(['--answers-json', ANSWERS, ...f.args(site)])).stdout)
    const seen = JSON.parse((await run(['--inspect', ...f.args(site)])).stdout)
    assert.equal(seen.latest, built.applyId)
    const brand = seen.fields.find((r) => r.target.kind === 'entry' && r.target.field === 'brand_name')
    assert.equal(brand.before, demoBrand)
    assert.equal(brand.after, BRAND)
    assert.equal(brand.origin, 'customer')
    assert.equal(brand.live, 'same')

    // An editor changes the brand in the admin: the revert would throw their work away.
    const chrome = entryOf(mock, 'site', SITE_SLUG)
    chrome.live.brand_name = `${BRAND} LTD`
    const refused = await run(['--revert', built.applyId, ...f.args(site)])
    assert.equal(refused.code, 4)
    const why = JSON.parse(refused.stdout)
    assert.equal(why.ok, false)
    assert.match(why.why, new RegExp(`${SITE_KEY}/brand_name\\S* was edited`))
    assert.equal(chrome.live.brand_name, `${BRAND} LTD`, 'nothing was written')
    chrome.live.brand_name = BRAND

    const back = await run(['--revert', built.applyId, ...f.args(site)])
    assert.equal(back.code, 0, back.stdout)
    assert.equal(JSON.parse(back.stdout).ok, true)
    assert.equal(entryOf(mock, 'site', SITE_SLUG).live.brand_name, demoBrand, 'the demo brand is back')
    const again = await run(['--revert', built.applyId, ...f.args(site)])
    assert.equal(again.code, 4, 'a run is reverted once')

    // Personalised again with the same answers: not a repeat, and the name comes back.
    const rerun = JSON.parse((await run(['--answers-json', ANSWERS, ...f.args(site)])).stdout)
    assert.equal(rerun.repeatOf, null)
    assert.deepEqual(rerun.editor, [], 'the reverted fields are not read as an editor')
    assert.equal(entryOf(mock, 'site', SITE_SLUG).live.brand_name, BRAND)
  } finally {
    await mock.close()
  }
})

test('revert refuses a run that is not the latest', async () => {
  const mock = englishSite()
  const site = await mock.listen()
  const f = siteFiles()
  try {
    const first = JSON.parse((await run(['--answers-json', ANSWERS, ...f.args(site)])).stdout)
    await run(['--answers-json', JSON.stringify({ name: 'Basalt Co', languages: ['en'] }), ...f.args(site)])
    const out = await run(['--revert', first.applyId, ...f.args(site)])
    assert.equal(out.code, 4)
    assert.match(JSON.parse(out.stdout).why, /only the latest run/)
  } finally {
    await mock.close()
  }
})

test('displayLocalesFrom: a regional answer labels the bare stored locale, and nothing else', () => {
  assert.deepEqual(displayLocalesFrom({ languages: ['en-us', 'vi'] }, ['en', 'vi']), { en: 'en-US' })
  assert.deepEqual(
    displayLocalesFrom({ languages: ['en-gb', 'en-us'] }, ['en']),
    { en: 'en-GB' },
    'the first one named'
  )
  assert.deepEqual(displayLocalesFrom({ languages: ['vi'] }, ['en', 'vi']), {})
  assert.deepEqual(displayLocalesFrom({ languages: ['pt-br'] }, ['en']), {}, 'not a locale this site writes')
  // The root written in another language (TCH #1013, O2) is shown as that language.
  assert.deepEqual(displayLocalesFrom({ languages: ['vi-vn'] }, ['en'], { en: 'vi' }), { en: 'vi-VN' })
  assert.deepEqual(displayLocalesFrom({ languages: ['de'] }, ['en'], { en: 'de' }), { en: 'de' })
})

test('an en-us answer writes the display file the template reads; revert puts the old one back', async () => {
  const mock = englishSite()
  const site = await mock.listen()
  const f = siteFiles()
  const file = path.join(f.dir, 'display-locale.json')
  try {
    const built = JSON.parse(
      (
        await run([
          '--answers-json',
          JSON.stringify({ name: 'Granite Works', languages: ['en-us'] }),
          ...f.args(site)
        ])
      ).stdout
    )
    assert.deepEqual(built.displayLocale, { en: 'en-US' })
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { en: 'en-US' })
    const back = await run(['--revert', built.applyId, ...f.args(site)])
    assert.equal(back.code, 0, back.stdout)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {})
  } finally {
    await mock.close()
  }
})

test('sameValue: a picture is its media id, whatever shape the site stored it in', () => {
  const sent = {
    id: 'M1',
    src: '/_emdash/api/media/file/a.png',
    alt: 'x',
    provider: 'local',
    meta: { storageKey: 'a' }
  }
  const stored = { id: 'M1', src: '/_emdash/api/media/file/a.png', alt: 'x', width: 10 }
  assert.equal(sameValue(sent, stored), true)
  assert.equal(sameValue(sent, { ...stored, id: 'M2' }), false)
  assert.equal(sameValue('a', 'a'), true)
  assert.equal(sameValue(['a'], ['b']), false)
  assert.equal(sameValue(null, undefined), true)
})

test('sameValue: repeater rows the site stamped with a _rowId are still what this tool wrote', () => {
  const sent = [{ name: 'Telegram' }, { name: 'X' }]
  const stored = [
    { name: 'Telegram', _rowId: '00000000-0000-4000-8000-000000000001' },
    { name: 'X', _rowId: '00000000-0000-4000-8000-000000000002' }
  ]
  assert.equal(sameValue(sent, stored), true)
  assert.equal(sameValue(stored, sent), true)
  assert.equal(sameValue(sent, [{ ...stored[0], name: 'changed' }, stored[1]]), false)
  assert.equal(sameValue(sent, stored.slice().reverse()), false, 'a reorder is still an edit')
})

test('repeatOf: only the latest pass can be repeated — a request that matches an older one runs again', () => {
  const pass = (id, req) => [
    { applyId: id, requestId: req, phase: 'run' },
    { applyId: id, requestId: req, phase: 'done' }
  ]
  const lines = [...pass('pers-1', 'A'), ...pass('pers-2', 'B')]
  assert.equal(repeatOf(lines, 'B'), 'pers-2')
  assert.equal(repeatOf(lines, 'A'), null, 'the site holds pers-2, not pers-1')
})
