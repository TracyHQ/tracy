import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

import { apply } from '../lib/index.js'
import { BROWSER_SCRIPT } from '../src/host/exec.mjs'
import { siteToolDescription } from '../src/host/surface.mjs'
import {
  AGENT_HERO_BY,
  cdpRule,
  EM_PX,
  EM_PY,
  emHeroCascade,
  heroCascade,
  SLOT_BUTTON
} from './look-cascade-fixture.mjs'
import {
  STYLE_DEFAULT_PROPS,
  STYLE_MAX_PROPS,
  describeTarget,
  findTarget,
  resolveStyles,
  styleAnswer,
  styleRequest,
  viewportOf
} from '../src/host/look-style.mjs'

// 🔒 `page.look {style}` (suite v6 #3): the element's computed look and the var(--token) chain behind
// it, read from the browser's own cascade. The `look-style/*.json` fixtures are that cascade as
// Chromium's CDP answered it on the three bench sites (benchwp02, benchjoomla02, benchemdash02,
// 28/09/2026, read-only GETs), minimized to the asked properties and the tokens they reach — so the
// chains asserted below are the ones a designer gets on the stand.
const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'look-style')
const load = (/** @type {string} */ name) => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'))
const resolve = (/** @type {any} */ fx) =>
  /** @type {any} */ (
    resolveStyles({ props: fx.props, info: fx.info, matched: fx.matched, painter: fx.painter })
  )

// ── what a call may ask ──────────────────────────────────────────────────────────────────────────

test('styleRequest: an element by its words or a selector, the props (default five), the oracle viewports', () => {
  assert.deepEqual(styleRequest({ text: '  See   our capabilities ' }), {
    ok: true,
    req: { text: 'See our capabilities', nth: 0, props: [...STYLE_DEFAULT_PROPS], viewport: 'desktop' }
  })
  assert.deepEqual(styleRequest('Request a quote'), {
    ok: true,
    req: { text: 'Request a quote', nth: 0, props: [...STYLE_DEFAULT_PROPS], viewport: 'desktop' }
  })
  assert.deepEqual(
    styleRequest({ selector: '.btn-primary', nth: '2', prop: 'Background-Color', viewport: 'mobile' }),
    {
      ok: true,
      req: { selector: '.btn-primary', nth: 2, props: ['background-color'], viewport: 'mobile' }
    }
  )
  assert.deepEqual(styleRequest({ text: 'x', props: 'color, --brand-orange' }).ok, true)
  for (const [asked, why] of /** @type {[unknown, RegExp][]} */ ([
    [{}, /names no element/],
    [true, /names no element/],
    [{ text: 'a', selector: '.b' }, /not both/],
    [{ text: 'a', nth: -1 }, /nth/],
    [{ text: 'a', props: ['color;', 'x'] }, /property names/],
    [{ text: 'a', props: Array.from({ length: STYLE_MAX_PROPS + 1 }, (_, i) => `p${i}`) }, /at most/],
    [{ text: 'a', viewport: 'sideways' }, /viewport/],
    [{ text: 'a', viewport: 12 }, /viewport/]
  ])) {
    const r = /** @type {any} */ (styleRequest(asked))
    assert.equal(r.ok, false, JSON.stringify(asked))
    assert.equal(r.answer.code, 'BAD_STYLE')
    assert.match(r.answer.error, why)
    assert.ok(r.answer.error.length <= 160 && r.answer.next.length <= 200, 'T10 lengths')
  }
})

// 🔒 flow D, 05/10/2026: "390x844", "1440x900", "1280x900" and "phone 390×844" were each refused
// BAD_STYLE — 5 of 55 runs paid 1–2 calls for a viewport whose meaning was never in doubt.
test('viewportOf: a name, a device word or a size, each read at the viewport of its width class', () => {
  for (const [asked, want] of /** @type {[unknown, string | null][]} */ ([
    [undefined, 'desktop'],
    ['desktop', 'desktop'],
    ['mobile', 'mobile'],
    ['tablet', 'tablet'],
    ['phone', 'mobile'],
    ['Phone', 'mobile'],
    ['iPad', 'tablet'],
    ['laptop', 'desktop'],
    ['390x844', 'mobile'],
    ['390×844', 'mobile'],
    ['phone 390×844', 'mobile'],
    ['768x1024', 'tablet'],
    ['1440x900', 'desktop'],
    ['1280x900', 'desktop'],
    ['375', 'mobile'],
    ['sideways', null],
    [12, null]
  ]))
    assert.equal(viewportOf(asked), want, String(asked))
  for (const asked of ['390x844', 'phone', 'phone 390×844', 'tablet', '1440x900', '1280x900']) {
    const r = /** @type {any} */ (styleRequest({ text: 'Get in touch', viewport: asked }))
    assert.equal(r.ok, true, asked)
  }
  assert.equal(/** @type {any} */ (styleRequest({ text: 'x', viewport: '390x844' })).req.viewport, 'mobile')
  assert.equal(/** @type {any} */ (styleRequest({ text: 'x', viewport: 'tablet' })).req.viewport, 'tablet')
  assert.equal(
    /** @type {any} */ (
      styleAnswer({ info: { el: '<a>' }, props: {} }, { url: 'u', path: '/', viewport: 'tablet' })
    ).viewport,
    'tablet 768×1024'
  )
})

/**
 * A page small enough to read by hand, for the two functions that run IN THE PAGE: elements with
 * classes, ids, own words, a computed style each and a box (none when it or an ancestor is not
 * displayed), and the selector forms those functions use — tag, `.class`, `#id`, `[attr="v"]`,
 * `:nth-of-type(n)`, descendant and child combinators, lists.
 */
