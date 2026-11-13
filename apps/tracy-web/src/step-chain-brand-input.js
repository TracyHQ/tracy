// What the brand step reads (ticket #616): a research revision, or a brief held in memory plus an optional logo file.
// A build has a revision; the build chat's draft has only the brief. Exactly one of the two is given: the bench's
// command line takes `--brief-revision` or `--brief-file`, and `--logo-file` only with the file, as an absolute path
// (a relative one would be read against whatever folder the bench runs in). A brief is stored once per run, and a
// rerun of that run must bring the same brief (`storeBriefOnce`).
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Neither input given (the draft holds no research revision and no brief). */
export const BRAND_INPUT_MISSING = 'brand_input_missing'
/** Both given, or a logo file beside a revision. The run is never started: the caller must choose one. */
export const BRAND_INPUT_AMBIGUOUS = 'brand_input_ambiguous'
/** A logo file given by a relative path: the run is never started, an absolute path is required. */
export const BRAND_LOGO_PATH_RELATIVE = 'brand_logo_path_relative'
/** A rerun of a run whose stored brief differs from the brief now given: the old file is never read in its place. */
export const BRAND_BRIEF_CHANGED = 'brand_brief_changed'

/**
 * @param {(message: string) => Error} makeError builds the step's error (it carries `usd`)
 * @returns {(ctx: {brief?: {researchRevisionId?: string, researchBrief?: object, logoFile?: string}}) =>
 *   {revisionId: string} | {brief: object, logoFile?: string}}
 * @throws errors with `code` and `noRerun: true`
 */
export function brandInputResolver(makeError) {
  const fail = (code, message) => Object.assign(makeError(message), { code, noRerun: true })
  return (ctx) => {
    const revisionId = String(ctx.brief?.researchRevisionId ?? '')
    const brief = ctx.brief?.researchBrief
    const logoFile = ctx.brief?.logoFile ? String(ctx.brief.logoFile) : ''
    const hasBrief = brief !== undefined && brief !== null
    if (hasBrief && (typeof brief !== 'object' || Array.isArray(brief)))
      throw fail(BRAND_INPUT_MISSING, 'the brand step brief is not an object')
    if (revisionId && (hasBrief || logoFile))
      throw fail(
        BRAND_INPUT_AMBIGUOUS,
        'the brand step takes a research revision or a brief with an optional logo file, not both'
      )
    if (revisionId) return { revisionId }
    if (!hasBrief)
      throw fail(BRAND_INPUT_MISSING, 'the brand step has neither a research revision nor a brief')
    if (logoFile && !path.isAbsolute(logoFile))
      throw fail(BRAND_LOGO_PATH_RELATIVE, 'the brand step takes the logo file by an absolute path')
    return { brief, ...(logoFile ? { logoFile } : {}) }
  }
}

/**
 * Store the brief of a run once ('wx'). A rerun finds the stored file: the same content is the normal rerun; another
 * content is `brand_brief_changed` (`noRerun`), never the old file read silently in place of the brief now given.
 * @param {string} file the run's brief file
 * @param {object} brief
 * @param {(message: string) => Error} makeError builds the step's error
 */
export async function storeBriefOnce(file, brief, makeError) {
  const text = `${JSON.stringify(brief, null, 2)}\n`
  try {
    await writeFile(file, text, { flag: 'wx' })
  } catch (e) {
    if (e?.code !== 'EEXIST') throw e
    if ((await readFile(file, 'utf8')) !== text)
      throw Object.assign(
        makeError('the run already stored another brief: start a new run for a changed brief'),
        {
          code: BRAND_BRIEF_CHANGED,
          noRerun: true
        }
      )
  }
}
