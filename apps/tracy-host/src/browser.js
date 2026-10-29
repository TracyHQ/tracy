/**
 * The headless browser behind `POST /_host/capture` — the one part of tracy-host that draws a
 * pixel. It exists on the demo host because that is the only machine whose docker network a demo
 * container answers on (`sites/resolver.js#siteTarget`, ADR 0014 §2); tracy-web has no browser and
 * could not reach the demo by its internal name even if it did.
 *
 * WHY PLAYWRIGHT AND NOT THE DEMO'S OWN TOOLS. An EmDash template image carries Playwright and a
 * `tools/shoot.mjs`; a Joomla or WordPress demo container carries nothing of the sort. Capturing
 * had to work for EVERY CMS — the first real target, `ja_kinetic`, is Joomla — so the browser
 * lives HERE, one per host, and screenshots any demo by URL regardless of what is inside it.
 *
 * WHY LAZY, AND WHY IT MAY BE ABSENT. `makeShoot` returns null when Playwright cannot even be
 * imported (a dev box that never ran `playwright install`), and `app.js` answers that capture with
 * `503 NO_BROWSER` rather than a crash — a demo host without a browser is a configuration to read,
 * not a bug. When it IS present the browser is launched on the FIRST shot and kept for the life of
 * the process: launching Chromium is seconds, and a card's handful of layouts should pay it once.
 */

import { selfNamedServer } from './self-named.js'
import { createVisionCapturer } from './vision-capture.js'

/** Chromium in a container needs both of these; the dsh image's `tracy-chrome` wrapper sets the
 * same pair. `--no-sandbox` because there is no user namespace to sandbox into, and
 * `--disable-dev-shm-usage` because the default `/dev/shm` is tiny and a real page overflows it. */
export const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage']

/** How long one page has to reach DOMContentLoaded before it is given up on — inside the route's
 * own per-shot time box, so a page that never parses still fails as one shot, not a hung request. */
const GOTO_TIMEOUT_MS = 25000

/** How long a parsed page is then given to fire `load`, per caller. A grace, never a condition. */
const SHOT_LOAD_GRACE_MS = 15000
const OUTLINE_LOAD_GRACE_MS = 8000

/** How long a loaded page is then given to go quiet on the network. A grace, never a condition. */
const IDLE_GRACE_MS = 8000
const OUTLINE_IDLE_GRACE_MS = 3000

/** How long one request to ANOTHER origin may take before it is dropped (`boundOtherOrigins`). */
const OTHER_ORIGIN_TIMEOUT_MS = 5000

/**
 * Drop any request to another origin that does not answer in `OTHER_ORIGIN_TIMEOUT_MS`.
 *
 * 🔒 WHY (11/10/2026, ja-restaurant). The demo embeds OpenTable's reservation form as a plain
 * `<script src="//secure.opentable.com/frontdoor/default.aspx…">` in the body. OpenTable answers a
 * person's Chrome in under 4 s and holds headless Chromium open forever (measured on the Mac mini:
 * still pending after 40 s, and `curl` with a HeadlessChrome agent cut off after 18 s). A
 * parser-blocking script that never arrives stops the page before DOMContentLoaded AND `load`, so
 * waiting for either alone could never pass, and every outline and Create listing of that demo
 * died at the 25 s mark. Dropped, the script fails like a blocked tracker does, the parser goes
 * on, and the page loads (measured: DOMContentLoaded 6.4 s, load 7.0 s). The page's own origin is
 * never touched: what Tracy built is what is read and shot.
 *
 * @param {{ route?: Function }} context a Playwright browser context
 * @param {string} pageUrl the page about to be opened in it
 * @param {{ serveFrom?: string | null, serveFromIsProxy?: boolean, proxySiteLabel?: string | null, siteHosts?: string[] }} [self] where the site's own names are served from
 *   when `pageUrl` is a name that does not resolve here (`self-named.js`)
 */
