#!/usr/bin/env node
// Is a built theme ready for Tracy's "Customize your site" sheet? The customer answers a business
// name, a logo (light, and a dark-background one), a favicon; Tracy writes them through WordPress
// core only — `blogname`, `site_logo`, the option `tracy_logo_dark`, `site_icon` — and never edits
// the theme. So every place the theme draws the brand has to READ those, by construction:
//
//   brand-logo-php   `inc/brand-logo.php` (from src/tracy) is in the theme and functions.php loads it
//   header-brand     every header part draws the brand with a Site Logo or a Site Title block
//   logo-picture     no template part draws the logo as an Image block, an <img> or an inline <svg>
//                    (patterns are content: a clients' logo strip is not the brand)
//   sync-icon        every Site Logo block carries "shouldSyncIcon":false (else saving it in the
//                    editor overwrites the customer's site icon with the logo)
//   logo-ground      in a theme with dark mode, every Site Logo spot says its ground by class:
//                    `tracy-logo-dark` / `<prefix>-logo--dark` (dark ground: shows tracy_logo_dark,
//                    else the name), `tracy-logo-fallback` / `<prefix>-logo--light` (light ground: the
//                    name when site_logo is empty), or `tracy-logo-bare` (the name is printed beside it)
//   favicon          the theme prints no <link rel="icon"> of its own (unless only when
//                    has_site_icon() is false) and does not unhook wp_site_icon
//   title            no document-title filter that writes literal text, no <title> in a template,
//                    title-tag not removed (block themes get title-tag from core; the tab then reads
//                    the site name). A filter that reads the name (get_bloginfo) or drops a part is fine.
//   copyright        a ©/Copyright line (text, not a class name) sits in a Paragraph or Custom HTML
//                    block holding {site.title} (filled by inc/brand-logo.php; {year} for the year)
//
// A dark-mode theme with no dark-classed spot is a NOTE, not a finding: it is right only when every
// logo spot keeps one ground in both modes (JA Impact, JA Vega: navy/black headers) — the toggle test
// in a browser settles it, a file cannot.
//
// Static: reads files under --theme, loads no page. Prints what it examined; a directory that is not a
// built theme (no style.css + theme.json) is exit 2, and a theme with no header part is a finding, so
// a clean result never stands on nothing examined. Measured 08/10/2026 on the nine built themes of
// TCH packages/cms/tracy-wordpress-theme/src: six clean, three with real findings (two footer Site
// Logos without shouldSyncIcon, two demo copyright lines), no false positive left.
//
//   node scripts/review/brand-ready.mjs --theme <built theme dir> [--json]
//   exit 0 ready · 1 a finding · 2 input error
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DARK_CLASS = /(?:^|\s)(?:tracy-logo-dark|[a-z0-9_-]*[_-]logo--dark)(?:\s|$)/
const LIGHT_CLASS = /(?:^|\s)(?:tracy-logo-fallback|[a-z0-9_-]*[_-]logo--light)(?:\s|$)/
const BARE_CLASS = /(?:^|\s)tracy-logo-bare(?:\s|$)/
const LOGO_WORD = /logo|brand/i
/** A copyright line: the sign, or the word before a year (a heading titled "Copyright." is no line). */
const COPYRIGHT = /©|&copy;|&#169;|&#xa9;|\bCopyright\s+(?:\(c\)\s*)?\d{4}/g
/** A site-name token a Tracy theme fills: `{site.title}` (inc/brand-logo.php), or a theme's own `{site.*}` identity token. */
const NAME_TOKEN = /\{site\.[a-zA-Z]+\}/
const MAX_FILES = 5000
const MAX_BYTES = 4 << 20

export class InputError extends Error {}

/** Every regular file under `dir` (relative, `/`-separated), no links followed. */
function listFiles(dir) {
  const out = []
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(r)
      else if (e.isFile()) out.push(r)
      if (out.length > MAX_FILES) throw new InputError(`more than ${MAX_FILES} files under ${dir}`)
    }
  }
  walk('')
  return out.sort()
}

/** The `wp:<name>` block comments of a markup string: name, attrs (parsed), offset. */
function blocks(text) {
  const out = []
  const re = /<!--\s+wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(\s+(\{[\s\S]*?\}))?\s+(\/)?-->/g
  for (let m; (m = re.exec(text)); ) {
    let attrs = {}
    if (m[3]) {
      try {
        attrs = JSON.parse(m[3])
      } catch {
        attrs = { __raw: m[3] }
      }
    }
    out.push({ name: m[1], attrs, raw: m[3] ?? '', at: m.index, selfClosing: !!m[4] })
  }
  return out
}

