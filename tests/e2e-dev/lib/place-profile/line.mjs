// Whether the place-profile line (#1742, `docs/wo-place-profile`) is on the deployment under test, and the hashes
// every journey records (plan §7: SHA deploy, release, hash of the sidecar and of the profile).
//
// A journey whose mechanism is not deployed yet ends BLOCKED `[deploy-of-line]`, never FAIL: the verdict would be
// about develop, not about the line. `run.mjs --line` (E2E_PP_LINE=1) says the line is deployed; the host itself
// says so through `GET /v1/demos/options` once it announces `profile/1`.

import { createHash } from 'node:crypto'
import { canonicalJson } from 'website-opportunities/src/canonical-json.js'
import { Blocked } from '../journey.mjs'

export const NEEDS_LINE = 'deploy-of-line'

/** The line is declared deployed for this run. */
export const lineDeclared = () => process.env.E2E_PP_LINE === '1'

/**
 * Stop the journey BLOCKED unless the line is deployed.
 * @param {Record<string, any>} details
 * @param {string} what - the part of the line this journey needs (T2b, T3, T6, T7)
 * @param {{ accepts?: string[] | null }} [host] - `GET /v1/demos/options`, when the journey has read it
 */
export function requireLine(details, what, host = {}) {
  const announced = Array.isArray(host.accepts) ? host.accepts.includes('profile/1') : null
  details.needs = { line: NEEDS_LINE, what, declared: lineDeclared(), hostAnnouncesProfile: announced }
  if (lineDeclared() || announced === true) return
  throw new Blocked(`needs: ${NEEDS_LINE} — ${what} is not on this deployment yet`, NEEDS_LINE)
}

/** sha256 of a document in canonical JSON, the way the host hashes a frozen profile. */
export const profileHash = (doc) => createHash('sha256').update(canonicalJson(doc)).digest('hex')
