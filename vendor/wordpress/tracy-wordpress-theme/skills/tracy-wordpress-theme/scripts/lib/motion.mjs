// motion.mjs — what moves on a page, and how to hold it still while it is measured.
//
// WHY. Templates such as JA Vega (26/09) animate most of the page: the home page carries 53
// scroll-in elements (AOS, `data-aos` with per-element delays) and three Owl carousels (3, 6 and 4
// slides, autoplay off), and /about-us two infinite keyframe loops. Two things follow for a port
// and its review:
//   1. A screenshot or a computed-style read taken while that runs is a different page each time —
//      an AOS element is `opacity: 0` until it is scrolled to, a carousel on a timer shows another
//      slide seconds later. `FREEZE_CSS` + `freezeMotion()` put every such thing in a FIXED state
//      (revealed, first slide, finite animations finished, loops held `LOOP_HOLD_MS` into their run)
//      so two runs of the same page read the same.
//      Measured on JA Vega: two full-page shots of / and /about-us, 0 px apart frozen, 2.5 % and
//      6.3 % of pixels apart live.
//   2. Motion is part of the design. `measureMotionInPage()` lists it — scroll-in reveals,
//      carousels, infinite animations — each tied to the nearest heading so the port can be
//      compared with its source (`scripts/visual/motion.mjs`).
// Frozen is for MEASURING, never for shipping: nothing here is written into a theme.

/**
 * The Tracy motion library (TracyHQ/tch `packages/cms/tracy-cms-motion`, runtime v1 + v2) as the measure
 * reads it: plain data, handed to `measureMotionInPage` in the page. Effect names are AOS's, which
 * is what the library itself names its directions after, so a Tracy reveal and the AOS reveal it
 * ports compare equal (`fade-left` moves TOWARDS the left in both).
 * - `slots`: an effect id in `window.TracyMotion.effects[]` → the slot the runtime plays it in
 *   (the library's catalog.mjs). An effect plays only when the config lists it and `html` still
 *   carries `root` — the runtime takes the marker off when it declines (no config, reduced motion).
 * - `reveal`: `tracy-motion-reveal` elements, one entrance each. `--fade-left`, `--fade-right`,
 *   `--flip-up` change the keyframes; no modifier, or one the library does not style, plays its
 *   default rise (AOS `fade-up`). The delay is whatever `--tracy-motion-delay` computes to on the
 *   element, which is what the animation reads (`var(--tracy-motion-delay, 0ms)`): the library's
 *   rungs `tracy-motion-delay-1` … `-8` set it to 100 … 800 ms, and a theme sets it with its own
 *   rules too — JA Vega's WordPress port staggers its stat items 100 … 500 ms without a delay
 *   class (measured 26/09). The runtime drops `tracy-motion-in` and
 *   `tracy-motion-bold` once an element has played, so the duration comes from the config's
 *   intensity (reveal.css: 700 ms, `bold` 1500 ms), not from classes still on the element.
 * - `sections`: runtime v1, `hero-stagger` on the first outermost `<section>` of `<main>` and
 *   `fade-up` on the others. The runtime animates the section's content units (headings,
 *   paragraphs, images, button-like links, runs of three or more identical siblings), each
 *   `min(i, unitRungs - 1) × step` late, and removes every class it added once they end — so the
 *   units are found again from the structure. A section holding element reveals belongs to them.
 */
export const TRACY_MOTION = {
  root: 'tracy-motion',
  slots: { 'hero-stagger': 'hero-entrance', 'fade-up': 'section-reveal', reveal: 'element-reveal', 'carousel-step': 'carousel', pulse: 'loop' },
  reveal: {
    className: 'tracy-motion-reveal',
    effects: { 'fade-left': 'fade-left', 'fade-right': 'fade-right', 'flip-up': 'flip-up' },
    defaultEffect: 'fade-up',
    delayProperty: '--tracy-motion-delay',
    durationMs: { subtle: 700, bold: 1500 }
  },
  sections: {
    'hero-stagger': { effect: 'fade-up', durationMs: { subtle: 520, bold: 720 }, stepMs: { subtle: 90, bold: 150 } },
    'fade-up': { effect: 'fade-up', durationMs: { subtle: 460, bold: 640 }, stepMs: { subtle: 70, bold: 120 } }
  },
  unitRungs: 8
}

