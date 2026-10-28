/** Full vertical vision capture, one CSS-pixel viewport at a time; ordinary template shots keep their ladder. */
import { createHash } from 'node:crypto'
import { CAPTURE_VIEWPORTS } from './capture.js'
import { visionSlot } from './vision-stream.js'

export const VISION_MAX_HEIGHT = 40_000
export const VISION_MAX_TILES = 80
export const VISION_TILE_BYTES = 640 * 1024
const OVERLAP = 128

/** Read only layout anchors: fixed/sticky bands are excluded from the vertical coverage of later tiles. */
async function geometry(page) {
  return page.evaluate(() => {
    let top = 0
    let bottom = 0
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element)
      if (
        !['fixed', 'sticky'].includes(style.position) ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      )
        continue
      const rect = element.getBoundingClientRect()
      if (rect.width < innerWidth * 0.65 || rect.height <= 0 || rect.height > innerHeight * 0.5) continue
      if (rect.top <= 1 && rect.bottom > 0) top = Math.max(top, rect.bottom)
      if (rect.bottom >= innerHeight - 1 && rect.top < innerHeight)
        bottom = Math.max(bottom, innerHeight - rect.top)
    }
    return {
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      y: scrollY,
      top: Math.ceil(top),
      bottom: Math.ceil(bottom),
      anchors: [...document.querySelectorAll('main h1,main h2,main h3,main p,main figure,footer')]
        .slice(0, 1000)
        .map((element, index) => {
          const rect = element.getBoundingClientRect()
          return {
            index,
            y: Math.round(rect.top + scrollY),
            height: Math.round(rect.height),
            text: element.textContent?.trim().slice(0, 500) ?? ''
          }
        })
    }
  })
}

function moved(previous, current, through) {
  return previous.anchors.some((anchor) => {
    if (anchor.y >= through || anchor.height === 0) return false
    const now = current.anchors[anchor.index]
    return (
      !now ||
      Math.abs(now.y - anchor.y) > 2 ||
      Math.abs(now.height - anchor.height) > 2 ||
      now.text !== anchor.text
    )
  })
}

async function settleImages(page) {
  return page.evaluate(async () => {
    const candidates = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect()
      return (
        image.checkVisibility({ visibilityProperty: true, opacityProperty: true }) &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        rect.right > 0 &&
        rect.left < innerWidth
      )
    })
    // Browser intersection accounts for clipping ancestors, including a later section's fixed background.
    const images = candidates.length
      ? await new Promise((resolve, reject) => {
          const visible = []
          const seen = new Set()
          const timer = setTimeout(() => {
            observer.disconnect()
            reject(new Error('Image visibility did not settle'))
          }, 2000)
          const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
              if (seen.has(entry.target)) continue
              seen.add(entry.target)
              if (
                entry.isIntersecting &&
                entry.intersectionRect.width > 0 &&
                entry.intersectionRect.height > 0
              )
                visible.push(entry.target)
            }
            if (seen.size === candidates.length) {
              clearTimeout(timer)
              observer.disconnect()
              resolve(visible)
            }
          })
          for (const image of candidates) observer.observe(image)
        })
      : []
    const cleanup = []
    let timer
    try {
      await Promise.race([
        Promise.all([
          document.fonts?.ready ?? Promise.resolve(),
          ...images.map((image) =>
            image.complete
              ? image.decode().catch(() => {})
              : new Promise((resolve) => {
                  const done = () => resolve()
                  image.addEventListener('load', done, { once: true })
                  image.addEventListener('error', done, { once: true })
                  cleanup.push(() => {
                    image.removeEventListener('load', done)
                    image.removeEventListener('error', done)
                  })
                  if (image.complete) done()
                })
          )
        ]),
        new Promise((resolve) => {
          timer = setTimeout(resolve, 5000)
        })
      ])
      const fontsReady = !document.fonts || document.fonts.status === 'loaded'
      return {
        ready: images.every((image) => image.complete) && fontsReady,
        fontsReady,
        pending: images
          .filter((image) => !image.complete)
          .slice(0, 5)
          .map((image) => ({
            path: new URL(image.currentSrc || image.src, location.href).pathname,
            rect: image.getBoundingClientRect().toJSON()
          }))
      }
    } finally {
      clearTimeout(timer)
      for (const dispose of cleanup) dispose()
    }
  })
}

/**
 * The launcher and request fencing are the ordinary screenshotter's, so this mode adds no idle browser. `streams`
 * captures run at once on this host (`browserRunsOf`), each one tab shooting one tile at a time.
 */
