/**
 * JA Essence 1.0.3: what the theme's scripts and listing rules do, not what the build writes.
 *
 * The audit of 1.0.0 (02/10/2026) found the dark toggle cycling three states, drawer submenus that opened as flyouts over
 * their siblings, desktop submenus a touch could not open, a lead slider with no control and the same article listed up to
 * four times. Each is pinned here: the scripts run in a small DOM (linkedom: no layout, so sizes are stubbed where a
 * test needs them) and the PHP listing rule runs as real PHP.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'
import { taskDossier } from './task-dossier.mjs'
import { after, before } from 'node:test'

const here = new URL('..', import.meta.url)
const read = (rel) => readFileSync(new URL(rel, here), 'utf8')
const DOSSIER = taskDossier('ja-essence-wp7')
/**
 * A stylesheet as the template paints it with no design system worn: every slot read
 * `var(--ds-c-<role>, <colour>)` back to its colour (the overlay sheets are tokenized since 1.0.18,
 * TDSR CSS-2), so an assertion about the source's colours reads the colours.
 */
const unworn = (css) => css.replace(/var\(--ds-[ca]-[\w-]+, ((?:[^()]|\([^()]*\))*)\)/g, '$1')
const OVERLAY = 'overlays/wp-ja-essence'
const SLUG = 'wp-ja-essence'

/* ---------- the dark toggle ---------- */

/** The toggle script on a bare page; `click()` presses the toggle button, `theme()` is the root's data-theme (null = auto). */
function toggleSession({ cookie = '', osDark = false, search = '' } = {}) {
  const attrs = new Map()
  const listeners = {}
  const buttons = [new Map()]
  const document = {
    cookie,
    readyState: 'complete',
    documentElement: {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      removeAttribute: (k) => attrs.delete(k)
    },
    querySelectorAll: () => buttons.map((b) => ({ setAttribute: (k, v) => b.set(k, v) })),
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn)
  }
  const os = { dark: osDark, change: [] }
  const window = {
    matchMedia: () => ({
      get matches() {
        return os.dark
      },
      addEventListener: (_, fn) => os.change.push(fn)
    })
  }
  // A cookie jar that keeps the last value written, as a browser does for one name.
  let jar = cookie
  Object.defineProperty(document, 'cookie', {
    get: () => jar,
    set: (v) => {
      jar = String(v).split(';')[0]
    }
  })
  new Function('document', 'window', 'location', read(`${OVERLAY}/assets/js/${SLUG}-dark.js`))(
    document,
    window,
    {
      search,
      protocol: 'https:'
    }
  )
  const button = { closest: () => button }
  return {
    click() {
      for (const fn of listeners.click ?? []) fn({ target: button, preventDefault() {} })
    },
    theme: () => attrs.get('data-theme') ?? null,
    cookie: () => jar,
    label: () => buttons[0].get('aria-label'),
    pressed: () => buttons[0].get('aria-pressed'),
    os: (dark) => {
      os.dark = dark
      for (const fn of os.change) fn()
    }
  }
}

const shown = (s, osDark) => s.theme() ?? (osDark ? 'dark' : 'light')

test('the dark toggle flips what the page shows on every click, from any starting state and either OS setting', () => {
  for (const osDark of [false, true]) {
    for (const cookie of [
      '',
      'tracy_theme=auto',
      'tracy_theme=light',
      'tracy_theme=dark',
      'tracy_theme=purple'
    ]) {
      const s = toggleSession({ cookie, osDark })
      let before = shown(s, osDark)
      for (let i = 0; i < 5; i++) {
        s.click()
        const now = shown(s, osDark)
        assert.notEqual(
          now,
          before,
          `click ${i + 1} from "${cookie}" on a ${osDark ? 'dark' : 'light'} OS changed nothing`
        )
        assert.equal(s.cookie(), `tracy_theme=${now}`, 'the click saves the new state, never `auto`')
        before = now
      }
    }
  }
})

test('the toggle label and pressed state describe what the page shows and follow the OS while the state is auto', () => {
  const s = toggleSession({ osDark: true })
  assert.equal(s.pressed(), 'true')
  assert.equal(s.label(), 'Theme: dark. Switch to light')
  s.os(false)
  assert.equal(s.pressed(), 'false')
  assert.equal(s.label(), 'Theme: light. Switch to dark')
  s.click()
  assert.equal(s.theme(), 'dark')
  s.os(false)
  assert.equal(s.label(), 'Theme: dark. Switch to light', 'a chosen state ignores the OS')
})

test('?theme= keeps its first-value rule: the asked theme is shown without being saved, and a click flips from it', () => {
  const s = toggleSession({ search: '?theme=dark&theme=light', cookie: 'tracy_theme=light' })
  assert.equal(s.theme(), 'dark')
  assert.equal(s.cookie(), 'tracy_theme=light', 'the query does not persist')
  s.click()
  assert.equal(s.theme(), 'light')
  assert.equal(s.cookie(), 'tracy_theme=light')
  const bad = toggleSession({ search: '?theme=purple&theme=dark', cookie: 'tracy_theme=dark' })
  assert.equal(bad.theme(), 'dark', 'an invalid first value asks for nothing, whatever follows')
  const empty = toggleSession({ search: '?theme=&theme=dark', osDark: false })
  assert.equal(empty.theme(), 'light', 'auto is whatever the OS shows, written on the root')
  empty.click()
  assert.equal(empty.theme(), 'dark')
})

test('auto is written on the root as the OS setting and follows it, so the dark rules apply to a dark OS (1.0.5)', () => {
  const dark = toggleSession({ osDark: true })
  assert.equal(dark.theme(), 'dark')
  dark.os(false)
  assert.equal(dark.theme(), 'light')
  const saved = toggleSession({ cookie: 'tracy_theme=light', osDark: true })
  assert.equal(saved.theme(), 'light', 'a saved choice is not overridden by the OS')
})

/* ---------- the header scripts ---------- */

const SCRIPT = read(`${OVERLAY}/assets/js/${SLUG}.js`)

/** A page with the script run on it. Layout is stubbed: `layout(el)` answers `{ width, left }` for an element. */
function page(markup, { layout = () => ({}), bodyClass = '' } = {}) {
  const { document, window } = parseHTML(
    `<!doctype html><html><body class="${bodyClass}">${markup}</body></html>`
  )
  const timers = []
  const resize = []
  const globals = {
    document,
    window: Object.assign(window, { matchMedia: () => ({ matches: false }) }),
    getComputedStyle: () => ({ columnGap: '32px' }),
    ResizeObserver: class {
      constructor(fn) {
        resize.push(fn)
      }
      observe() {}
    },
    requestAnimationFrame: (fn) => {
      timers.push(fn)
      return timers.length
    },
    cancelAnimationFrame: () => {}
  }
  // linkedom has neither layout nor focus-visible: both stubbed through the element prototypes the script reaches.
  const proto = Object.getPrototypeOf(document.createElement('div'))
  proto.getBoundingClientRect = function () {
    const l = layout(this)
    return {
      width: l.width ?? 0,
      height: 0,
      left: l.left ?? 0,
      right: (l.left ?? 0) + (l.width ?? 0),
      x: l.left ?? 0,
      y: 0
    }
  }
  Object.defineProperty(proto, 'offsetLeft', {
    configurable: true,
    get() {
      return layout(this).left ?? 0
    }
  })
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get() {
      return layout(this).track ?? 0
    }
  })
  proto.scrollTo = function ({ left }) {
    this.scrollLeft = left
    this.dispatchEvent(new window.Event('scroll'))
  }
  new Function(...Object.keys(globals), SCRIPT)(...Object.values(globals))
  const fire = (el, type, props = {}) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true })
    Object.assign(e, props)
    el.dispatchEvent(e)
    return e
  }
  return {
    document,
    window,
    fire,
    flush: () => timers.splice(0).forEach((fn) => fn()),
    resize: () => resize.forEach((fn) => fn())
  }
}

const item = (label, href, children = '') =>
  `<li class="wp-block-navigation-item${children ? ' has-child' : ''}"><a class="wp-block-navigation-item__content"${href ? ` href="${href}"` : ''}><span class="wp-block-navigation-item__label">${label}</span></a>${
    children
      ? `<button class="wp-block-navigation__submenu-icon wp-block-navigation-submenu__toggle" aria-expanded="false" aria-label="${label} submenu"></button><ul class="wp-block-navigation__submenu-container">${children}</ul>`
      : ''
  }</li>`

const MENU = [
  item('Home', '/', item('Home 1', '/home/1') + item('Home 2', '/home/2')),
  item('#Category', '', item('Style 1', '/c/1')),
  item('Contact', '/contact'),
  item(
    'Pages',
    '',
    item('User', '', item('Login Form', '/login') + item('Register', '/register')) +
      item('Typography', '/typo')
  )
].join('')

const DRAWER = `<button class="je-drawer-toggle" aria-expanded="false"></button><div id="je-drawer"><button class="je-drawer-close"></button><nav class="je-drawer-nav wp-block-navigation"><ul class="wp-block-navigation__container">${MENU}</ul></nav></div>`

const visibleRows = (document) => {
  const cur = document.querySelector('.je-d-cur')
  return [...cur.children].map((li) => li.querySelector('.wp-block-navigation-item__label').textContent)
}

