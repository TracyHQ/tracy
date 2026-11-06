/**
 * A page whose own HTML is fine but whose external resource never answers (a blocked avatar host, a font CDN that
 * hangs) is still a page that renders: the audit measures it instead of recording a failed page.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { openContext, renderPage } from '../content-coverage/lib/render.mjs'

const PAGE =
  '<!doctype html><html><head><title>Harbor Lane Bakery</title></head><body><h1>Fresh bread daily</h1>' +
  '<img src="/never-answers.png" alt="Avatar"></body></html>'

async function launch() {
  try {
    return await chromium.launch()
  } catch {
    return null
  }
}

test('a page whose load event is held by a resource that never answers still renders', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  const sockets = new Set()
  const server = createServer((req, res) => {
    if (req.url === '/never-answers.png') return // held open on purpose
    res.setHeader('content-type', 'text/html')
    res.end(PAGE)
  })
  server.on('connection', (s) => sockets.add(s))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const url = `http://127.0.0.1:${server.address().port}/`
    const ctx = await openContext(browser, 'desktop')
    const r = await renderPage(ctx, url, { screenshot: false, navigationTimeout: 4000, loadGrace: 1500 })
    await ctx.close()
    assert.equal(r.error, undefined)
    assert.ok(r.data.items.some((i) => String(i.value).includes('Fresh bread daily')))
  } finally {
    for (const s of sockets) s.destroy()
    server.close()
    await browser.close()
  }
})
