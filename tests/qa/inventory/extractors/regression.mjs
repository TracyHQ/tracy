// Regression catalogue: one JSON file per fixed bug or feature in tests/regression/cases/.
import { cli, isMain, listFiles, parseJson, readSource, record } from './common.mjs'

const DIR = 'tests/regression/cases'

export const def = {
  sourcePath: `${DIR}/*.json`,
  extractionKind: 'json-directory',
  extract(root) {
    const { files, skipped } = listFiles(root, DIR, (f) => f.endsWith('.json'))
    const read = []
    const items = []
    const unresolved = skipped.map((s) => ({ kind: 'symlink-skipped', detail: s }))
    for (const rel of files) {
      const src = readSource(root, rel)
      read.push(src)
      const c = parseJson(src)
      if (typeof c.id !== 'string') {
        unresolved.push({ kind: 'case-without-id', detail: rel })
        continue
      }
      items.push({
        id: `regression:${c.id}`,
        kind: 'regression',
        caseId: c.id,
        caseKind: c.kind ?? null,
        area: c.area ?? null,
        pr: c.pr ?? null,
        hasRun: Boolean(c.run),
        flakyModel: c.flaky_model === true,
        needs: c.needs ?? [],
        file: rel
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
