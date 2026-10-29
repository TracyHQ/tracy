/** A closed build turn may inspect its result and finish, but never become an ordinary owner turn. */
import { emdashRunsInParallel } from './emdash.mjs'
import { canonicalCall } from './site.mjs'
import { READ_ACTIONS } from './site-call.mjs'

export const CLOSED_BUILD_REFUSAL =
  'AGENT_DEMO_ACTION_CLOSED: this build action has ended. Do not change the site or ask a question. End this turn with the result already obtained; a Retry starts a new turn with its own server assignment.'

/**
 * Only explicitly known reads pass. Unknown tools, wrappers and all shell commands stay closed.
 * @param {string} name
 * @param {unknown} args
 */
export function closedBuildRead(name, args) {
  let a = args
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a)
    } catch {
      return false
    }
  }
  const fields =
    a && typeof a === 'object' && !Array.isArray(a) ? /** @type {Record<string, unknown>} */ (a) : {}
  if (name === 'tracy_site') {
    const { action, params } = canonicalCall(a)
    if (READ_ACTIONS.includes(action)) return true
    if (['media.scan', 'page.look', 'page.text', 'content.find'].includes(action)) return true
    if (action === 'content.contract') return params.operation === 'inspect'
    return false
  }
  if (name === 'tracy_emdash') return emdashRunsInParallel(a)
  if (name === 'tracy_demo')
    return ['read', 'structure.read', 'plan.read', 'media.look', 'provision.status'].includes(
      /** @type {string} */ (fields.operation)
    )
  if (name === 'tracy_design_system') return fields.action === 'read'
  if (name === 'tracy_guide') return fields.recheck !== true
  if (['read', 'grep', 'glob'].includes(name)) return true
  if (name === 'str_replace_editor') return fields.command === 'view'
  return false
}