test('drawer submenus drill down: the panel replaces the list, a back row leads up, three levels are reachable', () => {
  const { document, fire } = page(DRAWER)
  const nav = document.querySelector('.je-drawer-nav')
  const back = document.querySelector('.je-drill-back')
  assert.ok(back, 'a back row is added')
  assert.equal(back.hidden, true)
  assert.deepEqual(visibleRows(document), ['Home', '#Category', 'Contact', 'Pages'])
  const toggle = (label) =>
    [...nav.querySelectorAll('li.has-child')]
      .find((li) => li.querySelector('.wp-block-navigation-item__label').textContent === label)
      .querySelector(':scope > .wp-block-navigation-submenu__toggle')

  // level 2
  const e1 = fire(toggle('Pages'), 'click')
  assert.equal(e1.defaultPrevented, true, 'core never opens its own flyout')
  assert.deepEqual(visibleRows(document), ['User', 'Typography'])
  assert.equal(nav.classList.contains('je-drilled'), true)
  assert.equal(back.hidden, false)
  assert.equal(back.querySelector('.je-drill-label').textContent, 'Pages')
  assert.equal(toggle('Pages').getAttribute('aria-expanded'), 'true')
  // level 3
  fire(toggle('User'), 'click')
  assert.deepEqual(visibleRows(document), ['Login Form', 'Register'])
  assert.equal(back.querySelector('.je-drill-label').textContent, 'User')
  // a level that is not on screen cannot be opened by a stray click
  fire(toggle('Home'), 'click')
  assert.deepEqual(visibleRows(document), ['Login Form', 'Register'])
  // back, back
  fire(back, 'click')
  assert.deepEqual(visibleRows(document), ['User', 'Typography'])
  assert.equal(toggle('User').getAttribute('aria-expanded'), 'false')
  fire(back, 'click')
  assert.deepEqual(visibleRows(document), ['Home', '#Category', 'Contact', 'Pages'])
  assert.equal(back.hidden, true)
  fire(back, 'click')
  assert.deepEqual(
    visibleRows(document),
    ['Home', '#Category', 'Contact', 'Pages'],
    'back at the top does nothing'
  )
})

test('a drawer parent without an address opens by its label; one with an address still follows it', () => {
  const { document, fire } = page(DRAWER)
  const label = (text) =>
    [...document.querySelectorAll('.je-drawer-nav a')].find((a) => a.textContent.trim() === text)
  const own = fire(label('#Category'), 'click')
  assert.equal(own.defaultPrevented, true)
  assert.deepEqual(visibleRows(document), ['Style 1'])
  const reset = page(DRAWER)
  const home = reset.fire(
    [...reset.document.querySelectorAll('.je-drawer-nav a')].find((a) => a.textContent.trim() === 'Home'),
    'click'
  )
  assert.equal(home.defaultPrevented, false, 'the Home link is a link')
  assert.deepEqual(visibleRows(reset.document), ['Home', '#Category', 'Contact', 'Pages'])
})

test('closing the drawer returns it to the top of the menu; Escape and the close button close it', () => {
  const { document, fire } = page(DRAWER)
  const root = document.documentElement
  fire(document.querySelector('.je-drawer-toggle'), 'click')
  assert.equal(root.classList.contains('je-drawer-open'), true)
  const pages = [...document.querySelectorAll('li.has-child')].find(
    (li) => li.querySelector('.wp-block-navigation-item__label').textContent === 'Pages'
  )
  fire(pages.querySelector(':scope > button'), 'click')
  assert.deepEqual(visibleRows(document), ['User', 'Typography'])
  fire(document, 'keydown', { key: 'Escape' })
  assert.equal(root.classList.contains('je-drawer-open'), false)
  assert.deepEqual(visibleRows(document), ['Home', '#Category', 'Contact', 'Pages'])
  fire(document.querySelector('.je-drawer-toggle'), 'click')
  fire(document.querySelector('.je-drawer-close'), 'click')
  assert.equal(root.classList.contains('je-drawer-open'), false)
})

test('a drawer with no submenus or no navigation does not break the script', () => {
  const none = page(
    `<button class="je-drawer-toggle"></button><div id="je-drawer"><nav class="je-drawer-nav"><ul class="wp-block-navigation__container"><li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="/a"><span class="wp-block-navigation-item__label">A</span></a></li></ul></nav></div>`
  )
  assert.deepEqual(visibleRows(none.document), ['A'])
  assert.doesNotThrow(() => none.fire(none.document.querySelector('.je-drawer-toggle'), 'click'))
  assert.doesNotThrow(() => page('<p>no chrome at all</p>'))
  assert.doesNotThrow(() => page('<div id="je-drawer"></div>'))
})

const NAV = `<header class="je-header"><nav class="je-nav wp-block-navigation"><ul class="wp-block-navigation__container">${MENU}</ul></nav></header><main><a id="outside" href="/x">outside</a></main>`
const parentLi = (document, label) =>
  [...document.querySelectorAll('.je-nav > ul > li')].find(
    (li) => li.querySelector('.wp-block-navigation-item__label').textContent === label
  )

test('desktop submenus open by tap on the parent or its chevron, close on a tap outside or Escape, and one is open at a time', () => {
  const { document, fire } = page(NAV)
  const open = () =>
    [...document.querySelectorAll('.je-nav > ul > li.je-open')].map(
      (li) => li.querySelector('.wp-block-navigation-item__label').textContent
    )
  // chevron
  const e = fire(parentLi(document, 'Pages').querySelector(':scope > button'), 'click')
  assert.equal(e.defaultPrevented, true)
  assert.deepEqual(open(), ['Pages'])
  assert.equal(
    parentLi(document, 'Pages').querySelector(':scope > button').getAttribute('aria-expanded'),
    'true'
  )
  // a parent with no address opens by its label, and the first one closes
  fire(parentLi(document, '#Category').querySelector(':scope > a'), 'click', { pointerType: 'touch' })
  assert.deepEqual(open(), ['#Category'])
  assert.equal(
    parentLi(document, 'Pages').querySelector(':scope > button').getAttribute('aria-expanded'),
    'false'
  )
  // tap outside closes
  fire(document.getElementById('outside'), 'pointerdown')
  assert.deepEqual(open(), [])
  // Escape closes
  fire(parentLi(document, 'Pages').querySelector(':scope > button'), 'click')
  fire(document, 'keydown', { key: 'Escape' })
  assert.deepEqual(open(), [])
  // a second press on the chevron closes what it opened
  fire(parentLi(document, 'Pages').querySelector(':scope > button'), 'click')
  fire(parentLi(document, 'Pages').querySelector(':scope > button'), 'click')
  assert.deepEqual(open(), [])
})

test('a parent that has an address: the first touch opens it, the second follows it; a mouse click follows it at once', () => {
  const { document, fire } = page(NAV)
  const home = parentLi(document, 'Home').querySelector(':scope > a')
  assert.equal(fire(home, 'click', { pointerType: 'mouse' }).defaultPrevented, false)
  assert.equal(parentLi(document, 'Home').classList.contains('je-open'), false)
  assert.equal(fire(home, 'click', { pointerType: 'touch' }).defaultPrevented, true)
  assert.equal(parentLi(document, 'Home').classList.contains('je-open'), true)
  assert.equal(
    fire(home, 'click', { pointerType: 'touch' }).defaultPrevented,
    false,
    'the second tap goes through'
  )
  // a link in the panel and a link without a submenu are never intercepted
  assert.equal(
    fire(parentLi(document, 'Home').querySelector('ul a'), 'click', { pointerType: 'touch' })
      .defaultPrevented,
    false
  )
  assert.equal(
    fire(parentLi(document, 'Contact').querySelector('a'), 'click', { pointerType: 'touch' })
      .defaultPrevented,
    false
  )
})

test('keyboard focus on a chevron or a panel link opens the panel; focus leaving it closes it', () => {
  const { document, fire } = page(NAV)
  const li = parentLi(document, 'Home')
  fire(li.querySelector(':scope > button'), 'focusin')
  assert.equal(li.classList.contains('je-open'), true)
  fire(li.querySelector('ul a'), 'focusin')
  assert.equal(li.classList.contains('je-open'), true)
  fire(li.querySelector('ul a'), 'focusout', {
    relatedTarget: parentLi(document, 'Contact').querySelector('a')
  })
  assert.equal(li.classList.contains('je-open'), false)
  fire(parentLi(document, 'Contact').querySelector('a'), 'focusin')
  assert.equal(document.querySelectorAll('.je-open').length, 0)
})

/* ---------- the lead slider ---------- */

const SLIDER = (n) =>
  `<div class="je-lead je-lead--slide"><ul class="je-lead__items">${Array.from({ length: n }, (_, i) => `<li data-i="${i}"><a href="/p${i}">Post ${i}</a></li>`).join('')}</ul></div>`

/** A track `track` px wide whose cards are `card` px wide with a 32px gap. */
const sliderLayout = (track, card) => (el) => {
  if (el.matches?.('.je-lead__items')) return { track, width: track }
  if (el.parentElement?.matches?.('.je-lead__items')) {
    const i = Number(el.getAttribute('data-i'))
    return { width: card, left: 18 + i * (card + 32) }
  }
  return {}
}

test('the lead slider gets one dot per page, previous and next buttons, and reaches every card', () => {
  for (const [track, card, visible, dots] of [
    [1128, 355, 3, 2],
    [354, 354, 1, 6],
    [700, 334, 2, 3]
  ]) {
    const { document, fire, flush } = page(SLIDER(6), { layout: sliderLayout(track, card) })
    const root = document.querySelector('.je-lead--slide')
    assert.equal(root.getAttribute('aria-roledescription'), 'carousel')
    const buttons = [...root.querySelectorAll('.je-slider__dots button')]
    assert.equal(buttons.length, dots, `${visible} visible → ${dots} dots`)
    const prev = root.querySelector('.je-slider__prev')
    const next = root.querySelector('.je-slider__next')
    assert.equal(prev.disabled, true)
    assert.equal(next.disabled, false)
    const track_ = root.querySelector('.je-lead__items')
    for (let i = 1; i < dots; i++) {
      fire(next, 'click')
      flush()
      assert.equal(
        buttons[i].getAttribute('aria-current'),
        'true',
        `page ${i + 1} is current after ${i} presses of next`
      )
    }
    assert.equal(next.disabled, true, 'the last page disables next')
    assert.equal(buttons.at(-1).getAttribute('aria-current'), 'true')
    // the dots reach every page, in both directions
    fire(buttons[0], 'click')
    flush()
    assert.equal(prev.disabled, true)
    assert.equal(buttons[0].getAttribute('aria-current'), 'true')
    // cards off screen are out of the tab order
    const inert = [...track_.children].filter((li) => li.hasAttribute('inert')).length
    assert.equal(inert, 6 - visible)
  }
})

