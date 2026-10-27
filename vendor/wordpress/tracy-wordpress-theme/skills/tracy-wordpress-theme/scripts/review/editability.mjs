#!/usr/bin/env node
// Editability — the #1 review gate: every text a visitor reads must be changeable by the site
// owner in the admin, never baked into a theme file.
//
//   node scripts/review/editability.mjs <url> --theme <theme dir> [--min-words 3] [--allow <regex,...>]
//
// Method: collect the rendered page's visible text runs (headings, paragraphs, list items,
// buttons, links; outside script/style), then grep the theme's templates/, parts/ and
// patterns/ for each run. A run found in a template is baked chrome — a defect: templates are
// structure, and the owner reaches their text only through code. A run found in a PART is
// chrome copy the owner edits in the Site Editor (Appearance → Editor → Patterns → Template
// parts), which saves a wp_template_part override; that is the WordPress way for header and
// footer copy, so it is reported as `part` for the reviewer's eye, not as a defect — unless
// --strict-parts, for a site whose owner must never touch the Site Editor.
// A run found in a pattern file is only a defect when the page's copy still equals the
// pattern's sample text: patterns are inserted as copies and the owner edits the copy, so a
// match means nobody replaced the sample (or the section genuinely carries the same words —
// list it, let a reviewer decide). Labels the platform owns (search button, "Skip to content",
// read-more, pagination) are allowed by --allow.
//
// Where a run is drawn counts. A run whose every occurrence sits inside the post content
// (`.wp-block-post-content`) is that post's own text, edited in the block editor: it is not matched
// against templates/, so a page body saying "Nothing here yet." is not blamed on an archive
// template that says it too (issue #7). It is still matched against parts/ and patterns/ (a part or
// a pattern referenced from the content renders the file's words), and one occurrence outside the
// post content is enough for the template match. `inContent` counts the runs read that way. A 404
// page has no post: its copy belongs in a synced pattern (wp_block) the 404 template references —
// text in the database, which passes; copy written into templates/404.html is baked like any other.
//
// Prints `examined` before the verdict: a scan that saw nothing cannot pass.
//
// `checkEditability(url, opts)` is the check itself (no browser — a fetch and jsdom);
// review/scan.mjs runs it next to the dark-mode scanners. `loadTheme(dir)` reads the theme once
// for many routes and carries `fingerprint`, the hash scan.mjs keys its cache on.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { JSDOM } from 'jsdom'
import { exitOnInputError, inputDir } from '../lib/routes.mjs'

// Bump when the check logic changes: review/scan.mjs caches verdicts under this version.
export const TOOL_VERSION = 2

// The block that renders a post's own content from the database.
const POST_CONTENT = '.wp-block-post-content'

const DEFAULT_ALLOW = [
  /^skip to content$/i,
  /^search$/i,
  /^read more/i,
  /^(older|newer) posts$/i,
  /^(previous|next)( page)?$/i,
  /^all rights reserved/i,
  /^built with tracy/i
]

function readTree(themeDir, dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...readTree(themeDir, p))
    else if (/\.(html|php)$/.test(e.name))
      out.push({ file: path.relative(themeDir, p), text: fs.readFileSync(p, 'utf8') })
  }
  return out
}
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
const phpText = (t) =>
  norm(
    t
      .replace(/<\?php.*?\?>/gs, (m) => m)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' ')
  )

export function loadTheme(themeDir) {
  const templates = [
    ...readTree(themeDir, path.join(themeDir, 'templates')),
    ...readTree(themeDir, path.join(themeDir, 'parts'))
  ]
  const patterns = readTree(themeDir, path.join(themeDir, 'patterns'))
  const h = createHash('sha256')
  for (const t of [...templates, ...patterns]) h.update(t.file + '\n' + t.text + '\n')
  return {
    dir: themeDir,
    templates: templates.map((t) => ({ file: t.file, text: phpText(t.text) })),
    patterns: patterns.map((t) => ({ file: t.file, text: phpText(t.text) })),
    fingerprint: h.digest('hex')
  }
}

// Map run → { outside }: `outside` is true when some occurrence is drawn outside the post content.
function collectRunOccurrences(html, minWords = 3) {
  const doc = new JSDOM(html).window.document
  for (const el of doc.querySelectorAll('script, style, noscript, template')) el.remove()
  const runs = new Map()
  for (const el of doc.querySelectorAll(
    'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, summary, td, th, dt, dd, a, button, label'
  )) {
    const s = el.textContent.replace(/\s+/g, ' ').trim()
    if (s.split(' ').length < minWords) continue
    const outside = !el.closest(POST_CONTENT)
    runs.set(s, { outside: (runs.get(s)?.outside ?? false) || outside })
  }
  return runs
}

// { status, url, examined, inContent, baked, part, sample } — the JSON line the CLI prints.
export function judgeEditability(url, html, theme, { minWords = 3, allow = [], strictParts = false } = {}) {
  const runs = collectRunOccurrences(html, minWords)
  const examined = runs.size
  const inContent = [...runs.values()].filter((o) => !o.outside).length
  const baked = []
  const part = []
  const sample = []
  for (const [run, { outside }] of runs) {
    const n = norm(run)
    if ([...DEFAULT_ALLOW, ...allow].some((re) => re.test(run))) continue
    // Post content is not drawn by a template; a part or pattern it references still is.
    const inTpl = theme.templates.find((t) => (outside || t.file.startsWith('parts/')) && t.text.includes(n))
    if (inTpl) {
      if (inTpl.file.startsWith('parts/') && !strictParts) part.push({ run, file: inTpl.file })
      else baked.push({ run, file: inTpl.file })
      continue
    }
    const inPat = theme.patterns.find((t) => t.text.includes(n))
    if (inPat) sample.push({ run, file: inPat.file })
  }
  const status = baked.length ? 'fail' : sample.length ? 'needs-review' : 'pass'
  return { status, url, examined, inContent, baked, part, sample }
}

export async function checkEditability(url, theme, opts = {}) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 60000) })
  const html = await res.text()
  return { html, verdict: judgeEditability(url, html, theme, opts) }
}

function printEditability(v) {
  console.log(`# editability ${v.url}  [${v.examined} runs examined, ${v.inContent ?? 0} only in post content; ${v.part.length} in parts (Site Editor)]`)
  for (const b of v.baked) console.log(`  BAKED   ${b.file}  "${b.run.slice(0, 80)}"`)
  for (const s of v.sample) console.log(`  SAMPLE  ${s.file}  "${s.run.slice(0, 80)}"`)
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
if (isMain) {
  const args = process.argv.slice(2)
  const url = args[0]
  const opt = (name, def) => {
    const i = args.indexOf(name)
    return i === -1 ? def : args[i + 1]
  }
  const themeDir = exitOnInputError(() => inputDir(args, '--theme'))
  if (!url || !themeDir) {
    console.error('usage: editability.mjs <url> --theme <theme dir> [--min-words 3] [--allow r1,r2]')
    process.exit(2)
  }
  const allow = (opt('--allow', '') || '')
    .split(',')
    .filter(Boolean)
    .map((r) => new RegExp(r, 'i'))
  const { verdict } = await checkEditability(url, loadTheme(themeDir), {
    minWords: Number(opt('--min-words', '3')),
    allow,
    strictParts: args.includes('--strict-parts')
  })
  printEditability(verdict)
  console.log(JSON.stringify(verdict))
  process.exit(verdict.status === 'fail' ? 1 : verdict.status === 'needs-review' ? 3 : 0)
}
