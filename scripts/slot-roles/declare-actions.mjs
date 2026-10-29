#!/usr/bin/env node
// Reviewable migration of evident button jobs. Unknown jobs stay undeclared and keep the validator red.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buttonActionProblems,
  isButtonSlot
} from '../../packages/wo/website-opportunities/domain/button-actions.mjs'
import { proposeButtonActions } from './button-actions.mjs'
import {
  ctaBandProblems,
  proposeCtaBands
} from '../../packages/wo/website-opportunities/domain/cta-bands.mjs'
import { languageButtonUses, sourceButtonUses, templateButtonUses } from './button-markup.mjs'
import { discoverSlotRoleContractDirs } from './check.mjs'
import { withActionMetadata } from './content-map-action-text.mjs'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {})
const templateUses = new Map()

/** The map's text with its call-to-action bands added as a last top-level key; every other byte stays as released. */
function withCtaBands(text, bands) {
  if (!bands.length) return text
  const end = text.lastIndexOf('}')
  const body = JSON.stringify(bands, null, 2).replaceAll('\n', '\n  ')
  return `${text.slice(0, end).trimEnd()},\n  "ctaBands": ${body}\n}\n`
}

/** Source files must match the contract's pin before their markup can supply declarations. */
function pinnedTemplateUses(dir, webroot, map) {
  const manifest = json(path.join(dir, 'manifest.json'))
  if (!webroot || !manifest.template || !existsSync(path.join(webroot, 'templates', manifest.template)))
    return new Map()
  const lock = json(path.join(dir, 'presentation-lock.json'))
  const pinned = new Map()
  const cacheKey = `${webroot}|${manifest.template}`
  if (!templateUses.has(cacheKey)) templateUses.set(cacheKey, templateButtonUses(webroot, manifest.template))
  for (const [constant, uses] of templateUses.get(cacheKey)) {
    const valid = uses.filter((use) => {
      const file = use.selector.split(':')[0]
      const full = path.join(webroot, file)
      return lock.files?.[file] && existsSync(full) && sha(readFileSync(full)) === lock.files[file]
    })
    if (valid.length) pinned.set(constant, valid)
  }
  return languageButtonUses(map, pinned)
}

export function declareContractActions(dir, { write = false, webroot, outputDir } = {}) {
  const file = path.join(dir, 'content-map.json')
  if (!existsSync(file)) return null
  const before = readFileSync(file, 'utf8')
  const map = JSON.parse(before)
  const initial = new Map(
    (map.slots ?? []).map((slot) => [slot.key, JSON.stringify({ action: slot.action, button: slot.button })])
  )
  const lock = json(path.join(dir, 'presentation-lock.json'))
  // The pinned source markup is read through `initial`; a map's own `initial` (WordPress options) is put back after.
  const own = new Map((map.entities ?? []).map((entity) => [entity, entity.initial]))
  for (const entity of map.entities ?? []) entity.initial = lock.entities?.[entity.key] ?? entity.initial
  const uses = sourceButtonUses(map)
  for (const [key, found] of pinnedTemplateUses(dir, webroot, map)) uses.set(key, found)
  proposeButtonActions(map, { usesBySlot: uses })
  for (const [entity, initial] of own)
    if (initial === undefined) delete entity.initial
    else entity.initial = initial
  const changed = map.slots
    .filter((slot) => JSON.stringify({ action: slot.action, button: slot.button }) !== initial.get(slot.key))
    .map((slot) => slot.key)
  // The call-to-action bands, declared once the buttons carry their jobs (a band is a block with a conversion button).
  const bands = map.ctaBands === undefined ? proposeCtaBands(map) : []
  if (bands.length) map.ctaBands = bands
  const after = withCtaBands(withActionMetadata(before, map), bands)
  if (bands.length) changed.push(...bands.map((band) => band.id))
  if (write && changed.length) writeFileSync(file, after)
  if (outputDir && changed.length) {
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(path.join(outputDir, 'content-map.json'), after)
  }
  const errors = [...buttonActionProblems(map), ...ctaBandProblems(map)]
  return {
    contract: dir,
    buttons: map.slots.filter(isButtonSlot).length,
    assigned: map.slots.filter((slot) => changed.includes(slot.key) && slot.action).length,
    changed,
    bands: bands.map((band) => band.id),
    unresolved: map.slots
      .filter((slot) => isButtonSlot(slot) && !slot.action)
      .map((slot) => ({ key: slot.key, role: slot.role ?? null, sample: slot.sample ?? null })),
    errors,
    beforeSha256: sha(before),
    afterSha256: changed.length ? sha(after) : sha(before),
    measurementsNeedRecapture:
      changed.length > 0 &&
      ['content-coverage.json', 'design-system-measurement.json'].some((name) =>
        existsSync(path.join(dir, name))
      )
  }
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (main) {
  const args = process.argv.slice(2)
  const value = (name) => {
    const at = args.indexOf(name)
    return at >= 0 ? args[at + 1] : undefined
  }
  const dirs = args.filter(
    (arg, index) => !arg.startsWith('--') && !['--report', '--webroot'].includes(args[index - 1])
  )
  const rows = (dirs.length ? dirs : discoverSlotRoleContractDirs())
    .map((dir) =>
      declareContractActions(dir, { write: args.includes('--write'), webroot: value('--webroot') })
    )
    .filter(Boolean)
  const report = {
    maps: rows.length,
    changedMaps: rows.filter((row) => row.assigned).length,
    assigned: rows.reduce((n, row) => n + row.assigned, 0),
    refusedMaps: rows.filter((row) => row.errors.length).length,
    unresolved: rows.reduce((n, row) => n + row.unresolved.length, 0),
    contracts: rows
  }
  if (value('--report')) writeFileSync(value('--report'), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ ...report, contracts: undefined })}\n`)
}
