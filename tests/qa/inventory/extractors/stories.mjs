// Design-bench stories: `*.stories.*` files under packages/dev/tracy-design and their `export const`
// declarations (AST). A story export is a DECLARATION; whether Storybook indexes it is not measured here.
import ts from 'typescript'
import { cli, isMain, listFiles, parse, readSource, record } from './common.mjs'

export const def = {
  sourcePath: 'packages/dev/tracy-design/**/*.stories.*',
  extractionKind: 'ast-exports',
  extract(root) {
    const { files, skipped } = listFiles(root, 'packages/dev/tracy-design', (f) =>
      /\.stories\.[cm]?[jt]sx?$/.test(f)
    )
    const read = []
    const items = []
    const unresolved = skipped.map((s) => ({ kind: 'symlink-skipped', detail: s }))
    for (const rel of files) {
      const src = readSource(root, rel)
      read.push(src)
      const sf = parse(src.text, rel)
      let count = 0
      for (const st of sf.statements) {
        if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
          continue
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name)) {
            unresolved.push({
              kind: 'story-export-destructured',
              detail: `${rel}: ${d.name.getText()}`,
              blocksComplete: true
            })
            continue
          }
          count++
          items.push({
            id: `story-export:${rel}#${d.name.text}`,
            kind: 'story-export',
            file: rel,
            exportName: d.name.text
          })
        }
      }
      items.push({ id: `story-file:${rel}`, kind: 'story-file', file: rel, exports: count })
    }
    return record({
      sourcePath: this.sourcePath,
      read,
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root,
      notes: { storybookIndex: 'not measured; export count is lexical' }
    })
  }
}
if (isMain(import.meta.url)) cli(def)
