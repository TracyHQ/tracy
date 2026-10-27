#!/usr/bin/env node
// Flow D (Apply) keys for ONE live site: every {key} the flow D cases of its CMS name (cases-tc-<cms>.json, `requires` of
// the cases whose `flows` holds D), plus `home` + `h1key` (run3's baseline sanity check) and the extra D keys dAddress and
// dHiddenPage. Read-only: HTML over the stand's router (curl, as oracle.mjs reads it), one headless Chromium for the
// colour keys (measured exactly as the oracle measures them), and SELECTs on the site's own database for what the page
// cannot show (pages Apply hid, a Pricing page that is not published). Nothing is written anywhere but --out.
//   node derive-d.mjs <label> <wordpress|joomla|emdash> [--out keys-<label>.json] [--no-db] [--no-browser] [--answers <file>]
// A key that cannot be resolved is "—" with a line in `reasons` (build-suite.mjs turns "—" into a missing key, so run3
// answers that case n/a instead of running it with a literal dash).
//
// Where each key comes from (A-flow keys MIRROR the A column of the TC key table — the same template element as on
// benchwp02/benchjoomla02/benchemdash04 — so an A run and a D run of a reused case edit the same thing):
//   home/dHome          '/' (Joomla '/en/' when it answers 200)       innerPage/dAbout   the menu link to /about
//   contact/dContact/thExceptPage  the menu link to /contact             cardPage           home
//   h1key/dHeroH1       home <h1>                                       cta1 cta1Href cta2 the hero's first two links
//   sectionH2           the "Why …" line (A: whyHeading)                sectionH2b         the News h2 (A: newsHeading); when
//   Apply hid the news, the h2 of the section holding projCard1, else the first h2 — sectionH2bLead the next line under it
//   card1 card2         the 02 / 03 numbered card titles (A: svc2title / svc3title), moved to a unique pair when 02 repeats
//   para1               the about page's lead under its h1 (A: aboutLead)   para2First/Last  a ≥2-sentence <p> of the about page
//   navItem navPrev navHref   main menu item 3, item 2, item 3's href (A: nav3)     dMenuItem  main menu item 2
//   copyright           the © line                                      projCard1          first unique h3 with its own picture
//   thOtherBtn          the CTA band's button (A: ctaBandBtn)           thHeaderCta        the filled button in the header
//   thAccentText        the eyebrow over the card group, if painted in the accent (A: "What we do"), else another accent line
//   thInnerAccent       a short accent-coloured text on the about page  thExceptBtn        a filled accent button on contact
//   thExceptName        the contact page's menu label                   formDescLabel      the contact form textarea's label
//   des*                background-color / color measured in Chromium with the oracle's own request (accent = cta1 bg)
//   dName dPhone dEmail dAddress   site_brief.normalized (else the answers file), kept only where the site shows them
//   dHomeVi             hreflang vi on home, else /vi/ or /vi answering 200 as <html lang="vi…">
//   dHiddenPage(Name)   a page Apply hid: WordPress draft page · Joomla unpublished menu item · EmDash unpublished entry
//   dPricePage          the Pricing page if one exists unpublished, else the path a new "Pricing" page gets (predicted)
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { links, visible, regionOf } from '../../oracle.mjs'
import { lines, deriveHome, deriveHomeV4, deriveAboutV4 } from '../../derive.mjs'
import { sitePath } from '../../derive-v6.mjs'
import { hreflangs, nearestImage, forms } from '../../v6/lib/html.mjs'
import { measureStyles, keyValue, launchBrowser, VIEWPORTS } from '../../v6/lib/style.mjs'
import { parseColor, deltaE, toHex } from '../../v6/lib/color.mjs'

const HERE = new URL('.', import.meta.url).pathname
const BENCH = new URL('../../', import.meta.url).pathname
const PORT = 51710
const DASH = '—'
const ALIAS = {
  wp: 'wordpress',
  wordpress: 'wordpress',
  j: 'joomla',
  joomla: 'joomla',
  ed: 'emdash',
  emdash: 'emdash'
}
const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n, d = null) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d)
const [label, cmsArg] = argv.filter(
  (a, i) => !a.startsWith('--') && !['--out', '--answers', '--offline-home'].includes(argv[i - 1])
)
const platform = ALIAS[cmsArg ?? '']
if (!label || !/^[a-z0-9-]+$/.test(label) || !platform) {
  console.error(
    'usage: node derive-d.mjs <label> <wordpress|joomla|emdash> [--out <file>] [--no-db] [--no-browser] [--answers <file>]'
  )
  process.exit(2)
}
const OUT = opt('--out', `${HERE}keys-${label}.json`)
const NO_DB = flag('--no-db') || argv.includes('--offline-home')
const NO_BROWSER = flag('--no-browser') || argv.includes('--offline-home')
const ANSWERS = opt('--answers', `${HERE}answers-${platform}.json`)
// Offline check of the home-page rules on a saved page (no other page, no browser, no database): --offline-home <file>.
const OFFLINE_HOME = opt('--offline-home')

const keys = {}
const reasons = {}
const notes = {}
const set = (k, v, note) => {
  if (v === null || v === undefined || v === '') return
  keys[k] = v
  delete reasons[k]
  if (note) notes[k] = note
}
const has = (k) => keys[k] !== undefined && keys[k] !== DASH
const fail = (k, why) => {
  if (keys[k] !== undefined && keys[k] !== DASH) return
  keys[k] = DASH
  reasons[k] = why
}
const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const count = (hay, s) => (s ? String(hay).split(s).length - 1 : 0)
const pathOnly = (p) => String(p ?? '').replace(/\/$/, '') || '/'

// ---- the key list: what the flow D cases of this CMS reference
const suite = JSON.parse(readFileSync(`${BENCH}tc/cases-tc-${platform}.json`, 'utf8'))
const dCases = suite.cases.filter((c) => String(c.flows ?? '').includes('D'))
const NEEDED = [
  ...new Set(['home', 'h1key', ...dCases.flatMap((c) => c.requires ?? []), 'dAddress', 'dHiddenPage'])
]