test('a slider with one card or all cards on screen shows no controls', () => {
  const one = page(SLIDER(1), { layout: sliderLayout(1128, 355) })
  assert.equal(one.document.querySelector('.je-slider__nav'), null)
  const all = page(SLIDER(3), { layout: sliderLayout(1128, 355) })
  assert.equal(all.document.querySelector('.je-slider__nav').hidden, true)
  assert.doesNotThrow(() => page(SLIDER(0)))
  assert.doesNotThrow(() => page('<div class="je-lead je-lead--slide"></div>'))
})

test('a resize that changes how many cards fit rebuilds the dots and keeps a reachable page', () => {
  let track = 1128
  const { document, resize } = page(SLIDER(6), {
    layout: (el) => sliderLayout(track, track === 1128 ? 355 : 354)(el)
  })
  assert.equal(document.querySelectorAll('.je-slider__dots button').length, 2)
  track = 354
  resize()
  assert.equal(document.querySelectorAll('.je-slider__dots button').length, 6)
  assert.equal(document.querySelectorAll('.je-slider__dots button[aria-current="true"]').length, 1)
})

/* ---------- the gallery article ---------- */

const GALLERY = `<div class="je-articlecard"><figure class="je-page__hero"><img src="/hero.jpg"></figure><div class="jes-gallery"><img src="/a.jpg" alt="A"><img src="/b.jpg" alt="B"><img src="/c.jpg" alt="C"></div></div>`

test('the gallery article (slug gallery) gets the source slider: arrows, one thumbnail per picture, keyboard', () => {
  const { document, fire } = page(GALLERY, { bodyClass: 'je-slug-gallery' })
  const slider = document.querySelector('.je-gslider')
  assert.ok(slider)
  assert.equal(document.querySelectorAll('.je-gslider__slide').length, 3)
  assert.equal(document.querySelectorAll('.je-gslider__thumbs button').length, 3)
  assert.equal(document.querySelectorAll('.je-gslider__slide:not([hidden])').length, 1)
  fire(document.querySelector('.je-gslider__next'), 'click')
  assert.equal(document.querySelector('.je-gslider__slide:not([hidden]) img').getAttribute('src'), '/b.jpg')
  fire(document.querySelector('.je-gslider__prev'), 'click')
  fire(document.querySelector('.je-gslider__prev'), 'click')
  assert.equal(document.querySelector('.je-gslider__slide:not([hidden]) img').getAttribute('src'), '/c.jpg')
  assert.equal(
    document.querySelector('.je-gslider__thumbs button[aria-current="true"]').getAttribute('aria-label'),
    'Show picture 3'
  )
})

test('a gallery-format post (any page, not only the gallery article) gets the slider above its title (1.0.4)', () => {
  const { document } = page(GALLERY)
  const slider = document.querySelector('.je-gslider')
  assert.ok(slider)
  assert.equal(document.querySelectorAll('.je-gslider__slide').length, 3)
  assert.equal(document.querySelector('.je-articlecard').classList.contains('je-gslider-on'), true)
  assert.equal(document.querySelectorAll('.jes-gallery img').length, 3)
})

test('an article with no gallery field gets no slider', () => {
  const { document } = page(
    '<div class="je-articlecard"><figure class="je-page__hero"><img src="/hero.jpg"></figure></div>'
  )
  assert.equal(document.querySelector('.je-gslider'), null)
})

test('a gallery with one picture gets no slider', () => {
  const { document } = page(
    `<div class="je-articlecard"><div class="jes-gallery"><img src="/a.jpg" alt="A"></div></div>`,
    { bodyClass: 'je-slug-gallery' }
  )
  assert.equal(document.querySelector('.je-gslider'), null)
})

/* ---------- the listing rule (PHP) ---------- */

const PHP_SKIP = phpSupport().skip
let php
before(() => {
  if (!PHP_SKIP)
    php = startPhp({
      files: {
        cwd: fileURLToPath(here),
        paths: [
          'overlays/wp-ja-essence/languages',
          'src/wp-ja-essence/languages',
          'overlays/wp-ja-essence/inc/words.php',
          'src/wp-ja-essence/inc/words.php'
        ]
      }
    })
})
after(() => php?.stop())

const LISTING_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
function get_term_children($id, $tax) { global $kids; return $kids[$id] ?? array(); }
$kids = $in['kids'];
eval($in['code']);
$out = array();
foreach ($in['cases'] as $c) { $out[] = wp_ja_essence_listing_args($c[0], $c[1], $c[2], $c[3] ?? false); }
echo json_encode($out, JSON_UNESCAPED_SLASHES);
`

test('a copy of an article is listed only by the lists that span categories; a featured list prints every featured article', {
  skip: PHP_SKIP
}, () => {
  for (const base of ['overlays', 'src']) {
    const file = `${base}/${SLUG}/inc/extra.php`
    const code = read(file).match(/function wp_ja_essence_listing_args\([\s\S]*?\n}\n/)?.[0]
    assert.ok(code, `${file}: no wp_ja_essence_listing_args()`)
    const cases = [
      [{}, [], false], // no category: home, search, tags
      [{ post_type: 'post' }, [5], false], // one category, no children
      [{ post_type: 'post' }, [5], true], // one category that has two sub-categories
      [{ post_type: 'post' }, [5, 6], false], // several categories
      [{ post_type: 'post' }, [7], true], // one category whose children are none
      [{ post_type: 'page', meta_query: [{ key: 'x', value: '1' }] }, [5], false], // an owner's own query keeps its meta and its type
      [{ post_type: 'post' }, [], false, true], // the source's featured list over every category
      [{ post_type: 'post' }, [4], false, true] // the featured list of the second tree (copies are its members)
    ]
    const [out] = php.run([
      { args: ['-r', LISTING_PROBE], input: JSON.stringify({ code, kids: { 5: [8, 9], 7: [] }, cases }) }
    ])
    assert.equal(out.status, 0, `${file}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    const keys = (q) => (q.meta_query ?? []).map((m) => m.key)
    assert.deepEqual(keys(got[0]), ['je_unlisted', 'je_copy_of'])
    assert.equal(got[0].post_type, undefined, "no category: the post type is the caller's")
    assert.deepEqual(
      keys(got[1]),
      [],
      'a single category prints its own copies, repeated titles included (1.0.3, D-74)'
    )
    assert.deepEqual(got[1].post_type, ['post', 'page'], 'and the article pages filed under it')
    assert.deepEqual(
      keys(got[2]),
      ['je_unlisted', 'je_copy_of'],
      'a category with sub-categories spans several'
    )
    assert.deepEqual(keys(got[3]), ['je_unlisted', 'je_copy_of'])
    assert.deepEqual(keys(got[4]), [])
    assert.deepEqual(keys(got[5]), ['x'])
    assert.equal(got[5].post_type, 'page')
    for (const i of [6, 7]) {
      assert.deepEqual(
        keys(got[i]),
        ['je_front'],
        'a featured list is the articles with a place in the featured order'
      )
      assert.equal(got[i].meta_query[0].compare, 'EXISTS')
      assert.deepEqual(got[i].post_type, ['post', 'page'], 'pages included even with no category')
    }
    for (const i of [0, 3]) for (const m of got[i].meta_query) assert.equal(m.compare, 'NOT EXISTS')
  }
})

/* ---------- the source's order of a listing (PHP) ---------- */

const ORDER_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
class WP_Query { public $v; function __construct($v = array()) { $this->v = $v; } function get($k) { return $this->v[$k] ?? ''; } }
class wpdb_stub { public $posts = 'wp_posts'; public $postmeta = 'wp_postmeta'; function prepare($q, $a) { return str_replace('%s', "'" . $a . "'", $q); } }
$wpdb = new wpdb_stub();
function add_filter() {}
eval($in['code']);
$out = array();
foreach ($in['modes'] as $m) { $out[] = wp_ja_essence_order_clauses(array('join' => '', 'orderby' => 'x'), new WP_Query(array('je_order' => $m))); }
echo json_encode($out, JSON_UNESCAPED_SLASHES);
`

test('each source order sorts by the Joomla fields kept as post meta, missing meta last, then by id', {
  skip: PHP_SKIP
}, () => {
  for (const base of ['overlays', 'src']) {
    const file = `${base}/${SLUG}/inc/extra.php`
    const code = read(file).match(/function wp_ja_essence_order_clauses\([\s\S]*?\n}\n/)?.[0]
    assert.ok(code, `${file}: no wp_ja_essence_order_clauses()`)
    const modes = ['category', 'front', 'hits', 'latest', 'title', 'bogus', '']
    const [out] = php.run([{ args: ['-r', ORDER_PROBE], input: JSON.stringify({ code, modes }) }])
    assert.equal(out.status, 0, `${file}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    const by = (i) =>
      got[i].orderby.replace(/COALESCE\(CAST\(je_o_(\w+)\.meta_value AS SIGNED\), \d+\)/g, '$1')
    assert.equal(by(0), 'je_catpos ASC, je_ordering ASC, je_created DESC, je_src_id ASC, wp_posts.ID ASC')
    assert.equal(by(1), 'je_front ASC, je_src_id ASC, wp_posts.ID ASC')
    assert.equal(by(2), 'je_hits ASC, je_src_id ASC, wp_posts.ID ASC')
    assert.equal(by(3), 'je_created DESC, je_src_id ASC, wp_posts.ID ASC')
    assert.match(
      by(4),
      /^COALESCE\(NULLIF\(je_o_heading\.meta_value, ''\), wp_posts\.post_title\) ASC, je_src_id ASC/
    )
    assert.match(got[0].join, /je_o_je_catpos ON/)
    assert.match(got[0].join, /meta_key = 'je_ordering'/)
    assert.match(got[2].orderby, /999999\)/, 'an article without the meta sorts after the ones that have it')
    assert.match(got[3].orderby, /, 0\) DESC/, 'a missing creation time sorts as the oldest')
    for (const i of [5, 6])
      assert.deepEqual(got[i], { join: '', orderby: 'x' }, 'an unknown order leaves the query alone')
  }
})