async function boundOtherOrigins(
  context,
  pageUrl,
  { serveFrom = null, serveFromIsProxy = false, proxySiteLabel = null, siteHosts = [] } = {}
) {
  if (typeof context.route !== 'function') return
  const own = new URL(pageUrl).origin
  const self = selfNamedServer({ url: pageUrl, serveFrom, serveFromIsProxy, proxySiteLabel, siteHosts })
  await context.route('**/*', async (route) => {
    let url
    try {
      url = new URL(route.request().url())
    } catch {
      return route.continue()
    }
    if (self.selfNamed(url))
      try {
        return await self.serve(route, url)
      } catch {
        if (serveFromIsProxy) return route.abort('failed').catch(() => {})
        // Direct transports retain the browser's own attempt when their answering address fails.
      }
    if (url.origin === own || !/^https?:$/.test(url.protocol)) return route.continue()
    try {
      await route.fulfill({ response: await route.fetch({ timeout: OTHER_ORIGIN_TIMEOUT_MS }) })
    } catch {
      await route.abort().catch(() => {})
    }
  })
}

/**
 * Open `url` and wait for it the way a person would: parsed, then loaded if it loads, then quiet
 * if it gets quiet. Only DOMContentLoaded is a condition; the two after it are bounded graces.
 *
 * ⚠ `networkidle` USED TO BE THE CONDITION, then `load` was, and a demo that never reaches one of
 * them never passed it. A slider polling for its next slide keeps a request in flight every 500 ms
 * (review, 21/09), and one subresource that never finishes holds `load` for ever (ja-restaurant,
 * 11/10/2026). The DOM is readable, and the first screen painted, long before either.
 *
 * @param {{ loadGraceMs?: number, idleGraceMs?: number }} [graces]
 */
async function open(
  page,
  url,
  {
    gotoMs = GOTO_TIMEOUT_MS,
    loadGraceMs = SHOT_LOAD_GRACE_MS,
    idleGraceMs = IDLE_GRACE_MS,
    mark = () => {}
  } = {}
) {
  mark('opening the page', 'goto')
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: gotoMs })
  // A grace of 0 is skipped, never passed: Playwright reads `timeout: 0` as "wait for ever".
  mark('waiting for the page to load', 'load')
  if (loadGraceMs() > 0) await page.waitForLoadState?.('load', { timeout: loadGraceMs() })?.catch?.(() => {})
  mark('waiting for the network to go quiet', 'idle')
  if (idleGraceMs() > 0)
    await page.waitForLoadState?.('networkidle', { timeout: idleGraceMs() })?.catch?.(() => {})
}

/** The graces an outline waits with: it reads the DOM, it does not need every picture painted. */
const OUTLINE_GRACES = {
  loadGraceMs: () => OUTLINE_LOAD_GRACE_MS,
  idleGraceMs: () => OUTLINE_IDLE_GRACE_MS
}

/**
 * How much of a shot's deadline is kept for the pictures themselves (the screenshots of the ladder
 * and their PNG encoding), and so never spent on the waits before them. A 2× page four screens
 * long encodes in about 1.3 s on a Mac mini; a 2-core demo host under installs is several times
 * slower, and a heavy page takes a second, lighter picture.
 */
const PICTURE_RESERVE_MS = 8000

/**
 * The most device pixels one picture may have. 20.7 MP crashed the renderer on fleet01 (2 cores,
 * 3.9 GB, 13/10/2026) and 5.6 MP did not; 12 MP keeps a 1440-wide page at 2× for about two screens.
 */
const MAX_SHOT_PIXELS = 12_000_000

/** The fixed waits before the pictures; each is cut to what is left of the deadline. */
const FONTS_WAIT_MS = 4000

/**
 * Two device pixels per CSS pixel. A card shows a 1440-px shot in a ~300-px box on a screen that
 * has two device pixels per CSS pixel, so a 1× shot is shrunk ~2.5× by the browser and reads soft;
 * a 2× shot is shrunk ~1.2× and reads like the page (20/09: "the template thumbnails
 * are not good enough yet"). The file name still says the CSS width (`-1440.png`), which is the name the card
 * and the store agree on; only the pixels doubled.
 */
