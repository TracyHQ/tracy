/**
 * The hand off of a finished build chat to the new site's chat (TracyHQ/tracy#611), as data.
 *
 * When the build is done, tracy-web opens a chat on the new site ahead of time (the mechanism the Website
 * Opportunities hand off uses, `apps/tracy-web/src/lib/site-session-ahead.js`) and queues ONE first message in it as
 * the owner: a fenced `tracy-build-handoff` block holding the whole earlier conversation and the approved plan. The
 * site agent reads the block as context, so it knows how the site was built; the site chat draws it as the earlier
 * conversation with the living plan card (`@tracy/dsh-build-chat`), and dsh folds the raw block into a chip.
 *
 * Two folds here, both conversation node definition states (pure, no dsh import):
 * - `buildHistoryFoldOf`: the build session's owner and agent messages as they were said, in order, for the hand off
 *   request the build chat sends once the outcome is done;
 * - `handoffFoldOf`: in a site session, the turn whose first message carries the hand off block, and the block.
 */

/** The fence of the hand off block (`apps/tracy-web/src/build-draft/handoff.js` writes it). */
export const HANDOFF_FENCE = 'tracy-build-handoff'
/** The schema the block names. */
export const HANDOFF_SCHEMA = 'tracy-build-handoff/v1'
/** What queued the hand off message; its request id is `build-handoff:<build id>`. */
export const HANDOFF_SOURCE = 'build-handoff'

const ROLES = new Set(['user', 'assistant'])
/**
 * The block names who said each line (`speaker`, review M6): the owner, or the build agent. The browser draws them
 * as the roles it knows. A line written before speakers were named carries its `role` instead.
 */
const ROLE_OF_SPEAKER = Object.freeze({ owner: 'user', 'build-agent': 'assistant' })

/** One carried line as the site chat draws it, or null when it is not one. */
function lineOf(m) {
  if (typeof m?.text !== 'string' || m.text.trim() === '') return null
  const role = Object.hasOwn(ROLE_OF_SPEAKER, m.speaker)
    ? ROLE_OF_SPEAKER[m.speaker]
    : m.speaker === undefined && ROLES.has(m.role)
      ? m.role
      : null
  return role ? { role, text: m.text } : null
}

const OPEN_FENCE = `\`\`\`${HANDOFF_FENCE}\n`

/**
 * `text` without any hand off block: each block cut whole, from its opening fence to its closing one, or to the end of
 * the text when it is never closed. What reads a message as the person's words (a chat title) reads it through this,
 * so nothing the block carries (the conversation, what the owner keeps off the site) is taken for them.
 * @param {unknown} text
 * @returns {string}
 */
export function withoutHandoff(text) {
  if (typeof text !== 'string') return ''
  let out = ''
  let from = 0
  for (;;) {
    const start = text.indexOf(OPEN_FENCE, from)
    if (start < 0) return out + text.slice(from)
    out += text.slice(from, start)
    const end = text.indexOf('\n```', start + OPEN_FENCE.length)
    if (end < 0) return out
    from = end + '\n```'.length
  }
}

/** The text blocks of one message's content, joined; empty when it has none. */
const textOfContent = (content) =>
  (Array.isArray(content) ? content : [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()

/**
 * The hand off block of one user message text, or null. The block is the message's first `tracy-build-handoff`
 * fence, one JSON line naming the schema, with a conversation of `{speaker, text}` and the plan; each line is read
 * back as `{role, text}`. `requestId` is the id the server queued the message under, or null when the block names
 * none (`handoffFoldOf` then draws nothing from it).
 * @param {unknown} text
 * @returns {null | { conversation: { role: 'user' | 'assistant', text: string }[], plan: any, site: any,
 *   requestId: string | null }}
 */
export function handoffOfText(text) {
  if (typeof text !== 'string') return null
  const start = text.indexOf(OPEN_FENCE)
  if (start < 0) return null
  const end = text.indexOf('\n```', start + OPEN_FENCE.length)
  if (end < 0) return null
  let value
  try {
    value = JSON.parse(text.slice(start + OPEN_FENCE.length, end))
  } catch {
    return null
  }
  if (value?.schema !== HANDOFF_SCHEMA || !Array.isArray(value.conversation)) return null
  const conversation = value.conversation.map(lineOf).filter((m) => m !== null)
  const requestId =
    value.source === HANDOFF_SOURCE &&
    typeof value.requestId === 'string' &&
    value.requestId.startsWith(`${HANDOFF_SOURCE}:`)
      ? value.requestId
      : null
  return { conversation, plan: value.plan ?? null, site: value.site ?? null, requestId }
}

/**
 * Fold one build session event into the conversation said so far: the owner's own prompts and the agent's answers,
 * text only. Context the agent injected itself (a file notice, a skill) is not the owner's and stays out.
 * @param {{ role: string, text: string }[] | undefined} state
 * @param {any} event
 */
export function buildHistoryFoldOf(state = [], event) {
  if (event?.type === 'user/message' && event.surfaceOp === 'append') {
    const kind = event.data?.source?.kind
    if (kind !== undefined && kind !== 'user') return state
    const text = textOfContent(event.data?.content)
    return text === '' ? state : [...state, { role: 'user', text }]
  }
  if (event?.type === 'assistant/message' && event.surfaceOp === 'append') {
    const text = textOfContent(event.data?.message?.content)
    return text === '' ? state : [...state, { role: 'assistant', text }]
  }
  return state
}

/**
 * Fold one site session event into the hand off it carries: `{turn, handoff}` once the message with the block and its
 * turn are both known. dsh opens a turn (`turn/start`) before the message that enters it, so the open turn names it;
 * a message seen before any turn waits for the next one.
 *
 * 🔒 ONLY THE QUEUED HAND OFF IS DRAWN (review m12). dsh records the prompt's request id on the message
 * (`source.rpcId`); the server queues the hand off under `build-handoff:<build id>` and writes the same id in the
 * block. A block whose id is missing, or is not the message's own, is someone's pasted text: it is not drawn as the
 * earlier conversation (dsh still folds the raw block into its chip).
 * @param {{ openTurn: number | null, pending: any, found: { turn: number, handoff: any } | null } | undefined} state
 * @param {any} event
 */
export function handoffFoldOf(state = { openTurn: null, pending: null, found: null }, event) {
  if (state.found) return state
  if (event?.type === 'turn/start') {
    const turn = Number(event.data?.turn)
    if (!Number.isSafeInteger(turn) || turn < 0) return state
    if (state.pending)
      return { ...state, openTurn: turn, pending: null, found: { turn, handoff: state.pending } }
    return { ...state, openTurn: turn }
  }
  if (event?.type !== 'user/message') return state
  const handoff = handoffOfText(textOfContent(event.data?.content))
  if (handoff === null || handoff.requestId === null) return state
  if (event.data?.source?.rpcId !== handoff.requestId) return state
  if (state.openTurn !== null) return { ...state, found: { turn: state.openTurn, handoff } }
  return { ...state, pending: handoff }
}
