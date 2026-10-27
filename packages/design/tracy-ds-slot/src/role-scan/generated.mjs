/**
 * Stylesheets the template ships but does not author, told apart so --write never rewrites them (Joomla
 * conversion of Tracy Business, 15/10/2026): their bytes come from somewhere else on the next build or
 * at run time, so a role read written into them is lost. Their findings are flagged instead. Reads the
 * `.map` next to a compiled file; PURE otherwise.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

/**
 * Where a stylesheet's bytes come from when that is outside the template, or null (a string: a file
 * the template ships but does not author; `{ framework }`: compiled wholly from the framework):
 * - a run-time template with framework placeholders (`__body_font_family`, T4 `tpl/theme.tpl.css`);
 * - the file a run-time template renders (`css/theme.css` beside `tpl/theme.tpl.css`);
 * - compiled CSS whose source map names sources, none of them in the template.
 * @param {string} root @param {{ file: { rel: string, path: string, kind: string }, text: string }} p
 * @param {Map<string, string>} twins compiled CSS → its in-template source
 * @param {{ rel: string }[]} files every scanned file
 */
export function generatedOutside(root, p, twins, files) {
  if (p.file.kind !== 'css') return null
  if (/(^|[\s:,(])__[a-z][a-z0-9]*(_[a-z0-9]+)+\b/.test(p.text))
    return { framework: `${p.file.rel}, a run-time template the framework fills (__placeholders)` }
  const name = p.file.rel
    .split('/')
    .pop()
    .replace(/\.css$/i, '')
  const tpl = files.find((f) => f.rel !== p.file.rel && f.rel.endsWith(`/${name}.tpl.css`))
  if (tpl) return { framework: `${tpl.rel}, rendered by the framework at run time` }
  if (twins.has(p.file.rel)) return null
  let map = null
  try {
    map = JSON.parse(readFileSync(`${p.file.path}.map`, 'utf8'))
  } catch {
    return null
  }
  const sources = (map?.sources ?? []).map((s) =>
    relative(root, normalize(join(dirname(p.file.path), map.sourceRoot ?? '', s)))
      .split('\\')
      .join('/')
  )
  return sources.length && sources.every((s) => s.startsWith('..')) ? { framework: sources[0] } : null
}
