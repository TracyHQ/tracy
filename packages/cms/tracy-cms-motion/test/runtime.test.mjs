// Behaviour tests for the emitted runtime: what it does to a page, not what the build writes.
//
// The emitted bundle runs here against a small fake DOM (no browser, no jsdom — the package has no
// DOM dependency and gains none), which carries exactly what the runtime touches: classes,
// children, a handful of selectors, IntersectionObserver, the Web Animations calls and matchMedia.
// Four things are pinned, one per opt-in slot plus the default the opt-ins must not move:
//   - a page with no opt-in class is handled as version 1 handled it;
//   - element-reveal plays each marked element once it meets the viewport, owns its section, and
//     shows everything at once when it is off, too narrow, or the visitor asked for less motion;
//   - a carousel steps, wraps round and draws only the controls its markup asks for, and still
//     steps (without sliding) under reduced motion;
//   - pulse loops only when the effect is switched on.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { plan } from '../scripts/build.mjs'

const { files } = await plan()
const BUNDLE = files.get('wordpress/assets/js/tracy-motion.js')

class ClassList {
  constructor(el) {
    this.el = el
  }
  get set() {
    return new Set(this.el._class.split(/\s+/).filter(Boolean))
  }
  add(...names) {
    const s = this.set
    for (const n of names) s.add(n)
    this.el._class = [...s].join(' ')
  }
  remove(...names) {
    const s = this.set
    for (const n of names) s.delete(n)
    this.el._class = [...s].join(' ')
  }
  contains(name) {
    return this.set.has(name)
  }
}

class El {
  constructor(tag, cls = '', kids = []) {
    this.tagName = tag.toUpperCase()
    this._class = cls
    this.attrs = {}
    this.children = []
    this.parentElement = null
    this.listeners = {}
    this.animations = []
    this.animateCalls = []
    this.offsetLeft = 0
    this.offsetWidth = 0
    this.clientWidth = 0
    this.classList = new ClassList(this)
    for (const k of kids) this.append(k)
  }
  get className() {
    return this._class
  }
  set className(v) {
    this._class = v
  }
  getAttribute(n) {
    return n === 'class' ? this._class : (this.attrs[n] ?? null)
  }
  setAttribute(n, v) {
    this.attrs[n] = String(v)
  }
  removeAttribute(n) {
    delete this.attrs[n]
  }
  append(...kids) {
    for (const k of kids) {
      k.parentElement = this
      this.children.push(k)
    }
  }
  remove() {
    const p = this.parentElement
    if (p) p.children = p.children.filter((c) => c !== this)
    this.parentElement = null
  }
  get firstElementChild() {
    return this.children[0] ?? null
  }
  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()])
  }
  matches(sel) {
    return sel.split(',').some((part) => {
      const s = part.trim()
      if (s.startsWith('.')) return this.classList.contains(s.slice(1))
      return this.tagName === s.toUpperCase()
    })
  }
  querySelectorAll(sel) {
    const scoped = /^:scope\s*>\s*(.+)$/.exec(sel)
    if (scoped) return this.children.filter((c) => c.matches(scoped[1]))
    return this.descendants().filter((d) => d.matches(sel))
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null
  }
  getElementsByClassName(name) {
    return this.descendants().filter((d) => d.classList.contains(name))
  }
  closest(sel) {
    for (let el = this; el; el = el.parentElement) if (el.matches(sel)) return el
    return null
  }
  contains(other) {
    return other === this || this.descendants().includes(other)
  }
  addEventListener(type, fn) {
    ;(this.listeners[type] ??= []).push(fn)
  }
  fire(type, event = {}) {
    for (const fn of this.listeners[type] ?? []) fn(event)
  }
  click() {
    this.fire('click')
  }
  getAnimations() {
    return this.animations
  }
  animate(keyframes, options) {
    this.animateCalls.push({ keyframes, options })
    return { cancel() {} }
  }
}

/** A page and a window around it; `reduced` / `wide` answer matchMedia. */
function page(main, { config, reduced = false, wide = true, marker = true } = {}) {
  const html = new El('html', marker ? 'tracy-motion' : '')
  const body = new El('body', '', [main])
  html.append(body)
  const observers = []
  const windowListeners = {}
  const document = {
    documentElement: html,
    readyState: 'complete',
    querySelector: (sel) => (sel === 'main' ? main : html.querySelector(sel)),
    createElement: (tag) => new El(tag),
    addEventListener() {}
  }
  class IntersectionObserver {
    constructor(cb) {
      this.cb = cb
      this.targets = new Set()
      observers.push(this)
    }
    observe(el) {
      this.targets.add(el)
    }
    unobserve(el) {
      this.targets.delete(el)
    }
    disconnect() {
      this.targets.clear()
    }
    /** Test hook: `el` meets the viewport. */
    enter(el) {
      if (this.targets.has(el)) this.cb([{ isIntersecting: true, target: el }])
    }
  }
  const window = {
    TracyMotion: config,
    matchMedia: (q) => ({
      matches: q.includes('reduce')
        ? reduced
        : q.includes('no-preference')
          ? !reduced
          : q.includes('min-width')
            ? wide
            : false
    }),
    addEventListener(type, fn) {
      ;(windowListeners[type] ??= []).push(fn)
    }
  }
  const context = {
    window,
    document,
    IntersectionObserver,
    Element: El,
    getComputedStyle: (el) => ({
      transform: 'none',
      getPropertyValue: (n) =>
        el.classList.contains('tracy-motion-carousel-step') && n === '--tracy-motion-dur' ? '400ms' : ''
    }),
    Promise,
    setTimeout
  }
  window.window = window
  vm.runInNewContext(BUNDLE, context)
  const enter = (el) => {
    for (const o of observers) o.enter(el)
  }
  return { html, window, enter, observers }
}

