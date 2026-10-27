/**
 * THE SECOND VALUE SOURCE OF `content.locate`: language strings and template files (comment → edit,
 * stage 2 of `tasks/todo-comment-to-edit.md`).
 *
 * The Content API holds the records a customer writes. It does not hold the words a template or an
 * extension prints: a Joomla language string (`Select your language`, `mod_languages.ini`), a label
 * typed into a template layout (`aria-label="Open menu"`), a block attribute in a WordPress theme
 * part (`<!-- wp:…/mega-menu {"label":"Resources"} -->`), a gettext string of a core block
 * (`__( 'Open menu' )` in `wp-includes/blocks/navigation.php`). The provenance spike measured those
 * at 5–7% of the visible elements, and after the Content API fixes they are most of what is left.
 *
 * This file turns the site's files — as tracy-host's `/_host/site-files` hands them over, a fixed
 * set per platform — into the same kind of value index the records get (`content-locate.js`
 * `indexContents`), so the resolver asks one question of both. Each indexed thing is a UNIT the agent
 * can act on:
 * - `string`: a Joomla language key (`language/en-GB/mod_languages.ini#MOD_LANGUAGES_DESC`; the road
 *   is the site's override file for that language), a WordPress gettext string (file, line, msgid,
 *   domain), a translation in a `.po` file;
 * - `file`: words or a picture a template file carries itself (`templates/…/header-1.html:17`);
 * - EmDash: the template's source in the site's container (`/app/src`) — a word of the theme's own
 *   dictionary (`/app/src/lib/locale-words.ts#en.menu`, a `string`) or a label or words typed into
 *   a component (`/app/src/components/site/Pagination.astro:18`, a `file`). Never writable: file
 *   tools reach only the site folder, and the site serves a build of that source (`EMDASH_WHY`).
 *
 * OWNERS tie a unit to the render marks, so the intersection rule holds here too: a mark's block
 * (`block:core/navigation`, `block:mod_languages`, `block:polylang/language-switcher`) names the
 * extension that printed the element, and a unit knows which extension its file belongs to (a core
 * block renderer, a plugin's folder, a theme's folder, a Joomla `<ext>.ini`), and — inside a block
 * template — the block its words sit in.
 *
 * WHAT IS NOT READ, SO IT IS NEVER CLAIMED: JavaScript (a label a script writes after load), core
 * PHP outside the block renderers, strings a CMS builds from data (dates, counts, "Production · 2025"
 * — a category and a year), EmDash menus and taxonomy labels (rows in the site's database, the
Content API's to answer), and EmDash TypeScript that is not a dictionary.
 *
 * Pure functions plus one in-memory store; the Apply door (`route.js`) does the I/O.
 */

import { decodeEntities, emptyIndex, indexAdders } from './content-locate.js'

/** Units an index keeps; a larger site is answered `incomplete` rather than slowly. */
export const STRING_MAX_UNITS = 200_000
/** How long a string index answers before the file set is read again from nothing. */
export const STRING_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Why an EmDash template unit is never writable, said with the level so the agent does not try the
 * file tools first. The fence (`packages/tools/tracy-subprocess-docker/src/route.mjs`,
 * `OUTSIDE_SITE_NEXT`) stops every file tool at `/site/<label>`; `/app/src` is in the container,
 * outside it. And the site runs `node dist/server/entry.mjs`: a source edit changes the page only
 * after the template is built again.
 */
export const EMDASH_WHY =
  'Template source in the site container (/app/src), outside the folder file tools reach; the site serves a build of it, so an edit shows only after a rebuild.'

/**
 * @typedef {{ unit: string, kind: 'string'|'file', file: string, line?: number, key?: string,
 *   domain?: string, locale?: string, override?: string, editable: boolean, why?: string,
 *   owners: string[] }} Origin
 * @typedef {{ text?: string, image?: string, html?: boolean, origin: Origin }} Entry
 */

// ── Where a file sits ───────────────────────────────────────────────────────────────────────────

/**
 * What a file belongs to, as marks name it, and whether an edit there is the site's own to make.
 * @param {string} file - relative to the webroot.
 * @returns {{ owners: string[], editable: boolean }}
 */
