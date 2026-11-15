// The source resolver of the marker test (ticket #585): the true source of a word, a link or a picture a page shows
// that is no marker. The sources are searched in this order, and the first that holds the value names it:
//   block_field   a place of the blank site contract (its slot, and the block field the mapping declares there)
//   write         a value the write step wrote that holds no marker (its plan entry), or a value of the site's own
//                 records the caller read (the account name an article prints)
//   data          a value of the site's own data (the archive's demo data: table); `setting` when the table holds
//                 settings (a template style's or an extension's params)
//   language      a language string (file, key, and whose: core, template, extension, site override)
//   setting       a settings file of the template (its local settings, its manifest)
//   literal       a literal of a layout, script or manifest file (whose: template, module, plugin, component, core)
//   stylesheet    a stylesheet that draws it (generated words, a picture)
//   picture_file  a picture file the archive ships
//   outside       another host
// A value none of them holds is `{class: 'unknown', searched}`. Takes the archive's files, the blank site contract and
// the mapping as input: nothing here names a template.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const list = (value) => (Array.isArray(value) ? value : [])
/** The search order, in the words of the record. */
export const SEARCH_ORDER = Object.freeze([
  'block_field',
  'write',
  'data',
  'language',
  'setting',
  'literal',
  'stylesheet',
  'picture_file',
  'outside'
])
const READ = /\.(?:ini|php|css|sql|js|json|xml)$/i
const WANTED = [
  'language/en-GB/*.ini',
  'language/overrides/*.ini',
  'templates/*',
  'media/templates/*',
  'plugins/*',
  'modules/*',
  'components/*',
  'layouts/*',
  'installation/sql/mysql/custom.sql'
]

/** The text files of an installer archive the resolver reads: `{files: Map<path, text>, names}`. */
export function filesOf(zip) {
  const names = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 256 << 20 })
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
  const dir = mkdtempSync(path.join(tmpdir(), 'gate-sources-'))
  const files = new Map()
  try {
    execFileSync('unzip', ['-qq', '-o', zip, ...WANTED, '-d', dir], { maxBuffer: 64 << 20, stdio: 'ignore' })
  } catch {}
  try {
    for (const rel of readdirSync(dir, { recursive: true })) {
      const full = path.join(dir, rel)
      if (READ.test(rel) && statSync(full).isFile() && statSync(full).size < 4 << 20)
        files.set(rel.split(path.sep).join('/'), readFileSync(full, 'utf8'))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return { files, names }
}

const squash = (t) =>
  String(t ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** A placeholder of a language string: `%s`, `%1$s`, `%d`, and Joomla's named ones (`%sitename%`). */
const PLACEHOLDER = /%[a-z_]+%|%(?:\d\$)?[sdu]/gi
const PLACEHOLDER_SPACED = /\s*(?:%[a-z_]+%|%(?:\d\$)?[sdu])\s*/gi
/** The few entities language strings write. */
const entities = (t) =>
  t
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&copy;/g, '\u00a9')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

/** Whose a file of the archive is: the template, a module, a plugin, a component, the core, the site. */
export function ownerOf(file) {
  const f = String(file)
  if (f.startsWith('language/overrides/')) return { owner: 'site_override' }
  const lang = /^language\/[^/]+\/(?:[a-z]{2}-[A-Z]{2}\.)?([a-z0-9_]+)\.(?:sys\.)?ini$/.exec(f)
  if (lang) {
    const name = lang[1]
    if (/^(?:joomla|lib_joomla|[a-z]{2}-[A-Z]{2})$/.test(name) || !name.includes('_'))
      return { owner: 'core', extension: name }
    if (name.startsWith('tpl_')) return { owner: 'template', extension: name }
    return { owner: 'extension', extension: name }
  }
  const m =
    /^(?:media\/)?templates\/(?:site\/)?([^/]+)\//.exec(f) ??
    /^(modules|plugins|components)\/((?:[^/]+\/)?[^/]+)\//.exec(f)
  if (m && m.length === 2) return { owner: 'template', extension: m[1] }
  if (m) return { owner: m[1].replace(/s$/, ''), extension: m[2] }
  if (f.startsWith('layouts/')) return { owner: 'core', extension: 'layouts' }
  return { owner: 'site' }
}

/** Every language string of the files: `[{file, key, value, re}]` (a `%s` / `%d` reads any words). */
function languageOf(files) {
  const out = []
  for (const [file, text] of files) {
    if (!file.endsWith('.ini')) continue
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_.-]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:;.*)?$/.exec(line)
      if (!m || !m[2].trim()) continue
      const value = entities(m[2].replace(/\\"/g, '"').replace(/<[^>]+>/g, ' '))
      // A string with a placeholder reads any words in its place, when its own words are enough to tell it apart.
      const literal = value.replace(PLACEHOLDER, '').replace(/[^\p{L}]/gu, '')
      // Each placeholder is a capture: what fills it is reported (`fills`), so a kept string never exempts its fill.
      const pattern = escapeRe(squash(value)).replace(PLACEHOLDER_SPACED, '\\s*(.*?)\\s*')
      out.push({ file, key: m[1], value, re: literal.length >= 4 ? new RegExp(`^${pattern}$`) : null })
    }
  }
  // Overrides first: the site's own value of a key wins over the file it overrides.
  return out.sort((a, b) => Number(b.file.includes('overrides')) - Number(a.file.includes('overrides')))
}

