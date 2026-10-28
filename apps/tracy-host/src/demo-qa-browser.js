/**
 * The browser half of the demo QA gate: open one page of a site and read it into the plain object
 * `demo-qa.js` judges. Nothing here decides pass or fail.
 *
 * 🔒 IT READS A PAGE LIKE A VISITOR, AND ONLY THE PAGE IT WAS GIVEN. The demo hosts a template wires in
 * (ja-restaurant's OpenTable script, `browser.js#boundOtherOrigins`) are ABORTED and recorded — the
 * record is what fails the page, because a visitor's browser would have waited on them; every other
 * request goes through untouched, so a page that hangs on something else is measured as hanging.
 *
 * `readDemoPage` takes a Playwright page and never closes it: the regression case drives it on the
 * watched Chrome (chrome-watch) whose pages stay for a person to look at; `makeDemoQa` owns its own
 * browser and context on the host and closes those.
 */
import { createHash } from 'node:crypto'
import { LAUNCH_ARGS } from './browser.js'
import { DemoReadCache } from './demo-read-cache.js'
import { qaDeadline } from './demo-qa-deadline.js'
import { DEMO_QA_LOAD_CAP_MS, FILLER_SOURCE, hostIn, navPathsOf, READ_AT_ONCE, runDemoQa } from './demo-qa.js'
import { readResidueInPage } from './demo-residue-page.js'
import { selfNamedServer } from './self-named.js'
import { visionSlot } from './vision-stream.js'
import {
  classOfFamily,
  fitWordmark,
  inkOf,
  logoLayoutOf,
  pickFont,
  shippedFont,
  styleClassOf
} from './wordmark-style.js'

/** How long a page has to parse before it counts as not opening at all. */
const GOTO_MS = 25_000
/** The resource types whose failure on the site's own origin breaks what a visitor sees. */
const ASSETS = new Set(['image', 'font', 'stylesheet', 'script'])
/** The most bytes of one picture hashed (bigger pictures are hashed on their first bytes). */
const HASH_MAX_BYTES = 16 * 1024 * 1024

/**
 * @param {import('playwright').Page} page
 * @param {string} url
 * @param {string} path
 * @param {{demoHosts?: string[], siteHosts?: string[], serveFrom?: string | null, serveFromIsProxy?: boolean, proxySiteLabel?: string | null, sentinels?: Record<string, string | null>, discover?: boolean, loadCapMs?: number, gotoMs?: number}} [options]
 * @returns {Promise<import('./demo-qa.js').PageRead>}
 */
/**
 * A served document with what changes on every request taken out: Joomla's form token (the `csrf.token` script option
 * and the hidden input named by it), WordPress nonces, and CSP nonces. Nothing a visitor sees.
 * @param {string} html
 */
export function stableHtml(html) {
  return html
    .replace(/("csrf\.token"\s*:\s*")[0-9a-f]{32}(")/g, '$1$2')
    .replace(/(<input\b[^>]*\btype="hidden"[^>]*\bname=")[0-9a-f]{32}("[^>]*\bvalue="1")/g, '$1$2')
    .replace(/(<input\b[^>]*\bname="_wpnonce"[^>]*\bvalue=")[0-9a-f]{10}(")/g, '$1$2')
    .replace(/("(?:_wpnonce|nonce|_ajax_nonce)"\s*:\s*")[0-9a-f]{10}(")/g, '$1$2')
    .replace(/(\snonce=")[A-Za-z0-9+/=_-]{8,}(")/g, '$1$2')
}

export async function readDemoPage(
  page,
  url,
  path,
  {
    demoHosts = [],
    siteHosts = [],
    serveFrom = null,
    serveFromIsProxy = false,
    proxySiteLabel = null,
    sentinels = {},
    discover = false,
    wordmark = null,
    logoPicture = null,
    loadCapMs = DEMO_QA_LOAD_CAP_MS,
    gotoMs = GOTO_MS,
    previous = null
  } = {}
) {
  const own = new URL(url).origin
  /** Where a navigation served at the reachable address ended: the browser itself never sees that redirect. */
  const landed = new Map()
  // `serveFrom`: the address the site answers on when `url` is the name it gives itself (`self-named.js`).
  const {
    selfNamed,
    serve,
    hosts: ownHosts
  } = selfNamedServer({
    url,
    serveFrom,
    serveFromIsProxy,
    proxySiteLabel,
    siteHosts,
    onLanded: (requested, at) => landed.set(requested, at)
  })
  /** @type {Map<object, string>} */
  const inflight = new Map()
  const blocked = []
  const failed = []
  /** @type {Map<string, string>} */
  const shas = new Map()
  const hashing = []
  // The site's own address, or its published hostname: WordPress writes absolute links to the latter.
  const sameOrigin = (u) => {
    try {
      const to = new URL(u)
      return to.origin === own || hostIn(to.hostname, ownHosts)
    } catch {
      return false
    }
  }
  const onRequest = (req) => inflight.set(req, req.url())
  const onFinished = (req) => inflight.delete(req)
  const onFailed = (req) => {
    inflight.delete(req)
    const text = req.failure()?.errorText ?? 'failed'
    if (
      sameOrigin(req.url()) &&
      ASSETS.has(req.resourceType()) &&
      !/ERR_ABORTED|BLOCKED_BY_CLIENT/.test(text)
    )
      failed.push({ url: req.url(), status: text, type: req.resourceType() })
  }
  const onResponse = (res) => {
    const req = res.request()
    const type = req.resourceType()
    if (res.status() >= 400 && sameOrigin(res.url()) && ASSETS.has(type))
      failed.push({ url: res.url(), status: res.status(), type })
    if (type === 'image' && res.status() < 400)
      hashing.push(
        res
          .body()
          .then((bytes) =>
            shas.set(res.url(), createHash('sha256').update(bytes.subarray(0, HASH_MAX_BYTES)).digest('hex'))
          )
          .catch(() => {})
      )
  }
  const route = async (r) => {
    let u = null
    try {
      u = new URL(r.request().url())
    } catch {}
    if (u && hostIn(u.hostname, demoHosts)) {
      blocked.push(r.request().url())
      return r.abort('blockedbyclient').catch(() => {})
    }
    if (u && selfNamed(u)) {
      try {
        return await serve(r, u)
      } catch {
        if (serveFromIsProxy) return r.abort('failed').catch(() => {})
        // Direct transports retain the browser's own attempt when their answering address fails.
      }
    }
    return r.continue().catch(() => {})
  }

  page.on('request', onRequest)
  page.on('requestfinished', onFinished)
  page.on('requestfailed', onFailed)
  page.on('response', onResponse)
  await page.route('**/*', route)
  /** @type {import('./demo-qa.js').PageRead} */
  const read = { path, url, status: null, error: null, loadMs: null, pending: [], blocked, failed }
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    const started = Date.now()
    let response = null
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: gotoMs })
    } catch (error) {
      read.error = String(error?.message ?? error)
        .split('\n')[0]
        .slice(0, 300)
      return read
    }
    read.status = response?.status() ?? null
    read.finalUrl = landed.get(page.url()) ?? page.url()
    // The document as the server sent it, before any script ran: what the fingerprint below is made of.
    const served = typeof response?.text === 'function' ? await response.text().catch(() => null) : null
    const left = Math.max(1, loadCapMs - (Date.now() - started))
    const loaded = await page
      .waitForLoadState('load', { timeout: left })
      .then(() => true)
      .catch(() => false)
    if (loaded) {
      const measured = await page
        .evaluate(() => performance.getEntriesByType('navigation')[0]?.loadEventStart ?? 0)
        .catch(() => 0)
      read.loadMs = Math.round(measured > 0 ? measured : Date.now() - started)
    } else read.pending = [...new Set(inflight.values())].slice(0, 20)
    // 🔒 A PAGE THAT DID NOT CHANGE IS NOT READ AGAIN (plan "10/10" §7 S6, 26/10/2026): the page as served — status
    // and the whole document after load — is fingerprinted; when it is exactly what the previous check read
    // (`previous`, kept by `makeDemoQa` per site), that read is the answer and the slow part (pictures waited for,
    // words over pictures shot, the phone width) is skipped. A shared header, footer or menu changed changes every
    // page's document, so every page is read again; a page whose scripts write a different document each load is
    // simply read again. A check that passes this way is confirmed by a full one (`client-demo.js`).
    // 🔒 THE DOCUMENT AS SERVED, ITS PER-REQUEST TOKENS OUT (local measure 28/10/2026): fingerprinted after scripts ran,
    // a real CMS page differed on every load (a slider's classes, Joomla's form token), and every incremental read of
    // a 29- to 48-page site answered "0 unchanged". The served document with its per-request tokens taken out
    // (`stableHtml`) changes when the page's content does; a page the server answers differently each time is simply
    // read again.
    if (loaded) {
      const html =
        typeof served === 'string'
          ? stableHtml(served)
          : typeof page.content === 'function'
            ? await page.content().catch(() => null)
            : null
      if (typeof html === 'string') {
        read.fingerprint = createHash('sha256')
          .update(`${read.status}\n${read.finalUrl}\n${html}`)
          .digest('hex')
        if (previous?.fingerprint === read.fingerprint && previous.read && !previous.read.error)
          return { ...structuredClone(previous.read), fingerprint: read.fingerprint, reused: true }
      }
    }
    // Lazy pictures arrive as they scroll in; a visitor scrolls, so the read does too.
    await page
      .evaluate(async () => {
        const step = Math.max(400, innerHeight - 100)
        for (let y = 0, n = 0; y < document.documentElement.scrollHeight && n < 25; y += step, n++) {
          scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        scrollTo(0, 0)
      })
      .catch(() => {})
    // A lazy picture the walk started is waited for, not read as missing: a section background kept fixed while its
    // section scrolls (`jr-bg-fixed`) only begins when its section comes in, and 1200 px of photo outlasts the walk
    // (local round 20, 25/10/2026: a WordPress subscribe band whose photo loaded on scroll failed as an empty frame).
    await page
      .evaluate(async () => {
        const late = [...document.images].filter((img) => !img.complete && (img.currentSrc || img.src))
        for (const img of late) img.loading = 'eager'
        await Promise.race([
          Promise.all(late.map((img) => img.decode().catch(() => {}))),
          new Promise((r) => setTimeout(r, 4000))
        ])
      })
      .catch(() => {})
    await page.waitForTimeout(600)
    await Promise.race([Promise.all(hashing), page.waitForTimeout(5000)])
    Object.assign(
      read,
      await page.evaluate(readInPage, {
        sentinels,
        discover,
        wordmark,
        spot: Boolean(wordmark || logoPicture)
      })
    )
    // The template-style wordmark replaces the one drawn in the heading's type, when every step of it worked.
    if (wordmark && read.wordmarkSpot) {
      const styled = await styledWordmark(page, wordmark, read.wordmarkSpot).catch(() => null)
      if (styled) read.wordmark = styled
    }
    if (logoPicture && read.wordmarkSpot?.box) {
      const src = URL.canParse(logoPicture, url) ? new URL(logoPicture, url).href : null
      const fitted = src
        ? await page
            .evaluate(fitLogoInPage, {
              src,
              box: read.wordmarkSpot.box,
              scale: 2,
              current: read.wordmarkSpot.logo ?? null
            })
            .catch(() => null)
        : null
      if (fitted) read.fittedLogo = { ...fitted, source: src, logo: read.wordmarkSpot.logo }
    }
    delete read.wordmarkSpot
    // The residue ledger's read: hidden tabs included, so it is taken before the phone width reflows the page.
    read.residue = await page.evaluate(readResidueInPage, { filler: FILLER_SOURCE }).catch(() => null)
    for (const img of read.images ?? []) img.sha256 = shas.get(img.src) ?? null
    read.navLinks = navPathsOf(read.navHrefs ?? [], url, ownHosts)
    read.extraLinks = navPathsOf(read.extraHrefs ?? [], url, ownHosts, 12)
    delete read.navHrefs
    delete read.extraHrefs
    await measureOverImage(page, read.contrast ?? [], 'under')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await measureOverImage(page, read.contrast ?? [], 'underPhone')
    await page
      .evaluate(() => {
        for (const el of document.querySelectorAll('[data-tracy-qa-over]'))
          el.removeAttribute('data-tracy-qa-over')
      })
      .catch(() => {})
    Object.assign(
      read,
      await page.evaluate(() => {
        // Pictures a phone shows: one hidden on a desktop only (a phone-only block) is still seen.
        const phoneImages = []
        for (const img of document.body.querySelectorAll('img')) {
          const r = img.getBoundingClientRect()
          const shown =
            r.width > 0 &&
            r.height > 0 &&
            (img.checkVisibility
              ? img.checkVisibility({ opacityProperty: true, visibilityProperty: true })
              : true)
          if (shown && (img.currentSrc || img.src)) phoneImages.push(img.currentSrc || img.src)
          if (phoneImages.length >= 300) break
        }
        let widest = null
        let right = innerWidth + 1
        for (const el of document.body.querySelectorAll('*')) {
          const r = el.getBoundingClientRect()
          if (r.right > right && r.width > 0 && r.height > 0) {
            right = r.right
            widest =
              el.tagName.toLowerCase() +
              (el.id ? `#${el.id}` : '') +
              (el.classList[0] ? `.${el.classList[0]}` : '')
          }
        }
        return { scrollWidth: document.documentElement.scrollWidth, widest, phoneImages }
      })
    )
    return read
  } catch (error) {
    read.error ??= String(error?.message ?? error)
      .split('\n')[0]
      .slice(0, 300)
    return read
  } finally {
    await page.unroute('**/*', route).catch(() => {})
    page.off('request', onRequest)
    page.off('requestfinished', onFinished)
    page.off('requestfailed', onFailed)
    page.off('response', onResponse)
  }
}

