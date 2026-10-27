#!/usr/bin/env node
// source-font.mjs — does the SOURCE itself draw its text in the font it asks for? (Phase 2)
//
// Every port-side font check compares the port with the source, so a source that renders in a fallback font
// (both sides wrong together) passes them all. This module judges the source on its own:
//
//   analyzeStatic(...)      the source's files → per used template style the effective body / heading / menu
//                           family, where it was declared, what loads it, and a verdict. T4 resolves a site
//                           profile as T4 does (templates/<t>/local/etc over etc, the file wholesale; a missing
//                           profile or an empty file falls back to `default`; theme keys fill only keys the site
//                           file lacks, an empty string stays empty). T3 reads the families its LESS/CSS declares
//                           and the loaders in etc/assets.xml and the template sheets.
//   judgeBrowser(...)       raw measurements of the running source (source-font-browser.mjs) → findings: the
//                           browser default serif, a web family drawn by a system font, headings the size of body
//                           text on desktop, a failed font request.
//   gateSourceFonts(...)    the Phase 2 exit gate: the static report and the measurement must cover the source and
//                           every finding must be decided in DECISIONS.md (one decision that names its key).
//
// Both readers are pure: the file reader and the measurement are arguments, so the same analysis runs on a
// quickstart archive (quickstart-inventory.mjs) and on a captured template directory (from-joomla.mjs).
//
// Usage: node scripts/ingest/source-font.mjs check --inventory <inventory.json> [--quickstart <id>] [--decisions DECISIONS.md] [--out report.json]
//        exit 0: every used style passes (or its findings are decided); 1: a source-font finding or incomplete evidence.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { parseDecisions, fold, readSmallFile } from '../lib/parity-acceptance.mjs'

export const STATIC_SCHEMA = 'tracy.source-fonts-static/1'
export const DOM_STATIC_SCHEMA = 'tracy.source-fonts-dom-static/1'
export const BROWSER_SCHEMA = 'tracy.source-fonts-browser/1'
export const REPORT_SCHEMA = 'tracy.source-fonts/1'
export const REPORT_FILE = 'source-fonts.json'
export const FINDING_KIND = 'source-font'
export const GOOGLE_LIST = 'plugins/system/t4/admin/etc/googlefonts/fonts.json'
export const DESKTOP_WIDTH = 1440
export const MOBILE_WIDTH = 390
export const BROWSER_ROLES = ['body', 'h1', 'h2', 'h3', 'nav']

const SAFE_PROFILE = /^[A-Za-z0-9_][A-Za-z0-9_. -]*$/
const SAFE_DIR = /^[A-Za-z0-9_.-]+$/
const ROLES_T4 = ['body', 'heading', 'megamenu']
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', '-apple-system', 'blinkmacsystemfont'])
// Families every desktop OS ships: a stack that starts with one asks the browser for nothing to download.
const SYSTEM = new Set(['arial', 'helvetica', 'helvetica neue', 'georgia', 'times', 'times new roman', 'verdana', 'tahoma', 'trebuchet ms', 'courier', 'courier new', 'impact', 'lucida grande', 'lucida sans unicode', 'lucida console', 'palatino', 'palatino linotype', 'segoe ui', 'monaco', 'menlo', 'consolas', 'comic sans ms', 'arial black', 'sf pro text', 'sf pro display'])
const DEFAULT_SERIF = new Set(['times', 'times new roman'])
const SERIF_ENGINES = /times|liberation serif|tinos|nimbus roman|dejavu serif|freeserif|noto serif/i
const FONT_FILE = /\.(?:woff2?|ttf|otf|eot)$/i
const MAX_CSS_FILES = 40
const MAX_IMPORT_DEPTH = 3
const PRIVATE_HOST = /^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.0\.0\.0)|\.(?:local|test|localhost|internal)$|^[^.]+$/i

// ------------------------------------------------------------------ small helpers
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const unique = (xs) => [...new Set(xs)]
/** PHP truthiness of a decoded JSON value ("0", "", 0, false, null, [] are false; "false" is true). */
export function phpTruthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}
const clean = (s) => String(s ?? '').replace(/["']/g, '').trim()
const same = (a, b) => fold(clean(a)).replace(/[\s_-]+/g, '') === fold(clean(b)).replace(/[\s_-]+/g, '')

/** The names of a font-family value: `"Muli", Arial, sans-serif` → ['Muli', 'Arial', 'sans-serif']. */
export function familyStack(value) {
  return String(value ?? '')
    .replace(/!important/gi, '')
    .split(',')
    .map(clean)
    .filter(Boolean)
}
export const isGeneric = (name) => GENERIC.has(fold(name))
export const isSystemFamily = (name) => SYSTEM.has(fold(name))
/** The first family of a stack that is a real name (not a CSS keyword), or null. */
export function primaryFamily(value) {
  return familyStack(value).find((n) => !isGeneric(n) && !/^var\(/i.test(n)) ?? null
}

// ------------------------------------------------------------------ CSS / LESS facts
function stripComments(text, less) {
  let out = ''
  for (let i = 0; i < text.length; ) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) return out
      i = end + 2
    } else if (less && c === '/' && text[i + 1] === '/' && text[i - 1] !== ':' && text[i - 1] !== '(') {
      const end = text.indexOf('\n', i)
      if (end < 0) return out
      i = end
    } else out += text[i++]
  }
  return out
}

const IMPORT_RE = /^@import\s+(?:\([^)]*\)\s*)?(?:url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s]*))\s*\)|'([^']*)'|"([^"]*)")/i

/**
 * What a style sheet states about fonts, nothing else: its `@import` targets, its `@font-face` blocks, the
 * declarations of every rule (selector list → property/value list) and, for LESS, its top-level variables.
 */
