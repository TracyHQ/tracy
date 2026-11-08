// The picture stage of the write step, through its entry point (ADR 0044, decision 4): a picture package in, uploads and
// one contract call to a fake site door, report lines out. Every picture here is a tiny generated one.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { runWriteStep } from '../src/write-step/write-step.js'
import { brandFile, brandKit, frozenWithBrand, NAME } from './_write-step-brand.mjs'
import { runStep, SITE } from './_write-step-run.mjs'
import {
  BACKGROUND,
  FIGURE,
  frozenWithPictures,
  HERO,
  picture,
  pictureKit,
  picturePackage,
  pictureSite,
  PREVIEW,
  runPictures
} from './_write-step-pictures.mjs'

const uploadedPaths = (site) => site.of('media.upload').map((c) => c.params.path)
const contractCalls = (site) => site.of('content.contract', 'apply')

test('every file is uploaded, then pictures and copy go in the one contract call', async () => {
  const { report, site } = await runPictures()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.deepEqual(uploadedPaths(site).sort(), [HERO, FIGURE, BACKGROUND].map((p) => p.entry.sitePath).sort())
  const [upload] = site.of('media.upload')
  assert.ok(upload.params.apply_id, 'an apply id, so it can be taken back')
  assert.doesNotMatch(
    upload.params.apply_id,
    /^contract-/,
    'the plugin refuses a contract receipt on an upload'
  )
  assert.equal(
    site.uploads.get(HERO.entry.sitePath),
    HERO.bytes.toString('base64'),
    'the bytes of the file reach the site'
  )
  const calls = contractCalls(site)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.changes['module-2.pic'], HERO.entry.sitePath)
  assert.equal(calls[0].params.changes['article-7.5'], HERO.entry.sitePath, 'one file in two frames')
  assert.equal(calls[0].params.changes['module-2.1'], 'Train with a coach who knows you', 'the copy is in it')
  const order = site.log.map((c) => c.action)
  assert.ok(order.lastIndexOf('media.upload') < order.lastIndexOf('content.contract'), 'uploads come first')
})

test('one file in several frames is uploaded once', async () => {
  const { site } = await runPictures()
  assert.equal(uploadedPaths(site).filter((p) => p === HERO.entry.sitePath).length, 1)
})

test('the contract names the revision the site answers after the picture stage, never the package label', async () => {
  const { site } = await runPictures({ site: { moves: true } })
  assert.equal(contractCalls(site)[0].params.expected_revision, 'rev-after-settings')
})

test('each picture has a report line that the site check can read', async () => {
  const { line, report } = await runPictures()
  assert.deepEqual(
    { ...line('block-2.pic') },
    {
      slot: 'block-2.pic',
      key: 'module-2.pic',
      owner: 'picture',
      status: 'written',
      reason: null,
      readBack: null,
      part: 'picture',
      ordered: HERO.entry.sitePath
    }
  )
  assert.equal(line('article-7.5').key, 'article-7.5')
  assert.equal(report.inputs.pictures.file, 'mapping.json')
  assert.match(report.inputs.pictures.sha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(
    Object.keys(report.inputs.pictures.assets).sort(),
    [HERO, FIGURE, BACKGROUND].map((p) => p.entry.file).sort()
  )
  assert.equal(typeof report.timings.pictures, 'number')
})

test('a slot the plugin refuses is dropped and written around, in the plugin words', async () => {
  const refuse = {
    'module-2.pic': {
      code: 'SLOT_IMAGE_TOO_SMALL',
      message: 'Image is too small for its slot',
      limit: 672,
      actual: 491
    }
  }
  const { report, site, line } = await runPictures({ site: { contract: { refuse } } })
  assert.equal(report.status, 'done')
  assert.equal(line('block-2.pic').status, 'failed')
  assert.match(line('block-2.pic').reason, /SLOT_IMAGE_TOO_SMALL.*limit 672, actual 491/)
  assert.equal(line('block-2.pic').ordered, HERO.entry.sitePath)
  assert.equal(line('article-7.5').status, 'written')
  const calls = contractCalls(site)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].params.changes['module-2.pic'], undefined)
  assert.equal(calls[1].params.changes['article-7.5'], HERO.entry.sitePath)
})

test('a refused upload fails the frames that use it, keeps them out of the call and leaves the others', async () => {
  const refusePath = {
    [HERO.entry.sitePath]: { ok: false, error: 'too_large', message: 'media exceeds the inline limit' }
  }
  const { report, site, line } = await runPictures({ site: { refusePath } })
  assert.equal(report.status, 'done')
  for (const slot of ['block-2.pic', 'article-7.5']) {
    assert.equal(line(slot).status, 'failed')
    assert.match(line(slot).reason, /too_large: media exceeds the inline limit/)
  }
  const [call] = contractCalls(site)
  assert.equal(call.params.changes['module-2.pic'], undefined)
  assert.equal(call.params.changes['module-2.figure'], FIGURE.entry.sitePath)
  assert.equal(line('block-2.figure').status, 'written')
})

