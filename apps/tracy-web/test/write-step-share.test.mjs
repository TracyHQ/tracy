// The share stage of the write step (ADR 0044, decision 4, item 4): each page's share picture is its top picture, or the
// logo when it has none, written on the page's menu item, with the template's Open Graph switch on. Invented data only.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { runShareStage, shownPictures, topPicture, writtenLogo } from '../src/write-step/share-stage.js'
import { HERO, picturePackage, pictureKit } from './_write-step-pictures.mjs'
import { runShare, shareKit, shareSite } from './_write-step-share.mjs'

const LOGO = /^images\/tracy-brand\/logo-header-1-[0-9a-f]{16}\.png$/

test('a page with a top picture shares it, a page without shares the logo, and the switch is on', async () => {
  const { report, site, line } = await runShare()
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(site.params('menuItem', 101).og_img, HERO.entry.sitePath)
  assert.match(site.params('menuItem', 102).og_img, LOGO)
  assert.equal(line('page-home:share-image').status, 'written')
  assert.equal(line('page-about:share-image').status, 'written')
  assert.match(line('page-about:share-image').reason, /logo/)
  for (const id of [11, 12]) assert.equal(site.params('templateStyle', id).system_opengraph, '1')
  assert.equal(
    site.params('templateStyle', 12).system_t4frontendedit,
    '1',
    'the style keeps its other settings'
  )
  assert.equal(
    site.held('templateStyle', 13).params.includes('system_opengraph'),
    false,
    'an admin style is left alone'
  )
  assert.equal(site.params('menuItem', 101).show_icon, 1, 'the item keeps its other settings')
})

test('the share lines read back through the site check', async () => {
  const { report, site } = await runShare()
  const door = {
    async apply(call) {
      const answer = await site.readDoor.apply(call)
      if (call.action === 'content.get') return site.door.apply(call)
      return answer
    }
  }
  const lines = report.slots.filter((s) => s.owner === 'share')
  assert.equal(lines.length, 4, 'two pages, two styles')
  assert.ok(lines.every((s) => s.status === 'written' && s.readFrom && s.ordered !== undefined))
  const check = await runSiteCheck({ door, report })
  const read = check.groups[0].lines
  for (const s of lines) assert.equal(read[s.slot], 'match', s.slot)
  assert.equal(read['page-home:share-image'], 'match')
})

test('a picture the site refused is never named as a share image', async () => {
  const { site, line } = await runShare({
    site: { refusePath: { [HERO.entry.sitePath]: { ok: false, error: 'bad_path', message: 'no' } } },
    kit: shareKit({ blocks: { 'page-home': ['header', 'block-2'] } })
  })
  assert.equal(line('block-2.pic').status, 'failed')
  const home = site.params('menuItem', 101)
  assert.ok(!JSON.stringify(home).includes(HERO.entry.sitePath))
  assert.match(home.og_img, LOGO, 'the page falls back to the logo')
})

test('without a brand file a page with no picture is skipped and says why, nothing is written for it', async () => {
  const { site, line } = await runShare({ withBrand: false, kit: shareKit() })
  assert.equal(line('page-about:share-image').status, 'skipped')
  assert.match(line('page-about:share-image').reason, /no logo/)
  assert.equal(line('page-home:share-image').status, 'written')
  assert.equal(site.params('menuItem', 102).og_img, undefined)
})

test('no picture and no logo anywhere writes nothing, not even the switch', async () => {
  const { site, line } = await runShare({
    withBrand: false,
    kit: shareKit({ blocks: { 'page-home': ['header', 'block-9'] } })
  })
  assert.equal(line('page-home:share-image').status, 'skipped')
  assert.equal(site.params('templateStyle', 11).system_opengraph, undefined)
  assert.ok(!site.log.some((c) => c.action === 'content.update' && c.params.kind === 'templateStyle'))
})

