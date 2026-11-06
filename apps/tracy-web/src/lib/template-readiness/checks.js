/**
 * The checks of the template readiness verdict that are not Road to live steps (`verdict.js`, EXTENSION POINT). Each
 * is its own module in this folder exporting `{ piece, step, judge(release, world, facts) }`, where `judge` returns
 * `{ state, code, params }` (or null when it does not apply) and `facts` is `{ steps, version }`. Adding one is one
 * import and one line in the list below; it joins its piece after that piece's road steps, or opens a new piece.
 * @typedef {{ piece: string, step: string, judge: (release: any, world: any, facts: { steps: any[], version: string | null }) => { state: string, code: string, params?: Record<string, unknown> } | null }} ReadinessCheck
 */
import { CONTENT_MAP_LISTS_CHECK } from './content-map-lists-check.js'
import { HIDDEN_KIT_FIELDS_CHECK } from './hidden-kit-fields.js'
import { KIT_TOOL_CHECK } from './kit-tool-version-check.js'
import { PIN_BEHIND_CHECK } from './pin-behind-contract-check.js'
import { WRITE_DOORS_CHECK } from './write-doors-check.js'

/** @type {readonly ReadinessCheck[]} */
export const CHECKS = Object.freeze([
  WRITE_DOORS_CHECK,
  HIDDEN_KIT_FIELDS_CHECK,
  KIT_TOOL_CHECK,
  PIN_BEHIND_CHECK,
  CONTENT_MAP_LISTS_CHECK
])
