/**
 * The seam `runEmdashTool` is tested through, shared by the suites that need a whole site behind the
 * door (`emdash-row-delete`, `emdash-media-ref`): the site is faked at the one seam the host hands in
 * (`mcp`: a JSON-RPC request in, the exec chain's answer out) and every call it receives is recorded.
 * It is the same fake `emdash-call.test.mjs` has kept since P4, copied here so a suite of its own does
 * not have to edit that file.
 */
import { readFileSync } from 'node:fs'

import { runEmdashTool, createEmdashState } from '../src/host/emdash-call.mjs'

export { createEmdashState }

const BUSINESS = JSON.parse(
  readFileSync(new URL('./fixtures/emdash/business-en.json', import.meta.url), 'utf8')
)
/** The recorded answers of a Tracy Business site (`fixtures/emdash/business-en.json`). */
export const A = BUSINESS.answers
export const SITE = { label: 'ed-ivj9ni' }
export const ARTIFACT = { cms: { name: 'emdash' }, locales: { default: 'en' } }

/** EmDash's answer as the exec chain hands it back: the text part is EmDash's pretty JSON. */
export const answer = (/** @type {unknown} */ data) => ({
  ok: true,
  result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
})
export const failed = (/** @type {string} */ error) => ({ ok: false, code: 'TOOL_FAILED', error })

/** The published `site` rows of a site serving these locales. */
const siteRows = (/** @type {string[]} */ locales) => ({
  items: locales.map((locale, i) => ({
    ...A.siteGet.item,
    id: `01M36TA5254KTX8AKZQMK4BZ${String(i).padStart(2, '0')}`,
    locale
  }))
})

/**
 * A fake site. `on[tool](args, n)` answers a tools/call (return undefined to fall through); the
 * served-locale read answers `served`; everything is recorded in `calls`.
 * @param {{ served?: string[], on?: Record<string, (args: any, n: number) => any> }} [opts]
 */
export function fakeSite({ served = ['en'], on = {} } = {}) {
  /** @type {Array<{ name: string, arguments: Record<string, any> } | { list: true }>} */
  const calls = []
  const mcp = async (/** @type {any} */ request) => {
    if (request.method === 'tools/list') {
      calls.push({ list: true })
      return { ok: true, result: BUSINESS.toolsList }
    }
    const { name, arguments: args } = request.params
    calls.push({ name, arguments: args })
    const n = calls.filter((c) => 'name' in c && c.name === name).length
    const own = on[name]?.(args, n)
    if (own !== undefined) return own
    if (name === 'content_list' && args.collection === 'site' && args.status === 'published')
      return answer(siteRows(served))
    if (name === 'content_get') return answer(A.homeGet)
    if (name === 'content_list') return answer({ items: [A.homeGet.item] })
    if (name === 'content_update')
      return answer(args.status === 'published' ? A.homePublish : A.homeStagedUpdate)
    if (name === 'content_publish') return answer(A.homePublish)
    if (name === 'menu_get') return answer(A.menuPrimary)
    return answer({ ok: true })
  }
  const names = () => calls.map((c) => ('list' in c ? '{list}' : c.name))
  return { mcp, calls, names }
}

/**
 * One `tracy_emdash` call through the door, in the session every suite here uses.
 * @param {ReturnType<typeof fakeSite>} site
 * @param {unknown} args
 * @param {Record<string, any>} [extra] - any `runEmdashTool` input to override (state, memory, turn…).
 * @returns {Promise<any>}
 */
export const runDoor = (site, args, extra = {}) =>
  runEmdashTool({
    args,
    site: SITE,
    artifact: ARTIFACT,
    mcp: site.mcp,
    state: extra.state ?? createEmdashState(),
    sessionId: 'session-a',
    turn: 1,
    sleep: async () => {},
    ...extra
  })
