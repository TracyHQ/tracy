#!/usr/bin/env node
/**
 * The slot roles contract check (gate `slot-roles`, ADR 0038), over every Joomla, WordPress and EmDash contract version.
 *
 * - A content map that declares slot roles must pass `checkContentMapRoles` (WO domain, `content-map-roles.mjs`): the
 *   current vocabulary version, a known role on every text and image slot, every fact slot in a group, each group one
 *   card of one kind with the roles its kind needs, no slot twice. A content map that declares none is not checked:
 *   contracts released before ADR 0038 have none, and released contracts are never edited.
 * - An EmDash theme whose `seed/field-map.json` declares roles must pass `checkFieldMapRoles` (a known role on every copy
 *   field and repeater sub-field, a group kind on every fact role, whole cards): the reader takes roles from the field
 *   map first, so a sidecar beside it, cut from an older seed, is superseded and not judged.
 * - A content map that declares Slot fit (ADR 0039: `slotFitVersion`, or a `fit` on any slot) must pass
 *   `checkContentMapFit` (WO domain, `content-map-fit.mjs`): the current version, a well-formed fit on every text and
 *   image slot, and each picture's `customize: "keep"` in step with its kind. A map without Slot fit is not judged;
 *   the check counts its text and image slots without a fit (`fit` in the result, and one line on stdout).
 * - A committed `slot-roles.json` sidecar (ADR 0037; three remain until their template's next release) must validate,
 *   match its contract's `baseHash`, have `status: "checked"` and leave zero `requiresEvidence` slots without a fact role.
 *
 *   node scripts/slot-roles/check.mjs                  every contract in the tree
 *   node scripts/slot-roles/check.mjs <contractDir>... only those
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkContentMapFit, checkContentMapRoles } from 'website-opportunities/domain'
import { fieldMapRolesOf } from '../../apps/tracy-web/src/lib/emdash-field-map-roles.js'
import {
  SLOT_ROLES_FILE,
  contractSlotInventory,
  slotRolesOf
} from '../../apps/tracy-web/src/lib/slot-roles.js'

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const CONTENT_MAP_FILE = 'content-map.json'

function findContractDirs(dir, found = []) {
  if (!existsSync(dir)) return found
  const entries = readdirSync(dir, { withFileTypes: true })
  if (entries.some((e) => e.isFile() && (e.name === SLOT_ROLES_FILE || e.name === CONTENT_MAP_FILE))) {
    found.push(dir)
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      findContractDirs(path.join(dir, entry.name), found)
    }
  }
  return found
}

/** Every contract version folder holding a content map or a sidecar. */
export function discoverSlotRoleContractDirs(rootDir = DEFAULT_ROOT) {
  const dirs = []
  findContractDirs(path.join(rootDir, 'packages/cms/tracy-joomla-quickstart/contracts'), dirs)
  findContractDirs(path.join(rootDir, 'packages/cms/tracy-wordpress-quickstart/contracts'), dirs)
  const cmsDir = path.join(rootDir, 'packages/cms')
  if (existsSync(cmsDir)) {
    for (const entry of readdirSync(cmsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('tracy-emdash-theme-')) {
        findContractDirs(path.join(cmsDir, entry.name, 'contracts'), dirs)
      }
    }
  }
  return dirs.sort()
}

function contentMapErrors(dir) {
  const file = path.join(dir, CONTENT_MAP_FILE)
  if (!existsSync(file)) return null
  let contentMap
  try {
    contentMap = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return [`${CONTENT_MAP_FILE} is not JSON: ${error instanceof Error ? error.message : error}`]
  }
  const res = checkContentMapRoles(contentMap)
  const fit = checkContentMapFit(contentMap)
  if (!res.declared && !fit.declared) return null
  return [...(res.declared ? res.errors : []), ...(fit.declared ? fit.errors : [])]
}

