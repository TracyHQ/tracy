// The JoomlArt T3 framework layer of the Joomla adapter: a T3 template keeps its logo and its name in the params of
// its template style (`#__template_styles.params`: `logotype`, `logoimage`, `logoimage_sm`, `logofootertype`,
// `logofooterimage`, `sitename`), prints them from its block layouts (`tpls/blocks/header.php`, `off-canvas.php`,
// `footer.php`) and paints with LESS variables compiled into plain CSS (`less/variables.less`), so no CSS custom
// property carries its colours. Read-only.
import { coloursIn, cssOfColour } from '../colour-maths.mjs'
import { emptyShowsOf } from './joomla-t4.mjs'

/** Whether a template is built on T3: its manifest has a `<t3>` element or loads the T3 plugin's files. */
export const isT3 = (manifest) => /<t3\b|plugins\/system\/t3\//i.test(String(manifest ?? ''))

/** A style param that names a logo picture (`logoimage`, `logoimage_sm`, `logofooterimage`, `logoimage_dark`). */
export const T3_LOGO_KEY = /^logo[a-z]*image(?:_[a-z]+)?$/
/** A style param that switches a logo between a picture and the name as text (`logotype`, `logofootertype`). */
export const T3_LOGO_TYPE_KEY = /^logo[a-z]*type$/

/** The block layouts that print a logo, with where each prints it: the template's own, else the framework's. */
export function t3LogoLayouts(readFile, template) {
  const out = []
  for (const [where, file] of [
    ['header', 'header.php'],
    ['offcanvas', 'off-canvas.php'],
    ['footer', 'footer.php']
  ]) {
    for (const base of [
      `templates/${template}/tpls/blocks`,
      'plugins/system/t3/base-bs3/tpls/blocks',
      'plugins/system/t3/base/tpls/blocks'
    ]) {
      const php = readFile(`${base}/${file}`)
      if (php == null) continue
      out.push({
        where,
        php,
        file: base.startsWith('templates/') ? `${base}/${file}` : `t3 framework ${file}`
      })
      break
    }
  }
  return out
}

/**
 * How a layout reads one style param: `$var = <test> ? $this->params->get('key', <default>) : <else>;` or a plain
 * `$var = $this->params->get('key', <default>);`. Null when the layout never reads it.
 * @param {string} php @param {string} key
 * @returns {{variable: string, fallback: string|null, defaultFile: string|null}|null}
 */
export function t3ReadOf(php, key) {
  const text = String(php ?? '')
  const re = new RegExp(
    `\\$(\\w+)\\s*=[^;]*?->get(?:Param)?\\(\\s*['"]${key}['"]\\s*(?:,\\s*((?:[^()]|\\([^()]*\\))*?))?\\)`,
    'g'
  )
  const m = re.exec(text)
  if (!m) return null
  const fallback = m[2]?.trim() || null
  // `T3Path::getUrl('images/logo.png', ...)` or a plain quoted path: a picture of the template.
  const file = fallback ? (/['"]([^'"]+\.(?:png|jpe?g|gif|svg|webp))['"]/i.exec(fallback)?.[1] ?? null) : null
  return { variable: m[1], fallback, defaultFile: file }
}

/**
 * What a layout prints in place of a logo picture whose style param is empty. Joomla's registry hands back the
 * default of `get()` for an empty value, so a layout that names one prints that picture of the template
 * (`template-picture`, or `missing-picture` when the template has no such file); without a default the layout's own
 * `if ($var)` decides (`emptyShowsOf`). Null when the layout never reads the param.
 * @param {string} php @param {string} key @param {(rel: string) => boolean} templateHas
 */
export function t3EmptyShows(php, key, templateHas) {
  const read = t3ReadOf(php, key)
  if (!read) return null
  if (read.defaultFile) return templateHas(read.defaultFile) ? 'template-picture' : 'missing-picture'
  if (read.fallback && !/^(?:''|""|null|false|0)$/i.test(read.fallback)) return 'template-text'
  return emptyShowsOf(php, read.variable) ?? 'nothing'
}

/** Whether a layout prints the CMS site name when the style's own `sitename` is empty. */
export const t3NameFallsBack = (php) =>
  /if\s*\(\s*!\s*\$sitename\s*\)[\s\S]{0,200}?get\(\s*['"]sitename['"]\s*\)/.test(String(php ?? ''))

/**
 * The logo settings of a T3 style: every logo picture param and every logo type switch the style holds, with what
 * each layout that reads it prints when it is empty.
 * @param {{params: object, layouts: Array<{where: string, php: string, file: string}>, templateHas: (rel: string) => boolean}} o
 */
export function t3LogoSettings({ params, layouts, templateHas }) {
  return Object.entries(params ?? {})
    .filter(([k]) => T3_LOGO_KEY.test(k) || T3_LOGO_TYPE_KEY.test(k))
    .map(([key, value]) => ({
      key,
      value: String(value ?? '').split('#')[0],
      prints: layouts
        .filter((l) => t3ReadOf(l.php, key))
        .map((l) => ({
          where: l.where,
          layout: l.file,
          emptyShows: T3_LOGO_TYPE_KEY.test(key) ? null : t3EmptyShows(l.php, key, templateHas)
        }))
    }))
}

/** The LESS files a T3 template's variables come from, in the order its `vars.less` imports them (last wins). */
export function t3LessFiles(template, theme) {
  return [
    'plugins/system/t3/base-bs3/bootstrap/less/variables.less',
    'plugins/system/t3/base-bs3/less/variables.less',
    `templates/${template}/less/variables.less`,
    ...(theme ? [`templates/${template}/less/themes/${theme}/variables.less`] : [])
  ]
}

const LESS_DECL = /^\s*@([\w-]+)\s*:\s*([^;]*);/gm
const ONE_COLOUR = /^(?:#[0-9a-f]{3,8}|rgba?\([^()]*\)|hsla?\([^()]*\)|[a-z]+)$/i

/**
 * The colour variables a T3 template declares in its own LESS files, each resolved through every file it imports:
 * `[{name: '@brand-primary', value: '#da4e35', declaredIn}]`. A value computed by a LESS function (`darken(...)`) has
 * no colour here: the compiled CSS carries it, never a guess.
 * @param {Array<{file: string, text: string|null}>} files in import order
 * @param {string} template
 */
export function t3ColourVariables(files, template) {
  const raw = new Map()
  for (const { file, text } of files) {
    if (!text) continue
    const clean = String(text)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const m of clean.matchAll(LESS_DECL))
      raw.set(m[1], { value: m[2].replace(/\s+\/\/.*$/, '').trim(), file })
  }
  const resolve = (name, seen = new Set()) => {
    const v = raw.get(name)?.value
    if (v == null || seen.has(name)) return null
    seen.add(name)
    const ref = /^@([\w-]+)$/.exec(v)
    return ref ? resolve(ref[1], seen) : v
  }
  const own = `templates/${template}/`
  const out = []
  for (const [name, { file }] of raw) {
    if (!file.startsWith(own)) continue
    const v = resolve(name)
    if (!v || !ONE_COLOUR.test(v)) continue
    const c = coloursIn(v)
    if (c.length !== 1) continue
    out.push({ name: `@${name}`, value: cssOfColour(c[0]), declaredIn: file })
  }
  return out
}
