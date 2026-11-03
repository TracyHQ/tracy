// tools/personalize.mjs, the customer's brand pictures (TCH #1013, T22): the light logo to core `settings.logo`, the
// favicon to core `settings.favicon`, the dark-background logo to the field the map names on the chrome entry (made when
// the site has none), every write journaled so `--revert` takes them all back. `--brand-only` writes them and nothing
// else, under the apply id the caller names; neither `--no-model` nor `--no-images` stops them. Written against its own
// tiny seed (as `personalize-journal.test.mjs` is), so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { brandPicturesFrom, mediaRefOf, readJournal, sameValue } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const seed = {
  defaultLocale: 'en',
  content: {
    site: [
      { slug: 'site', locale: 'en', data: { brand_name: 'DEMO WORKS' } },
      { slug: 'site', locale: 'ru', data: { brand_name: 'DEMO WORKS' } }
    ]
  }
}
const map = {
  identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' }],
  brand: {
    logoDark: { collection: 'site', slug: 'site', field: 'logo_dark', label: 'Logo for dark backgrounds' }
  }
}
function seedDir(m = map) {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-brand-seed-'))
  writeFileSync(path.join(dir, 'seed.json'), JSON.stringify(seed))
  writeFileSync(path.join(dir, 'personalize.json'), JSON.stringify(m))
  return dir
}
const SEED_DIR = seedDir()

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** A file that starts like a PNG, different for each role. */
function pngFile(dir, role) {
  const file = path.join(dir, `${role}.png`)
  writeFileSync(file, Buffer.concat([SIGNATURE, Buffer.from(`picture of the ${role}`)]))
  return file
}

/** The site first-run setup makes: both chrome entries, the Russian one hidden, and a chrome schema with no dark logo. */
function site() {
  const mock = createMockEmdash()
  for (const e of seed.content.site)
    mock.state.addEntry('site', e.slug, e.locale, e.data, e.locale === 'ru' ? { status: 'draft' } : {})
  mock.state.schema.set('site', { item: { slug: 'site' }, fields: [{ slug: 'brand_name', type: 'string' }] })
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

function files() {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-brand-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return {
    dir,
    journal: path.join(dir, 'personalize-journal.jsonl'),
    args: (url, seedAt = SEED_DIR) => [
      '--seed',
      seedAt,
      '--site',
      url,
      '--token-file',
      path.join(dir, 'token'),
      '--receipts',
      path.join(dir, 'receipts.json'),
      '--json'
    ]
  }
}

const chrome = (mock, locale) =>
  [...mock.state.entries.values()].find((e) => e.collection === 'site' && e.locale === locale)

test('brandPicturesFrom: a PNG is read, anything else is a skip with its reason', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-brand-files-'))
  const logo = pngFile(dir, 'logo')
  const text = path.join(dir, 'not.png')
  writeFileSync(text, 'just words')
  const { pictures, skipped } = brandPicturesFrom({
    logo,
    logoDark: text,
    favicon: path.join(dir, 'missing.png')
  })
  assert.deepEqual(Object.keys(pictures), ['logo'])
  assert.deepEqual(
    skipped.map((s) => [s.where, /not a PNG|could not be read/.test(s.why)]),
    [
      ['logoDark', true],
      ['favicon', true]
    ]
  )
  assert.deepEqual(brandPicturesFrom({ logo: null }), { pictures: {}, skipped: [] })
})

test('a media setting is the same picture when its mediaId is', () => {
  assert.equal(sameValue({ mediaId: 'm1', alt: 'A' }, { mediaId: 'm1', alt: 'A', url: '/x', width: 9 }), true)
  assert.equal(sameValue({ mediaId: 'm1' }, { mediaId: 'm2' }), false)
  assert.deepEqual(mediaRefOf({ mediaId: 'm1', alt: 'A', url: '/x' }), { mediaId: 'm1', alt: 'A' })
  assert.equal(mediaRefOf(undefined), null)
})

