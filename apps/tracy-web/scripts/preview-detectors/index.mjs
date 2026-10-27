/**
 * Every detector of the design system preview (PR 2 of 14/10/2026), loaded from this folder: one file
 * per kind, `<kind>.mjs`, whose kind has its line in `PREVIEW_KINDS`
 * (packages/design/tracy-ds-slot/src/measurement.mjs: the rule it fails, what /ops says, the fix).
 *
 * A detector file exports:
 *   kind:   string, the file name without `.mjs`, a key of PREVIEW_KINDS
 *   probe?: string, a JS expression evaluated in the page (plain and worn) after PREVIEW_PROBE;
 *           its value is handed back as `data` (keep it JSON, small)
 *   dataOf?: string, the kind whose probe data this detector judges instead of a probe of its own
 *           (hover-same reads hover-unreadable's states: one walk of the page's hover rules, not two)
 *   read?:  async (chrome, data) -> data, a second step on the same open page for what a page script
 *           cannot read (photo-text: the photograph under each word, off a screenshot of the page)
 *   detect({ worn, plain, systemColours, systemPalette, scheme }) -> { count, findings: [{ at, ... }] }  PURE
 *           worn / plain = { base: PREVIEW_PROBE result, data: this detector's probe result, html }
 *           systemColours = the worn page's resolved `--ds-c-*`; systemPalette = the system's colours
 *           as the library states them, both sides (lib/system-palette.mjs), never read off the page;
 *           statusColours = the status colours the slot writes itself (also in systemColours)
 *           `at` is a short selector-like label /ops shows as "where"
 *   since?: number, the probe version the detector belongs to (dormant before it, see below)
 * Nothing per template: a detector judges what the visitor sees, there is no exemption list.
 */
import { readdirSync } from 'node:fs'
import { PREVIEW_KINDS } from '../../../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { PREVIEW_PROBE_VERSION } from '../../../../packages/design/tracy-ds-slot/src/preview-probe-version.mjs'

/**
 * A detector may export `since`: the probe version it belongs to. Until PREVIEW_PROBE_VERSION reaches it,
 * the detector is dormant (not run, its kind absent from every row, so no file measured at the current
 * version reads differently). PREVIEW_PROBE_NEXT=1 runs the dormant ones too, for a scratch measure of the
 * next probe; a file written that way must not be committed.
 */
export const runsNext = () => process.env.PREVIEW_PROBE_NEXT === '1'

const files = readdirSync(import.meta.dirname)
  .filter((f) => f.endsWith('.mjs') && f !== 'index.mjs' && !f.endsWith('.test.mjs'))
  .sort()

/** @type {{ kind: string, probe?: string, dataOf?: string, detect: (input: any) => { count: number, findings: any[] } }[]} */
export const DETECTORS = []
for (const f of files) {
  const m = await import(new URL(f, import.meta.url).href)
  if (m.kind !== f.slice(0, -4)) throw new Error(`preview detector ${f}: kind must be ${f.slice(0, -4)}`)
  if (!PREVIEW_KINDS[m.kind]) throw new Error(`preview detector ${f}: add its line to PREVIEW_KINDS`)
  if (typeof m.detect !== 'function') throw new Error(`preview detector ${f}: export detect()`)
  if (Number.isInteger(m.since) && m.since > PREVIEW_PROBE_VERSION && !runsNext()) continue
  if (m.dataOf !== undefined && (m.probe || !files.includes(`${m.dataOf}.mjs`)))
    throw new Error(`preview detector ${f}: dataOf names another kind's file and comes without a probe`)
  DETECTORS.push({ kind: m.kind, probe: m.probe, dataOf: m.dataOf, read: m.read, detect: m.detect })
}

/** The probes of every detector, run in an open page: { <kind>: data }. */
export async function probeAll(/** @type {any} */ chrome) {
  /** @type {Record<string, any>} */
  const out = {}
  for (const d of DETECTORS) {
    if (d.probe) out[d.kind] = await chrome.evaluate(d.probe)
    if (d.read) out[d.kind] = await d.read(chrome, out[d.kind])
  }
  return out
}

/**
 * Every detector on one worn page against the plain one: { <kind>: { count, findings } }.
 * @param {{ base: any, data: Record<string, any>, html: string }} worn
 * @param {{ base: any, data: Record<string, any>, html: string }} plain
 * @param {{ systemColours: string[], systemPalette?: string[], statusColours?: string[], scheme: string }} ctx
 */
export function detectAll(worn, plain, ctx) {
  /** @type {Record<string, { count: number, findings: any[] }>} */
  const out = {}
  for (const d of DETECTORS) {
    const key = d.dataOf ?? d.kind
    const r = d.detect({
      worn: { base: worn.base, data: worn.data[key], html: worn.html },
      plain: { base: plain.base, data: plain.data[key], html: plain.html },
      systemColours: ctx.systemColours,
      systemPalette: ctx.systemPalette ?? [],
      statusColours: ctx.statusColours ?? [],
      scheme: ctx.scheme
    })
    out[d.kind] = { count: r.count, findings: r.findings ?? [] }
  }
  return out
}