/** The slots of the blank site contract by their words, with the block field the mapping declares there. */
function slotsOf(contentMap, mapping) {
  const fieldOf = new Map()
  const walk = (value, at) => {
    if (Array.isArray(value)) return value.forEach((v) => walk(v, at))
    if (!value || typeof value !== 'object') return
    if (typeof value.slot === 'string') fieldOf.set(value.slot, at)
    for (const v of Object.values(value)) walk(v, at)
  }
  for (const [block, d] of Object.entries(mapping?.blocks ?? {}))
    for (const part of ['fields', 'itemFields'])
      for (const [field, v] of Object.entries(d?.[part] ?? {})) walk(v, { block, field })
  // A slot of a language string entity is that language string, whichever slot the contract gives it.
  const strings = new Map()
  for (const e of list(contentMap?.entities))
    if (e?.kind === 'languageString' && e.identity?.key) strings.set(e.key, e.identity)
  const out = new Map()
  for (const s of list(contentMap?.slots))
    if (typeof s?.sample === 'string' && squash(s.sample) && !out.has(squash(s.sample)))
      out.set(squash(s.sample), {
        slot: s.key,
        entity: s.entity ?? null,
        string: strings.get(s.entity) ?? null,
        ...fieldOf.get(s.key)
      })
  return out
}

/** What fills each placeholder of a language string, in the words the page printed. */
const fillsOf = (re, value) =>
  (new RegExp(re.source, 'i').exec(String(value).replace(/\s+/g, ' ').trim()) ?? [])
    .slice(1)
    .map((f) => f.trim())

/** Whose a language string is, by its extension name (`tpl_`, `com_`, `mod_`, `plg_`, or the core's own files). */
const ownerOfExtension = (extension) =>
  String(extension ?? '').startsWith('tpl_')
    ? 'template'
    : /^(?:com|mod|plg|pkg|lib)_/.test(extension ?? '')
      ? 'extension'
      : 'core'