test('an upload that throws ends the run before the contract call', async () => {
  const { report, site } = await runPictures({ site: { throwsOn: 'media.upload' } })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, 'PICTURE_WRITE_FAILED')
  assert.equal(contractCalls(site).length, 0)
})

test('a picture site the site check reads back ignoring the media suffix and a leading slash', async () => {
  const { report, site } = await runPictures()
  const image = new Set(['module-2.pic', 'article-7.5', 'module-2.figure'])
  const held = { 'module-2.pic': `/${HERO.entry.sitePath}#joomlaImage://local-images/x?width=1&height=1` }
  const door = {
    async apply(call) {
      const answer = await site.readDoor.apply(call)
      if (call.action !== 'content.contract') return answer
      const slots = answer.slots.map((s) => ({
        ...s,
        type: image.has(s.key) ? 'image' : 'text',
        current: held[s.key] ?? s.current
      }))
      return { ...answer, slots }
    }
  }
  const check = await runSiteCheck({ door, report })
  const lines = check.groups.find((g) => g.name === 'read-back').lines
  assert.equal(lines['block-2.pic'], 'match')
  assert.equal(lines['article-7.5'], 'match')
  assert.equal(lines['block-2.figure'], 'match')
  assert.equal(lines['site.body-background'], 'match', 'the setting reads back through its own door')
  assert.ok(
    check.groups
      .find((g) => g.name === 'read-back')
      .reads.some((r) => r.read === 'template.siteSettings read')
  )
})

test('the body background goes through its setting, once, after its file, whatever the package says of the door', async () => {
  const { report, site, line } = await runPictures()
  assert.equal(
    picturePackage().siteSettings[0].writeDoor,
    'none',
    'the frozen field this does not take as an order'
  )
  const sets = site.of('template.siteSettings', 'set')
  assert.equal(sets.length, 1)
  assert.equal(sets[0].params.template, 'demo_gym', 'the template comes from the kit')
  assert.deepEqual(sets[0].params.fields, { body_bg_img: BACKGROUND.entry.sitePath })
  assert.ok(sets[0].params.apply_id)
  const position = (found) => site.log.findIndex(found)
  assert.ok(
    position((c) => c.action === 'media.upload' && c.params.path === BACKGROUND.entry.sitePath) <
      position((c) => c.action === 'template.siteSettings' && c.params.operation === 'set'),
    'the setting names a file already on the site'
  )
  assert.equal(contractCalls(site)[0].params.changes['block-3.bg'], undefined)
  assert.equal(contractCalls(site)[0].params.changes['module-3.bg'], undefined, 'it is not a contract slot')
  assert.deepEqual(
    { ...line('site.body-background') },
    {
      slot: 'site.body-background',
      key: null,
      owner: 'picture',
      status: 'written',
      reason: null,
      readBack: null,
      part: 'body-background',
      frame: 'block-3.bg',
      ordered: BACKGROUND.entry.sitePath,
      readFrom: {
        action: 'template.siteSettings',
        params: { operation: 'read', template: 'demo_gym' },
        path: ['profiles', 'default', 'settings', 'body_bg_img'],
        type: 'image'
      }
    }
  )
  assert.equal(report.disputes.length, 0)
})

test('several frames of the one setting with one file are one owner and one line', async () => {
  const pictures = picturePackage()
  pictures.siteSettings.push({ ...pictures.siteSettings[0], frame: 'block-4.bg' })
  const { report, site, parts } = await runPictures({ files: { pictures } })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes.length, 0)
  assert.equal(parts('body-background').length, 1)
  assert.equal(site.of('template.siteSettings', 'set').length, 1)
})

test('two frames of the one setting with different files are a dispute settled on the setting; the run goes on', async () => {
  const other = picture('other background')
  const pictures = picturePackage()
  pictures.siteSettings.push({ ...pictures.siteSettings[0], ...other.entry, frame: 'block-4.bg' })
  const { report, site } = await runPictures({
    files: { pictures, files: [HERO, FIGURE, BACKGROUND, other] }
  })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes[0].slot, 'site.body-background')
  assert.ok(report.disputes[0].settled)
  assert.ok(site.of('content.contract', 'apply').length >= 1)
})

