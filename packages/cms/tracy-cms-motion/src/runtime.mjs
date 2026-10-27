/*
 * The motion library runtime, as it reaches a customer's browser.
 *
 * It reads one global for its settings and one CSS variable of its own for the step between units,
 * validates nothing but `id` (and `minWidth` for element-reveal, `labels` for the carousel), never
 * reads `v`, and ignores an id it does not know without a word. Off the page it reads only the
 * structure it animates and, since version 2, the opt-in classes a block's author sets
 * (`tracy-motion-reveal`, `tracy-motion-carousel`, `tracy-motion-pulse`). It imports nothing at run time,
 * fetches nothing, and touches neither localStorage, sessionStorage nor cookies — an inlined copy
 * on an opaque origin would throw on the first of those.
 *
 * Reduced motion is a hard off for the whole library: the root marker comes off and the runtime
 * stops, which is also how it leaves the page clean.
 */

/* global __TRACY_MOTION_EFFECTS__ */

/** Effect id → slot id, for the effects this build carries. Injected by scripts/build.mjs. */
const EFFECT_SLOTS = __TRACY_MOTION_EFFECTS__

const ROOT_MARKER = 'tracy-motion'
const PREFIX = 'tracy-motion-'
const DONE = 'tracy-motion-done'
const UNIT = 'tracy-motion-unit'
const BOLD = 'tracy-motion-bold'

/** Delay rungs. Everything past the last one shares it, so a long section settles instead of drifting. */
const RUNGS = 8

/** Elements the unit walker stops at when it meets one. */
const CONTENT = 'h1, h2, h3, h4, h5, h6, p, img, picture, figure'

function classOf(el) {
  return el.getAttribute('class') || ''
}

function isButtonLike(el) {
  if (el.tagName === 'BUTTON') return true
  if (el.tagName === 'INPUT' && el.getAttribute('type') === 'submit') return true
  if (el.getAttribute('role') === 'button') return true
  return el.tagName === 'A' && /btn|button/i.test(classOf(el))
}

function isUnit(el) {
  return el.matches(CONTENT) || isButtonLike(el)
}

/** Cards, plans and steps: three or more siblings built the same way. */
function identicalSiblings(kids) {
  if (kids.length < 3) return false
  const first = kids[0].tagName + '|' + classOf(kids[0])
  return kids.every((kid) => kid.tagName + '|' + classOf(kid) === first)
}

/**
 * What animates in sequence inside a section: the content itself, not the columns holding it. Each
 * branch is followed down until it reaches a heading, paragraph, image or button-like element, or a
 * group of identical siblings, and stops there. A real hero puts its copy in one column and its
 * image in another, so stopping at the first level with two children would animate the whole column
 * as one; following each branch to its content gives the sequence the section actually reads in.
 * @param {Element} level @param {Element[]} units
 */
function collect(level, units) {
  const kids = Array.from(level.children)
  if (kids.length === 0) return
  if (identicalSiblings(kids)) {
    for (const kid of kids) units.push(kid)
    return
  }
  for (const kid of kids) {
    if (isUnit(kid)) units.push(kid)
    else collect(kid, units)
  }
}

/** The units of a section, in document order. */
function unitsOf(scope) {
  const units = []
  collect(scope, units)
  return units
}

/**
 * The step between two units, in milliseconds, read off the library's own timing variable — the same
 * block of CSS that carries the duration, easing and rise, so an intensity stays in one place.
 * @param {Element} section
 */
function stepOf(section) {
  const raw = getComputedStyle(section).getPropertyValue('--tracy-motion-step').trim()
  const parsed = /^([0-9.]+)(ms|s)$/.exec(raw)
  if (!parsed) return 0
  return Number(parsed[1]) * (parsed[2] === 's' ? 1000 : 1)
}

/** Outermost `<section>`s inside `<main>`: a section nested in another section is not one. */
function outermostSections() {
  const main = document.querySelector('main')
  if (!main) return []
  return Array.from(main.querySelectorAll('section')).filter((section) => {
    const parent = section.parentElement
    const enclosing = parent && parent.closest('section')
    return !(enclosing && main.contains(enclosing))
  })
}

/** The one residual an entrance effect may leave: it keeps the base sheet from re-hiding the section. */
function markDone(section) {
  section.classList.add(DONE)
}

function clean(section, id, units) {
  markDone(section)
  section.classList.remove(PREFIX + id, BOLD)
  for (const unit of units) unit.classList.remove(UNIT)
}

