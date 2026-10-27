// Per-site fence tables of tracy-subprocess-docker: FS_TOOL_ARGS and WORKDIR_ARG (ADR 0014 §3), by AST.
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

const SRC = 'packages/tools/tracy-subprocess-docker/src/route.mjs'

export const def = {
  sourcePath: SRC,
  extractionKind: 'ast-object-literal',
  extract(root) {
    const src = readSource(root, SRC)
    const sf = parse(src.text, SRC)
    const ctx = { consts: topLevelConsts(sf), unresolved: [], sf, blocking: true }
    const items = []
    for (const [name, kind, prefix] of [
      ['FS_TOOL_ARGS', 'fence-fs-tool', 'fence-fs'],
      ['WORKDIR_ARG', 'fence-workdir', 'fence-workdir']
    ]) {
      const init = findConst(sf, name)
      if (!init) throw new SourceError(`${name} not found`)
      const table = staticValue(init, ctx)
      if (!table || typeof table !== 'object') throw new SourceError(`${name} is not a static object`)
      for (const [tool, spec] of Object.entries(table)) {
        items.push({
          id: `${prefix}:${tool}`,
          kind,
          tool,
          paths: spec?.paths ?? (typeof spec === 'string' ? [spec] : []),
          content: spec?.content ?? []
        })
      }
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
