#!/usr/bin/env node
/**
 * Deterministic proposer for quickstart `slot-roles.json` (`tracy-quickstart-slot-roles/v1`).
 *
 * Groups repeated cards/rows and guesses semantic roles from field names, xpaths, and labels without
 * calling any model (the rule tables, `rule-tables.mjs`). Slots that cannot be deterministically placed are listed in
 * `unplaced[]`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROLE_VOCABULARY_VERSION, SLOT_ROLES_SCHEMA_VERSION } from 'website-opportunities/domain'
import { SLOT_ROLES_FILE, contractSlotInventory } from '../../apps/tracy-web/src/lib/slot-roles.js'
import { proposeEmdash, proposeJoomla, proposeWordpress } from './rule-tables.mjs'

function inferContractId(contractDir, manifest) {
  if (manifest?.quickstart?.slug && manifest?.quickstart?.cms && manifest?.quickstart?.version) {
    return `${manifest.quickstart.slug}/${manifest.quickstart.cms}/${manifest.quickstart.version}`
  }
  const normalized = contractDir.split(path.sep).join('/')
  const emdashMatch = normalized.match(/tracy-emdash-theme-([^/]+)\/contracts\/([^/]+)$/)
  if (emdashMatch) {
    return `tracy-${emdashMatch[1]}/emdash-0.x/${emdashMatch[2]}`
  }
  const parts = normalized.split('/').filter(Boolean)
  return parts.slice(-3).join('/')
}

export function proposeSlotRoles(contractDir) {
  const inventory = contractSlotInventory(contractDir)
  const manifestPath = path.join(contractDir, 'manifest.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null
  const contractId = inferContractId(contractDir, manifest)

  let proposed
  if (inventory.cms === 'emdash') {
    proposed = proposeEmdash(inventory)
  } else {
    const contentMapPath = path.join(contractDir, 'content-map.json')
    const contentMap = existsSync(contentMapPath)
      ? JSON.parse(readFileSync(contentMapPath, 'utf8'))
      : { slots: [] }
    const slots = Array.isArray(contentMap.slots) ? contentMap.slots : []
    proposed = inventory.cms === 'wordpress' ? proposeWordpress(slots) : proposeJoomla(slots)
  }

  const doc = {
    schemaVersion: SLOT_ROLES_SCHEMA_VERSION,
    roleVocabularyVersion: ROLE_VOCABULARY_VERSION,
    contract: contractId,
    cms: inventory.cms,
    baseHash: inventory.baseHash,
    baseFiles: inventory.baseFiles,
    status: 'draft',
    groups: proposed.groups,
    bindings: proposed.bindings,
    unplaced: proposed.unplaced
  }

  return {
    doc,
    slotKeys: inventory.slotKeys,
    requiresEvidenceSlots: inventory.requiresEvidenceSlots
  }
}

export function writeProposedSlotRoles(contractDir) {
  const { doc } = proposeSlotRoles(contractDir)
  const outPath = path.join(contractDir, SLOT_ROLES_FILE)
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return { outPath, doc }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const args = process.argv.slice(2)
  const stdoutOnly = args.includes('--stdout') || args.includes('--dry-run')
  const dirs = args.filter((a) => !a.startsWith('--'))
  if (dirs.length === 0) {
    process.stderr.write('Usage: node scripts/slot-roles/propose.mjs <contractDir> [--stdout]\n')
    process.exit(2)
  }
  for (const rawDir of dirs) {
    const dir = path.resolve(rawDir)
    if (stdoutOnly) {
      const { doc } = proposeSlotRoles(dir)
      process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
    } else {
      const { outPath, doc } = writeProposedSlotRoles(dir)
      process.stdout.write(
        `Wrote ${outPath} (groups: ${doc.groups.length}, bindings: ${doc.bindings.length}, unplaced: ${doc.unplaced.length})\n`
      )
    }
  }
}