/** Words over a picture measured on one page and width: the rest stays judged by eye (`looks-finished`). */
const OVER_IMAGE_MAX = 12
/** The attribute a hidden probe's words carry while the picture under them is shot. */
const OVER_HIDE = 'data-tracy-qa-hide'

/**
 * WHAT LIES UNDER WORDS OVER A PICTURE, MEASURED (plan "10/10" P0-5, 26/10/2026). The page read marks such words
 * (`overImage`) but had no colour to judge them against, so only the vision model saw a white heading on a bright
 * photo — local rounds 27–31 on WordPress failed `looks-finished` on it and the build could not tell how far off it
 * was. Each tagged text (`data-tracy-qa-over`) is brought to the middle of the screen, its words made transparent
 * (layout unchanged: colour only), the box its words cover shot, and the shot read back IN THE PAGE
 * (`createImageBitmap` on the bytes: no image library in this process, and a Blob is not a URL a site's CSP
 * reads). What the template paints between the picture and the words — a gradient, a dimmed overlay — is in the
 * shot, so it counts. Stored on the probe as relative luminance at the 15th, 50th and 85th percentile: the
 * check reads the bright end under light words and the dark end under dark ones, never the mean.
 * 🔒 NEVER THROWS, NEVER LEAVES THE WORDS HIDDEN: a probe that cannot be shot keeps no `key` and stays unjudged.
 * @param {import('playwright').Page} page
 * @param {{overImage?: boolean, over?: number}[]} contrast - the page read's probes; `key` is added to each.
 * @param {'under' | 'underPhone'} key
 */
