// Mail: notification kinds (keys of TEAM_LETTERS / COMMENT_LETTERS, by AST), mail renderer modules, and HTML templates.
// The renderer functions are never called: only the declared kinds are read.
import ts from 'typescript'
import {
  cli,
  findConst,
  isMain,
  listFiles,
  loc,
  parse,
  propName,
  readSource,
  record,
  strip
} from './common.mjs'

const LETTERS = [
  ['apps/tracy-web/src/mail/letters/team.js', 'TEAM_LETTERS'],
  ['apps/tracy-web/src/mail/letters/comments.js', 'COMMENT_LETTERS']
]

function objectOf(init) {
  let n = strip(init)
  if (n && ts.isCallExpression(n) && n.expression.getText() === 'Object.freeze' && n.arguments.length === 1)
    n = strip(n.arguments[0])
  return n && ts.isObjectLiteralExpression(n) ? n : null
}

export const def = {
  sourcePath: 'apps/tracy-web/src/mail/**',
  extractionKind: 'ast-object-keys + directory-listing',
  extract(root) {
    const read = []
    const items = []
    const unresolved = []
    for (const [rel, name] of LETTERS) {
      const src = readSource(root, rel)
      read.push(src)
      const sf = parse(src.text, rel)
      const init = findConst(sf, name)
      const obj = init ? objectOf(init) : null
      if (!obj) {
        unresolved.push({
          kind: 'letters-table-not-literal',
          detail: `${name} in ${rel}`,
          blocksComplete: true
        })
        continue
      }
      for (const p of obj.properties) {
        const key = ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) ? propName(p.name) : null
        if (key === null)
          unresolved.push({
            kind: 'letter-key-not-static',
            detail: p.getText().slice(0, 60),
            loc: loc(sf, p),
            blocksComplete: true
          })
        else
          items.push({
            id: `mail-kind:${key}`,
            kind: 'mail-kind',
            notificationKind: key,
            table: name,
            file: rel
          })
      }
    }
    const idx = readSource(root, 'apps/tracy-web/src/mail/letters/index.js')
    read.push(idx)
    // index.js must still compose exactly these two tables; a third table would hide kinds.
    const spreads = [...idx.text.matchAll(/\.\.\.([A-Z_]+LETTERS)\b/g)].map((m) => m[1])
    for (const s of spreads)
      if (!LETTERS.some(([, n]) => n === s))
        unresolved.push({ kind: 'letters-index-spreads-unknown-table', detail: s, blocksComplete: true })
    const mods = listFiles(
      root,
      'apps/tracy-web/src/mail',
      (f) => f.endsWith('.js') && !f.includes('/site-mail/') && !f.includes('/letters/')
    )
    for (const rel of mods.files) {
      read.push(readSource(root, rel))
      items.push({ id: `mail-renderer:${rel}`, kind: 'mail-renderer', file: rel })
    }
    const html = listFiles(root, 'apps/tracy-web/src/mail/templates', (f) => f.endsWith('.html'))
    for (const rel of html.files) {
      read.push(readSource(root, rel))
      items.push({ id: `mail-html:${rel}`, kind: 'mail-html', file: rel })
    }
    return record({
      sourcePath: this.sourcePath,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root
    })
  }
}
if (isMain(import.meta.url)) cli(def)
