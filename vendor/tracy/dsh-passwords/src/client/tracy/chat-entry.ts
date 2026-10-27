// K6 on the client: whether the floating chat bubble shows, from the gate's state answer.
//
// The server rule (src/tracy/chat-entry.ts) is off unless this account switched it on. Upstream's
// client shows the bubble whenever the state answer fails or omits the flag, so one 5xx would hand
// a seat a chat with the gate's owner nobody offered it. Here an unknown answer is off: only an OK
// answer carrying `chatEnabled: true` shows it.

/** 'on' only for an OK state answer that says this account switched the bubble on. */
export function tracyChatEntry(ok: boolean, chatEnabled: unknown): 'on' | 'off' {
  return ok && chatEnabled === true ? 'on' : 'off';
}
