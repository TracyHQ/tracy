/**
 * The checks of the template readiness verdict that are not Road to live steps (`verdict.js`, EXTENSION POINT). Each
 * is its own module in this folder exporting `{ piece, step, judge(release, world, facts) }`, where `judge` returns
 * `{ state, code, params }` (or null when it does not apply) and `facts` is `{ steps, version }`. Adding one is one
 * import and one line in the list below; it joins its piece after that piece's road steps, or opens a new piece.
 * @typedef {{ piece: string, step: string, judge: (release: any, world: any, facts: { steps: any[], version: string | null }) => { state: string, code: string, params?: Record<string, unknown> } | null }} ReadinessCheck
 */

/** @type {readonly ReadinessCheck[]} */
export const CHECKS = Object.freeze([])