async function measureOverImage(page, contrast, key) {
  const probes = contrast.filter((s) => s.overImage && Number.isInteger(s.over)).slice(0, OVER_IMAGE_MAX)
  for (const s of probes) {
    try {
      const box = await page.evaluate(
        ([n, hide]) => {
          const el = document.querySelector(`[data-tracy-qa-over="${n}"]`)
          if (!el) return null
          el.scrollIntoView({ block: 'center', inline: 'nearest' })
          const range = document.createRange()
          range.selectNodeContents(el)
          const r = range.getBoundingClientRect()
          const left = Math.max(0, r.left)
          const top = Math.max(0, r.top)
          const width = Math.min(innerWidth, r.right) - left
          const height = Math.min(innerHeight, r.bottom) - top
          if (width < 4 || height < 4) return null
          // Identify the actual painted element at this width, not its image URL: two cards can reuse one file.
          let frame = null
          const stack = document.elementsFromPoint(
            (left + Math.min(innerWidth, r.right)) / 2,
            (top + Math.min(innerHeight, r.bottom)) / 2
          )
          const at = stack.indexOf(el)
          for (const painted of at < 0 ? [] : stack.slice(at)) {
            const cs = getComputedStyle(painted)
            if (
              ['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'svg'].includes(painted.tagName) ||
              cs.backgroundImage !== 'none'
            ) {
              const path = []
              for (let node = painted; node && node !== document.documentElement; node = node.parentElement) {
                let nth = 1
                for (
                  let sibling = node.previousElementSibling;
                  sibling;
                  sibling = sibling.previousElementSibling
                )
                  nth++
                path.unshift(`${node.tagName.toLowerCase()}:nth-child(${nth})`)
              }
              frame = path.join('>')
              break
            }
            const colour = cs.backgroundColor.match(/[\d.]+/g)?.map(Number)
            if (colour && (colour.length === 3 || colour[3] >= 0.5)) break
          }
          if (!document.getElementById(hide)) {
            const style = document.createElement('style')
            style.id = hide
            style.textContent = `[${hide}],[${hide}] *{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important;text-decoration-color:transparent!important}`
            document.head.append(style)
          }
          el.setAttribute(hide, '')
          return { clip: { x: left, y: top, width, height }, frame }
        },
        [s.over, OVER_HIDE]
      )
      if (box === null) continue
      let shot = null
      try {
        shot = await page.screenshot({ clip: box.clip, type: 'png', animations: 'disabled', timeout: 5000 })
      } finally {
        await page.evaluate((hide) => {
          for (const el of document.querySelectorAll(`[${hide}]`)) el.removeAttribute(hide)
        }, OVER_HIDE)
      }
      const lum = await page.evaluate(async (b64) => {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = new OffscreenCanvas(bmp.width, bmp.height)
        try {
          const ctx = canvas.getContext('2d')
          if (!ctx) return null
          ctx.drawImage(bmp, 0, 0)
          const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data
          const ch = (v) => {
            const c = v / 255
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          }
          const step = Math.max(1, Math.floor(data.length / 4 / 20_000))
          const lums = []
          for (let i = 0; i < data.length; i += 4 * step)
            lums.push(0.2126 * ch(data[i]) + 0.7152 * ch(data[i + 1]) + 0.0722 * ch(data[i + 2]))
          if (lums.length === 0) return null
          lums.sort((x, y) => x - y)
          const at = (f) => Number(lums[Math.min(lums.length - 1, Math.floor(f * lums.length))].toFixed(4))
          return { p15: at(0.15), p50: at(0.5), p85: at(0.85) }
        } finally {
          // Release decoded pixels before the next probe instead of waiting for browser GC.
          bmp.close()
          canvas.width = canvas.height = 1
        }
      }, shot.toString('base64'))
      if (lum !== null) {
        s[key] = lum
        if (box.frame) s[`${key}Frame`] = box.frame
      }
    } catch {
      // A probe that moved, a shot that timed out: left unjudged, as it was before it was measured.
    }
  }
  await page.evaluate(() => scrollTo(0, 0)).catch(() => {})
}

/**
 * Runs INSIDE the page (serialised by Playwright): everything the checks read off the DOM.
 * @param {{sentinels: Record<string, string | null>, discover: boolean}} args
 */
async function readInPage({ sentinels, discover, wordmark, spot = false }) {
  // Where a header shows its logo picture: WordPress's custom logo and site-logo block, and the usual brand slots.
  // Declared first: this function runs in the page, so nothing of the module reaches it, and the return below already
  // calls the functions that read it.
  const LOGO_SPOTS =
    'img.custom-logo, .site-logo img, .wp-block-site-logo img, .navbar-brand img, .logo img, a.logo img, .site-branding img'

  const origin = location.origin
  const sel = (el) => {
    const one = (e) =>
      e.tagName.toLowerCase() +
      (e.id ? `#${e.id}` : '') +
      [...e.classList]
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join('')
    return el.parentElement && el.parentElement !== document.body
      ? `${one(el.parentElement)} > ${one(el)}`
      : one(el)
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true
  }
  const fileOf = (href) => {
    try {
      return decodeURIComponent(new URL(href, location.href).pathname).replace(/^\/+/, '')
    } catch {
      return ''
    }
  }

  // Stylesheets of this origin: what the browser parsed, and the text it was sent.
  const sheets = []
  for (const sheet of document.styleSheets) {
    if (!sheet.href || new URL(sheet.href).origin !== origin) continue
    let rules = null
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    const path = fileOf(sheet.href)
    if (sheets.some((s) => s.path === path)) continue
    const last = rules.length ? rules[rules.length - 1].cssText.slice(-100) : null
    // A content-hashed name (`_astro/Base.<hash>.css`) is looked up by its stem too: the baseline
    // named the file a rebuild has since renamed.
    const stem =
      /^((?:.*\/)?_astro\/[\w.-]+?)\.[A-Za-z0-9_-]{8}\.css$/.exec(path)?.[1] ??
      /^((?:.*\/)?assets\/[\w.-]+?)-[A-Za-z0-9_-]{8}\.css$/.exec(path)?.[1] ??
      null
    const wanted = sentinels[path] ?? (stem ? sentinels[`${stem}.css`] : undefined)
    const sentinelFound = wanted ? [...rules].some((r) => r.cssText.endsWith(wanted)) : null
    const text = await fetch(sheet.href, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => (t === null ? null : t.slice(0, 3_000_000)))
      .catch(() => null)
    sheets.push({ path, rules: rules.length, sentinel: last, sentinelFound, text })
  }
  // A stylesheet WordPress printed inline instead of linking it: under `styles_inline_size_limit` a core
  // block's `style.min.css` becomes `<style id="wp-block-…-inline-css">` ending in `/*# sourceURL=<its url> */`,
  // and which ones fit the budget changes with the page. Read under the file it names, so a sheet that moved
  // from <link> to <style> is still loaded (the-hill-station, 22/10/2026: `navigation/style.min.css` inlined
  // after the agent's turn read as "no longer loaded"). Only a block that applies to this screen counts, as a
  // linked sheet's media would; such a block is that sheet, not a new <style> block, for `look-kept` too.
  /** @type {Set<Element>} */
  const inlinedSheets = new Set()
  for (const st of document.querySelectorAll('style')) {
    const text = st.textContent ?? ''
    const named = /\/\*#\s*sourceURL=(\S+?\.css(?:[?#]\S*?)?)\s*\*\/\s*$/.exec(text)?.[1]
    if (!named || !st.sheet) continue
    const media = st.sheet.media?.mediaText ?? ''
    if (media && !matchMedia(media).matches) continue
    let url = null
    try {
      url = new URL(named, location.href)
    } catch {
      continue
    }
    if (url.origin !== origin) continue
    const path = fileOf(url.href)
    if (!path || sheets.some((s) => s.path === path)) continue
    let rules = null
    try {
      rules = st.sheet.cssRules
    } catch {
      continue
    }
    const last = rules.length ? rules[rules.length - 1].cssText.slice(-100) : null
    const wanted = sentinels[path]
    const sentinelFound = wanted ? [...rules].some((r) => r.cssText.endsWith(wanted)) : null
    sheets.push({ path, rules: rules.length, sentinel: last, sentinelFound, text: text.slice(0, 3_000_000) })
    inlinedSheets.add(st)
  }

  // What else paints the page besides its stylesheets, for `look-kept`: every <style> block (WordPress's
  // Additional CSS is one, `#wp-custom-css`) and every inline style that names a colour, a background or a font.
  const styles = [...document.querySelectorAll('style')]
    .filter((st) => !inlinedSheets.has(st))
    .slice(0, 200)
    .map((st) => ({ selector: sel(st), text: (st.textContent ?? '').slice(0, 200_000) }))
  // Every custom property those sheets and blocks declare, as the browser computes it on <html>: `var()` chains
  // resolved, so a sheet rewritten to read a slot with the old value as fallback computes exactly what it did.
  /** @type {Record<string, string>} */
  const computed = {}
  {
    const names = new Set()
    const texts = [...sheets.map((s) => s.text ?? ''), ...styles.map((st) => st.text)]
    for (const text of texts) for (const m of text.matchAll(/(?:^|[;{\s])(--[\w-]+)\s*:/g)) names.add(m[1])
    const root = getComputedStyle(document.documentElement)
    for (const name of [...names].slice(0, 4000)) computed[name] = root.getPropertyValue(name).trim()
  }
  const inline = []

  // 🔒 THE PAGE A PICTURE LEADS TO (round 5, 24/10/2026): a blog card's picture is printed from its post's meta
  // (`jd_intro_image`), so the sweep needs the post. The anchor around it, else the one page of this site the
  // nearest box around it (up to five levels) links to; none when that box links to two or more.
  const self = location.href.split('#')[0]
  const linkOf = (el) => {
    const own = (a) => {
      try {
        const u = new URL(a.getAttribute('href') ?? '', location.href)
        return u.origin === origin && u.href.split('#')[0] !== self ? u.href.split('#')[0] : null
      } catch {
        return null
      }
    }
    const anchor = el.closest('a[href]')
    if (anchor) return own(anchor)
    let box = el.parentElement
    for (let up = 0; box && box !== document.body && up < 5; up++, box = box.parentElement) {
      const hrefs = new Set([...box.querySelectorAll('a[href]')].map(own).filter(Boolean))
      if (hrefs.size === 1) return [...hrefs][0]
      if (hrefs.size > 1) return null
    }
    return null
  }
  const linked = (el) => {
    const link = linkOf(el)
    return link ? { link } : {}
  }

  // Every visible picture: <img> (currentSrc covers srcset and <picture>) and CSS backgrounds.
  const images = []
  /** The element each entry of `images` was read from, so the words-over-picture pass can mark it. */
  const imageEls = []
  // A carousel's copies of its own slides (owl `.cloned`, slick, swiper, splide, glide, flickity) show no picture
  // of their own (local round 35, 26/10/2026: a Joomla strip of five photos read as each one shown three times).
  const CLONE =
    '.cloned, .slick-cloned, .swiper-slide-duplicate, .splide__slide--clone, .glide__slide--clone, .flickity-clone'
  const all = [...document.body.querySelectorAll('*')].slice(0, 6000)
  for (const el of all) {
    const styled = el.getAttribute('style')
    if (styled && inline.length < 200 && /\b(color|background|fill|stroke|font)\b/i.test(styled))
      inline.push({ selector: sel(el), style: styled.slice(0, 2000) })
    if (!visible(el)) continue
    const r = el.getBoundingClientRect()
    // Where on the page, so a judge can tell two frames a visitor sees together from two far apart.
    const size = {
      width: Math.round(r.width),
      height: Math.round(r.height),
      top: Math.round(r.top + scrollY)
    }
    if (el.tagName === 'IMG') {
      const src = el.currentSrc || el.src
      // A picture set as a section's background (its frame or itself named `…-bg`, `background`: a WordPress
      // `jr-section-bg` figure) is a background, as a CSS one is; a drawn one (PNG/SVG) is the template's decoration
      // (`decoration`), a photo is still a photo (local round 20: a PNG sketch behind a welcome text, flagged, was
      // replaced with a photo the words could no longer be read on).
      const asBackground = [el, el.parentElement].some((x) =>
        [...(x?.classList ?? [])].some((c) => /(?:^|[-_])(?:bg|background)(?:[-_]|$)/i.test(c))
      )
      if (src && !src.startsWith('data:')) {
        images.push({
          src,
          ...size,
          kind: asBackground ? 'background' : 'img',
          broken: el.complete && el.naturalWidth === 0,
          selector: sel(el),
          ...linked(el),
          ...(el.closest(CLONE) ? { clone: true } : {})
        })
        imageEls.push(el)
      }
    }
    const bg = getComputedStyle(el).backgroundImage
    // A background a drawn picture inside covers whole is not seen: a theme's default masthead under the page's own
    // photo (local round 21, 25/10/2026: WordPress JA Restaurant's `masthead-default.jpg` behind each page's masthead).
    const covered =
      bg &&
      bg !== 'none' &&
      [...el.querySelectorAll('img')].some((img) => {
        if (!img.complete || img.naturalWidth === 0 || !visible(img)) return false
        const a = img.getBoundingClientRect()
        return (
          a.left <= r.left + 1 && a.top <= r.top + 1 && a.right >= r.right - 1 && a.bottom >= r.bottom - 1
        )
      })
    if (bg && bg !== 'none' && !covered)
      for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g))
        if (!m[1].startsWith('data:')) {
          images.push({
            src: new URL(m[1], location.href).href,
            ...size,
            kind: 'background',
            broken: false,
            selector: sel(el),
            ...linked(el),
            ...(el.closest(CLONE) ? { clone: true } : {})
          })
          imageEls.push(el)
        }
    // 🔒 A PICTURE DRAWN BY A PSEUDO-ELEMENT IS ON THE PAGE TOO (round 4, 24/10/2026): ja-diner's masthead stamp,
    // the template's own words in a picture, is `.ja-masthead::after`'s background and no element's.
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo)
      if (ps.content === 'none' || ps.content === 'normal' || ps.backgroundImage === 'none') continue
      for (const m of ps.backgroundImage.matchAll(/url\("?([^")]+)"?\)/g))
        if (!m[1].startsWith('data:')) {
          images.push({
            src: new URL(m[1], location.href).href,
            width: Math.round(Number.parseFloat(ps.width)) || size.width,
            height: Math.round(Number.parseFloat(ps.height)) || size.height,
            kind: 'background',
            broken: false,
            selector: `${sel(el)}${pseudo}`,
            ...(el.closest(CLONE) ? { clone: true } : {})
          })
          imageEls.push(el)
        }
    }
  }

  // Pictures in the page a visitor does not see (a closed <details>, [hidden], display:none); one in a
  // carousel is hidden between slides by design, and so is one in a tab panel not opened yet (local round 19,
  // 25/10/2026: the dishes of a WordPress menu's second and third tabs, read as placed for nothing).
  const CAROUSEL =
    '[class*="carousel"], [class*="slide"], [class*="swiper"], [class*="slick"], [class*="splide"], [class*="owl-"], [class*="glide"], [role="tabpanel"], [class*="tab-pane"], [class*="tab-panel"]'
  const hiddenImages = []
  for (const img of document.body.querySelectorAll('img')) {
    if (hiddenImages.length >= 300) break
    if (visible(img)) continue
    const src = img.currentSrc || img.src || img.getAttribute('data-src') || ''
    if (!src || src.startsWith('data:')) continue
    hiddenImages.push({
      src: new URL(src, location.href).href,
      selector: sel(img),
      carousel: Boolean(img.closest(CAROUSEL))
    })
  }

  // Frames made to hold a picture that show none: a <figure>, or a box named for a picture (a
  // template's `zig-visual`, `media`, `gallery-item`…) with no drawn picture, video or background in it
  // and next to no words of its own. Outermost only.
  const SLOT_CLASS =
    /(^|[-_\s])(visual|media|image|img|photo|picture|thumb|thumbnail|gallery|gallery-item|figure)([-_\s]|$)/i
  const drawsPicture = (box) => {
    const area = box.getBoundingClientRect()
    for (const e of [box, ...box.querySelectorAll('*')]) {
      if (e !== box && !visible(e)) continue
      if (e.tagName === 'IMG' && e.complete && e.naturalWidth > 0) return true
      // Still arriving is a picture on its way, never an empty frame; one that fails is `no-broken-assets`'s.
      if (e.tagName === 'IMG' && !e.complete && (e.currentSrc || e.getAttribute('src'))) return true
      if (['VIDEO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED'].includes(e.tagName)) return true
      if (/url\(/.test(getComputedStyle(e).backgroundImage)) return true
      if (e.tagName.toLowerCase() === 'svg') {
        const r = e.getBoundingClientRect()
        if (r.width * r.height >= 0.25 * area.width * area.height) return true
      }
    }
    return false
  }
  // Only a single semantic main can prove a shell-only destination. Missing/hidden/busy main is unknown.
  const mains = [...new Set(document.querySelectorAll('main, [role="main"]'))]
  const main = mains.length === 1 ? mains[0] : null
  let hiddenMain = false
  for (let el = main; el; el = el.parentElement) {
    const style = getComputedStyle(el)
    if (
      el.hasAttribute('hidden') ||
      el.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden'
    )
      hiddenMain = true
  }
  const busyMain =
    main &&
    (main.matches('[aria-busy="true"], [data-loading="true"]') ||
      main.querySelector('[aria-busy="true"], [role="progressbar"], [data-loading="true"]'))
  const mainContent = { state: 'unknown', selector: main ? sel(main) : null }
  if (main && !hiddenMain && !busyMain) {
    const words = (main.innerText ?? '').replace(/[\s\u200b-\u200d\ufeff]+/g, '')
    const controls = [
      ...main.querySelectorAll(
        'form, input, select, textarea, button, [contenteditable="true"], [role="button"]'
      )
    ].some(visible)
    mainContent.state = words || controls || drawsPicture(main) ? 'present' : 'empty'
  }

  const emptySlots = []
  for (const el of all) {
    if (emptySlots.length >= 40) break
    if (['IMG', 'PICTURE', 'VIDEO', 'BODY', 'MAIN', 'HEADER', 'FOOTER', 'NAV'].includes(el.tagName)) continue
    const named = el.tagName === 'FIGURE' || SLOT_CLASS.test(el.getAttribute('class') ?? '')
    if (!named || !visible(el) || emptySlots.some((s) => s.el.contains(el))) continue
    // A semantic quotation is a text figure, unless it also declares an image slot.
    if (
      el.tagName === 'FIGURE' &&
      el.querySelector('blockquote') &&
      el.querySelector('figcaption') &&
      !el.querySelector('img,picture,video,canvas,iframe,object,embed,svg,[role="img"]') &&
      ![el, ...el.querySelectorAll('*')].some((child) =>
        /url\(/.test(getComputedStyle(child).backgroundImage)
      ) &&
      !SLOT_CLASS.test(el.getAttribute('class') ?? '') &&
      ![...el.querySelectorAll('[class]')].some((child) => SLOT_CLASS.test(child.getAttribute('class') ?? ''))
    )
      continue
    const r = el.getBoundingClientRect()
    if (r.width < 120 || r.height < 100) continue
    const caption = [...el.querySelectorAll('figcaption')].reduce(
      (n, c) => n + (c.innerText ?? '').trim().length,
      0
    )
    if ((el.innerText ?? '').trim().length - caption > 40 || drawsPicture(el)) continue
    emptySlots.push({
      el,
      selector: sel(el),
      size: `${Math.round(r.width)}×${Math.round(r.height)}`,
      kind: el.tagName === 'FIGURE' ? 'figure' : 'frame'
    })
  }

  // A box the template made for a service — a booking or contact form, a feed, a map, a newsletter — shown with
  // nothing in it: local round 31 (WordPress, JA Restaurant) shipped an orange band under the hero, an OpenTable
  // form group with no restaurant behind it (`.ot-form`, empty at install). Named by its class, as picture frames
  // are (`SLOT_CLASS`): a decorative band names no service. Innermost only.
  const SERVICE_CLASS =
    /(?:^|[-_\s])(?:form|booking|book-?now|reserv(?:e|ation)s?|widget|feed|embed|map|newsletter|subscribe|sign-?up|opentable|calendar)(?:[-_\s]|$)/i
  const holds = (el) =>
    (el.innerText ?? '').trim().length > 0 ||
    drawsPicture(el) ||
    el.querySelector('input,select,textarea,button,iframe,object,embed,video,canvas,form,a[href]') !== null
  const emptyBoxes = []
  for (const el of all) {
    if (emptyBoxes.length >= 20) break
    if (['BODY', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'FORM', 'IFRAME'].includes(el.tagName)) continue
    // A form's own parts are the form working: an empty field is how a field looks (local round 35, 26/10/2026: the
    // inputs of an EmDash and a Joomla contact form, `ec-form-input` and `form-control`, read as five empty boxes, and
    // the EmDash build took the form off its page to pass).
    if (
      ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'OPTION', 'LABEL'].includes(el.tagName) ||
      el.closest('form')
    )
      continue
    if (!SERVICE_CLASS.test(el.getAttribute('class') ?? '') || holds(el)) continue
    let box = el
    let r = box.getBoundingClientRect()
    // An empty widget can collapse to zero height while its wrapper still paints a padded band.
    // Follow only empty wrappers, never a hidden widget or a parent holding other content.
    if (
      r.width >= 120 &&
      r.height === 0 &&
      el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true })
    ) {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (['BODY', 'MAIN', 'HEADER', 'FOOTER', 'NAV'].includes(parent.tagName) || holds(parent)) break
        const area = parent.getBoundingClientRect()
        if (visible(parent) && area.width >= 120 && area.height >= 24) {
          box = parent
          r = area
          break
        }
      }
    }
    if (!visible(box) || r.width < 120 || r.height < 24) continue
    const same = emptyBoxes.find((b) => b.el === box)
    if (same) {
      same.selector = sel(el)
      continue
    }
    if (emptyBoxes.some((b) => box.contains(b.el))) continue
    for (let i = emptyBoxes.length - 1; i >= 0; i--)
      if (emptyBoxes[i].el.contains(box)) emptyBoxes.splice(i, 1)
    emptyBoxes.push({ el: box, selector: sel(el), size: `${Math.round(r.width)}×${Math.round(r.height)}` })
  }

  // Blocks of text, innermost only: a <li> holding a <p> is read as the <p>.
  // A <summary> is an FAQ's question: template copy like any heading.
  const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote,dt,dd,address,summary'
  const blocks = []
  for (const el of document.body.querySelectorAll(BLOCK)) {
    if (blocks.length >= 800 || !visible(el) || el.querySelector(BLOCK)) continue
    const text = (el.innerText ?? '').replace(/\s+/g, ' ').trim()
    // A form's own words (labels, consent, sign-in prompts) are the form working, not the template's copy.
    const count = text ? text.split(' ').length : 0
    // A heading of two or three words is read too (`short`), judged by its own rule (local round 22, 25/10/2026: an
    // EmDash bakery's home kept the template's "Selected projects" heading through every check).
    const heading = /^H[1-6]$/.test(el.tagName)
    // So is a line set as part of a heading, its class or its parent's naming one (local round 31, 25/10/2026: a hero's
    // accent line "Bar & Restaurant" under "Welcome to Levain" was read by nothing).
    const headingPart =
      !heading &&
      /(?:^|[\s_-])(?:h[1-6]|heading|title|subtitle|tagline|eyebrow|kicker|accent)(?:$|[\s_-])/i.test(
        `${el.getAttribute('class') ?? ''} ${el.parentElement?.getAttribute('class') ?? ''}`
      )
    if (count >= 4 || ((heading || headingPart) && count >= 2))
      blocks.push({
        text: text.slice(0, 500),
        selector: sel(el),
        ...(count < 4 ? { short: true } : {}),
        ...(el.closest('form') ? { form: true } : {})
      })
  }

  // The template's taxonomy as the page shows it: the name of each category or tag a link opens ("Engineering",
  // "Disclosures"), a short label the text blocks above never hold (local stand 24/10/2026, an EmDash bakery
  // kept a template's four news categories after every check passed).
  const TAXONOMY = /\/(?:category|categories|tags?|topics?)\/|[?&](?:cat|category|tag)=/i
  const labels = []
  for (const a of document.body.querySelectorAll('a[href]')) {
    if (labels.length >= 300 || !visible(a)) continue
    let href
    try {
      href = new URL(a.href)
    } catch {
      continue
    }
    if (href.origin !== location.origin || !TAXONOMY.test(href.pathname + href.search)) continue
    // A count printed beside the name ("Engineering 5") is not part of it.
    const text = (a.innerText ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\(?\d+\)?$/, '')
      .trim()
    const n = text ? text.split(' ').length : 0
    if (n >= 1 && n <= 5) labels.push({ text, href: href.pathname + href.search })
  }

  // Calls to action: a link that says it books, or that looks like a button. A link of the nav is marked so: it is only
  // held to going somewhere (`cta-real`), and a nav item that opens its own submenu (`opens`) goes there by opening it.
  // Each word starts a word: "Facebook" is not a booking (pilot 23/10/2026).
  const BOOKING = /\b(?:book|reserv|table|order|appointment)|đặt/i
  const SUBMENU =
    ':scope > ul, :scope > ol, :scope > .wp-block-navigation__submenu-container, :scope > .sub-menu, :scope > .dropdown-menu, :scope > .nav-child'
  const BUTTON = /\b(btn|button|cta)\b|wp-block-button__link|wp-element-button/i
  const ctas = []
  for (const a of document.body.querySelectorAll('a')) {
    if (!visible(a)) continue
    const text = `${a.innerText ?? ''} ${a.getAttribute('aria-label') ?? ''}`.replace(/\s+/g, ' ').trim()
    // A call to action is a few words ("Book a table", "Order online"); an article title that says "order"
    // is a link to the article (pilot 24/10/2026: "Corn or flour: how to order a taco" read as booking).
    const booking = BOOKING.test(text) && text.split(' ').length <= 6
    const button = BUTTON.test(typeof a.className === 'string' ? a.className : '')
    const nav = !button && Boolean(a.closest('nav, [role="navigation"], .wp-block-navigation'))
    const navigation = nav || Boolean(a.closest('footer'))
    if (!booking && !button && !navigation) continue
    const opens = nav && Boolean(a.closest('li')?.querySelector(SUBMENU))
    // A button inside a form submits it from script (`javascript:void(0)`): it goes to the form's own action.
    const submits = Boolean(a.closest('form'))
    ctas.push({
      href: a.getAttribute('href') ?? '',
      text: text.slice(0, 80),
      booking,
      button,
      nav,
      navigation,
      ...(opens ? { opens } : {}),
      ...(submits ? { submits } : {}),
      ...(nav &&
      a.matches(
        '[role="button"][aria-expanded], [aria-controls][aria-expanded], [data-toggle="dropdown"], [data-bs-toggle="dropdown"]'
      )
        ? { toggles: true }
        : {}),
      selector: sel(a)
    })
  }

  // Map links and the address each one searches (`facts-from-brief`): the words beside a link can be the business's
  // while the link still searches the template's demo address (local round 27, 25/10/2026, a WordPress hero).
  const MAP_HOST = /(?:^|\.)(?:google\.[a-z.]+|goo\.gl|maps\.apple\.com|bing\.com|openstreetmap\.org)$/i
  const maps = []
  for (const a of document.body.querySelectorAll('a[href]')) {
    if (maps.length >= 50) break
    let url
    try {
      url = new URL(a.href)
    } catch {
      continue
    }
    if (!MAP_HOST.test(url.hostname) || !/map/i.test(url.hostname + url.pathname)) continue
    const param = ['q', 'query', 'daddr', 'destination', 'address', 'where']
      .map((k) => url.searchParams.get(k))
      .find((v) => v && v.trim())
    const path = url.pathname.match(/\/maps\/(?:place|search|dir)\/([^/@]+)/)?.[1]
    const query = (param ?? (path ? decodeURIComponent(path).replace(/\+/g, ' ') : ''))
      .replace(/\s+/g, ' ')
      .trim()
    if (query)
      maps.push({
        query: query.slice(0, 200),
        text: (a.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        selector: sel(a)
      })
  }

  // The template's sections Tracy marked at build (`tracy-sec-<section>`), in page order: a hidden one
  // reads as not there, and its items are the visible blocks classed `item` or `*-item` (`dish-item`).
  const ITEM = (el) => [...el.classList].some((c) => c === 'item' || c.endsWith('-item'))
  const sections = []
  for (const el of document.body.querySelectorAll('[class*="tracy-sec-"]')) {
    if (sections.length >= 200) break
    const name = [...el.classList].find((c) => c.startsWith('tracy-sec-'))?.slice('tracy-sec-'.length)
    if (!name || !visible(el)) continue
    const items = [...el.querySelectorAll('[class]')].filter((d) => ITEM(d) && visible(d)).length
    sections.push({ name, items, text: (el.innerText ?? '').replace(/\s+/g, ' ').trim().length })
  }

  // Nav links of home, as absolute addresses; `navPathsOf` (Node side) keeps the site's own, since
  // only the caller knows the published hostname WordPress writes its menu with. Top-level items first,
  // then every other link in a nav or the header (submenus, an EmDash "About ▾" panel's siblings); then
  // the footer and the sitemap, which reach a page a dropdown button hides (`extraHrefs`).
  const navHrefs = []
  const extraHrefs = []
  const absolute = (href, to) => {
    try {
      to.push(new URL(href ?? '', location.href).href)
    } catch {}
  }
  if (discover) {
    const top = [
      'header nav > ul > li > a[href]',
      'nav > ul > li > a[href]',
      '.t3-megamenu ul.level0 > li > a[href]',
      '.t4-megamenu ul.level0 > li > a[href]',
      'nav ul.navbar-nav > li > a[href]'
    ].join(', ')
    for (const a of [
      ...document.querySelectorAll(top),
      ...document.querySelectorAll('nav a[href], [role="navigation"] a[href], header a[href]')
    ]) {
      if (navHrefs.length >= 80) break
      absolute(a.getAttribute('href'), navHrefs)
    }
    for (const a of document.querySelectorAll('footer a[href]')) {
      if (extraHrefs.length >= 40) break
      absolute(a.getAttribute('href'), extraHrefs)
    }
    // The site's own sitemap names its pages under its published name: each is read as a path here.
    const locs = async (path) => {
      try {
        const res = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(5000) })
        if (!res.ok) return null
        const doc = new DOMParser().parseFromString((await res.text()).slice(0, 2_000_000), 'application/xml')
        if (doc.querySelector('parsererror')) return null
        const list = [...doc.getElementsByTagNameNS('*', 'loc')]
          .map((l) => l.textContent.trim())
          .slice(0, 200)
        return { index: doc.documentElement.localName === 'sitemapindex', list }
      } catch {
        return null
      }
    }
    const onSite = (u) => {
      try {
        const to = new URL(u, location.href)
        return to.pathname + to.search
      } catch {
        return null
      }
    }
    for (const first of ['/sitemap.xml', '/wp-sitemap.xml']) {
      const top = await locs(first)
      if (!top) continue
      const children = top.index
        ? top.list.sort((a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a))).slice(0, 3)
        : []
      const pages = top.index ? [] : top.list
      for (const child of children) {
        const path = onSite(child)
        const sub = path ? await locs(path) : null
        if (sub && !sub.index) pages.push(...sub.list)
      }
      for (const u of pages.slice(0, 60)) {
        const path = onSite(u)
        if (path) absolute(path, extraHrefs)
      }
      break
    }
  }

  // Contrast and overlap, probed where the words are painted.
  const rgba = (s) => {
    const m = /^rgba?\(([^)]+)\)$/.exec(s ?? '')
    if (!m) return null
    const v = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    return [v[0], v[1], v[2], v[3] ?? 1]
  }
  // 🔒 A SEE-THROUGH PATTERN COVERS NOTHING (lrsweep rig, 24/10/2026): ja-diner's offer box lays `.mark`, a
  // position:absolute pattern.png whose pixels are all but transparent, over its words; the template's own words
  // and the sweep's placeholder alike were reported covered. A background picture counts as paint only when enough
  // of it is solid to hide words; one that cannot be read (another origin, not a picture) still counts.
  const solidness = new Map()
  const solid = (url) => {
    if (!solidness.has(url))
      solidness.set(
        url,
        (async () => {
          try {
            const answer = await fetch(url)
            if (!answer.ok) return true
            const bitmap = await createImageBitmap(await answer.blob())
            const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height))
            const w = Math.max(1, Math.round(bitmap.width * scale))
            const h = Math.max(1, Math.round(bitmap.height * scale))
            const canvas = new OffscreenCanvas(w, h)
            const g = canvas.getContext('2d')
            g.drawImage(bitmap, 0, 0, w, h)
            const { data } = g.getImageData(0, 0, w, h)
            let opaque = 0
            for (let i = 3; i < data.length; i += 4) if (data[i] >= 64) opaque++
            return opaque / (w * h) >= 0.02
          } catch {
            return true
          }
        })()
      )
    return solidness.get(url)
  }
  const painted = async (e) => {
    if (['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'svg'].includes(e.tagName)) return true
    const cs = getComputedStyle(e)
    if ((rgba(cs.backgroundColor)?.[3] ?? 0) >= 0.5) return true
    if (cs.backgroundImage === 'none') return false
    // Each layer a picture of its own address; a gradient or anything else paints.
    const layers = cs.backgroundImage.split(/,(?![^(]*\))/).map((l) => l.trim())
    for (const layer of layers) {
      const url = /^url\(\s*["']?([^"')]+)["']?\s*\)$/.exec(layer)?.[1]
      if (!url || (await solid(new URL(url, location.href).href))) return true
    }
    return false
  }
  const pinned = (e) => {
    for (let x = e; x && x !== document.body; x = x.parentElement)
      if (['fixed', 'sticky'].includes(getComputedStyle(x).position)) return true
    return false
  }
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
  const groups = [
    ['nav', 'header nav a, nav a', 8],
    ['heading', 'h1, h2, h3', 10],
    ['button', '.btn, button, a[class*="btn"], a[class*="button"]', 10],
    ['text', 'p, address, li, span', 40]
  ]
  const probes = []
  for (const [where, query, max] of groups) {
    let n = 0
    for (const el of document.body.querySelectorAll(query)) {
      if (n >= max) break
      if (!visible(el) || !ownText(el) || probes.some((p) => p.el === el)) continue
      probes.push({ where, el })
      n++
    }
  }
  const contrast = []
  /** Pictures some words lie on: a photo set under a heading as `<img>` (a WordPress cover block) is a section's ground. */
  const underWords = new Set()
  const overlaps = []
  for (const { where, el } of probes) {
    const box = el.getBoundingClientRect()
    scrollTo(0, Math.max(0, scrollY + box.top - innerHeight / 2 + box.height / 2))
    const textNode = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    const range = document.createRange()
    range.selectNodeContents(textNode)
    const rect = [...range.getClientRects()].find((r) => r.width > 2 && r.height > 2)
    if (!rect || rect.top < 0 || rect.bottom > innerHeight) continue
    const points = [0.15, 0.5, 0.85].map((f) => [rect.left + rect.width * f, rect.top + rect.height / 2])
    const text = textNode.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
    let covered = null
    for (const [x, y] of points) {
      const stack = document.elementsFromPoint(x, y)
      const at = stack.indexOf(el)
      if (at === -1) continue
      const top = stack[0]
      if (top !== el && !el.contains(top) && !top.contains(el) && (await painted(top)) && !pinned(top)) {
        covered = sel(top)
        break
      }
    }
    if (covered) overlaps.push({ text, selector: sel(el), coveredBy: covered })
    const [x, y] = points[1]
    const stack = document.elementsFromPoint(x, y)
    const at = stack.indexOf(el)
    if (at === -1) continue
    let bg = null
    let overImage = false
    /** The picture the words lie on, so a judge can tell the template's own from one the build placed. */
    let underSrc = null
    for (const e of stack.slice(at)) {
      if (['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'svg'].includes(e.tagName)) {
        overImage = true
        const img = e.tagName === 'PICTURE' ? (e.querySelector('img') ?? e) : e
        underWords.add(img)
        underSrc = img.currentSrc || img.src || null
        break
      }
      const cs = getComputedStyle(e)
      if (cs.backgroundImage !== 'none') {
        overImage = true
        const m = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage)
        if (m && !m[1].startsWith('data:')) underSrc = new URL(m[1], location.href).href
        break
      }
      const c = rgba(cs.backgroundColor)
      if (c && c[3] >= 0.5) {
        bg = c.slice(0, 3)
        break
      }
    }
    const fg = rgba(getComputedStyle(el).color)
    if (!fg) continue
    // Words over a picture are tagged so the reader can shoot what lies under them (`measureOverImage`), and say
    // whether they are large text in WCAG's sense (24 px, or 18.66 px bold), which reads at a lower contrast.
    const cs = getComputedStyle(el)
    const px = Number.parseFloat(cs.fontSize) || 0
    const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700)
    if (overImage) el.setAttribute('data-tracy-qa-over', String(contrast.length))
    contrast.push({
      where,
      fg,
      bg: overImage ? null : (bg ?? [255, 255, 255]),
      overImage,
      ...(overImage ? { over: contrast.length, large, ...(underSrc ? { underSrc } : {}) } : {}),
      selector: sel(el),
      text
    })
  }
  scrollTo(0, 0)

  // How far the document lets a visitor scroll against how far its content reaches: `overflow`
  // on html/body (an agent's "fix" for a phone overflow) clips every section under the fold.
  let contentBottom = 0
  for (const el of all) {
    if (!visible(el)) continue
    contentBottom = Math.max(contentBottom, el.getBoundingClientRect().bottom + scrollY)
  }
  const reach = {
    documentHeight: document.documentElement.scrollHeight,
    contentHeight: Math.round(contentBottom),
    htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    bodyOverflowY: getComputedStyle(document.body).overflowY
  }

  // The header's brand block (`header-brand`): what of the site's logo and name a visitor sees there. A CMS names it
  // (`custom-logo`, `wp-block-site-title`, `navbar-brand`, `logo`), or it is the header's link home outside the nav.
  const BRAND =
    '.custom-logo-link, .wp-block-site-logo, .wp-block-site-title, .site-title, .site-logo, .site-branding, .navbar-brand, a[rel~="home"], [class*="logo"], [class*="brand"]'
  // A menu's own "Home" item is no brand, in a <nav> or a bare list (`ul.navbar-nav`).
  const IN_NAV = 'nav, [role="navigation"], .wp-block-navigation, .t4-megamenu, .t3-megamenu, ul, ol'
  const header = document.querySelector(
    'header, [role="banner"], .site-header, #t4-header, .t4-header, #t3-header'
  )
  const home = (a) => {
    try {
      return /^\/(index\.php\/?)?$/.test(new URL(a.href).pathname)
    } catch {
      return false
    }
  }
  // A plain text link home in a row of links like it is that row's "Home" item, wherever the row is (Barb Wire,
  // 24/10/2026: a header rebuilt as paragraphs of links, no <nav>, no brand left). Like it = the same class: a name's
  // link styled on its own beside the menu, a search button and a call to action is the brand (b. patisserie, local
  // rounds 24–25, 25/10/2026). The row is looked for inside the header, never in a top bar of contacts above it.
  const inLinkRow = (a) => {
    const like = (o) => o !== a && !home(o) && !o.closest(IN_NAV) && o.className === a.className
    const top = header?.parentElement ?? document.body
    for (
      let p = a.parentElement, up = 0;
      p && p !== top && p !== document.body && up < 3;
      p = p.parentElement, up++
    )
      if ([...p.querySelectorAll('a[href]')].filter(like).length >= 2) return true
    return false
  }
  const brandOf = (el) =>
    visible(el) &&
    !el.closest(IN_NAV) &&
    !el.closest('footer') &&
    (el.matches(BRAND) ||
      (el.tagName === 'A' && home(el) && (Boolean(el.querySelector('img, svg')) || !inLinkRow(el))))
  const scope = header
    ? [...header.querySelectorAll('*')]
    : all.filter((el) => el.getBoundingClientRect().top < 200)
  const marks = scope.filter(brandOf).filter((el, _i, list) => !list.some((o) => o !== el && o.contains(el)))
  const brandImages = []
  let brandText = ''
  for (const el of marks.slice(0, 5)) {
    for (const img of [...(el.tagName === 'IMG' ? [el] : []), ...el.querySelectorAll('img')])
      if (visible(img) && (img.currentSrc || img.src))
        brandImages.push({ src: img.currentSrc || img.src, alt: (img.alt ?? '').slice(0, 200) })
    if (el.querySelector('svg') && visible(el.querySelector('svg')))
      brandImages.push({ src: '', alt: el.querySelector('svg title')?.textContent ?? '', svg: true })
    brandText = `${brandText} ${(el.innerText ?? '').replace(/\s+/g, ' ').trim()}`.trim().slice(0, 300)
  }
  const brand = {
    header: Boolean(header),
    found: brandImages.length > 0 || brandText !== '',
    images: brandImages.slice(0, 5),
    text: brandText
  }

  imageEls.forEach((el, i) => {
    if (underWords.has(el)) images[i].underWords = true
  })
  return {
    reach,
    mainContent,
    brand,
    sheets,
    styles,
    inline,
    computed,
    images,
    blocks,
    labels,
    ctas,
    maps,
    sections,
    reviewLinks: [...document.body.querySelectorAll('a[href]')]
      .filter(visible)
      .map((a) => a.href)
      .slice(0, 2000),
    navHrefs,
    extraHrefs,
    hiddenImages,
    emptySlots: emptySlots.map(({ el: _el, ...slot }) => slot),
    emptyBoxes: emptyBoxes.map(({ el: _el, ...box }) => box),
    contrast,
    overlaps,
    ...(wordmark ? { wordmark: drawWordmark(wordmark) } : {}),
    ...(spot ? { wordmarkSpot: logoSpot() } : {}),
    text: (document.body.innerText ?? '').slice(0, 300_000),
    // What a search result shows of the page: `withheld-not-shown` reads them as the page's text (never an image).
    title: (document.title ?? '').slice(0, 1000),
    metaDescription: (
      document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''
    ).slice(0, 2000),
    // A single post's own body (WordPress, Joomla, EmDash article markup): `no-copied-reviews` reads it alone.
    postText:
      document
        .querySelector(
          'body.single-post .wp-block-post-content, body.single-post .entry-content, body.view-article [itemprop="articleBody"], article [itemprop="articleBody"], body.single-post article'
        )
        ?.innerText?.slice(0, 100_000) ?? null
  }

  /**
   * 🔒 THE BUSINESS NAME IN THE THEME'S OWN TYPE, NEVER A SYMBOL (product owner, 24/10/2026): with no logo in the
   * research, the template's logo gives way to a wordmark — the name alone, set in the font the page's headings
   * are painted with and the colour words take where the logo sits, in a picture of the logo's own shape, so the
   * spot keeps its size. Drawn here because only the page has the theme's fonts loaded. Null without a logo spot.
   */
  function drawWordmark(name) {
    const logo = [...document.querySelectorAll(LOGO_SPOTS)].find(visible)
    const heading = [...document.querySelectorAll('h1, h2, h3')].find(
      (h) => visible(h) && !h.closest('header, nav') && ownText(h)
    )
    if (!logo || !heading) return null
    const box = logo.getBoundingClientRect()
    const type = getComputedStyle(heading)
    // The colour words take on the logo's own ground: the logo's container's, which its header sets.
    const colour = getComputedStyle(logo.parentElement ?? logo).color
    const scale = 4
    const w = Math.round(box.width * scale)
    const h = Math.round(box.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext('2d')
    const font = (size) => `${type.fontStyle} ${type.fontWeight} ${size}px ${type.fontFamily}`
    const text = type.textTransform === 'uppercase' ? name.toLocaleUpperCase() : name
    const words = text.split(/\s+/).filter(Boolean)
    // One, two or three lines, each as long as the others can make it: the one whose block fits largest wins.
    let best = null
    for (let n = 1; n <= Math.min(3, words.length); n++) {
      const lines = []
      const per = Math.ceil(words.length / n)
      for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(' '))
      g.font = font(100)
      const widest = Math.max(...lines.map((l) => g.measureText(l).width))
      const size = Math.min((w * 0.92 * 100) / widest, (h * 0.86) / (lines.length * 1.15))
      if (!best || size > best.size) best = { lines, size }
    }
    g.font = font(best.size)
    g.fillStyle = colour
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const lead = best.size * 1.15
    best.lines.forEach((line, i) => g.fillText(line, w / 2, h / 2 + (i - (best.lines.length - 1) / 2) * lead))
    return {
      png: canvas.toDataURL('image/png').split(',')[1],
      width: w,
      height: h,
      font: type.fontFamily,
      colour,
      logo: logo.currentSrc || logo.src
    }
  }

  /**
   * What the template-style wordmark is decided from (`wordmark-style.js`): the logo's box, its pixels at most 96
   * high (null when the picture cannot be read, a picture of another origin), the families the theme declares, and
   * the heading's type the drawing of before used. Null without a logo spot.
   */
  function logoSpot() {
    const logo = [...document.querySelectorAll(LOGO_SPOTS)].find(visible)
    if (!logo) return null
    const box = logo.getBoundingClientRect()
    const heading = [...document.querySelectorAll('h1, h2, h3')].find(
      (h) => visible(h) && !h.closest('header, nav') && ownText(h)
    )
    const type = heading ? getComputedStyle(heading) : null
    let pixels = null
    try {
      const scale = Math.min(1, 96 / Math.max(1, logo.naturalHeight))
      const w = Math.max(1, Math.round(logo.naturalWidth * scale))
      const h = Math.max(1, Math.round(logo.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const g = canvas.getContext('2d')
      g.drawImage(logo, 0, 0, w, h)
      const data = g.getImageData(0, 0, w, h).data
      let text = ''
      for (let i = 0; i < data.length; i += 0x8000)
        text += String.fromCharCode(...data.subarray(i, i + 0x8000))
      pixels = { width: w, height: h, rgba: btoa(text) }
    } catch {
      pixels = null
    }
    return {
      box: { width: box.width, height: box.height },
      logo: logo.currentSrc || logo.src,
      pixels,
      families: [...new Set([...document.fonts].map((f) => f.family.replace(/["']/g, '').trim()))].slice(
        0,
        40
      ),
      heading: type
        ? {
            family: type.fontFamily,
            weight: type.fontWeight,
            style: type.fontStyle,
            transform: type.textTransform
          }
        : null,
      colour: getComputedStyle(logo.parentElement ?? logo).color
    }
  }
}

/**
 * 🔒 THE WORDMARK IN THE STYLE OF THE TEMPLATE'S LOGO (product owner, round 9, 24/10/2026): the logo's ink colour,
 * a font of its kind of letter, one line when legible in the logo's box, else two even ones, a transparent PNG at
 * twice the box. Decided in `wordmark-style.js`, drawn in the page with the font loaded there. Null on any failure,
 * so the drawing of before stands (`drawWordmark`).
 * @param {import('playwright').Page} page
 * @param {string} name
 * @param {{box: {width: number, height: number}, pixels: {width: number, height: number, rgba: string} | null, families: string[], heading: {family: string, weight: string, style: string, transform: string} | null, colour: string}} spot
 */
export async function styledWordmark(page, name, spot) {
  if (!(spot?.box?.width > 0 && spot.box.height > 0)) return null
  const rgba = spot.pixels ? Buffer.from(spot.pixels.rgba, 'base64') : null
  const ink = rgba ? inkOf(rgba, spot.pixels.width, spot.pixels.height) : null
  const style = ink ? styleClassOf(ink.mask, spot.pixels.width, spot.pixels.height) : null
  const font = pickFont({ cls: style?.cls ?? null, families: spot.families ?? [], heading: spot.heading })
  const bytes = font.source === 'shipped' && font.cls ? shippedFont(font.cls) : null
  if (font.source === 'shipped' && !bytes) return null
  const text =
    spot.heading?.transform === 'uppercase' && font.source === 'heading' ? name.toLocaleUpperCase() : name
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const widths = await page.evaluate(measureWordmarkInPage, { words, font, bytes })
  if (!widths) return null
  // The template logo's lines, the box its ink fills and its cap height: what the name follows (`fitWordmark`).
  const layout = ink ? logoLayoutOf(ink.mask, spot.pixels.width, spot.pixels.height, spot.box) : null
  const fit = fitWordmark({ words, ...widths }, spot.box, { layout, capRatio: widths.cap })
  // The ink's colour only where the logo held enough ink to read its letter; a pixel or two is not a logo's ink.
  const colour = style && ink ? ink.colour : spot.colour
  const drawn = await page.evaluate(drawWordmarkInPage, { fit, font, colour, box: spot.box, scale: 2 })
  if (!drawn) return null
  return {
    ...drawn,
    font: font.family,
    colour,
    style: {
      cls: font.cls,
      source: font.source,
      ...(style ? { joins: style.joins, weight: style.weight, contrast: style.contrast } : {}),
      lines: fit.lines.length,
      size: fit.size,
      ...(layout ? { template: layout } : {}),
      ...(font.source === 'theme' ? { themeFamily: classOfFamily(font.family) } : {})
    }
  }
}

/**
 * 🔒 THE BUSINESS'S OWN LOGO TAKES THE TEMPLATE LOGO'S BOX (product owner, round 9, 24/10/2026). Set as it is, a
 * square badge in a 128 × 80 spot that sizes by width stands 128 high and pushes the header down. Runs INSIDE the
 * page: the picture at `src` laid whole and centred in the box (contain), on a transparent ground, at `scale`. Null
 * when it does not load or cannot be read back (a picture of another origin).
 *
 * 🔒 THE FITTED COPY WINS, ONCE (product owner, round 10, 24/10/2026). The agent may have set the business's logo
 * itself, unfitted; the sweep then sets the fitted copy over it, and a second run must plan nothing. `matches` says
 * the logo the page shows (`current`) already looks like the fitted copy: both drawn into one small grid, their
 * colours (weighted by alpha) within a few levels on average. Pixels, not a file name, so it holds on every CMS,
 * whatever name its writer gave the upload.
 * @param {{src: string, box: {width: number, height: number}, scale: number, current?: string | null}} args
 */
async function fitLogoInPage({ src, box, scale, current = null }) {
  const picture = new Image()
  picture.src = src
  await picture.decode()
  const w = Math.round(box.width * scale)
  const h = Math.round(box.height * scale)
  if (!(w > 0 && h > 0 && picture.naturalWidth > 0 && picture.naturalHeight > 0)) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g) return null
  const fit = Math.min(w / picture.naturalWidth, h / picture.naturalHeight)
  const dw = picture.naturalWidth * fit
  const dh = picture.naturalHeight * fit
  g.imageSmoothingQuality = 'high'
  g.drawImage(picture, (w - dw) / 2, (h - dh) / 2, dw, dh)
  return {
    png: canvas.toDataURL('image/png').split(',')[1],
    width: w,
    height: h,
    matches: await looksLike(canvas)
  }

  /** The current logo against the fitted canvas, on a grid of at most 64 high; false when it cannot be read. */
  async function looksLike(fitted) {
    if (typeof current !== 'string' || !current) return false
    try {
      const shown = new Image()
      shown.src = current
      await shown.decode()
      const gh = Math.max(1, Math.min(64, Math.round(box.height)))
      const gw = Math.max(1, Math.round((gh * box.width) / Math.max(1, box.height)))
      const grid = (source) => {
        const c = document.createElement('canvas')
        c.width = gw
        c.height = gh
        const cg = c.getContext('2d')
        cg.drawImage(source, 0, 0, gw, gh)
        return cg.getImageData(0, 0, gw, gh).data
      }
      const a = grid(shown)
      const b = grid(fitted)
      let diff = 0
      for (let i = 0; i < a.length; i += 4) {
        for (let k = 0; k < 3; k++) diff += Math.abs((a[i + k] * a[i + 3] - b[i + k] * b[i + 3]) / 255)
        diff += Math.abs(a[i + 3] - b[i + 3])
      }
      return diff / (a.length || 1) < 6
    } catch {
      return false
    }
  }
}

/**
 * Runs INSIDE the page: the chosen font loaded (a shipped one from its bytes), then the name's widths at 100px —
 * whole, and split after each word. Null when the font does not load.
 * @param {{words: string[], font: {family: string, weight: string, style: string, source: string}, bytes: string | null}} args
 */
async function measureWordmarkInPage({ words, font, bytes }) {
  try {
    if (bytes) {
      const raw = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))
      const face = new FontFace(font.family.replace(/"/g, ''), raw.buffer, { weight: '100 900' })
      await face.load()
      document.fonts.add(face)
    } else await document.fonts.load(`${font.style} ${font.weight} 100px ${font.family}`)
    const g = document.createElement('canvas').getContext('2d')
    g.font = `${font.style} ${font.weight} 100px ${font.family}`
    const width = (t) => g.measureText(t).width
    return {
      // The font's cap height per pixel of size: the template's cap height becomes a size with it.
      cap: g.measureText('H').actualBoundingBoxAscent / 100 || null,
      one: width(words.join(' ')),
      splits: words
        .slice(1)
        .map((_, i) => [width(words.slice(0, i + 1).join(' ')), width(words.slice(i + 1).join(' '))])
    }
  } catch {
    return null
  }
}

/**
 * Runs INSIDE the page: the fitted lines drawn centred in the logo's box at `scale`, on a transparent ground.
 * @param {{fit: {lines: string[], size: number}, font: {family: string, weight: string, style: string}, colour: string, box: {width: number, height: number}, scale: number}} args
 */
function drawWordmarkInPage({ fit, font, colour, box, scale }) {
  // The box, or the name's block where the template's cap height keeps it larger than the box.
  const w = Math.round(Math.max(box.width, fit.block?.width ?? 0) * scale)
  const h = Math.round(Math.max(box.height, fit.block?.height ?? 0) * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g || !(fit.size > 0)) return null
  const size = fit.size * scale
  g.font = `${font.style} ${font.weight} ${size}px ${font.family}`
  g.fillStyle = colour
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const lead = size * 1.2
  fit.lines.forEach((line, i) => g.fillText(line, w / 2, h / 2 + (i - (fit.lines.length - 1) / 2) * lead))
  return { png: canvas.toDataURL('image/png').split(',')[1], width: w, height: h }
}

/**
 * The QA reader `/_host/demo-qa` is wired with on a host: one Chromium for the process, one fresh
 * context per run. Null when Playwright is absent, so the route answers 503 NO_BROWSER.
 */

export async function makeDemoQa({
  log = console,
  playwright = null,
  runsAtOnce = 1,
  tabsAtOnce = READ_AT_ONCE
} = {}) {
  try {
    playwright ??= await import('playwright')
  } catch {
    log.warn?.('[host] playwright is not installed — /_host/demo-qa will answer 503 NO_BROWSER')
    return null
  }
  /** @type {import('playwright').Browser | null} */
  let browser = null
  const launched = async () => {
    if (browser && browser.isConnected()) return browser
    browser = await playwright.chromium.launch({ headless: true, args: LAUNCH_ARGS })
    return browser
  }
  /** The last read of each page, per site, for an incremental check (`readDemoPage` `previous`). */
  const lastReads = new DemoReadCache()
  const run = async ({
    asked,
    base,
    serveFrom = null,
    serveFromIsProxy = false,
    proxySiteLabel = null,
    signal
  }) => {
    signal.throwIfAborted()
    const b = await launched()
    signal.throwIfAborted()
    const context = await b.newContext({ viewport: { width: 1440, height: 900 } })
    let closing
    const close = () => (closing ??= context.close().catch(() => {}))
    const abort = () => {
      void close()
    }
    signal.addEventListener('abort', abort, { once: true })
    const siteKey = `${asked.label ?? ''}|${base}`
    // What an incremental read found, said once a run (28/10/2026: every incremental read answered "0 unchanged").
    const seen = { read: 0, last: 0, unchanged: 0, unprinted: 0 }
    try {
      signal.throwIfAborted()
      // Each page has its own tab; `runDemoQa` reads `tabsAtOnce` at a time to bound decoded images.
      const result = await runDemoQa({
        asked,
        base,
        readAtOnce: tabsAtOnce,
        read: async (url, path, options) => {
          signal.throwIfAborted()
          const page = await context.newPage()
          try {
            const previous = asked.incremental ? lastReads.get(JSON.stringify([siteKey, path])) : null
            const r = await readDemoPage(page, url, path, {
              ...options,
              serveFrom,
              serveFromIsProxy,
              proxySiteLabel,
              previous
            })
            signal.throwIfAborted()
            seen.read++
            if (previous) seen.last++
            if (r.reused) seen.unchanged++
            if (!r.fingerprint) seen.unprinted++
            if (r.fingerprint && !r.error && !r.reused)
              lastReads.set(JSON.stringify([siteKey, path]), { fingerprint: r.fingerprint, read: r })
            return r
          } finally {
            await page.close().catch(() => {})
          }
        }
      })
      signal.throwIfAborted()
      if (asked.incremental)
        log.log?.(
          `[host] demo-qa ${asked.label ?? ''}: ${seen.read} read, ${seen.last} with a last read, ${seen.unchanged} unchanged, ${seen.unprinted} with no fingerprint`
        )
      return result
    } finally {
      signal.removeEventListener('abort', abort)
      await close()
    }
  }
  // A browser context and its decoded images are the expensive part. A host owns `runsAtOnce` QA runs at a time
  // (`browserRunsOf`: one on a small host), including requests for different sites; the queue holds request
  // metadata, never page payloads. An expired waiter leaves the queue; a run gives its slot back only once its
  // context has closed, so no run starts beside one still closing.
  const slot = visionSlot(Infinity, runsAtOnce)
  return async (input) => {
    const deadline = qaDeadline(input.asked, input.signal)
    let release = null
    try {
      release = await slot(deadline.signal)
      deadline.signal.throwIfAborted()
      return await run({ ...input, signal: deadline.signal })
    } finally {
      deadline.dispose()
      release?.()
    }
  }
}