const RELATED_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['meta'] = $in['meta'];
function get_post_meta($id, $k, $single) { return $GLOBALS['meta'][$id][$k] ?? ''; }
function get_posts($a) { $ids = array_keys($GLOBALS['meta']); sort($ids); $out = array(); foreach ($ids as $i) { if (in_array($i, $a['post__not_in'], true)) continue; $p = new stdClass(); $p->ID = $i; $out[] = $p; } usort($out, function ($x, $y) { return $GLOBALS['meta'][$x->ID]['je_src_id'] <=> $GLOBALS['meta'][$y->ID]['je_src_id']; }); return $out; }
eval($in['code']);
$out = array();
foreach ($in['cases'] as $c) { $out[] = wp_ja_essence_related_ids($c[0], $c[1]); }
echo json_encode($out);
`

test('More reading lists what the source lists: the first articles sharing a keyword by id, printed by ordering then id', {
  skip: PHP_SKIP || DOSSIER.skip
}, () => {
  const measured = JSON.parse(readFileSync(path.join(DOSSIER.dir, 'measured/source-order.json'), 'utf8'))
  const meta = {}
  for (const a of measured.articles)
    meta[a.id] = { je_src_id: a.id, je_ordering: a.ordering, je_metakey: a.metakey }
  const cases = [
    [23, 4], // Layout 1 (module 111): Embracing, Capturing, Drawing, From Lines
    [14, 3], // Layout 3
    [13, 3], // Layout 2
    [11, 3], // Video
    [12, 3], // Gallery
    [20, 3], // a post of Health (measured on the source's Capturing Essence page)
    [23, 0], // nothing asked
    [999, 3] // not an article of the site: no keyword, no related
  ]
  meta[999] = { je_src_id: 999 }
  for (const base of ['overlays', 'src']) {
    const file = `${base}/${SLUG}/inc/extra.php`
    const code = read(file).match(/function wp_ja_essence_related_ids\([\s\S]*?\n}\n/)?.[0]
    assert.ok(code, `${file}: no wp_ja_essence_related_ids()`)
    const [out] = php.run([{ args: ['-r', RELATED_PROBE], input: JSON.stringify({ code, meta, cases }) }])
    assert.equal(out.status, 0, `${file}: ${out.stderr}${out.stdout}`)
    assert.deepEqual(JSON.parse(out.stdout), [
      [19, 20, 18, 21],
      [11, 10, 3],
      [11, 10, 3],
      [12, 10, 3],
      [11, 10, 3],
      [19, 18, 21],
      [],
      []
    ])
  }
})

const FILTER_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
function add_filter() {} function add_action() {}
function esc_html($s) { return htmlspecialchars($s); } function esc_attr($s) { return htmlspecialchars($s); } function esc_url($s) { return $s; }
function sanitize_html_class($s) { return preg_replace('/[^a-z0-9_-]/i', '', $s); } function __($s) { return $s; }
eval($in['search']); eval($in['pager']);
$url = function ($n) { return '/p/' . $n; };
$out = array(
  'search' => wp_ja_essence_search_icon('<form class="je-search"><button><svg class="search-icon" width="24"><path d="M1"/></svg></button></form>'),
  'other' => wp_ja_essence_search_icon('<form class="x"><svg class="search-icon" width="24"></svg></form>'),
  'middle' => wp_ja_essence_pager(3, 4, $url),
  'first' => wp_ja_essence_pager(1, 3, $url),
  'last' => wp_ja_essence_pager(3, 3, $url, 'Pagination', 'counter-last'),
  'single' => wp_ja_essence_pager(1, 1, $url),
  'clamped' => wp_ja_essence_pager(99, 4, $url),
);
echo json_encode($out);
`

