// What the brand step reads (ticket #616): a research revision, or a brief held in memory plus an optional logo file.
// A build has a revision; the build chat's draft has only the brief. Exactly one of the two is given: the bench's
// command line takes `--brief-revision` or `--brief-file`, and `--logo-file` only with the file.

/** Neither input given (the draft holds no research revision and no brief). */
export const BRAND_INPUT_MISSING = 'brand_input_missing'
/** Both given, or a logo file beside a revision. The run is never started: the caller must choose one. */
export const BRAND_INPUT_AMBIGUOUS = 'brand_input_ambiguous'

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
    return { brief, ...(logoFile ? { logoFile } : {}) }
  }
}