test('a plugin older than the setting fails its line in words that name the release, and the rest goes on', async () => {
  const { report, site, line } = await runPictures({ site: { component: '0.24.77' } })
  assert.equal(report.status, 'done')
  assert.equal(site.of('template.siteSettings', 'set').length, 0)
  assert.equal(line('site.body-background').status, 'failed')
  assert.match(line('site.body-background').reason, /0\.24\.78/)
  assert.equal(line('site.body-background').readFrom, undefined)
  assert.equal(line('block-2.pic').status, 'written')
})

test('a template with no site profile fails the line instead of inventing one', async () => {
  const { line, site } = await runPictures({ site: { settings: {} } })
  assert.equal(line('site.body-background').status, 'failed')
  assert.match(line('site.body-background').reason, /no site profile/)
  assert.equal(site.of('template.siteSettings', 'set').length, 0)
})

test('a frame the kit names no writable setting for is reported, not invented, and its file not sent', async () => {
  const kit = pictureKit({ settingSlots: [] })
  const { report, site, line } = await runPictures({ kit })
  assert.equal(report.status, 'done')
  assert.equal(site.of('template.siteSettings', 'set').length, 0)
  assert.ok(!uploadedPaths(site).includes(BACKGROUND.entry.sitePath))
  assert.equal(line('block-3.bg').status, 'skipped')
  assert.match(line('block-3.bg').reason, /no writable setting/)
  assert.equal(line('block-3.bg').part, 'body-background')
})

test('a setting entry that is a neutral preview is not written', async () => {
  const pictures = picturePackage()
  pictures.siteSettings[0].preview = true
  const { site, line } = await runPictures({ files: { pictures } })
  assert.equal(site.of('template.siteSettings', 'set').length, 0)
  assert.equal(line('block-3.bg').status, 'skipped')
  assert.match(line('block-3.bg').reason, /not drawn yet/)
})

test('a picture on a text slot the copy fills is a dispute the words win, naming both files; the picture is not sent there', async () => {
  const pictures = picturePackage()
  pictures.mapping.changes['module-2.1'] = HERO.entry.sitePath
  const { report, site, line } = await runPictures({ files: { pictures } })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes[0].slot, 'block-2.1')
  assert.deepEqual(report.disputes[0].claims.map((c) => c.file).sort(), ['copy.json', 'mapping.json'])
  assert.equal(report.disputes[0].settled.owner, 'writer')
  assert.equal(line('block-2.1').status, 'written')
  const sent = site.of('content.contract', 'apply').map((c) => c.params.changes['module-2.1'])
  assert.deepEqual(sent, ['Train with a coach who knows you'])
})

test('a picture on a slot the plan hides is a dispute the plan wins; the picture is not sent there', async () => {
  const pictures = picturePackage()
  pictures.mapping.changes['module-2.3'] = HERO.entry.sitePath
  const { report } = await runPictures({ files: { pictures } })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes[0].slot, 'block-2.3')
  assert.equal(report.disputes[0].settled.owner, 'plan')
})

test('a frame the package hides and the copy fills is a dispute settled on that frame', async () => {
  const pictures = picturePackage()
  pictures.hidden.push({ frame: 'block-2.1', key: 'module-2.1', reason: 'invented' })
  const { report } = await runPictures({ files: { pictures } })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes[0].slot, 'block-2.1')
})

test('a background on a frame the plan hides is a dispute the plan wins, not a silent overwrite', async () => {
  const pictures = picturePackage()
  pictures.siteSettings[0].frame = 'block-2.3'
  const kit = pictureKit()
  kit.doc.site.settingSlots[0].frames.push('block-2.3')
  const { report } = await runPictures({ kit, files: { pictures } })
  assert.equal(report.status, 'done')
  assert.equal(report.disputes.find((d) => d.slot === 'block-2.3').settled.owner, 'plan')
})

test('a slot in the picture package no longer reads as having no owner', async () => {
  const kit = pictureKit()
  kit.doc.blocks.find((b) => b.id === 'block-2').slots.push({ id: 'block-2.pic', type: 'image' })
  const { report } = await runPictures({ kit })
  assert.ok(!report.unowned.some((u) => u.slot === 'block-2.pic'))
})

test('a hidden frame belongs to the hide stage: one line, its picture never sent', async () => {
  const { report, site, line } = await runPictures()
  const hidden = line('block-2.gone')
  assert.equal(report.slots.filter((s) => s.slot === 'block-2.gone').length, 1)
  assert.notEqual(hidden.status, 'written')
  assert.equal(hidden.owner, 'picture')
  assert.equal(hidden.key, 'module-2.gone')
  assert.equal(contractCalls(site)[0].params.changes['module-2.gone'], undefined)
})

