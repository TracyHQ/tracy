/** Actual input reaches every gallery picture, including native image drag and browser touch arbitration. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const cdp = process.env.DEMO_QA_CDP
const opts = { skip: cdp ? false : 'set DEMO_QA_CDP for carousel browser regression' }
const runtime = readFileSync(
  new URL('../../../packages/cms/tracy-wordpress-theme/src/tracy/assets/js/tracy-motion.js', import.meta.url),
  'utf8'
)
const layout = readFileSync(
  new URL(
    '../../../packages/cms/tracy-wordpress-theme/src/wp-ja-restaurant/assets/css/groups/home.css',
    import.meta.url
  ),
  'utf8'
)
const picture =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#bf5b3d"/></svg>'
  )
async function fixture(t, { mobile = false, reduced = false } = {}) {
  const { chromium } = await import('playwright')
  const browser = await chromium.connectOverCDP(cdp)
  t.after(() => browser.close())
  const context = await browser.newContext({
    viewport: { width: mobile ? 390 : 1440, height: 844 },
    hasTouch: mobile,
    isMobile: mobile,
    reducedMotion: reduced ? 'reduce' : 'no-preference'
  })
  t.after(() => context.close())
  const page = await context.newPage()
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${layout}\nbody{margin:0}.gallery-slide{margin-top:100px}.tracy-motion-carousel{overflow:hidden;width:100%}.tracy-motion-track{display:flex}.tracy-motion-slide{flex:0 0 ${mobile ? '100%' : '16.6666667%'};min-width:0}.tracy-motion-slide img{width:100%;height:240px}footer{height:2000px}</style><main><section class="gallery-slide"><div class="tracy-motion-carousel"><div class="tracy-motion-track">${Array.from({ length: 7 }, (_, i) => `<div class="item"><a href="#picture-${i}"><img src="${picture}" alt="Picture ${i}"></a></div>`).join('')}</div></div></section><input aria-label="Outside field"><footer>End</footer></main><script>window.TracyMotion={effects:[{id:'carousel-step',v:2}]}</script><script>${runtime}</script>`
  )
  const root = page.locator('.tracy-motion-carousel')
  await root.waitFor()
  const session = await context.newCDPSession(page)
  return { page, root, session }
}
const visible = (root) => root.locator('.tracy-motion-slide:not([aria-hidden=true])').count()
async function mouseDrag(page, root) {
  const r = await root.boundingBox()
  await page.mouse.move(r.x + r.width * 0.8, r.y + 100)
  await page.mouse.down()
  await page.mouse.move(r.x + r.width * 0.2, r.y + 100, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(450)
}
async function touch(session, root, page, { vertical = false, cancel = false } = {}) {
  const r = await root.boundingBox(),
    x = r.x + r.width * 0.8,
    y = r.y + 130
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let i = 1; i <= 10; i++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: vertical ? x : x - (r.width * 0.6 * i) / 10, y: vertical ? y - (100 * i) / 10 : y }]
    })
    await page.waitForTimeout(20)
  }
  await session.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: []
  })
  await page.waitForTimeout(450)
}
async function lastPictureVisible(page) {
  return page.getByAltText('Picture 6').evaluate((e) => {
    const r = e.getBoundingClientRect()
    return r.left >= -1 && r.right <= innerWidth + 1
  })
}

test(
  'native image dragging reaches the seventh gallery picture and a plain link click stays a click',
  opts,
  async (t) => {
    const { page, root } = await fixture(t)
    assert.equal(await visible(root), 6)
    await mouseDrag(page, root)
    assert.equal(await lastPictureVisible(page), true)
    assert.equal(await page.evaluate(() => location.hash), '', 'a swipe must not activate its picture link')
    await root.locator('.tracy-motion-slide:not([aria-hidden=true]) a').first().click()
    assert.equal(await page.evaluate(() => location.hash), '#picture-1')
  }
)

test(
  'real touch reaches every mobile picture, preserves vertical scrolling and recovers from cancellation',
  opts,
  async (t) => {
    const { page, root, session } = await fixture(t, { mobile: true })
    assert.equal(await visible(root), 1)
    await touch(session, root, page, { cancel: true })
    for (let i = 0; i < 6; i++) await touch(session, root, page)
    assert.equal(await lastPictureVisible(page), true, 'six swipes reach the seventh picture')
    const before = await page.evaluate(() => scrollY)
    await touch(session, root, page, { vertical: true })
    assert.ok(
      (await page.evaluate(() => scrollY)) > before + 20,
      'a vertical gesture starting on the image must scroll the page'
    )
    assert.match(await root.evaluate((e) => getComputedStyle(e).touchAction), /pinch-zoom/)
  }
)

test('Tab reaches an unadorned carousel and arrow navigation works under reduced motion', opts, async (t) => {
  const { page, root } = await fixture(t, { reduced: true })
  await page.keyboard.press('Tab')
  assert.equal(await root.evaluate((e) => e === document.activeElement), true)
  await page.keyboard.press('ArrowRight')
  assert.equal(await lastPictureVisible(page), true)
})
