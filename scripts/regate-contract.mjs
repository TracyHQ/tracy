#!/usr/bin/env node
/**
 * Raise `requiresEvidence` on the fact fields of a Joomla quickstart profile captured before the field rule
 * (TCH #1326): what `capture-contract.py --evidence-by-field` writes at capture, applied after the fact.
 *
 *   node scripts/regate-contract.mjs packages/cms/tracy-joomla-quickstart/contracts/<slug>/j6/<version> [...]
 *
 * Only `content-map.json` changes, only from false to true, and the bytes are the capture's own (the same
 * JSON layout, formatted by biome as the capture formats them), so a profile regated here and one captured
 * with the flag agree byte for byte (`capture-contract.test.mjs`). Run it BEFORE the Claude Cowork plugin that
 * carries the profile is cut: once a plugin pins the bytes, the profile is sealed and only the planner's own
 * gating (`fact-fields.js`) protects a site built from it. A profile that is already gated is left untouched.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ungatedFactSlots, withFieldEvidence } from '../apps/tracy-web/src/lib/fact-fields.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Regate one profile directory; returns how many slots were raised.
 * @param {string} dir
 * @returns {number}
 */
export function regateProfile(dir) {
  const file = path.join(dir, 'content-map.json')
  if (!existsSync(file)) throw new Error(`${dir}: no content-map.json`)
  const map = JSON.parse(readFileSync(file, 'utf8'))
  const open = ungatedFactSlots(map.slots ?? [])
  if (open.length === 0) return 0
  const gated = withFieldEvidence(map.slots ?? [])
  const out = { ...map, slots: gated }
  writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`)
  execFileSync(
    'pnpm',
    ['exec', 'biome', 'format', '--write', '--files-max-size=2000000', path.resolve(file)],
    {
      cwd: ROOT,
      stdio: 'ignore'
    }
  )
  return open.length
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2)
  if (dirs.length === 0) {
    console.error('usage: node scripts/regate-contract.mjs <profile dir> [...]')
    process.exit(2)
  }
  for (const dir of dirs) {
    const raised = regateProfile(path.resolve(dir))
    console.log(`${dir}: ${raised === 0 ? 'already gated' : `${raised} slot(s) now require evidence`}`)
  }
}
