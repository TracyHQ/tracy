#!/usr/bin/env node
// The run3 suite for flow D on one CMS: cases-d-<cms>.json = {sites: {<label>: {platform, …keys}}, cases: [the flow D
// cases of tc/cases-tc-<cms>.json, unchanged]}. Keys come from keys-<label>.json (derive-d.mjs); a "—" key is written as
// null, which run3's missingKeys() counts as missing, so a case needing it answers n/a instead of running with a dash.
// Also merges the site's keys into runner/sites-v6.json, the file snap.sh reads for its home-digest check
// (save AFTER this, or the snapshot has no digest and restores are not checked for drift).
//   node build-suite.mjs <wordpress|joomla|emdash> <label> [--keys keys-<label>.json]
// Prints the case ids by tier (P0, P1) with `needs`, which of them are n/a on this site, and oracle lint (a `gone`
// string inside a `has` string of the same block can never pass).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { missingKeys, fill } from '../../oracle.mjs'
import { loadAll } from '../../tc/lib.mjs'

const HERE = new URL('.', import.meta.url).pathname
const BENCH = new URL('../../', import.meta.url).pathname
const ALIAS = {
  wp: 'wordpress',
  wordpress: 'wordpress',
  j: 'joomla',
  joomla: 'joomla',
  ed: 'emdash',
  emdash: 'emdash'
}
const argv = process.argv.slice(2)
const platform = ALIAS[argv[0] ?? '']
const label = argv[1]
if (!platform || !label) {
  console.error('usage: node build-suite.mjs <wordpress|joomla|emdash> <label> [--keys <file>]')
  process.exit(2)
}
const keysFile = argv.includes('--keys') ? argv[argv.indexOf('--keys') + 1] : `${HERE}keys-${label}.json`
const derived = JSON.parse(readFileSync(keysFile, 'utf8'))
if (derived.platform !== platform) throw new Error(`${keysFile} is for ${derived.platform}, not ${platform}`)
const src = JSON.parse(readFileSync(`${BENCH}tc/cases-tc-${platform}.json`, 'utf8'))
const cases = src.cases.filter((c) => String(c.flows ?? '').includes('D'))

// The site entry run3 reads: platform + every key, "—" → null (missing → n/a). `$`-keys are metadata.
const site = { platform }
for (const [k, v] of Object.entries(derived.keys)) site[k] = v === '—' ? null : v
site.$derived = {
  by: derived.by,
  at: derived.derivedAt,
  file: keysFile.split('/').pop(),
  resolved: `${derived.resolved}/${derived.needed}`,
  reasons: derived.reasons
}

const outFile = `${HERE}cases-d-${platform}.json`
const prev = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null
const suite = {
  $comment: `Flow D (Apply) suite for ${src.cms ?? platform}: the flow D cases of tc/cases-tc-${platform}.json (unchanged) + keys derived by tc-run/d/derive-d.mjs. Built ${new Date().toISOString()} by tc-run/d/build-suite.mjs. Run with tc-run/d/run-d.sh (run3 from the runner farm, --suite ../cases-d-${platform}.json).`,
  cms: src.cms ?? platform,
  sites: { ...prev?.sites, [label]: site },
  cases
}
writeFileSync(outFile, `${JSON.stringify(suite, null, 1)}\n`)

// snap.sh's digest source (a real file in the farm, never bench/sites-v6.json).
const farmSites = `${HERE}runner/sites-v6.json`
const farm = existsSync(farmSites) ? JSON.parse(readFileSync(farmSites, 'utf8')) : {}
farm[label] = Object.fromEntries(Object.entries(site).filter(([k, v]) => v !== null && !k.startsWith('$')))
writeFileSync(farmSites, `${JSON.stringify(farm, null, 1)}\n`)

// ---- report: tiers from the case modules (cases-tc-*.json does not carry them)
const { cases: modules } = await loadAll()
const tierOf = Object.fromEntries(modules.map((c) => [c.id, c.tier ?? '?']))
const filled = { ...site, label }
const lint = (c) => {
  const out = []
  const walk = (o, where) => {
    for (const [name, rule] of Object.entries(o ?? {})) {
      if (name === 'anyOf') (rule ?? []).forEach((x, i) => walk(x, `${where} anyOf[${i}]`))
      else if (rule && typeof rule === 'object' && !Array.isArray(rule) && rule.has && rule.gone) {
        const has = rule.has.map((s) => fill(s, filled))
        for (const g of rule.gone.map((s) => fill(s, filled)))
          for (const h of has)
            if (h.includes(g)) out.push(`${where} ${name}: gone "${g}" is inside has "${h}" — can never pass`)
      }
    }
  }
  walk(c.oracle, 'oracle')
  ;(c.turnOracles ?? []).forEach((o, i) => walk(o, `turn ${i + 1}`))
  return [...new Set(out)]
}
console.log(
  `${outFile.split('/').pop()}: ${cases.length} flow D cases · site ${label} (${derived.resolved}/${derived.needed} keys) · runner/sites-v6.json updated`
)
for (const tier of ['P0', 'P1', '?']) {
  const list = cases.filter((c) => (tierOf[c.id] ?? '?') === tier)
  if (!list.length) continue
  console.log(`\n${tier} (${list.length}): ${list.map((c) => c.id).join(',')}`)
  for (const c of list) {
    const miss = missingKeys(
      [c.prompt, c.turns, c.oracle, c.turnOracles, (c.requires ?? []).map((k) => `{${k}}`)],
      filled
    )
    const flags = [
      c.needs?.length ? `needs ${c.needs.join('+')}` : '',
      miss.length ? `n/a here (no ${miss.join(', ')})` : '',
      ...lint(c)
    ].filter(Boolean)
    console.log(`  ${c.id.padEnd(28)} L${c.level} ${String(c.role).padEnd(9)} ${flags.join(' · ')}`)
  }
}
