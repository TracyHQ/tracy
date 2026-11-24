#!/usr/bin/env node
// Validate a seed file with EmDash's own validator (the same one the setup route runs).
//   node tools/validate-seed.mjs <seed.json>
import { readFileSync } from 'node:fs'
import { validateSeed } from 'emdash/seed'

const file = process.argv[2] ?? 'seed/seed.json'
const seed = JSON.parse(readFileSync(file, 'utf8'))
const { valid, errors, warnings } = validateSeed(seed)
for (const w of warnings ?? []) console.warn(`warning: ${w}`)
for (const e of errors ?? []) console.error(`error: ${e}`)
console.log(JSON.stringify({ file, valid, errors: errors?.length ?? 0, warnings: warnings?.length ?? 0 }))
process.exit(valid ? 0 : 1)
