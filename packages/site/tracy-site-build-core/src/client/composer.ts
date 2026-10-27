/**
 * The one way this plugin speaks to the agent: through the chat composer of the session the customer
 * has open. Since spec §4h the dialog calls the model from the host for its content versions; what
 * still goes through the chat is "Use this inspiration" — the agent's step 3 starts from that message,
 * where the customer sees it.
 *
 * dsh hands `inputActions` (setDraft, submit) only to occupants of the `conversation.input.dock` slot,
 * so `index.tsx` registers an invisible occupant whose sole job is to park those actions here. The
 * dialog then asks with `askAgent(text)`: the draft is set and submitted as if the customer had typed it.
 */

export interface InputActions {
  setDraft?: (text: string) => void
  submit?: () => void
}

let actions: InputActions | null = null

/** Called by the dock occupant on every render: the newest actions of the active session win. */
export function parkComposer(next: InputActions | null | undefined): void {
  actions = next ?? null
}

/** Whether a chat session is open to receive a message. */
export function agentReachable(): boolean {
  return typeof actions?.setDraft === 'function' && typeof actions?.submit === 'function'
}

/**
 * Put `text` in the composer and send it. Returns false when no session is open — the caller says so
 * instead of pretending the agent heard. The submit runs a tick later: dsh's composer reads the draft
 * from its store, and the store settles after `setDraft` returns.
 */
export function askAgent(text: string): boolean {
  if (!agentReachable() || !actions) return false
  const { setDraft, submit } = actions
  setDraft?.(text)
  window.setTimeout(() => submit?.(), 60)
  return true
}
