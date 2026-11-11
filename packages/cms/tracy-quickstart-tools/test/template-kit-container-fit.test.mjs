// Container readings in a real page: a text that grows with its words (a tab) is filled until it pushes its
// neighbours, a title may take the lines its group shows elsewhere, and a menu row is filled all together. Fabricated
// pages, a monospace face so the numbers are predictable.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { readRowFit } from '../template-kit/lib/read-row-fit.js'
import { readTextFit } from '../template-kit/lib/read-text-fit.js'

// Named faces first: the generic `monospace` alone is whatever fontconfig picks, and on a machine with Playwright's
// fonts but no DejaVu (Ubuntu 24.04 with `--with-deps`) that is WenQuanYi Zen Hei Mono, whose Latin letters are
// proportional and 8px wide, so every reading below came out longer. Liberation Mono comes with `--with-deps`.
const FACE = 'body{margin:0;font:16px/20px "Liberation Mono","DejaVu Sans Mono","Courier New",monospace}'

async function withPage(t, html, width, fn) {
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage({ viewport: { width, height: 600 } })
    await page.setContent(html)
    // The numbers below assume about 9.6px a character, every character: say so when the face is not that.
    const widths = await page.evaluate(() =>
      ['i', 'W'].map((c) => {
        const s = document.body.appendChild(document.createElement('span'))
        s.textContent = c.repeat(50)
        const w = s.getBoundingClientRect().width / 50
        s.remove()
        return w
      })
    )
    assert.ok(
      widths.every((w) => w > 9.4 && w < 9.8),
      `no fixed-pitch face of about 9.6px on this machine (i, W: ${widths.join(', ')}px); install fonts-liberation`
    )
    await fn(page)
  } finally {
    await browser.close()
  }
}

test('a tab that grows with its words is filled until it pushes the other tabs, never to its demo word', async (t) => {
  // Four tabs in a 400px row; each tab is as wide as its word. Their words take 25 characters of the 50 the row holds.
  const html = `<style>${FACE}.tabs{width:400px;display:flex;flex-wrap:wrap}.tabs a{padding:0;white-space:nowrap}
    .tabs a+a{margin-left:0}</style>
    <div data-kit-block="tabs"><div class="tabs"><a>Basic</a><a>Trial practice</a><a>Pro</a><a>Rest</a></div></div>`
  await withPage(t, html, 800, async (page) => {
    const fit = await page.evaluate(readTextFit, { block: 'tabs', texts: [{ id: 'basic', text: 'Basic' }] })
    // 400px of 9.6px characters: about 41 characters in the row, 21 of them taken by the other tabs.
    assert.ok(fit.basic.limit > 5, JSON.stringify(fit))
    assert.ok(fit.basic.limit >= 18 && fit.basic.limit <= 22, JSON.stringify(fit))
  })
})

test('a title shown on one line takes the lines its group shows elsewhere', async (t) => {
  const html = `<style>${FACE}h3{font:16px/20px monospace;margin:0;width:200px}</style>
    <div data-kit-block="card"><h3>Ring news</h3><p>Body.</p></div>`
  await withPage(t, html, 800, async (page) => {
    const one = await page.evaluate(readTextFit, { block: 'card', texts: [{ id: 't', text: 'Ring news' }] })
    const two = await page.evaluate(readTextFit, {
      block: 'card',
      texts: [{ id: 't', text: 'Ring news', lines: 2 }]
    })
    assert.equal(one.t.allowed, 1)
    assert.equal(two.t.allowed, 2)
    assert.ok(two.t.limit >= one.t.limit * 2 - 4, JSON.stringify({ one, two }))
  })
})

test('an address split by a forced break is filled as words on its lines, the break read as a space', async (t) => {
  // A 200px column (about 20 monospace characters a line): street and city on two forced lines.
  const html = `<style>${FACE}.col{width:200px}</style>
    <div data-kit-block="foot"><div class="col"><p>12 Lane Rd.<br>Poolton, ST 10001</p><p>(555) 0100</p></div></div>`
  await withPage(t, html, 800, async (page) => {
    const fit = await page.evaluate(readTextFit, {
      block: 'foot',
      texts: [{ id: 'addr', text: '12 Lane Rd. Poolton, ST 10001' }]
    })
    assert.equal(fit.addr.demo, '12 Lane Rd. Poolton, ST 10001'.length)
    assert.deepEqual([fit.addr.lines, fit.addr.allowed], [2, 2])
    // Two lines of about 20 characters, past the 29 demo characters (words run together would wrap early).
    assert.ok(fit.addr.limit >= 34 && fit.addr.limit <= 42, JSON.stringify(fit))
  })
})

test('a box that never runs out of room has no reading', async (t) => {
  const html = `<style>${FACE}.clip{width:100px;overflow:hidden;white-space:nowrap;position:absolute}</style>
    <div data-kit-block="b"><span class="clip">Clipped</span></div>`
  await withPage(t, html, 800, async (page) => {
    const fit = await page.evaluate(readTextFit, { block: 'b', texts: [{ id: 'c', text: 'Clipped' }] })
    assert.equal(fit.c, undefined)
  })
})

test('a menu row holds the characters of every label filled together, and no row when the menu folds', async (t) => {
  const html = `<style>${FACE}nav{width:400px;display:flex;flex-wrap:wrap}nav a{margin-right:9.6px;white-space:nowrap}</style>
    <div data-kit-block="header"><nav><a>Home</a><a>About</a><a>Shop</a></nav></div>`
  await withPage(t, html, 800, async (page) => {
    const row = await page.evaluate(readRowFit, { block: 'header', labels: ['Home', 'About', 'Shop'] })
    assert.equal(row.shown, true)
    assert.equal(row.demo, 13)
    // 400px holds about 41 characters, three gaps of one character each included.
    assert.ok(row.total >= 33 && row.total <= 39, JSON.stringify(row))
    const folded = await page.evaluate(readRowFit, { block: 'header', labels: ['Home', 'Contact'] })
    assert.equal(folded.shown, false)
  })
})

test('a heading and a button with the same words are measured as two texts, each on its own element', async (t) => {
  const html = `<style>${FACE}h2{font:16px/20px monospace;margin:0;width:200px}button{font:16px/20px monospace;width:90px}</style>
    <div data-kit-block="strip"><div><h2>Subscribe</h2></div><button>Subscribe</button></div>`
  await withPage(t, html, 800, async (page) => {
    const fit = await page.evaluate(readTextFit, {
      block: 'strip',
      texts: [
        { id: 'title', text: 'Subscribe' },
        { id: 'button', text: 'Subscribe' }
      ]
    })
    assert.ok(fit.title && fit.button, JSON.stringify(fit))
    assert.ok(
      fit.title.limit > fit.button.limit,
      `the wide heading holds more than the narrow button: ${JSON.stringify(fit)}`
    )
  })
})