export function cssFacts(text, { less = false } = {}) {
  const src = stripComments(String(text ?? ''), less)
  const imports = []
  const fontFaces = []
  const rules = []
  const vars = {}
  const stack = [{ sel: '', decls: [] }]
  let buf = ''
  let paren = 0
  const statement = () => {
    const t = buf.trim()
    buf = ''
    if (!t) return
    if (/^@import\b/i.test(t)) {
      const m = IMPORT_RE.exec(t)
      if (m) imports.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? '')
      return
    }
    if (stack.length === 1) {
      const v = /^@([\w-]+)\s*:\s*([\s\S]*)$/.exec(t)
      if (v) {
        vars[v[1]] = v[2].trim()
        return
      }
    }
    const d = /^([\w-]+)\s*:\s*([\s\S]*)$/.exec(t)
    if (d) stack.at(-1).decls.push([d[1].toLowerCase(), d[2].trim()])
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      buf += src.slice(i, j + 1)
      i = j
      continue
    }
    if (c === '(') paren++
    else if (c === ')') paren = Math.max(0, paren - 1)
    if (paren === 0 && c === '{') {
      stack.push({ sel: buf.trim(), decls: [] })
      buf = ''
    } else if (paren === 0 && c === '}') {
      statement()
      if (stack.length > 1) {
        const block = stack.pop()
        if (/^@font-face$/i.test(block.sel)) {
          const family = block.decls.find(([p]) => p === 'font-family')?.[1]
          const srcs = block.decls.filter(([p]) => p === 'src').flatMap(([, v]) => [...v.matchAll(/url\(\s*(?:'([^']*)'|"([^"]*)"|([^'")\s]*))\s*\)/gi)].map((m) => m[1] ?? m[2] ?? m[3]))
          if (family) fontFaces.push({ family: clean(family), srcs })
        } else if (block.sel && !block.sel.startsWith('@')) {
          // a rule inside @media / @supports applies only under that condition; one inside @keyframes / @page is no rule of the page;
          // a LESS rule nested in another is the parent's selector followed by its own (`&` stands for the parent)
          const ats = stack.slice(1).filter((b) => b.sel.startsWith('@')).map((b) => b.sel)
          if (!ats.some((a) => /^@(?:-\w+-)?(?:keyframes|page|font-face)\b/i.test(a))) {
            let sels = block.sel.split(',').map((x) => x.trim())
            for (const parent of stack.slice(1).filter((b) => b.sel && !b.sel.startsWith('@'))) {
              const ps = parent.sel.split(',').map((x) => x.trim())
              sels = ps.flatMap((pp) => sels.map((c) => (c.includes('&') ? c.replace(/&/g, pp) : `${pp} ${c}`)))
            }
            rules.push({ selectors: sels, decls: block.decls, media: ats.filter((a) => /^@(?:media|supports)\b/i.test(a)).join(' and ') })
          }
        }
      }
    } else if (paren === 0 && c === ';') statement()
    else buf += c
  }
  statement()
  return { imports, fontFaces, rules, vars }
}

/** The family names a web font URL requests (`family=A:wght@400&family=B` and `family=A:400|B`), [] for any other URL. */
export function familiesOfFontUrl(url) {
  let u
  try {
    u = new URL(url, 'https://base.invalid/')
  } catch {
    return []
  }
  return u.searchParams
    .getAll('family')
    .flatMap((v) => v.split('|'))
    .map((v) => v.split(':')[0].replace(/\+/g, ' ').trim())
    .filter(Boolean)
}
const isExternal = (u) => /^(?:https?:)?\/\//i.test(u)

/** Resolve `url` written in the sheet `sheetRel` to a path below the Joomla root, or null (external, data:, escaping the root). */
export function resolveSheetUrl(sheetRel, url) {
  const clean_ = String(url ?? '').replace(/[?#].*$/, '')
  if (!clean_ || /^[a-z][a-z0-9+.-]*:/i.test(clean_) || clean_.startsWith('//')) return null
  const parts = (clean_.startsWith('/') ? clean_ : `${path.posix.dirname(sheetRel)}/${clean_}`).split('/')
  const out = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (!out.length) return null
      out.pop()
    } else out.push(p)
  }
  return out.join('/')
}

// ------------------------------------------------------------------ reader plumbing
/**
 * `reader` contract: read(rel) → { text } | { error } | null (absent); has(rel) → a file is there; list(dirRel) → the
 * files directly in it. All paths are below the Joomla root. A missing method is an evidence gap, not a pass.
 */
function readFacts(ctx, rel, less) {
  if (ctx.facts.has(rel)) return ctx.facts.get(rel)
  const r = ctx.reader.read(rel)
  let out
  if (r === null || r === undefined) out = { rel, state: ctx.reader.has(rel) ? 'unreadable' : 'absent' }
  else if (r.error !== undefined) out = { rel, state: 'unreadable', error: r.error }
  else out = { rel, state: 'ok', ...cssFacts(r.text, { less }) }
  ctx.facts.set(rel, out)
  return out
}

/** The first of local/<rel> then <rel> that exists under the template (T4's Path::findInTheme). */
function inTheme(ctx, tpl, rel) {
  for (const base of ['local/', '']) {
    const full = `templates/${tpl}/${base}${rel}`
    const r = ctx.reader.read(full)
    if (r !== null && r !== undefined) return { rel: full, read: r }
    if (ctx.reader.has(full)) return { rel: full, read: { error: 'present but not readable' } }
  }
  return null
}

// ------------------------------------------------------------------ loaders (shared by T4 and T3)
/** Sheets reached from `rels` by relative @import, `rels` first (bounded). */
function sheetsFrom(ctx, rels, { lessSheets = false } = {}) {
  const out = []
  const seen = new Set()
  const visit = (rel, depth) => {
    if (seen.has(rel) || seen.size >= MAX_CSS_FILES) return
    seen.add(rel)
    const f = readFacts(ctx, rel, lessSheets || rel.endsWith('.less'))
    out.push(f)
    if (f.state !== 'ok' || depth >= MAX_IMPORT_DEPTH) return
    for (const imp of f.imports) {
      const target = resolveSheetUrl(rel, imp)
      if (target && /\.(css|less)$/i.test(target)) visit(target, depth + 1)
    }
  }
  for (const r of rels) visit(r, 0)
  return out
}

/** Does any sheet load `family`? → { provides, via?, missing? } — a @font-face needs a src that exists (or is external). */
function sheetsProvide(ctx, sheets, family) {
  let missing = null
  for (const s of sheets) {
    if (s.state !== 'ok') continue
    for (const url of s.imports) {
      if (isExternal(url) && familiesOfFontUrl(url).some((n) => same(n, family))) return { provides: true, via: { kind: 'css-import', sheet: s.rel, url: url.slice(0, 300) } }
    }
    for (const ff of s.fontFaces) {
      if (!same(ff.family, family)) continue
      const present = []
      const absent = []
      for (const u of ff.srcs) {
        if (/^data:/i.test(u) || isExternal(u)) present.push(u.slice(0, 120))
        else {
          const rel = resolveSheetUrl(s.rel, u)
          ;(rel && ctx.reader.has(rel) ? present : absent).push(rel ?? u)
        }
      }
      if (present.length) return { provides: true, via: { kind: 'font-face', sheet: s.rel, files: present.slice(0, 4) } }
      missing = { sheet: s.rel, files: absent.slice(0, 4) }
    }
  }
  return { provides: false, missing }
}

// ------------------------------------------------------------------ T4
function resolveProfile(ctx, tpl, group, requested, gaps) {
  const names = unique([requested || 'default', 'default'])
  let first = true
  for (const name of names) {
    if (!SAFE_PROFILE.test(name) || name.includes('..')) {
      gaps.push(`${tpl}: ${group} profile ${JSON.stringify(name)} is not a plain file name; not read`)
      first = false
      continue
    }
    const found = inTheme(ctx, tpl, `etc/${group}/${name}.json`)
    if (found?.read.error !== undefined) {
      gaps.push(`${found.rel}: ${found.read.error}`)
      return { profile: name, requested, file: found.rel, data: {}, unreadable: true, fellBack: !first }
    }
    const content = found?.read.text ?? ''
    if (content !== '' && content !== '0') {
      let data = {}
      let invalid = null
      try {
        const j = JSON.parse(content)
        if (isObject(j)) data = j
        else invalid = 'is not a JSON object'
      } catch (e) {
        invalid = `is not valid JSON (${String(e.message).slice(0, 80)})`
      }
      const out = { profile: name, requested, file: found.rel, data, invalid, fellBack: !first }
      // a local/etc file replaces the etc file wholesale: say what it hides
      if (found.rel.includes('/local/etc/')) {
        const base = ctx.reader.read(found.rel.replace('/local/etc/', '/etc/'))
        if (base?.text) {
          try {
            const j = JSON.parse(base.text)
            const fams = Object.entries(isObject(j) ? j : {}).filter(([k, v]) => /_font_family$/.test(k) && phpTruthy(v))
            if (fams.length) out.shadows = { file: found.rel.replace('/local/etc/', '/etc/'), fonts: Object.fromEntries(fams.map(([k, v]) => [k, String(v)])) }
          } catch {}
        }
      }
      return out
    }
    first = false
  }
  return { profile: null, requested, file: null, data: {}, fellBack: true }
}

const T4_SHEETS = ['css/template.css', 'css/theme.css', 'css/custom.css']

function t4ActiveSheets(ctx, tpl) {
  const key = `t4sheets:${tpl}`
  if (!ctx.memo.has(key)) {
    const rels = T4_SHEETS.map((r) => inTheme(ctx, tpl, r)?.rel).filter(Boolean)
    ctx.memo.set(key, sheetsFrom(ctx, rels))
  }
  return ctx.memo.get(key)
}

/** The private/dev hosts a custom-font list was exported from map to the archive's own paths. */
function archivePathsOf(url) {
  let u
  try {
    u = new URL(url, 'https://base.invalid/')
  } catch {
    return []
  }
  const p = decodeURIComponent(u.pathname).replace(/\/{2,}/g, '/')
  const out = []
  for (const root of ['templates/', 'media/', 'images/', 'plugins/', 'modules/', 'components/', 'fonts/']) {
    const i = p.indexOf(`/${root}`)
    if (i >= 0) out.push(p.slice(i + 1))
  }
  return unique(out)
}

function customFont(ctx, tpl, family) {
  for (const file of ['customfonts.json', 'fontcustoms.json']) {
    const found = inTheme(ctx, tpl, `etc/${file}`)
    if (!found) continue
    if (found.read.error !== undefined) return { state: 'unreadable', file: found.rel, error: found.read.error }
    let j
    try {
      j = JSON.parse(found.read.text)
    } catch {
      continue
    }
    const entry = isObject(j?.fonts) ? j.fonts[family] : null
    if (!isObject(entry)) continue
    const url = String(entry.url ?? '')
    if (!url) return { state: 'missing', file: found.rel, detail: 'the entry has no url' }
    const candidates = []
    let external = false
    if (isExternal(url)) {
      let host = ''
      try {
        host = new URL(url, 'https://base.invalid/').hostname
      } catch {}
      if (PRIVATE_HOST.test(host)) candidates.push(...archivePathsOf(url))
      else external = true
    } else {
      const bare = url.replace(/[?#].*$/, '').replace(/^\/+/, '')
      candidates.push(bare, `templates/${tpl}/${bare}`)
    }
    if (external) return { state: 'external', file: found.rel, url: url.slice(0, 300) }
    const rel = candidates.find((c) => ctx.reader.has(c))
    if (!rel) return { state: 'missing', file: found.rel, detail: `${url.slice(0, 200)} resolves to no file in the source (tried ${candidates.slice(0, 3).join(', ') || 'none'})` }
    if (String(entry.type ?? '') === 'css' || /\.css$/i.test(rel)) {
      // a stylesheet loads the family only through a @font-face of that family (or an import that does) with a src that exists
      const sheets = sheetsFrom(ctx, [rel])
      if (sheets[0]?.state !== 'ok') return { state: 'unreadable', file: found.rel, error: `${rel} is not readable (${sheets[0]?.error ?? sheets[0]?.state})` }
      const got = sheetsProvide(ctx, sheets, family)
      if (!got.provides) return { state: 'missing', file: found.rel, detail: got.missing ? `${rel} declares @font-face for ${family} but none of its src files exists` : `${rel} holds no @font-face or @import for ${family}` }
    }
    return { state: 'present', file: found.rel, url: url.slice(0, 300), path: rel }
  }
  return null
}

/** How T4 gets `family` onto the page, and whether that holds: the role verdict. */
function t4Loader(ctx, tpl, family, dontGoogle) {
  const primary = primaryFamily(family)
  if (!primary || isSystemFamily(primary)) return { verdict: 'system', note: `${primary ?? family} is a keyword or system family; nothing to load` }
  const inGoogle = ctx.google ? ctx.google.has(family) : null
  const sheets = t4ActiveSheets(ctx, tpl)
  const css = sheetsProvide(ctx, sheets, primary)
  if (inGoogle === true && !dontGoogle) return { verdict: 'loaded', via: { kind: 'google', detail: `${family} is in ${GOOGLE_LIST}; T4 links fonts.googleapis.com` } }
  // every other loader is judged before the family is declared unloaded
  const custom = customFont(ctx, tpl, family)
  if (custom?.state === 'present' || custom?.state === 'external') return { verdict: 'loaded', via: { kind: custom.state === 'present' ? 'custom-font' : 'custom-font-external', file: custom.file, url: custom.url } }
  if (css.provides) return { verdict: 'loaded', via: css.via }
  // an active sheet whose text is not available may be the loader: neither a pass nor a missing loader
  const blind = sheets.find((x) => x.state === 'unreadable')
  if (blind) return { verdict: 'unverified', note: `${blind.rel} is an active style sheet and is not readable (${blind.error ?? 'text not kept'}), so whether it loads ${family} is not known` }
  if (custom?.state === 'missing') return { verdict: 'custom-font-files-missing', note: custom.detail, file: custom.file }
  if (custom?.state === 'unreadable') return { verdict: 'unverified', note: `${custom.file}: ${custom.error}` }
  if (inGoogle === true) return { verdict: 'google-disabled-no-loader', note: `dont_use_google_font is on and no custom font entry or active template sheet (${T4_SHEETS.join(', ')}) loads ${family}`, missing: css.missing }
  if (inGoogle === false) {
    return { verdict: css.missing ? 'css-font-files-missing' : 'not-in-google-list', note: `${family} is not in T4's Google font list (${GOOGLE_LIST}), has no customfonts entry and no active template sheet loads it`, missing: css.missing }
  }
  return { verdict: 'unverified', note: `the Google font list (${GOOGLE_LIST}) is not in the source, so ${family} cannot be placed` }
}

function analyzeT4Style(ctx, style, gaps) {
  const tpl = style.template
  const site = resolveProfile(ctx, tpl, 'site', style.typelist?.['typelist-site'], gaps)
  const theme = resolveProfile(ctx, tpl, 'theme', style.typelist?.['typelist-theme'], gaps)
  const merged = { ...theme.data, ...site.data }
  const dontGoogle = phpTruthy(merged.dont_use_google_font) // same per-key resolution as the families: a missing key takes the theme's, an empty one stays off
  const keys = unique([...ROLES_T4.map((r) => `${r}_font_family`), ...Object.keys(merged).filter((k) => /_font_family$/.test(k))])
  const roles = []
  const bodyValue = merged.body_font_family
  const bodySet = phpTruthy(bodyValue)
  for (const key of keys) {
    const role = key.replace(/_font_family$/, '')
    const value = merged[key]
    const from = Object.hasOwn(site.data, key) ? { file: site.file, from: 'site' } : Object.hasOwn(theme.data, key) ? { file: theme.file, from: 'theme' } : { file: null, from: 'none' }
    const r = { role, key, family: phpTruthy(value) ? String(value).trim() : '', declared: from.from === 'none' ? 'missing' : phpTruthy(value) ? 'set' : 'empty', file: from.file, from: from.from }
    if (from.from === 'site' && !phpTruthy(value) && phpTruthy(theme.data[key])) r.hidesTheme = { file: theme.file, family: String(theme.data[key]) }
    if (!r.family) {
      r.verdict = role === 'body' || !bodySet ? 'unset' : 'inherits-body'
    } else {
      Object.assign(r, t4Loader(ctx, tpl, r.family, dontGoogle))
    }
    roles.push(r)
  }
  return {
    framework: 'T4',
    profiles: { site: { requested: site.requested ?? 'default', resolved: site.profile, file: site.file, fellBack: site.fellBack, invalid: site.invalid ?? null, ...(site.shadows ? { shadows: site.shadows } : {}) }, theme: { requested: theme.requested ?? 'default', resolved: theme.profile, file: theme.file, fellBack: theme.fellBack, invalid: theme.invalid ?? null } },
    dontUseGoogleFont: dontGoogle,
    roles
  }
}

// ------------------------------------------------------------------ T3
function lessValue(vars, name, depth = 0) {
  let v = vars[name]
  if (v === undefined || depth > 6) return null
  v = v.replace(/~\s*(['"])(.*?)\1/g, '$2').replace(/!important/gi, '')
  const ref = /^@\{?([\w-]+)\}?$/.exec(v.trim())
  return ref ? lessValue(vars, ref[1], depth + 1) : v
}

function t3AssetSheets(ctx, tpl) {
  const found = inTheme(ctx, tpl, 'etc/assets.xml')
  if (!found) return { state: 'absent', files: [] }
  if (found.read.error !== undefined) return { state: 'unreadable', files: [], error: found.read.error }
  const files = []
  for (const section of found.read.text.matchAll(/<stylesheets\b[^>]*>([\s\S]*?)<\/stylesheets>/gi)) {
    for (const m of section[1].matchAll(/<file\b[^>]*>\s*([^<\s][^<]*?)\s*<\/file>/gi)) files.push(m[1])
  }
  return { state: 'ok', rel: found.rel, files }
}

// The main navigation of a T3 template: a selector that names the framework's own menu container is certainly the main menu;
// a bare `.nav` / `.navbar` / `.navbar-nav` can be any navigation block of the page, so it is only a candidate.
const T3_NAV_SELECTOR = /(?:\.t3-(?:megamenu|mainnav|navbar)|#t3-mainnav)(?![\w-])/
const NAV_CANDIDATE = /(?:\.navbar(?:-nav)?|\.nav|\.mega-nav)(?![\w-])/

/** CSS specificity of one complex selector as one comparable number. */
function specificity(sel) {
  const s = String(sel).replace(/\[[^\]]*\]/g, ' [a] ').replace(/:not\(([^)]*)\)/g, ' $1 ')
  const ids = (s.match(/#[\w-]+/g) ?? []).length
  const classes = (s.match(/\.[\w-]+|\[a\]|:(?!:)[\w-]+/g) ?? []).length
  const elements = (s.match(/::[\w-]+/g) ?? []).length
  const types = (s.replace(/#[\w-]+|\.[\w-]+|\[a\]|::?[\w-]+(?:\([^)]*\))?/g, ' ').match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length
  return ids * 10000 + classes * 100 + types + elements
}
const lastCompound = (sel) => String(sel).trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean).at(-1) ?? ''
const typeOf = (compound) => /^([a-z][a-z0-9]*)/i.exec(compound)?.[1]?.toLowerCase() ?? ''
const stateful = (sel) => /:(?!not\()[a-z-]+|::/i.test(sel)

/**
 * Which role a rule can set and how sure that is. tier: 0 = the rule targets the sampled element itself, 1 = an ancestor it inherits
 * from (an element's own rule beats inheritance whatever the specificity). certain: the selector is exactly the role's own
 * (bare `body`, bare `h1`, a selector inside the T3 main menu); anything else may or may not reach the sampled text.
 */
function classifyT3(role, sel, tag) {
  const x = sel.trim().toLowerCase().replace(/\s+/g, ' ')
  const last = lastCompound(x)
  const t = typeOf(last)
  if (role === 'body') {
    if (/^(?:body|html|html body)$/.test(x)) return { tier: 1, certain: true }
    if (x === 'p') return { tier: 0, certain: true }
    if (t === 'p') return { tier: 0, certain: false }
    if (t === 'body' || t === 'html') return { tier: 1, certain: false }
    return null
  }
  if (role === 'heading') {
    if (t !== tag) return null
    return { tier: 0, certain: x === tag }
  }
  // megamenu
  const inMenu = T3_NAV_SELECTOR.test(x)
  if (!inMenu && !NAV_CANDIDATE.test(x)) return null
  // The only forms that are certain are the menu container itself and its links as a plain descendant (`.t3-mainnav`, `.t3-mainnav a`):
  // every link of the menu is inside the container, so the rule reaches the sampled link. Anything between (`ul li a`, `section a`),
  // beside (a class, id, attribute) or after names a structure the menu may not have, and a static reading cannot tell — ambiguous.
  const structural = /^(?:\.t3-(?:megamenu|mainnav|navbar)|#t3-mainnav)(?: a)?$/.test(x)
  return { tier: t === 'a' ? 0 : 1, certain: inMenu && structural && !stateful(x) }
}

/** Walk the candidates of a role from the strongest down; the first certain one decides, uncertain ones above it are ambiguous. */
function resolveT3Role(role, rules, tag, base) {
  const cands = []
  for (const r of rules) {
    for (const sel of r.selectors) {
      const c = classifyT3(role, sel, tag)
      if (!c) continue
      const important = /!important/i.test(r.value)
      const certain = c.certain && !r.media
      cands.push({ ...c, certain, sel, value: r.value, important, spec: specificity(sel), order: r.order, file: r.file, media: r.media })
    }
  }
  cands.sort((a, b) => a.tier - b.tier || Number(b.important) - Number(a.important) || b.spec - a.spec || b.order - a.order)
  const ambiguous = []
  let primary = null
  const byTier = (n) => cands.filter((c) => c.tier === n)
  for (const tier of [0, 1]) {
    for (const c of byTier(tier)) {
      if (!primaryFamily(c.value)) continue
      if (c.certain) {
        primary = c
        break
      }
      ambiguous.push(c)
    }
    if (primary) break
  }
  if (!primary && base) primary = { sel: base.key, value: base.v, file: base.file, certain: true }
  return { primary, ambiguous }
}

/** The active sheets in cascade order: what a sheet imports comes before the sheet itself (bounded, like sheetsFrom). */
function cascadeOrder(ctx, rels) {
  const out = []
  const seen = new Set()
  const visit = (rel, depth) => {
    if (seen.has(rel) || seen.size >= MAX_CSS_FILES) return
    seen.add(rel)
    const f = readFacts(ctx, rel, rel.endsWith('.less'))
    if (f.state === 'ok' && depth < MAX_IMPORT_DEPTH) {
      for (const imp of f.imports) {
        const target = resolveSheetUrl(rel, imp)
        if (target && /\.(css|less)$/i.test(target)) visit(target, depth + 1)
      }
    }
    out.push(f)
  }
  for (const r of rels) visit(r, 0)
  return out
}

function analyzeT3Style(ctx, style, gaps) {
  const tpl = style.template
  const lessDir = `templates/${tpl}/less`
  const vars = {}
  for (const f of ['variables.less', 'vars.less']) {
    const facts = readFacts(ctx, `${lessDir}/${f}`, true)
    if (facts.state === 'unreadable') gaps.push(`${facts.rel}: ${facts.error ?? 'not readable'}`)
    if (facts.state === 'ok') Object.assign(vars, facts.vars)
  }
  // the loaders are the sheets etc/assets.xml activates (and what they import) — a file merely sitting in css/ or less/ loads nothing
  const assets = t3AssetSheets(ctx, tpl)
  if (assets.state === 'unreadable') gaps.push(`templates/${tpl}/etc/assets.xml: ${assets.error}`)
  if (assets.state === 'absent') gaps.push(`templates/${tpl}/etc/assets.xml is not in the source: the sheets T3 activates cannot be established`)
  const sheetRels = []
  const external = []
  for (const f of assets.files) {
    if (isExternal(f)) external.push(f)
    else sheetRels.push(`templates/${tpl}/${f.replace(/^\/+/, '')}`)
  }
  const sheets = sheetsFrom(ctx, sheetRels)
  // Each role's declarations come from the active sheets (cascade order) and the LESS variable the framework compiles into its
  // base rule; resolveT3Role walks them by target, !important, specificity and order, honours media conditions, and calls what a
  // static reading cannot decide ambiguous (judged below: an unloaded family there makes the evidence incomplete, not a finding).
  const lessVar = (names) => names.map((n) => ({ n, v: lessValue(vars, n) })).find((x) => x.v)
  const baseOf = (names) => {
    const v = lessVar(names)
    return v ? { v: v.v, key: `@${v.n}`, file: `${lessDir}/variables.less` } : null
  }
  const rules = []
  let order = 0
  for (const facts of cascadeOrder(ctx, sheetRels)) {
    if (facts.state !== 'ok') continue
    for (const rule of facts.rules) {
      const fam = rule.decls.findLast(([p]) => p === 'font-family')
      if (fam) rules.push({ selectors: rule.selectors, value: fam[1], media: rule.media ?? '', file: facts.rel, order: order++ })
    }
  }
  const declared = []
  const take = (role, tag, base, key) => {
    const { primary, ambiguous } = resolveT3Role(role, rules, tag, base)
    return { role, primary, ambiguous, key }
  }
  const resolved = [take('body', null, baseOf(['font-family-base'])), take('heading', 'h1', baseOf(['headings-font-family'])), take('megamenu', null, baseOf(['navbar-font-family', 'mainnav-font-family', 'megamenu-font-family']))]
  // a heading level the template styles differently from h1 is a further candidate for the heading font
  const heading = resolved[1]
  for (const tag of ['h2', 'h3']) {
    const t = resolveT3Role('heading', rules, tag, baseOf(['headings-font-family']))
    if (t.primary && heading.primary && primaryFamily(t.primary.value) !== primaryFamily(heading.primary.value)) heading.ambiguous.push({ ...t.primary, certain: false })
    heading.ambiguous.push(...t.ambiguous)
  }
  for (const r of resolved) {
    if (r.primary) {
      const name = primaryFamily(r.primary.value)
      if (name) declared.push({ role: r.role, family: name, stack: String(r.primary.value).slice(0, 200), file: r.primary.file, key: r.primary.key ?? (r.primary.sel.startsWith('@') ? r.primary.sel : `${r.primary.sel}{font-family}`), ambiguous: r.ambiguous })
    } else if (r.ambiguous.length) {
      declared.push({ role: r.role, family: '', stack: '', file: null, key: null, ambiguous: r.ambiguous })
    }
  }
  const loaderOf = (family, where) => {
    if (isSystemFamily(family)) return { verdict: 'system' }
    const ext = external.find((u) => familiesOfFontUrl(u).some((n) => same(n, family)))
    const css = sheetsProvide(ctx, sheets, family)
    if (ext) return { verdict: 'loaded', via: { kind: 'assets-xml-link', file: assets.rel, url: ext.slice(0, 300) } }
    if (css.provides) return { verdict: 'loaded', via: css.via }
    const blind = sheets.find((x) => x.state === 'unreadable')
    if (blind) return { verdict: 'unverified', note: `an active sheet (${blind.rel}) is not readable, so whether it loads ${family} is not known` }
    return {
      verdict: css.missing ? 'css-font-files-missing' : 'not-loaded',
      note: `${family} is declared in ${where} but neither etc/assets.xml nor an active template sheet loads it`,
      missing: css.missing
    }
  }
  const roles = []
  for (const d of declared) {
    // declarations a static reading cannot place (an ancestor-conditioned selector, a media condition, a bare nav selector):
    // a family nothing loads there cannot be called a finding, but the evidence is not complete either
    const ambiguous = []
    for (const c of d.ambiguous ?? []) {
      const family = primaryFamily(c.value)
      if (!family) continue
      const v = loaderOf(family, c.file)
      ambiguous.push({ family, file: c.file, selector: c.sel, media: c.media || null, verdict: v.verdict })
      if (!['loaded', 'system'].includes(v.verdict)) gaps.push(`style #${style.id} ${d.role}: ${c.file} \`${c.sel}\`${c.media ? ` (${c.media})` : ''} sets "${family}", which no active sheet loads; whether it reaches the ${d.role} text cannot be decided statically (the browser reading judges it)`)
    }
    if (!d.family) continue
    const r = { role: d.role, key: d.key, family: d.family, stack: d.stack, declared: 'set', file: d.file, from: 'template', ...(ambiguous.length ? { ambiguous } : {}) }
    Object.assign(r, loaderOf(d.family, d.file))
    // a rule that outranks this one and may reach the sampled text can replace it: a family nothing loads is then not a definitive finding
    if (ambiguous.length && !['loaded', 'system', 'unverified'].includes(r.verdict)) {
      const over = ambiguous[0]
      Object.assign(r, { verdict: 'unverified', note: `${d.family} (${d.file}) is not loaded, but ${over.file} \`${over.selector}\`${over.media ? ` (${over.media})` : ''} outranks it and may reach the ${d.role} text; whether it is overridden cannot be decided statically` })
    }
    roles.push(r)
  }
  // the main menu is a role of its own: one that declares no family inherits the body's (or T3's base) — reported, never skipped
  if (!roles.some((r) => r.role === 'megamenu')) roles.push({ role: 'megamenu', key: 'main-menu{font-family}', family: '', declared: 'missing', file: null, from: 'none', verdict: roles.some((r) => r.role === 'body') ? 'inherits-body' : 'inherits-base' })
  const note = roles.some((r) => r.role === 'body') ? {} : { note: `templates/${tpl} declares no body font-family in its LESS variables or active sheets; it inherits the T3 base typography, which only the browser reading judges` }
  return { framework: 'T3', profiles: null, assetsXml: assets.rel ?? null, roles, ...note }
}

// ------------------------------------------------------------------ used styles
// a published site item whose type can answer a request: a heading, separator, URL or container never renders a page.
// An alias redirects to its target, so a style only an alias names is examined but needs no browser page of its own.
const NON_ROUTABLE = new Set(['heading', 'separator', 'url', 'container', ''])
const ROUTABLE_ITEM = (m) => String(m.client_id ?? '0') === '0' && String(m.published) === '1' && !NON_ROUTABLE.has(String(m.type ?? ''))

/** Which site styles pages render with: the default style(s) and the style of every published component item. */
export function usedStyles(styles, menu) {
  const gaps = []
  const used = new Map()
  const routes = []
  const note = (style, how, item) => {
    const u = used.get(style.id) ?? { items: 0, pages: 0, default: false, languageDefault: false, examples: [] }
    if (how === 'item' || how === 'alias') {
      u.items++
      if (how === 'item') u.pages++
      if (u.examples.length < 3) u.examples.push(item.path || item.alias || `#${item.id}`)
    } else if (how === 'default') u.default = true
    else if (how === 'language') u.languageDefault = true
    used.set(style.id, u)
  }
  const site = (styles ?? []).filter((s) => s.client === 'site')
  const defaults = site.filter((s) => s.home === '1')
  if (!defaults.length) gaps.push('no default site template style (home = 1) in the database')
  for (const s of defaults) note(s, 'default')
  for (const s of site.filter((x) => x.home && x.home !== '0' && x.home !== '1')) note(s, 'language')
  if (!menu) {
    gaps.push('menu items unknown: which template style each page renders with is not decided — every site style is examined')
    for (const s of site) if (!used.has(s.id)) note(s, 'unknown')
    return { used, gaps, menuKnown: false, routes }
  }
  const addRoute = (item, styleId) => {
    if (item.home !== '1' && item.path && routes.length < 400) routes.push({ id: item.id, path: item.path, styleId })
  }
  for (const item of menu.filter(ROUTABLE_ITEM)) {
    const alias = item.type === 'alias'
    const id = String(item.template_style_id ?? '0')
    if (id === '0' || id === '') {
      for (const s of defaults) note(s, 'default')
      if (defaults[0] && !alias) addRoute(item, defaults[0].id)
      continue
    }
    const s = site.find((x) => x.id === id)
    if (s) {
      note(s, alias ? 'alias' : 'item', item)
      if (!alias) addRoute(item, s.id)
    } else gaps.push(`menu item #${item.id} names template style ${id}, which is not a site style in the database`)
  }
  return { used, gaps, menuKnown: true, routes }
}

// ------------------------------------------------------------------ findings from verdicts
const FINDING_CODE = {
  'google-disabled-no-loader': 'google-font-disabled-no-loader',
  'not-in-google-list': 'family-never-loaded',
  'custom-font-files-missing': 'custom-font-files-missing',
  'css-font-files-missing': 'font-files-missing',
  'not-loaded': 'family-never-loaded'
}
const slug = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_')

/** Findings are a function of the style verdicts: recomputed by the gate, never read back from a report. */
export function staticFindings(styles) {
  const out = []
  for (const st of styles) {
    if (!st.roles) continue
    const where = { id: st.id, title: st.title, template: st.template }
    const prof = st.profiles ? `site profile ${st.profiles.site.resolved ?? 'none'}, theme profile ${st.profiles.theme.resolved ?? 'none'}` : 'T3 sources'
    const unsetRoles = st.roles.filter((r) => r.verdict === 'unset')
    const body = st.roles.find((r) => r.role === 'body')
    if (unsetRoles.some((r) => r.role === 'body')) {
      const r = body
      const hidden = st.roles.filter((x) => x.hidesTheme).map((x) => `${x.key} is "" in ${x.file} and hides "${x.hidesTheme.family}" from ${x.hidesTheme.file}`)
      const sh = st.profiles?.site.shadows
      if (sh) hidden.push(`${st.profiles.site.file} replaces ${sh.file} wholesale (no per-key merge) and hides ${Object.entries(sh.fonts).map(([k, v]) => `${k}="${v}"`).join(', ')}`)
      out.push({
        kind: FINDING_KIND,
        source: 'static',
        code: 'font-family-unset',
        key: `${FINDING_KIND}:static:${slug(st.template)}:style-${st.id}:body:font-family-unset`,
        style: where,
        role: 'body',
        file: r.file ?? st.profiles?.site.file ?? `templates/${st.template}/etc/site/default.json`,
        jsonKey: r.key,
        family: '',
        message: `SOURCE template ${st.template} (style #${st.id} "${st.title ?? ''}", ${prof}) declares no body font: ${r.key} is ${r.declared === 'missing' ? 'missing' : 'empty'}${r.file ? ` in ${r.file}` : ` in ${st.profiles?.site.file ?? 'any profile file'}`}${st.profiles?.site.invalid ? ` (the file ${st.profiles.site.invalid})` : ''}, so T4 omits --body-font-family and the page renders in the browser default serif${unsetRoles.length > 1 ? `; also unset: ${unsetRoles.filter((x) => x.role !== 'body').map((x) => x.key).join(', ')}` : ''}${hidden.length ? `; ${hidden.join('; ')}` : ''}`
      })
    }
    for (const r of st.roles) {
      const code = FINDING_CODE[r.verdict]
      if (!code) continue
      out.push({
        kind: FINDING_KIND,
        source: 'static',
        code,
        key: `${FINDING_KIND}:static:${slug(st.template)}:style-${st.id}:${slug(r.role)}:${code}`,
        style: where,
        role: r.role,
        file: r.file ?? null,
        jsonKey: r.key,
        family: r.family,
        message: `SOURCE template ${st.template} (style #${st.id} "${st.title ?? ''}", ${prof}): ${r.key} = "${r.family}" in ${r.file ?? 'the template'} — ${r.note ?? r.verdict}`
      })
    }
  }
  return out
}

// ------------------------------------------------------------------ static analysis
/**
 * @param {object} p
 * @param {{dir: string, framework: string}[]} p.templates  site templates with the framework their files show
 * @param {object[]|null} p.styles  {id, template, client, home, title, typelist?}
 * @param {object[]|null} p.menu  {id, path, alias, type, published, template_style_id, client_id}
 * @param {object} p.reader  see readFacts
 * @param {string|null} [p.googleListText]  text of GOOGLE_LIST, null when the source does not ship it
 */
export function analyzeStatic({ templates, styles, menu, reader, googleListText = null, gaps: inherited = [], identity = null }) {
  const gaps = [...inherited]
  // every file the analysis reads or probes is digested: the report names the exact inputs its verdicts rest on
  const seen = new Map()
  const digest = (t) => createHash('sha256').update(String(t)).digest('hex')
  const watched = {
    read(rel) {
      const r = reader.read(rel)
      seen.set(`read ${rel}`, r === null || r === undefined ? 'absent' : r.error !== undefined ? 'unreadable' : digest(r.text))
      return r
    },
    has(rel) {
      const h = reader.has(rel)
      let state = h ? 'present' : 'absent'
      // a font file is bound by its bytes: a changed font under the same name is another source
      if (h && FONT_FILE.test(rel) && reader.digest) {
        const d = reader.digest(rel)
        if (d?.sha256) state = `sha256 ${d.sha256}`
        else {
          state = 'bytes not digested'
          gaps.push(`${rel}: a font file whose bytes could not be digested (${d?.error ?? 'unreadable'}); the report cannot be bound to it`)
        }
      }
      seen.set(`has ${rel}`, state)
      return h
    },
    ...(reader.list ? { list: (dir) => ((r) => (seen.set(`list ${dir}`, digest(JSON.stringify(r))), r))(reader.list(dir)) } : {})
  }
  const ctx = { reader: watched, facts: new Map(), memo: new Map(), google: null, gaps }
  let google = { available: false, count: 0, source: GOOGLE_LIST }
  if (googleListText !== null) {
    try {
      const list = JSON.parse(googleListText)
      if (!Array.isArray(list)) throw new Error('not a list')
      ctx.google = new Set(list.map((f) => f?.name).filter((n) => typeof n === 'string'))
      google = { available: true, count: ctx.google.size, source: GOOGLE_LIST }
    } catch (e) {
      gaps.push(`${GOOGLE_LIST}: ${e.message}`)
    }
  }
  const out = []
  if (!styles) {
    gaps.push('template styles unknown: which template drives each page is not decided')
    return finish(out, gaps, google, menu !== null, [], identity, seen)
  }
  const { used, gaps: useGaps, menuKnown, routes } = usedStyles(styles, menu)
  gaps.push(...useGaps)
  for (const s of styles.filter((x) => x.client === 'site').sort((a, b) => Number(a.id) - Number(b.id) || cmp(a.id, b.id))) {
    const u = used.get(s.id)
    const row = { id: s.id, title: s.title ?? null, template: s.template, used: Boolean(u), usedBy: u ?? null }
    out.push(row)
    if (!u) continue
    if (!SAFE_DIR.test(String(s.template)) || /^\.+$/.test(String(s.template))) {
      gaps.push(`style #${s.id}: template name ${JSON.stringify(s.template)} is not a plain directory name; not read`)
      continue
    }
    const t = templates.find((x) => x.dir === s.template)
    if (!t) {
      gaps.push(`style #${s.id} names template ${s.template}, which is not in the source`)
      continue
    }
    const local = []
    if (t.framework === 'T4') Object.assign(row, analyzeT4Style(ctx, s, local))
    else if (t.framework === 'T3') Object.assign(row, analyzeT3Style(ctx, s, local))
    else {
      Object.assign(row, { framework: t.framework, roles: null, notAssessed: `${t.framework} templates are measured in the browser only` })
      continue
    }
    gaps.push(...local)
    for (const r of row.roles) {
      if (r.verdict === 'unverified') gaps.push(`style #${s.id} ${r.key}: ${r.note}`)
    }
  }
  return finish(out, gaps, google, menuKnown, routes, identity, seen)
}

/** The default style leaves its body family undeclared: the page-map has no body font to record, and the source-font gate (not the page-map check) owns that fault. */
export function bodyFontUndeclared(staticReport) {
  const st = (staticReport?.styles ?? []).find((x) => x.usedBy?.default && x.roles)
  return Boolean(st?.roles.some((r) => r.role === 'body' && r.verdict === 'unset'))
}

/**
 * What a browser measurement must have been planned from: the source's identity, the styles and routes pages render
 * with, and the EFFECTIVE font report (profile files, families, loaders, verdicts) — so a measurement taken before a
 * font, loader or profile changed no longer matches. Recomputed from the report by the gate, never read back from it.
 */
export function staticFingerprint(report) {
  const canon = {
    identity: report.identity ?? null,
    inputs: report.inputs?.sha256 ?? null,
    styles: (report.usedStyles ?? []).map((u) => [String(u.id), u.template, Boolean(u.default), Boolean(u.aliasOnly)]),
    routes: (report.menuRoutes ?? []).map((r) => [String(r.id), r.path, String(r.styleId)]),
    fonts: (report.styles ?? [])
      .filter((x) => x.used)
      .map((x) => [String(x.id), x.profiles ? [x.profiles.site.file, x.profiles.theme.file] : null, (x.roles ?? []).map((r) => [r.role, r.key, r.family, r.file ?? null, r.from, r.verdict, r.via ?? null, r.missing ?? null, r.ambiguous ?? null]), x.dontUseGoogleFont ?? null])
  }
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex')
}

function finish(styles, gaps, google, menuKnown, menuRoutes, identity, seen = new Map()) {
  const inputs = { count: seen.size, sha256: createHash('sha256').update(JSON.stringify([...seen].sort((a, b) => cmp(a[0], b[0])))).digest('hex') }
  const findings = staticFindings(styles)
  const usedStyles = styles.filter((s) => s.used).map((s) => ({ id: s.id, title: s.title, template: s.template, framework: s.framework ?? null, default: Boolean(s.usedBy?.default), aliasOnly: !s.usedBy?.default && !s.usedBy?.languageDefault && !s.usedBy?.pages && s.usedBy?.items > 0 }))
  const report = {
    schema: STATIC_SCHEMA,
    identity: identity ?? null,
    inputs,
    complete: gaps.length === 0,
    gaps: unique(gaps).sort(),
    menuKnown,
    googleList: google,
    usedStyles,
    menuRoutes,
    styles,
    findings
  }
  return { ...report, fingerprint: staticFingerprint(report) }
}

// ------------------------------------------------------------------ readers for the two inputs
/** A reader over a quickstart container: `files` the helper's parsed map (root-relative), `members` the member paths. */
export function archiveReader(files, members) {
  const fileSet = new Set(members)
  const dirs = new Map()
  for (const m of members) {
    const i = m.lastIndexOf('/')
    const d = i < 0 ? '' : m.slice(0, i)
    if (!dirs.has(d)) dirs.set(d, [])
    dirs.get(d).push(m)
  }
  return {
    read(rel) {
      if (!fileSet.has(rel)) return null
      const v = files.get(rel)
      if (!v) return { error: 'present in the archive but its text was not kept' }
      if (v.kind === 'text') return v.error ? { error: v.error } : { text: v.text }
      return { error: 'not a text entry' }
    },
    has: (rel) => fileSet.has(rel),
    digest(rel) {
      if (!fileSet.has(rel)) return null
      const v = files.get(rel)
      return v?.kind === 'digest' && typeof v.sha256 === 'string' ? { sha256: v.sha256 } : { error: 'the archive scan kept no digest of this member' }
    },
    list: (dir) => (dirs.get(dir) ?? []).sort()
  }
}

/** A reader over from-joomla's captureReader rooted at the capture directory. */
export function captureFontReader(capture) {
  return {
    read(rel) {
      const r = capture.read(rel)
      if (r) return { text: r.text }
      return capture.exists(rel) ? { error: 'present in the capture but not readable' } : null
    },
    has: (rel) => capture.exists(rel) && !capture.isDir(rel),
    digest(rel) {
      const r = capture.read(rel)
      return r?.sha256 ? { sha256: r.sha256 } : capture.exists(rel) ? { error: 'present in the capture but its bytes were not read' } : null
    },
    list: (dir) => (capture.isDir(dir) ? capture.entries(dir).filter((e) => !e.dir).map((e) => `${dir}/${e.name}`) : [])
  }
}

// ------------------------------------------------------------------ browser judgement
const sizeOf = (v) => {
  const m = /^([\d.]+)px$/.exec(String(v ?? ''))
  return m ? Number(m[1]) : null
}
const dominant = (drawn) => [...(drawn ?? [])].sort((a, b) => b.glyphs - a.glyphs)[0] ?? null

/** Requested vs drawn for one measured role → null (fine) or { code, detail }. */
export function roleVerdict(role) {
  if (!role) return null
  const names = familyStack(role.requested)
  // only the family the stack asks for first counts: a stack that starts with a system family asks for nothing to load
  const first = names.find((n) => !isGeneric(n))
  const web = first && !isSystemFamily(first) ? first : null
  const top = dominant(role.drawn)
  if (!top) return { code: 'nothing-drawn', detail: 'no platform font was reported for the node' }
  // browser default: a stack with no family of its own (empty, `serif`, or only the engine's standard Times) drawn by the serif engine
  const named = names.filter((n) => !isGeneric(n))
  if ((!named.length || named.every((n) => DEFAULT_SERIF.has(fold(n)))) && !top.custom && SERIF_ENGINES.test(top.name) && !names.some((n) => ['sans-serif', 'monospace', 'system-ui'].includes(fold(n))))
    return { code: 'default-serif', detail: `font-family computes to ${role.requested || 'nothing'} and ${top.name} drew the text: the browser default serif` }
  if (web) {
    // the font that drew the representative glyphs (the dominant one) must be the requested family, by name, or an alias tied to THIS node:
    // the node read again with its font-family forced to the requested family drew with the same custom face
    const squash = (v) => fold(clean(v)).replace(/[\s_-]+/g, '')
    const w = squash(web)
    const t = squash(top.name)
    const byName = t === w || t.includes(w) || (t.length >= 3 && w.includes(t))
    const f = role.forced
    const alias = top.custom && f && squash(f.family) === w && f.custom && squash(f.name) === t
    if (!byName && !alias) return { code: 'web-family-not-drawn', detail: `font-family asks for "${web}" and ${top.name} drew the text` }
  }
  return null
}

function failedFontRequests(page) {
  return (page.failedRequests ?? []).filter((r) => /font/i.test(String(r.resourceType)) || /fonts\.(googleapis|gstatic|bunny)|\.(woff2?|ttf|otf|eot)(\?|$)/i.test(String(r.url)))
}

/** Findings of one measurement artifact. Pure: nothing in `m.findings` is read. */
export function judgeBrowser(m) {
  const out = []
  const add = (page, role, code, detail) =>
    out.push({
      kind: FINDING_KIND,
      source: 'browser',
      code,
      key: `${FINDING_KIND}:browser:${slug(page.route)}:${page.width}:${role}:${code}`,
      route: page.route,
      width: page.width,
      role,
      styleId: page.styleId ?? null,
      template: page.template ?? null,
      message: `SOURCE page ${page.route} at ${page.width}px (${role}): ${detail}`
    })
  for (const page of m?.pages ?? []) {
    for (const role of BROWSER_ROLES) {
      const v = roleVerdict(page.roles?.[role])
      if (v) add(page, role, v.code, v.detail)
    }
    if (page.width >= 1024) {
      const body = sizeOf(page.roles?.body?.size)
      for (const h of ['h1', 'h2', 'h3']) {
        const hs = sizeOf(page.roles?.[h]?.size)
        if (body !== null && hs !== null && hs === body) add(page, h, 'heading-size-equals-body', `${h} is ${page.roles[h].size}, the same size as the body text`)
      }
    }
    const wanted = unique(BROWSER_ROLES.flatMap((r) => familyStack(page.roles?.[r]?.requested).filter((n) => !isGeneric(n) && !isSystemFamily(n))))
    for (const req of failedFontRequests(page)) {
      const u = fold(decodeURIComponent(String(req.url).replace(/\+/g, ' '))).replace(/[\s_-]+/g, '')
      if (wanted.some((n) => u.includes(fold(n).replace(/[\s_-]+/g, '')))) add(page, 'font-request', 'font-request-failed', `${String(req.url).slice(0, 200)} failed (${req.status ?? req.error ?? 'no response'})`)
    }
  }
  return out
}

/** What a measurement must cover: home, one page per used style, a nested route, both widths, a non-empty body and heading reading. */
export function browserCoverage(m, staticReport = null, { expectedSite = null } = {}) {
  const problems = []
  if (!isObject(m) || m.schema !== BROWSER_SCHEMA || !Array.isArray(m.pages)) return ['the browser measurement is not a ' + BROWSER_SCHEMA + ' artifact']
  const pages = m.pages
  const bad = new Set() // pages that are not the page their menu assignment says: they count toward no coverage
  if (staticReport) {
    // the measurement belongs to THIS source: the effective static report it was planned from (recomputed here), and the site the pack was made from
    if (m.static?.fingerprint !== staticFingerprint(staticReport)) problems.push('the measurement was planned from another static report (fingerprint differs from the report\'s content): measure this source again with source-font-browser.mjs --static <its inventory>')
  }
  if (expectedSite) {
    let got = null
    try {
      got = new URL(String(m.site)).origin
    } catch {}
    if (got !== expectedSite) problems.push(`the measurement is of ${m.site ?? 'no site'}, the pack's source is ${expectedSite}`)
  }
  for (const u of m.unresolved ?? []) problems.push(`a required page was not measured: ${u.kind}${u.route ? ' ' + u.route : ''}${u.styleId ? ' style #' + u.styleId : ''} — ${u.why ?? 'unresolved'}`)
  if (staticReport && Array.isArray(staticReport.menuRoutes)) {
    // every measured page is the page its menu assignment says: the route, its style, and the URL that answered
    const byRoute = new Map(staticReport.menuRoutes.map((r) => [`/${r.path}`, String(r.styleId)]))
    const defaults = new Set((staticReport.usedStyles ?? []).filter((u) => u.default).map((u) => String(u.id)))
    const nestedKnown = [...byRoute.keys()].some((x) => x.slice(1).includes('/'))
    let siteOrigin = null
    try {
      siteOrigin = new URL(String(m.site)).origin
    } catch {}
    for (const p of pages) {
      const at = `${p.route} at ${p.width}px`
      const claimed = p.styleId !== null && p.styleId !== undefined
      if (p.kind === 'home') {
        if (p.route !== '/' || (defaults.size && !defaults.has(String(p.styleId)))) bad.add(p), problems.push(`${at}: the home page is route / drawn with a default style (${[...defaults].join(', ') || 'none'}), not style #${p.styleId}`)
      } else {
        // every other page is a menu route with the style its menu item says; a page that is no menu route claims no style
        if (!['style', 'nested', 'extra'].includes(p.kind)) bad.add(p), problems.push(`${at}: unknown page kind ${JSON.stringify(p.kind)}`)
        else if (byRoute.has(p.route)) {
          if (byRoute.get(p.route) !== String(p.styleId)) bad.add(p), problems.push(`${at}: the menu assigns style #${byRoute.get(p.route)} to this route, the measurement says ${claimed ? '#' + p.styleId : 'none'}`)
        } else if (p.kind === 'style' || (p.kind === 'nested' && nestedKnown)) bad.add(p), problems.push(`${at} is not a menu route of this source`)
        else if (claimed) bad.add(p), problems.push(`${at} is not a menu route of this source but claims style #${p.styleId}`)
        if (p.kind === 'nested' && !String(p.route).slice(1).includes('/')) bad.add(p), problems.push(`${at} is not a nested route`)
      }
      // the URL the browser ended on, not the one asked for: on the measured site, and exactly this route (a leading /index.php and trailing slashes aside)
      let u = null
      try {
        u = new URL(String(p.finalUrl))
      } catch {}
      const dec = (v) => {
        try {
          return decodeURIComponent(v)
        } catch {
          return v
        }
      }
      const norm = (v) => dec(String(v)).replace(/^\/index\.php(?=\/|$)/, '').replace(/\/+$/, '')
      // the page asked for, and where the browser ended: both are the route itself with no query — a menu route carries none, so a redirect
      // to the same path with one (`/?option=com_users&view=login`) is another page, whether it happened while the route was resolved or after.
      let asked = null
      try {
        asked = new URL(String(p.url))
      } catch {}
      const query = (x) => [...x.searchParams].map(([k, v]) => `${k}=${v}`).sort().join('&')
      if (!u || !asked || (siteOrigin && (u.origin !== siteOrigin || asked.origin !== siteOrigin)) || norm(u.pathname) !== norm(p.route) || norm(asked.pathname) !== norm(p.route) || query(u) !== '' || query(asked) !== '') bad.add(p), problems.push(`${at}: the URL the browser ended on (${p.finalUrl ?? 'none recorded'}) is not this route on ${siteOrigin ?? 'the measured site'}`)
    }
  }
  const widths = unique(pages.map((p) => p.width))
  for (const w of [DESKTOP_WIDTH, MOBILE_WIDTH]) if (!widths.includes(w)) problems.push(`no page was measured at ${w}px`)
  const routesAt = (w, pred) => pages.filter((p) => p.width === w && !bad.has(p) && pred(p))
  for (const w of [DESKTOP_WIDTH, MOBILE_WIDTH]) {
    if (!routesAt(w, (p) => p.kind === 'home').length) problems.push(`the home page was not measured at ${w}px`)
    if (!routesAt(w, (p) => p.kind === 'nested').length) problems.push(`no nested SEF route was measured at ${w}px`)
    for (const st of (staticReport?.usedStyles ?? []).filter((x) => !x.aliasOnly)) {
      if (!routesAt(w, (p) => !bad.has(p) && String(p.styleId) === String(st.id)).length) problems.push(`template style #${st.id} (${st.template}) has no measured page at ${w}px`)
    }
  }
  for (const p of pages) {
    const at = `${p.route} at ${p.width}px`
    if (p.status !== 200) problems.push(`${at}: answered ${p.status ?? 'nothing'}`)
    const body = p.roles?.body
    if (!body || !(body.chars > 0) || !body.drawn?.length) problems.push(`${at}: no body text was measured`)
    for (const r of BROWSER_ROLES) {
      if (p.roles?.[r] === null || p.roles?.[r] === undefined) {
        if (!(p.absent ?? []).includes(r) && r !== 'body') problems.push(`${at}: ${r} is neither measured nor declared absent`)
      } else if (!p.roles[r].drawn?.length && r !== 'body') problems.push(`${at}: ${r} has no platform-font reading`)
    }
    if (!Array.isArray(p.faces)) problems.push(`${at}: document.fonts faces were not read`)
  }
  return problems
}

// ------------------------------------------------------------------ the gate
const OPEN_DECISION = /\bstatus\s*[:=]\s*(?:open|pending|undecided)\b|\[(?:open|pending|undecided)\]|\bTBD\b/i

/** The one decision that names `key` → { decision } or { why }. Duplicates, open and ambiguous citations never waive. */
export function decisionFor(key, parsed) {
  if (!parsed) return { why: 'no DECISIONS.md was read' }
  // the key is cited whole: bounded by characters a key cannot hold, so a longer key that starts with it is another finding
  const cite = new RegExp(`(?<![A-Za-z0-9._:-])${fold(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9._:-])`)
  const hits = [...parsed.decisions.values()].filter((d) => cite.test(fold(d.text)))
  if (!hits.length) return { why: `no decision in DECISIONS.md names ${key}` }
  if (hits.length > 1) return { why: `${hits.map((h) => h.id).join(', ')} all name ${key} — the decision is ambiguous` }
  const [d] = hits
  if (parsed.duplicates.includes(d.id)) return { why: `decision ${d.id} is defined more than once` }
  if (OPEN_DECISION.test(d.text)) return { why: `decision ${d.id} is still open` }
  return { decision: d.id }
}

/**
 * The Phase 2 source-font gate. `decisionsText` is DECISIONS.md read now (null: none).
 * @returns {{ok: boolean, problems: string[], findings: object[], waived: object[]}}
 */
export function gateSourceFonts({ staticReport, browser, decisionsText = null, requireBrowser = true, expectedSite = null }) {
  const problems = []
  let parsed = null
  if (decisionsText !== null) parsed = parseDecisions(decisionsText)
  const domStatic = isObject(staticReport) && staticReport.schema === DOM_STATIC_SCHEMA
  if (!domStatic && (!isObject(staticReport) || staticReport.schema !== STATIC_SCHEMA || !Array.isArray(staticReport.styles))) {
    problems.push('source-font: the static source-font report is missing; run quickstart-inventory.mjs on the source archive and pass its sourceFonts report')
  } else {
    if (staticReport.complete !== true || (staticReport.gaps ?? []).length) problems.push(`source-font: the static evidence is incomplete — ${(staticReport.gaps ?? ['no coverage']).slice(0, 5).join('; ')}`)
    if (domStatic ? !(staticReport.pages ?? []).length : !(staticReport.usedStyles ?? []).length) problems.push(domStatic ? 'source-font: the DOM static report names no reference pages' : 'source-font: the static report names no used template style')
  }
  let findings = []
  if (!domStatic && isObject(staticReport) && Array.isArray(staticReport.styles)) findings.push(...staticFindings(staticReport.styles))
  if ((requireBrowser || browser) && !expectedSite) problems.push('source-font: the pack records no source URL (siteUrl), so the browser measurement cannot be bound to its source')
  if (requireBrowser || browser) {
    if (domStatic && !browser) problems.push('source-font: DOM browser evidence is missing; rerun the adapter with --render')
    const cover = domStatic ? domBrowserCoverage(browser, staticReport, { expectedSite }) : browserCoverage(browser, staticReport, { expectedSite })
    for (const c of cover) problems.push(`source-font: browser evidence incomplete — ${c}`)
    if (!cover.length) findings.push(...judgeBrowser(browser))
  }
  const waived = []
  const open = []
  for (const f of findings) {
    const d = decisionFor(f.key, parsed)
    if (d.decision) waived.push({ ...f, decision: d.decision })
    else open.push({ ...f, unwaived: d.why })
  }
  for (const f of open) {
    problems.push(
      `${f.key}: ${f.message}. This is a fault of the SOURCE template, not of the port: fix it in the source repository before porting, or record a decision in DECISIONS.md that names ${f.key} (${f.unwaived}).`
    )
  }
  return { ok: problems.length === 0, problems, findings: [...open, ...waived], waived }
}

/** Coverage for DOM-backed packs: each reference route at both widths, independent of Joomla menu/style planning. */
function domBrowserCoverage(m, staticReport, { expectedSite = null } = {}) {
  const problems = []
  if (!isObject(m) || m.schema !== BROWSER_SCHEMA || !Array.isArray(m.pages)) return ['the browser measurement is not a ' + BROWSER_SCHEMA + ' artifact']
  if (m.static?.fingerprint !== staticReport.fingerprint) problems.push('the measurement was planned from another DOM static report (fingerprint differs from the report\'s content): render this source again with --render')
  if (expectedSite) {
    let got = null
    try { got = new URL(String(m.site)).origin } catch {}
    if (got !== expectedSite) problems.push(`the measurement is of ${m.site ?? 'no site'}, the pack's source is ${expectedSite}`)
  }
  const key = (p) => `${p.route}\0${p.file}\0${p.width}`
  const expected = new Map(staticReport.pages.map((p) => [key(p), p]))
  const seen = new Set()
  for (const p of m.pages) {
    const at = `${p.route} at ${p.width}px`
    const ref = expected.get(key(p))
    if (!ref) problems.push(`${at}: the browser measured a page outside the DOM source report (${p.file ?? 'no file recorded'})`)
    else {
      if (seen.has(key(p))) problems.push(`${at}: the same reference page was measured more than once`)
      seen.add(key(p))
      if (p.htmlSha256 !== ref.htmlSha256) problems.push(`${at}: the measured page HTML digest does not match the DOM source report; rerun the adapter`)
      let asked = null, ended = null
      try { asked = new URL(String(p.url)) } catch {}
      try { ended = new URL(String(p.finalUrl)) } catch {}
      if (!ref.referenceUrl || !asked || !ended || asked.href !== ref.referenceUrl || ended.href !== ref.referenceUrl || (expectedSite && (asked.origin !== expectedSite || ended.origin !== expectedSite))) problems.push(`${at}: the browser URL (${p.url ?? 'none'} → ${p.finalUrl ?? 'none'}) is not the bound reference page ${ref.referenceUrl ?? '(unbound)'}`)
    }
    if (p.status !== 200) problems.push(`${at}: answered ${p.status ?? 'nothing'}`)
    const body = p.roles?.body
    if (!body || !(body.chars > 0) || !body.drawn?.length) problems.push(`${at}: no body text was measured`)
    for (const role of BROWSER_ROLES) {
      if (p.roles?.[role] == null) {
        if (!(p.absent ?? []).includes(role) && role !== 'body') problems.push(`${at}: ${role} is neither measured nor declared absent`)
      } else if (!p.roles[role].drawn?.length && role !== 'body') problems.push(`${at}: ${role} has no platform-font reading`)
    }
    if (!Array.isArray(p.faces)) problems.push(`${at}: document.fonts faces were not read`)
  }
  for (const [k, p] of expected) if (!seen.has(k)) problems.push(`a required reference page was not measured: ${p.route} (${p.file}) at ${p.width}px`)
  return problems
}

/** The spec-pack file: both reports plus the findings as the writer saw them (the gate recomputes them). */
export function buildReport({ staticReport, browser, siteUrl = null }) {
  const findings = [...(staticReport ? staticFindings(staticReport.styles ?? []) : []), ...(browser ? judgeBrowser(browser) : [])]
  return { schema: REPORT_SCHEMA, siteUrl: siteUrl ? new URL(siteUrl).origin : null, static: staticReport ?? null, browser: browser ?? null, findings: findings.map((f) => ({ key: f.key, code: f.code, source: f.source })) }
}

/** Typography the source actually draws, for the design spec: the measured readings, else null. */
export function measuredTypography(browser) {
  const home = (browser?.pages ?? []).find((p) => p.kind === 'home' && p.width === DESKTOP_WIDTH)
  if (!home) return null
  const pick = (r) => (home.roles?.[r] ? { requested: home.roles[r].requested, drawn: dominant(home.roles[r].drawn)?.name ?? null, size: home.roles[r].size ?? null } : null)
  return Object.fromEntries(BROWSER_ROLES.map((r) => [r, pick(r)]))
}

// ------------------------------------------------------------------ CLI
const USAGE = 'usage: source-font.mjs check --inventory <inventory.json> [--quickstart <id>] [--decisions DECISIONS.md] [--out report.json]'
const CHECK_VALUES = ['--inventory', '--quickstart', '--decisions', '--out']

export function checkInventory(inventory, { quickstart, decisionsText = null } = {}) {
  const results = []
  const quickstarts = (inventory.quickstarts ?? []).filter((q) => !quickstart || q.id === quickstart)
  if (!quickstarts.length) return [{ id: quickstart ?? null, ok: false, problems: [`no quickstart${quickstart ? ` ${quickstart}` : ''} in the inventory`], findings: [], waived: [] }]
  for (const q of quickstarts) {
    const sites = q.sites ?? []
    if (sites.length !== 1) {
      results.push({ id: q.id, ok: false, problems: [`source-font: ${sites.length} Joomla roots in the quickstart; which one is the source is not decided`], findings: [], waived: [] })
      continue
    }
    const g = gateSourceFonts({ staticReport: sites[0].sourceFonts, browser: null, decisionsText, requireBrowser: false })
    results.push({ id: q.id, ...g })
  }
  return results
}

async function main(argv) {
  const [cmd, ...rest] = argv
  if (cmd !== 'check') throw new UsageError(USAGE)
  const o = parseStrict(rest, { values: CHECK_VALUES })
  if (!o.has('--inventory')) throw new UsageError(`--inventory is required\n${USAGE}`)
  const inventory = JSON.parse(readFileSync(o.opt('--inventory'), 'utf8'))
  const decisionsText = o.has('--decisions') ? readSmallFile(o.opt('--decisions'), 'DECISIONS.md') : null
  const results = checkInventory(inventory, { quickstart: o.opt('--quickstart') ?? undefined, decisionsText })
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}`)
    for (const f of r.findings.filter((x) => x.decision)) console.log(`  decided ${f.decision}: ${f.key}`)
    for (const p of r.problems) console.log(`  ${p}`)
  }
  if (o.has('--out')) writeFileSync(o.opt('--out'), JSON.stringify({ results }, null, 2) + '\n')
  return results.every((r) => r.ok) ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(e instanceof UsageError ? e.message : `source-font: ${e.message}`)
      process.exit(e instanceof UsageError ? 2 : 1)
    }
  )
}
