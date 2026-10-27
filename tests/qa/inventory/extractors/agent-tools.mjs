// Agent tools and surfaces: the generated catalogue apps/tracy-web/src/api-reference/sources/agent-tools.json.
import { cli, isMain, parseJson, readSource, record, SourceError } from './common.mjs'

const SRC = 'apps/tracy-web/src/api-reference/sources/agent-tools.json'

export const def = {
  sourcePath: SRC,
  extractionKind: 'json',
  extract(root) {
    const src = readSource(root, SRC)
    const json = parseJson(src)
    if (!Array.isArray(json.tools) || !Array.isArray(json.surfaces))
      throw new SourceError('agent-tools.json lacks tools[] or surfaces[]')
    const items = []
    for (const t of json.tools)
      items.push({
        id: `agent-tool:${t.name}`,
        kind: 'agent-tool',
        tool: t.name,
        plugin: t.plugin ?? null,
        platforms: t.platforms ?? null,
        localActions: t.localActions ?? [],
        relayActions: t.relayActions ?? [],
        family: 'site-tools'
      })
    for (const t of json.otherTools ?? [])
      items.push({
        id: `agent-tool:${t.name}`,
        kind: 'agent-tool',
        tool: t.name,
        plugin: t.plugin ?? null,
        platforms: t.platforms ?? null,
        family: 'other'
      })
    for (const s of json.surfaces)
      items.push({
        id: `agent-surface:${s.id}`,
        kind: 'agent-surface',
        surface: s.id,
        platform: s.platform ?? null
      })
    return record({
      sourcePath: SRC,
      read: [src],
      extractionKind: this.extractionKind,
      items,
      root,
      notes: { catalogue: 'one part of the harness only (plan §1)' }
    })
  }
}
if (isMain(import.meta.url)) cli(def)