// ---- reading the site (cached; curl through the router, no proxy, like oracle.mjs fetchPage)
const cache = new Map()
function get(path, { follow = true } = {}) {
  const id = `${follow}|${path}`
  if (cache.has(id)) return cache.get(id)
  if (OFFLINE_HOME) {
    const got =
      ['/', '/en/'].includes(path) && (platform === 'joomla') === (path === '/en/')
        ? { status: 200, html: readFileSync(OFFLINE_HOME, 'utf8'), url: path, path }
        : { status: 0, html: '', url: path, path }
    cache.set(id, got)
    return got
  }
  const host = `${label}.tracy.test`
  const url = /^https?:\/\//.test(path) ? path : `http://${host}:${PORT}${path}`
  const r = spawnSync(
    'curl',
    [
      '-s',
      ...(follow ? ['-L'] : []),
      '-m',
      '30',
      '--noproxy',
      '*',
      '--resolve',
      `${host}:${PORT}:127.0.0.1`,
      '-w',
      '\n%{http_code} %{url_effective}',
      url
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 40000 }
  )
  const out = r.stdout ?? ''
  const cut = out.lastIndexOf('\n')
  const [code, eff] = out.slice(cut + 1).split(' ')
  const got = { status: Number(code) || 0, html: out.slice(0, cut), url: eff ?? url, path }
  cache.set(id, got)
  return got
}
const htmlLang = (html) => (/<html\b[^>]*\blang="([^"]*)"/i.exec(html ?? '')?.[1] ?? '').toLowerCase()
const pages = {}
const note = (path, g) => (pages[path] = g.status)

// ---- home
let home = '/'
if (platform === 'joomla' && get('/en/').status === 200) home = '/en/'
else {
  const g = get('/')
  const eff = sitePath(g.url, label)
  if (g.status === 200 && /^\/[a-z]{2}(?:-[a-z]{2})?\/?$/i.test(eff)) home = eff
}
const H = get(home)
note(home, H)
if (H.status !== 200 || !H.html) {
  console.error(
    `${label}: home ${home} answered HTTP ${H.status} — is the site up (and published to the router)?`
  )
  process.exit(1)
}
set('home', home)
set('dHome', home)
set('cardPage', home)
/** The page's content: <main>, else (Joomla T4 has none) from the section holding the h1 to the last <footer> — so the
 *  header's mega menu (its own h3s and pictures) is not taken for page content. */
function contentOf(html) {
  if (/<main\b/i.test(html)) return regionOf(html, 'main')
  const h = html.search(/<h1\b/i)
  const start = h >= 0 ? Math.max(0, html.lastIndexOf('<section', h)) : 0
  const end = [...html.matchAll(/<footer\b/gi)].at(-1)?.index ?? html.length
  return html.slice(start, end > start ? end : html.length)
}
const homeMain = contentOf(H.html)
const homeText = visible(H.html)
const homeMainText = visible(homeMain)
const base = deriveHome(H.html, label)

// ---- main menu → about, contact
function mainMenu(html) {
  const homes = new Set(['/', home].map(pathOnly))
  const navs = [...String(html).matchAll(/<nav\b[\s\S]*?<\/nav>/gi)].map((m) =>
    links(m[0]).filter((l) => l.text)
  )
  const first = (ls) => homes.has(pathOnly(sitePath(ls[0]?.href, label)))
  return (
    navs.find((ls) => ls.length >= 5 && first(ls)) ??
    navs.find((ls) => ls.length >= 4 && first(ls)) ??
    navs.find((ls) => ls.length >= 5) ??
    []
  )
}
const menu = mainMenu(H.html).map((l) => ({ text: l.text, path: sitePath(l.href, label) }))
notes.$menu = menu.map((m) => `${m.text} ${m.path}`).join(' | ')
const lastSeg = (p) => pathOnly(p).split('/').filter(Boolean).pop() ?? ''
const findPage = (re, probes) => {
  const hit = menu.find((m) => re.test(lastSeg(m.path))) ?? menu.find((m) => re.test(m.text))
  if (hit && !/^https?:/.test(hit.path)) return { path: hit.path, label: hit.text, how: 'main menu' }
  for (const p of probes) if (get(p).status === 200) return { path: p, label: null, how: `probe ${p}` }
  return null
}
const langRoot = home.endsWith('/') ? home : `${home}/`
const about = findPage(/^about/i, platform === 'wordpress' ? ['/about/'] : [`${langRoot}about`, '/about'])
const contact = findPage(
  /^contact/i,
  platform === 'wordpress' ? ['/contact/'] : [`${langRoot}contact`, '/contact']
)
const A = about ? get(about.path) : null
const C = contact ? get(contact.path) : null
if (about) note(about.path, A)
if (contact) note(contact.path, C)
for (const k of ['innerPage', 'dAbout'])
  about && A.status === 200
    ? set(k, about.path, `${about.how}`)
    : fail(
        k,
        about
          ? `about page ${about.path} answered HTTP ${A.status}`
          : 'no About link in the main menu and no /about page'
      )
for (const k of ['contact', 'dContact', 'thExceptPage'])
  contact && C.status === 200
    ? set(k, contact.path, contact.how)
    : fail(
        k,
        contact
          ? `contact page ${contact.path} answered HTTP ${C.status}`
          : 'no Contact link in the main menu and no /contact page'
      )
if (contact?.label) set('thExceptName', contact.label, 'the contact page as the main menu names it')
else fail('thExceptName', 'the contact page has no main-menu link')

