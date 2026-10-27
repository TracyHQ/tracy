/** Tracy's adapter for the open Website Opportunities layer's `host` seam (`website-opportunities/src/host.js`, ADR 0036). */
import { json, requireViewer } from './lib/http.js'
import { effortOptions } from './lib/llm-effort.js'
import { lookupDoor } from './lib/llm-store.js'
import { currentVisionProof, visionFingerprint } from './lib/llm-vision-test.js'
import { clientIp } from './lib/login-mail-rate.js'
import { pictureFeatures } from './lib/picture-cut.js'
import { overLimitOrClosed, rateCountsOf, refundOne } from './lib/rate.js'
import { sameSecret } from './lib/same-secret.js'
import { openSecret, sealSecret } from './lib/secret-box.js'
import { uiSwitchOn } from './lib/ui-setting.js'
import { admit } from './ops/admit.js'
import { displayNameOf, emailOf, principalOf } from './lib/wo-principal.js'
import { frozenPlaceProfileOf } from './lib/wo-frozen-place-profile.js'

const UNAUTHENTICATED = { code: 'UNAUTHENTICATED', next: 'Sign in with a Tracy staff seat.' }

/**
 * The open layer's operator doors are Tracy's `/ops` staff: any staff seat reads, only `owner`/`admin` from this
 * deployment's own origin writes (the same rule as `/ops/wo`). Anybody else gets a bare 403 that says nothing.
 */
function operatorGate({ pool, config }) {
  return async function requireOperator(c, { write = false } = {}) {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in') return json(c, UNAUTHENTICATED, 401)
    if (who === null) return c.body(null, 403)
    if (write && (!['owner', 'admin'].includes(who.role) || c.req.header('origin') !== config.origin))
      return c.body(null, 403)
    return who.email
  }
}

/**
 * @param {{pool?: import('pg').Pool | null, config?: any}} [deps] the pool and config the operator gate reads seats with
 * @returns {import('website-opportunities/src/host.js').WoHost}
 */
export function createTracyWoHost({ pool = null, config = null } = {}) {
  return {
    json,
    requireViewer,
    clientIp,
    overLimitOrClosed,
    refundOne,
    sameSecret,
    uiSwitchOn,
    lookupDoor,
    effortOptions,
    visionFingerprint,
    currentVisionProof,
    pictureFeatures,
    openSecret,
    principalOf,
    displayNameOf,
    emailOf,
    sealSecret,
    rateCountsOf,
    frozenPlaceProfileOf,
    requireOperator: operatorGate({ pool, config })
  }
}
