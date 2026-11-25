// The EmDash site door (index.js). Its content contract is the release's content map, which the Apply door reads and writes
// over the site's own MCP tools (sites/emdash-contract.js) in the protocol the Claude Cowork for Joomla speaks: inspect, then
// one apply, all or nothing, refusals by slot. So the contract call and its words are the seeder's caller of that protocol
// (`apply-joomla-contract`, as the Joomla door's), never a second copy.
//
// The other stages of the write step still send the Claude Cowork for Joomla's own actions (an article, a menu item, a
// module, template settings), which an EmDash site has no door for. The Apply door on EmDash takes only `EMDASH_TAKES`;
// every other call is answered here, before it is sent, with a refusal that names it, so the stage's line says what was not
// done on EmDash instead of the site's "not connected" (the three CMS plan, decision 3: a stage that is not on a CMS says
// so, never silently).
import { seeder } from '../../lib/seeder.js'

const tools = () => seeder('apply-joomla-contract')

/** The actions the Apply door answers on an EmDash site (sites/route.js `applyDoorOnce`). */
export const EMDASH_TAKES = Object.freeze(
  new Set(['content.contract', 'info', 'media.upload', 'content.read', 'content.locate'])
)

export const emdashSiteDoor = Object.freeze({
  platform: 'emdash',
  writes: true,
  /** The door's refusal in its own words (`doorRefusal`). */
  refusal: async (answer, options) => (await tools()).doorRefusal(answer, options),
  /** One contract write, all or nothing (`applyJoomlaContract`: inspect, then apply). */
  applyContract: async (input) => (await tools()).applyJoomlaContract(input),
  /** Whether the Apply door takes this call on an EmDash site. */
  takes: (call) => EMDASH_TAKES.has(call?.action),
  /** The answer to a call it does not take: nothing is sent. */
  notTaken: (call) => {
    const kind = typeof call?.params?.kind === 'string' ? ` ${call.params.kind}` : ''
    const operation = typeof call?.params?.operation === 'string' ? ` ${call.params.operation}` : ''
    return {
      ok: false,
      error: 'not_on_emdash',
      message: `EmDash has no door for ${call?.action ?? '(no action)'}${kind}${operation} yet: the write step does not do this on an EmDash site`
    }
  }
})
