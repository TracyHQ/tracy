#!/usr/bin/env node
/**
 * A first draft of a template's slot contract, read off its running home page:
 *
 *   node scripts/discover.mjs --site <url> [--template <name>] [--out <file>]
 *
 * Picks, by computed style, the element that plays each role (the largest heading near the top, a
 * repeated section heading, a body paragraph, the filled call to action, a repeated card, the content
 * container, a padded section) and writes a selector that finds THAT element first. A draft: a person
 * reads it against the page before it becomes `templates/<name>.json`.
 */
import { writeFileSync } from 'node:fs'
import { channels } from '../src/probe.mjs'
import { browser } from './cdp.mjs'

const args = process.argv.slice(2)
const opt = (n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : args[i + 1]
}
const SITE = opt('--site')
// --page: the page measured (default the home page) — a quickstart whose home is a demo chooser is
// read on its real home layout
const PAGE = opt('--page') ?? opt('--path') ?? '/' // --path: batch 3's name for the same
if (!SITE) {
  console.error('usage: discover.mjs --site <url> [--template <name>] [--out <file>]')
  process.exit(1)
}

const VARS = (opt('--vars') ?? '').split(',').filter((v) => /^--[\w-]+$/.test(v))
// --colors <.band,#band>: the text colour each named band computes (what its texts inherit)
const COLORS = (opt('--colors') ?? '').split(',').filter((v) => /^[.#][\w-]+$/.test(v))
const DISCOVER = `(() => {
  const VARS = ${JSON.stringify(VARS)}
  const COLORS = ${JSON.stringify(COLORS)}
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' }
  const chrome = (e) => !!e.closest('header, nav, footer, [role=navigation], .t4-header, .t4-footer, .t4-offcanvas, #t4-header, #t4-footer, .site-header, .site-footer, .tracy-header, .tracy-footer, .offcanvas, .modal')
  const px = (v) => parseFloat(v) || 0
  const rgb = ${channels.toString()}
  const filled = (e) => { const c = rgb(getComputedStyle(e).backgroundColor); return c.length >= 3 && (c[3] === undefined || c[3] > 0.5) }
  const sat = (e) => { const [r, g, b] = rgb(e instanceof Element ? getComputedStyle(e).backgroundColor : e.backgroundColor); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx - mn }
  // a selector that finds e FIRST: tag.classes, widened with ancestors until it does
  const part = (e) => { const cls = [...e.classList].filter((c) => /^[a-zA-Z][\\w-]*$/.test(c) && !/^(is-|has-|wp-container|active|show|open|loaded|aos|animate)/.test(c)).slice(0, 2); return e.tagName.toLowerCase() + cls.map((c) => '.' + CSS.escape(c)).join('') }
  const sel = (e) => { if (e.id && /^[a-zA-Z][\\w-]*$/.test(e.id) && !/^\\w+-\\d+$/.test(e.id)) return '#' + e.id; let s = part(e), p = e.parentElement; for (let i = 0; i < 6 && document.querySelector(s) !== e && p && p !== document.body; i++, p = p.parentElement) s = part(p) + ' ' + s; return document.querySelector(s) === e ? s : null }
  const all = (q) => [...document.querySelectorAll(q)].filter(vis)
  const out = {}, why = {}
  const pick = (role, e, note) => { if (!e) return; const s = sel(e); if (s) { out[role] = s; why[role] = note } }
  pick('page', document.body, 'body')
  const heads = all('h1, h2').filter((e) => !chrome(e) && e.getBoundingClientRect().top + scrollY < 1600).sort((a, b) => px(getComputedStyle(b).fontSize) - px(getComputedStyle(a).fontSize))
  pick('display', heads[0], heads[0] && 'largest heading near the top: ' + getComputedStyle(heads[0]).fontSize)
  // its face, which a wider system face may not outgrow (emit.mjs templateDisplayFace): first family, weight, letter spacing in em
  const face = (e) => { const cs = getComputedStyle(e); const f = cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''); const ls = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing) / px(cs.fontSize); return f + ' ' + cs.fontWeight + ', tracking ' + Math.round(ls * 1000) / 1000 + 'em' }
  if (why.display) why.displayFace = face(heads[0])
  const h2 = all('main h2, article h2, h2').filter((e) => !chrome(e) && e !== heads[0] && px(getComputedStyle(e).fontSize) >= 22)
  pick('heading', h2[0], h2[0] && 'first section heading: ' + getComputedStyle(h2[0]).fontSize)
  const ps = all('p').filter((e) => !chrome(e) && e.textContent.trim().length > 60 && px(getComputedStyle(e).fontSize) >= 14 && px(getComputedStyle(e).fontSize) <= 20)
  pick('body', ps[0], ps[0] && 'first body paragraph')
  const ctas = all('a, button').filter((e) => !chrome(e) && filled(e) && sat(e) > 30 && e.textContent.trim().length > 1 && e.textContent.trim().length < 40 && e.getBoundingClientRect().height >= 28 && e.getBoundingClientRect().height <= 80)
  pick('button-primary', ctas[0], ctas[0] && 'first filled, coloured call to action: ' + getComputedStyle(ctas[0]).backgroundColor)
  const boxes = all('div, article, li').filter((e) => !chrome(e) && px(getComputedStyle(e).borderTopLeftRadius) > 0 && (px(getComputedStyle(e).borderTopWidth) > 0 || getComputedStyle(e).boxShadow !== 'none') && e.getBoundingClientRect().width > 180 && e.getBoundingClientRect().width < 640)
  const byPart = {}; for (const b of boxes) { const k = part(b); (byPart[k] ||= []).push(b) }
  const card = Object.values(byPart).sort((a, b) => b.length - a.length).find((l) => l.length >= 2)
  pick('card', card?.[0], card && 'repeated rounded box ×' + card.length)
  const conts = all('div, section, main').filter((e) => !chrome(e) && getComputedStyle(e).maxWidth !== 'none' && px(getComputedStyle(e).maxWidth) >= 900 && e.getBoundingClientRect().width < innerWidth - 20)
  pick('container', conts[0], conts[0] && 'first content container, max-width ' + getComputedStyle(conts[0]).maxWidth)
  const secs = all('section, div').filter((e) => !chrome(e) && px(getComputedStyle(e).paddingTop) >= 40 && e.getBoundingClientRect().width >= innerWidth - 40 && e.getBoundingClientRect().top + scrollY > 300)
  pick('section', secs[0], secs[0] && 'first padded full-width section, padding-top ' + getComputedStyle(secs[0]).paddingTop)
  const inp = all('input[type=text], input[type=email], textarea').filter((e) => !chrome(e))
  pick('input', inp[0], inp[0] && 'first text field')
  // the palette the default page PAINTS (a T4 theme file can describe a look the page never shows:
  // JA Kinetic's light keys under a dark home page) — hex, each from the element that plays the role
  const hex = (c) => { const m = rgb(c); return m.length >= 3 && (m[3] === undefined || m[3] > 0.95) ? '#' + m.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') : null }
  const fillOf = (e) => { for (let x = e; x; x = x.parentElement) { const h = hex(getComputedStyle(x).backgroundColor); if (h) return h } return null }
  const pal = {}
  // what text below the hero sits on and is painted in, weighted by length (a hero's lead sits on
  // a photo, a band's text on the band: the page is the ground most text sits on)
  const below = (e) => e.getBoundingClientRect().top + scrollY > innerHeight * 0.9
  const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0)
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const tally = (els) => { const t = {}; for (const e of els) { const c = hex(getComputedStyle(e).color), g = fillOf(e); if (c && g) { const k = c + ' ' + g; t[k] = (t[k] ?? 0) + e.textContent.trim().length } } return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ c: k.split(' ')[0], g: k.split(' ')[1], n })) }
  const texts = tally(all('p, li').filter((e) => !chrome(e) && below(e) && e.textContent.trim().length > 30 && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())))
  const grounds = {}
  for (const t of texts) grounds[t.g] = (grounds[t.g] ?? 0) + t.n
  pal.bg = Object.entries(grounds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? fillOf(document.body)
  // the body's own fill is the page when it is on the same side of light as that ground (JA Kinetic:
  // a near-black body, its sections a shade lighter); a dark body behind a light wrapper (JA Donate)
  // is not the page
  const bodyFill = hex(getComputedStyle(document.body).backgroundColor)
  let textGround = pal.bg
  if (bodyFill && pal.bg && bodyFill !== pal.bg && Math.abs(lum(bodyFill) - lum(pal.bg)) < 0.2) { pal.surface = pal.bg; pal.bg = bodyFill }
  const onPage = texts.filter((t) => t.g === textGround)
  if (onPage[0]) pal.fg = onPage[0].c
  const quieter = onPage.find((t) => t.c !== pal.fg && ratio(t.c, pal.bg) < ratio(pal.fg, pal.bg))
  if (quieter) pal.muted = quieter.c
  // every other text colour on the page's ground: body text when it reads as strongly as the body
  // colour, muted otherwise (JA Tour's intro grey is in no palette)
  const textsOnPage = [...new Set(onPage.map((t) => t.c))].filter((c) => c !== pal.fg && c !== pal.muted).slice(0, 6).map((c) => ({ hex: c, role: pal.fg && ratio(c, pal.bg) >= ratio(pal.fg, pal.bg) * 0.85 ? 'fg' : 'muted' }))
  const heads2 = tally(all('h2, h3').filter((e) => !chrome(e) && below(e))).filter((t) => t.g === textGround)
  if (heads2[0]) pal['fg-2'] = heads2[0].c
  if (ctas[0]) { pal.accent = hex(getComputedStyle(ctas[0]).backgroundColor); pal['accent-on'] = hex(getComputedStyle(ctas[0]).color) }
  const link = all('main a, .t4-section a, #t3-mainbody a, a').find((e) => !chrome(e) && !filled(e) && e.textContent.trim().length > 2 && !e.querySelector('img') && sat({ backgroundColor: getComputedStyle(e).color }) > 40)
  if (link) pal.link = hex(getComputedStyle(link).color)
  if (card?.[0]) { const cs = getComputedStyle(card[0]); const f = hex(cs.backgroundColor); if (f && f !== pal.bg && !pal.surface) pal.surface = f; if (parseFloat(cs.borderTopWidth) > 0) pal.border = hex(cs.borderTopColor) }
  // the band most painted besides the page and the cards
  const bands = {}
  for (const e of all('section, div').filter((e) => !chrome(e) && e.getBoundingClientRect().width >= innerWidth - 40)) { const f = hex(getComputedStyle(e).backgroundColor); if (f && f !== pal.bg && f !== pal.surface) bands[f] = (bands[f] ?? 0) + e.getBoundingClientRect().height }
  const band = Object.entries(bands).sort((a, b) => b[1] - a[1])[0]
  if (band) pal['surface-warm'] = band[0]
  if (!pal.border) { const hr = all('hr, .card, [class*=card]').find((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0); if (hr) pal.border = hex(getComputedStyle(hr).borderTopColor) }
  for (const k of Object.keys(pal)) if (!pal[k]) delete pal[k]
  // the page role: <body> when it is painted the page colour, else the outermost element that is
  if (pal.bg && hex(getComputedStyle(document.body).backgroundColor) !== pal.bg) {
    const page = [...document.querySelectorAll('body > *, body > * > *, body > * > * > *')].find((e) => vis(e) && hex(getComputedStyle(e).backgroundColor) === pal.bg && e.getBoundingClientRect().width >= innerWidth - 40)
    if (page) pick('page', page, 'outermost element painted the page colour (body is not)')
  }
  // every colour the page paints, by kind — what a theme file's value is checked against
  const seen = { text: new Set(), fill: new Set(), line: new Set() }
  for (const e of all('body *')) {
    const cs = getComputedStyle(e)
    if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) seen.text.add(hex(cs.color))
    seen.fill.add(hex(cs.backgroundColor))
    if (parseFloat(cs.borderTopWidth) > 0) seen.line.add(hex(cs.borderTopColor))
  }
  const paints = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, [...v].filter(Boolean)]))
  // inverse bands (header and footer included): full-width fills on the other side of light from
  // the page — each named by its id or by a class that ONLY inverse bands carry (a class every
  // section shares, JA's .ja-acm, would keep the whole page), for the tokenizer to keep
  const wide = [...document.querySelectorAll('header, footer, section, div, nav')].filter((e) => vis(e) && e.getBoundingClientRect().width >= innerWidth - 40)
  const isInverse = (e) => { const f = hex(getComputedStyle(e).backgroundColor); return !!f && !!pal.bg && Math.abs(lum(f) - lum(pal.bg)) >= 0.5 }
  const inverse = new Set()
  // a band, not the page's backdrop: shorter than a third of the page, holding nothing painted in
  // the page colour (JA Directory's dark .t3-wrapper sits behind every white section)
  const docH = document.documentElement.scrollHeight
  const holdsPage = (e) => [...e.querySelectorAll('section, div, main, article')].some((x) => hex(getComputedStyle(x).backgroundColor) === pal.bg && x.getBoundingClientRect().height > 80)
  for (const e of wide.filter((e) => isInverse(e) && e.getBoundingClientRect().height < docH / 3 && !holdsPage(e))) {
    const id = e.id && /^[a-zA-Z][\\w-]*$/.test(e.id) && !/\\d{2,}/.test(e.id) ? '#' + e.id : null
    const cls = [...e.classList].find((c) => /^[a-zA-Z][\\w-]*$/.test(c) && wide.filter((x) => x.classList.contains(c)).every(isInverse) && document.querySelectorAll('.' + CSS.escape(c)).length <= 3)
    if (cls || id) inverse.add(cls ? '.' + cls : id)
  }
  const rootVars = {}
  for (const k of VARS) { const v = getComputedStyle(document.documentElement).getPropertyValue(k).trim(); if (v) rootVars[k] = v }
  const bandColors = {}
  for (const s of COLORS) { const e = document.querySelector(s); if (e) bandColors[s] = getComputedStyle(e).color }
  // the call to action judged is one outside a kept band (inside one it keeps the template's look)
  const inKept = (e) => [...inverse].some((s) => e.closest(s))
  const cta = ctas.find((e) => !inKept(e))
  if (cta && cta !== ctas[0]) pick('button-primary', cta, 'first filled call to action outside a kept band: ' + getComputedStyle(cta).backgroundColor)
  return { roles: out, why, palette: pal, paints, inverse: [...inverse], rootVars, bandColors, textsOnPage }
})()`

// --block <pattern,…>: URLs the browser fails at once (the contract's measureBlock)
const BLOCK = (opt('--block') ?? '').split(',').filter(Boolean)
const b = await browser(Number(opt('--cdp') ?? 9371), { block: BLOCK })
try {
  await b.open(`${SITE}${PAGE}`, 1440)
  const r = await b.evaluate(DISCOVER)
  const draft = {
    schema: 'tracy-ds-template/v1',
    template: opt('--template') ?? 'draft',
    roles: r.roles,
    discovered: r.why,
    painted: r.palette,
    paints: r.paints,
    inverse: r.inverse,
    rootVars: r.rootVars,
    bandColors: r.bandColors,
    textsOnPage: r.textsOnPage
  }
  const json = `${JSON.stringify(draft, null, 2)}\n`
  if (opt('--out')) writeFileSync(opt('--out'), json)
  process.stdout.write(json)
} finally {
  b.close()
}
