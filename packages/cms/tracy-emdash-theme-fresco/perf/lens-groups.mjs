// node perf/lens-groups.mjs <run-dir> <stage> [maxTiles=70] : writes <run>/briefs/<stage>-<n>.md, one per reader group, prints their paths.
// A group = whole shots (site + its source pair) packed up to maxTiles; the reader covers every lens that has a consumer on those shots.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const [, , run, stage, max = '70'] = process.argv
const index = JSON.parse(readFileSync(`${run}/index.json`, 'utf8'))
const shots = (index.shots ?? index).filter((s) => s.stage === stage && (s.consumers ?? []).length > 0)
const key = (s) => `${s.page}--${s.variant}`
const pairs = new Map()
for (const s of shots) pairs.set(key(s), [...(pairs.get(key(s)) ?? []), s])
const groups = [[]]
let n = 0
for (const ps of pairs.values()) {
  const t = ps.reduce((a, s) => a + s.tiles.length, 0)
  if (n + t > +max && groups.at(-1).length) {
    groups.push([])
    n = 0
  }
  groups.at(-1).push(...ps)
  n += t
}
mkdirSync(`${run}/briefs`, { recursive: true })
groups.forEach((g, i) => {
  const lenses = [...new Set(g.flatMap((s) => s.consumers))].sort()
  const lines = [
    `# Reader brief — stage ${stage}, group ${i + 1}`,
    '',
    `Run: ${run}`,
    `Lenses you cover: ${lenses.join(', ')}`,
    '',
    '## Tiles (open every one with the Read tool, once)',
    '| Shot | Side | Consumers | Hash | Tiles |',
    '|---|---|---|---|---|'
  ]
  for (const s of g)
    lines.push(
      `| ${s.page} ${s.variant} | ${s.side} | ${s.consumers.join(',')} | ${s.hash} | ${s.tiles.join('<br>')} |`
    )
  writeFileSync(`${run}/briefs/${stage}-${i + 1}.md`, lines.join('\n') + '\n')
  console.log(
    `${run}/briefs/${stage}-${i + 1}.md tiles=${g.reduce((a, s) => a + s.tiles.length, 0)} lenses=${lenses}`
  )
})