test("the search icon is the source's 20px magnifier and a list's pager prints Page N of M", {
  skip: PHP_SKIP
}, () => {
  for (const base of ['overlays', 'src']) {
    const php_ = read(`${base}/${SLUG}/inc/extra.php`)
    const search = php_.match(/function wp_ja_essence_search_icon\([\s\S]*?\n}\n/)?.[0]
    const pager = php_.match(/function wp_ja_essence_pager\([\s\S]*?\n}\n/)?.[0]
    assert.ok(search && pager, `${base}: search icon and pager counter functions`)
    const [out] = php.run([{ args: ['-r', FILTER_PROBE], input: JSON.stringify({ search, pager }) }])
    assert.equal(out.status, 0, `${base}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    assert.match(got.search, /<svg class="search-icon" viewBox="0 0 20 20" width="20" height="20"/)
    assert.match(got.search, /stroke="currentColor"/)
    assert.doesNotMatch(got.search, /width="24"/)
    assert.match(got.other, /width="24"/, 'only the theme search block is redrawn')
    assert.match(
      got.middle,
      /<p class="je-pagination__counter">Page 3 of 4<\/p><nav class="je-pagination__nav"/
    )
    assert.equal(
      (got.middle.match(/je-pagination__item/g) ?? []).length,
      8,
      'first, previous, four pages, next, last'
    )
    assert.match(got.middle, /aria-current="page" aria-label="Page 3">3</)
    assert.match(got.middle, /href="\/p\/2"/)
    assert.match(got.first, /is-disabled/, 'the first and previous buttons are dimmed on the first page')
    assert.match(
      got.last,
      /<\/nav><p class="je-pagination__counter">Page 3 of 3<\/p>/,
      'the counter-last variant puts the counter after the links'
    )
    assert.equal(got.single, '', 'one page prints no pager')
    assert.match(got.clamped, /Page 4 of 4/, 'a page past the end is clamped')
  }
})

const COPY_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
class WPCF7_ContactForm { public $p; function __construct($p) { $this->p = $p; } function prop($k) { return $this->p[$k] ?? null; } function set_properties($a) { $this->p = array_merge($this->p, $a); } }
class WPCF7_Submission { static $posted; static function get_instance() { return new self(); } function get_posted_data($k) { return self::$posted[$k] ?? null; } }
function add_action() {}
eval($in['code']);
$out = array();
foreach ($in['cases'] as $c) {
  WPCF7_Submission::$posted = $c['posted'];
  $f = new WPCF7_ContactForm(array('form' => $c['form'], 'mail_2' => array('active' => $c['active'])));
  wp_ja_essence_contact_copy($f);
  $out[] = $f->prop('mail_2')['active'];
}
echo json_encode($out);
`

test('the contact form mails the visitor a copy only when the copy box is ticked', { skip: PHP_SKIP }, () => {
  const withBox = '[text* your-name] [checkbox send-copy use_label_element "Send a copy to yourself"]'
  const cases = [
    { form: withBox, active: true, posted: {} }, // not ticked
    { form: withBox, active: true, posted: { 'send-copy': [] } },
    { form: withBox, active: true, posted: { 'send-copy': [''] } }, // empty value
    { form: withBox, active: true, posted: { 'send-copy': ['Send a copy to yourself'] } }, // ticked
    { form: withBox, active: false, posted: {} }, // Mail (2) already off: stays off
    { form: '[text* your-name]', active: true, posted: {} } // a form with no copy box keeps its own Mail (2)
  ]
  for (const base of ['overlays', 'src']) {
    const code = read(`${base}/${SLUG}/inc/extra.php`).match(
      /function wp_ja_essence_contact_copy\([\s\S]*?\n}\n/
    )?.[0]
    assert.ok(code, `${base}: no wp_ja_essence_contact_copy()`)
    const [out] = php.run([{ args: ['-r', COPY_PROBE], input: JSON.stringify({ code, cases }) }])
    assert.equal(out.status, 0, `${base}: ${out.stderr}${out.stdout}`)
    assert.deepEqual(JSON.parse(out.stdout), [false, false, false, true, false, true])
  }
})

/* ---------- the data behind the orders ---------- */

test('the measured source order covers every article once and the featured order has 24 distinct places', {
  skip: DOSSIER.skip
}, () => {
  const m = JSON.parse(readFileSync(path.join(DOSSIER.dir, 'measured/source-order.json'), 'utf8'))
  const ids = m.articles.map((a) => a.id)
  assert.equal(new Set(ids).size, ids.length, 'one row per article')
  assert.equal(ids.length, 51, '46 posts and the 5 article pages')
  assert.equal(m.front.length, 24)
  assert.equal(new Set(m.front).size, 24)
  assert.deepEqual(
    [...m.front].sort((a, b) => a - b),
    m.articles
      .filter((a) => a.featured)
      .map((a) => a.id)
      .sort((a, b) => a - b),
    'the featured order names exactly the featured articles'
  )
  for (const a of m.articles) {
    assert.ok(Number.isInteger(a.catpos) && a.catpos >= 1 && a.catpos <= 8, `catpos of ${a.id}`)
    assert.ok(
      Number.isInteger(a.hits) && a.hits >= 0 && Number.isInteger(a.ordering),
      `hits/ordering of ${a.id}`
    )
  }
})

test('the spec carries the order meta on every article, and the list patterns name the source rule they follow', {
  skip: DOSSIER.skip
}, () => {
  const spec = JSON.parse(readFileSync(path.join(DOSSIER.dir, 'spec/content.json'), 'utf8'))
  const keys = ['je_src_id', 'je_catpos', 'je_ordering', 'je_hits', 'je_created', 'je_metakey']
  for (const p of spec.posts) for (const k of keys) assert.ok(p.meta?.[k] !== undefined, `${p.slug}: ${k}`)
  const articlePages = spec.pages.filter((p) => p.je?.category)
  assert.equal(articlePages.length, 5)
  for (const p of articlePages)
    for (const k of keys) assert.ok(p.je.meta?.[k] !== undefined, `${p.path}: ${k}`)
  const featured = [...spec.posts.map((p) => p.meta), ...articlePages.map((p) => p.je.meta)].filter(
    (m) => m.je_front
  )
  assert.equal(featured.length, 24)
  const want = {
    'front-list-home-1': { order: 'front', perPage: 6, cats: undefined },
    'front-list-home-3': { order: 'front', perPage: 6, cats: 'blog-health,blog-design,blog-fashion' },
    'front-list-warm-home-2': { order: 'front', perPage: 6, cats: 'blog-health,blog-design,blog-fashion' },
    'front-list-grid-home-4': { order: 'category', perPage: 8, cats: 'blog-health,blog-design,blog-fashion' },
    'front-list-warm-home-5': { order: 'category', perPage: 4, cats: 'blog-normal' },
    'front-list-featured': { order: 'category', perPage: 7, cats: undefined }
  }
  for (const [slug, w] of Object.entries(want)) {
    const html = read(`${OVERLAY}/patterns/${slug}.php`)
    const q = JSON.parse(html.match(/<!-- wp:query (\{.*?\}) -->/)[1]).query
    assert.equal(q.wpJaEssenceFeatured, true, slug)
    assert.equal(q.wpJaEssenceOrder, w.order, slug)
    assert.equal(q.perPage, w.perPage, slug)
    assert.equal(q.wpJaEssenceCategory, w.cats, slug)
    assert.ok(
      spec.pages.some((p) => String(p.content).includes(`wp-ja-essence/${slug}`)),
      `${slug} is used by a page`
    )
    assert.equal(
      read(`src/${SLUG}/patterns/${slug}.php`),
      html,
      `${slug}: the built theme carries the overlay's pattern`
    )
  }
  for (const [slug, order] of [
    ['section-articles-category-list-blog', 'hits'],
    ['section-articles-latest-latest-feat', 'latest'],
    ['section-articles-latest-latest-nsub', 'latest'],
    ['section-articles-category-slide-feat', 'title']
  ])
    assert.match(read(`${OVERLAY}/patterns/${slug}.php`), new RegExp(`"wpJaEssenceOrder":"${order}"`), slug)
  assert.match(
    read(`${OVERLAY}/patterns/section-articles-latest-latest-nsub.php`),
    /"wpJaEssenceLabels":"Health,Fashion"/
  )
})

test('the header keeps its 123px row with Subscribe from 768px and the search icon is the source 20px one', () => {
  const css = read(`${OVERLAY}/assets/css/wp-ja-essence.css`)
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 991px\) \{[^@]*min-height: 123px/)
  assert.match(css, /\.je-subscribe \{ display: block; order: 3;/)
  assert.match(css, /\.je-search \.wp-block-search__button svg \{ width: 20px; height: 20px;/)
  assert.match(css, /@media \(min-width: 1400px\)/)
})

test('the built theme carries the same scripts, listing rules and blocks as the overlay', () => {
  for (const rel of [
    'assets/js/wp-ja-essence.js',
    'assets/js/wp-ja-essence-dark.js',
    'inc/extra.php',
    'patterns.map.json'
  ]) {
    const overlay = rel === 'patterns.map.json' ? null : read(`${OVERLAY}/${rel}`)
    if (overlay !== null) assert.equal(read(`src/${SLUG}/${rel}`), overlay, rel)
  }
  const map = JSON.parse(read(`${OVERLAY}/patterns.map.json`))
  assert.equal(map.views.author.block, 'wp-ja-essence/authors')
  assert.equal(map.views.tag.block, 'wp-ja-essence/tagged-list')
  const php = read(`${OVERLAY}/inc/extra.php`)
  for (const block of ['wp-ja-essence/authors', 'wp-ja-essence/tagged-list'])
    assert.ok(php.includes(`'${block}'`), `${block} is registered`)
  assert.match(php, /register_taxonomy_for_object_type\( 'category', 'page' \)/)
  assert.match(php, /'blog-normal'/)
})

test('the footer names WordPress and the GPL, and the Contact form has the source fields and no consent gate', {
  skip: DOSSIER.skip
}, () => {
  const footer = read(`${OVERLAY}/parts/footer.html`)
  assert.doesNotMatch(footer, /Joomla/i)
  assert.match(footer, /WordPress is Free Software released under the GNU General Public License\./)
  const reconcile = readFileSync(path.join(DOSSIER.dir, 'tools/reconcile.php'), 'utf8')
  const contactForm = reconcile.slice(
    reconcile.indexOf('[text* your-name'),
    reconcile.indexOf('[submit "Send message"]')
  )
  assert.ok(contactForm.length > 40, 'the Contact form is found in the reconcile script')
  assert.doesNotMatch(
    contactForm,
    /\[acceptance/,
    'no consent box: the source has none and Send is never disabled'
  )
  for (const tag of [
    '[text* your-name',
    '[email* your-email',
    '[text* your-subject',
    '[textarea* your-message',
    '[checkbox send-copy use_label_element "Send a copy to yourself"]',
    '[submit "Send message"]'
  ])
    assert.ok(reconcile.includes(tag), tag)
  assert.doesNotMatch(reconcile, /\[checkbox\*/, 'the copy box is optional')
  assert.match(reconcile, /'recipient'\s*=> '\[your-email\]'/)
})

/* ---------- the lens fixes of 1.0.3 (second round): what a rebuild must keep ---------- */

test("the single template carries the sidebar, the share/navigation footer and the author's latest articles", () => {
  const single = read(`${OVERLAY}/templates/single.html`)
  for (const part of [
    'wp-ja-essence/article-footer',
    'wp-ja-essence/author-latest',
    'wp-ja-essence/section-newsletter',
    'wp-ja-essence/single-side-social',
    'wp-ja-essence/single-side-trending'
  ])
    assert.ok(single.includes(part), `single.html places ${part}`)
  assert.equal(
    single.split('wp-ja-essence/author-latest').length - 1,
    1,
    "the author's latest block is placed once"
  )
})

test('the newsletter form has an email field, a terms box and a message that never moves the box', {
  skip: DOSSIER.skip
}, () => {
  const reconcile = readFileSync(path.join(DOSSIER.dir, 'tools/reconcile.php'), 'utf8')
  assert.match(reconcile, /\[email\* your-email|\[email\* newsletter-email|\[email\*? [a-z-]*email/)
  assert.match(reconcile, /\[acceptance newsletter-terms id:je-nl-terms\]/)
  const css = unworn(read(`${OVERLAY}/assets/css/je-detail.css`))
  assert.match(css, /\.je-nl \.wpcf7-not-valid-tip \{ position: absolute;/)
})

test('pictures load at once: no lazy attribute anywhere, so a full-page capture never shows an empty box', () => {
  const php = read(`${OVERLAY}/inc/extra.php`)
  assert.match(php, /add_filter\( 'wp_lazy_loading_enabled', '__return_false' \)/)
  assert.doesNotMatch(php.replace(/\/\*\*[\s\S]*?\*\//g, ''), /loading['"]?\s*(=>|=)\s*['"]lazy/)
})

test('the Tagged items list has one row per filed article, copies included, ties in source order', () => {
  const php = read(`${OVERLAY}/inc/extra.php`)
  const body = php.slice(
    php.indexOf('function wp_ja_essence_render_tagged_list'),
    php.indexOf('A Shortcode block in a template')
  )
  assert.doesNotMatch(body, /wp_ja_essence_listing_args/, 'the copies are not filtered out')
  assert.match(body, /\$a\['src'\] <=> \$b\['src'\]/)
})

test('module titles keep the spaced hyphen the source prints', () => {
  const php = read(`${OVERLAY}/inc/extra.php`)
  assert.match(php, /add_filter\( 'render_block_core\/heading', 'wp_ja_essence_heading_hyphen' \)/)
  assert.match(php, /' &#45; '/)
})

test("the masonry script fills every list row by row, as the source's Isotope does (horizontalOrder), and Style 1 only from 768px to 991px", () => {
  const js = read(`${OVERLAY}/assets/js/wp-ja-essence.js`)
  assert.match(js, /body\.je-slug-category-style-3 \.tracy-query \.tracy-grid/)
  assert.match(js, /const rowOrder = true/)
  assert.match(js, /tabletOnly && \(innerWidth < 768 \|\| innerWidth > 991\)/)
})

test('Bootstrap lg columns stack below 992px, as in the source', () => {
  const css = read(`${OVERLAY}/assets/css/wp-ja-essence.css`)
  assert.match(css, /@media \(max-width: 991px\) \{ \.je-prose \.row:has\(> \.col-lg-4\)/)
})

test('machine-round parity: the tagged rows, article arrows, category tiles and account links are drawn the way the source structures them', () => {
  const php = read(`${OVERLAY}/inc/extra.php`)
  // a row is a block heading holding the link (the source's h3.item-tag-title), never an inline-only <li>
  assert.match(php, /<li><h3 class="je-taglist__title"><a href=/)
  // the prev/next arrows are drawn by CSS, so the link text is just "Prev" / "Next" like the source
  assert.match(php, /<span class="je-pagenav__arrow" aria-hidden="true"><\/span>/)
  assert.doesNotMatch(php, /&lsaquo;|&rsaquo;/)
  // the category tile name is a block, and the sign-in links are separate blocks (one per link)
  assert.match(php, /<div class="je-cattiles__name"><a href=/)
  assert.match(php, /<div class="je-acct__links"><div class="je-acct__link"><a href=/)
})

test('machine-round parity: nothing overflows a 320px or 360px screen', () => {
  const css = read(`${OVERLAY}/assets/css/wp-ja-essence.css`)
  // the footer action keeps its 18px padding inside the column (content-box + a full-width max would run 36px over)
  assert.match(
    css,
    /\.je-footer__action \{ box-sizing: content-box; width: max-content; max-width: calc\(100% - 36px\);/
  )
})

test('machine-round parity: dark theme keeps the source colours of the newsletter field and the highlight', () => {
  const css = unworn(read(`${OVERLAY}/assets/css/je-detail.css`))
  assert.match(
    css,
    /:root\[data-theme="dark"\] \.je-nl input\[type="email"\] \{ background: #222a3b; color: #c2c9d6; \}/
  )
  assert.match(
    css,
    /:root\[data-theme="dark"\] \.je-prose \.t4-typo-example mark \{ background: #fcf8e3; color: #000; \}/
  )
})

test('lens-round parity: menu geometry is one rule for every page, Jost has no 500 face, the password strength is a native meter', () => {
  const detail = unworn(read(`${OVERLAY}/assets/css/je-detail.css`))
  const base = read(`${OVERLAY}/assets/css/wp-ja-essence.css`)
  const js = read(`${OVERLAY}/assets/js/${SLUG}.js`)
  // item = 18px + label + 22px caret slot + 18px, on every page (the single-row header included)
  assert.match(
    detail,
    /body \.je-header \.je-nav \.wp-block-navigation__container > li > a \{ padding: 8px 0 8px 18px;/
  )
  assert.doesNotMatch(
    detail,
    /body\.je-hdr-two \.je-header \.je-nav \.wp-block-navigation__container > li > a \{ padding/
  )
  // the source loads Jost at 400 only, so a 500 heading is drawn with the 400 face there
  assert.doesNotMatch(base, /@font-face \{ font-family: "Jost"[^}]*font-weight: 500/)
  assert.match(js, /document\.createElement\('meter'\)/)
  assert.match(js, /className = 'je-acct__cal'/)
})

test('lens-round parity: the 404 card, the author grid and the Contact container follow the source boxes', () => {
  const css = unworn(read(`${OVERLAY}/assets/css/je-detail.css`))
  assert.match(css, /\.je-404__card \{ width: 100%; max-width: 900px; padding: 100px 36px;/)
  assert.match(css, /\.je-authors \{ padding-top: 0; \}/)
  assert.match(css, /\.je-page--contact \.je-narrow \{ max-width: 1164px; \}/)
})

test('the hidden date input stays out of the layout and the tag chip is the link itself', () => {
  const css = unworn(read(`${OVERLAY}/assets/css/je-detail.css`))
  // out of flow, 1px, beating `.je-acct__pw input` (width and height rules) — the page must not scroll sideways
  assert.match(
    css,
    /\.je-acct__pw input\.je-acct__datepicker[^{]*\{[^}]*position: absolute;[^}]*width: 1px;[^}]*height: 1px;/
  )
  // the calendar button takes the height of the input beside it
  assert.match(css, /\.je-acct__cal \{[^}]*height: auto; align-self: stretch;/)
  // source `a.tag-cloud-link` carries the grey chip; the list item does not
  assert.match(
    css,
    /\.wp-block-tag-cloud li a\.tag-cloud-link \{ background: light-dark\(#f8f8ff, #222a3b\); \}/
  )
})

/* ---------- 1.0.6: current-item marks and the colours the source paints ---------- */

test('the menu marks the item the visitor is under and the footer paints it, as the source does (1.0.6)', () => {
  for (const base of ['overlays', 'src']) {
    const php_ = read(`${base}/${SLUG}/inc/extra.php`)
    assert.match(php_, /add_filter\( 'render_block_core\/navigation-link', 'wp_ja_essence_menu_current'/)
    assert.match(php_, /WP_JA_ESSENCE_SEARCH_PATHS\[0\]/, 'the search results are the Smart Search item')
    assert.match(
      php_,
      /str_starts_with\( \$here, \$link \. '\/' \)/,
      'an article under a menu path is that item'
    )
    const css = unworn(read(`${base}/${SLUG}/assets/css/je-detail.css`))
    assert.match(
      css,
      /\.je-footer-nav \.current-menu-item > \.wp-block-navigation-item__content \{ color: light-dark\(#4d6bff, #7d93ff\)/
    )
    assert.match(
      css,
      /li:not\(\.current-menu-item[^)]*\) > :is\(a, \.wp-block-navigation__submenu-icon\) \{ color: light-dark\(#212529, #c2c9d6\)/
    )
    assert.match(css, /\.badge\.bg-primary \{ background: #0d6efd/)
    assert.match(
      css,
      /\.je-site-name:not\(\.je-site-name--logo\) \{ font-size: 16px; font-weight: 600; letter-spacing: 1\.5px/
    )
  }
})

// 1.0.9 (T29, Q9): the header keeps the name as text; the footer logo is a light/dark pair of Site Logo blocks, no
// picture is inverted any more, and the copyright names the site.
for (const base of ['overlays', 'src']) {
  test(`${base}: footer logo pair, no invert filter, copyright names the site`, () => {
    const footer = read(`${base}/wp-ja-essence/parts/footer.html`)
    const header = read(`${base}/wp-ja-essence/parts/header.html`)
    assert.match(header, /<!-- wp:site-title \{"level":0,"className":"je-site-name"\} \/-->/)
    assert.doesNotMatch(header, /wp:site-logo/)
    assert.match(footer, /"className":"je-footer__logo je-footer__logo--light"/)
    assert.match(footer, /"className":"je-footer__logo je-footer__logo--dark"/)
    assert.doesNotMatch(read(`${base}/wp-ja-essence/assets/css/je-home.css`), /invert\(/)
    assert.match(footer, /Copyright © \{year\} \{site\.title\}\. All Rights Reserved\./)
    assert.doesNotMatch(footer, /JA Essence/)
  })
}

// 1.0.9: every tab names the site — the page title then the site name; the home tab is the site name alone.
for (const base of ['overlays', 'src']) {
  test(`${base}: the document title keeps the site name and no demo wording`, () => {
    const php = read(`${base}/wp-ja-essence/inc/extra.php`)
    assert.doesNotMatch(php, /Minimal Blogging Template/)
    assert.doesNotMatch(php, /unset\( \$parts\['site'\]/)
    assert.match(php, /return esc_html\( get_bloginfo\( 'name' \) \);/)
  })
}

/* ---------- PAGE-4: a tile never leads to a page the customer unticked ---------- */

const TILES_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
class WP_Post { public $ID; public $post_status; function __construct($id, $status) { $this->ID = $id; $this->post_status = $status; } }
$GLOBALS['pages'] = $in['pages'];
function add_filter() {} function add_action() {}
function esc_attr($s) { return htmlspecialchars($s); } function esc_html($s) { return htmlspecialchars($s); } function esc_url($s) { return $s; }
function sanitize_title($s) { return strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $s), '-')); }
function get_theme_file_uri($f) { return '/theme/' . $f; }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function get_page_by_path($path) { $p = $GLOBALS['pages'][$path] ?? null; return $p ? new WP_Post($p['id'], $p['status']) : null; }
function get_post_status($post) { return $post instanceof WP_Post ? $post->post_status : false; }
// WordPress gives a page that is not published its plain address, which answers 404 to a visitor.
function get_permalink($post) { return 'publish' === $post->post_status ? '/page-' . $post->ID . '/' : '/?page_id=' . $post->ID; }
eval($in['code']);
echo wp_ja_essence_category_tiles($in['content'], array('attrs' => array('className' => 'je-catrow je-cattiles')));
`

test('a category tile whose page the customer unticked leads to the category itself, never to the hidden page (PAGE-4)', {
  skip: PHP_SKIP
}, () => {
  // Measured 10/10/2026 on dev (g55-ess-wp-full, 1.0.10): Category Style 1 unticked (drafted), the Health tile of home 2
  // still opened /?page_id=137, which answers 404.
  const content =
    '<ul class="wp-block-categories-list wp-block-categories"><li class="cat-item cat-item-9"><a href="/category/health/">Health</a> (12)</li>' +
    '<li class="cat-item cat-item-10"><a href="/category/design/">Design</a> (5)</li></ul>'
  const pages = {
    'category/category-style-1': { id: 137, status: 'draft' },
    'category/category-style-2': { id: 138, status: 'publish' }
  }
  for (const base of ['overlays', 'src']) {
    const file = `${base}/${SLUG}/inc/extra.php`
    const source = read(file)
    const code = ['wp_ja_essence_live_page', 'wp_ja_essence_category_tiles']
      .map((name) => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`))?.[0])
      .filter(Boolean)
      .join('\n')
    assert.match(
      code,
      /function wp_ja_essence_category_tiles\(/,
      `${file}: no wp_ja_essence_category_tiles()`
    )
    const [out] = php.run([{ args: ['-r', TILES_PROBE], input: JSON.stringify({ code, pages, content }) }])
    assert.equal(out.status, 0, `${file}: ${out.stderr}${out.stdout}`)
    assert.doesNotMatch(out.stdout, /page_id=137/, `${file}: the unticked page is not linked`)
    assert.match(out.stdout, /je-cat--health"><a class="je-cattiles__img" href="\/category\/health\/"/)
    assert.match(out.stdout, /<a href="\/category\/health\/">Health \(12\)<\/a>/)
    assert.match(out.stdout, /href="\/page-138\/"/, `${file}: a published page is still the tile's link`)
  }
})

test('the category tiles keep their pictures when the categories are named in another language (1.0.12)', {
  skip: PHP_SKIP
}, () => {
  // Measured 11/10/2026 on dev (g58-ess-wp-full, 1.0.11, Vietnamese): the categories were renamed "Sức khỏe", "Thiết kế"…, the
  // tiles were matched by name, none matched, and home 2 printed the plain category list with no picture.
  const names = [
    ['lifestyle', 'Phong cách sống', 5],
    ['blog-health', 'Sức khỏe', 12],
    ['resources', 'Tài nguyên', 6],
    ['blog-design', 'Thiết kế', 9],
    ['blog-fashion', 'Thời trang', 8]
  ]
  const content =
    '<ul class="wp-block-categories-list wp-block-categories">' +
    names
      .map(
        ([slug, name, n], i) =>
          `<li class="cat-item cat-item-${i + 5}"><a href="https://x.test/topic/blog/${slug}/">${name}</a> (${n})\n</li>`
      )
      .join('') +
    '</ul>'
  const pages = {
    'category/category-style-1': { id: 137, status: 'draft' },
    'category/category-style-2': { id: 138, status: 'publish' }
  }
  for (const base of ['overlays', 'src']) {
    const file = `${base}/${SLUG}/inc/extra.php`
    const source = read(file)
    const code = ['wp_ja_essence_live_page', 'wp_ja_essence_category_tiles']
      .map((name) => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`))?.[0])
      .filter(Boolean)
      .join('\n')
    const [out] = php.run([{ args: ['-r', TILES_PROBE], input: JSON.stringify({ code, pages, content }) }])
    assert.equal(out.status, 0, `${file}: ${out.stderr}${out.stdout}`)
    assert.equal((out.stdout.match(/class="je-cattiles__img"/g) ?? []).length, 5, `${file}: ${out.stdout}`)
    // The source's order, each with its own picture, its translated name and its count.
    const order = [...out.stdout.matchAll(/je-cat--([a-z]+)">.*?category-(\d)\.jpg/g)].map(
      (m) => `${m[1]}:${m[2]}`
    )
    assert.deepEqual(order, ['health:1', 'design:2', 'fashion:3', 'resources:5', 'lifestyle:4'])
    assert.match(out.stdout, /<a href="https:\/\/x\.test\/topic\/blog\/blog-health\/">Sức khỏe \(12\)<\/a>/)
    assert.match(out.stdout, /href="\/page-138\/"/)
    assert.doesNotMatch(out.stdout, /page_id=137/)
  }
})

/* ---------- LANG-2: every word the theme prints reads in the language the site is made in ---------- */

/** The WordPress locales of the languages the site question offers (apps/tracy-web/src/questions/languages.json), English aside. */
const SITE_LOCALES = ['de_DE', 'es_ES', 'fr_FR', 'it_IT', 'nl_NL', 'vi', 'zh_CN', 'zh_TW']

const L10N_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$out = array();
foreach ($in['files'] as $locale => $file) {
  $data = is_readable($file) ? include $file : null;
  $out[$locale] = is_array($data) ? array('domain' => $data['domain'] ?? null, 'messages' => $data['messages'] ?? array()) : null;
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`

test('every word the theme prints through its domain has a translation in each language a site can be made in (LANG-2)', {
  skip: PHP_SKIP
}, () => {
  // Measured 10/10/2026 on dev (g55-ess-wp-full, 1.0.10, Vietnamese): the error page read "Page not found" and "An error has
  // occurred while processing your request." — the words went through the text domain, but the theme shipped no translation.
  for (const base of ['overlays', 'src']) {
    const dir = `${php.root}/${base}/${SLUG}/`
    const words = new Set()
    const walk = (rel) => {
      for (const name of readdirSync(new URL(rel, here))) {
        const sub = `${rel}${name}`
        if (statSync(new URL(sub, here)).isDirectory()) {
          if (!['docs', 'languages', 'assets', 'styles'].includes(name)) walk(`${sub}/`)
        } else if (/\.(php|html)$/.test(name))
          for (const m of read(sub).matchAll(
            /\b(?:__|_e|esc_html__|esc_html_e|esc_attr__|esc_attr_e)\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'wp-ja-essence'/g
          ))
            words.add(m[1].replace(/\\'/g, "'"))
      }
    }
    walk(`${base}/${SLUG}/`)
    assert.ok(
      words.has('Page not found') && words.size > 100,
      `${base}: the theme's words were found (${words.size})`
    )
    assert.match(
      read(`${base}/${SLUG}/inc/extra.php`),
      /load_theme_textdomain\( 'wp-ja-essence', get_template_directory\(\) \. '\/languages' \)/
    )
    const files = Object.fromEntries(SITE_LOCALES.map((l) => [l, `${dir}languages/${l}.l10n.php`]))
    const [out] = php.run([{ args: ['-r', L10N_PROBE], input: JSON.stringify({ files }) }])
    assert.equal(out.status, 0, `${base}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    for (const locale of SITE_LOCALES) {
      assert.ok(got[locale], `${base}: languages/${locale}.l10n.php`)
      assert.equal(got[locale].domain, 'wp-ja-essence')
      const missing = [...words].filter(
        (w) => typeof got[locale].messages[w] !== 'string' || got[locale].messages[w] === ''
      )
      assert.deepEqual(missing, [], `${base} ${locale}: words with no translation`)
      assert.ok(
        got[locale].messages['%d Article\u0000%d Articles'],
        `${base} ${locale}: the article count plural`
      )
    }
    assert.equal(got.vi.messages['Page not found'], 'Không tìm thấy trang')
  }
})

const WORDS_PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
define('ABSPATH', '/');
$messages = (include $in['l10n'])['messages'];
$GLOBALS['filters'] = array(); $GLOBALS['inline'] = '';
function add_filter($hook, $fn) { $GLOBALS['filters'][$hook][] = $fn; } function add_action($hook, $fn) { add_filter($hook, $fn); }
function __($text, $domain) { global $messages; return 'wp-ja-essence' === $domain && isset($messages[$text]) ? $messages[$text] : $text; }
function esc_html($s) { return htmlspecialchars($s); } function esc_attr($s) { return htmlspecialchars($s); }
function wp_json_encode($v) { return json_encode($v, JSON_UNESCAPED_UNICODE); }
function wp_add_inline_script($handle, $code, $where) { $GLOBALS['inline'] .= "$handle|$where|$code"; }
$GLOBALS['styles'] = ''; function wp_add_inline_style($handle, $css) { $GLOBALS['styles'] .= "$handle|$css"; }
function run($hook, $value) { foreach ($GLOBALS['filters'][$hook] ?? array() as $fn) $value = $fn($value); return $value; }
include $in['file'];
$out = array('blocks' => array(), 'markup' => array());
foreach ($in['blocks'] as $b) $out['blocks'][] = run('render_block_data', $b);
foreach ($in['markup'] as $m) $out['markup'][] = run('render_block_core/' . $m[0], $m[1]);
$out['form'] = run('wpcf7_form_elements', $in['form']);
run('wp_enqueue_scripts', null);
$out['inline'] = $GLOBALS['inline'];
$out['styles'] = $GLOBALS['styles'];
echo json_encode($out, JSON_UNESCAPED_UNICODE);
`

test("the theme's interface words in its blocks' attributes and markup read in the site's language (LANG-2, 1.0.12)", {
  skip: PHP_SKIP
}, () => {
  // Measured 11/10/2026 on dev (g58-ess-wp-full, 1.0.11, Vietnamese): "By", "Read more …", "Search", "Menu", the header
  // buttons' labels and the contact form's "Send a copy to yourself" were English: block attributes and markup, which no
  // text domain reaches.
  const input = {
    blocks: [
      { blockName: 'core/post-author-name', attrs: { prefix: 'By ', className: 'je-meta__author' } },
      { blockName: 'core/post-author-name', attrs: { prefix: 'Written by ' } },
      { blockName: 'core/post-excerpt', attrs: { moreText: 'Read more ...' } },
      { blockName: 'core/read-more', attrs: { content: 'Read more ...' } },
      { blockName: 'core/search', attrs: { label: 'Search', buttonText: 'Search', showLabel: false } },
      { blockName: 'core/paragraph', attrs: { prefix: 'By ' } },
      // Every spelling the 1.0.12 release database carries (g59-ess-wp-full, 10/10/2026: "Read more" on nine pages).
      { blockName: 'core/post-excerpt', attrs: { moreText: 'Read more' } },
      { blockName: 'core/post-excerpt', attrs: { moreText: 'Read More…' } },
      { blockName: 'core/read-more', attrs: { content: 'Read more...' } },
      { blockName: 'core/post-author-name', attrs: { prefix: 'By' } },
      { blockName: 'core/post-excerpt', attrs: { moreText: 'Read the recipe' } }
    ],
    markup: [
      ['paragraph', '<p class="je-drawer__menu">Menu</p>'],
      ['paragraph', '<p class="other">Menu</p>'],
      [
        'html',
        '<button type="button" class="je-drawer-toggle" aria-label="Open the menu"></button><button class="je-theme-toggle" aria-label="Theme: light. Switch to dark"></button>'
      ],
      ['html', '<button type="button" class="je-drawer-close" aria-label="Close the menu">&times;</button>']
    ],
    form: '<span class="wpcf7-list-item"><input type="checkbox" name="send-copy[]" value="Send a copy to yourself" /><span class="wpcf7-list-item-label">Send a copy to yourself</span></span>'
  }
  for (const base of ['overlays', 'src']) {
    const dir = `${php.root}/${base}/${SLUG}/`
    const [out] = php.run([
      {
        args: ['-r', WORDS_PROBE],
        input: JSON.stringify({ ...input, file: `${dir}inc/words.php`, l10n: `${dir}languages/vi.l10n.php` })
      }
    ])
    assert.equal(out.status, 0, `${base}: ${out.stderr}${out.stdout}`)
    const got = JSON.parse(out.stdout)
    assert.deepEqual(
      got.blocks.map((b) => b.attrs),
      [
        { prefix: 'Bởi ', className: 'je-meta__author' },
        { prefix: 'Written by ' },
        { moreText: 'Đọc thêm ...' },
        { content: 'Đọc thêm ...' },
        { label: 'Tìm kiếm', buttonText: 'Tìm kiếm', showLabel: false },
        { prefix: 'By ' },
        { moreText: 'Đọc thêm' },
        { moreText: 'Đọc thêm…' },
        { content: 'Đọc thêm...' },
        { prefix: 'Bởi' },
        { moreText: 'Read the recipe' }
      ],
      `${base}: only the theme's own English attributes change`
    )
    assert.deepEqual(got.markup, [
      '<p class="je-drawer__menu">Trình đơn</p>',
      '<p class="other">Menu</p>',
      '<button type="button" class="je-drawer-toggle" aria-label="Mở trình đơn"></button><button class="je-theme-toggle" aria-label="Giao diện: sáng. Chuyển sang tối"></button>',
      '<button type="button" class="je-drawer-close" aria-label="Đóng trình đơn">&times;</button>'
    ])
    // The box's value, which the mail reads, stays; only its label changes.
    assert.match(got.form, /value="Send a copy to yourself"/)
    assert.match(got.form, /wpcf7-list-item-label">Gửi một bản sao cho chính bạn</)
    assert.equal(
      got.inline,
      'wp-ja-essence-dark|before|window.wpJaEssenceWords={"light":"Giao diện: sáng. Chuyển sang tối","dark":"Giao diện: tối. Chuyển sang sáng"};'
    )
    // The word the style sheets print before an author, set in the site's language (1.0.13).
    assert.equal(got.styles, 'wp-ja-essence|:root{--wp-ja-essence-by:"Bởi";}')
  }
})

test('the dark switch writes the words the theme gives it, and English without them', () => {
  const words = { light: 'Giao diện: sáng. Chuyển sang tối', dark: 'Giao diện: tối. Chuyển sang sáng' }
  const run = (given) => {
    const labels = []
    const document = {
      cookie: 'tracy_theme=dark',
      readyState: 'complete',
      documentElement: { setAttribute() {}, getAttribute: () => null, removeAttribute() {} },
      querySelectorAll: () => [{ setAttribute: (k, v) => k === 'aria-label' && labels.push(v) }],
      addEventListener() {}
    }
    const window = { matchMedia: () => ({ matches: false, addEventListener() {} }), ...given }
    new Function('document', 'window', 'location', read(`${OVERLAY}/assets/js/${SLUG}-dark.js`))(
      document,
      window,
      {
        search: '',
        protocol: 'https:'
      }
    )
    return labels.at(-1)
  }
  assert.equal(run({ wpJaEssenceWords: words }), words.dark)
  assert.equal(run({}), 'Theme: dark. Switch to light')
})

/* ---------- the logo's alternative text (PHP, the built theme against the fake WordPress) ---------- */

// Measured 11/10/2026 on dev (g56-ess-wp-blank, About blank, no logo given): the footer's light logo read the site name
// ("Tamarind Bakery", core's fallback for a picture with no alternative text) and the dark one "JA Essence" on 31 pages,
// because the release's dark logo picture (attachment 307, option tracy_logo_dark) carries that alternative text.
let fakePhp
before(() => {
  if (!PHP_SKIP)
    fakePhp = startPhp({
      files: { cwd: fileURLToPath(here), paths: [`src/${SLUG}`, 'test/fake-wordpress.php'] }
    })
})
after(() => fakePhp?.stop())

test("every Site Logo's alternative text is the site name, whatever its picture was given in the demo", {
  skip: PHP_SKIP
}, () => {
  const input = JSON.stringify({
    theme: `${fakePhp.root}/src/${SLUG}`,
    options: { blogname: 'Tamarind Bakery' },
    render: [
      { filter: 'get_custom_logo_image_attributes', value: { class: 'custom-logo', alt: 'JA Essence' } },
      { filter: 'get_custom_logo_image_attributes', value: { class: 'custom-logo', alt: '' } }
    ]
  })
  const [out] = fakePhp.run([{ args: [`${fakePhp.root}/test/fake-wordpress.php`], input }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}${out.stdout}`)
  assert.deepEqual(JSON.parse(out.stdout), [
    { class: 'custom-logo', alt: 'Tamarind Bakery' },
    { class: 'custom-logo', alt: 'Tamarind Bakery' }
  ])
})

/* ---------- LANG-2 decision (6): a language Jost cannot draw gets the theme's own replacement heading font ---------- */

/** Every Vietnamese letter outside Latin-1 plus the Latin-1 vowels with marks Vietnamese uses. */
const VI_LETTERS = [...'ăâđêôơưĂÂĐÊÔƠƯàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ'].map(
  (c) => /** @type {number} */ (c.codePointAt(0))
)

/** The @font-face rules of a stylesheet: family, weight, file and unicode-range. */
function faces(css) {
  return [...css.matchAll(/@font-face \{([^}]*)\}/g)].map(([, body]) => ({
    family: /font-family: "([^"]+)"/.exec(body)?.[1],
    weight: /font-weight: (\d+)/.exec(body)?.[1],
    file: /url\("\.\.\/fonts\/([^"]+)"\)/.exec(body)?.[1],
    range: /unicode-range: ([^;]+);/.exec(body)?.[1] ?? null
  }))
}

test('a Vietnamese site draws every heading in Be Vietnam Pro, a face the theme ships, and its body in Noto Serif with the Vietnamese letters (decision 6)', async () => {
  const { fontCovers } = await import('../../../../apps/tracy-web/src/lib/font-glyphs.js')
  const base = read(`${OVERLAY}/assets/css/wp-ja-essence.css`)
  const all = faces(base)
  const fontBytes = (file) => new Uint8Array(readFileSync(new URL(`${OVERLAY}/assets/fonts/${file}`, here)))
  // one Be Vietnam Pro face for each weight Jost is declared in, each able to draw every Vietnamese letter
  const jostWeights = all.filter((f) => f.family === 'Jost').map((f) => f.weight)
  for (const weight of jostWeights) {
    const face = all.find((f) => f.family === 'Be Vietnam Pro' && f.weight === weight)
    assert.ok(face, `Be Vietnam Pro ${weight} is declared`)
    const covered = fontCovers(fontBytes(face.file), VI_LETTERS)
    assert.equal(covered?.size, VI_LETTERS.length, `be-vietnam-pro ${weight} draws every Vietnamese letter`)
  }
  // the body font: its latin faces plus the Vietnamese faces of the same family draw every letter, at 400 and 700
  for (const weight of ['400', '700']) {
    const own = all.filter((f) => f.family === 'Noto Serif' && f.weight === weight)
    assert.ok(
      own.some((f) => f.range),
      `Noto Serif ${weight} has a Vietnamese face cut by unicode-range`
    )
    const covered = new Set(own.flatMap((f) => [...(fontCovers(fontBytes(f.file), VI_LETTERS) ?? [])]))
    assert.equal(covered.size, VI_LETTERS.length, `Noto Serif ${weight} draws every Vietnamese letter`)
  }
  // the switch is keyed on the page language, so it works on any host, with or without Tracy
  assert.match(
    base,
    /html:lang\(vi\),\s*html:lang\(vi\) body \{[^}]*--je-font-display: "Be Vietnam Pro";[^}]*--wp--preset--font-family--display: "Be Vietnam Pro", sans-serif;/
  )
})

test('no rule of the theme names Jost except through the heading-font slot, so the replacement reaches every heading and label (decision 6)', () => {
  const dir = new URL(`${OVERLAY}/assets/css/`, here)
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
    const css = readFileSync(new URL(name, dir), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@font-face \{[^}]*\}/g, '')
      .replaceAll('var(--je-font-display, Jost)', '')
      .replaceAll('var(--wp--preset--font-family--display, Jost', '')
    assert.doesNotMatch(css, /\bJost\b/, `${name} names Jost outside the slot`)
  }
})

test("the theme's own sheets read the design-system slot, the default colours kept as fallbacks (1.0.18)", () => {
  for (const base of ['overlays', 'src']) {
    const css = read(`${base}/${SLUG}/assets/css/je-detail.css`)
    assert.ok((css.match(/var\(--ds-c-/g) ?? []).length > 50, `${base}: je-detail.css reads the slot`)
    assert.doesNotMatch(css, /var\(--ds-c-[\w-]+\)/, `${base}: every slot read keeps a fallback`)
  }
})
