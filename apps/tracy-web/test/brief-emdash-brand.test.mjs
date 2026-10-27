/**
 * The EmDash writer behind `setSiteBrand` (plan T22, D9): the template's own tool in its brand-only mode, handed the prepared
 * PNGs and the brand step's apply id, writes the light logo to core `settings.logo`, the favicon to core `settings.favicon`,
 * the share card to core `settings.seo.defaultOgImage` (D5) and the dark logo to the chrome entry's `logo_dark`. Held against a stand-in runner for what is sent and how the report is read,
 * and end to end against the real tool and an in-memory EmDash.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

import { runNode } from '../src/lib/emdash-tool.js'
import { brandArgs, connectEmdashBrand, emdashPicturesOf } from '../src/sites/brief-engines/brand-emdash.js'
import { setSiteBrand } from '../src/sites/brief-engines/brand.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const THEME = path.resolve(HERE, '../../../packages/cms/tracy-emdash-theme-business')
const TOKEN = 'ec_pat_0123456789abcdef0123456789abcdef'
const roots = []
const root = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'emdash-brand-'))
  roots.push(d)
  return d
}
after(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true })
})

const png = (width, height, r = 20) =>
  sharp({ create: { width, height, channels: 4, background: { r, g: 30, b: 40, alpha: 1 } } })
    .png()
    .toBuffer()

/** A runner that keeps what it was asked and answers `report`. */
function standIn(report, extra = {}) {
  const calls = []
  const run = async (call) => {
    const flagged = (name) => {
      const i = call.args.indexOf(name)
      return i >= 0 ? call.args[i + 1] : null
    }
    calls.push({
      ...call,
      files: Object.fromEntries(
        ['--logo-file', '--logo-dark-file', '--favicon-file', '--share-file']
          .filter((f) => flagged(f))
          .map((f) => [f, readFileSync(flagged(f))])
      ),
      token: readFileSync(flagged('--token-file'), 'utf8').trim(),
      dir: call.cwd
    })
    return { code: 0, stdout: JSON.stringify(report), stderr: '', killed: false, ...extra }
  }
  return { calls, run }
}

const pack = async () => ({
  name: 'Golden Crust',
  logo: { light: await png(600, 200), dark: await png(600, 200, 200) },
  favicon: await png(512, 512)
})

/** One brand step on an EmDash site, as `createSiteBrand` runs it. */
async function brand(input) {
  const notes = []
  const result = await setSiteBrand({
    platform: 'emdash',
    siteKey: 'site-1',
    release: { tag: 'tracy-business/emdash-0.x', version: '9.0.0' },
    call: async () => assert.fail('EmDash has no Apply door for its brand'),
    applyId: 'brand-1700000000000',
    note: (n) => notes.push(n),
    ...input
  })
  return { ...result, notes }
}

test('the tool is run brand-only with the four files, the apply id, the token and nothing of ours', async () => {
  const { calls, run } = standIn({
    brand: {
      written: ['settings.logo', 'settings.favicon', 'settings.seo.defaultOgImage', 'site/site/en.logo_dark'],
      skipped: []
    }
  })
  const workRoot = root()
  connectEmdashBrand({
    siteAccess: async () => ({ origin: 'http://site.test', token: TOKEN }),
    run,
    workRoot
  })
  const given = await pack()
  const result = await brand({ pack: given })
  assert.deepEqual(result.written, ['logo', 'logo-dark', 'favicon', 'share'])
  assert.equal(calls.length, 1)
  const [call] = calls
  assert.ok(call.args[0].endsWith('personalize.mjs'))
  for (const flag of ['--brand-only', '--json']) assert.ok(call.args.includes(flag), `${flag} is sent`)
  assert.equal(call.args[call.args.indexOf('--apply-id') + 1], 'brand-1700000000000')
  assert.equal(call.args[call.args.indexOf('--site') + 1], 'http://site.test')
  assert.deepEqual(JSON.parse(call.args[call.args.indexOf('--answers-json') + 1]), { name: 'Golden Crust' })
  assert.ok(
    !call.args.includes('--no-images') && !call.args.includes('--no-model'),
    'the pictures need neither door'
  )
  assert.equal(call.token, TOKEN)
  assert.ok(call.files['--logo-file'].equals(given.logo.light), 'no frame: the logo goes as given')
  assert.ok(call.files['--logo-dark-file'].equals(given.logo.dark))
  assert.ok(call.files['--favicon-file'].equals(given.favicon))
  const card = await sharp(call.files['--share-file']).metadata()
  assert.deepEqual(
    [card.format, card.width, card.height],
    ['png', 1200, 630],
    'the share card, made from the logo'
  )
  assert.deepEqual(Object.keys(call.env).sort(), ['LANG', 'PATH'], 'no key of this process reaches the tool')
  assert.equal(existsSync(call.dir), false, 'the files and the token are gone once it ran')
})

test('a design that does not show them yet: written, and the customer is told', async () => {
  const { run } = standIn({
    brand: { written: ['settings.logo', 'settings.favicon', 'settings.seo.defaultOgImage'], skipped: [] }
  })
  connectEmdashBrand({
    siteAccess: async () => ({ origin: 'http://site.test', token: TOKEN }),
    run,
    workRoot: root()
  })
  const result = await brand({
    release: { tag: 'tracy-business/emdash-0.x', version: '1.6.0' },
    pack: { logo: { light: await png(600, 200) }, favicon: await png(512, 512) }
  })
  assert.deepEqual(result.written, ['logo', 'favicon', 'share'])
  assert.deepEqual(result.notes, [
    'logo: this design does not show a logo yet',
    'favicon: this design does not show a favicon yet'
  ])
})

