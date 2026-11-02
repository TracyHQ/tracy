// Shoot one page at one width: a clean full-page image when asked for, and one clean crop per block asked for.
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
 * the site is served under; an address written with that host name is sent back to `siteUrl` too. `skip`:
 * resource types never fetched (`image`, `media`, `font` for a DOM-only read).
 */
export async function openKitContext(browser, { width, siteUrl, hostHeader, skip = [] }) {
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
    // A pass that reads the DOM only skips what it never looks at (pictures, video, fonts).
    if (skip.includes(req.resourceType())) return route.abort('blockedbyclient')
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

/** Scroll once through the page, fast, only when it holds content that renders on scroll. */
async function quickWake(page) {
  await page.evaluate(async () => {
    const LAZY = '[data-aos], .wow, [data-animate], .lazyload, [loading="lazy"], .owl-lazy, [data-src]'
    if (!document.querySelector(LAZY)) return
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    for (const el of [document.documentElement, document.body])
      el.style.setProperty('scroll-behavior', 'auto', 'important')
    for (let i = 0, last = -1; i < 60 && window.scrollY !== last; i++) {
      last = window.scrollY
      window.scrollBy({ top: window.innerHeight, left: 0, behavior: 'instant' })
      await wait(40)
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    await wait(150)
  })
}

/**
 * Open `url`, wake lazy content, freeze floating elements, remove links to left-out pages (`hide`) and tag
 * the blocks. Null page on failure. `wake`: `full` (the slow scroll a screenshot needs) or `quick` (one fast pass,
 * only on a page with content that renders on scroll); every wait is capped.
 */
export async function openFrozen(ctx, url, assigned, hide, { wake = 'full' } = {}) {
  const page = await ctx.newPage()
  let resp
  try {
    resp = await page.goto(url, { waitUntil: wake === 'full' ? 'load' : 'domcontentloaded', timeout: 60000 })
  } catch (e) {
    await page.close().catch(() => {})
    return { status: null, error: String(e.message || e).split('\n')[0] }
  }
  const status = resp ? resp.status() : null
  if (status !== 200) {
    await page.close().catch(() => {})
    return { status, error: `status ${status}` }
  }
  if (wake === 'full') {
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {})
    await wakeLazyContent(page)
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  } else {
    await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {})
    await quickWake(page)
  }
  // Text is measured in the template's own fonts, never in a fallback that happens to show while they load.
  if (wake !== 'full')
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  await page.evaluate(freezeFloating)
  if (hide?.paths?.length) await page.evaluate(dropLinksTo, { paths: hide.paths, hosts: hide.hosts ?? [] })
  await page.waitForTimeout(wake === 'full' ? 300 : 50)
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
 * Shoot an open page at its current width into `dir`: the full page as `fullName` (none when null), and every
 * visible block for which `fileOf(block)` names a file. Every crop is cut from one screenshot of the page, taken
 * only as tall as the lowest crop needs (the whole page when its full shot is wanted), so a crop can never differ
 * from the full shot. Returns the blocks with `file` set, the page's reading and its height.
 */
export async function shootOpened({ ctx, page, blocks, docHeight, width, dir, fullName, fileOf }) {
  const details = await page.evaluate(readDetails)
  mkdirSync(dir, { recursive: true })
  const pageHeight = Math.min(docHeight, MAX_SHOT_HEIGHT)
  const wanted = blocks.filter((b) => b.visible && fileOf(b))
  const lowest = Math.max(0, ...wanted.map((b) => b.top + b.height))
  const height = fullName ? pageHeight : Math.min(pageHeight, Math.ceil(lowest))
  for (const b of blocks) b.file = null
  if (!fullName && !wanted.length) return { height: pageHeight, blocks, details }
  const png = await shootPng(page, width, Math.max(1, height))
  const jobs = fullName ? [{ name: fullName, x: 0, y: 0, w: width, h: height }] : []
  for (const b of wanted) {
    const c = cropBox(b, width, height)
    if (!c) continue
    jobs.push({ name: fileOf(b), ...c })
    b.file = fileOf(b)
  }
  if (jobs.length) await cutImages(ctx, png, jobs, dir)
  return { height: pageHeight, truncated: docHeight > MAX_SHOT_HEIGHT, blocks, details }
}

/**
 * Open `url` and shoot it at one width (`shootOpened`).
 * @returns {Promise<{status: number|null, height?: number, truncated?: boolean, blocks?: object[], details?: object, error?: string}>}
 */
export async function capturePage(ctx, { url, width, dir, fullName, fileOf, assigned, hide }) {
  const opened = await openFrozen(ctx, url, assigned, hide)
  if (!opened.page) return opened
  const { page, status, blocks, docHeight } = opened
  try {
    return { status, ...(await shootOpened({ ctx, page, blocks, docHeight, width, dir, fullName, fileOf })) }
  } finally {
    await page.close().catch(() => {})
  }
}