test('a frame step 8 hid says step 8 hid it and why, never that the plan hides it (card AU)', async () => {
  const { line } = await runPictures({ site: { info: { hide_ops: { version: 1 } } } })
  const hidden = line('block-2.gone')
  assert.equal(hidden.status, 'hidden', JSON.stringify(hidden))
  assert.doesNotMatch(hidden.reason, /the plan hides/)
  assert.match(
    hidden.reason,
    /^step 8 \(pictures\) hid this frame, not the plan: no picture of the owner fits/
  )
})

test('with no brand file a painted frame is skipped and its preview never reaches the site', async () => {
  const { site, line } = await runPictures()
  const icon = line('block-3.icon')
  assert.equal(icon.status, 'skipped')
  assert.equal(icon.part, 'picture-painted')
  assert.match(icon.reason, /no brand file/)
  assert.ok(!uploadedPaths(site).includes(PREVIEW.entry.sitePath))
  assert.equal(contractCalls(site)[0].params.changes['module-3.icon'], undefined)
})

test('a backdrop is its own skipped line: the figure is written and is no dispute with itself', async () => {
  const { report, line } = await runPictures()
  assert.equal(report.disputes.length, 0)
  assert.equal(line('block-2.figure').status, 'written')
  const backdrop = line('block-2.figure.backdrop')
  assert.equal(backdrop.status, 'skipped')
  assert.equal(backdrop.part, 'picture-painted')
  assert.equal(backdrop.key, null, 'nothing was ordered on the slot by this line')
  assert.match(backdrop.reason, /no brand file/)
})

const stopsWithNothingSent = async (files, code, words) => {
  const { report, site } = await runPictures({ files })
  assert.equal(report.status, 'stopped')
  assert.equal(report.cause.code, code)
  assert.match(report.cause.reason, words)
  assert.equal(site.log.length, 0, 'no call reached the site')
}