const DEVICE_SCALE_FACTOR = 2

/**
 * How much of a long page a full-page shot keeps, in CSS pixels. The preview dialog and its strip
 * of thumbnails read the full page, so `fullPage` stays; but a 6000-px home page at 2× is a
 * 12000-px-tall PNG that breaches the store's cap and Chromium's texture limit for nothing anyone
 * scrolls to inside a thumbnail. Four screens is where the card, the strip and the dialog stop.
 */
const MAX_PAGE_HEIGHT_PX = 3600

/**
 * How a page is walked before its shot, so what reveals on scroll is revealed in the picture.
 *
 * ⚠ A FULL-PAGE SHOT DOES NOT SCROLL. Chromium paints the whole page from where it stands, so a
 * template that hides its lower sections until they scroll into view photographs them hidden:
 * measured 28/09 on JA Vega (AOS, 57 `data-aos` on Home, 10 shown at load — shown only on scroll,
 * no timer) and JA Voyara (`reveal.js`, shown on scroll or after 3 s), whose cards came out white
 * from mid-page down. So the page is stepped down one screen at a time — one jump would skip every
 * section an IntersectionObserver only sees while it is on screen — then back to the top, and given
 * time for the entrance animations it just started (Vega: 1500 ms plus up to 400 ms of delay).
 * Reduced motion is asked for too: a template that honours it (Voyara) shows everything at once.
 *
 * ⚠ EACH STEP IS `behavior: 'instant'`. Vega sets `scroll-behavior: smooth`, so a plain
 * `scrollTo(0, y)` only STARTS a glide: measured 28/09, ten 100-ms steps reached 2071 px of 9899
 * and 28 of 57 sections were revealed; instant steps reached the end and revealed 57.
 *
 * ponytail: 30 steps covers 30 screens; an endless-scroll page stops there, which is also far past
 * the four screens a shot keeps.
 */
const SCROLL_STEP_PAUSE_MS = 100
const SCROLL_MAX_STEPS = 30
const REVEAL_SETTLE_MS = 2000

/**
 * What `readOutline` pulls out of a page, and nothing more.
 *
 * 🔒 IT READS, IT DOES NOT RUN THE PAGE'S CODE FOR US. Everything below is DOM already parsed by
 * Chromium — titles, link text, hrefs, computed colours. Nothing from the page decides what this
 * host does next: a caller gets strings, and the side that turns them into a card holds every rule
 * about what a card may say.
 *
 * ⚠ AND THESE ARE PAGES TRACY DOES NOT OWN. Link text is whatever a customer's site wrote, so it
 * is trimmed, capped and never used as a path — the path comes from the href's own pathname, which
 * the browser has already resolved and which is checked to be same-origin before it is kept. A
 * menu item pointing at Facebook is not a layout of this site.
 */
const OUTLINE_MAX_LINKS = 24
const OUTLINE_MAX_TEXT = 1200

/**
 * How a shot gives ground when the caller named a byte ceiling, in order. Density goes first and
 * page length second, because a card is READ at thumbnail size: a softer picture of the whole page
 * still shows the design, while a sharp picture that stops after one screen shows a different page
 * than the one the preview dialog scrolls.
 *
 * 🔒 WHY A LADDER AND NOT A NUMBER. The capture side is bounded by HEIGHT and the store by BYTES
 * (`MAX_PICTURE_BYTES`, `apps/tracy-web/src/lib/template-shots.js`), and neither bound implies the
 * other: measured 25/09 on `quickstart/ja-resort/j6`, `/about-us` and `/pages` obeyed the 3600-px
 * clip and still came back 9.4 MB and 12.1 MB, so Generate card lost two of six desktop shots and
 * the card could not be published at all (#344). Weighing the picture we actually took is the only
 * check that cannot be wrong about a page nobody has seen yet.
 *
 * @param {number} height the viewport height, and the shortest page any step will keep
 */
