// Template kit blocks and crops in a real browser, on a fabricated page: a sticky header frozen at the
// top, a hero that only carries `#acm-*-N`, a module in a bare position, the off-canvas menu not cropped.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'

import { capturePage, cropBox, openKitContext } from '../template-kit/lib/capture.mjs'
import { dropLinksTo } from '../template-kit/lib/exclude.mjs'
import { measureMin } from '../template-kit/lib/measure-min.mjs'

const FIXTURE = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'template-kit', 'page.html')
).href
const ASSIGNED = [
  { entity: 'module-23', position: 'copyright' },
  { entity: 'module-24', position: 'header-r' },
  { entity: 'module-25', position: 'missing-position' }
]

async function launch() {
  try {
    return await chromium.launch()
  } catch {
    return null
  }
}

test('blocks are found, frozen and cropped at both widths', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  const dir = mkdtempSync(join(tmpdir(), 'kit-blocks-'))
  try {
    const seen = {}
    for (const width of [1440, 390]) {
      const ctx = await openKitContext(browser, { width, siteUrl: 'http://site.example' })
      const r = await capturePage(ctx, {
        url: FIXTURE,
        width,
        dir,
        fullName: `page-${width}.jpg`,
        fileOf: (b) => (b.block === 'module-21' && width === 390 ? null : `${b.block}-${width}.jpg`),
        assigned: ASSIGNED
      })
      await ctx.close()
      assert.equal(r.status, 200, r.error)
      const by = Object.fromEntries(r.blocks.map((b) => [b.block, b]))
      seen[width] = by
      assert.equal(by.header.top, 0, 'the sticky header is measured at the top')
      assert.equal(by['module-20'].kind, 'acm', 'a hero with only #acm-*-N is a block')
      assert.equal(by['module-20'].top, 80)
      assert.equal(by['module-21'].kind, 'module', 'an ACM inside #ModN is the module, not a second block')
      assert.equal(by['module-23'].kind, 'position')
      assert.equal(by['module-24'].kind, 'position')
      assert.equal(by['module-25'], undefined, 'a position that does not render is never guessed')
      assert.equal(by['module-90'].visible, false, 'the off-canvas menu is not visible')
      assert.equal(by['module-90'].offCanvas, true)
      assert.equal(by['module-90'].file, null)
      assert.equal(by['main-body'].visible, false, 'main holds the whole page: no component area')
      for (const b of r.blocks) if (b.file) assert.ok(existsSync(join(dir, b.file)), b.file)
      assert.ok(existsSync(join(dir, `page-${width}.jpg`)))
      assert.equal(existsSync(join(dir, 'module-21-390.jpg')), false, 'a block already shot is not cut again')
      assert.deepEqual(by['module-30'].contains, ['module-31', 'module-32'], 'a tabs block holds its tabs')
      const cards = r.details['module-26']
      assert.deepEqual(
        cards.links.map((l) => l.href),
        ['/index.php/coaches/alex', '/index.php/coaches/sam', '/index.php/coaches/kim']
      )
      const set = cards.repeats.find((x) => x.count === 3)
      assert.ok(set, 'the three cards are one row set although their classes are numbered')
      assert.equal(set.firstLine, width === 1440 ? 3 : 1)
    }
    assert.equal(seen[1440]['module-22'].visible, true)
    assert.equal(
      seen[390]['module-22'].visible,
      false,
      'a block hidden on the phone is recorded, not cropped'
    )
  } finally {
    await browser.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('crop boxes stay inside the image', () => {
  assert.deepEqual(cropBox({ left: -5, top: 10, width: 50, height: 20 }, 40, 100), {
    x: 0,
    y: 10,
    w: 40,
    h: 20
  })
  assert.equal(cropBox({ left: 0, top: 99, width: 50, height: 20 }, 40, 100), null)
})

test('the measured minimum removes rows one at a time and checks the layout', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  await browser.close()
  const out = mkdtempSync(join(tmpdir(), 'kit-min-'))
  try {
    const r = await measureMin({
      chromium,
      siteUrl: 'http://site.example',
      url: FIXTURE,
      assigned: [],
      source: 'module-26',
      listId: 'block-26.card',
      max: 3,
      widths: [1440, 390],
      out
    })
    assert.deepEqual(r.okCounts, [1, 2, 3])
    assert.equal(r.min, 1)
    for (const n of [1, 2, 3])
      for (const w of [1440, 390]) assert.ok(r.checks[n][w].reason, 'a DOM check per count and width')
    assert.equal(r.images, undefined, 'nothing is shot for a minimum')
    assert.deepEqual(readdirSync(out), [], 'no file is written')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('links to left-out pages are removed with the row that holds them, nothing else', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  try {
    const page = await browser.newPage()
    const html = `<main><div class="row">
      <div class="col"><div class="card"><a href="/index.php/index.php/team/author/rita"><img alt=""></a>
        <p class="name"><a href="/index.php/team/author/rita">Rita</a></p></div></div>
      <div class="col"><div class="card"><a href="/index.php/team/author/tester"><img alt=""></a>
        <p class="name"><a href="/index.php/team/author/tester">Tester</a></p></div></div>
      </div><ul class="pager"><li class="item"><a href="/index.php/team">1</a></li>
      <li class="item"><a href="/index.php/team?start=2">2</a></li></ul>
      <div class="lone"><span><a href="/team/author/tester">alone</a></span></div><p>kept</p></main>`
    // A page served from a made-up site address, so its links resolve as they do on a real page.
    await page.route('http://site.example/**', (r) => r.fulfill({ contentType: 'text/html', body: html }))
    await page.goto('http://site.example/index.php/team')
    const removed = await page.evaluate(dropLinksTo, {
      paths: ['/team/author/tester', '/team?start=2'],
      hosts: []
    })
    assert.equal(removed, 3)
    assert.equal(await page.locator('.col').count(), 1)
    assert.equal(await page.locator('.pager li').count(), 1)
    assert.equal(await page.locator('.lone').count(), 0)
    assert.ok((await page.textContent('main')).includes('Rita'))
    assert.ok(!(await page.textContent('main')).includes('Tester'))
    assert.ok((await page.textContent('main')).includes('kept'))
  } finally {
    await browser.close()
  }
})

test('a short line in a left-aligned column, in line with the words below it, is no hole', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  await browser.close()
  const page = pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'template-kit', 'rows-left-column.html')
  ).href
  const r = await measureMin({
    chromium,
    siteUrl: 'http://site.example',
    url: page,
    assigned: [],
    source: 'module-41',
    listId: 'block-41.social',
    max: 4,
    widths: [1440, 390]
  })
  assert.notEqual(r.sparseRow, 'left-packed')
  assert.equal(r.fix, null)
  assert.equal(r.min, 1)
  assert.equal(r.context[1440].centered, false)
  assert.equal(r.context[1440].leftAligned, true)
})

