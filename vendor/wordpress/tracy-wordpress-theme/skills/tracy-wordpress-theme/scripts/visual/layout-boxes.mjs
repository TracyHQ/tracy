#!/usr/bin/env node
// layout-boxes.mjs — the layout lens's measurements, taken by a script: pair the headings of a
// source page and its port by their text, measure the box around each (the heading, the nearest
// painted panel, the section), and report what differs in place, width, height, alignment and
// paint.
//
//   node scripts/visual/layout-boxes.mjs --source <url> --site <url> --routes /a,/b|<page-map.json>
//        [--source-prefix /index.php] [--width 1440] [--height 900] [--out <file.json>]
//        [--theme light|dark] [--dark-hook attr:data-theme=dark] [--source-dark-hook <hook>]
//        [--light-hook <hook>] [--source-light-hook <hook>] [--dark-check <mark>] [--source-dark-check <mark>]
//        [--contract <visual.contract.json> | --config <review.config.json>]
//        [--framework T4|T3|<classification> | --provenance <spec>/provenance.json]
//
// THEME. `--theme dark` puts BOTH sides into dark before anything is measured: `prefers-color-scheme`
// and the dark hook (lib/browser.mjs spelling — `attr:`, `class:`, `cookie:`, `ls:`, joined by `+`),
// the site's `--dark-hook` (default `attr:data-theme=dark`) and the source's `--source-dark-hook`
// (default: the site's). A `cookie:` part is a request cookie set before the first navigation, so a
// server that picks the theme reads it on the document request. `--light-hook`/`--source-light-hook`
// are the light pass of a side that is dark by default.
//
// FROM THE FILE. `--contract` (the run's visual.contract.json: `design.theme` for the site,
// `source.darkHook`/`darkRequestHook`/`lightHook` for the source) or `--config` (the dossier's
// review.config.json `hook`/`persistence`/`defaultTheme`, the site's; the source then shares it)
// gives the switches AND the marks: a cookie persistence is the switch (`cookie:tracy_theme=dark`),
// the hook attribute is the mark (`attr:data-theme=dark`). A flag wins over the file, the file over
// the defaults; the report names which (`hookFrom`). A file that is not there, not JSON, or names no
// theme is exit 2, never the defaults (hooksOf).
//
// THE MODE IS CHECKED, NEVER ASSUMED. After the page settled, each side's dark mark is read: the
// `attr:`/`class:` parts of `--dark-check`/`--source-dark-check` (default: that side's dark hook). A
// side whose own script undid the hook, or whose server ignored the cookie, is not in the mode asked
// for, and the run stops with exit 2 rather than compare a light page with a dark one. A mark that
// cannot be read — a `cookie:`/`ls:` hook with no check — also stops the run with exit 2: name the
// mark the page carries in dark (`--dark-check attr:data-theme=dark`). The mode is written into the
// report (`theme`, `hooks`, `checks`, `hookFrom`). JA Vega M4 (26/09) had no theme to ask for and measured its
// dark stage with a hand-written wrapper.
//
// EXIT. 0 when every paired block agrees, 1 when any route has a differing block (129 of 129
// differed at exit 0 on JA Vega M4), 2 for a usage error, a named input that is not there or not
// readable JSON, a side not in the mode asked for or not checkable, or a route that did not load on
// either side (no answer, a status other than 2xx, or other than the page-map entry's declared
// `status` / 404 for `view: "404"`) — an error page has no headings to differ, and 0 differing blocks
// there is not a pass.
//
// WHY. On Tracy Base (25/09) the four largest visible differences — a hero squeezed into one of two
// grid columns, grey bands where the source paints the page colour, a call to action 128 px too
// wide, a centred heading drawn left — were found by a person comparing screenshots and measuring
// boxes by hand. No machine finding covered them: fixing all four closed about 12 of 844 findings.
// Parity compares text styles of paired elements; nothing compared the boxes they sit in. A panel
// is compared by presence, width, fill, border (width, colour) and corner radius.
//
// WHICH HEADINGS. The source framework's selector profile (lib/framework-selectors.mjs) names them:
// h1–h3 in its content regions (T4: `main`, `#t4-main-body`, `.t4-section`, `.t4-masthead`; T3:
// `main`, `.t3-mainbody`, `.t3-section`, `.t3-masthead`, `.t3-hero`, … — a T3 page has no `<main>`,
// #66), and h1/h2 anywhere — never inside its chrome (header, nav, footer, the framework's
// header/footer/mega/topbar/off-canvas; a sidebar is content, `<aside>` or not — #27 item 8) nor
// hidden. The font size compared is the size of the element that draws the words (a single-child
// chain holding the same words, the rule of visual-qa's parity); the boxes are the heading's.
//
// THE PROFILE. `--framework` names the classification, `--provenance` reads it from the spec-pack's
// provenance.json (`source.template.css.framework`), `--contract` from visual.contract.json
// `source.framework`; a flag wins over the file. A classification with no profile of its own reads
// the generic landmarks, and the report says so (`selectors.gap`). A command that names none keeps
// the T4 lists, `assumed`, and says that too. The same profile reads both sides: every profile keeps
// the WordPress landmarks the site is drawn with. A route where a side shows no heading the profile
// reads is not a pass: it is listed (`unmeasured`) and the exit is 1.
//
// WHAT IT IS NOT. It does not replace the lenses reading pictures: it names the boxes that differ
// so the lens (and the fixer) starts from numbers. A heading only on one side is listed, not judged.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { withBrowser, withPage } from '../lib/browser.mjs'
import { freezeMotion } from '../lib/motion.mjs'
import { resolveSourceRoutes } from '../lib/source-routes.mjs'
import { FRAMEWORK_NAME, PROFILES, readProvenanceFile, selectorProfileFor, selectorProfileOfContract, selectorsRecord } from '../lib/framework-selectors.mjs'