// ---- home text keys (deriveHome / deriveHomeV4: the rules that made the A keys)
// The h1 as the oracle's visible() reads it (run3's sanity check is `home has {h1key}` on that text).
const h1 = visible(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(H.html)?.[1] ?? '')
set('h1key', h1)
set('dHeroH1', h1, 'home <h1> after Apply')
if (!h1) ['h1key', 'dHeroH1'].forEach((k) => fail(k, 'home has no <h1>'))
if (base.cta1) {
  set('cta1', base.cta1)
  set('cta1Href', base.cta1Href === '#' ? '#' : sitePath(base.cta1Href, label))
} else ['cta1', 'cta1Href'].forEach((k) => fail(k, 'the hero section holds no link'))
base.cta2 ? set('cta2', base.cta2) : fail('cta2', 'the hero section holds one link only')
base.copyright ? set('copyright', base.copyright) : fail('copyright', 'no line starting with © on home')
const v4 = deriveHomeV4(H.html, { ...base, home, about: about?.path })
const nav = menu.map((m) => m.text)
if (nav.length >= 3) {
  set('navItem', nav[2], 'main menu item 3 (A: nav3)')
  set('navPrev', nav[1])
  set('navHref', menu[2].path)
} else ['navItem', 'navPrev', 'navHref'].forEach((k) => fail(k, `main menu has ${nav.length} items`))
const dMenu = menu.find((m, i) => i > 0 && pathOnly(m.path) !== pathOnly(contact?.path ?? '#')) ?? null
dMenu
  ? set('dMenuItem', dMenu.text, 'first main-menu item after Home')
  : fail('dMenuItem', 'main menu has no item after Home')

// sectionH2 = the "Why …" line (A whyHeading); sectionH2b = the News h2 (A newsHeading), else another section's h2.
const L = lines(homeMain)
const h2s = [...homeMain.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => visible(m[1])).filter(Boolean)
if (base.whyHeading && count(homeMainText, base.whyHeading) === 1)
  set('sectionH2', base.whyHeading, 'the "Why …" line (A: whyHeading)')
else {
  const alt = h2s.find((h) => count(homeMainText, h) === 1 && h !== base.ctaBand)
  alt
    ? set('sectionH2', alt, `no unique "Why …" line (${base.whyHeading ?? 'none'}); first unique h2`)
    : fail('sectionH2', 'no unique "Why …" line and no unique h2 on home')
}
// ---- cards: the numbered group 01, 02, 03 … (A: svc2title / svc3title)
const cardTitles = []
for (let i = 0; i < L.length; i++)
  if (/^0\d$/.test(L[i]) && Number(L[i]) === cardTitles.length + 1) cardTitles.push(L[i + 1])
// projCard1: the first h3 with its own picture that is not a numbered card, unique on the page.
const h3s = [...homeMain.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)].map((m) => visible(m[1])).filter(Boolean)
// Unique in the page content (its `src: "same"` check is a guard; a copy in the header's mega menu cannot fail it).
const projCard1 = h3s.find(
  (t) =>
    !cardTitles.includes(t) &&
    t !== base.whyHeading &&
    count(homeMainText, t) === 1 &&
    (nearestImage(homeMain, t).src ?? null) &&
    nearestImage(homeMain, t).src !== base.heroImg
)
projCard1
  ? set(
      'projCard1',
      projCard1,
      `picture ${nearestImage(homeMain, projCard1).src}; on the whole page ${count(homeText, projCard1)}×`
    )
  : fail('projCard1', 'no h3 in the home content with a picture of its own (not the hero) and a unique text')
const newsH2 = h2s.find((h) => /^news\b/i.test(h))
let h2b = null
if (newsH2 && count(homeMainText, newsH2) === 1 && newsH2 !== keys.sectionH2)
  h2b = [newsH2, 'the News h2 (A: newsHeading)']
else {
  // The h2 of the section that holds projCard1 (the heading just before it), else the first other unique h2.
  const at = projCard1 ? homeMain.indexOf(projCard1) : -1
  const before =
    at > 0
      ? [...homeMain.slice(0, at).matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => visible(m[1])).pop()
      : null
  const pick = [before, ...h2s].find(
    (h) => h && h !== keys.sectionH2 && h !== base.ctaBand && count(homeMainText, h) === 1
  )
  if (pick)
    h2b = [
      pick,
      `no News h2 on home (Apply hid the posts?); ${pick === before ? 'h2 of the section holding projCard1' : 'first other unique h2'}`
    ]
}
if (h2b) {
  set('sectionH2b', h2b[0], h2b[1])
  const i = L.indexOf(h2b[0])
  const lead =
    i >= 0
      ? L.slice(i + 1, i + 12).find(
          (l) =>
            l.split(' ').length >= 4 &&
            !/[→·]/.test(l) &&
            count(homeMainText, l) === 1 &&
            !cardTitles.includes(l)
        )
      : null
  lead ? set('sectionH2bLead', lead) : fail('sectionH2bLead', `no unique line of ≥ 4 words under "${h2b[0]}"`)
} else ['sectionH2b', 'sectionH2bLead'].forEach((k) => fail(k, 'no second unique h2 on home'))

// card1/card2: 02 + 03 as on A; when 02's title is not unique on the page (a gone check could never pass), the first
// numbered title that is, with its neighbour.
const uniqueCard = (t) => t && count(homeText, t) === 1
let ci = uniqueCard(cardTitles[1]) ? 1 : cardTitles.findIndex(uniqueCard)
if (cardTitles.length >= 2 && ci >= 0) {
  const other = ci + 1 < cardTitles.length ? ci + 1 : ci - 1
  set(
    'card1',
    cardTitles[ci],
    ci === 1
      ? 'numbered card 02 (A: svc2title)'
      : `numbered card 0${ci + 1}: 02 "${cardTitles[1]}" repeats on the page`
  )
  set('card2', cardTitles[other], `numbered card 0${other + 1}`)
} else
  ['card1', 'card2'].forEach((k) =>
    fail(
      k,
      cardTitles.length < 2
        ? `no numbered card group on home (${cardTitles.length} titles)`
        : `no numbered card title is unique on home, where the oracle's gone reads (${cardTitles.map((t) => `"${t}" ×${count(homeText, t)}`).join(', ')})`
    )
  )

// thOtherBtn: the CTA band's button (A: ctaBandBtn), checked unique below in the browser scan.
const ctaBandBtn = v4.ctaBandBtn

