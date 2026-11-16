// The blog list's masonry script (src/views/BlogList.astro), run in a real browser on a page of fixed-height cards: dealing the
// cards again must never move a card that is already in its column and place (F1 of the 0.1.2 review: each deal re-appended
// every card, so focus fell to <body>), and no card moves while keyboard focus is inside the list, so the Tab order never
// changes under a keyboard user (N1 of the 0.1.2 visual review: a late font re-dealt the cards around the focused one). A resize
// or zoom that changes the number of columns deals at once, focus inside or not (N2 of the same review: held until focus left,
// the cards stayed in one column at 1440 px).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from '../tools/qa-browser.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const view = readFileSync(path.join(ROOT, 'src/views/BlogList.astro'), 'utf8')
const SCRIPT = /<script is:inline>([\s\S]*?)<\/script>/.exec(
  view.slice(view.lastIndexOf('<script is:inline>'))
)[1]

// Twelve cards dealt out in turn into three columns, as the server sends them; heights vary so the masonry has work to do.
const HEIGHTS = [180, 260, 200, 300, 220, 190, 280, 210, 240, 170, 250, 230]
function pageHtml(script) {
  const card = (i) =>
    `<article class="dn-blog-card" data-order="${i}" style="height:${HEIGHTS[i]}px"><a href="#c${i}" id="a${i}">Card ${i}</a></article>`
  const cols = [0, 1, 2]
    .map(
      (c) =>
        `<div class="dn-post-col">${HEIGHTS.map((_, i) => i)
          .filter((i) => i % 3 === c)
          .map(card)
          .join('')}</div>`
    )
    .join('')
  return `<!doctype html><html><head><style>
    body { margin: 0 } .dn-post-grid { display: grid; grid-template-columns: 300px 300px 300px; gap: 36px; align-items: start }
    @media (max-width: 700px) { .dn-post-grid { grid-template-columns: 300px } }
    @media (min-width: 701px) and (max-width: 1000px) { .dn-post-grid { grid-template-columns: 300px 300px } }
    .dn-blog-card { display: block; margin-bottom: 36px; background: #eee } .tail { height: 3000px }
  </style></head><body><div class="dn-post-grid">${cols}</div><div class="tail"></div><script>${script}</script></body></html>`
}

let browser
before(async () => {
  browser = await launchBrowser()
})
after(async () => {
  await browser?.close()
})

/** The order of the cards in each column. */
const columns = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dn-post-col')].map((c) =>
      [...c.children].map((x) => x.dataset.order).join(',')
    )
  )

async function settledPage(width = 1100) {
  const page = await browser.newPage({ viewport: { width, height: 700 } })
  await page.setContent(pageHtml(SCRIPT))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(80)
  return page
}

test('a deal with unchanged heights moves no card and keeps focus on the card the keyboard is on', async () => {
  const page = await settledPage()
  try {
    const arrangement = await columns(page)
    await page.focus('#a7')
    await page.evaluate(() => {
      window.__moves = 0
      new MutationObserver((m) => {
        window.__moves += m.length
      }).observe(document.querySelector('.dn-post-grid'), { childList: true, subtree: true })
    })
    // what a late font, the window load or a picture used to trigger: the script deals again
    await page.evaluate(() => window.dispatchEvent(new Event('load')))
    await page.waitForTimeout(80)
    assert.equal(
      await page.evaluate(() => window.__moves),
      0,
      'no card is taken out of the page and put back'
    )
    assert.equal(await page.evaluate(() => document.activeElement.id), 'a7')
    assert.deepEqual(await columns(page), arrangement)
  } finally {
    await page.close()
  }
})

/** A late web font: the first card grows, which changes the shortest column, then the script is asked to deal again. */
const lateFont = (page) =>
  page.evaluate(() => {
    document.querySelector('[data-order="0"]').style.height = '900px'
    window.dispatchEvent(new Event('load'))
  })

