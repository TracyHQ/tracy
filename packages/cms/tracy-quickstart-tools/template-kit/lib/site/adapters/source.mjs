// How a CMS adapter reads a site, read-only: rows of its database and files of its web root. Both are given on the
// command line as command prefixes, so a site in a container, behind a tunnel or on this machine is read the same way:
//
//   --db mysql://user:pass@host:port/name     the local `mysql` client
//   --db-command '<prefix>'                   any client that takes `--batch -e <sql>` (a container's `mariadb`)
//   --files-command '<prefix>' --webroot <dir>  `<prefix> cat <dir>/<file>` (a container); without a prefix, local files
//
// Only SELECT statements are ever sent; a statement that is not one is refused before it leaves.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const split = (s) =>
  String(s ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

/** The command prefix of a `mysql://` address. */
export function mysqlPrefix(url) {
  const u = new URL(url)
  const pass = decodeURIComponent(u.password)
  return [
    'mysql',
    '-h',
    u.hostname,
    '-P',
    u.port || '3306',
    '-u',
    decodeURIComponent(u.username),
    ...(pass ? [`-p${pass}`] : []),
    u.pathname.replace(/^\//, '')
  ]
}

/** Rows of a `--batch` answer: a header line, then tab-separated values with `\n`, `\t`, `\\` escaped. */
export function parseBatch(text) {
  const lines = String(text ?? '')
    .split('\n')
    .filter((l) => l.length)
  if (!lines.length) return []
  const unescape = (v) =>
    v === 'NULL' ? null : v.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', 0: '\0', '\\': '\\' })[c] ?? c)
  const head = lines[0].split('\t')
  return lines.slice(1).map((l) => {
    const cells = l.split('\t')
    return Object.fromEntries(head.map((h, i) => [h, unescape(cells[i] ?? '')]))
  })
}

/**
 * @param {{db?: string, dbCommand?: string, filesCommand?: string, webroot?: string}} o
 * @returns {{query: Function|null, queryMany: Function|null, readFile: Function|null, readMany: Function|null, listDir: Function|null, describe: string[]}}
 *   Every answer is kept: the same statement or file is read once; `queryMany` and `readMany` cost one exec each.
 */
export function siteSource({ db, dbCommand, filesCommand, webroot }) {
  const prefix = db ? mysqlPrefix(db) : dbCommand ? split(dbCommand) : null
  // One exec runs every statement it is given: the answers are split on a marker row between statements.
  const MARK_ROW = 'kit_mark\n@@template-kit-next\n'
  const run = (sqls) => {
    for (const sql of sqls)
      if (!/^\s*(select|show)\b/i.test(sql))
        throw new Error('only SELECT and SHOW statements are sent to a site')
    const joined = sqls
      .map((q) => q.replace(/;\s*$/, ''))
      .join("; SELECT '@@template-kit-next' AS kit_mark; ")
    const out = execFileSync(prefix[0], [...prefix.slice(1), '--batch', '-e', joined], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    })
    const parts = out.split(MARK_ROW)
    return sqls.map((_, i) => parseBatch(parts[i] ?? ''))
  }
  const answered = new Map()
  const queryMany = prefix
    ? (sqls) => {
        const todo = [...new Set(sqls.filter((q) => !answered.has(q)))]
        if (todo.length) for (const [i, rows] of run(todo).entries()) answered.set(todo[i], rows)
        return sqls.map((q) => answered.get(q))
      }
    : null
  const query = prefix ? (sql) => queryMany([sql])[0] : null
  const files = filesCommand ? split(filesCommand) : null
  const known = new Map() // file -> text (null: not there), filled by readFile and readMany
  const readFile = webroot
    ? (rel) => {
        if (known.has(rel)) return known.get(rel)
        known.set(rel, readOne(rel))
        return known.get(rel)
      }
    : null
  const readOne = webroot
    ? (rel) => {
        try {
          if (!files) return readFileSync(join(webroot, rel), 'utf8')
          return execFileSync(files[0], [...files.slice(1), 'cat', `${webroot}/${rel}`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 16 * 1024 * 1024
          })
        } catch {
          return null
        }
      }
    : null
  // One call for many files: each answer starts with a marker line naming the file (a container answers in one exec).
  const MARK = '@@template-kit-file '
  const readMany = webroot
    ? (rels) => {
        if (!files) return rels.map((rel) => ({ file: rel, text: readFile(rel) }))
        const todo = rels.filter((r) => !known.has(r))
        if (todo.length) for (const f of readBatch(todo)) known.set(f.file, f.text || null)
        for (const r of todo) if (!known.has(r)) known.set(r, null)
        return rels.map((rel) => ({ file: rel, text: known.get(rel) ?? '' }))
      }
    : null
  const readBatch = webroot
    ? (rels) => {
        try {
          const script = `for f in "$@"; do echo "${MARK}$f"; cat "${webroot}/$f" 2>/dev/null; echo; done`
          const out = execFileSync(files[0], [...files.slice(1), 'sh', '-c', script, 'sh', ...rels], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            maxBuffer: 64 * 1024 * 1024
          })
          return out
            .split(MARK)
            .slice(1)
            .map((chunk) => {
              const at = chunk.indexOf('\n')
              return { file: chunk.slice(0, at), text: chunk.slice(at + 1) }
            })
        } catch {
          return []
        }
      }
    : null
  const listDir = webroot
    ? (rel) => {
        try {
          const text = files
            ? execFileSync(files[0], [...files.slice(1), 'ls', '-1', `${webroot}/${rel}`], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
              })
            : readdirSync(join(webroot, rel)).join('\n')
          return text.split('\n').filter(Boolean)
        } catch {
          return []
        }
      }
    : null
  return {
    query,
    queryMany,
    readFile,
    readMany,
    listDir,
    describe: [query ? 'database' : null, readFile ? 'web root files' : null].filter(Boolean)
  }
}