// ---- about page: para1 (A: aboutLead), para2First/para2Last
if (A?.status === 200) {
  const aboutMain = contentOf(A.html)
  const aboutMainText = visible(aboutMain)
  const lead = deriveAboutV4(A.html).aboutLead
  lead && count(visible(A.html), lead) === 1
    ? set('para1', lead, 'the about page lead under its h1 (A: aboutLead)')
    : fail('para1', lead ? `the about lead repeats on the page` : 'no paragraph-long line under the about h1')
  const sentences = (t) =>
    t
      .split(/(?<=[.!?])\s+(?=[A-Z0-9“"‘(])/)
      .map(squash)
      .filter(Boolean)
  const paras = [...aboutMain.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => visible(m[1]))
    .filter(
      (t) =>
        t.length >= 60 &&
        t !== keys.para1 &&
        !(keys.para1 && (t.includes(keys.para1) || keys.para1.includes(t)))
    )
  const two = paras
    .map(sentences)
    .find(
      (s) =>
        s.length >= 2 &&
        s[0] !== s.at(-1) &&
        count(aboutMainText, s[0]) === 1 &&
        count(aboutMainText, s.at(-1)) === 1 &&
        count(visible(A.html), s.at(-1)) === 1
    )
  if (two) {
    set('para2First', two[0])
    set('para2Last', two.at(-1))
  } else
    ['para2First', 'para2Last'].forEach((k) =>
      fail(
        k,
        `no <p> of ≥ 2 sentences with unique first and last sentence on the about page (${paras.length} paragraphs ≥ 60 chars)`
      )
    )
} else
  ['para1', 'para2First', 'para2Last', 'thInnerAccent', 'desParaColor'].forEach((k) =>
    fail(k, 'no about page')
  )

// ---- contact form: the textarea's label (static first; the browser scan below replaces it with the label's OWN text)
if (C?.status === 200) {
  const ta = forms(C.html)
    .flatMap((f) => f.fields)
    .find((f) => f.tag === 'textarea')
  if (ta?.label) {
    set('formDescLabel', squash(ta.label.replace(/\s*\*\s*$/, ' *')), `static label; required=${ta.required}`)
    if (!ta.required) notes.formDescLabel += ' — NOT required in the served HTML (the case requires it)'
  } else fail('formDescLabel', 'no <textarea> with a label in a form on the contact page')
}

// ---- the browser: role keys (header CTA, accent texts, accent button) and every colour key, measured like the oracle
const abs = (p) => (/^https?:\/\//.test(p) ? p : `http://${label}.tracy.test:${PORT}${p}`)
/** Runs in the page: every shown element with its own text, its region, colour and the filled control around it. */
function scanPage() {
  const norm = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  const own = (el) =>
    norm(
      [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.nodeValue)
        .join(' ')
    )
  const shown = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const st = getComputedStyle(el)
    return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05
  }
  const main = document.querySelector('main')
  const footer = [...document.querySelectorAll('footer')].pop() ?? null
  const header = document.querySelector('header')
  const h1 = document.querySelector('h1')
  const hero = h1
    ? ([...document.querySelectorAll('section')]
        .filter((s) => s.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING)
        .pop() ?? h1.parentElement)
    : null
  const where = (el) => {
    if (footer && footer.contains(el)) return 'footer'
    if (main)
      return main.contains(el)
        ? hero && hero.contains(el)
          ? 'hero'
          : 'main'
        : el.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING
          ? 'top'
          : 'after'
    return header && header.contains(el) ? 'top' : hero && hero.contains(el) ? 'hero' : 'main'
  }
  const cv = document.createElement('canvas')
  cv.width = 1
  cv.height = 1
  const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = (v) => {
    if (!v || !CSS.supports('color', v)) return null
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = '#000000'
    cx.fillStyle = v
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: Math.round((d[3] / 255) * 1000) / 1000 }
  }
  const items = []
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE'].includes(el.tagName)) continue
    const text = own(el)
    if (!text || text.length > 80 || !shown(el)) continue
    const ctl = el.closest('a, button, [role="button"]')
    const ctlBg = ctl ? rgba(getComputedStyle(ctl).backgroundColor) : null
    items.push({
      text,
      tag: el.tagName.toLowerCase(),
      region: where(el),
      color: rgba(getComputedStyle(el).color),
      ctl: ctl ? { text: norm(ctl.innerText), bg: ctlBg, filled: Boolean(ctlBg && ctlBg.a > 0.5) } : null
    })
  }
  // Submit inputs: the oracle's text lookup cannot find them (no own text), so they are reported, never chosen.
  const submits = [...document.querySelectorAll('input[type="submit"], input[type="button"]')]
    .filter(shown)
    .map((i) => ({ value: norm(i.value), bg: rgba(getComputedStyle(i).backgroundColor), region: where(i) }))
  const textareas = [...document.querySelectorAll('form textarea')].map((t) => ({
    name: t.name,
    required: Boolean(t.required) || t.getAttribute('aria-required') === 'true',
    labels: [...(t.labels ?? [])].map((l) => own(l)).filter(Boolean)
  }))
  return { items, textareas, submits }
}
const near = (c, hex, max = 10) => c && hex && deltaE(c, parseColor(hex)) <= max
if (!NO_BROWSER) {
  const browser = await launchBrowser()
  const scan = async (path) => {
    const ctx = await browser.newContext({
      ...VIEWPORTS.desktop,
      reducedMotion: 'reduce',
      ignoreHTTPSErrors: true
    })
    try {
      const page = await ctx.newPage()
      await page.goto(abs(path), { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {})
      await page
        .evaluate(() => Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 5000))]))
        .catch(() => {})
      await page.waitForTimeout(800)
      return await page.evaluate(scanPage)
    } finally {
      await ctx.close().catch(() => {})
    }
  }
  const measure = async (list) => {
    const got = await measureStyles(
      list.map(([key, path, req, viewport]) => ({
        key,
        url: abs(path),
        viewport,
        req: { kind: 'one', ...req }
      })),
      { browser }
    )
    return got
  }
  try {
    const hs = await scan(home)
    const pageCount = (s, t) => s.items.filter((x) => x.text === t).length
    const acc = has('cta1')
      ? await measure([['accent', home, { text: keys.cta1, prop: 'background-color' }]])
      : { accent: { ok: false, error: 'no cta1' } }
    const accent = keyValue('background-color', acc.accent)
    notes.$accent = accent ? `${accent} (cta1 background)` : `not measured: ${acc.accent?.error}`
    // thHeaderCta: a filled control in the header, its own text unique there, not a hero button.
    const head = hs.items.filter(
      (x) =>
        x.region === 'top' &&
        x.ctl?.filled &&
        x.ctl.text === x.text &&
        x.text.length <= 40 &&
        ![keys.cta1, keys.cta2].includes(x.text)
    )
    const hc = head.find((x) => hs.items.filter((y) => y.region === 'top' && y.text === x.text).length === 1)
    hc
      ? set('thHeaderCta', hc.text, 'filled button in the header')
      : fail('thHeaderCta', `no filled button with a unique text in the header (${head.length} candidates)`)
    // thOtherBtn: the CTA band's button (A: ctaBandBtn) when it is a unique filled control; else the last such in main.
    const filledMain = hs.items.filter(
      (x) =>
        x.region === 'main' &&
        x.ctl?.filled &&
        x.ctl.text === x.text &&
        pageCount(hs, x.text) === 1 &&
        ![keys.cta1, keys.cta2, keys.thHeaderCta].includes(x.text)
    )
    const ob =
      filledMain.find((x) => x.text === ctaBandBtn) ??
      [...filledMain].reverse().find((x) => near(x.ctl.bg, accent)) ??
      filledMain.at(-1)
    ob
      ? set(
          'thOtherBtn',
          ob.text,
          ob.text === ctaBandBtn
            ? 'the CTA band button (A: ctaBandBtn)'
            : `filled button in main (CTA band button "${ctaBandBtn ?? 'none'}" not usable)`
        )
      : fail('thOtherBtn', 'no other filled button with a unique text on home')
    // thAccentText: the eyebrow over the numbered card group (A "What we do") when painted in the accent; else the first
    // short accent-coloured text in main that is no control and unique on the page.
    const firstCard = L.findIndex((l) => l === '01')
    const groupH2 =
      firstCard > 0
        ? L.slice(0, firstCard)
            .reverse()
            .find((l) => h2s.includes(l))
        : null
    const eyebrow = groupH2 ? L[L.indexOf(groupH2) - 1] : null
    const accentOf = (x) =>
      !x.ctl && /[A-Za-zÀ-ỹ]{3}/.test(x.text) && x.text.length <= 40 && near(x.color, accent, 6)
    const eb = hs.items.find((x) => x.text === eyebrow && accentOf(x) && pageCount(hs, x.text) === 1)
    const at = eb ?? hs.items.find((x) => x.region === 'main' && accentOf(x) && pageCount(hs, x.text) === 1)
    at
      ? set(
          'thAccentText',
          at.text,
          eb
            ? 'eyebrow over the card group, accent colour (A: "What we do")'
            : `accent-coloured text in main (eyebrow "${eyebrow ?? 'none'}" not accent/unique)`
        )
      : fail('thAccentText', `no short text painted in the accent ${accent} on home`)
    // about page: thInnerAccent (a word or number in the accent colour)
    if (A?.status === 200) {
      const as = await scan(about.path)
      const ia = as.items.find(
        (x) =>
          x.region !== 'top' &&
          x.region !== 'footer' &&
          !x.ctl &&
          x.text.length <= 40 &&
          near(x.color, accent, 6) &&
          as.items.filter((y) => y.text === x.text).length === 1
      )
      ia
        ? set('thInnerAccent', ia.text, `accent-coloured ${ia.tag} on the about page`)
        : fail('thInnerAccent', `no short text painted in the accent ${accent} on the about page`)
    }
    // contact page: thExceptBtn (a filled accent button outside the header), formDescLabel (the label's OWN text)
    if (C?.status === 200) {
      const cs = await scan(contact.path)
      const once = (t) => cs.items.filter((y) => y.text === t).length === 1
      const btns = cs.items.filter(
        (x) =>
          x.region !== 'top' && x.ctl?.filled && x.ctl.text === x.text && x.text.length <= 40 && once(x.text)
      )
      // Main first, then footer, then header: the header CTA is the same on every page, a weaker witness of "kept its colour".
      const order = { main: 0, hero: 0, after: 1, footer: 1, top: 2 }
      const eb2 =
        btns.filter((x) => near(x.ctl.bg, accent)).sort((a, b) => order[a.region] - order[b.region])[0] ??
        null
      const sub = cs.submits
        .filter((x) => near(x.bg, accent))
        .map((x) => `<input type=submit value="${x.value}">`)
      eb2
        ? set(
            'thExceptBtn',
            eb2.text,
            `filled accent button on the contact page, ${eb2.region} (${toHex(eb2.ctl.bg)})`
          )
        : fail(
            'thExceptBtn',
            `no control with its own text filled in the accent ${accent} on the contact page${sub.length ? ` — only ${sub.join(', ')}, which the oracle's text lookup cannot find` : ''} (${btns.length} other filled buttons)`
          )
      const ta = cs.textareas.find((t) => t.labels.length)
      if (ta) {
        set(
          'formDescLabel',
          ta.labels[0],
          `label's own text (what the oracle's visible/form rules read); required=${ta.required}`
        )
        if (!ta.required) notes.formDescLabel += ' — NOT required after load (the case requires it)'
      }
    }
    // colours, with the oracle's own requests (M-L2-style-one-button, M-L3-color-sitewide-except)
    const wants = []
    if (has('cta2')) wants.push(['desCta2Bg', home, { text: keys.cta2, prop: 'background-color' }])
    if (has('thOtherBtn'))
      wants.push(['desOtherBtnBg', home, { text: keys.thOtherBtn, prop: 'background-color' }])
    if (has('thHeaderCta'))
      wants.push([
        'desHeaderCtaBg',
        home,
        { text: keys.thHeaderCta, prop: 'background-color', within: 'top' }
      ])
    if (has('para1') && has('innerPage'))
      wants.push(['desParaColor', keys.innerPage, { text: keys.para1, prop: 'color' }])
    if (has('thExceptBtn') && has('thExceptPage'))
      wants.push(['desExceptBtnBg', keys.thExceptPage, { text: keys.thExceptBtn, prop: 'background-color' }])
    const m = await measure(wants)
    for (const [k, , req] of wants) {
      const v = keyValue(req.prop, m[k])
      v
        ? set(k, v, `${m[k].el}${m[k].via ? ` via ${m[k].via}` : ''}`)
        : fail(k, `not measured: ${m[k]?.error ?? 'no value'}`)
    }
  } finally {
    await browser.close().catch(() => {})
  }
} else
  for (const k of [
    'thHeaderCta',
    'thOtherBtn',
    'thAccentText',
    'thInnerAccent',
    'thExceptBtn',
    'desCta2Bg',
    'desOtherBtnBg',
    'desHeaderCtaBg',
    'desParaColor',
    'desExceptBtnBg'
  ])
    fail(k, '--no-browser')
