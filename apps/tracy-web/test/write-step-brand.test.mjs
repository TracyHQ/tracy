// The brand stage of the write step, through its entry point (ADR 0044, decision 4): a brand file in, orders to a fake
// site door and report lines out. The kit and the brand file are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { exportBrandOrders } from '../src/write-step/brand-write-orders.js'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { runWriteStep } from '../src/write-step/write-step.js'
import { copy, frozenFiles, plan, SITE } from './_write-step-run.mjs'
import { ACCENT_HTML, brandFile, brandKit, brandSite, NAME, runBrand } from './_write-step-brand.mjs'

const b64 = (s) => Buffer.from(s).toString('base64')
const uploadOf = (site, name) => {
  const hit = [...site.uploads].find(([, bytes]) => bytes === b64(`invented bytes of ${name}`))
  assert.ok(hit, `${name} was uploaded`)
  return hit[0]
}

test('the export turns a brand file into write orders, one per item, with no bytes and no site', () => {
  const { orders, problems, templateFolder, headModule } = exportBrandOrders({
    brand: brandFile(),
    kit: brandKit().doc
  })
  assert.deepEqual(problems, [])
  assert.equal(templateFolder, 'demo_gym')
  assert.equal(headModule, 88)
  const by = (slot) => orders.find((o) => o.slot === slot)
  assert.deepEqual(
    [by('setting:global configuration sitename').via, by('setting:global configuration sitename').key],
    ['identity', 'sitename']
  )
  assert.equal(by('block-88.0').key, 'module-88.0')
  assert.equal(by('block-88.1').via, 'contract')
  assert.equal(by('block-88.1').file, 'spots/logo-footer-1.png')
  assert.equal(by('siteSetting-2.0').key, 'site_logo_dark')
  assert.equal(by('logo-offcanvas-2').key, 'site_logo_dark_small')
  assert.equal(by('favicon-ico').key, 'other_faviconFile')
  assert.equal(by('favicon-phone-180').via, 'head')
  assert.equal(by('accent').contract, 'joomla-demo-gym-modes')
  assert.equal(by('printed:document-title:page').via, 'none')
})

test('the name reaches the CMS setting, the template profile and its slot, in the one contract call', async () => {
  const { site, report, line } = await runBrand()
  assert.equal(report.status, 'done')
  const [identity] = site.of('site.identity', 'set')
  assert.deepEqual(identity.params.fields, { sitename: NAME })
  assert.ok(identity.params.apply_id, 'an apply id, so it can be taken back')
  const [set] = site.of('template.siteSettings', 'set')
  assert.equal(set.params.template, 'demo_gym')
  assert.equal(set.params.profiles.default.site_name, NAME)
  const applies = site.of('content.contract', 'apply')
  assert.equal(applies.length, 1)
  assert.equal(applies[0].params.changes['module-88.0'], NAME)
  assert.deepEqual(
    { ...line('block-88.0') },
    {
      slot: 'block-88.0',
      key: 'module-88.0',
      owner: 'brand',
      status: 'written',
      reason: null,
      readBack: null,
      part: 'brand-name',
      ordered: NAME
    }
  )
})

test("a printed name follows the site name and a handed-off one is reported as the writer's", async () => {
  const { line } = await runBrand()
  assert.equal(line('printed:title-attribute:header').status, 'written')
  assert.match(line('printed:title-attribute:header').reason, /site name/)
  assert.equal(line('printed:document-title:page').status, 'skipped')
  assert.match(line('printed:document-title:page').reason, /writer/)
})

