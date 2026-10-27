/**
 * "Ask Tracy to revert" SENDS its message to the conversation on screen at one press (Brian 02/10
 * ~22:5x: chip + auto-send; it used to be put in the composer for the person to send).
 *
 * HOW. dsh's `conversation.sendSession(session, text, attachmentIds, mode)`
 * (`ui-conversation/src/client/service.ts`) — the session verb the composer itself ends in, and the
 * one `tracy-chat-input` sends a Browser-tab comment with (`comment-send.mjs`). The text goes out
 * verbatim as one text block: the `tracy-revert` block the chat folds into a chip is in it, so the
 * model reads every line the chip hides.
 *
 * 🔒 THE DRAFT IS NEVER TOUCHED. No `setDraft`, no `submit`: words the person is typing in the
 * composer stay where they are.
 *
 * 🔒 QUEUE BY DEFAULT. A session that is running gets the message after its turn (dsh's queue
 * strip shows it at once); interrupting the agent's work is the person's call, not this button's.
 * Only words the person says to a working Tracy in a voice conversation steer (`voice-mode.mjs`):
 * that is the person's own call, made by talking.
 */

export type SendResult = 'sent' | 'no-chat' | 'failed'

/** The slice of a dsh session the send reads. */
export interface SessionFace {
  getSnapshot(): { subagent?: unknown; removed?: boolean }
}

/** The slice of dsh's `conversation` service the send calls. */
export interface ConversationFace {
  sendSession(
    session: SessionFace,
    text: string,
    attachmentIds: readonly string[],
    mode: 'queue' | 'steer'
  ): Promise<{ kind: string }>
}

/**
 * Send `text` as one user message to the conversation on screen.
 * @param main - the session the main view shows (`mainSessionOf`), or undefined.
 * @param session - the session face of an id (`sessions.binding(id).session`), or undefined.
 * @param conversation - dsh's `conversation` service, or undefined on a shell without it.
 * @param mode - `queue` (the default), or `steer` for words said to a working Tracy by voice.
 * @returns `no-chat` when there is no conversation to take it (nothing sent); `failed` when dsh
 *   refused or threw; `sent` once dsh admitted or queued it.
 */
export async function sendToChat(
  main: string | undefined,
  session: (id: string) => SessionFace | undefined,
  conversation: ConversationFace | undefined,
  text: string,
  mode: 'queue' | 'steer' = 'queue'
): Promise<SendResult> {
  if (main === undefined || typeof conversation?.sendSession !== 'function') return 'no-chat'
  const face = session(main)
  if (face === undefined) return 'no-chat'
  // A subagent's view is read-only, and a removed session takes nothing.
  const snapshot = face.getSnapshot()
  if (snapshot.removed === true || (snapshot.subagent !== undefined && snapshot.subagent !== null))
    return 'no-chat'
  try {
    const outcome = await conversation.sendSession(face, text, [], mode)
    return outcome?.kind === 'success' ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}
