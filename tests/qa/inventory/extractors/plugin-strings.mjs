// Plugin `strings.ts` files: namespace (`export const NS`) and the number of `en` keys, by AST.
// A file that declares no static NS/en is listed as unresolved, never skipped.
import {
  cli,
  isMain,
  listFiles,
  loc,
  parse,
  readSource,
  record,
  isUnresolved,
  staticValue,
  topLevelConsts
} from './common.mjs'

export const def = {
  sourcePath: 'packages/**/strings.ts',
  extractionKind: 'ast-namespace-and-keys',
  extract(root) {
    const { files } = listFiles(
      root,
      'packages',
      (f) => f.endsWith('/strings.ts') && !f.includes('/dist/') && !f.includes('/lib/')
    )
    const read = []
    const items = []
    const unresolved = []
    for (const rel of files) {
      const src = readSource(root, rel)
      read.push(src)
      const sf = parse(src.text, rel)
      const consts = topLevelConsts(sf)
      // Blocking: the namespace and its keys are this source's denominator, so a key the resolver cannot
      // see (a spread of an imported table, a computed key) is a lost item, not a harmless note.
      const ctx = { consts, unresolved: [], sf, blocking: true }
      const ns = consts.has('NS') ? staticValue(consts.get('NS'), ctx) : undefined
      const en = consts.has('en') ? staticValue(consts.get('en'), ctx) : undefined
      const nsOk = typeof ns === 'string'
      const enOk = !!en && typeof en === 'object' && !Array.isArray(en) && !isUnresolved(en)
      for (const u of ctx.unresolved) unresolved.push({ ...u, loc: u.loc ?? loc(sf, sf) })
      if (!nsOk || !enOk)
        unresolved.push({
          kind: 'strings-file-not-static',
          detail: `${rel}: NS ${nsOk ? 'string' : typeof ns}, en ${en === undefined ? 'missing' : enOk ? 'object' : typeof en}`,
          loc: rel,
          blocksComplete: true
        })
      const partial = ctx.unresolved.length > 0 || !nsOk || !enOk
      items.push({
        id: `plugin-strings:${rel}`,
        kind: 'plugin-strings',
        file: rel,
        namespace: nsOk ? ns : null,
        // Only a fully resolved table has a key count; a partial one keeps what was seen as `keysKnown`.
        keys: partial || !enOk ? null : Object.keys(en).length,
        ...(enOk && partial ? { keysKnown: Object.keys(en).length } : {})
      })
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