/**
 * Stylesheet that shows every scroll-in element and ends every CSS animation and transition at once.
 * A looping animation it would end too, at its base style — which hides content only a loop shows
 * (rotating words: `opacity: 0` each, one faded in at a time). `holdLoopsInPage` holds loops first
 * and marks their elements `data-tracy-motion-hold`, which the animation rules leave alone: Chromium
 * drops an animation's effect when CSS sets `animation-duration: 0s`, even one whose timing
 * `updateTiming` pinned (measured, Chromium 153).
 * A WOW / animate.css reveal is shown (`visibility`; `opacity` unless it is a held loop) but its animation is NOT reset:
 * `animation: none` would drop a finite animation's filled end state too, and one whose last
 * keyframe places the element (`transform`, `forwards`) went back to where it started — measured,
 * Chromium: 120 px along live once finished, 0 px frozen. With the duration at 0 s it ends at once,
 * where the live page ends it.
 * A Tracy reveal waits at `opacity: 0` under `html.tracy-motion` until it is scrolled to, and so does
 * an outermost `<section>` of `<main>` until the runtime marks it done: both are shown; one already
 * playing ends with the rest.
 */
export const FREEZE_CSS = [
  '[data-aos],[data-aos].aos-init{opacity:1!important;transform:none!important;transition:none!important}',
  'html.tracy-motion main section,html.tracy-motion .tracy-motion-reveal{opacity:1!important}',
  '.wow,.animate__animated{visibility:visible!important}',
  '.wow:not([data-tracy-motion-hold]),.animate__animated:not([data-tracy-motion-hold]){opacity:1!important}',
  ':not([data-tracy-motion-hold]),:not([data-tracy-motion-hold])::before,:not([data-tracy-motion-hold])::after{animation-delay:0s!important;animation-duration:0s!important;animation-iteration-count:1!important}',
  '*,*::before,*::after{transition-delay:0s!important;transition-duration:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}'
].join('')

/** Where a looping animation is held: this far into its run, as the live page shows it then. */
export const LOOP_HOLD_MS = 1000

/**
 * Runs in the page, BEFORE `FREEZE_CSS`: pause every infinite animation `at` ms into its run and
 * mark its element so the freeze stylesheet leaves its animations alone (a finite animation on the
 * same element is finished by `finishHeldInPage` instead). Ending a loop drops it to its base style:
 * measured in Chromium, three rotating words (each `opacity: 0`, 9 s loop, delays 0/3/6 s) all read
 * `opacity: 0` ended, one of them 1 live at any time. Loops of one group started together stay in
 * step, as they are live. Returns how many were held.
 */
function holdLoopsInPage(at) {
  let held = 0
  for (const a of document.getAnimations()) {
    const effect = a.effect
    if (!effect?.getTiming || effect.getComputedTiming().iterations !== Infinity) continue
    a.pause()
    a.currentTime = at
    a.id = 'tracy-motion-hold'
    effect.target?.setAttribute?.('data-tracy-motion-hold', '')
    held++
  }
  return held
}

/** Runs in the page, AFTER `FREEZE_CSS`: finish the finite animations of the elements the stylesheet skipped. */
function finishHeldInPage() {
  for (const a of document.getAnimations()) {
    if (a.id === 'tracy-motion-hold' || !a.effect?.target?.matches?.('[data-tracy-motion-hold]')) continue
    if (a.effect.getComputedTiming().iterations !== Infinity) a.finish()
  }
}