/** The innermost block whose span holds offset `at`. */
function enclosing(text, at) {
  let best = null
  for (const b of blocks(text)) {
    if (b.at > at || b.selfClosing) continue
    const close = text.indexOf(`<!-- /wp:${b.name} -->`, b.at)
    if (close !== -1 && close > at && (!best || b.at > best.at)) best = { ...b, end: close }
  }
  return best
}

/** The body of the PHP function `name` in `text` (to the next top-level definition), or null. */
function callbackBody(text, name, filterAt) {
  if (!name) return null
  const start = text.search(new RegExp(`function\\s+${name}\\s*\\(`))
  if (start === -1) return null
  const rest = text.slice(start + 9)
  const next = rest.search(/\n(?:function\s|add_filter\s*\(|add_action\s*\()/)
  const end = start + 9 + (next === -1 ? rest.length : next)
  return text.slice(start, Math.max(end, Math.min(filterAt, end)))
}

/**
 * A title callback whose value is a fixed string: `return 'Minimal Blog';`, `return __( 'Home' );`,
 * `$parts['title'] = 'Home';`. A value built with the site name (or anything else read at run time) passes.
 */
function writesLiteralTitle(body) {
  const fixed = /(['"])[^'"]*[A-Za-z][^'"]*\1/.source
  const wrap = (v) => `(?:esc_html__|esc_attr__|__|esc_html)?\\s*\\(?\\s*${v}\\s*(?:,\\s*(['"])[^'"]*\\2\\s*)?\\)?\\s*;`
  return new RegExp(`return\\s+${wrap(fixed)}`).test(body) || new RegExp(`\\[\\s*['"](?:title|site)['"]\\s*\\]\\s*=\\s*${wrap(fixed)}`).test(body)
}

/**
 * Check one built theme directory.
 * @returns {{ findings: {rule:string,file:string,detail:string}[], notes: string[], examined: Record<string, number> }}
 */
export function brandReady(themeDir) {
  let st
  try {
    st = fs.statSync(themeDir)
  } catch {
    throw new InputError(`--theme ${themeDir}: not found`)
  }
  if (!st.isDirectory()) throw new InputError(`--theme ${themeDir}: not a directory`)
  const files = listFiles(themeDir)
  const read = (rel) => {
    const p = path.join(themeDir, rel)
    if (fs.statSync(p).size > MAX_BYTES) throw new InputError(`${rel}: larger than ${MAX_BYTES} bytes`)
    return fs.readFileSync(p, 'utf8')
  }
  if (!files.includes('style.css') || !files.includes('theme.json')) throw new InputError(`--theme ${themeDir}: no style.css + theme.json (is this the built theme?)`)

  const findings = []
  const notes = []
  const add = (rule, file, detail) => findings.push({ rule, file, detail })
  const markup = files.filter((f) => /^(parts|templates)\/[^/]+\.html$/.test(f) || /^patterns\/[^/]+\.(php|html)$/.test(f))
  const parts = markup.filter((f) => f.startsWith('parts/'))
  const code = files.filter((f) => f.endsWith('.php'))
  const examined = { files: files.length, markup: markup.length, php: code.length, siteLogos: 0, headerParts: 0 }

  // brand-logo-php
  const fn = files.includes('functions.php') ? read('functions.php') : ''
  if (!files.includes('inc/brand-logo.php')) add('brand-logo-php', 'inc/brand-logo.php', 'missing — build the theme from src/tracy, which ships it')
  if (!/require(?:_once)?\s*\(?[^;]*inc\/brand-logo\.php/.test(fn)) add('brand-logo-php', 'functions.php', 'does not require inc/brand-logo.php')

  // dark mode: the theme's styles say light-dark() or a data-theme hook
  const styleFiles = files.filter((f) => f === 'theme.json' || /\.(css|json)$/.test(f) || f.startsWith('styles/'))
  const darkMode = styleFiles.some((f) => /light-dark\(|data-theme/.test(read(f)))
  let darkSpots = 0

  for (const f of markup) {
    const text = read(f)
    for (const b of blocks(text)) {
      const cls = String(b.attrs.className ?? '')
      if (b.name === 'site-logo') {
        examined.siteLogos++
        if (b.attrs.shouldSyncIcon !== false) add('sync-icon', f, `Site Logo "${cls}" lacks "shouldSyncIcon":false`)
        if (DARK_CLASS.test(cls)) darkSpots++
        else if (darkMode && !LIGHT_CLASS.test(cls) && !BARE_CLASS.test(cls))
          add('logo-ground', f, `Site Logo "${cls}" says no ground: class it tracy-logo-dark / <prefix>-logo--dark, tracy-logo-fallback / <prefix>-logo--light, or tracy-logo-bare`)
      }
      if (b.name === 'image' && f.startsWith('parts/') && LOGO_WORD.test(`${cls} ${b.attrs.alt ?? ''}`))
        add('logo-picture', f, `an Image block "${cls}" draws a logo: use a Site Logo block`)
    }
    if (f.startsWith('parts/')) {
      for (const m of text.matchAll(/<svg\b[^>]*>/g)) if (LOGO_WORD.test(m[0])) add('logo-picture', f, 'an inline <svg> logo: use a Site Logo block')
      for (const m of text.matchAll(/<a\b[^>]*>\s*<svg\b/g)) if (LOGO_WORD.test(m[0])) add('logo-picture', f, 'a link to an inline <svg> logo: use a Site Logo block')
      // `data-tracy-identity` pictures are filled by the Claude Cowork identity door (Tracy Business), not demo bytes.
      for (const m of text.matchAll(/<img\b[^>]*>/g))
        if (/class="[^"]*(logo|brand)/i.test(m[0]) && !/wp-block-site-logo|custom-logo|data-tracy-identity/.test(m[0])) add('logo-picture', f, 'an <img> logo: use a Site Logo block')
    }
    if (/<title\b/i.test(text) && !f.startsWith('patterns/')) add('title', f, 'a <title> in a template: core prints the site name (title-tag)')
    // Text only: tags and block comments are blanked (same length, offsets kept), so class="copyright" is no line.
    const textOnly = text.replace(/<[^>]*>/g, (t) => ' '.repeat(t.length))
    for (const m of textOnly.matchAll(COPYRIGHT)) {
      const b = enclosing(text, m.index)
      const span = b ? text.slice(b.at, b.end) : ''
      if (!b || !['paragraph', 'html'].includes(b.name)) add('copyright', f, `"${m[0]}" outside a Paragraph/Custom HTML block: {site.title} is filled only there`)
      else if (!NAME_TOKEN.test(span)) add('copyright', f, `a ${b.name} block with "${m[0]}" and no {site.title}: the customer's name never reaches it`)
    }
  }

  for (const f of parts.filter((p) => /^parts\/header[^/]*\.html$/.test(p))) {
    examined.headerParts++
    const names = new Set(blocks(read(f)).map((b) => b.name))
    if (!names.has('site-logo') && !names.has('site-title')) add('header-brand', f, 'no Site Logo or Site Title block: the customer\'s logo and name have nowhere to show')
  }
  if (!examined.headerParts) add('header-brand', 'parts/', 'no header part (parts/header*.html)')

  for (const f of code) {
    const text = read(f)
    for (const m of text.matchAll(/rel=\\?["']?(?:shortcut\s+)?icon\b|apple-touch-icon/gi))
      if (!/has_site_icon\s*\(/.test(text)) add('favicon', f, `prints "${m[0]}" itself: the favicon is core's site_icon`)
    if (/remove_action\s*\(\s*['"]wp_head['"]\s*,\s*['"]wp_site_icon['"]/.test(text)) add('favicon', f, 'unhooks wp_site_icon')
    for (const m of text.matchAll(/add_filter\s*\(\s*['"](pre_get_document_title|document_title_parts|wp_title)['"]\s*,\s*['"]?([A-Za-z0-9_]*)/g)) {
      const body = callbackBody(text, m[2], m.index)
      if (body === null) add('title', f, `filters ${m[1]} with a callback this check cannot read: name it as a function`)
      else if (writesLiteralTitle(body)) add('title', f, `${m[2]} writes literal text into the ${m[1]} title: the tab must read the site name`)
    }
    if (/remove_theme_support\s*\(\s*['"]title-tag['"]/.test(text)) add('title', f, 'removes title-tag')
  }

  if (!examined.siteLogos) notes.push('no Site Logo block: the customer\'s logo shows nowhere (the name does, through Site Title)')
  else if (darkMode && !darkSpots)
    notes.push('dark mode and no dark-ground Site Logo spot: right only when every spot keeps one ground in both modes (check with review/toggle-test.mjs)')
  return { findings, notes, examined, darkMode }
}

function main(argv) {
  const i = argv.indexOf('--theme')
  const theme = i === -1 ? null : argv[i + 1]
  if (!theme) {
    console.error('usage: brand-ready.mjs --theme <built theme dir> [--json]')
    return 2
  }
  let r
  try {
    r = brandReady(theme)
  } catch (e) {
    console.error(`brand-ready: ${e.message}`)
    return 2
  }
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else {
    for (const f of r.findings) console.log(`${f.rule} · ${f.file} · ${f.detail}`)
    for (const n of r.notes) console.error(`note: ${n}`)
    const e = r.examined
    console.error(`brand-ready: ${r.findings.length} finding(s) · examined ${e.files} files, ${e.markup} markup, ${e.php} php, ${e.headerParts} header part(s), ${e.siteLogos} Site Logo block(s); dark mode ${r.darkMode ? 'yes' : 'no'}`)
  }
  return r.findings.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2))
