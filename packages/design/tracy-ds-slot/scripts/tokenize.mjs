#!/usr/bin/env node
/**
 * Make a released template's stylesheets follow a worn system:
 *
 *   node scripts/tokenize.mjs --template <contract> [--write] [--suggest] <file.css>...
 *
 * Every hex in each file that is one of the template's own palette colours (the colour tokens of its
 * contract's base: `baseTokens` / `baseTokensFile`) becomes `var(--ds-c-<role>, <that hex>)` — see
 * src/tokenize.mjs. Without --write it only reports. Prints one JSON line per file and a total.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractBase, loadContract } from '../src/library.mjs'
import { accentAliases, paletteForFile, suggestRoles, tokenizeCss } from '../src/tokenize.mjs'
import { COLOUR_TOKENS } from '../src/tokens56.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const args = process.argv.slice(2)
const ti = args.indexOf('--template')
if (ti === -1) {
  console.error('usage: tokenize.mjs --template <contract> [--write] <file.css>...')
  process.exit(1)
}
const [, name] = args.splice(ti, 2)
const write = args.includes('--write')
const ni = args.indexOf('--near')
const NEAR = ni === -1 ? 64 : Number(args.splice(ni, 2)[1])
const JSON_ONLY = args.includes('--json')
const files = args.filter((a) => !['--write', '--suggest', '--json'].includes(a))
const contract = loadContract(name)
const base = contractBase(ROOT, contract)
const light = Object.fromEntries(COLOUR_TOKENS.map((n) => [n, base[`--${n}`]]))
// the template's dark look, when it has one: its colours take the same roles
const dark = Object.fromEntries(
  Object.entries(contract.darkTokens ?? {})
    .filter(([k]) => COLOUR_TOKENS.includes(k.replace(/^--/, '')))
    .map(([k, v]) => [k.replace(/^--/, ''), v])
)
// colours of a shared base the template ships under (Bootstrap under T4), in the roles they play
const palette = [light, ...(Object.keys(dark).length ? [dark] : []), ...(contract.extraPalettes ?? [])]

// the accent variables and their renames, across every file given
const accentVars = accentAliases(
  files.map((f) => readFileSync(f, 'utf8')),
  contract.accentVars ?? []
)
const total = { files: 0, replaced: 0, byRole: {}, kept: {}, alphas: [] }
const kinds = {}
for (const f of files) {
  const css = readFileSync(f, 'utf8')
  const r = tokenizeCss(css, paletteForFile(palette, contract, f), {
    accentVars,
    keepScopes: contract.keepScopes,
    classifyText: contract.classifyText,
    varRoles: contract.varRoles,
    t4Placeholders: contract.t4Placeholders,
    alphaText: contract.alphaText,
    pairVarFill: contract.pairVarFill,
    reRole: contract.reRole
  })
  if (write && r.css !== css) writeFileSync(f, r.css)
  total.files += 1
  total.replaced += r.replaced
  total.alphas = [...new Set([...total.alphas, ...r.alphas])].sort()
  for (const [k, v] of Object.entries(r.byRole)) total.byRole[k] = (total.byRole[k] ?? 0) + v
  for (const [k, v] of Object.entries(r.kept)) total.kept[k] = (total.kept[k] ?? 0) + v
  for (const [h, o] of Object.entries(r.keptKinds))
    for (const [k, v] of Object.entries(o)) (kinds[h] ??= {})[k] = (kinds[h][k] ?? 0) + v
  if (!JSON_ONLY) console.log(JSON.stringify({ file: f, replaced: r.replaced, byRole: r.byRole }))
}
const topKept = Object.entries(total.kept)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 12)
if (JSON_ONLY) console.log(JSON.stringify({ suggest: suggestRoles(total.kept, kinds, palette, 4, NEAR) }))
else {
  console.log(
    JSON.stringify({ total: { ...total, kept: Object.fromEntries(topKept) }, palette, written: write })
  )
  if (args.includes('--suggest'))
    console.log(JSON.stringify({ suggest: suggestRoles(total.kept, kinds, palette, 4, NEAR) }, null, 1))
}
