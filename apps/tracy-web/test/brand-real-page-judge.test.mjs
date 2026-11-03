// The real-page judge (brand bench, #322): the script measures and decides, the model looks once and can only add a
// failure. Captures are drawn by code (invented business), no site and no model is involved.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { judgeRealPage } from '../src/brand-step/real-page/real-page-judge.js'
import { brandFile, goodCaptures, kit, PALETTE } from './_real-page-fixtures.mjs'

const judge = (captures, over = {}) => judgeRealPage({ captures, brandFile, kit, palette: PALETTE, ...over })
const failedOf = (r) => r.failed.join(',')

test('a page that shows the brand everywhere passes, and the model is asked once', async () => {
  let asked = 0
  const review = async () => (asked++, { answer: '{"broken": []}', cost: 0.001 })
  const r = await judge(await goodCaptures(), { review })
  assert.equal(r.verdict, 'pass', JSON.stringify(r.checks.filter((c) => !c.ok)))
  assert.equal(asked, 1)
  assert.deepEqual(
    r.checks.map((c) => c.id),
    ['views', 'letters', 'menu-mark', 'footer-logo', 'favicons', 'accent-only', 'look']
  )
})

test('a name that does not reach 3:1 on its ground fails the letters check, with the measured ratio', async () => {
  const r = await judge(await goodCaptures({ lightInk: '#e6e6e6' }))
  assert.equal(r.verdict, 'fail')
  assert.equal(failedOf(r), 'letters')
  assert.match(r.checks.find((c) => c.id === 'letters').detail, /header light: contrast 1\.\d+:1, under 3:1/)
})

test('a name under 14 px tall fails the letters check', async () => {
  const r = await judge(await goodCaptures({ band: 10 }))
  assert.equal(failedOf(r), 'letters')
  assert.match(r.checks.find((c) => c.id === 'letters').detail, /letters 10px, under 14px/)
})

test('the phone menu must show the mark when the brand file asks for it', async () => {
  const wrong = await judge(await goodCaptures({ menuSrc: '/images/tracy-brand/menu-logo-xx-t1.png' }))
  assert.equal(failedOf(wrong), 'menu-mark')
  const template = await judge(await goodCaptures({ menuSrc: '/images/joomlart/logo/item-1.png' }))
  assert.equal(failedOf(template), 'menu-mark')
})

test('the footer must show the brand logo, not the template picture', async () => {
  const r = await judge(await goodCaptures({ footerSrc: '/images/joomlart/logo/item-1.png' }))
  assert.equal(failedOf(r), 'footer-logo')
})

test('every favicon size must be linked from the page and answer', async () => {
  const good = (await goodCaptures()).icons
  const r = await judge(await goodCaptures({ icons: good.filter((i) => i.width !== 512) }))
  assert.equal(failedOf(r), 'favicons')
  assert.match(r.checks.find((c) => c.id === 'favicons').detail, /png512/)
  const down = await judge(
    await goodCaptures({ icons: good.map((i) => (i.width === 180 ? { ...i, status: 404 } : i)) })
  )
  assert.match(down.checks.find((c) => c.id === 'favicons').detail, /phone180/)
})

test('only accent-family colours may differ from the template', async () => {
  const stray = await goodCaptures({
    colours: {
      light: [
        { hex: '#ffffff', count: 40 },
        { hex: '#e0a000', count: 4 }
      ],
      dark: [{ hex: '#121111', count: 40 }]
    }
  })
  const r = await judge(stray)
  assert.equal(failedOf(r), 'accent-only')
  assert.match(r.checks.find((c) => c.id === 'accent-only').detail, /light #e0a000 x4/)
})

test('the model can add a failure but never remove one; a failed look is a failure', async () => {
  const broken = await judge(await goodCaptures(), {
    review: async () => ({ answer: 'x {"broken": ["footer logo is cropped"]}', cost: 0 })
  })
  assert.equal(failedOf(broken), 'look')
  assert.match(broken.checks.at(-1).detail, /cropped/)
  const kept = await judge(await goodCaptures({ lightInk: '#e6e6e6' }), {
    review: async () => ({ answer: '{"broken": []}', cost: 0 })
  })
  assert.equal(failedOf(kept), 'letters')
  const down = await judge(await goodCaptures(), {
    review: async () => {
      throw new Error('REVIEWER_FAILED: provider down')
    }
  })
  assert.equal(failedOf(down), 'look')
})

test('a view that was not taken fails the views check with its reason', async () => {
  const c = await goodCaptures()
  c.views = c.views.map((v) =>
    v.id === 'menu' && v.scheme === 'dark'
      ? { ...v, ok: false, png: null, error: 'no menu button on the phone page' }
      : v
  )
  const r = await judge(c)
  assert.match(r.checks.find((x) => x.id === 'views').detail, /menu dark: no menu button/)
})