test('--brand-only: logo, dark logo and favicon land where the template reads them, and --revert takes all of it back', async () => {
  const mock = site()
  const url = await mock.listen()
  const f = files()
  try {
    const r = await run([
      ...f.args(url),
      '--brand-only',
      '--apply-id',
      'brand-1700000000000',
      '--answers-json',
      JSON.stringify({ name: 'Golden Crust' }),
      '--logo-file',
      pngFile(f.dir, 'logo'),
      '--logo-dark-file',
      pngFile(f.dir, 'logo-dark'),
      '--favicon-file',
      pngFile(f.dir, 'favicon')
    ])
    assert.equal(r.code, 0, r.stderr)
    const report = JSON.parse(r.stdout)
    assert.equal(report.applyId, 'brand-1700000000000')
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.brand.written, ['settings.logo', 'settings.favicon', 'site/site/en.logo_dark'])
    const { logo, favicon } = mock.state.settings
    assert.ok(
      typeof logo.mediaId === 'string' && mock.state.media.has(logo.mediaId),
      'settings.logo is a media id'
    )
    assert.equal(logo.alt, 'Golden Crust')
    assert.ok(typeof favicon.mediaId === 'string' && favicon.mediaId !== logo.mediaId)
    assert.ok(
      mock.state.schema.get('site').fields.some((x) => x.slug === 'logo_dark' && x.type === 'image'),
      'the chrome entry gets its dark-logo field when the site has none'
    )
    const en = chrome(mock, 'en')
    assert.equal(en.status, 'published')
    assert.ok(
      en.live.logo_dark?.id && en.live.logo_dark.id !== logo.mediaId,
      'the dark logo is its own picture'
    )
    assert.equal(chrome(mock, 'ru').status, 'draft', 'a hidden language is not published again')
    assert.equal(chrome(mock, 'ru').live.logo_dark, undefined)
    // No word was written: the brand step is the brand step.
    assert.equal(en.live.brand_name, 'DEMO WORKS')
    const kinds = readJournal(f.journal)
      .filter((l) => l.phase === 'ok')
      .map((l) => l.target.kind)
    assert.deepEqual(kinds, ['settings', 'field', 'entry'])

    const back = await run([...f.args(url), '--revert', 'brand-1700000000000'])
    assert.equal(back.code, 0, back.stdout + back.stderr)
    assert.equal(JSON.parse(back.stdout).reverted, 3)
    assert.equal(mock.state.settings.logo, null)
    assert.equal(mock.state.settings.favicon, null)
    assert.equal(chrome(mock, 'en').live.logo_dark, null, 'written back as nothing, not left out')
    assert.ok(
      mock.state.log.some(
        (l) => l.method === 'DELETE' && l.path.endsWith('/schema/collections/site/fields/logo_dark')
      ),
      'the field it made goes again'
    )
  } finally {
    await mock.close()
  }
})

test('a site that already has the field keeps it on revert; a template naming no dark-logo place says so', async () => {
  const mock = site()
  mock.state.schema.get('site').fields.push({ slug: 'logo_dark', type: 'image' })
  const url = await mock.listen()
  const f = files()
  try {
    const { brand: _brand, ...noDark } = map
    const r = await run([
      ...f.args(url, seedDir(noDark)),
      '--brand-only',
      '--logo-dark-file',
      pngFile(f.dir, 'logo-dark')
    ])
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.brand.written, [])
    assert.deepEqual(
      report.brand.skipped.map((s) => s.where),
      ['logoDark']
    )
    const r2 = await run([...f.args(url), '--brand-only', '--logo-dark-file', pngFile(f.dir, 'logo-dark')])
    const report2 = JSON.parse(r2.stdout)
    assert.deepEqual(report2.brand.written, ['site/site/en.logo_dark'])
    assert.deepEqual(
      readJournal(f.journal)
        .filter((l) => l.phase === 'ok')
        .map((l) => l.target.kind),
      ['entry'],
      'no field is made when the site has one'
    )
  } finally {
    await mock.close()
  }
})

test('the pictures go with --no-model and --no-images on a full run, and a new logo is not a repeat', async () => {
  const mock = site()
  const url = await mock.listen()
  const f = files()
  try {
    const answers = JSON.stringify({ name: 'Golden Crust', languages: ['en'] })
    const first = await run([...f.args(url), '--answers-json', answers, '--no-model', '--no-images'])
    assert.equal(JSON.parse(first.stdout).brand, undefined)
    const r = await run([
      ...f.args(url),
      '--answers-json',
      answers,
      '--no-model',
      '--no-images',
      '--favicon-file',
      pngFile(f.dir, 'favicon')
    ])
    const report = JSON.parse(r.stdout)
    assert.equal(report.repeatOf, null, 'a favicon to write is new work')
    assert.deepEqual(report.brand.written, ['settings.favicon'])
    assert.ok(typeof mock.state.settings.favicon?.mediaId === 'string')
  } finally {
    await mock.close()
  }
})

test('--share-file: the card becomes seo.defaultOgImage, the rest of seo is kept, and --revert takes only it back', async () => {
  const mock = site()
  mock.state.settings = { seo: { titleSeparator: ' | ' } }
  const url = await mock.listen()
  const f = files()
  try {
    const r = await run([
      ...f.args(url),
      '--brand-only',
      '--apply-id',
      'brand-1700000000001',
      '--share-file',
      pngFile(f.dir, 'share')
    ])
    assert.equal(r.code, 0, r.stderr)
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.brand.written, ['settings.seo.defaultOgImage'])
    const { seo } = mock.state.settings
    assert.equal(seo.titleSeparator, ' | ', 'the other seo settings stay')
    assert.ok(mock.state.media.has(seo.defaultOgImage.mediaId), 'the share picture is a media id')
    assert.equal(mock.state.settings.logo, undefined, 'no logo is written for a share card')

    const back = await run([...f.args(url), '--revert', 'brand-1700000000001'])
    assert.equal(back.code, 0, back.stdout + back.stderr)
    assert.equal(JSON.parse(back.stdout).reverted, 1)
    assert.deepEqual(mock.state.settings.seo, { titleSeparator: ' | ' })
  } finally {
    await mock.close()
  }
})