test('a page no published menu item opens is skipped', async () => {
  const menu = [
    { id: 101, published: 1, home: 1, path: 'home', menutype: 'mainmenu', params: '{}' },
    { id: 102, published: 0, home: 0, path: 'about-us/coach', menutype: 'mainmenu', params: '{}' }
  ]
  const { line } = await runShare({ site: { menu } })
  assert.equal(line('page-about:share-image').status, 'skipped')
  assert.match(line('page-about:share-image').reason, /menu item/)
})

test('a refused switch fails its line, in the plugin words, and the pictures are still written', async () => {
  const { site, line } = await runShare({
    site: { refuseKind: { templateStyle: { ok: false, error: 'unsupported', message: 'no such param' } } }
  })
  assert.equal(line('share-switch:templateStyle-11').status, 'failed')
  assert.match(line('share-switch:templateStyle-11').reason, /unsupported: no such param/)
  assert.equal(site.params('menuItem', 101).og_img, HERO.entry.sitePath)
})

test('a refused menu write fails the page line', async () => {
  const { line } = await runShare({
    site: { refuseKind: { menuItem: { ok: false, error: 'locked', message: 'row is locked' } } }
  })
  assert.equal(line('page-home:share-image').status, 'failed')
  assert.match(line('page-home:share-image').reason, /locked: row is locked/)
})

test('a run without pages in the kit has no share lines', async () => {
  const kit = shareKit()
  delete kit.doc.pages
  const { report } = await runShare({ kit })
  assert.equal(report.slots.filter((s) => s.owner === 'share').length, 0)
})

test('shownPictures keeps written pictures only, and a setting shows in every frame the kit lists', () => {
  const kit = pictureKit().doc
  const line = (over) => ({
    part: 'picture',
    status: 'written',
    ordered: 'images/tracy-content/a.png',
    ...over
  })
  const shown = shownPictures({
    kit,
    pictureLines: [
      line({ slot: 'block-1.x', status: 'failed' }),
      line({ slot: 'block-2.x', status: 'skipped' }),
      line({ slot: 'block-5.x', ordered: 'images/tracy-content/b.png' }),
      line({ part: 'body-background', slot: 'site.body-background', frame: 'block-3.bg' }),
      {
        part: 'body-background',
        status: 'skipped',
        slot: 'block-8.bg',
        ordered: 'images/tracy-content/c.png'
      }
    ]
  })
  assert.deepEqual([...shown.keys()].sort(), ['block-3', 'block-4', 'block-5'])
  assert.equal(
    topPicture({ blocks: { 1440: ['header', 'block-1', 'block-4', 'block-5'] } }, shown),
    'images/tracy-content/a.png'
  )
  assert.equal(topPicture({ blocks: { 1440: ['header', 'block-1'] } }, shown), null)
})

test('writtenLogo takes a logo written to the site profile, light before dark, and nothing else', () => {
  const logo = (key, ordered, status = 'written') => ({
    part: 'brand-logo',
    status,
    ordered,
    readFrom: { path: ['profiles', 'default', 'settings', key] }
  })
  assert.equal(writtenLogo([logo('site_logo_dark', 'd.png'), logo('site_logo', 'l.png')]), 'l.png')
  assert.equal(writtenLogo([logo('site_logo', 'l.png', 'failed'), logo('site_logo_dark', 'd.png')]), 'd.png')
  assert.equal(
    writtenLogo([logo('site_logo_small', 's.png'), { part: 'brand-logo', status: 'written' }]),
    null
  )
})

test('the stage stops when the run is cancelled before it writes', async () => {
  const site = shareSite()
  const kit = shareKit().doc
  const out = await runShareStage({
    door: site.door,
    siteKey: 'x',
    kit,
    pageIds: ['page-home'],
    pictureLines: [{ part: 'picture', status: 'written', slot: 'block-2.pic', ordered: HERO.entry.sitePath }],
    brandLines: [],
    isCancelled: async () => true
  })
  assert.equal(out.cancelled, true)
  assert.ok(!site.log.some((c) => c.action === 'content.update'))
  assert.ok(picturePackage())
})