test('every logo reaches its place: header settings, the small-logo settings of the phone menu, the footer slot', async () => {
  const { site, parts } = await runBrand()
  const values = site.of('template.siteSettings', 'set')[0].params.profiles.default
  assert.equal(values.site_logo, uploadOf(site, 'spots/logo-header-1.png'))
  assert.equal(values.site_logo_dark, uploadOf(site, 'spots/logo-header-2.png'))
  assert.equal(values.site_logo_small, uploadOf(site, 'spots/logo-offcanvas-1.png'))
  assert.equal(values.site_logo_dark_small, uploadOf(site, 'spots/logo-offcanvas-2.png'))
  const footer = uploadOf(site, 'spots/logo-footer-1.png')
  assert.match(footer, /^images\/tracy-brand\/[\w/-]+\.png$/)
  assert.equal(site.of('content.contract', 'apply')[0].params.changes['module-88.1'], footer)
  const lines = parts('brand-logo')
  assert.equal(lines.length, 5)
  assert.ok(lines.every((l) => l.status === 'written' && l.owner === 'brand'))
  assert.deepEqual(
    lines.map((l) => l.spot),
    ['logo-header-1', 'logo-header-2', 'logo-offcanvas-1', 'logo-offcanvas-2', 'logo-footer-1']
  )
})

test('a profile without small-logo settings gets the phone menu picture by CSS in the head block', async () => {
  const { site, line } = await runBrand({
    site: { settings: { default: { settings: { site_logo: 'a', site_logo_dark: 'b' } } } }
  })
  const values = site.of('template.siteSettings', 'set')[0].params.profiles.default
  assert.equal(values.site_logo_small, undefined)
  const content = site.holds.module.get(88)
  assert.ok(content.includes(`content:url(/${uploadOf(site, 'spots/logo-offcanvas-1.png')})`))
  assert.equal(line('logo-offcanvas-1').status, 'written')
  assert.match(line('logo-offcanvas-1').reason, /CSS/)
})

test('a profile with one small-logo setting takes both sides, so no picture falls to CSS', async () => {
  const { site, line } = await runBrand({
    site: { settings: { default: { settings: { site_logo: 'a', site_logo_small: 'c' } } } }
  })
  const values = site.of('template.siteSettings', 'set')[0].params.profiles.default
  assert.equal(values.site_logo_dark_small, uploadOf(site, 'spots/logo-offcanvas-2.png'))
  assert.ok(!site.holds.module.get(88).includes('content:url'))
  assert.equal(line('logo-offcanvas-2').reason, null)
})

test('the .ico is the template favicon; PNG 32, PNG 512 and the phone icon reach the head block', async () => {
  const { site, parts } = await runBrand()
  const ico = uploadOf(site, 'favicon/favicon.ico')
  assert.match(ico, /\.ico$/)
  assert.equal(site.of('template.siteSettings', 'set')[0].params.profiles.default.other_faviconFile, ico)
  const update = site.of('content.update').find((c) => c.params.kind === 'module' && c.params.id === 88)
  const content = update.params.fields.content
  assert.ok(content.startsWith('<a href="index.php">'), 'what the block held is kept')
  assert.ok(
    content.includes(
      `<link rel="icon" type="image/png" sizes="32x32" href="/${uploadOf(site, 'favicon/favicon-32.png')}">`
    )
  )
  assert.ok(content.includes(`sizes="512x512" href="/${uploadOf(site, 'favicon/favicon-512.png')}"`))
  assert.ok(
    content.includes(
      `<link rel="apple-touch-icon" sizes="180x180" href="/${uploadOf(site, 'favicon/apple-touch-icon-180.png')}">`
    )
  )
  assert.deepEqual(
    parts('brand-favicon').map((l) => [l.slot, l.status]),
    [
      ['favicon-ico', 'written'],
      ['favicon-32', 'written'],
      ['favicon-512', 'written'],
      ['favicon-phone-180', 'written']
    ]
  )
})

