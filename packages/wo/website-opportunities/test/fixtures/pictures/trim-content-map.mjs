// Trims a content contract to what the picture planner reads (image slots, pages): node trim-content-map.mjs <in> <out>
import { readFileSync, writeFileSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
const map = JSON.parse(readFileSync(input, 'utf8'))
const slots = (map.slots ?? [])
  .filter((s) => s.type === 'image')
  .map(({ key, entity, type, sample, label, requiresEvidence, target }) => ({
    key,
    entity,
    type,
    sample,
    label,
    requiresEvidence,
    ...(target ? { target } : {})
  }))
const pages = (map.pages ?? []).map(({ entity, route, link, assignedModules }) => ({
  entity,
  route,
  link,
  assignedModules: (assignedModules ?? []).map(({ entity: e, position, published }) => ({
    entity: e,
    position,
    published
  }))
}))
writeFileSync(output, `${JSON.stringify({ source: input.replace(/^.*contracts\//, ''), slots, pages })}\n`)
