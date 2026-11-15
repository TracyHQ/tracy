// The one way a release step publishes a kit (ticket #586, review rounds 2 and 3). The release guard reads a check
// record that ships beside the kit, and a record is only as true as the run that wrote it: a record invented field by
// field, or a passing record of another kit relabelled, passes the guard's binding checks. So the step that publishes
// is the one that makes the record: it runs the gate itself (`runGate`, required: it answers the record it wrote), it
// must name the archive it is about to publish (`blankSiteSha`), the record in the kit folder must be the very record
// that run wrote (its sha256), the record must hold the plan the kit's own marker build gives (`release-plan.mjs`),
// and the guard must find nothing (`releaseProblems`). On any refusal `publish` is never called. Pure but for the
// injected parts.
import { bindingOf, RECORD_FILE, releaseProblems } from './release-binding.mjs'
import { planOfFolder, planProblems } from './release-plan.mjs'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * @param {{folder: string, pins: object, blankSiteSha?: string | null, publish: (folder: string) => Promise<void>,
 *   runGate: () => Promise<{record: object}>, plan?: (folder: string) => Promise<object>}} input `runGate` runs the
 *   gate into an empty run folder with `--into-kit` and answers the record it wrote; `plan` rebuilds the kit's plan
 *   (`planOfFolder` by default)
 * @returns {Promise<{published: boolean, problems: Array<{code: string, message: string}>}>}
 */
export async function publishVerified({
  folder,
  pins,
  blankSiteSha = null,
  publish,
  runGate = null,
  plan = planOfFolder
}) {
  const refused = (problems) => ({ published: false, problems })
  const one = (code, message) => refused([{ code, message }])
  if (!/^[0-9a-f]{64}$/.test(String(blankSiteSha ?? '')))
    return one(
      'blank_site_unbound',
      'name the sha256 of the blank site archive about to be published: the record is checked against it'
    )
  if (typeof runGate !== 'function')
    return one(
      'gate_not_run',
      'the publish step runs the gate itself: a record it did not write is not released'
    )
  let ran
  try {
    ran = await runGate()
  } catch (error) {
    return one('gate_failed', String(error?.message ?? error).slice(0, 300))
  }
  if (!ran?.record) return one('gate_failed', 'the gate run answered no record')
  const file = path.join(folder, RECORD_FILE)
  const inFolder = existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
  if (inFolder !== bindingOf(ran.record).recordSha256)
    return one('record_not_this_run', 'the record in the kit folder is not the one this gate run wrote')
  const problems = releaseProblems(folder, { pins, blankSiteSha })
  try {
    problems.push(...planProblems(ran.record, await plan(folder)))
  } catch (error) {
    problems.push({
      code: 'plan_unbuildable',
      message: 'the kit folder gives no marker plan: ' + String(error?.message ?? error).slice(0, 200)
    })
  }
  if (problems.length) return refused(problems)
  await publish(folder)
  return { published: true, problems: [] }
}