test('a second run replaces the head block instead of adding another', async () => {
  const site = brandSite()
  const { frozenWithBrand } = await import('./_write-step-brand.mjs')
  const frozen = frozenWithBrand()
  const input = {
    door: site.door,
    siteKey: SITE,
    kit: brandKit(),
    files: frozen.files,
    sleep: async () => {},
    accentPlace: async () => ({
      title: 'Tracy design system',
      position: 'top-a',
      ordering: 0,
      style: 'System-none'
    })
  }
  await runWriteStep(input)
  const first = site.holds.module.get(88)
  await runWriteStep(input)
  frozen.done()
  assert.equal(site.holds.module.get(88), first)
})

test('the accent is written by the step itself as one module on every page', async () => {
  const { site, line } = await runBrand()
  const create = site.of('content.update').find((c) => c.params.kind === 'module' && !c.params.id)
  assert.equal(create.params.fields.content, ACCENT_HTML)
  assert.equal(create.params.fields.module, 'mod_custom')
  assert.equal(create.params.fields.position, 'top-a')
  assert.equal(create.params.fields.title, 'Tracy design system')
  assert.equal(create.params.fields.published, 1)
  assert.equal(JSON.parse(create.params.fields.params).style, 'System-none')
  const assign = site.of('content.update').find((c) => c.params.kind === 'moduleAssignment')
  assert.equal(assign.params.id, 77)
  assert.equal(assign.params.fields.menuids, '[0]')
  assert.equal(line('accent').status, 'written')
  assert.equal(line('accent').part, 'brand-accent')
  assert.ok(
    site.log.every((c) => c.action !== 'site-ds-slot'),
    'no host job'
  )
})

test('an accent module already on the site is updated, not added again', async () => {
  const { site } = await runBrand({
    site: { modules: [{ id: 91, title: 'Tracy design system', module: 'mod_custom' }] }
  })
  const modules = site.of('content.update').filter((c) => c.params.kind === 'module' && c.params.id !== 88)
  assert.deepEqual(
    modules.map((c) => c.params.id),
    [91]
  )
  assert.equal(site.of('content.update').find((c) => c.params.kind === 'moduleAssignment').params.id, 91)
})

test('a brand file that keeps the template accent writes no module and says so', async () => {
  const brand = brandFile()
  brand.colours = { decision: 'kept-template', module: null }
  const { site, line } = await runBrand({ files: { brand } })
  assert.equal(site.of('content.update').filter((c) => c.params.kind === 'module' && !c.params.id).length, 0)
  assert.equal(line('accent').status, 'skipped')
  assert.match(line('accent').reason, /template/)
})

test('a run writes in the ADR order: site read, brand, a fresh read, then the one contract call', async () => {
  const seen = []
  const { site, report } = await runBrand({ deps: { onPhase: async (p) => void seen.push(p) } })
  assert.deepEqual(seen, ['check', 'inspect', 'hide', 'brand', 'write', 'settings'])
  assert.equal(typeof report.timings.brand, 'number')
  const names = site.log.map((c) => (c.action === 'content.contract' ? c.params.operation : c.action))
  assert.equal(names[0], 'inspect')
  const applyAt = names.indexOf('apply')
  const lastBrand = Math.max(
    ...['site.identity', 'media.upload', 'template.siteSettings', 'content.update'].map((n) =>
      names.lastIndexOf(n)
    )
  )
  assert.ok(lastBrand < applyAt, 'brand comes before the contract call')
  assert.equal(names.lastIndexOf('inspect') > lastBrand, true, 'the site is read again after the brand')
  // The head block and the accent moved the revision; the contract call must name the new one.
  assert.equal(site.of('content.contract', 'apply')[0].params.expected_revision, 'rev-4')
})

test('a site that fails the read gets no brand: nothing is written', async () => {
  const { site, report } = await runBrand({ site: { contract: { contract: 'demo-gym/j6/9.9.9' } } })
  assert.equal(report.cause.code, 'CONTRACT_MISMATCH')
  assert.deepEqual(site.writes(), [])
  assert.ok(report.slots.filter((s) => s.part === 'brand-name').every((s) => s.status !== 'written'))
})

