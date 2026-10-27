// UI switches: the catalogue is the ONLY list (CLAUDE.md §8); read as JSON.
import { cli, isMain, parseJson, readSource, record, SourceError } from './common.mjs'

const SRC = 'packages/core/tracy-core/src/ui-switches/catalogue.json'

export const def = {
  sourcePath: SRC,
  extractionKind: 'json',
  extract(root) {
    const src = readSource(root, SRC)
    const json = parseJson(src)
    if (!Array.isArray(json.switches)) throw new SourceError('catalogue.switches is not an array')
    const groups = new Map((json.groups ?? []).map((g) => [g.id, g]))
    const areaOf = new Map()
    for (const a of json.areas ?? []) for (const g of a.groups ?? []) areaOf.set(g, a.id)
    const items = json.switches.map((s) => ({
      id: `ui-switch:${s.id}`,
      kind: 'ui-switch',
      switchId: s.id,
      group: s.group ?? null,
      area: areaOf.get(s.group) ?? null,
      defaultOn: s.defaultOn,
      locked: s.locked ?? null,
      drawnBy: s.drawnBy ?? null
    }))
    const unresolved = []
    for (const s of json.switches) {
      if (!groups.has(s.group))
        unresolved.push({ kind: 'switch-group-unknown', detail: `${s.id} -> ${s.group}` })
      else if (!areaOf.has(s.group))
        unresolved.push({ kind: 'switch-area-unknown', detail: `${s.id} group ${s.group} is in no area` })
    }
    return record({
      sourcePath: SRC,
      read: [src],
      extractionKind: this.extractionKind,
      items,
      unresolved,
      root
    })
  }
}
if (isMain(import.meta.url)) cli(def)