function play(section, id, intensity) {
  const units = unitsOf(section)
  if (units.length === 0 || typeof Element.prototype.getAnimations !== 'function') {
    markDone(section)
    return
  }
  for (const unit of units) unit.classList.add(UNIT)
  if (intensity === 'bold') section.classList.add(BOLD)
  section.classList.add(PREFIX + id)

  // The units sit under different parents, so `:nth-child()` cannot order them: it counts siblings
  // only, and the two hero buttons would fire with the eyebrow. The delay goes on the animation
  // itself instead, which writes nothing onto the customer's markup — no attribute, no inline style.
  const keyframes = PREFIX + id
  const step = stepOf(section)
  const running = []
  for (let i = 0; i < units.length; i++) {
    const delay = Math.min(i, RUNGS - 1) * step
    for (const animation of units[i].getAnimations()) {
      if (animation.animationName === keyframes && animation.effect) {
        animation.effect.updateTiming({ delay })
        running.push(animation.finished)
      }
    }
  }
  if (running.length === 0) {
    clean(section, id, units)
    return
  }
  const done = () => {
    clean(section, id, units)
  }
  Promise.all(running).then(done, done)
}

/**
 * Scroll-into-view, once. The section plays the first time any part of it meets the viewport and
 * the observer is let go there and then, so nothing is left watching the page afterwards. A browser
 * without the observer plays at once rather than leaving the section hidden behind a trigger it can
 * never report; a demo cell that mounts already on screen reports on its first pass, which shows
 * the movement without acting the trigger out.
 * @param {Element} section @param {string} id @param {string} intensity
 */
function revealSection(section, id, intensity) {
  if (typeof IntersectionObserver !== 'function') {
    play(section, id, intensity)
    return
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer.disconnect()
    play(section, id, intensity)
  })
  observer.observe(section)
}

/* ── Version 2: opt-in by markup ─────────────────────────────────────────────────────────────── */

const REVEAL = 'tracy-motion-reveal'
const IN = 'tracy-motion-in'
const ON = 'tracy-motion-on'

/** Elements inside `<main>` carrying one of the opt-in classes. */
function marked(className) {
  const main = document.querySelector('main')
  return main ? Array.from(main.getElementsByClassName(className)) : []
}

/**
 * Element reveal. Each marked element plays once, the first time it meets the viewport; its
 * direction and delay are its own classes, read by the stylesheet. `minWidth` (px) is the one
 * option: narrower than that the elements are shown at once, as AOS's `disable` below a breakpoint
 * does. When the effect is off every marked element is shown straight away, so the hide in the
 * stylesheet can never outlive the runtime.
 * @param {{ intensity?: string, minWidth?: number } | null} entry
 */
function revealElements(entry) {
  const elements = marked(REVEAL)
  const show = (el) => {
    el.classList.remove(IN, BOLD)
    el.classList.add(DONE)
  }
  const wide =
    !entry ||
    typeof entry.minWidth !== 'number' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(min-width: ' + String(entry.minWidth) + 'px)').matches
  if (!entry || !wide || typeof IntersectionObserver !== 'function') {
    for (const el of elements) show(el)
    return
  }
  const observer = new IntersectionObserver((entries) => {
    for (const item of entries) {
      if (!item.isIntersecting) continue
      const el = item.target
      observer.unobserve(el)
      if (entry.intensity === 'bold') el.classList.add(BOLD)
      el.classList.add(IN)
      const running = typeof el.getAnimations === 'function' ? el.getAnimations().map((a) => a.finished) : []
      if (running.length === 0) show(el)
      else
        Promise.all(running).then(
          () => show(el),
          () => show(el)
        )
    }
  })
  for (const el of elements) observer.observe(el)
}

/** Pulse: the loop runs on each marked element once the effect is switched on. */
function pulse() {
  for (const el of marked('tracy-motion-pulse')) el.classList.add(ON)
}

/**
 * A button the carousel draws for itself when the markup has none: previous, next, or one dot.
 * Labels come from `TracyMotion.labels` when the site passes them (translated), else English.
 * @param {string} className @param {string} label
 */
function control(className, label) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('aria-label', label)
  return button
}

/**
 * One carousel. The first child of the marked element is the track (`.tracy-motion-track` when the
 * markup names one), the track's children are the slides. Slides are laid out by the theme; the
 * runtime reads where they are, and moves the track by the distance between the first slide and the
 * one asked for, so any number of slides to a view works without the runtime knowing it. It wraps
 * round at both ends and moves only when asked: previous / next (`.tracy-motion-prev`,
 * `.tracy-motion-next` inside the carousel's section, or buttons it draws when the carousel carries
 * `tracy-motion-carousel--nav`), dots (`tracy-motion-carousel--dots`), the arrow keys, a swipe.
 * @param {Element} root @param {{ labels?: Record<string, string> }} config @param {boolean} still
 */
