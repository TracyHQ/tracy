// The one way a release step publishes a kit (ticket #586, review round 2, R1). The release guard reads a check record
// that ships beside the kit, and a record is only as true as the run that wrote it: a record invented field by field,
// all its counts made to agree, would pass the guard. So the step that publishes the blank site archive is the one
// that verifies the record against it: it may run the gate itself first (`runGate`), it must name the archive it is
// about to publish (`blankSiteSha`, the sha256 the gate measured the kit on), and it publishes only when the guard
// finds nothing (`releaseProblems`). On any refusal `publish` is never called. Pure but for the injected parts.
import { releaseProblems } from './release-binding.mjs'

/**
 * @param {{folder: string, pins: object, blankSiteSha?: string | null, publish: (folder: string) => Promise<void>,
 *   runGate?: (() => Promise<void>) | null}} input
 * @returns {Promise<{published: boolean, problems: Array<{code: string, message: string}>}>}
 */
export async function publishVerified({ folder, pins, blankSiteSha = null, publish, runGate = null }) {
  const refused = (problems) => ({ published: false, problems })
  if (!/^[0-9a-f]{64}$/.test(String(blankSiteSha ?? '')))
    return refused([
      {
        code: 'blank_site_unbound',
        message:
          'name the sha256 of the blank site archive about to be published: the record is checked against it'
      }
    ])
  if (runGate)
    try {
      await runGate()
    } catch (error) {
      return refused([{ code: 'gate_failed', message: String(error?.message ?? error).slice(0, 300) }])
    }
  const problems = releaseProblems(folder, { pins, blankSiteSha })
  if (problems.length) return refused(problems)
  await publish(folder)
  return { published: true, problems: [] }
}