for (const [k, dep] of [
  ['desCta2Bg', 'cta2'],
  ['desOtherBtnBg', 'thOtherBtn'],
  ['desHeaderCtaBg', 'thHeaderCta'],
  ['desParaColor', 'para1'],
  ['desExceptBtnBg', 'thExceptBtn']
])
  if (!has(dep)) fail(k, `needs ${dep}`)

// ---- what the owner typed: site_brief.normalized, else the answers file
const psql = (sql) =>
  spawnSync('docker', ['exec', 'tracy-postgres-1', 'psql', '-U', 'tracy', '-d', 'tracy', '-Atc', sql], {
    encoding: 'utf8',
    timeout: 20000
  })
let brief = null
{
  const r = psql(
    `select json_build_object('state', state, 'normalized', normalized, 'brief', brief) from site_brief where site_key = coalesce((select site_key from site where label = '${label}' limit 1), '${label}.tracy.test')`
  )
  if (r.status === 0 && r.stdout.trim()) brief = JSON.parse(r.stdout.trim())
  const book = psql(`select platform from site where label = '${label}'`)
  const bookPlatform = (book.stdout ?? '').trim()
  if (bookPlatform && bookPlatform !== platform)
    console.error(`${label}: the site book says ${bookPlatform}, not ${platform}`)
  notes.$brief = brief ? `site_brief state=${brief.state}` : 'no site_brief row (not created through Apply?)'
}
const typed = (() => {
  const n = brief?.normalized ?? null
  if (n)
    return { name: n.name, phone: n.phone, email: n.email, address: n.address, from: 'site_brief.normalized' }
  if (!brief || !existsSync(ANSWERS)) return null
  const a = JSON.parse(readFileSync(ANSWERS, 'utf8')).answers ?? {}
  const text = [a.about, a.contact, a.email].filter(Boolean).join(' · ')
  const phone = /\+?\d[\d\s().-]{6,}\d/.exec(text)?.[0]?.trim()
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(text)?.[0]
  const address = a.contact
    ? squash(a.contact.replace(phone ?? '', '').replace(/[·,\s]+$/, ''))
    : /at ([^.]+)\./.exec(a.about ?? '')?.[1]
  return { name: a.name, phone, email, address, from: `answers file ${ANSWERS.split('/').pop()}` }
})()
const siteTexts = [
  homeText,
  C?.status === 200 ? visible(C.html) : '',
  A?.status === 200 ? visible(A.html) : ''
].join(' \n ')
const digits = (s) => String(s ?? '').replace(/\D/g, '')
if (!typed)
  for (const k of ['dName', 'dPhone', 'dEmail', 'dAddress'])
    fail(k, 'no site_brief row for this site: not a flow D (Apply) site')
