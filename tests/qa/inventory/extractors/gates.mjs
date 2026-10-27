// Static gates: the `GATES` array of scripts/check-all.ts, read by AST (the file is never run).
import ts from 'typescript'
import {
  cli,
  findConst,
  isMain,
  loc,
  parse,
  readSource,
  record,
  staticValue,
  topLevelConsts,
  SourceError
} from './common.mjs'

const SRC = 'scripts/check-all.ts'

export const def = {
  sourcePath: SRC,
  extractionKind: 'ast-array-literal',
  extract(root) {
    const src = readSource(root, SRC)
    const sf = parse(src.text, SRC)
    const init = findConst(sf, 'GATES')
    if (!init) throw new SourceError('GATES constant not found')
    const arr = ts.isArrayLiteralExpression(init) ? init : null
    if (!arr) throw new SourceError('GATES is not an array literal')
    const ctx = { consts: topLevelConsts(sf), unresolved: [], sf }
    const items = []
    for (const el of arr.elements) {
      const before = ctx.unresolved.length
      const v = staticValue(el, ctx)
      for (const u of ctx.unresolved.slice(before)) u.blocksComplete = true
      if (!v || typeof v.name !== 'string' || typeof v.script !== 'string') {
        ctx.unresolved.push({
          kind: 'gate-not-static',
          detail: el.getText().slice(0, 80),
          loc: loc(sf, el),
          blocksComplete: true
        })
        continue
      }
      items.push({
        id: `gate:${v.name}`,
        kind: 'gate',
        name: v.name,
        script: `scripts/${v.script}`,
        args: v.args ?? [],
        loc: loc(sf, el)
      })
    }
    return record({
      sourcePath: SRC,
      read: [src],
      extractionKind: this.extractionKind,
      items,
      unresolved: ctx.unresolved,
      root
    })
  }
}
if (isMain(import.meta.url)) cli(def)