test('a copy-only run keeps working: no brand action, no brand line, no brand phase', async () => {
  const site = brandSite()
  const frozen = frozenFiles()
  const seen = []
  const report = await runWriteStep({
    door: site.door,
    siteKey: SITE,
    kit: brandKit(),
    files: frozen.files,
    sleep: async () => {},
    onPhase: async (p) => void seen.push(p)
  })
  frozen.done()
  assert.equal(report.status, 'done')
  assert.deepEqual(seen, ['check', 'inspect', 'hide', 'write', 'settings'])
  assert.ok(site.log.every((c) => ['content.contract', 'info'].includes(c.action)))
  assert.ok(!report.slots.some((s) => String(s.part ?? '').startsWith('brand')))
  assert.equal(report.inputs.brand, undefined)
})

test('a slot the copy fills with other words is a dispute: nothing written, both files named', async () => {
  const c = copy()
  c.slots.push({ slot: 'block-88.0', owner: 'writer', text: 'Another Name', factIds: [] })
  const { report, site } = await runBrand({ files: { copyFile: c } })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'SLOT_DISPUTE')
  assert.match(report.cause.reason, /block-88\.0/)
  assert.deepEqual(report.disputes[0].claims.map((x) => x.file).sort(), ['brand-file.json', 'copy.json'])
  assert.equal(site.log.length, 0)
})

test('the footer logo frame in the copy is a dispute too; the same name in the copy is not', async () => {
  const framed = copy()
  framed.slots.push({ slot: 'block-88.1', owner: 'writer', text: 'not a picture', factIds: [] })
  const disputed = await runBrand({ files: { copyFile: framed } })
  assert.equal(disputed.report.cause.code, 'SLOT_DISPUTE')
  const same = copy()
  same.slots.push({ slot: 'block-88.0', owner: 'writer', text: NAME, factIds: [] })
  const repeated = await runBrand({ files: { copyFile: same } })
  assert.equal(repeated.report.status, 'done')
  assert.deepEqual(repeated.report.disputes, [])
  assert.equal(repeated.report.slots.filter((s) => s.slot === 'block-88.0').length, 1)
  assert.equal(repeated.line('block-88.0').owner, 'brand')
})

test('a picture the brand file names and the folder lacks stops the run before the site is asked', async () => {
  const { report, site } = await runBrand({ files: { missing: ['favicon/favicon-512.png'] } })
  assert.equal(report.cause.code, 'MISSING_FILE')
  assert.match(report.cause.reason, /favicon-512\.png/)
  assert.equal(site.log.length, 0)
})

const badBrands = {
  'another kit': [(b) => (b.kit = 'other-gym@2.0.0'), /other-gym@2\.0\.0/],
  'not a brand file': [(b) => (b.kind = 'site-copy'), /kind/],
  'another version': [(b) => (b.version = 9), /version/],
  'a spot the kit lacks': [(b) => (b.logo.spots[0].spot = 'logo-side-9'), /logo-side-9/],
  'a path out of its folder': [(b) => (b.favicon.ico = '../secret.ico'), /secret\.ico/],
  'a module with no mark': [(b) => (b.colours.module.file = 'spots/logo-header-1.png'), /tracy-ds-slot/]
}
for (const [what, [change, words]] of Object.entries(badBrands))
  test(`a brand file with ${what} stops the run with nothing asked of the site`, async () => {
    const brand = brandFile()
    change(brand)
    const { report, site } = await runBrand({ files: { brand } })
    assert.equal(report.status, 'stopped')
    assert.equal(report.cause.code, 'BAD_FILE')
    assert.match(report.cause.reason, words)
    assert.equal(site.log.length, 0)
  })