const settle = () => new Promise((r) => setImmediate(r))

test('a page without opt-in classes is handled as before: no reveal, no carousel, no loop marker', () => {
  const plain = new El('section', '', [new El('h2')])
  const main = new El('main', '', [new El('section', '', [new El('h1')]), plain])
  const { html } = page(main, { config: { effects: [] } })
  // Config present but no effect: every section is marked done and the marker stays.
  assert.ok(html.classList.contains('tracy-motion'))
  for (const s of main.children) assert.ok(s.classList.contains('tracy-motion-done'))
  assert.equal(main.getElementsByClassName('tracy-motion-carousel-step').length, 0)
  assert.equal(main.getElementsByClassName('tracy-motion-on').length, 0)
})

test('element-reveal plays a marked element once it meets the viewport, bold when asked, then leaves one marker', async () => {
  const card = new El('div', 'tracy-motion-reveal tracy-motion-reveal--fade-left tracy-motion-delay-3')
  const section = new El('section', '', [new El('h2'), card])
  const main = new El('main', '', [new El('section', '', [new El('h1')]), section])
  let finish
  card.animations = [{ finished: new Promise((r) => (finish = r)) }]
  const { enter } = page(main, { config: { effects: [{ id: 'reveal', intensity: 'bold' }] } })
  // The section holding a marked element is shown as it is; the element waits for the viewport.
  assert.ok(section.classList.contains('tracy-motion-done'))
  assert.ok(!card.classList.contains('tracy-motion-in'))
  enter(card)
  assert.ok(card.classList.contains('tracy-motion-in'))
  assert.ok(card.classList.contains('tracy-motion-bold'))
  // Direction and delay are the author's classes and stay; the runtime adds none of its own.
  assert.ok(card.classList.contains('tracy-motion-reveal--fade-left'))
  assert.ok(card.classList.contains('tracy-motion-delay-3'))
  finish()
  await settle()
  assert.ok(card.classList.contains('tracy-motion-done'))
  assert.ok(!card.classList.contains('tracy-motion-in'))
  assert.ok(!card.classList.contains('tracy-motion-bold'))
})

test('element-reveal off, or narrower than minWidth: marked elements are shown at once', () => {
  for (const opts of [
    { config: { effects: [{ id: 'fade-up' }] } },
    { config: { effects: [{ id: 'reveal', minWidth: 992 }] }, wide: false }
  ]) {
    const card = new El('div', 'tracy-motion-reveal')
    const main = new El('main', '', [new El('section', '', [new El('h1')]), new El('section', '', [card])])
    page(main, opts)
    assert.ok(card.classList.contains('tracy-motion-done'), JSON.stringify(opts))
    assert.ok(!card.classList.contains('tracy-motion-in'))
  }
})

test('reduced motion: the marker comes off, so nothing marked is hidden and nothing loops', () => {
  const card = new El('div', 'tracy-motion-reveal')
  const ring = new El('a', 'tracy-motion-pulse')
  const main = new El('main', '', [new El('section', '', [card, ring])])
  const { html } = page(main, { config: { effects: [{ id: 'reveal' }, { id: 'pulse' }] }, reduced: true })
  assert.ok(!html.classList.contains('tracy-motion'))
  assert.ok(!ring.classList.contains('tracy-motion-on'))
})

/** A carousel of `n` slides, each `step` px apart, in a `width` px viewport. */
function carouselOf(n, { cls = 'tracy-motion-carousel', step = 300, width = 300, extra = [] } = {}) {
  const slides = Array.from({ length: n }, (_, i) => {
    const s = new El('div', 'tracy-motion-slide')
    s.offsetLeft = i * step
    s.offsetWidth = step
    return s
  })
  const track = new El('div', 'tracy-motion-track', slides)
  const root = new El('div', cls, [track])
  root.clientWidth = width
  const section = new El('section', '', [...extra, root])
  return { root, track, slides, main: new El('main', '', [new El('section', '', [new El('h1')]), section]) }
}

