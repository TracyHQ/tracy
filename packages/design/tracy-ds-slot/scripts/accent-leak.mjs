#!/usr/bin/env node
/**
 * accent-leak.mjs: find the template's own brand colours that stay on screen while a design system
 * is worn (an "accent leak"), and template colour roles the system splits apart (a "drift").
 *
 *   node accent-leak.mjs --site <origin> --pages /,/index.php/contact,... --slots <dir with <name>.html>
 *        [--brand '#df4040,#db2020'] [--not-brand '#dc3545'] [--schemes light,dark] [--systems a,b]
 *        [--out <dir>] [--hover] [--width 1440] [--from-raw <out>/raw.json]
 *        [--playwright <path to playwright's index.mjs>]   (or PLAYWRIGHT_MODULE; tch does not ship it)
 *
 * <slots dir>: one file per system, the exact bytes the design-system module writes (emitFor + slotOf),
 * named <system>.html. The running site's own slot (style#tracy-ds-slot) is stripped from every
 * response, so the site may wear anything; with no slot laid ("default") the page is the template's.
 *
 * Per page, scheme and look (default + each system) it walks every visible element, its ::before and
 * ::after, and (with --hover) every hover target the stylesheets name (forced :hover on it and its
 * ancestors through CDP), and records each painted colour: text (only where text or an icon glyph is
 * drawn), fill, borders, outline, underline, box-shadow, text-shadow, SVG fill/stroke, gradient stops,
 * and the dominant colour of small pictures (CSS backgrounds, masks, img icons, SVG files).
 *
 * Rules (each finding names page, scheme, system, state, selector path, property, colours):
 *   LEAK   under a system a painted colour is a template brand colour (RGB distance < 24) while none of
 *          the system's accent colours is (the system did not ask for that colour).
 *   DRIFT  a colour that was a brand colour without a system is, under the system, none of the
 *          system's accent colours (the template's accent role landed on another role). Read by a person:
 *          a contrast guard may legitimately move it.
 *   PIC    a picture whose opaque pixels are mostly a brand colour, under a system: the picture
 *          cannot follow the accent (needs a mask, currentColor or an inline SVG reading a variable).
 *          A picture drawn as a mask or through an SVG filter of the page (feFlood) is judged by its
 *          paint (the mask's background-color, the flood colour) under LEAK instead. Pictures the T4
 *          optimizer inlined as data: URIs are read too.
 *   SPLIT  links and buttons the template paints alike (same colour, state and property; at rest only
 *          for brand colours) that a system paints in more than one colour, unless every part is one of
 *          the system's accent shades: the template's pair (header vs footer hover) came apart.
 * --not-brand: template colours near the brand that play another role (Bootstrap's danger), left out.
 * LEAK does not count a colour the system itself names (any --ds-c-* of the slot, e.g. its danger).
 * Brand colours: --brand, else every chromatic colour (HSL saturation >= 0.35, 0.15 < lightness < 0.85)
 * painted on the default look, with how often it was seen.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const SITE = opt('--site')
const PAGES = opt('--pages', '/').split(',')
const SLOTS = opt('--slots')
const SCHEMES = opt('--schemes', 'light,dark').split(',')
const OUT = opt('--out', '.')
const HOVER = args.includes('--hover')
const WIDTH = Number(opt('--width', 1440))
// Playwright drives the browser (forced :hover through CDP); tch has no dependency on it, so name a checkout
const PW = opt('--playwright', process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const ONLY = opt('--systems')
if (!SITE || !SLOTS) {
  console.error('usage: accent-leak.mjs --site <origin> --pages <a,b> --slots <dir> [--brand ...] [--hover]')
  process.exit(2)
}
const { chromium } = opt('--from-raw') ? {} : await import(PW)
mkdirSync(OUT, { recursive: true })

const slots = Object.fromEntries(
  readdirSync(SLOTS)
    .filter((f) => f.endsWith('.html'))
    .map((f) => [f.replace(/\.html$/, ''), readFileSync(join(SLOTS, f), 'utf8')])
    .filter(([n]) => !ONLY || ONLY.split(',').includes(n))
)
const LOOKS = ['default', ...Object.keys(slots)]
const REANALYSE = opt('--from-raw')

const hex = (r, g, b) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
const parse = (s) => {
  const m = /^#([0-9a-f]{6})$/i.exec(s.trim())
  if (m) return [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16))
  return null
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const chromatic = ([r, g, b]) => {
  const mx = Math.max(r, g, b) / 255
  const mn = Math.min(r, g, b) / 255
  const l = (mx + mn) / 2
  const s = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn)
  return s >= 0.35 && l > 0.15 && l < 0.85
}

/** Runs in the page: every painted colour of every visible element (and pseudo), keyed by a stable path. */
function collect({ hoverOnly, root }) {
  const RGB = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)/g
  const colours = (v) => {
    const out = []
    for (const m of String(v).matchAll(RGB)) {
      const a = m[4] === undefined ? 1 : Number(m[4])
      if (a < 0.05) continue
      out.push({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a })
    }
    return out
  }
  const path = (el) => {
    const parts = []
    for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
      let p = e.tagName.toLowerCase()
      if (e.id && !/^\d/.test(e.id)) {
        parts.unshift(p + '#' + e.id)
        break
      }
      const cls = [...e.classList].filter((c) => !/^(aos|owl-|active|show|hover|lk-)/.test(c)).slice(0, 3)
      if (cls.length) p += '.' + cls.join('.')
      const sib = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : []
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`
      parts.unshift(p)
    }
    return parts.join(' > ')
  }
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const rows = []
  const add = (el, pseudo, cs, kind) => {
    const r = el.getBoundingClientRect()
    if (!pseudo && (r.width < 1 || r.height < 1)) return
    if (cs.visibility === 'hidden' || cs.display === 'none') return
    if (Number(cs.opacity) === 0) return
    const svg = el instanceof SVGElement
    const props = {}
    const isGlyph =
      pseudo && cs.content && cs.content !== 'none' && cs.content !== '""' && cs.content !== 'normal'
    if ((!pseudo && ownText(el)) || isGlyph || (!pseudo && /^(i|svg)$/i.test(el.tagName)))
      props.color = cs.color
    if (!svg) props['background-color'] = cs.backgroundColor
    for (const s of ['top', 'right', 'bottom', 'left'])
      if (Number.parseFloat(cs[`border-${s}-width`]) > 0 && cs[`border-${s}-style`] !== 'none')
        props[`border-${s}-color`] = cs[`border-${s}-color`]
    if (cs.outlineStyle !== 'none' && Number.parseFloat(cs.outlineWidth) > 0)
      props['outline-color'] = cs.outlineColor
    if (cs.textDecorationLine && cs.textDecorationLine !== 'none' && (ownText(el) || isGlyph))
      props['text-decoration-color'] = cs.textDecorationColor
    if (cs.boxShadow !== 'none') props['box-shadow'] = cs.boxShadow
    if (cs.textShadow !== 'none' && ownText(el)) props['text-shadow'] = cs.textShadow
    if (svg) {
      if (cs.fill !== 'none') props.fill = cs.fill
      if (cs.stroke !== 'none') props.stroke = cs.stroke
    }
    if (/gradient/.test(cs.backgroundImage)) props['background-image'] = cs.backgroundImage
    const out = {}
    for (const [k, v] of Object.entries(props)) {
      const c = colours(v)
      if (c.length) out[k] = c
    }
    const pics = []
    for (const v of [cs.backgroundImage, cs.maskImage || cs.webkitMaskImage]) {
      for (const m of String(v ?? '').matchAll(/url\("?([^")]+)"?\)/g))
        pics.push({ url: m[1], mask: v !== cs.backgroundImage })
    }
    if (!pseudo && el.tagName === 'IMG' && el.currentSrc)
      pics.push({ url: el.currentSrc, img: true, w: el.naturalWidth })
    // a picture recoloured by an SVG filter of the page (feFlood): the flood is what the eye sees
    const fm = /url\("?[^")]*#([^")]+)"?\)/.exec(cs.filter || '')
    const flood = fm && document.getElementById(fm[1])?.querySelector('feFlood')
    if (flood) {
      const fc = colours(getComputedStyle(flood).floodColor)
      for (const pic of pics) pic.tint = fc.length ? fc[0].rgb : 'transparent'
      if (fc.length) out['filter-flood'] = fc
    }
    if (!Object.keys(out).length && !pics.length) return
    rows.push({
      path: path(el) + (pseudo ? '::' + pseudo : ''),
      kind,
      props: out,
      pics,
      mask: cs.webkitMaskImage && cs.webkitMaskImage !== 'none'
    })
  }
  const scope = root ? [root, ...root.querySelectorAll('*')] : [...document.body.querySelectorAll('*')]
  for (const el of scope) {
    if (el.closest('script,style,noscript,template,head')) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none') continue
    add(el, null, cs, hoverOnly ? 'hover' : 'rest')
    for (const p of ['before', 'after']) {
      const ps = getComputedStyle(el, '::' + p)
      if (ps.content && ps.content !== 'none' && ps.display !== 'none')
        add(el, p, ps, hoverOnly ? 'hover' : 'rest')
    }
  }
  return rows
}

/** Runs in the page: the system's accent colours (every --ds-*accent* variable the slot names, resolved on html and body). */
function accents(names) {
  const out = new Set()
  for (const el of [document.documentElement, document.body]) {
    const cs = getComputedStyle(el)
    for (const n of names) {
      const v = cs.getPropertyValue(n).trim()
      const m = /^#([0-9a-f]{6})$/i.exec(v) || /^#([0-9a-f]{3})$/i.exec(v)
      if (m) out.add(m[1].length === 3 ? '#' + [...m[1]].map((c) => c + c).join('') : v.toLowerCase())
      const r = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(v)
      if (r) out.add('#' + [r[1], r[2], r[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join(''))
    }
  }
  return [...out]
}

/** Runs in the page: the dominant opaque colours of a picture. */
async function picture({ body, type }) {
  try {
    const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    if (/svg/.test(type)) {
      // an SVG file: the colours its shapes name (fill, stroke, stop-color), each an equal share
      const text = new TextDecoder().decode(bytes)
      const hs = [
        ...text.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*"?\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g)
      ].map((m) => m[1])
      const full = hs.map((h) => (h.length === 4 ? '#' + Array.from(h.slice(1), (c) => c + c).join('') : h))
      return {
        svg: true,
        top: full.map((h) => ({
          rgb: [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)),
          share: 1 / full.length
        }))
      }
    }
    const blob = new Blob([bytes], { type })
    const bmp = await createImageBitmap(blob)
    if (bmp.width * bmp.height > 1200 * 1200) return { big: true }
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const x = c.getContext('2d')
    x.drawImage(bmp, 0, 0)
    const d = x.getImageData(0, 0, bmp.width, bmp.height).data
    const bins = new Map()
    let opaque = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 160) continue
      opaque++
      const k = [d[i], d[i + 1], d[i + 2]].map((v) => v >> 3).join(',')
      bins.set(k, (bins.get(k) ?? 0) + 1)
    }
    const top = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    return {
      w: bmp.width,
      h: bmp.height,
      opaque,
      top: top.map(([k, n]) => ({ rgb: k.split(',').map((v) => Number(v) * 8 + 4), share: n / opaque }))
    }
  } catch (e) {
    return { error: String(e).slice(0, 80) }
  }
}

const results = {}
const picCache = new Map()
if (REANALYSE) {
  // judge a saved run again (raw.json of an earlier --out) without rendering anything
  const raw = JSON.parse(readFileSync(REANALYSE, 'utf8'))
  Object.assign(results, raw.results)
  for (const [k, v] of Object.entries(raw.pictures)) picCache.set(k, v)
}
const browser = REANALYSE ? null : await chromium.launch({ channel: 'chrome', headless: true })
for (const scheme of REANALYSE ? [] : SCHEMES) {
  for (const look of LOOKS) {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 }, colorScheme: scheme })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    for (const p of PAGES) {
      const key = `${p}|${scheme}|${look}`
      try {
        await page.goto(SITE + p, { waitUntil: 'load', timeout: 90000 })
        // the site's own slot out, this look's slot in (end of head), and no transition (forced states read at once)
        await page.evaluate(
          (slot) => {
            for (const s of document.querySelectorAll('style#tracy-ds-slot')) s.remove()
            // an EmDash theme keeps its worn-only rules under html[data-ds-worn], which its server sets
            // with the slot (as the preview door does); nothing else reads the mark
            if (slot) document.documentElement.setAttribute('data-ds-worn', '')
            else document.documentElement.removeAttribute('data-ds-worn')
            const t = document.createElement('template')
            t.innerHTML = slot + '<style>*,*::before,*::after{transition:none!important}</style>'
            document.head.append(t.content)
          },
          look === 'default' ? '' : slots[look]
        )
        await page.waitForTimeout(1500)
        for (let y = 0; y < 16000; y += 800) {
          await page.evaluate((y) => window.scrollTo(0, y), y)
          await page.waitForTimeout(60)
        }
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(500)
        const rows = await page.evaluate(collect, { hoverOnly: false })
        const names =
          look === 'default' ? [] : [...new Set(slots[look].match(/--ds-[a-z0-9-]*accent[a-z0-9-]*/g) ?? [])]
        const asked =
          look === 'default'
            ? []
            : await page.evaluate(accents, [...new Set(slots[look].match(/--ds-c-[a-z0-9-]+/g) ?? [])])
        const acc = await page.evaluate(accents, names)
        const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
        let hov = []
        if (HOVER) hov = await hoverRows(page, cdp)
        // pictures
        for (const r of [...rows, ...hov]) {
          for (const pic of r.pics) {
            const data = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(pic.url)
            const abs = data
              ? `data:${data[1]};${pic.url.length}:${pic.url.slice(-48)}`
              : new URL(pic.url, SITE + p).href
            pic.url = data ? abs : pic.url
            if (data) {
              // a picture the optimizer inlined (T4 turns small template images into data: URIs)
              if (!picCache.has(abs)) {
                const body = data[2] ? data[3] : Buffer.from(decodeURIComponent(data[3])).toString('base64')
                picCache.set(abs, await page.evaluate(picture, { body, type: data[1] }))
              }
              pic.abs = abs
              continue
            }
            if (!abs.startsWith(new URL(SITE).origin)) continue
            if (pic.img && !/\.(svg|png|webp|gif)(\?|$)/i.test(abs)) continue
            if (!picCache.has(abs)) {
              const res = await ctx.request.get(abs).catch(() => null)
              const body = res?.ok() ? (await res.body()).toString('base64') : null
              const type = res?.headers()['content-type'] ?? ''
              picCache.set(abs, body ? await page.evaluate(picture, { body, type }) : { error: 'fetch' })
            }
            pic.abs = abs
          }
        }
        results[key] = { theme, accents: acc, asked, rows, hover: hov }
        console.error(
          `${key}: ${rows.length} rows, ${hov.length} hover rows, theme ${theme}, accents ${acc.join(' ')}`
        )
      } catch (e) {
        console.error(`${key}: FAILED ${String(e).slice(0, 200)}`)
      }
    }
    await ctx.close()
  }
}
await browser?.close()

/** Forces :hover on every hover target (its ancestors too, as a real pointer does) and records what changes. */
async function hoverRows(page, cdp) {
  const n = await page.evaluate(() => {
    const sels = new Set(['a', 'button', '.btn', 'input[type=submit]', '[role=button]'])
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules) walk(r.cssRules)
        if (!r.selectorText || !r.selectorText.includes(':hover')) continue
        for (const s of r.selectorText.split(',')) {
          const i = s.indexOf(':hover')
          if (i < 0) continue
          // the compound carrying :hover is the target: everything up to it, minus the pseudo
          const target = s.slice(0, i).trim()
          if (target && !/[>+~]$/.test(target)) sels.add(target.replace(/:(not|is|where)\($/, ''))
        }
      }
    }
    for (const sh of document.styleSheets) {
      try {
        walk(sh.cssRules)
      } catch {}
    }
    const els = new Set()
    for (const s of sels) {
      try {
        for (const e of document.querySelectorAll(s)) {
          const r = e.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) els.add(e)
        }
      } catch {}
    }
    let i = 0
    for (const e of document.querySelectorAll('[data-lk]')) e.removeAttribute('data-lk')
    for (const e of document.body.querySelectorAll('*')) e.setAttribute('data-lk', String(i++))
    window.__lkTargets = [...els].slice(0, 500).map((e) => Number(e.getAttribute('data-lk')))
    return window.__lkTargets.length
  })
  if (!n) return []
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-lk]' })
  const targets = await page.evaluate(() => window.__lkTargets)
  const chainOf = await page.evaluate(() =>
    window.__lkTargets.map((t) => {
      const out = []
      for (let e = document.querySelector(`[data-lk="${t}"]`); e && e !== document.body; e = e.parentElement)
        out.push(Number(e.getAttribute('data-lk')))
      return out
    })
  )
  const rows = []
  for (let k = 0; k < targets.length; k++) {
    const before = await page.evaluate((t) => {
      const el = document.querySelector(`[data-lk="${t}"]`)
      return el ? true : false
    }, targets[k])
    if (!before) continue
    const restRows = await page.evaluate(
      (args) => {
        const f = new Function('return ' + args.src)()
        return f({ hoverOnly: false, root: document.querySelector(`[data-lk="${args.t}"]`) })
      },
      { src: collect.toString(), t: targets[k] }
    )
    for (const id of chainOf[k])
      await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[id], forcedPseudoClasses: ['hover'] })
    const hovRows = await page.evaluate(
      (args) => {
        const f = new Function('return ' + args.src)()
        return f({ hoverOnly: true, root: document.querySelector(`[data-lk="${args.t}"]`) })
      },
      { src: collect.toString(), t: targets[k] }
    )
    for (const id of chainOf[k])
      await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[id], forcedPseudoClasses: [] })
    const restBy = new Map(restRows.map((r) => [r.path, JSON.stringify(r.props)]))
    for (const r of hovRows) if (restBy.get(r.path) !== JSON.stringify(r.props)) rows.push(r)
  }
  return rows
}

// brand colours
let brand = (opt('--brand') ?? '')
  .split(',')
  .filter(Boolean)
  .map((h) => ({ hex: h.toLowerCase(), rgb: parse(h) }))
if (!brand.length) {
  const seen = new Map()
  for (const [k, r] of Object.entries(results)) {
    if (!k.endsWith('|default')) continue
    for (const row of [...r.rows, ...r.hover])
      for (const cs of Object.values(row.props))
        for (const c of cs) if (chromatic(c.rgb)) seen.set(hex(...c.rgb), (seen.get(hex(...c.rgb)) ?? 0) + 1)
  }
  brand = [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([h, n]) => ({ hex: h, rgb: parse(h), seen: n }))
}
// colours the template paints for another role though they sit near its brand (Bootstrap's danger red)
const notBrand = (opt('--not-brand') ?? '').split(',').filter(Boolean).map(parse)
const isBrand = (rgb) => {
  const b = brand.find((x) => dist(x.rgb, rgb) < 24)
  if (!b) return null
  return notBrand.some((n) => dist(n, rgb) < dist(b.rgb, rgb)) ? null : b
}
const tinted = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) > 20
const isAccent = (rgb, acc) => acc.some((a) => tinted(parse(a)) && dist(parse(a), rgb) < 24)

const findings = []
for (const [key, r] of Object.entries(results)) {
  const [page, scheme, look] = key.split('|')
  if (look === 'default') continue
  const def = results[`${page}|${scheme}|default`]
  const defBy = new Map()
  for (const row of def ? [...def.rows, ...def.hover] : []) defBy.set(row.kind + row.path, row)
  // the system's own accent near a brand colour: the system asked for it, no leak can be told
  const blind = r.accents.some((a) => isBrand(parse(a)))
  for (const row of [...r.rows, ...r.hover]) {
    for (const [prop, cs] of Object.entries(row.props)) {
      for (const c of cs) {
        const b = isBrand(c.rgb)
        if (b && !blind && !isAccent(c.rgb, r.accents) && !isAccent(c.rgb, r.asked ?? []))
          findings.push({
            rule: 'LEAK',
            page,
            scheme,
            look,
            state: row.kind,
            path: row.path,
            prop,
            colour: hex(...c.rgb),
            alpha: c.a,
            brand: b.hex
          })
      }
      const d = defBy.get(row.kind + row.path)?.props[prop]
      if (d && cs[0] && isBrand(d[0].rgb) && !isBrand(cs[0].rgb) && !isAccent(cs[0].rgb, r.accents))
        findings.push({
          rule: 'DRIFT',
          page,
          scheme,
          look,
          state: row.kind,
          path: row.path,
          prop,
          colour: hex(...cs[0].rgb),
          was: hex(...d[0].rgb),
          accents: r.accents.join(' ')
        })
    }
    for (const pic of row.pics) {
      const info = pic.abs && picCache.get(pic.abs)
      if (!info?.top || pic.mask || Array.isArray(pic.tint)) continue
      const share = info.top.filter((t) => isBrand(t.rgb)).reduce((s, t) => s + t.share, 0)
      if (share >= 0.3 && !blind)
        findings.push({
          rule: 'PIC',
          page,
          scheme,
          look,
          state: row.kind,
          path: row.path,
          url: pic.abs,
          share: Number(share.toFixed(2))
        })
    }
  }
}
// SPLIT: links and buttons the template paints alike (same colour, same state, same property) that a
// system paints in more than one role: the template's pair (header and footer hover) came apart
const LINKISH = /(^|> )(a|button|input)([.#:[]|$)|\.btn\b|\.nav-link\b/
for (const scheme of SCHEMES) {
  for (const look of LOOKS.slice(1)) {
    const groups = new Map()
    for (const page of PAGES) {
      const def = results[`${page}|${scheme}|default`]
      const sys = results[`${page}|${scheme}|${look}`]
      if (!def || !sys) continue
      const sysBy = new Map([...sys.rows, ...sys.hover].map((r) => [r.kind + r.path, r]))
      for (const row of [...def.rows, ...def.hover]) {
        const last = row.path.split(' > ').pop()
        if (!LINKISH.test(' > ' + last) && !LINKISH.test(row.path.split(' > ').slice(-2).join(' > ')))
          continue
        for (const prop of ['color', 'background-color']) {
          const d = row.props[prop]?.[0]
          const s = sysBy.get(row.kind + row.path)?.props[prop]?.[0]
          if (!d || !s || d.a < 0.5) continue
          const k = `${row.kind}|${prop}|${hex(...d.rgb)}`
          const g = groups.get(k) ?? new Map()
          const sk = hex(...s.rgb)
          const list = g.get(sk) ?? []
          list.push(`${page} ${row.path}`)
          g.set(sk, list)
          groups.set(k, g)
        }
      }
    }
    for (const [k, g] of groups) {
      if (g.size < 2) continue
      const [state, prop, was] = k.split('|')
      // every part still one of the system's accent shades (link hover vs menu hover): no role came apart
      const acc = PAGES.flatMap((pg) => results[`${pg}|${scheme}|${look}`]?.accents ?? [])
      if ([...g.keys()].every((c) => isAccent(parse(c), acc))) continue
      if (!isBrand(parse(was)) && state === 'rest') continue
      findings.push({
        rule: 'SPLIT',
        page: '*',
        scheme,
        look,
        state,
        path: `template ${was}`,
        prop,
        colour: [...g.keys()].join('/'),
        split: Object.fromEntries([...g].map(([c, l]) => [c, { n: l.length, e: l.slice(0, 2) }]))
      })
    }
  }
}
// one line per (rule, path, prop, state) with where it was seen
const grouped = new Map()
for (const f of findings) {
  const k = [f.rule, f.state, f.path, f.prop ?? f.url].join('|')
  const g = grouped.get(k) ?? { ...f, seen: [] }
  g.seen.push(`${f.page} ${f.scheme} ${f.look}${f.colour ? ' ' + f.colour : ''}`)
  grouped.set(k, g)
}
const list = [...grouped.values()]
writeFileSync(join(OUT, 'leaks.json'), JSON.stringify({ brand, findings: list }, null, 1))
writeFileSync(join(OUT, 'raw.json'), JSON.stringify({ results, pictures: Object.fromEntries(picCache) }))
const count = (r) => list.filter((f) => f.rule === r).length
console.log(
  `brand: ${brand
    .slice(0, 12)
    .map((b) => b.hex + (b.seen ? '×' + b.seen : ''))
    .join(' ')}`
)
console.log(
  `LEAK ${count('LEAK')} · DRIFT ${count('DRIFT')} · PIC ${count('PIC')} · SPLIT ${count('SPLIT')}  (${join(OUT, 'leaks.json')})`
)
for (const f of list.slice(0, 400))
  console.log(
    `${f.rule} [${f.state}] ${f.path} ${f.prop ?? f.url} ${f.colour ?? ''}${f.was ? ' was ' + f.was : ''} — ${f.seen.length}× e.g. ${f.seen[0]}`
  )