function ladder(height) {
  const steps = [
    { scale: DEVICE_SCALE_FACTOR, maxHeight: MAX_PAGE_HEIGHT_PX },
    { scale: 1, maxHeight: MAX_PAGE_HEIGHT_PX },
    { scale: 1, maxHeight: Math.round(MAX_PAGE_HEIGHT_PX / 2) },
    { scale: 1, maxHeight: height }
  ]
  // A tall viewport can make a later step ask for MORE page than the one before it, which would
  // weigh more, not less. Keep only the steps that actually give ground.
  return steps.filter(
    (step, i) => i === 0 || step.scale < steps[i - 1].scale || step.maxHeight < steps[i - 1].maxHeight
  )
}

/**
 * Build the `shoot` the capture route injects, or null if this host has no browser to build it
 * from. The returned function launches Chromium once, then screenshots each page it is handed.
 *
 * @param {{ log?: Console }} [opts]
 * @returns {Promise<((args: { url: string, width: number, height: number, maxBytes?: number | null }) => Promise<Buffer>) | null>}
 */
export async function makeShoot({ log = console, playwright = null, visionStreams = 1 } = {}) {
  // `playwright` may be handed in — a test pins the context and screenshot options that way
  // without launching a browser; production lets the import decide whether this host has one.
  try {
    playwright ??= await import('playwright')
  } catch {
    log.warn?.('[host] playwright is not installed — /_host/capture will answer 503 NO_BROWSER')
    return null
  }

  /** @type {import('playwright').Browser | null} */
  let browser = null
  const launched = async () => {
    if (browser && browser.isConnected()) return browser
    browser = await playwright.chromium.launch({ headless: true, args: LAUNCH_ARGS })
    return browser
  }

  /**
   * Open one page, settle and walk it, then hand each step of the ladder a screenshot of THAT page
   * until one fits the ceiling (or the ladder ends).
   *
   * 🔒 ONE LOAD PER SHOT, HOWEVER MANY STEPS (12/10/2026). Each step used to open a fresh context at
   * the step's density and load the page again, because `deviceScaleFactor` is fixed when a context
   * opens. So a page heavy at 2× paid two full loads, two walks and two settles inside the route's
   * single per-shot time box (`CAPTURE_TIMEOUT_MS`). Measured on `quickstart/ja-vogue/j6`
   * `/index.php/category-2` (29 images): 14 s for the first attempt and 25 s for the pair on a Mac
   * mini, and "shot timed out after 30000ms" four times in a row on the busier fleet01. Playwright's
   * `screenshot({ scale: 'css' })` draws one pixel per CSS pixel from the 2× page already on screen,
   * so the lighter picture needs no reload: only the first screenshot asks for device pixels.
   *
   * @param {{ url: string, width: number, height: number, steps: { scale: number, maxHeight: number }[], fits: (picture: Buffer) => boolean }} args
   */
  const shootLadder = async ({
    url,
    width,
    height,
    steps,
    fits,
    deadlineMs,
    signal,
    progress,
    serveFrom = null,
    serveFromIsProxy = false,
    proxySiteLabel = null,
    siteHosts = []
  }) => {
    // 🔒 EVERY WAIT FITS THE SHOT'S OWN DEADLINE (12/10/2026, fleet01). The waits below were fixed
    // numbers (25 s to parse, 15 s for `load`, 8 s for quiet, 4 s for fonts, 2 s to settle) inside
    // a 30 s box, so on a slow host they could add up past it and the shot came back as nothing.
    // Each wait is now cut to what is left after `PICTURE_RESERVE_MS`, and skipped when nothing is:
    // a slightly early picture beats no picture, which is what these waits always promised.
    const start = Date.now()
    const end = Number.isFinite(deadlineMs) && deadlineMs > 0 ? start + deadlineMs : Number.POSITIVE_INFINITY
    const spare = (cap) => Math.max(0, Math.min(cap, end - Date.now() - PICTURE_RESERVE_MS))
    let phaseKey = null
    let phaseAt = start
    /** Report where the shot is (`progress.phase`) and how long the phase before it took. */
    const mark = (phase, key) => {
      const now = Date.now()
      if (phaseKey && progress) progress.timings[phaseKey] = now - phaseAt
      phaseKey = key
      phaseAt = now
      if (progress) progress.phase = phase
    }
    mark('starting the browser', 'browser')
    const b = await launched()
    // A fresh context per shot so one page's cookies, storage or a left-over viewport never leak
    // into the next — the same isolation the checkout script gets by opening its own tab.
    const context = await b.newContext({
      viewport: { width, height },
      deviceScaleFactor: steps[0].scale,
      isMobile: width < 500,
      reducedMotion: 'reduce'
    })
    // A shot whose time ran out is stopped here, not left running: closing the context makes
    // every pending page call reject, so the next width gets the machine (`runCapture`).
    const stop = () => {
      context.close().catch(() => {})
    }
    signal?.addEventListener('abort', stop, { once: true })
    try {
      if (signal?.aborted) throw new Error('shot cancelled')
      await boundOtherOrigins(context, url, { serveFrom, serveFromIsProxy, proxySiteLabel, siteHosts })
      const page = await context.newPage()
      await open(page, url, {
        gotoMs: Math.max(1000, Math.min(GOTO_TIMEOUT_MS, end - Date.now())),
        loadGraceMs: () => spare(SHOT_LOAD_GRACE_MS),
        idleGraceMs: () => spare(IDLE_GRACE_MS),
        mark
      })
      // Idle is not painted: web fonts arrive after the last request settles, and an image above
      // the fold may still be decoding. Wait for what the page itself can promise — the font set,
      // and every image in the first screen — then walk the page so what reveals on scroll is
      // revealed (why: above `SCROLL_STEP_PAUSE_MS`), and settle for whatever animates in.
      mark('waiting for fonts and the first screen of images', 'fonts')
      const fontsWait = spare(FONTS_WAIT_MS)
      if (fontsWait > 0)
        await page
          .evaluate(
            ({ h, wait }) =>
              Promise.race([
                Promise.all([
                  document.fonts?.ready ?? Promise.resolve(),
                  ...[...document.images]
                    .filter((img) => img.getBoundingClientRect().top < h)
                    .map((img) => img.decode().catch(() => undefined))
                ]),
                new Promise((resolve) => setTimeout(resolve, wait))
              ]),
            { h: height, wait: fontsWait }
          )
          .catch(() => undefined)
      mark('walking the page', 'walk')
      const walkBudget = spare(SCROLL_MAX_STEPS * SCROLL_STEP_PAUSE_MS * 2)
      if (walkBudget > 0)
        await page
          .evaluate(
            async ({ step, pause, maxSteps, budget }) => {
              const wait = () => new Promise((resolve) => setTimeout(resolve, pause))
              const until = Date.now() + budget
              for (
                let i = 1;
                i <= maxSteps && i * step < document.documentElement.scrollHeight && Date.now() < until;
                i++
              ) {
                window.scrollTo({ top: i * step, behavior: 'instant' })
                await wait()
              }
              window.scrollTo({ top: 0, behavior: 'instant' })
            },
            { step: height, pause: SCROLL_STEP_PAUSE_MS, maxSteps: SCROLL_MAX_STEPS, budget: walkBudget }
          )
          .catch(() => undefined)
      mark('letting entrance animations settle', 'settle')
      const settle = spare(REVEAL_SETTLE_MS)
      if (settle > 0) await page.waitForTimeout(settle)
      mark('taking the picture', 'pictures')
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => height)
      const clipHeight = (step) => Math.max(height, Math.min(pageHeight, step.maxHeight))
      // 🔒 A STEP OVER THE PIXEL CAP IS NEVER ASKED FOR (13/10/2026, fleet01). ja-vogue
      // /category-2 at 1440 wide, 2× and four screens is 2880 × 7200 px (20.7 MP), and on the demo
      // host Chromium's renderer died drawing it ("page.screenshot: Target crashed"); before the
      // deadline work that read as a timeout. The same page at 390 (5.6 MP) was stored. So the
      // ladder gives ground on density first, as it already does for bytes, before it starts.
      const fitting = steps.filter(
        (step) => width * step.scale * clipHeight(step) * step.scale <= MAX_SHOT_PIXELS
      )
      const ladderSteps = fitting.length > 0 ? fitting : [{ scale: 1, maxHeight: steps.at(-1).maxHeight }]
      let picture = null
      for (const [i, step] of ladderSteps.entries()) {
        if (progress && i > 0) progress.phase = `taking a lighter picture (step ${String(i + 1)})`
        picture = await page.screenshot({
          type: 'png',
          fullPage: true,
          clip: { x: 0, y: 0, width, height: clipHeight(step) },
          // The context's own density for the first step; any step that drops below it asks for
          // CSS pixels from the page already loaded (why: the 🔒 ONE LOAD block above).
          ...(step.scale < steps[0].scale ? { scale: 'css' } : {})
        })
        if (fits(picture)) break
      }
      mark('done', null)
      // Every step still too heavy: the lightest one goes back anyway and the store says no, so
      // the operator reads one refusal naming the bytes, not a shot that silently never came.
      return picture
    } finally {
      signal?.removeEventListener('abort', stop)
      await context.close().catch(() => {})
    }
  }

  const shoot = async ({
    url,
    width,
    height,
    maxBytes = null,
    deadlineMs = null,
    signal = null,
    progress = null,
    serveFrom = null,
    serveFromIsProxy = false,
    proxySiteLabel = null,
    siteHosts = []
  }) => {
    const ceiling = Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : null
    const timing = { deadlineMs, signal, progress, serveFrom, serveFromIsProxy, proxySiteLabel, siteHosts }
    // No ceiling asked for: one shot at full density, exactly the behaviour every caller had
    // before a ceiling existed. An absent ceiling must never silently shrink anyone's picture.
    if (ceiling === null)
      return await shootLadder({
        url,
        width,
        height,
        steps: [{ scale: DEVICE_SCALE_FACTOR, maxHeight: MAX_PAGE_HEIGHT_PX }],
        fits: () => true,
        ...timing
      })
    return await shootLadder({
      url,
      width,
      height,
      steps: ladder(height),
      fits: (p) => p.length <= ceiling,
      ...timing
    })
  }
  shoot.vision = createVisionCapturer({ launched, prepare: boundOtherOrigins, streams: visionStreams })
  return shoot
}

