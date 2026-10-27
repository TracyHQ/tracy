/**
 * The web fonts a release's template loads, read from its own files (LANG-2 font glyphs, TCH #1013):
 *
 *   const { local, google, used, icons } = await templateFonts(context)
 *   // local: [{ family, key, file, ranges, bytes, icon }]  a `@font-face` of the template's CSS (or a theme.json
 *   //        fontFace) whose source is a file the template ships (`bytes` null when that file is not in the release);
 *   //        `icon` when the face holds pictures, not letters (`iconFace`)
 *   // google: [{ family, key, where }]                a family the template asks of Google Fonts: a
 *   //        fonts.googleapis.com address in any of its files, or a T4 `*_font_family` setting
 *   // used:  the families a stylesheet sets text in (`font-family`, a `--*font*` property), as `familyKey`s
 *   // icons: the families of `local` and `google` that are icon fonts (`iconFamilies`), as `familyKey`s
 *   // declarations: every font declaration of its stylesheets (`readers/font-declarations.js`), plus the two a T4
 *   //        font setting stands for: `heading_font_family: "Jost"` is T4's `--heading-font-family: "Jost"`
 *   //        (`css/tpl/theme.tpl.css`) and the text T4 sets in it, `font-family: var(--heading-font-family)`
 *
 * Static, no network: whether a Google family has a language's letters is asked by the rule, through the
 * `fetchText` the caller passes in (`index.js` `checkRelease` options).
 */
import { ICON_NAME, familyKey, fontFaces, iconFont } from '../../font-glyphs.js'
import { fontDeclarations, namedFamilies, stackOf } from './font-declarations.js'
import { joomlaLoadedStylesheet } from './joomla-loaded-stylesheets.js'
import { templateSource } from './template-source.js'

/** Font files a face may point at. */
const FONT_FILE = /\.(woff2?|ttf|otf)$/i
/** Families every system has, never loaded from Google (a T4 setting may name one). */
const SYSTEM = new Set(
  [
    'arial',
    'helvetica',
    'helvetica neue',
    'georgia',
    'times',
    'times new roman',
    'verdana',
    'tahoma',
    'trebuchet ms',
    'courier',
    'courier new',
    'system-ui',
    '-apple-system',
    'blinkmacsystemfont',
    'segoe ui',
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'inherit',
    'initial'
  ].map(familyKey)
)

/**
 * 🔒 AN ICON FONT DRAWS PICTURES, NEVER THE SITE’S WORDS (TCH #1298, 14/10/2026). LANG-2 named icon fonts (Font Awesome,
 * swiper-icons) as fonts that cannot draw Vietnamese on Joomla quickstarts. A family is an icon font, whatever the set
 * and its version, when any of these holds:
 * - its name is an icon set's: a word ending in "icons" (swiper-icons, Material Icons, glyphicons, ionicons,
 *   simple-line-icons, linearicons), one starting with "icon", "awesome" (Font Awesome 4 to 6, Line Awesome), the word
 *   "symbol(s)" (Material Symbols), or a set named neither way (icomoon, icofont, fontello, themify, flaticon);
 * - every face of it the template declares holds pictures (`iconFace`);
 * - every rule that sets it draws an icon, not an element's words (`pictogram` of `readers/font-declarations.js`:
 *   a `::before`/`::after` box, or a rule kept from screen readers), and no `font` shorthand names it (those are not
 *   read rule by rule, so a family one names may set words).
 */

/** The Private Use Areas, where an icon set keeps its pictures (Basic, and planes 15 and 16). */
const PRIVATE_USE = [
  [0xe000, 0xf8ff],
  [0xf0000, 0x10ffff]
]

/**
 * A face that holds pictures, not letters: its file maps them in the Private Use Area or lacks the Latin letters
 * (`iconFont`), or its `unicode-range` reaches nothing outside the Private Use Area (`U+E000-F8FF`).
 * @param {{ ranges: Array<[number, number]> | null, bytes: Buffer | null }} face
 */
function iconFace(face) {
  if (face.ranges?.length && face.ranges.every(([a, b]) => PRIVATE_USE.some(([x, y]) => a >= x && b <= y)))
    return true
  return iconFont(face)
}

/**
 * The families of `keys` that are icon fonts (the rule above), as `familyKey`s.
 * @param {Map<string, string>} keys family key → its name as written
 * @param {Array<{ key: string, icon: boolean }>} local
 * @param {ReturnType<typeof fontDeclarations>} declarations
 * @param {string[]} shorthands the values of every `font` shorthand of the stylesheets, lower case
 */
function iconFamilies(keys, local, declarations, shorthands) {
  /** Families a rule that sets an element's words may draw with, and families only an icon rule draws with. */
  const words = new Set()
  const pictures = new Set()
  for (const d of declarations)
    if (d.prop === 'font-family')
      for (const key of namedFamilies(d.stack, declarations)) (d.pictogram ? pictures : words).add(key)
  const out = new Set()
  for (const [key, name] of keys) {
    const faces = local.filter((face) => face.key === key)
    if (
      ICON_NAME.test(key) ||
      ICON_NAME.test(name) ||
      (faces.length > 0 && faces.every((face) => face.icon)) ||
      (pictures.has(key) && !words.has(key) && !shorthands.some((value) => value.includes(key)))
    )
      out.add(key)
  }
  return out
}