/**
 * Runs in the page, AFTER `FREEZE_CSS`: end the entrances of Tracy's v1 runtime. It sets each unit's
 * delay with `updateTiming`, and a delay set that way no longer follows CSS — measured, Chromium:
 * after the stylesheet the hero units kept their 90 / 180 ms delays and stayed `running`, so the
 * runtime's clean-up (classes taken off every unit and the section) would land in the middle of
 * a measurement instead of before it.
 */
function finishTracyUnitsInPage() {
  for (const a of document.getAnimations())
    if (a.effect?.target?.classList?.contains('tracy-motion-unit') && a.effect.getComputedTiming().iterations !== Infinity) a.finish()
}

/**
 * Runs in the page: stop the carousels a template drives by timer and put them on their first
 * slide. Owl and Slick (through the jQuery instance they are registered on), Swiper (`el.swiper`,
 * which Swiper sets) and Splide (only when the page keeps the instance on `el.splide` — Splide 3/4
 * do not) are handled, and Tracy's own (`.tracy-motion-carousel`, below). A carousel no library
 * API reaches — a hand-written one, Owl markup without an Owl instance, a Splide instance the page
 * does not expose — cannot be stopped from outside: it is COUNTED in `unhandled`, not assumed
 * still, and a reader of the run sees that its pictures may differ between runs.
 */
async function stopCarouselsInPage() {
  const out = { owl: 0, swiper: 0, splide: 0, slick: 0, tracy: 0, unhandled: 0 }
  const handled = []
  const $ = window.jQuery
  // `fn` stops the carousel and returns a check: is it on its first slide? Asked once the libraries
  // had a moment to move (Swiper 11 in loop mode reaches the slide a frame later). One that did not
  // get there — a slide change the library would not interrupt — is not counted stopped.
  const pending = []
  const tryStop = (kind, el, fn) => {
    try {
      pending.push({ kind, el, landed: fn() })
    } catch {}
  }
  if ($) {
    // `trigger` never throws: an element with Owl's classes but no Owl instance (another jQuery,
    // markup copied from a template) would be counted stopped while it still moves.
    for (const el of document.querySelectorAll('.owl-carousel.owl-loaded'))
      if ($(el).data('owl.carousel'))
        tryStop('owl', el, () => {
          const owl = $(el).data('owl.carousel')
          $(el).trigger('stop.owl.autoplay').trigger('to.owl.carousel', [0, 0, true])
          return () => owl.relative(owl.current()) === 0
        })
    // Slick ignores slickGoTo while a slide change is animating (`waitForAnimate`, on by default):
    // measured on Slick 1.8.1, a freeze during a change left slide 3 showing.
    for (const el of document.querySelectorAll('.slick-initialized'))
      tryStop('slick', el, () => {
        $(el).slick('slickPause').slick('slickSetOption', 'waitForAnimate', false).slick('slickGoTo', 0, true)
        return () => $(el).slick('slickCurrentSlide') === 0
      })
  }
  for (const el of document.querySelectorAll('.swiper, .swiper-container')) {
    const s = el.swiper
    if (s)
      tryStop('swiper', el, () => {
        s.autoplay?.stop()
        // In loop mode Swiper ≤ 8 puts a duplicate of the LAST slide at index 0; slideToLoop takes
        // the real first slide (measured: Swiper 8.4.7 loop showed slide 4 after slideTo(0)).
        if (s.params?.loop && s.slideToLoop) s.slideToLoop(0, 0, false)
        else s.slideTo(0, 0, false)
        return () => s.realIndex === 0
      })
  }
  for (const el of document.querySelectorAll('.splide')) {
    const s = el.splide
    if (s)
      tryStop('splide', el, () => {
        s.Components?.Autoplay?.pause()
        s.go(0)
        return () => s.index === 0
      })
  }
  // Tracy's carousel runs no timer and keeps no instance: it moves when asked (its controls, the
  // arrow keys, a swipe), with a Web Animations transform on its track. It is walked back to its
  // first slide through its own ArrowLeft handler, so the runtime's index agrees with what is
  // shown, and the track's step is then ended where it lands. The runtime marks every slide out of
  // view `aria-hidden`; the first shown one is where it stands.
  for (const el of document.querySelectorAll('.tracy-motion-carousel.tracy-motion-carousel-step')) {
    const track = el.querySelector(':scope > .tracy-motion-track') || el.firstElementChild
    if (!track) continue
    tryStop('tracy', el, () => {
      const first = () => [...track.children].findIndex((s) => s.getAttribute('aria-hidden') !== 'true')
      for (let n = first(); n > 0; n--) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
      const steps = () => track.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition))
      for (const a of steps()) a.finish()
      return () => {
        const t = getComputedStyle(track).transform
        return first() === 0 && steps().every((a) => a.playState === 'finished') && (t === 'none' || new DOMMatrixReadOnly(t).m41 === 0)
      }
    })
  }
  await new Promise((r) => setTimeout(r, 100))
  for (const { kind, el, landed } of pending) {
    try {
      if (!landed()) continue
    } catch {
      continue
    }
    out[kind]++
    handled.push(el)
  }
  // A generic carousel is an element with a class NAMED carousel (`carousel`, `team-carousel`), not
  // one of its parts (`carousel-item`, `carousel__track`). Owl markup Owl never initialised is
  // still, and so is a Tracy carousel its runtime did not take over (no `carousel-step`): a row.
  const named = (el) => [...el.classList].some((c) => /(^|[-_])carousel$/i.test(c))
  const candidates = [...document.querySelectorAll('.owl-carousel, .slick-slider, .swiper, .swiper-container, .splide, [class*="carousel"]')].filter((el) => el.matches('.slick-slider, .swiper, .swiper-container, .splide') || (named(el) && !el.matches('.owl-carousel:not(.owl-loaded), .tracy-motion-carousel:not(.tracy-motion-carousel-step)')))
  const roots = candidates.filter((el) => !candidates.some((o) => o !== el && o.contains(el)))
  out.unhandled = roots.filter((el) => !handled.some((h) => h === el || el.contains(h) || h.contains(el))).length
  return out
}