else {
  typed.name && siteTexts.includes(typed.name)
    ? set('dName', typed.name, `${typed.from}; on home ${count(homeText, typed.name)}×`)
    : fail(
        'dName',
        typed.name
          ? `"${typed.name}" (${typed.from}) is not on home/contact/about`
          : `no name in ${typed.from}`
      )
  if (typed.phone) {
    if (siteTexts.includes(typed.phone))
      set(
        'dPhone',
        typed.phone,
        `${typed.from}; on contact ${count(visible(C?.html ?? ''), typed.phone)}×, home ${count(homeText, typed.phone)}×`
      )
    else {
      const shown = [...siteTexts.matchAll(/\+?\d[\d\s().-]{6,}\d/g)]
        .map((m) => m[0].trim())
        .find((s) => digits(s).endsWith(digits(typed.phone).replace(/^0/, '')))
      shown
        ? set('dPhone', shown, `shown as "${shown}" (typed "${typed.phone}")`)
        : fail('dPhone', `"${typed.phone}" (${typed.from}) is not on home/contact/about in any spelling`)
    }
  } else fail('dPhone', `no phone in ${typed.from}`)
  const em =
    typed.email &&
    [...siteTexts.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)]
      .map((m) => m[0])
      .find((e) => e.toLowerCase() === typed.email.toLowerCase())
  em
    ? set('dEmail', em, typed.from)
    : fail(
        'dEmail',
        typed.email
          ? `"${typed.email}" (${typed.from}) is not on home/contact/about`
          : `no email in ${typed.from}`
      )
  typed.address && siteTexts.includes(typed.address)
    ? set('dAddress', typed.address, typed.from)
    : fail(
        'dAddress',
        typed.address
          ? `"${typed.address}" (${typed.from}) is not on home/contact/about`
          : `no address in ${typed.from}`
      )
}