/**
 * Read a demo's own shape off its home page: what it calls itself, where its navigation goes, and
 * whether it has a dark mode.
 *
 * WHY THE RENDERED PAGE AND NOT THE CMS. A menu lives in a different table in every CMS — Joomla's
 * `#__menu`, WordPress's `wp_posts`, EmDash's own store — and each needs that site's database
 * credentials and a query per platform. The navigation as SERVED is one mechanism for all three,
 * needs no credential, and is the menu a visitor actually sees rather than one a table implies.
 *
 * ⚠ DARK IS MEASURED, NOT ASKED. The page is loaded twice, with `?theme=light` and `?theme=dark`,
 * and the two body backgrounds are compared. That parameter is exactly what the preview dialog's
 * Light/Dark switch sends (the contract in tracy-design-inspiration TemplateBody.tsx), so a card
 * says "dark" only when pressing Dark changes the demo. It used to load under
 * `prefers-color-scheme: dark` instead, and measured 30/09 that said yes for demos (JA Vega,
 * Voyara, Resort, Tracy Base) whose switch then did nothing. Both loads keep
 * the light scheme so the parameter is the only difference.
 *
 * @param {{ url: string }} args the demo's home page
 * @returns {Promise<{ title: string, description: string, links: { label: string, path: string }[], dark: boolean, defaultTheme: 'light' | 'dark', text: string }>}
 */
