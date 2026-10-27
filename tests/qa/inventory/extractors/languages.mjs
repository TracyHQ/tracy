// Interface languages: INTERFACE_LANGUAGES of @tracy/core/interface-languages, read by AST.
import {
  cli,
  findConst,
  isMain,
  parse,
  readSource,
  record,
  staticValue,
  topLevelConsts,
  SourceError
} from './common.mjs'

const SRC = 'packages/core/tracy-core/src/interface-languages/index.mjs'

export const def = {
  sourcePath: SRC,
  extractionKind: 'ast-static-literal',
  extract(root) {
    const src = readSource(root, SRC)
    const sf = parse(src.text, SRC)
    const init = findConst(sf, 'INTERFACE_LANGUAGES')
    if (!init) throw new SourceError('INTERFACE_LANGUAGES not found')
    const ctx = { consts: topLevelConsts(sf), unresolved: [], sf, blocking: true }
    const value = staticValue(init, ctx)
    const list = Array.isArray(value) ? value : []
    for (const l of list)
      if (!l || typeof l.id !== 'string')
        ctx.unresolved.push({
          kind: 'language-without-id',
          detail: JSON.stringify(l) ?? String(l),
          blocksComplete: true
        })
    const items = list
      .filter((l) => l && typeof l.id === 'string')
      .map((l) => ({
        id: `language:${l.id}`,
        kind: 'language',
        code: l.id,
        label: l.label,
        shown: l.shown === true
      }))
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