export function ownersOfFile(file) {
  let match = /^wp-includes\/blocks\/([a-z0-9-]+)(?:\.php$|\/)/.exec(file)
  if (match) return { owners: [`core/${match[1]}`], editable: false }
  match = /^wp-content\/plugins\/([^/]+)\//.exec(file)
  if (match) return { owners: [`ns:${match[1]}`], editable: false }
  match = /^wp-content\/themes\/([^/]+)\/(?:parts\/([^/]+)\.html$)?/.exec(file)
  if (match) return { owners: [`ns:${match[1]}`, ...(match[2] ? [`part:${match[2]}`] : [])], editable: true }
  match =
    /^wp-content\/languages\/(?:(?:themes|plugins)\/)?([a-z0-9_-]+?)-[a-z]{2,3}(?:_[A-Za-z0-9]+)?\.po$/.exec(
      file
    )
  if (match) return { owners: [`ns:${match[1]}`], editable: false }
  match = /^templates\/([^/]+)\/(?:(html)\/([a-z]+_[a-z0-9_]+)\/|(acm)\/)?/.exec(file)
  if (match) {
    const owners = [`ext:tpl_${match[1]}`]
    if (match[3]) owners.push(`ext:${match[3]}`)
    // ACM layouts are the JoomlArt content module's (`mod_ja_acm`), kept in the template.
    if (match[4]) owners.push('ext:mod_ja_acm')
    return { owners, editable: true }
  }
  match = /^language\/[^/]+\/(?:[a-z]{2,3}-[A-Z]{2}\.)?([a-z0-9_]+)\.ini$/.exec(file)
  if (match) return { owners: [`ext:${match[1]}`], editable: true }
  return { owners: [], editable: false }
}

/** Offsets → 1-based line numbers. */
function lineIndex(text) {
  const starts = [0]
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1)
  return (offset) => {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (starts[mid] <= offset) low = mid
      else high = mid - 1
    }
    return low + 1
  }
}

/** PHP code blanked out, lines kept, so markup offsets still name the right line. */
const blankPhp = (text) =>
  text.replace(/<\?(?:php|=)?[\s\S]*?(?:\?>|$)/g, (code) => code.replace(/[^\n]/g, ' '))

/** A value worth indexing: two characters or more, at least one letter. */
const worth = (value) => typeof value === 'string' && value.trim().length >= 2 && /\p{L}/u.test(value)

// ── Markup: own text, labels, block attributes ──────────────────────────────────────────────────

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr'
])
const LABEL_ATTRS = ['aria-label', 'placeholder', 'title', 'alt', 'value']

/**
 * The words markup carries, the way the picker reads a page: each element's own text, its labels
 * (`aria-label`, `placeholder`, `title`, `alt`, `value`), and — in a WordPress block template — the
 * string values of each block comment's attributes. Every value comes with its offset and the
 * innermost block around it (`core/html`, `wp-tracy-business/mega-menu`), which is what a mark's
 * `block:` word names.
 * @param {string} source
 * @returns {{ text: string, offset: number, block: string|null }[]}
 */
