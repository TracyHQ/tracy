#!/usr/bin/env node
// Inventory a design-source folder: every file hashed, every HTML page classified, every asset
// reference resolved. Output is the evidence that the source was read whole and left untouched.
//
//   node tools/inventory.mjs <source-dir> <out-dir>
//
// Writes <out-dir>/source-inventory.json and <out-dir>/assets.json. Exit 1 when an asset
// reference points at a file that does not exist -- a broken reference in the source is a
// content gap to record, not something to invent around.
//
// Two source shapes are recognised:
//   - "dc-canvas": Claude Design canvas export (<x-dc> + a `text/x-dc` data script). The page
//     shown is the `state.page` literal in that script; the locale is `get lang()`.
//   - "html": plain HTML. Page = file, locale = <html lang> or the folder name.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [, , srcArg, outArg] = process.argv
if (!srcArg || !outArg) {
  console.error('usage: inventory.mjs <source-dir> <out-dir>')
  process.exit(2)
}
const SRC = path.resolve(srcArg)
const OUT = path.resolve(outArg)
mkdirSync(OUT, { recursive: true })

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const files = walk(SRC).sort()
const inventory = { source: SRC, generatedAt: new Date().toISOString(), files: [], pages: [], totals: {} }
const byRel = new Map()
for (const f of files) {
  const rel = path.relative(SRC, f)
  const buf = readFileSync(f)
  const entry = { path: rel, bytes: buf.length, sha256: sha256(buf), ext: path.extname(f).toLowerCase() }
  inventory.files.push(entry)
  byRel.set(rel, entry)
}

const assets = { generatedAt: new Date().toISOString(), refs: [], unresolved: [], unreferenced: [] }
const referenced = new Set()

for (const entry of inventory.files) {
  if (entry.ext !== '.html') continue
  const html = readFileSync(path.join(SRC, entry.path), 'utf8')
  const page = { file: entry.path, sha256: entry.sha256, kind: 'html', locale: null, page: null, title: null }
  const title = html.match(/<title>([^<]*)<\/title>/)
  if (title) page.title = title[1].trim()
  const dc = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)
  if (dc) {
    page.kind = 'dc-canvas'
    const st = dc[1].match(/state\s*=\s*\{\s*page:\s*'([a-z0-9-]+)'/)
    const lang = dc[1].match(/get lang\(\)\s*\{\s*return\s*'([a-z-]+)'/)
    page.page = st ? st[1] : null
    page.locale = lang ? lang[1] : null
    // Hash the DATA part only (before the page class) so pages sharing one script hash alike.
    const cut = dc[1].search(/^\s*class\s+\w+/m)
    page.dataScriptSha256 = sha256(cut >= 0 ? dc[1].slice(0, cut) : dc[1])
  } else {
    const lang = html.match(/<html[^>]*\blang="([a-zA-Z-]+)"/)
    page.locale = lang ? lang[1].toLowerCase() : path.dirname(entry.path).toLowerCase() || null
    page.page = path.basename(entry.path, '.html')
  }
  inventory.pages.push(page)

  // Asset references: src/href/url() that are relative paths (not template expressions).
  // Attributes AND string literals in the data script: a canvas export keeps most image
  // paths in its data objects (`img: './img/x.png'`), not in markup.
  const re =
    /(?:src|href)="(\.{1,2}\/[^"{}]+)"|url\((?:'|")?(\.{1,2}\/[^)'"]+)|['"](\.{1,2}\/[^'"\n]+\.(?:png|jpe?g|webp|gif|svg|pdf|woff2?|mp4))['"]/g
  let m
  while ((m = re.exec(html))) {
    const ref = (m[1] ?? m[2] ?? m[3]).split('#')[0].split('?')[0]
    const resolved = path.normalize(path.join(path.dirname(entry.path), ref))
    const hit = byRel.get(resolved)
    if (hit) {
      referenced.add(resolved)
      assets.refs.push({ from: entry.path, ref, resolved, sha256: hit.sha256 })
    } else {
      assets.unresolved.push({ from: entry.path, ref, resolved })
    }
  }
}

for (const entry of inventory.files) {
  if (entry.ext === '.html') continue
  if (!referenced.has(entry.path)) assets.unreferenced.push(entry.path)
}

inventory.totals = {
  files: inventory.files.length,
  bytes: inventory.files.reduce((n, f) => n + f.bytes, 0),
  html: inventory.pages.length,
  byExt: inventory.files.reduce((acc, f) => ((acc[f.ext] = (acc[f.ext] ?? 0) + 1), acc), {}),
  dataScripts: new Set(inventory.pages.map((p) => p.dataScriptSha256).filter(Boolean)).size
}
assets.totals = {
  refs: assets.refs.length,
  distinct: referenced.size,
  unresolved: assets.unresolved.length,
  unreferenced: assets.unreferenced.length
}

writeFileSync(path.join(OUT, 'source-inventory.json'), JSON.stringify(inventory, null, '\t') + '\n')
writeFileSync(path.join(OUT, 'assets.json'), JSON.stringify(assets, null, '\t') + '\n')
console.log(JSON.stringify({ ...inventory.totals, assets: assets.totals }))
if (assets.unresolved.length) {
  console.error(`${assets.unresolved.length} unresolved asset reference(s) -- see assets.json`)
  process.exit(1)
}
