/**
 * The demo measurements check of the template readiness verdict (ticket #436, piece `template-kit`, step
 * `demo-measures`): the site check's layout measures, run on the untouched demo at 1440 and 390
 * (`site-check/demo-measures.js`), recorded beside the contract (`demo-measures-file.js`) and read here.
 *
 *   todo demo-measure-missing     { contract, command }: not measured; `command` writes the file
 *   todo demo-measure-invalid     { contract, reason, command }
 *   todo demo-measure-stale       { contract, measured, version, command }: measured on another quickstart version
 *   todo demo-measure-incomplete  { contract, groups, reasons, command }: a group could not tell, which is never green
 *   todo demo-main-heading        more than one main heading on a demo page          ┐ a template layout fault, one code
 *   todo demo-empty-block         an empty picture frame or an empty box on the demo  │ per fault family (the first in the
 *   todo demo-overflow            text cut by its box or past the right edge          ┘ order above decides; `families`
 *                                 { contract, families, faults, fix }                    names every one found)
 *   done demo-measures-clean      { contract, pages, warnings }: no block failure (a warning, such as a page with no
 *                                 main heading, needs a person's eye and is counted, as on a built site)
 *
 * The faults are the template's: nothing was written to the demo, so the fix is a template (quickstart) release. Which
 * fault is a block and which a warning is the site check's own level; this file adds no rule. A release already shown
 * on Design inspiration only warns, as the other checks. Joomla only, like the content coverage audit, and only when a
 * contract seals the release (the contract piece says when none does).
 */
import { shownOnInspiration } from '../quickstart-releases.js'
import { demoMeasuresOfRelease } from './demo-measures-file.js'

export const DEMO_MEASURES_STEP = 'demo-measures'

export const DEMO_MEASURES_COMMAND =
  'node apps/tracy-web/scripts/demo-measures.mjs --contract <contract folder> (--base <demo address> | --site <site key>)'

/** The fault family of each measured group, in the order they decide. */
export const FAULT_FAMILIES = Object.freeze({
  'main-heading': 'demo-main-heading',
  'empty-frames': 'demo-empty-block',
  'text-overflow': 'demo-overflow'
})

/** How many faults the piece names itself; the file lists them all. */
const SHOWN_FAULTS = 8

const FIX =
  'The untouched demo shows a layout fault, so every site built from it starts with it. Fix it in the template (or the demo content the quickstart ships), cut a new template release and quickstart release, then measure that version again with the demo measurements command.'

/** @param {any} release @param {any} world */
export function judgeDemoMeasures(release, world) {
  const platform = release?.setting?.platform ?? release?.platform
  if (platform !== 'joomla') return null
  const read = world?.demoMeasures ?? demoMeasuresOfRelease(release, world?.contracts ?? new Map())
  if (read.state === 'no-contract') return null
  const failing = shownOnInspiration(release) ? 'warn' : 'todo'
  const contract = read.contract
  const command = DEMO_MEASURES_COMMAND
  if (read.state === 'none')
    return { state: failing, code: 'demo-measure-missing', params: { contract, command } }
  if (read.state === 'invalid')
    return {
      state: failing,
      code: 'demo-measure-invalid',
      params: { contract, reason: read.reason, command }
    }
  const doc = read.doc
  const version = release?.setting?.version ?? null
  if (version !== null && doc.quickstart.version !== version)
    return {
      state: failing,
      code: 'demo-measure-stale',
      params: { contract, measured: doc.quickstart.version, version, command }
    }
  const groups = doc.groups.filter((g) => g.name in FAULT_FAMILIES)
  const missing = Object.keys(FAULT_FAMILIES).filter((name) => !groups.some((g) => g.name === name))
  const blind = groups.filter(
    (g) => g.status !== 'green' && g.status !== 'red' && g.status !== 'not-applicable'
  )
  if (missing.length || blind.length)
    return {
      state: failing,
      code: 'demo-measure-incomplete',
      params: {
        contract,
        groups: [...missing, ...blind.map((g) => g.name)],
        reasons: blind.map((g) => `${g.name}: ${g.reason ?? g.status}`),
        command
      }
    }
  const faults = groups.flatMap((g) =>
    g.failures
      .filter((f) => f.level === 'block')
      .map((f) => ({
        family: FAULT_FAMILIES[g.name],
        page: f.page,
        width: f.width,
        measured: f.measured,
        reason: f.reason
      }))
  )
  if (faults.length) {
    const families = Object.values(FAULT_FAMILIES).filter((code) => faults.some((f) => f.family === code))
    return {
      state: failing,
      code: families[0],
      params: { contract, families, count: faults.length, faults: faults.slice(0, SHOWN_FAULTS), fix: FIX }
    }
  }
  const warnings = groups.reduce((n, g) => n + g.failures.filter((f) => f.level === 'warn').length, 0)
  return {
    state: 'done',
    code: 'demo-measures-clean',
    params: { contract, pages: Array.isArray(doc.pages) ? doc.pages.length : 0, warnings }
  }
}

/** The check, as the verdict's `CHECKS` lists one. */
export const DEMO_MEASURES_CHECK = Object.freeze({
  piece: 'template-kit',
  step: DEMO_MEASURES_STEP,
  judge: judgeDemoMeasures
})
