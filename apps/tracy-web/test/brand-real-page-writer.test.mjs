// The trial-site writer (brand bench, #322): it writes the one configured trial site and no other, reports a write
// error with its reason, and puts every part of the brand where the kit says. The Apply door is a recording fake.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryRunFiles } from '../src/brand-step/run-files.js'
import { createTrialWriter, RealPageWriteError } from '../src/brand-step/real-page/trial-writer.js'
import {
  assertTrialSite,
  guardedCall,
  TrialSiteOnly,
  trialLabelFrom
} from '../src/brand-step/real-page/trial-guard.js'
import { createRealPage } from '../src/brand-step/real-page/real-page-wiring.js'
import { brandFile, kit, shot } from './_real-page-fixtures.mjs'

const TRIAL = {
  site_key: 'key-trial',
  label: 'brand-trial',
  platform: 'joomla',
  quickstart_tag: 'quickstart/ja-boxing/j6',
  quickstart_version: '1.0.10'
}
const OTHER = { site_key: 'key-customer', label: 'customer-shop', platform: 'joomla' }
const png = await shot(64, 64, '#ffffff', '#1a8480', [[16, 16, 32, 32]])

/** The run folder with every file the invented brand file names. */
function runFiles() {
  const names = [
    ...brandFile.logo.spots.map((s) => s.file),
    ...['ico', 'png32', 'png512', 'phone180'].map((k) => brandFile.favicon[k])
  ]
  return memoryRunFiles({
    ...Object.fromEntries(names.map((n) => [n, png])),
    [brandFile.colours.module.file]: Buffer.from(
      '<style>/* tracy-ds-slot: brand:121111--1a8480 */ :root{}</style>'
    )
  })
}

/** A door that records every call; `refuse` names an action it refuses. */
function fakes({
  refuse = null,
  skipBrand = [],
  settings = { profiles: { default: { settings: { site_logo_small: 'x', site_logo_dark_small: 'y' } } } }
} = {}) {
  const calls = []
  const jobs = []
  const door = async (call) => {
    calls.push(call)
    if (call.action === refuse) return { ok: false, message: `${call.action} was refused by the site` }
    if (call.action === 'template.siteSettings' && !call.params.operation) return settings
    if (call.action === 'content.get') return { ok: true, item: { content: '<p>footer</p>' } }
    return { ok: true }
  }
  const writer = (over = {}) =>
    createTrialWriter({
      trialLabel: 'brand-trial',
      findSite: async (label) => [TRIAL, OTHER].find((s) => s.label === label) ?? null,
      door,
      setSiteBrand: async ({ call, siteKey }) => {
        await call({ siteKey, action: 'site.identity', params: { operation: 'set' } })
        return { written: ['sitename', 'logo', 'favicon', 'footer-logo'], skipped: skipBrand }
      },
      accentJob: async (site, payload) => (jobs.push({ site: site.label, payload }), { ok: true }),
      contractModule: () => ({ position: 'top', title: 'DS', ordering: 0, style: 'System-none' }),
      stamp: () => 'tx1',
      ...over
    })
  return { calls, jobs, writer }
}

test('the trial label comes from the environment and an unset one writes nothing', async () => {
  assert.equal(trialLabelFrom({ TRACY_BRAND_TRIAL_SITE: ' brand-trial ' }), 'brand-trial')
  assert.equal(trialLabelFrom({}), null)
  const f = fakes()
  await assert.rejects(f.writer({ trialLabel: null })({ brandFile, files: runFiles(), kit }), TrialSiteOnly)
  assert.equal(f.calls.length, 0)
})

test('the writer refuses every site other than the configured trial site', async () => {
  const f = fakes()
  await assert.rejects(
    f.writer({ trialLabel: 'customer-shop', findSite: async () => TRIAL })({
      brandFile,
      files: runFiles(),
      kit
    }),
    /TRIAL_SITE_ONLY/
  )
  // A site the label resolves to that is not the configured one.
  await assert.rejects(
    f.writer({ findSite: async () => OTHER })({ brandFile, files: runFiles(), kit }),
    /TRIAL_SITE_ONLY/
  )
  assert.equal(f.calls.length, 0)
  assert.throws(() => assertTrialSite(OTHER, 'brand-trial'), TrialSiteOnly)
  // Even for the right site, a call addressed to another key never reaches the door.
  let reached = 0
  const guarded = guardedCall({ site_key: 'key-trial' }, async () => reached++)
  assert.throws(() => guarded({ siteKey: 'key-customer', action: 'media.upload', params: {} }), TrialSiteOnly)
  assert.equal(reached, 0)
  // Nor can a bug in the brand writer reach another site through the door.
  const bad = fakes()
  const sneaky = bad.writer({
    setSiteBrand: async ({ call }) => call({ siteKey: 'key-customer', action: 'site.identity', params: {} })
  })
  await assert.rejects(sneaky({ brandFile, files: runFiles(), kit }), /TRIAL_SITE_ONLY/)
  assert.equal(bad.calls.length, 0)
})