test('a late font while focus is in the list moves no card; the cards are dealt once focus leaves the list', async () => {
  const page = await settledPage()
  try {
    const before = await columns(page)
    await page.focus('#a9')
    await lateFont(page)
    await page.waitForTimeout(80)
    assert.deepEqual(await columns(page), before, 'no card moves while the keyboard is in the list')
    assert.equal(await page.evaluate(() => document.activeElement.id), 'a9')
    // focus leaves the list: the pending deal runs and the columns take the heights the late font gave
    await page.evaluate(() => document.activeElement.blur())
    await page.waitForTimeout(80)
    const after = await columns(page)
    assert.notDeepEqual(after, before, 'the cards were dealt once focus left the list')
    // the same arrangement a page with the tall first card settles on by itself
    const fresh = await browser.newPage({ viewport: { width: 1100, height: 700 } })
    await fresh.setContent(
      pageHtml(SCRIPT).replace('data-order="0" style="height:180px"', 'data-order="0" style="height:900px"')
    )
    await fresh.waitForTimeout(80)
    assert.deepEqual(after, await columns(fresh), 'the deferred deal reaches the settled arrangement')
    await fresh.close()
  } finally {
    await page.close()
  }
})

test('a Tab walk through the list reaches every card once, in order, when a late font arrives halfway', async () => {
  const page = await settledPage()
  try {
    const order = async () => (await columns(page)).join(',').split(',')
    const expected = await order()
    await page.focus('#' + 'a' + expected[0])
    const seen = [expected[0]]
    for (let i = 1; i < expected.length; i++) {
      if (i === 4) {
        await lateFont(page)
        await page.waitForTimeout(80)
      }
      await page.keyboard.press('Tab')
      seen.push(
        await page.evaluate(() => document.activeElement.closest('.dn-blog-card')?.dataset.order ?? null)
      )
    }
    assert.deepEqual(seen, expected, 'every card once, in the order the list had when the walk began')
  } finally {
    await page.close()
  }
})

test('with focus outside the list a late font deals the cards again at once (L1)', async () => {
  const page = await settledPage()
  try {
    const before = await columns(page)
    await lateFont(page)
    await page.waitForTimeout(80)
    assert.notDeepEqual(await columns(page), before)
  } finally {
    await page.close()
  }
})

test('no picture load deals again: a card picture keeps its box before it loads', () => {
  assert.doesNotMatch(
    SCRIPT,
    /addEventListener\('load', again\)[\s\S]*img|img[\s\S]*addEventListener\('load'/
  )
  assert.match(SCRIPT, /document\.fonts\.ready\.then\(again\)/)
  assert.match(SCRIPT, /window\.addEventListener\('load', again\)/)
})

/** The columns shown and the cards in each, as the reader sees them. */
const shown = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.dn-post-col')]
      .filter((c) => c.style.display !== 'none')
      .map((c) => [...c.children].map((x) => x.dataset.order).join(','))
  )

/** The columns a page loaded at this width settles on by itself. */
async function settledAt(width) {
  const fresh = await settledPage(width)
  try {
    return await shown(fresh)
  } finally {
    await fresh.close()
  }
}

for (const [from, to] of [
  [390, 1100],
  [1100, 800],
  [1100, 390]
]) {
  test(`a resize or zoom from ${from} to ${to} px with focus on a card deals the cards at once into the new columns`, async () => {
    const page = await settledPage(from)
    try {
      await page.focus('#a5')
      await page.setViewportSize({ width: to, height: 700 })
      await page.waitForTimeout(300)
      const now = await shown(page)
      assert.deepEqual(
        now,
        await settledAt(to),
        'the columns the new width has, filled as a fresh page fills them'
      )
      assert.equal(now.join(',').split(',').length, 12, 'every card is in a shown column')
      assert.equal(await page.evaluate(() => document.activeElement.id), 'a5', 'focus stays on its card')
    } finally {
      await page.close()
    }
  })
}

test('a zoom while tabbing: every card is reached once, in the order the new columns give', async () => {
  const page = await settledPage(1100)
  try {
    const first = (await columns(page)).join(',').split(',')[0]
    await page.focus(`#a${first}`)
    await page.setViewportSize({ width: 390, height: 700 })
    await page.waitForTimeout(300)
    const expected = (await shown(page)).join(',').split(',')
    const at = expected.indexOf(first)
    const seen = [first]
    for (let i = at + 1; i < expected.length; i++) {
      await page.keyboard.press('Tab')
      seen.push(
        await page.evaluate(() => document.activeElement.closest('.dn-blog-card')?.dataset.order ?? null)
      )
    }
    assert.deepEqual(seen, expected.slice(at), 'no card skipped or reached twice after the zoom')
  } finally {
    await page.close()
  }
})