/**
 * What measureInPage reads, from a selector profile (lib/framework-selectors.mjs): `headings` (h1–h3
 * in the content regions, h1/h2 anywhere), `chrome` (never a heading to compare — the list the content
 * parity drops), `section` (the band a heading's section box is read from) and `panelStop` (where
 * the search for a heading's painted panel stops).
 */
export const measureOf = (profile) => Object.freeze({ headings: profile.headings, chrome: profile.chrome, section: profile.section, panelStop: profile.panelStop })

/**
 * The T4 lists: `main`, T4's main body, and the T4 sections and masthead that sit OUTSIDE them — a
 * T4 page draws its section titles as h3 in `.t4-section` and the page title in `.t4-masthead`, and
 * JA Vega's home page paired one heading of ten ("only on the site" nine times, every utility page
 * none — M4b, 26/09). T4's footer is a `.t4-section` too, and its chrome is dropped first.
 */
export const MEASURE = measureOf(PROFILES.T4)

/**
 * Runs in the page: every heading with its heading box, its nearest painted panel and its section.
 * Called bare it reads MEASURE's lists, written out here because a function sent into the page
 * cannot reach this module (a test holds the two equal).
 */
export function measureInPage({ headings, chrome, section: sectionSel, panelStop } = {}) {
  headings ??= 'main h1, main h2, main h3, #t4-main-body h1, #t4-main-body h2, #t4-main-body h3, .t4-section h1, .t4-section h2, .t4-section h3, .t4-masthead h1, .t4-masthead h2, .t4-masthead h3, body h1, body h2'
  chrome ??= 'header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], .tracy-header, .tracy-footer, .t4-header, .t4-footer, #t4-header, #t4-footer, .t4-megamenu, .t4-offcanvas, .t4-off-canvas, [class*="footnav"], [class*="mega-"], .t4-navbar, .t4-section-footer, .breadcrumb, .wp-block-navigation, .tracy-mega'
  sectionSel ??= 'section'
  panelStop ??= 'section, main'
  const clean = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase()
  const box = (e) => {
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }
  }
  // A panel is something drawn: a fill, an image, a border all round or a shadow. A wrapper that
  // only rounds its corners, with nothing painted, is not one (it read as a 1024 px "panel" on
  // every T4 section). The border counts since Tracy Base 1.1.0: "The essentials" were bordered
  // 18 px-radius cards on the page colour in the source and bare columns on the site, and a
  // panel test that looked at fills only saw neither.
  const bordered = (c) =>
    ['Top', 'Right', 'Bottom', 'Left'].every((side) => Number.parseFloat(c[`border${side}Width`]) > 0 && c[`border${side}Style`] !== 'none' && c[`border${side}Style`] !== 'hidden' && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c[`border${side}Color`]))
  const drawn = (c) => bordered(c) || c.boxShadow !== 'none'
  const painted = (e) => {
    const c = getComputedStyle(e)
    return c.backgroundColor !== 'rgba(0, 0, 0, 0)' || c.backgroundImage !== 'none' || drawn(c)
  }
  const edge = (e) => {
    const c = getComputedStyle(e)
    const radii = [c.borderTopLeftRadius, c.borderTopRightRadius, c.borderBottomRightRadius, c.borderBottomLeftRadius]
    return {
      radius: new Set(radii).size === 1 ? radii[0] : radii.join(' '),
      border: bordered(c) ? `${c.borderTopWidth} ${c.borderTopColor}` : 'none',
      shadow: c.boxShadow !== 'none'
    }
  }
  const paintOf = (e) => {
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor
      if (bg !== 'rgba(0, 0, 0, 0)') return bg
    }
    return getComputedStyle(document.body).backgroundColor
  }
  const out = []
  // The element that draws the words: down a chain of single visible children holding the same
  // words (JA Vega's accordion: a 48 px `h2.accordion-header` around the 20 px button that holds the
  // question — "heading font-size 48px → 20px" on six pages × four questions, M4b). The same rule as
  // visual-qa's parity (#9); the boxes stay the heading's.
  const shownKids = (n) => [...n.childNodes].filter((c) => (c.nodeType === 1 ? getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden' : c.nodeType === 3 && c.textContent.trim()))
  const carrier = (h) => {
    let n = h
    for (;;) {
      const kids = shownKids(n)
      const k = kids.length === 1 && kids[0].nodeType === 1 ? kids[0] : null
      if (!k || clean(k.textContent) !== clean(n.textContent)) return n
      n = k
    }
  }
  for (const h of document.querySelectorAll(headings)) {
    if (h.closest(chrome)) continue
    // A heading the page does not show (a hidden modal, a collapsed panel) is not a box to compare:
    // JA Kinetic's source carries a hidden "Privacy note" whose measured panel was 0 px wide.
    const hr = h.getBoundingClientRect()
    if (!hr.width || !hr.height || getComputedStyle(h).visibility === 'hidden') continue
    const words = clean(h.textContent)
    if (!words) continue
    // The same words twice on a page (an inline call to action and the final one) pair by order.
    const text = `${words}#${out.filter((o) => o.words === words).length + 1}`
    const hs = getComputedStyle(h)
    const ws = getComputedStyle(carrier(h))
    // The nearest ancestor inside the section whose fill differs from what is behind it: a white
    // wrapper on a white page is not a panel either.
    let panel = null
    for (let n = h.parentElement; n && n !== document.body; n = n.parentElement) {
      if (n.matches(panelStop)) break
      const c = getComputedStyle(n)
      if (painted(n) && (c.backgroundImage !== 'none' || drawn(c) || c.backgroundColor !== paintOf(n.parentElement))) {
        panel = n
        break
      }
    }
    const section = h.closest(sectionSel) ?? h.parentElement
    // A port may paint the section itself where the source paints a box inside it (Tracy Base's
    // carousel): a filled section that is narrower than the page counts as the panel.
    if (!panel && section !== document.body && getComputedStyle(section).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(section).backgroundColor !== paintOf(section.parentElement) && section.getBoundingClientRect().width <= innerWidth - 32) panel = section
    // The short line right above a heading (an eyebrow, a chip): Tracy Base 1.1.0 shipped with its
    // hero chip at the column's left edge under a centred heading — boxes of headings alone missed
    // it, a person on the dev surface saw it (26/09).
    const prev = h.previousElementSibling
    const pr = prev?.getBoundingClientRect()
    const label =
      prev && pr.width && pr.height && clean(prev.textContent).length > 0 && clean(prev.textContent).length <= 80 && !/^H[1-6]$/.test(prev.tagName)
        ? { x: Math.round(pr.x), w: Math.round(pr.width), center: Math.round(pr.x + pr.width / 2) }
        : null
    out.push({
      text,
      words,
      label,
      tag: h.tagName.toLowerCase(),
      heading: { ...box(h), fontSize: ws.fontSize, align: hs.textAlign },
      panel: panel ? { ...box(panel), bg: getComputedStyle(panel).backgroundColor, ...edge(panel) } : null,
      section: { ...box(section), paint: paintOf(section), borderTop: getComputedStyle(section).borderTopWidth }
    })
  }
  return out
}

const near = (a, b, tol) => Math.abs(a - b) <= tol
const alignOf = (a) => (a === 'start' || a === 'left' ? 'start' : a)

/**
 * Compare the measured blocks of one route. Pure: tested without a browser.
 * Tolerances: place and width within max(16 px, 3 % of the viewport); heading height within 25 %
 * (a line more or less); font size within 1 px.
 */
export function compareBlocks(source, site, { width = 1440 } = {}) {
  const tol = Math.max(16, Math.round(width * 0.03))
  // Headings with the same words on both sides pair by order — from the END when one side has
  // more of them (Tracy Base: the port adds an inline call to action whose words repeat the final
  // one; the final one is the pair).
  const words = (b) => b.words ?? b.text.replace(/#\d+$/, '')
  const rekey = (list, other) =>
    list.map((b) => {
      const same = list.filter((x) => words(x) === words(b))
      const theirs = other.filter((x) => words(x) === words(b)).length
      if (same.length === theirs || theirs === 0) return b
      const fromEnd = same.length - same.indexOf(b)
      return { ...b, text: `${words(b)}#-${fromEnd}` }
    })
  source = rekey(source, site)
  site = rekey(site, source)
  const byText = new Map(site.map((b) => [b.text, b]))
  const rows = []
  const onlySource = []
  for (const s of source) {
    const t = byText.get(s.text)
    if (!t) {
      onlySource.push(s.text)
      continue
    }
    byText.delete(s.text)
    const d = []
    if (!near(s.heading.x, t.heading.x, tol)) d.push(['heading x', s.heading.x, t.heading.x])
    if (!near(s.heading.w, t.heading.w, tol)) d.push(['heading width', s.heading.w, t.heading.w])
    if (s.heading.h && Math.abs(t.heading.h - s.heading.h) / s.heading.h > 0.25) d.push(['heading height (lines)', s.heading.h, t.heading.h])
    if (Math.abs(Number.parseFloat(s.heading.fontSize) - Number.parseFloat(t.heading.fontSize)) > 1) d.push(['heading font-size', s.heading.fontSize, t.heading.fontSize])
    if (alignOf(s.heading.align) !== alignOf(t.heading.align)) d.push(['heading align', s.heading.align, t.heading.align])
    if (s.label && t.label && !near(s.label.center, t.label.center, tol)) d.push(['label centre', s.label.center, t.label.center])
    const panelWords = (p) => (p ? [`${p.w}px ${p.bg}`, p.border && p.border !== 'none' ? `border ${p.border}` : null, p.radius && p.radius !== '0px' ? `radius ${p.radius}` : null].filter(Boolean).join(', ') : 'none')
    if (Boolean(s.panel) !== Boolean(t.panel)) d.push(['panel', panelWords(s.panel), panelWords(t.panel)])
    else if (s.panel && t.panel) {
      if (!near(s.panel.w, t.panel.w, tol)) d.push(['panel width', s.panel.w, t.panel.w])
      if (s.panel.bg !== t.panel.bg) d.push(['panel background', s.panel.bg, t.panel.bg])
      // Border and corners (measured since 26/09; older measurements carry neither and are not compared).
      if (s.panel.border !== undefined && t.panel.border !== undefined) {
        const [sw, ...sc] = s.panel.border.split(' ')
        const [tw, ...tc] = t.panel.border.split(' ')
        if (s.panel.border === 'none' || t.panel.border === 'none') {
          if (s.panel.border !== t.panel.border) d.push(['panel border', s.panel.border, t.panel.border])
        } else {
          if (Math.abs(Number.parseFloat(sw) - Number.parseFloat(tw)) > 0.5) d.push(['panel border width', sw, tw])
          if (sc.join(' ') !== tc.join(' ')) d.push(['panel border colour', sc.join(' '), tc.join(' ')])
        }
      }
      if (s.panel.radius !== undefined && t.panel.radius !== undefined) {
        const r = (v) => String(v).split(' ').map((x) => Number.parseFloat(x) || 0)
        const [a, b] = [r(s.panel.radius), r(t.panel.radius)]
        if (a.length !== b.length ? Math.abs(Math.max(...a) - Math.max(...b)) > 1 || Math.abs(Math.min(...a) - Math.min(...b)) > 1 : a.some((x, i) => Math.abs(x - b[i]) > 1)) d.push(['panel radius', s.panel.radius, t.panel.radius])
      }
    }
    if (s.section.paint !== t.section.paint) d.push(['section paint', s.section.paint, t.section.paint])
    if (d.length) rows.push({ text: s.text, tag: s.tag, deltas: d })
  }
  return { paired: source.length - onlySource.length, differing: rows.length, rows, onlySource, onlySite: [...byText.keys()] }
}

/**
 * Whether a page shows the mode it was asked for, from what the hook sets. Runs in the page. Only
 * `attr:` and `class:` parts leave a mark to read; a `cookie:`/`ls:` hook is read by the page's own
 * script and is reported `null` (not checkable here), never assumed applied.
 */
export function hookState(hook) {
  let checked = false
  for (const part of String(hook ?? '').split('+').filter(Boolean)) {
    const [kind, spec] = part.split(':')
    if (kind === 'attr') {
      const [name, value] = spec.split('=')
      checked = true
      if (document.documentElement.getAttribute(name) !== (value ?? 'dark')) return false
    } else if (kind === 'class') {
      checked = true
      if (!document.documentElement.classList.contains(spec)) return false
    }
  }
  return checked ? true : null
}

/**
 * The switch that puts each side into the mode asked for, and the mark that proves it, in this
 * order: a flag, else the file (`contract` — visual.contract.json `design.theme` for the site and
 * `source.darkHook`/`darkRequestHook`/`lightHook` for the source; or `config` — the dossier's
 * review.config.json `hook`/`persistence`/`defaultTheme`, the site's, which the source then
 * shares), else the defaults (`attr:data-theme=dark`, the source sharing the site's). The switch
 * and the mark are two things: a theme that keeps its choice in a cookie (`tracy_theme`) is
 * switched by the cookie on the document request and proved by the attribute its script prints —
 * JA Vega M4b (26/09) typed `--dark-hook cookie:tracy_theme=dark` by hand on every dark run while
 * the contract named it, and the default `attr:` hook was taken off by the theme's own script.
 * A file that names no theme, or a source with no dark of its own, is an Error: never the default.
 */
const HOOK_TYPES = ['attribute', 'class']
const STORAGE_TYPES = ['cookie', 'localStorage']
// A persistence the tools do not know is an Error, never a silent `attr:` switch: a typo in the
// file would otherwise measure whatever mode the page opened in and call it the one asked for.
function storageOf(st, where) {
  if (st == null) return null
  if (typeof st !== 'object' || Array.isArray(st)) throw new Error(`${where} must be { "type": "cookie"|"localStorage", "key": "<name>" } or absent`)
  const extra = Object.keys(st).filter((k) => !['type', 'key'].includes(k))
  if (extra.length) throw new Error(`${where} has unknown key(s) ${extra.join(', ')} — only "type" and "key"`)
  if (!STORAGE_TYPES.includes(st.type)) throw new Error(`${where}.type ${JSON.stringify(st.type)} is not one of ${STORAGE_TYPES.join('|')}`)
  if (typeof st.key !== 'string' || !st.key) throw new Error(`${where}.key is empty — the cookie or localStorage key the theme reads`)
  return st
}

export function hooksOf({ theme = 'light', contract = null, config = null, flags = {} } = {}) {
  let site = null
  let src = null
  let kind = 'default'
  if (contract) {
    kind = 'contract'
    const t = contract.design?.theme
    if (!t?.attribute) throw new Error('the contract names no design.theme (attribute, values, storage) — pass --dark-hook/--dark-check')
    const dark = t.values?.dark ?? 'dark'
    site = { mark: `attr:${t.attribute}=${dark}`, storage: storageOf(t.storage, 'contract design.theme.storage'), defaultDark: t.default === 'dark' }
    const s = contract.source ?? {}
    const sDark = [s.darkRequestHook, s.darkHook].filter(Boolean).join('+') || null
    const sMark = String(s.darkHook ?? '').split('+').filter((x) => /^(attr|class):/.test(x)).join('+') || null
    src = { dark: sDark, mark: sMark, light: s.lightHook ?? null }
  } else if (config) {
    kind = 'config'
    const h = config.hook
    if (!h?.name) throw new Error('the config names no hook ({ "hook": { "type": "attribute", "name": … } }) — pass --dark-hook/--dark-check')
    if (!HOOK_TYPES.includes(h.type)) throw new Error(`config hook.type ${JSON.stringify(h.type)} is not one of ${HOOK_TYPES.join('|')}`)
    if (config.defaultTheme != null && !['light', 'dark', 'auto'].includes(config.defaultTheme)) throw new Error(`config defaultTheme ${JSON.stringify(config.defaultTheme)} is not light|dark|auto`)
    site = { mark: h.type === 'class' ? `class:${h.name}` : `attr:${h.name}=dark`, storage: storageOf(config.persistence, 'config persistence'), defaultDark: config.defaultTheme === 'dark' }
  }
  const stored = (st, value) => (!st ? null : st.type === 'cookie' ? `cookie:${st.key}=${value}` : `ls:${st.key}=${value}`)
  const fileSite = site ? { dark: stored(site.storage, 'dark') ?? site.mark, light: site.defaultDark ? stored(site.storage, 'light') : null, check: site.mark } : null
  const siteDark = flags.darkHook ?? fileSite?.dark ?? 'attr:data-theme=dark'
  const siteLight = flags.lightHook ?? fileSite?.light ?? null
  const siteCheck = flags.darkCheck ?? fileSite?.check ?? siteDark
  // The source: its own flag; else the contract's source switches; else (config, defaults) the site's.
  if (src && theme === 'dark' && !src.dark && !flags.sourceDarkHook)
    throw new Error("the contract names no dark switch for the source (source.darkHook / source.darkRequestHook): its dark is not measured — pass --source-dark-hook")
  const srcDark = flags.sourceDarkHook ?? (src ? src.dark : siteDark)
  const srcLight = flags.sourceLightHook ?? (src ? src.light : null)
  const srcCheck = flags.sourceDarkCheck ?? (flags.sourceDarkHook ? flags.sourceDarkHook : src ? (src.mark ?? srcDark) : siteCheck)
  const dark = theme === 'dark'
  return {
    hooks: { site: dark ? { dark: siteDark } : { light: siteLight }, source: dark ? { dark: srcDark } : { light: srcLight } },
    checks: { site: siteCheck, source: srcCheck },
    from: {
      site: (dark ? flags.darkHook : flags.lightHook) !== undefined ? 'flag' : kind,
      source: (dark ? flags.sourceDarkHook : flags.sourceLightHook) !== undefined ? 'flag' : kind
    }
  }
}

export function formatMarkdown(results, { theme = null, width = null, selectors = null } = {}) {
  const lines = ['# Layout boxes — source vs site', '']
  if (theme) lines.push(`Mode: **${theme}**${width ? ` at ${width} px` : ''}`, '')
  if (selectors) lines.push(`Selector profile: **${selectors.profile}**${selectors.framework ? ` (source framework ${selectors.framework}${selectors.from ? `, from ${selectors.from}` : ''})` : ''}`, ...(selectors.gap ? [`- gap: ${selectors.gap}`] : []), '')
  for (const r of results) {
    lines.push(`## ${r.route} — ${r.differing}/${r.paired} paired blocks differ`)
    for (const side of r.unmeasured ?? []) lines.push(`- the ${side} shows no heading the ${selectors?.profile ?? 'selector'} profile reads: nothing on this route was compared on that side`)
    for (const row of r.rows) lines.push(`- **${row.tag} "${row.text.replace(/#1$/, '').slice(0, 60)}"**: ${row.deltas.map(([k, a, b]) => `${k} ${a} → ${b}`).join('; ')}`)
    if (r.onlySource.length) lines.push(`- only in the source: ${r.onlySource.map((t) => `"${t.slice(0, 40)}"`).join(', ')}`)
    if (r.onlySite.length) lines.push(`- only on the site: ${r.onlySite.map((t) => `"${t.slice(0, 40)}"`).join(', ')}`)
    // A side freezeMotion could not hold still (lib/motion.mjs): its boxes may move between runs.
    for (const [side, m] of [['source', r.motion?.[0]], ['site', r.motion?.[1]]])
      if (m?.error || m?.unhandled) lines.push(`- ${side} not held still: ${m.error ? `freeze failed: ${m.error}` : `${m.unhandled} carousel(s) no library API stops`}`)
    lines.push('')
  }
  return lines.join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const usage = (why) => {
    if (why) console.error(`layout-boxes: ${why}`)
    console.error('usage: layout-boxes.mjs --source <url> --site <url> --routes /a,/b|<page-map.json> [--source-prefix /index.php] [--width 1440] [--height 900] [--out file.json] [--theme light|dark] [--dark-hook <hook>] [--source-dark-hook <hook>] [--light-hook <hook>] [--source-light-hook <hook>] [--dark-check <mark>] [--source-dark-check <mark>] [--contract <visual.contract.json> | --config <review.config.json>] [--framework <T4|T3|…> | --provenance <provenance.json>]')
    process.exit(2)
  }
  // A flag named with no value is a usage error, not the default: `--light-hook` at the end of the
  // line would otherwise measure the page in whatever mode it opened in.
  const opt = (name, d) => {
    const i = process.argv.indexOf(name)
    if (i < 0) return d
    const v = process.argv[i + 1]
    if (v === undefined || v.startsWith('--')) usage(`${name} needs a value`)
    return v
  }
  const source = opt('--source')
  const site = opt('--site')
  const routesArg = opt('--routes')
  if (!source || !site || !routesArg) usage()
  const theme = opt('--theme', 'light')
  if (!['light', 'dark'].includes(theme)) usage(`--theme must be light or dark (got ${theme})`)
  // A page-map named on the command line and not there is an error, not an empty route list.
  if (routesArg.endsWith('.json') && !existsSync(routesArg)) usage(`--routes ${routesArg}: no such file`)
  // { path, status }: the status a page-map entry declares (`status`, or 404 for `view: "404"`), else
  // null — any 2xx. A synthetic page has no source route of its own and stays out, except the 404
  // page: it is synthetic because the source answers its error page for any unknown path, and it is
  // a page the port draws.
  let pageMap = null
  if (routesArg.endsWith('.json')) {
    try {
      pageMap = JSON.parse(readFileSync(routesArg, 'utf8'))
    } catch (err) {
      usage(`--routes ${routesArg}: not a readable page-map (${err.message})`)
    }
  }
  const routes = routesArg.endsWith('.json')
    ? (pageMap?.pages ?? []).filter((p) => !p.synthetic || p.view === '404').map((p) => ({ path: p.path, status: p.status != null ? Number(p.status) : p.view === '404' ? 404 : null }))
    : routesArg.split(',').map((path) => ({ path, status: null }))
  if (!routes.length) usage(`--routes ${routesArg} names no route`)
  const width = Number(opt('--width', 1440))
  const height = Number(opt('--height', 900))
  let prefix = opt('--source-prefix', '')
  // The switches and the marks: a flag, else the file (--contract / --config), else the defaults.
  const fileArg = opt('--contract') ?? opt('--config')
  if (process.argv.includes('--contract') && process.argv.includes('--config')) usage('name one of --contract and --config')
  let file = null
  if (fileArg) {
    if (!existsSync(fileArg)) usage(`${process.argv.includes('--contract') ? '--contract' : '--config'} ${fileArg}: no such file`)
    try {
      file = JSON.parse(readFileSync(fileArg, 'utf8'))
    } catch (err) {
      usage(`${fileArg}: not readable JSON (${err.message})`)
    }
  }
  const flag = (name) => (process.argv.includes(name) ? opt(name) : undefined)
  let resolved
  try {
    resolved = hooksOf({
      theme,
      contract: process.argv.includes('--contract') ? file : null,
      config: process.argv.includes('--config') ? file : null,
      flags: { darkHook: flag('--dark-hook'), sourceDarkHook: flag('--source-dark-hook'), lightHook: flag('--light-hook'), sourceLightHook: flag('--source-light-hook'), darkCheck: flag('--dark-check'), sourceDarkCheck: flag('--source-dark-check') }
    })
  } catch (err) {
    usage(err.message)
  }
  const { hooks, checks, from: hookFrom } = resolved
  // The selector profile: --framework, else --provenance, else the contract's source.framework, else
  // the T4 lists, assumed and said so.
  if (process.argv.includes('--framework') && process.argv.includes('--provenance')) usage('name one of --framework and --provenance')
  let profiled
  try {
    if (process.argv.includes('--framework')) {
      const fw = opt('--framework')
      if (!FRAMEWORK_NAME.test(fw)) usage(`--framework ${JSON.stringify(fw)} is not a framework classification (T4, T3, Helix, other, unknown, …)`)
      profiled = selectorProfileFor(fw, { from: '--framework' })
    }
    else if (process.argv.includes('--provenance')) profiled = readProvenanceFile(opt('--provenance'))
    else if (process.argv.includes('--contract')) profiled = selectorProfileOfContract(file)
    else profiled = selectorProfileFor(null, { declared: false })
  } catch (err) {
    usage(`--provenance ${err.message}`)
  }
  const selectors = selectorsRecord(profiled)
  const measureArg = measureOf(profiled.profile)
  for (const side of ['site', 'source'])
    if (!/(^|\+)(attr|class):/.test(checks[side]))
      usage(`the ${side}'s dark mark ${checks[side]} cannot be read in the page — name one with ${side === 'site' ? '--dark-check' : '--source-dark-check'} attr:<name>=<value> or class:<name>`)
  const notInMode = []
  const notLoaded = []
  const results = await withBrowser(async (browser) => {
    const measure = (url, side, expected) =>
      withPage(browser, { viewport: { width, height }, theme, darkHook: hooks[side].dark ?? null, darkRequestHook: hooks[side].dark ?? null, lightHook: hooks[side].light ?? null, hookUrl: url }, async (page) => {
        // A page that never loads (refused, unresolved, timed out) is not measured, like a wrong status.
        let res
        try {
          res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
        } catch (err) {
          notLoaded.push(`${side} ${url} did not load (${String(err.message).split('\n')[0]})`)
          return { status: 0, motion: null, inMode: null, blocks: [] }
        }
        const status = res?.status() ?? 0
        if (expected != null ? status !== expected : status < 200 || status > 299) notLoaded.push(`${side} ${url} answered ${status || 'nothing'}${expected != null ? ` (declared ${expected})` : ''}`)
        // Boxes of a page at rest: an AOS element mid-reveal is shifted by its transform.
        const motion = await freezeMotion(page)
        // Read after the page settled: a theme script that runs late can take the hook back off,
        // and a server that ignored the cookie never put the mark on.
        const dark = await page.evaluate(hookState, checks[side])
        const inMode = theme === 'dark' ? dark : !dark
        if (!inMode) notInMode.push(`${side} ${url} is not in ${theme} (${checks[side]} ${dark ? 'present' : 'absent'})`)
        return { status, motion, inMode, blocks: await page.evaluate(measureInPage, measureArg) }
      })
    // no --source-prefix: a source without URL rewrite answers under /index.php — each route is resolved on its own (one may answer
    // directly, another under /index.php); one that resolves nowhere keeps its address and fails as the 404 it is
    const res = prefix ? null : await resolveSourceRoutes(source, [...new Set(routes.map((r) => r.path))])
    const resolved = res?.results ?? null
    // a host that answers 200 on `/` yet has no address for a route is a failure of the tool: reported as not measured, never read as a 404
    // (a route the page map declares as an error page answers an error status: it is measured at its own address, not "unresolved")
    const expectsPage = new Set(routes.filter((r) => r.status == null || (r.status >= 200 && r.status < 300)).map((r) => r.path))
    const lost = (res?.failed ?? []).filter((f) => expectsPage.has(f.route))
    const unresolved = new Set(lost.map((f) => f.route))
    for (const f of lost) notLoaded.push(`source ${f.route} unresolved although ${source} answers 200 on / (${f.reason})`)
    const out = []
    for (const { path: route, status } of routes) {
      if (unresolved.has(route)) continue
      const src = await measure(resolved?.[route]?.url ?? `${source}${route === '/' ? '/' : prefix + route}`, 'source', status)
      const dst = await measure(`${site}${route}`, 'site', status)
      // A side that shows no heading the profile reads was not compared: named, never 0 differing.
      const unmeasured = [['source', src], ['site', dst]].filter(([, x]) => !x.blocks.length).map(([side]) => side)
      out.push({ route, status: [src.status, dst.status], motion: [src.motion, dst.motion], inMode: [src.inMode, dst.inMode], headings: [src.blocks.length, dst.blocks.length], ...(unmeasured.length ? { unmeasured } : {}), ...compareBlocks(src.blocks, dst.blocks, { width }) })
    }
    return out
  })
  if (notLoaded.length) {
    console.error(`layout-boxes: not measured — ${notLoaded.join('; ')}`)
    process.exit(2)
  }
  if (notInMode.length) {
    console.error(`layout-boxes: not measured — ${notInMode.join('; ')} (the page's own script undid the hook, the server ignored it, or the hook is wrong)`)
    process.exit(2)
  }
  const md = formatMarkdown(results, { theme, width, selectors })
  const outFile = opt('--out')
  if (outFile) {
    writeFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), source, site, width, height, theme, hooks, checks, hookFrom, ...(fileArg ? { hookFile: fileArg } : {}), selectors, results }, null, 2)}\n`)
    writeFileSync(outFile.replace(/\.json$/, '.md'), md)
  }
  console.log(md)
  process.exit(results.some((r) => r.differing > 0 || r.unmeasured) ? 1 : 0)
}