/**
 * Hold a loaded page still for measuring: pin loops, freeze CSS and stop carousels. Returns what was
 * held (`{loops, owl, swiper, splide, slick, tracy, unhandled}`), or `{error}` when any step failed — a
 * stylesheet that did not apply (a page's CSP) leaves the page moving and must not read as frozen.
 */
export async function freezeMotion(page) {
  try {
    const loops = await page.evaluate(holdLoopsInPage, LOOP_HOLD_MS)
    await page.addStyleTag({ content: FREEZE_CSS })
    if (loops) await page.evaluate(finishHeldInPage)
    await page.evaluate(finishTracyUnitsInPage)
    return { loops, ...(await page.evaluate(stopCarouselsInPage)) }
  } catch (e) {
    return { error: String(e?.message ?? e).split('\n')[0] }
  }
}

/**
 * Runs in the page (BEFORE freezing): the motion it carries. `tracy` is `TRACY_MOTION` — call it
 * through `measureMotion(page)`, which hands it over.
 * - reveals: scroll-in elements (AOS `data-aos`, WOW / animate.css classes, Tracy reveals and v1
 *   section units) — effect, delay, duration; in document order
 * - carousels: Owl / Swiper / Splide / Slick / Tracy / generic `[class*=carousel]` — slides, autoplay, nav, dots
 * - loops: CSS animations that repeat forever (`document.getAnimations()`) on an element that is
 *   rendered — a spinner kept `visibility: hidden` until a form is sent loops unseen
 * Each item carries `near`: the nearest heading before it in document order (lower-cased words),
 * which is how source and site are paired.
 */