function fakePage(/** @type {any} */ spec, /** @type {any[]} */ moreSheets = []) {
  /** @type {any[]} */
  const all = []
  const make = (/** @type {any} */ node, /** @type {any} */ parent) => {
    const el = {
      tagName: node.tag.toUpperCase(),
      id: node.id ?? '',
      className: node.cls ?? '',
      attrs: node.attrs ?? {},
      getAttribute: (/** @type {string} */ n) => (node.attrs ?? {})[n] ?? null,
      style: node.style ?? {},
      parentElement: parent,
      childNodes: /** @type {any[]} */ ([]),
      children: /** @type {any[]} */ ([]),
      // every word under it, shown or not, as a browser's textContent
      get textContent() {
        const words = (/** @type {any} */ e) =>
          e.childNodes.map((/** @type {any} */ n) => (n.nodeType === 3 ? n.nodeValue : words(n))).join(' ')
        return words(el)
      },
      getBoundingClientRect() {
        for (let e = el; e; e = e.parentElement)
          if (e.style.display === 'none') return { width: 0, height: 0 }
        return { width: node.w ?? 120, height: node.h ?? 40 }
      },
      closest(/** @type {string} */ sel) {
        for (let e = el; e; e = e.parentElement) if (matches(e, sel)) return e
        return null
      },
      // as a browser reads it: the words a visitor sees, so none under an element not displayed
      get innerText() {
        const words = (/** @type {any} */ e) =>
          e.childNodes
            .map((/** @type {any} */ n) =>
              n.nodeType === 3 ? n.nodeValue : n.style.display === 'none' ? '' : words(n)
            )
            .join(' ')
        return words(el)
      }
    }
    if (parent) parent.children.push(el)
    all.push(el)
    for (const child of node.kids ?? []) {
      if (typeof child === 'string') el.childNodes.push({ nodeType: 3, nodeValue: child })
      else el.childNodes.push(make(child, el))
    }
    return el
  }
  const classes = (/** @type {any} */ e) => String(e.className).split(/\s+/).filter(Boolean)
  const compound = (/** @type {any} */ e, /** @type {string} */ c) => {
    const m = /^([a-z0-9*]*)((?:[#.][\w-]+|\[[^\]]+\]|:nth-of-type\(\d+\))*)$/i.exec(c)
    if (!m) throw new Error(`fake page: no selector support for "${c}"`)
    if (m[1] && m[1] !== '*' && e.tagName.toLowerCase() !== m[1].toLowerCase()) return false
    for (const part of m[2].match(/[#.][\w-]+|\[[^\]]+\]|:nth-of-type\(\d+\)/g) ?? []) {
      if (part[0] === '#' && e.id !== part.slice(1)) return false
      if (part[0] === '.' && !classes(e).includes(part.slice(1))) return false
      if (part[0] === '[') {
        const a = /^\[([\w-]+)="([^"]*)"\]$/.exec(part)
        if (!a || e.attrs[a[1]] !== a[2]) return false
      }
      if (part.startsWith(':nth')) {
        const kin = e.parentElement
          ? e.parentElement.children.filter((/** @type {any} */ x) => x.tagName === e.tagName)
          : [e]
        if (kin.indexOf(e) + 1 !== Number(/\d+/.exec(part)?.[0])) return false
      }
    }
    return true
  }
  const matches = (/** @type {any} */ e, /** @type {string} */ sel) =>
    sel.split(',').some((one) => {
      const parts = one
        .trim()
        .replace(/\s*>\s*/g, ' > ')
        .split(/\s+/)
      const test = (/** @type {any} */ x, /** @type {number} */ k) => {
        if (!compound(x, parts[k])) return false
        if (k === 0) return true
        if (parts[k - 1] === '>') return x.parentElement ? test(x.parentElement, k - 2) : false
        for (let up = x.parentElement; up; up = up.parentElement) if (test(up, k - 1)) return true
        return false
      }
      return test(e, parts.length - 1)
    })
  const html = make({ tag: 'html', kids: [spec] }, null)
  const body = html.children[0]
  const document = {
    body,
    documentElement: html,
    querySelectorAll: (/** @type {string} */ sel) => all.filter((e) => e !== html && matches(e, sel)),
    createElement: () => ({ getContext: () => null }),
    styleSheets: [
      { href: 'http://site.test/wp-content/themes/t/assets/css/sections.css?ver=1', ownerNode: null },
      {
        href: null,
        ownerNode: { id: '', textContent: ':root{--x:1}\n/*# sourceURL=global-styles-inline-css */' }
      },
      { href: null, ownerNode: { id: 'astro-inline-fonts', textContent: '@font-face{}' } },
      { href: 'https://fonts.example/css?family=A', ownerNode: null },
      ...moreSheets
    ]
  }
  body.querySelectorAll = () => all.filter((e) => e !== html && e !== body)
  const context = {
    document,
    window: {},
    location: { origin: 'http://site.test' },
    URL,
    CSS: { escape: (/** @type {string} */ v) => v, supports: () => false },
    getComputedStyle: (/** @type {any} */ e) => ({
      display: e.style.display ?? 'block',
      visibility: e.style.visibility ?? 'visible',
      opacity: e.style.opacity ?? '1',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      getPropertyValue: (/** @type {string} */ p) =>
        p === 'display' ? (e.style.display ?? 'block') : (e.style[p] ?? '')
    }),
    Reflect
  }
  context.window = context
  vm.createContext(context)
  return {
    find: (/** @type {any} */ q) => vm.runInContext(`(${String(findTarget)})(${JSON.stringify(q)})`, context),
    describe: (/** @type {any} */ el, /** @type {string[]} */ props, /** @type {boolean} */ forSet) => {
      const fn = vm.runInContext(`(${String(describeTarget)})`, context)
      // what CDP hands back is JSON (`returnByValue`): no object of the page's realm crosses over
      return JSON.parse(JSON.stringify(fn.call(el, props, forSet)))
    },
    all,
    selects: matches
  }
}

const HERO = {
  tag: 'body',
  cls: 'home page page-id-42 wp-theme-t',
  kids: [
    { tag: 'header', cls: 'site-header', kids: [{ tag: 'a', cls: 'btn btn-cta', kids: ['Order now'] }] },
    {
      tag: 'main',
      kids: [
        {
          tag: 'section',
          cls: 'wtb-hero',
          kids: [
            { tag: 'a', cls: 'btn btn-primary', kids: ['See what we bake'] },
            {
              tag: 'div',
              cls: 'wtb-actions',
              style: { display: 'none' },
              kids: [{ tag: 'a', cls: 'btn btn-outline', kids: ['Get in touch'] }]
            }
          ]
        },
        {
          tag: 'section',
          cls: 'wtb-band',
          kids: [{ tag: 'a', cls: 'btn btn-primary', kids: ['Talk to us'] }]
        }
      ]
    }
  ]
}

test('🔒 a selector no element matches says whether a stylesheet this page loads holds a rule for it — the check after CSS written for nothing on the page (#1710)', () => {
  const page = fakePage(HERO, [
    {
      href: 'http://site.test/wp-content/themes/t/assets/css/sections.css?ver=2',
      ownerNode: null,
      cssRules: [{ selectorText: '.wtb-hero .btn' }]
    },
    {
      href: 'https://cdn.example/x.css',
      ownerNode: null,
      get cssRules() {
        throw new Error('SecurityError: cross-origin sheet')
      }
    },
    {
      href: null,
      ownerNode: { id: 'wp-custom-css', textContent: '' },
      cssRules: [
        { selectorText: '.a,  .tracy-r7-2255' },
        { conditionText: '(max-width: 767.98px)', cssRules: [{ selectorText: 'header >  .tracy-phone' }] }
      ]
    }
  ])
  const found = String(page.find({ selector: '.tracy-r7-2255' }))
  assert.match(found, /matches 0 elements/)
  assert.match(found, /the page loads a rule for it, in <style id="wp-custom-css">/)
  // inside @media, and the browser's own spacing of a combinator
  assert.match(
    String(page.find({ selector: 'header > .tracy-phone' })),
    /a rule for it, in <style id="wp-custom-css">/
  )
  assert.match(
    String(page.find({ selector: '.wtb-hero  .btn.missing' })),
    /no stylesheet this page loads has a rule for it/
  )
  const none = String(page.find({ selector: '.tracy-written-nowhere' }))
  assert.match(none, /no stylesheet this page loads has a rule for it/)
  const answer = /** @type {any} */ (
    styleAnswer({ error: none, loaded: true }, { path: '/', url: 'x', viewport: 'desktop' })
  )
  assert.equal(answer.ok, false)
  assert.match(answer.error, /no stylesheet this page loads has a rule for it/, 'not cut off')
  assert.match(answer.next, /does not reach this page/)
  assert.ok(answer.next.length <= 200, answer.next)
  const loads = /** @type {any} */ (
    styleAnswer({ error: found, loaded: true }, { path: '/', url: 'x', viewport: 'desktop' })
  )
  assert.match(loads.next, /This page loads that rule/)
})

test('🔒 findTarget + describeTarget: an element hidden on this viewport is found by its exact words and said hidden, not "not found"', () => {
  const page = fakePage(HERO)
  const el = page.find({ text: 'Get in touch' })
  assert.equal(typeof el, 'object', 'found although no visitor sees it')
  assert.equal(el.className, 'btn btn-outline')
  const info = /** @type {any} */ (page.describe(el, ['display'], false))
  assert.equal(info.hidden, 'display:none on <div.wtb-actions>')
  assert.equal(info.unique, undefined, 'page.look asks for no selector')
  // a visible one is still preferred, and a partial match never reaches a hidden element
  assert.equal(page.find({ text: 'See what we bake' }).className, 'btn btn-primary')
  assert.match(String(page.find({ text: 'Get in' })), /no element on this page shows the words "Get in"/)
  assert.equal(
    /** @type {any} */ (page.describe(page.find({ text: 'Talk to us' }), ['display'], false)).hidden,
    false
  )
  const out = /** @type {any} */ (
    styleAnswer(
      { info, props: { display: { value: 'block', set: 'display: inline-block', by: '.btn' } } },
      { url: 'u', path: '/', viewport: 'mobile' }
    )
  )
  assert.equal(out.ok, true)
  assert.equal(out.hidden, 'display:none on <div.wtb-actions>')
})

test('🔒 nth counts from 0, and every place the agent reads it says so: the refusal, the call shape, the description, the LOOK line', () => {
  const page = fakePage(HERO)
  // "the first button" asked as nth:1 (dskeepwp / dskeepjo, 09–10/10/2026)
  const one = page.find({ text: 'See what we bake', nth: 1 })
  assert.match(one, /show 1 time, so there is no #1 \(nth counts from 0: the first is 0\)$/)
  assert.match(
    page.find({ selector: 'a.btn-primary', nth: 2 }),
    /matches 2 elements, so there is no #2 \(nth counts from 0: the first is 0\)$/
  )
  const refused = /** @type {any} */ (
    styleAnswer({ error: one }, { url: 'u', path: '/', viewport: 'desktop' })
  )
  assert.match(refused.error, /the first is 0\)$/, 'not cut before the hint')
  const bad = /** @type {any} */ (styleRequest({ text: 'x', nth: -1 }))
  assert.match(bad.answer.next, /nth\?:0 = the first/)
  for (const surface of /** @type {const} */ (['wordpress', 'joomla', 'emdash']))
    assert.match(
      siteToolDescription(surface),
      /page\.look \{path:"\/", style\?:\{text\|selector, nth\?:0 = the first, /
    )
})

test('describeTarget (look.set): a selector for this element alone, the page’s classes, header or not, every sheet named as the cascade names it', () => {
  const page = fakePage(HERO)
  const hero = /** @type {any} */ (page.describe(page.find({ text: 'See what we bake' }), ['color'], true))
  // `a.btn.btn-primary` matches two buttons: the hero's section tells them apart
  assert.equal(hero.unique, 'section.wtb-hero a.btn.btn-primary')
  assert.equal(page.all.filter((e) => e.tagName === 'A' && e.className === 'btn btn-primary').length, 2)
  assert.equal(hero.body, 'home page page-id-42 wp-theme-t')
  assert.equal(hero.chrome, false)
  assert.deepEqual(hero.sheets, [
    '/wp-content/themes/t/assets/css/sections.css',
    'global-styles-inline-css',
    '<style id="astro-inline-fonts">',
    'https://fonts.example/css'
  ])
  const cta = /** @type {any} */ (page.describe(page.find({ text: 'Order now' }), ['color'], true))
  assert.equal(cta.unique, 'a.btn.btn-cta')
  assert.equal(cta.chrome, true, 'in the site header: the same element on every page')
  // the shortest selector that still names it alone: no generated hash class, no wrapper it does not need
  const blocks = fakePage({
    tag: 'body',
    cls: 'page-id-7',
    kids: [
      {
        tag: 'header',
        kids: [
          {
            tag: 'div',
            cls: 'wp-block-button is-style-orange',
            kids: [{ tag: 'a', cls: 'wp-block-button__link wp-element-button', kids: ['Order'] }]
          }
        ]
      },
      {
        tag: 'main',
        kids: [
          {
            tag: 'div',
            cls: 'wp-block-group wtb-hero__copy wp-container-core-group-is-layout-6c531013',
            kids: [
              {
                tag: 'div',
                cls: 'wp-block-buttons wtb-actions',
                kids: [
                  {
                    tag: 'div',
                    cls: 'wp-block-button is-style-orange',
                    kids: [
                      {
                        tag: 'a',
                        cls: 'wp-block-button__link is-style-orange--3 wp-element-button',
                        kids: ['See what we bake']
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            tag: 'div',
            cls: 'wp-block-group wtb-band',
            kids: [
              {
                tag: 'div',
                cls: 'wp-block-buttons wtb-actions',
                kids: [
                  {
                    tag: 'div',
                    cls: 'wp-block-button is-style-orange',
                    kids: [{ tag: 'a', cls: 'wp-block-button__link wp-element-button', kids: ['Talk'] }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  })
  const bake = /** @type {any} */ (
    blocks.describe(blocks.find({ text: 'See what we bake' }), ['color'], true)
  )
  assert.equal(bake.unique, 'div.wp-block-group.wtb-hero__copy a.wp-block-button__link.wp-element-button')
  // two identical elements with nothing to tell them apart: their place among their kind
  const twins = fakePage({
    tag: 'body',
    kids: [
      {
        tag: 'div',
        kids: [
          { tag: 'span', kids: ['A'] },
          { tag: 'span', kids: ['A'] }
        ]
      }
    ]
  })
  const second = /** @type {any} */ (twins.describe(twins.find({ text: 'A', nth: 1 }), ['color'], true))
  assert.equal(second.unique, 'body > div:nth-of-type(1) > span:nth-of-type(2)')
})

/**
 * saigon-iron-boxing's home page (Joomla T4, ja_boxing, dev 25/10/2026): T4's layout wraps the whole
 * page in one `<main>`, the header section included, and the header's words sit in a `<header>` inside
 * `#t4-header`. Its stylesheets as the page loads them: T4's icon fonts, the template's carousel, T4's
 * bundle, and the lightbox's icon sheet that the lightbox script adds last.
 */
const T4_PAGE = {
  tag: 'body',
  cls: 'site-default navigation-default theme-default layout-home com_content view-featured item-101 loaded-bs5',
  kids: [
    {
      tag: 'main',
      kids: [
        {
          tag: 'div',
          id: 't4-header',
          cls: 't4-section t4-header',
          kids: [
            {
              tag: 'header',
              cls: 'header-block',
              kids: [
                {
                  tag: 'nav',
                  cls: 'navbar navbar-expand-lg',
                  kids: [
                    {
                      tag: 'li',
                      cls: 'nav-item item-167',
                      kids: [{ tag: 'a', cls: 'nav-link', kids: ['Classes'] }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          tag: 'div',
          id: 't4-hero',
          cls: 't4-section t4-hero',
          kids: [{ tag: 'a', cls: 'btn btn-primary', kids: ['Come say hello'] }]
        },
        {
          tag: 'div',
          id: 't4-section-1',
          cls: 't4-section t4-section-1',
          kids: [
            {
              tag: 'article',
              kids: [{ tag: 'header', kids: [{ tag: 'h2', cls: 'article-title', kids: ['Our coaches'] }] }]
            }
          ]
        },
        {
          tag: 'div',
          id: 't4-footnav',
          cls: 't4-section t4-footnav',
          kids: [{ tag: 'a', cls: 'foot-link', kids: ['Opening hours'] }]
        }
      ]
    }
  ]
}
const T4_PAGE_SHEETS = [
  {
    href: 'http://site.test/plugins/system/t4/themes/base/vendors/font-awesome5/css/all.min.css?3ee419',
    ownerNode: null
  },
  {
    href: 'http://site.test/templates/ja_boxing/js/owl-carousel/owl.carousel.min.css?3ee419',
    ownerNode: null
  },
  {
    href: 'http://site.test/media/t4/optimize/css/842ed064c2ee113d21f8560dacec820b.css?6720f2',
    ownerNode: null
  },
  { href: 'http://site.test/templates/ja_boxing/js/html5lightbox/icons/css/fontello.css', ownerNode: null }
]

test('🔒 describeTarget (look.set): T4 puts its header inside <main> — the menu link is still the site’s header, on every page; the hero and an article’s own header are not (turn latency, 25/10/2026)', () => {
  const page = fakePage(T4_PAGE, T4_PAGE_SHEETS)
  const link = /** @type {any} */ (page.describe(page.find({ text: 'Classes' }), ['color'], true))
  assert.equal(link.chrome, true, 'a link of #t4-header is the same element on every page')
  const foot = /** @type {any} */ (page.describe(page.find({ text: 'Opening hours' }), ['color'], true))
  assert.equal(foot.chrome, true, 'a link of #t4-footnav is the same element on every page')
  const hero = /** @type {any} */ (page.describe(page.find({ text: 'Come say hello' }), ['color'], true))
  assert.equal(hero.chrome, false, 'the hero is this page’s own content')
  const title = /** @type {any} */ (page.describe(page.find({ text: 'Our coaches' }), ['color'], true))
  assert.equal(title.chrome, false, 'an article’s own <header> is content')
  // which template and framework serve the page, read off the assets it loads
  assert.equal(hero.template, 'ja_boxing')
  assert.equal(hero.framework, 't4')
})

/** A T4 header as saigon-iron-boxing prints it: the desktop bar, and the phone drawer's copy, hidden here. */
const T4_TWO_MENUS = {
  tag: 'body',
  cls: 'site-default layout-home item-101',
  kids: [
    {
      tag: 'main',
      kids: [
        {
          tag: 'div',
          id: 't4-header',
          cls: 't4-section t4-header',
          kids: [
            {
              tag: 'nav',
              cls: 't4-megamenu',
              kids: [
                {
                  tag: 'li',
                  cls: 'nav-item dropdown parent',
                  attrs: { 'data-id': '193' },
                  kids: [
                    {
                      tag: 'a',
                      cls: 'nav-link dropdown-toggle',
                      attrs: { href: '/index.php/about-us' },
                      kids: [{ tag: 'span', cls: 'menu-item-title', kids: ['About'] }]
                    }
                  ]
                },
                {
                  tag: 'li',
                  cls: 'nav-item',
                  attrs: { 'data-id': '170' },
                  kids: [{ tag: 'a', cls: 'nav-link', attrs: { href: '/index.php/plans' }, kids: ['Plans'] }]
                }
              ]
            }
          ]
        },
        {
          tag: 'div',
          id: 'off-canvas-left-push',
          cls: 't4-offcanvas c-offcanvas is-closed',
          kids: [
            {
              tag: 'nav',
              cls: 'navbar',
              kids: [
                {
                  tag: 'li',
                  cls: 'nav-item item-193 deeper',
                  kids: [
                    {
                      tag: 'a',
                      cls: 'nav-link dropdown-toggle',
                      attrs: { href: '/index.php/about-us' },
                      style: { visibility: 'hidden' },
                      kids: [{ tag: 'span', cls: 'menu-item-title', kids: ['About'] }]
                    }
                  ]
                },
                {
                  tag: 'li',
                  cls: 'nav-item item-199',
                  kids: [
                    {
                      tag: 'a',
                      cls: 'nav-link',
                      attrs: { href: '/index.php/drawer-only' },
                      style: { visibility: 'hidden' },
                      kids: ['Drawer only']
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

test('🔒 describeTarget (look.set): a selector that names only the phone drawer’s hidden copy of a menu link also names the copy visitors see (turn latency, 26/10/2026)', () => {
  const page = fakePage(T4_TWO_MENUS, T4_PAGE_SHEETS)
  const drawer = page.find({ selector: 'li.item-193 > a' })
  const read = /** @type {any} */ (page.describe(drawer, ['color'], true))
  assert.equal(read.hidden, 'visibility:hidden')
  assert.equal(read.copies?.length, 1, 'the desktop bar’s link is the same link: same address, same words')
  const shown = page.all.filter(
    (/** @type {any} */ e) =>
      e.tagName === 'A' && e.attrs.href === '/index.php/about-us' && !e.style.visibility
  )
  const named = page.all.filter((/** @type {any} */ e) => page.selects(e, read.copies[0].unique))
  assert.equal(named.length, 1)
  assert.equal(named[0], shown[0], 'its selector names the visible copy and nothing else')
  assert.match(read.copies[0].el, /^<a\.nav-link\.dropdown-toggle>/)
  // the visible link named by its words: no copies (what the visitor sees is already the one written)
  const bar = /** @type {any} */ (page.describe(page.find({ text: 'About' }), ['color'], true))
  assert.equal(bar.hidden, false)
  assert.equal(bar.copies, undefined)
  // a hidden link with no visible copy: none named
  const only = /** @type {any} */ (page.describe(page.find({ selector: 'li.item-199 > a' }), ['color'], true))
  assert.equal(only.hidden, 'visibility:hidden')
  assert.equal(only.copies, undefined)
})

// ── the three functions that run elsewhere ───────────────────────────────────────────────────────

test('🔒 the page and container functions are self-contained: each compiles and runs alone', () => {
  // exec.mjs embeds them by source text; a name from this module's scope would be undefined there.
  for (const fn of [findTarget, describeTarget, resolveStyles]) {
    const copy = vm.runInNewContext(`(${String(fn)})`, {})
    assert.equal(typeof copy, 'function', fn.name)
  }
  const fx = load('wp-button.json')
  const alone = vm.runInNewContext(`(${String(resolveStyles)})`, {})
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(alone({ props: fx.props, info: fx.info, matched: fx.matched, painter: fx.painter }))
    ),
    JSON.parse(JSON.stringify(resolve(fx)))
  )
  // and the shipped script carries them
  for (const name of ['function findTarget', 'function describeTarget', 'function resolveStyles'])
    assert.ok(BROWSER_SCRIPT.includes(name), name)
})

// ── the cascade, read on the three bench sites ───────────────────────────────────────────────────

test('WordPress: the button takes its colour from a theme.json custom token, set on :root by global styles', () => {
  const r = resolve(load('wp-button.json'))
  assert.equal(r.props['background-color'].value, 'rgb(218, 90, 42)')
  assert.equal(r.props['background-color'].hex, '#da5a2a')
  assert.equal(r.props['background-color'].set, 'background: var(--wp--custom--tracy--brand--orange)')
  assert.equal(
    r.props['background-color'].by,
    '.tracy .wp-block-button.is-style-orange .wp-block-button__link'
  )
  assert.equal(r.props['background-color'].line, 579)
  assert.deepEqual(
    r.props['background-color'].tokens.map((/** @type {any} */ t) => [t.name, t.value, t.by]),
    [['--wp--custom--tracy--brand--orange', '#da5a2a', ':root']]
  )
  assert.equal(r.props['font-family'].set, 'font-family: var(--wp--preset--font-family--body)')
  assert.equal(r.props['font-family'].tokens[0].value, 'Archivo, system-ui, sans-serif')
  assert.equal(r.props['font-weight'].set, 'font-weight: 600')
  assert.equal(r.props['font-weight'].tokens, undefined, 'a literal has no token')
})

test('Joomla: the token is set in the template’s own stylesheet, the rule in T4’s optimized bundle', () => {
  const fx = load('joomla-button.json')
  const r = resolve(fx)
  const bg = r.props['background-color']
  assert.equal(bg.set, 'background: var(--tb-band-signal-bg)')
  assert.equal(bg.by, '.tb-btn--signal')
  assert.match(fx.sheets[bg.sheet].sourceURL, /\/media\/t4\/optimize\/css\//)
  const token = bg.tokens[0]
  assert.deepEqual(
    [token.name, token.value, token.by, token.line],
    ['--tb-band-signal-bg', '#DA5A2A', ':root', 165]
  )
  assert.match(
    fx.sheets[token.sheet].sourceURL,
    /\/templates\/tracy_business\/css\/styles\/tracy-business\.css/
  )
  assert.equal(r.props.color.set, 'color: #fff')
})

test('EmDash: cascade layers named, a minified !important read as one, an inherited family followed to <html>', () => {
  const r = resolve(load('emdash-button.json'))
  assert.equal(r.props['background-color'].by, '.btn-primary @layer components')
  assert.deepEqual(
    r.props['background-color'].tokens.map((/** @type {any} */ t) => [t.name, t.value, t.by]),
    [['--color-signal', '#da5a2a', ':root @layer theme']]
  )
  assert.equal(r.props['font-size'].set, 'font-size: 15px !important')
  assert.match(r.props['font-size'].by, /@layer utilities$/)
  assert.equal(r.props['font-family'].on, 'inherited from <html>')
  assert.equal(r.props['font-family'].set, 'font-family: var(--font-archivo), system-ui, sans-serif')
})

test('EmDash: a heading on a band — its background painted by an ancestor, its colour inherited from <body>', () => {
  const r = resolve(load('emdash-heading.json'))
  assert.equal(r.props['background-color'].on, 'painted by <div.min-h-screen.bg-paper>')
  assert.equal(r.props['background-color'].set, 'background-color: var(--color-paper)')
  assert.equal(r.props['background-color'].tokens[0].value, '#f5f3ee')
  assert.equal(r.props.color.on, 'inherited from <body>')
  assert.equal(r.props.color.tokens[0].name, '--color-fg')
  // a token that is itself var() of another: both links of the chain
  assert.deepEqual(
    r.props['font-family'].tokens.map((/** @type {any} */ t) => t.name),
    ['--font-serif', '--font-newsreader']
  )
})

test('the cascade rules resolveStyles keeps: !important beats order, the style attribute beats rules, inherit hands up', () => {
  const rule = (/** @type {string} */ selector, /** @type {any[]} */ props) => ({
    matchingSelectors: [0],
    rule: {
      origin: 'regular',
      styleSheetId: 's1',
      selectorList: { text: selector, selectors: [{ text: selector }] },
      style: { cssProperties: props }
    }
  })
  const matched = {
    matchedCSSRules: [
      rule('.a', [{ name: 'color', value: 'red', important: true }]),
      rule('.b', [{ name: 'color', value: 'blue' }]),
      rule('.c', [{ name: 'font-size', value: 'inherit' }])
    ],
    inlineStyle: { cssProperties: [{ name: 'margin-top', value: '4px' }] },
    inherited: [
      {
        matchedCSSRules: [
          rule('section', [
            { name: 'font-size', value: 'var(--step-1)' },
            { name: '--step-1', value: '18px' }
          ])
        ]
      }
    ]
  }
  const r = /** @type {any} */ (
    resolveStyles({
      props: ['color', 'margin-top', 'font-size', 'border-top-color', '--missing'],
      info: { computed: {}, chain: ['<section>'] },
      matched
    })
  )
  assert.equal(r.props.color.set, 'color: red !important')
  assert.equal(r.props['margin-top'].by, 'its style attribute')
  assert.equal(r.props['font-size'].on, 'inherited from <section>')
  assert.deepEqual(r.props['font-size'].tokens, [
    { name: '--step-1', value: '18px', by: 'section', sheet: 's1', on: '<section>' }
  ])
  assert.equal(r.props['border-top-color'].set, null)
  assert.match(r.props['border-top-color'].by, /browser default/)
  assert.equal(r.props['--missing'].set, null)
})

test('🔒 a shorthand is read side by side: the slot’s (0,8,0) padding-* beat the agent’s (0,7,0) padding, and page.look says so (dskeepwp)', () => {
  const r = /** @type {any} */ (
    resolveStyles({
      props: ['padding', 'padding-top', 'border-radius', 'font-size'],
      info: { computed: { padding: '7px 21px', 'padding-top': '7px' }, chain: [] },
      matched: heroCascade()
    })
  ).props
  // it named the agent's LOSING `padding` as the winner while the computed padding stayed 7px 21px
  assert.equal(r.padding.value, '7px 21px')
  assert.equal(r.padding.by, SLOT_BUTTON)
  assert.equal(
    r.padding.set,
    'padding-top: 7px; padding-right: 21px; padding-bottom: 7px; padding-left: 21px'
  )
  assert.equal(r.padding.split, true, 'four declarations, not one')
  assert.equal(r.padding.parts, undefined, 'one rule wins every side')
  assert.equal(r['padding-top'].by, SLOT_BUTTON, 'a longhand read as before')
  // a shorthand that one declaration sets on every side reads as before: the later of two shorthands
  assert.equal(r['border-radius'].set, 'border-radius: 999px')
  assert.equal(r['border-radius'].by, SLOT_BUTTON)
  assert.equal(r['border-radius'].split, undefined)
  assert.equal(r['font-size'].by, AGENT_HERO_BY)
  const answer = /** @type {any} */ (
    styleAnswer({ info: { el: '<a>' }, props: r }, { url: 'u', path: '/', viewport: 'desktop' })
  )
  assert.equal(answer.style.padding.by, SLOT_BUTTON)
  assert.doesNotMatch(answer.next, /parts:/)
})

test('a shorthand whose sides different rules win: each group named, the one to beat last leads, and the answer says a change must beat each', () => {
  const r = /** @type {any} */ (
    resolveStyles({
      props: ['padding', 'margin'],
      info: { computed: { padding: '7px 25px' }, chain: [] },
      matched: heroCascade(['padding-top', 'padding-bottom'])
    })
  ).props
  assert.equal(r.padding.by, SLOT_BUTTON, 'the latest in the cascade leads')
  assert.equal(r.padding.set, 'padding-top: 7px; padding-bottom: 7px')
  assert.deepEqual(
    r.padding.parts.map((/** @type {any} */ pt) => [pt.props, pt.set, pt.by, pt.sheet]),
    [
      [['padding-top', 'padding-bottom'], 'padding-top: 7px; padding-bottom: 7px', SLOT_BUTTON, 'gs'],
      [['padding-right', 'padding-left'], 'padding: 14px 25px', AGENT_HERO_BY, 'gs']
    ]
  )
  // nothing sets margin: the browser default, as before
  assert.equal(r.margin.set, null)
  assert.match(r.margin.by, /browser default/)
  const answer = /** @type {any} */ (
    styleAnswer({ info: { el: '<a>' }, props: r }, { url: 'u', path: '/', viewport: 'desktop' })
  )
  assert.deepEqual(answer.style.padding.parts, [
    `padding-top, padding-bottom: padding-top: 7px; padding-bottom: 7px · ${SLOT_BUTTON} · gs`,
    `padding-right, padding-left: padding: 14px 25px · ${AGENT_HERO_BY} · gs`
  ])
  assert.match(answer.next, /parts: this shorthand's sides are set by different rules/)
  // a side no rule sets is a part of its own
  const some = /** @type {any} */ (
    resolveStyles({
      props: ['padding'],
      info: { computed: {}, chain: [] },
      matched: { matchedCSSRules: [cdpRule('.x', [['padding-left', '3px']])] }
    })
  ).props.padding
  assert.equal(some.set, 'padding-left: 3px')
  assert.deepEqual(
    some.parts.map((/** @type {any} */ pt) => [pt.props, pt.set]),
    [
      [['padding-left'], 'padding-left: 3px'],
      [['padding-top', 'padding-right', 'padding-bottom'], null]
    ]
  )
})

test('🔒 a logical side is the physical side it sets: the dskeepem hero’s !px/!py utilities win its padding, not .btn-primary (Tailwind v4)', () => {
  const read = (/** @type {string[]} */ props, /** @type {any} */ info = {}) =>
    /** @type {any} */ (
      resolveStyles({
        props,
        info: { dir: 'ltr', wm: 'horizontal-tb', computed: { padding: '19px 38px' }, chain: [], ...info },
        matched: emHeroCascade()
      })
    ).props
  const r = read(['padding', 'padding-left', 'padding-inline', 'padding-block-start'])
  // it named `.btn-primary @layer components` — beaten on every side by the utilities
  assert.equal(r.padding.by, `${EM_PY} @layer utilities`)
  assert.deepEqual(
    r.padding.parts.map((/** @type {any} */ pt) => [pt.props, pt.set, pt.by, pt.layer]),
    [
      [
        ['padding-top', 'padding-bottom'],
        'padding-block: calc(var(--ds-btn-pad-y,15px) + 12px) !important',
        `${EM_PY} @layer utilities`,
        'utilities'
      ],
      [
        ['padding-right', 'padding-left'],
        'padding-inline: calc(var(--ds-btn-pad-x,30px) + 17px) !important',
        `${EM_PX} @layer utilities`,
        'utilities'
      ]
    ]
  )
  assert.equal(r['padding-left'].by, `${EM_PX} @layer utilities`)
  assert.deepEqual(r['padding-left'].spec, [0, 1, 0])
  // a logical shorthand or longhand asked for reads the same sides
  assert.equal(r['padding-inline'].set, 'padding-inline: calc(var(--ds-btn-pad-x,30px) + 17px) !important')
  assert.equal(r['padding-inline'].split, undefined)
  assert.equal(r['padding-block-start'].by, `${EM_PY} @layer utilities`)
  // which side `inline-start` is follows the element's own direction and writing mode
  const start = { matchedCSSRules: [cdpRule('.x', [['padding-inline-start', '5px']])] }
  const rtl = /** @type {any} */ (
    resolveStyles({
      props: ['padding-right', 'padding-left'],
      info: { dir: 'rtl', chain: [] },
      matched: start
    })
  ).props
  assert.equal(rtl['padding-right'].by, '.x')
  assert.equal(rtl['padding-left'].set, null)
  const vertical = /** @type {any} */ (
    resolveStyles({
      props: ['padding-right', 'padding-top', 'width'],
      info: { dir: 'ltr', wm: 'vertical-rl', chain: [] },
      matched: {
        matchedCSSRules: [
          cdpRule('.v', [
            ['padding-block-start', '4px'],
            ['padding-inline-start', '6px'],
            ['inline-size', '9px']
          ])
        ]
      }
    })
  ).props
  assert.equal(vertical['padding-right'].set, 'padding-block-start: 4px')
  assert.equal(vertical['padding-top'].set, 'padding-inline-start: 6px')
  assert.equal(vertical.width.set, null, 'in a vertical writing mode inline-size is the height')
})

test('🔒 among !important declarations an EARLIER cascade layer wins, a layered one beats an unlayered one, the style attribute beats both', () => {
  // the order Chromium 153 lists them in, and what it computed: rgb(2, 2, 2) (10/10/2026)
  const rules = [
    cdpRule('.c0.c0', [['color', 'rgb(2,2,2)!important']], {}, 's', { layers: ['base'] }),
    cdpRule('.btn-primary', [['color', 'rgb(9,9,9)']], {}, 's', { layers: ['components'] }),
    cdpRule('.c1', [['color', 'rgb(1,1,1)!important']], {}, 's', { layers: ['utilities'] }),
    cdpRule('#t.c1', [['color', 'rgb(3,3,3)!important']], {}, 's')
  ]
  const color = (/** @type {any} */ matched) =>
    /** @type {any} */ (resolveStyles({ props: ['color'], info: { chain: [] }, matched })).props.color
  // it named the LAST important one, `#t.c1`, the one that loses among them
  assert.equal(color({ matchedCSSRules: rules }).by, '.c0.c0 @layer base')
  assert.equal(color({ matchedCSSRules: rules }).layer, 'base')
  assert.equal(
    color({ matchedCSSRules: [rules[2], rules[3]] }).by,
    '.c1 @layer utilities',
    'layered beats unlayered'
  )
  assert.equal(
    color({
      matchedCSSRules: rules,
      inlineStyle: { cssProperties: [{ name: 'color', value: 'red', important: true }] }
    }).by,
    'its style attribute'
  )
  // normal declarations keep the browser's order: the unlayered rule, listed last, wins
  const normal = [
    cdpRule('.a', [['color', 'red']], {}, 's', { layers: ['utilities'] }),
    cdpRule('a', [['color', 'blue']], {}, 's')
  ]
  assert.equal(color({ matchedCSSRules: normal }).by, 'a')
})

test('🔒 a nested rule is named whole: CDP’s `h1` under .tracy-native-landing.tracy-native-landing reads as that selector, (0,2,1) (dskeepjo)', () => {
  const r = /** @type {any} */ (
    resolveStyles({
      props: ['color'],
      info: { chain: [] },
      matched: {
        matchedCSSRules: [
          cdpRule('h1', [['color', 'var(--t4-heading-color)']], {}, 't4', { spec: [0, 0, 1] }),
          cdpRule('h1', [['color', 'var(--brand-color-text)']], {}, 'nl', {
            nesting: ['.tracy-native-landing.tracy-native-landing'],
            spec: [0, 2, 1]
          })
        ]
      }
    })
  ).props.color
  // it was named `h1`: look.set aimed past (0,0,1) with body.item-247 h1 (0,1,2), and lost
  assert.equal(r.by, '.tracy-native-landing.tracy-native-landing h1')
  assert.deepEqual(r.spec, [0, 2, 1])
  const named = (/** @type {string} */ sel, /** @type {string[]} */ nesting) =>
    /** @type {any} */ (
      resolveStyles({
        props: ['color'],
        info: { chain: [] },
        matched: { matchedCSSRules: [cdpRule(sel, [['color', 'red']], {}, 's', { nesting })] }
      })
    ).props.color.by
  assert.equal(named('& .x', ['.a']), '.a .x')
  assert.equal(named('&.on', ['.btn']), '.btn.on')
  assert.equal(named('& > li', ['.menu .list']), '.menu .list > li')
  assert.equal(named('.x &', ['.a .b']), '.x :is(.a .b)')
  assert.equal(named('h1', ['.a, .b']), ':is(.a, .b) h1')
  assert.equal(named('h1', ['.inner', '.outer']), '.outer .inner h1', 'nearest parent first')
})

// ── the answer ───────────────────────────────────────────────────────────────────────────────────

test('styleAnswer: within 2,000 characters on every bench fixture, the token line naming where it is set', () => {
  for (const name of ['wp-button.json', 'joomla-button.json', 'emdash-button.json', 'emdash-heading.json']) {
    const fx = load(name)
    const r = resolve(fx)
    const labels = (/** @type {any} */ o) => {
      if (o?.sheet)
        o.sheet = new URL(fx.sheets[o.sheet]?.sourceURL ?? 'http://x.test/', 'http://x.test/').pathname
    }
    for (const row of Object.values(r.props)) {
      labels(row)
      for (const t of /** @type {any} */ (row).tokens ?? []) labels(t)
    }
    const out = /** @type {any} */ (
      styleAnswer(
        { info: fx.info, props: r.props },
        { url: 'http://x.test/', path: '/', viewport: 'desktop' }
      )
    )
    assert.equal(out.ok, true, name)
    assert.ok(JSON.stringify(out).length <= 2000, `${name}: ${JSON.stringify(out).length}`)
    for (const row of Object.values(out.style))
      assert.equal(typeof (/** @type {any} */ (row).value), 'string')
  }
  const wp = /** @type {any} */ (
    styleAnswer(
      { info: load('wp-button.json').info, props: resolve(load('wp-button.json')).props },
      { url: 'u', path: '/', viewport: 'desktop' }
    )
  )
  assert.match(
    wp.style['background-color'].tokens[0],
    /^--wp--custom--tracy--brand--orange = #da5a2a · :root/
  )
  assert.ok(!wp.style['background-color'].tokens[0].includes('on <html>'), 'a root token needs no "on"')
  // a tighter budget cuts selectors and tokens, never the value
  const small = /** @type {any} */ (
    styleAnswer(
      { info: load('wp-button.json').info, props: resolve(load('wp-button.json')).props },
      { url: 'u', path: '/', viewport: 'desktop', cap: 900 }
    )
  )
  assert.equal(small.style['background-color'].value, 'rgb(218, 90, 42)')
})

test('styleAnswer: several matches are counted, a partial match is said, an element not found is a refusal', () => {
  const out = /** @type {any} */ (
    styleAnswer(
      { info: { el: '<a.x>', text: 'Contact', matches: 3, how: 'partial' }, props: {} },
      { url: 'u', path: '/', viewport: 'mobile' }
    )
  )
  assert.equal(out.matches, 3)
  assert.equal(out.matchedBy, 'partial words')
  assert.equal(out.viewport, 'mobile 390×844')
  const missing = /** @type {any} */ (
    styleAnswer(
      { error: 'no visible element shows the words "Buy"' },
      { url: 'u', path: '/x', viewport: 'desktop' }
    )
  )
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'STYLE_TARGET_NOT_FOUND')
})

// ── the shipped script, against a scripted CDP browser ───────────────────────────────────────────

/**
 * Run a BROWSER_SCRIPT with `require`/`process` faked (the exec.test.mjs harness): `spawn` returns a
 * chromium that answers the style mode's CDP requests from one fixture, recording every method.
 */
function runStyleScript(
  /** @type {string} */ script,
  /** @type {any} */ fx,
  { found = true, file, final = 'http://127.0.0.1/', load = true } = /** @type {any} */ ({})
) {
  const methods = /** @type {string[]} */ ([])
  const calls = /** @type {any[]} */ ([])
  let dataCb = /** @type {any} */ (null)
  const emit = (/** @type {any} */ obj) => {
    try {
      dataCb?.(Buffer.from(`${JSON.stringify(obj)}\0`))
    } catch (e) {
      if (!(/** @type {any} */ (e)?.__exit)) throw e
    }
  }
  const FINAL = final
  const child = {
    pid: 4242,
    on: () => {},
    kill: () => {},
    stdio: [
      null,
      null,
      null,
      {
        on: () => {},
        write: (/** @type {string} */ s) => {
          const msg = JSON.parse(String(s).replace(/\0$/, ''))
          methods.push(msg.method)
          calls.push(msg)
          const reply = (/** @type {any} */ result) => queueMicrotask(() => emit({ id: msg.id, result }))
          switch (msg.method) {
            case 'Target.createTarget':
              return reply({ targetId: 'T1' })
            case 'Target.attachToTarget':
              return reply({ sessionId: 'S1' })
            case 'Page.getFrameTree':
              return reply({ frameTree: { frame: { id: 'MF' } } })
            case 'Page.navigate':
              reply({ frameId: 'MF' })
              if (load) queueMicrotask(() => emit({ method: 'Page.loadEventFired', params: {} }))
              return
            case 'Runtime.evaluate': {
              const e = msg.params.expression
              if (e === 'document.location.href') return reply({ result: { type: 'string', value: FINAL } })
              // look.set's copies of a hidden link, found again by their own selectors
              if (e.startsWith('document.querySelector('))
                return reply({ result: { type: 'object', subtype: 'node', objectId: 'COPY' } })
              if (e.startsWith('(function findTarget'))
                return reply({
                  result: found
                    ? { type: 'object', subtype: 'node', objectId: 'EL' }
                    : { type: 'string', value: 'no visible element shows the words "Nope"' }
                })
              // look.set's count of what each winning rule paints: three of each, here
              if (e.startsWith('(function countPaints'))
                return reply({
                  result: {
                    type: 'object',
                    value: JSON.parse(e.slice(e.lastIndexOf(')(') + 2, -1)).map((/** @type {string} */ x) =>
                      x ? 3 : -1
                    )
                  }
                })
              return reply({ result: { type: 'undefined' } })
            }
            case 'Runtime.callFunctionOn':
              if (msg.params.functionDeclaration.startsWith('function describeTarget'))
                return reply({
                  result: {
                    type: 'object',
                    value: msg.params.objectId === 'COPY' ? (fx.copyInfo ?? fx.info) : fx.info
                  }
                })
              return reply({ result: { type: 'object', subtype: 'node', objectId: 'PAINTER' } })
            case 'CSS.enable':
              for (const h of Object.values(fx.sheets))
                emit({ method: 'CSS.styleSheetAdded', params: { header: h } })
              return reply({})
            case 'DOM.getDocument':
              return reply({ root: { nodeId: 1 } })
            case 'DOM.requestNode':
              return reply({
                nodeId: msg.params.objectId === 'EL' ? 5 : msg.params.objectId === 'COPY' ? 7 : 6
              })
            case 'CSS.getMatchedStylesForNode':
              return reply(
                msg.params.nodeId === 5
                  ? fx.matched
                  : msg.params.nodeId === 7
                    ? (fx.copyMatched ?? fx.matched)
                    : fx.painter
              )
            case 'DOM.describeNode':
              return reply({ node: { attributes: ['id', 'astro-inline-fonts', 'type', 'text/css'] } })
            default:
              return reply({})
          }
        }
      },
      { on: (/** @type {string} */ ev, /** @type {any} */ cb) => (ev === 'data' ? (dataCb = cb) : undefined) }
    ]
  }
  const req = file ?? JSON.stringify({ text: fx.info.text, nth: 0, props: fx.props, viewport: 'desktop' })
  return new Promise((resolveOut, reject) => {
    let out = ''
    const proc = {
      argv: ['node', 'style', FINAL, new URL(FINAL).origin, req, '5', '4000', '1000'],
      env: {},
      stdout: {
        write: (/** @type {string} */ s, /** @type {any} */ cb) => {
          out += String(s)
          if (typeof cb === 'function') cb()
        }
      },
      exit: () => {
        throw { __exit: true }
      }
    }
    const requireFake = (/** @type {string} */ name) =>
      name === 'child_process'
        ? { spawn: () => child }
        : name === 'fs'
          ? { mkdtempSync: (/** @type {string} */ p) => `${p}x`, rmSync: () => {}, writeFileSync: () => {} }
          : name === 'os'
            ? { tmpdir: () => '/tmp' }
            : name === 'path'
              ? { join: (/** @type {string[]} */ ...a) => a.join('/') }
              : {}
    try {
      // eslint-disable-next-line no-new-func
      new Function('require', 'process', script)(requireFake, proc)
    } catch (e) {
      if (!(/** @type {any} */ (e)?.__exit)) return reject(e)
    }
    const started = Date.now()
    const iv = setInterval(() => {
      if (out !== '') {
        clearInterval(iv)
        resolveOut({ out, methods, calls })
      } else if (Date.now() - started > 3000) {
        clearInterval(iv)
        reject(new Error(`script wrote nothing; methods: ${methods.join(' ')}`))
      }
    }, 1)
  })
}

test('🔒 BROWSER_SCRIPT (style): viewport and scheme before the page, then find, describe, cascade — sheets named', async () => {
  const fx = load('emdash-heading.json')
  const final = 'http://benchemdash02.tracy.test:51710/'
  const { out, methods } = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, fx, { final }))
  assert.ok(out.startsWith(`TRACY_BROWSER OK ${final}\n`), out.slice(0, 120))
  const nav = methods.indexOf('Page.navigate')
  for (const m of ['Emulation.setDeviceMetricsOverride', 'Emulation.setEmulatedMedia'])
    assert.ok(methods.indexOf(m) !== -1 && methods.indexOf(m) < nav, `${m} before the navigation`)
  assert.ok(!methods.includes('Emulation.setTouchEmulationEnabled'), 'no touch on desktop')
  assert.ok(!methods.includes('Page.captureScreenshot'), 'no picture')
  const body = JSON.parse(out.slice(out.indexOf('\n') + 1))
  assert.equal(body.info.el, '<h2.h-section-lg>')
  // the painter's own cascade was asked for (DOM.requestNode twice)
  assert.equal(methods.filter((m) => m === 'CSS.getMatchedStylesForNode').length, 2)
  // an external sheet by its path; an inline <style> with no address of its own by its id; no line inside it
  assert.equal(body.props['background-color'].sheet, '/_astro/NotFound.NMFWnc7f.css')
  const newsreader = body.props['font-family'].tokens.find(
    (/** @type {any} */ t) => t.name === '--font-newsreader'
  )
  assert.equal(newsreader.sheet, '<style id="astro-inline-fonts">')
  assert.equal(newsreader.line, undefined)
})

test('BROWSER_SCRIPT (style): a tablet read at 768×1024; look.set’s read asks describeTarget for its selector and sheets, and gets them back', async () => {
  const fx = load('wp-button.json')
  const tablet = /** @type {any} */ (
    await runStyleScript(BROWSER_SCRIPT, fx, {
      file: JSON.stringify({ text: fx.info.text, nth: 0, props: fx.props, viewport: 'tablet' })
    })
  )
  const metrics = tablet.calls.find(
    (/** @type {any} */ c) => c.method === 'Emulation.setDeviceMetricsOverride'
  )
  assert.deepEqual([metrics.params.width, metrics.params.height, metrics.params.mobile], [768, 1024, true])
  const describe = tablet.calls.find(
    (/** @type {any} */ c) =>
      c.method === 'Runtime.callFunctionOn' &&
      c.params.functionDeclaration.startsWith('function describeTarget')
  )
  assert.deepEqual(describe.params.arguments, [{ value: fx.props }, { value: false }])
  const extra = {
    ...fx,
    info: { ...fx.info, unique: 'a.x', body: 'home page-id-42', chrome: false, sheets: ['/a.css'] }
  }
  const set = /** @type {any} */ (
    await runStyleScript(BROWSER_SCRIPT, extra, {
      file: JSON.stringify({ text: fx.info.text, nth: 0, props: fx.props, viewport: 'desktop', set: true })
    })
  )
  const asked = set.calls.find(
    (/** @type {any} */ c) =>
      c.method === 'Runtime.callFunctionOn' &&
      c.params.functionDeclaration.startsWith('function describeTarget')
  )
  assert.deepEqual(asked.params.arguments[1], { value: true })
  const body = JSON.parse(set.out.slice(set.out.indexOf('\n') + 1))
  assert.deepEqual(
    [body.info.unique, body.info.body, body.info.chrome, body.info.sheets],
    ['a.x', 'home page-id-42', false, ['/a.css']]
  )
})

test('🔒 BROWSER_SCRIPT (style): look.set’s read of a hidden link reads each copy visitors see with its own cascade, in the same visit (turn latency, 26/10/2026)', async () => {
  const fx = load('wp-button.json')
  const withCopy = {
    ...fx,
    info: {
      ...fx.info,
      unique: 'li.item-193 a.nav-link',
      hidden: 'visibility:hidden',
      chrome: true,
      sheets: ['/a.css'],
      copies: [{ unique: 'nav.t4-megamenu a.nav-link', el: '<a.nav-link>' }]
    }
  }
  const run = /** @type {any} */ (
    await runStyleScript(BROWSER_SCRIPT, withCopy, {
      file: JSON.stringify({
        selector: 'li.item-193 > a',
        nth: 0,
        props: fx.props,
        viewport: 'desktop',
        set: true
      })
    })
  )
  const found = run.calls.find(
    (/** @type {any} */ c) =>
      c.method === 'Runtime.evaluate' && c.params.expression.startsWith('document.querySelector(')
  )
  assert.equal(found.params.expression, 'document.querySelector("nav.t4-megamenu a.nav-link")')
  const body = JSON.parse(run.out.slice(run.out.indexOf('\n') + 1))
  assert.equal(body.info.copies.length, 1)
  assert.equal(body.info.copies[0].unique, 'nav.t4-megamenu a.nav-link')
  const row = body.info.copies[0].props['background-color']
  assert.ok(row && typeof row.by === 'string', 'the copy’s own winning rule')
  assert.equal(typeof row.sheet, 'string')
  assert.ok(!/^\d+(?:\.\d+)*$/.test(row.sheet), 'its sheet named, never a CDP id')
  // a read for page.look (no `set`) never looks for copies; look.set's asks one cascade more, the copy's
  const plain = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, withCopy, {}))
  const cascades = (/** @type {any} */ r) =>
    r.methods.filter((/** @type {string} */ m) => m === 'CSS.getMatchedStylesForNode').length
  assert.equal(cascades(run), cascades(plain) + 1)
  assert.ok(
    !plain.calls.some(
      (/** @type {any} */ c) =>
        c.method === 'Runtime.evaluate' && c.params.expression.startsWith('document.querySelector(')
    )
  )
})

test('BROWSER_SCRIPT (style): an element the page does not show is an OK read with {error}; a bad request never starts chromium', async () => {
  const fx = load('wp-button.json')
  const missing = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, fx, { found: false }))
  assert.equal(
    missing.out,
    'TRACY_BROWSER OK http://127.0.0.1/\n{"error":"no visible element shows the words \\"Nope\\"","loaded":true}'
  )
  const bad = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, fx, { file: '{"text":"x"}' }))
  assert.match(bad.out, /^TRACY_BROWSER ERR the style request/)
  assert.deepEqual(bad.methods, [])
  // WordPress names its inline styles by sourceURL: the name, not the page address; a sheet of the
  // page's own origin by its path, of another origin in full
  const wp = /** @type {any} */ (
    await runStyleScript(BROWSER_SCRIPT, fx, { final: 'http://benchwp02.tracy.test:51710/' })
  )
  const body = JSON.parse(wp.out.slice(wp.out.indexOf('\n') + 1))
  assert.equal(body.props['background-color'].tokens[0].sheet, 'global-styles-inline-css')
  assert.equal(
    body.props['background-color'].sheet,
    '/wp-content/themes/wp-tracy-business/assets/css/wp-tracy-business.css'
  )
  const loopback = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, fx))
  const far = JSON.parse(loopback.out.slice(loopback.out.indexOf('\n') + 1))
  assert.equal(
    far.props['background-color'].sheet,
    'http://benchwp02.tracy.test:51710/wp-content/themes/wp-tracy-business/assets/css/wp-tracy-business.css'
  )
})

test('BROWSER_SCRIPT (style): a page whose load event never came is still read, and the answer says so', async () => {
  const fx = load('joomla-button.json')
  const run = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, fx, { load: false }))
  const body = JSON.parse(run.out.slice(run.out.indexOf('\n') + 1))
  assert.equal(body.loaded, false)
  const out = /** @type {any} */ (styleAnswer(body, { url: 'u', path: '/en/', viewport: 'desktop' }))
  assert.equal(out.ok, true)
  assert.match(out.next, /had not finished loading/)
  const missing = /** @type {any} */ (
    styleAnswer(
      { error: 'no visible element shows the words "x"', loaded: false },
      { url: 'u', path: '/', viewport: 'desktop' }
    )
  )
  assert.match(missing.next, /had not finished loading/)
  const settled = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, fx))
  assert.equal(JSON.parse(settled.out.slice(settled.out.indexOf('\n') + 1)).loaded, true)
})

// ── the BUILT tool: what the image ships (RULE #3) ───────────────────────────────────────────────

test('🔒 the built tracy_site: a bad style costs no exec; a good one runs the shipped style script, bundled functions and all', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-style-'))
  mkdirSync(path.join(root, 'benchwp02'), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  try {
    /** @type {string[][]} */
    const seen = []
    const fx = load('wp-button.json')
    let script = ''
    const exec = async (/** @type {{ argv: string[] }} */ { argv }) => {
      seen.push(argv)
      if (argv[4] === 'curl') {
        const nonce = /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])?.[1]
        const body =
          '<html lang="en"><head><title>Home</title></head><body><main><h1>Hi</h1></main></body></html>'
        return {
          code: 0,
          stdout: `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n${body}\n${nonce} 200 ${Buffer.byteLength(body)}\n`,
          stderr: '',
          timedOut: false
        }
      }
      script = argv[argv.lastIndexOf('-e') + 1]
      const run = /** @type {any} */ (await runStyleScript(script, fx))
      return { code: 0, stdout: run.out, stderr: '', timedOut: false }
    }
    const tools = new Map()
    apply(
      /** @type {any} */ ({
        webServer: { register: () => () => {} },
        tools: { register: (/** @type {any} */ t) => (tools.set(t.name, t), () => {}) },
        effect: (/** @type {() => void} */ setup) => setup(),
        on: () => {},
        get: () => undefined
      }),
      /** @type {any} */ ({ exec })
    )
    const run = (/** @type {any} */ args) =>
      tools
        .get('tracy_site')
        .execute(args, { agent: { session: { id: 's', header: { cwd: path.join(root, 'benchwp02') } } } })
    const bad = await run({ action: 'page.look', params: { style: { text: 'a', selector: '.b' } } })
    assert.equal(bad.code, 'BAD_STYLE')
    assert.equal(seen.length, 0, 'refused before any exec')
    const out = await run({ action: 'page.look', params: { style: { text: 'See our capabilities' } } })
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
    assert.match(out.style['background-color'].tokens[0], /^--wp--custom--tracy--brand--orange = #da5a2a/)
    assert.equal(out.file, undefined, 'no screenshot is taken')
    assert.ok(
      script.includes('findTarget') && script.includes('resolveStyles'),
      'the bundle embeds the functions'
    )
  } finally {
    delete process.env.TRACY_SITES_ROOT
  }
})

// 20/10/2026: look.set's read counts the elements each winning rule paints in the same visit, so a page-scope
// write that reaches several asks before it writes (`look-set.mjs` `wide`); page.look's own read does not.
test('BROWSER_SCRIPT (style): look.set’s read counts what each winning rule paints; page.look’s does not ask', async () => {
  const fx = load('wp-button.json')
  const req = { text: fx.info.text, nth: 0, props: fx.props, viewport: 'desktop' }
  const plain = /** @type {any} */ (await runStyleScript(BROWSER_SCRIPT, fx, { file: JSON.stringify(req) }))
  const counted = (/** @type {any} */ run) =>
    run.calls.filter(
      (/** @type {any} */ c) =>
        c.method === 'Runtime.evaluate' && c.params.expression.startsWith('(function countPaints')
    )
  assert.equal(counted(plain).length, 0)
  const set = /** @type {any} */ (
    await runStyleScript(BROWSER_SCRIPT, fx, { file: JSON.stringify({ ...req, set: true }) })
  )
  assert.equal(counted(set).length, 1)
  const body = JSON.parse(set.out.slice(set.out.indexOf('\n') + 1))
  const rows = Object.values(body.props)
  assert.ok(
    rows.some((/** @type {any} */ r) => r.paints === 3),
    JSON.stringify(rows).slice(0, 300)
  )
})

// ── The agent is shown every class that lays an element out (22/10/2026) ─────────────────────────────────
// A customer asked six times for the main menu to lie in one row; each time the agent said it was done
// and the page did not change. The cause was a class on the menu module, `nav-pills`, set in the
// module's own params. `describeTarget` named an element, and each of its ancestors, with its first TWO
// classes only, so on `<ul class="mod-menu mod-list nav nav-pills">` the agent was told
// `ul.mod-menu.mod-list` and never saw the class that stacks the items. Six classes, inside the same
// 78-character name, show it.
const JOOMLA_MENU = {
  tag: 'body',
  cls: 'site',
  kids: [
    {
      tag: 'header',
      cls: 'container-header',
      kids: [
        {
          tag: 'nav',
          cls: 'navbar',
          kids: [
            {
              tag: 'ul',
              cls: 'mod-menu mod-list nav nav-pills',
              kids: [
                {
                  tag: 'li',
                  cls: 'nav-item item-101 current active',
                  kids: [{ tag: 'a', kids: ['Forside'] }]
                },
                { tag: 'li', cls: 'nav-item item-102', kids: [{ tag: 'a', kids: ['Kontakt'] }] }
              ]
            }
          ]
        }
      ]
    }
  ]
}

test('describeTarget names an element with every class that lays it out, so a menu pill class is seen', () => {
  const page = fakePage(JOOMLA_MENU)
  const info = /** @type {any} */ (page.describe(page.find({ text: 'Forside' }), ['display'], false))
  const list = info.chain.find((/** @type {string} */ n) => n.startsWith('<ul'))
  assert.ok(list, 'the menu list is among the ancestors')
  assert.match(list, /\.nav-pills>$/, `the agent was told "${list}" and not the class that stacks the items`)
  assert.ok(list.includes('.mod-menu') && list.includes('.mod-list') && list.includes('.nav'), list)
  // the item that holds the words is named in full too, and no name outgrows the cap it always had
  const items = info.chain.filter((/** @type {string} */ n) => n.startsWith('<li'))
  assert.match(items[0], /\.nav-item\.item-101\.current\.active>$/)
  for (const n of info.chain) assert.ok(n.length <= 79, `${n.length}: ${n}`)
})
