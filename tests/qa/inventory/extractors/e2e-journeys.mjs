// E2E-dev journeys: the JOURNEYS array of tests/e2e-dev/run.mjs (AST) crossed with journeys/*.test.mjs.
// `notCovered` (J2c) is kept with its stated reason: a registered journey with no executable case.
import {
  cli,
  findConst,
  isMain,
  listFiles,
  parse,
  readSource,
  record,
  staticValue,
  topLevelConsts,
  SourceError
} from './common.mjs'

const SRC = 'tests/e2e-dev/run.mjs'
const DIR = 'tests/e2e-dev/journeys'

export const def = {
  sourcePath: SRC,
  extractionKind: 'ast-array-literal x directory',
  extract(root) {
    const src = readSource(root, SRC)
    const sf = parse(src.text, SRC)
    const init = findConst(sf, 'JOURNEYS')
    if (!init) throw new SourceError('JOURNEYS not found')
    const ctx = { consts: topLevelConsts(sf), unresolved: [], sf, blocking: true }
    const list = staticValue(init, ctx)
    if (!Array.isArray(list)) throw new SourceError('JOURNEYS is not a static array')
    const { files } = listFiles(root, DIR, (f) => /\/J\w+\.test\.mjs$/.test(f))
    const have = new Set(files.map((f) => f.split('/').pop().replace('.test.mjs', '')))
    const read = [src, ...files.map((f) => readSource(root, f))]
    for (const j of list)
      if (!j || typeof j.id !== 'string')
        ctx.unresolved.push({
          kind: 'journey-without-id',
          detail: JSON.stringify(j) ?? String(j),
          blocksComplete: true
        })
    const items = list
      .filter((j) => j && typeof j.id === 'string')
      .map((j) => ({
        id: `journey:${j.id}`,
        kind: 'journey',
        journey: j.id,
        perCms: j.perCms === true,
        hasFile: have.has(j.id),
        notCovered: j.notCovered ?? null
      }))
    const unresolved = [...ctx.unresolved]
    for (const f of have)
      if (!list.some((j) => j?.id === f)) unresolved.push({ kind: 'journey-file-unregistered', detail: f })
    return record({ sourcePath: SRC, read, extractionKind: this.extractionKind, items, unresolved, root })
  }
}
if (isMain(import.meta.url)) cli(def)