test('a frame the export could not place is refused on its own line, naming the picture step, and the rest is written', async () => {
  const pictures = picturePackage()
  pictures.problems = [{ where: 'block-2.lost', detail: 'the kit has no image slot module-2.lost' }]
  const { report, site, line } = await runPictures({ files: { pictures } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(line('block-2.lost').status, 'refused')
  assert.match(line('block-2.lost').reason, /the kit has no image slot module-2\.lost/)
  assert.deepEqual(line('block-2.lost').unaddressable, { step: 8, stepName: 'pictures' })
  assert.equal(line('block-2.pic').status, 'written')
  assert.ok(site.of('media.upload').length > 0, 'the other pictures are uploaded')
})

test('a package made for another contract stops the run', async () => {
  const pictures = picturePackage()
  pictures.mapping.contract = 'another/j6/9.9.9'
  await stopsWithNothingSent({ pictures }, 'BAD_FILE', /another\/j6\/9\.9\.9/)
})

test('a package that is not the export stops the run', async () => {
  await stopsWithNothingSent({ pictures: { uploads: [] } }, 'BAD_FILE', /pictures/)
})

test('a package that still waits on the customer, or takes off links, stops the run', async () => {
  const pending = picturePackage()
  pending.mapping.pending = ['module-2.pic']
  await stopsWithNothingSent({ pictures: pending }, 'BAD_FILE', /pending/)
  const emptied = picturePackage()
  emptied.mapping.emptyLinks = ['module-2.link']
  await stopsWithNothingSent({ pictures: emptied }, 'BAD_FILE', /emptyLinks/)
})

test('a frame whose file is not in the uploads is refused on its own, and the other frames are written', async () => {
  const pictures = picturePackage()
  pictures.uploads = pictures.uploads.filter((u) => u.sha256 !== FIGURE.entry.sha256)
  const { report, line } = await runPictures({ files: { pictures } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(line('block-2.figure').status, 'refused')
  assert.match(line('block-2.figure').reason, /uploads do not list/)
  assert.equal(line('block-2.figure').unaddressable.step, 8)
  assert.equal(line('block-2.pic').status, 'written')
})

test('a missing file stops the run', async () => {
  await stopsWithNothingSent({ missing: [HERO.entry.file] }, 'MISSING_FILE', /cannot be read/)
})

test('a file outside the package folder stops the run', async () => {
  const pictures = picturePackage()
  pictures.uploads[0] = { ...pictures.uploads[0], file: '../outside.png' }
  await stopsWithNothingSent({ pictures }, 'BAD_FILE', /outside/)
})

test('a file whose bytes are not its hash stops the run', async () => {
  const pictures = picturePackage()
  pictures.uploads[0] = { ...pictures.uploads[0], sha256: 'a'.repeat(64) }
  await stopsWithNothingSent({ pictures }, 'BAD_FILE', /sha256/)
})

test('a site path the plugin would refuse stops the run', async () => {
  const pictures = picturePackage()
  const bad = `images/other/${HERO.entry.sha256}.png`
  pictures.uploads[0] = { ...pictures.uploads[0], sitePath: bad }
  pictures.mapping.changes = { 'module-2.figure': FIGURE.entry.sitePath, 'module-2.pic': bad }
  await stopsWithNothingSent({ pictures }, 'BAD_FILE', /images\/tracy-content/)
})

test('a file at the plugin limit goes, one byte over stops the run with nothing sent', async () => {
  const limit = 8 * 1024 * 1024
  const head = picture('head').bytes.length - Buffer.from('head').length
  const atLimit = picture('fits', limit - head - Buffer.from('fits').length)
  const over = picture('over', limit - head - Buffer.from('over').length + 1)
  const only = (p) => ({
    ...picturePackage(),
    mapping: { ...picturePackage().mapping, changes: { 'module-2.pic': p.entry.sitePath } },
    uploads: [p.entry],
    painted: [],
    siteSettings: []
  })
  const fits = await runPictures({ files: { pictures: only(atLimit), files: [atLimit] } })
  assert.equal(fits.report.status, 'done', JSON.stringify(fits.report.cause))
  assert.equal(atLimit.bytes.length, limit)
  await stopsWithNothingSent({ pictures: only(over), files: [over] }, 'BAD_FILE', /8388608/)
})

test('a slot the site does not have is refused on its own, naming the picture step, and the others are written', async () => {
  const pictures = picturePackage()
  pictures.mapping.changes['module-99.9'] = HERO.entry.sitePath
  const { report, site, line } = await runPictures({ files: { pictures } })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(line('block-99.9').status, 'refused')
  assert.match(line('block-99.9').reason, /module-99\.9/)
  assert.equal(line('block-99.9').unaddressable.step, 8)
  const apply = site.log.find((c) => c.action === 'content.contract' && c.params.operation === 'apply')
  assert.ok(apply && !('module-99.9' in apply.params.changes), 'nothing is sent for it')
  assert.equal(line('block-2.pic').status, 'written')
})

test('a cancelled run stops between the pictures and the contract call', async () => {
  const seen = []
  let asked = 0
  const { report, site } = await runPictures({
    deps: {
      onPhase: async (phase) => void seen.push(phase),
      isCancelled: async () => ++asked >= 4
    }
  })
  assert.equal(report.status, 'cancelled')
  assert.ok(seen.includes('pictures'))
  assert.equal(contractCalls(site).length, 0)
})

test('a brand file and a picture package go together: brand first, one contract call, no dispute', async () => {
  const site = pictureSite()
  const brand = brandFile()
  brand.colours = { decision: 'kept-template', module: null }
  const withBrand = frozenWithBrand({ brand })
  const pictures = frozenWithPictures()
  const kit = brandKit()
  kit.doc.site = { ...pictureKit().doc.site, ...kit.doc.site }
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit,
      contentMap: null,
      files: { ...withBrand.files, pictures: pictures.files.pictures },
      sleep: async () => {},
      accentPlace: async () => null
    })
    assert.equal(report.status, 'done', JSON.stringify(report.cause))
    assert.equal(contractCalls(site).length, 1)
    const { changes } = contractCalls(site)[0].params
    assert.equal(changes['module-88.0'], NAME)
    assert.equal(changes['module-2.pic'], HERO.entry.sitePath)
    const first = (name) => site.log.findIndex((c) => c.action === name)
    assert.ok(first('site.identity') < site.log.findIndex((c) => c.params?.path === HERO.entry.sitePath))
    assert.equal(report.slots.find((s) => s.slot === 'block-2.pic').status, 'written')
    assert.equal(report.slots.find((s) => s.slot === 'block-88.0').status, 'written')
  } finally {
    withBrand.done()
    pictures.done()
  }
})

test('without a picture package nothing about the run changes', async () => {
  const seen = []
  const { report, site } = await runStep({}, {}, { onPhase: async (phase) => void seen.push(phase) })
  assert.deepEqual(seen, ['check', 'inspect', 'hide', 'write', 'settings'])
  assert.equal(report.status, 'done')
  assert.ok(!site.calls.some((c) => c.action !== 'content.contract' && c.action !== 'info'))
  assert.equal(site.calls.filter((c) => c.params.operation === 'inspect').length, 1)
  assert.ok(!report.slots.some((s) => s.owner === 'picture'))
})
