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
import { createHash } from 'node:crypto'
import { seeder } from '../../lib/seeder.js'

const tools = () => seeder('apply-joomla-contract')

/** The actions the Apply door answers on an EmDash site (sites/route.js `applyDoorOnce`). */
export const EMDASH_TAKES = Object.freeze(
  new Set([
    'content.contract',
    'info',
    'media.upload',
    'content.read',
    'content.locate',
    'emdash.settings',
    'emdash.entryField'
  ])
)

const slashless = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')

/**
 * The pages a plan drops, taken off an EmDash site: each kit page is the content map page at its path, and its entry becomes
 * a draft in one `content.contract pages.unpublish` call (sites/emdash-contract.js). Its menu items leave with the main
 * menu's hides, which are slots of the contract here. Results by kit page id, as the hide stage's Joomla `dropPages` gives.
 * @param {{ door: { apply: Function }, siteKey: string, pages: { page: object, depends?: string | null }[],
 *   results: Map<string, object>, contentMap: object | null }} input
 * @returns {Promise<boolean>} whether the site changed
 */
export async function dropEmdashPages({ door, siteKey, pages, results, contentMap }) {
  if (!pages.length) return false
  const byRoute = new Map(
    (Array.isArray(contentMap?.pages) ? contentMap.pages : []).map((p) => [slashless(p?.route), p])
  )
  const orders = []
  for (const { page, depends } of pages) {
    const mapped = byRoute.get(slashless(page.path))
    if (depends)
      results.set(page.id, {
        status: 'failed',
        reason: `the plan drops this page, but ${depends} needs its path, so it stays published`
      })
    else if (!mapped?.entity)
      results.set(page.id, {
        status: 'skipped',
        reason: `no page entry of the content map is at ${page.path}`
      })
    else orders.push({ page, entity: mapped.entity })
  }
  if (!orders.length) return false
  const entities = orders.map((o) => o.entity)
  const answer = await door.apply({
    siteKey,
    action: 'content.contract',
    params: {
      operation: 'pages.unpublish',
      apply_id: `hide-pages-${createHash('sha256').update(JSON.stringify(entities)).digest('hex').slice(0, 32)}`,
      pages: entities
    }
  })
  const words = answer?.message ?? answer?.error ?? answer?.code ?? 'no answer'
  for (const { page, entity } of orders)
    results.set(
      page.id,
      answer?.ok
        ? {
            status: 'hidden',
            reason: 'the plan drops this page: its entry is a draft, so no visitor reaches it',
            ordered: 'draft',
            readFrom: {
              action: 'content.contract',
              params: { operation: 'inspect' },
              path: ['pageStates', entity]
            }
          }
        : { status: 'failed', reason: `the page could not be taken off: ${words}` }
    )
  return Boolean(answer?.ok && !answer.unchanged)
}

/** A picture the write step placed: `images/tracy-content/<sha256>.<ext>` (write-step/picture-package.js). */
const PICTURE_PATH = /^\/?images\/tracy-content\/([0-9a-f]{64}\.(?:png|jpe?g|webp))$/i
const PLACED_LIMIT = 5000
/** @type {Map<string, string>} a placed picture's file name → the address the site draws it at, oldest first */
const placed = new Map()

/** Each picture an apply placed, as the door answered it (sites/emdash-contract.js `placed`). */
function rememberPlaced(answer) {
  for (const [name, src] of Object.entries(answer?.placed ?? {})) {
    if (typeof src !== 'string' || !src) continue
    placed.delete(name)
    placed.set(name, src)
    if (placed.size > PLACED_LIMIT) placed.delete(placed.keys().next().value)
  }
}

export const emdashSiteDoor = Object.freeze({
  platform: 'emdash',
  writes: true,
  /** The menus' labels are contract slots here (`menu.<name>.<position>.label`): a hidden item leaves as its slot. */
  menuInContract: true,
  /** The hide stage's pages: entries made drafts (`dropEmdashPages`). */
  dropPages: dropEmdashPages,
  /** The door's refusal in its own words (`doorRefusal`). */
  refusal: async (answer, options) => (await tools()).doorRefusal(answer, options),
  /** One contract write, all or nothing (`applyJoomlaContract`: inspect, then apply). */
  applyContract: async (input) => (await tools()).applyJoomlaContract(input),
  /**
   * Whether a stage's failure words say only that EmDash has no door for it: a call this door answered itself
   * (`not_on_emdash`), or a stage that read `info` and found its door closed. An EmDash site has no plugin to be older than,
   * so "the plugin on this site is older than …" there means the same.
   */
  notDone: (reason) => /\bnot_on_emdash\b|the plugin on this site is older than /.test(reason),
  /** Each answer as the write step reads it, remembering where an apply placed each picture. */
  answerOf: (call, answer) => {
    if (call?.action === 'content.contract' && call.params?.operation === 'apply' && answer?.ok)
      rememberPlaced(answer)
    return answer
  },
  /**
   * A report line as the site holds its value: a picture the library renamed (a media item keeps its own storage key) at
   * the address the pages draw it, so the read-back and the printed rule find what was written. Dev arabian-tea-em5
   * (27/11/2026): ordered as `images/tracy-content/…`, 4 placed pictures read as not held and 4 as not printed.
   */
  lineOf: (line) => {
    const name = PICTURE_PATH.exec(String(line?.ordered ?? ''))?.[1]?.toLowerCase()
    return name && placed.has(name) ? { ...line, ordered: placed.get(name) } : line
  },
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
