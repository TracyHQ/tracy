// The WordPress site door (index.js): the content contract of the Claude Cowork for WordPress, read and written through the
// Apply door as the seeder writes it (packages/cms/tracy-seeder/src/wordpress-contract-door.mjs): `content.contract
// inspect`, then one `apply` of plain-text changes keyed by content map slot, under the inspected revision, an apply id
// and a request id that makes a retry a replay.
//
// What the WordPress plugin does not take yet is refused here by slot, before anything is sent, so the write step's
// rounds (contract-write.js) go on without exactly those slots and their lines say "not on WordPress yet" (index.js
// `notOnPlatform`): an emptied slot, a link taken off, a picture or address slot (the door writes one text node). A
// refusal of the plugin is named by slot when its words name one, as the seeder reads it. Every other stage's call
// (articles, Joomla menu items, modules, template settings) is answered here and never sent (`takes`).
import { createHash } from 'node:crypto'
import { seeder } from '../../lib/seeder.js'

const tools = () => seeder('apply-joomla-contract')

/** The actions the write step sends a WordPress site through the Apply door. */
export const WORDPRESS_TAKES = Object.freeze(
  new Set(['content.contract', 'info', 'media.upload', 'content.read', 'content.locate'])
)

/** The marker of a slot or call this door answers itself: what the plugin does not take yet. */
const NOT_ON = 'not_on_wordpress'

/** The slot types the WordPress door writes: one text node of a block, or an option. */
const TEXT_TYPES = new Set(['text', 'richtext', 'textarea'])

const notOn = (slotKey, what) => ({
  code: 'NOT_ON_WORDPRESS',
  message: `${NOT_ON}: the Claude Cowork for WordPress ${what} yet`,
  field: { slotKey }
})

/** A refusal as the write step's rounds read one: the sentence, the answer, and the slots it names. */
function refusal(message, errors, answer = null) {
  const error = /** @type {Error & { errors?: object[], answer?: any }} */ (new Error(message))
  error.errors = errors
  error.answer = answer
  return error
}

/**
 * One contract write, all or nothing, in the protocol of the WordPress plugin.
 * @param {{ apply: Function, siteKey: string, mapping: { contract: string, revision: string,
 *   changes: Record<string, string>, emptySlots?: string[], emptyLinks?: string[] }, dry?: boolean }} input
 */
export async function applyWordPressContract({ apply, siteKey, mapping, dry = false }) {
  const { doorRefusal } = await tools()
  const state = await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
  if (!state?.ok) throw refusal(doorRefusal(state), [], state)
  if (mapping?.contract !== state.contract)
    throw new Error('The content mapping must name the installed quickstart contract')
  const types = new Map((Array.isArray(state.slots) ? state.slots : []).map((s) => [s?.key, s?.type]))
  const changes = Object.entries(mapping.changes ?? {})
  // What the plugin cannot take is refused by slot first: the next round goes without it, and nothing is sent twice.
  const notTaken = [
    ...(mapping.emptySlots ?? []).map((key) => notOn(key, 'empties no slot')),
    ...(mapping.emptyLinks ?? []).map((key) => notOn(key, 'takes no link off')),
    ...changes
      .filter(([key]) => types.has(key) && !TEXT_TYPES.has(String(types.get(key))))
      .map(([key]) => notOn(key, `writes no ${types.get(key)} slot through the contract`))
  ]
  if (notTaken.length)
    throw refusal(`${notTaken.length} slots are not on WordPress yet; nothing was written`, notTaken)
  if (!changes.length) return { ok: true, unchanged: true, contract: state.contract }
  const requestId = createHash('sha256')
    .update(JSON.stringify({ siteKey, contract: state.contract, revision: mapping.revision, changes }))
    .digest('hex')
  const params = {
    operation: 'apply',
    expected_revision: mapping.revision,
    apply_id: `contract-${requestId.slice(0, 48)}`,
    request_id: requestId,
    changes: Object.fromEntries(changes)
  }
  if (dry) return { contract: state.contract, params, pages: state.pages }
  const answer = await apply({ siteKey, action: 'content.contract', params })
  if (answer?.ok !== false) return { ...answer, applyId: params.apply_id, contract: state.contract }
  const words = doorRefusal(answer, { writing: true })
  // The plugin names its slots in `errors[]`, or only in its words: a slot named there is refused alone.
  const named =
    Array.isArray(answer.errors) && answer.errors.some((e) => typeof e?.field?.slotKey === 'string')
      ? answer.errors
      : changes
          .map(([key]) => key)
          .filter((key) => words.includes(key))
          .map((slotKey) => ({
            code: String(answer.error ?? answer.code ?? 'REFUSED'),
            message: words,
            field: { slotKey }
          }))
  throw refusal(words, named, answer)
}

export const wordpressSiteDoor = Object.freeze({
  platform: 'wordpress',
  writes: true,
  /** The plugin's refusal in its own words (`doorRefusal`). */
  refusal: async (answer, options) => (await tools()).doorRefusal(answer, options),
  applyContract: applyWordPressContract,
  /**
   * Whether a stage's failure words say only that WordPress has no door for it here: a call or slot this door answered
   * itself, or a stage that read `info` and found its door closed on the WordPress plugin.
   */
  notDone: (reason) => new RegExp(`\\b${NOT_ON}\\b|the plugin on this site is older than `).test(reason),
  /** Whether the Apply door is asked this call by the write step on a WordPress site. */
  takes: (call) => WORDPRESS_TAKES.has(call?.action),
  /** The answer to a call it does not take: nothing is sent. */
  notTaken: (call) => {
    const kind = typeof call?.params?.kind === 'string' ? ` ${call.params.kind}` : ''
    const operation = typeof call?.params?.operation === 'string' ? ` ${call.params.operation}` : ''
    return {
      ok: false,
      error: NOT_ON,
      message: `WordPress has no door for ${call?.action ?? '(no action)'}${kind}${operation} in the write step yet: it is not done on a WordPress site`
    }
  }
})
