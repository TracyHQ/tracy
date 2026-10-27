// Mode matrix (config/mode-matrix.json): role x platform presets, tool rows and skill rows.
// A draft owned by the PO; rows are declared intent, to be compared with the runtime later.
import { cli, isMain, parseJson, readSource, record, SourceError } from './common.mjs'

const SRC = 'config/mode-matrix.json'

export const def = {
  sourcePath: SRC,
  extractionKind: 'json',
  extract(root) {
    const src = readSource(root, SRC)
    const json = parseJson(src)
    for (const key of ['roles', 'platforms', 'tools', 'skills'])
      if (!Array.isArray(json[key])) throw new SourceError(`mode-matrix.${key} is not an array`)
    const items = []
    for (const r of json.roles)
      for (const p of json.platforms)
        items.push({ id: `mode-preset:${r.id}+${p.id}`, kind: 'mode-preset', role: r.id, platform: p.id })
    const names = new Set()
    for (const t of json.tools) {
      for (const n of t.tools ?? []) names.add(n)
      items.push({
        id: `mode-tool-row:${t.id}`,
        kind: 'mode-tool-row',
        row: t.id,
        group: t.group ?? null,
        tools: t.tools ?? []
      })
    }
    for (const s of json.skills) items.push({ id: `mode-skill:${s.id}`, kind: 'mode-skill', skill: s.id })
    return record({
      sourcePath: SRC,
      read: [src],
      extractionKind: this.extractionKind,
      items,
      root,
      notes: { distinctToolNames: names.size, toolRows: json.tools.length, skillRows: json.skills.length }
    })
  }
}
if (isMain(import.meta.url)) cli(def)
