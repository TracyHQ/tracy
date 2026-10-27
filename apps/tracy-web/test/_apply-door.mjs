/**
 * Test-only: a fake site reached through the Apply door's own allowlist, the way a build reaches a real one.
 *
 * A build engine calls its site through `applyAs` (`sites/route.js`), which goes through the door: an action the door's
 * `APPLY_RULES` does not name is refused before any site sees it, and `applyAs` hands the engine `{ok: false, code, message}`.
 * Engine tests used to hand the engine the fake site itself, so a call the door refuses passed every test while no site got
 * it (10/10/2026, `template.languageOverrides`). `throughDoor(site.apply)` answers what the build would get: the door's
 * refusal (`applyDoorRefusal`, the same function `applyDoorOnce` asks first) shaped as `applyAs` shapes it, or the site's answer.
 * The seat, toolset and lease checks need a database and are tested in `review-apply-write-door.test.mjs`.
 */
import { applyDoorRefusal } from '../src/sites/route.js'

/**
 * @param {(call: { siteKey: string, action: string, params?: any }) => Promise<any> | any} apply - the fake site
 * @param {{ refused?: Array<{ action: string, params?: any }> }} [seen] - collects the calls the door refused
 */
export function throughDoor(apply, seen = {}) {
  return async (/** @type {{ siteKey: string, action: string, params?: any }} */ call) => {
    const refused = applyDoorRefusal(call?.action)
    if (refused) {
      seen.refused?.push({ action: call.action, params: call.params })
      return { ...refused.body, ok: false, message: refused.body.code }
    }
    return apply(call)
  }
}
