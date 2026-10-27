#!/usr/bin/env node
/**
 * One site URL → one design inspiration on disk — the SAME pipeline `@tracy/dsh-brand-engine` runs on
 * a lane (`packages/design/tracy-brand-engine/src/host/pipeline.mjs`), driven from a terminal so it
 * can be measured before and beside any UI:
 *
 *   node scripts/brand-engine.mjs <url> <siteDir> [own|reference]
 *
 * Writes `<siteDir>/Brand/<host>/` exactly as the plugin would (spec-brand-engine §3.2, 06/09
 * decision 3) and prints each harvester step with a timestamp, then the refine notes — the corrections
 * Tracy applied on top of OpenDesign's provisional brand, one line each.
 *
 * Resolution note: this file imports the plugin's source, whose bare imports (`@tracy/od-brand-engine`,
 * `linkedom`) resolve from the plugin's own node_modules — run `pnpm install` first.
 */
import { extractBrand } from '../packages/design/tracy-brand-engine/src/host/pipeline.mjs'

const [url, siteDir, kindArg] = process.argv.slice(2)
if (!url || !siteDir) {
  console.error('usage: brand-engine.mjs <url> <siteDir> [own|reference]')
  process.exit(2)
}
const kind = kindArg === 'own' || kindArg === 'reference' ? kindArg : undefined
const t0 = Date.now()
const stamp = () => `${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s`

const result = await extractBrand({
  input: url,
  siteDir,
  siteKey: process.env.MCP_TRACY_SITE_KEY?.trim() || null,
  kind,
  onProgress: (step, detail) =>
    console.log(`${stamp()}  ${step}${detail ? `  ${String(detail).slice(0, 90)}` : ''}`)
})
if (!result.ok) {
  console.error(`${stamp()}  ${result.code}: ${result.error}`)
  process.exit(3)
}
const m = result.manifest
console.log(
  `${stamp()}  ${m.id}  ${m.kind}  "${m.name}"  · ${m.counts.colors} colours · ${m.counts.fonts} fonts · ` +
    `${m.counts.logos} logos · ${m.counts.engineFiles} engine files · ${m.counts.slots} slots` +
    (m.source.thin ? ' · THIN' : '') +
    (m.source.blocked ? ' · BLOCKED' : '')
)
for (const note of m.refined) console.log(`       refined  ${note}`)