const lastMove = (track) => track.animateCalls.at(-1).keyframes[1].transform

test('carousel: dots are drawn one per stop, a dot or the arrow keys step the track, and it wraps round', () => {
  const { root, track, slides, main } = carouselOf(3, {
    cls: 'tracy-motion-carousel tracy-motion-carousel--dots'
  })
  page(main, { config: { effects: [{ id: 'carousel-step' }] } })
  assert.ok(root.classList.contains('tracy-motion-carousel-step'))
  const dots = root.querySelector(':scope > .tracy-motion-dots')
  assert.equal(dots.children.length, 3)
  assert.equal(root.querySelectorAll('.tracy-motion-prev').length, 0, 'no nav unless asked')
  dots.children[2].click()
  assert.equal(lastMove(track), 'translateX(-600px)')
  assert.equal(dots.children[2].getAttribute('aria-current'), 'true')
  assert.equal(slides[0].getAttribute('aria-hidden'), 'true')
  root.fire('keydown', { key: 'ArrowRight' })
  assert.equal(lastMove(track), 'translateX(0px)', 'wraps from the last stop to the first')
  root.fire('keydown', { key: 'ArrowLeft' })
  assert.equal(lastMove(track), 'translateX(-600px)', 'wraps from the first stop to the last')
  assert.equal(track.animateCalls.at(-1).options.duration, 400)
})

test('carousel: several slides to a view have fewer stops, and the markup’s own previous / next buttons drive it', () => {
  const prev = new El('span', 'tracy-motion-prev')
  const next = new El('span', 'tracy-motion-next')
  const { root, track, main } = carouselOf(6, { step: 300, width: 1200, extra: [prev, next] })
  page(main, { config: { effects: [{ id: 'carousel-step' }] } })
  // 1200 px shows four 300 px slides: stops at 0, 1, 2 — the third next wraps to the start.
  next.click()
  assert.equal(lastMove(track), 'translateX(-300px)')
  next.click()
  next.click()
  assert.equal(lastMove(track), 'translateX(0px)')
  prev.click()
  assert.equal(lastMove(track), 'translateX(-600px)')
  assert.equal(root.querySelectorAll('.tracy-motion-dot').length, 0, 'no dots unless asked')
  // A markup control with no name of its own is named from the labels, and a link control goes nowhere.
  assert.equal(next.getAttribute('aria-label'), 'Next slide')
  let prevented = false
  next.fire('click', { preventDefault: () => (prevented = true) })
  assert.ok(prevented)
})

test('carousel: every slide is marked as one, whatever element drew it', () => {
  const { slides, main } = carouselOf(3)
  for (const s of slides) s.classList.remove('tracy-motion-slide')
  page(main, { config: { effects: [{ id: 'carousel-step' }] } })
  for (const s of slides) assert.ok(s.classList.contains('tracy-motion-slide'))
})

test('carousel: a --nav carousel without buttons in its markup gets two labelled ones', () => {
  const { root, main } = carouselOf(4, { cls: 'tracy-motion-carousel tracy-motion-carousel--nav' })
  page(main, {
    config: { effects: [{ id: 'carousel-step' }], labels: { previous: 'Précédent', next: 'Suivant' } }
  })
  const [p] = root.querySelectorAll('.tracy-motion-prev')
  const [n] = root.querySelectorAll('.tracy-motion-next')
  assert.equal(p.getAttribute('aria-label'), 'Précédent')
  assert.equal(n.getAttribute('aria-label'), 'Suivant')
})

test('carousel: under reduced motion it still steps, without the slide; off, it is left alone', () => {
  const a = carouselOf(3)
  page(a.main, { config: { effects: [{ id: 'carousel-step' }] }, reduced: true })
  assert.ok(a.root.classList.contains('tracy-motion-carousel-step'))
  a.root.fire('keydown', { key: 'ArrowRight' })
  assert.equal(lastMove(a.track), 'translateX(-300px)')
  assert.equal(a.track.animateCalls.at(-1).options.duration, 0)
  const b = carouselOf(3)
  page(b.main, { config: { effects: [{ id: 'fade-up' }] } })
  assert.ok(!b.root.classList.contains('tracy-motion-carousel-step'))
  assert.equal(b.track.animateCalls.length, 0)
})

test('pulse: the loop is switched on for marked elements only when the effect is listed', () => {
  const on = new El('a', 'tracy-motion-pulse')
  page(new El('main', '', [new El('section', '', [on])]), { config: { effects: [{ id: 'pulse' }] } })
  assert.ok(on.classList.contains('tracy-motion-on'))
  const off = new El('a', 'tracy-motion-pulse')
  page(new El('main', '', [new El('section', '', [off])]), { config: { effects: [{ id: 'fade-up' }] } })
  assert.ok(!off.classList.contains('tracy-motion-on'))
})