export function markupValues(source) {
  const out = []
  /** @type {string[]} */
  const blocks = []
  /** @type {{ parts: string[], offset: number, block: string|null }[]} */
  const stack = [{ parts: [], offset: 0, block: null }]
  const close = () => {
    const frame = stack.pop()
    const text = decodeEntities(frame.parts.join(' ')).trim()
    if (worth(text)) out.push({ text, offset: frame.offset, block: frame.block })
  }
  const token =
    /<!--\s*(\/)?wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(\s+\{[\s\S]*?\})?\s*(\/)?-->|<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)|</g
  let skip = null
  for (const match of source.matchAll(token)) {
    const [, blockEnd, blockName, blockAttrs, blockSelf, slash, rawTag, attrs, text] = match
    const at = match.index ?? 0
    if (skip) {
      if (slash && rawTag?.toLowerCase() === skip) skip = null
      continue
    }
    if (blockName) {
      const name = blockName.includes('/') ? blockName : `core/${blockName}`
      if (blockEnd) {
        const open = blocks.lastIndexOf(name)
        if (open !== -1) blocks.length = open
        continue
      }
      if (blockAttrs) {
        let parsed = null
        try {
          parsed = JSON.parse(blockAttrs)
        } catch {
          parsed = null
        }
        const visit = (value, depth) => {
          if (depth > 4) return
          if (typeof value === 'string') {
            if (worth(value)) out.push({ text: decodeEntities(value), offset: at, block: name })
          } else if (value && typeof value === 'object')
            for (const one of Object.values(value)) visit(one, depth + 1)
        }
        visit(parsed, 0)
      }
      if (!blockSelf) blocks.push(name)
      continue
    }
    const block = blocks.at(-1) ?? null
    if (text !== undefined) {
      if (text.trim()) {
        const frame = stack[stack.length - 1]
        if (frame.parts.length === 0) frame.offset = at + (text.length - text.trimStart().length)
        frame.parts.push(text)
      }
      continue
    }
    if (!rawTag) continue
    const tag = rawTag.toLowerCase()
    if (slash) {
      if (!VOID.has(tag) && stack.length > 1) close()
      continue
    }
    for (const name of LABEL_ATTRS) {
      const found = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs ?? '')
      const value = found ? decodeEntities(found[1] ?? found[2] ?? '').trim() : ''
      if (worth(value)) out.push({ text: value, offset: at, block })
    }
    if (tag === 'script' || tag === 'style') {
      skip = tag
      continue
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs ?? '')) stack.push({ parts: [], offset: at, block })
  }
  while (stack.length > 0) close()
  return out
}

// ── Joomla language files ───────────────────────────────────────────────────────────────────────

/**
 * `KEY="value"` lines of a Joomla `.ini` file, with their line numbers. `\"` and `_QQ_` are quotes.
 * @param {string} text
 * @returns {{ key: string, value: string, line: number }[]}
 */
