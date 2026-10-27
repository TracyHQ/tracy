// Did the change land on the page a visitor sees? Reads the live site through the stand's router
// (curl --resolve, so no DNS or proxy is involved) and checks what the case promised.
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { heroSection, lines } from './derive.mjs'
// v6 rules (SPEC §4): static readers, colours, and browser-measured styles live in v6/lib (none imports this file).
import {
  metaValues,
  jsonLd,
  typesOf,
  pathValues,
  valueHolds,
  nearestImage,
  pictures,
  headings as headingsOf,
  hreflangs,
  headOf,
  tagsNamed
} from './v6/lib/html.mjs'
import { parseColor, isColorProp } from './v6/lib/color.mjs'
import { measureStyles, styleEquals, styleNear, styleDiffers, distinctValues } from './v6/lib/style.mjs'
// v6 image track (`picture`): which picture a check means and what file it shows.
import {
  locatePicture,
  locatorOf,
  locKeyOf,
  describeLoc,
  allPictures,
  fixtureIdentity,
  fetchPictureFile,
  srcKey
} from './v6/lib/picture.mjs'

const PORT = 51710

const imgCount = (html) => {
  const main = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html.replace(/^[\s\S]*?<body[^>]*>/i, '')
  return (main.match(/<img\b/gi) ?? []).length
}
const heroImgOf = (html) => /<img\b[^>]*\bsrc="([^"]+)"/i.exec(heroSection(html))?.[1] ?? null
const pathOf = (href) => (href ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/'
/** %-escapes undone where they form valid UTF-8 (an ASCII path is returned as it is). */
const undoPercent = (p) => {
  try {
    return decodeURI(p)
  } catch {
    return p
  }
}

// ---- v5: pictures the customer attached (bench/fixtures, made by make-fixtures.mjs).
const FIXTURES = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./fixtures/manifest.json', import.meta.url), 'utf8'))
  } catch {
    return {}
  }
})()
/**
 * The part of a page a v5 rule reads (`in`, or `imgFrom.where`): the hero, the LAST <footer> (the page
 * footer, not a card's), <main>, the part above <main> ("top": header bars and the main menu, however a
 * theme splits them into several <header>s), or the whole page.
 */
export function regionOf(html, where) {
  if (!where || where === 'page') return html
  if (where === 'hero') return heroSection(html)
  // D farm (05/10/2026): a theme with no <main> (Joomla tracy-business j6) used to fall back to the whole page for "main"
  // and to the first <header> for "top", which cut the top bar above it off: both made checks that could never pass.
  if (where === 'main') {
    const own = /<main\b[\s\S]*?<\/main>/i.exec(html)?.[0]
    if (own) return own
    const head = /<\/header>/i.exec(html)
    const foot = html.search(/<footer\b(?![\s\S]*<footer\b)/i)
    return html.slice(head ? head.index + head[0].length : 0, foot > 0 ? foot : html.length)
  }
  if (where === 'footer') return [...html.matchAll(/<footer\b[\s\S]*?<\/footer>/gi)].at(-1)?.[0] ?? ''
  if (where === 'top') {
    const at = html.search(/<main\b/i)
    if (at > 0) return html.slice(0, at)
    const head = /<\/header>/i.exec(html)
    return head ? html.slice(0, head.index + head[0].length) : ''
  }
  throw new Error(`oracle: unknown region "${where}"`)
}
/** Every picture a region shows: <img src>, the first srcset entry, and CSS background urls. */
export function imgSrcs(html) {
  const out = new Set()
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = /\bsrc="([^"]+)"/i.exec(m[0])?.[1]
    if (src && !src.startsWith('data:')) out.add(decode(src))
    const set = /\bsrcset="([^"]+)"/i.exec(m[0])?.[1]
    if (set) out.add(decode(set.split(',')[0].trim().split(/\s+/)[0]))
  }
  for (const m of html.matchAll(
    /background(?:-image)?\s*:\s*url\(\s*(?:&quot;|['"])?([^'")&]+)(?:&quot;|['"])?\s*\)/gi
  ))
    out.add(decode(m[1]))
  return [...out].map(pathOf)
}
/** Pixel box of an image file, read by macOS `sips` (the bench runs on the Mac). */
function boxOf(file) {
  try {
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' })
    return {
      width: Number(/pixelWidth: (\d+)/.exec(out)?.[1]),
      height: Number(/pixelHeight: (\d+)/.exec(out)?.[1])
    }
  } catch {
    return null
  }
}
/**
 * Is the picture at `src` the customer's fixture? Same bytes; or a file name carrying the fixture's stem
 * (WordPress keeps the name and adds -1024x576); or, for a CMS that re-encodes and renames (EmDash's
 * /_emdash/api/media/file/<id>), the same aspect ratio. Callers pass only pictures that were NOT on the
 * page before the case, so an old picture of the same shape can never match.
 */
function fixtureMatch(label, src, name) {
  const want = FIXTURES[name]
  if (!want) return { ok: false, how: `no fixture ${name} in fixtures/manifest.json` }
  const stem = name.replace(/\.[a-z]+$/i, '').toLowerCase()
  if (
    decodeURIComponent(src.split('/').pop() ?? '')
      .toLowerCase()
      .includes(stem)
  )
    return { ok: true, how: 'name' }
  const host = `${label}.tracy.test`
  const file = `/tmp/bench-img-${process.pid}-${createHash('sha256').update(src).digest('hex').slice(0, 10)}`
  try {
    execFileSync('curl', [
      '-s',
      '-L',
      '-m',
      '30',
      '--noproxy',
      '*',
      '--resolve',
      `${host}:${PORT}:127.0.0.1`,
      '-o',
      file,
      src.startsWith('http') ? src : `http://${host}:${PORT}${src}`
    ])
    const bytes = readFileSync(file)
    if (createHash('sha256').update(bytes).digest('hex') === want.sha256) return { ok: true, how: 'bytes' }
    const got = boxOf(file)
    if (got?.width && Math.abs(got.width / got.height - want.width / want.height) < 0.015)
      return { ok: true, how: `shape ${got.width}x${got.height}` }
    return { ok: false, how: got?.width ? `other picture ${got.width}x${got.height}` : 'not an image' }
  } catch {
    return { ok: false, how: 'fetch failed' }
  }
}
const h1Of = (html) =>
  decode((/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/** Every {key} a case names, so a site without that element answers n/a instead of a false FAIL. */
export function missingKeys(value, site) {
  const out = new Set()
  const walk = (v) => {
    // Braces matter: without them the `else` below bound to the inner `if`, so arrays and objects were
    // never walked and every case ran even on a site missing its keys (no v3 run ever reported n/a).
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\{(\w+)\}/g))
        if (
          site[m[1]] === null ||
          site[m[1]] === undefined ||
          (Array.isArray(site[m[1]]) && site[m[1]].length === 0)
        )
          out.add(m[1])
    } else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(value)
  return [...out]
}

export function fetchPage(label, path) {
  const host = `${label}.tracy.test`
  const url = path.startsWith('http') ? path : `http://${host}:${PORT}${path}`
  try {
    const out = execFileSync(
      'curl',
      [
        '-s',
        '-L',
        '-m',
        '30',
        '--noproxy',
        '*',
        '--resolve',
        `${host}:${PORT}:127.0.0.1`,
        '-w',
        '\n%{http_code}',
        url
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
    const cut = out.lastIndexOf('\n')
    return { status: Number(out.slice(cut + 1)), html: out.slice(0, cut) }
  } catch (error) {
    return { status: 0, html: '', error: String(error.message).slice(0, 200) }
  }
}
const fetchLive = fetchPage

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, ' ')

/** Visible body text, one space between everything, head and scripts left out. */
export function visible(html) {
  const body = html.replace(/^[\s\S]*?<body[^>]*>/i, '')
  return decode(
    body.replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function links(html) {
  const found = []
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    found.push({
      href: decode(m[1]),
      text: decode(m[2].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
    })
  }
  return found
}

export const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)

const VIET = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹáàãéèíìóòõúùýđ]/i

export function fill(value, site) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, site)]))
  if (typeof value !== 'string') return value
  const whole = /^\{(\w+)\}$/.exec(value)
  if (whole && Array.isArray(site[whole[1]])) return site[whole[1]]
  return value.replace(/\{(\w+)\}/g, (_, k) => site[k] ?? `{${k}}`)
}

/**
 * @param {object} oracle - the case's oracle block
 * @param {object} site - sites[label] from cases.json, plus `label`
 * @param {{answer?: string, baseline?: Record<string,string>}} ctx
 * @returns {{pass: boolean, checks: {what: string, ok: boolean}[]}}
 */
/**
 * A label and its value as a page may lay them out: "Zalo: 0909 123 456" in the request, "Zalo" and
 * "0909 123 456" in two cells on the page (A1 F2). Colons, middle dots and bars between words drop,
 * whitespace collapses. Reported beside the strict verdict (`passLoose`), never instead of it: B1 was
 * judged strictly and its pages were not kept.
 */