export function createVisionCapturer({ launched, prepare, streams = 1 }) {
  const acquire = visionSlot(8, streams)
  return async function* capture({
    layouts,
    base,
    serveFrom = null,
    serveFromIsProxy = false,
    proxySiteLabel = null,
    siteHosts = [],
    signal
  }) {
    const release = await acquire(signal)
    let allComplete = true
    try {
      const browser = await launched()
      signal.throwIfAborted()
      for (const layout of layouts)
        for (const view of CAPTURE_VIEWPORTS) {
          signal.throwIfAborted()
          const viewport = view.width === 1440 ? 'desktop' : 'phone'
          const identity = {
            page: layout.path,
            key: layout.key,
            viewport,
            width: view.width,
            viewportHeight: view.height
          }
          const context = await browser.newContext({
            viewport: view,
            deviceScaleFactor: 1,
            isMobile: view.width < 500,
            reducedMotion: 'reduce'
          })
          let closing
          const close = () => (closing ??= context.close().catch(() => {}))
          const abort = () => {
            void close()
          }
          signal.addEventListener('abort', abort, { once: true })
          let tiles = 0
          let covered = 0
          let documentHeight = 0
          let reason = null
          let pendingImages = []
          try {
            signal.throwIfAborted()
            const url = new URL(layout.address ?? layout.path, base).href
            await prepare(context, url, { serveFrom, serveFromIsProxy, proxySiteLabel, siteHosts })
            const page = await context.newPage()
            page.setDefaultTimeout(15_000)
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 })
            if (!response || response.status() >= 400)
              throw Object.assign(new Error('Page did not load'), { code: 'CAPTURE_PAGE_FAILED' })
            await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {})
            // Reveal lazy content before measuring anchors; height is re-read as the page grows.
            for (let y = 0, steps = 0; steps < 80; steps++) {
              signal.throwIfAborted()
              const size = await geometry(page)
              if (size.height > VISION_MAX_HEIGHT) break
              await page.evaluate((at) => scrollTo(0, at), y)
              await page.waitForTimeout(90)
              const after = await geometry(page)
              if (y + view.height >= after.height) break
              y += Math.max(200, view.height - OVERLAP)
            }
            await page.evaluate(() => scrollTo(0, 0))
            await page.waitForTimeout(350)
            let previous = await geometry(page)
            documentHeight = previous.height
            yield { type: 'view-start', ...identity, documentHeight }
            while (covered < documentHeight && tiles < VISION_MAX_TILES) {
              signal.throwIfAborted()
              if (previous.viewportWidth !== view.width || previous.viewportHeight !== view.height) {
                reason = 'CAPTURE_VIEWPORT_MISMATCH'
                break
              }
              if (documentHeight > VISION_MAX_HEIGHT) {
                reason = 'CAPTURE_HEIGHT_LIMIT'
                break
              }
              // The previous tile covers the sticky top band before it becomes hidden in this viewport.
              const target = tiles === 0 ? 0 : Math.max(0, covered - OVERLAP - previous.top)
              await page.evaluate((y) => scrollTo(0, y), target)
              await page.waitForTimeout(100)
              const settled = await settleImages(page)
              if (!settled.ready) {
                pendingImages = settled.pending
                reason = settled.fontsReady ? 'CAPTURE_IMAGES_PENDING' : 'CAPTURE_FONTS_PENDING'
                break
              }
              const before = await geometry(page)
              if (moved(previous, before, covered)) {
                reason = 'CAPTURE_LAYOUT_CHANGED'
                break
              }
              const bytes = await page.screenshot({
                type: 'jpeg',
                quality: 80,
                scale: 'css',
                animations: 'disabled',
                timeout: 15_000
              })
              signal.throwIfAborted()
              const after = await geometry(page)
              if (moved(before, after, Math.min(before.height, before.y + view.height))) {
                reason = 'CAPTURE_LAYOUT_CHANGED'
                break
              }
              documentHeight = after.height
              const from = tiles === 0 ? 0 : after.y + after.top
              const to = Math.min(documentHeight, after.y + view.height - after.bottom)
              if (from > covered || to <= covered) {
                reason = 'CAPTURE_OCCLUDED'
                break
              }
              if (bytes.byteLength > VISION_TILE_BYTES) {
                reason = 'CAPTURE_TILE_TOO_LARGE'
                break
              }
              const tile = {
                type: 'tile',
                ...identity,
                index: tiles,
                y: after.y,
                height: view.height,
                from,
                to,
                documentHeight,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                jpeg: bytes.toString('base64')
              }
              covered = to
              tiles++
              previous = after
              yield tile
            }
            if (covered < documentHeight && !reason) reason = 'CAPTURE_TILE_LIMIT'
          } catch (error) {
            signal.throwIfAborted()
            reason = error?.code ?? 'CAPTURE_PAGE_FAILED'
          } finally {
            signal.removeEventListener('abort', abort)
            await close()
          }
          const complete = !reason && documentHeight > 0 && covered >= documentHeight
          allComplete &&= complete
          yield {
            type: 'view-end',
            ...identity,
            complete,
            reason,
            documentHeight,
            tiles,
            covered,
            ...(pendingImages.length ? { pendingImages } : {})
          }
        }
      yield { type: 'end', version: 'vision-tiles/1', complete: allComplete }
    } finally {
      release()
    }
  }
}