/** `../fonts/a.woff2` of `assets/css/x.css` as `assets/fonts/a.woff2`; `/fonts/a.woff2` as itself and `public/…`. */
function resolved(/** @type {string} */ from, /** @type {string} */ url) {
  const clean = url.replace(/[?#].*$/, '')
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith('//')) return []
  if (clean.startsWith('/')) return [clean.slice(1), `public${clean}`]
  const parts = from.split('/').slice(0, -1)
  for (const part of clean.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.' && part !== '') parts.push(part)
  }
  return [parts.join('/')]
}

/** The families a Google Fonts address asks for (`css2?family=Jost:wght@400&family=Noto+Serif`, `css?family=A|B:400`). */
export function googleFamilies(/** @type {string} */ address) {
  const out = []
  const query = address.replace(/&amp;/g, '&').split('?')[1] ?? ''
  for (const pair of query.split('&')) {
    const [name, value] = pair.split('=')
    if (name !== 'family' || !value) continue
    let decoded = value
    try {
      decoded = decodeURIComponent(value.replace(/\+/g, ' '))
    } catch {
      decoded = value.replace(/\+/g, ' ')
    }
    for (const one of decoded.split('|')) {
      const family = one.split(':')[0].trim()
      if (family) out.push(family)
    }
  }
  return out
}

/** The stylesheet T4 compiles a template's font settings into. */
const THEME_TPL = /(^|\/)css\/tpl\/[^/]+\.tpl\.css$/
/**
 * A T4 font setting where theme.tpl.css names it: a whole stack item (`__heading_font_family`) or a token inside one, the
 * fallback of the design system's variable a role-variable build wraps it in
 * (`var(--ds-font-display, __special_font_family)`, JA Spa 1.0.7): T4 substitutes it wherever it is written.
 */
const PLACEHOLDER = /__([a-z_]*font_family)\b/

/**
 * Every font setting of a T4 template's profiles (`etc/site/*.json`, `etc/theme/*.json`), once per setting and value.
 * A stack (`Archivo, system-ui, \"Segoe UI\"`) is kept whole; T4 loads its first family. An empty setting sets nothing.
 * @param {Map<string, Buffer>} files @param {(name: string) => string} text
 * @returns {{ setting: string, stack: string[], where: string }[]}
 */
function t4FontSettings(files, text) {
  const out = new Map()
  for (const name of files.keys()) {
    if (!/(^|\/)etc\/(site|theme)\/[^/]+\.json$/.test(name)) continue
    for (const m of text(name).matchAll(/"([a-z_]*font_family)"\s*:\s*"((?:[^"\\]|\\.)+)"/g)) {
      const stack = stackOf(m[2].replace(/\\"/g, '"'))
      const first = stack[0]?.replace(/^['"]|['"]$/g, '')
      if (!first) continue
      const id = `${m[1]}|${stack.join(',')}`
      if (!out.has(id))
        out.set(id, { setting: m[1], stack: [first, ...stack.slice(1)], where: `${name} ${m[1]}` })
    }
  }
  return [...out.values()]
}

/**
 * The declarations of css/tpl/theme.tpl.css as T4 writes them: a `__<setting>` item takes the stack of each value
 * the setting has (one declaration per value, any of which may be in use), with the setting as where it comes from.
 * A declaration naming a setting no profile sets is dropped: T4 writes no family there.
 * @param {ReturnType<typeof fontDeclarations>} found @param {ReturnType<typeof t4FontSettings>} settings
 */
function settingDeclarations(found, settings) {
  const out = []
  for (const d of found) {
    const at = d.stack.findIndex((item) => PLACEHOLDER.test(item))
    if (at < 0) {
      out.push(d)
      continue
    }
    const item = d.stack[at]
    const m = /** @type {RegExpExecArray} */ (PLACEHOLDER.exec(item))
    const whole = m[0] === item
    for (const s of settings.filter((x) => x.setting === m[1]))
      out.push({
        ...d,
        file: s.where,
        stack: [
          ...d.stack.slice(0, at),
          // Inside var(): the setting's stack becomes the fallback, read by `effectiveFamilies` like any other.
          ...(whole ? s.stack : [item.replace(m[0], () => s.stack.join(', '))]),
          ...d.stack.slice(at + 1)
        ]
      })
  }
  return out
}

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{
 *   local: Array<{ family: string, key: string, file: string, ranges: Array<[number, number]> | null, bytes: Buffer | null, icon: boolean }>,
 *   google: Array<{ family: string, key: string, where: string }>,
 *   used: Set<string>,
 *   icons: Set<string>,
 *   declarations: ReturnType<typeof fontDeclarations>
 * }>}
 */
export async function templateFonts(context) {
  const { files } = await templateSource(context).read()
  // A JA T3 template ships stylesheets no left-to-right page loads (css/rtl/, other colour themes).
  const loaded = await joomlaLoadedStylesheet(context)
  const text = (/** @type {string} */ name) => /** @type {Buffer} */ (files.get(name)).toString('utf8')
  const local = []
  /** @type {Map<string, { family: string, key: string, where: string }>} */
  const google = new Map()
  const used = new Set()
  /** @type {ReturnType<typeof fontDeclarations>} */
  const declarations = []
  /** @type {string[]} */
  const shorthands = []
  const addGoogle = (/** @type {string} */ family, /** @type {string} */ where) => {
    const key = familyKey(family)
    if (key && !SYSTEM.has(key) && !google.has(key)) google.set(key, { family: family.trim(), key, where })
  }
  const customs = new Set()
  for (const name of files.keys())
    if (/(^|\/)etc\/(fontcustoms|customfonts)\.json$/.test(name))
      for (const m of text(name).matchAll(/"(?:name|font_family|family)"\s*:\s*"([^"]+)"/g))
        customs.add(familyKey(m[1]))
  const settings = t4FontSettings(files, text)
  let tpl = false

  for (const name of files.keys()) {
    if (!/\.(css|php|html?|json|astro|less|scss|ts|js|mjs)$/i.test(name) || /(^|\/)node_modules\//.test(name))
      continue
    if (/\.css$/i.test(name) && !loaded(name)) continue
    const body = text(name)
    for (const m of body.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'`)\s<>]+/g))
      for (const family of googleFamilies(m[0])) addGoogle(family, name)
    if (/\.css$/i.test(name)) {
      for (const m of body.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
        const [face] = fontFaces(`@font-face{${m[1]}}`, 'file:///')
        const src = /src\s*:[^;]*?url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(m[1])?.[2]
        if (!face || !src || !FONT_FILE.test(src.replace(/[?#].*$/, ''))) continue
        const file = resolved(name, src).find((p) => files.has(p)) ?? resolved(name, src)[0]
        if (!file) continue
        const bytes = files.get(file) ?? null
        local.push({
          family: face.name,
          key: face.family,
          file,
          ranges: face.ranges,
          bytes,
          icon: iconFace({ ranges: face.ranges, bytes })
        })
      }
      // T4 writes its font settings into css/tpl/theme.tpl.css (`h1 { font-family: __heading_font_family }`).
      if (THEME_TPL.test(name)) {
        tpl = true
        declarations.push(...settingDeclarations(fontDeclarations(name, body), settings))
      } else declarations.push(...fontDeclarations(name, body))
      const outside = body.replace(/@font-face\s*\{[^}]*\}/gi, ' ')
      for (const m of outside.matchAll(/(?:font-family|--[\w-]*font[\w-]*)\s*:\s*([^;}]+)/gi))
        for (const one of m[1].split(',')) used.add(familyKey(one))
      for (const m of outside.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/gi))
        shorthands.push(m[1].toLowerCase())
    }
    // A block theme declares its faces in theme.json (`fontFace` `src: "file:./assets/fonts/x.woff2"`).
    if (name === 'theme.json')
      try {
        const families = JSON.parse(body)?.settings?.typography?.fontFamilies
        for (const family of Array.isArray(families) ? families : [])
          for (const face of Array.isArray(family?.fontFace) ? family.fontFace : []) {
            const src = [face?.src].flat().find((s) => typeof s === 'string' && s.startsWith('file:./'))
            const name = String(face?.fontFamily ?? '').trim()
            if (!src || !name) continue
            const file = src.slice('file:./'.length)
            const bytes = files.get(file) ?? null
            local.push({
              family: name,
              key: familyKey(name),
              file,
              ranges: null,
              bytes,
              icon: iconFace({ ranges: null, bytes })
            })
            used.add(familyKey(name))
          }
      } catch {
        // A theme.json that does not parse declares nothing here.
      }
  }
  // A T4 template names its fonts in its settings; T4 loads every one not custom or system from Google Fonts.
  for (const { setting, stack, where } of settings) {
    const key = familyKey(stack[0])
    used.add(key)
    if (!customs.has(key)) addGoogle(stack[0], where)
    // A template with no css/tpl/theme.tpl.css of its own: T4 writes the setting into the custom property of
    // its role (`--heading-font-family`) and sets the text of that role in it.
    if (tpl) continue
    const role = `--${setting.replace(/_/g, '-')}`
    declarations.push(
      { file: where, selector: role, prop: role, stack, lang: null },
      { file: where, selector: role, prop: 'font-family', stack: [`var(${role})`], lang: null }
    )
  }
  // A family the template ships its own faces of is not asked of Google (a T4 custom font named in a setting).
  const shipped = new Set(local.map((face) => face.key))
  const asked = [...google.values()].filter((g) => !shipped.has(g.key))
  const keys = new Map([...local, ...asked].map((x) => [x.key, x.family]))
  return {
    local,
    google: asked,
    used,
    icons: iconFamilies(keys, local, declarations, shorthands),
    declarations
  }
}