/** The table of the INSERT a dump offset sits in. */
function tableAt(dump, at) {
  const head = dump.lastIndexOf('INSERT INTO', at)
  return head < 0 ? null : (/INSERT INTO [`"]?([\w#]+)/.exec(dump.slice(head, head + 120))?.[1] ?? null)
}

const SETTING_TABLES = /(?:template_styles|extensions)$/
const SETTING_FILE = /^templates\/[^/]+\/(?:.*\.json|templateDetails\.xml)$/

/**
 * A resolver over the archive's files.
 * @param {{files: Map<string, string>, names: string[]}} archive
 * @param {{site?: string, contentMap?: object, mapping?: object, writes?: Map<string, object>}} [options] `site`: the
 *   site's origin; `contentMap`: the blank site contract's content map; `writes`: values the write wrote or the site
 *   holds that are no marker, by value, with their source
 * @returns {{text: (value: string) => object, picture: (url: string) => object}}
 */
export function sourceResolver(
  { files, names },
  { site = null, contentMap = null, mapping = null, writes } = {}
) {
  const language = languageOf(files)
  const exact = new Map()
  for (const l of language) if (!exact.has(squash(l.value))) exact.set(squash(l.value), l)
  const slots = slotsOf(contentMap, mapping)
  const of = (re) => [...files].filter(([f]) => re.test(f))
  const literals = of(/\.(?:php|js|xml)$/).filter(([f]) => !SETTING_FILE.test(f))
  const settings = of(SETTING_FILE)
  const sheets = of(/\.css$/)
  const dump = files.get('installation/sql/mysql/custom.sql') ?? ''
  const dumpLow = dump.toLowerCase()
  const nameSet = new Set(names)
  const quoted = (body, v) =>
    body.includes(`"${v}"`) ||
    body.includes(`'${v}'`) ||
    body.includes(`\\"${v}\\"`) ||
    body.includes(`>${v}<`)

  // Every language string by its exact words (several keys may print the same words).
  const exactAll = new Map()
  for (const l of language) {
    const k = squash(l.value)
    if (!exactAll.has(k)) exactAll.set(k, [])
    if (!exactAll.get(k).some((x) => x.key === l.key)) exactAll.get(k).push(l)
  }

  /** Every source that holds the words, in the search order (`SEARCH_ORDER`; a value of the site's records alone). */
  const textCandidates = (value) => {
    const v = squash(value)
    const out = []
    const slot = slots.get(v)
    if (slot?.string) {
      const { key, extension, language: lang } = slot.string
      out.push({
        class: 'language',
        key,
        extension,
        language: lang,
        file: language.find((x) => x.key === key)?.file ?? null,
        slot: slot.slot,
        owner: ownerOfExtension(extension),
        fills: []
      })
    } else if (slot) {
      const { string: _none, ...place } = slot
      out.push({ class: 'block_field', ...place })
    } else {
      // A value of the site's own records (the account the write made the records as) is that value, alone.
      const w = writes?.get(String(value).trim())
      if (w) return [{ class: 'write', ...w }]
      // A contract slot is a row of the dump: the dump is another source only when no slot holds the words.
      const at = [`'${v.replace(/'/g, "\\'")}'`, `\\"${v}\\"`, `"${v}"`]
        .map((q) => dumpLow.indexOf(q))
        .find((i) => i >= 0)
      if (at !== undefined) {
        const table = tableAt(dump, at)
        out.push({
          class: SETTING_TABLES.test(table ?? '') ? 'setting' : 'data',
          file: 'installation/sql/mysql/custom.sql',
          table
        })
      }
    }
    const strings = exactAll.get(v) ?? language.filter((x) => x.re?.test(v))
    for (const l of strings)
      if (!out.some((c) => c.class === 'language' && c.key === l.key))
        out.push({
          class: 'language',
          file: l.file,
          key: l.key,
          ...ownerOf(l.file),
          fills: exactAll.has(v) ? [] : fillsOf(l.re, value)
        })
    const setting = settings.find(([, body]) => quoted(body.toLowerCase(), v))
    if (setting) out.push({ class: 'setting', file: setting[0], ...ownerOf(setting[0]) })
    // A literal: the words alone between tags or quotes (a short word inside a longer one is not it).
    const literal = new RegExp(`(^|[>'"])\\s*${escapeRe(v)}\\s*([<'"]|$)`, 'im')
    const lit = literals.find(([, body]) => literal.test(body))
    if (lit) out.push({ class: 'literal', file: lit[0], ...ownerOf(lit[0]) })
    const sheet = sheets.find(([, body]) => quoted(body.toLowerCase(), v))
    if (sheet) out.push({ class: 'stylesheet', file: sheet[0], ...ownerOf(sheet[0]) })
    return out
  }

  // One source, or `ambiguous` with every candidate (the first in the search order is the `likely` one), or unknown.
  const text = (value) => {
    if (!squash(value)) return { class: 'unknown', searched: [] }
    const all = textCandidates(value)
    if (!all.length) return { class: 'unknown', searched: SEARCH_ORDER.slice(0, 8) }
    return all.length === 1 ? all[0] : { class: 'ambiguous', likely: all[0], candidates: all }
  }

  const picture = (url) => {
    const u = String(url ?? '')
    if (/^data:/i.test(u)) {
      // An inline picture: the file that writes it (its first characters after the type).
      const head = u.slice(0, 80)
      for (const [file, body] of [...sheets, ...literals])
        if (body.includes(head))
          return { class: file.endsWith('.css') ? 'stylesheet' : 'literal', file, ...ownerOf(file) }
      return { class: 'unknown', searched: ['stylesheet', 'literal'], inline: true }
    }
    let p
    try {
      p = decodeURIComponent(new URL(u, 'http://site.invalid/').pathname).replace(/^\/+/, '')
    } catch {
      return { class: 'unknown', searched: [] }
    }
    if (/^https?:/i.test(u) && site && !u.startsWith(site)) {
      let host = null
      try {
        host = new URL(u).host
      } catch {}
      return { class: 'outside', host }
    }
    if (!p) return { class: 'unknown', searched: [] }
    const w = writes?.get(p)
    if (w) return { class: 'write', ...w }
    if (nameSet.has(p)) return { class: 'picture_file', file: p, ...ownerOf(p) }
    const base = p.split('/').pop()
    if (/\.[a-z0-9]{2,5}$/i.test(base)) {
      for (const [file, body] of sheets)
        if (body.includes(base)) return { class: 'stylesheet', file, ...ownerOf(file) }
      if (dump.includes(base))
        return {
          class: 'data',
          file: 'installation/sql/mysql/custom.sql',
          table: tableAt(dump, dump.indexOf(base))
        }
    }
    return { class: 'unknown', searched: ['write', 'picture_file', 'stylesheet', 'data'] }
  }
  return { text, picture }
}