export function iniStrings(text) {
  const out = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = /^\s*([A-Za-z0-9_.-]+)\s*=\s*"(.*)"\s*$/.exec(lines[i])
    if (match) out.push({ key: match[1], value: match[2].replace(/\\"|"_QQ_"|_QQ_/g, '"'), line: i + 1 })
  }
  return out
}

// ── WordPress gettext ───────────────────────────────────────────────────────────────────────────

const LITERAL = String.raw`\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")`
/** Where each gettext function takes its text domain (its literal arguments come first, in order). */
const DOMAIN_AT = {
  __: 1,
  _e: 1,
  esc_html__: 1,
  esc_html_e: 1,
  esc_attr__: 1,
  esc_attr_e: 1,
  _x: 2,
  _ex: 2,
  esc_html_x: 2,
  esc_attr_x: 2,
  _n: 3,
  _n_noop: 2,
  _nx: 4,
  _nx_noop: 3
}
const GETTEXT = new RegExp(
  String.raw`(?<![\w$>:])(${Object.keys(DOMAIN_AT)
    .sort((a, b) => b.length - a.length)
    .join('|')})\s*\(` +
    LITERAL +
    String.raw`(?:\s*,` +
    LITERAL +
    String.raw`)?(?:\s*,` +
    LITERAL +
    String.raw`)?(?:\s*,` +
    LITERAL +
    String.raw`)?`,
  'g'
)
const unescape = (text) => text.replace(/\\(['"\\])/g, '$1')

/**
 * The gettext calls of a PHP file: the string(s) shown and the text domain. Only literal arguments
 * are read, in order; a domain behind a variable (`_n( $one, $many, $count, 'x' )`) reads `default`.
 * @param {string} text
 * @returns {{ texts: string[], msgid: string, domain: string, offset: number }[]}
 */
export function gettextStrings(text) {
  const out = []
  for (const match of text.matchAll(GETTEXT)) {
    const fn = match[1]
    const args = [2, 4, 6, 8]
      .map((at) => match[at] ?? match[at + 1])
      .map((one) => (one === undefined ? undefined : unescape(one)))
    if (typeof args[0] !== 'string') continue
    const plural = fn.startsWith('_n')
    const texts = [args[0], ...(plural && typeof args[1] === 'string' ? [args[1]] : [])]
    const domain = args[DOMAIN_AT[fn]] ?? 'default'
    out.push({ texts, msgid: args[0], domain, offset: match.index ?? 0 })
  }
  return out
}

/**
 * `msgid`/`msgstr` pairs of a `.po` file (multi-line strings joined; plural forms kept).
 * @param {string} text
 * @returns {{ msgid: string, msgstr: string[], line: number }[]}
 */
export function poStrings(text) {
  const out = []
  let current = null
  let field = null
  const lines = text.split('\n')
  const quoted = (rest) => {
    const match = /^\s*"((?:\\.|[^"\\])*)"\s*$/.exec(rest)
    return match ? match[1].replace(/\\n/g, '\n').replace(/\\(["\\])/g, '$1') : null
  }
  const flush = () => {
    if (current && current.msgid !== '' && current.msgstr.some((one) => one !== '')) out.push(current)
    current = null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match = /^msgid\s+(.*)$/.exec(line)
    if (match) {
      flush()
      current = { msgid: quoted(match[1]) ?? '', msgstr: [], line: i + 1 }
      field = 'msgid'
      continue
    }
    match = /^msgstr(?:\[\d+\])?\s+(.*)$/.exec(line)
    if (match && current) {
      current.msgstr.push(quoted(match[1]) ?? '')
      field = 'msgstr'
      continue
    }
    if (/^msgid_plural\s/.test(line)) {
      field = 'plural'
      continue
    }
    const more = quoted(line)
    if (more !== null && current) {
      if (field === 'msgid') current.msgid += more
      else if (field === 'msgstr') current.msgstr[current.msgstr.length - 1] += more
      continue
    }
    if (line.trim() === '') field = null
  }
  flush()
  return out
}

// ── EmDash: Astro and TSX markup, word dictionaries ─────────────────────────────────────────────

/** Characters of `match` replaced by spaces, newlines kept, so offsets still name the right line. */
const blank = (text) => text.replace(/[^\n]/g, ' ')

/** A JSX attribute value in braces, up to three levels of nesting (`class={`${box} x`}`). */
const BRACED = String.raw`\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}`
/** One JSX/Astro tag: `<name attr="x" attr={expr} {...spread}>`, or a closing `</name>`. */
const JSX_TAG = new RegExp(
  String.raw`<(\/)?([A-Za-z][\w.:-]*)((?:\s+(?:[\w:@.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|${BRACED}))?|\{\.\.\.[^{}]*\}))*)\s*\/?>`,
  'g'
)
/** Text that is code, not words: an arrow, an assignment, a statement end, a keyword. */
const CODE_TEXT = /=>|[=;]|\b(?:const|let|return|import|export|function)\b/

/**
 * The words an `.astro` or `.tsx` template carries itself, as a visitor's browser shows them: each
 * tag's labels (`aria-label`, `placeholder`, `title`, `alt`, `value` — literal values only) and the
 * literal text right after a tag. An Astro file's frontmatter, scripts, styles and comments are
 * blanked first, a TSX file's comments; `{expressions}` print content, not the template's words.
 * @param {string} file
 * @param {string} source
 * @returns {{ text: string, line: number }[]}
 */
export function markupValuesOf(file, source) {
  let text = source
  if (file.endsWith('.astro')) {
    text = text.replace(/^(\s*---\n)([\s\S]*?\n)(---)/, (all) => blank(all))
    text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi, (all) => blank(all))
  } else {
    text = text.replace(
      /\/\*[\s\S]*?\*\/|(^|[^:"'`\\])\/\/[^\n]*/g,
      (all, lead = '') => lead + blank(all.slice(lead.length))
    )
  }
  const lineOf = lineIndex(text)
  const out = []
  for (const match of text.matchAll(JSX_TAG)) {
    const at = match.index ?? 0
    const attrs = match[3] ?? ''
    if (!match[1])
      for (const name of LABEL_ATTRS) {
        const found = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)
        const value = found ? decodeEntities(found[1] ?? found[2] ?? '').trim() : ''
        if (worth(value)) out.push({ text: value, line: lineOf(at) })
      }
    const end = at + match[0].length
    const after = /^[^<>{}]*/.exec(text.slice(end))?.[0] ?? ''
    const words = decodeEntities(after).replace(/\s+/g, ' ').trim()
    if (worth(words) && !CODE_TEXT.test(words))
      out.push({ text: words, line: lineOf(end + (after.length - after.trimStart().length)) })
  }
  return out
}

/** A hole of a string pattern, as `content-locate.js` reads one (`{n}`, `{value}`, `%d`). */
const PLACEHOLDER_HOLE = /\{[a-z0-9_.]+\}|%(?:\d\$)?[sd]/gi

/**
 * The first string or template literal in `value`. In a word written as a function its holes
 * (`${m}`, `'{n} …'.replace('{n}', …)`) are the function's argument, and a word function of this
 * dictionary takes a count (`minRead`), so each reads as `%d` — digits only. A looser hole took
 * "12 Aug 2026 · Communications · 4 min read", a line the view joins from a date and a category,
 * as the dictionary's words (measured on the provenance spike's EmDash pages, 27/09/2026).
 * @param {string} value
 * @param {boolean} fn - the word is a function.
 */
function literalOf(value, fn) {
  const match = /(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/.exec(value)
  if (!match) return null
  const raw = match[3] !== undefined ? match[3].replace(/\$\{[^}]*\}/g, '%d') : (match[1] ?? match[2])
  return unescape(fn ? raw.replace(/\{[a-z0-9_.]+\}/gi, '%d') : raw)
}

/**
 * The words of an EmDash word dictionary in TypeScript (`locale-words.ts`): an object of languages,
 * each an object of words — `  en: {` then `    menu: 'Menu',`. A word written as a function
 * (`minRead: (m) => `${m} min read``) is its literal with the holes as placeholders; one with no
 * literal (`date: intlDate('af')`) is code and is skipped.
 * @param {string} text
 * @returns {{ locale: string, key: string, value: string, line: number }[]}
 */
export function dictionaryStrings(text) {
  const out = []
  let locale = null
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {2}(?:'([^']+)'|"([^"]+)"|([A-Za-z][\w-]*)):\s*\{\s*$/.exec(lines[i])
    if (open) {
      locale = open[1] ?? open[2] ?? open[3]
      continue
    }
    if (/^ {2}\}/.test(lines[i])) {
      locale = null
      continue
    }
    const word = locale ? /^ {4}([A-Za-z_]\w*):\s*(.+?),?\s*$/.exec(lines[i]) : null
    if (!word) continue
    const value = word[2]
    const fn = /=>/.test(value)
    const shown = /^['"`]/.test(value) || fn ? literalOf(value, fn) : null
    // Words of its own, not only holes (`${day} ${month} ${year}` is a date shape, not words).
    if (shown !== null && worth(shown.replace(PLACEHOLDER_HOLE, '')))
      out.push({ locale, key: word[1], value: shown, line: i + 1 })
  }
  return out
}

/**
 * The words of a JSON dictionary under `i18n/` or `locales/`: `en.json` holds one language (every
 * string leaf, keyed by its path), any other name holds languages at its top level.
 * @param {string} file
 * @param {string} text
 * @returns {{ locale: string, key: string, value: string, line?: number }[]}
 */
function jsonDictionaryStrings(file, text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const out = []
  const base = (file.split('/').pop() ?? '').replace(/\.json$/, '')
  const walk = (value, locale, key, depth) => {
    if (depth > 6) return
    if (typeof value === 'string') {
      if (worth(value)) out.push({ locale, key, value })
    } else if (value && typeof value === 'object' && !Array.isArray(value))
      for (const [name, one] of Object.entries(value))
        walk(one, locale, key ? `${key}.${name}` : name, depth + 1)
  }
  if (/^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/.test(base)) walk(parsed, base, '', 0)
  else if (parsed && typeof parsed === 'object')
    for (const [locale, one] of Object.entries(parsed)) walk(one, locale, '', 0)
  return out
}

// ── One site's files → entries ──────────────────────────────────────────────────────────────────

/**
 * Every indexed value of one site's files, each with the unit it belongs to.
 * @param {{ platform: string|null, locale: string|null, files: { path: string, text: string }[],
 *   images?: string[] }} input
 * @returns {Entry[]}
 */
export function stringEntries({ platform, locale, files, images = [] }) {
  /** @type {Entry[]} */
  const entries = []
  const list = Array.isArray(files)
    ? files.filter((one) => typeof one?.path === 'string' && typeof one?.text === 'string')
    : []
  const fileUnit = (file, line, extra = {}) => {
    const { owners, editable } = ownersOfFile(file)
    return {
      unit: `file:${file}`,
      kind: /** @type {'file'} */ ('file'),
      file,
      line,
      editable,
      owners: [...owners, ...(extra.owners ?? [])]
    }
  }
  const pushMarkup = (file, text) => {
    const lineOf = lineIndex(text)
    for (const one of markupValues(blankPhp(text))) {
      const origin = fileUnit(file, lineOf(one.offset), { owners: one.block ? [one.block] : [] })
      entries.push({ text: one.text, origin })
    }
  }

  if (platform === 'joomla') {
    const tag = typeof locale === 'string' ? locale.replace('_', '-') : null
    const ofTag = (file) => {
      if (!tag || !file.endsWith('.ini') || file.endsWith('.sys.ini')) return false
      const base = file.split('/').pop() ?? ''
      return file.includes(`/${tag}/`) || base.startsWith(`${tag}.`)
    }
    const overrideFile = tag ? `language/overrides/${tag}.override.ini` : null
    /** @type {Map<string, { value: string, file: string, line: number, owners: string[] }[]>} */
    const byKey = new Map()
    /** @type {Map<string, { value: string, line: number }>} */
    const overrides = new Map()
    // The site's own language folder first: Joomla loads it before a template's copy of the file.
    const ordered = [...list].sort(
      (a, b) =>
        Number(!a.path.startsWith('language/')) - Number(!b.path.startsWith('language/')) ||
        a.path.localeCompare(b.path)
    )
    for (const { path, text } of ordered) {
      if (path === overrideFile) {
        for (const one of iniStrings(text)) overrides.set(one.key, { value: one.value, line: one.line })
        continue
      }
      if (ofTag(path)) {
        const { owners } = ownersOfFile(path)
        for (const one of iniStrings(text)) {
          const held = byKey.get(one.key) ?? []
          if (!held.some((h) => h.value === one.value))
            held.push({ value: one.value, file: path, line: one.line, owners })
          byKey.set(one.key, held)
        }
        continue
      }
      if (/\.(php|html)$/.test(path) && path.startsWith('templates/')) pushMarkup(path, text)
    }
    const stringOrigin = (key, file, line, owners) => ({
      unit: `string:${tag}:${key}`,
      kind: /** @type {'string'} */ ('string'),
      file,
      line,
      key,
      locale: tag ?? undefined,
      ...(overrideFile ? { override: overrideFile } : {}),
      editable: true,
      owners
    })
    for (const [key, held] of byKey) {
      const owners = [...new Set(held.flatMap((one) => one.owners))]
      const over = overrides.get(key)
      if (over && overrideFile) {
        entries.push({
          text: over.value,
          html: over.value.includes('<'),
          origin: stringOrigin(key, overrideFile, over.line, owners)
        })
        continue
      }
      const first = held[0]
      for (const one of held)
        entries.push({
          text: one.value,
          html: one.value.includes('<'),
          origin: stringOrigin(key, first.file, first.line, owners)
        })
    }
    for (const [key, over] of overrides)
      if (!byKey.has(key) && overrideFile)
        entries.push({
          text: over.value,
          html: over.value.includes('<'),
          origin: stringOrigin(key, overrideFile, over.line, [])
        })
    return entries
  }

  if (platform === 'wordpress') {
    /** @type {Map<string, Origin>} */
    const units = new Map()
    for (const { path, text } of list) {
      if (path.endsWith('.po')) {
        const { owners } = ownersOfFile(path)
        const domain = owners[0]?.slice(3) ?? 'default'
        for (const one of poStrings(text)) {
          const origin = {
            unit: `po:${path}:${one.msgid}`,
            kind: /** @type {'string'} */ ('string'),
            file: path,
            line: one.line,
            key: one.msgid,
            domain,
            editable: false,
            owners
          }
          for (const shown of one.msgstr) if (worth(shown)) entries.push({ text: shown, origin })
        }
        continue
      }
      if (path.endsWith('.php')) {
        const lineOf = lineIndex(text)
        const { owners, editable } = ownersOfFile(path)
        for (const call of gettextStrings(text)) {
          const unit = `string:${call.domain}:${call.msgid}`
          let origin = units.get(unit)
          if (!origin) {
            origin = {
              unit,
              kind: 'string',
              file: path,
              line: lineOf(call.offset),
              key: call.msgid,
              domain: call.domain,
              editable,
              owners: [...owners]
            }
            units.set(unit, origin)
          } else {
            for (const one of owners) if (!origin.owners.includes(one)) origin.owners.push(one)
            // The string is the site's to change only when every copy of it is.
            origin.editable = origin.editable && editable
          }
          for (const shown of call.texts)
            if (worth(shown)) entries.push({ text: shown, html: shown.includes('<'), origin })
        }
      }
      // Theme templates: block markup (`.html`, and patterns written as `.php`) carries words of its own.
      if (path.startsWith('wp-content/themes/') && /\.(php|html)$/.test(path)) pushMarkup(path, text)
    }
    for (const image of Array.isArray(images) ? images : [])
      if (typeof image === 'string') entries.push({ image, origin: fileUnit(image, undefined) })
    return entries
  }

  if (platform === 'emdash') {
    // Every unit here is the template's, and none is writable (`EMDASH_WHY`); no mark names a file.
    const lower = typeof locale === 'string' ? locale.toLowerCase() : null
    for (const { path, text } of list) {
      if (/\.(astro|tsx)$/.test(path)) {
        for (const one of markupValuesOf(path, text))
          entries.push({
            text: one.text,
            origin: {
              unit: `file:${path}`,
              kind: 'file',
              file: path,
              line: one.line,
              editable: false,
              why: EMDASH_WHY,
              owners: []
            }
          })
        continue
      }
      const words = path.endsWith('.json') ? jsonDictionaryStrings(path, text) : dictionaryStrings(text)
      // The page's language; a language the dictionary does not spell out reads English, as the
      // template's own `wordsOf` does. No language known: every language, and let the value decide.
      const held = new Set(words.map((one) => one.locale.toLowerCase()))
      const take = lower === null ? null : held.has(lower) ? lower : held.has('en') ? 'en' : null
      for (const one of words) {
        if (take !== null && one.locale.toLowerCase() !== take) continue
        const key = `${one.locale}.${one.key}`
        entries.push({
          text: one.value,
          origin: {
            unit: `string:${path}#${key}`,
            kind: 'string',
            file: path,
            ...(one.line ? { line: one.line } : {}),
            key,
            locale: one.locale,
            editable: false,
            why: EMDASH_WHY,
            owners: []
          }
        })
      }
    }
    return entries
  }
  return entries
}

// ── The index ───────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {import('./content-locate.js').ValueIndex & { origins: Map<string, Origin>,
 *   truncated: boolean, markOwns: (hit: any, mark: string) => boolean }} StringIndex
 */

/**
 * The value index of string entries: the records' index shape (`matchValue` reads both), each unit
 * a "record" of type `string` or `file`, plus each unit's origin.
 * @param {Entry[]} entries
 * @param {{ maxUnits?: number }} [options]
 * @returns {StringIndex}
 */
export function indexStrings(entries, { maxUnits = STRING_MAX_UNITS } = {}) {
  /** @type {Map<string, Origin>} */
  const origins = new Map()
  const index = /** @type {StringIndex} */ ({
    ...emptyIndex(null),
    origins,
    truncated: false,
    markOwns: (hit, mark) => markOwnsUnit({ owners: hit?.where?.owners ?? [] }, mark)
  })
  const { addText, addHtml, addImage } = indexAdders(index)
  for (const entry of entries) {
    const origin = entry.origin
    if (!origins.has(origin.unit)) {
      if (origins.size >= maxUnits) {
        index.truncated = true
        continue
      }
      origins.set(origin.unit, origin)
      index.meta.set(origin.unit, {
        id: origin.unit,
        type: origin.kind,
        title: null,
        slug: null,
        url: null,
        revision: null,
        native: null,
        locale: null,
        twins: [],
        keys: new Map(),
        blockKeys: new Set(),
        shares: new Set()
      })
    }
    // Where in the unit, and what owns THAT spot: a template file holds words of many blocks, so a
    // mark is judged against the block around these words, not against the whole file.
    const hit = {
      contentId: origin.unit,
      where: { field: origin.kind, ...(origin.line ? { line: origin.line } : {}), owners: origin.owners }
    }
    if (entry.image) addImage(entry.image, hit)
    else if (entry.html) addHtml(entry.text, hit)
    else addText(entry.text, hit)
  }
  return index
}

/**
 * Does this unit belong to what `mark` names? A mark is `<owner> block:<name>` (Joomla spike marks
 * say `mod:<name>`): the block or module that printed the element. A unit belongs to it when its
 * file is that block's renderer (`core/navigation`), sits in that plugin's, theme's or module's
 * folder (`polylang/…` → `ns:polylang`; `mod_languages` → `ext:mod_languages`), or its words sit in
 * that block inside a template. A `part:<slug>` owner owns the words of the theme's `parts/<slug>.html`.
 * @param {Origin} origin
 * @param {string} mark
 */
export function markOwnsUnit(origin, mark) {
  if (typeof mark !== 'string') return false
  const words = mark.trim().split(/\s+/)
  const owner = words[0] ?? ''
  if (owner.startsWith('part:') && origin.owners.includes(owner)) return true
  for (const word of words) {
    const match = /^(?:block|mod):(\S+)$/.exec(word)
    if (!match) continue
    const name = match[1]
    if (origin.owners.includes(name) || origin.owners.includes(`ext:${name}`)) return true
    const ns = name.includes('/') ? name.split('/')[0] : null
    if (ns && ns !== 'core' && origin.owners.includes(`ns:${ns}`)) return true
  }
  return false
}

// ── The store ───────────────────────────────────────────────────────────────────────────────────

/**
 * STRING INDEXES, IN MEMORY, PER PROCESS — one per site + locale, like the record snapshots. The
 * file set is revalidated on every call by its fingerprint (the host answers `unchanged` with no
 * bytes), and read again from nothing after `STRING_MAX_AGE_MS`. A read that failed or was cut short
 * (`truncated`, the unit cap) is never kept and makes the answer `incomplete`. A site the host has no
 * webroot for (404), or a host older than the door answering an EmDash site `platform: null`, has no
 * string source at all — that is not an incomplete answer, it is a smaller one.
 * @param {{ now?: () => number, maxAgeMs?: number, maxUnits?: number }} [options]
 */
export function createStringStore(options = {}) {
  const { now = Date.now, maxAgeMs = STRING_MAX_AGE_MS, maxUnits = STRING_MAX_UNITS } = options
  /** @type {Map<string, { at: number, fingerprint: string, index: StringIndex|null }>} */
  const kept = new Map()

  /**
   * @param {{ siteKey: string, locale: string|null,
   *   read: (asked: { locale: string|null, known: string|null }) => Promise<{ ok: boolean, status: number, body: any }> }} input
   * @returns {Promise<{ index: StringIndex|null, incomplete: boolean }>}
   */
  async function stringsFor({ siteKey, locale, read }) {
    const key = JSON.stringify([siteKey, locale ?? null])
    let held = kept.get(key)
    if (held && now() - held.at > maxAgeMs) {
      kept.delete(key)
      held = undefined
    }
    const answer = await read({ locale: locale ?? null, known: held?.fingerprint ?? null }).catch(() => null)
    if (answer?.status === 404) return { index: null, incomplete: false }
    const body = answer?.ok ? answer.body : null
    if (!body || typeof body !== 'object') return { index: held?.index ?? null, incomplete: true }
    if (body.unchanged === true && held && body.fingerprint === held.fingerprint)
      return { index: held.index, incomplete: false }
    if (body.platform === null) return { index: null, incomplete: false }
    if (!Array.isArray(body.files)) return { index: held?.index ?? null, incomplete: true }
    const index = indexStrings(
      stringEntries({ platform: body.platform, locale, files: body.files, images: body.images ?? [] }),
      { maxUnits }
    )
    const whole = body.truncated !== true && !index.truncated && typeof body.fingerprint === 'string'
    if (whole) kept.set(key, { at: now(), fingerprint: body.fingerprint, index })
    else kept.delete(key)
    return { index, incomplete: !whole }
  }

  return {
    stringsFor,
    /** Forget every index (tests; a deploy restarts the process anyway). */
    clear() {
      kept.clear()
    }
  }
}
