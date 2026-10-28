// Index of the site's source files: template folder (incl. T4 local/etc JSON, html/ overrides),
// language .ini files (core, template, overrides), the T4 framework and mod_ja_acm.
// Each file gets an ORIGIN that decides the class of a string found only there.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { normText, letterCount } from './normalize.mjs'

const TEXT_EXT = /\.(php|ini|json|xml|html?|css|scss|less|js|svg|txt)$/i

/** origin: class + human label, from the file's path relative to the webroot. */
export function originOf(rel, template) {
  const t = template.toLowerCase()
  const p = rel.toLowerCase()
  if (p.startsWith('language/overrides/')) return { cls: 'b', label: 'language override (.ini)' }
  if (new RegExp(`^language/[^/]+/(?:[^/]+\\.)?tpl_${t}`).test(p))
    return { cls: 'b', label: 'template language file' }
  if (p.startsWith(`templates/${t}/language/`)) return { cls: 'b', label: 'template language file' }
  if (/^language\/[^/]+\/.*plg_system_t4/.test(p)) return { cls: 'c', label: 'T4 framework language string' }
  if (/^(administrator\/)?language\//.test(p))
    return { cls: 'c', label: 'Joomla core / extension language string' }
  if (p.startsWith(`templates/${t}/local/`)) return { cls: 'b', label: 'T4 local settings/layout file' }
  if (p.startsWith(`templates/${t}/etc/`)) return { cls: 'b', label: 'T4 template settings/layout (etc/)' }
  if (p.startsWith(`templates/${t}/html/`)) return { cls: 'b', label: 'template layout override (html/)' }
  if (p.startsWith(`templates/${t}/acm/`)) return { cls: 'b', label: 'ACM block layout/defaults' }
  if (p.startsWith(`templates/${t}/`)) return { cls: 'b', label: 'template file' }
  if (p.startsWith(`media/templates/site/${t}/`)) return { cls: 'b', label: 'template media file' }
  if (p.startsWith('plugins/system/t4/')) return { cls: 'c', label: 'T4 framework file' }
  if (p.startsWith('modules/mod_ja_acm/')) return { cls: 'c', label: 'mod_ja_acm module file' }
  return { cls: 'c', label: 'other core file' }
}

function walk(dir, out) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const n of names) {
    const f = join(dir, n)
    const st = statSync(f)
    if (st.isDirectory()) walk(f, out)
    else if (TEXT_EXT.test(n) && st.size < 3_000_000) out.push(f)
  }
  return out
}

/** Parse KEY="value" lines; each value keeps its fixed parts around placeholders (%s, %1$s, %sitename%). */
function iniStrings(body) {
  const out = []
  for (const m of body.matchAll(/^\s*([A-Z0-9_.-]+)\s*=\s*"((?:[^"\\]|\\.|"_QQ_")*)"/gm)) {
    const value = m[2].replace(/\\"/g, '"').replace(/"_QQ_"/g, '"')
    const parts = value
      .split(/%[a-z_]+%|%(?:\d+\$)?[sdu]/i)
      .map(normText)
      .filter((x) => letterCount(x) >= 2)
    if (parts.length)
      out.push({
        key: m[1],
        value,
        raw: value.toLowerCase(),
        parts,
        placeholders: /%[a-z_]+%|%(?:\d+\$)?[sdu]/i.test(value)
      })
  }
  return out
}

export function buildSourceIndex(webroot, template, platform = 'joomla') {
  const files = []
  const ini = []
  // WordPress: only the theme is the site's own text; wp-admin, wp-includes and plugins are core and never read.
  const wordpress = platform === 'wordpress'
  const themeDir = join(webroot, 'wp-content/themes', template)
  for (const f of walk(wordpress ? themeDir : webroot, [])) {
    const rel = relative(webroot, f).split('\\').join('/')
    // Other templates installed on the site (Cassiopeia, Atum) are not this site's front end.
    if (
      !wordpress &&
      rel.startsWith('templates/') &&
      !rel.toLowerCase().startsWith(`templates/${template.toLowerCase()}/`)
    )
      continue
    const body = readFileSync(f, 'utf8')
    const origin = wordpress ? { cls: 'b', label: 'theme file' } : originOf(rel, template)
    if (rel.endsWith('.ini')) for (const s of iniStrings(body)) ini.push({ rel, origin, ...s })
    else
      files.push({
        rel,
        origin,
        raw: body.toLowerCase().replace(/\\\//g, '/'),
        norm: normText(body.replace(/\\\//g, '/'))
      })
  }
  return { files, ini }
}

/** Language strings whose fixed parts all occur, in order, in the text; `gaps` = what the placeholders became. */
function iniHits(index, norm) {
  const hits = []
  for (const s of index.ini) {
    let at = 0
    const gaps = []
    let ok = true
    for (const part of s.parts) {
      const i = norm.indexOf(part, at)
      if (i === -1) {
        ok = false
        break
      }
      if (i > at) gaps.push(norm.slice(at, i))
      at = i + part.length
    }
    if (ok && at < norm.length) gaps.push(norm.slice(at))
    // The language string must explain most of the text, not one word of a paragraph.
    const covered = s.parts.reduce((n, p) => n + p.length, 0)
    // Without a placeholder a language string renders as itself: only equality counts.
    if (ok && !s.placeholders && (s.parts.length !== 1 || s.parts[0] !== norm)) ok = false
    // A pattern with a placeholder may wrap a long value ("Next article: <title>"): 12 fixed characters are enough.
    if (ok && covered >= (s.placeholders ? Math.min(norm.length * 0.5, 12) : norm.length * 0.5)) {
      hits.push({
        file: s.rel,
        key: s.key,
        origin: s.origin,
        value: s.value,
        exact: s.parts.length === 1 && s.parts[0] === norm,
        gaps: gaps.map((g) => g.trim()).filter((g) => letterCount(g) >= 3)
      })
    }
  }
  // Exact values first, then template/override strings (an override is what actually renders).
  const rank = (h) => (h.exact ? 0 : 2) + (h.origin.cls === 'b' ? 0 : 1)
  return hits.sort((a, b) => rank(a) - rank(b))
}

export function searchSources(index, { norm, raw }, limit = 3) {
  const out = []
  if (norm) for (const h of iniHits(index, norm).slice(0, limit)) out.push(h)
  if (raw)
    for (const s of index.ini)
      if (out.length < limit && s.raw.includes(raw))
        out.push({ file: s.rel, key: s.key, origin: s.origin, value: s.value })
  for (const f of index.files) {
    if (out.length >= limit) break
    // A short word is in every stylesheet: short needles only count as a whole word in a template markup/settings file.
    const shortOk =
      norm &&
      norm.length < 12 &&
      f.origin.cls === 'b' &&
      /\.(php|html?|json|xml)$/i.test(f.rel) &&
      new RegExp(
        `(^|[^\\p{L}\\p{N}])${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
        'u'
      ).test(f.norm)
    if ((norm && norm.length >= 12 && f.norm.includes(norm)) || shortOk || (raw && f.raw.includes(raw)))
      out.push({ file: f.rel, origin: f.origin })
  }
  return out
}