test('what the tool could not write is a skip with its reason; one it never names is said too', async () => {
  const { run } = standIn({
    brand: {
      written: ['settings.logo'],
      skipped: [{ where: 'logoDark', why: 'this template names no place for a dark-background logo' }]
    }
  })
  connectEmdashBrand({
    siteAccess: async () => ({ origin: 'http://site.test', token: TOKEN }),
    run,
    workRoot: root()
  })
  const result = await brand({ pack: await pack() })
  assert.deepEqual(result.written, ['logo'])
  assert.deepEqual(result.skipped, [
    { where: 'logo-dark', reason: 'this template names no place for a dark-background logo' },
    { where: 'favicon', reason: 'the site did not take it' },
    { where: 'share', reason: 'the site did not take it' }
  ])
})

test('no tool, no site, no report: each picture is a skip, and nothing fails the build', async () => {
  const { calls, run } = standIn({})
  connectEmdashBrand({
    siteAccess: async () => ({ origin: 'http://site.test', token: TOKEN }),
    run,
    workRoot: root()
  })
  const noTool = await brand({ release: { tag: 'some-pack/emdash-1', version: '1.0.0' }, pack: await pack() })
  assert.deepEqual(
    noTool.skipped.map((s) => s.reason),
    Array(4).fill('this design ships no tool to write it with')
  )
  assert.equal(calls.length, 0)

  const noReport = await brand({ pack: await pack() })
  assert.equal(noReport.skipped.length, 4)
  assert.match(noReport.skipped[0].reason, /^the tool gave no report \(exit 0\)/)

  connectEmdashBrand({
    siteAccess: async () => {
      throw new Error('the site did not hand over its agent token')
    },
    run,
    workRoot: root()
  })
  const unreachable = await brand({ pack: { favicon: await png(512, 512) } })
  assert.deepEqual(unreachable.skipped, [
    { where: 'favicon', reason: 'the site could not be reached (the site did not hand over its agent token)' }
  ])
})

test('which file is which: the light or only logo is the site logo, a dark-only design takes its dark one, the dark one always goes to its field', () => {
  const a = new Uint8Array([1])
  const b = new Uint8Array([2])
  assert.deepEqual(emdashPicturesOf({ logo: { light: a, dark: b } }, null), { logo: a, logoDark: b })
  assert.deepEqual(emdashPicturesOf({ logo: { single: a } }, null), { logo: a })
  assert.deepEqual(emdashPicturesOf({ logo: { dark: b } }, { logos: 'dark' }), { logo: b, logoDark: b })
  assert.deepEqual(emdashPicturesOf({ logo: { dark: b } }, { logos: 'pair' }), { logoDark: b })
  assert.deepEqual(emdashPicturesOf({ logo: { single: a }, share: b }, null), { logo: a, share: b })
  const args = brandArgs(
    { tool: 't.mjs', seedDir: '/s' },
    { site: 'http://x', dir: '/d', applyId: 'brand-1', files: {} }
  )
  assert.ok(!args.some((x) => /^--(logo|favicon|share)/.test(x)), 'a picture not given is no flag')
})

test('end to end with the real tool: settings.logo, settings.favicon, seo.defaultOgImage and the chrome entry’s logo_dark on the site', async () => {
  const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
  const seed = JSON.parse(readFileSync(path.join(THEME, 'seed', 'seed.json'), 'utf8'))
  const mock = createMockEmdash()
  for (const e of seed.content.site)
    mock.state.addEntry('site', e.slug, e.locale, e.data, e.locale === 'en' ? {} : { status: 'draft' })
  mock.state.schema.set('site', { item: { slug: 'site' }, fields: [{ slug: 'title', type: 'string' }] })
  const origin = await mock.listen()
  try {
    connectEmdashBrand({ siteAccess: async () => ({ origin, token: TOKEN }), run: runNode, workRoot: root() })
    const result = await brand({ pack: await pack() })
    assert.deepEqual(result.skipped, [])
    assert.deepEqual(result.written, ['logo', 'logo-dark', 'favicon', 'share'])
    const { logo, favicon, seo } = mock.state.settings
    assert.ok(mock.state.media.has(logo.mediaId) && mock.state.media.has(favicon.mediaId))
    assert.ok(mock.state.media.has(seo.defaultOgImage.mediaId), 'the share card is the default share picture')
    assert.notEqual(seo.defaultOgImage.mediaId, logo.mediaId)
    assert.equal(logo.alt, 'Golden Crust')
    const en = [...mock.state.entries.values()].find((e) => e.collection === 'site' && e.locale === 'en')
    assert.ok(mock.state.media.has(en.live.logo_dark.id), 'site/site/en.logo_dark holds the dark logo')
    const hidden = [...mock.state.entries.values()].filter(
      (e) => e.collection === 'site' && e.locale !== 'en'
    )
    assert.ok(
      hidden.length > 0 && hidden.every((e) => e.status === 'draft' && e.live.logo_dark === undefined)
    )
  } finally {
    await mock.close()
  }
})
