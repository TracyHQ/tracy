/**
 * The site check's look read: a page on each side of the template's light and dark switch. It answers, per side, the words on a plain
 * ground with the brand style on and off, the words on a picture against the picture region under them, each logo's
 * pixels against its ground, and the pictures shown on that side. The judging stays in `apps/tracy-web/src/site-check/`.
 *
 * A theme is put by moving the template's own mark: on JA templates the switch's script does only that and keeps a cookie
 * (read from the template's script and compared on the page, element by element).
 */

import { measureOverImage } from './demo-qa-browser.js'
import {
  beginLookInPage,
  endLookInPage,
  logoPixelsInPage,
  putSideInPage,
  readLookSideInPage
} from './demo-qa-look-in-page.js'

/** The desktop width: the logos are read there, the words at both widths. */
export const LOOK_WIDTH = 1440
/** What one side of one page may report or spend, so an odd page cannot make the answer huge or the read long. */
export const LOOK_CAPS = Object.freeze({
  textWalk: 2500,
  textRead: 400,
  words: 150,
  over: 14,
  logos: 6,
  shownPictures: 100,
  sideMs: 6000
})
/** A whole page's read at one width stops starting shots after this: what it could not reach is `truncated`. */
export const LOOK_MS = 18_000
const SETTLE_MS = 180
const LOGO_PIXELS = 40_000

const FREEZE_ID = 'tracy-qa-look-freeze'
const OVER_ATTR = 'data-tracy-look-over'
const LOGO_ATTR = 'data-tracy-look-logo'
const LOGO_STYLE_ID = 'tracy-qa-look-logo'
const SWITCH =
  '[class*="dark-mode"],[class*="theme-toggle"],[class*="theme-switch"],[class*="color-mode"],[id*="theme-toggle"],[data-bs-theme-value]'
const LOGOS =
  '[class*="logo"] img,img[class*="logo"],a[rel~="home"] img,.navbar-brand img,.custom-logo,.site-logo img,img[src*="logo"],[class*="logo"] svg,svg[class*="logo"],.navbar-brand:not(:has(img,svg)),.site-title:not(:has(img,svg))'

const shot = (page, clip) => page.screenshot({ clip, type: 'png', animations: 'disabled', timeout: 5000 })

const paint = (page, css) =>
  page.evaluate(
    ([id, text]) => {
      let style = document.getElementById(id)
      if (!text) return style?.remove()
      if (!style) {
        style = document.createElement('style')
        style.id = id
        document.head.append(style)
      }
      style.textContent = text
    },
    [LOGO_STYLE_ID, css]
  )

/**
 * One logo's pixels against what it sits on. Its ink is read with everything else hidden, on black and on white: the two
 * shots give each pixel's colour and alpha, so white words on a white ground count as ink, which comparing a shot with the
 * logo and one without it could never see. A logo that fills its whole box carries its own ground and is marked `plate`.
 * Never throws: a logo that cannot be shot keeps no reading.
 */
async function readLogo(page, logo) {
  const me = `[${LOGO_ATTR}="${logo.at}"]`
  try {
    const clip = await page.evaluate((selector) => {
      const el = document.querySelector(selector)
      if (!el) return null
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
      const r = el.getBoundingClientRect()
      const x = Math.max(0, Math.floor(r.left))
      const y = Math.max(0, Math.floor(r.top))
      const width = Math.min(innerWidth, Math.ceil(r.right)) - x
      const height = Math.min(innerHeight, Math.ceil(r.bottom)) - y
      return width >= 4 && height >= 4 ? { x, y, width, height } : null
    }, me)
    if (!clip) return
    await paint(page, `${me},${me} *{visibility:hidden!important}`)
    const ground = await shot(page, clip)
    const alone = (colour) =>
      `html{background:${colour}!important;visibility:visible!important}body,body *{visibility:hidden!important}${me},${me} *{visibility:visible!important}`
    await paint(page, alone('#000'))
    const black = await shot(page, clip)
    await paint(page, alone('#fff'))
    const white = await shot(page, clip)
    await paint(page, null)
    const pixels = await page.evaluate(logoPixelsInPage, {
      ground: ground.toString('base64'),
      black: black.toString('base64'),
      white: white.toString('base64'),
      maxPixels: LOGO_PIXELS
    })
    Object.assign(logo, pixels, { plate: pixels.share >= 0.9 })
  } catch {
    // A logo that moved or a shot that timed out stays unread, and the judge counts it as such.
  } finally {
    await paint(page, null).catch(() => {})
  }
}

/**
 * The look read of one page at one width, or null when the page would not answer.
 * @param {import('playwright').Page} page
 * @param {number} width
 */
export async function readLook(page, width) {
  let opened = null
  const started = Date.now()
  try {
    opened = await page.evaluate(beginLookInPage, { freezeId: FREEZE_ID, switchSelector: SWITCH })
    const sides = {}
    for (const side of opened.sides) {
      if (side !== 'only') {
        await page.evaluate(putSideInPage, side)
        await page.waitForTimeout(SETTLE_MS)
      }
      const read = await page.evaluate(readLookSideInPage, {
        caps: LOOK_CAPS,
        withLogos: width === LOOK_WIDTH,
        overAttr: OVER_ATTR,
        logoAttr: LOGO_ATTR,
        logoSelector: LOGOS
      })
      if (Date.now() - started < LOOK_MS)
        await measureOverImage(page, read.over, 'under', {
          attr: OVER_ATTR,
          max: LOOK_CAPS.over,
          ownWords: true
        })
      else if (read.over.length) read.truncated = true
      for (const logo of read.logos) {
        if (Date.now() - started >= LOOK_MS) {
          read.truncated = true
          break
        }
        await page
          .evaluate((selector) => {
            const el = document.querySelector(selector)
            if (el?.tagName === 'IMG') return el.decode().catch(() => {})
          }, `[${LOGO_ATTR}="${logo.at}"]`)
          .catch(() => {})
        await readLogo(page, logo)
      }
      await page.evaluate(
        (attrs) => {
          for (const attr of attrs)
            for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr)
        },
        [OVER_ATTR, LOGO_ATTR]
      )
      sides[side] = read
    }
    return {
      opening: opened.opening,
      worn: opened.worn,
      switchSeen: opened.switchSeen,
      sides
    }
  } catch {
    return null
  } finally {
    await page
      .evaluate(endLookInPage, {
        freezeId: FREEZE_ID,
        opening: opened?.opening ?? 'only',
        attrs: [OVER_ATTR, LOGO_ATTR]
      })
      .catch(() => {})
  }
}