test('a short last line packed to the left is caught, and the centering fix is proposed and tried', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  await browser.close()
  const out = mkdtempSync(join(tmpdir(), 'kit-rows-'))
  const page = pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'template-kit', 'rows-left.html')
  ).href
  try {
    const r = await measureMin({
      chromium,
      siteUrl: 'http://site.example',
      url: page,
      assigned: [],
      source: 'module-40',
      listId: 'block-40.card',
      max: 4,
      widths: [1440, 390],
      out
    })
    assert.deepEqual(r.okCounts, [4])
    assert.equal(r.min, 4)
    assert.equal(r.sparseRow, 'left-packed')
    assert.equal(r.minIfCentered, 1)
    assert.equal(r.fix.display, 'flex')
    assert.equal(r.fix.rule, 'justify-content: center')
    assert.match(
      r.fix.selector,
      /div\.acm-cards\.style-2 div\.cards\.row$|div\.acm-cards\.style-2 div\.row\.cards$/
    )
    assert.equal(r.fix.verified, true)
    assert.equal(r.context[1440].centered, true)
    for (const n of [1, 2, 3]) {
      assert.equal(r.centered[n][1440].ok, true)
      assert.equal(r.centered[n][1440].image, undefined, 'the trial is read in the DOM, not shot')
    }
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
})

test('rows in a closed tab are opened by the tab control, then measured', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  await browser.close()
  const page = pathToFileURL(
    join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'template-kit', 'rows-closed-tab.html')
  ).href
  const r = await measureMin({
    chromium,
    siteUrl: 'http://site.example',
    url: page,
    assigned: [],
    source: 'module-52',
    listId: 'block-52.dish',
    max: 4,
    css: '#desserts .dish',
    widths: [1440, 390]
  })
  assert.deepEqual(r.okCounts, [1, 2, 3, 4])
  assert.equal(r.min, 1)
  assert.notEqual(r.checks[4][1440].ok, null, 'the rows were shown, so judged')
})
