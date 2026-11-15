// The source resolver of the marker test (ticket #585): where a word or a picture a page shows that is no marker came
// from, read from the installer the site was built from (the blank site archive). A leak is named by its true source:
//   language   a language string (file and key), the site's, the template's or an extension's
//   template   a literal in a template file (a layout or override PHP file of the template)
//   stylesheet a stylesheet that draws it (generated words, a background picture)
//   data       a value of the site's own data (the archive's demo data, table and column when the dump says)
//   file       a picture file the archive ships (template folder, media folder)
// Takes the archive's files as input (`filesOf(zip)` reads them with `unzip`): nothing here names a template.
import { execFileSync } from 'node:child_process'

const TEXT_FILE = /\.(?:ini|php|css|sql)$/i
const WANTED = (name) =>
  (/(^|\/)language\/[^/]+\/[^/]+\.ini$/.test(name) && /(^|\/)(en-GB)\//.test(name)) ||
  /^templates\/[^/]+\/(?:html|tpls|layouts|.*\.php$)/.test(name) ||
  /^plugins\/system\/t4\/.*\.php$/.test(name) ||
  /^(?:modules|components)\/[^/]+\/tmpl\/.*\.php$/.test(name) ||
  /^layouts\/.*\.php$/.test(name) ||
  /^templates\/[^/]+\/css\/[^/]+\.css$/.test(name) ||
  /^installation\/sql\/mysql\/custom\.sql$/.test(name)

/** The text files of an installer archive the resolver reads: `Map<path, text>`, and every entry name. */
export function filesOf(zip) {
  const names = execFileSync('unzip', ['-Z1', zip], { maxBuffer: 256 << 20 })
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
  const files = new Map()
  for (const name of names.filter((n) => TEXT_FILE.test(n) && WANTED(n)))
    files.set(name, execFileSync('unzip', ['-p', zip, name], { maxBuffer: 64 << 20 }).toString('utf8'))
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
      const pattern = escapeRe(squash(value)).replace(PLACEHOLDER_SPACED, '\\s*.*?\\s*')
      out.push({ file, key: m[1], value, re: literal.length >= 4 ? new RegExp(`^${pattern}$`) : null })
    }
  }
  return out
}

/**
 * A resolver over the archive's files.
 * @param {{files: Map<string, string>, names: string[]}} archive
 * @param {{site?: string}} [options] the site's origin: a picture of another host is named by its host
 * @returns {{text: (value: string) => object | null, picture: (url: string) => object | null}}
 */
export function sourceResolver({ files, names }, { site = null } = {}) {
  const language = languageOf(files)
  const exact = new Map()
  for (const l of language) if (!exact.has(squash(l.value))) exact.set(squash(l.value), l)
  const templates = [...files].filter(([f]) => f.endsWith('.php'))
  const sheets = [...files].filter(([f]) => f.endsWith('.css'))
  const dump = files.get('installation/sql/mysql/custom.sql') ?? ''
  const text = (value) => {
    const v = squash(value)
    if (!v) return null
    const l = exact.get(v) ?? language.find((x) => x.re?.test(v))
    if (l) return { kind: 'language', file: l.file, key: l.key }
    for (const [file, body] of sheets)
      if (body.toLowerCase().includes(`"${v}"`) || body.toLowerCase().includes(`'${v}'`))
        return { kind: 'stylesheet', file }
    // A literal of a template file: the words alone between tags or quotes (a short word inside a longer one is not it).
    const literal = new RegExp(`(^|[>'"])\\s*${escapeRe(v)}\\s*([<'"]|$)`, 'im')
    for (const [file, body] of templates) if (literal.test(body)) return { kind: 'template', file }
    const at = dump.toLowerCase().indexOf(`'${v.replace(/'/g, "\\'")}'`)
    // A value inside a JSON column of the dump (a module's settings): quoted, its quotes escaped or not.
    const inJson =
      at >= 0 ? at : Math.max(dump.toLowerCase().indexOf(`\\"${v}\\"`), dump.toLowerCase().indexOf(`"${v}"`))
    if (inJson >= 0)
      return { kind: 'data', file: 'installation/sql/mysql/custom.sql', table: tableAt(dump, inJson) }
    return null
  }
  const picture = (url) => {
    let p
    try {
      p = decodeURIComponent(new URL(url, 'http://site.invalid/').pathname).replace(/^\/+/, '')
    } catch {
      return null
    }
    if (!p) return null
    if (site && !String(url).startsWith(site) && /^https?:/i.test(url))
      return { kind: 'outside', host: new URL(url).host }
    if (names.includes(p)) return { kind: 'file', file: p }
    const base = p.split('/').pop()
    if (/\.[a-z0-9]{2,5}$/i.test(base))
      for (const [file, body] of sheets) if (body.includes(base)) return { kind: 'stylesheet', file }
    return null
  }
  return { text, picture }
}

/** The table of the INSERT a dump offset sits in. */
function tableAt(dump, at) {
  const head = dump.lastIndexOf('INSERT INTO', at)
  return head < 0 ? null : (/INSERT INTO [`"]?([\w#]+)/.exec(dump.slice(head, head + 120))?.[1] ?? null)
}
