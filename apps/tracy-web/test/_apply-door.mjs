/**
 * Test-only: a fake site reached through the Apply door's own allowlist, the way a build reaches a real one.
 *
 * A build engine calls its site through `applyAs` (`sites/route.js`), which goes through the door: an action the door's
 * `APPLY_RULES` does not name is refused before any site sees it, and `applyAs` hands the engine `{ok: false, code, message}`.
 * Engine tests used to hand the engine the fake site itself, so a call the door refuses passed every test while no site got
 * it (10/10/2026, `template.languageOverrides`). `throughDoor(site.apply)` answers what the build would get: the door's
 * refusal (`applyDoorRefusal`, the same function `applyDoorOnce` asks first) shaped as `applyAs` shapes it, or the site's answer.
 * Joomla contract reads and writes also run the plugin's pinned PHP by default; an afterEach check catches refusals even
 * when the engine handles the answer. The seat, toolset and lease checks need a database and are tested elsewhere.
 */
import { applyDoorRefusal } from '../src/sites/route.js'
import assert from 'node:assert/strict'
import { afterEach } from 'node:test'
import { contractDouble } from './_joomla-contract-double.mjs'

const contractFailures = []
afterEach((context) => {
  const failures = contractFailures.splice(0)
  assert.deepEqual(
    failures,
    [],
    `${context.name}: the real Joomla plugin refused a contract write:\n${failures.join('\n')}`
  )
})

/**
 * @param {(call: { siteKey: string, action: string, params?: any }) => Promise<any> | any} apply - the fake site
 * @param {{ refused?: Array<{ action: string, params?: any }>, contractRefusals?: any[], contractRows?: Record<string, any>, contractFiles?: Record<string, string> }} [seen] - fixture records/media; deliberate refusal tests may collect plugin errors
 */
export function throughDoor(apply, seen = {}) {
  const contract = contractDouble(seen, (message) => contractFailures.push(message))
  return async (/** @type {{ siteKey: string, action: string, params?: any }} */ call) => {
    const refused = applyDoorRefusal(call?.action)
    if (refused) {
      seen.refused?.push({ action: call.action, params: call.params })
      return { ...refused.body, ok: false, message: refused.body.code }
    }
    return contract(apply, call)
  }
}