test('a brand file that is not JSON stops the run; a name slot the kit lacks is refused on its own and the rest is written', async () => {
  const broken = await runBrand({ files: { brand: '{nope' } })
  assert.equal(broken.report.cause.code, 'BAD_FILE')
  const brand = brandFile()
  brand.name.slots[2].where = 'block-99.0'
  const unknown = await runBrand({ files: { brand } })
  assert.equal(unknown.report.status, 'done', JSON.stringify(unknown.report.cause))
  const refused = unknown.report.slots.find((s) => s.slot === 'block-99.0')
  assert.equal(refused.status, 'refused')
  assert.match(refused.reason, /the kit has no slot block-99\.0/)
  assert.deepEqual(refused.unaddressable, { step: 2, stepName: 'brand' })
  assert.ok(unknown.site.log.length > 0, 'the rest of the brand is written')
})

test('a slot contract the server does not have stops the run before any write', async () => {
  const { report, site } = await runBrand({ deps: { accentPlace: async () => null } })
  assert.equal(report.cause.code, 'BAD_FILE')
  assert.match(report.cause.reason, /joomla-demo-gym-modes/)
  assert.equal(site.log.length, 0)
})

test("a plugin refusal fails that item in the plugin's words, and the others are still written", async () => {
  const refuse = { 'site.identity': { ok: false, error: 'bad_params', message: 'the name is not clean' } }
  const { report, site, line } = await runBrand({ site: { refuse } })
  assert.equal(report.status, 'done')
  const sitename = line('setting:global configuration sitename')
  assert.equal(sitename.status, 'failed')
  assert.match(sitename.reason, /bad_params: the name is not clean/)
  assert.equal(
    line('printed:title-attribute:header').status,
    'failed',
    'a printed name follows the site name'
  )
  assert.equal(line('siteSetting-1.0').status, 'written')
  assert.equal(site.of('content.contract', 'apply').length, 1)
  assert.ok(report.counts.failed >= 2)
})

test('a refused upload fails what needs that picture and takes the slot out of the contract call', async () => {
  const site = brandSite()
  const door = {
    apply: async (call) =>
      call.action === 'media.upload' && call.params.path.includes('logo-footer-1')
        ? { ok: false, error: 'too_large', message: 'media exceeds the inline limit' }
        : site.door.apply(call)
  }
  const { report, line } = await runBrand({ deps: { door } })
  assert.equal(report.status, 'done')
  assert.equal(line('block-88.1').status, 'failed')
  assert.match(line('block-88.1').reason, /too_large/)
  assert.equal(site.of('content.contract', 'apply')[0].params.changes['module-88.1'], undefined)
  assert.equal(site.of('content.contract', 'apply')[0].params.changes['module-88.0'], NAME)
})

test('the plugin refusing the logo or name slot in the contract call fails that line and keeps the rest', async () => {
  const { report, line, site } = await runBrand({
    site: {
      contract: {
        refuse: { 'module-88.1': { code: 'SLOT_IMAGE_OPAQUE', message: 'this image is opaque' } }
      }
    }
  })
  assert.equal(report.status, 'done')
  assert.equal(line('block-88.1').status, 'failed')
  assert.match(line('block-88.1').reason, /SLOT_IMAGE_OPAQUE/)
  assert.equal(line('block-88.0').status, 'written')
  assert.equal(site.contract.held['module-88.0'], NAME)
})

test('refused settings fail every item in that one call; a refused head block fails only its icons', async () => {
  const settings = await runBrand({
    site: { refuse: { 'template.siteSettings': { ok: false, error: 'unsupported', message: 'no such key' } } }
  })
  for (const slot of ['siteSetting-1.0', 'logo-offcanvas-1', 'favicon-ico'])
    assert.match(settings.line(slot).reason, /no such key/)
  assert.equal(settings.line('favicon-32').status, 'written')
  const head = await runBrand({
    site: { refuse: { 'content.update:module': { ok: false, error: 'write_failed', message: 'locked' } } }
  })
  assert.equal(head.line('favicon-32').status, 'failed')
  assert.equal(head.line('favicon-ico').status, 'written')
  assert.equal(head.line('accent').status, 'failed')
})

