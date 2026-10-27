#!/usr/bin/env node
/**
 * Read the bands a template keeps (`keepScopes`) off its RUNNING default page and draft the
 * contract's `bands` (src/bands.mjs): each band's ground, the text colours it shows on it, and what
 * it paints with a colour of its own (the template's accent: an orange word, a rule, an icon).
 *
 *   node scripts/bands.mjs --site http://127.0.0.1:52101 --template wordpress-tracy-business \
 *        [--page /about/] [--out <file.json>] [--cdp 9381] [--draft [--force]]
 *
 * --draft writes what it read into the contract's `bands` when it has none (--force: replace them):
 * every band that is not a picture and is at least a card's size (240px wide, 40px tall), with its
 * ground, its text colours and the accent paints found. A Joomla band paints its
 * ground `!important` (T4's generated palettes are !important literals).
 *
 * Prints, per band key, `{ ground, texts, kind, picture, paint, count }`. A person (or the agent doing
 * the template) reads it before anything goes into a contract: a band that is a picture (`picture`),
 * a logo or a map stays kept; `paint` selectors are drafts built from class names. Measure on a page
 * that wears NO system (a fresh stand), or the grounds read are the worn system's.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser } from './cdp.mjs'
import { loadContract } from '../src/library.mjs'
import { kindOf } from '../src/bands.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 ? fallback : args.splice(i, 2)[1]
}
const SITE = opt('--site')
const TEMPLATE = opt('--template')
const PAGE = opt('--page') ?? '/'
const OUT = opt('--out')
const CDP = Number(opt('--cdp') ?? 9381)
const DRAFT = args.includes('--draft')
const FORCE = args.includes('--force')
// --fills: also the blocks of the template's own colour outside every kept band (JA Impact's orange
// call band and green event card stayed the template's under every system): drafted as `fill` bands
const FILLS = args.includes('--fills')
if (!SITE || !TEMPLATE) {
  console.error('usage: bands.mjs --site <url> --template <contract> [--page <path>] [--out <file>]')
  process.exit(2)
}
const contract = loadContract(TEMPLATE)
const scopes = (contract.keepScopes ?? []).filter((x) => /^[.#][\w-]+$/.test(x))

/** Runs in the page: one record per band element variant (and, with `fills`, per own-colour block). */
const PROBE = (scopes, fills, worn) => {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  // any CSS colour (oklab, color-mix, rgba) → [r, g, b, a] as the browser paints it
  const rgba = (c) => {
    if (!c || c === 'transparent') return [0, 0, 0, 0]
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = '#000'
    cx.fillStyle = c
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  const hex = ([r, g, b]) => `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`
  const over = (top, under) => {
    const a = top[3]
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1)
  }
  const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b)
  const lum = ([r, g, b]) =>
    [r, g, b]
      .map((v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (x, y) => {
    const a = lum(x)
    const b = lum(y)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }
  const dist = (a, b) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])))
  const visible = (e) => {
    const r = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    return (
      r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05
    )
  }
  const area = (e) => {
    const r = e.getBoundingClientRect()
    return r.width * r.height
  }
  // a class that names what an element IS, not its state or a generated layout id
  const meaningful = (c) =>
    !/^(is-|has-|wp-container|wp-elements|wp-block-[a-z-]+-is-layout|is-layout|active$|show$|current|aos|animate|wow|fade|delay|col-|row$|d-|p[xytblr]?-|m[xytblr]?-|text-|align|order-|flex|justify|gap-)/.test(
      c
    ) && c.length < 60
  const own = (e) => [...e.classList].filter(meaningful)
  // a short selector for `e` inside `root`: its own class, or its tag under the nearest classed parent
  const selectorOf = (e, root, pseudo = '') => {
    const parts = []
    let n = e
    for (let i = 0; n && n !== root && i < 3; i++) {
      const cls = own(n)
      parts.unshift(cls.length ? `.${cls[0]}` : n.tagName.toLowerCase())
      if (cls.length) break
      n = n.parentElement
    }
    return parts.join(' ') + pseudo
  }
  // a gradient ground (no picture in it): the mean of its colour stops (GK Restly's purple hero read as
  // the white page under it, 13/10/2026)
  const gradientOf = (st) => {
    const bi = st.backgroundImage
    if (!/gradient\(/.test(bi) || /url\(/.test(bi)) return null
    const stops = (bi.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? []).map(rgba).filter((c) => c[3] > 0.5)
    if (!stops.length) return null
    return [0, 1, 2].map((i) => stops.reduce((a, c) => a + c[i], 0) / stops.length).concat(1)
  }
  const groundOf = (e) => {
    for (let n = e; n; n = n.parentElement) {
      const st = getComputedStyle(n)
      const c = rgba(st.backgroundColor)
      if (c[3] > 0.5) return { el: n, c: c[3] < 1 ? over(c, [255, 255, 255, 1]) : c }
      const g = gradientOf(st)
      if (g) return { el: n, c: g, gradient: true }
    }
    return { el: document.documentElement, c: [255, 255, 255, 1] }
  }
  const out = {}
  for (const scope of scopes) {
    const name = scope.slice(1)
    for (const root of document.querySelectorAll(scope)) {
      if (!visible(root)) continue
      // BEM modifiers of the scope's own class name the variant (`.wtb-cta--panel`)
      const mods = scope.startsWith('.') ? [...root.classList].filter((c) => c.startsWith(`${name}--`)) : []
      const key = scope + mods.map((m) => `.${m}`).join('')
      if (out[key]) {
        out[key].count++
        continue
      }
      const all = [root, ...root.querySelectorAll('*')].filter(visible)
      const rootArea = area(root) || 1
      // the ground the band shows: the largest opaque fill at or under the root covering half of it
      let ground = groundOf(root)
      let groundEl = ground.el
      // the band's ground is an inner element only when it truly wraps the band's content: a page-wide
      // wrapper, a carousel's stage or a content block it happens to hold is not (JA Donate's topbar
      // read its ground off .features-content, which the draft then painted)
      const wrapperLike = (x) =>
        /(^|\s)(t3-wrapper|t4-wrapper|owl-stage|owl-stage-outer|features-content|swiper-wrapper)(\s|$)/.test(
          String(x.className ?? '')
        )
      for (const e of all) {
        if (e === root || area(e) < rootArea * 0.5 || wrapperLike(e)) continue
        const st = getComputedStyle(e)
        const c = rgba(st.backgroundColor)
        const g = c[3] > 0.5 ? null : gradientOf(st)
        if (c[3] > 0.5 || g) {
          ground = g ? { el: e, c: g, gradient: true } : { el: e, c }
          groundEl = e
          break
        }
      }
      // a picture: an image or a background image covering most of the band (60%), so its own ground
      // barely shows. A band with a photo beside or below its words (GK Compact's hero: a dark panel
      // over an office photo) shows its ground and wears the system's
      const pics = all.filter(
        (e) =>
          e.tagName === 'IMG' || e.tagName === 'VIDEO' || /url\(/.test(getComputedStyle(e).backgroundImage)
      )
      const picture = pics.some((e) => area(e) >= rootArea * 0.6)
      const texts = new Map()
      const paint = {}
      const add = (sel, prop, role) => {
        paint[sel] = { ...paint[sel], [prop]: role }
      }
      // a call to action (its fill is the button rule's, keptButtons) or a logo / brand mark (the
      // template's identity) is never an accent paint of the band
      const skip = (e) =>
        e.closest(
          'a[class*=btn], a[class*=button], button, .btn, [class*=button__link], [class*=logo], [class*=brand]'
        )
      for (const e of all) {
        const chrome = skip(e)
        const s = getComputedStyle(e)
        const g = groundOf(e)
        const onGround = dist(g.c, ground.c) <= 6
        const direct = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
        const fg = rgba(s.color)
        const fgOn = fg[3] < 1 ? over(fg, g.c) : fg
        if (direct && onGround) {
          if (chroma(fgOn) >= 60 && dist(fgOn, ground.c) > 40) {
            if (!chrome) add(selectorOf(e, root), 'color', 'accent')
          } else texts.set(hex(fgOn), (texts.get(hex(fgOn)) ?? 0) + 1)
        }
        // fills and rules in a colour of their own (not the ground, not a neutral): the accent's
        if (chrome) continue
        for (const [pseudo, st] of [
          ['', s],
          ['::before', getComputedStyle(e, '::before')],
          ['::after', getComputedStyle(e, '::after')]
        ]) {
          if (pseudo && (st.content === 'none' || st.content === 'normal')) continue
          const bg = rgba(st.backgroundColor)
          if (
            bg[3] > 0.5 &&
            chroma(bg) >= 60 &&
            dist(bg, ground.c) > 40 &&
            !(e.matches('a, button') && direct)
          )
            add(selectorOf(e, root, pseudo), 'background-color', 'accent-fill')
          const bc = rgba(st.borderTopColor)
          if (parseFloat(st.borderTopWidth) > 0 && bc[3] > 0.5 && chroma(bc) >= 60 && dist(bc, ground.c) > 40)
            add(selectorOf(e, root, pseudo), 'border-color', 'accent-fill')
        }
        if (
          e !== root &&
          e !== groundEl &&
          onGround &&
          dist(rgba(s.backgroundColor), ground.c) <= 6 &&
          area(e) >= rootArea * 0.3
        )
          add(selectorOf(e, root), 'background-color', 'ground')
      }
      out[key] = {
        ground: hex(ground.c),
        groundBy: groundEl === root ? 'root' : selectorOf(groundEl, root),
        ...(ground.gradient && { gradient: true }),
        texts: [...texts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h),
        picture,
        paint,
        width: Math.round(root.getBoundingClientRect().width),
        height: Math.round(root.getBoundingClientRect().height),
        count: 1
      }
    }
  }
  // the template's eyebrows: a small label (15px or less), upper-case or spaced out, set right above
  // a heading — where the system's eyebrow is worn (selectors.eyebrow)
  const eyebrows = new Map()
  for (const h of document.querySelectorAll('h1, h2, h3')) {
    if (!visible(h)) continue
    const near = [
      h.previousElementSibling,
      h.parentElement?.previousElementSibling,
      h.parentElement?.firstElementChild
    ]
    for (const e of near) {
      if (!e || e === h || !visible(e) || e.contains(h)) continue
      if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      const st = getComputedStyle(e)
      const size = parseFloat(st.fontSize)
      const spaced = parseFloat(st.letterSpacing) >= size * 0.04
      if (size > 15 || !(st.textTransform === 'uppercase' || spaced)) continue
      const cls = own(e)
      if (!cls.length) continue
      const sel = `.${cls[0]}`
      eyebrows.set(sel, (eyebrows.get(sel) ?? 0) + 1)
    }
  }
  out['@eyebrow'] = [...eyebrows.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sel]) => sel)
    .slice(0, 6)
  // rounded boxes the template repeats (cards: 140px+ wide, a fill, a line or a shadow, 2+ of one
  // class) and rounded labels (pills: 32px tall or less, a fill or a line): where the system's card
  // and pill radius are worn (selectors.cardLike, selectors.pill)
  const boxes = new Map()
  const pills = new Map()
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e)) continue
    const st = getComputedStyle(e)
    if (!(parseFloat(st.borderTopLeftRadius) > 0)) continue
    const painted =
      rgba(st.backgroundColor)[3] > 0.5 ||
      (parseFloat(st.borderTopWidth) > 0 && rgba(st.borderTopColor)[3] > 0.3) ||
      st.boxShadow !== 'none'
    if (!painted || /^(IMG|VIDEO|SVG|INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(e.tagName)) continue
    if (e.closest('a[class*=btn], [class*=button], .btn')) continue
    const cls = own(e)
    if (!cls.length) continue
    const sel = `.${cls[0]}`
    const r = e.getBoundingClientRect()
    const words = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (r.height <= 32 && r.width <= 220 && words) pills.set(sel, (pills.get(sel) ?? 0) + 1)
    else if (r.width >= 140 && r.height >= 80) boxes.set(sel, (boxes.get(sel) ?? 0) + 1)
  }
  // a selector names rounded boxes only when every box it matches is rounded and painted: a layout
  // class every section carries (WordPress's .wp-block-group, JA Kinetic 12/10/2026) is never one
  const roundedAll = (sel) =>
    [...document.querySelectorAll(sel)].filter(visible).every((x) => {
      const st = getComputedStyle(x)
      return parseFloat(st.borderTopLeftRadius) > 0
    })
  const generic = (sel) => /^\.(wp-block-|container|row$|col-|section|wrapper|inner|content)/.test(sel)
  const top = (m, n) =>
    [...m.entries()]
      .filter(([sel, c]) => c >= 2 && !generic(sel) && roundedAll(sel))
      .sort((a, b) => b[1] - a[1])
      .map(([sel]) => sel)
      .slice(0, n)
  out['@cardLike'] = top(boxes, 8)
  out['@pill'] = top(pills, 6)
  if (fills) {
    // blocks inside a band that wears the system are that band's; inside a picture band (whose ground
    // stays) they are looked for like any other (JA Healthcare's navy card over its hero photo)
    const pictureBands = new Set(
      Object.entries(out)
        .filter(([, v]) => v.picture)
        .map(([k]) => k)
    )
    const kept = [...scopes, ...worn].filter((k) => !pictureBands.has(k)).join(', ')
    const page = document.documentElement.scrollWidth * document.documentElement.scrollHeight
    for (const e of document.querySelectorAll('body *')) {
      if (!visible(e) || (kept && e.closest(kept))) continue
      if (
        e.closest('a, button, [class*=btn], [class*=button], [class*=logo], [class*=brand], [class*=badge]')
      )
        continue
      const s = getComputedStyle(e)
      // a gradient with no picture in it is a coloured block too (GK Restly's purple hero stayed the
      // template's under every system, 46–85% of the first screen, 13/10/2026): read as its stops' mean
      const grad = s.backgroundImage !== 'none' ? gradientOf(s) : null
      if (s.backgroundImage !== 'none' && !grad) continue
      const c = grad ?? rgba(s.backgroundColor)
      const r = e.getBoundingClientRect()
      // a coloured block, or a dark one with a tint of its own (a navy or forest panel): not a grey
      const tinted = chroma(c) >= 60 || (lum(c) < 0.08 && chroma(c) >= 15)
      if (c[3] < 0.9 || !tinted || r.width < 240 || r.height < 60 || r.width * r.height < page * 0.004)
        continue
      // nor the page itself: a block over most of it is its ground, which the page's own colours carry
      // (JA Conference's dark page wrapper, .t3-wrapper, drafted as an ink fill repainted every word of
      // the page, 12/12 → 4/12, 13/10/2026)
      if (r.width * r.height > page * 0.4) continue
      const cls = own(e)
      if (!cls.length) continue
      // the selector must name blocks of this one colour only: the element's first class, else all its
      // classes together (a card whose colour is a variant class beside a shared one), else its parent's
      // first class above it
      const parent = e.parentElement ? own(e.parentElement) : []
      const tries = [
        `.${cls[0]}`,
        `.${cls.join('.')}`,
        ...(parent.length ? [`.${parent[0]} > .${cls.join('.')}`] : [])
      ]
      // a selector made only of the framework's own classes (T3's .t3-module on every module, .wrap
      // on every section) names every block of that kind, not this colour's: JA Rent's footer module
      // drafted as `.t3-module` painted every module of the page dark, its page ground too (13/10/2026)
      const framework = (t) =>
        t
          .split('>')
          .pop()
          .trim()
          .split('.')
          .filter(Boolean)
          .every((k) =>
            /^(t[34]-(module|section|wrapper|mainbody|row|col)|moduletable|module|mod-|wrap|wrapper|section|container|row|col(-.*)?|inner|content|item|block|clearfix)$/.test(
              k
            )
          )
      const sel = tries.find((t) => {
        if (framework(t)) return false
        try {
          return [...document.querySelectorAll(t)]
            .filter(visible)
            .every((x) => dist(rgba(getComputedStyle(x).backgroundColor), c) <= 6)
        } catch {
          return false
        }
      })
      if (!sel || out[sel]) continue
      const all = [...document.querySelectorAll(sel)].filter(visible)
      const texts = new Map()
      const words = new Map()
      let elsewhere = 0
      for (const x of [e, ...e.querySelectorAll('*')]) {
        if (!visible(x) || x.closest('a[class*=btn], a[class*=button], button, .btn, [class*=button__link]'))
          continue
        if (![...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
        const g = groundOf(x)
        if (dist(g.c, c) > 6) {
          elsewhere++
          continue
        }
        const fg = rgba(getComputedStyle(x).color)
        const on = fg[3] < 1 ? over(fg, g.c) : fg
        const h = hex(on)
        texts.set(h, (texts.get(h) ?? 0) + 1)
        // the words that read on the fill are its own; a word that does not (a grey line of a white
        // card drawn by a pseudo-element over the fill, JA Alpha 13/10/2026) sits on something else
        if (ratio(on, c) >= 3) {
          const w = selectorOf(x, e)
          words.set(w, (words.get(w) ?? 0) + 1)
        }
      }
      // a block whose words all sit on something laid over it (a picture, a card) and none on its own
      // colour: repainting it reads nothing and can put that see-through layer's white words on white
      // (JA Nova's purple blocks under BMW, Stripe and Vercel, 13/10/2026)
      if (!texts.size && elsewhere) continue
      // nor a block with no words at all: a decoration (JA Seven's mint glow laid behind its hero title,
      // a sibling, not a parent) painted the system's accent darkens what is drawn over it
      if (!texts.size) continue
      out[sel] = {
        ground: hex(c),
        groundBy: 'root',
        words: [...words.keys()].slice(0, 12),
        texts: [...texts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h),
        picture: false,
        paint: {},
        width: Math.round(r.width),
        height: Math.round(r.height),
        count: all.length,
        fill: true,
        ...(grad && { gradient: true }),
        ...(lum(c) < 0.08 && chroma(c) < 60 && { dark: true })
      }
    }
  }
  return out
}

/**
 * The contract's `bands`, drafted from what was read: a band at least half the page wide and 40px
 * tall that is not a picture. Written only when the contract has none (or --force).
 */
function draft(found, roles = {}) {
  const file = join(dirname(fileURLToPath(import.meta.url)), '../templates', `${TEMPLATE}.json`)
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  // the eyebrows, cards and pills found, each when the contract names none
  let named = false
  for (const k of ['eyebrow', 'cardLike', 'pill'])
    if (roles[k]?.length && !raw.selectors?.[k]) {
      raw.selectors = { ...raw.selectors, [k]: roles[k] }
      named = true
    }
  if (named) writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`)
  if (raw.bands && !FORCE && !FILLS) return null
  // (with --fills, a contract that has bands gets the kept bands and fills it is missing)
  const joomla = String(raw.template ?? '').startsWith('joomla') || TEMPLATE.startsWith('joomla-')
  const bands = {}
  const had = raw.bands && !FORCE ? raw.bands : {}
  // a selector of tag names only (`div`, `span p`) names every such element in the band: never drafted
  // (JA Directory's `div` painted every block of its featured column with the accent, 13/10/2026)
  // tag names only, or a path through body/html (GK Compact's `.com_content body div`): the same guard
  // as src/bands.mjs
  const bare = (sel) =>
    /^[a-z][a-z0-9]*(\s+[a-z][a-z0-9]*)*(::?(before|after))?$/.test(String(sel).trim()) ||
    /(^|[\s>+~])(body|html)([\s>+~.#:[]|$)/.test(String(sel).trim())
  for (const v of Object.values(found)) {
    if (v.paint) for (const sel of Object.keys(v.paint)) if (bare(sel)) delete v.paint[sel]
    if (v.words) v.words = v.words.filter((w) => !bare(w))
    if (v.groundBy && v.groundBy !== 'root' && bare(v.groundBy)) v.groundBy = 'root'
  }
  // what a band already paints (a picture band's card: JA Smallbiz's slider box, `accent-fill` with the
  // text that reads on it) is not drafted again as a fill: the two fought, the fill's white words on
  // the picture band's light fill (2.5:1, 13/10/2026)
  const painted = new Set(
    Object.values({ ...had, ...found })
      .flatMap((b) => Object.keys(b?.paint ?? {}))
      .map((k) => k.trim())
  )
  for (const [key, v] of Object.entries(found)) {
    if (v.fill && painted.has(key)) continue
    // a fill drafted before its words were read gets them now
    if (had[key]?.fill && !had[key].words && v.words?.length) {
      had[key] = { ...had[key], words: v.words }
      continue
    }
    if (had[key]) continue
    // a band the contract keeps whole on purpose (`keepWhole`: JA Resume's contact card, whose drafted
    // band repainted the wrong box) is never drafted again
    if (Object.hasOwn(raw.keepWhole ?? {}, key)) continue
    // a kept band of a card's size at least (JA Nova's orange stat cards, 300px wide, stayed the
    // template's under every system); a fill is already sized by the probe. Bands already in the
    // contract are kept as they are, missing ones added
    // a bar along an edge counts too: wide and short (a topbar) or tall and narrow (JA Colab's follow-us bar)
    const bar = v.width * v.height >= 240 * 40 && Math.max(v.width, v.height) >= 300
    if ((!v.fill && !bar) || !/^#[0-9a-f]{6}$/.test(v.ground)) continue
    // a picture band keeps its picture and ground; its accent marks and buttons still wear the system
    if (v.picture) {
      bands[key] = {
        ground: v.ground,
        texts: v.texts.slice(0, 8),
        picture: true,
        ...(Object.keys(v.paint).length && { paint: { ...v.paint } }),
        ...(joomla && { important: true })
      }
      continue
    }
    const paint = { ...v.paint }
    if (v.groundBy !== 'root') paint[v.groundBy] = { ...paint[v.groundBy], 'background-color': 'ground' }
    bands[key] = {
      ground: v.ground,
      texts: v.texts.slice(0, 8),
      ...(v.groundBy !== 'root' && { root: false }),
      ...(Object.keys(paint).length && { paint }),
      ...(joomla && { important: true }),
      ...(v.gradient && { gradient: true, kind: 'brand', repaint: true }),
      ...(v.fill && {
        fill: true,
        kind: v.dark ? 'ink' : 'brand',
        ...(v.words?.length && { words: v.words })
      })
    }
  }
  if (!Object.keys(bands).length) return {}
  raw.bands = { ...had, ...bands }
  raw.bandsNote = `drafted ${new Date().toISOString().slice(0, 10)} by scripts/bands.mjs off the released default page (${PAGE}): each kept band that is not a picture wears the system's ground (src/bands.mjs), its words keep their colours`
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`)
  return bands
}

const b = await browser(CDP)
try {
  await b.open(`${SITE.replace(/\/$/, '')}${PAGE}`, 1440)
  // blocks the contract already gives a role are worn too: its palette bands (JA Resort's two green
  // sections take the system's ink there; a fill drafted over them fought that rule under Spotify)
  const worn = [
    ...Object.keys(contract.bands ?? {}),
    ...Object.keys(contract.paletteBands ?? {}).filter((k) => /^[.#][\w-]+([.#][\w-]+)*$/.test(k))
  ]
  const found = await b.evaluate(
    `(${PROBE.toString()})(${JSON.stringify(scopes)}, ${FILLS}, ${JSON.stringify(worn)})`
  )
  const eyebrow = found['@eyebrow'] ?? []
  const cardLike = found['@cardLike'] ?? []
  const pill = found['@pill'] ?? []
  for (const k of ['@eyebrow', '@cardLike', '@pill']) delete found[k]
  for (const v of Object.values(found)) v.kind = kindOf(v.ground)
  const missing = scopes.filter((s) => !Object.keys(found).some((k) => k.startsWith(s)))
  const report = { template: TEMPLATE, page: PAGE, bands: found, eyebrow, cardLike, pill, notOnPage: missing }
  if (DRAFT) report.drafted = draft(found, { eyebrow, cardLike, pill })
  const text = JSON.stringify(report, null, 2)
  if (OUT) writeFileSync(OUT, `${text}\n`)
  console.log(text)
} finally {
  await b.close()
}