export async function makeOutline({ log = console, playwright = null } = {}) {
  // `playwright` may be handed in, as for `makeShoot`: a test drives a page that never loads.
  try {
    playwright ??= await import('playwright')
  } catch {
    log.warn?.('[host] playwright is not installed — /_host/outline will answer 503 NO_BROWSER')
    return null
  }

  /** @type {import('playwright').Browser | null} */
  let browser = null
  const launched = async () => {
    if (browser && browser.isConnected()) return browser
    browser = await playwright.chromium.launch({ headless: true, args: LAUNCH_ARGS })
    return browser
  }

  /** The body's own background with one `?theme=` value (none: the demo's own opening side) — the whole of the dark test. */
  const backgroundUnder = async (b, url, theme) => {
    const context = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
    try {
      await boundOtherOrigins(context, url)
      const page = await context.newPage()
      const themed = new URL(url)
      if (theme) themed.searchParams.set('theme', theme)
      await open(page, themed.href, OUTLINE_GRACES)
      return await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    } finally {
      await context.close()
    }
  }

  return async ({ url }) => {
    const b = await launched()
    const context = await b.newContext({ viewport: { width: 1440, height: 900 } })
    let read
    try {
      await boundOtherOrigins(context, url)
      const page = await context.newPage()
      await open(page, url, OUTLINE_GRACES)
      await page.waitForTimeout(600)
      read = await page.evaluate(
        ({ maxLinks, maxText }) => {
          const origin = location.origin
          const seen = new Set()
          const links = []
          // ⚠ TOP-LEVEL ITEMS ONLY. Measured 17/09 on ja-kinetic: `header a, nav a` returns 26
          // links — every dropdown child, the logo, and a tagline that happens to be a link. A
          // card lists the handful of pages its preview dialog shows, not a site map. The same
          // page's top-level items are 12, and ja-voyara's are 16.
          // ⚠ AND JOOMLART'S MEGAMENUS PUT A <div> BETWEEN THE <nav> AND ITS LIST. T3 renders
          // `nav#t3-mainnav > div.t3-navbar > div.t3-megamenu > ul.level0`, so none of the three
          // shapes above matched and the outline answered Home alone — measured 22/09 on JA Mood,
          // whose card came out with one layout however often Generate was pressed. T4 does the same
          // (`div.t4-megamenu > ul.level0`) and was only rescued by its off-canvas copy. `level0` is
          // the megamenu's own name for its top row, so dropdown children stay out.
          const sel = [
            'header nav > ul > li > a[href]',
            'nav > ul > li > a[href]',
            'header > ul > li > a[href]',
            '.t3-megamenu ul.level0 > li > a[href]',
            '.t4-megamenu ul.level0 > li > a[href]',
            'nav ul.navbar-nav > li > a[href]'
          ].join(', ')
          for (const a of document.querySelectorAll(sel)) {
            if (links.length >= maxLinks) break
            let href
            try {
              href = new URL(a.getAttribute('href') ?? '', location.href)
            } catch {
              continue
            }
            if (href.origin !== origin) continue
            // Joomla without SEF serves `/index.php/<path>`; the prefix is how the page is
            // ADDRESSED, not what it is, and two links to the same page must not become two
            // layouts. `/index.php` and `/` are the same page (measured on ja-kinetic).
            // ⚠ THE QUERY IS PART OF THE PAGE HERE. A Joomla with SEF off addresses every page as
            // `/index.php?option=com_content&id=7` — same pathname, different page — so dropping
            // the query would collapse a whole menu into one layout and the card would show the
            // home page six times. Kept, and the `/index.php` prefix still stripped because that is
            // how the page is ADDRESSED, not what it is.
            let path = href.pathname.replace(/^\/index\.php(?=\/|$)/, '') || '/'
            path = (path.replace(/\/+$/, '') || '/') + (href.search ?? '')
            if (seen.has(path)) continue
            // 🔒 AND THE ADDRESS IT ACTUALLY ANSWERS AT, kept beside the identity above.
            //
            // The strip is right for deciding WHICH PAGE this is; it is wrong as an address, and
            // the same value used to be both. A Joomla demo with SEF on and rewriting off (every
            // demo Tracy provisions: `sef = true`, `sef_rewrite = false`) serves ONLY
            // `/index.php/our-services` — `/our-services` is Apache's 404. Measured 17/09 on
            // ja_vital locally and ja-kidscorner on dev: three of four layouts photographed the
            // "Not Found" page, and the preview dialog showed it to a customer. Home survived
            // because it is the one case the strip gets right: `/index.php` and `/` are both served.
            //
            // Carried only when it DIFFERS, so a site whose pretty paths are real (rewriting on,
            // WordPress, EmDash) writes nothing extra and reads exactly as it did before.
            const raw = (href.pathname.replace(/\/+$/, '') || '/') + (href.search ?? '')
            // HOW MANY PAGES THIS ENTRY STANDS FOR, counted from its own dropdown. The card shows
            // it as "one of N", so it must be pages a visitor can actually reach under this
            // entry — not a guess at how many the template ships. Counted here because the menu
            // is the only place that knows: `li > ul a[href]` is the dropdown, same-origin only,
            // deduplicated by path, and the parent's own page counted with them when it has one.
            const item = a.closest('li')
            const under = new Set()
            for (const child of item ? item.querySelectorAll('a[href]') : []) {
              let to
              try {
                to = new URL(child.getAttribute('href') ?? '', location.href)
              } catch {
                continue
              }
              if (to.origin !== origin) continue
              const at = (to.pathname.replace(/^\/index\.php(?=\/|$)/, '') || '/').replace(/\/+$/, '') || '/'
              under.add(at + (to.search ?? ''))
            }
            let label = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
            if (label === '' || label.length > 40) continue
            // A logo's link is the home page whatever its text says — ja-kinetic's reads
            // "Kinetic observability, reimagined", which is a tagline, not a layout name.
            if (path === '/') label = 'Home'
            seen.add(path)
            // One page under an entry is just the entry; saying "one of 1" on the card would be
            // noise, so it is left off rather than written as 1.
            links.push({
              label,
              path,
              ...(raw === path ? {} : { address: raw }),
              ...(under.size > 1 ? { count: under.size } : {})
            })
          }
          // The home page is the card's first picture and its thumbnail. A template whose logo sits
          // outside the nav list (ja-kinetic) would otherwise produce a card with no home shot.
          if (!seen.has('/')) links.unshift({ label: 'Home', path: '/' })
          const meta = document.querySelector('meta[name="description"]')
          return {
            title: (document.title ?? '').trim().slice(0, 200),
            description: (meta?.getAttribute('content') ?? '').trim().slice(0, 400),
            links,
            // Enough prose for a sentence to be written about the site, and not a page dump.
            text: (document.body.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, maxText)
          }
        },
        { maxLinks: OUTLINE_MAX_LINKS, maxText: OUTLINE_MAX_TEXT }
      )
    } finally {
      await context.close()
    }

    let dark = false
    let defaultTheme = 'light'
    try {
      const [light, night, opening] = await Promise.all([
        backgroundUnder(b, url, 'light'),
        backgroundUnder(b, url, 'dark'),
        backgroundUnder(b, url, null)
      ])
      dark = light !== night
      // The side the demo opens on when nobody asks (JA Boxing opens dark): the preview starts there,
      // so a dark-first template is not flipped to light the moment its popup opens. Only meaningful
      // when there are two sides; a single-mode demo is 'light' as before.
      if (dark && opening === night) defaultTheme = 'dark'
    } catch {
      // A site that will not load three times is a site with no measured dark mode, not a failed read:
      // the rest of the outline is still worth having.
      dark = false
      defaultTheme = 'light'
    }
    return { ...read, dark, defaultTheme }
  }
}
