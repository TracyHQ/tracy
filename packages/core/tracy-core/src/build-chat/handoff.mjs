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

const ROLES = new Set(['user', 'assistant'])

/** The text blocks of one message's content, joined; empty when it has none. */
const textOfContent = (content) =>
  (Array.isArray(content) ? content : [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()

/**
 * The hand off block of one user message text, or null. The block is the message's first `tracy-build-handoff`
 * fence, one JSON line naming the schema, with a conversation of `{role, text}` and the plan.
 * @param {unknown} text
 * @returns {null | { conversation: { role: 'user' | 'assistant', text: string }[], plan: any, site: any }}
 */
export function handoffOfText(text) {
  if (typeof text !== 'string') return null
  const open = `\`\`\`${HANDOFF_FENCE}\n`
  const start = text.indexOf(open)
  if (start < 0) return null
  const end = text.indexOf('\n```', start + open.length)
  if (end < 0) return null
  let value
  try {
    value = JSON.parse(text.slice(start + open.length, end))
  } catch {
    return null
  }
  if (value?.schema !== HANDOFF_SCHEMA || !Array.isArray(value.conversation)) return null
  const conversation = value.conversation.filter(
    (m) => ROLES.has(m?.role) && typeof m.text === 'string' && m.text.trim() !== ''
  )
  return { conversation, plan: value.plan ?? null, site: value.site ?? null }
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
  if (handoff === null) return state
  if (state.openTurn !== null) return { ...state, found: { turn: state.openTurn, handoff } }
  return { ...state, pending: handoff }
}
