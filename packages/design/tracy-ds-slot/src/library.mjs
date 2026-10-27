/**
 * Read a design system from the vendored libraries into a profile. The ONLY file in this package
 * that touches the disk; sources are opened read-only.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromOpenDesign, fromRefero } from './normalise.mjs'

/** Each OpenDesign system's components, read off its reference page (scripts/od-components.mjs). */
let odComponents = null
const componentsOf = (key) => {
  if (odComponents === null) {
    try {
      odComponents = JSON.parse(
        readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'od-components.json'), 'utf8')
      )
    } catch {
      odComponents = {}
    }
  }
  return odComponents[key] ?? null
}

const tokensOf = (css) => {
  const o = {}
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[A-Za-z0-9][\w-]*)\s*:\s*([^;{}]+);/g))
    if (!(m[1] in o)) o[m[1]] = m[2].trim()
  return o
}

/**
 * @param {string} root  the repo root
 * @param {string} id    `refero:<uuid>` or `od:<id>`
 */
export function loadProfile(root, id) {
  const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
  if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`bad design system id: ${id}`)
  if (kind === 'refero') {
    const dir = join(root, 'vendor/tracy/refero/systems', key)
    if (!existsSync(dir)) throw new Error(`no Refero style ${key}`)
    return fromRefero(
      JSON.parse(readFileSync(join(dir, 'design-system.json'), 'utf8')),
      JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    )
  }
  if (kind === 'od') {
    const dir = join(root, 'vendor/tracy/od-design-system/systems', key)
    if (!existsSync(join(dir, 'tokens.css'))) throw new Error(`no OpenDesign system ${key}`)
    let name = key
    try {
      name = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).name ?? key
    } catch {}
    return fromOpenDesign(
      tokensOf(readFileSync(join(dir, 'tokens.css'), 'utf8')),
      { id: key, name },
      componentsOf(key)
    )
  }
  throw new Error(`unknown design system source: ${kind}`)
}

/**
 * A template's slot contract (`templates/<name>.json`). `extends: "<name>"` starts from another
 * contract (a template family: the JA WordPress themes share tracy-base's classes); each top-level
 * key the child sets replaces the parent's, except `selectors`, merged key by key.
 */
export function loadContract(name, seen = []) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`bad template name: ${name}`)
  if (seen.includes(name)) throw new Error(`contract cycle: ${[...seen, name].join(' → ')}`)
  const own = JSON.parse(readFileSync(new URL(`../templates/${name}.json`, import.meta.url), 'utf8'))
  const palette = paletteOf(name)
  const withPalette = (/** @type {any} */ c) => (palette ? { ...c, autoPalette: palette } : c)
  if (!own.extends) return withPalette(own)
  const parent = loadContract(own.extends, [...seen, name])
  const { extends: _, ...rest } = own
  return withPalette({ ...parent, ...rest, selectors: { ...parent.selectors, ...rest.selectors } })
}

/**
 * The template's palette read off its demo and classified by role (`auto-palette.mjs`), generated
 * into `templates/palette/<name>.json` by `apps/tracy-web/scripts/preview-check.mjs --palette`; null
 * when the template has none (a fully tokenized one: every colour already follows the system).
 * @param {string} name
 */
export function paletteOf(name) {
  try {
    return JSON.parse(readFileSync(new URL(`../templates/palette/${name}.json`, import.meta.url), 'utf8'))
  } catch {
    return null
  }
}

/**
 * The template's own 56 tokens — what stays where a system is silent. `baseSystem` (an OpenDesign
 * id) gives all 56; `baseTokensFile` (repo-relative tokens.css: a JA theme's measured look) and
 * `baseTokens` (literal values) are laid over it in that order.
 */
export function contractBase(root, contract) {
  const t = baseTokens(root, contract.baseSystem ?? 'od:apple')
  if (contract.baseTokensFile) {
    const file = String(contract.baseTokensFile)
    if (file.includes('..') || !file.endsWith('.css')) throw new Error(`bad baseTokensFile: ${file}`)
    const own = tokensOf(readFileSync(join(root, file), 'utf8'))
    for (const k of Object.keys(t)) if (own[k]) t[k] = own[k]
  }
  for (const [k, v] of Object.entries(contract.baseTokens ?? {})) if (k in t) t[k] = String(v)
  return t
}

/** The 56 tokens of an OpenDesign system, as a template's base look (`od:<id>`). */
export function baseTokens(root, systemId) {
  const key = String(systemId).replace(/^od:/, '')
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error(`bad base system: ${systemId}`)
  return tokensOf(
    readFileSync(join(root, 'vendor/tracy/od-design-system/systems', key, 'tokens.css'), 'utf8')
  )
}

// A current Chrome: Google answers it with woff2 and one @font-face per subset.
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const SUBSETS = new Set(['latin', 'latin-ext', 'vietnamese'])

/**
 * The @font-face rules a Google Fonts css2 link stands for, as theme.json `fontFace` entries — the
 * subsets a Tracy site's eight languages need (latin, latin-ext, vietnamese). I/O: one request.
 * @param {string | null} href
 */
export async function googleFontFaces(href) {
  if (!href) return []
  if (!href.startsWith('https://fonts.googleapis.com/css2?')) throw new Error('not a Google Fonts css2 link')
  const res = await fetch(href, { headers: { 'user-agent': CHROME_UA } })
  if (!res.ok) throw new Error(`Google Fonts answered ${res.status}`)
  const css = await res.text()
  const faces = []
  for (const m of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (!SUBSETS.has(m[1])) continue
    const get = (k) => new RegExp(`${k}:\\s*([^;]+);`).exec(m[2])?.[1]?.trim()
    const src = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(m[2])?.[1]
    if (!src) continue
    faces.push({
      fontFamily: (get('font-family') ?? '').replace(/^['"]|['"]$/g, ''),
      fontStyle: get('font-style') ?? 'normal',
      fontWeight: get('font-weight') ?? '400',
      src: [src],
      unicodeRange: get('unicode-range')
    })
  }
  return faces
}
