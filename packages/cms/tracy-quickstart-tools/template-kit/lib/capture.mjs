// Shoot one page at one width: a clean full-page image and one clean crop per visible block not shot yet.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { wakeLazyContent } from '../../content-coverage/lib/render.mjs'
import { dropLinksTo } from './exclude.mjs'
import { findBlocks, freezeFloating } from './find-blocks.js'
import { readDetails } from './read-details.js'

export const WIDTHS = { 1440: { height: 900, mobile: false }, 390: { height: 844, mobile: true } }
const MAX_SHOT_HEIGHT = 16000 // Chromium cannot paint taller surfaces reliably.

/**
 * One read-only browser context for a width. Requests to the site go to `siteUrl` with the `Host` header
 * the site is served under; an address written with that host name is sent back to `siteUrl` too.
 */
export async function openKitContext(browser, { width, siteUrl, hostHeader }) {
  const w = WIDTHS[width] ?? { height: 900, mobile: width < 768 }
  const ctx = await browser.newContext({
    viewport: { width, height: w.height },
    isMobile: w.mobile,
    hasTouch: w.mobile,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true
  })
  const base = new URL(siteUrl)
  await ctx.route('**/*', (route) => {
    const req = route.request()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.abort('blockedbyclient')
    const u = new URL(req.url())
    const ours = u.host === base.host || (hostHeader && u.host.toLowerCase() === hostHeader.toLowerCase())
    if (!ours || !hostHeader) return route.continue()
    u.protocol = base.protocol
    u.host = base.host
    return route.continue({ url: u.href, headers: { ...req.headers(), host: hostHeader } })
  })
  return ctx
}

/** Cut JPEG images out of one PNG in a blank page's canvas (no image library needed). */
export async function cutImages(ctx, png, jobs, dir) {
  const cutter = await ctx.newPage()
  try {
    const out = await cutter.evaluate(
      async ({ data, jobs }) => {
        const img = new Image()
        img.src = `data:image/png;base64,${data}`
        await img.decode()
        const canvas = document.createElement('canvas')
        const c2d = canvas.getContext('2d')
        return jobs.map((j) => {
          canvas.width = j.w
          canvas.height = j.h
          c2d.drawImage(img, j.x, j.y, j.w, j.h, 0, 0, j.w, j.h)
          return canvas.toDataURL('image/jpeg', 0.82).split(',')[1]
        })
      },
      { data: png.toString('base64'), jobs }
    )
    for (const [i, j] of jobs.entries()) writeFileSync(join(dir, j.name), Buffer.from(out[i], 'base64'))
  } finally {
    await cutter.close().catch(() => {})
  }
}

/**
 * Open `url`, wake lazy content, freeze floating elements, remove links to left-out pages (`hide`) and tag
 * the blocks. Null page on failure.
 */
export async function openFrozen(ctx, url, assigned, hide) {
  const page = await ctx.newPage()
  let resp
  try {
    resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  } catch (e) {
    await page.close().catch(() => {})
    return { status: null, error: String(e.message || e).split('\n')[0] }
  }
  const status = resp ? resp.status() : null
  if (status !== 200) {
    await page.close().catch(() => {})
    return { status, error: `status ${status}` }
  }
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await wakeLazyContent(page)
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.evaluate(freezeFloating)
  if (hide?.paths?.length) await page.evaluate(dropLinksTo, { paths: hide.paths, hosts: hide.hosts ?? [] })
  await page.waitForTimeout(300)
  const found = await page.evaluate(findBlocks, assigned ?? [])
  return { page, status, ...found }
}

/** One PNG of the page from the top, at most MAX_SHOT_HEIGHT tall. */
export const shootPng = (page, width, height) =>
  page.screenshot({
    type: 'png',
    fullPage: true,
    animations: 'disabled',
    timeout: 60000,
    clip: { x: 0, y: 0, width, height }
  })

/** The crop box of a block inside an image `width` x `height`, or null when nothing of it is inside. */
export function cropBox(b, width, height) {
  const x = Math.min(Math.max(0, b.left), width - 1)
  const y = Math.min(Math.max(0, b.top), height - 1)
  const w = Math.min(b.width, width - x)
  const h = Math.min(b.height, height - y)
  return w >= 4 && h >= 4 ? { x, y, w, h } : null
}

/**
 * Shoot a page at one width into `dir`: the full page as `fullName`, and every visible block for which
 * `fileOf(block)` names a file (a block already shot on another page gets null and is not cut again).
 * Every crop is cut from the one full-page image, so a crop can never differ from it.
 * @returns {Promise<{status: number|null, height?: number, truncated?: boolean, blocks?: object[], details?: object, error?: string}>}
 */
export async function capturePage(ctx, { url, width, dir, fullName, fileOf, assigned, hide }) {
  const opened = await openFrozen(ctx, url, assigned, hide)
  if (!opened.page) return opened
  const { page, status, blocks, docHeight } = opened
  try {
    const details = await page.evaluate(readDetails)
    mkdirSync(dir, { recursive: true })
    const height = Math.min(docHeight, MAX_SHOT_HEIGHT)
    const png = await shootPng(page, width, height)
    const jobs = [{ name: fullName, x: 0, y: 0, w: width, h: height }]
    for (const b of blocks) {
      const file = b.visible ? fileOf(b) : null
      const c = file ? cropBox(b, width, height) : null
      if (c) jobs.push({ name: file, ...c })
      b.file = c ? file : null
    }
    await cutImages(ctx, png, jobs, dir)
    return { status, height, truncated: docHeight > MAX_SHOT_HEIGHT, blocks, details }
  } finally {
    await page.close().catch(() => {})
  }
}