/** The Slot fit of one contract's content map: declared or not, and how many text and image slots lack a fit. */
function fitOf(dir) {
  const file = path.join(dir, CONTENT_MAP_FILE)
  if (!existsSync(file)) return null
  try {
    const { declared, missing } = checkContentMapFit(JSON.parse(readFileSync(file, 'utf8')))
    return { dir, declared, missing }
  } catch {
    return null
  }
}

/** The errors of the roles an EmDash theme declares in its field map, or null when the contract has none declared. */
function fieldMapResult(dir) {
  const { cms, seedDir } = contractSlotInventory(dir)
  return cms === 'emdash' ? fieldMapRolesOf(seedDir) : null
}

function sidecarErrors(dir) {
  if (!existsSync(path.join(dir, SLOT_ROLES_FILE))) return null
  const res = slotRolesOf(dir)
  if (res.state !== 'ready') {
    const detail = Array.isArray(res.errors) && res.errors.length > 0 ? `: ${res.errors.join('; ')}` : ''
    return [`${SLOT_ROLES_FILE}: expected state "ready", got "${res.state}"${detail}`]
  }
  const errors = []
  if (res.doc?.status !== 'checked') {
    errors.push(`${SLOT_ROLES_FILE}: expected status "checked", got ${JSON.stringify(res.doc?.status)}`)
  }
  if (Array.isArray(res.gaps) && res.gaps.length > 0) {
    errors.push(
      `${SLOT_ROLES_FILE}: ${res.gaps.length} requiresEvidence slot(s) without a fact role (${res.gaps.slice(0, 5).join(', ')})`
    )
  }
  return errors
}

/**
 * @param {string} [rootDir]
 * @param {string[] | null} [explicitDirs]
 * @returns {{ok: boolean, checkedCount: number, dirs: string[], errors: string[],
 *   fit: Array<{dir: string, declared: boolean, missing: {image: number, text: number}}>}}
 *   `dirs`: the contracts that declare roles (in a content map or a sidecar), each checked
 *   `fit`: the Slot fit of every contract with a content map
 */
export function checkAllSlotRoles(rootDir = DEFAULT_ROOT, explicitDirs = null) {
  const candidates =
    Array.isArray(explicitDirs) && explicitDirs.length > 0
      ? explicitDirs.map((d) => path.resolve(d))
      : discoverSlotRoleContractDirs(rootDir)

  const errors = []
  const dirs = []
  const fit = candidates.map(fitOf).filter((f) => f !== null)
  for (const dir of candidates) {
    const rel = path.relative(rootDir, dir) || dir
    const fieldMap = fieldMapResult(dir)
    const found = [
      contentMapErrors(dir),
      fieldMap ? fieldMap.errors : null,
      fieldMap ? null : sidecarErrors(dir)
    ].filter((e) => e !== null)
    if (found.length === 0) continue
    dirs.push(dir)
    for (const error of found.flat()) errors.push(`${rel}: ${error}`)
  }
  if (dirs.length === 0) {
    errors.push('no slot roles found: no content map declares roles and no slot-roles.json sidecar exists')
  }
  return { ok: errors.length === 0, checkedCount: dirs.length, dirs, errors, fit }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const cliDirs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const res = checkAllSlotRoles(DEFAULT_ROOT, cliDirs.length > 0 ? cliDirs : null)
  if (!res.ok) {
    for (const err of res.errors) {
      process.stderr.write(`slot-roles check failed: ${err}\n`)
    }
    process.exit(1)
  }
  process.stdout.write(`slot-roles check passed (${res.checkedCount} contract(s) verified).\n`)
  const without = res.fit.filter((f) => !f.declared)
  const lacking = without.reduce((n, f) => n + f.missing.image + f.missing.text, 0)
  process.stdout.write(
    `slot fit: ${res.fit.length - without.length} content map(s) declare it; ${without.length} do not (${lacking} text and image slots without a fit).\n`
  )
}