const loose = (t) =>
  String(t)
    .replace(/\s*[:：·|]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const REGIONS = new Set(['hero', 'footer', 'main', 'top', 'page'])
/**
 * The page an oracle key names. v5 adds two shapes to v3/v4's site keys and paths:
 *   "<page>@<region>"            — only that part of the page (regionOf): "home@footer", "contact@main";
 *   "follow:<from>:<link text>"  — the page a link on <from> opens, found by its exact text (else the first
 *                                  link starting with it): a post the agent just created has no key.
 */
export function resolvePage(site, name, fetchPage = fetchLive) {
  const at = name.lastIndexOf('@')
  const region = at > 0 && REGIONS.has(name.slice(at + 1)) ? name.slice(at + 1) : null
  const base = region ? name.slice(0, at) : name
  let got
  // v6: `path` (the address fetched, for a browser to load the same page) and `full` (the whole page when a
  // region cuts `html`: <head> metadata and JSON-LD live outside every region). v3–v5 callers read neither.
  let path = null
  if (base.startsWith('follow:')) {
    const [, from, ...rest] = base.split(':')
    const text = fill(rest.join(':'), site)
    const src = fetchPage(site.label, site[from] ?? from)
    const all = links(src.html ?? '')
    const link = all.find((l) => l.text === text) ?? all.find((l) => l.text.startsWith(text))
    path = link ? link.href.replace(/^https?:\/\/[^/]+/, '') : null
    got = link ? fetchPage(site.label, path) : { status: 0, html: '', error: `no link "${text}" on ${from}` }
  } else {
    path = base === 'article' ? site.news1Href : (site[base] ?? base)
    got = fetchPage(site.label, path)
  }
  return region
    ? { ...got, html: regionOf(got.html ?? '', region), path, full: got.html ?? '' }
    : { ...got, path, full: got.html ?? '' }
}

export function judge(oracle, site, ctx = {}) {
  const checks = []
  const add = (what, ok, extra = {}) => checks.push({ what, ok: Boolean(ok), ...extra })
  const pages = {}
  // ctx.fetchPage lets an offline check (v4/baseline-check.mjs) judge saved pages with this same code.
  const fetchPage = ctx.fetchPage ?? fetchLive
  const page = (name) => {
    if (!pages[name]) {
      const got = resolvePage(site, name, fetchPage)
      pages[name] = { ...got, text: visible(got.html), links: links(got.html) }
      add(`${name} HTTP ${got.status}${got.error ? ` (${got.error})` : ''}`, got.status === 200)
    }
    return pages[name]
  }
  for (const [name, rule] of Object.entries(oracle)) {
    // v5: the first of several oracles that holds (a featured picture may show on the listing OR the post).
    if (name === 'anyOf') {
      const subs = rule.map((o) => judge(o, site, ctx))
      const why = subs
        .map(
          (s) =>
            s.checks
              .filter((c) => !c.ok)
              .map((c) => c.what)
              .join(', ') || 'ok'
        )
        .join(' | ')
      add(
        `any of ${subs.length}: ${why.slice(0, 400)}`,
        subs.some((s) => s.pass)
      )
      continue
    }
    if (name === 'answerHas') {
      for (const s of rule.map((r) => fill(r, site)))
        add(`answer mentions "${s}"`, (ctx.answer ?? '').replace(/\s+/g, ' ').includes(s))
      continue
    }
    if (name === 'asks') {
      add('agent asked the customer instead of guessing', Boolean(ctx.asked))
      continue
    }
    if (name === 'unchanged') {
      for (const p of rule) {
        const now = digest(page(p).text)
        add(`${p} unchanged`, ctx.baseline?.[p] === undefined || ctx.baseline[p] === now)
      }
      continue
    }
    if (name === 'follow') {
      const home = page('home')
      const link = home.links.find((l) => l.text === rule.link)
      add(`link "${rule.link}" exists`, link)
      if (link) {
        const got = fetchPage(site.label, link.href.replace(/^https?:\/\/[^/]+/, ''))
        const text = visible(got.html)
        for (const s of rule.has)
          add(`"${rule.link}" page has "${s}"`, got.status === 200 && text.includes(s))
      }
      continue
    }
    // v6: raw HTTP answers (robots.txt, sitemap, redirects) — status/location/body/header of one request.
    if (name === 'http') {
      for (const want of [].concat(rule).map((r) => fillDeep(r, site))) judgeHttp(want, site, ctx, add)
      continue
    }
    // v6 `in: top|main|footer|hero` = the same page cut to that region, exactly as "<page>@<region>" does.
    const p = page(
      rule && typeof rule === 'object' && REGIONS.has(rule.in) && !regionIn(name)
        ? `${name}@${rule.in}`
        : name
    )
    for (const s of (rule.has ?? []).map((r) => fill(r, site))) {
      const ok = p.text.includes(s)
      add(`${name} has "${s}"`, ok, ok ? {} : { loose: loose(p.text).includes(loose(s)) })
    }
    for (const s of (rule.gone ?? []).map((r) => fill(r, site)))
      add(`${name} no longer has "${s}"`, !p.text.includes(s))
    for (const s of (rule.linkText ?? []).map((r) => fill(r, site)))
      add(
        `${name} has a link "${s}"`,
        p.links.some((l) => l.text === s)
      )
    for (const s of rule.fewerLinks ?? []) {
      const now = p.links.filter((l) => l.text === s).length
      const before = ctx.baseline?.[`links:${s}`]
      add(`${name} links "${s}" ${before} → ${now}`, before === undefined || now < before)
    }
    if (rule.goneAtLeast) {
      const of = fill(rule.goneAtLeast.of, site)
      const gone = of.filter((s) => !p.text.includes(s)).length
      add(
        `${name}: ${gone}/${of.length} old lines gone (need ${rule.goneAtLeast.n})`,
        gone >= rule.goneAtLeast.n
      )
    }
    if (rule.heroImgChanged) {
      const now = heroImgOf(p.html)
      add(`hero image changed (${site.heroImg} → ${now})`, now !== null && now !== site.heroImg)
    }
    if (rule.heroImgGone) add('hero has no image', heroImgOf(p.html) === null)
    if (rule.heroImgSame) add('hero image back to the original', heroImgOf(p.html) === site.heroImg)
    if (rule.moreImages) {
      const now = imgCount(p.html)
      const before = ctx.baseline?.[`imgs:${name}`]
      add(`${name} images ${before} → ${now}`, before !== undefined && now > before)
    }
    for (const h of rule.htmlHas ?? []) add(`${name} html has ${h}`, p.html.includes(h))
    for (const s2 of (rule.fewerLines ?? []).map((r) => fill(r, site))) {
      const now = lines(p.html).filter((l) => l === s2).length
      const before = ctx.baseline?.[`lines:${name}:${s2}`]
      add(`${name} lines "${s2}" ${before} → ${now}`, before !== undefined && now < before)
    }
    if (rule.orderBefore) {
      // Two entries: a before b (v3). More entries (v4): a chain, each one before the next, so a case can
      // pin a new block BETWEEN two existing ones instead of merely somewhere above one of them.
      const seq = rule.orderBefore.map((r) => fill(r, site))
      const L = lines(p.html)
      const at = seq.map((s) => L.findIndex((l) => l === s || l.startsWith(s)))
      for (let k = 0; k + 1 < seq.length; k++)
        add(
          `"${seq[k]}" (${at[k]}) comes before "${seq[k + 1]}" (${at[k + 1]})`,
          at[k] >= 0 && at[k + 1] >= 0 && at[k] < at[k + 1]
        )
    }
    if (rule.linkHref) {
      const want = fill(rule.linkHref, site)
      const hit = p.links.filter((l) => l.text === want.text)
      // v6: both sides percent-decoded (WordPress serves Cyrillic slugs encoded; keys hold them decoded).
      add(
        `link "${want.text}" → ${want.endsWith}`,
        hit.some((l) => undoPercent(pathOf(l.href)).endsWith(undoPercent(pathOf(want.endsWith))))
      )
    }
    // ---- v5 rules
    for (const s of (rule.noLinkText ?? []).map((r) => fill(r, site)))
      add(`${name} has no link "${s}"`, !p.links.some((l) => l.text === s))
    // The h1 REWRITTEN shorter: present, at most n words, not the old one, not Vietnamese.
    if (rule.h1MaxWords) {
      const text = h1Of(p.html)
      const n = text ? text.split(' ').length : 0
      add(
        `${name} h1 rewritten in ≤${rule.h1MaxWords} words: "${text.slice(0, 60)}" (${n})`,
        n > 0 && n <= rule.h1MaxWords && text !== site.h1key && !VIET.test(text)
      )
    }
    // The customer's own picture (a fixture) is on the page — a picture that was not there before the case.
    for (const want of [].concat(rule.imgFrom ?? [])) {
      const where = want.where ?? 'page'
      const before = new Set(ctx.baseline?.[`srcs:${name}:${where}`] ?? [])
      const hits = imgSrcs(regionOf(p.html, where))
        .filter((s) => !before.has(s))
        .map((s) => ({ s, ...fixtureMatch(site.label, s, want.fixture) }))
      const hit = hits.find((h) => h.ok)
      const saw =
        hits
          .map((h) => `${h.s} ${h.how}`)
          .join('; ')
          .slice(0, 240) || 'none'
      add(
        `${name} ${where} shows the customer's ${want.fixture}${hit ? ` (${hit.how}: ${hit.s})` : ` — new pictures: ${saw}`}`,
        hit
      )
    }
    if (rule.h1Vietnamese) {
      const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(p.html)?.[1] ?? ''
      const text = decode(h1.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
      add(`h1 is Vietnamese: "${text.slice(0, 60)}"`, VIET.test(text) && !text.includes(site.h1key))
    }
    // v4: the Russian page's h1 was rewritten IN Russian — not deleted, not left in English.
    if (rule.h1Russian) {
      const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(p.html)?.[1] ?? ''
      const text = decode(h1.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
      // Mostly Cyrillic letters: a brand name in Latin may stay, an English sentence may not.
      const cyr = (text.match(/[Ѐ-ӿ]/g) ?? []).length
      const lat = (text.match(/[A-Za-z]/g) ?? []).length
      add(`${name} h1 is Russian: "${text.slice(0, 60)}"`, cyr >= 3 && cyr > 2 * lat)
    }
    // v4: the h1 was REWRITTEN in English — present, at least three words, not the old one, not Vietnamese.
    // `gone` alone passes when the headline is simply deleted.
    if (rule.h1Rewritten) {
      const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(p.html)?.[1] ?? ''
      const text = decode(h1.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
      add(
        `${name} h1 rewritten in English: "${text.slice(0, 60)}"`,
        text.split(' ').length >= 3 && text !== site.h1key && !VIET.test(text)
      )
    }
    // ---- v6 rules (SPEC §4 + the case designers'). Each runs only when the case names it: v3–v5 verdicts unchanged.
    if (V6_RULES.some((k) => rule[k] !== undefined))
      judgeV6Page(name, fillDeep(rule, site), p, site, ctx, add)
    // v6 image track: pictures named as a visitor names them (the hero, near a text, between two texts, any).
    if (rule.picture !== undefined) judgePictures(name, fillDeep(rule.picture, site), p, site, ctx, add, page)
    // FAIL CLOSED for v6 (ctx.strict): a rule this judge does not know is a failing check, never a silent pass.
    if (ctx.strict)
      for (const k of Object.keys(rule)) if (!PAGE_RULES.has(k)) add(`${name} unknown rule ${k}`, false)
  }
  return {
    pass: checks.every((c) => c.ok),
    passLoose: checks.every((c) => c.ok || c.loose === true),
    checks
  }
}

// ───────────────────────────── v6 (SPEC §4) ─────────────────────────────
// Per page: style, styleSame (browser), meta, jsonLd, imgAlt, imgAltNear, headings, hreflang, form, headHas
// (served HTML); top level: http. `in: <region>` on a page block = "<page>@<region>".

const V6_RULES = [
  'style',
  'styleSame',
  'visible',
  'hidden',
  'meta',
  'jsonLd',
  'imgAlt',
  'imgAltNear',
  'headings',
  'hreflang',
  'form',
  'headHas',
  'htmlLacks',
  'telLink',
  'iframes',
  'words',
  'list'
]
/** Every rule a page block may hold (v3–v6). With ctx.strict any other key fails the case. */
export const PAGE_RULES = new Set([
  'has',
  'gone',
  'linkText',
  'noLinkText',
  'linkHref',
  'orderBefore',
  'htmlHas',
  'fewerLines',
  'fewerLinks',
  'goneAtLeast',
  'heroImgChanged',
  'heroImgGone',
  'heroImgSame',
  'moreImages',
  'imgFrom',
  'h1MaxWords',
  'h1Vietnamese',
  'h1Russian',
  'h1Rewritten',
  'in',
  ...V6_RULES,
  // v6 image track (v6/cases-image-*.json)
  'picture'
])
const LETTERS = { cyr: /[Ѐ-ӿ]/g, lat: /[A-Za-z]/g }
/** `lang` of a `words` rule: "en" = no Vietnamese letter and Latin ≥ Cyrillic (> 0); "ru" = the h1Russian test. */
export function langHolds(text, lang) {
  const cyr = (String(text).match(LETTERS.cyr) ?? []).length
  const lat = (String(text).match(LETTERS.lat) ?? []).length
  if (lang === 'ru') return cyr >= 3 && cyr > 2 * lat
  if (lang === 'en') return !VIET.test(text) && lat > 0 && lat >= cyr
  return true
}
/** Words that hold a letter or a digit ("—" and "·" do not count). */
export const wordCount = (text) =>
  squash(text)
    .split(' ')
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length
/** `tel:` links whose text holds `text` and whose number ends in the last 10 digits of it (developer L2-01). */
export function telLinks(html, text) {
  const want = squash(text)
  const digits = (x) => String(x).replace(/\D/g, '')
  const last10 = digits(want).slice(-10)
  return links(html).filter(
    (l) =>
      /^tel:/i.test(l.href.trim()) &&
      squash(l.text).includes(want) &&
      last10 !== '' &&
      digits(l.href).endsWith(last10)
  ).length
}
/** A URL or path as compared by `http.location`: scheme and host dropped, percent-decoded, no trailing slash. */
const pathKey = (u) => {
  let p = String(u ?? '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
  try {
    p = decodeURI(p)
  } catch {}
  return p.replace(/\/+$/, '') || '/'
}
/** Page rules measured in Chromium (judgeAsync): the live page, or its served HTML as markup (words, list). */
const BROWSER_RULES = ['style', 'styleSame', 'visible', 'hidden', 'form', 'words', 'list']
/** `visible` / `hidden` entries: "text" or {text, viewport}. */
const seenEntries = (list) => [].concat(list ?? []).map((e) => (typeof e === 'string' ? { text: e } : e))
/** The region a page name carries ("home@footer" → "footer"), else null. */
const regionIn = (name) => {
  const at = String(name).lastIndexOf('@')
  return at > 0 && REGIONS.has(name.slice(at + 1)) ? name.slice(at + 1) : null
}
const clip = (s, n = 70) => {
  const t = String(s ?? '')
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const srcName = (t) =>
  clip(
    String((t && t.attrs ? t.attrs.get('src') : t) ?? '?')
      .split('/')
      .pop(),
    40
  )
const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** fill() through arrays and objects: every string anywhere gets its {placeholders}. */
export function fillDeep(value, site) {
  if (Array.isArray(value)) return value.map((v) => fillDeep(v, site))
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillDeep(v, site)]))
  return fill(value, site)
}

/** One HTTP request as curl makes it (no redirect following unless asked): status, last headers, body. */
export function fetchRaw(label, path, { follow = true } = {}) {
  const host = `${label}.tracy.test`
  const p = String(path ?? '/')
  const url = /^https?:\/\//.test(p) ? p : `http://${host}:${PORT}${p.startsWith('/') ? '' : '/'}${p}`
  const dir = mkdtempSync(`${tmpdir()}/bench-http-`)
  const read = (f) => {
    try {
      return readFileSync(f, 'utf8')
    } catch {
      return ''
    }
  }
  try {
    const args = [
      '-s',
      '-m',
      '30',
      '--noproxy',
      '*',
      '--resolve',
      `${host}:${PORT}:127.0.0.1`,
      '-D',
      `${dir}/h`,
      '-o',
      `${dir}/b`,
      '-w',
      '%{http_code}'
    ]
    const code = execFileSync('curl', [...(follow ? ['-L'] : []), ...args, url], {
      encoding: 'utf8',
      timeout: 40000
    })
    const blocks = read(`${dir}/h`)
      .split(/\r?\n\r?\n/)
      .filter((b) => b.trim().startsWith('HTTP/'))
    const headers = {}
    for (const line of (blocks.at(-1) ?? '').trim().split(/\r?\n/).slice(1)) {
      const i = line.indexOf(':')
      if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
    }
    return { status: Number(code), headers, body: read(`${dir}/b`) }
  } catch (error) {
    return { status: 0, headers: {}, body: '', error: String(error.message).slice(0, 200) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** `http: [{path, status?, location?, bodyHas?, bodyLacks?, headerHas?}]` — redirects are followed only when
 *  neither `status` nor `location` is asserted; without `status` the final answer must be 2xx. */
function judgeHttp(w, site, ctx, add) {
  const path = w.path ?? '/'
  const follow = w.status === undefined && w.location === undefined
  const got = (ctx.fetchRaw ?? fetchRaw)(site.label, path, { follow })
  const label = `HTTP ${path}${follow ? '' : ' (no redirect)'}`
  if (got.error) return add(`${label}: ${got.error}`, false)
  if (w.status !== undefined)
    add(
      `${label} status ${got.status} (want ${[].concat(w.status).join('|')})`,
      [].concat(w.status).map(Number).includes(got.status)
    )
  else add(`${label} answers ${got.status}`, got.status >= 200 && got.status < 300)
  if (w.location !== undefined) {
    const loc = got.headers.location ?? null
    add(
      `${label} Location ${loc ?? 'none'} (want ${w.location})`,
      loc !== null && pathKey(loc) === pathKey(w.location)
    )
  }
  const bodyText = /<[a-z!]/i.test(got.body) ? visible(got.body) : got.body
  for (const s of [].concat(w.bodyHas ?? []))
    add(`${label} body has "${clip(s, 60)}"`, got.body.includes(s) || bodyText.includes(s))
  // 29/09: lacks in the raw body AND the visible text (a title split by markup or entities is not in the raw bytes, and `bodyHas` reads both).
  for (const s of [].concat(w.bodyLacks ?? []))
    add(`${label} body lacks "${clip(s, 60)}"`, !got.body.includes(s) && !bodyText.includes(s))
  for (const [h, s] of Object.entries(w.headerHas ?? {})) {
    const v = got.headers[h.toLowerCase()] ?? null
    add(
      `${label} header ${h} has "${s}": ${v ?? 'none'}`,
      v !== null && v.toLowerCase().includes(String(s).toLowerCase())
    )
  }
}

const META_PLAIN = new Set(['title', 'description', 'canonical', 'robots'])
/**
 * `meta: {<field>: {has, lacks, equals, minLen, maxLen, endsWith, changed, present, single} | "<text>"}` — a bare
 * string is `has`. `has`/`lacks` ignore case; lengths count characters of the first value; `changed: true`
 * compares with the value read before the case (baselineOf), `changed: "<text>"` with that text.
 */
function judgeMeta(name, field, want, full, ctx, add) {
  const vals = metaValues(full, field)
  const v = vals[0] ?? null
  const w = want && typeof want === 'object' && !Array.isArray(want) ? want : { has: want }
  const label = `${name} ${META_PLAIN.has(String(field).toLowerCase()) ? field : `meta ${field}`}`
  const shown = v === null ? 'none' : `"${clip(v, 70)}"`
  const len = v === null ? 0 : [...v].length
  let judged = false
  if (w.present !== undefined) {
    judged = true
    add(`${label} ${w.present ? 'present' : 'absent'} (${shown})`, w.present ? v !== null : v === null)
  }
  for (const s of [].concat(w.has ?? [])) {
    judged = true
    add(
      `${label} has "${clip(s, 50)}": ${shown}`,
      v !== null && v.toLowerCase().includes(String(s).toLowerCase())
    )
  }
  for (const s of [].concat(w.lacks ?? [])) {
    judged = true
    add(
      `${label} lacks "${clip(s, 50)}": ${shown}`,
      v === null || !v.toLowerCase().includes(String(s).toLowerCase())
    )
  }
  if (w.equals !== undefined) {
    judged = true
    add(`${label} = "${clip(w.equals, 50)}": ${shown}`, v !== null && squash(v) === squash(w.equals))
  }
  if (w.minLen !== undefined) {
    judged = true
    add(`${label} length ${len} ≥ ${w.minLen}: ${shown}`, v !== null && len >= w.minLen)
  }
  if (w.maxLen !== undefined) {
    judged = true
    add(`${label} length ${len} ≤ ${w.maxLen}: ${shown}`, v !== null && len <= w.maxLen)
  }
  if (w.endsWith !== undefined) {
    judged = true
    add(
      `${label} ends with ${w.endsWith}: ${shown}`,
      v !== null && (v.endsWith(w.endsWith) || pathOf(v).endsWith(pathOf(w.endsWith)))
    )
  }
  if (w.changed !== undefined && w.changed !== false) {
    judged = true
    const key = `meta:${name}:${field}`
    const before = typeof w.changed === 'string' ? w.changed : ctx.baseline?.[key]
    add(
      `${label} changed: ${before === undefined ? 'no baseline' : before === null ? 'none' : `"${clip(before, 50)}"`} → ${shown}`,
      v !== null && before !== undefined && squash(v) !== squash(before ?? '')
    )
  }
  if (w.single) {
    judged = true
    add(`${label} given once (${vals.length})`, vals.length === 1)
  }
  if (!judged) add(`${label} present (${shown})`, v !== null)
}

/** Keys that tie a style measurement to its rule (the same string in styleWants and in judge). */
const styleKeyOf = (name, rule, e) =>
  `${name}|${JSON.stringify([e.text ?? null, e.selector ?? null, e.nth ?? 0, e.within ?? regionIn(name) ?? rule.in ?? null, e.prop, e.viewport ?? 'desktop'])}`
const sameKeyOf = (name, rule, e) =>
  `${name}|same|${JSON.stringify([[].concat(e.selectors ?? []), e.within ?? regionIn(name) ?? rule.in ?? null, e.prop, e.viewport ?? 'desktop'])}`
const seenKeyOf = (name, rule, e) =>
  `${name}|seen|${JSON.stringify([e.text, regionIn(name) ?? rule.in ?? null, e.viewport ?? 'desktop'])}`
const formKeyOf = (name, rule) => `${name}|form|${JSON.stringify([regionIn(name) ?? rule.in ?? null])}`
const staticKeyOf = (name, rule, kind, e, i) => `${name}|${kind}|${i}|${JSON.stringify([e, rule.in ?? null])}`
const visKeyOf = (name, rule, e) =>
  `${name}|vis|${JSON.stringify([e.text ?? null, e.selector ?? null, e.nth ?? null, e.within ?? regionIn(name) ?? rule.in ?? null, e.viewport ?? 'desktop'])}`
/** A `style` entry that asks only whether its element is shown: {text|selector, visible: true|false}, no prop. */
const isVisEntry = (e) => e && e.visible !== undefined && e.prop === undefined

/** Every browser measurement an oracle needs (anyOf included), filled with the site's keys. */
export function styleWants(oracle, site) {
  const out = []
  const walk = (o) => {
    for (const [name, rule] of Object.entries(o ?? {})) {
      if (name === 'anyOf') {
        ;[].concat(rule ?? []).forEach(walk)
        continue
      }
      if (
        NOT_PAGES.has(name) ||
        !rule ||
        typeof rule !== 'object' ||
        Array.isArray(rule) ||
        !BROWSER_RULES.some((k) => rule[k] !== undefined)
      )
        continue
      const r = fillDeep(rule, site)
      for (const e of [].concat(r.style ?? [])) {
        if (isVisEntry(e))
          out.push({
            name,
            key: visKeyOf(name, r, e),
            viewport: e.viewport,
            req: {
              kind: 'vis',
              text: e.text,
              selector: e.selector,
              nth: e.nth,
              within: e.within ?? regionIn(name) ?? r.in
            }
          })
        else
          out.push({
            name,
            key: styleKeyOf(name, r, e),
            viewport: e.viewport,
            needsBaseline: e.changed === true,
            req: {
              kind: 'one',
              text: e.text,
              selector: e.selector,
              nth: e.nth,
              within: e.within ?? regionIn(name) ?? r.in,
              prop: e.prop
            }
          })
      }
      for (const e of [].concat(r.styleSame ?? [])) {
        out.push({
          name,
          key: sameKeyOf(name, r, e),
          viewport: e.viewport,
          req: {
            kind: 'same',
            selectors: [].concat(e.selectors ?? []),
            within: e.within ?? regionIn(name) ?? r.in,
            prop: e.prop
          }
        })
      }
      for (const e of seenEntries([...[].concat(r.visible ?? []), ...[].concat(r.hidden ?? [])])) {
        out.push({
          name,
          key: seenKeyOf(name, r, e),
          viewport: e.viewport,
          req: { kind: 'seen', text: e.text, within: regionIn(name) ?? r.in }
        })
      }
      if (r.form)
        out.push({ name, key: formKeyOf(name, r), req: { kind: 'form', within: regionIn(name) ?? r.in } })
      // words / list read the served HTML of the page as judged (its region included): static wants.
      const pn = REGIONS.has(r.in) && !regionIn(name) ? `${name}@${r.in}` : name
      for (const [i, e] of [].concat(r.words ?? []).entries())
        out.push({
          name: pn,
          static: true,
          key: staticKeyOf(name, r, 'words', e, i),
          req: { kind: 'words', text: e.text, selector: e.selector, nth: e.nth }
        })
      for (const [i, e] of [].concat(r.list ?? []).entries())
        out.push({
          name: pn,
          static: true,
          key: staticKeyOf(name, r, 'list', e, i),
          req: { kind: 'list', has: e.has }
        })
    }
  }
  walk(oracle)
  return out
}

/** Measure wants on the site's live pages (or ctx.htmlOf(page) markup, for offline tests) — one browser. */
async function measureFor(site, wants, ctx = {}) {
  const fetchPage = ctx.fetchPage ?? fetchLive
  const paths = new Map()
  const uniq = [...new Map(wants.map((w) => [w.key, w])).values()]
  const served = new Map()
  const list = uniq.map((w) => {
    const base = regionIn(w.name) ? w.name.slice(0, w.name.lastIndexOf('@')) : w.name
    if (w.static) {
      // The served HTML as the oracle reads it (region cut), loaded as markup with scripts off.
      if (!served.has(w.name))
        served.set(
          w.name,
          ctx.htmlOf
            ? regionOf(ctx.htmlOf(base) ?? '', regionIn(w.name) ?? 'page')
            : (resolvePage(site, w.name, fetchPage).html ?? '')
        )
      return { ...w, html: served.get(w.name), htmlId: w.name }
    }
    if (ctx.htmlOf) return { ...w, html: ctx.htmlOf(base) ?? '', htmlId: base }
    if (!paths.has(base)) paths.set(base, resolvePage(site, base, fetchPage).path ?? null)
    const path = paths.get(base)
    return {
      ...w,
      url: path ? (/^https?:\/\//.test(path) ? path : `http://${site.label}.tracy.test:${PORT}${path}`) : null
    }
  })
  return measureStyles(list, { browser: ctx.browser })
}

/**
 * judge() for any oracle, v6 style rules included: measures what the browser must first (ctx.browser is
 * reused when given, else one Chromium for this evaluation), then judges synchronously. An oracle without
 * style rules is exactly judge().
 */
export async function judgeAsync(oracle, site, ctx = {}) {
  const wants = styleWants(oracle, site)
  if (!wants.length) return judge(oracle, site, ctx)
  const styles = await measureFor(site, wants, ctx)
  return judge(oracle, site, { ...ctx, styles: { ...ctx.styles, ...styles } })
}

/** baselineOf() plus, for every `style … changed: true`, the value before the case (`style:<key>`). */
export async function baselineAsync(site, oracles = [], opts = {}) {
  const out = baselineOf(site, oracles, opts)
  const wants = oracles.flatMap((o) => styleWants(o, site)).filter((w) => w.needsBaseline)
  if (wants.length) {
    const got = await measureFor(site, wants, opts)
    for (const w of wants) out[`style:${w.key}`] = got[w.key]
  }
  return out
}

/** Every v6 rule of one page block (already filled). `p` = the page as judge() read it (html = its region). */
function judgeV6Page(name, rule, p, site, ctx, add) {
  const full = p.full ?? p.html ?? ''
  const html = p.html ?? ''
  for (const e of [].concat(rule.style ?? []).filter(isVisEntry)) {
    const m = ctx.styles?.[visKeyOf(name, rule, e)]
    const label = `${name} ${e.selector ? `"${clip(e.selector, 40)}"${e.nth !== undefined ? ` #${e.nth}` : ''}` : `"${clip(e.text, 40)}"`} ${e.visible ? 'shown' : 'not shown'}${e.viewport === 'mobile' ? ' (mobile)' : ''}`
    if (!m) add(`${label}: not measured (browser rules are judged by judgeAsync)`, false)
    else if (!m.ok) add(`${label}: ${m.error}`, false)
    else
      add(
        `${label}: ${m.visible} of ${m.matches} match(es) shown${m.hiddenBy ? ` (hidden by ${m.hiddenBy})` : ''}`,
        e.visible ? m.visible > 0 : m.visible === 0
      )
  }
  for (const e of [].concat(rule.style ?? []).filter((x) => !isVisEntry(x))) {
    const key = styleKeyOf(name, rule, e)
    const label = `${name} ${e.selector ? `"${clip(e.selector, 40)}"${e.nth ? ` #${e.nth}` : ''}` : `"${clip(e.text, 40)}"`} ${e.prop}${e.viewport === 'mobile' ? ' (mobile)' : ''}`
    const m = ctx.styles?.[key]
    if (!m) {
      add(`${label}: not measured (style rules are judged by judgeAsync)`, false)
      continue
    }
    if (!m.ok) {
      add(`${label}: ${m.error}`, false)
      continue
    }
    const shownAs = `${m.value}${m.via ? ` via ${m.via}` : ''}${m.hidden ? ' (hidden)' : ''}`
    if (e.equals !== undefined)
      add(`${label} = ${shownAs} (want ${e.equals})`, styleEquals(e.prop, m, e.equals))
    if (e.near !== undefined) {
      const d = styleNear(m, e.near)
      const max = e.deltaE ?? 10
      add(
        `${label} ${shownAs} is ΔE ${Number.isFinite(d) ? d.toFixed(1) : '?'} from ${e.near} (≤ ${max})`,
        isColorProp(e.prop) && d <= max
      )
    }
    if (e.changed !== undefined && e.changed !== false) {
      const before =
        typeof e.changed === 'string'
          ? { ok: true, value: e.changed, rgba: parseColor(e.changed) }
          : ctx.baseline?.[`style:${key}`]
      const was = !before
        ? 'no baseline'
        : before.ok === false
          ? `baseline unreadable (${before.error})`
          : clip(before.value, 60)
      add(
        `${label} changed: ${was} → ${shownAs}`,
        Boolean(before && before.ok !== false && styleDiffers(e.prop, before, m))
      )
    }
  }
  for (const e of [].concat(rule.styleSame ?? [])) {
    const key = sameKeyOf(name, rule, e)
    const label = `${name} same ${e.prop} across ${[].concat(e.selectors ?? []).join(', ')}${e.viewport === 'mobile' ? ' (mobile)' : ''}`
    const m = ctx.styles?.[key]
    if (!m) {
      add(`${label}: not measured (style rules are judged by judgeAsync)`, false)
      continue
    }
    if (!m.ok) {
      add(`${label}: ${m.error}`, false)
      continue
    }
    const distinct = distinctValues(e.prop, m.values)
    add(
      `${label}: ${distinct.length} value(s) ${clip(distinct.join(' | '), 120)} over ${m.values.length} element(s)${m.missing.length ? `; nothing shown for ${m.missing.join(', ')}` : ''}`,
      m.values.length > 0 && m.missing.length === 0 && distinct.length === 1
    )
  }
  // visible / hidden (bench bug X5): judged on what a visitor's browser shows, not on the HTML — text hidden
  // by CSS is still in the HTML, so `gone` cannot tell "ẩn đi" from "không làm gì".
  for (const [rule_, want] of [
    ['visible', true],
    ['hidden', false]
  ])
    for (const e of seenEntries(rule[rule_])) {
      const m = ctx.styles?.[seenKeyOf(name, rule, e)]
      const label = `${name} ${want ? 'shows' : 'hides'} "${clip(e.text, 50)}"${e.viewport === 'mobile' ? ' (mobile)' : ''}`
      if (!m) add(`${label}: not measured (browser rules are judged by judgeAsync)`, false)
      else if (!m.ok) add(`${label}: ${m.error}`, false)
      else if (want)
        add(
          `${label}: ${m.visible} of ${m.holders} element(s) holding it are visible${m.hiddenBy ? ` (hidden by ${m.hiddenBy})` : ''}`,
          m.visible > 0
        )
      else
        add(
          `${label}: ${m.holders ? `${m.visible} of ${m.holders} element(s) holding it visible${m.hiddenBy ? `, hidden by ${m.hiddenBy}` : ''}` : 'not in the page'}`,
          m.visible === 0
        )
    }
  if (rule.meta && typeof rule.meta === 'object')
    for (const [field, want] of Object.entries(rule.meta)) judgeMeta(name, field, want, full, ctx, add)
  if (rule.jsonLd) {
    const ld = jsonLd(full)
    const bad = ld.blocks.filter((b) => !b.ok).length
    for (const w of [].concat(rule.jsonLd)) {
      const types = [].concat(w.type ?? [])
      const cands = ld.nodes.filter((n) => !types.length || typesOf(n).some((t) => types.includes(t)))
      const needs = Object.entries(w.has ?? {})
      const hit = cands.find((n) =>
        needs.every(([path, v]) => pathValues(n, path, ld.byId).some((x) => valueHolds(x, v)))
      )
      const what = needs.map(([k, v]) => `${k}~"${clip(v, 30)}"`).join(', ')
      add(
        `${name} JSON-LD ${types.join('|') || 'node'}${what ? ` with ${what}` : ''} (${cands.length} such node(s) in ${ld.blocks.length} block(s)${bad ? `, ${bad} unparseable` : ''})`,
        Boolean(hit)
      )
      if (w.valid)
        add(
          `${name} every JSON-LD block parses (${ld.blocks.length - bad}/${ld.blocks.length})`,
          ld.blocks.length > 0 && bad === 0
        )
    }
  }
  if (rule.imgAlt) {
    const imgs = pictures(html)
    const empty = imgs.filter((t) => !(t.attrs.get('alt') ?? '').trim())
    if (rule.imgAlt === true || rule.imgAlt.noneEmpty)
      add(
        `${name} every picture has alt text: ${imgs.length - empty.length}/${imgs.length}${empty.length ? ` (empty: ${empty.slice(0, 4).map(srcName).join(', ')})` : ''}`,
        imgs.length > 0 && empty.length === 0
      )
    // anyHas: each text is in the alt of at least one picture (any case).
    for (const want of [].concat(rule.imgAlt.anyHas ?? [])) {
      const hit = imgs.find((t) =>
        (t.attrs.get('alt') ?? '').toLowerCase().includes(String(want).toLowerCase())
      )
      add(
        `${name} a picture's alt has "${clip(want, 40)}"${hit ? ` (${srcName(hit)})` : ` (${imgs.length} pictures)`}`,
        Boolean(hit)
      )
    }
  }
  for (const w of [].concat(rule.imgAltNear ?? [])) {
    const got = nearestImage(html, w.near)
    if (got.error) {
      add(`${name} picture near "${clip(w.near, 40)}": ${got.error}`, false)
      continue
    }
    const alt = got.alt ?? ''
    for (const s of [].concat(w.altHas ?? []))
      add(
        `${name} picture near "${clip(w.near, 40)}" (${srcName(got.src)}) alt has "${s}": "${clip(alt, 80)}"`,
        alt.toLowerCase().includes(String(s).toLowerCase())
      )
    if (w.nonEmpty)
      add(
        `${name} picture near "${clip(w.near, 40)}" (${srcName(got.src)}) has alt text: "${clip(alt, 80)}"`,
        alt.trim() !== ''
      )
  }
  if (rule.headings) {
    const hs = headingsOf(html)
    const h = rule.headings
    if (h.h1Count !== undefined) {
      const n = hs.filter((x) => x.level === 1).length
      add(`${name} h1 count ${n} (want ${h.h1Count})`, n === h.h1Count)
    }
    if (h.h1Has !== undefined) {
      const h1s = hs.filter((x) => x.level === 1).map((x) => x.text)
      add(
        `${name} an h1 has "${clip(h.h1Has, 50)}": ${h1s.map((x) => `"${clip(x, 40)}"`).join(', ') || 'no h1'}`,
        h1s.some((x) => x.toLowerCase().includes(String(h.h1Has).toLowerCase()))
      )
    }
    if (h.noSkips) {
      const skips = []
      for (let i = 1; i < hs.length; i++)
        if (hs[i].level > hs[i - 1].level + 1)
          skips.push(`h${hs[i - 1].level}→h${hs[i].level} "${clip(hs[i].text, 30)}"`)
      add(
        `${name} heading levels never skip (${hs.length} headings)${skips.length ? `: ${skips.slice(0, 3).join('; ')}` : ''}`,
        hs.length > 0 && skips.length === 0
      )
    }
  }
  if (rule.hreflang) {
    const got = hreflangs(full)
    const langs = [...new Set(got.map((x) => x.lang))]
    for (const l of [].concat(rule.hreflang.langs ?? [])) {
      const want = String(l).toLowerCase()
      add(
        `${name} hreflang ${want} (${clip(langs.join(', '), 60) || 'none'})`,
        got.some((x) => (x.lang === want || x.lang.startsWith(`${want}-`)) && x.href)
      )
    }
    if (rule.hreflang.xDefault)
      add(
        `${name} hreflang x-default (${clip(langs.join(', '), 60) || 'none'})`,
        got.some((x) => x.lang === 'x-default' && x.href)
      )
  }
  // form (browser DOM after load, so a script's `required` counts): entry E matches control C when C's name or
  // its labels' text holds E (any case). ONE form must satisfy all: every `fields` entry matches ≥ 1 control,
  // every `required` entry ≥ 1 required control (required or aria-required="true"), every `optional` entry
  // no required control (absent is fine). role="search" forms are left out.
  if (rule.form) {
    const m = ctx.styles?.[formKeyOf(name, rule)]
    const f = rule.form
    const fields = [].concat(f.fields ?? [])
    const req = [].concat(f.required ?? [])
    const opt = [].concat(f.optional ?? [])
    const label = `${name} form with ${fields.join(', ')}${req.length ? ` (required: ${req.join(', ')})` : ''}${opt.length ? ` (optional: ${opt.join(', ')})` : ''}`
    if (!m) add(`${label}: not measured (browser rules are judged by judgeAsync)`, false)
    else if (!m.ok) add(`${label}: ${m.error}`, false)
    else {
      const hits = (c, e) =>
        c.name.toLowerCase().includes(String(e).toLowerCase()) ||
        c.labels.some((l) => l.includes(String(e).toLowerCase()))
      const scored = m.forms.map((form) => {
        const miss = fields.filter((e) => !form.controls.some((c) => hits(c, e)))
        const notReq = req.filter((e) => !form.controls.some((c) => hits(c, e) && c.required))
        const optReq = opt.filter((e) => form.controls.some((c) => hits(c, e) && c.required))
        return { form, miss, notReq, optReq, bad: miss.length + notReq.length + optReq.length }
      })
      const best = scored.sort((a, b) => a.bad - b.bad)[0]
      const why = !best
        ? 'no <form> on the page'
        : best.bad === 0
          ? `${best.form.el}: ${best.form.controls.map((c) => `${c.name || c.tag}${c.required ? '*' : ''}`).join(', ')}`
          : [
              best.miss.length ? `no field for ${best.miss.join(', ')}` : '',
              best.notReq.length ? `not required: ${best.notReq.join(', ')}` : '',
              best.optReq.length ? `required but optional: ${best.optReq.join(', ')}` : ''
            ]
              .filter(Boolean)
              .join('; ')
      add(
        `${label}: ${why}${m.forms.length > 1 ? ` [best of ${m.forms.length} forms]` : ''}`,
        Boolean(best) && best.bad === 0
      )
    }
  }
  for (const s of [].concat(rule.headHas ?? []))
    add(`${name} <head> has ${clip(s, 60)}`, headOf(full).includes(s))
  // htmlLacks (key-filled): nowhere in the raw HTML (head and body, scripts and noscript included).
  for (const s of [].concat(rule.htmlLacks ?? [])) add(`${name} html lacks ${clip(s, 60)}`, !html.includes(s))
  for (const w of [].concat(rule.telLink ?? [])) {
    const n = telLinks(html, w.text)
    if (w.more) {
      const before = ctx.baseline?.[`tel:${name}:${w.text}`]
      add(
        `${name} tel: links for "${clip(w.text, 30)}" ${before ?? 'no baseline'} → ${n}`,
        before !== undefined && n > before
      )
    } else add(`${name} tel: link for "${clip(w.text, 30)}" (${n})`, n >= 1)
  }
  // iframes: some <iframe src> — entities, "+" and %-escapes decoded, lower-cased — holds every srcHas string.
  for (const w of [].concat(rule.iframes ?? [])) {
    const srcs = tagsNamed(html, 'iframe').map((t) => {
      let src = String(t.attrs.get('src') ?? '').replace(/\+/g, ' ')
      try {
        src = decodeURIComponent(src)
      } catch {}
      return src.toLowerCase()
    })
    const want = [].concat(w.srcHas ?? []).map((x) => String(x).toLowerCase())
    add(
      `${name} iframe src has ${want.map((x) => `"${x}"`).join(', ')} (${srcs.length} iframe(s)${srcs.length ? `: ${clip(srcs[0], 60)}` : ''})`,
      srcs.some((src) => want.every((x) => src.includes(x)))
    )
  }
  // words (served HTML): one element, its words (a letter or digit in them) within min..max, `has`, `lang`.
  for (const [i, w] of [].concat(rule.words ?? []).entries()) {
    const m = ctx.styles?.[staticKeyOf(name, rule, 'words', w, i)]
    const what = `${name} words ${w.selector ? `"${clip(w.selector, 30)}"#${w.nth ?? 0}` : `"${clip(w.text, 30)}"`}${w.min !== undefined || w.max !== undefined ? ` ${w.min ?? ''}..${w.max ?? ''}` : ''}${w.has ? ` has "${clip(w.has, 20)}"` : ''}${w.lang ? ` ${w.lang}` : ''}`
    if (!m) add(`${what}: not measured (browser rules are judged by judgeAsync)`, false)
    else if (!m.ok) add(`${what}: ${m.error}`, false)
    else {
      const n = wordCount(m.text)
      const ok =
        (w.min === undefined || n >= w.min) &&
        (w.max === undefined || n <= w.max) &&
        (!w.has || m.text.includes(w.has)) &&
        langHolds(m.text, w.lang)
      add(`${what}: ${n} words "${clip(m.text, 70)}"`, ok)
    }
  }
  // list (served HTML): the smallest <ul>/<ol> holding every `has` string has exactly `items` <li> children.
  for (const [i, w] of [].concat(rule.list ?? []).entries()) {
    const m = ctx.styles?.[staticKeyOf(name, rule, 'list', w, i)]
    const what = `${name} list holding ${[]
      .concat(w.has ?? [])
      .map((x) => `"${clip(x, 20)}"`)
      .join(', ')} has ${w.items} items`
    if (!m) add(`${what}: not measured (browser rules are judged by judgeAsync)`, false)
    else if (!m.ok) add(`${what}: ${m.error}`, false)
    else add(`${what}: ${m.items} in ${m.el}`, m.items === w.items)
  }
}

// ───────────────────────── v6 image track: `picture` (v6/lib/picture.mjs) ─────────────────────────
// A page block's `picture: [entry, …]`. An entry names ONE picture as a visitor would — {img: "hero"},
// {near: "<text>"} or {between: ["<text a>", "<text b>"]} (+ `count`: how many pictures stand there) — and asks:
//   src: "same" | "changed" | "new"   vs that picture before the case (address AND bytes: a demo file overwritten
//                                      in place is not "same"); "new" = a file the site did not show before
//   srcOf: {<locator>, page?}          the file ANOTHER picture showed before the case ("use the Vorsino photo")
//   sameAs: {page, <locator>}          the file a picture on another page shows now (both languages alike)
//   fixture: "<name>"                  the customer's file (bytes, content address or exact pixel box — never shape)
//   file: true | {minWidth?, minHeight?, aspect?: "was" | number | "w:h", tol?}   answers 200 image/*, its box
//   alt: "<text>" | {has?, lacks?, nonEmpty?, lang?: en|ru, minWords?, maxWords?, changed?}
// An entry with no locator is judged over the pictures the site did not show before the case: {fixture} = one of
// them is the customer's file, {fixture, absent: true} = none is. Fail-closed: an unknown field is a failing check.
const PICTURE_FIELDS = new Set([
  'img',
  'near',
  'between',
  'count',
  'src',
  'srcOf',
  'sameAs',
  'fixture',
  'file',
  'alt',
  'absent'
])
/** Pages whose pictures make up "what the site showed before" (`pictures:known`), besides every page a case names. */
const PICTURE_MAIN_PAGES = ['home', 'about', 'contact', 'news', 'homeRu', 'newsRu', 'projectsPage']
const picName = (src) =>
  clip(
    String(src ?? 'none')
      .replace(/[?#].*$/, '')
      .split('/')
      .pop() || String(src),
    48
  )

/** One GET per picture address within one judgement or baseline (ctx.fetchFile(label, src) replaces curl in tests). */
function pictureReader(site, ctx = {}) {
  const cache = ctx.pictureFiles ?? new Map()
  const get = ctx.fetchFile ?? fetchPictureFile
  return (src) => {
    const k = String(src ?? '')
    if (!cache.has(k)) cache.set(k, get(site.label, k))
    return cache.get(k)
  }
}

/** What an entry's picture is before the case: its address, alt, and file (bytes digest, pixel box). */
function pictureSnapshot(html, e, fileOf) {
  const at = locatePicture(html, e, { heroSection })
  if (at.error) return { error: at.error }
  const out = { src: at.src, key: at.key, alt: at.alt }
  if (at.count !== undefined) out.count = at.count
  if (at.src) {
    const f = fileOf(at.src)
    Object.assign(out, { status: f.status, sha256: f.sha256, box: f.box })
  }
  return out
}

function judgePictureFile(label, want, f, before, add) {
  const w = want && typeof want === 'object' ? want : {}
  add(
    `${label} file answers ${f.status} ${f.contentType || 'with no content type'}${f.box ? ` ${f.box.width}x${f.box.height}` : ', size unread'}${f.error ? ` (${f.error})` : ''}`,
    f.status === 200 && String(f.contentType).startsWith('image/') && Boolean(f.box)
  )
  if (!f.box) return
  if (w.minWidth !== undefined)
    add(`${label} at least ${w.minWidth} px wide (${f.box.width})`, f.box.width >= w.minWidth)
  if (w.minHeight !== undefined)
    add(`${label} at least ${w.minHeight} px high (${f.box.height})`, f.box.height >= w.minHeight)
  if (w.aspect !== undefined) {
    const ratio = (v) => {
      const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(String(v).trim())
      return m ? Number(m[1]) / Number(m[2]) : Number(v)
    }
    const was =
      w.aspect === 'was' ? (before?.box ? before.box.width / before.box.height : null) : ratio(w.aspect)
    const now = f.box.width / f.box.height
    const tol = w.tol ?? 0.08
    add(
      `${label} shape ${now.toFixed(3)} within ${tol} of ${was === null || !Number.isFinite(was) ? `${w.aspect === 'was' ? 'the old picture' : w.aspect} (unknown)` : was.toFixed(3)}`,
      was !== null && Number.isFinite(was) && Math.abs(now - was) <= tol
    )
  }
}

function judgePictureAlt(label, want, alt, before, add) {
  const w = typeof want === 'string' ? { has: want } : want && typeof want === 'object' ? want : {}
  const shown = alt === null ? 'no alt attribute' : `"${clip(alt, 70)}"`
  let judged = false
  for (const s of [].concat(w.has ?? [])) {
    judged = true
    add(
      `${label} alt has "${clip(s, 50)}": ${shown}`,
      alt !== null && alt.toLowerCase().includes(String(s).toLowerCase())
    )
  }
  for (const s of [].concat(w.lacks ?? [])) {
    judged = true
    add(
      `${label} alt lacks "${clip(s, 50)}": ${shown}`,
      alt === null || !alt.toLowerCase().includes(String(s).toLowerCase())
    )
  }
  if (w.nonEmpty) {
    judged = true
    add(`${label} has alt text: ${shown}`, Boolean(alt && alt.trim()))
  }
  if (w.lang) {
    judged = true
    add(`${label} alt is ${w.lang}: ${shown}`, Boolean(alt && alt.trim()) && langHolds(alt, w.lang))
  }
  if (w.minWords !== undefined || w.maxWords !== undefined) {
    judged = true
    const n = alt ? wordCount(alt) : 0
    add(
      `${label} alt has ${n} words (${w.minWords ?? 0}..${w.maxWords ?? '∞'}): ${shown}`,
      (w.minWords === undefined || n >= w.minWords) && (w.maxWords === undefined || n <= w.maxWords)
    )
  }
  if (w.changed) {
    judged = true
    const was = before?.alt ?? null
    add(
      `${label} alt changed: ${before === undefined ? 'no baseline' : was === null ? 'none' : `"${clip(was, 40)}"`} → ${shown}`,
      before !== undefined && !before.error && (alt ?? '') !== (was ?? '')
    )
  }
  if (!judged) add(`${label} has alt text: ${shown}`, Boolean(alt && alt.trim()))
}

/** A `picture` entry with no locator: over the pictures the site did not show before the case. */
function judgeAnyPicture(name, e, html, add, fileOf, known) {
  if (e.fixture === undefined)
    return add(`${name} any picture: needs fixture (or a locator: img, near, between)`, false)
  const pool = allPictures(html).filter((x) => !(Array.isArray(known) && known.includes(x.key)))
  const seen = new Set()
  let hit = null
  for (const x of pool) {
    if (seen.has(x.key)) continue
    seen.add(x.key)
    const id = fixtureIdentity(x.src, e.fixture, FIXTURES, fileOf)
    if (id.ok) {
      hit = { ...x, how: id.how }
      break
    }
  }
  const scope = `${seen.size} picture(s) new to the site${Array.isArray(known) ? '' : ' (no baseline: every picture)'}`
  if (e.absent)
    add(
      `${name} shows no picture that is the customer's ${e.fixture}${hit ? ` — it does (${hit.how}: ${picName(hit.src)})` : ` (${scope})`}`,
      !hit
    )
  else
    add(
      `${name} shows the customer's ${e.fixture}${hit ? ` (${hit.how}: ${picName(hit.src)})` : ` — not among ${scope}`}`,
      Boolean(hit)
    )
}

/** Every `picture` entry of one page block (already filled). `p` = the page as judge() read it; `pageOf` = judge's page(). */
function judgePictures(name, entries, p, site, ctx, add, pageOf) {
  const fileOf = pictureReader(site, ctx)
  const html = p.html ?? ''
  const known = ctx.baseline?.['pictures:known']
  for (const e of [].concat(entries ?? [])) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      add(`${name} picture: an entry must be an object`, false)
      continue
    }
    const unknown = Object.keys(e).filter((k) => !PICTURE_FIELDS.has(k))
    if (unknown.length) {
      add(`${name} picture: unknown field ${unknown.join(', ')}`, false)
      continue
    }
    if (!locatorOf(e)) {
      judgeAnyPicture(name, e, html, add, fileOf, known)
      continue
    }
    const label = `${name} ${describeLoc(e)}`
    const at = locatePicture(html, e, { heroSection })
    if (at.error) {
      add(`${label}: ${at.error}`, false)
      continue
    }
    if (e.count !== undefined) {
      const n = at.count ?? (at.src ? 1 : 0)
      add(`${label}: ${n} picture(s) there (want ${e.count})`, n === e.count)
    }
    const before = ctx.baseline?.[`pic:${name}:${locKeyOf(e)}`]
    const was =
      before === undefined
        ? 'no baseline'
        : before.error
          ? `baseline unreadable (${before.error})`
          : before.src
            ? picName(before.src)
            : 'none'
    if (!at.src) {
      // `src: "same"` holds for a place that had no picture before the case and has none now.
      if (e.src === 'same')
        add(`${label} same as before: ${was} → none`, before !== undefined && !before.error && !before.src)
      const rest = ['src', 'srcOf', 'sameAs', 'fixture', 'file', 'alt'].filter(
        (k) => e[k] !== undefined && !(k === 'src' && e.src === 'same')
      )
      if (rest.length) add(`${label}: ${at.none ?? 'no picture'} (${rest.join(', ')} not met)`, false)
      continue
    }
    const now = fileOf(at.src)
    if (e.src !== undefined) {
      const sameFile = Boolean(
        before &&
          !before.error &&
          before.src &&
          before.key === at.key &&
          (!before.sha256 || before.sha256 === now.sha256)
      )
      if (e.src === 'same')
        add(
          `${label} same as before: ${was} → ${picName(at.src)}${before?.key === at.key && before?.sha256 && before.sha256 !== now.sha256 ? ' (same address, other bytes)' : ''}`,
          sameFile
        )
      else if (e.src === 'changed')
        add(`${label} changed: ${was} → ${picName(at.src)}`, Boolean(before && !before.error) && !sameFile)
      else if (e.src === 'new') {
        const knownFile = Array.isArray(known) && known.includes(at.key)
        const oldBytes = Boolean(before?.sha256 && before.sha256 === now.sha256)
        const why = !Array.isArray(known)
          ? ' (no baseline of the site’s pictures)'
          : knownFile
            ? ' — a file the site already showed'
            : oldBytes
              ? ' — the old picture’s bytes'
              : ''
        add(
          `${label} is a new file: ${was} → ${picName(at.src)}${why}`,
          Array.isArray(known) && Boolean(before && !before.error) && !knownFile && !oldBytes
        )
      } else add(`${label} src "${e.src}" (same | changed | new)`, false)
    }
    if (e.srcOf !== undefined) {
      const refPage = e.srcOf.page ?? name
      const ref = ctx.baseline?.[`pic:${refPage}:${locKeyOf(e.srcOf)}`]
      const ok =
        Boolean(ref && ref.src) && (ref.key === at.key || Boolean(ref.sha256 && ref.sha256 === now.sha256))
      add(
        `${label} shows what the ${describeLoc(e.srcOf)}${refPage !== name ? ` on ${refPage}` : ''} showed before (${ref?.src ? picName(ref.src) : (ref?.error ?? 'no baseline')}): ${picName(at.src)}`,
        ok
      )
    }
    if (e.sameAs !== undefined) {
      const other = pageOf(e.sameAs.page)
      const there = locatePicture(other.html ?? '', e.sameAs, { heroSection })
      const same =
        Boolean(there.src) &&
        (there.key === at.key ||
          (() => {
            const f = fileOf(there.src)
            return Boolean(f.sha256 && f.sha256 === now.sha256)
          })())
      add(
        `${label} is the picture the ${describeLoc(e.sameAs)} on ${e.sameAs.page} shows (${there.src ? picName(there.src) : (there.error ?? there.none ?? 'none')}): ${picName(at.src)}`,
        same
      )
    }
    if (e.fixture !== undefined) {
      const id = fixtureIdentity(at.src, e.fixture, FIXTURES, fileOf)
      // Fail-closed: the very file this place showed before the case (same address, same bytes) is never the
      // customer's — whatever a fallback says (29/09: a portrait fixture drawn at the placeholder's own 1000x880
      // box matched the untouched page).
      const untouched = Boolean(
        before &&
          !before.error &&
          before.src &&
          before.key === at.key &&
          before.sha256 &&
          before.sha256 === now.sha256 &&
          id.how !== 'same bytes'
      )
      add(
        `${label} is the customer's ${e.fixture} (${untouched && id.ok ? 'no: the picture that was there before the case' : id.how}: ${picName(at.src)})`,
        id.ok && !untouched
      )
    }
    if (e.file !== undefined && e.file !== false) judgePictureFile(label, e.file, now, before, add)
    if (e.alt !== undefined) judgePictureAlt(label, e.alt, at.alt, before, add)
  }
}

/** What the pages looked like before the case, for every check that compares with "before". */
export function baselineOf(site, oracles = [], opts = {}) {
  const fetchPage = opts.fetchPage ?? fetchLive
  const home = fetchPage(site.label, site.home)
  const out = {
    home: digest(visible(home.html)),
    'links:News': links(home.html).filter((l) => l.text === 'News').length
  }
  const pages = { home }
  const pageOf = (name) => (pages[name] ??= resolvePage(site, name, fetchPage))
  // v6 image track: one file reader for this baseline, the pages with `picture` entries, and whether the site's
  // pictures before the case are needed (`src: "new"`, entries with no locator).
  const picture = { fileOf: null, pages: {}, needKnown: false }
  // v5: `anyOf` holds whole oracles; their pages need a baseline too.
  const flat = (list) => list.flatMap((o) => [o, ...(Array.isArray(o?.anyOf) ? flat(o.anyOf) : [])])
  for (const o of flat(oracles)) {
    for (const [name, rule] of Object.entries(o ?? {})) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) continue
      // v6 `in`: the block reads "<page>@<region>", so its "before" does too (v3–v5 blocks never carry it).
      const pn = REGIONS.has(rule.in) && !regionIn(name) ? `${name}@${rule.in}` : name
      for (const want of [].concat(rule.imgFrom ?? [])) {
        const where = want.where ?? 'page'
        out[`srcs:${name}:${where}`] = imgSrcs(regionOf(pageOf(pn).html ?? '', where))
      }
      for (const s2 of (rule.fewerLines ?? []).map((r) => fill(r, site)))
        out[`lines:${name}:${s2}`] = lines(pageOf(pn).html).filter((l) => l === s2).length
      if (rule.moreImages) out[`imgs:${name}`] = imgCount(pageOf(pn).html)
      // v6 `telLink {more: true}`: how many such links the page had before the case.
      for (const w of [].concat(rule.telLink ?? []))
        if (w && w.more)
          out[`tel:${name}:${fill(w.text, site)}`] = telLinks(pageOf(pn).html ?? '', fill(w.text, site))
      // v6 `meta.<field>.changed: true`: the value the page gave before the case.
      if (rule.meta && typeof rule.meta === 'object')
        for (const [field, w] of Object.entries(rule.meta))
          if (w && typeof w === 'object' && w.changed === true)
            out[`meta:${name}:${field}`] =
              metaValues(pageOf(name).full ?? pageOf(name).html ?? '', field)[0] ?? null
      // v6 image track `picture`: each named picture as it was (and every picture an entry's `srcOf` names).
      if (rule.picture !== undefined) {
        picture.fileOf ??= pictureReader(site, { fetchFile: opts.fetchFile })
        const shas = (picture.pages[pn] ??= [])
        for (const e of [].concat(fillDeep(rule.picture, site) ?? [])) {
          if (!e || typeof e !== 'object' || Array.isArray(e)) continue
          if (locatorOf(e)) {
            const snap = (out[`pic:${name}:${locKeyOf(e)}`] ??= pictureSnapshot(
              pageOf(pn).html ?? '',
              e,
              picture.fileOf
            ))
            shas.push(snap.sha256 ?? snap.src ?? snap.error ?? null)
          }
          if (e.srcOf && typeof e.srcOf === 'object' && locatorOf(e.srcOf)) {
            const ref = e.srcOf.page ?? name
            out[`pic:${ref}:${locKeyOf(e.srcOf)}`] ??= pictureSnapshot(
              pageOf(e.srcOf.page ?? pn).html ?? '',
              e.srcOf,
              picture.fileOf
            )
          }
          if (e.src === 'new' || !locatorOf(e)) picture.needKnown = true
        }
      }
    }
  }
  // v6 image track: the pictures the site showed before the case (`src: "new"`, entries with no locator), from
  // every page the case names and the site's main pages; and per page with `picture` entries a digest of its
  // pictures — every address plus the bytes of each named one — under "<page>#pictures". No ":" in that name, so
  // run3.mjs counts it in `unchanged`: with refuseOk an honest refusal must leave the PICTURES as they were too
  // (the text digest alone cannot see a swapped or overwritten picture).
  if (picture.needKnown) {
    const keys = new Set()
    for (const name of new Set([...pagesNamed(oracles), ...PICTURE_MAIN_PAGES.filter((k) => site[k])]))
      for (const s of imgSrcs(pageOf(name).full ?? pageOf(name).html ?? ''))
        if (srcKey(s)) keys.add(srcKey(s))
    out['pictures:known'] = [...keys].sort()
  }
  for (const [pn, shas] of Object.entries(picture.pages))
    if (!pn.includes(':'))
      out[`${pn}#pictures`] = digest(
        JSON.stringify({
          srcs: [...new Set(allPictures(pageOf(pn).html ?? '').map((x) => x.key))].sort(),
          named: shas
        })
      )
  // Opt-in (suite "$judge": {"unchangedPages": "oracle"}): fingerprint EVERY page the case names, so
  // `unchanged` and an honest refusal (refuseOk) are judged on About/Contact too, not only on home.
  if (opts.allPages) for (const name of pagesNamed(oracles)) out[name] ??= digest(visible(pageOf(name).html))
  return out
}

const NOT_PAGES = new Set(['answerHas', 'asks', 'unchanged', 'follow', 'anyOf', 'http'])
/** Page names an oracle list reads: its page keys plus every name listed under `unchanged`. */
export function pagesNamed(oracles = []) {
  const out = new Set()
  for (const o of oracles)
    for (const [name, rule] of Object.entries(o ?? {})) {
      if (name === 'unchanged') rule.forEach((p) => out.add(p))
      else if (name === 'anyOf') pagesNamed(rule).forEach((p) => out.add(p))
      else if (!NOT_PAGES.has(name)) out.add(name)
    }
  return [...out]
}

// ---- Trace budgets: judged from the session log, reported NEXT TO the page verdict, never inside it.
// Generic on purpose: they count steps, calls and repeated refusals, and never name a tool.

/** A session log as events: accepts the JSONL text or an already parsed list. */
export function parseEvents(events) {
  if (Array.isArray(events)) return events
  const list = []
  for (const line of String(events ?? '').split('\n')) {
    try {
      list.push(JSON.parse(line))
    } catch {}
  }
  return list
}

const resultText = (node, out = []) => {
  if (Array.isArray(node)) for (const n of node) resultText(n, out)
  else if (node && typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') out.push(node.text)
    for (const v of Object.values(node)) if (v && typeof v === 'object') resultText(v, out)
  }
  return out
}

/** Measure a session: steps (assistant steps, numbered per turn — counted like analyze.mjs), tool calls,
 *  refusals keyed by action + code, and whether each turn's first assistant message spoke before acting. */
export function measureTrace(events) {
  const list = parseEvents(events)
  const steps = new Set()
  const callsById = new Map()
  let calls = 0
  for (const e of list) {
    if (e?.data?.turn !== undefined && e.data.step !== undefined) steps.add(`${e.data.turn}:${e.data.step}`)
    if (e?.type === 'tool/call') {
      calls++
      let a = {}
      try {
        a = JSON.parse(e.data.arguments ?? '{}')
      } catch {}
      // "Action" = the tool name plus the verb inside its arguments, whatever the tool calls it.
      const verb = [a.action ?? a.tool ?? (a.list ? 'list' : ''), a.params?.operation ?? '']
        .filter(Boolean)
        .join(':')
      callsById.set(e.data.callId, verb ? `${e.data.name} ${verb}` : e.data.name)
    }
  }
  const refusals = {}
  for (const e of list) {
    if (e?.type !== 'tool/result') continue
    const action = callsById.get(e.data?.message?.source?.callId)
    if (!action) continue
    const t = resultText(e.data.message?.content).join('')
    // The same refusal test analyze.mjs uses for its "ref" column.
    if (!(/"ok"\s*:\s*false/.test(t) || /^(Error|error:)/.test(t.trim()))) continue
    const code = (/"(?:code|error)"\s*:\s*"([^"]{1,48})"/.exec(t) ?? [null, t.trim().slice(0, 48)])[1]
    const key = `${action} ✗${code}`
    refusals[key] = (refusals[key] ?? 0) + 1
  }
  const firstMessage = {}
  for (const e of list) {
    if (e?.type !== 'assistant/message' || e.data?.turn === undefined || e.data.turn in firstMessage) continue
    const parts = e.data.message?.content ?? []
    const tool = parts.findIndex((p) => p.type === 'tool-call')
    const before = tool < 0 ? parts : parts.slice(0, tool)
    firstMessage[e.data.turn] = {
      spoke: before.some((p) => p.type === 'text' && String(p.text ?? '').trim() !== ''),
      acted: tool >= 0
    }
  }
  const maxSame = Object.entries(refusals).sort((a, b) => b[1] - a[1])[0] ?? null
  return {
    steps: steps.size,
    calls,
    refusals,
    maxSameRefusal: maxSame ? maxSame[1] : 0,
    maxSameKey: maxSame?.[0] ?? null,
    firstMessage
  }
}

/**
 * @param {{maxSteps?: number, maxCalls?: number, textBeforeFirstTool?: true | number[], maxSameRefusal?: number} | undefined} budget
 *   textBeforeFirstTool: true judges the session's FIRST turn; a list of turn numbers judges those turns.
 * @param {object[] | string} events - session.jsonl (text or parsed)
 * @returns {{pass: boolean, failures: string[], measured: object}}
 */
export function judgeBudget(budget, events) {
  const m = measureTrace(events)
  const failures = []
  if (!budget) return { pass: true, failures, measured: m }
  if (budget.maxSteps !== undefined && m.steps > budget.maxSteps)
    failures.push(`steps ${m.steps} > maxSteps ${budget.maxSteps}`)
  if (budget.maxCalls !== undefined && m.calls > budget.maxCalls)
    failures.push(`calls ${m.calls} > maxCalls ${budget.maxCalls}`)
  if (budget.maxSameRefusal !== undefined && m.maxSameRefusal > budget.maxSameRefusal)
    failures.push(
      `same refusal ×${m.maxSameRefusal} > maxSameRefusal ${budget.maxSameRefusal} (${m.maxSameKey})`
    )
  if (budget.textBeforeFirstTool) {
    const turns = Array.isArray(budget.textBeforeFirstTool) ? budget.textBeforeFirstTool : [1]
    for (const t of turns) {
      const first = m.firstMessage[t]
      if (!first) failures.push(`turn ${t}: no assistant message`)
      else if (!first.spoke)
        failures.push(
          `turn ${t}: first assistant message ${first.acted ? 'called a tool before saying anything' : 'has no text'}`
        )
    }
  }
  // v6: the level's time target, judged on the AGENT's time from its own log (every turn from turn/start to
  // turn/end, minus the time a question card waited for the customer) — never on the runner's clock, which
  // also holds page loads, turn checks and message delivery. Measured only when a budget asks, so a v3–v5
  // budgetCheck stays byte-identical.
  if (budget.maxSeconds !== undefined) {
    m.agentSeconds = agentSeconds(events)
    if (m.agentSeconds > budget.maxSeconds)
      failures.push(`agent time ${m.agentSeconds} s > maxSeconds ${budget.maxSeconds}`)
  }
  return { pass: failures.length === 0, failures, measured: m }
}

/** Seconds the agent spent on the case: Σ turn/start→turn/end (a turn with no end: to its last event), minus
 *  every ask_user_question call's wait for its answer (the customer's time, not the agent's). */
export function agentSeconds(events) {
  const list = parseEvents(events)
  const turns = new Map()
  for (const e of list) {
    const t = e?.data?.turn
    if (t === undefined || typeof e.time !== 'number') continue
    const x = turns.get(t) ?? { start: null, end: null, last: e.time }
    if (e.type === 'turn/start') x.start = e.time
    if (e.type === 'turn/end') x.end = e.time
    x.last = Math.max(x.last, e.time)
    turns.set(t, x)
  }
  let ms = 0
  for (const x of turns.values()) if (x.start !== null) ms += (x.end ?? x.last) - x.start
  const asks = new Map(
    list
      .filter((e) => e?.type === 'tool/call' && e.data?.name === 'ask_user_question')
      .map((e) => [e.data.callId, e.time])
  )
  for (const e of list) {
    if (e?.type !== 'tool/result') continue
    const at = asks.get(e.data?.message?.source?.callId)
    if (at !== undefined) ms -= Math.max(0, e.time - at)
  }
  return Math.round(ms / 100) / 10
}
