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
 * - The declaration rules (the packing check, `apps/tracy-web/src/lib/content-map-lint.js`): a wrong or missing slot
 *   declaration the brief engine has to guess around (a hero subline outside the hero card, a gallery that is a card,
 *   a styled unit, a fixed social list). Named contract folders (the packing run, quickstart-contract section 7
 *   step 8) fail on a rule of severity `error` and print every finding with its fix hint; the whole-tree gate only
 *   counts them, because released contracts are never edited. `--webroot <dir>` (one named folder) also measures the
 *   item icons from the pack's pictures; `--lint-json <file>` writes every finding.
 *
 * - Every button slot declares its action (`buttonActionProblems`, WO domain `button-actions.mjs`): what a visitor does
 *   with it (primary call to action, go to an item, open a map, contact, an external profile, navigation, submit a
 *   form). Named contract folders (the packing run) fail on an undeclared button; the whole-tree gate only counts the
 *   maps that would fail, because released contracts are never edited and the build reads their roles all the same.
 *
 * - Every footer link column is declared as a navigation group (`navigationGroupProblems`, WO domain
 *   `footer-navigation.mjs`): which pages it holds (offerings, company, pages), its heading slot, its native container and
 *   menu, and its link slots. The brief build lists every kept page in these columns. Named contract folders fail on an
 *   undeclared or malformed column; the whole-tree gate only counts them.
 *
 * - Every call-to-action band is declared as one unit (`ctaBandProblems`, WO domain `cta-bands.mjs`): its message slots
 *   (heading, line), its declared buttons and its ground picture. The brief build writes the message for the button's
 *   action. Named contract folders fail on an undeclared band or a band with no message slot role; the whole-tree gate
 *   only counts them.
 *
 * - Every layout band whose blocks are a working part and a decoration part (a logo beside a sign-up box) is declared
 *   (`layoutBandProblems`, WO domain `layout-bands.mjs`): when the working parts come off, the decoration comes off with
 *   them unless it is declared standalone. Named contract folders fail on an undeclared band; the whole-tree gate only
 *   counts them.
 *
 *   node scripts/slot-roles/check.mjs                  every contract in the tree
 *   node scripts/slot-roles/check.mjs <contractDir>... only those (the packing check)
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkContentMapFit, checkContentMapRoles } from 'website-opportunities/domain'
import { buttonActionProblems } from '../../packages/wo/website-opportunities/domain/button-actions.mjs'
import { navigationGroupProblems } from '../../packages/wo/website-opportunities/domain/footer-navigation.mjs'
import { ctaBandProblems } from '../../packages/wo/website-opportunities/domain/cta-bands.mjs'
import { layoutBandProblems } from '../../packages/wo/website-opportunities/domain/layout-bands.mjs'
import { lintContractDir, lintSummary } from '../../apps/tracy-web/src/lib/content-map-lint.js'
import { lintItemIconGrounds } from '../../apps/tracy-web/src/lib/content-map-lint-icons.js'
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

