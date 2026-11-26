// The WordPress site door (index.js): the content contract of the Claude Cowork for WordPress, read and written through the
// Apply door as the seeder writes it (packages/cms/tracy-seeder/src/wordpress-contract-door.mjs): `content.contract
// inspect`, then one `apply` of plain-text changes keyed by content map slot, under the inspected revision, an apply id
// and a request id that makes a retry a replay.
//
// What the plugin takes (Claude Cowork for WordPress README, `content.contract apply`): words, an address in a `url` slot,
// a picture in an image slot as a file of the site's own uploads in the shape of its demo, and an empty text or address
// slot (`''`). So the write step's pictures go to `wp-content/uploads/tracy-content/<sha256>.<ext>` (`wordpressPath`),
// its emptied text and address slots go as `''`, and what the plugin does not take yet (a picture taken off) is refused
// here by slot, before anything is sent: the write step's rounds (contract-write.js) go on without exactly those slots
// and their lines say "not on WordPress yet" (index.js `notOnPlatform`). A refusal of the plugin is named by slot when
// its words name one, as the seeder reads it. Every other stage's call (articles, Joomla menu items, modules, template
// settings) is answered here and never sent (`takes`).
import { createHash } from 'node:crypto'
import { seeder } from '../../lib/seeder.js'

const tools = () => seeder('apply-joomla-contract')

/** The actions the write step sends a WordPress site through the Apply door. */
export const WORDPRESS_TAKES = Object.freeze(
  new Set(['content.contract', 'info', 'media.upload', 'content.read', 'content.locate'])
)

/** A picture the write step placed: `images/tracy-content/<sha256>.<ext>` (write-step/picture-package.js). */
const PICTURE_PATH = /^\/?images\/tracy-content\/([0-9a-f]{64}\.(?:png|jpe?g|webp))$/i

/**
 * Where a picture of the write step sits on a WordPress site: the plugin's own folder for an image slot's pictures,
 * `wp-content/uploads/tracy-content/<sha256>.<ext>` (Claude Cowork for WordPress `media.upload`). Any other value is as
 * it came. The site check compares a picture by its file name, which this keeps.
 * @param {unknown} value
 */
export function wordpressPath(value) {
  const file = PICTURE_PATH.exec(String(value ?? ''))?.[1]
  return file ? `wp-content/uploads/tracy-content/${file}` : value
}

/** The marker of a slot or call this door answers itself: what the plugin does not take yet. */
const NOT_ON = 'not_on_wordpress'

const notOn = (slotKey, what) => ({
  code: 'NOT_ON_WORDPRESS',
  message: `${NOT_ON}: the Claude Cowork for WordPress ${what} yet`,
  field: { slotKey }
})

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/**
 * An inspect of the WordPress plugin in the shape the write step and the site check read on every CMS: the plugin
 * answers `slots` as `{<slot key>: <current value>}` and its pictures apart (`imageSlots`: `{<slot key>: <path>}`), where
 * the Joomla plugin and the EmDash door answer `slots: [{key, current, …}]`. Each slot becomes `{key, current, type}`,
 * `image` for a picture slot (its current value the path the page shows), `text` else; `markupSlots` rides along as
 * `markup`. Dev 26/11/2026: read as a list, the plugin's `slots` was empty, so `arabian-tea-wp2` left out every change as
 * "the site does not have the slot" and wrote nothing. Any other answer is as it came.
 *
 * A text or address slot can be emptied (the plugin writes `''`), which no one measured on the page: `canHide:
 * 'unmeasured'`, as the EmDash door says it, so the write step's closing rule empties a kept block's demo words there; the
 * site check judges the page. A picture slot cannot be emptied (the plugin takes only a picture), so it says nothing.
 * @param {any} answer
 */
export function wordpressReading(answer) {
  if (!answer?.ok || !isObject(answer.slots)) return answer
  const images = isObject(answer.imageSlots) ? answer.imageSlots : {}
  const markup = isObject(answer.markupSlots) ? answer.markupSlots : {}
  return {
    ...answer,
    slots: Object.entries(answer.slots).map(([key, value]) => ({
      key,
      type: key in images ? 'image' : 'text',
      current: String((key in images ? images[key] : value) ?? ''),
      ...(key in images ? {} : { canHide: 'unmeasured' }),
      ...(markup[key] ? { markup: markup[key] } : {})
    }))
  }
}

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
  const state = wordpressReading(
    await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
  )
  if (!state?.ok) throw refusal(doorRefusal(state), [], state)
  if (mapping?.contract !== state.contract)
    throw new Error('The content mapping must name the installed quickstart contract')
  const types = new Map((Array.isArray(state.slots) ? state.slots : []).map((s) => [s?.key, s?.type]))
  const emptied = [...new Set([...(mapping.emptySlots ?? []), ...(mapping.emptyLinks ?? [])])]
  // A text or address slot is emptied by writing `''`; a picture slot cannot be (the plugin takes only a picture).
  const changes = [
    ...Object.entries(mapping.changes ?? {}).map(([key, value]) => [
      key,
      types.get(key) === 'image' ? wordpressPath(value) : value
    ]),
    ...emptied.filter((key) => types.get(key) !== 'image').map((key) => [key, ''])
  ]
  // What the plugin cannot take is refused by slot first: the next round goes without it, and nothing is sent twice.
  const notTaken = emptied
    .filter((key) => types.get(key) === 'image')
    .map((key) => notOn(key, 'takes no picture off'))
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
   * itself, a stage that read `info` and found its door closed on the WordPress plugin, or the closing rule's "does not
   * let … be emptied" (on WordPress only a picture slot, which the plugin cannot take a picture off yet).
   */
  notDone: (reason) =>
    new RegExp(
      `\\b${NOT_ON}\\b|the plugin on this site is older than |the kit or the site does not let \\S+ be emptied`
    ).test(reason),
  /** A WordPress menu item only links to its page: an item off the menu leaves the page published (hide-plan.js). */
  menuOwnsPage: false,
  /**
   * Each answer as every CMS answers it: the plugin's inspect read as a list of slots (`wordpressReading`), and its `info`
   * with the hide orders this door carries (`hide_ops`): a slot is emptied through the contract (`''`), so the write
   * step's hide stage orders it; a row taken out (`rows_remove`) is not on WordPress yet.
   */
  answerOf: (call, answer) => {
    if (call?.action === 'info' && answer?.ok !== false && answer && typeof answer === 'object')
      return { ...answer, info: { ...answer.info, hide_ops: { version: 1, rows_remove: 0 } } }
    return call?.action === 'content.contract' && (call.params?.operation ?? 'inspect') === 'inspect'
      ? wordpressReading(answer)
      : answer
  },
  /** Whether the Apply door is asked this call by the write step on a WordPress site. */
  takes: (call) => WORDPRESS_TAKES.has(call?.action),
  /** A call as the plugin takes it: a picture of the write step uploaded to the plugin's folder (`wordpressPath`). */
  callOf: (call) =>
    call?.action === 'media.upload' && typeof call.params?.path === 'string'
      ? { ...call, params: { ...call.params, path: wordpressPath(call.params.path) } }
      : call,
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
