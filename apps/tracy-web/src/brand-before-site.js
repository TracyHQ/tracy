// The brand step before the site exists (ticket #616): the step chain's OWN brand step, run outside a build. It is the
// locked brand bench (`brand-step/`, prompt v10) exactly as a build runs it (`run --kit <ref> --brief-revision <id>`):
// it reads the stored research brief of a research revision and the template kit, never a site, so nothing here
// replaces or re-decides it. This adapter only gives the step chain's `kit` and `brand` steps (`createStepChainSteps`)
// a context of their own, reads the brand file the run wrote, and hands it to `runBrandBeforeSite` (rerun once, then
// stop; one record line per attempt), keeping the record with the step's files like a build does (`dispose`).
//
// The bench spends three model doors, all the bench's own and unchanged: the brand agent (`brandAgent`: tool calls and
// vision, several turns per run), the brand reviewer (`brandReviewer`: vision, one call per look it judges) and the
// picture door for drawn icons (`seedImage`, one call per drawing attempt, only when an icon is drawn).
import { readFile } from 'node:fs/promises'
import { runBrandBeforeSite } from 'website-opportunities/domain/brand-before-site-run.mjs'

let sequence = 0

/**
 * @param {{steps: {kit: Function, brand: Function, dispose: Function}, briefOf: (revisionId: string) =>
 *   Promise<object | null>, now?: () => number, readJson?: (file: string) => Promise<object>}} deps `steps`: the step
 *   chain's steps (`createStepChainSteps`); `briefOf`: the stored research brief of a revision (for example
 *   `briefOfRevision` of `brand-step/brand-control.js`)
 * @returns {(input: {revisionId: string, kitRef: string, siteLanguage?: string, signal?: AbortSignal}) =>
 *   Promise<{record: object, records: object[], usd: number, prompt: object, runId: string}>}
 */
export function createBrandBeforeSite({ steps, briefOf, now = Date.now, readJson }) {
  const read = readJson ?? (async (file) => JSON.parse(await readFile(file, 'utf8')))
  return async function brandBeforeSite({ revisionId, kitRef, siteLanguage, signal }) {
    if (!revisionId || !kitRef) throw new TypeError('the brand step needs a research revision and a kit')
    const brief = await briefOf(revisionId)
    if (!brief)
      throw Object.assign(new Error(`no research brief for revision ${revisionId}`), {
        code: 'brief_missing'
      })
    sequence += 1
    // A run id of its own, so the step's files and record never mix with a build's.
    const runId = `brand-before-site-${now()}-${sequence}`
    const halt = signal ?? new AbortController().signal
    const ctx = {
      runId,
      contract: { id: kitRef },
      brief: { researchRevisionId: revisionId },
      normalized: siteLanguage ? { languages: [siteLanguage] } : {},
      signal: halt
    }
    const inputs = { revisionId, kit: kitRef, ...(siteLanguage ? { siteLanguage } : {}) }
    let records = []
    try {
      const kit = (await steps.kit(ctx)).value
      const out = await runBrandBeforeSite({
        brief,
        kit,
        inputs,
        now,
        run: async ({ attempt }) => {
          const ran = await steps.brand(ctx, { kit }, { signal: halt, attempt })
          return { brandFile: await read(ran.value.file), usd: ran.usd, file: ran.value.file }
        }
      })
      records = out.records
      return { ...out, runId }
    } catch (error) {
      records = error?.details?.records ?? records
      throw error
    } finally {
      await steps.dispose({ runId, chain: records })
    }
  }
}