function carousel(root, config, still) {
  const track = root.querySelector(':scope > .tracy-motion-track') || root.firstElementChild
  if (!track || typeof track.animate !== 'function') return
  const slides = Array.from(track.children)
  if (slides.length < 2) return
  // Each slide is marked as one, whatever drew it (a Query Loop's <li>, a group): the theme sizes
  // slides by this class, and a reader of the page can count them.
  for (const slide of slides) slide.classList.add('tracy-motion-slide')
  const labels = (config && config.labels) || {}
  const scope = root.closest('section') || root.parentElement || root
  // The effect class: the theme clips the row under it, and the stylesheet carries the timing.
  root.classList.add(PREFIX + 'carousel-step')
  const timing = getComputedStyle(root)
  const parsed = /^([0-9.]+)(ms|s)$/.exec(timing.getPropertyValue('--tracy-motion-dur').trim())
  const duration = parsed ? Number(parsed[1]) * (parsed[2] === 's' ? 1000 : 1) : 400
  const easing = timing.getPropertyValue('--tracy-motion-ease').trim() || 'ease'
  let index = 0
  let animation = null
  const offset = (i) => slides[i].offsetLeft - slides[0].offsetLeft
  const perView = () => {
    const step = offset(1) || slides[0].offsetWidth || 1
    return Math.max(1, Math.min(slides.length, Math.round(root.clientWidth / step)))
  }
  const last = () => slides.length - perView()
  const dots = []
  const paint = () => {
    const first = index
    const count = perView()
    slides.forEach((slide, i) => {
      if (i >= first && i < first + count) slide.removeAttribute('aria-hidden')
      else slide.setAttribute('aria-hidden', 'true')
    })
    dots.forEach((dot, i) => {
      if (i === index) dot.setAttribute('aria-current', 'true')
      else dot.removeAttribute('aria-current')
    })
  }
  const go = (to, animate) => {
    const end = last()
    index = to < 0 ? end : to > end ? 0 : to
    const target = 'translateX(' + String(-offset(index)) + 'px)'
    const from = animation ? getComputedStyle(track).transform : 'none'
    const next = track.animate(
      [{ transform: from === 'none' ? 'translateX(0px)' : from }, { transform: target }],
      {
        duration: animate && !still ? duration : 0,
        easing,
        fill: 'forwards'
      }
    )
    if (animation) animation.cancel()
    animation = next
    paint()
  }
  // A control drawn by the markup may be a link (a block's button is an <a href="#">): the click
  // steps the carousel and goes nowhere.
  const bind = (el, fn) =>
    el.addEventListener('click', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      fn()
    })
  // The markup's own previous / next controls are named for a screen reader when they are not.
  const name = (el, label) => {
    const target = el.querySelector('a, button') || el
    if (!target.getAttribute('aria-label')) target.setAttribute('aria-label', label)
  }
  let prev = Array.from(scope.querySelectorAll('.tracy-motion-prev'))
  let nextButtons = Array.from(scope.querySelectorAll('.tracy-motion-next'))
  if (
    prev.length === 0 &&
    nextButtons.length === 0 &&
    root.classList.contains('tracy-motion-carousel--nav')
  ) {
    const nav = document.createElement('div')
    nav.className = 'tracy-motion-nav'
    prev = [control('tracy-motion-prev', labels.previous || 'Previous slide')]
    nextButtons = [control('tracy-motion-next', labels.next || 'Next slide')]
    nav.append(prev[0], nextButtons[0])
    root.append(nav)
  }
  for (const el of prev) {
    name(el, labels.previous || 'Previous slide')
    bind(el, () => go(index - 1, true))
  }
  for (const el of nextButtons) {
    name(el, labels.next || 'Next slide')
    bind(el, () => go(index + 1, true))
  }
  const drawDots = () => {
    if (!root.classList.contains('tracy-motion-carousel--dots')) return
    const old = root.querySelector(':scope > .tracy-motion-dots')
    if (old) old.remove()
    dots.length = 0
    const holder = document.createElement('div')
    holder.className = 'tracy-motion-dots'
    for (let i = 0; i <= last(); i++) {
      const dot = control('tracy-motion-dot', (labels.slide || 'Go to slide') + ' ' + String(i + 1))
      bind(dot, () => go(i, true))
      dots.push(dot)
      holder.append(dot)
    }
    root.append(holder)
  }
  drawDots()
  // A carousel without optional buttons still needs a keyboard entry point.
  if (root.getAttribute('tabindex') === null) root.setAttribute('tabindex', '0')
  const editing = (target) =>
    target && target !== root && target.closest('a, button, input, select, textarea, [contenteditable]')
  root.addEventListener('keydown', (event) => {
    if (editing(event.target)) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (typeof event.preventDefault === 'function') event.preventDefault()
    go(index + (event.key === 'ArrowLeft' ? -1 : 1), true)
  })
  // Native image dragging cancels Pointer Events before pointerup, stranding image-only galleries.
  root.addEventListener('dragstart', (event) => {
    if (event.target?.closest('img')) event.preventDefault()
  })
  let gesture = null
  let swallowClick = false
  const clearGesture = () => {
    gesture = null
  }
  root.addEventListener('pointerdown', (event) => {
    swallowClick = false
    if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return
    if (event.target?.closest('button, input, select, textarea, [contenteditable]')) return
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY }
  })
  root.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return
    const dx = Math.abs(event.clientX - gesture.x)
    const dy = Math.abs(event.clientY - gesture.y)
    // Capture only an actual horizontal drag; a plain picture-link click retains its target.
    if (dx > 40 && dx > dy && typeof root.setPointerCapture === 'function')
      root.setPointerCapture(event.pointerId)
  })
  root.addEventListener('pointerup', (event) => {
    if (!gesture || event.pointerId !== gesture.id) return
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    clearGesture()
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      swallowClick = true
      go(index + (dx < 0 ? 1 : -1), true)
    }
  })
  root.addEventListener('pointercancel', clearGesture)
  root.addEventListener('lostpointercapture', (event) => {
    // Touch transfers implicit capture from the image to this root; its bubbling loss is not cancellation.
    if (event.target === root) clearGesture()
  })
  root.addEventListener(
    'click',
    (event) => {
      if (!swallowClick || event.detail === 0) return
      swallowClick = false
      event.preventDefault()
      event.stopPropagation()
    },
    true
  )
  let views = perView()
  window.addEventListener('resize', () => {
    if (perView() === views) {
      go(Math.min(index, last()), false)
      return
    }
    views = perView()
    drawDots()
    go(Math.min(index, last()), false)
  })
  go(0, false)
}