// ---- the Vietnamese edition
{
  const fromHreflang = hreflangs(H.html).find((h) => /^vi\b/.test(h.lang))
  const tries = [...(fromHreflang ? [sitePath(fromHreflang.href, label)] : []), '/vi/', '/vi']
  let found = null
  for (const p of tries) {
    const g = get(p)
    if (g.status === 200 && htmlLang(g.html).startsWith('vi')) {
      found = [p, g]
      break
    }
  }
  if (found) {
    const h1vi = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(found[1].html)?.[1]
    set(
      'dHomeVi',
      found[0],
      `${fromHreflang ? 'hreflang vi' : 'probe'}; <html lang="${htmlLang(found[1].html)}">; h1 "${visible(h1vi ?? '').slice(0, 60)}"${visible(h1vi ?? '') === keys.dHeroH1 ? ' — SAME as the English h1' : ''}`
    )
    note(found[0], found[1])
  } else
    fail(
      'dHomeVi',
      `no Vietnamese home: hreflang vi ${fromHreflang ? 'present' : 'absent'}, ${tries.map((p) => `${p} HTTP ${get(p).status} lang "${htmlLang(get(p).html)}"`).join(', ')}`
    )
}

// ---- the site's own database: a page Apply hid, a Pricing page (read-only SELECTs)
const DEMO = ['careers', 'investors', 'investor-relations']
const rank = (slug) => {
  const i = DEMO.indexOf(String(slug).toLowerCase())
  return i < 0 ? 9 : i
}
function mariadb(sql) {
  const db = platform === 'joomla' ? 'joomla' : 'wordpress'
  const r = spawnSync(
    'docker',
    ['exec', '-i', `${label}-db-1`, 'sh', '-c', `mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -N -B ${db}`],
    { input: `SET SESSION TRANSACTION READ ONLY;\n${sql}\n`, encoding: 'utf8', timeout: 30000 }
  )
  if (r.status !== 0)
    return {
      error:
        String(r.stderr ?? '')
          .trim()
          .slice(0, 200) || `exit ${r.status}`
    }
  return {
    rows: String(r.stdout)
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('\t'))
  }
}
function sqlite(sql) {
  const file = `${process.env.TRACY_DATA ?? `${homedir()}/tracy-data`}/private/${label}/data/data.db`
  if (!existsSync(file)) return { error: `no ${file}` }
  const r = spawnSync('sqlite3', ['-readonly', '-json', file, sql], { encoding: 'utf8', timeout: 30000 })
  if (r.status !== 0)
    return {
      error:
        String(r.stderr ?? '')
          .trim()
          .slice(0, 200) || `exit ${r.status}`
    }
  try {
    return { rows: JSON.parse(r.stdout.trim() || '[]') }
  } catch {
    return { error: `unreadable sqlite3 output: ${r.stdout.slice(0, 80)}` }
  }
}
const statusOf = (p) => get(p, { follow: false }).status
const linked = (name) => links(H.html).some((l) => l.text === name)
let hidden = null
let pricing = null
let dbError = null
if (NO_DB) dbError = '--no-db'
else if (platform === 'wordpress') {
  const t = mariadb(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE '%\\_posts'"
  )
  const posts = t.rows?.[0]?.[0]
  if (!posts) dbError = t.error ?? 'no *_posts table'
  else {
    const q = mariadb(
      `SELECT p.ID, p.post_name, p.post_status, REPLACE(p.post_title, '\\t', ' '), COALESCE(par.post_name, '') FROM ${posts} p LEFT JOIN ${posts} par ON par.ID = p.post_parent WHERE p.post_type = 'page' AND p.post_status IN ('draft', 'pending', 'private') ORDER BY p.ID`
    )
    if (q.error) dbError = q.error
    else {
      // WordPress's own drafts (privacy policy, 404/search templates) and %-encoded slugs (other-language editions) are not
      // pages Apply hid.
      const SYSTEM =
        /^(privacy-policy|sample-page|404|search|search-results|not-found)(-[a-z]{2}(?:-[a-z]{2})?)?(-\d+)?$/
      const rows = q.rows
        .map(([id, slug, status, title, parent]) => ({
          id,
          slug,
          status,
          title,
          path: `/${parent ? `${parent}/` : ''}${slug}/`
        }))
        .filter((r) => r.slug && !SYSTEM.test(r.slug) && !r.slug.includes('%'))
      notes.$hiddenCandidates =
        rows.map((r) => `${r.title} ${r.path} (${r.status})`).join(' | ') || 'no draft/pending/private page'
      hidden =
        rows.filter((r) => !/^pricing/i.test(r.slug)).sort((a, b) => rank(a.slug) - rank(b.slug))[0] ?? null
      const pr = mariadb(
        `SELECT post_name, post_status FROM ${posts} WHERE post_type = 'page' AND (post_name LIKE 'pricing%' OR post_title LIKE 'Pricing%') ORDER BY ID LIMIT 1`
      )
      pricing = pr.rows?.[0]
        ? { path: `/${pr.rows[0][0]}/`, how: `page "${pr.rows[0][0]}" exists (${pr.rows[0][1]})` }
        : {
            path: '/pricing/',
            how: 'predicted: no page named pricing yet — a new "Pricing" page gets /pricing/'
          }
    }
  }
} else if (platform === 'joomla') {
  // The prefix from <prefix>menu_types (a plain LIKE '%_menu' also matches <prefix>modules_menu).
  const t = mariadb(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE '%\\_menu\\_types' ORDER BY LENGTH(table_name)"
  )
  const prefix = t.rows?.[0]?.[0]?.replace(/menu_types$/, '')
  const menuT = prefix ? `${prefix}menu` : null
  if (!menuT) dbError = t.error ?? 'no *_menu table'
  else {
    const q = mariadb(
      `SELECT id, alias, path, published, REPLACE(title, '\\t', ' '), language, menutype FROM ${menuT} WHERE client_id = 0 AND published = 0 AND type = 'component' AND (language = '*' OR language LIKE 'en%') ORDER BY lft`
    )
    if (q.error) dbError = q.error
    else {
      const rows = q.rows.map(([id, alias, path, _published, title, language, menutype]) => ({
        id,
        slug: alias,
        title,
        path: `${langRoot}${path}`,
        status: `unpublished, ${language}, ${menutype}`
      }))
      notes.$hiddenCandidates =
        rows.map((r) => `${r.title} ${r.path} (${r.status})`).join(' | ') || 'no unpublished site menu item'
      hidden =
        rows.filter((r) => !/^pricing/i.test(r.slug)).sort((a, b) => rank(a.slug) - rank(b.slug))[0] ?? null
      const pr = mariadb(
        `SELECT path, published FROM ${menuT} WHERE client_id = 0 AND alias LIKE 'pricing%' AND (language = '*' OR language LIKE 'en%') ORDER BY id LIMIT 1`
      )
      pricing = pr.rows?.[0]
        ? {
            path: `${langRoot}${pr.rows[0][0]}`,
            how: `menu item "${pr.rows[0][0]}" exists (published=${pr.rows[0][1]})`
          }
        : {
            path: `${langRoot}pricing`,
            how: `predicted: no menu item pricing yet — a new item gets ${langRoot}pricing`
          }
    }
  }
} else {
  const t = sqlite("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ec\\_%' ESCAPE '\\'")
  if (t.error) dbError = t.error
  else {
    const rows = []
    let pricingRow = null
    for (const { name } of t.rows) {
      const cols = new Set((sqlite(`PRAGMA table_info("${name}")`).rows ?? []).map((c) => c.name))
      if (!cols.has('slug') || !cols.has('status')) continue
      const title = cols.has('title') ? 'title' : 'slug'
      const loc = cols.has('locale') ? "AND (locale = 'en' OR locale IS NULL)" : ''
      const del = cols.has('deleted_at') ? 'AND deleted_at IS NULL' : ''
      const coll = name.replace(/^ec_/, '')
      for (const r of sqlite(
        `SELECT slug, status, ${title} AS title FROM "${name}" WHERE status != 'published' ${del} ${loc}`
      ).rows ?? [])
        rows.push({
          slug: r.slug,
          title: r.title,
          status: `${r.status}, ${coll}`,
          path: coll === 'pages' || coll === r.slug ? `/${r.slug}` : `/${coll}/${r.slug}`,
          coll
        })
      if (coll === 'pages' || coll.startsWith('pricing'))
        pricingRow ??=
          (sqlite(`SELECT slug, status FROM "${name}" WHERE slug LIKE 'pricing%' ${del} ${loc} LIMIT 1`)
            .rows ?? [])[0] ?? null
    }
    notes.$hiddenCandidates =
      rows.map((r) => `${r.title} ${r.path} (${r.status})`).join(' | ') || 'no unpublished entry'
    hidden =
      rows
        .filter((r) => !/^pricing/i.test(r.slug) && !r.slug.startsWith('kit-'))
        .sort((a, b) => rank(a.slug) - rank(b.slug))[0] ?? null
    pricing = pricingRow
      ? { path: `/${pricingRow.slug}`, how: `entry "${pricingRow.slug}" exists (${pricingRow.status})` }
      : { path: '/pricing', how: 'predicted: no entry pricing yet — a new page entry gets /pricing' }
  }
}
if (dbError)
  ['dHiddenPage', 'dHiddenPageName', 'dPricePage'].forEach((k) => fail(k, `database not read: ${dbError}`))