test('a busy site is asked again; a door that throws stops the run with the words', async () => {
  const waits = []
  const busy = await runBrand({ site: { busy: 2 }, deps: { sleep: async (ms) => void waits.push(ms) } })
  assert.equal(busy.report.status, 'done')
  assert.equal(waits.length, 2)
  const thrown = await runBrand({ site: { throws: 'media.upload' } })
  assert.equal(thrown.report.status, 'stopped')
  assert.equal(thrown.report.cause.code, 'BRAND_WRITE_FAILED')
  assert.match(thrown.report.cause.reason, /ECONNREFUSED/)
  assert.equal(thrown.line('setting:global configuration sitename').status, 'written')
  assert.equal(thrown.line('siteSetting-1.0').status, 'skipped')
  assert.equal(thrown.site.of('content.contract', 'apply').length, 0)
})

test('a cancel before the brand writes nothing, and one after it skips the contract call', async () => {
  let asked = 0
  const before = await runBrand({ deps: { isCancelled: async () => ++asked > 1 } })
  assert.equal(before.report.status, 'cancelled')
  assert.deepEqual(before.site.writes(), [])
  let again = 0
  const after = await runBrand({ deps: { isCancelled: async () => ++again > 3 } })
  assert.equal(after.report.status, 'cancelled')
  assert.equal(after.site.of('site.identity', 'set').length, 1)
  assert.equal(after.site.of('content.contract', 'apply').length, 0)
  assert.equal(after.line('block-88.1').status, 'skipped')
})

test('the report carries the brand file and each picture by hash, never a path', async () => {
  const { report } = await runBrand()
  assert.equal(report.inputs.brand.file, 'brand-file.json')
  assert.match(report.inputs.brand.sha256, /^[0-9a-f]{64}$/)
  assert.match(report.inputs.brand.assets['favicon/favicon.ico'], /^[0-9a-f]{64}$/)
  assert.ok(!JSON.stringify(report).includes('write-step-brand-'), 'no temporary folder in the report')
})

test('another kit id flows through with no change: nothing is pinned', async () => {
  const kit = brandKit()
  kit.ref = 'made-up/x9/7.7.7'
  kit.doc.contract = 'made-up/x9/7.7.7'
  kit.doc.kit = 'tracy-template-kit/2 made-up/x9/7.7.7'
  kit.doc.quickstart = { product: 'made-up', version: '7.7.7' }
  const p = plan()
  p.kit = kit.doc.kit
  const c = copy()
  c.fingerprint.kit = kit.doc.kit
  const brand = brandFile()
  brand.kit = 'made-up@7.7.7'
  const { report, site } = await runBrand({
    files: { brand, planFile: p, copyFile: c },
    site: { contract: { contract: 'made-up/x9/7.7.7' } },
    deps: { kit }
  })
  assert.equal(report.status, 'done')
  assert.equal(site.of('template.siteSettings', 'set')[0].params.template, 'made_up')
})

const siteCheck = (report, door) => runSiteCheck({ door, report })
const readBackOf = (result) => result.groups.find((g) => g.name === 'read-back')

test('every written brand line says what was ordered and how to read it, and reads back green', async () => {
  const { report, site } = await runBrand()
  const written = report.slots.filter((s) => s.owner === 'brand' && s.status === 'written')
  assert.ok(written.every((s) => s.ordered !== undefined))
  assert.ok(written.every((s) => s.key || s.readFrom))
  assert.ok(written.every((s) => s.part))
  const line = (slot) => report.slots.find((s) => s.slot === slot)
  assert.deepEqual(line('setting:global configuration sitename').readFrom, {
    action: 'site.identity',
    params: { operation: 'read' },
    path: ['fields', 'sitename']
  })
  assert.equal(line('siteSetting-1.0').readFrom.type, 'image')
  assert.equal(line('favicon-32').readFrom.type, 'contains')
  const result = await siteCheck(report, site.readDoor)
  assert.equal(result.status, 'green', JSON.stringify(readBackOf(result).failures))
  assert.equal(readBackOf(result).failures.filter((f) => f.level === 'warn').length, 0)
  assert.equal(readBackOf(result).lines['block-88.1'], 'match')
  assert.equal(readBackOf(result).lines.accent, 'match')
})

