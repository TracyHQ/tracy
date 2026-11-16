// The probes write safety runs (ticket #586) and one sha256 over them (review 7 S7). The record binds the hash of the
// catalogue that ran, and the release checks refuse a record whose catalogue is not the gate's own: a real run of a gate
// with probes taken out writes a true record of a weaker gate. Each probe is hashed by its id, its types and flags, and
// the source of its functions (its text, judge, signature and danger), so a changed probe changes the hash. Pure.
import { createHash } from 'node:crypto'
import { JOOMLA_PROBES } from './adapters/joomla-probes.mjs'
import { PROBE_CATALOGUE } from './write-probes-edge.mjs'

/** The probes the gate runs on a Joomla kit: the catalogue, then the Joomla content plugin codes. */
export const GATE_PROBES = Object.freeze([...PROBE_CATALOGUE, ...JOOMLA_PROBES])

const sourceOf = (fn) => (typeof fn === 'function' ? String(fn) : null)

/** One sha256 over a probe list, in its order. */
export function probeCatalogueSha256(probes) {
  const rows = (probes ?? []).map((p) => [
    p.id,
    p.types ?? null,
    p.whole ?? false,
    p.limit ?? null,
    p.why ?? null,
    sourceOf(p.text),
    sourceOf(p.judge),
    sourceOf(p.signature),
    sourceOf(p.danger),
    // A function's source does not show what it closes over (an element probe's mark and text): its output on a
    // fixed place does.
    typeof p.text === 'function' ? String(p.text('ZZZ', { base: 'QxZZZ', limit: 40 })) : null,
    typeof p.signature === 'function' ? String(p.signature('ZZZ')) : null
  ])
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}
