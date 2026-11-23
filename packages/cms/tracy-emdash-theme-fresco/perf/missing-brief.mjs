// node perf/missing-brief.mjs <run> [maxTiles=70] : after `qa-notes.mjs merge` of every stage, writes <run>/briefs/missing-<n>.md listing the tiles
// no lens opened (coverage.missing of NOTES-<stage>.json), one reader group per <=maxTiles tiles, with the lenses that must cover each shot.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const [, , run, max = '70'] = process.argv
const index = JSON.parse(readFileSync(`${run}/index.json`, 'utf8'))
const hashOf = Object.fromEntries(index.shots.map((s) => [path.basename(s.file, '.png'), s.hash]))
const byShot = new Map()
for (const f of readdirSync(run).filter((n) => /^NOTES-.*\.json$/.test(n))) {
  const n = JSON.parse(readFileSync(`${run}/${f}`, 'utf8'))
  for (const m of n.coverage?.missing ?? []) {
    const shot = path.basename(path.dirname(m.file))
    const e = byShot.get(shot) ?? { tiles: new Set(), lenses: new Set() }
    e.tiles.add(m.file)
    e.lenses.add(m.lens)
    byShot.set(shot, e)
  }
}
const groups = [[]]
let n = 0
for (const [shot, e] of byShot) {
  if (n + e.tiles.size > +max && groups.at(-1).length) {
    groups.push([])
    n = 0
  }
  groups.at(-1).push([shot, e])
  n += e.tiles.size
}
mkdirSync(`${run}/briefs`, { recursive: true })
groups.forEach((g, i) => {
  const lenses = [...new Set(g.flatMap(([, e]) => [...e.lenses]))].sort()
  const lines = [
    `# Reader brief — unopened tiles, group ${i + 1}`,
    '',
    `Run: ${run}`,
    `Lenses you cover: ${lenses.join(', ')}`,
    '',
    '| Shot | Lenses | Hash | Tiles |',
    '|---|---|---|---|'
  ]
  for (const [shot, e] of g)
    lines.push(
      `| ${shot} | ${[...e.lenses].sort().join(',')} | ${hashOf[shot]} | ${[...e.tiles].sort().join('<br>')} |`
    )
  writeFileSync(`${run}/briefs/missing-${i + 1}.md`, lines.join('\n') + '\n')
  console.log(
    `${run}/briefs/missing-${i + 1}.md tiles=${g.reduce((a, [, e]) => a + e.tiles.size, 0)} lenses=${lenses}`
  )
})