test('the wiring builds nothing without a trial site and account, and checks the site again before a capture', async () => {
  const base = {
    findSite: async () => TRIAL,
    applyAs: async () => ({ ok: true }),
    setSiteBrand: async () => ({}),
    runSiteJob: async () => ({ ok: true }),
    hostCall: async () => ({}),
    contractModule: () => ({})
  }
  assert.equal(createRealPage({ ...base, trialLabel: null, account: 'ops@tracy.test' }), null)
  assert.equal(createRealPage({ ...base, trialLabel: 'brand-trial', account: null }), null)
  const page = createRealPage({
    ...base,
    trialLabel: 'brand-trial',
    account: 'ops@tracy.test',
    findSite: async () => OTHER
  })
  await assert.rejects(page.capture({ site: { label: 'customer-shop' } }), /TRIAL_SITE_ONLY/)
})

test('a full write puts the brand on the trial site and nowhere else', async () => {
  const f = fakes()
  const done = await f.writer()({ brandFile, files: runFiles(), kit })
  assert.deepEqual(done.site, { label: 'brand-trial', siteKey: 'key-trial' })
  assert.ok(f.calls.every((c) => c.siteKey === 'key-trial'))
  const actions = f.calls.map((c) => c.action)
  assert.deepEqual(done.written, [
    'sitename',
    'logo',
    'favicon',
    'footer-logo',
    'menu-logo-small',
    'head-block',
    'accent'
  ])
  // The phone menu's own pictures through the T4 small-logo settings.
  const small = f.calls.find((c) => c.action === 'template.siteSettings' && c.params.operation === 'set')
  assert.deepEqual(Object.keys(small.params.profiles.default), ['site_logo_small', 'site_logo_dark_small'])
  assert.match(small.params.profiles.default.site_logo_small, /^images\/tracy-brand\/menu-mark-/)
  // PNG 32, PNG 512, phone icon 180 and the ico go into the kit's head block (module 170).
  const head = f.calls.find((c) => c.action === 'content.update')
  assert.equal(head.params.id, 170)
  for (const part of [
    'sizes="32x32"',
    'sizes="512x512"',
    'rel="apple-touch-icon" sizes="180x180"',
    'x-icon',
    '<p>footer</p>'
  ])
    assert.ok(head.params.fields.content.includes(part), part)
  assert.ok(actions.indexOf('content.update') > actions.indexOf('site.identity'))
  // The accent goes as the accent-only Design system module.
  assert.equal(f.jobs.length, 1)
  assert.equal(f.jobs[0].site, 'brand-trial')
  assert.equal(f.jobs[0].payload.system, 'brand:121111--1a8480')
  assert.equal(f.jobs[0].payload.module.position, 'top')
})

test('a template that ignores the small-logo settings gets the CSS fallback in the head block', async () => {
  const f = fakes({ settings: { profiles: { default: { settings: { site_logo: 'x' } } } } })
  const done = await f.writer()({ brandFile, files: runFiles(), kit })
  assert.ok(!done.written.includes('menu-logo-small'))
  assert.match(
    f.calls.find((c) => c.action === 'content.update').params.fields.content,
    /<style>.*menu-mark-.*<\/style>/
  )
})

test('a write error stops with its stage and the site reason', async () => {
  for (const [refuse, stage, reason] of [
    ['content.update', 'head', /content\.update was refused by the site/],
    ['media.upload', 'menu-logo', /media\.upload was refused/]
  ]) {
    const f = fakes({ refuse })
    await assert.rejects(f.writer()({ brandFile, files: runFiles(), kit }), (e) => {
      assert.ok(e instanceof RealPageWriteError)
      assert.equal(e.stage, stage)
      assert.match(e.reason, reason)
      return true
    })
  }
  const skipped = fakes({ skipBrand: [{ where: 'logo', reason: 'the site refused its logo settings' }] })
  await assert.rejects(
    skipped.writer()({ brandFile, files: runFiles(), kit }),
    (e) => e.stage === 'brand' && /logo: the site refused/.test(e.reason)
  )
  const accent = fakes()
  await assert.rejects(
    accent.writer({ accentJob: async () => ({ ok: false, reason: 'DS_TEMPLATE_MOVED' }) })({
      brandFile,
      files: runFiles(),
      kit
    }),
    (e) => e.stage === 'accent' && /DS_TEMPLATE_MOVED/.test(e.reason)
  )
})

test('the safe version, which keeps the template accent, writes no accent module', async () => {
  const f = fakes()
  const safe = { ...brandFile, colours: { ...brandFile.colours, module: null } }
  const done = await f.writer()({ brandFile: safe, files: runFiles(), kit })
  assert.ok(!done.written.includes('accent'))
  assert.equal(f.jobs.length, 0)
})