else {
  if (hidden) {
    const st = statusOf(hidden.path)
    const name = squash(hidden.title) || hidden.slug
    set(
      'dHiddenPage',
      hidden.path,
      `${hidden.status}; public HTTP ${st}${st === 200 ? ' — STILL SERVED' : ''}${DEMO.includes(String(hidden.slug).toLowerCase()) ? '' : ' — not a known demo page (careers/investors)'}`
    )
    set(
      'dHiddenPageName',
      name,
      linked(name) ? 'WARNING: home still links a page by this name' : 'not linked from home'
    )
  } else
    ['dHiddenPage', 'dHiddenPageName'].forEach((k) =>
      fail(k, `no hidden page in the database (${notes.$hiddenCandidates ?? 'none'})`)
    )
  if (pricing) {
    const st = statusOf(pricing.path)
    set(
      'dPricePage',
      pricing.path,
      `${pricing.how}; public HTTP ${st}${st === 200 ? ' — ALREADY SERVED (the case assumes it is not)' : ''}`
    )
  }
}

// ---- result
for (const k of NEEDED) if (keys[k] === undefined) fail(k, 'no rule in derive-d.mjs resolved it')
// Every text key must be a substring of the oracle's visible() text of the page it is judged on (has/gone compare there).
const onPage = {
  home: [
    'h1key',
    'dHeroH1',
    'sectionH2',
    'sectionH2b',
    'sectionH2bLead',
    'cta1',
    'cta2',
    'card1',
    'card2',
    'projCard1',
    'copyright',
    'thOtherBtn',
    'thAccentText',
    'thHeaderCta',
    'navItem',
    'navPrev',
    'dMenuItem',
    'dName',
    'thExceptName'
  ],
  about: ['para1', 'para2First', 'para2Last', 'thInnerAccent'],
  contact: ['thExceptBtn', 'formDescLabel']
}
const textOf = {
  home: homeText,
  about: A?.status === 200 ? visible(A.html) : null,
  contact: C?.status === 200 ? visible(C.html) : null
}
const off = []
for (const [pg, list] of Object.entries(onPage))
  for (const k of list)
    if (has(k) && textOf[pg] !== null && !textOf[pg].includes(keys[k]))
      off.push(`${k} not in the ${pg} page's visible text`)
if (off.length) notes.$notOnPage = off.join('; ')
const ordered = Object.fromEntries(NEEDED.map((k) => [k, keys[k]]))
const extra = Object.fromEntries(Object.entries(keys).filter(([k]) => !NEEDED.includes(k)))
const out = {
  label,
  platform,
  derivedAt: new Date().toISOString(),
  by: 'tc-run/d/derive-d.mjs',
  needed: NEEDED.length,
  resolved: NEEDED.filter((k) => keys[k] !== DASH).length,
  keys: { ...ordered, ...extra },
  reasons,
  notes,
  pages
}
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`)
const dashes = NEEDED.filter((k) => keys[k] === DASH)
console.error(`${label} (${platform}): ${out.resolved}/${NEEDED.length} keys → ${OUT}`)
for (const k of dashes) console.error(`  — ${k}: ${reasons[k]}`)
if (notes.$notOnPage) console.error(`  WARNING ${notes.$notOnPage}`)