/** The undeclared or malformed button actions of a contract's content map, or its EmDash field map's slots. */
export function buttonActionErrors(dir) {
  const fieldMap = fieldMapResult(dir)
  if (fieldMap) return buttonActionProblems(fieldMap.contentMap)
  const file = path.join(dir, CONTENT_MAP_FILE)
  if (!existsSync(file)) return []
  try {
    return buttonActionProblems(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return []
  }
}

/** A Joomla content map's footer link columns: each menu module in a footer position. */
export function footerColumnsOf(contentMap) {
  return (contentMap?.entities ?? [])
    .filter(
      (e) =>
        e?.kind === 'module' &&
        e.identity?.module === 'mod_menu' &&
        /foot/i.test(String(e.identity?.position ?? ''))
    )
    .map((e) => e.key)
}

/** The undeclared or malformed call-to-action bands of a contract's content map. */
export function ctaBandErrors(dir) {
  const file = path.join(dir, CONTENT_MAP_FILE)
  if (!existsSync(file)) return []
  try {
    return ctaBandProblems(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return []
  }
}

/** The undeclared or malformed layout bands (a decoration beside working parts) of a contract's content map. */
export function layoutBandErrors(dir) {
  const file = path.join(dir, CONTENT_MAP_FILE)
  if (!existsSync(file)) return []
  try {
    return layoutBandProblems(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return []
  }
}

/** The undeclared or malformed footer link columns (navigation groups) of a contract's content map. */
export function navigationGroupErrors(dir) {
  const file = path.join(dir, CONTENT_MAP_FILE)
  if (!existsSync(file)) return []
  try {
    const map = JSON.parse(readFileSync(file, 'utf8'))
    return navigationGroupProblems(map, footerColumnsOf(map))
  } catch {
    return []
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
 *   `buttons`: the contracts holding an undeclared or malformed button action (errors only for named folders)
 */
export function checkAllSlotRoles(rootDir = DEFAULT_ROOT, explicitDirs = null) {
  const named = Array.isArray(explicitDirs) && explicitDirs.length > 0
  const candidates = named ? explicitDirs.map((d) => path.resolve(d)) : discoverSlotRoleContractDirs(rootDir)

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
  const lint = candidates
    .map((dir) => ({ dir: path.relative(rootDir, dir) || dir, ...lintContractDir(dir) }))
    .filter((l) => l.declared)
  // A named (packing) contract refuses an undeclared button; the whole tree only counts the released maps that would.
  const buttons = candidates
    .map((dir) => ({ dir: path.relative(rootDir, dir) || dir, errors: buttonActionErrors(dir) }))
    .filter((b) => b.errors.length > 0)
  if (named) for (const b of buttons) for (const error of b.errors) errors.push(`${b.dir}: ${error}`)
  // The same for footer link columns: a named contract refuses one not declared as a navigation group.
  const navigation = candidates
    .map((dir) => ({ dir: path.relative(rootDir, dir) || dir, errors: navigationGroupErrors(dir) }))
    .filter((n) => n.errors.length > 0)
  if (named) for (const n of navigation) for (const error of n.errors) errors.push(`${n.dir}: ${error}`)
  // The same for call-to-action bands: a named contract refuses one not declared, or declared with no message slot role.
  const bands = candidates
    .map((dir) => ({ dir: path.relative(rootDir, dir) || dir, errors: ctaBandErrors(dir) }))
    .filter((b) => b.errors.length > 0)
  if (named) for (const b of bands) for (const error of b.errors) errors.push(`${b.dir}: ${error}`)
  // The same for layout bands: a named contract refuses a decoration beside working parts that no band declares.
  const layoutBands = candidates
    .map((dir) => ({ dir: path.relative(rootDir, dir) || dir, errors: layoutBandErrors(dir) }))
    .filter((b) => b.errors.length > 0)
  if (named) for (const b of layoutBands) for (const error of b.errors) errors.push(`${b.dir}: ${error}`)
  return {
    ok: errors.length === 0,
    checkedCount: dirs.length,
    dirs,
    errors,
    fit,
    lint,
    buttons,
    navigation,
    bands,
    layoutBands
  }
}

/** The value after a `--name` flag, and the arguments left once every flag and its value are taken out. */
function argsOf(argv) {
  const valued = new Set(['--webroot', '--lint-json'])
  const flags = {}
  const rest = []
  for (let i = 0; i < argv.length; i += 1) {
    if (valued.has(argv[i])) flags[argv[i].slice(2)] = argv[(i += 1)]
    else if (!argv[i].startsWith('--')) rest.push(argv[i])
  }
  return { flags, dirs: rest }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const { flags, dirs: cliDirs } = argsOf(process.argv.slice(2))
  const named = cliDirs.length > 0
  const res = checkAllSlotRoles(DEFAULT_ROOT, named ? cliDirs : null)
  if (named && flags.webroot && res.lint.length === 1) {
    const only = res.lint[0]
    const map = JSON.parse(readFileSync(path.join(path.resolve(cliDirs[0]), CONTENT_MAP_FILE), 'utf8'))
    const read = (file) => {
      const full = path.join(path.resolve(flags.webroot), file)
      return existsSync(full) ? readFileSync(full) : null
    }
    const icons = await lintItemIconGrounds(map, read)
    only.findings.push(...icons)
    only.warnings += icons.length
  }
  if (flags['lint-json']) writeFileSync(flags['lint-json'], `${JSON.stringify(res.lint, null, 2)}\n`)
  const lintErrors = res.lint.reduce((n, l) => n + l.errors, 0)
  const lintWarnings = res.lint.reduce((n, l) => n + l.warnings, 0)
  const lintInfos = res.lint.reduce((n, l) => n + l.findings.filter((f) => f.severity === 'info').length, 0)
  if (named) {
    for (const l of res.lint)
      for (const f of l.findings)
        process.stdout.write(`${f.severity} ${f.rule} ${l.dir} ${f.key}: ${f.note}\n  fix: ${f.fix}\n`)
  }
  if (!res.ok || (named && lintErrors > 0)) {
    for (const err of res.errors) {
      process.stderr.write(`slot-roles check failed: ${err}\n`)
    }
    if (named && lintErrors > 0)
      process.stderr.write(`slot-roles check failed: ${lintErrors} declaration rule error(s), listed above\n`)
    process.exit(1)
  }
  process.stdout.write(`slot-roles check passed (${res.checkedCount} contract(s) verified).\n`)
  const without = res.fit.filter((f) => !f.declared)
  const lacking = without.reduce((n, f) => n + f.missing.image + f.missing.text, 0)
  process.stdout.write(
    `slot fit: ${res.fit.length - without.length} content map(s) declare it; ${without.length} do not (${lacking} text and image slots without a fit).\n`
  )
  if (!named)
    process.stdout.write(
      `button actions: ${res.buttons.length} released map(s) hold ${res.buttons.reduce((n, b) => n + b.errors.length, 0)} undeclared or malformed button(s); the packing check refuses them.\n`
    )
  if (!named)
    process.stdout.write(
      `footer navigation: ${res.navigation.length} released map(s) hold ${res.navigation.reduce((n, b) => n + b.errors.length, 0)} undeclared or malformed footer link column(s); the packing check refuses them.\n`
    )
  if (!named)
    process.stdout.write(
      `call-to-action bands: ${res.bands.length} released map(s) hold ${res.bands.reduce((n, b) => n + b.errors.length, 0)} undeclared or malformed band(s); the packing check refuses them.\n`
    )
  if (!named)
    process.stdout.write(
      `layout bands: ${res.layoutBands.length} released map(s) hold ${res.layoutBands.reduce((n, b) => n + b.errors.length, 0)} undeclared or malformed band(s); the packing check refuses them.\n`
    )
  const rules = lintSummary(res.lint.flatMap((l) => l.findings))
    .map((r) => `${r.rule} ${r.count}`)
    .join(', ')
  process.stdout.write(
    `declaration rules: ${lintErrors} error(s), ${lintWarnings} warning(s), ${lintInfos} info in ${res.lint.length} map(s)${rules ? ` (${rules})` : ''}.\n`
  )
}
