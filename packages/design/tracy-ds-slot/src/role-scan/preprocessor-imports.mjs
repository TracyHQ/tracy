/**
 * Does a Sass/LESS source build from files outside the scan (`@import "../../../plugins/…/bootstrap"`)?
 * Then a compiled rule the scanned sources do not declare may come from there, and its literal cannot
 * be called out of sync (`twin-sync.mjs`). PURE.
 */
import { posix } from 'node:path'

/** Every `@import` / `@use` / `@forward` target of a Sass or LESS text (CSS `url()` imports skipped). */
export function importsOf(text) {
  const out = []
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  for (const m of clean.matchAll(/@(?:import|use|forward)\s*(?:\([^)]*\)\s*)?([^;]+);/g))
    for (const q of m[1].matchAll(/["']([^"']+)["']/g))
      if (!/^(https?:|\/\/|sass:)|\.css$/.test(q[1])) out.push(q[1])
  return out
}

/** The scanned file an import names (`vars` → `_vars.scss`, `vars.scss`, `vars/_index.scss`), or null. */
function resolveImport(from, target, scanned) {
  const base = posix.normalize(posix.join(posix.dirname(from), target))
  const dir = posix.dirname(base)
  const name = posix.basename(base).replace(/\.(scss|sass|less)$/, '')
  const stems = [`${dir}/${name}`, `${dir}/_${name}`, `${base}/index`, `${base}/_index`]
  for (const stem of stems)
    for (const ext of ['.scss', '.sass', '.less']) {
      const rel = (stem + ext).replace(/^\.\//, '')
      if (scanned.has(rel)) return rel
    }
  return null
}

/**
 * @param {Map<string, string>} texts scanned Sass/LESS file → its text
 * @returns {(rel: string) => { files: Set<string>, outside: boolean }} the scanned files a source is
 *   built from (itself and what it imports, transitively), and whether any import leaves the scan
 */
export function importGraph(texts) {
  const memo = new Map()
  return (rel) => {
    if (memo.has(rel)) return memo.get(rel)
    const files = new Set()
    let outside = false
    const walk = (f) => {
      if (files.has(f)) return
      files.add(f)
      for (const target of importsOf(texts.get(f) ?? '')) {
        const hit = resolveImport(f, target, texts)
        if (hit) walk(hit)
        else outside = true
      }
    }
    walk(rel)
    const out = { files, outside }
    memo.set(rel, out)
    return out
  }
}