export function measureMotionInPage(tracy) {
  if (!tracy?.reveal) throw new Error('measureMotionInPage needs TRACY_MOTION: call measureMotion(page)')
  const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80)
  const headings = [...document.querySelectorAll('h1,h2,h3')].filter((h) => !h.closest('header, footer, nav'))
  const near = (el) => {
    let best = null
    for (const h of headings) {
      if (h === el || h.contains(el) || el.contains(h)) return clean(h.textContent)
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h
    }
    return best ? clean(best.textContent) : '(top)'
  }
  const inChrome = (el) => Boolean(el.closest('header, footer, nav, .t4-header, .t4-footer, .tracy-header, .tracy-footer'))
  const shown = (el) => {
    if (!el || !el.getClientRects().length) return false
    const cs = getComputedStyle(el)
    return cs.visibility !== 'hidden' && cs.display !== 'none'
  }
  // Drawn at all: a box with an area, not `display: none` / `visibility: hidden` itself or through
  // an ancestor. Opacity does not count — a loop that fades its own element in is how it shows.
  const rendered = (el) => {
    const box = el.getBoundingClientRect()
    if (!el.getClientRects().length || !(box.width > 0 && box.height > 0)) return false
    if (el.checkVisibility) return el.checkVisibility({ visibilityProperty: true })
    return getComputedStyle(el).visibility !== 'hidden'
  }
  // "1.2s" / "800ms" / "800" → ms
  const ms = (v) => {
    const m = /^\s*([\d.]+)\s*(ms|s)?\s*$/i.exec(String(v ?? ''))
    if (!m) return null
    return Math.round(Number(m[1]) * (m[2]?.toLowerCase() === 's' ? 1000 : 1))
  }
  const found = []
  // AOS 2 writes its init() options onto <body> (`data-aos-duration="1500"`): an element without
  // its own attribute runs with those.
  const aosDefault = (name) => document.body?.getAttribute(name) ?? null
  for (const el of document.querySelectorAll('[data-aos], .wow, .animate__animated')) {
    if (inChrome(el)) continue
    const aos = el.hasAttribute('data-aos')
    const effect = el.getAttribute('data-aos') || [...el.classList].find((c) => /^animate__(?!animated)/.test(c))?.replace('animate__', '') || [...el.classList].find((c) => c !== 'wow' && /^[a-z]+[A-Z]/.test(c)) || 'reveal'
    found.push({
      el,
      near: near(el),
      effect,
      delay: (aos ? ms(el.getAttribute('data-aos-delay') ?? aosDefault('data-aos-delay')) : ms(el.getAttribute('data-wow-delay'))) || 0,
      duration: (aos ? ms(el.getAttribute('data-aos-duration') ?? aosDefault('data-aos-duration')) : ms(el.getAttribute('data-wow-duration'))) || null,
      tag: el.tagName.toLowerCase()
    })
  }
  // Tracy (see TRACY_MOTION): what plays is what the config switches on while `html` keeps the marker.
  const config = window.TracyMotion
  const marker = document.documentElement.classList.contains(tracy.root)
  const entry = (slot) => (marker && Array.isArray(config?.effects) ? config.effects.find((e) => e && typeof e.id === 'string' && tracy.slots[e.id] === slot) : null) || null
  const intensity = (e) => (e?.intensity === 'bold' ? 'bold' : 'subtle')
  const R = tracy.reveal
  const revealEntry = entry('element-reveal')
  // Narrower than `minWidth` the runtime shows every reveal at once, as AOS's `disable` does.
  const revealPlays = revealEntry && (typeof revealEntry.minWidth !== 'number' || matchMedia(`(min-width: ${revealEntry.minWidth}px)`).matches)
  if (revealPlays)
    for (const el of document.querySelectorAll(`main .${R.className}`)) {
      if (inChrome(el)) continue
      const modifier = [...el.classList].map((c) => (c.startsWith(`${R.className}--`) ? c.slice(R.className.length + 2) : null)).find((m) => m && R.effects[m])
      found.push({
        el,
        near: near(el),
        effect: R.effects[modifier] ?? R.defaultEffect,
        delay: ms(getComputedStyle(el).getPropertyValue(R.delayProperty)) || 0,
        duration: R.durationMs[intensity(revealEntry)],
        tag: el.tagName.toLowerCase()
      })
    }
  const heroEntry = entry('hero-entrance')
  const sectionEntry = entry('section-reveal')
  const main = document.querySelector('main')
  if (main && (heroEntry || sectionEntry)) {
    // The runtime's unit walker (runtime.mjs `collect`), read off the structure it leaves behind.
    const buttonLike = (el) => el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && el.getAttribute('type') === 'submit') || el.getAttribute('role') === 'button' || (el.tagName === 'A' && /btn|button/i.test(el.getAttribute('class') || ''))
    const sig = (el) => `${el.tagName}|${el.getAttribute('class') || ''}`
    const collect = (level, units) => {
      const kids = [...level.children]
      if (kids.length >= 3 && kids.every((k) => sig(k) === sig(kids[0]))) return units.push(...kids)
      for (const kid of kids) {
        if (kid.matches('h1, h2, h3, h4, h5, h6, p, img, picture, figure') || buttonLike(kid)) units.push(kid)
        else collect(kid, units)
      }
    }
    const sections = [...main.querySelectorAll('section')].filter((s) => {
      const enclosing = s.parentElement?.closest('section')
      return !(enclosing && main.contains(enclosing))
    })
    sections.forEach((section, i) => {
      if (revealEntry && section.getElementsByClassName(R.className).length) return
      const e = i === 0 ? heroEntry : sectionEntry
      const timing = e && tracy.sections[e.id]
      if (!timing) return
      const units = []
      collect(section, units)
      units.forEach((el, j) => {
        if (!inChrome(el))
          found.push({ el, near: near(el), effect: timing.effect, delay: Math.min(j, tracy.unitRungs - 1) * timing.stepMs[intensity(e)], duration: timing.durationMs[intensity(e)], tag: el.tagName.toLowerCase() })
      })
    })
  }
  const order = (a, b) => (a.el === b.el ? 0 : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
  const reveals = found.sort(order).map(({ el, ...r }) => r)
  // An options attribute says autoplay only when it sets it to something on: `"autoplay": false`
  // (Owl's data-owl-options, Swiper's data-swiper, Splide's data-splide) is a carousel that stands still.
  const optionAutoplay = (text) => {
    if (!text) return null
    try {
      const o = JSON.parse(text)
      if (o && typeof o === 'object' && 'autoplay' in o) return Boolean(o.autoplay) && o.autoplay !== 'false' && o.autoplay?.enabled !== false
    } catch {}
    const m = /["']?autoplay["']?\s*:\s*(true|false|\{|[\d.]+|["'][^"']*["'])/i.exec(text)
    if (!m) return null
    return m[1] === '{' || m[1] === 'true' || (/^[\d.]+$/.test(m[1]) && Number(m[1]) > 0) || /^["'](true|\d*[1-9])/.test(m[1])
  }
  const libAutoplay = (el) => {
    const $ = window.jQuery
    if (el.swiper) return Boolean(el.swiper.autoplay?.running || el.swiper.params?.autoplay?.enabled || el.swiper.params?.autoplay === true)
    if (el.splide) return Boolean(el.splide.options?.autoplay)
    if ($) {
      const owl = $(el).data('owl.carousel')
      if (owl) return Boolean(owl.settings?.autoplay)
      if (el.classList.contains('slick-initialized')) {
        try {
          return Boolean($(el).slick('slickGetOption', 'autoplay'))
        } catch {}
      }
    }
    return null
  }
  const carousels = []
  const seen = []
  const outermost = (el, sel) => [...el.querySelectorAll(sel)].filter((s) => !s.parentElement.closest(sel) || !el.contains(s.parentElement.closest(sel)))
  const named = (el) => [...el.classList].some((c) => /(^|[-_])carousel$/i.test(c))
  const LIBRARIES = '.owl-carousel, .swiper, .swiper-container, .splide, .slick-slider'
  const trackOf = (el) => el.querySelector(':scope > .tracy-motion-track') || el.firstElementChild
  const kinds = [
    // Before generic: `tracy-motion-carousel` is a name that ends in carousel.
    ['tracy', '.tracy-motion-carousel', (el) => trackOf(el)?.children.length ?? 0],
    ['owl', '.owl-carousel', (el) => el.querySelectorAll('.owl-item:not(.cloned)').length || [...el.children].filter((c) => !c.matches('.owl-nav, .owl-dots')).length],
    ['swiper', '.swiper, .swiper-container', (el) => el.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate)').length],
    ['splide', '.splide', (el) => el.querySelectorAll('.splide__slide:not(.splide__slide--clone)').length],
    ['slick', '.slick-slider', (el) => el.querySelectorAll('.slick-slide:not(.slick-cloned)').length],
    ['generic', '[class*="carousel"]', (el) => outermost(el, '.carousel-item, [class*="slide"]:not([class*="slides"]):not([class*="slider"])').filter((s) => !/clone/.test(s.className)).length]
  ]
  for (const [kind, sel, slides] of kinds)
    for (const el of document.querySelectorAll(sel)) {
      if (kind === 'generic' && !named(el)) continue
      if (seen.some((s) => s === el || s.contains(el) || el.contains(s)) || inChrome(el)) continue
      seen.push(el)
      if (kind === 'tracy') {
        // Taken over by the runtime (`carousel-step`), or a row the visitor scrolls, which is not motion.
        if (!el.classList.contains('tracy-motion-carousel-step')) continue
        // The runtime binds `.tracy-motion-prev` / `-next` inside the carousel's <section> (or its
        // parent), and draws its own inside the carousel for `--nav`; it draws dots for `--dots`.
        // It has no timer: it moves only when asked.
        const up = el.closest('section') || el.parentElement
        const scope = !up || up.matches('body, html') ? el : up
        carousels.push({
          near: near(el),
          kind,
          slides: slides(el),
          autoplay: false,
          nav: [...scope.querySelectorAll('.tracy-motion-prev, .tracy-motion-next')].some(shown),
          dots: [...el.querySelectorAll(':scope > .tracy-motion-dots')].some((d) => shown(d) && d.querySelector('button'))
        })
        continue
      }
      const attr = el.getAttribute('data-autoplay')
      const fromAttr = attr === null ? null : attr === '' || attr === 'true' || Number(attr) > 0
      const fromOptions = optionAutoplay(el.getAttribute('data-owl-options') || el.getAttribute('data-swiper') || el.getAttribute('data-splide') || el.getAttribute('data-slick') || el.getAttribute('data-options'))
      const autoplay = libAutoplay(el) ?? fromOptions ?? fromAttr ?? false
      // Controls count when they are drawn: Owl keeps `.owl-nav.disabled` in the DOM with
      // display:none, and JA Vega's team carousel draws its own arrows two levels up, outside the
      // carousel element (`.cw-owl-nav`). So: drawn controls inside, then within the nearest three
      // ancestors that hold no other carousel — never `main`, `body` or `html`. Every selector is
      // anchored at `:scope`, so an ancestor OUTSIDE the scope cannot complete it: unanchored,
      // `[class*="-nav"] button` matched any button once <body> carried `tracy-nav-top-left`.
      let scope = el
      for (let d = 0; d < 3 && scope.parentElement && !scope.parentElement.matches('main, body, html'); d++) {
        const up = scope.parentElement
        if ([...up.querySelectorAll(`${LIBRARIES}, [class*="carousel"]`)].some((o) => (o.matches(LIBRARIES) || named(o)) && o !== el && !el.contains(o) && !o.contains(el))) break
        scope = up
      }
      const ctl = (list) => [...scope.querySelectorAll(list.map((s) => `:scope ${s}`).join(', '))].some((c) => shown(c) && !inChrome(c))
      carousels.push({
        near: near(el),
        kind,
        slides: slides(el),
        autoplay,
        nav: ctl(['.owl-nav:not(.disabled) button', '.swiper-button-next', '.splide__arrows', '.slick-arrow', '[class*="__nav"] button', '[class*="-nav"] button', '[class*="-prev"]', '[class*="-next"]', '[class*="__prev"]', '[class*="__next"]', '.carousel-control-next']),
        dots: ctl(['.owl-dots:not(.disabled)', '.swiper-pagination', '.splide__pagination', '.slick-dots', '[class*="dots"]', '.carousel-indicators'])
      })
    }
  const loops = []
  for (const a of document.getAnimations()) {
    const t = a.effect?.target
    if (!t || !(t instanceof Element) || inChrome(t) || !rendered(t)) continue
    const timing = a.effect.getComputedTiming?.() ?? {}
    if (timing.iterations !== Infinity) continue
    loops.push({ near: near(t), name: a.animationName || a.transitionProperty || 'animation', tag: t.tagName.toLowerCase() })
  }
  return { reveals, carousels, loops }
}

/** Measure the motion of a loaded page (`measureMotionInPage` with the Tracy vocabulary). */
export function measureMotion(page) {
  return page.evaluate(measureMotionInPage, TRACY_MOTION)
}

/** Pure: compare two inventories. Grouped by `near`; a kind present on one side only is a delta. */
export function compareMotion(source, site) {
  const group = (list) => {
    const m = new Map()
    for (const x of list) m.set(x.near, [...(m.get(x.near) ?? []), x])
    return m
  }
  const rows = []
  const cmpKind = (kind, a, b, describe) => {
    const A = group(a)
    const B = group(b)
    for (const key of new Set([...A.keys(), ...B.keys()])) {
      const da = describe(A.get(key) ?? [])
      const db = describe(B.get(key) ?? [])
      if (da !== db) rows.push({ near: key, kind, source: da, site: db })
    }
  }
  // Each reveal of a group in document order, not a range: a stagger 0/100/200 ms ported as
  // 0/150/200 ms has the same min and max and is still a different entrance.
  const seq = (xs, unit = '') => {
    const v = xs.map((x) => (x == null ? 'default' : x))
    return `${new Set(v).size === 1 ? v[0] : v.join('/')}${unit}`
  }
  // The library is not described: an Owl carousel ported to Swiper with the same behaviour is equal.
  const revealWords = (xs) => {
    if (!xs.length) return 'none'
    const delays = xs.map((x) => x.delay || 0)
    const durations = xs.map((x) => x.duration ?? null)
    return [`${xs.length} × ${seq(xs.map((x) => x.effect))}`, delays.some(Boolean) ? `delay ${seq(delays, ' ms')}` : null, durations.some((d) => d != null) ? `duration ${seq(durations, ' ms')}` : null].filter(Boolean).join(', ')
  }
  const carouselWords = (xs) => (xs.length ? xs.map((x) => `${x.slides} slides${x.autoplay ? ' autoplay' : ''}${x.nav ? ' nav' : ''}${x.dots ? ' dots' : ''}`).sort().join('; ') : 'none')
  const loopWords = (xs) => (xs.length ? `${xs.length} looping` : 'none')
  cmpKind('reveal', source.reveals, site.reveals, revealWords)
  cmpKind('carousel', source.carousels, site.carousels, carouselWords)
  cmpKind('loop', source.loops, site.loops, loopWords)
  const totals = (x) => ({ reveals: x.reveals.length, carousels: x.carousels.length, autoplay: x.carousels.filter((c) => c.autoplay).length, loops: x.loops.length })
  return { source: totals(source), site: totals(site), rows }
}