test('a brand item changed by hand after the write turns the read-back red, naming it', async () => {
  const { report, site } = await runBrand()
  site.state.identity.sitename = 'Changed by hand'
  site.holds.module.set(88, '<a href="index.php"></a>')
  const result = await siteCheck(report, site.readDoor)
  assert.equal(result.status, 'red')
  const red = readBackOf(result)
    .failures.filter((f) => f.level === 'block')
    .map((f) => f.slot)
  assert.ok(red.includes('setting:global configuration sitename'))
  assert.ok(red.includes('printed:title-attribute:header'))
  assert.ok(red.includes('favicon-512'))
})

test('a refused brand item keeps the read-back red', async () => {
  const refuse = { 'site.identity': { ok: false, error: 'bad_params', message: 'the name is not clean' } }
  const { report, site } = await runBrand({ site: { refuse } })
  const result = await siteCheck(report, site.readDoor)
  assert.equal(result.status, 'red')
  assert.ok(readBackOf(result).failures.some((f) => /the name is not clean/.test(f.reason)))
})

// Accent-only mode (#378): what reaches the site is built from the stylesheets the template serves.
const SERVED = [':root{--brand-main:#f0a000}.btn{background:var(--brand-main);color:#111}a{color:#f0a000}']
const accentColours = (b) => {
  b.colours = { ...b.colours, accent: '#0f7a6b', replaces: '#f0a000', shifts: [] }
  return b
}
const withSheets = (templateSheets) => ({
  files: { brand: accentColours(brandFile()) },
  deps: { templateSheets }
})

test('the module the site gets is built from the served sheets, whatever the brand file holds', async () => {
  let asked = 0
  const { line, site } = await runBrand(
    withSheets(async ({ door, siteKey }) => {
      asked++
      assert.equal(siteKey, SITE)
      assert.equal(typeof door.apply, 'function')
      return SERVED
    })
  )
  assert.equal(asked, 1)
  const written = site
    .of('content.update')
    .find((c) => c.params.kind === 'module' && c.params.fields?.module === 'mod_custom')
  const html = written.params.fields.content
  assert.match(html, /<style id="tracy-ds-slot">\/\* tracy-ds-slot: brand:accent-only-0f7a6b/)
  assert.match(html, /:root\{--brand-main:var\(--tracy-accent\)\}/)
  assert.doesNotMatch(html, /--ds-c-[a-z-]+:/)
  assert.equal(line('accent').status, 'written')
  assert.equal(line('accent').ordered, html)
})

test('stylesheets that cannot be read, or that never paint the accent, stop the run before anything is written', async () => {
  const unread = await runBrand(withSheets(async () => Promise.reject(new Error('no answer'))))
  assert.equal(unread.report.status, 'stopped')
  assert.equal(unread.report.cause.code, 'TEMPLATE_CSS_UNREADABLE')
  assert.equal(unread.site.of('content.update').length, 0)
  const foreign = await runBrand(withSheets(async () => ['a{color:#123456}']))
  assert.equal(foreign.report.cause.code, 'BAD_ACCENT')
  assert.match(foreign.report.cause.reason, /do not paint its accent #f0a000/)
})

test('with no sheets to read, a whole design-system style is refused, so it can never reach a site again', async () => {
  const { report } = await runBrand({
    files: {
      module:
        '<style id="tracy-ds-slot">/* tracy-ds-slot: brand:121111-ffffff-0f884d */ a{border-radius:18px}</style>'
    }
  })
  assert.equal(report.status, 'stopped')
  assert.match(report.cause.reason, /whole design-system style/)
})
