#!/usr/bin/env node
/**
 * Hold every profile of a Joomla quickstart contract directory to the bytes it is pinned to, the way
 * the Claude Cowork receiver does before it reads one: a sidecar (showcase-navigation map, demo-trim
 * map, multilingual map, editions, slot roles) carries `baseHash`, the sha256 of
 * `<name>:<sha256 of file>\n` over the three base files, and the receiver refuses a sidecar whose
 * `baseHash` is not the hash of the base files beside it ("... does not belong to this contract").
 *
 * WHY A SEPARATE CHECK. Each generator's `--check` regenerates its own profile kind for the contracts
 * in its scope; this one reads nothing but the files and refuses any stale pin of any kind, so a
 * package built from a contract tree (`scripts/local-cowork.sh`) cannot carry a content map edited
 * after its sidecars were generated. A refused sidecar is not an error on the site: the receiver skips
 * it, and the site keeps the template showcase in its menus with no failure anywhere.
 *
 * Run: `node scripts/check-joomla-contract-pins.mjs <contract dir>...` (a directory holding manifest.json)
 * Exit 1 and one line per stale pin, naming the generator to run.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BASE_FILES, baseHashOf, sha256 } from 'website-opportunities/domain'

/** The generator that writes each pinned sidecar, named in the refusal. */
const GENERATORS = {
  'showcase-nav-map.json': 'scripts/build-joomla-showcase-nav.mjs',
  'demo-trim-map.json': 'scripts/build-joomla-demo-trim.mjs',
  'multilingual-map.json': 'scripts/build-joomla-multilingual.mjs',
  'editions.json': 'scripts/build-joomla-editions.mjs',
  'slot-roles.json': 'scripts/slot-roles/propose.mjs'
}

/** The stale pins of one contract directory, one sentence each; [] when every pin holds. */
export function stalePins(dir) {
  const missing = BASE_FILES.filter((name) => !existsSync(path.join(dir, name)))
  if (missing.length) return [`${dir}: missing base file(s) ${missing.join(', ')}`]
  const want = baseHashOf(
    Object.fromEntries(BASE_FILES.map((name) => [name, sha256(readFileSync(path.join(dir, name)))])),
    BASE_FILES
  )
  const problems = []
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json') || BASE_FILES.includes(name)) continue
    let profile
    try {
      profile = JSON.parse(readFileSync(path.join(dir, name), 'utf8'))
    } catch {
      continue
    }
    if (!profile || typeof profile !== 'object' || !('baseHash' in profile)) continue
    if (profile.baseHash !== want)
      problems.push(
        `${dir}/${name}: baseHash ${profile.baseHash} is not ${want}, the hash of the base files beside it; the receiver refuses it` +
          (GENERATORS[name] ? ` (run node ${GENERATORS[name]})` : '')
      )
  }
  return problems
}

function main() {
  const dirs = process.argv.slice(2)
  if (!dirs.length) {
    console.error('usage: check-joomla-contract-pins.mjs <contract dir>...')
    process.exit(2)
  }
  const problems = dirs.flatMap(stalePins)
  for (const p of problems) console.error(`check-joomla-contract-pins: ${p}`)
  if (problems.length) process.exit(1)
  console.log(`check-joomla-contract-pins: ${dirs.length} contract(s), every pin holds`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