/** Every carousel on the page. Carousels are navigation, so they run under reduced motion too, without the slide. */
function carousels(config, still) {
  for (const root of marked('tracy-motion-carousel')) carousel(root, config, still)
}

/** The first entry of the config filed under a slot, or null. */
function entryFor(config, slotId) {
  if (!config || !Array.isArray(config.effects)) return null
  for (const entry of config.effects) {
    if (entry && typeof entry.id === 'string' && EFFECT_SLOTS[entry.id] === slotId) return entry
  }
  return null
}

function start() {
  const config = window.TracyMotion
  const reduced =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // A carousel is a control, not decoration: it is taken over whatever the visitor's motion
  // preference, and a visitor who asked for less motion gets its steps without the slide.
  if (entryFor(config, 'carousel')) carousels(config, reduced)

  // The safety valve may have taken the marker off before this file arrived. Nothing is hidden any
  // more, so an entrance now would show the page, blank it, and animate it back in.
  if (!document.documentElement.classList.contains(ROOT_MARKER)) return

  // Either decline takes the marker off: a page with no settings, or a visitor who asked for less
  // motion, must show at once rather than wait out the valve.
  if (!config || !Array.isArray(config.effects) || reduced) {
    document.documentElement.classList.remove(ROOT_MARKER)
    return
  }

  // From here on every outermost section is either played or marked done, so the head-marker valve
  // may stand down. Set any earlier and a bundle that arrives and then declines would hold the page
  // hidden with the valve already disarmed.
  window.TracyMotionStarted = true

  // One effect per slot is honoured: a slot holds at most one effect on the same element, so a
  // config listing two takes the first. An effect declared against a slot with no runtime yet is
  // left alone here; its sections are marked done below, so nothing stays hidden waiting for a
  // trigger that cannot fire.
  const hero = entryFor(config, 'hero-entrance')
  const sectionEffect = entryFor(config, 'section-reveal')
  const reveal = entryFor(config, 'element-reveal')

  // Marked elements are revealed one by one, or shown at once when the effect is off.
  revealElements(reveal)
  if (entryFor(config, 'loop')) pulse()

  // The first outermost section is the hero's; every other one belongs to section-reveal. A section
  // holding marked elements belongs to them when element-reveal is on: it is shown as it is, and its
  // elements make their own entrances, rather than moving twice.
  const sections = outermostSections()
  for (let i = 0; i < sections.length; i++) {
    const owned = reveal && sections[i].getElementsByClassName(REVEAL).length > 0
    if (owned) markDone(sections[i])
    else if (i === 0) {
      if (hero) play(sections[i], hero.id, hero.intensity)
      else markDone(sections[i])
    } else if (sectionEffect) revealSection(sections[i], sectionEffect.id, sectionEffect.intensity)
    else markDone(sections[i])
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
else start()
